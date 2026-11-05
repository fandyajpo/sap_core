# P06 — Chart of Accounts Architecture Decision Closure

**Decision stream:** P06 — Chart of Accounts architecture  
**Decision status:** `DECISION_COMPLETE`  
**Owner selection status:** P06.1–P06.26 are `OWNER_APPROVED` and `DOCUMENTED`.  
**Technical status:** Not `TECHNICALLY_VALIDATED`; Phase 0.3 evidence is pending.  
**Implementation status:** Not `IMPLEMENTATION_READY`. This is architecture documentation, not implementation authorization.

## 1. Purpose, scope and governing context

This record closes the CoA decision stream after the project owner selected options for all 26 questions. It supersedes earlier Phase 0 and Phase 0.1 CoA placement proposals where they conflict with these choices. It does not rewrite the historical record or claim database, product, legal or technical validation.

SAP Core remains a modular monolith using one PostgreSQL database (`sap_core`) and exactly ten schemas: `core`, `master_data`, `procurement`, `inventory`, `sales`, `finance`, `production`, `human_resources`, `integration`, and `system`. The CoA is owned by the `finance` module/schema. Finance consumes the shared identity, organization, authorization and relationship architecture; it does not create its own authentication, tenant or permission model. External integrations, brokers and microservices are not introduced.

### Status meanings

- `OWNER_APPROVED`: the project owner selected the decision option; this records governance approval only.
- `DOCUMENTED`: the selected architecture is recorded and reconciled across the named documents.
- `TECHNICALLY_VALIDATED`: reproducible evidence against pinned tools and a disposable PostgreSQL environment exists. None of P06 is at this status yet.
- `IMPLEMENTATION_READY`: applicable owner decisions and validation gates are satisfied for an explicitly scoped implementation. P06 does not meet this status.
- `DEFERRED`: a distinct policy or feature is intentionally outside the current scope; it must be reopened before enablement.
- `BLOCKED`: a technical or owner dependency prevents the affected implementation.

## 2. Owner decision record

The source is the explicit project-owner selection of all 26 options in the P06 architecture decision discussion supplied with this task. The individual approver's name and a dated approval artifact were not provided; neither is invented here. The selections are recorded as `OWNER_APPROVED`. This is not evidence that the selected design has been implemented, legally reviewed, tested or validated.

## 3. Decisions

Each entry records the selected option, rationale, consequences and implementation constraints. Requirements below are governing architecture; data types, table/column layout, indexes and exact enforcement mechanisms remain for Phase 0.3 unless explicitly decided here.

### A. Ownership, scope and structure

#### P06.1 — CoA ownership — **Option B: Finance owns CoA**

**Decision:** `finance` is the sole owner of CoA definitions, account identity and account records, classification, hierarchy, lifecycle and governance. Do not duplicate authoritative account definitions in `master_data`. Other modules consume Finance-published contracts/read models and cannot mutate Finance-owned records.

**Rationale and consequences:** accounting meaning, posting eligibility and historical use belong with Finance's posting rules. This corrects the historical Phase 0 catalog placement; it is an explicit supersession, not a second owner or a transfer of Finance authority to master data. A physical move/backfill is not authorized or assumed to exist.

#### P06.2 — CoA scope — **Option C: Company-level CoA**

**Decision:** a company owns its CoA; it has one active primary CoA for posting in the relevant period. Plants use their company's CoA and cannot own an independent CoA. Company account data is isolated. Consolidation is handled by separate mappings, not shared company accounts.

**Rationale and consequences:** company is the selected accounting ownership boundary. The active-primary-per-period invariant must be enforced without assuming a boolean or a specific table/constraint. The exact period key and interaction with P03 company semantics require Phase 0.3 validation.

#### P06.3 — Sharing and reuse — **Option C: Company-owned CoA plus reusable templates**

**Decision:** support platform templates and organization templates as initialization sources. Applying/importing a template creates independent company-owned accounts. Templates are never posting sources; subsequent template changes do not propagate automatically. Preserve template source and version provenance for each initialization.

