import assert from 'node:assert/strict';
import test from 'node:test';
import { buildXPlaneSourceValidation, reconcileXPlaneSource } from './xplane-source-validation.js';
import { createEditorState, editorReducer } from './editor-state.js';
import { assertUnpatchedAptSource } from '../draft-generator/extractor/xplane-source-status.js';
import { extractXPlaneAirportData } from '../draft-generator/extractor/xplane-apt.js';
import { selectionFromInput } from '../draft-generator/local-package.js';
const kept = { feature: 'aaaaaaaaaaaaaaaa', code: 108, run: 0, start: 0.2, end: 0.8 };
const stale = { feature: 'bbbbbbbbbbbbbbbb', code: 108, run: 0, start: 0, end: 1 };
const validation = { aptSelectors: [kept] };
test('fresh apt source removes absent references and bindings while preserving lights and valid ranges', () => {
  const dsf = { kind: 'dsf-object' };
  const object = {
    id: 'BARS_A',
    coordinates: [
      [1, 2],
      [3, 4],
    ],
    sourceBindings: [
      { sourceFeatureId: kept.feature, lightCode: 108, sourceRunIndex: 0 },
      { sourceFeatureId: stale.feature, lightCode: 108, sourceRunIndex: 0 },
      { dsfRemoval: dsf },
    ],
  };
  const document = { simulator: 'xplane', xplaneRemovals: [kept, stale, dsf], objects: [object] };
  const result = reconcileXPlaneSource(document, validation);
  assert.deepEqual(result.xplaneRemovals, [kept, dsf]);
  assert.equal(result.objects[0].coordinates, object.coordinates);
  assert.equal(result.objects[0].sourceBindings.length, 2);
  assert.equal(document.xplaneRemovals.length, 3);
});
test('incomplete source extraction and MSFS never prune X-Plane references', () => {
  const document = { simulator: 'xplane', xplaneRemovals: [kept, stale], objects: [] };
  assert.equal(reconcileXPlaneSource(document, null), document);
  assert.equal(
    buildXPlaneSourceValidation({ meta: { aptDatFilesParsed: 0 }, lightRows: [] }),
    null
  );
  const msfs = { ...document, simulator: 'msfs' };
  assert.equal(reconcileXPlaneSource(msfs, validation), msfs);
  assert.deepEqual(reconcileXPlaneSource(document, { aptSelectors: [] }).xplaneRemovals, []);
});
test('source refresh and automatic cleanup share one undo step', () => {
  const state = createEditorState({
    icao: 'YSCB',
    simulator: 'xplane',
    objects: [],
    removals: [],
    xplaneRemovals: [kept, stale],
  });
  const next = editorReducer(state, {
    type: 'update-source',
    source: { name: 'fresh' },
    xplaneSourceValidation: validation,
  });
  assert.deepEqual(next.present.xplaneRemovals, [kept]);
  assert.deepEqual(
    editorReducer(next, { type: 'undo' }).present.xplaneRemovals,
    state.present.xplaneRemovals
  );
});
test('folder selection keeps status files readable and blocks only patched airports', async () => {
  const apt = new File(['I\n1200\n1 0 0 0 YSCB Test\n99\n'], 'apt.dat');
  const marker = new File(
    [JSON.stringify({ schema: 'bars-xplane-source-status/v1', airports: ['YSCB'] })],
    'apt.dat.bars-removals.json'
  );
  const entries = selectionFromInput([apt, marker]).entries;
  assert.ok(entries[1].file);
  await assert.rejects(
    assertUnpatchedAptSource(entries, 'apt.dat', 'YSCB'),
    /active BARS removals/
  );
  await assert.doesNotReject(assertUnpatchedAptSource(entries, 'apt.dat', 'YMML'));
  await assert.rejects(extractXPlaneAirportData({ entries, icao: 'YSCB' }), /active BARS removals/);
});
test('restored status allows extraction and malformed status blocks cleanup', async () => {
  const entry = (value) => [
    { path: 'apt.dat.bars-removals.json', file: new File([JSON.stringify(value)], 'status.json') },
  ];
  await assert.doesNotReject(
    assertUnpatchedAptSource(
      entry({ schema: 'bars-xplane-source-status/v1', airports: [] }),
      'apt.dat',
      'YSCB'
    )
  );
  await assert.rejects(assertUnpatchedAptSource(entry({}), 'apt.dat', 'YSCB'), /invalid/);
});

test('malformed source geometry is never treated as proof that references vanished', () => {
  assert.equal(
    buildXPlaneSourceValidation({
      meta: {
        aptDatFilesParsed: 1,
        warnings: ['apt.dat: ignored malformed apt.dat node: 111 broken'],
      },
      lightRows: [],
    }),
    null
  );
});
test('non-light source bindings survive removal cleanup', () => {
  const binding = { sourceFeatureId: stale.feature, lightCode: 1 };
  const result = reconcileXPlaneSource(
    { simulator: 'xplane', xplaneRemovals: [], objects: [{ sourceBindings: [binding] }] },
    validation
  );
  assert.deepEqual(result.objects[0].sourceBindings, [binding]);
});
