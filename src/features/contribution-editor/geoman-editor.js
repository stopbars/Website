/* oxlint-disable react-doctor/js-combine-iterations -- Geoman synchronization keeps feature filtering and layer projection as separate lifecycle stages. */

const DRAW_PREVIEW_ID = '__editor-draw-preview__';
const REFERENCE_SNAP_PREFIX = '__reference-snap__:';
const LIGHT_ROW_SNAP_GEOMETRIES = new Set(['Point', 'LineString', 'MultiLineString']);

export function createGeomanEditorFeatures(objects, selectedId) {
  if (!selectedId) return [];
  return objects
    .filter((object) => object.partId === selectedId && object.coordinates.length >= 2)
    .map((object) => ({
      type: 'Feature',
      id: object.partId,
      properties: {
        __gm_id: object.partId,
        __gm_disableEdit: false,
        barsPartId: object.partId,
        color: object.color,
      },
      geometry: {
        type: 'LineString',
        coordinates: object.coordinates,
      },
    }));
}

export async function discardCompletedGeomanDraw(geoman, feature) {
  if (!geoman || !feature) return;
  geoman.features.setSelection([], false);
  try {
    await geoman.features.delete(feature);
  } finally {
    // Deleting a freshly drawn feature can emit a late selection update.
    geoman.features.setSelection([], false);
  }
}

export function limitGeomanFeatureQueries(
  geoman,
  map,
  { featureIdProperty = '__gm_id' } = {}
) {
  const adapter = geoman?.mapAdapter;
  const originalQuery = adapter?.queryFeaturesByScreenCoordinates;
  if (!adapter || typeof originalQuery !== 'function') return () => {};

  adapter.queryFeaturesByScreenCoordinates = ({ queryCoordinates, sourceNames }) => {
    const requestedSources = new Set(sourceNames ?? []);
    const layers = (map.getStyle?.()?.layers ?? [])
      .filter((layer) => requestedSources.has(layer.source))
      .map((layer) => layer.id);
    if (layers.length === 0) return [];

    const features = [];
    const seen = new Set();
    for (const renderedFeature of map.queryRenderedFeatures(queryCoordinates, { layers })) {
      const sourceName = renderedFeature.source;
      const featureId = renderedFeature.properties?.[featureIdProperty];
      const key = `${sourceName}:${featureId}`;
      if (
        featureId === null ||
        featureId === undefined ||
        !requestedSources.has(sourceName) ||
        seen.has(key)
      ) {
        continue;
      }
      const feature = geoman.features.get(sourceName, featureId);
      if (!feature) continue;
      seen.add(key);
      features.push(feature);
    }
    return features;
  };

  return () => {
    adapter.queryFeaturesByScreenCoordinates = originalQuery;
  };
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
  const poolHasCapacity = (kind) =>
    !bounded || (kind === 'line' ? lineFeatures.length : pointFeatures.length) < poolLimit;

  const addFeature = (feature, kind) => {
    if (!bounded) {
      features.push(feature);
      return;
    }
    const pool = kind === 'line' ? lineFeatures : pointFeatures;
    if (pool.length < poolLimit) pool.push(feature);
  };

  for (const [featureIndex, feature] of (referenceFeatures ?? []).entries()) {
    if (bounded && lineFeatures.length >= poolLimit && pointFeatures.length >= poolLimit) break;
    if (!referenceFeatureIsSnappable(feature)) continue;
    const sourceId = String(feature.properties?.sourceId ?? feature.id ?? '');
    if (!sourceId) continue;
    if (feature.geometry?.type === 'Point') {
      if (!poolHasCapacity('point')) continue;
      const coordinate = feature.geometry.coordinates;
      if (!validCoordinate(coordinate)) continue;
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:point`;
      addFeature(
        {
          type: 'Feature',
          id,
          properties: {
            __gm_id: id,
            __gm_shape: 'circle_marker',
            __gm_disableEdit: true,
            barsReferenceSnap: true,
          },
          geometry: { type: 'Point', coordinates: [...coordinate] },
        },
        'point'
      );
      continue;
    }
    const lines = snapLinesFromGeometry(feature.geometry);
    for (const [lineIndex, coordinates] of lines.entries()) {
      if (!poolHasCapacity('line')) break;
      if (
        !Array.isArray(coordinates) ||
        coordinates.length < 2 ||
        !coordinates.every(validCoordinate)
      ) {
        continue;
      }
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:${lineIndex}`;
      addFeature(
        {
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
        },
        'line'
      );
    }
  }

  return {
    features: bounded
      ? balancedSnapTargets(lineFeatures, pointFeatures, maximumFeatures)
      : features,
  };
}

