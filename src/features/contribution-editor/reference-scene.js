/* oxlint-disable react-doctor/js-cache-property-access react-doctor/js-combine-iterations react-doctor/js-flatmap-filter -- Reference-scene construction keeps source normalization, validation, and projection stages separate for diagnostics. */

import { stableId } from '../draft-generator/extractor/classify.js';
import { consolidateCoLocatedSimulatorRows } from '../draft-generator/matching.js';
import { markingPatternName, withAptMarkingFallbackProperties } from './marking-patterns.js';
import { xPlaneLinePhysicalWidth } from './scenery-texture.js';

export const SNAP_CATEGORIES = Object.freeze([
  {
    id: 'light-rows',
    label: 'Lights',
    description: 'Rows and individual fixtures',
    color: '#38bdf8',
  },
  {
    id: 'painted-lines',
    label: 'Markings',
    description: 'Painted centre and hold lines',
    color: '#facc15',
  },
  {
    id: 'taxiway-centrelines',
    label: 'Centrelines',
    description: 'Simulator taxi guidance',
    color: '#4ade80',
  },
  {
    id: 'runways',
    label: 'Runways',
    description: 'Surfaces and centrelines',
    color: '#fb7185',
  },
  {
    id: 'pavement-edges',
    label: 'Pavement',
    description: 'Exact surfaces and boundaries',
    color: '#a1a1aa',
  },
  {
    id: 'fixtures',
    label: 'Individual fixtures',
    description: 'Placed lighting objects and anchors',
    color: '#f97316',
  },
]);

export function buildReferenceScene(data, simulator) {
  const features = [];
  const seen = new Set();
  const renderedDsfLines = new Set();
  const mustKeepSourceIds = new Set();
  for (const zone of data.mustKeepZones ?? []) {
    const sourceId = String(zone.sourceId ?? '');
    if (sourceId) mustKeepSourceIds.add(sourceId);
  }
  const append = (feature) => {
    const sourceId = String(feature.properties?.sourceId ?? feature.id ?? '');
    const sourceIds = [sourceId, ...(feature.properties?.sourceRowIds ?? []).map(String)];
    const mustKeep = sourceIds.some((id) => mustKeepSourceIds.has(id));
    const key = `${sourceId}:${feature.geometry?.type}:${JSON.stringify(feature.geometry?.coordinates)}`;
    if (!sourceId || !feature.geometry || seen.has(key)) return;
    seen.add(key);
    const semanticType = String(feature.properties?.semanticType ?? '');
    const msfsRemovalTarget =
      simulator === 'msfs' &&
      ['stopbar', 'lead-on', 'taxi-centerline'].includes(semanticType) &&
      !mustKeep &&
      feature.properties?.removable !== false;
    features.push(
      simulator === 'msfs'
        ? {
            ...feature,
            properties: {
              ...feature.properties,
              mustKeep,
              msfsRemovalTarget,
            },
          }
        : feature
    );
    const dsfLineKey = xplaneDsfVisualLineKey(feature);
    if (dsfLineKey) renderedDsfLines.add(dsfLineKey);
  };

  const appendRows = () => {
    const lightRows =
      simulator === 'msfs'
        ? consolidateCoLocatedSimulatorRows(data.lightRows ?? [])
        : (data.lightRows ?? []);
    for (const row of lightRows) {
      const feature = normalizeFeature(referenceFromRow(row, simulator), simulator);
      if (
        row.sourceType === 'xplane-dsf-painted-line' &&
        renderedDsfLines.has(xplaneDsfVisualLineKey(feature))
      ) {
        continue;
      }
      append(feature);
    }
  };
  if (simulator === 'msfs') appendRows();
  for (const feature of data.referenceFeatures ?? []) append(normalizeFeature(feature, simulator));
  if (simulator !== 'msfs') appendRows();
  for (const runway of data.runways ?? []) {
    for (const feature of referencesFromRunway(runway, simulator, data)) {
      append(normalizeFeature(feature, simulator));
    }
  }
  for (const instance of data.instances ?? []) {
    if (!Number.isFinite(instance.lat) || !Number.isFinite(instance.lon)) continue;
    append({
      type: 'Feature',
      id: instance.id,
      geometry: { type: 'Point', coordinates: [instance.lon, instance.lat] },
      properties: {
        featureType: 'simulator-reference',
        sourceId: String(instance.id),
        sourceType: instance.sourceType || 'placed-object',
        sourceFile: instance.sourceFile || '',
        dsfRemoval: instance.dsfRemoval ?? null,
        removable: instance.removalEligible !== false,
        removalCapability: instance.removalCapability ?? '',
        title: instance.name || instance.classification || 'Placed fixture',
        semanticType: instance.classification || 'fixture',
        snapCategory: 'fixtures',
        exactness: 'exact',
        heading: Number(instance.heading) || 0,
        simulator,
      },
    });
  }

  const preferredFeatures =
    simulator === 'xplane' ? preferSourceBackedRunwayMarkings(features) : features;
  return {
    version: 3,
    simulator,
    features: preferredFeatures,
    bounds: featureBounds(preferredFeatures),
    categories: SNAP_CATEGORIES,
    diagnostics: data.referenceDiagnostics ?? null,
  };
}

export function referenceTexturePattern(feature) {
  const properties = feature?.properties ?? {};
  return feature?.geometry?.type === 'LineString'
    ? properties.renderPattern || properties.texturePattern || ''
    : properties.texturePattern || properties.renderPattern || '';
}

export function normalizeReferenceScene(scene) {
  if (!scene || !Array.isArray(scene.features)) return scene;
  if (scene.simulator === 'msfs') {
    const categorized = normalizeMsfsReferenceCategories(scene);
    if (categorized.version >= 3) return categorized;
    const features = consolidateCachedMsfsLightRows(categorized.features);
    return {
      ...categorized,
      version: 3,
      features,
      bounds: featureBounds(features),
    };
  }
  if (scene.simulator !== 'xplane') return scene;
  const preferredFeatures = preferSourceBackedRunwayMarkings(scene.features);
  const visualDsfLines = new Set(
    preferredFeatures
      .filter((feature) => feature.properties?.sourceType === 'xplane-dsf-lin')
      .map(xplaneDsfVisualLineKey)
      .filter(Boolean)
  );
  let changed = false;
  const features = [];
  if (preferredFeatures !== scene.features) changed = true;
  for (const feature of preferredFeatures) {
    const originalProperties = feature.properties ?? {};
    const fallbackProperties = withAptMarkingFallbackProperties(originalProperties);
    const textureNoAlpha = xPlaneTextureIgnoresAlpha(fallbackProperties);
    const texturePattern = opaqueTexturePattern(fallbackProperties.texturePattern, textureNoAlpha);
    const migrateFallback = fallbackProperties !== originalProperties;
    const migrateNoAlpha = textureNoAlpha && fallbackProperties.textureNoAlpha !== true;
    const migratePattern = texturePattern !== String(fallbackProperties.texturePattern ?? '');
    const properties =
      migrateFallback || migrateNoAlpha || migratePattern
        ? {
            ...fallbackProperties,
            ...(migrateNoAlpha ? { textureNoAlpha: true } : {}),
            ...(migratePattern ? { texturePattern } : {}),
          }
        : fallbackProperties;
    const texturePropertiesChanged = properties !== originalProperties;
    if (
      properties.sourceType === 'xplane-dsf-painted-line' &&
      visualDsfLines.has(xplaneDsfVisualLineKey(feature))
    ) {
      changed = true;
      continue;
    }
    if (feature.geometry?.type !== 'LineString') {
      if (texturePropertiesChanged) changed = true;
      features.push(texturePropertiesChanged ? { ...feature, properties } : feature);
      continue;
    }
    const widthMeters = xPlaneLinePhysicalWidth(properties, null);
    const renderPattern = normalizedLineRenderPattern(properties);
    if (
      widthMeters === properties.widthMeters &&
      renderPattern === properties.renderPattern &&
      !texturePropertiesChanged
    ) {
      features.push(feature);
      continue;
    }
    changed = true;
    features.push({
      ...feature,
      properties: {
        ...properties,
        widthMeters,
        renderPattern,
      },
    });
  }
  return changed ? { ...scene, features } : scene;
}

