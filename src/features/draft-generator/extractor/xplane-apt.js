/* oxlint-disable react-doctor/js-combine-iterations -- apt.dat parsing keeps validation and projection stages visible for source-backed geometry diagnostics. */

import { stableId } from './classify.js';
import { buildMustKeepZones } from './extract.js';
import { haversineDistanceMeters, offsetPointMeters } from './geo.js';
import {
  createXPlaneAssetResolver,
  detectXPlaneDsfEntries,
  extractXPlaneDsfEvidence,
} from './xplane-dsf.js';

const AIRPORT_HEADER_CODES = new Set([1, 16, 17]);
const LINEAR_NODE_CODES = new Set([111, 112, 113, 114, 115, 116]);
const BEZIER_NODE_CODES = new Set([112, 114, 116]);
const CLOSING_NODE_CODES = new Set([113, 114]);
const TERMINATING_NODE_CODES = new Set([115, 116]);
const XPLANE_LIGHT_CODES = new Set([101, 102, 103, 104, 105, 106, 107, 108]);
const XPLANE_MARKING_CODES = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 19, 20, 21, 22, 23, 24, 25, 30, 31, 32, 40, 41, 42,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 70, 71, 72, 73, 74, 75, 80, 81, 82, 90,
  91, 92,
]);
const APT_FILE_PATTERN = /(^|\/)apt\.dat$/i;
const BARS_REMOVAL_PACKAGE_PATTERN = /bars.*(removal|suppress)/i;
const MAX_CURVE_SEGMENTS = 64;
const CURVE_SAMPLE_METERS = 5;
const RUNWAY_LIGHT_CLEARANCE_METERS = 1.5;
const RUNWAY_CENTERLINE_SPACING_METERS = 15.24;
const RUNWAY_EDGE_SPACING_METERS = 60;
const APPROACH_LIGHT_LENGTH_METERS = new Map([
  [1, 420],
  [2, 900],
  [3, 900],
  [4, 900],
  [5, 900],
  [6, 900],
  [7, 900],
  [8, 900],
  [9, 900],
  [10, 900],
  [11, 900],
  [12, 900],
]);

const LIGHT_DEFINITIONS = new Map([
  [101, { classification: 'taxi-centerline', label: 'green bidirectional taxiway centreline' }],
  [102, { classification: 'taxi-edge', label: 'blue omnidirectional taxiway edge' }],
  [103, { classification: 'stopbar', label: 'steady amber hold-line' }],
  [104, { classification: 'stopbar', label: 'pulsating amber runway hold-line' }],
  [105, { classification: 'taxi-centerline', label: 'green/amber runway-zone centreline' }],
  [106, { classification: 'airfield-light', label: 'red critical-zone edge' }],
  [107, { classification: 'lead-on', label: 'unidirectional green runway lead-off' }],
  [108, { classification: 'lead-on', label: 'green/amber runway-zone lead-off' }],
]);
const MARKING_DEFINITIONS = new Map([
  [1, { classification: 'taxi-centerline', label: 'solid taxiway centreline' }],
  [2, { classification: 'painted-marking', label: 'broken yellow boundary' }],
  [3, { classification: 'painted-marking', label: 'double solid taxiway edge' }],
  [4, { classification: 'stopbar', label: 'runway hold-position marking' }],
  [5, { classification: 'stopbar', label: 'other hold-position marking' }],
  [6, { classification: 'stopbar', label: 'ILS hold-position marking' }],
  [7, { classification: 'taxi-centerline', label: 'runway-safety-zone centreline' }],
  [8, { classification: 'painted-marking', label: 'aircraft queue lane' }],
  [9, { classification: 'painted-marking', label: 'double aircraft queue lane' }],
  [10, { classification: 'taxi-centerline', label: 'wide taxiway centreline' }],
  [11, { classification: 'taxi-centerline', label: 'wide runway-safety-zone centreline' }],
  [12, { classification: 'stopbar', label: 'wide runway hold-position marking' }],
  [13, { classification: 'stopbar', label: 'wide other hold-position marking' }],
  [14, { classification: 'stopbar', label: 'wide ILS hold-position marking' }],
  [19, { classification: 'painted-marking', label: 'taxiway shoulder bars' }],
  [20, { classification: 'painted-marking', label: 'solid white roadway edge' }],
  [21, { classification: 'painted-marking', label: 'white roadway checkerboard' }],
  [22, { classification: 'painted-marking', label: 'broken white roadway centreline' }],
  [23, { classification: 'painted-marking', label: 'short broken white roadway edge' }],
  [24, { classification: 'painted-marking', label: 'wide solid white roadway edge' }],
  [25, { classification: 'painted-marking', label: 'wide broken white roadway centreline' }],
  [30, { classification: 'painted-marking', label: 'solid red line' }],
  [31, { classification: 'painted-marking', label: 'broken red line' }],
  [32, { classification: 'painted-marking', label: 'wide solid red line' }],
  [40, { classification: 'painted-marking', label: 'solid orange line' }],
  [41, { classification: 'painted-marking', label: 'solid blue line' }],
  [42, { classification: 'painted-marking', label: 'solid green line' }],
]);

export function detectXPlaneAptEntries(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.file && APT_FILE_PATTERN.test(normalizePath(entry.path)))
    .sort((left, right) => aptFilePriority(left.path) - aptFilePriority(right.path));
}

