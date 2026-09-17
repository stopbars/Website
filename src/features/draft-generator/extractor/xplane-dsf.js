/* oxlint-disable react-doctor/js-combine-iterations react-doctor/js-flatmap-filter react-doctor/js-length-check-first -- DSF extraction keeps decoding, validation, and projection stages explicit for scenery diagnostics. */

import { dsfSelector } from '../../contribution-editor/xplane-removal-contract.js';
import { decodeXPlaneDsfBytes } from './xplane-dsf-compression.js';

import { stableId } from './classify.js';
import { haversineDistanceMeters } from './geo.js';

const DSF_COOKIE = 'XPLNEDSF';
const DSF_VERSION = 1;
const DSF_FILE_PATTERN = /(^|\/)[+-]\d{2}[+-]\d{3}\.dsf$/i;
const SEVEN_Z_SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const MAX_AIRPORT_EVIDENCE_DISTANCE_METERS = 20_000;
const CURVE_SAMPLE_METERS = 5;
const MAX_CURVE_SEGMENTS = 64;

const EVIDENCE = Object.freeze({
  DSF_LIGHT_STRING: {
    priority: 2,
    sourceType: 'xplane-dsf-light-string',
    sourceBasis: 'decoded-dsf-object-string',
    removalEligible: true,
  },
  DSF_PAINTED_LINE: {
    priority: 3,
    sourceType: 'xplane-dsf-painted-line',
    sourceBasis: 'decoded-dsf-painted-marking',
    removalEligible: false,
  },
  DSF_LIGHT_OBJECT: {
    priority: 5,
    sourceType: 'xplane-dsf-light-object',
    sourceBasis: 'decoded-dsf-object-placement',
    removalEligible: true,
  },
});

const LIGHT_STRING_CODES = new Map([
  [101, { classification: 'taxi-centerline', label: 'green bidirectional taxiway centreline' }],
  [102, { classification: 'taxi-edge', label: 'blue omnidirectional taxiway edge' }],
  [103, { classification: 'stopbar', label: 'steady amber hold-line' }],
  [104, { classification: 'stopbar', label: 'pulsating amber runway hold-line' }],
  [105, { classification: 'taxi-centerline', label: 'green/amber runway-zone centreline' }],
  [106, { classification: 'airfield-light', label: 'red critical-zone edge' }],
  [107, { classification: 'lead-on', label: 'unidirectional green runway lead-off' }],
  [108, { classification: 'lead-on', label: 'green/amber runway-zone lead-off' }],
]);

const MARKING_CODES = new Map([
  [1, { classification: 'taxi-centerline', label: 'solid taxiway centreline' }],
  [2, { classification: 'painted-marking', label: 'broken yellow boundary' }],
  [3, { classification: 'painted-marking', label: 'double solid taxiway edge' }],
  [4, { classification: 'stopbar', label: 'runway hold-position marking' }],
  [5, { classification: 'stopbar', label: 'other hold-position marking' }],
  [6, { classification: 'stopbar', label: 'ILS hold-position marking' }],
  [7, { classification: 'taxi-centerline', label: 'runway-safety-zone centreline' }],
  [8, { classification: 'painted-marking', label: 'aircraft queue lane' }],
  [9, { classification: 'painted-marking', label: 'double aircraft queue lane' }],
  [10, { classification: 'taxi-centerline', label: 'wide taxiway centreline' }],
  [11, { classification: 'taxi-centerline', label: 'wide runway-safety-zone centreline' }],
  [12, { classification: 'stopbar', label: 'wide runway hold-position marking' }],
  [13, { classification: 'stopbar', label: 'wide other hold-position marking' }],
  [14, { classification: 'stopbar', label: 'wide ILS hold-position marking' }],
  [19, { classification: 'painted-marking', label: 'taxiway shoulder bars' }],
  [20, { classification: 'painted-marking', label: 'solid white roadway edge' }],
  [21, { classification: 'painted-marking', label: 'white roadway checkerboard' }],
  [22, { classification: 'painted-marking', label: 'broken white roadway centreline' }],
  [23, { classification: 'painted-marking', label: 'short broken white roadway edge' }],
  [24, { classification: 'painted-marking', label: 'wide solid white roadway edge' }],
  [25, { classification: 'painted-marking', label: 'wide broken white roadway centreline' }],
  [30, { classification: 'painted-marking', label: 'solid red line' }],
  [31, { classification: 'painted-marking', label: 'broken red line' }],
  [32, { classification: 'painted-marking', label: 'wide solid red line' }],
  [40, { classification: 'painted-marking', label: 'solid orange line' }],
  [41, { classification: 'painted-marking', label: 'solid blue line' }],
  [42, { classification: 'painted-marking', label: 'solid green line' }],
]);

export function detectXPlaneDsfEntries(entries) {
  return (entries ?? [])
    .filter((entry) => entry?.file && DSF_FILE_PATTERN.test(normalizePath(entry.path)))
    .sort((left, right) => normalizePath(left.path).localeCompare(normalizePath(right.path)));
}

