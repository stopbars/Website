import { dsfSelector, xplaneSelectorXml } from '../contribution-editor/xplane-removal-contract.js';
/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-flatmap-filter -- Draft geometry keeps validation and projection stages separate so release output remains auditable. */

import {
  generateRemovalGeometry,
  removalModeForRow,
  targetLightPointsForRow,
} from './extractor/extract.js';
import {
  haversineDistanceMeters,
  pointInPolygon,
  pointToPolylineDistanceMeters,
  polylineToPolylineDistanceMeters,
} from './extractor/geo.js';
import { assignAdjacentColors } from '../../utils/adjacent-colors.js';
import { suppressCoveredReplacements } from './replacement-overlap.js';

const DEFAULT_SIZES = {
  library: 3,
  vfx: 3,
  simprop: 8,
  lightrow: 2,
};
const TARGET_CLASSIFICATIONS = new Set(['stopbar', 'lead-on', 'taxi-centerline']);
const GUIDANCE_CLASSIFICATIONS = new Set(['lead-on', 'taxi-centerline']);
const SECTION_PROTECTION_BOUNDARY_GAP_METERS = 1.25;
const ISOLATED_CROSSING_DISTANCE_METERS = 1.3;
const MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS = 6;
const CROSSING_SAMPLE_INTERVAL_METERS = 0.5;
const MAXIMUM_SAFETY_PASSES = 12;
const REMOVAL_COVERAGE_BOUNDARY_TOLERANCE_METERS = 0.1;
const MAXIMUM_REMOVAL_STOPBAR_BOUNDARY_ROW_DISTANCE_METERS = 1;
const COMPILED_TARGET_SECTION_TOLERANCE_METERS = 0.2;
const MERGED_COMPILED_TARGET_SECTION_TOLERANCE_METERS = 0.8;
const MAXIMUM_COMPILED_TARGET_ENDPOINT_TOLERANCE_METERS = 2;
const COMPILED_TARGET_ENDPOINT_MIDPOINT_MARGIN_METERS = 0.01;
const MAXIMUM_COMPILED_TARGET_END_CAP_METERS = 1;
const COMPILED_TARGET_END_CAP_SPACING_RATIO = 0.25;
const SELECTIVE_TARGET_KEEP_CLEARANCE_METERS = 0.25;
const COMPILED_TARGET_IDENTITY_TOLERANCE_METERS = 0.01;

export function buildDraftOutput(data, matching, options) {
  const isXPlane = data.meta?.simulator === 'xplane';
  const { replacements, suppressed: suppressedReplacements } = suppressCoveredReplacements(
    replacementMatches(matching.matches)
  );
  const replacementIds = new Set(replacements.map((match) => String(match.division.id)));
  const coveredDivisions = new Map(
    matching.matches
      .filter((match) => !replacementIds.has(String(match.division.id)))
      .map((match) => [String(match.division.id), match.division])
  );
  const unmatched = [
    ...matching.unmatched,
    ...[...coveredDivisions.values()].map((division) => ({
      division,
      reason:
        'The matched geometry is fully covered by other generated lines. Review this object manually.',
    })),
  ];
  const removalConstrainedMatches = constrainRemovalMatchesAtReplacementBoundaries(
    matching.matches,
    replacements,
    data.instances ?? []
  );
  const placementOnlyMatches = matching.matches.filter(
    (match) => match.row.removalEligible === false
  );
  const removalMatches = removalConstrainedMatches.filter(
    (match) => match.row.removalEligible !== false
  );
  const selective = isXPlane
    ? {
        approved: removalMatches.filter(
          (match) => buildXPlaneSelectors(data.lightRows ?? [], [match]).length > 0
        ),
        rejected: removalMatches
          .filter((match) => buildXPlaneSelectors(data.lightRows ?? [], [match]).length === 0)
          .map((match) => ({
            ...match,
            safetyReason:
              'No executable removal for this source selection. DSF strings require a complete source string.',
          })),
        geometry: emptyRemovalGeometry(),
      }
    : buildSafeSelectiveRemovals(data, removalMatches, options.onProgress);
  const removals = [
    ...selective.geometry.removalPolygons,
    ...selective.geometry.exclusionCandidates,
  ];
  const guidanceStopbarCrossingAudit = auditGeneratedGuidanceStopbarCrossings(replacements);
  const xml = generateDraftXml({
    icao: options.icao,
    altitude: options.altitude,
    matches: replacements,
    removalPolygons: removals,
    simulator: data.meta?.simulator,
    xplaneSelectors: isXPlane ? buildXPlaneSelectors(data.lightRows ?? [], removalMatches) : [],
  });
  const geojson = buildDraftGeoJson(replacements, unmatched, removals, [], selective.approved);
  const simulatorGeojson = buildSimulatorDebugGeoJson(
    data.lightRows ?? [],
    matching.mergedSimulatorRows ?? []
  );

  return {
    xml,
    geojson,
    simulatorGeojson,
    matched: matching.matches.filter((match) => replacementIds.has(String(match.division.id))),
    removalApproved: selective.approved,
    placementOnlyMatches,
    replacements,
    unmatched,
    suppressedReplacements,
    removalWarnings: [],
    removals,
    safetyRejections: selective.rejected.map((match) => ({
      divisionId: String(match.division.id),
      rowId: match.row.id,
      sourceParentRowId: match.row.sourceParentRowId,
      sourceRangeStartMeters: match.row.sourceRangeStartMeters,
      sourceRangeEndMeters: match.row.sourceRangeEndMeters,
      reason: match.safetyReason,
      conflictIds: match.safetyConflictIds ?? [],
      pass: match.safetyPass,
    })),
    duplicateDivisionLeadOns: matching.duplicateDivisionLeadOns,
    duplicateSimulatorLeadOns: matching.duplicateSimulatorLeadOns,
    guidanceStopbarBoundaryTrims: replacements
      .filter((match) => match.row.replacementStopbarBoundary)
      .map((match) => ({
        divisionId: String(match.division.id),
        divisionName: match.division.name,
        ...match.row.replacementStopbarBoundary,
      })),
    guidanceStopbarCrossingAudit,
    removalStopbarBoundaryTrims: removalConstrainedMatches
      .filter((match) => match.row.removalStopbarBoundary)
      .map((match) => ({
        divisionId: String(match.division.id),
        divisionName: match.division.name,
        rowId: match.row.id,
        ...match.row.removalStopbarBoundary,
      })),
    removalPerformance: selective.performance,
  };
}

function constrainRemovalMatchesAtReplacementBoundaries(matches, replacements, instances) {
  const replacementsByDivisionId = new Map(
    replacements.map((replacement) => [String(replacement.division.id), replacement])
  );
  const stopbarsByDivisionId = new Map(
    replacements
      .filter((replacement) => replacement.division.type === 'stopbar')
      .map((replacement) => [String(replacement.division.id), replacement])
  );
  const instancesById = new Map(instances.map((instance) => [String(instance.id), instance]));

  return matches.map((match) => {
    const replacement = replacementsByDivisionId.get(String(match.division.id));
    const boundary = replacement?.row.replacementStopbarBoundary;
    const stopbar = stopbarsByDivisionId.get(String(boundary?.stopbarDivisionId ?? ''));
    const vertices = match.row.vertices ?? [];
    if (!boundary || !stopbar || vertices.length < 2 || replacement.row.vertices.length < 2) {
      return match;
    }

    const boundaryVertex = replacement.row.vertices[0];
    const retainedEnd = replacement.row.vertices.at(-1);
    if (
      pointToPolylineDistanceMeters(boundaryVertex, vertices) >
      MAXIMUM_REMOVAL_STOPBAR_BOUNDARY_ROW_DISTANCE_METERS
    ) {
      return match;
    }
    const distances = cumulativeVertexDistances(vertices);
    const totalLength = distances.at(-1) ?? 0;
    const boundaryProgress = coordinateProgressAlongDivision(boundaryVertex, vertices);
    const keepStart =
      haversineDistanceMeters(retainedEnd, vertices[0]) <=
      haversineDistanceMeters(retainedEnd, vertices.at(-1));
    const retainedVertices = keepStart
      ? sliceVerticesByDistance(vertices, distances, 0, boundaryProgress)
      : sliceVerticesByDistance(vertices, distances, boundaryProgress, totalLength);
    if (keepStart) retainedVertices[retainedVertices.length - 1] = boundaryVertex;
    else retainedVertices[0] = boundaryVertex;
    if (retainedVertices.length < 2 || rowLengthMeters({ vertices: retainedVertices }) < 0.05) {
      return match;
    }

    const originalSourceInstanceIds = match.row.sourceInstanceIds ?? [];
    const retainedSourceInstanceIds = originalSourceInstanceIds.filter((id) => {
      const instance = instancesById.get(String(id));
      return (
        instance &&
        Number.isFinite(instance.lat) &&
        Number.isFinite(instance.lon) &&
        pointToPolylineDistanceMeters(instance, retainedVertices) <= 0.75
      );
    });
    const sourceRangeStart = Number(match.row.sourceRangeStartMeters);
    const sourceRangeEnd = Number(match.row.sourceRangeEndMeters);
    const hasSourceRange = Number.isFinite(sourceRangeStart) && Number.isFinite(sourceRangeEnd);
    const retainedRange = hasSourceRange
      ? keepStart
        ? {
            sourceRangeStartMeters: sourceRangeStart,
            sourceRangeEndMeters: Math.min(sourceRangeEnd, sourceRangeStart + boundaryProgress),
          }
        : {
            sourceRangeStartMeters: Math.max(sourceRangeStart, sourceRangeStart + boundaryProgress),
            sourceRangeEndMeters: sourceRangeEnd,
          }
      : {};

    return {
      ...match,
      row: {
        ...match.row,
        vertices: retainedVertices,
        ...(originalSourceInstanceIds.length > 0
          ? { sourceInstanceIds: retainedSourceInstanceIds }
          : {}),
        ...retainedRange,
        removalGeometryDerived: 'matched-stopbar-boundary-trim',
        removalStopbarBoundary: {
          stopbarDivisionId: String(stopbar.division.id),
          stopbarName: stopbar.division.name,
          boundaryBasis: boundary.boundaryBasis,
          keptSide: keepStart ? 'source-row-start' : 'source-row-end',
          originalVertexCount: vertices.length,
          finalVertexCount: retainedVertices.length,
          originalSourceInstanceCount: originalSourceInstanceIds.length,
          finalSourceInstanceCount: retainedSourceInstanceIds.length,
          ...(hasSourceRange
            ? {
                originalSourceRangeStartMeters: sourceRangeStart,
                originalSourceRangeEndMeters: sourceRangeEnd,
                finalSourceRangeStartMeters: retainedRange.sourceRangeStartMeters,
                finalSourceRangeEndMeters: retainedRange.sourceRangeEndMeters,
              }
            : {}),
        },
      },
    };
  });
}

