import { generateRemovalGeometry } from './extractor/extract.js';
import {
  haversineDistanceMeters,
  pointInPolygon,
  pointToPolylineDistanceMeters,
  polylineToPolylineDistanceMeters,
} from './extractor/geo.js';

const DEFAULT_SIZES = {
  library: 3,
  vfx: 3,
  simprop: 8,
  lightrow: 2,
};
const TARGET_CLASSIFICATIONS = new Set(['stopbar', 'lead-on', 'taxi-centerline']);
const GUIDANCE_CLASSIFICATIONS = new Set(['lead-on', 'taxi-centerline']);
const SECTION_PROTECTION_BOUNDARY_GAP_METERS = 1.25;
const ISOLATED_CROSSING_DISTANCE_METERS = 1.3;
const MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS = 6;
const CROSSING_SAMPLE_INTERVAL_METERS = 0.5;
const MAXIMUM_SAFETY_PASSES = 12;
const REMOVAL_COVERAGE_BOUNDARY_TOLERANCE_METERS = 0.1;
const DEBUG_ID_NEIGHBOR_COUNT = 4;
const DEBUG_ID_COLORS = [
  '#3b82f6',
  '#f97316',
  '#22c55e',
  '#ec4899',
  '#06b6d4',
  '#eab308',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
  '#f472b6',
  '#84cc16',
  '#6366f1',
];

export function buildDraftOutput(data, matching, options) {
  const selective = buildSafeSelectiveRemovals(data, matching.matches, options.onProgress);
  const removalWarnings = uniqueDivisionItems(
    selective.rejected.map((match) => ({
      division: match.division,
      reason:
        'Simulator geometry matched and the BARS object was added, but its automatic removal area needs manual review.',
    }))
  );
  const replacements = replacementMatches(matching.matches);
  const safeReplacements = replacementMatches(selective.approved);
  const safetyDivisionIds = new Set(removalWarnings.map((item) => String(item.division?.id ?? '')));
  const unsafeReplacements = replacements.filter((match) =>
    safetyDivisionIds.has(String(match.division.id))
  );
  const safeVisualReplacements = safeReplacements.filter(
    (match) => !safetyDivisionIds.has(String(match.division.id))
  );
  const xml = generateDraftXml({
    icao: options.icao,
    altitude: options.altitude,
    matches: replacements,
    removalPolygons: selective.geometry.removalPolygons,
  });
  const geojson = buildDraftGeoJson(
    safeVisualReplacements,
    matching.unmatched,
    selective.geometry.removalPolygons,
    unsafeReplacements
  );
  const simulatorGeojson = buildSimulatorDebugGeoJson(
    [...(data.lightRows ?? []), ...(data.topologyRows ?? [])],
    matching.mergedSimulatorRows ?? []
  );

  return {
    xml,
    geojson,
    simulatorGeojson,
    matched: matching.matches,
    removalApproved: selective.approved,
    replacements,
    unmatched: matching.unmatched,
    removalWarnings,
    removals: selective.geometry.removalPolygons,
    safetyRejections: selective.rejected.map((match) => ({
      divisionId: String(match.division.id),
      rowId: match.row.id,
      sourceParentRowId: match.row.sourceParentRowId,
      sourceRangeStartMeters: match.row.sourceRangeStartMeters,
      sourceRangeEndMeters: match.row.sourceRangeEndMeters,
      reason: match.safetyReason,
      conflictIds: match.safetyConflictIds ?? [],
      pass: match.safetyPass,
    })),
    duplicateDivisionLeadOns: matching.duplicateDivisionLeadOns,
    duplicateSimulatorLeadOns: matching.duplicateSimulatorLeadOns,
  };
}

function replacementMatches(matches) {
  const replacements = [];
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
  const ordered = [...matches].sort(
    (left, right) =>
      String(left.division.id).localeCompare(String(right.division.id)) ||
      rowLengthMeters(right.row) - rowLengthMeters(left.row) ||
      right.score - left.score
  );

  for (const match of ordered) {
    const replacement = match.replacementRow ? { ...match, row: match.replacementRow } : match;
    const isCovered = replacements.some(
      (existing) =>
        String(existing.division.id) === String(replacement.division.id) &&
        rowFollowsRow(replacement.row, existing.row)
    );
    if (!isCovered) replacements.push(replacement);
  }
  return replacements;
}

