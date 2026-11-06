# 08 — UI, UX, and user journeys

Status: proposed, 2026-11-03. Visual design is not specified here. The tone is quiet, plain, and respectful. Avoid urgency tricks, streak counters, and grief-marketing language.

## Design principles for the interface

- One primary action per screen.
- Say what will happen before a destructive or releasing action: who will be emailed, and what they will not receive.
- Never show a red "deceased" state. Use "we have not heard from you" and "release review."
- Recipients should be able to use the portal with one hand on a phone, large type, and captions where the author wrote them.
- Unreleased titles are not shown to recipients, contacts, or in email subjects.
- The author can preview the recipient screen before scheduling.
- Target WCAG 2.2 AA for the recipient portal and the check-in pages before public launch: contrast, focus, labels, keyboard path, and no information by color alone.

## Information architecture

Author navigation:

- Home (check-in status and capsules)
- Capsule detail
- People
- Activity
- Settings (profile, security, check-in interval, export, delete)

Recipient navigation:

- Timeline
- Item view
- Account (password, MFA optional)

Trusted contact navigation:

- A single review page reached from email. No archive tab.

Do not add a social feed, comments, or reactions in Phase 1. A recipient does not need to perform grief for the product.

## Key screens

| Screen | Actor | Purpose |
| --- | --- | --- |
| Sign up / sign in | Author, later recipient | Email, password, verification |
| MFA setup | Author | TOTP and recovery codes |
| Home | Author | Check-in banner, capsule list, paused state |
| Capsule | Author | Items, status chips: draft, scheduled, released |
| Item editor | Author | Title, letter, uploads, memory date, tags, category |
| People | Author | Recipients, trusted contacts, verifiers, verification badges |
| Schedule | Author | Trigger type, time zone confirmation, embargo explanation |
| Preview | Author | Read-only recipient view |
| Check-in settings | Author | Interval, channels, pause |
| Activity | Author | Notices, grant changes, job failures |
| Release review | Verifier | Open, attest, dispute. No media gallery |
| Timeline | Recipient | Released items only, chronological |
| Item viewer | Recipient | Text, image, video, audio, letter |
| Empty portal | Recipient | "Nothing has been shared with you yet." |

## Journey: create a capsule

1. Author verifies email and sets time zone. The app cannot schedule without a time zone.
2. They create a capsule and choose a title.
3. They write a letter or upload a file. The item stays `draft`.
4. They add at least one recipient and see the email address spelled back.
5. They pick a schedule and read a one-sentence summary: "On 12 April 2042, at 9:00 in America/New_York, Jordan will get an email that this item is ready. The email will not include the letter." The city is only an example of showing an IANA time zone in words.
6. Preview, then schedule. Status becomes `scheduled`.
7. They can return to draft by cancelling the rule before send.

If they leave mid-way, the draft remains private. No recipient email is sent until a job is actually due.

## Journey: eighteenth-birthday series

1. Author adds the child as a person with a birth date and marks that a guardian should receive access until a chosen age if early release exists. For a pure embargo at 18, the recipient is the person who will claim the portal then.
2. Author creates one item per birthday year, memory date set to that birthday, all drafts.
3. Author selects the items and applies one embargo: release when this person reaches age 18, at a chosen local time.
4. The UI lists each item and the single release date in words, not only as a cron expression.
5. Preview shows the timeline the recipient will get on that day.

A second, separate choice in the scheduler is "send each item on that birthday as it arrives." The two choices must not share one ambiguous button.

## Journey: monthly check-in

1. On the due day, email subject is neutral: "Please confirm you can still sign in to Digi Capsule."
2. Body explains that confirming only records that they are reachable. It does not send memories.
3. Button: "Confirm I'm reachable."
4. If ignored, reminders use the same explanation and add how many reminders remain before trusted contacts are told that the account is unreachable.
5. The last pre-contact reminder states the date contacts will be notified and names them.
6. Home banner repeats the same action for people who open the app instead.

Pause flow: author picks an until-date and a short reason for themselves (not sent to the family). The banner shows "Check-ins paused until {date}."

## Journey: trusted contact welfare notice

Email contains:

- The author's display name.
- "We could not confirm they are reachable. This does not mean they have died."
- What the contact can do: "I have reached them" (asks the author to confirm; does not by itself reset the author's check-in unless the author confirms), "Request a release review," or "Stop — I believe they are alive."
- A statement that the contact cannot read the capsule.

"Request a release review" opens a page with a confirmation step and the quorum explanation. One click from the email must not open a case.

## Journey: recipient receives a scheduled memory

1. Email: "{Author} shared a memory with you on Digi Capsule." No subject line that reveals the letter title if the title may be sensitive. **Assumption:** subject lines stay generic. The title appears after login. Confirm with Q-9 if authors want the title in the email.
2. Recipient sets a password or signs in.
3. Timeline shows the new item and older released items.
4. Viewer plays media inline where the browser can, with a transcript or caption if the author supplied one.
5. If nothing is released, the empty state does not hint at waiting drafts. An optional author setting may send "you are named in my capsule" without titles (decision Q-10, default off).

## Journey: false alarm

1. Author sees a review email during cooling-off.
2. They sign in.
3. A full-screen confirmation: "A release review is in progress. Signing in will stop it. Nothing will be sent."
4. They confirm. The case shows recovered. Verifiers are told the author is reachable and the review has stopped.
5. Check-ins resume.

This screen must be impossible to miss. Do not bury recovery under settings.

## Content and accessibility notes

- Write at a reading level a stressed, non-technical adult can follow. Avoid "liveness," "quorum," and "attestation" in the UI. Prefer "check-in," "number of people who must agree," and "statement."
- Internal docs can keep the technical words.
- Video needs visible play controls and a way to pause. Do not autoplay sound.
- Respect `prefers-reduced-motion`.
- Forms have explicit labels, not placeholder-only labels.
- Time zones are searched by city, then stored as IANA names.
- Dates show the month name, not only numbers, to avoid day/month confusion.

## Out of scope for the first UI

Native apps, themes beyond a calm default, collaborative editing, comments, maps, public memorial pages, and an avatar studio.
