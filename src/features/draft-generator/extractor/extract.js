import { promises as fs } from 'node:fs';
import { extractBglData } from './bgl.js';
import {
  classifyObject,
  isLikelyLightClassification,
  isTargetLightClassification,
  stableId,
} from './classify.js';
import {
  haversineDistanceMeters,
  interpolatePoint,
  interpolatePolyline,
  nearestPointOnPolygon,
  nearestPointOnPolyline,
  offsetPointMeters,
  pointInPolygon,
  pointToPolylineDistanceMeters,
  polylineCorridorPolygon,
  polylineToPolylineDistanceMeters,
  rectanglePolygonAround,
} from './geo.js';
import { findDescendants, localName, parseXml, walkNodes } from './xml.js';

const INSTANCE_CHILD_TAGS = new Set(['libraryobject', 'visualeffectobject', 'simpropcontainer']);

const LIGHT_ROW_TAGS = new Set(['lightrow', 'edgelights', 'apronedgelights']);
const VERTEX_TAGS = new Set(['vertex', 'point', 'edgevertex', 'apronvertex']);
const EXISTING_EXCLUSION_TAGS = new Set(['exclusionrectangle']);
const SOURCE_BACKED_LIGHT_ROW_TYPES = new Set([
  'lightrow',
  'edgelights',
  'apronedgelights',
  'bgl-airport-light-row',
  'bgl-taxiway-path',
  'bgl-taxiway-path-edge',
  'bgl-taxiway-path-bridge',
  'division-guided-source-instances',
]);
const INFERRED_REMOVAL_LIGHT_ROW_TYPES = new Set(['inferred-bgl-placement-row']);
const METERS_PER_DEGREE_LAT = 111320;
const ROW_ENDPOINT_MERGE_TOLERANCE_METERS = 0.5;
const ROW_LINE_MERGE_TOLERANCE_METERS = 0.05;
const ROW_MERGE_ANGLE_TOLERANCE_DEGREES = 5;
const PARTIAL_OVERLAP_JOIN_MAX_METERS = 1.5;
const PARTIAL_OVERLAP_BOUNDARY_SAMPLE_METERS = 0.05;
const MUST_KEEP_ROW_CLEARANCE_METERS = 0.25;
const MUST_KEEP_INSTANCE_CLEARANCE_METERS = 0.5;
const MUST_KEEP_DISCONTINUITY_MIN_METERS = 25;
const MUST_KEEP_DISCONTINUITY_SPACING_MULTIPLIER = 3;
const MIN_SAFE_REMOVAL_HALF_WIDTH_METERS = 0.015;
const PROTECTION_GEOMETRY_TOLERANCE_METERS = 0.005;
const PROTECTION_BEND_MARGIN_METERS = 0.02;
const PROTECTION_SAMPLE_SPACING_METERS = 0.25;
const REMOVAL_SIMPLIFICATION_TOLERANCES_METERS = [0.05, 0.02, 0.01, 0.005];

function roundNumber(value) {
  return Math.round(value * 1_000) / 1_000;
}

export async function extractAirportLightData(options) {
  const extractionStartedAt = performance.now();
  const warnings = [];
  const instances = [];
  const lightRows = [];
  const existingExclusionRectangles = [];

  for (const unsupportedFile of options.unsupportedFiles ?? []) {
    warnings.push(`${unsupportedFile}: unsupported binary/package file`);
  }

  let xmlFilesParsed = 0;
  for (const xmlFile of options.xmlFiles) {
    let text;
    try {
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- Sequential parsing bounds memory and preserves source-ordered diagnostics.
      text = await fs.readFile(xmlFile, 'utf8');
    } catch (error) {
      warnings.push(`${xmlFile}: failed to read XML file: ${error.message}`);
      continue;
    }

    const parsed = parseXml(text, xmlFile);
    warnings.push(...parsed.warnings);
    xmlFilesParsed += 1;

    const fileResult = extractFromParsedXml(parsed.root, xmlFile);
    instances.push(...fileResult.instances);
    lightRows.push(...fileResult.lightRows);
    existingExclusionRectangles.push(...fileResult.existingExclusionRectangles);
    warnings.push(...fileResult.warnings);
  }

  const bglStartedAt = performance.now();
  const bglResult = await extractBglData(options.bglFiles ?? []);
  const bglExtractionMilliseconds = performance.now() - bglStartedAt;
  instances.push(...bglResult.instances);
  lightRows.push(...bglResult.lightRows);
  warnings.push(...bglResult.warnings);

  const mustKeepStartedAt = performance.now();
  const mustKeepZones = buildMustKeepZones(instances, lightRows, bglResult.runwayLightZones ?? []);
  const mustKeepBuildMilliseconds = performance.now() - mustKeepStartedAt;
  const removalStartedAt = performance.now();
  const {
    exclusionCandidates,
    removalPolygons,
    protectionConflicts,
    performance: removalPerformance,
  } = options.buildRemovals === false
    ? {
        exclusionCandidates: [],
        removalPolygons: [],
        protectionConflicts: [],
        performance: {
          groupingMilliseconds: 0,
          polygonBuildMilliseconds: 0,
          instanceBuildMilliseconds: 0,
          conflictFilterMilliseconds: 0,
        },
      }
    : generateRemovalGeometry(instances, lightRows, options.sizes, mustKeepZones);
  const removalGeometryMilliseconds = performance.now() - removalStartedAt;

  return {
    meta: {
      input: options.input,
      ...(options.icao ? { icao: options.icao } : {}),
      generatedAt: new Date().toISOString(),
      filesScanned: options.filesScanned,
      xmlFilesParsed,
      bglFilesParsed: bglResult.bglFilesParsed,
      modelLibraryEntries: bglResult.modelLibraryEntries,
      taxiwayGraphsParsed: bglResult.taxiwayGraphStats?.graphs ?? 0,
      taxiwayPointsParsed: bglResult.taxiwayGraphStats?.points ?? 0,
      taxiwayParkingsParsed: bglResult.taxiwayGraphStats?.parkings ?? 0,
      taxiwayPathsParsed: bglResult.taxiwayGraphStats?.paths ?? 0,
      taxiwayNamesParsed: bglResult.taxiwayGraphStats?.names ?? 0,
      lightedTaxiwayPathsParsed: bglResult.taxiwayGraphStats?.lightedTaxiPaths ?? 0,
      decodedHoldShortPoints: bglResult.taxiwayGraphStats?.decodedHoldShortPoints ?? 0,
      eligibleHoldShortPoints: bglResult.taxiwayGraphStats?.eligibleHoldShortPoints ?? 0,
      suppressedHoldShortPoints: bglResult.taxiwayGraphStats?.suppressedHoldShortPoints ?? 0,
      inferredPlacementRows: bglResult.taxiwayGraphStats?.inferredPlacementRows ?? 0,
      inferredPlacementAssignments: bglResult.taxiwayGraphStats?.inferredPlacementAssignments ?? 0,
      excludedPlacementOutliers: bglResult.taxiwayGraphStats?.excludedPlacementOutliers ?? 0,
      placementInferenceMilliseconds:
        bglResult.taxiwayGraphStats?.placementInferenceMilliseconds ?? 0,
      placementInference: bglResult.taxiwayGraphStats?.placementInference,
      runwayRecordsParsed: bglResult.runways?.length ?? 0,
      runwayLightZonesFound: bglResult.runwayLightZones?.length ?? 0,
      mustKeepZonesGenerated: mustKeepZones.length,
      protectionConflicts: protectionConflicts.length,
      performance: {
        bglExtractionMilliseconds: roundNumber(bglExtractionMilliseconds),
        mustKeepBuildMilliseconds: roundNumber(mustKeepBuildMilliseconds),
        removalGeometryMilliseconds: roundNumber(removalGeometryMilliseconds),
        removalGroupingMilliseconds: roundNumber(removalPerformance.groupingMilliseconds),
        removalPolygonBuildMilliseconds: roundNumber(removalPerformance.polygonBuildMilliseconds),
        removalInstanceBuildMilliseconds: roundNumber(removalPerformance.instanceBuildMilliseconds),
        removalConflictFilterMilliseconds: roundNumber(
          removalPerformance.conflictFilterMilliseconds
        ),
        extractionMilliseconds: roundNumber(performance.now() - extractionStartedAt),
      },
      bglFileStats: bglResult.fileStats ?? [],
      unsupportedSceneryRecordTypes: bglResult.unsupportedSceneryRecordTypes ?? {},
      unsupportedFiles: options.unsupportedFiles ?? [],
      warnings,
    },
    instances,
    lightRows,
    topologyRows: bglResult.topologyRows ?? [],
    runways: bglResult.runways ?? [],
    mustKeepZones,
    protectionConflicts,
    removalPolygons,
    exclusionCandidates,
    existingExclusionRectangles,
  };
}

