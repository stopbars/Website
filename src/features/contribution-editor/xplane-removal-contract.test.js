import assert from 'node:assert/strict';
import test from 'node:test';
import { dsfSelector, dsfSelectorKey, xplaneSelectorXml } from './xplane-removal-contract.js';
import { createEditorDocument, parseDraftXml, serializeDraftXml } from './editor-model.js';
import { applyXPlaneSelectorEdit } from './removal-intervals.js';
import { selectorFromBinding } from './editor-snapping.js';
import { selectedRemovalGeojson } from './removal-selection-display.js';

const selector = {
  kind: 'dsf-string',
  source: 'Earth nav data/-40+150/-34+151.dsf',
  sha256: 'a'.repeat(64),
  definition: 'lib/airport/lights/slow/101_centerline_twy_G.str',
  command: 12345,
  pool: 2,
  filter: 0,
  index: 1,
  start: 0,
  end: 1,
};

test('DSF removal survives editor save and import with exact identity', () => {
  const document = createEditorDocument({ icao: 'YSSY', simulator: 'xplane', altitude: 0 });
  document.xplaneRemovals = [selector];
  document.objects = [
    {
      id: 'TEST',
      partId: 'TEST:1',
      name: 'Test',
      type: 'taxiway',
      coordinates: [
        [151, -34],
        [151.001, -34],
      ],
      sourceBindings: [{ sourceId: 'source', dsfRemoval: selector }],
    },
  ];
  const xml = serializeDraftXml(document);
  assert.match(xml, /XPlaneRemovals version="2"/);
  assert.deepEqual(parseDraftXml(xml).xplaneRemovals, [selector]);
  assert.deepEqual(
    parseDraftXml(xml).objects[0].sourceBindings,
    document.objects[0].sourceBindings
  );
});

test('invalid DSF paths and partial ranges cannot become whole-source removals', () => {
  assert.equal(dsfSelector({ ...selector, source: '../scenery.dsf' }), null);
  assert.equal(dsfSelector({ ...selector, sha256: '' }), null);
  assert.throws(() => xplaneSelectorXml({ ...selector, start: 0.4, end: 0.6 }));
  assert.equal(
    selectorFromBinding({
      dsfRemoval: selector,
      rangeStartMeters: 40,
      rangeEndMeters: 60,
      sourceParentLengthMeters: 100,
    }),
    null
  );
  assert.deepEqual(
    selectorFromBinding({
      dsfRemoval: selector,
      rangeStartMeters: 0,
      rangeEndMeters: 100,
      sourceParentLengthMeters: 100,
    }),
    selector
  );
});

test('keep restores only the selected winding in the editor', () => {
  const other = { ...selector, index: 2 };
  const selected = applyXPlaneSelectorEdit([other], selector, 'add');
  assert.equal(selected.length, 2);
  assert.deepEqual(applyXPlaneSelectorEdit(selected, selector, 'erase'), [other]);
  assert.notEqual(dsfSelectorKey(selector), dsfSelectorKey(other));
});

test('DSF object placements get an individual removal highlight', () => {
  const object = {
    ...selector,
    kind: 'dsf-object',
    definition: 'lib/airport/lights/slow/taxi_edge.obj',
    index: 3,
  };
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [151, -34] },
    properties: { dsfRemoval: object },
  };
  assert.deepEqual(
    selectedRemovalGeojson(
      { type: 'FeatureCollection', features: [feature] },
      { simulator: 'xplane', xplaneRemovals: [object] }
    ).features,
    [feature]
  );
});
