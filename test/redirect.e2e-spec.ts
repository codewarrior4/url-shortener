import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { User } from '../src/auth/user.entity.js';
import { LinksService } from '../src/links/links.service.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import type { AuthEmailEvent } from '../src/notifications/auth-email.event.js';

describe('Public short-link redirects', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: User;
  let links: LinksService;
  const emails: string[] = [];
  const notifications: AuthEmailEvent[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(NotificationService)
      .useValue({
        enqueue: vi.fn(async (event: AuthEmailEvent) => {
          notifications.push(event);
        }),
      })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    links = app.get(LinksService);
    const email = `redirect-${randomUUID()}@example.com`;
    emails.push(email);
    owner = await db
      .getRepository(User)
      .save({ email, passwordHash: 'not-used-for-login', verifiedAt: null });
  });
  afterAll(async () => {
    if (db && emails.length)
      await db
        .createQueryBuilder()
        .delete()
        .from(User)
        .where('email IN (:...emails)', { emails })
        .execute();
    await app?.close();
  });
  it.each([
    'https://example.com/path?q=hello%20world&x=1#section',
    'http://example.com/article',
  ])(
    'redirects anonymously to %s without following the external site in the test',
    async (destination) => {
      const link = await links.create(owner.id, destination);
      const response = await request(app.getHttpServer())
        .get(`/${link.code}`)
        .redirects(0)
        .expect(302);
      expect(response.headers.location).toBe(destination);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
    },
  );
  it('returns 404 without a redirect header for unknown or malformed codes', async () => {
    for (const code of ['missing-code', 'x'.repeat(33), 'bad.code']) {
      const response = await request(app.getHttpServer())
        .get(`/${code}`)
        .expect(404);
      expect(response.headers.location).toBeUndefined();
    }
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'ftp://example.com',
    '//example.com',
    'https://user:password@example.com',
  ])('refuses an unsafe persisted destination: %s', async (destination) => {
    // Deliberately bypass DTO validation to simulate legacy/imported data.
    const link = await links.create(owner.id, destination);
    const response = await request(app.getHttpServer())
      .get(`/${link.code}`)
      .expect(404);
    expect(response.headers.location).toBeUndefined();
  });
  it('uses an edited destination and stops redirecting deleted links', async () => {
    const link = await links.create(owner.id, 'https://example.com/old');
    await links.update(owner.id, link.id, 'https://example.com/new');
    await request(app.getHttpServer())
      .get(`/${link.code}`)
      .expect(302)
      .expect('Location', 'https://example.com/new');
    await links.delete(owner.id, link.id);
    await request(app.getHttpServer()).get(`/${link.code}`).expect(404);
  });
  it('preserves existing root, auth-page and protected management routes', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
    await request(app.getHttpServer()).get('/verify-email').expect(200);
    await request(app.getHttpServer()).get('/reset-password').expect(200);
    await request(app.getHttpServer()).get('/links').expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
  it('completes registration → verification → login → creation → public redirect → owner deletion', async () => {
    const email = `checkpoint-${randomUUID()}@example.com`;
    emails.push(email);
    const password = 'a-long-checkpoint-password';
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(202);
    const verification = notifications.find(
      (event) => event.email === email && event.purpose === 'verify',
    )!;
    expect(verification).toBeDefined();
    await request(app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: verification.token })
      .expect(200);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const destination = 'https://example.com/checkpoint';
    const created = await request(app.getHttpServer())
      .post('/links')
      .auth(login.body.accessToken, { type: 'bearer' })
      .send({ destination })
      .expect(201);
    await request(app.getHttpServer())
      .get(new URL(created.body.shortUrl).pathname)
      .expect(302)
      .expect('Location', destination);
    await request(app.getHttpServer())
      .delete(`/links/${created.body.id}`)
      .auth(login.body.accessToken, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer()).get(`/${created.body.code}`).expect(404);
  });
});

describe('Public redirect rate limit', () => {
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
  it('limits anonymous requests across different short codes', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer()).get(`/absent-${i}`).expect(404);
    const response = await request(app.getHttpServer())
      .get('/absent-11')
      .expect(429);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers['retry-after']).toBeDefined();
  });
});