function consolidateCachedMsfsLightRows(features) {
  const candidates = [];
  const retained = [];
  const sourceFeatures = new Map();
  for (const feature of features ?? []) {
    const properties = feature.properties ?? {};
    if (
      feature.geometry?.type !== 'LineString' ||
      properties.snapCategory !== 'light-rows' ||
      properties.msfsRemovalTarget !== true
    ) {
      retained.push(feature);
      continue;
    }
    const sourceId = String(properties.sourceId ?? feature.id ?? '');
    const row = {
      id: sourceId,
      sourceFile: properties.sourceFile || '',
      sourceType: properties.sourceType || 'bgl-airport-light-row',
      classification: properties.semanticType || 'taxi-centerline',
      removalEligible: properties.removable !== false,
      vertices: feature.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
    };
    candidates.push(row);
    sourceFeatures.set(sourceId, feature);
  }
  const rows = consolidateCoLocatedSimulatorRows(candidates);
  const consolidated = rows.map((row) => {
    const sourceIds = row.sourceRowIds ?? [row.id];
    const anchor = sourceFeatures.get(String(sourceIds[0])) ?? sourceFeatures.get(String(row.id));
    if (!anchor || sourceIds.length === 1) return anchor;
    return {
      ...anchor,
      id: row.id,
      geometry: {
        type: 'LineString',
        coordinates: row.vertices.map((vertex) => [vertex.lon, vertex.lat]),
      },
      properties: {
        ...anchor.properties,
        sourceId: String(row.id),
        sourceRowIds: sourceIds.map(String),
        sourceType: row.sourceType,
        removable: row.removalEligible !== false,
      },
    };
  });
  return [...retained, ...consolidated.filter(Boolean)];
}

function normalizeMsfsReferenceCategories(scene) {
  let changed = false;
  const features = scene.features.map((feature) => {
    if (feature.properties?.snapCategory) return feature;
    const snapCategory = msfsReferenceCategory(feature.properties?.sourceType);
    if (!snapCategory) return feature;
    changed = true;
    return { ...feature, properties: { ...feature.properties, snapCategory } };
  });
  return changed ? { ...scene, features } : scene;
}

export function preferSourceBackedRunwayMarkings(features) {
  const sourceMarkings = (features ?? [])
    .filter((feature) => {
      const properties = feature.properties ?? {};
      return (
        String(properties.sourceType || '').startsWith('xplane-dsf-') &&
        properties.snapCategory === 'painted-lines' &&
        Boolean(properties.texturePattern || properties.renderPattern)
      );
    })
    .map((feature) => ({ feature, bounds: featureBounds([feature]) }))
    .filter((source) => source.bounds);
  if (sourceMarkings.length === 0) return features;

  let changed = false;
  const preferred = (features ?? []).filter((feature) => {
    const properties = feature.properties ?? {};
    if (
      properties.sourceType !== 'xplane-apt-runway-generated' ||
      properties.semanticType !== 'runway-marking'
    ) {
      return true;
    }
    const bounds = featureBounds([feature]);
    const coveredBySource =
      bounds &&
      sourceMarkings.some(
        (source) =>
          boundsContain(source.bounds, bounds) &&
          geometryCoversFeature(source.feature.geometry, feature.geometry)
      );
    if (coveredBySource) changed = true;
    return !coveredBySource;
  });
  return changed ? preferred : features;
}

function boundsContain(outer, inner) {
  return (
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  );
}

function boundsOverlap(left, right) {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

function geometryCoversFeature(sourceGeometry, targetGeometry) {
  if (!['Polygon', 'MultiPolygon'].includes(sourceGeometry?.type)) return false;
  const samples = geometryCoveragePoints(targetGeometry);
  return samples.length > 0 && samples.every((point) => pointInGeometry(point, sourceGeometry));
}

function geometryCoveragePoints(geometry) {
  if (geometry?.type === 'Point') return [geometry.coordinates];
  if (geometry?.type === 'LineString') {
    const coordinates = geometry.coordinates ?? [];
    if (coordinates.length === 0) return [];
    const samples = [coordinates[0], coordinates.at(-1)];
    for (const fraction of [0.25, 0.5, 0.75]) {
      const index = Math.min(coordinates.length - 1, Math.floor(fraction * coordinates.length));
      samples.push(coordinates[index]);
    }
    return samples;
  }
  if (geometry?.type === 'Polygon') {
    const ring = geometry.coordinates?.[0] ?? [];
    if (ring.length === 0) return [];
    const vertices = ring.slice(0, -1);
    const centroid = vertices.reduce(
      (total, coordinate) => [total[0] + coordinate[0], total[1] + coordinate[1]],
      [0, 0]
    );
    return [
      ...vertices,
      [centroid[0] / Math.max(1, vertices.length), centroid[1] / Math.max(1, vertices.length)],
    ];
  }
  return [];
}

function pointInGeometry(point, geometry) {
  if (geometry?.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).some((polygon) => pointInPolygon(point, polygon));
  }
  return false;
}

function pointInPolygon(point, rings) {
  const [outer, ...holes] = rings ?? [];
  return (
    Boolean(outer) && pointInRing(point, outer) && !holes.some((hole) => pointInRing(point, hole))
  );
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (pointOnSegment(point, start, end)) return true;
    const crosses =
      end[1] > point[1] !== start[1] > point[1] &&
      point[0] < ((start[0] - end[0]) * (point[1] - end[1])) / (start[1] - end[1]) + end[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 1e-10) return false;
  return (
    point[0] >= Math.min(start[0], end[0]) - 1e-10 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-10 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-10 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-10
  );
}

export function referenceSceneGeojson(scene) {
  return {
    type: 'FeatureCollection',
    features: (scene?.features ?? []).map((feature) => ({
      ...feature,
      properties: Object.fromEntries(
        Object.entries(feature.properties ?? {}).filter(
          ([, value]) => value !== null && value !== undefined
        )
      ),
    })),
  };
}

export function referenceFeatureIsVisible(feature, visibleCategories) {
  const category = feature?.properties?.snapCategory;
  return !category || visibleCategories.has(category);
}

