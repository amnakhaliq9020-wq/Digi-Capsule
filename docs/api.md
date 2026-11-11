# Digi Capsule API

Base path: `/v1`. JSON unless a route streams a file.

The browser calls these paths on the Next.js origin. Next.js proxies them to the Fastify API. Direct calls to the API must send the `digi_session` cookie.

## Error shape

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Enter a valid email address.", "details": {} } }
```

| HTTP | Code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Zod field validation failed. `details.fieldErrors` lists fields. |
| 400 | `UNSUPPORTED_FILE` | Upload is not a supported photo or video. |
| 400 | `FILE_TOO_LARGE` | Photo over 15 MB or video over 100 MB by default. |
| 400 | `INVALID_TOKEN` | Email, contact, or password-reset token is wrong, used, or expired. |
| 400 | `UPLOAD_LIMIT` | The account reached its file count or total upload size. |
| 400 | `RECIPIENT_NOT_VERIFIED` | A selected recipient email is not verified. |
| 400 | `VERIFIER_NOT_READY` | Review fixture was opened without a verified verifier. |
| 401 | `UNAUTHORIZED` | Missing or expired session. |
| 401 | `INVALID_CREDENTIALS` | Email or password is incorrect. The same message is used for an unknown email. |
| 403 | `FORBIDDEN` | Origin is not allowed, or the contact cannot act on a review. |
| 403 | `EMAIL_NOT_VERIFIED` | Scheduling requires a verified author email. |
| 404 | `NOT_FOUND` | Missing record, or a record owned by someone else. Also used for dev routes when test mode is off. |
| 409 | `EMAIL_IN_USE` | Registration email already exists. |
| 409 | `CONTACT_EXISTS` | This author already saved that email. |
| 409 | `ALREADY_DELIVERED` | Edit, cancel, or delete after a sent delivery. |
| 409 | `CASE_OPEN` | A release review is already open. |
| 429 | `RATE_LIMITED` | Eight failed sign-ins for that email in 15 minutes, or the global API limit. |
| 500 | `INTERNAL` | Unexpected failure. The response does not include the letter text. |

## Health

`GET /v1/health` — no session.

Response: `{ "status": "ok", "database": "up", "testMode": true, "verificationReleasesEnabled": false }`

## Authentication

| Method | Path | Session | Body |
| --- | --- | --- | --- |
| POST | `/v1/auth/register` | no | `{ displayName, email, password, timeZone }` |
| POST | `/v1/auth/login` | no | `{ email, password }` |
| POST | `/v1/auth/logout` | cookie | none |
| GET | `/v1/auth/me` | yes | none |
| POST | `/v1/auth/verify-email` | optional | `{ token }` |
| POST | `/v1/auth/verify-email/resend` | yes | none |
| POST | `/v1/auth/password` | yes | `{ currentPassword, newPassword }` |
| POST | `/v1/auth/forgot-password` | no | `{ email }` |
| POST | `/v1/auth/reset-password` | no | `{ token, password }` |

Passwords must be 10–200 characters and include a letter and a number. They are stored as Argon2id hashes.

`forgot-password` returns the same message for a known and an unknown email. It does not return the reset token. In test mode the link is stored in `dev_messages`. Resetting the password revokes every session for that account.

`verify-email` accepts the single-use code without a session, so the link can be opened directly. A signed-in session can only confirm its own code. Resend is limited to three verification messages in 15 minutes, including the one from registration. Previous unused codes are invalidated.

Register and login set an HTTP-only `digi_session` cookie (`SameSite=Lax`, `Secure` in production, 14 days).

In test mode, register includes `devVerificationToken`. Production responses omit it.

## Memories

All memory routes require a session and are limited to the signed-in author.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/memories` | List the author's memories. |
| GET | `/v1/received` | Memories released to the signed-in account. A recipient sees one only after a sent delivery and an active grant. |
| POST | `/v1/memories` | Create a draft. Body: `{ title, body? }`. |
| GET | `/v1/memories/:id` | One memory, including the decrypted letter for the owner. |
| PATCH | `/v1/memories/:id` | Update title and/or letter before delivery. |
| POST | `/v1/memories/:id/schedule` | Save recipients and a delivery option. |
| POST | `/v1/memories/:id/cancel` | Return a not-yet-sent memory to draft. |
| DELETE | `/v1/memories/:id` | Cancel an unreleased memory and delete its files. |

Schedule body:

```json
{
  "mode": "on_date",
  "localDate": "2026-12-01",
  "localTime": "09:00",
  "timeZone": "Asia/Karachi",
  "recipientIds": ["uuid"]
}
```

`mode` is `on_date` or `if_i_am_gone`. Date and time are required only for `on_date`, and the instant must be in the future relative to the real clock, or the simulated clock in test mode.

A memory response includes `status`, `deliveryMode`, `recipients`, `attachments`, `schedule`, and `delivery` counts. The letter is encrypted at rest with AES-256-GCM.

