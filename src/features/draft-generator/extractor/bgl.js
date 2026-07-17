import { Buffer } from "node:buffer";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { classifyObject, isTargetLightClassification, stableId } from "./classify.js";
import { haversineDistanceMeters, pointToPolylineDistanceMeters } from "./geo.js";
import { inferBglPlacementLightRows } from "./placement-rows.js";

const SECTION_SCENERY_OBJECTS = 0x25;
const RECORD_SCENERY_OBJECT_LIBRARY_OBJECT = 0x0b;
const HEADER_SIZE = 0x38;
const SECTION_POINTER_SIZE = 0x14;
const SUBSECTION_POINTER_SIZE = 0x10;
const MODEL_INFO_NEEDLE = Buffer.from("<ModelInfo", "ascii");
const TAG_END = Buffer.from(">", "ascii");
const MAX_BUFFERED_BGL_BYTES = 512 * 1024 * 1024;
const MAX_RETAINED_BGL_BYTES = 256 * 1024 * 1024;
const MODEL_INFO_STREAM_TAIL_BYTES = 4096;
const RECORD_AIRPORT_LIGHT_ROW = 0x31;
const RECORD_AIRPORT_RUNWAY = 0x00ce;
const RECORD_TAXIWAY_POINT_TABLE = 0x1a;
const RECORD_TAXI_NAME_TABLE = 0x1d;
const RECORD_TAXIWAY_PATH_TABLE = 0xd4;
const RECORD_TAXIWAY_PARKING_TABLE = 0xe7;
const AIRPORT_LIGHT_ROW_HEADER_SIZE = 0x18;
const AIRPORT_LIGHT_ROW_MIN_RECORD_SIZE = AIRPORT_LIGHT_ROW_HEADER_SIZE + 2 * 8;
const AIRPORT_LIGHT_ROW_MAX_RECORD_SIZE = 64 * 1024;
const AIRPORT_LIGHT_ROW_MAX_PRECEDING_NAME_BYTES = 128;
const AIRPORT_LIGHT_ROW_VERSION_MARKERS = new Set([
  0x01000000,
  0x05000000,
  0x09000000,
  0x0d000000
]);
const TAXIWAY_POINT_RECORD_SIZE = 12;
const TAXIWAY_POINT_TYPE_MASK = 0xff;
const TAXIWAY_POINT_ORIENTATION_MASK = 0x100;
const TAXIWAY_POINT_HOLD_SHORT_TYPES = new Set([0x02, 0x05]);
const HOLD_SHORT_REAL_LIGHT_DEDUPLICATION_METERS = 20;
const HOLD_SHORT_MINIMUM_HALF_WIDTH_METERS = 4;
const HOLD_SHORT_MAXIMUM_HALF_WIDTH_METERS = 30;
const TAXI_NAME_RECORD_SIZE = 8;
const TAXIWAY_PARKING_RECORD_SIZE = 56;
const TAXIWAY_PATH_RECORD_SIZE = 0x30;
const TAXIWAY_PATH_TYPE_MASK = 0x0f;
const TAXIWAY_PATH_TYPE_TAXI = 0x01;
const TAXIWAY_PATH_TYPE_PATH = 0x04;
const TAXIWAY_PATH_BRIDGE_TYPES = new Set([
  TAXIWAY_PATH_TYPE_TAXI,
  TAXIWAY_PATH_TYPE_PATH
]);
const TAXIWAY_PATH_CENTERLINE_FLAG = 0x01;
const TAXIWAY_PATH_LIGHTED_CENTERLINE_FLAG = 0x02;
const TAXIWAY_PATH_LEFT_EDGE_TYPE_MASK = 0x0c;
const TAXIWAY_PATH_LEFT_EDGE_LIGHTED_FLAG = 0x10;
const TAXIWAY_PATH_RIGHT_EDGE_TYPE_MASK = 0x60;
const TAXIWAY_PATH_RIGHT_EDGE_LIGHTED_FLAG = 0x80;
const RUNWAY_FIXED_RECORD_SIZE = 0x60;
const RUNWAY_MAX_RECORD_SIZE = 256 * 1024;
const RUNWAY_APPROACH_PRIMARY = 0x00df;
const RUNWAY_APPROACH_SECONDARY = 0x00e0;
const RUNWAY_OFFSET_THRESHOLD_PRIMARY = 0x0005;
const RUNWAY_OFFSET_THRESHOLD_SECONDARY = 0x0006;
const RUNWAY_VASI_TYPES = new Set([0x000b, 0x000c, 0x000d, 0x000e]);
const RUNWAY_CHILD_TYPES = new Set([
  RUNWAY_OFFSET_THRESHOLD_PRIMARY,
  RUNWAY_OFFSET_THRESHOLD_SECONDARY,
  0x0007,
  0x0008,
  0x0009,
  0x000a,
  0x000b,
  0x000c,
  0x000d,
  0x000e,
  0x003e,
  0x0065,
  0x0066,
  0x00cb,
  RUNWAY_APPROACH_PRIMARY,
  RUNWAY_APPROACH_SECONDARY
]);
const RUNWAY_LIGHT_CLEARANCE_METERS = 0.15;
const RUNWAY_CENTERLINE_END_INSET_METERS = 22.86;
const RUNWAY_CENTERLINE_SPACING_METERS = 15.24;
const RUNWAY_TOUCHDOWN_FIRST_STATION_METERS = 30.48;
const RUNWAY_TOUCHDOWN_MAX_LENGTH_METERS = 914.4;
const RUNWAY_TOUCHDOWN_BAR_SPACING_METERS = 30.48;
const RUNWAY_TOUCHDOWN_BAR_LIGHT_SPACING_METERS = 1.5;
const RUNWAY_EDGE_LIGHT_SPACING_METERS = 60;
const RUNWAY_VASI_TYPE_NAMES = new Map([
  [1, "VASI21"],
  [2, "VASI22"],
  [3, "VASI23"],
  [4, "VASI31"],
  [5, "VASI32"],
  [6, "VASI33"],
  [7, "PAPI2"],
  [8, "PAPI4"],
  [9, "TRICOLOR"],
  [10, "PVASI"],
  [11, "TVASI"],
  [12, "BALL"],
  [13, "APAP"],
  [14, "PANELS"]
]);
const RUNWAY_VASI_SPACED_ROW_COUNTS = new Map([
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 3],
  [5, 3],
  [6, 3],
  [11, 2]
]);
const RUNWAY_VASI_KNOWN_LIGHT_COUNTS = new Map([
  [1, 2],
  [2, 4],
  [3, 6],
  [4, 3],
  [5, 6],
  [6, 8],
  [7, 2],
  [8, 4],
  [9, 1],
  [10, 1]
]);
const DEFAULT_TAXIWAY_CENTERLINE_SPACING_METERS = 15;
const MIN_TAXIWAY_PATH_LENGTH_METERS = 0.75;
const MAX_TAXIWAY_PATH_LENGTH_METERS = 2000;
const MAX_TAXIWAY_PATH_BRIDGE_LENGTH_METERS = 600;
const TAXIWAY_PATH_BRIDGE_ENDPOINT_TOLERANCE_METERS = 3;
const TAXIWAY_PATH_BRIDGE_MAX_ENDPOINT_EXTENSION_METERS = 15;
const TAXIWAY_PATH_BRIDGE_MAX_ALIGNMENT_DEGREES = 20;
const TAXIWAY_PATH_BRIDGE_UNCOVERED_MIDPOINT_METERS = 8;

