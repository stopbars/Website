import {
  lineLengthMeters,
  nearestPointOnLine,
  sliceLineBetween,
} from './editor-geometry.js';

const DEFAULT_MATCH_TOLERANCE_METERS = 1;
const MIN_MATCHED_LENGTH_METERS = 0.5;
const MAX_LENGTH_RATIO_DIFFERENCE = 0.08;

export function matchSnappedReference(
  coordinates,
  referenceFeatures,
  toleranceMeters = DEFAULT_MATCH_TOLERANCE_METERS
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
      properties.exactness === 'derived'
    ) {
      continue;
    }
    const candidate = matchSourceLine(
      coordinates,
      objectLength,
      feature,
      toleranceMeters
    );
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
    selectors: candidates
      .map((candidate) => candidate.selector)
      .filter(Boolean),
  };
}

export function referenceMatchFromProjections(feature, first, last) {
  const properties = feature?.properties ?? {};
  const totalLength = lineLengthMeters(feature?.geometry?.coordinates);
  const binding = {
    sourceId: String(properties.sourceId ?? feature?.id ?? ''),
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

export function selectorKey(selector) {
  if (
    !selector?.feature ||
    !Number.isInteger(selector.code) ||
    !Number.isInteger(selector.run)
  ) {
    return '';
  }
  return `${selector.feature}:${selector.code}:${selector.run}`;
}

export function bindingSelectorKey(binding) {
  return selectorKey({
    feature: binding?.sourceFeatureId,
    code: binding?.lightCode,
    run: binding?.sourceRunIndex,
  });
}

export function selectorFromBinding(binding) {
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
    rangeStartMeters = Math.min(
      objectOnSource.first.alongMeters,
      objectOnSource.last.alongMeters
    );
    rangeEndMeters = Math.max(
      objectOnSource.first.alongMeters,
      objectOnSource.last.alongMeters
    );
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
