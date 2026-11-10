# V04 Foundation Readiness Audit — 2026-11-10

**Decision:** READY TO BEGIN DESIGN-PLATFORM UI INTEGRATION for the currently implemented tenant-administration API slice.  
**Production deployment/security sign-off:** BLOCKED.  
**Audited repository:** `fandyajpo/sap_core`, `main` at `8c9fb8ffabba6f3f2e116e4cd6911d12d6e2b294`.  
**No hosted database operation was performed for this audit.**

This report closes the three repository-foundation stages agreed for the project. It supersedes earlier interim status statements that predate PR #80 and PR #82. It does not promote V04 to production-ready and does not authorize hosted migrations, secret changes, deployment, or production smoke tests.

## 1. Stage disposition

| Stage | Result | Evidence |
|---|---|---|
| 1 — Explicit DENY gap | **DONE** | PR #80 merged; actor's active Organization Membership-bound DENY policies are loaded in the role-assignment authorization path and override matching ALLOW. |
| 2 — Reconcile hardening into V04 | **DONE** | PR #82 merged at `8c9fb8ffabba6f3f2e116e4cd6911d12d6e2b294`; branch was based on current `main`, no commits were missing from the feature branch, and all 10 required CI jobs passed on PR head `93516bdd81cfe1fa6e783c36476cb536485616e7`. |
| 3 — Final readiness audit | **DONE** | This report records migration/replay evidence, route contracts, CI coverage, boundaries, and the outstanding hosted-provider production gate. |

## 2. Migration and repository integrity

- The repository contains **15 forward Prisma migrations** through `20261110120000_v04_system_role_assignment_rls_lock`.
- Migration history was not rewritten to reconcile the V04 feature branch. The reconciliation preserved the feature-only migration and implementation files as a forward-only merge.
- CI's `v04-pinned-replay` job starts from the pinned eight-migration baseline, applies migrations 9 through 15 as staged upgrades, and checks `_prisma_migrations` after each step. It then deploys the full current migration set into a separate fresh database and runs D8 integration tests.
- The same PR-head validation passed `db:validate`, `db:generate`, lint, TypeScript typecheck, and the migration status checks.
- Migration/replay evidence is disposable PostgreSQL 17.6 only. It is not evidence that the hosted Prisma Postgres database has migrations 14 and 15 applied.

## 3. Authorization and application boundary

The implemented server-side path uses the verified Better Auth session as the actor source and performs protected authorization/data work in transaction-bound services. The current CI evidence covers:

- Organization, Company, and Plant target ancestry and exact-scope access.
- Active membership and session validation, including revocation/suspension ordering.
- Persisted role assignments, custom-role governance, permission delegation allowlist, and role-assignment grant/list authorization.
- Explicit DENY precedence at the exact applicable scope, bound to the target Organization Membership. A DENY does not cascade to child or sibling scopes and does not transfer to a replacement membership.
- Fail-closed behavior for spoofed actor identities, cross-Organization targets, sibling Company/Plant targets, missing sessions, and denied mutations.
- A non-owner, non-superuser runtime role in disposable PostgreSQL RLS tests. The test role is separate from the migration owner.

The application authorization layer is the primary request-path security boundary for the selected hosted provider. Local RLS tests establish behavior under a restricted disposable role; they do not establish that the hosted provider credential is restricted.

## 4. Current HTTP API contract inventory

The following is the implemented API surface as audited on `main`. This is not a claim that a complete ERP CRUD API exists.

| Route | Methods | Contract |
|---|---|---|
| `/api/organizations/{organizationId}/companies/{companyId}` | GET | Read one Company after Organization/Company authorization. |
| `/api/organizations/{organizationId}/companies/{companyId}/plants/{plantId}` | GET | Read one Plant after Organization/Company/Plant ancestry authorization. |
| `/api/organizations/{organizationId}/members` | GET | List Organization members. |
| `/api/organizations/{organizationId}/roles` | GET, POST | List Organization roles; create an Organization-scoped custom role subject to delegation/governance rules. |
| `/api/organizations/{organizationId}/roles/{roleDefinitionId}/revisions` | POST | Create a governed revision of an Organization custom role. |
| `/api/organizations/{organizationId}/roles/assignments` | GET, POST | List effective assignments for a typed scope/parent/user; grant an assignment. Actor identity is session-derived; caller-supplied actor/recipient identity and break-glass fields are rejected. |
| `/api/organizations/{organizationId}/deny-policies` | GET, POST | Read DENY policy history; create a membership-bound DENY policy. |
| `/api/organizations/{organizationId}/deny-policies/{policyId}` | PATCH | Revoke a DENY policy with a reason. |

### Deliberately out of scope / not implemented by this slice

- Organization creation or deletion.
- Company or Plant create/update/delete.
- Organization membership invitation, onboarding, suspension, role-free membership lifecycle, or removal endpoints.
- General user/account profile management.
- Full ERP modules, operational workflows, and business data APIs.
- Browser UI, navigation, and client-side data orchestration.

UI work must consume only the route contracts above. It must not invent mutation endpoints for the missing operations; those require separately scoped backend work and tests.

## 5. CI and test evidence

The PR #82 head `93516bdd81cfe1fa6e783c36476cb536485616e7` completed all 10 validation jobs successfully:

- `static`
- `v03-integration`
- `v04-pinned-replay`
- `v04-application-adversarial`
- `v04-rls-integration`
- `v04-deny-integration`
- `d1-integration`
- `d6-integration`
- `d7-integration`
- `d8-integration`