export async function extractBglData(bglFiles) {
  const warnings = [];
  const instances = [];
  const lightRows = [];
  const decodedHoldShortRows = [];
  const runways = [];
  const runwayLightZones = [];
  const modelIndex = new Map();
  const buffers = [];
  const fileStats = [];
  const unsupportedSceneryRecordTypes = new Map();
  let retainedBglBytes = 0;
  let bglFilesParsed = 0;
  const taxiwayGraphStats = {
    graphs: 0,
    points: 0,
    parkings: 0,
    paths: 0,
    names: 0,
    lightedTaxiPaths: 0,
    bridgedTaxiPaths: 0,
    decodedHoldShortPoints: 0,
    eligibleHoldShortPoints: 0,
    suppressedHoldShortPoints: 0,
    inferredPlacementRows: 0,
    inferredPlacementAssignments: 0,
    excludedPlacementOutliers: 0,
    placementInferenceMilliseconds: 0
  };

  for (const sourceFile of bglFiles ?? []) {
    try {
      const stats = await fs.stat(sourceFile);
      let buffer;
      let modelInfos;
      if (stats.size > MAX_BUFFERED_BGL_BYTES) {
        modelInfos = await extractModelInfosFromFile(sourceFile);
      } else {
        buffer = await fs.readFile(sourceFile);
        modelInfos = extractModelInfos(buffer, sourceFile);
      }
      for (const modelInfo of modelInfos) {
        modelIndex.set(normalizeGuid(modelInfo.guid), modelInfo);
      }

      if (buffer && retainedBglBytes + buffer.length <= MAX_RETAINED_BGL_BYTES) {
        buffers.push({ sourceFile, buffer });
        retainedBglBytes += buffer.length;
      } else if (buffer) {
        buffers.push({ sourceFile });
      } else {
        warnings.push(`${sourceFile}: indexed ${modelInfos.length} model-library entries from large BGL; skipped placement parsing`);
      }
    } catch (error) {
      warnings.push(`${sourceFile}: failed to read BGL file: ${error.message}`);
    }
  }

  for (let bufferIndex = 0; bufferIndex < buffers.length; bufferIndex += 1) {
    const pending = buffers[bufferIndex];
    const sourceFile = pending.sourceFile;
    let buffer;
    try {
      buffer = pending.buffer ?? await fs.readFile(sourceFile);
    } catch (error) {
      buffers[bufferIndex] = undefined;
      warnings.push(`${sourceFile}: failed to reopen BGL file for placement parsing: ${error.message}`);
      continue;
    }
    buffers[bufferIndex] = undefined;
    if (pending.buffer) retainedBglBytes -= pending.buffer.length;
    const result = extractBglPlacements(buffer, sourceFile, modelIndex);
    if (result.parsed) {
      bglFilesParsed += 1;
    }
    instances.push(...result.instances);
    const airportLightRows = extractAirportLightRows(buffer, sourceFile);
    const runwayResult = extractRunwayLightZones(buffer, sourceFile);
    const taxiwayGraph = extractTaxiwayGraph(buffer, sourceFile);
    const taxiwayBridgeRows = buildTaxiwayPathBridgeRows(
      sourceFile,
      taxiwayGraph.graphs,
      airportLightRows
    );
    lightRows.push(...airportLightRows);
    lightRows.push(...taxiwayGraph.lightRows);
    decodedHoldShortRows.push(...taxiwayGraph.holdShortRows);
    lightRows.push(...taxiwayBridgeRows);
    runways.push(...runwayResult.runways);
    runwayLightZones.push(...runwayResult.zones);
    fileStats.push({
      sourceFile,
      parsed: result.parsed,
      instances: result.instances.length,
      airportLightRows: airportLightRows.length,
      runways: runwayResult.runways.length,
      runwayLightZones: runwayResult.zones.length,
      taxiwayGraphs: taxiwayGraph.graphs.length,
      taxiwayPoints: taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.points.length, 0),
      taxiwayParkings: taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.parkings.length, 0),
      taxiwayPaths: taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.paths.length, 0),
      taxiwayNames: taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.taxiNames.length, 0),
      lightedTaxiwayPaths: taxiwayGraph.lightRows.length,
      bridgedTaxiwayPaths: taxiwayBridgeRows.length,
      decodedHoldShortPoints: taxiwayGraph.holdShortRows.length,
      sectionTypes: result.sectionTypes,
      unsupportedSceneryRecordTypes: result.unsupportedSceneryRecordTypes
    });
    for (const [recordType, count] of Object.entries(result.unsupportedSceneryRecordTypes ?? {})) {
      unsupportedSceneryRecordTypes.set(
        recordType,
        (unsupportedSceneryRecordTypes.get(recordType) ?? 0) + count
      );
    }
    taxiwayGraphStats.graphs += taxiwayGraph.graphs.length;
    taxiwayGraphStats.points += taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.points.length, 0);
    taxiwayGraphStats.parkings += taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.parkings.length, 0);
    taxiwayGraphStats.paths += taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.paths.length, 0);
    taxiwayGraphStats.names += taxiwayGraph.graphs.reduce((sum, graph) => sum + graph.taxiNames.length, 0);
    taxiwayGraphStats.lightedTaxiPaths += taxiwayGraph.lightRows.length;
    taxiwayGraphStats.bridgedTaxiPaths += taxiwayBridgeRows.length;
    taxiwayGraphStats.decodedHoldShortPoints += taxiwayGraph.holdShortRows.length;
    warnings.push(...result.warnings);
  }

  const placementInference = inferBglPlacementLightRows(instances);
  lightRows.push(...placementInference.rows);
  const topologyRows = filterHoldShortTopologyRows(
    decodedHoldShortRows,
    lightRows,
    instances
  );
  taxiwayGraphStats.eligibleHoldShortPoints = topologyRows.length;
  taxiwayGraphStats.suppressedHoldShortPoints =
    decodedHoldShortRows.length - topologyRows.length;
  taxiwayGraphStats.inferredPlacementRows = placementInference.rows.length;
  taxiwayGraphStats.inferredPlacementAssignments = placementInference.stats.assignedPlacements;
  taxiwayGraphStats.excludedPlacementOutliers = placementInference.stats.excludedOutliers;
  taxiwayGraphStats.placementInferenceMilliseconds = placementInference.stats.elapsedMilliseconds;
  taxiwayGraphStats.placementInference = placementInference.stats;
  for (const fileStat of fileStats) {
    const fileRows = placementInference.rows.filter((row) => row.sourceFile === fileStat.sourceFile);
    fileStat.inferredPlacementRows = fileRows.length;
    fileStat.inferredPlacementAssignments = fileRows.reduce(
      (sum, row) => sum + (row.sourceInstanceIds?.length ?? 0),
      0
    );
  }

  return {
    instances,
    lightRows,
    topologyRows,
    runways,
    runwayLightZones,
    warnings,
    bglFilesParsed,
    modelLibraryEntries: modelIndex.size,
    taxiwayGraphStats,
    fileStats,
    unsupportedSceneryRecordTypes: Object.fromEntries(unsupportedSceneryRecordTypes)
  };
}

export function extractAirportLightRows(buffer, sourceFile) {
  return extractNamedAirportLightRows(buffer, sourceFile);
}

function extractNamedAirportLightRows(buffer, sourceFile) {
  const rows = [];
  const seenOffsets = new Set();
  let offset = 0;

  while ((offset = buffer.indexOf(RECORD_AIRPORT_LIGHT_ROW, offset)) !== -1) {
    if (offset + AIRPORT_LIGHT_ROW_MIN_RECORD_SIZE > buffer.length) {
      break;
    }
    const row = parseNamedAirportLightRowHeaderAt(buffer, sourceFile, offset);
    if (!row || seenOffsets.has(row.sourceRecordOffset)) {
      offset += 1;
      continue;
    }

    seenOffsets.add(row.sourceRecordOffset);
    rows.push(row);
    offset += row.recordSize;
  }

  return rows;
}

function parseNamedAirportLightRowHeaderAt(buffer, sourceFile, headerOffset) {
  if (buffer.readUInt16LE(headerOffset) !== RECORD_AIRPORT_LIGHT_ROW) {
    return null;
  }

  const recordSize = buffer.readUInt16LE(headerOffset + 0x02);
  const versionMarker = buffer.readUInt32LE(headerOffset + 0x04);
  const vertexCount = buffer.readUInt16LE(headerOffset + 0x08);
  const rowSubtype = buffer.readUInt16LE(headerOffset + 0x0a);
  const spacing = buffer.readFloatLE(headerOffset + 0x14);
  const pointOffset = headerOffset + AIRPORT_LIGHT_ROW_HEADER_SIZE;
  const trailingNameOffset = pointOffset + vertexCount * 8;
  const recordEndOffset = headerOffset + recordSize;

  if (
    !AIRPORT_LIGHT_ROW_VERSION_MARKERS.has(versionMarker) ||
    recordSize < AIRPORT_LIGHT_ROW_MIN_RECORD_SIZE ||
    recordSize > AIRPORT_LIGHT_ROW_MAX_RECORD_SIZE ||
    vertexCount < 2 ||
    vertexCount > 500 ||
    headerOffset + recordSize > buffer.length ||
    trailingNameOffset > recordEndOffset
  ) {
    return null;
  }

  const preset =
    trailingNameOffset < recordEndOffset
      ? parseTrailingAsciiName(buffer, trailingNameOffset, recordEndOffset)
      : parsePrecedingAsciiName(buffer, headerOffset);
  if (!preset) {
    return null;
  }

  const vertices = parseAirportLightRowVertices(buffer, pointOffset, vertexCount);
  if (!vertices) {
    return null;
  }

  const classification = classifyAirportLightRowPreset(preset);

  return {
    id: stableId("bgl-airport-light-row", sourceFile, headerOffset, preset, vertexCount),
    sourceFile,
    sourceType: "bgl-airport-light-row",
    sourceRecordOffset: headerOffset,
    recordSize,
    rawTag: "BGL Airport Light Row",
    preset,
    rowSubtype,
    ...(Number.isFinite(spacing) && spacing > 0 && spacing < 100 ? { spacing } : {}),
    snapToVertices: true,
    vertices,
    classification: classification.classification,
    confidence: classification.confidence,
    classificationReasons: [
      `decoded compiled airport light row preset "${preset}"`,
      `decoded ${vertexCount} row vertices`,
      ...classification.reasons
    ]
  };
}

function parseTrailingAsciiName(buffer, start, end) {
  const bytes = buffer.subarray(start, end);
  const zeroIndex = bytes.indexOf(0);
  const nameBytes = zeroIndex === -1 ? bytes : bytes.subarray(0, zeroIndex);
  if (nameBytes.length < 2) {
    return undefined;
  }

  for (const byte of nameBytes) {
    if (byte < 0x20 || byte > 0x7e) {
      return undefined;
    }
  }

  const name = nameBytes.toString("ascii").trim();
  return name.length >= 2 ? name : undefined;
}

function parseAirportLightRowVertices(buffer, pointOffset, vertexCount) {
  const vertices = [];

  for (let index = 0; index < vertexCount; index += 1) {
    const pointRecordOffset = pointOffset + index * 8;
    const lon = decodeBglLongitude(buffer.readUInt32LE(pointRecordOffset));
    const lat = decodeBglLatitude(buffer.readUInt32LE(pointRecordOffset + 4));
    if (!isPlausibleCoordinate(lat, lon)) {
      return undefined;
    }
    vertices.push({ lat, lon });
  }

  return vertices;
}

function parsePrecedingAsciiName(buffer, headerOffset) {
  if (headerOffset < 2 || buffer[headerOffset - 1] !== 0) {
    return undefined;
  }

  const minimumStart = Math.max(0, headerOffset - AIRPORT_LIGHT_ROW_MAX_PRECEDING_NAME_BYTES - 1);
  let start = headerOffset - 2;
  while (start >= minimumStart && buffer[start] >= 0x20 && buffer[start] <= 0x7e) {
    start -= 1;
  }

  const nameBytes = buffer.subarray(start + 1, headerOffset - 1);
  if (nameBytes.length < 2) {
    return undefined;
  }

  const name = nameBytes.toString("ascii").trim();
  return name.length >= 2 ? name : undefined;
}

function classifyAirportLightRowPreset(preset) {
  const normalizedPreset = preset
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const compactPreset = normalizedPreset.replaceAll("_", "");
  if (
    normalizedPreset.includes("stopbar") ||
    normalizedPreset.includes("stop_bar") ||
    normalizedPreset.includes("hold_short") ||
    normalizedPreset.includes("holdshort")
  ) {
    return {
      classification: "stopbar",
      confidence: 0.84,
      reasons: ["preset name indicates a stopbar row"]
    };
  }

  if (
    normalizedPreset.includes("lead_on") ||
    normalizedPreset.includes("leadon") ||
    compactPreset.includes("taxionin") ||
    normalizedPreset.includes("ils_zone") ||
    normalizedPreset.includes("exit") ||
    normalizedPreset === "orangeblank"
  ) {
    return {
      classification: "lead-on",
      confidence: 0.82,
      reasons: ["preset name indicates a lead-on row"]
    };
  }

  if (
    normalizedPreset.includes("taxi_center") ||
    normalizedPreset.includes("taxi_centre") ||
    compactPreset.includes("taxicenter") ||
    compactPreset.includes("taxicentre") ||
    normalizedPreset.includes("taxiway_center") ||
    normalizedPreset.includes("taxiway_centre") ||
    normalizedPreset.includes("green_centre") ||
    normalizedPreset.includes("green_center") ||
    normalizedPreset === "center_lights" ||
    normalizedPreset === "center_lights_rev" ||
    normalizedPreset === "taxi_yellow" ||
    normalizedPreset === "greenblank"
  ) {
    return {
      classification: "taxi-centerline",
      confidence: 0.82,
      reasons: ["preset name indicates a taxiway centerline row"]
    };
  }

  const classification = classifyObject({
    sourceType: "lightrow",
    rawTag: "BGL Airport Light Row",
    name: preset
  });
  return {
    classification: classification.classification,
    confidence: classification.confidence,
    reasons: classification.reasons
  };
}

