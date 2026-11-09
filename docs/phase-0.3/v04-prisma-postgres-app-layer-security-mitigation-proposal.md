# V04 Prisma Postgres application-layer security mitigation proposal

**Status:** PROPOSAL — owner direction accepted; implementation and V04 acceptance remain blocked pending review and evidence  
**Decision date:** 2026-11-09  
**Hosted provider:** Prisma Postgres (retained by owner)  
**Scope:** Security-boundary clarification and application authorization audit. This document does not authorize hosted database changes.

## 1. Owner-approved direction

The owner agrees to retain Prisma Postgres and to use application-layer authorization as the primary tenant authorization control for the hosted deployment, given the currently observed hosted credential characteristics.

This decision does **not** mean that the current implementation has been fully audited or accepted, and it does not waive existing V04 security requirements without a separately reviewed change.

The security claims must be stated precisely:

- Application authorization is the primary control for authenticated tenant operations.
- PostgreSQL RLS remains defense in depth and continues to be tested in disposable PostgreSQL environments.
- The current Prisma Postgres hosted credential was observed with `rolsuper = true`; a PostgreSQL superuser bypasses RLS. Therefore hosted RLS is **not** a reliable security boundary against compromise or misuse of this credential.
- A successful application authorization test does not prove database-enforced tenant isolation.
- Hosted V04 acceptance remains **BLOCKED** until the audit and evidence gates in this proposal are completed and the owner explicitly accepts any remaining residual risks.

## 2. Observed facts and constraints

