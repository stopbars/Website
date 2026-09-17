import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const MODULE_ID = 'virtual:optimized-images';
const RESOLVED_ID = `\0${MODULE_ID}`;
const WIDTHS = [480, 768, 1024, 1440, 1920];

async function* imageFiles(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      yield* imageFiles(path.join(directory, entry.name), relativePath);
    } else if (entry.isFile() && /\.(png|jpe?g|webp|avif)$/i.test(entry.name)) {
      yield relativePath;
    }
  }
}

export function optimizedImages() {
  let config;
  let images = {};

  return {
    name: 'optimized-images',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async buildStart() {
      images = {};
      if (config.command !== 'build' || !config.publicDir) return;

      let originalBytes = 0;
      let optimizedBytes = 0;

      for await (const relativePath of imageFiles(config.publicDir)) {
        const inputPath = path.join(config.publicDir, relativePath);
        this.addWatchFile(inputPath);
        const input = await readFile(inputPath);
        const metadata = await sharp(input).metadata();
        // Leave animated images intact instead of silently keeping only their first frame.
        if (metadata.pages > 1) continue;

        const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
        const width = rotated ? metadata.height : metadata.width;
        const height = rotated ? metadata.width : metadata.height;
        const maxWidth = Math.min(width, WIDTHS.at(-1));
        const widths = [...new Set([...WIDTHS.filter((size) => size < maxWidth), maxWidth])];
        const candidates = [];

        for (const size of widths) {
          const { data, info } = await sharp(input)
            .autoOrient()
            .resize({ width: size, withoutEnlargement: true })
            .webp({ quality: 85, effort: 4, smartSubsample: true })
            .toBuffer({ resolveWithObject: true });

          candidates.push({ data, info });
        }

        if (candidates.at(-1).data.length >= input.length) continue;

        const variants = [];
        for (const { data, info } of candidates) {
          if (data.length >= input.length) continue;
          const hash = createHash('sha256').update(data).digest('hex').slice(0, 12);
          const name = path.parse(relativePath).name.replace(/[^a-zA-Z0-9_-]/g, '-');
          const referenceId = this.emitFile({
            type: 'asset',
            fileName: `${config.build.assetsDir}/images/${name}-${info.width}-${hash}.webp`,
            source: data,
          });
          variants.push({ referenceId, width: info.width, bytes: data.length });
        }

        if (!variants.length) continue;
        images[`/${relativePath}`] = { width, height, variants };
        originalBytes += input.length;
        optimizedBytes += variants.at(-1).bytes;
      }

      config.logger.info(
        `[images] ${Object.keys(images).length} images: ${(originalBytes / 1e6).toFixed(2)} MB → ` +
          `${(optimizedBytes / 1e6).toFixed(2)} MB using largest WebP variants; originals retained.`
      );
    },
    resolveId(id) {
      if (id === MODULE_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      const entries = Object.entries(images).map(([src, { width, height, variants }]) => {
        const sources = variants.map(
          (variant) =>
            `{src: import.meta.ROLLUP_FILE_URL_${variant.referenceId}, width: ${variant.width}}`
        );
        return `${JSON.stringify(src)}: {width: ${width}, height: ${height}, sources: [${sources.join(',')}]}`;
      });
      return `export default {${entries.join(',')}};`;
    },
  };
}
