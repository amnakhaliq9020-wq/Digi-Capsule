# 12 — Risks and open questions

Status: proposed, 2026-11-03. Decisions marked **D-** block or shape implementation. Questions marked **Q-** should be answered before the milestone that needs them, and they are not silent defaults.

## The five decisions to make before building

### D-1. Launch country and who may sign up

**Why it is first:** Storage region, email and SMS vendors, privacy notice, child-recipient rules, and whether a death certificate is appropriate all depend on it. The workspace timezone is UTC+5; that is not a market decision.

**Options:** One country for the private beta with signups restricted there; or a country plus an explicit ban on other regions until notices exist.

**Consequence of deferring:** Milestone 1 can still scaffold, but real user data should not be collected.

### D-2. Key custody

**Recommendation in the architecture doc:** platform-managed envelope encryption so the service can deliver memories after the author is gone, with decrypt events audited.

**Alternative:** user-held keys, which improve confidentiality and make unattended delivery and password recovery much more likely to destroy the archive.

**Consequence of deferring:** Letter storage schema and the honesty of the marketing claim ("we can deliver this if you cannot log in") both change.

### D-3. Identity hosting

**Recommendation:** self-hosted sessions in PostgreSQL (Better Auth or Auth.js) so identity is not a separate vendor.

**Alternative:** a hosted identity provider, if speed matters more than residency and a later migration.

**Consequence of deferring:** Milestone 1 account stories should not start.

### D-4. Beta safety rails and MFA rule

Confirm or replace these **assumptions:** 2 GB storage, 250 MB video, 5 capsules, 20 recipients, email-only check-ins, MFA required only before arming death-related release (not before the first draft).

**Consequence of deferring:** Use the assumptions above and write them in the beta invite so they are visible.

### D-5. Deletion cooling period and backup retention

**Assumptions:** 14 days from delete request to hard delete; backups and object versions about 35 days, whatever the host actually offers.

**Consequence of deferring:** Do not accept real deletion requests from users. Counsel may require different periods.

## Further product decisions

| ID | Question | Lean in this roadmap | Needed by |
| --- | --- | --- | --- |
| D-6 | How minors receive memories | No child accounts in the MVP. Guardian receives until an age the author sets, if early release exists. An embargo at 18 avoids a child login | M4 if any beta user needs it; otherwise hold |
| D-7 | Verification strictness | Two verifiers, quorum 2, 14-day cooling-off, 72-hour final window, no staff approval, no certificate upload | M5 |
| D-8 | Transcripts of original recordings | Optional late Phase 1, not an avatar | After M4 if users need it |
| D-9 | Paid tiers | Safety features free. Charge later for storage, SMS, extra capacity. Prices unset | Before public billing, not before beta |

## Open questions

| ID | Question | Notes |
| --- | --- | --- |
| Q-7 | For the sample parent, is the desired behavior a single release at age 18, or a message on every birthday until then? | The scheduler supports both. The brief's wording matches the embargo. Confirm before writing the empty-state copy |
| Q-8 | After an item is delivered, can the author revoke the recipient's access? | Proposal: account deletion removes future access; a sent email cannot be unsent. Per-item revoke after send is unspecified |
| Q-9 | May the email subject include the item title? | Proposal: no, titles can be intimate |
| Q-10 | Should recipients be told they are named before any release? | Proposal: off by default |
| Q-11 | Are avatar conversation transcripts stored? | Proposal: no full transcripts by default |
| Q-12 | May a minor use a Phase 2 replica of a parent? | Default lean: no, until a specific design and legal review |
| Q-13 | Is Digi Capsule willing to employ reviewers who look at documents about a death? | Lean: no in the MVP. This is an operational and ethical burden |
| Q-14 | What happens to capsules if the company shuts down? | Need an export story and a successor plan before public marketing. Unresolved |
| Q-15 | Which languages ship first? | Proposal: one language, the launch market's primary language, plus English if that is different, only when copy can be maintained |
| Q-16 | Are shared or household logins allowed? | Proposal: no. Sharing passwords breaks audit and recovery |

