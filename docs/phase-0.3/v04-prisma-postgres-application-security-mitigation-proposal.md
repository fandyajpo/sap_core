# V04 Prisma Postgres application-layer security mitigation

**Status:** Owner-approved architecture direction; implementation and acceptance evidence pending  
**Decision date:** 2026-11-09  
**Provider:** Prisma Postgres (retained)

## 1. Decision

The project will retain Prisma Postgres and use **application-layer tenant authorization as the primary security boundary** for requests served by the application.

The configured hosted Prisma Postgres credential was observed with `rolsuper = true`. A PostgreSQL superuser bypasses row-level security (RLS), regardless of the observed `rolbypassrls = false` value. Therefore:

- Hosted RLS must not be represented as an effective isolation boundary for the current credential.
- RLS policies remain in the schema and continue to be tested in disposable environments as defense-in-depth behavior and regression coverage.
- Application authorization must independently prevent cross-tenant reads and writes, including when the database connection can bypass RLS.
- This decision does not authorize weakening authorization checks, skipping tests, or changing the hosted database.
- V04 acceptance is **not promoted by this decision**. It remains pending the application-layer verification work in this proposal and the explicit reconciliation of the V04 acceptance register.

This is an explicit acceptance of the provider's residual risk for the current application architecture, not a claim that a superuser database credential is least-privileged or safe against application-server compromise.

## 2. Security boundary and threat model

### Protected request path

For every tenant-protected operation, the trusted path is:

1. Resolve the actor from a verified Better Auth server session. Never trust a user ID supplied by the request body, query string, route parameter, or client state as the actor identity.
2. Validate the requested tenant target and its Organization → Company → Plant ancestry.
3. Load active typed memberships/assignments and persisted role grants for that actor and target.
4. Evaluate the requested permission, including explicit DENY precedence and the approved delegation constraints.
5. Execute the protected read or write only after authorization succeeds, preferably in the same interactive transaction and on the same transaction client used for the authorization context.
6. Return only data scoped to the validated target. Reject missing, malformed, mismatched, inactive, or ambiguous context by default.

A route handler must not access tenant data before completing its required authorization check. Background jobs, server actions, scheduled tasks, and internal service entrypoints must have an explicit trusted actor/system authorization model; they must not silently bypass the request-path controls.

### In-scope threats

The application-layer controls must withstand:

- A signed-in user changing Organization, Company, Plant, membership, assignment, or resource identifiers.
- A user requesting a sibling or unrelated tenant's resource.
- A valid membership at one scope being incorrectly treated as operational permission at another scope.
- Stale, suspended, revoked, ended, or mismatched memberships and assignments.
- Forged actor identifiers and client-supplied role/permission claims.
- Direct API invocation that skips normal UI navigation.
- A protected query being executed after failed authorization or using a different transaction/connection context.
- A helper or internal service being called without the verified actor and required permission context.

### Residual risks explicitly accepted

Application-layer authorization does **not** protect against:

- Compromise of the application server or arbitrary code execution in the trusted server process.
- Theft or misuse of the hosted database credential by an attacker who can connect directly.
- A malicious or compromised operator with access to the database credential.
- Direct SQL executed with the hosted superuser credential, which can bypass RLS and alter data/schema.

These residual risks must be mitigated operationally (secret handling, restricted deployment access, dependency and code review, monitoring, backups/recovery, and incident response), but must not be described as solved by RLS or application authorization.

## 3. Required implementation controls

### A. Centralized authorization boundary

- Tenant-protected route handlers and server-side services must call the approved authorization service before reading or mutating protected tenant data.
- Keep verified session resolution server-side. Actor identity must be derived from the verified session and cross-checked against the authorization context.
- Keep Organization, Company, and Plant ancestry checks explicit. Do not introduce automatic operational permission inheritance across scopes.
- Preserve exact-scope grants, explicit DENY precedence, owner-approved delegation allowlist, and disabled break-glass behavior.
- Do not expose a generic client-callable database/query helper.

### B. Transaction and query discipline

- Authorization context installation and protected operation should share one interactive Prisma transaction where the operation requires transaction-bound context.
- Use the transaction client passed into the protected operation; do not authorize on one client and query on the global Prisma client.
- Keep tenant SQL parameterized. Dynamic SQL identifiers/fragments, where unavoidable, must come only from fixed internal allowlists; user values must remain bound parameters.
- Review every `$queryRaw`, `$executeRaw`, unsafe raw-query call, direct Prisma model operation, and helper using `scopedAccessDatabase`.
- Every exported helper that answers an access question or mutates memberships/assignments must have an explicit caller inventory and documented authorization contract. A membership-existence predicate is not, by itself, proof of permission to perform an operation.
- Do not add new direct tenant-data access paths without tests demonstrating the same authorization requirements.

### C. Server-only and secret boundary

