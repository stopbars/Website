import assert from 'node:assert/strict';
import test from 'node:test';
import {
  colorForObjectId,
  originalDivisionsFromPoints,
  serializeDraftXml,
} from './editor-model.js';
import { createEditorState, editorReducer, validateEditorDocument } from './editor-state.js';

const document = {
  icao: 'YPPH',
  simulator: 'msfs',
  objects: [
    {
      id: 'BARS_ONE',
      name: 'A',
      type: 'lead_on',
      status: 'matched',
      coordinates: [
        [115, -32],
        [115.001, -32],
      ],
      sourceBindings: [],
    },
  ],
};

test('selecting the current object preserves the editor state identity', () => {
  const initial = createEditorState(document);
  const selected = editorReducer(initial, {
    type: 'select',
    id: initial.present.objects[0].partId,
  });

  assert.notEqual(selected, initial);
  assert.equal(editorReducer(selected, { type: 'select', id: selected.selectedId }), selected);
});

test('undo restores geometry and every edit invalidates the tested hash', () => {
  let state = createEditorState({ ...document, testedHash: 'old-hash' });
  state = editorReducer(state, {
    type: 'update-object',
    id: state.present.objects[0].partId,
    changes: { coordinates: [...document.objects[0].coordinates, [115.002, -32]] },
  });
  assert.equal(state.present.testedHash, null);
  assert.equal(state.present.objects[0].coordinates.length, 3);
  state = editorReducer(state, { type: 'undo' });
  assert.equal(state.present.objects[0].coordinates.length, 2);
});

test('multipart BARS objects keep one exported ID but edit parts independently', () => {
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    objects: [
      {
        ...document.objects[0],
        groupId: 'multipart:BARS_ONE',
      },
      {
        ...document.objects[0],
        groupId: 'multipart:BARS_ONE',
        coordinates: [
          [115.002, -32],
          [115.003, -32],
        ],
      },
    ],
  });

  assert.equal(
    validateEditorDocument(state.present).some((issue) => issue.code === 'duplicate-id'),
    false
  );
  assert.notEqual(state.present.objects[0].partId, state.present.objects[1].partId);
  state = editorReducer(state, {
    type: 'update-object',
    id: state.present.objects[1].partId,
    changes: { name: 'Edited part' },
  });
  assert.equal(state.present.objects[0].name, 'A');
  assert.equal(state.present.objects[1].name, 'Edited part');
  assert.equal(state.present.objects[0].id, state.present.objects[1].id);
});

test('renaming a BARS ID updates only that part and derives its name, type, and color', () => {
  let state = createEditorState({
    ...document,
    originalDivisions: [
      {
        id: 'BARS_RENAMED',
        name: 'A2',
        type: 'stopbar',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115, -32],
            [115.001, -32],
          ],
        },
      },
    ],
    objects: [
      {
        ...document.objects[0],
        groupId: 'multipart:BARS_ONE',
      },
      {
        ...document.objects[0],
        groupId: 'multipart:BARS_ONE',
        coordinates: [
          [115.002, -32],
          [115.003, -32],
        ],
      },
      {
        ...document.objects[0],
        id: 'BARS_OTHER',
      },
    ],
  });
  const originalPartIds = state.present.objects.map((object) => object.partId);

  state = editorReducer(state, {
    type: 'rename-object-id',
    partId: state.present.objects[0].partId,
    id: 'BARS_RENAMED',
  });

  assert.deepEqual(
    state.present.objects.map((object) => object.id),
    ['BARS_RENAMED', 'BARS_ONE', 'BARS_OTHER']
  );
  assert.deepEqual(
    state.present.objects.map((object) => object.partId),
    originalPartIds
  );
  assert.equal(state.present.objects[0].name, 'A2');
  assert.equal(state.present.objects[0].type, 'stopbar');
  assert.equal(state.present.objects[0].color, colorForObjectId('BARS_RENAMED'));
});

test('renaming one object does not rename an unrelated object with the same BARS ID', () => {
  let state = createEditorState({
    ...document,
    objects: [
      document.objects[0],
      {
        ...document.objects[0],
        coordinates: [
          [115.002, -32],
          [115.003, -32],
        ],
      },
    ],
  });
  assert.notEqual(state.present.objects[0].groupId, state.present.objects[1].groupId);

  state = editorReducer(state, {
    type: 'rename-object-id',
    partId: state.present.objects[0].partId,
    id: 'BARS_RENAMED',
  });

  assert.deepEqual(
    state.present.objects.map((object) => object.id),
    ['BARS_RENAMED', 'BARS_ONE']
  );
});

