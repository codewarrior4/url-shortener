import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

// CI supplies DATABASE_URL; local API tests load a separate, ignored file.
if (existsSync('.env.test')) {
  loadEnvFile('.env.test');
}

process.env.NODE_ENV = 'test';
process.env.PORT = '3000';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/url_shortener_test') {
  throw new Error(
    'API tests require DATABASE_URL targeting url_shortener_test. Configure .env.test locally.',
  );
}

// MailService is overridden in authentication API tests; SMTP is not contacted.
process.env.JWT_SECRET = 'api-tests-only-secret-at-least-32-characters';
process.env.APP_URL = 'http://localhost:3000';
process.env.SMTP_HOST = 'sandbox.smtp.mailtrap.io';
process.env.SMTP_USER = 'test';
process.env.SMTP_PASSWORD = 'test';
process.env.MAIL_FROM = 'auth@example.com';

process.env.NOTIFICATION_ENCRYPTION_KEY = '1'.repeat(64);
process.env.REDIS_URL =
  process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';
process.env.QUEUE_PREFIX = `url-shortener-test-${process.pid}`;
