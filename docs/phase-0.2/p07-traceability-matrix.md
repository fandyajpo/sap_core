# P07 Traceability Matrix

**P07 state:** DECISION_COMPLETE; P07.1–P07.10 are OWNER_APPROVED. Links and validation IDs identify architecture dependencies, not implementation authorization or technical pass.

| Decision | Authoritative architecture references | Schemas / domains | Dependencies | Phase 0.3 evidence | Implementation boundary |
|---|---|---|---|---|---|
| P07.1 | [Module ownership](../phase-0/04-module-ownership.md), [schema ownership](../phase-0/08-schema-ownership-matrix.md), [entity ownership](../phase-0.1/07-entity-ownership-finalization.md) | All ten | P05, P08 | P07-V01 | Single authoritative owner per persistent entity; controlled consumer access |
| P07.2 | [Entity catalog](../phase-0/09-entity-catalog.md), [logical ERD](../phase-0.1/08-global-logical-erd.md), [per-schema ERDs](../phase-0.1/10-per-schema-erd.md) | All domain schemas | P05, P06, P08 | P07-V02 | Entity-by-entity aggregate roots, dependent entities and transaction boundaries |
| P07.3 | [Ownership map](../phase-0.1/07-entity-ownership-finalization.md), [decision register](../phase-0.1/01-decision-register.md) | All ten | P02–P08 | P07-V03 | Version-controlled ownership registry; not runtime auth |
| P07.4 | [Migration strategy](../phase-0/14-prisma-migration-strategy.md), [integrity](../phase-0/12-database-integrity.md), [cross-schema policy](../phase-0.1/05-cross-schema-relationship-policy.md) | Source/target domains | P05, P08 | P07-V04 | Controlled ownership transfer and cutover; preserve IDs/history |
| P07.5 | [Database standards](../phase-0/11-database-standards.md), [physical ERD draft](../phase-0.1/09-global-physical-erd.md), [identity architecture](../phase-0.1/02-better-auth-identity-architecture.md) | All ten; Better Auth in core | P02, P05, P08 | P07-V05 | Stable technical IDs; governed business/external keys; exact ID implementation pending |
| P07.6 | [Integrity](../phase-0/12-database-integrity.md), [transaction architecture](../phase-0/15-transaction-architecture.md), [P06 closure](p06-chart-of-accounts-decision-closure.md) | All domain schemas | P04–P08, P10 | P07-V06 | Domain lifecycle, shared metadata standards, immutable posted facts |
| P07.7 | [Application architecture](../phase-0/03-application-architecture.md), [dependency map](../phase-0.1/11-cross-schema-dependency-map.md), [P06 decision matrix](p06-decision-matrix.md) | Source and consumer domains | P05, P06, P08 | P07-V07 | Consumer-owned non-authoritative projections, provenance and rebuild |
| P07.8 | [Module ownership](../phase-0/04-module-ownership.md), [business flows](../phase-0/16-business-transaction-flows.md), [dependency map](../phase-0.1/11-cross-schema-dependency-map.md) | All modules | P05, P06, P08 | P07-V08 | Explicit in-process contracts/events/read models; no hidden cross-domain writes |
| P07.9 | [Development tooling](../phase-0/18-development-tooling.md), [project structure](../phase-0/19-project-structure.md), [Phase 1 gates](../phase-0.1/14-phase-1-implementation-gates.md) | Source/build/CI | P08, P09 | P07-V09 | Automated boundary checks, exception governance and CI evidence |
| P07.10 | [Entity catalog](../phase-0/09-entity-catalog.md), [schema ownership](../phase-0/08-schema-ownership-matrix.md), [P06 traceability](p06-traceability-matrix.md) | Shared/reference domains | P05, P06, P08 | P07-V10 | Canonical reference owner, contract, effective date/version and snapshots |

## Reconciliation rules

- P06 is authoritative for CoA: Finance owns company-level CoA/account identities; master_data must not duplicate them.
- P02 is authoritative for canonical user identity; core.users is canonical and Better Auth adapter mapping remains a technical validation item.
- P03/P04 govern organizational scope and authorization; the P07 registry does not grant access.
- P05 determines the enforcement and lifecycle/delete choice for each physical relationship. P07 ownership does not blanket-approve FKs.
- P08 governs Prisma model/migration and multi-schema implementation. P07 does not settle UUID version, generator or provider behavior.
- Currency, Tax Code, fiscal calendar and other unresolved reference concepts have no inferred owner.
- integration remains reserved and empty in the initial scope.
