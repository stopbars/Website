import assert from 'node:assert/strict';
import test from 'node:test';
import {
  joinLines,
  nearestPointOnLine,
  nearestSnapTarget,
  sliceLineBetween,
  splitLineAt,
} from './editor-geometry.js';

const line = [
  [115, -32],
  [115.001, -32],
  [115.002, -32],
];

test('follows an exact subsection of a simulator line in either direction', () => {
  const first = nearestPointOnLine([115.00025, -31.99999], line);
  const second = nearestPointOnLine([115.00175, -32.00001], line);
  const forward = sliceLineBetween(line, first, second);
  const reverse = sliceLineBetween(line, second, first);
  assert.equal(forward.length, 3);
  assert.deepEqual(reverse, [...forward].reverse());
  assert.ok(Math.abs(forward[0][0] - 115.00025) < 0.00001);
  assert.ok(Math.abs(forward.at(-1)[0] - 115.00175) < 0.00001);
});

test('snaps only to enabled simulator categories', () => {
  const features = [
    {
      id: 'paint',
      geometry: { type: 'LineString', coordinates: line },
      properties: { sourceId: 'paint', snapCategory: 'painted-lines' },
    },
  ];
  assert.equal(
    nearestSnapTarget([115.001, -31.99999], features, {
      enabledCategories: new Set(['light-rows']),
      toleranceMeters: 10,
    }),
    null
  );
  assert.equal(
    nearestSnapTarget([115.001, -31.99999], features, {
      enabledCategories: new Set(['painted-lines']),
      toleranceMeters: 10,
    }).sourceId,
    'paint'
  );
});

test('splits and rejoins a line without inventing a connector', () => {
  const projection = nearestPointOnLine([115.0005, -32], line);
  const split = splitLineAt(line, projection);
  assert.ok(split);
  assert.deepEqual(joinLines(split[0], split[1], 1), [...split[0], ...split[1].slice(1)]);
});
