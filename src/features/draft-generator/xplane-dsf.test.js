import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractXPlaneDsfEvidence,
  dsfPolygonGeometry,
  parseXPlaneDsf,
  XPlaneCompressedDsfError,
} from './extractor/xplane-dsf.js';
import { buildMustKeepZones } from './extractor/extract.js';

test('decodes stateful DSF polygons, RLE-differenced point pools, and airport filters', async () => {
  const buffer = buildFixtureDsf();
  const decoded = parseXPlaneDsf(buffer, { sourceFile: 'fixture.dsf' });

  assert.deepEqual(decoded.filterAirportIds, ['TEST']);
  assert.equal(decoded.polygons.length, 3);
  assert.equal(decoded.objects.length, 1);
  assert.equal(decoded.polygons[0].filterId, 0);
  assert.equal(decoded.polygons[0].windings[0].length, 3);
  assert.ok(Math.abs(decoded.polygons[0].windings[0][1][1] - -35.3) < 0.0001);

  const evidence = await extractXPlaneDsfEvidence({
    entries: [
      entry('Earth nav data/-40+140/-36+149.dsf', buffer),
      entry(
        'lights/inset_hold_short_Y.obj',
        textBuffer('A\n800\nOBJ\nLIGHT_NAMED hold_short_y 0 0 0\n')
      ),
      entry(
        'textures/apron.pol',
        textBuffer(
          'A\n850\nDRAPED_POLYGON\nTEXTURE ../images/apron.png\nSCALE 2 2\nNO_ALPHA\nSURFACE asphalt\n'
        )
      ),
      entry('images/apron.dds', Uint8Array.of(68, 68, 83, 32)),
      entry(
        'Resources/default scenery/sim objects/library.txt',
        textBuffer(
          'A\n1200\nLIBRARY\nEXPORT lib/airport/lines/1_single_taxi.lin apt_lines/1_single_taxi.lin\n'
        )
      ),
      entry(
        'Resources/default scenery/sim objects/apt_lines/1_single_taxi.lin',
        textBuffer(
          'A\n850\nLINE_PAINT\nTEXTURE taxilines.png\nTEX_WIDTH 1024\nSCALE 12 3\nS_OFFSET 0 46 54 62\nMIRROR\n'
        )
      ),
      entry(
        'Resources/default scenery/sim objects/apt_lines/taxilines.png',
        Uint8Array.of(137, 80, 78, 71)
      ),
      entry(
        'Resources/default scenery/sim objects/apt_lines/taxilines.dds',
        Uint8Array.of(68, 68, 83, 32)
      ),
    ],
    icao: 'TEST',
    airportPosition: { lat: -35.3, lon: 149.19 },
  });

  assert.deepEqual(
    evidence.lightRows.map((row) => [
      row.sourceType,
      row.classification,
      row.evidencePriority,
      row.removalEligible,
    ]),
    [
      ['xplane-dsf-light-string', 'stopbar', 2, true],
      ['xplane-dsf-painted-line', 'taxi-centerline', 3, false],
    ]
  );
  assert.equal(evidence.instances.length, 1);
  assert.equal(evidence.instances[0].classification, 'stopbar');
  assert.equal(evidence.instances[0].evidencePriority, 5);
  const texturedSurface = evidence.referenceFeatures.find(
    (feature) => feature.properties.sourceDefinition === 'textures/apron.pol'
  );
  assert.equal(texturedSurface.properties.textureAssetPath, 'images/apron.dds');
  assert.match(texturedSurface.properties.texturePattern, /^xplane-/);
  assert.equal(texturedSurface.properties.surface, 'asphalt');
  assert.equal(texturedSurface.properties.textureNoAlpha, true);
  const texturedLine = evidence.referenceFeatures.find(
    (feature) => feature.properties.sourceDefinition === 'lib/airport/lines/1_single_taxi.lin'
  );
  assert.equal(
    texturedLine.properties.sourceAssetPath,
    'resources/default scenery/sim objects/apt_lines/1_single_taxi.lin'
  );
  assert.equal(
    texturedLine.properties.textureAssetPath,
    'resources/default scenery/sim objects/apt_lines/taxilines.dds'
  );
  assert.deepEqual(texturedLine.properties.lineTextureLayers, [
    { layer: 0, s1: 46, sm: 54, s2: 62 },
  ]);
  assert.ok(Math.abs(texturedLine.properties.textureWidthMeters - 0.1875) < 0.0001);

  const otherAirport = await extractXPlaneDsfEvidence({
    entries: [entry('Earth nav data/-40+140/-36+149.dsf', buffer)],
    icao: 'OTHER',
    airportPosition: { lat: -35.3, lon: 149.19 },
  });
  assert.equal(otherAirport.lightRows.length, 0);
  assert.equal(otherAirport.instances.length, 0);
});

