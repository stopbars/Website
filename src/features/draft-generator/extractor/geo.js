const EARTH_RADIUS_METERS = 6371008.8;
const METERS_PER_DEGREE_LAT = 111320;
const CLEANED_VERTICES_CACHE = new WeakMap();

export function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a, b) {
  const lat1 = degreesToRadians(a.lat);
  const lat2 = degreesToRadians(b.lat);
  const deltaLat = degreesToRadians(b.lat - a.lat);
  const deltaLon = degreesToRadians(b.lon - a.lon);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function interpolatePoint(a, b, ratio) {
  const alt =
    typeof a.alt === "number" && typeof b.alt === "number"
      ? a.alt + (b.alt - a.alt) * ratio
      : a.alt ?? b.alt;

  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lon: a.lon + (b.lon - a.lon) * ratio,
    ...(typeof alt === "number" ? { alt } : {})
  };
}

export function interpolatePolyline(vertices, spacingMeters) {
  if (vertices.length === 0) {
    return [];
  }

  if (vertices.length === 1 || !Number.isFinite(spacingMeters) || spacingMeters <= 0) {
    return [...vertices];
  }

  const segments = [];
  let totalLength = 0;
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const start = vertices[index];
    const end = vertices[index + 1];
    const length = haversineDistanceMeters(start, end);
    segments.push({ start, end, length, startDistance: totalLength });
    totalLength += length;
  }

  if (totalLength <= 0) {
    return [vertices[0]];
  }

  const points = [];
  for (let distance = 0; distance <= totalLength; distance += spacingMeters) {
    points.push(pointAtDistance(segments, distance));
  }

  const lastPoint = points[points.length - 1];
  const lastVertex = vertices[vertices.length - 1];
  if (!lastPoint || haversineDistanceMeters(lastPoint, lastVertex) > 0.05) {
    points.push(lastVertex);
  }

  return points;
}

function pointAtDistance(segments, distance) {
  const segment =
    segments.find((candidate) => distance <= candidate.startDistance + candidate.length) ??
    segments[segments.length - 1];

  if (!segment || segment.length <= 0) {
    return segment?.start ?? { lat: 0, lon: 0 };
  }

  const localDistance = Math.max(0, distance - segment.startDistance);
  const ratio = Math.min(1, localDistance / segment.length);
  return interpolatePoint(segment.start, segment.end, ratio);
}

export function rectanglePolygonAround(point, widthMeters, heightMeters) {
  const halfHeightDegrees = (heightMeters / 2) / METERS_PER_DEGREE_LAT;
  const lonScale = Math.max(Math.cos(degreesToRadians(point.lat)), 0.000001);
  const halfWidthDegrees = (widthMeters / 2) / (METERS_PER_DEGREE_LAT * lonScale);

  const north = point.lat + halfHeightDegrees;
  const south = point.lat - halfHeightDegrees;
  const east = point.lon + halfWidthDegrees;
  const west = point.lon - halfWidthDegrees;

  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south]
  ];
}

export function polylineCorridorPolygon(vertices, widthMeters) {
  const cleanedVertices = removeDuplicateVertices(vertices);
  if (cleanedVertices.length === 0) {
    return [];
  }

  if (cleanedVertices.length === 1) {
    return rectanglePolygonAround(cleanedVertices[0], widthMeters, widthMeters);
  }

  const origin = cleanedVertices[0];
  const localVertices = cleanedVertices.map((vertex) => toLocalMeters(vertex, origin));
  const segments = [];
  for (let index = 1; index < localVertices.length; index += 1) {
    const start = localVertices[index - 1];
    const end = localVertices[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0.05) {
      continue;
    }

    const ux = dx / length;
    const uy = dy / length;
    segments.push({
      start,
      end,
      leftNormal: { x: -uy, y: ux },
      rightNormal: { x: uy, y: -ux }
    });
  }

  if (segments.length === 0) {
    return rectanglePolygonAround(cleanedVertices[0], widthMeters, widthMeters);
  }

  const halfWidth = widthMeters / 2;
  const leftSide = [];
  const rightSide = [];

  for (let index = 0; index < localVertices.length; index += 1) {
    const point = localVertices[index];
    const previousSegment = segments[Math.max(0, index - 1)];
    const nextSegment = segments[Math.min(index, segments.length - 1)];

    leftSide.push(offsetJoinPoint(point, previousSegment, nextSegment, halfWidth, "left"));
    rightSide.push(offsetJoinPoint(point, previousSegment, nextSegment, halfWidth, "right"));
  }

  const ring = [
    ...leftSide,
    ...rightSide.reverse(),
    leftSide[0]
  ];

  return ring.map((point) => fromLocalMeters(point, origin));
}

