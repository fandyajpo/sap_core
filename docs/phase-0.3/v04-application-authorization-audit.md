# V04 Application Authorization Audit

**Status:** Audit baseline; authorization acceptance remains BLOCKED  
**Audited ref:** `main` at `51300f5fc93613df72bce1d7ca8315e03ab8958e`  
**Scope:** Existing application authentication/session boundary, scoped-access services, role services, tenant-context resolver, and currently inspected application routes.

## Executive finding

The repository has an authentication foundation and a session-bound tenant-context resolver, but it does not yet contain a complete application authorization policy facade or protected Organization/Company/Plant business operations.

PR #23 merged a server-only tenant-context resolver. It derives the actor from the current Better Auth session and validates the active Organization → Company → Plant membership chain. This establishes a useful context-resolution boundary; it does **not** decide whether the actor may perform a requested operation. Active membership is scope eligibility, not permission.

The owner-approved v0.1 tenant-administration permission catalog and role matrix are recorded in [V04 Authorization Policy v0.1](v04-authorization-policy-v0.1.md). This policy authorizes documentation and subsequent design; it does not mean the policy has been implemented or tested end-to-end. V04 remains **BLOCKED**.

## Evidence inventory

| Area | Existing implementation | Audit result |
|---|---|---|
| Authentication | `src/lib/auth.ts` configures Better Auth with Prisma and email/password. User hard deletion is disabled. | Authentication foundation present. |
| Session retrieval | `src/lib/auth-session.ts` calls `auth.api.getSession({ headers: await headers() })`. | Session is resolved server-side. |
| Route protection | Inspected App Router pages include Home, Account, Sign In, Register and Better Auth's auth handler. | Account/profile UI protection is not tenant authorization. No protected Organization/Company/Plant business operation was found in the inspected routes. |
| Tenant context resolver | PR #23 adds `src/lib/tenant-context-core.ts` and server-only `src/lib/tenant-context.ts`. Actor identity is obtained from the current session; the resolver validates active OrganizationMembership, CompanyMembership and PlantAssignment parent chains. | Session-bound tenant-context foundation exists. It is not a permission evaluator and is not yet enforced across protected business operations. |
| Resolver tests | PR #23 adds eight unit tests using an injected repository boundary. | Deterministic resolver behavior is tested. These tests do not constitute production SQL adapter integration evidence or end-to-end operation authorization. |
| Scoped membership | `src/lib/scoped-access-service.ts` contains active membership predicates and membership lifecycle operations. | Low-level service methods must remain behind a session-bound, permission-checked application boundary. |
| Role assignment | `src/lib/role-assignment-service.ts` requires injected `authorizeGrant` and `authorizeBreakGlassUse` callbacks. | Callback contracts exist; a complete production policy facade enforcing the approved matrix is not established. |
| Role definitions | `src/lib/role-definition-service.ts` requires injected create/revise authorization callbacks. | Custom-role subset delegation is now owner-approved policy, but production enforcement and tests remain pending. |
| Permission catalog | The approved tenant-administration catalog and matrix are documented in [policy v0.1](v04-authorization-policy-v0-1.md). | Policy decision is documented; implementation, seed representation and operation mapping are not established. |
| RLS and pooled context | No verified RLS enforcement or pooled-connection tenant-context isolation evidence was established by this audit. | BLOCKED; design must follow actual query/transaction inventory. |
| Hosted/production database | This audit did not connect to or inspect a hosted database. | No hosted/production evidence established. |

## Security conclusions

1. Never accept `actorUserId` or `userId` from a browser request as proof of identity. Derive the actor from the current Better Auth session on the server.
2. Treat Organization, Company and Plant IDs supplied by a client as untrusted selectors. Resolve each against the verified actor's active membership chain and persisted parent relationships.
3. A membership check is not a permission check. An ACTIVE membership alone must not imply permission to administer members, grant roles, change role definitions or perform arbitrary business actions.
4. Enforce the owner-approved [v0.1 permission policy](v04-authorization-policy-v0-1.md) through a server-only authorization facade. Do not expose low-level membership or role services directly to untrusted request paths.
5. Strict scope is the approved v0.1 baseline: no automatic Organization → Company → Plant role/permission inheritance. Organization administration explicitly granted by the matrix does not imply operational access at every child scope.
6. Custom roles may contain only permissions their creator is authorized to delegate. Platform roles are never assignable through tenant role APIs.
7. RLS must not be designed in isolation from the application query and transaction model. Tenant context must be transaction-local and safe under pooled connection reuse; no persistent connection-level tenant setting is acceptable.
8. No schema or migration change is justified by this audit alone.

## Required implementation sequence

### A. Policy mapping and session-bound authorization facade

- Treat [policy v0.1](v04-authorization-policy-v0-1.md) as the approved tenant-administration baseline.
- Inventory actual protected operations and map each operation to its permission, exact scope, target predicate and owning module.
- Add a server-only authorization entry point that obtains actor identity from the current session and uses the tenant-context resolver.
- Evaluate permission at the exact target scope; enforce deny-overrides-allow and fail-closed behavior.
- Enforce custom-role subset delegation and reject platform-role assignment through tenant APIs.

### B. Protected operations and tests

- Add a real protected Organization/Company/Plant operation before claiming end-to-end authorization coverage.
- Test every applicable allow/deny role-permission case, anonymous actor, actor without membership, inactive membership, mismatched scope selectors, cross-tenant and sibling-scope reads/writes, unauthorized role grants, custom-role over-delegation and revocation.
- Assert that every protected handler obtains actor identity from the server session and calls the policy boundary.
- Verify list/report queries enforce scope predicates in the database/data-access layer.

### C. RLS and pooled connection isolation

- Inventory every database access path and transaction boundary first.
- Define transaction-local tenant context and fail-closed behavior when absent.
- Test tenant A, then tenant B, on the same reused pooled connection; verify no context survives the transaction.
- Verify rollback and exceptions do not leak tenant context.
- Test direct SQL behavior under the actual application database role, not only a superuser or migration owner.

## Acceptance tracking

| Acceptance area | Status |
|---|---|
| Application authorization | BLOCKED — policy approved/documented; complete session-bound permission evaluator and operation mapping not implemented. |
| Tenant context enforcement | BLOCKED — PR #23 provides a resolver foundation, but enforcement across protected operations is not established. |
| Protected operations | BLOCKED — no protected ERP business operation surface was found in the inspected application routes. |
| RLS policy design and enforcement | BLOCKED — must follow query/transaction inventory and approved policy. |
| Pooled connection/session context isolation | BLOCKED — no tenant-context reuse test or production evidence established. |
| End-to-end tenant isolation | BLOCKED — no protected business path has demonstrated the complete authorization chain. |
| Hosted/production database evidence | NOT ESTABLISHED — this audit did not connect to or inspect a hosted database. |

## Next deliverable

Implement the server-only authorization facade and operation mapping against the approved v0.1 policy, then protect a narrowly scoped real Organization/Company/Plant operation with positive and negative tests. Keep schema, migrations and RLS out of scope until the actual implementation and transaction patterns justify a reviewed design.

**V04 remains BLOCKED.**
