# URL Shortener Course — 01: Project Setup

## Goal

Create and run a new NestJS application. We will configure TypeORM, PostgreSQL and Vitest after reviewing the generated configuration.

You write and run the code yourself. Share configuration, results and errors for review before moving to the next lesson.

## 1. Check your versions

Run:

```bash
node --version
npm --version
npm view @nestjs/cli version
npm view @nestjs/core version
```

Keep the output for review. We will check compatible package versions before adding database and testing configuration.

## 2. Scaffold the application

An empty `url-shortener` folder has already been created beside `basic-api`:

```text
/Users/codewarrior/nestjs-class/
├── basic-api/
└── url-shortener/
```

From the parent directory, run:

```bash
cd /Users/codewarrior/nestjs-class
npx @nestjs/cli@latest new url-shortener --package-manager npm
```

If offered optional observability integration, skip it for now. If the CLI reports a conflict, share the error before changing or deleting files.

Like `laravel new`, the Nest CLI generates the initial application structure and installs dependencies. We will inspect its defaults before adapting them for this course.

## 3. Start the application

```bash
cd url-shortener
npm run start:dev
```

Visit <http://localhost:3000>. You should see `Hello World!`.

Leave the generated tests in place for now. We will replace their configuration with Vitest together.

## 4. Submit for review

Paste the following into the course chat:

- Output of the four version commands.
- Generated `package.json`.
- Generated `tsconfig.json`.
- Whether `Hello World!` appears, or the complete error you encounter.

Do not include secrets or `.env` values.

## Completion checklist

- [ ] Version information collected.
- [ ] NestJS project scaffolded.
- [ ] Development server starts successfully.
- [ ] Browser displays `Hello World!`.
- [ ] Configuration and results shared for review.

## Next lesson

Review the generated configuration, establish native ESM deliberately, and configure Vitest. Then connect PostgreSQL through TypeORM using migrations and a separate test database.

## Two-day project plan

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
