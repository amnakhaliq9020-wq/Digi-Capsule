# Staging validation report

Executed on 12 November 2026 against the local staging stack. These results are from commands run in this workspace. Digi Capsule has no faculty, payroll, leave, or attendance data, so those records were not created.

## Environment

- Staging Postgres is container `digi-staging-postgres`, Compose project `digi-staging`, host port 5433, database `digi_capsule_staging`.
- Development Postgres is container `digi-capsule-postgres-1`, host port 5432, database `digi_capsule`.
- The staging API listened on port 3101 with `APP_ENV=staging` and `NODE_ENV=production`. Health reported `testMode` false and `verificationReleasesEnabled` false.
- `.env.staging` is gitignored and holds a generated encryption key. `.env.staging.example` has no real key.

The first staging Compose command used the development project name and recreated the development container. The development volume `digi-capsule_digi_capsule_pg` was not removed. The container was attached to that volume again. After the tests it still contains 29 users. The staging file now sets `name: digi-staging`.

## Recovery steps that were run

| Step | Result |
|---|---|
| Migrations on empty staging | 13 migrations applied |
| Seed, then seed again | 5 users, 1 sample memory, 1 notification |
| Backup | `var/backups/staging/digi-capsule-staging-20261112T144753Z.sql` (65,476 bytes) |
| Backup pointed at `digi_capsule` | Exited with a refusal. No dump of that database was written |
| API health | `status` ok, `database` up, `environment` staging |
| `docker restart digi-staging-postgres` | Health returned to `database` up |
| Failed `DROP TABLE users` | Rejected by foreign keys. User count stayed 5 |
| Transaction with `SELECT 1/0` | Rolled back. `staging.author@example.test` remained |
| Worker start, force-kill, start again | `worker.started` recorded twice, then one `worker.tick` |
| `DROP SCHEMA public CASCADE` on staging only | `users` no longer existed |
| Restore with `--confirm=STAGING` | 5 users, 0 orphan memories, 80 public indexes |
| `npm run staging:verify` | Author, sample memory, and seed notification present |
| Login with a wrong password | HTTP 401. Log event `auth.failure` with code `INVALID_CREDENTIALS` and a request ID |
| Postgres stopped, then started | Health returned 503 and `database.connection_failed`, then `database` up |
| Domain, API, and web tests | 25, 96, and 19 passed |

Development user count after these steps: 29. Staging user count: 5.

## Logs

`var/log/staging/app.log` and `var/log/staging/operations.log` contain the startup, worker, backup, restore, auth failure, and database failure events above. A search of those files found no seed password, submitted password, password hash, SMTP password, or encryption key. `app.log` rotates at 5 MB and keeps five older files. The log directory ACL was limited to the current Windows user.

The first API process logged `mailTransport` `smtp` because blank SMTP values in the shell did not replace the development environment file. No staging request sent mail. That process was stopped. Staging now applies `.env.staging` on top of the development file, and the replacement process logged `mailTransport` `console`.

## Commands

Restart staging:

```powershell
docker compose -f docker-compose.staging.yml up -d
docker restart digi-staging-postgres
```

Load `.env.staging` into the shell, then from the repository root:

```powershell
npx tsx apps/api/src/server.ts
npx tsx apps/api/src/worker.ts
```

Restore a selected backup:

```powershell
npm run staging:restore -- --confirm=STAGING --file=var\backups\staging\digi-capsule-staging-20261112T144753Z.sql
npm run staging:verify
```

## Unresolved

- Task Scheduler was not given a daily backup job. The backup command and 14-file retention are in place.
- Force-killing the API and worker did not exercise the SIGINT handler, so `api.stopping` was not written during this run. The handler is in `apps/api/src/server.ts`.
- The local database password in the staging example is a local default. Replace it before using a shared host.
- An accepted email still cannot be proven to have reached an inbox. Staging mail is left unconfigured.
