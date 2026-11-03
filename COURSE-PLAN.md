# URL Shortener — Two-Day Course Plan

Build a tested, deployable URL shortener using NestJS, TypeORM, PostgreSQL and Vitest.

You write and run the code. Lessons provide requirements, explanations, Laravel comparisons, code review and debugging guidance.

These are target timeboxes for two focused eight-hour days. If a checkpoint slips, reduce advanced scope while preserving testing and deployment time. Tests are written alongside features; the final testing blocks consolidate verification.

## Day 1 — Build and test the core

| Time | Feature | What you’ll implement |
| --- | --- | --- |
| 1 hour | Project foundation | Scaffold NestJS, configure TypeScript, environment validation, PostgreSQL, TypeORM migrations and Vitest |
| 2 hours | Registration and login | User entity, unique email, Argon2 password hashing, signup/login DTOs, JWT authentication guard |
| 2 hours | Create short links | Link entity, authenticated creation, random codes, unique database constraint, bounded collision retries |
| 1 hour | Public redirects | Resolve a code and return a temporary redirect; handle missing links; accept only HTTP/HTTPS destinations |
| 1 hour | Owner management | List links with pagination; owner-scoped access and deletion |
| 1 hour | Verification and debugging | Run unit, database integration and API tests; fix failures |

### Tests throughout Day 1

- [ ] Registration succeeds with valid input.
- [ ] Invalid registration input and duplicate emails are rejected.
- [ ] Login succeeds with valid credentials and rejects invalid credentials.
- [ ] Unauthenticated short-link creation is rejected.
- [ ] Invalid destinations and unsupported URL schemes are rejected.
- [ ] Generated-code collisions are retried, with a bounded failure path.
- [ ] Redirect status and `Location` header are correct.
- [ ] Missing short codes return the expected error.
- [ ] Owners can list and delete their links.
- [ ] One user cannot manage another user’s links.
- [ ] Pagination returns the expected records in a stable order.

### Day 1 checkpoint

A user can register, log in, create a short link, follow it publicly and manage only their own links. Relevant tests pass.

## Day 2 — Add controls and prepare deployment

| Time | Feature | What you’ll implement |
| --- | --- | --- |
| 1.5 hours | Link lifecycle | Custom aliases, conflict responses, destination edits, expiration and disabling |
| 1.5 hours | Authentication lifecycle | Refresh-token rotation, stored token hashes, logout/revocation and tests |
| 1 hour | Abuse controls and authorization | Rate limits for login/creation/redirects; admin role and an endpoint to disable abusive links |
| 1 hour | Request lifecycle | Request-ID middleware, URL-validation pipe, timing interceptor and exception filter that preserves redirects |
| 2 hours | Delivery | Docker setup, CI tests using a separate database, health checks, structured logs and deployment migrations |
| 1 hour | Final acceptance | Exercise the deployed core, run regression tests and review what you can explain independently |

### Tests throughout Day 2

- [x] Valid custom aliases work; duplicate aliases return a conflict.
- [x] Invalid or reserved aliases are rejected.
- [x] Owner destination edits work; unauthorized edits fail.
- [x] Expired, disabled and deleted links cannot redirect.
- [x] Refresh-token rotation issues a replacement and invalidates the consumed token.
- [x] Invalid and expired refresh tokens are rejected.
- [x] Logout revokes the refresh session; existing access-token expiry behaviour is documented.
- [x] Admin moderation enforces roles and disables redirects for moderated links.
- [x] Rate limits return the expected response.
- [ ] Request IDs appear on successful and failed responses.
- [ ] Error handling and timing instrumentation preserve redirect status and headers.
- [ ] Missing or invalid required environment configuration prevents startup.
- [ ] Health checks report dependency failures appropriately.
- [ ] CI uses an isolated test database and runs migrations before database/API tests.
- [ ] Deployment smoke checks verify authentication, creation and public redirects.

### Day 2 checkpoint

The core works in a deployed environment, with passing tests and documented setup. You can explain the main implementation decisions and known limitations.

## Testing approach

- **Unit tests:** isolated behaviour such as code generation and service decisions.
- **Database integration tests:** real TypeORM queries, constraints and transactions against a separate PostgreSQL test database.
- **API tests:** HTTP validation, authentication, permissions, link lifecycle and redirects.

Use migrations from the beginning with `synchronize: false`. Keep secrets in `.env` and out of Git. Never run destructive test cleanup against the development or production database.

## Follow-on course backlog

These remain part of the broader course, beyond the two-day core:

| Feature | Follow-on work |
| --- | --- |
| Email verification and password reset | Expiring single-use tokens, queued delivery and API tests |
| Reliable background work | Retries, idempotency, failed-job recovery and transactional outbox; no exactly-once delivery claims |
| Analytics | Queued click events, aggregation and privacy decisions |
| Redis caching | Lookup caching, TTLs and invalidation on edits, expiration or disabling; distinguish disposable cache data from durable queue requirements |
| Deeper production hardening | Refresh-token replay handling, advanced abuse prevention, concurrency tests and operational recovery |

## First task

Follow `01-project-setup.md`, then share your version output, generated `package.json`, generated `tsconfig.json` and startup result for review.