export async function extractXPlaneAirportData({
  entries,
  icao,
  packageName,
  airportPosition,
  onProgress,
}) {
  const normalizedIcao = normalizeIcao(icao);
  const aptEntries = detectXPlaneAptEntries(entries);
  const dsfEntries = detectXPlaneDsfEntries(entries);
  if (aptEntries.length === 0 && dsfEntries.length === 0) {
    throw new Error(
      'No X-Plane apt.dat or DSF scenery tile was found. Choose the scenery package, its Earth nav data folder, or Global Scenery/Global Airports.'
    );
  }

  let selected = null;
  const inspectedFiles = [];
  for (let index = 0; index < aptEntries.length; index += 1) {
    const entry = aptEntries[index];
    const sourceFile = normalizePath(entry.path);
    inspectedFiles.push(sourceFile);
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- Scenery priority must be respected and scanning stops at the first package defining the airport.
    const airportLines = await readAirportBlock(entry.file, normalizedIcao, (fraction) => {
      onProgress?.({
        file: sourceFile,
        fileIndex: index,
        fileCount: aptEntries.length,
        fraction,
      });
    });
    if (airportLines) {
      selected = parseAirportLines(airportLines, {
        icao: normalizedIcao,
        sourceFile,
      });
      break;
    }
  }

  if (!selected && dsfEntries.length === 0) {
    throw new Error(
      `${normalizedIcao} was not found in the selected X-Plane airport data. Choose the airport's custom scenery package or Global Scenery/Global Airports.`
    );
  }

  const aptData = selected ?? emptyAirportData(normalizedIcao);
  const assetResolver = await createXPlaneAssetResolver(entries);
  await attachAptMarkingAssets(aptData.lightRows, assetResolver);
  const airportLatitude = airportPosition?.lat ?? airportPosition?.latitude;
  const airportLongitude = airportPosition?.lon ?? airportPosition?.longitude;
  const evidencePosition = validCoordinate(airportLatitude, airportLongitude)
    ? { lat: Number(airportLatitude), lon: Number(airportLongitude) }
    : airportCenter(aptData);
  const dsfEvidence = await extractXPlaneDsfEvidence({
    entries,
    icao: normalizedIcao,
    airportPosition: evidencePosition,
    assetResolver,
    onProgress: (progress) => onProgress?.({ ...progress, phase: 'dsf' }),
  });
  const lightRows = [...aptData.lightRows, ...dsfEvidence.lightRows].sort(
    (left, right) =>
      (Number(left.evidencePriority) || 99) - (Number(right.evidencePriority) || 99) ||
      String(left.id).localeCompare(String(right.id))
  );
  const instances = [...aptData.instances, ...dsfEvidence.instances];
  const mustKeepZones = buildMustKeepZones(instances, lightRows, aptData.runwayLightZones);
  const warnings = [...aptData.warnings, ...dsfEvidence.warnings];
  if (lightRows.length === 0 && dsfEvidence.instances.length === 0) {
    warnings.push(
      `${normalizedIcao}: no supported source geometry was decoded; unmatched BARS objects will remain available for manual placement.`
    );
  }
  return {
    meta: {
      input: packageName || 'X-Plane scenery',
      icao: normalizedIcao,
      simulator: 'xplane',
      generatedAt: new Date().toISOString(),
      filesScanned: entries?.length ?? 0,
      aptDatFilesInspected: inspectedFiles.length,
      aptDatFilesParsed: selected ? 1 : 0,
      aptDatSourceFile: selected?.sourceFile,
      aptDatVersion: selected?.version,
      airportName: aptData.airportName,
      airportIdentifier: aptData.airportIdentifier,
      runwayRecordsParsed: aptData.runways.length,
      aptDatLightStringsDecoded: aptData.lightRows.filter(
        (row) => row.sourceType === 'xplane-apt-light-string'
      ).length,
      aptDatPaintedMarkingsDecoded: aptData.lightRows.filter(
        (row) => row.sourceType === 'xplane-apt-painted-marking'
      ).length,
      mustKeepZonesGenerated: mustKeepZones.length,
      protectionConflicts: 0,
      unsupportedFiles: [],
      warnings,
      ...dsfEvidence.meta,
    },
    instances,
    lightRows,
    runways: aptData.runways,
    referenceFeatures: [
      ...(aptData.referenceFeatures ?? []),
      ...(dsfEvidence.referenceFeatures ?? []),
    ],
    mustKeepZones,
    protectionConflicts: [],
    removalPolygons: [],
    exclusionCandidates: [],
    existingExclusionRectangles: [],
  };
}

async function attachAptMarkingAssets(rows, assetResolver) {
  const assets = new Map();
  for (const row of rows) {
    if (row.sourceType !== 'xplane-apt-painted-marking') continue;
    const code = Number(row.markingCode);
    if (!assets.has(code)) {
      const definitionPath = assetResolver.aptMarkingDefinition(code);
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- Each distinct apt.dat paint code resolves once from a tiny cached .lin definition.
      const asset = definitionPath ? await assetResolver.describePolygon(definitionPath) : null;
      assets.set(code, asset ? { definitionPath, asset } : null);
    }
    const resolved = assets.get(code);
    if (!resolved) continue;
    Object.assign(row, {
      sourceDefinition: resolved.definitionPath,
      sourceAssetPath: resolved.asset.resolvedPath,
      textureAssetPath: resolved.asset.textureAssetPath || '',
      textureScale: resolved.asset.textureScale || null,
      textureWidthMeters: resolved.asset.textureWidthMeters || null,
      textureHeightMeters: resolved.asset.textureHeightMeters || null,
      textureScaleX: resolved.asset.textureScaleX || null,
      textureScaleY: resolved.asset.textureScaleY || null,
      texturePixelWidth: resolved.asset.texturePixelWidth || null,
      texturePixelHeight: resolved.asset.texturePixelHeight || null,
      textureWrap: resolved.asset.textureWrap !== false,
      textureNoAlpha: resolved.asset.textureNoAlpha === true,
      lineTextureLayers: resolved.asset.lineTextureLayers || null,
      mirrorTexture: resolved.asset.mirror || false,
      alignSegments: resolved.asset.alignSegments || null,
      startCaps: resolved.asset.startCaps || null,
      endCaps: resolved.asset.endCaps || null,
    });
  }
}