function auditGeneratedGuidanceStopbarCrossings(replacements) {
  const leadOns = replacements.filter(
    (match) => match.division.type === 'lead_on' && (match.row.vertices?.length ?? 0) >= 2
  );
  const stopbars = replacements.filter(
    (match) => match.division.type === 'stopbar' && (match.row.vertices?.length ?? 0) >= 2
  );
  const interiorCrossings = [];
  for (const leadOn of leadOns) {
    for (const stopbar of stopbars) {
      for (const crossing of guidanceStopbarCrossings(leadOn.row.vertices, stopbar.row.vertices)) {
        if (crossing.intersectionRatio <= 0.000001 || crossing.intersectionRatio >= 0.999999) {
          continue;
        }
        interiorCrossings.push({
          leadOnDivisionId: String(leadOn.division.id),
          leadOnName: leadOn.division.name,
          stopbarDivisionId: String(stopbar.division.id),
          stopbarName: stopbar.division.name,
          sameName: String(leadOn.division.name) === String(stopbar.division.name),
          leadSegmentIndex: crossing.leadSegmentIndex,
          crossingFraction: Number(crossing.intersectionRatio.toFixed(6)),
        });
      }
    }
  }
  return {
    leadOnReplacementCount: leadOns.length,
    stopbarReplacementCount: stopbars.length,
    remainingInteriorCrossingCount: interiorCrossings.length,
    interiorCrossings,
  };
}

function buildXPlaneSelectors(sourceRows, matches) {
  const sourceById = new Map(sourceRows.map((row) => [String(row.id), row]));
  const grouped = new Map();
  for (const match of matches) {
    const matchedRow = match.row;
    const rows =
      matchedRow.sourceRowIds?.length > 0
        ? matchedRow.sourceRowIds.map((id) => sourceById.get(String(id))).filter(Boolean)
        : [matchedRow];
    for (const sourceRow of rows) {
      const row =
        Number.isFinite(matchedRow.sourceRangeStartMeters) &&
        Number.isFinite(matchedRow.sourceRangeEndMeters)
          ? {
              ...sourceRow,
              sourceRangeStartMeters: matchedRow.sourceRangeStartMeters,
              sourceRangeEndMeters: matchedRow.sourceRangeEndMeters,
              sourceParentLengthMeters:
                matchedRow.sourceParentLengthMeters || rowLengthMeters(sourceRow),
            }
          : sourceRow;
      const dsf = dsfSelector(row.dsfRemoval);
      if (dsf) {
        const total = Number(row.sourceParentLengthMeters) || rowLengthMeters(sourceRow);
        const start = Number(row.sourceRangeStartMeters) || 0;
        const end = Number(row.sourceRangeEndMeters) || total;
        if (start <= 0.001 && end >= total - 0.001)
          grouped.set(JSON.stringify(dsf), { ...dsf, ranges: [[0, 1]] });
        continue;
      }
      if (
        row.sourceType !== 'xplane-apt-light-string' ||
        !/^[a-f0-9]{16}$/i.test(row.sourceFeatureId ?? '') ||
        !Number.isInteger(row.lightCode)
      ) {
        continue;
      }

      const total = Number(row.sourceParentLengthMeters) || rowLengthMeters(row);
      if (!(total > 0)) continue;
      const start = Math.max(0, Math.min(total, Number(row.sourceRangeStartMeters) || 0));
      const end = Math.max(start, Math.min(total, Number(row.sourceRangeEndMeters) || total));
      const key = `${row.sourceFeatureId}:${row.lightCode}:${row.sourceRunIndex ?? 0}`;
      const entry = grouped.get(key) ?? {
        feature: row.sourceFeatureId,
        code: row.lightCode,
        run: Number(row.sourceRunIndex) || 0,
        ranges: [],
      };
      entry.ranges.push([start / total, end / total]);
      grouped.set(key, entry);
    }
  }

  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      ranges: mergeNormalizedRanges(entry.ranges),
    }))
    .sort(
      (left, right) =>
        String(left.feature ?? left.source).localeCompare(String(right.feature ?? right.source)) ||
        left.code - right.code ||
        left.run - right.run
    );
}

function mergeNormalizedRanges(ranges) {
  const ordered = ranges
    .map(([start, end]) => [Math.max(0, Math.min(1, start)), Math.max(0, Math.min(1, end))])
    .filter(([start, end]) => end - start > 0.000001)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1] + 0.000001) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }
  return merged;
}

function replacementMatches(matches) {
  const replacements = [];
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
  const ordered = [...matches].sort(
    (left, right) =>
      String(left.division.id).localeCompare(String(right.division.id)) ||
      rowLengthMeters(right.row) - rowLengthMeters(left.row) ||
      right.score - left.score
  );

  const grouped = new Map();
  for (const match of ordered) {
    const key = `${String(match.division.id)}|${String(
      match.simulatorGroupId ?? match.row.sourceParentRowId ?? match.row.id
    )}`;
    const group = grouped.get(key) ?? [];
    group.push(match);
    grouped.set(key, group);
  }

  for (const group of grouped.values()) {
    const match = group[0];
    const replacementRow = match.replacementRow ?? match.row;
    const replacement = {
      ...match,
      row: extendReplacementToSourceEndpoints(replacementRow, group, match.division),
    };
    replacements.push(replacement);
  }
  return trimLeadOnReplacementsAtMatchedStopbars(
    joinLogicalGuidanceReplacementGaps(replacements),
    matches
  );
}

function trimLeadOnReplacementsAtMatchedStopbars(replacements, sourceMatches) {
  const stopbars = replacements.filter(
    (match) => match.division.type === 'stopbar' && (match.row.vertices?.length ?? 0) >= 2
  );
  return replacements.map((match) => {
    if (match.division.type !== 'lead_on' || (match.row.vertices?.length ?? 0) < 2) return match;

    const namedStopbars = stopbars.filter(
      (stopbar) => String(stopbar.division.name) === String(match.division.name)
    );
    const crossings = namedStopbars
      .flatMap((stopbar) =>
        guidanceStopbarCrossings(match.row.vertices, stopbar.row.vertices).map((crossing) => ({
          ...crossing,
          stopbar,
        }))
      )
      .sort((left, right) => left.leadProgress - right.leadProgress);
    const crossing = crossings[0];
    if (!crossing) return match;

    const retainBeforeStopbar = leadOnBeforeStopbarFollowsDivision(
      match.row.vertices,
      crossing,
      match.division.coordinates
    );
    const retained = retainBeforeStopbar
      ? match.row.vertices.slice(0, crossing.leadSegmentIndex + 1)
      : match.row.vertices.slice(crossing.leadSegmentIndex + 1);
    if (retained.length === 0) return match;
    const exactSourceVertices = sourceMatches
      .filter((source) => String(source.division.id) === String(match.division.id))
      .flatMap((source) => source.row.vertices ?? []);
    const exactBoundaryVertex = nearestSourceVertexBeyondStopbar(
      exactSourceVertices,
      crossing.stopbarVertices,
      retainBeforeStopbar ? retained[0] : retained.at(-1)
    );
    const useExactBoundary =
      exactBoundaryVertex &&
      retained.every((vertex) => haversineDistanceMeters(vertex, exactBoundaryVertex) > 0.05);
    const boundaryVertex = useExactBoundary ? exactBoundaryVertex : crossing.intersection;
    const retainedAwayFromBoundary = retained.filter(
      (vertex) => haversineDistanceMeters(vertex, boundaryVertex) > 0.05
    );
    const vertices = retainBeforeStopbar
      ? [...retainedAwayFromBoundary, boundaryVertex]
      : [boundaryVertex, ...retainedAwayFromBoundary];
    if (vertices.length < 2) return match;

    return {
      ...match,
      row: {
        ...match.row,
        vertices,
        replacementGeometryDerived: 'matched-stopbar-boundary-trim',
        replacementSourceVertexCount: match.row.vertices.length,
        replacementStopbarBoundary: {
          stopbarDivisionId: String(crossing.stopbar.division.id),
          stopbarName: crossing.stopbar.division.name,
          crossingLeadSegmentIndex: crossing.leadSegmentIndex,
          crossingFraction: Number(crossing.intersectionRatio.toFixed(6)),
          boundaryBasis: useExactBoundary
            ? 'nearest-exact-source-light-beyond-stopbar'
            : 'exact-source-geometry-intersection',
          originalVertexCount: match.row.vertices.length,
          finalVertexCount: vertices.length,
        },
      },
    };
  });
}

