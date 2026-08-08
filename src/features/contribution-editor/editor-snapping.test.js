import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindingSelectorKey,
  matchSnappedReference,
  selectorKey,
} from './editor-snapping.js';

const lightFeature = {
  id: 'row-one',
  geometry: {
    type: 'LineString',
    coordinates: [
      [151.1, -33.9],
      [151.1001, -33.9],
      [151.1002, -33.9],
    ],
  },
  properties: {
    sourceId: 'row-one',
    sourceFeatureId: '0123456789abcdef',
    sourceType: 'xplane-apt-light-string',
    sourceRunIndex: 2,
    lightCode: 101,
    snapCategory: 'light-rows',
    exactness: 'exact',
    removable: true,
  },
};

test('matches a source-backed light string and creates a selective removal', () => {
  const match = matchSnappedReference(lightFeature.geometry.coordinates, [lightFeature]);

  assert.equal(match.binding.sourceId, 'row-one');
  assert.equal(match.selector.feature, '0123456789abcdef');
  assert.equal(match.selector.code, 101);
  assert.equal(match.selector.run, 2);
  assert.equal(match.selector.start, 0);
  assert.equal(match.selector.end, 1);
});

test('does not create a removal for a merely nearby or derived line', () => {
  const offset = lightFeature.geometry.coordinates.map(([lon, lat]) => [lon, lat + 0.00002]);
  assert.equal(matchSnappedReference(offset, [lightFeature]), null);
  assert.equal(
    matchSnappedReference(lightFeature.geometry.coordinates, [
      { ...lightFeature, properties: { ...lightFeature.properties, exactness: 'derived' } },
    ]),
    null
  );
});

test('uses the same identity for a source binding and its selector', () => {
  const match = matchSnappedReference(lightFeature.geometry.coordinates, [lightFeature]);
  assert.equal(bindingSelectorKey(match.binding), selectorKey(match.selector));
});

test('removes every exact source row directly covered by one edited object', () => {
  const coLocated = {
    ...lightFeature,
    id: 'row-two',
    properties: {
      ...lightFeature.properties,
      sourceId: 'row-two',
      sourceRunIndex: 3,
    },
  };
  const match = matchSnappedReference(lightFeature.geometry.coordinates, [
    lightFeature,
    coLocated,
  ]);

  assert.equal(match.bindings.length, 2);
  assert.deepEqual(
    match.selectors.map(({ run }) => run),
    [2, 3]
  );
});

test('removes a shorter exact light row covered by a longer edited object', () => {
  const longerObject = [
    [151.09995, -33.9],
    ...lightFeature.geometry.coordinates,
    [151.10025, -33.9],
  ];
  const match = matchSnappedReference(longerObject, [lightFeature]);

  assert.equal(match.selector.start, 0);
  assert.equal(match.selector.end, 1);
});

test('does not remove a source row that is only crossed by the edited object', () => {
  const crossingObject = [
    [151.1001, -33.9001],
    [151.1001, -33.8999],
  ];

  assert.equal(matchSnappedReference(crossingObject, [lightFeature]), null);
});
