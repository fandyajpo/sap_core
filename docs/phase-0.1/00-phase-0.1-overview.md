# Phase 0.1 — Architecture Decision Resolution

**Status: NOT READY — BLOCKING DECISIONS REMAIN**  
**Scope:** Documentation only. No application code, Prisma schema, migration, dependency install, database connection/provisioning, manifest or lockfile change is included.

## Purpose and governing baseline

Phase 0.1 reconciles Phase 0 proposals into explicit decision records and architecture specifications. It preserves the selected modular monolith, one PostgreSQL database (`sap_core`), the same ten schemas, Next.js, Prisma ORM and Prisma Migrate. Those are approved for this phase because the owner explicitly specified them as the required context. This is not evidence that an application exists, builds, or has passed a technical test.

Phase 0.1 does not supersede the skills repository or erase Phase 0 history. Historical Phase 0 labels remain as written; this directory records the earlier resolution state. Phase 0.2 P06 owner-approved and closed the CoA decision stream, explicitly superseding the former `master_data` placement and Phase 0.1 proposal status. The current register now records P02–P05 as `OWNER_APPROVED` as well; their adapter/schema, enforcement, per-edge relationship and security test evidence remains pending. P06 is `DECISION_COMPLETE`, but not technically validated. P07–P10 remain proposed; Phase 0.2 remains open and Phase 1 is not ready. See [decision register](01-decision-register.md) and [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md).

## Status vocabulary

Phase 0 and the original Phase 0.1 labels are preserved as historical vocabulary. Current decision tracking distinguishes owner selection, decision closure, technical evidence and scoped implementation readiness:

- `APPROVED` — the historical Phase 0.1 label for the specified baseline; selection alone is not technical validation or implementation readiness.
- `OWNER_APPROVED` — the owner explicitly selected a decision. It does not assert technical validation or implementation readiness.
- `DECISION_COMPLETE` — an explicitly bounded decision set has been selected and documented. It does not close dependent decisions or technical gates.
- `TECHNICALLY_VALIDATED` — reproducible evidence against pinned tools and a recorded environment exists; documentation or registry metadata alone is not validation.
- `IMPLEMENTATION_READY` — applicable owner decisions and technical gates are satisfied for a specifically scoped implementation.
- `PROPOSED` — a reasoned recommendation still awaiting owner selection and/or required evidence.
- `DEFERRED` — intentionally postponed; not an implicit default, and reopen before the affected feature/policy is implemented.
- `REJECTED` — an option was explicitly rejected with owner/evidence recorded.

`VALIDATED` remains only in historical Phase 0.1 wording; use `TECHNICALLY_VALIDATED` for current technical status. Phase 0 terms such as `Accepted`, `Candidate`, `Open` and `Not verified` remain unchanged in their historical files.

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
- Phase 0.2 P06 explicitly supersedes the historical `master_data.chart_of_accounts` placement. Finance is now the sole owner; the historical placement is not current architecture, and no data migration is implied.
- No jurisdiction-specific, accounting, tax, payroll, valuation, retention or legal rule is inferred.
- A Phase 1 gate requires the relevant owner decision and, where technical behavior is claimed, reproducible tests. Phase 1 is not cleared by this document set.

## Phase 0 cross-references

The reconciliation addenda in Phase 0 documents point to this directory without deleting their original statements. See the [validation report](15-phase-0.1-validation-report.md) for exactly which source documents were amended and what checks remain unavailable.
