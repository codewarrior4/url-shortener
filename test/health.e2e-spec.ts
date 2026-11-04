import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { once } from 'node:events';
import { AppModule } from '../src/app.module.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import { NotificationRedisService } from '../src/notifications/notification-redis.module.js';

describe('Health endpoints', () => {
  let app: INestApplication;
  let db: DataSource;
  let redis: NotificationRedisService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationService)
      .useValue({ enqueue: vi.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    redis = app.get(NotificationRedisService);
    if (redis.producer.status !== 'ready') await once(redis.producer, 'ready');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('answers liveness and readiness anonymously with real PostgreSQL and Redis', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      details: { database: { status: 'up' }, redis: { status: 'up' } },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });
  it('does not throttle repeated health probes', async () => {
    for (let i = 0; i < 12; i++)
      await request(app.getHttpServer()).get('/health/live').expect(200);
  });
  it('reports database failure as 503 without leaking diagnostics and keeps liveness up', async () => {
    vi.spyOn(db, 'query').mockRejectedValueOnce(
      new Error('private-database-credential'),
    );
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(response.text).not.toContain('private-database-credential');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
  it('reports Redis failure as 503 without leaking diagnostics', async () => {
    vi.spyOn(redis.producer, 'ping').mockRejectedValueOnce(
      new Error('private-redis-credential'),
    );
    const response = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(response.text).not.toContain('private-redis-credential');
  });
  it('bounds readiness latency for an unresponsive dependency', async () => {
    vi.spyOn(redis.producer, 'ping').mockReturnValueOnce(
      new Promise<string>(() => undefined),
    );
    await request(app.getHttpServer()).get('/health/ready').expect(503);
  });
});
