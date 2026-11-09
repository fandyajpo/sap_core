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
| V04 | Tenant isolation and RLS | `BLOCKED` | Partial V04.4 case evidence, including bounded D14 migration-8 history-protection PASS evidence (42/42 assertions) and bounded FK Catalog / Action Verification PASS on exactly migrations 1–8 (19/19 expected FKs; all ordered tuples, names, actions, and `convalidated` values matched; migration 9 excluded; SQL/TSV evidence verified and temporary resources cleaned). Separate V04.5.1 evidence records a nine-migration fresh replay and catalog counts of 10 schemas, 18 tables, 19 FKs, 55 indexes, and 9 migration records. The 55-index figure is a count, not an individual audit of every index. See the [FK audit](v04-fk-catalog-action-verification.md), [V04.4 execution record](v04.4-execution-record-2026-11-07.md), and [V04.5.1 record](v04.5.1-x06-forward-migration-note.md). Application authorization, protected operations, RLS, application tenant isolation, and remaining acceptance criteria are not established; V04 remains blocked. |
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



## D9–D13 source and evidence reconciliation — HEAD `cd183e4`

**Checked-in source:** `prisma/schema.prisma` and migration 7, `20261107112700_v0451_tenant_scope_schema`, contain the X01–X05 tenant models, Prisma relations, FK DDL and supporting keys/indexes. Migration 8 is D7; migration 9 is D8. No new migration is indicated by the reviewed source evidence.

**Database status at the time of this reconciliation:** No current/live database was queried. The V04.4 runs were historical seven-migration replays at an earlier baseline. A later, separate V04.5.1 fresh replay of all nine migrations in a local disposable PostgreSQL environment is recorded below; it does not establish the state of any current, hosted, or production database.

**Historical structural evidence:** The V04.4 execution record documents valid hierarchy inserts, six selected wrong-parent/missing-parent FK rejections, two referenced Company key-update rejections, and separate selected D5/D1/D6 and role-edge behavior. These remain bounded case-level results; see that record for exact scope and gaps.

**Integration-test and application evidence:** The checked-in D6 scoped-access and D7/D8 integration suites exercise selected service workflows. The scoped-access service creates CompanyMembership and PlantAssignment with transactional parent checks. The reviewed source search found no Organization, Company, or Plant provisioning/creation workflow. Structural FKs do not provide active-membership authorization.

## V04.5.1 fresh replay and FK catalog audit — 2026-11-08

A separate local disposable-PostgreSQL validation applied all nine checked-in migrations successfully to a fresh database; `prisma migrate status` reported that the database was up to date. The catalog audit reported 10 schemas, 18 tables, 19 foreign keys, 55 indexes, and 9 migration records. All 19 FKs were validated: 18 `core` FKs use `RESTRICT`/`RESTRICT`, and `master_data.validation_references.validation_record_id` uses `CASCADE`/`CASCADE` as specified by the Prisma schema and migration. The 55-index figure is a count, not a claim that every index was individually checked. See the [V04.5.1 execution record](v04.5.1-x06-forward-migration-note.md).

This local replay is separate from GitHub CI for commit `472a920`; CI completed automatically after push with `static` and `v03-integration` both `PASS`, and did not perform or establish the nine-migration replay. No tests were manually run by the user, and the user performed no database operations as part of that CI run. `git diff --check` is `NOT RUN` because no terminal command tool was available.

V04 remains `BLOCKED`; V05–V10 and Phase 1 remain `BLOCKED`. This replay and catalog audit do not establish complete V04 acceptance, current/live database state, application authorization, protected operations, RLS, or application tenant isolation. The reported D14 revoked-RoleAssignment deletion discrepancy remains a separate investigation. No database command, test, migration, or replay was run for this documentation update.


## D14 migration-8 Role Assignment history protection — bounded PASS evidence

The isolated run `be466697eab242d59088eb6efb0f1c37`, sourced from commit `928260b25309163e26cb616a50e2107e9a42e54d` on PostgreSQL `17.6`, applied exactly migrations 1–8. Migration history contained eight successful, non-rolled-back migrations; migration 8 was `20261107130000_d7_typed_role_assignments`, and migration 9 was neither copied nor applied.

