/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-flatmap-filter -- Normalization and validation are deliberately separate document-boundary stages. */

import {
  findDescendants,
  localName,
  parseXml,
  walkNodes,
} from '../draft-generator/extractor/xml.js';
import { nearestPointOnGeometry } from './editor-geometry.js';
import { deduplicateExactDivisionPoints } from '../../utils/divisionPoints.js';

export const EDITOR_DOCUMENT_VERSION = 1;
export const EDITOR_STORAGE_VERSION = 'bars-contribution-editor/v1';

const VALID_SIMULATORS = new Set(['msfs', 'xplane']);

export function createEditorDocument({
  icao,
  simulator,
  altitude = 0,
  draftGeojson,
  draftXml = '',
  source,
}) {
  const parsed = draftXml ? parseDraftXml(draftXml) : null;
  const hasDraftGeojson = Array.isArray(draftGeojson?.features);
  const featureObjects = objectsFromDraftGeojson(draftGeojson);
  const originalDivisions = originalDivisionsFromDraftGeojson(draftGeojson);
  const geojsonRemovals = removalsFromDraftGeojson(draftGeojson);
  const objects = hasDraftGeojson ? featureObjects : (parsed?.objects ?? []);

  return normalizeDocument({
    version: EDITOR_DOCUMENT_VERSION,
    icao,
    simulator: parsed?.simulator || simulator,
    altitude: parsed?.altitude ?? altitude,
    objects,
    originalDivisions,
    removals: geojsonRemovals.length > 0 ? geojsonRemovals : (parsed?.removals ?? []),
    xplaneRemovals: parsed?.xplaneRemovals ?? [],
    source: source ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    testedHash: null,
  });
}

export function parseDraftXml(xmlText) {
  const source = String(xmlText ?? '');
  const parsed = parseXml(source, 'draft.xml');
  const documentNode = parsed.root.children.find((node) => localName(node.name) === 'fsdata');
  if (!documentNode) throw new Error('This file does not contain an FSData draft.');

  const simulator =
    String(documentNode.attributes.simulator ?? '').toLowerCase() === 'xplane' ? 'xplane' : 'msfs';
  const objects = [];
  const removals = [];
  let altitude = 0;

  walkNodes(documentNode, (node) => {
    if (localName(node.name) !== 'polygon') return;
    const vertices = findDescendants(node, (child) => localName(child.name) === 'vertex')
      .map((vertex) => [Number(vertex.attributes.lon), Number(vertex.attributes.lat)])
      .filter(validCoordinate);
    if (vertices.length < 2) return;

    const displayName = String(node.attributes.displayName ?? '').trim();
    altitude = finiteNumber(node.attributes.altitude, altitude);
    if (displayName.toLowerCase() === 'remove') {
      removals.push({
        id: `remove:${removals.length + 1}`,
        coordinates: closeRing(vertices),
      });
      return;
    }

    objects.push(
      normalizeObject(
        {
          id: displayName || `object:${objects.length + 1}`,
          groupId: `xml:${displayName || `object:${objects.length + 1}`}`,
          name: displayName || `Object ${objects.length + 1}`,
          type: 'unknown',
          status: 'matched',
          coordinates: stripClosingVertex(vertices),
          sourceBindings: [],
        },
        objects.length
      )
    );
  });

  const xplaneRemovals = [];
  walkNodes(documentNode, (node) => {
    if (localName(node.name) !== 'light') return;
    const feature = String(node.attributes.feature ?? '');
    const code = Number(node.attributes.code);
    const run = Number(node.attributes.run);
    const start = Number(node.attributes.start);
    const end = Number(node.attributes.end);
    if (
      !feature ||
      !Number.isInteger(code) ||
      !Number.isInteger(run) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      return;
    }
    xplaneRemovals.push({ feature, code, run, start, end });
  });

  return {
    simulator,
    altitude,
    objects,
    removals,
    xplaneRemovals,
    warnings: parsed.warnings,
  };
}

