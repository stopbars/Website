/* oxlint-disable react-doctor/async-await-in-loop react-doctor/js-combine-iterations react-doctor/js-tosorted-immutable react-doctor/js-flatmap-filter react-doctor/js-length-check-first -- Package reads stay ordered to bound browser memory and preserve source precedence; staged transforms remain auditable and the supported test runtime lacks toSorted. */

import { ZSTDDecoder } from './vendor/zstd/zstddec.mjs';
import { decodeDdsOrBc7Texture, decodeKtx2Texture } from './msfs-texture.js';
import { mercatorTextureGroups } from '../contribution-editor/xplane-mercator-geometry.js';

const EARTH_RADIUS = 6_378_137;
const WGS84_ECCENTRICITY_SQUARED = 6.69437999014e-3;
const MSFS_PROJECTED_MESH_NORTH_METERS_PER_DEGREE = 111_150;
const MAX_AIRPORT_BYTES = 64 * 1024 * 1024;
const PROJECTED_MESH_PLANAR_BASES = [
  { label: 'x-east-negative-z-north', eastX: 1, eastZ: 0, northX: 0, northZ: -1, northSign: -1 },
  { label: 'x-east-positive-z-north', eastX: 1, eastZ: 0, northX: 0, northZ: 1, northSign: 1 },
  { label: 'negative-x-east-negative-z-north', eastX: -1, eastZ: 0, northX: 0, northZ: -1 },
  { label: 'negative-x-east-positive-z-north', eastX: -1, eastZ: 0, northX: 0, northZ: 1 },
  { label: 'z-east-negative-x-north', eastX: 0, eastZ: 1, northX: -1, northZ: 0 },
  { label: 'z-east-positive-x-north', eastX: 0, eastZ: 1, northX: 1, northZ: 0 },
  { label: 'negative-z-east-negative-x-north', eastX: 0, eastZ: -1, northX: -1, northZ: 0 },
  { label: 'negative-z-east-positive-x-north', eastX: 0, eastZ: -1, northX: 1, northZ: 0 },
];
const DEFAULT_PROJECTED_MESH_PLANAR_BASIS = PROJECTED_MESH_PLANAR_BASES[0];
const zstdDecoder = new ZSTDDecoder();
let zstdReady;

async function decompressZstd(bytes, expectedSize) {
  zstdReady ||= zstdDecoder.init();
  await zstdReady;
  return zstdDecoder.decode(bytes, expectedSize);
}

export async function loadMsfsSceneryFolder(
  files,
  {
    onProgress = () => {},
    projectedMeshNorthSignOverride = null,
    projectedMeshBasisOverride = null,
  } = {}
) {
  const started = performance.now();
  const entries = [...files].map((entry) => ({
    file: entry.file || entry,
    path: normalize(
      entry.path || entry.file?.webkitRelativePath || entry.webkitRelativePath || entry.name
    ),
  }));
  const layoutDiagnostics = await inspectPackageLayout(entries);
  const bglEntries = entries.filter((entry) => entry.path.toLowerCase().endsWith('.bgl'));
  // Model-library sections are a BGL capability, not a filename contract. Prefer conventional
  // modelLib names for speed, then inspect every remaining BGL so third-party naming still works.
  const modelLibraries = [...bglEntries].sort((left, right) => {
    const leftNamed = /modellib\.bgl$/i.test(left.path) ? 0 : 1;
    const rightNamed = /modellib\.bgl$/i.test(right.path) ? 0 : 1;
    return leftNamed - rightNamed || left.file.size - right.file.size;
  });
  const airportCandidates = bglEntries
    .filter((entry) => !/modellib\.bgl$/i.test(entry.path) && entry.file.size <= MAX_AIRPORT_BYTES)
    .sort((left, right) => {
      const leftWorld = /\/world\/scenery\//i.test(`/${left.path}/`) ? 0 : 1;
      const rightWorld = /\/world\/scenery\//i.test(`/${right.path}/`) ? 0 : 1;
      return leftWorld - rightWorld || left.file.size - right.file.size;
    });
  if (!airportCandidates.length)
    throw new Error('No plausible airport BGL was found in this folder.');
  onProgress(0.04, 'Finding airport records', `${airportCandidates.length} BGL candidate(s)`);
  const airportParts = [];
  for (const [index, entry] of airportCandidates.entries()) {
    const buffer = await entry.file.arrayBuffer();
    const decoded = decodeAirportBgl(buffer, entry.path);
    if (decoded.airports > 0) {
      airportParts.push({ entry, decoded });
    }
    onProgress(
      0.04 + ((index + 1) / airportCandidates.length) * 0.08,
      'Finding airport records',
      entry.path
    );
  }
  if (!airportParts.length)
    throw new Error(
      'The selected folder contains BGLs, but no supported airport record was found.'
    );
  const airportData = mergeAirportData(airportParts.map((part) => part.decoded));

  onProgress(0.13, 'Reading material libraries', 'Resolving apron material GUIDs');
  const apronMaterialLibrary = await loadApronMaterialLibraries(entries);
  const paintedLineMaterials = annotatePaintedLineMaterials(
    airportData.paintedLines,
    apronMaterialLibrary
  );
  const projectedMeshDrawOrderDiagnostics = summarizeProjectedMeshDrawOrder(
    airportData.projectedMeshes
  );
  const lightPoints = buildLightPoints(airportData.lightRows);
  const lightPointDiagnostics = summarizeLightPoints(airportData.lightRows, lightPoints);

  const requestedGuids = new Set(
    airportData.projectedMeshes.map((placement) => placement.meshGuid.toLowerCase())
  );
  onProgress(0.15, 'Indexing model libraries', `${requestedGuids.size} projected-mesh GUID(s)`);
  const modelRecords = new Map();
  if (requestedGuids.size > 0) {
    for (const [index, entry] of modelLibraries.entries()) {
      const indexRecords = await readModelLibraryIndex(entry.file);
      for (const [guid, record] of indexRecords) {
        if (requestedGuids.has(guid) && !modelRecords.has(guid)) {
          modelRecords.set(guid, { ...record, entry });
        }
      }
      onProgress(
        0.15 + ((index + 1) / modelLibraries.length) * 0.12,
        'Indexing model libraries',
        `${index + 1}/${modelLibraries.length}: ${entry.file.name}`
      );
    }
  }

  const textureIndex = indexTextureFiles(entries);
  const groups = [];
  const taxiwaySurfaceRender = buildTaxiwaySurfaceRenderGroups(airportData.taxiwayPaths);
  groups.push(...taxiwaySurfaceRender.groups);
  const apronRender = buildApronRenderGroups(airportData.apronMeshes, apronMaterialLibrary);
  attachApronFallbackDiagnostics(airportData.apronBoundaries, apronRender.groups);
  groups.push(...apronRender.groups);
  const paintedLineRender = await buildPaintedLineRenderGroups(
    airportData.paintedLines,
    apronMaterialLibrary
  );
  groups.push(...paintedLineRender.groups);
  paintedLineMaterials.exactTexturedFeatures = paintedLineRender.featureCount;
  paintedLineMaterials.exactTextureGroups = paintedLineRender.groups.length;
  paintedLineMaterials.atlasLayouts = paintedLineRender.layoutCounts;
  paintedLineMaterials.layoutOverrides = paintedLineRender.layoutOverrides;
  paintedLineMaterials.textureCoverageByMaterial = Object.values(
    airportData.paintedLines.features.reduce((coverage, feature) => {
      const materialName = feature.properties?.materialName || 'unresolved';
      coverage[materialName] ||= { materialName, records: 0, exactTextured: 0 };
      coverage[materialName].records += 1;
      if (feature.properties?.exactTextureRendered) coverage[materialName].exactTextured += 1;
      return coverage;
    }, {})
  ).sort(
    (first, second) =>
      second.records - first.records || first.materialName.localeCompare(second.materialName)
  );
  paintedLineMaterials.textureCoverageByMaterialLineType = Object.values(
    airportData.paintedLines.features.reduce((coverage, feature) => {
      const materialName = feature.properties?.materialName || 'unresolved';
      const lineTypeLabel = feature.properties?.lineTypeLabel || 'UNKNOWN';
      const key = `${materialName}|${lineTypeLabel}`;
      coverage[key] ||= { materialName, lineTypeLabel, records: 0, exactTextured: 0 };
      coverage[key].records += 1;
      if (feature.properties?.exactTextureRendered) coverage[key].exactTextured += 1;
      return coverage;
    }, {})
  ).sort(
    (first, second) =>
      second.records - first.records ||
      first.materialName.localeCompare(second.materialName) ||
      first.lineTypeLabel.localeCompare(second.lineTypeLabel)
  );
  const modelBoundsFeatures = [];
  const requestedTextures = new Map();
  const resolvedModels = [];
  const unresolvedModels = [];
  const projectedMeshReferenceBounds = airportReferenceBounds(airportData);
  const decodedProjectedModels = [];
  for (const [placementIndex, placement] of airportData.projectedMeshes.entries()) {
    const record = modelRecords.get(placement.meshGuid.toLowerCase());
    if (!record) {
      unresolvedModels.push(placement.meshGuid);
      continue;
    }
    const recordBuffer = await record.entry.file
      .slice(record.offset, record.offset + record.size)
      .arrayBuffer();
    const model = await parseModelRecord(recordBuffer, placement.meshGuid);
    decodedProjectedModels.push({ placementIndex, placement, model });
    resolvedModels.push({
      guid: placement.meshGuid,
      name: model.name || '',
      glbs: model.glbs.length,
    });
  }
  const inferredProjectedMeshBasis = selectProjectedMeshBasisFromModels(
    decodedProjectedModels,
    projectedMeshReferenceBounds,
    groups.length,
    airportData
  );
  // MSFS projected-mesh GLBs use the glTF plane directly: +X is local east, +Y is up and
  // -Z is local north before the compiled SceneryObject heading is applied. Airport-envelope
  // overlap is useful diagnostic evidence, but cannot redefine those authored model axes: a
  // dense apron boundary can otherwise outvote the exact runway and mirror the whole package.
  const compiledProjectedMeshBasis = {
    ...DEFAULT_PROJECTED_MESH_PLANAR_BASIS,
    basis: 'compiled-projected-mesh-gltf-axis-contract',
    diagnosticInferredBasis: inferredProjectedMeshBasis,
  };
  const explicitBasis = PROJECTED_MESH_PLANAR_BASES.find(
    (candidate) => candidate.label === projectedMeshBasisOverride
  );
  const overrideNorthSign = Number(projectedMeshNorthSignOverride);
  const projectedMeshBasis = explicitBasis
    ? {
        ...compiledProjectedMeshBasis,
        ...explicitBasis,
        basis: 'diagnostic-explicit-planar-basis-override',
        inferredBasis: inferredProjectedMeshBasis,
      }
    : [-1, 1].includes(overrideNorthSign)
      ? {
          ...compiledProjectedMeshBasis,
          ...PROJECTED_MESH_PLANAR_BASES.find((basis) => basis.northSign === overrideNorthSign),
          basis: 'diagnostic-explicit-north-sign-override',
          inferredBasis: inferredProjectedMeshBasis,
        }
      : compiledProjectedMeshBasis;
  for (const { placementIndex, placement, model } of decodedProjectedModels) {
    const builtModel = buildModelRenderGroups(
      model,
      placement,
      groups.length,
      projectedMeshBasis || DEFAULT_PROJECTED_MESH_PLANAR_BASIS
    );
    groups.push(...builtModel.groups);
    for (const texture of builtModel.textures) {
      requestedTextures.set(texture.pattern.toLowerCase(), texture.sourceName.toLowerCase());
    }
    if (builtModel.bounds.every(Number.isFinite)) {
      modelBoundsFeatures.push(
        boundsFeature(builtModel.bounds, model.name || placement.meshGuid, placement.meshGuid)
      );
    }
    onProgress(
      0.29 + ((placementIndex + 1) / airportData.projectedMeshes.length) * 0.43,
      'Decoding projected meshes',
      `${placementIndex + 1}/${airportData.projectedMeshes.length}: ${model.name || placement.meshGuid}`
    );
  }
  groups.sort(compareRenderGroups);

  const textureFiles = new Map([...apronRender.textureFiles, ...paintedLineRender.textureFiles]);
  const unresolvedTextures = [];
  for (const [pattern, requested] of requestedTextures) {
    const candidates = textureIndex.get(pathBasename(requested)) || [];
    const resolved = await resolveEquivalentFiles(candidates);
    if (resolved) textureFiles.set(pattern, resolved);
    else unresolvedTextures.push(requested);
  }
  onProgress(0.94, 'Preparing map data', `${groups.length} WebGL batch(es)`);

  const result = {
    source: airportParts.map((part) => part.entry.path).join(', '),
    sources: airportParts.map((part) => part.entry.path),
    elapsedMilliseconds: performance.now() - started,
    aprons: airportData.aprons,
    apronBoundaries: airportData.apronBoundaries,
    projectedMeshes: airportData.projectedMeshes,
    runways: airportData.runways,
    taxiwayPaths: airportData.taxiwayPaths,
    paintedLines: airportData.paintedLines,
    lightRows: airportData.lightRows,
    lightPoints,
    lightPointDiagnostics,
    namedObjects: airportData.namedObjects,
    libraryObjects: airportData.libraryObjects,
    groups,
    textureFiles,
    modelBounds: { type: 'FeatureCollection', features: modelBoundsFeatures },
    resolvedModels,
    projectedMeshBasis,
    apronMaterialLibrary: {
      materials: apronMaterialLibrary.size,
      resolved: apronRender.resolvedMaterials.size,
      unresolved: [...apronRender.unresolvedMaterials],
      identified: [...apronRender.identifiedMaterials],
      missingDescriptors: [...apronRender.missingDescriptorMaterials],
    },
    paintedLineMaterials,
    paintedLineDiagnostics: airportData.paintedLineDiagnostics,
    projectedMeshDrawOrderDiagnostics,
    unresolvedModels,
    unresolvedTextures,
    layoutDiagnostics,
    counts: {
      files: entries.length,
      bgls: bglEntries.length,
      airportBgls: airportParts.length,
      airports: airportData.airports,
      aprons: airportData.aprons.features.length,
      projectedMeshes: airportData.projectedMeshes.length,
      resolvedModels: resolvedModels.length,
      batches: groups.length,
      triangles: groups.reduce((sum, group) => sum + group.triangleCount, 0),
      textures: textureFiles.size,
      namedObjects: airportData.namedObjects.features.length,
      libraryObjects: airportData.libraryObjects.features.length,
      runways: airportData.runways.length,
      taxiwayPaths: airportData.taxiwayPaths.length,
      drawnTaxiwayPaths: taxiwaySurfaceRender.featureCount,
      paintedLines: airportData.paintedLines.features.length,
      lightRows: airportData.lightRows.features.length,
      lightEdges: airportData.lightRows.features.reduce(
        (sum, feature) => sum + Number(feature.properties?.edgeCount || 0),
        0
      ),
      lightPoints: lightPoints.features.length,
      paintedLineRecords: airportData.paintedLineDiagnostics.records,
      rejectedPaintedLines: airportData.paintedLineDiagnostics.rejected,
      exactTexturedPaintedLines: paintedLineRender.featureCount,
    },
    airportRecords: airportData.airportRecords,
  };
  onProgress(1, 'Scenery ready', `${result.counts.triangles.toLocaleString()} textured triangles`);
  return result;
}

