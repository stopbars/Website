/* oxlint-disable react-doctor/js-flatmap-filter -- Removal selections are bounded and the explicit validity filter documents accepted worker input. */

export function createMsfsRemovalWorkerClient(context) {
  const worker = new Worker(new URL('./msfs-removal.worker.js', import.meta.url), {
    type: 'module',
  });
  const pending = new Map();
  let nextId = 0;
  let terminated = false;

  worker.onmessage = (event) => {
    const entry = pending.get(event.data?.id);
    if (!entry) return;
    pending.delete(event.data.id);
    entry.signal?.removeEventListener('abort', entry.handleAbort);
    if (event.data.type === 'complete') entry.resolve(event.data.result);
    else entry.reject(new Error(event.data.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'MSFS removal geometry could not be built.');
    for (const entry of pending.values()) {
      entry.signal?.removeEventListener('abort', entry.handleAbort);
      entry.reject(error);
    }
    pending.clear();
  };
  worker.postMessage({ type: 'initialize', context });

  return {
    build(selections, { signal } = {}) {
      return new Promise((resolve, reject) => {
        if (terminated || signal?.aborted) {
          reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
          return;
        }
        const id = ++nextId;
        const handleAbort = () => {
          pending.delete(id);
          reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
        };
        pending.set(id, { resolve, reject, signal, handleAbort });
        signal?.addEventListener('abort', handleAbort, { once: true });
        worker.postMessage({ type: 'build', id, selections });
      });
    },
    terminate() {
      if (terminated) return;
      terminated = true;
      worker.terminate();
      for (const entry of pending.values()) {
        entry.signal?.removeEventListener('abort', entry.handleAbort);
        entry.reject(new DOMException('Removal generation was cancelled.', 'AbortError'));
      }
      pending.clear();
    },
  };
}

export function removalSelectionFromBinding(binding) {
  const sourceId = canonicalMsfsRemovalSourceId(binding?.sourceId);
  if (!sourceId) return null;
  const start = Number(binding?.rangeStartMeters);
  const end = Number(binding?.rangeEndMeters);
  return Number.isFinite(start) && Number.isFinite(end)
    ? {
        sourceId,
        rangeStartMeters: Math.min(start, end),
        rangeEndMeters: Math.max(start, end),
      }
    : { sourceId };
}

export function canonicalMsfsRemovalSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const sectionMarker = sourceId.indexOf(':division-section:');
  return sectionMarker > 0 ? sourceId.slice(0, sectionMarker) : sourceId;
}

export function removalSelectionsFromMatches(matchOrMatches) {
  const matches = Array.isArray(matchOrMatches) ? matchOrMatches : [matchOrMatches];
  const selections = new Map();
  for (const match of matches) {
    const bindings = match?.bindings?.length ? match.bindings : [match?.binding];
    for (const binding of bindings) {
      const selection = removalSelectionFromBinding(binding);
      if (!selection) continue;
      const existing = selections.get(selection.sourceId);
      if (!existing) {
        selections.set(selection.sourceId, selection);
        continue;
      }
      if (!('rangeStartMeters' in existing) || !('rangeStartMeters' in selection)) {
        selections.set(selection.sourceId, { sourceId: selection.sourceId });
        continue;
      }
      selections.set(selection.sourceId, {
        sourceId: selection.sourceId,
        rangeStartMeters: Math.min(existing.rangeStartMeters, selection.rangeStartMeters),
        rangeEndMeters: Math.max(existing.rangeEndMeters, selection.rangeEndMeters),
      });
    }
  }
  return [...selections.values()];
}

export function automaticRemovalSelections(matchOrMatches, retainedBindings = []) {
  const currentSelections = removalSelectionsFromMatches(matchOrMatches);
  const currentSourceIds = new Set(currentSelections.map((selection) => selection.sourceId));
  const retainedSelections = removalSelectionsFromMatches({ bindings: retainedBindings }).filter(
    (selection) => !currentSourceIds.has(selection.sourceId)
  );
  return [...currentSelections, ...retainedSelections];
}

export function removalBindingsWithSharedRows(objects, editedPartId, editedBindings) {
  const bindings = [...(editedBindings ?? [])];
  const editedSourceIds = new Set(
    bindings.map((binding) => canonicalMsfsRemovalSourceId(binding.sourceId)).filter(Boolean)
  );
  if (editedSourceIds.size === 0) return bindings;
  for (const object of objects ?? []) {
    if (object.partId === editedPartId) continue;
    for (const binding of object.sourceBindings ?? []) {
      if (editedSourceIds.has(canonicalMsfsRemovalSourceId(binding.sourceId))) {
        bindings.push(binding);
      }
    }
  }
  return bindings;
}

export function coveredAutomaticRemovalIds(removals, objectCoordinates) {
  if (!Array.isArray(objectCoordinates) || objectCoordinates.length < 2) return [];
  const requiredCoveredPoints = Math.min(2, objectCoordinates.length);
  return (removals ?? []).flatMap((removal) => {
    if (!['msfs-source', 'msfs-auto'].includes(removal.origin)) return [];
    const ring = removal.coordinates;
    if (!Array.isArray(ring) || ring.length < 3) return [];
    let coveredPoints = 0;
    for (const coordinate of objectCoordinates) {
      if (pointInRing(coordinate, ring)) coveredPoints += 1;
      if (coveredPoints >= requiredCoveredPoints) return [String(removal.id)];
    }
    return [];
  });
}

function pointInRing(point, ring) {
  const x = Number(point?.[0]);
  const y = Number(point?.[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[previous];
    const end = ring[index];
    if (pointOnSegment(point, start, end)) return true;
    const startY = Number(start?.[1]);
    const endY = Number(end?.[1]);
    const crosses = startY > y !== endY > y;
    if (!crosses) continue;
    const intersectionX =
      Number(start?.[0]) +
      ((y - startY) * (Number(end?.[0]) - Number(start?.[0]))) / (endY - startY);
    if (x < intersectionX) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point, start, end) {
  const px = Number(point?.[0]);
  const py = Number(point?.[1]);
  const sx = Number(start?.[0]);
  const sy = Number(start?.[1]);
  const ex = Number(end?.[0]);
  const ey = Number(end?.[1]);
  if (![px, py, sx, sy, ex, ey].every(Number.isFinite)) return false;
  const cross = (px - sx) * (ey - sy) - (py - sy) * (ex - sx);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    px >= Math.min(sx, ex) &&
    px <= Math.max(sx, ex) &&
    py >= Math.min(sy, ey) &&
    py <= Math.max(sy, ey)
  );
}
