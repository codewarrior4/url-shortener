import dataSource from '../dist/database/data-source.js';
import { User } from '../dist/auth/user.entity.js';
import { UserRole } from '../dist/auth/user-role.js';

const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3];
if (!email || !Object.values(UserRole).includes(role)) {
  throw new Error('Usage: npm run admin:role -- existing-email user|admin');
}

await dataSource.initialize();
try {
  const result = await dataSource.getRepository(User).update({ email }, { role });
  if (!result.affected) throw new Error('Account not found');
  console.log(`Account role updated to ${role}. Existing sessions use the new role on their next request.`);
} finally {
  await dataSource.destroy();
}
