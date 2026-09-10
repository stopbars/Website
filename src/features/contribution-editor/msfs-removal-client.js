import { dsfSelectorKey } from './xplane-removal-contract.js';
/* oxlint-disable react-doctor/js-flatmap-filter -- Removal selections are bounded and the explicit validity filter documents accepted worker input. */

import { mergeIntervals } from './removal-intervals.js';
import { distanceMeters, nearestPointOnLine } from './editor-geometry.js';
import { pointInPolygon } from '../draft-generator/extractor/geo.js';

export function createMsfsRemovalWorkerClient(context) {
  const worker = new Worker(new URL('./msfs-removal.worker.js', import.meta.url), {
    type: 'module',
  });
  const pending = new Map();
  let nextId = 0;
  let terminated = false;

  worker.onmessage = (event) => {
    const entry = pending.get(event.data?.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.signal?.removeEventListener('abort', entry.handleAbort);
    if (event.data.type === 'complete') entry.resolve(event.data.result);
    else entry.reject(new Error(event.data.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'MSFS removal geometry could not be built.');
    for (const entry of pending.values()) {
      entry.signal?.removeEventListener('abort', entry.handleAbort);
      entry.reject(error);
    }
    pending.clear();
  };
  worker.postMessage({ type: 'initialize', context });

  const request = (type, payload, signal) =>
    new Promise((resolve, reject) => {
      if (terminated || signal?.aborted) {
        reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
        return;
      }
      const id = ++nextId;
      const handleAbort = () => {
        pending.delete(id);
        reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
      };
      pending.set(id, { resolve, reject, signal, handleAbort });
      signal?.addEventListener('abort', handleAbort, { once: true });
      worker.postMessage({ type, id, ...payload });
    });

  return {
    build(selections, { signal, keepSelections = [] } = {}) {
      return request('build', { selections, keepSelections }, signal);
    },
    migrateImported(objects, removals, { signal } = {}) {
      return request('migrate-imported', { objects, removals }, signal);
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      worker.terminate();
      for (const entry of pending.values()) {
        entry.signal?.removeEventListener('abort', entry.handleAbort);
        entry.reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
      }
      pending.clear();
    },
  };
}

export function removalSelectionFromBinding(binding) {
  const sourceId = canonicalMsfsRemovalSourceId(binding?.sourceId);
  if (!sourceId) return null;
  const start = Number(binding?.rangeStartMeters);
  const end = Number(binding?.rangeEndMeters);
  return Number.isFinite(start) && Number.isFinite(end)
    ? {
        sourceId,
        rangeStartMeters: Math.min(start, end),
        rangeEndMeters: Math.max(start, end),
      }
    : { sourceId };
}

export function canonicalMsfsRemovalSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const sectionMarker = sourceId.indexOf(':division-section:');
  return sectionMarker > 0 ? sourceId.slice(0, sectionMarker) : sourceId;
}

export function removalIdsCoveringLineSection(removals, coordinates, spacingMeters = 0.5) {
  const samples = sampleLineCoordinates(coordinates, spacingMeters);
  if (samples.length === 0) return [];
  const sectionBounds = coordinateBounds(samples);
  const ids = [];
  for (const removal of removals ?? []) {
    const ring = (removal?.coordinates ?? []).filter(validCoordinate);
    if (ring.length < 4 || !boundsOverlap(sectionBounds, coordinateBounds(ring))) continue;
    const polygon = ring.map(([lon, lat]) => ({ lon, lat }));
    if (!samples.some(([lon, lat]) => pointInPolygon({ lon, lat }, polygon))) continue;
    ids.push(String(removal.id));
  }
  return ids;
}

export function importedRemovalIdsToRetire(removals, removalIds) {
  const requestedIds = new Set((removalIds ?? []).map(String));
  const retiredIds = [];
  for (const removal of removals ?? []) {
    if (removal?.origin !== 'imported' || !requestedIds.has(String(removal.id))) continue;
    retiredIds.push(String(removal.id));
  }
  return retiredIds;
}

function sampleLineCoordinates(coordinates, spacingMeters) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const samples = [coordinates[0]];
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    if (!validCoordinate(start) || !validCoordinate(end)) continue;
    const projection = nearestPointOnLine(end, [start, end]);
    const length = projection?.alongMeters ?? 0;
    const steps = Math.max(1, Math.ceil(length / Math.max(0.1, spacingMeters)));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      samples.push([
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio,
      ]);
    }
  }
  return samples;
}

function coordinateBounds(coordinates) {
  const longitudes = coordinates.map((coordinate) => coordinate[0]);
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  return {
    minLon: Math.min(...longitudes),
    minLat: Math.min(...latitudes),
    maxLon: Math.max(...longitudes),
    maxLat: Math.max(...latitudes),
  };
}

function boundsOverlap(left, right) {
  return !(
    left.maxLon < right.minLon ||
    left.minLon > right.maxLon ||
    left.maxLat < right.minLat ||
    left.minLat > right.maxLat
  );
}

function validCoordinate(coordinate) {
  return Number.isFinite(coordinate?.[0]) && Number.isFinite(coordinate?.[1]);
}

