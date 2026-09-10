import { dsfSelectorKey } from './xplane-removal-contract.js';
import { distanceMeters } from './editor-geometry.js';
import { mergeIntervals } from './removal-intervals.js';

const selectionGeojsonCache = new WeakMap();

export function selectedRemovalGeojson(referenceGeojson, document) {
  const cacheableReference = referenceGeojson && typeof referenceGeojson === 'object';
  const cached = cacheableReference ? selectionGeojsonCache.get(referenceGeojson) : null;
  if (
    cached?.simulator === document?.simulator &&
    cached?.removals === document?.removals &&
    cached?.objects === document?.objects &&
    cached?.xplaneRemovals === document?.xplaneRemovals
  ) {
    return cached.result;
  }
  const xplane = document?.simulator === 'xplane';
  const selections = xplane
    ? xplaneSelectionsBySourceKey(document?.xplaneRemovals)
    : msfsSelectionsBySourceId(document);
  const keepSelections = xplane ? new Map() : msfsKeepSelectionsBySourceId(document);
  const features = embeddedRemovalSourceFeatures(document?.removals);

  if (xplane && selections.size === 0) {
    return cacheSelectionGeojson(referenceGeojson, document, features);
  }
  if (!xplane && selections.size === 0 && (document?.removals?.length ?? 0) === 0) {
    return cacheSelectionGeojson(referenceGeojson, document, []);
  }

  for (const feature of referenceGeojson?.features ?? []) {
    const properties = feature.properties ?? {};
    const featureSelections = xplane
      ? selections.get(xplaneSourceKey(properties))
      : selections.get(canonicalMsfsSourceId(properties.sourceId ?? feature.id));
    if (featureSelections && xplane && feature.geometry?.type === 'Point') {
      features.push(feature);
      continue;
    }
    if (!featureSelections || feature.geometry?.type !== 'LineString') continue;

    const coordinates = feature.geometry.coordinates;
    const totalLength = lineLength(coordinates);
    const displayedSelections = xplane
      ? featureSelections
      : subtractDisplaySelections(
          featureSelections,
          keepSelections.get(canonicalMsfsSourceId(properties.sourceId ?? feature.id)),
          totalLength
        );
    for (const selection of displayedSelections) {
      const startMeters = selection.normalized
        ? totalLength * selection.start
        : selection.rangeStartMeters;
      const endMeters = selection.normalized
        ? totalLength * selection.end
        : selection.rangeEndMeters;
      const selectedCoordinates =
        Number.isFinite(startMeters) && Number.isFinite(endMeters)
          ? sliceLineByDistance(coordinates, startMeters, endMeters)
          : coordinates;
      if (selectedCoordinates.length < 2) continue;
      features.push(
        selectedFeature({
          ...feature,
          geometry: { ...feature.geometry, coordinates: selectedCoordinates },
        })
      );
    }
  }

  if (!xplane) {
    features.push(
      ...unresolvedRemovalFeatures(
        referenceGeojson?.features,
        (document?.removals ?? []).filter(removalNeedsGeometricDisplayFallback),
        selectedFeaturesBySourceId(features)
      )
    );
  }

  return cacheSelectionGeojson(referenceGeojson, document, features);
}

function cacheSelectionGeojson(referenceGeojson, document, features) {
  const result = { type: 'FeatureCollection', features: uniqueSelectedFeatures(features) };
  if (referenceGeojson && typeof referenceGeojson === 'object') {
    selectionGeojsonCache.set(referenceGeojson, {
      simulator: document?.simulator,
      removals: document?.removals,
      objects: document?.objects,
      xplaneRemovals: document?.xplaneRemovals,
      result,
    });
  }
  return result;
}

function removalNeedsGeometricDisplayFallback(removal) {
  return !(
    ['msfs-auto', 'msfs-manual'].includes(removal?.origin) && Array.isArray(removal?.selections)
  );
}

function embeddedRemovalSourceFeatures(removals) {
  const features = [];
  for (const removal of removals ?? []) {
    const rings = [removal?.coordinates ?? []];
    if (rings[0].length < 4) continue;
    for (const line of removal.sourceLines ?? []) {
      const sourceId = canonicalMsfsSourceId(line?.sourceId);
      if (!sourceId) continue;
      for (const coordinates of clipLineToPolygon(line?.coordinates, rings)) {
        features.push(
          selectedFeature({
            type: 'Feature',
            id: sourceId,
            properties: { sourceId, sourceType: 'stored-removal-source' },
            geometry: { type: 'LineString', coordinates },
          })
        );
      }
    }
  }
  return features;
}

