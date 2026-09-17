import { haversineDistanceMeters } from './extractor/geo.js';

export function connectedTaxiwayRows(rows) {
  const graphs = new Map();
  for (const row of rows ?? []) {
    if (
      row.sourceType !== 'bgl-taxiway-path' ||
      row.classification !== 'taxi-centerline' ||
      (row.centerLineLighted !== true && row.removalEligible !== false) ||
      row.inferred === true ||
      !row.sourceFile ||
      !Number.isInteger(row.graphPointTableOffset) ||
      !Number.isInteger(row.startPointIndex) ||
      !Number.isInteger(row.endPointIndex) ||
      row.startPointIndex === row.endPointIndex ||
      row.vertices?.length !== 2
    )
      continue;
    const key = JSON.stringify([row.sourceFile, row.graphPointTableOffset]);
    if (!graphs.has(key)) graphs.set(key, []);
    graphs.get(key).push(row);
  }

  const result = [];
  for (const graph of graphs.values()) {
    const nodes = new Map();
    for (const row of graph) {
      for (const node of [row.startPointIndex, row.endPointIndex]) {
        if (!nodes.has(node)) nodes.set(node, []);
        nodes.get(node).push(row);
      }
    }
    const visited = new Set();
    const walk = (seed, start) => {
      if (visited.has(seed)) return;
      const members = [];
      const vertices = [];
      let row = seed;
      let node = start;
      while (row && !visited.has(row)) {
        const forward = node === row.startPointIndex;
        const points = forward ? row.vertices : [...row.vertices].reverse();
        if (vertices.length && !samePoint(vertices.at(-1), points[0])) break;
        visited.add(row);
        members.push(row);
        vertices.push(...(vertices.length ? points.slice(1) : points));
        node = forward ? row.endPointIndex : row.startPointIndex;
        const neighbours = nodes.get(node);
        // Only degree-two graph nodes have an unambiguous continuation.
        const next = neighbours.length === 2 ? neighbours.find((item) => item !== row) : null;
        row =
          next && next.widthMeters === seed.widthMeters && next.spacing === seed.spacing
            ? next
            : null;
      }
      // Closed taxiway loops need an ownership boundary, not an arbitrary start vertex.
      if (members.length < 2 || node === start) return;
      const ids = members.map((member) => String(member.id));
      result.push({
        ...seed,
        id: `connected-taxiway:${ids.join(':')}`,
        vertices,
        startPointIndex: start,
        endPointIndex: node,
        sourceRowIds: ids,
        connectedSourceRows: members,
        ...(members.some((member) => member.removalEligible === false)
          ? { removalEligible: false }
          : {}),
        sourceGeometryDerived: 'connected-taxiway-paths',
        evidencePriority:
          Math.max(...members.map((member) => Number(member.evidencePriority) || 99)) + 1,
        lengthMeters: vertices
          .slice(1)
          .reduce(
            (length, point, index) => length + haversineDistanceMeters(vertices[index], point),
            0
          ),
      });
    };
    for (const row of graph) {
      for (const node of [row.startPointIndex, row.endPointIndex]) {
        if (nodes.get(node).length !== 2) walk(row, node);
      }
    }
    for (const row of graph) walk(row, row.startPointIndex);
  }
  return result;
}

function samePoint(left, right) {
  return left.lat === right.lat && left.lon === right.lon;
}
