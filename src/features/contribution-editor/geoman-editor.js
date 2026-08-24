/* oxlint-disable react-doctor/js-combine-iterations -- Geoman synchronization keeps feature filtering and layer projection as separate lifecycle stages. */

const DRAW_PREVIEW_ID = '__editor-draw-preview__';
const REFERENCE_SNAP_PREFIX = '__reference-snap__:';
const LIGHT_ROW_SNAP_GEOMETRIES = new Set(['Point', 'LineString', 'MultiLineString']);

export function createGeomanEditorFeatures(objects, selectedId) {
  return objects
    .filter((object) => object.coordinates.length >= 2)
    .map((object) => ({
      type: 'Feature',
      id: object.partId,
      properties: {
        __gm_id: object.partId,
        __gm_disableEdit: object.partId !== selectedId,
        barsPartId: object.partId,
        color: object.color,
      },
      geometry: {
        type: 'LineString',
        coordinates: object.coordinates,
      },
    }));
}

export function createGeomanReferenceSnapTargets(
  referenceFeatures,
  { maximumFeatures = Infinity } = {}
) {
  const features = [];
  const lineFeatures = [];
  const pointFeatures = [];
  const bounded = Number.isFinite(maximumFeatures);
  const poolLimit = bounded ? Math.max(0, Math.floor(maximumFeatures)) : Infinity;

  const addFeature = (feature, kind) => {
    if (!bounded) {
      features.push(feature);
      return;
    }
    const pool = kind === 'line' ? lineFeatures : pointFeatures;
    if (pool.length < poolLimit) pool.push(feature);
  };

  for (const [featureIndex, feature] of (referenceFeatures ?? []).entries()) {
    if (!referenceFeatureIsSnappable(feature)) continue;
    const sourceId = String(feature.properties?.sourceId ?? feature.id ?? '');
    if (!sourceId) continue;
    if (feature.geometry?.type === 'Point') {
      const coordinate = feature.geometry.coordinates;
      if (!validCoordinate(coordinate)) continue;
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:point`;
      addFeature({
        type: 'Feature',
        id,
        properties: {
          __gm_id: id,
          __gm_shape: 'circle_marker',
          __gm_disableEdit: true,
          barsReferenceSnap: true,
        },
        geometry: { type: 'Point', coordinates: [...coordinate] },
      }, 'point');
      continue;
    }
    const lines = snapLinesFromGeometry(feature.geometry);
    for (const [lineIndex, coordinates] of lines.entries()) {
      if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        !coordinates.every(validCoordinate)
      ) {
        continue;
      }
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:${lineIndex}`;
      addFeature({
        type: 'Feature',
        id,
        properties: {
          __gm_id: id,
          __gm_disableEdit: true,
          barsReferenceSnap: true,
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates.map((coordinate) => [...coordinate]),
        },
      }, 'line');
    }
  }

  return {
    features: bounded
      ? balancedSnapTargets(lineFeatures, pointFeatures, maximumFeatures)
      : features,
  };
}

function referenceFeatureIsSnappable(feature) {
  const category = feature.properties?.snapCategory;
  const geometryType = feature.geometry?.type;
  if (category === 'light-rows') return LIGHT_ROW_SNAP_GEOMETRIES.has(geometryType);
  return category === 'fixtures' && geometryType === 'Point';
}

export function applyEditorGeometryPreviews(
  geojson,
  selectedId,
  editPreview,
  drawPreview
) {
  const hasEditPreview =
    editPreview?.id === selectedId && editPreview.coordinates?.length >= 2;
  const features = geojson.features.map((feature) => {
    if (
      !hasEditPreview ||
      feature.properties?.editorId !== editPreview.id ||
      feature.geometry?.type !== 'LineString'
    ) {
      return feature;
    }
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: editPreview.coordinates,
      },
    };
  });

  if (drawPreview?.length >= 2) {
    features.push({
      type: 'Feature',
      id: DRAW_PREVIEW_ID,
      properties: {
        featureType: 'editor-object',
        editorId: DRAW_PREVIEW_ID,
        color: '#22d3ee',
      },
      geometry: {
        type: 'LineString',
        coordinates: drawPreview,
      },
    });
  }

  return { ...geojson, features };
}

function validCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function snapLinesFromGeometry(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString' || geometry?.type === 'Polygon') {
    return geometry.coordinates;
  }
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}

function balancedSnapTargets(lineFeatures, pointFeatures, maximumFeatures) {
  const limit = Math.max(0, Math.floor(Number(maximumFeatures) || 0));
  if (limit === 0) return [];

  const preferredLineCount = Math.ceil(limit * 0.6);
  const selectedLines = lineFeatures.slice(0, preferredLineCount);
  const selectedPoints = pointFeatures.slice(0, limit - selectedLines.length);
  let remaining = limit - selectedLines.length - selectedPoints.length;
  if (remaining > 0) {
    selectedLines.push(...lineFeatures.slice(selectedLines.length, selectedLines.length + remaining));
    remaining = limit - selectedLines.length - selectedPoints.length;
  }
  if (remaining > 0) {
    selectedPoints.push(
      ...pointFeatures.slice(selectedPoints.length, selectedPoints.length + remaining)
    );
  }
  return [...selectedLines, ...selectedPoints];
}