export function extractFromParsedXml(root, sourceFile) {
  const instances = [];
  const lightRows = [];
  const existingExclusionRectangles = [];
  const warnings = [];
  const consumedChildPaths = new Set();
  let recognizedTags = 0;

  walkNodes(root, (node, ancestors) => {
    const tag = localName(node.name);

    if (tag === 'sceneryobject') {
      recognizedTags += 1;
      const placement = extractPlacement(node);
      const objectChildren = node.children.filter((child) =>
        INSTANCE_CHILD_TAGS.has(localName(child.name))
      );

      if (objectChildren.length === 0 && isValidPlacement(placement)) {
        instances.push(
          buildInstance({
            sourceFile,
            node,
            objectNode: node,
            placement,
            sourceType: 'scenery-object',
          })
        );
      }

      for (const child of objectChildren) {
        consumedChildPaths.add(child.path);
        instances.push(
          buildInstance({
            sourceFile,
            node,
            objectNode: child,
            placement: mergePlacement(placement, extractPlacement(child)),
            sourceType: sourceTypeFromTag(child.name),
          })
        );
      }
    }

    if (INSTANCE_CHILD_TAGS.has(tag) && !consumedChildPaths.has(node.path)) {
      recognizedTags += 1;
      const nearestSceneryObject = [...ancestors]
        .reverse()
        .find((ancestor) => localName(ancestor.name) === 'sceneryobject');
      const placement = mergePlacement(
        nearestSceneryObject ? extractPlacement(nearestSceneryObject) : {},
        extractPlacement(node)
      );

      if (isValidPlacement(placement)) {
        instances.push(
          buildInstance({
            sourceFile,
            node: nearestSceneryObject ?? node,
            objectNode: node,
            placement,
            sourceType: sourceTypeFromTag(node.name),
          })
        );
      } else {
        warnings.push(`${sourceFile}: ${node.path} has no usable lat/lon placement`);
      }
    }

    if (LIGHT_ROW_TAGS.has(tag)) {
      recognizedTags += 1;
      const row = buildLightRow(node, sourceFile);
      if (row.vertices.length > 0) {
        lightRows.push(row);
      } else {
        warnings.push(`${sourceFile}: ${node.path} has no vertices`);
      }
    }

    if (EXISTING_EXCLUSION_TAGS.has(tag)) {
      recognizedTags += 1;
      existingExclusionRectangles.push(buildExistingExclusion(node, sourceFile));
    }
  });

  if (recognizedTags === 0) {
    warnings.push(`${sourceFile}: XML parsed but no supported MSFS scenery tags were found`);
  }

  return {
    instances,
    lightRows,
    existingExclusionRectangles,
    warnings,
  };
}

function buildInstance({ sourceFile, node, objectNode, placement, sourceType }) {
  const explicitGuid = firstAttribute(objectNode, [
    'guid',
    'Guid',
    'GUID',
    'modelLibGuid',
    'ModelLibGuid',
  ]);
  const rawName = firstAttribute(objectNode, ['name', 'Name']);
  const guid = explicitGuid ?? (isGuidLike(rawName) ? rawName : undefined);
  const name =
    firstAttribute(objectNode, [
      'displayName',
      'DisplayName',
      'title',
      'Title',
      'effectName',
      'EffectName',
      'containerTitle',
      'ContainerTitle',
    ]) ?? (isGuidLike(rawName) ? undefined : rawName);
  const scale = firstNumber(objectNode, ['scale', 'Scale']) ?? placement.scale;
  const classification = classifyObject({
    sourceType,
    rawTag: objectNode.name,
    guid,
    name,
    extraText: `${node.text ?? ''} ${objectNode.text ?? ''}`,
  });

  return {
    id: stableId(
      sourceFile,
      objectNode.path,
      placement.lat,
      placement.lon,
      guid ?? name ?? sourceType
    ),
    sourceFile,
    sourceType,
    lat: placement.lat,
    lon: placement.lon,
    ...(typeof placement.alt === 'number' ? { alt: placement.alt } : {}),
    ...(typeof placement.heading === 'number' ? { heading: placement.heading } : {}),
    ...(typeof placement.pitch === 'number' ? { pitch: placement.pitch } : {}),
    ...(typeof placement.bank === 'number' ? { bank: placement.bank } : {}),
    ...(typeof scale === 'number' ? { scale } : {}),
    ...(guid ? { guid } : {}),
    ...(name ? { name } : {}),
    rawTag: objectNode.name,
    classification: classification.classification,
    confidence: classification.confidence,
    classificationReasons: classification.reasons,
  };
}

function buildLightRow(node, sourceFile) {
  const vertices = findDescendants(node, (candidate) => {
    const tag = localName(candidate.name);
    return VERTEX_TAGS.has(tag) && isValidPlacement(extractPlacement(candidate));
  }).map((vertex) => {
    const placement = extractPlacement(vertex);
    return {
      lat: placement.lat,
      lon: placement.lon,
      ...(typeof placement.alt === 'number' ? { alt: placement.alt } : {}),
    };
  });

  const lightPresetNode = findDescendants(
    node,
    (candidate) => localName(candidate.name) === 'lightpreset'
  )[0];
  const preset =
    firstAttribute(node, [
      'preset',
      'lightPreset',
      'LightPreset',
      'lightPresetName',
      'name',
      'type',
    ]) ??
    (lightPresetNode
      ? firstAttribute(lightPresetNode, ['name', 'type', 'preset', 'lightPreset'])
      : undefined);
  const spacing =
    firstNumber(node, ['spacing', 'lightSpacing', 'LightSpacing', 'interval', 'spacingMeters']) ??
    (lightPresetNode ? firstNumber(lightPresetNode, ['spacing', 'lightSpacing']) : undefined);
  const snapToVertices = firstBoolean(node, [
    'snapToVertices',
    'SnapToVertices',
    'snapLightsToVertices',
  ]);
  const classification = classifyObject({
    sourceType: localName(node.name),
    rawTag: node.name,
    name: preset,
    extraText: `${node.text ?? ''} ${JSON.stringify(node.attributes)}`,
  });

  return {
    id: stableId(
      sourceFile,
      node.path,
      preset ?? '',
      vertices.map((v) => `${v.lat},${v.lon}`).join('|')
    ),
    sourceFile,
    sourceType: localName(node.name),
    rawTag: node.name,
    ...(preset ? { preset } : {}),
    ...(typeof spacing === 'number' ? { spacing } : {}),
    ...(typeof snapToVertices === 'boolean' ? { snapToVertices } : {}),
    vertices,
    classification: classification.classification,
    confidence: classification.confidence,
    classificationReasons: classification.reasons,
  };
}

function buildExistingExclusion(node, sourceFile) {
  const placement = extractPlacement(node);
  return {
    id: stableId(sourceFile, node.path, JSON.stringify(node.attributes)),
    sourceFile,
    rawTag: node.name,
    ...(isValidPlacement(placement) ? { lat: placement.lat, lon: placement.lon } : {}),
    ...(typeof placement.alt === 'number' ? { alt: placement.alt } : {}),
    attributes: node.attributes,
  };
}

function buildMustKeepZones(instances, lightRows, runwayLightZones) {
  const zones = [...runwayLightZones];

  for (const row of lightRows) {
    if (
      isTargetLightClassification(row.classification) ||
      !isSourceBackedLightRow(row) ||
      !Array.isArray(row.vertices) ||
      row.vertices.length === 0
    ) {
      continue;
    }
    const geometries = mustKeepGeometriesForRow(row);
    for (const [geometryIndex, geometry] of geometries.entries()) {
      zones.push({
        id:
          geometries.length === 1
            ? stableId('must-keep-row', row.id)
            : stableId('must-keep-row', row.id, 'continuous-run', geometryIndex),
        sourceId: row.id,
        sourceFile: row.sourceFile,
        sourceType: row.sourceType,
        sourceRecordOffset: row.sourceRecordOffset,
        preset: row.preset,
        classification: row.classification,
        lightType: 'source-light-row',
        geometryType: geometry.geometryType,
        ...(geometry.geometryType === 'Point'
          ? { point: geometry.point }
          : { vertices: geometry.vertices }),
        clearanceMeters: MUST_KEEP_ROW_CLEARANCE_METERS,
        sourceBasis: 'decoded-light-row',
        geometryMode:
          geometries.length === 1 ? 'decoded-source-geometry' : 'decoded-source-continuous-run',
        sourceVertexStartIndex: geometry.sourceVertexStartIndex,
        sourceVertexEndIndex: geometry.sourceVertexEndIndex,
        reason:
          geometries.length === 1
            ? `non-target ${row.classification} light row must be retained`
            : `non-target ${row.classification} light row retained without decoded discontinuity links`,
      });
    }
  }

  for (const instance of instances) {
    if (
      isTargetLightClassification(instance.classification) ||
      !isLikelyLightClassification(instance.classification) ||
      !Number.isFinite(instance.lat) ||
      !Number.isFinite(instance.lon)
    ) {
      continue;
    }
    zones.push({
      id: stableId('must-keep-instance', instance.id),
      sourceId: instance.id,
      sourceFile: instance.sourceFile,
      sourceType: instance.sourceType,
      sourceRecordOffset: instance.sourceRecordOffset,
      classification: instance.classification,
      lightType: 'source-light-instance',
      geometryType: 'Point',
      point: { lat: instance.lat, lon: instance.lon },
      clearanceMeters: MUST_KEEP_INSTANCE_CLEARANCE_METERS,
      sourceBasis: 'decoded-light-instance',
      geometryMode: 'decoded-source-position',
      reason: `non-target ${instance.classification} light instance must be retained`,
    });
  }

  return zones;
}

