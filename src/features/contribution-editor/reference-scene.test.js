import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReferenceScene,
  normalizeReferenceScene,
  normalizeRunway,
  preferSourceBackedRunwayMarkings,
  referenceFeatureIsVisible,
  referenceSurfaceStyle,
  referenceTexturePattern,
} from './reference-scene.js';

test('merges co-located MSFS light layers into one editable reference row', () => {
  const lightRow = (id, latitude) => ({
    id,
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-airport-light-row',
    classification: 'stopbar',
    confidence: 1,
    removalEligible: true,
    vertices: [
      { lat: latitude, lon: 151 },
      { lat: latitude, lon: 151.0001 },
    ],
  });
  const scene = buildReferenceScene(
    {
      lightRows: [
        lightRow('layer-a', -33.9),
        lightRow('layer-b', -33.899999),
        lightRow('layer-c', -33.900001),
      ],
      mustKeepZones: [],
    },
    'msfs'
  );
  const editableRows = scene.features.filter(
    (feature) => feature.properties?.msfsRemovalTarget === true
  );

  assert.equal(editableRows.length, 1);
  assert.deepEqual(editableRows[0].properties.sourceRowIds.sort(), [
    'layer-a',
    'layer-b',
    'layer-c',
  ]);
});

test('keeps a merged MSFS row protected when any raw source row is must-keep', () => {
  const sourceRows = ['layer-a', 'layer-b'].map((id, index) => ({
    id,
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-airport-light-row',
    classification: 'lead-on',
    confidence: 1,
    removalEligible: true,
    vertices: [
      { lat: -33.9 + index * 0.000001, lon: 151 },
      { lat: -33.9 + index * 0.000001, lon: 151.0001 },
    ],
  }));
  const scene = buildReferenceScene(
    {
      lightRows: sourceRows,
      mustKeepZones: [{ id: 'keep-layer-b', sourceId: 'layer-b' }],
    },
    'msfs'
  );
  const mergedRow = scene.features.find((feature) =>
    feature.properties?.sourceRowIds?.includes('layer-b')
  );

  assert.equal(mergedRow.properties.mustKeep, true);
  assert.equal(mergedRow.properties.msfsRemovalTarget, false);
});

test('migrates cached MSFS reference rows to the editor co-location rule', () => {
  const rowScene = (id, latitude, sourceFile) =>
    buildReferenceScene(
      {
        lightRows: [
          {
            id,
            sourceFile,
            sourceType: 'bgl-airport-light-row',
            classification: 'taxi-centerline',
            removalEligible: true,
            vertices: [
              { lat: latitude, lon: 144.84 },
              { lat: latitude, lon: 144.841 },
            ],
          },
        ],
        mustKeepZones: [],
      },
      'msfs'
    );
  const first = rowScene('ymml-aqycy-a', -37.6733, 'lighting-a.bgl');
  const second = rowScene('ymml-aqycy-b', -37.6732937, 'lighting-b.bgl');
  const migrated = normalizeReferenceScene({
    ...first,
    version: 2,
    features: [...first.features, ...second.features],
  });
  const editableRows = migrated.features.filter(
    (feature) => feature.properties?.msfsRemovalTarget === true
  );

  assert.equal(migrated.version, 3);
  assert.equal(editableRows.length, 1);
  assert.deepEqual(editableRows[0].properties.sourceRowIds.sort(), [
    'ymml-aqycy-a',
    'ymml-aqycy-b',
  ]);
});

test('normalizes compiled MSFS runway records before editor references are generated', () => {
  const runway = normalizeRunway({
    id: 'compiled-runway',
    lon: 115.967,
    lat: -31.94,
    heading: 30,
    lengthMeters: 3200,
    widthMeters: 45,
    primaryLabel: '03',
    secondaryLabel: '21',
    shoulderCode: 102,
  });
  assert.equal(runway.first.label, '03');
  assert.equal(runway.second.label, '21');
  assert.ok(Number.isFinite(runway.first.lon));
  assert.ok(Number.isFinite(runway.second.lat));
  const scene = buildReferenceScene({ runways: [runway] }, 'msfs');
  assert.equal(scene.version, 3);
  assert.ok(
    scene.features.some((feature) => feature.properties.semanticType === 'runway-shoulder')
  );
  assert.ok(scene.features.some((feature) => feature.properties.semanticType === 'runway-surface'));
  assert.equal(
    scene.features.some((feature) => feature.properties.semanticType === 'runway-centreline'),
    false
  );
});

