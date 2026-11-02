# Continuous integration

GitHub Actions runs `.github/workflows/ci.yml` on pushes and pull requests:

1. Start a disposable PostgreSQL 17 service and wait for readiness.
2. Set up Node 24 and install dependencies from the committed lockfile with `npm ci`.
3. Build the application and run unit tests.
4. Apply compiled migrations to `url_shortener_test`.
5. Run API tests against that database.

Any failed step fails the job. Commit `package-lock.json` alongside dependency changes.
The service credentials in the workflow are temporary test credentials, not deployment secrets.

## Local equivalent

Copy `.env.test.example` to `.env.test` and configure your local test credentials.
The database must be named `url_shortener_test`. Test setup and test migrations enforce
that name to help prevent accidentally targeting development data. This is a guard,
not a substitute for separate database credentials and permissions.

```bash
npm run build
npm test
NODE_ENV=test npm run migration:run
npm run test:e2e
```

API tests use `.env.test` or an explicitly supplied DATABASE_URL, never an implicit
fallback to `.env`. Existing environment variables take precedence over files.
Unit schema tests do not need PostgreSQL.

This sets up CI only. Deployment automation will be added after choosing a hosting
target. No production migrations or deployment happen in this workflow.
Once the workflow has run on GitHub, configure the `test` job as a required branch
protection check if desired; adding the workflow alone does not enforce merge rules.

As database tests grow, add explicit fixture cleanup and isolation. The CI database
is fresh per job, but tests within a job still share it.
