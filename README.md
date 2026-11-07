# Digi Capsule

Private digital legacy platform. This repository now contains the Phase 1 application plus the original planning roadmap in [docs/roadmap/README.md](docs/roadmap/README.md).

A missed check-in means the author has not confirmed they can still sign in. The three warnings do not include a memory. In local test mode, day 21 stores the assigned letter and file names in the test inbox for the selected recipients only. That copy is not sent by email or SMS. Death-related delivery stays off when `NODE_ENV=production`.

Phase 1 is one application. The landing page explains that. After sign-up, a person can add contacts with a name, email, and phone, save a letter or video as **Send on a date** or **If I am gone**, and press **I'm Alive**. The dashboard shows the last check-in, the next due time, and the memory and contact lists. Warning email wording and an SMS mock are recorded for the author. Photos are limited to 15 MB and videos to 100 MB. A larger file is rejected.

## Demo on this machine

Open http://localhost:3000 after `npm run dev`. There is no staging host in this workspace.

1. Sign up with an `@example.test` address and confirm the code shown on the verification screen.
2. Add two contacts, mark them as recipients, and verify each email with the development code.
3. Save a letter, attach a small photo or video, choose both contacts, and save a future date.
4. Open the test console, set the clock to that date, and run the worker once. The test inbox shows the letter and file names for those contacts only. Run the worker again and confirm it does not repeat.
5. Save a second memory as **If I am gone** for one of the contacts.
6. On the test console, choose **Jump to check-in due** and run the worker. Advance 7 days and run it for the second warning, then 7 days for the final warning. The warning text has no letter.
7. Advance 7 days once more and run the worker. The selected contact's inbox row contains that memory. Press **I'm Alive** before that last step on a fresh account and the memory stays unsent.
8. Do not point `npm run worker` at a database that already has due deliveries you want to keep.

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

The worker uses pg-boss and runs a tick every minute on real server time. The test console can still move a simulated clock and run one simulated tick. That simulated tick does not change the clock used by normal scheduling or by `npm run worker`.

## Tests

PostgreSQL must be running.

```bash
npm test
```

API tests create `digi_capsule_test` on the same Postgres server and apply migrations there. Override the URL with `TEST_DATABASE_URL` if port 5432 is not the Docker database.

## Development test clock

Normal scheduling, I'm Alive, and `npm run worker` use the server clock. `.env.example` sets `DIGI_TEST_MODE=true` so the test console at http://localhost:3000/dev can move a simulated clock for a rehearsal. That route returns 404 when test mode is off, and test mode is ignored entirely when `NODE_ENV=production`. The automated test suite is the only place where normal routes read the simulated clock, and those tests use an isolated database.

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
