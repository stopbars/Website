import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import {
  buildTaxiwayReferenceFeatures,
  buildTaxiwaySurfaceReferenceFeatures,
  extractAirportReferenceFeatures,
} from './extractor/bgl.js';
import { extractFromParsedXml } from './extractor/extract.js';
import { parseXml } from './extractor/xml.js';

test('decodes a structured painted-line child from an MSFS airport BGL record', () => {
  const airportSize = 0x44 + 0x1c + 16;
  const buffer = Buffer.alloc(airportSize);
  buffer.writeUInt16LE(0x56, 0);
  buffer.writeUInt32LE(airportSize, 2);
  buffer.writeUInt32LE(encodeLongitude(115.95), 0x0c);
  buffer.writeUInt32LE(encodeLatitude(-31.94), 0x10);
  const child = 0x44;
  buffer.writeUInt16LE(0xcf, child);
  buffer.writeUInt32LE(0x1c + 16, child + 2);
  buffer.writeUInt8(1, child + 6);
  buffer.writeUInt32LE(2, child + 8);
  writeCoordinate(buffer, child + 0x1c, 115.95, -31.94);
  writeCoordinate(buffer, child + 0x24, 115.951, -31.941);

  const features = extractAirportReferenceFeatures(buffer, 'airport.bgl');
  assert.equal(features.length, 1);
  assert.equal(features[0].properties.snapCategory, 'painted-lines');
  assert.equal(features[0].geometry.coordinates.length, 2);
});

test('extracts MSFS XML aprons, painted lines, runways and taxiway paths', () => {
  const parsed = parseXml(`<FSData>
    <Airport>
      <Runway lat="-31.94" lon="115.95" length="2000" width="45" heading="30"/>
      <Apron surface="CONCRETE"><Vertex lat="-31.94" lon="115.95"/><Vertex lat="-31.941" lon="115.95"/><Vertex lat="-31.941" lon="115.951"/></Apron>
      <PaintedLine><Vertex lat="-31.94" lon="115.95"/><Vertex lat="-31.941" lon="115.951"/></PaintedLine>
      <TaxiwayPoint index="1" lat="-31.94" lon="115.95"/>
      <TaxiwayPoint index="2" lat="-31.941" lon="115.951"/>
      <TaxiwayPath start="1" end="2" type="TAXI" width="18" centerLine="TRUE"/>
    </Airport>
  </FSData>`);
  const result = extractFromParsedXml(parsed.root, 'airport.xml');
  assert.deepEqual(
    new Set(result.referenceFeatures.map((feature) => feature.properties.snapCategory)),
    new Set(['runways', 'pavement-edges', 'painted-lines', 'taxiway-centrelines'])
  );
});

test('builds exact-width MSFS taxiway pavement without inventing a painted centreline', () => {
  const path = {
    sourceRecordOffset: 200,
    start: { lat: -31.94, lon: 115.95 },
    end: { lat: -31.9405, lon: 115.9505 },
    pathType: 1,
    centerLine: false,
    centerLineLighted: false,
    lengthMeters: 73,
    widthMeters: 18,
    surface: 4,
  };
  const surfaces = buildTaxiwaySurfaceReferenceFeatures([{ paths: [path] }], 'airport.bgl');
  const centrelines = buildTaxiwayReferenceFeatures([{ paths: [path] }], 'airport.bgl');

  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].properties.snapCategory, 'pavement-edges');
  assert.equal(surfaces[0].properties.widthMeters, 18);
  assert.equal(surfaces[0].geometry.coordinates[0].length, 5);
  assert.equal(centrelines.length, 0);
});

test('exposes only explicitly marked MSFS taxiway centrelines as editor evidence', () => {
  const point = (lat, lon) => ({ lat, lon });
  const path = (overrides) => ({
    sourceRecordOffset: 100,
    start: point(-31.94, 115.95),
    end: point(-31.9401, 115.9501),
    pathType: 1,
    centerLine: false,
    centerLineLighted: false,
    lengthMeters: 15,
    widthMeters: 18,
    ...overrides,
  });
  const features = buildTaxiwayReferenceFeatures(
    [
      {
        paths: [
          path({ sourceRecordOffset: 100 }),
          path({ sourceRecordOffset: 200, centerLine: true }),
          path({ sourceRecordOffset: 300, centerLineLighted: true, pathType: 4 }),
          path({ sourceRecordOffset: 400, centerLine: true, pathType: 3 }),
          path({ sourceRecordOffset: 500, centerLine: true, lengthMeters: 2501 }),
        ],
      },
    ],
    'airport.bgl'
  );

  assert.deepEqual(
    features.map((feature) => feature.properties.sourceRecordOffset),
    [200, 300]
  );
});

function writeCoordinate(buffer, offset, lon, lat) {
  buffer.writeUInt32LE(encodeLongitude(lon), offset);
  buffer.writeUInt32LE(encodeLatitude(lat), offset + 4);
}

function encodeLongitude(value) {
  return Math.round(((value + 180) * (3 * 0x10000000)) / 360) >>> 0;
}

function encodeLatitude(value) {
  return Math.round(((90 - value) * (2 * 0x10000000)) / 180) >>> 0;
}
