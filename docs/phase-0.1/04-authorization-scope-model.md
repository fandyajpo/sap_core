# Authorization Scope Model

**Decision: `PROPOSED`** — the owner must approve membership, role, inheritance and delegation rules. See [P04](01-decision-register.md#register).

## Separate authentication, membership and permission

- Better Auth establishes the principal and server-verified session.
- `core` membership and role-assignment concepts determine which organizations, companies and plants the principal may act within.
- CASL expresses application-level action/subject conditions from the currently validated principal, membership, resource and policy.
- The owning module enforces its lifecycle rules and rechecks authorization before reading or mutating its records.

Better Auth's user/account/session records are not ERP roles. Do not use Better Auth Organization plugin roles, active-organization state, a client-side CASL ability, a URL `companyId`, or a user-supplied scope as authority.

## Proposed decision inputs

A server authorization decision must be computed from:

1. Canonical principal ID and current session validity/freshness where required.
2. Current account active/disabled state and current membership status.
3. Organization/company/plant scope resolved by the core owner and checked against hierarchy.
4. Requested action, resource type, resource lifecycle/version and owning-module policy.
5. Any explicitly approved field-level or separation-of-duties constraints.

Suggested policy shape: `(principal, action, subject, organization, company, optional plant, conditions)`. No concrete role names, permission catalog or inherited grant is fixed here.

## Enforcement sequence

`authenticate → validate input → resolve active scope → load/recheck membership → authorize action and target → apply owner lifecycle/business rules → execute scoped query/transaction → record required audit context → return minimum DTO`.

Repeat the sequence in every Route Handler, Server Action, service boundary and data-access path. Layouts, navigation hiding, Next.js Proxy and prior page checks are usability only. Background/service work requires a separately attributable service identity with bounded scopes; it must not silently impersonate a human user.

## Query and cache isolation

Apply company/plant predicates in the database query wherever possible. CASL-to-query translation may be adopted only after its exact adapter/version is pinned and equivalence is tested. Do not assume PostgreSQL RLS is enabled. If RLS is considered later, first prove safe tenant context handling with the selected pooled connection and transaction model.

Any server/client cache key must partition by principal and authorized scope; a company switch or membership/role/session change invalidates it. Denials fail closed. Avoid confirming the existence of inaccessible resources. Audit grants/revocations and sensitive actions without copying secrets or unnecessary HR/financial payloads.

## Required owner decisions and tests

Owner approval is required for membership status/effectivity, role-to-permission mapping, inheritance, company/plant delegation, privileged administration, break-glass, separation of duties, field-level restrictions, export access and high-risk fresh-session requirements. Test positive and negative allow matrices; direct invocation of each server boundary; cross-company and cross-plant IDOR; stale membership/session; queries with multiple scopes; revoked users; cache separation; and role changes. These are Phase 1 platform gates in [14](14-phase-1-implementation-gates.md).
