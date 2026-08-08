import assert from 'node:assert/strict';
import test from 'node:test';
import {
  composeXPlaneLineTexture,
  createXPlaneLineTexturePattern,
  forceOpaqueTexture,
  metresPerPixel,
  realWorldLineWidthExpression,
  xPlaneLinePhysicalWidth,
  xPlaneLineRepeatMeters,
  xPlaneLineTextureDimensions,
} from './scenery-texture.js';

test('honours X-Plane NO_ALPHA without changing source RGB pixels', () => {
  const opaque = forceOpaqueTexture({
    width: 2,
    height: 1,
    data: Uint8ClampedArray.from([20, 30, 40, 0, 50, 60, 70, 128]),
  });

  assert.deepEqual([...opaque.data], [20, 30, 40, 255, 50, 60, 70, 255]);
});

test('composes every X-Plane S_OFFSET layer around the DSF line centre', () => {
  const image = {
    width: 8,
    height: 1,
    data: Uint8ClampedArray.from([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255,
      255, 0, 0, 255, 255,
    ]),
  };
  const composed = composeXPlaneLineTexture(image, {
    texturePixelWidth: 8,
    lineTextureLayers: [
      { layer: 0, s1: 0, sm: 2, s2: 2 },
      { layer: 1, s1: 6, sm: 6, s2: 8 },
    ],
  });

  assert.equal(composed.width, 1);
  assert.equal(composed.height, 4);
  assert.deepEqual([...composed.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...composed.data.slice(-4)], [0, 0, 255, 255]);
});

test('normalizes X-Plane line textures once from their physical aspect ratio', () => {
  const properties = {
    textureWidthMeters: 0.5,
    textureScaleX: 8,
    textureScaleY: 4,
  };
  const dimensions = xPlaneLineTextureDimensions(properties);

  assert.equal(dimensions.width / dimensions.height, 8);
  assert.equal(dimensions.physicalWidth, 0.5);
  assert.equal(dimensions.physicalLength, 4);
  assert.ok(metresPerPixel(-31.94, 19) < metresPerPixel(-31.94, 18));
});

test('derives DSF line width from the visible S_OFFSET atlas span', () => {
  const properties = {
    texturePixelWidth: 1024,
    textureScaleX: 20,
    textureScaleY: 5,
    lineTextureLayers: [
      { layer: 0, s1: 250, sm: 262, s2: 274 },
      { layer: 1, s1: 46, sm: 54, s2: 62 },
    ],
  };

  assert.equal(xPlaneLinePhysicalWidth(properties), 0.46875);
  const dimensions = xPlaneLineTextureDimensions(properties);
  assert.equal(dimensions.physicalWidth, 0.46875);
  assert.equal(dimensions.physicalLength, 5);
  assert.ok(Math.abs(dimensions.width / dimensions.height - 5 / 0.46875) < 0.02);
});

test('matches the installed X-Plane marking 53 physical width and repeat', () => {
  const properties = {
    texturePixelWidth: 1024,
    textureScaleX: 12,
    textureScaleY: 3,
    lineTextureLayers: [{ layer: 0, s1: 276, sm: 306, s2: 324 }],
  };

  assert.equal(xPlaneLinePhysicalWidth(properties), 0.5625);
  assert.equal(xPlaneLineRepeatMeters(properties), 3);
});

test('produces one stable texture without changing its cropped orientation', () => {
  const image = {
    width: 4,
    height: 2,
    data: Uint8ClampedArray.from([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0,
      255, 0, 255, 0, 255, 0, 255, 0, 255,
    ]),
  };
  const pattern = createXPlaneLineTexturePattern(image, {
    textureWidthMeters: 0.5,
    textureScaleY: 2,
  });

  assert.equal(pattern.width / pattern.height, 4);
  assert.deepEqual([...pattern.data.slice(0, 4)], [255, 0, 0, 255]);
});

test('keeps stable line patterns bounded for very long repeat distances', () => {
  const dimensions = xPlaneLineTextureDimensions({
    textureWidthMeters: 0.25,
    textureHeightMeters: 80,
  });

  assert.ok(dimensions.width <= 2048);
  assert.ok(dimensions.height >= 1);
  assert.ok(Math.abs(dimensions.width / dimensions.height - 256) < 1);
});

test('uses a typed fallback when optional scenery width is null', () => {
  const expression = realWorldLineWidthExpression(-31.94);
  const serialized = JSON.stringify(expression);

  assert.match(serialized, /"number",\["get","widthMeters"\],0/);
  assert.doesNotMatch(serialized, /"has","widthMeters"/);
});

test('does not repeat START_CAP and END_CAP atlas rows through the line body', () => {
  const image = {
    width: 1,
    height: 4,
    data: Uint8ClampedArray.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]),
  };
  const properties = {
    texturePixelWidth: 1,
    texturePixelHeight: 4,
    textureScaleY: 8,
    lineTextureLayers: [{ layer: 0, s1: 0, sm: 0, s2: 1 }],
    startCaps: [{ t1: 0, t2: 1 }],
    endCaps: [{ t1: 3, t2: 4 }],
  };
  const composed = composeXPlaneLineTexture(image, properties);

  assert.equal(composed.width, 2);
  assert.deepEqual([...composed.data.slice(0, 4)], [0, 255, 0, 255]);
  assert.deepEqual([...composed.data.slice(-4)], [0, 0, 255, 255]);
  assert.equal(xPlaneLineRepeatMeters(properties), 4);
});
