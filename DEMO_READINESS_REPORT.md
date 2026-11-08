# Demo readiness report

Date: 7 November 2026  
Branch: `feature/zamin-core`  
Checkpoint before edits: `d30f7dc` (local only, not pushed)  
The audit fixes after that commit are uncommitted.

## Assessment

**Ready for the local demo, with limits.** The automated suite passed after the fixes below. The API is up on port 3001 and the web app is up on port 3000. Health returned `status: ok`, `database: up`, `schedulingClock: server`, `testMode: true`, and `verificationReleasesEnabled: false`. Server time was the real clock (`2026-11-07T08:39:20.600Z`).

This is not a production sign-off. Test mode is on, so the test console and local inbox exist. No mail or SMS provider is connected. No staging host was deployed. Dependency advisories were not upgraded because the offered fixes jump to Prisma 7 and Next.js 16.

## What the demo can show

1. Open http://localhost:3000. The landing page loaded with the account and sign-in actions. Screenshot: `docs/demo-audit/landing.png`.
2. Create an account with an `@example.test` address. The sign-up form detected Asia/Karachi on this computer. Screenshot: `docs/demo-audit/signup.png`.
3. Confirm the code shown on the verification screen. Sign out and sign back in. Screenshot of the empty sign-in form: `docs/demo-audit/login.png`.
4. Add contacts, verify them, save a letter, attach a real photo or video, and save a future date. The date is checked against server time, shown in the chosen zone.
5. For a date that has already passed on the server clock, leave the automatic worker running (`npm run worker`). The deliveries page now says that the automatic worker sends it, and that the test console clock does not.
6. For the missed-check-in rehearsal, use the test console. That clock is separate. **Run worker** there acts only on the signed-in account. Warnings do not include the letter. Day 21 stores the letter in the local test inbox for the selected recipients.

Do not point a simulated tick at a story you want left untouched, and do not load real family memories.

## Tests

| Suite | Before any audit edit | After the fixes |
|---|---|---|
| Domain | 21 passed | 21 passed |
| API, database `digi_capsule_test` | 26 passed | 28 passed |
| Web | 8 passed | 9 passed |
| Total | 55 passed, 0 failed | 58 passed, 0 failed |

The two new API tests cover cross-account inbox and worker isolation, a disguised PNG, and 29 February 2027. The new web test covers the deliveries wording.

Live read-only checks against the running API, with no cookie and no new account:

| Request | Result |
|---|---|
| `GET /v1/health` | PASS. 200, server clock, test mode on, review release off |
| `GET /v1/dashboard` | PASS. 401 |
| `GET /v1/memories` | PASS. 401 |
| `GET /v1/dev/clock` | PASS. 401 |

Signed-in browser clicks were not repeated on the shared database `digi_capsule`, so the demo rows already there were left alone. Those journeys passed in the API suite on `digi_capsule_test`.

## Bugs fixed before the demo

| Severity | Problem | Result |
|---|---|---|
| HIGH | Any signed-in user could read every test-inbox row, including another account's letter and verification code | Inbox is limited to that user and their contacts |
| HIGH | Test-console **Run worker** processed every account in the database | A simulated tick is limited to the signed-in account. `npm run worker` is unchanged and still uses server time for the whole database |
| HIGH | A passed server date told the presenter to run the test-console worker | The page now says the automatic worker sends it, and the test console does not |
| MEDIUM | A file labeled PNG or MP4 was stored even when the bytes were HTML or plain text | The upload is rejected unless the bytes match the declared type |
| MEDIUM | Dashboard and deliveries hid a failed load and could look empty | The error is shown |

## Do not claim these in the demo

- Password reset. There is no reset route. It exists only in the roadmap.
- A real email or SMS arriving on a phone.
- Production delivery of a letter. Production mode does not write the test-inbox copy.
- More than one capsule per account. Sign-up creates one capsule.
- That the app is fully secure. See `SECURITY_AUDIT_REPORT.md` and `REMAINING_ISSUES.md`.

## Screenshots from this run

- `docs/demo-audit/landing.png`
- `docs/demo-audit/login.png`
- `docs/demo-audit/signup.png`

Earlier signed-in screenshots, from the 6 November accessibility pass, remain in `apps/web/a11y-screenshots/`. They were not recaptured today, because signing in through the browser would write to the shared demo database.
