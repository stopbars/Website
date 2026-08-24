/* oxlint-disable react-doctor/js-combine-iterations -- Removal display keeps provenance filtering separate from GeoJSON projection. */

import * as polyclip from 'polyclip-ts';

export function mergeRemovalDisplayFeatures(features) {
  if (!Array.isArray(features) || features.length < 2) return features ?? [];
  const groups = overlappingFeatureGroups(features);
  return groups.flatMap((group, index) => mergeFeatureGroup(group, index));
}

function mergeFeatureGroup(features, index) {
  if (features.length < 2) return features;
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

function overlappingFeatureGroups(features) {
  const entries = features.map((feature) => ({
    feature,
    bounds: geometryBounds(feature.geometry),
  }));
  const groups = [];
  const visited = new Set();
  for (let start = 0; start < entries.length; start += 1) {
    if (visited.has(start)) continue;
    visited.add(start);
    const indexes = [start];
    for (let cursor = 0; cursor < indexes.length; cursor += 1) {
      const leftIndex = indexes[cursor];
      for (let candidate = 0; candidate < entries.length; candidate += 1) {
        if (visited.has(candidate)) continue;
        if (!boundsOverlap(entries[leftIndex].bounds, entries[candidate].bounds)) continue;
        visited.add(candidate);
        indexes.push(candidate);
      }
    }
    groups.push(indexes.map((index) => entries[index].feature));
  }
  return groups;
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
