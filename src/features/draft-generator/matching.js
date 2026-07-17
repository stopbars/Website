const METERS_PER_DEGREE_LATITUDE = 111_320;
const ROW_SECTION_PADDING_METERS = 0.75;
const MINIMUM_PARTITION_CENTER_SEPARATION_METERS = 4;
const MINIMUM_CONTESTED_ASSIGNMENT_SCORE = 0.65;
const MAXIMUM_WEAK_SECONDARY_OWNERSHIP_SCORE = 0.7;
const MINIMUM_PRIMARY_OWNERSHIP_SCORE = 0.78;
const MINIMUM_PRIMARY_OWNERSHIP_ADVANTAGE = 0.12;
const MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES = 20;
const MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS = 12;
const MINIMUM_ALLOCATED_LENGTH_RATIO = 0.4;
const MINIMUM_COMPOSITE_SOURCE_COVERAGE = 0.15;
const MAXIMUM_GUIDANCE_PARTITION_GAP_METERS = 40;
const MAXIMUM_GUIDANCE_END_EXTENSION_METERS = 15;
const MAXIMUM_SINGLE_OWNER_LENGTH_RATIO = 1.5;
const MAXIMUM_LOGICAL_TURN_SNAP_METERS = 8;
const MINIMUM_LOGICAL_TURN_DEGREES = 75;
const MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS = 15;
const NATURAL_BOUNDARY_PROXIMITY_METERS = 12;
const MINIMUM_STOPBAR_CROSSING_ANGLE_DEGREES = 35;
const MINIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS = 120;
const MAXIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS = 240;
const RECONSTRUCTED_LEAD_ON_EXTENSION_LENGTH_MULTIPLIER = 1.5;
const RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS = 0.6;
const MAXIMUM_CONNECTED_STOPBAR_ENDPOINT_GAP_METERS = 8;
const MAXIMUM_CONNECTED_STOPBAR_TURN_DEGREES = 100;
const MAXIMUM_CONNECTED_STOPBAR_LENGTH_METERS = 200;
const GUIDANCE_SOURCE_CLASSIFICATIONS = new Set(['lead-on', 'taxi-centerline']);
const GUIDANCE_DIVISION_TYPES = new Set(['lead_on', 'taxiway', 'stand']);

const TYPE_CONFIG = {
  stopbar: {
    label: 'stopbar',
    classifications: new Set(['stopbar']),
    instanceClassifications: new Set(['stopbar']),
    outputClassification: 'stopbar',
    instanceSearchDistance: 12,
    instanceMaximumGap: 11,
    instanceMinimumPoints: 3,
    instanceMinimumCoverage: 0.3,
    meanDistance: 8,
    maximumDistance: 18,
    coverageDistance: 7,
    minimumCoverage: 0.42,
    centerDistance: 20,
    maximumAngle: 45,
    minimumLengthRatio: 0.35,
    maximumLengthRatio: 2.8,
    minimumScore: 0.43,
    allowSourceContainment: false,
    registrationDistance: 40,
    registrationAngle: 30,
    minimumRegistrationScore: 0.6,
  },
  lead_on: {
    label: 'lead-on',
    classifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    instanceClassifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    outputClassification: 'lead-on',
    instanceSearchDistance: 11,
    instanceMaximumGap: 20,
    instanceMinimumPoints: 2,
    instanceMinimumCoverage: 0.24,
    meanDistance: 10,
    maximumDistance: 24,
    coverageDistance: 9,
    minimumCoverage: 0.4,
    centerDistance: 28,
    maximumAngle: 55,
    minimumLengthRatio: 0.3,
    maximumLengthRatio: 3.2,
    minimumScore: 0.41,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumContainedLengthRatio: 0.18,
    minimumProjectedSectionLengthRatio: 0.4,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    registrationDistance: 55,
    registrationAngle: 28,
    minimumRegistrationScore: 0.68,
  },
  taxiway: {
    label: 'taxiway centreline',
    classifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    instanceClassifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    outputClassification: 'taxi-centerline',
    instanceSearchDistance: 10,
    instanceMaximumGap: 20,
    instanceMinimumPoints: 2,
    instanceMinimumCoverage: 0.22,
    meanDistance: 12,
    maximumDistance: 30,
    coverageDistance: 10,
    minimumCoverage: 0.36,
    centerDistance: 36,
    maximumAngle: 65,
    minimumLengthRatio: 0.25,
    maximumLengthRatio: 4,
    minimumScore: 0.39,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumContainedLengthRatio: 0.18,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    registrationDistance: 55,
    registrationAngle: 28,
    minimumRegistrationScore: 0.68,
  },
  stand: {
    label: 'stand lead-in',
    classifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    instanceClassifications: GUIDANCE_SOURCE_CLASSIFICATIONS,
    outputClassification: 'taxi-centerline',
    instanceSearchDistance: 10,
    instanceMaximumGap: 18,
    instanceMinimumPoints: 2,
    instanceMinimumCoverage: 0.22,
    meanDistance: 12,
    maximumDistance: 28,
    coverageDistance: 10,
    minimumCoverage: 0.36,
    centerDistance: 34,
    maximumAngle: 65,
    minimumLengthRatio: 0.25,
    maximumLengthRatio: 4,
    minimumScore: 0.39,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumContainedLengthRatio: 0.18,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    registrationDistance: 55,
    registrationAngle: 28,
    minimumRegistrationScore: 0.68,
  },
};

export function matchDivisionObjects(
  divisionPoints,
  lightRows,
  instances = [],
  topologyRows = []
) {
  const simulatorRows = [...(lightRows ?? []), ...(topologyRows ?? [])];
  const referenceLatitude = findReferenceLatitude(divisionPoints, simulatorRows, instances);
  const preparedDivision = (divisionPoints ?? []).map((point, index) =>
    prepareDivisionPoint(point, index, referenceLatitude)
  );
  const preparedRows = simulatorRows
    .filter(isMatchableSimulatorRow)
    .map((row, index) => prepareSimulatorRow(row, index, referenceLatitude))
    .filter(Boolean);
  const preparedInstances = (instances ?? [])
    .filter(
      (instance) =>
        Number.isFinite(instance?.lat) &&
        Number.isFinite(instance?.lon) &&
        instance?.inferred !== true
    )
    .map((instance, index) => ({
      raw: instance,
      index,
      point: projectCoordinate(instance, referenceLatitude),
    }));

  const divisionDeduplication = collapseDuplicateLeadOns(preparedDivision, 'division');
  const rowDeduplication = mergeCoLocatedSimulatorRows(preparedRows, referenceLatitude);
  const matchableDivision = divisionDeduplication.kept.filter((item) => item.valid);
  const baseCandidates = rowDeduplication.kept.filter((item) => item.valid);
  const connectedStopbarCandidates = buildConnectedStopbarCandidates(
    baseCandidates,
    referenceLatitude
  );
  const candidates = [...baseCandidates, ...connectedStopbarCandidates];
  const edges = [];

  for (const division of matchableDivision) {
    const config = TYPE_CONFIG[division.raw.type];
    if (!config) continue;

    for (const candidate of candidates) {
      if (!config.classifications.has(candidate.raw.classification)) continue;
      const supportsLocalRegistration = isLocallyRegisterableSimulatorRow(candidate.raw);
      if (
        !boundsCouldMatch(division, candidate, config) &&
        (!supportsLocalRegistration ||
          boundsDistance(division.bounds, candidate.bounds) > config.registrationDistance)
      ) {
        continue;
      }

      const section = simulatorSectionForDivision(division, candidate, config, referenceLatitude);
      if (!section) continue;

      let matchingDivision = division;
      let metrics = scoreDivisionCandidateSection(
        division,
        section,
        config,
        referenceLatitude
      );
      if (!metrics.valid && supportsLocalRegistration) {
        const registration = locallyRegisteredSectionMetrics(division, section, config);
        if (registration) {
          matchingDivision = registration.division;
          metrics = registration.metrics;
        }
      }
      const sectionLengthRatio = section.length / Math.max(division.length, 0.001);
      const meetsSectionLength =
        !config.minimumProjectedSectionLengthRatio ||
        sectionLengthRatio >= config.minimumProjectedSectionLengthRatio ||
        isTightPartialMatch(metrics, sectionLengthRatio, config);
      if (metrics.valid && meetsSectionLength) {
        edges.push({ division: matchingDivision, candidate, section, metrics });
      }
    }
  }

  const matchedDivisionIds = new Set();
  const matches = [];
  const ownershipEdges = preferConnectedStopbarCompositeEdges(
    suppressWeakSecondaryCandidateOwners(suppressRedundantCompositeEdges(edges))
  );
  const allInstanceEdges = buildInstanceMatchEdges(matchableDivision, preparedInstances);
  const divisionsWithRealStopbarEvidence = new Set([
    ...ownershipEdges
      .filter(
        (edge) =>
          edge.division.raw.type === 'stopbar' &&
          !isHoldShortTopologyRow(edge.candidate.raw)
      )
      .map((edge) => stableIdentifier(edge.division)),
    ...allInstanceEdges
      .filter((edge) => edge.division.raw.type === 'stopbar')
      .map((edge) => stableIdentifier(edge.division)),
  ]);
  const selectedHoldShortEdges = selectHoldShortFallbackEdges(
    ownershipEdges,
    divisionsWithRealStopbarEvidence
  );
  const selectableOwnershipEdges = ownershipEdges.filter(
    (edge) =>
      !isHoldShortTopologyRow(edge.candidate.raw) || selectedHoldShortEdges.has(edge)
  );
  const selectedHoldShortCandidateIds = new Set(
    [...selectedHoldShortEdges].map((edge) => stableIdentifier(edge.candidate))
  );
  const boundaryCandidates = candidates.filter(
    (candidate) =>
      !isHoldShortTopologyRow(candidate.raw) ||
      selectedHoldShortCandidateIds.has(stableIdentifier(candidate))
  );
  const allocatedEdges = allocateSimulatorGeometry(
    selectableOwnershipEdges,
    referenceLatitude,
    boundaryCandidates
  );
  for (const edge of allocatedEdges) {
    const divisionKey = stableIdentifier(edge.division);
    const sourceSections = sourceSectionsForMergedCandidate(edge, referenceLatitude);
    if (sourceSections.length === 0) continue;

    matchedDivisionIds.add(divisionKey);
    const replacementRow = rowWithDivisionClassification(
      simplifyReconstructedReplacementRow(
        edge.section.prepared.raw,
        edge.division.raw.type
      ),
      configFor(edge.division)
    );
    for (const { section } of sourceSections) {
      matches.push({
        division: edge.division.raw,
        row: rowWithDivisionClassification(section.prepared.raw, configFor(edge.division)),
        replacementRow,
        simulatorGroupId: edge.candidate.raw.id,
        score: edge.metrics.score,
        metrics: edge.metrics,
      });
    }
  }

  const usedInstanceIds = new Set(matches.flatMap((match) => match.row.sourceInstanceIds ?? []));
  const rowBackedInstanceIds = new Set(
    candidates.flatMap((candidate) => candidate.raw.sourceInstanceIds ?? [])
  );
  const instanceEdges = allInstanceEdges.filter(
    (edge) =>
      !matchedDivisionIds.has(stableIdentifier(edge.division)) &&
      edgeSourceInstances(edge).every(
        (instance) =>
          !usedInstanceIds.has(instance.raw.id) &&
          !rowBackedInstanceIds.has(instance.raw.id)
      )
  );
  for (const edge of instanceEdges) {
    const divisionKey = stableIdentifier(edge.division);
    const edgeInstances = edgeSourceInstances(edge);
    if (matchedDivisionIds.has(divisionKey)) continue;
    if (edgeInstances.some((instance) => usedInstanceIds.has(instance.raw.id))) continue;

    const row = instanceBackedRow(edge);
    matchedDivisionIds.add(divisionKey);
    for (const instance of edgeInstances) usedInstanceIds.add(instance.raw.id);
    matches.push({
      division: edge.division.raw,
      row,
      score: edge.metrics.score,
      metrics: edge.metrics,
    });
  }

  const unmatched = [];
  for (const division of divisionDeduplication.kept) {
    if (matchedDivisionIds.has(stableIdentifier(division))) continue;

    const config = TYPE_CONFIG[division.raw.type];
    const alignedEdges = ownershipEdges.filter(
      (edge) => stableIdentifier(edge.division) === stableIdentifier(division)
    );
    if (!division.valid) {
      unmatched.push({
        division: division.raw,
        reason: 'This division object has no usable line shape. Add it manually to the draft.',
      });
      continue;
    }
    if (!config) {
      unmatched.push({
        division: division.raw,
        reason:
          'This division object type is not supported by automatic matching. Add it manually.',
      });
      continue;
    }

    const classWasDetected =
      candidates.some((candidate) => config.classifications.has(candidate.raw.classification)) ||
      preparedInstances.some((instance) =>
        config.instanceClassifications.has(instance.raw.classification)
      );
    unmatched.push({
      division: division.raw,
      reason:
        alignedEdges.length > 0
          ? `Aligned simulator ${config.label} geometry was already assigned to a better overlapping division object. Add this object manually.`
          : classWasDetected
            ? `No suitably aligned simulator ${config.label} was found. Add this object manually.`
            : `No simulator ${config.label} lighting was detected. Add this object manually.`,
      alignmentCandidates: alignedEdges.slice(0, 3).map((edge) => ({
        simulatorRowId: edge.candidate.raw.id,
        score: edge.metrics.score,
        sourceRangeStartMeters: round(edge.section.start, 3),
        sourceRangeEndMeters: round(edge.section.end, 3),
      })),
    });
  }

  return {
    matches: matches.sort((left, right) =>
      String(left.division.id).localeCompare(String(right.division.id))
    ),
    unmatched,
    duplicateDivisionLeadOns: divisionDeduplication.duplicateIds,
    duplicateSimulatorLeadOns: rowDeduplication.duplicateIds,
    mergedSimulatorRows: [
      ...rowDeduplication.mergedRows,
      ...connectedStopbarCandidates.map((candidate) => candidate.raw),
    ],
  };
}