function emptyAirportData(icao) {
  return {
    sourceFile: undefined,
    version: undefined,
    airportIdentifier: icao,
    airportName: icao,
    lightRows: [],
    instances: [],
    runways: [],
    runwayLightZones: [],
    referenceFeatures: [],
    warnings: [
      `${icao}: no apt.dat airport record was found; using airport-filtered DSF evidence only.`,
    ],
  };
}

function airportCenter(data) {
  const points = [
    ...data.runways.flatMap((runway) => [runway.first, runway.second]),
    ...data.lightRows.flatMap((row) => row.vertices ?? []),
    ...data.instances,
  ].filter((point) => validCoordinate(point?.lat, point?.lon));
  if (points.length === 0) return undefined;
  return {
    lat: points.reduce((sum, point) => sum + Number(point.lat), 0) / points.length,
    lon: points.reduce((sum, point) => sum + Number(point.lon), 0) / points.length,
  };
}

export function parseAptDatAirport(text, options) {
  const normalizedIcao = normalizeIcao(options?.icao);
  const lines = airportBlockFromLines(String(text ?? '').split(/\r?\n/), normalizedIcao);
  if (!lines) return null;
  return parseAirportLines(lines, {
    icao: normalizedIcao,
    sourceFile: options?.sourceFile || 'apt.dat',
  });
}

function parseAirportLines(lines, { icao, sourceFile }) {
  const header = splitFields(lines[0]);
  const lightRows = [];
  const instances = [];
  const runways = [];
  const runwayLightZones = [];
  const referenceFeatures = [];
  const warnings = [];
  const taxiRouteNodes = new Map();
  let version;
  let airportIdentifier = header[4] || icao;
  const airportName = header.slice(5).join(' ') || airportIdentifier;
  let linear = null;
  let pavement = null;

  const flushLinear = () => {
    if (!linear) return;
    linear.featureId = stableId(
      'xplane-apt-feature-v1',
      linear.sourceLines.map(normalizeAptLine).join('\n')
    );
    flushAllRuns(linear, lightRows, sourceFile);
    linear = null;
  };
  const flushPavement = () => {
    if (!pavement) return;
    const rings = pavement.rings
      .map((nodes) => sampleAptPath(nodes))
      .filter((geometry) => geometry.length >= 3)
      .map((geometry) => {
        const ring = geometry.map((point) => [point.lon, point.lat]);
        const first = ring[0];
        const last = ring.at(-1);
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
        return ring;
      });
    if (rings.length > 0) {
      const featureId = stableId(
        'xplane-apt-pavement-v1',
        sourceFile,
        pavement.description,
        pavement.sourceLines.map(normalizeAptLine).join('\n')
      );
      referenceFeatures.push({
        type: 'Feature',
        id: featureId,
        geometry: {
          type: 'Polygon',
          coordinates: rings,
        },
        properties: {
          sourceId: featureId,
          sourceType: 'xplane-apt-pavement',
          sourceFile,
          title: pavement.description || 'Airport pavement',
          semanticType: 'pavement',
          snapCategory: 'pavement-edges',
          exactness: 'exact',
          surfaceCode: pavement.surfaceCode,
          materialKind: xplaneSurfaceKind(pavement.surfaceCode),
          smoothness: pavement.smoothness,
          textureHeading: pavement.textureHeading,
        },
      });
    }
    pavement = null;
  };

  for (const rawLine of lines) {
    const fields = splitFields(rawLine);
    if (fields.length === 0) continue;
    const code = Number(fields[0]);

    if (rawLine === lines[0]) continue;
    if (
      !version &&
      (fields[0] === '1000' || fields[0] === '1100' || fields[0] === '1130' || fields[0] === '1200')
    ) {
      version = Number(fields[0]);
    }
    if (code === 1302 && fields[1] === 'icao_code' && fields[2]) {
      airportIdentifier = fields[2].toUpperCase();
      continue;
    }
    if (code === 100) {
      flushLinear();
      flushPavement();
      const runway = parseRunway(fields, sourceFile, runways.length);
      if (runway) {
        runways.push(runway);
        runwayLightZones.push(...buildXPlaneRunwayLightZones(runway));
      } else {
        warnings.push(`${sourceFile}: ignored malformed apt.dat runway record`);
      }
      continue;
    }
    if (code === 102) {
      const helipad = parseHelipad(fields, sourceFile, referenceFeatures.length);
      if (helipad) referenceFeatures.push(helipad);
      continue;
    }
    if (code === 1201) {
      const nodeId = Number(fields[4]);
      const lat = Number(fields[1]);
      const lon = Number(fields[2]);
      if (Number.isInteger(nodeId) && validCoordinate(lat, lon)) {
        taxiRouteNodes.set(nodeId, { lat, lon, usage: fields[3], name: fields.slice(5).join(' ') });
      }
      continue;
    }
    if (code === 1202) {
      const start = taxiRouteNodes.get(Number(fields[1]));
      const end = taxiRouteNodes.get(Number(fields[2]));
      if (start && end) {
        referenceFeatures.push(
          aptLineFeature({
            sourceFile,
            key: `taxi-route:${fields[1]}:${fields[2]}`,
            coordinates: [
              [start.lon, start.lat],
              [end.lon, end.lat],
            ],
            title: fields[5] ? `ATC taxi route ${fields.slice(5).join(' ')}` : 'ATC taxi route',
            semanticType: 'atc-taxi-route',
            snapCategory: 'taxiway-centrelines',
            properties: {
              direction: fields[3] || '',
              aircraftRestriction: fields[4] || '',
              sourceDefinedRoute: true,
            },
          })
        );
      }
      continue;
    }
    if (code === 20 || code === 1300 || code === 18 || code === 19) {
      const point = parseAirportPointReference(code, fields, sourceFile, referenceFeatures.length);
      if (point) referenceFeatures.push(point);
      continue;
    }
    if (code === 21) {
      const fixture = parseLightingFixture(fields, sourceFile, instances.length);
      if (fixture) instances.push(fixture);
      continue;
    }
    if (code === 110) {
      flushLinear();
      flushPavement();
      pavement = {
        surfaceCode: Number(fields[1]) || 0,
        smoothness: Number(fields[2]) || 0,
        textureHeading: Number(fields[3]) || 0,
        description: fields.slice(4).join(' ') || 'Airport pavement',
        sourceLines: [rawLine],
        rings: [],
        nodes: [],
      };
      continue;
    }
    if (code === 120) {
      flushLinear();
      flushPavement();
      linear = {
        description: fields.slice(1).join(' ') || 'X-Plane light string',
        sourceLines: [rawLine],
        nodes: [],
        runs: new Map(),
        runCounts: new Map(),
        markingRuns: new Map(),
        rowIndex: 0,
        markingRowIndex: 0,
      };
      continue;
    }
    if (linear && LINEAR_NODE_CODES.has(code)) {
      const node = parseLinearNode(fields, code);
      if (!node) {
        warnings.push(`${sourceFile}: ignored malformed apt.dat node: ${rawLine}`);
        continue;
      }
      linear.sourceLines.push(rawLine);
      linear.nodes.push(node);
      if (CLOSING_NODE_CODES.has(code) || TERMINATING_NODE_CODES.has(code)) flushLinear();
      continue;
    }
    if (pavement && LINEAR_NODE_CODES.has(code)) {
      const node = parseLinearNode(fields, code);
      if (!node) {
        warnings.push(`${sourceFile}: ignored malformed apt.dat pavement node: ${rawLine}`);
        continue;
      }
      pavement.sourceLines.push(rawLine);
      pavement.nodes.push(node);
      if (CLOSING_NODE_CODES.has(code)) {
        pavement.rings.push(pavement.nodes);
        pavement.nodes = [];
      } else if (TERMINATING_NODE_CODES.has(code)) {
        warnings.push(
          `${sourceFile}: ignored open apt.dat pavement contour; pavement boundaries must close`
        );
        pavement.nodes = [];
      }
      continue;
    }
    if (linear) flushLinear();
    if (pavement) flushPavement();
  }
  flushLinear();
  flushPavement();

  return {
    sourceFile,
    version,
    airportIdentifier,
    airportName,
    lightRows,
    instances,
    runways,
    runwayLightZones,
    referenceFeatures,
    warnings,
  };
}

