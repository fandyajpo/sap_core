# V04 Transaction-Bound Tenant Context and RLS Design Proposal

**Status:** Proposed technical design — NOT OWNER-APPROVED  
**Design basis:** RLS and pooled-connection inventory at `main` after PR #33 (`8703b09a20e0d2db4287571cceec263c992d5605`).  
**Scope:** Transaction boundary, tenant-context propagation, database role separation, RLS table classification, and validation strategy.  
**Database access:** No local or hosted database was connected to, queried, migrated, or modified while preparing this proposal.

## 1. Problem statement

The protected Organization member request currently resolves the Better Auth session, resolves target context, loads persisted permission grants, evaluates policy, and queries member data through separate global Prisma calls. Those calls may use different connections from the PrismaPg pool.

A transaction-local PostgreSQL tenant context is safe only if every context-dependent query in the request runs on the same transaction connection. A session-level `SET` is unsafe because a pooled connection may be reused by another request.

No RLS policy, tenant GUC, or database role separation currently exists. This proposal is the design step before implementation, not permission to add any of them.

## 2. Recommended execution boundary

Introduce one server-only transaction wrapper for protected tenant operations:

1. Resolve the Better Auth session before opening the tenant transaction. The actor ID must come only from the verified server session; Better Auth identity/session queries remain outside tenant RLS context.
2. Open one interactive `prisma.$transaction(async tx => ...)`.
3. Set the actor ID using transaction-local configuration, e.g. `set_config('app.user_id', $1, true)`. The final `true` is mandatory: it makes the value local to the current transaction.
4. Resolve the actor's active Organization membership using the transaction-bound client. No client-supplied actor ID is accepted.
5. Validate the requested Organization/Company/Plant ancestry and the active Company Membership / Plant Assignment needed for exact-scope access.
6. Only after each target ID is verified, set the corresponding transaction-local `app.organization_id`, `app.company_id`, and `app.plant_id` values.
7. Load persisted role assignments and sealed permission grants using the same `tx` client.
8. Evaluate the permission using the existing pure policy evaluator. Missing or inconsistent context, grant data, scope, or policy identifiers fail closed.
9. Execute the protected read/write callback using the same `tx` client.
10. Commit or roll back. Transaction-local GUCs must disappear on either outcome.

The callback must never fall back to the global Prisma singleton. Target resolution, grant loading, and the protected operation must accept an injected transaction-bound repository/client.

### Proposed context keys

| Key | Source | When set |
|---|---|---|
| `app.user_id` | Current Better Auth session | At transaction start, after session validation |
| `app.organization_id` | Active Organization membership + verified target | After membership and Organization ID validation |
| `app.company_id` | Verified descendant Company and, where required, active Company Membership | Only for Company/Plant targets |
| `app.plant_id` | Verified descendant Plant and active Plant Assignment when required | Only for Plant targets |

These names and ordering are proposals and require owner approval before code or migration changes.

## 3. Database role model

Recommended separation:

- **Migration/owner role:** owns schemas/tables, applies migrations and manages policies. It is never used by application request handlers.
- **Runtime application role:** non-superuser, not a table owner, and has no `BYPASSRLS`. It receives only required DML privileges and is the role used by the Prisma runtime connection.
- **CI test role:** mirrors the runtime role's RLS behavior in disposable PostgreSQL, rather than running RLS assertions as the database owner/superuser.

The current repository has one `DATABASE_URL` Prisma connection and does not document a separate migration/runtime role contract. The exact environment variable names, grants, and deployment mechanism are open until the actual hosted database provider/role capabilities are separately approved and verified.

## 4. Initial table classification

This is a proposed classification from the Prisma schema and migrations, not a set of policies.