**Rationale and consequences:** reuse is separated from operating ownership, posting and tenant access. Template ownership, visibility and distribution rights remain distinct; no template makes a company account shared. Exact persistence representation is not specified here.

### B. Lifecycle, classification and financial rules

#### P06.4 — Lifecycle and immutability — **Option C: Immutable financial identity with controlled lifecycle**

**Decision:** internal account ID and company ownership are immutable. Code and name can change only through controlled operations; classification changes require stricter governance. Used accounts cannot be deleted. Deactivation/reactivation is controlled. Preserve historical account-attribute revisions, prevent overlapping effective-date periods, and never mutate historical journal lines.

**Rationale and consequences:** immutable identity plus revision history supports traceability while allowing governed correction. Effective-dating, uniqueness and concurrency enforcement are technical validation items; no revision columns or exclusion constraint are prescribed.

#### P06.5 — Classification and hierarchy — **Option C: Standard classification with custom hierarchy**

**Decision:** provide fundamental Asset, Liability, Equity, Revenue and Expense classifications without treating that list as exhaustive. Each company controls its hierarchy. Account hierarchy is distinct from reporting mapping. Normal balance, account type, posting eligibility, reconciliation behavior and statement mapping are distinct attributes.

**Rationale and consequences:** baseline categories aid consistent financial controls without imposing a jurisdiction's complete chart. Acyclicity, allowed parent-child relations and attribute semantics need owner/domain examples and technical tests before implementation.

#### P06.6 — Posting rules and financial-reporting mapping — **Option C: Configurable posting rules and versioned mapping**

**Decision:** Finance validates posting server-side. Non-postable group accounts cannot be posted to; required subledger control-account rules are validated. Financial-reporting mappings are company-scoped, versioned and effective-dated. Historical reports retain the mapping version. Transaction-posting validation and financial-statement presentation are separate processes.

**Rationale and consequences:** account selection/posting eligibility is authoritative Finance domain behavior; report presentation is reproducible, separately governed configuration. Exact control-account rules, statement taxonomy and effective-date data representation remain unselected.

#### P06.7 — Multi-currency and account currency restrictions — **Option C: Multi-currency with configurable restrictions**

**Decision:** each company has a functional currency. Preserve transaction-currency and functional-currency amounts separately. Support configurable account-level currency restrictions and track exchange-rate source, date and history. Realized/unrealized FX and revaluation remain separate Finance processes. Plants follow company currency policy. Reporting currency is a separate concept.

**Rationale and consequences:** distinct currency meanings prevent a display/reporting currency from changing posting amounts. Currency precision, rate source authority, rounding, revaluation and jurisdiction policy are not chosen by this decision and require qualified Finance review before the affected workflow.

#### P06.8 — Governance and change approval — **Option C: Role-based governance with approval workflow**

**Decision:** Finance Operator drafts; Finance Reviewer reviews; Finance Manager approves critical changes. Company Admin may administer access but is not automatically a Finance approver. A creator cannot approve their own critical change. Apply risk-based workflows; approval and activation are distinct lifecycle steps. Record actor, timestamp, reason and effective date.

**Rationale and consequences:** maker-checker separation protects financially sensitive changes. Roles are Finance-domain permissions implemented through P04's shared identity/authorization model, not a duplicate role system. Exact risk classification and approval quorum require P04 alignment.

#### P06.9 — Consolidation and intercompany mapping — **Option C: Separate consolidation account mapping**

**Decision:** company CoAs remain independent. Maintain a separate consolidation chart and versioned, effective-dated mappings. Detect unmapped accounts and preserve original journals. Intercompany elimination, currency translation and consolidation adjustments are distinct processes. Govern consolidation scope explicitly.

**Rationale and consequences:** reporting alignment must not merge company account ownership or rewrite source ledgers. Consolidation does not authorize intercompany posting or choose a consolidation perimeter, elimination policy or translation rule.

#### P06.10 — Template governance — **Option C: Layered template governance**

**Decision:** distinguish platform templates, organization templates and company-owned CoAs, including ownership, visibility and distribution rights. Organization templates remain organization-scoped. Platform Admin does not automatically gain access to tenant financial transactions. Template governance cannot bypass P04 segregation of duties.

