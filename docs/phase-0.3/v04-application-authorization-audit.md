# V04 Application Authorization Audit

**Status:** Authorization acceptance remains BLOCKED  
**Audited ref:** `main` after PR #32 (`e52b3c1d620be17a03eb199734869f02831ec39b`)  
**Scope:** Better Auth session boundary, tenant target resolution, persisted permission grants, pure evaluator, role and membership services, first protected API operation, CI evidence, RLS and pooled-connection status.

## Executive finding

The repository now has an end-to-end Organization member-read path:

1. Better Auth session is resolved server-side.
2. The requested Organization target is validated against the actor's active Organization membership.
3. Persisted role grants are loaded from active typed assignments and sealed/enabled RoleDefinitions.
4. The v0.1 evaluator checks `organization.members.read`.
5. The member query runs only after authorization succeeds.

PR #30 adds the 15-code permission catalog, eight seeded tenant SYSTEM roles, immutable role-permission snapshots, grant loading and a server-side permission guard. PR #31 adds `GET /api/organizations/[organizationId]/members`. PR #32 exercises that endpoint with real Better Auth cookies: an ORG_OWNER receives HTTP 200; an authenticated actor with active Organization membership but no role assignment receives HTTP 403.

This is a narrow application-path proof, not complete V04 acceptance. Company and Plant protected operations, comprehensive authorization integration, RLS, pooled-connection isolation, and broader tenant-isolation evidence remain outstanding. V04 remains **BLOCKED**.

## Evidence inventory

| Area | Current implementation | Result |
|---|---|---|
| Authentication | Better Auth with Prisma adapter; user hard deletion disabled. | Session source is server-side. |
| Tenant target context | Session-bound active Organization membership plus verified Company/Plant ancestry. | Context is resolved server-side; context alone is not permission. |
| Permission persistence | `core.permission_definition`, `core.role_permission_grant`, 15 approved codes, eight typed SYSTEM roles, sealed snapshots, immutable grant rows. | Implemented in migration `20261109120000_v04_permission_persistence`. |
| Custom roles | Organization-only; ALLOW-only; requested permission set checked against injected creator-delegable permission source; create/revise snapshots and audit are transactional. | Persistence and service contract implemented. Production delegable-permission provider still needs explicit wiring before enabling custom-role UI/API. |
| Trusted grant loader | Server-only loader derives current Better Auth actor, uses active Organization/Company/Plant membership/assignment joins, and loads only sealed, enabled roles. | Implemented; actual Organization path exercised by V03 E2E. |
| Policy evaluator | Pure v0.1 matrix, persisted SYSTEM snapshot support, strict scope, explicit child-administration grants, target-scope DENY precedence, fail-closed unknown roles/permissions. | Unit coverage and loader integration path exist. |
| Protected API | `GET /api/organizations/[organizationId]/members` requires `organization.members.read` before query. | Positive and negative real-session endpoint tests pass. |
| CI | Static, V03, D1, D6, D7, D8 and V04 pinned replay. | PR #30, #31 and #32 each passed all 7 checks. |
| RLS and pooled connection | No RLS policies, transaction-local tenant GUC, or same-connection reuse evidence found. | BLOCKED; see [RLS and pooled-connection inventory](v04-rls-and-pool-isolation-inventory.md). |
| Hosted/production database | No hosted DB was inspected or modified. | No hosted/production evidence established. |

## Security conclusions

1. Never accept actor identity or role grants from browser input; derive the actor from the current Better Auth session.
2. Treat tenant IDs as untrusted selectors; validate target ancestry and active membership server-side.
3. Authentication and membership do not imply permission. The endpoint's negative integration case proves this.
4. Organization child-administration grants do not create Company/Plant operational inheritance.
5. Custom roles are Organization-only and ALLOW-only; permission payloads must be a subset of the creator's trusted delegable permissions.
6. Applicable target-scope DENY overrides applicable ALLOW; custom roles cannot author DENY.
7. Role assignment requires a sealed permission snapshot. Disabled and unsealed definitions are excluded from authorization.
8. The Organization member API is a narrow first protected operation. It does not establish protection for all future Company/Plant or ERP operations.
9. RLS cannot be layered on top of the current global-Prisma authorization sequence without first binding target resolution, grant loading and the protected query to one transaction connection.
10. No hosted database inspection, migration, seed execution or deployment is authorized by the repository implementation approvals.

## Remaining acceptance work

| Acceptance area | Status |
|---|---|
| Application authorization | PARTIAL — one protected Organization read operation exists; custom-role delegation provider and broader operation coverage remain. |
| Tenant context enforcement | PARTIAL — target resolver and Organization member API are covered; Company/Plant operation paths remain. |
| Protected operations | PARTIAL — Organization member read only. |
| RLS policy design and enforcement | BLOCKED — actual query/transaction inventory completed; separate design and approval required. |
| Pooled connection/session context isolation | BLOCKED — no transaction-local tenant context or connection-reuse tests yet. |
| End-to-end tenant isolation | PARTIAL — Organization positive/negative path tested; Company/Plant and direct SQL/RLS paths remain. |
| Hosted/production database evidence | NOT ESTABLISHED — no hosted database operations were performed. |

## Next deliverable

Review the RLS and pooled-connection inventory, then prepare a transaction-bound tenant execution contract and database-role design for owner approval. Do not implement RLS, database roles, GUCs, or hosted database operations before that approval.

**V04 remains BLOCKED.**