export function extractRunwayLightZones(buffer, sourceFile) {
  const runways = [];
  const zones = [];
  const seenOffsets = new Set();
  let offset = 0;

  while ((offset = buffer.indexOf(RECORD_AIRPORT_RUNWAY & 0xff, offset)) !== -1) {
    if (offset + RUNWAY_FIXED_RECORD_SIZE > buffer.length) {
      break;
    }
    if (buffer[offset + 1] !== (RECORD_AIRPORT_RUNWAY >> 8)) {
      offset += 1;
      continue;
    }

    const runway = parseRunwayRecordAt(buffer, sourceFile, offset);
    if (!runway || seenOffsets.has(runway.sourceRecordOffset)) {
      offset += 1;
      continue;
    }

    seenOffsets.add(runway.sourceRecordOffset);
    runways.push(runway);
    zones.push(...buildRunwayLightZones(runway));
    offset += runway.recordSize;
  }

  return { runways, zones };
}

function parseRunwayRecordAt(buffer, sourceFile, offset) {
  const recordSize = buffer.readUInt32LE(offset + 0x02);
  if (
    recordSize < RUNWAY_FIXED_RECORD_SIZE ||
    recordSize > RUNWAY_MAX_RECORD_SIZE ||
    offset + recordSize > buffer.length
  ) {
    return undefined;
  }

  const primaryNumber = buffer.readUInt8(offset + 0x08);
  const primaryDesignator = buffer.readUInt8(offset + 0x09);
  const secondaryNumber = buffer.readUInt8(offset + 0x0a);
  const secondaryDesignator = buffer.readUInt8(offset + 0x0b);
  const lon = decodeBglLongitude(buffer.readUInt32LE(offset + 0x14));
  const lat = decodeBglLatitude(buffer.readUInt32LE(offset + 0x18));
  const lengthMeters = buffer.readFloatLE(offset + 0x20);
  const widthMeters = buffer.readFloatLE(offset + 0x24);
  const heading = buffer.readFloatLE(offset + 0x28);
  const lightFlags = buffer.readUInt8(offset + 0x32);

  if (
    !isPlausibleCoordinate(lat, lon) ||
    !isPlausibleRunwayNumberPair(primaryNumber, secondaryNumber) ||
    primaryDesignator > 6 ||
    secondaryDesignator > 6 ||
    !Number.isFinite(lengthMeters) ||
    lengthMeters < 30 ||
    lengthMeters > 10000 ||
    !Number.isFinite(widthMeters) ||
    widthMeters < 3 ||
    widthMeters > 500 ||
    !Number.isFinite(heading) ||
    heading < 0 ||
    heading > 360
  ) {
    return undefined;
  }

  const children = parseRunwayChildren(buffer, offset, recordSize);
  if (!children) {
    return undefined;
  }

  const primaryOffsetThresholdMeters =
    children.find((child) => child.type === RUNWAY_OFFSET_THRESHOLD_PRIMARY)?.lengthMeters ?? 0;
  const secondaryOffsetThresholdMeters =
    children.find((child) => child.type === RUNWAY_OFFSET_THRESHOLD_SECONDARY)?.lengthMeters ?? 0;
  const primaryApproach = children.find((child) => child.type === RUNWAY_APPROACH_PRIMARY);
  const secondaryApproach = children.find((child) => child.type === RUNWAY_APPROACH_SECONDARY);

  return {
    id: stableId("bgl-runway", sourceFile, offset, primaryNumber, primaryDesignator),
    sourceFile,
    sourceType: "bgl-runway",
    sourceRecordOffset: offset,
    recordSize,
    lat,
    lon,
    lengthMeters,
    widthMeters,
    heading,
    primaryNumber,
    primaryDesignator,
    secondaryNumber,
    secondaryDesignator,
    primaryLabel: runwayLabel(primaryNumber, primaryDesignator),
    secondaryLabel: runwayLabel(secondaryNumber, secondaryDesignator),
    edgeLightLevel: lightFlags & 0x03,
    centerLightLevel: (lightFlags >> 2) & 0x03,
    centerRed: (lightFlags & 0x10) !== 0,
    primaryOffsetThresholdMeters,
    secondaryOffsetThresholdMeters,
    ...(primaryApproach ? { primaryApproach } : {}),
    ...(secondaryApproach ? { secondaryApproach } : {}),
    vasi: children.filter((child) => RUNWAY_VASI_TYPES.has(child.type)),
    children
  };
}

function parseRunwayChildren(buffer, runwayOffset, recordSize) {
  const children = [];
  const recordEnd = runwayOffset + recordSize;
  let offset = runwayOffset + RUNWAY_FIXED_RECORD_SIZE;

  while (offset < recordEnd) {
    if (offset + 6 > recordEnd) {
      return undefined;
    }

    const type = buffer.readUInt16LE(offset);
    const childSize = buffer.readUInt32LE(offset + 0x02);
    if (!RUNWAY_CHILD_TYPES.has(type) || childSize < 6 || offset + childSize > recordEnd) {
      return undefined;
    }

    const child = {
      type,
      sourceRecordOffset: offset,
      recordSize: childSize
    };
    if (type === RUNWAY_APPROACH_PRIMARY || type === RUNWAY_APPROACH_SECONDARY) {
      if (childSize < 0x18) {
        return undefined;
      }
      const flags = buffer.readUInt8(offset + 0x06);
      const strobesRaw = buffer.readUInt8(offset + 0x07);
      Object.assign(child, {
        end: type === RUNWAY_APPROACH_PRIMARY ? "primary" : "secondary",
        system: flags & 0x1f,
        endLights: (flags & 0x20) !== 0,
        reil: (flags & 0x40) !== 0,
        touchdown: (flags & 0x80) !== 0,
        strobes: strobesRaw <= 20 ? strobesRaw : 0,
        ...(strobesRaw <= 20 ? {} : { strobesRaw, invalidStrobesValue: true }),
        spacingMeters: buffer.readFloatLE(offset + 0x08),
        offsetMeters: buffer.readFloatLE(offset + 0x0c),
        slopeDegrees: buffer.readFloatLE(offset + 0x10)
      });
    } else if (
      type === RUNWAY_OFFSET_THRESHOLD_PRIMARY ||
      type === RUNWAY_OFFSET_THRESHOLD_SECONDARY
    ) {
      if (childSize < 0x20) {
        return undefined;
      }
      child.end = type === RUNWAY_OFFSET_THRESHOLD_PRIMARY ? "primary" : "secondary";
      child.lengthMeters = buffer.readFloatLE(offset + 0x18);
      child.widthMeters = buffer.readFloatLE(offset + 0x1c);
    } else if (RUNWAY_VASI_TYPES.has(type)) {
      if (childSize < 0x18) {
        return undefined;
      }
      Object.assign(child, {
        end: type <= 0x000c ? "primary" : "secondary",
        side: type === 0x000b || type === 0x000d ? "left" : "right",
        vasiType: buffer.readUInt16LE(offset + 0x06),
        biasXMeters: buffer.readFloatLE(offset + 0x08),
        biasZMeters: buffer.readFloatLE(offset + 0x0c),
        spacingMeters: buffer.readFloatLE(offset + 0x10),
        pitchDegrees: buffer.readFloatLE(offset + 0x14)
      });
      child.vasiTypeName = RUNWAY_VASI_TYPE_NAMES.get(child.vasiType) ?? "UNKNOWN";
      child.spacingApplicable = RUNWAY_VASI_SPACED_ROW_COUNTS.has(child.vasiType);
    }

    children.push(child);
    offset += childSize;
  }

  return offset === recordEnd ? children : undefined;
}

