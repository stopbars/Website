import { isTargetLightClassification, stableId } from './classify.js';

const EARTH_RADIUS_METERS = 6371008.8;
const GRID_CELL_METERS = 40;
const SEARCH_RADIUS_METERS = 100;
const MAX_NEIGHBORS_PER_POINT = 64;
const MAX_CANDIDATES_PER_SIDE = 8;
const HEADING_ALIGNMENT_TOLERANCE_DEGREES = 28;
const HEADING_ERROR_WEIGHT_METERS = 0.75;
const CONTINUATION_SUPPORT_BONUS_METERS = 12;
const MAX_TURN_DEFLECTION_DEGREES = 48;
const ADAPTIVE_LINK_DISTANCE_MULTIPLIER = 6;
const MIN_ADAPTIVE_LINK_DISTANCE_METERS = 30;
const CROSSING_GRID_CELL_METERS = 50;
const MIN_DISTINCT_DISTANCE_METERS = 0.05;
const INSERTION_DISTANCE_METERS = 4;
const INSERTION_LENGTH_RATIO = 1.08;
const MAX_FRAGMENT_JOIN_DISTANCE_METERS = 45;

export const INFERRED_PLACEMENT_ROW_SOURCE_TYPE = 'inferred-bgl-placement-row';

export function inferBglPlacementLightRows(instances) {
  const startedAt = performance.now();
  const sourceInstances = (instances ?? []).filter(isPlacementTarget);
  const fileGroups = Map.groupBy(sourceInstances, (instance) => instance.sourceFile);
  const rows = [];
  const totals = emptyStats();

  for (const group of fileGroups.values()) {
    const result = inferRowsForSourceFile(group);
    rows.push(...result.rows);
    addStats(totals, result.stats);
  }

  totals.rows = rows.length;
  totals.elapsedMilliseconds = roundNumber(performance.now() - startedAt);
  totals.validation = validateInferredPlacementRows(sourceInstances, rows);
  return { rows, stats: totals };
}

export function validateInferredPlacementRows(instances, rows) {
  const sourceById = new Map((instances ?? []).map((instance) => [instance.id, instance]));
  const assignmentCounts = new Map();
  const edgeCounts = new Map();
  let verticesWithoutExactSource = 0;
  let rowsWithFewerThanTwoVertices = 0;
  let excessiveTurnRows = 0;
  for (const row of rows ?? []) {
    const sourceIds = row.sourceInstanceIds ?? [];
    if ((row.vertices?.length ?? 0) < 2 || sourceIds.length < 2) {
      rowsWithFewerThanTwoVertices += 1;
    }
    if ((row.maximumObservedTurnDeflectionDegrees ?? 0) > MAX_TURN_DEFLECTION_DEGREES) {
      excessiveTurnRows += 1;
    }
    for (let index = 0; index < sourceIds.length; index += 1) {
      const id = sourceIds[index];
      assignmentCounts.set(id, (assignmentCounts.get(id) ?? 0) + 1);
      const source = sourceById.get(id);
      const vertex = row.vertices?.[index];
      if (!source || !vertex || source.lat !== vertex.lat || source.lon !== vertex.lon) {
        verticesWithoutExactSource += 1;
      }
      if (index > 0) {
        const edge = [sourceIds[index - 1], id].sort().join('|');
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
      }
    }
  }
  const eligible = (instances ?? []).filter((instance) => !instance.rowInferenceExcluded);
  const unassignedEligiblePlacements = eligible.filter(
    (instance) => !assignmentCounts.has(instance.id)
  ).length;
  const duplicatePlacementAssignments = [...assignmentCounts.values()].filter(
    (count) => count > 1
  ).length;
  const duplicateEdges = [...edgeCounts.values()].filter((count) => count > 1).length;
  return {
    eligiblePlacements: eligible.length,
    unassignedEligiblePlacements,
    duplicatePlacementAssignments,
    duplicateEdges,
    verticesWithoutExactSource,
    rowsWithFewerThanTwoVertices,
    excessiveTurnRows,
    valid:
      unassignedEligiblePlacements === 0 &&
      duplicatePlacementAssignments === 0 &&
      duplicateEdges === 0 &&
      verticesWithoutExactSource === 0 &&
      rowsWithFewerThanTwoVertices === 0 &&
      excessiveTurnRows === 0,
  };
}