The HTTP suite includes real Better Auth sign-out/session-revocation ordering, Company/Plant sibling-scope isolation, Organization custom-role creation policy checks, role-assignment actor spoofing rejection, and membership suspension ordering. The dedicated DENY HTTP suite covers owner-only create/read/revoke and concurrent duplicate policy creation. The adversarial non-owner database suite verifies allowed same-tenant grants, cross-tenant and sibling-scope denials, actor spoofing rejection, missing-session rejection, and no assignment rows after denied operations.

These tests are not a substitute for production observability, operational controls, or provider-side security boundaries.

### Test-boundary qualifications

- The real Better Auth HTTP suites run against disposable PostgreSQL using the migration/test database identity. They prove the tested route composition and concurrency behavior, but they do **not** prove that every HTTP route succeeds under the restricted non-owner role.
- The separate non-owner adversarial application suite exercises the role-assignment production service adapter, including tenant isolation and denied-write behavior. The direct RLS suite exercises database policy behavior with a restricted role. Neither suite is a complete HTTP test of every API route under that role.
- The HTTP test for the role-revision endpoint currently checks malformed-body rejection; it is not a full successful revision / authorization matrix. Additional success, denial, stale-version, and concurrent-revision tests remain desirable before that endpoint is treated as broadly hardened.
- The current CI now adds `pnpm build` to the static job. This build check was absent from the original PR #82 validation workflow; the new run on this audit branch must pass before this report is merged.
- The workflow does not exercise a deployed Vercel environment, hosted Prisma Postgres credentials, hosted migrations, backups, monitoring, or production traffic.

### Disposition of earlier source-audit findings

The 2026-11-09 source audit recorded F-01 through F-05 as open at that earlier commit. Review of the current `main` tree shows these changes:

| Earlier finding | Current source disposition | Remaining boundary |
|---|---|---|
| F-01 — unbound membership / assignment persistence façade | The old unbound Prisma-backed `scopedAccessDatabase` and convenience exports are absent. `scoped-access.ts` is marked `server-only` and exports only `createSessionBoundScopedAccessDatabase`, which locks the verified session in the same transaction. | Do not wire new membership/assignment mutations without operation-specific authorization. |
| F-02 — role assignment not production-wired / unauthorised listing helper | The production adapter now derives actor identity from Better Auth, binds the session transaction, and passes authorization through the transaction. The HTTP route rejects caller-supplied actor/recipient IDs and break-glass fields; service code rejects break-glass. | Keep service-core/test adapters out of request paths; continue route-specific regression coverage. |
| F-03 — missing application-path adversarial tests | Real Better Auth HTTP tests now cover the implemented member, Company, Plant, role, assignment, session-revocation, and DENY flows; the separate restricted-role adversarial service suite covers role assignment. | Coverage is bounded as stated above; not every route/method has a full success/denial/concurrency matrix. |
| F-04 — legacy non-transactional tenant resolver | The previously cited `src/lib/tenant-context.ts` and `tenant-context-core.ts` are absent from the current `src/lib` tree. | Do not reintroduce an unbound resolver as an authorization boundary. |
| F-05 — missing server-only markers | `src/lib/prisma.ts` and `src/lib/scoped-access.ts` both import `server-only`; protected tenant adapters also use server-only boundaries. | Continue to keep privileged DB modules out of client component imports. |

This is a current-tree source review, not a proof against future code changes. The historical source-audit document should remain as a record of findings at its original commit; this table records their current disposition.

## 6. Prisma Postgres hosted-provider limitation — production blocker

The selected provider remains **Prisma Postgres**. Prior hosted read-only evidence recorded the generated database credential as superuser/effectively full-access, with RLS not forced and application tables owned by that identity. Prisma Postgres does not provide custom PostgreSQL roles or per-table privilege separation for its generated credentials; pooled and direct connection endpoints are routing variants, not different privilege levels.

Consequences:

1. Do not claim that tenant RLS protects against arbitrary SQL executed with the hosted full-access credential.
2. Treat application-layer authorization as the primary protection for normal request paths.
3. A backend compromise, leaked database credential, or arbitrary SQL execution with that credential remains a material residual risk.
4. A disposable CI runtime role is useful evidence for application/RLS behavior, but it does not model the hosted credential's privileges.
5. The recorded hosted migration snapshot predates repository migrations 14 and 15. Current hosted migration state is **not verified** and must not be inferred from CI.

Before production traffic, a separately approved production-readiness exercise must verify the current hosted project/database identity, hosted migration state, deployment environment separation, runtime behavior, backups/recovery, logging/monitoring, and the owner's explicit acceptance of the provider's privilege limitation. No hosted access or write is authorized by this report.

## 7. Design-platform integration gate

**READY:** The repository foundation is sufficient to begin UI/design-platform integration against the implemented API slice, subject to these constraints:

- Use Better Auth's existing sign-in/session flow; never trust actor IDs from client state.
- Keep all privileged tenant operations server-side and use the existing transaction-bound services.
- Use the API route/method inventory in §4 as the source of truth.
- Treat 401 as unauthenticated, 403 as denied, 400 as invalid request, 404 as missing target/resource, and 409 as a governance/version/concurrency conflict where returned by the relevant route.
- Do not build UI affordances for unsupported Company/Plant or membership mutations.
- Keep the hosted production gate closed; UI integration is not production deployment authorization.

## 8. Final conclusion

**The three repository-foundation stages are complete.** The project may proceed to design-platform UI integration for the currently implemented API slice.

**V04 is not production-ready.** Hosted Prisma Postgres privilege limitations, current hosted migration state, deployment configuration, production operational controls, and explicit residual-risk acceptance remain separate blockers. No hosted database, credential, migration, deployment, or production resource was changed during this work.
