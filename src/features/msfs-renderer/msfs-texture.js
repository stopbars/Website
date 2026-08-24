/* oxlint-disable react-doctor/js-length-check-first -- Texture signatures are tiny fixed-shape arrays; the existing validation order produces clearer diagnostics. */

import { decodeDdsTexture } from '../contribution-editor/dds-texture.js';
import createTextureDecoder from './vendor/texture2ddecoder/wasm/texture2ddecoder.js';

const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
const LEVEL_INDEX_OFFSET = 80;
const LEVEL_INDEX_BYTES = 24;
const VK_FORMAT_BC7_UNORM_BLOCK = 145;
const VK_FORMAT_BC7_SRGB_BLOCK = 146;
const BC7_FORMATS = new Set([VK_FORMAT_BC7_UNORM_BLOCK, VK_FORMAT_BC7_SRGB_BLOCK]);
const DDS_MAGIC = 0x20534444;
const DDS_FOURCC_DX10 = fourCc('DX10');
const DDS_DXGI_BC7_FORMATS = new Set([98, 99]);
const DDS_DX10_HEADER_BYTES = 148;
let textureDecoderInitialization;
const VK_TO_FOUR_CC = new Map([
  [131, 'DXT1'],
  [132, 'DXT1'],
  [133, 'DXT1'],
  [134, 'DXT1'],
  [135, 'DXT3'],
  [136, 'DXT3'],
  [137, 'DXT5'],
  [138, 'DXT5'],
]);

export async function decodeKtx2Texture(arrayBuffer, { maximumEdge = 512 } = {}) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (
    bytes.length < LEVEL_INDEX_OFFSET ||
    !KTX2_IDENTIFIER.every((value, index) => bytes[index] === value)
  )
    throw new Error('Not a KTX2 texture');

  const vkFormat = view.getUint32(12, true);
  const width = view.getUint32(20, true);
  const height = view.getUint32(24, true);
  const depth = view.getUint32(28, true);
  const layerCount = view.getUint32(32, true);
  const faceCount = view.getUint32(36, true);
  const levelCount = Math.max(1, view.getUint32(40, true));
  const supercompression = view.getUint32(44, true);
  const fourCC = VK_TO_FOUR_CC.get(vkFormat);
  if (!fourCC && !BC7_FORMATS.has(vkFormat)) {
    throw new Error(`Unsupported KTX2 Vulkan format ${vkFormat}`);
  }
  if (supercompression !== 0)
    throw new Error(`Unsupported KTX2 supercompression ${supercompression}`);
  if (depth > 1 || layerCount > 1 || faceCount !== 1) {
    throw new Error('Only 2D, single-layer KTX2 textures are supported');
  }
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
    throw new Error('Invalid KTX2 dimensions');
  }
  if (LEVEL_INDEX_OFFSET + levelCount * LEVEL_INDEX_BYTES > view.byteLength) {
    throw new Error('Truncated KTX2 level index');
  }

  let selected = null;
  for (let level = 0; level < levelCount; level += 1) {
    const entryOffset = LEVEL_INDEX_OFFSET + level * LEVEL_INDEX_BYTES;
    const byteOffset = safeUint64(view, entryOffset);
    const byteLength = safeUint64(view, entryOffset + 8);
    const mipWidth = Math.max(1, width >> level);
    const mipHeight = Math.max(1, height >> level);
    if (Math.max(mipWidth, mipHeight) <= maximumEdge || level === levelCount - 1) {
      selected = { byteOffset, byteLength, width: mipWidth, height: mipHeight };
      break;
    }
  }
  if (!selected || selected.byteOffset + selected.byteLength > view.byteLength) {
    throw new Error('Truncated KTX2 mip data');
  }

  if (BC7_FORMATS.has(vkFormat)) {
    return decodeBc7Texture(bytes, selected);
  }

  const dds = new ArrayBuffer(128 + selected.byteLength);
  const ddsView = new DataView(dds);
  ddsView.setUint32(0, 0x20534444, true);
  ddsView.setUint32(12, selected.height, true);
  ddsView.setUint32(16, selected.width, true);
  ddsView.setUint32(28, 1, true);
  ddsView.setUint32(84, fourCc(fourCC), true);
  new Uint8Array(dds, 128).set(
    bytes.subarray(selected.byteOffset, selected.byteOffset + selected.byteLength)
  );
  return decodeDdsTexture(dds, { maximumEdge });
}

