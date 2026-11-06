# 01 — Product vision

Status: proposed, 2026-11-03. Market sizes, prices, and competitor feature lists are not claimed here. Items marked **Assumption** need a product decision.

## Vision

Digi Capsule is a private place for a person to keep the memories, letters, photographs, recordings, and practical words they want specific people to receive. Delivery can happen on a birthday, an anniversary, or another chosen date while the author is alive. Delivery after death happens only after a separate, explicit authorization process that can be stopped, disputed, and reversed until release is committed.

The product is a memory and delivery service. It is not a will, a death registry, a medical record system, or proof that someone has died.

## Problem

People postpone saying important things. Files sit on phones and disappear with a password. Families who want those words later often have no agreed, private way to receive them. Existing options tend to split into photo libraries (no release rules), shared drives (weak access control), or estate paperwork (not a storytelling experience).

A naive "if they do not log in, send everything" rule harms the living: illness, travel, a lost phone, or a changed number looks the same as death to a timer.

## Value proposition

- One private archive the author controls while they are alive.
- Scheduled delivery for moments that matter, without waiting for death.
- A slow, visible, cancellable path before any death-related release.
- A calm recipient experience that shows only what that person is allowed to see.
- Room to add an AI memory guide later, without rebuilding the archive or the permission model.

## Product principles

1. **Unreachable is not deceased.** Timers create welfare checks. People authorize release.
2. **The author can come back.** Until a delivery is committed, a successful owner sign-in stops death-related release.
3. **Least disclosure.** Recipients see released items addressed to them. Trusted contacts do not browse the archive by default. Staff do not get standing access to content.
4. **Safety is not a paid upgrade.** Check-ins, verification, audit, and deletion stay available on every tier. Storage, SMS, and extra capacity can be paid.
5. **Say what the system knows.** Synthetic speech and video are labeled. Missing archive facts are stated as missing. The product never presents a generated sentence as something the person definitely said.
6. **The archive outlives the interface.** Export and documented backups matter as much as new features.
7. **Phase 2 does not reshape Phase 1.** Avatar providers plug into consent and retrieval modules. They do not become the source of truth for memories.

## Target users

### Primary — the author

An adult creating capsules for a partner, child, grandchild, or close friend. They may be healthy and planning years ahead, or ill and trying to finish messages. They need drafts, privacy, and a process their family can understand.

### Primary — the recipient

Often not technical. They open a link or a simple portal on a phone, read a letter, and look at photos. They should not need to understand check-in policy to view something already released to them.

### Secondary — the trusted contact or verifier

Someone the author names to help if the author cannot be reached. Their job in the default design is to help contact the author and, only when they choose, to start or support a release review. They are not given the archive.

### Secondary — a guardian, when the recipient is a minor

**Open question.** If a message is released while the recipient is a child, a guardian account should hold access. Digi Capsule should not require a child to create an independent account in the MVP. See [12_risks_and_open_questions.md](12_risks_and_open_questions.md).

### Out of scope for the author role

Minors as capsule authors, clinicians managing patient records, and institutions managing many estates. Those need different consent and legal models.

## Personas

Names are illustrative, not real users.

### Amina, planning parent

Wants birthday letters for her child, recorded now and held until a date she chooses. She needs drafts, a preview of what the child will see, and confidence that a missed monthly check-in will not dump the archive.

### Daniel, partner

Wants a small set of videos and a letter released to his spouse only after a careful process, plus a separate anniversary note that sends on a calendar date while he is alive.

### Ruth, adult child and trusted contact

Does not want access to a parent's private drafts. She does want a clear notice if the parent stops confirming they are reachable, and a way to say "I spoke to them, postpone this" or "we need to begin a review."

### Sam, recipient

Receives an email that one memory is available. Sam can sign in, see a timeline of items released to Sam, and play a video. Sam cannot see items addressed to someone else.

## Core use cases

