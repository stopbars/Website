/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-set-map-lookups -- Removal geometry uses explicit provenance stages and tiny bounded membership lists; preserving those semantics is safer than loop fusion. */

import { generateRemovalGeometry } from '../draft-generator/extractor/extract.js';
import { haversineDistanceMeters } from '../draft-generator/extractor/geo.js';
import { generateRemovalGeometryForMatches } from '../draft-generator/draft-output.js';
import { consolidateCoLocatedSimulatorRows } from '../draft-generator/matching.js';
import { nearestPointOnLine } from './editor-geometry.js';
import {
  matchSnappedReference,
  nearbyRemovalBindingFromExtendedReference,
} from './editor-snapping.js';

const TARGET_CLASSIFICATIONS = new Set(['stopbar', 'lead-on', 'taxi-centerline']);
const DEFAULT_SIZES = { library: 3, vfx: 3, simprop: 8, lightrow: 2 };

export function buildMsfsRemovalContext(data) {
  const lightRows = (data?.lightRows ?? []).filter((row) =>
    TARGET_CLASSIFICATIONS.has(row.classification)
  );
  const sourceInstanceIds = new Set(lightRows.flatMap((row) => row.sourceInstanceIds ?? []));
  return normalizeMsfsRemovalContext({
    version: 1,
    lightRows,
    instances: (data?.instances ?? []).filter(
      (instance) =>
        sourceInstanceIds.has(instance.id) && TARGET_CLASSIFICATIONS.has(instance.classification)
    ),
    mustKeepZones: data?.mustKeepZones ?? [],
  });
}

export function normalizeMsfsRemovalContext(context) {
  if (!context || context.version >= 4) return context;
  if (context.version === 3 && hasIncompleteMergedCompiledTargets(context.lightRows)) {
    return null;
  }
  const lightRows =
    context.version >= 2
      ? (context.lightRows ?? [])
      : consolidateCoLocatedSimulatorRows(context.lightRows ?? []).map((row) =>
          row.removalSourceType ? { ...row, sourceType: row.removalSourceType } : row
        );
  return {
    ...context,
    version: 4,
    lightRows,
    instances: context.instances ?? [],
  };
}

function hasIncompleteMergedCompiledTargets(lightRows) {
  return (lightRows ?? []).some(
    (row) =>
      row.sourceType === 'bgl-airport-light-row' &&
      (row.sourceRowIds?.length ?? 0) > 1 &&
      (row.compiledLightPlacement === 'spacing' || row.removalTargetSampling === 'spacing') &&
      !row.removalTargetSourceRows?.length
  );
}

