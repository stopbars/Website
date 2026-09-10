import assert from 'node:assert/strict';
import test from 'node:test';
import {
  pointInPolygon,
  wgs84LocalDistanceMeters,
} from '../draft-generator/extractor/geo.js';
import {
  buildImportedMsfsRemovalMigration,
  buildMsfsRemovalContext,
  buildSelectedMsfsRemovals,
  normalizeMsfsRemovalContext,
} from './msfs-removal.js';
import {
  automaticRemovalSelections,
  importedRemovalIdsToRetire,
  coveredAutomaticRemovalIds,
  importedRemovalReplacementPlan,
  manualMsfsRemovalSourceIds,
  removalBindingsWithSharedRows,
  removalIdsCoveringLineSection,
  removalSelectionFeature,
  removalSelectionsFromMatches,
  resolveMsfsRemovalTarget,
  resolveXPlaneRemovalTarget,
} from './msfs-removal-client.js';

const row = (id, latitude) => ({
  id,
  sourceFile: 'airport.bgl',
  sourceType: 'bgl-airport-light-row',
  classification: 'stopbar',
  confidence: 1,
  removalEligible: true,
  vertices: [
    { lat: latitude, lon: 151 },
    { lat: latitude, lon: 151.0001 },
  ],
});

test('import refresh preserves saved manual removals and metadata-only keep selections', () => {
  const selected = row('manual-row', -33.9);
  const context = buildMsfsRemovalContext({ lightRows: [selected] });
  const imported = [{
    id: 'saved-removal', origin: 'imported', importedOrigin: 'msfs-manual',
    selections: [{ sourceId: selected.id }],
  }, {
    id: 'saved-keep', origin: 'imported', importedOrigin: 'msfs-manual',
    coordinates: [], keepSelections: [{ sourceId: selected.id, rangeStartMeters: 0, rangeEndMeters: 2 }],
  }];
  const result = buildImportedMsfsRemovalMigration(context, [], imported);
  assert.deepEqual(result.removalIds, ['saved-removal', 'saved-keep']);
  assert.deepEqual(result.acceptedSourceIds, [selected.id]);
  assert.ok(result.removals.some((removal) => removal.keepSelections?.length === 1));
  const first = selected.vertices[0];
  assert.ok(result.removals.every((removal) =>
    !removal.targetLightPoints?.some((target) => target.lat === first.lat && target.lon === first.lon)
  ));
  assert.throws(() => buildImportedMsfsRemovalMigration(
    context, [], [{ ...imported[1], keepSelections: [{ sourceId: 'missing-source' }] }]
  ), /original scenery package/);
});

test('MSFS removal context uses compiled rows instead of individual target fixtures', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [row('row-a', -33.9)],
    instances: [{ id: 'fixture-a', classification: 'stopbar', lat: -33.9, lon: 151.00005 }],
    mustKeepZones: [],
  });

  assert.equal(context.lightRows.length, 1);
  assert.deepEqual(context.instances, []);
});

test('MSFS removal context retains source-bound placement lights for typed exclusions', () => {
  const sourceRow = {
    ...row('placement-row', -33.9),
    sourceType: 'inferred-bgl-placement-row',
    sourceInstanceIds: ['fixture-a'],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [
      {
        id: 'fixture-a',
        sourceType: 'library-object',
        classification: 'stopbar',
        confidence: 1,
        lat: -33.9,
        lon: 151.00005,
      },
    ],
    mustKeepZones: [],
  });

  assert.deepEqual(
    context.instances.map((instance) => instance.id),
    ['fixture-a']
  );
  const result = buildSelectedMsfsRemovals(context, ['placement-row']);
  assert.ok(
    result.removals.some((removal) => removal.exclusionFlags?.excludeLibraryObjects === true)
  );
});

test('uses polygon coverage when a taxiway path does not expose exact lamp coordinates', () => {
  const sourceRow = {
    ...row('path-row', -33.9),
    sourceType: 'bgl-taxiway-path',
    classification: 'taxi-centerline',
    snapToVertices: false,
    spacing: 15,
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['path-row']);

  assert.ok(result.removals.length > 0);
  assert.ok(result.removals.every((removal) => removal.removalMode === 'polygon'));
  assert.ok(result.removals.every((removal) => removal.targetLightPoints.length === 0));
});

test('compiled BGL rows reconstruct discrete targets without inventing a terminal light', () => {
  const startLatitude = -33.9;
  const sourceRow = {
    ...row('compiled-spaced-row', startLatitude),
    spacing: 4,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: startLatitude, lon: 151 },
      { lat: startLatitude + 9 / 111_320, lon: 151 },
      { lat: startLatitude + 18 / 111_320, lon: 151 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['compiled-spaced-row']);
  const targets = result.removals
    .flatMap((removal) => removal.targetLightPoints ?? [])
    .sort(
      (left, right) =>
        wgs84LocalDistanceMeters(sourceRow.vertices[0], left) -
        wgs84LocalDistanceMeters(sourceRow.vertices[0], right)
    );
  const minimumRemovalLatitude = Math.min(
    ...result.removals.flatMap((removal) =>
      removal.coordinates.map(([, latitude]) => latitude)
    )
  );

  assert.equal(targets.length, 5);
  assert.ok(result.removals.every((removal) => removal.removalMode === 'targets'));
  assert.ok(
    wgs84LocalDistanceMeters(sourceRow.vertices[0], {
      lat: minimumRemovalLatitude,
      lon: sourceRow.vertices[0].lon,
    }) > 0.9
  );
  assert.ok(
    targets.every(
      (target) => Math.abs(target.lat - sourceRow.vertices.at(-1).lat) > 0.25 / 111_320
    )
  );
});

