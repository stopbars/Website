import assert from 'node:assert/strict';
import test from 'node:test';
import {
  barsIdSuggestions,
  colorForObjectId,
  createEditorDocument,
  editorDocumentToGeojson,
  originalDivisionsFromPoints,
  originalDivisionsToGeojson,
  normalizeDocument,
  parseDraftXml,
  serializeDraftXml,
} from './editor-model.js';

test('round-trips edited X-Plane geometry and compact removal selectors', () => {
  const document = createEditorDocument({
    icao: 'YPPH',
    simulator: 'xplane',
    altitude: 20,
    draftGeojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [115.9698, -31.9398],
              [115.9708, -31.9408],
            ],
          },
          properties: {
            featureType: 'original-division',
            divisionId: 'BARS_TEST',
            title: 'Original A',
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [115.97, -31.94],
              [115.971, -31.941],
            ],
          },
          properties: {
            featureType: 'matched',
            divisionId: 'BARS_TEST',
            title: 'A',
            divisionType: 'lead_on',
            sourceRowId: 'source-row',
            sourceFeatureId: 'feature-id',
            sourceType: 'xplane-apt-light-string',
          },
        },
      ],
    },
  });
  document.xplaneRemovals = [
    { feature: '0123456789abcdef', code: 101, run: 0, start: 0.1, end: 0.9 },
  ];

  const xml = serializeDraftXml(document);
  const parsed = parseDraftXml(xml);
  assert.equal(parsed.simulator, 'xplane');
  assert.equal(parsed.objects[0].id, 'BARS_TEST');
  assert.deepEqual(parsed.objects[0].coordinates, document.objects[0].coordinates);
  assert.deepEqual(parsed.xplaneRemovals, document.xplaneRemovals);
  assert.equal(document.originalDivisions.length, 1);
  assert.deepEqual(originalDivisionsToGeojson(document).features[0].properties, {
    featureType: 'original-division',
    divisionId: 'BARS_TEST',
    title: 'Original A',
    divisionType: 'unknown',
    matched: true,
    quickAddable: true,
    color: document.objects[0].color,
  });
  assert.doesNotMatch(xml, /Original A|original-division/);
});

test('keeps MSFS removal polygons separate from editable BARS objects', () => {
  const xml = `<?xml version="1.0"?>
<FSData version="9.0">
  <Polygon displayName="BARS_ONE" altitude="5"><Vertex lat="-31.9" lon="115.9"/><Vertex lat="-31.91" lon="115.91"/></Polygon>
  <Polygon displayName="remove" altitude="5"><Vertex lat="-31.9" lon="115.9"/><Vertex lat="-31.9" lon="115.91"/><Vertex lat="-31.91" lon="115.91"/></Polygon>
</FSData>`;
  const parsed = parseDraftXml(xml);
  assert.equal(parsed.objects.length, 1);
  assert.equal(parsed.removals.length, 1);
  assert.equal(parsed.removals[0].coordinates.length, 4);
});

test('restores canonical object metadata while opening editable XML', () => {
  const xml = `<?xml version="1.0"?>
<FSData version="9.0">
  <Polygon displayName="BARS_ONE" altitude="5"><Vertex lat="-31.9" lon="115.9"/><Vertex lat="-31.91" lon="115.91"/></Polygon>
</FSData>`;
  const restored = createEditorDocument({
    icao: 'YPPH',
    simulator: 'msfs',
    draftXml: xml,
    originalDivisions: [
      {
        id: 'bars_one',
        name: 'Taxiway route',
        type: 'taxiway',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.9, -31.9],
            [115.91, -31.91],
          ],
        },
      },
    ],
  });

  assert.equal(restored.objects[0].name, 'Taxiway route');
  assert.equal(restored.objects[0].type, 'taxiway');
});

test('explains that a published runtime map cannot be opened in the editor', () => {
  assert.throws(
    () => parseDraftXml('<?xml version="1.0"?><BarsLights></BarsLights>'),
    /published runtime map/
  );
});