test('classifies unresolved X-Plane grass definitions as grass instead of pavement', () => {
  const style = referenceSurfaceStyle({
    sourceType: 'xplane-dsf-pol',
    sourceDefinition: 'lib/airport/ground/terrain/grass_solid_dark.pol',
  });

  assert.equal(style.label, 'Grass');
  assert.equal(style.color, '#3f6212');
});

test('keeps legacy textured references visible when their category is missing', () => {
  const visible = new Set(['painted-lines']);
  assert.equal(
    referenceFeatureIsVisible({ properties: { texturePattern: 'legacy' } }, visible),
    true
  );
  assert.equal(
    referenceFeatureIsVisible({ properties: { snapCategory: 'pavement-edges' } }, visible),
    false
  );
});

test('assigns MSFS package references to the correct visibility controls', () => {
  const makeFeature = (id, sourceType, geometry) => ({
    type: 'Feature',
    id,
    properties: { sourceId: id, sourceType },
    geometry,
  });
  const point = { type: 'Point', coordinates: [115.96, -31.95] };
  const line = {
    type: 'LineString',
    coordinates: [
      [115.96, -31.95],
      [115.961, -31.95],
    ],
  };
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [115.96, -31.95],
        [115.961, -31.95],
        [115.96, -31.949],
        [115.96, -31.95],
      ],
    ],
  };
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        makeFeature('paint', 'msfs-bgl-painted-line-cf', line),
        makeFeature('lights', 'msfs-bgl-light-point-derived-from-31', point),
        makeFeature('object', 'msfs-bgl-library-object', point),
        makeFeature('apron', 'msfs-bgl-apron-v6-d0', polygon),
      ],
    },
    'msfs'
  );

  assert.deepEqual(
    Object.fromEntries(
      scene.features.map((feature) => [feature.id, feature.properties.snapCategory])
    ),
    {
      paint: 'painted-lines',
      lights: 'light-rows',
      object: 'fixtures',
      apron: 'pavement-edges',
    }
  );
});

test('marks decoded target lights as removable while retaining must-keep BGL lights', () => {
  const lightRow = (id, classification, latitude) => ({
    id,
    sourceType: 'bgl-airport-light-row',
    classification,
    removalEligible: true,
    vertices: [
      { lon: 151, lat: latitude },
      { lon: 151.0001, lat: latitude },
    ],
  });
  const scene = buildReferenceScene(
    {
      lightRows: [
        lightRow('target', 'stopbar', -33.9),
        lightRow('retained', 'runway-edge', -33.901),
      ],
      mustKeepZones: [{ id: 'keep-zone', sourceId: 'retained' }],
    },
    'msfs'
  );
  const byId = new Map(scene.features.map((feature) => [feature.id, feature.properties]));
  assert.equal(byId.get('target').msfsRemovalTarget, true);
  assert.equal(byId.get('target').mustKeep, false);
  assert.equal(byId.get('retained').msfsRemovalTarget, false);
  assert.equal(byId.get('retained').mustKeep, true);
});

test('repairs visibility categories on a restored MSFS reference scene', () => {
  const scene = normalizeReferenceScene({
    version: 2,
    simulator: 'msfs',
    features: [
      {
        type: 'Feature',
        id: 'restored-light',
        properties: {
          sourceId: 'restored-light',
          sourceType: 'msfs-bgl-light-point-derived-from-31',
        },
        geometry: { type: 'Point', coordinates: [115.96, -31.95] },
      },
    ],
  });

  assert.equal(scene.features[0].properties.snapCategory, 'light-rows');
});

