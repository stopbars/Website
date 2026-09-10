import assert from 'node:assert/strict';
import test from 'node:test';
import { selectedRemovalGeojson } from './removal-selection-display.js';

function row(properties = {}) {
  return {
    type: 'Feature',
    id: properties.sourceId ?? 'row-a',
    properties: {
      sourceId: 'row-a',
      sourceFeatureId: '0123456789abcdef',
      sourceType: 'bgl-airport-light-row',
      lightCode: 102,
      sourceRunIndex: 3,
      msfsRemovalTarget: true,
      ...properties,
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [151, -33.9],
        [151.001, -33.9],
      ],
    },
  };
}

test('MSFS removal highlight contains only the selected metre range', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          sourceIds: ['row-a'],
          selections: [{ sourceId: 'row-a', rangeStartMeters: 20, rangeEndMeters: 60 }],
        },
      ],
    }
  );
  const coordinates = result.features[0].geometry.coordinates;

  assert.equal(result.features.length, 1);
  assert.ok(coordinates[0][0] > 151);
  assert.ok(coordinates.at(-1)[0] < 151.001);
});

test('X-Plane removal highlight contains only the normalized selector range', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row({ sourceType: 'xplane-apt-light-string' })] },
    {
      simulator: 'xplane',
      xplaneRemovals: [{ feature: '0123456789abcdef', code: 102, run: 3, start: 0.25, end: 0.75 }],
    }
  );
  const coordinates = result.features[0].geometry.coordinates;

  assert.equal(result.features.length, 1);
  assert.ok(Math.abs(coordinates[0][0] - 151.00025) < 1e-8);
  assert.ok(Math.abs(coordinates.at(-1)[0] - 151.00075) < 1e-8);
});

test('separate selected ranges remain separate red sections', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          sourceIds: ['row-a'],
          selections: [
            { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
            { sourceId: 'row-a', rangeStartMeters: 60, rangeEndMeters: 70 },
          ],
        },
      ],
    }
  );

  assert.equal(result.features.length, 2);
  assert.ok(
    result.features[0].geometry.coordinates.at(-1)[0] <
      result.features[1].geometry.coordinates[0][0]
  );
});

test('generated removal highlights use the BARS source binding section', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'generated',
          origin: 'msfs-source',
          sourceIds: ['row-a:division-section:BARS_A'],
        },
      ],
      objects: [
        {
          sourceBindings: [
            {
              sourceId: 'row-a:division-section:BARS_A',
              rangeStartMeters: 20,
              rangeEndMeters: 60,
            },
          ],
        },
      ],
    }
  );

  assert.equal(result.features.length, 1);
  assert.ok(result.features[0].geometry.coordinates[0][0] > 151);
  assert.ok(result.features[0].geometry.coordinates.at(-1)[0] < 151.001);
});

test('manual keep edits replace the draft binding in the red highlight', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'manual',
          origin: 'msfs-manual',
          sourceIds: ['row-a'],
          selections: [
            { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 30 },
            { sourceId: 'row-a', rangeStartMeters: 70, rangeEndMeters: 90 },
          ],
        },
      ],
      objects: [
        {
          sourceBindings: [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 90 }],
        },
      ],
    }
  );

  assert.equal(result.features.length, 2);
  assert.ok(
    result.features[0].geometry.coordinates.at(-1)[0] <
      result.features[1].geometry.coordinates[0][0]
  );
});

test('persisted keep sections are omitted from the red removal highlight', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'manual',
          origin: 'msfs-manual',
          sourceIds: ['row-a'],
          selections: [{ sourceId: 'row-a' }],
        },
        {
          id: 'msfs-keep:row-a',
          origin: 'msfs-manual',
          sourceIds: ['row-a'],
          selections: [],
          keepSelections: [{ sourceId: 'row-a', rangeStartMeters: 30, rangeEndMeters: 70 }],
        },
      ],
      objects: [],
    }
  );

  assert.equal(result.features.length, 2);
  const firstEnd = result.features[0].geometry.coordinates.at(-1)[0];
  const secondStart = result.features[1].geometry.coordinates[0][0];
  assert.ok(firstEnd < secondStart);
  assert.ok(firstEnd < 151.0004);
  assert.ok(secondStart > 151.0006);
});