function buildRunwayLightZones(runway) {
  const zones = [];
  const halfLength = runway.lengthMeters / 2;
  const halfWidth = runway.widthMeters / 2;
  const primaryThresholdAlong = -halfLength + runway.primaryOffsetThresholdMeters;
  const secondaryThresholdAlong = halfLength - runway.secondaryOffsetThresholdMeters;
  const primaryThreshold = runwayPoint(runway, primaryThresholdAlong, 0);
  const secondaryThreshold = runwayPoint(runway, secondaryThresholdAlong, 0);

  if (runway.centerLightLevel > 0) {
    const inset = Math.min(
      RUNWAY_CENTERLINE_END_INSET_METERS,
      Math.max(0, runway.lengthMeters / 2 - 1)
    );
    const startAlong = -halfLength + inset;
    const endAlong = halfLength - inset;
    for (const along of runwayStationDistances(startAlong, endAlong, RUNWAY_CENTERLINE_SPACING_METERS)) {
      zones.push(runwayPointZone(runway, `runway-centerline-${Math.round((along + halfLength) * 100)}`,
        runwayPoint(runway, along, 0), {
          lightLevel: runway.centerLightLevel,
          centerRed: runway.centerRed,
          nominalSpacingMeters: RUNWAY_CENTERLINE_SPACING_METERS,
          geometryMode: "source-runway-procedural-grid"
        }));
    }
    zones.push(runwayLineZone(runway, "runway-centerline-continuous-envelope", [
      runwayPoint(runway, startAlong, 0),
      runwayPoint(runway, endAlong, 0)
    ], {
      lightLevel: runway.centerLightLevel,
      centerRed: runway.centerRed,
      geometryMode: "continuous-procedural-envelope",
      clearanceMeters: 0.1
    }));
  }

  if (runway.edgeLightLevel > 0) {
    for (const side of [-1, 1]) {
      for (const along of runwayStationDistances(-halfLength, halfLength, RUNWAY_EDGE_LIGHT_SPACING_METERS)) {
        zones.push(runwayPointZone(
          runway,
          `runway-edge-${side < 0 ? "left" : "right"}-${Math.round((along + halfLength) * 100)}`,
          runwayPoint(runway, along, side * halfWidth),
          {
            lightLevel: runway.edgeLightLevel,
            nominalSpacingMeters: RUNWAY_EDGE_LIGHT_SPACING_METERS,
            geometryMode: "source-runway-procedural-grid"
          }
        ));
      }
    }
  }

  for (const end of ["primary", "secondary"]) {
    const approach = end === "primary" ? runway.primaryApproach : runway.secondaryApproach;
    if (!approach) {
      continue;
    }
    const thresholdAlong = end === "primary" ? primaryThresholdAlong : secondaryThresholdAlong;
    const direction = end === "primary" ? 1 : -1;
    const threshold = end === "primary" ? primaryThreshold : secondaryThreshold;

    if (approach.endLights) {
      zones.push(runwayLineZone(runway, `runway-threshold-${end}`, [
        runwayPoint(runway, thresholdAlong, -halfWidth),
        runwayPoint(runway, thresholdAlong, halfWidth)
      ], {
        runwayEnd: end,
        geometryMode: "continuous-procedural-envelope"
      }));
    }

    if (approach.reil) {
      const reilOffset = halfWidth + 10;
      for (const side of [-1, 1]) {
        zones.push(runwayPointZone(runway, `runway-reil-${end}-${side < 0 ? "left" : "right"}`,
          runwayPoint(runway, thresholdAlong, side * reilOffset), {
            runwayEnd: end,
            geometryMode: "source-positioned-procedural-point"
          }));
      }
    }

    if (approach.touchdown) {
      zones.push(...buildTouchdownZones(runway, end, thresholdAlong, direction));
    }

    if (approach.system > 0 || approach.strobes > 0) {
      const approachLength = Math.max(
        300,
        Math.min(1000, Math.max(approach.spacingMeters || 0, 30) * Math.max(approach.strobes, 10))
      );
      const approachOffset = Number.isFinite(approach.offsetMeters) ? approach.offsetMeters : 0;
      const outsideDirection = -direction;
      const startAlong = thresholdAlong + outsideDirection * approachOffset;
      const endAlong = startAlong + outsideDirection * approachLength;
      const stationSpacing = Math.max(5, approach.spacingMeters || 30);
      for (const along of runwayStationDistances(startAlong, endAlong, stationSpacing)) {
        zones.push(runwayPointZone(runway, `runway-approach-${end}-${Math.round(Math.abs(along - thresholdAlong) * 100)}`,
          runwayPoint(runway, along, 0), {
            runwayEnd: end,
            approachSystem: approach.system,
            strobes: approach.strobes,
            spacingMeters: approach.spacingMeters,
            geometryMode: "source-runway-procedural-grid"
          }));
      }
    }
  }

  for (const vasi of runway.vasi) {
    zones.push(buildVasiZone(runway, vasi));
  }

  if (runway.edgeLightLevel > 0) {
    zones.push(runwayLineZone(runway, "runway-end-primary", [
      runwayPoint(runway, -halfLength, -halfWidth),
      runwayPoint(runway, -halfLength, halfWidth)
    ], { geometryMode: "continuous-procedural-envelope", physicalEnd: true }));
    zones.push(runwayLineZone(runway, "runway-end-secondary", [
      runwayPoint(runway, halfLength, -halfWidth),
      runwayPoint(runway, halfLength, halfWidth)
    ], { geometryMode: "continuous-procedural-envelope", physicalEnd: true }));
  }

  return zones;
}

function buildTouchdownZones(runway, end, thresholdAlong, direction) {
  const zones = [];
  const usableLength = Math.max(
    0,
    Math.min(
      RUNWAY_TOUCHDOWN_MAX_LENGTH_METERS,
      (runway.lengthMeters - runway.primaryOffsetThresholdMeters - runway.secondaryOffsetThresholdMeters) / 2
    )
  );
  const lateralCenter = Math.min(11, runway.widthMeters * 0.44 / 2);

  for (
    let distance = RUNWAY_TOUCHDOWN_FIRST_STATION_METERS;
    distance <= usableLength + 0.01;
    distance += RUNWAY_TOUCHDOWN_BAR_SPACING_METERS
  ) {
    const along = thresholdAlong + direction * distance;
    for (const side of [-1, 1]) {
      const center = side * lateralCenter;
      for (const lightIndex of [-1, 0, 1]) {
        zones.push(runwayPointZone(
          runway,
          `runway-touchdown-${end}-${side < 0 ? "left" : "right"}-${Math.round(distance * 100)}-${lightIndex + 1}`,
          runwayPoint(
            runway,
            along,
            center + lightIndex * RUNWAY_TOUCHDOWN_BAR_LIGHT_SPACING_METERS
          ),
          {
            runwayEnd: end,
            distanceFromThresholdMeters: distance,
            barLightIndex: lightIndex + 1,
            lightCount: 3,
            nominalLightSpacingMeters: RUNWAY_TOUCHDOWN_BAR_LIGHT_SPACING_METERS,
            geometryMode: "source-runway-procedural-grid"
          }
        ));
      }
    }
  }

  return zones;
}

function buildVasiZone(runway, vasi) {
  const halfLength = runway.lengthMeters / 2;
  const along =
    vasi.end === "primary"
      ? -halfLength + vasi.biasZMeters
      : halfLength - vasi.biasZMeters;
  const sideSign =
    vasi.end === "primary"
      ? (vasi.side === "right" ? 1 : -1)
      : (vasi.side === "right" ? -1 : 1);
  const cross = sideSign * Math.abs(vasi.biasXMeters);
  const extra = {
    runwayEnd: vasi.end,
    side: vasi.side,
    vasiType: vasi.vasiType,
    vasiTypeName: vasi.vasiTypeName,
    biasXMeters: vasi.biasXMeters,
    biasZMeters: vasi.biasZMeters,
    spacingMeters: vasi.spacingMeters,
    spacingApplicable: vasi.spacingApplicable,
    ...(RUNWAY_VASI_KNOWN_LIGHT_COUNTS.has(vasi.vasiType)
      ? { lightCount: RUNWAY_VASI_KNOWN_LIGHT_COUNTS.get(vasi.vasiType) }
      : {})
  };
  const rowCount = RUNWAY_VASI_SPACED_ROW_COUNTS.get(vasi.vasiType);
  if (
    rowCount &&
    Number.isFinite(vasi.spacingMeters) &&
    vasi.spacingMeters > 0
  ) {
    const halfAlong = vasi.spacingMeters * (rowCount - 1) / 2;
    return runwayLineZone(runway, `runway-vasi-${vasi.end}-${vasi.side}`, [
      runwayPoint(runway, along - halfAlong, cross),
      runwayPoint(runway, along + halfAlong, cross)
    ], {
      ...extra,
      rowCount,
      geometryMode: "source-positioned-procedural-row-centers"
    });
  }
  return runwayPointZone(
    runway,
    `runway-vasi-${vasi.end}-${vasi.side}`,
    runwayPoint(runway, along, cross),
    {
      ...extra,
      geometryMode: "source-positioned-procedural-reference"
    }
  );
}

function runwayLineZone(runway, lightType, vertices, extra = {}) {
  return runwayZone(runway, lightType, "LineString", { vertices }, extra);
}

function runwayPointZone(runway, lightType, point, extra = {}) {
  return runwayZone(runway, lightType, "Point", { point }, extra);
}

function runwayPolygonZone(runway, lightType, vertices, extra = {}) {
  return runwayZone(runway, lightType, "Polygon", { vertices }, extra);
}

function runwayZone(runway, lightType, geometryType, geometry, extra) {
  return {
    id: stableId("must-keep", runway.id, lightType),
    sourceFile: runway.sourceFile,
    sourceType: "bgl-runway-light-zone",
    sourceRecordOffset: runway.sourceRecordOffset,
    runwayId: runway.id,
    runway: `${runway.primaryLabel}/${runway.secondaryLabel}`,
    classification: "runway",
    lightType,
    geometryType,
    clearanceMeters: extra.clearanceMeters ?? RUNWAY_LIGHT_CLEARANCE_METERS,
    reason: `${lightType} is enabled by the compiled BGL Runway record`,
    sourceBasis: "bgl-runway-record",
    ...geometry,
    ...extra
  };
}

function runwayPoint(runway, alongMeters, crossMeters) {
  const headingRadians = (runway.heading * Math.PI) / 180;
  const eastMeters =
    Math.sin(headingRadians) * alongMeters + Math.cos(headingRadians) * crossMeters;
  const northMeters =
    Math.cos(headingRadians) * alongMeters - Math.sin(headingRadians) * crossMeters;
  const metersPerDegreeLon =
    111320 * Math.max(Math.cos((runway.lat * Math.PI) / 180), 0.000001);
  return {
    lat: runway.lat + northMeters / 111320,
    lon: runway.lon + eastMeters / metersPerDegreeLon
  };
}

function runwayStationDistances(start, end, spacingMeters) {
  const direction = end >= start ? 1 : -1;
  const length = Math.abs(end - start);
  if (length <= 0 || !Number.isFinite(spacingMeters) || spacingMeters <= 0) {
    return [start];
  }
  const stations = [];
  for (let distance = 0; distance <= length + 0.01; distance += spacingMeters) {
    stations.push(start + direction * Math.min(distance, length));
  }
  if (Math.abs(stations.at(-1) - end) > 0.01) {
    stations.push(end);
  }
  return stations;
}

function isPlausibleRunwayNumberPair(primary, secondary) {
  if (primary < 1 || primary > 44 || secondary < 1 || secondary > 44) {
    return false;
  }
  if (primary <= 36 && secondary <= 36) {
    const reciprocal = ((primary + 17) % 36) + 1;
    return Math.abs(reciprocal - secondary) <= 1;
  }
  return true;
}

function runwayLabel(number, designator) {
  const designators = ["", "L", "R", "C", "W", "A", "B"];
  const numberLabel = number <= 36 ? String(number).padStart(2, "0") : String(number);
  return `${numberLabel}${designators[designator] ?? ""}`;
}

