import { Injectable } from '@nestjs/common';
import { NotificationQueueService } from './notification-redis.module.js';
import { createHash } from 'node:crypto';
import { AuthEmailEvent } from './auth-email.event.js';
import { NotificationPayloadService } from './notification-payload.service.js';
export const NOTIFICATION_QUEUE = 'notifications';
export const AUTH_EMAIL_JOB = 'auth-email';
export type NotificationJob = { encrypted: string };
@Injectable()
export class NotificationService {
  constructor(
    private readonly producer: NotificationQueueService,
    private readonly payloads: NotificationPayloadService,
  ) {}
  async enqueue(message: AuthEmailEvent): Promise<void> {
    const id = createHash('sha256')
      .update(`${message.purpose}:${message.token}`)
      .digest('hex');
    await this.producer.queue.add(
      AUTH_EMAIL_JOB,
      { encrypted: this.payloads.encrypt(message) },
      {
        jobId: id,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 86400, count: 1000 },
      },
    );
  }
}
