import { buildAutomaticMsfsRemovalRefresh, buildAutomaticMsfsRemovals, buildSelectedMsfsRemovals } from './msfs-removal.js';

let removalContext = null;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'initialize') {
    removalContext = message.context;
    return;
  }
  if (!['build', 'refresh-automatic'].includes(message?.type)) return;
  try {
    const startedAt = performance.now();
    const result =
      message.type === 'refresh-automatic'
        ? buildAutomaticMsfsRemovalRefresh(removalContext, message.objects, message.removals, {
            onProgress: (progress) => self.postMessage({ type: 'progress', id: message.id, progress }),
          })
        : message.automatic
          ? buildAutomaticMsfsRemovals(removalContext, message.selections, message.keepSelections, message.excludedSourceIds)
          : buildSelectedMsfsRemovals(removalContext, message.selections, message.keepSelections);
    self.postMessage({
      type: 'complete',
      id: message.id,
      result: {
        ...result,
        performanceTrace: {
          workerMilliseconds: performance.now() - startedAt,
          removalCount: result.removals?.length ?? 0,
        },
      },
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