test('keeps BGL source and must-keep metadata on generated MSFS removals', () => {
  const document = createEditorDocument({
    icao: 'YSWS',
    simulator: 'msfs',
    draftGeojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [150.7, -33.9],
                [150.701, -33.9],
                [150.701, -33.901],
                [150.7, -33.9],
              ],
            ],
          },
          properties: {
            featureType: 'removal',
            sourceIds: ['bgl-row-1'],
            origin: 'msfs-source',
            mustKeepZoneIds: ['runway-light-zone'],
            sourceLines: [
              {
                sourceId: 'bgl-row-1',
                coordinates: [
                  [150.7, -33.9],
                  [150.701, -33.901],
                ],
              },
            ],
          },
        },
      ],
    },
  });
  assert.deepEqual(document.removals[0].sourceIds, ['bgl-row-1']);
  assert.equal(document.removals[0].origin, 'msfs-source');
  assert.deepEqual(document.removals[0].mustKeepZoneIds, ['runway-light-zone']);
  assert.deepEqual(document.removals[0].sourceLines, [
    {
      sourceId: 'bgl-row-1',
      coordinates: [
        [150.7, -33.9],
        [150.701, -33.901],
      ],
    },
  ]);
});

test('round-trips exact MSFS removal targets and typed object exclusions', () => {
  const document = normalizeDocument({
    icao: 'YSSY',
    simulator: 'msfs',
    removals: [
      {
        id: 'light-row',
        coordinates: [
          [151.17, -33.93],
          [151.171, -33.93],
          [151.171, -33.931],
          [151.17, -33.93],
        ],
        targetLightPoints: [{ lat: -33.9305, lon: 151.1705, heading: 187.25 }],
      },
      {
        id: 'library-light',
        coordinates: [
          [151.18, -33.94],
          [151.181, -33.94],
          [151.181, -33.941],
          [151.18, -33.94],
        ],
        exclusionFlags: { excludeLibraryObjects: true },
      },
    ],
  });

  const xml = serializeDraftXml(document);
  const parsed = parseDraftXml(xml);

  assert.match(xml, /<MSFSRemovals version="1">/);
  assert.deepEqual(parsed.removals[0].targetLightPoints, [
    { lat: -33.9305, lon: 151.1705, heading: 187.25 },
  ]);
  assert.deepEqual(parsed.removals[1].exclusionFlags, {
    excludeLibraryObjects: true,
    excludeVFX: false,
    excludeSimPropContainers: false,
  });
});

test('round-trips manual MSFS removal sections and metadata-only keep sections', () => {
  const document = normalizeDocument({
    icao: 'EGLL',
    simulator: 'msfs',
    removals: [
      {
        id: 'kept-row',
        coordinates: [],
        origin: 'msfs-manual',
        sourceIds: ['row-keep'],
        keepSelections: [{ sourceId: 'row-keep' }],
      },
      {
        id: 'section-row',
        coordinates: [
          [-0.46, 51.47],
          [-0.459, 51.47],
          [-0.459, 51.471],
          [-0.46, 51.47],
        ],
        origin: 'msfs-manual',
        sourceIds: ['row-remove'],
        selections: [
          { sourceId: 'row-remove', rangeStartMeters: 12.25, rangeEndMeters: 30.75 },
        ],
        keepSelections: [
          { sourceId: 'row-remove', rangeStartMeters: 30.75, rangeEndMeters: 31.25 },
        ],
        targetLightPoints: [
          { lat: 51.4705, lon: -0.4595, heading: 90, supportSizeMeters: 0.75 },
        ],
      },
    ],
  });

  const xml = serializeDraftXml(document);
  const parsed = parseDraftXml(xml);
  const keptRow = parsed.removals.find((removal) => removal.id === 'kept-row');
  const sectionRow = parsed.removals.find((removal) => removal.id === 'section-row');

  assert.equal(document.removals.length, 2);
  assert.match(xml, /<Target removalIndex="0"/);
  assert.match(xml, /supportSizeMeters="0\.750"/);
  assert.match(xml, /<EditorRemoval editorIndex="0" id="kept-row"/);
  assert.ok(keptRow);
  assert.deepEqual(keptRow.keepSelections, [{ sourceId: 'row-keep' }]);
  assert.ok(sectionRow);
  assert.deepEqual(sectionRow.selections, [
    { sourceId: 'row-remove', rangeStartMeters: 12.25, rangeEndMeters: 30.75 },
  ]);
  assert.deepEqual(sectionRow.keepSelections, [
    { sourceId: 'row-remove', rangeStartMeters: 30.75, rangeEndMeters: 31.25 },
  ]);
  assert.deepEqual(sectionRow.targetLightPoints, [
    { lat: 51.4705, lon: -0.4595, heading: 90, supportSizeMeters: 0.75 },
  ]);

  const imported = createEditorDocument({ icao: 'EGLL', draftXml: xml });
  assert.equal(imported.removals.length, 2);
  assert.ok(imported.removals.every((removal) => removal.origin === 'imported'));
  assert.ok(imported.removals.every((removal) => removal.importedOrigin === 'msfs-manual'));
  assert.deepEqual(imported.removals.find((removal) => removal.id === 'kept-row').keepSelections,
    [{ sourceId: 'row-keep' }]);
  assert.deepEqual(imported.removals.find((removal) => removal.id === 'section-row').selections,
    sectionRow.selections);
});