function rowFollowsRow(candidate, reference) {
  const candidateVertices = candidate.vertices ?? [];
  const referenceVertices = reference.vertices ?? [];
  return (
    candidateVertices.length >= 2 &&
    referenceVertices.length >= 2 &&
    candidateVertices.every(
      (vertex) => pointToPolylineDistanceMeters(vertex, referenceVertices) <= 2
    )
  );
}

function rowLengthMeters(row) {
  let length = 0;
  for (let index = 1; index < (row.vertices?.length ?? 0); index += 1) {
    length += haversineDistanceMeters(row.vertices[index - 1], row.vertices[index]);
  }
  return length;
}

function buildSafeSelectiveRemovals(data, initialMatches, onProgress) {
  const noRemovalMatches = initialMatches.filter((match) => match.row?.noRemovalRequired === true);
  let approved = initialMatches.filter((match) => match.row?.noRemovalRequired !== true);
  const originalSelectedRows = approved.map((match) => match.row);
  const rejected = [];
  let geometry;

  if (approved.length === 0) {
    return {
      approved: noRemovalMatches,
      rejected,
      geometry: emptyRemovalGeometry(),
    };
  }

  for (let pass = 0; pass < MAXIMUM_SAFETY_PASSES; pass += 1) {
    if (approved.length === 0) break;
    onProgress?.({
      pass: pass + 1,
      maxPasses: MAXIMUM_SAFETY_PASSES,
      remaining: approved.length,
    });
    geometry = generateForMatches(data, approved, originalSelectedRows);

    const unselectedTargetConflicts = new Set(
      rowsCoveringSelectiveProtectionZones(
        geometry.selectiveProtectionZones,
        geometry.removalPolygons,
        approved.map((match) => match.row)
      )
    );
    const selectiveProtectionDetails = geometry.protectionConflicts.filter((conflict) =>
      conflict.mustKeepZoneIds?.some((id) => String(id).startsWith('selective-'))
    );
    const protectedLightDetails = geometry.protectionConflicts.filter(
      (conflict) =>
        !conflict.mustKeepZoneIds?.length ||
        conflict.mustKeepZoneIds.some((id) => !String(id).startsWith('selective-'))
    );
    const activeRows = approved.map((match) => match.row);
    const selectiveProtectionConflicts = conflictIdsBySourceRow(
      selectiveProtectionDetails,
      activeRows
    );
    const protectedLightConflicts = conflictIdsBySourceRow(protectedLightDetails, activeRows);
    const removalRings = geometry.removalPolygons.map((polygon) =>
      polygon.coordinates.map(([lon, lat]) => ({ lon, lat }))
    );
    // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Explicit transform and validation stages keep this bounded safety pass auditable.
    const unsafe = approved
      .map((match) => {
        const row = match.row;
        const isCovered = rowIsCoveredByRemovals(row, removalRings);
        const rowId = row.id;
        const hasUnselectedTargetConflict = unselectedTargetConflicts.has(rowId);
        const hasSelectiveProtectionConflict = selectiveProtectionConflicts.has(rowId);
        const hasProtectedLightConflict = protectedLightConflicts.has(rowId);
        if (
          isCovered &&
          !hasUnselectedTargetConflict &&
          !hasSelectiveProtectionConflict &&
          !hasProtectedLightConflict
        ) {
          return null;
        }
        return {
          ...match,
          safetyPass: pass + 1,
          safetyConflictIds: hasSelectiveProtectionConflict
            ? selectiveProtectionConflicts.get(rowId)
            : hasProtectedLightConflict
              ? protectedLightConflicts.get(rowId)
              : [],
          safetyReason: hasUnselectedTargetConflict
            ? 'unselected-target-conflict'
            : hasSelectiveProtectionConflict
              ? 'unselected-target-protection-conflict'
              : hasProtectedLightConflict
                ? 'must-keep-conflict'
                : 'incomplete-removal-coverage',
        };
      })
      .filter(Boolean);
    if (unsafe.length === 0) {
      return { approved: [...approved, ...noRemovalMatches], rejected, geometry };
    }

    const unsafeRows = new Set(unsafe.map((match) => match.row.id));
    rejected.push(...unsafe);
    approved = approved.filter((match) => !unsafeRows.has(match.row.id));
  }

  if (approved.length === 0) {
    return {
      approved: noRemovalMatches,
      rejected,
      geometry: emptyRemovalGeometry(),
    };
  }
  throw new Error(
    'Selective removal safety did not converge. No draft was created; add the remaining objects manually.'
  );
}

