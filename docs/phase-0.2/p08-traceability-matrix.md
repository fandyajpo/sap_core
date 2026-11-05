# P08 Traceability Matrix

**P08 state:** P08.1–P08.93 OWNER_APPROVED; P08 DECISION_COMPLETE. This matrix records architecture dependencies, not test results.

| Decision range | Concern | Architecture references | Dependencies | Validation |
|---|---|---|---|---|
| P08.1–P08.4 | Schema organization, ten-schema mapping, relations, FK enforcement | [Database architecture](../phase-0/07-database-architecture.md), [schema ownership](../phase-0/08-schema-ownership-matrix.md), [P05 relationship policy](../phase-0.1/05-cross-schema-relationship-policy.md) | P05, P07, P09 | V01–V03 |
| P08.5–P08.10 | Client/data access, transactions, native types, UUIDs, generation | [Prisma architecture](../phase-0/13-prisma-architecture.md), [transaction architecture](../phase-0/15-transaction-architecture.md), [P02 identity](../phase-0.1/02-better-auth-identity-architecture.md) | P02, P04, P07, P09 | V04–V08 |
| P08.11–P08.14 | Migration ownership/recovery, drift, raw SQL | [Migration strategy](../phase-0/14-prisma-migration-strategy.md), [integrity](../phase-0/12-database-integrity.md) | P05, P07, P09, G10 | V09–V12 |
| P08.15–P08.22 | Performance, observability, RLS, pooling, seeds, tests, versions, release | [Tooling](../phase-0/18-development-tooling.md), [authorization](../phase-0/06-authorization-specification.md), [Phase 1 gates](../phase-0.1/14-phase-1-implementation-gates.md) | P02–P05, P09, P10 | V13–V18 |
| P08.23–P08.36 | Backup, replicas, roles, retention, encryption, monitoring, partitioning, standards, bootstrap, DR, capacity | [Database standards](../phase-0/11-database-standards.md), [integrity](../phase-0/12-database-integrity.md) | P05–P07, P09, G10, P12 | V19–V24 |
| P08.37–P08.46 | Concurrency, idempotency, integrity, audit, privileges, benchmarks, threat model, quality/docs | [Transaction architecture](../phase-0/15-transaction-architecture.md), [business flows](../phase-0/16-business-transaction-flows.md), [P04 authorization](../phase-0.1/04-authorization-scope-model.md) | P03–P07, P09, P10 | V25–V30 |
| P08.47–P08.52 | Provider boundary, lifecycle, incident, cost, exceptions, improvement | [Technology compatibility](../phase-0/02-technology-compatibility-matrix.md), [Phase 0 ADRs](../phase-0/20-architecture-decisions.md) | P09, G10 | V31–V33 |
| P08.53–P08.61 | Multi-tenancy, provisioning, residency, isolation, quotas, portability, privacy, import, lineage | [Organizational model](../phase-0.1/03-organizational-model.md), [P07 ownership](p07-entity-ownership-decision-closure.md) | P03–P07, P09, P12 | V34–V39 |
| P08.62–P08.74 | Outbox/CDC, temporal, quality, classification, non-prod, views, DB code, objects, search, contracts, locale, evolution | [P07 ownership](p07-entity-ownership-decision-closure.md), [schema ownership](../phase-0/08-schema-ownership-matrix.md), [migration strategy](../phase-0/14-prisma-migration-strategy.md) | P05–P07, P09, P12 | V40–V45 |
| P08.75–P08.79 | Tenant-local ACID, DB resolution, relocation, HA control plane, credentials | [Database architecture](../phase-0/07-database-architecture.md), [P03 organizational model](../phase-0.1/03-organizational-model.md) | P03, P04, P09, G10 | V46 |
| P08.80–P08.93 | Pool manager, fleet migrations, decommission, catalog/config/extensions/network/auth/failover/session/query/workload/errors/closure | [P08 closure](p08-prisma-multi-schema-decision-closure.md), [P08 validation backlog](p08-phase-0.3-validation-backlog.md), [P07 closure](p07-entity-ownership-decision-closure.md) | P03–P07, P09, P10, G10 | V47–V60 |

## Cross-decision reconciliation

- P02: Better Auth and core.users remain canonical; adapter/schema mapping is unvalidated.
- P03: organization/company/plant scope is authoritative. Initial baseline remains one database, not an implemented tenant DB fleet.
- P04: CASL/server authorization remains primary; RLS is defense-in-depth, not an authorization substitute.
- P05: per-edge FK/composite-FK/application-reference and delete/lifecycle choices remain authoritative. P08 does not blanket-approve FKs.
- P06: Finance owns CoA/account identity; financial lifecycle and consumer contracts remain governed by P06.
- P07: entity/aggregate ownership and domain contracts remain authoritative. A central Prisma client does not create central domain ownership.
- P09: exact Node/Next/React/Prisma/adapter/provider versions and lockfile must be pinned; P08 is not compatibility proof.
- P10: session freshness/revocation remains separate from transaction-scoped database context.
- G10: approve runtime/migration roles, direct/pooled paths, TLS/network, provider/engine and backup/recovery objectives before provisioning or production migration.
- P12: P08 supplies governance mechanisms, not invented jurisdiction-specific legal rules.

## Initial baseline versus future capability

Initial target: one PostgreSQL database, ten schemas, one governed Prisma client and one migration history. Tenant database fleets, per-database pool manager, placement control plane, residency placement and fleet rollout remain future capabilities unless explicitly included in a scoped phase with provider evidence and implementation gates.