function uniqueSelectedFeatures(features) {
  const seen = new Set();
  return features.filter((feature) => {
    const key = `${canonicalMsfsSourceId(feature.properties?.sourceId ?? feature.id)}:${JSON.stringify(feature.geometry?.coordinates)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedFeaturesBySourceId(features) {
  const bySourceId = new Map();
  for (const feature of features) {
    const sourceId = canonicalMsfsSourceId(feature.properties?.sourceId ?? feature.id);
    if (!sourceId) continue;
    const matches = bySourceId.get(sourceId) ?? [];
    matches.push(feature);
    bySourceId.set(sourceId, matches);
  }
  return bySourceId;
}

function unresolvedRemovalFeatures(referenceFeatures, removals, displayedFeaturesBySourceId) {
  const features = [];
  const targetFeatures = [];
  const featuresBySourceId = new Map();
  for (const feature of referenceFeatures ?? []) {
    if (feature.geometry?.type !== 'LineString') continue;
    const sourceId = canonicalMsfsSourceId(feature.properties?.sourceId ?? feature.id);
    if (sourceId) {
      const linked = featuresBySourceId.get(sourceId) ?? [];
      linked.push(feature);
      featuresBySourceId.set(sourceId, linked);
    }
    if (feature.properties?.msfsRemovalTarget === true) targetFeatures.push(feature);
  }
  for (const removal of removals ?? []) {
    const sourceIds = removalSourceIds(removal);
    const sourceIdSet = new Set(sourceIds);
    const rings = [removal?.coordinates ?? []];
    if (rings[0].length < 4) continue;
    if (removalHasDisplayedSection(displayedFeaturesBySourceId, sourceIds, rings)) continue;
    const polygonBounds = coordinateBounds(rings[0]);
    const linkedFeatures = sourceIds.flatMap((sourceId) => featuresBySourceId.get(sourceId) ?? []);
    const candidateFeatures = [...new Set([...linkedFeatures, ...targetFeatures])];
    for (const feature of candidateFeatures) {
      const featureSourceId = canonicalMsfsSourceId(feature.properties?.sourceId ?? feature.id);
      const linkedBySourceId = sourceIdSet.has(featureSourceId);
      if (
        (!linkedBySourceId && feature.properties?.msfsRemovalTarget !== true) ||
        !boundsOverlap(polygonBounds, coordinateBounds(feature.geometry.coordinates))
      ) {
        continue;
      }
      for (const coordinates of clipLineToPolygon(feature.geometry.coordinates, rings)) {
        features.push(
          selectedFeature({
            ...feature,
            geometry: { ...feature.geometry, coordinates },
          })
        );
      }
    }
  }
  return features;
}

function removalHasDisplayedSection(displayedFeaturesBySourceId, sourceIds, rings) {
  if (sourceIds.length === 0) return false;
  return sourceIds.some((sourceId) =>
    (displayedFeaturesBySourceId.get(sourceId) ?? []).some(
      (feature) => clipLineToPolygon(feature.geometry?.coordinates, rings).length > 0
    )
  );
}

function removalSourceIds(removal) {
  const sourceIds = [];
  for (const value of [
    ...(removal?.sourceIds ?? []),
    ...(removal?.selections ?? []).map((selection) => selection?.sourceId),
  ]) {
    const sourceId = canonicalMsfsSourceId(value);
    if (sourceId) sourceIds.push(sourceId);
  }
  return sourceIds;
}

function msfsSelectionsBySourceId(document) {
  const selections = new Map();
  const activeSources = new Set();
  const manuallyEditedSources = new Set();
  for (const removal of document?.removals ?? []) {
    if (removal.origin && !['msfs-source', 'msfs-auto', 'msfs-manual'].includes(removal.origin)) {
      continue;
    }
    for (const sourceId of removal.sourceIds ?? []) {
      const canonical = canonicalMsfsSourceId(sourceId);
      if (canonical) activeSources.add(canonical);
      if (canonical && removal.origin === 'msfs-manual') {
        manuallyEditedSources.add(canonical);
      }
    }
    const removalSelections = removal.selections ?? [];
    for (const selection of removalSelections) {
      const sourceId = canonicalMsfsSourceId(selection?.sourceId);
      if (sourceId) appendSelection(selections, sourceId, selection);
      if (sourceId && removal.origin === 'msfs-manual') {
        activeSources.add(sourceId);
        manuallyEditedSources.add(sourceId);
      }
    }
  }
  for (const object of document?.objects ?? []) {
    for (const binding of object.sourceBindings ?? []) {
      const sourceId = canonicalMsfsSourceId(binding?.sourceId);
      if (!activeSources.has(sourceId) || manuallyEditedSources.has(sourceId)) continue;
      appendSelection(selections, sourceId, binding);
    }
  }
  for (const sourceId of activeSources) {
    if (!selections.has(sourceId) && !manuallyEditedSources.has(sourceId)) {
      selections.set(sourceId, [{}]);
    }
  }
  for (const [key, values] of selections) {
    selections.set(key, normalizeDisplaySelections(values));
  }
  return selections;
}

function msfsKeepSelectionsBySourceId(document) {
  const selections = new Map();
  for (const removal of document?.removals ?? []) {
    for (const selection of removal.keepSelections ?? []) {
      const sourceId = canonicalMsfsSourceId(selection?.sourceId);
      if (sourceId) appendSelection(selections, sourceId, selection);
    }
  }
  return selections;
}

function subtractDisplaySelections(selections, keepSelections, totalLength) {
  if (!keepSelections?.length) return selections;
  const selectedIntervals = displayIntervals(selections, totalLength);
  const keepIntervals = displayIntervals(keepSelections, totalLength);
  let remaining = selectedIntervals;
  for (const keep of keepIntervals) {
    remaining = remaining.flatMap((selected) => subtractInterval(selected, keep));
  }
  return remaining.map(({ start, end }) => ({ rangeStartMeters: start, rangeEndMeters: end }));
}

function displayIntervals(selections, totalLength) {
  return mergeIntervals(
    selections.map((selection) => ({
      start: hasFiniteRange(selection)
        ? selection.normalized
          ? totalLength * selection.start
          : selection.rangeStartMeters
        : 0,
      end: hasFiniteRange(selection)
        ? selection.normalized
          ? totalLength * selection.end
          : selection.rangeEndMeters
        : totalLength,
    })),
    0,
    totalLength
  );
}

function subtractInterval(selected, keep) {
  if (keep.end <= selected.start || keep.start >= selected.end) return [selected];
  const remaining = [];
  if (keep.start - selected.start > 0.05) {
    remaining.push({ start: selected.start, end: Math.min(keep.start, selected.end) });
  }
  if (selected.end - keep.end > 0.05) {
    remaining.push({ start: Math.max(keep.end, selected.start), end: selected.end });
  }
  return remaining;
}

function canonicalMsfsSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const marker = sourceId.indexOf(':division-section:');
  return marker > 0 ? sourceId.slice(0, marker) : sourceId;
}

function xplaneSelectionsBySourceKey(selectors) {
  const selections = new Map();
  for (const selector of selectors ?? []) {
    const key =
      dsfSelectorKey(selector) ||
      xplaneSourceKey({
        sourceFeatureId: selector.feature,
        lightCode: selector.code,
        sourceRunIndex: selector.run,
      });
    if (!key) continue;
    const start = clamp(Number(selector.start), 0, 1);
    const end = clamp(Number(selector.end), 0, 1);
    appendSelection(selections, key, {
      normalized: true,
      start: Math.min(start, end),
      end: Math.max(start, end),
    });
  }
  for (const [key, values] of selections) {
    selections.set(key, normalizeDisplaySelections(values));
  }
  return selections;
}

function appendSelection(selections, key, value) {
  selections.set(key, [...(selections.get(key) ?? []), value]);
}

function normalizeDisplaySelections(values) {
  if (values.some((value) => !hasFiniteRange(value))) return [{}];
  const normalized = values[0]?.normalized === true;
  const intervals = mergeIntervals(
    values.map((value) => ({
      start: normalized ? value.start : value.rangeStartMeters,
      end: normalized ? value.end : value.rangeEndMeters,
    })),
    0,
    normalized ? 1 : Number.MAX_SAFE_INTEGER
  );
  return intervals.map(({ start, end }) =>
    normalized ? { normalized: true, start, end } : { rangeStartMeters: start, rangeEndMeters: end }
  );
}

function hasFiniteRange(value) {
  return value?.normalized === true
    ? Number.isFinite(Number(value.start)) && Number.isFinite(Number(value.end))
    : Number.isFinite(Number(value?.rangeStartMeters)) &&
        Number.isFinite(Number(value?.rangeEndMeters));
}

function xplaneSourceKey(properties) {
  if (properties?.dsfRemoval) return dsfSelectorKey(properties.dsfRemoval);
  const feature = String(properties?.sourceFeatureId ?? '');
  const code = Number(properties?.lightCode);
  const run = Number(properties?.sourceRunIndex);
  return feature && Number.isInteger(code) && Number.isInteger(run)
    ? `${feature}:${code}:${run}`
    : '';
}

function sliceLineByDistance(coordinates, requestedStart, requestedEnd) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const distances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    distances.push(distances.at(-1) + distanceMeters(coordinates[index - 1], coordinates[index]));
  }
  const total = distances.at(-1);
  const start = clamp(Math.min(requestedStart, requestedEnd), 0, total);
  const end = clamp(Math.max(requestedStart, requestedEnd), start, total);
  if (end - start < 0.05) return [];
  const result = [pointAtDistance(coordinates, distances, start)];
  for (let index = 1; index < coordinates.length - 1; index += 1) {
    if (distances[index] > start && distances[index] < end) result.push(coordinates[index]);
  }
  result.push(pointAtDistance(coordinates, distances, end));
  return result;
}

function pointAtDistance(coordinates, distances, target) {
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index] < target) continue;
    const span = Math.max(distances[index] - distances[index - 1], Number.EPSILON);
    const ratio = (target - distances[index - 1]) / span;
    return [
      coordinates[index - 1][0] + (coordinates[index][0] - coordinates[index - 1][0]) * ratio,
      coordinates[index - 1][1] + (coordinates[index][1] - coordinates[index - 1][1]) * ratio,
    ];
  }
  return coordinates.at(-1);
}

function lineLength(coordinates) {
  let total = 0;
  for (let index = 1; index < (coordinates?.length ?? 0); index += 1) {
    total += distanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return total;
}

function clipLineToPolygon(coordinates, rings) {
  const sections = [];
  let current = null;
  for (let index = 1; index < (coordinates?.length ?? 0); index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const cuts = [0, 1];
    for (const ring of rings) {
      for (let edgeIndex = 1; edgeIndex < ring.length; edgeIndex += 1) {
        const intersection = segmentIntersectionParameter(
          start,
          end,
          ring[edgeIndex - 1],
          ring[edgeIndex]
        );
        if (intersection !== null) cuts.push(intersection);
      }
    }
    cuts.sort((left, right) => left - right);
    const uniqueCuts = cuts.filter(
      (value, cutIndex) => cutIndex === 0 || Math.abs(value - cuts[cutIndex - 1]) > 1e-9
    );
    for (let cutIndex = 1; cutIndex < uniqueCuts.length; cutIndex += 1) {
      const from = uniqueCuts[cutIndex - 1];
      const to = uniqueCuts[cutIndex];
      if (to - from <= 1e-9) continue;
      const midpoint = interpolateCoordinate(start, end, (from + to) / 2);
      if (!pointInPolygon(midpoint, rings)) {
        current = null;
        continue;
      }
      const sectionStart = interpolateCoordinate(start, end, from);
      const sectionEnd = interpolateCoordinate(start, end, to);
      if (current && coordinatesEqual(current.at(-1), sectionStart)) {
        current.push(sectionEnd);
      } else {
        current = [sectionStart, sectionEnd];
        sections.push(current);
      }
    }
  }
  return sections.filter((section) => lineLength(section) >= 0.05);
}

function segmentIntersectionParameter(start, end, edgeStart, edgeEnd) {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const edgeX = edgeEnd[0] - edgeStart[0];
  const edgeY = edgeEnd[1] - edgeStart[1];
  const denominator = segmentX * edgeY - segmentY * edgeX;
  if (Math.abs(denominator) <= 1e-14) return null;
  const offsetX = edgeStart[0] - start[0];
  const offsetY = edgeStart[1] - start[1];
  const segmentParameter = (offsetX * edgeY - offsetY * edgeX) / denominator;
  const edgeParameter = (offsetX * segmentY - offsetY * segmentX) / denominator;
  return segmentParameter >= 0 && segmentParameter <= 1 && edgeParameter >= 0 && edgeParameter <= 1
    ? segmentParameter
    : null;
}

function pointInPolygon(point, rings) {
  if (!pointInRing(point, rings[0])) return false;
  return rings.slice(1).every((ring) => !pointInRing(point, ring));
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const left = ring[index];
    const right = ring[previous];
    if (pointOnSegment(point, left, right)) return true;
    if (
      left[1] > point[1] !== right[1] > point[1] &&
      point[0] < ((right[0] - left[0]) * (point[1] - left[1])) / (right[1] - left[1]) + left[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  const cross =
    (point[0] - start[0]) * (end[1] - start[1]) - (point[1] - start[1]) * (end[0] - start[0]);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    point[0] >= Math.min(start[0], end[0]) - 1e-12 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-12 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-12 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-12
  );
}

function interpolateCoordinate(start, end, ratio) {
  return [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio];
}

function coordinatesEqual(left, right) {
  return Math.abs(left[0] - right[0]) <= 1e-10 && Math.abs(left[1] - right[1]) <= 1e-10;
}

function coordinateBounds(coordinates) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const coordinate of coordinates ?? []) {
    bounds.minX = Math.min(bounds.minX, coordinate[0]);
    bounds.minY = Math.min(bounds.minY, coordinate[1]);
    bounds.maxX = Math.max(bounds.maxX, coordinate[0]);
    bounds.maxY = Math.max(bounds.maxY, coordinate[1]);
  }
  return bounds;
}

function boundsOverlap(left, right) {
  return !(
    left.maxX < right.minX ||
    right.maxX < left.minX ||
    left.maxY < right.minY ||
    right.maxY < left.minY
  );
}

function selectedFeature(feature) {
  return {
    ...feature,
    properties: { ...feature.properties, featureType: 'selected-removal-section' },
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