function conflictIdsBySourceRow(conflicts, rows) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const bySourceRow = new Map();
  for (const conflict of conflicts) {
    let sourceRowIds = conflict.sourceRowIds?.length
      ? conflict.sourceRowIds
      : [conflict.sourceRowId];
    if (Number.isFinite(conflict.lat) && Number.isFinite(conflict.lon)) {
      const conflictPoint = { lat: conflict.lat, lon: conflict.lon };
      const hasKnownSourceRow = sourceRowIds.some((sourceRowId) => rowsById.has(sourceRowId));
      const localSourceRowIds = sourceRowIds.filter((sourceRowId) => {
        const row = rowsById.get(sourceRowId);
        return (
          row?.vertices?.length > 0 &&
          pointToPolylineDistanceMeters(conflictPoint, row.vertices) <=
            ISOLATED_CROSSING_DISTANCE_METERS
        );
      });
      if (hasKnownSourceRow) sourceRowIds = localSourceRowIds;
    }
    for (const sourceRowId of sourceRowIds) {
      if (!sourceRowId) continue;
      const ids = bySourceRow.get(sourceRowId) ?? new Set();
      for (const id of conflict.mustKeepZoneIds ?? []) ids.add(id);
      bySourceRow.set(sourceRowId, ids);
    }
  }
  return new Map(
    [...bySourceRow].map(([sourceRowId, ids]) => {
      // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
      return [sourceRowId, [...ids].sort()];
    })
  );
}

function rowIsCoveredByRemovals(row, removalRings) {
  const vertices = row.vertices ?? [];
  if (vertices.length === 0) return false;
  return vertices.every((vertex) =>
    removalRings.some(
      (ring) =>
        pointInPolygon(vertex, ring) ||
        pointToPolylineDistanceMeters(vertex, ring) <= REMOVAL_COVERAGE_BOUNDARY_TOLERANCE_METERS
    )
  );
}

function rowsCoveringSelectiveProtectionZones(protectionZones, removalPolygons, rows) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const protectedPoints = (protectionZones ?? []).flatMap((zone) =>
    zone.geometryType === 'Point' ? [zone.point] : (zone.vertices ?? [])
  );
  const rowIds = new Set();
  for (const polygon of removalPolygons) {
    const ring = polygon.coordinates.map(([lon, lat]) => ({ lon, lat }));
    if (!protectedPoints.some((point) => pointInPolygon(point, ring))) continue;
    const sourceRowIds = polygon.sourceRowIds?.length
      ? polygon.sourceRowIds
      : [polygon.sourceRowId];
    const hasKnownSourceRow = sourceRowIds.some((rowId) => rowsById.has(rowId));
    const localSourceRowIds = sourceRowIds.filter((rowId) => {
      const row = rowsById.get(rowId);
      return protectedPoints.some(
        (point) =>
          pointInPolygon(point, ring) &&
          row?.vertices?.length > 0 &&
          pointToPolylineDistanceMeters(point, row.vertices) <= ISOLATED_CROSSING_DISTANCE_METERS
      );
    });
    for (const rowId of hasKnownSourceRow ? localSourceRowIds : sourceRowIds) {
      rowIds.add(rowId);
    }
  }
  return rowIds;
}