export function createGeomanFeatureSyncState() {
  return {
    editorFeaturesById: new Map(),
    referenceSnapTargets: null,
    referenceIds: new Set(),
    snapEnabled: false,
  };
}

export function acknowledgeGeomanGeometryEdit(state, id, coordinates) {
  const featureId = String(id ?? '');
  const currentFeature = state?.editorFeaturesById?.get(featureId);
  if (
    !currentFeature ||
    currentFeature.geometry?.type !== 'LineString' ||
    !Array.isArray(coordinates)
  ) {
    return false;
  }
  state.editorFeaturesById.set(featureId, {
    ...currentFeature,
    geometry: {
      ...currentFeature.geometry,
      coordinates,
    },
  });
  return true;
}

export function planGeomanFeatureSync(
  previousState,
  { objects, selectedId, editorObjectsVisible, referenceSnapTargets, snapEnabled }
) {
  const previous = previousState ?? createGeomanFeatureSyncState();
  const nextEditorFeatures = editorObjectsVisible
    ? createGeomanEditorFeatures(objects, selectedId)
    : [];
  const nextEditorFeaturesById = new Map(
    nextEditorFeatures.map((feature) => [String(feature.id), feature])
  );
  const deleteIds = new Set();
  const importFeatures = [];

  for (const [id, previousFeature] of previous.editorFeaturesById) {
    const nextFeature = nextEditorFeaturesById.get(id);
    if (!nextFeature || !geomanEditorFeatureEqual(previousFeature, nextFeature)) {
      deleteIds.add(id);
    }
  }
  for (const [id, nextFeature] of nextEditorFeaturesById) {
    const previousFeature = previous.editorFeaturesById.get(id);
    if (!previousFeature || !geomanEditorFeatureEqual(previousFeature, nextFeature)) {
      importFeatures.push(nextFeature);
    }
  }

  const referenceTargetsChanged =
    previous.referenceSnapTargets !== referenceSnapTargets || previous.snapEnabled !== snapEnabled;
  const nextReferenceIds = snapEnabled
    ? new Set((referenceSnapTargets?.features ?? []).map((feature) => String(feature.id)))
    : new Set();
  if (referenceTargetsChanged) {
    for (const id of previous.referenceIds) deleteIds.add(id);
    if (snapEnabled) importFeatures.push(...(referenceSnapTargets?.features ?? []));
  }

  return {
    deleteIds: [...deleteIds],
    importFeatures,
    nextState: {
      editorFeaturesById: nextEditorFeaturesById,
      referenceSnapTargets,
      referenceIds: nextReferenceIds,
      snapEnabled,
    },
  };
}

function geomanEditorFeatureEqual(left, right) {
  return (
    left.geometry?.coordinates === right.geometry?.coordinates &&
    left.properties?.color === right.properties?.color &&
    left.properties?.__gm_disableEdit === right.properties?.__gm_disableEdit
  );
}

function referenceFeatureIsSnappable(feature) {
  const category = feature.properties?.snapCategory;
  const geometryType = feature.geometry?.type;
  if (category === 'light-rows') return LIGHT_ROW_SNAP_GEOMETRIES.has(geometryType);
  return category === 'fixtures' && geometryType === 'Point';
}

export function applyEditorGeometryPreviews(geojson, selectedId, editPreview, drawPreview) {
  const hasEditPreview = editPreview?.id === selectedId && editPreview.coordinates?.length >= 2;
  const hasDrawPreview = drawPreview?.length >= 2;
  if (!hasEditPreview && !hasDrawPreview) return geojson;

  const features = hasEditPreview
    ? geojson.features.map((feature) => {
        if (
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
      })
    : [...geojson.features];

  if (hasDrawPreview) {
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
    selectedLines.push(
      ...lineFeatures.slice(selectedLines.length, selectedLines.length + remaining)
    );
    remaining = limit - selectedLines.length - selectedPoints.length;
  }
  if (remaining > 0) {
    selectedPoints.push(
      ...pointFeatures.slice(selectedPoints.length, selectedPoints.length + remaining)
    );
  }
  return [...selectedLines, ...selectedPoints];
}
