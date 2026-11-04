import { existsSync, writeFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';

if (existsSync('.env.docker')) throw new Error('.env.docker already exists; leaving it unchanged');
const ci = process.argv.includes('--ci');
if (!ci && existsSync('.env')) loadEnvFile('.env');
const settings = {
  APP_PORT: '4100', APP_URL: 'http://localhost:4100',
  POSTGRES_USER: 'shortener', POSTGRES_PASSWORD: randomBytes(24).toString('hex'), POSTGRES_DB: 'url_shortener',
  JWT_SECRET: randomBytes(48).toString('hex'), NOTIFICATION_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  QUEUE_PREFIX: 'url-shortener-docker',
  SMTP_HOST: ci ? 'sandbox.smtp.mailtrap.io' : process.env.SMTP_HOST,
  SMTP_PORT: ci ? '2525' : (process.env.SMTP_PORT ?? '2525'),
  SMTP_USER: ci ? 'ci-test' : process.env.SMTP_USER,
  SMTP_PASSWORD: ci ? 'ci-test' : process.env.SMTP_PASSWORD,
  MAIL_FROM: ci ? 'auth@example.com' : process.env.MAIL_FROM,
};
if (Object.values(settings).some(value => !value)) throw new Error('Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD and MAIL_FROM in .env first');
writeFileSync('.env.docker', Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { flag: 'wx', mode: 0o600 });
console.log('Created ignored .env.docker with isolated database credentials and keys. No secrets printed.');
