import { Controller, Get, Header } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { NotificationRedisService } from '../notifications/notification-redis.module.js';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly indicators: HealthIndicatorService,
    private readonly db: DataSource,
    private readonly redis: NotificationRedisService,
  ) {}

  @Get('live')
  @Header('Cache-Control', 'no-store')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  @HealthCheck()
  ready() {
    return this.health.check([
      async () => {
        const result = await this.database
          .pingCheck('database', { connection: this.db })
          .withTimeout(1500);
        // Expose status only, never driver diagnostics or connection details.
        return { database: { status: result.database.status } };
      },
      async () => {
        const result = await this.indicators
          .check('redis')
          .attempt(async () => {
            try {
              await this.redis.producer.ping();
            } catch {
              throw new Error('Redis unavailable');
            }
          })
          .withTimeout(1500);
        return { redis: { status: result.redis.status } };
      },
    ]);
  }
}
