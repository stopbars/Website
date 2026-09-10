import { dsfSelector, dsfSelectorKey } from './xplane-removal-contract.js';
const MIN_INTERVAL_SIZE = 1e-6;
const MSFS_ADD_GAP_TOLERANCE_METERS = 1;

export function applyMsfsSelectionEdit(selections, selection, operation, totalLengthMeters) {
  const sourceId = String(selection?.sourceId ?? '').trim();
  const total = Number(totalLengthMeters);
  if (!sourceId || !(total > 0)) return selections;

  const unrelated = [];
  const existing = [];
  for (const candidate of selections ?? []) {
    if (String(candidate?.sourceId ?? '') === sourceId) {
      existing.push(selectionInterval(candidate, total));
    } else {
      unrelated.push(candidate);
    }
  }
  const edit = selectionInterval(selection, total);
  const intervals = applyIntervalEdit(
    existing,
    edit,
    operation,
    0,
    total,
    operation === 'add' ? MSFS_ADD_GAP_TOLERANCE_METERS : MIN_INTERVAL_SIZE
  );

  return [
    ...unrelated,
    ...intervals.map(({ start, end }) =>
      start <= MIN_INTERVAL_SIZE && end >= total - MIN_INTERVAL_SIZE
        ? { sourceId }
        : { sourceId, rangeStartMeters: start, rangeEndMeters: end }
    ),
  ];
}

export function applyXPlaneSelectorEdit(selectors, selector, operation) {
  if (selector?.kind) {
    const value = dsfSelector(selector);
    if (!value || selector.start !== 0 || selector.end !== 1) return selectors;
    const rest = selectors.filter(
      (candidate) => dsfSelectorKey(candidate) !== dsfSelectorKey(value)
    );
    return operation === 'erase' ? rest : [...rest, value];
  }
  const key = xplaneSelectorKey(selector);
  if (!key) return selectors;

  const unrelated = [];
  const existing = [];
  for (const candidate of selectors ?? []) {
    if (xplaneSelectorKey(candidate) === key) {
      existing.push(selectorInterval(candidate));
    } else {
      unrelated.push(candidate);
    }
  }
  const intervals = applyIntervalEdit(existing, selectorInterval(selector), operation, 0, 1);

  return [
    ...unrelated,
    ...intervals.map(({ start, end }) => ({
      feature: selector.feature,
      code: selector.code,
      run: selector.run,
      start,
      end,
    })),
  ];
}

