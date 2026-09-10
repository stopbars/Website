import { buildImportedMsfsRemovalMigration, buildSelectedMsfsRemovals } from './msfs-removal.js';

let removalContext = null;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'initialize') {
    removalContext = message.context;
    return;
  }
  if (!['build', 'migrate-imported'].includes(message?.type)) return;
  try {
    const startedAt = performance.now();
    const result =
      message.type === 'migrate-imported'
        ? buildImportedMsfsRemovalMigration(removalContext, message.objects, message.removals)
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