export function scorePolylineMatch(divisionPoint, simulatorRow) {
  const referenceLatitude = findReferenceLatitude([divisionPoint], [simulatorRow]);
  const division = prepareDivisionPoint(divisionPoint, 0, referenceLatitude);
  const candidate = prepareSimulatorRow(simulatorRow, 0, referenceLatitude);
  const config = TYPE_CONFIG[divisionPoint?.type];
  if (!division.valid || !candidate?.valid || !config) return null;
  if (!config.classifications.has(simulatorRow?.classification)) return null;
  return comparePreparedPolylines(division, candidate, config);
}

function isMatchableSimulatorRow(row) {
  if (row?.inferred !== true) return true;
  return (
    row.sourceType === 'inferred-bgl-placement-row' &&
    row.reconstructMode === 'exact-bgl-placement-control-points' &&
    Array.isArray(row.sourceInstanceIds) &&
    row.sourceInstanceIds.length >= 2
  );
}

function isExactPlacementRow(row) {
  return (
    row?.inferred === true &&
    row.sourceType === 'inferred-bgl-placement-row' &&
    row.reconstructMode === 'exact-bgl-placement-control-points'
  );
}

function isHoldShortTopologyRow(row) {
  return row?.topologyOnly === true && row?.noRemovalRequired === true;
}

function isLocallyRegisterableSimulatorRow(row) {
  return isExactPlacementRow(row) || isHoldShortTopologyRow(row);
}

function selectHoldShortFallbackEdges(edges, divisionsWithRealStopbarEvidence) {
  const preferredByDivision = new Map();
  for (const edge of edges) {
    if (!isHoldShortTopologyRow(edge.candidate.raw)) continue;
    const divisionKey = stableIdentifier(edge.division);
    if (divisionsWithRealStopbarEvidence.has(divisionKey)) continue;
    const current = preferredByDivision.get(divisionKey);
    if (
      !current ||
      edge.metrics.score > current.metrics.score ||
      (edge.metrics.score === current.metrics.score &&
        stableIdentifier(edge.candidate).localeCompare(stableIdentifier(current.candidate)) < 0)
    ) {
      preferredByDivision.set(divisionKey, edge);
    }
  }

  const byCandidate = new Map();
  for (const edge of preferredByDivision.values()) {
    const candidateKey = stableIdentifier(edge.candidate);
    const candidateEdges = byCandidate.get(candidateKey) ?? [];
    candidateEdges.push(edge);
    byCandidate.set(candidateKey, candidateEdges);
  }
  return new Set(
    [...byCandidate.values()].flatMap((candidateEdges) =>
      chooseDistinctCandidateAssignments(candidateEdges)
    )
  );
}

function prepareDivisionPoint(point, index, referenceLatitude) {
  const coordinates = normalizeDivisionCoordinates(point?.coordinates);
  return preparePolyline(point, coordinates, index, referenceLatitude);
}

function prepareSimulatorRow(row, index, referenceLatitude) {
  const coordinates = (row?.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => ({ lat: vertex.lat, lon: vertex.lon }));
  return preparePolyline(row, coordinates, index, referenceLatitude);
}

function preparePolyline(raw, coordinates, index, referenceLatitude) {
  const cleanedCoordinates = removeConsecutiveCoordinateDuplicates(coordinates);
  const projected = cleanedCoordinates.map((point) => projectCoordinate(point, referenceLatitude));
  if (projected.length < 2) {
    return {
      raw,
      index,
      valid: false,
      coordinates: cleanedCoordinates,
      projected,
      samples: projected,
    };
  }

  const length = polylineLength(projected);
  const samples = samplePolyline(projected, Math.min(32, Math.max(7, Math.ceil(length / 5) + 1)));
  const center = polylineCenter(projected);
  return {
    raw,
    index,
    valid: length >= 0.2,
    coordinates: cleanedCoordinates,
    projected,
    samples,
    length,
    center,
    bounds: pointBounds(projected),
    orientation: principalOrientation(projected, center),
  };
}

function simulatorSectionForDivision(division, candidate, config, referenceLatitude) {
  const projections = division.samples.map((sample) =>
    projectPointToPolyline(sample, candidate.projected)
  );
  if (projections.length === 0) return null;
  const alignedRun =
    division.raw.type === 'stopbar'
      ? null
      : bestAlignedProjectionRun(
          projections,
          config.containmentMeanDistance ?? config.meanDistance,
          Math.max(
            20,
            (division.length / Math.max(projections.length - 1, 1)) * 4
          )
        );
  const sectionProjections = alignedRun ?? projections;
  const projectionStart = Math.max(
    0,
    Math.min(...sectionProjections.map((projection) => projection.along))
  );
  const projectionEnd = Math.min(
    candidate.length,
    Math.max(...sectionProjections.map((projection) => projection.along))
  );
  const projectionCenter = median(sectionProjections.map((projection) => projection.along));
  // Division lines are intentionally simplified display geometry. Score the projected
  // simulator subsection first even when both complete lines happen to have similar lengths;
  // whole-source ownership is restored later by allocateSimulatorGeometry.
  const canSplit = division.raw.type !== 'stopbar' && candidate.length >= 5;
  if (!canSplit) {
    return {
      prepared: candidate,
      start: 0,
      end: candidate.length,
      length: candidate.length,
      split: false,
      projectionStart,
      projectionEnd,
      projectionCenter,
    };
  }

  const start = Math.max(
    0,
    projectionStart - ROW_SECTION_PADDING_METERS
  );
  const end = Math.min(
    candidate.length,
    projectionEnd + ROW_SECTION_PADDING_METERS
  );
  if (end - start < 0.2) return null;
  if (start <= 0.05 && end >= candidate.length - 0.05) {
    return {
      prepared: candidate,
      start: 0,
      end: candidate.length,
      length: candidate.length,
      split: false,
      projectionStart,
      projectionEnd,
      projectionCenter,
    };
  }
  return simulatorSectionForRange(candidate, division, start, end, referenceLatitude, {
    projectionStart,
    projectionEnd,
    projectionCenter,
  });
}

