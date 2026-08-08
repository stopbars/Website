const DRAW_PREVIEW_ID = '__editor-draw-preview__';
const REFERENCE_SNAP_PREFIX = '__reference-snap__:';

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

export function createGeomanReferenceSnapTargets(referenceFeatures) {
  const features = [];

  for (const [featureIndex, feature] of (referenceFeatures ?? []).entries()) {
    const sourceId = String(feature.properties?.sourceId ?? feature.id ?? '');
    if (!sourceId) continue;
    if (feature.geometry?.type === 'Point') {
      const coordinate = feature.geometry.coordinates;
      if (!validCoordinate(coordinate)) continue;
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:point`;
      features.push({
        type: 'Feature',
        id,
        properties: {
          __gm_id: id,
          __gm_shape: 'circle_marker',
          __gm_disableEdit: true,
          barsReferenceSnap: true,
        },
        geometry: { type: 'Point', coordinates: [...coordinate] },
      });
      continue;
    }
    const lines =
      feature.geometry?.type === 'LineString'
        ? [feature.geometry.coordinates]
        : feature.geometry?.type === 'MultiLineString'
          ? feature.geometry.coordinates
          : [];
    for (const [lineIndex, coordinates] of lines.entries()) {
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
      const id = `${REFERENCE_SNAP_PREFIX}${sourceId}:${featureIndex}:${lineIndex}`;
      features.push({
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
      });
    }
  }

  return { features };
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
