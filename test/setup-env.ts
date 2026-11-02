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
  throw new Error('API tests require DATABASE_URL targeting url_shortener_test. Configure .env.test locally.');
}