| ID | Use case | Phase |
| --- | --- | --- |
| UC-1 | Create an account, start a capsule, save a letter and a photo as a draft | 1 |
| UC-2 | Name a recipient and a trusted contact, and verify their email | 1 |
| UC-3 | Schedule a birthday or anniversary delivery while the author is alive | 1 |
| UC-4 | Hold a series of childhood messages until one future date | 1 |
| UC-5 | Confirm a monthly check-in from email or the app | 1 |
| UC-6 | Pause check-ins for travel or hospital stays | 1 |
| UC-7 | Recover from missed reminders without any release | 1 |
| UC-8 | Trusted contacts respond to an unreachable notice | 1 |
| UC-9 | A release review collects attestations, waits, and can be disputed | 1 |
| UC-10 | An authorized recipient views only released items on a phone | 1 |
| UC-11 | Export or delete the account and the media the author owns | 1 |
| UC-12 | Voluntarily train a labeled voice or face model from consented media | 2 |
| UC-13 | A recipient asks questions answered only from the approved archive | 2 |
| UC-14 | A family shares a collaborative archive or tree | 3 |

## The eighteenth-birthday example

The brief describes a parent recording messages for a child's first through seventeenth birthdays, kept private until the eighteenth birthday. The roadmap supports that as an **embargoed series**: many items, each labeled with the birthday it refers to, one release rule that delivers the authorized set when the recipient reaches a given age.

It also supports the other common pattern: **release on each birthday** as that date arrives, while the author is alive.

Which pattern a given capsule uses is chosen by the author in the scheduler. It is not inferred. Confirm in product copy so families do not expect year-by-year delivery when they configured a single embargo. See open question Q-7.

## What Phase 1 deliberately is not

- No automatic release when a timer expires.
- No claim of legal proof of death.
- No voice cloning, face clones, or conversational agent.
- No public gallery or social network.
- No native mobile apps. The recipient experience is a responsive web portal, installable later as a PWA if desired.
- No family tree, shared editing, or multi-author capsules.
- No positioning as a testament, funeral plan, or financial-account transfer tool.

## Competitive research tasks

Do this before pricing or marketing claims. Record sources and dates. Do not copy competitor text into the product.

Research categories, then specific products the reviewer can still reach:

- Digital legacy and "messages after death" services.
- Ethical wills and memory-letter products (for example products in the Storyworth category).
- End-of-life planning and estate-document products (planning tools, not memorials).
- Memorial voice or avatar experiments.
- Generic alternatives: cloud drives, phone photo albums, email scheduled send, sealed letters with a lawyer.

For each live product, record only observed facts: audience, what triggers delivery, whether a human confirms death, storage limits, pricing page as published that day, deletion policy, and whether AI output is labeled. Pricing and features change. This roadmap does not freeze any competitor claim.

## Success metrics

Define these in analytics only after a privacy review. Prefer aggregate counts. Do not build a surveillance dashboard of family grief.

| Metric | Why it matters | Early target |
| --- | --- | --- |
| Check-in completion within the grace period | The liveness loop works | **Assumption:** track baseline in private beta; do not invent a target rate yet |
| Share of missed check-ins that recover with no release | False alarms stay safe | 100% of timer-only misses must have zero releases. This is a safety invariant, not a KPI to trade off |
| Scheduled job success after retries | Birthdays actually send | **Assumption:** design goal 99.9% of jobs reach a terminal success or a visible failed state within 24 hours; measure before promising |
| Capsule completion | Authors finish at least one scheduled item | Learn in beta |
| Recipient open rate of release notices | Delivery is usable | Learn in beta |
| Time-to-cancel after a false verification | Recovery works | Author sign-in before commit always cancels undelivered death-related jobs |
| Support contacts that allege a wrongful release | Trust failure | Page humans on any such report |
| Export and delete success | Data rights work | Test in staging every release; track production failures |

Vanity sign-up counts are secondary to wrongful-release incidents and failed backups.

## Commercial sketch

**Assumption, not validated pricing.**

- Every account includes the safety workflow.
- Paid tiers sell storage, number of capsules or video minutes, SMS, and extra recipients.
- AI replicas, if they ever ship, are a separate add-on with their own consent, priced from real provider invoices.
- Exact prices wait for vendor quotes and research notes. See [10_deployment_and_operations.md](10_deployment_and_operations.md).

## Launch posture

Start with a private beta in one country (**launch country is decision D-1**). Ship calendar deliveries before enabling death-related release for real users. Counsel reviews the verification copy and the non-will disclaimer before that switch is turned on.
