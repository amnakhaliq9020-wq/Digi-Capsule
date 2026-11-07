# Digi Capsule Phase 1 — final QA report

Date: 6 November 2026  
Branch: `feature/zamin-core`  
HEAD: `5f694dd` — Merge pull request #1 from ApexArbiter/feature/zamin-core  
`origin/main` is contained in this commit. Nothing was pushed. `main` was not checked out.

Local work left uncommitted: the UI pass, the `db:migrate` line that also runs `db:generate`, the check-in fix, and `apps/api/src/test/phase1-sequence.test.ts`.

## Acceptance checklist

Isolated database for this pass: `digi_capsule_phase1_isolated`. Shared clock after the run: `2027-02-16 10:00:00+00`. No staging deploy. No real email or SMS.

| Requirement | Result |
|---|---|
| Setup instructions for another developer | PASS as documentation in `README.md`. Running them on a second machine was NOT TESTED. |
| Landing page | PASS. http://localhost:3000 loaded with the account and sign-in links. |
| Sign up and log in | PASS in the earlier live session and in `auth.test.ts` on this run. |
| Save two contacts and edit them | PASS in the earlier live session and `contacts.test.ts`. Remove is on the contacts page and covered by the API delete route. This pass did not click Remove in the browser. |
| Save and edit a letter | PASS in the earlier live session and `memories.test.ts`. |
| Attach and view a photo or video | PASS in API tests, including file names in the test delivery. The memory page shows the file and a download link. A browser file-picker upload was NOT TESTED. |
| One memory to more than one contact | PASS. `delivery.test.ts` delivered one letter, one PNG, and one MP4 to Avery and Blake, and not to the unselected contact. |
| Future send date | PASS in `delivery.test.ts` and the earlier live Karachi date. |
| Check-in delivery rule | PASS in test mode only. Day 21 stores the assigned memory for its recipients in the local test inbox. Production mode still sends no memory. The 30-day interval was not changed. |
| Home shows memories, contacts, and next check-in | PASS on the dashboard in the earlier browser session. |
| I'm Alive records a check-in and sends nothing | PASS. The press itself creates no memory delivery. A second press at the same instant returns HTTP 200. |
| Three warning messages | PASS. Email wording for day 0, day 7, and day 14. An SMS mock is stored to `sms-mock:` and is not sent to a phone. |
| Missed check-in can be demonstrated quickly | PASS in the API tests. The test console now has Jump to check-in due, Advance 7 days, and Advance 14 days. Those new buttons were not clicked in the browser. |
| Test contact receives the scheduled memory | PASS. The test inbox row for each selected recipient contains the letter and the photo and video names. |
| Test contact receives the memory after missed check-ins | PASS on the isolated database. The recipient row contains the letter and `secret-photo.png`. Warning rows and the trusted-contact notice do not. A second worker tick does not add another job. |
| I'm Alive before that delivery | PASS. A press on day 10 stops the later warnings and leaves the memory scheduled. |
| One staging link | NOT TESTED. No host, database URL, or deploy credential is available. The local demo link is http://localhost:3000. |
| Video larger than 100 MB | NOT TESTED. The application rejects videos over 100 MB and photos over 15 MB. The photo rejection was tested. |
| Playwright | NOT TESTED. The repository has no Playwright project. |
| Lint | NOT TESTED. No lint script exists. |

`npm test` with `TEST_DATABASE_URL` pointed at `digi_capsule_phase1_isolated`: 21 domain tests passed, 22 API tests passed. `tsc --noEmit` for `apps/api` and `apps/web` passed. This pass did not repeat the five viewport measurements. The stylesheet was not changed in this pass.

The follow-up run below used a new database, `digi_capsule_phase1_isolated`. The shared database `digi_capsule` was not reset. Its clock was read before and after that run and stayed `2027-02-16 10:00:00+00`. The worker was not pointed at the shared database.

## 1. Startup

| Check | Result |
|---|---|
| PostgreSQL container `digi-capsule-postgres-1` | Up, healthy, port 5432 |
| Database | `digi_capsule` on localhost. Migrations applied: `20261105120000_init`, `20261106140000_simulated_release_event`, `20261106180000_contact_phone` |
| Encryption key | Present, 32 bytes, not the placeholder. Value not recorded here. |
| `DIGI_TEST_MODE` | true |
| `VERIFICATION_RELEASES_ENABLED` | false |
| `STORAGE_DRIVER` | local |
| API | Already running. Log: `Digi Capsule API listening on 0.0.0.0:3001`. It reloaded after the check-in fix. |
| Web | Next.js 15.5.29 at http://localhost:3000 |
| `GET /v1/health` | `{"status":"ok","database":"up","testMode":true,"verificationReleasesEnabled":false}` |
| Web home | HTTP 200 |

