# Schema Ownership Matrix

Schema names and initial entity references follow `sap_core_skills/SAP_CORE_CONTEXT.md`. References are candidate catalog entries, not a requirement to create every table. One module owns each entity's rules and writes; a consumer FK or query does not transfer ownership.

| Schema | Owning module/domain | Initial entity references | Status / key cautions |
|---|---|---|---|
| `core` | Organization and identity-adjacent platform | users, roles, permissions, companies, organizations, plants, fiscal years | Users/roles/permissions are provisional until Better Auth model ownership and org membership are decided. Distinguish company, organization and plant. |
| `master_data` | Reusable non-accounting business reference data | business partners, customers, vendors, materials, products, units of measure | Does not own or duplicate CoA/account definitions; Finance is the owner-approved authority under P06. |
| `procurement` | Purchasing lifecycle | purchase requisitions, purchase orders, goods receipts, vendor invoices | Preserve ordered, received and invoiced quantities as distinct facts; coordinate inventory and finance through owners. |
| `inventory` | Physical stock and movement | storage locations, stock balances, stock movements, stock transfers | Ledger facts and balance projection; define dimensions, negative stock/reservations and valuation later. |
| `sales` | Quote-to-billing operations | quotations, sales orders, deliveries, billing documents | Sales owns documents; inventory owns stock effects; finance owns receivable/journal effects. |
| `finance` | Accounting, company-level CoAs and subledgers | CoA/account definitions and revisions, journal entries/lines, AP, AR, cost centers, tax references and approved finance configuration | Sole CoA owner; company-scoped ownership and plant inheritance are owner-approved by P06. Physical schema, effective-date enforcement and remaining accounting/jurisdiction details require validation/qualified owners. |
| `production` | Manufacturing execution | bills of materials, work centers, production orders, confirmations | Released work must snapshot an approved BOM revision; costing/yield scope is unresolved. |
| `human_resources` | Workforce data/processes | employees, departments, positions, attendance, payroll | Sensitive scope. Jurisdiction, access, legal basis and retention are open; payroll is only a catalog candidate. |
| `integration` | Reserved future namespace | None in initial scope | Empty by design. No connector, webhook engine, broker or third-party sync is authorized. |
| `system` | Cross-cutting platform concerns | audit logs, system settings, number ranges, document types, workflow rules | Only genuinely cross-cutting concerns belong here; audit retention, admin owner and numbering rules require decisions. |

## Proposed relationship governance

1. Each table/model is assigned one owner module and one schema before implementation.
2. Cross-schema references are explicitly inventoried with source owner, target owner, invariant, delete behavior, and enforcement mechanism.
3. Cross-schema foreign keys require a per-relationship data-governance decision after version/provider validation. A database FK does not authorize queries/writes.
4. Until that decision, enforce references through owner contracts and transactional revalidation; do not pretend the contract is an FK.
5. Keep `integration` entity-free in Phase 0. Do not create unused tables simply to mirror future features.

## Open placement decisions

- Better Auth authentication/session entities vs `core.users`, including schema and migration owner.
- CoA physical representation, P05 relationship enforcement, effective-date and migration behavior remain technically unvalidated; ownership and company-level scope are closed by P06.
- Company/plant and shared master-data cross-schema FK policy.

See [entity catalog](09-entity-catalog.md) and [decision register](20-architecture-decisions.md).


## Phase 0.1 ownership addendum

Phase 0's former `master_data` CoA placement is retained as historical context only and is superseded by owner-approved P06. The current schema owner is `finance`; `master_data` owns no duplicate CoA/account definitions. See [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and [Phase 0.3 validation](../phase-0.2/p06-phase-0.3-validation-backlog.md).
