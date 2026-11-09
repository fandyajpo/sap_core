# V04 Application Authorization Audit

**Status:** Authorization acceptance remains BLOCKED  
**Audited ref:** `main` at `a382b7e0e92d8af045e4574a7d2162123d0c0bf9`  
**Scope:** Authentication/session boundary, tenant membership and target-context resolution, pure authorization policy evaluator, scoped-access and role services, currently inspected application routes, and available CI evidence.

## Executive finding

The repository now has three distinct foundations:

1. Better Auth resolves the current server-side session.
2. PR #23 provides a session-bound resolver for an actor's active Organization → Company → Plant membership chain. PR #25 adds a target-context resolver that requires active Organization membership and validates descendant Company/Plant identity and parent relationships without requiring Company Membership or Plant Assignment. This supports evaluating explicitly delegated child-administration actions without silently creating operational membership.
3. PR #25 adds a pure v0.1 authorization evaluator for the approved tenant-administration matrix, including typed built-in role scopes, strict-scope child-administration grants, fail-closed unknown permissions/roles, break-glass exclusion, explicit-deny precedence and a custom-role subset helper.

These are foundations, not a complete production authorization boundary. The pure evaluator has no trusted production grant loader. The schema contains RoleDefinition and typed RoleAssignment records, but no persisted permission catalog/payload, explicit-deny store or built-in role seed set. Custom-role permission payloads therefore fail closed unless supplied by a trusted source, and no production source currently supplies them. No real protected Organization/Company/Plant business operation has yet demonstrated the full chain. V04 remains **BLOCKED**.

The owner-approved v0.1 policy is documented in [V04 Authorization Policy v0.1](v04-authorization-policy-v0.1.md).

## Evidence inventory

| Area | Existing implementation | Audit result |
|---|---|---|
| Authentication | `src/lib/auth.ts` configures Better Auth with Prisma and email/password. User hard deletion is disabled. | Authentication foundation present. |
| Session retrieval | `src/lib/auth-session.ts` calls `auth.api.getSession({ headers: await headers() })`. | Session is resolved server-side. |
| Route protection | Inspected App Router pages include Home, Account, Sign In, Register and Better Auth's auth handler. | Account/profile UI protection is not tenant authorization. No protected Organization/Company/Plant business operation was found in the inspected routes. |
| Membership tenant resolver | PR #23 adds `src/lib/tenant-context-core.ts` and server-only `src/lib/tenant-context.ts`. Actor identity is obtained from the current session; active OrganizationMembership, CompanyMembership and PlantAssignment parent chains are checked. | Session-bound membership context exists. It is not a permission evaluator and cannot resolve child administration for an actor without child membership/assignment. |
| Tenant target resolver | PR #25 adds `src/lib/tenant-target-context-core.ts` and server-only `src/lib/tenant-target-context.ts`. It derives actor identity from the current session, requires active Organization membership and verifies requested Company/Plant IDs and persisted parent relationships. | Supports target resolution for delegated child administration without manufacturing Company Membership or Plant Assignment. It is context only; every operation must still authorize a permission. |
| Policy evaluator | PR #25 adds `src/lib/authorization-policy-core.ts`, with the v0.1 built-in role/permission matrix, typed role-scope checks, explicit child-administration grants, deny-overrides-allow input, fail-closed unknown permissions/roles, break-glass exclusion and custom-role subset helper. | Pure policy logic exists and has unit coverage. No production grant loader or server-only authorization facade binds trusted database role assignments to this evaluator. |
| Unit tests and CI | PR #23 adds eight tenant-context tests. PR #25 adds 14 policy-evaluator tests and six target-context tests. The PR #25 CI run passed all seven jobs: static (including lint, typecheck and unit tests), v03 integration, D1, D6, D7, D8 and V04 pinned replay. | Deterministic core behavior and existing regression suites pass. This is not SQL-adapter integration or end-to-end protected-operation evidence. |
| Scoped membership | `src/lib/scoped-access-service.ts` contains active membership predicates and membership lifecycle operations. | Low-level service methods must remain behind a session-bound, permission-checked application boundary. |
| Role assignment | `src/lib/role-assignment-service.ts` requires injected `authorizeGrant` and `authorizeBreakGlassUse` callbacks. | Callback contracts exist; no production policy binding is established. |
| Role definitions | `src/lib/role-definition-service.ts` requires injected create/revise authorization callbacks. | Custom-role subset is an approved rule and a pure helper exists, but the role model has no persisted permission payload and production enforcement is not established. |
| Permission and deny persistence | `prisma/schema.prisma` contains `RoleDefinition` and typed Organization/Company/Plant RoleAssignment records. No permission catalog/payload, role-permission relation or explicit-deny persistence was found. No built-in tenant-role seed set was found in the inspected migrations. | BLOCKED for production grant loading. Do not treat role codes or injected callback contracts as a persisted permission policy. A storage/seed design and explicit migration approval are required before implementing this layer. |
| RLS and pooled context | No verified RLS enforcement or pooled-connection tenant-context isolation evidence was established by this audit. | BLOCKED; design must follow actual query/transaction inventory. |
| Hosted/production database | This audit did not connect to or inspect a hosted database. | No hosted/production evidence established. |