**Rationale and consequences:** reusable definitions are not tenant financial data and must not imply tenant access. Template permissions and approval use shared authorization, and organization visibility is verified against P03/P04. No schema or tenant override is introduced.

#### P06.11 — Localization and accounting standards — **Option C: Configurable multi-standard accounting framework**

**Decision:** distinguish jurisdiction, accounting standard, accounting policy, reporting framework, account mapping and accounting adjustments. Each company has a primary accounting basis; additional reporting bases may be supported when required. Readiness for multiple standards does not commit Phase 1 to implement all standards. Recognition/measurement differences require suitable adjustments or parallel accounting, not account mapping alone.

**Rationale and consequences:** separates accounting facts and policy from presentation mappings. The applicable standard, primary basis, legal jurisdiction and treatment are company-specific owner/legal decisions; none is invented here.

### C. Initialization, integrity and historical data

#### P06.12 — Initial data and migration — **Option C: Multiple initialization paths**

**Decision:** allow platform template, organization template, manual account creation and CSV/Excel import. Every path uses staging, validation, review, approval and activation. Import supports idempotency, batch identity and row-level errors. Initial CoA setup is distinct from opening-balance migration; opening balances require separate reconciliation and approval.

**Rationale and consequences:** one controlled activation boundary applies regardless of source. Importing accounts does not import or approve opening balances. File format details, batch storage and import infrastructure remain implementation decisions.

#### P06.13 — Validation, reconciliation and integrity controls — **Option C: Layered integrity and reconciliation controls**

**Decision:** use PostgreSQL constraints, Prisma/application validation, Finance posting validation, periodic reconciliation, audit and exception monitoring. Enforce company/CoA-scoped account-code uniqueness, immutable account IDs, acyclic hierarchy, valid parent-child relations, classification/posting eligibility, company/account/currency/fiscal-period consistency and debit-equals-credit. Reconciliation exceptions are traceable and handled idempotently. Synchronous transaction checks are distinct from periodic jobs.

**Rationale and consequences:** each invariant is enforced at the strongest viable layer, with reconciliation for cross-row/system facts. Exact FK, constraint, hierarchy, lock, numeric and retry strategy needs reproducible tests; do not presume a normal row CHECK can prove an aggregate journal balance.

#### P06.14 — Activation, fiscal period and posting readiness — **Option C: Full financial posting readiness**

**Decision:** CoA activation is separate from posting readiness. Readiness evaluates an active, validated CoA; accounting standard and policy; fiscal year and periods; open posting period; required account mappings; completed opening balances or an explicitly approved exemption; and Finance authorization/approval. Do not make one boolean the sole truth; expose blockers. A new company may explicitly declare opening balances not required, subject to approval.

**Rationale and consequences:** a structurally active chart is not sufficient evidence that posting is safe. Readiness is a set of explainable, re-evaluated prerequisites; fiscal semantics remain an external owner dependency.

#### P06.15 — CoA change, replacement and version transition — **Option C: Versioned CoA with controlled transition**

**Decision:** account identity is immutable and account code is not a primary key. Structural changes may create a new CoA version; attribute changes use revision history where appropriate. Preserve old versions, control effective dates and prevent overlapping active versions. Transition requires mapping, impact analysis, approval and activation. Never rewrite historical journals. Preserve account ID when the semantic account remains the same; distinguish account identity from CoA version identity.

**Rationale and consequences:** stable account identity preserves journal references while versions model structure and time. Exact version boundaries, continuity rules and migration mechanics require validation; no version tables or columns are declared here.

#### P06.16 — Historical reporting and audit reproducibility — **Option C: Versioned reporting with immutable report snapshots**

**Decision:** preserve the CoA version, account-mapping version, accounting-policy version, reporting-framework version, fiscal period, parameters and data/posting cutoff used by a report. Record Report Run ID, company/scope, generated time, actor, status, artifact reference, integrity hash and revision link. Official reports are immutable; revisions create linked new snapshots. Distinguish draft, internal, official financial statement, restated statement and audit copy. Reproducibility needs source data, cutoff and calculation rules, not configuration snapshots alone; hashes alone do not guarantee immutability.