test('connecting simulator scenery persists its identity and invalidates prior testing', () => {
  const state = createEditorState({
    icao: 'YSCN',
    simulator: 'xplane',
    testedHash: 'old-hash',
    objects: [
      {
        id: 'BARS_SOURCE',
        coordinates: [
          [149.1, -35.1],
          [149.2, -35.2],
        ],
      },
    ],
  });
  const updated = editorReducer(state, {
    type: 'update-source',
    source: { name: 'Custom Scenery', fingerprint: '2:abcdef12' },
  });

  assert.deepEqual(updated.present.source, {
    name: 'Custom Scenery',
    fingerprint: '2:abcdef12',
  });
  assert.equal(updated.present.testedHash, null);
  assert.equal(updated.dirty, true);
});

test('validation reports unfinished and near-disconnected objects', () => {
  const issues = validateEditorDocument({
    ...document,
    objects: [
      ...document.objects,
      {
        id: 'BARS_TWO',
        name: 'B',
        type: 'lead_on',
        status: 'manual',
        coordinates: [[115.00101, -32]],
        sourceBindings: [],
      },
    ],
  });
  assert.ok(issues.some((issue) => issue.code === 'unfinished-object'));
});

test('validation requires a BARS ID', () => {
  const issues = validateEditorDocument({
    ...document,
    objects: [{ ...document.objects[0], id: '' }],
  });
  assert.ok(issues.some((issue) => issue.code === 'missing-object-id'));
});

test('validation does not warn about expected gaps between guidance route endings', () => {
  const issues = validateEditorDocument({
    ...document,
    originalDivisions: [],
    objects: [
      {
        ...document.objects[0],
        id: 'GUIDANCE_A',
        partId: 'GUIDANCE_A:part:1',
        type: 'lead_on',
        coordinates: [
          [115, -32],
          [115.00001, -32],
        ],
      },
      {
        ...document.objects[0],
        id: 'GUIDANCE_B',
        partId: 'GUIDANCE_B:part:1',
        type: 'taxiway',
        coordinates: [
          [115.00002, -32],
          [115.00003, -32],
        ],
      },
    ],
  });

  assert.equal(
    issues.some((issue) => issue.code === 'endpoint-gap'),
    false
  );
});

test('validation keeps endpoint-gap warnings at high-latitude spatial cell boundaries', () => {
  const latitude = 80;
  const oneMetreLongitude = 1 / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const issues = validateEditorDocument({
    ...document,
    originalDivisions: [],
    objects: [
      {
        ...document.objects[0],
        id: 'STOPBAR_A',
        partId: 'STOPBAR_A:part:1',
        type: 'stopbar',
        coordinates: [
          [15, latitude],
          [15, latitude + 0.001],
        ],
      },
      {
        ...document.objects[0],
        id: 'GUIDANCE_B',
        partId: 'GUIDANCE_B:part:1',
        type: 'lead_on',
        coordinates: [
          [15 + oneMetreLongitude, latitude],
          [15 + oneMetreLongitude, latitude + 0.001],
        ],
      },
    ],
  });

  const gap = issues.find((issue) => issue.code === 'endpoint-gap');
  assert.equal(gap?.partId, 'STOPBAR_A:part:1');
  assert.match(gap?.message ?? '', /1\.0 m/);
});

test('selection starts empty and deleting a selected object does not jump to another object', () => {
  let state = createEditorState({
    ...document,
    objects: [
      document.objects[0],
      {
        ...document.objects[0],
        id: 'BARS_TWO',
      },
    ],
  });
  const firstId = state.present.objects[0].partId;
  assert.equal(state.selectedId, null);
  state = editorReducer(state, { type: 'select', id: firstId });
  state = editorReducer(state, { type: 'delete-object', id: firstId });
  assert.equal(state.selectedId, null);
  assert.equal(state.present.objects.length, 1);
});

