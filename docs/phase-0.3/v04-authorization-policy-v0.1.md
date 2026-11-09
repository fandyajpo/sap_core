# V04 Authorization Policy — v0.1

**Policy status:** `OWNER_APPROVED` for the tenant-administration baseline in this document.  
**Decision date:** 2026-11-09 (conversation decision; no separate meeting record supplied).  
**Scope:** Organization, Company and Plant administration only. This is not the ERP operational permission catalog.  
**Implementation status:** Not implemented; V04 acceptance remains BLOCKED.

## 1. Owner decisions

The project owner selected all three policy options:

| Decision | Approved choice | Normative rule |
|---|---|---|
| Scope inheritance | `strict` | No role or permission is inherited automatically from Organization to Company or Plant. Company/Plant operational permissions require active membership/assignment and a role assignment at that exact scope. Explicit Organization-scoped administrative permissions in the matrix may administer child-scope structure and membership only; they are not inherited operational access. |
| Organization Admin authority | `manage` | `ORG_ADMIN` may administer tenant structure and membership within the Organization, including Company/Plant administration, but does not receive operational permissions in every Company or Plant. |
| Custom-role delegation | `subset` | A custom role may contain only permissions the creator is authorized to delegate at that role's scope. It cannot expand the creator's authority. |

This refines the P04 architecture recorded in the [authorization scope model](../phase-0.1/04-authorization-scope-model.md) and [decision register](../phase-0.1/01-decision-register.md): inheritance remains an explicit policy capability in the architecture, but this v0.1 tenant-administration baseline defines **no automatic cross-scope inheritance**. Any future cross-scope inheritance or delegated grant mechanism requires a separately documented owner decision and tests before implementation.

P04's other approved requirements remain in force: hybrid system/custom roles, deny-overrides-allow within the applicable scope, separation of Platform Admin and Tenant Admin, controlled break-glass, dedicated service identities for background work, scope isolation, separation of duties and audit.

## 2. Security invariants

1. Authentication establishes the principal; it does not grant tenant permissions.
2. Active Organization membership, Company membership and Plant assignment establish scope eligibility only. Membership is not an administrative permission.
3. Every protected operation derives the actor from the current server-verified session. Never accept a browser-supplied `actorUserId` or `userId` as authority.
4. Every requested scope and target is revalidated against the actor's active membership chain and the target's persisted parent relationships.
5. A permission is evaluated at the exact scope of the target operation. No implicit upward or downward role inheritance is allowed.
6. Deny-by-default applies. Within the applicable scope, an explicit deny overrides an allow.
7. A role assignment is not a permission by itself; only the permissions in the approved role definition can authorize an action.
8. A user cannot grant themselves a role or permission they are not authorized to delegate. Grant, revision and revocation operations are themselves protected and audited.
9. Tenant role assignment cannot grant Platform Admin or any platform-trust role.
10. Break-glass is not a normal tenant role or a membership bypass. It remains unavailable to ordinary tenant users until its separate controlled workflow, approval, expiry and audit behavior are implemented and tested.
11. Background jobs must use separately attributable service identities with bounded scope; they must not silently impersonate a human.
12. These permissions govern tenant administration only. They do not authorize inventory, procurement, sales, finance, HR, payroll or other ERP business operations.

## 3. Permission catalog

Permission identifiers are stable, lowercase, dot-separated identifiers. The semantics below define the v0.1 baseline.

| Permission | Scope | Meaning |
|---|---|---|
| `organization.read` | Organization | Read the Organization's administrative profile and settings that are not separately protected. |
| `organization.update` | Organization | Update Organization-level administrative profile/settings; cannot change platform ownership or bypass lifecycle controls. |
| `organization.members.read` | Organization | List and inspect Organization membership records and statuses. |
| `organization.members.manage` | Organization | Invite, activate, suspend, restore or revoke Organization memberships through governed lifecycle operations. |
| `company.read` | Company | Read Company administrative profile and structure within the authorized tenant context. |
| `company.manage` | Company | Create/update/archive Company administrative records and structure within delegated authority; cannot transfer Organization ownership or alter platform-level structure. |
| `company.members.manage` | Company | Manage Company membership lifecycle within that Company. |
| `plant.read` | Plant | Read Plant administrative profile and structure. |
| `plant.manage` | Plant | Create/update/archive Plant administrative records within the authorized Company. |
| `plant.assignments.manage` | Plant | Manage user-to-Plant assignments within the authorized Company/Plant chain. |
| `roles.read` | Applicable role scope | Read built-in role definitions and custom-role definitions visible at the caller's authorized scope. |
| `roles.create` | Organization | Create an Organization-owned custom role, limited to the creator's delegable permission subset. |
| `roles.revise` | Organization | Revise an Organization-owned custom role without expanding beyond the reviser's delegable permission subset; changes must be versioned/audited. |
| `roles.assign` | Target role scope | Assign or revoke an eligible tenant role at a scope the actor is authorized to administer. Cannot assign platform roles or exceed delegation authority. |
| `audit.read` | Applicable tenant scope | Read tenant administrative audit events within the actor's authorized scope. |