function buildLightPoints(lightRows) {
  const features = [];
  for (const row of lightRows.features) {
    const properties = row.properties || {};
    const lines = row.geometry?.coordinates || [];
    const color = lightColor(properties.lightName, properties.coloration);
    if (properties.format === 'msfs2024-named-light-row' && lines.length) {
      const path = [lines[0][0], ...lines.map((line) => line[1])];
      const spacing = Number(properties.spacingOrFalloff);
      const positions =
        properties.snapToVertices !== true && Number.isFinite(spacing) && spacing > 0.25
          ? samplePathAtSpacing(path, spacing)
          : path.map((coordinate, index) => ({ coordinate, distance: null, vertexIndex: index }));
      for (const [index, position] of positions.entries()) {
        features.push(
          lightPointFeature(row, position.coordinate, index, {
            lightColor: color,
            sourceDistanceMeters: position.distance,
            sourceVertexIndex: position.vertexIndex ?? null,
            exactness:
              position.vertexIndex === undefined
                ? 'source-derived-from-compiled-path-and-spacing'
                : 'exact-compiled-light-row-vertex',
          })
        );
      }
      continue;
    }
    // Older indexed rows do not expose a spacing field. Keep their exact compiled vertices as
    // points instead of inventing an interval between them.
    const seen = new Set();
    for (const line of lines) {
      for (const coordinate of line) {
        const key = `${coordinate[0]},${coordinate[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        features.push(
          lightPointFeature(row, coordinate, features.length, {
            lightColor: color,
            sourceDistanceMeters: null,
            sourceVertexIndex: null,
            exactness: 'exact-compiled-light-row-vertex',
          })
        );
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

function summarizeLightPoints(lightRows, lightPoints) {
  const formats = {};
  const names = new Set();
  const spacings = [];
  for (const feature of lightRows.features) {
    const properties = feature.properties || {};
    const format = properties.format || 'unknown';
    formats[format] = (formats[format] || 0) + 1;
    if (properties.lightName) names.add(properties.lightName);
    const spacing = Number(properties.spacingOrFalloff);
    if (format === 'msfs2024-named-light-row' && Number.isFinite(spacing) && spacing > 0) {
      spacings.push(spacing);
    }
  }
  const derived = lightPoints.features.filter(
    (feature) => feature.properties?.exactness === 'source-derived-from-compiled-path-and-spacing'
  ).length;
  return {
    formats,
    uniqueNames: names.size,
    nameSamples: [...names].slice(0, 20),
    spacingRows: spacings.length,
    spacingMeters: spacings.length
      ? {
          minimum: Math.min(...spacings),
          maximum: Math.max(...spacings),
          average: spacings.reduce((sum, value) => sum + value, 0) / spacings.length,
        }
      : null,
    exactCompiledVertices: lightPoints.features.length - derived,
    sourceDerivedPoints: derived,
    totalPoints: lightPoints.features.length,
  };
}

function lightPointFeature(row, coordinate, pointIndex, extra) {
  return {
    type: 'Feature',
    id: `light-point-${row.properties?.sourceRecordOffset}-${pointIndex}`,
    properties: {
      sourceType: 'msfs-bgl-light-point-derived-from-31',
      sourceFile: row.properties?.sourceFile,
      sourceRecordOffset: row.properties?.sourceRecordOffset,
      lightName: row.properties?.lightName || '',
      rowFormat: row.properties?.format || '',
      pointIndex,
      ...extra,
    },
    geometry: { type: 'Point', coordinates: coordinate },
  };
}

function samplePathAtSpacing(path, spacing) {
  const segments = [];
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const length = distanceMeters(path[index - 1], path[index]);
    if (!Number.isFinite(length) || length <= 0) continue;
    segments.push({ start: path[index - 1], end: path[index], startDistance: total, length });
    total += length;
  }
  if (!segments.length) return path.slice(0, 1).map((coordinate) => ({ coordinate, distance: 0 }));
  const output = [];
  let segmentIndex = 0;
  for (let distance = 0; distance <= total + 1e-6; distance += spacing) {
    while (
      segmentIndex < segments.length - 1 &&
      distance > segments[segmentIndex].startDistance + segments[segmentIndex].length
    )
      segmentIndex += 1;
    const segment = segments[segmentIndex];
    const ratio = Math.max(0, Math.min(1, (distance - segment.startDistance) / segment.length));
    output.push({
      coordinate: [
        segment.start[0] + (segment.end[0] - segment.start[0]) * ratio,
        segment.start[1] + (segment.end[1] - segment.start[1]) * ratio,
      ],
      distance,
    });
  }
  return output;
}

function distanceMeters(first, second) {
  const latitude = ((first[1] + second[1]) / 2) * (Math.PI / 180);
  const sinLatitude = Math.sin(latitude);
  const denominator = Math.sqrt(
    1 - WGS84_ECCENTRICITY_SQUARED * sinLatitude * sinLatitude
  );
  const primeVerticalRadius = EARTH_RADIUS / denominator;
  const meridionalRadius =
    (EARTH_RADIUS * (1 - WGS84_ECCENTRICITY_SQUARED)) / denominator ** 3;
  const dx =
    (second[0] - first[0]) *
    (Math.PI / 180) *
    primeVerticalRadius *
    Math.cos(latitude);
  const dy = (second[1] - first[1]) * (Math.PI / 180) * meridionalRadius;
  return Math.hypot(dx, dy);
}

function lightColor(name, coloration) {
  const value = String(name || '').toLowerCase();
  if (value.includes('blue')) return '#4ca8ff';
  if (value.includes('green')) return '#57e59a';
  if (value.includes('red')) return '#ff6262';
  if (value.includes('white')) return '#f6f4dc';
  if (value.includes('yellow') || value.includes('amber')) return '#ffc857';
  if (Number(coloration) !== 0) {
    const packed = Number(coloration) >>> 0;
    const red = packed & 0xff;
    const green = (packed >>> 8) & 0xff;
    const blue = (packed >>> 16) & 0xff;
    if (red || green || blue) return `rgb(${red}, ${green}, ${blue})`;
  }
  return '#ffb15c';
}

async function inspectPackageLayout(entries) {
  const layoutEntry = entries.find((entry) => /(^|\/)layout\.json$/i.test(entry.path));
  if (!layoutEntry) return null;
  try {
    const layout = JSON.parse(new TextDecoder().decode(await layoutEntry.file.arrayBuffer()));
    const declared = Array.isArray(layout.content) ? layout.content : [];
    const packagePrefix = layoutEntry.path.slice(
      0,
      Math.max(0, layoutEntry.path.length - 'layout.json'.length)
    );
    const physical = new Set(
      entries.map((entry) => {
        const relative =
          packagePrefix && entry.path.startsWith(packagePrefix)
            ? entry.path.slice(packagePrefix.length)
            : entry.path;
        return relative.toLowerCase();
      })
    );
    const declaredMaterialLibraries = declared
      .map((item) => normalize(item.path || ''))
      .filter((item) => /(^|\/)materiallibs\/.*\/library\.xml$/i.test(item));
    const missingMaterialLibraries = declaredMaterialLibraries.filter(
      (item) => !physical.has(item.toLowerCase())
    );
    const declaredMaterialFiles = declared
      .map((item) => normalize(item.path || ''))
      .filter((item) => /(^|\/)materiallibs\//i.test(item));
    const missingMaterialFiles = declaredMaterialFiles.filter(
      (item) => !physical.has(item.toLowerCase())
    );
    return {
      declaredFiles: declared.length,
      physicalFiles: entries.length,
      declaredMaterialLibraries: declaredMaterialLibraries.length,
      physicalMaterialLibraries: declaredMaterialLibraries.length - missingMaterialLibraries.length,
      missingMaterialLibraries,
      declaredMaterialFiles: declaredMaterialFiles.length,
      missingMaterialFiles: missingMaterialFiles.length,
      declaredMaterialHints: summarizeDeclaredMaterialPaths(declaredMaterialFiles),
    };
  } catch {
    return { parseError: true, physicalFiles: entries.length };
  }
}

function summarizeDeclaredMaterialPaths(paths) {
  const texturePaths = paths.filter((item) => /\.ktx2$/i.test(item));
  const colorTokens = countPathTokens(texturePaths, [
    'white',
    'yellow',
    'red',
    'black',
    'green',
    'blue',
    'orange',
  ]);
  const surfaceTokens = countPathTokens(texturePaths, [
    'asphalt',
    'asph',
    'tarmac',
    'concrete',
    'conc',
    'cement',
    'dirt',
    'mud',
    'grass',
    'turf',
    'gravel',
    'paint',
    'mark',
    'line',
    'arrow',
    'numlet',
    'runway',
    'taxi',
    'hold',
  ]);
  return { texturePaths: texturePaths.length, colorTokens, surfaceTokens };
}

function countPathTokens(paths, tokens) {
  const counts = {};
  for (const token of tokens) counts[token] = 0;
  for (const item of paths) {
    const filename = pathBasename(item).toLowerCase();
    for (const token of tokens) {
      if (filename.includes(token)) counts[token] += 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}

function mergeAirportData(parts) {
  const mergeFeatures = (key) => ({
    type: 'FeatureCollection',
    features: parts.flatMap((part) => part[key]?.features || []),
  });
  const diagnostics = { records: 0, decoded: 0, rejected: 0, reasons: {}, rejectedSamples: [] };
  for (const part of parts) {
    const source = part.paintedLineDiagnostics;
    diagnostics.records += source.records;
    diagnostics.decoded += source.decoded;
    diagnostics.rejected += source.rejected;
    for (const [reason, count] of Object.entries(source.reasons)) {
      diagnostics.reasons[reason] = (diagnostics.reasons[reason] || 0) + count;
    }
    diagnostics.rejectedSamples.push(
      ...source.rejectedSamples.slice(0, Math.max(0, 24 - diagnostics.rejectedSamples.length))
    );
  }
  return {
    airports: parts.reduce((sum, part) => sum + part.airports, 0),
    airportRecords: parts.flatMap((part) => part.airportRecords || []),
    aprons: mergeFeatures('aprons'),
    apronBoundaries: mergeFeatures('apronBoundaries'),
    apronMeshes: parts.flatMap((part) => part.apronMeshes),
    projectedMeshes: parts.flatMap((part) => part.projectedMeshes),
    runways: parts.flatMap((part) => part.runways),
    taxiwayPaths: parts.flatMap((part) => part.taxiwayPaths || []),
    paintedLines: mergeFeatures('paintedLines'),
    paintedLineDiagnostics: diagnostics,
    lightRows: mergeFeatures('lightRows'),
    namedObjects: mergeFeatures('namedObjects'),
    libraryObjects: mergeFeatures('libraryObjects'),
  };
}

export function indexTextureFiles(files) {
  const index = new Map();
  for (const item of files) {
    const file = item.file || item;
    if (!/\.(dds|ktx2|png|jpe?g)$/i.test(file.name)) continue;
    const key = file.name.toLowerCase();
    const matches = index.get(key) || [];
    matches.push(file);
    index.set(key, matches);
  }
  return index;
}

async function loadApronMaterialLibraries(entries) {
  const entryByPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]));
  const materials = new Map();
  const libraryEntries = entries.filter((entry) =>
    /(^|\/)materiallibs\/.*\/library\.xml$/i.test(entry.path)
  );
  for (const entry of libraryEntries) {
    const xml = new TextDecoder().decode(await entry.file.arrayBuffer());
    const libraryDirectory = entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/')));
    for (const match of xml.matchAll(/<Material\b([^>]*)>([\s\S]*?)<\/Material>/gi)) {
      const attributes = xmlAttributes(match[1]);
      const guid = String(attributes.Guid || '').toLowerCase();
      if (!guid) continue;
      const textures = [...match[2].matchAll(/<Texture\b([^>]*)\/?\s*>/gi)].map((texture) =>
        xmlAttributes(texture[1])
      );
      const preferredTexture =
        textures.find((texture) => texture.Binding === 'MTL_BITMAP_DECAL0') ||
        textures.find((texture) => /ALBEDO|BASE.?COLOR|BITMAP_0/i.test(texture.Binding || ''));
      const referencedPath = preferredTexture?.FileName
        ? normalize(`${libraryDirectory}/${preferredTexture.FileName}`)
        : '';
      const textureEntry = referencedPath
        ? resolveExactMaterialTextureEntry(entries, entryByPath, referencedPath)
        : null;
      const uvScaleMatch = match[2].match(/<UVScale\b([^>]*)\/?\s*>/i);
      const uvScale = uvScaleMatch ? xmlAttributes(uvScaleMatch[1]) : {};
      const uvOffsetMatch = match[2].match(/<UVOffset\b([^>]*)\/?\s*>/i);
      const uvOffset = uvOffsetMatch ? xmlAttributes(uvOffsetMatch[1]) : {};
      const uvRotateMatch = match[2].match(/<UVRotate\b[^>]*>([^<]*)<\/UVRotate>/i);
      const diffuseMatch = match[2].match(/<Diffuse\b([^>]*)\/?\s*>/i);
      const diffuse = diffuseMatch ? xmlAttributes(diffuseMatch[1]) : {};
      const extraParameters = [...match[2].matchAll(/<Parameter\b([^>]*)\/?\s*>/gi)]
        .map((parameter) => Number(xmlAttributes(parameter[1]).Value))
        .filter(Number.isFinite);
      const sourceName = pathBasename(
        referencedPath || preferredTexture?.FileName || 'material.ktx2'
      );
      const pattern = `apron-${guid.replaceAll(/[{}]/g, '')}-${sourceName}`.toLowerCase();
      const material = {
        guid,
        name: attributes.Name || guid,
        surfaceType: attributes.SurfaceType || '',
        blendMode: attributes.BlendMode || '',
        opacity: Number(attributes.Opacity ?? 1),
        diffuse: [Number(diffuse.Red ?? 1), Number(diffuse.Green ?? 1), Number(diffuse.Blue ?? 1)],
        uvScaleU: Number(uvScale.U ?? 1),
        uvScaleV: Number(uvScale.V ?? 1),
        uvOffsetU: Number(uvOffset.U ?? 0),
        uvOffsetV: Number(uvOffset.V ?? 0),
        uvRotate: Number(uvRotateMatch?.[1] ?? 0),
        extraParameters,
        texturePath: referencedPath,
        textureFile: textureEntry?.file || null,
        descriptorSource: entry.path,
        descriptorSourceKind: 'package-library',
        pattern,
      };
      materials.set(guid, material);
    }
  }
  return materials;
}

function resolveExactMaterialTextureEntry(entries, entryByPath, referencedPath) {
  const normalized = normalize(referencedPath).toLowerCase();
  const exact = entryByPath.get(normalized);
  if (exact) return exact;
  const suffix = `/${normalized}`;
  const matches = entries.filter((entry) => `/${entry.path.toLowerCase()}`.endsWith(suffix));
  return matches.length === 1 ? matches[0] : null;
}

function xmlAttributes(source) {
  const attributes = {};
  for (const match of String(source).matchAll(/([:\w-]+)\s*=\s*"([^"]*)"/g)) {
    attributes[match[1]] = match[2]
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
  }
  return attributes;
}

function annotatePaintedLineMaterials(collection, materialLibrary) {
  const resolved = new Set();
  const unresolved = new Set();
  const lineTypes = {};
  const proceduralStyles = {};
  const materialNames = {};
  const materialLineTypes = {};
  for (const feature of collection.features) {
    const lineType = Number(feature.properties?.lineType || 0);
    const lineTypeLabel = PAINTED_LINE_TYPES[lineType] || `TYPE_${lineType}`;
    const guid = String(feature.properties?.materialGuid || '').toLowerCase();
    const material = materialLibrary.get(guid);
    feature.properties.lineTypeLabel = lineTypeLabel;
    feature.properties.lineWidthScale = lineTypeLabel.startsWith('WIDE_')
      ? 1.8
      : lineTypeLabel.startsWith('SLIM_')
        ? 0.65
        : 1;
    feature.properties.dashed = lineTypeLabel.includes('DASHED');
    feature.properties.lighted = lineTypeLabel.endsWith('_LIGHTED');
    feature.properties.proceduralStyle = paintedLineStyle(lineTypeLabel, material);
    feature.properties.proceduralStyleBasis = material?.textureFile
      ? 'exact package material descriptor overrides built-in paint pattern'
      : 'compiled SDK painted-line type';
    feature.properties.visualizationExactness =
      'exact-compiled-path-and-type; procedural-web-line-pattern';
    feature.properties.lightVisualizationExactness = feature.properties.lighted
      ? 'light-presence-exact-from-compiled-type; individual-light-spacing-not-encoded'
      : '';
    lineTypes[lineTypeLabel] = (lineTypes[lineTypeLabel] || 0) + 1;
    proceduralStyles[feature.properties.proceduralStyle] =
      (proceduralStyles[feature.properties.proceduralStyle] || 0) + 1;
    if (material) {
      resolved.add(guid);
      feature.properties.materialName = material.name;
      feature.properties.materialTexturePath = material.texturePath;
      feature.properties.materialColor = paintedLineColor(
        material.name,
        material.surfaceType,
        lineTypeLabel
      );
      feature.properties.materialResolved = true;
      materialNames[material.name] = (materialNames[material.name] || 0) + 1;
      materialLineTypes[material.name] ||= {};
      materialLineTypes[material.name][lineTypeLabel] =
        (materialLineTypes[material.name][lineTypeLabel] || 0) + 1;
    } else {
      unresolved.add(guid || 'unknown');
      feature.properties.materialColor = paintedLineColor('', '', lineTypeLabel);
      feature.properties.materialResolved = false;
    }
  }
  return {
    resolved: resolved.size,
    unresolved: [...unresolved],
    lineTypes,
    proceduralStyles,
    materialNames,
    materialLineTypes,
  };
}

function paintedLineStyle(lineTypeLabel, material = null) {
  if (material?.textureFile) return paintedLineMaterialStyle(material);
  if (
    lineTypeLabel.includes('HOLD_SHORT') ||
    lineTypeLabel === 'ILS_HOLD_SHORT' ||
    lineTypeLabel === 'ILS_HOLD_SHORT_LIGHTED'
  )
    return 'hold-short';
  if (lineTypeLabel.startsWith('NON_MOVEMENT')) return 'non-movement';
  if (lineTypeLabel.startsWith('ENHANCED_CENTER')) return 'enhanced-center';
  if (lineTypeLabel.includes('DASHED')) return 'dashed';
  return 'single';
}

function paintedLineMaterialStyle(material) {
  const value = `${material?.name || ''} ${material?.texturePath || ''}`.toLowerCase();
  if (value.includes('hold') || value.includes('stopbar') || value.includes('ils'))
    return 'hold-short';
  if (value.includes('non_movement') || value.includes('non-movement')) return 'non-movement';
  if (value.includes('enhanced')) return 'enhanced-center';
  if (value.includes('dash')) return 'dashed';
  return 'custom-linear-material';
}

const PAINTED_LINE_TYPES = [
  'DEFAULT',
  'HOLD_SHORT_FORWARD',
  'HOLD_SHORT_BACKWARD',
  'HOLD_SHORT_FORWARD_MARKED',
  'HOLD_SHORT_BACKWARD_MARKED',
  'ILS_HOLD_SHORT',
  'EDGE_LINE_SOLID',
  'EDGE_LINE_DASHED',
  'HOLD_SHORT_TAXIWAY',
  'SERVICE_DASHED',
  'EDGE_SERVICE_SOLID',
  'EDGE_SERVICE_DASHED',
  'WIDE_YELLOW',
  'WIDE_WHITE',
  'WIDE_RED',
  'SLIM_RED',
  'EDGE_SOLID_ORTHO',
  'EDGE_SOLID_ORTHO_BACK',
  'NON_MOVEMENT',
  'NON_MOVEMENT_BACK',
  'ENHANCED_CENTER',
  'DEFAULT_LIGHTED',
  'HOLD_SHORT_FORWARD_MARKED_LIGHTED',
  'HOLD_SHORT_BACKWARD_MARKED_LIGHTED',
  'HOLD_SHORT_FORWARD_LIGHTED',
  'HOLD_SHORT_BACKWARD_LIGHTED',
  'ILS_HOLD_SHORT_LIGHTED',
  'EDGE_LINE_SOLID_LIGHTED',
  'EDGE_LINE_DASHED_LIGHTED',
  'HOLD_SHORT_TAXIWAY_LIGHTED',
  'SERVICE_DASHED_LIGHTED',
  'EDGE_SERVICE_SOLID_LIGHTED',
  'EDGE_SERVICE_DASHED_LIGHTED',
  'WIDE_YELLOW_LIGHTED',
  'WIDE_WHITE_LIGHTED',
  'WIDE_RED_LIGHTED',
  'SLIM_RED_LIGHTED',
  'EDGE_SOLID_ORTHO_LIGHTED',
  'EDGE_SOLID_ORTHO_BACK_LIGHTED',
  'NON_MOVEMENT_LIGHTED',
  'NON_MOVEMENT_BACK_LIGHTED',
  'ENHANCED_CENTER_LIGHTED',
];
const PAINTED_LINE_OUTLINE_TYPES = ['NO_OUTLINE', 'LINE', 'BORDER', 'FIT'];

function paintedLineColor(name, surfaceType, lineTypeLabel = '') {
  const value = `${name} ${surfaceType}`.toLowerCase();
  if (/(^|[^a-z])(drain|drains|grate|gutter|channel|tile.?edge)([^a-z]|$)/.test(value))
    return '#657078';
  if (value.includes('white')) return '#f4f4ef';
  if (value.includes('yellow')) return '#f4c542';
  if (value.includes('blue')) return '#4aa3ff';
  if (value.includes('red')) return '#ef5b5b';
  if (value.includes('green')) return '#45c98a';
  if (value.includes('black')) return '#30353a';
  if (lineTypeLabel.includes('WHITE') || lineTypeLabel.includes('SERVICE')) return '#f4f4ef';
  if (lineTypeLabel.includes('RED')) return '#ef5b5b';
  return '#d6aa42';
}

async function resolveEquivalentFiles(candidates) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (!candidates.every((candidate) => candidate.size === candidates[0].size)) return null;
  const hashes = await Promise.all(
    candidates.map(async (candidate) =>
      bytesToHex(await crypto.subtle.digest('SHA-256', await candidate.arrayBuffer()))
    )
  );
  return hashes.every((hash) => hash === hashes[0]) ? candidates[0] : null;
}

function decodeAirportBgl(arrayBuffer, sourcePath) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const apronFeatures = [];
  const apronBoundaryFeatures = [];
  const apronMeshes = [];
  const projectedMeshes = [];
  const runways = [];
  const taxiwayPaths = [];
  const paintedLineFeatures = [];
  const lightRowFeatures = [];
  const paintedLineDiagnostics = {
    records: 0,
    decoded: 0,
    rejected: 0,
    reasons: {},
    rejectedSamples: [],
  };
  const airportRecords = [];
  let airports = 0;
  for (let airportOffset = 0; airportOffset + 6 <= bytes.length; airportOffset += 1) {
    const airportType = view.getUint16(airportOffset, true);
    const airportHeaderBytes = airportRecordHeaderBytes(airportType);
    if (!airportHeaderBytes || airportOffset + airportHeaderBytes > bytes.length) continue;
    const airportSize = view.getUint32(airportOffset + 2, true);
    if (airportSize < airportHeaderBytes || airportOffset + airportSize > bytes.length) continue;
    const longitude = decodeLongitude(view.getUint32(airportOffset + 0x0c, true));
    const latitude = decodeLatitude(view.getUint32(airportOffset + 0x10, true));
    if (!plausibleCoordinate(longitude, latitude)) continue;
    let childOffset = airportOffset + airportHeaderBytes;
    const localAprons = [];
    const localApronMeshes = [];
    const localBoundaries = [];
    const localMeshes = [];
    const localRunways = [];
    const localTaxiwayPaths = [];
    const localPaintedLines = [];
    const localLightRows = [];
    let localTaxiwayPoints = null;
    let localTaxiwayParkings = null;
    while (childOffset + 6 <= airportOffset + airportSize) {
      const type = view.getUint16(childOffset, true);
      const size = view.getUint32(childOffset + 2, true);
      if (size < 6 || childOffset + size > airportOffset + airportSize) break;
      if (type === 0xd0) {
        const apron = decodeApron(view, childOffset, size, sourcePath, [longitude, latitude]);
        if (apron) {
          localAprons.push(apron.surface);
          localBoundaries.push(apron.boundary);
          localApronMeshes.push(apron.mesh);
        }
      } else if (type === 0xe8) {
        const mesh = decodeProjectedMesh(view, childOffset, size);
        if (mesh) localMeshes.push(mesh);
      } else if (type === 0xce) {
        const runway = decodeRunway(view, childOffset, size, sourcePath);
        if (runway) localRunways.push(runway);
      } else if (type === 0x1a) {
        localTaxiwayPoints = decodeTaxiwayPointTable(view, childOffset, size);
      } else if (type === 0xe7) {
        localTaxiwayParkings = decodeTaxiwayParkingTable(view, childOffset, size);
      } else if (type === 0xd4 && localTaxiwayPoints?.length) {
        localTaxiwayPaths.push(
          ...decodeTaxiwayPathTable(
            view,
            childOffset,
            size,
            localTaxiwayPoints,
            localTaxiwayParkings,
            sourcePath
          )
        );
      } else if (type === 0xcf) {
        const paintedLine = decodePaintedLine(
          view,
          childOffset,
          size,
          sourcePath,
          paintedLineDiagnostics
        );
        if (paintedLine) localPaintedLines.push(paintedLine);
      } else if (type === 0x31) {
        const lightRow = decodeApronEdgeLights(view, childOffset, size, sourcePath);
        if (lightRow) localLightRows.push(lightRow);
      }
      childOffset += size;
    }
    if (childOffset !== airportOffset + airportSize) continue;
    airportRecords.push({
      sourceFile: sourcePath,
      sourceRecordOffset: airportOffset,
      recordType: airportType,
      recordSize: airportSize,
      reference: [longitude, latitude],
      aprons: localAprons.length,
      projectedMeshes: localMeshes.length,
      runways: localRunways.length,
      taxiwayPaths: localTaxiwayPaths.length,
      paintedLines: localPaintedLines.length,
      lightRows: localLightRows.length,
    });
    airports += 1;
    apronFeatures.push(...localAprons);
    apronMeshes.push(...localApronMeshes);
    apronBoundaryFeatures.push(...localBoundaries);
    projectedMeshes.push(...localMeshes);
    runways.push(...localRunways);
    taxiwayPaths.push(...localTaxiwayPaths);
    paintedLineFeatures.push(...localPaintedLines);
    lightRowFeatures.push(...localLightRows);
    airportOffset += airportSize - 1;
  }
  const scenery = decodeSceneryObjects(view, sourcePath);
  return {
    airports,
    airportRecords,
    aprons: { type: 'FeatureCollection', features: apronFeatures },
    apronBoundaries: { type: 'FeatureCollection', features: apronBoundaryFeatures },
    apronMeshes,
    projectedMeshes,
    runways,
    taxiwayPaths,
    paintedLines: { type: 'FeatureCollection', features: paintedLineFeatures },
    lightRows: { type: 'FeatureCollection', features: lightRowFeatures },
    paintedLineDiagnostics,
    namedObjects: scenery.namedObjects,
    libraryObjects: scenery.libraryObjects,
  };
}

function decodeTaxiwayParkingTable(view, offset, size) {
  if (size < 8) return null;
  const parkingCount = view.getUint16(offset + 0x06, true);
  if (!parkingCount || size !== 8 + parkingCount * 0x38) return null;
  const parkings = [];
  for (let index = 0; index < parkingCount; index += 1) {
    const itemOffset = offset + 8 + index * 0x38;
    const coordinate = [
      decodeLongitude(view.getUint32(itemOffset + 0x1c, true)),
      decodeLatitude(view.getUint32(itemOffset + 0x20, true)),
    ];
    if (!plausibleCoordinate(coordinate[0], coordinate[1])) return null;
    parkings.push({
      index,
      sourceRecordOffset: itemOffset,
      radiusMeters: view.getFloat32(itemOffset + 0x04, true),
      heading: view.getFloat32(itemOffset + 0x08, true),
      coordinate,
    });
  }
  return parkings;
}

function airportRecordHeaderBytes(recordType) {
  if (recordType === 0x56) return 0x44;
  if (recordType === 0x113) return 0x5c;
  return 0;
}

function decodeTaxiwayPointTable(view, offset, size) {
  if (size < 8) return null;
  const pointCount = view.getUint16(offset + 0x06, true);
  if (!pointCount || size !== 8 + pointCount * 12) return null;
  const points = [];
  for (let index = 0; index < pointCount; index += 1) {
    const itemOffset = offset + 8 + index * 12;
    const coordinate = [
      decodeLongitude(view.getUint32(itemOffset + 0x04, true)),
      decodeLatitude(view.getUint32(itemOffset + 0x08, true)),
    ];
    if (!plausibleCoordinate(coordinate[0], coordinate[1])) return null;
    points.push({
      index,
      flags: view.getUint32(itemOffset, true),
      coordinate,
    });
  }
  return points;
}

function decodeTaxiwayPathTable(view, offset, size, points, parkings, sourcePath) {
  if (size < 8) return [];
  const pathCount = view.getUint16(offset + 0x06, true);
  if (!pathCount || size !== 8 + pathCount * 0x30) return [];
  const paths = [];
  for (let index = 0; index < pathCount; index += 1) {
    const itemOffset = offset + 8 + index * 0x30;
    const startIndex = view.getUint16(itemOffset, true);
    const legacyEndAndRunwayDesignator = view.getUint16(itemOffset + 0x02, true);
    const endIndex = view.getUint16(itemOffset + 0x2e, true);
    const widthMeters = view.getFloat32(itemOffset + 0x08, true);
    const pathTypeRaw = view.getUint8(itemOffset + 0x04);
    const pathType = pathTypeRaw & 0x0f;
    // PARKING paths terminate at a TaxiwayParking record, not at a TaxiwayPoint. Treating the
    // parking-table index as a point-table index creates the characteristic airport-wide
    // starburst of false pavement. The preceding 0xe7 table preserves the exact stand coordinate.
    const endReferencesParking = pathType === 3;
    const endpointTable = endReferencesParking ? parkings : points;
    if (
      startIndex >= points.length ||
      !endpointTable ||
      endIndex >= endpointTable.length ||
      !Number.isFinite(widthMeters) ||
      widthMeters <= 0 ||
      widthMeters > 250 ||
      view.getUint16(itemOffset + 0x16, true) !== 0x30
    )
      continue;
    const markingFlags = view.getUint8(itemOffset + 0x06);
    const start = points[startIndex].coordinate;
    const end = endpointTable[endIndex].coordinate;
    paths.push({
      sourceType: 'msfs-bgl-taxiway-path-d4',
      exactness: 'exact-compiled-endpoints-width-and-flags; source-derived-ribbon-join',
      sourceFile: sourcePath,
      sourceRecordOffset: itemOffset,
      graphPointTableOffset: offset,
      index,
      startIndex,
      endIndex,
      start,
      end,
      startPointFlags: points[startIndex].flags,
      endPointFlags: endReferencesParking ? null : points[endIndex].flags,
      endParkingRecordOffset: endReferencesParking
        ? endpointTable[endIndex].sourceRecordOffset
        : null,
      endReferenceType: endReferencesParking ? 'taxiway-parking' : 'taxiway-point',
      geometryResolved: true,
      legacyEndIndex: legacyEndAndRunwayDesignator & 0x0fff,
      runwayDesignator: legacyEndAndRunwayDesignator >> 12,
      pathTypeRaw,
      pathType,
      drawSurface: (pathTypeRaw & 0x20) !== 0,
      drawDetail: (pathTypeRaw & 0x40) !== 0,
      nameOrNumber: view.getUint8(itemOffset + 0x05),
      markingFlags,
      centerLine: (markingFlags & 0x01) !== 0,
      centerLineLighted: (markingFlags & 0x02) !== 0,
      leftEdgeType: (markingFlags & 0x0c) >> 2,
      leftEdgeLighted: (markingFlags & 0x10) !== 0,
      rightEdgeType: (markingFlags & 0x60) >> 5,
      rightEdgeLighted: (markingFlags & 0x80) !== 0,
      surface: view.getUint8(itemOffset + 0x07),
      materialCount: view.getUint8(itemOffset + 0x2c),
      vegetationFlags: view.getUint8(itemOffset + 0x2d),
      widthMeters,
      lengthMeters: coordinateDistanceMeters(start, end),
    });
  }
  return paths;
}

function decodeApron(view, offset, size, sourcePath, airportReference) {
  if (size < 0x34) return null;
  const vertexCount = view.getUint16(offset + 0x30, true);
  const triangleCount = view.getUint16(offset + 0x32, true);
  const vertexOffset = offset + 0x34;
  const triangleOffset = vertexOffset + vertexCount * 8;
  if (vertexCount < 3 || triangleCount < 1 || triangleOffset + triangleCount * 6 > offset + size) {
    return null;
  }
  const vertices = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const itemOffset = vertexOffset + index * 8;
    vertices.push([
      decodeLongitude(view.getUint32(itemOffset, true)),
      decodeLatitude(view.getUint32(itemOffset + 4, true)),
    ]);
  }
  const triangles = [];
  for (let index = 0; index < triangleCount; index += 1) {
    const itemOffset = triangleOffset + index * 6;
    const triangle = [
      view.getUint16(itemOffset, true),
      view.getUint16(itemOffset + 2, true),
      view.getUint16(itemOffset + 4, true),
    ];
    if (triangle.some((vertex) => vertex >= vertexCount)) return null;
    triangles.push(triangle);
  }
  const flags = view.getUint8(offset + 0x06);
  const compiledPriority = decodeApronPriority(view.getInt32(offset + 0x28, true));
  // V6 apron records store the two editor offsets as adjacent signed bytes, followed by two
  // padding bytes before the vertex/triangle counts. Controlled MSFS 2024 SDK compiles prove the
  // mapping independently: (1234,-567) truncates to bytes (0xD2,0xC9) and (-321,765) to
  // (0xBF,0xFD). Treating +0x2c as one int16 combined U and V while reading padding as V, which
  // was the root cause of package-wide atlas misalignment.
  const rawUvOffset = view.getUint32(offset + 0x2c, true);
  const properties = {
    sourceType: 'msfs-bgl-apron-v6-d0',
    sourceFile: sourcePath,
    sourceRecordOffset: offset,
    airportReference,
    exactness: 'exact-decoded-triangle-mesh',
    materialGuid: guidFromView(view, offset + 0x0c),
    tiling: view.getFloat32(offset + 0x1c, true),
    textureRotation: view.getFloat32(offset + 0x20, true),
    falloff: view.getFloat32(offset + 0x24, true),
    triangleCount,
    priority: compiledPriority.priority,
    drawStage: compiledPriority.stage,
    rawPriority: compiledPriority.raw,
    rawUvOffset,
    uvOffsetU8: view.getUint8(offset + 0x2c),
    uvOffsetV8: view.getUint8(offset + 0x2d),
    uvOffsetI8U: view.getInt8(offset + 0x2c),
    uvOffsetI8V: view.getInt8(offset + 0x2d),
    uvOffsetPadding: view.getUint16(offset + 0x2e, true),
    uvOffsetFloat32: view.getFloat32(offset + 0x2c, true),
    textureOffsetU: view.getInt8(offset + 0x2c),
    textureOffsetV: view.getInt8(offset + 0x2d),
    opacity: view.getUint8(offset + 0x07) / 255,
    materialColoration: decodeMaterialColoration(view.getUint32(offset + 0x08, true)),
    rawMaterialColoration: view.getUint32(offset + 0x08, true),
    drawSurface: (flags & 0x01) !== 0,
    localUv: (flags & 0x04) !== 0,
    stretchUv: (flags & 0x08) !== 0,
    groundMerging: (flags & 0x10) === 0,
    flipUv: (flags & 0x80) !== 0,
  };
  return {
    mesh: { vertices, triangles, properties },
    surface: {
      type: 'Feature',
      id: `apron-${offset}`,
      properties,
      geometry: {
        type: 'MultiPolygon',
        coordinates: triangles.map((triangle) => {
          const ring = triangle.map((vertex) => vertices[vertex]);
          return [[...ring, ring[0]]];
        }),
      },
    },
    boundary: {
      type: 'Feature',
      id: `apron-boundary-${offset}`,
      properties: { ...properties, exactness: 'exact-decoded-boundary-edges' },
      geometry: { type: 'MultiLineString', coordinates: boundaryEdges(vertices, triangles) },
    },
  };
}

function decodeApronPriority(raw) {
  if (Math.abs(raw) < 1_000_000_000) return { raw, stage: 0, priority: raw };
  const unsigned = raw < 0 ? raw + 0x1_0000_0000 : raw;
  const stage = Math.round(unsigned / 1_000_000_000);
  return { raw, stage, priority: unsigned - stage * 1_000_000_000 };
}

function decodeMaterialColoration(raw) {
  return {
    // Compiled airport records store the editor's colour as AARRGGBB. Reading the uint32 in
    // little-endian therefore yields a stable numeric value whose high byte is alpha. Controlled
    // ffba9032 is the authored ochre/yellow RGB(186,144,50), not a translucent red swatch.
    red: (raw >>> 16) & 0xff,
    green: (raw >>> 8) & 0xff,
    blue: raw & 0xff,
    alpha: (raw >>> 24) & 0xff,
    hex: raw.toString(16).padStart(8, '0'),
  };
}

function decodePaintedLine(view, offset, size, sourcePath, diagnostics) {
  diagnostics.records += 1;
  const reject = (reason) => {
    diagnostics.rejected += 1;
    diagnostics.reasons[reason] = (diagnostics.reasons[reason] || 0) + 1;
    if (diagnostics.rejectedSamples.length < 24) {
      diagnostics.rejectedSamples.push({
        sourceRecordOffset: offset,
        size,
        reason,
        lineType: size > 6 ? view.getUint8(offset + 0x06) : null,
        trueAngle: size > 7 ? view.getUint8(offset + 0x07) : null,
        vertexCount32: size >= 0x0c ? view.getUint32(offset + 0x08, true) : null,
        vertexCount16: size >= 0x0a ? view.getUint16(offset + 0x08, true) : null,
        upperCount16: size >= 0x0c ? view.getUint16(offset + 0x0a, true) : null,
        availableVertexBytes: Math.max(0, size - 0x1c),
      });
    }
    return null;
  };
  if (size < 0x24) return reject('record-shorter-than-header');
  // Some 2024 compilers pack the PaintedLine outline enum into the upper half of this uint32.
  // A controlled sample stores 0x00010003 for a three-vertex LINE-outline record. Record size
  // independently proves the lower uint16 is the count; preserve both halves as source evidence.
  const rawVertexCount = view.getUint32(offset + 0x08, true);
  const vertexCount = rawVertexCount & 0xffff;
  const vertexFlags = rawVertexCount >>> 16;
  const vertexOffset = offset + 0x1c;
  if (vertexCount < 2) return reject('fewer-than-two-vertices');
  if (vertexCount > 1_000_000) return reject('implausible-vertex-count');
  if (vertexOffset + vertexCount * 8 > offset + size) return reject('vertices-exceed-record');
  const coordinates = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const itemOffset = vertexOffset + index * 8;
    const coordinate = [
      decodeLongitude(view.getUint32(itemOffset, true)),
      decodeLatitude(view.getUint32(itemOffset + 4, true)),
    ];
    if (!plausibleCoordinate(coordinate[0], coordinate[1])) return reject('implausible-coordinate');
    coordinates.push(coordinate);
  }
  diagnostics.decoded += 1;
  return {
    type: 'Feature',
    id: `painted-line-${offset}`,
    properties: {
      sourceType: 'msfs-bgl-painted-line-cf',
      sourceFile: sourcePath,
      sourceRecordOffset: offset,
      exactness: 'exact-decoded-polyline',
      lineType: view.getUint8(offset + 0x06),
      trueAngle: view.getUint8(offset + 0x07),
      vertexCount,
      vertexFlags,
      outlineType: vertexFlags <= 3 ? vertexFlags : null,
      outlineTypeLabel: PAINTED_LINE_OUTLINE_TYPES[vertexFlags] || `UNKNOWN_${vertexFlags}`,
      rawVertexCount,
      materialGuid: guidFromView(view, offset + 0x0c),
    },
    geometry: { type: 'LineString', coordinates },
  };
}

function decodeApronEdgeLights(view, offset, size, sourcePath) {
  if (size < 0x20) return null;
  const vertexCount = view.getUint16(offset + 0x08, true);
  const trailingCount = view.getUint16(offset + 0x0a, true);
  const vertexOffset = offset + 0x18;
  const trailingOffset = vertexOffset + vertexCount * 8;
  if (vertexCount < 2 || trailingOffset > offset + size) return null;
  const vertices = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const itemOffset = vertexOffset + index * 8;
    const coordinate = [
      decodeLongitude(view.getUint32(itemOffset, true)),
      decodeLatitude(view.getUint32(itemOffset + 4, true)),
    ];
    if (!plausibleCoordinate(coordinate[0], coordinate[1])) return null;
    vertices.push(coordinate);
  }
  let edges = [];
  const radii = [];
  let format = 'indexed-light-edges';
  let lightName = '';
  if (trailingCount > 0 && trailingOffset + trailingCount * 8 <= offset + size) {
    for (let index = 0; index < trailingCount; index += 1) {
      const itemOffset = trailingOffset + index * 8;
      const radius = view.getFloat32(itemOffset, true);
      const first = view.getUint16(itemOffset + 4, true);
      const second = view.getUint16(itemOffset + 6, true);
      if (first >= vertexCount || second >= vertexCount) return null;
      edges.push([vertices[first], vertices[second]]);
      if (Number.isFinite(radius)) radii.push(radius);
    }
  } else {
    // The 2024 compiler repurposes +0x0a as the byte length of a trailing light-row name and
    // stores an ordered path instead of indexed edges. Compiled records validate this exactly:
    // header + vertices + NUL-terminated name + 4-byte padding equals the compiled record size.
    const nameEnd = Math.min(trailingOffset + trailingCount, offset + size);
    lightName = new TextDecoder()
      .decode(new Uint8Array(view.buffer, trailingOffset, Math.max(0, nameEnd - trailingOffset)))
      .replaceAll('\0', '')
      .trim();
    format = 'msfs2024-named-light-row';
    edges = vertices.slice(1).map((vertex, index) => [vertices[index], vertex]);
  }
  const coloration = view.getUint32(offset + 0x0c, true);
  return {
    type: 'Feature',
    id: `apron-edge-lights-${offset}`,
    properties: {
      sourceType: 'msfs-bgl-apron-edge-lights-31',
      sourceFile: sourcePath,
      sourceRecordOffset: offset,
      exactness: 'exact-decoded-light-edges',
      unknownFlags: view.getUint16(offset + 0x06, true),
      vertexCount,
      edgeCount: edges.length,
      format,
      lightName,
      coloration,
      scale: view.getFloat32(offset + 0x10, true),
      spacingOrFalloff: view.getFloat32(offset + 0x14, true),
      snapToVertices: (view.getUint8(offset + 0x07) & 0x04) !== 0,
      minimumRadius: radii.length ? Math.min(...radii) : null,
      maximumRadius: radii.length ? Math.max(...radii) : null,
    },
    geometry: { type: 'MultiLineString', coordinates: edges },
  };
}

function decodeProjectedMesh(view, offset, size) {
  if (size < 0x4e) return null;
  const longitude = decodeLongitude(view.getUint32(offset + 0x12, true));
  const latitude = decodeLatitude(view.getUint32(offset + 0x16, true));
  if (!plausibleCoordinate(longitude, latitude)) return null;
  const flags = view.getUint32(offset + 8, true);
  return {
    sourceRecordOffset: offset,
    longitude,
    latitude,
    meshGuid: guidFromView(view, offset + 0x3a),
    meshScale: view.getFloat32(offset + 0x4a, true),
    pitch: decodeAngle16(view.getInt16(offset + 0x20, true)),
    bank: decodeAngle16(view.getInt16(offset + 0x22, true)),
    heading: decodeAngle16(view.getInt16(offset + 0x24, true)),
    // Airport.ProjectedMesh stores these independently. The second byte was previously folded
    // into the flags word, which made broad pavement sort over authored markings.
    priority: view.getInt8(offset + 6),
    surfaceTypeRaw: view.getUint8(offset + 7),
    rawFlags: flags,
    // Populated from the Draw Before bit field after the controlled compiler mapping below.
    drawBefore: decodeProjectedMeshDrawBefore(flags),
    drawBeforeLabel:
      PROJECTED_MESH_DRAW_BEFORE_LABELS[decodeProjectedMeshDrawBefore(flags)] || 'UNKNOWN',
    unknownFlags: flags >>> 1,
    groundMerging: (flags & 1) !== 0,
  };
}

function decodeProjectedMeshDrawBefore(flags) {
  // Controlled matching between official AirportKALO source coordinates and its compiled BGL
  // proves the low six bits encode Draw Before as odd values: APRON=11, MARKING=41,
  // RUNWAY_MARKING=45 and MARKING_TEXT=51. The same encoding interpolates the documented
  // TAXIWAY/RUNWAY slots; unknown values stay below airport primitives instead of covering them.
  // Bit 0 is Ground Merging and changes independently, so exclude it from the hierarchy code.
  const encoded = flags & 0x3e;
  const exactSlots = new Map([
    [10, 0],
    [20, 1],
    [30, 2],
    [40, 3],
    [44, 4],
    [50, 5],
  ]);
  return exactSlots.get(encoded) ?? -1;
}

function summarizeProjectedMeshDrawOrder(placements) {
  const slots = {};
  const unknownFlags = {};
  for (const placement of placements || []) {
    const label = placement.drawBeforeLabel || 'UNKNOWN';
    slots[label] = (slots[label] || 0) + 1;
    if (placement.drawBefore < 0) {
      const key = String(placement.rawFlags);
      unknownFlags[key] = (unknownFlags[key] || 0) + 1;
    }
  }
  return {
    records: placements?.length || 0,
    slots,
    unknown: slots.UNKNOWN || 0,
    unknownFlags,
  };
}

const PROJECTED_MESH_DRAW_BEFORE_LABELS = Object.freeze({
  0: 'APRON',
  1: 'TAXIWAY',
  2: 'RUNWAY',
  3: 'MARKING',
  4: 'RUNWAY_MARKING',
  5: 'MARKING_TEXT',
});

function decodeRunway(view, offset, size, sourcePath) {
  if (size < 0x60) return null;
  const longitude = decodeLongitude(view.getUint32(offset + 0x14, true));
  const latitude = decodeLatitude(view.getUint32(offset + 0x18, true));
  const lengthMeters = view.getFloat32(offset + 0x20, true);
  const widthMeters = view.getFloat32(offset + 0x24, true);
  const heading = view.getFloat32(offset + 0x28, true);
  if (
    !plausibleCoordinate(longitude, latitude) ||
    !(lengthMeters >= 30 && lengthMeters <= 10_000) ||
    !(widthMeters >= 3 && widthMeters <= 500) ||
    !(heading >= 0 && heading <= 360)
  )
    return null;
  return {
    sourceFile: sourcePath,
    sourceRecordOffset: offset,
    sourceType: 'bgl-runway',
    lon: longitude,
    lat: latitude,
    lengthMeters,
    widthMeters,
    heading,
    primaryLabel: runwayLabel(view.getUint8(offset + 8), view.getUint8(offset + 9)),
    secondaryLabel: runwayLabel(view.getUint8(offset + 10), view.getUint8(offset + 11)),
  };
}

function decodeSceneryObjects(view, sourcePath) {
  const namedFeatures = [];
  const libraryFeatures = [];
  if (view.byteLength < 0x38) {
    return featureCollections(namedFeatures, libraryFeatures);
  }
  const sectionCount = view.getUint32(0x14, true);
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const pointer = 0x38 + sectionIndex * 0x14;
    if (pointer + 0x14 > view.byteLength || view.getUint32(pointer, true) !== 0x25) continue;
    const subsectionCount = view.getUint32(pointer + 8, true);
    const tableOffset = view.getUint32(pointer + 12, true);
    const tableSize = view.getUint32(pointer + 16, true);
    const pointerSize = tableSize / Math.max(subsectionCount, 1);
    if (!Number.isInteger(pointerSize) || pointerSize < 16) continue;
    for (let subsection = 0; subsection < subsectionCount; subsection += 1) {
      const subsectionOffset = tableOffset + subsection * pointerSize;
      if (subsectionOffset + 16 > view.byteLength) continue;
      const count = view.getUint32(subsectionOffset + 4, true);
      const recordsOffset = view.getUint32(subsectionOffset + 8, true);
      const recordsSize = view.getUint32(subsectionOffset + 12, true);
      const end = recordsOffset + recordsSize;
      let offset = recordsOffset;
      for (let index = 0; index < count && offset + 4 <= end; index += 1) {
        const type = view.getUint16(offset, true);
        const size = view.getUint16(offset + 2, true);
        if (size < 4 || offset + size > end || offset + size > view.byteLength) break;
        if (type === 0x0b && size >= 0x40) {
          const point = placementPoint(view, offset);
          if (point) {
            libraryFeatures.push({
              type: 'Feature',
              id: `library-${offset}`,
              properties: {
                sourceType: 'msfs-bgl-library-object',
                sourceFile: sourcePath,
                sourceRecordOffset: offset,
                exactness: 'exact-placement',
                modelGuid: guidFromView(view, offset + 0x2c),
                heading: decodeAngle16(view.getUint16(offset + 0x16, true)),
              },
              geometry: { type: 'Point', coordinates: point },
            });
          }
        } else if (type === 0x19 && size >= 0x36) {
          const point = placementPoint(view, offset);
          const nameLength = view.getUint32(offset + 0x30, true);
          if (point && nameLength > 0 && offset + 0x34 + nameLength <= offset + size) {
            const nameBytes = new Uint8Array(
              view.buffer,
              view.byteOffset + offset + 0x34,
              nameLength
            );
            const name = new TextDecoder().decode(nameBytes).replaceAll('\0', '').trim();
            namedFeatures.push({
              type: 'Feature',
              id: `named-${offset}`,
              properties: {
                sourceType: 'msfs-bgl-named-simobject',
                sourceFile: sourcePath,
                sourceRecordOffset: offset,
                exactness: 'exact-placement',
                name,
              },
              geometry: { type: 'Point', coordinates: point },
            });
          }
        }
        offset += size;
      }
    }
  }
  return featureCollections(namedFeatures, libraryFeatures);
}

function featureCollections(namedFeatures, libraryFeatures) {
  return {
    namedObjects: { type: 'FeatureCollection', features: namedFeatures },
    libraryObjects: { type: 'FeatureCollection', features: libraryFeatures },
  };
}

async function readModelLibraryIndex(file) {
  let prefix = await file.slice(0, Math.min(file.size, 64 * 1024)).arrayBuffer();
  let view = new DataView(prefix);
  if (view.byteLength < 0x38) return new Map();
  const sectionCount = view.getUint32(0x14, true);
  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
    const pointer = 0x38 + sectionIndex * 0x14;
    if (pointer + 0x14 > view.byteLength || view.getUint32(pointer, true) !== 0x2b) continue;
    const subsectionCount = view.getUint32(pointer + 8, true);
    const tableOffset = view.getUint32(pointer + 12, true);
    const tableSize = view.getUint32(pointer + 16, true);
    if (subsectionCount < 1 || tableSize / subsectionCount < 16) return new Map();
    const tableBuffer = await file.slice(tableOffset, tableOffset + tableSize).arrayBuffer();
    const table = new DataView(tableBuffer);
    const recordCount = table.getUint32(4, true);
    const recordsOffset = table.getUint32(8, true);
    const recordsSize = table.getUint32(12, true);
    const indexBytes = recordCount * 24;
    if (indexBytes > recordsSize) return new Map();
    const indexBuffer = await file.slice(recordsOffset, recordsOffset + indexBytes).arrayBuffer();
    const indexView = new DataView(indexBuffer);
    const records = new Map();
    for (let index = 0; index < recordCount; index += 1) {
      const offset = index * 24;
      const guid = guidFromView(indexView, offset).toLowerCase();
      const relativeOffset = indexView.getUint32(offset + 16, true);
      const size = indexView.getUint32(offset + 20, true);
      if (relativeOffset + size <= recordsSize) {
        records.set(guid, { offset: recordsOffset + relativeOffset, size });
      }
    }
    return records;
  }
  return new Map();
}

async function parseModelRecord(arrayBuffer, fallbackGuid) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'GLTF') {
    return { guid: fallbackGuid, name: '', glbs: [] };
  }
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > bytes.length) break;
    chunks.push({ type, offset: offset + 8, size });
    offset += 8 + size + (size & 1);
  }
  const xmlChunk = chunks.find((chunk) => chunk.type === 'GXML');
  const xml = xmlChunk
    ? new TextDecoder()
        .decode(bytes.subarray(xmlChunk.offset, xmlChunk.offset + xmlChunk.size))
        .replaceAll('\0', '')
    : '';
  const name = /<ModelInfo\b[^>]*\bname="([^"]*)"/i.exec(xml)?.[1] || '';
  const glbs = [];
  for (const chunk of chunks.filter((item) => item.type === 'GLBD')) {
    let packedCursor = chunk.offset;
    const packedEnd = chunk.offset + chunk.size;
    while (
      packedCursor + 12 <= packedEnd &&
      ascii(bytes, packedCursor, packedCursor + 4) === 'GLBZ'
    ) {
      const packedSize = view.getUint32(packedCursor + 4, true);
      const unpackedSize = view.getUint32(packedCursor + 8, true);
      const packedRecordEnd = packedCursor + 8 + packedSize;
      if (packedSize < 4 || packedRecordEnd > packedEnd) break;
      const packedPayload = bytes.subarray(packedCursor + 12, packedRecordEnd);
      const frameLength = zstdFrameLength(packedPayload);
      const compressed = frameLength ? packedPayload.subarray(0, frameLength) : packedPayload;
      let unpacked;
      try {
        unpacked = await decompressZstd(compressed, unpackedSize);
      } catch (error) {
        const head = [...compressed.subarray(0, 12)]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join(' ');
        throw new Error(
          `${name || fallbackGuid} has unsupported GLBZ data (${head}): ${error.message}`
        );
      }
      if (unpacked.length !== unpackedSize) {
        const tail = [...compressed.subarray(Math.max(0, compressed.length - 12))]
          .map((value) => value.toString(16).padStart(2, '0'))
          .join(' ');
        throw new Error(
          `${name || fallbackGuid} GLBZ expanded to ${unpacked.length} bytes; expected ${unpackedSize} ` +
            `from ${compressed.length} compressed bytes (tail ${tail}).`
        );
      }
      if (ascii(unpacked, 0, 4) === 'glTF' && unpacked.length >= 20) {
        const glbLength = new DataView(
          unpacked.buffer,
          unpacked.byteOffset,
          unpacked.byteLength
        ).getUint32(8, true);
        if (glbLength <= unpacked.length) {
          glbs.push(unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + glbLength));
        }
      }
      packedCursor = packedRecordEnd + (packedSize & 1);
    }
    if (packedCursor > chunk.offset) continue;
    let cursor = chunk.offset;
    const end = chunk.offset + chunk.size;
    while (cursor + 12 <= end) {
      const glbOffset = findBytes(bytes, [0x67, 0x6c, 0x54, 0x46], cursor, end);
      if (glbOffset < 0 || glbOffset + 12 > end) break;
      const length = view.getUint32(glbOffset + 8, true);
      if (length >= 20 && glbOffset + length <= end) {
        glbs.push(arrayBuffer.slice(glbOffset, glbOffset + length));
        cursor = glbOffset + length;
      } else cursor = glbOffset + 4;
    }
  }
  return { guid: fallbackGuid, name, glbs };
}

// MSFS painted lines sample narrow regions of a shared material atlas. These normalized U
// coordinates and real-world dimensions are properties of the simulator line layouts, not of a
// particular airport or texture filename. Keeping them here lets custom package materials retain
// their authored pixels instead of replacing them with MapLibre dash patterns.
const MSFS_PAINTED_LINE_LAYOUTS = Object.freeze({
  'center-solid': lineLayout('Center line solid', 0.3, 25, 0.033203125, 0.0625),
  'edge-solid': lineLayout('Edge line solid', 0.45, 25, 0.03125, 0.11328125),
  'edge-dashed': lineLayout('Edge line dashed', 0.45, 12, 0.28125, 0.375, { dashed: true }),
  'hold-runway': lineLayout('Runway hold short', 0.9, 12.6, 0.03125, 0.2109375),
  'hold-ils': lineLayout('ILS hold short', 0.45, 12, 0.40625, 0.53125),
  'hold-taxiway': lineLayout('Taxiway hold short', 0.45, 12.6, 0.17578125, 0.2109375, {
    dashed: true,
  }),
  'service-center-dashed': lineLayout(
    'Service center dashed',
    0.225,
    22,
    0.681640625,
    0.712890625,
    { dashed: true }
  ),
  'service-edge-solid': lineLayout('Service edge solid', 0.3, 25, 0.8828125, 0.896484375),
  'service-edge-dashed': lineLayout('Service edge dashed', 0.6098, 4.878, 0.6328125, 0.71875, {
    dashed: true,
  }),
  'wide-yellow': lineLayout('Wide yellow', 1.05, 25, 0.033203125, 0.05859375),
  'wide-white': lineLayout('Wide white', 1.05, 25, 0.8828125, 0.896484375),
  'non-movement': lineLayout('Non-movement boundary', 0.9, 25, 0.0703125, 0.16015625),
  'enhanced-center': lineLayout('Enhanced center', 1.2, 25.62, 0.55078125, 0.61328125),
  'wide-red': lineLayout('Wide red', 1.05, 25, 0.93359375, 0.93359375),
  'slim-red': lineLayout('Slim red', 0.3, 25, 0.93359375, 0.93359375),
});

function lineLayout(label, widthMeters, repeatMeters, uMin, uMax, options = {}) {
  return { label, widthMeters, repeatMeters, uMin, uMax, ...options };
}

async function buildPaintedLineRenderGroups(collection, materialLibrary) {
  const materialUsage = new Map();
  for (const feature of collection.features) {
    const guid = String(feature.properties?.materialGuid || '').toLowerCase();
    const material = materialLibrary.get(guid);
    if (!material?.textureFile) continue;
    const entry = materialUsage.get(guid) || { material, features: [] };
    entry.features.push(feature);
    materialUsage.set(guid, entry);
  }

  const alphaAnalyses = new Map();
  for (const { material } of materialUsage.values()) {
    try {
      const buffer = await material.textureFile.arrayBuffer();
      const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
      const ktx2 =
        bytes.length === 12 &&
        [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (value, index) => bytes[index] === value
        );
      const image = ktx2
        ? await decodeKtx2Texture(buffer, { maximumEdge: 256 })
        : await decodeDdsOrBc7Texture(buffer, { maximumEdge: 256 });
      alphaAnalyses.set(material.guid, analyseLineAtlasPixels(image));
    } catch {
      // The main texture loader will report unsupported formats. Geometry remains eligible for the
      // honest procedural fallback when the source pixels cannot be decoded.
    }
  }

  const accumulators = new Map();
  const textureFiles = new Map();
  const layoutCounts = {};
  const layoutOverrides = {};
  let featureCount = 0;
  for (const [guid, usage] of materialUsage) {
    const alpha = alphaAnalyses.get(guid);
    if (!alpha) continue;
    for (const feature of usage.features) {
      const lineTypeLabel = String(feature.properties?.lineTypeLabel || 'DEFAULT');
      const expectedKey = expectedPaintedLineLayout(lineTypeLabel);
      const selectedLayout = selectPaintedLineAtlasLayout(alpha, expectedKey);
      const geometryLayout = expectedKey ? MSFS_PAINTED_LINE_LAYOUTS[expectedKey] : null;
      if (!selectedLayout || !geometryLayout) continue;
      const textureKey = selectedLayout.key;
      const textureLayout = selectedLayout.layout;
      const geometryKey = expectedKey;
      const backwards = /BACKWARD|_BACK(?:_|$)/.test(lineTypeLabel);
      const pattern = `${usage.material.pattern}--msfs-line--${textureKey}--geometry-${geometryKey}${backwards ? '-back' : ''}`;
      const vertices = buildMsfsLineTextureTriangles(
        feature.geometry?.coordinates,
        geometryLayout.widthMeters,
        geometryLayout.repeatMeters
      );
      if (!vertices.length) continue;
      const accumulatorKey = `${pattern}|${geometryLayout.widthMeters}|${geometryLayout.repeatMeters}`;
      const accumulator = accumulators.get(accumulatorKey) || {
        id: `painted-line-texture-${safeName(accumulatorKey)}`,
        pattern,
        vertices: [],
        triangleCount: 0,
        modelName: usage.material.name,
        materialName: usage.material.name,
        materialAlphaMode: 'BLEND',
        sourceOpacity: Math.max(0, Math.min(1, Number(usage.material.opacity ?? 1))),
        sourceTint: usage.material.diffuse || [1, 1, 1],
        hasSourceTint: (usage.material.diffuse || [1, 1, 1]).some((value) => value !== 1),
        placementPriority: 0,
        // PaintedLine objects occupy the MARKING slot in the documented airport hierarchy.
        renderStage: 7,
        materialOrder: 0,
        sourceSequence: Number(feature.properties?.sourceRecordOffset || 0),
        renderPass: 'overlay',
        layerOrder: 6_000,
        lineTexture: true,
        markingTexture: true,
        wrap: true,
        paintedLineRecordRanges: [],
        msfsLineLayout: {
          key: textureKey,
          label: textureLayout.label,
          uMin: textureLayout.uMin,
          uMax: textureLayout.uMax,
          reverseAcross: backwards,
          geometryKey,
          geometryLabel: geometryLayout.label,
          widthMeters: geometryLayout.widthMeters,
          repeatMeters: geometryLayout.repeatMeters,
        },
      };
      const recordVertexOffset = accumulator.vertices.length / 4;
      accumulator.vertices.push(...vertices);
      accumulator.triangleCount += vertices.length / 12;
      accumulator.paintedLineRecordRanges.push({
        sourceRecordOffset: Number(feature.properties?.sourceRecordOffset || 0),
        vertexOffset: recordVertexOffset,
        vertexCount: vertices.length / 4,
      });
      accumulators.set(accumulatorKey, accumulator);
      textureFiles.set(pattern, usage.material.textureFile);
      feature.properties.exactTextureRendered = true;
      feature.properties.exactTexturePattern = pattern;
      feature.properties.textureLayout = textureLayout.label;
      feature.properties.geometryLayout = geometryLayout.label;
      feature.properties.textureLayoutBasis = selectedLayout.basis;
      feature.properties.textureOccupiedBands = alpha.significantBands.map((band) => ({
        start: band.start,
        end: band.end,
        pixels: band.pixels,
      }));
      feature.properties.textureWidthMeters = geometryLayout.widthMeters;
      feature.properties.textureRepeatMeters = geometryLayout.repeatMeters;
      feature.properties.visualizationExactness =
        'exact-compiled-path; exact-package-albedo; source-derived-msfs-atlas-layout';
      featureCount += 1;
      layoutCounts[textureKey] = (layoutCounts[textureKey] || 0) + 1;
      if (selectedLayout.basis !== 'compiled-type-verified-slot-in-multi-band-atlas') {
        const key = `${lineTypeLabel}: ${expectedKey || 'unknown'} -> ${selectedLayout.basis}`;
        layoutOverrides[key] = (layoutOverrides[key] || 0) + 1;
      }
    }
  }

  const groups = mercatorTextureGroups([...accumulators.values()]).map((group) => ({
    ...group,
    triangleCount: group.vertices.length / 12,
  }));
  return { groups, textureFiles, featureCount, layoutCounts, layoutOverrides };
}

function expectedPaintedLineLayout(lineTypeLabel) {
  const label = String(lineTypeLabel).replace(/_LIGHTED$/, '');
  if (label === 'DEFAULT') return 'center-solid';
  if (label.includes('HOLD_SHORT_FORWARD') || label.includes('HOLD_SHORT_BACKWARD'))
    return 'hold-runway';
  if (label === 'ILS_HOLD_SHORT') return 'hold-ils';
  if (label === 'EDGE_LINE_SOLID') return 'edge-solid';
  if (label === 'EDGE_LINE_DASHED') return 'edge-dashed';
  if (label === 'HOLD_SHORT_TAXIWAY') return 'hold-taxiway';
  if (label === 'SERVICE_DASHED') return 'service-center-dashed';
  if (label === 'EDGE_SERVICE_SOLID') return 'service-edge-solid';
  if (label === 'EDGE_SERVICE_DASHED') return 'service-edge-dashed';
  if (label === 'WIDE_YELLOW') return 'wide-yellow';
  if (label === 'WIDE_WHITE') return 'wide-white';
  if (label === 'WIDE_RED') return 'wide-red';
  if (label === 'SLIM_RED') return 'slim-red';
  if (label === 'NON_MOVEMENT' || label === 'NON_MOVEMENT_BACK') return 'non-movement';
  if (label === 'ENHANCED_CENTER') return 'enhanced-center';
  return null;
}

function analyseLineAtlasPixels(image) {
  const rows = new Uint32Array(image.height);
  const columns = new Uint32Array(image.width);
  const mask = new Uint8Array(image.width * image.height);
  const cornerOffsets = [
    0,
    (image.width - 1) * 4,
    image.width * (image.height - 1) * 4,
    (image.width * image.height - 1) * 4,
  ];
  const background = [0, 1, 2, 3].map((channel) =>
    medianNumber(cornerOffsets.map((offset) => image.data[offset + channel]))
  );
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha <= 8) continue;
      const colorDistance = Math.max(
        Math.abs(image.data[offset] - background[0]),
        Math.abs(image.data[offset + 1] - background[1]),
        Math.abs(image.data[offset + 2] - background[2])
      );
      const alphaDistance = Math.abs(alpha - background[3]);
      const transparentBackground = background[3] <= 8;
      if (!transparentBackground && colorDistance <= 18 && alphaDistance <= 8) continue;
      mask[y * image.width + x] = 1;
      rows[y] += 1;
      columns[x] += 1;
    }
  }
  const bands = connectedOccupiedColumnBands(columns);
  const dominantPixels = Math.max(0, ...bands.map((band) => band.pixels));
  const significantBands = bands.filter((band) => band.pixels >= dominantPixels * 0.08);
  return {
    width: image.width,
    height: image.height,
    rows,
    columns,
    mask,
    background,
    bands,
    significantBands,
  };
}

function selectPaintedLineAtlasLayout(analysis, expectedKey) {
  const expected = expectedKey ? MSFS_PAINTED_LINE_LAYOUTS[expectedKey] : null;
  if (!expected || !analysis.significantBands.length) return null;
  if (analysis.significantBands.length === 1) {
    const band = analysis.significantBands[0];
    return {
      key: `source-band-${band.start}-${band.end}`,
      layout: {
        ...expected,
        label: `${expected.label}; source band ${band.start}-${band.end}`,
        uMin: band.start / analysis.width,
        uMax: (band.end + 1) / analysis.width,
      },
      basis: 'single-connected-source-alpha-or-colour-band',
    };
  }
  const evidence = lineWindowEvidence(analysis, expected);
  if (!evidence.visible) return null;
  return {
    key: expectedKey,
    layout: expected,
    basis: 'compiled-type-verified-slot-in-multi-band-atlas',
  };
}

function connectedOccupiedColumnBands(columns) {
  const bands = [];
  let start = null;
  let pixels = 0;
  for (let index = 0; index <= columns.length; index += 1) {
    const occupied = index < columns.length && columns[index] > 0;
    if (occupied) {
      if (start == null) start = index;
      pixels += Number(columns[index]);
      continue;
    }
    if (start != null) bands.push({ start, end: index - 1, pixels });
    start = null;
    pixels = 0;
  }
  return bands;
}

function medianNumber(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function lineWindowEvidence(alpha, layout) {
  if (!layout) return { visible: 0, coverage: 0, gapFraction: 0 };
  const start = Math.max(0, Math.floor(Math.min(layout.uMin, layout.uMax) * alpha.width));
  const end = Math.min(
    alpha.width,
    Math.max(start + 1, Math.ceil(Math.max(layout.uMin, layout.uMax) * alpha.width))
  );
  let visible = 0;
  let visibleRows = 0;
  for (let x = start; x < end; x += 1) visible += alpha.columns[x];
  for (let y = 0; y < alpha.height; y += 1) {
    let rowVisible = 0;
    for (let x = start; x < end; x += 1) {
      rowVisible += alpha.mask[y * alpha.width + x];
    }
    if (rowVisible) visibleRows += 1;
  }
  return {
    visible,
    coverage: visible / Math.max(1, (end - start) * alpha.height),
    gapFraction: 1 - visibleRows / Math.max(1, alpha.height),
  };
}

function buildMsfsLineTextureTriangles(coordinates, widthMeters, repeatMeters) {
  const points = [];
  for (const coordinate of coordinates || []) {
    if (!Array.isArray(coordinate) || !coordinate.slice(0, 2).every(Number.isFinite)) continue;
    const previous = points.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      points.push([Number(coordinate[0]), Number(coordinate[1])]);
    }
  }
  if (points.length < 2) return [];
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const metersPerLongitude = 111_320 * Math.cos((latitude * Math.PI) / 180);
  const local = points.map(([longitude, pointLatitude]) => ({
    x: longitude * metersPerLongitude,
    y: pointLatitude * 111_320,
  }));
  const cumulative = [0];
  const normals = [];
  for (let index = 1; index < local.length; index += 1) {
    const dx = local[index].x - local[index - 1].x;
    const dy = local[index].y - local[index - 1].y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return [];
    cumulative.push(cumulative.at(-1) + length);
    normals.push({ x: -dy / length, y: dx / length });
  }
  const halfWidth = Math.max(0.03, widthMeters) / 2;
  const sides = local.map((point, index) => {
    const previous = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    let normal =
      index === 0
        ? next
        : index === local.length - 1
          ? previous
          : {
              x: previous.x + next.x,
              y: previous.y + next.y,
            };
    const normalLength = Math.hypot(normal.x, normal.y) || 1;
    normal = { x: normal.x / normalLength, y: normal.y / normalLength };
    const denominator = Math.max(0.35, Math.abs(normal.x * next.x + normal.y * next.y));
    const miter = Math.min(halfWidth * 2.5, halfWidth / denominator);
    return {
      left: [
        (point.x + normal.x * miter) / metersPerLongitude,
        (point.y + normal.y * miter) / 111_320,
      ],
      right: [
        (point.x - normal.x * miter) / metersPerLongitude,
        (point.y - normal.y * miter) / 111_320,
      ],
    };
  });

  const output = [];
  for (let index = 0; index < sides.length - 1; index += 1) {
    const start = cumulative[index] / repeatMeters;
    const base = Math.floor(start);
    const startU = start - base;
    const endU = cumulative[index + 1] / repeatMeters - base;
    appendLineTriangle(
      output,
      sides[index].left,
      startU,
      0,
      sides[index].right,
      startU,
      1,
      sides[index + 1].left,
      endU,
      0
    );
    appendLineTriangle(
      output,
      sides[index].right,
      startU,
      1,
      sides[index + 1].right,
      endU,
      1,
      sides[index + 1].left,
      endU,
      0
    );
  }
  return output;
}

function appendLineTriangle(output, ...values) {
  for (let index = 0; index < values.length; index += 3) {
    output.push(values[index][0], values[index][1], values[index + 1], values[index + 2]);
  }
}

export function buildTaxiwaySurfaceRenderGroups(paths) {
  const accumulators = new Map();
  let featureCount = 0;
  for (const path of paths || []) {
    // Most pavement must carry the compiled drawSurface bit. A small class of surface-0 TAXI/PATH
    // junction records omits it even though the short, full-width segment closes authored pavement
    // between adjacent paths. Keep that fallback bounded by path class and metric geometry.
    if (!taxiwayPathHasFallbackSurface(path)) continue;
    const vertices = buildMsfsLineTextureTriangles([path.start, path.end], path.widthMeters, 16);
    if (!vertices.length) continue;
    const surface = Number(path.surface || 0);
    const pathType = Number(path.pathType || 0);
    const key = `${surface}|${pathType}`;
    let accumulator = accumulators.get(key);
    if (!accumulator) {
      const origin = mercatorPosition(path.start[0], path.start[1]);
      accumulator = {
        id: `taxiway-surface-${surface}-${pathType}`,
        modelName: `Compiled ${taxiwayPathTypeLabel(pathType)} surface ${surface}`,
        meshGuid: `taxiway-surface-${surface}-${pathType}`,
        pattern: `msfs-taxiway-surface-${surface}-${pathType}`,
        origin,
        vertices: [],
        triangleCount: 0,
        materialAlphaMode: 'OPAQUE',
        materialName: `BGL surface ${surface}`,
        sourceOpacity: 1,
        sourceTint: taxiwaySurfaceColor(surface, pathType).map((value) => value / 255),
        hasSourceTint: false,
        unresolvedMaterial: true,
        placementPriority: 0,
        drawBefore: null,
        // This is an opaque reconstruction from TaxiwayPath width, not the simulator's authored
        // pavement mesh. Draw it below exact apron records so it fills genuine gaps without
        // covering source-backed concrete, asphalt, joints, drains or other apron details.
        renderStage: 0,
        materialOrder: 0,
        sourceSequence: Number(path.sourceRecordOffset || 0),
        renderPass: 'taxiway-base',
        layerOrder: 3_000,
        lineTexture: false,
        markingTexture: false,
        wrap: true,
        taxiwaySurface: surface,
        taxiwayPathType: pathType,
        taxiwayRecordRanges: [],
      };
      accumulators.set(key, accumulator);
    }
    const vertexOffset = accumulator.vertices.length / 4;
    for (let index = 0; index < vertices.length; index += 4) {
      const mercator = mercatorPosition(vertices[index], vertices[index + 1]);
      accumulator.vertices.push(
        mercator[0] - accumulator.origin[0],
        mercator[1] - accumulator.origin[1],
        vertices[index + 2],
        1 - vertices[index + 3]
      );
    }
    const vertexCount = accumulator.vertices.length / 4 - vertexOffset;
    accumulator.triangleCount += vertexCount / 3;
    accumulator.taxiwayRecordRanges.push({
      sourceRecordOffset: path.sourceRecordOffset,
      vertexOffset,
      vertexCount,
      widthMeters: path.widthMeters,
      pathTypeRaw: path.pathTypeRaw,
      pathType,
      surface,
      drawSurface: path.drawSurface,
      drawDetail: path.drawDetail,
      markingFlags: path.markingFlags,
    });
    featureCount += 1;
  }
  return {
    groups: [...accumulators.values()].map((group) => ({
      ...group,
      vertices: new Float32Array(group.vertices),
    })),
    featureCount,
  };
}

export function taxiwayPathHasFallbackSurface(path) {
  if (!path?.geometryResolved || !path.end) return false;
  if (path.drawSurface) return true;
  const pathType = Number(path.pathType);
  const surface = Number(path.surface);
  const widthMeters = Number(path.widthMeters);
  const lengthMeters = Number(path.lengthMeters);
  return (
    (pathType === 1 || pathType === 4) &&
    surface === 0 &&
    widthMeters >= 20 &&
    widthMeters <= 80 &&
    lengthMeters >= 1 &&
    lengthMeters <= 40 &&
    lengthMeters <= widthMeters
  );
}

function taxiwayPathTypeLabel(pathType) {
  return (
    { 1: 'taxiway', 2: 'runway', 3: 'parking', 4: 'path', 5: 'closed', 6: 'vehicle' }[pathType] ||
    `path ${pathType}`
  );
}

function taxiwaySurfaceColor(surface, pathType) {
  // Surface 0 is the compiled default material selector. There are no package pixels or a GUID
  // to recover for it; the path class is therefore the strongest remaining evidence. Keep this
  // deliberately neutral so package aprons and projected-mesh decals remain authoritative.
  if (pathType === 2) return [66, 69, 71];
  if (pathType === 6) return [58, 62, 64];
  if (surface === 0) return [72, 76, 78];
  return [82, 84, 83];
}

export function buildApronRenderGroups(apronMeshes, materialLibrary) {
  const accumulators = new Map();
  const textureFiles = new Map();
  const resolvedMaterials = new Set();
  const unresolvedMaterials = new Set();
  const identifiedMaterials = new Set();
  const missingDescriptorMaterials = new Set();
  const packageMaterialLibraryPresent = materialLibrary.size > 0;
  const airportAnchor =
    apronMeshes.find((mesh) => mesh.vertices.length)?.properties?.airportReference ||
    apronMeshes.find((mesh) => mesh.vertices.length)?.vertices[0];
  if (!airportAnchor)
    return {
      groups: [],
      textureFiles,
      resolvedMaterials,
      unresolvedMaterials,
      identifiedMaterials,
      missingDescriptorMaterials,
    };
  const worldUvReferenceLatitude = airportAnchor[1];

  for (const mesh of apronMeshes) {
    const properties = mesh.properties;
    if (!properties.drawSurface) continue;
    const guid = String(properties.materialGuid || '').toLowerCase();
    const material = materialLibrary.get(guid);
    if (material) identifiedMaterials.add(guid);
    else missingDescriptorMaterials.add(guid || 'unknown');
    if (!material?.textureFile) {
      unresolvedMaterials.add(guid || 'unknown');
    } else {
      resolvedMaterials.add(guid);
    }

    const priority = Number(properties.priority || 0);
    const drawStage = Number(properties.drawStage || 0);
    const coloration = properties.materialColoration || decodeMaterialColoration(0);
    const sourceOpacity = Math.max(
      0,
      Math.min(
        1,
        Number(properties.opacity ?? 1) *
          Number(material?.opacity ?? 1) *
          (coloration.alpha > 0 ? coloration.alpha / 255 : 1)
      )
    );
    const colorationMode = globalThis.__msfsPreviewApronColorationModeOverride || 'compiled';
    const hasRecordTint = colorationMode !== 'material' && hasVisibleRecordTint(coloration);
    const recordTint = hasRecordTint
      ? [coloration.red / 255, coloration.green / 255, coloration.blue / 255]
      : [1, 1, 1];
    const materialTint = material?.diffuse || [1, 1, 1];
    const tint = recordTint.map((value, index) => value * Number(materialTint[index] ?? 1));
    const hasTint = tint.some((value) => Math.abs(value - 1) > 1e-6);
    const tintHex = tint
      .map((value) =>
        Math.round(Math.max(0, Math.min(1, value)) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('');
    // Keep geometry evidence ready even when the package supplies a texture file. The package
    // texture remains authoritative when it decodes, but this evidence lets the render bundle
    // install a safe solid fallback if decoding fails later.
    const fallbackEvidence = unresolvedApronFallbackEvidence(mesh, {
      materialName: material?.name || '',
    });
    const fallbackModeSuffix = fallbackEvidence
      ? `--${fallbackEvidence.renderMode}--${fallbackEvidence.appearance}`
      : '';
    const basePattern =
      material?.pattern ||
      `bars-apron-fallback-${safeName(guid || 'unknown')}${fallbackModeSuffix}`;
    const fallbackAppearanceSuffix = fallbackEvidence
      ? `--fallback-${fallbackEvidence.appearance}`
      : '';
    const patternWithAppearance = `${basePattern}${fallbackAppearanceSuffix}`;
    const pattern = hasTint ? `${patternWithAppearance}--tint-${tintHex}` : patternWithAppearance;
    // Stretch decals need clamp sampling while tiled pavement needs repeat sampling. Keep them in
    // separate batches even when a package reuses one material GUID for both projection modes.
    // Combining them forced every atlas decal to repeat and bled unrelated cells across its edge.
    const samplerMode = properties.stretchUv ? 'clamp' : 'repeat';
    const key = `${guid}|${drawStage}|${priority}|${sourceOpacity}|${tint.join(',')}|${samplerMode}|${fallbackEvidence?.renderMode || 'resolved'}|${fallbackEvidence?.appearance || 'source-color'}`;
    if (material?.textureFile) textureFiles.set(pattern, material.textureFile);
    let accumulator = accumulators.get(key);
    if (!accumulator) {
      const originCoordinate = mesh.vertices[0];
      accumulator = {
        // Every render batch needs its own WebGL buffer identity. The accumulator key also
        // distinguishes opacity, tint, sampler and fallback state; omitting those fields from the
        // id made later buffers overwrite earlier geometry while the render loop retained every
        // texture group. Snap edges stayed correct but textures were then drawn on the wrong apron.
        id: `apron-material-${safeName(guid)}-${drawStage}-${priority}-${accumulators.size}`,
        modelName: material?.name || `Unresolved apron ${guid || 'unknown'}`,
        meshGuid: guid,
        pattern,
        origin: mercatorPosition(originCoordinate[0], originCoordinate[1]),
        vertices: [],
        triangleCount: 0,
        materialAlphaMode:
          /(blend|transparent)/i.test(material?.blendMode || '') || sourceOpacity < 1
            ? 'BLEND'
            : 'OPAQUE',
        materialName: material?.name || '',
        materialDescriptorResolved: Boolean(material),
        materialDescriptorSource: material?.descriptorSource || '',
        materialDescriptorSourceKind: material?.descriptorSourceKind || '',
        expectedTexturePath: material?.texturePath || '',
        sourceOpacity,
        sourceTint: tint,
        hasSourceTint: hasTint,
        materialColoration: coloration,
        colorationMode,
        unresolvedMaterial: !material?.textureFile,
        packageMaterialLibraryPresent,
        fallbackRenderMode: fallbackEvidence?.renderMode || null,
        fallbackAppearance: fallbackEvidence?.appearance || null,
        fallbackEvidenceBasis: fallbackEvidence?.basis || null,
        placementPriority: priority,
        drawBefore: null,
        // Compiled billion-bands encode the two apron force-order switches: the normal APRON
        // slot, above RUNWAY, and above every marking slot respectively.
        renderStage: [1, 6, 12][drawStage] ?? 1,
        apronDrawStage: drawStage,
        materialOrder: 0,
        sourceSequence: Number(properties.sourceRecordOffset || 0),
        renderPass: 'apron',
        layerOrder: 4_000 + priority,
        lineTexture: false,
        markingTexture:
          /paint/i.test(material?.surfaceType || '') || isMarkingTexture(material?.name || ''),
        wrap: !properties.stretchUv,
        apronUvMode: properties.stretchUv
          ? 'stretch'
          : properties.localUv
            ? 'local-tiled'
            : 'world-tiled',
        apronRecordRanges: [],
      };
      accumulators.set(key, accumulator);
    }

    // Local UV is object-relative by contract: translating the apron must keep its material
    // aligned. Compiled triangle vertex order is an optimizer detail, so use the object's bounds
    // centre (the editor texture gizmo origin), never the first serialized triangle vertex.
    const uvAnchorMode = globalThis.__msfsPreviewApronUvOriginOverride || 'center';
    const geographicBounds = mesh.vertices.reduce(
      (bounds, [longitude, latitude]) => [
        Math.min(bounds[0], longitude),
        Math.min(bounds[1], latitude),
        Math.max(bounds[2], longitude),
        Math.max(bounds[3], latitude),
      ],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    const uvAnchor = properties.localUv
      ? uvAnchorMode === 'airport'
        ? properties.airportReference
        : uvAnchorMode === 'first'
          ? mesh.vertices[0]
          : [
              (geographicBounds[0] + geographicBounds[2]) / 2,
              (geographicBounds[1] + geographicBounds[3]) / 2,
            ]
      : mesh.vertices[0];
    const sourceRotation = Number(properties.textureRotation || 0);
    const rotationMode = globalThis.__msfsPreviewApronRotationModeOverride || 'compiled';
    const rotation =
      rotationMode === 'inverse'
        ? -sourceRotation
        : rotationMode === 'heading-clockwise'
          ? Math.PI / 2 - sourceRotation
          : rotationMode === 'heading-counterclockwise'
            ? sourceRotation - Math.PI / 2
            : sourceRotation;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const tiling =
      Math.abs(Number(properties.tiling)) > 1e-6 ? Math.abs(Number(properties.tiling)) : 1;
    const metricVertices = mesh.vertices.map((coordinate) => {
      const [east, north] = properties.localUv
        ? coordinateDeltaMeters(coordinate, uvAnchor)
        : worldTextureMeters(coordinate, worldUvReferenceLatitude);
      return [east * cosine + north * sine, -east * sine + north * cosine];
    });
    const metricBounds = metricVertices.reduce(
      (bounds, [east, north]) => [
        Math.min(bounds[0], east),
        Math.min(bounds[1], north),
        Math.max(bounds[2], east),
        Math.max(bounds[3], north),
      ],
      [Infinity, Infinity, -Infinity, -Infinity]
    );
    // Absolute world UVs are intentionally large. Remove a whole-tile base per
    // apron so Float32 upload retains the phase without changing repeating UVs.
    const worldUvBase =
      properties.localUv || properties.stretchUv
        ? [0, 0]
        : [Math.floor(metricVertices[0][0] / tiling), Math.floor(metricVertices[0][1] / tiling)];
    let recordUvBase = null;
    const recordVertexOffset = accumulator.vertices.length / 4;
    for (const triangle of mesh.triangles) {
      for (const vertexIndex of triangle) {
        const coordinate = mesh.vertices[vertexIndex];
        const mercator = mercatorPosition(coordinate[0], coordinate[1]);
        const [east, north] = metricVertices[vertexIndex];
        let u;
        let v;
        if (properties.stretchUv) {
          u = (east - metricBounds[0]) / Math.max(metricBounds[2] - metricBounds[0], 1e-6);
          v = (north - metricBounds[1]) / Math.max(metricBounds[3] - metricBounds[1], 1e-6);
        } else {
          u = east / tiling - worldUvBase[0];
          v = north / tiling - worldUvBase[1];
        }
        if (!properties.stretchUv) {
          // The editor serializes UV translation as signed percentage points. Its gizmo moves the
          // image relative to the apron, so sampling moves by the inverse translation. This is
          // texture space and is therefore independent of the material's world-space tiling size.
          u -= Number(properties.textureOffsetU ?? 0) / 100;
          v -= Number(properties.textureOffsetV ?? 0) / 100;
        }
        u *= Number(material?.uvScaleU ?? 1);
        v *= Number(material?.uvScaleV ?? 1);
        // Library.xml stores UVRotate in editor degrees, while the compiled apron texture
        // rotation above is radians. Apply the material-local scale/rotation/offset after the
        // apron projection so both authored transforms survive.
        const materialRotation = (Number(material?.uvRotate ?? 0) * Math.PI) / 180;
        if (Math.abs(materialRotation) > 1e-12) {
          const materialCosine = Math.cos(materialRotation);
          const materialSine = Math.sin(materialRotation);
          [u, v] = [materialCosine * u - materialSine * v, materialSine * u + materialCosine * v];
        }
        u += Number(material?.uvOffsetU ?? 0);
        v += Number(material?.uvOffsetV ?? 0);
        if (properties.flipUv) {
          // An asymmetric fixture compiled by the MSFS 2024 SDK proves flipUV mirrors U only.
          // The override remains available solely for regression diagnostics.
          const flipMode = globalThis.__msfsPreviewApronFlipModeOverride || 'u';
          if (flipMode === 'u' || flipMode === 'both') {
            u = properties.stretchUv ? 1 - u : -u;
          }
          if (flipMode === 'v' || flipMode === 'both') {
            v = properties.stretchUv ? 1 - v : -v;
          }
        }
        // Third-party airport compilers legitimately retain very large whole-repeat offsets
        // (Brisbane reaches roughly 9,000 UV repeats). Uploading those values as Float32 loses
        // sub-texel precision and causes zoom-dependent shimmer/malformed atlas sampling. Remove
        // one integer repeat base per apron record; REPEAT sampling is unchanged and all vertices
        // retain their authored relative interpolation across tile boundaries.
        if (!properties.stretchUv) {
          recordUvBase ||= [Math.floor(u), Math.floor(v)];
          u -= recordUvBase[0];
          v -= recordUvBase[1];
        }
        accumulator.vertices.push(
          mercator[0] - accumulator.origin[0],
          mercator[1] - accumulator.origin[1],
          u,
          // Decoders return top-to-bottom source rows, while typed-array WebGL uploads address the
          // first supplied row at v=0. Store the one required conversion here. The preview shader
          // must not flip this a second time (the prior double flip mirrored YMML/YBBN vertically).
          1 - v
        );
      }
      accumulator.triangleCount += 1;
    }
    accumulator.apronRecordRanges.push({
      sourceRecordOffset: Number(properties.sourceRecordOffset || 0),
      vertexOffset: recordVertexOffset,
      vertexCount: accumulator.vertices.length / 4 - recordVertexOffset,
      textureRotation: Number(properties.textureRotation || 0),
      effectiveTextureRotation: rotation,
      rotationMode,
      textureOffsetU: Number(properties.textureOffsetU || 0),
      textureOffsetV: Number(properties.textureOffsetV || 0),
      localUv: Boolean(properties.localUv),
      stretchUv: Boolean(properties.stretchUv),
      flipUv: Boolean(properties.flipUv),
      fallbackRenderMode: fallbackEvidence?.renderMode || null,
      fallbackEvidence,
    });
  }

  const groups = [...accumulators.values()].map((group) => ({
    ...group,
    vertices: new Float32Array(group.vertices),
  }));
  return {
    groups,
    textureFiles,
    resolvedMaterials,
    unresolvedMaterials,
    identifiedMaterials,
    missingDescriptorMaterials,
  };
}

export function attachApronFallbackDiagnostics(apronBoundaries, groups) {
  const diagnosticsByRecordOffset = new Map();
  for (const group of groups ?? []) {
    for (const range of group.apronRecordRanges ?? []) {
      const sourceRecordOffset = Number(range.sourceRecordOffset);
      if (!Number.isFinite(sourceRecordOffset)) continue;
      const diagnostic = {
        fallbackRenderMode: range.fallbackRenderMode ?? group.fallbackRenderMode ?? null,
        fallbackEvidenceBasis:
          range.fallbackEvidence?.basis ?? group.fallbackEvidenceBasis ?? null,
      };
      for (const [key, value] of Object.entries(range.fallbackEvidence ?? {})) {
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
          diagnostic[`fallback${key[0].toUpperCase()}${key.slice(1)}`] = value;
        }
      }
      diagnosticsByRecordOffset.set(sourceRecordOffset, diagnostic);
    }
  }
  for (const feature of apronBoundaries?.features ?? []) {
    const sourceRecordOffset = Number(feature.properties?.sourceRecordOffset);
    const diagnostic = diagnosticsByRecordOffset.get(sourceRecordOffset);
    if (diagnostic) feature.properties = { ...feature.properties, ...diagnostic };
  }
  return apronBoundaries;
}

export function unresolvedApronFallbackEvidence(mesh, { materialName = '' } = {}) {
  const properties = mesh.properties || {};
  const localVertices = mesh.vertices.map((coordinate) =>
    coordinateDeltaMeters(coordinate, mesh.vertices[0])
  );
  const occupiedLocalVertices = [...new Set(mesh.triangles.flat())]
    .map((vertexIndex) => localVertices[vertexIndex])
    .filter(Boolean);
  const bounds = localVertices.reduce(
    (current, coordinate) => [
      Math.min(current[0], coordinate[0]),
      Math.min(current[1], coordinate[1]),
      Math.max(current[2], coordinate[0]),
      Math.max(current[3], coordinate[1]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity]
  );
  let areaSquareMeters = 0;
  for (const triangle of mesh.triangles) {
    const first = localVertices[triangle[0]];
    const second = localVertices[triangle[1]];
    const third = localVertices[triangle[2]];
    areaSquareMeters +=
      Math.abs(
        (second[0] - first[0]) * (third[1] - first[1]) -
          (third[0] - first[0]) * (second[1] - first[1])
      ) / 2;
  }
  const boundsAreaSquareMeters = Math.max((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]), 0.001);
  const coverageRatio = areaSquareMeters / boundsAreaSquareMeters;
  const coloration = properties.materialColoration || {};
  const normalizedMaterialName = String(materialName).toLowerCase();
  const namedAlphaPatternCarrier = /(concrete.*joint|hatched|zebra)/i.test(materialName);
  const namedAsphalt = /asphalt/i.test(materialName);
  const sourceColored =
    Number(coloration.alpha || 0) > 0 && hasVisibleRecordTint(coloration);
  const triangleDensityPer1000SquareMeters =
    (mesh.triangles.length * 1000) / Math.max(areaSquareMeters, 0.001);
  const boundsWidthMeters = Math.max(bounds[2] - bounds[0], 0.001);
  const boundsHeightMeters = Math.max(bounds[3] - bounds[1], 0.001);
  const boundsAspectRatio =
    Math.max(boundsWidthMeters, boundsHeightMeters) /
    Math.min(boundsWidthMeters, boundsHeightMeters);
  const orientedBounds = minimumAreaOrientedBounds(occupiedLocalVertices);
  const orientedCoverageRatio = areaSquareMeters / Math.max(orientedBounds.areaSquareMeters, 0.001);
  const orientedShortSideMeters = Math.sqrt(
    orientedBounds.areaSquareMeters / Math.max(orientedBounds.aspectRatio, 1)
  );
  const orientedLongSideMeters = orientedShortSideMeters * orientedBounds.aspectRatio;
  const denseBoundsCoverage =
    mesh.triangles.length >= 6 && coverageRatio >= 0.42 && triangleDensityPer1000SquareMeters >= 2;
  // Concave and articulated pavement can legitimately occupy far less than half of its axis-
  // aligned bounds. Confirmed taxiway continuations contain 112-132 triangles over
  // 2,813-5,237 m² at 25-40 triangles/1,000 m², but cover only 0.29-0.36 of their rectangular
  // bounds. Treat that topology as solid evidence only for ordinary stage-0 world-tiled surfaces;
  // stretch/local UV and late-stage records remain possible alpha-mask carriers.
  const complexFilledPavement =
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    mesh.triangles.length >= 24 &&
    areaSquareMeters >= 500 &&
    coverageRatio >= 0.2 &&
    triangleDensityPer1000SquareMeters >= 4;
  // Some ordinary taxiway/apron panels are intentionally simple quads or pentagons rather than
  // heavily tessellated meshes. Require the compiled non-ground-merging base-layer signature plus
  // large metric area, full opacity/colour and modest coverage/density before treating those
  // missing pixels as solid pavement. This admits confirmed 2-21 triangle panels without admitting
  // ground-merging alpha carriers or sparse, colourless three-triangle slabs.
  const largeSimplePavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 2 &&
    areaSquareMeters >= 1500 &&
    coverageRatio >= 0.15 &&
    triangleDensityPer1000SquareMeters >= 1;
  // Medium stage-0 panels use the same compiled pavement contract as the larger base meshes, but
  // a handful of vertices is enough to describe them. Oriented occupancy and a useful short side
  // distinguish these panels from sparse airport-wide masks and narrow painted carriers.
  const mediumSimplePavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 3 &&
    areaSquareMeters >= 250 &&
    areaSquareMeters < 1500 &&
    orientedShortSideMeters >= 8 &&
    orientedCoverageRatio >= 0.7;
  // Higher-priority stage-0 records are often exact darker pavement insets over the base apron.
  // Keep the rule to compact, near-solid, source-coloured footprints so an unresolved texture does
  // not erase a real asphalt or concrete overlay.
  const compactPriorityPavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) >= 2 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 2 &&
    mesh.triangles.length <= 24 &&
    areaSquareMeters >= 100 &&
    areaSquareMeters <= 1500 &&
    orientedShortSideMeters >= 5 &&
    orientedCoverageRatio >= 0.75;
  // A two-triangle stage-0 strip can be an authored pavement joint or border. Its oriented bounds
  // are much more useful than the axis-aligned box for rotated strips.
  const narrowPavementDetail =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 2 &&
    areaSquareMeters >= 20 &&
    areaSquareMeters <= 500 &&
    orientedShortSideMeters >= 0.4 &&
    orientedShortSideMeters <= 3 &&
    orientedLongSideMeters >= 15 &&
    orientedBounds.aspectRatio >= 8 &&
    orientedCoverageRatio >= 0.85;
  // Medium panels can be deliberately simple pentagons/trapezoids and fall just below the
  // broad-area test above. Require a tightly bounded, fully opaque, non-ground-merging stage-0
  // world surface with enough occupied area and density. The upper area bound is important:
  // airport-spanning sparse carriers remain geometry-only even when their compiled RGB is nonzero.
  const compactSimplePavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 3 &&
    areaSquareMeters >= 1000 &&
    areaSquareMeters <= 5000 &&
    coverageRatio >= 0.25 &&
    triangleDensityPer1000SquareMeters >= 2;
  // A long rotated runway/taxiway can occupy only a small fraction of its axis-aligned bounds
  // while almost completely filling its minimum-area oriented bounds. Use that rotation-invariant
  // evidence for fully opaque, source-coloured stage-0 pavement only. Requiring a near-solid,
  // highly elongated oriented footprint excludes disconnected sparse carriers whose bounding box
  // merely happens to span an airport.
  const elongatedOrientedPavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 4 &&
    areaSquareMeters >= 5_000 &&
    orientedLongSideMeters >= 500 &&
    orientedShortSideMeters >= 5 &&
    orientedBounds.aspectRatio >= 10 &&
    orientedCoverageRatio >= 0.85;
  // Large authored pavement panels can be one exact quad. Triangle density becomes artificially
  // tiny as that rectangle grows, so use its near-solid axis and oriented coverage instead.
  // Requiring a broad short side and bounded area keeps narrow marking carriers and airport-wide
  // masks out of this source-coloured stage-0 fallback.
  const largeSolidQuadPavement =
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 2 &&
    areaSquareMeters >= 5_000 &&
    areaSquareMeters <= 50_000 &&
    coverageRatio >= 0.85 &&
    orientedCoverageRatio >= 0.95 &&
    orientedShortSideMeters >= 15 &&
    orientedLongSideMeters >= 100 &&
    orientedBounds.aspectRatio <= 20;
  // Ground-merging does not always mean an alpha-mask carrier. Road networks can compile as many
  // disconnected, source-coloured stage-0 pavement triangles, while broad car parks can compile
  // as a handful of near-solid panels. Admit those two bounded topologies without treating a
  // simple or colourless ground-merging plate as opaque pavement.
  const groundMergingRoadPavement =
    Boolean(properties.groundMerging) &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.84 &&
    mesh.triangles.length >= 24 &&
    areaSquareMeters >= 1_000 &&
    orientedShortSideMeters >= 8 &&
    orientedLongSideMeters >= 100 &&
    orientedCoverageRatio >= 0.1 &&
    triangleDensityPer1000SquareMeters >= 2;
  // Some compact road overlays carry useful geometry and opacity but no compiled RGB. Keep this
  // separate from the source-coloured road rule and require a dense, bounded multi-triangle
  // footprint so broad or lightly tessellated colourless alpha carriers remain transparent.
  const colorlessGroundMergingRoadPavement =
    !sourceColored &&
    Boolean(properties.groundMerging) &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.priority || 0) >= 1 &&
    Number(properties.opacity ?? 1) >= 0.45 &&
    Number(properties.opacity ?? 1) <= 0.6 &&
    mesh.triangles.length >= 24 &&
    mesh.triangles.length <= 96 &&
    areaSquareMeters >= 500 &&
    areaSquareMeters <= 5_000 &&
    orientedShortSideMeters >= 10 &&
    orientedLongSideMeters >= 100 &&
    orientedLongSideMeters <= 500 &&
    orientedCoverageRatio >= 0.15 &&
    triangleDensityPer1000SquareMeters >= 10;
  const groundMergingSolidPavement =
    Boolean(properties.groundMerging) &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 0 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 4 &&
    mesh.triangles.length <= 24 &&
    areaSquareMeters >= 5_000 &&
    areaSquareMeters <= 75_000 &&
    orientedShortSideMeters >= 50 &&
    orientedLongSideMeters >= 100 &&
    orientedCoverageRatio >= 0.85 &&
    orientedBounds.aspectRatio <= 8;
  const ordinaryPavementLayer = Number(properties.drawStage || 0) === 0 && !properties.stretchUv;
  const denselyTriangulated =
    ordinaryPavementLayer &&
    (denseBoundsCoverage ||
      complexFilledPavement ||
      largeSimplePavement ||
      mediumSimplePavement ||
      compactPriorityPavement ||
      compactSimplePavement ||
      elongatedOrientedPavement ||
      largeSolidQuadPavement ||
      groundMergingRoadPavement ||
      groundMergingSolidPavement ||
      colorlessGroundMergingRoadPavement);
  const compactAuthoredDetailEvidence =
    sourceColored &&
    !namedAlphaPatternCarrier &&
    !properties.stretchUv &&
    Number(properties.priority || 0) >= 2 &&
    areaSquareMeters <= 400 &&
    mesh.triangles.length >= 2 &&
    coverageRatio >= 0.05 &&
    Number(properties.opacity ?? 1) > 0;
  const visibleSolidEvidence =
    (sourceColored || colorlessGroundMergingRoadPavement) &&
    !namedAlphaPatternCarrier &&
    denselyTriangulated &&
    !compactAuthoredDetailEvidence &&
    Number(properties.opacity ?? 1) > 0;
  // Authored local+stretch quads at elevated priority/stage are commonly texture carriers for
  // paint or other linear ground details. Their compiled mesh is the strongest available
  // footprint evidence when pixels are missing, so the browser-owned fallback fills every exact
  // triangle instead of inserting another guessed stripe inside it. Tint, opacity and ordering
  // remain compiled evidence, and the solid fill is clearly labelled rather than presented as
  // simulator pixels.
  const elongatedStretchCarrierEvidence =
    sourceColored &&
    !namedAlphaPatternCarrier &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    mesh.triangles.length >= 2 &&
    mesh.triangles.length <= 12 &&
    boundsAspectRatio >= 1.6 &&
    (Number(properties.drawStage || 0) > 0 || Number(properties.priority || 0) > 0) &&
    Number(properties.opacity ?? 1) > 0;
  // Some authored symbols are nearly square rather than linear. A local+stretch, late/high
  // priority, fully coloured compact mesh is still an explicit decal footprint; requiring an
  // elongated aspect ratio made compact white symbols silently disappear. Limit this to
  // genuinely compact, substantially occupied carriers so large possible alpha masks stay hidden.
  const compactStretchDetailEvidence =
    sourceColored &&
    !namedAlphaPatternCarrier &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    mesh.triangles.length >= 2 &&
    mesh.triangles.length <= 12 &&
    areaSquareMeters <= 30 &&
    coverageRatio >= 0.25 &&
    Number(properties.drawStage || 0) > 0 &&
    Number(properties.priority || 0) >= 2 &&
    Number(properties.opacity ?? 1) > 0;
  const compactInsetDetailEvidence =
    sourceColored &&
    !properties.groundMerging &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 4 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 2 &&
    areaSquareMeters >= 4 &&
    areaSquareMeters <= 20 &&
    orientedBounds.aspectRatio <= 1.35 &&
    orientedCoverageRatio >= 0.95;
  // Some compiled stage-2 marking records lose both their material pixels and colour. The exact
  // mesh still provides useful evidence when it is a small, substantially occupied, fully opaque
  // paint footprint. Keep the rule deliberately bounded so colourless base pavement, broad alpha
  // carriers and ground-merging overlays remain hidden instead of becoming invented white slabs.
  const colorlessCompactStage2MarkingEvidence =
    !sourceColored &&
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 4 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 2 &&
    mesh.triangles.length <= 96 &&
    areaSquareMeters >= 1 &&
    areaSquareMeters <= 300 &&
    boundsAreaSquareMeters <= 600 &&
    boundsAspectRatio <= 15 &&
    coverageRatio >= 0.4;
  // A separate stage-2 signature covers narrow local+stretch marking strips. Requiring a very
  // elongated, near-solid oriented footprint distinguishes an exact linear paint carrier from a
  // sparse or disconnected texture mask. The fallback fills the decoded triangles only.
  const colorlessLinearStage2MarkingEvidence =
    !sourceColored &&
    !properties.groundMerging &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 4 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length >= 2 &&
    mesh.triangles.length <= 12 &&
    areaSquareMeters >= 1 &&
    areaSquareMeters <= 200 &&
    boundsAreaSquareMeters <= 200 &&
    boundsAspectRatio >= 8 &&
    coverageRatio >= 0.75 &&
    orientedCoverageRatio >= 0.9;
  // Wider runway symbols can compile as one fully occupied local+stretch quad rather than a
  // narrow strip. Admit only a two-triangle, near-solid stage-2 plate with a modest metric bound.
  // This keeps larger texture carriers and partially occupied alpha masks transparent.
  const colorlessFilledStage2MarkingEvidence =
    !sourceColored &&
    !properties.groundMerging &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 4 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 2 &&
    areaSquareMeters >= 30 &&
    areaSquareMeters <= 550 &&
    boundsAreaSquareMeters <= 550 &&
    boundsAspectRatio <= 8 &&
    coverageRatio >= 0.95 &&
    orientedCoverageRatio >= 0.98;
  // A single triangle can be one authored component of a compact runway arrow. Accept it only
  // when the stage and priority identify a late marking, the triangle occupies half of a small
  // rectangular bound, and the compiled coloration has no visible tint.
  const colorlessTriangularStage2MarkingEvidence =
    !sourceColored &&
    !properties.groundMerging &&
    !properties.localUv &&
    !properties.stretchUv &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 8 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 1 &&
    areaSquareMeters >= 1 &&
    areaSquareMeters <= 50 &&
    boundsAreaSquareMeters <= 100 &&
    coverageRatio >= 0.45 &&
    coverageRatio <= 0.55;
  // Full-length runway-edge paint is much larger than an ordinary symbol but still compiles as
  // one exact quad. Require a near-solid oriented rectangle at least 500 m long and no more than
  // 3 m wide so large, sparse texture carriers remain transparent.
  const colorlessRunwayLengthStage2MarkingEvidence =
    !sourceColored &&
    !properties.groundMerging &&
    Boolean(properties.localUv) &&
    Boolean(properties.stretchUv) &&
    Number(properties.drawStage || 0) === 2 &&
    Number(properties.priority || 0) >= 4 &&
    Number(properties.opacity ?? 1) >= 0.999 &&
    mesh.triangles.length === 2 &&
    areaSquareMeters >= 500 &&
    areaSquareMeters <= 10_000 &&
    orientedLongSideMeters >= 500 &&
    orientedShortSideMeters >= 0.3 &&
    orientedShortSideMeters <= 3 &&
    orientedBounds.aspectRatio >= 200 &&
    orientedCoverageRatio >= 0.97;
  const visibleDetailFillEvidence =
    compactAuthoredDetailEvidence ||
    elongatedStretchCarrierEvidence ||
    compactStretchDetailEvidence ||
    narrowPavementDetail ||
    colorlessCompactStage2MarkingEvidence ||
    colorlessLinearStage2MarkingEvidence ||
    colorlessFilledStage2MarkingEvidence ||
    colorlessTriangularStage2MarkingEvidence ||
    colorlessRunwayLengthStage2MarkingEvidence;
  return {
    renderMode: visibleSolidEvidence
      ? 'visible-solid-evidence'
      : visibleDetailFillEvidence
        ? 'visible-solid-detail-fill'
        : 'geometry-only',
    basis: visibleSolidEvidence
      ? denseBoundsCoverage
        ? 'nonzero-compiled-aarrggbb-plus-dense-bounds-coverage'
        : complexFilledPavement
          ? 'nonzero-compiled-aarrggbb-plus-complex-stage0-world-tiled-pavement-topology'
          : largeSimplePavement
            ? 'nonzero-compiled-aarrggbb-plus-large-simple-non-ground-merging-base-pavement-topology'
            : compactSimplePavement
              ? 'nonzero-compiled-aarrggbb-plus-compact-simple-non-ground-merging-stage0-pavement-topology'
              : elongatedOrientedPavement
                ? 'nonzero-compiled-aarrggbb-plus-elongated-oriented-solid-stage0-pavement-topology'
                : largeSolidQuadPavement
                  ? 'nonzero-compiled-aarrggbb-plus-large-solid-quad-stage0-pavement-topology'
                  : groundMergingRoadPavement
                    ? 'nonzero-compiled-aarrggbb-plus-ground-merging-road-network-topology'
                    : groundMergingSolidPavement
                      ? 'nonzero-compiled-aarrggbb-plus-ground-merging-solid-pavement-topology'
                      : 'colorless-partial-opacity-compact-ground-merging-road-network-topology; bars-owned-dark-pavement-fill'
      : compactAuthoredDetailEvidence
        ? 'nonzero-compiled-aarrggbb-plus-compact-high-priority-authored-detail; bars-owned-solid-exact-geometry-fill'
        : elongatedStretchCarrierEvidence
          ? 'nonzero-compiled-aarrggbb-plus-local-stretchuv-linear-carrier; bars-owned-solid-carrier-fill'
          : compactStretchDetailEvidence
            ? 'nonzero-compiled-aarrggbb-plus-compact-occupied-local-stretchuv-late-detail; bars-owned-solid-exact-geometry-fill'
            : colorlessCompactStage2MarkingEvidence
              ? 'colorless-opaque-compact-stage2-marking-footprint; bars-owned-white-solid-exact-geometry-fill'
              : colorlessLinearStage2MarkingEvidence
                ? 'colorless-opaque-linear-stage2-local-stretchuv-footprint; bars-owned-white-solid-exact-geometry-fill'
                : colorlessFilledStage2MarkingEvidence
                  ? 'colorless-opaque-filled-stage2-local-stretchuv-marking-plate; bars-owned-white-solid-exact-geometry-fill'
                  : colorlessTriangularStage2MarkingEvidence
                    ? 'colorless-opaque-single-triangle-stage2-high-priority-marking; bars-owned-white-solid-exact-geometry-fill'
                    : colorlessRunwayLengthStage2MarkingEvidence
                      ? 'colorless-opaque-runway-length-stage2-local-stretchuv-strip; bars-owned-white-solid-exact-geometry-fill'
                      : namedAlphaPatternCarrier
                        ? 'material-name-indicates-alpha-pattern-carrier; exact-geometry-retained'
                        : 'missing-source-alpha; opacity-not-invented; exact-geometry-retained',
    appearance: compactInsetDetailEvidence
      ? 'light-border-dark-fill'
      : compactPriorityPavement ||
          groundMergingRoadPavement ||
          groundMergingSolidPavement ||
          colorlessGroundMergingRoadPavement
        ? 'dark-pavement'
      : narrowPavementDetail
          ? 'dark-pavement-line'
          : namedAsphalt && Number(properties.drawStage || 0) === 0
            ? 'dark-pavement'
          : Number(properties.drawStage || 0) === 0 &&
              Number(properties.priority || 0) === 0 &&
              orientedShortSideMeters >= 8
            ? 'light-pavement'
            : 'source-color',
    sourceColored,
    materialName: normalizedMaterialName,
    namedAlphaPatternCarrier,
    namedAsphalt,
    denselyTriangulated,
    ordinaryPavementLayer,
    denseBoundsCoverage,
    complexFilledPavement,
    largeSimplePavement,
    mediumSimplePavement,
    compactPriorityPavement,
    narrowPavementDetail,
    compactSimplePavement,
    elongatedOrientedPavement,
    largeSolidQuadPavement,
    groundMergingRoadPavement,
    groundMergingSolidPavement,
    colorlessGroundMergingRoadPavement,
    compactAuthoredDetailEvidence,
    elongatedStretchCarrierEvidence,
    compactStretchDetailEvidence,
    compactInsetDetailEvidence,
    colorlessCompactStage2MarkingEvidence,
    colorlessLinearStage2MarkingEvidence,
    colorlessFilledStage2MarkingEvidence,
    colorlessTriangularStage2MarkingEvidence,
    colorlessRunwayLengthStage2MarkingEvidence,
    visibleDetailFillEvidence,
    triangleCount: mesh.triangles.length,
    areaSquareMeters,
    boundsAreaSquareMeters,
    boundsAspectRatio,
    coverageRatio,
    orientedBoundsAreaSquareMeters: orientedBounds.areaSquareMeters,
    orientedBoundsAspectRatio: orientedBounds.aspectRatio,
    orientedCoverageRatio,
    orientedShortSideMeters,
    orientedLongSideMeters,
    triangleDensityPer1000SquareMeters,
  };
}

export function hasVisibleRecordTint(coloration) {
  return [coloration?.red, coloration?.green, coloration?.blue].some(
    (component) => Number(component || 0) > 1
  );
}

function minimumAreaOrientedBounds(points) {
  if (points.length < 2) {
    return { areaSquareMeters: 0, aspectRatio: 1 };
  }

  const uniquePoints = [...new Map(points.map(([x, y]) => [`${x},${y}`, [x, y]])).values()].sort(
    (first, second) => first[0] - second[0] || first[1] - second[1]
  );
  if (uniquePoints.length < 2) {
    return { areaSquareMeters: 0, aspectRatio: 1 };
  }

  const cross = (origin, first, second) =>
    (first[0] - origin[0]) * (second[1] - origin[1]) -
    (first[1] - origin[1]) * (second[0] - origin[0]);
  const lower = [];
  for (const point of uniquePoints) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = uniquePoints.length - 1; index >= 0; index -= 1) {
    const point = uniquePoints[index];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 2) {
    return { areaSquareMeters: 0, aspectRatio: 1 };
  }

  let best = { areaSquareMeters: Infinity, aspectRatio: 1 };
  for (let edgeIndex = 0; edgeIndex < hull.length; edgeIndex += 1) {
    const first = hull[edgeIndex];
    const second = hull[(edgeIndex + 1) % hull.length];
    const edgeX = second[0] - first[0];
    const edgeY = second[1] - first[1];
    const edgeLength = Math.hypot(edgeX, edgeY);
    if (edgeLength <= 0.000001) continue;
    const axisX = edgeX / edgeLength;
    const axisY = edgeY / edgeLength;
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let minAcross = Infinity;
    let maxAcross = -Infinity;
    for (const point of hull) {
      const along = point[0] * axisX + point[1] * axisY;
      const across = -point[0] * axisY + point[1] * axisX;
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
      minAcross = Math.min(minAcross, across);
      maxAcross = Math.max(maxAcross, across);
    }
    const width = Math.max(maxAlong - minAlong, 0.001);
    const height = Math.max(maxAcross - minAcross, 0.001);
    const areaSquareMeters = width * height;
    if (areaSquareMeters < best.areaSquareMeters) {
      best = {
        areaSquareMeters,
        aspectRatio: Math.max(width, height) / Math.min(width, height),
      };
    }
  }
  return Number.isFinite(best.areaSquareMeters) ? best : { areaSquareMeters: 0, aspectRatio: 1 };
}

function buildModelRenderGroups(model, placement, sequenceStart, planarBasis) {
  const basis = normalizeProjectedMeshPlanarBasis(planarBasis);
  const groups = [];
  const textures = [];
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lodIndex, glbBuffer] of model.glbs.entries()) {
    const built = buildRenderGroups(glbBuffer, placement, {
      modelName: model.name || placement.meshGuid,
      lodIndex,
      sequenceStart: sequenceStart + groups.length,
      planarBasis: basis,
    });
    groups.push(...built.groups);
    textures.push(...built.textures);
    mergeBounds(bounds, built.bounds);
  }
  return { groups, textures, bounds };
}

function normalizeProjectedMeshPlanarBasis(value) {
  if (typeof value === 'number') {
    return (
      PROJECTED_MESH_PLANAR_BASES.find((basis) => basis.northSign === value) ||
      DEFAULT_PROJECTED_MESH_PLANAR_BASIS
    );
  }
  return value?.label ? value : DEFAULT_PROJECTED_MESH_PLANAR_BASIS;
}

function buildRenderGroups(
  arrayBuffer,
  placement,
  { modelName, lodIndex, sequenceStart, planarBasis = DEFAULT_PROJECTED_MESH_PLANAR_BASIS }
) {
  const basis = normalizeProjectedMeshPlanarBasis(planarBasis);
  const glb = parseGlb(arrayBuffer);
  if (!glb.json || !glb.binary) return { groups: [], textures: [], bounds: null };
  const groups = [];
  const textures = [];
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  // The projected-mesh GLB basis is aligned at a SceneryObject heading of 180 degrees. Rotate only
  // the authored delta from that baseline; the model Z-axis convention is resolved separately.
  const effectiveHeading = Number(placement.heading) - 180;
  const headingRadians = (effectiveHeading * Math.PI) / 180;
  const headingCosine = Math.cos(headingRadians);
  const headingSine = Math.sin(headingRadians);
  const accessorCache = new Map();
  const read = (index) => {
    if (!accessorCache.has(index)) accessorCache.set(index, readAccessor(glb, index));
    return accessorCache.get(index);
  };
  // MSFS projected meshes do not apply translation/rotation/scale stored on the exported
  // model's glTF nodes. The compiler leaves those transforms in some optimized assets even
  // though the simulator projects the mesh from its untransformed vertex positions. Applying
  // them here shifts independently-authored layers apart (Orly has +103 m/+272.112 m on its
  // concrete, edge and dirt models, but identity nodes on its asphalt and markings models).
  for (const instance of meshInstances(glb.json, { applyNodeTransforms: false })) {
    const mesh = glb.json.meshes?.[instance.mesh];
    if (!mesh) continue;
    for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const texture = baseColorTexture(glb.json, primitive.material);
      const positions = read(primitive.attributes?.POSITION);
      const textureCoordinateSet =
        texture?.textureTransform?.texCoord ?? texture?.textureCoordinateSet ?? 0;
      const texcoords = read(primitive.attributes?.[`TEXCOORD_${textureCoordinateSet}`]);
      const accessorIndices =
        primitive.indices === undefined
          ? Array.from({ length: positions?.count || 0 }, (_, index) => index)
          : read(primitive.indices)?.values;
      const indices = primitiveTriangleIndices(primitive, accessorIndices);
      if (!positions || !texcoords || !indices?.length || !texture?.uri) continue;
      const origin = mercatorPosition(placement.longitude, placement.latitude);
      const vertices = new Float32Array(indices.length * 4);
      const localMetricBounds = [Infinity, Infinity, -Infinity, -Infinity];
      let minimumLocalY = Infinity;
      let maximumLocalY = -Infinity;
      let localYTotal = 0;
      let output = 0;
      for (const vertexIndex of indices) {
        if (vertexIndex >= positions.count || vertexIndex >= texcoords.count) {
          throw new Error(`${modelName} contains an out-of-range optimized primitive index.`);
        }
        const local = transformPoint(instance.matrix, [
          positions.values[vertexIndex * positions.components],
          positions.values[vertexIndex * positions.components + 1],
          positions.values[vertexIndex * positions.components + 2],
        ]).map((value) => value * (Number(placement.meshScale) || 1));
        minimumLocalY = Math.min(minimumLocalY, local[1]);
        maximumLocalY = Math.max(maximumLocalY, local[1]);
        localYTotal += local[1];
        const localEast = local[0] * basis.eastX + local[2] * basis.eastZ;
        const localNorth = local[0] * basis.northX + local[2] * basis.northZ;
        localMetricBounds[0] = Math.min(localMetricBounds[0], localEast);
        localMetricBounds[1] = Math.min(localMetricBounds[1], localNorth);
        localMetricBounds[2] = Math.max(localMetricBounds[2], localEast);
        localMetricBounds[3] = Math.max(localMetricBounds[3], localNorth);
        // SceneryObject heading is clockwise from north. Rotate the model's east/north axes around
        // its BGL placement before converting metre offsets to geographic coordinates.
        const coordinate = projectedMeshLocalMetersToCoordinate(
          localEast * headingCosine + localNorth * headingSine,
          -localEast * headingSine + localNorth * headingCosine,
          placement.longitude,
          placement.latitude
        );
        const mercator = mercatorPosition(coordinate[0], coordinate[1]);
        vertices[output] = mercator[0] - origin[0];
        vertices[output + 1] = mercator[1] - origin[1];
        const [textureU, textureV] = transformTextureCoordinate(
          texcoords.values[vertexIndex * texcoords.components],
          texcoords.values[vertexIndex * texcoords.components + 1],
          texture.textureTransform
        );
        vertices[output + 2] = textureU;
        // glTF UVs and decoded package image rows share the top-origin convention. Keep the
        // authored coordinate unchanged; all MSFS groups now reach WebGL in source-row space and
        // the preview shader performs no implicit V flip.
        vertices[output + 3] = textureV;
        output += 4;
        expandBounds(bounds, coordinate);
      }
      const baseColorFactor = texture.baseColorFactor;
      const factorSuffix = baseColorFactor.some((value) => Math.abs(value - 1) > 1e-6)
        ? `--base-color-${baseColorFactor
            .map((value) =>
              Math.round(Math.max(0, Math.min(1, value)) * 255)
                .toString(16)
                .padStart(2, '0')
            )
            .join('')}`
        : '';
      const pattern = `${pathBasename(texture.uri)}${factorSuffix}`;
      const placementPriority = Number(placement.priority || 0);
      const materialOrder = materialDrawOrder(glb.json, primitive.material);
      const wrapModes = samplerWrapModes(glb.json, texture.textureIndex);
      groups.push({
        id: `folder-${sequenceStart + groups.length}-${safeName(modelName)}-${lodIndex}-${primitiveIndex}`,
        modelName,
        meshGuid: placement.meshGuid,
        pattern,
        origin,
        vertices,
        triangleCount: indices.length / 3,
        primitiveIndex,
        materialIndex: primitive.material,
        materialName: glb.json.materials?.[primitive.material]?.name || '',
        materialAlphaMode: glb.json.materials?.[primitive.material]?.alphaMode || 'OPAQUE',
        sourceOpacity: Math.max(0, Math.min(1, Number(baseColorFactor[3] ?? 1))),
        sourceTint: baseColorFactor.slice(0, 3),
        hasSourceTint: baseColorFactor.slice(0, 3).some((value) => Math.abs(value - 1) > 1e-6),
        materialExtensions: glb.json.materials?.[primitive.material]?.extensions || {},
        textureCoordinateSet,
        textureTransform: texture.textureTransform,
        placementPriority,
        placementRecordOffset: placement.sourceRecordOffset,
        drawBefore: placement.drawBefore,
        // The selected slot is rendered after that primitive and before the next one. Odd stages
        // are primitives; even stages are projected-mesh insertion points.
        renderStage: Number(placement.drawBefore ?? -1) * 2 + 2,
        placementPitch: placement.pitch,
        placementBank: placement.bank,
        placementHeading: placement.heading,
        effectivePlacementHeading: effectiveHeading,
        projectedMeshNorthSign: basis.northSign ?? null,
        projectedMeshPlanarBasis: basis.label,
        localMetricBounds,
        instanceMatrix: [...instance.matrix],
        projectedMeshNodeTransformApplied: false,
        assetGenerator: glb.json.asset?.generator || '',
        assetVersion: glb.json.asset?.version || '',
        optimizedAsset: Boolean(glb.json.asset?.extensions?.ASOBO_asset_optimized),
        extensionsUsed: [...(glb.json.extensionsUsed || [])],
        unknownPlacementFlags: placement.unknownFlags,
        materialOrder,
        minimumLocalY,
        maximumLocalY,
        averageLocalY: localYTotal / indices.length,
        sourceSequence: sequenceStart + groups.length,
        renderPass: 'overlay',
        layerOrder: 5_000 + placementPriority + materialOrder,
        lineTexture: false,
        markingTexture: isMarkingTexture(pattern),
        wrap: [wrapModes.wrapS, wrapModes.wrapT].includes(10497),
        wrapS: wrapModes.wrapS,
        wrapT: wrapModes.wrapT,
      });
      textures.push({ pattern, sourceName: pathBasename(texture.uri) });
    }
  }
  return { groups, textures, bounds: bounds.every(Number.isFinite) ? bounds : null };
}

function parseGlb(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  if (ascii(bytes, 0, 4) !== 'glTF') return { json: null, binary: null };
  let cursor = 12;
  let json = null;
  let binary = null;
  while (cursor + 8 <= bytes.length) {
    const length = view.getUint32(cursor, true);
    const type = view.getUint32(cursor + 4, true);
    if (cursor + 8 + length > bytes.length) break;
    if (type === 0x4e4f534a) {
      json = JSON.parse(
        new TextDecoder()
          .decode(bytes.subarray(cursor + 8, cursor + 8 + length))
          .replaceAll('\0', '')
          .trim()
      );
    } else if (type === 0x004e4942) {
      binary = bytes.subarray(cursor + 8, cursor + 8 + length);
    }
    cursor += 8 + length;
  }
  return { json, binary };
}

function readAccessor(glb, accessorIndex) {
  if (accessorIndex === undefined) return null;
  const accessor = glb.json.accessors?.[accessorIndex];
  if (!accessor || accessor.sparse) return null;
  const bufferView = glb.json.bufferViews?.[accessor.bufferView];
  if (!bufferView || bufferView.buffer !== 0) return null;
  const component = componentReader(accessor.componentType);
  const components = accessorComponents(accessor.type);
  if (!component || !components) return null;
  const stride = bufferView.byteStride || component.bytes * components;
  const start = Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0);
  const view = new DataView(glb.binary.buffer, glb.binary.byteOffset, glb.binary.byteLength);
  const asoboHalfFloatUv =
    accessor.componentType === 5122 &&
    /TEXCOORD/i.test(String(accessor.name || '')) &&
    Boolean(glb.json.asset?.extensions?.ASOBO_asset_optimized);
  const values = new Array(accessor.count * components);
  for (let index = 0; index < accessor.count; index += 1) {
    const itemOffset = start + index * stride;
    for (let field = 0; field < components; field += 1) {
      const componentOffset = itemOffset + field * component.bytes;
      let value = asoboHalfFloatUv
        ? halfFloat(view.getUint16(componentOffset, true))
        : component.read(view, componentOffset);
      if (!asoboHalfFloatUv && accessor.normalized && accessor.componentType !== 5126) {
        value = normalizeComponent(value, accessor.componentType);
      }
      values[index * components + field] = value;
    }
  }
  return { count: accessor.count, components, values };
}

function halfFloat(value) {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function componentReader(type) {
  return {
    5120: { bytes: 1, read: (view, offset) => view.getInt8(offset) },
    5121: { bytes: 1, read: (view, offset) => view.getUint8(offset) },
    5122: { bytes: 2, read: (view, offset) => view.getInt16(offset, true) },
    5123: { bytes: 2, read: (view, offset) => view.getUint16(offset, true) },
    5125: { bytes: 4, read: (view, offset) => view.getUint32(offset, true) },
    5126: { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) },
  }[type];
}

function accessorComponents(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }[type];
}

function primitiveTriangleIndices(primitive, accessorIndices) {
  if (!accessorIndices) return null;
  const optimized = primitive.extras?.ASOBO_primitive;
  if (!optimized) return accessorIndices;
  const start = Number(optimized.StartIndex || 0);
  const primitiveCount = Number(optimized.PrimitiveCount);
  const count = Number.isFinite(primitiveCount)
    ? primitiveCount * 3
    : accessorIndices.length - start;
  const base = Number(optimized.BaseVertexIndex || 0);
  if (start < 0 || count < 0 || start + count > accessorIndices.length) return null;
  return accessorIndices.slice(start, start + count).map((index) => index + base);
}

function meshInstances(gltf, { applyNodeTransforms = true } = {}) {
  const instances = [];
  const roots = gltf.scenes?.[gltf.scene || 0]?.nodes;
  const rootNodes = roots?.length ? roots : gltf.nodes?.map((_, index) => index) || [];
  const visit = (nodeIndex, parentMatrix) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;
    const matrix = applyNodeTransforms
      ? multiplyMatrices(parentMatrix, nodeMatrix(node))
      : identityMatrix();
    if (node.mesh !== undefined) instances.push({ mesh: node.mesh, matrix });
    for (const child of node.children || []) visit(child, matrix);
  };
  for (const root of rootNodes) visit(root, identityMatrix());
  if (!instances.length) {
    for (let mesh = 0; mesh < (gltf.meshes?.length || 0); mesh += 1) {
      instances.push({ mesh, matrix: identityMatrix() });
    }
  }
  return instances;
}

function nodeMatrix(node) {
  if (node.matrix?.length === 16) return node.matrix.map(Number);
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiplyMatrices(left, right) {
  const result = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let inner = 0; inner < 4; inner += 1) {
        result[column * 4 + row] += left[inner * 4 + row] * right[column * 4 + inner];
      }
    }
  }
  return result;
}

function transformPoint(matrix, [x, y, z]) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function baseColorTexture(gltf, materialIndex) {
  const pbr = gltf.materials?.[materialIndex]?.pbrMetallicRoughness;
  const textureInfo = pbr?.baseColorTexture;
  const textureIndex = textureInfo?.index;
  if (textureIndex === undefined) return null;
  const texture = gltf.textures?.[textureIndex];
  const imageIndex = texture?.extensions?.MSFT_texture_dds?.source ?? texture?.source;
  const image = gltf.images?.[imageIndex];
  return image?.uri
    ? {
        textureIndex,
        uri: normalize(image.uri),
        textureCoordinateSet: Number(textureInfo.texCoord || 0),
        textureTransform: textureInfo.extensions?.KHR_texture_transform || null,
        baseColorFactor:
          Array.isArray(pbr?.baseColorFactor) && pbr.baseColorFactor.length >= 4
            ? pbr.baseColorFactor.slice(0, 4).map(Number)
            : [1, 1, 1, 1],
      }
    : null;
}

export function transformTextureCoordinate(u, v, transform) {
  if (!transform) return [u, v];
  const [offsetU, offsetV] = transform.offset || [0, 0];
  const [scaleU, scaleV] = transform.scale || [1, 1];
  const rotation = Number(transform.rotation || 0);
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const scaledU = u * Number(scaleU);
  const scaledV = v * Number(scaleV);
  return [
    Number(offsetU) + cosine * scaledU - sine * scaledV,
    Number(offsetV) + sine * scaledU + cosine * scaledV,
  ];
}

function materialDrawOrder(gltf, materialIndex) {
  return Number(
    gltf.materials?.[materialIndex]?.extensions?.ASOBO_material_draw_order?.drawOrderOffset || 0
  );
}

function samplerWrapModes(gltf, textureIndex) {
  const texture = gltf.textures?.[textureIndex];
  const sampler = gltf.samplers?.[texture?.sampler];
  return { wrapS: sampler?.wrapS ?? 10497, wrapT: sampler?.wrapT ?? 10497 };
}

function boundaryEdges(vertices, triangles) {
  const edges = new Map();
  for (const triangle of triangles) {
    for (const [first, second] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]],
    ]) {
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const current = edges.get(key);
      edges.set(
        key,
        current ? { ...current, count: current.count + 1 } : { first, second, count: 1 }
      );
    }
  }
  return [...edges.values()]
    .filter((edge) => edge.count === 1)
    .map((edge) => [vertices[edge.first], vertices[edge.second]]);
}

function placementPoint(view, offset) {
  const longitude = decodeLongitude(view.getUint32(offset + 4, true));
  const latitude = decodeLatitude(view.getUint32(offset + 8, true));
  return plausibleCoordinate(longitude, latitude) ? [longitude, latitude] : null;
}

function runwayLabel(number, designator) {
  const suffix = { 1: 'L', 2: 'R', 3: 'C', 4: 'W', 5: 'A', 6: 'B' }[designator] || '';
  return `${String(number).padStart(2, '0')}${suffix}`;
}

function boundsFeature(bounds, modelName, meshGuid) {
  return {
    type: 'Feature',
    properties: { sourceType: 'msfs-projected-mesh-bounds', modelName, meshGuid },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[1]],
          [bounds[2], bounds[3]],
          [bounds[0], bounds[3]],
          [bounds[0], bounds[1]],
        ],
      ],
    },
  };
}

function mergeBounds(target, source) {
  if (!source) return;
  target[0] = Math.min(target[0], source[0]);
  target[1] = Math.min(target[1], source[1]);
  target[2] = Math.max(target[2], source[2]);
  target[3] = Math.max(target[3], source[3]);
}

function expandBounds(bounds, [longitude, latitude]) {
  bounds[0] = Math.min(bounds[0], longitude);
  bounds[1] = Math.min(bounds[1], latitude);
  bounds[2] = Math.max(bounds[2], longitude);
  bounds[3] = Math.max(bounds[3], latitude);
}

function airportReferenceBounds(airportData) {
  const coordinates = [];
  for (const feature of airportData.aprons?.features || []) {
    if (!feature.properties?.drawSurface || feature.properties?.groundMerging) continue;
    collectCoordinateTree(coordinates, feature.geometry?.coordinates);
  }
  for (const feature of airportData.paintedLines?.features || []) {
    collectCoordinateTree(coordinates, feature.geometry?.coordinates);
  }
  const runwayCoordinates = [];
  for (const runway of airportData.runways || []) {
    const heading = (Number(runway.heading || 0) * Math.PI) / 180;
    const alongEast = (Math.sin(heading) * Number(runway.lengthMeters || 0)) / 2;
    const alongNorth = (Math.cos(heading) * Number(runway.lengthMeters || 0)) / 2;
    const acrossEast = (Math.cos(heading) * Number(runway.widthMeters || 0)) / 2;
    const acrossNorth = (-Math.sin(heading) * Number(runway.widthMeters || 0)) / 2;
    for (const along of [-1, 1]) {
      for (const across of [-1, 1]) {
        runwayCoordinates.push(
          localMetersToCoordinate(
            along * alongEast + across * acrossEast,
            along * alongNorth + across * acrossNorth,
            runway.lon,
            runway.lat
          )
        );
      }
    }
  }
  if (!coordinates.length && !runwayCoordinates.length) return null;
  // Airport BGLs often contain a handful of very large exclusion/base aprons. Their
  // extrema are valid geometry, but they are a poor orientation reference for a detailed
  // projected ground mesh. Use the dense compiled geometry envelope and always retain the
  // independently decoded runway corners. This prevents one mask polygon from reflecting an
  // otherwise correctly placed airport while preserving remote runway extents.
  const robustCoordinates =
    coordinates.length >= 200 ? robustCoordinateEnvelope(coordinates, 0.02) : coordinates;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const coordinate of [...robustCoordinates, ...runwayCoordinates])
    expandBounds(bounds, coordinate);
  return bounds.every(Number.isFinite) ? bounds : null;
}

function robustCoordinateEnvelope(coordinates, trimRatio) {
  const longitudes = coordinates.map((coordinate) => coordinate[0]).sort((a, b) => a - b);
  const latitudes = coordinates.map((coordinate) => coordinate[1]).sort((a, b) => a - b);
  const lowerIndex = Math.floor((coordinates.length - 1) * trimRatio);
  const upperIndex = Math.ceil((coordinates.length - 1) * (1 - trimRatio));
  return [
    [longitudes[lowerIndex], latitudes[lowerIndex]],
    [longitudes[upperIndex], latitudes[upperIndex]],
  ];
}

function collectCoordinateTree(output, coordinates) {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    output.push(coordinates);
    return;
  }
  for (const child of coordinates) collectCoordinateTree(output, child);
}

function expandCoordinateTree(bounds, coordinates) {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1])
  ) {
    expandBounds(bounds, coordinates);
    return;
  }
  for (const child of coordinates) expandCoordinateTree(bounds, child);
}

function selectProjectedMeshBasisFromModels(models, referenceBounds, sequenceStart, airportData) {
  if (!models.some(({ model }) => model.glbs.length)) return null;
  if (!referenceBounds) {
    return {
      ...DEFAULT_PROJECTED_MESH_PLANAR_BASIS,
      basis: 'default-no-independent-airport-reference',
      comparisonModel: '',
      comparisonCoverage: 0,
      basisComparisons: [],
    };
  }
  const airportMatchIndex = buildAirportMatchIndex(airportData, referenceBounds);
  let bestProbe = null;
  const comparedGuids = new Set();
  const modelComparisons = [];
  for (const { placement, model } of models) {
    if (!model.glbs.length) continue;
    const modelKey = String(placement.meshGuid || model.guid || model.name).toLowerCase();
    if (comparedGuids.has(modelKey)) continue;
    comparedGuids.add(modelKey);
    const comparisons = PROJECTED_MESH_PLANAR_BASES.map((planarBasis) => {
      const built = buildModelRenderGroups(model, placement, sequenceStart, planarBasis);
      return {
        ...planarBasis,
        coverage: boundsCoverage(built.bounds, referenceBounds),
        envelopeScoreMeters: projectedMeshBoundsScore(built.bounds, referenceBounds),
        airportMatch: projectedMeshAirportMatch(built.groups, airportMatchIndex),
      };
    });
    const decision = selectProjectedMeshPlanarBasis(
      comparisons,
      model.name || placement.meshGuid,
      referenceBounds
    );
    modelComparisons.push({ meshGuid: placement.meshGuid, ...decision });
    const maximumCoverage = Math.max(...comparisons.map((comparison) => comparison.coverage));
    if (!bestProbe || maximumCoverage > bestProbe.maximumCoverage) {
      bestProbe = { decision, maximumCoverage };
    }
  }
  if (!bestProbe) {
    return { ...DEFAULT_PROJECTED_MESH_PLANAR_BASIS, basis: 'default-no-decodable-model' };
  }
  return {
    ...selectProjectedMeshBasisConsensus(modelComparisons, bestProbe.decision),
    modelComparisons,
  };
}

export function selectProjectedMeshBasisConsensus(modelComparisons, fallback) {
  const decisiveLocalMatches = (modelComparisons || []).filter(
    (comparison) =>
      comparison.basis === 'decisive-planar-basis-local-match-to-independent-airport-geometry'
  );
  if (decisiveLocalMatches.length === 0) return fallback;

  const votes = new Map();
  for (const comparison of decisiveLocalMatches) {
    const current = votes.get(comparison.label) || {
      count: 0,
      score: 0,
      strongest: comparison,
    };
    current.count += 1;
    current.score += Number(comparison.airportMatch?.score || 0);
    if (
      Number(comparison.airportMatch?.score || 0) >
      Number(current.strongest.airportMatch?.score || 0)
    ) {
      current.strongest = comparison;
    }
    votes.set(comparison.label, current);
  }
  const winner = [...votes.values()].sort(
    (left, right) =>
      right.count - left.count ||
      right.score - left.score ||
      Number(right.strongest.airportMatch?.score || 0) -
        Number(left.strongest.airportMatch?.score || 0)
  )[0];
  return {
    ...winner.strongest,
    basis: 'decisive-planar-basis-consensus-from-independent-airport-geometry',
    consensusModels: winner.count,
    consensusScore: Number(winner.score.toFixed(4)),
  };
}

function selectProjectedMeshPlanarBasis(comparisons, modelName, referenceBounds) {
  const byEnvelope = [...comparisons].sort(
    (left, right) => left.envelopeScoreMeters - right.envelopeScoreMeters
  );
  const byLocalMatch = [...comparisons].sort(
    (left, right) => Number(right.airportMatch?.score || 0) - Number(left.airportMatch?.score || 0)
  );
  const envelopeBest = byEnvelope[0];
  const envelopeSecond = byEnvelope[1];
  const envelopeImprovement =
    envelopeSecond.envelopeScoreMeters > 0
      ? (envelopeSecond.envelopeScoreMeters - envelopeBest.envelopeScoreMeters) /
        envelopeSecond.envelopeScoreMeters
      : 0;
  const envelopeIsDecisive =
    envelopeBest.coverage >= 0.25 &&
    envelopeBest.envelopeScoreMeters + 5 < envelopeSecond.envelopeScoreMeters &&
    envelopeImprovement >= 0.1;
  const localBest = byLocalMatch[0];
  const localSecond = byLocalMatch[1];
  const localMatchIsDecisive = airportMatchImproves(
    localBest.airportMatch,
    localSecond.airportMatch
  );
  // Local overlap is the stronger source of truth: it compares the candidate mesh against
  // actual compiled apron/runway/line geometry near the placement. A package-wide extrema
  // envelope can be skewed by exclusion masks or remote surfaces. Use the broad envelope only
  // when the local comparison cannot distinguish the candidates.
  const selected = localMatchIsDecisive
    ? localBest
    : envelopeIsDecisive
      ? envelopeBest
      : comparisons.find(
          (comparison) => comparison.label === DEFAULT_PROJECTED_MESH_PLANAR_BASIS.label
        );
  const selectionBasis = localMatchIsDecisive
    ? 'decisive-planar-basis-local-match-to-independent-airport-geometry'
    : envelopeIsDecisive
      ? 'decisive-planar-basis-envelope-to-independent-airport-envelope'
      : 'default-planar-basis-when-evidence-is-not-decisive';
  return {
    ...PROJECTED_MESH_PLANAR_BASES.find((candidate) => candidate.label === selected.label),
    basis: selectionBasis,
    comparisonModel: modelName,
    comparisonCoverage: Number(selected.coverage.toFixed(3)),
    comparisonScoreMeters: Number(selected.envelopeScoreMeters.toFixed(2)),
    envelopeImprovementRatio: Number(envelopeImprovement.toFixed(3)),
    airportMatch: selected.airportMatch,
    referenceBounds,
    basisComparisons: comparisons.map((comparison) => ({
      label: comparison.label,
      coverage: Number(comparison.coverage.toFixed(3)),
      envelopeScoreMeters: Number(comparison.envelopeScoreMeters.toFixed(2)),
      airportMatch: comparison.airportMatch,
    })),
  };
}

function airportMatchImproves(candidate, alternative) {
  if (!candidate || !alternative || candidate.samples < 50 || alternative.samples < 50)
    return false;
  return candidate.score >= alternative.score * 1.2 && candidate.score - alternative.score >= 0.01;
}

function buildAirportMatchIndex(airportData, referenceBounds) {
  if (!referenceBounds?.every(Number.isFinite)) return null;
  const origin = [
    (referenceBounds[0] + referenceBounds[2]) / 2,
    (referenceBounds[1] + referenceBounds[3]) / 2,
  ];
  const cellSize = 100;
  const polygons = [];
  for (const feature of airportData.aprons?.features || []) {
    if (!feature.properties?.drawSurface || feature.properties?.groundMerging) continue;
    for (const ring of polygonRings(feature.geometry)) addMatchPolygon(ring, origin, polygons);
  }
  for (const runway of airportData.runways || []) {
    addMatchPolygon(runwayRing(runway), origin, polygons);
  }
  const segments = [];
  for (const feature of airportData.paintedLines?.features || []) {
    for (const line of geometryLines(feature.geometry)) {
      for (let lineIndex = 1; lineIndex < line.length; lineIndex += 1) {
        const first = coordinateDeltaMeters(line[lineIndex - 1], origin);
        const second = coordinateDeltaMeters(line[lineIndex], origin);
        if (first.every(Number.isFinite) && second.every(Number.isFinite))
          segments.push([first, second]);
      }
    }
  }
  const boundarySegments = [];
  for (const feature of airportData.aprons?.features || []) {
    if (!feature.properties?.drawSurface || feature.properties?.groundMerging) continue;
    for (const ring of polygonRings(feature.geometry)) {
      addMatchSegments(ring, origin, boundarySegments, true);
    }
  }
  for (const runway of airportData.runways || []) {
    addMatchSegments(runwayRing(runway), origin, boundarySegments, true);
  }
  return {
    origin,
    mercatorOrigin: mercatorPosition(origin[0], origin[1]),
    mercatorMeters: 2 * Math.PI * EARTH_RADIUS * Math.cos((origin[1] * Math.PI) / 180),
    cellSize,
    polygons,
    segments,
    boundarySegments,
    polygonCells: indexMatchItems(polygons, cellSize, (polygon) => polygon.bounds),
    segmentCells: indexMatchItems(segments, cellSize, (segment) => [
      Math.min(segment[0][0], segment[1][0]) - 8,
      Math.min(segment[0][1], segment[1][1]) - 8,
      Math.max(segment[0][0], segment[1][0]) + 8,
      Math.max(segment[0][1], segment[1][1]) + 8,
    ]),
    boundaryCells: indexMatchItems(boundarySegments, cellSize, (segment) => [
      Math.min(segment[0][0], segment[1][0]) - 8,
      Math.min(segment[0][1], segment[1][1]) - 8,
      Math.max(segment[0][0], segment[1][0]) + 8,
      Math.max(segment[0][1], segment[1][1]) + 8,
    ]),
  };
}

function projectedMeshAirportMatch(groups, index) {
  if (!index || !groups.length) return null;
  const triangleCount = groups.reduce((total, group) => total + group.vertices.length / 12, 0);
  const stride = Math.max(1, Math.ceil(triangleCount / 1_200));
  let samples = 0;
  let surfaceHits = 0;
  let lineHits = 0;
  let boundarySamples = 0;
  let boundaryHits = 0;
  let weightedHits = 0;
  let triangleIndex = 0;
  for (const group of groups) {
    for (let offset = 0; offset + 11 < group.vertices.length; offset += 12, triangleIndex += 1) {
      if (triangleIndex % stride !== 0) continue;
      const globalX =
        group.origin[0] +
        (group.vertices[offset] + group.vertices[offset + 4] + group.vertices[offset + 8]) / 3;
      const globalY =
        group.origin[1] +
        (group.vertices[offset + 1] + group.vertices[offset + 5] + group.vertices[offset + 9]) / 3;
      const point = [
        (globalX - index.mercatorOrigin[0]) * index.mercatorMeters,
        (index.mercatorOrigin[1] - globalY) * index.mercatorMeters,
      ];
      const surfaceHit = matchSurface(point, index);
      const lineHit = matchLine(point, index, 8);
      samples += 1;
      if (surfaceHit) surfaceHits += 1;
      if (lineHit) lineHits += 1;
      if (group.markingTexture) weightedHits += lineHit ? 1 : surfaceHit ? 0.2 : 0;
      else weightedHits += surfaceHit ? 1 : lineHit ? 0.2 : 0;
      if (!group.markingTexture) {
        for (const vertexOffset of [0, 4, 8]) {
          const vertexPoint = [
            (group.origin[0] + group.vertices[offset + vertexOffset] - index.mercatorOrigin[0]) *
              index.mercatorMeters,
            (index.mercatorOrigin[1] -
              group.origin[1] -
              group.vertices[offset + vertexOffset + 1]) *
              index.mercatorMeters,
          ];
          boundarySamples += 1;
          if (matchBoundary(vertexPoint, index, 5)) boundaryHits += 1;
        }
      }
    }
  }
  const surfaceScore = samples ? weightedHits / samples : 0;
  const boundaryRatio = boundarySamples ? boundaryHits / boundarySamples : 0;
  return {
    samples,
    boundarySamples,
    score: Number((surfaceScore * 0.25 + boundaryRatio * 0.75).toFixed(4)),
    surfaceRatio: samples ? Number((surfaceHits / samples).toFixed(4)) : 0,
    lineRatio: samples ? Number((lineHits / samples).toFixed(4)) : 0,
    boundaryRatio: Number(boundaryRatio.toFixed(4)),
  };
}

function matchSurface(point, index) {
  const candidates = index.polygonCells.get(matchCellKey(point, index.cellSize)) || [];
  return candidates.some((polygonIndex) => pointInRing(point, index.polygons[polygonIndex].ring));
}

function matchLine(point, index, thresholdMeters) {
  const candidates = index.segmentCells.get(matchCellKey(point, index.cellSize)) || [];
  const thresholdSquared = thresholdMeters * thresholdMeters;
  return candidates.some(
    (segmentIndex) =>
      pointSegmentDistanceSquared(point, index.segments[segmentIndex]) <= thresholdSquared
  );
}

function matchBoundary(point, index, thresholdMeters) {
  const candidates = index.boundaryCells.get(matchCellKey(point, index.cellSize)) || [];
  const thresholdSquared = thresholdMeters * thresholdMeters;
  return candidates.some(
    (segmentIndex) =>
      pointSegmentDistanceSquared(point, index.boundarySegments[segmentIndex]) <= thresholdSquared
  );
}

function addMatchSegments(coordinates, origin, output, close = false) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return;
  const count = close ? coordinates.length : coordinates.length - 1;
  for (let index = 0; index < count; index += 1) {
    const first = coordinateDeltaMeters(coordinates[index], origin);
    const second = coordinateDeltaMeters(coordinates[(index + 1) % coordinates.length], origin);
    if (first.every(Number.isFinite) && second.every(Number.isFinite)) output.push([first, second]);
  }
}

function addMatchPolygon(ring, origin, output) {
  if (!Array.isArray(ring) || ring.length < 3) return;
  const localRing = ring.map((coordinate) => coordinateDeltaMeters(coordinate, origin));
  if (!localRing.every((coordinate) => coordinate.every(Number.isFinite))) return;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of localRing) {
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
  }
  output.push({ ring: localRing, bounds });
}

function runwayRing(runway) {
  const heading = (Number(runway.heading || 0) * Math.PI) / 180;
  const alongEast = (Math.sin(heading) * Number(runway.lengthMeters || 0)) / 2;
  const alongNorth = (Math.cos(heading) * Number(runway.lengthMeters || 0)) / 2;
  const acrossEast = (Math.cos(heading) * Number(runway.widthMeters || 0)) / 2;
  const acrossNorth = (-Math.sin(heading) * Number(runway.widthMeters || 0)) / 2;
  return [
    [alongEast + acrossEast, alongNorth + acrossNorth],
    [alongEast - acrossEast, alongNorth - acrossNorth],
    [-alongEast - acrossEast, -alongNorth - acrossNorth],
    [-alongEast + acrossEast, -alongNorth + acrossNorth],
  ].map(([east, north]) => localMetersToCoordinate(east, north, runway.lon, runway.lat));
}

function polygonRings(geometry) {
  if (geometry?.type === 'Polygon')
    return geometry.coordinates?.length ? [geometry.coordinates[0]] : [];
  if (geometry?.type === 'MultiPolygon')
    return (geometry.coordinates || []).map((polygon) => polygon[0]);
  return [];
}

function geometryLines(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates || []];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates || [];
  return [];
}

function indexMatchItems(items, cellSize, boundsFor) {
  const cells = new Map();
  items.forEach((item, itemIndex) => {
    const bounds = boundsFor(item);
    const minimumX = Math.floor(bounds[0] / cellSize);
    const minimumY = Math.floor(bounds[1] / cellSize);
    const maximumX = Math.floor(bounds[2] / cellSize);
    const maximumY = Math.floor(bounds[3] / cellSize);
    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let y = minimumY; y <= maximumY; y += 1) {
        const key = `${x},${y}`;
        const cell = cells.get(key) || [];
        cell.push(itemIndex);
        cells.set(key, cell);
      }
    }
  });
  return cells;
}

function matchCellKey([x, y], cellSize) {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentX, currentY] = ring[current];
    const [previousX, previousY] = ring[previous];
    if (
      currentY > y !== previousY > y &&
      x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX
    )
      inside = !inside;
  }
  return inside;
}

function pointSegmentDistanceSquared([x, y], [[firstX, firstY], [secondX, secondY]]) {
  const deltaX = secondX - firstX;
  const deltaY = secondY - firstY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, ((x - firstX) * deltaX + (y - firstY) * deltaY) / lengthSquared))
    : 0;
  const nearestX = firstX + fraction * deltaX;
  const nearestY = firstY + fraction * deltaY;
  return (x - nearestX) ** 2 + (y - nearestY) ** 2;
}

function boundsCoverage(candidateBounds, referenceBounds) {
  if (!candidateBounds?.every(Number.isFinite) || !referenceBounds?.every(Number.isFinite))
    return 0;
  const [candidateWidth, candidateHeight] = coordinateDeltaMeters(
    [candidateBounds[2], candidateBounds[3]],
    [candidateBounds[0], candidateBounds[1]]
  );
  const [referenceWidth, referenceHeight] = coordinateDeltaMeters(
    [referenceBounds[2], referenceBounds[3]],
    [referenceBounds[0], referenceBounds[1]]
  );
  if (!(referenceWidth > 0) || !(referenceHeight > 0)) return 0;
  return (
    Math.min(1, Math.abs(candidateWidth / referenceWidth)) *
    Math.min(1, Math.abs(candidateHeight / referenceHeight))
  );
}

function projectedMeshBoundsScore(candidateBounds, referenceBounds) {
  if (!candidateBounds?.every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const referenceCenter = [
    (referenceBounds[0] + referenceBounds[2]) / 2,
    (referenceBounds[1] + referenceBounds[3]) / 2,
  ];
  const candidateCenter = [
    (candidateBounds[0] + candidateBounds[2]) / 2,
    (candidateBounds[1] + candidateBounds[3]) / 2,
  ];
  const [east, north] = coordinateDeltaMeters(candidateCenter, referenceCenter);
  const [candidateWidth, candidateHeight] = coordinateDeltaMeters(
    [candidateBounds[2], candidateBounds[3]],
    [candidateBounds[0], candidateBounds[1]]
  );
  const [referenceWidth, referenceHeight] = coordinateDeltaMeters(
    [referenceBounds[2], referenceBounds[3]],
    [referenceBounds[0], referenceBounds[1]]
  );
  const extentPenalty = Math.hypot(
    Math.abs(candidateWidth - referenceWidth),
    Math.abs(candidateHeight - referenceHeight)
  );
  return Math.hypot(east, north) + extentPenalty * 0.05;
}

function localMetersToCoordinate(east, north, originLongitude, originLatitude) {
  const latitudeRadians = (originLatitude * Math.PI) / 180;
  return [
    originLongitude + (east / (EARTH_RADIUS * Math.cos(latitudeRadians))) * (180 / Math.PI),
    originLatitude + (north / EARTH_RADIUS) * (180 / Math.PI),
  ];
}

export function projectedMeshLocalMetersToCoordinate(
  east,
  north,
  originLongitude,
  originLatitude
) {
  // Compiled MSFS projected meshes use a flat-earth latitude scale that is distinct from the
  // Web Mercator longitude scale. Using one spherical or ellipsoidal radius for both axes makes
  // the north/south error grow with distance from the SceneryObject placement while east/west
  // placement remains correct.
  const eastMetersPerDegree =
    (Math.PI / 180) * EARTH_RADIUS * Math.cos((originLatitude * Math.PI) / 180);
  return [
    originLongitude + east / eastMetersPerDegree,
    originLatitude + north / MSFS_PROJECTED_MESH_NORTH_METERS_PER_DEGREE,
  ];
}

function coordinateDeltaMeters([longitude, latitude], [originLongitude, originLatitude]) {
  const latitudeRadians = (originLatitude * Math.PI) / 180;
  return [
    (((longitude - originLongitude) * Math.PI) / 180) * EARTH_RADIUS * Math.cos(latitudeRadians),
    (((latitude - originLatitude) * Math.PI) / 180) * EARTH_RADIUS,
  ];
}

function coordinateDistanceMeters(first, second) {
  const [east, north] = coordinateDeltaMeters(second, first);
  return Math.hypot(east, north);
}

function worldTextureMeters([longitude, latitude], referenceLatitude) {
  // MSFS airport surfaces are baked into the same conformal world tiling used
  // by terrain. Scale Web Mercator at the airport latitude so one UV metre is
  // locally one metre while retaining a stable global phase for localUV=false.
  const longitudeRadians = (longitude * Math.PI) / 180;
  const latitudeRadians = (Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI) / 180;
  const localScale = Math.cos((referenceLatitude * Math.PI) / 180);
  return [
    EARTH_RADIUS * longitudeRadians * localScale,
    EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) * localScale,
  ];
}

function mercatorPosition(longitude, latitude) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  return [
    (longitude + 180) / 360,
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))) / 360,
  ];
}

function componentNormalized(value, maximum) {
  return Math.max(value / maximum, -1);
}

function normalizeComponent(value, type) {
  if (type === 5120) return componentNormalized(value, 127);
  if (type === 5121) return value / 255;
  if (type === 5122) return componentNormalized(value, 32767);
  if (type === 5123) return value / 65535;
  if (type === 5125) return value / 4294967295;
  return value;
}

function guidFromView(view, offset) {
  const first = view.getUint32(offset, true).toString(16).padStart(8, '0');
  const second = view
    .getUint16(offset + 4, true)
    .toString(16)
    .padStart(4, '0');
  const third = view
    .getUint16(offset + 6, true)
    .toString(16)
    .padStart(4, '0');
  let fourth = '';
  let fifth = '';
  for (let index = 0; index < 2; index += 1)
    fourth += view
      .getUint8(offset + 8 + index)
      .toString(16)
      .padStart(2, '0');
  for (let index = 0; index < 6; index += 1)
    fifth += view
      .getUint8(offset + 10 + index)
      .toString(16)
      .padStart(2, '0');
  return `{${first}-${second}-${third}-${fourth}-${fifth}}`;
}

function findBytes(bytes, needle, start, end) {
  outer: for (let offset = start; offset <= end - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function zstdFrameLength(bytes) {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x28 ||
    bytes[1] !== 0xb5 ||
    bytes[2] !== 0x2f ||
    bytes[3] !== 0xfd
  )
    return null;
  const descriptor = bytes[4];
  const contentSizeFlag = descriptor >> 6;
  const singleSegment = Boolean(descriptor & 0x20);
  const dictionaryFlag = descriptor & 0x03;
  let cursor = 5 + (singleSegment ? 0 : 1);
  cursor += [0, 1, 2, 4][dictionaryFlag];
  cursor += contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][contentSizeFlag];
  while (cursor + 3 <= bytes.length) {
    const header = bytes[cursor] | (bytes[cursor + 1] << 8) | (bytes[cursor + 2] << 16);
    const last = Boolean(header & 1);
    const blockType = (header >> 1) & 3;
    const blockSize = header >> 3;
    if (blockType === 3) return null;
    cursor += 3 + (blockType === 1 ? 1 : blockSize);
    if (cursor > bytes.length) return null;
    if (last) {
      if (descriptor & 0x04) cursor += 4;
      return cursor <= bytes.length ? cursor : null;
    }
  }
  return null;
}

function ascii(bytes, start, end) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function pathBasename(value) {
  return normalize(value).split('/').at(-1).toLowerCase();
}

function normalize(value) {
  return String(value).replaceAll('\\', '/');
}

function safeName(value) {
  return String(value).replaceAll(/[^a-z0-9._-]+/gi, '_');
}

function isMarkingTexture(value) {
  return /(mark|line|number|blast|concedge)/i.test(String(value));
}

function compareRenderGroups(left, right) {
  const materialPass = (group) => {
    if (group.materialAlphaMode === 'BLEND') return 2;
    if (group.materialAlphaMode === 'MASK') return 1;
    return 0;
  };
  const isProjectedMesh = (group) => Number.isFinite(Number(group.placementHeading));
  const leftProjected = isProjectedMesh(left);
  const rightProjected = isProjectedMesh(right);

  // All airport ground primitives share one documented hierarchy. A projected mesh's Draw Before
  // byte selects a slot in this same sequence; separating projected meshes into their own render
  // domain discarded that byte and let broad pavement cover later apron numbers/markings.
  if (leftProjected && rightProjected) {
    // MSFS defines projected-mesh Priority as the authoritative ordering between overlapping
    // projected meshes: low priority first, high priority on top. Draw Before selects the mesh's
    // slot relative to airport primitives (aprons, taxiways, runways, markings, and text); it must
    // not reverse two projected meshes. A compiled airport proves the distinction: priority-3 pavement with
    // Draw Before RUNWAY_MARKING must remain below priority-5 gate numbers with Draw Before APRON.
    const priorityDifference =
      Number(left.placementPriority || 0) - Number(right.placementPriority || 0);
    if (priorityDifference) return priorityDifference;

    const samePlacement =
      left.placementRecordOffset === right.placementRecordOffset &&
      String(left.meshGuid || '') === String(right.meshGuid || '');
    if (!samePlacement) {
      // The SDK explicitly does not guarantee order between equal-priority projected meshes.
      // Preserve the compiled placement/model sequence instead of inventing a cross-model order
      // from unrelated material properties.
      return Number(left.sourceSequence || 0) - Number(right.sourceSequence || 0);
    }

    return (
      materialPass(left) - materialPass(right) ||
      Number(left.materialOrder || 0) - Number(right.materialOrder || 0) ||
      Number(left.averageLocalY || 0) - Number(right.averageLocalY || 0) ||
      Number(left.sourceSequence || 0) - Number(right.sourceSequence || 0)
    );
  }

  const hierarchyDifference = Number(left.renderStage || 0) - Number(right.renderStage || 0);
  if (hierarchyDifference) return hierarchyDifference;

  // Equal-slot objects retain their source-backed priority and compiled sequence.
  return (
    Number(left.renderStage || 0) - Number(right.renderStage || 0) ||
    Number(left.placementPriority || 0) - Number(right.placementPriority || 0) ||
    materialPass(left) - materialPass(right) ||
    Number(left.materialOrder || 0) - Number(right.materialOrder || 0) ||
    // Optimized projected meshes can split one authored draw layer across several primitives.
    // Their retained local Y offset is the only remaining source-backed tie-breaker once the
    // compiled stage/priority and material order are equal. Draw lower planes first so lifted
    // marking/text primitives are not covered by a later, lower primitive from the same layer.
    Number(left.averageLocalY || 0) - Number(right.averageLocalY || 0) ||
    Number(left.sourceSequence || 0) - Number(right.sourceSequence || 0)
  );
}

function plausibleCoordinate(longitude, latitude) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90
  );
}

function decodeLongitude(value) {
  return (value * 360) / (3 * 0x10000000) - 180;
}

function decodeLatitude(value) {
  return 90 - (value * 180) / (2 * 0x10000000);
}

function decodeAngle16(value) {
  return (value * 360) / 0x10000;
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
