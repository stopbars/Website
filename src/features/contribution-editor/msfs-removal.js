/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-set-map-lookups -- Removal geometry uses explicit provenance stages and tiny bounded membership lists; preserving those semantics is safer than loop fusion. */

import { generateRemovalGeometry } from '../draft-generator/extractor/extract.js';
import { msfsColorPresetClassification, normalizeMsfsLightRowClassifications } from '../draft-generator/extractor/classify.js';
import { haversineDistanceMeters } from '../draft-generator/extractor/geo.js';
import { generateRemovalGeometryForMatches } from '../draft-generator/draft-output.js';
import { consolidateCoLocatedSimulatorRows } from '../draft-generator/matching.js';
import { lineLengthMeters, nearestPointOnLine } from './editor-geometry.js';
import { mergeIntervals } from './removal-intervals.js';
import { isManualMsfsRemoval } from './msfs-removal-client.js';
import { createRemovalMatchCandidateSearch } from './removal-match-candidates.js';
import {
  matchSnappedReference,
  nearbyRemovalBindingFromExtendedReference,
} from './editor-snapping.js';

const TARGET_CLASSIFICATIONS = new Set(['stopbar', 'lead-on', 'taxi-centerline']);
const DEFAULT_SIZES = { library: 3, vfx: 3, simprop: 8, lightrow: 2 };
const MAX_AUTOMATIC_REMOVAL_GAP_METERS = 5;
const MAX_AUTOMATIC_JUNCTION_GAP_METERS = 10;

export function buildMsfsRemovalContext(data) {
  data = normalizeMsfsLightRowClassifications(data);
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
  if (context?.lightRows?.some((row) =>
    row.removalEligible === false && row.removalTargetSourceRows?.length > 0
  )) return null;
  if (context?.mustKeepZones?.some((zone) =>
    zone.sourceType === 'bgl-airport-light-row' &&
    zone.classification === 'unknown-light' &&
    zone.lightType === 'source-light-row' &&
    zone.explicitEditorKeep !== true &&
    msfsColorPresetClassification(zone.preset) &&
    !(context.lightRows ?? []).some((row) => String(row.id) === String(zone.sourceId))
  )) return null;
  if (!context || context.version >= 5) return context;
  if (context.version >= 2 && hasIncompleteMergedCompiledTargets(context.lightRows)) {
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
    version: 5,
    lightRows,
    instances: context.instances ?? [],
  };
}

