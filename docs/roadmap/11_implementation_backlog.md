# 11 — Implementation backlog

Status: proposed, 2026-11-03. Effort is **preliminary**. It is not a quote.

## How to read estimates

| Term | Meaning |
| --- | --- |
| Solo | One developer who already writes TypeScript, doing product, implementation, and tests |
| Team | Two developers, elapsed weeks, assuming the work can be split but review and the state machine stay shared. Not half of solo, because decisions and safety tests are sequential |
| Person-weeks | Engineering time, not calendar time with legal review |

Counsel review is an external dependency and is not included in the weeks except as a wait risk on milestones 5 and 6.

Nothing below authorizes building the whole product in one session. Implement one milestone when the product owner asks for it.

## Milestone 0 — Decisions and this roadmap

**Objectives:** Audit the repo, write the architecture, list unresolved decisions.

**Deliverables:** `docs/roadmap/*`, empty git repository, no application runtime.

**Dependencies:** None.

**Effort:** About 1 solo day for the documents (done in this task). Remaining decision time is the product owner's: **assumption** 2–5 days of calendar time to answer D-1 through D-5, longer if counsel is involved.

**Acceptance:** The five decisions are either answered in [12_risks_and_open_questions.md](12_risks_and_open_questions.md) or explicitly deferred with the consequence written down.

**Risk:** Starting Milestone 1 with an unknown launch country can force an auth and storage rewrite.

**Tests:** Not applicable.

**Definition of done:** Roadmap merged or accepted by the owner. No app scaffold required.

## Milestone 1 — Accounts, profiles, capsules, media

**Objectives:** An author can register, sign in, create a private capsule, write a letter, and upload a file that is not public.

**Dependencies:** M0 decisions D-2 (key custody) and D-3 (auth approach). D-1 can be provisional if the bucket region is easy to change before real users.

**Effort:** Solo 4–6 weeks. Team elapsed 3–4 weeks.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-101 | Scaffold pnpm workspace, `apps/web`, `apps/api`, `packages/domain`, `packages/db` | Typecheck runs in CI |
| DC-102 | Prisma models for users, profiles, sessions, capsules, items, media | Migration applies on empty Postgres |
| DC-103 | Register, verify email, login, logout, password reset | Reset token reuse fails. Sessions revoke on reset |
| DC-104 | TOTP MFA and recovery codes | Optional enrollment works. Codes are hashed |
| DC-105 | Profile time zone required | Schedule APIs are not built yet, but profile rejects missing time zone |
| DC-106 | Capsule and letter CRUD for the owner | Another user receives 404 |
| DC-107 | Presigned upload and complete, checksum stored | Private bucket. Local MinIO in dev |
| DC-108 | Envelope-encrypt letter bodies if D-2 stays platform-managed | Database row is not readable as plaintext |
| DC-109 | Author activity entries for login and item create | Metadata only |

**Major risks:** Auth library choice churn. Large-video uploads on mobile browsers. Key management harder than the CRUD.

**Tests before proceeding:** Identity integration tests, cross-user media denial, upload against an emulator.

**Definition of done:** A developer can create two users locally and prove user A cannot fetch user B's letter or object. README has local setup steps. No real email provider required; console or a local sink such as Mailpit is enough.

**File targets:** `apps/api/src/modules/identity`, `capsules`, `media`, `audit`; `packages/db/prisma/schema.prisma`; `apps/web` routes for auth and capsule editor.

## Milestone 2 — People and permissions

**Objectives:** Recipients and trusted contacts exist. Grants are explicit. Contacts can verify an email.

**Dependencies:** M1.

**Effort:** Solo 2–3 weeks. Team elapsed 1.5–2 weeks.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-201 | Person address book | Scoped to owner |
| DC-202 | Roles: recipient, trusted contact, verifier | Verifier is not a recipient by default |
| DC-203 | Item grants | `canView` unit tests from the testing doc pass |
| DC-204 | Email verification for a person | Unverified address cannot be used as a release destination |
| DC-205 | Audit grant and role changes | Author activity screen lists them |

**Major risks:** Mixing "contact" and "user" leads to IDOR if `linked_user_id` is set carelessly. Test claim flow in M4 before real invites send content.

**Tests:** Grant matrix.

**Definition of done:** An item with no grant is invisible to every non-owner. A trusted contact login, if they have an account, still cannot open the item.

## Milestone 3 — Check-ins and reminders

**Objectives:** Monthly confirmation, reminders, pause, delivery log. No death workflow yet.

**Dependencies:** M1. M2 needed only for the later unreachable notice, which can be a stub until contacts exist.

**Effort:** Solo 3–4 weeks. Team elapsed 2–3 weeks.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-301 | `packages/domain` check-in reducer | Miss path returns no content-release action |
| DC-302 | Policy defaults: 30 days, offsets 3/7/14/21 | Stored on the policy row |
| DC-303 | Worker sends due notices via `NotificationPort` | Idempotent per cycle and offset |
| DC-304 | Confirm by session and by single-use link | Link cannot edit people |
| DC-305 | Pause and resume | No reminders while paused |
| DC-306 | Delivery status on the activity page | Failed send visible, no case opened |

**Major risks:** Email deliverability. Clock bugs. Copy that sounds like a death notice.

**Tests:** Reducer table, worker idempotency, link authorization.

**Definition of done:** A missed test cycle produces reminders only. Database contains zero `release_jobs`.

## Milestone 4 — Schedules and recipient portal

**Objectives:** Calendar and age-based release, including an embargoed series. Recipient can view only what was sent.

**Dependencies:** M1, M2, notification port from M3.

