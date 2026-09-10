import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDecodedTextureCache,
  decodedTextureKey,
  msfsDecodedTextureKey,
} from './decoded-texture-cache.js';

function image(bytes) {
  return { width: 1, height: 1, data: new Uint8ClampedArray(bytes) };
}

describe('decoded texture cache', () => {
  it('keeps recently used decoded pixels and evicts the oldest entry', () => {
    const cache = createDecodedTextureCache(8);
    cache.set('first', image(4));
    cache.set('second', image(4));
    assert.notEqual(cache.get('first'), null);
    cache.set('third', image(4));
    assert.equal(cache.get('second'), null);
    assert.notEqual(cache.get('first'), null);
    assert.notEqual(cache.get('third'), null);
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
    assert.notEqual(first, second);
  });

  it('separates opaque NO_ALPHA decoding from alpha-blended decoding', () => {
    const blended = decodedTextureKey('textures/soil.dds', { textureNoAlpha: false });
    const opaque = decodedTextureKey('textures/soil.dds', { textureNoAlpha: true });

    assert.notEqual(blended, opaque);
  });

  it('separates MSFS texture transformations and source packages', () => {
    const descriptor = {
      pattern: 'paint',
      path: 'texture/paint.dds',
      file: { size: 512, lastModified: 10 },
      lineLayout: { uMin: 0.1, uMax: 0.2 },
      tint: [1, 0.5, 0.5],
    };

    assert.notEqual(
      msfsDecodedTextureKey('first', descriptor),
      msfsDecodedTextureKey('second', descriptor)
    );
    assert.notEqual(
      msfsDecodedTextureKey('first', descriptor),
      msfsDecodedTextureKey('first', { ...descriptor, tint: [1, 1, 1] })
    );
  });
});
