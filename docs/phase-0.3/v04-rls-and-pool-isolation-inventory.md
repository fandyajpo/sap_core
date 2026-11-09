# V04 RLS and Pooled-Connection Query Inventory

**Status:** Inventory only — no RLS policy or tenant-session contract is approved by this document  
**Audited ref:** `main` after PR #32 (`e52b3c1d620be17a03eb199734869f02831ec39b`)  
**Scope:** Current Prisma client, server-side data-access modules, transaction abstractions, Better Auth adapter, tenant-context resolution, persisted authorization grant loading, and protected Organization members API.  
**Database access:** Repository source inspection only. No local or hosted database was connected to, queried, migrated, or modified.

## Executive finding

The repository has a usable transaction abstraction for existing membership and role-management services, but the new authorization request path is not yet transaction-bound end to end. Tenant target resolution, grant loading, and the protected Organization member query each use the global Prisma client independently. They can therefore run on different pooled connections and do not share one transaction.

No migration or source file currently enables PostgreSQL Row Level Security (RLS), creates a policy, sets a tenant GUC, or reads tenant context through `current_setting`. RLS and pooled-connection isolation remain **BLOCKED**. This inventory deliberately does not implement RLS or choose a database role/policy model.

## Actual query and transaction inventory

| Module / path | Current database behavior | Transaction boundary | RLS implication |
|---|---|---|---|
| `src/lib/prisma.ts` | Creates one global Prisma Client using `PrismaPg({ connectionString: DATABASE_URL })`; no explicit pool size, idle timeout, or connection lifetime settings are configured here. | Shared adapter/pool; no tenant transaction wrapper. | A session-level tenant setting could survive on a reused pooled connection. Never use session-level `SET` for tenant identity. |
| `src/lib/scoped-access.ts` | Adapts Prisma `$queryRawUnsafe(statement, ...values)` to the parameterized `ScopedAccessSession.query` interface. | Uses interactive `prisma.$transaction((transaction) => ...)` for service transactions. | Existing pattern demonstrates passing a transaction-bound client to a service. Keep all tenant-context setup and protected queries on that same transaction client. |
| `src/lib/scoped-access-service.ts` | Membership and assignment reads/writes use parameterized SQL; lifecycle operations lock current rows with `FOR UPDATE`. Some read helpers execute directly through the database interface. | Membership/assignment create, suspend, restore, revoke and end operations use `database.transaction`; access predicates may use the non-transaction session. | Inventory each read/write entry point before deciding which tables receive policies and which calls must be wrapped. |
| `src/lib/role-assignment-service.ts` | Reads role definitions and typed membership/assignment parents; inserts assignments and break-glass audit rows. | Role grants and break-glass use execute inside `database.transaction`. Authorization callbacks are injected and may perform their own reads. | Callback queries must use the same transaction-bound session if they depend on tenant context; global Prisma reads would escape the transaction. |
| `src/lib/role-definition-service.ts` | Reads permission catalog, creates immutable grant snapshots, seals RoleDefinitions, and appends audit events. | Create and revise run inside `database.transaction`; role-family serialization uses `pg_advisory_xact_lock`. | Preserve atomic create/grant/seal/audit behavior. Any future RLS context must be set on the transaction connection before protected table access. |
| `src/lib/tenant-context.ts` | Resolves active Organization → Company → Plant membership chains through direct global Prisma `$queryRaw` calls. | No shared transaction across resolver queries. | Separate queries may use different pooled connections; no tenant context is propagated. |
| `src/lib/tenant-target-context.ts` | Resolves current actor's active Organization membership and validates Company/Plant ancestry through direct global Prisma `$queryRaw` calls. | No shared transaction. | Target validation is separate from grant loading and later business query. |
| `src/lib/authorization-grant-loader.ts` | Loads Organization, Company and Plant role grants using one parameterized Prisma `$queryRaw` with active typed membership/assignment joins, sealed/enabled role filters, and persisted permission effects. | Uses global Prisma, not a transaction client supplied by the caller. | The loader must be callable with the same transaction-bound client as target resolution and the protected operation before RLS can safely rely on transaction-local context. |
| `src/lib/tenant-authorization.ts` | Calls target resolver, grant loader and pure evaluator in sequence. | Does not open or pass a shared transaction. | It is an authorization guard, not yet an RLS execution boundary. |
| `src/lib/organization-members-reader.ts` | Executes the parameterized Organization member list query through global Prisma after `requireTenantPermission` succeeds. | Query is separate from authorization reads. | A future RLS policy would see whichever pooled connection serves this query; the earlier permission check does not set context on that connection. |
| `src/app/api/organizations/[organizationId]/members/route.ts` | Calls the protected reader and maps authentication/tenant/permission errors to HTTP responses. | No transaction of its own. | Must delegate to a transaction-bound authorized reader once the RLS execution contract is approved. |
| `src/lib/auth.ts` | Better Auth uses the Prisma adapter for user, session, account and verification data. | Auth operations use the global Prisma client and Better Auth lifecycle. | Authentication tables need an explicit inclusion/exclusion decision. Tenant GUCs must not leak into unrelated auth requests or be assumed to exist for Better Auth. |

