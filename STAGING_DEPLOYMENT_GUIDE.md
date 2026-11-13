# Staging deployment

Staging uses its own Postgres container, database name, port, storage directory, and environment file. It does not use the development database `digi_capsule` or the automated-test database `digi_capsule_test`.

Digi Capsule has no faculty, payroll, leave, or attendance module. Staging accounts are an author, a recipient, a trusted contact, a verifier, and an administrator.

## One-time setup

From the repository root:

```powershell
docker compose -f docker-compose.staging.yml up -d
Copy-Item .env.staging.example .env.staging
```

`docker-compose.staging.yml` sets the Compose project name to `digi-staging`. Keep that name. Running the staging file inside the development Compose project recreates the development database container. The development data volume is a different volume, `digi_capsule_pg`.

Replace `DATA_ENCRYPTION_KEY` in `.env.staging` with a new 32-byte base64 value. Do not copy the development or production key. `.env.staging` is ignored by Git.

Load it in the current PowerShell window:

```powershell
Get-Content .env.staging | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1].Trim())" -Value $Matches[2] }
}
npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
npm run staging:seed
```

## Start and restart

The staging API listens on port 3101. Run it from `apps/api` after the variables above are loaded:

```powershell
npx tsx src/server.ts
```

Stop it with Ctrl+C. The process closes the HTTP server and disconnects from the database.

Restart Postgres without removing its volume:

```powershell
docker restart digi-staging-postgres
```

The API health check is `http://127.0.0.1:3101/v1/health`. It reports `environment` as `staging` and `database` as `up` after Postgres accepts connections again.

Private files belong in `var/staging-storage`. That directory is outside Git and remains on disk when the API process restarts.

## Deploy a new build

1. `npm run staging:backup`
2. `npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`
3. Restart the API and the worker: `npx tsx src/worker.ts` from `apps/api`

The worker uses pg-boss on the staging database. One schedule is stored in that database, and a waiting job is taken by one worker. Do not point a second worker at another database and expect it to share the lock.

## Rollback

Stop the API and worker, then restore the backup taken before the deploy. The command is in `BACKUP_RESTORE_GUIDE.md`. Restart the previous application build after the restore completes.

## Isolation checks

Staging scripts exit before they run if the database name is not `digi_capsule_staging`. `APP_ENV=staging` makes the API refuse any other database name. `APP_ENV=production` refuses `digi_capsule_staging` and `digi_capsule_test`.
