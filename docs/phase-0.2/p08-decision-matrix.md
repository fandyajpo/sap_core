# P08 Decision Matrix

**Status:** P08.1–P08.93 are OWNER_APPROVED; P08 is DECISION_COMPLETE. Technical validation remains pending. See [P08 closure](p08-prisma-multi-schema-decision-closure.md).

| ID | Topic | Approved decision |
|---|---|---|
| P08.1 | Prisma schema organization | Multi-file Prisma schema; one governed project, client and migration history. |
| P08.2 | PostgreSQL schema mapping | Declare all ten schemas; explicitly map every model to its owner schema. |
| P08.3 | Cross-schema relations | Governed hybrid relations selected per edge under P05/P07. |
| P08.4 | Relation enforcement | PostgreSQL foreign keys are the baseline. |
| P08.5 | Client and data access | Central Prisma client; domain-owned data-access contracts. |
| P08.6 | Cross-domain transactions | Application-orchestrated shared transaction within one valid database ACID boundary. |
| P08.7 | Native PostgreSQL types | Explicit native type mapping; inspect generated SQL and semantics. |
| P08.8 | Identifier generation | DB-generated UUIDs with explicit Prisma defaults; exact version/mechanism validated separately. |
| P08.9 | Client lifecycle | Environment-aware client lifecycle; avoid unsafe client proliferation. |
| P08.10 | Client generation | Centralized, explicit and reproducible client generation. |
| P08.11 | Migration ownership | Domain-owned migration authorship with central governance. |
| P08.12 | Migration recovery | Forward-only migrations with controlled recovery. |
| P08.13 | Drift management | Automated drift detection and governed reconciliation. |
| P08.14 | Raw SQL | Governed native SQL with review, parameterization and tests. |
| P08.15 | Query performance | Query budgets, plans and regression governance. |
| P08.16 | Database observability | Layered query/database observability with sensitive-data controls. |
| P08.17 | Authorization and RLS | Application authorization primary; selective RLS defense-in-depth. |
| P08.18 | Pooling and capacity | Managed pooling and bounded capacity governance; provider behavior proven. |
| P08.19 | Seeding | Layered deterministic seeds separated by purpose/environment. |
| P08.20 | Testing | Real PostgreSQL integration tests beyond unit/contract tests. |
| P08.21 | Version lifecycle | Pin and govern Prisma/PostgreSQL/provider upgrades. |
| P08.22 | Migration release | Dedicated migration release pipeline and controlled identity. |
| P08.23 | Backup and recovery | Governed backups and tested restore/recovery. |
| P08.24 | Read replicas | Governed replicas with consistency and routing constraints. |
| P08.25 | Database roles | Least-privilege runtime, migration and administrative roles. |
| P08.26 | Retention and archival | Entity/classification-aware retention, archive and purge. |
| P08.27 | Encryption and keys | Layered encryption and governed key management/rotation. |
| P08.28 | Monitoring and alerting | Health, saturation, failure and integrity monitoring. |
| P08.29 | Partitioning | Selective partitioning only where measured workload justifies it. |
| P08.30 | Schema standards | Central standards with domain-owned model definitions. |
| P08.31 | Change impact | Governed schema/data-contract impact analysis. |
| P08.32 | Bootstrap | Layered deterministic environment/database bootstrap. |
| P08.33 | Environment isolation | Separate database and credentials per environment. |
| P08.34 | Disaster recovery | Layered DR plan with tested recovery objectives. |
| P08.35 | Maintenance | Govern vacuum, analyze, index and maintenance lifecycle. |
| P08.36 | Capacity planning | Evidence-based storage, compute, connection and growth planning. |
| P08.37 | Concurrency | Hybrid optimistic/pessimistic controls based on invariants. |
| P08.38 | Idempotency | Prevent duplicate effects with durable idempotency semantics. |
| P08.39 | Integrity | Layered DB constraints, application invariants and reconciliation. |
| P08.40 | Audit | Forensic traceability for critical data and operations. |
| P08.41 | Ownership and admin | Govern object ownership, grants and administrative privileges. |
| P08.42 | Benchmarking | Representative workload benchmarks and regression thresholds. |
| P08.43 | Threat modeling | Database threat modeling across identity, tenant, network and data boundaries. |
| P08.44 | Compliance evidence | Governed evidence for enabled compliance obligations. |
| P08.45 | Engineering gates | Automated quality/security/migration gates. |
| P08.46 | Documentation | Schema catalog, data dictionary and operational documentation. |
| P08.47 | Provider strategy | PostgreSQL-centric design with explicit provider dependencies/portability boundaries. |
| P08.48 | Technology lifecycle | Govern compatibility, support windows and upgrades. |
| P08.49 | Incident response | Database incident classification, response and learning. |
| P08.50 | Cost governance | Monitor database, storage, compute, egress and operations cost. |
| P08.51 | Exceptions | Approved, scoped, expiring governance exceptions. |
| P08.52 | Continuous improvement | Review operational evidence and evolve standards. |
| P08.53 | Multi-tenancy | Governed hybrid multi-tenancy with explicit trusted tenant scope. |
| P08.54 | Tenant provisioning | Governed tenant/database provisioning and lifecycle. |
| P08.55 | Data residency | Governed geographic placement and residency constraints when required. |
| P08.56 | Workload isolation | Tenant-aware workload isolation and noisy-neighbor controls. |
| P08.57 | Metering and quotas | Governed usage metering, quotas and enforcement. |
| P08.58 | Data portability | Governed tenant export, completeness, integrity and secure delivery. |
| P08.59 | Privacy requests | Verified privacy request intake, execution and evidence. |
| P08.60 | Bulk ingestion | Controlled import with staging, validation, idempotency and reconciliation. |
| P08.61 | Lineage | Data provenance and lineage for source, transformation and consumer. |
| P08.62 | Outbox and CDC | Transactional outbox/selective CDC where justified; no blanket broker mandate. |
| P08.63 | Temporal data | Explicit effective-time, transaction-time and history semantics where needed. |
| P08.64 | Data quality | Layered quality rules, monitoring and remediation ownership. |
| P08.65 | Classification | Governed data classification and handling requirements. |
| P08.66 | Non-production data | Masking/synthetic data and secret isolation. |
| P08.67 | Views | Govern views/materialized views, refresh, ownership and consistency. |
| P08.68 | Database code | Govern functions, procedures and triggers with review/versioning/tests. |
| P08.69 | Binary data | External object storage where appropriate; database retains governed metadata/references. |
| P08.70 | Search and projections | Govern search indexes/projections as non-authoritative derived data. |
| P08.71 | Data access contracts | Layered domain/application/API contracts; no persistence leakage. |
| P08.72 | Normalization | Normalize authoritative data; controlled measured denormalization. |
| P08.73 | Locale | Explicit multilingual, collation, timezone and locale-aware semantics. |
| P08.74 | Online evolution | Expand/contract and compatibility-aware online schema evolution. |
| P08.75 | Transaction boundary | Tenant-local ACID; cross-database work is a distributed workflow. |
| P08.76 | Tenant DB resolution | Governed runtime database resolution with verified identity/placement. |
| P08.77 | Database relocation | Staged relocation/cutover with consistency, routing and recovery proof. |
| P08.78 | HA control plane | Governed HA placement/control-plane metadata and cache behavior. |
| P08.79 | DB credentials | Per-database credential lifecycle, rotation, revocation and least privilege. |
| P08.80 | Pool isolation | Bounded per-database connection pool manager. |
| P08.81 | Fleet migrations | Governed wave-based database fleet migration and rollout. |
| P08.82 | Decommissioning | Governed database decommissioning and secure disposal. |
| P08.83 | Metadata catalog | Governed database metadata catalog with automated discovery. |
| P08.84 | Configuration | Governed configuration-as-code with controlled reconciliation. |
| P08.85 | Extensions | Governed PostgreSQL extension allowlist. |
| P08.86 | Network and TLS | Governed network access with TLS and provider-aware connectivity. |
| P08.87 | Authentication protocol | Governed hybrid database authentication and connection identity. |
| P08.88 | Failover | Provider-managed failover with application-controlled connection recovery. |
| P08.89 | Session context | Transaction-scoped session context with strict connection hygiene. |
| P08.90 | Query limits | Layered query execution limits and controlled cancellation. |
| P08.91 | Workload classes | Governed workload classes with priority and resource isolation. |
| P08.92 | Error semantics | Centralized database error taxonomy with domain-aware recovery. |
| P08.93 | Architecture closure | Risk-based technical validation with controlled Phase 0.3 exit criteria. |

This matrix records approved direction only. Provider behavior, versions, model/SQL details and operational thresholds require Phase 0.3 evidence. Advanced multi-database decisions do not change the initial one-database/ten-schema baseline.
