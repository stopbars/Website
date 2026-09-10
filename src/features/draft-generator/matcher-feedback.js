export const MATCHER_FEEDBACK_SCHEMA = 'bars-draft-matcher-feedback/v2';

export function findFullMatcherFeature(renderedFeature, featureCollection) {
  const properties = renderedFeature?.properties ?? {};
  const featureType = String(properties.featureType ?? '');
  const identityProperty = featureType === 'division-original' ? 'divisionId' : 'simulatorRowId';
  const identity = String(properties[identityProperty] ?? '');
  if (!identity || !Array.isArray(featureCollection?.features)) return null;
  return (
    featureCollection.features.find(
      (feature) =>
        String(feature?.properties?.featureType ?? '') === featureType &&
        String(feature?.properties?.[identityProperty] ?? '') === identity
    ) ?? null
  );
}

export function buildMatcherFeedbackReport({
  diagnostic,
  divisionFeature,
  simulatorFeature,
  expectedScope = 'whole-row',
  sectionSelection = null,
  comment = '',
}) {
  const divisionId = String(divisionFeature?.properties?.divisionId ?? '');
  const simulatorIds = selectedSimulatorIds(simulatorFeature);
  const selectedSimulatorId = String(
    simulatorFeature?.properties?.simulatorRowId ?? simulatorFeature?.properties?.title ?? ''
  );
  const matching = diagnostic?.matching ?? {};
  const matcherDiagnostics = matching.diagnostics ?? {};
  const pipeline = matcherDiagnostics.pipeline ?? {};
  const extractedRows = (diagnostic?.extraction?.lightRows ?? []).filter((row) =>
    rowIdentifiers(row).some((id) => simulatorIds.has(id))
  );
  const sourceInstanceIds = new Set(
    extractedRows.flatMap((row) => (row.sourceInstanceIds ?? []).map(String))
  );
  const divisionEvaluations = (matcherDiagnostics.compatibleRowCandidateEvaluations ?? []).filter(
    (evaluation) => String(evaluation.divisionId ?? '') === divisionId
  );

  return {
    schema: MATCHER_FEEDBACK_SCHEMA,
    intent: 'The selected division object should match the selected simulator geometry.',
    generatedAt: new Date().toISOString(),
    request: {
      icao: diagnostic?.request?.icao,
      simulator: diagnostic?.request?.simulator,
      packageName: diagnostic?.request?.packageName,
      altitudeMeters: diagnostic?.request?.altitudeMeters,
    },
    selection: {
      division: selectedFeature(divisionFeature, {
        id: divisionId,
        source: 'division-data',
        generatorInput: (diagnostic?.request?.divisionObjects ?? []).find(
          (division) => String(division.id ?? '') === divisionId
        ),
      }),
      simulator: selectedFeature(simulatorFeature, {
        id: selectedSimulatorId,
        source: 'simulator-geometry',
        relatedIds: [...simulatorIds],
      }),
    },
    expectedMatch: {
      scope: expectedScope,
      comment: comment.trim() || null,
      section: expectedScope === 'section' ? sectionSelection : null,
    },
    currentOutcome: {
      matchesForDivision: (matching.matches ?? []).filter(
        (match) => String(match.division?.id ?? '') === divisionId
      ),
      matchesForSelectedSimulator: (matching.matches ?? []).filter((match) =>
        rowIdentifiers(match.row).some((id) => simulatorIds.has(id))
      ),
      unmatchedDivision: (matching.unmatched ?? []).filter(
        (item) => String(item.division?.id ?? '') === divisionId
      ),
    },
    matcherEvidence: {
      configuration: matcherDiagnostics.configuration,
      division: (matcherDiagnostics.divisionObjects ?? []).filter(
        (item) => String(item.id ?? '') === divisionId
      ),
      selectedSimulatorCandidates: (matcherDiagnostics.simulatorCandidates ?? []).filter((item) =>
        rowIdentifiers(item).some((id) => simulatorIds.has(id))
      ),
      candidateSummary: matcherDiagnostics.compatibleRowCandidateSummary,
      candidateEvaluationsForDivision: divisionEvaluations,
      selectedPairEvaluations: divisionEvaluations.filter((evaluation) =>
        simulatorIds.has(String(evaluation.simulatorCandidateId ?? ''))
      ),
      pipelineForDivision: filterPipeline(pipeline, (record) =>
        recordHasDivision(record, divisionId)
      ),
      pipelineForSelectedSimulator: filterPipeline(pipeline, (record) =>
        recordHasSimulator(record, simulatorIds)
      ),
      instanceEvaluationsForDivision: (
        matcherDiagnostics.instanceCandidateEvaluations ?? []
      ).filter((evaluation) => String(evaluation.divisionId ?? '') === divisionId),
    },
    sourceEvidence: {
      selectedRows: extractedRows,
      selectedInstances: (diagnostic?.extraction?.instances ?? []).filter((instance) =>
        sourceInstanceIds.has(String(instance.id ?? ''))
      ),
      packageScan: diagnostic?.package?.scan,
      sourceFiles: [...new Set(compactMap(extractedRows, (row) => row.sourceFile))],
    },
    generationEvidence: relatedGenerationEvidence(diagnostic?.generation, divisionId, simulatorIds),
    notes: [
      'Candidate diagnostics are bounded per division. The candidate summary reports omitted rows.',
      'Geometry coordinates are longitude, latitude pairs.',
    ],
  };
}

