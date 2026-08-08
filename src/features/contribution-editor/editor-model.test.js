import assert from 'node:assert/strict';
import test from 'node:test';
import {
  barsIdSuggestions,
  colorForObjectId,
  createEditorDocument,
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
      geometry: { type: 'Point', coordinates: [151.2, -33.8] },
    },
  ]);
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

test('derives a stable unique colour from the current BARS ID', () => {
  assert.equal(colorForObjectId('BARS_ALPHA'), colorForObjectId('BARS_ALPHA'));
  assert.notEqual(colorForObjectId('BARS_ALPHA'), colorForObjectId('BARS_BRAVO'));
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

  const [ghost] = originalDivisionsToGeojson(document).features;

  assert.equal(ghost.properties.color, colorForObjectId('BARS_RENAMED'));
});
