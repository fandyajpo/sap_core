# Module Ownership and Contracts

Every persistent business fact has one owning module. The database schema reflects ownership but does not replace application boundaries. Cross-schema references do not transfer write authority.

| Module | Owned scope | Writes / responsibilities | Named collaborators (contracts, not direct table access) |
|---|---|---|---|
| Core organization | `core` organizations, companies, plants, canonical ERP user identity, memberships and plant assignments; fiscal-year references remain deferred | P02/P03 owner-approve the identity boundary and initial one-organization/single-company/explicit-plant policy; validate Better Auth mapping and physical membership enforcement | Auth/session identity; all ERP modules consuming trusted organization context |
| Master data | `master_data` business partners, customer/vendor roles, materials/products, units, reusable non-accounting reference records | Identity, business keys, master-data lifecycle, effective dates and historical snapshot source; no authoritative CoA/account definitions | Procurement, sales, inventory, production, finance through owner APIs/read contracts |
| Procurement | `procurement` requisitions, purchase orders, goods receipts, vendor invoice records | Procurement lifecycle, order/receipt/invoice quantities, terms snapshots and matching evidence | Master data for references; inventory for receipt movements; finance for AP/posting |
| Inventory | `inventory` locations, stock balances/projections, movement ledger, transfer records | Stock dimensions/policy, movement posting, availability, reconciliation and concurrency | Procurement, sales, production via commands/contracts; finance for valuation effects |
| Sales | `sales` quotations, sales orders, deliveries, billing documents | Offer/order/fulfillment/billing lifecycles and accepted terms snapshots | Master data; inventory reservation/issue; finance receivable/posting |
| Finance | `finance` company-level CoAs/accounts, journals/lines, AP/AR, cost centers, tax references and approved financial configuration | CoA/account ownership and governance, posting rules, balanced ledger facts, subledger lifecycle, reversals/adjustments and reconciliation | Source modules provide committed facts via stable contracts; Finance owns accounting effects and publishes approved account contracts/read models |
| Production | `production` BOMs/revisions, work centers, production orders and confirmations | Release snapshots, planned/actual execution, confirmation lifecycle | Master data for materials; inventory for consumption/output; finance for costing policy |
| Human resources | `human_resources` employees, departments, positions, attendance/payroll candidates | Workforce lifecycle and sensitive HR data, restricted outputs | Core organization references; system audit; access policy owners |
| System platform | `system` settings, audit evidence, number ranges, document types, workflow rules candidates | Cross-cutting platform controls, allocation/audit behavior and admin boundaries | All modules through narrow contracts; not a dumping ground for domain tables |
| Integration (reserved) | `integration` | No active entities or third-party synchronization in initial scope | None until a new ADR explicitly approves an integration |

## Contract rules

- A caller provides a command/query to the owning module, not a raw table mutation.
- Contracts identify actor, organization/company, target, lifecycle transition, idempotency and audit context as applicable.
- Owner authorization is still checked by the callee; a caller's prior check is not enough.
- Cross-module writes are coordinated in a bounded local transaction where feasible. If a future operation cannot be atomic, its durable recovery model requires a separate approved design; do not introduce distributed infrastructure implicitly.
- Public module contracts return narrow domain results/DTOs, not Prisma model types.

## Open ownership and validation questions

P02 now owner-approves Better Auth for authentication/accounts/sessions and `core.users` as the canonical ERP user identity; exact adapter/Prisma model mapping and migration validation remain pending. P03 owner-approves the initial organization/company/plant membership model. P04/P05 owner-approve authorization and hybrid relationship strategies; detailed grants, per-edge choices and enforcement tests remain pending. The CoA ownership conflict is closed by P06: Finance is the sole owner and `master_data` does not own or duplicate account definitions. See the [Phase 0 decision register](20-architecture-decisions.md), [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and [Phase 0.3 backlog](../phase-0.2/p06-phase-0.3-validation-backlog.md).


## Phase 0.1 ownership reconciliation

The [Phase 0.1 ownership map](../phase-0.1/07-entity-ownership-finalization.md) remains a proposal for non-P06 entity ownership. P02–P05 are now owner-approved, with technical mapping/enforcement and P05 per-edge choices still pending. P06 owner-approves Finance as sole CoA owner; this supersedes the former CoA recommendation status without approving untested columns or FKs. P07–P10 remain proposed. See [decision register](../phase-0.1/01-decision-register.md) and [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md).
