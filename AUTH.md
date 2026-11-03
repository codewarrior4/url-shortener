# Authentication implementation guide

This local implementation covers registration, verification and resend, login, refresh-token rotation and reuse detection, current/all-session logout, forgot/reset password and authenticated password changes. Users, sessions and token records use auto-incrementing integer IDs.

## Start locally

The initial auth migration has been applied to the local development and test databases. For a new checkout:

1. Install dependencies with `npm ci`; start PostgreSQL and Redis.
2. Copy `.env.example` to `.env`; supply PostgreSQL and Mailtrap Sandbox credentials.
3. Generate JWT_SECRET with `openssl rand -hex 48`; keep it out of Git.
4. Set APP_URL to the externally reachable base URL of this app, locally `http://localhost:3000`.
5. Run `npm run build`, then `npm run migration:run`.
6. Run `npm run start:dev`.

The local JWT secret was generated if one was missing. Existing SMTP and database credentials were preserved. Never use the example secret in production.

## Routes

All request bodies are JSON. Passwords on registration/reset/change must be 12–128 characters. Emails are trimmed and lowercased. Unknown body fields are rejected.

| Method and path | Body | Result |
| --- | --- | --- |
| POST /auth/register | email, password | 202 generic response; verification email for a new account |
| POST /auth/verify-email | token | 200 verifies the account; consumed or expired tokens fail |
| POST /auth/resend-verification | email | 202 generic response; replaces older verification tokens |
| POST /auth/login | email, password | 200 accessToken, refreshToken, tokenType and expiresIn; requires verified email |
| POST /auth/refresh | token (the refreshToken) | 200 replacement access/refresh pair |
| GET /auth/me | none; bearer access token | Safe user profile with integer ID; no password hash |
| POST /auth/logout | none; bearer access token | Revokes current session |
| POST /auth/logout-all | none; bearer access token | Revokes every session for this user |
| POST /auth/forgot-password | email | 202 generic response; reset email when account exists |
| POST /auth/reset-password | token, password | Consumes reset token and changes password; revokes sessions |
| POST /auth/change-password | currentPassword, password; bearer access token | Changes password and revokes all sessions and reset tokens |
| GET /verify-email | token in URL fragment | Minimal working verification form |
| GET /reset-password | token in URL fragment | Minimal working password-reset form |

Example registration:

```bash
curl -i http://localhost:3000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"learner@example.com","password":"a-long-learning-password"}'
```

Open the email in Mailtrap Sandbox and follow its link. Verification requires an explicit button click, so email scanners fetching the page do not consume the token. Then log in:

```bash
curl -i http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"learner@example.com","password":"a-long-learning-password"}'
```

For protected routes send `Authorization: Bearer <accessToken>`. Refresh tokens are opaque random strings, not JWTs. Treat both token types as secrets. This is a bearer-token API, not a browser cookie-session implementation; a future frontend needs an explicit secure token-storage design.

## Security and transaction decisions

- Passwords use Argon2. Verification/reset/refresh tokens contain 32 random bytes; only SHA-256 digests are persisted. Fast hashing is appropriate for these high-entropy tokens, unlike passwords.
- Access JWTs expire after 15 minutes and validate algorithm, issuer and audience.
- Sessions expire absolutely after 7 days. Rotation does not extend that absolute lifetime.
- Verification tokens expire after 24 hours; reset tokens after 30 minutes.
- Reset/verification consume tokens under a user row lock. Concurrent consumption permits one success.
- Refresh rotation retains consumed token hashes. Reusing a consumed token revokes its session family; revocation commits before the 401 response. Concurrent refreshes therefore require client-side serialization; a retry using an already-consumed token revokes the family.
- Protected routes check the session in PostgreSQL on each request. Logout/reset revokes access immediately for subsequent authorization checks, rather than waiting 15 minutes. Requests already authorized may still complete.
- Password reset and change revoke all user sessions atomically with the password update. Password change invalidates outstanding reset tokens.
- Database uniqueness protects normalized email addresses from duplicate registrations.
- A global DTO ValidationPipe runs identically in tests and the application.
- Current rate limits are 10 requests per minute per IP per route, using in-memory storage. They cover auth and the current root/form routes. Do not enable proxy trust indiscriminately.
- Auth responses and token pages use `Cache-Control: no-store`. Email URLs put secrets in fragments and clear them from the displayed URL. Token pages have no third-party assets.
- Responses for duplicate registration, resend and forgot-password are generic. This does not guarantee timing indistinguishability: enqueue and database work still differ. Stronger enumeration resistance requires asynchronous delivery and a measured timing policy.