test('classifies X-Plane lawn-track terrain decals as grass', () => {
  const style = referenceSurfaceStyle({
    sourceType: 'xplane-dsf-pol',
    sourceDefinition: 'lib/airport/ground/terrain_FX/lawn_tracks/area_2.pol',
  });

  assert.equal(style.label, 'Grass');
  assert.equal(style.opacity, 0.62);
});

test('renders an unknown DSF polygon as a subtle overlay instead of opaque pavement', () => {
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        {
          type: 'Feature',
          id: 'overlay',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [115.96, -31.95],
                [115.961, -31.95],
                [115.961, -31.949],
                [115.96, -31.95],
              ],
            ],
          },
          properties: {
            sourceId: 'overlay',
            sourceType: 'xplane-dsf-pol',
            snapCategory: 'pavement-edges',
          },
        },
      ],
    },
    'xplane'
  );

  assert.equal(scene.features[0].properties.surfaceLabel, 'Scenery overlay');
  assert.equal(scene.features[0].properties.surfaceOpacity, 0.12);
});

test('uses source-backed runway category for procedural centreline dimensions', () => {
  const scene = buildReferenceScene(
    {
      runways: [
        {
          id: 'runway',
          widthMeters: 45,
          first: { lon: 151.17, lat: -33.95, markingCode: 3, approachType: 1 },
          second: { lon: 151.18, lat: -33.94, markingCode: 3, approachType: 1 },
        },
      ],
    },
    'xplane'
  );
  const centreline = scene.features.find(
    (feature) => feature.properties?.renderPattern === 'apt-marking-22'
  );

  assert.equal(centreline.properties.widthMeters, 0.45);
  assert.equal(centreline.properties.textureHeightMeters, 50);
});

test('uses a 0.9 metre centreline when the source declares a category II or III approach', () => {
  const scene = buildReferenceScene(
    {
      runways: [
        {
          id: 'runway',
          widthMeters: 45,
          surfaceCode: 1,
          first: { lon: 151.17, lat: -33.95, markingCode: 3, approachType: 2 },
          second: { lon: 151.18, lat: -33.94, markingCode: 3, approachType: 2 },
        },
      ],
    },
    'xplane'
  );
  const centreline = scene.features.find(
    (feature) => feature.properties?.renderPattern === 'apt-marking-22'
  );

  assert.equal(centreline.properties.widthMeters, 0.9);
});

test('renders one visual for matching DSF line and painted-line evidence rows', () => {
  const coordinates = [
    [151.17, -33.95],
    [151.171, -33.949],
  ];
  const sharedProperties = {
    sourceFile: 'Earth nav data/-40+150/-34+151.dsf',
    sourceDefinition: 'lib/airport/lines/22.lin',
    texturePixelWidth: 1024,
    textureScaleX: 12,
    textureScaleY: 3,
    lineTextureLayers: [{ layer: 0, s1: 46, sm: 54, s2: 62 }],
  };
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        {
          type: 'Feature',
          id: 'visual-line',
          geometry: { type: 'LineString', coordinates },
          properties: {
            ...sharedProperties,
            sourceId: 'visual-line',
            sourceType: 'xplane-dsf-lin',
          },
        },
      ],
      lightRows: [
        {
          ...sharedProperties,
          id: 'evidence-line',
          sourceType: 'xplane-dsf-painted-line',
          vertices: coordinates.map(([lon, lat]) => ({ lon, lat })),
        },
      ],
    },
    'xplane'
  );

  assert.equal(scene.features.length, 1);
  assert.equal(scene.features[0].properties.sourceId, 'visual-line');
  assert.equal(scene.features[0].properties.widthMeters, 0.1875);
});