test('round-trips the MSFS polygon fallback for rows without exact lamp coordinates', () => {
  const document = normalizeDocument({
    icao: 'WSSS',
    simulator: 'msfs',
    removals: [
      {
        id: 'taxiway-path',
        coordinates: [
          [103.98, 1.35],
          [103.981, 1.35],
          [103.981, 1.351],
          [103.98, 1.35],
        ],
        origin: 'msfs-source',
        removalMode: 'polygon',
      },
    ],
  });

  const xml = serializeDraftXml(document);
  const parsed = parseDraftXml(xml);

  assert.match(xml, /<Removal removalIndex="0" mode="polygon"\/>/);
  assert.equal(parsed.removals[0].removalMode, 'polygon');
});

test('imports multipart geometry with one BARS ID and distinct editor part keys', () => {
  const xml = `<?xml version="1.0"?>
<FSData version="9.0" simulator="xplane">
  <Polygon displayName="BARS_MULTI"><Vertex lat="-33.9" lon="151.1"/><Vertex lat="-33.91" lon="151.11"/></Polygon>
  <Polygon displayName="BARS_MULTI"><Vertex lat="-33.91" lon="151.11"/><Vertex lat="-33.92" lon="151.12"/></Polygon>
</FSData>`;
  const parsed = parseDraftXml(xml);
  assert.equal(parsed.objects[0].id, parsed.objects[1].id);
  assert.notEqual(parsed.objects[0].partId, parsed.objects[1].partId);
  assert.equal(parsed.objects[0].groupId, parsed.objects[1].groupId);
});

test('draft GeoJSON imports only objects linked to simulator scenery', () => {
  const document = createEditorDocument({
    icao: 'YSSY',
    simulator: 'xplane',
    draftXml: `<?xml version="1.0"?>
<FSData version="9.0" simulator="xplane">
  <Polygon displayName="BARS_LINKED"><Vertex lat="-33.9" lon="151.1"/><Vertex lat="-33.91" lon="151.11"/></Polygon>
  <Polygon displayName="BARS_UNLINKED"><Vertex lat="-33.9" lon="151.2"/><Vertex lat="-33.91" lon="151.21"/></Polygon>
</FSData>`,
    draftGeojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [151.1, -33.9],
              [151.11, -33.91],
            ],
          },
          properties: {
            featureType: 'matched',
            divisionId: 'BARS_LINKED',
            sourceRowId: 'source-row',
          },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [151.2, -33.9],
              [151.21, -33.91],
            ],
          },
          properties: {
            featureType: 'unmatched',
            divisionId: 'BARS_UNLINKED',
          },
        },
      ],
    },
  });

  assert.deepEqual(
    document.objects.map((object) => object.id),
    ['BARS_LINKED']
  );
});

