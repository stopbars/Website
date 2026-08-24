/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-flatmap-filter -- Session persistence keeps normalization, filtering, and projection stages explicit at the storage boundary. */

import { EDITOR_STORAGE_VERSION, normalizeDocument } from './editor-model.js';
import {
  createTextureEntryIndex,
  findTextureEntry,
  normalizeTexturePath,
} from './texture-assets.js';
import { normalizeReferenceScene } from './reference-scene.js';

const DATABASE_NAME = 'bars-contribution-editor';
const DATABASE_VERSION = 3;
const STORE_NAME = 'drafts';
const TEXTURE_STORE_NAME = 'textures';
const TEXTURE_DEFINITION_STORE_NAME = 'xplane-texture-definitions';
const MAX_LOCAL_REFERENCE_BYTES = 3 * 1024 * 1024;
const MAX_TEXTURE_CACHE_BYTES = 384 * 1024 * 1024;
const MAX_TEXTURE_SOURCE_BYTES = 16 * 1024 * 1024;
const MEMORY_SESSIONS = new Map();
const MEMORY_DRAFTS = new Map();
const MEMORY_REFERENCES = new Map();
const MEMORY_WORKSPACES = new Map();
let databasePromise;

export function setEditorSession(key, value) {
  MEMORY_SESSIONS.set(normalizeKey(key), normalizeSession(value));
}

export function getEditorSession(key) {
  return normalizeSession(MEMORY_SESSIONS.get(normalizeKey(key)) ?? null);
}

export function clearEditorSession(key) {
  MEMORY_SESSIONS.delete(normalizeKey(key));
}

export function editorSessionNeedsHydration(session) {
  return !session?.document || !session?.referenceScene;
}

export async function saveEditorDraft(document) {
  const normalized = normalizeDocument(document);
  const record = {
    key: documentKey(normalized.icao, normalized.simulator),
    version: EDITOR_STORAGE_VERSION,
    document: normalized,
    savedAt: new Date().toISOString(),
  };
  MEMORY_DRAFTS.set(record.key, record);
  writeLocalRecord(record.key, record);
  const database = await openDatabase();
  if (database) await putDatabaseRecord(database, record);
  return record;
}

export async function loadEditorDraft(icao, simulator) {
  const key = documentKey(icao, simulator);
  const immediate = loadEditorDraftImmediate(icao, simulator);
  if (immediate) return immediate;
  const database = await openDatabase();
  const record = database ? await getDatabaseRecord(database, key) : null;
  if (!record || record.version !== EDITOR_STORAGE_VERSION) return null;
  return { ...record, document: normalizeDocument(record.document) };
}

export function loadEditorDraftImmediate(icao, simulator) {
  const key = documentKey(icao, simulator);
  const record = readLocalRecord(key) ?? MEMORY_DRAFTS.get(key);
  if (record?.version !== EDITOR_STORAGE_VERSION) return null;
  return { ...record, document: normalizeDocument(record.document) };
}

export async function clearEditorDraft(icao, simulator) {
  const key = documentKey(icao, simulator);
  MEMORY_DRAFTS.delete(key);
  removeLocalRecord(key);
  const database = await openDatabase();
  if (database) await deleteDatabaseRecord(database, key);
}

export async function saveEditorWorkspace(icao, simulator, workspace) {
  const record = {
    key: workspaceKey(icao, simulator),
    version: EDITOR_STORAGE_VERSION,
    workspace: normalizeWorkspace(workspace),
    savedAt: new Date().toISOString(),
  };
  MEMORY_WORKSPACES.set(record.key, record);
  writeLocalRecord(record.key, record);
  const database = await openDatabase();
  if (database) await putDatabaseRecord(database, record);
  return record;
}

export function loadEditorWorkspaceImmediate(icao, simulator) {
  const key = workspaceKey(icao, simulator);
  const record = readLocalRecord(key) ?? MEMORY_WORKSPACES.get(key);
  if (record?.version !== EDITOR_STORAGE_VERSION) return null;
  return { ...record, workspace: normalizeWorkspace(record.workspace) };
}

export async function saveReferenceScene(icao, simulator, scene, sourceName, fingerprint) {
  const database = await openDatabase();
  const record = {
    key: referenceKey(icao, simulator),
    version: EDITOR_STORAGE_VERSION,
    scene: normalizeReferenceScene(scene),
    sourceName: String(sourceName ?? ''),
    fingerprint: String(fingerprint ?? ''),
    savedAt: new Date().toISOString(),
  };
  MEMORY_REFERENCES.set(record.key, record);
  const serialized = JSON.stringify(record);
  if (serialized.length <= MAX_LOCAL_REFERENCE_BYTES) writeLocalRecord(record.key, record);
  if (database) await putDatabaseRecord(database, record);
  return record;
}

