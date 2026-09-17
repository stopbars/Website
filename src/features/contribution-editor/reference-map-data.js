// Keep source diagnostics out of vector tiles; restore them only for picked features.
const REFERENCE_INDEX = '__barsReferenceIndex';
const MAP_PROPERTIES = [
  'sourceId',
  'snapCategory',
  'widthMeters',
  'texturePattern',
  'renderPattern',
  'exactTexturePattern',
  'surfaceLabel',
  'surfaceColor',
  'surfaceOpacity',
  'markingColor',
  'lightColor',
  'msfsRemovalTarget',
  'dsfRemoval',
  'sourceType',
  'removable',
];

export function referenceMapGeojson(referenceGeojson) {
  return {
    type: 'FeatureCollection',
    features: referenceGeojson.features.map((feature, index) => {
      const properties = { [REFERENCE_INDEX]: index };
      for (const key of MAP_PROPERTIES) {
        const value = feature.properties?.[key];
        if (value !== null && value !== undefined) properties[key] = value;
      }
      return { type: feature.type, id: feature.id, geometry: feature.geometry, properties };
    }),
  };
}

export function restoreReferenceMapFeature(feature, referenceGeojson) {
  if (!feature || feature.source !== 'simulator-reference') return feature;
  const index = feature.properties?.[REFERENCE_INDEX];
  if (!Number.isInteger(index) || index < 0) return feature;
  const original = referenceGeojson.features[index];
  if (!original) return feature;
  const properties = {};
  for (const [key, value] of Object.entries(original.properties ?? {})) {
    if (value === null || value === undefined) continue;
    // Vector-tile properties encode arrays and objects as JSON strings.
    properties[key] = typeof value === 'object' ? JSON.stringify(value) : value;
  }
  return { ...feature, properties };
}