function inferRowsForSourceFile(instances) {
  const points = localPoints(instances);
  const nearby = buildNearbyLists(points);
  const candidateResult = buildCandidateEdges(points, nearby);
  const graph = buildPathGraph(points, candidateResult.initialEdges);
  insertUnassignedPoints(points, graph, candidateResult.edges);
  attachUnassignedEndpoints(points, graph, candidateResult.edges);
  attachBySplittingInternalEdges(points, graph, candidateResult.byPoint);
  joinCompatiblePathEndpoints(points, graph, candidateResult.edges);

  const paths = orderedGraphPaths(points, graph);
  const rows = paths.map((path, index) => buildRow(points, graph, path, index));
  const assigned = new Set(paths.flat());
  const excluded = [];
  for (const point of points) {
    if (assigned.has(point.index)) {
      continue;
    }
    point.instance.originalClassification = point.instance.classification;
    point.instance.classification = 'unknown-light';
    point.instance.rowInferenceExcluded = true;
    point.instance.rowInferenceExclusionReason =
      candidateResult.byPoint[point.index].length === 0
        ? `no heading-compatible target light within ${SEARCH_RADIUS_METERS} m`
        : 'no non-crossing degree-limited row connection remained';
    point.instance.classificationReasons = [
      ...(point.instance.classificationReasons ?? []),
      point.instance.rowInferenceExclusionReason,
    ];
    excluded.push(point.index);
  }

  return {
    rows,
    stats: {
      inputPlacements: points.length,
      assignedPlacements: assigned.size,
      excludedOutliers: excluded.length,
      candidatePairsChecked: candidateResult.pairsChecked,
      headingCompatibleCandidates: candidateResult.headingCompatible,
      retainedCandidates: candidateResult.edges.length,
      adaptiveInitialCandidates: candidateResult.initialEdges.length,
      selectedEdges: graph.edges.size,
      crossingCandidatesRejected: graph.crossingRejections,
      turnCandidatesRejected: graph.turnRejections,
      insertedPlacements: graph.insertedPlacements,
      joinedPathFragments: graph.joinedPathFragments,
      rows: rows.length,
      maximumObservedLinkDistanceMeters: roundNumber(
        maximumSelectedEdgeValue(graph, 'distanceMeters')
      ),
      maximumObservedHeadingErrorDegrees: roundNumber(
        maximumSelectedEdgeValue(graph, 'maximumHeadingErrorDegrees')
      ),
      maximumObservedTurnDeflectionDegrees: roundNumber(maximumPathTurnDeflection(points, paths)),
    },
  };
}

function isPlacementTarget(instance) {
  return (
    instance?.sourceType === 'library-object' &&
    isTargetLightClassification(instance.classification) &&
    Number.isFinite(instance.lat) &&
    Number.isFinite(instance.lon) &&
    Number.isFinite(instance.heading) &&
    typeof instance.guid === 'string'
  );
}

function localPoints(instances) {
  const latitude =
    instances.reduce((sum, instance) => sum + instance.lat, 0) / Math.max(instances.length, 1);
  const longitude =
    instances.reduce((sum, instance) => sum + instance.lon, 0) / Math.max(instances.length, 1);
  const radians = Math.PI / 180;
  const metersPerDegreeLatitude = EARTH_RADIUS_METERS * radians;
  const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(latitude * radians);
  return instances.map((instance, index) => ({
    index,
    instance,
    x: (instance.lon - longitude) * metersPerDegreeLongitude,
    y: (instance.lat - latitude) * metersPerDegreeLatitude,
  }));
}