function bestAlignedProjectionRun(projections, maximumDistance, maximumProjectionStep) {
  const minimumRunLength = Math.max(2, Math.ceil(projections.length * 0.12));
  const runs = [];
  let run = [];
  for (const projection of projections) {
    const previous = run.at(-1);
    const projectionIsContinuous =
      !previous || Math.abs(projection.along - previous.along) <= maximumProjectionStep;
    if (projection.distance <= maximumDistance && projectionIsContinuous) {
      run.push(projection);
      continue;
    }
    if (run.length > 0) runs.push(run);
    run = projection.distance <= maximumDistance ? [projection] : [];
  }
  if (run.length > 0) runs.push(run);

  return runs
    .filter((candidate) => candidate.length >= minimumRunLength)
    .sort((left, right) => {
      const leftSpan =
        Math.max(...left.map((item) => item.along)) -
        Math.min(...left.map((item) => item.along));
      const rightSpan =
        Math.max(...right.map((item) => item.along)) -
        Math.min(...right.map((item) => item.along));
      return rightSpan - leftSpan || right.length - left.length;
    })[0];
}

function simulatorSectionForRange(
  candidate,
  division,
  requestedStart,
  requestedEnd,
  referenceLatitude,
  projection = {}
) {
  const start = Math.max(0, Math.min(requestedStart, candidate.length));
  const end = Math.max(start, Math.min(requestedEnd, candidate.length));
  if (end - start < 0.2) return null;
  const shared = {
    start,
    end,
    length: end - start,
    projectionStart: projection.projectionStart ?? start,
    projectionEnd: projection.projectionEnd ?? end,
    projectionCenter: projection.projectionCenter ?? (start + end) / 2,
  };
  if (start <= 0.05 && end >= candidate.length - 0.05) {
    return { prepared: candidate, ...shared, start: 0, end: candidate.length, split: false };
  }

  const coordinates = slicePolylineCoordinates(candidate, start, end);
  if (coordinates.length < 2) return null;
  const raw = {
    ...candidate.raw,
    id: `${candidate.raw.id}:division-section:${division.raw.id}`,
    sourceParentRowId: candidate.raw.id,
    sourceRangeStartMeters: round(start, 3),
    sourceRangeEndMeters: round(end, 3),
    sourceRangeLengthMeters: round(end - start, 3),
    sourceParentLengthMeters: round(candidate.length, 3),
    sourceGeometryDerived: 'source-row-subsection',
    vertices: coordinates.map((coordinate) => ({ lat: coordinate.lat, lon: coordinate.lon })),
  };
  return {
    prepared: preparePolyline(raw, coordinates, candidate.index, referenceLatitude),
    ...shared,
    split: true,
  };
}

function scoreDivisionCandidateSection(division, section, config, referenceLatitude) {
  const fullMetrics = comparePreparedPolylines(division, section.prepared, config);
  if (division.raw.type === 'stopbar') return fullMetrics;

  const divisionSection = divisionSectionForSimulator(
    division,
    section.prepared,
    referenceLatitude
  );
  if (!divisionSection || divisionSection.length >= division.length - 0.1) return fullMetrics;
  // Partial scoring is only for a genuinely composite BARS path whose source rows
  // follow different branches. A shortened source on one straight line must still
  // satisfy the normal whole-division containment thresholds.
  if (
    division.projected.length < 3 ||
    orientationDifference(division.orientation, divisionSection.prepared.orientation) < 7
  ) {
    return fullMetrics;
  }

  const partialMetrics = comparePreparedPolylines(
    divisionSection.prepared,
    section.prepared,
    config
  );
  const divisionCoverage = divisionSection.length / Math.max(division.length, 0.001);
  const sourceParentLength =
    Number(section.prepared.raw.sourceParentLengthMeters) || section.length;
  const sourceCoverage = section.length / Math.max(sourceParentLength, 0.001);
  const isMeaningfulTightSection =
    partialMetrics.valid &&
    divisionCoverage >= (config.minimumContainedLengthRatio ?? MINIMUM_ALLOCATED_LENGTH_RATIO) &&
    sourceCoverage >= MINIMUM_COMPOSITE_SOURCE_COVERAGE &&
    partialMetrics.divisionToSourceMeanDistance <= 2.5 &&
    partialMetrics.divisionToSourceMaximumDistance <= 5 &&
    partialMetrics.divisionToSourceCoverage >= 0.9 &&
    partialMetrics.sourceToDivisionMeanDistance <= 2.5 &&
    partialMetrics.sourceToDivisionMaximumDistance <= 5 &&
    partialMetrics.sourceToDivisionCoverage >= 0.9;

  if (!isMeaningfulTightSection || partialMetrics.score <= fullMetrics.score) return fullMetrics;
  return {
    ...partialMetrics,
    alignmentMode: 'composite-section',
    compositeDivisionCoverage: round(divisionCoverage, 3),
    compositeSourceCoverage: round(sourceCoverage, 3),
    fullDivisionScore: fullMetrics.score,
  };
}

function locallyRegisteredSectionMetrics(division, section, config) {
  const candidate = section.prepared;
  const displacement = distance(division.center, candidate.center);
  const angleDifference = orientationDifference(division.orientation, candidate.orientation);
  const lengthRatio = candidate.length / Math.max(division.length, 0.001);
  if (
    displacement > config.registrationDistance ||
    angleDifference > config.registrationAngle ||
    lengthRatio < config.minimumLengthRatio ||
    lengthRatio > config.maximumLengthRatio
  ) {
    return null;
  }

  const registeredDivision = translatePreparedPolyline(
    division,
    candidate.center.x - division.center.x,
    candidate.center.y - division.center.y
  );
  const aligned = comparePreparedPolylines(registeredDivision, candidate, config);
  if (!aligned.valid) return null;

  const proximityScore = clamp01(1 - displacement / config.registrationDistance);
  const directionScore = clamp01(1 - angleDifference / config.registrationAngle);
  const score = aligned.score * 0.72 + proximityScore * 0.18 + directionScore * 0.1;
  if (score < config.minimumRegistrationScore) return null;

  return {
    division: registeredDivision,
    metrics: {
      ...aligned,
      valid: true,
      alignmentMode: 'local-registration',
      score: round(score, 4),
      registrationDisplacement: round(displacement, 2),
      registrationAngleDifference: round(angleDifference, 1),
      registrationResidualMeanDistance: aligned.meanDistance,
      registrationResidualMaximumDistance: aligned.maximumDistance,
    },
  };
}

function translatePreparedPolyline(prepared, dx, dy) {
  const translate = (point) => ({ x: point.x + dx, y: point.y + dy });
  const projected = prepared.projected.map(translate);
  return {
    ...prepared,
    projected,
    samples: prepared.samples.map(translate),
    center: translate(prepared.center),
    bounds: pointBounds(projected),
  };
}

function divisionSectionForSimulator(division, simulator, referenceLatitude) {
  const projections = simulator.samples.map((sample) =>
    projectPointToPolyline(sample, division.projected)
  );
  if (projections.length === 0) return null;

  const start = Math.max(0, Math.min(...projections.map((projection) => projection.along)));
  const end = Math.min(
    division.length,
    Math.max(...projections.map((projection) => projection.along))
  );
  if (end - start < 0.2) return null;
  if (start <= 0.05 && end >= division.length - 0.05) {
    return { prepared: division, start: 0, end: division.length, length: division.length };
  }

  const coordinates = slicePolylineCoordinates(division, start, end);
  if (coordinates.length < 2) return null;
  const raw = {
    ...division.raw,
    id: `${division.raw.id}:simulator-section:${simulator.raw.id}`,
  };
  return {
    prepared: preparePolyline(raw, coordinates, division.index, referenceLatitude),
    start,
    end,
    length: end - start,
  };
}

function slicePolylineCoordinates(candidate, start, end) {
  const distances = cumulativePolylineDistances(candidate.projected);
  const coordinates = [coordinateAtDistance(candidate.coordinates, distances, start)];
  for (let index = 1; index < candidate.coordinates.length - 1; index += 1) {
    if (distances[index] > start && distances[index] < end) {
      coordinates.push(candidate.coordinates[index]);
    }
  }
  coordinates.push(coordinateAtDistance(candidate.coordinates, distances, end));
  return removeConsecutiveCoordinateDuplicates(coordinates);
}

function cumulativePolylineDistances(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances.at(-1) + distance(points[index - 1], points[index]));
  }
  return distances;
}

function coordinateAtDistance(coordinates, distances, target) {
  if (target <= 0) return coordinates[0];
  if (target >= distances.at(-1)) return coordinates.at(-1);

  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  const startDistance = distances[index - 1];
  const segmentLength = Math.max(distances[index] - startDistance, 0.000001);
  const ratio = clamp01((target - startDistance) / segmentLength);
  const start = coordinates[index - 1];
  const end = coordinates[index];
  return {
    lat: start.lat + (end.lat - start.lat) * ratio,
    lon: start.lon + (end.lon - start.lon) * ratio,
  };
}

