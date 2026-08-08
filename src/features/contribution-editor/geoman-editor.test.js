import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEditorGeometryPreviews,
  createGeomanEditorFeatures,
  createGeomanReferenceSnapTargets,
} from './geoman-editor.js';

const objects = [
  {
    partId: 'BARS_ONE',
    color: '#fff',
    coordinates: [
      [151.1, -33.9],
      [151.2, -33.8],
    ],
  },
  {
    partId: 'BARS_TWO',
    color: '#fff',
    coordinates: [
      [151.3, -33.7],
      [151.4, -33.6],
    ],
  },
];

test('only exposes edit handles for the selected line while preserving snap targets', () => {
  const features = createGeomanEditorFeatures(objects, 'BARS_TWO');

  assert.equal(features.length, 2);
  assert.equal(features[0].properties.__gm_disableEdit, true);
  assert.equal(features[1].properties.__gm_disableEdit, false);
});

test('hides every set of edit handles when nothing is selected', () => {
  const features = createGeomanEditorFeatures(objects, null);

  assert.ok(features.every((feature) => feature.properties.__gm_disableEdit));
});

test('renders live edit and draw geometry without changing the document GeoJSON', () => {
  const source = {
    type: 'FeatureCollection',
    features: objects.map((object) => ({
      type: 'Feature',
      properties: {
        featureType: 'editor-object',
        editorId: object.partId,
      },
      geometry: {
        type: 'LineString',
        coordinates: object.coordinates,
      },
    })),
  };
  const draggedCoordinates = [
    [151.3, -33.7],
    [151.45, -33.55],
  ];
  const drawnCoordinates = [
    [151.5, -33.5],
    [151.6, -33.4],
  ];

  const preview = applyEditorGeometryPreviews(
    source,
    'BARS_TWO',
    { id: 'BARS_TWO', coordinates: draggedCoordinates },
    drawnCoordinates
  );

  assert.deepEqual(preview.features[1].geometry.coordinates, draggedCoordinates);
  assert.deepEqual(preview.features[2].geometry.coordinates, drawnCoordinates);
  assert.deepEqual(source.features[1].geometry.coordinates, objects[1].coordinates);
});

test('registers simulator lines and individual lights as non-editable snap targets', () => {
  const referenceFeatures = [
    {
      id: 'line-one',
      geometry: { type: 'LineString', coordinates: objects[0].coordinates },
      properties: { sourceId: 'line-one' },
    },
    {
      id: 'light-one',
      geometry: { type: 'Point', coordinates: [151.15, -33.85] },
      properties: { sourceId: 'light-one' },
    },
  ];
  const targets = createGeomanReferenceSnapTargets(referenceFeatures);

  assert.equal(targets.features.length, 2);
  assert.equal(targets.features[0].properties.__gm_disableEdit, true);
  assert.equal(targets.features[1].properties.__gm_shape, 'circle_marker');
  assert.deepEqual(targets.features[1].geometry.coordinates, [151.15, -33.85]);
  targets.features[0].geometry.coordinates[0][0] = 0;
  targets.features[1].geometry.coordinates[0] = 0;
  assert.equal(referenceFeatures[0].geometry.coordinates[0][0], 151.1);
  assert.equal(referenceFeatures[1].geometry.coordinates[0], 151.15);
});
