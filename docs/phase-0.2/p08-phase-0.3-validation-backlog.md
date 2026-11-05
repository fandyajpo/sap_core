# P08 Phase 0.3 Validation Backlog

**All entries are PENDING.** A design decision, documentation page or vendor feature statement is not a technical pass. Execute against the pinned Prisma/PostgreSQL/Prisma Postgres stack and retain exact commands, fixtures, artifacts and results.

| ID | Validation | Evidence and acceptance criteria | Priority |
|---|---|---|---|
| V01 | Ten-schema Prisma mapping | Disposable PoC declares all ten schemas and explicit model mappings; validate/generate succeeds and generated client includes intended models. | P0 |
| V02 | Cross-schema relations | Representative same/cross-schema relations validate; generated SQL matches approved P05 edge decisions. | P0 |
| V03 | Composite scope integrity | Test unique keys, selective composite FKs, company/plant consistency and delete actions; invalid cross-scope writes are rejected. | P0 |
| V04 | Better Auth canonical identity | Pinned adapter maps to core.users; no shadow ERP login identity; adapter migrations target intended schema. | P0 |
| V05 | Prisma client lifecycle | Exercise dev reload, production process lifecycle, graceful shutdown and concurrency; no uncontrolled client/pool proliferation. | P0 |
| V06 | Domain data-access boundaries | Test allowed repository contracts and deliberate forbidden cross-domain persistence imports/writes; violations are detectable. | P0 |
| V07 | Shared transaction boundary | Inject failures into representative cross-domain transaction; commit/rollback is atomic within one database only. | P0 |
| V08 | Native types and UUID defaults | Inspect generated SQL and round-trip UUID, numeric, timestamp and native types; precision/time semantics match contracts. | P0 |
| V09 | Empty-database migration | Apply complete initial migration to disposable empty PostgreSQL; all ten schemas, constraints and indexes match intent. | P0 |
| V10 | Upgrade migration | Upgrade a prior-version fixture with representative data; preserve data/integrity and repeat deterministically. | P0 |
| V11 | Drift detection | Deliberately introduce disposable DB drift; detect and reconcile through reviewed migration, never silent production mutation. | P1 |
| V12 | Raw SQL governance | Test parameterization, injection negatives, permissions and review trail; no unsafe interpolation. | P0 |
| V13 | Query performance | Capture representative query plans/latency on realistic data; critical paths meet agreed budgets. | P1 |
| V14 | Observability/redaction | Trigger slow query, constraint failure and pool saturation; diagnostics are useful without leaking secrets/sensitive payloads. | P1 |
| V15 | Authorization and selective RLS | Test authorized, unauthorized, revoked and cross-tenant paths through real server code and direct DB access; no scope leak. | P0 |
| V16 | Pooling and connection limits | Test actual provider endpoint/driver under concurrency and pressure; transaction/session semantics and bounds are proven. | P0 |
| V17 | Seed determinism | Repeat base/reference/fixture seeds on disposable DB; deterministic, ordered and environment-safe. | P1 |
| V18 | PostgreSQL test harness | Critical integration suite runs against supported PostgreSQL/provider path in CI, not SQLite/mock-only. | P0 |
| V19 | Backup and restore | Restore into isolated DB and verify data/constraints/reconciliation; measured RPO/RTO meets approved objectives. | P0 before production data |
| V20 | Read replica semantics | If enabled, test lag, stale reads and routing; writes always use authoritative primary. | Conditional |
| V21 | Roles and grants | Inspect runtime, migration, read-only, job and admin privileges; least privilege and separation are enforced. | P0 |
| V22 | Retention/archive/purge | Test lifecycle, legal hold and purge against P05/P07 and immutable finance/inventory facts. | P1 / scope-dependent |
| V23 | Encryption and key rotation | Verify TLS, provider encryption evidence and rotation process; no unapproved plaintext path. | P0 |
| V24 | Monitoring and capacity | Simulate saturation; verify health/alerts, maintenance signals and capacity thresholds/runbooks. | P1 |
| V25 | Concurrency/idempotency | Concurrent finance/inventory operations and duplicate replays preserve invariants and prevent double effects. | P0 |
| V26 | Integrity/reconciliation | Reconcile ledger, stock movement/balance and source/projection counts; mismatch is detectable and explainable. | P0 |
| V27 | Audit/privilege boundaries | Test privileged changes, service identity and break-glass; actor/initiator/context recorded and audit protected. | P0 |
| V28 | Workload benchmarks | Benchmark critical, interactive, background, bulk and analytical classes; measure contention and noisy-neighbor limits. | P1 |
| V29 | Threat model | Review tenant isolation, injection, credential theft, network exposure, backup leakage and privilege escalation; critical threats mitigated. | P0 |
| V30 | Engineering quality gates | CI runs format, schema validation, generation, migration diff, link and architecture checks; failures block release. | P0 |
| V31 | Provider capability boundary | Verify actual Prisma Postgres account endpoints, engine, pooling, TLS, failover and backup capabilities; rely only on proven behavior. | P0 |
| V32 | Incident/cost/exception governance | Exercise incident and exception runbooks; costs attributable; exception owner, controls and expiry actionable. | P1 |
| V33 | Upgrade compatibility | Upgrade pinned Prisma/PostgreSQL/provider versions in disposable environment and rerun critical suite; recovery plan exists. | P1 |
| V34 | Tenant provisioning/placement | If multi-database tenancy is activated, provision tenant and verify trusted identity/placement/scope end-to-end. | Conditional |
| V35 | Residency/workload isolation | If required, prove placement constraints, per-tenant limits and noisy-neighbor controls. | Conditional |
| V36 | Metering/quota/portability | Test usage attribution, quota enforcement and complete, protected, verifiable tenant export. | Conditional |
| V37 | Privacy workflow | Test verified request, retention exception, anonymization/deletion and audit evidence; legal hold respected. | Conditional |
| V38 | Bulk import/lineage | Import malformed, duplicate and valid fixtures; staging/idempotency prevent corruption and preserve provenance. | P1 |
| V39 | Classification/non-production | Verify data handling and masked/synthetic fixtures; sensitive production data/secrets do not leak. | P0 |
| V40 | Outbox/CDC | If used, test atomic write, duplicate delivery, ordering, replay and consumer recovery; no broker mandate assumed. | Conditional |
| V41 | Temporal/locale semantics | Test effective-time/history, timezone boundaries, multilingual text, collation and date/numeric round trips. | P1 |
| V42 | Views/functions/triggers | If introduced, test migration, ownership, grants, dependencies and recovery of versioned DB objects. | Conditional |
| V43 | Object metadata/search | If used, test object-reference integrity and projection rebuild; derived indexes remain non-authoritative. | Conditional |
| V44 | Data contracts/normalization | Review domain/API contracts and denormalized structures; duplicated data has owner, consistency and rebuild semantics. | P0 |
| V45 | Online schema evolution | Exercise expand/contract while old/new app versions overlap; no incompatible window or data loss. | P1 |
| V46 | Tenant DB resolution/relocation | If multi-DB is activated, test placement, relocation, cutover and reconciliation; no split-brain writer. | Conditional |
| V47 | Per-database pool isolation | Test many database targets and partial outages; pool count/connections bounded and failures isolated. | Conditional |
| V48 | Fleet migration waves | Simulate canary, wave, pause, retry and failed tenant DB migration; bounded blast radius and resumability. | Conditional |
| V49 | Decommission/secure disposal | Test export/retention approval, credential revocation, backup handling and disposal evidence; no premature deletion. | Conditional |
| V50 | Metadata/config/extensions | Compare discovered inventory/config/extensions with approved catalog; drift detected, only allowlisted extensions. | P1 / conditional |
| V51 | Network/auth/TLS identity | Test endpoint exposure, TLS verification, credential rotation and DB identity; wrong endpoint/tenant is rejected. | P0 |
| V52 | Failover/recovery | Simulate provider failover; invalidate stale connections, preserve authoritative primary and reconcile ambiguous outcomes. | P0 |
| V53 | Session context hygiene | Concurrent tenant contexts with commit, rollback, exception and pool reuse; no context leakage. | P0 |
| V54 | Query limits/cancellation | Exercise statement/lock/transaction timeout and client cancellation; work bounded and partial effects safe. | P0 |
| V55 | Workload class fairness | Load-test classes and competing tenants; admission/limits prevent noisy-neighbor exhaustion without bypassing integrity/auth. | P1 |
| V56 | Error taxonomy/recovery | Inject SQLSTATE, Prisma, driver, provider, timeout and ambiguous outcome; stable categories, safe retries and redaction. | P0 |
| V57 | Fleet control-plane resilience | If multi-DB is activated, test control-plane outage and stale placement cache; fail-safe routing and bounded staleness. | Conditional |
| V58 | Per-database credentials | Rotate/revoke tenant DB credentials during active/inactive workloads; isolation and revocation proven. | Conditional |
| V59 | Architecture governance | Deliberately violate schema ownership, model mapping, migration ownership and policy checks; automated controls detect violations. | P0 |
| V60 | Phase 0.3 exit review | Review in-scope P0 evidence, conditional scope, risks, owners and sign-offs; record explicit go/no-go. | P0 |

## Scope rules

- Initial baseline is one PostgreSQL database with ten schemas. Conditional fleet tests are not blockers unless multi-database tenancy is activated in the approved phase.
- P0 applies before the affected foundation or production use; it does not require building every future capability now.
- Provider-managed features must be proven on the actual account/endpoint and pinned toolchain.
- No row is passed by this backlog. Attach exact commands, schema/migration artifacts, fixtures, provider evidence and test results when executed.