function referenceFromRow(row, simulator) {
  const coordinates = (row.vertices ?? [])
    .filter((vertex) => Number.isFinite(vertex?.lat) && Number.isFinite(vertex?.lon))
    .map((vertex) => [vertex.lon, vertex.lat]);
  const painted = /painted|marking|\.lin$/i.test(
    `${row.sourceType ?? ''} ${row.sourceDefinition ?? ''}`
  );
  const taxiwayPath = /taxiway-path|bridge/i.test(row.sourceType ?? '');
  const texturePattern = row.textureAssetPath
    ? `xplane-${stableId(
        'texture',
        'lin',
        row.sourceAssetPath,
        row.textureAssetPath,
        JSON.stringify(row.lineTextureLayers ?? [])
      )}`
    : '';
  return {
    type: 'Feature',
    id: row.id,
    geometry: { type: 'LineString', coordinates },
    properties: {
      featureType: 'simulator-reference',
      sourceId: String(row.id),
      sourceRowIds: (row.sourceRowIds ?? []).map(String),
      sourceFeatureId: row.sourceFeatureId || '',
      dsfRemoval: row.dsfRemoval ?? null,
      removalCapability: row.removalCapability ?? 'range',
      sourceType: row.sourceType || 'light-row',
      sourceFile: row.sourceFile || '',
      sourceDefinition: row.sourceDefinition || '',
      sourceAssetPath: row.sourceAssetPath || '',
      title:
        row.lightDescription ||
        row.markingDescription ||
        row.preset ||
        row.classification ||
        'Simulator feature',
      semanticType: row.classification || 'unknown',
      snapCategory: painted ? 'painted-lines' : taxiwayPath ? 'taxiway-centrelines' : 'light-rows',
      exactness: row.inferred ? 'derived' : 'exact',
      removable: row.removalEligible !== false,
      lightCode: Number.isInteger(row.lightCode) ? row.lightCode : null,
      sourceRunIndex: Number.isInteger(row.sourceRunIndex) ? row.sourceRunIndex : null,
      widthMeters: xPlaneLinePhysicalWidth(row, null),
      markingCode: Number.isInteger(row.markingCode) ? row.markingCode : null,
      textureAssetPath: row.textureAssetPath || '',
      texturePattern,
      texturePixelWidth: row.texturePixelWidth || null,
      texturePixelHeight: row.texturePixelHeight || null,
      textureWrap: row.textureWrap !== false,
      textureNoAlpha: row.textureNoAlpha === true,
      textureScale: row.textureScale || null,
      textureScaleX: row.textureScaleX || null,
      textureScaleY: row.textureScaleY || null,
      textureHeightMeters: row.textureHeightMeters || null,
      lineTextureLayers: row.lineTextureLayers || null,
      mirrorTexture: row.mirrorTexture || false,
      alignSegments: row.alignSegments || null,
      startCaps: row.startCaps || null,
      endCaps: row.endCaps || null,
      renderPattern: painted ? texturePattern || markingPatternName(row.markingCode) : '',
      markingColor: painted ? markingColor(row.markingCode, row.preset) : '',
      simulator,
    },
  };
}

function referencesFromRunway(runway, simulator, data) {
  runway = normalizeRunway(runway);
  if (!runway) return [];
  const centerline = runwayEndpoints(runway);
  const runwayHeading = bearingDegrees(centerline[0], centerline[1]);
  const polygon = runwayPolygon(centerline[0], centerline[1], Number(runway.widthMeters) || 30);
  const id = String(runway.id || stableId('editor-runway', JSON.stringify(runway)));
  const features = [
    {
      type: 'Feature',
      id: `${id}:surface`,
      geometry: { type: 'Polygon', coordinates: [[...polygon, polygon[0]]] },
      properties: {
        featureType: 'simulator-reference',
        sourceId: `${id}:surface`,
        sourceType: runway.sourceType || 'runway',
        sourceFile: runway.sourceFile || '',
        title: `Runway ${runway.primaryLabel || ''}/${runway.secondaryLabel || ''}`.trim(),
        semanticType: 'runway-surface',
        snapCategory: 'runways',
        exactness: 'exact',
        surfaceCode: runway.surfaceCode || 0,
        materialKind: runway.materialKind || '',
        textureHeading: runwayHeading,
        simulator,
      },
    },
  ];
  const shoulderWidth = runway.shoulderCode >= 100 ? Math.floor(runway.shoulderCode / 100) : 0;
  if (shoulderWidth > 0) {
    const shoulderSurfaceCode = runway.shoulderCode % 100;
    const center = [
      (runway.first.lon + runway.second.lon) / 2,
      (runway.first.lat + runway.second.lat) / 2,
    ];
    const heading = bearingDegrees(
      [runway.first.lon, runway.first.lat],
      [runway.second.lon, runway.second.lat]
    );
    for (const side of [-1, 1]) {
      const shoulderCenter = offsetCoordinate(
        center,
        heading + 90,
        side * (runway.widthMeters / 2 + shoulderWidth / 2)
      );
      features.push(
        runwayPolygonReference({
          runwayId: id,
          key: `shoulder-${side}`,
          ring: orientedRunwayRectangle(
            shoulderCenter,
            heading,
            runway.lengthMeters,
            shoulderWidth
          ),
          title: `${runway.primaryLabel}/${runway.secondaryLabel} runway shoulder`,
          simulator,
          snapCategory: 'runways',
          semanticType: 'runway-shoulder',
          properties: {
            surfaceCode: shoulderSurfaceCode,
            materialKind: xplaneMaterialKind(shoulderSurfaceCode),
            textureHeading: heading,
            exactness: 'procedural',
          },
        })
      );
    }
  }
  features.push(
    ...runwayMarkingReferences(runway, simulator, id, runwayEdgeBreakAreas(data, runway))
  );
  features.push(...runwayLightReferences(runway, simulator, id));
  return features;
}

export function normalizeRunway(runway) {
  const centerline = runwayEndpoints(runway);
  if (!centerline) return null;
  const lengthMeters =
    Number.isFinite(runway.lengthMeters) && runway.lengthMeters > 0
      ? runway.lengthMeters
      : coordinateDistanceMeters(centerline[0], centerline[1]);
  const firstLabel = runway.first?.label || runway.primaryLabel || '';
  const secondLabel = runway.second?.label || runway.secondaryLabel || '';
  return {
    ...runway,
    lengthMeters,
    primaryLabel: runway.primaryLabel || firstLabel,
    secondaryLabel: runway.secondaryLabel || secondLabel,
    first: {
      displacedThresholdMeters: 0,
      overrunMeters: 0,
      markingCode: 0,
      ...runway.first,
      lon: centerline[0][0],
      lat: centerline[0][1],
      label: firstLabel,
    },
    second: {
      displacedThresholdMeters: 0,
      overrunMeters: 0,
      markingCode: 0,
      ...runway.second,
      lon: centerline[1][0],
      lat: centerline[1][1],
      label: secondLabel,
    },
  };
}

