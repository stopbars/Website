import { dsfSelector, dsfSelectorKey } from './xplane-removal-contract.js';
/* oxlint-disable react-doctor/js-flatmap-filter -- Snap candidates are bounded and explicit validity filtering documents eligible geometry. */

import {
  lineLengthMeters,
  nearestPointOnLine,
  project,
  sliceLineBetween,
  unproject,
} from './editor-geometry.js';

const DEFAULT_MATCH_TOLERANCE_METERS = 1;
const MIN_MATCHED_LENGTH_METERS = 0.5;
const MAX_LENGTH_RATIO_DIFFERENCE = 0.08;

export function matchSnappedReference(
  coordinates,
  referenceFeatures,
  toleranceMeters = DEFAULT_MATCH_TOLERANCE_METERS,
  { allowDerived = false } = {}
) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const objectLength = lineLengthMeters(coordinates);
  if (objectLength < MIN_MATCHED_LENGTH_METERS) return null;

  const candidates = [];
  for (const feature of referenceFeatures ?? []) {
    if (feature.geometry?.type !== 'LineString') continue;
    const properties = feature.properties ?? {};
    if (
      properties.snapCategory !== 'light-rows' ||
      properties.removable === false ||
      (!allowDerived && properties.exactness === 'derived')
    ) {
      continue;
    }
    const candidate = matchSourceLine(coordinates, objectLength, feature, toleranceMeters);
    if (candidate) candidates.push(candidate);
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (left, right) =>
      left.maximumDistanceMeters - right.maximumDistanceMeters ||
      left.lengthRatioDifference - right.lengthRatioDifference
  );
  const best = candidates[0];
  return {
    ...best,
    bindings: candidates.map((candidate) => candidate.binding),
    selectors: candidates.map((candidate) => candidate.selector).filter(Boolean),
  };
}

export function referenceMatchFromProjections(feature, first, last) {
  const properties = feature?.properties ?? {};
  const totalLength = lineLengthMeters(feature?.geometry?.coordinates);
  const binding = {
    sourceId: String(properties.sourceId ?? feature?.id ?? ''),
    dsfRemoval: dsfSelector(properties.dsfRemoval),
    sourceFeatureId: properties.sourceFeatureId || undefined,
    sourceType: properties.sourceType || undefined,
    rangeStartMeters: Math.min(first.alongMeters, last.alongMeters),
    rangeEndMeters: Math.max(first.alongMeters, last.alongMeters),
    sourceParentLengthMeters: totalLength,
    lightCode: Number.isInteger(properties.lightCode) ? properties.lightCode : undefined,
    sourceRunIndex: Number.isInteger(properties.sourceRunIndex)
      ? properties.sourceRunIndex
      : undefined,
  };
  const selector = selectorFromBinding(binding);
  return {
    feature,
    binding,
    selector,
    bindings: [binding],
    selectors: selector ? [selector] : [],
  };
}

export function removalBindingFromExtendedReference(coordinates, feature) {
  const sourceCoordinates = feature?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Array.isArray(sourceCoordinates) ||
    sourceCoordinates.length < 2
  ) {
    return null;
  }
  const totalLength = lineLengthMeters(sourceCoordinates);
  if (totalLength < MIN_MATCHED_LENGTH_METERS) return null;
  const projections = [];
  for (const coordinate of coordinates) {
    const projection = nearestPointOnExtendedLine(coordinate, sourceCoordinates);
    if (projection) projections.push(projection);
  }
  if (projections.length < 2) return null;
  const rangeStartMeters = clamp(
    Math.min(...projections.map((projection) => projection.alongMeters)),
    0,
    totalLength
  );
  const rangeEndMeters = clamp(
    Math.max(...projections.map((projection) => projection.alongMeters)),
    0,
    totalLength
  );
  if (rangeEndMeters - rangeStartMeters < MIN_MATCHED_LENGTH_METERS) return null;
  return referenceMatchFromProjections(
    feature,
    { alongMeters: rangeStartMeters },
    { alongMeters: rangeEndMeters }
  ).binding;
}

