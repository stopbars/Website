import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestPointOnLine } from './editor-geometry.js';
import { routeDrawCoordinates, routeReferenceLines } from './reference-routing.js';

const line = (id, points) => ({
  id, geometry: { type: 'LineString', coordinates: points },
  properties: { sourceId: id, sourceType: 'bgl-taxiway-path', snapCategory: 'light-rows', semanticType: 'taxi-centerline' },
});
const features = [
  line('a', [[0, 0], [0.0001, 0]]),
  line('b', [[0.0001, 0], [0.00015, 0.00005], [0.0002, 0.0001]]),
  line('c', [[0.0002, 0.0001], [0.0003, 0.0001]]),
  line('branch', [[0.0001, 0], [0.0001, -0.0001]]),
];

test('draw routes across joined pieces and retains curve vertices and every source binding', () => {
  const points = [[0.00005, 0], [0.00025, 0.0001]];
  const result = routeDrawCoordinates(points, features);
  assert.ok(result);
  assert.equal(result.coordinates.length, 5);
  assert.deepEqual(result.coordinates.slice(1, -1), [[0.0001, 0], [0.00015, 0.00005], [0.0002, 0.0001]]);
  assert.deepEqual([...new Set(result.bindings.map(binding => binding.sourceId))], ['a', 'b', 'c']);
  assert.ok(result.bindings[0].rangeStartMeters > 5);
  const reversed = routeDrawCoordinates([...points].reverse(), features);
  assert.deepEqual(reversed.coordinates, [...result.coordinates].reverse());
});

test('follow routes to the chosen branch and never jumps a disconnected crossing', () => {
  const start = nearestPointOnLine([0.00005, 0], features[0].geometry.coordinates);
  const end = nearestPointOnLine([0.0001, -0.00005], features[3].geometry.coordinates);
  const route = routeReferenceLines(features, features[0], start, features[3], end);
  assert.deepEqual(route.bindings.map(binding => binding.sourceId), ['a', 'branch']);
  const disconnected = line('crossing', [[0.00015, -0.0001], [0.00015, 0.0001]]);
  assert.equal(routeDrawCoordinates([[0.00005, 0], [0.00015, -0.00005]], [...features, disconnected]), null);
});