function leadOnBeforeStopbarFollowsDivision(guidanceVertices, crossing, divisionCoordinates = []) {
  if (divisionCoordinates.length < 2) return false;
  const before = [
    ...guidanceVertices.slice(0, crossing.leadSegmentIndex + 1),
    crossing.intersection,
  ];
  const after = [crossing.intersection, ...guidanceVertices.slice(crossing.leadSegmentIndex + 1)];
  const meanDivisionDistance = (vertices) =>
    divisionCoordinates.reduce(
      (sum, coordinate) =>
        sum +
        pointToPolylineDistanceMeters(
          {
            lat: Number(coordinate.lat),
            lon: Number(coordinate.lon ?? coordinate.lng),
          },
          vertices
        ),
      0
    ) / divisionCoordinates.length;
  return meanDivisionDistance(before) < meanDivisionDistance(after);
}

function guidanceStopbarCrossings(guidanceVertices, stopbarVertices) {
  const crossings = [];
  for (let leadIndex = 1; leadIndex < guidanceVertices.length; leadIndex += 1) {
    for (let stopbarIndex = 1; stopbarIndex < stopbarVertices.length; stopbarIndex += 1) {
      const intersection = segmentIntersectionRatios(
        guidanceVertices[leadIndex - 1],
        guidanceVertices[leadIndex],
        stopbarVertices[stopbarIndex - 1],
        stopbarVertices[stopbarIndex]
      );
      if (!intersection) continue;
      crossings.push({
        leadSegmentIndex: leadIndex - 1,
        leadProgress: leadIndex - 1 + intersection.left,
        intersectionRatio: intersection.left,
        intersection: interpolateCoordinate(
          guidanceVertices[leadIndex - 1],
          guidanceVertices[leadIndex],
          intersection.left
        ),
        stopbarVertices,
      });
    }
  }
  return crossings;
}

function interpolateCoordinate(start, end, ratio) {
  return {
    lat: Number(start.lat) + (Number(end.lat) - Number(start.lat)) * ratio,
    lon:
      Number(start.lon ?? start.lng) +
      (Number(end.lon ?? end.lng) - Number(start.lon ?? start.lng)) * ratio,
  };
}

function segmentIntersectionRatios(leftStart, leftEnd, rightStart, rightEnd) {
  const referenceLatitude =
    (Number(leftStart.lat) + Number(leftEnd.lat) + Number(rightStart.lat) + Number(rightEnd.lat)) /
    4;
  const longitudeScale = Math.cos((referenceLatitude * Math.PI) / 180);
  const point = (coordinate) => ({
    x: Number(coordinate.lon ?? coordinate.lng) * longitudeScale,
    y: Number(coordinate.lat),
  });
  const a = point(leftStart);
  const b = point(leftEnd);
  const c = point(rightStart);
  const d = point(rightEnd);
  const left = { x: b.x - a.x, y: b.y - a.y };
  const right = { x: d.x - c.x, y: d.y - c.y };
  const denominator = left.x * right.y - left.y * right.x;
  if (Math.abs(denominator) <= 1e-12) return null;
  const offset = { x: c.x - a.x, y: c.y - a.y };
  const leftRatio = (offset.x * right.y - offset.y * right.x) / denominator;
  const rightRatio = (offset.x * left.y - offset.y * left.x) / denominator;
  const epsilon = 1e-6;
  return leftRatio >= -epsilon &&
    leftRatio <= 1 + epsilon &&
    rightRatio >= -epsilon &&
    rightRatio <= 1 + epsilon
    ? { left: leftRatio, right: rightRatio }
    : null;
}

function nearestSourceVertexBeyondStopbar(sourceVertices, stopbarVertices, retainedEnd) {
  if (sourceVertices.length === 0) return null;
  const endSide = polylineSide(retainedEnd, stopbarVertices);
  if (Math.abs(endSide) <= 1e-12) return null;
  return sourceVertices
    .filter((vertex) => polylineSide(vertex, stopbarVertices) * endSide > 0)
    .map((vertex) => ({
      vertex,
      distance: pointToPolylineDistanceMeters(vertex, stopbarVertices),
    }))
    .sort((left, right) => left.distance - right.distance)[0]?.vertex;
}

function polylineSide(point, vertices) {
  const nearest = vertices
    .slice(1)
    .map((end, index) => {
      const start = vertices[index];
      return {
        start,
        end,
        distance: pointToPolylineDistanceMeters(point, [start, end]),
      };
    })
    .sort((left, right) => left.distance - right.distance)[0];
  if (!nearest) return 0;
  const longitudeScale = Math.cos((Number(point.lat) * Math.PI) / 180);
  const px = Number(point.lon ?? point.lng) * longitudeScale;
  const py = Number(point.lat);
  const ax = Number(nearest.start.lon ?? nearest.start.lng) * longitudeScale;
  const ay = Number(nearest.start.lat);
  const bx = Number(nearest.end.lon ?? nearest.end.lng) * longitudeScale;
  const by = Number(nearest.end.lat);
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

function extendReplacementToSourceEndpoints(replacementRow, matches, division) {
  const divisionCoordinates = division?.coordinates ?? [];
  if (divisionCoordinates.length < 2 || (replacementRow.vertices?.length ?? 0) < 2) {
    return replacementRow;
  }

  let vertices = orientVerticesAlongDivision(replacementRow.vertices, divisionCoordinates);
  for (const match of matches) {
    const sourceVertices = orientVerticesAlongDivision(
      match.row.vertices ?? [],
      divisionCoordinates
    );
    if (sourceVertices.length < 2) continue;

    const currentStart = coordinateProgressAlongDivision(vertices[0], divisionCoordinates);
    const currentEnd = coordinateProgressAlongDivision(vertices.at(-1), divisionCoordinates);
    const sourceStart = coordinateProgressAlongDivision(sourceVertices[0], divisionCoordinates);
    const sourceEnd = coordinateProgressAlongDivision(sourceVertices.at(-1), divisionCoordinates);
    if (sourceStart < currentStart - 0.1) {
      const prefix = sourceVertices.filter(
        (vertex) =>
          coordinateProgressAlongDivision(vertex, divisionCoordinates) < currentStart - 0.01
      );
      vertices = [...prefix, ...vertices];
    }
    if (sourceEnd > currentEnd + 0.1) {
      const suffix = sourceVertices.filter(
        (vertex) => coordinateProgressAlongDivision(vertex, divisionCoordinates) > currentEnd + 0.01
      );
      vertices = [...vertices, ...suffix];
    }
  }

  return {
    ...replacementRow,
    vertices,
    replacementGeometryDerived:
      vertices.length === replacementRow.vertices.length
        ? replacementRow.replacementGeometryDerived
        : 'co-located-source-row-endpoint-union',
  };
}

function orientVerticesAlongDivision(vertices, divisionCoordinates) {
  if (vertices.length < 2) return [...vertices];
  const start = coordinateProgressAlongDivision(vertices[0], divisionCoordinates);
  const end = coordinateProgressAlongDivision(vertices.at(-1), divisionCoordinates);
  return start <= end ? [...vertices] : [...vertices].reverse();
}

function coordinateProgressAlongDivision(coordinate, divisionCoordinates) {
  const referenceLatitude =
    divisionCoordinates.reduce((sum, point) => sum + Number(point.lat || 0), 0) /
    divisionCoordinates.length;
  const longitudeScale = 111_320 * Math.cos((referenceLatitude * Math.PI) / 180);
  const latitudeScale = 111_320;
  const projected = divisionCoordinates.map((point) => ({
    x: Number(point.lng ?? point.lon) * longitudeScale,
    y: Number(point.lat) * latitudeScale,
  }));
  const target = {
    x: Number(coordinate.lng ?? coordinate.lon) * longitudeScale,
    y: Number(coordinate.lat) * latitudeScale,
  };
  let travelled = 0;
  let best = { distance: Infinity, along: 0 };
  for (let index = 1; index < projected.length; index += 1) {
    const start = projected[index - 1];
    const end = projected[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) continue;
    const fraction = Math.max(
      0,
      Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / length ** 2)
    );
    const nearest = { x: start.x + dx * fraction, y: start.y + dy * fraction };
    const candidate = {
      distance: Math.hypot(target.x - nearest.x, target.y - nearest.y),
      along: travelled + length * fraction,
    };
    if (candidate.distance < best.distance) best = candidate;
    travelled += length;
  }
  return best.along;
}

