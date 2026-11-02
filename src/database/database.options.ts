import { fileURLToPath } from 'node:url';
import type { DataSourceOptions } from 'typeorm';

export function databaseOptions(url: string): DataSourceOptions {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';

  return {
    type: 'postgres',
    url,
    entities: [fileURLToPath(new URL(`../**/*.entity.${extension}`, import.meta.url))],
    migrations: [fileURLToPath(new URL(`./migrations/*.${extension}`, import.meta.url))],
    synchronize: false,
    migrationsRun: false,
    connectTimeoutMS: 5000,
  };
}
