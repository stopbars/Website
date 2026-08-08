const DDS_MAGIC = 0x20534444;
const DDS_HEADER_BYTES = 128;
const FOURCC_DXT1 = fourCc('DXT1');
const FOURCC_DXT3 = fourCc('DXT3');
const FOURCC_DXT5 = fourCc('DXT5');

export function decodeDdsTexture(arrayBuffer, { maximumEdge = 512 } = {}) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < DDS_HEADER_BYTES || view.getUint32(0, true) !== DDS_MAGIC) {
    throw new Error('Not a DDS texture');
  }
  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const mipCount = Math.max(1, view.getUint32(28, true));
  const fourCC = view.getUint32(84, true);
  const blockBytes = fourCC === FOURCC_DXT1 ? 8 : 16;
  if (![FOURCC_DXT1, FOURCC_DXT3, FOURCC_DXT5].includes(fourCC)) {
    throw new Error('Unsupported DDS compression');
  }
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
    throw new Error('Invalid DDS dimensions');
  }

  let mipWidth = width;
  let mipHeight = height;
  let offset = DDS_HEADER_BYTES;
  for (let level = 0; level < mipCount; level += 1) {
    const byteLength =
      Math.max(1, Math.ceil(mipWidth / 4)) *
      Math.max(1, Math.ceil(mipHeight / 4)) *
      blockBytes;
    if (
      Math.max(mipWidth, mipHeight) <= maximumEdge ||
      level === mipCount - 1
    ) {
      if (offset + byteLength > view.byteLength) throw new Error('Truncated DDS texture');
      return {
        width: mipWidth,
        height: mipHeight,
        data: decodeBlocks(
          new Uint8Array(arrayBuffer, offset, byteLength),
          mipWidth,
          mipHeight,
          fourCC
        ),
      };
    }
    offset += byteLength;
    mipWidth = Math.max(1, mipWidth >> 1);
    mipHeight = Math.max(1, mipHeight >> 1);
  }
  throw new Error('DDS texture has no decodable mip level');
}

function decodeBlocks(bytes, width, height, fourCC) {
  const output = new Uint8ClampedArray(width * height * 4);
  const blockBytes = fourCC === FOURCC_DXT1 ? 8 : 16;
  let offset = 0;
  for (let blockY = 0; blockY < Math.ceil(height / 4); blockY += 1) {
    for (let blockX = 0; blockX < Math.ceil(width / 4); blockX += 1) {
      const alpha =
        fourCC === FOURCC_DXT3
          ? decodeDxt3Alpha(bytes, offset)
          : fourCC === FOURCC_DXT5
            ? decodeDxt5Alpha(bytes, offset)
            : null;
      const colorOffset = offset + (fourCC === FOURCC_DXT1 ? 0 : 8);
      decodeColorBlock(bytes, colorOffset, output, width, height, blockX, blockY, {
        alpha,
        transparentMode: fourCC === FOURCC_DXT1,
      });
      offset += blockBytes;
    }
  }
  return output;
}

function decodeColorBlock(
  bytes,
  offset,
  output,
  width,
  height,
  blockX,
  blockY,
  { alpha, transparentMode }
) {
  const first = bytes[offset] | (bytes[offset + 1] << 8);
  const second = bytes[offset + 2] | (bytes[offset + 3] << 8);
  const colors = [rgb565(first), rgb565(second)];
  if (first > second || !transparentMode) {
    colors.push(interpolateColor(colors[0], colors[1], 2, 1, 3));
    colors.push(interpolateColor(colors[0], colors[1], 1, 2, 3));
  } else {
    colors.push(interpolateColor(colors[0], colors[1], 1, 1, 2));
    colors.push([0, 0, 0]);
  }
  const indices =
    bytes[offset + 4] |
    (bytes[offset + 5] << 8) |
    (bytes[offset + 6] << 16) |
    (bytes[offset + 7] << 24);
  for (let pixel = 0; pixel < 16; pixel += 1) {
    const x = blockX * 4 + (pixel % 4);
    const y = blockY * 4 + Math.floor(pixel / 4);
    if (x >= width || y >= height) continue;
    const colorIndex = (indices >>> (pixel * 2)) & 0x03;
    const target = (y * width + x) * 4;
    output[target] = colors[colorIndex][0];
    output[target + 1] = colors[colorIndex][1];
    output[target + 2] = colors[colorIndex][2];
    output[target + 3] =
      alpha?.[pixel] ?? (transparentMode && first <= second && colorIndex === 3 ? 0 : 255);
  }
}

function decodeDxt3Alpha(bytes, offset) {
  return Array.from({ length: 16 }, (_, pixel) => {
    const value = bytes[offset + Math.floor(pixel / 2)];
    const nibble = pixel % 2 === 0 ? value & 0x0f : value >> 4;
    return nibble * 17;
  });
}

function decodeDxt5Alpha(bytes, offset) {
  const first = bytes[offset];
  const second = bytes[offset + 1];
  const palette = [first, second];
  if (first > second) {
    for (let index = 1; index <= 6; index += 1) {
      palette.push(Math.round(((7 - index) * first + index * second) / 7));
    }
  } else {
    for (let index = 1; index <= 4; index += 1) {
      palette.push(Math.round(((5 - index) * first + index * second) / 5));
    }
    palette.push(0, 255);
  }
  let indices = 0n;
  for (let byte = 0; byte < 6; byte += 1) {
    indices |= BigInt(bytes[offset + 2 + byte]) << BigInt(byte * 8);
  }
  return Array.from({ length: 16 }, (_, pixel) => {
    const index = Number((indices >> BigInt(pixel * 3)) & 0x07n);
    return palette[index];
  });
}

function rgb565(value) {
  return [
    Math.round((((value >> 11) & 0x1f) * 255) / 31),
    Math.round((((value >> 5) & 0x3f) * 255) / 63),
    Math.round(((value & 0x1f) * 255) / 31),
  ];
}

function interpolateColor(first, second, firstWeight, secondWeight, divisor) {
  return first.map((value, index) =>
    Math.round((value * firstWeight + second[index] * secondWeight) / divisor)
  );
}

function fourCc(value) {
  return (
    value.charCodeAt(0) |
    (value.charCodeAt(1) << 8) |
    (value.charCodeAt(2) << 16) |
    (value.charCodeAt(3) << 24)
  ) >>> 0;
}
