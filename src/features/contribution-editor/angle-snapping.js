import { distanceMeters, project, unproject } from './editor-geometry.js';

const DEFAULT_CAPTURE_DEGREES = 7;
const DEFAULT_RELEASE_DEGREES = 11;
const MIN_SEGMENT_METERS = 1;
const RIGHT_ANGLE = Math.PI / 2;

export function snapDrawAngle(previous, pivot, pointer, activeDirection = null, options = {}) {
  const minimumSegmentMeters = options.minimumSegmentMeters ?? MIN_SEGMENT_METERS;
  const hasIncomingSegment = validCoordinate(previous);
  if (
    (hasIncomingSegment && distanceMeters(previous, pivot) < minimumSegmentMeters) ||
    distanceMeters(pivot, pointer) < minimumSegmentMeters
  ) {
    return { coordinate: pointer, direction: null };
  }

  const referenceLatitude = pivot[1];
  const pivotPoint = project(pivot, referenceLatitude);
  const pointerPoint = project(pointer, referenceLatitude);
  const incomingAngle = hasIncomingSegment
    ? (() => {
        const previousPoint = project(previous, referenceLatitude);
        return Math.atan2(pivotPoint.y - previousPoint.y, pivotPoint.x - previousPoint.x);
      })()
    : 0;
  const pointerAngle = Math.atan2(pointerPoint.y - pivotPoint.y, pointerPoint.x - pivotPoint.x);
  const directions = [
    incomingAngle,
    incomingAngle + RIGHT_ANGLE,
    incomingAngle - RIGHT_ANGLE,
    incomingAngle + Math.PI,
  ];
  const captureRadians = degreesToRadians(options.captureDegrees ?? DEFAULT_CAPTURE_DEGREES);
  const releaseRadians = degreesToRadians(options.releaseDegrees ?? DEFAULT_RELEASE_DEGREES);
  let direction = Number.isInteger(activeDirection) ? activeDirection : null;

  if (
    direction === null ||
    direction < 0 ||
    direction >= directions.length ||
    angleDifference(pointerAngle, directions[direction]) > releaseRadians
  ) {
    direction = nearestDirection(pointerAngle, directions);
    if (angleDifference(pointerAngle, directions[direction]) > captureRadians) {
      return { coordinate: pointer, direction: null };
    }
  }

  const length = Math.hypot(pointerPoint.x - pivotPoint.x, pointerPoint.y - pivotPoint.y);
  const angle = directions[direction];
  return {
    coordinate: unproject(
      {
        x: pivotPoint.x + Math.cos(angle) * length,
        y: pivotPoint.y + Math.sin(angle) * length,
      },
      referenceLatitude
    ),
    direction,
  };
}

function validCoordinate(value) {
  return Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function nearestDirection(angle, directions) {
  let nearest = 0;
  let nearestDifference = Infinity;
  for (let index = 0; index < directions.length; index += 1) {
    const difference = angleDifference(angle, directions[index]);
    if (difference < nearestDifference) {
      nearest = index;
      nearestDifference = difference;
    }
  }
  return nearest;
}

function angleDifference(left, right) {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}
