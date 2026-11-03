import { User } from '../auth/user.entity.js';
import { Link } from '../links/link.entity.js';
import { AuthSession } from '../auth/session.entity.js';
import { AuthToken } from '../auth/token.entity.js';
import { Auth1793600000000 } from './migrations/1793600000000-Auth.js';
import { CreateLinks1793619903614 } from './migrations/1793619903614-CreateLinks.js';
import { AddLinkLifecycle1793696826224 } from './migrations/1793696826224-AddLinkLifecycle.js';
import { AddAdminModeration1793697168945 } from './migrations/1793697168945-AddAdminModeration.js';
import type { DataSourceOptions } from 'typeorm';

export function databaseOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [User, AuthSession, AuthToken, Link],
    migrations: [
      Auth1793600000000,
      CreateLinks1793619903614,
      AddLinkLifecycle1793696826224,
      AddAdminModeration1793697168945,
    ],
    synchronize: false,
    migrationsRun: false,
    connectTimeoutMS: 5000,
  };
}