function buildInstanceMatchEdges(divisions, instances) {
  const edges = [];

  for (const division of divisions) {
    const config = TYPE_CONFIG[division.raw.type];
    if (!config) continue;

    const projectedInstances = instances
      .filter((instance) => config.instanceClassifications.has(instance.raw.classification))
      .map((instance) => ({
        ...instance,
        projection: projectPointToPolyline(instance.point, division.projected),
        coveredInstances: [instance],
      }))
      .filter((instance) => instance.projection.distance <= config.instanceSearchDistance)
      .sort(
        (left, right) =>
          left.projection.along - right.projection.along ||
          left.projection.distance - right.projection.distance ||
          String(left.raw.id).localeCompare(String(right.raw.id))
      );

    const collapsed = collapseInstancesAtSameStation(projectedInstances);
    const groups = splitInstanceGroups(collapsed, config.instanceMaximumGap);
    for (const group of groups) {
      if (group.length < config.instanceMinimumPoints) continue;

      const start = group[0].projection.along;
      const end = group.at(-1).projection.along;
      const span = Math.max(0, end - start);
      const coverage = clamp01(span / Math.max(division.length, 0.1));
      const distances = group.map((instance) => instance.projection.distance);
      const meanDistance =
        distances.reduce((sum, value) => sum + value, 0) / Math.max(distances.length, 1);
      const maximumDistance = Math.max(...distances);
      const distanceScore = clamp01(1 - meanDistance / config.instanceSearchDistance);
      const maximumDistanceScore = clamp01(1 - maximumDistance / config.instanceSearchDistance);
      const countScore = clamp01(group.length / Math.max(config.instanceMinimumPoints + 3, 5));
      const score =
        distanceScore * 0.48 + maximumDistanceScore * 0.08 + coverage * 0.28 + countScore * 0.16;
      if (
        coverage < config.instanceMinimumCoverage ||
        meanDistance > config.instanceSearchDistance * 0.72 ||
        score < 0.4
      ) {
        continue;
      }

      edges.push({
        division,
        instances: group,
        config,
        metrics: {
          valid: true,
          score: round(score, 4),
          meanDistance: round(meanDistance, 2),
          maximumDistance: round(maximumDistance, 2),
          coverage: round(coverage, 3),
          centerDistance: round(meanDistance, 2),
          angleDifference: 0,
          lengthRatio: round(span / Math.max(division.length, 0.1), 3),
        },
      });
    }
  }

  return edges.sort(
    (left, right) =>
      right.metrics.score - left.metrics.score ||
      left.metrics.meanDistance - right.metrics.meanDistance ||
      stableIdentifier(left.division).localeCompare(stableIdentifier(right.division))
  );
}

function instanceBackedRow(edge) {
  const rawInstances = edgeSourceInstances(edge).map((instance) => instance.raw);
  const sourceFiles = [
    ...new Set(rawInstances.map((instance) => instance.sourceFile).filter(Boolean)),
  ];
  const confidence =
    rawInstances.reduce((sum, instance) => sum + (Number(instance.confidence) || 0), 0) /
    Math.max(rawInstances.length, 1);

  return {
    id: `division-guided-source-instances:${edge.division.raw.id}`,
    sourceFile: sourceFiles[0],
    sourceType: 'division-guided-source-instances',
    preset: 'division-guided-source-instances',
    classification: edge.config.outputClassification,
    confidence: Math.min(confidence, edge.metrics.score),
    inferred: false,
    sourceBasis: 'division-guided-source-instances',
    relationshipBasis: 'division-shape-to-source-instance-proximity',
    reconstructMode: 'division-guided-source-instance-order',
    sourcePlacementCount: rawInstances.length,
    sourceInstanceIds: rawInstances.map((instance) => instance.id),
    sourcePresets: [...new Set(rawInstances.map((instance) => instance.name).filter(Boolean))],
    sourceModelGuids: [...new Set(rawInstances.map((instance) => instance.guid).filter(Boolean))],
    vertices: edge.instances.map((instance) => ({
      lat: instance.raw.lat,
      lon: instance.raw.lon,
    })),
    reason: `${rawInstances.length} source-backed simulator lights aligned using the division ${edge.config.label} shape`,
  };
}

function collapseInstancesAtSameStation(instances) {
  const collapsed = [];
  for (const instance of instances) {
    const previous = collapsed.at(-1);
    if (previous && Math.abs(previous.projection.along - instance.projection.along) <= 1.25) {
      const coveredInstances = [...previous.coveredInstances, ...instance.coveredInstances];
      if (instance.projection.distance < previous.projection.distance) {
        collapsed[collapsed.length - 1] = { ...instance, coveredInstances };
      } else {
        previous.coveredInstances = coveredInstances;
      }
    } else {
      collapsed.push(instance);
    }
  }
  return collapsed;
}

function edgeSourceInstances(edge) {
  return edge.instances.flatMap((instance) => instance.coveredInstances ?? [instance]);
}

function splitInstanceGroups(instances, maximumGap) {
  const groups = [];
  let current = [];
  for (const instance of instances) {
    if (
      current.length > 0 &&
      instance.projection.along - current.at(-1).projection.along > maximumGap
    ) {
      groups.push(current);
      current = [];
    }
    current.push(instance);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function projectPointToPolyline(point, line) {
  let best = { distance: Infinity, along: 0, segmentIndex: 1 };
  let distanceBeforeSegment = 0;
  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    const lengthSquared = segmentLength * segmentLength;
    const ratio =
      lengthSquared <= 0.000001
        ? 0
        : clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
    const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio };
    const candidateDistance = distance(point, projected);
    if (candidateDistance < best.distance) {
      best = {
        distance: candidateDistance,
        along: distanceBeforeSegment + segmentLength * ratio,
        segmentIndex: index,
      };
    }
    distanceBeforeSegment += segmentLength;
  }
  return best;
}

function comparePreparedPolylines(division, candidate, config) {
  const forward = nearestDistanceSummary(division.samples, candidate.projected);
  const reverse = nearestDistanceSummary(candidate.samples, division.projected);
  const meanDistance = (forward.mean + reverse.mean) / 2;
  const maximumDistance = Math.max(forward.maximum, reverse.maximum);
  const coverage =
    (forward.covered(config.coverageDistance) + reverse.covered(config.coverageDistance)) / 2;
  const centerDistance = distance(division.center, candidate.center);
  const angleDifference = orientationDifference(division.orientation, candidate.orientation);
  const lengthRatio = candidate.length / division.length;
  const dynamicCenterLimit =
    config.centerDistance + Math.min(Math.max(division.length, candidate.length) * 0.25, 30);

  const shapeScore = clamp01(1 - meanDistance / config.meanDistance);
  const maximumDistanceScore = clamp01(1 - maximumDistance / config.maximumDistance);
  const coverageScore = clamp01(
    (coverage - config.minimumCoverage) / Math.max(1 - config.minimumCoverage, 0.01)
  );
  const directionScore = clamp01(1 - angleDifference / config.maximumAngle);
  const lengthScore = Math.exp(-Math.abs(Math.log(Math.max(lengthRatio, 0.001))));
  const centerScore = clamp01(1 - centerDistance / dynamicCenterLimit);
  const balancedScore =
    shapeScore * 0.38 +
    maximumDistanceScore * 0.18 +
    coverageScore * 0.2 +
    directionScore * 0.1 +
    lengthScore * 0.08 +
    centerScore * 0.06;

  const balancedValid =
    meanDistance <= config.meanDistance &&
    maximumDistance <= config.maximumDistance &&
    coverage >= config.minimumCoverage &&
    centerDistance <= dynamicCenterLimit &&
    angleDifference <= config.maximumAngle &&
    lengthRatio >= config.minimumLengthRatio &&
    lengthRatio <= config.maximumLengthRatio &&
    balancedScore >= config.minimumScore;

  const divisionCoverage = forward.covered(config.coverageDistance);
  const sourceCoverage = reverse.covered(config.coverageDistance);
  const sourceShapeScore = clamp01(
    1 - reverse.mean / (config.containmentMeanDistance ?? config.meanDistance)
  );
  const sourceMaximumDistanceScore = clamp01(
    1 - reverse.maximum / (config.containmentMaximumDistance ?? config.maximumDistance)
  );
  const sourceCoverageScore = clamp01(
    (sourceCoverage - (config.minimumSourceCoverage ?? 1)) /
      Math.max(1 - (config.minimumSourceCoverage ?? 1), 0.01)
  );
  const divisionCoverageScore = clamp01(
    (divisionCoverage - (config.minimumDivisionCoverage ?? 1)) /
      Math.max(1 - (config.minimumDivisionCoverage ?? 1), 0.01)
  );
  const containmentScore =
    sourceShapeScore * 0.38 +
    sourceMaximumDistanceScore * 0.18 +
    sourceCoverageScore * 0.2 +
    divisionCoverageScore * 0.08 +
    directionScore * 0.1 +
    lengthScore * 0.06;
  const sourceContainedValid =
    config.allowSourceContainment === true &&
    reverse.mean <= config.containmentMeanDistance &&
    reverse.maximum <= config.containmentMaximumDistance &&
    sourceCoverage >= config.minimumSourceCoverage &&
    divisionCoverage >= config.minimumDivisionCoverage &&
    angleDifference <= config.maximumAngle &&
    lengthRatio >= config.minimumContainedLengthRatio &&
    lengthRatio <= config.maximumLengthRatio &&
    containmentScore >= config.minimumContainmentScore;
  const alignmentMode = balancedValid
    ? 'full-shape'
    : sourceContainedValid
      ? 'source-contained'
      : 'none';
  const score = Math.max(balancedScore, containmentScore);
  const valid = balancedValid || sourceContainedValid;

  return {
    valid,
    alignmentMode,
    score: round(score, 4),
    balancedScore: round(balancedScore, 4),
    containmentScore: round(containmentScore, 4),
    alignmentDistance: round(
      alignmentMode === 'source-contained' ? reverse.mean : meanDistance,
      2
    ),
    meanDistance: round(meanDistance, 2),
    maximumDistance: round(maximumDistance, 2),
    coverage: round(coverage, 3),
    divisionToSourceMeanDistance: round(forward.mean, 2),
    divisionToSourceMaximumDistance: round(forward.maximum, 2),
    divisionToSourceCoverage: round(forward.covered(config.coverageDistance), 3),
    sourceToDivisionMeanDistance: round(reverse.mean, 2),
    sourceToDivisionMaximumDistance: round(reverse.maximum, 2),
    sourceToDivisionCoverage: round(reverse.covered(config.coverageDistance), 3),
    centerDistance: round(centerDistance, 2),
    angleDifference: round(angleDifference, 1),
    lengthRatio: round(lengthRatio, 3),
  };
}

function configFor(division) {
  return TYPE_CONFIG[division.raw.type];
}

function suppressRedundantCompositeEdges(edges) {
  const completeDivisionMatches = new Set(
    edges
      .filter(isCompleteDivisionMatch)
      .map((edge) => stableIdentifier(edge.division))
  );

  return edges.filter(
    (edge) =>
      edge.metrics.alignmentMode !== 'composite-section' ||
      !completeDivisionMatches.has(stableIdentifier(edge.division)) ||
      isAdditionalContainedTargetLayer(edge)
  );
}

