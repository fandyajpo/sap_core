# Database Integrity and Invariant Placement

## Enforcement model

Durable correctness is layered: runtime validation rejects malformed requests; the owning domain/application service checks business meaning and actor scope; PostgreSQL constraints protect row-local/relational facts against races and alternate paths; bounded transactions coordinate multiple writes; reconciliation detects projection drift. No single layer replaces the others.

| Invariant | Primary durable control | Required complementary control |
|---|---|---|
| Required value and bounded row field | NOT NULL, type/range and row CHECK | Server validation; remember CHECK accepts NULL. |
| Unique business identity/number | Unique constraint/index over owner-approved scope | Atomic allocator, idempotency and explicit normalization/null behavior; never `MAX()+1`. |
| Reference exists | FK where relationship policy/version allows | Owner authorization; deliberate deletion behavior and child-side index where needed. |
| Company/plant pairing is valid | Approved composite FK/unique key or explicit transaction contract | Trusted actor/company query scope and tests. Simple existence FK may not prove same-company membership. |
| Balanced posted journal | Same transaction writes entry, lines and posted state; exact decimal check in application | Unique idempotency/source key, immutable posted history, concurrency-safe posting and reconciliation. Cross-row total is not a normal CHECK. |
| Stock movement and balance agree | Transaction writes immutable movement and balance projection | Lock/conditional/version update, idempotency, negative-stock policy and reconciliation. Cross-row availability is not a row CHECK. |
| State transition is legal | Conditional version/state transition in owner use case | Audit event and unique approval/decision identity; retries must be idempotent. |
| Approval belongs to reviewed revision | Decision references document version/state | Revalidate on commit and require reapproval after materially changed revision according to owner policy. |
| Cross-module fact is consistent | Coordinator invokes each owner's contract, preferably in one local transaction | Explicit write ownership, deterministic lock order, rollback mapping and tests. |
| Audit evidence accompanies business action | Persist audit evidence within same transaction where possible | Append-oriented access controls, privacy minimization and retention decision; no unsupported immutability claim. |

## Concurrency and transaction rules

- Use one bounded PostgreSQL transaction for one atomic business fact; do not perform network requests or long CPU work while locks are held.
- For contested rows, pick row locks, conditional updates/version checks, or a combination based on the invariant. Define deterministic lock order to reduce deadlocks.
- Do not assume default isolation alone enforces aggregate business rules. If SERIALIZABLE or another isolation mode is selected, classify retryable failures and retry boundedly only when operation identity/idempotency is stable.
- Sequence values can be consumed on rollback; ordinary sequences do not promise gapless document numbering. Numbering scope and gap/reuse policy are business decisions.
- Raw SQL, triggers, or unsupported constraints require a written rationale, migration ownership and automated verification in the selected provider/version.

## Deletion and corrections

Posted finance records and stock movements are facts: do not mutate them as drafts or cascade-delete them. Correct through linked reversals/adjustments or correction movements. Draft cleanup and master-data deactivation follow their owners' lifecycle and retention rules. Soft-delete flags do not substitute for audit evidence or access revocation.

## Evidence required

Fresh-schema and upgrade migration tests; null/unique/FK edge cases; concurrent duplicate allocation, posting and stock updates; rollback and retry; company/plant scope; reconciliation; audit failure behavior; and backup/restore exercises are all required once code and a disposable PostgreSQL environment exist. No such checks were run for this documentation.


## P06 CoA invariants

Finance owns the CoA and account lifecycle. At the logical level, integrity must protect company-scoped uniqueness, immutable account/company identity, valid and acyclic company hierarchy, non-overlapping effective periods, CoA/account/company/currency/fiscal-period consistency, and immutable posted journal history. Posting readiness is a derived evaluation of the approved prerequisites, not a single boolean. Debit-credit balance requires a transaction-level/domain invariant and concurrency test; periodic reconciliation is distinct from synchronous posting validation. The exact physical controls are deliberately open; see [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md) and validation tasks [V03–V10](../phase-0.2/p06-phase-0.3-validation-backlog.md).