export function pointToPolylineDistanceMeters(point, vertices) {
  const cleanedVertices = removeDuplicateVertices(vertices);
  if (cleanedVertices.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (cleanedVertices.length === 1) {
    return haversineDistanceMeters(point, cleanedVertices[0]);
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < cleanedVertices.length; index += 1) {
    nearest = Math.min(
      nearest,
      pointToSegmentDistanceMeters(point, cleanedVertices[index - 1], cleanedVertices[index])
    );
  }

  return nearest;
}

export function nearestPointOnPolyline(point, vertices) {
  const cleanedVertices = removeDuplicateVertices(vertices);
  if (cleanedVertices.length === 0) {
    return { point: undefined, distanceMeters: Number.POSITIVE_INFINITY };
  }
  if (cleanedVertices.length === 1) {
    return {
      point: cleanedVertices[0],
      distanceMeters: haversineDistanceMeters(point, cleanedVertices[0])
    };
  }

  let nearest = { point: undefined, distanceMeters: Number.POSITIVE_INFINITY };
  for (let index = 1; index < cleanedVertices.length; index += 1) {
    const candidate = nearestPointOnSegment(point, cleanedVertices[index - 1], cleanedVertices[index]);
    if (candidate.distanceMeters < nearest.distanceMeters) {
      nearest = candidate;
    }
  }
  return nearest;
}

export function pointInPolygon(point, vertices) {
  const cleanedVertices = removeDuplicateVertices(vertices);
  if (cleanedVertices.length < 3) {
    return false;
  }

  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos(degreesToRadians(point.lat)), 0.000001);
  let inside = false;
  const last = cleanedVertices.at(-1);
  let rightX = (last.lon - point.lon) * metersPerDegreeLon;
  let rightY = (last.lat - point.lat) * METERS_PER_DEGREE_LAT;
  for (const left of cleanedVertices) {
    const leftX = (left.lon - point.lon) * metersPerDegreeLon;
    const leftY = (left.lat - point.lat) * METERS_PER_DEGREE_LAT;
    const dx = rightX - leftX;
    const dy = rightY - leftY;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared <= 0
      ? 0
      : Math.max(0, Math.min(1, (-leftX * dx - leftY * dy) / lengthSquared));
    const nearestX = leftX + dx * ratio;
    const nearestY = leftY + dy * ratio;
    if (nearestX * nearestX + nearestY * nearestY <= 0.001 * 0.001) {
      return true;
    }
    const crosses =
      (leftY > 0) !== (rightY > 0) &&
      0 < (dx * -leftY) / dy + leftX;
    if (crosses) {
      inside = !inside;
    }
    rightX = leftX;
    rightY = leftY;
  }
  return inside;
}

export function nearestPointOnPolygon(point, vertices) {
  if (pointInPolygon(point, vertices)) {
    return { point, distanceMeters: 0, inside: true };
  }
  const ring = closeVertices(vertices);
  const nearest = nearestPointOnPolyline(point, ring);
  return { ...nearest, inside: false };
}

export function polylineToPolylineDistanceMeters(leftVertices, rightVertices) {
  const left = removeDuplicateVertices(leftVertices);
  const right = removeDuplicateVertices(rightVertices);
  if (left.length === 0 || right.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (left.length === 1) {
    return pointToPolylineDistanceMeters(left[0], right);
  }
  if (right.length === 1) {
    return pointToPolylineDistanceMeters(right[0], left);
  }

  let nearest = Number.POSITIVE_INFINITY;
  for (let leftIndex = 1; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex < right.length; rightIndex += 1) {
      nearest = Math.min(
        nearest,
        segmentToSegmentDistanceMeters(
          left[leftIndex - 1],
          left[leftIndex],
          right[rightIndex - 1],
          right[rightIndex]
        )
      );
      if (nearest <= 0.001) {
        return 0;
      }
    }
  }
  return nearest;
}

export function offsetPointMeters(point, eastMeters, northMeters) {
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos(degreesToRadians(point.lat)), 0.000001);
  return {
    lat: point.lat + northMeters / METERS_PER_DEGREE_LAT,
    lon: point.lon + eastMeters / metersPerDegreeLon
  };
}

function removeDuplicateVertices(vertices) {
  const cached = CLEANED_VERTICES_CACHE.get(vertices);
  if (cached) {
    return cached;
  }
  const cleaned = [];
  for (const vertex of vertices) {
    if (!Number.isFinite(vertex.lat) || !Number.isFinite(vertex.lon)) {
      continue;
    }

    const previous = cleaned[cleaned.length - 1];
    if (!previous || haversineDistanceMeters(previous, vertex) > 0.05) {
      cleaned.push(vertex);
    }
  }

  CLEANED_VERTICES_CACHE.set(vertices, cleaned);
  return cleaned;
}

