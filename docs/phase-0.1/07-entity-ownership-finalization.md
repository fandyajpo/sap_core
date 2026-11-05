# Entity Ownership Finalization

**Decision status: `PROPOSED`.** This is a reconciled ownership proposal, not approval to generate models. The word “finalization” means the catalog is now explicit enough for owner review; it does not mean every entity or field is finalized. See [P07](01-decision-register.md#register).

## Ownership map

| Schema | Proposed owner and entity groups | Phase 0.1 disposition / unresolved boundary |
|---|---|---|
| `core` | Core/platform: organizations, companies, plants, canonical Better Auth user principal, auth accounts/sessions/verifications, organization/company memberships, plant assignments and authorization assignment concepts. | Identity mapping and membership semantics are proposed. No parallel independent login user. Fiscal-year references remain deferred until fiscal-calendar policy is selected. |
| `master_data` | Master-data: business partners; customer/vendor role profiles; materials/products; units and conversions. | Does not own or duplicate CoA definitions or account records under owner-approved P06. Partner identity, company/global scope, effective dating and unit conversion remain separate product decisions. |
| `procurement` | Procurement: requisitions/lines, purchase orders/lines, goods receipts/lines, vendor invoices/lines. | Document lifecycle, tolerance, legal tax treatment and company scope must be approved before module implementation. |
| `inventory` | Inventory: storage locations, stock movements/transfers, balance projections. | Stock dimensions, valuation, negative stock, reservation, lot/serial/quality and reconciliation policy remain operational/finance decisions. |
| `sales` | Sales: quotations/lines, sales orders/lines, deliveries/lines, billing documents/lines. | Pricing, returns, credit, revenue and billing-trigger policies remain unresolved. |
| `finance` | Finance: company-owned CoAs, account identities/revisions, controlled templates and mappings; journal entries/lines; AP/AR; cost centers; tax references and other approved accounting facts. | Sole CoA owner and company-level scope are `OWNER_APPROVED` by P06. Physical representation and validation remain pending; detailed accounting standards, tax, currency, rounding, fiscal periods and jurisdiction rules are not inferred. |
| `production` | Production: BOMs/revisions/components, work centers, production orders/requirements, confirmations/consumption/output references. | BOM effectivity, costing, yields, scrap, scheduling and inventory effects require owner decisions. |
| `human_resources` | HR: employee, department, position and any later approved workforce records. | Employee remains distinct from login user and may optionally link to `core.users`. Attendance and payroll are not first-platform entities; legal basis, access and retention are deferred. |
| `integration` | No owner entities in the initial scope. | Reserved and intentionally empty. No connector, webhook or external synchronization model is authorized. |
| `system` | System/platform: audit events, settings, number-range configuration, document types and workflow definitions only when genuinely cross-cutting and approved. | Audit target may be polymorphic and needs application-reference handling. Retention, tamper evidence, numbering gap/reuse and workflow scope remain decisions. |

## Core identity/organization entity boundary

`core.users` is the proposed canonical Better Auth user principal only if P02 is approved. Better Auth account/provider links and sessions are separate persistence records, not additional ERP users. `human_resources.employees` is a workforce concept with an optional `user_id`; employees without login and users without employee remain valid. Do not add a one-to-one uniqueness rule to the optional employee link until owners decide whether one login can represent multiple employments.

Organization/company/plant and their membership records belong to `core` under the proposed hierarchy in [03](03-organizational-model.md). Membership is authorization data, not an auth-provider role. Role definitions and inheritance are not yet a fixed table design.

## Ownership rules

1. Every persistent entity has one owning schema/module, a meaningful lifecycle and an accountable product/domain owner before implementation.
2. The owner controls writes and rules. Cross-schema FKs and consumer reads do not transfer ownership.
3. Use concrete typed references where possible; document polymorphic or external references as application-level contracts.
4. Every aggregate must define its organization/company/plant scope, natural-key scope, state transitions, correction/snapshot behavior, authorization, audit and deletion before coding.
5. Keep `integration` empty until a separately approved scope decision.

## Changes from Phase 0 and unresolved items

P06 explicitly supersedes the historical Phase 0 CoA placement and the former Phase 0.1 proposal: Finance is the sole owner, company-level CoA is selected, and `master_data` excludes account definitions. Other entity ownership and P02/P03/P05/P07–P10 details remain subject to their existing owner decisions and technical gates. No schema authoring is authorized by this catalog. The updated views are [global logical](08-global-logical-erd.md), [global physical draft](09-global-physical-erd.md) and [per-schema](10-per-schema-erd.md); see the [P06 traceability matrix](../phase-0.2/p06-traceability-matrix.md).
