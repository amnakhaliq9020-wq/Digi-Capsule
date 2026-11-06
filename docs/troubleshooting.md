# Troubleshooting

## Docker says it cannot connect to the pipe

Docker Desktop is not running. Start Docker Desktop, wait until `docker info` succeeds, then run `docker compose up -d`.

## `DATA_ENCRYPTION_KEY must be 32 bytes`

Run `npm run init-env` from the repository root, or replace the placeholder with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Prisma cannot find `DATABASE_URL`

Run database commands from the repository root with `npm run db:migrate` and `npm run db:seed`. Those scripts load the root `.env`. The local URL is `postgresql://digi:digi@localhost:5432/digi_capsule`.

## Port 5432 is already in use

Stop the other Postgres service, or change `POSTGRES_PORT` in the environment before `docker compose up -d` and change the host port in `DATABASE_URL` to match.

## Port 3000 or 3001 is already in use

Stop the other process, or change `API_PORT` and `API_INTERNAL_URL` together. The web rewrite must point at the API.

## Tests fail to connect

Confirm `docker compose ps` shows Postgres healthy. Tests use `digi_capsule_test` on the same server. Set `TEST_DATABASE_URL` if your port or password differs.

## Uploaded files disappear after a reboot

Local files live in `apps/api/var/storage` because npm runs the API with that package as the working directory. The folder is gitignored on purpose. Point `LOCAL_STORAGE_DIR` at another path if you want a different location. Use an absolute path or a path relative to `apps/api`.

## The test console is missing

`/v1/dev/*` returns 404 unless `DIGI_TEST_MODE=true` and `NODE_ENV` is not `production`. Restart the API after changing `.env`.

## A memory was not delivered

Calendar delivery runs when the simulated or real clock reaches `next_run_at`. Run `npm run worker`, or use the test console button "Run worker". The author's email must be verified, and each recipient email must be verified. The notice does not contain the letter.

## "If I am gone" did not send during warnings

That is the intended safety behavior. The warning sequence is the missed check-in, a second warning 7 days later, and a final warning 7 days after that. Seven days later, test mode records a simulated conditional release and still does not send a memory. A review requires two verified verifiers, a 14-day wait, and a 72-hour cancellation window. Content jobs are created only when `VERIFICATION_RELEASES_ENABLED=true` in a non-production process. I'm Alive cancels an unsent review.
