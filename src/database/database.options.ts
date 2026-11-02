import { User } from '../auth/user.entity.js';
import { AuthSession } from '../auth/session.entity.js';
import { AuthToken } from '../auth/token.entity.js';
import { Auth1793600000000 } from './migrations/1793600000000-Auth.js';
import type { DataSourceOptions } from 'typeorm';

export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, AuthSession, AuthToken],
    migrations: [Auth1793600000000],
    synchronize: false,
    migrationsRun: false,
    connectTimeoutMS: 5000,
  };
}
