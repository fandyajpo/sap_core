# V04 Security Readiness Audit — 2026-11-09

**Status:** Repository and disposable-CI acceptance PASS; hosted/production acceptance BLOCKED.

**Repository and disposable-CI acceptance:** PASS  
**Hosted/production acceptance:** BLOCKED pending separate approval and provider verification.  
**Audited main baseline:** `31aa3f96c12914046c85d380d40b17458514c616` (after PR #64).  
**Session implementation:** PR #62 merged at `f8995b2f84a7e34f209e358d55a976a0e8a71be8`; [CI run #42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667), all 8 jobs passed.  
**Adversarial session tests:** [PR #64](https://github.com/fandyajpo/sap_core/pull/64) merged at `31aa3f96c12914046c85d380d40b17458514c616`; [CI run #42598741970](https://github.com/fandyajpo/sap_core/actions/runs/42598741970) passed all eight jobs on final PR head `0d52fcb8a77215d2150e155e1543b7b550b56024`.  
**Database boundary:** Disposable PostgreSQL CI was used. No hosted database was connected to, inspected, migrated, seeded, or modified.

## Executive summary

The V04 repository implementation now has a transaction-bound application authorization path, tenant RLS on the approved Core tables, a separate migration/runtime connection contract, and disposable-PostgreSQL evidence.

Implemented evidence:

- Better Auth actor identity is resolved server-side before the tenant transaction.
- Protected authorization, target resolution, persisted grant loading, and protected data reads use one interactive Prisma transaction.
- Transaction-local GUCs are set only after the relevant actor membership and target ancestry have been validated.
- RLS is enabled on 13 approved tenant, membership, assignment, role, and audit tables.
- CI verifies a non-superuser, non-owner runtime role without `BYPASSRLS`; the migration/owner connection is separate.
- Company and Plant protected read endpoints exercise exact-scope authorization and sibling-scope denial.
- Organization role listing and custom-role create/revision routes use the verified session and transaction-bound provider.
- Permission delegation is owner-approved for exactly four read-only permissions: `organization.read`, `company.read`, `plant.read`, and `roles.read`. The forward migration records the approval provenance; all other permissions remain non-delegable.

The repository and disposable CI boundary are verified. The owner-approved permission classification is now applied by a forward migration and is covered by disposable CI. Production remains blocked because hosted-provider role capabilities and deployed privileges have not been verified.

## Findings

| ID | Area | Current evidence | Assessment |
|---|---|---|---|
| V04-A01 | Authentication | `src/lib/auth-session.ts`; Better Auth session used by server-only operations | PASS — actor comes from the verified session, not request payload. |
| V04-A02 | Tenant target validation | `src/lib/tenant-target-context-core.ts`; `src/lib/tenant-target-context.ts` | PASS — active Organization membership and Company/Plant ancestry are validated server-side. |
| V04-A03 | Persisted grants | `src/lib/authorization-grant-loader.ts`; `src/lib/tenant-authorization.ts` | PASS — active typed assignments and sealed/enabled role snapshots are loaded in the protected transaction. |
| V04-A04 | Policy evaluation | `src/lib/authorization-policy-core.ts` | PASS — exact-scope grants, explicit child-administration, target-scope DENY precedence, and fail-closed identifiers. |
| V04-A05 | Protected operations | Organization members GET; Company GET; Plant GET; Organization custom-role list/create/revision; Organization role-assignment GET/POST | PASS for the implemented API slice. This does not imply unimplemented mutation, audit, webhook, background-job or ERP routes are protected. |
| V04-A06 | Transaction boundary | `src/lib/tenant-authorization.ts`; `src/lib/tenant-target-context.ts`; tenant readers | PASS — actor, target context, grants, evaluation, and protected query share one interactive transaction. |
| V04-A07 | RLS | `20261109130000_v04_tenant_rls`; `tests/v04-rls.integration.test.mjs` | PASS in disposable PostgreSQL — 13 approved tables have RLS enabled and direct SQL is tested under the runtime role. |
| V04-A08 | Runtime database role | `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `prisma.config.ts`, CI runtime-role fixture | PASS in CI only — runtime role is non-superuser, non-owner, and lacks `BYPASSRLS`. Hosted role privileges remain unverified. |
| V04-A09 | Company/Plant application coverage | `GET /api/organizations/[organizationId]/companies/[companyId]`; nested Plant GET | PASS — positive exact-scope and sibling-scope negative HTTP tests. |
| V04-A10 | Custom-role delegation | `src/lib/tenant-role-definition-service.ts`; `core.permission_delegation_policy` | PASS — owner-approved read-only allowlist is applied; all other permission codes remain non-delegable. |
| V04-A11 | Tenant GUC pool isolation | `tests/v04-tenant-guc.integration.test.mjs`; `tests/v04-rls.integration.test.mjs` | PASS in disposable CI for tenant GUC cleanup/reuse — backend PID stability, commit/rollback/exception cleanup, concurrent A/B transactions, missing/malformed GUCs, and direct SQL. This is not explicit session-lock pool-reuse coverage. |
| V04-A12 | Session revocation linearization | PR #62 implementation; PR #64 adversarial tests; transaction-bound session-row lock; `FOR SHARE` before tenant GUCs and authorization | PASS in disposable CI for the implemented API slice. Real Better Auth request-first/sign-out ordering proves sign-out waits and completes after the protected transaction; sign-out-first/stale-cookie requests deny; injected backend termination during lock acquisition returns fail-closed HTTP 500; same pooled backend reuse and transaction lock release are verified. CI run #42597914590 passed all eight jobs. |

## Preserved policy constraints

1. No automatic Organization → Company → Plant operational permission inheritance.
2. Organization child-administration is limited to approved administrative operations and requires verified ancestry.
3. Company/Plant operational access requires active typed membership/assignment and an exact-scope role.
4. Applicable target-scope DENY overrides ALLOW.
5. Custom roles are Organization-scoped and ALLOW-only; permissions must be within the creator's trusted delegable subset.
6. Tenant APIs cannot assign Platform Admin or platform-trust roles.
7. Break-glass remains unavailable.
8. Tenant-administration permissions do not authorize ERP operational modules.

## Implementation sequence and evidence

| Gate | Result | Evidence |
|---|---|---|
| Transaction-bound authorization | PASS | PR #38 / #39; same-transaction readers and tenant GUC tests. |
| Tenant GUC and pool isolation | PASS | `tests/v04-tenant-guc.integration.test.mjs`. |
| RLS and runtime-role enforcement | PASS in disposable CI | PR #40; 13-table direct-SQL suite; runtime role checks. |
| Company/Plant protected reads | PASS | PR #41; HTTP positive and sibling-scope negative cases. |
| Custom-role provider and API | PASS in disposable CI; policy classification pending | PR #42; create/revise, actor spoofing, and role-list tests. |
| Hosted production verification | NOT RUN | Requires separate explicit approval; no hosted connection or change was made. |

## Remaining acceptance gates

1. **Hosted database:** separately approve provider-specific runtime-role provisioning, grants, deployment secret configuration, hosted migration, and a production smoke test. The disposable CI role does not prove hosted provider capabilities.
2. **Scope discipline:** the current API proof covers Organization member read, Company read, Plant read, Organization custom-role list/create/revision, and Organization role-assignment GET/POST. Future membership/assignment mutation and ERP routes require their own exact-scope authorization and tests.

**Conclusion:** Repository and disposable-CI acceptance for the currently implemented tenant-administration API slice is PASS, including session-revocation race/failure/pool evidence. Hosted/production acceptance and V04 overall remain BLOCKED because the hosted runtime role, grants, deployment secrets, migration state and production smoke test have not been verified. Future route scope remains bounded to the listed API slice.



## Session revocation implementation and acceptance evidence — PR #62 / PR #64

The owner-approved implementation is merged at `f8995b2f84a7e34f209e358d55a976a0e8a71be8`; [PR #62 CI run #42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667) passed all eight jobs. The session lock revalidates the exact Better Auth session ID/user ID and database expiry, then holds `FOR SHARE` before tenant GUCs and protected authorization/work. This covers Organization member reads, Company/Plant reads, custom-role operations and role-assignment GET/POST.

[PR #64](https://github.com/fandyajpo/sap_core/pull/64) adds real Better Auth HTTP request-first/sign-out ordering, sign-out-first denial and stale-cookie rejection, injected backend termination during session-lock acquisition (HTTP 500; session remains valid), and PostgreSQL session-lock pool reuse. [CI run #42597914590](https://github.com/fandyajpo/sap_core/actions/runs/42597914590) passed all eight jobs on PR #64 head `e161ee2cca296a0baf0ff88337bdd5be660f0402`. PR #64 is merged to `main` at `31aa3f96c12914046c85d380d40b17458514c616`; CI run #42598741970 passed all eight jobs on final PR head `0d52fcb8a77215d2150e155e1543b7b550b56024`.

Repository/disposable-CI session-revocation acceptance for the implemented API slice is PASS. V04 overall remains BLOCKED because hosted runtime-role provisioning, grants, deployment secrets, hosted migration and production smoke test remain NOT VERIFIED. No hosted database was accessed or modified.


## Prisma Postgres provider constraint — hosted role feasibility

The selected hosted provider is Prisma Postgres. Its connection documentation describes generated connection strings as database credentials with full database access; the credentials cannot be restricted to individual tables, schemas, or PostgreSQL roles. The pooled and direct endpoints are intended for different connection patterns (application traffic vs migration/admin tooling), not as a privilege boundary. See [Prisma Postgres connection documentation](https://www.prisma.io/docs/postgres/database/connecting-to-your-database).

Consequences for this project:

- The existing `DATABASE_URL` / `MIGRATION_DATABASE_URL` split remains useful for workload routing (pooled runtime vs direct migrations), but does **not** establish least-privilege separation if both URLs use Prisma Postgres-generated credentials.
- Do not claim a restricted PostgreSQL runtime role can be provisioned using ordinary Prisma Postgres-generated credentials unless Prisma documents or provides a supported mechanism for it.
- The previously observed hosted credential with `rolsuper = true` remains a blocker to treating RLS as an effective defense against arbitrary SQL executed with that credential.
- **Owner architecture decision (2026-11-09): retain Prisma Postgres.** Application-layer authorization is the primary and authoritative tenant security boundary. Prisma Postgres pooled/direct connection URLs are operationally separated, not privilege-separated. The owner accepts this provider constraint for the project; the residual risk must remain explicit: a compromised application or leaked Prisma Postgres credential can exercise the credential's full database access, and RLS must not be represented as a defense against arbitrary SQL executed with that credential. This decision does not waive endpoint authorization, server-only data access, session revocation, input validation, auditability, or production verification requirements.
- A read-only catalog inspection may confirm the current effective role flags and migration state, but cannot create privilege separation that the provider does not support.

**Hosted acceptance remains BLOCKED** pending read-only verification of the effective hosted credential, deployment configuration review, migration-state verification, and production smoke tests. The provider limitation is now an accepted architectural constraint, not an unresolved provider-selection decision. No hosted connection, role change, migration, deployment secret update, or production smoke test is authorized by this audit update.


## Explicit DENY implementation and CI reconciliation — 2026-11-10

[PR #72](https://github.com/fandyajpo/sap_core/pull/72), **feat(v04): implement membership-bound explicit DENY policies**, was squash-merged into `main` as `e6bbe5671014a2f4627719e13b997e82b5d05472`.

The implementation follows the owner-approved governance baseline in PRs #70 and #71:
- DENY applies to one exact Organization membership and one exact Organization/Company/Plant scope; it does not transfer to a replacement membership or inherit into sibling/child scopes.
- Only an active `ORG_OWNER` may create, revoke, and read DENY history in the owner's Organization.
- The first iteration permits only the approved 14 permission codes; `audit.read` remains protected and ineligible.
- Policy and audit history are append-only except for the single attributable policy revocation transition. The approved three-year retention policy is not an authorization to purge; no purge/archive automation was implemented.
- DENY is evaluated against the actor's exact active membership and exact target scope and overrides a matching ALLOW.

The PR adds the dedicated policy/audit persistence model and forward migration `20261109160000_v04_explicit_deny_policy`, owner-only service/API paths, authorization-loader integration, and unit, disposable-PostgreSQL, and real HTTP integration coverage. Denied audit logging was hardened to avoid anonymous or unrelated-tenant audit injection and to cap repeated denial events at 10 per actor and 50 per Organization per event type within a rolling five-minute window. The advisory-lock queries were corrected to return a Prisma-readable integer rather than PostgreSQL `void`.

### CI evidence

PR-head commit `6a470ec96f22f0a60eb25b483231ab1985ae2650` passed Technical validation run [#42719381938](https://github.com/fandyajpo/sap_core/actions/runs/42719381938) (run number 342): all nine jobs succeeded — `static`, `v03-integration`, `v04-pinned-replay`, `v04-deny-integration`, `v04-rls-integration`, `d1-integration`, `d6-integration`, `d7-integration`, and `d8-integration`. The V03 HTTP job also ran `test:v04-deny-policy:http`; the dedicated DENY job ran the disposable PostgreSQL DENY integration suite. The pinned replay applied migration 14 in its disposable validation path and checked the migration history and DENY tables.

### Evidence boundary and remaining gate

This establishes repository implementation and the listed disposable CI behavior only. It does not establish hosted migration state, hosted RLS protection, deployment configuration, production smoke behavior, or legal compliance with the retention policy. The previously observed Prisma Postgres credential had `rolsuper = true`; do not represent RLS as protection against arbitrary SQL executed with that credential. No hosted database, credentials, grants, RLS policy, deployment, or production resource was accessed or changed for PR #72.

**Disposition:** Explicit DENY source implementation and PR CI = PASS. V04 production acceptance remains **BLOCKED** pending separately authorized hosted read-only verification, deployment review, hosted migration-state verification, production smoke testing, and explicit owner acceptance. V05–V10 and Phase 1 remain independently BLOCKED. No gate promotion follows from PR #72.
