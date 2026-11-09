# V04 application-layer acceptance reconciliation — 2026-11-09

**Status:** Findings reconciled; V04 overall remains **BLOCKED**.  
**Reconciled main:** `b776451684c99f085ce5141b6e55324494d2c48d`.  
**Latest relevant CI:** [Run #42589940309](https://github.com/fandyajpo/sap_core/actions/runs/42589940309), PR #59 head `fcc9260b9f5ac944a112f6ef0ca3e06ee8c44de6`, all eight jobs `success`.  
**Scope:** Application-layer source findings F-01–F-05 and the bounded evidence now present on main.  
**Database boundary:** Disposable PostgreSQL CI only. No hosted database was accessed, inspected, migrated, seeded or modified for this reconciliation.

## 1. Why this reconciliation exists

The original [application-layer source audit](v04-application-layer-source-audit-2026-11-09.md) records findings at its original audited revision. It is intentionally retained as historical evidence. Several findings have since been addressed by merged PRs, so its original status table must not be read as the current implementation status.

This document supersedes only the current disposition of F-01–F-05. It does not replace the original audit, prove unimplemented routes, or promote V04 as a whole.

## 2. Finding disposition

| Finding | Current disposition | Merged evidence |
|---|---|---|
| F-01 — unguarded membership/assignment persistence façade | **Implementation CLOSED** | [PR #55](https://github.com/fandyajpo/sap_core/pull/55), merge `46a5c27943af26a856d855a80743d42cd545f780`: scoped-access persistence adapter made server-only and narrowed to the transaction-capable database adapter; unguarded lifecycle convenience exports removed. |
| F-02 — role-assignment service not production-wired | **Implementation CLOSED; CI PASS** | [PR #56](https://github.com/fandyajpo/sap_core/pull/56) hardened the service contract. [PR #59](https://github.com/fandyajpo/sap_core/pull/59), merge `b776451684c99f085ce5141b6e55324494d2c48d`, added the verified-session production adapter, transaction-bound authorization, guarded GET/POST routes and adversarial HTTP coverage. |
| F-03 — application-path adversarial integration coverage | **BOUNDED PASS for implemented API slice** | [PR #57](https://github.com/fandyajpo/sap_core/pull/57), merge `8b3a5161f2c1c6fdbb23fb9f104b917ca2086e5d`, tests real HTTP handlers with Better Auth cookies and a third principal in a separate Organization. PR #59 adds role-assignment route coverage. |
| F-04 — legacy non-transactional tenant resolver | **Implementation CLOSED** | [PR #58](https://github.com/fandyajpo/sap_core/pull/58), merge `609b2cad20f108412ec83158ebfd08f818555767`, removed the unused root-Prisma resolver, pure resolver and obsolete unit test; retained the shared type-only scope contract. |
| F-05 — missing server-only markers | **Implementation CLOSED** | PR #55 added `import "server-only"` to the Prisma singleton and scoped-access persistence adapter, plus `test:v04-server-boundary`. |

## 3. What the adversarial HTTP evidence covers

The V03 disposable-PostgreSQL integration suite exercises actual application handlers and Better Auth session cookies. The added third principal belongs to a separate Organization. Covered cases include:

- Anonymous tenant reads are rejected.
- A valid foreign-Organization session cannot read another Organization's members, Company, Plant or roles.
- Cross-Organization Company and Plant selector substitution is rejected.
- A foreign tenant cannot create a role in another Organization.
- Non-delegable permissions are rejected on custom-role create and revision; denied creation does not persist a role, and denied revision does not add an immutable version.
- A tenant can still access its own Company, providing a positive control.

PR #59 extends the same real HTTP integration path for role assignments:

- Anonymous assignment reads and writes are rejected.
- Request-supplied actor identity is rejected; the persisted grant actor is the verified Better Auth user.
- A member without `roles.assign` cannot grant a role.
- Cross-Organization grants and reads are rejected without persistence.
- An authorized grant and effective-role read succeed.
- Break-glass request data is rejected.

These tests are separate from direct RLS/GUC integration tests. The HTTP evidence validates the exercised production request composition; direct RLS/GUC tests remain defense-in-depth evidence, not a substitute for application authorization.

## 4. CI and local evidence

The PR #59 technical-validation workflow [#42589940309](https://github.com/fandyajpo/sap_core/actions/runs/42589940309) completed with conclusion `success`. All eight jobs passed:

- `static`
- `v03-integration`
- `d1-integration`
- `d6-integration`
- `d7-integration`
- `d8-integration`
- `v04-rls-integration`
- `v04-pinned-replay`

The repository owner also reported local validation at PR head `fcc9260b9f5ac944a112f6ef0ca3e06ee8c44de6`: `pnpm typecheck`, `pnpm build`, `pnpm test:v04-role-assignment` and `pnpm test:v04-role-assignment-production` passed. `pnpm lint` returned zero errors and one pre-existing warning at `tests/d6-scoped-access.integration.test.mjs:556`.

CI ran against disposable PostgreSQL. It does not establish hosted database privileges or production deployment configuration.

## 5. Remaining risks and acceptance boundaries

### 5.1 Hosted provider and runtime role

The hosted Prisma Postgres credential was previously observed with `rolsuper = true`. That role bypasses RLS. The accepted architecture therefore treats application-layer authorization as the primary request-path security boundary and RLS as defense-in-depth only. The residual risk of backend/credential compromise remains.

No hosted database connection or mutation was performed for PR #55–#59 or this reconciliation. Hosted runtime-role provisioning, grants, deployment secrets, hosted migration and production smoke testing remain **NOT VERIFIED** and require separate explicit authorization.

### 5.2 Session revocation linearization

The owner-approved transaction-bound session-row lock is implemented and merged in [PR #62](https://github.com/fandyajpo/sap_core/pull/62), merge `f8995b2f84a7e34f209e358d55a976a0e8a71be8`. The exact verified Better Auth session row is revalidated and locked with `FOR SHARE` before tenant GUCs and authorization queries; the lock is held through the protected transaction. CI run [#42594868667](https://github.com/fandyajpo/sap_core/actions/runs/42594868667) passed all eight jobs.

This is transaction-level serialization, not atomicity between the earlier cookie verification and the database transaction. If revocation wins before lock acquisition, the protected request denies; if the request obtains the lock first, the operation may complete before revocation. Remaining acceptance gaps are real Better Auth HTTP-cookie/sign-out request-first and revocation-first races with HTTP/database assertions, injected lock/query failure proving fail-closed behavior, and explicit pool-reuse isolation. The current request-first PostgreSQL test uses a bounded lock timeout followed by retry and is not a complete HTTP sign-out race.

### 5.3 Scope of implemented operations

The current tested API slice covers Organization member reads, Company reads, Plant reads, Organization custom-role list/create/revision and Organization role-assignment GET/POST. It does not imply that unimplemented membership/assignment mutation, audit, webhook, scheduled-job, background-job or ERP routes are already protected. Each future entry point requires independently attributable actors, exact-scope authorization in the protected transaction and adversarial tests.

## 6. Final disposition

- F-01: implementation closed.
- F-02: production adapter implemented and CI passed.
- F-03: bounded passing evidence for the implemented API slice.
- F-04: legacy resolver removed.
- F-05: server-only boundaries and static test implemented.

**V04 overall remains BLOCKED.** This document reconciles implementation findings; it does not constitute owner acceptance of hosted residual risk, a production verification, or authorization to change hosted resources. V05–V10 and Phase 1 remain independently blocked. No schema, migration, database role, credential, hosted resource or policy was changed.
