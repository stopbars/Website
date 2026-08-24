/* oxlint-disable react-doctor/js-cache-property-access react-doctor/js-combine-iterations -- Texture geometry keeps coordinate reads and validation stages explicit for rendering diagnostics. */

import earcut from 'earcut';
import {
  xPlaneLinePhysicalWidth,
  xPlaneLineRepeatMeters,
} from './scenery-texture.js';

const METERS_PER_LATITUDE_DEGREE = 111_320;
const MINIMUM_LINE_WIDTH_METERS = 0.03;
const DEFAULT_LINE_WIDTH_METERS = 0.25;
const DEFAULT_LINE_REPEAT_METERS = 8;
const MAX_TEXTURE_REPEATS_PER_SEGMENT = 32;

export function buildXPlaneTextureGeometry(features) {
  const groups = new Map();
  for (const [sequence, feature] of (features ?? []).entries()) {
    const pattern =
      feature.geometry?.type === 'LineString'
        ? feature.properties?.renderPattern || feature.properties?.texturePattern
        : feature.properties?.texturePattern || feature.properties?.renderPattern;
    if (!pattern) continue;
    const vertices =
      feature.geometry?.type === 'LineString'
        ? buildLineTextureTriangles(feature)
        : ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
          ? buildPolygonTextureTriangles(feature)
          : [];
    if (vertices.length === 0) continue;
    const lineTexture = feature.geometry?.type === 'LineString';
    const markingTexture =
      lineTexture ||
      String(feature.properties?.layerGroup ?? '')
        .trim()
        .toLowerCase()
        .split(/\s+/)[0] === 'markings';
    const layerOrder = xplaneLayerOrder(feature.properties?.layerGroup, {
      lineTexture,
    });
    const renderPass = xplaneTextureRenderPass(feature.properties?.layerGroup);
    const groupKey = `${renderPass}:${layerOrder}:${lineTexture ? 'line' : 'polygon'}:${pattern}`;
    const group = groups.get(groupKey) ?? {
      id: groupKey,
      pattern,
      vertices: [],
      wrap: feature.properties?.textureWrap !== false,
      lineTexture,
      markingTexture,
      layerOrder,
      renderPass,
      sequence,
    };
    group.vertices.push(...vertices);
    groups.set(groupKey, group);
  }
  return [...groups.values()].sort(
    (left, right) => left.layerOrder - right.layerOrder || left.sequence - right.sequence
  );
}

export function xplaneTextureRenderPass(value) {
  const layerGroup = String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)[0];
  return ['terrain', 'airports', 'beaches'].includes(layerGroup) ? 'terrain' : 'overlay';
}

const XPLANE_LAYER_GROUP_ORDER = new Map([
  ['terrain', 0],
  ['beaches', 1_000],
  ['shoulders', 2_000],
  ['unpaved_taxiways', 2_500],
  ['taxiways', 3_000],
  ['unpaved_runways', 3_500],
  ['runways', 4_000],
  ['markings', 5_000],
  ['roads', 6_000],
  ['objects', 7_000],
  ['lights', 8_000],
]);

export function xplaneLayerOrder(value, { lineTexture = false } = {}) {
  const fields = String(value ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const base = XPLANE_LAYER_GROUP_ORDER.get(fields[0]) ?? (lineTexture ? 5_000 : 0);
  const offset = Number(fields[1]);
  return base + (Number.isFinite(offset) ? offset : 0);
}

export function buildLineTextureTriangles(feature) {
  const coordinates = distinctCoordinates(feature.geometry?.coordinates);
  if (coordinates.length < 2) return [];
  const properties = feature.properties ?? {};
  const widthMeters = Math.max(
    MINIMUM_LINE_WIDTH_METERS,
    xPlaneLinePhysicalWidth(properties, DEFAULT_LINE_WIDTH_METERS)
  );
  const repeatMeters = xPlaneLineRepeatMeters(properties, DEFAULT_LINE_REPEAT_METERS);
  const referenceLatitude =
    coordinates.reduce((total, coordinate) => total + coordinate[1], 0) / coordinates.length;
  const metersPerLongitude = longitudeMeters(referenceLatitude);
  const local = subdivideLongTextureSegments(
    coordinates.map(([lon, lat]) => ({
      x: lon * metersPerLongitude,
      y: lat * METERS_PER_LATITUDE_DEGREE,
    })),
    repeatMeters * MAX_TEXTURE_REPEATS_PER_SEGMENT
  );
  const cumulative = [0];
  const segmentNormals = [];
  for (let index = 1; index < local.length; index += 1) {
    const dx = local[index].x - local[index - 1].x;
    const dy = local[index].y - local[index - 1].y;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) return [];
    cumulative.push(cumulative.at(-1) + length);
    segmentNormals.push({ x: -dy / length, y: dx / length });
  }
  const alignedRepeatMeters = alignedLineRepeatMeters(
    cumulative.at(-1),
    repeatMeters,
    properties.alignSegments
  );
  const halfWidth = widthMeters / 2;
  const sides = local.map((point, index) => {
    const previous = segmentNormals[Math.max(0, index - 1)];
    const next = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    const normal =
      index === 0
        ? next
        : index === local.length - 1
          ? previous
          : normalized({ x: previous.x + next.x, y: previous.y + next.y });
    const denominator = Math.max(0.35, Math.abs(normal.x * next.x + normal.y * next.y));
    const miter = Math.min(halfWidth * 2.5, halfWidth / denominator);
    return {
      left: localToCoordinate(
        { x: point.x + normal.x * miter, y: point.y + normal.y * miter },
        metersPerLongitude
      ),
      right: localToCoordinate(
        { x: point.x - normal.x * miter, y: point.y - normal.y * miter },
        metersPerLongitude
      ),
    };
  });

  const output = [];
  for (let index = 0; index < sides.length - 1; index += 1) {
    const absoluteStartU = cumulative[index] / alignedRepeatMeters;
    const textureCycleBase = Math.floor(absoluteStartU);
    const startU = absoluteStartU - textureCycleBase;
    const endU = cumulative[index + 1] / alignedRepeatMeters - textureCycleBase;
    appendTexturedTriangle(
      output,
      sides[index].left,
      startU,
      0,
      sides[index].right,
      startU,
      1,
      sides[index + 1].left,
      endU,
      0
    );
    appendTexturedTriangle(
      output,
      sides[index].right,
      startU,
      1,
      sides[index + 1].right,
      endU,
      1,
      sides[index + 1].left,
      endU,
      0
    );
  }
  return output;
}