Six fixtures (two per Role Assignment table) were preserved. The run passed 42/42 SQL assertions across `core.organization_role_assignment`, `core.company_role_assignment`, and `core.plant_role_assignment`: first revocation succeeded in each table, all expected rejection cases returned SQLSTATE `55000`, protected rows remained preserved, and the test transaction rolled back successfully. Evidence preservation was verified; the exact disposable container and workspace were removed, with no images or volumes removed. Detailed results are in the [V04.4 execution record](v04.4-execution-record-2026-11-07.md).

**Result: PASS for the tested migration-8 history-protection cases only.** The earlier run `22e1b72960eb4eab910774b40a9181b7` remains unchanged, including its observed successful deletions; its exact migration baseline remains unverified, so the new result does not retroactively explain or rewrite that observation. This bounded evidence does not promote V04: V04 remains `BLOCKED`, and V05–V10 and Phase 1 remain `BLOCKED`.



## FK Catalog / Action Verification — bounded PASS

Run `0ce2c3bc1f384957894e3c3c32b08595` applied exactly migrations 1–8; migration 9 was not applied. The read-only catalog query found all 19 expected FKs: 18 `core` RESTRICT/RESTRICT constraints and one V02 `master_data` CASCADE/CASCADE control. Ordered source/target columns, constraint names, actions, and `convalidated = true` matched the matrix for every row. SQL and TSV evidence were preserved and verified; the temporary container and workspace were cleaned up, and the evidence directory remains preserved. See the [audit procedure](v04-fk-catalog-action-verification.md) and [V04.4 execution record](v04.4-execution-record-2026-11-07.md).

**Result: BOUNDED PASS for FK catalog metadata on migrations 1–8 only.** This does not establish runtime referential behavior or promote V04; V04 remains `BLOCKED`.

## Next NOT RUN validation in technical-feasibility plan order

Per Section 5 matrix order in the technical-feasibility plan, D5 zero-to-many Organization→Company cardinality has now passed on both verified migrations 1–8 replay targets; see [D5 baseline execution record](v04.6-d5-baseline-execution-record-2026-11-09.md). The next NOT RUN case is X01 / D9, which remains separate and requires its own runtime checks for NULL rejection, missing-parent rejection, referenced-parent deletion and key-update restrictions, and unchanged rows after rejected operations. Then proceed through X02–X05, including X02 parent-mutation/child-insert concurrency. The historical D5 run remains baseline-unverified and is not used as evidence for this bounded PASS. A same-transaction Core fallback is applicable only if a concrete Prisma/provider mapping limitation is demonstrated.


## V04.6 D5 baseline cardinality verification — 2026-11-09

D5 completed on both isolated migrations 1–8 replay targets (fresh and staged). The Organization-with-zero-Companies, one-Organization-with-two-Companies, nonexistent-parent FK rejection, absence of an organizationId-only unique index, and zero-residual-fixture rollback assertions all passed. Both targets exposed the expected ordinary `organizationId` index and composite unique `(organizationId, id)` index. See the [D5 execution record](v04.6-d5-baseline-execution-record-2026-11-09.md) for run identity, migration scope, schema findings, and boundaries.

**Result: BOUNDED PASS for D5 only.** X01 / D9 runtime referential-action checks remain NOT RUN and require separate authorization. V04 remains BLOCKED; no gate promotion is implied.


## V04.6 X03 / D11 bounded execution — 2026-11-09

X03 / D11 passed on both recovered migrations 1–8 disposable replay targets (fresh and staged). Catalog preflight verified the two direct OrganizationMembership FKs to User and Organization, their required non-null scalar columns and TEXT/UUID types, validated status, and RESTRICT/RESTRICT actions. Transactional assertions verified valid membership inserts, duplicate ACTIVE/SUSPENDED slot rejection by the expected partial unique index, missing-parent rejection by each named FK, RESTRICT on referenced User/Organization key updates and deletes, coexistence of one ACTIVE with REVOKED and ENDED history, successful rollback, and zero residual fixture rows on both targets.