export async function loadReferenceScene(icao, simulator) {
  const key = referenceKey(icao, simulator);
  const immediate = loadReferenceSceneImmediate(icao, simulator);
  if (immediate) return immediate;
  const database = await openDatabase();
  const record = database ? await getDatabaseRecord(database, key) : null;
  return record?.version === EDITOR_STORAGE_VERSION ? normalizeReferenceRecord(record) : null;
}

export function loadReferenceSceneImmediate(icao, simulator) {
  const key = referenceKey(icao, simulator);
  const record = readLocalRecord(key) ?? MEMORY_REFERENCES.get(key);
  return record?.version === EDITOR_STORAGE_VERSION ? normalizeReferenceRecord(record) : null;
}

function normalizeReferenceRecord(record) {
  const scene = normalizeReferenceScene(record?.scene);
  return scene === record?.scene ? record : { ...record, scene };
}

function normalizeSession(session) {
  if (!session?.referenceScene) return session;
  const referenceScene = normalizeReferenceScene(session.referenceScene);
  return referenceScene === session.referenceScene ? session : { ...session, referenceScene };
}

export async function cacheReferenceTextures(fingerprint, scene, entries) {
  const normalizedFingerprint = String(fingerprint ?? '');
  const database = await openDatabase();
  if (!database) return { cached: 0, bytes: 0, paths: [] };
  await cacheTextureDefinitions(database, scene);
  const referencedPaths = new Set(
    (scene?.features ?? [])
      .map((feature) => normalizeTexturePath(feature.properties?.textureAssetPath))
      .filter(Boolean)
  );
  if (referencedPaths.size === 0) return { cached: 0, bytes: 0, paths: [] };
  const entryIndex = createTextureEntryIndex(entries);
  const recordsByPath = new Map();
  for (const path of referencedPaths) {
    const entry = findTextureEntry(entryIndex, path);
    const eligible =
      entry?.file && Number(entry.size ?? entry.file.size) <= MAX_TEXTURE_SOURCE_BYTES;
    if (!eligible) continue;
    recordsByPath.set(path, {
      key: textureCacheKey(normalizedFingerprint, path),
      fingerprint: normalizedFingerprint,
      path,
      blob: entry.file,
      size: Number(entry.size ?? entry.file.size) || 0,
      lastAccess: Date.now(),
    });
  }
  const records = [...recordsByPath.values()];
  if (records.length === 0) return { cached: 0, bytes: 0, paths: [] };
  try {
    const transaction = database.transaction(TEXTURE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TEXTURE_STORE_NAME);
    for (const record of records) store.put(record);
    await transactionPromise(transaction);
    await pruneTextureCache(database);
    return {
      cached: records.length,
      bytes: records.reduce((total, record) => total + record.size, 0),
      paths: records.map((record) => record.path),
    };
  } catch {
    return { cached: 0, bytes: 0, paths: [] };
  }
}

export async function loadReferenceTextures(fingerprint, paths) {
  const normalizedFingerprint = String(fingerprint ?? '');
  const normalizedPaths = [...new Set((paths ?? []).map(normalizeTexturePath).filter(Boolean))];
  if (normalizedPaths.length === 0) return new Map();
  const database = await openDatabase();
  if (!database) return new Map();
  try {
    const transaction = database.transaction(TEXTURE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TEXTURE_STORE_NAME);
    const globalRecords = await Promise.all(
      normalizedPaths.map((path) =>
        requestPromise(store.get(textureCacheKey(normalizedFingerprint, path)))
      )
    );
    const globalByPath = new Map(
      globalRecords.filter((record) => record?.blob).map((record) => [record.path, record])
    );
    const missingPaths = normalizedPaths.filter((path) => !globalByPath.has(path));
    const legacyRecords =
      normalizedFingerprint && missingPaths.length > 0
        ? await Promise.all(
            missingPaths.map((path) =>
              requestPromise(store.get(legacyTextureCacheKey(normalizedFingerprint, path)))
            )
          )
        : [];
    const records = [...globalByPath.values(), ...legacyRecords.filter((record) => record?.blob)];
    const available = records.filter((record) => record?.blob);
    if (available.length > 0) {
      const touchedAt = Date.now();
      const writeTransaction = database.transaction(TEXTURE_STORE_NAME, 'readwrite');
      const writeStore = writeTransaction.objectStore(TEXTURE_STORE_NAME);
      for (const record of available) {
        writeStore.put({
          ...record,
          key: textureCacheKey('', record.path),
          lastAccess: touchedAt,
        });
      }
      await transactionPromise(writeTransaction);
    }
    return new Map(available.map((record) => [record.path, record]));
  } catch {
    return new Map();
  }
}