## Files

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/memories/:id/attachments` | Multipart field `file`. |
| DELETE | `/v1/memories/:id/attachments/:assetId` | Remove a file before release. |
| GET | `/v1/media/:assetId/content` | Stream the file to its owner. `Cache-Control: private, no-store`. |
| POST | `/v1/media/:assetId/signed-url` | Issue a short-lived URL for a file the signed-in owner already owns. |
| GET | `/v1/media/signed/:token` | Stream that file until the token expires. No session cookie. The token is stored only as a hash. |

Allowed types are checked from the file signature, not the extension: JPEG, PNG, WEBP, GIF, MP4, WEBM, MOV. Documents are rejected. Another user's file returns 404. Defaults are 15 MB for a photo, 100 MB for a video, 100 files per account, and 1 GB of active uploads per account. `MAX_PHOTO_BYTES`, `MAX_VIDEO_BYTES`, `MAX_UPLOADS_PER_USER`, and `MAX_UPLOAD_BYTES_PER_USER` override those limits. A failed write is marked `failed` and is not left as a public object.

## Contacts

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/contacts` | Address book. |
| POST | `/v1/contacts` | `{ displayName, email, phone, relationship?, roles? }`. `phone` is required. Roles: `recipient`, `trusted_contact`, `verifier`. |
| PATCH | `/v1/contacts/:id` | Change name, email, phone, relationship, or roles. Changing the email clears verification. |
| DELETE | `/v1/contacts/:id` | Remove a contact who has not already been sent a memory. |
| POST | `/v1/contacts/:id/verification` | Send a verification code. Test mode returns `devCode`. |
| POST | `/v1/contacts/:id/verify` | `{ code }` marks the contact's email verified. |

## Check-in

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/check-in` | Last check-in, next due time, confirmation deadline, account status, escalation status, and current-cycle history. Stages: `on_time`, `overdue`, `missed_check_in` (due day), `second_warning` (7 days), `final_warning` (14 days), `confirmation_window_final` (day 23), `simulated_conditional_release` (test mode, 21 days), `unreachable_notice`. |
| POST | `/v1/check-in` | Record "I'm Alive". Resets the 30-day cycle, clears the confirmation window, and cancels a pending escalation. Stops an open review and cancels unsent review jobs. Does not create a memory delivery. |
| POST | `/v1/check-in/confirm` | `{ token }` from the single-use email link. No session required. Expired and used links are rejected. Rate limited. |
| POST | `/v1/check-in/pause` | Pause check-in warnings for 30 days. Does not release memories. |
| POST | `/v1/check-in/resume` | Resume check-in warnings. |

A successful check-in increments the warning generation and cancels pending, processing, and failed check-in emails and SMS for that account. A worker re-reads the generation immediately before provider submission and discards a message from an older generation. Live SMS is sent only when Twilio credentials are set, the phone is E.164, the SMS channel is on, and `sms_check_in` consent is active. Test mode still records an SMS mock and does not call Twilio.

The worker checks due accounts every minute and also has a persistent daily job at 03:00 UTC. Both call the same idempotent check. A missed check-in emails the account, opens a further 30-day confirmation window, reminds at 7 and 14 days, and sends a final warning 7 days before the window ends. When that window ends, the account is marked for escalation review. That mark does not release memories.

## Dashboard and deliveries

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/dashboard` | Counts, next scheduled delivery, check-in summary. |
| GET | `/v1/deliveries` | Per-recipient job rows and statuses. |

## Development-only routes

These return 404 unless `DIGI_TEST_MODE=true` and the process is not production. They require a session. They cannot be enabled by a browser request when the server is in production.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/dev/clock` | Simulated time and release-flag state. |
| POST | `/v1/dev/clock` | `{ simulatedNow }` and/or `{ advanceDays, advanceMinutes }`. |
| POST | `/v1/dev/worker/tick` | Run calendar delivery, the warning sequence, a test-only simulated release record, and, only if the release flag is on, review delivery. The simulated record does not create a memory job. |
| GET | `/v1/dev/inbox` | Messages captured by the development notification adapter. |
| POST | `/v1/dev/verification/cases` | `{ verifierPersonId }` opens a test review. |
| POST | `/v1/dev/verification/cases/:id/attestations` | `{ personId, position, note? }`. One `believe_deceased` statement does not start the waiting period. Two are required. |

Outside the test suite, every application email is sent as `Digi Capsule <hello@izzyai.com>` with that same reply-to address. The recipient is the account, trusted contact, or the address an administrator types for a test. The sender address is never the default recipient. Test mode keeps the local console inbox. `GET` and `PUT /v1/settings/smtp` are limited to addresses in `ADMIN_EMAILS` and never return the SMTP password.

Notification templates are `email_verification`, `password_reset`, `password_changed`, `contact_verification`, `check_in_due`, `check_in_reminder`, `check_in_window_final`, `check_in_escalation`, `trusted_contact_unreachable`, `simulated_conditional_release`, and `memory_ready`. In test mode, `memory_ready` stores the letter and file names in the local test inbox for the selected recipient. Warning templates never include the letter. `simulated_conditional_release` is written only when test mode is on. The same tick can store the assigned "If I am gone" memory for its recipients; a second tick does not repeat it. The three warnings have email and SMS wording in `@digi/shared`. Email is recorded for the author. SMS is recorded to an `sms-mock:` destination and is not sent to a phone. Production conditional release stays off: `VERIFICATION_RELEASES_ENABLED` is ignored when `NODE_ENV=production`, and test mode itself is off in production.
