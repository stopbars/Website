import { haversineDistanceMeters } from './extractor/geo.js';

const MINIMUM_AIRPORT_RADIUS_METERS = 10_000;
const MAXIMUM_AIRPORT_RADIUS_METERS = 30_000;
const DIVISION_EXTENT_MARGIN_METERS = 5_000;
const MINIMUM_LOCAL_INSTANCES = 2;

export class DraftGenerationInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DraftGenerationInputError';
    this.code = code;
  }
}

export function validateAirportUpload({
  icao,
  airportPosition,
  divisionPoints,
  data,
}) {
  const normalizedIcao = String(icao ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(normalizedIcao)) {
    throw new DraftGenerationInputError(
      'invalid-airport',
      'The selected airport is invalid. Return to the airport list and try again.'
    );
  }
  if (!Array.isArray(divisionPoints) || divisionPoints.length === 0) {
    throw new DraftGenerationInputError(
      'missing-division-objects',
      `No BARS objects are available for ${normalizedIcao}. Add the airport objects before generating a draft.`
    );
  }

  const divisionCoordinates = collectDivisionCoordinates(divisionPoints);
  const expectedCenter =
    coordinateFrom(airportPosition) ?? representativeCoordinate(divisionCoordinates);
  if (!expectedCenter) {
    throw new DraftGenerationInputError(
      'missing-airport-location',
      `The location of ${normalizedIcao} could not be verified. Reload the page and try again.`
    );
  }

  const acceptanceRadiusMeters = airportAcceptanceRadius(
    expectedCenter,
    divisionCoordinates
  );
  const evidence = collectSceneryEvidence(data);
  if (evidence.coordinateCount === 0) {
    throw new DraftGenerationInputError(
      'no-positioned-scenery',
      'No usable positioned airport scenery was found in the selected folder. Choose the airport package or its scenery folder.'
    );
  }

  const localRunways = evidence.runways.filter(
    (point) => haversineDistanceMeters(expectedCenter, point) <= acceptanceRadiusMeters
  );
  const localRows = evidence.lightRows.filter((row) =>
    rowBelongsNearAirport(row, expectedCenter, acceptanceRadiusMeters)
  );
  const localInstances = evidence.instances.filter(
    (point) => haversineDistanceMeters(expectedCenter, point) <= acceptanceRadiusMeters
  );
  const hasCredibleLocalEvidence =
    localRunways.length > 0 ||
    localRows.length > 0 ||
    localInstances.length >= MINIMUM_LOCAL_INSTANCES;

  if (!hasCredibleLocalEvidence) {
    throw new DraftGenerationInputError(
      'incorrect-airport-uploaded',
      `Incorrect airport uploaded. The selected package does not contain scenery near ${normalizedIcao}. Choose the ${normalizedIcao} airport package and try again.`
    );
  }

  return {
    expectedIcao: normalizedIcao,
    expectedCenter,
    acceptanceRadiusMeters: Math.round(acceptanceRadiusMeters),
    evidence: {
      runways: evidence.runways.length,
      lightRows: evidence.lightRows.length,
      instances: evidence.instances.length,
      coordinates: evidence.coordinateCount,
    },
    localEvidence: {
      runways: localRunways.length,
      lightRows: localRows.length,
      instances: localInstances.length,
    },
  };
}

function collectSceneryEvidence(data) {
  const runways = (data?.runways ?? []).map(coordinateFrom).filter(Boolean);
  const lightRows = [];
  let lightRowCoordinateCount = 0;
  for (const row of data?.lightRows ?? []) {
    const vertices = (row?.vertices ?? []).map(coordinateFrom).filter(Boolean);
    if (vertices.length === 0) continue;
    lightRows.push(vertices);
    lightRowCoordinateCount += vertices.length;
  }
  const instances = (data?.instances ?? []).map(coordinateFrom).filter(Boolean);

  return {
    runways,
    lightRows,
    instances,
    coordinateCount: runways.length + lightRowCoordinateCount + instances.length,
  };
}

function collectDivisionCoordinates(divisionPoints) {
  const coordinates = [];
  for (const division of divisionPoints) {
    for (const coordinate of division?.coordinates ?? []) {
      const normalized = coordinateFrom(coordinate);
      if (normalized) coordinates.push(normalized);
    }
  }
  return coordinates;
}

function airportAcceptanceRadius(center, divisionCoordinates) {
  let furthestDivisionMeters = 0;
  for (const coordinate of divisionCoordinates) {
    furthestDivisionMeters = Math.max(
      furthestDivisionMeters,
      haversineDistanceMeters(center, coordinate)
    );
  }
  return Math.min(
    MAXIMUM_AIRPORT_RADIUS_METERS,
    Math.max(
      MINIMUM_AIRPORT_RADIUS_METERS,
      furthestDivisionMeters + DIVISION_EXTENT_MARGIN_METERS
    )
  );
}

function rowBelongsNearAirport(vertices, center, acceptanceRadiusMeters) {
  let localVertices = 0;
  for (const vertex of vertices) {
    if (haversineDistanceMeters(center, vertex) <= acceptanceRadiusMeters) {
      localVertices += 1;
    }
  }
  return localVertices >= Math.ceil(vertices.length / 2);
}

function representativeCoordinate(coordinates) {
  if (coordinates.length === 0) return null;
  const totals = coordinates.reduce(
    (result, coordinate) => ({
      lat: result.lat + coordinate.lat,
      lon: result.lon + coordinate.lon,
    }),
    { lat: 0, lon: 0 }
  );
  return {
    lat: totals.lat / coordinates.length,
    lon: totals.lon / coordinates.length,
  };
}

function coordinateFrom(value) {
  const rawLat = value?.lat ?? value?.latitude;
  const rawLon = value?.lon ?? value?.lng ?? value?.longitude;
  if (
    rawLat === null ||
    rawLat === undefined ||
    rawLat === '' ||
    rawLon === null ||
    rawLon === undefined ||
    rawLon === ''
  ) {
    return null;
  }
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return { lat, lon };
}
