import {
  NotificationRedisModule,
  NotificationRedisService,
} from './notification-redis.module.js';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from '../mail/mail.service.js';
import { MailTemplateService } from '../mail/mail-template.service.js';
import { AuthNotificationListener } from './auth-notification.listener.js';
import {
  NotificationService,
  NOTIFICATION_QUEUE,
} from './notification.service.js';
import { NotificationPayloadService } from './notification-payload.service.js';
import { NotificationProcessor } from './notification.processor.js';

@Module({
  imports: [
    NotificationRedisModule,
    BullModule.forRootAsync({
      imports: [NotificationRedisModule],
      inject: [ConfigService, NotificationRedisService],
      useFactory: (config: ConfigService, redis: NotificationRedisService) => ({
        connection: redis.worker,
        prefix: config.getOrThrow<string>('QUEUE_PREFIX'),
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [
    NotificationService,
    NotificationPayloadService,
    AuthNotificationListener,
    NotificationProcessor,
    MailService,
    MailTemplateService,
  ],
  exports: [NotificationService, NotificationPayloadService, MailService],
})
export class NotificationModule {}