export function editableMsfsRemovalGroup(
  document,
  requestedSourceId,
  availableSourceIds = [],
  seedRemovalIds = []
) {
  const available = sourceAliasMap(availableSourceIds);
  const availableValues = new Set(available.values());
  const resolveSourceId = (value) => {
    const canonical = canonicalSourceId(value);
    return available.get(canonical) ?? canonical;
  };
  const requested = resolveSourceId(requestedSourceId);
  if (!requested) {
    return {
      selections: [],
      keepSelections: [],
      removalIds: [],
      sourceIds: [],
      targetSourceId: '',
    };
  }

  const editableRemovals = (document?.removals ?? []).filter((removal) =>
    ['msfs-source', 'msfs-auto', 'msfs-manual'].includes(removal.origin)
  );
  const affectedCanonicals = new Set([requested]);
  const affectedRemovals = new Map();
  const requestedRemovalIds = new Set((seedRemovalIds ?? []).map(String));
  for (const removal of editableRemovals) {
    if (!requestedRemovalIds.has(String(removal.id))) continue;
    affectedRemovals.set(String(removal.id), removal);
    for (const sourceId of compactMap(removalSourceIds(removal), resolveSourceId)) {
      if (availableValues.has(sourceId)) affectedCanonicals.add(sourceId);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const removal of editableRemovals) {
      if (affectedRemovals.has(String(removal.id))) continue;
      const removalSources = compactMap(removalSourceIds(removal), resolveSourceId);
      if (!removalSources.some((sourceId) => affectedCanonicals.has(sourceId))) continue;
      affectedRemovals.set(String(removal.id), removal);
      for (const sourceId of removalSources) {
        if (!availableValues.has(sourceId) || affectedCanonicals.has(sourceId)) continue;
        affectedCanonicals.add(sourceId);
        changed = true;
      }
    }
  }

  if (affectedRemovals.size === 0) {
    return {
      selections: [],
      keepSelections: [],
      removalIds: [],
      sourceIds: [requested],
      targetSourceId: requested,
    };
  }

  const selections = [];
  const keepSelections = [];
  const legacyWholeRowSourceIds = new Set();
  const manuallyEditedSourceIds = new Set();
  for (const removal of affectedRemovals.values()) {
    if (removal.origin === 'msfs-manual' && Array.isArray(removal.selections)) {
      for (const sourceId of compactMap(removalSourceIds(removal), resolveSourceId)) {
        manuallyEditedSourceIds.add(sourceId);
      }
    }
    if (!Array.isArray(removal.selections)) {
      for (const sourceId of compactMap(removalSourceIds(removal), resolveSourceId)) {
        legacyWholeRowSourceIds.add(sourceId);
      }
    }
    for (const selection of removal.selections ?? []) {
      if (affectedCanonicals.has(resolveSourceId(selection?.sourceId))) {
        selections.push(normalizedMsfsSelection(selection, resolveSourceId));
      }
    }
    for (const selection of removal.keepSelections ?? []) {
      if (affectedCanonicals.has(resolveSourceId(selection?.sourceId))) {
        keepSelections.push(normalizedMsfsSelection(selection, resolveSourceId));
      }
    }
  }
  for (const object of document?.objects ?? []) {
    for (const binding of object.sourceBindings ?? []) {
      const sourceId = resolveSourceId(binding?.sourceId);
      if (!affectedCanonicals.has(sourceId) || manuallyEditedSourceIds.has(sourceId)) continue;
      selections.push(
        normalizedMsfsSelection(
          {
            sourceId,
            rangeStartMeters: binding.rangeStartMeters,
            rangeEndMeters: binding.rangeEndMeters,
          },
          resolveSourceId
        )
      );
    }
  }

  const selectedCanonicals = new Set(selections.map((selection) => selection.sourceId));
  for (const sourceId of affectedCanonicals) {
    if (selectedCanonicals.has(sourceId) || !legacyWholeRowSourceIds.has(sourceId)) continue;
    selections.push({ sourceId });
  }

  return {
    selections: deduplicateMsfsSelections(selections),
    keepSelections: deduplicateMsfsSelections(keepSelections),
    removalIds: [...affectedRemovals.keys()],
    sourceIds: [...affectedCanonicals],
    targetSourceId: requested,
  };
}

export function previewMsfsRemovalEdit(document, editableGroup, selections, keepSelections = []) {
  if (!document) return document;
  const affectedSourceIds = new Set(compactMap(editableGroup?.sourceIds ?? [], canonicalSourceId));
  const affectedRemovalIds = new Set((editableGroup?.removalIds ?? []).map(String));
  const retainedRemovals = (document.removals ?? []).filter((removal) => {
    if (!['msfs-source', 'msfs-auto', 'msfs-manual'].includes(removal.origin)) return true;
    if (affectedRemovalIds.has(String(removal.id))) return false;
    return !removalSourceIds(removal).some((sourceId) =>
      affectedSourceIds.has(canonicalSourceId(sourceId))
    );
  });
  const previewSelections = selections ?? [];
  if (previewSelections.length === 0) {
    return { ...document, removals: retainedRemovals };
  }
  return {
    ...document,
    removals: [
      ...retainedRemovals,
      {
        id: 'msfs-manual:pending-preview',
        coordinates: [],
        sourceIds: compactMap(
          new Set([
            ...affectedSourceIds,
            ...previewSelections.map((selection) => canonicalSourceId(selection?.sourceId)),
          ]),
          (sourceId) => sourceId
        ),
        selections: previewSelections,
        keepSelections,
        origin: 'msfs-manual',
      },
    ],
  };
}

