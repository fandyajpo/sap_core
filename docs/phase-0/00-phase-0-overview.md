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

Before implementation is treated as ready, owners must resolve or explicitly accept: a locked framework/runtime/ORM/auth adapter set; Better Auth model ownership and placement; cross-schema foreign-key governance; an organization/company/plant model and scope constraints; the chart-of-accounts owner; database roles, connection paths and recovery objectives; and product/legal policy needed for any specific ERP workflow. Verify the exact package pair and generated schema in a disposable PostgreSQL environment before adopting it.

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

Phase 0's status vocabulary and historical decision rows are preserved. The current decision-resolution layer is [Phase 0.1](../phase-0.1/00-phase-0.1-overview.md); its five statuses and owner/test evidence are authoritative for current proposals. Phase 0.1 confirms the requested architecture baseline but leaves identity mapping, organization/company/plant semantics, FK governance, chart ownership and exact package versions `PROPOSED` or `DEFERRED`. Its exit state is **NOT READY — BLOCKING DECISIONS REMAIN**; no technical decision is `VALIDATED` without a reproducible test. See [decision register](../phase-0.1/01-decision-register.md) and [Phase 0.1 validation report](../phase-0.1/15-phase-0.1-validation-report.md).
