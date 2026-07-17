import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftOutput } from './draft-output.js';
import { matchDivisionObjects, scorePolylineMatch } from './matching.js';
import {
  buildHoldShortTopologyRows,
  filterHoldShortTopologyRows,
} from './extractor/bgl.js';
import { pointInPolygon } from './extractor/geo.js';

const LATITUDE = -31.94;
const METERS_PER_LONGITUDE = 111_320 * Math.cos((LATITUDE * Math.PI) / 180);

test('matches a roughly aligned source row with the required division classification', () => {
  const division = divisionLine('stop-a', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulator = simulatorLine('sim-stop', 'stopbar', [point(1, 3), point(21, 3)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'sim-stop');
  assert.equal(result.unmatched.length, 0);
});

test('joins connected stopbar fragments to match one cornered BARS stopbar', () => {
  const division = divisionLine('cornered-stopbar', 'stopbar', [
    point(0, 0),
    point(22, 0),
    point(42, 20),
  ]);
  const rows = [
    inferredPlacementLine('stopbar-west', 'stopbar', [point(0, 1), point(18, 1)]),
    inferredPlacementLine('stopbar-east', 'stopbar', [point(22, 1), point(42, 21)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const output = buildDraftOutput(
    { instances: [], lightRows: rows, mustKeepZones: [] },
    result,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((match) => match.row.id).sort(),
    ['stopbar-east', 'stopbar-west']
  );
  assert.ok(
    result.matches.every(
      (match) => match.replacementRow.sourceType === 'connected-simulator-stopbar-rows'
    )
  );
  assert.equal(output.replacements.length, 1);
  assert.equal(output.unmatched.length, 0);
});

test('does not join separated stopbar rows into invented geometry', () => {
  const division = divisionLine('separated-stopbar', 'stopbar', [
    point(0, 0),
    point(22, 0),
    point(55, 20),
  ]);
  const rows = [
    inferredPlacementLine('stopbar-west', 'stopbar', [point(0, 1), point(18, 1)]),
    inferredPlacementLine('stopbar-east', 'stopbar', [point(35, 1), point(55, 21)]),
  ];

  const result = matchDivisionObjects([division], rows);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('uses a decoded hold-short point only as a no-removal stopbar fallback', () => {
  const west = graphPoint(0, point(-40, 0), 0x01);
  const hold = graphPoint(1, point(0, 0), 0x05);
  const east = graphPoint(2, point(40, 0), 0x01);
  const graph = {
    pointTableOffset: 128,
    points: [west, hold, east],
    paths: [
      graphPath(0, west, hold, 20),
      graphPath(1, hold, east, 20),
    ],
  };
  const topologyRows = buildHoldShortTopologyRows('airport.bgl', graph);
  const division = divisionLine('hold-fallback', 'stopbar', [
    point(2, -10),
    point(2, 10),
  ]);

  assert.equal(topologyRows.length, 1);
  assert.equal(topologyRows[0].noRemovalRequired, true);
  assert.equal(topologyRows[0].sourceType, 'bgl-hold-short-topology');

  const matching = matchDivisionObjects([division], [], [], topologyRows);
  assert.equal(matching.matches.length, 1);
  assert.equal(matching.matches[0].row.noRemovalRequired, true);

  const output = buildDraftOutput(
    { instances: [], lightRows: [], topologyRows, mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );
  const matchedFeature = output.geojson.features.find(
    (feature) => feature.properties.featureType === 'matched'
  );
  assert.equal(output.removals.length, 0);
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.removalApproved.length, 1);
  assert.equal(matchedFeature.properties.matchedViaHoldShort, true);
  assert.match(output.xml, /displayName="hold-fallback"/);
});

test('suppresses a decoded hold-short fallback near real stopbar lighting', () => {
  const topologyRow = {
    ...simulatorLine('hold-topology', 'stopbar', [point(0, -10), point(0, 10)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
    holdShortPoint: { lat: point(0, 0).lat, lon: point(0, 0).lng },
  };
  const realStopbar = simulatorLine('real-stopbar', 'stopbar', [
    point(-10, 3),
    point(10, 3),
  ]);

  assert.deepEqual(
    filterHoldShortTopologyRows([topologyRow], [realStopbar], []),
    []
  );
});

test('does not add a hold-short fallback when a real row matches the same stopbar', () => {
  const division = divisionLine('stop-with-real-row', 'stopbar', [point(0, 0), point(20, 0)]);
  const realRow = simulatorLine('real-stopbar-row', 'stopbar', [point(0, 1), point(20, 1)]);
  const topologyRow = {
    ...simulatorLine('offset-hold-topology', 'stopbar', [point(25, 0), point(45, 0)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };

  const result = matchDivisionObjects([division], [realRow], [], [topologyRow]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'real-stopbar-row');
  assert.equal(result.matches[0].row.noRemovalRequired, undefined);
});

test('does not add a hold-short fallback when real stopbar instances match the division', () => {
  const division = divisionLine('stop-with-real-instances', 'stopbar', [
    point(0, 0),
    point(20, 0),
  ]);
  const instances = [0, 5, 10, 15, 20].map((x, index) =>
    simulatorInstance(`real-stop-${index}`, 'stopbar', point(x, 2))
  );
  const topologyRow = {
    ...simulatorLine('offset-hold-topology', 'stopbar', [point(25, 0), point(45, 0)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };

  const result = matchDivisionObjects([division], [], instances, [topologyRow]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.sourceType, 'division-guided-source-instances');
});

test('selects only the best hold-short fallback for one BARS stopbar', () => {
  const division = divisionLine('one-stopbar', 'stopbar', [point(0, 0), point(20, 0)]);
  const bestTopologyRow = {
    ...simulatorLine('best-hold-topology', 'stopbar', [point(0, 1), point(20, 1)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };
  const weakerTopologyRow = {
    ...simulatorLine('weaker-hold-topology', 'stopbar', [point(25, 0), point(45, 0)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };

  const result = matchDivisionObjects(
    [division],
    [],
    [],
    [weakerTopologyRow, bestTopologyRow]
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'best-hold-topology');
});

test('matches an exact-placement inferred row before falling back to loose instances', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(40, 0)]);
  const inferredRow = {
    ...simulatorLine('placement-row', 'taxi-centerline', [point(0, 1), point(40, 1)]),
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds: ['green-0', 'green-1', 'green-2'],
  };
  const instances = [0, 20, 40].map((x, index) =>
    simulatorInstance(`green-${index}`, 'taxi-centerline', point(x, 1))
  );

  const result = matchDivisionObjects([division], [inferredRow], instances);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'placement-row');
  assert.equal(result.matches[0].row.sourceType, 'inferred-bgl-placement-row');
  assert.equal(result.unmatched.length, 0);
});

test('locally registers a coherent exact-placement row when map geometry is offset', () => {
  const division = divisionLine('lead-offset', 'lead_on', [point(0, 0), point(40, 0)]);
  const inferredRow = {
    ...simulatorLine('placement-offset', 'taxi-centerline', [point(0, 35), point(40, 35)]),
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds: ['offset-0', 'offset-1'],
  };

  const result = matchDivisionObjects([division], [inferredRow]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'placement-offset');
  assert.equal(result.matches[0].metrics.alignmentMode, 'local-registration');
  assert.ok(result.matches[0].metrics.registrationDisplacement > 30);
});

test('does not rebuild a rejected inferred row from its loose placement points', () => {
  const division = divisionLine('lead-straight', 'lead_on', [point(0, 0), point(40, 0)]);
  const coordinates = [point(0, 1), point(20, 30), point(40, 1)];
  const inferredRow = {
    ...simulatorLine('placement-zigzag', 'taxi-centerline', coordinates),
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds: ['zig-0', 'zig-1', 'zig-2'],
  };
  const instances = coordinates.map((coordinate, index) =>
    simulatorInstance(`zig-${index}`, 'taxi-centerline', coordinate)
  );

  const result = matchDivisionObjects([division], [inferredRow], instances);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('will not match a nearby row of the wrong simulator class', () => {
  const division = divisionLine('stop-a', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulator = simulatorLine('sim-taxi', 'taxi-centerline', [point(0, 0), point(20, 0)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('uses one simulator row only once and assigns it to the better aligned object', () => {
  const division = [
    divisionLine('lead-best', 'lead_on', [point(0, 0), point(30, 0)]),
    divisionLine('lead-offset', 'lead_on', [point(0, 7), point(30, 7)]),
  ];
  const simulator = simulatorLine('sim-lead', 'lead-on', [point(0, 1), point(30, 1)]);

  const result = matchDivisionObjects(division, [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].division.id, 'lead-best');
  assert.equal(result.unmatched.length, 1);
});

test('selects co-located simulator lead-on layers but writes one replacement', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(30, 0)]);
  const rows = [
    simulatorLine('sim-low', 'lead-on', [point(0, 0.2), point(30, 0.2)], 0.7),
    simulatorLine('sim-high', 'lead-on', [point(0, 0), point(30, 0)], 0.95),
  ];

  const result = matchDivisionObjects([division], rows);
  const output = buildDraftOutput(
    { instances: [], lightRows: rows, mustKeepZones: [] },
    result,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((match) => match.row.id).sort(),
    ['sim-high', 'sim-low']
  );
  assert.equal(output.matched.length, 2);
  assert.equal(output.replacements.length, 1);
  const matchedFeature = output.geojson.features.find(
    (feature) => feature.properties.featureType === 'matched'
  );
  assert.equal(matchedFeature.properties.divisionId, 'lead-a');
  assert.match(matchedFeature.properties.debugColor, /^#[\da-f]{6}$/);
  assert.deepEqual(result.duplicateSimulatorLeadOns, ['sim-low']);
  assert.equal(result.mergedSimulatorRows.length, 1);
  assert.deepEqual(result.mergedSimulatorRows[0].sourceRowIds, ['sim-high', 'sim-low']);
  assert.deepEqual(result.mergedSimulatorRows[0].vertices, rows[1].vertices);
  assert.equal(
    output.simulatorGeojson.features.filter(
      (feature) => feature.properties.featureType === 'simulator-source'
    )
      .length,
    2
  );
  assert.equal(
    output.simulatorGeojson.features.filter(
      (feature) => feature.properties.featureType === 'simulator-merged'
    )
      .length,
    1
  );
});

test('uses varied high-contrast colors for nearby BARS IDs', () => {
  const divisions = Array.from({ length: 8 }, (_, index) =>
    divisionLine(`nearby-${index}`, 'taxiway', [
      point(index * 3, 0),
      point(index * 3 + 2, 0),
    ])
  );
  const output = buildDraftOutput(
    { instances: [], lightRows: [], mustKeepZones: [] },
    {
      matches: [],
      unmatched: divisions.map((division) => ({ division, reason: 'Test object' })),
      mergedSimulatorRows: [],
      duplicateDivisionLeadOns: [],
      duplicateSimulatorLeadOns: [],
    },
    { icao: 'TEST', altitude: 0 }
  );
  const colors = output.geojson.features
    .filter((feature) => feature.properties.featureType === 'unmatched')
    .map((feature) => feature.properties.debugColor);

  assert.ok(new Set(colors).size >= 6);
  for (let index = 1; index < colors.length; index += 1) {
    assert.ok(hexColorDistance(colors[index], colors[index - 1]) >= 100);
  }
});

function hexColorDistance(left, right) {
  const channels = (color) => [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  const leftChannels = channels(left);
  const rightChannels = channels(right);
  return Math.hypot(...leftChannels.map((channel, index) => channel - rightChannels[index]));
}

test('merges co-located simulator geometry before splitting it across division objects', () => {
  const division = [
    divisionLine('taxi-west', 'taxiway', [point(5, 0), point(45, 0)]),
    divisionLine('taxi-east', 'taxiway', [point(55, 0), point(95, 0)]),
  ];
  const rows = [
    simulatorLine('sim-green', 'taxi-centerline', [point(0, -0.1), point(100, -0.1)]),
    simulatorLine('sim-orange', 'lead-on', [point(100, 0.1), point(0, 0.1)]),
  ];

  const result = matchDivisionObjects(division, rows);

  assert.equal(result.mergedSimulatorRows.length, 1);
  assert.equal(result.matches.length, 4);
  assert.equal(result.unmatched.length, 0);
  assert.deepEqual(
    [...new Set(result.matches.map((match) => match.row.sourceParentRowId))].sort(),
    ['sim-green', 'sim-orange']
  );
  assert.ok(result.matches.every((match) => match.replacementRow.sourceGeometryDerived === 'source-row-subsection'));
  assert.equal(new Set(result.matches.map((match) => match.simulatorGroupId)).size, 1);
});

test('does not merge nearby simulator rows that are not directly co-located', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(40, 0)]);
  const rows = [
    simulatorLine('sim-a', 'lead-on', [point(0, 0), point(40, 0)]),
    simulatorLine('sim-b', 'lead-on', [point(0, 0.8), point(40, 0.8)]),
  ];

  const result = matchDivisionObjects([division], rows);

  assert.equal(result.mergedSimulatorRows.length, 0);
  assert.equal(result.duplicateSimulatorLeadOns.length, 0);
});

test('collapses overlapping division lead-ons instead of flagging the duplicate as missing', () => {
  const division = [
    divisionLine('lead-a', 'lead_on', [point(0, 0), point(30, 0)]),
    divisionLine('lead-b', 'lead_on', [point(0, 0.2), point(30, 0.2)]),
  ];
  const simulator = simulatorLine('sim-lead', 'lead-on', [point(0, 0), point(30, 0)]);

  const result = matchDivisionObjects(division, [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.duplicateDivisionLeadOns.length, 1);
});

test('rejects a similar-shaped row that is too far away', () => {
  const division = divisionLine('taxi-a', 'taxiway', [point(0, 0), point(40, 0)]);
  const simulator = simulatorLine('sim-taxi', 'taxi-centerline', [point(0, 80), point(40, 80)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.match(result.unmatched[0].reason, /suitably aligned/i);
});

test('shape scoring is direction-independent', () => {
  const division = divisionLine('stop-a', 'stopbar', [point(0, 0), point(25, 0)]);
  const simulator = simulatorLine('sim-stop', 'stopbar', [point(25, 2), point(0, 2)]);

  const metrics = scorePolylineMatch(division, simulator);

  assert.equal(metrics.valid, true);
  assert.ok(metrics.score > 0.6);
});

test('builds a match from source-backed stopbar instances when no row exists', () => {
  const division = divisionLine('stop-a', 'stopbar', [point(0, 0), point(20, 0)]);
  const instances = [0, 5, 10, 15, 20].map((x, index) =>
    simulatorInstance(`red-${index}`, 'stopbar', point(x, 2))
  );

  const result = matchDivisionObjects([division], [], instances);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.sourceType, 'division-guided-source-instances');
  assert.deepEqual(
    result.matches[0].row.sourceInstanceIds,
    instances.map((item) => item.id)
  );
  assert.equal(result.matches[0].row.vertices.length, 5);
});

test('uses division lead-on classification to select real taxi-centreline instances', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(30, 0)]);
  const instances = [0, 6, 12, 18, 24, 30].map((x, index) =>
    simulatorInstance(`green-${index}`, 'taxi-centerline', point(x, 1.5))
  );

  const result = matchDivisionObjects([division], [], instances);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.classification, 'lead-on');
  assert.equal(result.unmatched.length, 0);
});

test('accepts a shorter source row contained by a longer division shape', () => {
  const division = divisionLine('lead-long', 'lead_on', [point(0, 0), point(100, 0)]);
  const simulator = simulatorLine('sim-contained', 'lead-on', [point(25, 1), point(65, 1)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].metrics.alignmentMode, 'source-contained');
  assert.equal(result.matches[0].row.id, 'sim-contained');
  assert.equal(result.unmatched.length, 0);
});

test('keeps one coherent projection run when alignment drifts across the old tight cutoff', () => {
  const division = divisionLine('taxi-offset-drift', 'taxiway', [
    point(50, 2.3),
    point(150, 3.1),
  ]);
  const simulator = simulatorLine('sim-long', 'taxi-centerline', [
    point(0, 0),
    point(200, 0),
  ]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.matches[0].row.sourceParentRowId, 'sim-long');
  assert.ok(result.matches[0].row.sourceRangeEndMeters - result.matches[0].row.sourceRangeStartMeters > 95);
});

test('rejects a tiny aligned subsection that does not represent enough of the BARS shape', () => {
  const division = divisionLine('lead-long', 'lead_on', [point(0, 0), point(100, 0)]);
  const simulator = simulatorLine('sim-too-short', 'lead-on', [point(35, 1), point(65, 1)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('uses division data to classify a compatible taxi-centreline row as a lead-on', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(60, 0)]);
  const simulator = simulatorLine('sim-taxi', 'taxi-centerline', [point(10, 1), point(50, 1)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.classification, 'taxi-centerline');
  assert.equal(result.matches[0].row.outputClassification, 'lead-on');
  assert.equal(result.matches[0].row.sourceClassification, 'taxi-centerline');
  assert.equal(result.matches[0].row.classificationBasis, 'division-data');
});

test('assigns every compatible source row once when one division owns several source segments', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(100, 0)]);
  const rows = [
    simulatorLine('sim-west', 'taxi-centerline', [point(5, 1), point(45, 1)]),
    simulatorLine('sim-east', 'lead-on', [point(55, 1), point(95, 1)]),
  ];

  const result = matchDivisionObjects([division], rows);

  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map((match) => match.row.id).sort(),
    ['sim-east', 'sim-west']
  );
  assert.ok(result.matches.every((match) => match.division.id === 'lead-a'));
  assert.ok(result.matches.every((match) => match.row.outputClassification === 'lead-on'));
  assert.equal(result.unmatched.length, 0);
});

test('removes co-located source layers together but writes one replacement shape', () => {
  const division = divisionLine('lead-a', 'lead_on', [point(0, 0), point(60, 0)]);
  const rows = [
    simulatorLine('sim-green', 'taxi-centerline', [point(5, 1), point(55, 1)]),
    simulatorLine('sim-orange', 'lead-on', [point(10, 1.2), point(50, 1.2)]),
  ];
  const matching = matchDivisionObjects([division], rows);

  const output = buildDraftOutput(
    { instances: [], lightRows: rows, mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(matching.matches.length, 2);
  assert.equal(output.matched.length, 2);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.unmatched.length, 0);
  assert.equal((output.xml.match(/displayName="lead-a"/g) ?? []).length, 1);
});

test('does not reuse source instances across overlapping division objects', () => {
  const division = [
    divisionLine('lead-best', 'lead_on', [point(0, 0), point(30, 0)]),
    divisionLine('taxi-offset', 'taxiway', [point(0, 5), point(30, 5)]),
  ];
  const instances = [0, 6, 12, 18, 24, 30].map((x, index) =>
    simulatorInstance(`green-${index}`, 'taxi-centerline', point(x, 1))
  );

  const result = matchDivisionObjects(division, [], instances);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].division.id, 'lead-best');
  assert.equal(result.unmatched.length, 1);
});

test('partitions a taxiway row continuously between adjacent division objects', () => {
  const division = [
    divisionLine('taxi-west', 'taxiway', [point(5, 0), point(45, 0)]),
    divisionLine('taxi-east', 'taxiway', [point(55, 0), point(95, 0)]),
  ];
  const simulator = simulatorLine('sim-long', 'taxi-centerline', [point(0, 1), point(100, 1)]);

  const result = matchDivisionObjects(division, [simulator]);

  assert.equal(result.matches.length, 2);
  assert.equal(result.unmatched.length, 0);
  assert.ok(result.matches.every((match) => match.row.sourceParentRowId === 'sim-long'));
  const ranges = result.matches
    .map((match) => [match.row.sourceRangeStartMeters, match.row.sourceRangeEndMeters])
    .sort((left, right) => left[0] - right[0]);
  assert.equal(ranges[0][0], 0);
  assert.ok(Math.abs(ranges[0][1] - ranges[1][0]) < 0.001);
  assert.ok(Math.abs(ranges[1][1] - 100) < 0.01);
});

test('uses the complete native lead-on row when the division display shape is shortened', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]);
  const simulator = simulatorLine('sim-full', 'lead-on', [point(0, 1), point(100, 1)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'sim-full');
  assert.equal(result.matches[0].row.sourceParentRowId, undefined);
  assert.deepEqual(result.matches[0].replacementRow.vertices, simulator.vertices);
});

test('smooths only reconstructed replacement geometry and preserves the exact removal row', () => {
  const division = divisionLine('lead-smooth', 'lead_on', [point(0, 0), point(60, 0)]);
  const simulator = inferredPlacementLine('sim-jagged', 'taxi-centerline', [
    point(0, 0),
    point(10, 0.25),
    point(20, -0.2),
    point(30, 0.3),
    point(40, -0.25),
    point(50, 0.2),
    point(60, 0),
  ]);

  const result = matchDivisionObjects([division], [simulator]);
  const match = result.matches[0];

  assert.ok(match);
  assert.deepEqual(match.row.vertices, simulator.vertices);
  assert.ok(match.replacementRow.vertices.length < simulator.vertices.length);
  assert.deepEqual(match.replacementRow.vertices[0], simulator.vertices[0]);
  assert.deepEqual(match.replacementRow.vertices.at(-1), simulator.vertices.at(-1));
  assert.equal(
    match.replacementRow.replacementGeometryDerived,
    'constrained-source-row-simplification'
  );
});

test('stops outward guidance extension at a simulator stopbar crossing', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]);
  const rows = [
    inferredPlacementLine('sim-full', 'lead-on', [point(0, 1), point(100, 1)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(75, -10), point(75, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.sourceParentRowId, 'sim-full');
  assert.ok(Math.abs(result.matches[0].row.sourceRangeStartMeters) < 0.01);
  assert.ok(Math.abs(result.matches[0].row.sourceRangeEndMeters - 75) < 0.2);
});

test('does not cut a guidance row at an unselected hold-short fallback', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]);
  const guidance = inferredPlacementLine('sim-full', 'taxi-centerline', [
    point(0, 1),
    point(100, 1),
  ]);
  const unusedHoldShort = {
    ...simulatorLine('unused-hold-short', 'stopbar', [point(75, -10), point(75, 10)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };

  const result = matchDivisionObjects([division], [guidance], [], [unusedHoldShort]);
  const leadOn = result.matches[0];

  assert.ok(leadOn);
  assert.equal(leadOn.row.id, 'sim-full');
  assert.equal(leadOn.row.sourceParentRowId, undefined);
  assert.deepEqual(leadOn.row.vertices, guidance.vertices);
});

test('cuts a guidance row when the hold-short fallback is selected for a BARS stopbar', () => {
  const divisions = [
    divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]),
    divisionLine('selected-stopbar', 'stopbar', [point(75, -10), point(75, 10)]),
  ];
  const guidance = inferredPlacementLine('sim-full', 'taxi-centerline', [
    point(0, 1),
    point(100, 1),
  ]);
  const selectedHoldShort = {
    ...simulatorLine('selected-hold-short', 'stopbar', [point(75, -10), point(75, 10)]),
    sourceType: 'bgl-hold-short-topology',
    topologyOnly: true,
    noRemovalRequired: true,
  };

  const result = matchDivisionObjects(divisions, [guidance], [], [selectedHoldShort]);
  const leadOn = result.matches.find((match) => match.division.id === 'lead-short');
  const stopbar = result.matches.find((match) => match.division.id === 'selected-stopbar');

  assert.ok(leadOn);
  assert.ok(stopbar);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 75) < 0.2);
  assert.equal(stopbar.row.sourceType, 'bgl-hold-short-topology');
});

test('uses local row orientation to detect a stopbar on a long curved guidance row', () => {
  const division = divisionLine('lead-curved', 'lead_on', [point(25, 0), point(55, 0)]);
  const rows = [
    inferredPlacementLine('sim-curved', 'taxi-centerline', [
      point(0, 1),
      point(100, 1),
      point(100, 350),
    ]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(75, -10), point(75, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const match = result.matches.find((item) => item.row.sourceParentRowId === 'sim-curved');

  assert.ok(match);
  assert.ok(Math.abs(match.row.sourceRangeStartMeters) < 0.01);
  assert.ok(Math.abs(match.row.sourceRangeEndMeters - 75) < 0.2);
});

test('extends away from a stopbar to the real row endpoint through an unrelated junction', () => {
  const division = divisionLine('lead-before-stopbar', 'lead_on', [
    point(100, 0),
    point(330, 0),
  ]);
  const rows = [
    inferredPlacementLine('sim-full', 'taxi-centerline', [point(0, 1), point(400, 1)]),
    inferredPlacementLine('sim-branch', 'taxi-centerline', [point(80, 1), point(80, 40)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(300, -10), point(300, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const match = result.matches.find((item) => item.row.sourceParentRowId === 'sim-full');

  assert.ok(match);
  assert.ok(Math.abs(match.row.sourceRangeStartMeters) < 0.01);
  assert.ok(Math.abs(match.row.sourceRangeEndMeters - 300) < 0.2);
});

test('stops outward guidance extension at a reconstructed row junction', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]);
  const rows = [
    inferredPlacementLine('sim-full', 'lead-on', [point(0, 1), point(100, 1)]),
    inferredPlacementLine('sim-branch', 'taxi-centerline', [point(70, 1), point(70, 30)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const match = result.matches.find((item) => item.row.sourceParentRowId === 'sim-full');

  assert.ok(match);
  assert.ok(Math.abs(match.row.sourceRangeEndMeters - 70) < 0.2);
});

test('extends a reconstructed taxi-centreline lead-on from its stopbar to its natural end', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(25, 0), point(55, 0)]);
  const rows = [
    inferredPlacementLine('sim-full', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(15, -10), point(15, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const match = result.matches.find((item) => item.row.sourceParentRowId === 'sim-full');

  assert.ok(match);
  assert.ok(Math.abs(match.row.sourceRangeStartMeters - 15) < 0.2);
  assert.ok(Math.abs(match.row.sourceRangeEndMeters - 100) < 0.2);
});

test('extends a lead-on that shares a reconstructed row with a taxiway owner', () => {
  const division = [
    divisionLine('taxi-before-stopbar', 'taxiway', [point(5, 0), point(45, 0)]),
    divisionLine('lead-after-stopbar', 'lead_on', [point(65, 0), point(85, 0)]),
  ];
  const rows = [
    inferredPlacementLine('sim-shared', 'taxi-centerline', [point(0, 1), point(400, 1)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(55, -10), point(55, 10)]),
  ];

  const result = matchDivisionObjects(division, rows);
  const leadOn = result.matches.find((item) => item.division.id === 'lead-after-stopbar');

  assert.ok(leadOn);
  assert.equal(leadOn.row.sourceParentRowId, 'sim-shared');
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 55) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 400) < 0.2);
});

test('keeps a reconstructed lead-on inside consecutive simulator stopbars', () => {
  const division = divisionLine('lead-between-stopbars', 'lead_on', [point(65, 0), point(85, 0)]);
  const rows = [
    inferredPlacementLine('sim-shared', 'taxi-centerline', [point(0, 1), point(400, 1)]),
    inferredPlacementLine('sim-stopbar-west', 'stopbar', [point(55, -10), point(55, 10)]),
    inferredPlacementLine('sim-stopbar-east', 'stopbar', [point(250, -10), point(250, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const leadOn = result.matches[0];

  assert.ok(leadOn);
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 55) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 250) < 0.2);
});

test('cuts an already matched guidance section at an interior simulator stopbar', () => {
  const division = divisionLine('lead-crossing-stopbar', 'lead_on', [point(55, 0), point(85, 0)]);
  const rows = [
    inferredPlacementLine('sim-guidance', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(60, -10), point(60, 10)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const leadOn = result.matches[0];

  assert.ok(leadOn);
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 60) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 100) < 0.2);
});

test('does not claim a distant airport-wide row endpoint without a local boundary', () => {
  const division = divisionLine('lead-local', 'lead_on', [point(250, 0), point(300, 0)]);
  const row = inferredPlacementLine('sim-airport-wide', 'taxi-centerline', [
    point(0, 1),
    point(600, 1),
  ]);

  const result = matchDivisionObjects([division], [row]);
  const match = result.matches[0];

  assert.ok(match);
  assert.equal(match.row.sourceParentRowId, 'sim-airport-wide');
  assert.ok(match.row.sourceRangeStartMeters > 240);
  assert.ok(match.row.sourceRangeEndMeters < 310);
});

test('accepts a translated reconstructed stopbar with a simplified angular difference', () => {
  const division = divisionLine('stop-offset', 'stopbar', [point(0, 0), point(25, 0)]);
  const angle = (25 * Math.PI) / 180;
  const halfX = Math.cos(angle) * 12.5;
  const halfY = Math.sin(angle) * 12.5;
  const row = inferredPlacementLine('sim-stop-offset', 'stopbar', [
    point(12.5 - halfX, 15 - halfY),
    point(12.5 + halfX, 15 + halfY),
  ]);

  const result = matchDivisionObjects([division], [row]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].metrics.alignmentMode, 'local-registration');
  assert.ok(result.matches[0].metrics.registrationAngleDifference >= 24);
});

test('uses the complete compact taxiway row instead of trimming its endpoints', () => {
  const division = divisionLine('taxi-short', 'taxiway', [point(3, 0), point(53, 0)]);
  const simulator = simulatorLine('sim-taxi-full', 'taxi-centerline', [point(0, 1), point(56, 1)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'sim-taxi-full');
  assert.equal(result.matches[0].row.sourceParentRowId, undefined);
});

test('partitions one complete native lead-on row between adjacent BARS objects', () => {
  const division = [
    divisionLine('lead-west', 'lead_on', [point(10, 0), point(40, 0)]),
    divisionLine('lead-east', 'lead_on', [point(60, 0), point(90, 0)]),
  ];
  const simulator = simulatorLine('sim-full', 'lead-on', [point(0, 1), point(100, 1)]);

  const result = matchDivisionObjects(division, [simulator]);
  const ranges = result.matches
    .map((match) => [match.row.sourceRangeStartMeters, match.row.sourceRangeEndMeters])
    .sort((left, right) => left[0] - right[0]);

  assert.equal(result.matches.length, 2);
  assert.equal(result.unmatched.length, 0);
  assert.equal(ranges[0][0], 0);
  assert.ok(Math.abs(ranges[0][1] - ranges[1][0]) < 0.001);
  assert.ok(Math.abs(ranges[1][1] - 100) < 0.01);
});

test('snaps an ownership hand-off to a nearby simulator stopbar crossing', () => {
  const division = [
    divisionLine('lead-west', 'lead_on', [point(10, 0), point(40, 0)]),
    divisionLine('lead-east', 'lead_on', [point(60, 0), point(90, 0)]),
  ];
  const rows = [
    inferredPlacementLine('sim-full', 'lead-on', [point(0, 1), point(100, 1)]),
    inferredPlacementLine('sim-stopbar', 'stopbar', [point(55, -10), point(55, 10)]),
  ];

  const result = matchDivisionObjects(division, rows);
  const ranges = result.matches
    .map((match) => [match.row.sourceRangeStartMeters, match.row.sourceRangeEndMeters])
    .sort((left, right) => left[0] - right[0]);

  assert.equal(ranges.length, 2);
  assert.ok(Math.abs(ranges[0][1] - 55) < 0.2);
  assert.ok(Math.abs(ranges[1][0] - 55) < 0.2);
});

test('does not let a weak gap-filler steal a contested source row from stronger owners', () => {
  const division = [
    divisionLine('lead-west', 'lead_on', [point(5, 0), point(40, 0)]),
    divisionLine('lead-weak', 'lead_on', [point(42, 8), point(58, 8)]),
    divisionLine('lead-east', 'lead_on', [point(60, 0), point(95, 0)]),
  ];
  const simulator = simulatorLine('sim-shared', 'lead-on', [point(0, 0), point(100, 0)]);

  const result = matchDivisionObjects(division, [simulator]);
  const matchedIds = new Set(result.matches.map((match) => match.division.id));

  assert.equal(matchedIds.has('lead-west'), true);
  assert.equal(matchedIds.has('lead-east'), true);
  assert.equal(matchedIds.has('lead-weak'), false);
  assert.equal(result.unmatched.some((item) => item.division.id === 'lead-weak'), true);
});

test('splits a straight source row at a junction for a composite BARS shape', () => {
  const division = [
    divisionLine('lead-short', 'lead_on', [point(-20, 0), point(0, 0)]),
    divisionLine('lead-composite', 'lead_on', [
      point(100, 0),
      point(0, 0),
      point(-10, 5),
      point(-30, 20),
      point(-50, 50),
    ]),
  ];
  const rows = [
    simulatorLine('sim-straight', 'lead-on', [point(-20, 0.4), point(100, 0.4)]),
    simulatorLine('sim-curve', 'lead-on', [
      point(0, 0.4),
      point(-10, 5.4),
      point(-30, 20.4),
      point(-50, 50.4),
    ]),
  ];

  const result = matchDivisionObjects(division, rows);
  const straightMatches = result.matches
    .filter((match) => match.row.sourceParentRowId === 'sim-straight')
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);
  const compositeSources = result.matches
    .filter((match) => match.division.id === 'lead-composite')
    .map((match) => match.row.sourceParentRowId ?? match.row.id);

  assert.equal(result.unmatched.length, 0);
  assert.deepEqual(
    straightMatches.map((match) => match.division.id),
    ['lead-short', 'lead-composite']
  );
  assert.ok(
    Math.abs(straightMatches[0].row.sourceRangeEndMeters - 20) < 2,
    JSON.stringify(straightMatches.map((match) => ({ id: match.division.id, row: match.row })))
  );
  assert.ok(
    Math.abs(
      straightMatches[0].row.sourceRangeEndMeters -
        straightMatches[1].row.sourceRangeStartMeters
    ) < 0.001
  );
  assert.ok(compositeSources.includes('sim-straight'));
  assert.ok(compositeSources.includes('sim-curve'));
  assert.equal(
    result.matches.some(
      (match) => match.division.id === 'lead-short' && match.row.id === 'sim-curve'
    ),
    false
  );
});

test('does not combine distant projection runs from opposite ends of a looping row', () => {
  const division = divisionLine('taxi-loop-entry', 'taxiway', [point(0, 0.4), point(50, 0.4)]);
  const simulator = simulatorLine('sim-loop', 'taxi-centerline', [
    point(0, 0),
    point(50, 0),
    point(56, 6),
    point(100, -10),
    point(0, 0.6),
  ]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.ok(result.matches[0].row.sourceRangeEndMeters < 65);
});

test('rejects an incidental composite sliver on a much longer source row', () => {
  const division = divisionLine('lead-crossing', 'lead_on', [
    point(50, 0),
    point(70, 0),
    point(70, 50),
  ]);
  const simulator = simulatorLine('sim-long', 'lead-on', [point(0, 0.5), point(400, 0.5)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('does not let a complete match steal the continuation of an adjacent source row', () => {
  const division = [
    divisionLine('lead-complete', 'lead_on', [point(0, 0), point(20, 0), point(30, 10)]),
    divisionLine('lead-adjacent', 'lead_on', [point(-100, 0), point(0, 0)]),
  ];
  const rows = [
    simulatorLine('sim-complete', 'lead-on', [point(0, 0.3), point(20, 0.3), point(30, 10.3)]),
    simulatorLine('sim-adjacent', 'lead-on', [point(-100, 0.4), point(20, 0.4)]),
  ];

  const result = matchDivisionObjects(division, rows);
  const completeSources = result.matches
    .filter((match) => match.division.id === 'lead-complete')
    .map((match) => match.row.sourceParentRowId ?? match.row.id);
  const adjacentMatch = result.matches.find(
    (match) => match.division.id === 'lead-adjacent'
  );

  assert.deepEqual(completeSources, ['sim-complete']);
  assert.equal(adjacentMatch.row.id, 'sim-adjacent');
  assert.equal(adjacentMatch.row.sourceParentRowId, undefined);
  assert.equal(result.unmatched.length, 0);
});

test('does not let a weak secondary claimant split a row from its clear primary owner', () => {
  const division = [
    divisionLine('secondary-owner', 'lead_on', [point(0, 0), point(40, 11.5)]),
    divisionLine('primary-owner', 'lead_on', [point(25, 1), point(95, 1)]),
  ];
  const rows = [
    inferredPlacementLine('secondary-own-row', 'taxi-centerline', [
      point(0, 0.4),
      point(40, 11.9),
    ]),
    inferredPlacementLine('primary-row', 'taxi-centerline', [point(-5, 1), point(100, 1)]),
  ];

  const result = matchDivisionObjects(division, rows);
  const secondarySources = result.matches
    .filter((match) => match.division.id === 'secondary-owner')
    .map((match) => match.row.sourceParentRowId ?? match.row.id);
  const primarySources = result.matches
    .filter((match) => match.division.id === 'primary-owner')
    .map((match) => match.row.sourceParentRowId ?? match.row.id);

  assert.deepEqual(secondarySources, ['secondary-own-row']);
  assert.deepEqual(primarySources, ['primary-row']);
  assert.equal(result.unmatched.length, 0);
});

test('keeps a short aligned target layer alongside a complete match for removal', () => {
  const division = divisionLine('taxi-layered', 'taxiway', [
    point(0, 0),
    point(20, 0),
    point(30, 10),
  ]);
  const complete = simulatorLine('sim-complete', 'taxi-centerline', [
    point(0, 0.3),
    point(20, 0.3),
    point(30, 10.3),
  ]);
  const shortLayer = simulatorLine('sim-short-layer', 'lead-on', [
    point(0, 0.4),
    point(8, 0.4),
  ]);

  const matching = matchDivisionObjects([division], [complete, shortLayer]);
  const output = buildDraftOutput(
    { instances: [], lightRows: [complete, shortLayer], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.deepEqual(
    matching.matches.map((match) => match.row.sourceParentRowId ?? match.row.id).sort(),
    ['sim-complete', 'sim-short-layer']
  );
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
});

test('accepts shared partition endpoints on a removal polygon boundary', () => {
  const division = [
    divisionLine('lead-west', 'lead_on', [point(5, 0), point(90, 0)]),
    divisionLine('lead-east', 'lead_on', [point(110, 0), point(195, 0)]),
  ];
  const rows = [
    simulatorLine('sim-green', 'lead-on', [point(0, 0), point(200, 0)]),
    simulatorLine('sim-yellow', 'lead-on', [point(0, 0.1), point(200, 0.1)]),
  ];
  const matching = matchDivisionObjects(division, rows);
  const output = buildDraftOutput(
    { instances: [], lightRows: rows, mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 4);
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.unmatched.length, 0);
});

test('does not reuse an overlapping section of a split simulator row', () => {
  const division = [
    divisionLine('taxi-best', 'taxiway', [point(10, 0), point(50, 0)]),
    divisionLine('taxi-overlap', 'taxiway', [point(12, 4), point(52, 4)]),
  ];
  const simulator = simulatorLine('sim-long', 'taxi-centerline', [point(0, 1), point(100, 1)]);

  const result = matchDivisionObjects(division, [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].division.id, 'taxi-best');
  assert.equal(result.unmatched.length, 1);
});

test('builds removers only for the approved section of a longer source row', () => {
  const division = divisionLine('taxi-middle', 'taxiway', [point(25, 0), point(55, 0)]);
  const simulator = simulatorLine('sim-long', 'taxi-centerline', [point(0, 1), point(100, 1)]);
  const matching = matchDivisionObjects([division], [simulator]);

  const output = buildDraftOutput(
    { instances: [], lightRows: [simulator], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 1, JSON.stringify(output.safetyRejections));
  assert.equal(output.unmatched.length, 0);
  assert.ok(output.removals.length > 0);
  assert.ok(output.matched[0].row.sourceRangeStartMeters > 20);
  assert.ok(output.matched[0].row.sourceRangeEndMeters < 60);
});

test('keeps a matched lead-on when another lead-on only crosses its removal corridor', () => {
  const division = divisionLine('lead-east-west', 'lead_on', [point(0, 0), point(80, 0)]);
  const selected = simulatorLine('sim-east-west', 'lead-on', [point(0, 0), point(80, 0)]);
  const crossing = simulatorLine('sim-north-south', 'lead-on', [point(40, -30), point(40, 30)]);
  const matching = matchDivisionObjects([division], [selected, crossing]);

  const output = buildDraftOutput(
    { instances: [], lightRows: [selected, crossing], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(matching.matches.length, 1);
  assert.equal(output.matched.length, 1, JSON.stringify(output.safetyRejections));
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.unmatched.length, 0);
});

test('keeps a matched lead-on at an isolated unselected taxi-centreline junction', () => {
  const division = divisionLine('lead-east-west', 'lead_on', [point(0, 0), point(80, 0)]);
  const selected = simulatorLine('sim-east-west', 'lead-on', [point(0, 0), point(80, 0)]);
  const crossing = simulatorLine(
    'sim-north-south',
    'taxi-centerline',
    [point(40, -30), point(40, 30)]
  );
  const matching = matchDivisionObjects([division], [selected, crossing]);

  const output = buildDraftOutput(
    { instances: [], lightRows: [selected, crossing], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(matching.matches.length, 1);
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
  assert.equal(output.removalApproved.length, 1);
});

test('still protects a long unselected lead-on running beside a selected row', () => {
  const division = divisionLine('lead-selected', 'lead_on', [point(0, 0), point(80, 0)]);
  const selected = simulatorLine('sim-selected', 'lead-on', [point(0, 0), point(80, 0)]);
  const parallel = simulatorLine('sim-parallel', 'lead-on', [point(0, 0.5), point(80, 0.5)]);
  const matching = {
    matches: [
      {
        division,
        row: selected,
        score: 1,
        metrics: { alignmentMode: 'full-shape' },
      },
    ],
    unmatched: [],
    duplicateDivisionLeadOns: [],
    duplicateSimulatorLeadOns: [],
    mergedSimulatorRows: [],
  };

  const output = buildDraftOutput(
    { instances: [], lightRows: [selected, parallel], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 1, JSON.stringify(output.safetyRejections));
  const removalRings = output.removals.map((removal) =>
    removal.coordinates.map(([lon, lat]) => ({ lon, lat }))
  );
  assert.ok(
    parallel.vertices.every(
      (vertex) => !removalRings.some((ring) => pointInPolygon(vertex, ring))
    )
  );
});

test('keeps a matched BARS object in the XML when only its remover needs review', () => {
  const division = divisionLine('lead-protected', 'lead_on', [point(0, 0), point(30, 0)]);
  const simulator = simulatorLine('sim-protected', 'lead-on', [point(0, 0), point(30, 0)]);
  const matching = matchDivisionObjects([division], [simulator]);
  const conflictPoint = point(0, 0);

  const output = buildDraftOutput(
    {
      instances: [],
      lightRows: [simulator],
      mustKeepZones: [
        {
          id: 'protected-light',
          geometryType: 'Point',
          point: { lat: conflictPoint.lat, lon: conflictPoint.lng },
          clearanceMeters: 0.5,
        },
      ],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 1);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.unmatched.length, 0);
  assert.equal(output.removalWarnings.length, 1);
  assert.match(output.xml, /displayName="lead-protected"/);
  assert.ok(
    output.geojson.features.some((feature) => feature.properties.featureType === 'unsafe')
  );
});

test('does not cascade one rejected remover into neighbouring matched rows', () => {
  const firstDivision = divisionLine('first', 'lead_on', [point(0, 0), point(30, 0)]);
  const secondDivision = divisionLine('second', 'lead_on', [point(10, 0.5), point(40, 0.5)]);
  const first = simulatorLine('sim-first', 'lead-on', [point(0, 0), point(30, 0)]);
  const second = simulatorLine('sim-second', 'lead-on', [point(10, 0.5), point(40, 0.5)]);
  const matching = {
    matches: [
      { division: firstDivision, row: first, score: 1, metrics: {} },
      { division: secondDivision, row: second, score: 1, metrics: {} },
    ],
    unmatched: [],
    duplicateDivisionLeadOns: [],
    duplicateSimulatorLeadOns: [],
    mergedSimulatorRows: [],
  };
  const protectedPoint = point(0, 0);

  const output = buildDraftOutput(
    {
      instances: [],
      lightRows: [first, second],
      mustKeepZones: [
        {
          id: 'confirmed-protected-light',
          geometryType: 'Point',
          point: { lat: protectedPoint.lat, lon: protectedPoint.lng },
          clearanceMeters: 0.5,
        },
      ],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.deepEqual(output.removalWarnings.map((item) => item.division.id), ['first']);
  assert.deepEqual(output.removalApproved.map((match) => match.division.id), ['second']);
});

test('lets direct target-row evidence override only the inferred runway centreline envelope', () => {
  const division = divisionLine('runway-lead-on', 'lead_on', [point(0, 0), point(80, 0)]);
  const selected = simulatorLine('sim-runway-lead-on', 'lead-on', [point(0, 0), point(80, 0)]);
  const matching = matchDivisionObjects([division], [selected]);

  const output = buildDraftOutput(
    {
      instances: [],
      lightRows: [selected],
      mustKeepZones: [
        {
          id: 'inferred-runway-centreline-envelope',
          classification: 'runway',
          lightType: 'runway-centerline-continuous-envelope',
          geometryMode: 'continuous-procedural-envelope',
          geometryType: 'LineString',
          vertices: selected.vertices,
          clearanceMeters: 0.1,
        },
      ],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
  assert.equal(output.removalApproved.length, 1);
});

function point(xMeters, yMeters) {
  return {
    lat: LATITUDE + yMeters / 111_320,
    lng: 115.97 + xMeters / METERS_PER_LONGITUDE,
  };
}

function divisionLine(id, type, coordinates) {
  return { id, name: id, type, coordinates };
}

function graphPoint(index, coordinate, flags) {
  return { index, flags, lat: coordinate.lat, lon: coordinate.lng };
}

function graphPath(index, start, end, widthMeters) {
  return {
    index,
    startIndex: start.index,
    endIndex: end.index,
    start,
    end,
    widthMeters,
  };
}

function simulatorLine(id, classification, coordinates, confidence = 0.9) {
  return {
    id,
    classification,
    confidence,
    sourceFile: 'airport.bgl',
    sourceType: 'bgl-airport-light-row',
    vertices: coordinates.map(({ lat, lng }) => ({ lat, lon: lng })),
  };
}

function inferredPlacementLine(id, classification, coordinates, confidence = 0.9) {
  return {
    ...simulatorLine(id, classification, coordinates, confidence),
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds: coordinates.map((_, index) => `${id}-instance-${index}`),
  };
}

function simulatorInstance(id, classification, coordinate, confidence = 0.9) {
  return {
    id,
    classification,
    confidence,
    lat: coordinate.lat,
    lon: coordinate.lng,
    sourceFile: 'airport.bgl',
    sourceType: 'library-object',
  };
}