function xplaneMaterialKind(surfaceCode) {
  if (surfaceCode === 1 || (surfaceCode >= 24 && surfaceCode <= 26)) {
    return 'asphalt-medium';
  }
  if (surfaceCode >= 20 && surfaceCode <= 23) return 'asphalt-light';
  if (surfaceCode >= 27 && surfaceCode <= 30) return 'asphalt-dark';
  if (surfaceCode >= 31 && surfaceCode <= 34) return 'asphalt-very-dark';
  if (surfaceCode >= 35 && surfaceCode <= 38) return 'asphalt-near-black';
  if (surfaceCode === 2 || (surfaceCode >= 53 && surfaceCode <= 54)) {
    return 'concrete-medium';
  }
  if (surfaceCode >= 50 && surfaceCode <= 52) return 'concrete-light';
  if (surfaceCode >= 55 && surfaceCode <= 57) return 'concrete-dark';
  return '';
}

function runwayEdgeBreakAreas(data, runway) {
  const areas = [];
  for (const feature of data?.referenceFeatures ?? []) {
    if (
      feature.properties?.sourceType !== 'xplane-apt-pavement' ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
    ) {
      continue;
    }
    const bounds = featureBounds([feature]);
    if (bounds) areas.push({ geometry: feature.geometry, bounds });
  }
  for (const other of data?.runways ?? []) {
    if (other === runway || (other.id && runway.id && other.id === runway.id)) continue;
    const centerline = runwayEndpoints(other);
    if (!centerline) continue;
    const ring = runwayPolygon(centerline[0], centerline[1], Number(other.widthMeters) || 30);
    const feature = {
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    };
    const bounds = featureBounds([feature]);
    if (bounds) areas.push({ geometry: feature.geometry, bounds });
  }
  return areas;
}

function visibleRunwayEdgeSegments(start, heading, length, breakAreas) {
  if (length <= 0 || breakAreas.length === 0) return [{ start: 0, end: length }];
  const edgeEnd = offsetCoordinate(start, heading, length);
  const edgeBounds = featureBounds([
    { geometry: { type: 'LineString', coordinates: [start, edgeEnd] } },
  ]);
  const candidates = breakAreas.filter((area) => boundsOverlap(edgeBounds, area.bounds));
  if (candidates.length === 0) return [{ start: 0, end: length }];

  const sampleLength = 1;
  const blocked = [];
  for (let sampleStart = 0; sampleStart < length; sampleStart += sampleLength) {
    const sampleEnd = Math.min(length, sampleStart + sampleLength);
    const point = offsetCoordinate(start, heading, (sampleStart + sampleEnd) / 2);
    if (
      candidates.some(
        (area) =>
          point[0] >= area.bounds[0] &&
          point[0] <= area.bounds[2] &&
          point[1] >= area.bounds[1] &&
          point[1] <= area.bounds[3] &&
          pointInGeometry(point, area.geometry)
      )
    ) {
      blocked.push({
        start: Math.max(0, sampleStart - 1.5),
        end: Math.min(length, sampleEnd + 1.5),
      });
    }
  }
  if (blocked.length === 0) return [{ start: 0, end: length }];

  const merged = [];
  for (const interval of blocked) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  const visible = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.start - cursor >= 2) visible.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (length - cursor >= 2) visible.push({ start: cursor, end: length });
  return visible;
}

function runwayCentrelineInset(label) {
  return /[LCR]$/i.test(String(label || '')) ? 78 : 63;
}

function runwayCentrelineWidth(runway) {
  const ends = [runway.first, runway.second];
  const precision = ends.some((end) => [3, 5, 7].includes(end.markingCode));
  const categoryTwoOrThree = ends.some((end) => precision && [2, 4].includes(end.approachType));
  if (categoryTwoOrThree) return 0.9;
  if (ends.some((end) => end.markingCode >= 2) || runway.widthMeters >= 30) return 0.45;
  return 0.3;
}

function runwayAimingPointDimensions(landingDistanceMeters) {
  if (landingDistanceMeters < 800) {
    return { distance: 150, length: 30, width: 4, innerGap: 6 };
  }
  if (landingDistanceMeters < 1200) {
    return { distance: 250, length: 30, width: 6, innerGap: 9 };
  }
  if (landingDistanceMeters < 2400) {
    return { distance: 300, length: 45, width: 9, innerGap: 18 };
  }
  return { distance: 400, length: 45, width: 9, innerGap: 18 };
}