function buildNearbyLists(points) {
  const grid = new Map();
  for (const point of points) {
    const key = gridKey(point.x, point.y, GRID_CELL_METERS);
    if (!grid.has(key)) {
      grid.set(key, []);
    }
    grid.get(key).push(point);
  }

  const cellRadius = Math.ceil(SEARCH_RADIUS_METERS / GRID_CELL_METERS);
  return points.map((point) => {
    const cellX = Math.floor(point.x / GRID_CELL_METERS);
    const cellY = Math.floor(point.y / GRID_CELL_METERS);
    const neighbors = [];
    for (let x = cellX - cellRadius; x <= cellX + cellRadius; x += 1) {
      for (let y = cellY - cellRadius; y <= cellY + cellRadius; y += 1) {
        for (const candidate of grid.get(`${x},${y}`) ?? []) {
          if (candidate.index === point.index) {
            continue;
          }
          const dx = candidate.x - point.x;
          const dy = candidate.y - point.y;
          const distanceMeters = Math.hypot(dx, dy);
          if (
            distanceMeters < MIN_DISTINCT_DISTANCE_METERS ||
            distanceMeters > SEARCH_RADIUS_METERS
          ) {
            continue;
          }
          neighbors.push({
            index: candidate.index,
            dx,
            dy,
            distanceMeters,
            bearingDegrees: modulo180((Math.atan2(dx, dy) * 180) / Math.PI),
          });
        }
      }
    }
    neighbors.sort((left, right) => left.distanceMeters - right.distanceMeters);
    return neighbors.slice(0, MAX_NEIGHBORS_PER_POINT);
  });
}

function buildCandidateEdges(points, nearby) {
  const slotKeys = ['0:negative', '0:positive', '90:negative', '90:positive'];
  const byPointAndSide = points.map(() => Object.fromEntries(slotKeys.map((key) => [key, []])));
  const nearestCompatibleDistance = points.map(() => Number.POSITIVE_INFINITY);
  const candidateEdges = [];
  let pairsChecked = 0;
  let headingCompatible = 0;
  for (const point of points) {
    for (const neighbor of nearby[point.index]) {
      if (neighbor.index <= point.index) {
        continue;
      }
      pairsChecked += 1;
      const other = points[neighbor.index];
      if (
        !classificationsCanShareRow(point.instance.classification, other.instance.classification)
      ) {
        continue;
      }
      const leftAlignment = bestHeadingAlignment(
        point,
        neighbor.bearingDegrees,
        neighbor.dx,
        neighbor.dy
      );
      const rightAlignment = bestHeadingAlignment(
        other,
        neighbor.bearingDegrees,
        -neighbor.dx,
        -neighbor.dy
      );
      const leftError = leftAlignment.errorDegrees;
      const rightError = rightAlignment.errorDegrees;
      const maximumHeadingErrorDegrees = Math.max(leftError, rightError);
      if (maximumHeadingErrorDegrees > HEADING_ALIGNMENT_TOLERANCE_DEGREES) {
        continue;
      }
      headingCompatible += 1;
      const leftSide = leftAlignment.side;
      const rightSide = rightAlignment.side;
      const crossModelPenalty = point.instance.guid === other.instance.guid ? 1 : 1.08;
      // Distance alone incorrectly stitches adjacent parallel rows through their
      // closest cross-row pair. Treat the decoded placement headings as a real
      // geometric signal: a slightly longer continuation with a near-zero
      // heading error must beat a short, barely-tolerated perpendicular link.
      const score =
        neighbor.distanceMeters * crossModelPenalty +
        (leftError + rightError) * HEADING_ERROR_WEIGHT_METERS;
      const edge = {
        key: edgeKey(point.index, other.index),
        left: point.index,
        right: other.index,
        leftSide,
        rightSide,
        leftOffsetDegrees: leftAlignment.offsetDegrees,
        rightOffsetDegrees: rightAlignment.offsetDegrees,
        distanceMeters: neighbor.distanceMeters,
        maximumHeadingErrorDegrees,
        score,
      };
      candidateEdges.push(edge);
      nearestCompatibleDistance[point.index] = Math.min(
        nearestCompatibleDistance[point.index],
        neighbor.distanceMeters
      );
      nearestCompatibleDistance[other.index] = Math.min(
        nearestCompatibleDistance[other.index],
        neighbor.distanceMeters
      );
      byPointAndSide[point.index][`${leftAlignment.offsetDegrees}:${leftSide}`].push(edge);
      byPointAndSide[other.index][`${rightAlignment.offsetDegrees}:${rightSide}`].push(edge);
    }
  }

  for (const edge of candidateEdges) {
    edge.continuationSupport =
      Number(
        hasContinuationCandidate(
          byPointAndSide[edge.left],
          edge.leftOffsetDegrees,
          oppositeSide(edge.leftSide),
          edge
        )
      ) +
      Number(
        hasContinuationCandidate(
          byPointAndSide[edge.right],
          edge.rightOffsetDegrees,
          oppositeSide(edge.rightSide),
          edge
        )
      );
    edge.score -= edge.continuationSupport * CONTINUATION_SUPPORT_BONUS_METERS;
  }

  const retained = new Map();
  for (const sides of byPointAndSide) {
    for (const slotKey of slotKeys) {
      sides[slotKey].sort(compareCandidateEdges);
      for (const edge of sides[slotKey].slice(0, MAX_CANDIDATES_PER_SIDE)) {
        retained.set(edge.key, edge);
      }
    }
  }
  const edges = [...retained.values()].sort(compareCandidateEdges);
  const initialEdges = edges.filter(
    (edge) =>
      edge.distanceMeters <=
      Math.max(
        MIN_ADAPTIVE_LINK_DISTANCE_METERS,
        Math.min(nearestCompatibleDistance[edge.left], nearestCompatibleDistance[edge.right]) *
          ADAPTIVE_LINK_DISTANCE_MULTIPLIER
      )
  );
  const byPoint = points.map(() => []);
  for (const edge of edges) {
    byPoint[edge.left].push(edge);
    byPoint[edge.right].push(edge);
  }
  for (const list of byPoint) {
    list.sort(compareCandidateEdges);
  }
  return { edges, initialEdges, byPoint, pairsChecked, headingCompatible };
}