No startup crash. npm prints `Unknown env config "devdir"`. Prisma prints a deprecation notice about `package.json#prisma`. Neither stops the app.

## 2. Feature results

Isolated account: `qa.1793986949392@example.test` (QA Author). A second account was used only to try to read the first account's data. Passwords and verification codes are not written here.

| Feature | Result | Evidence |
|---|---|---|
| Register | PASS | HTTP 201. Session cookie set. |
| Email confirmation | PASS | HTTP 200. Scheduling before confirmation returned `EMAIL_NOT_VERIFIED`. |
| Login | PASS | HTTP 200, then the dashboard showed “Signed in as QA Author”. |
| Wrong or unknown password | PASS | HTTP 401. The form shows “Email or password is incorrect.” |
| Logout | PASS | Next `/v1/auth/me` returned 401. |
| Protected route | PASS | `/v1/dashboard` without a cookie returned 401. |
| Session persistence | PASS | `/v1/auth/me` stayed 200 after login. The letter was still there after the API process reloaded. |
| Add contact, with phone | PASS | HTTP 201. Phone `+92 300…` saved and then edited. |
| Invalid contact | PASS | HTTP 400 `VALIDATION_ERROR`. |
| Duplicate contact email | PASS | HTTP 409 `CONTACT_EXISTS`. |
| Verify contact email | PASS | Dev code accepted. HTTP 200. |
| Empty memory title | PASS | HTTP 400 `VALIDATION_ERROR`. |
| Create and edit a letter | PASS | Edited text was returned again on GET. |
| Memory ownership | PASS | The other account received 404 for the letter and did not see it in the list. |
| PNG upload | PASS | HTTP 201. Owner download HTTP 200. |
| MP4 upload | PASS | HTTP 201. |
| Text file | PASS | HTTP 400 `UNSUPPORTED_FILE`. |
| Photo over 15 MB | PASS | HTTP 400 `FILE_TOO_LARGE`. |
| Other user reading the file | PASS | HTTP 404. |
| Past delivery date | PASS | HTTP 400. |
| Future delivery, Asia/Karachi, 15 March 2028 09:00 | PASS | Saved on the memory. Dashboard shows 3/15/2028, 9:00:00 AM and “Scheduled: 1”. |
| I'm Alive | PASS | HTTP 200. Message says the press did not send memories. Next due moved from `2026-12-06T17:42:29.548Z` to `2027-03-18T10:00:00.000Z` because the test clock is 16 February 2027. |
| Repeated I'm Alive at the same clock time | PASS after fix | First live attempt returned HTTP 500. After the fix, both presses returned HTTP 200. See bugs. |
| Delivery job list before the due time | PASS, with a caveat | `/v1/deliveries` is empty until a release job exists. The schedule itself is stored. The page copy already says future dates stay on the memory until they are due. |
| Live warning walk on the shared clock | NOT TESTED | Left untouched. An active calendar rule is already due at `2026-11-02 08:00:00+00`. A worker tick on that database would release it. |
| Warning sequence on `digi_capsule_phase1_isolated` | PASS | `phase1-sequence.test.ts`, executed in this follow-up. See section 7. |
| Scheduled delivery independent of missed check-in | PASS | Same file. A Karachi 09:00 calendar send did not start warnings. The later missed-check-in warning did not send the other memory. |

## 3. Saturday requirement versus the code

The current program does **not** use a Saturday schedule. That was not changed.

| Original Saturday-style expectation | What Phase 1 actually does |
|---|---|
| A weekly Saturday check-in | `CHECK_IN_INTERVAL_DAYS = 30` from the last confirmation, or from registration if the author has never pressed I'm Alive |
| Warnings tied to that weekly miss | Offsets of 0, 7, and 14 days after the due time |
| A later conditional step | 21 days after the due time, test mode records a simulated release and can notify trusted contacts. It does not send the memory. |
| Production death-related release | Forced off when `NODE_ENV=production`, even if the flag is set |

Registration uses the real clock. Check-in and the worker use the simulated clock while `DIGI_TEST_MODE=true`. That is why a new account's first due date was in December 2026 and the I'm Alive press, under the February 2027 test clock, moved the next due date to March 2027.

## 4. Backend and database