test('manual MSFS removal updates preserve removals generated by the draft', () => {
  const state = createEditorState({
    ...document,
    removals: [
      {
        id: 'draft-removal',
        origin: 'msfs-source',
        sourceIds: ['draft-row'],
        coordinates: [
          [115, -32],
          [115.001, -32],
          [115.001, -32.001],
          [115, -32],
        ],
      },
    ],
  });
  const updated = editorReducer(state, {
    type: 'replace-msfs-manual-removals',
    removals: [
      {
        id: 'manual-removal',
        sourceIds: ['manual-row'],
        coordinates: [
          [115.01, -32],
          [115.011, -32],
          [115.011, -32.001],
          [115.01, -32],
        ],
      },
    ],
  });

  assert.deepEqual(
    updated.present.removals.map((removal) => removal.id),
    ['draft-removal', 'manual-removal']
  );
  assert.equal(updated.present.removals[1].origin, 'msfs-manual');
});

test('editing a generated MSFS removal replaces its linked group with manual geometry', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    removals: [
      { id: 'draft-a', origin: 'msfs-source', sourceIds: ['row-a'], coordinates },
      { id: 'auto-b', origin: 'msfs-auto', sourceIds: ['row-b'], coordinates },
      { id: 'manual-c', origin: 'msfs-manual', sourceIds: ['row-c'], coordinates },
    ],
  });

  const updated = editorReducer(state, {
    type: 'replace-msfs-edited-removals',
    sourceIds: ['row-a'],
    removalIds: ['draft-a'],
    removals: [{ id: 'edited-a', sourceIds: ['row-a'], coordinates }],
  });

  assert.deepEqual(
    updated.present.removals.map(({ id, origin }) => [id, origin]),
    [
      ['auto-b', 'msfs-auto'],
      ['manual-c', 'msfs-manual'],
      ['edited-a', 'msfs-manual'],
    ]
  );
});

test('automatic MSFS removal replaces only its accepted draft source', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    removals: [
      { id: 'draft-a', origin: 'msfs-source', sourceIds: ['row-a'], coordinates },
      { id: 'draft-b', origin: 'msfs-source', sourceIds: ['row-b'], coordinates },
      { id: 'manual-a', origin: 'msfs-manual', sourceIds: ['row-a'], coordinates },
    ],
  });
  const updated = editorReducer(state, {
    type: 'upsert-msfs-auto-removals',
    sourceIds: ['row-a'],
    removals: [{ id: 'auto-a', sourceIds: ['row-a'], coordinates }],
  });

  assert.deepEqual(
    updated.present.removals.map((removal) => removal.id),
    ['draft-b', 'manual-a', 'auto-a']
  );
  assert.equal(updated.present.removals.at(-1).origin, 'msfs-auto');
});

test('automatic MSFS removal can replace a covered draft polygon with mismatched source identity', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    removals: [
      { id: 'stale-draft', origin: 'msfs-source', sourceIds: ['old-alias'], coordinates },
      { id: 'unrelated', origin: 'msfs-source', sourceIds: ['other-row'], coordinates },
    ],
  });
  const updated = editorReducer(state, {
    type: 'upsert-msfs-auto-removals',
    sourceIds: ['new-row-id'],
    removalIds: ['stale-draft'],
    removals: [{ id: 'regenerated', sourceIds: ['new-row-id'], coordinates }],
  });

  assert.deepEqual(
    updated.present.removals.map((removal) => removal.id),
    ['unrelated', 'regenerated']
  );
});

test('automatic MSFS removal replaces an explicitly covered imported polygon', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    removals: [
      { id: 'legacy-imported', origin: 'imported', sourceIds: [], coordinates },
      { id: 'other-imported', origin: 'imported', sourceIds: [], coordinates },
    ],
  });
  const updated = editorReducer(state, {
    type: 'upsert-msfs-auto-removals',
    sourceIds: ['new-row-id'],
    removalIds: ['legacy-imported'],
    removals: [{ id: 'regenerated', sourceIds: ['new-row-id'], coordinates }],
  });

  assert.deepEqual(
    updated.present.removals.map((removal) => removal.id),
    ['other-imported', 'regenerated']
  );
});

