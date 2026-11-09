# V04 Application Authorization Audit

**Status:** Audit baseline; authorization acceptance remains BLOCKED  
**Audited ref:** `main` at `6fc9b953956d929ec279e043a89d1dcbd9f3826a`  
**Scope:** Existing application authentication/session boundary, scoped-access services, role services, and currently inspected application routes.

## Executive finding

The repository has an authentication foundation and database-level membership/role structures, but the inspected application does not yet contain a complete, session-bound tenant authorization layer or protected Organization/Company/Plant business operations.

A valid Better Auth session currently proves the caller's identity. It does not prove that the caller may act in an Organization, Company, or Plant. V04 must remain **BLOCKED**.

This audit does not authorize a permission model, role matrix, RLS policy, or schema change. Those require explicit policy decisions and evidence from actual protected operations.

## Evidence inventory

| Area | Existing implementation | Audit result |
|---|---|---|
| Authentication | `src/lib/auth.ts` configures Better Auth with Prisma and email/password. User hard deletion is disabled. | Authentication foundation present. |
| Session retrieval | `src/lib/auth-session.ts` calls `auth.api.getSession({ headers: await headers() })`. | Session is resolved server-side. |
| Route protection | `src/app/page.tsx` and `src/app/account/page.tsx` call `requireCurrentSession()`. | These pages protect account/profile UI only; they do not resolve tenant access. |
| Scoped membership | `src/lib/scoped-access-service.ts` contains active OrganizationMembership checks, CompanyMembership/PlantAssignment checks, and `hasCompanyAccess`/`hasPlantAccess`. | Membership predicates exist, but their user ID is an ordinary service argument, not intrinsically bound to the verified request session. |
| Membership lifecycle | The same service exposes grant/suspend/restore/revoke/end operations. Transition methods accept assignment IDs and do not themselves accept or verify an acting session. | These are low-level domain operations and must not be exposed directly to untrusted request paths. |
| Role assignment | `src/lib/role-assignment-service.ts` requires injected `authorizeGrant` and `authorizeBreakGlassUse` callbacks. | The service enforces that callbacks exist, but the repository must supply a real policy implementation bound to a verified actor. Test stubs are not production policy evidence. |
| Effective roles | `listEffectiveRoleAssignments` accepts `userId`, scope, and parent ID. | It resolves active role assignments, but the actor identity is caller-supplied at this service boundary. It is not a permission decision. |
| Custom role definitions | `src/lib/role-definition-service.ts` requires injected create/revise authorization callbacks. | Production callback implementation and its session binding are not established by the inspected application paths. |
| Permission catalog | `prisma/schema.prisma` describes RoleDefinition as a candidate catalog structure and explicitly says no permission catalog or grant matrix is implied. | No permission vocabulary or approved role-to-permission matrix is established. |
| Business operations | The inspected App Router pages are Home, Account, Sign In, Register, and Better Auth's auth handler. No protected Organization/Company/Plant business route was found in the inspected paths. | There is not yet an application business-operation surface against which end-to-end tenant authorization can be demonstrated. |

## Security conclusions

1. Never accept `actorUserId` or `userId` from a browser request as proof of identity. Derive the actor from the current Better Auth session on the server.
2. Treat Organization, Company, and Plant IDs supplied by a client as untrusted selectors. Resolve each against the verified actor's current ACTIVE membership chain.
3. A membership check is not a permission check. An ACTIVE membership alone must not imply permission to administer members, grant roles, change role definitions, or perform arbitrary business actions.
4. Do not expose the low-level membership lifecycle or role services directly to route handlers until a session-bound authorization facade enforces the approved action policy.
5. A role assignment is not automatically an effective permission. The permission catalog, role semantics, inheritance rules, and grant authority remain unapproved.
6. RLS must not be designed in isolation from the application query and transaction model. Tenant context must be transaction-local and safe under pooled connection reuse; no persistent connection-level tenant setting is acceptable.
7. No schema or migration change is justified by this audit alone.

## Required implementation sequence

### A. Session-bound actor boundary

- Add a server-only entry point that obtains the actor from `requireCurrentSession()`.
- Do not expose an API that lets callers provide the actor ID.
- Convert authentication failures into an explicit unauthenticated result at request boundaries; do not rely on client-side UI hiding.

### B. Tenant context resolution

- Resolve Organization access from an ACTIVE OrganizationMembership belonging to the session actor.
- Resolve Company access only through an ACTIVE CompanyMembership joined to the same actor's ACTIVE OrganizationMembership and the selected Organization.
- Resolve Plant access only through an ACTIVE PlantAssignment joined to the same actor's ACTIVE CompanyMembership and ACTIVE OrganizationMembership, with matching organization/company/plant scope.
- Reject mismatched, missing, suspended, revoked, ended, or inconsistent membership chains.
- Derive parent IDs from database rows where possible; never trust a client-provided parent tuple.

### C. Authorization policy decisions

Before implementing business permissions, record and approve:
- Permission identifiers and their semantics.
- Built-in/system role definitions and the initial role-to-permission matrix.
- Which scope can grant which roles and permissions.
- Organization custom-role boundaries and whether roles inherit across narrower scopes.
- Break-glass eligibility, approval, expiry, and audit requirements.
- Which operations are protected and which permission each operation requires.

Until these decisions exist, deny privileged operations by default.

### D. Protected operations and tests

- Add a real protected operation before claiming end-to-end authorization coverage.
- Test anonymous actor, actor without membership, inactive membership at each level, mismatched Organization/Company/Plant selectors, cross-tenant reads, and cross-tenant writes.
- Test role grants and role-definition changes with unauthorized actors.
- Assert that every protected handler obtains actor identity from the server session and calls the policy boundary.

### E. RLS and pooled connection isolation

- Inventory every database access path and transaction boundary first.
- Define transaction-local tenant context and a fail-closed behavior when it is absent.
- Test tenant A, then tenant B, on the same reused pooled connection; verify no context survives the transaction.
- Verify rollback and exceptions do not leak tenant context.
- Test direct SQL behavior under the actual application database role, not only a superuser or migration owner.

## Acceptance tracking

| Acceptance area | Status after this audit |
|---|---|
| Application authorization | BLOCKED — no complete session-bound policy facade found. |
| Tenant context enforcement | BLOCKED — no request-bound Organization/Company/Plant resolver found in inspected application paths. |
| Protected operations | BLOCKED — no protected ERP business operation surface found in inspected application paths. |
| RLS policy design and enforcement | BLOCKED — must follow query/transaction inventory and approved policy. |
| Pooled connection/session context isolation | BLOCKED — no tenant context mechanism or reuse test exists in the inspected paths. |
| End-to-end tenant isolation | BLOCKED — no protected business path to exercise. |
| Hosted/production database evidence | NOT ESTABLISHED — this audit did not connect to or inspect a hosted database. |

## Next deliverable

Implement A and B as a small server-only authorization foundation, with an injectable database boundary for deterministic unit tests and a disposable-PostgreSQL integration suite for membership-chain behavior. Keep the implementation deny-by-default and do not introduce a permission matrix or RLS policy until the decisions above are recorded.

**V04 remains BLOCKED.**
