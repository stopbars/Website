const METERS_PER_DEGREE_LATITUDE = 111_320;
const ROW_SECTION_PADDING_METERS = 0.75;
const MINIMUM_PARTITION_CENTER_SEPARATION_METERS = 4;
const MINIMUM_CONTESTED_ASSIGNMENT_SCORE = 0.65;
const MAXIMUM_WEAK_SECONDARY_OWNERSHIP_SCORE = 0.7;
const MINIMUM_PRIMARY_OWNERSHIP_SCORE = 0.78;
const MINIMUM_PRIMARY_OWNERSHIP_ADVANTAGE = 0.12;
const MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES = 20;
const MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS = 12;
const MAXIMUM_WEAK_SECONDARY_COMPOSITE_DIVISION_COVERAGE = 0.3;
const MINIMUM_REDUNDANT_COMPOSITE_SECTION_OVERLAP_RATIO = 0.5;
const MAXIMUM_COMPLETE_OWNER_SCORE_DISADVANTAGE = 0.02;
const MINIMUM_REGISTERED_OWNER_SUPPRESSION_SCORE = 0.9;
const MINIMUM_REGISTERED_OWNER_SUPPRESSION_ADVANTAGE = 0.12;
const MINIMUM_REGISTERED_OWNER_OVERLAP_RATIO = 0.8;
const MINIMUM_ALLOCATED_LENGTH_RATIO = 0.4;
const MINIMUM_COMPOSITE_SOURCE_COVERAGE = 0.15;
const MINIMUM_INFERRED_COMPOSITE_SOURCE_COVERAGE = 0.04;
const MAXIMUM_TIGHT_COMPOSITE_MEAN_DISTANCE_METERS = 3;
const MAXIMUM_COMPOSITE_SECTION_ANGLE_DEGREES = 90;
const MAXIMUM_GUIDANCE_PARTITION_GAP_METERS = 40;
const MAXIMUM_GUIDANCE_END_EXTENSION_METERS = 15;
const MAXIMUM_SINGLE_OWNER_LENGTH_RATIO = 1.5;
const MAXIMUM_LOGICAL_TURN_SNAP_METERS = 8;
const MINIMUM_LOGICAL_TURN_DEGREES = 75;
const MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS = 15;
const NATURAL_BOUNDARY_PROXIMITY_METERS = 12;
const MAXIMUM_EQUIVALENT_STOPBAR_OFFSET_METERS = 25;
const MINIMUM_STOPBAR_CROSSING_ANGLE_DEGREES = 35;
const MAXIMUM_SHARED_GUIDANCE_TRUNK_ANGLE_DEGREES = 20;
const MAXIMUM_SHARED_GUIDANCE_ENDPOINT_DISTANCE_METERS = 4;
const RUNWAY_CENTERLINE_CORRIDOR_MARGIN_METERS = 10;
const MAXIMUM_RUNWAY_PARTITION_SECTION_DISTANCE_METERS = 80;
const MINIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS = 120;
const MAXIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS = 240;
const RECONSTRUCTED_LEAD_ON_EXTENSION_LENGTH_MULTIPLIER = 1.5;
const RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS = 0.6;
const MAXIMUM_CONNECTED_STOPBAR_ENDPOINT_GAP_METERS = 8;
const MAXIMUM_CONNECTED_STOPBAR_TURN_DEGREES = 100;
const MAXIMUM_CONNECTED_STOPBAR_LENGTH_METERS = 200;
const MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS = 4;
const MAXIMUM_STOPBAR_BOUNDARY_EXTENSION_METERS = 120;
const MAXIMUM_STRAIGHT_FALLBACK_EXTENSION_METERS = 180;
const MAXIMUM_STRAIGHT_FALLBACK_TURN_DEGREES = 25;
const MAXIMUM_STOPBAR_EXTENSION_TURN_DEGREES = 100;
const LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS = 3;
const HIGHER_PRIORITY_ENDPOINT_CONTACT_METERS = 0.2;
const MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS = 1.5;
const MINIMUM_STOPBAR_ANCHORED_OWNER_SOURCE_COVERAGE = 0.9;
const MINIMUM_STOPBAR_CONTINUATION_LOCAL_TURN_DEGREES = 10;
const MINIMUM_ALTERNATIVE_GUIDANCE_EVIDENCE_SCORE = 0.8;
const MINIMUM_ALTERNATIVE_GUIDANCE_SOURCE_COVERAGE = 0.7;
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
    minimumBalancedDirectionalCoverage: 0.75,
    centerDistance: 28,
    maximumAngle: 55,
    minimumLengthRatio: 0.3,
    maximumLengthRatio: 3.2,
    minimumScore: 0.41,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumInferredSourceContainedDivisionCoverage: 0.6,
    minimumContainedLengthRatio: 0.18,
    minimumProjectedSectionLengthRatio: 0.4,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    containmentMaximumAngle: 15,
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
    minimumBalancedDirectionalCoverage: 0.75,
    centerDistance: 36,
    maximumAngle: 65,
    minimumLengthRatio: 0.25,
    maximumLengthRatio: 4,
    minimumScore: 0.39,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumInferredSourceContainedDivisionCoverage: 0.6,
    minimumContainedLengthRatio: 0.18,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    containmentMaximumAngle: 15,
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
    minimumBalancedDirectionalCoverage: 0.75,
    centerDistance: 34,
    maximumAngle: 65,
    minimumLengthRatio: 0.25,
    maximumLengthRatio: 4,
    minimumScore: 0.39,
    allowSourceContainment: true,
    minimumSourceCoverage: 0.65,
    minimumDivisionCoverage: 0.18,
    minimumInferredSourceContainedDivisionCoverage: 0.6,
    minimumContainedLengthRatio: 0.18,
    minimumContainmentScore: 0.5,
    containmentMeanDistance: 5,
    containmentMaximumDistance: 12,
    containmentMaximumAngle: 15,
    registrationDistance: 55,
    registrationAngle: 28,
    minimumRegistrationScore: 0.68,
  },
};

