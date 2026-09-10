export function reconcileCustomLayerBefore(map, layer, beforeIds) {
  if (!map?.isStyleLoaded?.()) return false;
  const beforeId = beforeIds.find((id) => map.getLayer(id));
  if (!beforeId) return false;

  if (!map.getLayer(layer.id)) {
    map.addLayer(layer, beforeId);
    return true;
  }

  const layerIds = (map.getStyle()?.layers ?? []).map(({ id }) => id);
  const currentIndex = layerIds.indexOf(layer.id);
  const beforeIndex = layerIds.indexOf(beforeId);
  if (currentIndex >= 0 && beforeIndex >= 0 && currentIndex !== beforeIndex - 1) {
    map.moveLayer(layer.id, beforeId);
  }
  return true;
}

export function maintainCustomLayerBefore(
  map,
  layer,
  beforeIds,
  {
    retryDelay = 50,
    schedule = globalThis.setTimeout,
    cancel = globalThis.clearTimeout,
    onError,
  } = {}
) {
  let stopped = false;
  let retryHandle = null;

  const scheduleRetry = () => {
    if (stopped || retryHandle !== null) return;
    retryHandle = schedule(() => {
      retryHandle = null;
      reconcile();
    }, retryDelay);
  };

  const reconcile = () => {
    if (stopped) return false;
    try {
      const ready = reconcileCustomLayerBefore(map, layer, beforeIds);
      if (!ready) scheduleRetry();
      return ready;
    } catch (error) {
      onError?.(error);
      scheduleRetry();
      return false;
    }
  };

  map.on('styledata', reconcile);
  map.on('idle', reconcile);
  reconcile();

  return {
    reconcile,
    stop() {
      stopped = true;
      map.off('styledata', reconcile);
      map.off('idle', reconcile);
      if (retryHandle !== null) cancel(retryHandle);
      retryHandle = null;
    },
  };
}

export function placeLayerImmediatelyBefore(map, layerId, beforeId) {
  if (!map?.getLayer?.(layerId) || !map.getLayer(beforeId)) return false;
  const layerIds = (map.getStyle?.()?.layers ?? []).map(({ id }) => id);
  const layerIndex = layerIds.indexOf(layerId);
  const beforeIndex = layerIds.indexOf(beforeId);
  if (layerIndex < 0 || beforeIndex < 0) return false;
  if (layerIndex !== beforeIndex - 1) map.moveLayer(layerId, beforeId);
  return true;
}
