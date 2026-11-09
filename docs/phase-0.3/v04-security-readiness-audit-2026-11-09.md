# V04 Security Readiness Audit — 2026-11-09

**Status:** <badge> not supported in Markdown; use plain text below.

**Repository and disposable-CI acceptance:** PASS  
**Hosted/production acceptance:** BLOCKED pending separate approval and provider verification.  
**Audited ref:** `main` at `3fae765a396d0aa62e62c700f526f4020c88d227`.  
**CI evidence:** GitHub Actions run `42571552875` — all 8 jobs succeeded on the exact PR head before squash merge.  
**Database boundary:** Disposable PostgreSQL CI was used. No hosted database was connected to, inspected, migrated, seeded, or modified.

## Executive summary

The V04 repository implementation now has a transaction-bound application authorization path, tenant RLS on the approved Core tables, a separate migration/runtime connection contract, and disposable-PostgreSQL evidence.

Implemented evidence:

- Better Auth actor identity is resolved server-side before the tenant transaction.
- Protected authorization, target resolution, persisted grant loading, and protected data reads use one interactive Prisma transaction.
- Transaction-local GUCs are set only after the relevant actor membership and target ancestry have been validated.
- RLS is enabled on 13 approved tenant, membership, assignment, role, and audit tables.
- CI verifies a non-superuser, non-owner runtime role without `BYPASSRLS`; the migration/owner connection is separate.
- Company and Plant protected read endpoints exercise exact-scope authorization and sibling-scope denial.
- Organization role listing and custom-role create/revision routes use the verified session and transaction-bound provider.
- Permission delegation is fail-closed: all rows in `core.permission_delegation_policy` are seeded non-delegable. The positive custom-role test temporarily applies an approval in disposable CI and restores it.

The repository and disposable CI boundary are verified. Production remains blocked because the owner has not yet approved the exact delegable-permission classification, and hosted-provider role capabilities and deployed privileges have not been verified.

## Findings

| ID | Area | Current evidence | Assessment |
|---|---|---|---|
| V04-A01 | Authentication | `src/lib/auth-session.ts`; Better Auth session used by server-only operations | PASS — actor comes from the verified session, not request payload. |
| V04-A02 | Tenant target validation | `src/lib/tenant-target-context-core.ts`; `src/lib/tenant-target-context.ts` | PASS — active Organization membership and Company/Plant ancestry are validated server-side. |
| V04-A03 | Persisted grants | `src/lib/authorization-grant-loader.ts`; `src/lib/tenant-authorization.ts` | PASS — active typed assignments and sealed/enabled role snapshots are loaded in the protected transaction. |
| V04-A04 | Policy evaluation | `src/lib/authorization-policy-core.ts` | PASS — exact-scope grants, explicit child-administration, target-scope DENY precedence, and fail-closed identifiers. |
| V04-A05 | Protected operations | Organization members GET; Company GET; Plant GET; Organization roles GET/POST and revision POST | PASS for the implemented API slice. This does not imply unimplemented mutation or ERP routes are protected. |
| V04-A06 | Transaction boundary | `src/lib/tenant-authorization.ts`; `src/lib/tenant-target-context.ts`; tenant readers | PASS — actor, target context, grants, evaluation, and protected query share one interactive transaction. |
| V04-A07 | RLS | `20261109130000_v04_tenant_rls`; `tests/v04-rls.integration.test.mjs` | PASS in disposable PostgreSQL — 13 approved tables have RLS enabled and direct SQL is tested under the runtime role. |
| V04-A08 | Runtime database role | `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `prisma.config.ts`, CI runtime-role fixture | PASS in CI only — runtime role is non-superuser, non-owner, and lacks `BYPASSRLS`. Hosted role privileges remain unverified. |
| V04-A09 | Company/Plant application coverage | `GET /api/organizations/[organizationId]/companies/[companyId]`; nested Plant GET | PASS — positive exact-scope and sibling-scope negative HTTP tests. |
| V04-A10 | Custom-role delegation | `src/lib/tenant-role-definition-service.ts`; `core.permission_delegation_policy` | IMPLEMENTED, POLICY-GATED — provider is wired; all delegable flags remain false until the owner approves the exact permission set. |
| V04-A11 | Pool isolation evidence | `tests/v04-tenant-guc.integration.test.mjs`; `tests/v04-rls.integration.test.mjs` | PASS in disposable CI — backend PID stability, commit/rollback/exception cleanup, concurrent A/B transactions, missing/malformed GUCs, and direct SQL. |

## Preserved policy constraints

1. No automatic Organization → Company → Plant operational permission inheritance.
2. Organization child-administration is limited to approved administrative operations and requires verified ancestry.
3. Company/Plant operational access requires active typed membership/assignment and an exact-scope role.
4. Applicable target-scope DENY overrides ALLOW.
5. Custom roles are Organization-scoped and ALLOW-only; permissions must be within the creator's trusted delegable subset.
6. Tenant APIs cannot assign Platform Admin or platform-trust roles.
7. Break-glass remains unavailable.
8. Tenant-administration permissions do not authorize ERP operational modules.

## Implementation sequence and evidence

| Gate | Result | Evidence |
|---|---|---|
| Transaction-bound authorization | PASS | PR #38 / #39; same-transaction readers and tenant GUC tests. |
| Tenant GUC and pool isolation | PASS | `tests/v04-tenant-guc.integration.test.mjs`. |
| RLS and runtime-role enforcement | PASS in disposable CI | PR #40; 13-table direct-SQL suite; runtime role checks. |
| Company/Plant protected reads | PASS | PR #41; HTTP positive and sibling-scope negative cases. |
| Custom-role provider and API | PASS in disposable CI; policy classification pending | PR #42; create/revise, actor spoofing, and role-list tests. |
| Hosted production verification | NOT RUN | Requires separate explicit approval; no hosted connection or change was made. |

## Remaining acceptance gates

1. **Permission delegation policy:** approve the exact permission codes that may be delegated. Until then, all `permission_delegation_policy.is_delegable` values remain false and custom-role create/revision fails closed for non-empty permission sets.
2. **Hosted database:** separately approve provider-specific runtime-role provisioning, grants, deployment secret configuration, hosted migration, and a production smoke test. The disposable CI role does not prove hosted provider capabilities.
3. **Scope discipline:** the current API proof covers Organization member read, Company read, Plant read, and Organization role list/create/revision. Future membership/assignment mutation and ERP routes require their own exact-scope authorization and tests.

**Conclusion:** Repository implementation and disposable-CI acceptance are PASS. V04 production acceptance remains BLOCKED by the two owner-controlled gates above.
