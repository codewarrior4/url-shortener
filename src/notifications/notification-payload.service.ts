import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AuthEmailEvent } from './auth-email.event.js';

@Injectable()
export class NotificationPayloadService {
  constructor(private readonly config: ConfigService) {}
  private key() {
    const hex = this.config.getOrThrow<string>('NOTIFICATION_ENCRYPTION_KEY');
    if (!/^[a-f0-9]{64}$/i.test(hex))
      throw new Error('Invalid notification encryption key');
    return Buffer.from(hex, 'hex');
  }
  encrypt(message: AuthEmailEvent): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((value) => value.toString('base64url'))
      .join('.');
  }
  decrypt(payload: string): AuthEmailEvent {
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('Invalid notification payload');
    const [iv, tag, ciphertext] = parts.map((value) =>
      Buffer.from(value, 'base64url'),
    );
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv!);
    decipher.setAuthTag(tag!);
    const value = JSON.parse(
      Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString(
        'utf8',
      ),
    ) as Partial<AuthEmailEvent>;
    if (
      typeof value.email !== 'string' ||
      !['verify', 'reset'].includes(value.purpose ?? '') ||
      typeof value.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.token)
    ) {
      throw new Error('Invalid notification payload');
    }
    return new AuthEmailEvent(value.email, value.purpose!, value.token);
  }
}