export async function decodeDdsOrBc7Texture(arrayBuffer, { maximumEdge = 512 } = {}) {
  const view = new DataView(arrayBuffer);
  if (
    view.byteLength < 128 ||
    view.getUint32(0, true) !== DDS_MAGIC ||
    view.getUint32(84, true) !== DDS_FOURCC_DX10
  )
    return decodeDdsTexture(arrayBuffer, { maximumEdge });
  if (view.byteLength < DDS_DX10_HEADER_BYTES) throw new Error('Truncated DDS DX10 header');
  const dxgiFormat = view.getUint32(128, true);
  if (!DDS_DXGI_BC7_FORMATS.has(dxgiFormat)) {
    throw new Error(`Unsupported DDS DXGI format ${dxgiFormat}`);
  }
  const width = view.getUint32(16, true);
  const height = view.getUint32(12, true);
  const mipCount = Math.max(1, view.getUint32(28, true));
  if (width < 1 || height < 1 || width > 16_384 || height > 16_384) {
    throw new Error('Invalid DDS dimensions');
  }
  let byteOffset = DDS_DX10_HEADER_BYTES;
  for (let level = 0; level < mipCount; level += 1) {
    const mipWidth = Math.max(1, width >> level);
    const mipHeight = Math.max(1, height >> level);
    const byteLength =
      Math.max(1, Math.ceil(mipWidth / 4)) * Math.max(1, Math.ceil(mipHeight / 4)) * 16;
    if (byteOffset + byteLength > view.byteLength) throw new Error('Truncated DDS BC7 mip data');
    if (Math.max(mipWidth, mipHeight) <= maximumEdge || level === mipCount - 1) {
      return decodeBc7Texture(new Uint8Array(arrayBuffer), {
        byteOffset,
        byteLength,
        width: mipWidth,
        height: mipHeight,
      });
    }
    byteOffset += byteLength;
  }
  throw new Error('DDS texture has no decodable mip level');
}

async function decodeBc7Texture(bytes, selected) {
  const blockByteLength =
    Math.max(1, Math.ceil(selected.width / 4)) * Math.max(1, Math.ceil(selected.height / 4)) * 16;
  if (selected.byteLength < blockByteLength) throw new Error('Truncated KTX2 BC7 mip data');

  if (!textureDecoderInitialization) {
    const wasmUrl = new URL(
      './vendor/texture2ddecoder/wasm/texture2ddecoder.wasm',
      import.meta.url
    ).href;
    textureDecoderInitialization = createTextureDecoder({
      locateFile: () => wasmUrl,
    });
  }
  const decoder = await textureDecoderInitialization;

  const decoded = await decoder.decode_bc7(
    bytes.slice(selected.byteOffset, selected.byteOffset + blockByteLength),
    selected.width,
    selected.height
  );
  if (!decoded || decoded.length !== selected.width * selected.height * 4) {
    throw new Error('BC7 decoder returned an invalid pixel buffer');
  }

  // Texture2DDecoder returns BGRA; WebGL's uncompressed upload path expects RGBA.
  const rgba = new Uint8ClampedArray(decoded.length);
  for (let offset = 0; offset < decoded.length; offset += 4) {
    rgba[offset] = decoded[offset + 2];
    rgba[offset + 1] = decoded[offset + 1];
    rgba[offset + 2] = decoded[offset];
    rgba[offset + 3] = decoded[offset + 3];
  }
  return { width: selected.width, height: selected.height, data: rgba };
}

function safeUint64(view, offset) {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('KTX2 offset exceeds browser limits');
  return Number(value);
}

function fourCc(value) {
  return (
    (value.charCodeAt(0) |
      (value.charCodeAt(1) << 8) |
      (value.charCodeAt(2) << 16) |
      (value.charCodeAt(3) << 24)) >>>
    0
  );
}