export function serializeDraftXml(document) {
  const normalized = normalizeDocument(document);
  const polygons = [];
  let groupIndex = 1;

  for (const object of normalized.objects) {
    if (object.coordinates.length < 2) continue;
    polygons.push(
      polygonXml({
        displayName: object.id,
        groupIndex,
        altitude: normalized.altitude,
        coordinates: object.coordinates,
        guidSeed: `${normalized.icao}:${object.id}:${coordinateFingerprint(object.coordinates)}`,
      })
    );
    groupIndex += 1;
  }

  for (const removal of normalized.removals) {
    if (removal.coordinates.length < 3) continue;
    polygons.push(
      polygonXml({
        displayName: 'remove',
        groupIndex,
        altitude: normalized.altitude,
        coordinates: stripClosingVertex(removal.coordinates),
        guidSeed: `${normalized.icao}:remove:${removal.id}`,
      })
    );
    groupIndex += 1;
  }

  const rootAttributes =
    normalized.simulator === 'xplane'
      ? 'version="9.0" simulator="xplane" xplaneRemovalVersion="1"'
      : 'version="9.0"';
  const selectorXml =
    normalized.simulator === 'xplane' && normalized.xplaneRemovals.length > 0
      ? `\n\t<XPlaneRemovals version="1">\n${normalized.xplaneRemovals
          .map(
            (selector) =>
              `\t\t<Light feature="${escapeXml(selector.feature)}" code="${selector.code}" run="${selector.run}" start="${selector.start.toFixed(6)}" end="${selector.end.toFixed(6)}"/>`
          )
          .join('\n')}\n\t</XPlaneRemovals>`
      : '';
  return `<?xml version="1.0"?>\n<FSData ${rootAttributes}>\n${polygons.join('\n')}${selectorXml}\n</FSData>`;
}

export function normalizeDocument(document) {
  const simulator = VALID_SIMULATORS.has(document?.simulator) ? document.simulator : 'msfs';
  const objects = (document?.objects ?? [])
    .map(normalizeObject)
    .filter((object) => object.status !== 'unmatched');
  return {
    version: EDITOR_DOCUMENT_VERSION,
    icao: String(document?.icao ?? '')
      .trim()
      .toUpperCase(),
    simulator,
    altitude: finiteNumber(document?.altitude, 0),
    objects,
    originalDivisions: (document?.originalDivisions ?? [])
      .map(normalizeOriginalDivision)
      .filter(Boolean),
    removals: (document?.removals ?? [])
      .map((removal, index) => ({
        id: String(removal?.id ?? `remove:${index + 1}`),
        coordinates: closeRing((removal?.coordinates ?? []).filter(validCoordinate)),
        sourceIds: normalizeStringList(removal?.sourceIds),
        origin: String(removal?.origin ?? 'imported'),
        mustKeepZoneIds: normalizeStringList(removal?.mustKeepZoneIds),
        selections: normalizeRemovalSelections(removal?.selections),
      }))
      .filter((removal) => removal.coordinates.length >= 4),
    xplaneRemovals: normalizeXPlaneRemovals(document?.xplaneRemovals),
    source: document?.source ?? null,
    createdAt: document?.createdAt || new Date().toISOString(),
    updatedAt: document?.updatedAt || new Date().toISOString(),
    testedHash: document?.testedHash ?? null,
  };
}

export function editorDocumentToGeojson(document) {
  const normalized = normalizeDocument(document);
  return {
    type: 'FeatureCollection',
    features: [
      ...normalized.removals.map((removal) => ({
        type: 'Feature',
        id: removal.id,
        geometry: { type: 'Polygon', coordinates: [removal.coordinates] },
        properties: {
          featureType: 'editor-removal',
          editorId: removal.id,
          sourceIds: removal.sourceIds,
          origin: removal.origin,
        },
      })),
      ...normalized.objects.map((object) => ({
        type: 'Feature',
        id: object.partId,
        geometry:
          object.coordinates.length === 1
            ? { type: 'Point', coordinates: object.coordinates[0] }
            : { type: 'LineString', coordinates: object.coordinates },
        properties: {
          featureType: 'editor-object',
          editorId: object.partId,
          barsObjectId: object.id,
          title: object.name,
          divisionType: object.type,
          status: object.status,
          color: object.color,
          matchPercent: object.matchPercent,
        },
      })),
    ],
  };
}

