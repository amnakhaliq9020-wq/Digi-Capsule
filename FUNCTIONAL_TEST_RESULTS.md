# Functional test results

Date: 7 November 2026  
Database for automated tests: `digi_capsule_test` (created by the API test setup, not the shared demo database).  
Shared database `digi_capsule` was not reset, migrated, or truncated.

## Suite results

| When | Domain | API | Web | Failed |
|---|---|---|---|---|
| Before audit edits | 21 PASS | 26 PASS | 8 PASS | 0 |
| After fixes | 21 PASS | 28 PASS | 9 PASS | 0 |

Command: `npm test` from the repository root, with Docker Postgres healthy on port 5432.

## Feature results

| Feature | Result | Evidence |
|---|---|---|
| Registration and password rules | PASS | `auth.test.ts`. Live sign-up form loaded and showed Asia/Karachi. A new account was not created on the shared database in this pass |
| Email confirmation | PASS | API tests. Confirming does not send a memory. The code is shown only in test mode |
| Login, logout, session | PASS | `auth.test.ts`. After logout, `/v1/auth/me` is 401 |
| Wrong or unknown password | PASS | Same message, HTTP 401 |
| Login lockout | PASS | Eight failures, then 429 |
| Password reset | NOT IMPLEMENTED | No route or page. Not a failed test of an existing screen |
| Time zone setting | PASS | `real-time.test.ts` changes the account zone. The Time zone page is the account setting that exists |
| Change display name | NOT IMPLEMENTED | Name is set at registration only |
| Add, edit, verify, and remove contacts | PASS | `contacts.test.ts` and contact routes scoped by `ownerUserId` |
| Save and edit a letter | PASS | `memories.test.ts`. Body is encrypted before it is stored |
| Another account reading the letter | PASS | HTTP 404 |
| Photo and video upload, owner download, removal | PASS | PNG and an `ftyp` MP4. Owner download matches the PNG bytes |
| Disguised file | PASS | HTML named as PNG is rejected |
| Text file and oversized photo | PASS | Existing memories tests |
| Video larger than 100 MB | NOT TESTED | The limit is the same size check. The file was not uploaded |
| One memory to more than one contact | PASS | `delivery.test.ts` sends to Avery and Blake, not the unselected contact |
| Future date, including Karachi and New York spring-forward | PASS | `real-time.test.ts` and domain schedule tests |
| Date in the past | PASS | HTTP 400. The message uses the clock the server is actually using |
| 29 February 2027 | PASS | New memories test. HTTP 400, message asks for a valid date |
| 29 February on a yearly rule in a non-leap year | PASS | Domain test expects 28 February |
| DST overlap | PASS | Domain test: 1 November 2026 01:30 America/New_York is the first offset |
| 30-day check-in | PASS | Domain test: 1 January 2026 plus 30 days is 31 January 2026 00:00 UTC. The interval is 30 times 24 hours, not a calendar month |
| I'm Alive, including a second press at the same instant | PASS | `liveness.test.ts`. The press itself sends no memory |
| Warnings at day 0, 7, and 14, and day 21 test copy | PASS | `phase1-sequence.test.ts`. Warning text does not contain the letter |
| I'm Alive before day 21 | PASS | Later tick sends no memory |
| Scheduled send independent of check-in | PASS | `phase1-sequence.test.ts` |
| Second worker tick does not duplicate | PASS | Delivery and sequence tests |
| Test inbox isolation | PASS | `dev-isolation.test.ts` |
| Dashboard, deliveries, and dev copy | PASS as unit text | `waitingDeliveryNote` no longer tells the presenter to use the test clock for a server-time date |
| Live landing, sign-in, and sign-up pages | PASS | HTTP 200 and the three screenshots in `docs/demo-audit/` |
| Live signed-in click-through on `digi_capsule` | NOT TESTED | Left untouched so the demo data stays as it is. API tests cover the same actions on `digi_capsule_test` |
| Real email and SMS | NOT TESTED | No provider is configured. Test mode stores rows locally |
| Playwright in this session | NOT TESTED | The existing `apps/web/e2e/a11y.spec.ts` would create an account on the shared database. The 6 November accessibility report records an earlier pass |
| Lint | NOT TESTED | No lint script |
| Production process | NOT TESTED | Not started |

## Dates

Normal scheduling, I'm Alive, and `npm run worker` use `new Date()` unless `NODE_ENV=test`. Health on the running demo process reported `schedulingClock: server` and a timestamp within the audit window. The simulated clock remains on `/dev` and inside the test suite.

Fixed dates such as `2026-11-05` on the consent policy version, and dates inside tests, are not shown as the current time on the dashboard.

## UI

| Check | Result |
|---|---|
| Landing, sign-in, sign-up render | PASS. Screenshots saved |
| Labels on those forms | PASS. Email, password, name, and time zone are labeled |
| Error role on sign-in | PASS as source review. A failed sign-in sets `role="alert"`. Not clicked on the shared server |
| Contrast and keyboard from 6 November | Historical PASS in `UI_ACCESSIBILITY_AUDIT.md`. Stylesheet tokens were not changed in this audit. Not remeasured with axe today |
| Screen reader | NOT TESTED |
| 200% zoom | NOT TESTED this session |
| Phone, tablet, and desktop overflow | Historical PASS at 375, 390, 768, 1366, and 1920. Not remeasured today |
| Empty and loading states | PASS as source review. Deliveries and the dashboard now show a load error instead of a false empty list |
| Missing logo | PASS. The landing screenshot shows the logo |

## Console and server

The dev server started cleanly: API listening on port 3001, Next.js 15.5.29 ready on port 3000, `GET /` 200. No request exception was printed during the health check or the three public screenshots. npm prints `Unknown env config "devdir"`. Prisma prints a deprecation notice for `package.json#prisma`. Neither stops the app.