test('explicit generated selections do not rescan unrelated removal polygons', () => {
  const selectedRow = row();
  const unrelatedRow = {
    ...row({ sourceId: 'row-b' }),
    geometry: {
      type: 'LineString',
      coordinates: [
        [151, -33.8],
        [151.001, -33.8],
      ],
    },
  };
  const reference = { type: 'FeatureCollection', features: [selectedRow, unrelatedRow] };
  const document = {
    simulator: 'msfs',
    removals: [
      {
        id: 'manual',
        origin: 'msfs-manual',
        sourceIds: ['row-a'],
        selections: [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 30 }],
        coordinates: [
          [150.9999, -33.8001],
          [151.0011, -33.8001],
          [151.0011, -33.7999],
          [150.9999, -33.7999],
          [150.9999, -33.8001],
        ],
      },
    ],
    objects: [],
  };

  const result = selectedRemovalGeojson(reference, document);

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.sourceId, 'row-a');
  assert.equal(selectedRemovalGeojson(reference, document), result);
});

test('a bounded selection is not copied onto another source in a merged polygon', () => {
  const result = selectedRemovalGeojson(
    {
      type: 'FeatureCollection',
      features: [row(), row({ sourceId: 'row-b' })],
    },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'merged',
          origin: 'msfs-manual',
          sourceIds: ['row-a', 'row-b'],
          selections: [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 30 }],
        },
      ],
      objects: [],
    }
  );

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.sourceId, 'row-a');
});

test('draft removal polygons still highlight the removed row when their source alias is unresolved', () => {
  const result = selectedRemovalGeojson(
    {
      type: 'FeatureCollection',
      features: [row(), row({ sourceId: 'protected-row', msfsRemovalTarget: false })],
    },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'draft-removal',
          origin: 'msfs-source',
          sourceIds: ['generated-row-alias'],
          coordinates: [
            [151.0002, -33.9001],
            [151.0008, -33.9001],
            [151.0008, -33.8999],
            [151.0002, -33.8999],
            [151.0002, -33.9001],
          ],
        },
      ],
      objects: [],
    }
  );

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.sourceId, 'row-a');
  assert.ok(Math.abs(result.features[0].geometry.coordinates[0][0] - 151.0002) < 1e-8);
  assert.ok(Math.abs(result.features[0].geometry.coordinates.at(-1)[0] - 151.0008) < 1e-8);
});

test('a removal with a matching row still falls back when its origin produced no dashed selection', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row({ msfsRemovalTarget: false })] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'draft-removal-with-imported-origin',
          origin: 'imported',
          sourceIds: ['row-a'],
          coordinates: [
            [151.00025, -33.9001],
            [151.00075, -33.9001],
            [151.00075, -33.8999],
            [151.00025, -33.8999],
            [151.00025, -33.9001],
          ],
        },
      ],
      objects: [],
    }
  );

  assert.equal(result.features.length, 1);
  assert.ok(Math.abs(result.features[0].geometry.coordinates[0][0] - 151.00025) < 1e-8);
  assert.ok(Math.abs(result.features[0].geometry.coordinates.at(-1)[0] - 151.00075) < 1e-8);
});

test('each draft polygon gets a dash when BARS objects share one parent source row', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [row()] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'first-draft-removal',
          origin: 'msfs-source',
          sourceIds: ['row-a'],
          coordinates: removalRing(151.0001, 151.00035),
        },
        {
          id: 'bars-94h19-removal',
          origin: 'msfs-source',
          sourceIds: ['row-a'],
          coordinates: removalRing(151.0007, 151.0009),
        },
      ],
      objects: [
        {
          partId: 'BARS_OTHER',
          sourceBindings: [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 30 }],
        },
      ],
    }
  );

  assert.equal(result.features.length, 2);
  assert.ok(Math.abs(result.features[1].geometry.coordinates[0][0] - 151.0007) < 1e-8);
  assert.ok(Math.abs(result.features[1].geometry.coordinates.at(-1)[0] - 151.0009) < 1e-8);
});

test('draft removal keeps its exact dash when the reference scene cannot resolve the source row', () => {
  const result = selectedRemovalGeojson(
    { type: 'FeatureCollection', features: [] },
    {
      simulator: 'msfs',
      removals: [
        {
          id: 'bars-mjs5w-removal',
          origin: 'msfs-source',
          sourceIds: ['missing-reference-row'],
          coordinates: removalRing(151.00025, 151.00075),
          sourceLines: [
            {
              sourceId: 'missing-reference-row',
              coordinates: [
                [151, -33.9],
                [151.001, -33.9],
              ],
            },
          ],
        },
      ],
      objects: [],
    }
  );

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].properties.sourceType, 'stored-removal-source');
  assert.ok(Math.abs(result.features[0].geometry.coordinates[0][0] - 151.00025) < 1e-8);
  assert.ok(Math.abs(result.features[0].geometry.coordinates.at(-1)[0] - 151.00075) < 1e-8);
});

function removalRing(start, end) {
  return [
    [start, -33.9001],
    [end, -33.9001],
    [end, -33.8999],
    [start, -33.8999],
    [start, -33.9001],
  ];
}
