import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCoordinatePair } from './coordinateParsing.js';

test('converts a southern and eastern DMS coordinate pair', () => {
  const result = parseCoordinatePair(`33°53'30.6"S  150°41'44.7"E`);

  assert.ok(result);
  assert.equal(result.latitude, -33.89183333333333);
  assert.equal(result.longitude, 150.69575);
});

test('detects coordinate order from hemisphere letters', () => {
  const result = parseCoordinatePair(`115°45'00"E 31°15'00"S`);

  assert.deepEqual(result, { latitude: -31.25, longitude: 115.75 });
});

test('accepts decimal coordinate pairs', () => {
  assert.deepEqual(parseCoordinatePair('-31.25, 115.75'), {
    latitude: -31.25,
    longitude: 115.75,
  });
});

test('rejects invalid coordinates', () => {
  assert.equal(parseCoordinatePair(`91°00'00"N 181°00'00"E`), null);
  assert.equal(parseCoordinatePair('not a coordinate'), null);
});
