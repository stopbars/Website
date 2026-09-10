import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftOutput } from './draft-output.js';
import {
  DRAFT_DIAGNOSTIC_SCHEMA,
  buildGenerationDiagnostic,
  diagnosticJsonBlob,
} from './diagnostics.js';
import {
  dominantFullShapePartitionBoundary,
  exactPlacementBranchPartitionBoundary,
  exactPlacementFullShapeJoinPartition,
  instanceSupportedJunctionPartitionBoundary,
  isSourceBackedJunctionStopbarCell,
  matchDivisionObjects,
  scorePolylineMatch,
} from './matching.js';
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

test('silently keeps the first bidirectional Division object when an exact duplicate is reversed', () => {
  const coordinates = [point(0, 0), point(30, 0)];
  const divisions = [
    divisionLine('BARS_QE697', 'taxiway', coordinates),
    divisionLine('BARS_MHSWO', 'taxiway', [...coordinates].reverse()),
  ];
  for (const division of divisions) division.directionality = 'bi-directional';
  const simulator = simulatorLine('duplicate-source-row', 'taxi-centerline', [
    point(0, 0.5),
    point(30, 0.5),
  ]);

  const result = matchDivisionObjects(divisions, [simulator], [], { includeDiagnostics: true });

  assert.deepEqual(
    result.matches.map((match) => match.division.id),
    ['BARS_QE697']
  );
  assert.equal(result.unmatched.length, 0);
  assert.deepEqual(
    result.diagnostics.divisionObjects.map((division) => division.id),
    ['BARS_QE697']
  );
});

test('keeps one continuous guidance row when its lateral offset crosses the mean-distance limit', () => {
  const division = divisionLine('offset-lead-on', 'lead_on', [
    point(150, 3),
    point(140, 3),
    point(100, 4.5),
    point(95, 5.5),
    point(50, 5.5),
    point(45, 4.5),
    point(0, 3),
    point(-20, 3),
  ]);
  const simulator = simulatorLine('continuous-centerline', 'taxi-centerline', [
    point(0, 0),
    point(140, 0),
  ]);

  const result = matchDivisionObjects([division], [simulator], [], {
    includeDiagnostics: true,
  });

  assert.equal(result.unmatched.length, 0);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'continuous-centerline');
  assert.ok(result.diagnostics.compatibleRowCandidateEvaluations[0].section.lengthMeters > 139);
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

test('partitions one long compiled EGLL stopbar row between its two Division stopbars', () => {
  const divisions = [
    divisionLine('BARS_GI1O7', 'stopbar', [
      { lat: 51.4763576, lng: -0.4610237 },
      { lat: 51.4763582, lng: -0.4607519 },
      { lat: 51.4763584, lng: -0.4606896 },
      { lat: 51.4763592, lng: -0.4603722 },
    ]),
    divisionLine('BARS_K95ZH', 'stopbar', [
      { lat: 51.4763607, lng: -0.4600855 },
      { lat: 51.4763615, lng: -0.4599067 },
      { lat: 51.476362, lng: -0.4597993 },
      { lat: 51.4763632, lng: -0.4595228 },
    ]),
  ];
  const simulator = simulatorLine('71025e10bc252927', 'stopbar', [
    { lat: 51.476327776908875, lng: -0.4610055685043335 },
    { lat: 51.476332135498524, lng: -0.45951738953590393 },
  ]);

  const result = matchDivisionObjects(divisions, [simulator], [], { includeDiagnostics: true });
  const matches = new Map(result.matches.map((match) => [match.division.id, match]));
  const output = buildDraftOutput(
    { instances: [], lightRows: [simulator], mustKeepZones: [] },
    result,
    { icao: 'EGLL', altitude: 0 }
  );

  assert.equal(result.unmatched.length, 0);
  assert.deepEqual([...matches.keys()].sort(), ['BARS_GI1O7', 'BARS_K95ZH']);
  assert.equal(matches.get('BARS_GI1O7').row.sourceParentRowId, simulator.id);
  assert.equal(matches.get('BARS_K95ZH').row.sourceParentRowId, simulator.id);
  assert.ok(matches.get('BARS_GI1O7').row.sourceRangeEndMeters < 50);
  assert.ok(matches.get('BARS_K95ZH').row.sourceRangeStartMeters > 55);
  assert.ok(
    matches.get('BARS_GI1O7').row.sourceRangeEndMeters <
      matches.get('BARS_K95ZH').row.sourceRangeStartMeters
  );
  assert.deepEqual(output.replacements.map((replacement) => replacement.division.id).sort(), [
    'BARS_GI1O7',
    'BARS_K95ZH',
  ]);
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
});

test('keeps a tightly aligned compact compiled EGLL row as a taxiway match', () => {
  const division = divisionLine('BARS_FOBN8', 'taxiway', [
    { lat: 51.4763582, lng: -0.4607519 },
    { lat: 51.4763787, lng: -0.4607642 },
    { lat: 51.4764477, lng: -0.4608016 },
  ]);
  const simulator = simulatorLine('4c4297093895664c', 'taxi-centerline', [
    { lat: 51.47640086710453, lng: -0.4607570171356201 },
    { lat: 51.47637404501438, lng: -0.46074360609054565 },
  ]);

  const result = matchDivisionObjects([division], [simulator], [], { includeDiagnostics: true });
  const output = buildDraftOutput(
    { instances: [], lightRows: [simulator], mustKeepZones: [] },
    result,
    { icao: 'EGLL', altitude: 0 }
  );

  assert.equal(result.unmatched.length, 0);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].division.id, division.id);
  assert.equal(result.matches[0].row.id, simulator.id);
  assert.equal(result.matches[0].metrics.alignmentMode, 'full-shape');
  assert.equal(output.replacements.length, 1);
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
});

test('returns the rejected EGLL endpoint partition to the complete taxiway owner', () => {
  const divisions = [
    divisionLine('BARS_3C7SO', 'taxiway', [
      { lat: 51.4758274, lng: -0.4700121 },
      { lat: 51.4758131, lng: -0.4698887 },
      { lat: 51.4757903, lng: -0.4697856 },
      { lat: 51.4757526, lng: -0.4696905 },
      { lat: 51.4756962, lng: -0.4695892 },
    ]),
    divisionLine('BARS_3MFLA', 'taxiway', [
      { lat: 51.4758725, lng: -0.4698332 },
      { lat: 51.4758227, lng: -0.469743 },
      { lat: 51.4757784, lng: -0.4696828 },
      { lat: 51.4756962, lng: -0.4695892 },
    ]),
  ];
  const simulator = {
    ...simulatorLine('f51d6cfc0d4266ec', 'taxi-centerline', [
      { lat: 51.47581983357668, lng: -0.46994179487228394 },
      { lat: 51.475810781121254, lng: -0.4698827862739563 },
      { lat: 51.475795693695545, lng: -0.4698161780834198 },
      { lat: 51.47577993571758, lng: -0.4697558283805847 },
      { lat: 51.47576283663511, lng: -0.4697084426879883 },
      { lat: 51.4757427200675, lng: -0.46966463327407837 },
      { lat: 51.47571623325348, lng: -0.46961814165115356 },
      { lat: 51.47569578140974, lng: -0.46958819031715393 },
    ]),
    snapToVertices: true,
  };

  const result = matchDivisionObjects(divisions, [simulator], [], { includeDiagnostics: true });
  const completeOwner = result.matches.find((match) => match.division.id === 'BARS_3C7SO');

  assert.ok(completeOwner);
  assert.equal(
    completeOwner.row.id,
    simulator.id,
    JSON.stringify(result.diagnostics.pipeline.allocationEvaluations)
  );
  assert.equal(completeOwner.row.sourceParentRowId, undefined);
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === 'BARS_3C7SO' &&
        evaluation.outcome === 'reallocated-rejected-endpoint-partition'
    )
  );
});

