# V04 Permission Persistence and Built-in Role Seed Design

**Status:** `OWNER_APPROVED` for the five design decisions in §7; technical validation and implementation remain pending  
**Policy baseline:** [V04 Authorization Policy v0.1](v04-authorization-policy-v0.1.md)  
**Design basis:** `main` after PR #26  
**Approval date:** 2026-11-09 (explicit project-owner approval in conversation).  
**Implementation status:** Approval authorizes a forward migration, permission catalog and built-in role seed, trusted server-side grant loader, and focused application integration/tests in the repository. It does **not** authorize any hosted database inspection, migration, seed execution, production access, or destructive database operation. Those require separate explicit approval.

## 1. Purpose

PR #25 introduced a pure authorization evaluator and a session-bound tenant target resolver. The current repository still has no trusted persisted permission catalog, role-permission payload, explicit-deny source, or built-in tenant-role seed set. This proposal defines a minimal persistence model that can supply trusted inputs to the existing evaluator without changing the owner-approved A=strict, B=manage, C=subset policy.

This is a design proposal only. It does not authorize implementation or production database work.

## 2. Design invariants

1. Keep Better Auth identity/session, membership, typed role assignment and permission evaluation as separate concerns.
2. Keep `RoleDefinition` as the versioned role identity. A permission grant belongs to one immutable RoleDefinition version.
3. Keep permission identifiers stable and catalogued; do not store arbitrary permission strings supplied by a browser.
4. Preserve typed Organization/Company/Plant role assignment. Platform roles remain outside tenant assignment.
5. No automatic Organization → Company → Plant operational permission inheritance. Parent role assignments may authorize only the explicit child-administration permissions in policy v0.1 after target ancestry is verified.
6. Membership is still required for exact-scope Company/Plant operational access. The target resolver alone is never sufficient.
7. Unknown, disabled, unseeded, mismatched-scope or incomplete role data fails closed.
8. Custom role ALLOW permissions must be a subset of the creator's delegable permissions at the Organization scope.
9. Role definitions and their permission grants are versioned and immutable after creation. A revision creates a new RoleDefinition version and a new permission snapshot.
10. All grant creation, revision, assignment and revocation remains server-authorized and auditable.

## 3. Proposed persistence model

### 3.1 `core.permission_definition`

One canonical row per approved permission.

| Field | Proposed type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `code` | TEXT | Unique, stable identifier such as `organization.read` |
| `description` | TEXT | Human-readable semantics; not used as authorization input |
| `created_at` | TIMESTAMPTZ | Immutable creation time |

The v0.1 catalog contains the 15 identifiers already approved in the policy document. Do not seed ERP operational permissions in this phase. Permission target-scope rules remain in the version-controlled policy evaluator and its tests; the database row is the canonical identity, not an executable expression.

### 3.2 `core.role_permission_grant`

A version-specific permission entry for one RoleDefinition.

| Field | Proposed type | Rule |
|---|---|---|
| `id` | UUID | Primary key |
| `role_definition_id` | UUID | FK to `core.role_definition(id)`, ON DELETE/UPDATE RESTRICT |
| `permission_definition_id` | UUID | FK to `core.permission_definition(id)`, ON DELETE/UPDATE RESTRICT |
| `effect` | New enum: `ALLOW` / `DENY` | Explicit effect; deny takes precedence during evaluation |
| `created_at` | TIMESTAMPTZ | Immutable creation time |

Required uniqueness: one row per `(role_definition_id, permission_definition_id)`; one permission cannot be both ALLOW and DENY within the same role version. Add indexes for role-definition lookup and permission lookup.

**Permission-set sealing is required.** Add a nullable `permissions_locked_at` timestamp to RoleDefinition. In one transaction, the creator inserts the RoleDefinition, inserts its complete grant set, and performs a one-way transition from NULL to a timestamp. A database trigger must reject grant insertion after the role is sealed, reject all grant updates/deletes, and reject any attempt to clear or change an existing lock timestamp. The D8 RoleDefinition immutability trigger must permit only this one-way lock transition in addition to its existing lifecycle exceptions. Role assignment must reject an unsealed RoleDefinition. System-role seeds use the same insert-grants-then-seal sequence.