export function mustKeepGeometriesForRow(row) {
  const vertices = row?.vertices ?? [];
  if (vertices.length === 0) {
    return [];
  }
  if (vertices.length === 1 || row.sourceType !== 'bgl-airport-light-row') {
    return [geometryForVertexRun(vertices, 0)];
  }

  const linkDistances = [];
  for (let index = 1; index < vertices.length; index += 1) {
    linkDistances.push(haversineDistanceMeters(vertices[index - 1], vertices[index]));
  }
  // oxlint-disable-next-line react-doctor/js-tosorted-immutable -- The supported Node test runtime lacks Array.prototype.toSorted.
  const sortedDistances = [...linkDistances].sort((left, right) => left - right);
  const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)] ?? 0;
  const discontinuityDistance = Math.max(
    MUST_KEEP_DISCONTINUITY_MIN_METERS,
    medianDistance * MUST_KEEP_DISCONTINUITY_SPACING_MULTIPLIER
  );

  const runs = [];
  let startIndex = 0;
  for (let index = 1; index < vertices.length; index += 1) {
    if (linkDistances[index - 1] <= discontinuityDistance) {
      continue;
    }
    runs.push(geometryForVertexRun(vertices.slice(startIndex, index), startIndex));
    startIndex = index;
  }
  runs.push(geometryForVertexRun(vertices.slice(startIndex), startIndex));
  return runs;
}

function geometryForVertexRun(vertices, sourceVertexStartIndex) {
  return vertices.length === 1
    ? {
        geometryType: 'Point',
        point: vertices[0],
        sourceVertexStartIndex,
        sourceVertexEndIndex: sourceVertexStartIndex,
      }
    : {
        geometryType: 'LineString',
        vertices,
        sourceVertexStartIndex,
        sourceVertexEndIndex: sourceVertexStartIndex + vertices.length - 1,
      };
}

export function generateRemovalGeometry(instances, lightRows, sizes, mustKeepZones) {
  const groupingStartedAt = performance.now();
  const removalPolygons = [];
  const protectionConflicts = [];
  const mustKeepBounds = new Map(
    mustKeepZones.map((zone) => [zone.id, pointBounds(mustKeepGeometryPoints(zone))])
  );
  const mustKeepSpatialIndex = createMustKeepSpatialIndex(mustKeepZones, mustKeepBounds);
  const targetRows = lightRows.filter(
    (row) =>
      isTargetLightClassification(row.classification) &&
      isRemovalLightRow(row) &&
      Array.isArray(row.vertices) &&
      row.vertices.length > 0
  );
  const targetRowSourceInstanceIds = new Set(
    targetRows.flatMap((row) => row.sourceInstanceIds ?? [])
  );

  const removalGroups = buildRemovalGroups(targetRows, sizes.lightrow);
  const groupingMilliseconds = performance.now() - groupingStartedAt;
  const polygonBuildStartedAt = performance.now();
  for (const group of removalGroups) {
    const protectedGeometry = buildProtectedRemovalPolygons(
      group,
      mustKeepZones,
      mustKeepBounds,
      mustKeepSpatialIndex
    );
    protectionConflicts.push(...protectedGeometry.conflicts);
    for (const [index, protectedPolygon] of protectedGeometry.polygons.entries()) {
      removalPolygons.push({
        id:
          protectedGeometry.polygons.length === 1
            ? group.id
            : stableId(group.id, 'protected-segment', index),
        sourceRowId: group.sourceRowId,
        sourceRowIds: group.sourceRowIds,
        sourceFile: group.sourceFile,
        sourceType: group.sourceType,
        sourceRecordOffset: group.sourceRecordOffset,
        preset: group.preset,
        classification: group.classification,
        confidence: group.confidence,
        widthMeters: protectedPolygon.widthMeters,
        reason: protectedPolygon.reason ?? group.reason,
        coordinates: protectedPolygon.coordinates,
        geometrySignature: geometrySignatureForVertices(group.vertices),
        protectionApplied: protectedPolygon.protectionApplied,
        mustKeepZoneIds: protectedPolygon.mustKeepZoneIds,
        protectionMode: protectedPolygon.protectionMode,
        targetLightPointCount: protectedPolygon.targetLightPointCount,
        sourceClassifications: group.sourceClassifications ?? [group.classification],
        exclusionFlags: {
          excludeLibraryObjects: true,
          excludeVFX: true,
          excludeSimPropContainers: true,
        },
        ...(group.inferred ? { inferred: true } : {}),
        ...(group.inference ? { inference: group.inference } : {}),
        ...(group.sourceInstanceIds ? { sourceInstanceIds: group.sourceInstanceIds } : {}),
        ...(group.partialOverlapCombined ? { partialOverlapCombined: true } : {}),
      });
    }
  }
  const polygonBuildMilliseconds = performance.now() - polygonBuildStartedAt;

  const exclusionCandidates = [];
  const instanceBuildStartedAt = performance.now();

  for (const instance of instances) {
    if (!isTargetLightClassification(instance.classification)) {
      continue;
    }

    if (isCoveredByTargetRow(instance, targetRows, sizes.lightrow, targetRowSourceInstanceIds)) {
      continue;
    }

    const config = exclusionConfigForInstance(instance.sourceType, sizes);
    if (!config) {
      continue;
    }

    const protectedSquare = buildSafePointRemoval(
      instance,
      config.size,
      mustKeepZones,
      stableId('instance-removal', instance.id)
    );
    if (!protectedSquare.polygon) {
      protectionConflicts.push(protectedSquare.conflict);
      continue;
    }

    exclusionCandidates.push({
      id: stableId('exclusion', instance.id),
      sourceId: instance.id,
      lat: instance.lat,
      lon: instance.lon,
      widthMeters: protectedSquare.polygon.widthMeters,
      heightMeters: protectedSquare.polygon.widthMeters,
      coordinates: protectedSquare.polygon.coordinates,
      protectionApplied: protectedSquare.polygon.protectionApplied,
      mustKeepZoneIds: protectedSquare.polygon.mustKeepZoneIds,
      reason: `${instance.sourceType} classified as ${instance.classification}`,
      exclusionFlags: config.flags,
      confidence: instance.confidence,
    });
  }
  const instanceBuildMilliseconds = performance.now() - instanceBuildStartedAt;

  const conflictFilterStartedAt = performance.now();
  const removalRings = removalPolygons.map((polygon) => {
    const ring = coordinateRingPoints(polygon.coordinates);
    return { ring, bounds: pointBounds(ring) };
  });
  const unresolvedProtectionConflicts = protectionConflicts.filter(
    (conflict) =>
      !Number.isFinite(conflict.lat) ||
      !Number.isFinite(conflict.lon) ||
      !removalRings.some(
        ({ ring, bounds }) => pointWithinBounds(conflict, bounds) && pointInPolygon(conflict, ring)
      )
  );
  const conflictFilterMilliseconds = performance.now() - conflictFilterStartedAt;
  return {
    exclusionCandidates,
    removalPolygons,
    protectionConflicts: unresolvedProtectionConflicts,
    performance: {
      groupingMilliseconds,
      polygonBuildMilliseconds,
      instanceBuildMilliseconds,
      conflictFilterMilliseconds,
    },
  };
}

function buildProtectedRemovalPolygons(group, mustKeepZones, mustKeepBounds, mustKeepSpatialIndex) {
  const defaultRing = polylineCorridorPolygon(group.vertices, group.widthMeters);
  if (defaultRing.length === 0) {
    return { polygons: [], conflicts: [] };
  }

  const groupBounds = group._bounds ?? pointBounds(group.vertices);
  const nearbyZones = mustKeepZones.filter((zone) => {
    const maximumDistance =
      group.widthMeters / 2 + (zone.clearanceMeters ?? 0) + PROTECTION_GEOMETRY_TOLERANCE_METERS;
    return (
      boundsOverlapWithPaddingMeters(groupBounds, mustKeepBounds.get(zone.id), maximumDistance) &&
      distanceFromZoneToPolyline(zone, group.vertices) <= maximumDistance
    );
  });
  if (nearbyZones.length === 0) {
    const polygons = [
      {
        coordinates: defaultRing,
        widthMeters: group.widthMeters,
        protectionApplied: false,
        protectionMode: 'standard-corridor',
        mustKeepZoneIds: [],
      },
    ];
    const initiallyUncovered = group.targetPoints.filter(
      (point) => !pointInCoordinateRing(point, defaultRing)
    );
    for (const row of group.sourceRows ?? []) {
      const rowTargetPoints = targetLightPointsForRow(row);
      if (
        !rowTargetPoints.some((point) =>
          initiallyUncovered.some(
            (candidate) => normalizedVertexSignature(candidate) === normalizedVertexSignature(point)
          )
        )
      ) {
        continue;
      }
      const coordinates = polylineCorridorPolygon(row.vertices, group.widthMeters);
      if (coordinates.length > 0) {
        polygons.push({
          coordinates,
          widthMeters: group.widthMeters,
          protectionApplied: false,
          protectionMode: 'target-row-corridor-supplement',
          mustKeepZoneIds: [],
          reason: `${group.reason}; continuous source-row corridor retained at a grouped join`,
        });
      }
    }
    const uncoveredPoints = assignTargetPointCounts(polygons, group.targetPoints);
    return {
      polygons,
      conflicts: uncoveredPoints.map((point) => targetCoverageConflict(group, point, [])),
    };
  }

  const adaptive = buildAdaptiveCorridorSegments(group, nearbyZones, mustKeepSpatialIndex);
  const polygons = adaptive.segments.map((segment) => {
    const protectionApplied = segment.mustKeepZoneIds.length > 0;
    return {
      coordinates: segment.coordinates,
      widthMeters: group.widthMeters,
      protectionApplied,
      protectionMode: protectionApplied
        ? adaptive.segments.length === 1
          ? 'asymmetric-bent-corridor'
          : 'protected-continuous-corridor-segment'
        : 'continuous-corridor-segment',
      mustKeepZoneIds: segment.mustKeepZoneIds,
      reason: protectionApplied
        ? `${group.reason}; continuous corridor bent around ${segment.mustKeepZoneIds.length} must-keep light zones`
        : `${group.reason}; continuous corridor split only at a must-keep light zone`,
    };
  });
  const uncoveredPoints = assignTargetPointCounts(polygons, group.targetPoints);
  const conflicts = uncoveredPoints.map((point) => {
    // oxlint-disable-next-line react-doctor/js-combine-iterations -- Proximity filtering and ID projection are distinct safety-audit stages.
    const blockingZoneIds = nearbyZones
      .filter((zone) => {
        const proximity = nearestZonePoint(point, zone);
        return (
          proximity.inside ||
          proximity.distanceMeters <=
            (zone.clearanceMeters ?? 0) +
              MIN_SAFE_REMOVAL_HALF_WIDTH_METERS +
              PROTECTION_BEND_MARGIN_METERS
        );
      })
      .map((zone) => zone.id);
    return targetCoverageConflict(group, point, blockingZoneIds);
  });

  return { polygons, conflicts };
}