test('keeps DSF polygon holes and disjoint islands in correct GeoJSON topology', () => {
  const vertex = (lon, lat) => ({ lon, lat });
  const geometry = dsfPolygonGeometry([
    [vertex(0, 0), vertex(10, 0), vertex(10, 10), vertex(0, 10)],
    [vertex(2, 2), vertex(2, 4), vertex(4, 4), vertex(4, 2)],
    [vertex(20, 20), vertex(22, 20), vertex(22, 22), vertex(20, 22)],
  ]);

  assert.equal(geometry.type, 'MultiPolygon');
  assert.equal(geometry.coordinates.length, 2);
  assert.equal(geometry.coordinates[0].length, 2);
  assert.deepEqual(geometry.coordinates[0][1][0], [2, 2]);
});

test('rejects compressed DSFs explicitly instead of mis-decoding binary data', () => {
  const signature = Uint8Array.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 0]);
  assert.throws(
    () => parseXPlaneDsf(signature.buffer),
    (error) => error instanceof XPlaneCompressedDsfError
  );
});

test('treats explicit draped-polygon texture coordinates as UVs, not Bezier controls', async () => {
  const evidence = await extractXPlaneDsfEvidence({
    entries: [
      entry('Earth nav data/-40+110/-32+115.dsf', buildTexturedPolygonFixtureDsf()),
      entry(
        'textures/apron.pol',
        textBuffer('A\n850\nDRAPED_POLYGON\nTEXTURE apron.png\nSURFACE asphalt\n')
      ),
      entry('textures/apron.png', Uint8Array.of(137, 80, 78, 71)),
    ],
    icao: 'YPPH',
    airportPosition: { lat: -31.94, lon: 115.96 },
  });

  assert.equal(evidence.referenceFeatures.length, 1);
  const feature = evidence.referenceFeatures[0];
  const ring = feature.geometry.coordinates[0];
  assert.ok(ring.every(([lon, lat]) => lon > 115 && lon < 116 && lat > -32 && lat < -31));
  const textureWinding = feature.properties.explicitTextureWindings[0];
  assert.equal(textureWinding.length, 5);
  assert.ok(Math.abs(textureWinding[0][2] - 0.1) < 0.001);
  assert.ok(Math.abs(textureWinding[0][3] - 0.2) < 0.001);
  assert.ok(Math.abs(textureWinding[2][2] - 0.9) < 0.001);
  assert.ok(Math.abs(textureWinding[2][3] - 0.8) < 0.001);
  assert.equal(evidence.warnings.length, 0);
});

test('protects explicitly light-bearing DSF assets when their light family is unknown', async () => {
  const objectPath = 'lights/custom_unknown_fixture.obj';
  const evidence = await extractXPlaneDsfEvidence({
    entries: [
      entry('Earth nav data/-40+140/-36+149.dsf', buildFixtureDsf(objectPath)),
      entry(objectPath, textBuffer('A\n800\nOBJ\nLIGHT_NAMED custom_airport_light 0 0 0\n')),
    ],
    icao: 'TEST',
    airportPosition: { lat: -35.3, lon: 149.19 },
  });

  assert.equal(evidence.instances.length, 1);
  assert.equal(evidence.instances[0].classification, 'unknown-light');
  const mustKeepZones = buildMustKeepZones(evidence.instances, evidence.lightRows, []);
  assert.ok(
    mustKeepZones.some(
      (zone) =>
        zone.sourceId === evidence.instances[0].id && zone.classification === 'unknown-light'
    )
  );
});

