// Coverage is checked over whole segments, including between source vertices.
const COINCIDENT_TOLERANCE_METERS = 0.05;
// Preserve the existing tolerance for alternative matches of the same division object.
const SAME_DIVISION_TOLERANCE_METERS = 2;

export function suppressCoveredReplacements(matches) {
  const latitude = matches.find((match) => match.row.vertices?.length)?.row.vertices[0].lat ?? 0;
  const scaleX = 111_320 * Math.cos((latitude * Math.PI) / 180);
  const rows = matches.map((match, index) => {
    const points = (match.row.vertices ?? []).map((point) => ({
      x: point.lon * scaleX,
      y: point.lat * 111_320,
    }));
    return {
      match,
      index,
      points,
      length: points
        .slice(1)
        .reduce(
          (sum, point, i) => sum + Math.hypot(point.x - points[i].x, point.y - points[i].y),
          0
        ),
      bounds: {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        minY: Math.min(...points.map((point) => point.y)),
        maxY: Math.max(...points.map((point) => point.y)),
      },
    };
  });
  const active = new Set(rows);
  const suppressed = [];
  // Remove contained fragments before considering the longer routes that cover them.
  const ordered = [...rows].sort(
    (a, b) =>
      a.length - b.length ||
      (a.match.score ?? 0) - (b.match.score ?? 0) ||
      String(b.match.division.id).localeCompare(String(a.match.division.id)) ||
      String(b.match.row.id).localeCompare(String(a.match.row.id)) ||
      b.index - a.index
  );
  for (const row of ordered) {
    if (row.points.length < 2 || row.length < 0.001) continue;
    const references = [...active].filter(
      (other) =>
        other !== row &&
        compatible(row.match, other.match) &&
        boundsOverlap(row.bounds, other.bounds, SAME_DIVISION_TOLERANCE_METERS)
    );
    const owners = new Set();
    const covered = row.points.slice(1).every((end, index) => {
      const start = row.points[index];
      const intervals = [];
      for (const other of references) {
        const tolerance =
          String(row.match.division.id) === String(other.match.division.id)
            ? SAME_DIVISION_TOLERANCE_METERS
            : COINCIDENT_TOLERANCE_METERS;
        for (let i = 1; i < other.points.length; i += 1) {
          for (const interval of segmentCoverage(
            start,
            end,
            other.points[i - 1],
            other.points[i],
            tolerance
          )) {
            intervals.push(interval);
            owners.add(String(other.match.division.id));
          }
        }
      }
      intervals.sort((a, b) => a[0] - b[0]);
      let coveredTo = 0;
      for (const [from, to] of intervals) {
        if (from > coveredTo + 1e-9) return false;
        coveredTo = Math.max(coveredTo, to);
        if (coveredTo >= 1 - 1e-9) return true;
      }
      return false;
    });
    if (!covered) continue;
    active.delete(row);
    suppressed.push({
      divisionId: String(row.match.division.id),
      rowId: row.match.row.id,
      coveringDivisionIds: [...owners].sort(),
      reason: 'fully-covered-replacement',
    });
  }
  return {
    replacements: rows.filter((row) => active.has(row)).map((row) => row.match),
    suppressed,
  };
}

function compatible(left, right) {
  return left.division.type === right.division.type;
}

function boundsOverlap(a, b, tolerance) {
  return (
    a.minX <= b.maxX + tolerance &&
    a.maxX >= b.minX - tolerance &&
    a.minY <= b.maxY + tolerance &&
    a.maxY >= b.minY - tolerance
  );
}

function segmentCoverage(a, b, c, d, tolerance) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rx = d.x - c.x;
  const ry = d.y - c.y;
  const length = Math.hypot(rx, ry);
  const intervals = [];
  if (length > 1e-9) {
    const ux = rx / length;
    const uy = ry / length;
    const along = clipLinear((a.x - c.x) * ux + (a.y - c.y) * uy, dx * ux + dy * uy, 0, length);
    const across = clipLinear(
      (a.x - c.x) * -uy + (a.y - c.y) * ux,
      dx * -uy + dy * ux,
      -tolerance,
      tolerance
    );
    if (along && across) {
      const from = Math.max(along[0], across[0]);
      const to = Math.min(along[1], across[1]);
      if (from <= to) intervals.push([from, to]);
    }
  }
  for (const point of [c, d]) {
    const squaredLength = dx * dx + dy * dy;
    if (squaredLength < 1e-18) {
      if (Math.hypot(a.x - point.x, a.y - point.y) <= tolerance) intervals.push([0, 1]);
      continue;
    }
    const center = ((point.x - a.x) * dx + (point.y - a.y) * dy) / squaredLength;
    const distanceSquared = (a.x + center * dx - point.x) ** 2 + (a.y + center * dy - point.y) ** 2;
    if (distanceSquared > tolerance * tolerance) continue;
    const radius = Math.sqrt((tolerance * tolerance - distanceSquared) / squaredLength);
    const from = Math.max(0, center - radius);
    const to = Math.min(1, center + radius);
    if (from <= to) intervals.push([from, to]);
  }
  return intervals;
}

function clipLinear(origin, delta, minimum, maximum) {
  if (Math.abs(delta) < 1e-12) return origin >= minimum && origin <= maximum ? [0, 1] : null;
  const first = (minimum - origin) / delta;
  const second = (maximum - origin) / delta;
  const from = Math.max(0, Math.min(first, second));
  const to = Math.min(1, Math.max(first, second));
  return from <= to ? [from, to] : null;
}