function buildAdaptiveCorridorSegments(group, zones, mustKeepSpatialIndex) {
  const points = densifyVertices(group.vertices, PROTECTION_SAMPLE_SPACING_METERS);
  if (points.length < 2) {
    return { segments: [] };
  }

  const halfWidth = group.widthMeters / 2;
  const samples = [];
  const targetPointSignatures = new Set(
    group.targetPoints.map((point) => normalizedVertexSignature(point))
  );
  const nearbyZoneIds = new Set(zones.map((zone) => zone.id));
  const maximumZoneDistance =
    halfWidth + mustKeepSpatialIndex.maximumClearanceMeters + PROTECTION_BEND_MARGIN_METERS;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = localVector(previous, next, point);
    const tangentLength = vectorLength(tangent);
    if (tangentLength <= 0.001) {
      continue;
    }
    const unit = { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
    const leftNormal = { x: -unit.y, y: unit.x };
    let leftWidth = halfWidth;
    let rightWidth = halfWidth;
    let blocked = false;
    const appliedZoneIds = new Set();

    for (const zone of mustKeepSpatialIndex.queryPoint(point, maximumZoneDistance)) {
      if (!nearbyZoneIds.has(zone.id)) {
        continue;
      }
      const proximity = nearestZonePoint(point, zone);
      const clearance = zone.clearanceMeters ?? 0;
      if (
        !proximity.inside &&
        proximity.distanceMeters >= halfWidth + clearance + PROTECTION_BEND_MARGIN_METERS
      ) {
        continue;
      }
      appliedZoneIds.add(zone.id);
      const allowedWidth = proximity.distanceMeters - clearance - PROTECTION_BEND_MARGIN_METERS;
      if (proximity.inside || allowedWidth < MIN_SAFE_REMOVAL_HALF_WIDTH_METERS) {
        blocked = true;
        continue;
      }

      const towardZone = localVector(point, proximity.point, point);
      const side = tangent.x * towardZone.y - tangent.y * towardZone.x;
      if (Math.abs(side) <= 0.001) {
        leftWidth = Math.min(leftWidth, allowedWidth);
        rightWidth = Math.min(rightWidth, allowedWidth);
      } else if (side > 0) {
        leftWidth = Math.min(leftWidth, allowedWidth);
      } else {
        rightWidth = Math.min(rightWidth, allowedWidth);
      }
    }

    samples.push({
      point,
      leftNormal,
      leftWidth,
      rightWidth,
      blocked,
      targetLightPoint: targetPointSignatures.has(normalizedVertexSignature(point)),
      mustKeepZoneIds: [...appliedZoneIds],
    });
  }

  const runs = [];
  let currentRun = [];
  for (const sample of samples) {
    if (sample.blocked) {
      if (currentRun.length >= 2) {
        runs.push(currentRun);
      }
      currentRun = [];
      continue;
    }
    currentRun.push(sample);
  }
  if (currentRun.length >= 2) {
    runs.push(currentRun);
  }

  const segments = [];
  for (const run of runs) {
    const safeSegments = splitAdaptiveRunIntoSafeSegments(run, zones);
    segments.push(...safeSegments.map((segment) => simplifyAdaptiveSegment(segment, zones)));
  }
  return { segments };
}

function splitAdaptiveRunIntoSafeSegments(samples, zones) {
  const candidate = adaptiveSegmentForSamples(samples);
  if (adaptiveSegmentIsSafe(candidate, samples, zones)) {
    return [candidate];
  }
  if (samples.length <= 2) {
    return [];
  }

  const midpoint = Math.floor(samples.length / 2);
  const split = [
    ...splitAdaptiveRunIntoSafeSegments(samples.slice(0, midpoint + 1), zones),
    ...splitAdaptiveRunIntoSafeSegments(samples.slice(midpoint), zones),
  ];
  if (split.length <= 1) {
    return split;
  }

  const merged = [];
  let current = split[0];
  for (const next of split.slice(1)) {
    const combinedSamples = [...current.samples, ...next.samples.slice(1)];
    const combined = adaptiveSegmentForSamples(combinedSamples);
    if (adaptiveSegmentIsSafe(combined, combinedSamples, zones)) {
      current = combined;
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);
  return merged;
}

function adaptiveSegmentForSamples(samples) {
  const left = [];
  const right = [];
  const mustKeepZoneIds = new Set();
  for (const sample of samples) {
    const leftPoint = offsetPointMeters(
      sample.point,
      sample.leftNormal.x * sample.leftWidth,
      sample.leftNormal.y * sample.leftWidth
    );
    const rightPoint = offsetPointMeters(
      sample.point,
      -sample.leftNormal.x * sample.rightWidth,
      -sample.leftNormal.y * sample.rightWidth
    );
    left.push([leftPoint.lon, leftPoint.lat]);
    right.push([rightPoint.lon, rightPoint.lat]);
    for (const zoneId of sample.mustKeepZoneIds) {
      mustKeepZoneIds.add(zoneId);
    }
  }
  return {
    coordinates: left.length >= 2 ? [...left, ...[...right].reverse(), left[0]] : [],
    leftCoordinates: left,
    rightCoordinates: right,
    mustKeepZoneIds: [...mustKeepZoneIds],
    samples,
  };
}

function simplifyAdaptiveSegment(segment, zones) {
  if (segment.leftCoordinates.length <= 2 || segment.rightCoordinates.length <= 2) {
    return segment;
  }

  for (const toleranceMeters of REMOVAL_SIMPLIFICATION_TOLERANCES_METERS) {
    const leftCoordinates = simplifyCoordinateLine(segment.leftCoordinates, toleranceMeters);
    const rightCoordinates = simplifyCoordinateLine(segment.rightCoordinates, toleranceMeters);
    const coordinates = [
      ...leftCoordinates,
      ...[...rightCoordinates].reverse(),
      leftCoordinates[0],
    ];
    const candidate = {
      ...segment,
      coordinates,
      leftCoordinates,
      rightCoordinates,
    };
    if (
      coordinates.length < segment.coordinates.length &&
      adaptiveSegmentIsSafe(candidate, segment.samples, zones)
    ) {
      return candidate;
    }
  }
  return segment;
}

function simplifyCoordinateLine(coordinates, toleranceMeters) {
  if (coordinates.length <= 2) {
    return [...coordinates];
  }
  const points = coordinates.map(([lon, lat]) => ({ lat, lon }));
  const kept = new Set([0, points.length - 1]);
  const ranges = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop();
    if (endIndex <= startIndex + 1) {
      continue;
    }
    const start = points[startIndex];
    const end = points[endIndex];
    let furthestIndex;
    let furthestDistance = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = pointToLocalSegmentDistanceMeters(points[index], start, end);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestDistance <= toleranceMeters || furthestIndex === undefined) {
      continue;
    }
    kept.add(furthestIndex);
    ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }
  return [...kept].sort((left, right) => left - right).map((index) => coordinates[index]);
}

function pointToLocalSegmentDistanceMeters(point, start, end) {
  const localPoint = localVector(start, point, start);
  const localEnd = localVector(start, end, start);
  const lengthSquared = localEnd.x * localEnd.x + localEnd.y * localEnd.y;
  if (lengthSquared <= 0.000001) {
    return vectorLength(localPoint);
  }
  const ratio = Math.max(
    0,
    Math.min(1, (localPoint.x * localEnd.x + localPoint.y * localEnd.y) / lengthSquared)
  );
  return vectorLength({
    x: localPoint.x - localEnd.x * ratio,
    y: localPoint.y - localEnd.y * ratio,
  });
}

function adaptiveSegmentIsSafe(segment, samples, zones) {
  if (segment.coordinates.length === 0) {
    return false;
  }
  const ring = coordinateRingPoints(segment.coordinates);
  const probeStride = Math.max(1, Math.ceil(samples.length / 128));
  for (let index = 0; index < samples.length; index += probeStride) {
    if (!pointInPolygon(samples[index].point, ring)) {
      return false;
    }
  }
  if (!pointInPolygon(samples.at(-1).point, ring)) {
    return false;
  }
  for (const sample of samples) {
    if (sample.targetLightPoint && !pointInPolygon(sample.point, ring)) {
      return false;
    }
  }

  const appliedZoneIds = new Set(segment.mustKeepZoneIds);
  const relevantZones = zones.filter((zone) => appliedZoneIds.has(zone.id));
  return isRemovalPointRingSafe(ring, relevantZones);
}