export function snapMatcherSectionPoint(simulatorFeature, clickCoordinate) {
  const coordinates = simulatorFeature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const referenceLatitude =
    coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length;
  const segmentLengths = [];
  let totalLengthMeters = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const length = coordinateDistanceMeters(
      coordinates[index],
      coordinates[index + 1],
      referenceLatitude
    );
    segmentLengths.push(length);
    totalLengthMeters += length;
  }

  let best = null;
  let distanceBeforeSegment = 0;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const projected = projectCoordinateToSegment(
      clickCoordinate,
      coordinates[index],
      coordinates[index + 1],
      referenceLatitude
    );
    if (!best || projected.distanceMeters < best.distanceFromClickMeters) {
      const distanceAlongRowMeters =
        distanceBeforeSegment + segmentLengths[index] * projected.segmentFraction;
      best = {
        coordinate: projected.coordinate,
        fractionAlongRow: totalLengthMeters > 0 ? distanceAlongRowMeters / totalLengthMeters : 0,
        distanceAlongRowMeters,
        distanceFromClickMeters: projected.distanceMeters,
        segmentIndex: index,
        segmentFraction: projected.segmentFraction,
      };
    }
    distanceBeforeSegment += segmentLengths[index];
  }

  if (!best) return null;
  const endpointTolerance = Math.min(1, totalLengthMeters * 0.01);
  return {
    ...best,
    totalRowLengthMeters: totalLengthMeters,
    rowEndpoint:
      best.distanceAlongRowMeters <= endpointTolerance
        ? 'start'
        : totalLengthMeters - best.distanceAlongRowMeters <= endpointTolerance
          ? 'end'
          : null,
  };
}

export function buildMatcherSectionSelection(simulatorFeature, points) {
  if (!Array.isArray(points) || points.length !== 2) return null;
  const coordinates = simulatorFeature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [start, end] = points;
  return {
    pickedStart: sectionPointReport(start),
    pickedEnd: sectionPointReport(end),
    lengthMeters: Math.abs(end.distanceAlongRowMeters - start.distanceAlongRowMeters),
    geometry: {
      type: 'LineString',
      coordinates: sliceLineCoordinates(coordinates, start, end),
    },
  };
}

function sectionPointReport(point) {
  return {
    coordinate: point.coordinate,
    fractionAlongRow: point.fractionAlongRow,
    distanceAlongRowMeters: point.distanceAlongRowMeters,
    rowEndpoint: point.rowEndpoint,
  };
}

function sliceLineCoordinates(coordinates, start, end) {
  const reversed = start.distanceAlongRowMeters > end.distanceAlongRowMeters;
  const first = reversed ? end : start;
  const last = reversed ? start : end;
  const sliced = [first.coordinate];
  for (let index = first.segmentIndex + 1; index <= last.segmentIndex; index += 1) {
    sliced.push(coordinates[index]);
  }
  if (!coordinatesEqual(sliced.at(-1), last.coordinate)) sliced.push(last.coordinate);
  return reversed ? sliced.reverse() : sliced;
}

