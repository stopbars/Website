const OPERATIONAL_FIELDS = [
  'type',
  'coordinates',
  'directionality',
  'color',
  'elevated',
  'ihp',
];

export function deduplicateExactDivisionPoints(points) {
  const deduplicated = [];
  const seen = new Set();

  for (const point of points ?? []) {
    const signature = JSON.stringify(
      OPERATIONAL_FIELDS.map((field) =>
        field === 'coordinates'
          ? coordinateSignature(point?.coordinates, point?.directionality)
          : signatureValue(point?.[field])
      )
    );
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduplicated.push(point);
  }

  return deduplicated;
}

function coordinateSignature(coordinates, directionality) {
  const forward = signatureValue(coordinates);
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    directionality === 'uni-directional'
  ) {
    return forward;
  }

  const reverse = signatureValue([...coordinates].reverse());
  return JSON.stringify(forward) <= JSON.stringify(reverse) ? forward : reverse;
}

function signatureValue(value) {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array', value.map(signatureValue)];
  if (typeof value === 'object') {
    return [
      'object',
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, signatureValue(entry)]),
    ];
  }
  return [typeof value, value];
}