function runwayMarkingReferences(runway, simulator, runwayId, edgeBreakAreas = []) {
  const heading = bearingDegrees(
    [runway.first.lon, runway.first.lat],
    [runway.second.lon, runway.second.lat]
  );
  const firstThreshold = offsetCoordinate(
    [runway.first.lon, runway.first.lat],
    heading,
    runway.first.displacedThresholdMeters || 0
  );
  const secondThreshold = offsetCoordinate(
    [runway.second.lon, runway.second.lat],
    heading + 180,
    runway.second.displacedThresholdMeters || 0
  );
  const features = [];
  const ends = [
    { key: 'first', data: runway.first, threshold: firstThreshold, inwardHeading: heading },
    {
      key: 'second',
      data: runway.second,
      threshold: secondThreshold,
      inwardHeading: heading + 180,
    },
  ];

  if (ends.some((end) => end.data.markingCode > 0)) {
    const centrelineInset = Math.max(...ends.map((end) => runwayCentrelineInset(end.data.label)));
    const centrelineWidth = runwayCentrelineWidth(runway);
    features.push(
      runwayLineReference({
        runwayId,
        key: 'painted-centreline',
        coordinates: [
          offsetCoordinate(firstThreshold, heading, centrelineInset),
          offsetCoordinate(secondThreshold, heading + 180, centrelineInset),
        ],
        title: 'Runway painted centreline',
        simulator,
        properties: {
          renderPattern: 'apt-marking-22',
          markingColor: '#f5f5f4',
          widthMeters: centrelineWidth,
          textureHeightMeters: 50,
          exactness: 'procedural',
        },
      })
    );
    if (runway.surfaceCode !== 14 && runway.surfaceCode !== 15) {
      const firstEnd = [runway.first.lon, runway.first.lat];
      const secondEnd = [runway.second.lon, runway.second.lat];
      const edgeWidth = centrelineWidth;
      const edgeLength = coordinateDistanceMeters(firstEnd, secondEnd);
      for (const side of [-1, 1]) {
        const edgeStart = offsetCoordinate(
          firstEnd,
          heading + 90,
          side * Math.max(0, runway.widthMeters / 2 - edgeWidth / 2)
        );
        const edgeSegments = visibleRunwayEdgeSegments(
          edgeStart,
          heading,
          edgeLength,
          edgeBreakAreas
        );
        for (const [segmentIndex, segment] of edgeSegments.entries()) {
          features.push(
            runwayPaintRectangle({
              runwayId,
              key: `runway-edge-${side}-${segmentIndex}`,
              center: offsetCoordinate(edgeStart, heading, (segment.start + segment.end) / 2),
              heading,
              length: segment.end - segment.start,
              width: edgeWidth,
              title: 'Runway edge marking',
              simulator,
            })
          );
        }
      }
    }
  }

  for (const end of ends) {
    if (end.data.overrunMeters > 0) {
      const center = offsetCoordinate(
        [end.data.lon, end.data.lat],
        end.inwardHeading + 180,
        end.data.overrunMeters / 2
      );
      features.push(
        runwayPolygonReference({
          runwayId,
          key: `${end.key}-overrun`,
          ring: orientedRunwayRectangle(
            center,
            end.inwardHeading,
            end.data.overrunMeters,
            runway.widthMeters
          ),
          title: `${end.data.label} blast pad`,
          simulator,
          snapCategory: 'runways',
          semanticType: 'runway-overrun',
          properties: {
            surfaceCode: runway.surfaceCode || 0,
            materialKind: runway.materialKind || '',
            textureHeading: end.inwardHeading,
            exactness: 'procedural',
          },
        })
      );
    }
    if (end.data.markingCode <= 0) continue;

    const stripeCount = runwayThresholdStripeCount(runway.widthMeters);
    const stripeGap = runway.widthMeters / stripeCount;
    for (let stripeIndex = 0; stripeIndex < stripeCount; stripeIndex += 1) {
      const lateral = -runway.widthMeters / 2 + stripeGap * (stripeIndex + 0.5);
      const stripeCenter = offsetCoordinate(
        offsetCoordinate(end.threshold, end.inwardHeading, 15),
        end.inwardHeading + 90,
        lateral
      );
      features.push(
        runwayPaintRectangle({
          runwayId,
          key: `${end.key}-threshold-${stripeIndex}`,
          center: stripeCenter,
          heading: end.inwardHeading,
          length: 30,
          width: Math.min(1.8, stripeGap * 0.55),
          title: `${end.data.label} threshold marking`,
          simulator,
        })
      );
    }

    features.push(
      ...runwayDesignationReferences({
        runwayId,
        key: end.key,
        label: end.data.label,
        threshold: end.threshold,
        heading: end.inwardHeading,
        simulator,
      })
    );

    if (end.data.markingCode >= 2) {
      const aiming = runwayAimingPointDimensions(
        runway.lengthMeters - (end.data.displacedThresholdMeters || 0)
      );
      const aimingCenter = offsetCoordinate(end.threshold, end.inwardHeading, aiming.distance);
      for (const side of [-1, 1]) {
        features.push(
          runwayPaintRectangle({
            runwayId,
            key: `${end.key}-aiming-${side}`,
            center: offsetCoordinate(
              aimingCenter,
              end.inwardHeading + 90,
              (side * (aiming.innerGap + aiming.width)) / 2
            ),
            heading: end.inwardHeading,
            length: aiming.length,
            width: aiming.width,
            title: `${end.data.label} aiming point`,
            simulator,
          })
        );
      }
    }

    if ([3, 5, 7].includes(end.data.markingCode)) {
      for (const distance of [150, 450, 600, 750, 900]) {
        if (distance >= runway.lengthMeters / 2) continue;
        const center = offsetCoordinate(end.threshold, end.inwardHeading, distance);
        const stripeCount = distance <= 150 ? 3 : distance <= 600 ? 2 : 1;
        for (const side of [-1, 1]) {
          for (let stripe = 0; stripe < stripeCount; stripe += 1) {
            features.push(
              runwayPaintRectangle({
                runwayId,
                key: `${end.key}-tdz-${distance}-${side}-${stripe}`,
                center: offsetCoordinate(
                  center,
                  end.inwardHeading + 90,
                  side * (runway.widthMeters * 0.2 + stripe * 3.3)
                ),
                heading: end.inwardHeading,
                length: 22.5,
                width: 3,
                title: `${end.data.label} touchdown-zone marking`,
                simulator,
              })
            );
          }
        }
      }
    }
  }
  return features;
}

function runwayLightReferences(runway, simulator, runwayId) {
  const features = [];
  const first = [runway.first.lon, runway.first.lat];
  const second = [runway.second.lon, runway.second.lat];
  const heading = bearingDegrees(first, second);
  const length = runway.lengthMeters;
  const appendPoint = (key, coordinate, title, color) => {
    features.push(
      runwayPointReference({
        runwayId,
        key,
        coordinate,
        title,
        simulator,
        snapCategory: 'light-rows',
        semanticType: 'runway-light',
        properties: { lightColor: color, exactness: 'procedural' },
      })
    );
  };
  if (runway.centerlineLights) {
    for (let distance = 0; distance <= length; distance += 15.24) {
      appendPoint(
        `centreline-light-${Math.round(distance * 100)}`,
        offsetCoordinate(first, heading, distance),
        'Runway centreline light',
        '#f5f5f4'
      );
    }
  }
  if (runway.edgeLightLevel > 0) {
    for (let distance = 0; distance <= length; distance += 60) {
      const center = offsetCoordinate(first, heading, distance);
      for (const side of [-1, 1]) {
        appendPoint(
          `edge-light-${Math.round(distance * 100)}-${side}`,
          offsetCoordinate(center, heading + 90, (side * runway.widthMeters) / 2),
          'Runway edge light',
          '#f5f5f4'
        );
      }
    }
  }
  return features;
}

function runwayThresholdStripeCount(widthMeters) {
  if (widthMeters <= 18) return 4;
  if (widthMeters <= 23) return 6;
  if (widthMeters <= 30) return 8;
  if (widthMeters <= 45) return 12;
  return 16;
}

// Closed runway-stencil outlines derived from Rafael Zink's CC BY-SA 4.0
// vectorization of the official runway marking font, scaled to the 9 m
// dimensions required by CASA MOS 8.18:
// https://commons.wikimedia.org/wiki/File:Runway_landing_designator_marking-Numbers.svg
const RUNWAY_GLYPHS = Object.freeze({
  0: runwayStencil(3, 9, '-1.5,4.5 1.5,4.5 1.5,-4.5 -1.5,-4.5', '-0.7,3 0.7,3 0.7,-3 -0.7,-3'),
  1: runwayStencil(1.1, 9, '-0.25,3 -0.55,3 -0.55,4.2 -0.25,4.5 0.55,4.5 0.55,-4.5 -0.25,-4.5'),
  2: runwayStencil(
    3,
    9,
    '1.5,1.6 -0.7,-1.9 -0.7,-3 1.5,-3 1.5,-4.5 -1.5,-4.5 -1.5,-1.9 0.7,1.6 0.7,3 -0.7,3 -0.7,2.1 -1.5,2.1 -1.5,4.5 1.5,4.5'
  ),
  3: runwayStencil(
    3,
    9,
    '0.4,0.9 1.5,-0.2 1.5,-4.5 -1.5,-4.5 -1.5,-3 0.7,-3 0.7,-0.5 -0.7,0.9 0.7,2.3 0.7,3 -1.5,3 -1.5,4.5 1.5,4.5 1.5,2'
  ),
  4: runwayStencil(
    3.9,
    9,
    '-0.7,4.5 0.11,4.5 -0.87,-1.1 0.45,-1.1 0.45,1.8 1.25,1.8 1.25,-1.1 1.95,-1.1 1.95,-2.6 1.25,-2.6 1.25,-4.5 0.45,-4.5 0.45,-2.6 -1.95,-2.6'
  ),
  5: runwayStencil(
    3,
    9,
    '-1.5,-3 0.7,-3 0.7,0.3 -1.5,0.3 -1.5,4.5 1.5,4.5 1.5,3 -0.7,3 -0.7,1.8 1.5,1.8 1.5,-4.5 -1.5,-4.5'
  ),
  6: runwayStencil(
    3,
    9.5,
    '0,1 -0.7,1 -0.7,2.65 0.7,3.92 0.72,5.01 0,4.36 -1.5,3 -1.5,-4.5 1.5,-4.5 1.5,1',
    '-0.7,-0.5 0.7,-0.5 0.7,-3 -0.7,-3'
  ),
  7: runwayStencil(3.5, 9, '-0.65,-4.5 -1.45,-4.5 0.55,3 -1.75,3 -1.75,4.5 1.75,4.5'),
  8: runwayStencil(
    3,
    9,
    '-1.5,4.5 1.5,4.5 1.5,1.15 0.95,0.6 1.5,0.05 1.5,-4.5 -1.5,-4.5 -1.5,0.05 -0.95,0.6 -1.5,1.15',
    '-0.7,3 0.7,3 0.7,1.35 -0.7,1.35',
    '-0.7,-0.15 0.7,-0.15 0.7,-3 -0.7,-3'
  ),
  9: runwayStencil(
    3,
    9.5,
    '0,-1 0.7,-1 0.7,-2.65 -0.7,-3.92 -0.72,-5.01 0,-4.36 1.5,-3 1.5,4.5 -1.5,4.5 -1.5,-1',
    '-0.7,3 0.7,3 0.7,0.5 -0.7,0.5'
  ),
  L: runwayStencil(3, 9, '-1.5,4.5 -0.7,4.5 -0.7,-3 1.5,-3 1.5,-4.5 -1.5,-4.5'),
  C: runwayStencil(
    3,
    9,
    '-0.7,-3 0.7,-3 0.7,-2.4 1.5,-2.4 1.5,-4.5 -1.5,-4.5 -1.5,4.5 1.5,4.5 1.5,2.4 0.7,2.4 0.7,3 -0.7,3'
  ),
  R: runwayStencil(
    3,
    9,
    '-1.5,4.5 1.5,4.5 1.5,-0.8 0.75,-0.8 1.5,-4.5 0.7,-4.5 -0.05,-0.8 -0.7,-0.8 -0.7,-4.5 -1.5,-4.5',
    '-0.7,3 0.7,3 0.7,0.7 -0.7,0.7'
  ),
});