function hasContinuationCandidate(sides, offsetDegrees, side, currentEdge) {
  return sides[`${offsetDegrees}:${side}`].some(
    (edge) => edge !== currentEdge && edge.distanceMeters <= MAX_FRAGMENT_JOIN_DISTANCE_METERS
  );
}

function oppositeSide(side) {
  return side === 'positive' ? 'negative' : 'positive';
}

function classificationsCanShareRow(left, right) {
  return (left === 'stopbar') === (right === 'stopbar');
}

function bestHeadingAlignment(point, bearingDegrees, dx, dy) {
  const parallelError = undirectedAngleDifferenceDegrees(bearingDegrees, point.instance.heading);
  const perpendicularError = undirectedAngleDifferenceDegrees(
    bearingDegrees,
    point.instance.heading + 90
  );
  const offsetDegrees = perpendicularError < parallelError ? 90 : 0;
  const tangentDegrees = modulo180(point.instance.heading + offsetDegrees);
  return {
    offsetDegrees,
    errorDegrees: Math.min(parallelError, perpendicularError),
    side: sideForVector(tangentDegrees, dx, dy),
  };
}

function compareCandidateEdges(left, right) {
  return (
    left.score - right.score ||
    left.distanceMeters - right.distanceMeters ||
    left.left - right.left ||
    left.right - right.right
  );
}

function sideForVector(tangentDegrees, dx, dy) {
  const tangentRadians = (tangentDegrees * Math.PI) / 180;
  const projection = dx * Math.sin(tangentRadians) + dy * Math.cos(tangentRadians);
  return projection >= 0 ? 'positive' : 'negative';
}

function buildPathGraph(points, candidates) {
  const graph = {
    adjacency: points.map(() => new Set()),
    sideEdges: points.map(() => ({ negative: undefined, positive: undefined })),
    tangentOffsets: points.map(() => undefined),
    edges: new Map(),
    edgeGrid: new Map(),
    parents: points.map((_, index) => index),
    crossingRejections: 0,
    turnRejections: 0,
    insertedPlacements: 0,
    joinedPathFragments: 0,
  };
  for (const candidate of candidates) {
    tryAddEdge(points, graph, candidate, true);
  }
  return graph;
}

