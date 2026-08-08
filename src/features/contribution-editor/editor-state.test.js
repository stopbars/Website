import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeDraftXml } from './editor-model.js';
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

test('renaming a BARS ID updates every part without changing editor part keys', () => {
  let state = createEditorState({
    ...document,
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
    ['BARS_RENAMED', 'BARS_RENAMED', 'BARS_OTHER']
  );
  assert.deepEqual(
    state.present.objects.map((object) => object.partId),
    originalPartIds
  );
  assert.equal(state.present.objects[0].color, state.present.objects[1].color);
  assert.notEqual(state.present.objects[0].color, state.present.objects[2].color);
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
  assert.notEqual(
    state.present.objects[0].groupId,
    state.present.objects[1].groupId
  );

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

test('validation reports missing division ghosts without adding editable objects', () => {
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
  assert.match(missing.message, /Shop holding point was not matched/);
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
