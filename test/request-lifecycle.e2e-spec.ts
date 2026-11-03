import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/auth/user.entity.js';
import { LinksService } from '../src/links/links.service.js';
import { NotificationService } from '../src/notifications/notification.service.js';

@Controller('lifecycle-tests')
class FailureController {
  @Get('unexpected')
  unexpected() {
    throw new Error('Internal diagnostic that must not reach clients');
  }
}

describe('Request lifecycle', () => {
  let app: INestApplication;
  let db: DataSource;
  let user: User;
  const timed = (headers: Record<string, string>) =>
    expect(headers['x-response-time']).toMatch(/^\d+\.\d{2}ms$/);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FailureController],
    })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(NotificationService)
      .useValue({ enqueue: vi.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    user = await db.getRepository(User).save({
      email: `lifecycle-${randomUUID()}@example.com`,
      passwordHash: 'not-used-for-login',
      verifiedAt: null,
    });
  });
  afterAll(async () => {
    if (user) await db.getRepository(User).delete(user.id);
    await app?.close();
  });
  it('adds request IDs and timing without wrapping successful responses', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
    expect(response.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
    timed(response.headers);
  });
  it('preserves a safe caller request ID and replaces invalid ones', async () => {
    const safe = await request(app.getHttpServer())
      .get('/')
      .set('X-Request-ID', 'client-request_123')
      .expect(200);
    expect(safe.headers['x-request-id']).toBe('client-request_123');
    for (const value of ['contains spaces', 'x'.repeat(65)]) {
      const replaced = await request(app.getHttpServer())
        .get('/')
        .set('X-Request-ID', value)
        .expect(200);
      expect(replaced.headers['x-request-id']).not.toBe(value);
    }
  });
  it('keeps redirect status and Location intact with tracing headers', async () => {
    const link = await app
      .get(LinksService)
      .create(user.id, 'https://example.com/lifecycle?q=1');
    const response = await request(app.getHttpServer())
      .get(`/${link.code}`)
      .set('X-Request-ID', 'redirect-request')
      .expect(302)
      .expect('Location', link.destination);
    expect(response.headers['x-request-id']).toBe('redirect-request');
    expect(response.headers['cache-control']).toBe('no-store');
    timed(response.headers);
  });
  it('adds correlation and timing to guard failures before interceptors run', async () => {
    const response = await request(app.getHttpServer())
      .get('/links')
      .set('X-Request-ID', 'guard-failure')
      .expect(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      requestId: 'guard-failure',
    });
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
    timed(response.headers);
  });
  it('preserves validation messages in the error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid', password: 'short' })
      .expect(400);
    expect(Array.isArray(response.body.message)).toBe(true);
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    timed(response.headers);
  });
  it('correlates missing routes and hides unexpected internal diagnostics', async () => {
    const missing = await request(app.getHttpServer())
      .get('/a/missing/route')
      .expect(404);
    expect(missing.body.requestId).toBe(missing.headers['x-request-id']);
    const failure = await request(app.getHttpServer())
      .get('/lifecycle-tests/unexpected')
      .expect(500);
    expect(failure.body).toEqual({
      statusCode: 500,
      message: 'Internal server error',
      error: 'Internal Server Error',
      requestId: failure.headers['x-request-id'],
    });
    expect(failure.text).not.toContain('Internal diagnostic');
  });
  it('handles malformed JSON without leaking the submitted body', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"password":"private-value",')
      .expect(400);
    expect(response.body.message).toBe('Malformed JSON body');
    expect(response.text).not.toContain('private-value');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
});

describe('Rate-limit errors through the exception filter', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationService)
      .useValue({ enqueue: vi.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  it('preserves Retry-After on 429 responses and adds request metadata', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .get('/missing-for-rate-test')
        .expect(404);
    const response = await request(app.getHttpServer())
      .get('/missing-for-rate-test')
      .set('X-Request-ID', 'rate-limited')
      .expect(429);
    expect(response.headers['retry-after']).toBeDefined();
    expect(response.body.requestId).toBe('rate-limited');
    expect(response.headers['x-response-time']).toMatch(/ms$/);
  });
});