- Database clients and authorization loaders must remain server-only and must never be imported into browser/client bundles.
- `DATABASE_URL` must remain a server-side secret. Never expose it through public environment prefixes, logs, exception messages, diagnostics, or client responses.
- Keep error responses free of SQL, database connection details, raw policy rows, and secret-bearing metadata.
- Use least-privilege access controls around repository administration, deployment configuration, and secret management even though the provider credential itself is currently superuser.

### D. RLS status

- Preserve the existing RLS migrations and policy definitions unless a separate reviewed change is approved.
- Continue disposable PostgreSQL RLS tests for policy correctness, missing/malformed GUC denial, context cleanup, pool reuse, and concurrency.
- Label those results as **disposable-environment RLS evidence** only.
- Do not claim hosted RLS enforcement, hosted least-privilege, or hosted role-contract PASS for the observed Prisma Postgres credential.

## 4. Required verification plan

The following evidence is required before the application-layer mitigation can be considered accepted:

| ID | Verification | Required result |
|---|---|---|
| APP-01 | Inventory all tenant-facing routes, server actions, background jobs, and exported tenant-data helpers | Every entrypoint has a named authorization contract and owner |
| APP-02 | Trace all tenant-data SQL/Prisma operations and all raw-query helpers | No unreviewed bypass path; user-controlled values are parameterized |
| APP-03 | Cross-tenant API tests using two Organizations | Actor A cannot read or mutate Organization B data by changing any target/resource ID |
| APP-04 | Company/Plant sibling and ancestry tests | Membership or assignment in one branch grants no access to a sibling branch |
| APP-05 | Lifecycle and policy tests | Inactive/revoked/ended membership, explicit DENY, missing grant, invalid scope, and forged actor are denied |
| APP-06 | Authorization-failure atomicity | Failed authorization produces no protected write or observable protected data |
| APP-07 | Transaction-boundary tests | Authorization and protected operation use the same transaction client; GUCs are transaction-local and cleaned after commit, rollback, and exceptions |
| APP-08 | RLS-bypass simulation on a disposable database only | Repeat the cross-tenant application/API tests using a disposable superuser or BYPASSRLS-capable test connection; application checks must still deny unauthorized requests |
| APP-09 | Client/server boundary and secret scan | No database client, secret, raw SQL error, or privileged helper is reachable from client code |
| APP-10 | Regression suite and CI evidence | All relevant unit, integration, static, and pinned migration-replay jobs pass with immutable commit/run references |

APP-08 is especially important: it demonstrates that the application authorization checks do not accidentally depend on RLS to reject a cross-tenant request. It must run only against an isolated disposable CI database. It does not require or authorize changing the hosted database.

## 5. Acceptance reporting

Report these dimensions separately:

1. **Application-layer tenant authorization:** pending APP-01 through APP-10 evidence.
2. **Disposable PostgreSQL RLS behavior:** retain existing bounded CI evidence and report its exact test scope.
3. **Hosted Prisma Postgres role/RLS capability:** observed superuser credential; hosted RLS is not an effective security boundary for this credential.
4. **Residual provider risk:** accepted by the owner for this architecture, with the limitations in Section 2 explicitly retained.

Do not collapse these dimensions into a single generic “RLS PASS”. Do not claim that hosted tenant isolation is database-enforced. Once APP-01 through APP-10 pass, the project may report application-layer tenant authorization as verified for the tested request paths; any untested entrypoint remains outside that claim.

## 6. Change boundaries

This proposal authorizes documentation and the application-layer audit/test work described above. It does **not** authorize:

- Hosted DDL, migrations, role creation/alteration, grants, credential rotation, or other hosted database changes.
- Weakening or bypassing the existing read-only hosted verification workflow.
- Removing RLS policies or changing schema/migration history.
- Introducing cross-scope operational permission inheritance or new delegable permissions.
- Treating untested helpers, routes, or background jobs as authorized by implication.

Any change to schema, migrations, hosted database configuration, credential handling, or permission semantics requires its own review and explicit approval.

## 7. Initial source-audit observations

The initial read-only source review on `main` identified the following areas for the APP-01/APP-02 inventory; these are audit starting points, not findings that all callers are unsafe:

- `src/lib/tenant-authorization.ts`: central permission evaluation and transaction-bound tenant context.
- `src/lib/tenant-target-context.ts`: Organization/Company/Plant ancestry resolution.
- `src/lib/authorization-grant-loader.ts`: persisted role and grant loading.
- `src/lib/organization-members-reader.ts`, `src/lib/tenant-resource-reader.ts`, and `src/lib/tenant-role-definition-service.ts`: protected readers and role operations.
- `src/lib/scoped-access.ts` and `src/lib/scoped-access-service.ts`: raw SQL adapter, membership/assignment lifecycle operations, and exported access predicates. All callers and authorization contracts still need a complete inventory.
- `src/lib/prisma.ts`: server database client initialized from `DATABASE_URL`.

The source review has not yet established that every API route, helper caller, background task, or future entrypoint satisfies the controls above. No implementation or acceptance status is inferred from this preliminary list.