function generateForMatches(
  data,
  matches,
  originalSelectedRows = matches.map((match) => match.row)
) {
  const selectedRows = matches.map((match) => match.row);
  const rows = consolidateRemovalRows(data.lightRows ?? [], selectedRows);
  const sourceInstanceIds = new Set(selectedRows.flatMap((row) => row.sourceInstanceIds ?? []));
  const sourceInstances = (data.instances ?? []).filter((instance) =>
    sourceInstanceIds.has(instance.id)
  );
  const originallySelectedSourceInstanceIds = new Set(
    originalSelectedRows.flatMap((row) => row.sourceInstanceIds ?? [])
  );
  const selectiveZones = selectiveTargetMustKeepZones(
    data,
    originalSelectedRows,
    originallySelectedSourceInstanceIds
  );
  const selectiveProtectionZones = selectiveZones.filter(
    (zone) => !isIsolatedGuidanceCrossingZone(zone, selectedRows)
  );
  const protectedSourceZones = (data.mustKeepZones ?? []).filter(
    (zone) => !isConservativeRunwayEnvelopeSuperseded(zone, selectedRows)
  );
  const mustKeepZones = [...protectedSourceZones, ...selectiveProtectionZones];
  return {
    ...generateRemovalGeometry(sourceInstances, rows, DEFAULT_SIZES, mustKeepZones),
    selectiveProtectionZones,
  };
}

function isIsolatedGuidanceCrossingZone(zone, selectedRows) {
  if (
    !GUIDANCE_CLASSIFICATIONS.has(zone.classification) ||
    zone.geometryType !== 'LineString' ||
    !Array.isArray(zone.vertices) ||
    zone.vertices.length < 2
  ) {
    return false;
  }
  return selectedRows.some(
    (row) =>
      GUIDANCE_CLASSIFICATIONS.has(sourceClassification(row)) &&
      isIsolatedPolylineCrossing(row.vertices, zone.vertices)
  );
}

function isConservativeRunwayEnvelopeSuperseded(zone, selectedRows) {
  if (
    zone.lightType !== 'runway-centerline-continuous-envelope' ||
    zone.geometryMode !== 'continuous-procedural-envelope' ||
    zone.geometryType !== 'LineString' ||
    !Array.isArray(zone.vertices) ||
    zone.vertices.length < 2
  ) {
    return false;
  }
  return selectedRows.some(
    (row) =>
      TARGET_CLASSIFICATIONS.has(sourceClassification(row)) &&
      polylineNearLength(row.vertices, zone.vertices) > MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS
  );
}

function isIsolatedPolylineCrossing(left, right) {
  if (!Array.isArray(left) || left.length < 2 || !Array.isArray(right) || right.length < 2) {
    return false;
  }
  const leftOverlap = polylineNearLength(left, right);
  const rightOverlap = polylineNearLength(right, left);
  return (
    polylineToPolylineDistanceMeters(left, right) <= ISOLATED_CROSSING_DISTANCE_METERS &&
    leftOverlap <= MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS &&
    rightOverlap <= MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS
  );
}

function polylineNearLength(source, target) {
  const distances = cumulativeVertexDistances(source);
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength <= 0) return 0;
  const sampleCount = Math.max(2, Math.ceil(totalLength / CROSSING_SAMPLE_INTERVAL_METERS) + 1);
  const interval = totalLength / (sampleCount - 1);
  let nearLength = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const point = vertexAtDistance(source, distances, interval * index);
    if (pointToPolylineDistanceMeters(point, target) <= ISOLATED_CROSSING_DISTANCE_METERS) {
      nearLength += interval;
    }
  }
  return nearLength;
}

function sourceClassification(row) {
  return row.sourceClassification ?? row.classification;
}

