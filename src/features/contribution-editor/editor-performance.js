const TRACE_STATE_KEY = Symbol.for('bars.contribution-editor.performance-trace');
const TRACE_EVENT_LIMIT = 500;
const SPAN_LOG_THRESHOLD_MS = 8;

function tracingEnabled() {
  return (
    import.meta.env?.DEV === true ||
    globalThis.location?.search?.includes('barsEditorTrace=1') === true
  );
}

function traceState() {
  if (!globalThis[TRACE_STATE_KEY]) {
    globalThis[TRACE_STATE_KEY] = {
      active: new Map(),
      events: [],
      installed: false,
      nextInteractionId: 1,
      observers: [],
    };
  }
  return globalThis[TRACE_STATE_KEY];
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function currentInteractionId(state = traceState()) {
  return [...state.active.keys()].at(-1) ?? null;
}

export function installEditorPerformanceTracing() {
  if (!tracingEnabled()) return;
  const state = traceState();
  if (state.installed) return;
  state.installed = true;

  globalThis.__BARS_EDITOR_TRACE__ = () =>
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        events: state.events,
        activeInteractions: [...state.active.values()],
      },
      null,
      2
    );

  installPerformanceObserver('long-animation-frame', (entry) => ({
    blockingDurationMs: round(entry.blockingDuration),
    scripts: Array.from(entry.scripts ?? [])
      .sort((left, right) => right.duration - left.duration)
      .slice(0, 12)
      .map((script) => ({
        durationMs: round(script.duration),
        forcedStyleAndLayoutDurationMs: round(script.forcedStyleAndLayoutDuration),
        functionName: script.sourceFunctionName || '',
        sourceUrl: script.sourceURL || '',
        invoker: script.invoker || '',
      })),
  }));
  installPerformanceObserver('longtask', (entry) => ({
    attribution: [...(entry.attribution ?? [])].map((item) => ({
      name: item.name,
      containerName: item.containerName,
      containerSrc: item.containerSrc,
    })),
  }));
}

function installPerformanceObserver(type, detailsFromEntry) {
  if (typeof globalThis.PerformanceObserver !== 'function') return;
  try {
    const observer = new globalThis.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordEditorDuration(type, entry.duration, detailsFromEntry(entry), entry.startTime);
      }
    });
    observer.observe({ type, buffered: true });
    traceState().observers.push(observer);
  } catch {
    // Older browsers can reject an unsupported entry type.
  }
}

export function beginEditorInteraction(name, details = {}) {
  if (!tracingEnabled()) return () => {};
  installEditorPerformanceTracing();
  const state = traceState();
  const id = `${name}:${state.nextInteractionId++}`;
  const startedAtMs = now();
  const interaction = { id, name, startedAtMs: round(startedAtMs), details };
  state.active.set(id, interaction);
  appendEvent({
    interactionId: id,
    name: `${name}:start`,
    startTimeMs: startedAtMs,
    durationMs: 0,
    details,
  });

  let finished = false;
  return (finishDetails = {}) => {
    if (finished) return;
    finished = true;
    const finishedAtMs = now();
    state.active.delete(id);
    appendEvent({
      interactionId: id,
      name: `${name}:complete`,
      startTimeMs: startedAtMs,
      durationMs: finishedAtMs - startedAtMs,
      details: finishDetails,
    });
    reportInteraction(interaction, finishedAtMs, finishDetails);
  };
}

export function finishEditorInteractionAfterSettled(finish, details = {}, delayMs = 1_200) {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.setTimeout?.(() => finish(details), delayMs);
    return;
  }
  globalThis.requestAnimationFrame(() => {
    globalThis.requestAnimationFrame(() => {
      globalThis.setTimeout?.(() => finish(details), delayMs);
    });
  });
}

export function traceEditorSpan(name, operation, details = {}) {
  if (!tracingEnabled()) return operation();
  const startedAtMs = now();
  try {
    return operation();
  } finally {
    recordEditorDuration(name, now() - startedAtMs, details, startedAtMs);
  }
}

export async function traceEditorAsync(name, operation, details = {}) {
  if (!tracingEnabled()) return operation();
  const startedAtMs = now();
  try {
    return await operation();
  } finally {
    recordEditorDuration(name, now() - startedAtMs, details, startedAtMs);
  }
}

export function recordEditorDuration(name, durationMs, details = {}, startTimeMs = now()) {
  if (!tracingEnabled()) return;
  const state = traceState();
  if (durationMs < SPAN_LOG_THRESHOLD_MS && state.active.size === 0) return;
  appendEvent({
    interactionId: currentInteractionId(state),
    name,
    startTimeMs,
    durationMs,
    details,
  });
}

function appendEvent(event) {
  const state = traceState();
  state.events.push({
    ...event,
    startTimeMs: round(event.startTimeMs),
    durationMs: round(event.durationMs),
  });
  if (state.events.length > TRACE_EVENT_LIMIT) {
    state.events.splice(0, state.events.length - TRACE_EVENT_LIMIT);
  }
}

function reportInteraction(interaction, finishedAtMs, finishDetails) {
  const state = traceState();
  const events = state.events.filter(
    (event) =>
      event.interactionId === interaction.id ||
      (event.startTimeMs >= interaction.startedAtMs - 20 &&
        event.startTimeMs <= finishedAtMs + 20)
  );
  const report = {
    id: interaction.id,
    name: interaction.name,
    durationMs: round(finishedAtMs - interaction.startedAtMs),
    details: { ...interaction.details, ...finishDetails },
    events,
  };
  globalThis.__BARS_EDITOR_LAST_TRACE__ = report;
  console.groupCollapsed(
    `[BARS editor trace] ${report.name} ${report.durationMs.toFixed(1)} ms`
  );
  console.table(
    events.map((event) => ({
      name: event.name,
      durationMs: event.durationMs,
      startTimeMs: event.startTimeMs,
    }))
  );
  console.info(report);
  console.info(
    'Copy this trace with: copy(JSON.stringify(window.__BARS_EDITOR_LAST_TRACE__, null, 2))'
  );
  console.groupEnd();
}