export function matchDivisionObjects(divisionPoints, lightRows, instances = [], options = {}) {
  const includeDiagnostics = (import.meta.env?.DEV ?? true) && options.includeDiagnostics === true;
  const rowCandidateEvaluations = includeDiagnostics ? createCandidateDiagnosticCollector() : null;
  const instanceCandidateEvaluations = includeDiagnostics ? [] : null;
  const simulatorRows = lightRows ?? [];
  const referenceLatitude = findReferenceLatitude(divisionPoints, simulatorRows, instances);
  const preparedRunways = prepareRunwayCenterlines(options.runways, referenceLatitude);
  const preparedDivision = (divisionPoints ?? []).map((point, index) =>
    prepareDivisionPoint(point, index, referenceLatitude)
  );
  // oxlint-disable-next-line react-doctor/js-combine-iterations, react-doctor/js-flatmap-filter -- Eligibility, preparation, and validity are distinct matching stages.
  const preparedRows = simulatorRows
    .filter(isMatchableSimulatorRow)
    .map((row, index) => prepareSimulatorRow(row, index, referenceLatitude))
    .filter(Boolean);
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Eligibility filtering and projection are intentionally distinct preparation stages.
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
      const evaluation = includeDiagnostics
        ? {
            divisionId: stableIdentifier(division),
            simulatorCandidateId: stableIdentifier(candidate),
            simulatorClassification: candidate.raw.classification,
            simulatorSourceType: candidate.raw.sourceType,
            simulatorInferred: candidate.raw.inferred === true,
            supportsLocalRegistration,
          }
        : null;
      if (
        !boundsCouldMatch(division, candidate, config) &&
        (!supportsLocalRegistration ||
          boundsDistance(division.bounds, candidate.bounds) > config.registrationDistance)
      ) {
        if (evaluation) {
          evaluation.outcome = 'rejected';
          evaluation.reason = 'bounds-too-distant';
          evaluation.boundsDistanceMeters = round(
            boundsDistance(division.bounds, candidate.bounds),
            2
          );
          rowCandidateEvaluations.add(evaluation);
        }
        continue;
      }

      const section = simulatorSectionForDivision(division, candidate, config, referenceLatitude);
      if (!section) {
        if (evaluation) {
          evaluation.outcome = 'rejected';
          evaluation.reason = 'no-usable-simulator-section';
          rowCandidateEvaluations.add(evaluation);
        }
        continue;
      }

      let matchingDivision = division;
      let metrics = scoreDivisionCandidateSection(division, section, config, referenceLatitude);
      const directMetrics = metrics;
      let localRegistrationAttempted = false;
      if (!metrics.valid && supportsLocalRegistration) {
        localRegistrationAttempted = true;
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
      if (evaluation) {
        evaluation.section = sectionDiagnostic(section);
        evaluation.directMetrics = directMetrics;
        evaluation.localRegistrationAttempted = localRegistrationAttempted;
        evaluation.metrics = metrics;
        evaluation.sectionLengthRatio = round(sectionLengthRatio, 4);
        evaluation.meetsSectionLength = meetsSectionLength;
        evaluation.outcome = metrics.valid && meetsSectionLength ? 'eligible' : 'rejected';
        evaluation.reason = !metrics.valid
          ? 'geometry-score-rejected'
          : !meetsSectionLength
            ? 'section-too-short'
            : 'eligible-before-ownership-allocation';
        rowCandidateEvaluations.add(evaluation);
      }
      if (metrics.valid && meetsSectionLength) {
        edges.push({ division: matchingDivision, candidate, section, metrics });
      }
    }
  }

  const matchedDivisionIds = new Set();
  const matches = [];
  const allocationEvaluations = includeDiagnostics ? [] : null;
  const dominantOwnershipEdges = suppressClearlySubordinateCompositeOwners(edges);
  const priorityEdges = preferHighestPriorityEvidence(
    dominantOwnershipEdges,
    candidates,
    referenceLatitude
  );
  const ownershipEdges = preferConnectedStopbarCompositeEdges(
    suppressRedundantRegisteredStopbars(
      suppressSubordinateRegisteredGuidanceOwners(
        suppressClearlySubordinateCompositeOwners(
          suppressWeakSecondaryCandidateOwners(suppressRedundantCompositeEdges(priorityEdges))
        )
      )
    )
  );
  const connectedOwnershipEdges = addConnectedGuidanceTrunkOwners(
    ownershipEdges,
    referenceLatitude,
    edges
  );
  const allInstanceEdges = buildInstanceMatchEdges(
    matchableDivision,
    preparedInstances,
    instanceCandidateEvaluations
  );
  const allocatedEdges = allocateSimulatorGeometry(
    connectedOwnershipEdges,
    referenceLatitude,
    candidates,
    matchableDivision,
    allocationEvaluations,
    preparedRunways
  );
  const completedAllocatedEdges = completeAllocatedGuidanceRows(
    allocatedEdges,
    baseCandidates,
    matchableDivision,
    referenceLatitude,
    edges
  );
  for (const edge of completedAllocatedEdges) {
    const divisionKey = stableIdentifier(edge.division);
    const sourceSections = sourceSectionsForMergedCandidate(edge, referenceLatitude);
    if (sourceSections.length === 0) continue;

    matchedDivisionIds.add(divisionKey);
    const replacementRow = rowWithDivisionClassification(
      simplifyReconstructedReplacementRow(edge.section.prepared.raw, edge.division.raw.type),
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
          !usedInstanceIds.has(instance.raw.id) && !rowBackedInstanceIds.has(instance.raw.id)
      )
  );
  const selectedInstanceMatchEdges = [];
  for (const edge of instanceEdges) {
    const divisionKey = stableIdentifier(edge.division);
    const edgeInstances = edgeSourceInstances(edge);
    if (matchedDivisionIds.has(divisionKey)) continue;
    if (edgeInstances.some((instance) => usedInstanceIds.has(instance.raw.id))) continue;

    const row = instanceBackedRow(edge);
    matchedDivisionIds.add(divisionKey);
    for (const instance of edgeInstances) usedInstanceIds.add(instance.raw.id);
    selectedInstanceMatchEdges.push(edge);
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

  const result = {
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
  if (includeDiagnostics) {
    result.diagnostics = {
      referenceLatitude,
      configuration: matchingConfigurationDiagnostic(),
      divisionObjects: preparedDivision.map(preparedPolylineDiagnostic),
      simulatorCandidates: candidates.map(preparedPolylineDiagnostic),
      compatibleRowCandidateEvaluations: rowCandidateEvaluations.values(),
      compatibleRowCandidateSummary: rowCandidateEvaluations.summary(),
      instanceCandidateEvaluations,
      pipeline: {
        eligibleEdges: edges.map(edgeDiagnostic),
        priorityEdges: priorityEdges.map(edgeDiagnostic),
        ownershipEdges: ownershipEdges.map(edgeDiagnostic),
        connectedOwnershipEdges: connectedOwnershipEdges.map(edgeDiagnostic),
        allocatedEdges: allocatedEdges.map(edgeDiagnostic),
        completedAllocatedEdges: completedAllocatedEdges.map(edgeDiagnostic),
        allocationEvaluations,
        acceptedInstanceEdges: allInstanceEdges.map(instanceEdgeDiagnostic),
        selectedInstanceEdges: selectedInstanceMatchEdges.map(instanceEdgeDiagnostic),
      },
    };
  }
  return result;
}

const DIAGNOSTIC_CANDIDATE_LIMIT_PER_DIVISION = 12;

function createCandidateDiagnosticCollector(
  limitPerDivision = DIAGNOSTIC_CANDIDATE_LIMIT_PER_DIVISION
) {
  const buckets = new Map();
  const outcomes = new Map();
  const reasons = new Map();
  let totalEvaluations = 0;

  return {
    add(evaluation) {
      totalEvaluations += 1;
      incrementDiagnosticCount(outcomes, evaluation.outcome);
      incrementDiagnosticCount(reasons, evaluation.reason);
      const divisionId = String(evaluation.divisionId ?? '');
      const bucket = buckets.get(divisionId) ?? [];
      const ranked = { evaluation, priority: candidateDiagnosticPriority(evaluation) };
      if (bucket.length < limitPerDivision) {
        bucket.push(ranked);
        buckets.set(divisionId, bucket);
        return;
      }
      let worstIndex = 0;
      for (let index = 1; index < bucket.length; index += 1) {
        if (compareRankedDiagnostics(bucket[worstIndex], bucket[index]) < 0) {
          worstIndex = index;
        }
      }
      if (compareRankedDiagnostics(ranked, bucket[worstIndex]) < 0) {
        bucket[worstIndex] = ranked;
      }
    },
    values() {
      return [...buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([, bucket]) =>
          [...bucket].sort(compareRankedDiagnostics).map((ranked) => ranked.evaluation)
        );
    },
    summary() {
      const retainedEvaluations = [...buckets.values()].reduce(
        (total, bucket) => total + bucket.length,
        0
      );
      return {
        totalEvaluations,
        retainedEvaluations,
        omittedEvaluations: Math.max(0, totalEvaluations - retainedEvaluations),
        limitPerDivision,
        outcomes: diagnosticCounts(outcomes),
        reasons: diagnosticCounts(reasons),
      };
    },
  };
}

function candidateDiagnosticPriority(evaluation) {
  const score = Number(evaluation.metrics?.score ?? evaluation.directMetrics?.score ?? 0);
  const distance = Number(
    evaluation.metrics?.meanDistance ??
      evaluation.directMetrics?.sourceToDivisionMeanDistance ??
      evaluation.boundsDistanceMeters ??
      Number.POSITIVE_INFINITY
  );
  const outcomeRank = evaluation.outcome === 'eligible' ? 0 : 1;
  const reasonRank =
    evaluation.reason === 'section-too-short'
      ? 0
      : evaluation.reason === 'geometry-score-rejected'
        ? 1
        : evaluation.reason === 'no-usable-simulator-section'
          ? 2
          : 3;
  return [
    outcomeRank,
    reasonRank,
    -score,
    Number.isFinite(distance) ? distance : Number.MAX_SAFE_INTEGER,
    String(evaluation.simulatorCandidateId ?? ''),
  ];
}

function compareRankedDiagnostics(left, right) {
  for (let index = 0; index < left.priority.length - 1; index += 1) {
    const difference = left.priority[index] - right.priority[index];
    if (difference !== 0) return difference;
  }
  return String(left.priority.at(-1)).localeCompare(String(right.priority.at(-1)));
}

function incrementDiagnosticCount(counts, value) {
  const key = String(value ?? 'unknown');
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function diagnosticCounts(counts) {
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
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

function isLocallyRegisterableSimulatorRow(row) {
  return (
    isExactPlacementRow(row) ||
    (row?.sourceType?.startsWith('xplane-') && row.sourceGeometryDerived !== 'merged-source-row')
  );
}

function evidencePriority(row) {
  const priority = Number(row?.evidencePriority);
  return Number.isFinite(priority) && priority > 0 ? priority : 99;
}

function preferHighestPriorityEvidence(edges, candidates, referenceLatitude) {
  const kept = [];
  // Priority applies to each piece of simulator geometry, not to the whole
  // Division object. A lower-priority marking may fill a real gap, but it may
  // never replace a co-located exact light row.
  const ordered = [...edges].sort(
    (left, right) =>
      evidencePriority(left.candidate.raw) - evidencePriority(right.candidate.raw) ||
      right.metrics.score - left.metrics.score ||
      stableIdentifier(left.candidate).localeCompare(stableIdentifier(right.candidate))
  );
  for (const edge of ordered) {
    const higherPriorityGeometry = candidates.filter(
      (candidate) =>
        configFor(edge.division).classifications.has(candidate.raw.classification) &&
        evidencePriority(candidate.raw) < evidencePriority(edge.candidate.raw) &&
        boundsDistance(edge.section.prepared.bounds, candidate.bounds) <=
          LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS &&
        !candidatesShareSourceRows(edge.candidate, candidate)
    );
    kept.push(
      ...edgeSectionsWithoutHigherPriorityGeometry(edge, higherPriorityGeometry, referenceLatitude)
    );
  }
  return kept;
}

function edgeSectionsWithoutHigherPriorityGeometry(
  edge,
  higherPriorityGeometry,
  referenceLatitude
) {
  if (higherPriorityGeometry.length === 0 || evidencePriority(edge.candidate.raw) >= 99) {
    return [edge];
  }
  const ranges = geometryRangesWithoutHigherPriorityEvidence(
    edge.candidate,
    edge.section.start,
    edge.section.end,
    higherPriorityGeometry
  );
  if (
    ranges.length === 1 &&
    ranges[0][0] <= edge.section.start + 0.05 &&
    ranges[0][1] >= edge.section.end - 0.05
  ) {
    return [edge];
  }

  return ranges
    .filter(([start, end]) => end - start >= 2)
    .map(([start, end]) => {
      const section = simulatorSectionForRange(
        edge.candidate,
        edge.division,
        start,
        end,
        referenceLatitude,
        edge.section
      );
      if (!section?.prepared?.valid) return null;
      const metrics = scoreDivisionCandidateSection(
        edge.division,
        section,
        configFor(edge.division),
        referenceLatitude
      );
      if (!metrics.valid) return null;
      return {
        ...edge,
        section,
        metrics: {
          ...metrics,
          evidenceFallbackClipped: true,
          higherPriorityGeometryRemovedMeters: round(edge.section.length - section.length, 3),
        },
      };
    })
    .filter(Boolean);
}

function geometryRangesWithoutHigherPriorityEvidence(
  candidate,
  sectionStart,
  sectionEnd,
  higherPriorityGeometry
) {
  const interval = 1;
  const higherCoverage = higherPriorityGeometry.map((higher) => ({
    higher,
    exactInterval: embeddedHigherPriorityCoverageInterval(candidate, higher),
  }));
  const hasEmbeddedCoverage = higherCoverage.some(({ exactInterval }) => exactInterval);
  const breakpoints = new Set([sectionStart, sectionEnd]);
  for (let along = sectionStart + interval; along < sectionEnd; along += interval) {
    breakpoints.add(along);
  }
  for (const { exactInterval } of higherCoverage) {
    if (!exactInterval) continue;
    breakpoints.add(Math.max(sectionStart, exactInterval.start));
    breakpoints.add(Math.min(sectionEnd, exactInterval.end));
  }
  const orderedBreakpoints = [...breakpoints]
    .filter((along) => along >= sectionStart && along <= sectionEnd)
    .sort((left, right) => left - right);
  const ranges = [];
  let rangeStart;
  for (let index = 1; index < orderedBreakpoints.length; index += 1) {
    const start = orderedBreakpoints[index - 1];
    const end = orderedBreakpoints[index];
    if (end - start <= 0.000001) continue;
    const midpointAlong = (start + end) / 2;
    const midpoint = projectedPointAtDistance(candidate.projected, midpointAlong);
    const covered = higherCoverage.some(({ higher, exactInterval }) =>
      exactInterval
        ? midpointAlong >= exactInterval.start && midpointAlong <= exactInterval.end
        : !hasEmbeddedCoverage && higherPriorityGeometryCoversPoint(midpoint, higher)
    );
    if (!covered && rangeStart === undefined) rangeStart = start;
    if (covered && rangeStart !== undefined) {
      ranges.push([rangeStart, start]);
      rangeStart = undefined;
    }
  }
  if (rangeStart !== undefined) ranges.push([rangeStart, sectionEnd]);
  return ranges;
}

function embeddedHigherPriorityCoverageInterval(candidate, higher) {
  const start = projectPointToPolyline(higher.projected[0], candidate.projected);
  const end = projectPointToPolyline(higher.projected.at(-1), candidate.projected);
  if (
    start.distance <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS &&
    end.distance <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS &&
    Math.abs(start.along - end.along) >= 0.5
  ) {
    const followsCandidate = nearestDistanceSummary(higher.samples, candidate.projected);
    if (followsCandidate.maximum <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS) {
      return {
        start: Math.min(start.along, end.along),
        end: Math.max(start.along, end.along),
      };
    }
  }

  // An allocated exact-light section can overlap almost all of a marking while
  // extending slightly beyond one of the marking's endpoints. Treat the
  // sustained co-linear portion as coverage instead of rejecting the whole
  // interval because that one outer endpoint is a few metres away.
  const closeSampleProjections = higher.samples
    .map((sample) => projectPointToPolyline(sample, candidate.projected))
    .filter(
      (projection) => projection.distance <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS
    );
  if (
    closeSampleProjections.length < 3 ||
    closeSampleProjections.length / higher.samples.length < 0.7
  ) {
    return null;
  }
  let overlapStart = Math.min(...closeSampleProjections.map((projection) => projection.along));
  let overlapEnd = Math.max(...closeSampleProjections.map((projection) => projection.along));
  if (overlapEnd - overlapStart < 10) return null;

  const candidateStartOnHigher = projectPointToPolyline(candidate.projected[0], higher.projected);
  const candidateEndOnHigher = projectPointToPolyline(candidate.projected.at(-1), higher.projected);
  if (candidateStartOnHigher.distance <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS) {
    overlapStart = 0;
  }
  if (candidateEndOnHigher.distance <= LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS) {
    overlapEnd = candidate.length;
  }
  return { start: overlapStart, end: overlapEnd };
}

function higherPriorityGeometryCoversPoint(point, higher) {
  const projection = projectPointToPolyline(point, higher.projected);
  if (projection.distance > LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS) {
    return false;
  }

  const projectsInsideSource =
    projection.along > HIGHER_PRIORITY_ENDPOINT_CONTACT_METERS &&
    higher.length - projection.along > HIGHER_PRIORITY_ENDPOINT_CONTACT_METERS;
  const contactsSourceEndpoint =
    distance(point, higher.projected[0]) <= HIGHER_PRIORITY_ENDPOINT_CONTACT_METERS ||
    distance(point, higher.projected.at(-1)) <= HIGHER_PRIORITY_ENDPOINT_CONTACT_METERS;
  return projectsInsideSource || contactsSourceEndpoint;
}

function prepareDivisionPoint(point, index, referenceLatitude) {
  const coordinates = normalizeDivisionCoordinates(point?.coordinates);
  return preparePolyline(point, coordinates, index, referenceLatitude);
}

function prepareSimulatorRow(row, index, referenceLatitude) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Coordinate validation and projection are intentionally separate geometry stages.
  const coordinates = (row?.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => ({ lat: vertex.lat, lon: vertex.lon }));
  return preparePolyline(row, coordinates, index, referenceLatitude);
}

function prepareRunwayCenterlines(runways, referenceLatitude) {
  const prepared = [];
  for (const runway of runways ?? []) {
    if (
      !['bgl-runway', 'xplane-runway'].includes(runway?.sourceType) ||
      !Number.isFinite(runway.lat) ||
      !Number.isFinite(runway.lon) ||
      !Number.isFinite(runway.heading) ||
      !Number.isFinite(runway.lengthMeters) ||
      !Number.isFinite(runway.widthMeters) ||
      runway.lengthMeters <= 0 ||
      runway.widthMeters <= 0
    ) {
      continue;
    }
    const center = projectCoordinate(runway, referenceLatitude);
    const headingRadians = (runway.heading * Math.PI) / 180;
    const direction = {
      x: Math.sin(headingRadians),
      y: Math.cos(headingRadians),
    };
    const halfLength = runway.lengthMeters / 2;
    prepared.push({
      raw: runway,
      projected: [
        {
          x: center.x - direction.x * halfLength,
          y: center.y - direction.y * halfLength,
        },
        {
          x: center.x + direction.x * halfLength,
          y: center.y + direction.y * halfLength,
        },
      ],
      corridorHalfWidth: runway.widthMeters / 2 + RUNWAY_CENTERLINE_CORRIDOR_MARGIN_METERS,
    });
  }
  return prepared;
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
          Math.max(20, (division.length / Math.max(projections.length - 1, 1)) * 4)
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

  const start = Math.max(0, projectionStart - ROW_SECTION_PADDING_METERS);
  const end = Math.min(candidate.length, projectionEnd + ROW_SECTION_PADDING_METERS);
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
        Math.max(...left.map((item) => item.along)) - Math.min(...left.map((item) => item.along));
      const rightSpan =
        Math.max(...right.map((item) => item.along)) - Math.min(...right.map((item) => item.along));
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

  const partialMetrics = comparePreparedPolylines(divisionSection.prepared, section.prepared, {
    ...config,
    maximumAngle: MAXIMUM_COMPOSITE_SECTION_ANGLE_DEGREES,
    containmentMaximumAngle: MAXIMUM_COMPOSITE_SECTION_ANGLE_DEGREES,
  });
  const divisionCoverage = divisionSection.length / Math.max(division.length, 0.001);
  const sourceParentLength =
    Number(section.prepared.raw.sourceParentLengthMeters) || section.length;
  const sourceCoverage = section.length / Math.max(sourceParentLength, 0.001);
  const isMeaningfulTightSection =
    partialMetrics.valid &&
    divisionCoverage >= (config.minimumContainedLengthRatio ?? MINIMUM_ALLOCATED_LENGTH_RATIO) &&
    sourceCoverage >=
      (isExactPlacementRow(section.prepared.raw)
        ? MINIMUM_INFERRED_COMPOSITE_SOURCE_COVERAGE
        : MINIMUM_COMPOSITE_SOURCE_COVERAGE) &&
    partialMetrics.divisionToSourceMeanDistance <= MAXIMUM_TIGHT_COMPOSITE_MEAN_DISTANCE_METERS &&
    partialMetrics.divisionToSourceMaximumDistance <= 5 &&
    partialMetrics.divisionToSourceCoverage >= 0.9 &&
    partialMetrics.sourceToDivisionMeanDistance <= MAXIMUM_TIGHT_COMPOSITE_MEAN_DISTANCE_METERS &&
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

function buildInstanceMatchEdges(divisions, instances, diagnosticEvaluations = null) {
  const edges = [];

  for (const division of divisions) {
    const config = TYPE_CONFIG[division.raw.type];
    if (!config) continue;

    // oxlint-disable-next-line react-doctor/js-combine-iterations -- Classification, projection, and distance acceptance are distinct matching stages.
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
      const hasEnoughPoints = group.length >= config.instanceMinimumPoints;
      const hasEnoughCoverage = coverage >= config.instanceMinimumCoverage;
      const isCloseEnough = meanDistance <= config.instanceSearchDistance * 0.72;
      const hasEnoughScore = score >= 0.4;
      const metrics = {
        valid: hasEnoughPoints && hasEnoughCoverage && isCloseEnough && hasEnoughScore,
        score: round(score, 4),
        meanDistance: round(meanDistance, 2),
        maximumDistance: round(maximumDistance, 2),
        coverage: round(coverage, 3),
        centerDistance: round(meanDistance, 2),
        angleDifference: 0,
        lengthRatio: round(span / Math.max(division.length, 0.1), 3),
        sourceStationCount: group.length,
      };
      if (diagnosticEvaluations) {
        diagnosticEvaluations.push({
          divisionId: stableIdentifier(division),
          sourceInstanceIds: edgeSourceInstances({ instances: group }).map(
            (instance) => instance.raw.id
          ),
          stations: group.map((instance) => ({
            sourceInstanceId: instance.raw.id,
            alongMeters: round(instance.projection.along, 3),
            distanceMeters: round(instance.projection.distance, 3),
          })),
          metrics,
          outcome: metrics.valid ? 'eligible' : 'rejected',
          reason: !hasEnoughPoints
            ? 'insufficient-source-stations'
            : !hasEnoughCoverage
              ? 'insufficient-division-coverage'
              : !isCloseEnough
                ? 'mean-distance-too-large'
                : !hasEnoughScore
                  ? 'instance-score-too-low'
                  : 'eligible-before-instance-ownership',
        });
      }
      if (!metrics.valid) {
        continue;
      }

      edges.push({
        division,
        instances: group,
        config,
        metrics,
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
    ...new Set(
      rawInstances.flatMap((instance) => (instance.sourceFile ? [instance.sourceFile] : []))
    ),
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
    evidencePriority: Math.min(...rawInstances.map(evidencePriority)),
    removalEligible: rawInstances.every((instance) => instance.removalEligible !== false),
    relationshipBasis: 'division-shape-to-source-instance-proximity',
    reconstructMode: 'division-guided-source-instance-order',
    sourcePlacementCount: rawInstances.length,
    sourceInstanceIds: rawInstances.map((instance) => instance.id),
    // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Explicit falsy removal documents which instance metadata enters the Set.
    sourcePresets: [...new Set(rawInstances.map((instance) => instance.name).filter(Boolean))],
    // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Explicit falsy removal documents which instance metadata enters the Set.
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
  const divisionCoverage = forward.covered(config.coverageDistance);
  const sourceCoverage = reverse.covered(config.coverageDistance);
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
    divisionCoverage >= (config.minimumBalancedDirectionalCoverage ?? config.minimumCoverage) &&
    sourceCoverage >= (config.minimumBalancedDirectionalCoverage ?? config.minimumCoverage) &&
    centerDistance <= dynamicCenterLimit &&
    angleDifference <= config.maximumAngle &&
    lengthRatio >= config.minimumLengthRatio &&
    lengthRatio <= config.maximumLengthRatio &&
    balancedScore >= config.minimumScore;

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
    divisionCoverage >=
      (isExactPlacementRow(candidate.raw)
        ? (config.minimumInferredSourceContainedDivisionCoverage ?? config.minimumDivisionCoverage)
        : config.minimumDivisionCoverage) &&
    angleDifference <= (config.containmentMaximumAngle ?? config.maximumAngle) &&
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
    alignmentDistance: round(alignmentMode === 'source-contained' ? reverse.mean : meanDistance, 2),
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

function matchingConfigurationDiagnostic() {
  return {
    global: {
      rowSectionPaddingMeters: ROW_SECTION_PADDING_METERS,
      minimumPartitionCenterSeparationMeters: MINIMUM_PARTITION_CENTER_SEPARATION_METERS,
      minimumContestedAssignmentScore: MINIMUM_CONTESTED_ASSIGNMENT_SCORE,
      maximumWeakSecondaryOwnershipScore: MAXIMUM_WEAK_SECONDARY_OWNERSHIP_SCORE,
      minimumPrimaryOwnershipScore: MINIMUM_PRIMARY_OWNERSHIP_SCORE,
      minimumPrimaryOwnershipAdvantage: MINIMUM_PRIMARY_OWNERSHIP_ADVANTAGE,
      minimumWeakSecondaryAngleDegrees: MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES,
      minimumWeakSecondaryMaximumDistanceMeters: MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS,
      maximumWeakSecondaryCompositeDivisionCoverage:
        MAXIMUM_WEAK_SECONDARY_COMPOSITE_DIVISION_COVERAGE,
      minimumRedundantCompositeSectionOverlapRatio:
        MINIMUM_REDUNDANT_COMPOSITE_SECTION_OVERLAP_RATIO,
      maximumCompleteOwnerScoreDisadvantage: MAXIMUM_COMPLETE_OWNER_SCORE_DISADVANTAGE,
      minimumAllocatedLengthRatio: MINIMUM_ALLOCATED_LENGTH_RATIO,
      minimumCompositeSourceCoverage: MINIMUM_COMPOSITE_SOURCE_COVERAGE,
      minimumInferredCompositeSourceCoverage: MINIMUM_INFERRED_COMPOSITE_SOURCE_COVERAGE,
      maximumCompositeSectionAngleDegrees: MAXIMUM_COMPOSITE_SECTION_ANGLE_DEGREES,
      maximumGuidancePartitionGapMeters: MAXIMUM_GUIDANCE_PARTITION_GAP_METERS,
      maximumGuidanceEndExtensionMeters: MAXIMUM_GUIDANCE_END_EXTENSION_METERS,
      maximumSingleOwnerLengthRatio: MAXIMUM_SINGLE_OWNER_LENGTH_RATIO,
      maximumLogicalTurnSnapMeters: MAXIMUM_LOGICAL_TURN_SNAP_METERS,
      minimumLogicalTurnDegrees: MINIMUM_LOGICAL_TURN_DEGREES,
      maximumNaturalBoundarySnapMeters: MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS,
      naturalBoundaryProximityMeters: NATURAL_BOUNDARY_PROXIMITY_METERS,
      minimumStopbarCrossingAngleDegrees: MINIMUM_STOPBAR_CROSSING_ANGLE_DEGREES,
      minimumReconstructedLeadOnExtensionMeters: MINIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS,
      maximumReconstructedLeadOnExtensionMeters: MAXIMUM_RECONSTRUCTED_LEAD_ON_EXTENSION_METERS,
      reconstructedLeadOnExtensionLengthMultiplier:
        RECONSTRUCTED_LEAD_ON_EXTENSION_LENGTH_MULTIPLIER,
      reconstructedReplacementSimplificationToleranceMeters:
        RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS,
      maximumConnectedStopbarEndpointGapMeters: MAXIMUM_CONNECTED_STOPBAR_ENDPOINT_GAP_METERS,
      maximumConnectedStopbarTurnDegrees: MAXIMUM_CONNECTED_STOPBAR_TURN_DEGREES,
      maximumConnectedStopbarLengthMeters: MAXIMUM_CONNECTED_STOPBAR_LENGTH_METERS,
      maximumGuidanceConnectionGapMeters: MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS,
      maximumStopbarBoundaryExtensionMeters: MAXIMUM_STOPBAR_BOUNDARY_EXTENSION_METERS,
      maximumStraightFallbackExtensionMeters: MAXIMUM_STRAIGHT_FALLBACK_EXTENSION_METERS,
      maximumStraightFallbackTurnDegrees: MAXIMUM_STRAIGHT_FALLBACK_TURN_DEGREES,
      maximumStopbarExtensionTurnDegrees: MAXIMUM_STOPBAR_EXTENSION_TURN_DEGREES,
      lowerPriorityGeometryCoverageDistanceMeters: LOWER_PRIORITY_GEOMETRY_COVERAGE_DISTANCE_METERS,
    },
    types: Object.fromEntries(
      Object.entries(TYPE_CONFIG).map(([type, config]) => [
        type,
        {
          ...config,
          classifications: [...config.classifications],
          instanceClassifications: [...config.instanceClassifications],
        },
      ])
    ),
  };
}

function preparedPolylineDiagnostic(prepared) {
  return {
    id: stableIdentifier(prepared),
    valid: prepared.valid,
    type: prepared.raw.type,
    classification: prepared.raw.classification,
    sourceType: prepared.raw.sourceType,
    sourceBasis: prepared.raw.sourceBasis,
    evidencePriority: evidencePriority(prepared.raw),
    removalEligible: prepared.raw.removalEligible !== false,
    inferred: prepared.raw.inferred === true,
    confidence: prepared.raw.confidence,
    coordinateCount: prepared.coordinates?.length ?? 0,
    sampleCount: prepared.samples?.length ?? 0,
    lengthMeters: round(prepared.length ?? 0, 3),
    centerMeters: prepared.center,
    boundsMeters: prepared.bounds,
    orientationDegrees: round(prepared.orientation ?? 0, 2),
    sourceRowIds: prepared.raw.sourceRowIds,
    sourceInstanceIds: prepared.raw.sourceInstanceIds,
  };
}

function sectionDiagnostic(section) {
  return {
    startMeters: round(section.start, 3),
    endMeters: round(section.end, 3),
    lengthMeters: round(section.length, 3),
    split: section.split,
    projectionStartMeters: round(section.projectionStart, 3),
    projectionEndMeters: round(section.projectionEnd, 3),
    projectionCenterMeters: round(section.projectionCenter, 3),
    sourceParentRowId: section.prepared.raw.sourceParentRowId,
  };
}

function edgeDiagnostic(edge) {
  return {
    divisionId: stableIdentifier(edge.division),
    simulatorCandidateId: stableIdentifier(edge.candidate),
    section: sectionDiagnostic(edge.section),
    metrics: edge.metrics,
  };
}

function instanceEdgeDiagnostic(edge) {
  return {
    divisionId: stableIdentifier(edge.division),
    sourceInstanceIds: edgeSourceInstances(edge).map((instance) => instance.raw.id),
    stations: edge.instances.map((instance) => ({
      sourceInstanceId: instance.raw.id,
      alongMeters: round(instance.projection.along, 3),
      distanceMeters: round(instance.projection.distance, 3),
    })),
    metrics: edge.metrics,
  };
}

function configFor(division) {
  return TYPE_CONFIG[division.raw.type];
}

function suppressRedundantCompositeEdges(edges) {
  return edges.filter((edge) => {
    if (edge.metrics.alignmentMode !== 'composite-section') return true;
    const hasEqualOrBetterCompleteMatch = edges.some(
      (other) =>
        other !== edge &&
        stableIdentifier(other.division) === stableIdentifier(edge.division) &&
        isCompleteDivisionMatch(other) &&
        evidencePriority(other.candidate.raw) <= evidencePriority(edge.candidate.raw)
    );
    return !hasEqualOrBetterCompleteMatch || isAdditionalContainedTargetLayer(edge);
  });
}

function suppressWeakSecondaryCandidateOwners(edges) {
  const completeCandidatesByDivision = new Map();
  for (const edge of edges) {
    if (!isCompleteDivisionMatch(edge)) continue;
    const divisionKey = stableIdentifier(edge.division);
    const candidates = completeCandidatesByDivision.get(divisionKey) ?? new Map();
    candidates.set(stableIdentifier(edge.candidate), evidencePriority(edge.candidate.raw));
    completeCandidatesByDivision.set(divisionKey, candidates);
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
      const completeElsewhere = [
        ...(completeCandidatesByDivision.get(divisionKey)?.entries() ?? []),
      ].some(
        ([completeCandidateKey, completePriority]) =>
          completeCandidateKey !== candidateKey &&
          completePriority <= evidencePriority(edge.candidate.raw)
      );
      const adjacentPrimaryContinuation = isAdjacentPrimaryContinuation(edge, candidateEdges);
      const redundantCompositeAgainstCompleteOwner =
        completeElsewhere && isRedundantCompositeAgainstCompleteOwner(edge, candidateEdges);
      if (
        (!completeElsewhere ||
          (!isWeakSecondaryOwnership(edge) && !redundantCompositeAgainstCompleteOwner)) &&
        !adjacentPrimaryContinuation
      ) {
        continue;
      }

      const clearPrimaryOwner = candidateEdges.some(
        (other) =>
          stableIdentifier(other.division) !== divisionKey &&
          other.metrics.score >= MINIMUM_PRIMARY_OWNERSHIP_SCORE &&
          (other.metrics.score - edge.metrics.score >= MINIMUM_PRIMARY_OWNERSHIP_ADVANTAGE ||
            (edge.metrics.alignmentMode === 'composite-section' &&
              other.metrics.alignmentMode === 'full-shape' &&
              other.metrics.score >=
                edge.metrics.score - MAXIMUM_COMPLETE_OWNER_SCORE_DISADVANTAGE))
      );
      if (clearPrimaryOwner) suppressed.add(edge);
    }
  }

  return edges.filter((edge) => !suppressed.has(edge));
}

function suppressClearlySubordinateCompositeOwners(edges) {
  return edges.filter((edge) => {
    if (edge.metrics.alignmentMode !== 'composite-section') return true;
    return !edges.some(
      (other) =>
        other !== edge &&
        stableIdentifier(other.candidate) === stableIdentifier(edge.candidate) &&
        stableIdentifier(other.division) !== stableIdentifier(edge.division) &&
        ((other.metrics.alignmentMode === 'full-shape' &&
          other.metrics.score >= edge.metrics.score - 0.02 &&
          sectionOverlapRatio(edge.section, other.section) >= 0.5) ||
          (other.metrics.alignmentMode === 'composite-section' &&
            other.metrics.score >= edge.metrics.score - 0.01 &&
            (other.metrics.compositeSourceCoverage ?? 0) >= 0.8 &&
            (edge.metrics.compositeSourceCoverage ?? 0) <= 0.4 &&
            (other.metrics.compositeDivisionCoverage ?? 0) >=
              (edge.metrics.compositeDivisionCoverage ?? 0) + 0.2 &&
            sectionOverlapRatio(edge.section, other.section) >= 0.8))
    );
  });
}

function suppressRedundantRegisteredStopbars(edges) {
  return edges.filter((edge) => {
    if (
      edge.division.raw.type !== 'stopbar' ||
      edge.metrics.alignmentMode !== 'local-registration'
    ) {
      return true;
    }
    return !edges.some(
      (other) =>
        other !== edge &&
        stableIdentifier(other.division) === stableIdentifier(edge.division) &&
        other.metrics.alignmentMode === 'full-shape' &&
        other.metrics.score >= edge.metrics.score &&
        evidencePriority(other.candidate.raw) <= evidencePriority(edge.candidate.raw)
    );
  });
}

function suppressSubordinateRegisteredGuidanceOwners(edges) {
  return edges.filter((edge) => {
    if (
      edge.metrics.alignmentMode !== 'local-registration' ||
      !edge.candidate.raw.sourceType?.startsWith('xplane-') ||
      !GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(edge.candidate.raw.classification)
    ) {
      return true;
    }
    return !edges.some(
      (other) =>
        other !== edge &&
        stableIdentifier(other.candidate) === stableIdentifier(edge.candidate) &&
        stableIdentifier(other.division) !== stableIdentifier(edge.division) &&
        other.metrics.alignmentMode === 'full-shape' &&
        other.metrics.score >= MINIMUM_REGISTERED_OWNER_SUPPRESSION_SCORE &&
        other.metrics.score - edge.metrics.score >=
          MINIMUM_REGISTERED_OWNER_SUPPRESSION_ADVANTAGE &&
        sectionOverlapRatio(edge.section, other.section) >= MINIMUM_REGISTERED_OWNER_OVERLAP_RATIO
    );
  });
}

function addConnectedGuidanceTrunkOwners(edges, referenceLatitude, continuationEdges = edges) {
  const augmented = [...edges];
  const edgesByCandidate = new Map();
  for (const edge of edges) {
    const key = stableIdentifier(edge.candidate);
    const candidateEdges = edgesByCandidate.get(key) ?? [];
    candidateEdges.push(edge);
    edgesByCandidate.set(key, candidateEdges);
  }

  for (const candidateEdges of edgesByCandidate.values()) {
    const trunk = candidateEdges[0]?.candidate;
    if (!trunk?.raw.sourceType?.startsWith('xplane-') || trunk.raw.classification !== 'lead-on') {
      continue;
    }
    const completeOwner = candidateEdges
      .filter((edge) => edge.metrics.alignmentMode === 'full-shape')
      .sort((left, right) => right.metrics.score - left.metrics.score)[0];
    if (!completeOwner || trunk.length < completeOwner.division.length * 4) continue;

    const existingDivisionKeys = new Set(
      candidateEdges.map((edge) => stableIdentifier(edge.division))
    );
    const connectedByDivision = new Map();
    for (const branchEdge of edges) {
      const divisionKey = stableIdentifier(branchEdge.division);
      if (
        existingDivisionKeys.has(divisionKey) ||
        stableIdentifier(branchEdge.candidate) === stableIdentifier(trunk) ||
        !(
          branchEdge.metrics.alignmentMode === 'full-shape' ||
          (branchEdge.metrics.alignmentMode === 'composite-section' &&
            branchEdge.metrics.score >= 0.9 &&
            branchEdge.metrics.sourceToDivisionCoverage >= 0.9)
        ) ||
        branchEdge.metrics.score < 0.8 ||
        !GUIDANCE_DIVISION_TYPES.has(branchEdge.division.raw.type) ||
        !GUIDANCE_SOURCE_CLASSIFICATIONS.has(branchEdge.candidate.raw.classification) ||
        (trunk.raw.sourceFile &&
          branchEdge.candidate.raw.sourceFile &&
          trunk.raw.sourceFile !== branchEdge.candidate.raw.sourceFile)
      ) {
        continue;
      }

      for (const endpoint of [
        branchEdge.candidate.projected[0],
        branchEdge.candidate.projected.at(-1),
      ]) {
        const projection = projectPointToPolyline(endpoint, trunk.projected);
        if (
          projection.distance > MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS ||
          projection.along <= 1 ||
          projection.along >= trunk.length - 1
        ) {
          continue;
        }
        const strongZeroGapFullShape =
          branchEdge.metrics.alignmentMode === 'full-shape' &&
          branchEdge.metrics.score >= 0.8 &&
          projection.distance <= 0.5;
        if (branchEdge.metrics.score < 0.85 && !strongZeroGapFullShape) continue;
        if (
          hasStraighterConnectedSourceContinuation(
            branchEdge,
            endpoint,
            trunk,
            projection,
            continuationEdges
          )
        ) {
          continue;
        }
        const current = connectedByDivision.get(divisionKey);
        if (
          !current ||
          branchEdge.metrics.score > current.branchEdge.metrics.score ||
          (branchEdge.metrics.score === current.branchEdge.metrics.score &&
            projection.distance < current.projection.distance)
        ) {
          connectedByDivision.set(divisionKey, { branchEdge, projection });
        }
      }
    }

    for (const { branchEdge, projection } of connectedByDivision.values()) {
      const halfSectionLength = Math.max(2, branchEdge.division.length * 0.2);
      const section = simulatorSectionForRange(
        trunk,
        branchEdge.division,
        Math.max(0, projection.along - halfSectionLength),
        Math.min(trunk.length, projection.along + halfSectionLength),
        referenceLatitude
      );
      if (!section?.prepared?.valid) continue;
      augmented.push({
        ...branchEdge,
        candidate: trunk,
        section,
        metrics: {
          ...branchEdge.metrics,
          alignmentMode: 'source-junction-ownership',
          sourceConnectionBasis: 'connected-guidance-junction',
          sourceConnectionStationMeters: round(projection.along, 3),
          sourceConnectionGapMeters: round(projection.distance, 3),
        },
      });
    }
  }
  return augmented;
}

function hasStraighterConnectedSourceContinuation(
  branchEdge,
  branchEndpoint,
  trunk,
  trunkProjection,
  edges
) {
  const branchSide =
    distance(branchEndpoint, branchEdge.candidate.projected[0]) <=
    distance(branchEndpoint, branchEdge.candidate.projected.at(-1))
      ? 'start'
      : 'end';
  const trunkTurn = sourceContinuationTurn(
    branchEdge.candidate,
    branchSide,
    trunk,
    trunkProjection
  );
  if (!Number.isFinite(trunkTurn)) return false;

  return edges.some((alternativeEdge) => {
    if (
      stableIdentifier(alternativeEdge.division) !== stableIdentifier(branchEdge.division) ||
      stableIdentifier(alternativeEdge.candidate) === stableIdentifier(branchEdge.candidate) ||
      stableIdentifier(alternativeEdge.candidate) === stableIdentifier(trunk) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(alternativeEdge.candidate.raw.classification) ||
      (trunk.raw.sourceFile &&
        alternativeEdge.candidate.raw.sourceFile &&
        trunk.raw.sourceFile !== alternativeEdge.candidate.raw.sourceFile)
    ) {
      return false;
    }
    const projection = projectPointToPolyline(branchEndpoint, alternativeEdge.candidate.projected);
    if (
      projection.distance > MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS ||
      projection.along <= 1 ||
      projection.along >= alternativeEdge.candidate.length - 1
    ) {
      return false;
    }
    const alternativeTurn = sourceContinuationTurn(
      branchEdge.candidate,
      branchSide,
      alternativeEdge.candidate,
      projection
    );
    return (
      alternativeTurn + 10 < trunkTurn ||
      (alternativeTurn <= trunkTurn + 5 && projection.distance + 1 < trunkProjection.distance)
    );
  });
}

function sourceContinuationTurn(branch, branchSide, continuation, projection) {
  if (
    branch.projected.length < 2 ||
    continuation.projected.length < 2 ||
    !Number.isFinite(projection.along)
  ) {
    return Infinity;
  }
  const branchEndpoint = branchSide === 'start' ? branch.projected[0] : branch.projected.at(-1);
  const branchInward = branchSide === 'start' ? branch.projected[1] : branch.projected.at(-2);
  const connection = projectedPointAtDistance(continuation.projected, projection.along);
  const sampleDistance = Math.min(5, Math.max(1, continuation.length * 0.02));
  const nextPoints = [];
  if (projection.along >= sampleDistance) {
    nextPoints.push(
      projectedPointAtDistance(continuation.projected, projection.along - sampleDistance)
    );
  }
  if (continuation.length - projection.along >= sampleDistance) {
    nextPoints.push(
      projectedPointAtDistance(continuation.projected, projection.along + sampleDistance)
    );
  }
  return Math.min(
    ...nextPoints.map((next) => directedTurnDegrees(branchInward, branchEndpoint, connection, next))
  );
}

function isRedundantCompositeAgainstCompleteOwner(edge, candidateEdges) {
  if (edge.metrics.alignmentMode !== 'composite-section') return false;
  return candidateEdges.some(
    (other) =>
      stableIdentifier(other.division) !== stableIdentifier(edge.division) &&
      isCompleteDivisionMatch(other) &&
      evidencePriority(other.candidate.raw) <= evidencePriority(edge.candidate.raw) &&
      other.metrics.score >= edge.metrics.score - MAXIMUM_COMPLETE_OWNER_SCORE_DISADVANTAGE &&
      sectionOverlapRatio(edge.section, other.section) >=
        MINIMUM_REDUNDANT_COMPOSITE_SECTION_OVERLAP_RATIO
  );
}

function isAdjacentPrimaryContinuation(edge, candidateEdges) {
  if (
    edge.metrics.alignmentMode !== 'composite-section' ||
    edge.metrics.compositeSourceCoverage >= MINIMUM_COMPOSITE_SOURCE_COVERAGE
  ) {
    return false;
  }
  return candidateEdges.some(
    (other) =>
      stableIdentifier(other.division) !== stableIdentifier(edge.division) &&
      isCompleteDivisionMatch(other) &&
      sectionGapMeters(edge.section, other.section) <= MAXIMUM_GUIDANCE_PARTITION_GAP_METERS
  );
}

function sectionGapMeters(left, right) {
  if (left.end < right.start) return right.start - left.end;
  if (right.end < left.start) return left.start - right.end;
  return 0;
}

function sectionOverlapRatio(left, right) {
  const overlap = Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
  return overlap / Math.max(left.end - left.start, 0.001);
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
    (edge.metrics.alignmentMode === 'composite-section' &&
      edge.metrics.compositeDivisionCoverage <
        MAXIMUM_WEAK_SECONDARY_COMPOSITE_DIVISION_COVERAGE) ||
    (edge.metrics.alignmentMode === 'local-registration' &&
      (edge.metrics.angleDifference >= MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES ||
        edge.metrics.divisionToSourceMaximumDistance >=
          MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS ||
        edge.metrics.divisionToSourceCoverage <= 0.8)) ||
    (edge.metrics.score <= MAXIMUM_WEAK_SECONDARY_OWNERSHIP_SCORE &&
      (edge.metrics.angleDifference >= MINIMUM_WEAK_SECONDARY_ANGLE_DEGREES ||
        edge.metrics.divisionToSourceMaximumDistance >=
          MINIMUM_WEAK_SECONDARY_MAXIMUM_DISTANCE_METERS ||
        edge.metrics.divisionToSourceCoverage <= 0.8))
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
    replacementGeometryToleranceMeters: RECONSTRUCTED_REPLACEMENT_SIMPLIFICATION_TOLERANCE_METERS,
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

function allocateSimulatorGeometry(
  edges,
  referenceLatitude,
  allCandidates,
  allDivisions = [],
  diagnosticEvaluations = null,
  runways = []
) {
  const edgesByCandidate = new Map();
  for (const edge of edges) {
    const key = stableIdentifier(edge.candidate);
    const candidateEdges = edgesByCandidate.get(key) ?? [];
    candidateEdges.push(edge);
    edgesByCandidate.set(key, candidateEdges);
  }

  const allocated = [];
  for (const candidateEdges of edgesByCandidate.values()) {
    const initiallyChosen = chooseDistinctCandidateAssignments(candidateEdges).filter((edge) =>
      sectionMeetsAllocationMinimum(edge, edge.section.length)
    );
    if (initiallyChosen.length === 0) continue;
    const candidate = initiallyChosen[0].candidate;
    const naturalBoundaries = naturalBoundaryStations(candidate, allCandidates, allDivisions);
    const ownershipPreference = preferStopbarAnchoredContinuousGuidanceOwner(
      initiallyChosen,
      edges,
      candidate,
      naturalBoundaries,
      allDivisions
    );
    const chosen = ownershipPreference.chosen;
    if (diagnosticEvaluations) {
      for (const edge of ownershipPreference.suppressed) {
        diagnosticEvaluations.push({
          divisionId: edge.division.raw.id,
          simulatorRowId: edge.candidate.raw.id,
          matchedRange: {
            startMeters: round(edge.section.start, 3),
            endMeters: round(edge.section.end, 3),
          },
          naturalBoundaries: naturalBoundaries.map((boundary) => ({
            stationMeters: round(boundary.along, 3),
            kind: boundary.kind,
            source: boundary.source,
          })),
          outcome: 'suppressed-by-stopbar-anchored-continuation-owner',
          preferredDivisionId: ownershipPreference.preferredDivisionId,
        });
      }
    }
    const partitionGuidance =
      GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification) &&
      chosen.every((edge) => {
        // oxlint-disable-next-line react-doctor/js-cache-property-access -- This callback reads the chain once; the rule conflates other edge bindings in the surrounding loop.
        const divisionType = edge.division.raw.type;
        return GUIDANCE_DIVISION_TYPES.has(divisionType);
      });
    const nativeLeadOnCandidate = candidate.raw.classification === 'lead-on';
    const reconstructedGuidanceCandidate = isExactPlacementRow(candidate.raw);
    // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
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
      const partition = partitionBoundary(left, right, candidate, naturalBoundaries, runways);
      partitionLinks.push({
        ...partition,
        sharesGuidanceTrunk: divisionsShareGuidanceTrunk(left.division, right.division),
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
      const { start: sectionStart, end: sectionEnd } = edge.section;
      const evaluation = diagnosticEvaluations
        ? {
            divisionId: edge.division.raw.id,
            simulatorRowId: edge.candidate.raw.id,
            matchedRange: {
              startMeters: round(sectionStart, 3),
              endMeters: round(sectionEnd, 3),
            },
            naturalBoundaries: naturalBoundaries.map((boundary) => ({
              stationMeters: round(boundary.along, 3),
              kind: boundary.kind,
              source: boundary.source,
            })),
            partitionBoundaries: [
              ...(partitionLinks[index - 1] ? [partitionLinks[index - 1]] : []),
              ...(partitionLinks[index] ? [partitionLinks[index]] : []),
            ].map((partition) => ({
              stationMeters: round(partition.boundary, 3),
              basis: partition.basis,
              runwayId: partition.runwayId,
            })),
          }
        : null;
      const extendNativeLeadOn = nativeLeadOnCandidate && edge.division.raw.type === 'lead_on';
      const extendReconstructedLeadOn =
        reconstructedGuidanceCandidate && edge.division.raw.type === 'lead_on';
      const extendCompatibleLeadOn =
        GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification) &&
        edge.division.raw.type === 'lead_on';
      const extendLeadOnWholeSource =
        extendNativeLeadOn || extendReconstructedLeadOn || extendCompatibleLeadOn;
      const reconstructedExtensionLimit = extendReconstructedLeadOn
        ? reconstructedLeadOnExtensionLimit(edge.division.length)
        : Infinity;
      const matchedStopbarCell = stopbarCellForMatchedSection(edge.section, naturalBoundaries);
      const startAnchoredByStopbar = extendReconstructedLeadOn && Boolean(matchedStopbarCell.upper);
      const endAnchoredByStopbar = extendReconstructedLeadOn && Boolean(matchedStopbarCell.lower);
      const startPartitioned =
        Boolean(partitionLinks[index - 1]?.connectsGuidance) &&
        !partitionLinks[index - 1].sharesGuidanceTrunk;
      const endPartitioned =
        Boolean(partitionLinks[index]?.connectsGuidance) &&
        !partitionLinks[index].sharesGuidanceTrunk;
      const startExtensionLimit =
        startAnchoredByStopbar ||
        (extendReconstructedLeadOn && hasNaturalBoundaryAnchor(sectionEnd, naturalBoundaries))
          ? Infinity
          : reconstructedExtensionLimit;
      const endExtensionLimit =
        endAnchoredByStopbar ||
        (extendReconstructedLeadOn && hasNaturalBoundaryAnchor(sectionStart, naturalBoundaries))
          ? Infinity
          : reconstructedExtensionLimit;
      let start = sectionStart;
      let end = sectionEnd;
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
        } else if (
          partitionLinks[index - 1]?.connectsGuidance &&
          !partitionLinks[index - 1].sharesGuidanceTrunk
        ) {
          start = partitionLinks[index - 1].boundary;
        }
        if (
          index === ordered.length - 1 &&
          (extendLeadOnWholeSource ||
            candidate.length - end <= MAXIMUM_GUIDANCE_END_EXTENSION_METERS ||
            singleOwnerSupportsWholeCandidate)
        ) {
          end = candidate.length;
        } else if (
          partitionLinks[index]?.connectsGuidance &&
          !partitionLinks[index].sharesGuidanceTrunk
        ) {
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
      if (stableIdentifier(edge.division) === ownershipPreference.forceWholeCandidateDivisionId) {
        start = 0;
        end = candidate.length;
      }
      if (evaluation) {
        evaluation.extendedRange = {
          startMeters: round(start, 3),
          endMeters: round(end, 3),
        };
      }
      if (extendReconstructedLeadOn) {
        start = snapMatchedBoundaryToDivisionStopbar(
          start,
          edge.section.start,
          naturalBoundaries,
          'start'
        );
        end = snapMatchedBoundaryToDivisionStopbar(end, edge.section.end, naturalBoundaries, 'end');
      }
      start = clampOutwardExtensionAtNaturalBoundary(
        start,
        edge.section.start,
        naturalBoundaries,
        'start',
        startExtensionLimit,
        startAnchoredByStopbar || startPartitioned
      );
      end = clampOutwardExtensionAtNaturalBoundary(
        end,
        edge.section.end,
        naturalBoundaries,
        'end',
        endExtensionLimit,
        endAnchoredByStopbar || endPartitioned
      );
      ({ start, end } = clampAllocationToStopbarCell(start, end, edge.section, naturalBoundaries));
      if (evaluation) {
        evaluation.clampedRange = {
          startMeters: round(start, 3),
          endMeters: round(end, 3),
        };
      }
      const section = simulatorSectionForRange(
        candidate,
        edge.division,
        start,
        end,
        referenceLatitude,
        edge.section
      );
      const meetsAllocationMinimum =
        section?.prepared?.valid && sectionMeetsAllocationMinimum(edge, section.length);
      if (evaluation) {
        evaluation.allocatedLengthMeters = round(section?.length ?? 0, 3);
        evaluation.minimumLengthMeters = round(
          edge.division.length * MINIMUM_ALLOCATED_LENGTH_RATIO,
          3
        );
        evaluation.outcome = meetsAllocationMinimum ? 'allocated' : 'rejected-after-boundary-clamp';
        diagnosticEvaluations.push(evaluation);
      }
      if (meetsAllocationMinimum) {
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

function preferStopbarAnchoredContinuousGuidanceOwner(
  chosen,
  allEdges,
  candidate,
  naturalBoundaries,
  allDivisions
) {
  if (
    chosen.length < 2 ||
    !GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification) ||
    !candidate.raw.sourceType?.startsWith('xplane-') ||
    maximumLocalPolylineTurnDegrees(candidate.projected) <
      MINIMUM_STOPBAR_CONTINUATION_LOCAL_TURN_DEGREES
  ) {
    return { chosen, suppressed: [] };
  }

  const endpointStopbars = candidateEndpointStopbarBoundaries(
    candidate,
    naturalBoundaries,
    allDivisions
  );
  if (endpointStopbars.length === 0) return { chosen, suppressed: [] };

  const anchoredOwners = chosen.filter(
    (edge) =>
      edge.division.raw.type === 'lead_on' &&
      edge.metrics.sourceToDivisionCoverage >= MINIMUM_STOPBAR_ANCHORED_OWNER_SOURCE_COVERAGE &&
      endpointStopbars.some(
        (boundary) =>
          boundary.along >= edge.section.start - MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS &&
          boundary.along <= edge.section.end + MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS &&
          divisionTouchesCandidateEndpoint(edge.division, candidate, boundary)
      )
  );
  if (
    anchoredOwners.length !== 1 ||
    endpointStopbars.some((boundary) =>
      chosen.some(
        (edge) =>
          edge !== anchoredOwners[0] &&
          boundary.along >= edge.section.start - MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS &&
          boundary.along <= edge.section.end + MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS
      )
    )
  ) {
    return { chosen, suppressed: [] };
  }

  const anchoredOwner = anchoredOwners[0];
  const suppressed = chosen.filter(
    (edge) =>
      edge !== anchoredOwner &&
      edge.division.raw.type === 'lead_on' &&
      hasConnectedAlternativeGuidanceEvidence(edge, allEdges, candidate)
  );

  const suppressedSet = new Set(suppressed);
  return {
    chosen: chosen.filter((edge) => !suppressedSet.has(edge)),
    suppressed,
    preferredDivisionId: stableIdentifier(anchoredOwner.division),
    forceWholeCandidateDivisionId: stableIdentifier(anchoredOwner.division),
  };
}

function hasConnectedAlternativeGuidanceEvidence(edge, allEdges, contestedCandidate) {
  return allEdges.some((other) => {
    if (
      other === edge ||
      stableIdentifier(other.division) !== stableIdentifier(edge.division) ||
      stableIdentifier(other.candidate) === stableIdentifier(contestedCandidate) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(other.candidate.raw.classification) ||
      evidencePriority(other.candidate.raw) > evidencePriority(contestedCandidate.raw) ||
      other.metrics.score < MINIMUM_ALTERNATIVE_GUIDANCE_EVIDENCE_SCORE ||
      other.metrics.sourceToDivisionCoverage < MINIMUM_ALTERNATIVE_GUIDANCE_SOURCE_COVERAGE ||
      (contestedCandidate.raw.sourceFile &&
        other.candidate.raw.sourceFile &&
        contestedCandidate.raw.sourceFile !== other.candidate.raw.sourceFile)
    ) {
      return false;
    }

    return [other.candidate.projected[0], other.candidate.projected.at(-1)].some((endpoint) => {
      const projection = projectPointToPolyline(endpoint, contestedCandidate.projected);
      return (
        projection.distance <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS &&
        projection.along > MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS &&
        projection.along < contestedCandidate.length - MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS
      );
    });
  });
}

function candidateEndpointStopbarBoundaries(candidate, naturalBoundaries, allDivisions) {
  const boundaries = naturalBoundaries.filter(
    (boundary) =>
      boundary.kind === 'stopbar' &&
      (boundary.along <= MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS ||
        candidate.length - boundary.along <= MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS)
  );
  for (const [along, endpoint] of [
    [0, candidate.projected[0]],
    [candidate.length, candidate.projected.at(-1)],
  ]) {
    const nearbyStopbar = allDivisions.some(
      (division) =>
        division.raw.type === 'stopbar' &&
        projectPointToPolyline(endpoint, division.projected).distance <=
          NATURAL_BOUNDARY_PROXIMITY_METERS
    );
    if (
      nearbyStopbar &&
      !boundaries.some(
        (boundary) => Math.abs(boundary.along - along) <= MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS
      )
    ) {
      boundaries.push({ along, kind: 'stopbar', source: 'division-endpoint-proximity' });
    }
  }
  return boundaries;
}

function divisionTouchesCandidateEndpoint(division, candidate, boundary) {
  const endpoint =
    boundary.along <= MAXIMUM_STOPBAR_ENDPOINT_OWNER_GAP_METERS
      ? candidate.projected[0]
      : candidate.projected.at(-1);
  return [division.projected[0], division.projected.at(-1)].some(
    (divisionEndpoint) => distance(divisionEndpoint, endpoint) <= NATURAL_BOUNDARY_PROXIMITY_METERS
  );
}

function maximumLocalPolylineTurnDegrees(points) {
  let maximumTurn = 0;
  for (let index = 2; index < points.length; index += 1) {
    maximumTurn = Math.max(
      maximumTurn,
      segmentOrientationDifference(
        points[index - 2],
        points[index - 1],
        points[index - 1],
        points[index]
      )
    );
  }
  return maximumTurn;
}

function completeAllocatedGuidanceRows(
  allocatedEdges,
  candidates,
  divisions,
  referenceLatitude,
  eligibleEdges
) {
  const completed = [...allocatedEdges];
  const completionKeys = new Set();
  const endpointIndex = buildGuidanceEndpointIndex(candidates);
  const preferredEvidenceOwners = preferredCompletionEvidenceOwners(eligibleEdges);

  for (const evidenceEdge of preferredEvidenceOwners.values()) {
    const candidate = evidenceEdge.candidate;
    const completionEvidenceOwner = dominantCompletionEvidenceOwner(evidenceEdge, eligibleEdges);
    const divisionKey = stableIdentifier(evidenceEdge.division);
    const ownerIsAllocated = allocatedEdges.some(
      (edge) => stableIdentifier(edge.division) === divisionKey
    );
    const candidateIsAlreadyAllocated = allocatedEdges.some(
      (edge) =>
        stableIdentifier(edge.division) === divisionKey &&
        stableIdentifier(edge.candidate) === stableIdentifier(candidate)
    );
    const touchesCandidateEnd =
      evidenceEdge.section.start <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS ||
      candidate.length - evidenceEdge.section.end <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS;
    if (
      !ownerIsAllocated ||
      candidateIsAlreadyAllocated ||
      !touchesCandidateEnd ||
      !GUIDANCE_DIVISION_TYPES.has(evidenceEdge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification)
    ) {
      continue;
    }

    // Only allocated higher-priority sections can suppress a fallback row.
    // Whole raw rows may also serve other Division objects and previously
    // punched artificial holes through otherwise continuous apt.dat/DSF
    // marking evidence.
    const higherPriorityGeometry = allocatedEdges
      .filter(
        (higherEdge) =>
          stableIdentifier(higherEdge.division) === divisionKey &&
          GUIDANCE_SOURCE_CLASSIFICATIONS.has(higherEdge.candidate.raw.classification) &&
          evidencePriority(higherEdge.candidate.raw) < evidencePriority(candidate.raw) &&
          !candidatesShareSourceRows(candidate, higherEdge.candidate) &&
          boundsDistance(candidate.bounds, higherEdge.section.prepared.bounds) <=
            MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
      )
      .map((higherEdge) => higherEdge.section.prepared);
    if (higherPriorityGeometry.length === 0) continue;

    const embeddedHigherPriorityGeometry = higherPriorityGeometry.filter((higher) =>
      embeddedHigherPriorityCoverageInterval(candidate, higher)
    );
    const extendsAllocatedEndpoint =
      embeddedHigherPriorityGeometry.length === 0 &&
      higherPriorityGeometry.some((higher) =>
        guidancePolylinesConnectAtEndpoints(candidate, higher)
      );
    if (embeddedHigherPriorityGeometry.length === 0 && !extendsAllocatedEndpoint) continue;

    const uncoveredRanges =
      embeddedHigherPriorityGeometry.length > 0
        ? geometryRangesWithoutHigherPriorityEvidence(
            candidate,
            0,
            candidate.length,
            embeddedHigherPriorityGeometry
          )
        : [[0, candidate.length]];
    const uncoveredLength = uncoveredRanges.reduce((sum, [start, end]) => sum + end - start, 0);
    const coveredLength = candidate.length - uncoveredLength;
    if (uncoveredLength < 2 || (embeddedHigherPriorityGeometry.length > 0 && coveredLength < 2)) {
      continue;
    }

    const naturalBoundaries = naturalBoundaryStations(candidate, candidates, divisions);
    for (const [unclampedStart, unclampedEnd] of uncoveredRanges) {
      const clampedRange = clampAllocationToStopbarCell(
        unclampedStart,
        unclampedEnd,
        evidenceEdge.section,
        naturalBoundaries
      );
      const ownershipRanges = completionOwnershipRanges(
        candidate,
        clampedRange.start,
        clampedRange.end,
        completionEvidenceOwner,
        allocatedEdges
      );
      for (const { start, end, ownerEdge, ownershipBasis } of ownershipRanges) {
        if (end - start < 2 || end - start > MAXIMUM_STRAIGHT_FALLBACK_EXTENSION_METERS) {
          continue;
        }
        if (
          completionConnectsAcrossStopbar(
            candidate,
            start,
            end,
            higherPriorityGeometry,
            naturalBoundaries
          )
        ) {
          continue;
        }
        const section = simulatorSectionForRange(
          candidate,
          ownerEdge.division,
          start,
          end,
          referenceLatitude
        );
        if (!section?.prepared?.valid) continue;

        const ownerKey = stableIdentifier(ownerEdge.division);
        const key = [
          ownerKey,
          stableIdentifier(candidate),
          round(section.start, 2),
          round(section.end, 2),
        ].join('|');
        if (completionKeys.has(key)) continue;
        completionKeys.add(key);
        completed.push({
          ...ownerEdge,
          candidate,
          section,
          metrics: {
            ...ownerEdge.metrics,
            alignmentMode: 'source-evidence-continuation',
            sourceConnectionBasis:
              ownershipBasis ??
              (stableIdentifier(ownerEdge.division) ===
              stableIdentifier(completionEvidenceOwner.division)
                ? embeddedHigherPriorityGeometry.length > 0
                  ? 'uncovered-lower-priority-evidence'
                  : 'connected-lower-priority-evidence'
                : 'midpoint-between-connected-owners'),
            sourceConnectionExtensionMeters: round(section.length, 3),
            higherPriorityGeometryRemovedMeters: round(coveredLength, 3),
          },
        });
      }
    }
  }

  for (const edge of allocatedEdges) {
    if (
      !GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(edge.candidate.raw.classification)
    ) {
      continue;
    }

    for (const endpoint of allocatedEdgeEndpoints(edge)) {
      const options = [];
      for (const { connector, connectorSide } of nearbyGuidanceEndpoints(
        endpointIndex,
        endpoint.point
      )) {
        if (
          !connector.valid ||
          !GUIDANCE_SOURCE_CLASSIFICATIONS.has(connector.raw.classification) ||
          candidatesShareSourceRows(edge.candidate, connector) ||
          (edge.candidate.raw.sourceFile &&
            connector.raw.sourceFile &&
            edge.candidate.raw.sourceFile !== connector.raw.sourceFile)
        ) {
          continue;
        }

        const connectionPoint =
          connectorSide === 'start' ? connector.projected[0] : connector.projected.at(-1);
        const nextPoint =
          connectorSide === 'start' ? connector.projected[1] : connector.projected.at(-2);
        const gap = distance(endpoint.point, connectionPoint);
        if (gap > MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS || !nextPoint) continue;
        if (guidanceConnectionTouchesStopbar(endpoint.point, divisions)) continue;
        const preferredEvidenceOwner = preferredEvidenceOwners.get(stableIdentifier(connector));
        if (preferredEvidenceOwner) continue;

        const turn = directedTurnDegrees(
          endpoint.inward,
          endpoint.point,
          connectionPoint,
          nextPoint
        );
        const stopbarCompletion = nearestStopbarBoundaryCompletion(
          connector,
          connectorSide,
          divisions
        );
        if (stopbarCompletion && turn <= MAXIMUM_STOPBAR_EXTENSION_TURN_DEGREES) {
          options.push({
            connector,
            connectorSide,
            gap,
            turn,
            ...stopbarCompletion,
            basis: 'stopbar-boundary',
          });
          continue;
        }

        const isLowerPriorityFallback =
          evidencePriority(connector.raw) > evidencePriority(edge.candidate.raw);
        if (
          isLowerPriorityFallback &&
          turn <= MAXIMUM_STRAIGHT_FALLBACK_TURN_DEGREES &&
          connector.length <= MAXIMUM_STRAIGHT_FALLBACK_EXTENSION_METERS
        ) {
          options.push({
            connector,
            connectorSide,
            gap,
            turn,
            targetAlong: connectorSide === 'start' ? connector.length : 0,
            extensionLength: connector.length,
            basis: 'straight-source-fallback',
          });
        }
      }

      const selected = options.sort(
        (left, right) =>
          evidencePriority(left.connector.raw) - evidencePriority(right.connector.raw) ||
          Number(right.basis === 'stopbar-boundary') - Number(left.basis === 'stopbar-boundary') ||
          left.extensionLength - right.extensionLength ||
          left.turn - right.turn ||
          left.gap - right.gap ||
          stableIdentifier(left.connector).localeCompare(stableIdentifier(right.connector))
      )[0];
      if (!selected) continue;

      const requestedStart = selected.connectorSide === 'start' ? 0 : selected.targetAlong;
      const requestedEnd =
        selected.connectorSide === 'start' ? selected.targetAlong : selected.connector.length;
      const section = simulatorSectionForRange(
        selected.connector,
        edge.division,
        requestedStart,
        requestedEnd,
        referenceLatitude
      );
      if (!section?.prepared?.valid) continue;

      const key = [
        stableIdentifier(edge.division),
        stableIdentifier(selected.connector),
        round(section.start, 2),
        round(section.end, 2),
      ].join('|');
      if (completionKeys.has(key)) continue;
      completionKeys.add(key);
      completed.push({
        ...edge,
        candidate: selected.connector,
        section,
        metrics: {
          ...edge.metrics,
          alignmentMode:
            selected.basis === 'stopbar-boundary'
              ? 'source-connected-stopbar-boundary'
              : 'source-connected-fallback',
          sourceConnectionGapMeters: round(selected.gap, 3),
          sourceConnectionTurnDegrees: round(selected.turn, 1),
          sourceConnectionExtensionMeters: round(selected.extensionLength, 3),
          sourceConnectionBasis: selected.basis,
          sourceConnectionStopbarId: selected.stopbar
            ? stableIdentifier(selected.stopbar)
            : undefined,
        },
      });
    }
  }

  return completed;
}

function dominantCompletionEvidenceOwner(evidenceEdge, eligibleEdges) {
  const alternatives = eligibleEdges.filter(
    (other) =>
      stableIdentifier(other.candidate) === stableIdentifier(evidenceEdge.candidate) &&
      stableIdentifier(other.division) !== stableIdentifier(evidenceEdge.division) &&
      other.division.raw.type === evidenceEdge.division.raw.type &&
      other.division.raw.name === evidenceEdge.division.raw.name &&
      other.metrics.alignmentMode === 'full-shape' &&
      evidenceEdge.metrics.alignmentMode === 'full-shape' &&
      other.metrics.score >= evidenceEdge.metrics.score - 0.03 &&
      other.section.length >= evidenceEdge.section.length * 1.5 &&
      sectionOverlapRatio(evidenceEdge.section, other.section) >= 0.8
  );
  return (
    alternatives.sort(
      (left, right) =>
        right.section.length - left.section.length ||
        right.metrics.score - left.metrics.score ||
        stableIdentifier(left.division).localeCompare(stableIdentifier(right.division))
    )[0] ?? evidenceEdge
  );
}

function preferredCompletionEvidenceOwners(eligibleEdges) {
  const preferred = new Map();
  for (const edge of eligibleEdges) {
    if (
      !GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(edge.candidate.raw.classification)
    ) {
      continue;
    }
    const key = stableIdentifier(edge.candidate);
    const current = preferred.get(key);
    if (
      !current ||
      edge.metrics.score > current.metrics.score ||
      (edge.metrics.score === current.metrics.score &&
        stableIdentifier(edge.division).localeCompare(stableIdentifier(current.division)) < 0)
    ) {
      preferred.set(key, edge);
    }
  }
  return preferred;
}

function buildGuidanceEndpointIndex(candidates) {
  const index = new Map();
  for (const connector of candidates) {
    if (!connector.valid || !GUIDANCE_SOURCE_CLASSIFICATIONS.has(connector.raw.classification)) {
      continue;
    }
    for (const connectorSide of ['start', 'end']) {
      const point = connectorSide === 'start' ? connector.projected[0] : connector.projected.at(-1);
      const key = guidanceEndpointCellKey(point.x, point.y);
      const entries = index.get(key) ?? [];
      entries.push({ connector, connectorSide });
      index.set(key, entries);
    }
  }
  return index;
}

function nearbyGuidanceEndpoints(index, point) {
  const cellX = Math.floor(point.x / MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS);
  const cellY = Math.floor(point.y / MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS);
  const entries = [];
  for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      entries.push(...(index.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? []));
    }
  }
  return entries;
}

function guidanceEndpointCellKey(x, y) {
  return `${Math.floor(x / MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS)}:${Math.floor(
    y / MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
  )}`;
}

function guidancePolylinesConnectAtEndpoints(left, right) {
  if (left.projected.length < 2 || right.projected.length < 2) return false;
  return [orientPreparedPolyline(left, false), orientPreparedPolyline(left, true)].some(
    (orientedLeft) =>
      [orientPreparedPolyline(right, false), orientPreparedPolyline(right, true)].some(
        (orientedRight) =>
          distance(orientedLeft.projected.at(-1), orientedRight.projected[0]) <=
            MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS &&
          directedTurnDegrees(
            orientedLeft.projected.at(-2),
            orientedLeft.projected.at(-1),
            orientedRight.projected[0],
            orientedRight.projected[1]
          ) <= MAXIMUM_STRAIGHT_FALLBACK_TURN_DEGREES
      )
  );
}

function completionConnectsAcrossStopbar(
  candidate,
  start,
  end,
  higherPriorityGeometry,
  naturalBoundaries
) {
  for (const boundary of [start, end]) {
    const stopbarAtBoundary = naturalBoundaries.some(
      (station) =>
        station.kind === 'stopbar' &&
        Math.abs(station.along - boundary) <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
    );
    if (!stopbarAtBoundary) continue;

    const boundaryPoint = projectedPointAtDistance(candidate.projected, boundary);
    const higherConnectsAtBoundary = higherPriorityGeometry.some(
      (higher) =>
        distance(boundaryPoint, higher.projected[0]) <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS ||
        distance(boundaryPoint, higher.projected.at(-1)) <= MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
    );
    if (higherConnectsAtBoundary) return true;
  }
  return false;
}

function completionOwnershipRanges(candidate, start, end, evidenceEdge, allocatedEdges) {
  const ranges = [{ start, end, ownerEdge: evidenceEdge }];
  const endpointSide = start <= 0.1 ? 'start' : candidate.length - end <= 0.1 ? 'end' : undefined;
  if (!endpointSide || end - start < 4) return ranges;

  const overlappingOwner = overlappingAllocatedOwner(
    candidate,
    start,
    end,
    evidenceEdge,
    allocatedEdges
  );
  if (overlappingOwner) {
    return [
      {
        start,
        end,
        ownerEdge: overlappingOwner,
        ownershipBasis: 'overlapping-higher-priority-owner',
      },
    ];
  }

  const alternativeOwner = connectedOwnerAtCandidateEndpoint(
    candidate,
    endpointSide,
    evidenceEdge,
    allocatedEdges
  );
  if (!alternativeOwner) return ranges;

  const midpoint = (start + end) / 2;
  return endpointSide === 'start'
    ? [
        { start, end: midpoint, ownerEdge: alternativeOwner },
        { start: midpoint, end, ownerEdge: evidenceEdge },
      ]
    : [
        { start, end: midpoint, ownerEdge: evidenceEdge },
        { start: midpoint, end, ownerEdge: alternativeOwner },
      ];
}

function overlappingAllocatedOwner(candidate, start, end, evidenceEdge, allocatedEdges) {
  const options = [];
  for (const edge of allocatedEdges) {
    if (
      stableIdentifier(edge.division) === stableIdentifier(evidenceEdge.division) ||
      evidencePriority(edge.candidate.raw) > evidencePriority(candidate.raw) ||
      !GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(edge.candidate.raw.classification) ||
      (candidate.raw.sourceFile &&
        edge.candidate.raw.sourceFile &&
        candidate.raw.sourceFile !== edge.candidate.raw.sourceFile)
    ) {
      continue;
    }
    const interval = embeddedHigherPriorityCoverageInterval(candidate, edge.section.prepared);
    if (!interval) continue;
    const overlapStart = Math.max(start, interval.start);
    const overlapEnd = Math.min(end, interval.end);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const rangeLength = end - start;
    if (
      overlap < rangeLength * 0.8 ||
      interval.start > start + MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS ||
      interval.end < end - MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
    ) {
      continue;
    }
    options.push({ edge, overlap });
  }
  return options.sort(
    (left, right) =>
      right.overlap - left.overlap ||
      right.edge.metrics.score - left.edge.metrics.score ||
      stableIdentifier(left.edge.division).localeCompare(stableIdentifier(right.edge.division))
  )[0]?.edge;
}

function connectedOwnerAtCandidateEndpoint(candidate, side, evidenceEdge, allocatedEdges) {
  const candidatePoint = side === 'start' ? candidate.projected[0] : candidate.projected.at(-1);
  const candidateNext = side === 'start' ? candidate.projected[1] : candidate.projected.at(-2);
  const options = [];
  for (const edge of allocatedEdges) {
    if (
      stableIdentifier(edge.division) === stableIdentifier(evidenceEdge.division) ||
      evidencePriority(edge.candidate.raw) > evidencePriority(candidate.raw) ||
      !GUIDANCE_DIVISION_TYPES.has(edge.division.raw.type) ||
      !GUIDANCE_SOURCE_CLASSIFICATIONS.has(edge.candidate.raw.classification) ||
      (candidate.raw.sourceFile &&
        edge.candidate.raw.sourceFile &&
        candidate.raw.sourceFile !== edge.candidate.raw.sourceFile)
    ) {
      continue;
    }
    for (const endpoint of allocatedEdgeEndpoints(edge)) {
      const gap = distance(candidatePoint, endpoint.point);
      if (gap > MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS) continue;
      const turn =
        side === 'start'
          ? directedTurnDegrees(endpoint.inward, endpoint.point, candidatePoint, candidateNext)
          : directedTurnDegrees(candidateNext, candidatePoint, endpoint.point, endpoint.inward);
      if (turn > MAXIMUM_STOPBAR_EXTENSION_TURN_DEGREES) continue;
      options.push({ edge, gap, turn });
    }
  }
  return options.sort(
    (left, right) =>
      left.gap - right.gap ||
      left.turn - right.turn ||
      right.edge.metrics.score - left.edge.metrics.score
  )[0]?.edge;
}

function guidanceConnectionTouchesStopbar(point, divisions) {
  return divisions.some(
    (division) =>
      division.raw.type === 'stopbar' &&
      projectPointToPolyline(point, division.projected).distance <=
        MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
  );
}

function allocatedEdgeEndpoints(edge) {
  const endpoints = [];
  if (edge.section.start <= 0.1 && edge.candidate.projected.length >= 2) {
    endpoints.push({
      side: 'start',
      point: edge.candidate.projected[0],
      inward: edge.candidate.projected[1],
    });
  }
  if (edge.candidate.length - edge.section.end <= 0.1 && edge.candidate.projected.length >= 2) {
    endpoints.push({
      side: 'end',
      point: edge.candidate.projected.at(-1),
      inward: edge.candidate.projected.at(-2),
    });
  }
  return endpoints;
}

function candidatesShareSourceRows(left, right) {
  const leftIds = new Set(
    (left.members ?? [left]).flatMap((member) => [
      String(member.raw.id),
      ...(member.raw.sourceRowIds ?? []).map(String),
    ])
  );
  return (right.members ?? [right]).some(
    (member) =>
      leftIds.has(String(member.raw.id)) ||
      (member.raw.sourceRowIds ?? []).some((id) => leftIds.has(String(id)))
  );
}

function nearestStopbarBoundaryCompletion(connector, connectorSide, divisions) {
  const connectionAlong = connectorSide === 'start' ? 0 : connector.length;
  const options = [];
  for (const stopbar of divisions) {
    if (stopbar.raw.type !== 'stopbar') continue;
    for (const targetAlong of polylineCrossingStations(connector, stopbar)) {
      const extensionLength = Math.abs(targetAlong - connectionAlong);
      if (extensionLength <= 0.2 || extensionLength > MAXIMUM_STOPBAR_BOUNDARY_EXTENSION_METERS) {
        continue;
      }
      options.push({ targetAlong, extensionLength, stopbar });
    }
  }
  return options.sort(
    (left, right) =>
      left.extensionLength - right.extensionLength ||
      stableIdentifier(left.stopbar).localeCompare(stableIdentifier(right.stopbar))
  )[0];
}

function sectionMeetsAllocationMinimum(edge, sectionLength) {
  if (edge.metrics.alignmentMode === 'source-junction-ownership') {
    return sectionLength >= 2;
  }
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
    metrics.sourceToDivisionMeanDistance <= MAXIMUM_TIGHT_COMPOSITE_MEAN_DISTANCE_METERS &&
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

function partitionBoundary(left, right, candidate, naturalBoundaries = [], runways = []) {
  const gapStart = left.section.projectionEnd;
  const gapEnd = right.section.projectionStart;
  const runwayTransition = runwayAwarePartitionBoundary(
    left,
    right,
    candidate,
    runways,
    naturalBoundaries
  );
  if (runwayTransition) {
    return {
      boundary: snapBoundaryToNaturalFeature(
        snapBoundaryToLogicalTurn(candidate, runwayTransition.along),
        naturalBoundaries
      ),
      basis: 'runway-corridor-transition',
      runwayId: runwayTransition.runwayId,
    };
  }
  const sharedBoundary = sharedDivisionBoundary(left, right, candidate, (gapStart + gapEnd) / 2);
  // The facing projection endpoints describe the actual hand-off, including when
  // simplified BARS shapes overlap slightly. Using full section centres in that
  // case gives the shorter object ownership of most of the simulator row.
  const boundary = Math.max(
    0,
    Math.min(sharedBoundary ?? (gapStart + gapEnd) / 2, candidate.length)
  );
  return {
    boundary: snapBoundaryToNaturalFeature(
      snapBoundaryToLogicalTurn(candidate, boundary),
      naturalBoundaries
    ),
    basis: sharedBoundary === undefined ? 'projection-midpoint' : 'shared-division-geometry',
  };
}

function runwayAwarePartitionBoundary(left, right, candidate, runways, naturalBoundaries) {
  if (
    !isExactPlacementRow(candidate.raw) ||
    left.division.raw.type !== 'lead_on' ||
    right.division.raw.type !== 'lead_on' ||
    runways.length === 0
  ) {
    return undefined;
  }
  const lowerCenter = Math.min(left.section.projectionCenter, right.section.projectionCenter);
  const upperCenter = Math.max(left.section.projectionCenter, right.section.projectionCenter);
  const candidates = [];
  for (const runway of runways) {
    const transitions = runwayCorridorTransitions(candidate, runway);
    if (transitions.length < 2) continue;
    for (const along of transitions) {
      if (along < lowerCenter || along > upperCenter) continue;
      if (
        !naturalBoundaries.some(
          (boundary) => Math.abs(boundary.along - along) <= MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS
        )
      ) {
        continue;
      }
      const sectionDistance = Math.min(
        Math.abs(along - left.section.projectionCenter),
        Math.abs(along - right.section.projectionCenter)
      );
      if (sectionDistance > MAXIMUM_RUNWAY_PARTITION_SECTION_DISTANCE_METERS) continue;
      candidates.push({
        along,
        runwayId: runway.raw.id,
        sectionDistance,
      });
    }
  }
  return candidates.sort(
    (leftCandidate, rightCandidate) =>
      leftCandidate.sectionDistance - rightCandidate.sectionDistance ||
      leftCandidate.along - rightCandidate.along
  )[0];
}

function runwayCorridorTransitions(candidate, runway) {
  const cumulativeDistances = cumulativePolylineDistances(candidate.projected);
  const distances = candidate.projected.map(
    (point) => projectPointToPolyline(point, runway.projected).distance
  );
  const transitions = [];
  for (let index = 1; index < distances.length; index += 1) {
    const previousInside = distances[index - 1] <= runway.corridorHalfWidth;
    const inside = distances[index] <= runway.corridorHalfWidth;
    if (previousInside === inside) continue;
    const distanceChange = distances[index] - distances[index - 1];
    const ratio =
      Math.abs(distanceChange) <= 0.000001
        ? 0.5
        : clamp01((runway.corridorHalfWidth - distances[index - 1]) / distanceChange);
    transitions.push(
      cumulativeDistances[index - 1] +
        (cumulativeDistances[index] - cumulativeDistances[index - 1]) * ratio
    );
  }
  return transitions;
}

function naturalBoundaryStations(candidate, allCandidates, allDivisions = []) {
  if (!GUIDANCE_SOURCE_CLASSIFICATIONS.has(candidate.raw.classification)) {
    return [];
  }
  const includeJunctions =
    isExactPlacementRow(candidate.raw) || candidate.raw.sourceType?.startsWith('xplane-');
  const junctionDistance = isExactPlacementRow(candidate.raw)
    ? NATURAL_BOUNDARY_PROXIMITY_METERS
    : MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS;
  const stations = [];
  for (const other of allCandidates) {
    if (stableIdentifier(other) === stableIdentifier(candidate)) continue;
    if (!isLocallyRegisterableSimulatorRow(other.raw)) continue;
    if (other.raw.classification === 'stopbar') {
      for (const along of polylineCrossingStations(candidate, other)) {
        stations.push({ along, kind: 'stopbar', source: 'simulator' });
      }
      continue;
    }
    if (!includeJunctions || !GUIDANCE_SOURCE_CLASSIFICATIONS.has(other.raw.classification)) {
      continue;
    }
    for (const endpoint of [other.projected[0], other.projected.at(-1)]) {
      const projection = projectPointToPolyline(endpoint, candidate.projected);
      if (
        projection.distance <= junctionDistance &&
        projection.along > MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS &&
        projection.along < candidate.length - MAXIMUM_GUIDANCE_CONNECTION_GAP_METERS
      ) {
        stations.push({ along: projection.along, kind: 'junction', source: 'simulator' });
      }
    }
  }
  for (const division of allDivisions) {
    if (division.raw.type !== 'stopbar') continue;
    for (const along of polylineCrossingStations(candidate, division)) {
      stations.push({ along, kind: 'stopbar', source: 'division', stopbar: division });
    }
  }
  const authoritativeStations = stations.filter(
    (station) =>
      station.kind !== 'stopbar' ||
      station.source !== 'simulator' ||
      !stations.some(
        (other) =>
          other.kind === 'stopbar' &&
          other.source === 'division' &&
          Math.abs(other.along - station.along) <= MAXIMUM_EQUIVALENT_STOPBAR_OFFSET_METERS
      )
  );
  const ordered = authoritativeStations.sort((left, right) => left.along - right.along);
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
        candidateDistances[candidateIndex - 1] + distance(candidateStart, candidateEnd) * ratio
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

function divisionsShareGuidanceTrunk(left, right) {
  if (!GUIDANCE_DIVISION_TYPES.has(left.raw.type) || !GUIDANCE_DIVISION_TYPES.has(right.raw.type)) {
    return false;
  }
  const endpointPairs = [
    [left.projected[0], left.projected[1], right.projected[0], right.projected[1]],
    [left.projected[0], left.projected[1], right.projected.at(-1), right.projected.at(-2)],
    [left.projected.at(-1), left.projected.at(-2), right.projected[0], right.projected[1]],
    [left.projected.at(-1), left.projected.at(-2), right.projected.at(-1), right.projected.at(-2)],
  ];
  return endpointPairs.some(([leftEnd, leftNext, rightEnd, rightNext]) => {
    if (!leftEnd || !leftNext || !rightEnd || !rightNext) return false;
    return (
      distance(leftEnd, rightEnd) <= MAXIMUM_SHARED_GUIDANCE_ENDPOINT_DISTANCE_METERS &&
      segmentOrientationDifference(leftEnd, leftNext, rightEnd, rightNext) <=
        MAXIMUM_SHARED_GUIDANCE_TRUNK_ANGLE_DEGREES
    );
  });
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
        (station) => Math.abs(station.along - boundary) <= MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS
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

function snapMatchedBoundaryToDivisionStopbar(allocatedBoundary, matchedBoundary, stations, side) {
  if (Math.abs(allocatedBoundary - matchedBoundary) > 0.05) return allocatedBoundary;
  return (
    stations
      .filter(
        (station) =>
          station.kind === 'stopbar' &&
          station.source === 'division' &&
          Math.abs(station.along - matchedBoundary) <= MAXIMUM_NATURAL_BOUNDARY_SNAP_METERS &&
          (side === 'start' ? station.along <= matchedBoundary : station.along >= matchedBoundary)
      )
      .sort(
        (left, right) =>
          Math.abs(left.along - matchedBoundary) - Math.abs(right.along - matchedBoundary)
      )[0]?.along ?? allocatedBoundary
  );
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
  const coincident = stopbars.find((station) => Math.abs(station.along - matchedCenter) <= 0.05);
  const preferRightOfCoincident =
    coincident && matchedSection.end - coincident.along >= coincident.along - matchedSection.start;
  return {
    lower: [...stopbars]
      .reverse()
      .find(
        (station) =>
          station.along < matchedCenter || (station === coincident && preferRightOfCoincident)
      ),
    upper: stopbars.find(
      (station) =>
        station.along > matchedCenter || (station === coincident && !preferRightOfCoincident)
    ),
  };
}

function clampAllocationToStopbarCell(start, end, matchedSection, stations) {
  const stopbars = stations
    .filter((station) => station.kind === 'stopbar' && station.along > start && station.along < end)
    .sort((left, right) => left.along - right.along);
  if (stopbars.length === 0) return { start, end };

  const matchedCenter = (matchedSection.start + matchedSection.end) / 2;
  const coincident = stopbars.find((station) => Math.abs(station.along - matchedCenter) <= 0.05);
  const preferRightOfCoincident =
    coincident && matchedSection.end - coincident.along >= coincident.along - matchedSection.start;
  const lower = [...stopbars]
    .reverse()
    .find(
      (station) =>
        station.along < matchedCenter || (station === coincident && preferRightOfCoincident)
    );
  const upper = stopbars.find(
    (station) =>
      station.along > matchedCenter || (station === coincident && !preferRightOfCoincident)
  );
  return {
    start: lower ? Math.max(start, lower.along) : start,
    end: upper ? Math.min(end, upper.along) : end,
  };
}

function projectedPointAtDistance(points, target) {
  if (target <= 0) return points[0];
  const distances = cumulativePolylineDistances(points);
  if (target >= distances.at(-1)) return points.at(-1);
  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  const start = points[index - 1];
  const end = points[index];
  const segmentLength = Math.max(distances[index] - distances[index - 1], 0.000001);
  const ratio = clamp01((target - distances[index - 1]) / segmentLength);
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
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
      (incoming.x * outgoing.x + incoming.y * outgoing.y) / (incomingLength * outgoingLength)
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
      Math.abs(leftProjection.along - targetAlong) - Math.abs(rightProjection.along - targetAlong)
  )[0]?.along;
}

function buildConnectedStopbarCandidates(candidates, referenceLatitude) {
  const stopbars = candidates.filter(
    (candidate) => candidate.raw.classification === 'stopbar' && candidate.coordinates.length >= 2
  );
  const composites = [];

  for (let leftIndex = 0; leftIndex < stopbars.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < stopbars.length; rightIndex += 1) {
      const left = stopbars[leftIndex];
      const right = stopbars[rightIndex];
      const leftSourceFile = left.raw.sourceFile;
      const rightSourceFile = right.raw.sourceFile;
      if (evidencePriority(left.raw) !== evidencePriority(right.raw)) continue;
      if (leftSourceFile && rightSourceFile && leftSourceFile !== rightSourceFile) {
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
        sourceFile: leftSourceFile ?? rightSourceFile,
        sourceType: 'connected-simulator-stopbar-rows',
        sourceGeometryDerived: 'endpoint-connected-source-rows',
        rawTag: 'Connected simulator stopbar rows',
        classification: 'stopbar',
        confidence: Math.min(Number(left.raw.confidence) || 1, Number(right.raw.confidence) || 1),
        evidencePriority: evidencePriority(left.raw),
        removalEligible: left.raw.removalEligible !== false && right.raw.removalEligible !== false,
        placementOnly: left.raw.removalEligible === false || right.raw.removalEligible === false,
        vertices: connection.coordinates.map((coordinate) => ({
          lat: coordinate.lat,
          lon: coordinate.lon,
        })),
        sourceRowIds,
        sourceRowCount: sourceRowIds.length,
        sourceCandidateIds: sourceCandidates.map((candidate) => String(candidate.raw.id)),
        sourceInstanceIds: [...new Set(sourceRows.flatMap((row) => row.sourceInstanceIds ?? []))],
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
  const coordinates = [...connection.left.coordinates, ...connection.right.coordinates];
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
    // oxlint-disable-next-line react-doctor/js-set-map-lookups -- Each preferred composite contains only its two source candidate IDs; constructing a Set would cost more.
    return !(preferred.candidate.raw.sourceCandidateIds ?? []).includes(
      String(edge.candidate.raw.id)
    );
  });
}

function sourceSectionsForMergedCandidate(edge, referenceLatitude) {
  if (edge.candidate.compositeMembers) {
    // oxlint-disable-next-line react-doctor/js-combine-iterations -- Flattening, section construction, and validity filtering are distinct geometry stages.
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
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Section construction and validity filtering remain separate for geometry auditability.
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
        section: simulatorSectionForRange(candidate, edge.division, start, end, referenceLatitude),
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
            evidencePriority(candidate.members[0].raw) === evidencePriority(item.raw) &&
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

    // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
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
    (forward.mean + reverse.mean) / 2 <= 0.3 && Math.max(forward.maximum, reverse.maximum) <= 0.6
  );
}

function collapseDuplicateLeadOns(items, source) {
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
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
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Coordinate validation and object projection are intentionally separate geometry stages.
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
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