function xplaneSurfaceKind(surfaceCode) {
  if (surfaceCode === 1) return 'asphalt-medium';
  if (surfaceCode >= 20 && surfaceCode <= 23) return 'asphalt-light';
  if (surfaceCode >= 24 && surfaceCode <= 26) return 'asphalt-medium';
  if (surfaceCode >= 27 && surfaceCode <= 30) return 'asphalt-dark';
  if (surfaceCode >= 31 && surfaceCode <= 34) return 'asphalt-very-dark';
  if (surfaceCode >= 35 && surfaceCode <= 38) return 'asphalt-near-black';
  if (surfaceCode === 2) return 'concrete-medium';
  if (surfaceCode >= 50 && surfaceCode <= 52) return 'concrete-light';
  if (surfaceCode >= 53 && surfaceCode <= 54) return 'concrete-medium';
  if (surfaceCode >= 55 && surfaceCode <= 57) return 'concrete-dark';
  if (surfaceCode === 3) return 'grass';
  if (surfaceCode === 4) return 'dirt';
  if (surfaceCode === 5) return 'gravel';
  if (surfaceCode === 12) return 'lakebed';
  if (surfaceCode === 13) return 'water';
  if (surfaceCode === 14) return 'snow';
  if (surfaceCode === 15) return 'transparent';
  return 'unknown';
}

function parseHelipad(fields, sourceFile, index) {
  const label = fields[1] || 'H';
  const lat = Number(fields[2]);
  const lon = Number(fields[3]);
  const heading = Number(fields[4]);
  const lengthMeters = Number(fields[5]);
  const widthMeters = Number(fields[6]);
  const surfaceCode = Number(fields[7]) || 0;
  if (
    !validCoordinate(lat, lon) ||
    !Number.isFinite(heading) ||
    !Number.isFinite(lengthMeters) ||
    !Number.isFinite(widthMeters) ||
    lengthMeters <= 0 ||
    widthMeters <= 0
  ) {
    return null;
  }
  const ring = orientedRectangle({ lat, lon }, heading, lengthMeters, widthMeters);
  const sourceId = stableId('xplane-apt-helipad', sourceFile, index, label, lat, lon);
  return {
    type: 'Feature',
    id: sourceId,
    geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    properties: {
      sourceId,
      sourceType: 'xplane-apt-helipad',
      sourceFile,
      title: `Helipad ${label}`,
      semanticType: 'helipad',
      snapCategory: 'pavement-edges',
      exactness: 'exact',
      label,
      heading,
      lengthMeters,
      widthMeters,
      surfaceCode,
      materialKind: xplaneSurfaceKind(surfaceCode),
      markingCode: Number(fields[8]) || 0,
      shoulderSurfaceCode: Number(fields[9]) || 0,
      smoothness: Number(fields[10]) || 0,
      edgeLights: Number(fields[11]) === 1,
    },
  };
}

function parseAirportPointReference(code, fields, sourceFile, index) {
  const lat = Number(fields[1]);
  const lon = Number(fields[2]);
  if (!validCoordinate(lat, lon)) return null;
  const definitions = {
    18: { title: fields.slice(4).join(' ') || 'Airport beacon', semanticType: 'beacon' },
    19: { title: fields.slice(4).join(' ') || 'Windsock', semanticType: 'windsock' },
    20: { title: 'Taxiway sign', semanticType: 'taxiway-sign' },
    1300: { title: fields.slice(6).join(' ') || 'Ramp start', semanticType: 'ramp-start' },
  };
  const definition = definitions[code];
  if (!definition) return null;
  const sourceId = stableId('xplane-apt-point', sourceFile, code, index, lat, lon);
  return {
    type: 'Feature',
    id: sourceId,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      sourceId,
      sourceType: `xplane-apt-${definition.semanticType}`,
      sourceFile,
      title: definition.title,
      semanticType: definition.semanticType,
      snapCategory: 'fixtures',
      exactness: 'exact',
      heading: Number(fields[3]) || 0,
      signSize: code === 20 ? Number(fields[5]) || 0 : 0,
      signText: code === 20 ? fields.slice(6).join(' ') : '',
    },
  };
}