test('does not split a long compiled stopbar row when its parallel offset exceeds the guard', () => {
  const division = divisionLine('guarded-stopbar', 'stopbar', [point(20, 0), point(60, 0)]);
  const simulator = simulatorLine('guarded-long-stopbar', 'stopbar', [point(0, 6), point(100, 6)]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('does not allocate a compact source row when its offset exceeds the tight guard', () => {
  const division = divisionLine('guarded-compact-row', 'taxiway', [point(0, 0), point(10, 0)]);
  const simulator = simulatorLine('offset-compact-row', 'taxi-centerline', [
    point(3, 4),
    point(6, 4),
  ]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched.length, 1);
});

test('preserves the existing EGLL long-row subsection match', () => {
  const division = divisionLine('BARS_8MREY', 'taxiway', [
    { lat: 51.4653017, lng: -0.4343593 },
    { lat: 51.4652279, lng: -0.4343697 },
    { lat: 51.4651814, lng: -0.4343865 },
    { lat: 51.4651314, lng: -0.4344225 },
    { lat: 51.4650856, lng: -0.4344708 },
    { lat: 51.4650452, lng: -0.4345301 },
    { lat: 51.4650112, lng: -0.4345991 },
    { lat: 51.4649844, lng: -0.4346758 },
    { lat: 51.4649656, lng: -0.4347585 },
    { lat: 51.4649553, lng: -0.4348448 },
    { lat: 51.46495383519256, lng: -0.4354259526433116 },
  ]);
  const simulator = simulatorLine('8d5948a6c855bcf3', 'taxi-centerline', [
    { lat: 51.46495286375284, lng: -0.43718934059143066 },
    { lat: 51.46495621651411, lng: -0.4358670115470886 },
    { lat: 51.46495956927538, lng: -0.43493494391441345 },
    { lat: 51.46496191620827, lng: -0.43482765555381775 },
    { lat: 51.46497130393982, lng: -0.4347503185272217 },
    { lat: 51.4649860560894, lng: -0.43468013405799866 },
    { lat: 51.46500717848539, lng: -0.43460994958877563 },
    { lat: 51.46503668278456, lng: -0.4345397651195526 },
    { lat: 51.46507054567337, lng: -0.43448343873023987 },
    { lat: 51.46511312574148, lng: -0.4344324767589569 },
    { lat: 51.46515402942896, lng: -0.43439894914627075 },
    { lat: 51.4651932567358, lng: -0.4343739151954651 },
    { lat: 51.46523047238588, lng: -0.4343573749065399 },
    { lat: 51.46527539938688, lng: -0.43434619903564453 },
  ]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.equal(result.unmatched.length, 0);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].division.id, division.id);
  assert.equal(result.matches[0].row.sourceParentRowId, simulator.id);
  assert.ok(result.matches[0].row.sourceRangeStartMeters > 115);
  assert.ok(Math.abs(result.matches[0].row.sourceRangeEndMeters - 216.162) < 0.05);
});

test('preserves one replacement while removing both co-located EGLL source rows', () => {
  const division = divisionLine('BARS_H4LZS', 'taxiway', [
    { lat: 51.4759477, lng: -0.4602124 },
    { lat: 51.4759454, lng: -0.4607389 },
  ]);
  const coordinates = [
    { lat: 51.47594219509293, lng: -0.46176910400390625 },
    { lat: 51.47594355245184, lng: -0.46142226085066795 },
    { lat: 51.475946893642856, lng: -0.4607450030744076 },
    { lat: 51.475947937765, lng: -0.460314005613327 },
    { lat: 51.475948251001626, lng: -0.4601106606423855 },
    { lat: 51.47594992159699, lng: -0.4597378335893154 },
    { lat: 51.47594992159699, lng: -0.45970916748046875 },
  ];
  const rows = [
    simulatorLine('5374c7b63c5ff003', 'taxi-centerline', coordinates),
    simulatorLine('6e31323e9d3722bb', 'taxi-centerline', coordinates),
  ];

  const matching = matchDivisionObjects([division], rows);
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, matching, {
    icao: 'EGLL',
    altitude: 0,
  });

  assert.equal(matching.unmatched.length, 0);
  assert.equal(matching.matches.length, 2);
  assert.equal(new Set(matching.matches.map((match) => match.simulatorGroupId)).size, 1);
  assert.ok(
    matching.matches.every((match) => match.replacementRow.sourceType === 'merged-simulator-rows')
  );
  assert.equal(output.replacements.length, 1);
  assert.equal(output.removalApproved.length, 2);
  assert.deepEqual(output.removalApproved.map((match) => match.row.sourceParentRowId).sort(), [
    '5374c7b63c5ff003',
    '6e31323e9d3722bb',
  ]);
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
});

test('preserves the exact EGLL curved source-row match', () => {
  const division = divisionLine('BARS_7R7G9', 'taxiway', [
    { lat: 51.4756428, lng: -0.4574203 },
    { lat: 51.4757113, lng: -0.4574439 },
    { lat: 51.4757602, lng: -0.4574753 },
    { lat: 51.4758098, lng: -0.4575236 },
    { lat: 51.4758692, lng: -0.4576167 },
    { lat: 51.4758944, lng: -0.4576706 },
    { lat: 51.4759202, lng: -0.4577536 },
    { lat: 51.4759328, lng: -0.4578154 },
    { lat: 51.4759526, lng: -0.4579183 },
  ]);
  const simulator = simulatorLine('aef44c85b9e15190', 'taxi-centerline', [
    { lat: 51.4756376517489, lng: -0.45740340549069386 },
    { lat: 51.47566024214029, lng: -0.45740917325019836 },
    { lat: 51.4757014811039, lng: -0.4574216902256012 },
    { lat: 51.47573634982109, lng: -0.45744091272354126 },
    { lat: 51.47576283663511, lng: -0.4574587941169739 },
    { lat: 51.4757926762104, lng: -0.45748695731163025 },
    { lat: 51.47582586854696, lng: -0.45752495527267456 },
    { lat: 51.47585302591324, lng: -0.45756205916404724 },
    { lat: 51.47587716579437, lng: -0.45760542154312134 },
    { lat: 51.47590097039938, lng: -0.4576599597930908 },
    { lat: 51.47592008113861, lng: -0.4577144980430603 },
    { lat: 51.47593583911657, lng: -0.45777395367622375 },
    { lat: 51.47595025599003, lng: -0.4578593373298645 },
  ]);

  const matching = matchDivisionObjects([division], [simulator]);
  const output = buildDraftOutput(
    { instances: [], lightRows: [simulator], mustKeepZones: [] },
    matching,
    { icao: 'EGLL', altitude: 0 }
  );

  assert.equal(matching.unmatched.length, 0);
  assert.equal(matching.matches.length, 1);
  assert.equal(
    matching.matches[0].row.sourceParentRowId ?? matching.matches[0].row.id,
    simulator.id
  );
  assert.equal(matching.matches[0].metrics.alignmentMode, 'full-shape');
  assert.ok(matching.matches[0].score > 0.9);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.removalApproved.length, 1);
  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
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
  const simulatorFeatures = output.simulatorGeojson.features;
  assert.deepEqual(
    simulatorFeatures
      .filter((feature) => feature.properties.featureType === 'simulator-source')
      .map((feature) => feature.properties.simulatorRowId)
      .sort(),
    ['sim-high', 'sim-low']
  );
  assert.equal(
    simulatorFeatures.find((feature) => feature.properties.featureType === 'simulator-merged')
      .properties.simulatorRowId,
    result.mergedSimulatorRows[0].id
  );
});

test('keeps every Melbourne centreline layer inside the lead-on stopbar boundary', () => {
  const divisions = [
    divisionLine('BARS_H7NMQ', 'lead_on', [point(0, 0), point(108.4, 0)]),
    {
      ...divisionLine('melbourne-lead-on-stopbar', 'stopbar', [
        point(110.8, -10),
        point(110.8, 10),
      ]),
      name: 'BARS_H7NMQ',
    },
  ];
  const rows = [
    simulatorLine('melbourne-yellow', 'taxi-centerline', [point(0, 0.8), point(142.8, 0.8)]),
    simulatorLine('melbourne-green', 'taxi-centerline', [point(7, 0.9), point(135.7, 0.9)]),
    simulatorLine('melbourne-green-nomesh', 'taxi-centerline', [point(93, 0.7), point(0, 0.7)]),
    simulatorLine('melbourne-stopbar', 'stopbar', [point(110.8, -10), point(110.8, 10)]),
  ].map((row) => ({ ...row, spacing: 60.96, snapToVertices: true }));

  const matching = matchDivisionObjects(divisions, rows);
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, matching, {
    icao: 'YMML',
    altitude: 0,
  });
  const leadOnMatches = matching.matches.filter((match) => match.division.id === 'BARS_H7NMQ');

  assert.equal(leadOnMatches.length, 3);
  assert.ok(
    leadOnMatches.every((match) =>
      match.row.sourceRangeEndMeters === undefined
        ? match.row.vertices.every((vertex) => vertex.lon <= point(110.8, 0).lng)
        : match.row.sourceRangeEndMeters <= 110.9
    )
  );
  assert.equal(output.replacements.length, 2);
  assert.equal(output.removalApproved.length, 4);
  const replacement = output.replacements.find(
    (candidate) => candidate.division.id === 'BARS_H7NMQ'
  );
  const preview = output.geojson.features.find(
    (feature) => feature.properties.featureType === 'matched'
  );
  assert.ok(Math.abs(replacement.row.vertices[0].lon - point(0, 0).lng) < 0.01);
  assert.ok(replacement.row.vertices.at(-1).lon <= point(110.9, 0).lng);
  assert.ok(preview.geometry.coordinates.at(-1)[0] - preview.geometry.coordinates[0][0] > 0.001);
});

test('preserves the reported YPPH D source rows in a reduced fixture', () => {
  const divisions = [
    {
      id: 'BARS_S4UAP',
      type: 'lead_on',
      name: 'D',
      coordinates: [
        { lat: -31.93498694894291, lng: 115.96542460843924 },
        { lat: -31.93538102449974, lng: 115.96640629693866 },
      ],
    },
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
  const vertices = [
    { lat: -31.934978663921356, lon: 115.96541449427605 },
    { lat: -31.93513724952936, lon: 115.96580564975739 },
    { lat: -31.935148313641548, lon: 115.9658432006836 },
    { lat: -31.93516205996275, lon: 115.96590131521225 },
    { lat: -31.935170106589794, lon: 115.965975522995 },
    { lat: -31.935172118246555, lon: 115.9660305082798 },
    { lat: -31.935170777142048, lon: 115.96609219908714 },
    { lat: -31.935164406895638, lon: 115.96615254878998 },
    { lat: -31.9351577013731, lon: 115.96619859337807 },
    { lat: -31.93514697253704, lon: 115.96625223755836 },
    { lat: -31.93512450903654, lon: 115.9663474559784 },
    { lat: -31.935105733573437, lon: 115.96642345190048 },
    { lat: -31.935084611177444, lon: 115.96649408340454 },
    { lat: -31.93505946546793, lon: 115.96657320857048 },
    { lat: -31.935035325586796, lon: 115.96663847565651 },
    { lat: -31.935007497668266, lon: 115.96670776605606 },
    { lat: -31.93497095257044, lon: 115.96679002046585 },
    { lat: -31.93493440747261, lon: 115.96686467528343 },
    { lat: -31.93488746881485, lon: 115.96695721149445 },
    { lat: -31.934322863817215, lon: 115.96805334091187 },
  ];
  const rows = [
    {
      ...simulatorLine('b408ad819d42b7e4', 'lead-on', vertices),
      vertices,
      spacing: 7,
      snapToVertices: true,
    },
    {
      ...simulatorLine('ce40ac38f0a3387a', 'lead-on', vertices),
      vertices,
      spacing: 14,
      snapToVertices: true,
    },
    simulatorLine('ypph-d-straight-continuation', 'lead-on', divisions[0].coordinates),
  ];

  const result = matchDivisionObjects(divisions, rows, [], { includeDiagnostics: true });
  const targetMatches = result.matches.filter((match) => match.division.id === 'BARS_3LHZ2');
  const previousMatches = result.matches.filter((match) => match.division.id === 'BARS_S4UAP');

  assert.equal(targetMatches.length, 2);
  assert.equal(previousMatches.length, 1);
  assert.ok(targetMatches.every((match) => match.row.sourceParentRowId));
});

test('hands the YPPH D overlap to its dominant full-shape owner at the source vertex', () => {
  const candidate = {
    raw: {
      sourceType: 'merged-simulator-rows',
      snapToVertices: true,
    },
    projected: [0, 40.953, 44.709, 50.408, 57.476, 62.675, 68.505, 74.25, 277.942].map((x) => ({
      x,
      y: 0,
    })),
  };
  const left = {
    section: {
      projectionStart: 1.26,
      projectionEnd: 58.613,
      projectionCenter: 30.566,
    },
    metrics: {
      alignmentMode: 'source-contained',
      score: 0.7876,
      divisionToSourceCoverage: 0.636,
    },
  };
  const right = {
    section: {
      projectionStart: 41.871,
      projectionEnd: 115.332,
      projectionCenter: 78.602,
    },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.9744,
      divisionToSourceCoverage: 1,
    },
  };

  assert.ok(Math.abs(dominantFullShapePartitionBoundary(left, right, candidate) - 40.953) < 0.001);
});

test('hands an exact-placement gap to the full-shape owner at the branch-side source vertex', () => {
  const candidate = {
    raw: {
      inferred: true,
      sourceType: 'inferred-bgl-placement-row',
      reconstructMode: 'exact-bgl-placement-control-points',
      snapToVertices: true,
    },
    projected: [0, 52, 58.49, 64.99, 97.55, 398.316, 483.762, 624.667].map((x) => ({
      x,
      y: 0,
    })),
  };
  const branch = {
    section: {
      projectionStart: 63.984,
      projectionEnd: 96.458,
      projectionCenter: 79.784,
    },
    metrics: {
      alignmentMode: 'composite-section',
      score: 0.8391,
      divisionToSourceCoverage: 1,
      sourceToDivisionCoverage: 1,
      angleDifference: 14.5,
    },
  };
  const fullShape = {
    section: {
      projectionStart: 398.316,
      projectionEnd: 482.512,
      projectionCenter: 440.414,
    },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.9783,
      divisionToSourceCoverage: 1,
      sourceToDivisionCoverage: 1,
      angleDifference: 0.3,
    },
  };

  assert.equal(exactPlacementBranchPartitionBoundary(branch, fullShape, candidate), 58.49);
  assert.equal(
    exactPlacementBranchPartitionBoundary(
      { ...branch, metrics: { ...branch.metrics, angleDifference: 8 } },
      fullShape,
      candidate
    ),
    undefined
  );
});

