const DIAGNOSTIC_PROPERTY_PATTERN =
  /area|bound|class|color|density|exact|fallback|flag|ground|guid|layer|marking|material|opacity|pattern|priority|record|render|scale|semantic|snap|source|stage|surface|texture|title|triangle|type|uv|width|wrap/i;

export function createTextureFallbackReport({
  airportIcao,
  simulator,
  expectedAppearance,
  clickedCoordinate,
  renderedLayerId,
  feature,
  resolvedEntry,
  textureStatus,
}) {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  const coordinates = geometry?.coordinates ?? [];
  const bounds = geometryCoordinateBounds(coordinates);

  return {
    reportVersion: 2,
    kind: 'texture-fallback-feedback',
    airportIcao: String(airportIcao ?? '')
      .trim()
      .toUpperCase(),
    simulator: String(simulator ?? ''),
    expectedAppearance: String(expectedAppearance ?? '').trim(),
    clickedCoordinate: finiteCoordinate(clickedCoordinate),
    renderedLayerId: String(renderedLayerId ?? ''),
    selectedObject: {
      id: feature?.id ?? properties.sourceId ?? null,
      title: String(properties.title ?? properties.markingDescription ?? ''),
      geometryType: geometry?.type ?? null,
      coordinateCount: countGeometryCoordinates(coordinates),
      componentCount: geometryComponentCount(geometry),
      bounds,
      boundsSizeMeters: geographicBoundsSize(bounds),
      pathLengthMeters: geometryPathLengthMeters(geometry),
    },
    sourceProperties: diagnosticProperties(properties),
    fallbackEvaluation: fallbackEvaluation(properties),
    resolvedTexture: resolvedEntry
      ? {
          name: resolvedEntry.file?.name ?? '',
          path: resolvedEntry.path ?? '',
          size: resolvedEntry.size ?? resolvedEntry.file?.size ?? null,
        }
      : null,
    renderer: compactTextureStatus(textureStatus),
  };
}

function fallbackEvaluation(properties) {
  const renderMode = properties.fallbackRenderMode ?? '';
  const basis = properties.fallbackEvidenceBasis ?? properties.fallbackBasis ?? '';
  if (!renderMode && !basis) return null;
  const metrics = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      !key.startsWith('fallback') ||
      ['fallbackRenderMode', 'fallbackEvidenceBasis', 'fallbackBasis'].includes(key)
    ) {
      continue;
    }
    const metricName = `${key[8]?.toLowerCase() ?? ''}${key.slice(9)}`;
    const compactValue = compactDiagnosticValue(value);
    if (metricName && compactValue !== undefined) metrics[metricName] = compactValue;
  }
  return { renderMode, basis, metrics };
}

function diagnosticProperties(properties) {
  const entries = [];
  for (const [key, value] of Object.entries(properties)) {
    if (!DIAGNOSTIC_PROPERTY_PATTERN.test(key)) continue;
    const compactValue = compactDiagnosticValue(value);
    if (compactValue !== undefined) entries.push([key, compactValue]);
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}

function compactDiagnosticValue(value, depth = 0) {
  if (value === null || ['number', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'string') {
    if (value.length > 2_000) return undefined;
    if (depth === 0 && /^[{[]/.test(value.trim())) {
      try {
        return compactDiagnosticValue(JSON.parse(value), depth + 1) ?? value;
      } catch {
        return value;
      }
    }
    return value;
  }
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) {
    if (value.length > 24) return undefined;
    const compact = value.map((item) => compactDiagnosticValue(item, depth + 1));
    return compact.some((item) => item === undefined) ? undefined : compact;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length > 32) return undefined;
    const compact = entries.flatMap(([key, item]) => {
      const compactItem = compactDiagnosticValue(item, depth + 1);
      return compactItem === undefined ? [] : [[key, compactItem]];
    });
    return Object.fromEntries(compact);
  }
  return undefined;
}

function compactTextureStatus(status) {
  if (!status) return null;
  return Object.fromEntries(
    [
      'phase',
      'total',
      'loaded',
      'packageLoaded',
      'fallbackLoaded',
      'missing',
      'failed',
      'skipped',
      'meshGroups',
      'drawableGroups',
      'drawnGroups',
      'drawnTriangles',
      'renderError',
    ].map((key) => [key, status[key] ?? (key === 'phase' || key === 'renderError' ? '' : 0)])
  );
}

function finiteCoordinate(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const coordinate = value.slice(0, 2).map(Number);
  return coordinate.every(Number.isFinite) ? coordinate : null;
}

function countGeometryCoordinates(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) return 1;
  return value.reduce((total, child) => total + countGeometryCoordinates(child), 0);
}

function geometryCoordinateBounds(value) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (
      coordinates.length >= 2 &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1])
    ) {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    for (const child of coordinates) visit(child);
  };
  visit(value);
  return bounds.every(Number.isFinite) ? bounds : null;
}

function geometryComponentCount(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'MultiLineString' || geometry.type === 'MultiPolygon') {
    return geometry.coordinates?.length ?? 0;
  }
  if (geometry.type === 'GeometryCollection') return geometry.geometries?.length ?? 0;
  return 1;
}

function geographicBoundsSize(bounds) {
  if (!Array.isArray(bounds) || bounds.length < 4) return null;
  const latitude = (bounds[1] + bounds[3]) / 2;
  const widthMeters =
    Math.abs(bounds[2] - bounds[0]) * 111_320 * Math.cos((latitude * Math.PI) / 180);
  const heightMeters = Math.abs(bounds[3] - bounds[1]) * 111_320;
  const shorter = Math.max(Math.min(widthMeters, heightMeters), 0.001);
  return {
    width: roundMetric(widthMeters),
    height: roundMetric(heightMeters),
    area: roundMetric(widthMeters * heightMeters),
    aspectRatio: roundMetric(Math.max(widthMeters, heightMeters) / shorter),
  };
}

function geometryPathLengthMeters(geometry) {
  const coordinateSets =
    geometry?.type === 'LineString'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiLineString'
        ? geometry.coordinates
        : geometry?.type === 'Polygon'
          ? geometry.coordinates
          : geometry?.type === 'MultiPolygon'
            ? geometry.coordinates.flat()
            : [];
  let total = 0;
  for (const coordinates of coordinateSets ?? []) {
    for (let index = 1; index < coordinates.length; index += 1) {
      total += coordinateDistanceMeters(coordinates[index - 1], coordinates[index]);
    }
  }
  return total > 0 ? roundMetric(total) : null;
}

function coordinateDistanceMeters(first, second) {
  if (!Array.isArray(first) || !Array.isArray(second)) return 0;
  const latitude = ((Number(first[1]) + Number(second[1])) / 2) * (Math.PI / 180);
  const x = (Number(second[0]) - Number(first[0])) * 111_320 * Math.cos(latitude);
  const y = (Number(second[1]) - Number(first[1])) * 111_320;
  return Number.isFinite(x) && Number.isFinite(y) ? Math.hypot(x, y) : 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}
