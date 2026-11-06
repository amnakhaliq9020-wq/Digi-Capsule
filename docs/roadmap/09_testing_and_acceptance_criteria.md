# 09 — Testing and acceptance criteria

Status: proposed, 2026-11-03. Tests are part of each milestone's definition of done, not a later cleanup.

## Test layers

| Layer | Where | What |
| --- | --- | --- |
| Unit | `packages/domain` | Reducers, schedule math, `canView`, quorum |
| API integration | `apps/api` against PostgreSQL | Grants, idempotency, transactions |
| Worker | `apps/api` worker in test mode | Due jobs, retries, flag off |
| Browser | Playwright in `apps/web` | A short list of journeys, not every pixel |
| Security | Automated plus a written pass | IDOR, authz, headers, secret scan |
| Restore drill | Staging | Backup restoration |

Use fixtures and synthetic names. Do not load real family media into tests or fixtures.

## Domain unit tests

Check-in reducer:

- Due cycle plus confirmation becomes confirmed and schedules the next due time from the confirmation timestamp.
- Reminder offsets send once each.
- Pause suppresses reminders until the pause date.
- Missed cycle never returns an action of type `create_content_release`.

Verification reducer, table-driven for every event in [05_liveness_and_release_workflow.md](05_liveness_and_release_workflow.md):

- Timer or unreachable event does not open a case.
- One verifier opening creates `open` only when the feature is invoked explicitly.
- Quorum not met does not enter cooling-off.
- `reached_alive` and `dispute` block.
- Author authentication from `open`, `collecting`, `cooling_off`, `cancellation_window`, and `release_authorized` recovers and lists job ids to cancel.
- Author authentication does not unsend a job already `sent`.
- Second case while one is open is rejected.
- Withdrawn attestation drops the case back below quorum if cooling-off has not started; define and test the chosen rule if cooling-off already started (**implementation rule:** withdrawing after cooling-off starts moves to `disputed` rather than silently continuing).

`canView`:

- Author sees drafts.
- Recipient without grant denied.
- Recipient with grant and draft denied.
- Recipient with grant and released item allowed.
- Trusted contact denied.
- Other author denied.
- Revoked grant denied.
- Hidden visibility denied even if a job exists.

Schedule math, with frozen clocks:

- Exact time in a named time zone, including an author in `America/New_York` and a recipient birth date.
- Spring-forward gap and fall-back overlap.
- Age 18 embargo on a known birth date.
- 29 February annual rule.
- Reschedule cancels pending occurrence keys and creates a new key.

## API and database integration

- Unique idempotency key: two concurrent inserts produce one job.
- Cross-user media complete and download return 404 or 403 without revealing existence. Pick 404 for objects the caller does not own.
- Session required on author routes.
- Check-in token cannot call recipient-update routes (expect 403).
- Audit row written on grant create and on denied decrypt attempt if a decrypt is reached.
- Deleting an item cancels pending jobs and does not remove another item's shared asset if reference counts remain. MVP can forbid sharing one asset across items to make deletion simpler; if so, test that restriction.

Use Testcontainers or a CI Postgres service. Do not mock the uniqueness constraint; that constraint is the product behavior.

## Worker tests

- Calendar rule due: one notification intent, job `sent` when the fake provider accepts.
- Provider error: job `failed`, retry, then `dead`, no second row.
- `VERIFICATION_RELEASES_ENABLED=false`: case transitions may be stored in a unit test, but the worker does not create content jobs.
- Flag true and case not authorized: scanner creates zero content jobs.
- Flag true and window elapsed: jobs created once.

Fake `NotificationPort` records calls in memory.

## Security tests

- IDOR suite: user A cannot read user B's capsule, item, person, job, or signed URL.
- Rate limit kicks in on repeated failed logins (assert 429).
- Password reset token reuse fails.
- Security headers present on the portal.
- Letter body containing `<script>` renders as text in Playwright.
- CI secret scan (gitleaks or similar) on the repo.
- Bucket policy checklist reviewed: block public access. Automate with a policy test if the IaC tool supports it.
- Log snapshot test: a failed request fixture does not contain the letter fixture text.

A third-party penetration test is recommended before a public launch and is not a substitute for these tests. It is a milestone 6 budget decision.

## Browser journeys

Keep the automated set small and stable:

1. Sign up, verify email with a test mailbox, create a capsule, save a letter draft.
2. Attach a tiny fixture image via the presign flow against a local S3 emulator (MinIO or equivalent).
3. Add a recipient, schedule an exact time a minute ahead in a test clock, run the worker, open the portal as the recipient, see the letter, fail to see a second unscheduled draft.
4. Confirm a check-in from the banner.
5. Open the recovery screen and stop a fixture verification case. Assert the UI never says the person died.

## Delivery and scheduling acceptance

- Preview sends zero emails (assert on the fake provider).
- Duplicate worker ticks send one email.
- Bounce webhook marks the delivery bounced and does not open a verification case.
- Time-zone cases listed above pass in CI, not only on a developer laptop set to that zone. Run timezone tests in UTC containers.

## Recovery acceptance

- Staging restore drill documented: time started, backup id, time until login works, whether the object was readable.
- Deletion test: after cooling period in a shortened test config, object is gone from the bucket and ciphertext row is gone.
- Author sign-in during cancellation window cancels pending jobs in an integration test.

## Phase 2 acceptance (later)

Do not block MVP on these. When the prototype exists:

- Five grounded answers cite fixture item ids.
- Five unknown questions refuse.
- Restricted topic refuses.
- Synthetic label is present in the accessibility tree.
- Revocation calls the fake provider delete.

## Milestone exit gates

| Milestone | Gate before the next one |
| --- | --- |
| 0 | Decision log for D-1 through D-5 filled or explicitly deferred with consequences |
| 1 | Auth tests, upload tests, author cannot read another author's media |
| 2 | Grant tests and contact verification |
| 3 | Check-in reducer and "no content job on miss" test |
| 4 | Playwright journey 3 and DST unit tests |
| 5 | Full verification table tests and flag still default off in production config samples |
| 6 | Restore drill, deletion test, secret scan, bucket checklist |
| 7 | Phase 2 acceptance against fakes, no real biometric vendor until the decision record exists |
| 8 | Limited beta criteria written at that time, including how to stop the feature |

## Definition of a failing release

Any real content notification sent without a matching `sent` job that was either a due calendar rule or an authorized verification case is a severe defect. Roll back the worker, cancel pending jobs, and follow the incident note in the operations doc.
