import assert from 'node:assert/strict';
import test from 'node:test';
import { snapDrawAngle } from './angle-snapping.js';

test('snaps the first drawn segment to a cardinal direction', () => {
  const result = snapDrawAngle(null, [115, -32], [115.001, -31.99998]);

  assert.equal(result.direction, 0);
  assert.ok(Math.abs(result.coordinate[1] + 32) < 1e-12);
});

test('snaps the first drawn segment vertically', () => {
  const result = snapDrawAngle(null, [115, -32], [115.00002, -31.999]);

  assert.equal(result.direction, 1);
  assert.ok(Math.abs(result.coordinate[0] - 115) < 1e-12);
});

test('snaps a nearly square turn to exactly 90 degrees', () => {
  const result = snapDrawAngle([0, 0], [0.001, 0], [0.00101, 0.001]);

  assert.equal(result.direction, 1);
  assert.ok(Math.abs(result.coordinate[0] - 0.001) < 1e-12);
  assert.ok(result.coordinate[1] > 0);
});

test('snaps a nearly straight continuation onto the incoming direction', () => {
  const result = snapDrawAngle([0, 0], [0.001, 0], [0.002, 0.00002]);

  assert.equal(result.direction, 0);
  assert.ok(Math.abs(result.coordinate[1]) < 1e-12);
});

test('leaves an intentional free angle unchanged', () => {
  const pointer = [0.0017, 0.0007];
  const result = snapDrawAngle([0, 0], [0.001, 0], pointer);

  assert.equal(result.direction, null);
  assert.equal(result.coordinate, pointer);
});

test('holds an active angle until the wider release threshold is crossed', () => {
  const pointer = [0.002, 0.00016];
  const fresh = snapDrawAngle([0, 0], [0.001, 0], pointer);
  const active = snapDrawAngle([0, 0], [0.001, 0], pointer, 0);

  assert.equal(fresh.direction, null);
  assert.equal(active.direction, 0);
  assert.ok(Math.abs(active.coordinate[1]) < 1e-12);
});
