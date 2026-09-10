import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearEditorSession,
  clearEditorDraft,
  editorSessionNeedsHydration,
  editorSessionKey,
  getEditorSession,
  documentKey,
  loadEditorDraft,
  loadEditorDraftImmediate,
  loadPreferredEditorDraft,
  loadEditorWorkspaceImmediate,
  loadReferenceScene,
  saveEditorDraft,
  saveEditorWorkspace,
  saveReferenceScene,
  setEditorSession,
  preferredEditorRecord,
  textureCacheKey,
  xPlaneTextureDefinitionKey,
} from './editor-session.js';

function createMemoryStorage() {
  const records = new Map();
  return {
    getItem: (key) => records.get(String(key)) ?? null,
    removeItem: (key) => records.delete(String(key)),
    setItem: (key, value) => records.set(String(key), String(value)),
  };
}

test('keeps an ephemeral render bundle readable across Strict Mode render retries', () => {
  const session = {
    document: { simulator: 'msfs' },
    referenceScene: { version: 2, simulator: 'msfs', features: [] },
    renderBundle: { version: 1, groups: [{ id: 'surface' }], textures: [] },
    removalContext: { version: 1, lightRows: [{ id: 'source-row' }] },
  };
  setEditorSession('YSTRICT', session);

  assert.equal(getEditorSession('YSTRICT').renderBundle.groups[0].id, 'surface');
  assert.equal(getEditorSession('YSTRICT').removalContext.lightRows[0].id, 'source-row');
  assert.equal(getEditorSession('YSTRICT').renderBundle.groups[0].id, 'surface');
  clearEditorSession('YSTRICT');
  assert.equal(getEditorSession('YSTRICT'), null);
});

test('keeps MSFS and X-Plane handoff sessions separate for the same airport', () => {
  const msfsKey = editorSessionKey('yhandoff', 'msfs');
  const xplaneKey = editorSessionKey('YHANDOFF', 'xplane');
  setEditorSession(msfsKey, { document: { simulator: 'msfs' } });
  setEditorSession(xplaneKey, { document: { simulator: 'xplane' } });

  assert.equal(msfsKey, 'YHANDOFF:msfs');
  assert.equal(getEditorSession(msfsKey).document.simulator, 'msfs');
  assert.equal(getEditorSession(xplaneKey).document.simulator, 'xplane');

  clearEditorSession(msfsKey);
  clearEditorSession(xplaneKey);
});

test('hydrates IndexedDB when only the compact draft restored synchronously', () => {
  assert.equal(editorSessionNeedsHydration(null), true);
  assert.equal(editorSessionNeedsHydration({ document: {} }), true);
  assert.equal(editorSessionNeedsHydration({ referenceScene: {} }), true);
  assert.equal(editorSessionNeedsHydration({ document: {}, referenceScene: {} }), false);
  assert.equal(
    editorSessionNeedsHydration({
      document: {},
      referenceScene: {},
      requiresPersistentHydration: true,
    }),
    true
  );
});

test('removes an older compact fallback when a replacement draft is too large', async (t) => {
  const originalLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  const base = { icao: 'YLARGE', simulator: 'xplane', altitude: 20 };
  await saveEditorDraft({
    ...base,
    objects: [{ id: 'OLD', coordinates: [[151, -34], [151.001, -34.001]] }],
  });
  assert.notEqual(storage.getItem(documentKey(base.icao, base.simulator)), null);

  await saveEditorDraft({
    ...base,
    objects: Array.from({ length: 1001 }, (_, index) => ({
      id: `NEW_${index}`,
      coordinates: [[151, -34], [151.001, -34.001]],
    })),
  });

  assert.equal(storage.getItem(documentKey(base.icao, base.simulator)), null);
  assert.equal(loadEditorDraftImmediate(base.icao, base.simulator).document.objects[0].id, 'NEW_0');
  await clearEditorDraft(base.icao, base.simulator);
});