function aptLineFeature({
  sourceFile,
  key,
  coordinates,
  title,
  semanticType,
  snapCategory,
  properties = {},
}) {
  const sourceId = stableId('xplane-apt-reference', sourceFile, key, JSON.stringify(coordinates));
  return {
    type: 'Feature',
    id: sourceId,
    geometry: { type: 'LineString', coordinates },
    properties: {
      sourceId,
      sourceType: `xplane-apt-${semanticType}`,
      sourceFile,
      title,
      semanticType,
      snapCategory,
      exactness: 'exact',
      ...properties,
    },
  };
}

function orientedRectangle(center, heading, lengthMeters, widthMeters) {
  const forward = offsetAtHeading(center, heading, lengthMeters / 2);
  const backward = offsetAtHeading(center, heading + 180, lengthMeters / 2);
  return [
    offsetAtHeading(backward, heading - 90, widthMeters / 2),
    offsetAtHeading(forward, heading - 90, widthMeters / 2),
    offsetAtHeading(forward, heading + 90, widthMeters / 2),
    offsetAtHeading(backward, heading + 90, widthMeters / 2),
  ];
}

function offsetAtHeading(point, heading, distanceMeters) {
  const radians = (heading * Math.PI) / 180;
  return offsetPointMeters(
    point,
    Math.sin(radians) * distanceMeters,
    Math.cos(radians) * distanceMeters
  );
}

function sampleAptPath(rawNodes) {
  const nodes = collapseSplitBezierNodes(rawNodes);
  const geometry = [];
  for (let index = 1; index < nodes.length; index += 1) {
    appendDistinctVertices(geometry, sampleSegment(nodes[index - 1], nodes[index]));
  }
  if (nodes.length > 1 && CLOSING_NODE_CODES.has(nodes.at(-1).code)) {
    appendDistinctVertices(geometry, sampleSegment(nodes.at(-1), nodes[0]));
  }
  return geometry;
}

function decodeLinearPath(linear, rows, sourceFile) {
  const nodes = collapseSplitBezierNodes(linear.nodes);
  for (let index = 1; index < nodes.length; index += 1) {
    appendSegment(linear, nodes[index - 1], nodes[index], rows, sourceFile);
  }
  if (nodes.length > 1 && CLOSING_NODE_CODES.has(nodes.at(-1).code)) {
    appendSegment(linear, nodes.at(-1), nodes[0], rows, sourceFile);
  }
}

function appendSegment(linear, start, end, rows, sourceFile) {
  if (!start || !end) return;
  const segment = sampleSegment(start, end);
  appendStyledSegment(linear.runs, new Set(start.lightCodes), segment, (code) =>
    flushRun(linear, code, rows, sourceFile)
  );
  appendStyledSegment(linear.markingRuns, new Set(start.markingCodes), segment, (code) =>
    flushMarkingRun(linear, code, rows, sourceFile)
  );
}

function appendStyledSegment(runs, activeCodes, segment, flush) {
  for (const code of [...runs.keys()]) {
    if (!activeCodes.has(code)) flush(code);
  }
  for (const code of activeCodes) {
    let vertices = runs.get(code);
    if (!vertices) {
      vertices = [];
      runs.set(code, vertices);
    }
    appendDistinctVertices(vertices, segment);
  }
}

function flushAllRuns(linear, rows, sourceFile) {
  decodeLinearPath(linear, rows, sourceFile);
  for (const code of [...linear.runs.keys()]) {
    flushRun(linear, code, rows, sourceFile);
  }
  for (const code of [...linear.markingRuns.keys()]) {
    flushMarkingRun(linear, code, rows, sourceFile);
  }
}

function flushRun(linear, code, rows, sourceFile) {
  const vertices = linear.runs.get(code) ?? [];
  linear.runs.delete(code);
  if (vertices.length < 2) return;
  const definition = LIGHT_DEFINITIONS.get(code);
  const sourceRunIndex = linear.runCounts.get(code) ?? 0;
  linear.runCounts.set(code, sourceRunIndex + 1);
  rows.push({
    id: stableId(sourceFile, linear.description, code, linear.rowIndex, JSON.stringify(vertices)),
    sourceFile,
    sourceType: 'xplane-apt-light-string',
    sourceBasis: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
    rawTag: 'apt.dat linear feature',
    preset: `apt-light-${code}`,
    lightCode: code,
    sourceFeatureId: linear.featureId,
    sourceRunIndex,
    lightDescription: definition.label,
    vertices,
    classification: definition.classification,
    confidence: 1,
    classificationReasons: [`X-Plane apt.dat lighting code ${code}: ${definition.label}`],
  });
  linear.rowIndex += 1;
}

function normalizeAptLine(line) {
  return String(line ?? '')
    .trim()
    .split(/\s+/)
    .join(' ');
}

function flushMarkingRun(linear, code, rows, sourceFile) {
  const vertices = linear.markingRuns.get(code) ?? [];
  linear.markingRuns.delete(code);
  if (vertices.length < 2) return;
  const normalizedCode =
    code >= 51 && code <= 64 ? code - 50 : code >= 70 && code <= 92 ? code - 50 : code;
  const definition = MARKING_DEFINITIONS.get(normalizedCode);
  if (!definition) return;
  rows.push({
    id: stableId(
      sourceFile,
      linear.description,
      'painted-marking',
      code,
      linear.markingRowIndex,
      JSON.stringify(vertices)
    ),
    sourceFile,
    sourceType: 'xplane-apt-painted-marking',
    sourceBasis: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
    rawTag: 'apt.dat linear feature marking',
    preset: `apt-marking-${code}`,
    markingCode: code,
    markingDescription: definition.label,
    vertices,
    classification: definition.classification,
    confidence: 1,
    classificationReasons: [
      `X-Plane apt.dat marking code ${code}: ${definition.label}`,
      'painted marking is placement-only evidence and never authorizes a light removal',
    ],
  });
  linear.markingRowIndex += 1;
}

