# 10 — Deployment and operations

Status: proposed, 2026-11-03. Hosting vendor is not chosen. Do not spend on AI infrastructure for this phase. Figures that would be prices are called out as quotes to collect, not as estimates invented here.

## Environments

| Environment | Data | Purpose |
| --- | --- | --- |
| Local | Synthetic | Developer laptops. MinIO or similar, local Postgres, notification port logs to the console |
| CI | Ephemeral Postgres | Unit and integration tests |
| Staging | Synthetic only | Restore drills, release candidates |
| Production | Real memories | One region, after D-1 |

No production data in staging refreshes unless a scrubbing design is reviewed. Prefer not to copy production at all in the beta.

## Runtime topology

- `web` container: Next.js and React.js frontend.
- `api` container: Fastify backend.
- `worker` container: same image as `api`, command `node dist/worker.js` (exact entry chosen at implementation).
- Managed Postgres.
- Private bucket in the same region as the app if the vendor allows.
- Secret store entries: database URL, session secret, KMS key id, storage credentials, email API key, later SMS key.

Minimum production size for a private beta: one small web, one small API, one worker, one database with automated backups. Scale only from measured CPU, queue delay, or storage.

## CI/CD

Suggested pipeline once code exists:

1. Install from the lockfile.
2. Lint and typecheck.
3. Unit tests.
4. Integration tests with Postgres.
5. Secret scan.
6. Build containers.
7. Deploy to staging on the main branch.
8. Deploy to production by a manual approval after staging smoke tests.

Migrations run as a step before the new API rolls out. They must be backward compatible for one release so a rollback of the app does not require a down migration. Destructive column drops wait a release.

Do not auto-deploy production on every push during the beta. Wrongful-release risk is higher than deploy frequency value.

## Observability

- JSON logs with correlation id, level, module, and job id. Redaction list: `body`, `ciphertext`, `authorization`, `cookie`, `token`, `password`.
- Metrics: queue depth, job outcomes, check-ins confirmed, upload failures, HTTP 5xx.
- Uptime check on `/health` that verifies database connectivity. It must not dump version soup that helps attackers; a simple ok is enough publicly.
- Alerts to a human: worker down, dead-letter count > 0, backup job failed, 5xx rate, disk or database storage near the host's limit.
- Error tracking before public launch, with the scrubber from the test plan.

There is no on-call rotation until there are users. Before the private beta, name one person who reads alerts.

## Backups and disaster recovery

| Asset | Proposal |
| --- | --- |
| Postgres | Host automated daily backups plus point-in-time recovery if the managed plan includes it. **Confirm retention with the host quote.** Working assumption to take to the quote: 35 days |
| Objects | Versioning on. Lifecycle rules must not delete current originals. Noncurrent versions can expire after the same window as database backups so deletion still completes |
| Secrets and KMS | The key service is part of the restore. Document who can use the key in the new project if the cloud account is rebuilt |
| IaC | Stored in git so the environment can be recreated |

Recovery objectives for the beta are product decisions, not measured SLAs. **Assumptions to discuss:** recovery point of 24 hours and recovery time of one business day are acceptable for a private beta. They are not acceptable promises for a marketed "forever archive." Do not advertise an uptime percentage until it is measured.

Restore drill, before calling milestone 6 done:

1. Restore the latest staging backup into a throwaway database.
2. Point a staging worker at it with outbound email disabled.
3. Sign in as a fixture user and open one object.
4. Write the elapsed time into the operations log in the repo or the ticket.

A failed drill blocks launch readiness.

## Incident severity

| Severity | Example | Response |
| --- | --- | --- |
| Severe | Content emailed or visible without a valid job; bucket public; confirmed unauthorized read | Stop the worker, revoke sessions if takeover, preserve logs, notify affected authors in plain language |
| High | Jobs stuck, reminders not sending, backup failing | Fix the same day during beta hours |
| Normal | Single upload failure with a clear user error | Support when the team exists |

Post-incident notes record what was delivered, what was cancelled, and whether ciphertext was exposed. They omit letter contents.

## Cost drivers

Collect current public prices or sales quotes before choosing vendors. Record the date of the quote. This document intentionally has no currency amounts.

Phase 1 drivers:

- Object storage gigabytes-month and, especially, egress when several relatives watch the same video.
- Database size and backup storage. Letters are small; video dominates.
- Email volume: check-ins are the steady load. Releases are spiky and small.
- SMS, if enabled, often costs more per message than email. Keep it off until a tier pays for it.
- Error-tracking and log retention.
- Engineer time. For a solo developer this dominates vendor fees at beta scale.
- Domain name, transactional email warmup, and support inbox.

Phase 2 drivers, avoid until then:

- Voice enrollment and per-minute synthesis.
- Video avatar rendering minutes.
- Model tokens per family question.
- GPU instances if self-hosting.
- Extra legal review for biometrics.

Cost-conscious sequence:

1. One region, one bucket, email-only, modest upload caps.
2. Measure average bytes per author in beta before setting paid tiers.
3. Text-only archive Q&A prototype before any voice contract.
4. No reserved GPU capacity in the roadmap's first year unless a funded beta requires it.

## Quotas to set in config

**Assumptions for the first beta, easy to change:**

- Max photo 20 MB, audio 50 MB, video 250 MB, document 25 MB.
- Storage cap per author 2 GB until pricing exists.
- Max capsules 5 and max recipients 20 on the beta allow-list.
- These are safety rails against surprise storage bills, not a business model.

## Launch configuration checklist

- `VERIFICATION_RELEASES_ENABLED=false` until milestone 5 is accepted.
- Public bucket access blocked.
- Production email sending domain authenticated (SPF, DKIM, DMARC).
- Console notification provider impossible in production (fail boot if selected).
- Backups visible and a drill date recorded.
- Privacy notice and terms URLs exist, even as drafts reviewed by counsel.
- On-call name and incident contact filled in.
- No AI API keys in the production secret store.

## Operating the queue

- Dashboard or SQL view of jobs by status.
- Replay script that requeues by idempotency key and refuses to mint a new key.
- Clock skew: NTP on hosts. Schedule tests should not depend on a laptop zone.
- Worker concurrency starts at 1 or 2 so retries are understandable. Increase when the dead-letter rate is understood.

## What not to operate yet

Multi-region active-active, a status page with an SLA, a 24/7 rotation, a data science stack, and a GPU pool.