function joinLogicalGuidanceReplacementGaps(replacements) {
  const completed = replacements.filter(
    (match) =>
      match.metrics?.sourceConnectionBasis !== 'logical-source-jump' &&
      match.metrics?.sourceConnectionBasis !== 'straight-source-continuation'
  );
  const logical = replacements.filter(
    (match) =>
      match.metrics?.sourceConnectionBasis === 'logical-source-jump' ||
      match.metrics?.sourceConnectionBasis === 'straight-source-continuation'
  );

  for (const match of logical) {
    const options = completed
      .map((existing, index) => ({
        index,
        existing,
        joined: joinRowsAtClosestEndpoints(existing.row, match.row),
      }))
      .filter(
        ({ existing, joined }) =>
          String(existing.division.id) === String(match.division.id) &&
          joined &&
          joined.gapMeters <= Number(match.metrics?.sourceConnectionGapMeters || 0) + 0.5
      )
      .sort((left, right) => left.joined.gapMeters - right.joined.gapMeters);
    const selected = options[0];
    if (!selected) {
      completed.push(match);
      continue;
    }
    completed[selected.index] = {
      ...selected.existing,
      row: {
        ...selected.existing.row,
        vertices: selected.joined.vertices,
        replacementGeometryDerived:
          match.metrics?.sourceConnectionBasis === 'straight-source-continuation'
            ? 'straight-source-continuation-union'
            : 'logical-source-jump-union',
        replacementLogicalGapMeters: match.metrics?.sourceConnectionGapMeters,
      },
    };
  }
  return completed;
}

function joinRowsAtClosestEndpoints(left, right) {
  if ((left.vertices?.length ?? 0) < 2 || (right.vertices?.length ?? 0) < 2) return null;
  const options = [false, true].flatMap((reverseLeft) =>
    [false, true].map((reverseRight) => {
      const leftVertices = reverseLeft ? [...left.vertices].reverse() : [...left.vertices];
      const rightVertices = reverseRight ? [...right.vertices].reverse() : [...right.vertices];
      return {
        gapMeters: haversineDistanceMeters(leftVertices.at(-1), rightVertices[0]),
        vertices: [...leftVertices, ...rightVertices],
      };
    })
  );
  return options.sort((leftOption, rightOption) => leftOption.gapMeters - rightOption.gapMeters)[0];
}

function rowLengthMeters(row) {
  let length = 0;
  for (let index = 1; index < (row.vertices?.length ?? 0); index += 1) {
    length += haversineDistanceMeters(row.vertices[index - 1], row.vertices[index]);
  }
  return length;
}

function buildSafeSelectiveRemovals(data, initialMatches, onProgress) {
  const startedAt = performance.now();
  // Cache source-corridor calculations only; each pass still checks its current protection zones.
  const mergeCache = new Map();
  let approved = [...initialMatches];
  const originalSelectedRows = approved.map((match) => match.row);
  const rejected = [];
  const passes = [];
  let geometry;

  if (approved.length === 0) {
    return {
      approved,
      rejected,
      geometry: emptyRemovalGeometry(),
      performance: { totalMilliseconds: performance.now() - startedAt, passes },
    };
  }

  for (let pass = 0; pass < MAXIMUM_SAFETY_PASSES; pass += 1) {
    if (approved.length === 0) break;
    onProgress?.({
      pass: pass + 1,
      maxPasses: MAXIMUM_SAFETY_PASSES,
      remaining: approved.length,
    });
    const generationStartedAt = performance.now();
    geometry = generateRemovalGeometryForMatches(data, approved, originalSelectedRows, mergeCache);
    const generationMilliseconds = performance.now() - generationStartedAt;

    const auditStartedAt = performance.now();
    const unselectedTargetConflicts = new Set(
      rowsCoveringSelectiveProtectionZones(
        geometry.selectiveProtectionZones,
        geometry.removalPolygons,
        approved.map((match) => match.row)
      )
    );
    const selectiveProtectionDetails = geometry.protectionConflicts.filter((conflict) =>
      conflict.mustKeepZoneIds?.some((id) => String(id).startsWith('selective-'))
    );
    const protectedLightDetails = geometry.protectionConflicts.filter(
      (conflict) =>
        !conflict.mustKeepZoneIds?.length ||
        conflict.mustKeepZoneIds.some((id) => !String(id).startsWith('selective-'))
    );
    const activeRows = approved.map((match) => match.row);
    const selectiveProtectionConflicts = conflictIdsBySourceRow(
      selectiveProtectionDetails,
      activeRows
    );
    const protectedLightConflicts = conflictIdsBySourceRow(protectedLightDetails, activeRows);
    const removalRings = geometry.removalPolygons.map((polygon) => {
      const ring = polygon.coordinates.map(([lon, lat]) => ({ lon, lat }));
      return { ring, bounds: geometryBounds(ring) };
    });
    // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Explicit transform and validation stages keep this bounded safety pass auditable.
    const unsafe = approved
      .map((match) => {
        const row = match.row;
        const isCovered = rowIsCoveredByRemovals(row, removalRings);
        const rowId = row.id;
        const hasUnselectedTargetConflict = unselectedTargetConflicts.has(rowId);
        const hasSelectiveProtectionConflict = selectiveProtectionConflicts.has(rowId);
        const hasProtectedLightConflict = protectedLightConflicts.has(rowId);
        if (
          isCovered &&
          !hasUnselectedTargetConflict &&
          !hasSelectiveProtectionConflict &&
          !hasProtectedLightConflict
        ) {
          return null;
        }
        return {
          ...match,
          safetyPass: pass + 1,
          safetyConflictIds: hasSelectiveProtectionConflict
            ? selectiveProtectionConflicts.get(rowId)
            : hasProtectedLightConflict
              ? protectedLightConflicts.get(rowId)
              : [],
          safetyReason: hasUnselectedTargetConflict
            ? 'unselected-target-conflict'
            : hasSelectiveProtectionConflict
              ? 'unselected-target-protection-conflict'
              : hasProtectedLightConflict
                ? 'must-keep-conflict'
                : 'incomplete-removal-coverage',
        };
      })
      .filter(Boolean);
    const auditMilliseconds = performance.now() - auditStartedAt;
    passes.push({
      pass: pass + 1,
      approvedMatches: approved.length,
      generationMilliseconds,
      auditMilliseconds,
      geometry: geometry.performance,
      rejectedMatches: unsafe.length,
    });
    if (unsafe.length === 0) {
      return {
        approved,
        rejected,
        geometry,
        performance: { totalMilliseconds: performance.now() - startedAt, passes },
      };
    }

    const unsafeRows = new Set(unsafe.map((match) => match.row.id));
    rejected.push(...unsafe);
    approved = approved.filter((match) => !unsafeRows.has(match.row.id));
  }

  if (approved.length === 0) {
    return {
      approved,
      rejected,
      geometry: emptyRemovalGeometry(),
      performance: { totalMilliseconds: performance.now() - startedAt, passes },
    };
  }
  throw new Error(
    'Selective removal safety did not converge. No draft was created; add the remaining objects manually.'
  );
}

function conflictIdsBySourceRow(conflicts, rows) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const bySourceRow = new Map();
  for (const conflict of conflicts) {
    let sourceRowIds = conflict.sourceRowIds?.length
      ? conflict.sourceRowIds
      : [conflict.sourceRowId];
    if (Number.isFinite(conflict.lat) && Number.isFinite(conflict.lon)) {
      const conflictPoint = { lat: conflict.lat, lon: conflict.lon };
      const hasKnownSourceRow = sourceRowIds.some((sourceRowId) => rowsById.has(sourceRowId));
      const localSourceRowIds = sourceRowIds.filter((sourceRowId) => {
        const row = rowsById.get(sourceRowId);
        return (
          row?.vertices?.length > 0 &&
          pointToPolylineDistanceMeters(conflictPoint, row.vertices) <=
            ISOLATED_CROSSING_DISTANCE_METERS
        );
      });
      if (hasKnownSourceRow) sourceRowIds = localSourceRowIds;
    }
    for (const sourceRowId of sourceRowIds) {
      if (!sourceRowId) continue;
      const ids = bySourceRow.get(sourceRowId) ?? new Set();
      for (const id of conflict.mustKeepZoneIds ?? []) ids.add(id);
      bySourceRow.set(sourceRowId, ids);
    }
  }
  return new Map(
    [...bySourceRow].map(([sourceRowId, ids]) => {
      // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
      return [sourceRowId, [...ids].sort()];
    })
  );
}

function rowIsCoveredByRemovals(row, removalRings) {
  const coveragePoints =
    removalModeForRow(row) === 'targets' ? targetLightPointsForRow(row) : (row.vertices ?? []);
  if (coveragePoints.length === 0) return removalModeForRow(row) === 'targets';
  return coveragePoints.every((point) =>
    removalRings.some(
      ({ ring, bounds }) =>
        pointNearGeometryBounds(point, bounds, REMOVAL_COVERAGE_BOUNDARY_TOLERANCE_METERS) &&
        (pointInPolygon(point, ring) ||
          pointToPolylineDistanceMeters(point, ring) <= REMOVAL_COVERAGE_BOUNDARY_TOLERANCE_METERS)
    )
  );
}

