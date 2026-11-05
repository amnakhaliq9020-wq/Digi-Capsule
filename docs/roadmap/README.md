# Digi Capsule roadmap

Planning date: 2026-11-03. Status: proposed. No application code exists yet.

## Executive summary

Digi Capsule helps a living person preserve private memories and decide who may receive them, when, and under what conditions. The first release is a secure time capsule: accounts, encrypted media, trusted people, monthly check-ins, scheduled deliveries, and a recipient portal. A missed check-in means the person is unreachable. It is not proof of death, and it must never release a capsule by itself.

Death-related release is a separate authorization workflow: explicit attestations, a configurable waiting period, a dispute path, and a final cancellation window. The product cannot promise certainty. False alarms must be recoverable until delivery is committed.

AI voice and face replicas are Phase 2. They wait until storage, consent, permissions, and release safety work in production. Phase 3 covers family archives, estate-style tools, and richer storytelling. Those are optional.

The recommended build is a TypeScript modular monolith: a Next.js and React.js frontend, a Fastify backend, a worker in the same codebase, PostgreSQL, and private S3-compatible object storage. Background work should use a Postgres-backed job queue so release jobs stay transactional and idempotent. Identity, email, SMS, and storage vendors stay behind interfaces until the launch country is chosen.

The first implementation milestone is Milestone 1 (accounts, profiles, capsules, and private media), and only after the five decisions in [12_risks_and_open_questions.md](12_risks_and_open_questions.md) are recorded. Milestone 0 documentation is this roadmap.

Estimates below are preliminary. They are not bids.

## Document index

| File | Contents |
| --- | --- |
| [01_product_vision.md](01_product_vision.md) | Vision, personas, principles, success metrics |
| [02_feature_roadmap.md](02_feature_roadmap.md) | Phase 1–3 scope, priorities, commercial boundary |
| [03_technical_architecture.md](03_technical_architecture.md) | Stack, modules, integrations, diagram |
| [04_database_schema.md](04_database_schema.md) | Entities, relationships, ownership, permissions |
| [05_liveness_and_release_workflow.md](05_liveness_and_release_workflow.md) | Check-ins, verification, disputes, release rules |
| [06_ai_avatar_architecture.md](06_ai_avatar_architecture.md) | Phase 2 consent, providers, safety boundaries |
| [07_security_privacy_and_compliance.md](07_security_privacy_and_compliance.md) | Threat model, encryption, privacy, legal questions |
| [08_ui_ux_user_journeys.md](08_ui_ux_user_journeys.md) | Screens and journeys |
| [09_testing_and_acceptance_criteria.md](09_testing_and_acceptance_criteria.md) | Test gates before each milestone |
| [10_deployment_and_operations.md](10_deployment_and_operations.md) | Environments, backups, cost drivers |
| [11_implementation_backlog.md](11_implementation_backlog.md) | Epics, stories, effort, definition of done |
| [12_risks_and_open_questions.md](12_risks_and_open_questions.md) | Decisions the product owner must make |

## Repository audit

Searched the home directory, `Projects`, `Desktop`, `Documents`, and `source` naming patterns for an existing Digi Capsule app. None was found. `C:\Users\ELITE BOOK\Projects` contains unrelated projects only. This repo was created empty, then `git init` was run. No commit has been made.

| Area | Found |
| --- | --- |
| Framework / language | None |
| Dependencies | None |
| Database | None |
| Authentication | None |
| File storage | None |
| Deployment | None |
| Tests | None |
| Documentation | This roadmap |

## Suggested repository layout (not created yet)

```text
apps/web/                 Next.js and React.js frontend (owner app and recipient portal)
apps/api/                 Fastify backend and worker entrypoint
packages/domain/          Pure state machines and schedule rules
packages/db/              Prisma schema and migrations
docs/roadmap/             This planning set
```

Do not add those application folders until Milestone 1 is explicitly requested.
