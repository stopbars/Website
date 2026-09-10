/* oxlint-disable react-doctor/js-flatmap-filter react-doctor/js-combine-iterations -- Reducer helpers keep validation, normalization, and projection stages explicit to preserve editor history semantics. */

import {
  colorForObjectId,
  normalizeDocument,
  syncOriginalDivisionMetadata,
} from './editor-model.js';
import { distanceMeters, lineLengthMeters } from './editor-geometry.js';
import { bindingSelectorKey, selectorFromBinding, selectorKey } from './editor-snapping.js';
import { applyXPlaneSelectorEdit } from './removal-intervals.js';
import { traceEditorSpan } from './editor-performance.js';

const MAX_HISTORY_LENGTH = 100;
const ENDPOINT_GAP_METERS = 2;
const TINY_SEGMENT_METERS = 0.15;
const METERS_PER_DEGREE_LATITUDE = 111_320;
const GUIDANCE_TYPES = new Set(['lead_on', 'taxiway', 'stand']);
export const MISSING_DIVISION_RATIO_LIMIT = 0.15;
export const MIN_MISSING_DIVISIONS_TO_BLOCK = 2;
export const MIN_MISSING_STOPBARS_TO_BLOCK = 2;

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
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
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
      const present = syncOriginalDivisionMetadata(state.present, action.originalDivisions);
      if (
        JSON.stringify(present.originalDivisions) ===
          JSON.stringify(state.present.originalDivisions) &&
        present.objects.length === state.present.objects.length &&
        present.objects.every(
          (object, index) =>
            object.type === state.present.objects[index]?.type &&
            object.name === state.present.objects[index]?.name
        )
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
        const selected = document.objects.find((object) => object.partId === action.partId);
        if (!selected) return document;
        const id = String(action.id ?? '')
          .trim()
          .toUpperCase();
        const division = document.originalDivisions.find(
          (candidate) => String(candidate.id).toUpperCase() === id
        );
        return {
          ...document,
          objects: document.objects.map((object) =>
            object.partId === selected.partId
              ? {
                  ...object,
                  id,
                  name: division?.name || id || 'New object',
                  type: division?.type || object.type,
                  color: colorForObjectId(id),
                }
              : object
          ),
        };
      });
    case 'update-object-geometry':
      return commit(state, (document) =>
        updateObjectGeometry(
          document,
          action.id,
          action.coordinates,
          action.match,
          action.sourceBindings
        )
      );
    case 'update-source':
      return commit(state, (document) => ({ ...document, source: action.source }));
    case 'add-object': {
      const next = commit(state, (document) => ({
        ...document,
        objects: [...document.objects, action.object],
        xplaneRemovals: mergeSelectors(document.xplaneRemovals, selectorsFromMatch(action.match)),
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
    case 'edit-xplane-removal':
      return commit(state, (document) => ({
        ...document,
        xplaneRemovals: applyXPlaneSelectorEdit(
          document.xplaneRemovals,
          action.selector,
          action.operation
        ),
      }));
    case 'remove-xplane-removal':
      return commit(state, (document) => ({
        ...document,
        xplaneRemovals: document.xplaneRemovals.filter(
          (selector) => selectorKey(selector) !== selectorKey(action.selector)
        ),
      }));
    case 'replace-msfs-source-removals':
      return commit(state, (document) => ({
        ...document,
        removals: [
          ...document.removals.filter((removal) => removal.origin !== 'msfs-source'),
          ...(action.removals ?? []),
        ],
      }));
    case 'replace-msfs-manual-removals':
      return commit(state, (document) => ({
        ...document,
        removals: [
          ...document.removals.filter((removal) => removal.origin !== 'msfs-manual'),
          ...(action.removals ?? []).map((removal) => ({
            ...removal,
            origin: 'msfs-manual',
          })),
        ],
      }));
    case 'replace-msfs-edited-removals':
      return traceEditorSpan(
        'reducer:replace-msfs-edited-removals',
        () =>
          commit(state, (document) => {
            const affectedSourceIds = new Set(
              (action.sourceIds ?? []).map(canonicalMsfsRemovalSourceId)
            );
            const affectedRemovalIds = new Set((action.removalIds ?? []).map(String));
            return {
              ...document,
              removals: [
                ...document.removals.filter((removal) => {
                  if (affectedRemovalIds.has(String(removal.id))) return false;
                  if (!['msfs-source', 'msfs-auto', 'msfs-manual'].includes(removal.origin)) {
                    return true;
                  }
                  return !(removal.sourceIds ?? []).some((sourceId) =>
                    affectedSourceIds.has(canonicalMsfsRemovalSourceId(sourceId))
                  );
                }),
                ...(action.removals ?? []).map((removal) => ({
                  ...removal,
                  origin: 'msfs-manual',
                })),
              ],
            };
          }),
        {
          existingRemovalCount: state.present.removals.length,
          generatedRemovalCount: action.removals?.length ?? 0,
          affectedSourceCount: action.sourceIds?.length ?? 0,
        }
      );
    case 'migrate-imported-msfs-removals':
      return commit(state, (document) => {
        const bindingsByPartId = new Map(
          (action.bindingsByPartId ?? []).map((entry) => [String(entry.partId), entry.bindings])
        );
        const affectedSourceIds = new Set(
          (action.sourceIds ?? []).map(canonicalMsfsRemovalSourceId)
        );
        const replacedRemovalIds = new Set((action.removalIds ?? []).map(String));
        return {
          ...document,
          objects: document.objects.map((object) =>
            bindingsByPartId.has(String(object.partId))
              ? { ...object, sourceBindings: bindingsByPartId.get(String(object.partId)) }
              : object
          ),
          removals: [
            ...document.removals.filter((removal) => {
              if (removal.origin === 'imported' && replacedRemovalIds.has(String(removal.id))) {
                return false;
              }
              const overlaps = (removal.sourceIds ?? []).some((sourceId) =>
                affectedSourceIds.has(canonicalMsfsRemovalSourceId(sourceId))
              );
              return !overlaps || !['msfs-source', 'msfs-auto'].includes(removal.origin);
            }),
            ...(action.removals ?? []).map((removal) => ({
              ...removal,
              origin: 'msfs-auto',
            })),
          ],
        };
      });
    case 'upsert-msfs-auto-removals':
      return commit(state, (document) => {
        const affectedSourceIds = new Set(
          (action.sourceIds ?? []).map(canonicalMsfsRemovalSourceId)
        );
        const affectedRemovalIds = new Set((action.removalIds ?? []).map(String));
        return {
          ...document,
          removals: [
            ...document.removals.filter((removal) => {
              if (
                affectedRemovalIds.has(String(removal.id)) &&
                ['imported', 'msfs-source', 'msfs-auto'].includes(removal.origin)
              ) {
                return false;
              }
              const overlaps = (removal.sourceIds ?? []).some((id) =>
                affectedSourceIds.has(canonicalMsfsRemovalSourceId(id))
              );
              if (!overlaps) return true;
              return !['msfs-source', 'msfs-auto'].includes(removal.origin);
            }),
            ...(action.removals ?? []).map((removal) => ({
              ...removal,
              origin: 'msfs-auto',
            })),
          ],
        };
      });
    default:
      return state;
  }
}

function canonicalMsfsRemovalSourceId(value) {
  const sourceId = String(value ?? '').trim();
  const marker = sourceId.indexOf(':division-section:');
  return marker > 0 ? sourceId.slice(0, marker) : sourceId;
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
      (selector) =>
        !removedKeys.has(selectorKey(selector)) || retainedKeys.has(selectorKey(selector))
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

function updateObjectGeometry(document, id, coordinates, match, sourceBindings) {
  const previous = document.objects.find((object) => object.partId === id);
  const previousKeys = new Set(
    (previous?.sourceBindings ?? []).map(bindingSelectorKey).filter(Boolean)
  );
  const nextBindings = Array.isArray(sourceBindings) ? sourceBindings : bindingsFromMatch(match);
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
      xplaneRemovals = mergeSelector(xplaneRemovals, selectorFromBinding(binding));
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

  const originalDivisions = document.originalDivisions ?? [];
  const representedIds = new Set(
    document.objects.map((object) => String(object.id).trim().toUpperCase()).filter(Boolean)
  );
  const missingDivisions = originalDivisions.filter(
    (division) => !representedIds.has(String(division.id).trim().toUpperCase())
  );
  const missingStopbars = missingDivisions.filter((division) => division.type === 'stopbar').length;
  const missingRatio = originalDivisions.length
    ? missingDivisions.length / originalDivisions.length
    : 0;
  const missingDivisionsBlock =
    (missingDivisions.length >= MIN_MISSING_DIVISIONS_TO_BLOCK &&
      missingRatio > MISSING_DIVISION_RATIO_LIMIT) ||
    missingStopbars >= MIN_MISSING_STOPBARS_TO_BLOCK;

  for (const division of missingDivisions) {
    const divisionName = division.name || division.id;
    const message = missingDivisionsBlock
      ? `${divisionName} was not matched. ${missingDivisions.length} of ${originalDivisions.length} BARS objects are missing; resolve enough to continue.`
      : `${divisionName} was not matched. Review or add it before testing.`;
    issues.push(
      issue(
        'missing-division',
        missingDivisionsBlock ? 'error' : 'warning',
        {
          id: division.id,
          partId: `original:${division.id}`,
          target: 'division',
        },
        message
      )
    );
  }

  const endpoints = document.objects.flatMap((object) => [
    {
      id: object.partId ?? object.id,
      objectId: object.id,
      objectType: object.type,
      side: 'start',
      coordinate: object.coordinates[0],
    },
    {
      id: object.partId ?? object.id,
      objectId: object.id,
      objectType: object.type,
      side: 'end',
      coordinate: object.coordinates.at(-1),
    },
  ]);
  const endpointIndex = createEndpointIndex(endpoints, ENDPOINT_GAP_METERS);
  for (const endpoint of endpoints) {
    if (!endpoint.coordinate) continue;
    if (GUIDANCE_TYPES.has(endpoint.objectType)) continue;
    const nearest = endpointIndex.nearest(endpoint);
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

function createEndpointIndex(endpoints, maximumDistanceMeters) {
  const indexedEndpoints = endpoints
    .map((endpoint, index) => ({ ...endpoint, index }))
    .filter((endpoint) => validCoordinate(endpoint.coordinate));
  const minimumLongitudeScale = indexedEndpoints.reduce((minimum, endpoint) => {
    const latitude = Math.max(-90, Math.min(90, Number(endpoint.coordinate[1])));
    const scale =
      METERS_PER_DEGREE_LATITUDE * Math.max(Math.cos((latitude * Math.PI) / 180), 0.000001);
    return Math.min(minimum, scale);
  }, METERS_PER_DEGREE_LATITUDE);
  const longitudeCellSize = maximumDistanceMeters / minimumLongitudeScale;
  const latitudeCellSize = maximumDistanceMeters / METERS_PER_DEGREE_LATITUDE;
  const buckets = new Map();

  for (const endpoint of indexedEndpoints) {
    const [longitudeCell, latitudeCell] = endpointCell(
      endpoint.coordinate,
      longitudeCellSize,
      latitudeCellSize
    );
    const key = `${longitudeCell}:${latitudeCell}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(endpoint);
    else buckets.set(key, [endpoint]);
  }

  return {
    nearest(endpoint) {
      if (!validCoordinate(endpoint.coordinate)) return null;
      const [longitudeCell, latitudeCell] = endpointCell(
        endpoint.coordinate,
        longitudeCellSize,
        latitudeCellSize
      );
      let nearest = null;
      for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
        for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
          const candidates = buckets.get(
            `${longitudeCell + longitudeOffset}:${latitudeCell + latitudeOffset}`
          );
          for (const candidate of candidates ?? []) {
            if (candidate.id === endpoint.id) continue;
            const distance = distanceMeters(endpoint.coordinate, candidate.coordinate);
            if (distance > maximumDistanceMeters) continue;
            if (
              !nearest ||
              distance < nearest.distance ||
              (distance === nearest.distance && candidate.index < nearest.index)
            ) {
              nearest = { ...candidate, distance };
            }
          }
        }
      }
      return nearest;
    },
  };
}

function endpointCell(coordinate, longitudeCellSize, latitudeCellSize) {
  return [
    Math.floor(coordinate[0] / longitudeCellSize),
    Math.floor(coordinate[1] / latitudeCellSize),
  ];
}

function validCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function commit(state, transform) {
  const transformed = transform(state.present);
  if (transformed === state.present || sameDocumentReferences(transformed, state.present)) {
    return state;
  }
  const nextDocument = {
    ...transformed,
    updatedAt: new Date().toISOString(),
    testedHash: null,
  };
  return {
    ...state,
    past: [...state.past.slice(-(MAX_HISTORY_LENGTH - 1)), state.present],
    present: nextDocument,
    future: [],
    dirty: true,
  };
}

function sameDocumentReferences(left, right) {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  keys.delete('updatedAt');
  keys.delete('testedHash');
  for (const key of keys) {
    if (!Object.is(left?.[key], right?.[key])) return false;
  }
  return true;
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