## Security conclusions

1. Never accept `actorUserId` or `userId` from a browser request as proof of identity. Derive the actor from the current Better Auth session on the server.
2. Treat Organization, Company and Plant IDs supplied by a client as untrusted selectors. Resolve each against the verified actor's active Organization membership and persisted parent relationships.
3. Target-context resolution is not authorization. An active Organization membership plus a valid descendant target does not authorize an operation; the permission evaluator must approve the exact permission.
4. A membership check is not a permission check. An ACTIVE membership alone must not imply permission to administer members, grant roles, change role definitions or perform arbitrary business actions.
5. Strict scope is the approved v0.1 baseline: no automatic Organization → Company → Plant operational permission inheritance. The evaluator supports only the matrix's explicitly approved child-administration grants after a server-verified parent chain.
6. Custom roles may contain only permissions their creator is authorized to delegate. Until a trusted permission payload source exists, custom roles without one must fail closed. Platform roles are never assignable through tenant role APIs.
7. The evaluator supports explicit deny precedence, but the current schema has no explicit-deny persistence. Do not claim production deny-overrides-allow enforcement until a trusted deny source is designed, persisted and tested.
8. The evaluator is pure and has no database grant loader. Do not expose it as a complete production authorization facade or call it with client-supplied grants, role codes or custom permission arrays.
9. RLS must not be designed in isolation from the application query and transaction model. Tenant context must be transaction-local and safe under pooled connection reuse; no persistent connection-level tenant setting is acceptable.
10. No schema or migration change was included in PR #25. A permission/deny persistence model and built-in role seeds require a separately reviewed design and explicit implementation authorization.

## Required implementation sequence

### A. Trusted grant source and production authorization facade

- Design the persisted permission catalog and role-permission representation, including explicit-deny semantics and built-in role identities/seeds. The current schema does not support these requirements.
- Define custom-role permission payload storage and immutable/versioned semantics consistent with D8 and the v0.1 subset rule.
- Obtain explicit approval for any schema, migration and seed changes before applying them.
- Add a server-only grant loader that derives actor identity from the session and loads role assignments only through active membership records at their exact typed scope. It must not accept grants or role codes from the browser.
- Bind the trusted grants, explicit denies and target context to `evaluateAuthorization`; fail closed on missing role definitions, disabled roles, unknown permissions, missing deny/grant data or inconsistent scope.
- Bind the production policy to `role-assignment-service.ts` and `role-definition-service.ts` callbacks; reject self-elevation and platform-role assignment.

### B. Protected operations and tests

- Inventory actual protected operations and map each to its permission, exact scope, target predicate and owning module.
- Add a real protected Organization/Company/Plant operation before claiming end-to-end authorization coverage.
- Test every applicable allow/deny role-permission case, anonymous actor, actor without membership, inactive membership, mismatched scope selectors, cross-tenant and sibling-scope reads/writes, unauthorized role grants, custom-role over-delegation and revocation.
- Assert that every protected handler obtains actor identity from the server session and calls the production policy boundary.
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
| Application authorization | BLOCKED — pure policy evaluator exists; trusted grant/deny persistence, production grant loader and operation mapping are not implemented. |
| Tenant context enforcement | BLOCKED — PR #23 membership resolver and PR #25 target resolver exist; enforcement across protected operations is not established. |
| Protected operations | BLOCKED — no protected ERP business operation surface was found in the inspected application routes. |
| RLS policy design and enforcement | BLOCKED — must follow query/transaction inventory and approved policy. |
| Pooled connection/session context isolation | BLOCKED — no tenant-context reuse test or production evidence established. |
| End-to-end tenant isolation | BLOCKED — no protected business path has demonstrated the complete authorization chain. |
| Hosted/production database evidence | NOT ESTABLISHED — this audit did not connect to or inspect a hosted database. |

## Next deliverable

Prepare a focused permission persistence and built-in-role seed design that supports the approved v0.1 matrix, custom-role subset constraints and explicit-deny semantics. Review the exact schema/migration impact before requesting authorization to implement it. After that, build the trusted server-side grant loader and protect a narrowly scoped real administrative operation with positive and negative tests.

**V04 remains BLOCKED.**
