# P06 Traceability Matrix

**P06 state:** `DECISION_COMPLETE`; P06.1–P06.26 `OWNER_APPROVED`. Technical evidence is pending; no Phase 0.3 item below is marked passed. Links identify architecture context and future implementation/validation boundaries, not authorization to implement.

| Decision | Authoritative Phase 0 / Phase 0.1 references | Schemas / modules | P02–P10 relationship | Phase 0.3 validation | Future implementation areas |
|---|---|---|---|---|---|
| P06.1 | [P0 module ownership](../phase-0/04-module-ownership.md), [P0 schema ownership](../phase-0/08-schema-ownership-matrix.md), [P0.1 CoA proposal, superseded](../phase-0.1/06-chart-of-accounts-ownership.md) | `finance`; `master_data` excludes authoritative CoA | P05/P07/P08 | V01–V02 | Finance CoA/account domain and contract |
| P06.2 | [P0 ERD](../phase-0/10-entity-relationship-design.md), [P0.1 organization](../phase-0.1/03-organizational-model.md), [logical ERD](../phase-0.1/08-global-logical-erd.md) | `core`, `finance` | P03/P05/P07 | V03 | Company scope, primary chart selection, plant inheritance |
| P06.3 | [P0.1 entity ownership](../phase-0.1/07-entity-ownership-finalization.md), [dependency map](../phase-0.1/11-cross-schema-dependency-map.md) | `finance`, `core` | P03/P04/P07 | V02–V03 | Platform/org templates, copy/import provenance |
| P06.4 | [P0 integrity](../phase-0/12-database-integrity.md), [P0.1 relationship policy](../phase-0.1/05-cross-schema-relationship-policy.md) | `finance` | P04/P05/P07 | V04, V06 | Revisions, lifecycle and immutable journal references |
| P06.5 | [P0 entity catalog](../phase-0/09-entity-catalog.md), [P0.1 per-schema ERD](../phase-0.1/10-per-schema-erd.md) | `finance` | P04/P07/P12 | V05 | Classification taxonomy, company hierarchy and separate reporting map |
| P06.6 | [P0 business flows](../phase-0/16-business-transaction-flows.md), [P0.1 policy classification](../phase-0.1/12-erp-policy-classification.md) | `finance` | P04/P07/P10 | V08, V13 | Posting validation and versioned statement mappings |
| P06.7 | [P0 database standards](../phase-0/11-database-standards.md), [P0.1 policy classification](../phase-0.1/12-erp-policy-classification.md) | `finance`, `core` | P03/P04/P07/P12 | V14 | Amount semantics, restrictions, exchange-rate provenance |
| P06.8 | [P0 authorization](../phase-0/06-authorization-specification.md), [P0.1 authorization scope](../phase-0.1/04-authorization-scope-model.md) | `finance`, `core`, `system` | P02/P03/P04/P10 | V12 | Role grants, approvals, activation and audited decisions |
| P06.9 | [P0.1 logical ERD](../phase-0.1/08-global-logical-erd.md), [entity ownership](../phase-0.1/07-entity-ownership-finalization.md) | `finance` | P03/P07/P12 | V15 | Consolidation chart and effective mapping; separate processes |
| P06.10 | [P0.1 org model](../phase-0.1/03-organizational-model.md), [authorization scope](../phase-0.1/04-authorization-scope-model.md) | `finance`, `core` | P03/P04/P07 | V02, V11–V12 | Template scopes, visibility/distribution permissions |
| P06.11 | [P0.1 policy classification](../phase-0.1/12-erp-policy-classification.md), [decision register](../phase-0.1/01-decision-register.md) | `finance` | P07/P09/P12 | V08, V13 | Accounting-basis/policy and reporting-framework configuration |
| P06.12 | [P0 standards](../phase-0/11-database-standards.md), [P0 transaction architecture](../phase-0/15-transaction-architecture.md) | `finance` | P04/P07/P09/P10 | V02, V12 | Staged manual/template/file initialization; separate opening balance workflow |
| P06.13 | [P0 integrity](../phase-0/12-database-integrity.md), [P0.1 cross-schema policy](../phase-0.1/05-cross-schema-relationship-policy.md) | `finance`, `core` | P03–P05/P08 | V03–V10, V17 | Constraints, domain validation, reconciliation and exception handling |
| P06.14 | [P0 transaction architecture](../phase-0/15-transaction-architecture.md), [P0.1 Phase 1 gates](../phase-0.1/14-phase-1-implementation-gates.md) | `finance`, `core` | P03/P04/P07/P10/P12 | V08, V12 | Readiness evaluation and blocker reporting |
| P06.15 | [P0 integrity](../phase-0/12-database-integrity.md), [P0.1 physical ERD](../phase-0.1/09-global-physical-erd.md) | `finance` | P04/P05/P07/P08 | V04, V06–V07 | Version transition and stable journal account identity |
| P06.16 | [P0.1 entity ownership](../phase-0.1/07-entity-ownership-finalization.md), [P0 database standards](../phase-0/11-database-standards.md) | `finance`, `system` | P04/P07/P10/P12 | V13, V17 | Report run/snapshot, artifacts, revision lineage and access |
| P06.17 | [P0 migration strategy](../phase-0/14-prisma-migration-strategy.md), [P0.1 ERDs](../phase-0.1/10-per-schema-erd.md) | `finance`, `core` | P03–P05/P07/P10/P12 | V06, V08, V17 | Separate CoA/version/company lifecycle transitions |
| P06.18 | [P0 integrity](../phase-0/12-database-integrity.md), [P0.1 policy classification](../phase-0.1/12-erp-policy-classification.md) | `finance`, `system` | P04/P07/P10/P12 | V17–V19 | Category retention, archives, legal holds and controlled deletion |
| P06.19 | [P0 authz](../phase-0/06-authorization-specification.md), [P0.1 authz](../phase-0.1/04-authorization-scope-model.md) | `core`, `finance`, `system` | P02–P05/P10 | V11–V12 | Scoped Finance permissions, export and privileged action audit |
| P06.20 | [P0 architecture](../phase-0/03-application-architecture.md), [module contracts](../phase-0/04-module-ownership.md), [P0.1 dependency map](../phase-0.1/11-cross-schema-dependency-map.md) | Finance + consumer modules | P04/P05/P07–P09 | V16 | Application contracts, controlled read models and conditional outbox |
| P06.21 | [P0 integrity](../phase-0/12-database-integrity.md), [P0 transaction architecture](../phase-0/15-transaction-architecture.md) | All affected modules | P02–P10 | V03–V16, V19–V22 | Layered tests, properties, races and historical replay |
| P06.22 | [P0 standards](../phase-0/11-database-standards.md), [P0 Prisma](../phase-0/13-prisma-architecture.md) | `finance`, `core` | P03/P05/P08/P09 | V20 | Workload-specific queries, indexes, pools and reporting strategy |
| P06.23 | [P0.1 entity ownership](../phase-0.1/07-entity-ownership-finalization.md), [P0 integrity](../phase-0/12-database-integrity.md) | `finance`, `system` | P04/P07/P10/P12 | V17 | Distinct observability, audit, exception and incident records |
| P06.24 | [P0 database architecture](../phase-0/07-database-architecture.md), [P0 migration strategy](../phase-0/14-prisma-migration-strategy.md) | `finance`, `system` / provider operations | P05/P08/P10 | V18–V19 | Managed backup/PITR, restore tests and artifact recovery |
| P06.25 | [P0.1 policy classification](../phase-0.1/12-erp-policy-classification.md), [P06 closure](p06-chart-of-accounts-decision-closure.md) | `finance`, `system` | P07/P09/P12 | V08, V13, V17 | Jurisdiction-specific rule/policy lifecycle when selected |
| P06.26 | [P0 application architecture](../phase-0/03-application-architecture.md), [P0.1 authorization](../phase-0.1/04-authorization-scope-model.md) | `finance`, `core` | P04/P09/P10 | V12, V22 | Permission-aware administration UX and operational workflows |

## Reconciliation rules

- Phase 0's old `master_data` CoA location is historical only; the owner-approved Phase 0.2 decision is authoritative.
- Phase 0.1's finance-ownership recommendation is upgraded to owner-approved; its other P02–P10 decisions retain their prior statuses.
- P05 governs any physical relation, company-key strategy and delete action. P06 fixes ownership/consumer boundaries but does not approve an untested FK or concrete database layout.
- Company/plant authorization, identity, session handling and role/SoD semantics continue to use P02–P04/P10.
- The exact ten schemas and reserved `integration` namespace do not change.
