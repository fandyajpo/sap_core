# Prisma Postgres Production Access Model

Status: operational runbook draft. This document reflects Prisma Postgres provider constraints confirmed during the November 2026 hosted deployment. It does not claim database-level least-privilege isolation.

## Provider constraint — no custom PostgreSQL roles

Prisma Postgres does not support custom PostgreSQL roles. The connection-string user is provider-managed, cannot create roles, and every generated credential has the same full database access. The hosted attempt to create `sap_core_runtime` failed with:

```text
ERROR: restricted superuser cannot create roles
```

Do not retry `CREATE ROLE`, `CREATE USER`, or `GRANT` to an invented runtime role. Do not claim that a second connection string is a restricted database role.

A separate Prisma Postgres credential can still be useful for operational secret separation and independent revocation. It does **not** reduce PostgreSQL privileges. Runtime and migration credentials therefore remain equally privileged at the database layer.

Official provider references:
- https://www.prisma.io/docs/postgres/faq
- https://www.prisma.io/docs/postgres/database/connecting-to-your-database

## Current hosted database state

As of the recorded deployment:
- The intended hosted database is `postgres`.
- All 13 repository migrations were successfully applied.
- Migration history reports 13 successful migrations and 0 rolled-back migrations.
- The hosted database has 21 application tables across `core` and `master_data`.
- The 13 intended V04 tenant tables have RLS enabled; the migration does not FORCE RLS.
- All 21 application tables are owned by the provider migration identity.
- Creating `sap_core_runtime` was rejected by Prisma Postgres. No runtime role or grants were created.

These observations do not prove that the hosted database enforces tenant isolation against its full-access credential. Application-layer authorization is the primary security boundary.

## Connection-string handling

Prisma Postgres provides two endpoint forms for a credential:
- pooled endpoint: use for application traffic and serverless concurrency;
- direct endpoint: use for Prisma migrations, introspection, and administrative tooling.

Both endpoints for a credential share the same database user and password. Separate credentials have distinct passwords but identical full database privileges.

Repository configuration:
- `src/lib/prisma.ts` reads `DATABASE_URL` for application queries.
- `prisma.config.ts` requires `MIGRATION_DATABASE_URL` and does not fall back to `DATABASE_URL`.

Deployment rules:
1. Set `DATABASE_URL` to the pooled Prisma Postgres endpoint for the application.
2. Set `MIGRATION_DATABASE_URL` to a direct endpoint for a separately managed migration credential.
3. The separate migration credential is for secret lifecycle separation only; it is not a restricted role.
4. Keep the migration credential out of the Vercel application runtime environment. Supply it only to a trusted migration job or operator environment.
5. Keep the runtime credential in the Vercel server-side environment only. Never expose it through `NEXT_PUBLIC_*`, client bundles, logs, or error messages.
6. Use separate generated credentials where operational revocation boundaries are useful. Record credential identifiers/last-four metadata only; never commit connection strings.
7. Delete a credential explicitly when revocation must be certain. Provider documentation warns that rotation may fail to remove the previous password without surfacing that failure.

For local development, `.env.example` may point both variables at the same disposable local database. Never copy local credentials into hosted production.

## Application-layer authorization requirements

Because the hosted database credential has full access, every tenant-facing operation must enforce authorization in trusted server code. A tenant ID, user ID, role, permission, or scope supplied by the browser is untrusted input.

Required invariants:
- Resolve the actor only from a verified Better Auth session.
- Revalidate and hold a shared lock on the exact session row and expiry inside the protected transaction.
- Hold shared locks on the active Organization membership and validated Company/Plant ancestry rows until the protected transaction completes, so concurrent suspension or ancestry changes serialize with the protected operation.
- Hold shared locks on the effective role-assignment, membership/assignment ancestry, role-definition, and permission-grant rows used to calculate the decision, so concurrent revocation or role disablement cannot invalidate a decision mid-operation. Effective-assignment listing also locks the rows it returns until commit.
- Derive actor identity server-side; reject caller-supplied actor identity fields.
- Verify active Organization membership before accessing tenant resources.
- Verify Company belongs to the requested Organization and Plant belongs to both the requested Company and Organization.
- Load persisted role assignments and permission grants for the verified actor and exact target scope.
- Apply explicit DENY precedence and delegation/role-governance constraints.
- Perform authorization reads and the protected read/write in the same database transaction.
- Use parameterized SQL. Never interpolate untrusted identifiers into SQL. Dynamic table/column fragments must come only from closed server-side allowlists.
- Do not expose a raw Prisma client, generic query executor, or unbound tenant service to request handlers.
- Background jobs and administrative operations must have explicit, separate trusted entry points and must not impersonate a browser actor.
- Fail closed on missing session, membership, scope ancestry, permission, or malformed persisted policy data.

RLS and transaction-local tenant GUCs remain defense-in-depth and useful for disposable PostgreSQL integration testing. On Prisma Postgres, do not present them as a boundary against arbitrary SQL executed with the provider credential.

## Verified application paths and remaining audit

