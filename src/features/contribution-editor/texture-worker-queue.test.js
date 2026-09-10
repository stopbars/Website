import assert from 'node:assert/strict';
import test from 'node:test';
import { runTextureWorkerQueue } from './texture-worker-queue.js';

test('distributes queued texture jobs once across available workers', async () => {
  const processed = [];
  await runTextureWorkerQueue(['a', 'b', 'c'], [0, 1, 2, 3, 4, 5, 6], async (worker, job) => {
    processed.push({ worker, job });
    await Promise.resolve();
  });

  assert.deepEqual(
    processed.map(({ job }) => job).sort((left, right) => left - right),
    [0, 1, 2, 3, 4, 5, 6]
  );
  assert.equal(new Set(processed.map(({ worker }) => worker)).size, 3);
});
