/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-set-map-lookups -- Removal geometry uses explicit provenance stages and tiny bounded membership lists; preserving those semantics is safer than loop fusion. */

import { generateRemovalGeometry } from '../draft-generator/extractor/extract.js';
import { haversineDistanceMeters } from '../draft-generator/extractor/geo.js';
import { generateRemovalGeometryForMatches } from '../draft-generator/draft-output.js';

const TARGET_CLASSIFICATIONS = new Set(['stopbar', 'lead-on', 'taxi-centerline']);
const DEFAULT_SIZES = { library: 3, vfx: 3, simprop: 8, lightrow: 2 };

export function buildMsfsRemovalContext(data) {
  return {
    version: 1,
    lightRows: (data?.lightRows ?? []).filter((row) =>
      TARGET_CLASSIFICATIONS.has(row.classification)
    ),
    instances: (data?.instances ?? []).filter((instance) =>
      TARGET_CLASSIFICATIONS.has(instance.classification)
    ),
    mustKeepZones: data?.mustKeepZones ?? [],
  };
}

export function buildSelectedMsfsRemovals(context, requestedSelections) {
  const selections = normalizeSelections(requestedSelections);
  const selected = new Set(selections.map((selection) => selection.sourceId));
  const selectedRowTargets = [];
  const lightRows = (context?.lightRows ?? []).flatMap((row) => {
    const selection = selections.find(({ sourceId }) =>
      [row.id, ...(row.sourceRowIds ?? [])].some((id) => sourceId === String(id))
    );
    if (!selection) return [];
    const selectedRow = rowForSelection(row, selection);
    if (selectedRow) {
      selectedRowTargets.push({
        selectionSourceId: selection.sourceId,
        sourceIds: new Set([row.id, ...(row.sourceRowIds ?? [])].map(String)),
      });
    }
    return selectedRow ? [selectedRow] : [];
  });
  const instances = (context?.instances ?? []).filter((instance) =>
    selected.has(String(instance.id))
  );
  const selectedRowIds = new Set(lightRows.map((row) => String(row.id)));
  const selectedInstanceIds = new Set(instances.map((instance) => String(instance.id)));
  const selectiveMustKeepZones = [
    ...(context?.lightRows ?? [])
      .filter(
        (row) =>
          !selectedRowIds.has(String(row.id)) &&
          row.removalEligible !== false &&
          Array.isArray(row.vertices) &&
          row.vertices.length > 0
      )
      .map((row) => ({
        id: `editor-selective-row:${row.id}`,
        sourceId: row.id,
        sourceFile: row.sourceFile,
        sourceType: row.sourceType,
        classification: row.classification,
        geometryType: row.vertices.length === 1 ? 'Point' : 'LineString',
        ...(row.vertices.length === 1 ? { point: row.vertices[0] } : { vertices: row.vertices }),
        clearanceMeters: 0.25,
        reason: 'target BGL light row not selected for removal in the editor',
      })),
    ...(context?.instances ?? [])
      .filter(
        (instance) =>
          !selectedInstanceIds.has(String(instance.id)) &&
          Number.isFinite(instance.lat) &&
          Number.isFinite(instance.lon)
      )
      .map((instance) => ({
        id: `editor-selective-instance:${instance.id}`,
        sourceId: instance.id,
        sourceFile: instance.sourceFile,
        sourceType: instance.sourceType,
        classification: instance.classification,
        geometryType: 'Point',
        point: { lat: instance.lat, lon: instance.lon },
        clearanceMeters: 0.25,
        reason: 'target BGL light fixture not selected for removal in the editor',
      })),
  ];
  const geometry =
    lightRows.length > 0 && instances.length === 0
      ? generateRemovalGeometryForMatches(
          context,
          lightRows.map((row) => ({ row })),
          lightRows
        )
      : generateRemovalGeometry(instances, lightRows, DEFAULT_SIZES, [
          ...(context?.mustKeepZones ?? []),
          ...selectiveMustKeepZones,
        ]);
  const removals = [
    ...geometry.removalPolygons.map((polygon) => {
      const polygonSourceIds = (polygon.sourceRowIds ?? [polygon.sourceRowId]).map(String);
      const aliases = selectedRowTargets
        .filter((target) => polygonSourceIds.some((id) => target.sourceIds.has(id)))
        .map((target) => target.selectionSourceId);
      const sourceIds = [...new Set([...polygonSourceIds, ...aliases])];
      return {
        id: `msfs-source:${polygon.id}`,
        coordinates: polygon.coordinates,
        sourceIds,
        origin: 'msfs-manual',
        mustKeepZoneIds: polygon.mustKeepZoneIds ?? [],
        selections: selections.filter((selection) => sourceIds.includes(selection.sourceId)),
      };
    }),
    ...geometry.exclusionCandidates.map((candidate) => ({
      id: `msfs-source:${candidate.id}`,
      coordinates: candidate.coordinates,
      sourceIds: [String(candidate.sourceId)],
      origin: 'msfs-manual',
      mustKeepZoneIds: candidate.mustKeepZoneIds ?? [],
      selections: selections.filter(
        (selection) => selection.sourceId === String(candidate.sourceId)
      ),
    })),
  ];
  const generatedSourceIds = [...new Set(removals.flatMap((removal) => removal.sourceIds))];
  const acceptedSourceIds = selections
    .map((selection) => selection.sourceId)
    .filter((sourceId) => generatedSourceIds.includes(sourceId));
  return {
    removals,
    acceptedSourceIds,
    generatedSourceIds,
    rejectedSourceIds: [...selected].filter((id) => !acceptedSourceIds.includes(id)),
    conflicts: geometry.protectionConflicts,
  };
}