- Health, auth, contacts, memories, media, schedule, check-in, and the dev clock were called against the running API.
- Validation and the codes above match the API reference.
- Another user's memory and file return 404, not the private body.
- Duplicate contact and duplicate sign-in failures behave as specified. The rate-limit case is covered by `auth.test.ts` (eight failures, then 429). It was not repeated against the live server, to avoid locking the test account.
- Migrations on `digi_capsule`, `digi_capsule_test`, and `digi_capsule_phase1_isolated` are the same three: `20261105120000_init`, `20261106140000_simulated_release_event`, `20261106180000_contact_phone`. The isolated database was created empty and those three were applied there. `digi_capsule` was not migrated again and was not truncated.
- The letter remained after the API reloaded. Postgres was not restarted and was not wiped.
- API logs mask notification addresses (`qa***@example.test`). The 500 log contained the Prisma constraint name and did not contain the letter text.
- Test mode stores notices in `dev_messages`. No SMTP or SMS provider is configured. `verificationReleasesEnabled` stayed false.

## 5. Security

| Check | Result |
|---|---|
| No session on the dashboard API | 401 |
| Wrong password | 401, same message for an unknown email in the API test |
| Cross-account memory | 404 |
| Cross-account attachment | 404 |
| Unsupported upload | 400 |
| Oversized photo | 400 |
| Letter in a notification template | Not included. `memory_ready` says the message does not include the memory. Warning templates are fixed wording. |
| Real release during this run | Not triggered. The shared worker was not run. |

Cookie: `digi_session`, HTTP-only, 14 days, SameSite Lax.

## 6. Attachments

PNG and a small MP4 were stored through the authenticated upload route and the PNG was read back by the owner. A text file and a 15 MB + 1 byte PNG were rejected. A video larger than 100 MB was not uploaded in this run. The limit is enforced by the same size check as the photo limit, and the photo side of that check passed.

Files stay on local disk (`STORAGE_DRIVER=local`). There is no public object URL.

## 7. Warnings and conditional release

Command for this follow-up, from the repository root:

```bash
$env:TEST_DATABASE_URL = "postgresql://digi:digi@localhost:5432/digi_capsule_phase1_isolated"
npm test
```

Prisma reported the datasource as `digi_capsule_phase1_isolated` and applied the three migrations. Each test asserts `current_database()` is not `digi_capsule`. Notices were written to that database's `dev_messages` table. No SMTP or SMS provider was called.

| Check | Result |
|---|---|
| 1 ms before the due time: no warning, stage `on_time` | PASS |
| Exact due time: missed-check-in email to the author only | PASS |
| Day 3, and 1 ms before day 7: still one warning | PASS |
| Day 7: second warning. 1 ms before day 14: still two | PASS |
| Day 14: final warning. 1 ms before day 21: still three, no simulated release, no trusted-contact notice | PASS |
| Day 21: simulated conditional release plus one trusted-contact notice | PASS |
| Second worker tick at every one of those times, including day 21 | PASS. Reminder, simulated-release, calendar, and verification counts stayed unchanged. |
| Day 21 with `VERIFICATION_RELEASES_ENABLED=true`, and no verification case | PASS. `verificationJobsSent` was 0 and `release_jobs` stayed 0. A missed check-in does not release a memory. |
| Warning text is the fixed email wording for days 0, 7, and 14 | PASS |
| Inbox contains `PRIVATE_SEQUENCE_LETTER` or `secret-photo.png` | PASS as an absence. Neither string was stored. The photo remained on the memory. |
| SMS wording or a non-email notification row | PASS as an absence. SMS is not sent. |
| Author warnings go to the author. The trusted-contact notice goes only to the verified trusted contact | PASS. The memory recipient and a second recipient received neither. |
| I'm Alive on day 10, after the second warning and before day 21 | PASS. The open cycle became `confirmed`. The next due time is that instant plus 30 days. A later tick at the old day 21 sent no final warning, no trusted-contact notice, no simulated release, and no memory job. |
| I'm Alive stopping an open verification review before jobs are sent | PASS in `liveness.test.ts` on the same isolated run. |
| Content release only after quorum, 14-day cooling-off, 72-hour cancellation window, and the test flag | PASS in `liveness.test.ts`. With the flag off, no memory job is created. A second tick does not duplicate the jobs. The notice does not contain the letter. |
| Production mode with the flag set | PASS in `liveness.test.ts`. Simulated release count stayed 0 and no memory job was created. |
| Calendar delivery at 09:00 Asia/Karachi, which is 04:00 UTC | PASS. One minute earlier sent nothing. The exact instant sent one `memory_ready` notice to the selected recipient only. A second tick sent nothing. The "if I am gone" memory stayed `scheduled`. Its text was not in the inbox. The check-in warning at the later due time did not send another calendar job. |
| Shared-database worker and shared clock | NOT TESTED. Clock remained `2027-02-16 10:00:00+00`. |

The 30-day interval and the offsets 0, 7, 14, and 21 were not changed. Day 21 is the simulated record, not a fourth reminder.

## 8. UI and viewports