## RLS and tenant-context evidence

Repository-wide inspection of the current migration SQL and server-side source found no occurrences of:

- `ENABLE ROW LEVEL SECURITY` or `FORCE ROW LEVEL SECURITY`
- `CREATE POLICY`
- `SET LOCAL` or `set_config(..., true)` for tenant context
- `current_setting(...)` for tenant context
- A database execution role explicitly configured as non-owner / non-`BYPASSRLS`

Therefore there is no current RLS enforcement evidence and no tenant GUC contract to preserve.

## Concrete connection-safety conclusion

The current protected Organization member flow is:

1. `getCurrentSession()` resolves the Better Auth session.
2. `resolveTenantTargetContext()` queries active Organization membership and validates the target.
3. `loadAuthorizationGrants()` queries persisted role assignments and permission grants.
4. `evaluateAuthorization()` evaluates the requested permission.
5. `listOrganizationMembers()` queries Organization member rows.

Steps 2, 3 and 5 currently use the global Prisma client independently. An interactive transaction used only around step 5 would not solve this: target resolution and grant loading must also use the same transaction client if transaction-local tenant context is to govern all reads.

A session-level `SET app.organization_id = ...` is unsafe with pooling because a later request can reuse the connection. No such setting should be introduced.

## Requirements before RLS implementation

The following are implementation requirements, not approved policy decisions:

1. Define a single transaction-bound server API that owns the complete protected request: derive the actor from Better Auth, resolve target and active membership, load persisted grants, evaluate permission, set verified transaction-local context, and execute the protected query using the same transaction client.
2. Decide the ordering of user context and tenant context. Membership resolution itself may need an RLS-compatible bootstrap policy; do not assume the Organization ID is trusted before parent membership validation.
3. Choose application and migration database roles. Verify the application role is not a table owner and does not have `BYPASSRLS`; decide where `FORCE ROW LEVEL SECURITY` is required.
4. Classify tables individually: tenant-owned business rows, membership/assignment rows, role and permission catalog, audit rows, and Better Auth identity/session tables. Do not blanket-enable RLS on all schemas.
5. Define missing-context behavior as deny-by-default. Missing or malformed transaction-local context must never widen access.
6. Keep all statements that depend on tenant context on the transaction-bound Prisma client. Do not call the global Prisma singleton from inside the protected transaction callback.
7. Preserve existing role snapshot immutability, audit append-only behavior, membership lifecycle, and P05 foreign-key restrictions.

## Required isolation tests

- Execute tenant A then tenant B on the same physical PostgreSQL backend connection; verify no GUC or row visibility from A survives into B.
- Verify the backend PID remains the same within an interactive transaction and the tenant context is transaction-local.
- After commit and rollback, query `current_setting(..., true)` outside the transaction and verify tenant context is absent.
- Throw during authorization and during the protected query; verify rollback does not leak context.
- Run two concurrent requests for different tenants and verify no cross-tenant result or context.
- Test with the actual application database role, not a migration owner or superuser.
- Test direct SQL access as well as the application route; application-only predicate tests are not RLS evidence.

## Recommended next deliverable

Prepare a separately reviewed design for the transaction-bound tenant execution contract and database role model. Include a migration/policy impact inventory by table and the exact connection-reuse tests. Obtain explicit owner approval before adding any RLS policy, database role change, tenant GUC, or migration.

**V04 RLS and pooled-connection acceptance remains BLOCKED.**
