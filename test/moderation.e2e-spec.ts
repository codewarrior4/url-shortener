import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { User } from '../src/auth/user.entity.js';
import { UserRole } from '../src/auth/user-role.js';
import { Link } from '../src/links/link.entity.js';
import { LinksService } from '../src/links/links.service.js';
import { NotificationService } from '../src/notifications/notification.service.js';

describe('Admin moderation', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: User;
  let admin: User;
  let ownerToken: string;
  let adminToken: string;
  const emails: string[] = [];
  const disable = (id: number, token: string) =>
    request(app.getHttpServer())
      .patch(`/admin/links/${id}/disable`)
      .auth(token, { type: 'bearer' });

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
    const password = 'a-long-moderation-password';
    const passwordHash = await argon2.hash(password);
    for (const role of [UserRole.User, UserRole.Admin]) {
      const email = `moderation-${randomUUID()}@example.com`;
      emails.push(email);
      const user = await db
        .getRepository(User)
        .save({ email, passwordHash, verifiedAt: new Date(), role });
      const session = await app.get(AuthService).login(email, password);
      if (role === UserRole.User) {
        owner = user;
        ownerToken = session.accessToken;
      } else {
        admin = user;
        adminToken = session.accessToken;
      }
    }
  });
  beforeEach(async () => {
    await db.getRepository(User).update(admin.id, { role: UserRole.Admin });
    await db.getRepository(Link).delete({ userId: owner.id });
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

  it('requires authentication and the admin role', async () => {
    const link = await app
      .get(LinksService)
      .create(owner.id, 'https://example.com');
    await request(app.getHttpServer())
      .patch(`/admin/links/${link.id}/disable`)
      .expect(401);
    await disable(link.id, ownerToken).expect(403);
    await request(app.getHttpServer()).get(`/${link.code}`).expect(302);
  });
  it('allows admins to block another user link without letting owners undo moderation', async () => {
    const link = await app
      .get(LinksService)
      .create(owner.id, 'https://example.com');
    const result = await disable(link.id, adminToken).expect(200);
    expect(result.body.adminDisabledAt).toBeTruthy();
    await request(app.getHttpServer()).get(`/${link.code}`).expect(404);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(ownerToken, { type: 'bearer' })
      .send({ isEnabled: true, destination: 'https://example.com/edited' })
      .expect(200);
    await request(app.getHttpServer()).get(`/${link.code}`).expect(404);
    await request(app.getHttpServer())
      .patch(`/links/${link.id}`)
      .auth(ownerToken, { type: 'bearer' })
      .send({ adminDisabledAt: null })
      .expect(400);
    const list = await request(app.getHttpServer())
      .get('/links')
      .auth(ownerToken, { type: 'bearer' })
      .expect(200);
    expect(list.body.data[0].adminDisabledAt).toBeTruthy();
  });
  it('rejects role escalation through registration', async () => {
    const email = `role-${randomUUID()}@example.com`;
    emails.push(email);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'a-long-role-test-password', role: 'admin' })
      .expect(400);
  });
  it('reflects demotion and promotion without issuing new JWTs', async () => {
    const link = await app
      .get(LinksService)
      .create(owner.id, 'https://example.com');
    await db.getRepository(User).update(admin.id, { role: UserRole.User });
    await disable(link.id, adminToken).expect(403);
    await db.getRepository(User).update(admin.id, { role: UserRole.Admin });
    await disable(link.id, adminToken).expect(200);
  });
  it('returns 404 for a missing link and 400 for an invalid ID', async () => {
    const link = await app
      .get(LinksService)
      .create(owner.id, 'https://example.com');
    await app.get(LinksService).delete(owner.id, link.id);
    await disable(link.id, adminToken).expect(404);
    await request(app.getHttpServer())
      .patch('/admin/links/invalid/disable')
      .auth(adminToken, { type: 'bearer' })
      .expect(400);
  });
  it('defaults new accounts to the user role', async () => {
    const email = `default-role-${randomUUID()}@example.com`;
    emails.push(email);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'a-long-role-test-password' })
      .expect(202);
    expect((await db.getRepository(User).findOneByOrFail({ email })).role).toBe(
      UserRole.User,
    );
  });
});

describe('Authenticated link-creation rate limiting', () => {
  let app: INestApplication;
  let db: DataSource;
  let user: User;
  let token: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NotificationService)
      .useValue({ enqueue: vi.fn() })
      .compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DataSource);
    const password = 'a-long-rate-limit-password';
    user = await db.getRepository(User).save({
      email: `create-rate-${randomUUID()}@example.com`,
      passwordHash: await argon2.hash(password),
      verifiedAt: new Date(),
    });
    token = (await app.get(AuthService).login(user.email, password))
      .accessToken;
  });
  afterAll(async () => {
    if (user) await db.getRepository(User).delete(user.id);
    await app?.close();
  });
  it('returns 429 after excessive authenticated creation requests', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/links')
        .auth(token, { type: 'bearer' })
        .send({ destination: 'https://example.com' })
        .expect(201);
    const response = await request(app.getHttpServer())
      .post('/links')
      .auth(token, { type: 'bearer' })
      .send({ destination: 'https://example.com' })
      .expect(429);
    expect(response.headers['retry-after']).toBeDefined();
  });
});
