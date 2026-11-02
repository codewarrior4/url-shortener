import { ConfigService } from '@nestjs/config';
import { NotificationPayloadService } from './notification-payload.service.js';
import { AuthEmailEvent } from './auth-email.event.js';
describe('Notification payload encryption', () => {
  const service = new NotificationPayloadService(
    new ConfigService({ NOTIFICATION_ENCRYPTION_KEY: 'a'.repeat(64) }),
  );
  const message = new AuthEmailEvent(
    'person@example.com',
    'reset',
    'b'.repeat(64),
  );
  it('round-trips encrypted data without storing readable tokens or recipients', () => {
    const encrypted = service.encrypt(message);
    expect(encrypted).not.toContain(message.email);
    expect(encrypted).not.toContain(message.token);
    expect(service.decrypt(encrypted)).toEqual(message);
    expect(service.encrypt(message)).not.toBe(encrypted);
  });
  it('rejects tampering', () => {
    const parts = service.encrypt(message).split('.');
    const bytes = Buffer.from(parts[2]!, 'base64url');
    bytes[0] = bytes[0]! ^ 1;
    parts[2] = bytes.toString('base64url');
    expect(() => service.decrypt(parts.join('.'))).toThrow();
  });
  it('rejects payloads encrypted with a different key', () => {
    const other = new NotificationPayloadService(
      new ConfigService({ NOTIFICATION_ENCRYPTION_KEY: 'c'.repeat(64) }),
    );
    expect(() => other.decrypt(service.encrypt(message))).toThrow();
  });
});
