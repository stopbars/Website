import {
  createXPlaneAssetResolver,
  xplaneAssetTextureProperties,
} from '../draft-generator/extractor/xplane-dsf.js';

export async function resolveXPlaneReferenceTextures(scene, entries) {
  const resolver = await createXPlaneAssetResolver(entries);
  const definitions = new Set();
  const aptDefinitions = new Map();
  for (const feature of scene?.features ?? []) {
    const properties = feature.properties ?? {};
    const markingCode = Number(properties.markingCode);
    const aptDefinition =
      properties.sourceType === 'xplane-apt-painted-marking' &&
      Number.isInteger(markingCode) &&
      markingCode > 0
        ? resolver.aptMarkingDefinition(markingCode)
        : '';
    if (aptDefinition) aptDefinitions.set(markingCode, aptDefinition);
    const definition =
      properties.sourceDefinition || properties.sourceAssetPath || aptDefinition;
    if (definition && ['LineString', 'Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
      definitions.add(definition);
    }
  }

  const assets = new Map(
    await Promise.all(
      [...definitions].map(async (definition) => [
        definition,
        await resolver.describePolygon(definition),
      ])
    )
  );
  const resolvedDefinitionNames = new Set();
  let referencedTextures = 0;
  const features = (scene?.features ?? []).map((feature) => {
    const properties = feature.properties ?? {};
    const definition =
      properties.sourceDefinition ||
      properties.sourceAssetPath ||
      aptDefinitions.get(Number(properties.markingCode));
    const asset = assets.get(definition);
    if (!asset?.definitionResolved) return feature;
    resolvedDefinitionNames.add(definition);
    if (asset.textureAssetPath) referencedTextures += 1;
    const textureProperties = xplaneAssetTextureProperties(asset);
    return {
      ...feature,
      properties: {
        ...properties,
        sourceDefinition: definition,
        sourceAssetPath: asset.resolvedPath || properties.sourceAssetPath,
        ...textureProperties,
        renderPattern:
          asset.textureAssetPath && feature.geometry?.type === 'LineString'
            ? textureProperties.texturePattern
            : properties.renderPattern,
      },
    };
  });

  return {
    scene: { ...scene, features },
    stats: {
      definitions: definitions.size,
      resolvedDefinitions: resolvedDefinitionNames.size,
      referencedTextures,
    },
  };
}