function runwayRing(points) {
  return points.split(/\s+/).map((point) => point.split(',').map(Number));
}

function runwayStencil(width, height, ...rings) {
  return { width, height, rings: rings.map(runwayRing) };
}

function runwayDesignationReferences({ runwayId, key, label, threshold, heading, simulator }) {
  const normalized = String(label || '')
    .trim()
    .toUpperCase();
  const match = /^(\d{1,2})([LCR]?)$/.exec(normalized);
  if (!match) return [];
  const digits = match[1].padStart(2, '0');
  const markingStart = 42;
  const letterGap = 6;
  const letterHeight = 9;
  const numberHeight = Math.max(...[...digits].map((digit) => RUNWAY_GLYPHS[digit].height));
  const hasLetter = Boolean(match[2]);
  const features = runwayGlyphRow({
    runwayId,
    key: `${key}-designation-number`,
    text: digits,
    center: offsetCoordinate(
      threshold,
      heading,
      markingStart + numberHeight / 2 + (hasLetter ? letterHeight + letterGap : 0)
    ),
    heading,
    simulator,
    title: `Runway designation ${normalized}`,
  });
  if (match[2]) {
    features.push(
      ...runwayGlyphRow({
        runwayId,
        key: `${key}-designation-letter`,
        text: match[2],
        center: offsetCoordinate(threshold, heading, markingStart + letterHeight / 2),
        heading,
        simulator,
        title: `Runway designation ${normalized}`,
      })
    );
  }
  return features;
}

function runwayGlyphRow({ runwayId, key, text, center, heading, simulator, title }) {
  // CASA MOS 8.18 uses 9 m aviation-stencil glyphs with 0.8 m vertical and
  // 1.5 m horizontal strokes. Preserve those metre dimensions on the map.
  const glyphGap = 1.5;
  const advances = [...text].map((character) => RUNWAY_GLYPHS[character]?.width ?? 0);
  const rowWidth =
    advances.reduce((total, width) => total + width, 0) + Math.max(0, text.length - 1) * glyphGap;
  const features = [];
  let cursor = -rowWidth / 2;
  for (const [characterIndex, character] of [...text].entries()) {
    const glyph = RUNWAY_GLYPHS[character];
    if (!glyph) continue;
    const characterOffset = cursor + glyph.width / 2;
    const rings = glyph.rings.map((ring) =>
      ring.map(([lateral, longitudinal]) =>
        offsetCoordinate(
          offsetCoordinate(center, heading, longitudinal),
          heading + 90,
          characterOffset + lateral
        )
      )
    );
    features.push(
      runwayPolygonReference({
        runwayId,
        key: `${key}-${characterIndex}`,
        rings,
        title,
        simulator,
        snapCategory: 'painted-lines',
        semanticType: 'runway-marking',
        properties: { markingColor: '#f5f5f4', exactness: 'procedural' },
      })
    );
    cursor += glyph.width + glyphGap;
  }
  return features;
}

function runwayPaintRectangle({ runwayId, key, center, heading, length, width, title, simulator }) {
  return runwayPolygonReference({
    runwayId,
    key,
    ring: orientedRunwayRectangle(center, heading, length, width),
    title,
    simulator,
    snapCategory: 'painted-lines',
    semanticType: 'runway-marking',
    properties: { markingColor: '#f5f5f4', exactness: 'procedural' },
  });
}

function runwayPolygonReference({
  runwayId,
  key,
  ring,
  rings,
  title,
  simulator,
  snapCategory,
  semanticType,
  properties = {},
}) {
  const polygonRings = rings ?? [ring];
  return {
    type: 'Feature',
    id: `${runwayId}:${key}`,
    geometry: {
      type: 'Polygon',
      coordinates: polygonRings.map((polygonRing) => [...polygonRing, polygonRing[0]]),
    },
    properties: {
      featureType: 'simulator-reference',
      sourceId: `${runwayId}:${key}`,
      sourceType: 'xplane-apt-runway-generated',
      title,
      semanticType,
      snapCategory,
      simulator,
      ...properties,
    },
  };
}

function runwayLineReference({ runwayId, key, coordinates, title, simulator, properties = {} }) {
  return {
    type: 'Feature',
    id: `${runwayId}:${key}`,
    geometry: { type: 'LineString', coordinates },
    properties: {
      featureType: 'simulator-reference',
      sourceId: `${runwayId}:${key}`,
      sourceType: 'xplane-apt-runway-generated',
      title,
      semanticType: 'runway-marking',
      snapCategory: 'painted-lines',
      simulator,
      ...properties,
    },
  };
}

function runwayPointReference({
  runwayId,
  key,
  coordinate,
  title,
  simulator,
  snapCategory = 'painted-lines',
  semanticType = 'runway-marking-label',
  properties = {},
}) {
  return {
    type: 'Feature',
    id: `${runwayId}:${key}`,
    geometry: { type: 'Point', coordinates: coordinate },
    properties: {
      featureType: 'simulator-reference',
      sourceId: `${runwayId}:${key}`,
      sourceType: 'xplane-apt-runway-generated',
      title,
      semanticType,
      snapCategory,
      simulator,
      ...properties,
    },
  };
}