export function nearbyRemovalBindingFromExtendedReference(
  coordinates,
  feature,
  toleranceMeters = DEFAULT_MATCH_TOLERANCE_METERS
) {
  const sourceCoordinates = feature?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Array.isArray(sourceCoordinates) ||
    sourceCoordinates.length < 2
  ) {
    return null;
  }
  const runs = [];
  let currentRun = [];
  for (const coordinate of coordinates) {
    const projection = nearestPointOnExtendedLine(coordinate, sourceCoordinates);
    if (projection && projection.distanceMeters <= toleranceMeters) {
      currentRun.push({ coordinate, projection });
    } else {
      if (currentRun.length >= 2) runs.push(currentRun);
      currentRun = [];
    }
  }
  if (currentRun.length >= 2) runs.push(currentRun);

  const totalLength = lineLengthMeters(sourceCoordinates);
  let best = null;
  for (const run of runs) {
    const rangeStartMeters = clamp(
      Math.min(...run.map(({ projection }) => projection.alongMeters)),
      0,
      totalLength
    );
    const rangeEndMeters = clamp(
      Math.max(...run.map(({ projection }) => projection.alongMeters)),
      0,
      totalLength
    );
    const projectedLength = rangeEndMeters - rangeStartMeters;
    if (projectedLength < MIN_MATCHED_LENGTH_METERS) continue;
    const objectLength = lineLengthMeters(run.map(({ coordinate }) => coordinate));
    if (Math.abs(objectLength / projectedLength - 1) > 0.25) continue;
    if (!best || projectedLength > best.projectedLength) {
      best = { rangeStartMeters, rangeEndMeters, projectedLength };
    }
  }
  if (!best) return null;
  return referenceMatchFromProjections(
    feature,
    { alongMeters: best.rangeStartMeters },
    { alongMeters: best.rangeEndMeters }
  ).binding;
}

export function selectorKey(selector) {
  if (selector?.kind) return dsfSelectorKey(selector);
  if (!selector?.feature || !Number.isInteger(selector.code) || !Number.isInteger(selector.run)) {
    return '';
  }
  return `${selector.feature}:${selector.code}:${selector.run}`;
}

export function bindingSelectorKey(binding) {
  if (binding?.dsfRemoval) return dsfSelectorKey(binding.dsfRemoval);
  return selectorKey({
    feature: binding?.sourceFeatureId,
    code: binding?.lightCode,
    run: binding?.sourceRunIndex,
  });
}

export function selectorFromBinding(binding) {
  if (binding?.dsfRemoval) {
    return binding.rangeStartMeters <= 0.001 &&
      binding.rangeEndMeters >= binding.sourceParentLengthMeters - 0.001
      ? dsfSelector(binding.dsfRemoval)
      : null;
  }
  if (
    !/^[a-f0-9]{16}$/i.test(binding.sourceFeatureId ?? '') ||
    binding.sourceType !== 'xplane-apt-light-string' ||
    !Number.isInteger(binding.lightCode) ||
    !Number.isInteger(binding.sourceRunIndex) ||
    !(binding.sourceParentLengthMeters > 0)
  ) {
    return null;
  }
  return {
    feature: binding.sourceFeatureId,
    code: binding.lightCode,
    run: binding.sourceRunIndex,
    start: binding.rangeStartMeters / binding.sourceParentLengthMeters,
    end: binding.rangeEndMeters / binding.sourceParentLengthMeters,
  };
}

function maximumDistance(coordinates, line) {
  let maximum = 0;
  for (const coordinate of coordinates) {
    const projection = nearestPointOnLine(coordinate, line);
    if (!projection) return Infinity;
    maximum = Math.max(maximum, projection.distanceMeters);
  }
  return maximum;
}

