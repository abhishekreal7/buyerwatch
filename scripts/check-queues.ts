import { scorePostQueue } from '../src/lib/queues/index.js';

async function run() {
  const waiting = await scorePostQueue.getWaitingCount();
  const active = await scorePostQueue.getActiveCount();
  const failed = await scorePostQueue.getFailedCount();
  const delayed = await scorePostQueue.getDelayedCount();
  const completed = await scorePostQueue.getCompletedCount();

  console.log(`Waiting: ${waiting}, Active: ${active}, Failed: ${failed}, Delayed: ${delayed}, Completed: ${completed}`);
  
  if (failed > 0) {
     const failedJobs = await scorePostQueue.getFailed();
     console.log('First failed job error:', failedJobs[0]?.failedReason);
  }
  process.exit(0);
}
run();