export function originalDivisionsToGeojson(document) {
  const normalized = normalizeDocument(document);
  const linkedDivisionColors = new Map();
  const objectColors = new Map();
  for (const object of normalized.objects) {
    const linkedDivisionId = divisionIdFromGroupId(object.groupId);
    if (linkedDivisionId && !linkedDivisionColors.has(linkedDivisionId)) {
      linkedDivisionColors.set(linkedDivisionId, object.color);
    }
    if (!objectColors.has(object.id)) objectColors.set(object.id, object.color);
  }
  return {
    type: 'FeatureCollection',
    features: normalized.originalDivisions.map((division) => ({
      type: 'Feature',
      id: `original:${division.id}`,
      geometry: division.geometry,
      properties: {
        featureType: 'original-division',
        divisionId: division.id,
        title: division.name,
        divisionType: division.type,
        color:
          linkedDivisionColors.get(division.id) ??
          objectColors.get(division.id) ??
          colorForObjectId(division.id),
      },
    })),
  };
}

function divisionIdFromGroupId(groupId) {
  const value = String(groupId ?? '');
  return value.startsWith('division:') ? value.slice('division:'.length) : '';
}

export function originalDivisionsFromPoints(points) {
  const divisions = [];
  const seen = new Set();
  for (const point of deduplicateExactDivisionPoints(points)) {
    const id = String(point?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    const rawCoordinates = Array.isArray(point?.coordinates)
      ? point.coordinates
      : point?.coordinates
        ? [point.coordinates]
        : [];
    const coordinates = [];
    for (const coordinate of rawCoordinates) {
      if (Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng)) {
        coordinates.push([Number(coordinate.lng), Number(coordinate.lat)]);
      }
    }
    const geometry =
      coordinates.length === 1
        ? { type: 'Point', coordinates: coordinates[0] }
        : coordinates.length >= 2
          ? { type: 'LineString', coordinates }
          : null;
    const division = normalizeOriginalDivision({
      id,
      name: point?.name || id,
      type: point?.type || 'unknown',
      geometry,
    });
    if (!division) continue;
    seen.add(id);
    divisions.push(division);
  }
  return divisions;
}

export function barsIdSuggestions(originalDivisions, query, limit = 6, options = {}) {
  const normalizedQuery = String(query ?? '')
    .trim()
    .toUpperCase();
  const coordinate = Array.isArray(options.coordinate) ? options.coordinate : null;
  const excludedIds = new Set(
    [...(options.excludeIds ?? [])].map((id) => String(id).trim().toUpperCase()).filter(Boolean)
  );
  const ranked = [];
  const seen = new Set();
  for (const division of originalDivisions ?? []) {
    const id = String(division?.id ?? '').trim();
    if (!id) continue;
    const key = id.toUpperCase();
    if (seen.has(key)) continue;
    if (!normalizedQuery && excludedIds.has(key)) continue;
    seen.add(key);
    const name = String(division?.name ?? id);
    const normalizedName = name.toUpperCase();
    let score = 0;
    if (normalizedQuery) {
      if (key.startsWith(normalizedQuery)) score = 0;
      else if (key.includes(normalizedQuery)) score = 1;
      else if (normalizedName.startsWith(normalizedQuery)) score = 2;
      else if (normalizedName.includes(normalizedQuery)) score = 3;
      else continue;
    }
    const proximity = coordinate
      ? (nearestPointOnGeometry(coordinate, division.geometry)?.distanceMeters ?? Infinity)
      : Infinity;
    ranked.push({ id, name, score, proximity });
  }
  return ranked
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.proximity - right.proximity ||
        left.id.localeCompare(right.id, undefined, { sensitivity: 'base' })
    )
    .slice(0, Math.max(0, limit))
    .map(({ id, name }) => ({ id, name }));
}

export function colorForObjectId(value) {
  const palette = ['#22d3ee', '#f97316', '#a78bfa', '#4ade80', '#fb7185', '#facc15'];
  let hash = 0;
  for (const character of String(value ?? '')) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  return palette[Math.abs(hash) % palette.length];
}

export async function draftHash(documentOrXml) {
  const text = typeof documentOrXml === 'string' ? documentOrXml : serializeDraftXml(documentOrXml);
  const bytes = new TextEncoder().encode(text.replace(/\r\n/g, '\n').trim());
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  return fallbackHash(bytes);
}

