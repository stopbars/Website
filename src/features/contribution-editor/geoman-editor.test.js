import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acknowledgeGeomanGeometryEdit,
  applyEditorGeometryPreviews,
  createGeomanEditorFeatures,
  createGeomanFeatureSyncState,
  createGeomanReferenceSnapTargets,
  discardCompletedGeomanDraw,
  limitGeomanFeatureQueries,
  planGeomanFeatureSync,
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

  assert.equal(features.length, 1);
  assert.equal(features[0].id, 'BARS_TWO');
  assert.equal(features[0].properties.__gm_disableEdit, false);
});

test('hides every set of edit handles when nothing is selected', () => {
  const features = createGeomanEditorFeatures(objects, null);

  assert.deepEqual(features, []);
});

test('discards the transient Geoman feature after completing a draw', async () => {
  const calls = [];
  const feature = { id: 'temporary-draw' };
  const geoman = {
    features: {
      setSelection(ids, fireEvent) {
        calls.push(['selection', ids, fireEvent]);
      },
      async delete(candidate) {
        calls.push(['delete', candidate]);
      },
    },
  };

  await discardCompletedGeomanDraw(geoman, feature);

  assert.deepEqual(calls, [
    ['selection', [], false],
    ['delete', feature],
    ['selection', [], false],
  ]);
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

test('keeps the source identity when there is no live geometry preview', () => {
  const source = {
    type: 'FeatureCollection',
    features: [],
  };

  assert.equal(applyEditorGeometryPreviews(source, 'BARS_TWO', null, null), source);
});

test('registers light rows and individual fixtures as non-editable snap targets', () => {
  const referenceFeatures = [
    {
      id: 'line-one',
      geometry: { type: 'LineString', coordinates: objects[0].coordinates },
      properties: { sourceId: 'line-one', snapCategory: 'light-rows' },
    },
    {
      id: 'light-one',
      geometry: { type: 'Point', coordinates: [151.15, -33.85] },
      properties: { sourceId: 'light-one', snapCategory: 'fixtures' },
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

test('does not snap to pavement, runway, marking, or fixture boundary lines', () => {
  const polygon = [
    [151.1, -33.9],
    [151.2, -33.9],
    [151.2, -33.8],
    [151.1, -33.9],
  ];
  const referenceFeatures = [
    {
      id: 'apron',
      properties: { sourceId: 'apron', snapCategory: 'pavement-edges' },
      geometry: { type: 'Polygon', coordinates: [polygon] },
    },
    {
      id: 'marking-islands',
      properties: { sourceId: 'marking-islands', snapCategory: 'runways' },
      geometry: { type: 'MultiPolygon', coordinates: [[polygon], [polygon]] },
    },
    {
      id: 'painted-line',
      properties: { sourceId: 'painted-line', snapCategory: 'painted-lines' },
      geometry: { type: 'LineString', coordinates: polygon },
    },
    {
      id: 'fixture-boundary',
      properties: { sourceId: 'fixture-boundary', snapCategory: 'fixtures' },
      geometry: { type: 'Polygon', coordinates: [polygon] },
    },
  ];

  const targets = createGeomanReferenceSnapTargets(referenceFeatures);

  assert.equal(targets.features.length, 0);
});

test('keeps both light rows and individual fixtures when the MSFS snap budget is bounded', () => {
  const points = Array.from({ length: 10 }, (_, index) => ({
    id: `light-${index}`,
    properties: { sourceId: `light-${index}`, snapCategory: 'fixtures' },
    geometry: { type: 'Point', coordinates: [151 + index / 10_000, -33.9] },
  }));
  const lines = Array.from({ length: 10 }, (_, index) => ({
    id: `line-${index}`,
    properties: { sourceId: `line-${index}`, snapCategory: 'light-rows' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [151, -33.9 + index / 10_000],
        [151.001, -33.9 + index / 10_000],
      ],
    },
  }));

  const targets = createGeomanReferenceSnapTargets([...points, ...lines], {
    maximumFeatures: 5,
  }).features;

  assert.equal(targets.length, 5);
  assert.equal(targets.filter((feature) => feature.geometry.type === 'LineString').length, 3);
  assert.equal(targets.filter((feature) => feature.geometry.type === 'Point').length, 2);
});

test('stops expanding dense multipart snap geometry at the requested safety limit', () => {
  const referenceFeatures = [
    {
      id: 'dense-boundary',
      properties: { sourceId: 'dense-boundary', snapCategory: 'light-rows' },
      geometry: {
        type: 'MultiLineString',
        coordinates: Array.from({ length: 1_000 }, (_, index) => [
          [151, -34 + index / 100_000],
          [151.001, -34 + index / 100_000],
        ]),
      },
    },
  ];

  assert.equal(
    createGeomanReferenceSnapTargets(referenceFeatures, { maximumFeatures: 200 }).features.length,
    200
  );
});

test('replaces only the selected editor feature when selection changes', () => {
  const referenceSnapTargets = createGeomanReferenceSnapTargets([
    {
      id: 'snap-row',
      properties: { sourceId: 'snap-row', snapCategory: 'light-rows' },
      geometry: { type: 'LineString', coordinates: objects[0].coordinates },
    },
  ]);
  const initial = planGeomanFeatureSync(createGeomanFeatureSyncState(), {
    objects,
    selectedId: 'BARS_ONE',
    editorObjectsVisible: true,
    referenceSnapTargets,
    snapEnabled: true,
  });
  const next = planGeomanFeatureSync(initial.nextState, {
    objects,
    selectedId: 'BARS_TWO',
    editorObjectsVisible: true,
    referenceSnapTargets,
    snapEnabled: true,
  });

  assert.equal(initial.importFeatures.length, 2);
  assert.deepEqual(next.deleteIds, ['BARS_ONE']);
  assert.deepEqual(next.importFeatures.map((feature) => feature.id), ['BARS_TWO']);
  assert.equal(
    next.importFeatures.some((feature) => feature.properties.barsReferenceSnap),
    false
  );
});

test('limits Geoman pointer queries to Geoman source layers', () => {
  const selectedFeature = { id: 'BARS_ONE' };
  const mapQueries = [];
  const originalQuery = () => ['original'];
  const adapter = { queryFeaturesByScreenCoordinates: originalQuery };
  const geoman = {
    mapAdapter: adapter,
    features: {
      get(sourceName, featureId) {
        return sourceName === 'gm_main' && featureId === 'BARS_ONE' ? selectedFeature : null;
      },
    },
  };
  const map = {
    getStyle: () => ({
      layers: [
        { id: 'airport-reference', source: 'simulator-reference' },
        { id: 'geoman-main', source: 'gm_main' },
      ],
    }),
    queryRenderedFeatures(point, options) {
      mapQueries.push({ point, options });
      return [
        { source: 'gm_main', properties: { __gm_id: 'BARS_ONE' } },
        { source: 'gm_main', properties: { __gm_id: 'BARS_ONE' } },
      ];
    },
  };

  const restore = limitGeomanFeatureQueries(geoman, map);
  const features = adapter.queryFeaturesByScreenCoordinates({
    queryCoordinates: [100, 200],
    sourceNames: ['gm_main'],
  });

  assert.deepEqual(features, [selectedFeature]);
  assert.deepEqual(mapQueries, [
    { point: [100, 200], options: { layers: ['geoman-main'] } },
  ]);
  restore();
  assert.equal(adapter.queryFeaturesByScreenCoordinates, originalQuery);
});

test('updates one changed editor geometry without rebuilding reference snap targets', () => {
  const referenceSnapTargets = createGeomanReferenceSnapTargets([]);
  const initial = planGeomanFeatureSync(createGeomanFeatureSyncState(), {
    objects,
    selectedId: 'BARS_TWO',
    editorObjectsVisible: true,
    referenceSnapTargets,
    snapEnabled: true,
  });
  const changedObjects = [
    objects[0],
    {
      ...objects[1],
      coordinates: [...objects[1].coordinates, [151.5, -33.5]],
    },
  ];
  const next = planGeomanFeatureSync(initial.nextState, {
    objects: changedObjects,
    selectedId: 'BARS_TWO',
    editorObjectsVisible: true,
    referenceSnapTargets,
    snapEnabled: true,
  });

  assert.deepEqual(next.deleteIds, ['BARS_TWO']);
  assert.deepEqual(
    next.importFeatures.map((feature) => feature.id),
    ['BARS_TWO']
  );
});

test('acknowledges geometry already applied by Geoman without reimporting it', () => {
  const initial = planGeomanFeatureSync(createGeomanFeatureSyncState(), {
    objects,
    selectedId: 'BARS_TWO',
    editorObjectsVisible: true,
    referenceSnapTargets: createGeomanReferenceSnapTargets([]),
    snapEnabled: true,
  });
  const coordinates = [...objects[1].coordinates, [151.5, -33.5]];

  assert.equal(
    acknowledgeGeomanGeometryEdit(initial.nextState, 'BARS_TWO', coordinates),
    true
  );
  const next = planGeomanFeatureSync(initial.nextState, {
    objects: [objects[0], { ...objects[1], coordinates }],
    selectedId: 'BARS_TWO',
    editorObjectsVisible: true,
    referenceSnapTargets: initial.nextState.referenceSnapTargets,
    snapEnabled: true,
  });

  assert.deepEqual(next.deleteIds, []);
  assert.deepEqual(next.importFeatures, []);
});