test('migrates cached X-Plane scenes without requiring another scenery upload', () => {
  const coordinates = [
    [151.17, -33.95],
    [151.171, -33.949],
  ];
  const sharedProperties = {
    sourceFile: 'Earth nav data/-40+150/-34+151.dsf',
    sourceDefinition: 'lib/airport/lines/22.lin',
    texturePixelWidth: 1024,
    textureScaleX: 12,
    textureScaleY: 3,
    lineTextureLayers: [{ layer: 0, s1: 46, sm: 54, s2: 62 }],
  };
  const legacyScene = {
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
        id: 'visual-line',
        geometry: { type: 'LineString', coordinates },
        properties: {
          ...sharedProperties,
          sourceId: 'visual-line',
          sourceType: 'xplane-dsf-lin',
        },
      },
      {
        type: 'Feature',
        id: 'duplicate-evidence',
        geometry: { type: 'LineString', coordinates },
        properties: {
          ...sharedProperties,
          sourceId: 'duplicate-evidence',
          sourceType: 'xplane-dsf-painted-line',
        },
      },
    ],
  };

  const migrated = normalizeReferenceScene(legacyScene);

  assert.equal(migrated.features.length, 1);
  assert.equal(migrated.features[0].properties.sourceId, 'visual-line');
  assert.equal(migrated.features[0].properties.widthMeters, 0.1875);
});

test('migrates unresolved apt.dat markings to their stock physical dimensions', () => {
  const feature = (id, markingCode, latitude) => ({
    type: 'Feature',
    id,
    geometry: {
      type: 'LineString',
      coordinates: [
        [144.84, latitude],
        [144.841, latitude],
      ],
    },
    properties: {
      sourceId: id,
      sourceType: 'xplane-apt-painted-marking',
      snapCategory: 'painted-lines',
      markingCode,
      renderPattern: `apt-marking-${markingCode}`,
    },
  });
  const migrated = normalizeReferenceScene({
    version: 1,
    simulator: 'xplane',
    features: [feature('shoulder-bars', 19, -37.66), feature('bordered-hold', 54, -37.661)],
  });

  assert.deepEqual(
    migrated.features.map((item) => [
      item.properties.markingCode,
      item.properties.widthMeters,
      item.properties.textureHeightMeters,
    ]),
    [
      [19, 3, 3],
      [54, 1.5, 3],
    ]
  );
});

test('migrates the legacy X-Plane soil material to its declared NO_ALPHA behavior', () => {
  const scene = normalizeReferenceScene({
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
        id: 'soil',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [144.84, -37.66],
              [144.85, -37.66],
              [144.85, -37.65],
              [144.84, -37.66],
            ],
          ],
        },
        properties: {
          sourceType: 'xplane-dsf-pol',
          sourceDefinition: 'lib/airport/ground/terrain/soil_1.pol',
          texturePattern: 'xplane-soil',
        },
      },
    ],
  });

  assert.equal(scene.features[0].properties.textureNoAlpha, true);
  assert.equal(scene.features[0].properties.texturePattern, 'xplane-soil-opaque');
});

test('partial DSF paint does not erase a larger procedural runway marking', () => {
  const polygon = (west, south, east, north) => ({
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  });
  const procedural = {
    type: 'Feature',
    id: 'generated-number',
    geometry: polygon(151.17, -33.95, 151.171, -33.949),
    properties: {
      sourceType: 'xplane-apt-runway-generated',
      semanticType: 'runway-marking',
      snapCategory: 'painted-lines',
    },
  };
  const source = {
    type: 'Feature',
    id: 'source-paint',
    geometry: polygon(151.1705, -33.9505, 151.1715, -33.9495),
    properties: {
      sourceType: 'xplane-dsf-pol',
      snapCategory: 'painted-lines',
      texturePattern: 'source-paint',
    },
  };

  assert.deepEqual(preferSourceBackedRunwayMarkings([procedural, source]), [procedural, source]);
});

test('source-backed DSF paint replaces a procedural runway marking it fully covers', () => {
  const polygon = (west, south, east, north) => ({
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  });
  const procedural = {
    type: 'Feature',
    id: 'generated-number',
    geometry: polygon(151.17, -33.95, 151.171, -33.949),
    properties: {
      sourceType: 'xplane-apt-runway-generated',
      semanticType: 'runway-marking',
      snapCategory: 'painted-lines',
    },
  };
  const source = {
    type: 'Feature',
    id: 'source-paint',
    geometry: polygon(151.169, -33.951, 151.172, -33.948),
    properties: {
      sourceType: 'xplane-dsf-pol',
      snapCategory: 'painted-lines',
      texturePattern: 'source-paint',
    },
  };

  assert.deepEqual(preferSourceBackedRunwayMarkings([procedural, source]), [source]);
});