The read-only hosted verification run [42578458589](https://github.com/fandyajpo/sap_core/actions/runs/42578458589) reported:

| Role attribute | Observed value |
|---|---:|
| `rolsuper` | `true` |
| `rolbypassrls` | `false` |
| `rolcanlogin` | `true` |
| `rolcreaterole` | `false` |
| `rolcreatedb` | `false` |

The workflow stopped at the existing non-superuser assertion. Later hosted catalog and policy checks were not executed. The workflow uses a read-only transaction and rolls it back.

Prisma Postgres documentation describes pooled and direct connection strings as endpoints for the same database credentials. Changing the endpoint does not establish a different least-privilege role. See [Prisma Postgres connection documentation](https://www.prisma.io/docs/postgres/database/connecting-to-your-database).

No assumption is made here that undocumented role creation, grants, or credential manipulation is supported. No hosted DDL, role changes, grant changes, credential changes, or migrations are authorized by this proposal.

## 3. Threat model and security boundary

### In scope

- An authenticated tenant user attempts to read or mutate another Organization, Company, Plant, membership, assignment, role, or protected resource.
- A caller tampers with tenant identifiers, scope identifiers, permission names, actor identifiers, or request payloads.
- A route or service is invoked without a verified Better Auth session.
- An application code path bypasses the common authorization service or performs a protected query before authorization.
- A transaction, connection, or pooled backend retains tenant context from a previous request.
- An internal service or future feature uses raw Prisma or SQL without the required tenant authorization boundary.
- A compromised application process or leaked runtime database credential can issue arbitrary SQL as the hosted superuser.

### Explicit limitation

Because the observed hosted credential is a PostgreSQL superuser, database RLS cannot contain arbitrary SQL executed with that credential. Application-layer authorization can prevent ordinary requests from reaching unauthorized operations when all paths are correctly guarded, but it cannot protect against arbitrary SQL execution, a compromised backend process, malicious server-side code, or theft of the credential.

This residual risk must be visible in deployment/security documentation. Do not describe the hosted configuration as database-enforced tenant isolation.

## 4. Source-audit observations (initial, not a complete audit)

The initial review of `main` found:

1. `src/lib/prisma.ts` initializes a shared Prisma client from `DATABASE_URL`.
2. `src/lib/tenant-authorization.ts` obtains actor identity from a verified Better Auth session, resolves tenant target context, loads persisted grants, evaluates the requested permission, and is designed to run with the protected operation in the same interactive transaction.
3. `src/lib/tenant-target-context.ts` resolves Organization membership and Company/Plant ancestry using the transaction client.
4. `src/lib/authorization-grant-loader.ts` loads persisted assignments and grants through the supplied transaction client.
5. `src/lib/organization-members-reader.ts`, `src/lib/tenant-resource-reader.ts`, and `src/lib/tenant-role-definition-service.ts` contain protected query paths that use interactive transactions and authorization checks in the reviewed functions.
6. `src/lib/scoped-access.ts` adapts SQL statements to Prisma `$queryRawUnsafe` / `$executeRawUnsafe`. Its statements and values are separated in the current adapter, but every caller and statement-construction path must be audited; this observation is not a blanket approval of unsafe raw SQL.
7. `src/lib/scoped-access-service.ts` implements membership/assignment lifecycle operations and contains both transaction-bound mutations and standalone access-check helpers. Their call sites and trust boundaries must be inventoried before concluding they are safe for tenant-facing use.

This is a bounded source inspection, not a completed security review. No code change or runtime test is implied by these observations.

## 5. Required audit inventory

Before implementation changes, create and review a complete inventory covering:

- Every App Router API route, server action, server component, and server-only service that reads or writes tenant-owned data.
- Every Prisma model operation, `$queryRaw`, `$executeRaw`, unsafe raw query adapter, and direct SQL helper.
- Every call site of `scopedAccessDatabase`, `scopedAccess`, `hasCompanyAccess`, `hasPlantAccess`, membership grant/transition helpers, role assignment services, and role-definition services.
- Every query that accepts Organization, Company, Plant, membership, assignment, role-definition, or resource identifiers from request data.
- Every privileged/background path (jobs, scripts, seeders, admin utilities, webhooks, scheduled work) and its explicit actor/system authorization model.
- Every identity/session query and the intentional boundary where Better Auth reads occur outside the tenant transaction.
- Every route's authentication, permission, scope resolution, transaction, protected operation, and response/error mapping.

Each inventory entry must record: entry point, caller trust level, actor source, target scope, required permission, authorization function, transaction client, protected SQL/ORM operation, mutation/read classification, and tests.

## 6. Required application authorization invariants

All tenant-facing protected operations must satisfy all applicable invariants:

1. **Verified actor:** actor identity comes only from a verified Better Auth server session or a separately approved non-user system identity. Never trust an actor ID supplied by request payload, URL, or headers.
2. **Explicit permission:** each operation names its permission. Do not infer permission from a role label or UI visibility.
3. **Validated target ancestry:** Organization, Company, and Plant identifiers are resolved from persisted relationships and checked for exact parent ancestry before protected data access.
4. **No implicit operational inheritance:** preserve the existing owner decision that Organization membership does not automatically grant Company/Plant operational access.
5. **Same transaction:** authorization context, grant/deny loading, and the protected database operation use the same interactive Prisma transaction client and connection.
6. **Transaction-local context:** tenant GUCs are set transaction-locally, after validating the relevant actor and ancestry. Empty non-applicable child scopes are explicitly cleared.
7. **Fail closed:** missing session, unknown permission, malformed scope, missing membership, inactive membership/assignment, invalid ancestry, unknown role/grant, authorization error, and context mismatch all deny the operation.
8. **Explicit deny precedence:** retain the approved target-scope DENY-overrides-ALLOW behavior.
9. **No cross-scope leakage:** a valid identifier at one scope must not authorize access to a sibling or unrelated tenant scope.
10. **Mutation authorization:** writes must be authorized before mutation in the same transaction. Lifecycle transitions must re-check parent status and exact ownership under appropriate row locks.
11. **No hidden bypass:** no route, helper, background job, or direct database call may silently bypass the approved authorization boundary.
12. **Safe SQL construction:** parameterize all values. Dynamic identifiers/table names/clauses must come only from closed internal allowlists, never directly from caller input.
13. **Bounded responses:** do not leak cross-tenant existence, protected row data, SQL errors, secrets, or authorization internals in API responses/logs.
14. **Auditability:** security-sensitive membership, assignment, role, and permission changes retain attributable audit evidence under the existing policy.

## 7. Required verification matrix

The audit implementation must add or identify tests for each applicable category:

| Area | Required adversarial cases |
|---|---|
| Actor identity | missing session; forged actor ID; session actor mismatch |
| Organization | no membership; suspended/revoked membership; foreign Organization |
| Company | foreign Company; wrong Organization parent; sibling Company |
| Plant | foreign Plant; wrong Company/Organization ancestry; sibling Plant |
| Permissions | missing grant; unknown permission/role; explicit DENY overriding ALLOW |
| Custom roles | foreign owner; non-delegable permission; permissions beyond creator's delegable set; disabled/unlocked role |
| Reads | list/detail/count/search/export paths cannot leak foreign rows |
| Writes | create/update/delete/lifecycle paths reject foreign or stale context |
| Transaction | authorization and protected operation use the same transaction/backend; rollback on denial/error |
| Pool reuse | no GUC leakage across commit, rollback, exception, or concurrent tenant requests |
| Raw SQL | parameter binding; dynamic identifier allowlist; all callers inventoried |
| Alternate entry points | API routes, server actions, jobs, scripts, webhooks, internal service callers |
| Error handling | deny-by-default; no sensitive SQL/tenant details in client responses |
| RLS CI | retain disposable PostgreSQL checks for policy behavior, role separation, GUC cleanup, and direct SQL denial |

Tests must use independent fixtures for at least two Organizations and sibling Company/Plant scopes. Tests must demonstrate both permitted same-scope behavior and denied cross-scope behavior. Avoid tests that only assert helper return values when the real protected query path can be exercised.

## 8. Hosted vs disposable evidence

Evidence must be labeled by what it actually proves:

- **Application authorization tests:** prove the tested application paths enforce actor, permission, and scope checks under the tested code/configuration.
- **Disposable PostgreSQL RLS tests:** prove the tested policies, roles, transaction-local GUCs, and connection lifecycle behave as expected in that disposable PostgreSQL environment.
- **Hosted read-only metadata:** proves only the catalog/role facts actually observed before the workflow stops.
- **Hosted application smoke tests:** may prove tested application endpoints behave correctly against hosted data, but do not prove RLS contains arbitrary SQL when the credential is superuser.
- **No evidence category may be relabeled as another.** Disposable CI PASS does not establish hosted least privilege or hosted RLS enforcement.

Keep the existing hosted runtime-role assertions unchanged for now. A failed assertion is an accurate BLOCKED result, not a workflow defect to be suppressed.

## 9. Acceptance gates

### Gate A — source inventory complete
- All tenant data entry points and database access paths are enumerated.
- Each path has a documented actor, permission, scope, transaction, and protected operation.
- Unclassified or unguarded paths are tracked as explicit findings.

### Gate B — authorization boundary complete
- Every tenant-facing protected read/write path enforces the invariants in Section 6.
- No unapproved raw SQL or direct Prisma access bypasses the boundary.
- All findings are fixed or explicitly accepted as residual risk by the owner.

### Gate C — adversarial application tests
- The matrix in Section 7 passes for actual protected paths.
- At least two-tenant and sibling-scope isolation tests pass.
- Transaction and pool-reuse guarantees remain green.

### Gate D — disposable database defense-in-depth
- Existing RLS and runtime-role CI assertions remain unchanged and pass in disposable PostgreSQL.
- RLS tests are described as disposable-environment evidence only.

### Gate E — hosted risk and deployment review
- Hosted credential superuser status and its implications are documented in deployment/security materials.
- Hosted RLS is not represented as an effective boundary against this credential.
- The owner explicitly acknowledges arbitrary SQL/backend compromise residual risk.
- No claim of hosted least-privilege runtime role or hosted database-enforced tenant isolation is made.

### Gate F — final owner acceptance
- A consolidated evidence report links source inventory, tests, CI runs, hosted observations, unresolved findings, and residual risks.
- The owner explicitly accepts the final security posture before V04 is promoted.
- Until all required gates and owner acceptance are satisfied, V04 remains **BLOCKED**.

## 10. Non-goals and prohibited shortcuts

This proposal does not authorize:

- weakening or deleting the existing `rolsuper = false` or `rolbypassrls = false` assertions;
- marking hosted runtime-role verification PASS when it fails;
- claiming RLS protects against a hosted superuser;
- changing provider, credentials, grants, roles, schemas, policies, migrations, or hosted data;
- adding an application bypass, privileged fallback, or silent fail-open path;
- treating UI hiding, route obscurity, or client-side permission checks as authorization;
- treating disposable CI evidence as hosted acceptance.

## 11. Next execution sequence

1. Complete the source-level access-path inventory (Gate A), with exact file/line references and call-site coverage.
2. Review and classify each finding with the owner before changing behavior.
3. Implement only approved application-layer hardening changes in small, independently testable PRs.
4. Add adversarial tests for real routes/services and preserve disposable RLS CI.
5. Update the V04 acceptance register with evidence and residual-risk statements.
6. Request explicit owner acceptance; do not promote V04 automatically.

**Current status after this proposal:** direction accepted by owner; proposal awaiting review; source inventory incomplete; implementation gates not yet demonstrated; hosted least-privilege/RLS gate remains blocked.
