# V04 Security Readiness Audit — 2026-11-09

**Status:** V04 remains **BLOCKED**; no RLS or hosted-database implementation is authorized by this audit.  
**Audited ref:** `main` at `3fbe050f618795941ea24044dd09620c4b90f025` (after PR #36).  
**Method:** Read-only GitHub source inspection of the Prisma schema, authorization modules, protected API route, existing V04 audit/design documents, and GitHub Actions workflow.  
**Database access:** No local or hosted PostgreSQL connection was opened. No migrations, seeds, schema changes, database-role changes, RLS policies, or tenant GUCs were executed or created.

## Executive summary

The repository has a meaningful first authorization slice, but it is not yet a complete tenant-isolation boundary.

- Better Auth supplies the server-side actor identity.
- The target resolver verifies active Organization membership and Company/Plant ancestry.
- Persisted, sealed role-permission snapshots are loaded and evaluated by the v0.1 policy core.
- One protected application endpoint exists: `GET /api/organizations/[organizationId]/members`.
- The protected request is **not transaction-bound end to end**. Target resolution, grant loading, and the final member query use the global Prisma client independently.
- No RLS policy, tenant GUC, or non-owner runtime-role enforcement is present in the inspected source/migrations.
- No Company or Plant protected API routes were found in the current application API tree.
- The production delegable-permission provider for custom-role creation/revision is still documented as not wired.

These findings mean the current implementation provides a useful application-level authorization proof, not complete V04 acceptance. Keep V04 **BLOCKED**.

## Findings

| ID | Area | Evidence from current source | Assessment |
|---|---|---|---|
| V04-A01 | Authentication | `src/lib/auth-session.ts`; `src/lib/tenant-target-context.ts` | Actor identity is derived from the server-side Better Auth session, not accepted from request payload. |
| V04-A02 | Tenant target validation | `src/lib/tenant-target-context-core.ts`; `src/lib/tenant-target-context.ts` | Active Organization membership and Organization → Company → Plant ancestry are checked server-side. Target resolution is not itself a permission grant. |
| V04-A03 | Persisted grants | `src/lib/authorization-grant-loader.ts`; `prisma/schema.prisma` | Grant loader reads active typed assignments and sealed/enabled role definitions with persisted permission effects. It uses the global Prisma singleton. |
| V04-A04 | Policy evaluation | `src/lib/authorization-policy-core.ts` | Pure evaluator applies exact-scope grants, explicit child-administration rules, deny-overrides at target scope, and fail-closed handling for invalid identifiers. |
| V04-A05 | Protected operation | `src/lib/organization-members-reader.ts`; `src/app/api/organizations/[organizationId]/members/route.ts` | Organization member read checks `organization.members.read` before querying member data. This is the only protected API route found in the current API tree. |
| V04-A06 | Transaction boundary | `src/lib/tenant-target-context.ts`; `src/lib/authorization-grant-loader.ts`; `src/lib/tenant-authorization.ts`; `src/lib/organization-members-reader.ts` | **Gap:** resolver, grant loader, and protected read use independent global Prisma calls. They may use different pooled connections and are not one atomic authorization-and-data operation. |
| V04-A07 | RLS | Current migration SQL and server-side source inventory; prior `v04-rls-and-pool-isolation-inventory.md` | **Missing:** no `ENABLE/FORCE ROW LEVEL SECURITY`, `CREATE POLICY`, transaction-local tenant GUC setup, or `current_setting` policy checks found. |
| V04-A08 | Runtime database role | `src/lib/prisma.ts`; prior RLS design proposal | **Unproven:** runtime Prisma connection is configured from `DATABASE_URL`; repository source does not establish that its role is non-owner and lacks `BYPASSRLS`. Hosted role privileges were not inspected. |
| V04-A09 | Company/Plant application coverage | Current `src/app/api` tree | **Missing:** no Company or Plant protected route was found. Their policy and data-access paths need explicit positive and negative integration coverage. |
| V04-A10 | Custom-role delegation | `src/lib/role-definition-service.ts`; prior `v04-application-authorization-audit.md` | **Incomplete:** service contracts require trusted authorization/delegable-permission callbacks; production delegable-permission provider is not yet wired according to the existing audit. |
| V04-A11 | Pool isolation evidence | Current CI workflow and prior RLS inventory/proposal | **Missing:** no same-backend PID, commit/rollback GUC cleanup, reused-connection A/B, constrained-pool concurrency, or runtime-role direct-SQL RLS tests exist yet. |

## Approved policy constraints to preserve

The existing owner-approved v0.1 policy remains the governing application policy:

1. No automatic Organization → Company → Plant operational permission inheritance.
2. Organization-scoped child-administration grants are limited to the approved administrative operations and require verified target ancestry.
3. Company/Plant operational access requires the active typed membership/assignment and a role at the exact target scope.
4. Applicable target-scope DENY overrides ALLOW.
5. Custom roles are Organization-scoped and ALLOW-only; permissions must be within the creator's trusted delegable subset.
6. Tenant APIs cannot assign Platform Admin or platform-trust roles.
7. Break-glass remains unavailable under the current baseline.
8. Tenant-administration permissions do not authorize ERP operational modules.

This audit does not expand or reinterpret those approvals.

## Recommended implementation sequence

### Gate 1 — Approve the transaction-bound execution contract

Review `v04-rls-transaction-boundary-design-proposal.md` and explicitly decide the proposed transaction contract, context keys/order, role separation, table classification, and fail-closed semantics. The proposal is not owner-approved merely because it is merged documentation.

### Gate 2 — Implement transaction-bound application authorization

After approval, refactor the protected operation so the server-derived actor, target resolution, grant loading, policy evaluation, and protected query all use one interactive Prisma transaction client. Remove global-Prisma fallbacks from that transaction path. Add transaction-bound repository interfaces and positive/negative tests.

This application refactor can be reviewed separately from RLS policy activation if the owner wants a staged rollout.

### Gate 3 — Complete Company and Plant operation coverage

Add only explicitly approved administrative operations. Each must validate parent ancestry, active typed membership/assignment, exact-scope permission, and target ownership. Add cross-tenant and sibling-scope negative tests.

### Gate 4 — Approve database role and RLS policy details

Before implementation, approve the runtime/migration role split, per-table policy matrix, Better Auth identity-table treatment, bootstrap rules, and direct-SQL behavior. Confirm the actual hosted provider supports the intended role/network controls without connecting to or changing the hosted database during this design step.

### Gate 5 — Implement and test RLS on disposable PostgreSQL

Only after explicit approval, add forward-only migrations and test with a non-owner, non-superuser, non-`BYPASSRLS` runtime-equivalent role. Required tests include same-connection PID, transaction-local GUC cleanup after commit and rollback, connection reuse between tenant A/B, concurrent requests, missing/malformed context, and direct SQL.

### Gate 6 — Re-audit acceptance evidence

Do not mark V04 complete until application authorization, tenant-context propagation, protected-operation rejection, RLS enforcement, pooled-connection isolation, and end-to-end tenant isolation are all proven. Hosted/production evidence remains a separate gated activity requiring explicit approval.

## Scope and safety boundary

This audit is documentation only. It does not authorize:
- RLS SQL or policy creation;
- database role creation or grants;
- tenant GUC setup in application code;
- Prisma schema or migration changes;
- local or hosted database access, migration, seed, cleanup, or deployment;
- changes to Better Auth deletion/session lifecycle.

**Final decision: V04 remains BLOCKED. The next engineering increment should be the owner-approved transaction-bound application authorization contract, not immediate RLS activation.**
