# Phase 0.1 Decision Register

**Decision status rule:** The status describes the decision, not whether a document exists. `VALIDATED` requires reproducible test evidence; no technical decision currently meets that bar.

## Register

| ID | Decision | Status | Accountable owner(s) | Required evidence / next action |
|---|---|---|---|---|
| P01 | Modular monolith; one PostgreSQL database and the ten Phase 0 schemas; Next.js; Prisma ORM and Prisma Migrate remain the requested architecture. | `APPROVED` | Owner / product sponsor | Explicit scope directive in the Phase 0.1 request. This is not a compatibility test. |
| P02 | One canonical authentication principal: map Better Auth's user persistence to the conceptual `core.users`; do not create a second independent ERP login identity. Keep employee records separate. | `PROPOSED` | Security, platform and core-domain owners | Approve principal/table ownership and field mapping; prove adapter mapping, generated client and migration in a disposable PostgreSQL test. |
| P03 | Organization → company → plant hierarchy and distinct organization/company/plant memberships, with selected context treated only as a hint. | `PROPOSED` | Product, finance and operations owners | Confirm business/legal meaning, cardinality, membership inheritance and company/plant consistency. |
| P04 | CASL evaluates business permissions from active membership, explicit scope and target resource; Better Auth roles and active-organization state do not grant ERP permissions. | `PROPOSED` | Security and product owners | Approve role/scope/inheritance model and test direct server operations, list filtering, revocation and cross-company isolation. |
| P05 | Per-edge FK/composite-FK/application-reference policy in [05](05-cross-schema-relationship-policy.md). | `PROPOSED` | Data governance and module owners | Approve each listed edge and delete behavior; validate Prisma/PostgreSQL migration and consistency tests. No global ban or blanket permission is selected. |
| P06 | Finance sole owner of company-level CoA, account identities and governed lifecycle; platform/organization templates initialize independent company charts; separate consolidation/reporting mappings. | `OWNER_APPROVED` in Phase 0.2 (this register's historical `PROPOSED` status is superseded) | Project owner selected P06.1–P06.26; named approver/date not supplied | See [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md); technical validation remains pending [V01–V22](../phase-0.2/p06-phase-0.3-validation-backlog.md). |
| P07 | Entity ownership map in [07](07-entity-ownership-finalization.md), including reserved `integration`. | `PROPOSED` | Product and all module owners | Approve entity scope, lifecycle, identifiers, legal company/plant scope and module contracts. |
| P08 | Prisma multi-schema approach: one governed Prisma model set across ten schemas, each model explicitly mapped to its owner schema; cross-schema relations remain per-edge decisions. | `PROPOSED` | Platform/data owners | Pin ORM major and validate all ten schemas, generated client, cross-schema relations, migrations and provider behavior. Official docs establish feature support in principle only. |
| P09 | Exact package/runtime set. The proposed validation target is documented in [13](13-technology-compatibility-resolution.md); registry observations are not a lockfile. | `PROPOSED` | Engineering/platform owner | Select versions, resolve the exact lockfile, build/test Next.js and validate adapter, native modules, Storybook and deployment. |
| P10 | Minimum session revocation, account disablement and fresh-session behavior before protected ERP operations are implemented. | `PROPOSED` | Security and platform owners | Approve semantics and revocation latency; test disablement, existing sessions and sensitive operations. No duration or MFA rule is supplied here. |
| P11 | Platform policy remains distinct from module and jurisdiction policy, as classified in [12](12-erp-policy-classification.md). | `APPROVED` | Owner / product sponsor | Explicit task constraint: do not invent jurisdiction-specific policy; defer unrelated module-specific decisions. |
| P12 | Unselected jurisdiction/legal retention, tax, payroll, accounting-standard, valuation and fiscal rules. | `DEFERRED` | Relevant qualified business, legal and privacy owners | Reopen before the affected module or jurisdiction is enabled; no defaults are authorized. |
| P13 | Vite+ use, exact PDF package/feature, SheetJS edition/artifact, and Storybook/Next integration. | `DEFERRED` | Engineering, product and legal owners | Decide only for a concrete feature after current peer/licensing/deployment review and a pinned-stack test. |

## Approval and validation record

No named approver, dated approval artifact or reproducible application/database test was supplied for P02–P05, P07–P10 or P12–P13. P06 is the explicit exception: the project owner selected P06.1–P06.26 in the Phase 0.2 decision discussion, recorded as `OWNER_APPROVED` there; no person/date is fabricated. P06 remains not `TECHNICALLY_VALIDATED`. Other decisions retain their prior `PROPOSED`/`DEFERRED` statuses. Package metadata and official documentation do not establish technical validation.

## Supersession and history

Phase 0's historical `Accepted` baseline rows are not relabeled. P01 records the specified platform baseline; P02–P05 and P07–P10 remain separate proposals, while P06 is superseded by the explicit owner-approved Phase 0.2 closure and its traceability record. The closure identifies the historical CoA placement, consequences, schemas/contracts and technical backlog. No skills-repository decision or file is silently changed; any eventual data migration needs a separate evidence-based plan.