**Effort:** Solo 4–6 weeks. Team elapsed 3–4 weeks.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-401 | Release rule model and next-occurrence function | DST and 29 February tests |
| DC-402 | Exact, annual, age, and embargo triggers | Eighteenth-birthday series covered by embargo |
| DC-403 | Worker creates jobs and sends generic emails | One email under duplicate ticks |
| DC-404 | Recipient invite and portal timeline | Draft titles absent |
| DC-405 | Signed media GET after `canView` | URL expires |
| DC-406 | Preview | Zero provider calls |
| DC-407 | Reschedule and cancel pending jobs | Sent jobs unchanged |

**Major risks:** Time zones. Accidentally attaching files to email. Recipient invite token too powerful.

**Tests:** Playwright journey in the testing doc, DST unit tests in UTC CI.

**Definition of done:** Fixture author schedules a letter one minute ahead, worker runs, recipient sees it, second draft stays hidden.

## Milestone 5 — Verification, disputes, release safety

**Objectives:** The death-related state machine exists behind a flag that defaults off. Author recovery works.

**Dependencies:** M2, M3, M4. Counsel review of copy and of whether certificates are in scope.

**Effort:** Solo 4–6 weeks. Team elapsed 3–4 weeks. Calendar wait for counsel can exceed this.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-501 | Verification reducer and case tables | Illegal edges throw |
| DC-502 | Verifier opens a case explicitly | Email button is not sufficient without a confirm screen |
| DC-503 | Quorum, cooling-off, cancellation window | Defaults 14 days and 72 hours, frozen on the case |
| DC-504 | Dispute and author recovery | Pending death-related jobs cancel |
| DC-505 | Worker creates content jobs only when flag on and state authorized | Flag false test |
| DC-506 | Unreachable welfare email | Copy review checklist signed |
| DC-507 | Minimum two verifiers before arming after-verification rules | UI explains the block |

**Major risks:** False confidence. Harassment via repeated cases. Partial send race. Legal duties if documents are collected. **Do not build document upload in this milestone unless D-7 says to.**

**Tests:** Full reducer table, flag test, recovery integration test.

**Definition of done:** With the flag off, production-like config cannot send a verification release. With the flag on in staging, the scripted false-alarm journey stops delivery.

## Milestone 6 — Launch readiness

**Objectives:** Backups, deletion, security pass, private beta checklist.

**Dependencies:** M1–M4 for a calendar-only beta. M5 before anyone enables the verification flag.

**Effort:** Solo 3–4 weeks. Team elapsed 2–3 weeks.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-601 | Export zip and account deletion | Object and ciphertext removed after the test cooling period |
| DC-602 | Staging restore drill | Written timing note |
| DC-603 | Secret scan, headers, log scrubber, bucket checklist | CI green |
| DC-604 | Rate limits on login and reset | 429 test |
| DC-605 | Production config guard: console mailer cannot boot | Boot test |
| DC-606 | Privacy notice links and non-will disclaimer in the UI | Copy present, counsel status recorded |
| DC-607 | Operator replay of a dead job | Same idempotency key |

**Major risks:** Backup that has never been restored. Beta users uploading data the notice does not cover.

**Tests:** Gates in the testing doc for milestone 6.

**Definition of done:** Private beta can start with verification flag off, a named human watching alerts, and a completed restore drill.

## Milestone 7 — Avatar research and a limited prototype

**Objectives:** Provider comparison with dated notes. Consent records. Text-only grounded reader behind a fake or a cheap text model. No face or voice until a separate go-ahead.

**Dependencies:** M6 deletion must work. Real user biometric data is out of scope until counsel answers the biometric question.

**Effort:** Solo 3–5 weeks for the text prototype and the decision memo. Voice and face evaluations are additional and should be paper comparisons first (1–2 weeks) without contracts.

**Stories:**

| ID | Story | Acceptance |
| --- | --- | --- |
| DC-701 | Consent purposes for voice, likeness, posthumous avatar | Defaults off, unused by the text prototype except an "archive Q&A" purpose |
| DC-702 | Opt-in knowledge sources per item | Recipient cannot query ungranted items |
| DC-703 | Reader port with a fake and one optional text provider | Refusal tests |
| DC-704 | Vendor memo: retention, region, deletion API, price quote date | No invented prices |
| DC-705 | Topic block list | Refusal test |

**Major risks:** Scope creep into a companion chatbot. Sending the whole archive to a vendor.

**Tests:** Phase 2 acceptance list, text only.

**Definition of done:** A fixture recipient gets cited answers and refusals. No voice or face API keys in production.

## Milestone 8 — Controlled avatar beta and advanced ideas

**Objectives:** Only if M7 is accepted: a tiny beta of voice **or** a decision to stop. Phase 3 features stay backlog ideas until prioritized.

**Dependencies:** M7, biometric legal review, a vendor deletion test in sandbox, funding for usage bills.

**Effort:** Not estimated. Re-estimate after quotes. Treat a voice beta as another multi-week project, and a face beta as a separate one after voice.

**Definition of done:** Written at the start of that project, including how to disable the feature in one config change.

**Phase 3 story stubs (unscheduled):** family archive permissions, collaborative collections, preservation export, paid storage tiers, additional languages, guardian accounts for minors, transcripts of original audio.

## Suggested implementation order inside a milestone

Schema and domain tests first, then API, then worker, then UI. UI-first work tends to hard-code a release rule that the reducer later contradicts.

## First coding session, when requested

Milestone 1 only, stories DC-101 through DC-109, with local Mailpit or console email and MinIO. Do not implement SMS, verification cases, or avatar providers in that session.