This catalog deliberately excludes operational permissions. A new permission requires a named operation, owning module, target scope, resource predicate, data-filtering behavior and positive/negative tests before it can be approved.

## 4. Built-in tenant roles and permission matrix

Legend: ✓ = granted by this baseline; — = not granted. Company/Plant operational role assignments require the corresponding active membership/assignment. The Organization roles' explicit child-administration grants are a narrow exception: they authorize only the listed administrative operations against descendants of that Organization, after verifying the target's parent chain; they do not create Company membership, Plant assignment or operational access.

| Permission | ORG_OWNER | ORG_ADMIN | ORG_MEMBER | COMPANY_ADMIN | COMPANY_MEMBER | PLANT_MANAGER | PLANT_OPERATOR | PLANT_VIEWER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `organization.read` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `organization.update` | ✓ | ✓ | — | — | — | — | — | — |
| `organization.members.read` | ✓ | ✓ | ✓ | — | — | — | — | — |
| `organization.members.manage` | ✓ | ✓ | — | — | — | — | — | — |
| `company.read` | ✓ | ✓ | — | ✓ | ✓ | — | — | — |
| `company.manage` | ✓ | ✓ | — | ✓* | — | — | — | — |
| `company.members.manage` | ✓ | ✓ | — | ✓ | — | — | — | — |
| `plant.read` | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | ✓ |
| `plant.manage` | ✓ | ✓ | — | ✓ | — | ✓ | — | — |
| `plant.assignments.manage` | ✓ | ✓ | — | ✓ | — | ✓ | — | — |
| `roles.read` | ✓ | ✓ | — | ✓ | — | ✓ | — | — |
| `roles.create` | ✓ | ✓ | — | — | — | — | — | — |
| `roles.revise` | ✓ | ✓ | — | — | — | — | — | — |
| `roles.assign` | ✓ | ✓ | — | ✓ | — | ✓ | — | — |
| `audit.read` | ✓ | ✓ | — | ✓ | — | ✓ | — | — |

`* COMPANY_ADMIN` may manage Company data only within authority delegated by the Organization. It cannot change Organization ownership, Organization-level policy or the Organization's Company/Plant boundary.

### Role boundaries

- `ORG_OWNER`: Organization-wide tenant administration under the platform's ownership and lifecycle constraints.
- `ORG_ADMIN`: Organization administration, membership governance and Company/Plant structure administration. This role does **not** confer operational access to every Company or Plant.
- `ORG_MEMBER`: limited Organization profile and membership visibility; no administrative mutation.
- `COMPANY_ADMIN`: administration of the assigned Company and its Plant structure/memberships, within Organization-delegated authority.
- `COMPANY_MEMBER`: Company read access only.
- `PLANT_MANAGER`: administration within the specifically assigned Plant.
- `PLANT_OPERATOR`: Plant read access only in this administrative baseline; operational work requires separately approved module permissions.
- `PLANT_VIEWER`: Plant read access only.

The Company and Plant role names do not themselves create Company membership or Plant assignment. A principal must have the relevant active scope membership/assignment in addition to the role assignment.

## 5. Scope and delegation rules

### Strict scope

- An Organization role applies only to Organization-scoped permissions explicitly listed for that role.
- A Company role applies only to the assigned Company. It does not apply to sibling Companies.
- A Plant role applies only to the assigned Plant. It does not apply to sibling Plants or other Companies.
- An Organization administrator may administer Company/Plant structure and memberships only for descendants of that Organization because the matrix explicitly grants those child-administration permissions. This is a direct, narrow Organization-level administrative grant, not permission inheritance.
- Company/Plant operational actions require the actor's active membership/assignment and role at the exact target scope. Organization role membership alone is insufficient for operational access.
- Every child-administration operation must verify the target Company/Plant belongs to the actor's Organization and must not expose operational data or actions.