export function buildSelectedMsfsRemovals(
  context,
  requestedSelections,
  requestedKeepSelections = []
) {
  const selections = normalizeSelections(requestedSelections);
  const keepSelections = normalizeSelections(requestedKeepSelections);
  const instancesById = new Map(
    (context?.instances ?? []).map((instance) => [String(instance.id), instance])
  );
  const selected = new Set(selections.map((selection) => selection.sourceId));
  const matched = new Set();
  const selectionsBySourceId = new Map();
  for (const selection of selections) {
    const existing = selectionsBySourceId.get(selection.sourceId);
    if (existing) existing.push(selection);
    else selectionsBySourceId.set(selection.sourceId, [selection]);
  }
  const selectedRowTargets = [];
  const lightRows = (context?.lightRows ?? []).flatMap((row) => {
    const rowSelections = [row.id, ...(row.sourceRowIds ?? [])].flatMap(
      (id) => selectionsBySourceId.get(String(id)) ?? []
    );
    return rowSelections.flatMap((selection, index) => {
      const selectedRow = rowForSelection(row, selection, index, instancesById);
      if (!selectedRow) return [];
      matched.add(selection.sourceId);
      selectedRowTargets.push({
        selectedRowId: String(selectedRow.id),
        selectionSourceId: selection.sourceId,
        selection,
        sourceIds: new Set([row.id, ...(row.sourceRowIds ?? [])].map(String)),
      });
      return [selectedRow];
    });
  });
  const explicitKeepZones = editorKeepZones(context, keepSelections, instancesById);
  const generationContext =
    explicitKeepZones.length > 0
      ? {
          ...context,
          mustKeepZones: [...(context?.mustKeepZones ?? []), ...explicitKeepZones],
        }
      : context;
  const geometry =
    lightRows.length > 0
      ? generateRemovalGeometryForMatches(
          generationContext,
          lightRows.map((row) => ({ row })),
          lightRows
        )
      : generateRemovalGeometry([], [], DEFAULT_SIZES, generationContext?.mustKeepZones ?? []);
  const removals = [
    ...geometry.removalPolygons.map((polygon) => {
      const polygonSourceIds = (polygon.sourceRowIds ?? [polygon.sourceRowId]).map(String);
      const targets = selectedRowTargets.filter(
        (target) =>
          polygonSourceIds.includes(target.selectedRowId) ||
          polygonSourceIds.some((id) => target.sourceIds.has(id))
      );
      const sourceIds = [
        ...new Set([...polygonSourceIds, ...targets.map((target) => target.selectionSourceId)]),
      ];
      return {
        id: `msfs-source:${polygon.id}`,
        coordinates: polygon.coordinates,
        sourceIds,
        origin: 'msfs-manual',
        mustKeepZoneIds: polygon.mustKeepZoneIds ?? [],
        targetLightPoints: polygon.targetLightPoints ?? [],
        removalMode: polygon.removalMode ?? 'targets',
        selections:
          targets.length > 0
            ? targets.map((target) => target.selection)
            : selections.filter((selection) => sourceIds.includes(selection.sourceId)),
      };
    }),
    ...geometry.exclusionCandidates.map((candidate) => ({
      id: `msfs-source:${candidate.id}`,
      coordinates: candidate.coordinates,
      sourceIds: [String(candidate.sourceId)],
      origin: 'msfs-manual',
      mustKeepZoneIds: candidate.mustKeepZoneIds ?? [],
      exclusionFlags: candidate.exclusionFlags ?? {},
      selections: selections.filter(
        (selection) => selection.sourceId === String(candidate.sourceId)
      ),
    })),
  ];
  if (keepSelections.length > 0) {
    const keepSourceIds = [...new Set(keepSelections.map((selection) => selection.sourceId))];
    removals.push({
      id: `msfs-keep:${keepSourceIds.slice().sort().join(':')}`,
      coordinates: [],
      sourceIds: keepSourceIds,
      origin: 'msfs-manual',
      selections: [],
      keepSelections,
    });
  }
  const generatedSourceIds = [...new Set(removals.flatMap((removal) => removal.sourceIds))];
  const acceptedSourceIds = selections
    .map((selection) => selection.sourceId)
    .filter((sourceId) => matched.has(sourceId));
  return {
    removals,
    acceptedSourceIds,
    generatedSourceIds,
    rejectedSourceIds: [...selected].filter((id) => !acceptedSourceIds.includes(id)),
    conflicts: geometry.protectionConflicts,
  };
}

function editorKeepZones(context, keepSelections, instancesById) {
  if (keepSelections.length === 0) return [];
  const selectionsBySourceId = new Map();
  for (const selection of keepSelections) {
    const existing = selectionsBySourceId.get(selection.sourceId) ?? [];
    existing.push(selection);
    selectionsBySourceId.set(selection.sourceId, existing);
  }
  const zones = [];
  for (const row of context?.lightRows ?? []) {
    const aliases = [row.id, ...(row.sourceRowIds ?? [])].map(String);
    const rowSelections = aliases.flatMap((id) => selectionsBySourceId.get(id) ?? []);
    for (const [index, selection] of rowSelections.entries()) {
      const keptRow = rowForSelection(row, selection, index, instancesById);
      const vertices = keptRow?.vertices ?? [];
      if (vertices.length === 0) continue;
      zones.push({
        id: `editor-keep:${selection.sourceId}:${index}`,
        sourceId: selection.sourceId,
        sourceFile: row.sourceFile,
        sourceType: row.sourceType,
        classification: row.classification,
        geometryType: vertices.length === 1 ? 'Point' : 'LineString',
        ...(vertices.length === 1 ? { point: vertices[0] } : { vertices }),
        clearanceMeters: 0.35,
        explicitEditorKeep: true,
        reason: 'light-row section explicitly kept in the contribution editor',
      });
    }
  }
  return zones;
}