test('an empty linked draft set does not fall back to unlinked XML objects', () => {
  const document = createEditorDocument({
    icao: 'YSSY',
    simulator: 'xplane',
    draftXml: `<?xml version="1.0"?>
<FSData version="9.0" simulator="xplane">
  <Polygon displayName="BARS_UNLINKED"><Vertex lat="-33.9" lon="151.2"/><Vertex lat="-33.91" lon="151.21"/></Polygon>
</FSData>`,
    draftGeojson: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [151.2, -33.9],
              [151.21, -33.91],
            ],
          },
          properties: {
            featureType: 'unmatched',
            divisionId: 'BARS_UNLINKED',
          },
        },
      ],
    },
  });

  assert.deepEqual(document.objects, []);
});

test('drops unmatched objects restored from an older editor cache', () => {
  const document = createEditorDocument({
    icao: 'YSSY',
    simulator: 'xplane',
  });
  const normalized = normalizeDocument({
    ...document,
    objects: [
      {
        id: 'BARS_MISSING',
        status: 'unmatched',
        coordinates: [
          [151.1, -33.9],
          [151.11, -33.91],
        ],
      },
      {
        id: 'BARS_MANUAL',
        status: 'manual',
        coordinates: [
          [151.2, -33.9],
          [151.21, -33.91],
        ],
      },
    ],
  });

  assert.deepEqual(
    normalized.objects.map((object) => object.id),
    ['BARS_MANUAL']
  );
});

test('normalizes original division points for older cached editor drafts', () => {
  const divisions = originalDivisionsFromPoints([
    {
      id: 'BARS_LINE',
      name: 'Taxiway A',
      coordinates: [
        { lng: 151.1, lat: -33.9 },
        { lng: 151.11, lat: -33.91 },
      ],
    },
    {
      id: 'BARS_POINT',
      coordinates: { lng: 151.2, lat: -33.8 },
    },
  ]);

  assert.deepEqual(divisions, [
    {
      id: 'BARS_LINE',
      name: 'Taxiway A',
      type: 'unknown',
      geometry: {
        type: 'LineString',
        coordinates: [
          [151.1, -33.9],
          [151.11, -33.91],
        ],
      },
    },
    {
      id: 'BARS_POINT',
      name: 'BARS_POINT',
      type: 'unknown',
      geometry: { type: 'Point', coordinates: [151.2, -33.8] },
    },
  ]);
});

test('marks unlinked division lines as quick-add candidates', () => {
  const [ghost] = originalDivisionsToGeojson({
    icao: 'YPPH',
    simulator: 'msfs',
    objects: [],
    originalDivisions: [
      {
        id: 'BARS_MISSING',
        name: 'Missing object',
        type: 'lead_on',
        geometry: {
          type: 'LineString',
          coordinates: [
            [115.96, -31.94],
            [115.97, -31.95],
          ],
        },
      },
    ],
  }).features;

  assert.equal(ghost.properties.matched, false);
  assert.equal(ghost.properties.quickAddable, true);
});

test('keeps the first BARS ID for exact duplicate division points', () => {
  const common = {
    type: 'lead_on',
    coordinates: [
      { lng: 151.1, lat: -33.9 },
      { lng: 151.11, lat: -33.91 },
    ],
    directionality: 'bidirectional',
    color: 'green',
    elevated: false,
    ihp: true,
  };

  const divisions = originalDivisionsFromPoints([
    { ...common, id: 'BARS_FIRST', name: 'First name' },
    {
      ...common,
      id: 'BARS_DUPLICATE',
      name: 'Different name',
      coordinates: [...common.coordinates].reverse(),
    },
  ]);

  assert.deepEqual(
    divisions.map((division) => division.id),
    ['BARS_FIRST']
  );
});

test('keeps reversed uni-directional Division objects distinct', () => {
  const coordinates = [
    { lng: 151.1, lat: -33.9 },
    { lng: 151.11, lat: -33.91 },
  ];
  const common = {
    type: 'taxiway',
    directionality: 'uni-directional',
    elevated: false,
    ihp: false,
  };

  const divisions = originalDivisionsFromPoints([
    { ...common, id: 'BARS_FORWARD', coordinates },
    { ...common, id: 'BARS_REVERSE', coordinates: [...coordinates].reverse() },
  ]);

  assert.deepEqual(
    divisions.map((division) => division.id),
    ['BARS_FORWARD', 'BARS_REVERSE']
  );
});