export async function requestPersistentEditorStorage() {
  try {
    return Boolean(await globalThis.navigator?.storage?.persist?.());
  } catch {
    return false;
  }
}

export async function hydrateReferenceTextureDefinitions(scene) {
  const features = scene?.features ?? [];
  const definitions = [
    ...new Set(
      features
        .filter((feature) => isCacheableXPlaneDefinition(feature.properties))
        .filter((feature) => feature.properties?.textureDefinitionResolved !== true)
        .map((feature) => xPlaneTextureDefinitionKey(feature.properties))
        .filter(Boolean)
    ),
  ];
  if (definitions.length === 0) return { scene, resolvedDefinitions: 0 };
  const database = await openDatabase();
  if (!database) return { scene, resolvedDefinitions: 0 };
  try {
    const transaction = database.transaction(TEXTURE_DEFINITION_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TEXTURE_DEFINITION_STORE_NAME);
    const records = await Promise.all(
      definitions.map((definition) => requestPromise(store.get(definition)))
    );
    const cached = new Map(
      records
        .filter((record) => record?.properties)
        .map((record) => [record.key, record.properties])
    );
    const missingAptDefinitions = definitions.filter(
      (definition) => definition.startsWith('apt-marking:') && !cached.has(definition)
    );
    if (missingAptDefinitions.length > 0) {
      const legacyRecords = await requestPromise(store.getAll());
      for (const definition of missingAptDefinitions) {
        const markingCode = Number(definition.slice('apt-marking:'.length));
        const legacy = legacyRecords.find(
          (record) => record?.properties && stockAptDefinitionCode(record.key) === markingCode
        );
        if (legacy) cached.set(definition, legacy.properties);
      }
    }
    if (cached.size === 0) return { scene, resolvedDefinitions: 0 };
    return {
      scene: {
        ...scene,
        features: features.map((feature) => {
          const definition = xPlaneTextureDefinitionKey(feature.properties);
          const properties = cached.get(definition);
          if (!properties || feature.properties?.textureDefinitionResolved === true) return feature;
          return {
            ...feature,
            properties: {
              ...feature.properties,
              ...properties,
              renderPattern:
                feature.geometry?.type === 'LineString' && properties.texturePattern
                  ? properties.texturePattern
                  : feature.properties?.renderPattern,
            },
          };
        }),
      },
      resolvedDefinitions: cached.size,
    };
  } catch {
    return { scene, resolvedDefinitions: 0 };
  }
}

export function textureCacheKey(_fingerprint, path) {
  return `global:${normalizeTexturePath(path)}`;
}

export function documentKey(icao, simulator) {
  return `${EDITOR_STORAGE_VERSION}:${String(icao).toUpperCase()}:${simulator}`;
}

function referenceKey(icao, simulator) {
  return `${EDITOR_STORAGE_VERSION}:reference:${String(icao).toUpperCase()}:${simulator}`;
}

function workspaceKey(icao, simulator) {
  return `${EDITOR_STORAGE_VERSION}:workspace:${String(icao).toUpperCase()}:${simulator}`;
}

function normalizeWorkspace(workspace = {}) {
  const viewport = workspace.viewport ?? {};
  const normalizedViewport =
    Number.isFinite(viewport.longitude) &&
    Number.isFinite(viewport.latitude) &&
    Number.isFinite(viewport.zoom)
      ? {
          longitude: viewport.longitude,
          latitude: viewport.latitude,
          zoom: viewport.zoom,
          bearing: Number.isFinite(viewport.bearing) ? viewport.bearing : 0,
          pitch: Number.isFinite(viewport.pitch) ? viewport.pitch : 0,
        }
      : null;
  return {
    selectedId: typeof workspace.selectedId === 'string' ? workspace.selectedId : null,
    tool: typeof workspace.tool === 'string' ? workspace.tool : 'select',
    visibleCategories: Array.isArray(workspace.visibleCategories)
      ? workspace.visibleCategories.map(String)
      : [],
    divisionGhostsVisible: Boolean(workspace.divisionGhostsVisible),
    editorObjectsVisible: workspace.editorObjectsVisible !== false,
    snapEnabled: workspace.snapEnabled !== false,
    validationOpen: Boolean(workspace.validationOpen),
    rightPanel: workspace.rightPanel === 'object' ? 'object' : 'scenery',
    uniqueObjectColors: Boolean(workspace.uniqueObjectColors),
    advancedOpen: Boolean(workspace.advancedOpen),
    viewport: normalizedViewport,
  };
}

