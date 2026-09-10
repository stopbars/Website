const DEFAULT_MAX_BYTES = 96 * 1024 * 1024;

export function createDecodedTextureCache(maxBytes = DEFAULT_MAX_BYTES) {
  const records = new Map();
  let totalBytes = 0;

  return {
    get(key) {
      const record = records.get(key);
      if (!record) return null;
      records.delete(key);
      records.set(key, record);
      return record.image;
    },
    set(key, image) {
      if (!key || !image?.data) return;
      const size = Number(image.data.byteLength) || 0;
      if (size <= 0 || size > maxBytes) return;
      const previous = records.get(key);
      if (previous) {
        totalBytes -= previous.size;
        records.delete(key);
      }
      records.set(key, { image, size });
      totalBytes += size;
      while (totalBytes > maxBytes && records.size > 0) {
        const oldestKey = records.keys().next().value;
        const oldest = records.get(oldestKey);
        records.delete(oldestKey);
        totalBytes -= oldest.size;
      }
    },
    clear() {
      records.clear();
      totalBytes = 0;
    },
    stats() {
      return { entries: records.size, bytes: totalBytes };
    },
  };
}

export function decodedTextureKey(path, properties = {}, lineTexture = false) {
  return JSON.stringify([
    String(path ?? '').toLowerCase(),
    Boolean(lineTexture),
    properties.textureScaleX ?? null,
    properties.textureScaleY ?? null,
    properties.textureWidthMeters ?? null,
    properties.textureHeightMeters ?? null,
    properties.texturePixelWidth ?? null,
    properties.texturePixelHeight ?? null,
    properties.textureNoAlpha ?? false,
    properties.lineTextureLayers ?? null,
    properties.alignSegments ?? null,
    properties.startCaps ?? null,
    properties.endCaps ?? null,
    properties.mirrorTexture ?? false,
  ]);
}

export function msfsDecodedTextureKey(sourceFingerprint, descriptor = {}) {
  const file = descriptor.file;
  return JSON.stringify([
    'msfs',
    String(sourceFingerprint ?? ''),
    String(descriptor.path ?? file?.name ?? '').toLowerCase(),
    String(descriptor.pattern ?? ''),
    Number(file?.size) || 0,
    Number(file?.lastModified) || 0,
    descriptor.lineLayout ?? null,
    descriptor.tint ?? null,
  ]);
}

export const decodedTextureCache = createDecodedTextureCache();