function assignTargetPointCounts(polygons, targetPoints) {
  const assigned = new Set();
  const polygonRings = polygons.map((polygon) => coordinateRingPoints(polygon.coordinates));
  for (const [polygonIndex, polygon] of polygons.entries()) {
    const ring = polygonRings[polygonIndex];
    let targetLightPointCount = 0;
    for (const point of targetPoints) {
      const signature = normalizedVertexSignature(point);
      if (!assigned.has(signature) && pointInPolygon(point, ring)) {
        assigned.add(signature);
        targetLightPointCount += 1;
      }
    }
    polygon.targetLightPointCount = targetLightPointCount;
  }
  return targetPoints.filter((point) => !assigned.has(normalizedVertexSignature(point)));
}

function targetCoverageConflict(group, point, mustKeepZoneIds) {
  return {
    id: stableId('must-keep-conflict', group.id, point.lat, point.lon, 'row-corridor'),
    ownerId: group.id,
    sourceRowId: group.sourceRowId,
    sourceRowIds: group.sourceRowIds,
    classification: group.classification,
    lat: point.lat,
    lon: point.lon,
    mustKeepZoneIds,
    reason:
      mustKeepZoneIds.length > 0
        ? 'target light point is too close to a must-keep light for a safe continuous row corridor'
        : 'target light point could not be covered by a valid continuous row corridor',
  };
}

function buildSafePointRemoval(point, requestedWidthMeters, zones, ownerId) {
  let halfWidth = requestedWidthMeters / 2;
  const appliedZoneIds = [];
  for (const zone of zones) {
    const proximity = nearestZonePoint(point, zone);
    const clearance = zone.clearanceMeters ?? 0;
    if (proximity.distanceMeters >= halfWidth * Math.SQRT2 + clearance) {
      continue;
    }
    appliedZoneIds.push(zone.id);
    const safeHalfWidth =
      (proximity.distanceMeters - clearance - PROTECTION_GEOMETRY_TOLERANCE_METERS) / Math.SQRT2;
    halfWidth = Math.min(halfWidth, safeHalfWidth);
  }

  if (!Number.isFinite(halfWidth) || halfWidth < MIN_SAFE_REMOVAL_HALF_WIDTH_METERS) {
    return {
      conflict: {
        id: stableId('must-keep-conflict', ownerId, point.lat, point.lon),
        ownerId,
        lat: point.lat,
        lon: point.lon,
        mustKeepZoneIds: appliedZoneIds,
        reason:
          'target light point is too close to a must-keep light for a safe origin-covering remover',
      },
    };
  }

  const widthMeters = halfWidth * 2;
  const coordinates = rectanglePolygonAround(point, widthMeters, widthMeters);
  // oxlint-disable-next-line react-doctor/js-set-map-lookups -- A point overlaps only a tiny number of zones, so constructing a Set would add overhead.
  const relevantZones = zones.filter((zone) => appliedZoneIds.includes(zone.id));
  if (!isRemovalRingSafe(coordinates, relevantZones)) {
    return {
      conflict: {
        id: stableId('must-keep-conflict', ownerId, point.lat, point.lon, 'validation'),
        ownerId,
        lat: point.lat,
        lon: point.lon,
        mustKeepZoneIds: appliedZoneIds,
        reason: 'candidate point remover did not pass the final must-keep geometry validation',
      },
    };
  }

  return {
    polygon: {
      coordinates,
      widthMeters,
      protectionApplied: appliedZoneIds.length > 0,
      mustKeepZoneIds: appliedZoneIds,
    },
  };
}

function nearestZonePoint(point, zone) {
  if (zone.geometryType === 'Point') {
    return {
      point: zone.point,
      distanceMeters: haversineDistanceMeters(point, zone.point),
      inside: false,
    };
  }
  if (zone.geometryType === 'Polygon') {
    return nearestPointOnPolygon(point, zone.vertices ?? []);
  }
  return {
    ...nearestPointOnPolyline(point, zone.vertices ?? []),
    inside: false,
  };
}

function distanceFromZoneToPolyline(zone, vertices) {
  if (zone.geometryType === 'Point') {
    return pointToPolylineDistanceMeters(zone.point, vertices);
  }
  if (zone.geometryType === 'Polygon') {
    if (vertices.some((point) => pointInPolygon(point, zone.vertices ?? []))) {
      return 0;
    }
    return polylineToPolylineDistanceMeters(vertices, closePointRing(zone.vertices ?? []));
  }
  return polylineToPolylineDistanceMeters(vertices, zone.vertices ?? []);
}

function isRemovalRingSafe(coordinates, zones) {
  const ring = coordinateRingPoints(coordinates);
  return isRemovalPointRingSafe(ring, zones);
}

function isRemovalPointRingSafe(ring, zones) {
  for (const zone of zones) {
    const clearance = zone.clearanceMeters ?? 0;
    if (zone.geometryType === 'Point') {
      if (
        pointInPolygon(zone.point, ring) ||
        pointToPolylineDistanceMeters(zone.point, ring) <
          clearance - PROTECTION_GEOMETRY_TOLERANCE_METERS
      ) {
        return false;
      }
      continue;
    }

    if (zone.geometryType === 'Polygon') {
      const zoneRing = closePointRing(zone.vertices ?? []);
      if (
        ring.some((point) => pointInPolygon(point, zoneRing)) ||
        zoneRing.some((point) => pointInPolygon(point, ring)) ||
        polylineToPolylineDistanceMeters(ring, zoneRing) <
          clearance - PROTECTION_GEOMETRY_TOLERANCE_METERS
      ) {
        return false;
      }
      continue;
    }

    const zoneVertices = zone.vertices ?? [];
    if (
      zoneVertices.some((point) => pointInPolygon(point, ring)) ||
      polylineToPolylineDistanceMeters(ring, zoneVertices) <
        clearance - PROTECTION_GEOMETRY_TOLERANCE_METERS
    ) {
      return false;
    }
  }
  return true;
}

function pointInCoordinateRing(point, coordinates) {
  return pointInPolygon(point, coordinateRingPoints(coordinates));
}

function coordinateRingPoints(coordinates) {
  return coordinates.map(([lon, lat]) => ({ lat, lon }));
}

function closePointRing(vertices) {
  if (vertices.length === 0) {
    return [];
  }
  return haversineDistanceMeters(vertices[0], vertices.at(-1)) <= 0.05
    ? [...vertices]
    : [...vertices, vertices[0]];
}

function densifyVertices(vertices, spacingMeters) {
  if (vertices.length <= 1) {
    return [...vertices];
  }
  const points = [];
  for (let index = 1; index < vertices.length; index += 1) {
    const start = vertices[index - 1];
    const end = vertices[index];
    const length = haversineDistanceMeters(start, end);
    const steps = Math.max(1, Math.ceil(length / spacingMeters));
    for (let step = 0; step < steps; step += 1) {
      points.push(interpolatePoint(start, end, step / steps));
    }
  }
  points.push(vertices.at(-1));
  return points;
}

function buildRemovalGroups(targetRows, widthMeters) {
  const groups = [];
  const duplicateGroups = new Map();
  const groupTokens = new WeakMap();
  const rejectedPairs = new Set();
  let nextGroupToken = 0;

  for (const row of targetRows) {
    const group = groupFromRow(row, widthMeters);
    const duplicateKey = `${group.groupKey}|${group.geometrySignature}`;
    const duplicate = duplicateGroups.get(duplicateKey);
    if (duplicate) {
      mergeGroupMetadata(duplicate, group);
    } else {
      groups.push(group);
      duplicateGroups.set(duplicateKey, group);
    }
  }

  const spatialIndex = createRemovalGroupSpatialIndex(groups);
  const indexesByGroup = new Map(groups.map((group, index) => [group, index]));
  const maximumWidthMeters = Math.max(0, ...groups.map((group) => group.widthMeters));

  const candidateIndexesFor = (group, predicate) => {
    const candidateIndexes = [];
    const candidates = spatialIndex.query(
      group,
      Math.max(group.widthMeters, maximumWidthMeters) + ROW_ENDPOINT_MERGE_TOLERANCE_METERS
    );
    candidates.forEach((candidate) => {
      const index = indexesByGroup.get(candidate);
      if (Number.isInteger(index) && predicate(index)) candidateIndexes.push(index);
    });
    return candidateIndexes.sort((a, b) => a - b);
  };

  const tryPair = (left, right) => {
    const pairKey = removalGroupPairKey(left, right, groupTokens, () => nextGroupToken++);
    // A failed comparison cannot change until one of its immutable group objects is replaced by a merge.
    if (rejectedPairs.has(pairKey)) return undefined;
    if (!removalGroupsMayInteract(left, right)) {
      rejectedPairs.add(pairKey);
      return undefined;
    }
    const merged = tryAbsorbCoveredGroup(left, right) ?? tryMergeRemovalGroups(left, right);
    if (!merged) rejectedPairs.add(pairKey);
    return merged;
  };

  const replacePair = (leftIndex, rightIndex, merged) => {
    const left = groups[leftIndex];
    const right = groups[rightIndex];
    merged._bounds = pointBounds(merged.vertices);
    spatialIndex.remove(left);
    spatialIndex.remove(right);
    groups[leftIndex] = merged;
    groups.splice(rightIndex, 1);
    spatialIndex.add(merged);
    indexesByGroup.delete(left);
    indexesByGroup.delete(right);
    for (let index = leftIndex; index < groups.length; index += 1) {
      indexesByGroup.set(groups[index], index);
    }
  };

  let leftIndex = 0;
  while (leftIndex < groups.length) {
    const left = groups[leftIndex];
    const rightIndex = candidateIndexesFor(left, (index) => index > leftIndex).find((index) => {
      const merged = tryPair(left, groups[index]);
      if (!merged) return false;
      replacePair(leftIndex, index, merged);
      return true;
    });
    if (rightIndex === undefined) {
      leftIndex += 1;
      continue;
    }

    // Only the new merged object can invalidate decisions made earlier in the scan.
    // Check it against earlier groups in their original order instead of restarting
    // the complete pair scan after every merge.
    let mergedEarlier = true;
    while (mergedEarlier) {
      mergedEarlier = false;
      const current = groups[leftIndex];
      for (const earlierIndex of candidateIndexesFor(current, (index) => index < leftIndex)) {
        const merged = tryPair(groups[earlierIndex], current);
        if (!merged) continue;
        replacePair(earlierIndex, leftIndex, merged);
        leftIndex = earlierIndex;
        mergedEarlier = true;
        break;
      }
    }
  }

  return groups;
}