The following code paths were inspected on `main`:
- `requireTenantPermission` locks/revalidates the Better Auth session, sets transaction-local actor context, resolves active membership and target ancestry, loads persisted grants, and evaluates the requested permission.
- Organization member, Company, Plant, Organization role listing, custom role create/revise, and role-assignment adapters use server-derived sessions and/or transaction-bound authorization.
- `createSessionBoundScopedAccessDatabase` binds the exact session identity and locks the session row in the same transaction.
- Tenant target resolution now holds shared locks on the active Organization membership, Company row, and Plant plus parent Company rows while the protected query runs.
- Permission evaluation holds shared locks on the effective persisted role assignments and role/permission rows for the target scope until the protected operation commits.
- Custom role create/revise authorization holds shared locks on the acting user's active Organization membership and the persisted delegation grants through commit.
- The unbound `scopedAccessDatabase` export was removed from `src/lib/scoped-access.ts` in this change. The current production adapters use `createSessionBoundScopedAccessDatabase`; the complete call-site inventory and static enforcement remain required before declaring the audit complete.
- A source inventory was completed for the tracked TypeScript/TSX files under `src/`: all API route handlers, server pages, client components, and library modules were inspected. Tenant API routes delegate to the guarded readers/services; the account/home pages require a Better Auth session; sign-in/register pages only resolve auth state; client components call Better Auth client APIs. No Next.js `"use server"` action was found. The production Prisma entry points found were Better Auth's adapter, the session-bound scoped-access transaction factory, and the explicit transaction-bound member/resource/role readers. `createScopedAccessService` remains test-only in the inspected call-site inventory. No background worker or scheduled job source was present under `src/`; any external deployment cron/worker must still be inventoried separately.

This document is not a claim that every application call-site or every adversarial HTTP path has been exhaustively audited. The unbound `scopedAccessDatabase` export was removed from `src/lib/scoped-access.ts` in this change; production code must use `createSessionBoundScopedAccessDatabase` and still apply operation-specific authorization. Complete the remaining checks before production traffic:
1. Inventory every Prisma client access, raw SQL call, service constructor, server action, route handler, server component, and background entry point.
2. Prove each tenant-facing path is protected by the verified-session and permission boundary; keep all unbound adapters out of production call-sites.
3. HTTP-level coverage on PR #69 adds exact-scope Company/Plant allow checks, sibling Company/Plant denial, and rejection of non-delegable `roles.assign` during custom-role creation. The existing HTTP suite covers unauthenticated requests, spoofed actor/recipient IDs, cross-Organization identifiers, malformed input, revoked-session rejection, and suspended-membership rejection. The HTTP suite passes 10/10 tests, including the deterministic concurrent role-assignment revocation lock test. CI run [#42629490606](https://github.com/fandyajpo/sap_core/actions/runs/42629490606) passed all 8 jobs on PR #69 head `7955f5f9a8d5979d4de5780a82d5a62dbf08e288`.
4. Concurrency coverage proves request-first session revocation waits for the protected request, revocation-first rejects the later request, Organization membership suspension waits behind a protected request that already locked the membership, and the effective role-assignment/membership/role-definition/permission-grant lock set serializes a protected read against concurrent role-assignment revocation. The last case is exercised in the disposable PostgreSQL integration suite by acquiring the production-equivalent `FOR SHARE` lock set, performing the protected read in the same transaction, and verifying the revocation UPDATE waits until commit.
5. PR #69's CI runs the adversarial suites against its disposable PostgreSQL integration database. Keep RLS tests, but distinguish what they prove locally from what Prisma Postgres enforces. No hosted database was used for this PR.
6. Review production logs, error handling, and client payloads to ensure secrets, SQL, and internal authorization details are not disclosed.

### Explicit DENY policy status

The governed tenant DENY policy model is now implemented separately from role-definition permission snapshots. It persists exact-scope policies in `core.tenant_deny_policy`, with an immutable append-only `core.tenant_deny_audit_event` history, database-enforced permission/scope eligibility, membership identity and Company/Plant ancestry constraints, one-time attributable revocation, and an ORG_OWNER-only service/API boundary. Both tables have Organization-context RLS in migration `20261111120000_v04_deny_policy_rls`; this RLS is validated against a non-owner runtime role in disposable PostgreSQL CI. This does not make RLS a hosted Prisma Postgres security boundary: its provider-managed credentials have full database privileges. Hosted tenant authorization therefore continues to rely primarily on the verified-session, transaction-bound application layer described above.

## Vercel environment

When a Vercel project is created:
- Application server environment: pooled `DATABASE_URL`, `BETTER_AUTH_SECRET`, and canonical HTTPS `BETTER_AUTH_URL`.
- Trusted migration environment only: direct `MIGRATION_DATABASE_URL`.
- Do not configure `MIGRATION_DATABASE_URL` in the Vercel application runtime.
- Do not assume the separate credentials have different database privileges.
- Confirm the Next.js runtime is Node.js for the current Prisma TCP client.

## Deployment gate

Do not mark production security readiness complete until:
- [x] Tracked application-source call-site inventory is complete for `src/` TypeScript/TSX; no server actions or in-repository background workers were found. External deployment cron/worker configuration remains outside this repository audit.
- [x] No tenant request path in the inspected `src/` tree uses an unbound database/service adapter.
- [x] HTTP-level adversarial authorization tests pass on PR #69 CI (8/8 jobs); merge and main-branch validation are still pending.
- [x] Concurrency coverage passes for session revocation, membership suspension, and effective role-assignment revocation ordering.
- [ ] Secret handling and production environment separation are verified.
- [ ] The residual risk of a full-access hosted database credential is explicitly accepted.
- [ ] A backup/restore plan appropriate to the Prisma Postgres plan is verified.

No hosted database role provisioning is possible on Prisma Postgres. No custom runtime role is expected or required by this runbook.
