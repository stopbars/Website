const NEIGHBOR_COUNT = 8;

export const ADJACENT_COLOR_PALETTE = [
  '#0067ff',
  '#ff7a00',
  '#00a651',
  '#ff2da0',
  '#00cde8',
  '#ffd400',
  '#7a3cff',
  '#e31a1c',
  '#7fd000',
];
const PALETTE_RGB = new Map(ADJACENT_COLOR_PALETTE.map((color) => [color, hexToRgb(color)]));

export function assignAdjacentColors(items) {
  const coordinatesById = new Map();
  for (const item of items ?? []) {
    const id = String(item?.id ?? '');
    if (!id) continue;
    const coordinates = coordinatesById.get(id) ?? [];
    coordinates.push(...(item.coordinates ?? []).filter(validCoordinate));
    coordinatesById.set(id, coordinates);
  }

  const nodes = [...coordinatesById].map(([id, coordinates]) => ({
    id,
    position: coordinateCenter(coordinates),
    neighbors: new Set(),
  }));
  const positionedNodes = nodes.filter((node) => node.position);
  for (const node of positionedNodes) node.vector = coordinateVector(node.position);
  const nodeIndex = buildNodeIndex(positionedNodes);
  for (const node of positionedNodes) {
    const nearest = nearestNodes(node, nodeIndex);
    for (const { candidate } of nearest) {
      node.neighbors.add(candidate.id);
      candidate.neighbors.add(node.id);
    }
  }

  const usage = new Map(ADJACENT_COLOR_PALETTE.map((color) => [color, 0]));
  const colors = new Map();
  const orderedNodes = Array.from(nodes).sort(
    (left, right) => right.neighbors.size - left.neighbors.size || left.id.localeCompare(right.id)
  );
  for (const node of orderedNodes) {
    const neighborColors = [];
    for (const id of node.neighbors) {
      const neighborColor = colors.get(id);
      if (neighborColor) neighborColors.push(neighborColor);
    }
    const startIndex = stableHash(node.id) % ADJACENT_COLOR_PALETTE.length;
    let color = ADJACENT_COLOR_PALETTE[0];
    let bestScore = -Infinity;
    for (let paletteIndex = 0; paletteIndex < ADJACENT_COLOR_PALETTE.length; paletteIndex += 1) {
      const candidate = ADJACENT_COLOR_PALETTE[paletteIndex];
      const score = colorScore(candidate, paletteIndex, neighborColors, usage, startIndex);
      if (score > bestScore) {
        color = candidate;
        bestScore = score;
      }
    }
    colors.set(node.id, color);
    usage.set(color, usage.get(color) + 1);
  }
  return colors;
}

function nearestNodes(node, index) {
  const nearest = [];
  const visit = (branch) => {
    if (!branch) return;
    const axisDelta = node.vector[branch.axis] - branch.node.vector[branch.axis];
    const nearBranch = axisDelta <= 0 ? branch.left : branch.right;
    const farBranch = axisDelta <= 0 ? branch.right : branch.left;
    visit(nearBranch);
    if (branch.node !== node) {
      insertNearestEntry(nearest, {
        candidate: branch.node,
        distance: haversineDistanceMeters(node.position, branch.node.position),
        chordSquared: vectorDistanceSquared(node.vector, branch.node.vector),
      });
    }
    const maximumChordSquared =
      nearest.length < NEIGHBOR_COUNT ? Infinity : nearest.at(-1).chordSquared;
    if (axisDelta * axisDelta <= maximumChordSquared) visit(farBranch);
  };
  visit(index);
  return nearest;
}

function insertNearestEntry(nearest, entry) {
  let insertionIndex = nearest.length;
  while (
    insertionIndex > 0 &&
    compareNearestEntries(entry, nearest[insertionIndex - 1]) < 0
  ) {
    insertionIndex -= 1;
  }
  if (insertionIndex >= NEIGHBOR_COUNT) return;
  nearest.splice(insertionIndex, 0, entry);
  if (nearest.length > NEIGHBOR_COUNT) nearest.pop();
}

function compareNearestEntries(left, right) {
  return (
    left.distance - right.distance || left.candidate.id.localeCompare(right.candidate.id)
  );
}

function buildNodeIndex(nodes, depth = 0) {
  if (nodes.length === 0) return null;
  const axis = depth % 3;
  const ordered = Array.from(nodes).sort(
    (left, right) => left.vector[axis] - right.vector[axis] || left.id.localeCompare(right.id)
  );
  const middle = Math.floor(ordered.length / 2);
  return {
    node: ordered[middle],
    axis,
    left: buildNodeIndex(ordered.slice(0, middle), depth + 1),
    right: buildNodeIndex(ordered.slice(middle + 1), depth + 1),
  };
}

function coordinateVector({ lon, lat }) {
  const longitude = (lon * Math.PI) / 180;
  const latitude = (lat * Math.PI) / 180;
  const latitudeScale = Math.cos(latitude);
  return [
    latitudeScale * Math.cos(longitude),
    latitudeScale * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function vectorDistanceSquared(left, right) {
  return (
    (left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2
  );
}

function validCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    Number.isFinite(coordinate[0]) &&
    Number.isFinite(coordinate[1])
  );
}

function coordinateCenter(coordinates) {
  if (coordinates.length === 0) return null;
  return {
    lon: coordinates.reduce((sum, coordinate) => sum + coordinate[0], 0) / coordinates.length,
    lat: coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length,
  };
}

function haversineDistanceMeters(left, right) {
  const toRadians = Math.PI / 180;
  const latitudeDelta = (right.lat - left.lat) * toRadians;
  const longitudeDelta = (right.lon - left.lon) * toRadians;
  const leftLatitude = left.lat * toRadians;
  const rightLatitude = right.lat * toRadians;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function colorScore(color, paletteIndex, neighborColors, usage, startIndex) {
  let separation = 0;
  let duplicateNeighborPenalty = 0;
  if (neighborColors.length > 0) {
    separation = Infinity;
    for (const neighborColor of neighborColors) {
      if (neighborColor === color) duplicateNeighborPenalty = 10_000;
      separation = Math.min(separation, rgbDistance(color, neighborColor));
    }
  }
  const preference =
    (paletteIndex - startIndex + ADJACENT_COLOR_PALETTE.length) %
    ADJACENT_COLOR_PALETTE.length;
  return separation * 10 - duplicateNeighborPenalty - usage.get(color) * 5 - preference * 0.01;
}

function rgbDistance(left, right) {
  const leftRgb = PALETTE_RGB.get(left) ?? hexToRgb(left);
  const rightRgb = PALETTE_RGB.get(right) ?? hexToRgb(right);
  return Math.hypot(
    leftRgb.red - rightRgb.red,
    leftRgb.green - rightRgb.green,
    leftRgb.blue - rightRgb.blue
  );
}

function hexToRgb(color) {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
}

function stableHash(value) {
  const text = String(value ?? 'unassigned');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