function objectsFromDraftGeojson(geojson) {
  const objects = [];
  for (const feature of geojson?.features ?? []) {
    const properties = feature.properties ?? {};
    if (!['matched', 'unsafe', 'unmatched'].includes(properties.featureType)) continue;
    const coordinates =
      feature.geometry?.type === 'Point'
        ? [feature.geometry.coordinates]
        : feature.geometry?.type === 'LineString'
          ? feature.geometry.coordinates
          : [];
    if (!coordinates.every(validCoordinate) || coordinates.length === 0) continue;
    const sourceBindings = sourceBindingsFromProperties(properties);
    if (sourceBindings.length === 0) continue;
    const divisionId = properties.divisionId || `object:${objects.length + 1}`;
    objects.push(
      normalizeObject(
        {
          id: divisionId,
          groupId: `division:${divisionId}`,
          name: properties.title || properties.divisionId || `Object ${objects.length + 1}`,
          type: properties.divisionType || 'unknown',
          status: properties.featureType,
          coordinates,
          color: properties.debugColor,
          matchPercent: properties.matchPercent,
          reason: properties.reason,
          sourceBindings,
        },
        objects.length
      )
    );
  }
  return objects;
}

function removalsFromDraftGeojson(geojson) {
  const removals = [];
  for (const feature of geojson?.features ?? []) {
    if (feature.properties?.featureType !== 'removal' || feature.geometry?.type !== 'Polygon') {
      continue;
    }
    removals.push({
      id: `remove:${removals.length + 1}`,
      coordinates: feature.geometry.coordinates?.[0] ?? [],
      sourceIds: feature.properties?.sourceIds ?? [],
      origin: feature.properties?.origin ?? 'msfs-source',
      mustKeepZoneIds: feature.properties?.mustKeepZoneIds ?? [],
      selections: feature.properties?.selections ?? [],
    });
  }
  return removals;
}

function normalizeRemovalSelections(selections) {
  return (selections ?? []).flatMap((selection) => {
    const sourceId = String(selection?.sourceId ?? '').trim();
    if (!sourceId) return [];
    const start = Number(selection?.rangeStartMeters);
    const end = Number(selection?.rangeEndMeters);
    return [
      Number.isFinite(start) && Number.isFinite(end)
        ? {
            sourceId,
            rangeStartMeters: Math.min(start, end),
            rangeEndMeters: Math.max(start, end),
          }
        : { sourceId },
    ];
  });
}

function sourceBindingsFromProperties(properties) {
  if (!properties.sourceRowId && !properties.sourceFeatureId) return [];
  return [
    {
      sourceId: String(properties.sourceRowId || properties.sourceFeatureId),
      sourceFeatureId: properties.sourceFeatureId || undefined,
      sourceType: properties.sourceType || undefined,
      rangeStartMeters: finiteOptionalNumber(properties.sourceRangeStartMeters),
      rangeEndMeters: finiteOptionalNumber(properties.sourceRangeEndMeters),
    },
  ];
}

function originalDivisionsFromDraftGeojson(geojson) {
  const divisions = [];
  const seen = new Set();
  for (const feature of geojson?.features ?? []) {
    const properties = feature.properties ?? {};
    if (properties.featureType !== 'original-division') continue;
    const id = String(properties.divisionId ?? '').trim();
    if (!id || seen.has(id)) continue;
    const division = normalizeOriginalDivision({
      id,
      name: properties.title || id,
      type: properties.divisionType || 'unknown',
      geometry: feature.geometry,
    });
    if (!division) continue;
    seen.add(id);
    divisions.push(division);
  }
  return divisions;
}

function normalizeOriginalDivision(division) {
  const id = String(division?.id ?? '').trim();
  const geometry = division?.geometry;
  if (!id || !geometry) return null;
  if (geometry.type === 'Point' && validCoordinate(geometry.coordinates)) {
    return {
      id,
      name: String(division?.name ?? id),
      type: String(division?.type ?? 'unknown'),
      geometry: {
        type: 'Point',
        coordinates: geometry.coordinates.map(Number),
      },
    };
  }
  if (
    geometry.type === 'LineString' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2 &&
    geometry.coordinates.every(validCoordinate)
  ) {
    return {
      id,
      name: String(division?.name ?? id),
      type: String(division?.type ?? 'unknown'),
      geometry: {
        type: 'LineString',
        coordinates: geometry.coordinates.map(([lon, lat]) => [Number(lon), Number(lat)]),
      },
    };
  }
  return null;
}

