# Module Ownership and Contracts

Every persistent business fact has one owning module. The database schema reflects ownership but does not replace application boundaries. Cross-schema references do not transfer write authority.

| Module | Owned scope | Writes / responsibilities | Named collaborators (contracts, not direct table access) |
|---|---|---|---|
| Core organization | `core` companies, organizational units/plants, fiscal-year references, user-to-organization context candidates | Organization lifecycle, company/plant scope, membership context (exact model open) | Auth/session identity; all ERP modules consuming trusted organization context |
| Master data | `master_data` business partners, customer/vendor roles, materials/products, units, reusable reference records | Identity, business keys, master-data lifecycle, effective dates and historical snapshot source | Procurement, sales, inventory, production, finance through owner APIs/read contracts |
| Procurement | `procurement` requisitions, purchase orders, goods receipts, vendor invoice records | Procurement lifecycle, order/receipt/invoice quantities, terms snapshots and matching evidence | Master data for references; inventory for receipt movements; finance for AP/posting |
| Inventory | `inventory` locations, stock balances/projections, movement ledger, transfer records | Stock dimensions/policy, movement posting, availability, reconciliation and concurrency | Procurement, sales, production via commands/contracts; finance for valuation effects |
| Sales | `sales` quotations, sales orders, deliveries, billing documents | Offer/order/fulfillment/billing lifecycles and accepted terms snapshots | Master data; inventory reservation/issue; finance receivable/posting |
| Finance | `finance` journal entries/lines, AP/AR, cost centers, tax references, periods (business scope unresolved) | Posting rules, balanced ledger facts, subledger lifecycle, reversals/adjustments and reconciliation | Source modules provide committed facts via stable contracts; finance owns accounting effects |
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

## Open ownership questions

Better Auth adapter records versus the initial `core.users` reference, and the chart of accounts (`master_data` in the accepted context but finance-oriented in the finance domain), require explicit owner decisions. Their current catalog entries are provisional references, not authorization to generate tables. See [the decision register](20-architecture-decisions.md).