function parseLinearNode(fields, code) {
  const lat = Number(fields[1]);
  const lon = Number(fields[2]);
  if (!validCoordinate(lat, lon)) return null;
  const hasBezier = BEZIER_NODE_CODES.has(code);
  const controlLat = hasBezier ? Number(fields[3]) : undefined;
  const controlLon = hasBezier ? Number(fields[4]) : undefined;
  const styleStart = hasBezier ? 5 : 3;
  const lightCodes = TERMINATING_NODE_CODES.has(code)
    ? []
    : fields
        .slice(styleStart)
        .flatMap((field) => field.split(','))
        .map(Number)
        .filter((value) => XPLANE_LIGHT_CODES.has(value));
  const markingCodes = TERMINATING_NODE_CODES.has(code)
    ? []
    : fields
        .slice(styleStart)
        .flatMap((field) => field.split(','))
        .map(Number)
        .filter((value) => XPLANE_MARKING_CODES.has(value));

  return {
    code,
    lat,
    lon,
    curved: hasBezier,
    ...(validCoordinate(controlLat, controlLon)
      ? { control: { lat: controlLat, lon: controlLon } }
      : {}),
    lightCodes: [...new Set(lightCodes)],
    markingCodes: [...new Set(markingCodes)],
  };
}

function collapseSplitBezierNodes(rawNodes) {
  const nodes = [];
  for (let index = 0; index < rawNodes.length; index += 1) {
    const first = rawNodes[index];
    let last = first;
    // WED encodes a split handle as curved/straight/curved records at one coordinate.
    // Collapse only mixed curved/straight pairs; two curved co-located nodes form a real loop.
    while (index + 1 < rawNodes.length) {
      const next = rawNodes[index + 1];
      const colocated = next.lat === first.lat && next.lon === first.lon;
      const exactlyOneCurved = last.curved !== next.curved;
      if (!colocated || !exactlyOneCurved) break;
      last = next;
      index += 1;
    }
    nodes.push({
      ...last,
      incomingControl: first.control ? mirrorControl(first, first.control) : undefined,
      outgoingControl: last.control,
    });
  }
  return nodes;
}

function parseRunway(fields, sourceFile, runwayIndex) {
  const widthMeters = Number(fields[1]);
  const first = {
    label: fields[8],
    lat: Number(fields[9]),
    lon: Number(fields[10]),
    displacedThresholdMeters: Number(fields[11]) || 0,
    overrunMeters: Number(fields[12]) || 0,
    markingCode: Number(fields[13]) || 0,
    approachType: Number(fields[14]) || 0,
    touchdownZoneLights: Number(fields[15]) === 1,
    reil: Number(fields[16]) === 1,
  };
  const second = {
    label: fields[17],
    lat: Number(fields[18]),
    lon: Number(fields[19]),
    displacedThresholdMeters: Number(fields[20]) || 0,
    overrunMeters: Number(fields[21]) || 0,
    markingCode: Number(fields[22]) || 0,
    approachType: Number(fields[23]) || 0,
    touchdownZoneLights: Number(fields[24]) === 1,
    reil: Number(fields[25]) === 1,
  };
  if (
    !Number.isFinite(widthMeters) ||
    widthMeters <= 0 ||
    !validCoordinate(first.lat, first.lon) ||
    !validCoordinate(second.lat, second.lon)
  ) {
    return null;
  }

  const lengthMeters = haversineDistanceMeters(first, second);
  const local = runwayLocalFrame(first, second);
  const center = localPointBetween(first, second, lengthMeters / 2);
  return {
    id: stableId('xplane-runway', sourceFile, runwayIndex, first.label, second.label),
    sourceFile,
    sourceType: 'xplane-runway',
    sourceRecordOffset: runwayIndex,
    lat: center.lat,
    lon: center.lon,
    lengthMeters,
    widthMeters,
    surfaceCode: Number(fields[2]) || 0,
    materialKind: xplaneSurfaceKind(Number(fields[2]) || 0),
    shoulderCode: Number(fields[3]) || 0,
    smoothness: Number(fields[4]) || 0,
    heading: (Math.atan2(local.east, local.north) * 180) / Math.PI,
    primaryLabel: first.label,
    secondaryLabel: second.label,
    centerlineLights: Number(fields[5]) === 1,
    edgeLightLevel: Number(fields[6]) || 0,
    autoDistanceSigns: Number(fields[7]) === 1,
    first,
    second,
  };
}

function parseLightingFixture(fields, sourceFile, fixtureIndex) {
  const lat = Number(fields[1]);
  const lon = Number(fields[2]);
  const fixtureType = Number(fields[3]);
  if (!validCoordinate(lat, lon) || !Number.isFinite(fixtureType)) return null;
  const isRunwayGuard = fixtureType === 6;
  return {
    id: stableId('xplane-lighting-fixture', sourceFile, fixtureIndex, fixtureType, lat, lon),
    sourceFile,
    sourceType: 'xplane-apt-lighting-object',
    rawTag: 'apt.dat row 21',
    lat,
    lon,
    fixtureType,
    heading: Number(fields[4]) || 0,
    classification: isRunwayGuard ? 'runway-guard' : 'runway',
    confidence: 1,
    classificationReasons: [
      `X-Plane apt.dat lighting-object type ${fixtureType} is an explicit non-target fixture`,
    ],
  };
}