function suppressWeakSecondaryCandidateOwners(edges) {
  const completeCandidatesByDivision = new Map();
  for (const edge of edges) {
    if (!isCompleteDivisionMatch(edge)) continue;
    const divisionKey = stableIdentifier(edge.division);
    const candidateKeys = completeCandidatesByDivision.get(divisionKey) ?? new Set();
    candidateKeys.add(stableIdentifier(edge.candidate));
    completeCandidatesByDivision.set(divisionKey, candidateKeys);
  }

  const edgesByCandidate = new Map();
  for (const edge of edges) {
    const candidateKey = stableIdentifier(edge.candidate);
    const candidateEdges = edgesByCandidate.get(candidateKey) ?? [];
    candidateEdges.push(edge);
    edgesByCandidate.set(candidateKey, candidateEdges);
  }

  const suppressed = new Set();
  for (const [candidateKey, candidateEdges] of edgesByCandidate) {
    if (new Set(candidateEdges.map((edge) => stableIdentifier(edge.division))).size < 2) {
      continue;
    }

    for (const edge of candidateEdges) {
      const divisionKey = stableIdentifier(edge.division);
      const completeElsewhere = [...(completeCandidatesByDivision.get(divisionKey) ?? [])].some(
        (completeCandidateKey) => completeCandidateKey !== candidateKey
      );
      if (!completeElsewhere || !isWeakSecondaryOwnership(edge)) continue;

      const clearPrimaryOwner = candidateEdges.some(
        (other) =>
          stableIdentifier(other.division) !== divisionKey &&
          other.metrics.score >= MINIMUM_PRIMARY_OWNERSHIP_SCORE &&
          other.metrics.score - edge.metrics.score >= MINIMUM_PRIMARY_OWNERSHIP_ADVANTAGE
      );
      if (clearPrimaryOwner) suppressed.add(edge);
    }
  }

  return edges.filter((edge) => !suppressed.has(edge));
}

function isCompleteDivisionMatch(edge) {
  return (
    edge.metrics.alignmentMode === 'full-shape' &&
    edge.metrics.score >= 0.8 &&
    edge.metrics.divisionToSourceCoverage >= 0.9 &&
    edge.metrics.sourceToDivisionCoverage >= 0.9
  );
}

function isWeakSecondaryOwnership(edge) {
  return (
    edge.metrics.score <= MAXIMUM_WEAK_SECONDARY_OWNERSHIP_SCORE &&
    (edge.metrics.angleDifference >= MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES ||
      edge.metrics.divisionToSourceMaximumDistance >=
        MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS ||
      edge.metrics.divisionToSourceCoverage <= 0.8)
  );
}

function isAdditionalContainedTargetLayer(edge) {
  return (
    edge.candidate.length <= edge.division.length * MAXIMUM_SINGLE_OWNER_LENGTH_RATIO &&
    edge.metrics.sourceToDivisionCoverage >= 0.9 &&
    edge.metrics.sourceToDivisionMaximumDistance <= 5
  );
}

function rowWithDivisionClassification(row, config) {
  if (!config) return row;
  return {
    ...row,
    sourceClassification: row.sourceClassification ?? row.classification,
    outputClassification: config.outputClassification,
    classificationBasis: 'division-data',
  };
}

function simplifyReconstructedReplacementRow(row, divisionType) {
  const vertices = row?.vertices ?? [];
  if (
    row?.inferred !== true ||
    row.reconstructMode !== 'exact-bgl-placement-control-points' ||
    !GUIDANCE_DIVISION_TYPES.has(divisionType) ||
    vertices.length <= 3
  ) {
    return row;
  }

  const referenceLatitude = vertices[0].lat;
  const projected = vertices.map((vertex) =>
    projectCoordinate({ lat: vertex.lat, lon: vertex.lon }, referenceLatitude)
  );
  const keptIndices = simplifyPolylineIndices(
    projected,
    RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS
  );
  if (keptIndices.length >= vertices.length) return row;

  return {
    ...row,
    vertices: keptIndices.map((index) => vertices[index]),
    replacementGeometryDerived: 'constrained-source-row-simplification',
    replacementGeometryToleranceMeters:
      RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS,
    replacementSourceVertexCount: vertices.length,
  };
}

function simplifyPolylineIndices(points, toleranceMeters) {
  const kept = new Set([0, points.length - 1]);
  const ranges = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop();
    if (endIndex <= startIndex + 1) continue;

    let furthestIndex;
    let furthestDistance = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const candidateDistance = pointToSegmentDistance(
        points[index],
        points[startIndex],
        points[endIndex]
      );
      if (candidateDistance > furthestDistance) {
        furthestDistance = candidateDistance;
        furthestIndex = index;
      }
    }
    if (furthestIndex === undefined || furthestDistance <= toleranceMeters) continue;

    kept.add(furthestIndex);
    ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }
  return [...kept].sort((left, right) => left - right);
}

function allocateSimulatorGeometry(edges, referenceLatitude, allCandidates) {
  const edgesByCandidate = new Map();
  for (const edge of edges) {
    const key = stableIdentifier(edge.candidate);
    const candidateEdges = edgesByCandidate.get(key) ?? [];
    candidateEdges.push(edge);
    edgesByCandidate.set(key, candidateEdges);
  }

  const allocated = [];
  for (const candidateEdges of edgesByCandidate.values()) {
    const chosen = chooseDistinctCandidateAssignments(candidateEdges).filter((edge) =>
      sectionMeetsAllocationMinimum(edge, edge.section.length)
    );
    if (chosen.length === 0) continue;
    const candidate = chosen[0].candidate;
    const naturalBoundaries = naturalBoundaryStations(candidate, allCandidates);
    const partitionGuidance =
      GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification) &&
      chosen.every((edge) => GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type));
    const nativeLeadOnCandidate = candidate.raw.classification === 'lead-on';
    const reconstructedGuidanceCandidate = isExactPlacementRow(candidate.raw);
    const ordered = [...chosen].sort(
      (left, right) =>
        left.section.projectionCenter - right.section.projectionCenter ||
        stableIdentifier(left.division).localeCompare(stableIdentifier(right.division))
    );
    const partitionLinks = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const left = ordered[index - 1];
      const right = ordered[index];
      const extendsReconstructedLeadOn =
        reconstructedGuidanceCandidate &&
        (left.division.raw.type === 'lead_on' || right.division.raw.type === 'lead_on');
      partitionLinks.push({
        boundary: partitionBoundary(left, right, candidate, naturalBoundaries),
        connectsGuidance:
          partitionGuidance &&
          (nativeLeadOnCandidate ||
            extendsReconstructedLeadOn ||
            right.section.projectionStart - left.section.projectionEnd <=
              MAXIMUM_GUIDANCE_PARTITION_GAP_METERS),
      });
    }

    for (let index = 0; index < ordered.length; index += 1) {
      const edge = ordered[index];
      const extendNativeLeadOn =
        nativeLeadOnCandidate && edge.division.raw.type === 'lead_on';
      const extendReconstructedLeadOn =
        reconstructedGuidanceCandidate && edge.division.raw.type === 'lead_on';
      const extendLeadOnWholeSource = extendNativeLeadOn || extendReconstructedLeadOn;
      const reconstructedExtensionLimit = extendReconstructedLeadOn
        ? reconstructedLeadOnExtensionLimit(edge.division.length)
        : Infinity;
      const matchedStopbarCell = stopbarCellForMatchedSection(
        edge.section,
        naturalBoundaries
      );
      const startAnchoredByStopbar =
        extendReconstructedLeadOn && Boolean(matchedStopbarCell.upper);
      const endAnchoredByStopbar =
        extendReconstructedLeadOn && Boolean(matchedStopbarCell.lower);
      const startExtensionLimit =
        startAnchoredByStopbar ||
        (extendReconstructedLeadOn &&
          hasNaturalBoundaryAnchor(edge.section.end, naturalBoundaries))
          ? Infinity
          : reconstructedExtensionLimit;
      const endExtensionLimit =
        endAnchoredByStopbar ||
        (extendReconstructedLeadOn &&
          hasNaturalBoundaryAnchor(edge.section.start, naturalBoundaries))
          ? Infinity
          : reconstructedExtensionLimit;
      let start = edge.section.start;
      let end = edge.section.end;
      if (partitionGuidance) {
        const singleOwnerSupportsWholeCandidate =
          ordered.length === 1 &&
          candidate.length <= edge.division.length * MAXIMUM_SINGLE_OWNER_LENGTH_RATIO &&
          edge.metrics.sourceToDivisionCoverage >= 0.9;
        if (
          index === 0 &&
          (extendLeadOnWholeSource ||
            start <= MAXIMUM_GUIDANCE_END_EXTENSION_METERS ||
            singleOwnerSupportsWholeCandidate)
        ) {
          start = 0;
        } else if (partitionLinks[index - 1]?.connectsGuidance) {
          start = partitionLinks[index - 1].boundary;
        }
        if (
          index === ordered.length - 1 &&
          (extendLeadOnWholeSource ||
            candidate.length - end <= MAXIMUM_GUIDANCE_END_EXTENSION_METERS ||
            singleOwnerSupportsWholeCandidate)
        ) {
          end = candidate.length;
        } else if (partitionLinks[index]?.connectsGuidance) {
          end = partitionLinks[index].boundary;
        }
      } else {
        if (index > 0 && start < partitionLinks[index - 1].boundary) {
          start = partitionLinks[index - 1].boundary;
        }
        if (index < ordered.length - 1 && end > partitionLinks[index].boundary) {
          end = partitionLinks[index].boundary;
        }
      }
      start = clampOutwardExtensionAtNaturalBoundary(
        start,
        edge.section.start,
        naturalBoundaries,
        'start',
        startExtensionLimit,
        startAnchoredByStopbar
      );
      end = clampOutwardExtensionAtNaturalBoundary(
        end,
        edge.section.end,
        naturalBoundaries,
        'end',
        endExtensionLimit,
        endAnchoredByStopbar
      );
      ({ start, end } = clampAllocationToStopbarCell(
        start,
        end,
        edge.section,
        naturalBoundaries
      ));
      const section = simulatorSectionForRange(
        candidate,
        edge.division,
        start,
        end,
        referenceLatitude,
        edge.section
      );
      if (
        section?.prepared?.valid &&
        sectionMeetsAllocationMinimum(edge, section.length)
      ) {
        allocated.push({ ...edge, section });
      }
    }
  }

  return allocated.sort(
    (left, right) =>
      right.metrics.score - left.metrics.score ||
      left.metrics.alignmentDistance - right.metrics.alignmentDistance ||
      stableIdentifier(left.division).localeCompare(stableIdentifier(right.division)) ||
      stableIdentifier(left.candidate).localeCompare(stableIdentifier(right.candidate))
  );
}

