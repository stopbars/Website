import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAptMarkingPattern,
  createReferenceTextureFallbacks,
  installReferenceTextureFallbacks,
  markingPatternName,
  withAptMarkingFallbackProperties,
} from './marking-patterns.js';

test('renders the four real runway-hold stripes from apt.dat line code 4', () => {
  const pattern = createAptMarkingPattern(4);
  const paintedRows = opaqueRows(pattern);

  assert.equal(paintedRows.length, 4);
  assert.equal(markingPatternName(4), 'apt-marking-4');
});

test('renders black-bordered apt.dat marking variants with their real paint colour', () => {
  const pattern = createAptMarkingPattern(70);
  const colors = new Set();
  for (let offset = 0; offset < pattern.data.length; offset += 4) {
    if (pattern.data[offset + 3] === 0) continue;
    colors.add(`${pattern.data[offset]},${pattern.data[offset + 1]},${pattern.data[offset + 2]}`);
  }

  assert.ok(colors.has('10,10,10'));
  assert.ok(colors.has('245,245,244'));
});

test('crops custom WebGL markings to their painted width', () => {
  const regular = createAptMarkingPattern(22);
  const cropped = createAptMarkingPattern(22, { cropToMarking: true });

  assert.ok(cropped.height < regular.height);
  assert.equal(opaqueRows(cropped).flat().length, cropped.height);
});

test('tiles the runway centreline as one complete 30 m dash and 20 m gap cycle', () => {
  const pattern = createAptMarkingPattern(22, { cropToMarking: true });
  const opaqueColumns = [];
  for (let x = 0; x < pattern.width; x += 1) {
    if (
      Array.from({ length: pattern.height }).some(
        (_, y) => pattern.data[(y * pattern.width + x) * 4 + 3] > 0
      )
    ) {
      opaqueColumns.push(x);
    }
  }

  assert.equal(pattern.width, 100);
  assert.equal(opaqueColumns.length, 60);
  assert.deepEqual(opaqueColumns, Array.from({ length: 60 }, (_, index) => index));
});

test('uses stock X-Plane dimensions when apt.dat markings have no connected line asset', () => {
  const fallback = (markingCode) =>
    withAptMarkingFallbackProperties({
      sourceType: 'xplane-apt-painted-marking',
      markingCode,
    });

  assert.deepEqual(
    [10, 19, 54, 60].map((code) => [
      code,
      fallback(code).widthMeters,
      fallback(code).textureHeightMeters,
    ]),
    [
      [10, 0.375, 3],
      [19, 3, 3],
      [54, 1.5, 3],
      [60, 0.5625, 3],
    ]
  );
});

test('renders shoulder hatching as metre-scale transverse bars with paint wear', () => {
  const [fallback] = createReferenceTextureFallbacks([
    {
      geometry: { type: 'LineString', coordinates: [] },
      properties: {
        sourceType: 'xplane-apt-painted-marking',
        markingCode: 19,
        renderPattern: 'apt-marking-19',
        markingColor: '#facc15',
      },
    },
  ]).values();
  const alpha = fallback.data.filter((_, index) => index % 4 === 3);
  const paintedColumns = Array.from({ length: fallback.width }, (_, x) =>
    Array.from({ length: fallback.height }).some(
      (_, y) => fallback.data[(y * fallback.width + x) * 4 + 3] > 0
    )
  ).filter(Boolean);

  assert.equal(fallback.width, fallback.height);
  assert.ok(paintedColumns.length > 0);
  assert.ok(paintedColumns.length < fallback.width);
  assert.ok(alpha.some((value) => value > 0 && value < 255));
});

test('installs visible fallbacks for real texture ids before local files reconnect', () => {
  const images = new Map();
  const map = {
    hasImage: (name) => images.has(name),
    addImage: (name, image) => images.set(name, image),
  };
  installReferenceTextureFallbacks(map, [
    {
      geometry: { type: 'LineString', coordinates: [] },
      properties: {
        texturePattern: 'xplane-real-hold',
        markingCode: 4,
        markingColor: '#facc15',
      },
    },
    {
      geometry: { type: 'LineString', coordinates: [] },
      properties: {
        texturePattern: 'xplane-custom-white',
        markingColor: '#f5f5f4',
      },
    },
    {
      geometry: { type: 'LineString', coordinates: [] },
      properties: {
        renderPattern: 'apt-marking-22',
        markingColor: '#f5f5f4',
        widthMeters: 0.9,
        textureHeightMeters: 50,
      },
    },
  ]);

  assert.equal(images.size, 3);
  assert.equal(opaqueRows(images.get('xplane-real-hold')).length, 4);
  assert.deepEqual([...images.get('xplane-custom-white').data.slice(0, 4)], [245, 245, 244, 255]);
  const runwayCentreline = images.get('apt-marking-22');
  const alpha = runwayCentreline.data.filter((_, index) => index % 4 === 3);
  assert.ok(alpha.some((value) => value === 0));
  assert.ok(alpha.some((value) => value > 0));
});

function opaqueRows(pattern) {
  const rows = [];
  for (let y = 0; y < pattern.height; y += 1) {
    let painted = false;
    for (let x = 0; x < pattern.width; x += 1) {
      if (pattern.data[(y * pattern.width + x) * 4 + 3] > 0) {
        painted = true;
        break;
      }
    }
    if (painted && rows.at(-1)?.at(-1) === y - 1) rows.at(-1).push(y);
    else if (painted) rows.push([y]);
  }
  return rows;
}
