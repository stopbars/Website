/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-index-maps -- Render-bundle indexing preserves descriptor order and explicit source-to-output mapping. */

import { loadMsfsSceneryFolder } from './msfs-package-loader.js';
import { findMatchingMsfsTextureEntry } from './msfs-texture-files.js';

export async function buildMsfsRenderSource(entries, options = {}) {
  const decoded = await loadMsfsSceneryFolder(entries, options);
  const groups = decoded.groups.map((group) => ({
    ...group,
    mercatorBounds: renderGroupBounds(group),
    flipV: 0,
    markingEmphasis: 0,
    textureLodBias: 0,
    sourceOpacity: Number(group.sourceOpacity ?? 1),
  }));
  assertUniqueGroupIds(groups);

  const textures = [];
  for (const [pattern, file] of decoded.textureFiles) {
    const matchingGroup = groups.find((group) => group.pattern === pattern);
    const matchingEntry = findMatchingMsfsTextureEntry(entries, file);
    textures.push({
      pattern,
      file,
      path: matchingEntry?.path || '',
      wrap: matchingGroup?.wrap !== false,
      lineTexture: Boolean(matchingGroup?.lineTexture),
      tint: matchingGroup?.sourceTint || null,
      lineLayout: matchingGroup?.msfsLineLayout || null,
      source: 'package',
    });
  }
  const installed = new Set(textures.map((texture) => texture.pattern));
  for (const group of groups) {
    if (installed.has(group.pattern)) continue;
    const image = fallbackForGroup(group);
    if (!image) continue;
    installed.add(group.pattern);
    textures.push({
      pattern: group.pattern,
      image,
      wrap: group.wrap !== false,
      lineTexture: Boolean(group.lineTexture),
      source: 'fallback',
    });
  }

  const diagnostics = {
    counts: decoded.counts,
    unresolvedModels: decoded.unresolvedModels,
    unresolvedTextures: decoded.unresolvedTextures,
    apronMaterials: decoded.apronMaterialLibrary,
    paintedLines: decoded.paintedLineDiagnostics,
    packageLayout: decoded.layoutDiagnostics,
    projectedMeshBasis: decoded.projectedMeshBasis,
  };
  return {
    referenceFeatures: collectReferenceFeatures(decoded),
    runways: decoded.runways,
    diagnostics,
    renderBundle: { version: 1, groups, textures, diagnostics },
  };
}

function renderGroupBounds(group) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const originX = Number(group.origin?.[0]) || 0;
  const originY = Number(group.origin?.[1]) || 0;
  for (let index = 0; index + 1 < (group.vertices?.length ?? 0); index += 4) {
    const x = originX + Number(group.vertices[index]);
    const y = originY + Number(group.vertices[index + 1]);
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  return bounds.every(Number.isFinite) ? bounds : null;
}

export function renderBundleTransferables(bundle) {
  return (bundle?.groups || [])
    .map((group) => group.vertices?.buffer)
    .filter((buffer, index, buffers) => buffer && buffers.indexOf(buffer) === index);
}

export function assertUniqueGroupIds(groups) {
  const ids = new Set();
  for (const group of groups || []) {
    const id = group.id ?? group.pattern;
    if (ids.has(id)) throw new Error(`Duplicate render-group id: ${id}`);
    ids.add(id);
  }
}

function collectReferenceFeatures(decoded) {
  return [
    decoded.apronBoundaries,
    decoded.paintedLines,
    decoded.lightRows,
    decoded.lightPoints,
    decoded.namedObjects,
    decoded.libraryObjects,
    decoded.modelBounds,
  ].flatMap((collection) => collection?.features || []);
}

function fallbackForGroup(group) {
  const color = (group.sourceTint || [0.28, 0.3, 0.31])
    .slice(0, 3)
    .map((value) => Math.round(Math.max(0, Math.min(1, Number(value))) * 255));
  if (
    group.renderPass === 'taxiway-base' ||
    group.fallbackRenderMode === 'visible-solid-evidence'
  ) {
    return pavementTexture(color, `${group.meshGuid}|${group.apronUvMode}|${group.taxiwaySurface}`);
  }
  if (group.fallbackRenderMode === 'visible-solid-detail-fill') return solidTexture(color);
  if (group.unresolvedMaterial) return solidTexture([0, 0, 0], 0);
  return null;
}

function solidTexture(color, alpha = 255) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([...color, alpha]) };
}

function pavementTexture(color, seedValue) {
  const width = 64;
  const height = 64;
  const data = new Uint8ClampedArray(width * height * 4);
  let state = stableSeed(seedValue);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const variation =
        ((state >>> 24) / 255 - 0.5) * 10 + (Math.sin(x * 0.23) + Math.cos(y * 0.19)) * 1.5;
      const offset = (y * width + x) * 4;
      data[offset] = clamp(color[0] + variation);
      data[offset + 1] = clamp(color[1] + variation);
      data[offset + 2] = clamp(color[2] + variation);
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const character of String(value || 'msfs-pavement')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}
