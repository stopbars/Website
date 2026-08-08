import { colorForObjectId, normalizeDocument } from './editor-model.js';
import { distanceMeters, lineLengthMeters, nearestPointOnLine } from './editor-geometry.js';
import {
  bindingSelectorKey,
  selectorFromBinding,
  selectorKey,
} from './editor-snapping.js';

const MAX_HISTORY_LENGTH = 100;
const ENDPOINT_GAP_METERS = 2;
const TINY_SEGMENT_METERS = 0.15;

export function createEditorState(document) {
  const normalized = normalizeDocument(document);
  return {
    present: normalized,
    past: [],
    future: [],
    selectedId: null,
    dirty: false,
  };
}

export function editorReducer(state, action) {
  switch (action.type) {
    case 'replace-document':
      return createEditorState(action.document);
    case 'select':
      return { ...state, selectedId: action.id };
    case 'undo':
      return undo(state);
    case 'redo':
      return redo(state);
    case 'mark-saved':
      return { ...state, dirty: false };
    case 'mark-tested':
      return {
        ...state,
        present: { ...state.present, testedHash: action.hash },
        dirty: false,
      };
    case 'sync-original-divisions': {
      const present = normalizeDocument({
        ...state.present,
        originalDivisions: action.originalDivisions,
      });
      if (
        JSON.stringify(present.originalDivisions) ===
        JSON.stringify(state.present.originalDivisions)
      ) {
        return state;
      }
      return {
        ...state,
        present,
      };
    }
    case 'update-object':
      return commit(state, (document) => ({
        ...document,
        objects: document.objects.map((object) =>
          object.partId === action.id ? { ...object, ...action.changes } : object
        ),
      }));
    case 'rename-object-id':
      return commit(state, (document) => {
        const selected = document.objects.find(
          (object) => object.partId === action.partId
        );
        if (!selected) return document;
        return {
          ...document,
          objects: document.objects.map((object) =>
            object.groupId === selected.groupId && object.id === selected.id
              ? {
                  ...object,
                  id: action.id,
                  color: colorForObjectId(action.id),
                }
              : object
          ),
        };
      });
    case 'update-object-geometry':
      return commit(state, (document) =>
        updateObjectGeometry(document, action.id, action.coordinates, action.match)
      );
    case 'update-source':
      return commit(state, (document) => ({ ...document, source: action.source }));
    case 'add-object': {
      const next = commit(state, (document) => ({
        ...document,
        objects: [...document.objects, action.object],
        xplaneRemovals: mergeSelectors(
          document.xplaneRemovals,
          selectorsFromMatch(action.match)
        ),
      }));
      return {
        ...next,
        selectedId: next.present.objects.at(-1)?.partId ?? null,
      };
    }
    case 'delete-object': {
      const next = commit(state, (document) =>
        removeObjectAndOrphanedSelectors(document, action.id)
      );
      return {
        ...next,
        selectedId: state.selectedId === action.id ? null : state.selectedId,
      };
    }
    case 'replace-objects':
      return commit(state, (document) => ({ ...document, objects: action.objects }));
    case 'toggle-xplane-removal':
      return commit(state, (document) => ({
        ...document,
        xplaneRemovals: toggleManualSelector(document.xplaneRemovals, action.selector),
      }));
    case 'remove-xplane-removal':
      return commit(state, (document) => ({
        ...document,
        xplaneRemovals: document.xplaneRemovals.filter(
          (selector) => selectorKey(selector) !== selectorKey(action.selector)
        ),
      }));
    default:
      return state;
  }
}

function removeObjectAndOrphanedSelectors(document, partId) {
  const removed = document.objects.find((object) => object.partId === partId);
  const objects = document.objects.filter((object) => object.partId !== partId);
  if (!removed) return document;
  const removedKeys = new Set(
    (removed.sourceBindings ?? []).map(bindingSelectorKey).filter(Boolean)
  );
  const retainedKeys = new Set(
    objects.flatMap((object) =>
      (object.sourceBindings ?? []).map(bindingSelectorKey).filter(Boolean)
    )
  );
  return {
    ...document,
    objects,
    xplaneRemovals: document.xplaneRemovals.filter(
      (selector) => !removedKeys.has(selectorKey(selector)) || retainedKeys.has(selectorKey(selector))
    ),
  };
}

function toggleManualSelector(selectors, selector) {
  if (!selector) return selectors;
  const key = selectorKey(selector);
  const exists = selectors.some((candidate) => selectorKey(candidate) === key);
  if (exists) {
    return selectors.filter((candidate) => selectorKey(candidate) !== key);
  }
  return [...selectors, selector];
}

function updateObjectGeometry(document, id, coordinates, match) {
  const previous = document.objects.find((object) => object.partId === id);
  const previousKeys = new Set(
    (previous?.sourceBindings ?? []).map(bindingSelectorKey).filter(Boolean)
  );
  const nextBindings = bindingsFromMatch(match);
  const nextObjects = document.objects.map((object) =>
    object.partId === id
      ? {
          ...object,
          coordinates,
          status: match ? 'matched' : 'manual',
          sourceBindings: nextBindings,
        }
      : object
  );
  const affectedKeys = new Set([
    ...previousKeys,
    ...nextBindings.map(bindingSelectorKey).filter(Boolean),
  ]);
  const untouchedSelectors = document.xplaneRemovals.filter(
    (selector) => !affectedKeys.has(selectorKey(selector))
  );
  let xplaneRemovals = untouchedSelectors;
  for (const object of nextObjects) {
    for (const binding of object.sourceBindings ?? []) {
      if (!affectedKeys.has(bindingSelectorKey(binding))) continue;
      xplaneRemovals = mergeSelector(
        xplaneRemovals,
        selectorFromBinding(binding)
      );
    }
  }
  return { ...document, objects: nextObjects, xplaneRemovals };
}