function tryAddEdge(points, graph, edge, preventCycles) {
  if (
    (graph.tangentOffsets[edge.left] !== undefined &&
      graph.tangentOffsets[edge.left] !== edge.leftOffsetDegrees) ||
    (graph.tangentOffsets[edge.right] !== undefined &&
      graph.tangentOffsets[edge.right] !== edge.rightOffsetDegrees) ||
    graph.sideEdges[edge.left][edge.leftSide] ||
    graph.sideEdges[edge.right][edge.rightSide]
  ) {
    return false;
  }
  if (preventCycles && findRoot(graph.parents, edge.left) === findRoot(graph.parents, edge.right)) {
    return false;
  }
  if (
    !turnIsValid(points, graph, edge.left, edge.right) ||
    !turnIsValid(points, graph, edge.right, edge.left)
  ) {
    graph.turnRejections += 1;
    return false;
  }
  if (edgeCrossesGraph(points, graph, edge)) {
    graph.crossingRejections += 1;
    return false;
  }
  addEdge(points, graph, edge);
  unionRoots(graph.parents, edge.left, edge.right);
  return true;
}

function addEdge(points, graph, edge) {
  graph.edges.set(edge.key, edge);
  graph.adjacency[edge.left].add(edge.right);
  graph.adjacency[edge.right].add(edge.left);
  graph.sideEdges[edge.left][edge.leftSide] = edge.key;
  graph.sideEdges[edge.right][edge.rightSide] = edge.key;
  graph.tangentOffsets[edge.left] ??= edge.leftOffsetDegrees;
  graph.tangentOffsets[edge.right] ??= edge.rightOffsetDegrees;
  indexEdge(points, graph, edge);
}

function removeEdge(graph, edge) {
  graph.edges.delete(edge.key);
  graph.adjacency[edge.left].delete(edge.right);
  graph.adjacency[edge.right].delete(edge.left);
  if (graph.sideEdges[edge.left][edge.leftSide] === edge.key) {
    graph.sideEdges[edge.left][edge.leftSide] = undefined;
  }
  if (graph.sideEdges[edge.right][edge.rightSide] === edge.key) {
    graph.sideEdges[edge.right][edge.rightSide] = undefined;
  }
}

function turnIsValid(points, graph, pointIndex, candidateIndex) {
  const neighbors = [...graph.adjacency[pointIndex]];
  if (neighbors.length === 0) {
    return true;
  }
  const point = points[pointIndex];
  const existing = points[neighbors[0]];
  const candidate = points[candidateIndex];
  const angle = directedAngleDegrees(
    existing.x - point.x,
    existing.y - point.y,
    candidate.x - point.x,
    candidate.y - point.y
  );
  return 180 - angle <= MAX_TURN_DEFLECTION_DEGREES;
}

function edgeCrossesGraph(points, graph, edge) {
  const cells = edgeGridCells(points[edge.left], points[edge.right], CROSSING_GRID_CELL_METERS);
  const possible = new Set(cells.flatMap((cell) => graph.edgeGrid.get(cell) ?? []));
  for (const key of possible) {
    const existing = graph.edges.get(key);
    if (!existing || sharesEndpoint(edge, existing)) {
      continue;
    }
    if (
      segmentsProperlyIntersect(
        points[edge.left],
        points[edge.right],
        points[existing.left],
        points[existing.right]
      )
    ) {
      const crossingAngle = undirectedAngleDifferenceDegrees(
        segmentBearingDegrees(points[edge.left], points[edge.right]),
        segmentBearingDegrees(points[existing.left], points[existing.right])
      );
      if (crossingAngle < 35) {
        return true;
      }
    }
  }
  return false;
}

function segmentBearingDegrees(left, right) {
  return modulo180((Math.atan2(right.x - left.x, right.y - left.y) * 180) / Math.PI);
}

function indexEdge(points, graph, edge) {
  for (const cell of edgeGridCells(
    points[edge.left],
    points[edge.right],
    CROSSING_GRID_CELL_METERS
  )) {
    if (!graph.edgeGrid.has(cell)) {
      graph.edgeGrid.set(cell, []);
    }
    graph.edgeGrid.get(cell).push(edge.key);
  }
}

function edgeGridCells(left, right, cellSize) {
  const minX = Math.floor(Math.min(left.x, right.x) / cellSize);
  const maxX = Math.floor(Math.max(left.x, right.x) / cellSize);
  const minY = Math.floor(Math.min(left.y, right.y) / cellSize);
  const maxY = Math.floor(Math.max(left.y, right.y) / cellSize);
  const cells = [];
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      cells.push(`${x},${y}`);
    }
  }
  return cells;
}