test('compiled BGL target spacing follows WGS84 over a long EGLL row', () => {
  const latitude = 51.47;
  const sourceRow = {
    ...row('compiled-long-row', latitude),
    spacing: 16,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: latitude, lon: -0.48 },
      { lat: latitude, lon: -0.463 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['compiled-long-row']);
  const targets = result.removals
    .flatMap((removal) => removal.targetLightPoints ?? [])
    .sort(
      (left, right) =>
        wgs84LocalDistanceMeters(sourceRow.vertices[0], left) -
        wgs84LocalDistanceMeters(sourceRow.vertices[0], right)
    );

  assert.ok(targets.length > 50);
  for (let index = 1; index < targets.length; index += 1) {
    assert.ok(Math.abs(wgs84LocalDistanceMeters(targets[index - 1], targets[index]) - 16) < 0.01);
  }
});

test('vertex-backed rows do not interpolate from spacing metadata alone', () => {
  const sourceRow = {
    ...row('vertex-backed-row', -33.9),
    spacing: 4,
    snapToVertices: true,
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['vertex-backed-row']);
  const targets = result.removals.flatMap((removal) => removal.targetLightPoints ?? []);

  assert.equal(targets.length, sourceRow.vertices.length);
});

test('selected procedural row sections retain the compiled parent-row light phase', () => {
  const startLatitude = -33.9;
  const sourceRow = {
    ...row('compiled-spaced-section', startLatitude),
    spacing: 4,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: startLatitude, lon: 151 },
      { lat: startLatitude + 18 / 111_320, lon: 151 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: sourceRow.id, rangeStartMeters: 5, rangeEndMeters: 13 },
  ]);
  const targets = result.removals
    .flatMap((removal) => removal.targetLightPoints ?? [])
    .sort(
      (left, right) =>
        wgs84LocalDistanceMeters(sourceRow.vertices[0], left) -
        wgs84LocalDistanceMeters(sourceRow.vertices[0], right)
    );

  assert.ok(result.removals.length > 0);
  assert.ok(result.removals.every((removal) => removal.removalMode === 'targets'));
  assert.equal(targets.length, 3);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[0]) - 4) < 0.01);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[1]) - 8) < 0.01);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[2]) - 12) < 0.01);
});

test('selected compiled sections include the real BGL lamp just beyond a row endpoint', () => {
  const startLatitude = -33.9;
  const sourceRow = {
    ...row('compiled-endpoint-row', startLatitude),
    spacing: 4,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: startLatitude, lon: 151 },
      { lat: startLatitude + 18 / 111_320, lon: 151 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: sourceRow.id, rangeStartMeters: 8.8, rangeEndMeters: 13 },
  ]);
  const targets = result.removals
    .flatMap((removal) => removal.targetLightPoints ?? [])
    .sort(
      (left, right) =>
        wgs84LocalDistanceMeters(sourceRow.vertices[0], left) -
        wgs84LocalDistanceMeters(sourceRow.vertices[0], right)
    );
  const minimumRemovalLatitude = Math.min(
    ...result.removals.flatMap((removal) =>
      removal.coordinates.map(([, latitude]) => latitude)
    )
  );

  assert.equal(result.conflicts.length, 0);
  assert.equal(targets.length, 2);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[0]) - 8) < 0.01);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[1]) - 12) < 0.01);
  assert.ok(wgs84LocalDistanceMeters(targets[0], { lat: minimumRemovalLatitude, lon: 151 }) > 0.9);
  const endpointRemoval = result.removals.find((removal) =>
    removal.targetLightPoints?.some(
      (point) =>
        Math.abs(point.lat - targets[0].lat) < 1e-10 &&
        Math.abs(point.lon - targets[0].lon) < 1e-10
    )
  );
  assert.ok(endpointRemoval);
  const endpointTarget = endpointRemoval.targetLightPoints.find(
    (point) =>
      Math.abs(point.lat - targets[0].lat) < 1e-10 && Math.abs(point.lon - targets[0].lon) < 1e-10
  );
  assert.equal(endpointTarget.supportSizeMeters, 0.75);
  const endpointRemovalLatitudes = endpointRemoval.coordinates.map(([, latitude]) => latitude);
  assert.ok(
    wgs84LocalDistanceMeters(targets[0], {
      lat: Math.max(...endpointRemovalLatitudes),
      lon: targets[0].lon,
    }) > 0.9
  );
});

test('compiled endpoint coverage stops before the next lamp ownership midpoint', () => {
  const startLatitude = -33.9;
  const sourceRow = {
    ...row('compiled-safe-endpoint-row', startLatitude),
    spacing: 4,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: startLatitude, lon: 151 },
      { lat: startLatitude + 18 / 111_320, lon: 151 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: sourceRow.id, rangeStartMeters: 10.1, rangeEndMeters: 13 },
  ]);
  const targets = result.removals.flatMap((removal) => removal.targetLightPoints ?? []);

  assert.equal(result.conflicts.length, 0);
  assert.equal(targets.length, 1);
  assert.ok(Math.abs(wgs84LocalDistanceMeters(sourceRow.vertices[0], targets[0]) - 12) < 0.01);
});