function normalizeObject(object, index = 0) {
  const id = String(object?.id ?? `object:${index + 1}`);
  const partId = String(object?.partId ?? `${id}:part:${index + 1}`);
  return {
    id,
    partId,
    groupId: String(object?.groupId ?? partId),
    name: String(object?.name ?? id),
    type: String(object?.type ?? 'unknown'),
    status: String(object?.status ?? 'matched'),
    coordinates: (object?.coordinates ?? [])
      .filter(validCoordinate)
      .map(([lon, lat]) => [Number(lon), Number(lat)]),
    color: colorForObjectId(id),
    matchPercent: finiteOptionalNumber(object?.matchPercent),
    reason: object?.reason ? String(object.reason) : '',
    sourceBindings: Array.isArray(object?.sourceBindings) ? object.sourceBindings : [],
  };
}

function normalizeXPlaneRemovals(selectors) {
  return (selectors ?? [])
    .map((selector) => ({
      feature: String(selector?.feature ?? ''),
      code: Number(selector?.code),
      run: Number(selector?.run),
      start: Number(selector?.start),
      end: Number(selector?.end),
    }))
    .filter(
      (selector) =>
        selector.feature &&
        Number.isInteger(selector.code) &&
        Number.isInteger(selector.run) &&
        Number.isFinite(selector.start) &&
        Number.isFinite(selector.end)
    );
}

function polygonXml({ displayName, groupIndex, altitude, coordinates, guidSeed }) {
  const vertices = coordinates
    .filter(validCoordinate)
    .map(([lon, lat]) => `\t\t<Vertex lat="${lat.toFixed(14)}" lon="${lon.toFixed(14)}"/>`)
    .join('\n');
  return `\t<Polygon version="0.4.0" displayName="${escapeXml(displayName)}" groupIndex="${groupIndex}" altitude="${altitude.toFixed(11)}">
\t\t<Attribute name="UniqueGUID" guid="{359C73E8-06BE-4FB2-ABCB-EC942F7761D0}" type="GUID" value="{${guidForSeed(guidSeed)}}"/>
${vertices}
\t</Polygon>`;
}

function guidForSeed(seed) {
  const words = [2166136261, 2246822507, 3266489909, 668265263];
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      words[wordIndex] ^= code + wordIndex * 31;
      words[wordIndex] = Math.imul(words[wordIndex], 16777619 + wordIndex * 2) >>> 0;
    }
  }
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

function coordinateFingerprint(coordinates) {
  return coordinates.map(([lon, lat]) => `${lon.toFixed(8)},${lat.toFixed(8)}`).join('|');
}

function fallbackHash(bytes) {
  let first = 2166136261;
  let second = 2246822507;
  for (const byte of bytes) {
    first = Math.imul(first ^ byte, 16777619) >>> 0;
    second = Math.imul(second ^ byte, 3266489917) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

function closeRing(coordinates) {
  if (coordinates.length < 3) return coordinates;
  const first = coordinates[0];
  const last = coordinates.at(-1);
  return sameCoordinate(first, last) ? coordinates : [...coordinates, [...first]];
}

function stripClosingVertex(coordinates) {
  if (coordinates.length > 2 && sameCoordinate(coordinates[0], coordinates.at(-1))) {
    return coordinates.slice(0, -1);
  }
  return coordinates;
}

function sameCoordinate(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
}

function validCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(Number(value[0])) &&
    Number.isFinite(Number(value[1])) &&
    Math.abs(Number(value[0])) <= 180 &&
    Math.abs(Number(value[1])) <= 90
  );
}

function normalizeStringList(values) {
  const normalized = new Set();
  for (const value of values ?? []) {
    const text = String(value);
    if (text) normalized.add(text);
  }
  return [...normalized];
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
