import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { MailService } from '../src/mail/mail.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { User } from '../src/auth/user.entity.js';
import { AuthToken } from '../src/auth/token.entity.js';
import { AuthEmailEvent } from '../src/notifications/auth-email.event.js';
import { NotificationPayloadService } from '../src/notifications/notification-payload.service.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import { NotificationQueueService } from '../src/notifications/notification-redis.module.js';
import type { Job } from 'bullmq';

describe('Events → Redis notifications → processor', () => {
  let app: INestApplication;
  let db: DataSource;
  let notifications: NotificationService;
  let producer: NotificationQueueService;
  const emails: string[] = [];
  const jobs: Job[] = [];
  const mail = {
    sendToken: vi.fn(
      async (_email: string, _purpose: string, _token: string) => undefined,
    ),
  };
  const jobId = (message: AuthEmailEvent) =>
    createHash('sha256')
      .update(`${message.purpose}:${message.token}`)
      .digest('hex');
  const address = () => {
    const value = `queue-${randomUUID()}@example.com`;
    emails.push(value);
    return value;
  };
  const delivered = (email: string) =>
    mail.sendToken.mock.calls.filter((call) => call[0] === email);
  async function fixture(expiresAt = new Date(Date.now() + 60000)) {
    const email = address();
    const user = await db
      .getRepository(User)
      .save({ email, passwordHash: 'not-used-for-login', verifiedAt: null });
    const token = randomBytes(32).toString('hex');
    await db
      .getRepository(AuthToken)
      .save({
        userId: user.id,
        sessionId: null,
        purpose: 'verify',
        hash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
        consumedAt: null,
      });
    return new AuthEmailEvent(email, 'verify', token);
  }
  async function finished(message: AuthEmailEvent) {
    const job = await producer.queue.getJob(jobId(message));
    expect(job).toBeDefined();
    jobs.push(job!);
    await vi.waitFor(
      async () => expect(await job!.getState()).toBe('completed'),
      { timeout: 10000, interval: 50 },
    );
    return (await producer.queue.getJob(job!.id!))!;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    await db.runMigrations();
    notifications = app.get(NotificationService);
    producer = app.get(NotificationQueueService);
    await producer.queue.waitUntilReady();
  });
  afterAll(async () => {
    for (const job of jobs) await job.remove();
    if (db && emails.length)
      await db
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('email IN (:...emails)', { emails })
        .execute();
    await app?.close();
  });
  it('dispatches committed registration and reset events through the listener and real queue', async () => {
    const email = address();
    const auth = app.get(AuthService);
    await auth.register(email, 'a-long-notification-password');
    await vi.waitFor(() => expect(delivered(email)).toHaveLength(1), {
      timeout: 5000,
    });
    const verification = delivered(email)[0]!;
    expect(verification[1]).toBe('verify');
    await finished(new AuthEmailEvent(email, 'verify', verification[2]));
    await auth.consume(verification[2], 'verify');
    await auth.requestEmail(email, 'reset');
    await vi.waitFor(() => expect(delivered(email)).toHaveLength(2), {
      timeout: 5000,
    });
    const reset = delivered(email)[1]!;
    expect(reset[1]).toBe('reset');
    await finished(new AuthEmailEvent(email, 'reset', reset[2]));
  });
  it('retries a failed delivery, retains one job for duplicate events and encrypts its payload', async () => {
    const message = await fixture();
    mail.sendToken.mockRejectedValueOnce(new Error('Temporary SMTP outage'));
    await notifications.enqueue(message);
    await notifications.enqueue(message);
    const job = await finished(message);
    expect(delivered(message.email)).toHaveLength(2); // One failed attempt, then success.
    expect(job.attemptsMade).toBe(2);
    expect(JSON.stringify(job.data)).not.toContain(message.token);
    expect(JSON.stringify(job.data)).not.toContain(message.email);
    await notifications.enqueue(message);
    expect(await producer.queue.getJob(job.id!)).toBeDefined();
    expect(delivered(message.email)).toHaveLength(2);
  });
  it('retains exhausted failures and permits a successful manual retry', async () => {
    const message = await fixture();
    mail.sendToken
      .mockRejectedValueOnce(new Error('SMTP down'))
      .mockRejectedValueOnce(new Error('SMTP still down'));
    const job = await producer.queue.add(
      'auth-email',
      { encrypted: app.get(NotificationPayloadService).encrypt(message) },
      {
        jobId: jobId(message),
        attempts: 2,
        backoff: { type: 'fixed', delay: 20 },
        removeOnFail: false,
      },
    );
    jobs.push(job);
    await vi.waitFor(async () => expect(await job.getState()).toBe('failed'), {
      timeout: 5000,
    });
    expect((await producer.queue.getJob(job.id!))?.attemptsMade).toBe(2);
    await job.retry('failed', { resetAttemptsMade: true });
    await vi.waitFor(
      async () => expect(await job.getState()).toBe('completed'),
      { timeout: 5000 },
    );
    expect(delivered(message.email)).toHaveLength(3);
  });
  it('skips stale or consumed tokens instead of sending unusable links', async () => {
    const expired = await fixture(new Date(0));
    await notifications.enqueue(expired);
    await finished(expired);
    expect(delivered(expired.email)).toHaveLength(0);
    const consumed = await fixture();
    await db
      .getRepository(AuthToken)
      .update(
        { hash: createHash('sha256').update(consumed.token).digest('hex') },
        { consumedAt: new Date() },
      );
    await notifications.enqueue(consumed);
    await finished(consumed);
    expect(delivered(consumed.email)).toHaveLength(0);
  });
});