test('MSFS removal context consolidates co-located source light rows like draft matching', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [row('layer-a', -33.9), row('layer-b', -33.899999), row('layer-c', -33.900001)],
    instances: [],
    mustKeepZones: [],
  });

  assert.equal(context.lightRows.length, 1);
  assert.deepEqual(context.lightRows[0].sourceRowIds.sort(), ['layer-a', 'layer-b', 'layer-c']);
  const result = buildSelectedMsfsRemovals(context, ['layer-b']);
  assert.deepEqual(result.acceptedSourceIds, ['layer-b']);
  assert.ok(result.removals.length > 0);
  assert.ok(result.removals.every((removal) => removal.sourceIds.includes('layer-b')));
});

test('merged compiled rows remove every alternating source-light phase', () => {
  const startLatitude = 51.47;
  const rowLengthMeters = 160;
  const phaseOffsetMeters = 8;
  const compiledRow = (id, offsetMeters, preset) => ({
    ...row(id, startLatitude + offsetMeters / 111_320),
    classification: 'taxi-centerline',
    spacing: 16,
    preset,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [
      { lat: startLatitude + offsetMeters / 111_320, lon: -0.47 },
      { lat: startLatitude + (offsetMeters + rowLengthMeters) / 111_320, lon: -0.47 },
    ],
  });
  const green = compiledRow('green-phase', 0, 'green');
  const yellow = compiledRow('yellow-phase', phaseOffsetMeters, 'yellow');
  const context = buildMsfsRemovalContext({
    lightRows: [green, yellow],
    instances: [],
    mustKeepZones: [],
  });

  assert.equal(context.lightRows.length, 1);
  assert.equal(context.lightRows[0].removalTargetSourceRows.length, 2);
  const result = buildSelectedMsfsRemovals(context, [context.lightRows[0].id]);
  const targets = result.removals.flatMap((removal) => removal.targetLightPoints ?? []);

  assert.equal(result.conflicts.length, 0);
  assert.equal(targets.length, 20);
  assert.ok(
    targets.some(
      (target) => Math.abs(wgs84LocalDistanceMeters(green.vertices[0], target) - 8) < 0.01
    )
  );
});

test('stale merged compiled removal contexts require a scenery refresh', () => {
  const staleContext = {
    version: 3,
    lightRows: [
      {
        ...row('stale-merged-row', 51.47),
        sourceRowIds: ['green-phase', 'yellow-phase'],
        spacing: 16,
        compiledLightPlacement: 'spacing',
        removalTargetSampling: 'spacing',
      },
    ],
    instances: [],
    mustKeepZones: [],
  };

  assert.equal(normalizeMsfsRemovalContext(staleContext), null);
});

test('MSFS removal context merges stacked YMML rows across source and evidence records', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('ymml-aqycy-layer-a', -37.6733),
        sourceFile: 'ymml-lighting-a.bgl',
        evidencePriority: 1,
      },
      {
        ...row('ymml-aqycy-layer-b', -37.6732937),
        sourceFile: 'ymml-lighting-b.bgl',
        evidencePriority: 2,
      },
    ],
    instances: [],
    mustKeepZones: [],
  });

  assert.equal(context.lightRows.length, 1);
  assert.deepEqual(context.lightRows[0].sourceRowIds.sort(), [
    'ymml-aqycy-layer-a',
    'ymml-aqycy-layer-b',
  ]);
  const result = buildSelectedMsfsRemovals(context, ['ymml-aqycy-layer-b']);
  assert.deepEqual(result.rejectedSourceIds, []);
  assert.ok(result.removals.length > 0);
});

test('removal clicks resolve rendered fragments back to the full canonical source row', () => {
  const canonical = {
    id: 'row-a',
    geometry: {
      type: 'LineString',
      coordinates: [
        [151, -33.9],
        [151.001, -33.9],
      ],
    },
    properties: {
      sourceId: 'row-a',
      snapCategory: 'light-rows',
      msfsRemovalTarget: true,
    },
  };
  const overlapping = {
    ...canonical,
    id: 'row-b',
    properties: { ...canonical.properties, sourceId: 'row-b' },
  };
  const renderedFragment = {
    ...canonical,
    geometry: {
      type: 'LineString',
      coordinates: [
        [151.0007, -33.9],
        [151.001, -33.9],
      ],
    },
  };

  assert.equal(
    resolveMsfsRemovalTarget([overlapping, canonical], renderedFragment, [151.0008, -33.9]),
    canonical
  );
});

test('keep-area expansion finds every removal polygon crossed by the selected line section', () => {
  const removals = [
    {
      id: 'crossing-removal',
      coordinates: [
        [151.0004, -33.9001],
        [151.0006, -33.9001],
        [151.0006, -33.8999],
        [151.0004, -33.8999],
        [151.0004, -33.9001],
      ],
    },
    {
      id: 'unrelated-removal',
      coordinates: [
        [151.002, -33.9001],
        [151.0022, -33.9001],
        [151.0022, -33.8999],
        [151.002, -33.8999],
        [151.002, -33.9001],
      ],
    },
  ];

  assert.deepEqual(
    removalIdsCoveringLineSection(removals, [
      [151, -33.9],
      [151.001, -33.9],
    ]),
    ['crossing-removal']
  );
});

test('keep sections retire crossed imported polygons instead of creating legacy slivers', () => {
  const imported = {
    id: 'remove:legacy',
    origin: 'imported',
    sourceIds: [],
    coordinates: [
      [150.9999, -33.9001],
      [151.0001, -33.9001],
      [151.0001, -33.8999],
      [150.9999, -33.8999],
      [150.9999, -33.9001],
    ],
  };
  assert.deepEqual(importedRemovalIdsToRetire([imported], [imported.id]), [imported.id]);
  assert.deepEqual(importedRemovalIdsToRetire([imported], ['another-removal']), []);
});

