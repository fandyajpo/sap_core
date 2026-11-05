# P08 Prisma Multi-Schema Architecture Decision Closure

**Status: DECISION_COMPLETE.** P08.1–P08.93 are owner-approved. This closes the owner-decision stream only; it does not claim Prisma/provider compatibility, schema generation, migration safety, database operations or production readiness have been technically validated.

## Decision outcome

The approved architecture is PostgreSQL-centric: one governed Prisma model set/client and one migration history across ten PostgreSQL schemas, with domain-owned models and migrations under central platform governance. Cross-schema relations remain per-edge choices under P05 and ownership boundaries under P07. Exact provider behavior must be demonstrated against the pinned Prisma/PostgreSQL/Prisma Postgres combination.

See the [decision matrix](p08-decision-matrix.md), [traceability matrix](p08-traceability-matrix.md) and [Phase 0.3 validation backlog](p08-phase-0.3-validation-backlog.md).

## Consolidated architecture

### Prisma model, schema and migration topology

- One governed multi-file Prisma schema project, one generated Prisma Client and one migration history for the initial database.
- Declare all ten PostgreSQL schemas and explicitly map each model to its owner schema.
- Use PostgreSQL foreign keys as the baseline relation mode. Cross-schema relation shapes and constraints remain per-edge decisions; Prisma support and generated SQL must be tested.
- Centralize client generation. Domain modules own data-access contracts and do not expose unrestricted persistence internals.
- Domain teams author migrations for their owned models; central governance controls ordering, review, compatibility and release.
- Prisma Migrate is the sole governed migration path. Migrations are forward-only by default, with controlled corrective/restore recovery rather than assumed down-migration safety.
- Pin Prisma ORM, CLI, PostgreSQL provider and adapter versions together under P09.

### Ownership, authorization and transactions

- A central Prisma client does not create central domain ownership. P07 remains authoritative for entity and aggregate write ownership.
- Cross-domain writes use explicit domain contracts. Application-orchestrated shared transactions are allowed only within a valid single-database ACID boundary.
- P04 server-side authorization remains primary. Selective PostgreSQL RLS is defense-in-depth and does not replace CASL or protected application paths.
- Tenant/session context is explicit and transaction-scoped; pooled connection reuse must not leak mutable session state.
- Runtime, migration, read-only, job and administrative identities use distinct least-privilege privileges.
- Native PostgreSQL types and raw SQL are explicitly mapped, reviewed, parameterized and tested.

### Migration and release governance

- Detect schema drift and reconcile through reviewed migrations; no silent production schema mutation.
- Analyze schema, data, relation, consumer and contract impact before changes.
- Bootstrap environments deterministically; use separate databases and credentials per environment.
- Use a dedicated migration release pipeline, preflight checks, expand/contract evolution and staged recovery plans where applicable.
- Backups, restore, disaster recovery, failover and provider-managed capabilities require tested evidence and explicit RPO/RTO objectives.
- Database fleet migration, tenant relocation and decommissioning are governed future capabilities, not part of the initial one-database baseline by implication.

### Runtime and workload operations

- Govern pooling, per-database pool lifecycle/capacity, connection identity and provider-specific endpoint behavior.
- Govern query performance, statement/lock/transaction limits, cancellation, concurrency, idempotency and integrity under load.
- Classify critical transactional, interactive, background, bulk, analytical and administrative workloads; apply admission, quotas, throttling and isolation. Priority never bypasses authorization or integrity.
- Failover promotion remains provider-authoritative; the application invalidates stale connections and recovers safely. Ambiguous transaction outcomes are reconciled, not blindly retried.
- Centralize error classification across PostgreSQL, Prisma, driver and provider errors. Retry only safe/idempotent operations and redact internal details.
- Provide observability, incident response, capacity planning, maintenance, cost governance and continuous improvement.

### Data lifecycle, security and compliance

- Govern retention, archival, legal hold, purge and tenant decommissioning; distinguish logical retirement from secure physical disposal.
- Govern encryption, key ownership/rotation, network/TLS, endpoint exposure, authentication protocols and credential lifecycle.
- Maintain a database metadata catalog, infrastructure inventory, configuration-as-code, drift reconciliation and PostgreSQL extension allowlist.
- Govern tenant provisioning, placement/residency, workload fairness, quotas, export/portability, privacy requests, import, lineage, data quality and classification.
- Protect non-production data through masking/synthetic data and secret isolation.
- Govern views/materialized views, functions/procedures/triggers, object-storage metadata, search/projections, temporal and locale semantics as explicit contracts.
- Tenant-local ACID is the supported transaction boundary. Cross-database workflows require explicit distributed workflow semantics; do not claim cross-database ACID.
- Jurisdiction-specific obligations remain deferred under P12 unless qualified owners approve them.

### Multi-database future capabilities

P08 includes governance for tenant database placement, bounded per-database pools, fleet migrations, decommissioning, metadata discovery, configuration reconciliation, network/TLS, authentication, failover, session hygiene, query limits, workload classes and error semantics.

These decisions do not change the initial baseline: one PostgreSQL database with ten schemas. Activating tenant database fleets requires a separately scoped rollout and evidence for provider support, placement/control plane, credential isolation, pool bounds, migration waves, relocation and recovery.

## Cross-decision dependencies

- P02: Better Auth canonical identity; exact adapter and schema mapping remain to validate.
- P03: organization/company/plant membership and tenant scope.
- P04: CASL authorization, service identities, break-glass and selective RLS defense-in-depth.
- P05: per-edge FK/composite-FK/application-reference and lifecycle/delete choices.
- P06: Finance-owned CoA, immutable financial facts and reporting contracts.
- P07: entity/aggregate ownership, canonical references, projections and explicit domain contracts.
- P09: exact runtime, Prisma/provider/adapter/package pins and lockfile.
- P10: session revocation, account disablement and freshness.
- G10: runtime/migration roles, pooled/direct paths, TLS/network, provider engine and backup/recovery objectives.

## Non-goals

P08 does not authorize Phase 1, change the ten-schema baseline, authorize microservices/brokers/distributed transactions, blanket-approve cross-schema FKs, select exact package versions, finalize session policy, or assert untested Prisma Postgres capabilities. Advanced multi-database capabilities are not mandatory in the initial product scope.

## Closure assessment

- P08.1–P08.93: OWNER_APPROVED.
- P08 decision stream: DECISION_COMPLETE.
- Technical validation: pending Phase 0.3.
- Implementation readiness: not granted.
- Phase 1: NOT READY until applicable G01–G11 decisions and evidence pass.

No P08.94 is required. Remaining provider, version, schema, migration, pool, RLS/session and operational questions belong in the validation backlog and P09/G10 evidence, not an invented extra owner decision.
