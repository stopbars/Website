import { describe, expect, it } from 'vitest';
import {
  createDecodedTextureCache,
  decodedTextureKey,
} from './decoded-texture-cache.js';

function image(bytes) {
  return { width: 1, height: 1, data: new Uint8ClampedArray(bytes) };
}

describe('decoded texture cache', () => {
  it('keeps recently used decoded pixels and evicts the oldest entry', () => {
    const cache = createDecodedTextureCache(8);
    cache.set('first', image(4));
    cache.set('second', image(4));
    expect(cache.get('first')).not.toBeNull();
    cache.set('third', image(4));
    expect(cache.get('second')).toBeNull();
    expect(cache.get('first')).not.toBeNull();
    expect(cache.get('third')).not.toBeNull();
  });

  it('separates different line atlas compositions of the same source file', () => {
    const first = decodedTextureKey('textures/paint.dds', {
      textureScaleY: 8,
      lineTextureLayers: [{ s1: 0, sm: 8, s2: 16 }],
    }, true);
    const second = decodedTextureKey('textures/paint.dds', {
      textureScaleY: 12,
      lineTextureLayers: [{ s1: 0, sm: 8, s2: 16 }],
    }, true);
    expect(first).not.toBe(second);
  });

  it('separates opaque NO_ALPHA decoding from alpha-blended decoding', () => {
    const blended = decodedTextureKey('textures/soil.dds', { textureNoAlpha: false });
    const opaque = decodedTextureKey('textures/soil.dds', { textureNoAlpha: true });

    expect(blended).not.toBe(opaque);
  });
});