test('hands the YSSY A5 split over at its source junction instead of the projection midpoint', () => {
  const candidate = {
    raw: {
      id: 'e5e618ddbf23a791',
      inferred: true,
      sourceType: 'inferred-bgl-placement-row',
      reconstructMode: 'exact-bgl-placement-control-points',
    },
  };
  const left = {
    division: { raw: { id: 'BARS_NPKCG', type: 'lead_on' } },
    section: { projectionStart: 119.015, projectionEnd: 190.029 },
    metrics: { alignmentMode: 'source-instance-section' },
  };
  const right = {
    division: { raw: { id: 'BARS_4XT1Q', type: 'lead_on' } },
    section: { projectionStart: 262.301, projectionEnd: 286.075 },
    metrics: { alignmentMode: 'composite-section' },
  };

  const boundary = instanceSupportedJunctionPartitionBoundary(left, right, candidate, [
    { along: 117.295, kind: 'stopbar', source: 'division' },
    { along: 197.406, kind: 'junction', source: 'simulator' },
  ]);

  assert.equal(boundary, 197.406);
});

test('uses one source vertex where a weaker full-shape lead-on joins the row', () => {
  const stations = [
    0, 101, 160, 436, 442.51, 449.02, 455.54, 462.06, 475.08, 488.1, 494.6, 501.09, 507.62, 514.14,
    520.62, 527.1, 549.5, 644.39,
  ];
  const candidate = {
    raw: {
      inferred: true,
      sourceType: 'inferred-bgl-placement-row',
      reconstructMode: 'exact-bgl-placement-control-points',
      snapToVertices: true,
    },
    projected: stations.map((x) => ({ x, y: 0 })),
  };
  const dominant = {
    division: {
      raw: { type: 'lead_on' },
      projected: [
        { x: 101, y: 1 },
        { x: 160, y: 1 },
      ],
    },
    section: { projectionStart: 102.74, projectionEnd: 159.82, projectionCenter: 131.09 },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.918,
      divisionToSourceCoverage: 1,
      sourceToDivisionCoverage: 1,
    },
  };
  const weaker = {
    division: {
      raw: { type: 'lead_on' },
      projected: [
        { x: 436, y: 9 },
        { x: 442.51, y: 6 },
        { x: 449.02, y: 8 },
        { x: 455.54, y: 14 },
        { x: 475.08, y: 32 },
        { x: 488.1, y: 2.7 },
        { x: 494.6, y: 2.2 },
        { x: 501.09, y: 1.8 },
        { x: 507.62, y: 1.4 },
        { x: 514.14, y: 0.6 },
        { x: 520.62, y: 0.8 },
        { x: 527.1, y: 1.7 },
        { x: 549.5, y: 2 },
        { x: 644.39, y: 2 },
      ],
    },
    section: { projectionStart: 455.95, projectionEnd: 642.9, projectionCenter: 549.5 },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.795,
      divisionToSourceCoverage: 0.97,
      sourceToDivisionCoverage: 1,
    },
  };

  assert.deepEqual(exactPlacementFullShapeJoinPartition(dominant, weaker, candidate), {
    boundary: 501.09,
  });
  assert.equal(
    exactPlacementFullShapeJoinPartition(
      { ...dominant, metrics: { ...dominant.metrics, score: 0.89 } },
      weaker,
      candidate
    ),
    undefined
  );
});

test('splits a curved exact-placement join halfway along its shared straight', () => {
  const candidate = {
    raw: {
      inferred: true,
      sourceType: 'inferred-bgl-placement-row',
      reconstructMode: 'exact-bgl-placement-control-points',
      snapToVertices: true,
    },
    projected: [
      { x: 0, y: -40 },
      { x: 20, y: -20 },
      { x: 40, y: 0 },
      { x: 60, y: 0 },
      { x: 80, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 0 },
      { x: 140, y: 0 },
      { x: 160, y: 0 },
      { x: 175, y: 5 },
      { x: 185, y: 15 },
      { x: 190, y: 30 },
      { x: 190, y: 50 },
      { x: 190, y: 70 },
      { x: 190, y: 90 },
      { x: 190, y: 110 },
    ],
  };
  const dominant = {
    division: {
      raw: { type: 'lead_on' },
      projected: [
        { x: 60, y: 1 },
        { x: 110, y: 1 },
      ],
    },
    section: { projectionStart: 60, projectionEnd: 110, projectionCenter: 85 },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.93,
      divisionToSourceCoverage: 1,
      sourceToDivisionCoverage: 1,
    },
  };
  const weaker = {
    division: {
      raw: { type: 'lead_on' },
      projected: candidate.projected.slice(9).map((point) => ({ ...point, x: point.x + 1 })),
    },
    section: { projectionStart: 195, projectionEnd: 285, projectionCenter: 240 },
    metrics: {
      alignmentMode: 'full-shape',
      score: 0.8,
      divisionToSourceCoverage: 1,
      sourceToDivisionCoverage: 1,
    },
  };

  assert.deepEqual(exactPlacementFullShapeJoinPartition(dominant, weaker, candidate), {
    boundary: 116.5685424949238,
  });
});

test('allocates both sides of an exact-placement full-shape join to the reported source vertices', () => {
  const referenceLatitude = -33.95;
  const metersPerLongitude = 111_320 * Math.cos((referenceLatitude * Math.PI) / 180);
  const sourcePoint = (xMeters, yMeters) => ({
    lat: referenceLatitude + yMeters / 111_320,
    lng: 151 + xMeters / metersPerLongitude,
  });
  const divisions = [
    divisionLine('dominant-south-owner', 'lead_on', [sourcePoint(101, 0), sourcePoint(160, 0)]),
    divisionLine('joining-north-owner', 'lead_on', [
      sourcePoint(455, 8),
      sourcePoint(488, 2),
      sourcePoint(644, 2),
    ]),
    divisionLine('south-stopbar', 'stopbar', [sourcePoint(101, -10), sourcePoint(101, 10)]),
    divisionLine('north-stopbar', 'stopbar', [sourcePoint(644, -10), sourcePoint(644, 10)]),
  ];
  const sourceCoordinates = Array.from({ length: 116 }, (_, index) => sourcePoint(index * 6.5, 0));
  const row = {
    id: 'shared-exact-placement-row',
    classification: 'taxi-centerline',
    confidence: 0.78,
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    snapToVertices: true,
    sourceInstanceIds: sourceCoordinates.map((_, index) => `shared-placement-${index}`),
    vertices: sourceCoordinates.map(({ lat, lng }) => ({ lat, lon: lng })),
  };

  const result = matchDivisionObjects(divisions, [row], [], { includeDiagnostics: true });
  const south = result.matches.find((match) => match.division.id === 'dominant-south-owner');
  const north = result.matches.find((match) => match.division.id === 'joining-north-owner');
  const partition = result.diagnostics.pipeline.allocationEvaluations[0].partitionBoundaries[0];

  assert.ok(south);
  assert.ok(north);
  assert.equal(south.row.sourceRangeStartMeters, 101);
  assert.equal(south.row.sourceRangeEndMeters, 500.5);
  assert.equal(north.row.sourceRangeStartMeters, 500.5);
  assert.equal(south.row.sourceRangeEndMeters, north.row.sourceRangeStartMeters);
  assert.equal(north.row.sourceRangeEndMeters, 644);
  assert.equal(partition.basis, 'exact-placement-full-shape-join');
  assert.equal(partition.stationMeters, 500.5);
  assert.equal(partition.leftEndMeters, undefined);
  assert.equal(partition.rightStartMeters, undefined);
});

test('keeps a source-backed lead-on cell bounded by a simulator junction and Division stopbar', () => {
  const candidate = {
    raw: {
      sourceType: 'bgl-airport-light-row',
      snapToVertices: true,
    },
  };
  const edge = {
    division: {
      length: 76.785,
      raw: { type: 'lead_on' },
    },
    metrics: {
      valid: true,
      alignmentMode: 'source-contained',
      sourceToDivisionCoverage: 1,
      sourceToDivisionMeanDistance: 1.09,
      sourceToDivisionMaximumDistance: 4.31,
    },
  };
  const boundaries = [
    { along: 187.837, kind: 'junction', source: 'simulator' },
    { along: 215.261, kind: 'stopbar', source: 'division' },
  ];

  assert.equal(
    isSourceBackedJunctionStopbarCell(edge, candidate, 187.837, 215.261, 27.424, boundaries),
    true
  );
  assert.equal(
    isSourceBackedJunctionStopbarCell(edge, candidate, 187.837, 189.182, 1.345, boundaries),
    false
  );
  assert.equal(
    isSourceBackedJunctionStopbarCell(edge, candidate, 187.837, 215.261, 27.424, [boundaries[1]]),
    false
  );
  assert.equal(
    isSourceBackedJunctionStopbarCell(
      {
        ...edge,
        metrics: { ...edge.metrics, sourceToDivisionMaximumDistance: 6 },
      },
      candidate,
      187.837,
      215.261,
      27.424,
      boundaries
    ),
    false
  );
});

test('allocates a short native lead-on cell between its real junction and stopbar', () => {
  const divisions = [
    divisionLine('trunk-owner', 'lead_on', [point(0, 0), point(187.837, 0)]),
    divisionLine('junction-stopbar-owner', 'lead_on', [point(165.873, 0), point(242.658, 0)]),
    divisionLine('cell-stopbar', 'stopbar', [point(215.261, -10), point(215.261, 10)]),
  ];
  const mainRow = {
    ...simulatorLine('native-trunk', 'taxi-centerline', [
      point(0, 0),
      point(187.837, 0),
      point(215.261, 0),
      point(260, 60),
    ]),
    snapToVertices: true,
  };
  const branchRow = {
    ...simulatorLine('native-branch', 'taxi-centerline', [point(187.837, 0), point(187.837, 30)]),
    snapToVertices: true,
  };

  const result = matchDivisionObjects(divisions, [mainRow, branchRow], [], {
    includeDiagnostics: true,
  });
  const match = result.matches.find(
    (item) =>
      item.division.id === 'junction-stopbar-owner' && item.row.sourceParentRowId === 'native-trunk'
  );

  assert.ok(match, JSON.stringify(result.diagnostics?.allocation?.evaluations));
  assert.ok(Math.abs(match.row.sourceRangeStartMeters - 187.837) < 0.1);
  assert.ok(Math.abs(match.row.sourceRangeEndMeters - 215.261) < 0.1);
  const allocation = result.diagnostics.pipeline.allocationEvaluations.find(
    (evaluation) => evaluation.divisionId === 'junction-stopbar-owner'
  );
  assert.equal(allocation.outcome, 'allocated');
  assert.equal(allocation.minimumBasis, 'source-backed-junction-stopbar-cell');
  assert.equal(allocation.allocatedLengthMeters, 27.424);
  assert.equal(allocation.minimumLengthMeters, 23.036);
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

test('selects only the best of parallel inferred placement rows for one BARS object', () => {
  const division = divisionLine('lead-parallel', 'lead_on', [point(0, 0), point(40, 0)]);
  const inferred = (id, offset) => ({
    ...simulatorLine(id, 'taxi-centerline', [point(0, offset), point(40, offset)]),
    sourceType: 'inferred-bgl-placement-row',
    inferred: true,
    reconstructMode: 'exact-bgl-placement-control-points',
    sourceInstanceIds: [`${id}-0`, `${id}-1`],
  });

  const result = matchDivisionObjects(
    [division],
    [inferred('parallel-close', 0.4), inferred('parallel-offset', 2.5)]
  );

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].row.id, 'parallel-close');
});

