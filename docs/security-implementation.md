# Security implementation report

Date: 10 November 2026

This report covers the account, authentication, and private-data work added on top of the existing Phase 1 API. It separates what is implemented and tested from what is still incomplete. Passing these tests does not make Digi Capsule production-secure.

## Existing protections that were kept

These were already enforced on the server and were not replaced:

- Passwords are hashed with Argon2id (memory cost 19456 KiB, time cost 2, parallelism 1). The password is not stored.
- Registration and login validate email format. New passwords must be 10–200 characters and include a letter and a number.
- Login failures for one email are counted in the database. Eight failures in 15 minutes return 429, including a later correct password.
- A wrong password and an unknown email both return “Email or password is incorrect.”
- Sessions are random tokens. Only the SHA-256 hash is stored. The cookie is HttpOnly and SameSite=Lax, and Secure in production. Logout sets `revokedAt`. Expired sessions are rejected.
- Letter text is encrypted with AES-256-GCM.
- Memory, contact, delivery, and file queries filter on the user id from the session. A caller-supplied user id is not treated as ownership.
- Photo and video uploads are checked against file signatures and size limits. Storage keys are restricted to safe characters. Downloads require the owning session and are sent with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.
- Scheduling a memory requires a confirmed email. The response code is `EMAIL_NOT_VERIFIED`.
- Request logs redact cookies, passwords, letter bodies, tokens, and codes. Unexpected errors return “Something went wrong.”
- CORS is limited to `WEB_ORIGIN`. State-changing requests with a different `Origin` are refused. Helmet is enabled. Content Security Policy stays off so the Next.js app can run.
- Development routes, including the test inbox, stay off unless test mode is on, and they are scoped to the signed-in account.

## What was missing

| Gap | Status before this change |
| --- | --- |
| Password change | Not implemented |
| Password reset | Not implemented. Recorded in the earlier audit as not implemented |
| Verification message as a single-use link, with resend limiting | Codes existed. There was no link, and requesting another code was not rate limited |
| Login timing when the email does not exist | Argon2id ran only for an existing account |
| Per-account upload count and total size | Only per-file size was enforced |
| Short-lived file access | Only a session download existed |
| File access audit | Downloads were not recorded |
| A regression test that walks the cross-user cases in one place | Some cases lived in `memories.test.ts` and `dev-isolation.test.ts` |

Registration still returns 409 when the email is already used. That can reveal that an account exists. Login does not.

## Fixes implemented

### Authentication

- Login now runs Argon2id when the email is missing, against a pad hash, so the missing-account path does the same password work.
- `POST /v1/auth/password` checks the current password, stores a new Argon2id hash, keeps the current session, and revokes the account’s other sessions. It records a `password_changed` notice.
- `POST /v1/auth/forgot-password` returns the same message for a known and an unknown email. It does not return a token. A known account gets one active reset token. Older unused reset tokens are marked used. The route is limited to 8 requests per 15 minutes per client, and a single account does not receive more than 5 reset messages in 15 minutes.
- `POST /v1/auth/reset-password` accepts a token only when its hash matches an unused, unexpired row. It then marks that token and any other unused reset tokens as used, replaces the password hash, and revokes every session. A second use of the same token is rejected.
- Verification tokens remain 24 random bytes, stored only as SHA-256. They expire after 48 hours. `POST /v1/auth/verify-email` can be called from the link without a session. If a session is present, the token must belong to that account. A used or expired token is rejected.
- `POST /v1/auth/verify-email/resend` requires a session, invalidates older unused codes, and stops after 3 verification messages in 15 minutes, including the one created at registration.
- Idempotency keys store a hash prefix, not a slice of the raw token.
- The sign-in page links to forgot password. Settings can change the password. `/reset-password` reads the token from the link. `/verify-email` reads the token from the link and can request a new code.

### Files

