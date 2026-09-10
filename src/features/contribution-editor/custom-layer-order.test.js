import assert from 'node:assert/strict';
import test from 'node:test';
import { placeLayerImmediatelyBefore } from './custom-layer-order.js';

test('places the removal target row directly below its selected overlay', () => {
  const layers = [
    { id: 'selected-removal-section-lines' },
    { id: 'removal-target-lines-above-bars' },
    { id: 'editor-measurement-lines' },
  ];
  const map = {
    getLayer: (id) => layers.find((layer) => layer.id === id),
    getStyle: () => ({ layers }),
    moveLayer(id, beforeId) {
      const index = layers.findIndex((layer) => layer.id === id);
      const [layer] = layers.splice(index, 1);
      layers.splice(layers.findIndex((candidate) => candidate.id === beforeId), 0, layer);
    },
  };

  assert.equal(
    placeLayerImmediatelyBefore(
      map,
      'removal-target-lines-above-bars',
      'selected-removal-section-lines'
    ),
    true
  );
  assert.deepEqual(
    layers.map(({ id }) => id),
    [
      'removal-target-lines-above-bars',
      'selected-removal-section-lines',
      'editor-measurement-lines',
    ]
  );
});