export function mergeIntervals(intervals, minimum, maximum, maximumGap = MIN_INTERVAL_SIZE) {
  const sorted = [];
  for (const { start, end } of intervals ?? []) {
    const normalized = normalizedInterval(start, end, minimum, maximum);
    if (normalized.end - normalized.start > MIN_INTERVAL_SIZE) sorted.push(normalized);
  }
  sorted.sort((left, right) => left.start - right.start);
  const merged = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end + maximumGap) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
  }
  return merged;
}

function compactMap(values, transform) {
  const result = [];
  for (const value of values) {
    const transformed = transform(value);
    if (transformed) result.push(transformed);
  }
  return result;
}

function applyIntervalEdit(
  existing,
  edit,
  operation,
  minimum,
  maximum,
  mergeGap = MIN_INTERVAL_SIZE
) {
  if (operation === 'erase') {
    const result = [];
    for (const interval of mergeIntervals(existing, minimum, maximum)) {
      if (edit.end <= interval.start || edit.start >= interval.end) {
        result.push(interval);
        continue;
      }
      if (edit.start - interval.start > MIN_INTERVAL_SIZE) {
        result.push({ start: interval.start, end: Math.min(edit.start, interval.end) });
      }
      if (interval.end - edit.end > MIN_INTERVAL_SIZE) {
        result.push({ start: Math.max(edit.end, interval.start), end: interval.end });
      }
    }
    return result;
  }
  return mergeIntervals([...existing, edit], minimum, maximum, mergeGap);
}

function selectionInterval(selection, total) {
  const start = Number(selection?.rangeStartMeters);
  const end = Number(selection?.rangeEndMeters);
  return Number.isFinite(start) && Number.isFinite(end)
    ? normalizedInterval(start, end, 0, total)
    : { start: 0, end: total };
}

function normalizedMsfsSelection(selection, resolveSourceId = canonicalSourceId) {
  const sourceId = resolveSourceId(selection?.sourceId);
  const start = Number(selection?.rangeStartMeters);
  const end = Number(selection?.rangeEndMeters);
  return Number.isFinite(start) && Number.isFinite(end)
    ? {
        sourceId,
        rangeStartMeters: Math.min(start, end),
        rangeEndMeters: Math.max(start, end),
      }
    : { sourceId };
}

function deduplicateMsfsSelections(selections) {
  const seen = new Set();
  return selections.filter((selection) => {
    const key = `${selection.sourceId}:${selection.rangeStartMeters ?? 'all'}:${selection.rangeEndMeters ?? 'all'}`;
    if (!selection.sourceId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function removalSourceIds(removal) {
  return [
    ...(removal?.sourceIds ?? []),
    ...(removal?.selections ?? []).map((selection) => selection?.sourceId),
  ].map(String);
}

function canonicalSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const marker = sourceId.indexOf(':division-section:');
  return marker > 0 ? sourceId.slice(0, marker) : sourceId;
}

function sourceAliasMap(values) {
  const aliases = new Map();
  for (const value of values ?? []) {
    if (value && typeof value === 'object') {
      const primary = canonicalSourceId(value.id);
      if (!primary) continue;
      aliases.set(primary, primary);
      for (const alias of value.sourceRowIds ?? []) {
        const canonicalAlias = canonicalSourceId(alias);
        if (canonicalAlias) aliases.set(canonicalAlias, primary);
      }
      continue;
    }
    const sourceId = canonicalSourceId(value);
    if (sourceId) aliases.set(sourceId, sourceId);
  }
  return aliases;
}

function selectorInterval(selector) {
  return normalizedInterval(selector?.start, selector?.end, 0, 1);
}

function normalizedInterval(start, end, minimum, maximum) {
  const first = clamp(Number(start), minimum, maximum);
  const last = clamp(Number(end), minimum, maximum);
  return { start: Math.min(first, last), end: Math.max(first, last) };
}

function xplaneSelectorKey(selector) {
  const feature = String(selector?.feature ?? '');
  const code = Number(selector?.code);
  const run = Number(selector?.run);
  return feature && Number.isInteger(code) && Number.isInteger(run)
    ? `${feature}:${code}:${run}`
    : '';
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