- `MAX_UPLOADS_PER_USER` defaults to 100. `MAX_UPLOAD_BYTES_PER_USER` defaults to 1 GB. Both are enforced after the file is read and before it is stored. Pending and ready files count. Failed files do not.
- A file whose bytes do not match the declared photo or video type is rejected. PDF and HTML are rejected. Documents are not a storage type in this build.
- If the write fails, the stored object is removed and the row is marked `failed`.
- `POST /v1/media/:assetId/signed-url` returns a URL that lasts `SIGNED_URL_TTL_SECONDS` (default 120). Only the hash is stored. `GET /v1/media/signed/:token` checks that hash, the expiry, and that the file still belongs to the user who created the link. Owner and signed reads are written to `audit_events` without the token.
- There is still no permanent public object URL. S3 uploads are not given a public ACL by this code. The local driver writes under the configured private directory.

### Isolation

Ownership was already applied on memories, contacts, deliveries, and media. This change also rejects a non-UUID id with 404 instead of a database error, and ignores any `ownerUserId` sent with a create request. Nested files, recipients, and schedules are loaded only through the owning capsule. List responses stay filtered by the session user. Search on the memories page filters the list the API already limited to that user.

Database row-level security was not enabled. The API uses one database role through Prisma’s connection pool. That role owns the tables, so ordinary RLS policies would not constrain it. Forcing RLS without setting a user id inside every transaction would make normal queries fail. A pooled `SET` would also be unsafe. Application filters remain the enforcement layer.

There is no separate administrator role. Development routes are not an admin API.

## Email delivery

The existing notification service records a message. In test mode that row is stored in `dev_messages`, including the verification or reset link, because that is the only delivery channel. The process log line contains the template name and a masked address. It does not contain the token.

No SMTP, Resend, Postmark, or other outside provider is configured. A person who is locked out cannot open the test inbox, because that inbox requires a session. Password reset therefore works for a caller who can read the recorded message, which the automated tests do. It does not yet deliver to an outside mailbox. Verification still works in the application because registration, in test mode, shows the code to the signed-in account.

## Tests

`apps/api/src/test/security.test.ts` uses two accounts where the case needs them. The API checks are server-side. Frontend hiding is not treated as a pass.

| Test | Result |
| --- | --- |
| User A reads User A’s memory | Pass |
| User B reads User B’s memory | Pass |
| User A reads, edits, or deletes User B’s memory | Pass, each denied with 404, and User B’s memory remains |
| User A downloads or signs a URL for User B’s file | Pass, denied with 404 |
| Anonymous file download | Pass, denied with 401 |
| User A’s memory list and a forged `ownerUserId` | Pass, User B’s memory stays out of User A’s list |
| User B changes User A’s contact | Pass, denied with 404 |
| Anonymous memory list | Pass, denied with 401 |
| Unverified account schedules a memory | Pass, denied with 403 |
| Reused verification token | Pass, denied |
| Verification resend after the limit | Pass, denied with 429 |
| Expired reset token | Pass, denied, and the old password still signs in |
| Reused reset token | Pass, denied |
| Reset revokes existing sessions | Pass |
| Password change revokes the other session and keeps the current one | Pass |
| Expired session | Pass, denied with 401 |
| Login rate limit | Pass, the next attempt is 429 |
| Unknown and known login errors | Pass, same message |
| Disguised PNG, PDF, oversized photo, and a second file over the account limit | Pass, all denied |
| Signed URL works, then fails after expiry | Pass |

The full API suite after this change: 10 files, 35 tests passed. The landing copy test passed. In the browser, forgot-password returned the shared message, an invalid reset link was rejected, a new account confirmed its email and reached the dashboard, and Settings changed that account’s password while keeping the current session.

The migration `20261110190000_account_security` adds `password_reset_tokens`, `media_access_tokens`, and `created_at` on verification tokens. It was applied to the local `digi_capsule` database and to `digi_capsule_test`. It does not delete users, memories, or files.

## Still incomplete

- Outside email is not connected, so reset links are not delivered to a real mailbox.
- Registration can still reveal that an email is already registered.
- Photos and videos are private, but they are not encrypted as a second layer. One data key encrypts every letter. There is no key rotation.
- Row-level security is not enabled, for the connection reason above.
- Content Security Policy is off.
- Signed URLs put the secret in the URL. This API does not log successful request URLs, but a reverse proxy might.
- Test mode still returns a verification code to the signed-in browser. Production responses omit it. Test mode must stay off in production.
- Account deletion is still not implemented.
- Dependency audit findings recorded earlier were not upgraded in this change.
- There is no claim of certification, absolute secrecy, or guaranteed delivery.
