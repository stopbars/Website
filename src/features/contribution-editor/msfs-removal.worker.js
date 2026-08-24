import { buildSelectedMsfsRemovals } from './msfs-removal.js';

let removalContext = null;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'initialize') {
    removalContext = message.context;
    return;
  }
  if (message?.type !== 'build') return;
  try {
    self.postMessage({
      type: 'complete',
      id: message.id,
      result: buildSelectedMsfsRemovals(removalContext, message.selections),
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
