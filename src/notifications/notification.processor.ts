import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { createHash } from 'node:crypto';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { AuthToken } from '../auth/token.entity.js';
import { User } from '../auth/user.entity.js';
import { MailService } from '../mail/mail.service.js';
import { NotificationPayloadService } from './notification-payload.service.js';
import { NOTIFICATION_QUEUE, AUTH_EMAIL_JOB } from './notification.service.js';
import type { NotificationJob } from './notification.service.js';
@Processor(NOTIFICATION_QUEUE, { concurrency: 3 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  constructor(
    private readonly payloads: NotificationPayloadService,
    private readonly db: DataSource,
    private readonly mail: MailService,
  ) {
    super();
  }
  async process(job: Job<NotificationJob>) {
    if (job.name !== AUTH_EMAIL_JOB)
      throw new UnrecoverableError('Unknown notification type');
    let message;
    try {
      message = this.payloads.decrypt(job.data.encrypted);
    } catch {
      throw new UnrecoverableError(
        'Notification payload cannot be decrypted or validated',
      );
    }
    const token = await this.db.getRepository(AuthToken).findOneBy({
      hash: createHash('sha256').update(message.token).digest('hex'),
      purpose: message.purpose,
      consumedAt: IsNull(),
      expiresAt: MoreThan(new Date()),
    });
    if (!token) return { skipped: true };
    const user = await this.db
      .getRepository(User)
      .findOneBy({ id: token.userId, email: message.email });
    if (!user || (message.purpose === 'verify' && user.verifiedAt))
      return { skipped: true };
    await this.mail.sendToken(message.email, message.purpose, message.token);
    return { sent: true };
  }
  @OnWorkerEvent('failed')
  failed(job: Job | undefined) {
    // No payloads, addresses, URLs or SMTP diagnostics in logs.
    this.logger.warn(
      `Notification job ${job?.id ?? 'unknown'} failed (attempt ${job?.attemptsMade ?? 0})`,
    );
  }
  @OnWorkerEvent('error')
  error() {
    this.logger.error('Notification worker connection error');
  }
}
