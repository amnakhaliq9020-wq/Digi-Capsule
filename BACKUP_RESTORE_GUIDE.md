# Backup and restore

Backups are SQL dumps of `digi_capsule_staging` only. They are written under `var/backups/staging`, which is outside the database and ignored by Git. Production and development databases are not dump targets.

Each file is named `digi-capsule-staging-YYYYMMDDTHHMMSSZ.sql`. The backup script keeps the 14 newest files and deletes older files with that prefix. Change the count with `STAGING_BACKUP_RETENTION`.

The dump contains the schema, constraints, indexes, and the rows in that staging database. A normal staging backup contains only the fictional seed records unless someone has added more staging data. It must not be loaded with a copy of production.

## Create a backup

From the repository root, with `STAGING_DATABASE_URL` pointing at `digi_capsule_staging`:

```powershell
npm run staging:backup
```

Run this before a staging deploy or migration. To run it every day, call the same command from Task Scheduler. The script itself deletes staging dumps beyond the retention count.

## Restore one backup

Stop the staging API and worker first so they do not keep the database open.

```powershell
npm run staging:restore -- --confirm=STAGING --file=var\backups\staging\digi-capsule-staging-TIMESTAMP.sql
npm run staging:verify
```

`--confirm=STAGING` is required. The script still refuses to run unless the database name is exactly `digi_capsule_staging`. Restore drops and recreates that database, loads the dump, then runs `prisma migrate deploy` so a newer migration can follow the restored data.

## Check the restored database

`npm run staging:verify` requires all of these:

- `staging.author@example.test` exists
- a capsule item titled `Staging sample memory` exists
- the seed notification `staging-seed:notice:author` is `sent`

The restore script also checks that every memory still has a capsule and that public indexes exist.

## Failed migration

If `prisma migrate deploy` fails, the staging database may be unchanged because PostgreSQL rolls a failed statement back. If a migration left the staging database unusable, restore the backup taken in the step before the deploy. Do not run that restore against `digi_capsule`.