test('X-Plane removal clicks resolve rendered fragments by apt.dat row identity', () => {
  const canonical = {
    id: 'row-a',
    geometry: {
      type: 'LineString',
      coordinates: [
        [151, -33.9],
        [151.001, -33.9],
      ],
    },
    properties: {
      sourceId: 'row-a',
      sourceFeatureId: '0123456789abcdef',
      sourceType: 'xplane-apt-light-string',
      lightCode: 101,
      sourceRunIndex: 0,
      removable: true,
    },
  };
  const overlapping = {
    ...canonical,
    id: 'row-b',
    properties: { ...canonical.properties, sourceId: 'row-b', sourceRunIndex: 1 },
  };
  const renderedFragment = {
    ...canonical,
    geometry: {
      type: 'LineString',
      coordinates: [
        [151.0007, -33.9],
        [151.001, -33.9],
      ],
    },
  };

  assert.equal(
    resolveXPlaneRemovalTarget([overlapping, canonical], renderedFragment, [151.0008, -33.9]),
    canonical
  );
});

test('the second removal click stays on the row chosen by the first click', () => {
  const startedRow = row('started-row', -33.9);
  const overlappingRow = row('overlapping-row', -33.9);
  startedRow.geometry = {
    type: 'LineString',
    coordinates: startedRow.vertices.map((vertex) => [vertex.lon, vertex.lat]),
  };
  overlappingRow.geometry = {
    type: 'LineString',
    coordinates: overlappingRow.vertices.map((vertex) => [vertex.lon, vertex.lat]),
  };

  assert.equal(removalSelectionFeature({ feature: startedRow }, overlappingRow), startedRow);
});

test('automatic removal includes every co-located source binding from an edited object', () => {
  const selections = removalSelectionsFromMatches({
    binding: { sourceId: 'row-a', rangeStartMeters: 5, rangeEndMeters: 15 },
    bindings: [
      { sourceId: 'row-a', rangeStartMeters: 5, rangeEndMeters: 15 },
      { sourceId: 'row-b', rangeStartMeters: 2, rangeEndMeters: 12 },
    ],
  });

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 5, rangeEndMeters: 15 },
    { sourceId: 'row-b', rangeStartMeters: 2, rangeEndMeters: 12 },
  ]);
});

test('automatic removal merges repeated source ranges and lets full-row coverage win', () => {
  const selections = removalSelectionsFromMatches([
    {
      bindings: [
        { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
        { sourceId: 'row-a', rangeStartMeters: 5, rangeEndMeters: 25 },
      ],
    },
    { binding: { sourceId: 'row-a' } },
  ]);

  assert.deepEqual(selections, [{ sourceId: 'row-a' }]);
});

test('automatic removal preserves real gaps between sections on the same source row', () => {
  const selections = removalSelectionsFromMatches({
    bindings: [
      { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
      { sourceId: 'row-a', rangeStartMeters: 40, rangeEndMeters: 50 },
    ],
  });

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
    { sourceId: 'row-a', rangeStartMeters: 40, rangeEndMeters: 50 },
  ]);
});

test('automatic removal resolves a matched division section to its simulator parent row', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [row('parent-row', -33.9)],
    instances: [],
    mustKeepZones: [],
  });
  const selections = removalSelectionsFromMatches({
    binding: {
      sourceId: 'parent-row:division-section:BARS_S9IJS',
      rangeStartMeters: 2,
      rangeEndMeters: 8,
    },
  });
  const result = buildSelectedMsfsRemovals(context, selections);

  assert.deepEqual(selections, [
    { sourceId: 'parent-row', rangeStartMeters: 2, rangeEndMeters: 8 },
  ]);
  assert.deepEqual(result.acceptedSourceIds, ['parent-row']);
  assert.ok(result.removals.every((removal) => removal.sourceIds.includes('parent-row')));
});

test('cross-row edits regenerate the previous and newly snapped rows together', () => {
  const retainedBindings = [{ sourceId: 'row-a', rangeStartMeters: 2, rangeEndMeters: 8 }];

  assert.deepEqual(
    automaticRemovalSelections(
      { binding: { sourceId: 'row-b', rangeStartMeters: 1, rangeEndMeters: 4 } },
      retainedBindings
    ),
    [
      { sourceId: 'row-b', rangeStartMeters: 1, rangeEndMeters: 4 },
      { sourceId: 'row-a', rangeStartMeters: 2, rangeEndMeters: 8 },
    ]
  );
  assert.deepEqual(
    automaticRemovalSelections(
      { binding: { sourceId: 'row-a', rangeStartMeters: 3, rangeEndMeters: 7 } },
      retainedBindings
    ),
    [{ sourceId: 'row-a', rangeStartMeters: 3, rangeEndMeters: 7 }]
  );
});

test('manual removal edits claim their parent source row from automatic updates', () => {
  const sourceIds = manualMsfsRemovalSourceIds([
    {
      origin: 'msfs-manual',
      sourceIds: ['row-a:division-section:BARS_A'],
    },
    { origin: 'msfs-auto', sourceIds: ['row-b'] },
  ]);

  assert.deepEqual([...sourceIds], ['row-a']);
});