function rowsCoveringSelectiveProtectionZones(protectionZones, removalPolygons, rows) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const protectedPoints = (protectionZones ?? []).flatMap((zone) =>
    (zone.geometryType === 'Point' ? [zone.point] : (zone.vertices ?? [])).map((point) => ({
      point,
      zone,
    }))
  );
  const rowIds = new Set();
  for (const polygon of removalPolygons) {
    const ring = polygon.coordinates.map(([lon, lat]) => ({ lon, lat }));
    const bounds = geometryBounds(ring);
    const sourceRowIds = polygon.sourceRowIds?.length
      ? polygon.sourceRowIds
      : [polygon.sourceRowId];
    const knownSourceRows = sourceRowIds.map((rowId) => rowsById.get(rowId)).filter(Boolean);
    const stopbarOnly =
      knownSourceRows.length > 0 &&
      knownSourceRows.every((row) => sourceClassification(row) === 'stopbar');
    const protectedPointsInside = protectedPoints
      .filter(({ zone }) => !stopbarOnly || zone.classification === 'runway')
      .map(({ point }) => point)
      .filter((point) => pointWithinGeometryBounds(point, bounds) && pointInPolygon(point, ring));
    if (protectedPointsInside.length === 0) continue;
    const hasKnownSourceRow = knownSourceRows.length > 0;
    const localSourceRowIds = sourceRowIds.filter((rowId) => {
      const row = rowsById.get(rowId);
      return protectedPointsInside.some(
        (point) =>
          row?.vertices?.length > 0 &&
          pointToPolylineDistanceMeters(point, row.vertices) <= ISOLATED_CROSSING_DISTANCE_METERS
      );
    });
    for (const rowId of hasKnownSourceRow ? localSourceRowIds : sourceRowIds) {
      rowIds.add(rowId);
    }
  }
  return rowIds;
}

function geometryBounds(vertices) {
  const bounds = {
    minLat: Infinity,
    minLon: Infinity,
    maxLat: -Infinity,
    maxLon: -Infinity,
  };
  for (const vertex of vertices) {
    bounds.minLat = Math.min(bounds.minLat, Number(vertex.lat));
    bounds.minLon = Math.min(bounds.minLon, Number(vertex.lon ?? vertex.lng));
    bounds.maxLat = Math.max(bounds.maxLat, Number(vertex.lat));
    bounds.maxLon = Math.max(bounds.maxLon, Number(vertex.lon ?? vertex.lng));
  }
  return bounds;
}

function pointWithinGeometryBounds(point, bounds) {
  const lon = Number(point.lon ?? point.lng);
  return (
    Number(point.lat) >= bounds.minLat &&
    Number(point.lat) <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
}

function pointNearGeometryBounds(point, bounds, toleranceMeters) {
  const latitudePad = toleranceMeters / 110_000;
  const maximumAbsoluteLatitude = Math.min(
    89.9,
    Math.max(Math.abs(bounds.minLat), Math.abs(bounds.maxLat)) + latitudePad
  );
  const longitudePad =
    toleranceMeters /
    (110_000 * Math.max(0.001, Math.cos((maximumAbsoluteLatitude * Math.PI) / 180)));
  const lon = Number(point.lon ?? point.lng);
  return (
    Number(point.lat) >= bounds.minLat - latitudePad &&
    Number(point.lat) <= bounds.maxLat + latitudePad &&
    lon >= bounds.minLon - longitudePad &&
    lon <= bounds.maxLon + longitudePad
  );
}

export function generateRemovalGeometryForMatches(
  data,
  matches,
  originalSelectedRows = matches.map((match) => match.row),
  mergeCache
) {
  const preparationStartedAt = performance.now();
  const selectedRows = matches.map((match) => match.row);
  const rows = consolidateRemovalRows(data.lightRows ?? [], selectedRows);
  const sourceInstanceIds = new Set(selectedRows.flatMap((row) => row.sourceInstanceIds ?? []));
  const sourceInstances = (data.instances ?? []).filter((instance) =>
    sourceInstanceIds.has(instance.id)
  );
  const originallySelectedSourceInstanceIds = new Set(
    originalSelectedRows.flatMap((row) => row.sourceInstanceIds ?? [])
  );
  const selectionPreparedAt = performance.now();
  const recordSelectiveXPlaneRemoval = isRecordSelectiveXPlaneRemoval(data, selectedRows);
  const selectiveZones = recordSelectiveXPlaneRemoval
    ? []
    : selectiveTargetMustKeepZones(data, rows, originallySelectedSourceInstanceIds);
  const selectiveZonesBuiltAt = performance.now();
  const isolatedCrossingContext = buildIsolatedGuidanceCrossingContext(selectedRows);
  const selectiveProtectionZones = selectiveZones.filter(
    (zone) => !isIsolatedGuidanceCrossingZone(zone, isolatedCrossingContext)
  );
  const selectiveZonesFilteredAt = performance.now();
  const protectedSourceZones = (data.mustKeepZones ?? []).filter(
    (zone) => !(recordSelectiveXPlaneRemoval && zone.sourceType === 'xplane-runway-light-zone')
  );
  const sourceZonesFilteredAt = performance.now();
  const mustKeepZones = [...protectedSourceZones, ...selectiveProtectionZones];
  const geometry = generateRemovalGeometry(
    sourceInstances,
    rows,
    DEFAULT_SIZES,
    mustKeepZones,
    mergeCache
  );
  return {
    ...geometry,
    performance: {
      ...geometry.performance,
      selectionPreparationMilliseconds: selectionPreparedAt - preparationStartedAt,
      selectiveZoneBuildMilliseconds: selectiveZonesBuiltAt - selectionPreparedAt,
      selectiveZoneFilterMilliseconds: selectiveZonesFilteredAt - selectiveZonesBuiltAt,
      sourceZoneFilterMilliseconds: sourceZonesFilteredAt - selectiveZonesFilteredAt,
    },
    selectiveProtectionZones,
  };
}

function isRecordSelectiveXPlaneRemoval(data, selectedRows) {
  return (
    data.meta?.simulator === 'xplane' &&
    selectedRows.length > 0 &&
    selectedRows.every((row) => row.sourceType === 'xplane-apt-light-string')
  );
}

function buildIsolatedGuidanceCrossingContext(selectedRows) {
  return selectedRows
    .filter(
      (row) =>
        GUIDANCE_CLASSIFICATIONS.has(sourceClassification(row)) &&
        Array.isArray(row.vertices) &&
        row.vertices.length >= 2
    )
    .map((row) => ({ row, bounds: geometryBounds(row.vertices) }));
}

function isIsolatedGuidanceCrossingZone(zone, selectedGuidanceRows) {
  if (
    !GUIDANCE_CLASSIFICATIONS.has(zone.classification) ||
    zone.geometryType !== 'LineString' ||
    !Array.isArray(zone.vertices) ||
    zone.vertices.length < 2
  ) {
    return false;
  }
  const zoneBounds = geometryBounds(zone.vertices);
  return selectedGuidanceRows.some(
    ({ row, bounds }) =>
      geometryBoundsWithinDistance(bounds, zoneBounds, ISOLATED_CROSSING_DISTANCE_METERS) &&
      isIsolatedPolylineCrossing(row.vertices, zone.vertices)
  );
}

function geometryBoundsWithinDistance(left, right, distanceMeters) {
  const latitudePad = distanceMeters / 110_000;
  const maximumAbsoluteLatitude = Math.min(
    89.9,
    Math.max(
      Math.abs(left.minLat),
      Math.abs(left.maxLat),
      Math.abs(right.minLat),
      Math.abs(right.maxLat)
    ) + latitudePad
  );
  const longitudePad =
    distanceMeters /
    (110_000 * Math.max(0.001, Math.cos((maximumAbsoluteLatitude * Math.PI) / 180)));
  return !(
    left.maxLat + latitudePad < right.minLat ||
    right.maxLat + latitudePad < left.minLat ||
    left.maxLon + longitudePad < right.minLon ||
    right.maxLon + longitudePad < left.minLon
  );
}

function isIsolatedPolylineCrossing(left, right) {
  if (!Array.isArray(left) || left.length < 2 || !Array.isArray(right) || right.length < 2) {
    return false;
  }
  if (polylineToPolylineDistanceMeters(left, right) > ISOLATED_CROSSING_DISTANCE_METERS) {
    return false;
  }
  const leftOverlap = polylineNearLength(left, right);
  const rightOverlap = polylineNearLength(right, left);
  return (
    leftOverlap <= MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS &&
    rightOverlap <= MAXIMUM_ISOLATED_CROSSING_OVERLAP_METERS
  );
}

function polylineNearLength(source, target) {
  const distances = cumulativeVertexDistances(source);
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength <= 0) return 0;
  const sampleCount = Math.max(2, Math.ceil(totalLength / CROSSING_SAMPLE_INTERVAL_METERS) + 1);
  const interval = totalLength / (sampleCount - 1);
  let nearLength = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const point = vertexAtDistance(source, distances, interval * index);
    if (pointToPolylineDistanceMeters(point, target) <= ISOLATED_CROSSING_DISTANCE_METERS) {
      nearLength += interval;
    }
  }
  return nearLength;
}

function sourceClassification(row) {
  return row.sourceClassification ?? row.classification;
}