function hasIncompleteMergedCompiledTargets(lightRows) {
  return (lightRows ?? []).some(
    (row) =>
      row.sourceType === 'bgl-airport-light-row' &&
      (row.sourceRowIds?.length ?? 0) > 1 &&
      row.sourceRowIds.some((id) =>
        !row.removalTargetSourceRows?.some((sourceRow) => String(sourceRow.id) === String(id))
      )
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
  const records = matchRemovalObjects(context, objects);
  const bindingsByPartId = records
    .filter(({ bindings }) => bindings.length > 0)
    .map(({ object, bindings }) => ({ partId: object.partId, bindings }));
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

export function buildAutomaticMsfsRemovals(context, requestedSelections, keepSelections = [], excludedSourceIds = []) {
  const rowsById = new Map();
  const keptIds = new Set([
    ...keepSelections.map((selection) => canonicalSourceId(selection.sourceId)),
    ...excludedSourceIds.map(canonicalSourceId),
  ]);
  for (const row of context?.lightRows ?? []) {
    const aliases = [row.id, ...(row.sourceRowIds ?? [])].map(canonicalSourceId);
    if (aliases.some((id) => keptIds.has(id))) {
      for (const id of aliases) keptIds.add(id);
    }
    for (const id of aliases) rowsById.set(id, row);
  }
  const groups = new Map();
  for (const selection of normalizeSelections(requestedSelections)) {
    const entries = groups.get(selection.sourceId) ?? [];
    entries.push(selection);
    groups.set(selection.sourceId, entries);
  }
  const selections = [];
  for (const [sourceId, entries] of groups) {
    const row = rowsById.get(canonicalSourceId(sourceId));
    if (!row || row.removalEligible === false || keptIds.has(canonicalSourceId(sourceId))) {
      selections.push(...entries);
      continue;
    }
    const total = lineLengthMeters(row.vertices.map((point) => [point.lon, point.lat]));
    if (!(total > 0)) {
      selections.push(...entries);
      continue;
    }
    const intervals = mergeIntervals(entries.map((selection) => ({
      start: selection.rangeStartMeters ?? 0,
      end: selection.rangeEndMeters ?? total,
    })), 0, total);
    const selectedLength = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
    // Small selections must not expand to consume most of an otherwise unselected row.
    const tolerance = Math.min(MAX_AUTOMATIC_REMOVAL_GAP_METERS, selectedLength / 3);
    const completed = mergeIntervals(intervals, 0, total, MAX_AUTOMATIC_REMOVAL_GAP_METERS);
    if (completed.length === 0) continue;
    if (completed[0].start <= tolerance) completed[0].start = 0;
    if (total - completed.at(-1).end <= tolerance) completed.at(-1).end = total;
    selections.push(...completed.map(({ start, end }) =>
      start === 0 && end === total
        ? { sourceId }
        : { sourceId, rangeStartMeters: start, rangeEndMeters: end }
    ));
  }
  return buildSelectedMsfsRemovals(context, completeAutomaticJunctions(context, selections, keptIds), keepSelections);
}

function completeAutomaticJunctions(context, selections, keptIds) {
  const selected = new Map();
  for (const selection of selections) {
    const id = canonicalSourceId(selection.sourceId);
    const entries = selected.get(id) ?? [];
    entries.push(selection);
    selected.set(id, entries);
  }
  const nodes = new Map();
  const rows = [];
  const nodeFor = (point) => {
    // Compiled path junctions share coordinates; rounding only absorbs serialization noise.
    const key = `${point.lon.toFixed(7)}:${point.lat.toFixed(7)}`;
    if (!nodes.has(key)) nodes.set(key, []);
    return nodes.get(key);
  };
  for (const row of context?.lightRows ?? []) {
    if (row.removalEligible === false || !['taxi-centerline', 'lead-on'].includes(row.classification)) continue;
    const aliases = [row.id, ...(row.sourceRowIds ?? [])].map(canonicalSourceId);
    if (aliases.some(id => keptIds.has(id)) || row.vertices?.length < 2) continue;
    const total = lineLengthMeters(row.vertices.map(p => [p.lon, p.lat]));
    if (!(total > 0)) continue;
    const intervals = mergeIntervals(aliases.flatMap(id => selected.get(id) ?? []).map(s => ({
      start: s.rangeStartMeters ?? 0, end: s.rangeEndMeters ?? total,
    })), 0, total);
    const record = { id: row.id, total, intervals, ends: [nodeFor(row.vertices[0]), nodeFor(row.vertices.at(-1))] };
    rows.push(record);
    record.ends.forEach((node, side) => node.push({ row: record, side }));
  }
  const additions = [];
  for (const origin of rows) {
    if (!origin.intervals.length) continue;
    for (const side of [0, 1]) {
      const edge = side === 0 ? origin.intervals[0].start : origin.intervals.at(-1).end;
      const distance = side === 0 ? edge : origin.total - edge;
      if (distance > MAX_AUTOMATIC_JUNCTION_GAP_METERS) continue;
      const first = { sourceId: origin.id, rangeStartMeters: side === 0 ? 0 : edge,
        rangeEndMeters: side === 0 ? edge : origin.total };
      const pending = [{ node: origin.ends[side], distance, path: distance > 0 ? [first] : [] }];
      const visited = new Map();
      while (pending.length) {
        pending.sort((a, b) => b.distance - a.distance);
        const current = pending.pop();
        if ((visited.get(current.node) ?? Infinity) <= current.distance) continue;
        visited.set(current.node, current.distance);
        for (const { row, side: entrySide } of current.node) {
          if (row === origin) continue;
          const boundary = row.intervals.length
            ? entrySide === 0 ? row.intervals[0].start : row.intervals.at(-1).end
            : entrySide === 0 ? row.total : 0;
          const length = entrySide === 0 ? boundary : row.total - boundary;
          const distance = current.distance + length;
          if (distance > MAX_AUTOMATIC_JUNCTION_GAP_METERS) continue;
          const path = length > 0 ? [...current.path, { sourceId: row.id,
            rangeStartMeters: entrySide === 0 ? 0 : boundary,
            rangeEndMeters: entrySide === 0 ? boundary : row.total }] : current.path;
          if (row.intervals.length) additions.push(...path);
          else pending.push({ node: row.ends[1 - entrySide], distance, path });
        }
      }
    }
  }
  const lengths = new Map(rows.map(row => [String(row.id), row.total]));
  return normalizeSelections([...selections, ...additions]).map(selection =>
    selection.rangeStartMeters === 0 && selection.rangeEndMeters >= lengths.get(selection.sourceId)
      ? { sourceId: selection.sourceId }
      : selection
  );
}

export function buildAutomaticMsfsRemovalRefresh(context, objects, removals, { onProgress } = {}) {
  const manualRemovals = (removals ?? []).filter(isManualMsfsRemoval);
  const manualSourceIds = new Set(
    manualRemovals.flatMap((removal) => [
      ...(removal.sourceIds ?? []),
      ...(removal.selections ?? []).map((selection) => selection.sourceId),
      ...(removal.keepSelections ?? []).map((selection) => selection.sourceId),
    ]).map(canonicalSourceId)
  );
  for (const row of context?.lightRows ?? []) {
    const aliases = [row.id, ...(row.sourceRowIds ?? [])].map(canonicalSourceId);
    if (aliases.some((id) => manualSourceIds.has(id))) {
      for (const id of aliases) manualSourceIds.add(id);
    }
  }
  const records = matchRemovalObjects(context, objects, onProgress).filter(({ object, bindings }) =>
    ![...(object.sourceBindings ?? []), ...bindings].some((binding) =>
      manualSourceIds.has(canonicalSourceId(binding.sourceId))
    )
  );
  const keepSelections = manualRemovals.flatMap((removal) => removal.keepSelections ?? []);
  const instancesById = new Map(
    (context?.instances ?? []).map((instance) => [String(instance.id), instance])
  );
  const generationContext = {
    ...context,
    mustKeepZones: [
      ...(context?.mustKeepZones ?? []),
      ...editorKeepZones(context, keepSelections, instancesById),
    ],
  };
  onProgress?.({ phase: 'building' });
  const generated = buildAutomaticMsfsRemovals(
    generationContext,
    records.flatMap(({ bindings }) => bindings),
    [],
    [...manualSourceIds]
  );
  return {
    ...generated,
    bindingsByPartId: records.map(({ object, bindings }) => ({ partId: object.partId, bindings })),
    removalIds: (removals ?? [])
      .filter((removal) =>
        ['imported', 'msfs-source', 'msfs-auto'].includes(removal.origin) &&
        !isManualMsfsRemoval(removal)
      )
      .map((removal) => String(removal.id)),
  };
}

function matchRemovalObjects(context, objects, onProgress) {
  const features = removalReferenceFeatures(context);
  const candidatesFor = createRemovalMatchCandidateSearch(features);
  let lastProgressAt = -Infinity;
  return (objects ?? []).map((object, index) => {
    const candidates = candidatesFor(object.coordinates);
    const exactMatch = matchSnappedReference(object.coordinates, candidates, 1.5, {
      allowDerived: true,
    });
    const bindings = [...removalBindingsFromMatch(exactMatch)];
    const sourceIds = new Set(bindings.map((binding) => canonicalSourceId(binding.sourceId)));
    for (const feature of candidates) {
      if (sourceIds.has(canonicalSourceId(feature.properties.sourceId))) continue;
      const binding = nearbyRemovalBindingFromExtendedReference(object.coordinates, feature, 1.5);
      const sourceId = canonicalSourceId(binding?.sourceId);
      if (!binding || !sourceId || sourceIds.has(sourceId)) continue;
      sourceIds.add(sourceId);
      bindings.push(binding);
    }
    if (onProgress && (performance.now() - lastProgressAt >= 250 || index === objects.length - 1)) {
      lastProgressAt = performance.now();
      onProgress({ phase: 'matching', completed: index + 1, total: objects.length });
    }
    return { object, bindings };
  });
}

function removalReferenceFeatures(context) {
  return (context?.lightRows ?? []).flatMap((row) => {
    if (row.removalEligible === false) return [];
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
