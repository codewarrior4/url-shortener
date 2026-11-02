import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../dist/app.module.js');
const { NotificationQueueService } = await import('../dist/notifications/notification-redis.module.js');
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const queue = app.get(NotificationQueueService).queue;
  if (process.argv[2] === 'retry' && process.argv[3]) {
    const job = await queue.getJob(process.argv[3]);
    if (!job || await job.getState() !== 'failed') throw new Error('A failed notification job ID is required');
    await job.retry('failed', { resetAttemptsMade: true });
    console.log('Failed notification requeued. Expired or consumed tokens will be skipped.');
  } else if (process.argv[2] === 'failed') {
    const jobs = await queue.getJobs(['failed'], 0, 49);
    console.log(jobs.map(job => ({ id: job.id, attempts: job.attemptsMade, failedAt: job.finishedOn })));
  } else {
    throw new Error('Usage: node scripts/notifications.mjs failed | retry JOB_ID');
  }
} finally { await app.close(); }
