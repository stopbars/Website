import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindingSelectorKey,
  matchSnappedReference,
  nearbyRemovalBindingFromExtendedReference,
  removalBindingFromExtendedReference,
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

test('can bind an edited MSFS object to an exact-placement derived light row', () => {
  const derived = {
    ...lightFeature,
    properties: { ...lightFeature.properties, exactness: 'derived' },
  };

  const match = matchSnappedReference(
    lightFeature.geometry.coordinates,
    [derived],
    1,
    { allowDerived: true }
  );

  assert.equal(match.binding.sourceId, 'row-one');
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

test('removal clipping projects a sideways object onto the simulator row heading', () => {
  const sideways = [
    [151.10005, -33.8999],
    [151.10015, -33.8999],
  ];

  const binding = removalBindingFromExtendedReference(sideways, lightFeature);

  assert.ok(binding.rangeStartMeters > 4);
  assert.ok(binding.rangeStartMeters < 6);
  assert.ok(binding.rangeEndMeters > 13);
  assert.ok(binding.rangeEndMeters < 15);
});

test('removal clipping uses the end heading and clamps an off-end drag to the real row', () => {
  const beyondEnd = [
    [151.1001, -33.89995],
    [151.1003, -33.89995],
  ];

  const binding = removalBindingFromExtendedReference(beyondEnd, lightFeature);

  assert.ok(binding.rangeStartMeters > 8);
  assert.equal(binding.rangeEndMeters, binding.sourceParentLengthMeters);
});

test('removal discovery accepts an aligned segment on a different simulator source ID', () => {
  const differentRow = {
    ...lightFeature,
    id: 'different-row',
    properties: { ...lightFeature.properties, sourceId: 'different-row' },
  };
  const aligned = [
    [151.10003, -33.899995],
    [151.10016, -33.899995],
  ];

  const binding = nearbyRemovalBindingFromExtendedReference(aligned, differentRow, 1.5);

  assert.equal(binding.sourceId, 'different-row');
  assert.ok(binding.rangeStartMeters > 2);
  assert.ok(binding.rangeEndMeters > binding.rangeStartMeters);
});

test('removal discovery rejects a simulator row that is merely crossed', () => {
  const crossing = [
    [151.1001, -33.90002],
    [151.1001, -33.89998],
  ];

  assert.equal(
    nearbyRemovalBindingFromExtendedReference(crossing, lightFeature, 3),
    null
  );
});