The visual system was not redesigned in this pass. Contrast ratios measured earlier on the running pages still apply to the same stylesheet: body text 7.25:1, primary button 7.71:1, headings 14.16:1, field border 5.50:1, warning heading 6.03:1. All of those meet WCAG AA for the text size involved.

This session:

- Login error is a coral banner and remains readable.
- Dashboard at the inspected width shows the new account, one scheduled memory, and the I'm Alive time.
- At 375×812 the dashboard has no horizontal scroll, and all eight navigation links are in the page.

Earlier in the same UI work, 390×844, 768×1024, 1366×768, and 1920×1080 were measured with no horizontal page scroll. Those styles have not changed since that measurement.

The red Next.js “1 Issue” badge is the in-app browser injecting `data-cursor-ref`. It is not an application hydration bug. It can cover a card in that browser.

There is no Playwright config, dependency, or `e2e` script in this repository. A browser suite was not added. The running web and API processes use `digi_capsule`, so a Playwright run against them would drive the shared database. That is NOT TESTED. There is no `lint` script. Earlier in this QA pass, `tsc --noEmit` for `apps/web` and `apps/api` completed with no errors. Those typechecks were not run again in this follow-up.

## 9. Automated tests

Follow-up command, with `TEST_DATABASE_URL` set to `digi_capsule_phase1_isolated`:

- `@digi/domain`: 21 passed
- `@digi/api`: 22 passed (the previous 19, plus the three sequence tests)

Executed result: 43 passed, 0 failed. The API log showed the isolated database name and applied its migrations during setup.

Earlier, before these three tests existed, the same command against `digi_capsule_test` was 21 domain and 19 API, all passed. Playwright: NOT TESTED. Lint: NOT TESTED, because no lint script exists.

## 10. Bug found and fixed

**Repeated I'm Alive returned HTTP 500.**

Root cause: check-in cycles are unique on `(user_id, due_at)`. The test clock does not move between two presses, so both presses compute the same next due time. The second insert hit `P2002` and the API returned 500. The same collision can happen in production if two presses fall in the same millisecond.

Fix, in `apps/api/src/services/account.ts`: if the open cycle is already due at the newly computed time, record the press, keep that due time, and return HTTP 200. The 30-day interval is unchanged. A regression test was added to `apps/api/src/test/liveness.test.ts`. `npm test` was run again and passed, and the live account's second press then returned 200.

No other product behavior was changed. The Saturday schedule was not introduced. This follow-up found no new product defect. The new file is `apps/api/src/test/phase1-sequence.test.ts`.

## 11. Remaining limits

Phase 1 is not fully verified. The safely testable critical flows that can run without the shared database did pass. These did not:

| Item | Result |
|---|---|
| Playwright end-to-end browser suite | NOT TESTED. The repository has no Playwright project. Adding one against the running app would use `digi_capsule`. |
| Worker tick on the shared database | NOT TESTED, on purpose. |
| Real email or SMS delivery | NOT TESTED. Test mode stores email notices locally. SMS text exists and is not sent. |
| Video larger than 100 MB | NOT TESTED. The photo limit was tested at 15 MB plus 1 byte. |
| Eight-failure login lockout on the live account | NOT TESTED live. PASS inside `auth.test.ts` on the isolated database. |
| Lint script | NOT TESTED. None is defined. |

Also unchanged from the earlier pass: the phone navigation is tall so every link stays visible, and the in-app browser's Next.js issue badge is an inspection artifact. Amna's commits `90481e9` and `3ade22a` are on `origin/feature/amna-ui` only. They are not on `origin/main`.

## Files changed in this completion pass

Not committed.

- `apps/api/src/services/worker-tick.ts` — test-mode memory copy and day-21 test delivery; SMS mock
- `apps/api/src/lib/notify.ts` — test inbox text includes the letter and file names; SMS wording
- `packages/domain/src/idempotency.ts` — test check-in job key
- `apps/api/src/test/delivery.test.ts`, `liveness.test.ts`, `phase1-sequence.test.ts`
- `apps/web` landing, warning, memory, test-console, and form copy; download link; demo clock buttons
- `README.md`, `docs/api.md`, `packages/shared/src/index.ts`
- Earlier uncommitted work remains: UI stylesheet, check-in fix in `account.ts`, Prisma `db:migrate` line

## 12. How to start it

From the repository root, on `feature/zamin-core`:

```bash
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

Web: http://localhost:3000  
API health: http://localhost:3001/v1/health

In another terminal, if the one-minute worker should run:

```bash
npm run worker
```

Tests, with Postgres already up:

```bash
npm test
```

`npm run db:migrate` applies migrations and regenerates the Prisma client. Do not commit `.env`.
