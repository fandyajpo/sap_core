# ERP Policy Classification

**Classification: `PROPOSED` governance approach.** Do not invent jurisdiction-specific policy. Policy classification determines when an owner decision is needed; it does not choose the policy. See [P11–P12](01-decision-register.md#register).

## Policy tiers

- **Platform-blocking:** required for a secure, tenant-isolated platform regardless of which ERP module ships. Cannot be bypassed by deferring a module.
- **Module-blocking:** required before implementing or enabling the relevant module/workflow. A module not in Phase 1 remains out of scope rather than receiving an invented default.
- **Jurisdiction/business-specific:** requires qualified local legal, tax, accounting, privacy or business-owner input. Must be explicitly scoped to the applicable countries, legal entities and dates; do not generalize from examples.

## Classification matrix

| Policy/decision area | Classification | Phase 1 treatment |
|---|---|---|
| Canonical principal, Better Auth persistence mapping, ID semantics, account link and deactivation/revocation | Platform-blocking | Approve and test before authentication/ERP access is implemented. Do not make a duplicate identity model. |
| Organization/company/plant meanings, memberships and selected-context semantics | Platform-blocking | Approve core hierarchy and isolation constraints before tenant-scoped queries or writes. No jurisdiction/legal form is presumed. |
| Authorization roles, scope inheritance/delegation, deny-by-default and server enforcement | Platform-blocking | Approve minimum membership/permission model and test every protected operation, stale session and cross-company/plant access. Exact role catalog remains owner-specific. |
| Cross-schema FK/composite-FK/application-reference policy | Platform-blocking | Approve per-edge policy for all models included in Phase 1; test referential and same-company/plant invariants. |
| Entity ownership and minimal physical core ERD | Platform-blocking | Approve selected entity owners, keys, constraints and lifecycle; all module relationships in scope must match the matrix and ERDs. |
| Prisma multi-schema mapping, exact framework/runtime/ORM/adapter baseline | Platform-blocking | Pin, install and build exact versions, generate client, test all ten schemas and migration flows before production code depends on it. |
| Session revocation latency, disablement and high-risk freshness | Platform-blocking | Owner must choose minimum behavior before protected operations. Exact durations/MFA are not guessed. Production email/recovery operations need separate evidence. |
| Runtime/migration DB roles, connection paths and recovery objectives | Platform/operations-blocking | Decide before provisioning or production migration. No provider plan, URL, backup or RPO/RTO is selected here. |
| Chart-of-accounts owner and chart scope | Platform-blocking if finance entities/workflows are included; otherwise finance module-blocking | Decide before finance models or cross-module account references. P06 proposes finance ownership; no chart structure is assumed. |
| Fiscal year/period calendar, open/close/reopen, posting dates | Finance/module-blocking; may be jurisdiction/business-specific | Defer unless finance posting is in Phase 1. No calendar, year start or statutory period is selected. |
| Accounting standard, account structure/classification, balances and financial statement mapping | Finance and jurisdiction/business-specific | Require qualified finance/accounting owners for each intended market before financial implementation. |
| Currency, precision, scale, rounding, FX rates, valuation method and costing | Module-blocking and potentially jurisdiction/business-specific | Decide exact semantics per finance/inventory/procurement/sales/production use before arithmetic or persisted numeric columns. No scale or method is supplied. |
| Tax, withholding, invoice content, tax point and tax reporting | Jurisdiction/business-specific; tax module/workflow-blocking | Require applicable jurisdiction and qualified tax/legal review before billing/AP/AR workflows. No rate or rule is inferred. |
| Payroll formulas, labor/timesheet rules, statutory benefits, privacy/legal basis and HR retention | HR module-blocking and jurisdiction/business-specific | Payroll is deferred unless explicitly selected; require local HR/legal/privacy owners and data minimization. |
| Inventory stock dimensions, negative stock, reservation, lot/serial, quality and costing | Inventory module-blocking; valuation may be jurisdiction/accounting-specific | Defer until operations/finance define the intended flows. Do not implement illustrative defaults as policy. |
| Purchasing tolerances, approvals, vendor invoice matching, returns | Procurement module-blocking and business-specific | Decide before procurement workflows. No thresholds, approval hierarchy or tolerance inferred. |
| Sales pricing, returns, credit notes, backorders, billing triggers and revenue treatment | Sales/finance module-blocking and business/jurisdiction-specific | Decide before sales/finance workflow. No legal invoice, revenue recognition or threshold defaults inferred. |
| Number sequence scope, reuse/gaps and legal document numbering | Module-blocking; may be jurisdiction/business-specific | Decide before issuing human-facing/legal document numbers. PostgreSQL sequence gaps are possible; no gapless promise. |
| Audit target model, access, retention, legal hold, tamper evidence and erasure handling | Platform security-blocking for capture/access controls; retention/legal aspects jurisdiction-specific | Define minimum event attribution and access before sensitive operations; do not invent retention periods or claim append-only storage is tamper-proof. |
| PDF generation/viewing, XLSX edition/artifact/license, image processing and Vite+/Storybook usage | Feature/module-specific | Defer until a concrete feature is selected and compatibility, support, security, deployment and licensing are reviewed. |

## Deferred does not mean optional once in scope

A `DEFERRED` policy must not be implemented by relying on a library default, common practice, or another jurisdiction's rules. Reopen it before the affected module, country, legal entity, export or workflow is enabled. Keep a jurisdiction/business decision record with qualified owner, effective date, source, applicability, change management and tests.

## Scope control

The initial Phase 1 platform may be implemented without payroll, tax, production costing, external integrations or document-number gap guarantees only if those capabilities are explicitly excluded and no hidden model/workflow assumes their rules. If the Phase 1 team decides to include any such capability, convert its policy to a blocking decision before code or schema implementation. See [Phase 1 gates](14-phase-1-implementation-gates.md).
