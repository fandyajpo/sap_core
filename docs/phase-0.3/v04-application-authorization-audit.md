# V04 Application Authorization Audit

**Status:** Repository application authorization and disposable-CI tenant-isolation evidence PASS; production acceptance remains BLOCKED.  
**Audited ref:** `main` at `3fae765a396d0aa62e62c700f526f4020c88d227`.  
**CI evidence:** Run `42571552875` — all 8 jobs succeeded before merge.  
**Scope:** Better Auth session boundary, tenant context, persisted grants, protected API operations, custom roles, RLS, and pooled-connection isolation.

## Executive finding

The first Organization member-read path has been extended into a transaction-bound tenant authorization boundary.

1. Better Auth session is resolved server-side before the tenant transaction.
2. The actor's active Organization membership and Company/Plant ancestry are validated on the same transaction client.
3. Transaction-local `app.user_id`, `app.organization_id`, `app.company_id`, and `app.plant_id` are installed only after validation.
4. Persisted role grants are loaded from active typed assignments and sealed/enabled RoleDefinitions.
5. The v0.1 evaluator checks the exact target permission, with applicable target-scope DENY precedence.
6. The protected query executes through the same transaction client.
7. PostgreSQL RLS independently enforces the approved tenant table set under a non-owner runtime role.

## Evidence inventory

| Area | Current implementation | Result |
|---|---|---|
| Authentication | Better Auth with Prisma adapter; server-derived session actor | PASS |
| Tenant target context | Active Organization membership and verified Company/Plant ancestry; incremental transaction-local GUCs | PASS |
| Permission persistence | 15 permission codes, eight typed SYSTEM roles, sealed snapshots, immutable grant rows | PASS |
| Tenant RLS | Migration `20261109130000_v04_tenant_rls`; 13 tables | PASS in disposable PostgreSQL |
| Runtime/migration roles | Runtime `DATABASE_URL`; migration `MIGRATION_DATABASE_URL`; separate CI identities | PASS in CI; hosted verification pending |
| Custom roles | Organization-only, ALLOW-only; create/revise callbacks use the same transaction; trusted delegable permission provider is wired | PASS for service/API path; policy classification remains fail-closed |
| Delegation policy | `core.permission_delegation_policy`, one row per permission, all false by default, runtime SELECT-only | PASS — no unapproved permission is delegable |
| Protected API | Organization members GET; Company GET; Plant GET; Organization roles GET/POST and revision POST | PASS for implemented API slice |
| Negative authorization | Active membership without required permission; sibling Company/Plant; actorUserId spoofing | PASS |
| Pool isolation | Same backend PID, transaction-local GUC cleanup after commit/rollback/exception, reused connection, concurrent A/B requests | PASS in disposable CI |
| Direct SQL | Missing/malformed context, tenant A/B visibility, runtime-role ownership/privilege checks, identity-table exclusion | PASS in disposable CI |
| Hosted/production database | No hosted DB connection, inspection, migration, role provisioning, or deployment | NOT ESTABLISHED |

## Security conclusions

1. Browser-supplied actor IDs and role claims are not trusted; the verified Better Auth session is the actor source.
2. Tenant IDs are selectors only; ancestry and active typed membership/assignment are validated server-side.
3. Authentication and membership do not imply permission.
4. Organization child-administration grants do not create Company/Plant operational inheritance.
5. Custom roles remain Organization-only and ALLOW-only. Requested permissions must be within the creator's effective, owner-approved delegable set.
6. All delegation policy rows default to false. The runtime role cannot modify the policy table.
7. RLS is defense-in-depth and does not replace the application permission evaluator.
8. Better Auth identity tables remain outside initial tenant RLS so sign-in/session/account flows can run without tenant GUCs.
9. The implemented API slice does not establish protection for future mutation or ERP routes; each new route must use the same transaction boundary and exact-scope checks.
10. Disposable CI evidence is not production evidence. Hosted database operations remain separately gated.

## Remaining acceptance work

| Acceptance area | Status |
|---|---|
| Application authorization for implemented API slice | PASS |
| Transaction-bound tenant context | PASS |
| RLS enforcement and runtime-role direct SQL | PASS in disposable CI |
| Pooled connection/session context isolation | PASS in disposable CI |
| Company/Plant exact-scope read coverage | PASS |
| Custom-role provider | IMPLEMENTED; permission delegation policy awaiting owner classification |
| Future membership/assignment mutation and ERP API coverage | OUTSIDE THIS IMPLEMENTED SLICE; must be protected before exposure |
| Hosted/production database evidence | BLOCKED pending separate approval and provider verification |

## Next owner decisions

1. Approve the exact permission codes that may be delegated to Organization custom roles. Until then, the delegation policy remains all-false and custom-role create/revision fails closed.
2. Separately approve hosted database role/grant provisioning and a hosted smoke test. No hosted connection or changes have been made.

**V04 repository and disposable-CI evidence: PASS. V04 production acceptance: BLOCKED.**