function orientedRunwayRectangle(center, heading, length, width) {
  const start = offsetCoordinate(center, heading + 180, length / 2);
  const end = offsetCoordinate(center, heading, length / 2);
  return [
    offsetCoordinate(start, heading - 90, width / 2),
    offsetCoordinate(end, heading - 90, width / 2),
    offsetCoordinate(end, heading + 90, width / 2),
    offsetCoordinate(start, heading + 90, width / 2),
  ];
}

function normalizeFeature(feature, simulator) {
  const stockTexture = simulator === 'xplane' ? xplaneStockPavementTexture(feature) : {};
  const baseProperties = withAptMarkingFallbackProperties({
    ...feature.properties,
    ...stockTexture,
  });
  const textureNoAlpha = xPlaneTextureIgnoresAlpha(baseProperties);
  const texturePattern = opaqueTexturePattern(baseProperties.texturePattern, textureNoAlpha);
  const properties = {
    ...baseProperties,
    ...(simulator === 'msfs' && !baseProperties.snapCategory
      ? { snapCategory: msfsReferenceCategory(baseProperties.sourceType) }
      : {}),
    textureNoAlpha,
    ...(texturePattern ? { texturePattern } : {}),
  };
  const surface = referenceSurfaceStyle(properties);
  const painted = properties.snapCategory === 'painted-lines';
  return {
    ...feature,
    properties: {
      featureType: 'simulator-reference',
      exactness: 'exact',
      simulator,
      ...properties,
      widthMeters:
        feature.geometry?.type === 'LineString'
          ? xPlaneLinePhysicalWidth(properties, null)
          : (properties.widthMeters ?? properties.textureWidthMeters ?? null),
      surfaceColor: surface.color,
      surfaceLabel: surface.label,
      surfaceOpacity: surface.opacity,
      renderPattern:
        feature.geometry?.type === 'LineString'
          ? normalizedLineRenderPattern(properties, painted)
          : properties.renderPattern || properties.texturePattern || '',
      markingColor: painted
        ? properties.markingColor || markingColor(properties.markingCode, properties.markingStyle)
        : '',
    },
  };
}

function msfsReferenceCategory(sourceType) {
  const type = String(sourceType ?? '');
  if (type === 'msfs-bgl-painted-line-cf') return 'painted-lines';
  if (type === 'msfs-bgl-apron-v6-d0') return 'pavement-edges';
  if (type.includes('light')) return 'light-rows';
  if (
    type === 'msfs-bgl-library-object' ||
    type === 'msfs-bgl-named-simobject' ||
    type === 'msfs-projected-mesh-bounds'
  ) {
    return 'fixtures';
  }
  return undefined;
}

const LEGACY_NO_ALPHA_DEFINITIONS = new Set(['lib/airport/ground/terrain/soil_1.pol']);

function xPlaneTextureIgnoresAlpha(properties = {}) {
  if (properties.textureNoAlpha === true) return true;
  return LEGACY_NO_ALPHA_DEFINITIONS.has(
    String(properties.sourceDefinition ?? '')
      .replaceAll('\\', '/')
      .toLowerCase()
  );
}

function opaqueTexturePattern(pattern, textureNoAlpha) {
  const value = String(pattern ?? '');
  return textureNoAlpha && value && !value.endsWith('-opaque') ? `${value}-opaque` : value;
}

function normalizedLineRenderPattern(properties, painted = false) {
  if (properties.texturePattern) {
    const compositionId = stableId(
      properties.texturePattern,
      properties.sourceDefinition,
      properties.sourceAssetPath,
      JSON.stringify(properties.lineTextureLayers ?? null),
      JSON.stringify(properties.alignSegments ?? null),
      JSON.stringify(properties.startCaps ?? null),
      JSON.stringify(properties.endCaps ?? null),
      properties.mirrorTexture ?? false
    );
    return `${properties.texturePattern}-line-${compositionId}`;
  }
  return properties.renderPattern || (painted ? markingPatternName(properties.markingCode) : '');
}

function xplaneDsfVisualLineKey(feature) {
  const properties = feature?.properties ?? {};
  if (
    feature?.geometry?.type !== 'LineString' ||
    !['xplane-dsf-lin', 'xplane-dsf-painted-line'].includes(properties.sourceType)
  ) {
    return '';
  }
  return [
    properties.sourceFile ?? '',
    properties.sourceDefinition ?? '',
    JSON.stringify(feature.geometry.coordinates),
  ].join(':');
}

function xplaneStockPavementTexture(feature) {
  const properties = feature.properties ?? {};
  if (
    properties.texturePattern ||
    !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) ||
    !['pavement-edges', 'runways'].includes(properties.snapCategory)
  ) {
    return {};
  }
  const surfaceCode = Number(properties.surfaceCode);
  const material = xplaneStockMaterial(surfaceCode, properties.materialKind);
  if (!material) return {};
  const runway = properties.snapCategory === 'runways';
  const layerGroup = material.unpaved
    ? runway
      ? 'unpaved_runways'
      : 'unpaved_taxiways'
    : runway
      ? 'runways'
      : 'taxiways';
  return {
    textureAssetPath: `sim objects/apt_pavement/textures/${material.file}`,
    texturePattern: `xplane-stock-${material.file.toLowerCase().replace(/\W+/g, '-')}`,
    textureScaleX: material.scaleX,
    textureScaleY: material.scaleY,
    textureWrap: true,
    textureDefinitionResolved: true,
    layerGroup,
  };
}

function xplaneStockMaterial(surfaceCode, materialKind = '') {
  const asphaltGroup = asphaltVariantGroup(surfaceCode, materialKind);
  if (asphaltGroup) {
    const suffix = pavementVariantSuffix(surfaceCode, asphaltGroup.rangeStart, 'b');
    return {
      file: `asphalt_${asphaltGroup.group}${suffix}_ALB.png`,
      scaleX: 18,
      scaleY: suffix === 'a' ? 18 : 36,
      unpaved: false,
    };
  }
  const concreteGroup = concreteVariantGroup(surfaceCode, materialKind);
  if (concreteGroup) {
    const suffix = pavementVariantSuffix(surfaceCode, concreteGroup.rangeStart, 'a');
    return {
      file: `concrete_${concreteGroup.group}${suffix}_ALB.png`,
      scaleX: 22,
      scaleY: 44,
      unpaved: false,
    };
  }
  const unpaved = {
    3: { file: 'grass_twy_1_ALB.png', scaleX: 160, scaleY: 160 },
    4: { file: 'dirt_twy_1_ALB.png', scaleX: 30, scaleY: 30 },
    5: { file: 'gravel_twy_1_ALB.png', scaleX: 30, scaleY: 30 },
    12: { file: 'lakebed_twy_1_ALB.png', scaleX: 400, scaleY: 400 },
    14: { file: 'snow_twy_1_ALB.png', scaleX: 20, scaleY: 20 },
  }[surfaceCode];
  return unpaved ? { ...unpaved, unpaved: true } : null;
}