function normalizeKey(key) {
  return String(key ?? '').toUpperCase();
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  databasePromise ??= new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(TEXTURE_STORE_NAME)) {
        const store = database.createObjectStore(TEXTURE_STORE_NAME, { keyPath: 'key' });
        store.createIndex('lastAccess', 'lastAccess');
      }
      if (!database.objectStoreNames.contains(TEXTURE_DEFINITION_STORE_NAME)) {
        database.createObjectStore(TEXTURE_DEFINITION_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = undefined;
      resolve(null);
    };
    request.onblocked = () => {
      databasePromise = undefined;
      resolve(null);
    };
  });
  return databasePromise;
}

async function cacheTextureDefinitions(database, scene) {
  const records = new Map();
  for (const feature of scene?.features ?? []) {
    const properties = feature.properties ?? {};
    if (!isCacheableXPlaneDefinition(properties) || properties.textureDefinitionResolved !== true) {
      continue;
    }
    const key = xPlaneTextureDefinitionKey(properties);
    records.set(key, {
      key,
      properties: textureDefinitionProperties(properties),
      lastAccess: Date.now(),
    });
  }
  if (records.size === 0) return;
  try {
    const transaction = database.transaction(TEXTURE_DEFINITION_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TEXTURE_DEFINITION_STORE_NAME);
    for (const record of records.values()) store.put(record);
    await transactionPromise(transaction);
  } catch {
    // Texture blobs still remain useful when metadata persistence is unavailable.
  }
}

function isCacheableXPlaneDefinition(properties = {}) {
  return Boolean(xPlaneTextureDefinitionKey(properties));
}

export function xPlaneTextureDefinitionKey(properties = {}) {
  const sourceType = String(properties.sourceType || '');
  const markingCode = Number(properties.markingCode);
  if (
    sourceType === 'xplane-apt-painted-marking' &&
    Number.isInteger(markingCode) &&
    markingCode > 0
  ) {
    return `apt-marking:${markingCode}`;
  }
  return sourceType.startsWith('xplane-dsf-')
    ? normalizeTexturePath(properties.sourceDefinition)
    : '';
}

function stockAptDefinitionCode(value) {
  const name = normalizeTexturePath(value).split('/').at(-1) || '';
  const match = /^(\d+)_.*\.lin$/.exec(name);
  return match ? Number(match[1]) : null;
}

function textureDefinitionProperties(properties) {
  const keys = [
    'sourceAssetPath',
    'texture',
    'textureAssetPath',
    'texturePattern',
    'textureScale',
    'textureWidthMeters',
    'textureHeightMeters',
    'textureScaleX',
    'textureScaleY',
    'texturePixelWidth',
    'texturePixelHeight',
    'textureWrap',
    'textureNoAlpha',
    'lineTextureLayers',
    'mirrorTexture',
    'alignSegments',
    'startCaps',
    'endCaps',
    'layerGroup',
    'surface',
    'surfaceColor',
    'surfaceLabel',
    'surfaceOpacity',
    'textureDefinitionResolved',
  ];
  return Object.fromEntries(
    keys.filter((key) => properties[key] !== undefined).map((key) => [key, properties[key]])
  );
}

function legacyTextureCacheKey(fingerprint, path) {
  return `${String(fingerprint ?? '')}:${normalizeTexturePath(path)}`;
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function pruneTextureCache(database) {
  const transaction = database.transaction(TEXTURE_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(TEXTURE_STORE_NAME);
  const records = await requestPromise(store.getAll());
  let totalBytes = records.reduce((total, record) => total + (Number(record.size) || 0), 0);
  if (totalBytes > MAX_TEXTURE_CACHE_BYTES) {
    records.sort((left, right) => Number(left.lastAccess) - Number(right.lastAccess));
    for (const record of records) {
      if (totalBytes <= MAX_TEXTURE_CACHE_BYTES) break;
      store.delete(record.key);
      totalBytes -= Number(record.size) || 0;
    }
  }
  await transactionPromise(transaction);
}

async function putDatabaseRecord(database, record) {
  try {
    await requestPromise(
      database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record)
    );
  } catch {
    // The local mirror keeps compact editor drafts available when IndexedDB is blocked.
  }
}

async function getDatabaseRecord(database, key) {
  try {
    return await requestPromise(
      database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    );
  } catch {
    return null;
  }
}

async function deleteDatabaseRecord(database, key) {
  try {
    await requestPromise(
      database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key)
    );
  } catch {
    // A missing IndexedDB record is equivalent to a successful clear.
  }
}

function writeLocalRecord(key, record) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(record));
  } catch {
    // Private browsing and quota limits can disable the fallback.
  }
}

function readLocalRecord(key) {
  try {
    const stored = globalThis.localStorage?.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function removeLocalRecord(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Storage may be unavailable; there is nothing else to clear locally.
  }
}
