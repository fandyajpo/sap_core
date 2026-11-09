# V04 session revocation and protected-transaction linearization proposal

**Status:** **OWNER-APPROVED; IMPLEMENTATION MERGED (PR #62); SESSION-REVOCATION TEST ACCEPTANCE PASS IN PR #64**.  
**Implementation main:** `f8995b2f84a7e34f209e358d55a976a0e8a71be8`.  
**Implementation CI:** [Run #42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667), all eight jobs passed.  
**Adversarial test CI:** [Run #42597914590](https://github.com/fandyajpo/sap_core/actions/runs/42597914590), PR #64 head `e161ee2cca296a0baf0ff88337bdd5be660f0402`, all eight jobs passed; PR #64 is pending merge.  
**Better Auth version:** `1.7.17`; Prisma `7.10.1`.  
**Scope:** Close the time-of-check/time-of-use gap between Better Auth session verification and the transaction that performs a protected tenant operation.  
**Database boundary:** Session adversarial tests used disposable CI PostgreSQL only. No hosted database was connected to, inspected, or modified.

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

## 7. Implementation verification and remaining risks

**Verified in PR #62 source review and CI:**

- Better Auth `1.7.17` `getSession` exposes the verified session ID and user ID used by the adapter.
- Better Auth sign-out deletes the session row by token through the same persistence adapter/table; the lock and deletion therefore contend on the same `core.session` row.
- The implementation uses the repository's actual Prisma mapping for `core.session` and its physical columns.
- The shared lock is acquired before tenant GUCs and membership/grant queries, and held by the protected transaction. The lock is also wired into role-assignment and custom-role transaction adapters.
- CI run [#42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667) passed all eight jobs. PostgreSQL integration coverage includes row-lock serialization, revocation-first denial, expiry/mismatch denial, and rollback release.

**Verified by PR #64 disposable-CI evidence:**

- Real Better Auth HTTP request-first schedule: a protected request acquires the exact session row lock, blocks on membership lookup, and sign-out is observed waiting on the same session row. After releasing the membership blocker, the protected request completes (HTTP 200), sign-out completes (HTTP 200), and the session row is absent.
- Sign-out-first ordering: Better Auth sign-out deletes the session; a later protected request using the stale cookie returns HTTP 401.
- Injected database failure: terminate the backend while the session-lock query is waiting on a conflicting row update; the protected endpoint returns HTTP 500 and the valid session row remains.
- Session-lock pool reuse: after commit, the same physical backend is reused and can revoke a session row; rollback releases the row lock.
- [CI run #42597914590](https://github.com/fandyajpo/sap_core/actions/runs/42597914590) passed all eight jobs.

**Remaining boundary / separate policy question:**

- Determine whether user disablement is represented in `core.user`; P10 account-disablement semantics are broader than session-row revocation and need a separate verified check if an account status/control exists.
- Continue to keep protected transactions bounded, with no network calls or long-running external work, and preserve lock ordering before membership/assignment locks.
- This evidence covers the implemented protected API slice only; future tenant routes require their own authorization and adversarial tests.

## 8. Non-goals and safety boundaries

- Does not weaken P10 immediate server-enforced revocation.
- Does not add tenant RLS policies or alter GUC semantics.
- Does not change the approved RESTRICT foreign keys or Better Auth hard-delete prohibition.
- Does not create a hosted database role or alter hosted credentials.
- Does not claim all routes are covered until the source inventory and tests prove it.
- Does not promote V04 or clear hosted-provider residual risk.

## 9. Approval and acceptance disposition

Owner approval for the transaction-bound session-row revalidation/locking contract, its serialization semantics, the protected-route inventory, and lock-duration/transaction-boundary constraints was explicitly granted on 2026-11-09. The implementation was merged in PR #62 at `f8995b2f84a7e34f209e358d55a976a0e8a71be8`; CI run [#42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667) passed all eight jobs.

The implementation and session-revocation test acceptance milestones are complete for the implemented API slice: PR #62 provides the transaction-bound lock and PR #64 provides passing adversarial HTTP/database/pool evidence (CI #42597914590, eight of eight jobs). PR #64 remains pending merge, so the evidence is currently on its PR head rather than main. V04 overall remains **BLOCKED** by the separately gated hosted runtime-role, grants, deployment-secret, migration and production smoke-test acceptance.