function alignedLineRepeatMeters(totalLength, repeatMeters, alignSegments) {
  const segments = Math.floor(Number(alignSegments));
  if (!(segments > 0) || !(totalLength > 0)) return repeatMeters;
  const nominalSegmentLength = repeatMeters / segments;
  const fittedSegments = Math.max(1, Math.round(totalLength / nominalSegmentLength));
  return (totalLength / fittedSegments) * segments;
}

function subdivideLongTextureSegments(points, maximumLength) {
  if (points.length < 2 || !(maximumLength > 0)) return points;
  const output = [points[0]];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const divisions = Math.max(1, Math.ceil(length / maximumLength));
    for (let division = 1; division <= divisions; division += 1) {
      const fraction = division / divisions;
      output.push({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
      });
    }
  }
  return output;
}

export function buildPolygonTextureTriangles(feature) {
  const geometry = feature.geometry;
  const polygons =
    geometry?.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
  if (polygons.length === 0) return [];
  const explicitUv = explicitUvLookup(feature.properties?.explicitTextureWindings);
  const output = [];
  for (const polygon of polygons) {
    const rings = polygon.map(openRing).filter((ring) => ring.length >= 3);
    if (rings.length === 0) continue;
    const flatPositions = [];
    const flatTexture = [];
    const holes = [];
    const referenceLatitude =
      rings[0].reduce((total, coordinate) => total + coordinate[1], 0) / rings[0].length;
    const metersPerLongitude = longitudeMeters(referenceLatitude);
    const origin = rings[0][0];
    const rotation =
      ((Number(feature.properties?.dsfPolygonParameter ?? feature.properties?.textureHeading) ||
        0) *
        Math.PI) /
      180;
    const scaleX = positiveNumber(feature.properties?.textureScaleX) || 1;
    const scaleY = positiveNumber(feature.properties?.textureScaleY) || scaleX;
    let vertexCount = 0;
    for (const [ringIndex, ring] of rings.entries()) {
      if (ringIndex > 0) holes.push(vertexCount);
      for (const coordinate of ring) {
        flatPositions.push(coordinate[0], coordinate[1]);
        const explicit = explicitUv.get(coordinateKey(coordinate));
        if (explicit) {
          flatTexture.push(explicit[0], explicit[1]);
        } else {
          const x = (coordinate[0] - origin[0]) * metersPerLongitude;
          const y = (coordinate[1] - origin[1]) * METERS_PER_LATITUDE_DEGREE;
          flatTexture.push(
            (x * Math.cos(rotation) + y * Math.sin(rotation)) / scaleX,
            (-x * Math.sin(rotation) + y * Math.cos(rotation)) / scaleY
          );
        }
        vertexCount += 1;
      }
    }
    for (const index of earcut(flatPositions, holes, 2)) {
      output.push(
        flatPositions[index * 2],
        flatPositions[index * 2 + 1],
        flatTexture[index * 2],
        flatTexture[index * 2 + 1]
      );
    }
  }
  return output;
}

function explicitUvLookup(windings) {
  const lookup = new Map();
  for (const winding of windings ?? []) {
    for (const vertex of winding ?? []) {
      if (vertex.length < 4) continue;
      lookup.set(coordinateKey(vertex), [Number(vertex[2]), Number(vertex[3])]);
    }
  }
  return lookup;
}

function appendTexturedTriangle(output, ...values) {
  for (let index = 0; index < values.length; index += 3) {
    const coordinate = values[index];
    output.push(coordinate[0], coordinate[1], values[index + 1], values[index + 2]);
  }
}

function distinctCoordinates(coordinates) {
  const output = [];
  for (const coordinate of coordinates ?? []) {
    if (!validCoordinate(coordinate)) continue;
    const previous = output.at(-1);
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      output.push([Number(coordinate[0]), Number(coordinate[1])]);
    }
  }
  return output;
}

function openRing(ring) {
  const coordinates = distinctCoordinates(ring);
  if (
    coordinates.length > 1 &&
    coordinates[0][0] === coordinates.at(-1)[0] &&
    coordinates[0][1] === coordinates.at(-1)[1]
  ) {
    coordinates.pop();
  }
  return coordinates;
}

function localToCoordinate(point, metersPerLongitude) {
  return [point.x / metersPerLongitude, point.y / METERS_PER_LATITUDE_DEGREE];
}

function normalized(vector) {
  const length = Math.hypot(vector.x, vector.y);
  return length > 0.000001 ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 1 };
}

function longitudeMeters(latitude) {
  return METERS_PER_LATITUDE_DEGREE * Math.cos((latitude * Math.PI) / 180);
}

function coordinateKey(coordinate) {
  return `${Number(coordinate[0]).toFixed(9)}:${Number(coordinate[1]).toFixed(9)}`;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function validCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    Number.isFinite(Number(coordinate[0])) &&
    Number.isFinite(Number(coordinate[1]))
  );
}
