# V04 session revocation and protected-transaction linearization proposal

**Status:** Engineering proposal only — **NOT OWNER-APPROVED; NOT IMPLEMENTED**.  
**Baseline:** `main` at `8ed85972123d4a07c2f13d42c034f76782e5b25b`.  
**Better Auth version:** `1.7.17`; Prisma `7.10.1`.  
**Scope:** Close the time-of-check/time-of-use gap between Better Auth session verification and the transaction that performs a protected tenant operation.  
**Database boundary:** Source/schema review only. No database was connected to or modified.

## 1. Problem

The approved P10 session-governance policy requires server-enforced revocation and fail-closed protected operations. The current request sequence calls `auth.api.getSession({ headers })` in `src/lib/auth-session.ts`, then starts a separate tenant transaction. The role-assignment production adapter follows this sequence in `src/lib/tenant-role-assignment-service.ts`.

A session can be revoked after Better Auth validates it but before the protected transaction begins. The transaction currently verifies the actor's membership and authorization grants, but does not revalidate the exact Better Auth session row. Consequently, the protected operation can proceed using a session that was revoked in that interval.

The current schema stores `core.session.id`, `userId`, `expiresAt`, and a unique `token`; sessions reference `core.user` with the owner-approved RESTRICT relationship. The Better Auth identity tables are intentionally outside tenant RLS. Session validity must therefore be checked before tenant-context queries, but can still be rechecked inside the tenant transaction.

## 2. Proposed contract

Use Better Auth as the cryptographic/cookie verification authority, then revalidate and lock the exact verified session row inside the same interactive transaction that performs authorization and the protected operation.

1. Resolve request headers and call Better Auth `auth.api.getSession`. Reject missing/invalid/expired sessions as today.
2. Extract only the verified session's stable `session.id` and `session.userId`. Do not pass or log the raw session token.
3. Open the protected operation's interactive database transaction.
4. As the first database authorization query in that transaction, execute a parameterized query equivalent to:

   ```sql
   SELECT id
   FROM core.session
   WHERE id = $1
     AND user_id = $2
     AND expires_at > clock_timestamp()
   FOR SHARE;
   ```

   Use the actual mapped column names from the Prisma migration/schema. The example above is conceptual; implementation must use the repository's exact identifiers.
5. If no row is returned, abort with an authentication failure (HTTP 401); do not set tenant GUCs, load memberships/grants, or execute the protected operation.
6. Keep the shared row lock until the protected transaction commits or rolls back. Continue with actor membership, verified ancestry, persisted grants, policy evaluation, and protected query using the same transaction-bound session.
7. On transaction completion, PostgreSQL releases the lock. A concurrent session deletion/revocation that conflicts with the row lock is serialized against the protected operation.

## 3. Defined concurrency semantics

The session row lock provides a clear serialization point:

- **Revocation commits before the protected transaction obtains the lock:** the row is absent and the protected operation fails closed.
- **Protected transaction obtains the lock first:** the protected operation may complete; a conflicting revocation waits for that transaction and then commits. The operation is ordered before revocation.
- **Session expires before the in-transaction check:** `expires_at > clock_timestamp()` fails and the operation is denied.
- **Database error or inability to verify:** abort the protected operation. Do not fall back to the earlier Better Auth result alone.

This is a bounded transaction-ordering guarantee, not a claim that revocation can retroactively cancel an operation that already acquired the session lock.

## 4. Why this approach

- Preserves Better Auth as the only authority for cookie parsing, signature/token validation and session resolution.
- Uses the stable session row identity returned by the verified Better Auth result; it does not reimplement cookie parsing or token hashing.
- Avoids storing or forwarding raw session tokens.
- Makes session revocation and the protected database operation serialize on the same database row and transaction.
- Does not add a new session status field, migration, cache, or global tenant context.
- Fits the existing transaction-bound `ScopedAccessSession` contract.

A session-level lock or a lock acquired in a separate transaction is insufficient. The lock must be held by the exact transaction that performs the protected operation.

## 5. Required implementation scope

The helper must be centralized and used by every protected request path, not just role assignments. At minimum inventory and integrate:

- Organization member reads.
- Company and Plant reads.
- Organization custom-role list/create/revision.
- Organization role-assignment GET/POST.
- Any additional protected API route discovered by source inventory.

The helper should accept only the verified `session.id` and `session.userId`, plus the transaction-bound session object. It must not accept actor identity from request input. The check must happen before any tenant GUC is set or tenant membership/grant query is run.

The Better Auth adapter's sign-out and administrative revocation paths must be verified to delete or update the same `core.session` row. If any revocation mechanism only invalidates a cookie/cache or uses a different persistence store, the proposed lock does not cover it and the design must be revised.

## 6. Required adversarial tests

Use disposable PostgreSQL and real Better Auth session cookies/HTTP handlers. No hosted database is required.

1. Valid session: protected request obtains the row lock and succeeds.
2. Revoked-before-transaction: delete/revoke the session after Better Auth verification but before the transaction lock; request returns 401 and performs no tenant query/write.
3. Revocation-first interleaving: revocation commits before lock acquisition; request denies.
4. Request-first interleaving: protected transaction holds the session lock; concurrent revocation blocks; protected transaction commits; revocation then commits. Assert deterministic ordering and no partial writes.
5. Expired session: the in-transaction clock predicate denies even if a prior verification result was cached or delayed.
6. Wrong session/user pairing: no row and fail closed.
7. Database lock/query failure: no fallback; protected operation does not execute.
8. Rollback/error path: lock releases and later revocation can complete.
9. Pool reuse: no session or tenant context leaks to the next transaction.
10. Positive controls: a valid session in its own Organization still performs the authorized operation.

Tests must assert both HTTP status and database state. Use bounded timeouts for lock-wait assertions to avoid hanging CI.

## 7. Risks and questions to resolve before implementation

- Confirm the exact Better Auth 1.7.17 `getSession` return contract and that `session.id` and `session.userId` are always available for this adapter.
- Inspect Better Auth 1.7.17 sign-out/revocation implementation and every administrative session deletion path to confirm they mutate `core.session` in the same database.
- Confirm generated Prisma table/column names and migration mapping; do not copy conceptual snake_case SQL blindly.
- Review lock mode and transaction isolation behavior with the PostgreSQL version used in CI and production target.
- Determine whether user disablement is represented in `core.user`. P10 account-disablement semantics are broader than session-row revocation and require a separate verified check if an account status field/control exists.
- Assess the operational cost of holding a session-row lock for the duration of protected work. Protected transactions must remain bounded and must not include network calls or long-running external work.
- Avoid acquiring the session lock after membership/assignment locks; standardize lock order to reduce deadlock risk.

## 8. Non-goals and safety boundaries

- Does not weaken P10 immediate server-enforced revocation.
- Does not add tenant RLS policies or alter GUC semantics.
- Does not change the approved RESTRICT foreign keys or Better Auth hard-delete prohibition.
- Does not create a hosted database role or alter hosted credentials.
- Does not claim all routes are covered until the source inventory and tests prove it.
- Does not promote V04 or clear hosted-provider residual risk.

## 9. Approval required

Before implementation, obtain explicit owner approval for:
1. The transaction-bound session-row revalidation/locking contract and its defined serialization semantics.
2. The complete protected-route inventory to which it applies.
3. The lock-duration/transaction-boundary constraints.

Until approved and tested, record the session-revocation race as an open V04 acceptance risk. V04 remains **BLOCKED**.
