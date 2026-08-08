import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLineTextureTriangles,
  buildPolygonTextureTriangles,
  buildXPlaneTextureGeometry,
  xplaneLayerOrder,
  xplaneTextureRenderPass,
} from './xplane-texture-geometry.js';

const LATITUDE = -31.94;
const METERS_PER_LONGITUDE = 111_320 * Math.cos((LATITUDE * Math.PI) / 180);

test('builds a world-width line ribbon with metre-based longitudinal UVs', () => {
  const triangles = buildLineTextureTriangles({
    geometry: {
      type: 'LineString',
      coordinates: [
        [115.96, LATITUDE],
        [115.96 + 8 / METERS_PER_LONGITUDE, LATITUDE],
      ],
    },
    properties: {
      textureWidthMeters: 0.5,
      textureScaleY: 8,
    },
  });

  assert.equal(triangles.length, 24);
  const uCoordinates = triangles.filter((_, index) => index % 4 === 2);
  const vCoordinates = triangles.filter((_, index) => index % 4 === 3);
  assert.ok(Math.abs(Math.max(...uCoordinates) - 1) < 0.001);
  assert.deepEqual([...new Set(vCoordinates)].sort(), [0, 1]);
  const leftLatitude = triangles[1];
  const rightLatitude = triangles[5];
  assert.ok(Math.abs(Math.abs(leftLatitude - rightLatitude) * 111_320 - 0.5) < 0.01);
});

test('rebases and subdivides UVs on very long line segments', () => {
  const triangles = buildLineTextureTriangles({
    geometry: {
      type: 'LineString',
      coordinates: [
        [115.96, LATITUDE],
        [115.96 + 1600 / METERS_PER_LONGITUDE, LATITUDE],
      ],
    },
    properties: {
      texturePixelWidth: 1024,
      textureScaleX: 12,
      textureScaleY: 3,
      lineTextureLayers: [{ layer: 0, s1: 46, sm: 54, s2: 62 }],
    },
  });

  const uCoordinates = triangles.filter((_, index) => index % 4 === 2);
  const vCoordinates = triangles.filter((_, index) => index % 4 === 3);

  assert.ok(triangles.length > 24);
  assert.ok(Math.min(...uCoordinates) >= 0);
  assert.ok(Math.max(...uCoordinates) <= 33);
  assert.deepEqual([...new Set(vCoordinates)].sort(), [0, 1]);
  assert.ok(triangles.every(Number.isFinite));
});

test('fits ALIGN texture segments to line endpoints', () => {
  const triangles = buildLineTextureTriangles({
    geometry: {
      type: 'LineString',
      coordinates: [
        [115.96, LATITUDE],
        [115.96 + 7 / METERS_PER_LONGITUDE, LATITUDE],
      ],
    },
    properties: {
      textureWidthMeters: 0.5,
      textureScaleY: 8,
      alignSegments: 4,
    },
  });
  const uCoordinates = triangles.filter((_, index) => index % 4 === 2);
  const endingSegment = Math.max(...uCoordinates) * 4;
  assert.ok(Math.abs(endingSegment - Math.round(endingSegment)) < 0.001);
});

test('triangulates DSF polygons with their explicit scenery UV coordinates', () => {
  const coordinates = [
    [115.96, -31.94],
    [115.961, -31.94],
    [115.961, -31.939],
    [115.96, -31.939],
    [115.96, -31.94],
  ];
  const triangles = buildPolygonTextureTriangles({
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: {
      explicitTextureWindings: [
        [
          [115.96, -31.94, 0.1, 0.2],
          [115.961, -31.94, 0.9, 0.2],
          [115.961, -31.939, 0.9, 0.8],
          [115.96, -31.939, 0.1, 0.8],
          [115.96, -31.94, 0.1, 0.2],
        ],
      ],
    },
  });

  assert.equal(triangles.length, 24);
  const uvPairs = new Set();
  for (let index = 0; index < triangles.length; index += 4) {
    uvPairs.add(`${triangles[index + 2]}:${triangles[index + 3]}`);
  }
  assert.deepEqual([...uvPairs].sort(), ['0.1:0.2', '0.1:0.8', '0.9:0.2', '0.9:0.8']);
});

