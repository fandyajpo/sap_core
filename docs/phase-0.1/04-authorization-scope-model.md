# Authorization Scope Model

**Decision: `OWNER_APPROVED`** — the authorization architecture is selected; technical enforcement, detailed grants and tests remain pending. See [P04](01-decision-register.md#register) and the [V04 Authorization Policy v0.1](../phase-0.3/v04-authorization-policy-v0.1.md).

## Separate authentication, membership and permission

- Better Auth establishes the principal and server-verified session.
- `core` membership and role-assignment concepts determine which organizations, companies and plants the principal may act within.
- CASL expresses application-level action/subject conditions from the currently validated principal, membership, resource and policy.
- The owning module enforces its lifecycle rules and rechecks authorization before reading or mutating its records.

Better Auth's user/account/session records are not ERP roles. Do not use Better Auth Organization plugin roles, active-organization state, a client-side CASL ability, a URL `companyId`, or a user-supplied scope as authority.

## Owner-selected P04 architecture

Use a hybrid of system roles and custom roles. Within the applicable scope, an explicit deny overrides an allow. Platform Admin and Tenant Admin are distinct roles and trust boundaries. Break-glass access is controlled and separately attributable. Background jobs use dedicated service identities rather than implicit human impersonation. Preserve organization/company/plant scope, separation-of-duties checks and audit of grants, revocations and sensitive operations.

The project owner approved the following v0.1 tenant-administration rules on 2026-11-09:

- **Strict scope:** no automatic role or permission inheritance from Organization to Company or Plant. Company/Plant operational permissions require their own active membership/assignment and role assignment. The matrix explicitly grants Organization administrators a narrow ability to administer descendant Company/Plant structure and membership; this is direct administrative authority, not inherited operational access.
- **ORG_ADMIN manage:** may administer Organization membership and tenant structure, including Company/Plant administration explicitly granted by the matrix, but does not receive automatic operational access in all Companies/Plants.
- **Custom-role subset:** a custom role may contain only permissions its creator is authorized to delegate at that role's scope. It cannot expand the creator's authority.

These choices refine the architecture's support for explicit permission inheritance: inheritance remains a possible future policy mechanism, but no cross-scope inheritance is enabled by this v0.1 baseline. Any future inheritance or delegation expansion requires a separate owner decision, a versioned policy update and tests before implementation. The exact tenant-administration catalog and matrix are in the linked v0.1 policy document; ERP operational permissions remain out of scope.

## Authorization decision inputs

A server authorization decision must be computed from:

1. Canonical principal ID and current session validity/freshness where required.
2. Current account active/disabled state and current membership status.
3. Organization/company/plant scope resolved by the core owner and checked against hierarchy.
4. Requested action, resource type, resource lifecycle/version and owning-module policy.
5. Any explicitly approved field-level or separation-of-duties constraints.

Policy shape: `(principal or service identity, action, subject, organization, company, optional plant, conditions)`. A hierarchy edge alone is not an inherited grant.

## Enforcement sequence

`authenticate → validate input → resolve active scope → load/recheck membership → authorize action and target → apply owner lifecycle/business rules → execute scoped query/transaction → record required audit context → return minimum DTO`.

Repeat the sequence in every Route Handler, Server Action, service boundary and data-access path. Layouts, navigation hiding, Next.js Proxy and prior page checks are usability only. Background/service work requires a separately attributable service identity with bounded scopes; it must not silently impersonate a human user.

## Query and cache isolation

Apply company/plant predicates in the database query wherever possible. CASL-to-query translation may be adopted only after its exact adapter/version is pinned and equivalence is tested. Do not assume PostgreSQL RLS is enabled. If RLS is considered later, first prove safe tenant context handling with the selected pooled connection and transaction model.

Any server/client cache key must partition by principal and authorized scope; a company switch or membership/role/session change invalidates it. Denials fail closed. Avoid confirming the existence of inaccessible resources. Audit grants/revocations and sensitive actions without copying secrets or unnecessary HR/financial payloads.

## Implementation details and required tests

P04 owner-selects the hybrid role model, deny-overrides-allow rule, separate Platform/Tenant Admin roles, controlled break-glass, dedicated service identities, scoped authorization, separation of duties and audit requirements. The v0.1 tenant-administration catalog and matrix are documented separately. Phase 0.3/implementation validation must test positive and negative matrices; direct server-boundary invocation; cross-company/plant IDOR; stale membership/session; multi-scope queries; revoked users; cache separation; role changes; SoD; break-glass and service-identity attribution. These are Phase 1 platform gates in [14](14-phase-1-implementation-gates.md).