function consolidateRemovalRows(sourceRows, selectedRows) {
  const parentRows = new Map(sourceRows.map((row) => [row.id, row]));
  const sectionsByParent = new Map();
  const rows = [];

  for (const row of selectedRows) {
    if (
      !row.sourceParentRowId ||
      !Number.isFinite(row.sourceRangeStartMeters) ||
      !Number.isFinite(row.sourceRangeEndMeters)
    ) {
      rows.push(row);
      continue;
    }
    const sections = sectionsByParent.get(row.sourceParentRowId) ?? [];
    sections.push({
      start: row.sourceRangeStartMeters,
      end: row.sourceRangeEndMeters,
      member: row,
    });
    sectionsByParent.set(row.sourceParentRowId, sections);
  }

  for (const [parentId, sections] of sectionsByParent) {
    const parent = parentRows.get(parentId);
    if (!parent?.vertices?.length) {
      rows.push(...sections.map((section) => section.member));
      continue;
    }

    const groups = sections
      .sort((left, right) => left.start - right.start)
      .reduce((result, section) => {
        const previous = result.at(-1);
        if (!previous || section.start > previous.end + 0.05) {
          result.push({ start: section.start, end: section.end, members: [section.member] });
        } else {
          previous.end = Math.max(previous.end, section.end);
          previous.members.push(section.member);
        }
        return result;
      }, []);
    const distances = cumulativeVertexDistances(parent.vertices);

    for (const [index, group] of groups.entries()) {
      if (group.members.length === 1) {
        rows.push({ ...group.members[0], sourceRowIds: [group.members[0].id] });
        continue;
      }
      const vertices = sliceVerticesByDistance(parent.vertices, distances, group.start, group.end);
      vertices[0] = group.members[0].vertices[0];
      vertices[vertices.length - 1] = group.members.at(-1).vertices.at(-1);
      rows.push({
        ...parent,
        id: `${parent.id}:selected-sections:${index}`,
        sourceRowIds: group.members.map((member) => member.id),
        sourceParentRowId: parent.id,
        sourceRangeStartMeters: group.start,
        sourceRangeEndMeters: group.end,
        sourceGeometryDerived: 'merged-source-row-subsections',
        sourceInstanceIds: [
          ...new Set(group.members.flatMap((member) => member.sourceInstanceIds ?? [])),
        ],
        vertices,
      });
    }
  }

  return rows;
}

function selectiveTargetMustKeepZones(data, selectedRows, selectedSourceInstanceIds) {
  const selectedRowIds = new Set(selectedRows.map((row) => row.id));
  const selectedSectionsByParent = new Map();
  for (const row of selectedRows) {
    if (
      !row.sourceParentRowId ||
      !Number.isFinite(row.sourceRangeStartMeters) ||
      !Number.isFinite(row.sourceRangeEndMeters)
    ) {
      continue;
    }
    const sections = selectedSectionsByParent.get(row.sourceParentRowId) ?? [];
    sections.push({ start: row.sourceRangeStartMeters, end: row.sourceRangeEndMeters });
    selectedSectionsByParent.set(row.sourceParentRowId, sections);
  }
  const zones = [];

  for (const instance of data.instances ?? []) {
    if (
      !TARGET_CLASSIFICATIONS.has(instance.classification) ||
      selectedSourceInstanceIds.has(instance.id) ||
      !Number.isFinite(instance.lat) ||
      !Number.isFinite(instance.lon)
    ) {
      continue;
    }
    zones.push({
      id: `selective-instance:${instance.id}`,
      sourceId: instance.id,
      sourceFile: instance.sourceFile,
      sourceType: instance.sourceType,
      classification: instance.classification,
      geometryType: 'Point',
      point: { lat: instance.lat, lon: instance.lon },
      clearanceMeters: 0.25,
      reason: 'target simulator light not selected by division matching',
    });
  }

  for (const row of data.lightRows ?? []) {
    if (
      selectedRowIds.has(row.id) ||
      !TARGET_CLASSIFICATIONS.has(row.classification) ||
      !Array.isArray(row.vertices) ||
      row.vertices.length === 0
    ) {
      continue;
    }
    const selectedSections = selectedSectionsByParent.get(row.id);
    const protectedSegments = selectedSections
      ? unselectedRowSegments(row.vertices, selectedSections)
      : [row.vertices];
    for (const [index, vertices] of protectedSegments.entries()) {
      if (vertices.length === 0) continue;
      zones.push({
        id: `selective-row:${row.id}:${index}`,
        sourceId: row.id,
        sourceFile: row.sourceFile,
        sourceType: row.sourceType,
        classification: row.classification,
        geometryType: vertices.length === 1 ? 'Point' : 'LineString',
        ...(vertices.length === 1 ? { point: vertices[0] } : { vertices }),
        clearanceMeters: 0.25,
        reason: selectedSections
          ? 'source row section not selected by division matching'
          : 'target simulator row not selected by division matching',
      });
    }
  }

  return zones;
}