**Rationale and consequences:** auditable historical output is a controlled artifact with provenance, not a rerunnable query whose source/configuration may change. Artifact storage, access, retention, hash/signature and source-data retention are Phase 0.3/qualified-policy questions.

### D. Retirement, retention and security

#### P06.17 — Deactivation, retirement and company closure — **Option C: Full lifecycle governance**

**Decision:** CoA lifecycle is Draft → Active → Inactive → Retired; CoA Version is Draft → Approved → Active → Superseded → Archived; Company is Active → Restricted → Closing → Closed. Deactivation stops new operational posting without deleting history. Retirement requires reason, validation, approval, replacement/mapping/transition plan and outstanding-transaction checks. Company closure requires financial close, AP/AR/inventory obligations addressed, final statements and historical read-only access. Merger, dissolution and liquidation are separate processes. Do not reuse one generic lifecycle blindly.

**Rationale and consequences:** lifecycle names distinguish chart governance, version selection and company operations. Exact transitions and applicable close rules need owners; the sequences do not constitute legal status or supply missing jurisdiction rules.

#### P06.18 — Data retention, archival and legal hold — **Option C: Governed retention, archival and legal hold**

**Decision:** retention is category-specific for posted journals, CoA revisions, reports, approvals, audit logs, opening balances and reconciliation results. Record retention rule, period, jurisdiction basis, start date, archive/deletion eligibility and approvals. Archive preserves metadata, relationships, source, integrity verification, access logs and retrieval. Legal holds record case/reference, scope, reason, authorized owner and full lifecycle. Permanent deletion requires expired retention, no active hold, dependency checks, approval and audit. Closed companies retain authorized historical read-only access.

**Rationale and consequences:** no universal duration or legal basis is assumed. Qualified jurisdiction/privacy/legal owners must define each applicable schedule before production deletion or archival is enabled.

#### P06.19 — Security and sensitive financial configuration — **Option C: Layered financial security and governance**

**Decision:** reuse P04. Better Auth owns identity/session; `core` owns memberships and role assignments; CASL evaluates application permissions; PostgreSQL enforces data integrity. Permission decisions include role, organization/company/plant scope, action, sensitivity, segregation of duties, approval and audit. Candidate Finance permissions are `finance.coa.view`, `.create`, `.update`, `.review`, `.approve`, `.activate`, `.export` and `.retire`. Export is separately authorized and audited. Company Admin is not automatically a Finance approver; Platform Admin has no automatic tenant-financial-data access.

**Rationale and consequences:** Finance consumes shared identity and authorization rather than maintaining a parallel security plane. Exact grants, scopes and server enforcement depend on P02–P04; permission names are architectural candidates, not implemented policies.

### E. Contracts, quality and scalability

#### P06.20 — API contracts, domain events and cross-module consumption — **Option C: Hybrid domain contracts and controlled read models**

**Decision:** Finance remains sole CoA owner; no other module directly mutates Finance tables. Finance provides application contracts such as `getAccount`, `resolveAccount`, `validateAccount`, `validatePostingEligibility` and `getAccountMetadata`. Controlled read models may support search/display; authoritative posting validation uses Finance domain logic. Domain events carry identity, schema version, timestamp, company scope and correlation ID. Candidate events: `CoACreated`, `CoAActivated`, `CoAUpdated`, `CoAVersionActivated`, `AccountCreated`, `AccountDeactivated`, `AccountClassificationChanged`, `AccountMappingChanged`. Use a transactional outbox only where database-transaction/delivery consistency requires it. In-process contracts/events suffice for the modular monolith; no broker or microservice is required in Phase 1.

**Rationale and consequences:** contracts protect ownership; read models optimize controlled queries without becoming a write path. Event names are candidates; payload schemas, publication guarantees and outbox use need implementation-specific validation.

#### P06.21 — Testing strategy and financial invariants — **Option C: Financial assurance testing**