function isPlausibleCoordinate(lat, lon) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function extractTaxiwayGraph(buffer, sourceFile) {
  const graphs = [];
  const pointTables = findTaxiwayPointTables(buffer);

  for (const pointTable of pointTables) {
    const nextPointTableOffset =
      pointTables.find((candidate) => candidate.offset > pointTable.offset)?.offset ?? buffer.length;
    const parkings = findTaxiwayParkingTables(buffer, pointTable.end, nextPointTableOffset);
    const pathTable = findTaxiwayPathTable(buffer, pointTable.points.length, pointTable.end, nextPointTableOffset);
    if (!pathTable) {
      continue;
    }

    const taxiNames = findTaxiNameTable(
      buffer,
      pathTable.end,
      nextPointTableOffset
    );
    const paths = parseTaxiwayPathTable(buffer, pathTable, pointTable.points, taxiNames);
    graphs.push({
      sourceFile,
      pointTableOffset: pointTable.offset,
      points: pointTable.points,
      parkings,
      taxiNames,
      pathTableOffset: pathTable.offset,
      pathRunOffset: pathTable.entryOffset,
      paths
    });
  }

  const lightRows = graphs.flatMap((graph) =>
    graph.paths.flatMap((pathRecord) => [
      ...(shouldReconstructTaxiwayPath(pathRecord)
        ? [buildTaxiwayPathLightRow(sourceFile, graph, pathRecord)]
        : []),
      ...buildTaxiwayPathEdgeLightRows(sourceFile, graph, pathRecord)
    ])
  );
  const holdShortRows = graphs.flatMap((graph) =>
    buildHoldShortTopologyRows(sourceFile, graph)
  );

  return { graphs, lightRows, holdShortRows };
}

export function extractTaxiwayLightRows(buffer, sourceFile) {
  return extractTaxiwayGraph(buffer, sourceFile).lightRows;
}

export function buildHoldShortTopologyRows(sourceFile, graph) {
  const rows = [];
  for (const point of graph.points ?? []) {
    const pointType = point.flags & TAXIWAY_POINT_TYPE_MASK;
    if (!TAXIWAY_POINT_HOLD_SHORT_TYPES.has(pointType)) continue;

    const connectedPaths = (graph.paths ?? []).filter(
      (pathRecord) =>
        pathRecord.startIndex === point.index || pathRecord.endIndex === point.index
    );
    const pathVectors = connectedPaths
      .map((pathRecord) => {
        const neighbor =
          pathRecord.startIndex === point.index ? pathRecord.end : pathRecord.start;
        const vector = localMeterVector(point, neighbor);
        const length = Math.hypot(vector.x, vector.y);
        return length >= MIN_TAXIWAY_PATH_LENGTH_METERS
          ? { ...vector, length, pathRecord }
          : null;
      })
      .filter(Boolean);
    if (pathVectors.length === 0) continue;

    const tangent = averagedUndirectedTangent(pathVectors);
    if (!tangent) continue;
    const widths = pathVectors
      .map(({ pathRecord }) => pathRecord.widthMeters)
      .filter((width) => Number.isFinite(width) && width > 0 && width <= 250)
      .sort((left, right) => left - right);
    const widthMeters = widths[Math.floor(widths.length / 2)] ?? 16;
    const halfWidthMeters = Math.max(
      HOLD_SHORT_MINIMUM_HALF_WIDTH_METERS,
      Math.min(HOLD_SHORT_MAXIMUM_HALF_WIDTH_METERS, widthMeters / 2)
    );
    const perpendicular = { x: -tangent.y, y: tangent.x };
    const start = offsetGraphPoint(point, perpendicular, -halfWidthMeters);
    const end = offsetGraphPoint(point, perpendicular, halfWidthMeters);

    rows.push({
      id: stableId(
        "bgl-hold-short-topology",
        sourceFile,
        graph.pointTableOffset,
        point.index,
        point.flags
      ),
      sourceFile,
      sourceType: "bgl-hold-short-topology",
      rawTag: "BGL TaxiwayPoint HOLD_SHORT",
      classification: "stopbar",
      confidence: 0.85,
      vertices: [start, end],
      holdShortPoint: pointFromTaxiwayGraphPoint(point),
      holdShortPointType: pointType,
      holdShortOrientation:
        (point.flags & TAXIWAY_POINT_ORIENTATION_MASK) === 0 ? "forward" : "reverse",
      graphPointIndex: point.index,
      graphPointTableOffset: graph.pointTableOffset,
      connectedPathIndexes: connectedPaths.map((pathRecord) => pathRecord.index),
      widthMeters,
      topologyOnly: true,
      noRemovalRequired: true,
      classificationReasons: [
        "decoded compiled TaxiwayPoint HOLD_SHORT type",
        "position and orientation derived from connected TaxiwayPath records",
        "topology fallback only; no simulator light removal is required"
      ]
    });
  }
  return rows;
}

function averagedUndirectedTangent(vectors) {
  const reference = vectors[0];
  let x = 0;
  let y = 0;
  for (const vector of vectors) {
    let normalizedX = vector.x / vector.length;
    let normalizedY = vector.y / vector.length;
    if (normalizedX * reference.x + normalizedY * reference.y < 0) {
      normalizedX *= -1;
      normalizedY *= -1;
    }
    x += normalizedX;
    y += normalizedY;
  }
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : null;
}

function localMeterVector(origin, target) {
  const latitudeRadians = (origin.lat * Math.PI) / 180;
  return {
    x: (target.lon - origin.lon) * 111_320 * Math.cos(latitudeRadians),
    y: (target.lat - origin.lat) * 111_320
  };
}

function offsetGraphPoint(origin, direction, distanceMeters) {
  const latitudeRadians = (origin.lat * Math.PI) / 180;
  return {
    lat: origin.lat + (direction.y * distanceMeters) / 111_320,
    lon:
      origin.lon +
      (direction.x * distanceMeters) /
        Math.max(111_320 * Math.cos(latitudeRadians), 0.001)
  };
}

export function filterHoldShortTopologyRows(rows, lightRows, instances) {
  const realStopbarRows = (lightRows ?? []).filter(
    (row) =>
      row.classification === "stopbar" &&
      row.sourceType !== "bgl-hold-short-topology" &&
      Array.isArray(row.vertices) &&
      row.vertices.length > 0
  );
  const realStopbarInstances = (instances ?? []).filter(
    (instance) =>
      instance.classification === "stopbar" &&
      Number.isFinite(instance.lat) &&
      Number.isFinite(instance.lon)
  );
  return rows.filter((row) => {
    const point = row.holdShortPoint;
    const overlapsRealRow = realStopbarRows.some(
      (realRow) =>
        pointToPolylineDistanceMeters(point, realRow.vertices) <=
        HOLD_SHORT_REAL_LIGHT_DEDUPLICATION_METERS
    );
    if (overlapsRealRow) return false;
    return !realStopbarInstances.some(
      (instance) =>
        haversineDistanceMeters(point, instance) <=
        HOLD_SHORT_REAL_LIGHT_DEDUPLICATION_METERS
    );
  });
}

function findTaxiwayPointTables(buffer) {
  const tables = [];
  let offset = 0;
  while ((offset = buffer.indexOf(RECORD_TAXIWAY_POINT_TABLE, offset)) !== -1) {
    if (offset + 8 > buffer.length) {
      break;
    }
    if (buffer[offset + 1] !== 0) {
      offset += 1;
      continue;
    }

    const recordSize = buffer.readUInt16LE(offset + 0x02);
    const pointCount = buffer.readUInt16LE(offset + 0x06);
    if (
      pointCount < 2 ||
      recordSize !== 8 + pointCount * TAXIWAY_POINT_RECORD_SIZE ||
      offset + recordSize > buffer.length
    ) {
      offset += 1;
      continue;
    }

    const points = [];
    let plausiblePoints = 0;
    for (let index = 0; index < pointCount; index += 1) {
      const pointOffset = offset + 8 + index * TAXIWAY_POINT_RECORD_SIZE;
      const flags = buffer.readUInt32LE(pointOffset);
      const lon = decodeBglLongitude(buffer.readUInt32LE(pointOffset + 0x04));
      const lat = decodeBglLatitude(buffer.readUInt32LE(pointOffset + 0x08));
      if (isPlausibleCoordinate(lat, lon)) {
        plausiblePoints += 1;
      }
      points.push({
        index,
        flags,
        lat,
        lon
      });
    }

    if (plausiblePoints / pointCount < 0.95) {
      offset += 1;
      continue;
    }

    tables.push({
      offset,
      end: offset + recordSize,
      points
    });
    offset += recordSize;
  }

  return tables;
}

function findTaxiwayParkingTables(buffer, searchStart, searchEnd) {
  const parkings = [];
  for (let offset = searchStart; offset + 8 <= searchEnd; offset += 1) {
    if (buffer.readUInt16LE(offset) !== RECORD_TAXIWAY_PARKING_TABLE) {
      continue;
    }

    const recordSize = buffer.readUInt16LE(offset + 0x02);
    const parkingCount = buffer.readUInt16LE(offset + 0x06);
    if (
      parkingCount === 0 ||
      recordSize !== 8 + parkingCount * TAXIWAY_PARKING_RECORD_SIZE ||
      offset + recordSize > searchEnd
    ) {
      continue;
    }

    for (let index = 0; index < parkingCount; index += 1) {
      const parkingOffset = offset + 8 + index * TAXIWAY_PARKING_RECORD_SIZE;
      const lon = decodeBglLongitude(buffer.readUInt32LE(parkingOffset + 0x1c));
      const lat = decodeBglLatitude(buffer.readUInt32LE(parkingOffset + 0x20));
      if (!isPlausibleCoordinate(lat, lon)) {
        continue;
      }

      parkings.push({
        index,
        sourceRecordOffset: parkingOffset,
        flags: buffer.readUInt32LE(parkingOffset),
        radiusMeters: buffer.readFloatLE(parkingOffset + 0x04),
        heading: buffer.readFloatLE(parkingOffset + 0x08),
        lat,
        lon
      });
    }

    offset += recordSize - 1;
  }

  return parkings;
}