function consolidateRemovalRows(sourceRows, selectedRows) {
  const parentRows = new Map(sourceRows.map((row) => [row.id, row]));
  const sectionsByParent = new Map();
  const rows = [];

  for (const row of selectedRows) {
    if (
      !row.sourceParentRowId ||
      !Number.isFinite(row.sourceRangeStartMeters) ||
      !Number.isFinite(row.sourceRangeEndMeters)
    ) {
      rows.push(
        compiledTargetSourceRows(row).length > 0 ? withCompiledParentTargets(row, row) : row
      );
      continue;
    }
    const sections = sectionsByParent.get(row.sourceParentRowId) ?? [];
    sections.push({
      start: row.sourceRangeStartMeters,
      end: row.sourceRangeEndMeters,
      member: row,
    });
    sectionsByParent.set(row.sourceParentRowId, sections);
  }

  for (const [parentId, sections] of sectionsByParent) {
    const parent = parentRows.get(parentId);
    if (!parent?.vertices?.length) {
      rows.push(
        ...sections.map((section) =>
          section.member.removalTargetSourceRows?.length
            ? withCompiledParentTargets(section.member, section.member, [section.member.id])
            : section.member
        )
      );
      continue;
    }

    const groups = sections
      .sort((left, right) => left.start - right.start)
      .reduce((result, section) => {
        const previous = result.at(-1);
        if (!previous || section.start > previous.end + 0.05) {
          result.push({ start: section.start, end: section.end, members: [section.member] });
        } else {
          previous.end = Math.max(previous.end, section.end);
          previous.members.push(section.member);
        }
        return result;
      }, []);
    const distances = cumulativeVertexDistances(parent.vertices);

    for (const [index, group] of groups.entries()) {
      if (group.members.length === 1) {
        rows.push(withCompiledParentTargets(group.members[0], parent, [group.members[0].id]));
        continue;
      }
      const vertices = sliceVerticesByDistance(parent.vertices, distances, group.start, group.end);
      vertices[0] = group.members[0].vertices[0];
      vertices[vertices.length - 1] = group.members.at(-1).vertices.at(-1);
      rows.push(
        withCompiledParentTargets(
          {
            ...parent,
            id: `${parent.id}:selected-sections:${index}`,
            sourceRowIds: group.members.map((member) => member.id),
            sourceParentRowId: parent.id,
            sourceRangeStartMeters: group.start,
            sourceRangeEndMeters: group.end,
            sourceGeometryDerived: 'merged-source-row-subsections',
            sourceInstanceIds: [
              ...new Set(group.members.flatMap((member) => member.sourceInstanceIds ?? [])),
            ],
            vertices,
          },
          parent
        )
      );
    }
  }

  return rows;
}

function withCompiledParentTargets(row, parent, sourceRowIds = row.sourceRowIds) {
  const targetSourceRows = compiledTargetSourceRows(parent);
  if (targetSourceRows.length === 0) {
    return { ...row, ...(sourceRowIds ? { sourceRowIds } : {}) };
  }
  const endpoints = [row.vertices[0], row.vertices.at(-1)];
  const sectionToleranceMeters =
    targetSourceRows.length > 1
      ? MERGED_COMPILED_TARGET_SECTION_TOLERANCE_METERS
      : COMPILED_TARGET_SECTION_TOLERANCE_METERS;
  const endpointToleranceMeters = compiledTargetEndpointToleranceMeters(targetSourceRows);
  const endpointCapMeters = compiledTargetEndpointCapMeters(targetSourceRows);
  const removalTargetPointsOverride = targetSourceRows
    .flatMap((sourceRow) => targetLightPointsForRow(sourceRow))
    .filter(
      (point) =>
        pointToPolylineDistanceMeters(point, row.vertices) <= sectionToleranceMeters ||
        endpoints.some(
          (endpoint) => haversineDistanceMeters(point, endpoint) <= endpointToleranceMeters
        )
    );
  return {
    ...row,
    ...(sourceRowIds ? { sourceRowIds } : {}),
    removalEndpointTargetPoints: compiledSectionEndpointTargets(
      row.vertices,
      removalTargetPointsOverride,
      endpointToleranceMeters
    ),
    removalEndpointCapMeters: endpointCapMeters,
    removalTargetPointsOverride,
  };
}

function compiledTargetSourceRows(row) {
  const candidates = row?.removalTargetSourceRows?.length
    ? row.removalTargetSourceRows
    : row
      ? [row]
      : [];
  return candidates.filter(
    (sourceRow) =>
      sourceRow?.sourceType === 'bgl-airport-light-row' &&
      (sourceRow.compiledLightPlacement === 'spacing' ||
        sourceRow.removalTargetSampling === 'spacing')
  );
}

function compiledTargetEndpointToleranceMeters(targetSourceRows) {
  const spacings = targetSourceRows
    .map((row) => Number(row.spacing))
    .filter((spacing) => Number.isFinite(spacing) && spacing > 0);
  if (spacings.length === 0) return SECTION_PROTECTION_BOUNDARY_GAP_METERS;
  return Math.min(
    MAXIMUM_COMPILED_TARGET_ENDPOINT_TOLERANCE_METERS,
    Math.max(0, Math.min(...spacings) / 2 - COMPILED_TARGET_ENDPOINT_MIDPOINT_MARGIN_METERS)
  );
}

function compiledTargetEndpointCapMeters(targetSourceRows) {
  const spacings = targetSourceRows
    .map((row) => Number(row.spacing))
    .filter((spacing) => Number.isFinite(spacing) && spacing > 0);
  if (spacings.length === 0) return 0;
  return Math.min(
    MAXIMUM_COMPILED_TARGET_END_CAP_METERS,
    Math.min(...spacings) * COMPILED_TARGET_END_CAP_SPACING_RATIO
  );
}

function compiledSectionEndpointTargets(vertices, targetPoints, endpointToleranceMeters) {
  if (vertices.length < 2 || targetPoints.length === 0) return [];
  const start = vertices[0];
  const end = vertices.at(-1);
  const startTargets = targetPoints.filter(
    (point) => haversineDistanceMeters(point, start) <= endpointToleranceMeters
  );
  const endTargets = targetPoints.filter(
    (point) => haversineDistanceMeters(point, end) <= endpointToleranceMeters
  );
  const nearestStart = nearestEndpointTarget(start, startTargets);
  const nearestEnd = nearestEndpointTarget(end, endTargets);
  return [nearestStart, nearestEnd]
    .filter((candidate) => candidate?.distanceMeters <= endpointToleranceMeters)
    .map((candidate) => candidate.point);
}

function nearestEndpointTarget(endpoint, targetPoints) {
  if (targetPoints.length === 0) return null;
  return targetPoints.reduce(
    (nearest, point) => {
      const distanceMeters = haversineDistanceMeters(endpoint, point);
      return distanceMeters < nearest.distanceMeters ? { point, distanceMeters } : nearest;
    },
    { point: null, distanceMeters: Number.POSITIVE_INFINITY }
  );
}

function selectiveTargetMustKeepZones(data, selectedRows, selectedSourceInstanceIds) {
  const selectedRowIds = new Set(selectedRows.map((row) => row.id));
  const selectedTargetPoints = selectedRows
    .flatMap((row) => targetLightPointsForRow(row))
    .sort((left, right) => left.lat - right.lat);
  const selectedSectionsByParent = new Map();
  for (const row of selectedRows) {
    if (
      !row.sourceParentRowId ||
      !Number.isFinite(row.sourceRangeStartMeters) ||
      !Number.isFinite(row.sourceRangeEndMeters)
    ) {
      continue;
    }
    const sections = selectedSectionsByParent.get(row.sourceParentRowId) ?? [];
    sections.push({ start: row.sourceRangeStartMeters, end: row.sourceRangeEndMeters });
    selectedSectionsByParent.set(row.sourceParentRowId, sections);
  }
  const zones = [];

  for (const instance of data.instances ?? []) {
    if (
      !TARGET_CLASSIFICATIONS.has(instance.classification) ||
      selectedSourceInstanceIds.has(instance.id) ||
      !Number.isFinite(instance.lat) ||
      !Number.isFinite(instance.lon)
    ) {
      continue;
    }
    zones.push({
      id: `selective-instance:${instance.id}`,
      sourceId: instance.id,
      sourceFile: instance.sourceFile,
      sourceType: instance.sourceType,
      classification: instance.classification,
      geometryType: 'Point',
      point: { lat: instance.lat, lon: instance.lon },
      clearanceMeters: SELECTIVE_TARGET_KEEP_CLEARANCE_METERS,
      reason: 'target simulator light not selected by division matching',
    });
  }

  for (const row of data.lightRows ?? []) {
    if (
      row.removalEligible === false ||
      selectedRowIds.has(row.id) ||
      !TARGET_CLASSIFICATIONS.has(row.classification) ||
      !Array.isArray(row.vertices) ||
      row.vertices.length === 0
    ) {
      continue;
    }
    const selectedSections = selectedSectionsByParent.get(row.id);
    const targetSourceRows = compiledTargetSourceRows(row);
    const protectedSegments =
      targetSourceRows.length > 0
        ? []
        : selectedSections
          ? unselectedRowSegments(row.vertices, selectedSections)
          : [row.vertices];
    for (const [index, vertices] of protectedSegments.entries()) {
      if (vertices.length === 0) continue;
      zones.push({
        id: `selective-row:${row.id}:${index}`,
        sourceId: row.id,
        sourceFile: row.sourceFile,
        sourceType: row.sourceType,
        classification: row.classification,
        geometryType: vertices.length === 1 ? 'Point' : 'LineString',
        ...(vertices.length === 1 ? { point: vertices[0] } : { vertices }),
        clearanceMeters: SELECTIVE_TARGET_KEEP_CLEARANCE_METERS,
        reason: selectedSections
          ? 'source row section not selected by division matching'
          : 'target simulator row not selected by division matching',
      });
    }
    if (targetSourceRows.length > 0) {
      const protectedTargetPointKeys = new Set();
      const targetPoints = targetSourceRows.flatMap((sourceRow) =>
        targetLightPointsForRow(sourceRow)
      );
      for (const point of targetPoints) {
        const key = targetPointKey(point);
        if (
          hasSelectedCompiledTarget(selectedTargetPoints, point) ||
          protectedTargetPointKeys.has(key)
        )
          continue;
        protectedTargetPointKeys.add(key);
        zones.push({
          id: `selective-target:${row.id}:${key}`,
          sourceId: row.id,
          sourceFile: row.sourceFile,
          sourceType: row.sourceType,
          classification: row.classification,
          geometryType: 'Point',
          point,
          clearanceMeters: SELECTIVE_TARGET_KEEP_CLEARANCE_METERS,
          reason: 'compiled source-row light not selected by division matching',
        });
      }
    }
  }

  return zones;
}

