# Disaster recovery

This plan covers the local staging stack. It does not copy or repair the production database.

## Restart the API

From `apps/api`, with staging variables loaded:

```powershell
npx tsx src/server.ts
```

Confirm `GET http://127.0.0.1:3101/v1/health` returns `status` `ok` and `environment` `staging`.

## Restart the database

```powershell
docker restart digi-staging-postgres
```

Wait until `docker exec digi-staging-postgres pg_isready -U digi_staging -d digi_capsule_staging` says it is accepting connections, then call the health URL again.

## Lost or corrupted staging data

1. Stop the API and worker.
2. Choose the newest good file in `var/backups/staging`.
3. Run the restore command in `BACKUP_RESTORE_GUIDE.md`.
4. Run `npm run staging:verify`.
5. Start the API again.

If no backup exists, run `npx prisma migrate deploy` against `digi_capsule_staging` and then `npm run staging:seed`. That recreates fictional accounts only. It does not recover memories created after the last seed.

## Failed deploy

Stop the new processes. Restore the backup created immediately before `prisma migrate deploy`. Start the previous build. Do not point `DATABASE_URL` at `digi_capsule` while doing this.

## Failed worker

Start `npx tsx src/worker.ts` again from `apps/api`. pg-boss keeps the schedule in the staging database, so a crashed worker does not mark a job sent unless the provider had already accepted it. A second worker on the same staging database competes for each job instead of running a second copy of the schedule.

## Staging accounts

These accounts exist only after the staging seed. They are fictional. The shared password is `Staging-Only-1` unless `STAGING_SEED_PASSWORD` overrides it. Set `ADMIN_EMAILS` to `staging.admin@example.test` for the administrator.

| Email | Role in Digi Capsule |
|---|---|
| staging.author@example.test | Memory author |
| staging.recipient@example.test | Recipient |
| staging.trusted@example.test | Trusted contact |
| staging.verifier@example.test | Verifier |
| staging.admin@example.test | Administrator allow-list |

There are no faculty, HOD, HR, finance, attendance, payroll, or leave records in this application. The seed creates a sample memory, those contact roles, a check-in schedule, and one notification row instead.
