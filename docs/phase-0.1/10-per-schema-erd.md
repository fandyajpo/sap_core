# Per-Schema ERDs — Logical and Physical Drafts

**Status: `PROPOSED`; not implementation-ready.** Logical entity grouping follows Phase 0 ownership. Physical keys below are only a minimum proposal: UUID is the default for ERP-owned IDs, while Better Auth principal IDs remain adapter-determined. Fields omitted are intentionally undecided. See [07](07-entity-ownership-finalization.md), [08](08-global-logical-erd.md), [09](09-global-physical-erd.md) and [05](05-cross-schema-relationship-policy.md).

## `core`

**Logical:** organization → company → plant; user ↔ organization/company memberships and optional plant assignment; auth user → account/session/verification. Organization/company/plant definitions and inheritance remain proposed.

**Physical draft:** `organizations(id)`; `companies(id, organization_id)`; `plants(id, organization_id, company_id)`; `users(id)`; `auth_accounts(id, user_id)`; `auth_sessions(id, user_id)`; `auth_verifications(id, purpose/identifier fields unresolved)`; `organization_memberships(id, user_id, organization_id)`; `company_memberships(id, user_id, organization_id, company_id)`; `plant_assignments(id, user_id, company_id, plant_id)`. Candidate constraints: parent FKs; composite unique keys for consistent parent links; membership uniqueness by scope; current status/effectivity and role structure not selected. See [09](09-global-physical-erd.md).

## `master_data`

**Logical:** business partner may carry customer and/or vendor role profiles; material/product references unit of measure and optional conversion. Whether customer/vendor share one identity, and whether records are global/shared/company-specific, is undecided.

**Physical draft:** candidate UUID primary keys only; no company FK, natural-key uniqueness, account linkage or lifecycle columns selected. A relation to `core` for company-specific records uses owner contract until scope is decided (X10). Chart of accounts stays here in Phase 0's history only; Phase 0.1 recommends `finance`, subject to approval.

## `procurement`

**Logical:** requisition and lines; purchase order and lines; receipt and lines; vendor invoice and lines. Header→line belongs within procurement. Vendor/material references are typed master-data relationships; exact FKs, snapshots and company scope require per-edge/module approval.

**Physical draft:** candidate UUID PKs for aggregates/lines; no line-number uniqueness, quantity/price types, company/plant columns, source references or state enum are asserted. Company/plant scope and FK action are `PROPOSED`/module-blocking.

## `inventory`

**Logical:** storage location; stock movement ledger; transfer; balance projection. A transfer coordinates one or more movement facts; balance is a projection, not an independent authoritative ledger.

**Physical draft:** candidate UUID PKs; dimension and unique balance key unknown. Storage location/company/plant composite reference and movement source-document polymorphism require X09/X16 decisions. No inventory quantity or valuation precision/policy is inferred.

## `sales`

**Logical:** quotation → sales order → delivery → billing document, each with lines and own lifecycle. Sales requests inventory and finance effects through owner contracts.

**Physical draft:** candidate UUID PKs only. Conversion links, company/plant scope, customer/address/price/terms snapshots, line uniqueness, returns and deletion policy remain module decisions. Do not encode direct writes into inventory or finance.

## `finance`

**Logical:** proposed chart of accounts → accounts; journal entry → journal lines; AP/AR and cost-center references. Finance owns posted accounting facts and correction by reversal/adjustment.

**Physical draft:** candidate UUID PKs and same-schema journal header/line and chart/account FKs if CoA placement is approved. Monetary precision, debit/credit representation, currency, period, source idempotency key, account snapshots and uniqueness are not settled. If CoA remains `master_data`, X11 becomes a separate cross-schema decision; it is not implied here.

## `production`

**Logical:** BOM → revisions/components; production order → confirmation and inventory consumption/output contracts. Released work should preserve its approved input revision, but the snapshot form and effectivity are undecided.

**Physical draft:** candidate UUID PKs only. Company/plant, material/work-center FK actions, exact BOM version semantics, quantity precision, scrap/yield and costing are deferred until production scope is approved.

## `human_resources`

**Logical:** employee → department/position/attendance/payroll concepts. Employee is separate from `core.users`; an employee may optionally map to a canonical login. Workforce records remain HR-owned and sensitive.

**Physical draft:** candidate `employees(id, user_id nullable)`; X07 cross-schema FK is recommended if approved. Do not make `user_id` unique before deciding whether one principal can represent multiple employments. Company assignment, names/PII, dates, sensitive fields, retention and payroll fields are not specified.

## `integration`

**Logical and physical:** empty/reserved. No entities, tables or relationships are authorized in Phase 0.1.

## `system`

**Logical:** cross-cutting audit event, settings, number-range configuration, document type and workflow-rule candidates. Module-owned workflows remain in their module unless genuinely cross-cutting.

**Physical draft:** candidate UUID PK only for any future approved record. Audit actor may be human or service and target may be polymorphic; X12/X13 use application references, not a misleading FK. Number-range scope, gap behavior, event immutability, retention, settings ownership and workflow versioning are unresolved.

## Required schema/ERD decisions before implementation

For every selected module entity, approve its owner, company/organization/plant scope, PK and natural keys, required fields, nullability, unique/check/FK constraints, index needs, lifecycle, correction/snapshot semantics, authorization and deletion. Keep `integration` empty. The global ERDs and relationship matrix must be updated together when any decision changes; an ERD edge may not be added without a matching row in [05](05-cross-schema-relationship-policy.md) and [11](11-cross-schema-dependency-map.md).