export function buildImportedMsfsRemovalMigration(context, objects, importedRemovals) {
  const features = removalReferenceFeatures(context);
  const bindingsByPartId = [];
  const records = (objects ?? []).map((object) => {
    const exactMatch = matchSnappedReference(object.coordinates, features, 1.5, {
      allowDerived: true,
    });
    const bindings = [...removalBindingsFromMatch(exactMatch)];
    const sourceIds = new Set(bindings.map((binding) => canonicalSourceId(binding.sourceId)));
    if (bindings.length === 0) {
      for (const feature of features) {
        const binding = nearbyRemovalBindingFromExtendedReference(object.coordinates, feature, 1.5);
        const sourceId = canonicalSourceId(binding?.sourceId);
        if (!binding || !sourceId || sourceIds.has(sourceId)) continue;
        sourceIds.add(sourceId);
        bindings.push(binding);
      }
    }
    if (bindings.length > 0) {
      bindingsByPartId.push({ partId: object.partId, bindings });
    }
    return { object, bindings };
  });
  const manualSelections = (importedRemovals ?? [])
    .filter((removal) => removal.importedOrigin === 'msfs-manual')
    .flatMap((removal) => removal.selections ?? []);
  const keepSelections = (importedRemovals ?? []).flatMap((removal) => removal.keepSelections ?? []);
  const availableSourceIds = new Set(
    (context?.lightRows ?? []).flatMap((row) => [row.id, ...(row.sourceRowIds ?? [])]).map(String)
  );
  if ([...manualSelections, ...keepSelections].some((selection) =>
    !availableSourceIds.has(String(selection.sourceId))
  )) {
    throw new Error('Connect the original scenery package to restore saved removal and keep selections.');
  }
  const generated = buildSelectedMsfsRemovals(
    context,
    [...records.flatMap((record) => record.bindings), ...manualSelections],
    keepSelections
  );
  const removalIds = [];
  for (const removal of importedRemovals ?? []) {
    const removalId = String(removal?.id ?? '').trim();
    if (removalId) removalIds.push(removalId);
  }
  return {
    ...generated,
    bindingsByPartId,
    removalIds,
  };
}

function removalReferenceFeatures(context) {
  return (context?.lightRows ?? []).flatMap((row) => {
    const coordinates = (row.vertices ?? [])
      .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
      .map((vertex) => [vertex.lon, vertex.lat]);
    if (coordinates.length < 2) return [];
    return [
      {
        id: String(row.id),
        geometry: { type: 'LineString', coordinates },
        properties: {
          sourceId: String(row.id),
          sourceType: row.sourceType,
          snapCategory: 'light-rows',
          removable: row.removalEligible !== false,
        },
      },
    ];
  });
}

function removalBindingsFromMatch(match) {
  if (match?.bindings?.length) return match.bindings.filter(Boolean);
  return match?.binding ? [match.binding] : [];
}

function canonicalSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const marker = sourceId.indexOf(':division-section:');
  return marker > 0 ? sourceId.slice(0, marker) : sourceId;
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
    const existing = bySourceId.get(sourceId) ?? [];
    bySourceId.set(sourceId, [...existing, selection]);
  }
  return [...bySourceId.entries()].flatMap(([sourceId, sourceSelections]) => {
    if (sourceSelections.some((selection) => !('rangeStartMeters' in selection))) {
      return [{ sourceId }];
    }
    const merged = [];
    for (const selection of sourceSelections.sort(
      (left, right) => left.rangeStartMeters - right.rangeStartMeters
    )) {
      const previous = merged.at(-1);
      if (!previous || selection.rangeStartMeters > previous.rangeEndMeters + 0.05) {
        merged.push({ ...selection });
      } else {
        previous.rangeEndMeters = Math.max(previous.rangeEndMeters, selection.rangeEndMeters);
      }
    }
    return merged;
  });
}

