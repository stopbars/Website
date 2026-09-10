import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRemovalDisplayFeatures } from './removal-display.js';

function removal(id, sourceId, coordinates) {
  return {
    type: 'Feature',
    id,
    properties: {
      featureType: 'editor-removal',
      editorId: id,
      origin: 'msfs-auto',
      sourceIds: [sourceId],
    },
    geometry: { type: 'Polygon', coordinates: [coordinates] },
  };
}

test('overlapping generated removals are merged for display without losing source identities', () => {
  const merged = mergeRemovalDisplayFeatures([
    removal('a', 'row-a', [[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]),
    removal('b', 'row-b', [[1, 0], [3, 0], [3, 1], [1, 1], [1, 0]]),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].geometry.type, 'Polygon');
  assert.deepEqual(merged[0].properties.sourceIds, ['row-a', 'row-b']);
});

test('distant removal polygons remain separate after topology normalization', () => {
  const first = removal('a', 'row-a', [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  const merged = mergeRemovalDisplayFeatures([
    first,
    removal('b', 'row-b', [[3, 0], [4, 0], [4, 1], [3, 1], [3, 0]]),
  ]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0], first);
});

test('self-crossing removal rings are split before WebGL triangulation', () => {
  const [displayed] = mergeRemovalDisplayFeatures([
    removal('crossing', 'row-a', [[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]),
  ]);

  assert.equal(displayed.geometry.type, 'MultiPolygon');
  assert.equal(displayed.geometry.coordinates.length, 2);
  assert.deepEqual(displayed.geometry.coordinates, [
    [[[0, 0], [2, 0], [1, 1], [0, 0]]],
    [[[0, 2], [1, 1], [2, 2], [0, 2]]],
  ]);
});

test('large overlap groups stay separate instead of blocking the editor on a visual union', () => {
  const features = Array.from({ length: 13 }, (_, index) =>
    removal(`dense-${index}`, `row-${index}`, [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
      [0, 0],
    ])
  );

  const displayed = mergeRemovalDisplayFeatures(features);

  assert.equal(displayed.length, features.length);
  assert.deepEqual(
    displayed.map((feature) => feature.id),
    features.map((feature) => feature.id)
  );
});