function targetPointKey(point) {
  return `${Number(point.lat).toFixed(10)}:${Number(point.lon).toFixed(10)}`;
}

function hasSelectedCompiledTarget(sortedPoints, point) {
  // Overlapping compiled rows can calculate the same lamp a fraction of a millimetre apart.
  const latitudeTolerance = COMPILED_TARGET_IDENTITY_TOLERANCE_METERS / 110_000;
  let low = 0;
  let high = sortedPoints.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedPoints[middle].lat < point.lat - latitudeTolerance) low = middle + 1;
    else high = middle;
  }
  for (let index = low; index < sortedPoints.length; index += 1) {
    const candidate = sortedPoints[index];
    if (candidate.lat > point.lat + latitudeTolerance) break;
    if (haversineDistanceMeters(candidate, point) <= COMPILED_TARGET_IDENTITY_TOLERANCE_METERS) {
      return true;
    }
  }
  return false;
}

function unselectedRowSegments(
  vertices,
  selectedSections,
  boundaryGapMeters = SECTION_PROTECTION_BOUNDARY_GAP_METERS
) {
  const distances = cumulativeVertexDistances(vertices);
  const totalLength = distances.at(-1) ?? 0;
  if (totalLength <= 0.05) return [vertices];

  const merged = [...selectedSections]
    .map((section) => ({
      start: Math.max(0, section.start - boundaryGapMeters),
      end: Math.min(totalLength, section.end + boundaryGapMeters),
    }))
    .sort((left, right) => left.start - right.start)
    .reduce((result, section) => {
      const previous = result.at(-1);
      if (!previous || section.start > previous.end) result.push(section);
      else previous.end = Math.max(previous.end, section.end);
      return result;
    }, []);

  const ranges = [];
  let cursor = 0;
  for (const section of merged) {
    if (section.start - cursor > 0.05) ranges.push({ start: cursor, end: section.start });
    cursor = Math.max(cursor, section.end);
  }
  if (totalLength - cursor > 0.05) ranges.push({ start: cursor, end: totalLength });

  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Separate slicing and empty-segment rejection make the geometry invariant explicit.
  return ranges
    .map((range) => sliceVerticesByDistance(vertices, distances, range.start, range.end))
    .filter((segment) => segment.length > 0);
}

function cumulativeVertexDistances(vertices) {
  const distances = [0];
  for (let index = 1; index < vertices.length; index += 1) {
    distances.push(
      distances.at(-1) + haversineDistanceMeters(vertices[index - 1], vertices[index])
    );
  }
  return distances;
}

function sliceVerticesByDistance(vertices, distances, start, end) {
  const sliced = [vertexAtDistance(vertices, distances, start)];
  for (let index = 1; index < vertices.length - 1; index += 1) {
    if (distances[index] > start && distances[index] < end) sliced.push(vertices[index]);
  }
  sliced.push(vertexAtDistance(vertices, distances, end));
  return sliced.filter(
    (vertex, index) => index === 0 || haversineDistanceMeters(sliced[index - 1], vertex) > 0.01
  );
}

function vertexAtDistance(vertices, distances, target) {
  if (target <= 0) return vertices[0];
  if (target >= distances.at(-1)) return vertices.at(-1);

  let index = 1;
  while (index < distances.length && distances[index] < target) index += 1;
  const segmentStart = distances[index - 1];
  const segmentLength = Math.max(distances[index] - segmentStart, 0.000001);
  const ratio = Math.max(0, Math.min(1, (target - segmentStart) / segmentLength));
  return {
    lat: vertices[index - 1].lat + (vertices[index].lat - vertices[index - 1].lat) * ratio,
    lon: vertices[index - 1].lon + (vertices[index].lon - vertices[index - 1].lon) * ratio,
  };
}

function emptyRemovalGeometry() {
  return {
    exclusionCandidates: [],
    removalPolygons: [],
    protectionConflicts: [],
    selectiveProtectionZones: [],
    performance: {
      groupingMilliseconds: 0,
      polygonBuildMilliseconds: 0,
      instanceBuildMilliseconds: 0,
      conflictFilterMilliseconds: 0,
    },
  };
}

function generateDraftXml({
  icao,
  altitude,
  matches,
  removalPolygons,
  simulator,
  xplaneSelectors = [],
}) {
  const polygons = [];
  const msfsRemovalPlan = [];
  let groupIndex = 1;
  const baseAltitude = Number.isFinite(altitude) ? altitude : 0;

  for (const match of matches) {
    const coordinates = rowCoordinates(match.row);
    if (coordinates.length < 4) continue;
    polygons.push(
      polygonXml(
        String(match.division.id),
        groupIndex,
        baseAltitude,
        coordinates,
        `${icao}:${match.division.id}:${match.row.id}`
      )
    );
    groupIndex += 1;
  }

  let removalIndex = 0;
  for (const removal of removalPolygons) {
    if (!Array.isArray(removal.coordinates) || removal.coordinates.length < 4) continue;
    polygons.push(
      polygonXml(
        'remove',
        groupIndex,
        baseAltitude,
        removal.coordinates,
        `${icao}:remove:${removal.id}`
      )
    );
    msfsRemovalPlan.push(
      `\t\t<Removal removalIndex="${removalIndex}"${removal.removalMode === 'polygon' ? ' mode="polygon"' : ''}/>`
    );
    for (const point of removal.targetLightPoints ?? []) {
      if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) continue;
      const supportSizeMeters = Number(point.supportSizeMeters);
      msfsRemovalPlan.push(
        `\t\t<Target removalIndex="${removalIndex}" lat="${point.lat.toFixed(14)}" lon="${point.lon.toFixed(14)}" heading="${Number.isFinite(point.heading) ? point.heading.toFixed(6) : '0.000000'}"${Number.isFinite(supportSizeMeters) && supportSizeMeters > 0 ? ` supportSizeMeters="${supportSizeMeters.toFixed(3)}"` : ''}/>`
      );
    }
    const flags = removal.exclusionFlags;
    if (flags && Object.values(flags).some(Boolean)) {
      msfsRemovalPlan.push(
        `\t\t<Object removalIndex="${removalIndex}"${flags.excludeLibraryObjects ? ' excludeLibraryObjects="true"' : ''}${flags.excludeVFX ? ' excludeVFX="true"' : ''}${flags.excludeSimPropContainers ? ' excludeSimPropContainers="true"' : ''}/>`
      );
    }
    removalIndex += 1;
    groupIndex += 1;
  }

  const rootAttributes =
    simulator === 'xplane'
      ? 'version="9.0" simulator="xplane" xplaneRemovalVersion="2"'
      : 'version="9.0"';
  const selectorXml =
    simulator === 'xplane'
      ? `\n\t<XPlaneRemovals version="2">\n${xplaneSelectors
          .flatMap((selector) =>
            selector.ranges.map(([start, end]) => xplaneSelectorXml({ ...selector, start, end }))
          )
          .join('\n')}\n\t</XPlaneRemovals>`
      : '';
  const msfsRemovalXml =
    simulator !== 'xplane' && msfsRemovalPlan.length > 0
      ? `\n\t<MSFSRemovals version="1">\n${msfsRemovalPlan.join('\n')}\n\t</MSFSRemovals>`
      : '';
  return `<?xml version="1.0"?>\n<FSData ${rootAttributes}>\n${polygons.join('\n')}${selectorXml}${msfsRemovalXml}\n</FSData>`;
}