test('renders visual-runway side stripes and breaks them across exact taxiway pavement', () => {
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        {
          type: 'Feature',
          id: 'taxiway-entry',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [151.1748, -33.951],
                [151.1752, -33.951],
                [151.1752, -33.949],
                [151.1748, -33.949],
                [151.1748, -33.951],
              ],
            ],
          },
          properties: {
            sourceId: 'taxiway-entry',
            sourceType: 'xplane-apt-pavement',
            snapCategory: 'pavement-edges',
          },
        },
      ],
      runways: [
        {
          id: 'visual-runway',
          widthMeters: 45,
          surfaceCode: 1,
          first: {
            label: '07',
            lon: 151.17,
            lat: -33.95,
            markingCode: 1,
            approachType: 0,
          },
          second: {
            label: '25',
            lon: 151.18,
            lat: -33.95,
            markingCode: 1,
            approachType: 0,
          },
        },
      ],
    },
    'xplane'
  );
  const edgeStripes = scene.features.filter(
    (feature) => feature.properties?.title === 'Runway edge marking'
  );
  const centreline = scene.features.find(
    (feature) => feature.properties?.title === 'Runway painted centreline'
  );

  assert.ok(centreline);
  assert.equal(edgeStripes.length, 4);
});

test('breaks runway side stripes where another source runway intersects', () => {
  const runwayEnd = (label, lon, lat, markingCode) => ({
    label,
    lon,
    lat,
    markingCode,
    approachType: 0,
  });
  const scene = buildReferenceScene(
    {
      runways: [
        {
          id: 'primary-runway',
          widthMeters: 45,
          surfaceCode: 1,
          first: runwayEnd('07', 151.17, -33.95, 1),
          second: runwayEnd('25', 151.18, -33.95, 1),
        },
        {
          id: 'crossing-runway',
          widthMeters: 30,
          surfaceCode: 1,
          first: runwayEnd('16', 151.175, -33.955, 0),
          second: runwayEnd('34', 151.175, -33.945, 0),
        },
      ],
    },
    'xplane'
  );
  const primaryEdgeStripes = scene.features.filter(
    (feature) =>
      feature.properties?.title === 'Runway edge marking' &&
      String(feature.properties?.sourceId).startsWith('primary-runway:')
  );

  assert.equal(primaryEdgeStripes.length, 4);
});

test('assigns stock X-Plane pavement textures with their physical metre scale', () => {
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        {
          type: 'Feature',
          id: 'pavement',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [151.17, -33.95],
                [151.171, -33.95],
                [151.171, -33.949],
                [151.17, -33.95],
              ],
            ],
          },
          properties: {
            sourceId: 'pavement',
            sourceType: 'xplane-apt-pavement',
            snapCategory: 'pavement-edges',
            surfaceCode: 1,
            materialKind: 'asphalt-medium',
            textureHeading: 27,
          },
        },
      ],
    },
    'xplane'
  );
  const pavement = scene.features[0];

  assert.equal(
    pavement.properties.textureAssetPath,
    'sim objects/apt_pavement/textures/asphalt_2b_ALB.png'
  );
  assert.equal(pavement.properties.textureScaleX, 18);
  assert.equal(pavement.properties.textureScaleY, 36);
  assert.equal(pavement.properties.textureHeading, 27);
  assert.equal(pavement.properties.layerGroup, 'taxiways');
});