test('ranks BARS ID suggestions by ID before division name', () => {
  const divisions = [
    { id: 'BARS_ALPHA', name: 'Taxiway Bravo' },
    { id: 'BARS_BRAVO', name: 'Taxiway Alpha' },
    { id: 'BARS_CHARLIE', name: 'Remote stand' },
  ];

  assert.deepEqual(barsIdSuggestions(divisions, 'alpha'), [
    { id: 'BARS_ALPHA', name: 'Taxiway Bravo' },
    { id: 'BARS_BRAVO', name: 'Taxiway Alpha' },
  ]);
});

test('blank BARS ID suggestions prioritize nearby unrepresented divisions', () => {
  const divisions = [
    { id: 'BARS_USED', name: 'Used', geometry: { type: 'Point', coordinates: [115, -32] } },
    { id: 'BARS_FAR', name: 'Far', geometry: { type: 'Point', coordinates: [116, -32] } },
    { id: 'BARS_NEAR', name: 'Near', geometry: { type: 'Point', coordinates: [115.001, -32] } },
  ];

  assert.deepEqual(
    barsIdSuggestions(divisions, '', 6, {
      coordinate: [115, -32],
      excludeIds: ['BARS_USED'],
    }),
    [
      { id: 'BARS_NEAR', name: 'Near' },
      { id: 'BARS_FAR', name: 'Far' },
    ]
  );
});

test('derives a stable unique colour from the current BARS ID', () => {
  assert.equal(colorForObjectId('BARS_ALPHA'), colorForObjectId('BARS_ALPHA'));
  assert.notEqual(colorForObjectId('BARS_ALPHA'), colorForObjectId('BARS_BRAVO'));
});

test('normalizes every part with the same BARS ID to the same colour', () => {
  const normalized = normalizeDocument({
    icao: 'YSSY',
    simulator: 'msfs',
    objects: [
      {
        id: 'BARS_SHARED',
        color: '#ff0000',
        coordinates: [
          [151, -33],
          [151.001, -33],
        ],
      },
      {
        id: 'BARS_SHARED',
        color: '#00ff00',
        coordinates: [
          [151, -33.01],
          [151.001, -33.01],
        ],
      },
    ],
  });

  assert.equal(normalized.objects[0].color, colorForObjectId('BARS_SHARED'));
  assert.equal(normalized.objects[0].color, normalized.objects[1].color);
});

test('projects adjacency-aware colors into editor map features', () => {
  const document = {
    icao: 'EGLL',
    simulator: 'msfs',
    objects: [
      {
        id: 'BARS_NEARBY',
        partId: 'BARS_NEARBY:part:1',
        coordinates: [[-0.45, 51.47]],
        color: '#000000',
      },
    ],
  };

  const [feature] = editorDocumentToGeojson(document, {
    objectColors: new Map([['BARS_NEARBY', '#ffd400']]),
  }).features;

  assert.equal(feature.properties.color, '#ffd400');
});

test('keeps a renamed object and its linked division ghost the same colour', () => {
  const document = {
    icao: 'YSSY',
    simulator: 'xplane',
    objects: [
      {
        id: 'BARS_RENAMED',
        partId: 'BARS_ORIGINAL:part:1',
        groupId: 'division:BARS_ORIGINAL',
        name: 'Renamed object',
        type: 'taxiway',
        status: 'matched',
        coordinates: [
          [151.1, -33.9],
          [151.11, -33.91],
        ],
        color: colorForObjectId('BARS_RENAMED'),
        sourceBindings: [{ sourceId: 'source-line' }],
      },
    ],
    originalDivisions: [
      {
        id: 'BARS_ORIGINAL',
        name: 'Original division',
        geometry: {
          type: 'LineString',
          coordinates: [
            [151.1, -33.9],
            [151.11, -33.91],
          ],
        },
      },
    ],
  };

  const uniqueColor = '#00cde8';
  const [ghost] = originalDivisionsToGeojson(document, {
    objectColors: new Map([['BARS_RENAMED', uniqueColor]]),
  }).features;

  assert.equal(ghost.properties.color, uniqueColor);
  assert.equal(ghost.properties.matched, true);
  assert.equal(ghost.properties.quickAddable, true);
});
