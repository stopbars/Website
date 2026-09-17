export function buildXPlaneSourceValidation(data) {
  if (
    data?.meta?.aptDatFilesParsed !== 1 ||
    (data.meta.warnings ?? []).some((warning) => /malformed apt[.]dat node/i.test(warning))
  )
    return null;
  return {
    aptSelectors: (data.lightRows ?? [])
      .filter(
        (row) => row.sourceFeatureId && Number(row.lightCode) >= 101 && Number(row.lightCode) <= 108
      )
      .map((row) => ({
        feature: row.sourceFeatureId,
        code: Number(row.lightCode),
        run: Number(row.sourceRunIndex ?? 0),
      })),
  };
}

const key = (value) => `${String(value.feature).toLowerCase()}:${value.code}:${value.run}`;

export function reconcileXPlaneSource(document, validation) {
  if (document.simulator !== 'xplane' || !Array.isArray(validation?.aptSelectors)) return document;
  const available = new Set(validation.aptSelectors.map(key));
  return {
    ...document,
    xplaneRemovals: document.xplaneRemovals.filter(
      (selector) => selector.kind || available.has(key(selector))
    ),
    objects: document.objects.map((object) => ({
      ...object,
      sourceBindings: (object.sourceBindings ?? []).filter(
        (binding) =>
          binding.dsfRemoval ||
          !binding.sourceFeatureId ||
          !(Number(binding.lightCode) >= 101 && Number(binding.lightCode) <= 108) ||
          available.has(
            key({
              feature: binding.sourceFeatureId,
              code: binding.lightCode,
              run: binding.sourceRunIndex ?? 0,
            })
          )
      ),
    })),
  };
}
