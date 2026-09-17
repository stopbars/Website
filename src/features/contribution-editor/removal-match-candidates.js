export function createRemovalMatchCandidateSearch(features, toleranceMeters = 1.5) {
  const entries = features.map(feature => {
    const coordinates = feature.geometry.coordinates;
    return { feature, coordinates, bounds: lineBounds(coordinates) };
  });
  return coordinates => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const bounds = lineBounds(coordinates);
    if (!bounds) return features;
    const latitudeScale = 111_320;
    const longitudeScale = latitudeScale * Math.max(
      Math.cos(Math.max(Math.abs(bounds.minY), Math.abs(bounds.maxY)) * Math.PI / 180), 0.000001
    );
    const dx = toleranceMeters / longitudeScale + 1e-9;
    const dy = toleranceMeters / latitudeScale + 1e-9;
    const expanded = { minX: bounds.minX - dx, maxX: bounds.maxX + dx, minY: bounds.minY - dy, maxY: bounds.maxY + dy };
    return entries.filter(entry => {
      if (!entry.bounds) return false;
      if (overlaps(expanded, entry.bounds)) return true;
      const points = entry.coordinates;
      // The matcher extends endpoint rays, so a finite line bounding box alone is insufficient.
      return rayIntersectsBounds(points[0], points[1], expanded) ||
        rayIntersectsBounds(points.at(-1), points.at(-2), expanded);
    }).map(entry => entry.feature);
  };
}

function lineBounds(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of coordinates) {
    if (!Number.isFinite(point?.[0]) || !Number.isFinite(point?.[1])) return null;
    minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
    minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
  }
  return { minX, maxX, minY, maxY };
}

function overlaps(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function rayIntersectsBounds(endpoint, neighbor, bounds) {
  let minimum = 0, maximum = Infinity;
  for (const [axis, low, high] of [[0, bounds.minX, bounds.maxX], [1, bounds.minY, bounds.maxY]]) {
    const direction = endpoint[axis] - neighbor[axis];
    if (direction === 0) {
      if (endpoint[axis] < low || endpoint[axis] > high) return false;
      continue;
    }
    const first = (low - endpoint[axis]) / direction;
    const last = (high - endpoint[axis]) / direction;
    minimum = Math.max(minimum, Math.min(first, last));
    maximum = Math.min(maximum, Math.max(first, last));
    if (minimum > maximum) return false;
  }
  return true;
}
