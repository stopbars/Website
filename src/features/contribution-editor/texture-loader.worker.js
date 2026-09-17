import { decodeDdsTexture } from './dds-texture.js';
import {
  composeXPlaneLineTexture,
  createXPlaneLineTexturePattern,
  forceOpaqueTexture,
} from './scenery-texture.js';

const decodedAtlasCache = new Map();

self.addEventListener('message', async (event) => {
  const message = event.data;
  try {
    const result = await loadTexture(message);
    self.postMessage({ id: message.id, ...result }, transferablesFor(result));
  } catch (error) {
    self.postMessage({
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function loadTexture({
  file,
  path,
  properties,
  maximumEdge,
  lineTextureSource,
}) {
  if (!file) throw new Error('Texture file is unavailable');
  const lineTexture = lineTextureSource || properties?.lineTextureLayers?.length > 0;
  const sourceName = file.name || path;
  let image;
  if (/\.dds$/i.test(sourceName)) {
    const decoded = await decodedDds(file, path, maximumEdge);
    const source = properties?.textureNoAlpha ? forceOpaqueTexture(decoded) : decoded;
    image = lineTexture
      ? createXPlaneLineTexturePattern(composeXPlaneLineTexture(source, properties), properties)
      : clonePixelImage(source);
  } else if (!lineTexture) {
    const decoded = await decodedBitmap(file, path, maximumEdge);
    image = clonePixelImage(
      properties?.textureNoAlpha ? forceOpaqueTexture(decoded) : decoded
    );
  } else {
    const decoded = await decodedBitmap(file, path, maximumEdge);
    const source = properties?.textureNoAlpha ? forceOpaqueTexture(decoded) : decoded;
    image = createXPlaneLineTexturePattern(
      composeXPlaneLineTexture(source, properties),
      properties
    );
  }

  return { image };
}

async function decodedDds(file, path, maximumEdge) {
  const key = `${path}:${maximumEdge}`;
  return cachedDecode(key, async () =>
    decodeDdsTexture(await file.arrayBuffer(), { maximumEdge })
  );
}

async function decodedBitmap(file, path, maximumEdge) {
  const key = `${path}:${maximumEdge}`;
  return cachedDecode(key, async () => {
    const bitmap = await createImageBitmap(file);
    const dimensions = boundedDimensions(bitmap, maximumEdge);
    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    bitmap.close();
    return context.getImageData(0, 0, dimensions.width, dimensions.height);
  });
}

async function cachedDecode(key, decode) {
  let pending = decodedAtlasCache.get(key);
  if (!pending) {
    pending = Promise.resolve()
      .then(decode)
      .catch((error) => {
        decodedAtlasCache.delete(key);
        throw error;
      });
    decodedAtlasCache.set(key, pending);
  }
  return pending;
}

function boundedDimensions(image, maximumEdge) {
  if (image.width <= maximumEdge && image.height <= maximumEdge) {
    return { width: image.width, height: image.height };
  }
  const scale = Math.min(maximumEdge / image.width, maximumEdge / image.height);
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  };
}

function clonePixelImage(image) {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function transferablesFor(result) {
  const images = [
    ...(result.image ? [result.image] : []),
  ];
  return images.flatMap((image) => {
    if (image instanceof ImageBitmap) return [image];
    return image?.data?.buffer ? [image.data.buffer] : [];
  });
}