test('an edited object identifies its covered draft removal without touching manual removals', () => {
  const coordinates = [
    [0.25, 0.5],
    [0.75, 0.5],
  ];
  const ring = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];

  assert.deepEqual(
    coveredAutomaticRemovalIds(
      [
        { id: 'draft', origin: 'msfs-source', coordinates: ring },
        { id: 'manual', origin: 'msfs-manual', coordinates: ring },
        {
          id: 'elsewhere',
          origin: 'msfs-auto',
          coordinates: [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        },
      ],
      coordinates
    ),
    ['draft']
  );
});

test('editing one object retains adjacent bindings without filling an uncovered gap', () => {
  const bindings = removalBindingsWithSharedRows(
    [
      {
        partId: 'BARS_GS6AM:part:50',
        sourceBindings: [
          {
            sourceId: 'parent-row:division-section:BARS_GS6AM',
            rangeStartMeters: 61.344,
            rangeEndMeters: 138.197,
          },
        ],
      },
      {
        partId: 'BARS_RTOZE:part:94',
        sourceBindings: [
          {
            sourceId: 'parent-row:division-section:BARS_RTOZE',
            rangeStartMeters: 0,
            rangeEndMeters: 61.344,
          },
        ],
      },
    ],
    'BARS_GS6AM:part:50',
    [{ sourceId: 'parent-row', rangeStartMeters: 65, rangeEndMeters: 138.197 }]
  );
  const selections = removalSelectionsFromMatches({ bindings });

  assert.deepEqual(selections, [
    { sourceId: 'parent-row', rangeStartMeters: 0, rangeEndMeters: 61.344 },
    { sourceId: 'parent-row', rangeStartMeters: 65, rangeEndMeters: 138.197 },
  ]);
});

test('MSFS removal selection keeps every unselected target and decoded must-keep zone protected', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      { ...row('selected-row', -33.9), classification: 'lead-on' },
      { ...row('unselected-row', -33.8999925), classification: 'lead-on' },
    ],
    instances: [],
    mustKeepZones: [
      {
        id: 'decoded-runway-light',
        sourceId: 'runway-light',
        geometryType: 'Point',
        point: { lat: -33.90001, lon: 151.00005 },
        clearanceMeters: 0.5,
      },
    ],
  });
  const result = buildSelectedMsfsRemovals(context, ['selected-row']);

  assert.ok(result.removals.length > 0);
  assert.deepEqual(result.acceptedSourceIds, ['selected-row']);
  assert.ok(result.removals.every((removal) => !removal.sourceIds.includes('unselected-row')));
  assert.ok(
    result.removals.some((removal) =>
      removal.mustKeepZoneIds.some((id) => id.startsWith('selective-row:unselected-row'))
    )
  );
});

