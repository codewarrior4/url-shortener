import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { NotificationService } from '../src/notifications/notification.service.js';
import type { AuthEmailEvent } from '../src/notifications/auth-email.event.js';
import { JwtService } from '@nestjs/jwt';
import { AuthSession } from '../src/auth/session.entity.js';
import { AuthToken } from '../src/auth/token.entity.js';
import { User } from '../src/auth/user.entity.js';

describe('Authentication HTTP lifecycle', () => {
  let app: INestApplication;
  let db: DataSource;
  const sent: { email: string; purpose: string; token: string }[] = [];
  const emails: string[] = [];
  const password = 'a-long-test-password-123';
  const mail = {
    enqueue: vi.fn(async (message: AuthEmailEvent) => {
      sent.push(message);
    }),
  };
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/auth/${path}`).send(body);
  const email = () => {
    const value = `auth-${randomUUID()}@example.com`;
    emails.push(value);
    return value;
  };
  const token = (address: string, purpose: string) =>
    sent.findLast((m) => m.email === address && m.purpose === purpose)!.token;
  async function verifiedUser() {
    const address = email();
    await post('register', { email: address, password }).expect(202);
    await post('verify-email', { token: token(address, 'verify') }).expect(200);
    return address;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationService)
      .useValue(mail)
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    await db.runMigrations();
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
  it('validates DTOs and rejects unknown fields', async () => {
    await post('register', { email: 'bad', password: 'short' }).expect(400);
    await post('register', { email: email(), password, admin: true }).expect(
      400,
    );
  });
  it('normalizes email, stores hashes and enforces verification with single-use tokens', async () => {
    const address = email();
    await post('register', {
      email: `  ${address.toUpperCase()} `,
      password,
    }).expect(202);
    await post('login', { email: address, password }).expect(401);
    const user = await db
      .getRepository(User)
      .findOneByOrFail({ email: address });
    expect(Number.isInteger(user.id)).toBe(true);
    expect(user.passwordHash).toBeUndefined();
    const raw = token(address, 'verify');
    const stored = await db
      .getRepository(AuthToken)
      .createQueryBuilder('t')
      .addSelect('t.hash')
      .where('t.userId = :id', { id: user.id })
      .getOneOrFail();
    expect(stored.hash).not.toBe(raw);
    await post('verify-email', { token: raw }).expect(200);
    await post('verify-email', { token: raw }).expect(400);
    await post('register', { email: address, password }).expect(202);
    await post('login', { email: address, password: 'incorrect' }).expect(401);
    await post('login', { email: address, password }).expect(200);
  });
  it('rotates refresh tokens and commits family revocation on reuse', async () => {
    const address = await verifiedUser();
    const login = await post('login', { email: address, password }).expect(200);
    const rotated = await post('refresh', {
      token: login.body.refreshToken,
    }).expect(200);
    await post('refresh', { token: login.body.refreshToken }).expect(401);
    await post('refresh', { token: rotated.body.refreshToken }).expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(rotated.body.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('logs out the current session, then all sessions', async () => {
    const address = await verifiedUser();
    const a = (await post('login', { email: address, password })).body;
    const b = (await post('login', { email: address, password })).body;
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(a.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .auth(a.accessToken, { type: 'bearer' })
      .expect(200);
    await post('refresh', { token: a.refreshToken }).expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .auth(b.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(b.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('resets passwords once and revokes existing access and refresh sessions', async () => {
    const address = await verifiedUser();
    const session = (await post('login', { email: address, password })).body;
    const existing = await post('forgot-password', { email: address }).expect(
      202,
    );
    const absent = await post('forgot-password', { email: email() }).expect(
      202,
    );
    expect(existing.body).toEqual(absent.body);
    const raw = token(address, 'reset');
    const newPassword = 'a-different-password-456';
    await post('reset-password', { token: raw, password: newPassword }).expect(
      200,
    );
    await post('reset-password', { token: raw, password: newPassword }).expect(
      400,
    );
    await post('login', { email: address, password }).expect(401);
    await post('login', { email: address, password: newPassword }).expect(200);
    await post('refresh', { token: session.refreshToken }).expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('rejects expired reset tokens and invalidates previous tokens on resend', async () => {
    const address = await verifiedUser();
    await post('forgot-password', { email: address }).expect(202);
    const previous = token(address, 'reset');
    await post('forgot-password', { email: address }).expect(202);
    await post('reset-password', { token: previous, password }).expect(400);
    const user = await db
      .getRepository(User)
      .findOneByOrFail({ email: address });
    await db
      .getRepository(AuthToken)
      .update(
        { userId: user.id, purpose: 'reset' },
        { expiresAt: new Date(0) },
      );
    await post('reset-password', {
      token: token(address, 'reset'),
      password,
    }).expect(400);
  });
  it('allows only one concurrent reset to consume a token', async () => {
    const address = await verifiedUser();
    await post('forgot-password', { email: address }).expect(202);
    const body = {
      token: token(address, 'reset'),
      password: 'concurrent-password-123',
    };
    const responses = await Promise.all([
      post('reset-password', body),
      post('reset-password', body),
    ]);
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);
  });
  it('changes password after checking current password and revokes sessions', async () => {
    const address = await verifiedUser();
    const session = (await post('login', { email: address, password })).body;
    const change = (currentPassword: string) =>
      request(app.getHttpServer())
        .post('/auth/change-password')
        .auth(session.accessToken, { type: 'bearer' })
        .send({ currentPassword, password: 'changed-password-456' });
    await change('incorrect').expect(401);
    await change(password).expect(200);
    await post('refresh', { token: session.refreshToken }).expect(401);
    await post('login', {
      email: address,
      password: 'changed-password-456',
    }).expect(200);
  });
  it('keeps enqueue failure responses generic and permits recovery', async () => {
    const address = email();
    mail.enqueue.mockRejectedValueOnce(new Error('Redis unavailable'));
    await post('register', { email: address, password }).expect(202);
    await post('resend-verification', { email: address }).expect(202);
    await post('verify-email', { token: token(address, 'verify') }).expect(200);
  });
  it('rejects expired access and refresh sessions', async () => {
    const address = await verifiedUser();
    const session = (await post('login', { email: address, password })).body;
    const payload = app.get(JwtService).decode(session.accessToken);
    const expired = await app.get(JwtService).signAsync(
      { sub: payload.sub, sid: payload.sid },
      {
        secret: process.env.JWT_SECRET!,
        algorithm: 'HS256',
        expiresIn: -1,
        issuer: 'url-shortener',
        audience: 'url-shortener-api',
      },
    );
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth(expired, { type: 'bearer' })
      .expect(401);
    await db
      .getRepository(AuthSession)
      .update(payload.sid, { expiresAt: new Date(0) });
    await post('refresh', { token: session.refreshToken }).expect(401);
  });
  it('serves working token form pages without caching', async () => {
    for (const path of ['/verify-email', '/reset-password']) {
      const response = await request(app.getHttpServer()).get(path).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toContain('location.hash');
      expect(response.text).toContain('fetch(');
    }
  });
  it('rejects malformed or forged access tokens', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .auth('forged', { type: 'bearer' })
      .expect(401);
    await post('refresh', { token: 'a'.repeat(64) }).expect(401);
  });
});

describe('Authentication rate limits', () => {
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
  it('rejects excessive login attempts', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    await request(app.getHttpServer()).post('/auth/login').send({}).expect(429);
  });
});
