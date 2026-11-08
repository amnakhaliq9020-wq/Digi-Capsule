# Remaining issues

Date: 7 November 2026  
These were not changed, because a fix would be a new feature, a major upgrade, or a risk to the demo database.

| ID | Severity | Status | Issue | Recommended action |
|---|---|---|---|---|
| R-1 | MEDIUM | OPEN | `npm audit` reports high issues in `deepmerge-ts` (via Prisma) and PostCSS (via Next.js). `npm audit fix --force` would install Prisma 7 and Next.js 16 | Upgrade on a branch after the demo, then rerun `npm test` |
| R-2 | MEDIUM | OPEN | Files are stored unencrypted. Titles and contact details are not encrypted. One application key covers every letter | Keep `.env` off the demo machine's shared drives. Do not load real family memories into this database |
| R-3 | MEDIUM | OPEN | Test mode is on. The test console can still move a simulated clock and write a decrypted letter into `dev_messages` for this account's contacts | Turn `DIGI_TEST_MODE` off only after the demo. Do not boot the demo with `NODE_ENV=production` unless you mean to hide the console |
| R-4 | MEDIUM | NOT IMPLEMENTED | Password reset does not exist | Do not demo it. Build it after today if the roadmap item is still required |
| R-5 | LOW | NOT IMPLEMENTED | The display name cannot be edited after registration | Change it only if the demo script needs it |
| R-6 | LOW | OPEN | Duplicate registration says the email is already in use | Acceptable for a private demo. Use one message later if public sign-up is added |
| R-7 | LOW | OPEN | Content security policy is disabled | Enable a policy when the app is built for production, and check the Next.js scripts against it |
| R-8 | LOW | OPEN | Phone navigation is tall because every destination stays visible | Leave it for the demo |
| R-9 | INFO | NOT TESTED | Playwright, a screen reader, 200% zoom, and a fresh signed-in browser pass were not run against `digi_capsule` | Use the test database if you want that pass after the demo |
| R-10 | INFO | NOT TESTED | A video over 100 MB was not uploaded | The photo limit was tested at 15 MB plus 1 byte |
| R-11 | INFO | NOT TESTED | No staging host and no production process | Do not describe this laptop as the hosted service |
| R-12 | INFO | OPEN | `npm run worker` still uses server time for every account. That is the real scheduler. It was not started against the shared database in this audit | Start it only if you want due memories on this computer to send into the local test inbox |

## Demo readiness

Local demo: **ready**, if you follow `DEMO_READINESS_REPORT.md` and you do not promise password reset, real email, or production delivery.

Completely secure: **no**.  
Production-ready: **no**.  
Critical tests failing: **no**. The last `npm test` was 58 passed, 0 failed.
