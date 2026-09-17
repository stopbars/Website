/* oxlint-disable react-doctor/js-combine-iterations -- Removal display keeps provenance filtering separate from GeoJSON projection. */

import * as polyclip from 'polyclip-ts';

const MAX_DISPLAY_UNION_FEATURES = 8;
const MAX_DISPLAY_UNION_VERTICES = 800;

export function mergeRemovalDisplayFeatures(features) {
  if (!Array.isArray(features) || features.length === 0) return features ?? [];
  const groups = overlappingFeatureGroups(features);
  return groups.flatMap((group, index) => mergeFeatureGroup(group, index));
}

function mergeFeatureGroup(features, index) {
  if (!displayUnionWithinBudget(features)) return features;
  if (features.length === 1 && !polygonNeedsNormalization(features[0].geometry?.coordinates)) {
    return features;
  }
  const geometries = features.map((feature) => feature.geometry.coordinates);

  try {
    const coordinates = polyclip.union(...geometries);
    if (coordinates.length === 0) return features;
    return [
      {
        ...features[0],
        id: `editor-removal:merged-display:${index}`,
        geometry:
          coordinates.length === 1
            ? { type: 'Polygon', coordinates: coordinates[0] }
            : { type: 'MultiPolygon', coordinates },
        properties: {
          ...features[0].properties,
          editorId: `editor-removal:merged-display:${index}`,
          sourceIds: [
            ...new Set(features.flatMap((feature) => feature.properties?.sourceIds ?? []).map(String)),
          ],
        },
      },
    ];
  } catch {
    return features;
  }
}

function displayUnionWithinBudget(features) {
  if (features.length > MAX_DISPLAY_UNION_FEATURES) return false;
  let vertices = 0;
  for (const feature of features) {
    vertices += coordinateVertexCount(feature.geometry?.coordinates);
    if (vertices > MAX_DISPLAY_UNION_VERTICES) return false;
  }
  return true;
}

function coordinateVertexCount(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) return 1;
  let count = 0;
  for (const child of value) count += coordinateVertexCount(child);
  return count;
}

function overlappingFeatureGroups(features) {
  const entries = features.map((feature) => ({
    feature,
    bounds: geometryBounds(feature.geometry),
  }));
  const parents = entries.map((_, index) => index);
  const ranked = entries
    .map((entry, index) => ({ index, bounds: entry.bounds }))
    .filter((entry) => entry.bounds.every(Number.isFinite))
    .sort((left, right) => left.bounds[0] - right.bounds[0]);

  for (let cursor = 0; cursor < ranked.length; cursor += 1) {
    const left = ranked[cursor];
    for (let candidate = cursor + 1; candidate < ranked.length; candidate += 1) {
      const right = ranked[candidate];
      if (right.bounds[0] > left.bounds[2]) break;
      if (boundsOverlap(left.bounds, right.bounds)) unionParents(parents, left.index, right.index);
    }
  }

  const groupsByRoot = new Map();
  for (let index = 0; index < entries.length; index += 1) {
    const root = findParent(parents, index);
    const group = groupsByRoot.get(root) ?? [];
    group.push(entries[index].feature);
    groupsByRoot.set(root, group);
  }
  return [...groupsByRoot.values()];
}

function findParent(parents, index) {
  let root = index;
  while (parents[root] !== root) root = parents[root];
  while (parents[index] !== index) {
    const next = parents[index];
    parents[index] = root;
    index = next;
  }
  return root;
}

function unionParents(parents, left, right) {
  const leftRoot = findParent(parents, left);
  const rightRoot = findParent(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function polygonNeedsNormalization(rings) {
  return !Array.isArray(rings) || rings.length !== 1 || ringHasSelfIntersection(rings[0]);
}

function ringHasSelfIntersection(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return true;
  const closed = coordinatesEqual(ring[0], ring.at(-1));
  const segmentCount = closed ? ring.length - 1 : ring.length;
  for (let left = 0; left < segmentCount; left += 1) {
    const leftStart = ring[left];
    const leftEnd = ring[(left + 1) % ring.length];
    for (let right = left + 1; right < segmentCount; right += 1) {
      if (right === left + 1 || (left === 0 && right === segmentCount - 1)) continue;
      const rightStart = ring[right];
      const rightEnd = ring[(right + 1) % ring.length];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) return true;
    }
  }
  return false;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  if (
    Math.max(firstStart[0], firstEnd[0]) < Math.min(secondStart[0], secondEnd[0]) ||
    Math.max(secondStart[0], secondEnd[0]) < Math.min(firstStart[0], firstEnd[0]) ||
    Math.max(firstStart[1], firstEnd[1]) < Math.min(secondStart[1], secondEnd[1]) ||
    Math.max(secondStart[1], secondEnd[1]) < Math.min(firstStart[1], firstEnd[1])
  ) {
    return false;
  }
  const firstSideA = orientation(firstStart, firstEnd, secondStart);
  const firstSideB = orientation(firstStart, firstEnd, secondEnd);
  const secondSideA = orientation(secondStart, secondEnd, firstStart);
  const secondSideB = orientation(secondStart, secondEnd, firstEnd);
  return (
    (firstSideA === 0 || firstSideB === 0 || Math.sign(firstSideA) !== Math.sign(firstSideB)) &&
    (secondSideA === 0 || secondSideB === 0 || Math.sign(secondSideA) !== Math.sign(secondSideB))
  );
}

function orientation(start, end, point) {
  const value =
    (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0]);
  return Math.abs(value) <= Number.EPSILON ? 0 : value;
}

function coordinatesEqual(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  visitCoordinates(geometry?.coordinates, (coordinate) => {
    bounds[0] = Math.min(bounds[0], coordinate[0]);
    bounds[1] = Math.min(bounds[1], coordinate[1]);
    bounds[2] = Math.max(bounds[2], coordinate[0]);
    bounds[3] = Math.max(bounds[3], coordinate[1]);
  });
  return bounds;
}

function visitCoordinates(value, visitor) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    visitor(value);
    return;
  }
  for (const child of value) visitCoordinates(child, visitor);
}

function boundsOverlap(left, right) {
  return (
    left.every(Number.isFinite) &&
    right.every(Number.isFinite) &&
    left[0] <= right[2] &&
    right[0] <= left[2] &&
    left[1] <= right[3] &&
    right[1] <= left[3]
  );
}