test('keeps a shared X-Plane image separate for line and pavement rendering', () => {
  const sharedProperties = {
    textureAssetPath: 'textures/shared.dds',
    texturePattern: 'xplane-shared-texture',
  };
  const scene = buildReferenceScene(
    {
      referenceFeatures: [
        {
          type: 'Feature',
          id: 'surface',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [151.17, -33.95],
                [151.171, -33.95],
                [151.171, -33.949],
                [151.17, -33.95],
              ],
            ],
          },
          properties: {
            ...sharedProperties,
            sourceId: 'surface',
            snapCategory: 'pavement-edges',
          },
        },
        {
          type: 'Feature',
          id: 'line',
          geometry: {
            type: 'LineString',
            coordinates: [
              [151.17, -33.95],
              [151.171, -33.949],
            ],
          },
          properties: {
            ...sharedProperties,
            sourceId: 'line',
            sourceDefinition: 'lib/airport/lines/shared.lin',
            snapCategory: 'painted-lines',
            lineTextureLayers: [{ s1: 0, s2: 1, offset: 0 }],
          },
        },
      ],
    },
    'xplane'
  );
  const surface = scene.features.find((feature) => feature.id === 'surface');
  const line = scene.features.find((feature) => feature.id === 'line');

  assert.equal(referenceTexturePattern(surface), 'xplane-shared-texture');
  assert.match(referenceTexturePattern(line), /^xplane-shared-texture-line-/);
  assert.notEqual(referenceTexturePattern(surface), referenceTexturePattern(line));
});

test('textures the runway surface without treating generated paint as pavement', () => {
  const scene = buildReferenceScene(
    {
      runways: [
        {
          id: 'runway',
          widthMeters: 45,
          surfaceCode: 2,
          materialKind: 'concrete-medium',
          first: { lon: 151.17, lat: -33.95, markingCode: 3, label: '16R' },
          second: { lon: 151.17, lat: -33.93, markingCode: 3, label: '34L' },
        },
      ],
    },
    'xplane'
  );
  const surface = scene.features.find(
    (feature) => feature.properties.semanticType === 'runway-surface'
  );
  const threshold = scene.features.find((feature) =>
    feature.properties.title?.includes('threshold marking')
  );

  assert.equal(
    surface.properties.textureAssetPath,
    'sim objects/apt_pavement/textures/concrete_2a_ALB.png'
  );
  assert.equal(surface.properties.textureScaleX, 22);
  assert.equal(surface.properties.textureScaleY, 44);
  assert.ok(Number.isFinite(surface.properties.textureHeading));
  assert.equal(threshold.properties.texturePattern, undefined);
  assert.equal(
    scene.features.filter((feature) => feature.properties.title?.includes('threshold marking'))
      .length,
    24
  );
  assert.ok(
    scene.features.some(
      (feature) =>
        feature.geometry.type === 'Polygon' && feature.properties.title === 'Runway designation 16R'
    )
  );
  const numberGlyphs = scene.features.filter((feature) =>
    feature.properties.sourceId?.includes('first-designation-number')
  );
  const numberLongitudes = numberGlyphs.flatMap((feature) =>
    feature.geometry.coordinates[0].map((coordinate) => coordinate[0])
  );
  const numberWidthMeters =
    (Math.max(...numberLongitudes) - Math.min(...numberLongitudes)) *
    111_320 *
    Math.cos((-33.95 * Math.PI) / 180);
  assert.ok(numberWidthMeters > 5 && numberWidthMeters < 8);
  const firstNumber = scene.features.filter((feature) =>
    feature.properties.sourceId?.includes('first-designation-number')
  );
  const firstLetter = scene.features.filter((feature) =>
    feature.properties.sourceId?.includes('first-designation-letter')
  );
  assert.equal(firstNumber.length, 2);
  assert.equal(firstLetter.length, 1);
  assert.equal(
    firstNumber.find((feature) => feature.properties.sourceId?.endsWith('-1')).geometry.coordinates
      .length,
    2
  );
  assert.equal(firstLetter[0].geometry.coordinates.length, 2);
  const latitudeCenter = (features) => {
    const coordinates = features.flatMap((feature) => feature.geometry.coordinates[0]);
    const latitudes = coordinates.map((coordinate) => coordinate[1]);
    return (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  };
  const stackedGapMeters =
    (latitudeCenter(firstNumber) - latitudeCenter(firstLetter)) * 111_320 - 9.25;
  assert.ok(stackedGapMeters > 5.5 && stackedGapMeters < 6.5);
  assert.equal(scene.features.filter((feature) => feature.properties.runwayLabel).length, 0);
});