function createRemovalGroupSpatialIndex(groups, cellSizeMeters = 25) {
  // oxlint-disable-next-line react-doctor/js-combine-iterations -- Bounds derivation and finite-value validation are intentionally separate geometry stages.
  const bounds = groups
    .map((group) => group._bounds ?? pointBounds(group.vertices))
    .filter((value) =>
      [value.minLat, value.maxLat, value.minLon, value.maxLon].every(Number.isFinite)
    );
  const maximumAbsoluteLatitude = bounds.reduce(
    (maximum, value) => Math.max(maximum, Math.abs(value.minLat), Math.abs(value.maxLat)),
    0
  );
  // Using the smallest metres-per-degree value across the indexed latitude range
  // makes longitude padding conservative, so the index cannot hide an interacting pair.
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos((maximumAbsoluteLatitude * Math.PI) / 180), 0.000001);
  const cells = new Map();
  const keysByGroup = new Map();

  const cellKeys = (group, paddingMeters = 0) => {
    const value = group._bounds ?? pointBounds(group.vertices);
    const minX = Math.floor((value.minLon * metersPerDegreeLon - paddingMeters) / cellSizeMeters);
    const maxX = Math.floor((value.maxLon * metersPerDegreeLon + paddingMeters) / cellSizeMeters);
    const minY = Math.floor(
      (value.minLat * METERS_PER_DEGREE_LAT - paddingMeters) / cellSizeMeters
    );
    const maxY = Math.floor(
      (value.maxLat * METERS_PER_DEGREE_LAT + paddingMeters) / cellSizeMeters
    );
    const keys = [];
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) keys.push(`${x},${y}`);
    }
    return keys;
  };

  const add = (group) => {
    const keys = cellKeys(group);
    keysByGroup.set(group, keys);
    for (const key of keys) {
      const entries = cells.get(key);
      if (entries) entries.add(group);
      else cells.set(key, new Set([group]));
    }
  };

  const remove = (group) => {
    for (const key of keysByGroup.get(group) ?? []) {
      const entries = cells.get(key);
      entries?.delete(group);
      if (entries?.size === 0) cells.delete(key);
    }
    keysByGroup.delete(group);
  };

  for (const group of groups) add(group);
  return {
    add,
    remove,
    query(group, paddingMeters) {
      const result = new Set();
      for (const key of cellKeys(group, paddingMeters)) {
        for (const candidate of cells.get(key) ?? []) result.add(candidate);
      }
      return [...result];
    },
  };
}

function removalGroupPairKey(left, right, tokens, createToken) {
  if (!tokens.has(left)) tokens.set(left, createToken());
  if (!tokens.has(right)) tokens.set(right, createToken());
  const leftToken = tokens.get(left);
  const rightToken = tokens.get(right);
  return leftToken < rightToken ? `${leftToken}|${rightToken}` : `${rightToken}|${leftToken}`;
}

function groupFromRow(row, widthMeters) {
  const sourceRowIds = row.sourceRowIds?.length ? row.sourceRowIds : [row.id];
  return {
    id: stableId('row-removal', row.id),
    sourceRowId: sourceRowIds[0],
    sourceRowIds,
    sourceFile: row.sourceFile,
    sourceType: row.sourceType,
    sourceRecordOffset: row.sourceRecordOffset,
    preset: row.preset,
    classification: row.classification,
    confidence: row.confidence,
    widthMeters,
    reason: `light row classified as ${row.classification}`,
    vertices: row.vertices,
    targetPoints: targetLightPointsForRow(row),
    sourceRows: [row],
    _bounds: pointBounds(row.vertices),
    geometrySignature: geometrySignatureForVertices(row.vertices),
    groupKey: [row.sourceFile, row.sourceType, row.classification, widthMeters].join('|'),
    ...(row.inferred ? { inferred: true } : {}),
    ...(row.inference ? { inference: row.inference } : {}),
    ...(row.sourceInstanceIds ? { sourceInstanceIds: row.sourceInstanceIds } : {}),
  };
}

function removalGroupsMayInteract(left, right) {
  return boundsOverlapWithPaddingMeters(
    left._bounds ?? pointBounds(left.vertices),
    right._bounds ?? pointBounds(right.vertices),
    Math.max(left.widthMeters, right.widthMeters) + ROW_ENDPOINT_MERGE_TOLERANCE_METERS
  );
}

function tryMergeRemovalGroups(left, right) {
  const partialOverlap = mergePartiallyOverlappingRows(left, right);
  if (partialOverlap) {
    return partialOverlap;
  }
  if (left.groupKey !== right.groupKey) {
    return undefined;
  }

  return mergeOverlappingSegments(left, right) ?? mergeContiguousRows(left, right);
}

function mergePartiallyOverlappingRows(left, right) {
  const maximumJoinDistanceMeters = Math.min(
    PARTIAL_OVERLAP_JOIN_MAX_METERS,
    left.widthMeters * 0.75
  );
  if (
    left.sourceFile !== right.sourceFile ||
    left.sourceType !== right.sourceType ||
    left.widthMeters !== right.widthMeters ||
    left.vertices.length < 2 ||
    right.vertices.length < 2 ||
    !paddedBoundsOverlap(left.vertices, right.vertices, left.widthMeters) ||
    !left.vertices.some((leftVertex) =>
      right.vertices.some(
        (rightVertex) =>
          haversineDistanceMeters(leftVertex, rightVertex) <= maximumJoinDistanceMeters
      )
    ) ||
    polylineToPolylineDistanceMeters(left.vertices, right.vertices) > left.widthMeters
  ) {
    return undefined;
  }

  const originalRings = [
    polylineCorridorPolygon(left.vertices, left.widthMeters),
    polylineCorridorPolygon(right.vertices, right.widthMeters),
  ].map(coordinateRingPoints);
  if (originalRings.some((ring) => ring.length < 3)) {
    return undefined;
  }

  const targetPoints = uniquePoints([...(left.targetPoints ?? []), ...(right.targetPoints ?? [])]);
  const candidates = [];
  for (const reverseLeft of [false, true]) {
    const leftVertices = reverseLeft ? [...left.vertices].reverse() : left.vertices;
    for (const reverseRight of [false, true]) {
      const rightVertices = reverseRight ? [...right.vertices].reverse() : right.vertices;
      for (let leftIndex = 0; leftIndex < leftVertices.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < rightVertices.length; rightIndex += 1) {
          const joinDistanceMeters = haversineDistanceMeters(
            leftVertices[leftIndex],
            rightVertices[rightIndex]
          );
          if (joinDistanceMeters > maximumJoinDistanceMeters) {
            continue;
          }

          const vertices = uniqueConsecutivePoints([
            ...leftVertices.slice(0, leftIndex + 1),
            ...rightVertices.slice(rightIndex + 1),
          ]);
          if (vertices.length < 2) {
            continue;
          }
          const coordinates = polylineCorridorPolygon(vertices, left.widthMeters);
          if (
            coordinates.length < 4 ||
            !targetPoints.every((point) => pointInCoordinateRing(point, coordinates))
          ) {
            continue;
          }
          candidates.push({ vertices, coordinates, joinDistanceMeters });
        }
      }
    }
  }
  candidates.sort(
    (leftCandidate, rightCandidate) =>
      leftCandidate.vertices.length - rightCandidate.vertices.length ||
      leftCandidate.joinDistanceMeters - rightCandidate.joinDistanceMeters
  );
  const best = candidates.find((candidate) =>
    removalBoundaryWithinExistingUnion(candidate.coordinates, originalRings)
  );
  if (!best) {
    return undefined;
  }

  const merged = mergedGroup(left, right, best.vertices);
  merged.partialOverlapCombined = true;
  merged.reason = `source-backed target light rows combined from ${merged.sourceRowIds.length} partially overlapping corridors without expanding removal area`;
  return merged;
}

function paddedBoundsOverlap(leftVertices, rightVertices, paddingMeters) {
  const left = pointBounds(leftVertices);
  const right = pointBounds(rightVertices);
  const paddingLat = paddingMeters / METERS_PER_DEGREE_LAT;
  const meanLat = (left.minLat + left.maxLat + right.minLat + right.maxLat) / 4;
  const paddingLon =
    paddingMeters /
    (METERS_PER_DEGREE_LAT * Math.max(Math.cos((meanLat * Math.PI) / 180), 0.000001));
  return (
    left.minLat <= right.maxLat + paddingLat &&
    left.maxLat >= right.minLat - paddingLat &&
    left.minLon <= right.maxLon + paddingLon &&
    left.maxLon >= right.minLon - paddingLon
  );
}

