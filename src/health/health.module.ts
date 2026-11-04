import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { NotificationRedisModule } from '../notifications/notification-redis.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, NotificationRedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