test('exact target rows can cross a decoded runway centreline between its discrete lights', () => {
  const runwayRecord = {
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-runway-light-zone',
    sourceRecordOffset: 42,
    sourceBasis: 'bgl-runway-record',
    runwayId: 'runway-16l-34r',
    classification: 'runway',
  };
  const sourceRow = {
    ...row('lead-on-row', -33.9),
    classification: 'lead-on',
    vertices: [
      { lat: -33.9, lon: 151 },
      { lat: -33.9, lon: 151.00005 },
      { lat: -33.9, lon: 151.0001 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [
      {
        ...runwayRecord,
        id: 'runway-centreline-envelope',
        lightType: 'runway-centerline-continuous-envelope',
        geometryMode: 'continuous-procedural-envelope',
        geometryType: 'LineString',
        vertices: sourceRow.vertices,
        clearanceMeters: 0.1,
      },
      {
        ...runwayRecord,
        id: 'runway-centreline-light-before',
        lightType: 'runway-centerline-0',
        geometryMode: 'source-runway-procedural-grid',
        geometryType: 'Point',
        point: { lat: -33.9, lon: 150.9995 },
        clearanceMeters: 0.15,
      },
      {
        ...runwayRecord,
        id: 'runway-centreline-light-after',
        lightType: 'runway-centerline-3000',
        geometryMode: 'source-runway-procedural-grid',
        geometryType: 'Point',
        point: { lat: -33.9, lon: 151.0005 },
        clearanceMeters: 0.15,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, ['lead-on-row']);
  const targets = result.removals.flatMap((removal) => removal.targetLightPoints ?? []);

  assert.deepEqual(result.acceptedSourceIds, ['lead-on-row']);
  assert.equal(targets.length, 3);
  assert.deepEqual(
    targets.map(({ lat, lon }) => ({ lat, lon })),
    sourceRow.vertices
  );
});

test('exact target rows still preserve each decoded runway centreline light', () => {
  const runwayRecord = {
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-runway-light-zone',
    sourceRecordOffset: 42,
    sourceBasis: 'bgl-runway-record',
    runwayId: 'runway-16l-34r',
    classification: 'runway',
  };
  const sourceRow = {
    ...row('lead-on-row', -33.9),
    classification: 'lead-on',
    vertices: [
      { lat: -33.9, lon: 151 },
      { lat: -33.9, lon: 151.00005 },
      { lat: -33.9, lon: 151.0001 },
    ],
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [
      {
        ...runwayRecord,
        id: 'runway-centreline-envelope',
        lightType: 'runway-centerline-continuous-envelope',
        geometryMode: 'continuous-procedural-envelope',
        geometryType: 'LineString',
        vertices: sourceRow.vertices,
        clearanceMeters: 0.1,
      },
      {
        ...runwayRecord,
        id: 'runway-centreline-light',
        lightType: 'runway-centerline-1500',
        geometryMode: 'source-runway-procedural-grid',
        geometryType: 'Point',
        point: sourceRow.vertices[1],
        clearanceMeters: 0.15,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, ['lead-on-row']);
  const targets = result.removals.flatMap((removal) => removal.targetLightPoints ?? []);

  assert.equal(targets.length, 2);
  assert.ok(targets.every((target) => target.lon !== sourceRow.vertices[1].lon));
  assert.ok(
    result.conflicts.some((conflict) =>
      conflict.mustKeepZoneIds?.includes('runway-centreline-light')
    )
  );
});

test('polygon fallback rows retain the continuous runway centreline envelope', () => {
  const sourceRow = {
    ...row('path-row', -33.9),
    sourceType: 'bgl-taxiway-path',
    classification: 'taxi-centerline',
  };
  const runwayRecord = {
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-runway-light-zone',
    sourceRecordOffset: 42,
    sourceBasis: 'bgl-runway-record',
    runwayId: 'runway-16l-34r',
    classification: 'runway',
  };
  const context = buildMsfsRemovalContext({
    lightRows: [sourceRow],
    instances: [],
    mustKeepZones: [
      {
        ...runwayRecord,
        id: 'runway-centreline-envelope',
        lightType: 'runway-centerline-continuous-envelope',
        geometryMode: 'continuous-procedural-envelope',
        geometryType: 'LineString',
        vertices: sourceRow.vertices,
        clearanceMeters: 0.1,
      },
      {
        ...runwayRecord,
        id: 'runway-centreline-light',
        lightType: 'runway-centerline-0',
        geometryMode: 'source-runway-procedural-grid',
        geometryType: 'Point',
        point: { lat: -33.9, lon: 150.9995 },
        clearanceMeters: 0.15,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, ['path-row']);

  assert.deepEqual(result.acceptedSourceIds, ['path-row']);
  assert.equal(result.removals.length, 0);
  assert.ok(
    result.conflicts.some((conflict) =>
      conflict.mustKeepZoneIds?.includes('runway-centreline-envelope')
    )
  );
});

test('MSFS removal selection can remove only a bounded section of a source row', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('section-row', -33.9),
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: 'section-row', rangeStartMeters: 20, rangeEndMeters: 40 },
  ]);
  const longitudes = result.removals.flatMap((removal) =>
    removal.coordinates.map(([longitude]) => longitude)
  );

  assert.ok(result.removals.length > 0);
  assert.equal(result.removals.length, 1);
  assert.ok(Math.min(...longitudes) > 151.0001);
  assert.ok(Math.max(...longitudes) < 151.0007);
  assert.equal(result.removals[0].origin, 'msfs-manual');
  assert.equal(result.removals[0].targetLightPoints.length, 2);
});

test('bounded placement-row removal excludes only source fixtures inside the selected section', () => {
  const instances = Array.from({ length: 11 }, (_, index) => ({
    id: `fixture-${index}`,
    sourceType: 'library-object',
    classification: 'lead-on',
    confidence: 1,
    lat: -33.9,
    lon: 151 + index * 0.0001,
  }));
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('placement-section', -33.9),
        sourceType: 'inferred-bgl-placement-row',
        classification: 'lead-on',
        vertices: instances.map(({ lat, lon }) => ({ lat, lon })),
        sourceInstanceIds: instances.map(({ id }) => id),
      },
    ],
    instances,
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: 'placement-section', rangeStartMeters: 35, rangeEndMeters: 55 },
  ]);
  const typedSquares = result.removals.filter((removal) => removal.exclusionFlags);

  assert.ok(typedSquares.length > 0);
  assert.ok(typedSquares.length < instances.length);
  assert.ok(
    typedSquares.every((removal) =>
      removal.coordinates.every(([longitude]) => longitude > 151.0003 && longitude < 151.0007)
    )
  );
});

test('automatic removal detects a covered polygon from an imported editable contribution', () => {
  const objectCoordinates = [
    [151.0002, -33.9],
    [151.0004, -33.9],
  ];
  const ring = [
    [151, -33.8999],
    [151.001, -33.8999],
    [151.001, -33.9001],
    [151, -33.9001],
    [151, -33.8999],
  ];

  assert.deepEqual(
    coveredAutomaticRemovalIds(
      [
        { id: 'legacy-imported', origin: 'imported', coordinates: ring },
        { id: 'manual', origin: 'msfs-manual', coordinates: ring },
      ],
      objectCoordinates
    ),
    ['legacy-imported']
  );
});

test('imported shared polygons are replaced only when every neighbouring object is rebound', () => {
  const ring = [
    [151, -33.8999],
    [151.001, -33.8999],
    [151.001, -33.9001],
    [151, -33.9001],
    [151, -33.8999],
  ];
  const removals = [{ id: 'legacy-shared', origin: 'imported', coordinates: ring }];
  const objects = [
    {
      partId: 'edited',
      coordinates: [
        [151.0001, -33.9],
        [151.0002, -33.9],
      ],
    },
    {
      partId: 'sibling',
      coordinates: [
        [151.0003, -33.9],
        [151.0004, -33.9],
      ],
    },
  ];
  const binding = { sourceId: 'row-a', rangeStartMeters: 20, rangeEndMeters: 30 };
  const resolved = importedRemovalReplacementPlan(
    removals,
    ['legacy-shared'],
    objects,
    'edited',
    () => [binding]
  );
  const unresolved = importedRemovalReplacementPlan(
    removals,
    ['legacy-shared'],
    objects,
    'edited',
    () => []
  );

  assert.deepEqual([...resolved.replaceableRemovalIds], ['legacy-shared']);
  assert.deepEqual(resolved.retainedBindings, [binding]);
  assert.deepEqual([...unresolved.replaceableRemovalIds], []);
  assert.deepEqual(unresolved.retainedBindings, []);
});