function rowForSelection(row, selection, index, instancesById) {
  if (!('rangeStartMeters' in selection)) return row;
  const rowLengthMeters = polylineLengthMeters(row.vertices);
  const relativeStartMeters = Math.max(0, Math.min(rowLengthMeters, selection.rangeStartMeters));
  const relativeEndMeters = Math.max(
    relativeStartMeters,
    Math.min(rowLengthMeters, selection.rangeEndMeters)
  );
  const parentOffsetMeters = Number(row.sourceRangeStartMeters) || 0;
  const sourceRangeStartMeters = Number.isFinite(row.sourceRangeStartMeters)
    ? row.sourceRangeStartMeters + relativeStartMeters
    : relativeStartMeters;
  const sourceRangeEndMeters = Number.isFinite(row.sourceRangeStartMeters)
    ? row.sourceRangeStartMeters + relativeEndMeters
    : relativeEndMeters;
  const vertices = sliceVerticesByDistance(row.vertices, relativeStartMeters, relativeEndMeters);
  if (vertices.length < 2) return null;
  return {
    ...row,
    id: `${row.id}:editor-section:${index}`,
    sourceParentRowId: row.sourceParentRowId ?? row.id,
    vertices,
    sourceRangeStartMeters,
    sourceRangeEndMeters,
    sourceParentLengthMeters: Number.isFinite(row.sourceParentLengthMeters)
      ? row.sourceParentLengthMeters
      : parentOffsetMeters + rowLengthMeters,
    sourceGeometryDerived: 'editor-selected-source-section',
    sourceInstanceIds: sourceInstanceIdsForSelection(row, selection, instancesById, vertices),
  };
}

function polylineLengthMeters(vertices) {
  if (!Array.isArray(vertices) || vertices.length < 2) return 0;
  let length = 0;
  for (let index = 1; index < vertices.length; index += 1) {
    length += haversineDistanceMeters(vertices[index - 1], vertices[index]);
  }
  return length;
}

function sourceInstanceIdsForSelection(row, selection, instancesById, selectedVertices) {
  if (!Array.isArray(row.sourceInstanceIds) || row.sourceInstanceIds.length === 0) return [];
  const start = Math.min(selection.rangeStartMeters, selection.rangeEndMeters) - 0.05;
  const end = Math.max(selection.rangeStartMeters, selection.rangeEndMeters) + 0.05;
  if (row.sourceInstanceIds.length === row.vertices?.length) {
    const selectedIds = [];
    let alongMeters = 0;
    let aligned = true;
    for (let index = 0; index < row.sourceInstanceIds.length; index += 1) {
      const instanceId = row.sourceInstanceIds[index];
      const instance = instancesById.get(String(instanceId));
      const vertex = row.vertices[index];
      if (
        !Number.isFinite(instance?.lat) ||
        !Number.isFinite(instance?.lon) ||
        haversineDistanceMeters(instance, vertex) > 1
      ) {
        aligned = false;
        break;
      }
      if (alongMeters >= start && alongMeters <= end) selectedIds.push(instanceId);
      const next = row.vertices[index + 1];
      if (next) alongMeters += haversineDistanceMeters(vertex, next);
    }
    if (aligned) return selectedIds;
  }

  const coordinates = (selectedVertices ?? []).map((vertex) => [vertex.lon, vertex.lat]);
  if (coordinates.length < 2) return [];
  return row.sourceInstanceIds.filter((instanceId) => {
    const instance = instancesById.get(String(instanceId));
    if (!Number.isFinite(instance?.lat) || !Number.isFinite(instance?.lon)) return false;
    const projection = nearestPointOnLine([instance.lon, instance.lat], coordinates);
    return projection?.distanceMeters <= 1;
  });
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
