# V04 Tenant RLS and Runtime Role Contract

**Status:** Repository implementation and disposable-CI validation in progress  
**Approved baseline:** Owner approved `v04-rls-transaction-boundary-design-proposal.md` on 2026-11-09  
**Scope:** Core tenant-administration tables only; this is not ERP operational RLS.  
**Hosted database:** Not accessed or modified. Production role provisioning and migration remain separately gated.

## Connection contract

- `DATABASE_URL` is the application runtime connection. It must authenticate as a non-superuser, non-table-owner role with `BYPASSRLS = false`.
- `MIGRATION_DATABASE_URL` is the migration/owner connection used by Prisma CLI. It must never be supplied to application request handlers.
- `prisma.config.ts` prefers `MIGRATION_DATABASE_URL` for migrations and falls back to `DATABASE_URL` for existing local/CI workflows that have not configured a separate migration URL.
- The runtime Prisma client in `src/lib/prisma.ts` reads only `DATABASE_URL`.
- CI creates a disposable `sap_core_runtime` role and uses separate owner/runtime URLs. It asserts the runtime role is neither superuser nor `BYPASSRLS`, and owns none of the RLS tables.

Do not point either URL at a hosted database unless the separate hosted-database approval is granted. Never paste connection strings or credentials into chat, commits, logs, or evidence.

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

The permission catalog now carries an owner-controlled `is_delegable` flag. It defaults to `false` for every existing permission and is read-only to the runtime role. Custom-role create/revise authorization uses this catalog flag in addition to the creator's persisted Organization role grants; a permission is delegable only when it is both effectively ALLOW and explicitly marked delegable. DENY removes it from the delegable set. Until an owner-approved permission classification is applied through a forward migration, custom-role creation/revision fails closed.

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
- Custom role insertion is limited to Organization-owned custom roles; grant insertion is allowed only before the permission snapshot is sealed.
- Append-only grant/audit triggers and application-level permission evaluation remain authoritative.
- RLS is defense-in-depth, not a replacement for the server-side authorization evaluator.

The migration uses `ENABLE ROW LEVEL SECURITY` and does not use `FORCE ROW LEVEL SECURITY`: the migration owner must retain owner access for migrations, while the application role is explicitly required to be a non-owner. The CI suite verifies this distinction. Do not run the application with the migration/owner role.

## Remaining production gate

The repository migration and CI role test do not prove the hosted provider's role capabilities, networking, or deployed privileges. Before production use, separately provision the runtime role and grants on the selected hosted database, configure the two URLs through the deployment secret manager, verify the runtime identity/ownership/RLS flags, and run an approved hosted smoke test. No hosted connection, role creation, migration, seed, or deployment is authorized by this document.
