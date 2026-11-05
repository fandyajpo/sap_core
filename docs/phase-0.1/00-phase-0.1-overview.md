# Phase 0.1 — Architecture Decision Resolution

**Status: NOT READY — BLOCKING DECISIONS REMAIN**  
**Scope:** Documentation only. No application code, Prisma schema, migration, dependency install, database connection/provisioning, manifest or lockfile change is included.

## Purpose and governing baseline

Phase 0.1 reconciles Phase 0 proposals into explicit decision records and architecture specifications. It preserves the selected modular monolith, one PostgreSQL database (`sap_core`), the same ten schemas, Next.js, Prisma ORM and Prisma Migrate. Those are approved for this phase because the owner explicitly specified them as the required context. This is not evidence that an application exists, builds, or has passed a technical test.

Phase 0.1 does not supersede the skills repository or rewrite Phase 0 history. Historical Phase 0 labels remain as written; this directory is the authoritative resolution layer for current architecture proposals. No new disputed identity, organization, authorization, cross-schema relationship, chart-of-accounts or exact dependency decision has owner approval. No reproducible technical test was available, so no decision is marked `VALIDATED`.

## Status vocabulary

Use only these five decision statuses in Phase 0.1:

- `APPROVED` — explicit owner approval is recorded with the approver and evidence. The requested architectural context is the sole approval provided in this phase.
- `VALIDATED` — a reproducible technical test has been run and its procedure, pinned inputs, environment and result are recorded. Documentation or registry metadata alone is not validation.
- `PROPOSED` — a reasoned recommendation awaiting owner approval and/or required technical evidence.
- `DEFERRED` — intentionally postponed; it is not an implicit default and must be reopened before the affected module/policy is implemented.
- `REJECTED` — an option was explicitly rejected with owner/evidence recorded. No new Phase 0.1 option has been marked rejected.

Phase 0 vocabulary such as `Accepted`, `Candidate`, `Open` and `Not verified` is preserved only in its historical files and is not a Phase 0.1 decision status.

## Deliverables

1. [Decision register](01-decision-register.md)
2. [Better Auth identity architecture](02-better-auth-identity-architecture.md)
3. [Organizational model](03-organizational-model.md)
4. [Authorization scope model](04-authorization-scope-model.md)
5. [Cross-schema relationship policy](05-cross-schema-relationship-policy.md)
6. [Chart-of-accounts ownership](06-chart-of-accounts-ownership.md)
7. [Entity ownership finalization](07-entity-ownership-finalization.md)
8. [Global logical ERD](08-global-logical-erd.md)
9. [Global physical ERD](09-global-physical-erd.md)
10. [Per-schema ERDs](10-per-schema-erd.md)
11. [Cross-schema dependency map](11-cross-schema-dependency-map.md)
12. [ERP policy classification](12-erp-policy-classification.md)
13. [Technology compatibility resolution](13-technology-compatibility-resolution.md)
14. [Phase 1 implementation gates](14-phase-1-implementation-gates.md)
15. [Validation report](15-phase-0.1-validation-report.md)

## Reading and implementation rules

- Read the decision register with each subject specification. Recommendations and ERDs are proposals, not permission to implement them.
- Keep the exact ten-schema set in `docs/phase-0/07-database-architecture.md`. `integration` remains reserved and empty.
- Retain Phase 0's historical `master_data.chart_of_accounts` reference until an owner decision explicitly supersedes it. This phase recommends `finance` but does not enact the move.
- No jurisdiction-specific, accounting, tax, payroll, valuation, retention or legal rule is inferred.
- A Phase 1 gate requires the relevant owner decision and, where technical behavior is claimed, reproducible tests. Phase 1 is not cleared by this document set.

## Phase 0 cross-references

The reconciliation addenda in Phase 0 documents point to this directory without deleting their original statements. See the [validation report](15-phase-0.1-validation-report.md) for exactly which source documents were amended and what checks remain unavailable.