test('legacy removal migration binds imported objects and replaces only resolved polygons', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    objects: [
      { ...document.objects[0], partId: 'matched', sourceBindings: [] },
      { ...document.objects[0], partId: 'unmatched', sourceBindings: [] },
    ],
    removals: [
      { id: 'resolved-imported', origin: 'imported', sourceIds: [], coordinates },
      { id: 'unresolved-imported', origin: 'imported', sourceIds: [], coordinates },
    ],
  });
  const binding = {
    sourceId: 'row-a',
    rangeStartMeters: 10,
    rangeEndMeters: 20,
  };
  const updated = editorReducer(state, {
    type: 'migrate-imported-msfs-removals',
    bindingsByPartId: [{ partId: 'matched', bindings: [binding] }],
    sourceIds: ['row-a'],
    removalIds: ['resolved-imported'],
    removals: [{ id: 'new-format', sourceIds: ['row-a'], coordinates }],
  });

  assert.deepEqual(updated.present.objects[0].sourceBindings, [binding]);
  assert.deepEqual(updated.present.objects[1].sourceBindings, []);
  assert.deepEqual(
    updated.present.removals.map(({ id, origin }) => [id, origin]),
    [
      ['unresolved-imported', 'imported'],
      ['new-format', 'msfs-auto'],
    ]
  );
});

test('MSFS removal replacement treats division sections as aliases of their parent row', () => {
  const coordinates = [
    [115, -32],
    [115.001, -32],
    [115.001, -32.001],
    [115, -32],
  ];
  const state = createEditorState({
    ...document,
    removals: [
      {
        id: 'section-removal',
        origin: 'msfs-auto',
        sourceIds: ['row-a:division-section:BARS_A'],
        coordinates,
      },
    ],
  });
  const updated = editorReducer(state, {
    type: 'upsert-msfs-auto-removals',
    sourceIds: ['row-a'],
    removals: [{ id: 'parent-removal', sourceIds: ['row-a'], coordinates }],
  });

  assert.deepEqual(
    updated.present.removals.map((removal) => removal.id),
    ['parent-removal']
  );
});

test('syncing original division references does not dirty the contribution', () => {
  const state = createEditorState({
    ...document,
    originalDivisions: [
      {
        id: 'BARS_OLD',
        name: 'Old division',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115, -32],
            [115.001, -32],
          ],
        },
      },
    ],
  });
  const updated = editorReducer(state, {
    type: 'sync-original-divisions',
    originalDivisions: [
      {
        id: 'BARS_ONE',
        name: 'Original A',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115, -32],
            [115.001, -32],
          ],
        },
      },
    ],
  });

  assert.equal(updated.dirty, false);
  assert.equal(updated.present.originalDivisions.length, 1);
  assert.equal(updated.present.originalDivisions[0].id, 'BARS_ONE');
});

test('syncing original divisions restores metadata lost by editable XML', () => {
  const state = createEditorState({
    ...document,
    objects: [
      {
        ...document.objects[0],
        id: 'BARS_GUIDANCE',
        name: 'BARS_GUIDANCE',
        type: 'unknown',
        coordinates: [
          [115, -32],
          [115.00001, -32],
        ],
      },
      {
        ...document.objects[0],
        id: 'BARS_STOPBAR',
        name: 'BARS_STOPBAR',
        type: 'unknown',
        coordinates: [
          [115.00002, -32],
          [115.00003, -32],
        ],
      },
    ],
  });
  const updated = editorReducer(state, {
    type: 'sync-original-divisions',
    originalDivisions: [
      {
        id: 'bars_guidance',
        name: 'Taxiway route',
        type: 'taxiway',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115, -32],
            [115.00001, -32],
          ],
        },
      },
      {
        id: 'BARS_STOPBAR',
        name: 'Holding point',
        type: 'stopbar',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.00002, -32],
            [115.00003, -32],
          ],
        },
      },
    ],
  });

  assert.equal(updated.dirty, false);
  assert.deepEqual(
    updated.present.objects.map(({ name, type }) => ({ name, type })),
    [
      { name: 'Taxiway route', type: 'taxiway' },
      { name: 'Holding point', type: 'stopbar' },
    ]
  );
  const endpointGapIds = validateEditorDocument(updated.present)
    .filter((issue) => issue.code === 'endpoint-gap')
    .map((issue) => issue.objectId);
  assert.deepEqual(endpointGapIds, ['BARS_STOPBAR', 'BARS_STOPBAR']);
  assert.equal(endpointGapIds.includes('BARS_GUIDANCE'), false);
});