Role revision creates a new RoleDefinition version with a complete new grant set; it does not update or delete old grant rows. This aligns with D8's immutable version-family model. The migration must also make SYSTEM RoleDefinition rows and PermissionDefinition identifiers immutable; changing the approved built-in matrix or a permission's semantics requires a new policy version and an explicit versioned replacement/assignment plan, not an in-place privilege expansion.

### 3.3 Built-in tenant roles

Seed the eight v0.1 roles as `SYSTEM` RoleDefinitions with `ownerOrganizationId = NULL`, version 1, and their exact typed scope:

| Code | RoleDefinition scope |
|---|---|
| `ORG_OWNER` | ORGANIZATION |
| `ORG_ADMIN` | ORGANIZATION |
| `ORG_MEMBER` | ORGANIZATION |
| `COMPANY_ADMIN` | COMPANY |
| `COMPANY_MEMBER` | COMPANY |
| `PLANT_MANAGER` | PLANT |
| `PLANT_OPERATOR` | PLANT |
| `PLANT_VIEWER` | PLANT |

Seed the ALLOW grants exactly from the approved v0.1 matrix. Do not seed Platform Admin as a tenant role. Add a partial unique index for SYSTEM role identity (proposed `(scope, code) WHERE kind = 'SYSTEM'`) so duplicate built-in role definitions cannot be created.

### 3.4 Custom roles

- Custom roles remain `ORGANIZATION_CUSTOM`, Organization-owned and Organization-scoped in v0.1.
- Creation/revision receives a complete permission-code list, resolves every code against `permission_definition`, and rejects unknown identifiers.
- The server derives the actor from the current session and computes the actor's delegable ALLOW set. Every custom-role ALLOW entry must be in that set.
- A custom role cannot include Platform permissions, unsupported operational permissions, or a permission outside the Organization's approved catalog.
- A new revision creates a new immutable RoleDefinition version and its own complete grant snapshot. Existing assignments remain on their original version unless an explicit reassignment is authorized and audited.
- No Company/Plant custom-role authoring is introduced by this design.

The precise custom-role DENY authoring rule is intentionally not inferred here. The recommended initial behavior is to allow custom roles to contain ALLOW entries only; DENY rows remain reserved for separately approved system/policy use until the owner decides otherwise.

## 4. Evaluation semantics

The production grant loader must return only grants derived from the authenticated actor's active typed membership/assignment records and the persisted RoleDefinition/RolePermission rows.

For a requested permission and verified target:

1. Resolve actor from the current Better Auth session.
2. Resolve active Organization membership and target ancestry.
3. Load Organization role assignments for the actor's active Organization membership.
4. For Company target operations, also load Company role assignments only through the actor's active Company Membership.
5. For Plant target operations, also load Plant role assignments only through the actor's active Plant Assignment and its active parent memberships.
6. Resolve role definitions and permission grants from trusted database rows. Reject disabled roles, unknown codes, scope mismatches and invalid custom-role ownership.
7. Evaluate exact target scope and the policy's explicit child-administration exceptions. Never turn a parent role into child operational access.
8. Any applicable DENY overrides all applicable ALLOW entries for the same target permission. If no applicable ALLOW remains, deny.
9. Missing or incomplete role/permission data fails closed.

The existing pure evaluator currently accepts explicit denies separately from grants. The production adapter must translate persisted DENY entries into the evaluator's target-scope deny input only when the source assignment is applicable to that target under the strict-scope rules. This behavior requires dedicated tests for Organization → Company/Plant administrative grants and Company → Plant administrative grants; it must not create general inheritance.

## 5. Migration and service impact

A future implementation migration is expected to:

- Add a permission-effect enum.
- Add `permission_definition` and `role_permission_grant` tables with RESTRICT foreign keys and indexes.
- Add the partial unique index for SYSTEM role identity.
- Seed the 15 approved permission definitions, eight built-in tenant roles and exact ALLOW matrix.
- Add permission-set sealing and immutability protection for role-permission grant rows; update the D8 RoleDefinition immutability guard only to permit the one-way seal transition; protect SYSTEM role identities and PermissionDefinition codes from in-place mutation.
- Run a preflight inventory of existing RoleDefinitions and RoleAssignments. If any existing RoleDefinition rows are present, stop and classify them before migration; do not silently seed over, replace, or assign a built-in role to existing principals.
- Avoid changes to membership/assignment lifecycle tables, Better Auth tables, or unrelated P05 relationship edges.

