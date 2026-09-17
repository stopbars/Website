const MAX_MERCATOR_LATITUDE = 85.051_129;

export function mercatorTextureGroups(groups) {
  return (groups ?? []).map((group) => {
    const origin = firstMercatorPosition(group.vertices);
    return {
      ...group,
      origin,
      vertices: relativeMercatorVertices(group.vertices, origin),
    };
  });
}

export function mercatorPosition(longitude, latitude) {
  const clampedLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, Number(latitude))
  );
  const latitudeRadians = (clampedLatitude * Math.PI) / 180;
  return [
    (Number(longitude) + 180) / 360,
    (180 -
      (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))) /
      360,
  ];
}

function firstMercatorPosition(vertices) {
  if (!vertices || vertices.length < 2) return [0, 0];
  return mercatorPosition(vertices[0], vertices[1]);
}

function relativeMercatorVertices(vertices, origin) {
  const output = new Float32Array(vertices?.length ?? 0);
  for (let index = 0; index < output.length; index += 4) {
    const position = mercatorPosition(vertices[index], vertices[index + 1]);
    output[index] = position[0] - origin[0];
    output[index + 1] = position[1] - origin[1];
    output[index + 2] = vertices[index + 2];
    output[index + 3] = vertices[index + 3];
  }
  return output;
}
