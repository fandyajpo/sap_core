# SAP Core — Phase 0 Foundation Specification

**Status:** Draft specification; Phase 0 is incomplete.  
**Scope:** Documentation only. No application code, dependency installation, database provisioning, Prisma schema, migration, or integration is included.

## Purpose and governing baseline

Phase 0 defines a safe foundation for implementation: a single deployable modular monolith, one PostgreSQL database named `sap_core`, and ten governed schemas. `sap_core_skills` is engineering guidance for this work; this implementation repository owns the deliverables. The skill repository has not been changed.

The accepted architecture decisions in the skills repository remain authoritative. These documents add design detail and record proposed/open choices; they do not silently supersede accepted decisions or establish legal, accounting, tax, payroll, or jurisdiction policies. Technical package observations are not equivalent to an installed, locked, built, or tested application.

## Nine documentation stages

| Stage | Concern | Deliverables |
|---|---|---|
| 1 | Scope and technology baseline | 00–02 |
| 2 | Application/module boundaries | 03–04 |
| 3 | Authentication and authorization | 05–06 |
| 4 | Database architecture and ownership | 07–08 |
| 5 | Entity and relationship design | 09–10 |
| 6 | Database integrity and Prisma evolution | 11–14 |
| 7 | Transactions, business flows, API | 15–17 |
| 8 | Developer tooling and repository layout | 18–19 |
| 9 | Decisions, consistency and exit validation | 20–21 |

These stages organize documents; they do not represent implementation completion.

## Required implementation gates

Before implementation is treated as ready, satisfy the applicable technical gates and remaining owner selections: lock the framework/runtime/ORM/auth adapter set; validate P02's approved Better Auth-to-`core.users` adapter mapping; validate P03's approved initial organization/company/plant policy; select and test every in-scope P05 relationship; resolve P10; and decide database roles, connection paths, recovery objectives and any policy required by the scoped ERP workflows. P02–P05 are owner-approved architecture decisions, not technical test results. P06–P09 are `DECISION_COMPLETE` with technical validation pending in their Phase 0.3 backlogs. Finance implementation remains blocked on applicable P02–P10 evidence and decisions. Verify exact package versions and generated schema in a disposable PostgreSQL environment before adopting them.

Before a production claim, additionally establish session and recovery policy, email delivery operations, authorization and tenant-isolation tests, migration/recovery evidence, backup/restore evidence, audit retention, and the applicable legal/accounting/privacy decisions.

## Out of scope

No implementation, app scaffolding, generated Prisma models, migrations, database connection/provisioning, external service integration, message broker, microservice, or production policy is authorized by this specification. The `integration` schema remains reserved.

## Status vocabulary

- **Accepted:** Existing architecture baseline selected in `sap_core_skills/DECISION_LOG.md`.
- **Candidate:** A documented direction/version worth validating; not a lockfile or compatibility certification.
- **Proposed:** A choice requiring owner approval.
- **Open:** No choice has been made; do not encode as product behavior.
- **Not verified:** Documentation or metadata has not established the claimed behavior in this application.

See [the validation report](21-phase-0-validation-report.md) for the current exit-gate state and [the decision register](20-architecture-decisions.md) for owners and open decisions.


## Phase 0.1 reconciliation addendum

Phase 0's status vocabulary and historical decision rows are preserved. P02–P05 are now `OWNER_APPROVED` in the Phase 0.1 register; their adapter/Prisma, authorization and per-edge relationship evidence remains pending. P06 is `DECISION_COMPLETE` with its 26 decisions `OWNER_APPROVED`, but not `TECHNICALLY_VALIDATED` or `IMPLEMENTATION_READY`. P07–P10 remain proposed; Phase 0.2 remains open and Phase 1 is not ready. See the [Phase 0.1 register](../phase-0.1/01-decision-register.md), [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and [Phase 0.1 validation report](../phase-0.1/15-phase-0.1-validation-report.md).


## Phase 0.2 decision reconciliation — P09

P09.1–P09.17 are owner-approved and P09 is decision-complete. The selected governance requires core-first dependency adoption, a pinned runtime and package manager, framework-led compatibility, a unified Prisma compatibility set, governed authentication/authorization dependencies, feature-driven optional packages, a hybrid toolchain with Next.js retaining production build authority, risk-based dependency security, controlled upgrades, observability, environment parity, resilience, lifecycle governance, central change authority and evidence-based validation. This does not select exact versions or establish technical validation. See [P09 closure](../phase-0.2/p09-technology-stack-decision-closure.md) and [Phase 0.3 backlog](../phase-0.2/p09-phase-0.3-validation-backlog.md). P10 remains open; Phase 1 remains NOT READY.