function insertUnassignedPoints(points, graph, candidates) {
  const candidatesByPoint = points.map(() => []);
  for (const edge of candidates) {
    candidatesByPoint[edge.left].push(edge);
    candidatesByPoint[edge.right].push(edge);
  }
  for (const point of points) {
    if (graph.adjacency[point.index].size > 0) {
      continue;
    }
    let best;
    for (const existing of graph.edges.values()) {
      const projection = pointToSegment(point, points[existing.left], points[existing.right]);
      if (
        projection.distanceMeters > INSERTION_DISTANCE_METERS ||
        projection.ratio <= 0.02 ||
        projection.ratio >= 0.98
      ) {
        continue;
      }
      const leftDistance = Math.hypot(
        point.x - points[existing.left].x,
        point.y - points[existing.left].y
      );
      const rightDistance = Math.hypot(
        point.x - points[existing.right].x,
        point.y - points[existing.right].y
      );
      if ((leftDistance + rightDistance) / existing.distanceMeters > INSERTION_LENGTH_RATIO) {
        continue;
      }
      const leftCandidate = candidatesByPoint[point.index].find(
        (edge) => otherIndex(edge, point.index) === existing.left
      );
      const rightCandidate = candidatesByPoint[point.index].find(
        (edge) => otherIndex(edge, point.index) === existing.right
      );
      if (!leftCandidate || !rightCandidate) {
        continue;
      }
      const score = projection.distanceMeters + leftCandidate.score + rightCandidate.score;
      if (!best || score < best.score) {
        best = { existing, leftCandidate, rightCandidate, score };
      }
    }
    if (!best) {
      continue;
    }
    removeEdge(graph, best.existing);
    addEdge(points, graph, best.leftCandidate);
    addEdge(points, graph, best.rightCandidate);
    graph.insertedPlacements += 1;
  }
}

function attachUnassignedEndpoints(points, graph, candidates) {
  for (const edge of candidates) {
    const leftAssigned = graph.adjacency[edge.left].size > 0;
    const rightAssigned = graph.adjacency[edge.right].size > 0;
    if (leftAssigned && rightAssigned) {
      continue;
    }
    tryAddEdge(points, graph, edge, true);
  }
}

function attachBySplittingInternalEdges(points, graph, candidatesByPoint) {
  for (const point of points) {
    if (graph.adjacency[point.index].size > 0) {
      continue;
    }
    for (const candidate of candidatesByPoint[point.index]) {
      const neighborIndex = otherIndex(candidate, point.index);
      const neighborSide =
        candidate.left === neighborIndex ? candidate.leftSide : candidate.rightSide;
      const occupiedKey = graph.sideEdges[neighborIndex][neighborSide];
      const occupied = graph.edges.get(occupiedKey);
      if (!occupied) {
        continue;
      }
      const displacedIndex = otherIndex(occupied, neighborIndex);
      if (graph.adjacency[displacedIndex].size !== 2) {
        continue;
      }
      removeEdge(graph, occupied);
      if (tryAddEdge(points, graph, candidate, false)) {
        break;
      }
      addEdge(points, graph, occupied);
    }
  }
}

function joinCompatiblePathEndpoints(points, graph, candidates) {
  rebuildGraphParents(graph);
  for (const candidate of candidates) {
    if (candidate.distanceMeters > MAX_FRAGMENT_JOIN_DISTANCE_METERS) {
      continue;
    }
    if (
      graph.adjacency[candidate.left].size !== 1 ||
      graph.adjacency[candidate.right].size !== 1 ||
      findRoot(graph.parents, candidate.left) === findRoot(graph.parents, candidate.right)
    ) {
      continue;
    }
    if (tryAddEdge(points, graph, candidate, true)) {
      graph.joinedPathFragments += 1;
    }
  }
}

function rebuildGraphParents(graph) {
  graph.parents = graph.adjacency.map((_, index) => index);
  for (const edge of graph.edges.values()) {
    unionRoots(graph.parents, edge.left, edge.right);
  }
}