function buildXPlaneRunwayLightZones(runway) {
  const zones = [];
  const thresholdFirst = localPointBetween(
    runway.first,
    runway.second,
    runway.first.displacedThresholdMeters
  );
  const thresholdSecond = localPointBetween(
    runway.second,
    runway.first,
    runway.second.displacedThresholdMeters
  );
  const halfWidth = runway.widthMeters / 2;

  if (runway.centerlineLights) {
    const centerlineLength = haversineDistanceMeters(thresholdFirst, thresholdSecond);
    for (const distance of stationDistances(centerlineLength, RUNWAY_CENTERLINE_SPACING_METERS)) {
      zones.push(
        xplaneRunwayPointZone(
          runway,
          `runway-centerline-${Math.round(distance * 100)}`,
          localPointBetween(thresholdFirst, thresholdSecond, distance),
          {
            clearanceMeters: 0.75,
            nominalSpacingMeters: RUNWAY_CENTERLINE_SPACING_METERS,
            geometryMode: 'source-runway-procedural-grid',
          }
        )
      );
    }
    zones.push(
      xplaneRunwayLineZone(
        runway,
        'runway-centerline-continuous-envelope',
        [thresholdFirst, thresholdSecond],
        {
          clearanceMeters: 0.75,
          nominalSpacingMeters: RUNWAY_CENTERLINE_SPACING_METERS,
          geometryMode: 'continuous-procedural-envelope',
        }
      )
    );
  }
  if (runway.edgeLightLevel > 0) {
    for (const side of [-1, 1]) {
      for (const distance of stationDistances(runway.lengthMeters, RUNWAY_EDGE_SPACING_METERS)) {
        zones.push(
          xplaneRunwayPointZone(
            runway,
            `runway-edge-${side < 0 ? 'left' : 'right'}-${Math.round(distance * 100)}`,
            runwayOffsetPoint(
              runway,
              localPointBetween(runway.first, runway.second, distance),
              side * halfWidth
            ),
            {
              lightLevel: runway.edgeLightLevel,
              nominalSpacingMeters: RUNWAY_EDGE_SPACING_METERS,
              geometryMode: 'source-runway-procedural-grid',
            }
          )
        );
      }
      zones.push(
        xplaneRunwayLineZone(
          runway,
          `runway-edge-${side < 0 ? 'left' : 'right'}-continuous-envelope`,
          [
            runwayOffsetPoint(runway, runway.first, side * halfWidth),
            runwayOffsetPoint(runway, runway.second, side * halfWidth),
          ],
          {
            lightLevel: runway.edgeLightLevel,
            nominalSpacingMeters: RUNWAY_EDGE_SPACING_METERS,
            geometryMode: 'continuous-procedural-envelope',
          }
        )
      );
    }
    for (const [name, end] of [
      ['first', runway.first],
      ['second', runway.second],
    ]) {
      zones.push(
        xplaneRunwayLineZone(
          runway,
          `runway-end-${name}`,
          [runwayOffsetPoint(runway, end, -halfWidth), runwayOffsetPoint(runway, end, halfWidth)],
          {
            lightLevel: runway.edgeLightLevel,
            geometryMode: 'continuous-procedural-envelope',
          }
        )
      );
    }
  }

  for (const [name, end, opposite, threshold] of [
    ['first', runway.first, runway.second, thresholdFirst],
    ['second', runway.second, runway.first, thresholdSecond],
  ]) {
    if (end.approachType > 0) {
      const length = APPROACH_LIGHT_LENGTH_METERS.get(end.approachType) ?? 900;
      const outside = localPointBeyond(threshold, opposite, length);
      zones.push(
        xplaneRunwayLineZone(runway, `runway-approach-${name}`, [threshold, outside], {
          approachType: end.approachType,
          clearanceMeters: Math.max(15, runway.widthMeters / 2),
        })
      );
    }
    if (end.reil) {
      const reilOffset = halfWidth + 10;
      zones.push(
        xplaneRunwayPointZone(
          runway,
          `runway-reil-${name}-left`,
          runwayOffsetPoint(runway, threshold, -reilOffset)
        ),
        xplaneRunwayPointZone(
          runway,
          `runway-reil-${name}-right`,
          runwayOffsetPoint(runway, threshold, reilOffset)
        )
      );
    }
    if (end.touchdownZoneLights) {
      const inwardEnd = localPointBetween(
        threshold,
        opposite,
        Math.min(900, runway.lengthMeters / 2)
      );
      for (const side of [-1, 1]) {
        zones.push(
          xplaneRunwayLineZone(
            runway,
            `runway-touchdown-${name}-${side < 0 ? 'left' : 'right'}`,
            [
              runwayOffsetPoint(runway, threshold, side * Math.min(10, halfWidth / 2)),
              runwayOffsetPoint(runway, inwardEnd, side * Math.min(10, halfWidth / 2)),
            ],
            { clearanceMeters: 3 }
          )
        );
      }
    }
  }
  return zones;
}

function xplaneRunwayLineZone(runway, lightType, vertices, extra = {}) {
  return xplaneRunwayZone(runway, lightType, 'LineString', { vertices }, extra);
}

function xplaneRunwayPointZone(runway, lightType, point, extra = {}) {
  return xplaneRunwayZone(runway, lightType, 'Point', { point }, extra);
}

function xplaneRunwayZone(runway, lightType, geometryType, geometry, extra) {
  return {
    id: stableId('must-keep', runway.id, lightType),
    sourceFile: runway.sourceFile,
    sourceType: 'xplane-runway-light-zone',
    sourceRecordOffset: runway.sourceRecordOffset,
    runwayId: runway.id,
    runway: `${runway.primaryLabel}/${runway.secondaryLabel}`,
    classification: 'runway',
    lightType,
    geometryType,
    clearanceMeters: extra.clearanceMeters ?? RUNWAY_LIGHT_CLEARANCE_METERS,
    reason: `${lightType} is enabled by the X-Plane apt.dat runway record`,
    sourceBasis: 'xplane-apt-runway-record',
    ...geometry,
    ...extra,
  };
}

