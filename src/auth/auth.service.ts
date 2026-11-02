import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { randomBytes, createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import { User } from './user.entity.js';
import { AuthSession } from './session.entity.js';
import { AuthToken } from './token.entity.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuthEmailEvent,
  AUTH_EMAIL_EVENTS,
} from '../notifications/auth-email.event.js';

export const genericMessage = {
  message: 'If the account is eligible, an email will be sent.',
};
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly dummyHash = argon2.hash(randomBytes(32));
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  private async token(
    em: EntityManager,
    userId: number,
    purpose: AuthToken['purpose'],
    sessionId: number | null = null,
  ) {
    const raw = randomBytes(32).toString('hex');
    const seconds =
      purpose === 'refresh' ? 7 * 86400 : purpose === 'reset' ? 1800 : 86400;
    await em.save(
      AuthToken,
      em.create(AuthToken, {
        userId,
        sessionId,
        purpose,
        hash: digest(raw),
        expiresAt: new Date(Date.now() + seconds * 1000),
        consumedAt: null,
      }),
    );
    return raw;
  }
  private async deliver(
    email: string,
    purpose: 'verify' | 'reset',
    token: string,
    registered = false,
  ) {
    try {
      const name = registered
        ? AUTH_EMAIL_EVENTS.registered
        : purpose === 'verify'
          ? AUTH_EMAIL_EVENTS.verification
          : AUTH_EMAIL_EVENTS.reset;
      await this.events.emitAsync(
        name,
        new AuthEmailEvent(email, purpose, token),
      );
    } catch {
      this.logger.warn(
        'Notification enqueue failed; user can request another email.',
      );
    }
  }
  async register(email: string, password: string) {
    const passwordHash = await argon2.hash(password);
    let raw: string;
    try {
      raw = await this.db.transaction(async (em) => {
        const user = await em.save(
          User,
          em.create(User, { email, passwordHash, verifiedAt: null }),
        );
        return this.token(em, user.id, 'verify');
      });
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      )
        return genericMessage;
      throw error;
    }
    await this.deliver(email, 'verify', raw, true);
    return genericMessage;
  }
  async requestEmail(email: string, purpose: 'verify' | 'reset') {
    const user = await this.db.getRepository(User).findOneBy({ email });
    if (!user || (purpose === 'verify' && user.verifiedAt))
      return genericMessage;
    const raw = await this.db.transaction(async (em) => {
      await em.findOneOrFail(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      await em.update(
        AuthToken,
        { userId: user.id, purpose, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
      return this.token(em, user.id, purpose);
    });
    await this.deliver(email, purpose, raw);
    return genericMessage;
  }
  async consume(raw: string, purpose: 'verify' | 'reset', password?: string) {
    const candidate = await this.db
      .getRepository(AuthToken)
      .findOneBy({ hash: digest(raw), purpose });
    if (!candidate) throw new BadRequestException('Invalid or expired token');
    const passwordHash = password ? await argon2.hash(password) : undefined;
    await this.db.transaction(async (em) => {
      const user = await em.findOneOrFail(User, {
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const token = await em.findOneOrFail(AuthToken, {
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (token.consumedAt || token.expiresAt <= new Date())
        throw new BadRequestException('Invalid or expired token');
      if (purpose === 'verify') user.verifiedAt = new Date();
      else {
        user.passwordHash = passwordHash!;
        await em.update(
          AuthSession,
          { userId: user.id, revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
      }
      await em.save(User, user);
      await em.update(
        AuthToken,
        { userId: user.id, purpose, consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
    });
    return {
      message:
        purpose === 'verify'
          ? 'Email verified'
          : 'Password reset; log in again',
    };
  }
  private async credentials(
    userId: number,
    sessionId: number,
    refreshToken: string,
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: String(userId), sid: sessionId },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        algorithm: 'HS256',
        expiresIn: 900,
        issuer: 'url-shortener',
        audience: 'url-shortener-api',
      },
    );
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: 900 };
  }
  async login(email: string, password: string) {
    const user = await this.db
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
    const valid = await argon2.verify(
      user?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (!user || !valid || !user.verifiedAt)
      throw new UnauthorizedException(
        'Invalid credentials or unverified email',
      );
    const result = await this.db.transaction(async (em) => {
      const locked = await em.findOneOrFail(User, {
        where: { id: user.id },
        select: { id: true, passwordHash: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (locked.passwordHash !== user.passwordHash)
        throw new UnauthorizedException();
      const session = await em.save(
        AuthSession,
        em.create(AuthSession, {
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
          revokedAt: null,
        }),
      );
      return {
        session,
        raw: await this.token(em, user.id, 'refresh', session.id),
      };
    });
    return this.credentials(user.id, result.session.id, result.raw);
  }
  async refresh(raw: string) {
    const candidate = await this.db
      .getRepository(AuthToken)
      .findOneBy({ hash: digest(raw), purpose: 'refresh' });
    if (!candidate?.sessionId)
      throw new UnauthorizedException('Invalid refresh token');
    const result = await this.db.transaction(async (em) => {
      await em.findOneOrFail(User, {
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const session = await em.findOneOrFail(AuthSession, {
        where: { id: candidate.sessionId! },
        lock: { mode: 'pessimistic_write' },
      });
      const token = await em.findOneOrFail(AuthToken, {
        where: { id: candidate.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (session.revokedAt || session.expiresAt <= new Date()) return null;
      if (token.consumedAt || token.expiresAt <= new Date()) {
        session.revokedAt = new Date();
        await em.save(AuthSession, session);
        return null; // Commit revocation before throwing outside the transaction.
      }
      token.consumedAt = new Date();
      await em.save(AuthToken, token);
      return {
        raw: await this.token(em, candidate.userId, 'refresh', session.id),
        session,
      };
    });
    if (!result)
      throw new UnauthorizedException('Refresh session revoked or expired');
    return this.credentials(candidate.userId, result.session.id, result.raw);
  }
  async authenticate(accessToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sid: number }>(
        accessToken,
        {
          secret: this.config.getOrThrow<string>('JWT_SECRET'),
          algorithms: ['HS256'],
          issuer: 'url-shortener',
          audience: 'url-shortener-api',
        },
      );
      const session = await this.db.getRepository(AuthSession).findOneBy({
        id: payload.sid,
        userId: Number(payload.sub),
        revokedAt: IsNull(),
      });
      if (!session || session.expiresAt <= new Date()) throw new Error();
      return { userId: session.userId, sessionId: session.id };
    } catch {
      throw new UnauthorizedException();
    }
  }
  async logout(userId: number, sessionId?: number) {
    await this.db.getRepository(AuthSession).update(
      {
        userId,
        ...(sessionId ? { id: sessionId } : {}),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
    return { message: 'Logged out' };
  }
  async changePassword(
    userId: number,
    currentPassword: string,
    password: string,
  ) {
    const passwordHash = await argon2.hash(password);
    await this.db.transaction(async (em) => {
      const user = await em.findOneOrFail(User, {
        where: { id: userId },
        select: { id: true, passwordHash: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!(await argon2.verify(user.passwordHash, currentPassword)))
        throw new UnauthorizedException('Incorrect password');
      await em.update(User, userId, { passwordHash });
      await em.update(
        AuthSession,
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await em.update(
        AuthToken,
        { userId, purpose: 'reset', consumedAt: IsNull() },
        { consumedAt: new Date() },
      );
    });
    return { message: 'Password changed; log in again' };
  }
  async me(userId: number) {
    const user = await this.db
      .getRepository(User)
      .findOneByOrFail({ id: userId });
    return { id: user.id, email: user.email, verifiedAt: user.verifiedAt };
  }
}