function polygonXml(displayName, groupIndex, altitude, coordinates, guidSeed) {
  const vertices = coordinates
    .slice(0, -1)
    .map(
      ([lon, lat]) =>
        `\t\t<Vertex lat="${Number(lat).toFixed(14)}" lon="${Number(lon).toFixed(14)}"/>`
    )
    .join('\n');

  return `\t<Polygon version="0.4.0" displayName="${escapeXml(displayName)}" groupIndex="${groupIndex}" altitude="${altitude.toFixed(11)}">
\t\t<Attribute name="UniqueGUID" guid="{359C73E8-06BE-4FB2-ABCB-EC942F7761D0}" type="GUID" value="{${guidForSeed(guidSeed)}}"/>
${vertices}
\t</Polygon>`;
}

function rowCoordinates(row) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  const coordinates = (row.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => [vertex.lon, vertex.lat]);
  if (coordinates.length < 2) return [];

  const open = sameCoordinate(coordinates[0], coordinates.at(-1))
    ? coordinates.slice(0, -1)
    : coordinates;
  if (open.length === 2) {
    open.splice(1, 0, [(open[0][0] + open[1][0]) / 2, (open[0][1] + open[1][1]) / 2]);
  }
  return [...open, open[0]];
}

function buildSimulatorDebugGeoJson(simulatorRows, mergedSimulatorRows) {
  const features = [];

  for (const row of simulatorRows) {
    const coordinates = simulatorRowCoordinates(row);
    if (coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'simulator-source',
        simulatorRowId: String(row.id || ''),
        title: String(row.id || 'Extracted simulator row'),
        simulatorType: row.classification || 'unknown',
        sourceType: row.sourceType || '',
        sourceDefinition: row.sourceDefinition || '',
        evidencePriority: Number(row.evidencePriority) || null,
        removalEligible: row.removalEligible !== false,
        sourceFile: row.sourceFile || '',
        confidence: Number.isFinite(row.confidence) ? Math.round(row.confidence * 100) : null,
      },
    });
  }

  for (const row of mergedSimulatorRows) {
    const coordinates = simulatorRowCoordinates(row);
    if (coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'simulator-merged',
        simulatorRowId: String(row.id || ''),
        title: `Merged matcher geometry (${row.sourceRowCount} source rows)`,
        simulatorType: row.classification || 'unknown',
        sourceRowCount: row.sourceRowCount,
        sourceRowIds: (row.sourceRowIds ?? []).join(', '),
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function buildDraftGeoJson(
  matches,
  unmatched,
  removalPolygons,
  unsafeMatches = [],
  removalMatches = []
) {
  const features = [];
  const divisionColors = buildDivisionColorMap(matches, unmatched, unsafeMatches);
  const originalDivisions = new Map();

  for (const item of [...matches, ...unsafeMatches, ...unmatched]) {
    const division = item.division;
    const id = String(division?.id ?? '');
    if (!id || originalDivisions.has(id)) continue;
    const geometry = divisionGeometry(division?.coordinates);
    if (!geometry) continue;
    originalDivisions.set(id, {
      type: 'Feature',
      geometry,
      properties: {
        featureType: 'original-division',
        divisionId: id,
        title: division?.name || id,
        divisionType: division?.type || 'unknown',
      },
    });
  }

  features.push(...originalDivisions.values());

  for (const removal of removalPolygons) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [removal.coordinates] },
      properties: {
        featureType: 'removal',
        title: 'Selective removal area',
        sourceIds:
          removal.sourceRowIds ??
          (removal.sourceRowId
            ? [removal.sourceRowId]
            : removal.sourceId
              ? [removal.sourceId]
              : []),
        origin: 'msfs-source',
        mustKeepZoneIds: removal.mustKeepZoneIds ?? [],
        sourceLines: removalSourceLines(removal, removalMatches),
        targetLightPoints: removal.targetLightPoints ?? [],
        exclusionFlags: removal.exclusionFlags ?? {},
        removalMode: removal.removalMode ?? 'targets',
      },
    });
  }

  for (const match of matches) {
    const coordinates = rowCoordinates(match.row).slice(0, -1);
    if (coordinates.length < 2) continue;
    const { id: divisionId, name: divisionName, type: divisionType } = match.division;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'matched',
        divisionId: String(divisionId),
        debugColor: divisionColors.get(String(divisionId)),
        title: divisionName || String(divisionId),
        divisionType,
        simulatorType: match.row.classification,
        matchPercent: Math.round(match.score * 100),
        sourceRowId: String(match.row.id ?? ''),
        sourceFeatureId: String(match.row.sourceFeatureId ?? ''),
        dsfRemoval: dsfSelector(match.row.dsfRemoval),
        lightCode: match.row.lightCode,
        sourceRunIndex: match.row.sourceRunIndex,
        sourceParentLengthMeters: match.row.sourceParentLengthMeters || rowLengthMeters(match.row),
        sourceType: String(match.row.sourceType ?? ''),
        sourceRangeStartMeters: Number.isFinite(match.row.sourceRangeStartMeters)
          ? match.row.sourceRangeStartMeters
          : null,
        sourceRangeEndMeters: Number.isFinite(match.row.sourceRangeEndMeters)
          ? match.row.sourceRangeEndMeters
          : null,
      },
    });
  }

  for (const match of unsafeMatches) {
    const coordinates = rowCoordinates(match.row).slice(0, -1);
    if (coordinates.length < 2) continue;
    const { id: divisionId, name: divisionName, type: divisionType } = match.division;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: {
        featureType: 'unsafe',
        divisionId: String(divisionId),
        debugColor: divisionColors.get(String(divisionId)),
        title: divisionName || String(divisionId),
        divisionType,
        simulatorType: match.row.classification,
        matchPercent: Math.round(match.score * 100),
        reason: 'Simulator geometry matched, but its removal area needs manual review.',
        sourceRowId: String(match.row.id ?? ''),
        sourceFeatureId: String(match.row.sourceFeatureId ?? ''),
        sourceType: String(match.row.sourceType ?? ''),
        sourceRangeStartMeters: Number.isFinite(match.row.sourceRangeStartMeters)
          ? match.row.sourceRangeStartMeters
          : null,
        sourceRangeEndMeters: Number.isFinite(match.row.sourceRangeEndMeters)
          ? match.row.sourceRangeEndMeters
          : null,
      },
    });
  }

  for (const item of unmatched) {
    const division = item.division;
    const geometry = divisionGeometry(division?.coordinates);
    if (!geometry) continue;
    features.push({
      type: 'Feature',
      geometry,
      properties: {
        featureType: 'unmatched',
        divisionId: String(division?.id ?? ''),
        debugColor: divisionColors.get(String(division?.id ?? '')),
        title: division?.name || String(division?.id || 'Unmatched object'),
        divisionType: division?.type || 'unknown',
        reason: item.reason,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

function removalSourceLines(removal, matches) {
  const removalSourceIds = new Set(
    (removal.sourceRowIds ?? (removal.sourceRowId ? [removal.sourceRowId] : []))
      .map(String)
      .filter(Boolean)
  );
  const lines = [];
  const seen = new Set();
  for (const match of matches ?? []) {
    const row = match?.row;
    const rowSourceIds = [row?.id, row?.sourceParentRowId, ...(row?.sourceRowIds ?? [])]
      .map(String)
      .filter(Boolean);
    if (!rowSourceIds.some((sourceId) => removalSourceIds.has(sourceId))) continue;
    const coordinates = (row?.vertices ?? [])
      .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
      .map((vertex) => [vertex.lon, vertex.lat]);
    if (coordinates.length < 2) continue;
    const sourceId =
      rowSourceIds.find((candidate) => removalSourceIds.has(candidate)) ?? rowSourceIds[0];
    const key = `${sourceId}:${JSON.stringify(coordinates)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({ sourceId, coordinates });
  }
  return lines;
}

function buildDivisionColorMap(matches, unmatched, unsafeMatches) {
  const divisionsById = new Map();
  for (const item of [...matches, ...unsafeMatches, ...unmatched]) {
    const division = item.division;
    if (!division) continue;
    const id = String(division.id ?? '');
    if (!divisionsById.has(id)) divisionsById.set(id, division);
  }

  return assignAdjacentColors(
    [...divisionsById].map(([id, division]) => ({
      id,
      coordinates: (Array.isArray(division.coordinates)
        ? division.coordinates
        : division.coordinates
          ? [division.coordinates]
          : []
      )
        .filter(
          (coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng)
        )
        .map((coordinate) => [coordinate.lng, coordinate.lat]),
    }))
  );
}

function simulatorRowCoordinates(row) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  return (row.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => [vertex.lon, vertex.lat]);
}

function divisionGeometry(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Validation and tuple projection are intentionally distinct geometry stages.
  const coordinates = values
    .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng))
    .map((coordinate) => [coordinate.lng, coordinate.lat]);
  if (coordinates.length >= 2) return { type: 'LineString', coordinates };
  if (coordinates.length === 1) return { type: 'Point', coordinates: coordinates[0] };
  return null;
}

function sameCoordinate(left, right) {
  return Math.abs(left[0] - right[0]) < 1e-12 && Math.abs(left[1] - right[1]) < 1e-12;
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function guidForSeed(seed) {
  const words = [2166136261, 2246822507, 3266489909, 668265263];
  for (let index = 0; index < String(seed).length; index += 1) {
    const code = String(seed).charCodeAt(index);
    for (let word = 0; word < words.length; word += 1) {
      words[word] = Math.imul(words[word] ^ (code + word * 31), 16777619) >>> 0;
    }
  }
  const hex = words
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