test('does not warn about a reversed exact duplicate Division object', () => {
  const coordinates = [
    { lat: -32, lng: 115 },
    { lat: -32, lng: 115.001 },
  ];
  const common = {
    type: 'taxiway',
    directionality: 'bi-directional',
    elevated: false,
    ihp: false,
  };
  const originalDivisions = originalDivisionsFromPoints([
    { ...common, id: 'BARS_QE697', name: '_nhqb', coordinates },
    {
      ...common,
      id: 'BARS_MHSWO',
      name: '_dsdw',
      coordinates: [...coordinates].reverse(),
    },
  ]);
  const issues = validateEditorDocument({
    ...document,
    objects: [{ ...document.objects[0], id: 'BARS_QE697' }],
    originalDivisions,
  });

  assert.deepEqual(
    originalDivisions.map((division) => division.id),
    ['BARS_QE697']
  );
  assert.equal(
    issues.some((candidate) => candidate.code === 'missing-division'),
    false
  );
});

test('validation warns for one missing division without blocking testing', () => {
  const issues = validateEditorDocument({
    ...document,
    originalDivisions: [
      {
        id: 'BARS_ONE',
        name: 'Matched object',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115, -32],
            [115.001, -32],
          ],
        },
      },
      {
        id: 'BARS_MISSING',
        name: 'Shop holding point',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.01, -32],
            [115.011, -32],
          ],
        },
      },
    ],
  });
  const missing = issues.find((candidate) => candidate.code === 'missing-division');

  assert.equal(missing.objectId, 'BARS_MISSING');
  assert.equal(missing.target, 'division');
  assert.equal(missing.severity, 'warning');
  assert.match(missing.message, /Shop holding point was not matched/);
});

test('validation blocks when more than fifteen percent of BARS objects are missing', () => {
  const originalDivisions = Array.from({ length: 10 }, (_, index) => ({
    id: index < 8 ? `BARS_${index}` : `BARS_MISSING_${index}`,
    name: `Object ${index + 1}`,
    type: 'lead_on',
  }));
  const objects = originalDivisions.slice(0, 8).map((division, index) => ({
    ...document.objects[0],
    id: division.id,
    coordinates: [
      [115 + index * 0.001, -32],
      [115.0005 + index * 0.001, -32],
    ],
  }));

  const missing = validateEditorDocument({ ...document, objects, originalDivisions }).filter(
    (issue) => issue.code === 'missing-division'
  );

  assert.equal(missing.length, 2);
  assert.equal(
    missing.every((issue) => issue.severity === 'error'),
    true
  );
  assert.match(missing[0].message, /2 of 10 BARS objects are missing/);
});

test('validation blocks two missing stopbars even when the overall missing ratio is low', () => {
  const originalDivisions = Array.from({ length: 20 }, (_, index) => ({
    id: `BARS_${index}`,
    name: `Object ${index + 1}`,
    type: index >= 18 ? 'stopbar' : 'lead_on',
  }));
  const objects = originalDivisions.slice(0, 18).map((division, index) => ({
    ...document.objects[0],
    id: division.id,
    coordinates: [
      [115 + index * 0.001, -32],
      [115.0005 + index * 0.001, -32],
    ],
  }));

  const missing = validateEditorDocument({ ...document, objects, originalDivisions }).filter(
    (issue) => issue.code === 'missing-division'
  );

  assert.equal(missing.length, 2);
  assert.equal(
    missing.every((issue) => issue.severity === 'error'),
    true
  );
});

test('geometry matching keeps X-Plane removal selectors synchronized with the object', () => {
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    xplaneRemovals: [],
  });
  const id = state.present.objects[0].partId;
  const binding = {
    sourceId: 'row-one',
    sourceFeatureId: '0123456789abcdef',
    sourceType: 'xplane-apt-light-string',
    sourceRunIndex: 0,
    lightCode: 101,
    rangeStartMeters: 0,
    rangeEndMeters: 50,
    sourceParentLengthMeters: 100,
  };
  state = editorReducer(state, {
    type: 'update-object-geometry',
    id,
    coordinates: document.objects[0].coordinates,
    match: {
      binding,
      selector: {
        feature: binding.sourceFeatureId,
        code: binding.lightCode,
        run: binding.sourceRunIndex,
        start: 0,
        end: 0.5,
      },
    },
  });
  assert.deepEqual(state.present.xplaneRemovals, [
    {
      feature: '0123456789abcdef',
      code: 101,
      run: 0,
      start: 0,
      end: 0.5,
    },
  ]);
  assert.match(
    serializeDraftXml(state.present),
    /<Light feature="0123456789abcdef" code="101" run="0" start="0\.000000" end="0\.500000"\/>/
  );

  state = editorReducer(state, {
    type: 'update-object-geometry',
    id,
    coordinates: document.objects[0].coordinates,
    match: null,
  });
  assert.deepEqual(state.present.xplaneRemovals, []);
  assert.deepEqual(state.present.objects[0].sourceBindings, []);
});

