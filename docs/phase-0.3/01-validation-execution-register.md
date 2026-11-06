# Phase 0.3 — Technical Validation Execution Register

**Overall state:** `IN_PROGRESS`  
**Baseline commit inspected:** `847eff88d82967d931afed7335254d605b46cdad`  
**Rule:** A validation is PASS only when reproducible evidence exists. Missing artifacts are BLOCKED / NOT RUN, never PASS and never automatically FAIL.

| ID | Validation | Current state | Exit evidence |
|---|---|---|---|
| V00 | Repository baseline inspection | `PASS` (inventory only) | [Baseline assessment](00-repository-baseline-assessment.md) |
| V01 | Prisma multi-schema validation | `PASS` | PostgreSQL 17.6; Prisma 7.10.1 validation and Client generation; all ten PostgreSQL schemas physically verified; initial migrations applied and database status up to date; fresh disposable database reproducibility verified |
| V02 | Cross-schema relation validation | `PASS` | Cross-schema relation migration applied; PostgreSQL FK metadata verified; orphan reference rejected; `ON DELETE CASCADE` behavior verified; test transaction rolled back |
| V03 | Better Auth canonical identity | `BLOCKED` | X06 implementation and a dedicated GitHub Actions integration job are authored; no successful V03 workflow run is recorded yet. Manual validation, migration evidence and a successful CI integration run remain pending. See evidence below. |
| V04 | Tenant isolation and RLS | `BLOCKED` | Company/plant scope enforcement, RLS policy evidence where selected, cross-tenant negative tests |
| V05 | Migration/schema integrity | `BLOCKED` | Clean database migration, repeatability, drift and recovery evidence |
| V06 | Transaction/concurrency | `BLOCKED` | Interactive transaction, rollback, idempotency, race and financial/stock integrity tests |
| V07 | Pooling/session context | `BLOCKED` | Pooled connection reuse, transaction-local context isolation, cleanup and failure tests |
| V08 | Query cancellation/workload controls | `BLOCKED` | Timeout, cancellation, bounded workload and safe retry evidence |
| V09 | Error classification/recovery | `BLOCKED` | SQLSTATE/Prisma/provider error taxonomy, redaction, retry and ambiguous-outcome tests |
| V10 | Security/privilege boundaries | `BLOCKED` | Least-privilege roles, secrets handling, authz boundaries, audit and negative security tests |

## V03 evidence and X06 implementation reconciliation

### Evidence recorded

- Better Auth `1.7.17` and Prisma `7.10.1` were installed; Prisma Client generation succeeded.
- The local V03 integration suite passed: 3 tests, 3 passed, 0 failed. This predates the X06 test additions and is not evidence for the current suite.
- Migration status reported 5 migrations found and the database schema up to date. This does not establish a clean migration replay.
- GitHub Actions static validation passed on commit `c0bef8e7c3843ebd763e8aa01a2533821cf8b2a2` for dependency installation, `pnpm db:validate`, `pnpm db:generate`, lint, and typecheck.
- A dedicated `v03-integration` GitHub Actions job is now configured for pull requests and pushes to `main`; an actual successful run is still pending.

### X06 implementation authored; execution evidence pending

P05 X06 is `OWNER_APPROVED` and final: `core.session.userId` → `core.user.id` and `core.account.userId` → `core.user.id` both require `ON DELETE RESTRICT`. The Prisma schema and Better Auth config encode the policy, including explicit `user.deleteUser.enabled: false`; no Admin plugin or custom deletion endpoint is configured. The integration suite covers independent session/account FK restrictions, blocked hard deletion, database-backed sign-out revocation, successful and rejected account unlink attempts, and RESTRICT-safe cleanup. One new forward migration replaces only the two auth FKs and retains `ON UPDATE CASCADE`; no applied migration or migration lock was changed. The new CI job runs the suite against an isolated PostgreSQL service, but it has not yet produced a successful workflow result. V03 remains `BLOCKED` pending local validation, clean migration evidence and a successful GitHub Actions integration run.

### X06 manual verification commands (not run here)

From the `Sap Core` repository root, run these in order and review each result before changing V03 from `BLOCKED`:

1. `docker compose up -d postgres`
2. `pnpm db:validate`
3. `pnpm db:generate`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm db:migrate:deploy`
7. `pnpm db:status`
8. `pnpm test:v03`

## Execution sequence

### Stage 1 — Establish reproducible harness

- Confirm exact Node.js and package-manager policy.
- Pin Next.js, React, TypeScript, Prisma CLI and Prisma Client as a compatible set.
- Add a disposable PostgreSQL environment.
- Add the ten-schema Prisma proof of concept without implementing ERP workflows.
- Add deterministic install, lint/typecheck, Prisma validate/generate/migrate and test scripts.
- Add CI that runs the same commands.

### Stage 2 — Database architecture proof

- V01 and V02 are passed as recorded above.
- Validate migration history, drift handling and clean bootstrap for V05.
- Exercise transaction, concurrency, pooling and session context for V06/V07.
- Exercise cancellation, workload bounds and error recovery for V08/V09.

### Stage 3 — Identity, authorization and security proof

- Validate Better Auth adapter compatibility and canonical `core.user` mapping.
- Validate CASL separately from authentication.
- Validate organization/company/plant isolation and selected RLS boundaries.
- Execute P10 session validation backlog and security/privilege checks for V03/V04/V10.

### Stage 4 — Gate review

- Attach command output, test reports, migration evidence and relevant commit references.
- Record residual risks and deviations.
- Clear only gates whose complete acceptance criteria are evidenced.
- Keep Phase 1 blocked while any required gate remains unresolved.

## Current blocker

V01 and V02 are `PASS` based on the evidence recorded above. X06 is owner-approved and its schema, config, forward migration and test changes are authored, but V03 remains `BLOCKED` until those changes are executed and their evidence reviewed; clean migration replay and CI integration testing are also pending. V04–V10 remain `BLOCKED` until their own acceptance criteria are evidenced. Phase 1 remains blocked while any required gate remains unresolved.

This register is an execution tracker, not evidence that blocked validations have passed.
