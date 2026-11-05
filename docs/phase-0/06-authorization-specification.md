# Authorization Specification

## Policy model

CASL is the accepted application permission-modeling library. Authorization is separate from Better Auth authentication: a valid session identifies an actor but does not imply ERP access. Authorization is deny-by-default and evaluated on the server for every protected operation and every resource/company scope.

The long-term policy model may combine role assignments with explicit permissions and conditions. Roles are a way to compose capabilities, not an unconditional grant. The current skill baseline lists core roles and permissions as platform references, but exact membership/role schema and delegation rules remain subject to owner review.

## Trusted evaluation inputs

An authorization decision is derived from a validated actor/session, active membership and company/organization context, target resource state, requested action, and current policy. Company scope comes from trusted server state and is revalidated against the target/resource. Do not trust a client-supplied company ID, hidden button, URL identifier, CASL ability serialized to the browser, or a prior page-level check.

## Enforcement points

- REST Route Handlers authenticate, validate input, authorize action/resource/company, then invoke an owning application service.
- Server Actions repeat these checks internally because they can be invoked directly and Proxy matchers/layouts are not complete coverage.
- Module use cases/repositories scope reads and writes by the authenticated organization/company and object ownership; apply field-level restrictions for sensitive HR/finance data and exports.
- Cross-module contract receivers re-check the actor and allowed command, not only the calling module's decision.
- Background tasks (if later approved) require a distinct, attributable service actor and explicitly bounded permissions; do not impersonate an end user implicitly.

## Data filtering

List and report queries must enforce policy predicates in the database/query layer where possible, not fetch broad rows and filter after serialization. CASL rules-to-query approaches may be considered only after the exact package/query adapter is pinned and the generated predicates are validated against policy. A foreign key enforces referential integrity, never access control. PostgreSQL RLS is not assumed; if selected later it requires a pooled-connection-safe design and tests.

## Denial and audit

Return a stable forbidden response for authenticated callers who lack permission, without confirming the existence of inaccessible records where disclosure is unsafe. Audit high-risk grants, revocations and sensitive operations with actor, organization, target, action and decision context; do not log secrets or sensitive payloads. A role change or company switch must invalidate/recompute relevant session and client cache state per explicit policy.

## Required policy decisions/tests

Owners must define membership status, role scope/inheritance, separation of duties, company/plant delegation, field permissions, admin/break-glass behavior, session freshness for high-risk actions, revocation propagation, and export access. Test allow/deny matrices, cross-company IDOR, direct Server Action calls, stale membership/session, list-query filtering, and two-user/two-company cache behavior. No concrete role catalog or legal policy is established here.


## Phase 0.1 scope reconciliation

The original Phase 0 text is historical. P03 now `OWNER_APPROVED` for single-company-first, one organization per ERP user under the initial policy, explicit plant assignment and scoped roles; the one-organization rule is not a permanent identity constraint. P04 now `OWNER_APPROVED` for hybrid system/custom roles, explicit permission inheritance, deny-overrides-allow within the applicable scope, separate Platform/Tenant Admin roles, controlled break-glass, dedicated background-job service identities, and the existing scope/SoD/audit requirements. Active organization and Better Auth roles are not ERP authorization. Technical enforcement and tests remain pending; see [organizational model](../phase-0.1/03-organizational-model.md), [authorization scope model](../phase-0.1/04-authorization-scope-model.md) and [Phase 1 gates](../phase-0.1/14-phase-1-implementation-gates.md).
