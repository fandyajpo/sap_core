# Transaction Architecture

## Atomicity boundary

One transaction corresponds to one committed business fact or one coordinated local workflow whose writes must be all-or-nothing. Transactions run on PostgreSQL through the pinned Prisma API. Keep them short and deterministic; no email, network integration, PDF generation, file parsing or long CPU work inside a database transaction.

## Command transaction shape

1. Parse and bound request input.
2. Resolve current actor, membership and company context; authorize action and target.
3. Load the authoritative current aggregate and validate legal transition/current version.
4. Begin a bounded transaction; re-check mutable conditions that can race.
5. Apply owner-controlled inserts/updates, constraints, source/idempotency key and audit evidence as one unit.
6. Commit; map known conflicts to stable domain/API errors. Only then return success/emit non-transactional follow-up work if a separately approved mechanism exists.

These are logical steps, not a version-specific Prisma API recipe. The candidate Prisma 7 line supports a different transaction API from current Prisma 8 RC material; pin the version before coding.

## Concurrency strategy by invariant

- **Stock:** atomically append movement and update the appropriate balance projection using an approved lock, conditional update or version protocol. Re-read availability at command time. Decide negative stock, reservations and dimensions first.
- **Journal posting:** validate exact-decimal debit/credit totals, open period and source idempotency; write header/lines/post state and audit in one transaction. Posted records become immutable.
- **Document transitions/approvals:** compare expected state/version and update conditionally; bind approval to the reviewed revision. A stale change fails and may require re-review.
- **Number allocation:** allocate from a concurrency-safe owner-controlled range/counter, not `MAX()+1`. Ordinary database sequences can gap on rollback; gapless policy is unresolved and must not be implied.
- **Cross-module commands:** a named coordinator calls each owner; lock/write order is documented. Prefer one local PostgreSQL transaction where all owners share the same database. Failure rolls back all participating writes. A workflow requiring eventual consistency/recovery needs a separate architecture decision.

## Isolation, deadlocks and retries

PostgreSQL defaults and Prisma transaction options are version/provider-sensitive. Select isolation and lock behavior per invariant, not globally by assumption. If a serialization/deadlock/conflict is retryable, classify the exact error, use bounded backoff, and retry only an idempotent command with the same operation identity. Do not retry validation, authorization, business conflicts, or unknown failures. Return an explicit conflict when the caller's expected version is stale.

## Idempotency and errors

For retryable create/post commands, persist a unique operation key scoped to the appropriate actor/company/command domain as approved. A duplicate request returns the original result or a defined conflict, never duplicates stock/journal facts. Define key retention and payload-fingerprint semantics before implementation. Never expose SQL, stack traces or raw Prisma errors.

## Evidence

Concurrency tests must include simultaneous duplicate submissions, two writers to one stock key, posting/retry, stale approval, deadlock/retry and rollback after failure. A single-user success path is not evidence. None were run because there is no application or database.


## P06 finance configuration and posting races

CoA approval and activation are distinct from financial posting readiness. Implementations must recheck mutable chart/version/mapping state and authorization within the bounded transaction that activates configuration or posts a journal. Validate concurrent CoA activation, account deactivation versus posting, period closure versus posting, idempotent retries and immutable posted rows. Exact locking/isolation and outbox mechanics remain technical decisions; see [P06 V06, V08, V10 and V16](../phase-0.2/p06-phase-0.3-validation-backlog.md).
