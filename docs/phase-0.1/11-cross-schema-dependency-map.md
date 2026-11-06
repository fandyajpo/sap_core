# Cross-Schema Dependency Map

**Status: `PROPOSED` dependency design.** Arrows below mean “dependent module needs a relationship/contract from owner”; they do not authorize unrestricted table access or imply a database FK. Every durable edge must be matched to [05](05-cross-schema-relationship-policy.md). The exact ten schemas are unchanged.

## Dependency table

| Dependent schema/module | Target owner/schema | Data dependency | Proposed mechanism and decision |
|---|---|---|---|
| `core` | `core` | Organizations, companies, plants, canonical ERP principal, auth records and membership/scope records | P02/P03 identity and initial scope policies are owner-approved. X06's `core.session.userId` and `core.account.userId` FKs to `core.user.id` are owner-approved as `ON DELETE RESTRICT`; validate the migration and authentication lifecycle. Choose/test the remaining in-scope X01–X05 relationships under P05. Core must not depend on business modules. |
| `master_data` | `core` | Optional company scope for company-specific master records | Scope is undecided. Use owner contract/application validation until owners decide whether a reference is global, organization- or company-scoped (X10). |
| `procurement` | `core` | Company/optional plant scope; actor context | Candidate FK/composite FK only for concrete approved aggregates (X08/X09); auth context is resolved at operation time. |
| `procurement` | `master_data` | Vendor/customer role, material and unit references | Explicit owner read/validation contract; per-edge FK decision. Snapshot accepted terms and references as the procurement owner requires. |
| `procurement` | `inventory` | Goods receipt creates inventory fact | Inventory command/contract; inventory owns the movement. Bounded local transaction and idempotency if an atomic local operation is selected (X14). |
| `procurement` | `finance` | Invoice/AP or posting effect | Finance command/contract and stable idempotent source reference; finance owns accounting effect (X15). |
| `inventory` | `core` | Company/plant ownership of locations and scoped stock facts | Candidate company FK and plant/company composite FK per entity (X08/X09). Do not decide dimensions or valuation here. |
| `inventory` | `master_data` | Material and unit-of-measure references | Owner contract plus approved typed reference/snapshot policy; no direct master-data writes. |
| `sales` | `core` | Company/optional plant scope and trusted actor context | Candidate FK/composite FK per concrete entity; every query revalidates the scope (X08/X09). |
| `sales` | `master_data` | Customer, product/material, UOM and accepted commercial terms | Master-data contract and sales-owned snapshots; scope/natural-key rules remain module decisions. |
| `sales` | `inventory` | Reservation, issue, delivery/stock movement | Inventory command/contract; no sales direct persistence access (X14). |
| `sales` | `finance` | Billing, receivable and posting effect | Finance contract with idempotent source identity and correction link (X15). |
| `finance` | `core` | Company scope, user/authorization context and possibly fiscal references | Candidate typed FK to company only after company semantics and finance scope approved; do not assume a fiscal calendar. |
| `finance` | `master_data` | Materials/partners and other separately approved non-accounting references only | Narrow read/validation contracts as approved by their owners. No CoA/account-definition dependency: P06 assigns sole CoA ownership to Finance; consumers do not source chart definitions from master data. |
| `finance` | `procurement`, `sales`, `production`, `inventory` | Source facts that create accounting effects | Source owner contract and stable idempotent application reference, not direct writes into source module; posted finance history stays finance-owned (X15/X16). |
| `production` | `core` | Company/plant/work-center scope and actor context | Candidate typed or composite references per approved production aggregate (X08/X09). |
| `production` | `master_data` | Materials, units and released BOM inputs | Owner contract; preserve approved revision/snapshot semantics. |
| `production` | `inventory` | Consumption and output movement | Inventory command/contract with transaction/recovery design (X14). |
| `production` | `finance` | Costing/accounting effects if production costing is in scope | Deferred until costing/business policy is approved; then use finance contract. |
| `human_resources` | `core` | Optional employee-to-principal link and organizational scope | X07 optional FK candidate to `core.users`; access to HR fields always separately authorized. Company assignment requires its own owner decision. |
| `system` | `core` and domain schemas | Audit actor, target, number-range scope and cross-cutting configuration | Actor/service identity and polymorphic target use application references (X12/X13). Number scope is a per-edge decision; do not make `system` a write-through owner. |
| `integration` | Any schema | None in the initial baseline | Reserved and empty. No dependency, connector, webhook or synchronization component is included. |

## Dependency direction and cycle control

The preferred direction is `business module → core/master-data owner contracts → shared infrastructure`, with contracts and transaction coordination for cross-module facts. Core must not import or query private business repositories. `procurement`, `sales` and `production` may call `inventory`; their accounting effects go to `finance`; those effect requests do not create reciprocal direct table ownership. A cross-module coordinator may call owners in one bounded local transaction, but must not create a schema-level cycle or hidden shared-write layer.

P06 confirms Finance ownership of CoA and account definitions, so chart/account consumers use Finance-owned contracts/read models; there is no Finance-to-`master_data` CoA dependency. Any other master-data reference remains a per-edge owner contract. P05 and Phase 0.3 govern physical relationship enforcement and posting-time history. `system` audit references should not create an FK cycle across modules; use stable application references and owner-authorized reads.

## Map validation

Every ERD edge must resolve to a row in [05](05-cross-schema-relationship-policy.md), a concrete owner in [07](07-entity-ownership-finalization.md), and the matching Phase 1 gate in [14](14-phase-1-implementation-gates.md). Do not infer that a listed dependency has been implemented, approved or tested.