function sectionMeetsAllocationMinimum(edge, sectionLength) {
  return (
    sectionLength >= edge.division.length * MINIMUM_ALLOCATED_LENGTH_RATIO ||
    isTightPartialMatch(
      edge.metrics,
      sectionLength / Math.max(edge.division.length, 0.001),
      configFor(edge.division)
    )
  );
}

function isTightPartialMatch(metrics, lengthRatio, config) {
  return (
    metrics.valid &&
    metrics.alignmentMode === 'composite-section' &&
    lengthRatio >= (config.minimumContainedLengthRatio ?? MINIMUM_ALLOCATED_LENGTH_RATIO) &&
    metrics.sourceToDivisionMeanDistance <= 2.5 &&
    metrics.sourceToDivisionMaximumDistance <= 5 &&
    metrics.sourceToDivisionCoverage >= 0.9
  );
}

function chooseDistinctCandidateAssignments(edges) {
  const contested = new Set(edges.map((edge) => stableIdentifier(edge.division))).size > 1;
  const preferred = edges
    .filter((edge) => !contested || edge.metrics.score >= MINIMUM_CONTESTED_ASSIGNMENT_SCORE)
    .sort(
    (left, right) =>
      right.metrics.score - left.metrics.score ||
      left.metrics.alignmentDistance - right.metrics.alignmentDistance ||
      stableIdentifier(left.division).localeCompare(stableIdentifier(right.division))
    );
  const chosen = [];
  for (const edge of preferred) {
    const overlapsExisting = chosen.some(
      (existing) =>
        stableIdentifier(existing.division) !== stableIdentifier(edge.division) &&
        Math.abs(existing.section.projectionCenter - edge.section.projectionCenter) <
          MINIMUM_PARTITION_CENTER_SEPARATION_METERS
    );
    if (!overlapsExisting) chosen.push(edge);
  }
  return chosen;
}

function partitionBoundary(left, right, candidate, naturalBoundaries = []) {
  const gapStart = left.section.projectionEnd;
  const gapEnd = right.section.projectionStart;
  const sharedBoundary = sharedDivisionBoundary(left, right, candidate, (gapStart + gapEnd) / 2);
  // The facing projection endpoints describe the actual hand-off, including when
  // simplified BARS shapes overlap slightly. Using full section centres in that
  // case gives the shorter object ownership of most of the simulator row.
  const boundary = Math.max(
    0,
    Math.min(sharedBoundary ?? (gapStart + gapEnd) / 2, candidate.length)
  );
  return snapBoundaryToNaturalFeature(
    snapBoundaryToLogicalTurn(candidate, boundary),
    naturalBoundaries
  );
}

function naturalBoundaryStations(candidate, allCandidates) {
  if (
    !isExactPlacementRow(candidate.raw) ||
    !GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification)
  ) {
    return [];
  }
  const stations = [];
  for (const other of allCandidates) {
    if (stableIdentifier(other) === stableIdentifier(candidate)) continue;
    if (!isLocallyRegisterableSimulatorRow(other.raw)) continue;
    if (other.raw.classification === 'stopbar') {
      for (const along of polylineCrossingStations(candidate, other)) {
        stations.push({ along, kind: 'stopbar' });
      }
      continue;
    }
    if (!GUIDANCE_SOURCE_CLASSIFICATIONS.has(other.raw.classification)) continue;
    for (const endpoint of [other.projected[0], other.projected.at(-1)]) {
      const projection = projectPointToPolyline(endpoint, candidate.projected);
      if (
        projection.distance <= NATURAL_BOUNDARY_PROXIMITY_METERS &&
        projection.along > 1 &&
        projection.along < candidate.length - 1
      ) {
        stations.push({ along: projection.along, kind: 'junction' });
      }
    }
  }
  const ordered = stations.sort((left, right) => left.along - right.along);
  const deduplicated = [];
  for (const station of ordered) {
    const previous = deduplicated.at(-1);
    if (!previous || Math.abs(station.along - previous.along) > 1) {
      deduplicated.push(station);
    } else if (station.kind === 'stopbar' && previous.kind !== 'stopbar') {
      deduplicated[deduplicated.length - 1] = station;
    }
  }
  return deduplicated;
}

function polylineCrossingStations(candidate, crossing) {
  const candidateDistances = cumulativePolylineDistances(candidate.projected);
  const stations = [];
  for (let candidateIndex = 1; candidateIndex < candidate.projected.length; candidateIndex += 1) {
    const candidateStart = candidate.projected[candidateIndex - 1];
    const candidateEnd = candidate.projected[candidateIndex];
    for (let crossingIndex = 1; crossingIndex < crossing.projected.length; crossingIndex += 1) {
      const ratio = segmentIntersectionRatio(
        candidateStart,
        candidateEnd,
        crossing.projected[crossingIndex - 1],
        crossing.projected[crossingIndex]
      );
      if (ratio === undefined) continue;
      if (
        segmentOrientationDifference(
          candidateStart,
          candidateEnd,
          crossing.projected[crossingIndex - 1],
          crossing.projected[crossingIndex]
        ) < MINIMUM_STOPBAR_CROSSING_ANGLE_DEGREES
      ) {
        continue;
      }
      stations.push(
        candidateDistances[candidateIndex - 1] +
          distance(candidateStart, candidateEnd) * ratio
      );
    }
  }
  if (stations.length > 0) return stations;

  const nearest = crossing.projected
    .map((sample) => projectPointToPolyline(sample, candidate.projected))
    .sort((left, right) => left.distance - right.distance)[0];
  if (!nearest || nearest.distance > NATURAL_BOUNDARY_PROXIMITY_METERS) return [];
  const candidateStart = candidate.projected[nearest.segmentIndex - 1];
  const candidateEnd = candidate.projected[nearest.segmentIndex];
  return orientationDifference(
    segmentOrientation(candidateStart, candidateEnd),
    crossing.orientation
  ) >= MINIMUM_STOPBAR_CROSSING_ANGLE_DEGREES
    ? [nearest.along]
    : [];
}

function segmentOrientationDifference(leftStart, leftEnd, rightStart, rightEnd) {
  return orientationDifference(
    segmentOrientation(leftStart, leftEnd),
    segmentOrientation(rightStart, rightEnd)
  );
}