function offsetJoinPoint(point, previousSegment, nextSegment, halfWidth, side) {
  const previousNormal = previousSegment[`${side}Normal`];
  const nextNormal = nextSegment[`${side}Normal`];
  const previousOffset = offsetPoint(point, previousNormal, halfWidth);
  const nextOffset = offsetPoint(point, nextNormal, halfWidth);
  const joined = lineIntersection(
    offsetPoint(previousSegment.start, previousNormal, halfWidth),
    previousOffset,
    nextOffset,
    offsetPoint(nextSegment.end, nextNormal, halfWidth)
  );

  if (joined && distanceLocalMeters(point, joined) <= halfWidth * 4) {
    return joined;
  }

  const averageNormal = normalizeVector({
    x: previousNormal.x + nextNormal.x,
    y: previousNormal.y + nextNormal.y
  }) ?? nextNormal;
  return offsetPoint(point, averageNormal, halfWidth);
}

function offsetPoint(point, normal, distanceMeters) {
  return {
    x: point.x + normal.x * distanceMeters,
    y: point.y + normal.y * distanceMeters
  };
}

function lineIntersection(a, b, c, d) {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < 0.000001) {
    return undefined;
  }

  const aCross = a.x * b.y - a.y * b.x;
  const cCross = c.x * d.y - c.y * d.x;
  return {
    x: (aCross * (c.x - d.x) - (a.x - b.x) * cCross) / denominator,
    y: (aCross * (c.y - d.y) - (a.y - b.y) * cCross) / denominator
  };
}

function normalizeVector(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
  if (length <= 0.000001) {
    return undefined;
  }

  return {
    x: vector.x / length,
    y: vector.y / length
  };
}

function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd) {
  return nearestPointOnSegment(point, segmentStart, segmentEnd).distanceMeters;
}

function nearestPointOnSegment(point, segmentStart, segmentEnd) {
  const localPoint = toLocalMeters(point, segmentStart);
  const localEnd = toLocalMeters(segmentEnd, segmentStart);
  const lengthSquared = localEnd.x * localEnd.x + localEnd.y * localEnd.y;
  if (lengthSquared <= 0) {
    return {
      point: segmentStart,
      distanceMeters: haversineDistanceMeters(point, segmentStart)
    };
  }

  const ratio = Math.max(
    0,
    Math.min(1, (localPoint.x * localEnd.x + localPoint.y * localEnd.y) / lengthSquared)
  );
  const closest = {
    x: localEnd.x * ratio,
    y: localEnd.y * ratio
  };

  return {
    point: fromLocalMetersObject(closest, segmentStart),
    distanceMeters: distanceLocalMeters(localPoint, closest)
  };
}

function segmentToSegmentDistanceMeters(a, b, c, d) {
  const localB = toLocalMeters(b, a);
  const localC = toLocalMeters(c, a);
  const localD = toLocalMeters(d, a);
  if (segmentsIntersectLocal({ x: 0, y: 0 }, localB, localC, localD)) {
    return 0;
  }
  return Math.min(
    pointToLocalSegmentDistance({ x: 0, y: 0 }, localC, localD),
    pointToLocalSegmentDistance(localB, localC, localD),
    pointToLocalSegmentDistance(localC, { x: 0, y: 0 }, localB),
    pointToLocalSegmentDistance(localD, { x: 0, y: 0 }, localB)
  );
}

function pointToLocalSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) {
    return distanceLocalMeters(point, start);
  }
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return distanceLocalMeters(point, {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio
  });
}

function segmentsIntersectLocal(a, b, c, d) {
  const orientation = (p, q, r) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  return (
    pointToLocalSegmentDistance(a, c, d) <= 0.001 ||
    pointToLocalSegmentDistance(b, c, d) <= 0.001 ||
    pointToLocalSegmentDistance(c, a, b) <= 0.001 ||
    pointToLocalSegmentDistance(d, a, b) <= 0.001
  );
}

function closeVertices(vertices) {
  if (vertices.length === 0) {
    return [];
  }
  const first = vertices[0];
  const last = vertices.at(-1);
  return haversineDistanceMeters(first, last) <= 0.05
    ? [...vertices]
    : [...vertices, first];
}

function distanceLocalMeters(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function toLocalMeters(point, origin) {
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos(degreesToRadians(origin.lat)), 0.000001);

  return {
    x: (point.lon - origin.lon) * metersPerDegreeLon,
    y: (point.lat - origin.lat) * METERS_PER_DEGREE_LAT
  };
}

function fromLocalMeters(point, origin) {
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos(degreesToRadians(origin.lat)), 0.000001);

  return [
    origin.lon + point.x / metersPerDegreeLon,
    origin.lat + point.y / METERS_PER_DEGREE_LAT
  ];
}

function fromLocalMetersObject(point, origin) {
  const [lon, lat] = fromLocalMeters(point, origin);
  return { lat, lon };
}
