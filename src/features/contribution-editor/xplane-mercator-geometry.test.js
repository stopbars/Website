import assert from 'node:assert/strict';
import test from 'node:test';
import { mercatorPosition, mercatorTextureGroups } from './xplane-mercator-geometry.js';

test('keeps sub-metre airport geometry distinct after conversion to Float32', () => {
  const longitude = 115.96;
  const latitude = -31.94;
  const halfMetreLongitude = longitude + 0.5 / (111_320 * Math.cos((latitude * Math.PI) / 180));
  const absoluteStart = new Float32Array(mercatorPosition(longitude, latitude));
  const absoluteEnd = new Float32Array(mercatorPosition(halfMetreLongitude, latitude));

  assert.equal(
    absoluteStart[0],
    absoluteEnd[0],
    'absolute Float32 Mercator coordinates demonstrate the original precision collapse'
  );

  const [group] = mercatorTextureGroups([
    {
      pattern: 'paint',
      vertices: [
        longitude,
        latitude,
        0,
        0,
        halfMetreLongitude,
        latitude,
        1,
        0,
      ],
    },
  ]);

  assert.deepEqual([...group.vertices.slice(0, 4)], [0, 0, 0, 0]);
  assert.ok(group.vertices[4] > 0);
  assert.deepEqual([...group.vertices.slice(6)], [1, 0]);
});

test('reconstructs origin-relative positions without changing texture coordinates', () => {
  const vertices = [
    115.96,
    -31.94,
    0.125,
    0.25,
    115.961,
    -31.939,
    0.875,
    0.75,
  ];
  const [group] = mercatorTextureGroups([{ pattern: 'pavement', vertices }]);
  const expectedEnd = mercatorPosition(vertices[4], vertices[5]);

  assert.ok(Math.abs(group.origin[0] + group.vertices[4] - expectedEnd[0]) < 1e-11);
  assert.ok(Math.abs(group.origin[1] + group.vertices[5] - expectedEnd[1]) < 1e-11);
  assert.deepEqual(
    [group.vertices[2], group.vertices[3], group.vertices[6], group.vertices[7]],
    [0.125, 0.25, 0.875, 0.75]
  );
});