export function removalSelectionFeature(sectionStart, fallbackFeature) {
  return sectionStart?.feature?.geometry?.type === 'LineString'
    ? sectionStart.feature
    : fallbackFeature;
}

export function resolveMsfsRemovalTarget(features, clickedFeature, coordinate, maximumMeters = 4) {
  const clickedSourceId = canonicalMsfsRemovalSourceId(
    clickedFeature?.properties?.sourceId ?? clickedFeature?.id
  );
  if (clickedSourceId) {
    const nearestMatchingSource = nearestRemovalTarget(
      features,
      coordinate,
      (feature) =>
        canonicalMsfsRemovalSourceId(feature.properties?.sourceId ?? feature.id) === clickedSourceId
    );
    if (nearestMatchingSource.distance <= maximumMeters) return nearestMatchingSource.feature;
  }

  return nearestRemovalTarget(features, coordinate, () => true, maximumMeters).feature;
}

function nearestRemovalTarget(features, coordinate, matches, maximumMeters = Infinity) {
  let nearestTarget = null;
  let nearestTargetDistance = maximumMeters;

  for (const feature of features ?? []) {
    if (
      feature.properties?.msfsRemovalTarget !== true ||
      feature.properties?.snapCategory !== 'light-rows' ||
      feature.geometry?.type !== 'LineString'
    ) {
      continue;
    }
    if (!matches(feature)) continue;
    const distance =
      nearestPointOnLine(coordinate, feature.geometry.coordinates)?.distanceMeters ?? Infinity;
    if (distance < nearestTargetDistance) {
      nearestTarget = feature;
      nearestTargetDistance = distance;
    }
  }

  return { feature: nearestTarget, distance: nearestTargetDistance };
}

export function resolveXPlaneRemovalTarget(
  features,
  clickedFeature,
  coordinate,
  maximumMeters = 4
) {
  const clickedKey = xplaneRemovalTargetKey(clickedFeature);
  let nearestMatchingSource = null;
  let nearestMatchingDistance = Infinity;
  let nearestTarget = null;
  let nearestTargetDistance = maximumMeters;

  for (const feature of features ?? []) {
    const properties = feature.properties ?? {};
    if (
      feature.geometry?.type === 'Point' &&
      properties.removable !== false &&
      dsfSelectorKey(properties.dsfRemoval)
    ) {
      const distance = distanceMeters(coordinate, feature.geometry.coordinates);
      if (distance < nearestTargetDistance) {
        nearestTarget = feature;
        nearestTargetDistance = distance;
      }
      continue;
    }
    if (
      (properties.sourceType !== 'xplane-apt-light-string' &&
        !dsfSelectorKey(properties.dsfRemoval)) ||
      properties.removable === false ||
      feature.geometry?.type !== 'LineString'
    ) {
      continue;
    }
    const distance =
      nearestPointOnLine(coordinate, feature.geometry.coordinates)?.distanceMeters ?? Infinity;
    if (
      clickedKey &&
      xplaneRemovalTargetKey(feature) === clickedKey &&
      distance < nearestMatchingDistance
    ) {
      nearestMatchingSource = feature;
      nearestMatchingDistance = distance;
    }
    if (distance < nearestTargetDistance) {
      nearestTarget = feature;
      nearestTargetDistance = distance;
    }
  }

  return nearestMatchingDistance <= maximumMeters ? nearestMatchingSource : nearestTarget;
}

function xplaneRemovalTargetKey(feature) {
  const properties = feature?.properties ?? {};
  if (properties.dsfRemoval) return dsfSelectorKey(properties.dsfRemoval);
  const sourceFeatureId = String(properties.sourceFeatureId ?? '');
  const lightCode = Number(properties.lightCode);
  const sourceRunIndex = Number(properties.sourceRunIndex);
  return /^[a-f0-9]{16}$/i.test(sourceFeatureId) &&
    Number.isInteger(lightCode) &&
    Number.isInteger(sourceRunIndex)
    ? `${sourceFeatureId}:${lightCode}:${sourceRunIndex}`
    : '';
}

export function removalBindingsFromMatch(match) {
  if (match?.bindings?.length) return match.bindings.filter(Boolean);
  return match?.binding ? [match.binding] : [];
}

export function removalSelectionsFromMatches(matchOrMatches) {
  const matches = Array.isArray(matchOrMatches) ? matchOrMatches : [matchOrMatches];
  const selections = new Map();
  for (const match of matches) {
    for (const binding of removalBindingsFromMatch(match)) {
      const selection = removalSelectionFromBinding(binding);
      if (!selection) continue;
      const group = selections.get(selection.sourceId) ?? { fullRow: false, intervals: [] };
      if (!('rangeStartMeters' in selection)) {
        group.fullRow = true;
        group.intervals = [];
      } else if (!group.fullRow) {
        group.intervals.push({ start: selection.rangeStartMeters, end: selection.rangeEndMeters });
      }
      selections.set(selection.sourceId, group);
    }
  }
  return [...selections.entries()].flatMap(([sourceId, group]) => {
    if (group.fullRow) return [{ sourceId }];
    return mergeIntervals(group.intervals, 0, Number.MAX_SAFE_INTEGER).map(({ start, end }) => ({
      sourceId,
      rangeStartMeters: start,
      rangeEndMeters: end,
    }));
  });
}