test('geometry matching retains every source-backed removal covered after an edit', () => {
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    xplaneRemovals: [],
  });
  const id = state.present.objects[0].partId;
  const bindings = [0, 1].map((run) => ({
    sourceId: `row-${run}`,
    sourceFeatureId: '0123456789abcdef',
    sourceType: 'xplane-apt-light-string',
    sourceRunIndex: run,
    lightCode: 101,
    rangeStartMeters: 0,
    rangeEndMeters: 100,
    sourceParentLengthMeters: 100,
  }));
  const selectors = bindings.map((binding) => ({
    feature: binding.sourceFeatureId,
    code: binding.lightCode,
    run: binding.sourceRunIndex,
    start: 0,
    end: 1,
  }));

  state = editorReducer(state, {
    type: 'update-object-geometry',
    id,
    coordinates: document.objects[0].coordinates,
    match: { binding: bindings[0], selector: selectors[0], bindings, selectors },
  });

  assert.equal(state.present.objects[0].sourceBindings.length, 2);
  assert.deepEqual(state.present.xplaneRemovals, selectors);
});

test('MSFS geometry edits retain projected removal provenance when strict shape matching fails', () => {
  const state = createEditorState(document);
  const projectedBinding = {
    sourceId: 'row-a',
    rangeStartMeters: 4,
    rangeEndMeters: 12,
  };
  const updated = editorReducer(state, {
    type: 'update-object-geometry',
    id: 'BARS_ONE:part:1',
    coordinates: [
      [115, -32],
      [115.0002, -32.0001],
    ],
    match: null,
    sourceBindings: [projectedBinding],
  });
  const object = updated.present.objects.find(({ partId }) => partId === 'BARS_ONE:part:1');

  assert.equal(object.status, 'manual');
  assert.deepEqual(object.sourceBindings, [projectedBinding]);
});

test('source light removals can be marked and unmarked explicitly', () => {
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    xplaneRemovals: [],
  });
  const selector = {
    feature: '0123456789abcdef',
    code: 101,
    run: 0,
    start: 0,
    end: 1,
  };

  state = editorReducer(state, { type: 'toggle-xplane-removal', selector });
  assert.deepEqual(state.present.xplaneRemovals, [selector]);
  state = editorReducer(state, { type: 'toggle-xplane-removal', selector });
  assert.deepEqual(state.present.xplaneRemovals, []);
});

test('X-Plane removal edits add and erase bounded row sections', () => {
  const selector = {
    feature: '0123456789abcdef',
    code: 101,
    run: 0,
    start: 0.1,
    end: 0.9,
  };
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    xplaneRemovals: [],
  });

  state = editorReducer(state, {
    type: 'edit-xplane-removal',
    selector,
    operation: 'add',
  });
  state = editorReducer(state, {
    type: 'edit-xplane-removal',
    selector: { ...selector, start: 0.4, end: 0.6 },
    operation: 'erase',
  });

  assert.deepEqual(state.present.xplaneRemovals, [
    { ...selector, end: 0.4 },
    { ...selector, start: 0.6 },
  ]);
});

test('deleting the last bound object also removes its orphaned source selector', () => {
  const selector = {
    feature: '0123456789abcdef',
    code: 101,
    run: 0,
    start: 0,
    end: 1,
  };
  let state = createEditorState({
    ...document,
    simulator: 'xplane',
    xplaneRemovals: [selector],
    objects: [
      {
        ...document.objects[0],
        sourceBindings: [
          {
            sourceFeatureId: selector.feature,
            sourceType: 'xplane-apt-light-string',
            sourceRunIndex: selector.run,
            lightCode: selector.code,
            rangeStartMeters: 0,
            rangeEndMeters: 100,
            sourceParentLengthMeters: 100,
          },
        ],
      },
    ],
  });

  state = editorReducer(state, {
    type: 'delete-object',
    id: state.present.objects[0].partId,
  });
  assert.deepEqual(state.present.xplaneRemovals, []);
});
