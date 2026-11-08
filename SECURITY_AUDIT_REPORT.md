# Security audit report

Date: 7 November 2026  
Scope: the Phase 1 application on `feature/zamin-core`, reviewed in source and with non-destructive tests.  
No passwords, keys, or session tokens are written here. `.env` is gitignored and is not in the checkpoint commit.

## Result

No critical issue was left open in the tested local build. Two high issues in the test console were reproduced by a new test and fixed. The application is **not** completely secure, and it is **not** production-hardened. Test mode is on for this demo.

## Findings

| ID | Severity | Status | Finding |
|---|---|---|---|
| S-1 | HIGH | FIXED | `GET /v1/dev/inbox` returned every `dev_messages` row. A second account could read another author's verification code and the decrypted letter stored for a test delivery. |
| S-2 | HIGH | FIXED | `POST /v1/dev/worker/tick` ran the simulated worker for every user. One signed-in person could release another account's due memory. |
| S-3 | MEDIUM | FIXED | Uploads trusted the browser's content type. HTML labeled `image/png`, and arbitrary bytes labeled `video/mp4`, were stored and later served with that type. `X-Content-Type-Options: nosniff` was already set. The route now checks the file signature. |
| S-4 | MEDIUM | OPEN | `npm audit --omit=dev` reports 5 issues (4 high, 1 moderate) in Prisma's `deepmerge-ts` and in Next.js's PostCSS. The suggested fix installs Prisma 7 and Next.js 16. That was not applied on demo day. |
| S-5 | MEDIUM | OPEN | Photos and videos are not encrypted. Letter bodies are AES-256-GCM. Titles, names, emails, phones, and schedules are ordinary columns. One 32-byte key encrypts every letter. There is no key service and no rotation. |
| S-6 | LOW | OPEN | Registering an existing email returns 409 `EMAIL_IN_USE`. Login uses the same message for an unknown email and a wrong password. |
| S-7 | LOW | OPEN | Login verifies Argon2id only when the email exists, so timing can differ. Not changed today. |
| S-8 | LOW | OPEN | Helmet is on, but content security policy is disabled so the Next.js dev server can run. |
| S-9 | LOW | OPEN | State-changing requests with an `Origin` other than `WEB_ORIGIN` are rejected. A request with no `Origin` is allowed. The session cookie is `SameSite=Lax` and HTTP-only, so a cross-site form post does not include it. |
| S-10 | INFO | ACCEPTED FOR THIS DEMO | `DIGI_TEST_MODE` is true, so `/dev` exists and verification codes are returned to the browser. Both are ignored when `NODE_ENV=production`. Production was not booted in this audit. |

## What passed

| Check | Result | Evidence |
|---|---|---|
| Unauthenticated dashboard, memories, and dev clock | PASS | Live API returned 401 for each, with no cookie |
| Another user reading a memory or file | PASS | `memories.test.ts` expects 404 for the letter and the file |
| Another user reading the test inbox or releasing a memory | PASS after fix | `dev-isolation.test.ts` |
| Password storage | PASS | `auth.test.ts` expects an `$argon2id$` hash and rejects a wrong password. Parameters are memory 19456 KiB, time 2, parallelism 1 |
| Session | PASS | 32-byte token, only SHA-256 stored, cookie HTTP-only, 14 days, Secure in production. Logout revokes the hash. A revoked cookie gets 401 |
| Login brute force | PASS | Eight failures, then 429, in `auth.test.ts`. A global limit of 300 requests per minute is also registered |
| Email and contact codes | PASS | Only SHA-256 is stored. Comparison uses `timingSafeEqual` for equal lengths. A code for another user, a used code, or an expired code is rejected |
| SQL injection | PASS as a review | Application queries go through Prisma. The health check uses a tagged `SELECT 1`. No NoSQL database is used. `$executeRawUnsafe` appears only in the test reset helper, with a fixed statement |
| XSS | PASS as a review | Pages render text through React. No `dangerouslySetInnerHTML`. The test inbox prints `variables.text` as text |
| File type and size | PASS | Text is rejected. A disguised PNG is rejected. Photos over 15 MB are rejected in the existing suite. A video over 100 MB was not uploaded |
| Download | PASS | Owner-only, `Cache-Control: private, no-store`, nosniff, no public URL |
| Secrets in git | PASS | `git ls-files` does not list `.env`. The checkpoint did not add it |
| Review release in production | PASS | `isVerificationReleaseEnabled()` is false when `NODE_ENV=production`, even if the flag is set. Covered by `auth.test.ts` |
| Request logs | PASS as a review | Password, letter body, cookie, token, and code are redacted |

## Password reset

**NOT IMPLEMENTED.** No forgot-password route, token, or page exists. The roadmap item DC-103 is not in this build. It was not added during this audit.

## Fixes, with cause and regression tests

**S-1.** `dev_messages` has no owner column, and the route listed the table. The route now keeps rows whose destination is the signed-in email, `sms-mock:` plus that email, or a contact email that person owns. `dev-isolation.test.ts` shows the second account does not receive `ISOLATED_LETTER_PHRASE` or the first account's verification code, and the owner does receive the letter.

**S-2.** The tick handler called `runWorkerTick` for the whole database. The test-console call now passes `ownerUserId`. The minute worker does not, so real server-time delivery is unchanged. The same test shows the other account's tick sends 0 calendar jobs and the owner's tick sends 1.

**S-3.** `media.ts` compared the multipart type with the allow list and did not read the bytes. JPEG, PNG, GIF, WebP, WebM, and MP4/QuickTime (`ftyp`) signatures are required. `memories.test.ts` uploads `<html>not a png</html>` as `image/png` and expects `UNSUPPORTED_FILE`. Existing PNG and MP4 fixtures were updated to real signatures so the older tests still pass.

## Not done

Playwright was not run against the shared database. A manual screen reader was not used. The production process was not started. `npm audit fix --force` was not run.
