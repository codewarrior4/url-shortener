import { Injectable, Logger, Module } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import type { NotificationJob } from './notification.service.js';

@Injectable()
export class NotificationRedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(NotificationRedisService.name);
  readonly producer: Redis;
  readonly worker: Redis;
  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>('REDIS_URL');
    this.producer = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
    });
    this.worker = new Redis(url, {
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
    });
    for (const client of [this.producer, this.worker]) {
      client.on('error', () =>
        this.logger.error('Notification Redis connection error'),
      );
    }
  }
  onApplicationShutdown() {
    this.producer.disconnect();
    this.worker.disconnect();
  }
}
@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  readonly queue: Queue<NotificationJob>;
  constructor(redis: NotificationRedisService, config: ConfigService) {
    this.queue = new Queue('notifications', {
      connection: redis.producer,
      prefix: config.getOrThrow<string>('QUEUE_PREFIX'),
    });
    this.queue.on('error', () => undefined); // Redis client logs a sanitized connection error.
  }
  async onModuleDestroy() {
    await this.queue.close();
  }
}
@Module({
  providers: [NotificationRedisService, NotificationQueueService],
  exports: [NotificationRedisService, NotificationQueueService],
})
export class NotificationRedisModule {}
