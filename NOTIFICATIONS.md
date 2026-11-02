# Events, queued notifications and mail templates

## Flow

```text
AuthService: commit user/token transaction
  → emitAsync(auth.registered / auth.verification.requested / auth.password-reset.requested)
  → AuthNotificationListener
  → NotificationService.enqueue
  → encrypted job in Redis / BullMQ
  → NotificationProcessor
  → recheck token expiry/consumption and recipient in PostgreSQL
  → MailService
  → MailTemplateService: layout + header + body + footer
  → Mailtrap SMTP
```

The HTTP request waits for enqueueing, not SMTP. `emitAsync` lets the caller observe enqueue failures. `@OnEvent(..., { suppressErrors: false })` prevents the listener from hiding them. The AuthService logs a sanitized enqueue failure and keeps the generic auth response; users can request another email.

## Files and Laravel equivalents

| File | Purpose | Laravel equivalent |
| --- | --- | --- |
| `src/notifications/auth-email.event.ts` | Typed event data and names | Events |
| `src/notifications/auth-notification.listener.ts` | Converts auth events into notification requests | Listeners |
| `src/notifications/notification.service.ts` | Encrypts and queues notification jobs with retry/deduplication options | Notification dispatch |
| `src/notifications/notification.processor.ts` | Background delivery and stale-token checks | Queued notification / queue worker |
| `src/notifications/notification-redis.module.ts` | Explicit Redis clients and lifecycle cleanup | Queue connection configuration |
| `src/mail/mail.service.ts` | SMTP delivery, TLS and timeouts | Mail transport / Mailable |
| `src/mail/mail-template.service.ts` | Renders shared layout and purpose-specific bodies | Blade view rendering |
| `src/mail/templates/layout.hbs` | Shared HTML email shell | Base Blade layout |
| `src/mail/templates/partials/header.hbs` | Brand header | Blade include/component |
| `src/mail/templates/partials/footer.hbs` | Shared footer | Blade include/component |
| `src/mail/templates/verify.hbs` | Verification email body | Verification mail view |
| `src/mail/templates/reset.hbs` | Password-reset email body | Reset mail view |

Handlebars escapes context values by default. Only the body produced by our own templates is inserted as trusted HTML into the layout. Both messages include a plain-text alternative and a fallback link. Inline styles and table layout improve email-client compatibility. Templates are copied into `dist/mail/templates` by Nest's asset configuration, so compiled production code can load them.

## Redis configuration

`.env` requires:

```dotenv
REDIS_URL=redis://127.0.0.1:6379/0
QUEUE_PREFIX=url-shortener
NOTIFICATION_ENCRYPTION_KEY=<64 hexadecimal characters from a secure random generator>
```

Generate a real encryption key with `openssl rand -hex 32`. A random local key was added if missing; example/test keys are not production keys. Both producers and workers must share this key. Do not replace it while jobs encrypted with it remain pending unless you implement key-versioned decryption or intentionally discard those jobs. Losing it makes those jobs unreadable.

The installed BullMQ version in native ESM needs explicit Redis clients. Request producers use low retry counts and a command timeout; background workers use `maxRetriesPerRequest: null` to reconnect and keep processing. Connections close on shutdown. The worker runs inside the Nest application process for this stage; it is asynchronous background work but not yet a separately deployed worker process.

The queue uses Redis for pending work, not disposable cache data. Production Redis needs persistence and a `noeviction` policy, with suitable access control and TLS. A logical Redis database index is a development/test separation convenience, not a strong security boundary. Use a separate test service in CI and a distinct production queue Redis deployment from caches where operational requirements differ.

References: [Nest queues](https://docs.nestjs.com/techniques/queues), [Nest events](https://docs.nestjs.com/techniques/events), [BullMQ connections](https://docs.bullmq.io/guide/connections), [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production).

## Retries, deduplication and recovery

- Five total attempts, exponential backoff beginning at two seconds.
- A stable hash of purpose + raw token supplies the job ID. Duplicate events for that token use the existing job while it remains retained.
- Completed jobs retain metadata for up to one hour or 1,000 jobs. Failed jobs retain it for up to seven days or 1,000 jobs. Age cleanup is lazy and may happen when subsequent jobs finish, rather than at an exact expiry time.
- Email addresses and raw tokens are encrypted together with AES-256-GCM before storage in job data. PostgreSQL still stores only token hashes.
- A processor rechecks the persisted token and user before delivery. Tokens that expired, were consumed, were invalidated by resend, or belong to a deleted user are skipped.
- Unreadable/tampered payloads and unknown job types fail without repeated delivery attempts. Fixing configuration or requesting a new email is necessary.
- SMTP failures throw sanitized errors so BullMQ can retry. No raw SMTP diagnostics, recipient addresses, tokens or reset links are written to application logs.

List failed jobs without exposing their payloads:

```bash
npm run notifications:failed
```

After fixing the underlying problem, requeue a specific retained failed job:

```bash
npm run notifications:retry -- JOB_ID
```

These commands use `.env` and the configured queue. They also boot the application worker. A retry resets the attempt counter. If its token is now expired/consumed, the processor skips delivery; request a new verification/reset email instead. Do not expose recovery commands as unauthenticated HTTP endpoints.

Deduplication is not exactly-once email delivery. If SMTP accepts a message and the worker crashes before acknowledging completion, a retry can send another copy. Rechecking tokens reduces stale sends but cannot atomically coordinate SMTP with a concurrent token consumption.

## Remaining durability gap

The events are in-process notifications, not a durable event log. The database transaction commits before an event is emitted. A crash between commit and enqueue, or an enqueue failure, can leave a token without an email job. Resend remains the current recovery path.

A transactional outbox is the planned next reliability step: write an encrypted notification/outbox record in the same PostgreSQL transaction, then relay it to BullMQ with a stable job ID. This refactor does not claim that gap is solved. Redis persistence configuration also affects queued-job survival.

## Verification

```bash
npm run build
npm run test:types
npm run lint
npm test
npm run test:e2e
npm run test:mailtrap
```

- Unit tests cover encryption, tamper rejection, template escaping, HTML/text bodies and SMTP failure handling.
- Auth API tests capture notifications at the enqueue boundary.
- Real Redis integration tests cover events/listeners, processing, encrypted payloads, duplicate events, delivery retries, exhausted jobs, manual retry and stale-token skipping. Only SMTP is replaced in these tests.
- The opt-in Mailtrap smoke test uses the real listener, Redis queue, processor, templates and SMTP. It completes verification/reset and checks login/session revocation. It cleans up its own temporary account and prints no raw tokens.
- CI has PostgreSQL and Redis services and never sends real emails.

SMTP acceptance confirms handoff to Mailtrap. Inspect your Sandbox inbox to assess email rendering and open its links while the application is running.
