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
      fallbackImage: matchingGroup ? fallbackForGroup(matchingGroup) : null,
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

export function fallbackForGroup(group) {
  let color = (group.sourceTint || [0.28, 0.3, 0.31])
    .slice(0, 3)
    .map((value) => Math.round(Math.max(0, Math.min(1, Number(value))) * 255));
  if (group.fallbackAppearance === 'light-pavement') color = liftPavementColor(color);
  if (group.fallbackAppearance === 'dark-pavement') color = limitPavementColor(color, 105);
  if (group.fallbackAppearance === 'dark-pavement-line') color = limitPavementColor(color, 75);
  if (group.fallbackAppearance === 'light-border-dark-fill') return insetTexture(color);
  if (
    group.renderPass === 'taxiway-base' ||
    group.fallbackRenderMode === 'visible-solid-evidence'
  ) {
    return solidTexture(color);
  }
  if (group.fallbackRenderMode === 'visible-solid-detail-fill') return solidTexture(color);
  if (group.unresolvedMaterial) return solidTexture([0, 0, 0], 0);
  return null;
}

function liftPavementColor(color) {
  const luminance = colorLuminance(color);
  const target = (luminance + 190) / 2;
  const scale = target / Math.max(luminance, 1);
  return color.map((component) => Math.min(255, Math.round(component * scale)));
}

function limitPavementColor(color, maximumLuminance) {
  const luminance = colorLuminance(color);
  if (luminance <= maximumLuminance) return color;
  const scale = maximumLuminance / luminance;
  return color.map((component) => Math.round(component * scale));
}

function colorLuminance(color) {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}

function insetTexture(fillColor) {
  const width = 16;
  const data = new Uint8ClampedArray(width * width * 4);
  const borderColor = liftPavementColor(fillColor);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = x < 3 || y < 3 || x >= width - 3 || y >= width - 3 ? borderColor : fillColor;
      data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { width, height: width, data };
}

function solidTexture(color, alpha = 255) {
  return { width: 1, height: 1, data: new Uint8ClampedArray([...color, alpha]) };
}