function normalizeSelections(values) {
  const bySourceId = new Map();
  for (const value of values ?? []) {
    const sourceId = String(typeof value === 'string' ? value : (value?.sourceId ?? '')).trim();
    if (!sourceId) continue;
    const start = Number(value?.rangeStartMeters);
    const end = Number(value?.rangeEndMeters);
    const selection =
      Number.isFinite(start) && Number.isFinite(end)
        ? {
            sourceId,
            rangeStartMeters: Math.min(start, end),
            rangeEndMeters: Math.max(start, end),
          }
        : { sourceId };
    const existing = bySourceId.get(sourceId);
    if (!existing || !('rangeStartMeters' in selection)) {
      bySourceId.set(sourceId, selection);
    } else if ('rangeStartMeters' in existing) {
      bySourceId.set(sourceId, {
        sourceId,
        rangeStartMeters: Math.min(existing.rangeStartMeters, selection.rangeStartMeters),
        rangeEndMeters: Math.max(existing.rangeEndMeters, selection.rangeEndMeters),
      });
    }
  }
  return [...bySourceId.values()];
}

function rowForSelection(row, selection) {
  if (!('rangeStartMeters' in selection)) return row;
  const vertices = sliceVerticesByDistance(
    row.vertices,
    selection.rangeStartMeters,
    selection.rangeEndMeters
  );
  if (vertices.length < 2) return null;
  return {
    ...row,
    vertices,
    sourceRangeStartMeters: selection.rangeStartMeters,
    sourceRangeEndMeters: selection.rangeEndMeters,
    sourceGeometryDerived: 'editor-selected-source-section',
  };
}

function sliceVerticesByDistance(vertices, requestedStart, requestedEnd) {
  if (!Array.isArray(vertices) || vertices.length < 2) return [];
  const distances = [0];
  for (let index = 1; index < vertices.length; index += 1) {
    distances.push(
      distances.at(-1) + haversineDistanceMeters(vertices[index - 1], vertices[index])
    );
  }
  const total = distances.at(-1);
  const start = Math.max(0, Math.min(total, requestedStart));
  const end = Math.max(start, Math.min(total, requestedEnd));
  if (end - start < 0.05) return [];
  const result = [pointAtDistance(vertices, distances, start)];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    if (distances[index] > start && distances[index] < end) result.push(vertices[index]);
  }
  result.push(pointAtDistance(vertices, distances, end));
  return result;
}

function pointAtDistance(vertices, distances, target) {
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index] < target) continue;
    const span = Math.max(distances[index] - distances[index - 1], Number.EPSILON);
    const ratio = (target - distances[index - 1]) / span;
    return {
      lat: vertices[index - 1].lat + (vertices[index].lat - vertices[index - 1].lat) * ratio,
      lon: vertices[index - 1].lon + (vertices[index].lon - vertices[index - 1].lon) * ratio,
    };
  }
  return vertices.at(-1);
}
