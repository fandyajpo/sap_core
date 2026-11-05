# Initial Entity Catalog

This catalog is deliberately conceptual. Names represent the initial references in SAP Core context and the database audit; they are not a migration plan, complete ERD, or instruction to create unused models. Exact columns, statuses, natural-key scopes and requiredness depend on business-owner decisions.

| Owner schema | Candidate entity groups | Core responsibility / lifecycle evidence |
|---|---|---|
| `core` | Company, organization/unit, plant, fiscal-year reference, membership/user-role references | Organization scope and active/effective relationships. Authentication identity/model mapping is unresolved; do not duplicate Better Auth user records. Fiscal calendar semantics are open. |
| `master_data` | Business partner; customer/vendor roles; material/product; unit of measure and conversion | Reusable non-accounting identity/reference records with governed keys, lifecycle and effective-date/snapshot semantics. Customer/vendor may be roles/profiles of a shared partner; owner must confirm. CoA/account definitions are Finance-owned under P06. |
| `procurement` | Purchase requisition and lines; purchase order and lines; goods receipt and lines; vendor invoice and lines | Request, commitment, observed receipt and invoice claim remain distinct aggregates. Partial quantities and terms snapshot are required concepts; policies are unresolved. |
| `inventory` | Storage location; stock balance/projection; stock movement; stock transfer and lines | Movement ledger records facts; balances are maintained projections; transfers preserve source/destination and reconciliation. Stock dimensions/policy remain open. |
| `sales` | Quotation and lines; sales order and lines; delivery and lines; billing document and lines | Offer, accepted commitment, fulfillment and billing are separate lifecycles; preserve accepted customer/price/address/terms snapshots as required. |
| `finance` | Company-level chart of accounts and account identities/revisions; journal entry and lines; AP/AR subledger records; cost center; tax references | Sole CoA/account owner; exact arithmetic and balanced posted entries; source-document links, idempotency and correction by reversal/adjustment. Detailed standards, tax/currency and physical schema validation remain open. |
| `production` | BOM/revision/components; work center; production order/material requirements; confirmation/consumption/output references | Revisioned recipe, released snapshot, planned vs actual execution, yield/scrap evidence. Scheduling/costing rules remain open. |
| `human_resources` | Employee; department; position; attendance; payroll period/result candidates | Workforce and sensitive data. Employee identity vs login, jurisdiction, data minimization and payroll scope are unresolved. |
| `integration` | None | Reserved, not implemented. |
| `system` | Audit event; system setting; number-range configuration; document type; workflow rule/version candidate | Cross-cutting configuration/evidence only. Audit is append-oriented but not declared tamper-proof; numbering rules/gap policy are open. |

## Catalog rules

- A business entity is created only for an independently meaningful lifecycle/ownership concept, not for each screen or API response.
- Every aggregate identifies owner, key, lifecycle transitions, organization scope, source/snapshot semantics, constraints, authorization, audit and correction behavior before coding.
- Use stable internal UUIDs separately from human-readable numbers. Natural/business keys must have explicit normalization and company/type scope; nullable unique-key semantics must be considered.
- Use concrete typed relationships instead of ambiguous polymorphic IDs. Keep historical snapshots where a future change to master data must not rewrite a committed document.
- Any additional entities require a recorded owner and business justification. Finance, inventory, production, HR and system entities require their domain-specific policies before implementation.

## Unresolved catalog boundaries

CoA ownership and company-level scope are owner-approved by P06; physical CoA version/revision representation and technical validation remain pending. Other open boundaries include Better Auth persistence vs core user model, shared partner vs separate customer/vendor profiles, fiscal-period ownership, system vs module-specific workflow rules, and legal/accounting/retention requirements. Refer to the owner matrix, ADR register and P06 validation backlog.


## Phase 0.1 catalog reconciliation

This catalog remains a conceptual Phase 0 baseline, but its former CoA placement is superseded by owner-approved P06: Finance owns CoA and account identities; master data excludes them. P06 does not authorize generating models. The proposed canonical user mapping and optional employee link remain described in [identity architecture](../phase-0.1/02-better-auth-identity-architecture.md); see [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and [entity ownership](../phase-0.1/07-entity-ownership-finalization.md).