### Custom roles

- Organization custom roles are Organization-owned and may contain only permissions the creator can delegate.
- A creator cannot delegate a permission they only possess as a non-delegable capability.
- Custom roles cannot include platform permissions, permissions outside their declared scope, or permissions the creator cannot grant.
- Custom roles do not implicitly inherit permissions from parent or child scopes.
- Creation, revision, assignment and revocation require server-side authorization and audit attribution.
- Role revisions must be versioned. Do not silently change the effective permissions of existing assignments without an explicit, auditable migration/reassignment policy.
- Custom-role creation and revision are limited to Organization scope in v0.1. Company/Plant custom-role authoring is not approved by this policy.

### Role assignment

- `roles.assign` is required to grant/revoke eligible tenant roles.
- The actor must be authorized to administer the target scope and delegate every permission included in the target role.
- No self-elevation; no assignment of Platform Admin or platform-trust roles through tenant APIs.
- Assignment must validate active membership and the complete Organization → Company → Plant parent chain.
- Suspended, revoked or ended assignments have no effective permissions.
- Grant, revision, suspension and revocation events must record actor, target principal, role, scope, action, timestamp and decision context without logging secrets.

## 6. Platform boundary, break-glass and service identities

Platform Admin is a separate platform-trust role and is intentionally absent from the tenant role matrix. Tenant role services must reject platform-role identifiers.

P04 requires controlled break-glass. This v0.1 policy does not enable a break-glass path. Before one is implemented, a separate owner-approved procedure must define eligible actors, independent approval, mandatory reason, narrow scope, short expiry, alerting, immutable/auditable event attribution, revocation and post-event review. Break-glass must not bypass tenant isolation or database ownership boundaries.

Background jobs use dedicated service identities with explicit bounded permissions and audit attribution. They do not inherit a user's permissions merely because a job was initiated by that user.

## 7. Explicitly out of scope

This document does not define:
- Inventory, purchasing, procurement, sales, order, warehouse, finance, accounting, tax, payroll, HR or other operational permissions.
- Field-level permissions, export permissions, approval limits or separation-of-duties matrices for modules.
- Jurisdiction-specific legal, tax, accounting, privacy or retention requirements.
- Platform Admin's detailed permission catalog.
- Break-glass workflow details.
- Permission inheritance/delegation across scope boundaries beyond the explicit v0.1 matrix.
- Database schema, seed data, RLS policies or migration mechanics.

Do not infer an allow from the absence of a permission identifier. Until an operation is mapped to an approved permission and protected by a server-side policy boundary, deny privileged access.

## 8. Implementation gates

Before implementation is considered complete:
1. Map each protected operation to a permission, scope, target predicate and owning module.
2. Derive actor identity from the current server session at every server entry point.
3. Resolve active membership and target parent chain; reject caller-supplied actor IDs and inconsistent scope selectors.
4. Evaluate the permission at the exact target scope, with deny-overrides-allow and fail-closed behavior.
5. Enforce query predicates in the database/data-access path; do not fetch broad tenant data and filter only after serialization.
6. Test allow/deny cases for every role/permission pair, direct invocation of server entry points, anonymous actors, inactive membership, cross-tenant IDs, sibling Company/Plant access, role escalation, custom-role over-delegation, revocation and cache separation.
7. Design and test RLS only after inventorying actual query/transaction patterns; prove transaction-local context isolation on a reused pooled connection.
8. Keep V04 BLOCKED until application authorization, tenant isolation, pooled-connection isolation and hosted/production evidence are independently satisfied.

## 9. Approval and change control

The three decisions in §1 and the v0.1 administrative matrix in §3–§5 are owner-approved by the project owner's explicit selection in the 2026-11-09 conversation. This approval authorizes documentation of the policy only. It does not authorize schema/migration changes, permission seeding, service implementation, RLS, production access or database operations.

Any change to strict scope, ORG_ADMIN authority, custom-role subset delegation, role grants, deny precedence or platform boundary requires a new explicit owner decision, a versioned policy update and corresponding tests.