test('rejects a fallback stored under the wrong airport key', (t) => {
  const originalLocalStorage = globalThis.localStorage;
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  t.after(() => {
    globalThis.localStorage = originalLocalStorage;
  });

  const key = documentKey('YSSY', 'xplane');
  storage.setItem(
    key,
    JSON.stringify({
      key,
      version: 'bars-contribution-editor/v1',
      savedAt: '2026-08-31T00:00:00.000Z',
      document: {
        icao: 'YSWS',
        simulator: 'xplane',
        altitude: 20,
        objects: [{ id: 'WRONG_AIRPORT', coordinates: [[150, -33], [150.001, -33.001]] }],
      },
    })
  );

  assert.equal(loadEditorDraftImmediate('YSSY', 'xplane'), null);
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
    removals: [
      {
        id: 'remove:one',
        origin: 'xplane-source',
        sourceIds: ['source-row'],
        coordinates: [
          [115.96, -31.95],
          [115.961, -31.95],
          [115.961, -31.951],
          [115.96, -31.95],
        ],
      },
    ],
  };

  await saveEditorDraft(document);
  const restored = await loadEditorDraft('YMEM', 'xplane');
  assert.equal(restored.document.objects[0].id, 'BARS_MEMORY');
  assert.deepEqual(restored.document.objects[0].coordinates, document.objects[0].coordinates);
  assert.equal(restored.document.removals[0].id, 'remove:one');
  assert.deepEqual(restored.document.removals[0].sourceIds, ['source-row']);

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

test('restores the simulator that was last active for an airport', async () => {
  await saveEditorDraft({
    icao: 'YACT',
    simulator: 'xplane',
    altitude: 20,
    objects: [{ id: 'XPLANE_DRAFT', coordinates: [[115.96, -31.95]] }],
  });
  await saveEditorDraft({
    icao: 'YACT',
    simulator: 'msfs',
    altitude: 20,
    objects: [{ id: 'MSFS_DRAFT', coordinates: [[115.97, -31.96]] }],
  });

  const restored = await loadPreferredEditorDraft('YACT');
  assert.equal(restored.document.simulator, 'msfs');
  assert.equal(restored.document.objects[0].id, 'MSFS_DRAFT');

  await clearEditorDraft('YACT', 'xplane');
  await clearEditorDraft('YACT', 'msfs');
});

test('falls back to the draft with the latest content change', () => {
  const xplane = {
    savedAt: '2026-08-29T12:00:00.000Z',
    document: { simulator: 'xplane', updatedAt: '2026-08-29T10:00:00.000Z' },
  };
  const msfs = {
    savedAt: '2026-08-29T11:00:00.000Z',
    document: { simulator: 'msfs', updatedAt: '2026-08-29T10:30:00.000Z' },
  };

  assert.equal(preferredEditorRecord([xplane, msfs], null), msfs);
});

test('restores the editor workspace without persisting undo history', async () => {
  await saveEditorWorkspace('YWSP', 'xplane', {
    selectedId: 'part:BARS_ONE',
    tool: 'split',
    visibleCategories: ['runways', 'light-rows'],
    satelliteVisible: true,
    divisionGhostsVisible: true,
    editorObjectsVisible: false,
    snapEnabled: false,
    validationOpen: true,
    rightPanel: 'object',
    uniqueObjectColors: true,
    advancedOpen: true,
    viewport: { longitude: 115.96, latitude: -31.95, zoom: 18, bearing: 0, pitch: 0 },
    past: [{ shouldNotPersist: true }],
  });

  const restored = loadEditorWorkspaceImmediate('YWSP', 'xplane').workspace;
  assert.equal(restored.selectedId, 'part:BARS_ONE');
  assert.equal(restored.tool, 'split');
  assert.deepEqual(restored.visibleCategories, ['runways', 'light-rows']);
  assert.equal(restored.satelliteVisible, true);
  assert.equal(restored.divisionGhostsVisible, true);
  assert.equal(restored.editorObjectsVisible, false);
  assert.equal(restored.snapEnabled, false);
  assert.equal(restored.validationOpen, true);
  assert.equal(restored.rightPanel, 'object');
  assert.equal(restored.uniqueObjectColors, true);
  assert.equal(restored.advancedOpen, true);
  assert.deepEqual(restored.viewport, {
    longitude: 115.96,
    latitude: -31.95,
    zoom: 18,
    bearing: 0,
    pitch: 0,
  });
  assert.equal('past' in restored, false);
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