function unselectedRowSegments(vertices, selectedSections) {
  const distances = cumulativeVertexDistances(vertices);
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength <= 0.05) return [vertices];

  const merged = [...selectedSections]
    .map((section) => ({
      start: Math.max(0, section.start - SECTION_PROTECTION_BOUNDARY_GAP_METERS),
      end: Math.min(totalLength, section.end + SECTION_PROTECTION_BOUNDARY_GAP_METERS),
    }))
    .sort((left, right) => left.start - right.start)
    .reduce((result, section) => {
      const previous = result.at(-1);
      if (!previous || section.start > previous.end) result.push(section);
      else previous.end = Math.max(previous.end, section.end);
      return result;
    }, []);

  const ranges = [];
  let cursor = 0;
  for (const section of merged) {
    if (section.start - cursor > 0.05) ranges.push({ start: cursor, end: section.start });
    cursor = Math.max(cursor, section.end);
  }
  if (totalLength - cursor > 0.05) ranges.push({ start: cursor, end: totalLength });

  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Separate slicing and empty-segment rejection make the geometry invariant explicit.
  return ranges
    .map((range) => sliceVerticesByDistance(vertices, distances, range.start, range.end))
    .filter((segment) => segment.length > 0);
}

function cumulativeVertexDistances(vertices) {
  const distances = [0];
  for (let index = 1; index < vertices.length; index += 1) {
    distances.push(
      distances.at(-1) + haversineDistanceMeters(vertices[index - 1], vertices[index])
    );
  }
  return distances;
}

function sliceVerticesByDistance(vertices, distances, start, end) {
  const sliced = [vertexAtDistance(vertices, distances, start)];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    if (distances[index] > start && distances[index] < end) sliced.push(vertices[index]);
  }
  sliced.push(vertexAtDistance(vertices, distances, end));
  return sliced.filter(
    (vertex, index) => index === 0 || haversineDistanceMeters(sliced[index - 1], vertex) > 0.01
  );
}

function vertexAtDistance(vertices, distances, target) {
  if (target <= 0) return vertices[0];
  if (target >= distances.at(-1)) return vertices.at(-1);

  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  const segmentStart = distances[index - 1];
  const segmentLength = Math.max(distances[index] - segmentStart, 0.000001);
  const ratio = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  return {
    lat: vertices[index - 1].lat + (vertices[index].lat - vertices[index - 1].lat) * ratio,
    lon: vertices[index - 1].lon + (vertices[index].lon - vertices[index - 1].lon) * ratio,
  };
}

function emptyRemovalGeometry() {
  return {
    exclusionCandidates: [],
    removalPolygons: [],
    protectionConflicts: [],
    selectiveProtectionZones: [],
    performance: {
      groupingMilliseconds: 0,
      polygonBuildMilliseconds: 0,
      instanceBuildMilliseconds: 0,
      conflictFilterMilliseconds: 0,
    },
  };
}

function generateDraftXml({ icao, altitude, matches, removalPolygons }) {
  const polygons = [];
  let groupIndex = 1;
  const baseAltitude = Number.isFinite(altitude) ? altitude : 0;

  for (const match of matches) {
    const coordinates = rowCoordinates(match.row);
    if (coordinates.length < 4) continue;
    polygons.push(
      polygonXml(
        String(match.division.id),
        groupIndex,
        baseAltitude,
        coordinates,
        `${icao}:${match.division.id}:${match.row.id}`
      )
    );
    groupIndex += 1;
  }

  for (const removal of removalPolygons) {
    if (!Array.isArray(removal.coordinates) || removal.coordinates.length < 4) continue;
    polygons.push(
      polygonXml(
        'remove',
        groupIndex,
        baseAltitude,
        removal.coordinates,
        `${icao}:remove:${removal.id}`
      )
    );
    groupIndex += 1;
  }

  return `<?xml version="1.0"?>\n<FSData version="9.0">\n${polygons.join('\n')}\n</FSData>`;
}

function uniqueDivisionItems(items) {
  const byDivision = new Map();
  for (const item of items) {
    const key = String(item.division?.id ?? '');
    if (!byDivision.has(key)) byDivision.set(key, item);
  }
  return [...byDivision.values()];
}