test('legacy removals are retired after load-time source-backed regeneration', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('legacy-row', -33.9),
        classification: 'lead-on',
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [],
  });
  const imported = {
    id: 'legacy-removal',
    origin: 'imported',
    coordinates: [
      [151.0001, -33.89999],
      [151.0005, -33.89999],
      [151.0005, -33.90001],
      [151.0001, -33.90001],
      [151.0001, -33.89999],
    ],
  };
  const result = buildImportedMsfsRemovalMigration(
    context,
    [
      {
        partId: 'aligned',
        coordinates: [
          [151.00015, -33.9],
          [151.00045, -33.9],
        ],
      },
      {
        partId: 'crossing',
        coordinates: [
          [151.0003, -33.9001],
          [151.0003, -33.8999],
        ],
      },
    ],
    [
      imported,
      {
        id: 'unmatched-legacy-removal',
        origin: 'imported',
        coordinates: [
          [151.01, -33.9],
          [151.011, -33.9],
          [151.011, -33.899],
          [151.01, -33.9],
        ],
      },
    ]
  );

  assert.deepEqual(result.removalIds, ['legacy-removal', 'unmatched-legacy-removal']);
  assert.deepEqual(
    result.bindingsByPartId.map(({ partId }) => partId),
    ['aligned']
  );
  assert.ok(result.removals.length > 0);
});

test('MSFS removal selection keeps separate painted sections disconnected', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('painted-sections', -33.9),
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: 'painted-sections', rangeStartMeters: 10, rangeEndMeters: 20 },
    { sourceId: 'painted-sections', rangeStartMeters: 60, rangeEndMeters: 70 },
  ]);
  const bounds = result.removals.map((removal) => {
    const longitudes = removal.coordinates.map(([longitude]) => longitude);
    return [Math.min(...longitudes), Math.max(...longitudes)];
  });
  const storedRanges = [
    ...new Set(
      result.removals.flatMap((removal) =>
        (removal.selections ?? []).map(
          (selection) => `${selection.rangeStartMeters}:${selection.rangeEndMeters}`
        )
      )
    ),
  ].sort();

  assert.equal(result.acceptedSourceIds.length, 2);
  assert.deepEqual(storedRanges, ['10:20', '60:70']);
  assert.ok(bounds.some(([, maximum]) => maximum < 151.0004));
  assert.ok(bounds.some(([minimum]) => minimum > 151.0005));
  assert.ok(bounds.every(([minimum, maximum]) => minimum > 151.0005 || maximum < 151.0004));
});

test('MSFS removal selection retains requested source aliases for draft replacement', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('logical-row', -33.9),
        sourceRowIds: ['raw-row-alias'],
      },
    ],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['raw-row-alias']);

  assert.deepEqual(result.acceptedSourceIds, ['raw-row-alias']);
  assert.ok(result.generatedSourceIds.includes('raw-row-alias'));
  assert.ok(result.removals.every((removal) => removal.sourceIds.includes('raw-row-alias')));
});

test('stopbar removals are not clipped by crossing taxiway-light keep zones', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [row('stopbar-row', -33.9)],
    instances: [],
    mustKeepZones: [
      {
        id: 'taxiway-light',
        sourceId: 'taxiway-light',
        sourceType: 'bgl-airport-light-row',
        classification: 'taxi-centerline-other',
        lightType: 'source-light-row',
        geometryType: 'Point',
        point: { lat: -33.9, lon: 151.00005 },
        clearanceMeters: 2,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, ['stopbar-row']);

  assert.ok(result.removals.length > 0);
  assert.ok(result.removals.every((removal) => !removal.mustKeepZoneIds.includes('taxiway-light')));
  assert.deepEqual(result.acceptedSourceIds, ['stopbar-row']);
});