function matchSourceLine(coordinates, objectLength, feature, toleranceMeters) {
  const sourceCoordinates = feature.geometry.coordinates;
  const totalLength = lineLengthMeters(sourceCoordinates);
  if (totalLength < MIN_MATCHED_LENGTH_METERS) return null;

  const objectOnSource = containedLineMatch(
    coordinates,
    objectLength,
    sourceCoordinates,
    toleranceMeters
  );
  const sourceOnObject = containedLineMatch(
    sourceCoordinates,
    totalLength,
    coordinates,
    toleranceMeters
  );
  let rangeStartMeters;
  let rangeEndMeters;
  let matchedLength;
  let maximumDistanceMeters;

  if (objectOnSource) {
    rangeStartMeters = Math.min(objectOnSource.first.alongMeters, objectOnSource.last.alongMeters);
    rangeEndMeters = Math.max(objectOnSource.first.alongMeters, objectOnSource.last.alongMeters);
    matchedLength = objectOnSource.containerSliceLength;
    maximumDistanceMeters = objectOnSource.maximumDistanceMeters;
  } else if (sourceOnObject) {
    rangeStartMeters = 0;
    rangeEndMeters = totalLength;
    matchedLength = totalLength;
    maximumDistanceMeters = sourceOnObject.maximumDistanceMeters;
  } else {
    return null;
  }

  const properties = feature.properties ?? {};
  const binding = {
    sourceId: String(properties.sourceId ?? feature.id ?? ''),
    dsfRemoval: dsfSelector(properties.dsfRemoval),
    sourceFeatureId: properties.sourceFeatureId || undefined,
    sourceType: properties.sourceType || undefined,
    rangeStartMeters,
    rangeEndMeters,
    sourceParentLengthMeters: totalLength,
    lightCode: Number.isInteger(properties.lightCode) ? properties.lightCode : undefined,
    sourceRunIndex: Number.isInteger(properties.sourceRunIndex)
      ? properties.sourceRunIndex
      : undefined,
  };
  return {
    feature,
    binding,
    selector: selectorFromBinding(binding),
    maximumDistanceMeters,
    lengthRatioDifference: Math.abs(objectLength / matchedLength - 1),
  };
}

function containedLineMatch(subject, subjectLength, container, toleranceMeters) {
  const first = nearestPointOnLine(subject[0], container);
  const last = nearestPointOnLine(subject.at(-1), container);
  if (
    !first ||
    !last ||
    first.distanceMeters > toleranceMeters ||
    last.distanceMeters > toleranceMeters
  ) {
    return null;
  }
  const containerSlice = sliceLineBetween(container, first, last);
  const containerSliceLength = lineLengthMeters(containerSlice);
  if (containerSliceLength < MIN_MATCHED_LENGTH_METERS) return null;
  const lengthRatioDifference = Math.abs(subjectLength / containerSliceLength - 1);
  if (lengthRatioDifference > MAX_LENGTH_RATIO_DIFFERENCE) return null;
  const maximumDistanceMeters = Math.max(
    maximumDistance(subject, container),
    maximumDistance(containerSlice, subject)
  );
  if (maximumDistanceMeters > toleranceMeters) return null;
  return {
    first,
    last,
    containerSliceLength,
    maximumDistanceMeters,
  };
}

function nearestPointOnExtendedLine(coordinate, sourceCoordinates) {
  const candidates = [nearestPointOnLine(coordinate, sourceCoordinates)].filter(Boolean);
  const startRay = endpointRayProjection(
    coordinate,
    sourceCoordinates[0],
    sourceCoordinates[1],
    0,
    (fraction) => fraction <= 0
  );
  if (startRay) candidates.push(startRay);
  const finalSegmentStart = sourceCoordinates.at(-2);
  const finalSegmentEnd = sourceCoordinates.at(-1);
  const finalSegmentLength = lineLengthMeters([finalSegmentStart, finalSegmentEnd]);
  const endRay = endpointRayProjection(
    coordinate,
    finalSegmentStart,
    finalSegmentEnd,
    lineLengthMeters(sourceCoordinates) - finalSegmentLength,
    (fraction) => fraction >= 1
  );
  if (endRay) candidates.push(endRay);
  return candidates.reduce(
    (nearest, candidate) =>
      !nearest || candidate.distanceMeters < nearest.distanceMeters ? candidate : nearest,
    null
  );
}

function endpointRayProjection(
  coordinate,
  startCoordinate,
  endCoordinate,
  distanceBefore,
  accepts
) {
  const referenceLatitude = coordinate?.[1];
  if (!Number.isFinite(referenceLatitude)) return null;
  const point = project(coordinate, referenceLatitude);
  const start = project(startCoordinate, referenceLatitude);
  const end = project(endCoordinate, referenceLatitude);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!(lengthSquared > 0)) return null;
  const fraction = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  if (!accepts(fraction)) return null;
  const projected = { x: start.x + dx * fraction, y: start.y + dy * fraction };
  const segmentLength = Math.sqrt(lengthSquared);
  return {
    coordinate: unproject(projected, referenceLatitude),
    distanceMeters: Math.hypot(point.x - projected.x, point.y - projected.y),
    alongMeters: distanceBefore + segmentLength * fraction,
  };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