function polygonXml(displayName, groupIndex, altitude, coordinates, guidSeed) {
  const vertices = coordinates
    .slice(0, -1)
    .map(
      ([lon, lat]) =>
        `\t\t<Vertex lat="${Number(lat).toFixed(14)}" lon="${Number(lon).toFixed(14)}"/>`
    )
    .join('\n');

  return `\t<Polygon version="0.4.0" displayName="${escapeXml(displayName)}" groupIndex="${groupIndex}" altitude="${altitude.toFixed(11)}">
\t\t<Attribute name="UniqueGUID" guid="{359C73E8-06BE-4FB2-ABCB-EC942F7761D0}" type="GUID" value="{${guidForSeed(guidSeed)}}"/>
${vertices}
\t</Polygon>`;
}

function rowCoordinates(row) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  const coordinates = (row.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => [vertex.lon, vertex.lat]);
  if (coordinates.length < 2) return [];

  const open = sameCoordinate(coordinates[0], coordinates.at(-1))
    ? coordinates.slice(0, -1)
    : coordinates;
  if (open.length === 2) {
    open.splice(1, 0, [(open[0][0] + open[1][0]) / 2, (open[0][1] + open[1][1]) / 2]);
  }
  return [...open, open[0]];
}

function buildSimulatorDebugGeoJson(simulatorRows, mergedSimulatorRows) {
  const features = [];

  for (const row of simulatorRows) {
    const coordinates = simulatorRowCoordinates(row);
    if (coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'simulator-source',
        title: String(row.id || 'Extracted simulator row'),
        simulatorType: row.classification || 'unknown',
        sourceFile: row.sourceFile || '',
        confidence: Number.isFinite(row.confidence) ? Math.round(row.confidence * 100) : null,
      },
    });
  }

  for (const row of mergedSimulatorRows) {
    const coordinates = simulatorRowCoordinates(row);
    if (coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'simulator-merged',
        title: `Merged matcher geometry (${row.sourceRowCount} source rows)`,
        simulatorType: row.classification || 'unknown',
        sourceRowCount: row.sourceRowCount,
        sourceRowIds: (row.sourceRowIds ?? []).join(', '),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function buildDraftGeoJson(matches, unmatched, removalPolygons, unsafeMatches = []) {
  const features = [];
  const divisionColors = buildDivisionColorMap(matches, unmatched, unsafeMatches);

  for (const removal of removalPolygons) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [removal.coordinates] },
      properties: { featureType: 'removal', title: 'Selective removal area' },
    });
  }

  for (const match of matches) {
    const coordinates = rowCoordinates(match.row).slice(0, -1);
    if (coordinates.length < 2) continue;
    const { id: divisionId, name: divisionName, type: divisionType } = match.division;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'matched',
        divisionId: String(divisionId),
        debugColor: divisionColors.get(String(divisionId)),
        title: divisionName || String(divisionId),
        divisionType,
        simulatorType: match.row.classification,
        matchPercent: Math.round(match.score * 100),
        matchedViaHoldShort: match.row.sourceType === 'bgl-hold-short-topology',
      },
    });
  }

  for (const match of unsafeMatches) {
    const coordinates = rowCoordinates(match.row).slice(0, -1);
    if (coordinates.length < 2) continue;
    const { id: divisionId, name: divisionName, type: divisionType } = match.division;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'unsafe',
        divisionId: String(divisionId),
        debugColor: divisionColors.get(String(divisionId)),
        title: divisionName || String(divisionId),
        divisionType,
        simulatorType: match.row.classification,
        matchPercent: Math.round(match.score * 100),
        reason: 'Simulator geometry matched, but its removal area needs manual review.',
      },
    });
  }

  for (const item of unmatched) {
    const division = item.division;
    const geometry = divisionGeometry(division?.coordinates);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        featureType: 'unmatched',
        divisionId: String(division?.id ?? ''),
        debugColor: divisionColors.get(String(division?.id ?? '')),
        title: division?.name || String(division?.id || 'Unmatched object'),
        divisionType: division?.type || 'unknown',
        reason: item.reason,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function buildDivisionColorMap(matches, unmatched, unsafeMatches) {
  const divisionsById = new Map();
  for (const item of [...matches, ...unsafeMatches, ...unmatched]) {
    const division = item.division;
    if (!division) continue;
    const id = String(division.id ?? '');
    if (!divisionsById.has(id)) divisionsById.set(id, division);
  }

  const nodes = [...divisionsById].map(([id, division]) => ({
    id,
    position: divisionCenter(division.coordinates),
    neighbors: new Set(),
  }));
  const positionedNodes = nodes.filter((node) => node.position);
  for (const node of positionedNodes) {
    // oxlint-disable-next-line react-doctor/js-combine-iterations -- The debug-only node set is small and staged operations keep the scoring pipeline readable.
    const nearest = positionedNodes
      .filter((candidate) => candidate !== node)
      .map((candidate) => ({
        candidate,
        distance: haversineDistanceMeters(node.position, candidate.position),
      }))
      .sort(
        (left, right) =>
          left.distance - right.distance || left.candidate.id.localeCompare(right.candidate.id)
      )
      .slice(0, DEBUG_ID_NEIGHBOR_COUNT);
    for (const { candidate } of nearest) {
      node.neighbors.add(candidate.id);
      candidate.neighbors.add(node.id);
    }
  }

  const usage = new Map(DEBUG_ID_COLORS.map((color) => [color, 0]));
  const colors = new Map();
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
  const orderedNodes = [...nodes].sort(
    (left, right) => right.neighbors.size - left.neighbors.size || left.id.localeCompare(right.id)
  );

  for (const node of orderedNodes) {
    // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Each node has at most DEBUG_ID_NEIGHBOR_COUNT neighbors, making this a bounded tiny pass.
    const neighborColors = [...node.neighbors].map((id) => colors.get(id)).filter(Boolean);
    const startIndex = stableHash(node.id) % DEBUG_ID_COLORS.length;
    // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
    const color = [...DEBUG_ID_COLORS].sort((left, right) => {
      const rightScore = debugColorScore(right, neighborColors, usage, startIndex);
      const leftScore = debugColorScore(left, neighborColors, usage, startIndex);
      return rightScore - leftScore;
    })[0];
    colors.set(node.id, color);
    usage.set(color, usage.get(color) + 1);
  }

  return colors;
}

function divisionCenter(value) {
  const coordinates = (Array.isArray(value) ? value : value ? [value] : []).filter(
    (coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng)
  );
  if (coordinates.length === 0) return null;
  return {
    lat: coordinates.reduce((sum, coordinate) => sum + coordinate.lat, 0) / coordinates.length,
    lon: coordinates.reduce((sum, coordinate) => sum + coordinate.lng, 0) / coordinates.length,
  };
}

function debugColorScore(color, neighborColors, usage, startIndex) {
  const separation = neighborColors.length
    ? Math.min(...neighborColors.map((neighborColor) => rgbDistance(color, neighborColor)))
    : 0;
  const paletteIndex = DEBUG_ID_COLORS.indexOf(color);
  const preference = (paletteIndex - startIndex + DEBUG_ID_COLORS.length) % DEBUG_ID_COLORS.length;
  return separation - usage.get(color) * 45 - preference * 0.01;
}

function rgbDistance(left, right) {
  const leftRgb = hexToRgb(left);
  const rightRgb = hexToRgb(right);
  return Math.hypot(
    leftRgb.red - rightRgb.red,
    leftRgb.green - rightRgb.green,
    leftRgb.blue - rightRgb.blue
  );
}

function hexToRgb(color) {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
}

function stableHash(value) {
  const text = String(value ?? 'unassigned');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function simulatorRowCoordinates(row) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  return (row.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => [vertex.lon, vertex.lat]);
}

function divisionGeometry(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  const coordinates = values
    .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng))
    .map((coordinate) => [coordinate.lng, coordinate.lat]);
  if (coordinates.length >= 2) return { type: 'LineString', coordinates };
  if (coordinates.length === 1) return { type: 'Point', coordinates: coordinates[0] };
  return null;
}

function sameCoordinate(left, right) {
  return Math.abs(left[0] - right[0]) < 1e-12 && Math.abs(left[1] - right[1]) < 1e-12;
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function guidForSeed(seed) {
  const words = [2166136261, 2246822507, 3266489909, 668265263];
  for (let index = 0; index < String(seed).length; index += 1) {
    const code = String(seed).charCodeAt(index);
    for (let word = 0; word < words.length; word += 1) {
      words[word] = Math.imul(words[word] ^ (code + word * 31), 16777619) >>> 0;
    }
  }
  const hex = words
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