Application changes are expected to:

- Extend the RoleDefinition create/revise service to accept a complete permission set and persist it atomically with the version and audit event.
- Add a server-only trusted role-grant loader using current session identity and active typed membership joins.
- Bind the loader and target resolver to the pure policy evaluator.
- Bind the resulting production authorization policy to role assignment and role definition callbacks.
- Add a narrow protected administrative operation and direct invocation tests.

Do not implement these changes until the owner explicitly approves the migration and seed scope. No hosted database inspection, migration execution, seed execution or destructive action is part of this proposal.

## 6. Required tests before production use

- Permission catalog code uniqueness and unknown-code rejection.
- Exact built-in role seed count, code, kind, owner and typed scope.
- Every seeded role/permission pair matches the approved v0.1 matrix.
- Role-permission rows are immutable; revisions create a new complete version.
- Custom-role ALLOW subset enforcement, wrong Organization owner rejection and Platform/operational permission rejection.
- Active membership and assignment joins for each scope.
- Organization child-administration grants work only for descendant Company/Plant targets.
- Company child-administration grants work only for Plants in that Company.
- No automatic sibling-scope or operational inheritance.
- Explicit DENY overrides ALLOW for the same target permission, including multiple simultaneous role assignments.
- Revoked, suspended, ended, disabled and mismatched-scope role assignments fail closed.
- Direct server-boundary invocation, anonymous actor, cross-tenant selectors and stale membership/role changes.
- Audit attribution for create, revise, grant, revoke and denied decisions.

## 7. Owner-approved design decisions

On 2026-11-09, the project owner explicitly approved all five recommendations in this proposal:

1. **Persistence model:** use `core.permission_definition` as the canonical permission catalog and `core.role_permission_grant` as the version-specific grant/effect relation. Preserve the proposed unique `(role_definition_id, permission_definition_id)` constraint, RESTRICT foreign keys, lookup indexes, and immutable/sealed permission snapshots.
2. **Built-in seeds:** seed exactly the 15 v0.1 permission definitions and eight typed SYSTEM tenant roles with grants matching the approved policy matrix, through a new forward migration. Do not create Platform Admin as a tenant role. Migration preflight must stop and require classification if existing RoleDefinition data would conflict; never overwrite or silently reassign existing principals.
3. **Custom-role effects:** custom roles may contain `ALLOW` entries only in v0.1. `DENY` entries are reserved for separately governed system/policy use; no custom-role DENY authoring UI/API is authorized.
4. **Deny precedence:** an applicable `DENY` for the requested permission and target scope overrides every applicable `ALLOW`, including an explicit child-administration ALLOW originating from an Organization or Company role. Applicability must still obey the approved strict-scope rules and verified target ancestry; DENY does not create a new inheritance path.
5. **Trusted grant loader:** implement a server-only loader that derives the actor from the current Better Auth session, resolves active typed membership/assignment chains, and loads role definitions and permission grants from trusted persisted rows. Organization grants may be considered for descendant child-administration only where policy v0.1 explicitly allows it; Company and Plant grants require their corresponding active typed membership/assignment paths.

### Approval boundary

This approval authorizes repository implementation of the approved persistence model, forward migration and seed, server-side grant loader, evaluator integration, and focused tests. It does not authorize inspection or mutation of any hosted database, production database connection, hosted migration/seed execution, destructive database action, or deployment. Any such operation requires a separate explicit owner approval. Local database execution is also not implied by this document approval; use CI/disposable test infrastructure only unless separately authorized.

These are owner-approved design decisions, not technical validation. The implementation must preserve the existing membership lifecycle and Better Auth tables, avoid unrelated P05 relationship changes, and retain fail-closed behavior. V04 remains **BLOCKED** until implementation, application-path isolation, RLS/pool-isolation evidence and required hosted/production evidence are independently satisfied.