function segmentOrientation(start, end) {
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function segmentIntersectionRatio(leftStart, leftEnd, rightStart, rightEnd) {
  const leftVector = { x: leftEnd.x - leftStart.x, y: leftEnd.y - leftStart.y };
  const rightVector = { x: rightEnd.x - rightStart.x, y: rightEnd.y - rightStart.y };
  const denominator = crossProduct(leftVector, rightVector);
  if (Math.abs(denominator) <= 0.000001) return undefined;
  const offset = { x: rightStart.x - leftStart.x, y: rightStart.y - leftStart.y };
  const leftRatio = crossProduct(offset, rightVector) / denominator;
  const rightRatio = crossProduct(offset, leftVector) / denominator;
  return leftRatio >= 0 && leftRatio <= 1 && rightRatio >= 0 && rightRatio <= 1
    ? leftRatio
    : undefined;
}

function crossProduct(left, right) {
  return left.x * right.y - left.y * right.x;
}

function snapBoundaryToNaturalFeature(boundary, stations) {
  return (
    [...stations]
      .filter(
        (station) =>
          Math.abs(station.along - boundary) <= MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS
      )
      .sort(
        (left, right) =>
          Math.abs(left.along - boundary) - Math.abs(right.along - boundary) ||
          Number(right.kind === 'stopbar') - Number(left.kind === 'stopbar')
      )[0]?.along ?? boundary
  );
}

function clampOutwardExtensionAtNaturalBoundary(
  allocatedBoundary,
  matchedBoundary,
  stations,
  side,
  maximumExtension = Infinity,
  stopbarsOnly = false
) {
  if (side === 'start' && allocatedBoundary < matchedBoundary) {
    const naturalBoundary = stations
      .filter(
        (station) =>
          (!stopbarsOnly || station.kind === 'stopbar') &&
          station.along > allocatedBoundary &&
          station.along <= matchedBoundary &&
          matchedBoundary - station.along <= maximumExtension
      )
      .sort((left, right) => right.along - left.along)[0]?.along;
    if (naturalBoundary !== undefined) return naturalBoundary;
    return matchedBoundary - allocatedBoundary <= maximumExtension
      ? allocatedBoundary
      : matchedBoundary;
  }
  if (side === 'end' && allocatedBoundary > matchedBoundary) {
    const naturalBoundary = stations
      .filter(
        (station) =>
          (!stopbarsOnly || station.kind === 'stopbar') &&
          station.along >= matchedBoundary &&
          station.along < allocatedBoundary &&
          station.along - matchedBoundary <= maximumExtension
      )
      .sort((left, right) => left.along - right.along)[0]?.along;
    if (naturalBoundary !== undefined) return naturalBoundary;
    return allocatedBoundary - matchedBoundary <= maximumExtension
      ? allocatedBoundary
      : matchedBoundary;
  }
  return allocatedBoundary;
}

function reconstructedLeadOnExtensionLimit(divisionLength) {
  return Math.max(
    MINIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS,
    Math.min(
      MAXIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS,
      divisionLength * RECONSTRUCTED_LEAD_ON_EXTENSION_LENGTH_MULTIPLIER
    )
  );
}

function hasNaturalBoundaryAnchor(boundary, stations) {
  return stations.some(
    (station) => Math.abs(station.along - boundary) <= MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS
  );
}

function stopbarCellForMatchedSection(matchedSection, stations) {
  const stopbars = stations
    .filter(
      (station) =>
        station.kind === 'stopbar' &&
        station.along >= matchedSection.start - MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS &&
        station.along <= matchedSection.end + MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS
    )
    .sort((left, right) => left.along - right.along);
  if (stopbars.length === 0) return {};

  const matchedCenter = (matchedSection.start + matchedSection.end) / 2;
  const coincident = stopbars.find(
    (station) => Math.abs(station.along - matchedCenter) <= 0.05
  );
  const preferRightOfCoincident =
    coincident &&
    matchedSection.end - coincident.along >= coincident.along - matchedSection.start;
  return {
    lower: [...stopbars]
      .reverse()
      .find(
        (station) =>
          station.along < matchedCenter ||
          (station === coincident && preferRightOfCoincident)
      ),
    upper: stopbars.find(
      (station) =>
        station.along > matchedCenter ||
        (station === coincident && !preferRightOfCoincident)
    ),
  };
}

function clampAllocationToStopbarCell(start, end, matchedSection, stations) {
  const stopbars = stations
    .filter(
      (station) =>
        station.kind === 'stopbar' && station.along > start && station.along < end
    )
    .sort((left, right) => left.along - right.along);
  if (stopbars.length === 0) return { start, end };

  const matchedCenter = (matchedSection.start + matchedSection.end) / 2;
  const coincident = stopbars.find(
    (station) => Math.abs(station.along - matchedCenter) <= 0.05
  );
  const preferRightOfCoincident =
    coincident &&
    matchedSection.end - coincident.along >= coincident.along - matchedSection.start;
  const lower = [...stopbars]
    .reverse()
    .find(
      (station) =>
        station.along < matchedCenter ||
        (station === coincident && preferRightOfCoincident)
    );
  const upper = stopbars.find(
    (station) =>
      station.along > matchedCenter ||
      (station === coincident && !preferRightOfCoincident)
  );
  return {
    start: lower ? Math.max(start, lower.along) : start,
    end: upper ? Math.min(end, upper.along) : end,
  };
}

function snapBoundaryToLogicalTurn(candidate, boundary) {
  const distances = cumulativePolylineDistances(candidate.projected);
  let best;
  for (let index = 1; index < candidate.projected.length - 1; index += 1) {
    const distanceFromBoundary = Math.abs(distances[index] - boundary);
    if (distanceFromBoundary > MAXIMUM_LOGICAL_TURN_SNAP_METERS) continue;
    const turn = turnAngleDegrees(
      candidate.projected[index - 1],
      candidate.projected[index],
      candidate.projected[index + 1]
    );
    if (turn < MINIMUM_LOGICAL_TURN_DEGREES) continue;
    if (
      !best ||
      turn > best.turn + 10 ||
      (Math.abs(turn - best.turn) <= 10 && distanceFromBoundary < best.distanceFromBoundary)
    ) {
      best = { along: distances[index], turn, distanceFromBoundary };
    }
  }
  return best?.along ?? boundary;
}

function turnAngleDegrees(previous, current, next) {
  const incoming = { x: current.x - previous.x, y: current.y - previous.y };
  const outgoing = { x: next.x - current.x, y: next.y - current.y };
  const incomingLength = Math.hypot(incoming.x, incoming.y);
  const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
  if (incomingLength <= 0.001 || outgoingLength <= 0.001) return 0;
  const cosine = Math.max(
    -1,
    Math.min(
      1,
      (incoming.x * outgoing.x + incoming.y * outgoing.y) /
        (incomingLength * outgoingLength)
    )
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function sharedDivisionBoundary(left, right, candidate, targetAlong) {
  const shared = [];
  for (const leftPoint of left.division.projected) {
    for (const rightPoint of right.division.projected) {
      if (distance(leftPoint, rightPoint) > 3) continue;
      const midpoint = {
        x: (leftPoint.x + rightPoint.x) / 2,
        y: (leftPoint.y + rightPoint.y) / 2,
      };
      const projection = projectPointToPolyline(midpoint, candidate.projected);
      if (projection.distance <= 5) shared.push(projection);
    }
  }
  return shared.sort(
    (leftProjection, rightProjection) =>
      Math.abs(leftProjection.along - targetAlong) -
      Math.abs(rightProjection.along - targetAlong)
  )[0]?.along;
}

function buildConnectedStopbarCandidates(candidates, referenceLatitude) {
  const stopbars = candidates.filter(
    (candidate) =>
      candidate.raw.classification === 'stopbar' &&
      !isHoldShortTopologyRow(candidate.raw) &&
      candidate.coordinates.length >= 2
  );
  const composites = [];

  for (let leftIndex = 0; leftIndex < stopbars.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stopbars.length; rightIndex += 1) {
      const left = stopbars[leftIndex];
      const right = stopbars[rightIndex];
      if (
        left.raw.sourceFile &&
        right.raw.sourceFile &&
        left.raw.sourceFile !== right.raw.sourceFile
      ) {
        continue;
      }

      const connection = connectedStopbarGeometry(left, right);
      if (!connection) continue;
      const sourceCandidates = [left, right];
      const sourceRows = sourceCandidates.flatMap((candidate) =>
        (candidate.members ?? [candidate]).map((member) => member.raw)
      );
      const sourceRowIds = [...new Set(sourceRows.map((row) => String(row.id)))];
      const raw = {
        id: `connected-stopbar:${sourceRowIds.sort().join('|')}`,
        sourceFile: left.raw.sourceFile ?? right.raw.sourceFile,
        sourceType: 'connected-simulator-stopbar-rows',
        sourceGeometryDerived: 'endpoint-connected-source-rows',
        rawTag: 'Connected simulator stopbar rows',
        classification: 'stopbar',
        confidence: Math.min(
          Number(left.raw.confidence) || 1,
          Number(right.raw.confidence) || 1
        ),
        vertices: connection.coordinates.map((coordinate) => ({
          lat: coordinate.lat,
          lon: coordinate.lon,
        })),
        sourceRowIds,
        sourceRowCount: sourceRowIds.length,
        sourceCandidateIds: sourceCandidates.map((candidate) => String(candidate.raw.id)),
        sourceInstanceIds: [
          ...new Set(sourceRows.flatMap((row) => row.sourceInstanceIds ?? [])),
        ],
        endpointGapMeters: round(connection.gap, 3),
        connectionTurnDegrees: round(connection.turn, 1),
        classificationReasons: [
          'source-backed stopbar rows meet at compatible endpoints',
          'combined geometry is evaluated against one Division stopbar shape',
        ],
      };
      const prepared = prepareSimulatorRow(
        raw,
        candidates.length + composites.length,
        referenceLatitude
      );
      if (!prepared?.valid) continue;
      prepared.compositeMembers = sourceCandidates;
      composites.push(prepared);
    }
  }

  return composites;
}

function connectedStopbarGeometry(left, right) {
  const orientations = [
    orientPreparedPolyline(left, false),
    orientPreparedPolyline(left, true),
  ].flatMap((orientedLeft) =>
    [orientPreparedPolyline(right, false), orientPreparedPolyline(right, true)].map(
      (orientedRight) => ({
        left: orientedLeft,
        right: orientedRight,
        gap: distance(orientedLeft.projected.at(-1), orientedRight.projected[0]),
        turn: directedTurnDegrees(
          orientedLeft.projected.at(-2),
          orientedLeft.projected.at(-1),
          orientedRight.projected[0],
          orientedRight.projected[1]
        ),
      })
    )
  );
  const connection = orientations.sort(
    (leftOption, rightOption) =>
      leftOption.gap - rightOption.gap || leftOption.turn - rightOption.turn
  )[0];
  if (
    !connection ||
    connection.gap > MAXIMUM_CONNECTED_STOPBAR_ENDPOINT_GAP_METERS ||
    connection.turn > MAXIMUM_CONNECTED_STOPBAR_TURN_DEGREES
  ) {
    return null;
  }
  const coordinates = [
    ...connection.left.coordinates,
    ...connection.right.coordinates,
  ];
  const projected = [...connection.left.projected, ...connection.right.projected];
  if (polylineLength(projected) > MAXIMUM_CONNECTED_STOPBAR_LENGTH_METERS) return null;
  return { coordinates, gap: connection.gap, turn: connection.turn };
}

function orientPreparedPolyline(candidate, reverse) {
  return {
    coordinates: reverse ? [...candidate.coordinates].reverse() : candidate.coordinates,
    projected: reverse ? [...candidate.projected].reverse() : candidate.projected,
  };
}

function directedTurnDegrees(previous, leftEndpoint, rightEndpoint, next) {
  const inbound = {
    x: leftEndpoint.x - previous.x,
    y: leftEndpoint.y - previous.y,
  };
  const outbound = { x: next.x - rightEndpoint.x, y: next.y - rightEndpoint.y };
  const denominator = Math.hypot(inbound.x, inbound.y) * Math.hypot(outbound.x, outbound.y);
  if (denominator <= 0.000001) return 180;
  const cosine = Math.max(
    -1,
    Math.min(1, (inbound.x * outbound.x + inbound.y * outbound.y) / denominator)
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function preferConnectedStopbarCompositeEdges(edges) {
  const preferredByDivision = new Map();
  for (const edge of edges) {
    if (edge.candidate.raw.sourceType !== 'connected-simulator-stopbar-rows') continue;
    const divisionKey = stableIdentifier(edge.division);
    const current = preferredByDivision.get(divisionKey);
    if (
      !current ||
      edge.metrics.score > current.metrics.score ||
      (edge.metrics.score === current.metrics.score &&
        stableIdentifier(edge.candidate).localeCompare(stableIdentifier(current.candidate)) < 0)
    ) {
      preferredByDivision.set(divisionKey, edge);
    }
  }

  return edges.filter((edge) => {
    const preferred = preferredByDivision.get(stableIdentifier(edge.division));
    if (!preferred) return true;
    if (edge.candidate.raw.sourceType === 'connected-simulator-stopbar-rows') {
      return edge === preferred;
    }
    return !(preferred.candidate.raw.sourceCandidateIds ?? []).includes(
      String(edge.candidate.raw.id)
    );
  });
}

function sourceSectionsForMergedCandidate(edge, referenceLatitude) {
  if (edge.candidate.compositeMembers) {
    return edge.candidate.compositeMembers
      .flatMap((candidate) => candidate.members ?? [candidate])
      .map((candidate) => ({
        candidate,
        section: simulatorSectionForRange(
          candidate,
          edge.division,
          0,
          candidate.length,
          referenceLatitude
        ),
      }))
      .filter(({ section }) => section?.prepared?.valid);
  }
  const members = edge.candidate.members ?? [edge.candidate];
  return members
    .map((candidate) => {
      const directionMatches = polylineDirectionMatches(edge.candidate, candidate);
      const normalizedStart = edge.section.start / Math.max(edge.candidate.length, 0.001);
      const normalizedEnd = edge.section.end / Math.max(edge.candidate.length, 0.001);
      const start = directionMatches
        ? normalizedStart * candidate.length
        : (1 - normalizedEnd) * candidate.length;
      const end = directionMatches
        ? normalizedEnd * candidate.length
        : (1 - normalizedStart) * candidate.length;
      return {
        candidate,
        section: simulatorSectionForRange(
          candidate,
          edge.division,
          start,
          end,
          referenceLatitude
        ),
      };
    })
    .filter(({ section }) => section?.prepared?.valid);
}

function polylineDirectionMatches(anchor, member) {
  const anchorStart = anchor.projected[0];
  const anchorEnd = anchor.projected.at(-1);
  const memberStart = member.projected[0];
  const memberEnd = member.projected.at(-1);
  const forward = distance(anchorStart, memberStart) + distance(anchorEnd, memberEnd);
  const reverse = distance(anchorStart, memberEnd) + distance(anchorEnd, memberStart);
  return forward <= reverse;
}

function mergeCoLocatedSimulatorRows(items, referenceLatitude) {
  const valid = items
    .filter((item) => item.valid)
    .sort((left, right) => stableIdentifier(left).localeCompare(stableIdentifier(right)));
  const invalid = items.filter((item) => !item.valid);
  const groups = [];

  for (const item of valid) {
    const family = simulatorMergeFamily(item.raw?.classification);
    const group = family
      ? groups.find(
          (candidate) =>
            candidate.family === family &&
            candidate.members.some((member) => areCoLocatedSimulatorPolylines(item, member))
        )
      : undefined;
    if (group) group.members.push(item);
    else groups.push({ family, members: [item] });
  }

  const duplicateIds = [];
  const mergedRows = [];
  const kept = groups.map((group, index) => {
    if (group.members.length === 1) {
      return { ...group.members[0], members: group.members };
    }

    const ordered = [...group.members].sort(
      (left, right) =>
        duplicatePreference(right, 'simulator') - duplicatePreference(left, 'simulator') ||
        stableIdentifier(left).localeCompare(stableIdentifier(right))
    );
    duplicateIds.push(...ordered.slice(1).map(stableIdentifier));
    const raw = mergedSimulatorRow(ordered, index);
    const prepared = prepareSimulatorRow(raw, ordered[0].index, referenceLatitude);
    prepared.members = ordered;
    mergedRows.push(raw);
    return prepared;
  });

  return { kept: [...kept, ...invalid], duplicateIds, mergedRows };
}

function simulatorMergeFamily(classification) {
  if (GUIDANCE_SOURCE_CLASSIFICATIONS.has(classification)) return 'guidance';
  if (classification === 'stopbar') return 'stopbar';
  return null;
}

function mergedSimulatorRow(members, index) {
  const anchor = members[0];
  const sourceRowIds = members.map((member) => String(member.raw.id));
  return {
    ...anchor.raw,
    id: `merged-simulator-row:${index}:${sourceRowIds.join('|')}`,
    sourceType: 'merged-simulator-rows',
    sourceGeometryDerived: 'co-located-source-row-merge',
    sourceRowIds,
    sourceRowCount: sourceRowIds.length,
    sourceClassifications: [...new Set(members.map((member) => member.raw.classification))],
    // Preserve exact decoded geometry. Merging is provenance-only and must not
    // smooth corners, average offsets, or remove vertices from the source row.
    vertices: anchor.coordinates.map((coordinate) => ({
      lat: coordinate.lat,
      lon: coordinate.lon,
    })),
  };
}

function areCoLocatedSimulatorPolylines(left, right) {
  if (!left.valid || !right.valid) return false;
  const ratio = left.length / right.length;
  if (ratio < 0.97 || ratio > 1.03) return false;
  if (distance(left.center, right.center) > 0.45) return false;

  const forward = nearestDistanceSummary(left.samples, right.projected);
  const reverse = nearestDistanceSummary(right.samples, left.projected);
  return (
    (forward.mean + reverse.mean) / 2 <= 0.3 &&
    Math.max(forward.maximum, reverse.maximum) <= 0.6
  );
}

function collapseDuplicateLeadOns(items, source) {
  const ordered = [...items].sort(
    (left, right) =>
      duplicatePreference(right, source) - duplicatePreference(left, source) ||
      stableIdentifier(left).localeCompare(stableIdentifier(right))
  );
  const kept = [];
  const duplicateIds = [];

  for (const item of ordered) {
    const isLeadOn =
      source === 'division' ? item.raw?.type === 'lead_on' : item.raw?.classification === 'lead-on';
    if (!isLeadOn || !item.valid) {
      kept.push(item);
      continue;
    }

    const duplicate = kept.find((existing) => {
      const existingIsLeadOn =
        source === 'division'
          ? existing.raw?.type === 'lead_on'
          : existing.raw?.classification === 'lead-on';
      return existingIsLeadOn && areEffectivelySamePolyline(item, existing);
    });
    if (duplicate) duplicateIds.push(stableIdentifier(item));
    else kept.push(item);
  }

  return { kept, duplicateIds };
}

function areEffectivelySamePolyline(left, right) {
  if (!left.valid || !right.valid) return false;
  const ratio = left.length / right.length;
  if (ratio < 0.88 || ratio > 1.14) return false;
  if (distance(left.center, right.center) > 1.5) return false;

  const forward = nearestDistanceSummary(left.samples, right.projected);
  const reverse = nearestDistanceSummary(right.samples, left.projected);
  return (
    (forward.mean + reverse.mean) / 2 <= 0.65 && Math.max(forward.maximum, reverse.maximum) <= 1.4
  );
}

function duplicatePreference(item, source) {
  if (source === 'division') return item.projected?.length ?? 0;
  return (Number(item.raw?.confidence) || 0) * 100 + (item.projected?.length ?? 0);
}

function boundsCouldMatch(left, right, config) {
  const gap = boundsDistance(left.bounds, right.bounds);
  return gap <= config.maximumDistance;
}

function nearestDistanceSummary(samples, line) {
  const distances = samples.map((sample) => pointToPolylineDistance(sample, line));
  const total = distances.reduce((sum, value) => sum + value, 0);
  return {
    mean: total / Math.max(distances.length, 1),
    maximum: Math.max(...distances, 0),
    covered: (threshold) =>
      distances.filter((value) => value <= threshold).length / Math.max(distances.length, 1),
  };
}

function pointToPolylineDistance(point, line) {
  let best = Infinity;
  for (let index = 1; index < line.length; index += 1) {
    best = Math.min(best, pointToSegmentDistance(point, line[index - 1], line[index]));
  }
  return best;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.000001) return distance(point, start);
  const ratio = clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function samplePolyline(points, count) {
  if (points.length <= 1 || count <= 2) return [...points];
  const segmentLengths = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segmentLength = distance(points[index - 1], points[index]);
    segmentLengths.push(segmentLength);
    totalLength += segmentLength;
  }

  const samples = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;
  for (let sampleIndex = 0; sampleIndex < count; sampleIndex += 1) {
    const targetDistance = (totalLength * sampleIndex) / (count - 1);
    while (
      segmentIndex < segmentLengths.length - 1 &&
      segmentStartDistance + segmentLengths[segmentIndex] < targetDistance
    ) {
      segmentStartDistance += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const segmentLength = Math.max(segmentLengths[segmentIndex], 0.000001);
    const ratio = clamp01((targetDistance - segmentStartDistance) / segmentLength);
    samples.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });
  }
  return samples;
}

function normalizeDivisionCoordinates(value) {
  const coordinates = Array.isArray(value) ? value : value ? [value] : [];
  return coordinates
    .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng))
    .map((coordinate) => ({ lat: coordinate.lat, lon: coordinate.lng }));
}

