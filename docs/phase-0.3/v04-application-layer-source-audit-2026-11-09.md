# V04 application-layer authorization source audit

**Audit date:** 2026-11-09  
**Audited revision:** `a7b7d11b1c46c7c2d0035ce27c9ce130768f9850` (main, after PR #53)  
**Scope:** Checked-in application source, API handlers, authorization/data services, SQL adapters, and relevant test coverage  
**Result:** Initial source inventory complete for the current repository tree; application-path acceptance remains **BLOCKED**  
**Change type:** Documentation only. No code or database changes.

## 1. Executive result

The currently implemented tenant-facing HTTP handlers delegate to service functions that perform authorization before the protected query or mutation. The reviewed Company, Plant, Organization member, and Organization role paths use verified Better Auth session identity and transaction-bound authorization checks.

No direct cross-tenant exposure was confirmed in those currently implemented request paths during this static review. This is not a proof of safety: no application-level adversarial integration suite currently exercises the actual handlers and production service adapters against two or more tenants.

The audit identified internal persistence/service surfaces that must be hardened or explicitly kept unwired before additional tenant features are built:

1. `scoped-access.ts` exports a Prisma-backed membership/assignment service whose grant and lifecycle methods do not perform actor/session/permission authorization. No checked-in API handler calls those convenience methods at this revision, but they are available to any server-side importer.
2. `role-assignment-service.ts` is not wired into a production route or server service. Its `listEffectiveRoleAssignments` method performs a direct query without an authorization callback; its grant authorization callback is not given the transaction session. It must not be wired into request paths unchanged.
3. `tenant-context.ts` exposes a legacy membership/assignment resolver using the root Prisma client outside a transaction. It resolves membership but does not enforce a permission. No production source callsite was found; new protected paths must use the transaction-bound target resolver and authorization service instead.
4. Server-only Prisma adapters `prisma.ts` and `scoped-access.ts` do not declare the Next.js `server-only` boundary. This should be corrected as defense against accidental client-module imports.
5. Current tests do not execute the actual Company/Plant/member/role API paths through the production session, authorization, transaction, and service composition. Existing core, lifecycle, GUC, and disposable-RLS tests provide useful but narrower evidence.

These are source-audit findings and verification gaps, not evidence that a currently exposed route is exploitable. Do not promote V04 based on this audit.

## 2. Production entry-point inventory

The recursive repository tree at the audited SHA contained the following application entry points.

| Entry point | Operation | Data path / security boundary | Audit result |
|---|---|---|---|
| `src/app/api/auth/[...all]/route.ts` | Better Auth GET/POST | `toNextJsHandler(auth)`; identity/session lifecycle only | Authentication adapter; no tenant business query in route |
| `/api/organizations/[organizationId]/companies/[companyId]` | GET Company | `getCompany` → `requireTenantPermission(company.read)` → same Prisma transaction query | Guarded in reviewed implementation |
| `/api/organizations/[organizationId]/companies/[companyId]/plants/[plantId]` | GET Plant | `getPlant` → `requireTenantPermission(plant.read)` → same Prisma transaction query | Guarded in reviewed implementation |
| `/api/organizations/[organizationId]/members` | GET members | `listOrganizationMembers` → `requireTenantPermission(organization.members.read)` → same transaction query | Guarded in reviewed implementation |
| `/api/organizations/[organizationId]/roles` | GET roles | `listOrganizationRoles` → `requireTenantPermission(roles.read)` → same transaction query | Guarded in reviewed implementation |
| `/api/organizations/[organizationId]/roles` | POST custom role | `createCustomRoleForCurrentUser` → verified session → scoped transaction → active Organization membership, persisted delegable grant evaluation, write | Guarded by a separate transaction-bound custom-role authorization adapter; requires production-path tests |
| `/api/organizations/[organizationId]/roles/[roleDefinitionId]/revisions` | POST revision | `reviseCustomRoleForCurrentUser` → verified session → scoped transaction → owner/membership/delegation/permission checks, write | Guarded by a separate transaction-bound custom-role authorization adapter; requires production-path tests |

The authenticated pages `/`, `/account`, `/register`, and `/sign-in` use Better Auth session checks and expose identity/profile information only. The profile-name form calls Better Auth's `updateUser`; no tenant-owned business data is read or mutated by those pages in the reviewed source.

No Company/Plant creation, membership management, role-assignment, audit, webhook, scheduled-job, or background-job HTTP entry point was present in the audited application tree. This is a statement about the checked-in revision only.

## 3. Core authorization/data path inventory

| Component | Responsibility | Transaction / actor observations |
|---|---|---|
| `src/lib/auth-session.ts` | Better Auth server session | Calls `auth.api.getSession` with Next request headers |
| `src/lib/tenant-authorization.ts` | Common permission boundary | Requires verified session; installs `app.user_id`; resolves target; installs verified scope GUCs; loads grants; evaluates permission |
| `src/lib/tenant-target-context.ts` | Target ancestry resolver | Uses only supplied interactive transaction client; validates active Organization membership and exact Company/Plant ancestry |
| `src/lib/authorization-grant-loader.ts` | Persisted grants/denies | Queries active typed assignments and locked role snapshots through the supplied transaction |
| `src/lib/authorization-policy-core.ts` | Pure policy evaluator | Exact typed scopes, explicit child-administration rules, custom role owner checks, target-scope DENY precedence, break-glass excluded |
| `src/lib/tenant-resource-reader.ts` | Company and Plant reads | Session resolved before transaction; authorization and protected SELECT use the same transaction client |
| `src/lib/organization-members-reader.ts` | Organization member read | Session resolved before transaction; authorization and protected SELECT use the same transaction client |
| `src/lib/tenant-role-definition-service.ts` | Custom role create/revise and role listing | List uses common permission boundary; create/revise use a separate session-bound authorization adapter on the same scoped transaction as the writes |
| `src/lib/role-definition-service.ts` | Custom role persistence | Transactional writes, owner checks, delegation subset checks, immutable versioning, permission snapshot sealing, audit row |
| `src/lib/scoped-access.ts` | Prisma-to-raw-SQL adapter | Root Prisma client plus transaction wrapper; exports both generic database adapter and membership lifecycle convenience methods |
| `src/lib/scoped-access-service.ts` | Membership/assignment lifecycle logic | Validates parent relationships and status transitions; its service methods do not independently authenticate an actor or authorize a permission |
| `src/lib/role-assignment-service.ts` | Role assignment persistence factory | No production wiring found; authorization behavior is injected; read helper lacks authorization callback |
| `src/lib/tenant-context.ts` | Legacy membership/assignment resolver | Uses root Prisma queries, outside a single transaction; membership resolution only, no permission decision; no production callsite found |
| `src/lib/prisma.ts` | Shared Prisma singleton | Exposes general Prisma client initialized from `DATABASE_URL` |

### 3.1 Positive observations

- The Company and Plant readers resolve the Better Auth session before opening a Prisma interactive transaction, then call `requireTenantPermission` and execute the protected SELECT using the same `tx`.
- The common authorization service derives actor identity from the verified session rather than request-supplied user IDs.
- Company and Plant target ancestry is checked from persisted parent relationships; target GUCs are installed only after each relevant row is verified.
- The grant loader checks active Organization, Company, and Plant parent chains, typed role scopes, role ownership, sealed role snapshots, known permission codes, and excludes break-glass assignments.
- The custom-role create/revise adapter checks that its actor matches the verified session, requires active Organization membership, loads persisted grants and DENYs, and performs the write in the same transaction object.
- Reviewed SQL values are bound as parameters. Dynamic table/column identifiers in role assignment and scoped-access lifecycle code are selected from closed internal mappings rather than caller-supplied identifiers. The scoped-access raw adapter passes values separately to Prisma's raw-query methods. No direct SQL injection path from request input was identified in the reviewed source.
- API handlers return generic access-denied responses for Company, Plant, and Organization member reads. No SQL message or database credential is intentionally returned by those handlers.

### 3.2 Transaction/session boundary requiring explicit treatment

Better Auth session lookup occurs before the tenant transaction because identity/session tables are outside the first tenant RLS policy set. This is an intentional architectural boundary in the current implementation. The review did not find a test for session revocation racing between `getCurrentSession()` and the start of the protected transaction. Decide whether that small time-of-check/time-of-use window is accepted or whether the session must be revalidated as part of the protected operation. Do not silently claim that the session lookup and tenant transaction are atomic.

## 4. Findings

### F-01 — Unguarded membership/assignment persistence façade

**Severity:** Medium architectural risk; no current HTTP exposure confirmed  
**Files:** `src/lib/scoped-access.ts`, `src/lib/scoped-access-service.ts`

`scoped-access.ts` exports `scopedAccess` and convenience functions including `grantCompanyMembership`, `suspendCompanyMembership`, `restoreCompanyMembership`, `revokeCompanyMembership`, `endCompanyMembership`, `grantPlantAssignment`, `suspendPlantAssignment`, `restorePlantAssignment`, `revokePlantAssignment`, `endPlantAssignment`, `hasCompanyAccess`, and `hasPlantAccess`.

The underlying lifecycle service checks input shape, parent consistency, active parent state, row locks, and unique-slot behavior. It does **not** bind a human actor to a verified session or evaluate the relevant tenant permission. For example, grant methods accept a caller-provided `userId`; transition methods accept an assignment ID and mutate it after status checks.

The current application source imports `scopedAccessDatabase` from this adapter for custom-role persistence; no current API handler calls the unguarded membership/assignment convenience methods. The D6 integration tests call the lifecycle service directly as a domain/database test. Therefore this is a latent bypass surface, not a confirmed currently exposed endpoint.

**Required action before wiring membership-management routes:**
- Keep persistence/domain lifecycle logic separate from the request authorization façade.
- Make the adapter server-only and avoid exporting unguarded mutation helpers to general application modules.
- Add guarded service functions that derive the actor from a verified session, resolve exact target ancestry, require the relevant permission, and execute authorization plus mutation in one transaction.
- Ensure no request-supplied `userId` can choose the actor; a target subject user may be an input, but the actor must be independently session-derived.
- Add adversarial tests for foreign Organization, Company, Plant, sibling targets, stale parent status, and concurrent transitions.

### F-02 — Role-assignment service is not production-wired and has an unauthorised read helper

**Severity:** Medium architectural risk; currently unwired  
**File:** `src/lib/role-assignment-service.ts`

No production route or server service in the audited `src/` tree instantiates `createRoleAssignmentService`. The D7/D8 integration tests instantiate it with test-provided database and authorization adapters.

Two constraints must be resolved before production integration:

- `listEffectiveRoleAssignments(input)` accepts caller-provided `userId`, scope, and parent ID, then directly queries the database. It has no authorization callback or verified actor binding.
- `authorizeGrant` and `authorizeBreakGlassUse` receive authorization inputs but not the active `ScopedAccessSession`. A future implementation cannot establish from this interface alone that its authorization reads use the same transaction and locked state as the assignment write.

The service also contains `recordBreakGlassUse`, while the owner-approved V04 policy keeps break-glass disabled. No production callsite was found.

**Required action before production wiring:**
- Do not expose `listEffectiveRoleAssignments` to a tenant request without a verified-session and permission boundary.
- Pass the transaction session to authorization callbacks and require all authorization reads/writes to use it.
- Keep break-glass unavailable; remove or hard-disable the path unless a separate owner-approved policy is recorded.
- Add tests for forged actor IDs, cross-tenant parent IDs, role owner mismatch, concurrent revocation, and same-transaction authorization.

### F-03 — Missing application-path adversarial integration coverage

**Severity:** High acceptance gap (verification gap, not a confirmed exploit)  
**Files:** `tests/v04-transaction-boundary.unit.test.mjs`, `tests/v04-rls.integration.test.mjs`, `tests/v04-tenant-guc.integration.test.mjs`, `tests/organization-members-reader.unit.test.mjs`, `tests/tenant-target-context.unit.test.mjs`, `tests/authorization-policy.unit.test.mjs`

Current evidence is useful but narrower than the application-layer security claim:

- Policy unit tests exercise the pure evaluator.
- Target-context unit tests exercise a dependency-injected core resolver.
- Organization-member reader unit tests exercise a pure orchestration helper, not the production Prisma adapter or API handler.
- Transaction-boundary tests inspect source text and ordering; they do not execute the actual protected operation.
- GUC integration tests use direct PostgreSQL connections to test transaction-local state, backend reuse, rollback, and concurrency.
- RLS integration tests use disposable PostgreSQL roles and direct SQL to test RLS policies and grants.
- D6/D7/D8 integration tests exercise domain persistence services with test database adapters and injected authorization callbacks.

The reviewed test set does not demonstrate actual Company/Plant/member/role HTTP handlers and production service composition denying cross-tenant reads/writes under a verified Better Auth session. It also does not establish that every future tenant route is forced through the authorization boundary.

**Required action:**
- Add application-level integration tests that exercise the real service entry points (and route handlers where practical) with a controlled Better Auth session and disposable PostgreSQL database.
- Include at least two Organizations, sibling Companies, and sibling Plants.
- Test both allowed same-scope behavior and denied cross-scope reads/writes.
- Assert authorization occurs before protected access and that denied operations do not mutate or reveal protected rows.
- Test custom-role create/revise through the production adapter, including non-delegable permissions and explicit DENY.
- Keep direct RLS/GUC tests as separate defense-in-depth evidence; do not count them as application-layer authorization evidence.

### F-04 — Legacy non-transactional tenant context resolver remains available

**Severity:** Low/Medium maintenance and bypass risk; no production callsite found  
**Files:** `src/lib/tenant-context.ts`, `src/lib/tenant-context-core.ts`

The legacy resolver checks active Organization/Company/Plant memberships and ancestry, but queries through the root Prisma client and does not evaluate an operation permission. It is not the transaction-bound authorization path used by current protected readers. No production source callsite was found at the audited SHA.

**Required action:**
- Remove the unused production adapter if no planned caller needs it, or clearly deprecate it and prevent it from being used for protected operations.
- Keep the pure core only if it still has a separately justified use and test purpose.
- Document `requireTenantPermission(tx, session, request, permission)` as the required protected-operation entry point, with the custom-role adapter as the explicitly documented exception.

### F-05 — Missing explicit server-only markers on privileged adapters

**Severity:** Low defense-in-depth  
**Files:** `src/lib/prisma.ts`, `src/lib/scoped-access.ts`

These modules expose the shared Prisma client and a raw SQL adapter but do not import Next.js's `server-only` marker. Other tenant services already use that marker.

**Required action:**
- Add `import "server-only"` to privileged database adapters and review other server-only modules for consistency.
- Add a build/static test that rejects client-component imports of server database modules.
- This is not a substitute for authorization; it prevents accidental client-bundle coupling.

## 5. Raw SQL and query-construction review

The reviewed application SQL uses parameter placeholders or Prisma tagged-template parameters for values. The dynamic table and parent-column identifiers in `role-assignment-service.ts` are selected from the fixed `assignmentTables` mapping for the closed scope union. The scoped-access lifecycle adapter selects Company/Plant table and column fragments from the closed internal `kind` union.

`scoped-access.ts` uses `$queryRawUnsafe` and `$executeRawUnsafe`, but its adapter passes the SQL statement and values as separate arguments. This is safe only while statements remain internal, code-authored SQL and values remain bound separately. Do not expose a generic statement-taking query function to request input or treat the use of parameter arrays as proof that arbitrary caller-supplied SQL is safe.

No concrete request-controlled SQL injection vector was identified in the reviewed source. The generic raw adapter's breadth is captured in F-01/F-05 as an encapsulation concern.

## 6. Evidence boundaries

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| Policy unit tests | Pure permission/scope decision behavior for tested cases | Session verification, database grants, route wiring, hosted behavior |
| Target-context unit tests | Core ancestry resolver behavior with injected repository | Actual Prisma/RLS behavior or route protection |
| D6/D7/D8 disposable integration tests | Domain persistence, constraints, lifecycle, and injected callback behavior in disposable PostgreSQL | Production session adapter wiring or hosted tenant isolation |
| V04 GUC integration tests | Transaction-local GUC cleanup, same-backend behavior, and concurrency in disposable PostgreSQL | That every application route sets GUCs correctly |
| V04 RLS integration tests | RLS behavior under the disposable non-owner/non-superuser role | Hosted RLS protection against the observed hosted superuser |
| Static source review | Reviewed source paths and structural call flow at the audited SHA | Runtime behavior, unreviewed deployments, or absence of future code paths |

The hosted Prisma Postgres role observation remains unchanged: the configured credential was observed with `rolsuper = true`. RLS cannot contain arbitrary SQL executed with that superuser credential. Application-layer authorization is therefore the primary request-path control, with the explicitly documented residual risk of backend/credential compromise.

## 7. Recommended implementation sequence

1. Resolve F-01 and F-05 first: narrow the privileged database adapter and mark it server-only before new membership-management endpoints are added.
2. Keep F-02 role-assignment code unwired until its transaction-bound authorization contract and break-glass exclusion are corrected.
3. Resolve F-04 by removing or deprecating the legacy non-transactional resolver.
4. Build F-03 application-level integration coverage against the real production service composition.
5. Re-audit all tenant entry points after hardening and record exact passing test/CI evidence.
6. Update the V04 acceptance register only after the required evidence exists and the owner explicitly accepts the residual hosted risk.

## 8. Current gate status

- Source inventory for the current checked-in application tree: **COMPLETED (static review)**.
- Confirmed cross-tenant exploit in current exposed handlers: **NOT IDENTIFIED in this review**.
- Internal bypass-prone persistence surfaces: **FINDINGS OPEN (F-01, F-02)**.
- Legacy path and server-only hardening: **FINDINGS OPEN (F-04, F-05)**.
- Application-path adversarial integration tests: **NOT DEMONSTRATED (F-03)**.
- Hosted least-privilege role / hosted RLS boundary: **BLOCKED** due observed hosted superuser credential.
- V04 overall acceptance: **BLOCKED**.

This report records a source audit, not an owner acceptance of the remaining risk and not authorization to change the hosted database.