test('keeps line and polygon texture batches separate by X-Plane asset', () => {
  const groups = buildXPlaneTextureGeometry([
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [115.96, LATITUDE],
          [115.961, LATITUDE],
        ],
      },
      properties: { renderPattern: 'line-texture' },
    },
    {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [115.96, -31.94],
            [115.961, -31.94],
            [115.961, -31.939],
            [115.96, -31.94],
          ],
        ],
      },
      properties: { texturePattern: 'pavement-texture', textureScaleX: 4, textureScaleY: 4 },
    },
  ]);

  assert.deepEqual(groups.map((group) => group.pattern).sort(), [
    'line-texture',
    'pavement-texture',
  ]);
  assert.ok(groups.every((group) => group.vertices.length > 0));
});

test('uses a line-specific composition when pavement shares the source image', () => {
  const groups = buildXPlaneTextureGeometry([
    {
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [115.96, -31.94],
            [115.961, -31.94],
            [115.961, -31.939],
            [115.96, -31.94],
          ],
        ],
      },
      properties: {
        texturePattern: 'shared-source',
        textureScaleX: 8,
        textureScaleY: 8,
      },
    },
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [115.96, LATITUDE],
          [115.961, LATITUDE],
        ],
      },
      properties: {
        texturePattern: 'shared-source',
        renderPattern: 'shared-source-line-composition',
        widthMeters: 0.3,
      },
    },
  ]);

  assert.deepEqual(
    groups.map((group) => group.pattern).sort(),
    ['shared-source', 'shared-source-line-composition']
  );
});

test('preserves X-Plane layer groups even when overlays share one texture', () => {
  const polygon = (layerGroup) => ({
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [115.96, -31.94],
          [115.961, -31.94],
          [115.961, -31.939],
          [115.96, -31.94],
        ],
      ],
    },
    properties: {
      texturePattern: 'shared-atlas',
      textureScaleX: 4,
      textureScaleY: 4,
      layerGroup,
    },
  });
  const groups = buildXPlaneTextureGeometry([
    polygon('markings -2'),
    polygon('terrain'),
    polygon('runways +1'),
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.layerOrder),
    [xplaneLayerOrder('terrain'), xplaneLayerOrder('runways +1'), xplaneLayerOrder('markings -2')]
  );
  assert.ok(new Set(groups.map((group) => group.id)).size === groups.length);
});

test('separates terrain scenery from airport pavement and markings', () => {
  assert.equal(xplaneTextureRenderPass('terrain +1'), 'terrain');
  assert.equal(xplaneTextureRenderPass('airports -1'), 'terrain');
  assert.equal(xplaneTextureRenderPass('beaches 2'), 'terrain');
  assert.equal(xplaneTextureRenderPass('runways +1'), 'overlay');
  assert.equal(xplaneTextureRenderPass('markings'), 'overlay');
});

test('uses apt.dat texture heading for stock pavement UV rotation', () => {
  const longitudeDelta = 18 / METERS_PER_LONGITUDE;
  const latitudeDelta = 36 / 111_320;
  const triangles = buildPolygonTextureTriangles({
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [115.96, LATITUDE],
          [115.96 + longitudeDelta, LATITUDE],
          [115.96 + longitudeDelta, LATITUDE + latitudeDelta],
          [115.96, LATITUDE + latitudeDelta],
          [115.96, LATITUDE],
        ],
      ],
    },
    properties: {
      textureScaleX: 18,
      textureScaleY: 36,
      textureHeading: 90,
    },
  });
  const uvPairs = [];
  for (let index = 0; index < triangles.length; index += 4) {
    uvPairs.push([triangles[index + 2], triangles[index + 3]]);
  }

  assert.ok(Math.abs(Math.max(...uvPairs.map(([u]) => u)) - 2) < 0.001);
  assert.ok(Math.abs(Math.min(...uvPairs.map(([, v]) => v)) + 0.5) < 0.001);
});

test('orders unpaved airport surfaces between shoulders and paved surfaces', () => {
  assert.ok(xplaneLayerOrder('shoulders') < xplaneLayerOrder('unpaved_taxiways'));
  assert.ok(xplaneLayerOrder('unpaved_taxiways') < xplaneLayerOrder('taxiways'));
  assert.ok(xplaneLayerOrder('taxiways') < xplaneLayerOrder('unpaved_runways'));
  assert.ok(xplaneLayerOrder('unpaved_runways') < xplaneLayerOrder('runways'));
});
