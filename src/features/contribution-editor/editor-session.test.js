import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearEditorDraft,
  editorSessionNeedsHydration,
  loadEditorDraft,
  loadReferenceScene,
  saveEditorDraft,
  saveReferenceScene,
  textureCacheKey,
  xPlaneTextureDefinitionKey,
} from './editor-session.js';

test('hydrates IndexedDB when only the compact draft restored synchronously', () => {
  assert.equal(editorSessionNeedsHydration(null), true);
  assert.equal(editorSessionNeedsHydration({ document: {} }), true);
  assert.equal(editorSessionNeedsHydration({ referenceScene: {} }), true);
  assert.equal(editorSessionNeedsHydration({ document: {}, referenceScene: {} }), false);
});

test('keeps compact drafts available when persistent browser storage is unavailable', async () => {
  const document = {
    icao: 'YMEM',
    simulator: 'xplane',
    altitude: 20,
    objects: [
      {
        id: 'BARS_MEMORY',
        coordinates: [
          [115.96, -31.95],
          [115.961, -31.951],
        ],
      },
    ],
  };

  await saveEditorDraft(document);
  const restored = await loadEditorDraft('YMEM', 'xplane');
  assert.equal(restored.document.objects[0].id, 'BARS_MEMORY');

  await clearEditorDraft('YMEM', 'xplane');
  assert.equal(await loadEditorDraft('YMEM', 'xplane'), null);
});

test('a newly generated draft replaces the previous editor draft', async () => {
  const base = {
    icao: 'YNEW',
    simulator: 'xplane',
    altitude: 20,
  };

  await saveEditorDraft({
    ...base,
    objects: [{ id: 'OLD_DRAFT', coordinates: [[115.96, -31.95]] }],
  });
  await saveEditorDraft({
    ...base,
    objects: [{ id: 'NEW_DRAFT', coordinates: [[115.97, -31.96]] }],
  });

  const restored = await loadEditorDraft('YNEW', 'xplane');
  assert.equal(restored.document.objects[0].id, 'NEW_DRAFT');

  await clearEditorDraft('YNEW', 'xplane');
});

test('keeps a simulator reference scene available across SPA navigation', async () => {
  const scene = {
    version: 1,
    simulator: 'xplane',
    features: [{ type: 'Feature', id: 'row', geometry: { type: 'Point', coordinates: [1, 2] } }],
  };

  await saveReferenceScene('YREF', 'xplane', scene, 'test-package', '1:abcdef00');
  const restored = await loadReferenceScene('YREF', 'xplane');

  assert.equal(restored.scene.features[0].id, 'row');
  assert.equal(restored.sourceName, 'test-package');
  assert.equal(restored.fingerprint, '1:abcdef00');
});

test('normalizes persisted texture cache keys across dropped Windows paths', () => {
  assert.equal(
    textureCacheKey('42:abcdef00', '.\\Resources\\default scenery\\line.dds'),
    'global:resources/default scenery/line.dds'
  );
});

test('shares the same texture cache key across airport scenery fingerprints', () => {
  assert.equal(
    textureCacheKey('YPPH-fingerprint', 'Resources/default scenery/shared.dds'),
    textureCacheKey('EGLL-fingerprint', 'Resources/default scenery/shared.dds')
  );
});

test('tracks unresolved apt.dat markings by code even before their stock line resolves', () => {
  assert.equal(
    xPlaneTextureDefinitionKey({
      sourceType: 'xplane-apt-painted-marking',
      markingCode: 54,
      sourceDefinition: '',
    }),
    'apt-marking:54'
  );
});
