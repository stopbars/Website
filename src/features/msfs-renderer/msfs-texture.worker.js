import { decodeDdsOrBc7Texture, decodeKtx2Texture } from './msfs-texture.js';

self.addEventListener('message', async (event) => {
  const { id, descriptor } = event.data || {};
  try {
    let image = descriptor.image;
    if (!image && descriptor.file) {
      const buffer = await descriptor.file.arrayBuffer();
      image = /\.ktx2$/i.test(descriptor.file.name)
        ? await decodeKtx2Texture(buffer, { maximumEdge: 1024 })
        : /\.dds$/i.test(descriptor.file.name)
          ? await decodeDdsOrBc7Texture(buffer, { maximumEdge: 1024 })
          : await decodeBitmap(descriptor.file);
    }
    if (descriptor.lineLayout) image = transposeLineAtlasWindow(image, descriptor.lineLayout);
    if (descriptor.tint) image = tintTexture(image, descriptor.tint);
    image = premultiplyTexture(image);
    self.postMessage({ id, image }, image?.data?.buffer ? [image.data.buffer] : []);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});

function premultiplyTexture(image) {
  if (!image?.data || image.premultiplied) return image;
  const data = image.data;
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] / 255;
    data[offset] = Math.round(data[offset] * alpha);
    data[offset + 1] = Math.round(data[offset + 1] * alpha);
    data[offset + 2] = Math.round(data[offset + 2] * alpha);
  }
  return { ...image, premultiplied: true };
}

async function decodeBitmap(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

function tintTexture(image, tint) {
  if (!image?.data || !Array.isArray(tint)) return image;
  const data = new Uint8ClampedArray(image.data);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = Math.round(data[offset] * Number(tint[0] ?? 1));
    data[offset + 1] = Math.round(data[offset + 1] * Number(tint[1] ?? 1));
    data[offset + 2] = Math.round(data[offset + 2] * Number(tint[2] ?? 1));
  }
  return { ...image, data };
}

function transposeLineAtlasWindow(image, layout) {
  const start = Math.max(
    0,
    Math.floor(Math.min(Number(layout.uMin), Number(layout.uMax)) * image.width)
  );
  const end = Math.min(
    image.width,
    Math.max(start + 1, Math.ceil(Math.max(Number(layout.uMin), Number(layout.uMax)) * image.width))
  );
  const selectedWidth = Math.max(1, end - start);
  const data = new Uint8ClampedArray(image.height * selectedWidth * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = start; x < end; x += 1) {
      const targetX = y;
      const targetY = layout.reverseAcross ? selectedWidth - 1 - (x - start) : x - start;
      data.set(
        image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
        (targetY * image.height + targetX) * 4
      );
    }
  }
  return { width: image.height, height: selectedWidth, data };
}
