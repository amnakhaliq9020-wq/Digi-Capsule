# Digi Capsule

Private digital legacy platform. This repository now contains the Phase 1 application plus the original planning roadmap in [docs/roadmap/README.md](docs/roadmap/README.md).

A missed check-in means the author has not confirmed they can still sign in. It does not send memories. Death-related delivery is implemented only as a development simulation and is forced off when `NODE_ENV=production`.

Phase 1 is one application. The landing page explains that. After sign-up, a person can add contacts with a name, email, and phone, save a letter or video as **Send on a date** or **If I am gone**, and press **I'm Alive**. The dashboard shows the last check-in, the next due time, and the memory and contact lists. Warning email and SMS wording is on the warning history page. Email is what the worker sends. SMS is not sent in this phase.

## What you need

- Node.js 22 or newer
- Docker Desktop, for PostgreSQL
- npm (workspaces are used so another machine does not need pnpm)

## First-time setup

From the repository root:

```bash
npm install
npm run init-env
docker compose up -d
npm run db:migrate
npm run db:seed
```

`npm run init-env` creates `.env` only when it is missing and generates a local `DATA_ENCRYPTION_KEY`. Do not commit `.env`.

The database user in Docker is `digi` / `digi` on `localhost:5432`, database `digi_capsule`. That password is for the local container only.

## Run the application

```bash
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Health: http://localhost:3001/v1/health

The browser talks to the API through a Next.js rewrite of `/v1/*`, so the session cookie stays on the web origin.

In another terminal:

```bash
npm run worker
```

The worker uses pg-boss and runs a tick every minute. During development you can also run one tick from the test console without waiting.

## Tests

PostgreSQL must be running.

```bash
npm test
```

API tests create `digi_capsule_test` on the same Postgres server and apply migrations there. Override the URL with `TEST_DATABASE_URL` if port 5432 is not the Docker database.

## Development test clock

`.env.example` sets `DIGI_TEST_MODE=true` for local development. The test console at http://localhost:3000/dev can move a simulated clock and run the worker. That route returns 404 when test mode is off, and test mode is ignored entirely when `NODE_ENV=production`.

`VERIFICATION_RELEASES_ENABLED` defaults to `false`. Even if it is set to `true`, content release from a review is refused in production.

Use synthetic addresses such as `person@example.test`. Do not load real family memories or contacts.

## Optional cloud storage

Leave `STORAGE_DRIVER=local` to store files under `apps/api/var/storage` (gitignored). Files are downloaded only through an authenticated API route. There is no permanent public URL.

To use S3, Cloudflare R2, or another S3-compatible service later, set:

```text
STORAGE_DRIVER=s3
S3_ENDPOINT=https://your-endpoint
S3_REGION=auto
S3_BUCKET=your-private-bucket
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=true
```

Block public access on the bucket. The API still checks ownership before streaming a file.

## Seed data

`npm run db:seed` checks the database and creates no people. Set `SEED_DEMO=true` to add `demo.author@example.test`. The password is `SEED_DEMO_PASSWORD` (default `Change-Me-Demo-1`). It is a fake account.

## More detail

- API reference: [docs/api.md](docs/api.md)
- Product roadmap: [docs/roadmap/README.md](docs/roadmap/README.md)
- If setup fails: [docs/troubleshooting.md](docs/troubleshooting.md)
