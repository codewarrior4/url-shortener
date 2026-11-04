import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import * as argon2 from 'argon2';
import dataSource from '../dist/database/data-source.js';
import { User } from '../dist/auth/user.entity.js';

if (process.env.ALLOW_LOCAL_SMOKE !== '1') throw new Error('Run this fixture-writing smoke test explicitly with ALLOW_LOCAL_SMOKE=1');
const base = `http://127.0.0.1:${process.env.PORT ?? 3000}`;
const email = `container-smoke-${randomUUID()}@example.com`;
const password = randomUUID() + randomUUID();
let token;
async function call(path, method = 'GET', body, expected = 200) {
  const response = await fetch(base + path, {
    method, redirect: 'manual', signal: AbortSignal.timeout(10000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, expected, `${method} ${path}: unexpected status`);
  assert.ok(response.headers.get('x-request-id'));
  return response;
}
await dataSource.initialize();
try {
  await call('/health/live');
  await call('/health/ready');
  // SMTP is excluded from this container smoke test; the account is a temporary verified fixture.
  await dataSource.getRepository(User).save({ email, passwordHash: await argon2.hash(password), verifiedAt: new Date() });
  const credentials = await (await call('/auth/login', 'POST', { email, password })).json();
  token = credentials.accessToken;
  const destination = 'https://example.com/container-smoke';
  const link = await (await call('/links', 'POST', { destination }, 201)).json();
  assert.equal(new URL(link.shortUrl).origin, new URL(process.env.APP_URL).origin);
  token = undefined;
  const redirect = await call(`/${link.code}`, 'GET', undefined, 302);
  assert.equal(redirect.headers.get('location'), destination);
  token = credentials.accessToken;
  const listing = await (await call('/links')).json();
  assert.ok(listing.data.some(item => item.id === link.id));
  await call(`/links/${link.id}`, 'PATCH', { isEnabled: false });
  token = undefined;
  await call(`/${link.code}`, 'GET', undefined, 404);
  token = credentials.accessToken;
  await call(`/links/${link.id}`, 'DELETE', undefined, 204);
  console.log('Container smoke passed: health, login, creation, anonymous redirect, ownership listing, disabling and deletion.');
} finally {
  await dataSource.getRepository(User).delete({ email });
  await dataSource.destroy();
}