function findTaxiNameTable(buffer, searchStart, searchEnd) {
  for (let offset = searchStart; offset + 8 <= searchEnd; offset += 1) {
    if (buffer.readUInt16LE(offset) !== RECORD_TAXI_NAME_TABLE) {
      continue;
    }

    const recordSize = buffer.readUInt32LE(offset + 0x02);
    const taxiNameCount = buffer.readUInt16LE(offset + 0x06);
    if (
      taxiNameCount === 0 ||
      recordSize !== 8 + taxiNameCount * TAXI_NAME_RECORD_SIZE ||
      offset + recordSize > searchEnd
    ) {
      continue;
    }

    const taxiNames = [];
    let plausibleNames = 0;
    for (let index = 0; index < taxiNameCount; index += 1) {
      const nameOffset = offset + 8 + index * TAXI_NAME_RECORD_SIZE;
      const name = buffer
        .toString("ascii", nameOffset, nameOffset + TAXI_NAME_RECORD_SIZE)
        .replace(/\0+$/g, "")
        .trim();
      if (name === "" || /^[A-Z0-9-]{1,8}$/.test(name)) {
        plausibleNames += 1;
      }
      taxiNames.push({
        index,
        name
      });
    }

    if (plausibleNames / taxiNameCount < 0.9) {
      continue;
    }

    return taxiNames;
  }

  return [];
}

function findTaxiwayPathTable(buffer, pointCount, searchStart, searchEnd) {
  let bestTable = null;

  for (let offset = searchStart; offset + 8 <= searchEnd; offset += 1) {
    if (buffer.readUInt16LE(offset) !== RECORD_TAXIWAY_PATH_TABLE) {
      continue;
    }

    const recordSize = buffer.readUInt32LE(offset + 0x02);
    const pathCount = buffer.readUInt16LE(offset + 0x06);
    if (
      pathCount === 0 ||
      recordSize !== 8 + pathCount * TAXIWAY_PATH_RECORD_SIZE ||
      offset + recordSize > searchEnd
    ) {
      continue;
    }

    const table = {
      offset,
      entryOffset: offset + 8,
      end: offset + recordSize,
      count: pathCount
    };
    if (!isPlausibleTaxiwayPathTable(buffer, table, pointCount)) {
      continue;
    }

    if (!bestTable || table.count > bestTable.count) {
      bestTable = table;
    }
  }

  return bestTable;
}

function isPlausibleTaxiwayPathTable(buffer, table, pointCount) {
  let plausibleEntries = 0;
  const sampleCount = Math.min(table.count, 200);

  for (let index = 0; index < sampleCount; index += 1) {
    const offset = table.entryOffset + index * TAXIWAY_PATH_RECORD_SIZE;
    const startIndex = buffer.readUInt16LE(offset);
    const endIndex = buffer.readUInt16LE(offset + 0x2e);
    const pathType = buffer.readUInt8(offset + 0x04) & TAXIWAY_PATH_TYPE_MASK;
    const widthMeters = buffer.readFloatLE(offset + 0x08);
    const recordSizeMarker = buffer.readUInt16LE(offset + 0x16);

    if (
      startIndex < pointCount &&
      endIndex < pointCount &&
      pathType <= 16 &&
      Number.isFinite(widthMeters) &&
      widthMeters > 0 &&
      widthMeters <= 250 &&
      recordSizeMarker === TAXIWAY_PATH_RECORD_SIZE
    ) {
      plausibleEntries += 1;
    }
  }

  return sampleCount > 0 && plausibleEntries / sampleCount >= 0.95;
}

function parseTaxiwayPathTable(buffer, pathTable, points, taxiNames) {
  const paths = [];

  for (let index = 0; index < pathTable.count; index += 1) {
    const offset = pathTable.entryOffset + index * TAXIWAY_PATH_RECORD_SIZE;
    const startIndex = buffer.readUInt16LE(offset);
    const legacyEndAndRunwayDesignator = buffer.readUInt16LE(offset + 0x02);
    const legacyEndIndex = legacyEndAndRunwayDesignator & 0x0fff;
    const runwayDesignator = legacyEndAndRunwayDesignator >> 12;
    const pathTypeRaw = buffer.readUInt8(offset + 0x04);
    const pathType = pathTypeRaw & TAXIWAY_PATH_TYPE_MASK;
    const nameOrNumber = buffer.readUInt8(offset + 0x05);
    const markingFlags = buffer.readUInt8(offset + 0x06);
    const surface = buffer.readUInt8(offset + 0x07);
    const materialCount = buffer.readUInt8(offset + 0x2c);
    const vegetationFlags = buffer.readUInt8(offset + 0x2d);
    const endIndex = buffer.readUInt16LE(offset + 0x2e);
    const start = points[startIndex];
    const end = points[endIndex];
    const taxiNameIndex = nameOrNumber;
    const taxiName = taxiNames[taxiNameIndex]?.name;
    const lengthMeters = haversineDistanceMeters(start, end);

    paths.push({
      index,
      sourceRecordOffset: offset,
      startIndex,
      endIndex,
      start,
      end,
      legacyEndIndex,
      runwayDesignator,
      pathTypeRaw,
      pathType,
      nameOrNumber,
      markingFlags,
      centerLine: (markingFlags & TAXIWAY_PATH_CENTERLINE_FLAG) !== 0,
      centerLineLighted: (markingFlags & TAXIWAY_PATH_LIGHTED_CENTERLINE_FLAG) !== 0,
      leftEdgeType: (markingFlags & TAXIWAY_PATH_LEFT_EDGE_TYPE_MASK) >> 2,
      leftEdgeLighted: (markingFlags & TAXIWAY_PATH_LEFT_EDGE_LIGHTED_FLAG) !== 0,
      rightEdgeType: (markingFlags & TAXIWAY_PATH_RIGHT_EDGE_TYPE_MASK) >> 5,
      rightEdgeLighted: (markingFlags & TAXIWAY_PATH_RIGHT_EDGE_LIGHTED_FLAG) !== 0,
      surface,
      materialCount,
      vegetationFlags,
      taxiNameIndex,
      ...(taxiName ? { taxiName } : {}),
      widthMeters: buffer.readFloatLE(offset + 0x08),
      lengthMeters
    });
  }

  return paths;
}

function shouldReconstructTaxiwayPath(pathRecord) {
  return (
    pathRecord.centerLineLighted &&
    pathRecord.pathType === TAXIWAY_PATH_TYPE_TAXI &&
    pathRecord.lengthMeters >= MIN_TAXIWAY_PATH_LENGTH_METERS &&
    pathRecord.lengthMeters <= MAX_TAXIWAY_PATH_LENGTH_METERS
  );
}

function buildTaxiwayPathLightRow(sourceFile, graph, pathRecord) {
  return {
    id: stableId(
      "bgl-taxiway-path",
      sourceFile,
      pathRecord.sourceRecordOffset,
      pathRecord.startIndex,
      pathRecord.endIndex,
      pathRecord.markingFlags
    ),
    sourceFile,
    sourceType: "bgl-taxiway-path",
    sourceRecordOffset: pathRecord.sourceRecordOffset,
    rawTag: "BGL TaxiwayPath",
    spacing: DEFAULT_TAXIWAY_CENTERLINE_SPACING_METERS,
    snapToVertices: false,
    vertices: [
      pointFromTaxiwayGraphPoint(pathRecord.start),
      pointFromTaxiwayGraphPoint(pathRecord.end)
    ],
    classification: "taxi-centerline",
    confidence: 0.9,
    centerLine: pathRecord.centerLine,
    centerLineLighted: true,
    markingFlags: pathRecord.markingFlags,
    pathType: pathRecord.pathType,
    pathTypeRaw: pathRecord.pathTypeRaw,
    nameOrNumber: pathRecord.nameOrNumber,
    taxiNameIndex: pathRecord.taxiNameIndex,
    ...(pathRecord.taxiName ? { taxiName: pathRecord.taxiName } : {}),
    startPointIndex: pathRecord.startIndex,
    endPointIndex: pathRecord.endIndex,
    legacyEndPointIndex: pathRecord.legacyEndIndex,
    runwayDesignator: pathRecord.runwayDesignator,
    leftEdgeType: pathRecord.leftEdgeType,
    leftEdgeLighted: pathRecord.leftEdgeLighted,
    rightEdgeType: pathRecord.rightEdgeType,
    rightEdgeLighted: pathRecord.rightEdgeLighted,
    surface: pathRecord.surface,
    materialCount: pathRecord.materialCount,
    vegetationFlags: pathRecord.vegetationFlags,
    widthMeters: pathRecord.widthMeters,
    lengthMeters: pathRecord.lengthMeters,
    graphPointTableOffset: graph.pointTableOffset,
    classificationReasons: [
      "decoded compiled TaxiwayPoint and TaxiwayPath records",
      "TaxiwayPath centerline-light bit is set",
      "TaxiwayPath type is TAXI"
    ]
  };
}

function buildTaxiwayPathEdgeLightRows(sourceFile, graph, pathRecord) {
  if (
    pathRecord.pathType !== TAXIWAY_PATH_TYPE_TAXI ||
    pathRecord.lengthMeters < MIN_TAXIWAY_PATH_LENGTH_METERS ||
    pathRecord.lengthMeters > MAX_TAXIWAY_PATH_LENGTH_METERS
  ) {
    return [];
  }

  const rows = [];
  if (pathRecord.leftEdgeLighted) {
    rows.push(buildTaxiwayPathEdgeLightRow(sourceFile, graph, pathRecord, "left"));
  }
  if (pathRecord.rightEdgeLighted) {
    rows.push(buildTaxiwayPathEdgeLightRow(sourceFile, graph, pathRecord, "right"));
  }
  return rows;
}

function buildTaxiwayPathEdgeLightRow(sourceFile, graph, pathRecord, side) {
  const start = pointFromTaxiwayGraphPoint(pathRecord.start);
  const end = pointFromTaxiwayGraphPoint(pathRecord.end);
  const sideSign = side === "left" ? 1 : -1;
  const offsetMeters = sideSign * Math.max(0, pathRecord.widthMeters / 2);
  const vertices = offsetSegment(start, end, offsetMeters);
  return {
    id: stableId(
      "bgl-taxiway-path-edge",
      sourceFile,
      pathRecord.sourceRecordOffset,
      side
    ),
    sourceFile,
    sourceType: "bgl-taxiway-path-edge",
    sourceRecordOffset: pathRecord.sourceRecordOffset,
    rawTag: "BGL TaxiwayPath Edge Lights",
    snapToVertices: false,
    vertices,
    classification: "taxi-edge",
    confidence: 0.9,
    edgeSide: side,
    edgeType: side === "left" ? pathRecord.leftEdgeType : pathRecord.rightEdgeType,
    edgeLighted: true,
    pathType: pathRecord.pathType,
    pathTypeRaw: pathRecord.pathTypeRaw,
    nameOrNumber: pathRecord.nameOrNumber,
    taxiNameIndex: pathRecord.taxiNameIndex,
    ...(pathRecord.taxiName ? { taxiName: pathRecord.taxiName } : {}),
    startPointIndex: pathRecord.startIndex,
    endPointIndex: pathRecord.endIndex,
    widthMeters: pathRecord.widthMeters,
    lengthMeters: pathRecord.lengthMeters,
    graphPointTableOffset: graph.pointTableOffset,
    classificationReasons: [
      "decoded compiled TaxiwayPoint and TaxiwayPath records",
      `TaxiwayPath ${side} edge-light bit is set`,
      "TaxiwayPath type is TAXI"
    ]
  };
}