function pointBounds(points) {
  return points.reduce(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.lat),
      maxLat: Math.max(bounds.maxLat, point.lat),
      minLon: Math.min(bounds.minLon, point.lon),
      maxLon: Math.max(bounds.maxLon, point.lon),
    }),
    {
      minLat: Number.POSITIVE_INFINITY,
      maxLat: Number.NEGATIVE_INFINITY,
      minLon: Number.POSITIVE_INFINITY,
      maxLon: Number.NEGATIVE_INFINITY,
    }
  );
}

function boundsOverlapWithPaddingMeters(left, right, paddingMeters) {
  if (!left || !right) {
    return false;
  }
  const paddingLat = paddingMeters / METERS_PER_DEGREE_LAT;
  const meanLat = (left.minLat + left.maxLat + right.minLat + right.maxLat) / 4;
  const paddingLon =
    paddingMeters /
    (METERS_PER_DEGREE_LAT * Math.max(Math.cos((meanLat * Math.PI) / 180), 0.000001));
  return (
    left.minLat <= right.maxLat + paddingLat &&
    left.maxLat >= right.minLat - paddingLat &&
    left.minLon <= right.maxLon + paddingLon &&
    left.maxLon >= right.minLon - paddingLon
  );
}

function mustKeepGeometryPoints(zone) {
  if (zone.geometryType === 'Point' && zone.point) {
    return [zone.point];
  }
  return zone.vertices ?? [];
}

function createMustKeepSpatialIndex(zones, boundsById, cellSizeMeters = 20) {
  const finiteBounds = [...boundsById.values()].filter(
    (bounds) =>
      bounds && [bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon].every(Number.isFinite)
  );
  const referenceLatitude =
    finiteBounds.length > 0
      ? finiteBounds.reduce((sum, bounds) => sum + bounds.minLat + bounds.maxLat, 0) /
        (finiteBounds.length * 2)
      : 0;
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos((referenceLatitude * Math.PI) / 180), 0.000001);
  const cells = new Map();

  const cellRange = (bounds, paddingMeters = 0) => ({
    minX: Math.floor((bounds.minLon * metersPerDegreeLon - paddingMeters) / cellSizeMeters),
    maxX: Math.floor((bounds.maxLon * metersPerDegreeLon + paddingMeters) / cellSizeMeters),
    minY: Math.floor((bounds.minLat * METERS_PER_DEGREE_LAT - paddingMeters) / cellSizeMeters),
    maxY: Math.floor((bounds.maxLat * METERS_PER_DEGREE_LAT + paddingMeters) / cellSizeMeters),
  });

  for (const [index, zone] of zones.entries()) {
    const bounds = boundsById.get(zone.id);
    if (
      !bounds ||
      ![bounds.minLat, bounds.maxLat, bounds.minLon, bounds.maxLon].every(Number.isFinite)
    ) {
      continue;
    }
    const range = cellRange(bounds);
    for (let y = range.minY; y <= range.maxY; y += 1) {
      for (let x = range.minX; x <= range.maxX; x += 1) {
        const key = `${x},${y}`;
        const indexes = cells.get(key);
        if (indexes) indexes.push(index);
        else cells.set(key, [index]);
      }
    }
  }

  return {
    maximumClearanceMeters: Math.max(
      0,
      // oxlint-disable-next-line react-doctor/js-combine-iterations -- Extraction and numeric validation remain visible beside the Math.max input.
      ...zones.map((zone) => zone.clearanceMeters ?? 0).filter(Number.isFinite)
    ),
    queryPoint(point, paddingMeters) {
      const range = cellRange(
        {
          minLat: point.lat,
          maxLat: point.lat,
          minLon: point.lon,
          maxLon: point.lon,
        },
        paddingMeters
      );
      const indexes = new Set();
      for (let y = range.minY; y <= range.maxY; y += 1) {
        for (let x = range.minX; x <= range.maxX; x += 1) {
          for (const index of cells.get(`${x},${y}`) ?? []) indexes.add(index);
        }
      }
      return [...indexes].sort((left, right) => left - right).map((index) => zones[index]);
    },
  };
}

function pointWithinBounds(point, bounds) {
  return (
    point.lat >= bounds.minLat &&
    point.lat <= bounds.maxLat &&
    point.lon >= bounds.minLon &&
    point.lon <= bounds.maxLon
  );
}

function removalBoundaryWithinExistingUnion(coordinates, originalRings) {
  const boundary = coordinateRingPoints(coordinates);
  const samples = densifyVertices(boundary, PARTIAL_OVERLAP_BOUNDARY_SAMPLE_METERS);
  const indexedRings = originalRings.map((ring) => ({ ring, bounds: pointBounds(ring) }));
  return samples.every((point) =>
    indexedRings.some(
      ({ ring, bounds }) =>
        pointWithinPaddedBounds(point, bounds, 0.002) && pointInPolygon(point, ring)
    )
  );
}

function pointWithinPaddedBounds(point, bounds, paddingMeters) {
  const paddingLat = paddingMeters / METERS_PER_DEGREE_LAT;
  const maximumAbsoluteLatitude = Math.max(
    Math.abs(point.lat),
    Math.abs(bounds.minLat),
    Math.abs(bounds.maxLat)
  );
  const paddingLon =
    paddingMeters /
    (METERS_PER_DEGREE_LAT *
      Math.max(Math.cos((maximumAbsoluteLatitude * Math.PI) / 180), 0.000001));
  return (
    point.lat >= bounds.minLat - paddingLat &&
    point.lat <= bounds.maxLat + paddingLat &&
    point.lon >= bounds.minLon - paddingLon &&
    point.lon <= bounds.maxLon + paddingLon
  );
}

function uniqueConsecutivePoints(points) {
  const result = [];
  for (const point of points) {
    if (
      result.length === 0 ||
      haversineDistanceMeters(result.at(-1), point) > PROTECTION_GEOMETRY_TOLERANCE_METERS
    ) {
      result.push(point);
    }
  }
  return result;
}

function tryAbsorbCoveredGroup(left, right) {
  if (isPolylineCoveredByGroup(right.vertices, left)) {
    return mergeCoveredGroup(left, right);
  }

  if (isPolylineCoveredByGroup(left.vertices, right)) {
    return mergeCoveredGroup(right, left);
  }

  return undefined;
}

function mergeCoveredGroup(covering, covered) {
  const merged = { ...covering };
  mergeGroupMetadata(merged, covered);
  merged.id = stableId('row-removal', merged.sourceRowIds.join('|'));
  merged.reason = `source-backed ${merged.classification} light rows combined from ${merged.sourceRowIds.length} covered or overlapping row segments`;
  return merged;
}

function isPolylineCoveredByGroup(vertices, group) {
  if (vertices.length === 0 || group.vertices.length === 0) {
    return false;
  }

  const maxDistanceMeters = Math.max(
    MIN_SAFE_REMOVAL_HALF_WIDTH_METERS,
    group.widthMeters / 2 - PROTECTION_BEND_MARGIN_METERS
  );
  return polylineProbePoints(vertices).every(
    (point) => pointToPolylineDistanceMeters(point, group.vertices) <= maxDistanceMeters
  );
}

function polylineProbePoints(vertices) {
  const points = [...vertices];
  for (let index = 1; index < vertices.length; index += 1) {
    points.push(interpolatePoint(vertices[index - 1], vertices[index], 0.25));
    points.push(interpolatePoint(vertices[index - 1], vertices[index], 0.5));
    points.push(interpolatePoint(vertices[index - 1], vertices[index], 0.75));
  }
  return points;
}

function mergeOverlappingSegments(left, right) {
  if (left.vertices.length !== 2 || right.vertices.length !== 2) {
    return undefined;
  }

  const leftStart = left.vertices[0];
  const leftEnd = left.vertices[1];
  const rightStart = right.vertices[0];
  const rightEnd = right.vertices[1];
  const axis = localVector(leftStart, leftEnd, leftStart);
  const axisLength = vectorLength(axis);
  if (axisLength <= ROW_ENDPOINT_MERGE_TOLERANCE_METERS) {
    return undefined;
  }

  const rightAxis = localVector(rightStart, rightEnd, leftStart);
  if (undirectedAngleDegrees(axis, rightAxis) > ROW_MERGE_ANGLE_TOLERANCE_DEGREES) {
    return undefined;
  }

  if (
    pointToInfiniteLineDistanceMeters(rightStart, leftStart, leftEnd) >
      ROW_LINE_MERGE_TOLERANCE_METERS ||
    pointToInfiniteLineDistanceMeters(rightEnd, leftStart, leftEnd) >
      ROW_LINE_MERGE_TOLERANCE_METERS
  ) {
    return undefined;
  }

  const axisUnit = { x: axis.x / axisLength, y: axis.y / axisLength };
  const endpoints = [leftStart, leftEnd, rightStart, rightEnd].map((point) => ({
    point,
    projection: projectPointMeters(point, leftStart, axisUnit),
  }));
  const leftInterval = intervalFor(endpoints[0].projection, endpoints[1].projection);
  const rightInterval = intervalFor(endpoints[2].projection, endpoints[3].projection);
  if (intervalGapMeters(leftInterval, rightInterval) > ROW_ENDPOINT_MERGE_TOLERANCE_METERS) {
    return undefined;
  }

  endpoints.sort((a, b) => a.projection - b.projection);
  return mergedGroup(left, right, [endpoints[0].point, endpoints[endpoints.length - 1].point]);
}

