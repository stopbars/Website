import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { referenceMapGeojson, restoreReferenceMapFeature } from './reference-map-data.js';

test('projects every property read by the MSFS and X-Plane reference styles', () => {
  const source = readFileSync(new URL('./EditorMap.jsx', import.meta.url), 'utf8');
  const sections = [
    ['const REFERENCE_COLOR =', 'const AIRFIELD_STYLE ='],
    ['const removableReferenceFilter =', 'const visibleTexturedFeatures ='],
    ['<Source id="simulator-reference"', '<Source id="editor-draft"'],
    ['id="removal-target-lines-above-bars"', '<Source id="selected-removal-sections"'],
  ];
  const keys = new Set();
  for (const [start, end] of sections) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex);
    for (const match of source
      .slice(startIndex, endIndex)
      .matchAll(/\[\s*'(?:get|has)',\s*'([^']+)'/g)) {
      keys.add(match[1]);
    }
  }
  const properties = Object.fromEntries([...keys].map((key) => [key, `value:${key}`]));
  const projected = referenceMapGeojson({ features: [{ type: 'Feature', properties }] });
  for (const key of keys) assert.equal(projected.features[0].properties[key], properties[key], key);
});

test('retains rendering properties and geometry while restoring complete picked metadata', () => {
  const properties = {
    sourceId: 'shared-row',
    snapCategory: 'light-rows',
    widthMeters: 0.5,
    texturePattern: 'fill',
    renderPattern: 'line',
    exactTexturePattern: 'exact',
    surfaceLabel: 'Grass',
    surfaceColor: '#52525b',
    surfaceOpacity: 0,
    markingColor: '#fff',
    lightColor: '#f00',
    msfsRemovalTarget: true,
    sourceType: 'xplane-apt-light-string',
    removable: false,
    sourceFile: 'airport.dat',
    sourceRecordOffset: 0,
    selector: { offset: 27, nodes: [1, 2] },
    sourceRowIds: ['one', 'two'],
    empty: '',
    missing: null,
  };
  const geometry = {
    type: 'LineString',
    coordinates: [
      [1, 2],
      [3, 4],
    ],
  };
  const reference = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'duplicate', geometry, properties },
      {
        type: 'Feature',
        id: 'duplicate',
        geometry,
        properties: { ...properties, sourceRecordOffset: 40 },
      },
    ],
  };
  const projected = referenceMapGeojson(reference);
  for (const [index, feature] of projected.features.entries()) {
    assert.equal(feature.geometry, geometry);
    assert.equal(feature.id, 'duplicate');
    assert.equal(feature.properties.removable, false);
    assert.equal(feature.properties.surfaceOpacity, 0);
    assert.equal(feature.properties.sourceFile, undefined);
    const rendered = {
      ...feature,
      id: 0,
      source: 'simulator-reference',
      layer: { id: 'reference-lines' },
    };
    const restored = restoreReferenceMapFeature(rendered, reference);
    const expected = Object.fromEntries(
      Object.entries(reference.features[index].properties)
        .filter(([, value]) => value != null)
        .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])
    );
    assert.deepEqual(restored.properties, expected);
    assert.equal(restored.geometry, rendered.geometry);
    assert.equal(restored.layer, rendered.layer);
    assert.equal(restored.id, rendered.id);
  }
});

test('leaves unrelated and stale feature picks untouched', () => {
  const reference = { type: 'FeatureCollection', features: [] };
  assert.equal(restoreReferenceMapFeature(undefined, reference), undefined);
  for (const feature of [
    { source: 'editor-draft', properties: { __barsReferenceIndex: 0 } },
    { source: 'simulator-reference', properties: { __barsReferenceIndex: -1 } },
    { source: 'simulator-reference', properties: { __barsReferenceIndex: 100 } },
    { source: 'simulator-reference', properties: {} },
  ])
    assert.equal(restoreReferenceMapFeature(feature, reference), feature);
});
