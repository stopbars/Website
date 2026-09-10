export async function runTextureWorkerQueue(workers, jobs, processJob) {
  let nextJobIndex = 0;
  await Promise.all(
    workers.map(async (worker) => {
      while (nextJobIndex < jobs.length) {
        const jobIndex = nextJobIndex;
        nextJobIndex += 1;
        await processJob(worker, jobs[jobIndex], jobIndex);
      }
    })
  );
}
