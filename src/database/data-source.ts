import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import { environmentSchema } from '../config/environment.schema.js';
import { databaseOptions } from './database.options.js';

// The migration CLI runs outside Nest, so it loads and validates configuration itself.
const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

const { error, value } = environmentSchema.validate(process.env, {
  abortEarly: false,
  allowUnknown: true,
});

if (error) {
  throw new Error(`Invalid migration configuration: ${error.message}`);
}

if (
  value.NODE_ENV === 'test' &&
  new URL(value.DATABASE_URL).pathname !== '/url_shortener_test'
) {
  throw new Error('Test migrations require the url_shortener_test database.');
}

export default new DataSource(databaseOptions(value.DATABASE_URL));