export async function extractXPlaneDsfEvidence({
  entries,
  icao,
  airportPosition,
  onProgress,
  assetResolver,
}) {
  const normalizedIcao = String(icao ?? '')
    .trim()
    .toUpperCase();
  const warnings = [];
  const lightRows = [];
  const instances = [];
  const referenceFeatures = [];
  const allDsfEntries = detectXPlaneDsfEntries(entries);
  const selectedDsfEntries = selectAirportDsfEntries(allDsfEntries, airportPosition);
  const resolver = assetResolver ?? (await createXPlaneAssetResolver(entries));
  let decodedFiles = 0;
  let compressedFiles = 0;
  let ignoredByAirportFilter = 0;
  const unrecognizedPolygonDefinitions = new Set();
  const unrecognizedObjectDefinitions = new Set();
  const polygonAssetCache = new Map();
  const objectAssetCache = new Map();

  for (let fileIndex = 0; fileIndex < selectedDsfEntries.length; fileIndex += 1) {
    const entry = selectedDsfEntries[fileIndex];
    const sourceFile = normalizePath(entry.path);
    onProgress?.({
      file: sourceFile,
      fileIndex,
      fileCount: selectedDsfEntries.length,
      fraction: selectedDsfEntries.length === 0 ? 1 : fileIndex / selectedDsfEntries.length,
    });

    let decoded;
    let sourceSha256;
    let compressedSource = false;
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- DSFs are decoded one at a time to bound browser memory.
      const sourceBytes = await entry.file.arrayBuffer();
      compressedSource = matchesSignature(new Uint8Array(sourceBytes), SEVEN_Z_SIGNATURE);
      sourceSha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', sourceBytes)),
        (byte) => byte.toString(16).padStart(2, '0')
      ).join('');
      decoded = parseXPlaneDsf(await decodeXPlaneDsfBytes(sourceBytes), { sourceFile });
      decodedFiles += 1;
    } catch (error) {
      if (compressedSource || error instanceof XPlaneCompressedDsfError) compressedFiles += 1;
      warnings.push(`${sourceFile}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (const polygon of decoded.polygons) {
      if (!featureBelongsToAirport(polygon, decoded.filterAirportIds, normalizedIcao)) {
        ignoredByAirportFilter += 1;
        continue;
      }
      if (!windingNearAirport(polygon.windings, airportPosition)) continue;

      const definitionPath = decoded.polygonDefinitions[polygon.definition];
      if (!definitionPath) continue;
      let asset = polygonAssetCache.get(definitionPath);
      if (!polygonAssetCache.has(definitionPath)) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop -- Each used definition is resolved once and cached across all DSFs.
        asset = await resolver.describePolygon(definitionPath);
        polygonAssetCache.set(definitionPath, asset);
      }
      if (!asset) {
        unrecognizedPolygonDefinitions.add(definitionPath);
        continue;
      }

      if (asset.kind === 'pol') {
        const sampledWindings = polygon.windings
          .map((winding) =>
            sampleDsfWinding(winding, {
              closed: true,
              textureCoordinates: polygon.parameter === 65_535,
            })
          )
          .filter(
            (vertices) => vertices.length >= 3 && verticesAreCoherent(vertices, airportPosition)
          );
        if (sampledWindings.length === 0) {
          warnings.push(
            `${sourceFile}: ignored malformed ${definitionPath} geometry at command ${polygon.commandOffset}`
          );
          continue;
        }
        const referenceId = stableId(
          sourceFile,
          'dsf-reference',
          polygon.commandOffset,
          definitionPath
        );
        referenceFeatures.push({
          type: 'Feature',
          id: referenceId,
          geometry: dsfPolygonGeometry(sampledWindings),
          properties: {
            ...dsfReferenceProperties({
              referenceId,
              sourceFile,
              definitionPath,
              asset,
              polygon,
            }),
            ...(polygon.parameter === 65_535
              ? { explicitTextureWindings: explicitTextureWindings(sampledWindings) }
              : {}),
          },
        });
        continue;
      }

      for (const [windingIndex, winding] of polygon.windings.entries()) {
        const vertices = sampleDsfWinding(winding, {
          closed: asset.kind === 'pol' || (asset.kind === 'lin' && polygon.parameter === 1),
          textureCoordinates: asset.kind === 'pol' && polygon.parameter === 65_535,
        });
        if (vertices.length < 2 || !verticesAreCoherent(vertices, airportPosition)) {
          warnings.push(
            `${sourceFile}: ignored malformed ${definitionPath} geometry at command ${polygon.commandOffset}`
          );
          continue;
        }
        const referenceId = stableId(
          sourceFile,
          'dsf-reference',
          polygon.commandOffset,
          windingIndex,
          definitionPath
        );
        referenceFeatures.push({
          type: 'Feature',
          id: referenceId,
          geometry:
            asset.kind === 'pol'
              ? {
                  type: 'Polygon',
                  coordinates: [
                    [
                      ...vertices.map((vertex) => [vertex.lon, vertex.lat]),
                      [vertices[0].lon, vertices[0].lat],
                    ],
                  ],
                }
              : {
                  type: 'LineString',
                  coordinates: vertices.map((vertex) => [vertex.lon, vertex.lat]),
                },
          properties: dsfReferenceProperties({
            referenceId,
            sourceFile,
            definitionPath,
            asset,
            polygon,
          }),
        });
        if (asset.isEvidence === false) continue;
        const evidence =
          asset.kind === 'str' ? EVIDENCE.DSF_LIGHT_STRING : EVIDENCE.DSF_PAINTED_LINE;
        const removal =
          asset.kind === 'str' &&
          ['taxi-centerline', 'taxi-edge', 'lead-on', 'stopbar', 'airfield-light'].includes(
            asset.classification
          )
            ? dsfSelector({
                kind: 'dsf-string',
                source: sourceFile.slice(sourceFile.indexOf('Earth nav data/')),
                sha256: sourceSha256,
                definition: definitionPath,
                command: polygon.commandOffset,
                pool: polygon.pool,
                filter: polygon.filterId,
                index: windingIndex,
              })
            : null;
        lightRows.push({
          id: stableId(
            sourceFile,
            'dsf-polygon',
            polygon.commandOffset,
            windingIndex,
            definitionPath
          ),
          sourceFile,
          sourceRecordOffset: polygon.commandOffset,
          sourceDefinition: definitionPath,
          sourceAssetPath: asset.resolvedPath,
          sourceType: evidence.sourceType,
          sourceBasis: evidence.sourceBasis,
          evidencePriority: evidence.priority,
          dsfRemoval: removal,
          removalCapability: removal ? 'whole-string' : 'unsupported',
          removalEligible: Boolean(removal),
          placementOnly: !removal,
          rawTag: asset.kind === 'str' ? 'DSF object string' : 'DSF painted line',
          preset: `dsf-${asset.kind}`,
          vertices,
          classification: asset.classification,
          confidence: asset.confidence,
          classificationReasons: asset.reasons,
          dsfPolygonParameter: polygon.parameter,
          dsfAirportFilter: filterAirportIdForFeature(polygon, decoded.filterAirportIds),
        });
      }
    }

    for (const object of decoded.objects) {
      if (!featureBelongsToAirport(object, decoded.filterAirportIds, normalizedIcao)) {
        ignoredByAirportFilter += 1;
        continue;
      }
      const point = coordinateFromPoolPoint(object.point);
      if (!point || !pointNearAirport(point, airportPosition)) continue;
      const definitionPath = decoded.objectDefinitions[object.definition];
      if (!definitionPath) continue;
      let asset = objectAssetCache.get(definitionPath);
      if (!objectAssetCache.has(definitionPath)) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop -- Each used definition is resolved once and cached across all DSFs.
        asset = await resolver.describeObject(definitionPath);
        objectAssetCache.set(definitionPath, asset);
      }
      if (!asset) {
        unrecognizedObjectDefinitions.add(definitionPath);
        continue;
      }
      const evidence = EVIDENCE.DSF_LIGHT_OBJECT;
      instances.push({
        id: stableId(
          sourceFile,
          'dsf-object',
          object.commandOffset,
          definitionPath,
          point.lat,
          point.lon
        ),
        sourceFile,
        sourceRecordOffset: object.commandOffset,
        sourceDefinition: definitionPath,
        sourceAssetPath: asset.resolvedPath,
        sourceType: evidence.sourceType,
        sourceBasis: evidence.sourceBasis,
        evidencePriority: evidence.priority,
        dsfRemoval: asset.dedicatedLight
          ? dsfSelector({
              kind: 'dsf-object',
              source: sourceFile.slice(sourceFile.indexOf('Earth nav data/')),
              sha256: sourceSha256,
              definition: definitionPath,
              command: object.commandOffset,
              pool: object.pool,
              filter: object.filterId,
              index: object.pointIndex,
            })
          : null,
        removalEligible: asset.dedicatedLight === true,
        removalCapability: asset.dedicatedLight ? 'placement' : 'unsupported',
        rawTag: 'DSF object placement',
        lat: point.lat,
        lon: point.lon,
        heading: Number(object.point?.[2]) || 0,
        classification: asset.classification,
        confidence: asset.confidence,
        classificationReasons: asset.reasons,
        dsfAirportFilter: filterAirportIdForFeature(object, decoded.filterAirportIds),
      });
    }
  }

  onProgress?.({
    fileCount: selectedDsfEntries.length,
    fileIndex: selectedDsfEntries.length,
    fraction: 1,
  });

  return {
    lightRows,
    instances,
    referenceFeatures,
    warnings,
    meta: {
      dsfFilesFound: allDsfEntries.length,
      dsfFilesSelected: selectedDsfEntries.length,
      dsfFilesDecoded: decodedFiles,
      dsfCompressedFilesSkipped: compressedFiles,
      dsfFeaturesIgnoredByAirportFilter: ignoredByAirportFilter,
      dsfUnrecognizedPolygonDefinitions: unrecognizedPolygonDefinitions.size,
      dsfUnrecognizedObjectDefinitions: unrecognizedObjectDefinitions.size,
      dsfLightStringsDecoded: lightRows.filter(
        (row) => row.sourceType === EVIDENCE.DSF_LIGHT_STRING.sourceType
      ).length,
      dsfPaintedLinesDecoded: lightRows.filter(
        (row) => row.sourceType === EVIDENCE.DSF_PAINTED_LINE.sourceType
      ).length,
      dsfLightObjectsDecoded: instances.length,
    },
  };
}

function dsfReferenceProperties({ referenceId, sourceFile, definitionPath, asset, polygon }) {
  return {
    sourceId: referenceId,
    sourceType: `xplane-dsf-${asset.kind}`,
    sourceFile,
    sourceDefinition: definitionPath,
    sourceAssetPath: asset.resolvedPath,
    title: asset.title || definitionPath,
    semanticType: asset.kind === 'pol' ? 'pavement' : asset.classification || 'simulator-line',
    snapCategory:
      asset.kind === 'pol'
        ? 'pavement-edges'
        : asset.kind === 'lin'
          ? 'painted-lines'
          : 'light-rows',
    exactness: 'exact',
    ...xplaneAssetTextureProperties(asset),
    markingCode: asset.markingCode || null,
    layerGroup: asset.layerGroup || '',
    surface: asset.surface || '',
    dsfPolygonParameter: polygon.parameter,
  };
}

export function xplaneAssetTextureProperties(asset = {}) {
  return {
    texture: asset.texture || '',
    textureAssetPath: asset.textureAssetPath || '',
    texturePattern: asset.textureAssetPath
      ? `xplane-${stableId(
          'texture',
          asset.kind,
          asset.resolvedPath,
          asset.textureAssetPath,
          JSON.stringify(asset.lineTextureLayers ?? [])
        )}`
      : '',
    textureScale: asset.textureScale || null,
    textureWidthMeters: asset.textureWidthMeters || null,
    textureHeightMeters: asset.textureHeightMeters || null,
    textureScaleX: asset.textureScaleX || null,
    textureScaleY: asset.textureScaleY || null,
    texturePixelWidth: asset.texturePixelWidth || null,
    texturePixelHeight: asset.texturePixelHeight || null,
    textureWrap: asset.textureWrap !== false,
    textureNoAlpha: asset.textureNoAlpha === true,
    lineTextureLayers: asset.lineTextureLayers || null,
    mirrorTexture: asset.mirror || false,
    alignSegments: asset.alignSegments || null,
    startCaps: asset.startCaps || null,
    endCaps: asset.endCaps || null,
    layerGroup: asset.layerGroup || '',
    surface: asset.surface || '',
    textureDefinitionResolved: asset.definitionResolved === true,
  };
}

export function dsfPolygonGeometry(windings) {
  const rings = windings
    .map((vertices) => closeDsfRing(vertices.map((vertex) => [vertex.lon, vertex.lat])))
    .map((ring) => ({ ring, area: Math.abs(dsfRingArea(ring)), depth: 0 }))
    .sort((left, right) => right.area - left.area);
  for (let index = 0; index < rings.length; index += 1) {
    rings[index].depth = rings
      .slice(0, index)
      .filter((candidate) => dsfPointInRing(rings[index].ring[0], candidate.ring)).length;
  }
  const polygons = rings
    .filter((candidate) => candidate.depth % 2 === 0)
    .map((outer) => [
      outer.ring,
      ...rings
        .filter(
          (candidate) =>
            candidate.depth === outer.depth + 1 && dsfPointInRing(candidate.ring[0], outer.ring)
        )
        .map((candidate) => candidate.ring),
    ]);
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function closeDsfRing(ring) {
  const first = ring[0];
  const last = ring.at(-1);
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first]];
}

function dsfRingArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function dsfPointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const crosses =
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

export function parseXPlaneDsf(arrayBuffer, { sourceFile = 'scenery.dsf' } = {}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (matchesSignature(bytes, SEVEN_Z_SIGNATURE)) {
    throw new XPlaneCompressedDsfError(
      '7z-compressed DSF is not decoded in-browser; use the package apt.dat evidence or unpack the DSF before generating the draft.'
    );
  }
  if (bytes.length < 28 || ascii(bytes, 0, 8) !== DSF_COOKIE) {
    throw new Error('not a raw X-Plane DSF file');
  }
  const view = new DataView(arrayBuffer);
  if (view.getUint32(8, true) !== DSF_VERSION) {
    throw new Error(`unsupported DSF version ${view.getUint32(8, true)}`);
  }

  const atoms = parseAtoms(bytes, view, 12, bytes.length - 16, sourceFile);
  const head = requiredAtom(atoms, 'HEAD', sourceFile);
  const definitions = requiredAtom(atoms, 'DEFN', sourceFile);
  const geodata = requiredAtom(atoms, 'GEOD', sourceFile);
  const commands = requiredAtom(atoms, 'CMDS', sourceFile);

  const properties = pairsFromStringTable(
    stringTable(
      bytes,
      atomContent(requiredAtom(parseChildAtoms(bytes, view, head, sourceFile), 'PROP', sourceFile))
    )
  );
  const definitionAtoms = parseChildAtoms(bytes, view, definitions, sourceFile);
  const objectDefinitions = optionalStringTable(bytes, definitionAtoms, 'OBJT');
  const polygonDefinitions = optionalStringTable(bytes, definitionAtoms, 'POLY');
  const filterAirportIds = properties
    .filter(([name]) => name === 'sim/filter/aptid')
    .map(([, value]) => String(value).trim().toUpperCase());
  const pools = decodePointPools(bytes, view, geodata, sourceFile);
  const decodedCommands = decodeCommands(bytes, view, atomContent(commands), pools, sourceFile);

  return {
    properties,
    filterAirportIds,
    objectDefinitions,
    polygonDefinitions,
    pools,
    ...decodedCommands,
  };
}

export class XPlaneCompressedDsfError extends Error {}

function selectAirportDsfEntries(entries, airportPosition) {
  if (!validCoordinate(airportPosition?.lat, airportPosition?.lon)) return entries;
  const matching = entries.filter((entry) => {
    const tile = tileFromDsfPath(entry.path);
    return (
      tile &&
      airportPosition.lat >= tile.south &&
      airportPosition.lat < tile.south + 1 &&
      airportPosition.lon >= tile.west &&
      airportPosition.lon < tile.west + 1
    );
  });
  return matching.length > 0 ? matching : [];
}

function tileFromDsfPath(value) {
  const match = normalizePath(value).match(/([+-]\d{2})([+-]\d{3})\.dsf$/i);
  if (!match) return null;
  const south = Number(match[1]);
  const west = Number(match[2]);
  return Number.isFinite(south) && Number.isFinite(west) ? { south, west } : null;
}

function featureBelongsToAirport(feature, filterAirportIds, icao) {
  const filter = filterAirportIdForFeature(feature, filterAirportIds);
  return !filter || !icao || filter === icao;
}

function filterAirportIdForFeature(feature, filterAirportIds) {
  return Number.isInteger(feature.filterId) && feature.filterId >= 0
    ? filterAirportIds[feature.filterId]
    : undefined;
}

function windingNearAirport(windings, airportPosition) {
  if (!validCoordinate(airportPosition?.lat, airportPosition?.lon)) return true;
  return windings.some((winding) =>
    winding.some((point) => {
      const coordinate = coordinateFromPoolPoint(point);
      return coordinate && pointNearAirport(coordinate, airportPosition);
    })
  );
}

function verticesAreCoherent(vertices, airportPosition) {
  if (
    validCoordinate(airportPosition?.lat, airportPosition?.lon) &&
    !vertices.every((vertex) => pointNearAirport(vertex, airportPosition))
  ) {
    return false;
  }
  for (let index = 1; index < vertices.length; index += 1) {
    if (haversineDistanceMeters(vertices[index - 1], vertices[index]) > 5_000) return false;
  }
  return true;
}

function pointNearAirport(point, airportPosition) {
  return (
    !validCoordinate(airportPosition?.lat, airportPosition?.lon) ||
    haversineDistanceMeters(point, airportPosition) <= MAX_AIRPORT_EVIDENCE_DISTANCE_METERS
  );
}

function parseAtoms(bytes, view, start, end, sourceFile) {
  const atoms = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) throw new Error(`${sourceFile}: truncated DSF atom header`);
    const size = view.getUint32(offset + 4, true);
    if (size < 8 || offset + size > end) {
      throw new Error(`${sourceFile}: invalid DSF atom size ${size} at byte ${offset}`);
    }
    atoms.push({
      id: reverseAscii(bytes, offset, 4),
      offset,
      size,
      contentStart: offset + 8,
      contentEnd: offset + size,
    });
    offset += size;
  }
  if (offset !== end) throw new Error(`${sourceFile}: DSF atoms do not end on a boundary`);
  return atoms;
}

function parseChildAtoms(bytes, view, atom, sourceFile) {
  return parseAtoms(bytes, view, atom.contentStart, atom.contentEnd, sourceFile);
}

function requiredAtom(atoms, id, sourceFile) {
  const atom = atoms.find((candidate) => candidate.id === id);
  if (!atom) throw new Error(`${sourceFile}: missing ${id} DSF atom`);
  return atom;
}

function atomContent(atom) {
  return { start: atom.contentStart, end: atom.contentEnd };
}

function optionalStringTable(bytes, atoms, id) {
  const atom = atoms.find((candidate) => candidate.id === id);
  return atom ? stringTable(bytes, atomContent(atom)) : [];
}

function stringTable(bytes, span) {
  const text = new TextDecoder().decode(bytes.subarray(span.start, span.end));
  return text.split('\0').filter((value, index, values) => value || index < values.length - 1);
}

function pairsFromStringTable(strings) {
  const pairs = [];
  for (let index = 0; index + 1 < strings.length; index += 2) {
    pairs.push([strings[index], strings[index + 1]]);
  }
  return pairs;
}

function decodePointPools(bytes, view, geodataAtom, sourceFile) {
  const atoms = parseChildAtoms(bytes, view, geodataAtom, sourceFile);
  const poolAtoms = atoms.filter((atom) => atom.id === 'POOL');
  const scaleAtoms = atoms.filter((atom) => atom.id === 'SCAL');
  if (poolAtoms.length !== scaleAtoms.length) {
    throw new Error(
      `${sourceFile}: DSF has ${poolAtoms.length} point pools but ${scaleAtoms.length} scale tables`
    );
  }
  return poolAtoms.map((poolAtom, index) =>
    decodePointPool(bytes, view, poolAtom, scaleAtoms[index], 16, sourceFile)
  );
}

function decodePointPool(bytes, view, poolAtom, scaleAtom, bits, sourceFile) {
  let offset = poolAtom.contentStart;
  if (offset + 5 > poolAtom.contentEnd) {
    throw new Error(`${sourceFile}: truncated DSF point pool`);
  }
  const pointCount = view.getUint32(offset, true);
  offset += 4;
  const planeCount = bytes[offset];
  offset += 1;
  if (pointCount > 10_000_000 || planeCount === 0 || planeCount > 32) {
    throw new Error(`${sourceFile}: unreasonable DSF point-pool dimensions`);
  }

  const scales = [];
  let scaleOffset = scaleAtom.contentStart;
  for (let plane = 0; plane < planeCount; plane += 1) {
    if (scaleOffset + 8 > scaleAtom.contentEnd) {
      throw new Error(`${sourceFile}: truncated DSF point scale table`);
    }
    scales.push({
      scale: view.getFloat32(scaleOffset, true),
      offset: view.getFloat32(scaleOffset + 4, true),
    });
    scaleOffset += 8;
  }

  const planes = [];
  for (let plane = 0; plane < planeCount; plane += 1) {
    if (offset >= poolAtom.contentEnd) {
      throw new Error(`${sourceFile}: truncated DSF point-pool plane`);
    }
    const encoding = bytes[offset];
    offset += 1;
    const decoded = decodeNumericPlane({
      bytes,
      view,
      offset,
      end: poolAtom.contentEnd,
      count: pointCount,
      bits,
      encoding,
      sourceFile,
    });
    offset = decoded.offset;
    const { scale, offset: coordinateOffset } = scales[plane];
    const divisor = bits === 16 ? 65_535 : 4_294_967_295;
    planes.push(
      decoded.values.map((value) =>
        scale === 0 ? value : (value * scale) / divisor + coordinateOffset
      )
    );
  }

  const points = Array.from({ length: pointCount }, (_, pointIndex) =>
    planes.map((plane) => plane[pointIndex])
  );
  return { planeCount, pointCount, points };
}

function decodeNumericPlane({ bytes, view, offset, end, count, bits, encoding, sourceFile }) {
  if (![0, 1, 2, 3].includes(encoding)) {
    throw new Error(`${sourceFile}: unsupported DSF point-pool encoding ${encoding}`);
  }
  const byteWidth = bits / 8;
  const maximum = bits === 16 ? 0xffff : 0xffffffff;
  const readValue = () => {
    if (offset + byteWidth > end) throw new Error(`${sourceFile}: truncated DSF point-pool data`);
    const value = bits === 16 ? view.getUint16(offset, true) : view.getUint32(offset, true);
    offset += byteWidth;
    return value;
  };
  let runRemaining = 0;
  let runValue;
  let individualRun = false;
  const readEncodedValue = () => {
    if (encoding < 2) return readValue();
    if (runRemaining === 0) {
      if (offset >= end) throw new Error(`${sourceFile}: truncated DSF RLE stream`);
      const code = bytes[offset];
      offset += 1;
      runRemaining = code & 0x7f;
      if (runRemaining === 0) throw new Error(`${sourceFile}: invalid zero-length DSF RLE run`);
      individualRun = (code & 0x80) === 0;
      if (!individualRun) runValue = readValue();
    }
    runRemaining -= 1;
    return individualRun ? readValue() : runValue;
  };

  const values = [];
  let previous = 0;
  for (let index = 0; index < count; index += 1) {
    const encoded = readEncodedValue();
    const value =
      encoding === 1 || encoding === 3
        ? bits === 16
          ? (previous + encoded) & maximum
          : (previous + encoded) >>> 0
        : encoded;
    values.push(value);
    previous = value;
  }
  return { values, offset };
}

function decodeCommands(bytes, view, span, pools, sourceFile) {
  let offset = span.start;
  let currentPool = 0;
  let currentDefinition = 0;
  let currentFilterId = -1;
  const objects = [];
  const polygons = [];
  const readU8 = () => {
    assertCommandBytes(offset, 1, span.end, sourceFile);
    return bytes[offset++];
  };
  const readU16 = () => {
    assertCommandBytes(offset, 2, span.end, sourceFile);
    const value = view.getUint16(offset, true);
    offset += 2;
    return value;
  };
  const readU32 = () => {
    assertCommandBytes(offset, 4, span.end, sourceFile);
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readS32 = () => {
    assertCommandBytes(offset, 4, span.end, sourceFile);
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const skip = (count) => {
    assertCommandBytes(offset, count, span.end, sourceFile);
    offset += count;
  };
  const pointAt = (index) => {
    const point = pools[currentPool]?.points[index];
    if (!point) {
      throw new Error(
        `${sourceFile}: DSF command references missing pool ${currentPool} point ${index}`
      );
    }
    return point;
  };
  const addPolygon = (commandOffset, parameter, windingIndices) => {
    polygons.push({
      commandOffset,
      pool: currentPool,
      definition: currentDefinition,
      filterId: currentFilterId,
      parameter,
      windings: windingIndices.map((indices) => indices.map(pointAt)),
    });
  };

  while (offset < span.end) {
    const commandOffset = offset;
    const command = readU8();
    switch (command) {
      case 0:
        throw new Error(`${sourceFile}: reserved DSF command at byte ${commandOffset}`);
      case 1:
        currentPool = readU16();
        break;
      case 2:
        skip(4);
        break;
      case 3:
        currentDefinition = readU8();
        break;
      case 4:
        currentDefinition = readU16();
        break;
      case 5:
        currentDefinition = readU32();
        break;
      case 6:
        skip(1);
        break;
      case 7: {
        const index = readU16();
        objects.push({
          commandOffset,
          definition: currentDefinition,
          filterId: currentFilterId,
          pointIndex: index,
          pool: currentPool,
          point: pointAt(index),
        });
        break;
      }
      case 8: {
        const first = readU16();
        const end = readU16();
        for (let index = first; index < end; index += 1) {
          objects.push({
            commandOffset,
            definition: currentDefinition,
            filterId: currentFilterId,
            pointIndex: index,
            pool: currentPool,
            point: pointAt(index),
          });
        }
        break;
      }
      case 9:
        skip(readU8() * 2);
        break;
      case 10:
        skip(4);
        break;
      case 11:
        skip(readU8() * 4);
        break;
      case 12: {
        const parameter = readU16();
        const count = readU8();
        const indices = Array.from({ length: count }, readU16);
        addPolygon(commandOffset, parameter, [indices]);
        break;
      }
      case 13: {
        const parameter = readU16();
        const first = readU16();
        const end = readU16();
        addPolygon(commandOffset, parameter, [
          Array.from({ length: Math.max(0, end - first) }, (_, index) => first + index),
        ]);
        break;
      }
      case 14: {
        const parameter = readU16();
        const windingCount = readU8();
        const windings = [];
        for (let winding = 0; winding < windingCount; winding += 1) {
          const count = readU8();
          windings.push(Array.from({ length: count }, readU16));
        }
        addPolygon(commandOffset, parameter, windings);
        break;
      }
      case 15: {
        const parameter = readU16();
        // Current X-Plane 12 DSFs encode a winding count followed by N+1
        // boundaries, despite the older public spec describing this byte as
        // an index count. Match the simulator's emitted format.
        const windingCount = readU8();
        let first = readU16();
        const windings = [];
        for (let winding = 0; winding < windingCount; winding += 1) {
          const end = readU16();
          windings.push(
            Array.from({ length: Math.max(0, end - first) }, (_, index) => first + index)
          );
          first = end;
        }
        addPolygon(commandOffset, parameter, windings);
        break;
      }
      case 16:
        break;
      case 17:
        skip(1);
        break;
      case 18:
        skip(9);
        break;
      case 23:
      case 26:
      case 29:
        skip(readU8() * 2);
        break;
      case 24:
      case 27:
      case 30:
        skip(readU8() * 4);
        break;
      case 25:
      case 28:
      case 31:
        skip(4);
        break;
      case 32:
      case 33:
      case 34: {
        const commentLength = command === 32 ? readU8() : command === 33 ? readU16() : readU32();
        const commentEnd = offset + commentLength;
        assertCommandBytes(offset, commentLength, span.end, sourceFile);
        if (commentLength >= 2) {
          const commentType = readU16();
          if (commentType === 1 && commentEnd - offset === 4) currentFilterId = readS32();
        }
        offset = commentEnd;
        break;
      }
      default:
        throw new Error(`${sourceFile}: unknown DSF command ${command} at byte ${commandOffset}`);
    }
  }
  return { objects, polygons };
}

function assertCommandBytes(offset, count, end, sourceFile) {
  if (!Number.isSafeInteger(count) || count < 0 || offset + count > end) {
    throw new Error(`${sourceFile}: truncated DSF command stream`);
  }
}

export async function createXPlaneAssetResolver(entries) {
  const fileEntries = new Map();
  const filePathsByName = new Map();
  for (const entry of entries ?? []) {
    if (!entry?.file) continue;
    const path = normalizeAssetPath(entry.path);
    fileEntries.set(path, entry);
    const name = path.split('/').at(-1);
    const paths = filePathsByName.get(name) ?? [];
    paths.push(path);
    filePathsByName.set(name, paths);
  }
  const libraryMap = new Map();
  for (const [path, entry] of fileEntries) {
    if (!path.endsWith('/library.txt') && path !== 'library.txt') continue;
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- Usually one tiny library table; sequential reads keep error handling deterministic.
    const text = await readEntryText(entry);
    const libraryDirectory = path.split('/').slice(0, -1).join('/');
    for (const [virtualPath, physicalPath] of parseLibraryExports(text)) {
      const resolvedPhysicalPath = normalizeAssetPath(
        libraryDirectory ? `${libraryDirectory}/${physicalPath}` : physicalPath
      );
      if (!libraryMap.has(normalizeAssetPath(virtualPath))) {
        libraryMap.set(normalizeAssetPath(virtualPath), resolvedPhysicalPath);
      }
    }
  }
  const textCache = new Map();
  const resolveSelectedPath = (value) => {
    const normalized = normalizeAssetPath(value);
    if (fileEntries.has(normalized)) return normalized;
    const candidates = filePathsByName.get(normalized.split('/').at(-1)) ?? [];
    let match = '';
    let matchSegments = 0;
    let ambiguous = false;
    for (const candidate of candidates) {
      const segments = commonTrailingPathSegments(normalized, candidate);
      if (segments !== Math.min(normalized.split('/').length, candidate.split('/').length)) {
        continue;
      }
      if (segments > matchSegments) {
        match = candidate;
        matchSegments = segments;
        ambiguous = false;
      } else if (segments === matchSegments) {
        ambiguous = true;
      }
    }
    return ambiguous ? '' : match;
  };
  const readText = async (path) => {
    const normalized = normalizeAssetPath(path);
    if (textCache.has(normalized)) return textCache.get(normalized);
    const entry = fileEntries.get(normalized);
    const text = entry ? await readEntryText(entry) : undefined;
    textCache.set(normalized, text);
    return text;
  };
  const resolvePath = (definitionPath, relativeTo) => {
    const rawPath = normalizePath(definitionPath).replace(/^\.?\//, '');
    const normalized = normalizeAssetPath(definitionPath);
    const mapped = libraryMap.get(normalized);
    const selectedMapped = mapped ? resolveSelectedPath(mapped) : '';
    if (selectedMapped) return selectedMapped;
    const selected = resolveSelectedPath(normalized);
    if (selected) return selected;
    if (relativeTo && !normalized.startsWith('lib/')) {
      const relative = normalizeAssetPath(
        `${relativeTo.split('/').slice(0, -1).join('/')}/${rawPath}`
      );
      const selectedRelative = resolveSelectedPath(relative);
      if (selectedRelative) return selectedRelative;
    }
    return mapped ?? normalized;
  };
  const resolveTexturePath = (texturePath, relativeTo) => {
    const rawPath = normalizePath(texturePath).replace(/^\.?\//, '');
    const normalized = normalizeAssetPath(texturePath);
    const resolved = resolvePath(texturePath, relativeTo);
    const relative =
      relativeTo && !normalized.startsWith('lib/')
        ? normalizeAssetPath(`${relativeTo.split('/').slice(0, -1).join('/')}/${rawPath}`)
        : '';
    for (const candidate of [...new Set([resolved, relative, normalized].filter(Boolean))]) {
      const runtimeDds = candidate.replace(/\.(?:png|jpe?g|webp)$/i, '.dds');
      const selectedDds = runtimeDds !== candidate ? resolveSelectedPath(runtimeDds) : '';
      if (selectedDds) return selectedDds;
      const selected = resolveSelectedPath(candidate);
      if (selected) return selected;
    }
    return resolved;
  };

  return {
    aptMarkingDefinition(markingCode) {
      const prefix = `${Number(markingCode)}_`;
      const matchesStockLine = (path) => {
        const name = path.split('/').at(-1) || '';
        return path.includes('/airport/lines/') && name.startsWith(prefix) && name.endsWith('.lin');
      };
      return (
        [...libraryMap.keys()].find(matchesStockLine) ??
        [...fileEntries.keys()].find(matchesStockLine)
      );
    },
    async describePolygon(definitionPath) {
      const extension = fileExtension(definitionPath);
      if (!['.str', '.lin', '.pol'].includes(extension)) return null;
      const resolvedPath = resolvePath(definitionPath);
      const text = await readText(resolvedPath);
      if (extension === '.pol') {
        if (!text) {
          return {
            kind: 'pol',
            resolvedPath,
            title: definitionPath,
            isEvidence: false,
            definitionResolved: false,
          };
        }
        const style = parseDrapedAssetStyle(text);
        return {
          kind: 'pol',
          resolvedPath,
          title: definitionPath,
          isEvidence: false,
          definitionResolved: true,
          ...style,
          ...(style.texture
            ? { textureAssetPath: resolveTexturePath(style.texture, resolvedPath) }
            : {}),
        };
      }
      if (extension === '.str') {
        const referencedObjects = parseObjectStringReferences(text);
        const objectTexts = [];
        const resolvedObjects = [];
        for (const objectPath of referencedObjects) {
          const resolvedObject = resolvePath(objectPath, resolvedPath);
          resolvedObjects.push(resolvedObject);
          // oxlint-disable-next-line react-doctor/async-await-in-loop -- Object strings reference very few objects and reads are cached.
          const objectText = await readText(resolvedObject);
          if (objectText) objectTexts.push(objectText);
        }
        const asset = classifyStringAsset({
          definitionPath,
          resolvedPath,
          text,
          referencedObjects: resolvedObjects,
          objectTexts,
        });
        return asset ? { ...asset, definitionResolved: Boolean(text) } : null;
      }
      const lineAsset = classifyLineAsset({ definitionPath, resolvedPath, text }) ?? {
        kind: 'lin',
        resolvedPath,
        title: definitionPath,
        classification: 'painted-marking',
        confidence: 1,
        reasons: [`DSF painted line definition ${definitionPath}`],
        isEvidence: false,
        definitionResolved: true,
        ...parseDrapedAssetStyle(text),
      };
      return {
        ...lineAsset,
        definitionResolved: Boolean(text),
        ...(lineAsset.texture
          ? { textureAssetPath: resolveTexturePath(lineAsset.texture, resolvedPath) }
          : {}),
      };
    },
    async describeObject(definitionPath) {
      if (fileExtension(definitionPath) !== '.obj') return null;
      const resolvedPath = resolvePath(definitionPath);
      const text = await readText(resolvedPath);
      return classifyObjectAsset({ definitionPath, resolvedPath, text });
    },
  };
}

function commonTrailingPathSegments(left, right) {
  const leftSegments = left.split('/');
  const rightSegments = right.split('/');
  let count = 0;
  while (
    count < leftSegments.length &&
    count < rightSegments.length &&
    leftSegments[leftSegments.length - 1 - count] ===
      rightSegments[rightSegments.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

function parseDrapedAssetStyle(text) {
  const style = {};
  const lineTextureLayers = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    const command = fields[0]?.toUpperCase();
    if (['TEXTURE', 'TEXTURE_NOWRAP', 'TEXTURE_LIT'].includes(command) && fields[1]) {
      style.texture ??= fields[1];
      if (command !== 'TEXTURE_LIT') style.textureWrap = command !== 'TEXTURE_NOWRAP';
    } else if (command === 'SCALE' && Number.isFinite(Number(fields[1]))) {
      style.textureScale = Number(fields[1]);
      style.textureScaleX = Number(fields[1]);
      style.textureScaleY = Number.isFinite(Number(fields[2]))
        ? Number(fields[2])
        : Number(fields[1]);
      style.textureWidthMeters = style.textureScaleX;
      style.textureHeightMeters = style.textureScaleY;
    } else if (command === 'TEX_WIDTH' && Number.isFinite(Number(fields[1]))) {
      style.texturePixelWidth = Number(fields[1]);
    } else if (command === 'TEX_HEIGHT' && Number.isFinite(Number(fields[1]))) {
      style.texturePixelHeight = Number(fields[1]);
    } else if (
      command === 'S_OFFSET' &&
      fields.slice(1, 5).every((value) => Number.isFinite(Number(value)))
    ) {
      lineTextureLayers.push({
        layer: Number(fields[1]),
        s1: Number(fields[2]),
        sm: Number(fields[3]),
        s2: Number(fields[4]),
      });
    } else if (command === 'MIRROR') {
      style.mirror = true;
    } else if (command === 'NO_ALPHA') {
      style.textureNoAlpha = true;
    } else if (command === 'ALIGN' && Number.isFinite(Number(fields[1]))) {
      style.alignSegments = Number(fields[1]);
    } else if (
      (command === 'START_CAP' || command === 'END_CAP') &&
      fields.slice(1, 7).every((value) => Number.isFinite(Number(value)))
    ) {
      const cap = {
        layer: Number(fields[1]),
        s1: Number(fields[2]),
        sm: Number(fields[3]),
        s2: Number(fields[4]),
        t1: Number(fields[5]),
        t2: Number(fields[6]),
      };
      const key = command === 'START_CAP' ? 'startCaps' : 'endCaps';
      style[key] = [...(style[key] ?? []), cap];
    } else if (command === 'LAYER_GROUP' && fields[1]) {
      style.layerGroup = fields.slice(1).join(' ');
    } else if (command === 'SURFACE' && fields[1]) {
      style.surface = fields[1];
    }
  }
  if (lineTextureLayers.length > 0) {
    style.lineTextureLayers = lineTextureLayers;
    const coordinateWidth = style.texturePixelWidth || 1;
    const left = Math.max(...lineTextureLayers.map((layer) => Math.max(0, layer.sm - layer.s1)));
    const right = Math.max(...lineTextureLayers.map((layer) => Math.max(0, layer.s2 - layer.sm)));
    if (style.textureScaleX) {
      style.textureWidthMeters = ((left + right) / coordinateWidth) * style.textureScaleX;
    }
  }
  return style;
}

function parseLibraryExports(text) {
  const exports = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    const command = fields[0]?.toUpperCase();
    if (
      command === 'EXPORT' ||
      command === 'EXPORT_BACKUP' ||
      command === 'EXPORT_EXCLUDE' ||
      command === 'EXPORT_EXTEND'
    ) {
      if (fields[1] && fields[2]) exports.push([fields[1], fields[2]]);
    } else if (command === 'EXPORT_RATIO') {
      if (fields[2] && fields[3]) exports.push([fields[2], fields[3]]);
    } else if (command === 'EXPORT_SEASON') {
      if (fields[2] && fields[3]) exports.push([fields[2], fields[3]]);
    }
  }
  return exports;
}

function parseObjectStringReferences(text) {
  const references = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!/^OBJECT\s+/i.test(line)) continue;
    const fields = line.split(/\s+/);
    const objectPath = fields.at(-1);
    if (objectPath && /\.obj$/i.test(objectPath)) references.push(objectPath);
  }
  return references;
}

function classifyStringAsset({
  definitionPath,
  resolvedPath,
  text,
  referencedObjects,
  objectTexts,
}) {
  const lightNames = objectTexts.flatMap(namedLightTokens);
  const semanticText = [definitionPath, resolvedPath, text, ...referencedObjects, ...lightNames]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const numericCode = leadingAssetCode(definitionPath) ?? leadingAssetCode(resolvedPath);
  const coded = LIGHT_STRING_CODES.get(numericCode);
  const classified = coded ?? classifyLightSemantics(semanticText, { string: true });
  const explicitlyLightBearing =
    lightNames.length > 0 ||
    /(?:^|\/)(?:apt_)?lights?(?:\/|$)|apt_lights/i.test(
      [definitionPath, resolvedPath].filter(Boolean).join('/').toLowerCase()
    );
  if (!classified && !explicitlyLightBearing) return null;
  return {
    kind: 'str',
    resolvedPath,
    classification: classified?.classification ?? 'unknown-light',
    confidence: coded ? 1 : (classified?.confidence ?? 0.8),
    reasons: [
      coded
        ? `DSF .str uses X-Plane taxiway-light code ${numericCode}: ${coded.label}`
        : (classified?.reason ??
          'DSF object string is explicitly light-bearing but its light family is unknown; it must be retained'),
      `DSF polygon definition ${definitionPath}`,
    ],
  };
}

function classifyLineAsset({ definitionPath, resolvedPath, text }) {
  const rawMarkingCode = leadingAssetCode(definitionPath) ?? leadingAssetCode(resolvedPath);
  const numericCode = normalizeMarkingCode(rawMarkingCode);
  const coded = MARKING_CODES.get(numericCode);
  const semanticText = [definitionPath, resolvedPath, text].filter(Boolean).join(' ').toLowerCase();
  const classified = coded ?? classifyMarkingSemantics(semanticText);
  if (!classified) return null;
  return {
    kind: 'lin',
    resolvedPath,
    title: definitionPath,
    classification: classified.classification,
    markingCode: rawMarkingCode || null,
    confidence: coded ? 1 : classified.confidence,
    reasons: [
      coded
        ? `DSF .lin uses X-Plane marking code ${numericCode}: ${coded.label}`
        : classified.reason,
      'painted marking is placement-only evidence and never authorizes a light removal',
      `DSF polygon definition ${definitionPath}`,
    ],
    ...parseDrapedAssetStyle(text),
  };
}

function classifyObjectAsset({ definitionPath, resolvedPath, text }) {
  const lightNames = namedLightTokens(text);
  const assetPaths = [definitionPath, resolvedPath].filter(Boolean).join(' ').toLowerCase();
  const explicitlyLightBearing =
    lightNames.length > 0 ||
    /(?:^|\/)(?:apt_)?lights?(?:\/|$)|apt_lights|(?:hold[_\s-]*short|centerline[_\s-]*twy).*\.obj/i.test(
      assetPaths
    );
  if (!explicitlyLightBearing) return null;
  const semanticText = [assetPaths, ...lightNames].filter(Boolean).join(' ').toLowerCase();
  const classified = classifyLightSemantics(semanticText, { object: true, lightNames });
  return {
    resolvedPath,
    dedicatedLight:
      /^lib\/airport\/lights\/(?:slow\/)?[^/]+\.obj$/i.test(definitionPath) &&
      ['taxi-centerline', 'taxi-edge', 'lead-on', 'stopbar', 'airfield-light'].includes(
        classified?.classification
      ),
    classification: classified?.classification ?? 'unknown-light',
    confidence: classified?.confidence ?? 0.8,
    reasons: [
      classified?.reason ??
        'DSF object is explicitly light-bearing but its light family is unknown; it must be retained',
      `DSF object definition ${definitionPath}`,
    ],
  };
}

function classifyLightSemantics(text, { string = false, object = false, lightNames = [] } = {}) {
  if (/(?:hold[_\s-]*short|stop[_\s-]*bar)/i.test(text)) {
    return {
      classification: 'stopbar',
      confidence: 0.98,
      reason: `${string ? 'object string' : 'object'} explicitly references hold-short lights`,
    };
  }
  if (/(?:wigwag|wig-wag|runway[_\s-]*guard|rway[_\s-]*guard)/i.test(text)) {
    return {
      classification: 'runway-guard',
      confidence: 0.98,
      reason: 'object explicitly references runway-guard lights',
    };
  }
  const hasTaxiGreen = lightNames.some((name) => /^taxi_g(?:_|$)/i.test(name));
  const hasReverseTaxiGreen = lightNames.some((name) => /^taxi_g_rev(?:_|$)/i.test(name));
  const unidirectional =
    /(?:centerline.*twy.*uni|twy.*centerline.*uni|lead[_\s-]*(?:on|off))/i.test(text) ||
    (object && hasTaxiGreen && !hasReverseTaxiGreen);
  if (unidirectional) {
    return {
      classification: 'lead-on',
      confidence: /uni|lead/i.test(text) ? 0.98 : 0.9,
      reason: 'asset explicitly identifies unidirectional taxiway centreline lighting',
    };
  }
  if (
    /(?:centerline.*twy|twy.*centerline|taxi[_\s-]*center)/i.test(text) ||
    (object && hasTaxiGreen && hasReverseTaxiGreen)
  ) {
    return {
      classification: 'taxi-centerline',
      confidence: 0.96,
      reason: 'asset explicitly identifies taxiway centreline lighting',
    };
  }
  if (/(?:edge[_\s-]*twy|twy[_\s-]*edge|taxi[_\s-]*edge)/i.test(text)) {
    return {
      classification: 'taxi-edge',
      confidence: 0.96,
      reason: 'asset explicitly identifies taxiway edge lighting',
    };
  }
  if (/(?:appch|approach|rwy|runway|tdzl|reil|papi|vasi|threshold|edge_[rwy])/i.test(text)) {
    return {
      classification: 'runway',
      confidence: 0.95,
      reason: 'asset explicitly identifies protected runway or approach lighting',
    };
  }
  return null;
}

function classifyMarkingSemantics(text) {
  if (/(?:hold[_\s-]*(?:short|position|line)|stop[_\s-]*bar|ils[_\s-]*hold)/i.test(text)) {
    return {
      classification: 'stopbar',
      confidence: 0.92,
      reason: 'painted-line asset explicitly identifies a hold-position marking',
    };
  }
  if (/(?:taxi[_\s-]*(?:center|centre)|(?:center|centre)line[_\s-]*t(?:a)?xi)/i.test(text)) {
    return {
      classification: 'taxi-centerline',
      confidence: 0.9,
      reason: 'painted-line asset explicitly identifies a taxiway centreline marking',
    };
  }
  return null;
}

function namedLightTokens(text) {
  const names = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    const match = line.match(/^LIGHT_(?:NAMED|PARAM)\s+(\S+)/i);
    if (match) names.push(match[1]);
  }
  return names;
}

function leadingAssetCode(value) {
  const name = normalizePath(value).split('/').at(-1) ?? '';
  const match = name.match(/^(\d{1,3})(?:_|-)/);
  return match ? Number(match[1]) : undefined;
}

function normalizeMarkingCode(code) {
  if (!Number.isFinite(code)) return undefined;
  if (code >= 51 && code <= 64) return code - 50;
  if (code >= 70 && code <= 92) return code - 50;
  return code;
}

function sampleDsfWinding(rawPoints, { closed, textureCoordinates = false }) {
  const points = collapseSplitBezierPoints(
    rawPoints
      .map((point) => {
        const coordinate = coordinateFromPoolPoint(point);
        if (!coordinate) return null;
        // A draped .pol with parameter 65535 stores explicit S/T texture
        // coordinates after lon/lat. Four-plane points are therefore straight
        // vertices, not world-space Bezier controls. Curved textured polygons
        // contain both control lon/lat and four trailing S/T values.
        const hasBezierControl = textureCoordinates ? point.length >= 8 : point.length >= 4;
        const control =
          hasBezierControl &&
          validCoordinate(point?.[3], point?.[2]) &&
          (point[2] !== 0 || point[3] !== 0)
            ? { lat: point[3], lon: point[2] }
            : undefined;
        const textureOffset = point.length >= 8 ? 4 : 2;
        const s = textureCoordinates ? Number(point[textureOffset]) : undefined;
        const t = textureCoordinates ? Number(point[textureOffset + 1]) : undefined;
        return {
          ...coordinate,
          control,
          ...(Number.isFinite(s) && Number.isFinite(t) ? { s, t } : {}),
        };
      })
      .filter(Boolean)
  );
  const vertices = [];
  for (let index = 1; index < points.length; index += 1) {
    appendDistinctVertices(vertices, sampleCurve(points[index - 1], points[index]));
  }
  if (closed && points.length > 1) {
    appendDistinctVertices(vertices, sampleCurve(points.at(-1), points[0]));
  }
  if (vertices.length === 0 && points.length === 1) vertices.push(stripControls(points[0]));
  return vertices;
}

function collapseSplitBezierPoints(rawPoints) {
  const points = [];
  for (let index = 0; index < rawPoints.length; index += 1) {
    const first = rawPoints[index];
    let last = first;
    while (index + 1 < rawPoints.length) {
      const next = rawPoints[index + 1];
      const colocated = next.lat === first.lat && next.lon === first.lon;
      const exactlyOneHasControl = Boolean(last.control) !== Boolean(next.control);
      if (!colocated || !exactlyOneHasControl) break;
      last = next;
      index += 1;
    }
    points.push({
      ...last,
      incomingControl: first.control ? mirrorControl(first, first.control) : undefined,
      outgoingControl: last.control,
    });
  }
  return points;
}

function sampleCurve(start, end) {
  const first = stripControls(start);
  const last = stripControls(end);
  const firstControl = start.outgoingControl ?? first;
  const secondControl = end.incomingControl ?? last;
  if (!start.outgoingControl && !end.incomingControl) return [first, last];
  const estimate =
    haversineDistanceMeters(first, firstControl) +
    haversineDistanceMeters(firstControl, secondControl) +
    haversineDistanceMeters(secondControl, last);
  const segments = Math.max(
    2,
    Math.min(MAX_CURVE_SEGMENTS, Math.ceil(estimate / CURVE_SAMPLE_METERS))
  );
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments;
    const u = 1 - t;
    return {
      lat:
        u ** 3 * first.lat +
        3 * u ** 2 * t * firstControl.lat +
        3 * u * t ** 2 * secondControl.lat +
        t ** 3 * last.lat,
      lon:
        u ** 3 * first.lon +
        3 * u ** 2 * t * firstControl.lon +
        3 * u * t ** 2 * secondControl.lon +
        t ** 3 * last.lon,
      ...(Number.isFinite(first.s) && Number.isFinite(last.s)
        ? {
            s: first.s + (last.s - first.s) * t,
            t: first.t + (last.t - first.t) * t,
          }
        : {}),
    };
  });
}

function appendDistinctVertices(target, vertices) {
  for (const vertex of vertices) {
    const previous = target.at(-1);
    if (!previous || previous.lat !== vertex.lat || previous.lon !== vertex.lon) {
      target.push(vertex);
    }
  }
}

function mirrorControl(point, control) {
  return {
    lat: point.lat * 2 - control.lat,
    lon: point.lon * 2 - control.lon,
  };
}

function stripControls(point) {
  return {
    lat: point.lat,
    lon: point.lon,
    ...(Number.isFinite(point.s) && Number.isFinite(point.t) ? { s: point.s, t: point.t } : {}),
  };
}

function explicitTextureWindings(windings) {
  return windings.map((winding) => {
    const vertices = winding
      .filter((vertex) => Number.isFinite(vertex.s) && Number.isFinite(vertex.t))
      .map((vertex) => [vertex.lon, vertex.lat, vertex.s, vertex.t]);
    if (vertices.length === 0) return vertices;
    const first = vertices[0];
    const last = vertices.at(-1);
    return first[0] === last[0] && first[1] === last[1] ? vertices : [...vertices, [...first]];
  });
}

function coordinateFromPoolPoint(point) {
  const lon = Number(point?.[0]);
  const lat = Number(point?.[1]);
  return validCoordinate(lat, lon) ? { lat, lon } : null;
}

async function readEntryText(entry) {
  if (typeof entry?.file?.text === 'function') return entry.file.text();
  return new TextDecoder().decode(await entry.file.arrayBuffer());
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function normalizeAssetPath(value) {
  const parts = [];
  for (const part of normalizePath(value)
    .replace(/^\.?\//, '')
    .split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/').toLowerCase();
}

function fileExtension(value) {
  const name = normalizePath(value).split('/').at(-1) || '';
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}

function validCoordinate(lat, lon) {
  return (
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon)) &&
    Number(lat) >= -90 &&
    Number(lat) <= 90 &&
    Number(lon) >= -180 &&
    Number(lon) <= 180
  );
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function reverseAscii(bytes, offset, length) {
  return ascii(bytes, offset, length).split('').reverse().join('');
}

function matchesSignature(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}