function orderedGraphPaths(points, graph) {
  const visited = new Set();
  const paths = [];
  const starts = points.filter((point) => graph.adjacency[point.index].size === 1);
  for (const start of starts) {
    if (visited.has(start.index)) {
      continue;
    }
    paths.push(walkComponent(start.index, graph.adjacency, visited));
  }
  for (const point of points) {
    if (graph.adjacency[point.index].size > 0 && !visited.has(point.index)) {
      paths.push(walkComponent(point.index, graph.adjacency, visited));
    }
  }
  return paths.filter((path) => path.length >= 2);
}

function walkComponent(start, adjacency, visited) {
  const path = [];
  let previous = -1;
  let current = start;
  while (current !== undefined && !visited.has(current)) {
    visited.add(current);
    path.push(current);
    const next = [...adjacency[current]].find(
      (candidate) => candidate !== previous && !visited.has(candidate)
    );
    previous = current;
    current = next;
  }
  return path;
}

function buildRow(points, graph, path, pathIndex) {
  const pathPoints = path.map((index) => points[index]);
  const instances = pathPoints.map((point) => point.instance);
  const sourceInstanceIds = instances.map((instance) => instance.id);
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Offset extraction and integer validation are separate provenance stages on one short row.
  const sourceOffsets = instances
    .map((instance) => instance.sourceRecordOffset)
    .filter(Number.isInteger)
    .sort((left, right) => left - right);
  const classifications = [...new Set(instances.map((instance) => instance.classification))];
  // oxlint-disable-next-line react-doctor/js-flatmap-filter -- One row has few instances and explicit falsy-name removal documents the Set input.
  const presets = [...new Set(instances.map((instance) => instance.name).filter(Boolean))];
  const modelGuids = [...new Set(instances.map((instance) => instance.guid))];
  const pathEdges = [];
  for (let index = 1; index < path.length; index += 1) {
    const edge = graph.edges.get(edgeKey(path[index - 1], path[index]));
    if (edge) {
      pathEdges.push(edge);
    }
  }
  const classification = rowClassification(classifications);
  const id = stableId(
    INFERRED_PLACEMENT_ROW_SOURCE_TYPE,
    instances[0].sourceFile,
    sourceInstanceIds.join(','),
    pathIndex
  );
  for (const instance of instances) {
    instance.inferredPlacementRowId = id;
  }
  return {
    id,
    sourceFile: instances[0].sourceFile,
    sourceType: INFERRED_PLACEMENT_ROW_SOURCE_TYPE,
    sourceRecordOffset: sourceOffsets[0],
    sourceRecordEndOffset: sourceOffsets.at(-1),
    rawTag: 'Inferred BGL placement light row',
    ...(presets.length === 1 ? { preset: presets[0] } : {}),
    sourcePresets: presets,
    sourceModelGuids: modelGuids,
    sourceClassifications: classifications,
    classification,
    confidence: 0.78,
    vertices: instances.map((instance) => ({ lat: instance.lat, lon: instance.lon })),
    snapToVertices: true,
    inferred: true,
    inference: 'grid-indexed exact-placement heading graph',
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds,
    sourcePlacementCount: instances.length,
    tangentOffsetUsageByModelGuid: Object.fromEntries(
      modelGuids.map((guid) => {
        const matching = pathPoints.filter((point) => point.instance.guid === guid);
        return [
          guid,
          {
            parallelPlacements: matching.filter((point) => graph.tangentOffsets[point.index] === 0)
              .length,
            perpendicularPlacements: matching.filter(
              (point) => graph.tangentOffsets[point.index] === 90
            ).length,
          },
        ];
      })
    ),
    headingAlignmentToleranceDegrees: HEADING_ALIGNMENT_TOLERANCE_DEGREES,
    maximumLinkDistanceMeters: SEARCH_RADIUS_METERS,
    maximumObservedLinkDistanceMeters: roundNumber(
      Math.max(0, ...pathEdges.map((edge) => edge.distanceMeters))
    ),
    maximumObservedHeadingErrorDegrees: roundNumber(
      Math.max(0, ...pathEdges.map((edge) => edge.maximumHeadingErrorDegrees))
    ),
    maximumObservedTurnDeflectionDegrees: roundNumber(pathTurnDeflection(points, path)),
    sourceBasis: 'exact decoded BGL 0x0B placement coordinates and headings',
    relationshipBasis: 'grid-indexed degree-limited non-crossing heading-compatible graph',
  };
}