Detailed evidence and limitations: [X03 / D11 execution record](v04.6-x03-d11-referential-integrity-execution-record-2026-11-09.md). No X03 concurrency schedule was run; this is not complete D1/D3 lifecycle, authorization, RLS, application tenant-isolation, or V04 acceptance evidence.

**Latest V04.6 case register:** D5, X01/D9, X02/D10, and X03/D11 = BOUNDED PASS; X04/D12 and X05/D13 = NOT RUN. V04 remains **BLOCKED**; V05–V10 and Phase 1 remain **BLOCKED**.


## V04.6 X04 / D12 bounded execution — 2026-11-09

X04 / D12 completed with **BOUNDED PASS** on both recovered migrations 1–8 disposable replay targets (fresh and staged). Read-only preflight confirmed all three CompanyMembership FKs are present, validated, and RESTRICT/RESTRICT: direct `userId → User.id`, composite `(organizationMembershipId, userId, organizationId) → OrganizationMembership(id, userId, organizationId)`, and composite `(organizationId, companyId) → Company(organizationId, id)`. The required composite unique target keys and supporting indexes were present on both targets.

Transactional behavior assertions passed on both targets: a valid CompanyMembership inserted; membership/user mismatch and organization/membership mismatch were rejected by the expected OrganizationMembership composite FK; a Company from a different Organization was rejected by the expected Company composite FK; referenced OrganizationMembership and Company key updates/deletes were rejected; rollback completed; and all fixture residual counts were zero.

See [X04 / D12 execution record](v04.6-x04-d12-referential-integrity-execution-record-2026-11-09.md) for exact target identities, catalog results, assertions, and limitations. The direct User FK was verified through catalog metadata only; a missing-User insert and direct User parent update/delete were not separately exercised. No X04 concurrency schedule was run. This result does not establish complete D6 lifecycle behavior, application authorization, protected operations, RLS, application tenant isolation, hosted/production state, or full V04 acceptance.

**Latest bounded case register:** D5, X01/D9, X02/D10, X03/D11, and X04/D12 = BOUNDED PASS; X05/D13 = NOT RUN. V04 remains **BLOCKED**; V05–V10 and Phase 1 remain **BLOCKED**. This is an evidence update only; no schema, migration, policy, or gate state changed.


## V04.6 X05 / D13 PlantAssignment verification — 2026-11-09

X05 / D13 achieved **BOUNDED PASS** on both recovered migrations 1–8 disposable replay targets (fresh and staged). Read-only preflight confirmed three validated core.plant_assignment foreign keys, all using ON UPDATE RESTRICT ON DELETE RESTRICT: direct userId → User.id; (companyMembershipId, userId, organizationId, companyId) → CompanyMembership(id, userId, organizationId, companyId); and (organizationId, companyId, plantId) → Plant(organizationId, companyId, id). The required unique composite target keys and supporting indexes were present; fresh and staged catalog output matched.

Transactional assertions passed on both targets: a valid PlantAssignment inserted; User/CompanyMembership tuple mismatch, Company-scope mismatch, and Plant-scope mismatch were rejected by their expected composite FKs; referenced CompanyMembership and Plant key updates/deletes were rejected; the direct User FK was independently confirmed validated and RESTRICT/RESTRICT in catalog metadata; explicit rollback completed; and residual fixture counts were zero for all seven fixture entity types.

See [V04.6 X05/D13 execution record](v04.6-x05-d13-referential-integrity-execution-record-2026-11-09.md) for target identities, exact constraint names, assertions, and limitations. The direct User FK was catalog-verified but not separately behavior-tested with a nonexistent User or direct User parent update/delete. The run did not isolate an organizationId-only tuple mismatch or run a concurrency schedule. D6 status lifecycle/partial-unique behavior is a separate case and is not established by this X05 result. This does not establish application authorization, protected operations, RLS, application tenant isolation, hosted/production state, or full V04 acceptance.

**Latest bounded case register:** D5, X01/D9, X02/D10, X03/D11, X04/D12, and X05/D13 = BOUNDED PASS. V04 remains **BLOCKED**; V05–V10 and Phase 1 remain **BLOCKED**. No schema, migration, policy, or gate state changed.