export function automaticRemovalSelections(matchOrMatches, retainedBindings = []) {
  const currentSelections = removalSelectionsFromMatches(matchOrMatches);
  const currentSourceIds = new Set(currentSelections.map((selection) => selection.sourceId));
  const retainedSelections = removalSelectionsFromMatches({ bindings: retainedBindings }).filter(
    (selection) => !currentSourceIds.has(selection.sourceId)
  );
  return [...currentSelections, ...retainedSelections];
}

export function manualMsfsRemovalSourceIds(removals) {
  const sourceIds = new Set();
  for (const removal of removals ?? []) {
    if (removal.origin !== 'msfs-manual') continue;
    for (const value of removal.sourceIds ?? []) {
      const sourceId = canonicalMsfsRemovalSourceId(value);
      if (sourceId) sourceIds.add(sourceId);
    }
  }
  return sourceIds;
}

export function removalBindingsWithSharedRows(objects, editedPartId, editedBindings) {
  const bindings = [...(editedBindings ?? [])];
  const editedSourceIds = new Set(
    bindings.map((binding) => canonicalMsfsRemovalSourceId(binding.sourceId)).filter(Boolean)
  );
  if (editedSourceIds.size === 0) return bindings;
  for (const object of objects ?? []) {
    if (object.partId === editedPartId) continue;
    for (const binding of object.sourceBindings ?? []) {
      if (editedSourceIds.has(canonicalMsfsRemovalSourceId(binding.sourceId))) {
        bindings.push(binding);
      }
    }
  }
  return bindings;
}

export function coveredAutomaticRemovalIds(removals, objectCoordinates) {
  if (!Array.isArray(objectCoordinates) || objectCoordinates.length < 2) return [];
  const requiredCoveredPoints = Math.min(2, objectCoordinates.length);
  return (removals ?? []).flatMap((removal) => {
    if (!['imported', 'msfs-source', 'msfs-auto'].includes(removal.origin)) return [];
    const ring = removal.coordinates;
    if (!Array.isArray(ring) || ring.length < 3) return [];
    let coveredPoints = 0;
    for (const coordinate of objectCoordinates) {
      if (pointInRing(coordinate, ring)) coveredPoints += 1;
      if (coveredPoints >= requiredCoveredPoints) return [String(removal.id)];
    }
    return [];
  });
}

export function importedRemovalReplacementPlan(
  removals,
  coveredRemovalIds,
  objects,
  editedPartId,
  resolveBindings
) {
  const coveredIds = new Set((coveredRemovalIds ?? []).map(String));
  const importedRemovalIds = new Set();
  for (const removal of removals ?? []) {
    const removalId = String(removal.id);
    if (removal.origin === 'imported' && coveredIds.has(removalId)) {
      importedRemovalIds.add(removalId);
    }
  }
  const replaceableRemovalIds = new Set();
  const retainedBindings = [];
  for (const removal of removals ?? []) {
    const removalId = String(removal.id);
    if (!importedRemovalIds.has(removalId)) continue;
    const siblingBindings = [];
    let fullyResolved = true;
    for (const object of objects ?? []) {
      if (object.partId === editedPartId) continue;
      if (coveredAutomaticRemovalIds([removal], object.coordinates).length === 0) continue;
      const bindings = resolveBindings(object);
      if (!Array.isArray(bindings) || bindings.length === 0) {
        fullyResolved = false;
        break;
      }
      siblingBindings.push(...bindings);
    }
    if (!fullyResolved) continue;
    replaceableRemovalIds.add(removalId);
    retainedBindings.push(...siblingBindings);
  }
  return { importedRemovalIds, replaceableRemovalIds, retainedBindings };
}

function pointInRing(point, ring) {
  const x = Number(point?.[0]);
  const y = Number(point?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (pointOnSegment(point, start, end)) return true;
    const startY = Number(start?.[1]);
    const endY = Number(end?.[1]);
    const crosses = startY > y !== endY > y;
    if (!crosses) continue;
    const intersectionX =
      Number(start?.[0]) +
      ((y - startY) * (Number(end?.[0]) - Number(start?.[0]))) / (endY - startY);
    if (x < intersectionX) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  const px = Number(point?.[0]);
  const py = Number(point?.[1]);
  const sx = Number(start?.[0]);
  const sy = Number(start?.[1]);
  const ex = Number(end?.[0]);
  const ey = Number(end?.[1]);
  if (![px, py, sx, sy, ex, ey].every(Number.isFinite)) return false;
  const cross = (px - sx) * (ey - sy) - (py - sy) * (ex - sx);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    px >= Math.min(sx, ex) &&
    px <= Math.max(sx, ex) &&
    py >= Math.min(sy, ey) &&
    py <= Math.max(sy, ey)
  );
}