function runwayLocalFrame(first, second) {
  const latitudeRadians = (((first.lat + second.lat) / 2) * Math.PI) / 180;
  const north = (second.lat - first.lat) * 111_320;
  const east = (second.lon - first.lon) * 111_320 * Math.cos(latitudeRadians);
  const length = Math.hypot(east, north) || 1;
  return { east: east / length, north: north / length };
}

function runwayOffsetPoint(runway, point, crossMeters) {
  const frame = runwayLocalFrame(runway.first, runway.second);
  return offsetPointMeters(point, frame.north * crossMeters, -frame.east * crossMeters);
}

function localPointBetween(start, end, distanceMeters) {
  const frame = runwayLocalFrame(start, end);
  return offsetPointMeters(start, frame.east * distanceMeters, frame.north * distanceMeters);
}

function localPointBeyond(origin, toward, distanceMeters) {
  const frame = runwayLocalFrame(origin, toward);
  return offsetPointMeters(origin, -frame.east * distanceMeters, -frame.north * distanceMeters);
}

function stationDistances(lengthMeters, spacingMeters) {
  const stations = [];
  for (let distance = 0; distance <= lengthMeters; distance += spacingMeters) {
    stations.push(distance);
  }
  if (lengthMeters - (stations.at(-1) ?? 0) > 0.1) stations.push(lengthMeters);
  return stations;
}

function sampleSegment(start, end) {
  const firstControl = start.outgoingControl ?? start;
  const secondControl = end.incomingControl ?? end;
  if (!start.outgoingControl && !end.incomingControl) {
    return [
      { lat: start.lat, lon: start.lon },
      { lat: end.lat, lon: end.lon },
    ];
  }
  const controlNetLength =
    haversineDistanceMeters(start, firstControl) +
    haversineDistanceMeters(firstControl, secondControl) +
    haversineDistanceMeters(secondControl, end);
  const steps = Math.max(
    2,
    Math.min(MAX_CURVE_SEGMENTS, Math.ceil(controlNetLength / CURVE_SAMPLE_METERS))
  );
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push(cubicBezier(start, firstControl, secondControl, end, t));
  }
  return points;
}

function mirrorControl(point, control) {
  return {
    lat: 2 * point.lat - control.lat,
    lon: 2 * point.lon - control.lon,
  };
}

function cubicBezier(start, firstControl, secondControl, end, t) {
  const inverse = 1 - t;
  return {
    lat:
      inverse ** 3 * start.lat +
      3 * inverse * inverse * t * firstControl.lat +
      3 * inverse * t * t * secondControl.lat +
      t ** 3 * end.lat,
    lon:
      inverse ** 3 * start.lon +
      3 * inverse * inverse * t * firstControl.lon +
      3 * inverse * t * t * secondControl.lon +
      t ** 3 * end.lon,
  };
}

function appendDistinctVertices(target, source) {
  for (const point of source) {
    const previous = target.at(-1);
    if (!previous || previous.lat !== point.lat || previous.lon !== point.lon) target.push(point);
  }
}

async function readAirportBlock(file, icao, onProgress) {
  if (!file?.stream) {
    return airportBlockFromLines(String(await file.text()).split(/\r?\n/), icao);
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const collector = createAirportCollector(icao);
  let pending = '';
  let bytesRead = 0;
  let nextProgress = 0;

  while (true) {
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- Stream backpressure keeps the 380 MB Global Airports apt.dat out of memory.
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    pending += decoder.decode(value, { stream: true });
    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = pending.slice(0, newlineIndex).replace(/\r$/, '');
      pending = pending.slice(newlineIndex + 1);
      const result = collector.push(line);
      if (result) {
        await reader.cancel();
        return result;
      }
      newlineIndex = pending.indexOf('\n');
    }
    const fraction = file.size > 0 ? bytesRead / file.size : 0;
    if (fraction >= nextProgress) {
      onProgress?.(Math.min(1, fraction));
      nextProgress += 0.02;
    }
  }
  pending += decoder.decode();
  if (pending) collector.push(pending.replace(/\r$/, ''));
  onProgress?.(1);
  return collector.finish();
}

function airportBlockFromLines(lines, icao) {
  const collector = createAirportCollector(icao);
  for (const line of lines) {
    const result = collector.push(line);
    if (result) return result;
  }
  return collector.finish();
}

function createAirportCollector(icao) {
  let collecting = false;
  let block = [];
  let probe = [];
  let probeOpen = false;

  return {
    push(line) {
      const fields = splitFields(line);
      const code = Number(fields[0]);
      if (AIRPORT_HEADER_CODES.has(code)) {
        if (collecting) return block;
        collecting = String(fields[4] ?? '').toUpperCase() === icao;
        block = collecting ? [line] : [];
        probe = collecting ? [] : [line];
        probeOpen = !collecting;
        return null;
      }
      if (collecting) {
        block.push(line);
        return null;
      }
      if (!probeOpen) return null;
      if (code === 1302) {
        probe.push(line);
        if (fields[1] === 'icao_code' && String(fields[2] ?? '').toUpperCase() === icao) {
          collecting = true;
          block = probe;
          probe = [];
          probeOpen = false;
        }
      } else if (fields.length > 0) {
        probe = [];
        probeOpen = false;
      }
      return null;
    },
    finish() {
      return collecting ? block : null;
    },
  };
}

function aptFilePriority(value) {
  const path = normalizePath(value);
  if (BARS_REMOVAL_PACKAGE_PATTERN.test(path)) return 100;
  if (/global scenery\/global airports/i.test(path)) return 50;
  return 0;
}

function normalizeIcao(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(normalized)) {
    throw new Error('A valid four-character airport identifier is required.');
  }
  return normalized;
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function splitFields(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed || trimmed.startsWith('#')) return [];
  return trimmed.split(/\s+/);
}

function validCoordinate(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