function mergeContiguousRows(left, right) {
  const candidates = [
    [left.vertices, right.vertices],
    [right.vertices, left.vertices],
    [left.vertices, [...right.vertices].reverse()],
    [[...right.vertices].reverse(), left.vertices],
  ];

  for (const [first, second] of candidates) {
    const endpointGapMeters = haversineDistanceMeters(first.at(-1), second[0]);
    if (
      endpointGapMeters <= ROW_ENDPOINT_MERGE_TOLERANCE_METERS &&
      isStraightContinuation(first, second)
    ) {
      return mergedGroup(
        left,
        right,
        endpointGapMeters <= ROW_LINE_MERGE_TOLERANCE_METERS
          ? [...first, ...second.slice(1)]
          : [...first, ...second]
      );
    }
  }

  return undefined;
}

function isStraightContinuation(first, second) {
  if (first.length < 2 || second.length < 2) {
    return false;
  }

  const join = first.at(-1);
  const incoming = localVector(first.at(-2), join, join);
  const outgoing = localVector(join, second[1], join);
  return angleDegrees(incoming, outgoing) <= ROW_MERGE_ANGLE_TOLERANCE_DEGREES;
}

function mergedGroup(left, right, vertices) {
  const merged = {
    ...left,
    vertices,
    geometrySignature: geometrySignatureForVertices(vertices),
  };
  mergeGroupMetadata(merged, right);
  merged.id = stableId('row-removal', merged.sourceRowIds.join('|'));
  merged.reason =
    merged.sourceRowIds.length > 1
      ? `source-backed ${merged.classification} light rows combined from ${merged.sourceRowIds.length} overlapping or contiguous row segments`
      : left.reason;
  return merged;
}

function mergeGroupMetadata(target, source) {
  target.sourceRowIds = [...new Set([...target.sourceRowIds, ...source.sourceRowIds])];
  target.targetPoints = uniquePoints([
    ...(target.targetPoints ?? []),
    ...(source.targetPoints ?? []),
  ]);
  target.sourceRows = [...(target.sourceRows ?? []), ...(source.sourceRows ?? [])].filter(
    (row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index
  );
  target.sourceClassifications = [
    ...new Set([
      ...(target.sourceClassifications ?? [target.classification]),
      ...(source.sourceClassifications ?? [source.classification]),
    ]),
  ];
  target.sourceRecordOffset =
    target.sourceRecordOffset === source.sourceRecordOffset ? target.sourceRecordOffset : undefined;
  target.preset = target.preset === source.preset ? target.preset : undefined;
  if (source.sourceInstanceIds) {
    target.sourceInstanceIds = [
      ...new Set([...(target.sourceInstanceIds ?? []), ...source.sourceInstanceIds]),
    ];
  }
}

function targetLightPointsForRow(row) {
  if (row.snapToVertices === false && Number.isFinite(row.spacing) && row.spacing > 0) {
    return interpolatePolyline(row.vertices, row.spacing);
  }
  return uniquePoints(row.vertices);
}

function uniquePoints(points) {
  const seen = new Set();
  const unique = [];
  for (const point of points) {
    const signature = normalizedVertexSignature(point);
    if (!seen.has(signature)) {
      seen.add(signature);
      unique.push(point);
    }
  }
  return unique;
}

function geometrySignatureForVertices(vertices) {
  const forward = vertices.map(normalizedVertexSignature).join('|');
  const reverse = vertices.map(normalizedVertexSignature).reverse().join('|');
  return forward <= reverse ? forward : reverse;
}

function localVector(start, end, origin) {
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.000001);
  return {
    x: (end.lon - start.lon) * metersPerDegreeLon,
    y: (end.lat - start.lat) * METERS_PER_DEGREE_LAT,
  };
}

function vectorLength(vector) {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
}

function angleDegrees(left, right) {
  const leftLength = vectorLength(left);
  const rightLength = vectorLength(right);
  if (leftLength <= 0 || rightLength <= 0) {
    return 180;
  }

  const cosine = Math.max(
    -1,
    Math.min(1, (left.x * right.x + left.y * right.y) / (leftLength * rightLength))
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

function undirectedAngleDegrees(left, right) {
  const angle = angleDegrees(left, right);
  return Math.min(angle, 180 - angle);
}

function pointToInfiniteLineDistanceMeters(point, lineStart, lineEnd) {
  const line = localVector(lineStart, lineEnd, lineStart);
  const pointVector = localVector(lineStart, point, lineStart);
  const length = vectorLength(line);
  if (length <= 0) {
    return haversineDistanceMeters(point, lineStart);
  }

  return Math.abs(line.x * pointVector.y - line.y * pointVector.x) / length;
}

function projectPointMeters(point, origin, axisUnit) {
  const vector = localVector(origin, point, origin);
  return vector.x * axisUnit.x + vector.y * axisUnit.y;
}

function intervalFor(left, right) {
  return {
    min: Math.min(left, right),
    max: Math.max(left, right),
  };
}

function intervalGapMeters(left, right) {
  return Math.max(0, Math.max(left.min, right.min) - Math.min(left.max, right.max));
}

function isSourceBackedLightRow(row) {
  return !row.inferred && SOURCE_BACKED_LIGHT_ROW_TYPES.has(row.sourceType);
}

function isRemovalLightRow(row) {
  return (
    isSourceBackedLightRow(row) ||
    (row.inferred === true && INFERRED_REMOVAL_LIGHT_ROW_TYPES.has(row.sourceType))
  );
}

function normalizedVertexSignature(vertex) {
  return `${vertex.lat.toFixed(7)},${vertex.lon.toFixed(7)}`;
}

function isCoveredByTargetRow(instance, targetRows, widthMeters, sourceInstanceIds) {
  if (sourceInstanceIds.has(instance.id)) {
    return true;
  }
  return targetRows.some((row) => {
    const rowWidth = Math.max(widthMeters, 1);
    return pointToPolylineDistanceMeters(instance, row.vertices) <= rowWidth / 2;
  });
}

function exclusionConfigForInstance(sourceType, sizes) {
  if (sourceType === 'library-object') {
    return {
      size: sizes.library,
      flags: { excludeLibraryObjects: true },
    };
  }

  if (sourceType === 'visual-effect') {
    return {
      size: sizes.vfx,
      flags: { excludeVFX: true },
    };
  }

  if (sourceType === 'simprop-container') {
    return {
      size: sizes.simprop,
      flags: { excludeSimPropContainers: true },
    };
  }

  return null;
}

function isGuidLike(value) {
  return (
    typeof value === 'string' &&
    /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(value.trim())
  );
}

function extractPlacement(node) {
  return {
    ...numberProperty(node, 'lat', ['lat', 'latitude', 'Latitude']),
    ...numberProperty(node, 'lon', ['lon', 'lng', 'longitude', 'Longitude']),
    ...numberProperty(node, 'alt', ['alt', 'altitude', 'Altitude']),
    ...numberProperty(node, 'heading', ['heading', 'Heading', 'hdg']),
    ...numberProperty(node, 'pitch', ['pitch', 'Pitch']),
    ...numberProperty(node, 'bank', ['bank', 'Bank']),
    ...numberProperty(node, 'scale', ['scale', 'Scale']),
  };
}

function mergePlacement(primary, secondary) {
  return {
    ...primary,
    ...Object.fromEntries(
      Object.entries(secondary).filter(([, value]) => typeof value === 'number')
    ),
  };
}

function numberProperty(node, property, names) {
  const number = firstNumber(node, names);
  return typeof number === 'number' ? { [property]: number } : {};
}

function firstAttribute(node, names) {
  for (const name of names) {
    if (node.attributes && Object.prototype.hasOwnProperty.call(node.attributes, name)) {
      return node.attributes[name];
    }
  }

  const lowerNameMap = new Map(
    Object.entries(node.attributes ?? {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  for (const name of names) {
    const value = lowerNameMap.get(name.toLowerCase());
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function firstNumber(node, names) {
  const value = firstAttribute(node, names);
  return parseNumeric(value);
}

function firstBoolean(node, names) {
  const value = firstAttribute(node, names);
  if (value === undefined) {
    return undefined;
  }

  if (/^(true|1|yes)$/i.test(value)) {
    return true;
  }
  if (/^(false|0|no)$/i.test(value)) {
    return false;
  }
  return undefined;
}

function parseNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const stringValue = String(value).trim();
  const match = stringValue.match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) {
    return undefined;
  }

  let number = Number.parseFloat(match[0]);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  if (/[SW]\s*$/i.test(stringValue) && number > 0) {
    number *= -1;
  }

  return number;
}

function isValidPlacement(placement) {
  return Number.isFinite(placement.lat) && Number.isFinite(placement.lon);
}

function sourceTypeFromTag(tagName) {
  const tag = localName(tagName);
  if (tag === 'libraryobject') {
    return 'library-object';
  }
  if (tag === 'visualeffectobject') {
    return 'visual-effect';
  }
  if (tag === 'simpropcontainer') {
    return 'simprop-container';
  }
  if (tag === 'sceneryobject') {
    return 'scenery-object';
  }
  return 'unknown';
}
