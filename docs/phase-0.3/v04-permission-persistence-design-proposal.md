# V04 Permission Persistence and Built-in Role Seed Design

**Status:** Proposed technical design — NOT OWNER-APPROVED  
**Policy baseline:** [V04 Authorization Policy v0.1](v04-authorization-policy-v0.1.md)  
**Design basis:** `main` after PR #26  
**Implementation status:** No schema, migration, seed, or database changes are included in this proposal.

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

The grant table must be immutable after insertion. Role revision creates a new RoleDefinition version with a complete new grant set; it does not update or delete old grant rows. This aligns with D8's immutable version-family model.

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
- Add immutability protection for role-permission grant rows.
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

## 7. Decisions required before implementation

The owner-approved v0.1 policy already fixes scope inheritance, ORG_ADMIN authority, custom-role ALLOW subset and the built-in permission matrix. The following implementation details still require approval:

1. Approve the two-table permission catalog/grant model and its exact uniqueness/FK/immutability constraints.
2. Approve seeding the eight built-in tenant roles and 15 permission definitions through a forward migration.
3. Confirm the recommended restriction that custom roles contain ALLOW entries only in v0.1; DENY entries are reserved for system/policy use.
4. Confirm the deny evaluation rule: applicable DENY at the requested target scope overrides every applicable ALLOW for that target, including explicit child-administration grants from parent roles.
5. Approve the server-side grant loader and its required active membership joins as the production source of grants.

Until these are approved and implemented with tests, the pure evaluator must not be presented as production authorization. V04 remains **BLOCKED**.
