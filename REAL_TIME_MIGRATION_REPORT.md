# Real-time migration

Normal scheduling, I'm Alive, warning decisions, and the automatic worker now use the API server's clock. The simulated clock remains only for the developer test console and for the automated test suite. No database rows were rewritten, and the database was not reset.

## What changed

- `currentInstant` returns `new Date()` for the running application and for production. It reads `dev_clock` only when `NODE_ENV=test` and `DIGI_TEST_MODE=true`, which is the isolated Vitest database.
- Memory dates are accepted only when the UTC instant is later than that server time. The memory form no longer shows or moves the test clock. It shows the server time in the selected IANA zone.
- I'm Alive stores the server timestamp and sets the next deadline 30 days later. The interval was not changed.
- `npm run worker` calls `runWorkerTick` without the simulated flag, so it uses server time. The test-console **Run worker** button passes `{ simulated: true }` and is the only rehearsal path.
- `POST /v1/dev/clock` still exists, still requires test mode, and still returns 404 when test mode is off. Production ignores test mode.
- Account time zone is detected in the browser at sign-up and can be changed at **Time zone** (`PATCH /v1/auth/me`). Dates on the dashboard, check-in, deliveries, memory, and warning screens use that zone. Instants stay in UTC. The local date, local time, and zone are still stored on the release rule.
- Daylight-saving conversion was already in `exactInstant`: a spring-forward gap moves one hour later, and a fall-back overlap uses the first offset. The new API test schedules 14 March 2027 02:30 America/New_York and expects that same UTC instant.

## Migration safety

No migration was added. `dev_clock` is still the console's clock and is not consulted by normal routes. Existing `next_run_at`, `next_due_at`, and delivery rows were left exactly as stored. A UTC instant created while the simulated clock was ahead was not moved to "now".

Reviewed on 7 November 2026 against `digi_capsule` after the code change. Nothing in this list was updated.

| Record | Stored UTC | Why it needs a human decision |
| --- | --- | --- |
| Zamin, memory "introduction" | 2027-02-17 10:27 UTC (15:27 Asia/Karachi) | Active exact-time rule. It will send when real time reaches that instant. It was saved while simulated time could be ahead of the wall clock. |
| Zamin, open check-in | due 2026-12-06 19:20:35 UTC | This matches the simulated clock at the moment it was set to "now", plus 30 days. It is still in the future, so it was left in place. |
| Zamin, separate account display name "zamin" | due 2026-12-05 11:26 UTC, state `missed_unreachable` | State was reached under the old simulated clock. The due instant is still in the future relative to 6 November 2026, and the real-time worker did not send a reminder. |
| QA Author check-in | due 2027-03-18 10:00 UTC | Confirmed while the clock was in February 2027. Left unchanged. |
| Phase One Author, Recover Author | due dates in 2027 | Same. Fixture or rehearsal rows. |
| E2E Author, "Dead path" | 2026-11-02 08:00 UTC, rule still active | Already due. The real-time worker's first tick sent 0 jobs, matching the earlier simulated ticks. |
| Several fixture authors | `missed_unreachable` with December 2026 due dates | States came from simulated runs. Not rewritten. |

The first automatic tick after the restart used server time `2026-11-06T19:39:24.354Z` and sent nothing: `calendarJobsSent 0`, `remindersSent 0`, `simulatedReleasesRecorded 0`.

## Tests

| Suite | Result |
| --- | --- |
| Domain | 21 passed |
| API, isolated database `digi_capsule_phase1_isolated` | 26 passed, including the new real-time tests |
| Web | 8 passed |
| API typecheck | passed |
| Web typecheck | passed |

The new API tests, with `NODE_ENV=development` and the simulated clock parked in 2099, show:

- health reports `schedulingClock: "server"` and a server time within 5 seconds of `Date.now()`
- a past Karachi date is rejected and the message does not mention 2099
- a future Karachi date is stored as the matching UTC instant
- the New York spring-forward gap is stored with the domain conversion
- I'm Alive sets the next deadline about 30 days from the real press, and the warning stage stays on time
- a server-time worker tick sends no reminder while the simulated clock is past the deadline
- a simulated tick can still rehearse that reminder, and a second simulated tick does not repeat it
- the account time zone can be changed to Asia/Karachi
- the developer clock route still returns the simulated instant

Existing Phase 1 delivery, duplicate-tick, and missed-check-in tests still pass because the test suite is the one caller that reads the simulated clock from normal routes, and those tests truncate the isolated database.

## Not production-ready yet

This process is local development. `DIGI_TEST_MODE` is still true, so the test console and the local test inbox remain available. `NODE_ENV` is not `production`. The automatic worker is a local `npm run worker` process, not a hosted production worker. A simulated tick from the test console still runs against whatever database that API is using, so rehearsing on `digi_capsule` can still change rows. Production must run with test mode off, which removes the console and forces server time. That production configuration was not deployed or observed here.