## Mailtrap

SMTP host: `sandbox.smtp.mailtrap.io`; port 2525 by default. Copy the SMTP username/password from your Sandbox integration. STARTTLS and timeouts are enabled.

Mailtrap Sandbox captures messages, rather than delivering them to real recipients. Deployment to actual recipients needs Mailtrap Email Sending configuration and an appropriate verified sender.

Real SMTP smoke check:

```bash
npm run test:mailtrap
```

This requires the Sandbox host, sends verification and reset messages for a unique temporary account, completes both flows, verifies old-session revocation and deletes its own account. It never prints raw tokens or credentials. It requires migrations already applied and runs against the configured development database. Inspect Sandbox to confirm the messages render and links open correctly. SMTP acceptance alone is not proof of inbox rendering.

Email now follows committed auth events → listener → NotificationService → BullMQ → NotificationProcessor → Handlebars templates → Mailtrap. SMTP runs in the background with five attempts and exponential backoff. Enqueue failures retain generic responses and allow a resend request. See `NOTIFICATIONS.md` for implementation, recovery commands, encryption and the remaining commit-to-enqueue gap. A transactional outbox is still pending.

## Tests and CI

```bash
npm run build
npm run test:types
npm run lint
npm test
NODE_ENV=test npm run migration:run
npm run test:e2e
```

Local API tests use `.env.test`. The test database must be `url_shortener_test`; guards reject other names. Existing environment variables take precedence over files. Tests delete only their uniquely named test accounts; foreign keys cascade to their sessions/tokens.

Auth API tests replace NotificationService with a test double, capture raw tokens only in test memory and exercise real PostgreSQL transactions. Notification integration tests use real Redis and event listeners with an SMTP test double. A separate suite tests the actual rate-limit guard. Mail unit tests verify SMTP settings, HTML/text templates, token links and error handling. Queue integration tests cover retries, retained failures and manual recovery. The optional Mailtrap smoke test is deliberately excluded from CI so CI never sends email or needs SMTP credentials.

GitHub Actions builds, checks types, lints, runs unit tests, migrates a disposable PostgreSQL database and runs API/queue tests with a Redis service. It has not been run remotely from this implementation session. No deployment target, branch protection or push has been configured here.

## Laravel comparisons

- Entities describe persisted data, similarly to Eloquent models, with explicit column metadata.
- AuthService holds the application flows that might otherwise live in Laravel actions/services.
- DTOs + ValidationPipe play the role of Form Requests.
- AuthGuard is analogous to authentication middleware.
- TypeORM transaction callbacks and pessimistic locks correspond to `DB::transaction` and `lockForUpdate`.
- AuthSession is a revocable session family; AuthToken stores one-time credentials and rotation history.

## Admin authorization and moderation

New users receive the `user` role. Registration rejects a supplied `role` field.
`AuthGuard` loads the current role from PostgreSQL with the session, so promotion
or demotion takes effect on the next authorization check, even with an existing JWT.
`@Roles(UserRole.Admin)` and `RolesGuard` are reusable role requirements, similar
to Laravel authorization middleware/Gates. Owner-scoped link queries remain a
separate ownership rule.

After registering and verifying an account, an operator with local environment
and database access can explicitly promote it:

```bash
npm run admin:role -- existing-email@example.com admin
```

Demotion uses the same command with `user`. This command uses `.env`, TypeORM's
repository API and the configured database. It is not exposed through HTTP, does
not create accounts, and has not been run on any local account automatically.

Admins can call `PATCH /admin/links/:id/disable` with a bearer access token.
Anonymous requests return 401; non-admin users return 403; unknown links return 404.
The endpoint sets `adminDisabledAt`, independently of the owner's `isEnabled`.
Owners cannot clear this field through their update DTO, and their edits or
re-enabling do not restore public redirects. The current scope provides disabling,
not an admin restore endpoint.

Login, link creation and public redirects have tested 429 responses under excessive
requests. Rate limiting still uses in-memory per-IP/per-route counters; it is not
shared across multiple application instances.

## Remaining production work

URL shortener features are not implemented by this auth change. Next come links, ownership and redirects. Production follow-ups include a transactional outbox, distributed and account-aware rate limiting, retention/cleanup of expired token records, operational monitoring and deployment configuration. Do not delete consumed refresh tokens while their session is active, because reuse detection depends on them.