function projectCoordinateToSegment(point, start, end, referenceLatitude) {
  const metersPerLongitude = 111_320 * Math.cos((referenceLatitude * Math.PI) / 180);
  const metersPerLatitude = 111_320;
  const segmentX = (end[0] - start[0]) * metersPerLongitude;
  const segmentY = (end[1] - start[1]) * metersPerLatitude;
  const pointX = (point[0] - start[0]) * metersPerLongitude;
  const pointY = (point[1] - start[1]) * metersPerLatitude;
  const squaredLength = segmentX * segmentX + segmentY * segmentY;
  const segmentFraction =
    squaredLength > 0
      ? Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / squaredLength))
      : 0;
  const coordinate = [
    start[0] + (end[0] - start[0]) * segmentFraction,
    start[1] + (end[1] - start[1]) * segmentFraction,
  ];
  return {
    coordinate,
    segmentFraction,
    distanceMeters: coordinateDistanceMeters(point, coordinate, referenceLatitude),
  };
}

function coordinateDistanceMeters(left, right, referenceLatitude) {
  const x = (right[0] - left[0]) * 111_320 * Math.cos((referenceLatitude * Math.PI) / 180);
  const y = (right[1] - left[1]) * 111_320;
  return Math.hypot(x, y);
}

function coordinatesEqual(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function selectedFeature(feature, identity) {
  return {
    ...identity,
    properties: feature?.properties ?? {},
    geometry: feature?.geometry ?? null,
  };
}

function selectedSimulatorIds(feature) {
  const properties = feature?.properties ?? {};
  const ids = [properties.simulatorRowId, properties.title];
  if (Array.isArray(properties.sourceRowIds)) ids.push(...properties.sourceRowIds);
  if (typeof properties.sourceRowIds === 'string') ids.push(...properties.sourceRowIds.split(','));
  return new Set(compactMap(ids, (id) => String(id ?? '').trim()));
}

function rowIdentifiers(row) {
  return compactMap(
    [row?.id, row?.sourceParentRowId, ...(row?.sourceRowIds ?? [])],
    (id) => String(id ?? '')
  );
}

function compactMap(values, transform) {
  const result = [];
  for (const value of values) {
    const transformed = transform(value);
    if (transformed) result.push(transformed);
  }
  return result;
}

function filterPipeline(pipeline, predicate) {
  return Object.fromEntries(
    Object.entries(pipeline).map(([stage, records]) => [
      stage,
      Array.isArray(records) ? records.filter(predicate) : records,
    ])
  );
}

function recordHasDivision(record, divisionId) {
  return String(record?.divisionId ?? record?.division?.id ?? '') === divisionId;
}

function recordHasSimulator(record, simulatorIds) {
  return [
    record?.simulatorCandidateId,
    record?.simulatorRowId,
    record?.row?.id,
    ...(record?.row?.sourceRowIds ?? []),
  ].some((id) => simulatorIds.has(String(id ?? '')));
}

function relatedGenerationEvidence(generation, divisionId, simulatorIds) {
  if (!generation) return {};
  const collections = [
    'replacements',
    'removalApproved',
    'placementOnlyMatches',
    'removalWarnings',
    'safetyRejections',
    'duplicateDivisionLeadOns',
    'duplicateSimulatorLeadOns',
    'guidanceStopbarBoundaryTrims',
    'removalStopbarBoundaryTrims',
  ];
  const related = {};
  for (const key of collections) {
    const records = generation[key];
    if (!Array.isArray(records)) continue;
    related[key] = records.filter(
      (record) => recordHasDivision(record, divisionId) || recordHasSimulator(record, simulatorIds)
    );
  }
  related.previewFeatures = (generation.draftPreviewGeojson?.features ?? []).filter(
    (feature) =>
      String(feature.properties?.divisionId ?? '') === divisionId ||
      simulatorIds.has(String(feature.properties?.sourceRowId ?? ''))
  );
  return related;
}