test('merges staggered source layers with small decoded lateral variation', () => {
  const division = divisionLine('slightly-offset-layered-lead-on', 'lead_on', [
    point(0, 0),
    point(107, 0),
  ]);
  const rows = [
    simulatorLine('layer-west', 'taxi-centerline', [point(0, 0), point(100, 0)]),
    simulatorLine('layer-east', 'taxi-centerline', [point(7, 0.6), point(107, 0.6)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, result, {
    icao: 'TEST',
    altitude: 0,
  });

  assert.equal(result.mergedSimulatorRows.length, 1);
  assert.deepEqual(result.mergedSimulatorRows[0].sourceRowIds.sort(), ['layer-east', 'layer-west']);
  assert.equal(new Set(result.matches.map((match) => match.simulatorGroupId)).size, 1);
  assert.equal(output.replacements.length, 1);
  assert.ok(
    Math.abs(
      Math.max(...output.replacements[0].row.vertices.map((vertex) => vertex.lon)) -
        point(107, 0).lng
    ) < 0.000001
  );
});

test('merges staggered full rows and a reversed subsection into one replacement', () => {
  const division = divisionLine('layered-lead-on', 'lead_on', [point(0, 0), point(105, 0)]);
  const rows = [
    simulatorLine('full-west', 'taxi-centerline', [point(0, 0), point(100, 0)]),
    simulatorLine('full-east', 'taxi-centerline', [point(5, 0), point(105, 0)]),
    simulatorLine('reversed-subsection', 'taxi-centerline', [point(90, 0), point(15, 0)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, result, {
    icao: 'TEST',
    altitude: 0,
  });

  assert.equal(result.mergedSimulatorRows.length, 1);
  assert.deepEqual(result.mergedSimulatorRows[0].sourceRowIds.sort(), [
    'full-east',
    'full-west',
    'reversed-subsection',
  ]);
  assert.equal(new Set(result.matches.map((match) => match.simulatorGroupId)).size, 1);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.xml.split('layered-lead-on').length - 1, 1);
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

test('trims a lead-on at the matched stopbar using the nearest real source vertex', () => {
  const leadDivision = divisionLine('lead-boundary', 'lead_on', [point(0, 0), point(100, 0)]);
  const stopbarDivision = {
    ...divisionLine('stop-boundary', 'stopbar', [point(10, -10), point(10, 10)]),
    name: leadDivision.name,
  };
  const leadRow = {
    ...simulatorLine('sim-lead-boundary', 'taxi-centerline', [
      point(0, 0),
      point(6, 0),
      point(12, 0),
      point(20, 0),
      point(100, 0),
    ]),
    sourceInstanceIds: ['lead-0', 'lead-6', 'lead-12', 'lead-20', 'lead-100'],
    sourceParentRowId: 'sim-lead-boundary',
    sourceRangeStartMeters: 0,
    sourceRangeEndMeters: 100,
    sourceParentLengthMeters: 100,
  };
  const stopbarRow = simulatorLine('sim-stop-boundary', 'stopbar', [point(10, -10), point(10, 10)]);
  const sourceInstances = [0, 6, 12, 20, 100].map((x) =>
    simulatorInstance(`lead-${x}`, 'taxi-centerline', point(x, 0))
  );
  const simplifiedLeadReplacement = {
    ...leadRow,
    vertices: [leadRow.vertices[0], leadRow.vertices.at(-1)],
  };
  const matching = {
    matches: [
      {
        division: leadDivision,
        row: leadRow,
        replacementRow: simplifiedLeadReplacement,
        score: 1,
      },
      { division: stopbarDivision, row: stopbarRow, replacementRow: stopbarRow, score: 1 },
    ],
    unmatched: [],
    mergedSimulatorRows: [],
    duplicateDivisionLeadOns: 0,
    duplicateSimulatorLeadOns: 0,
  };

  const output = buildDraftOutput(
    { instances: sourceInstances, lightRows: [leadRow, stopbarRow], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );
  const leadReplacement = output.replacements.find(
    (replacement) => replacement.division.id === 'lead-boundary'
  );

  assert.deepEqual(leadReplacement.row.vertices[0], {
    lat: point(12, 0).lat,
    lon: point(12, 0).lng,
  });
  assert.equal(leadReplacement.row.replacementGeometryDerived, 'matched-stopbar-boundary-trim');
  assert.equal(
    leadReplacement.row.replacementStopbarBoundary.boundaryBasis,
    'nearest-exact-source-light-beyond-stopbar'
  );
  assert.deepEqual(output.guidanceStopbarBoundaryTrims, [
    {
      divisionId: 'lead-boundary',
      divisionName: 'lead-boundary',
      stopbarDivisionId: 'stop-boundary',
      stopbarName: 'lead-boundary',
      crossingLeadSegmentIndex: 0,
      crossingFraction: 0.1,
      boundaryBasis: 'nearest-exact-source-light-beyond-stopbar',
      originalVertexCount: 2,
      finalVertexCount: 2,
    },
  ]);
  assert.equal(output.guidanceStopbarCrossingAudit.remainingInteriorCrossingCount, 0);
  const removalMatch = output.removalApproved.find(
    (candidate) => candidate.division.id === 'lead-boundary'
  );
  assert.deepEqual(removalMatch.row.vertices[0], leadRow.vertices[2]);
  assert.deepEqual(removalMatch.row.sourceInstanceIds, ['lead-12', 'lead-20', 'lead-100']);
  assert.ok(Math.abs(removalMatch.row.sourceRangeStartMeters - 12) < 0.05);
  assert.equal(removalMatch.row.sourceRangeEndMeters, 100);
  assert.equal(output.removalStopbarBoundaryTrims.length, 1);
  assert.equal(output.removalStopbarBoundaryTrims[0].finalVertexCount, 3);
  const leadRemovalRings = output.removals
    .filter((removal) => (removal.sourceRowIds ?? [removal.sourceRowId]).includes(leadRow.id))
    .map((removal) => removal.coordinates.map(([lon, lat]) => ({ lat, lon })));
  assert.ok(
    leadRow.vertices
      .slice(0, 2)
      .every((vertex) => !leadRemovalRings.some((ring) => pointInPolygon(vertex, ring)))
  );
});

test('trims a two-point lead-on at the exact source-geometry intersection when no light remains', () => {
  const leadDivision = divisionLine('two-point-lead', 'lead_on', [point(0, 0), point(100, 0)]);
  const stopbarDivision = {
    ...divisionLine('two-point-stopbar', 'stopbar', [point(10, -10), point(10, 10)]),
    name: leadDivision.name,
  };
  const leadRow = {
    ...simulatorLine('two-point-source-lead', 'taxi-centerline', [point(0, 0), point(100, 0)]),
    removalEligible: false,
  };
  const stopbarRow = {
    ...simulatorLine('two-point-source-stopbar', 'stopbar', [point(10, -10), point(10, 10)]),
    removalEligible: false,
  };
  const matching = {
    matches: [
      { division: leadDivision, row: leadRow, replacementRow: leadRow, score: 1 },
      { division: stopbarDivision, row: stopbarRow, replacementRow: stopbarRow, score: 1 },
    ],
    unmatched: [],
    mergedSimulatorRows: [],
    duplicateDivisionLeadOns: 0,
    duplicateSimulatorLeadOns: 0,
  };

  const output = buildDraftOutput(
    { instances: [], lightRows: [leadRow, stopbarRow], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );
  const replacement = output.replacements.find(
    (candidate) => candidate.division.id === 'two-point-lead'
  );

  assert.ok(Math.abs(replacement.row.vertices[0].lon - point(10, 0).lng) < 1e-12);
  assert.equal(
    replacement.row.replacementStopbarBoundary.boundaryBasis,
    'exact-source-geometry-intersection'
  );
  assert.equal(output.guidanceStopbarCrossingAudit.remainingInteriorCrossingCount, 0);
});

test('writes a nearly straight reconstructed stopbar from its two real endpoints', () => {
  const division = divisionLine('straight-stopbar', 'stopbar', [point(0, 0), point(30, 0)]);
  const simulator = inferredPlacementLine('reconstructed-stopbar', 'stopbar', [
    point(0, 0.2),
    point(8, 0.5),
    point(16, -0.3),
    point(24, 0.4),
    point(30, 0.2),
  ]);

  const result = matchDivisionObjects([division], [simulator]);

  assert.deepEqual(result.matches[0].replacementRow.vertices, [
    simulator.vertices[0],
    simulator.vertices.at(-1),
  ]);
  assert.equal(
    result.matches[0].replacementRow.replacementGeometryDerived,
    'straight-source-stopbar-endpoints'
  );
});

test('does not attach a tiny endpoint sliver from a long stopbar-crossing row', () => {
  const divisions = [
    divisionLine('nearby-stopbar', 'stopbar', [point(0, 10), point(0, -10)]),
    divisionLine('complete-lead-on', 'lead_on', [point(8.3, 0), point(80, 0)]),
  ];
  const rows = [
    simulatorLine('complete-primary', 'taxi-centerline', [point(8.3, 1), point(80, 1)]),
    simulatorLine('long-crossing-row', 'taxi-centerline', [
      point(-500, 1),
      point(0, 1),
      point(1.3, 1),
    ]),
  ];

  const result = matchDivisionObjects(divisions, rows);

  assert.equal(
    result.matches.some(
      (match) =>
        match.division.id === 'complete-lead-on' &&
        match.metrics.sourceConnectionBasis === 'stopbar-boundary'
    ),
    false
  );
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

test('bridges a short straight same-source jump when the continuation follows the division', () => {
  const division = divisionLine('lead-with-logical-jump', 'lead_on', [point(0, 0), point(100, 0)]);
  const rows = [
    simulatorLine('primary-exact-row', 'taxi-centerline', [point(0, 1), point(65, 1)]),
    simulatorLine('jumped-exact-row', 'taxi-centerline', [point(73, 1), point(100, 1)]),
  ];

  const result = matchDivisionObjects([division], rows);
  const output = buildDraftOutput({ instances: [], lightRows: rows, mustKeepZones: [] }, result, {
    icao: 'TEST',
    altitude: 0,
  });
  const completion = result.matches.find(
    (match) => match.metrics.sourceConnectionBasis === 'logical-source-jump'
  );

  assert.ok(completion);
  assert.equal(completion.row.id, 'jumped-exact-row');
  assert.ok(completion.metrics.sourceConnectionGapMeters > 7.9);
  assert.ok(completion.metrics.sourceConnectionGapMeters < 8.1);
  assert.equal(output.replacements.length, 1);
  assert.equal(output.replacements[0].row.replacementGeometryDerived, 'logical-source-jump-union');
  assert.equal(
    output.removals.some((removal) =>
      pointInPolygon(
        point(69, 1),
        removal.coordinates.map(([lon, lat]) => ({ lat, lon }))
      )
    ),
    false
  );
});

test('joins a tightly aligned inferred row that continues an allocated division owner', () => {
  const division = divisionLine('lead-with-exact-continuation', 'lead_on', [
    point(0, 0),
    point(160, 0),
  ]);
  const primary = inferredPlacementLine('allocated-exact-row', 'taxi-centerline', [
    point(0, 1),
    point(50, 1),
    point(100, 1),
  ]);
  const continuation = inferredPlacementLine('continued-exact-row', 'taxi-centerline', [
    point(102, 1),
    point(130, 1),
    point(160, 1),
  ]);

  const result = matchDivisionObjects([division], [primary, continuation]);
  const output = buildDraftOutput(
    { instances: [], lightRows: [primary, continuation], mustKeepZones: [] },
    result,
    { icao: 'TEST', altitude: 0 }
  );
  const completion = result.matches.find(
    (match) => match.metrics.sourceConnectionBasis === 'straight-source-continuation'
  );

  assert.ok(completion);
  assert.equal(completion.division.id, division.id);
  assert.equal(completion.row.id, continuation.id);
  assert.equal(result.matches.length, 2);
  assert.equal(output.replacements.length, 1);
  assert.equal(
    output.replacements[0].row.replacementGeometryDerived,
    'straight-source-continuation-union'
  );
});

test('joins a source-backed branch at an internal allocated guidance boundary', () => {
  const target = divisionLine('curved-branch-owner', 'lead_on', [
    point(0, 0),
    point(100, 0),
    point(130, 13),
    point(160, 12),
  ]);
  const throughOwner = divisionLine('straight-through-owner', 'lead_on', [
    point(100, 0),
    point(200, 0),
  ]);
  const trunk = inferredPlacementLine('shared-exact-trunk', 'taxi-centerline', [
    point(0, 1),
    point(100, 1),
    point(200, 1),
  ]);
  const branch = inferredPlacementLine('exact-curved-branch', 'taxi-centerline', [
    point(102, 2),
    point(130, 14),
    point(160, 13),
  ]);

  const result = matchDivisionObjects([target, throughOwner], [trunk, branch], [], {
    includeDiagnostics: true,
  });
  const allocatedTarget = result.diagnostics.pipeline.allocatedEdges.find(
    (edge) => edge.divisionId === target.id && edge.simulatorCandidateId === trunk.id
  );
  const completion = result.matches.find(
    (match) =>
      match.division.id === target.id &&
      match.row.id === branch.id &&
      match.metrics.sourceConnectionBasis === 'straight-source-continuation'
  );

  assert.ok(allocatedTarget);
  assert.ok(allocatedTarget.section.endMeters < 199);
  assert.ok(completion);
  assert.ok(completion.metrics.sourceConnectionTurnDegrees > 20);
  assert.ok(completion.metrics.sourceConnectionTurnDegrees < 25);
});

test('does not bridge a logical guidance jump across a stopbar', () => {
  const divisions = [
    divisionLine('lead-with-blocked-jump', 'lead_on', [point(0, 0), point(100, 0)]),
    divisionLine('blocking-stopbar', 'stopbar', [point(70, -10), point(70, 10)]),
  ];
  const rows = [
    simulatorLine('primary-before-stopbar', 'taxi-centerline', [point(0, 1), point(65, 1)]),
    simulatorLine('continuation-after-stopbar', 'taxi-centerline', [point(75, 1), point(100, 1)]),
  ];

  const result = matchDivisionObjects(divisions, rows);

  assert.equal(
    result.matches.some((match) => match.metrics.sourceConnectionBasis === 'logical-source-jump'),
    false
  );
});

test('returns a rejected endpoint partition to the surviving lead-on owner', () => {
  const divisions = [
    divisionLine('surviving-lead-on', 'lead_on', [point(0, 0), point(100, 0)]),
    divisionLine('weak-composite-claimant', 'taxiway', [point(4, 1), point(30, 1), point(30, 100)]),
  ];
  const rows = [
    simulatorLine('partitioned-primary-row', 'taxi-centerline', [point(0, 0), point(72, 0)]),
    simulatorLine('continuation-after-partition', 'taxi-centerline', [point(80, 0), point(100, 0)]),
  ];

  const result = matchDivisionObjects(divisions, rows, [], { includeDiagnostics: true });
  const reclamation = result.diagnostics.pipeline.allocationEvaluations.find(
    (evaluation) =>
      evaluation.divisionId === 'surviving-lead-on' &&
      evaluation.outcome === 'reallocated-rejected-endpoint-partition'
  );

  assert.ok(reclamation);
  assert.equal(reclamation.side, 'start');
  assert.ok(
    result.matches.some(
      (match) =>
        match.division.id === 'surviving-lead-on' &&
        match.row.id === 'continuation-after-partition' &&
        match.metrics.sourceConnectionBasis === 'logical-source-jump'
    )
  );
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

test('uses a same-file compiled BGL junction as the ownership split', () => {
  const divisions = [
    divisionLine('short-native-owner', 'taxiway', [point(0, 0), point(2, 0)]),
    divisionLine('long-native-owner', 'taxiway', [point(8, 0), point(100, 0)]),
  ];
  const trunk = simulatorLine('native-trunk', 'taxi-centerline', [point(0, 0), point(100, 0)]);
  const branch = simulatorLine('native-branch', 'taxi-centerline', [point(8, 0), point(8, 20)]);

  const result = matchDivisionObjects(divisions, [trunk, branch]);
  const trunkRanges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.equal(trunkRanges.length, 2);
  assert.ok(
    Math.abs(trunkRanges[0].row.sourceRangeEndMeters - 8) < 0.1,
    JSON.stringify(trunkRanges.map((match) => match.row))
  );
  assert.ok(Math.abs(trunkRanges[1].row.sourceRangeStartMeters - 8) < 0.1);
});

test('does not use a compiled BGL junction from another source file', () => {
  const divisions = [
    divisionLine('short-native-owner', 'taxiway', [point(0, 0), point(2, 0)]),
    divisionLine('long-native-owner', 'taxiway', [point(8, 0), point(100, 0)]),
  ];
  const trunk = simulatorLine('native-trunk', 'taxi-centerline', [point(0, 0), point(100, 0)]);
  const branch = {
    ...simulatorLine('unrelated-native-branch', 'taxi-centerline', [point(8, 0), point(8, 20)]),
    sourceFile: 'other-airport.bgl',
  };

  const result = matchDivisionObjects(divisions, [trunk, branch]);
  const shortOwner = result.matches.find(
    (match) =>
      match.division.id === 'short-native-owner' && match.row.sourceParentRowId === trunk.id
  );

  assert.ok(shortOwner);
  assert.ok(
    Math.abs(shortOwner.row.sourceRangeEndMeters - 5) < 0.1,
    JSON.stringify(shortOwner.row)
  );
});

test('extends adjacent native taxiway owners to their visible source junction', () => {
  const divisions = [
    divisionLine('short-display-owner', 'taxiway', [point(0, 0), point(20, 0)]),
    divisionLine('continuing-display-owner', 'taxiway', [point(20, 0), point(100, 0)]),
  ];
  const trunk = simulatorLine('native-shared-trunk', 'taxi-centerline', [
    point(0, 0),
    point(25, 0),
    point(100, 0),
  ]);
  const junction = simulatorLine('native-visible-junction', 'taxi-centerline', [
    point(25, 0),
    point(25, 20),
  ]);

  const result = matchDivisionObjects(divisions, [trunk, junction]);
  const trunkRanges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.equal(trunkRanges.length, 2);
  assert.ok(Math.abs(trunkRanges[0].row.sourceRangeEndMeters - 25) < 0.1);
  assert.ok(Math.abs(trunkRanges[1].row.sourceRangeStartMeters - 25) < 0.1);
});

test('does not move a shared taxiway hand-off to a distant stopbar', () => {
  const divisions = [
    divisionLine('before-shared-boundary', 'taxiway', [point(0, 0), point(20, 0)]),
    divisionLine('after-shared-boundary', 'taxiway', [point(20, 0), point(100, 0)]),
    divisionLine('unrelated-stopbar', 'stopbar', [point(8, -10), point(8, 10)]),
  ];
  const trunk = simulatorLine('native-stopbar-snap-trunk', 'taxi-centerline', [
    point(0, 0),
    point(100, 0),
  ]);

  const result = matchDivisionObjects(divisions, [trunk]);
  const trunkRanges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.equal(trunkRanges.length, 2);
  assert.ok(Math.abs(trunkRanges[0].row.sourceRangeEndMeters - 20) < 0.1);
  assert.ok(Math.abs(trunkRanges[1].row.sourceRangeStartMeters - 20) < 0.1);
});

test('shortens a snap-to-vertices taxiway section to the nearest inward source vertex', () => {
  const divisions = [
    divisionLine('vertex-snapped-owner', 'taxiway', [point(0, 0), point(19.2, 0)]),
    divisionLine('following-vertex-owner', 'taxiway', [point(19.2, 0), point(40, 0)]),
  ];
  const trunk = {
    ...simulatorLine('native-vertex-snap-trunk', 'taxi-centerline', [
      point(0, 0),
      point(18, 0),
      point(40, 0),
    ]),
    snapToVertices: true,
  };

  const result = matchDivisionObjects(divisions, [trunk]);
  const first = result.matches.find((match) => match.division.id === 'vertex-snapped-owner');

  assert.ok(first);
  assert.ok(Math.abs(first.row.sourceRangeEndMeters - 18) < 0.1);
});

test('keeps a real junction boundary instead of shortening it to an inward source vertex', () => {
  const divisions = [
    divisionLine('before-natural-boundary', 'taxiway', [point(0, 0), point(19.2, 0)]),
    divisionLine('after-natural-boundary', 'taxiway', [point(19.2, 0), point(40, 0)]),
  ];
  const trunk = {
    ...simulatorLine('native-natural-boundary-trunk', 'taxi-centerline', [
      point(0, 0),
      point(18, 0),
      point(40, 0),
    ]),
    snapToVertices: true,
  };
  const junction = simulatorLine('native-natural-boundary-branch', 'taxi-centerline', [
    point(19.2, 0),
    point(19.2, 20),
  ]);

  const result = matchDivisionObjects(divisions, [trunk, junction]);
  const ranges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);

  assert.equal(ranges.length, 2);
  assert.ok(Math.abs(ranges[0].row.sourceRangeEndMeters - 19.2) < 0.1);
  assert.ok(Math.abs(ranges[1].row.sourceRangeStartMeters - 19.2) < 0.1);
});

test('keeps one compact light interval before a taxiway stopbar', () => {
  const divisions = [
    divisionLine('before-compact-stopbar-owner', 'taxiway', [point(0, 0), point(100, 0)]),
    divisionLine('compact-stopbar-owner', 'taxiway', [point(100, 0), point(124, 0)]),
    divisionLine('after-compact-stopbar-owner', 'taxiway', [point(124, 0), point(224, 0)]),
    divisionLine('compact-owner-stopbar', 'stopbar', [point(124, -10), point(124, 10)]),
  ];
  const trunk = {
    ...simulatorLine('native-compact-stopbar-trunk', 'taxi-centerline', [
      point(0, 0),
      point(224, 0),
    ]),
    spacing: 16,
    snapToVertices: true,
  };

  const result = matchDivisionObjects(divisions, [trunk], [], { includeDiagnostics: true });
  const ranges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);
  const compact = ranges.find((match) => match.division.id === 'compact-stopbar-owner');
  const before = ranges.find((match) => match.division.id === 'before-compact-stopbar-owner');

  assert.ok(compact);
  assert.ok(before);
  assert.ok(Math.abs(compact.row.sourceRangeLengthMeters - 18) < 0.1);
  assert.ok(Math.abs(before.row.sourceRangeEndMeters - compact.row.sourceRangeStartMeters) < 0.001);
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === 'compact-stopbar-owner' &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'compact-stopbar-approach'
        )
    )
  );
});

test('hands compact taxiway ownership over at the nearby simulator vertex after a stopbar', () => {
  const divisions = [
    divisionLine('before-shifted-stopbar-owner', 'taxiway', [point(0, 0), point(80, 0)]),
    divisionLine('shifted-stopbar-owner', 'taxiway', [point(80, 0), point(100, 0)]),
    divisionLine('after-shifted-stopbar-owner', 'taxiway', [point(100, 0), point(200, 0)]),
    divisionLine('shifted-owner-stopbar', 'stopbar', [point(100, -10), point(100, 10)]),
  ];
  const trunk = {
    ...simulatorLine('native-shifted-stopbar-trunk', 'taxi-centerline', [
      point(0, 0),
      point(99.7, 0),
      point(102.2, 0),
      point(200, 0),
    ]),
    spacing: 16,
    snapToVertices: true,
  };

  const result = matchDivisionObjects(divisions, [trunk], [], { includeDiagnostics: true });
  const ranges = result.matches
    .filter((match) => match.row.sourceParentRowId === trunk.id)
    .sort((left, right) => left.row.sourceRangeStartMeters - right.row.sourceRangeStartMeters);
  const compact = ranges.find((match) => match.division.id === 'shifted-stopbar-owner');
  const before = ranges.find((match) => match.division.id === 'before-shifted-stopbar-owner');
  const after = ranges.find((match) => match.division.id === 'after-shifted-stopbar-owner');

  assert.ok(compact);
  assert.ok(before);
  assert.ok(after);
  assert.ok(Math.abs(compact.row.sourceRangeStartMeters - 82.2) < 0.1);
  assert.ok(
    Math.abs(compact.row.sourceRangeEndMeters - 102.2) < 0.1,
    JSON.stringify(ranges.map((match) => ({ id: match.division.id, row: match.row })))
  );
  assert.ok(Math.abs(before.row.sourceRangeEndMeters - compact.row.sourceRangeStartMeters) < 0.001);
  assert.ok(Math.abs(after.row.sourceRangeStartMeters - compact.row.sourceRangeEndMeters) < 0.001);
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === 'shifted-stopbar-owner' &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'simulator-vertex-stopbar'
        )
    )
  );
});

test('keeps a tiny native taxiway owner when both hand-offs snap to one junction', () => {
  const divisions = [
    divisionLine('before-tiny-owner', 'taxiway', [point(0, 0), point(50, 0)]),
    divisionLine('tiny-owner', 'taxiway', [point(50, 0), point(54, 0)]),
    divisionLine('after-tiny-owner', 'taxiway', [point(54, 0), point(100, 0)]),
  ];
  const trunk = simulatorLine('native-tiny-trunk', 'taxi-centerline', [
    point(0, 0),
    point(52, 0),
    point(100, 0),
  ]);
  const junction = simulatorLine('native-tiny-junction', 'taxi-centerline', [
    point(52, 0),
    point(52, 20),
  ]);

  const result = matchDivisionObjects(divisions, [trunk, junction]);
  const tinyMatch = result.matches.find(
    (match) =>
      match.division.id === 'tiny-owner' && match.row.sourceParentRowId === 'native-tiny-trunk'
  );

  assert.ok(tinyMatch);
  assert.ok(tinyMatch.row.sourceRangeLengthMeters >= 4);
});

test('does not leak a junction branch into a division with a stronger straight-row match', () => {
  const straightDivision = divisionLine('straight-owner', 'taxiway', [point(0, 0), point(16, 0)]);
  const curvedDivision = divisionLine('curved-owner', 'taxiway', [
    point(0, 0),
    point(8, -2),
    point(15, -8),
    point(25, -20),
  ]);
  const straightRow = simulatorLine('straight-source', 'taxi-centerline', [
    point(-40, 0.8),
    point(40, 0.8),
  ]);
  const curvedRow = simulatorLine('curved-source', 'taxi-centerline', [
    point(0, 0.5),
    point(8, -1.5),
    point(15, -7.5),
    point(25, -19.5),
  ]);

  const result = matchDivisionObjects([straightDivision, curvedDivision], [straightRow, curvedRow]);
  const straightMatches = result.matches.filter(
    (match) => match.division.id === straightDivision.id
  );

  assert.deepEqual(
    straightMatches.map((match) => match.simulatorGroupId ?? match.row.id),
    [straightRow.id]
  );
  assert.ok(result.matches.some((match) => match.division.id === curvedDivision.id));
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

test('keeps the aligned Division run when a bent YSSY lead-on follows a second source row', () => {
  const division = divisionLine('BARS_NPKCG', 'lead_on', [
    { lat: -33.95896004151482, lng: 151.178014241159 },
    { lat: -33.95897005278039, lng: 151.17821741849187 },
    { lat: -33.95894335606958, lng: 151.17843199521306 },
    { lat: -33.95890776044216, lng: 151.17862310260534 },
    { lat: -33.95887494570994, lng: 151.17880549281838 },
    { lat: -33.95887272098187, lng: 151.1789221689105 },
    { lat: -33.95888440080357, lng: 151.17901135236028 },
    { lat: -33.958917771713885, lng: 151.17909315973523 },
    { lat: -33.95895503588159, lng: 151.17916960269216 },
    { lat: -33.95901065401199, lng: 151.17923330515623 },
    { lat: -33.95907016537126, lng: 151.17928024381402 },
    { lat: -33.95913190141023, lng: 151.1793037131429 },
    { lat: -33.95919530594418, lng: 151.17931846529248 },
  ]);
  const selectedRow = inferredPlacementLine('e5e618ddbf23a791', 'taxi-centerline', [
    { lat: -33.9582758769393, lng: 151.17707177996635 },
    { lat: -33.95832985639572, lng: 151.1770986020565 },
    { lat: -33.958382830023766, lng: 151.1771285533905 },
    { lat: -33.9584344625473, lng: 151.17716163396835 },
    { lat: -33.958484418690205, lng: 151.1771982908249 },
    { lat: -33.95853269845247, lng: 151.17723807692528 },
    { lat: -33.958579301834106, lng: 151.17728054523468 },
    { lat: -33.95862355828285, lng: 151.17732658982277 },
    { lat: -33.95866546779871, lng: 151.17737531661987 },
    { lat: -33.95870503038168, lng: 151.17742761969566 },
    { lat: -33.958741910755634, lng: 151.17748215794563 },
    { lat: -33.95877543836832, lng: 151.17753982543945 },
    { lat: -33.958805948495865, lng: 151.17759972810745 },
    { lat: -33.95883310586214, lng: 151.17766186594963 },
    { lat: -33.95885691046715, lng: 151.177726238966 },
    { lat: -33.95887702703476, lng: 151.1777924001217 },
    { lat: -33.958893455564976, lng: 151.1778599023819 },
    { lat: -33.9589061960578, lng: 151.1779287457466 },
    { lat: -33.95891524851322, lng: 151.17799803614616 },
    { lat: -33.95892094820738, lng: 151.1780682206154 },
    { lat: -33.95892295986414, lng: 151.1781384050846 },
    { lat: -33.95892195403576, lng: 151.17820903658867 },
    { lat: -33.95891558378935, lng: 151.17827877402306 },
    { lat: -33.95890787243843, lng: 151.17834851145744 },
    { lat: -33.95889949053526, lng: 151.17841824889183 },
    { lat: -33.95889010280371, lng: 151.17848798632622 },
    { lat: -33.9588800445199, lng: 151.17855727672577 },
    { lat: -33.95886864513159, lng: 151.17862612009048 },
    { lat: -33.95885657519102, lng: 151.1786949634552 },
    { lat: -33.95884349942207, lng: 151.17876380681992 },
    { lat: -33.95882874727249, lng: 151.17883175611496 },
    { lat: -33.958800584077835, lng: 151.1788934469223 },
    { lat: -33.958766385912895, lng: 151.17895022034645 },
    { lat: -33.958726823329926, lng: 151.1790020763874 },
    { lat: -33.95868223160505, lng: 151.17904767394066 },
    { lat: -33.95863328129053, lng: 151.1790856719017 },
    { lat: -33.95857997238636, lng: 151.1791142821312 },
    { lat: -33.958522975444794, lng: 151.17913037538528 },
    { lat: -33.95846497267485, lng: 151.17912590503693 },
    { lat: -33.95840764045715, lng: 151.17911115288734 },
    { lat: -33.95835064351559, lng: 151.17909595370293 },
    { lat: -33.95829364657402, lng: 151.1790807545185 },
    { lat: -33.95823631435633, lng: 151.17906600236893 },
    { lat: -33.95817931741476, lng: 151.1790508031845 },
    { lat: -33.95812198519707, lng: 151.1790356040001 },
  ]);

  const instances = [
    ...selectedRow.vertices.map((vertex, index) =>
      simulatorInstance(selectedRow.sourceInstanceIds[index], selectedRow.classification, {
        lat: vertex.lat,
        lng: vertex.lon,
      })
    ),
    ...division.coordinates.map((coordinate, index) =>
      simulatorInstance(`second-row-instance-${index}`, 'taxi-centerline', coordinate)
    ),
  ];
  const result = matchDivisionObjects([division], [selectedRow], instances, {
    includeDiagnostics: true,
  });
  const edge = result.diagnostics.pipeline.eligibleEdges.find(
    (candidate) =>
      candidate.divisionId === division.id && candidate.simulatorCandidateId === selectedRow.id
  );

  assert.ok(
    edge,
    JSON.stringify({
      rows: result.diagnostics.compatibleRowCandidateEvaluations,
      instances: result.diagnostics.instanceCandidateEvaluations,
    })
  );
  assert.equal(edge.metrics.alignmentMode, 'source-instance-section');
  assert.ok(edge.section.startMeters > 110 && edge.section.startMeters < 125);
  assert.ok(edge.section.endMeters > 185 && edge.section.endMeters < 200);
});

test('splits the YSSY A6 source endpoint between its curved and straight Division owners', () => {
  const curved = divisionLine('BARS_QD9R9', 'lead_on', [
    { lat: -33.96424180625236, lng: 151.1802296669107 },
    { lat: -33.96421940884554, lng: 151.18028456345203 },
    { lat: -33.964199109475146, lng: 151.18032949045303 },
    { lat: -33.964168243299916, lng: 151.18037676438692 },
    { lat: -33.964140992072835, lng: 151.18040995672348 },
    { lat: -33.964113462763144, lng: 151.180437784642 },
    { lat: -33.96407759122504, lng: 151.18047030642632 },
    { lat: -33.964052286487494, lng: 151.18048807606104 },
    { lat: -33.96401001921681, lng: 151.18050986900928 },
    { lat: -33.963965249255864, lng: 151.18052462115884 },
    { lat: -33.96391825467523, lng: 151.18053199723366 },
    { lat: -33.96387598733793, lng: 151.1805326677859 },
    { lat: -33.963842062223065, lng: 151.18052780628207 },
    { lat: -33.963277012418736, lng: 151.18038028478625 },
  ]);
  const straight = divisionLine('BARS_4YOIZ', 'lead_on', [
    { lat: -33.964371787366254, lng: 151.17949327275943 },
    { lat: -33.964212735080466, lng: 151.18039436638358 },
  ]);
  const source = inferredPlacementLine('6aafc78e71ccb9dc', 'taxi-centerline', [
    { lat: -33.96382335573435, lng: 151.1805135011673 },
    { lat: -33.96388169378042, lng: 151.1805148422718 },
    { lat: -33.96393969655037, lng: 151.18050634860992 },
    { lat: -33.963995687663555, lng: 151.18048667907715 },
    { lat: -33.964047990739346, lng: 151.18045538663864 },
    { lat: -33.96409459412098, lng: 151.18041336536407 },
    { lat: -33.9641348272562, lng: 151.18036195635796 },
    { lat: -33.964167684316635, lng: 151.1803038418293 },
    { lat: -33.96419383585453, lng: 151.18024125695229 },
    { lat: -33.964213617146015, lng: 151.18017509579659 },
    { lat: -33.96422568708658, lng: 151.18010580539703 },
    { lat: -33.96423775702715, lng: 151.18003696203232 },
    { lat: -33.964249826967716, lng: 151.1799681186676 },
    { lat: -33.964261561632156, lng: 151.1798992753029 },
    { lat: -33.96427363157272, lng: 151.17983043193817 },
    { lat: -33.96428570151329, lng: 151.17976158857346 },
    { lat: -33.96429777145386, lng: 151.17969274520874 },
    { lat: -33.964309841394424, lng: 151.17962390184402 },
    { lat: -33.96432191133499, lng: 151.1795550584793 },
    { lat: -33.96433398127556, lng: 151.1794862151146 },
    { lat: -33.96433743507975, lng: 151.17946595279668 },
    { lat: -33.96433743507975, lng: 151.147 },
  ]);
  source.snapToVertices = true;
  const instances = source.vertices.map((vertex, index) =>
    simulatorInstance(source.sourceInstanceIds[index], source.classification, {
      lat: vertex.lat,
      lng: vertex.lon,
    })
  );

  const result = matchDivisionObjects([curved, straight], [source], instances, {
    includeDiagnostics: true,
  });
  const curvedMatch = result.matches.find((match) => match.division.id === curved.id);
  const straightMatch = result.matches.find((match) => match.division.id === straight.id);

  assert.ok(curvedMatch, JSON.stringify(result.diagnostics.compatibleRowCandidateEvaluations));
  assert.ok(straightMatch);
  assert.equal(
    result.diagnostics.pipeline.eligibleEdges.find(
      (edge) => edge.divisionId === curved.id && edge.simulatorCandidateId === source.id
    ).metrics.alignmentMode,
    'source-instance-section'
  );
  assert.ok(curvedMatch.row.sourceRangeEndMeters > 55);
  assert.ok(curvedMatch.row.sourceRangeEndMeters < 65);
  assert.ok(
    Math.abs(curvedMatch.row.sourceRangeEndMeters - straightMatch.row.sourceRangeStartMeters) <
      0.001
  );
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === curved.id &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'source-instance-endpoint'
        )
    )
  );
});

test('splits the YSSY T6 source row where a registered leg hands over to its curved branch', () => {
  const registeredLeg = divisionLine('BARS_B9E4E', 'lead_on', [
    { lat: -33.97116623623396, lng: 151.19293067604303 },
    { lat: -33.97105501583267, lng: 151.19355060160163 },
  ]);
  const curvedBranch = divisionLine('BARS_W528S', 'lead_on', [
    { lat: -33.97116623623396, lng: 151.19293067604303 },
    { lat: -33.97113460327103, lng: 151.19310699343762 },
    { lat: -33.97111896758119, lng: 151.19314927607778 },
    { lat: -33.97108893807048, lng: 151.19323376566172 },
    { lat: -33.97103722055497, lng: 151.19333636015656 },
    { lat: -33.97098494690517, lng: 151.19341749697927 },
    { lat: -33.97092822439777, lng: 151.19348589330912 },
    { lat: -33.970866496920245, lng: 151.19354557245973 },
    { lat: -33.97080532550192, lng: 151.19359318166974 },
  ]);
  const stopbar = divisionLine('T6-stopbar', 'stopbar', [
    { lat: -33.971198177135, lng: 151.192901283503 },
    { lat: -33.970998177135, lng: 151.192901283503 },
  ]);
  const source = inferredPlacementLine('74bf8f3f54713cca', 'taxi-centerline', [
    { lat: -33.9712654799223, lng: 151.191937029362 },
    { lat: -33.9712587743998, lng: 151.192006766796 },
    { lat: -33.9712463691831, lng: 151.192075610161 },
    { lat: -33.9712339639664, lng: 151.192144453526 },
    { lat: -33.9712215587497, lng: 151.19221329689 },
    { lat: -33.9712094888091, lng: 151.192282140255 },
    { lat: -33.9711970835924, lng: 151.192350536585 },
    { lat: -33.9711846783757, lng: 151.19241937995 },
    { lat: -33.971172273159, lng: 151.192488223314 },
    { lat: -33.9711598679423, lng: 151.192557066679 },
    { lat: -33.9711474627256, lng: 151.192625910044 },
    { lat: -33.9711353927851, lng: 151.192694753408 },
    { lat: -33.9711229875684, lng: 151.192763596773 },
    { lat: -33.9711105823517, lng: 151.192832440138 },
    { lat: -33.971098177135, lng: 151.192901283503 },
    { lat: -33.9710857719183, lng: 151.192970126867 },
    { lat: -33.9710733667016, lng: 151.193038970232 },
    { lat: -33.9710549265146, lng: 151.193104684353 },
    { lat: -33.9710274338722, lng: 151.193166822195 },
    { lat: -33.9709989354014, lng: 151.193228513002 },
    { lat: -33.9709677547216, lng: 151.193287968636 },
    { lat: -33.9709335565567, lng: 151.193345189095 },
    { lat: -33.9708953350782, lng: 151.19339838624 },
    { lat: -33.9708530902863, lng: 151.193446666002 },
    { lat: -33.9708064869046, lng: 151.193489134312 },
    { lat: -33.9707561954856, lng: 151.193525344133 },
    { lat: -33.9706723764539, lng: 151.193582117558 },
    { lat: -33.9706194028258, lng: 151.193612515926 },
    { lat: -33.970564417541, lng: 151.193636208773 },
    { lat: -33.9705074205995, lng: 151.193651407957 },
    { lat: -33.9704490825534, lng: 151.19365721941 },
    { lat: -33.9703907445073, lng: 151.193654090166 },
    { lat: -33.9703330770135, lng: 151.19364246726 },
    { lat: -33.9702757447958, lng: 151.193627715111 },
    { lat: -33.9702187478542, lng: 151.193612962961 },
    { lat: -33.9701614156365, lng: 151.193598210812 },
  ]);
  source.snapToVertices = true;

  const result = matchDivisionObjects([registeredLeg, curvedBranch, stopbar], [source], [], {
    includeDiagnostics: true,
  });
  const registeredMatch = result.matches.find((match) => match.division.id === registeredLeg.id);
  const curvedMatch = result.matches.find((match) => match.division.id === curvedBranch.id);

  assert.ok(registeredMatch, JSON.stringify(result.diagnostics.pipeline));
  assert.ok(curvedMatch, JSON.stringify(result.diagnostics.pipeline));
  assert.ok(
    Math.abs(registeredMatch.row.sourceRangeEndMeters - curvedMatch.row.sourceRangeStartMeters) <
      0.001
  );
  assert.ok(curvedMatch.row.sourceRangeStartMeters > 95);
  assert.ok(curvedMatch.row.sourceRangeStartMeters < 115);
  const registeredAllocation = result.diagnostics.pipeline.allocationEvaluations.find(
    (evaluation) => evaluation.divisionId === registeredLeg.id
  );
  assert.equal(registeredAllocation.outcome, 'allocated');
  assert.equal(registeredAllocation.minimumBasis, 'registered-branch-stopbar-cell');
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === curvedBranch.id &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'exact-placement-registered-branch'
        )
    )
  );
});