## Risk register

| Risk | Area | Likelihood if ignored | Mitigation |
| --- | --- | --- | --- |
| Wrongful release from a timer or bug | Product, technical | High harm, even if rare | Invariants, flag, tests, no admin release tool |
| False verification while the author is ill or traveling | Product, ethical | Medium | Pause, long windows, recovery sign-in, plain copy |
| Family abuse or coercion of verifiers | Ethical, safety | Medium | Quorum, revoke, dispute, no single-contact release |
| Account takeover changes recipients | Security | Medium | MFA for sensitive changes, notify contacts, audit |
| Insider or backup disclosure | Security | Low to medium | Envelope encryption, IAM, no content admin |
| Object storage egress bill from video | Business | Medium once families share videos | Caps, private links, measure before pricing |
| AI cost and harm before product fit | Business, ethical | High if Phase 2 starts early | Text prototype first, no GPU, separate consent |
| Impersonation via cloned voice | Ethical, legal | High if voice ships casually | Author-only enrollment, labels, deletion, counsel |
| Users treat the product as a will | Legal | Medium | Disclaimer, no asset-transfer features |
| Children's data mishandled | Legal, ethical | Medium | D-6, no child marketing |
| Email lands in spam and check-ins "fail" | Operational | High | Authenticated domain, activity log, do not treat bounce as death |
| Solo-developer bus factor | Operational | High | Export, documented architecture, simple topology |
| Scope includes Phase 2 and 3 in the first build | Product | High | Milestones and feature flags |
| DST bug releases a day early | Technical | Medium | Zone tests in CI |
| Duplicate emails on retry | Technical | Medium | Idempotency keys |
| Company cannot restore backups | Operational | Medium until drilled | Milestone 6 drill |
| Provider retention of voice samples | Privacy | High in Phase 2 | Vendor memo before any contract |
| Harassment through repeated "release reviews" | Product | Medium | Cooldown after recovery |
| Partial send during recovery race | Technical | Low if window exists, severe if it happens | Cancel unsent jobs, incident path for sent ones |

## Legal and compliance risks

Summarized from the security doc. The product must not claim it can prove death, guarantee posthumous delivery, or replace an estate lawyer. Biometric laws can apply as soon as a real voice sample is uploaded to a cloning vendor, including in a "small test." Use synthetic audio for engineering tests.

Data-protection duties start when the first real person is invited, not at public launch. Keep the beta on synthetic data until D-1 and the notice exist.

## Business risks

- The sensitive use case means a single wrongful release can end the product. Reliability and restraint are the strategy.
- Storage of video for decades is a cost and a company-survival problem (Q-14). Price only after measuring.
- Competitor claims must be researched with dates, not assumed from memory. Task list is in the vision doc.
- A free tier with unlimited video will dominate costs. The beta caps exist to prevent that.

## Technical risks specific to the empty repo

There is no legacy code to preserve and no stack constraint. The risk is overbuilding: microservices, native apps, and avatar infrastructure before one letter can be scheduled. The modular monolith is the constraint that prevents a rewrite when Phase 2 arrives.

## Decision log

Record answers here when they exist. Do not delete the question.

| ID | Decision | Date | Notes |
| --- | --- | --- | --- |
| D-1 | Unresolved | | |
| D-2 | Unresolved. Roadmap recommends platform-managed envelope encryption | | |
| D-3 | Unresolved. Roadmap recommends self-hosted sessions | | |
| D-4 | Unresolved. Temporary assumptions listed above | | |
| D-5 | Unresolved. Temporary assumptions listed above | | |
| D-6 | Unresolved | | |
| D-7 | Unresolved. Temporary workflow defaults in the liveness doc | | |
| D-8 | Unresolved | | |
| D-9 | Unresolved | | |