function rowClassification(classifications) {
  if (classifications.length === 1) {
    return classifications[0];
  }
  if (classifications.includes('taxi-centerline')) {
    return 'taxi-centerline';
  }
  if (classifications.includes('lead-on')) {
    return 'lead-on';
  }
  return 'stopbar';
}

function maximumPathTurnDeflection(points, paths) {
  return Math.max(0, ...paths.map((path) => pathTurnDeflection(points, path)));
}

function pathTurnDeflection(points, path) {
  let maximum = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = points[path[index - 1]];
    const current = points[path[index]];
    const next = points[path[index + 1]];
    const angle = directedAngleDegrees(
      previous.x - current.x,
      previous.y - current.y,
      next.x - current.x,
      next.y - current.y
    );
    maximum = Math.max(maximum, 180 - angle);
  }
  return maximum;
}

function maximumSelectedEdgeValue(graph, property) {
  return Math.max(0, ...[...graph.edges.values()].map((edge) => edge[property] ?? 0));
}

function pointToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return { ratio: 0, distanceMeters: Math.hypot(point.x - start.x, point.y - start.y) };
  }
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
  );
  return {
    ratio,
    distanceMeters: Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio)),
  };
}

function segmentsProperlyIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function sharesEndpoint(left, right) {
  return (
    left.left === right.left ||
    left.left === right.right ||
    left.right === right.left ||
    left.right === right.right
  );
}

function directedAngleDegrees(ax, ay, bx, by) {
  const leftLength = Math.hypot(ax, ay);
  const rightLength = Math.hypot(bx, by);
  if (leftLength === 0 || rightLength === 0) {
    return 0;
  }
  const cosine = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (leftLength * rightLength)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function undirectedAngleDifferenceDegrees(left, right) {
  const difference = Math.abs(modulo180(left) - modulo180(right));
  return Math.min(difference, 180 - difference);
}

function otherIndex(edge, index) {
  return edge.left === index ? edge.right : edge.left;
}

function edgeKey(left, right) {
  return `${Math.min(left, right)}:${Math.max(left, right)}`;
}

function gridKey(x, y, cellSize) {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
}

function findRoot(parents, index) {
  let root = index;
  while (parents[root] !== root) {
    root = parents[root];
  }
  while (parents[index] !== index) {
    const next = parents[index];
    parents[index] = root;
    index = next;
  }
  return root;
}

function unionRoots(parents, left, right) {
  const leftRoot = findRoot(parents, left);
  const rightRoot = findRoot(parents, right);
  if (leftRoot !== rightRoot) {
    parents[rightRoot] = leftRoot;
  }
}

function modulo180(value) {
  return ((value % 180) + 180) % 180;
}

function roundNumber(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function emptyStats() {
  return {
    inputPlacements: 0,
    assignedPlacements: 0,
    excludedOutliers: 0,
    candidatePairsChecked: 0,
    headingCompatibleCandidates: 0,
    retainedCandidates: 0,
    adaptiveInitialCandidates: 0,
    selectedEdges: 0,
    crossingCandidatesRejected: 0,
    turnCandidatesRejected: 0,
    insertedPlacements: 0,
    joinedPathFragments: 0,
    rows: 0,
    maximumObservedLinkDistanceMeters: 0,
    maximumObservedHeadingErrorDegrees: 0,
    maximumObservedTurnDeflectionDegrees: 0,
    elapsedMilliseconds: 0,
  };
}

function addStats(target, source) {
  for (const key of [
    'inputPlacements',
    'assignedPlacements',
    'excludedOutliers',
    'candidatePairsChecked',
    'headingCompatibleCandidates',
    'retainedCandidates',
    'adaptiveInitialCandidates',
    'selectedEdges',
    'crossingCandidatesRejected',
    'turnCandidatesRejected',
    'insertedPlacements',
    'joinedPathFragments',
  ]) {
    target[key] += source[key] ?? 0;
  }
  for (const key of [
    'maximumObservedLinkDistanceMeters',
    'maximumObservedHeadingErrorDegrees',
    'maximumObservedTurnDeflectionDegrees',
  ]) {
    target[key] = Math.max(target[key], source[key] ?? 0);
  }
}
