import { computeDestinationPoint } from 'geolib';

export function calculateRectangleCorners(centerLat, centerLng, widthMeters, lengthMeters, heading) {
  if (![centerLat, centerLng, widthMeters, lengthMeters, heading].every(Number.isFinite) ||
      widthMeters <= 0 || lengthMeters <= 0) return [];
  const center = { latitude: centerLat, longitude: centerLng };
  const halfWidth = widthMeters / 2;
  const halfLength = lengthMeters / 2;
  const distance = Math.hypot(halfLength, halfWidth);
  const cornerAngle = Math.atan2(halfWidth, halfLength) * 180 / Math.PI;
  const corners = [180 + cornerAngle, 180 - cornerAngle, cornerAngle, -cornerAngle].map((angle) => {
    const point = computeDestinationPoint(center, distance, ((heading + angle) % 360 + 360) % 360);
    return [point.longitude, point.latitude];
  });
  return [...corners, corners[0]];
}
