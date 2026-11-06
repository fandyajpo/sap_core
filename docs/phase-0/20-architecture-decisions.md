# Architecture Decision Register

Accepted decisions below mirror the skills repository's decision log and are not created anew by this document. **Accepted** means the baseline is selected, not tested. Open items must be resolved by the named owner before the relevant implementation is encoded. Do not edit the skills repository as part of this specification.

## Accepted baseline

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Start as one deployable modular monolith with explicit domain/module ownership and internal contracts. | Accepted (skills ADR-001) |
| ADR-002 | One database `sap_core`, PostgreSQL engine, ten schemas: `core`, `master_data`, `procurement`, `inventory`, `sales`, `finance`, `production`, `human_resources`, `integration`, `system`. | Accepted (skills ADR-002) |
| ADR-003 | Prisma Schema/Prisma ORM/Prisma Migrate are the model, server data-access and schema-evolution path; raw SQL is exceptional. | Accepted (skills ADR-003) |
| ADR-004 | Better Auth handles identity/session; CASL models application authorization; protected operations enforce server-side. | Accepted (skills ADR-004) |
| ADR-005 | External integrations, broker and synchronization are deferred; `integration` is reserved. | Accepted (skills ADR-005) |
| ADR-006 | TanStack Query owns server state; Zustand shared UI state; React local state; React Hook Form form state; URL shareable navigation state. | Accepted (skills ADR-006) |
| ADR-007 | Vite+ is not presumed to replace Next.js; concrete tasks require compatibility evidence. | Accepted (skills ADR-007) |
| ADR-008 | Posted finance history is immutable and corrected by reversal/adjustment; inventory uses traceable movements and reconciled balance projections. | Accepted (skills ADR-008) |

## Open decisions and owners

| ID | Decision required | Accountable owner(s) | Interim treatment / acceptance evidence |
|---|---|---|---|
| ADR-OPEN-01 | Pin Node, Next/React, Prisma CLI/client, Better Auth/adapter, CASL and remaining package versions as a single lockfile. | Engineering/platform owner | Candidate matrix only. Approve exact versions after install/build and provider test; reject Prisma 8 RC for baseline unless stable + adapter support is demonstrated. |
| ADR-OPEN-02 (historical; P02 owner-approved) | Canonical identity and Better Auth adapter mapping to `core.users`; employee identity remains separate. | Project owner; Security + platform/domain owners for implementation | Better Auth handles authentication/accounts/sessions; no second ERP login identity. Validate exact adapter model/field/ID mapping, Prisma placement, generated schema and migration in Phase 0.3. |
| ADR-OPEN-03 (historical; P05 strategy owner-approved) | Hybrid cross-schema FK/composite-FK/application-reference policy and company/plant consistency enforcement. | Project owner; Data governance + module owners for per-edge application | X06 is separately owner-approved: both Better Auth user FKs use `ON DELETE RESTRICT`; remaining in-scope edges still need recorded choices and all selections need technical tests. No blanket FK approval. |
| ADR-OPEN-04 (historical; closed by P06) | Chart-of-accounts ownership. The Phase 0 baseline/catalog listed `master_data`; Finance is the owner-approved authority under Phase 0.2 P06. | Finance + master-data product owners | Owner decision complete: Finance solely owns company-level CoAs and accounts; `master_data` does not duplicate them. Physical representation and technical validation remain in [P06 Phase 0.3](../phase-0.2/p06-phase-0.3-validation-backlog.md). |
| ADR-OPEN-05 | Prisma Postgres plan/engine major, pool/direct URLs, migration/runtime roles, secret mechanism, backup/restore objectives. | Platform/operations owner | Documentation says provider currently describes PostgreSQL 17 and pooled/direct paths; no live instance or plan selected. |
| ADR-OPEN-06 (historical; P03 initial policy owner-approved) | Initial organization/company/plant scope and membership policy; further legal, jurisdictional and fiscal details remain separate. | Project owner; Product + Finance/Operations owners for implementation | Single-company first; one ERP user belongs to one organization under the initial policy; plant access is explicitly assigned; roles may differ by company/plant. Do not enforce a permanent global identity constraint. Fiscal/legal rules remain open. |
| ADR-OPEN-07 | Session lifetime, freshness, revocation, MFA/step-up, email verification/recovery provider and abuse monitoring. | Product + security + operations | P10 remains proposed. Do not call email/recovery production-ready without delivery and failure tests. |
| ADR-OPEN-08 | Applicable accounting standards/policies, detailed chart taxonomy, tax, currency precision/rounding/FX, period close/reopen and jurisdictional posting rules. | Qualified finance/accounting + legal owners | P06 selects the architecture for classifications, configurable currencies and multi-standard readiness, but does not choose jurisdictional standards, rates/scales, tax treatment or detailed policy. Resolve applicable details before those workflows. |
| ADR-OPEN-09 | Inventory dimensions, negative-stock/reservation, UOM conversion, lot/serial/quality and valuation. | Operations + finance/product owners | No default stock policy; required before enforcing availability/valuation behavior. |
| ADR-OPEN-10 | Procurement/sales approvals, tolerances, pricing, returns/credits/backorders, billing trigger and revenue treatment. | Product + finance/operations owners | Examples remain illustrative; no thresholds/statuses chosen. |
| ADR-OPEN-11 | HR scope, jurisdiction, legal basis, retention/deletion, attendance/payroll formulas and export controls. | HR + privacy/legal owners | HR payroll entities remain candidates only; no compliance claim. |
| ADR-OPEN-12 | Document number scope and gap/reuse policy; audit/records retention and evidence access. | Product + finance/legal/operations | Sequence gaps are possible; no gapless promise or retention duration. |
| ADR-OPEN-13 | PDF renderer/viewer package and SheetJS edition/artifact/license policy. | Engineering + legal/product owners | Distinguish `@react-pdf/renderer` from `react-pdf`; verify official artifact, security and licensing. |
| ADR-OPEN-14 | Whether/where Vite+ is used alongside Next.js. | Engineering/platform owner | Keep native Next workflows unless a specific compatible task is proven and recorded. |

## Supersession

An accepted baseline changes only through an explicit decision that references the prior ADR, rationale, impact, owner approval and migration/rollout consequence. This historical Phase 0 register is superseded for the CoA ownership topic by owner-approved P06 in [Phase 0.2](../phase-0.2/p06-chart-of-accounts-decision-closure.md); the former `master_data` placement is retained as history, not current architecture. No live data migration is implied.


## Phase 0.1 reconciliation pointer

This Phase 0 register and its historical `Accepted`/`Open` labels are preserved, not reclassified. Later P02–P05 owner selections are recorded in the Phase 0.1 register: canonical identity, initial organization/company/plant policy, authorization architecture and hybrid per-relationship policy are selected, while adapter mapping, technical enforcement, individual P05 edge choices and tests remain pending. P06 explicitly owner-approves Finance as sole CoA owner and company-level scope, superseding the old placement. P07–P10 and applicable detailed policies retain their separate statuses. No P06 item is `TECHNICALLY_VALIDATED`; see [Phase 0.1 register](../phase-0.1/01-decision-register.md) and [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md). Phase 0.1 did not modify `sap_core_skills` or supersede its accepted ADRs.