test('an explicit editor keep section protects lights from every overlapping removal row', () => {
  const protectedLight = { lat: -33.9, lon: 151.0005 };
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('stopbar-row', -33.9),
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
      {
        ...row('taxi-row', -33.9),
        classification: 'taxi-centerline',
        vertices: [
          { lat: -33.9005, lon: 151.0005 },
          { lat: -33.8995, lon: 151.0005 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(
    context,
    [
      { sourceId: 'taxi-row', rangeStartMeters: 0, rangeEndMeters: 45 },
      { sourceId: 'taxi-row', rangeStartMeters: 65, rangeEndMeters: 110 },
      { sourceId: 'stopbar-row' },
    ],
    [{ sourceId: 'taxi-row', rangeStartMeters: 45, rangeEndMeters: 65 }]
  );

  assert.ok(result.removals.some((removal) => removal.keepSelections?.length === 1));
  assert.ok(
    result.removals
      .filter((removal) => removal.coordinates.length >= 4)
      .every(
        (removal) =>
          !pointInPolygon(
            protectedLight,
            removal.coordinates.map(([lon, lat]) => ({ lat, lon }))
          )
      )
  );
});

test('MSFS removal selection splits safely around protected runway lighting', () => {
  const protectedLight = { lat: -33.9, lon: 151.0005 };
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('protected-crossing-row', -33.9),
        classification: 'lead-on',
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [
      {
        id: 'protected-runway-light',
        sourceType: 'runway-light-zone',
        classification: 'runway-edge',
        geometryType: 'Point',
        point: protectedLight,
        clearanceMeters: 5,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: 'protected-crossing-row', rangeStartMeters: 0, rangeEndMeters: 92 },
  ]);

  assert.ok(result.removals.length >= 2);
  assert.deepEqual(result.acceptedSourceIds, ['protected-crossing-row']);
  assert.deepEqual(result.rejectedSourceIds, []);
  assert.ok(
    result.removals.every(
      (removal) =>
        !pointInPolygon(
          protectedLight,
          removal.coordinates.map(([lon, lat]) => ({ lat, lon }))
        )
    )
  );
});

test('MSFS removal selection accepts a fully protected section as a safe empty result', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [
      {
        ...row('fully-protected-row', -33.9),
        classification: 'lead-on',
        vertices: [
          { lat: -33.9, lon: 151 },
          { lat: -33.9, lon: 151.001 },
        ],
      },
    ],
    instances: [],
    mustKeepZones: [
      {
        id: 'protected-runway-light',
        sourceType: 'runway-light-zone',
        classification: 'runway-edge',
        geometryType: 'Point',
        point: { lat: -33.9, lon: 151.0005 },
        clearanceMeters: 5,
      },
    ],
  });

  const result = buildSelectedMsfsRemovals(context, [
    { sourceId: 'fully-protected-row', rangeStartMeters: 42, rangeEndMeters: 50 },
  ]);

  assert.deepEqual(result.removals, []);
  assert.deepEqual(result.acceptedSourceIds, ['fully-protected-row']);
  assert.deepEqual(result.rejectedSourceIds, []);
  assert.ok(result.conflicts.length > 0);
  assert.ok(
    result.conflicts.every((conflict) =>
      conflict.mustKeepZoneIds.includes('protected-runway-light')
    )
  );
});

test('MSFS removal selection still rejects an unresolved source row', () => {
  const context = buildMsfsRemovalContext({
    lightRows: [row('known-row', -33.9)],
    instances: [],
    mustKeepZones: [],
  });

  const result = buildSelectedMsfsRemovals(context, ['missing-row']);

  assert.deepEqual(result.removals, []);
  assert.deepEqual(result.acceptedSourceIds, []);
  assert.deepEqual(result.rejectedSourceIds, ['missing-row']);
});

test('compiled lamp just inside a selected endpoint receives a centred support cap', () => {
  const sourceRow = {
    ...row('inside-endpoint', -33.9),
    spacing: 4,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
    vertices: [{ lat: -33.9, lon: 151 }, { lat: -33.9 + 20 / 111320, lon: 151 }],
  };
  const result = buildSelectedMsfsRemovals(buildMsfsRemovalContext({lightRows: [sourceRow]}), [
    { sourceId: sourceRow.id, rangeStartMeters: 7.8, rangeEndMeters: 12.2 },
  ]);
  const targets = result.removals.flatMap(r => r.targetLightPoints ?? []);
  assert.equal(targets.length, 2);
  assert.ok(targets.every(t => t.supportSizeMeters === 0.75));
  for (const target of targets) {
    const removal = result.removals.find(r => r.targetLightPoints?.includes(target));
    const lats = removal.coordinates.map(c => c[1]);
    assert.ok(wgs84LocalDistanceMeters(target, {lat: Math.min(...lats), lon: target.lon}) > 0.9);
    assert.ok(wgs84LocalDistanceMeters(target, {lat: Math.max(...lats), lon: target.lon}) > 0.9);
  }
});

test('source placement exclusions cross runway envelopes but preserve discrete and explicit kept lights', () => {
  const vertices = [0, 1, 2, 3].map(i => ({lat: -33.9, lon: 151 + i * 0.0001}));
  const instances = vertices.map((point, i) => ({...point, id: `fixture-${i}`, sourceType: 'library-object', classification: 'taxi-centerline'}));
  const sourceRow = {...row('placements', -33.9), sourceType: 'inferred-bgl-placement-row', classification: 'taxi-centerline', vertices, sourceInstanceIds: instances.map(i => i.id)};
  const record = {sourceFile: 'airport.bgl', sourceRecordOffset: 42, sourceType: 'bgl-runway-light-zone', sourceBasis: 'bgl-runway-record', runwayId: 'runway', classification: 'runway'};
  const envelope = {...record, id: 'envelope', geometryMode: 'continuous-procedural-envelope', geometryType: 'LineString', lightType: 'runway-centerline-continuous-envelope', vertices, clearanceMeters: 0.1};
  const discrete = {...record, id: 'discrete', geometryMode: 'source-runway-procedural-grid', geometryType: 'Point', lightType: 'runway-centerline-0', point: vertices[2], clearanceMeters: 0.15};
  const keep = {id: 'explicit-keep', explicitEditorKeep: true, geometryType: 'Point', point: vertices[3], clearanceMeters: 0.5};
  const context = buildMsfsRemovalContext({lightRows: [sourceRow], instances, mustKeepZones: [envelope, discrete, keep]});
  const result = buildSelectedMsfsRemovals(context, [sourceRow.id]);
  const exclusions = result.removals.filter(r => r.exclusionFlags?.excludeLibraryObjects);
  assert.equal(exclusions.length, 2);
  assert.ok(exclusions.some(r => r.sourceIds.includes('fixture-0')));
  assert.ok(exclusions.some(r => r.sourceIds.includes('fixture-1')));
  const fallback = buildSelectedMsfsRemovals({...context, mustKeepZones: [envelope]}, [sourceRow.id]);
  assert.equal(fallback.removals.filter(r => r.exclusionFlags?.excludeLibraryObjects).length, 0);
});
