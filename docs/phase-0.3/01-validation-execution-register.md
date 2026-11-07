# Phase 0.3 — Technical Validation Execution Register

**Overall state:** `IN_PROGRESS`  
**Baseline commit inspected:** `847eff88d82967d931afed7335254d605b46cdad`  
**Rule:** A validation is PASS only when reproducible evidence exists. Missing artifacts are BLOCKED / NOT RUN, never PASS and never automatically FAIL.

| ID | Validation | Current state | Exit evidence |
|---|---|---|---|
| V00 | Repository baseline inspection | `PASS` (inventory only) | [Baseline assessment](00-repository-baseline-assessment.md) |
| V01 | Prisma multi-schema validation | `PASS` | PostgreSQL 17.6; Prisma 7.10.1 validation and Client generation; all ten PostgreSQL schemas physically verified; initial migrations applied and database status up to date; fresh disposable database reproducibility verified |
| V02 | Cross-schema relation validation | `PASS` | Cross-schema relation migration applied; PostgreSQL FK metadata verified; orphan reference rejected; `ON DELETE CASCADE` behavior verified; test transaction rolled back |
| V03 | Better Auth canonical identity | `PASS` | Local suite: 5 passed, 0 failed; all 6 migrations replayed on disposable PostgreSQL 17.6 with schema up to date; both X06 FKs inspected as `ON DELETE RESTRICT`; GitHub Actions run [#19](https://github.com/fandyajpo/sap_core/actions/runs/42152029847) passed `static` and `v03-integration` |
| V04 | Tenant isolation and RLS | `BLOCKED` | Partial V04.4 structural evidence: isolated fresh/staged-upgrade replay, FK/index catalog equivalence, selected membership/assignment uniqueness behavior, and four composite FK positive/negative cases; see [V04.4 execution record](v04.4-execution-record-2026-11-07.md). Application authorization, protected operations, RLS, application tenant isolation, and remaining acceptance criteria are not established. |
| V05 | Migration/schema integrity | `BLOCKED` | Clean database migration, repeatability, drift and recovery evidence |
| V06 | Transaction/concurrency | `BLOCKED` | Interactive transaction, rollback, idempotency, race and financial/stock integrity tests |
| V07 | Pooling/session context | `BLOCKED` | Pooled connection reuse, transaction-local context isolation, cleanup and failure tests |
| V08 | Query cancellation/workload controls | `BLOCKED` | Timeout, cancellation, bounded workload and safe retry evidence |
| V09 | Error classification/recovery | `BLOCKED` | SQLSTATE/Prisma/provider error taxonomy, redaction, retry and ambiguous-outcome tests |
| V10 | Security/privilege boundaries | `BLOCKED` | Least-privilege roles, secrets handling, authz boundaries, audit and negative security tests |

## V03 evidence and X06 implementation reconciliation

### Evidence recorded

- Better Auth `1.7.17` and Prisma `7.10.1` are pinned; Prisma Client generation passed.
- Earlier local V03 evidence recorded 3 passing tests before the X06 test additions; the current suite result supersedes it.
- Local validation passed: `pnpm db:validate`, `pnpm db:generate`, `pnpm lint`, `pnpm typecheck`, and `pnpm db:migrate:deploy`.
- `pnpm db:status` reported 6 migrations and that the database schema is up to date.
- `pnpm test:v03` passed: 5 tests, 0 failed.
- Clean migration replay deployed all 6 migrations successfully to a disposable PostgreSQL 17.6 instance; migration status confirmed the schema was up to date.
- Direct PostgreSQL inspection confirmed `session_userId_fkey` and `account_userId_fkey` both use `ON DELETE RESTRICT`.
- GitHub Actions run [#19](https://github.com/fandyajpo/sap_core/actions/runs/42152029847), for commit `a86f22e5a01a7be41d20ba398840e32b55f56cf6`, succeeded: `static` and `v03-integration` both reported `SUCCESS`.
- The integration job completed PostgreSQL initialization, Prisma validation and generation, migration deploy/status, Next.js readiness, and `pnpm test:v03` successfully.

### X06 validated; V03 PASS

P05 X06 is `OWNER_APPROVED` and final: `core.session.userId` → `core.user.id` and `core.account.userId` → `core.user.id` both require `ON DELETE RESTRICT`. The Prisma schema and Better Auth config encode the policy, including explicit `user.deleteUser.enabled: false`; no Admin plugin or custom deletion endpoint is configured. Integration tests cover independent session/account FK restrictions, blocked hard deletion, database-backed sign-out revocation, successful and rejected account unlink attempts, and RESTRICT-safe cleanup. The forward migration preserves `ON UPDATE CASCADE`; previously applied migrations and migration history remain unchanged. Local validation, clean migration replay, direct FK inspection, and GitHub Actions run #19 provide the required V03 evidence. V03 is `PASS`; this does not clear V04–V10 or the Phase 1 gate.

Historical V03 baseline: the earlier migration retained `ON UPDATE CASCADE`. The V04.5.1 forward migration supersedes that action with `ON UPDATE RESTRICT` for both Session and Account; see the [V04.5.1 X06 note](v04.5.1-x06-forward-migration-note.md).

### Reproduction commands

From the `Sap Core` repository root, the following sequence reproduces the local validation checks. The GitHub Actions integration job independently runs V03 against its isolated PostgreSQL service:

1. `docker compose up -d postgres`
2. `pnpm db:validate`
3. `pnpm db:generate`
4. `pnpm lint`
5. `pnpm typecheck`
6. `pnpm db:migrate:deploy`
7. `pnpm db:status`
8. `pnpm test:v03`

## V04.4 partial execution evidence — 2026-11-07

The isolated V04.4 execution is documented in
[v04.4-execution-record-2026-11-07.md](v04.4-execution-record-2026-11-07.md).

Observed results include:

- Prisma 7.10.1 schema validation and Client generation passed.
- Fresh seven-migration replay and staged six-plus-one upgrade replay passed.
- Both databases reported migration status up to date.
- Inspected FK/index catalogs matched between fresh and upgrade replay.
- Selected OrganizationMembership, CompanyMembership, and PlantAssignment
  partial-unique behavior tests passed.
- Four composite FK positive/negative transactional tests passed.

This is partial structural feasibility evidence only. Concurrency cases,
remaining lifecycle/history cases, D5 cardinality, role-edge behavior,
application authorization, protected operations, RLS, and application-level
tenant isolation remain unestablished or NOT RUN.

V04 remains `BLOCKED`; V05–V10 remain `BLOCKED`; Phase 1 remains `BLOCKED`.
This evidence update does not clear or promote any validation gate.

## Execution sequence

### Stage 1 — Establish reproducible harness

- Confirm exact Node.js and package-manager policy.
- Pin Next.js, React, TypeScript, Prisma CLI and Prisma Client as a compatible set.
- Add a disposable PostgreSQL environment.
- Add the ten-schema Prisma proof of concept without implementing ERP workflows.
- Add deterministic install, lint/typecheck, Prisma validate/generate/migrate and test scripts.
- CI runs static validation and the V03 integration suite on pull requests and pushes to `main`.

### Stage 2 — Database architecture proof

- V01 and V02 are passed as recorded above.
- Validate migration history, drift handling and clean bootstrap for V05.
- Exercise transaction, concurrency, pooling and session context for V06/V07.
- Exercise cancellation, workload bounds and error recovery for V08/V09.

### Stage 3 — Identity, authorization and security proof

- Validate Better Auth adapter compatibility and canonical `core.user` mapping.
- Validate CASL separately from authentication.
- Validate organization/company/plant isolation and selected RLS boundaries.
- V03 is passed; continue applicable P10 session-governance and security/privilege validation for V04/V10.

### Stage 4 — Gate review

- Attach command output, test reports, migration evidence and relevant commit references.
- Record residual risks and deviations.
- Clear only gates whose complete acceptance criteria are evidenced.
- Keep Phase 1 blocked while any required gate remains unresolved.

## Current blocker

V01, V02, and V03 are `PASS` based on the evidence recorded above. V04–V10 remain `BLOCKED` pending their own acceptance criteria. Phase 1 remains blocked until the applicable V04–V10 gates are completed and evidenced.

This register is an execution tracker, not evidence that blocked validations have passed.

### V04.4 supplemental X01–X05 evidence — 2026-11-07

A second isolated PostgreSQL 17.6 run (run ID `9e176ea3b14a4668acb4462c832cadd4`) added the following evidence:

- Two valid tenant hierarchies and their membership/assignment chains inserted successfully as positive controls.
- Six negative FK cases across X01–X05 were rejected by their expected named constraints.
- Two referenced Company parent-key updates (`organizationId` and `id`) were rejected by `plant_organizationId_companyId_fkey`.
- All test fixtures were rolled back; verification returned zero residual rows for all seven fixture entity types.

Detailed cases and limitations are recorded in `v04.4-execution-record-2026-11-07.md` under “Supplemental X01–X05 runtime evidence”.

This evidence does not test concurrency, complete membership lifecycle behavior, D5 cardinality, role-edge behavior, authorization, protected operations, RLS, or application tenant isolation. V04 remains BLOCKED; no gate promotion is claimed.

### V04.4 supplemental D5/D1/D6 and role-edge evidence — 2026-11-07

A further isolated PostgreSQL 17.6 execution (run ID `22e1b72960eb4eab910774b40a9181b7`) recorded bounded runtime evidence:

- D5: one Organization accepted multiple Companies; a Company with a nonexistent Organization was rejected.
- D1: selected membership lifecycle cases passed, and a two-connection concurrent duplicate ACTIVE membership was rejected by `organization_membership_user_slot_key`.
- D6: selected CompanyMembership and PlantAssignment lifecycle cases passed. Concurrent duplicate pair insertions were rejected by `company_membership_user_company_current_key` and `plant_assignment_user_plant_current_key`.
- D7/D8/D14: the six typed Role Assignment FK edges used RESTRICT/RESTRICT; referenced parent and Role Definition deletion/key updates were rejected; Role Definitions could be disabled.

Important gaps remain: the database permits direct deletion of revoked Role Assignment rows; typed role-scope and owner/kind validation were not demonstrated in Core; unreferenced-key immutability was not established. Suspended-access authorization, permission catalog, grant matrix, cross-scope inheritance, protected operations, RLS, application tenant isolation, and concurrent parent mutation/child insertion were not validated.

All seven D1/D6 fixture categories were verified at zero after cleanup. This is supplemental case-level evidence only. V04–V10 and Phase 1 remain BLOCKED; no gate promotion is claimed. Detailed results and limitations are in `v04.4-execution-record-2026-11-07.md` under “Supplemental D5/D1/D6 and D7/D8/D14 runtime evidence”.