**Decision:** require unit, integration, database-integrity, financial-invariant, property-based, authorization/tenant-isolation, concurrency/transaction and historical-reproducibility tests. Invariants include debit equals credit; non-postable accounts are rejected; company/account references are consistent; posted journals are immutable; closed periods reject normal posting; CoA transitions preserve historical references; required mappings exist; and opening balances reconcile. Exercise concurrent CoA activation, account deactivation versus posting, posting versus period close, and configuration updates versus transactions. Playwright covers browser E2E, not database/financial invariant proof.

**Rationale and consequences:** financial correctness needs tests at every enforcement layer and under races. The property-testing library and concrete fixtures are not selected; the backlog requires compatibility evidence before adoption.

#### P06.22 — Performance, scalability and query strategy — **Option C: Scalable financial data architecture**

**Decision:** use workload-aware indexes, efficient account/hierarchy queries, cursor pagination, company-scope predicates, N+1/over-fetch prevention and a dedicated reporting-query strategy. Add pre-aggregation/materialized views only when measured workloads justify them. Design for partitioning readiness without requiring immediate partitioning. Consider PostgreSQL FK/unique/retention behavior, Prisma compatibility and connection pooling; keep posting transactions short and retries safe/idempotent. Baseline lookup, hierarchy, validation, posting, trial balance, historical reporting and reconciliation. Numeric targets remain open until realistic workloads are defined.

**Rationale and consequences:** optimize against actual workload evidence without speculative infrastructure or numeric claims. Partitioning and materialized views are not implementation requirements absent measurements.

### F. Reliability, compliance and administration

#### P06.23 — Operational observability and incident management — **Option C: Financial operational observability and incident governance**

**Decision:** provide structured logs, metrics, tracing readiness, correlation/request IDs, business-process monitoring, financial-exception tracking, incident lifecycle/severity, alerting/escalation, security-event monitoring, recovery verification, dashboards and incident history. Keep application logs, audit records, financial exceptions and incident records distinct.

**Rationale and consequences:** operational diagnostics, legal/audit evidence and unresolved financial exceptions have different ownership, access, retention and lifecycle. Do not collapse them into one generic table or infer a storage schema.

#### P06.24 — Backup, disaster recovery and financial restoration — **Option C: Financial disaster recovery and integrity assurance**

**Decision:** use managed database backups and PITR where supported; define RPO/RTO; verify financial integrity and transaction consistency after restore; recover background jobs idempotently; exercise restores and DR; maintain a recovery audit trail and approval. Do not assume DB backup includes externally stored report artifacts. Do not build custom backup infrastructure in Phase 1 without demonstrated need. Technically verify actual Prisma Postgres capabilities and plan limitations.

**Rationale and consequences:** a successful database restore alone does not prove financial or artifact consistency. Provider capabilities, plan, RPO/RTO and artifact recovery remain technical/operations validations, not claims in this approval.

#### P06.25 — Compliance, regulatory readiness and jurisdictional accounting — **Option C: Governed multi-jurisdiction compliance architecture**

**Decision:** distinguish jurisdiction, accounting standard, accounting policy, tax regulation, reporting framework, reporting requirement and compliance rule. Regulatory lifecycle is Identified → Assessed → Drafted → Reviewed → Approved → Scheduled → Effective → Superseded. Use effective-dated rules, impact assessment, versioned accounting policies/reporting requirements, compliance validation/exception management, regulatory source evidence and audit traceability. Multi-jurisdiction readiness does not mean implementing every country's rules in Phase 1.

**Rationale and consequences:** governance can support jurisdictional change without inventing a jurisdiction's legal treatment. Each enabled jurisdiction/rule needs qualified owners and source evidence.

#### P06.26 — CoA administration, configuration UX and operations — **Option C: Enterprise CoA administration and controlled operations**

**Decision:** provide a hierarchical account explorer, staged/validated bulk operations, CoA version comparison, impact analysis, dry-run/preview activation, maker-checker workflow, controlled activation/correction, exception handling, complete change history and accessible, responsive, permission-aware UI. Use the existing frontend stack where appropriate; do not introduce an unrequested component library.

**Rationale and consequences:** the administration surface must expose controlled change and its impact rather than bypass governance. This is a future UX scope; no UI, API or Finance workflow is implemented by this document.

