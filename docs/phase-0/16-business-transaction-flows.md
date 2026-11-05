# Illustrative Business Transaction Flows

The following flows show ownership and consistency boundaries, not approved status vocabularies, accounting rules, approvals, thresholds, tolerances, fiscal policy or user-interface behavior. Every named state is conceptual. Business owners must approve exact transitions and policies before implementation.

## Purchase receipt

1. Procurement authenticates and authorizes receipt against the purchase order/company and validates quantities against current order/receipt history and approved tolerance policy (still open).
2. A procurement application coordinator asks inventory to record the receipt movement through the inventory contract; inventory revalidates location, unit and stock policy.
3. In one bounded PostgreSQL transaction when feasible, persist receipt header/lines, movement fact, balance projection, idempotency identity and audit context; do not let procurement write inventory tables directly.
4. Commit once. A repeated operation key returns the original receipt outcome, not a second movement. If a single local transaction cannot be used, stop and obtain a recovery/compensation design rather than inventing eventual consistency.

## Sales fulfillment and billing

1. Sales validates an authorized order and terms snapshot; inventory is queried through its owner for authoritative availability/reservation at command time.
2. Delivery creates sales fulfillment facts and invokes inventory's reservation/issue contract under a documented transaction coordinator.
3. Billing is a distinct sales lifecycle action and finance owns receivable/journal effects. Finance receives a stable source identity and ensures posting idempotency.
4. Price, tax, currency, revenue-recognition, partial/backorder/return/credit and reservation rules are all unresolved; this flow does not prescribe them.

## Journal posting

1. Finance authorizes the posting actor/company and validates source identity, current revision, approved period state and exact monetary inputs.
2. Finance computes/validates balanced lines with exact decimals under approved currency/rounding rules. Database row constraints alone cannot prove aggregate balance.
3. One transaction creates/updates the journal and lines, enforces source idempotency and records posting/audit facts.
4. Once posted, lines and header are immutable; corrections use linked reversal/adjustment entries. Fiscal periods, tax, chart ownership and accounting standards require owner decisions.

## Stock transfer

Inventory validates source/destination, company scope, dimensions, unit and current quantity. Within a single bounded transaction, it records the transfer/movement facts and updates both location projections using a concurrency-safe protocol and stable idempotency key. Insufficient stock, same-location behavior, in-transit state, negative stock, lot/serial, and valuation effects are unresolved policy choices, not defaults here.

## Production confirmation

Production confirms execution against a released order snapshot and validates actual input/output/scrap under approved rules. A coordinator requests inventory consumption/output facts; finance effects are separately owned. Within an approved local boundary, confirmation and stock movement projections must not diverge. BOM effectivity, costing, yield, labor and variance policies remain open.

## Shared safeguards

Each flow re-authenticates/authorizes at the operation boundary, scopes by trusted company context, validates current state, is idempotent where retried, writes audit evidence with the business transaction where feasible, preserves posted facts, returns a stable error, and is tested under concurrency. No external calls or hidden integration hooks are included.


## CoA initialization, activation and posting readiness (P06)

1. Finance stages a platform-template, organization-template, manual or CSV/Excel initialization batch; the company receives independent account identities and retained source/version provenance.
2. Finance validates the batch, hierarchy, classifications, company scope and effective-date invariants, then routes it through risk-based review/approval. Approval does not itself activate it.
3. Finance activation is a separate controlled transition. Posting readiness is separately evaluated across active validated CoA, approved accounting policy, fiscal year/open period, required mappings, opening-balance reconciliation or approved exemption, and Finance authorization; expose blockers rather than a lone readiness boolean.
4. Posting revalidates authoritative account eligibility and company/period/currency scope in Finance. Historical journal lines are immutable; chart transitions and account corrections never rewrite posted journals.

This is an owner-approved architecture flow, not a selected jurisdictional accounting rule or physical data model. See [P06](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and the Phase 0.3 validation backlog.
