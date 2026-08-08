import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveXPlaneReferenceTextures } from './xplane-texture-resolution.js';

function entry(path, text = '') {
  return {
    path,
    file: {
      name: path.split('/').at(-1),
      size: text.length,
      text: async () => text,
    },
    size: text.length,
  };
}

test('resolves virtual X-Plane library definitions to nested DDS textures', async () => {
  const scene = {
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.96, -31.95],
            [115.961, -31.95],
          ],
        },
        properties: {
          sourceDefinition: 'lib/airport/lines/hold_short.lin',
          sourceAssetPath: 'lib/airport/lines/hold_short.lin',
          snapCategory: 'painted-lines',
        },
      },
    ],
  };
  const result = await resolveXPlaneReferenceTextures(scene, [
    entry(
      'Resources/default scenery/library.txt',
      'A\n800\nLIBRARY\nEXPORT lib/airport/lines/hold_short.lin objects/airport/lines/hold_short.lin'
    ),
    entry(
      'Resources/default scenery/objects/airport/lines/hold_short.lin',
      'A\n850\nLINE_PAINT\nTEXTURE ../textures/hold_short.png\nSCALE 1 8'
    ),
    entry('Resources/default scenery/objects/airport/textures/hold_short.dds'),
  ]);

  assert.equal(result.stats.definitions, 1);
  assert.equal(result.stats.referencedTextures, 1);
  assert.equal(
    result.scene.features[0].properties.textureAssetPath,
    'resources/default scenery/objects/airport/textures/hold_short.dds'
  );
  assert.match(result.scene.features[0].properties.texturePattern, /^xplane-/);
});

test('resolves a selected nested asset folder without requiring its parent library.txt', async () => {
  const scene = {
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.96, -31.95],
            [115.961, -31.95],
          ],
        },
        properties: {
          sourceDefinition: 'lib/airport/lines/hold_short.lin',
          snapCategory: 'painted-lines',
        },
      },
    ],
  };
  const result = await resolveXPlaneReferenceTextures(scene, [
    entry(
      'airport/lines/hold_short.lin',
      'A\n850\nLINE_PAINT\nTEXTURE ../textures/hold_short.png\nSCALE 1 8'
    ),
    entry('airport/textures/hold_short.dds'),
  ]);

  assert.equal(result.stats.referencedTextures, 1);
  assert.equal(
    result.scene.features[0].properties.textureAssetPath,
    'airport/textures/hold_short.dds'
  );
});

test('connects an unresolved apt.dat marking directly to a selected stock line asset', async () => {
  const scene = {
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [144.84, -37.66],
            [144.841, -37.66],
          ],
        },
        properties: {
          sourceType: 'xplane-apt-painted-marking',
          markingCode: 54,
          renderPattern: 'apt-marking-54',
        },
      },
    ],
  };
  const result = await resolveXPlaneReferenceTextures(scene, [
    entry(
      'Resources/default scenery/airport/lines/54_double_hold_b.lin',
      'A\n850\nLINE_PAINT\nTEXTURE ../textures/apt_lines.png\nSCALE 12 3\nS_OFFSET 0 2 4 6'
    ),
    entry('Resources/default scenery/airport/textures/apt_lines.dds'),
  ]);

  const properties = result.scene.features[0].properties;
  assert.equal(result.stats.resolvedDefinitions, 1);
  assert.equal(
    properties.sourceDefinition,
    'resources/default scenery/airport/lines/54_double_hold_b.lin'
  );
  assert.equal(
    properties.textureAssetPath,
    'resources/default scenery/airport/textures/apt_lines.dds'
  );
  assert.notEqual(properties.renderPattern, 'apt-marking-54');
});

test('resolves seasonal X-Plane library exports and preserves their surface layer', async () => {
  const scene = {
    version: 1,
    simulator: 'xplane',
    features: [
      {
        type: 'Feature',
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
          sourceType: 'xplane-dsf-pol',
          sourceDefinition: 'lib/airport/ground/terrain/grass_solid_dark.pol',
        },
      },
    ],
  };
  const result = await resolveXPlaneReferenceTextures(scene, [
    entry(
      'Resources/default scenery/library.txt',
      'A\n1200\nLIBRARY\nEXPORT_SEASON spr,sum lib/airport/ground/terrain/grass_solid_dark.pol terrain/grass.pol'
    ),
    entry(
      'Resources/default scenery/terrain/grass.pol',
      'A\n850\nDRAPED_POLYGON\nTEXTURE grass.png\nSCALE 280 280\nSURFACE grass\nLAYER_GROUP terrain'
    ),
    entry('Resources/default scenery/terrain/grass.dds'),
  ]);

  const properties = result.scene.features[0].properties;
  assert.equal(result.stats.resolvedDefinitions, 1);
  assert.equal(properties.textureDefinitionResolved, true);
  assert.equal(properties.surface, 'grass');
  assert.equal(properties.layerGroup, 'terrain');
  assert.equal(properties.textureAssetPath, 'resources/default scenery/terrain/grass.dds');
});

test('does not claim an unavailable virtual definition was resolved', async () => {
  const result = await resolveXPlaneReferenceTextures(
    {
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 1],
              [2, 2],
            ],
          },
          properties: {
            sourceType: 'xplane-dsf-lin',
            sourceDefinition: 'lib/airport/lines/missing.lin',
          },
        },
      ],
    },
    []
  );

  assert.equal(result.stats.definitions, 1);
  assert.equal(result.stats.resolvedDefinitions, 0);
  assert.equal(result.scene.features[0].properties.textureDefinitionResolved, undefined);
});