| Table group | Tables | Initial treatment proposal |
|---|---|---|
| Tenant roots | `core.organization`, `core.company`, `core.plant` | RLS candidate. Organization membership and verified parent chain govern visibility; explicit child administration must remain distinct from operational membership. |
| Membership and assignment | `core.organization_membership`, `core.company_membership`, `core.plant_assignment` | RLS candidate. Self-membership bootstrap and admin visibility need explicit policies. Parent-consistency constraints remain authoritative. |
| Role assignments | `core.organization_role_assignment`, `core.company_role_assignment`, `core.plant_role_assignment` | RLS candidate. Access must be bound to the matching active typed membership/assignment and scope. |
| Role definitions and grants | `core.role_definition`, `core.role_permission_grant`, `core.role_definition_audit`, `core.break_glass_access_audit` | RLS candidate with special handling: SYSTEM role/permission catalog reads are global; custom roles and audit rows are Organization-owned; append-only triggers remain in force. |
| Permission catalog | `core.permission_definition` | Global read-only catalog candidate. No tenant writes. |
| Better Auth identity | `core.user`, `core.session`, `core.account`, `core.verification` | Do not blanket-enable tenant RLS in the first increment. Better Auth performs sign-in/session/account operations without tenant context. A separate auth client/role would be a distinct design if identity-table RLS is required. |
| Validation fixtures | `core.validation_records`, `master_data.validation_references` | Not tenant business data; keep outside the initial tenant policy scope unless a later owner-approved requirement says otherwise. |
| ERP schemas | Procurement, Inventory, Sales, Finance, Production, Human Resources, Integration, System | No corresponding tenant business models were found in the current Prisma schema inventory. Add RLS only after real row ownership and query paths exist. |

### Identity-table trade-off

Excluding Better Auth identity tables avoids breaking sign-in, session refresh, account linking, and verification flows that run without tenant GUCs. It also means the runtime database role can still query identity rows directly. If identity-table RLS is required, the design must decide whether Better Auth receives a separate restricted/auth-specific connection or another explicit bootstrap mechanism. Do not silently give the general application role `BYPASSRLS`.

## 5. Policy semantics to preserve

Any RLS implementation must remain consistent with already approved v0.1 authorization:

- No automatic Organization → Company → Plant operational permission inheritance.
- Explicit Organization/Company child-administration permissions apply only after the parent chain is verified.
- Company and Plant operational permissions require their own active typed membership/assignment paths.
- Applicable target-scope DENY overrides ALLOW.
- Custom roles are Organization-only and ALLOW-only; custom permission sets remain a subset of the creator's trusted delegable permissions.
- Unsealed or disabled role definitions, unknown permissions, and missing context fail closed.
- Role grant snapshots and audit history remain immutable/append-only as already implemented.

RLS is an additional data boundary, not a replacement for the application permission evaluator. It must not broaden policy semantics.

## 6. Required same-connection and pool-isolation tests

Before enabling policies, add a guarded disposable-PostgreSQL suite using the actual non-owner runtime role:

1. Within one interactive transaction, record `pg_backend_pid()` before and after context setup and protected query; assert it is unchanged.
2. Set tenant A context with `set_config(..., true)`; verify tenant A rows are visible and tenant B rows are not.
3. Commit, then query `current_setting('app.organization_id', true)` outside the transaction; assert no tenant value remains.
4. Repeat with rollback and with an exception thrown during the protected operation.
5. Reuse the same physical connection for tenant B; assert no tenant A context or rows survive.
6. Run concurrent A/B requests through a pool with deliberately constrained connections; assert no cross-tenant reads/writes.
7. Test missing and malformed GUC values; all policies must deny by default.
8. Test direct SQL under the runtime role, not only through the HTTP handler.
9. Verify SYSTEM catalog reads, custom-role ownership, audit reads/writes, and Better Auth sign-in/session operations under the selected role model.

The existing CI suites currently run most migration/integration checks using disposable service databases but do not establish this runtime-role RLS contract.

## 7. Owner decisions required before implementation

The following choices need explicit approval:

1. **Transaction contract:** approve one interactive transaction per protected operation, with server-derived actor and target context passed to all repositories through the transaction client.
2. **Tenant GUC contract:** approve the proposed `app.user_id`, `app.organization_id`, `app.company_id`, and `app.plant_id` names and transaction-local `set_config(..., true)` semantics.
3. **Runtime/migration roles:** approve separate non-owner, non-`BYPASSRLS` runtime role and migration/owner role; exact grants to be validated against the selected database provider.
4. **Initial RLS scope:** approve the tenant root, membership, assignment, role, and audit table classification above, with Better Auth identity tables excluded from the first increment.
5. **Identity-table follow-up:** decide whether identity-table RLS is explicitly out of scope for v0.1 or requires a separate auth-specific database client/role.

No RLS SQL, database role creation, GUC setup, or migration is authorized by this proposal. Hosted database operations remain separately gated.

## 8. Recommendation

Approve the transaction-bound execution boundary and tenant GUC semantics first. Then implement the repository/client injection and connection-reuse tests in disposable CI without enabling RLS. After that evidence passes, implement the first RLS policy increment under the approved runtime/migration role model and verify it through direct SQL plus the protected API path.

**V04 RLS and pooled-connection acceptance remains BLOCKED.**
