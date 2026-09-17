import { buildXPlaneTextureGeometry } from './xplane-texture-geometry.js';
import { mercatorTextureGroups } from './xplane-mercator-geometry.js';

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'build') return;
  try {
    const groups = mercatorTextureGroups(buildXPlaneTextureGeometry(event.data.features));
    self.postMessage(
      { type: 'complete', id: event.data.id, groups },
      groups.map((group) => group.vertices.buffer)
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: event.data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