function offsetSegment(start, end, offsetMeters) {
  const metersPerDegreeLon =
    111320 * Math.max(Math.cos((start.lat * Math.PI) / 180), 0.000001);
  const dx = (end.lon - start.lon) * metersPerDegreeLon;
  const dy = (end.lat - start.lat) * 111320;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length <= 0.001) {
    return [start, end];
  }
  const eastOffset = (-dy / length) * offsetMeters;
  const northOffset = (dx / length) * offsetMeters;
  return [start, end].map((point) => ({
    lat: point.lat + northOffset / 111320,
    lon: point.lon + eastOffset / metersPerDegreeLon
  }));
}

function buildTaxiwayPathBridgeRows(sourceFile, graphs, sourceRows) {
  const targetRows = sourceRows.filter((row) =>
    isTargetLightClassification(row.classification) &&
    Array.isArray(row.vertices) &&
    row.vertices.length >= 2
  );
  if (targetRows.length < 2) {
    return [];
  }

  return graphs.flatMap((graph) =>
    graph.paths
      .filter((pathRecord) => shouldBridgeTaxiwayPath(pathRecord, targetRows))
      .map((pathRecord) => buildTaxiwayPathBridgeRow(sourceFile, graph, pathRecord, targetRows))
  );
}

function shouldBridgeTaxiwayPath(pathRecord, targetRows) {
  if (
    !TAXIWAY_PATH_BRIDGE_TYPES.has(pathRecord.pathType) ||
    !pathRecord.taxiName ||
    pathRecord.centerLineLighted ||
    pathRecord.lengthMeters < MIN_TAXIWAY_PATH_LENGTH_METERS ||
    pathRecord.lengthMeters > MAX_TAXIWAY_PATH_BRIDGE_LENGTH_METERS
  ) {
    return false;
  }

  const start = pointFromTaxiwayGraphPoint(pathRecord.start);
  const end = pointFromTaxiwayGraphPoint(pathRecord.end);
  const midpoint = {
    lat: (start.lat + end.lat) / 2,
    lon: (start.lon + end.lon) / 2
  };
  const startAnchor = findTaxiwayPathEndpointAnchor(start, end, targetRows);
  const endAnchor = findTaxiwayPathEndpointAnchor(end, start, targetRows);

  return (
    startAnchor !== undefined &&
    endAnchor !== undefined &&
    startAnchor.row.id !== endAnchor.row.id &&
    nearestRowDistanceMeters(midpoint, targetRows) >= TAXIWAY_PATH_BRIDGE_UNCOVERED_MIDPOINT_METERS
  );
}

function buildTaxiwayPathBridgeRow(sourceFile, graph, pathRecord, targetRows) {
  const start = pointFromTaxiwayGraphPoint(pathRecord.start);
  const end = pointFromTaxiwayGraphPoint(pathRecord.end);
  const startAnchor = findTaxiwayPathEndpointAnchor(start, end, targetRows);
  const endAnchor = findTaxiwayPathEndpointAnchor(end, start, targetRows);

  return {
    id: stableId(
      "bgl-taxiway-path-bridge",
      sourceFile,
      pathRecord.sourceRecordOffset,
      pathRecord.startIndex,
      pathRecord.endIndex,
      pathRecord.taxiName
    ),
    sourceFile,
    sourceType: "bgl-taxiway-path-bridge",
    sourceRecordOffset: pathRecord.sourceRecordOffset,
    rawTag: "BGL TaxiwayPath Bridge",
    spacing: DEFAULT_TAXIWAY_CENTERLINE_SPACING_METERS,
    snapToVertices: false,
    vertices: [start, end],
    classification: "taxi-centerline",
    confidence: 0.78,
    centerLine: pathRecord.centerLine,
    centerLineLighted: false,
    markingFlags: pathRecord.markingFlags,
    pathType: pathRecord.pathType,
    pathTypeRaw: pathRecord.pathTypeRaw,
    nameOrNumber: pathRecord.nameOrNumber,
    taxiNameIndex: pathRecord.taxiNameIndex,
    taxiName: pathRecord.taxiName,
    startPointIndex: pathRecord.startIndex,
    endPointIndex: pathRecord.endIndex,
    legacyEndPointIndex: pathRecord.legacyEndIndex,
    runwayDesignator: pathRecord.runwayDesignator,
    leftEdgeType: pathRecord.leftEdgeType,
    leftEdgeLighted: pathRecord.leftEdgeLighted,
    rightEdgeType: pathRecord.rightEdgeType,
    rightEdgeLighted: pathRecord.rightEdgeLighted,
    surface: pathRecord.surface,
    materialCount: pathRecord.materialCount,
    vegetationFlags: pathRecord.vegetationFlags,
    widthMeters: pathRecord.widthMeters,
    lengthMeters: pathRecord.lengthMeters,
    graphPointTableOffset: graph.pointTableOffset,
    nearestTargetRowEndpointDistancesMeters: {
      start: startAnchor?.distanceMeters ?? nearestRowDistanceMeters(start, targetRows),
      end: endAnchor?.distanceMeters ?? nearestRowDistanceMeters(end, targetRows)
    },
    targetRowEndpointAnchorTypes: {
      start: startAnchor?.type,
      end: endAnchor?.type
    },
    classificationReasons: [
      "decoded compiled TaxiwayPoint and TaxiwayPath records",
      "TaxiwayPath bridges a gap between source-backed target rows",
      "TaxiwayPath endpoints touch decoded target row geometry or an aligned terminal gap no longer than one source light spacing",
      "TaxiwayPath midpoint is not already covered by decoded target row geometry"
    ]
  };
}

