import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftOutput } from './draft-output.js';
import {
  DRAFT_DIAGNOSTIC_SCHEMA,
  buildGenerationDiagnostic,
  diagnosticJsonBlob,
} from './diagnostics.js';
import { matchDivisionObjects, scorePolylineMatch } from './matching.js';
import { pointInPolygon } from './extractor/geo.js';
import { parseAptDatAirport } from './extractor/xplane-apt.js';
import ypphOwnershipRegression from './fixtures/ypph-ownership-regressions.js';

const LATITUDE = -31.94;
const METERS_PER_LONGITUDE = 111_320 * Math.cos((LATITUDE * Math.PI) / 180);

test('matches a roughly aligned source row with the required division classification', () => {
  const division = divisionLine('stop-a', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulator = simulatorLine('sim-stop', 'stopbar', [point(1, 3), point(21, 3)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'sim-stop');
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.diagnostics, undefined);
});

test('captures complete matcher decisions only when development diagnostics are requested', () => {
  const division = divisionLine('diagnostic-stop', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulator = simulatorLine('diagnostic-sim', 'stopbar', [point(1, 2), point(21, 2)]);
  const instances = [
    simulatorInstance('diagnostic-instance-west', 'stopbar', point(0, 1)),
    simulatorInstance('diagnostic-instance-east', 'stopbar', point(10, 1)),
  ];

  const result = matchDivisionObjects([division], [simulator], instances, {
    includeDiagnostics: true,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.diagnostics.divisionObjects[0].id, 'diagnostic-stop');
  assert.equal(result.diagnostics.simulatorCandidates[0].id, 'diagnostic-sim');
  assert.equal(result.diagnostics.compatibleRowCandidateEvaluations.length, 1);
  assert.equal(result.diagnostics.compatibleRowCandidateEvaluations[0].outcome, 'eligible');
  assert.equal(result.diagnostics.instanceCandidateEvaluations.length, 1);
  assert.equal(result.diagnostics.instanceCandidateEvaluations[0].outcome, 'rejected');
  assert.equal(
    result.diagnostics.instanceCandidateEvaluations[0].reason,
    'insufficient-source-stations'
  );
  assert.equal(result.diagnostics.pipeline.eligibleEdges.length, 1);
  assert.equal(result.diagnostics.pipeline.allocatedEdges.length, 1);
  assert.equal(result.diagnostics.configuration.types.stopbar.minimumScore, 0.43);
});

test('bounds airport-scale candidate diagnostics without losing totals or eligible rows', () => {
  const division = divisionLine('bounded-diagnostic-stop', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulatorRows = Array.from({ length: 30 }, (_, index) =>
    simulatorLine(
      `bounded-sim-${index.toString().padStart(2, '0')}`,
      'stopbar',
      index === 0
        ? [point(1, 2), point(21, 2)]
        : [point(index * 100, 0), point(index * 100 + 20, 0)]
    )
  );

  const result = matchDivisionObjects([division], simulatorRows, [], {
    includeDiagnostics: true,
  });

  assert.equal(result.diagnostics.compatibleRowCandidateEvaluations.length, 12);
  assert.equal(result.diagnostics.compatibleRowCandidateSummary.totalEvaluations, 30);
  assert.equal(result.diagnostics.compatibleRowCandidateSummary.omittedEvaluations, 18);
  assert.ok(
    result.diagnostics.compatibleRowCandidateEvaluations.some(
      (evaluation) =>
        evaluation.simulatorCandidateId === 'bounded-sim-00' && evaluation.outcome === 'eligible'
    )
  );
});

test('builds a compact self-contained generation diagnostic JSON document', async () => {
  const division = divisionLine('diagnostic-stop', 'stopbar', [point(0, 0), point(20, 0)]);
  const simulator = simulatorLine('diagnostic-sim', 'stopbar', [point(1, 2), point(21, 2)]);
  const matching = matchDivisionObjects([division], [simulator], [], {
    includeDiagnostics: true,
  });
  const data = {
    meta: { icao: 'TEST' },
    instances: [],
    lightRows: [simulator],
    runways: [],
    mustKeepZones: [],
  };
  const output = {
    replacements: matching.matches,
    removalApproved: matching.matches,
    removalWarnings: [],
    removals: [],
    safetyRejections: [],
    duplicateDivisionLeadOns: [],
    duplicateSimulatorLeadOns: [],
    xml: '<FSData />',
    geojson: { type: 'FeatureCollection', features: [] },
    simulatorGeojson: { type: 'FeatureCollection', features: [] },
  };
  const diagnostic = buildGenerationDiagnostic({
    request: {
      icao: 'TEST',
      altitude: 12,
      packageName: 'Test package',
      divisionPoints: [division],
    },
    entries: [
      {
        path: 'scenery/airport.bgl',
        size: 1234,
        lastModified: 5678,
        file: { name: 'airport.bgl', type: 'application/octet-stream', secretBytes: 'excluded' },
      },
    ],
    fileScan: {
      input: '/input',
      filesScanned: 1,
      bglFiles: ['/input/scenery/airport.bgl'],
      xmlFiles: [],
      unsupportedFiles: [],
    },
    data,
    matching,
    output,
    timings: { matching: 1.25 },
    environment: { userAgent: 'test' },
  });
  const parsed = JSON.parse(await diagnosticJsonBlob(diagnostic).text());

  assert.equal(parsed.schema, DRAFT_DIAGNOSTIC_SCHEMA);
  assert.equal(parsed.request.divisionObjects[0].id, 'diagnostic-stop');
  assert.equal(parsed.package.manifest[0].path, 'scenery/airport.bgl');
  assert.equal(parsed.package.manifest[0].secretBytes, undefined);
  assert.equal(parsed.summary.compatibleRowCandidateEvaluations, 1);
  assert.equal(parsed.matching.diagnostics.pipeline.allocatedEdges.length, 1);
  assert.equal(parsed.generation.draftXml, '<FSData />');
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
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, result, {
    icao: 'TEST',
    altitude: 0,
  });

  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((match) => match.row.id).sort(), [
    'stopbar-east',
    'stopbar-west',
  ]);
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
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, result, {
    icao: 'TEST',
    altitude: 0,
  });

  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches.map((match) => match.row.id).sort(), ['sim-high', 'sim-low']);
  assert.equal(output.matched.length, 2);
  assert.equal(output.replacements.length, 1);
  const matchedFeature = output.geojson.features.find(
    (feature) => feature.properties.featureType === 'matched'
  );
  const originalFeature = output.geojson.features.find(
    (feature) => feature.properties.featureType === 'original-division'
  );
  assert.equal(
    output.geojson.features.filter(
      (feature) => feature.properties.featureType === 'original-division'
    ).length,
    1
  );
  assert.equal(matchedFeature.properties.divisionId, 'lead-a');
  assert.match(matchedFeature.properties.debugColor, /^#[\da-f]{6}$/);
  assert.equal(originalFeature.properties.divisionId, 'lead-a');
  assert.deepEqual(
    originalFeature.geometry.coordinates,
    division.coordinates.map((coordinate) => [coordinate.lng, coordinate.lat])
  );
  assert.deepEqual(result.duplicateSimulatorLeadOns, ['sim-low']);
  assert.equal(result.mergedSimulatorRows.length, 1);
  assert.deepEqual(result.mergedSimulatorRows[0].sourceRowIds, ['sim-high', 'sim-low']);
  assert.deepEqual(result.mergedSimulatorRows[0].vertices, rows[1].vertices);
  assert.equal(
    output.simulatorGeojson.features.filter(
      (feature) => feature.properties.featureType === 'simulator-source'
    ).length,
    2
  );
  assert.equal(
    output.simulatorGeojson.features.filter(
      (feature) => feature.properties.featureType === 'simulator-merged'
    ).length,
    1
  );
});

test('uses varied high-contrast colors for nearby BARS IDs', () => {
  const divisions = Array.from({ length: 8 }, (_, index) =>
    divisionLine(`nearby-${index}`, 'taxiway', [point(index * 3, 0), point(index * 3 + 2, 0)])
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

  assert.equal(new Set(colors).size, colors.length);
  for (let left = 0; left < colors.length; left += 1) {
    for (let right = left + 1; right < colors.length; right += 1) {
      assert.ok(hexColorDistance(colors[left], colors[right]) >= 100);
    }
  }
});

function hexColorDistance(left, right) {
  const channels = (color) =>
    [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
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
  assert.ok(
    result.matches.every(
      (match) => match.replacementRow.sourceGeometryDerived === 'source-row-subsection'
    )
  );
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
  const division = divisionLine('taxi-offset-drift', 'taxiway', [point(50, 2.3), point(150, 3.1)]);
  const simulator = simulatorLine('sim-long', 'taxi-centerline', [point(0, 0), point(200, 0)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.equal(result.unmatched.length, 0);
  assert.equal(result.matches[0].row.sourceParentRowId, 'sim-long');
  assert.ok(
    result.matches[0].row.sourceRangeEndMeters - result.matches[0].row.sourceRangeStartMeters > 95
  );
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
  assert.deepEqual(result.matches.map((match) => match.row.id).sort(), ['sim-east', 'sim-west']);
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

  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, matching, {
    icao: 'TEST',
    altitude: 0,
  });

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

test('uses the complete X-Plane taxi-centreline row for a shortened lead-on display shape', () => {
  const division = divisionLine('lead-short', 'lead_on', [point(35, 0), point(65, 0)]);
  const simulator = {
    ...simulatorLine('xplane-full', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    lightCode: 105,
  };

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].row.vertices, simulator.vertices);
  assert.deepEqual(result.matches[0].replacementRow.vertices, simulator.vertices);
});

test('uses the highest available X-Plane evidence tier for each division object', () => {
  const division = divisionLine('xplane-priority', 'stopbar', [point(0, 0), point(20, 0)]);
  const aptLight = {
    ...simulatorLine('apt-light', 'stopbar', [point(0, 3), point(20, 3)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const dsfString = {
    ...simulatorLine('dsf-string', 'stopbar', [point(0, 1), point(20, 1)]),
    sourceType: 'xplane-dsf-light-string',
    evidencePriority: 2,
    removalEligible: true,
  };
  const marking = {
    ...simulatorLine('dsf-marking', 'stopbar', [point(0, 0), point(20, 0)]),
    sourceType: 'xplane-dsf-painted-line',
    evidencePriority: 3,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects([division], [marking, dsfString, aptLight]);

  assert.deepEqual(
    result.matches.map((match) => match.row.id),
    ['apt-light']
  );
});

test('uses lower-priority X-Plane evidence only for geometry not covered by exact lights', () => {
  const division = divisionLine('xplane-segment-priority', 'lead_on', [
    point(0, 0),
    point(50, 0),
    point(50, 50),
  ]);
  const exactLight = {
    ...simulatorLine('apt-light-segment', 'lead-on', [point(0, 1), point(50, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const duplicateMarking = {
    ...simulatorLine('apt-marking-duplicate', 'taxi-centerline', [point(0, 1), point(50, 1)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };
  const uncoveredMarking = {
    ...simulatorLine('apt-marking-uncovered', 'taxi-centerline', [point(51, 0), point(51, 50)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects([division], [duplicateMarking, uncoveredMarking, exactLight]);

  assert.deepEqual(result.matches.map((match) => match.row.id).sort(), [
    'apt-light-segment',
    'apt-marking-uncovered',
  ]);
});

test('hard-cuts a native X-Plane guidance row at the stopbar around the matched geometry', () => {
  const divisions = [
    divisionLine('directed-stopbar', 'stopbar', [point(50, 10), point(50, -10)]),
    divisionLine('lead-lit-side', 'lead_on', [point(50, 0), point(90, 0)]),
  ];
  const row = {
    ...simulatorLine('xplane-crossing-row', 'lead-on', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };

  const result = matchDivisionObjects(divisions, [row]);
  const leadOn = result.matches.find((match) => match.division.id === 'lead-lit-side');

  assert.ok(leadOn);
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 50) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 100) < 0.2);
});

test('hard-cuts a native MSFS guidance row at the stopbar regardless of stopbar direction', () => {
  const divisions = [
    divisionLine('directed-stopbar-msfs', 'stopbar', [point(50, -10), point(50, 10)]),
    divisionLine('lead-lit-side-msfs', 'lead_on', [point(50, 0), point(90, 0)]),
  ];
  const row = simulatorLine('msfs-crossing-row', 'lead-on', [point(0, 1), point(100, 1)]);

  const result = matchDivisionObjects(divisions, [row]);
  const leadOn = result.matches.find((match) => match.division.id === 'lead-lit-side-msfs');

  assert.ok(leadOn);
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 50) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 100) < 0.2);
});

test('does not attach a continuation from the opposite side of a stopbar', () => {
  const divisions = [
    divisionLine('hard-boundary', 'stopbar', [point(50, -10), point(50, 10)]),
    divisionLine('inside-owner', 'lead_on', [point(50, 0), point(100, 0)]),
  ];
  const primary = {
    ...simulatorLine('inside-exact', 'lead-on', [point(50, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const exterior = {
    ...simulatorLine('outside-marking', 'taxi-centerline', [point(0, 1), point(50, 1)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects(divisions, [primary, exterior]);

  assert.deepEqual(
    result.matches
      .filter((match) => match.division.id === 'inside-owner')
      .map((match) => match.row.sourceParentRowId ?? match.row.id),
    ['inside-exact']
  );
});

test('drops a translated stopbar fallback when a full-shape exact row already exists', () => {
  const division = divisionLine('one-stopbar', 'stopbar', [point(0, 0), point(20, 0)]);
  const exact = {
    ...simulatorLine('exact-stopbar', 'stopbar', [point(0, 1), point(20, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const translated = {
    ...simulatorLine('translated-stopbar', 'stopbar', [point(0, 29), point(9, 29)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };

  const result = matchDivisionObjects([division], [translated, exact]);

  assert.deepEqual(
    result.matches.map((match) => match.row.id),
    ['exact-stopbar']
  );
});

test('completes a connected X-Plane source row exactly to a BARS stopbar boundary', () => {
  const divisions = [
    divisionLine('directed-stopbar', 'stopbar', [point(0, 10), point(0, -10)]),
    divisionLine('lead-needing-stopbar-end', 'lead_on', [point(30, 0), point(100, 0)]),
  ];
  const primary = {
    ...simulatorLine('xplane-primary', 'lead-on', [point(30, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const connector = {
    ...simulatorLine('xplane-stopbar-connector', 'taxi-centerline', [
      point(-40, 1),
      point(0, 1),
      point(30, 1),
    ]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };

  const result = matchDivisionObjects(divisions, [primary, connector]);
  const leadMatches = result.matches.filter(
    (match) => match.division.id === 'lead-needing-stopbar-end'
  );
  const completion = leadMatches.find(
    (match) => match.metrics.sourceConnectionBasis === 'stopbar-boundary'
  );

  assert.ok(completion);
  assert.equal(completion.row.sourceParentRowId, 'xplane-stopbar-connector');
  assert.ok(Math.abs(completion.row.sourceRangeStartMeters - 40) < 0.2);
  assert.ok(Math.abs(completion.row.sourceRangeEndMeters - 70) < 0.2);
});

test('extends through one straight lower-priority source continuation', () => {
  const division = divisionLine('lead-with-marking-continuation', 'lead_on', [
    point(0, 0),
    point(50, 0),
  ]);
  const primary = {
    ...simulatorLine('xplane-lit-primary', 'lead-on', [point(0, 1), point(50, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const continuation = {
    ...simulatorLine('xplane-marked-continuation', 'taxi-centerline', [
      point(50, 1),
      point(130, 1),
    ]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects([division], [primary, continuation]);
  const completion = result.matches.find(
    (match) => match.metrics.sourceConnectionBasis === 'straight-source-fallback'
  );

  assert.ok(completion);
  assert.equal(completion.row.id, 'xplane-marked-continuation');
  assert.equal(completion.row.removalEligible, false);
});

test('keeps the uncovered continuation of an overlapping lower-priority X-Plane row', () => {
  const division = divisionLine('lead-with-overlapping-marking', 'lead_on', [
    point(0, 0),
    point(50, 0),
  ]);
  const primary = {
    ...simulatorLine('xplane-exact-segment', 'lead-on', [point(0, 1), point(50, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const continuation = {
    ...simulatorLine('xplane-overlapping-marking', 'taxi-centerline', [
      point(-80, 1),
      point(0, 1),
      point(50, 1),
    ]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects([division], [primary, continuation]);
  const completion = result.matches.find(
    (match) =>
      match.row.sourceParentRowId === 'xplane-overlapping-marking' &&
      match.metrics.sourceConnectionBasis === 'uncovered-lower-priority-evidence'
  );

  assert.ok(completion);
  assert.ok(completion.row.sourceRangeStartMeters < 0.2);
  assert.ok(Math.abs(completion.row.sourceRangeEndMeters - 80) < 0.2);
  assert.equal(completion.row.removalEligible, false);
});

test('suppresses a weak registered YPPH claimant beneath a strong exact X-Plane owner', () => {
  const divisions = [
    {
      id: 'BARS_ZMSHS',
      type: 'lead_on',
      name: 'D',
      coordinates: [
        { lat: -31.935152833600153, lng: 115.96621368149421 },
        { lat: -31.935119825149773, lng: 115.96630956977606 },
        { lat: -31.935079990761018, lng: 115.96638936549427 },
        { lat: -31.935024222587764, lng: 115.96648123115304 },
        { lat: -31.934953658728233, lng: 115.96655566245319 },
        { lat: -31.934895614222516, lng: 115.96660729497673 },
        { lat: -31.934844967516025, lng: 115.9666307643056 },
        { lat: -31.934747088408674, lng: 115.96666295081378 },
      ],
    },
    {
      id: 'BARS_UFD89',
      type: 'lead_on',
      name: 'N',
      coordinates: [
        { lat: -31.934914365403586, lng: 115.96690785267484 },
        { lat: -31.934942277455495, lng: 115.96686730161312 },
        { lat: -31.934977274864664, lng: 115.96681701019406 },
        { lat: -31.935009711475917, lng: 115.96677510067822 },
        { lat: -31.93504613151702, lng: 115.96673050895335 },
        { lat: -31.93507856810396, lng: 115.96669698134065 },
        { lat: -31.93512295499387, lng: 115.96665440127255 },
        { lat: -31.935172463422724, lng: 115.96661584451796 },
        { lat: -31.935223109948776, lng: 115.96658164635303 },
        { lat: -31.93527546363176, lng: 115.96655180677773 },
        { lat: -31.935333223367, lng: 115.9665202908218 },
        { lat: -31.935386430578667, lng: 115.96649816259743 },
        { lat: -31.93543366262313, lng: 115.96648475155234 },
      ],
    },
  ];
  const extracted = parseAptDatAirport(
    [
      '1 20 0 0 YPPH Perth',
      '120',
      '111 -31.9349083 115.9669093 10 105',
      '112 -31.9353870 115.9665030 -31.9356750 115.9664188',
      '111 -31.9353870 115.9665030 10 105',
      '115 -31.9362926 115.9662442',
    ].join('\n'),
    { icao: 'YPPH', sourceFile: 'apt.dat' }
  );
  const light = extracted.lightRows.find((row) => row.lightCode === 105);

  const result = matchDivisionObjects(divisions, [light], [], { includeDiagnostics: true });
  const ownership = result.diagnostics.pipeline.ownershipEdges.filter(
    (edge) => edge.simulatorCandidateId === light.id
  );

  assert.deepEqual(
    result.matches.map((match) => match.division.id),
    ['BARS_UFD89']
  );
  assert.deepEqual(
    ownership.map((edge) => edge.divisionId),
    ['BARS_UFD89']
  );
});

test('keeps YPPH painted-centreline fallback with its overlapping exact-light owner', () => {
  const divisions = [
    {
      id: 'BARS_3LHZ2',
      type: 'lead_on',
      name: 'D',
      coordinates: [
        { lat: -31.9351431127847, lng: 115.96581363040838 },
        { lat: -31.935160228583598, lng: 115.96589852124454 },
        { lat: -31.935169902642567, lng: 115.96597831696273 },
        { lat: -31.935172747953835, lng: 115.96606817096475 },
        { lat: -31.935162504832846, lng: 115.96615869551898 },
        { lat: -31.93513974233767, lng: 115.96628811210394 },
        { lat: -31.935062918874845, lng: 115.96657041460278 },
      ],
    },
    {
      id: 'BARS_ZUHDO',
      type: 'lead_on',
      name: 'N',
      coordinates: [
        { lat: -31.934324556763766, lng: 115.96805216744544 },
        { lat: -31.934886509198694, lng: 115.9669626876712 },
        { lat: -31.93497158422994, lng: 115.96679521724583 },
        { lat: -31.93500288271661, lng: 115.9667274914682 },
        { lat: -31.93503190494018, lng: 115.9666601009667 },
        { lat: -31.935053529336095, lng: 115.96659572795035 },
      ],
    },
  ];
  const extracted = parseAptDatAirport(
    [
      '1 20 0 0 YPPH Perth',
      '120',
      '111 -31.9351174 115.9657885 10 101',
      '112 -31.9351475 115.9662093 -31.9351084 115.9664583',
      '111 -31.9351475 115.9662093',
      '112 -31.9351475 115.9662093 -31.9350911 115.9665590 10 101',
      '111 -31.9349083 115.9669093 10 101',
      '111 -31.9345833 115.9675117 10 101',
      '115 -31.9343199 115.9680462',
    ].join('\n'),
    { icao: 'YPPH', sourceFile: 'apt.dat' }
  );
  const light = extracted.lightRows.find((row) => row.lightCode === 101);
  const marking = extracted.lightRows.find((row) => row.markingCode === 10);

  const result = matchDivisionObjects(divisions, [light, marking]);
  const markingMatches = result.matches.filter(
    (match) => (match.row.sourceParentRowId ?? match.row.id) === marking.id
  );

  assert.equal(markingMatches.length, 1);
  assert.equal(markingMatches[0].division.id, 'BARS_3LHZ2');
  assert.equal(
    markingMatches[0].metrics.sourceConnectionBasis,
    'overlapping-higher-priority-owner'
  );
  assert.ok(markingMatches[0].row.sourceRangeStartMeters < 0.1);
  assert.ok(markingMatches[0].row.sourceRangeEndMeters > 75);
});

test('uses a source junction to avoid an endpoint gap in shared exact-light allocation', () => {
  const divisions = [
    divisionLine('short-adjacent-owner', 'lead_on', [point(0, 0), point(15, 0)]),
    divisionLine('primary-marking-owner', 'lead_on', [point(20, 0), point(90, 0)]),
  ];
  const exactLight = {
    ...simulatorLine('shared-exact-light', 'lead-on', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const marking = {
    ...simulatorLine('primary-full-marking', 'taxi-centerline', [point(10, 1), point(90, 1)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects(divisions, [exactLight, marking]);
  const exactRanges = result.matches
    .filter((match) => match.row.sourceParentRowId === 'shared-exact-light')
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.equal(exactRanges.length, 2);
  assert.ok(Math.abs(exactRanges[0].row.sourceRangeEndMeters - 10) < 0.2);
  assert.ok(
    Math.abs(exactRanges[0].row.sourceRangeEndMeters - exactRanges[1].row.sourceRangeStartMeters) <
      0.001
  );
  assert.equal(
    result.matches.some(
      (match) => (match.row.sourceParentRowId ?? match.row.id) === 'primary-full-marking'
    ),
    false
  );
});

test('keeps a near-equal composite row with its source-dominant owner', () => {
  const divisions = [
    divisionLine('source-dominant-owner', 'lead_on', [point(0, 0), point(70, 0), point(70, 50)]),
    divisionLine('subordinate-overlap', 'lead_on', [point(32, 0), point(52, 0), point(52, 65)]),
  ];
  const row = simulatorLine('dominant-source-row', 'lead-on', [point(0, 1), point(70, 1)]);

  const result = matchDivisionObjects(divisions, [row], [], { includeDiagnostics: true });
  const owners = result.diagnostics.pipeline.ownershipEdges
    .filter((edge) => edge.simulatorCandidateId === 'dominant-source-row')
    .map((edge) => edge.divisionId);

  assert.deepEqual(owners, ['source-dominant-owner']);
});

test('keeps a contested source row with its full-shape owner over a composite claimant', () => {
  const divisions = [
    divisionLine('full-owner', 'lead_on', [point(20, 0), point(80, 0)]),
    divisionLine('composite-claimant', 'lead_on', [point(20, 0), point(50, 0), point(50, 50)]),
  ];
  const row = simulatorLine('shared-row-with-incidental-branch', 'lead-on', [
    point(0, 1),
    point(100, 1),
  ]);

  const result = matchDivisionObjects(divisions, [row]);

  assert.deepEqual(
    result.matches.map((match) => match.division.id),
    ['full-owner']
  );
});

test('splits an uncovered marking midpoint between connected source owners', () => {
  const divisions = [
    divisionLine('west-connected-owner', 'lead_on', [point(-30, 0), point(0, 0)]),
    divisionLine('east-evidence-owner', 'lead_on', [point(50, 0), point(100, 0)]),
  ];
  const westExact = {
    ...simulatorLine('west-exact', 'lead-on', [point(-30, 1), point(0, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const eastExact = {
    ...simulatorLine('east-exact', 'lead-on', [point(50, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const marking = {
    ...simulatorLine('bridging-marking', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects(divisions, [westExact, eastExact, marking]);
  const markingMatches = result.matches
    .filter((match) => match.row.sourceParentRowId === 'bridging-marking')
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.deepEqual(
    markingMatches.map((match) => match.division.id),
    ['west-connected-owner', 'east-evidence-owner']
  );
  assert.ok(Math.abs(markingMatches[0].row.sourceRangeEndMeters - 25) < 0.2);
  assert.ok(
    Math.abs(
      markingMatches[0].row.sourceRangeEndMeters - markingMatches[1].row.sourceRangeStartMeters
    ) < 0.001
  );
});

test('gives uncovered marking ownership to the complete source-dominant division', () => {
  const west = divisionLine('west-connected-owner', 'lead_on', [point(-30, 0), point(0, 0)]);
  const shortEast = {
    ...divisionLine('a-short-east-owner', 'lead_on', [point(75, 0), point(100, 0)]),
    name: 'B',
  };
  const completeEast = {
    ...divisionLine('z-complete-east-owner', 'lead_on', [point(50, 0), point(100, 0)]),
    name: 'B',
  };
  const westExact = {
    ...simulatorLine('west-exact', 'lead-on', [point(-30, 1), point(0, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const shortEastExact = {
    ...simulatorLine('short-east-exact', 'lead-on', [point(75, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
    evidencePriority: 1,
    removalEligible: true,
  };
  const marking = {
    ...simulatorLine('shared-east-marking', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-painted-marking',
    evidencePriority: 4,
    removalEligible: false,
    placementOnly: true,
  };

  const result = matchDivisionObjects(
    [west, shortEast, completeEast],
    [westExact, shortEastExact, marking]
  );
  const markingOwners = result.matches
    .filter((match) => match.row.sourceParentRowId === 'shared-east-marking')
    .map((match) => match.division.id);

  assert.ok(markingOwners.includes('z-complete-east-owner'));
  assert.equal(markingOwners.includes('a-short-east-owner'), false);
});

test('partitions a long X-Plane trunk between source-backed branch junction owners', () => {
  const divisions = [
    divisionLine('branch-west', 'lead_on', [point(20, 0), point(20, 30)]),
    divisionLine('branch-middle', 'lead_on', [point(80, 0), point(80, 30)]),
    divisionLine('trunk-end', 'lead_on', [point(350, 0), point(400, 0)]),
  ];
  const rows = [
    {
      ...simulatorLine('long-source-trunk', 'lead-on', [point(0, 1), point(400, 1)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
    {
      ...simulatorLine('west-source-branch', 'lead-on', [point(20, 1), point(20, 31)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
    {
      ...simulatorLine('middle-source-branch', 'lead-on', [point(80, 1), point(80, 31)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
  ];

  const result = matchDivisionObjects(divisions, rows);
  const trunkMatches = result.matches
    .filter((match) => match.row.sourceParentRowId === 'long-source-trunk')
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.deepEqual(
    trunkMatches.map((match) => match.division.id),
    ['branch-west', 'branch-middle', 'trunk-end']
  );
  assert.equal(trunkMatches[0].row.sourceRangeStartMeters, 0);
  assert.ok(
    Math.abs(
      trunkMatches[0].row.sourceRangeEndMeters - trunkMatches[1].row.sourceRangeStartMeters
    ) < 0.001
  );
  assert.ok(
    Math.abs(
      trunkMatches[1].row.sourceRangeEndMeters - trunkMatches[2].row.sourceRangeStartMeters
    ) < 0.001
  );
  assert.ok(Math.abs(trunkMatches[2].row.sourceRangeEndMeters - 400) < 0.2);
});

test('prefers an exact connected continuation over a nearby parallel trunk', () => {
  const branchOwner = divisionLine('branch-with-straight-continuation', 'lead_on', [
    point(0, 30),
    point(0, 0),
    point(0, -50),
  ]);
  const trunkOwner = divisionLine('parallel-trunk-end', 'lead_on', [
    point(3, -350),
    point(3, -400),
  ]);
  const rows = [
    {
      ...simulatorLine('parallel-long-trunk', 'lead-on', [point(3, 0), point(3, -400)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
    {
      ...simulatorLine('exact-branch', 'lead-on', [point(0, 30), point(0, 0)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
    {
      ...simulatorLine('straight-painted-continuation', 'taxi-centerline', [
        point(0, 30),
        point(0, -50),
      ]),
      sourceType: 'xplane-apt-painted-marking',
      evidencePriority: 4,
      removalEligible: false,
      placementOnly: true,
    },
  ];

  const result = matchDivisionObjects([branchOwner, trunkOwner], rows);
  const incorrectlyClaimedParallelTrunk = result.matches.some(
    (match) =>
      match.division.id === 'branch-with-straight-continuation' &&
      match.row.sourceParentRowId === 'parallel-long-trunk' &&
      match.metrics.alignmentMode === 'source-junction-ownership'
  );

  assert.equal(incorrectlyClaimedParallelTrunk, false);
  assert.ok(
    result.matches.some(
      (match) =>
        match.division.id === 'branch-with-straight-continuation' &&
        (match.row.sourceParentRowId ?? match.row.id) === 'straight-painted-continuation'
    )
  );
});

test('accepts a moderate full-shape branch only at an exact X-Plane source junction', () => {
  const divisions = [
    divisionLine('moderate-branch', 'lead_on', [point(80, 0), point(82.5, 14), point(80, 30)]),
    divisionLine('trunk-end', 'lead_on', [point(350, 0), point(400, 0)]),
  ];
  const rows = [
    {
      ...simulatorLine('long-source-trunk', 'lead-on', [point(0, 1), point(400, 1)]),
      sourceType: 'xplane-apt-light-string',
      evidencePriority: 1,
      removalEligible: true,
    },
    {
      ...simulatorLine('moderate-source-branch', 'taxi-centerline', [point(80, 1), point(80, 31)]),
      sourceType: 'xplane-apt-painted-marking',
      evidencePriority: 4,
      removalEligible: false,
      placementOnly: true,
    },
  ];

  const result = matchDivisionObjects(divisions, rows, [], { includeDiagnostics: true });
  const connected = result.diagnostics.pipeline.connectedOwnershipEdges.find(
    (edge) =>
      edge.divisionId === 'moderate-branch' && edge.simulatorCandidateId === 'long-source-trunk'
  );

  assert.ok(connected);
  assert.equal(connected.metrics.alignmentMode, 'source-junction-ownership');
  assert.ok(connected.metrics.sourceConnectionGapMeters <= 0.1);
});

test('uses painted X-Plane marking geometry for placement without generating removals', () => {
  const division = divisionLine('xplane-marking-fallback', 'stopbar', [point(0, 0), point(20, 0)]);
  const marking = {
    ...simulatorLine('dsf-marking-only', 'stopbar', [point(0, 2), point(20, 2)]),
    sourceType: 'xplane-dsf-painted-line',
    sourceBasis: 'decoded-dsf-painted-marking',
    evidencePriority: 3,
    removalEligible: false,
    placementOnly: true,
  };
  const matching = matchDivisionObjects([division], [marking]);
  const output = buildDraftOutput(
    {
      meta: { simulator: 'xplane' },
      instances: [],
      lightRows: [marking],
      mustKeepZones: [],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(matching.matches.length, 1);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.placementOnlyMatches.length, 1);
  assert.equal(output.removals.length, 0);
  assert.equal(output.removalWarnings.length, 0);
});

test('does not generate polygon removers for exact X-Plane apt light strings', () => {
  const division = divisionLine('lead-xplane', 'lead_on', [point(20, 0), point(80, 0)]);
  const selected = {
    ...simulatorLine('xplane-selected', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
  };
  const overlappingTarget = {
    ...simulatorLine('xplane-overlap', 'taxi-centerline', [point(40, 1), point(60, 1)]),
    sourceType: 'xplane-apt-light-string',
  };
  const matching = matchDivisionObjects([division], [selected]);
  const output = buildDraftOutput(
    {
      meta: { simulator: 'xplane' },
      instances: [],
      lightRows: [selected, overlappingTarget],
      mustKeepZones: [
        {
          id: 'xplane-runway-grid-point',
          sourceType: 'xplane-runway-light-zone',
          geometryType: 'Point',
          point: point(50, 1),
          clearanceMeters: 1.5,
        },
      ],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 1);
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.removals.length, 0);
  assert.doesNotMatch(output.xml, /displayName="remove"/);
});

test('does not generate X-Plane removal geometry around explicit fixtures', () => {
  const division = divisionLine('lead-xplane', 'lead_on', [point(20, 0), point(80, 0)]);
  const selected = {
    ...simulatorLine('xplane-selected', 'taxi-centerline', [point(0, 1), point(100, 1)]),
    sourceType: 'xplane-apt-light-string',
  };
  const matching = matchDivisionObjects([division], [selected]);
  const output = buildDraftOutput(
    {
      meta: { simulator: 'xplane' },
      instances: [],
      lightRows: [selected],
      mustKeepZones: [
        {
          id: 'explicit-xplane-papi',
          sourceType: 'xplane-apt-lighting-object',
          geometryType: 'Point',
          point: point(50, 1),
          clearanceMeters: 1.5,
        },
      ],
    },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.matched.length, 1);
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.removals.length, 0);
  assert.doesNotMatch(output.xml, /displayName="remove"/);
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
  const division = divisionLine('lead-before-stopbar', 'lead_on', [point(100, 0), point(330, 0)]);
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

test('uses a BARS stopbar to trim reconstructed lead-on extension without a simulator stopbar', () => {
  const division = [
    divisionLine('bars-stopbar', 'stopbar', [point(50, 10), point(50, -10)]),
    divisionLine('lead-after-bars-stopbar', 'lead_on', [point(50, 0), point(100, 0)]),
  ];
  const row = inferredPlacementLine('sim-guidance', 'taxi-centerline', [
    point(0, 1),
    point(150, 1),
  ]);

  const result = matchDivisionObjects(division, [row]);
  const leadOn = result.matches.find((item) => item.division.id === 'lead-after-bars-stopbar');

  assert.ok(leadOn);
  assert.ok(Math.abs(leadOn.row.sourceRangeStartMeters - 50) < 0.2);
  assert.ok(Math.abs(leadOn.row.sourceRangeEndMeters - 150) < 0.2);
});

test('keeps overlapping reconstructed guidance for BARS lead-ons that share a trunk', () => {
  const division = [
    divisionLine('bars-stopbar', 'stopbar', [point(50, 10), point(50, -10)]),
    divisionLine('lead-short-branch', 'lead_on', [point(50, 0), point(150, 0)]),
    divisionLine('lead-long-branch', 'lead_on', [point(50, 0), point(150, 0), point(200, 50)]),
  ];
  const row = inferredPlacementLine('sim-shared-trunk', 'taxi-centerline', [
    point(0, 1),
    point(150, 1),
    point(200, 51),
  ]);

  const result = matchDivisionObjects(division, [row]);
  const short = result.matches.find((item) => item.division.id === 'lead-short-branch');
  const long = result.matches.find((item) => item.division.id === 'lead-long-branch');

  assert.ok(short);
  assert.ok(long);
  assert.ok(Math.abs(short.row.sourceRangeStartMeters - 50) < 0.2);
  assert.ok(Math.abs(long.row.sourceRangeStartMeters - 50) < 0.2);
  assert.ok(short.row.sourceRangeEndMeters > 140);
  assert.ok(long.row.sourceRangeEndMeters > 210);
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

test('splits reconstructed lead-ons where their shared row leaves the BGL runway corridor', () => {
  const division = [
    divisionLine('entry-stopbar', 'stopbar', [point(-220, 60), point(-180, 140)]),
    divisionLine('runway-entry', 'lead_on', [point(-200, 100), point(-120, 60)]),
    divisionLine('runway-exit', 'lead_on', [point(300, 0), point(400, 60)]),
  ];
  const simulator = inferredPlacementLine('sim-runway-through-row', 'taxi-centerline', [
    point(-200, 100),
    point(0, 0),
    point(300, 0),
    point(400, 60),
  ]);
  const exitJunction = inferredPlacementLine('sim-exit-junction', 'taxi-centerline', [
    point(350, 30),
    point(350, 100),
  ]);
  const runwayCenter = point(100, 0);
  const runway = {
    id: 'bgl-runway-test',
    sourceType: 'bgl-runway',
    lat: runwayCenter.lat,
    lon: runwayCenter.lng,
    heading: 90,
    lengthMeters: 600,
    widthMeters: 40,
  };

  const result = matchDivisionObjects(division, [simulator, exitJunction], [], {
    includeDiagnostics: true,
    runways: [runway],
  });
  const entry = result.matches.find((match) => match.division.id === 'runway-entry');
  const exit = result.matches.find((match) => match.division.id === 'runway-exit');
  const allocation = result.diagnostics.pipeline.allocationEvaluations.find(
    (evaluation) => evaluation.divisionId === 'runway-exit'
  );

  assert.ok(entry);
  assert.ok(exit);
  assert.ok(Math.abs(entry.row.sourceRangeEndMeters - exit.row.sourceRangeStartMeters) < 0.01);
  assert.ok(exit.row.sourceRangeStartMeters > 550);
  assert.equal(allocation.partitionBoundaries[0].basis, 'runway-corridor-transition');
  assert.equal(allocation.partitionBoundaries[0].runwayId, 'bgl-runway-test');
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
  assert.equal(
    result.unmatched.some((item) => item.division.id === 'lead-weak'),
    true
  );
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
      straightMatches[0].row.sourceRangeEndMeters - straightMatches[1].row.sourceRangeStartMeters
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
  const adjacentMatch = result.matches.find((match) => match.division.id === 'lead-adjacent');

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
    inferredPlacementLine('secondary-own-row', 'taxi-centerline', [point(0, 0.4), point(40, 11.9)]),
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

test('does not let a loop-back subsection split a row from its complete owner', () => {
  const division = [
    divisionLine('loop-back-owner', 'lead_on', [
      point(0, 0),
      point(30, 0),
      point(30, 40),
      point(70, 40),
    ]),
    divisionLine('complete-row-owner', 'lead_on', [point(0, 0), point(80, 0)]),
  ];
  const rows = [
    inferredPlacementLine('loop-back-own-row', 'taxi-centerline', [
      point(0, 0.3),
      point(30, 0.3),
      point(30, 40.3),
      point(70, 40.3),
    ]),
    inferredPlacementLine('shared-neighbour-row', 'taxi-centerline', [
      point(0, 0.4),
      point(80, 0.4),
    ]),
  ];

  const result = matchDivisionObjects(division, rows);
  const sharedOwners = result.matches
    .filter(
      (match) =>
        (match.simulatorGroupId ?? match.row.sourceParentRowId ?? match.row.id) ===
        'shared-neighbour-row'
    )
    .map((match) => match.division.id);
  const loopBackSources = result.matches
    .filter((match) => match.division.id === 'loop-back-owner')
    .map((match) => match.simulatorGroupId ?? match.row.sourceParentRowId ?? match.row.id);

  assert.deepEqual(sharedOwners, ['complete-row-owner']);
  assert.deepEqual(loopBackSources, ['loop-back-own-row']);
  assert.equal(result.unmatched.length, 0);
});

test('keeps the real YPPH A row with BARS_BQ8C4 instead of giving a branch to BARS_2TSXP', () => {
  const lightRows = sourceBackedFixtureRows(ypphOwnershipRegression.coLocatedLightRows);

  const result = matchDivisionObjects(ypphOwnershipRegression.divisions, lightRows);
  const sourcesByDivision = new Map();
  for (const match of result.matches) {
    const sources = sourcesByDivision.get(match.division.id) ?? [];
    sources.push(match.row.sourceParentRowId ?? match.row.id);
    sourcesByDivision.set(match.division.id, sources);
  }

  assert.deepEqual(sourcesByDivision.get('BARS_BQ8C4')?.sort(), [
    '1b74ff160b6ae2c2',
    '6515a82a851b69e1',
  ]);
  assert.deepEqual(sourcesByDivision.get('BARS_2TSXP')?.sort(), [
    '0c6eada692118f7f',
    '172a2fd795278f3e',
  ]);
});

test('leaves the real YPPH BARS_QHIG2 object manual when nearby rows only touch its ends', () => {
  const lightRows = sourceBackedFixtureRows(ypphOwnershipRegression.nearbyCoLocatedLightRows);

  const result = matchDivisionObjects([ypphOwnershipRegression.noLightDivision], lightRows);

  assert.equal(result.matches.length, 0);
  assert.deepEqual(
    result.unmatched.map((item) => item.division.id),
    ['BARS_QHIG2']
  );
});

test('keeps the real YPPH V trunks with their stopbar-anchored division owners', () => {
  const lightRows = ypphOwnershipRegression.vOwnershipLightRows.map((row) => ({
    ...row,
    sourceFile: 'apt.dat',
    sourceType: 'xplane-apt-light-string',
    confidence: 0.98,
  }));

  const result = matchDivisionObjects(ypphOwnershipRegression.vOwnershipDivisions, lightRows, [], {
    includeDiagnostics: true,
  });
  const ownersFor = (sourceId) =>
    result.matches
      .filter((match) => (match.row.sourceParentRowId ?? match.row.id) === sourceId)
      .map((match) => match.division.id);

  assert.deepEqual(ownersFor('840e299c2d4f1954'), ['BARS_247KA']);
  assert.deepEqual(new Set(ownersFor('ca5297eab19e7684')), new Set(['BARS_61YJ4', 'BARS_KUGS8']));
  assert.deepEqual(ownersFor('bsbm1-own-row'), ['BARS_BSBM1']);
  assert.equal(
    result.unmatched.some((item) => item.division.id === 'BARS_KUGS8'),
    false
  );
  const northVMatch = result.matches.find(
    (match) =>
      match.division.id === 'BARS_61YJ4' &&
      (match.row.sourceParentRowId ?? match.row.id) === 'ca5297eab19e7684'
  );
  assert.ok(northVMatch);
  assert.ok((northVMatch.row.sourceRangeStartMeters ?? 0) <= 0.01);
  assert.ok(
    Math.abs(
      (northVMatch.row.sourceRangeEndMeters ?? 0) - (northVMatch.row.sourceParentLengthMeters ?? 0)
    ) <= 0.01
  );
  assert.deepEqual(
    northVMatch.replacementRow.vertices,
    lightRows.find((row) => row.id === 'ca5297eab19e7684').vertices
  );
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === 'BARS_BSBM1' &&
        evaluation.simulatorRowId === '840e299c2d4f1954' &&
        evaluation.outcome === 'suppressed-by-stopbar-anchored-continuation-owner' &&
        evaluation.preferredDivisionId === 'BARS_247KA'
    )
  );
});

test('keeps connected X-Plane lead-on owners on a straight stopbar-linked row', () => {
  const divisions = [
    divisionLine('straight-continuation', 'lead_on', [point(0, 0), point(145, 0)]),
    divisionLine('straight-stopbar-owner', 'lead_on', [point(145, 0), point(200, 0)]),
    divisionLine('straight-stopbar', 'stopbar', [point(200, 10), point(200, -10)]),
  ];
  const row = {
    ...simulatorLine('straight-xplane-row', 'taxi-centerline', [
      point(0, 1),
      point(145, 1),
      point(200, 1),
    ]),
    sourceType: 'xplane-apt-light-string',
  };

  const result = matchDivisionObjects(divisions, [row]);
  const owners = result.matches
    .filter((match) => (match.row.sourceParentRowId ?? match.row.id) === row.id)
    .sort(
      (left, right) =>
        (left.row.sourceRangeStartMeters ?? 0) - (right.row.sourceRangeStartMeters ?? 0)
    );

  assert.deepEqual(
    owners.map((match) => match.division.id),
    ['straight-continuation', 'straight-stopbar-owner']
  );
  assert.ok(owners[0].row.sourceRangeEndMeters + 0.01 >= owners[1].row.sourceRangeStartMeters);
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
  const shortLayer = simulatorLine('sim-short-layer', 'lead-on', [point(0, 0.4), point(8, 0.4)]);

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

test('writes compact X-Plane selectors and omits removal polygons', () => {
  const division = divisionLine('xplane-lead-on', 'lead_on', [point(25, 0), point(75, 0)]);
  const row = {
    ...simulatorLine('xplane-source', 'lead-on', [point(25, 0), point(75, 0)]),
    sourceType: 'xplane-apt-light-string',
    sourceFeatureId: '0123456789abcdef',
    sourceRunIndex: 2,
    lightCode: 107,
    sourceParentRowId: 'xplane-parent',
    sourceRangeStartMeters: 25,
    sourceRangeEndMeters: 75,
    sourceParentLengthMeters: 100,
  };
  const matching = {
    matches: [{ division, row, score: 1 }],
    unmatched: [],
    mergedSimulatorRows: [],
    duplicateDivisionLeadOns: 0,
    duplicateSimulatorLeadOns: 0,
  };

  const output = buildDraftOutput(
    { meta: { simulator: 'xplane' }, instances: [], lightRows: [row], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.removals.length, 0);
  assert.equal(output.removalWarnings.length, 0);
  assert.match(output.xml, /simulator="xplane"/);
  assert.match(
    output.xml,
    /<Light feature="0123456789abcdef" code="107" run="2" start="0\.250000" end="0\.750000"\/>/
  );
  assert.doesNotMatch(output.xml, /displayName="remove"/);
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
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, matching, {
    icao: 'TEST',
    altitude: 0,
  });

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
  const crossing = simulatorLine('sim-north-south', 'taxi-centerline', [
    point(40, -30),
    point(40, 30),
  ]);
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
    parallel.vertices.every((vertex) => !removalRings.some((ring) => pointInPolygon(vertex, ring)))
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
  assert.ok(output.geojson.features.some((feature) => feature.properties.featureType === 'unsafe'));
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

  assert.deepEqual(
    output.removalWarnings.map((item) => item.division.id),
    ['first']
  );
  assert.deepEqual(
    output.removalApproved.map((match) => match.division.id),
    ['second']
  );
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

function sourceBackedFixtureRows(groups) {
  return groups.flatMap((group) =>
    group.ids.map((id) => ({
      id,
      sourceFile: 'YPPH_PLC.bgl',
      sourceType: 'bgl-airport-light-row',
      classification: 'lead-on',
      confidence: 0.82,
      vertices: group.vertices,
    }))
  );
}