function buildFixtureDsf(objectPath = 'lights/inset_hold_short_Y.obj') {
  const coordinates = [
    [149.1899, -35.3, 0, 0],
    [149.19, -35.3, 0, 0],
    [149.1901, -35.3, 0, 0],
  ];
  const scales = [
    [1, 149],
    [1, -36],
    [0, 0],
    [0, 0],
  ];
  const rawPlanes = scales.map(([scale, offset], plane) =>
    coordinates.map((point) =>
      scale === 0 ? point[plane] : Math.round(((point[plane] - offset) / scale) * 65_535)
    )
  );
  const poolPayload = concat([
    u32(coordinates.length),
    Uint8Array.of(scales.length),
    ...rawPlanes.flatMap((values) => [
      Uint8Array.of(3),
      rleIndividual(differenceUnsigned16(values)),
    ]),
  ]);
  const scalePayload = concat(scales.flatMap(([scale, offset]) => [f32(scale), f32(offset)]));
  const commands = concat([
    Uint8Array.of(32, 6),
    u16(1),
    s32(0),
    Uint8Array.of(1),
    u16(0),
    Uint8Array.of(3, 0, 12),
    u16(10),
    Uint8Array.of(3),
    u16(0),
    u16(1),
    u16(2),
    Uint8Array.of(3, 1, 12),
    u16(0),
    Uint8Array.of(3),
    u16(0),
    u16(1),
    u16(2),
    Uint8Array.of(3, 2, 12),
    u16(0),
    Uint8Array.of(3),
    u16(0),
    u16(1),
    u16(2),
    Uint8Array.of(3, 0, 7),
    u16(1),
  ]);
  const head = atom(
    'HEAD',
    atom('PROP', stringTable(['sim/filter/aptid', 'TEST', 'sim/overlay', '1']))
  );
  const definitions = atom(
    'DEFN',
    concat([
      atom('OBJT', stringTable([objectPath])),
      atom(
        'POLY',
        stringTable([
          'lib/airport/lights/slow/103_hold_short_steady_Y.str',
          'lib/airport/lines/1_single_taxi.lin',
          'textures/apron.pol',
        ])
      ),
    ])
  );
  const geodata = atom('GEOD', concat([atom('POOL', poolPayload), atom('SCAL', scalePayload)]));
  return concat([
    textBuffer('XPLNEDSF'),
    u32(1),
    head,
    definitions,
    geodata,
    atom('CMDS', commands),
    new Uint8Array(16),
  ]).buffer;
}

function buildTexturedPolygonFixtureDsf() {
  const coordinates = [
    [115.9599, -31.9401, 0.1, 0.2],
    [115.9601, -31.9401, 0.9, 0.2],
    [115.9601, -31.9399, 0.9, 0.8],
    [115.9599, -31.9399, 0.1, 0.8],
  ];
  const scales = [
    [1, 115],
    [1, -32],
    [1, 0],
    [1, 0],
  ];
  const rawPlanes = scales.map(([scale, offset], plane) =>
    coordinates.map((point) => Math.round(((point[plane] - offset) / scale) * 65_535))
  );
  const poolPayload = concat([
    u32(coordinates.length),
    Uint8Array.of(scales.length),
    ...rawPlanes.flatMap((values) => [
      Uint8Array.of(3),
      rleIndividual(differenceUnsigned16(values)),
    ]),
  ]);
  const scalePayload = concat(scales.flatMap(([scale, offset]) => [f32(scale), f32(offset)]));
  const commands = concat([
    Uint8Array.of(1),
    u16(0),
    Uint8Array.of(3, 0, 13),
    u16(65_535),
    u16(0),
    u16(4),
  ]);
  return concat([
    textBuffer('XPLNEDSF'),
    u32(1),
    atom('HEAD', atom('PROP', stringTable(['sim/filter/aptid', 'YPPH']))),
    atom(
      'DEFN',
      concat([atom('OBJT', stringTable([])), atom('POLY', stringTable(['textures/apron.pol']))])
    ),
    atom('GEOD', concat([atom('POOL', poolPayload), atom('SCAL', scalePayload)])),
    atom('CMDS', commands),
    new Uint8Array(16),
  ]).buffer;
}

function entry(path, bytes) {
  const copy = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  return {
    path,
    file: {
      size: copy.byteLength,
      async arrayBuffer() {
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
      async text() {
        return new TextDecoder().decode(copy);
      },
    },
  };
}

function atom(id, payload) {
  const reversed = textBuffer([...id].reverse().join(''));
  return concat([reversed, u32(payload.byteLength + 8), payload]);
}

function stringTable(values) {
  return textBuffer(`${values.join('\0')}\0`);
}

function differenceUnsigned16(values) {
  let previous = 0;
  return values.map((value) => {
    const difference = (value - previous) & 0xffff;
    previous = value;
    return difference;
  });
}

function rleIndividual(values) {
  return concat([Uint8Array.of(values.length), ...values.map(u16)]);
}

function textBuffer(value) {
  return new TextEncoder().encode(value);
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function s32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
}

function f32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return bytes;
}

function concat(parts) {
  const flat = parts.flat(Infinity).filter(Boolean);
  const result = new Uint8Array(flat.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of flat) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
