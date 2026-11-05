# Digi Capsule

Digi Capsule is a private place to keep personal memories for yourself and the people you love. Memories stay as drafts until you decide what happens next. Saving a memory does not send it to anyone or schedule a release.

## What you can do

- Create an account and sign in.
- Create capsules, then add memories inside them.
- Write a personal letter, or upload a photo, video, audio file, or document.
- Save a memory as a draft, edit it later, or delete it after confirmation.
- Save up to two recipient contacts. Recipients cannot open your private memories.

## Requirements

- Node.js 20 or newer
- npm

The development database is a local PostgreSQL instance started by the project. You do not need to install PostgreSQL separately.

## Run the app

```bash
npm install
npm run dev
```

- Web app: http://127.0.0.1:3000
- API: http://127.0.0.1:3001

Create an account from the home page, then use **+ Create Memory**.

Copy `apps/api/.env.example` to `apps/api/.env` if you want to change the database URL or session secret. `npm run dev` supplies the local database URL when you start it from the project root.

## Tests

```bash
npm test
```

This starts the local database, runs the API tests, and runs the browser tests.

## Project layout

- `apps/web` — Next.js interface
- `apps/api` — NestJS API, Prisma models, and private file storage
- `scripts` — local database and development commands

Uploaded files are stored privately on disk. They are not published as public URLs.

## File limits

These defaults can be changed with environment variables:

| Kind | Default | Setting |
| --- | --- | --- |
| Photo (JPG, JPEG, PNG) | 10 MB | `MEDIA_PHOTO_MAX_BYTES` |
| Video (MP4, MOV, WEBM) | 100 MB | `MEDIA_VIDEO_MAX_BYTES` |
| Audio (MP3, WAV, M4A, OGG, WEBM) | 25 MB | `MEDIA_AUDIO_MAX_BYTES` |
| Document (PDF, DOC, DOCX, TXT) | 20 MB | `MEDIA_DOCUMENT_MAX_BYTES` |