function findReferenceLatitude(divisionPoints, lightRows, instances = []) {
  for (const point of divisionPoints ?? []) {
    const coordinate = Array.isArray(point?.coordinates)
      ? point.coordinates[0]
      : point?.coordinates;
    if (Number.isFinite(coordinate?.lat)) return coordinate.lat;
  }
  for (const row of lightRows ?? []) {
    if (Number.isFinite(row?.vertices?.[0]?.lat)) return row.vertices[0].lat;
  }
  for (const instance of instances ?? []) {
    if (Number.isFinite(instance?.lat)) return instance.lat;
  }
  return 0;
}

function projectCoordinate(point, referenceLatitude) {
  return {
    x: point.lon * METERS_PER_DEGREE_LATITUDE * Math.cos((referenceLatitude * Math.PI) / 180),
    y: point.lat * METERS_PER_DEGREE_LATITUDE,
  };
}

function removeConsecutiveCoordinateDuplicates(points) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (
      !previous ||
      Math.abs(previous.lat - point.lat) > 1e-10 ||
      Math.abs(previous.lon - point.lon) > 1e-10
    ) {
      result.push(point);
    }
  }
  return result;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index]);
  }
  return length;
}

function polylineCenter(points) {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

function principalOrientation(points, center) {
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  return (Math.atan2(2 * xy, xx - yy) * 90) / Math.PI;
}

function orientationDifference(left, right) {
  let difference = Math.abs(left - right) % 180;
  if (difference > 90) difference = 180 - difference;
  return difference;
}

function pointBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );
}

function boundsDistance(left, right) {
  const dx = Math.max(left.minX - right.maxX, right.minX - left.maxX, 0);
  const dy = Math.max(left.minY - right.maxY, right.minY - left.maxY, 0);
  return Math.hypot(dx, dy);
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function stableIdentifier(item) {
  return String(item.raw?.id ?? item.raw?.sourceRecordOffset ?? item.index);
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