function mergeSelector(selectors, selector) {
  if (!selector) return selectors;
  const key = selectorKey(selector);
  const existing = selectors.find((candidate) => selectorKey(candidate) === key);
  if (!existing) return [...selectors, selector];
  return selectors.map((candidate) =>
    selectorKey(candidate) === key
      ? {
          ...candidate,
          start: Math.min(candidate.start, selector.start),
          end: Math.max(candidate.end, selector.end),
        }
      : candidate
  );
}

function mergeSelectors(selectors, additions) {
  let merged = selectors;
  for (const selector of additions) {
    merged = mergeSelector(merged, selector);
  }
  return merged;
}

function bindingsFromMatch(match) {
  if (Array.isArray(match?.bindings)) return match.bindings;
  return match?.binding ? [match.binding] : [];
}

function selectorsFromMatch(match) {
  if (Array.isArray(match?.selectors)) return match.selectors;
  return match?.selector ? [match.selector] : [];
}

export function validateEditorDocument(document) {
  const issues = [];
  for (const object of document.objects) {
    if (!object.id.trim()) {
      issues.push(issue('missing-object-id', 'error', object, 'Enter a BARS ID.'));
    }
    if (object.coordinates.length < 2) {
      issues.push(
        issue('unfinished-object', 'error', object, 'Add another point to finish this part.')
      );
      continue;
    }
    if (lineLengthMeters(object.coordinates) < TINY_SEGMENT_METERS) {
      issues.push(issue('tiny-object', 'error', object, 'This part is shorter than 15 cm.'));
    }
    for (let index = 1; index < object.coordinates.length; index += 1) {
      if (distanceMeters(object.coordinates[index - 1], object.coordinates[index]) < 0.01) {
        issues.push(
          issue(
            'duplicate-vertex',
            'warning',
            object,
            `Positions ${index} and ${index + 1} overlap.`
          )
        );
      }
    }
    if (object.status === 'unmatched' && object.sourceBindings.length === 0) {
      issues.push(
        issue(
          'manual-review',
          'warning',
          object,
          'Not linked to simulator scenery. Trace or review this part before testing.'
        )
      );
    }
  }

  const representedIds = new Set(document.objects.map((object) => object.id));
  for (const division of document.originalDivisions ?? []) {
    if (representedIds.has(division.id)) continue;
    issues.push(
      issue(
        'missing-division',
        'error',
        {
          id: division.id,
          partId: `original:${division.id}`,
          target: 'division',
        },
        `${division.name || division.id} was not matched to simulator scenery.`
      )
    );
  }

  const endpoints = document.objects.flatMap((object) => [
    {
      id: object.partId ?? object.id,
      objectId: object.id,
      side: 'start',
      coordinate: object.coordinates[0],
    },
    {
      id: object.partId ?? object.id,
      objectId: object.id,
      side: 'end',
      coordinate: object.coordinates.at(-1),
    },
  ]);
  for (const endpoint of endpoints) {
    if (!endpoint.coordinate) continue;
    const nearest = endpoints
      .filter((candidate) => candidate.id !== endpoint.id && candidate.coordinate)
      .map((candidate) => ({
        ...candidate,
        distance: distanceMeters(endpoint.coordinate, candidate.coordinate),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance > 0.15 && nearest.distance <= ENDPOINT_GAP_METERS) {
      issues.push(
        issue(
          'endpoint-gap',
          'warning',
          { id: endpoint.objectId, partId: endpoint.id },
          `${capitalize(endpoint.side)} is ${nearest.distance.toFixed(1)} m from another part.`
        )
      );
    }
  }

  return deduplicateIssues(issues);
}

export function objectAtCoordinate(document, coordinate, toleranceMeters = 8) {
  let nearest = null;
  for (const object of document.objects) {
    const projection = nearestPointOnLine(coordinate, object.coordinates);
    if (
      projection &&
      projection.distanceMeters <= toleranceMeters &&
      (!nearest || projection.distanceMeters < nearest.projection.distanceMeters)
    ) {
      nearest = { object, projection };
    }
  }
  return nearest;
}

function commit(state, transform) {
  const nextDocument = normalizeDocument({
    ...transform(state.present),
    updatedAt: new Date().toISOString(),
    testedHash: null,
  });
  if (JSON.stringify(nextDocument) === JSON.stringify(state.present)) return state;
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY_LENGTH - 1)), state.present],
    present: nextDocument,
    future: [],
    dirty: true,
  };
}

function undo(state) {
  if (state.past.length === 0) return state;
  const present = state.past.at(-1);
  return {
    ...state,
    present,
    past: state.past.slice(0, -1),
    future: [state.present, ...state.future].slice(0, MAX_HISTORY_LENGTH),
    dirty: true,
  };
}

function redo(state) {
  if (state.future.length === 0) return state;
  const [present, ...future] = state.future;
  return {
    ...state,
    present,
    past: [...state.past, state.present].slice(-MAX_HISTORY_LENGTH),
    future,
    dirty: true,
  };
}

function issue(code, severity, object, message) {
  const objectId = object.id;
  const partId = object.partId ?? object.id;
  return {
    id: `${code}:${partId}:${message}`,
    code,
    severity,
    objectId,
    partId,
    target: object.target ?? 'object',
    message,
  };
}

function deduplicateIssues(issues) {
  return [...new Map(issues.map((value) => [value.id, value])).values()];
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