test('keeps the YSSY A full-shape owner from its stopbar to the next exact source branch', () => {
  const shortRegistered = divisionLine('BARS_IM6IW', 'lead_on', [
    { lat: -33.94086636963844, lng: 151.17242652922872 },
    { lat: -33.94088806532446, lng: 151.17245167493823 },
    { lat: -33.94090725765748, lng: 151.17247212678197 },
    { lat: -33.94093590707409, lng: 151.17249894887212 },
    { lat: -33.9409614968361, lng: 151.172522418201 },
    { lat: -33.94098597399258, lng: 151.17254085838798 },
    { lat: -33.94102018636994, lng: 151.17256332188848 },
    { lat: -33.941086222708236, lng: 151.17259821758512 },
  ]);
  const primary = divisionLine('BARS_EZ62P', 'lead_on', [
    { lat: -33.9408451607938, lng: 151.17253564942854 },
    { lat: -33.9413990007422, lng: 151.17267940008426 },
  ]);
  const nextBranch = divisionLine('BARS_94WSQ', 'lead_on', [
    { lat: -33.94124752435405, lng: 151.17264008388534 },
    { lat: -33.94128882532082, lng: 151.1726635528905 },
    { lat: -33.941328060072436, lng: 151.17268835484907 },
    { lat: -33.9413725817545, lng: 151.17272756875653 },
    { lat: -33.94140986864531, lng: 151.17277147492644 },
    { lat: -33.94144075553502, lng: 151.17282208432837 },
    { lat: -33.94146830329208, lng: 151.1728790618008 },
    { lat: -33.94148611193835, lng: 151.17293570411158 },
    { lat: -33.94149724234039, lng: 151.1729950277152 },
    { lat: -33.94150225102086, lng: 151.17305569196523 },
    { lat: -33.94150197276083, lng: 151.17310060361993 },
    { lat: -33.94149331710569, lng: 151.17313798574256 },
  ]);
  const stopbar = divisionLine('A-stopbar', 'stopbar', [
    { lat: -33.9408411830664, lng: 151.172440634871 },
    { lat: -33.9408411830664, lng: 151.172640634871 },
  ]);
  const source = inferredPlacementLine('5e9357eda98db92d', 'taxi-centerline', [
    { lat: -33.9404408633709, lng: 151.172436922789 },
    { lat: -33.9404981955886, lng: 151.172451674938 },
    { lat: -33.9405551925302, lng: 151.172466427088 },
    { lat: -33.9406125247478, lng: 151.172481626272 },
    { lat: -33.9406695216894, lng: 151.172496378422 },
    { lat: -33.9407268539071, lng: 151.172511130571 },
    { lat: -33.9407841861248, lng: 151.172525882721 },
    { lat: -33.9408411830664, lng: 151.172540634871 },
    { lat: -33.9408981800079, lng: 151.172555834055 },
    { lat: -33.9409555122256, lng: 151.172571480274 },
    { lat: -33.9410125091672, lng: 151.172586679459 },
    { lat: -33.9410695061088, lng: 151.172602325678 },
    { lat: -33.9411265030503, lng: 151.172617524862 },
    { lat: -33.9411834999919, lng: 151.172633171082 },
    { lat: -33.9412404969335, lng: 151.172649264336 },
    { lat: -33.9412941411138, lng: 151.172676980495 },
    { lat: -33.9413437619805, lng: 151.172714531422 },
    { lat: -33.9413883537054, lng: 151.172760128975 },
    { lat: -33.9414265751839, lng: 151.172812879086 },
    { lat: -33.9414574205875, lng: 151.172872781754 },
    { lat: -33.9414795488119, lng: 151.172937601805 },
    { lat: -33.9414919540286, lng: 151.173006445169 },
    { lat: -33.9414882659912, lng: 151.173075735569 },
    { lat: -33.9414721727371, lng: 151.173143237829 },
    { lat: -33.9414564147592, lng: 151.173211187124 },
    { lat: -33.9414403215051, lng: 151.173278689384 },
    { lat: -33.941424228251, lng: 151.17334663868 },
    { lat: -33.9414088055491, lng: 151.173411458731 },
  ]);
  source.snapToVertices = true;

  const result = matchDivisionObjects(
    [shortRegistered, primary, nextBranch, stopbar],
    [source],
    [],
    { includeDiagnostics: true }
  );
  const primaryMatch = result.matches.find((match) => match.division.id === primary.id);
  const nextMatch = result.matches.find((match) => match.division.id === nextBranch.id);

  assert.ok(primaryMatch);
  assert.ok(nextMatch);
  assert.equal(
    result.matches.some((match) => match.division.id === shortRegistered.id),
    false
  );
  assert.equal(
    result.diagnostics.pipeline.ownershipEdges.some(
      (edge) => edge.divisionId === shortRegistered.id
    ),
    false
  );
  assert.ok(primaryMatch.row.sourceRangeStartMeters > 40);
  assert.ok(primaryMatch.row.sourceRangeStartMeters < 50);
  assert.ok(
    Math.abs(primaryMatch.row.sourceRangeEndMeters - nextMatch.row.sourceRangeStartMeters) < 0.001
  );
  assert.ok(primaryMatch.row.sourceRangeEndMeters > 88);
  assert.ok(primaryMatch.row.sourceRangeEndMeters < 95);
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === primary.id &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'exact-placement-full-shape-start'
        )
    )
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