## 4. Dependencies and cross-boundaries

P06 consumes, and does not replace, the shared decisions:

| Dependency | P06 relationship |
|---|---|
| P02 — Better Auth identity and `core.users` | Owner-approved: Better Auth handles authentication/accounts/sessions and `core.users` is the canonical ERP identity. Adapter/Prisma mapping, generated schema and migration validation remain pending; no Finance login identity. |
| P03 — organization/company/plant and memberships | Owner-approved initial single-company, one-organization-per-user operating policy, explicit plant assignment and scoped roles. Technical constraints/history and consistency tests remain pending; P06 does not create another tenant hierarchy. |
| P04 — hybrid authorization, role scope, SoD, break-glass and service identities | Owner-approved shared authorization architecture supplies permissions and maker-checker controls. Detailed grants, enforcement and tests remain pending; P06 does not create an independent authorization engine. |
| P05 — cross-schema FK, composite keys, lifecycle and reference strategy | Owner-approved hybrid per-relationship policy governs Finance→Core company references and consumer enforcement. Individual in-scope edge choices, migrations and tests remain pending; P06 does not approve blanket FKs. |
| P07 — entity ownership | Must incorporate Finance-owned CoA, version/revision, template, reporting and consolidation responsibilities without inventing physical tables. |
| P08 — Prisma multi-schema | Must map any eventual CoA/account models to `finance`; generated schema and migrations remain unvalidated. |
| P09 — exact technology set | Provides pinned tools for validation. P06 does not select packages or versions. |
| P10 — session revocation/freshness | Affects sensitive approval, activation, export and retirement operations; remains a separate gate. |

Other modules may request account data, account eligibility or accounting effects through Finance-owned contracts/controlled read models. They may not write Finance tables. Finance may read owner-approved source facts for accounting effects, preserving source identity and idempotency. Company CoAs, organization templates, platform templates and consolidation mappings are separate concepts. Consolidation mappings never convert a company CoA into a shared chart.

## 5. Technical validation and implementation constraints

The Phase 0.3 backlog [records 22 validation tasks](p06-phase-0.3-validation-backlog.md). No task is `TECHNICALLY_VALIDATED` now. Validate only against pinned Prisma/PostgreSQL and application versions with reproducible schema, migration, database, concurrency, authorization and workload evidence. Retain exact commands/fixtures, reviewer, environment and results.

Until then:

- Do not author or apply Prisma models/migrations from the diagrams; do not infer columns, indexes, FKs, exclusion constraints or transition triggers from this decision.
- Do not move live data: this repository has no database/schema to migrate. If a future implementation contains legacy CoA records, prepare a separately reviewed migration/backfill/reconciliation/rollback plan.
- Do not rewrite posted journals; preserve immutable account identity and historical report lineage.
- Do not claim a CoA is posting-ready solely because it is active. Evaluate and expose the P06.14 blockers.
- Do not use a template, controlled read model, or consolidation chart as an account posting authority for a company.
- Do not implement accounting standards, jurisdictional rules, tax or retention durations without qualified decisions.
- Do not introduce a broker, microservice, new component library or custom backup system under P06.

## 6. Closure status

**P06 `DECISION_COMPLETE`.** All 26 selected options are `OWNER_APPROVED` and recorded in the decision matrix and traceability matrix. Earlier proposals for `master_data` ownership, shared charts, unversioned account structures, or conditional Finance ownership are superseded where inconsistent. P06 technical validation is pending Phase 0.3; P06 is not `IMPLEMENTATION_READY`. P02–P05 are separately `OWNER_APPROVED`, but their applicable technical mapping/enforcement evidence and per-edge P05 choices remain pending. P07–P10 and applicable finance/jurisdiction decisions remain open. Phase 0.3 validation remains pending; Phase 0.2 as a whole remains open and Phase 1 is not ready.

See [decision matrix](p06-decision-matrix.md), [traceability matrix](p06-traceability-matrix.md), [Phase 0.3 validation backlog](p06-phase-0.3-validation-backlog.md) and [closure report](p06-closure-report.md).