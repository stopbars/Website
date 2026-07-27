import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DraftGenerationInputError,
  validateAirportUpload,
} from './airport-upload-validation.js';

const YPPH = { lat: -31.9403, lon: 115.9672 };
const YSSY = { lat: -33.9399, lon: 151.1753 };
const YPPH_DIVISIONS = [
  {
    id: 'BARS_TEST',
    type: 'lead_on',
    coordinates: [
      { lat: -31.9405, lng: 115.9668 },
      { lat: -31.9402, lng: 115.9674 },
    ],
  },
];

test('accepts credible lighting evidence near the selected airport', () => {
  const result = validateAirportUpload({
    icao: 'ypph',
    airportPosition: { latitude: String(YPPH.lat), longitude: String(YPPH.lon) },
    divisionPoints: YPPH_DIVISIONS,
    data: {
      runways: [],
      instances: [],
      lightRows: [
        {
          vertices: [
            { lat: -31.941, lon: 115.966 },
            { lat: -31.942, lon: 115.968 },
          ],
        },
      ],
    },
  });

  assert.equal(result.expectedIcao, 'YPPH');
  assert.equal(result.localEvidence.lightRows, 1);
});

test('rejects a Sydney package when Perth is selected', () => {
  assert.throws(
    () =>
      validateAirportUpload({
        icao: 'YPPH',
        airportPosition: YPPH,
        divisionPoints: YPPH_DIVISIONS,
        data: {
          runways: [{ ...YSSY }],
          instances: [],
          lightRows: [
            {
              vertices: [
                { lat: -33.94, lon: 151.17 },
                { lat: -33.941, lon: 151.171 },
              ],
            },
          ],
        },
      }),
    (error) =>
      error instanceof DraftGenerationInputError &&
      error.code === 'incorrect-airport-uploaded' &&
      /Incorrect airport uploaded.*YPPH/.test(error.message)
  );
});

test('accepts a multi-airport package when the selected airport is present', () => {
  const result = validateAirportUpload({
    icao: 'YPPH',
    airportPosition: YPPH,
    divisionPoints: YPPH_DIVISIONS,
    data: {
      runways: [{ ...YSSY }, { ...YPPH }],
      instances: [],
      lightRows: [],
    },
  });

  assert.equal(result.localEvidence.runways, 1);
  assert.equal(result.evidence.runways, 2);
});

test('requires multiple nearby loose instances as credible airport evidence', () => {
  assert.throws(
    () =>
      validateAirportUpload({
        icao: 'YPPH',
        airportPosition: YPPH,
        divisionPoints: YPPH_DIVISIONS,
        data: {
          runways: [],
          lightRows: [],
          instances: [{ ...YPPH }, { ...YSSY }],
        },
      }),
    (error) => error.code === 'incorrect-airport-uploaded'
  );

  const result = validateAirportUpload({
    icao: 'YPPH',
    airportPosition: YPPH,
    divisionPoints: YPPH_DIVISIONS,
    data: {
      runways: [],
      lightRows: [],
      instances: [
        { lat: -31.9404, lon: 115.9671 },
        { lat: -31.9406, lon: 115.9675 },
      ],
    },
  });
  assert.equal(result.localEvidence.instances, 2);
});

test('reports an empty or unpositioned package without attempting matching', () => {
  assert.throws(
    () =>
      validateAirportUpload({
        icao: 'YPPH',
        airportPosition: YPPH,
        divisionPoints: YPPH_DIVISIONS,
        data: {
          runways: [{ lat: Number.NaN, lon: 115 }],
          lightRows: [{ vertices: [{ lat: 'invalid', lon: 115 }] }],
          instances: [],
        },
      }),
    (error) =>
      error.code === 'no-positioned-scenery' && /No usable positioned airport scenery/.test(error.message)
  );
});

test('falls back to division geometry when airport coordinates are blank', () => {
  const result = validateAirportUpload({
    icao: 'YPPH',
    airportPosition: { latitude: null, longitude: '' },
    divisionPoints: YPPH_DIVISIONS,
    data: {
      runways: [{ ...YPPH }],
      lightRows: [],
      instances: [],
    },
  });

  assert.equal(result.localEvidence.runways, 1);
  assert.ok(result.expectedCenter.lat < -31);
});

test('rejects invalid selected-airport and missing-division inputs cleanly', () => {
  assert.throws(
    () =>
      validateAirportUpload({
        icao: '../',
        airportPosition: YPPH,
        divisionPoints: YPPH_DIVISIONS,
        data: {},
      }),
    (error) => error.code === 'invalid-airport'
  );
  assert.throws(
    () =>
      validateAirportUpload({
        icao: 'YPPH',
        airportPosition: YPPH,
        divisionPoints: [],
        data: {},
      }),
    (error) => error.code === 'missing-division-objects'
  );
});
