import { buildMsfsRenderSource, renderBundleTransferables } from './msfs-render-bundle.js';

self.addEventListener('message', async (event) => {
  const message = event.data;
  if (message?.type !== 'decode') return;
  try {
    const result = await buildMsfsRenderSource(message.entries, {
      onProgress: (fraction, stage, detail) =>
        self.postMessage({ type: 'stage', id: message.id, fraction, stage, detail }),
    });
    self.postMessage(
      { type: 'complete', id: message.id, result },
      renderBundleTransferables(result.renderBundle)
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