function findTaxiwayPathEndpointAnchor(point, otherPathPoint, rows) {
  const nearestGeometryAnchor = rows
    .map((row) => ({
      row,
      distanceMeters: pointToPolylineDistanceMeters(point, row.vertices)
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  if (
    nearestGeometryAnchor &&
    nearestGeometryAnchor.distanceMeters <= TAXIWAY_PATH_BRIDGE_ENDPOINT_TOLERANCE_METERS
  ) {
    return {
      ...nearestGeometryAnchor,
      type: "row-geometry"
    };
  }

  let bestTerminalAnchor;
  for (const row of rows) {
    if (!Number.isFinite(row.spacing) || row.spacing <= 0 || row.vertices.length < 2) {
      continue;
    }

    const maxExtensionMeters = Math.min(
      TAXIWAY_PATH_BRIDGE_MAX_ENDPOINT_EXTENSION_METERS,
      row.spacing
    );
    const terminalSegments = [
      [row.vertices[0], row.vertices[1]],
      [row.vertices.at(-1), row.vertices.at(-2)]
    ];

    for (const [terminal, adjacent] of terminalSegments) {
      const distanceMeters = haversineDistanceMeters(point, terminal);
      if (distanceMeters > maxExtensionMeters) {
        continue;
      }

      const alignmentDegrees = segmentAlignmentDegrees(
        point,
        otherPathPoint,
        terminal,
        adjacent
      );
      if (alignmentDegrees > TAXIWAY_PATH_BRIDGE_MAX_ALIGNMENT_DEGREES) {
        continue;
      }

      if (!bestTerminalAnchor || distanceMeters < bestTerminalAnchor.distanceMeters) {
        bestTerminalAnchor = {
          row,
          distanceMeters,
          alignmentDegrees,
          type: "aligned-row-terminal"
        };
      }
    }
  }

  return bestTerminalAnchor;
}

function segmentAlignmentDegrees(firstStart, firstEnd, secondStart, secondEnd) {
  const referenceLatitudeRadians =
    ((firstStart.lat + firstEnd.lat + secondStart.lat + secondEnd.lat) / 4) *
    (Math.PI / 180);
  const longitudeScale = Math.cos(referenceLatitudeRadians);
  const firstVector = {
    x: (firstEnd.lon - firstStart.lon) * longitudeScale,
    y: firstEnd.lat - firstStart.lat
  };
  const secondVector = {
    x: (secondEnd.lon - secondStart.lon) * longitudeScale,
    y: secondEnd.lat - secondStart.lat
  };
  const firstLength = Math.hypot(firstVector.x, firstVector.y);
  const secondLength = Math.hypot(secondVector.x, secondVector.y);
  if (firstLength === 0 || secondLength === 0) {
    return 180;
  }

  const cosine = Math.abs(
    (firstVector.x * secondVector.x + firstVector.y * secondVector.y) /
      (firstLength * secondLength)
  );
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * (180 / Math.PI);
}

function nearestRowDistanceMeters(point, rows) {
  return Math.min(...rows.map((row) => pointToPolylineDistanceMeters(point, row.vertices)));
}

function pointFromTaxiwayGraphPoint(point) {
  return {
    lat: point.lat,
    lon: point.lon
  };
}

export function extractModelInfos(buffer, sourceFile) {
  const modelInfos = [];
  let offset = 0;

  while ((offset = buffer.indexOf(MODEL_INFO_NEEDLE, offset)) !== -1) {
    const end = buffer.indexOf(TAG_END, offset);
    if (end === -1) {
      break;
    }

    const tag = buffer.toString("utf8", offset, end + 1);
    const guid = tag.match(/\bguid="(\{?[0-9a-fA-F-]{36}\}?)"/i)?.[1];
    const name = tag.match(/\bname="([^"]+)"/i)?.[1];
    if (guid && name) {
      modelInfos.push({
        guid: normalizeGuid(guid),
        name,
        sourceFile
      });
    }

    offset = end + 1;
  }

  return modelInfos;
}

export async function extractModelInfosFromFile(sourceFile) {
  const modelInfos = [];
  let carry = Buffer.alloc(0);

  for await (const chunk of createReadStream(sourceFile, { highWaterMark: 4 * 1024 * 1024 })) {
    const buffer = carry.length > 0 ? Buffer.concat([carry, chunk]) : chunk;
    let offset = 0;

    while ((offset = buffer.indexOf(MODEL_INFO_NEEDLE, offset)) !== -1) {
      const end = buffer.indexOf(TAG_END, offset);
      if (end === -1) {
        break;
      }

      const modelInfo = parseModelInfoTag(buffer.toString("utf8", offset, end + 1), sourceFile);
      if (modelInfo) {
        modelInfos.push(modelInfo);
      }
      offset = end + 1;
    }

    carry = buffer.subarray(Math.max(0, buffer.length - MODEL_INFO_STREAM_TAIL_BYTES));
  }

  return modelInfos;
}

function parseModelInfoTag(tag, sourceFile) {
  const guid = tag.match(/\bguid="(\{?[0-9a-fA-F-]{36}\}?)"/i)?.[1];
  const name = tag.match(/\bname="([^"]+)"/i)?.[1];
  if (!guid || !name) {
    return null;
  }

  return {
    guid: normalizeGuid(guid),
    name,
    sourceFile
  };
}

export function extractBglPlacements(buffer, sourceFile, modelIndex = new Map()) {
  const warnings = [];
  const instances = [];
  const sectionTypes = {};

  if (buffer.length < HEADER_SIZE) {
    return {
      parsed: false,
      instances,
      warnings: [`${sourceFile}: BGL file is too small to contain a valid header`],
      sectionTypes,
      unsupportedSceneryRecordTypes: {}
    };
  }

  const magic = buffer.readUInt16LE(0);
  const headerSize = buffer.readUInt32LE(4);
  const sectionCount = buffer.readUInt32LE(0x14);

  if (magic !== 0x0201 || headerSize < HEADER_SIZE) {
    return {
      parsed: false,
      instances,
      warnings: [`${sourceFile}: unsupported or unrecognized BGL header`],
      sectionTypes,
      unsupportedSceneryRecordTypes: {}
    };
  }

  if (headerSize + sectionCount * SECTION_POINTER_SIZE > buffer.length) {
    return {
      parsed: false,
      instances,
      warnings: [`${sourceFile}: BGL section table is outside file bounds`],
      sectionTypes,
      unsupportedSceneryRecordTypes: {}
    };
  }

  let scenerySections = 0;
  const skippedRecordTypes = new Map();
  for (let index = 0; index < sectionCount; index += 1) {
    const pointerOffset = HEADER_SIZE + index * SECTION_POINTER_SIZE;
    const sectionType = buffer.readUInt32LE(pointerOffset);
    const sectionTypeKey = hexKey(sectionType);
    sectionTypes[sectionTypeKey] = (sectionTypes[sectionTypeKey] ?? 0) + 1;
    if (sectionType !== SECTION_SCENERY_OBJECTS) {
      continue;
    }

    scenerySections += 1;
    const subsectionCount = buffer.readUInt32LE(pointerOffset + 0x08);
    const subsectionOffset = buffer.readUInt32LE(pointerOffset + 0x0c);
    const subsectionTableSize = buffer.readUInt32LE(pointerOffset + 0x10);
    const subsectionPointerSize = subsectionTableSize / Math.max(subsectionCount, 1);

    if (
      subsectionCount === 0 ||
      !Number.isInteger(subsectionPointerSize) ||
      subsectionPointerSize < SUBSECTION_POINTER_SIZE ||
      subsectionOffset + subsectionTableSize > buffer.length
    ) {
      warnings.push(`${sourceFile}: scenery-object subsection table is invalid`);
      continue;
    }

    for (let subsectionIndex = 0; subsectionIndex < subsectionCount; subsectionIndex += 1) {
      const subsectionPointerOffset = subsectionOffset + subsectionIndex * subsectionPointerSize;
      const subsectionQmid = buffer.readUInt32LE(subsectionPointerOffset);
      const recordCount = buffer.readUInt32LE(subsectionPointerOffset + 0x04);
      const recordsOffset = buffer.readUInt32LE(subsectionPointerOffset + 0x08);
      const recordsSize = buffer.readUInt32LE(subsectionPointerOffset + 0x0c);

      if (recordsOffset + recordsSize > buffer.length) {
        warnings.push(`${sourceFile}: scenery-object records are outside file bounds`);
        continue;
      }

      let recordOffset = recordsOffset;
      for (let recordIndex = 0; recordIndex < recordCount && recordOffset < recordsOffset + recordsSize; recordIndex += 1) {
        if (recordOffset + 4 > buffer.length) {
          warnings.push(`${sourceFile}: truncated scenery-object record at 0x${recordOffset.toString(16)}`);
          break;
        }

        const recordType = buffer.readUInt16LE(recordOffset);
        const recordSize = buffer.readUInt16LE(recordOffset + 0x02);
        if (recordSize < 4 || recordOffset + recordSize > recordsOffset + recordsSize) {
          warnings.push(`${sourceFile}: invalid scenery-object record size at 0x${recordOffset.toString(16)}`);
          break;
        }

        if (recordType === RECORD_SCENERY_OBJECT_LIBRARY_OBJECT && recordSize >= 0x40) {
          instances.push(parseLibraryObjectRecord(buffer, sourceFile, recordOffset, modelIndex, {
            sectionIndex: index,
            subsectionIndex,
            subsectionQmid,
            recordIndex,
            recordSize
          }));
        } else {
          skippedRecordTypes.set(recordType, (skippedRecordTypes.get(recordType) ?? 0) + 1);
        }

        recordOffset += recordSize;
      }
    }
  }

  if (scenerySections === 0 && buffer.indexOf(MODEL_INFO_NEEDLE) === -1) {
    warnings.push(`${sourceFile}: valid BGL parsed, but no scenery-object section was found`);
  }

  for (const [recordType, count] of skippedRecordTypes) {
    warnings.push(`${sourceFile}: skipped ${count} unsupported scenery-object records of type 0x${recordType.toString(16)}`);
  }

  return {
    parsed: true,
    instances,
    warnings,
    sectionTypes,
    unsupportedSceneryRecordTypes: Object.fromEntries(
      [...skippedRecordTypes.entries()].map(([recordType, count]) => [hexKey(recordType), count])
    )
  };
}

function hexKey(value) {
  return `0x${value.toString(16)}`;
}

function parseLibraryObjectRecord(buffer, sourceFile, offset, modelIndex, provenance = {}) {
  const rawLongitude = buffer.readUInt32LE(offset + 0x04);
  const rawLatitude = buffer.readUInt32LE(offset + 0x08);
  const rawAltitude = buffer.readInt32LE(offset + 0x0c);
  const rawFlags = buffer.readUInt16LE(offset + 0x10);
  const rawPitch = buffer.readInt16LE(offset + 0x12);
  const rawBank = buffer.readInt16LE(offset + 0x14);
  const rawHeading = buffer.readUInt16LE(offset + 0x16);
  const rawImageComplexity = buffer.readUInt16LE(offset + 0x18);
  const rawUnknown = buffer.readUInt16LE(offset + 0x1a);
  const lat = decodeBglLatitude(rawLatitude);
  const lon = decodeBglLongitude(rawLongitude);
  const alt = rawAltitude / 1000;
  const pitch = decodeAngle16(rawPitch);
  const bank = decodeAngle16(rawBank);
  const heading = decodeAngle16(rawHeading);
  const instanceId = guidFromBytes(buffer, offset + 0x1c);
  const guid = guidFromBytes(buffer, offset + 0x2c);
  const scale = buffer.readFloatLE(offset + 0x3c);
  const modelInfo = modelIndex.get(normalizeGuid(guid));
  const classification = classifyObject({
    sourceType: "library-object",
    rawTag: "BGL SceneryObject.LibraryObject",
    guid,
    name: modelInfo?.name,
    extraText: path.basename(sourceFile)
  });

  return {
    id: stableId(sourceFile, offset, lat, lon, guid),
    sourceFile,
    sourceType: "library-object",
    lat,
    lon,
    alt,
    heading,
    pitch,
    bank,
    scale,
    guid,
    ...(modelInfo?.name ? { name: modelInfo.name } : {}),
    rawTag: "BGL SceneryObject.LibraryObject",
    sourceRecordOffset: offset,
    sourceRecordSize: provenance.recordSize ?? buffer.readUInt16LE(offset + 0x02),
    sourceSectionType: "0x25",
    sourceSectionIndex: provenance.sectionIndex,
    sourceSubsectionIndex: provenance.subsectionIndex,
    sourceSubsectionQmid: provenance.subsectionQmid,
    sourceRecordIndex: provenance.recordIndex,
    bglRawPlacement: {
      longitude: rawLongitude,
      latitude: rawLatitude,
      altitude: rawAltitude,
      flags: rawFlags,
      pitch: rawPitch,
      bank: rawBank,
      heading: rawHeading,
      imageComplexity: rawImageComplexity,
      unknown: rawUnknown
    },
    instanceId,
    classification: classification.classification,
    confidence: classification.confidence,
    classificationReasons: classification.reasons
  };
}

export function decodeBglLongitude(value) {
  return (value * 360) / (3 * 0x10000000) - 180;
}

export function decodeBglLatitude(value) {
  return 90 - (value * 180) / (2 * 0x10000000);
}

function decodeAngle16(value) {
  const angle = (value * 360) / 0x10000;
  return Math.round(angle * 1_000_000) / 1_000_000;
}

function guidFromBytes(buffer, offset) {
  const d1 = buffer.readUInt32LE(offset).toString(16).padStart(8, "0");
  const d2 = buffer.readUInt16LE(offset + 4).toString(16).padStart(4, "0");
  const d3 = buffer.readUInt16LE(offset + 6).toString(16).padStart(4, "0");
  const d4 = [...buffer.subarray(offset + 8, offset + 10)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const d5 = [...buffer.subarray(offset + 10, offset + 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `{${d1}-${d2}-${d3}-${d4}-${d5}}`;
}

export function normalizeGuid(guid) {
  const value = String(guid ?? "").trim().toLowerCase();
  if (!value) {
    return "";
  }
  return value.startsWith("{") ? value : `{${value}}`;
}
