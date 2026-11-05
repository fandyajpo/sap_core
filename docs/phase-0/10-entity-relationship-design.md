# Entity Relationship Design (Conceptual)

This is a relationship inventory, not a physical ERD. It describes likely cardinality and ownership while leaving cross-schema FK policy open. Every edge must be reviewed for company/plant consistency, delete behavior, lifecycle and historical snapshot needs before Prisma models are authored.

## Organization and reference relationships

| Relationship | Owning data | Conceptual cardinality | Design note |
|---|---|---|---|
| Organization/company → plants | `core` | One company/organization may contain zero or more plants; each plant belongs to a governed parent context | Do not conflate legal entity, organizational unit and physical plant. Composite company/plant integrity needs an owner decision. |
| User ↔ organization/company membership | Placement unresolved (`core` candidate) | Many-to-many through an effective membership/role assignment concept | Authentication user and ERP membership are separate concepts; membership is authorization input, not a Better Auth role. |
| Business partner → customer/vendor role | `master_data` | Partner may have zero or more role profiles, subject to product decision | Prevent duplicate party identity while allowing distinct role-specific data; legal identity policy unresolved. |
| Product/material → unit of measure | `master_data` | Product/material references a base or transaction unit; conversions may be effective-dated | Canonical unit and conversion/rounding policy must be chosen before constraints. |
| Company → company-owned CoA → account identities/versions | `core` company scope; `finance` owns all CoA/account facts | Company has one active primary CoA for posting in the relevant period; plants use that company's chart; account IDs remain stable across versions | Owner-approved by P06. Finance owns definitions and posting validation; consumers use Finance contracts. Exact FK, version/revision representation and period enforcement remain Phase 0.3 validation items. |

## Operational documents

| Relationships | Owning schemas | Integrity/history intent |
|---|---|---|
| Requisition → lines; purchase order → lines; receipt → lines; vendor invoice → lines | `procurement` | Header-to-lines aggregate; ordered, received and invoiced quantities remain separate. Source links preserve conversion from request to commitment to observation/claim. |
| Goods receipt → inventory movement | Procurement coordinates; inventory owns movement | Receipt command asks inventory owner to record an idempotent movement; do not write inventory tables directly from procurement. |
| Storage location → stock balance; movement → source/destination locations | `inventory` | Balance is a projection keyed by approved stock dimensions; movements are append-oriented facts with traceable source. Transfers are linked source/destination movements or one explicit transfer aggregate per final design. |
| Quotation → sales order → delivery → billing document | `sales` | Separate offer, accepted order, fulfillment and billing. Conversion links and snapshots preserve accepted terms. |
| Sales delivery/order → inventory reservation/issue | Sales coordinates; inventory owns reservation/movement | Authoritative inventory contract at command time; concurrency and negative-stock policy remain open. |
| Sales/procurement/production source → finance subledger/journal | Source module + `finance` | Finance owns accounting effects. Stable source identity, idempotency and correction links prevent duplicate posting. |
| BOM revision → production order snapshot → confirmations | `production` | Released order references immutable revision/snapshot; confirmation records actual activity and input/output facts. |
| Production confirmation → inventory consumption/output | Production coordinates; inventory owns movement | Single local transaction where feasible; otherwise recovery design is a separate decision. |
| Journal entry → journal lines | `finance` | Entry line set posts atomically and balances under exact decimal arithmetic; posted fact is immutable and corrected by linked reversal/adjustment. |
| Employee → department/position/attendance/payroll references | `human_resources` plus core org reference | HR owns sensitive data; access, relationship semantics and retention are owner-governed. |
| Audit event / number range / workflow rule | `system` candidates | Audit points to actor/action/target; number allocation is transaction-safe; workflow decisions bind to reviewed document version. |

## Referential integrity governance

Use FKs for relationships explicitly approved by data governance and supported by the pinned Prisma/PostgreSQL configuration. Before approval, use module contracts with the owner rechecking the reference in the same transaction that commits the dependent fact. A FK does not grant read/write authorization. For company-scoped references, validate both target identity and same-company relationship; a simple FK to an ID may not prove company consistency. If composite keys or an alternate enforcement path are selected, document it for each relationship.

## Delete and historical behavior

Do not cascade-delete posted journal entries, inventory movements, approved source evidence, or audit records. Prefer restrict/soft lifecycle transitions only where an owner-defined lifecycle and retention policy requires them; soft delete is not audit history. Master-data deactivation must not erase historical document snapshots. Exact ON DELETE/UPDATE actions, uniqueness scopes, nullable keys and event retention remain unapproved until domain decisions are recorded.


## Phase 0.1 ERD and edge reconciliation

The relationship descriptions above remain conceptual. Phase 0.1 adds global logical/physical draft ERDs, per-schema views and X01–X16 enforcement recommendations in [08](../phase-0.1/08-global-logical-erd.md), [09](../phase-0.1/09-global-physical-erd.md), [10](../phase-0.1/10-per-schema-erd.md) and [05](../phase-0.1/05-cross-schema-relationship-policy.md). P06 owner-approves the logical CoA ownership/scope and Finance boundary; physical relations, module columns and P05 FK enforcement remain unvalidated and are not implementation-ready. See the [P06 Phase 0.3 backlog](../phase-0.2/p06-phase-0.3-validation-backlog.md).



## P06 CoA relationship and history

Platform and organization templates are Finance-governed initialization sources that create independent company-owned CoAs; template updates do not propagate. Financial-reporting and consolidation mappings are separate, versioned concepts, not account ownership or a shared CoA. Journal lines retain immutable Finance account identity; posted journals are never rewritten. See [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and [Phase 0.3 validation backlog](../phase-0.2/p06-phase-0.3-validation-backlog.md). No physical columns or cross-schema FK are decided here.
