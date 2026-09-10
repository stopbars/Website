import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDdsTexture } from './dds-texture.js';

test('decodes a DXT1 pavement texture block', () => {
  const texture = fixtureDds('DXT1', Uint8Array.of(0x00, 0xf8, 0xe0, 0x07, 0, 0, 0, 0));
  const decoded = decodeDdsTexture(texture);

  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 4);
  assert.deepEqual([...decoded.data.slice(0, 4)], [255, 0, 0, 255]);
});

test('rejects unsupported DDS compression instead of showing corrupt pavement', () => {
  assert.throws(() => decodeDdsTexture(fixtureDds('DX10', new Uint8Array(16))), /Unsupported/);
});

test('decodes DXT5 alpha indices across both 24-bit halves and palette modes', () => {
  for (const [first, second, palette] of [
    [200, 40, [200, 40, 177, 154, 131, 109, 86, 63]],
    [40, 200, [40, 200, 72, 104, 136, 168, 0, 255]],
    [100, 100, [100, 100, 100, 100, 100, 100, 0, 255]],
  ]) {
    // First half indexes 0..7, second half indexes 7..0.
    const block = Uint8Array.of(
      first, second, 0x88, 0xc6, 0xfa, 0x77, 0x39, 0x05,
      0xff, 0xff, 0, 0, 0, 0, 0, 0
    );
    const decoded = decodeDdsTexture(fixtureDds('DXT5', block));
    const alpha = [...decoded.data].filter((_, index) => index % 4 === 3);
    assert.deepEqual(alpha, [...palette, ...palette.toReversed()]);
  }
});

function fixtureDds(fourCC, block) {
  const bytes = new Uint8Array(128 + block.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x20534444, true);
  view.setUint32(4, 124, true);
  view.setUint32(12, 4, true);
  view.setUint32(16, 4, true);
  view.setUint32(28, 1, true);
  view.setUint32(76, 32, true);
  for (let index = 0; index < 4; index += 1) {
    bytes[84 + index] = fourCC.charCodeAt(index);
  }
  bytes.set(block, 128);
  return bytes.buffer;
}