function asphaltVariantGroup(surfaceCode, materialKind) {
  if (surfaceCode === 1) return { group: 2, rangeStart: null };
  const ranges = [
    [20, 23, 1],
    [24, 26, 2],
    [27, 30, 3],
    [31, 34, 4],
    [35, 38, 5],
  ];
  const match = ranges.find(([start, end]) => surfaceCode >= start && surfaceCode <= end);
  if (match) return { group: match[2], rangeStart: match[0] };
  const materialMatch = /asphalt(?:-(light|medium|dark|very-dark|near-black))?/.exec(
    String(materialKind)
  );
  if (!materialMatch) return null;
  const group = {
    light: 1,
    medium: 2,
    dark: 3,
    'very-dark': 4,
    'near-black': 5,
  }[materialMatch[1] || 'medium'];
  return { group, rangeStart: null };
}

function concreteVariantGroup(surfaceCode, materialKind) {
  if (surfaceCode === 2) return { group: 2, rangeStart: null };
  const ranges = [
    [50, 52, 1],
    [53, 54, 2],
    [55, 57, 3],
  ];
  const match = ranges.find(([start, end]) => surfaceCode >= start && surfaceCode <= end);
  if (match) return { group: match[2], rangeStart: match[0] };
  const materialMatch = /concrete(?:-(light|medium|dark))?/.exec(String(materialKind));
  if (!materialMatch) return null;
  const group = { light: 1, medium: 2, dark: 3 }[materialMatch[1] || 'medium'];
  return { group, rangeStart: null };
}

function pavementVariantSuffix(surfaceCode, rangeStart, fallback) {
  if (!Number.isInteger(rangeStart)) return fallback;
  return String.fromCharCode(97 + Math.max(0, Math.min(3, surfaceCode - rangeStart)));
}

function markingColor(code, style) {
  const normalizedCode =
    code >= 51 && code <= 64 ? code - 50 : code >= 70 && code <= 92 ? code - 50 : code;
  if (normalizedCode >= 20 && normalizedCode <= 25) return '#f5f5f4';
  if (normalizedCode >= 30 && normalizedCode <= 32) return '#ef4444';
  if (normalizedCode === 40) return '#f97316';
  if (normalizedCode === 41) return '#3b82f6';
  if (normalizedCode === 42) return '#22c55e';
  const value = String(style || '').toLowerCase();
  if (value.includes('white')) return '#f5f5f4';
  if (value.includes('red')) return '#ef4444';
  if (value.includes('orange')) return '#f97316';
  if (value.includes('blue')) return '#3b82f6';
  if (value.includes('green')) return '#22c55e';
  return '#facc15';
}

export function referenceSurfaceStyle(properties = {}) {
  const material = [
    properties.materialKind,
    properties.surface,
    properties.material,
    properties.sourceDefinition,
    properties.sourceAssetPath,
    properties.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (material.includes('asphalt-light')) return { label: 'Light asphalt', color: '#55575b' };
  if (material.includes('asphalt-near-black')) {
    return { label: 'Near-black asphalt', color: '#25272a' };
  }
  if (material.includes('asphalt-very-dark')) {
    return { label: 'Very dark asphalt', color: '#2d2f33' };
  }
  if (material.includes('asphalt-dark')) return { label: 'Dark asphalt', color: '#36383c' };
  if (material.includes('asphalt')) return { label: 'Asphalt', color: '#414348' };
  if (material.includes('concrete-light')) return { label: 'Light concrete', color: '#85878a' };
  if (material.includes('concrete-dark')) return { label: 'Dark concrete', color: '#5b5d61' };
  if (material.includes('concrete')) return { label: 'Concrete', color: '#707277' };
  if (material.includes('grass') || material.includes('turf') || material.includes('lawn')) {
    return { label: 'Grass', color: '#3f6212', opacity: 0.62 };
  }
  if (material.includes('dirt') || material.includes('soil') || material.includes('lakebed')) {
    return { label: material.includes('lakebed') ? 'Dry lakebed' : 'Dirt', color: '#713f12' };
  }
  if (material.includes('gravel')) return { label: 'Gravel', color: '#57534e' };
  if (material.includes('water')) return { label: 'Water', color: '#075985' };
  if (material.includes('snow') || material.includes('ice')) {
    return { label: 'Snow or ice', color: '#cbd5e1' };
  }
  if (material.includes('transparent')) {
    return { label: 'Transparent', color: '#52525b', opacity: 0 };
  }
  if (String(properties.sourceType || '').startsWith('xplane-dsf-pol')) {
    return { label: 'Scenery overlay', color: '#52525b', opacity: 0.12 };
  }
  return { label: 'Simulator pavement', color: '#52525b' };
}

function runwayEndpoints(runway) {
  if (
    Number.isFinite(runway.first?.lon) &&
    Number.isFinite(runway.first?.lat) &&
    Number.isFinite(runway.second?.lon) &&
    Number.isFinite(runway.second?.lat)
  ) {
    return [
      [runway.first.lon, runway.first.lat],
      [runway.second.lon, runway.second.lat],
    ];
  }
  if (
    !Number.isFinite(runway.lon) ||
    !Number.isFinite(runway.lat) ||
    !Number.isFinite(runway.heading) ||
    !Number.isFinite(runway.lengthMeters)
  ) {
    return null;
  }
  const half = runway.lengthMeters / 2;
  return [
    offsetCoordinate([runway.lon, runway.lat], runway.heading + 180, half),
    offsetCoordinate([runway.lon, runway.lat], runway.heading, half),
  ];
}

function runwayPolygon(first, second, widthMeters) {
  const heading = bearingDegrees(first, second);
  const halfWidth = widthMeters / 2;
  return [
    offsetCoordinate(first, heading - 90, halfWidth),
    offsetCoordinate(second, heading - 90, halfWidth),
    offsetCoordinate(second, heading + 90, halfWidth),
    offsetCoordinate(first, heading + 90, halfWidth),
  ];
}

function offsetCoordinate([lon, lat], bearing, distance) {
  const radians = (bearing * Math.PI) / 180;
  const north = Math.cos(radians) * distance;
  const east = Math.sin(radians) * distance;
  const lonScale = 111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.000001);
  return [lon + east / lonScale, lat + north / 111_320];
}

function bearingDegrees(first, second) {
  const referenceLatitude = (first[1] + second[1]) / 2;
  const east =
    (second[0] - first[0]) *
    111_320 *
    Math.max(Math.cos((referenceLatitude * Math.PI) / 180), 0.000001);
  const north = (second[1] - first[1]) * 111_320;
  return (Math.atan2(east, north) * 180) / Math.PI;
}

function coordinateDistanceMeters(first, second) {
  const referenceLatitude = (first[1] + second[1]) / 2;
  const east =
    (second[0] - first[0]) *
    111_320 *
    Math.max(Math.cos((referenceLatitude * Math.PI) / 180), 0.000001);
  const north = (second[1] - first[1]) * 111_320;
  return Math.hypot(east, north);
}

function featureBounds(features) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) visitCoordinates(feature.geometry?.coordinates, bounds);
  return bounds.every(Number.isFinite) ? bounds : undefined;
}

function visitCoordinates(value, bounds) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    bounds[0] = Math.min(bounds[0], value[0]);
    bounds[1] = Math.min(bounds[1], value[1]);
    bounds[2] = Math.max(bounds[2], value[0]);
    bounds[3] = Math.max(bounds[3], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, bounds);
}
