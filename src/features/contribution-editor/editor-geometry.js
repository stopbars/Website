const METERS_PER_DEGREE_LATITUDE = 111_320;

export function nearestSnapTarget(coordinate, referenceFeatures, options = {}) {
  if (!validCoordinate(coordinate)) return null;
  const enabledCategories = options.enabledCategories ?? new Set();
  const toleranceMeters = Number(options.toleranceMeters) || 8;
  let nearest = null;

  for (const feature of referenceFeatures ?? []) {
    const category = feature.properties?.snapCategory;
    if (enabledCategories.size > 0 && !enabledCategories.has(category)) continue;
    const projection = nearestPointOnGeometry(coordinate, feature.geometry);
    if (!projection || projection.distanceMeters > toleranceMeters) continue;
    if (!nearest || projection.distanceMeters < nearest.distanceMeters) {
      nearest = {
        ...projection,
        feature,
        sourceId: String(feature.properties?.sourceId ?? feature.id ?? ''),
        category,
      };
    }
  }
  return nearest;
}

export function nearestPointOnGeometry(coordinate, geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') {
    if (!validCoordinate(geometry.coordinates)) return null;
    return {
      coordinate: geometry.coordinates,
      distanceMeters: distanceMeters(coordinate, geometry.coordinates),
      alongMeters: 0,
      segmentIndex: 0,
      segmentFraction: 0,
    };
  }
  if (geometry.type === 'LineString') {
    return nearestPointOnLine(coordinate, geometry.coordinates);
  }
  if (geometry.type === 'MultiLineString') {
    return nearestAcrossLines(coordinate, geometry.coordinates);
  }
  if (geometry.type === 'Polygon') {
    return nearestAcrossLines(coordinate, geometry.coordinates);
  }
  if (geometry.type === 'MultiPolygon') {
    return nearestAcrossLines(coordinate, geometry.coordinates.flat());
  }
  return null;
}

export function nearestPointOnLine(coordinate, coordinates) {
  if (!validCoordinate(coordinate) || !Array.isArray(coordinates)) return null;
  const valid = coordinates.filter(validCoordinate);
  if (valid.length === 0) return null;
  if (valid.length === 1) {
    return {
      coordinate: valid[0],
      distanceMeters: distanceMeters(coordinate, valid[0]),
      alongMeters: 0,
      segmentIndex: 0,
      segmentFraction: 0,
    };
  }

  const referenceLatitude = coordinate[1];
  const point = project(coordinate, referenceLatitude);
  let best = null;
  let distanceBefore = 0;
  for (let index = 1; index < valid.length; index += 1) {
    const start = project(valid[index - 1], referenceLatitude);
    const end = project(valid[index], referenceLatitude);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction =
      lengthSquared > 0
        ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
        : 0;
    const projected = {
      x: start.x + dx * fraction,
      y: start.y + dy * fraction,
    };
    const segmentLength = Math.sqrt(lengthSquared);
    const candidate = {
      coordinate: unproject(projected, referenceLatitude),
      distanceMeters: Math.hypot(point.x - projected.x, point.y - projected.y),
      alongMeters: distanceBefore + segmentLength * fraction,
      segmentIndex: index - 1,
      segmentFraction: fraction,
    };
    if (!best || candidate.distanceMeters < best.distanceMeters) best = candidate;
    distanceBefore += segmentLength;
  }
  return best;
}

export function sliceLineBetween(coordinates, firstProjection, secondProjection) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
  const valid = coordinates.filter(validCoordinate);
  const first = normalizeProjection(firstProjection, valid);
  const second = normalizeProjection(secondProjection, valid);
  if (!first || !second) return [];
  const forward = first.alongMeters <= second.alongMeters;
  const start = forward ? first : second;
  const end = forward ? second : first;
  const sliced = [start.coordinate];

  for (let index = start.segmentIndex + 1; index <= end.segmentIndex; index += 1) {
    if (validCoordinate(valid[index])) appendDistinct(sliced, valid[index]);
  }
  appendDistinct(sliced, end.coordinate);
  return forward ? sliced : sliced.reverse();
}

export function joinLines(first, second, toleranceMeters = 15) {
  const variants = [
    { a: first, b: second },
    { a: [...first].reverse(), b: second },
    { a: first, b: [...second].reverse() },
    { a: [...first].reverse(), b: [...second].reverse() },
  ];
  let best = null;
  for (const variant of variants) {
    const gap = distanceMeters(variant.a.at(-1), variant.b[0]);
    if (!best || gap < best.gap) best = { ...variant, gap };
  }
  if (!best || best.gap > toleranceMeters) return null;
  const joined = [...best.a];
  for (const coordinate of best.b) appendDistinct(joined, coordinate);
  return joined;
}

export function splitLineAt(coordinates, projection) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !projection) return null;
  const split = projection.coordinate;
  const left = coordinates.slice(0, projection.segmentIndex + 1);
  appendDistinct(left, split);
  const right = [split, ...coordinates.slice(projection.segmentIndex + 1)];
  if (left.length < 2 || right.length < 2) return null;
  return [left, right];
}

export function distanceMeters(first, second) {
  if (!validCoordinate(first) || !validCoordinate(second)) return Infinity;
  const referenceLatitude = (first[1] + second[1]) / 2;
  const left = project(first, referenceLatitude);
  const right = project(second, referenceLatitude);
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export function lineLengthMeters(coordinates) {
  let length = 0;
  for (let index = 1; index < (coordinates?.length ?? 0); index += 1) {
    length += distanceMeters(coordinates[index - 1], coordinates[index]);
  }
  return length;
}

export function project(coordinate, referenceLatitude) {
  const longitudeScale =
    METERS_PER_DEGREE_LATITUDE * Math.max(Math.cos((referenceLatitude * Math.PI) / 180), 0.000001);
  return {
    x: coordinate[0] * longitudeScale,
    y: coordinate[1] * METERS_PER_DEGREE_LATITUDE,
  };
}

export function unproject(point, referenceLatitude) {
  const longitudeScale =
    METERS_PER_DEGREE_LATITUDE * Math.max(Math.cos((referenceLatitude * Math.PI) / 180), 0.000001);
  return [point.x / longitudeScale, point.y / METERS_PER_DEGREE_LATITUDE];
}

function nearestAcrossLines(coordinate, lines) {
  let nearest = null;
  for (const line of lines ?? []) {
    const candidate = nearestPointOnLine(coordinate, line);
    if (candidate && (!nearest || candidate.distanceMeters < nearest.distanceMeters)) {
      nearest = candidate;
    }
  }
  return nearest;
}

function normalizeProjection(projection, coordinates) {
  if (!projection) return null;
  if (
    Number.isInteger(projection.segmentIndex) &&
    validCoordinate(projection.coordinate) &&
    Number.isFinite(projection.alongMeters)
  ) {
    return projection;
  }
  return nearestPointOnLine(projection.coordinate ?? projection, coordinates);
}

function appendDistinct(target, coordinate) {
  if (!validCoordinate(coordinate)) return;
  if (target.length === 0 || distanceMeters(target.at(-1), coordinate) > 0.005) {
    target.push([...coordinate]);
  }
}

function validCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
