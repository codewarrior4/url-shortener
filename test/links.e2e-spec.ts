import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { User } from '../src/auth/user.entity.js';
import { Link } from '../src/links/link.entity.js';
import { ShortCodeGenerator } from '../src/links/short-code.generator.js';
import { NotificationService } from '../src/notifications/notification.service.js';

describe('Links API', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: User;
  let other: User;
  let accessToken: string;
  let otherToken: string;
  const emails: string[] = [];
  const createLink = (destination = 'https://example.com/article') =>
    request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(NotificationService)
      .useValue({ enqueue: vi.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    const password = 'a-long-link-test-password';
    const passwordHash = await argon2.hash(password);
    for (let i = 0; i < 2; i++) {
      const email = `links-api-${randomUUID()}@example.com`;
      emails.push(email);
      const user = await db
        .getRepository(User)
        .save({ email, passwordHash, verifiedAt: new Date() });
      const credentials = await app.get(AuthService).login(email, password);
      if (i === 0) {
        owner = user;
        accessToken = credentials.accessToken;
      } else {
        other = user;
        otherToken = credentials.accessToken;
      }
    }
  });
  beforeEach(async () => {
    await db.getRepository(Link).delete({ userId: owner.id });
    await db.getRepository(Link).delete({ userId: other.id });
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

  it('requires authentication for every endpoint', async () => {
    await request(app.getHttpServer())
      .post('/links')
      .send({ destination: 'https://example.com' })
      .expect(401);
    await request(app.getHttpServer()).get('/links').expect(401);
    await request(app.getHttpServer())
      .patch('/links/1')
      .send({ destination: 'https://example.com' })
      .expect(401);
    await request(app.getHttpServer()).delete('/links/1').expect(401);
  });
  it.each(['http://example.com', 'https://example.com/path?x=1'])(
    'creates %s for the authenticated owner with the configured base URL',
    async (destination) => {
      const result = await createLink(destination).expect(201);
      expect(result.body).toMatchObject({ userId: owner.id, destination });
      expect(Number.isInteger(result.body.id)).toBe(true);
      expect(result.body.code).toMatch(/^[A-Za-z0-9_-]{12}$/);
      expect(result.body.shortUrl).toBe(
        new URL(
          `/${result.body.code}`,
          app.get(ConfigService).getOrThrow<string>('APP_URL'),
        ).toString(),
      );
      expect(result.headers['cache-control']).toBe('no-store');
    },
  );
  it.each([
    'javascript:alert(1)',
    'ftp://example.com',
    'data:text/html,test',
    '//example.com',
    'example.com',
    'https://user:password@example.com',
    '',
    123,
  ])('rejects invalid destination %s', async (destination) => {
    await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination })
      .expect(400);
  });
  it('rejects extra fields and missing destinations', async () => {
    await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com', userId: other.id })
      .expect(400);
    await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({})
      .expect(400);
  });
  it('paginates the authenticated owner links with package navigation links', async () => {
    const first = (await createLink('https://example.com/first')).body;
    const second = (await createLink('https://example.com/second')).body;
    await request(app.getHttpServer())
      .post('/links')
      .auth(otherToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/private' })
      .expect(201);
    const page1 = await request(app.getHttpServer())
      .get('/links?page=1&limit=1')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    const page2 = await request(app.getHttpServer())
      .get('/links?page=2&limit=1')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    expect(page1.body.data.map((link: Link) => link.id)).toEqual([second.id]);
    expect(page2.body.data.map((link: Link) => link.id)).toEqual([first.id]);
    expect(page1.body.meta).toMatchObject({
      totalItems: 2,
      totalPages: 2,
      currentPage: 1,
    });
    expect(page1.body.links.next).toContain('page=2');
  });
  it('updates destinations while preserving the code and enforcing ownership', async () => {
    const link = (await createLink()).body;
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(otherToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/stolen' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'javascript:alert(1)' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/new', code: 'changed' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({})
      .expect(400);
    const updated = await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/new' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: link.id,
      code: link.code,
      destination: 'https://example.com/new',
    });
  });
  it('returns 204 on owner deletion and 404 for unauthorized or missing links', async () => {
    const link = (await createLink()).body;
    await request(app.getHttpServer())
      .delete(`/links/${link.id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    const deleted = await request(app.getHttpServer())
      .delete(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .expect(204);
    expect(deleted.text).toBe('');
    await request(app.getHttpServer())
      .delete(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/new' })
      .expect(404);
  });
  it('rejects non-integer route IDs', async () => {
    await request(app.getHttpServer())
      .delete('/links/abc')
      .auth(accessToken, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/links/1.5')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com/new' })
      .expect(400);
  });
  it('retries a real database code collision during creation', async () => {
    const existing = (await createLink()).body;
    const codes = vi
      .spyOn(app.get(ShortCodeGenerator), 'generate')
      .mockReturnValueOnce(existing.code)
      .mockReturnValueOnce('replacement1');
    try {
      const created = await createLink().expect(201);
      expect(created.body.code).toBe('replacement1');
      expect(codes).toHaveBeenCalledTimes(2);
    } finally {
      codes.mockRestore();
    }
  });

  it('creates a custom alias, redirects publicly, and returns 409 for a duplicate', async () => {
    const alias = `alias-${randomUUID().slice(0, 8)}`;
    const body = { destination: 'https://example.com/custom', alias };
    const result = await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send(body)
      .expect(201);
    expect(result.body).toMatchObject({
      code: alias,
      expiresAt: null,
      isEnabled: true,
    });
    expect(new URL(result.body.shortUrl).pathname).toBe(`/${alias}`);
    await request(app.getHttpServer())
      .get(`/${alias}`)
      .expect(302)
      .expect('Location', body.destination);
    await request(app.getHttpServer())
      .post('/links')
      .auth(otherToken, { type: 'bearer' })
      .send(body)
      .expect(409);
  });

  it.each([
    'ab',
    'bad alias',
    'bad.alias',
    'x'.repeat(33),
    'links',
    'AUTH',
    'verify-email',
    'reset-password',
    'health',
    'admin',
    null,
  ])('rejects invalid or reserved alias %s', async (alias) => {
    await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com', alias })
      .expect(400);
  });

  it('disables and re-enables a link without releasing its alias', async () => {
    const alias = `toggle-${randomUUID().slice(0, 8)}`;
    const created = await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com', alias, isEnabled: false })
      .expect(201);
    await request(app.getHttpServer()).get(`/${alias}`).expect(404);
    await request(app.getHttpServer())
      .post('/links')
      .auth(otherToken, { type: 'bearer' })
      .send({ destination: 'https://example.com', alias })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/links/${created.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ isEnabled: true })
      .expect(200);
    await request(app.getHttpServer()).get(`/${alias}`).expect(302);
    await request(app.getHttpServer())
      .patch(`/links/${created.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ isEnabled: false })
      .expect(200);
    await request(app.getHttpServer()).get(`/${alias}`).expect(404);
    const listing = await request(app.getHttpServer())
      .get('/links')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    expect(listing.body.data[0].isEnabled).toBe(false);
  });

  it('stops redirecting at expiry and lets the owner clear expiration', async () => {
    const expiresAt = new Date(Date.now() + 60000).toISOString();
    const created = await request(app.getHttpServer())
      .post('/links')
      .auth(accessToken, { type: 'bearer' })
      .send({ destination: 'https://example.com', expiresAt })
      .expect(201);
    expect(created.body.expiresAt).toBe(expiresAt);
    await request(app.getHttpServer()).get(`/${created.body.code}`).expect(302);
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date(expiresAt).getTime());
    try {
      await request(app.getHttpServer())
        .get(`/${created.body.code}`)
        .expect(404);
    } finally {
      now.mockRestore();
    }
    await db
      .getRepository(Link)
      .update(created.body.id, { expiresAt: new Date(0) });
    await request(app.getHttpServer()).get(`/${created.body.code}`).expect(404);
    const cleared = await request(app.getHttpServer())
      .patch(`/links/${created.body.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ expiresAt: null })
      .expect(200);
    expect(cleared.body.expiresAt).toBeNull();
    await request(app.getHttpServer()).get(`/${created.body.code}`).expect(302);
  });

  it('allows owner-only lifecycle edits while keeping the alias and destination stable', async () => {
    const link = (await createLink()).body;
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(otherToken, { type: 'bearer' })
      .send({ isEnabled: false, expiresAt })
      .expect(404);
    const result = await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ expiresAt })
      .expect(200);
    expect(result.body).toMatchObject({
      code: link.code,
      destination: link.destination,
      isEnabled: true,
      expiresAt,
    });
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(accessToken, { type: 'bearer' })
      .send({ alias: 'cannot-change' })
      .expect(400);
  });

  it.each([
    { expiresAt: 'yesterday' },
    { expiresAt: '2020-01-01T00:00:00Z' },
    { expiresAt: '2099-01-01T00:00:00' },
    { expiresAt: '2099-02-30T00:00:00Z' },
    { isEnabled: 'false' },
    { isEnabled: null },
    { destination: null },
  ])(
    'rejects invalid lifecycle values %j on create and update',
    async (changes) => {
      const link = (await createLink()).body;
      await request(app.getHttpServer())
        .post('/links')
        .auth(accessToken, { type: 'bearer' })
        .send({ destination: 'https://example.com', ...changes })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/links/${link.id}`)
        .auth(accessToken, { type: 'bearer' })
        .send(changes)
        .expect(400);
    },
  );
});