test('drops an inferior native row when the division has a cleaner complete match', () => {
  const divisions = [
    divisionLine('native-secondary-owner', 'taxiway', [point(0, 0), point(20, 0)]),
    divisionLine('native-primary-owner', 'taxiway', [point(20, 4), point(80, 19)]),
  ];
  const rows = [
    simulatorLine('native-secondary-own-row', 'taxi-centerline', [point(0, 0.3), point(20, 0.3)]),
    simulatorLine('native-primary-row', 'taxi-centerline', [point(-40, -11), point(80, 19)]),
  ];

  const result = matchDivisionObjects(divisions, rows, [], { includeDiagnostics: true });
  const secondarySources = result.matches
    .filter((match) => match.division.id === 'native-secondary-owner')
    .map((match) => match.simulatorGroupId ?? match.row.sourceParentRowId ?? match.row.id);

  assert.deepEqual(
    secondarySources,
    ['native-secondary-own-row'],
    JSON.stringify(result.diagnostics.pipeline.ownershipEdges)
  );
  assert.ok(result.matches.some((match) => match.division.id === 'native-primary-owner'));
});

test('keeps the EGLL trunk hand-off at its shared Division point and drops the branch duplicate', () => {
  const trunkBefore = divisionLine('BARS_L4LMW', 'taxiway', [
    { lat: 51.4760851, lng: -0.460288 },
    { lat: 51.476037, lng: -0.4603721 },
    { lat: 51.4759992, lng: -0.4604579 },
    { lat: 51.4759776, lng: -0.4605262 },
    { lat: 51.4759589, lng: -0.4606174 },
    { lat: 51.4759454, lng: -0.4607389 },
  ]);
  const branch = divisionLine('BARS_MM2E5', 'taxiway', [
    { lat: 51.4758286, lng: -0.4606555 },
    { lat: 51.4759391, lng: -0.4604949 },
    { lat: 51.4760851, lng: -0.460288 },
  ]);
  const trunkAfter = divisionLine('BARS_XCCUW', 'taxiway', [
    { lat: 51.4760851, lng: -0.460288 },
    { lat: 51.4763615, lng: -0.4599067 },
  ]);
  const trunk = simulatorLine('2664efe0c2ab8669', 'taxi-centerline', [
    { lat: 51.47595025599003, lng: -0.46070292592048645 },
    { lat: 51.47595897316933, lng: -0.4606229066848755 },
    { lat: 51.47597003728151, lng: -0.46056121587753296 },
    { lat: 51.47598545998335, lng: -0.4605022072792053 },
    { lat: 51.4759985357523, lng: -0.46046286821365356 },
    { lat: 51.47604212164879, lng: -0.46036094427108765 },
    { lat: 51.476070284843445, lng: -0.46030908823013306 },
    { lat: 51.4761021360755, lng: -0.4602612555027008 },
    { lat: 51.47615008056164, lng: -0.46019285917282104 },
    { lat: 51.47632643580437, lng: -0.4599429666996002 },
  ]);
  const branchRow = simulatorLine('cb3fc3d6b7283ac0', 'taxi-centerline', [
    { lat: 51.475834250450134, lng: -0.4606407880783081 },
    { lat: 51.47590398788452, lng: -0.4605419933795929 },
    { lat: 51.47597540169954, lng: -0.4604409635066986 },
    { lat: 51.476052179932594, lng: -0.46033233404159546 },
  ]);
  trunk.snapToVertices = true;
  branchRow.snapToVertices = true;

  const result = matchDivisionObjects([trunkBefore, branch, trunkAfter], [trunk, branchRow], [], {
    includeDiagnostics: true,
  });
  const beforeMatch = result.matches.find(
    (match) => match.division.id === trunkBefore.id && match.row.sourceParentRowId === trunk.id
  );
  const afterMatch = result.matches.find(
    (match) => match.division.id === trunkAfter.id && match.row.sourceParentRowId === trunk.id
  );
  const branchSources = result.matches
    .filter((match) => match.division.id === branch.id)
    .map((match) => match.row.sourceParentRowId ?? match.row.id);

  assert.ok(beforeMatch);
  assert.ok(afterMatch);
  assert.ok(beforeMatch.row.sourceRangeEndMeters > 31);
  assert.ok(beforeMatch.row.sourceRangeEndMeters < 34);
  assert.equal(beforeMatch.row.sourceRangeEndMeters, afterMatch.row.sourceRangeStartMeters);
  assert.deepEqual(branchSources, [branchRow.id]);
  assert.ok(
    result.diagnostics.pipeline.allocationEvaluations.some(
      (evaluation) =>
        evaluation.divisionId === trunkBefore.id &&
        evaluation.partitionBoundaries.some(
          (boundary) => boundary.basis === 'shared-division-geometry'
        )
    )
  );
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

test('does not give BARS_00P2W an overlapping row when both objects have complete source rows', () => {
  const divisions = [
    divisionLine('BARS_EXISTING', 'lead_on', [point(0, 0), point(100, 0)]),
    divisionLine('BARS_00P2W', 'lead_on', [point(0, 3), point(100, 3)]),
  ];
  const existingRow = simulatorLine('2a4bf15557afdf6d', 'taxi-centerline', [
    point(0, 0),
    point(100, 0),
  ]);
  const ownRow = simulatorLine('00p2w-own-row', 'lead-on', [point(0, 3), point(100, 3)]);

  const result = matchDivisionObjects(divisions, [existingRow, ownRow]);
  const ownersFor = (sourceId) =>
    result.matches
      .filter((match) => (match.row.sourceParentRowId ?? match.row.id) === sourceId)
      .map((match) => match.division.id);

  assert.deepEqual(ownersFor(existingRow.id), ['BARS_EXISTING']);
  assert.deepEqual(ownersFor(ownRow.id), ['BARS_00P2W']);
});

test('keeps a whole source-contained row away from a claimant with its own complete row', () => {
  const divisions = [
    divisionLine('BARS_MJS5W', 'lead_on', [point(0, 0), point(130, 0)]),
    divisionLine('BARS_00P2W', 'lead_on', [point(90, 3), point(120, 3), point(145, 18)]),
  ];
  const existingRow = simulatorLine('2a4bf15557afdf6d', 'taxi-centerline', [
    point(20, 0),
    point(120, 0),
  ]);
  const ownRow = simulatorLine('bc82468176c80bfd', 'taxi-centerline', [
    point(90, 3),
    point(120, 3),
    point(145, 18),
  ]);

  const result = matchDivisionObjects(divisions, [existingRow, ownRow]);
  const ownersFor = (sourceId) =>
    result.matches
      .filter((match) => (match.row.sourceParentRowId ?? match.row.id) === sourceId)
      .map((match) => match.division.id);

  assert.deepEqual(ownersFor(existingRow.id), ['BARS_MJS5W']);
  assert.deepEqual(ownersFor(ownRow.id), ['BARS_00P2W']);
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
  const removalFeatures = output.geojson.features.filter(
    (feature) => feature.properties?.featureType === 'removal'
  );
  assert.ok(removalFeatures.length > 0);
  assert.ok(removalFeatures.every((feature) => feature.properties.sourceLines.length > 0));
});

test('tags only compiled endpoint targets for the slightly larger Core support', () => {
  const division = divisionLine('compiled-endpoint', 'taxiway', [point(0, 0), point(18, 0)]);
  const simulator = {
    ...simulatorLine('compiled-endpoint-row', 'taxi-centerline', [point(0, 0), point(18, 0)]),
    spacing: 4,
    snapToVertices: true,
    compiledLightPlacement: 'spacing',
    removalTargetSampling: 'spacing',
  };
  const matching = matchDivisionObjects([division], [simulator]);

  const output = buildDraftOutput(
    { instances: [], lightRows: [simulator], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
  assert.match(output.xml, /supportSizeMeters="0\.750"/);
});

test('accepts a spacing-backed section that contains no physical light', () => {
  const division = divisionLine('taxi-gap', 'taxiway', [point(5, 0), point(7, 0)]);
  const row = {
    ...simulatorLine('sim-spacing-gap', 'taxi-centerline', [point(5, 0), point(7, 0)]),
    spacing: 4,
    removalTargetSampling: 'spacing',
    sourceParentRowId: 'sim-spacing-parent',
    sourceRangeStartMeters: 5,
    sourceRangeEndMeters: 7,
    sourceParentLengthMeters: 20,
  };
  const matching = {
    matches: [{ division, row, score: 1 }],
    unmatched: [],
    duplicateDivisionLeadOns: [],
    duplicateSimulatorLeadOns: [],
    mergedSimulatorRows: [],
  };

  const output = buildDraftOutput(
    { instances: [], lightRows: [row], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.removalApproved.length, 1, JSON.stringify(output.safetyRejections));
  assert.equal(output.safetyRejections.length, 0);
  assert.equal(
    output.removals.reduce((count, removal) => count + (removal.targetLightPoints?.length ?? 0), 0),
    0
  );
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

test('keeps a matched BARS object successful when its remover is rejected', () => {
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
  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.safetyRejections.length, 1);
  assert.match(output.xml, /displayName="lead-protected"/);
  assert.ok(
    output.geojson.features.some((feature) => feature.properties.featureType === 'matched')
  );
  assert.equal(
    output.geojson.features.some((feature) => feature.properties.featureType === 'unsafe'),
    false
  );
});

test('removes a matched stopbar fully across an unselected taxiway light row', () => {
  const division = divisionLine('stopbar-across-taxiway', 'stopbar', [point(0, -10), point(0, 10)]);
  const stopbar = simulatorLine('sim-stopbar', 'stopbar', [point(0, -10), point(0, 10)]);
  const taxiway = simulatorLine('sim-taxiway', 'taxi-centerline', [point(-20, 0), point(20, 0)]);
  const matching = matchDivisionObjects([division], [stopbar, taxiway]);

  const output = buildDraftOutput(
    { instances: [], lightRows: [stopbar, taxiway], mustKeepZones: [] },
    matching,
    { icao: 'TEST', altitude: 0 }
  );

  assert.equal(output.removalWarnings.length, 0, JSON.stringify(output.safetyRejections));
  assert.deepEqual(
    output.removalApproved.map((match) => match.division.id),
    ['stopbar-across-taxiway']
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

  assert.equal(output.removalWarnings.length, 0);
  assert.deepEqual(
    output.safetyRejections.map((item) => item.divisionId),
    ['first']
  );
  assert.deepEqual(
    output.removalApproved.map((match) => match.division.id),
    ['second']
  );
});

test('keeps the inferred runway centreline envelope protected from direct target rows', () => {
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

  assert.equal(output.removalWarnings.length, 0);
  assert.equal(output.removalApproved.length, 0);
  assert.deepEqual(
    output.safetyRejections.map((item) => item.divisionId),
    ['runway-lead-on']
  );
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
