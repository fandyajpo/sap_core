# V04 Tenant RLS and Runtime Role Contract

**Status:** Repository implementation and disposable-CI RLS validation PASS; hosted Prisma Postgres cannot provide a restricted runtime role, so RLS is not a hosted security boundary  
**Approved baseline:** Owner approved `v04-rls-transaction-boundary-design-proposal.md` on 2026-11-09  
**Scope:** Core tenant-administration tables only; this is not ERP operational RLS.  
**Hosted database:** Prisma Postgres provider constraints are documented in `docs/operations/production-database-roles.md`. No hosted database was accessed or modified during this V04 RLS validation.

## Connection contract

- On a PostgreSQL provider that supports custom roles, `DATABASE_URL` must authenticate as a non-superuser, non-table-owner role with `BYPASSRLS = false` for RLS to enforce the tenant boundary.
- **Prisma Postgres exception:** the provider does not support custom PostgreSQL roles and its generated credentials have full database privileges. The disposable-CI runtime-role guarantee does not transfer to Prisma Postgres. Treat application-layer session-bound authorization as the primary hosted security boundary; hosted RLS is defense-in-depth only and must not be represented as protection against arbitrary SQL using the provider credential.
- `MIGRATION_DATABASE_URL` is the migration/owner connection used by Prisma CLI. It must never be supplied to application request handlers.
- `prisma.config.ts` requires `MIGRATION_DATABASE_URL` for every Prisma CLI command and fails closed when it is absent; it does not fall back to `DATABASE_URL`.
- The runtime Prisma client in `src/lib/prisma.ts` reads only `DATABASE_URL`.
- CI creates a disposable `sap_core_runtime` role on its own PostgreSQL service and uses separate owner/runtime URLs. It asserts the runtime role is neither superuser nor `BYPASSRLS`, and owns none of the RLS tables. This verifies the RLS design on ordinary PostgreSQL only.

Do not point either URL at a hosted database unless the separate hosted-database approval is granted. Never paste connection strings or credentials into chat, commits, logs, or evidence. On Prisma Postgres, separate credentials are for secret lifecycle separation, not privilege separation.

## Transaction-local tenant context

A protected request must use one interactive Prisma transaction for target resolution, persisted grant loading, policy evaluation, and the protected query.

1. Resolve Better Auth session before opening the tenant transaction.
2. Set `app.user_id` from the verified server session using `set_config(..., true)`.
3. Resolve the actor's active Organization membership. The membership bootstrap policy permits only that actor's own ACTIVE row before an Organization context exists.
4. Once membership is verified, set `app.organization_id` transaction-locally.
5. For Company/Plant targets, verify each descendant before setting `app.company_id` and `app.plant_id` respectively.
6. Load grants and execute the protected operation on the same transaction client.
7. Commit/rollback; PostgreSQL clears all transaction-local values on either outcome.

The `app.*` values are context selectors, not credentials or proof of user identity. They must only be set by trusted server code after session and ancestry validation. Never use session-level `SET` for tenant context.

## RLS table classification

RLS is enabled for:

- Tenant roots: `core.organization`, `core.company`, `core.plant`.
- Membership/assignment: `core.organization_membership`, `core.company_membership`, `core.plant_assignment`.
- Role assignments: `core.organization_role_assignment`, `core.company_role_assignment`, `core.plant_role_assignment`.
- Role definitions/grants: `core.role_definition`, `core.role_permission_grant`.
- Audit: `core.role_definition_audit`, `core.break_glass_access_audit`.
- Explicit DENY governance: `core.tenant_deny_policy`, `core.tenant_deny_audit_event`. Both tables are protected by Organization-context RLS in the forward migration `20261111120000_v04_deny_policy_rls`.

The immutable permission catalog is paired with an owner-controlled `core.permission_delegation_policy` table. It is seeded with `is_delegable = false` for every permission and is read-only to the runtime role. Custom-role create/revise authorization reads this separate policy table in addition to the creator's persisted Organization role grants; a permission is delegable only when it is both effectively ALLOW and explicitly marked delegable with approval metadata. DENY removes it from the delegable set. Until an owner-approved permission classification is applied through a forward migration, custom-role creation/revision fails closed.

The following remain outside the initial tenant RLS scope:

- Better Auth identity/session tables: `core.user`, `core.session`, `core.account`, `core.verification`. Better Auth sign-in, refresh, account linking, and verification run without tenant context.
- Global permission catalog: `core.permission_definition`, read-only to the runtime role.
- Validation fixtures and ERP schemas without tenant business-row models.

SYSTEM role definitions and their permission snapshots are a global read-only catalog. Organization custom roles and their grants/audit are visible only within their owning Organization. Typed role-assignment rows are visible only when their typed parent row is visible in the same tenant context.

## Policy behavior

- Missing or malformed tenant context matches no tenant UUID rows.
- Before Organization context is established, only the verified actor's own ACTIVE Organization membership is visible.
- Organization context reveals only that Organization and its descendants.
- Company context narrows Company/Plant and Company/Plant membership/assignment rows to that Company.
- Plant context narrows Plant/Plant Assignment rows to that Plant.
- Organization, Company, and Plant audit visibility is constrained to the selected target scope and descendants; child scope does not expose parent-scope audit rows.
- DENY policy rows are visible and writable only when `app.organization_id` matches their `organization_id`; DENY audit rows are visible and insertable only for that Organization. The DENY service layer separately enforces owner-only policy management, while append-only triggers protect audit history.
- Custom role insertion is limited to Organization-owned custom roles; grant insertion is allowed only before the permission snapshot is sealed.
- Append-only grant/audit triggers and application-level permission evaluation remain authoritative.
- RLS is defense-in-depth, not a replacement for the server-side authorization evaluator.

The migration uses `ENABLE ROW LEVEL SECURITY` and does not use `FORCE ROW LEVEL SECURITY`: the migration owner must retain owner access for migrations, while a separately provisioned application role must be a non-owner on providers that support that model. The CI suite verifies this distinction on disposable PostgreSQL. Prisma Postgres does not support that runtime-role model; do not claim its provider-managed runtime credential is restricted by RLS.

## Remaining production gate

The repository migration and CI role test do not prove hosted provider privileges or deployed configuration. For Prisma Postgres, a restricted runtime role cannot be provisioned; keep the session-bound application authorization boundary, keep the migration credential out of the application runtime, and explicitly accept the full-access hosted credential residual risk before production use. If the provider changes to one supporting custom roles, separately provision and verify a non-owner, non-BYPASSRLS runtime role and grants before relying on RLS. No hosted connection, role creation, migration, seed, or deployment is authorized by this document.
