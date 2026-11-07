# V04.4 Tenant Technical-Feasibility Spike Plan

**Type:** Reproducible, isolated technical-feasibility plan; not an execution report.  
**Baseline:** V04.5.1 merged baseline, `main` at `d3e270cffa08bbe7f97f855e0999bb97abfa1882` (2026-11-07); PostgreSQL 17.6, Prisma ORM/Client 7.10.1.  
**Policy:** D1–D15 remain `OWNER_APPROVED` (2026-11-06); no decision or gate state is changed here.  
**Gate:** V04 remains `BLOCKED`; this plan is not implementation, complete technical-validation evidence, or a V04 PASS.

## 1. Purpose and scope

Define the remaining V04.4 isolated technical-feasibility and behavior checks for the committed V04.5.1 tenant-scope schema and its forward migration, using the pinned Prisma/PostgreSQL toolchain. The spike is limited to structural mapping, database constraints and referential actions, wrong-parent rejection, and approved membership/assignment uniqueness semantics where their physical predicates are defined. The V04.5.1 note records a completed replay of all seven checked-in migrations into an empty PostgreSQL 17.6 database, an up-to-date migration status, X06 catalog checks, and transactional rejection checks for deleting or changing the ID of a referenced User. Those results validate the migration replay and X06 only; they are not evidence that the remaining V04.4 cases have passed.

The spike does not implement production features or validate application authorization, protected operations, invitations, a permission catalog, RLS, Service Principal behavior, or tenant access behavior. Those are outside structural validation and require separate V04 evidence. It does not reconcile or rewrite the older P05 matrix/ERD. The later edge-specific D9–D13 approvals in the V04.2 design are the operative decisions for X01–X05.

**Documentation-only boundary for this reconciliation:** Do not run commands, tests, builds, Prisma operations, containers, database queries, migrations, or experiments. Edit only this plan and the isolated-environment runbook. Do not change source, schema, migrations, tests, CI, dependencies, Docker/Compose, or environment configuration.

## 2. Baseline and constraints to preserve

- Use the repository's pinned Node.js 26.x, pnpm 10.20.0, Prisma CLI/Client/`@prisma/adapter-pg` 7.10.1, and PostgreSQL 17.6. Record exact resolved versions and container image identity in future evidence; a manifest pin alone is not compatibility evidence.
- The committed V04.5.1 baseline includes the tenant-scope schema and its forward migration alongside validation fixtures and Better Auth persistence models; this is repository baseline, not a workspace-only experiment. Preserve the canonical `core.User.id` scalar type and mapping; do not make it a tenant key or add user-level organization uniqueness. Validate only from a temporary copy; do not edit the checked-in schema or migration history as part of the spike.
- D1: `ACTIVE` and `SUSPENDED` occupy the organization slot; `PENDING`, `REVOKED`, and `ENDED` do not. `SUSPENDED` denies access while occupying the slot. The committed candidate schema and seventh migration declare a partial unique index using `status IN ('ACTIVE','SUSPENDED')`; verify the replayed catalog predicate and test that it implements D1. Restore `SUSPENDED` on the same membership row; `REVOKED` and `ENDED` are terminal, and a later grant is a new episode. Timestamps are audit/history metadata, not authorization intervals.
- D5: Organization→Company database cardinality is zero-to-many, each Company has one Organization, and there must be no permanent unique constraint on `Company.organizationId`. Initial single-company-first remains a provisioning/UI policy. Company access still requires explicit Company Membership.
- D6: both CompanyMembership and PlantAssignment use the shared status vocabulary `ACTIVE`, `SUSPENDED`, `REVOKED`, `ENDED`. `ACTIVE` and `SUSPENDED` occupy the relevant pair slot; `REVOKED` and `ENDED` release it. `SUSPENDED` denies access but retains the slot and may be restored to `ACTIVE` on the same row. Terminal episodes remain historical; a later grant creates a new episode. The committed candidate schema and seventh migration declare partial unique indexes with predicate `status IN ('ACTIVE','SUSPENDED')`, independently scoped to `(userId, companyId)` and `(userId, plantId)`. The seven-migration replay applied that migration, but the index catalog predicates and uniqueness/lifecycle behavior remain unverified. Additional roles use separate RoleAssignment records.
- X01–X05 must retain D9–D13's exact columns, tuple order, and `ON DELETE RESTRICT` / `ON UPDATE RESTRICT` actions. Add composite target keys only if PostgreSQL requires them for the exact foreign keys.
- D10, D12, and D13 expressly allow Core-owned validation in the same transaction if Prisma/provider cannot safely map the respective composite relations. A fallback is not a database FK and must preserve the same-parent invariant with negative tests.
- D14 applies to role edges only: each Role Assignment matches its typed scope parent and a Role Definition; role edges use `RESTRICT`; role primary keys are immutable; used definitions are retired/disabled rather than hard-deleted; revoked assignments/history are preserved. Do not infer a full role catalog or grant matrix.
- D2 approves invitation handling, not Invitation FK edges. D15 approves the Service Principal policy, not extra P05 edges or a permission catalog. Do not test or claim those edges as approved.
- X06 is `ON DELETE RESTRICT ON UPDATE RESTRICT` for both session→user and account→user FKs in the V04.5.1 baseline. The checked-in forward migration is `20261107112700_v0451_tenant_scope_schema`; preserve all six historical migrations byte-for-byte and do not rewrite migration history. The isolated X06 replay, catalog inspection, and transactional behavior checks are already documented in `v04.5.1-x06-forward-migration-note.md`; do not extend that evidence to tenant behavior or authorization.

## 3. Isolation design and stop conditions

Run only after separate authorization to execute the remaining V04.4 spike. The following boundaries are mandatory:

1. Create a new external temporary workspace, outside the repository and outside any tracked or shared workspace. Copy into it only the pinned package/lock/workspace manifests, current Prisma schema, migration lock, and all seven checked-in migrations. Keep generated client, any experimental schema edits, experiment-only migrations, test harness, logs, and temporary config inside that workspace. Do not point tools at the repository after copying.
2. Use a separate ephemeral `postgres:17.6` container with a collision-resistant temporary name, no Compose project, no named volume, and a dynamically assigned host port explicitly bound to `127.0.0.1`. Use the container's disposable writable layer or other explicitly temporary storage; remove the container to destroy it. Use fresh throwaway credentials supplied only through the launching process, never checked into files or printed in evidence.
3. Verify the running image/version, container name, host binding, dynamically assigned port, and disposable storage before connecting. The only permitted database URLs are for uniquely named databases on this container (fresh, upgrade, and, if Prisma requires it, shadow). Never use the repository's `DATABASE_URL`, the existing Compose service, host port `5433`, or the `sap_core_postgres_data` volume.
4. Write a temporary Prisma config in the copied workspace, explicitly pointing to its copied schema and migration directory. Supply `DATABASE_URL` and, if needed for `migrate dev`, `SHADOW_DATABASE_URL` from process-local environment values that target only this container. Never inherit a repository `.env` file. Confirm both URLs target the verified ephemeral server before each database-changing command.
5. If any boundary cannot be proven, stop before Prisma or SQL touches a database. Do not improvise against the existing service. Do not use `prisma migrate reset`, `prisma db push`, or `docker compose down -v` at any stage.

The workspace should capture the source commit, exact commands, tool versions, container identity and port, schema/config copies, migration checksums, and redacted output. Do not include credentials or user data.

## 4. Temporary schema and migration workflow

1. Establish the baseline from the copied V04.5.1 schema candidate and seven-migration history. Keep a pristine baseline copy for comparison. Do not recreate or add the already checked-in tenant models. Any schema changes used to probe a feasibility question must be made only in the workspace copy. Generate the Prisma Client only into the temporary workspace.
2. Use the workspace-local pinned CLI for `prisma validate` and `prisma generate`. The checked-in `20261107112700_v0451_tenant_scope_schema` migration is the existing forward migration under test; do not regenerate, edit, or replace it. Any additional DDL experiment must be a reviewed temporary forward migration in the workspace. Add required partial-index SQL only there. Do not edit any copied historical or V04.5.1 migration.
3. Review the copied Prisma mapping and migration SQL for schema names, columns, nullability, key order, FK target keys, and exact delete/update actions before database application. If a mapping is unsupported, record the Prisma/provider failure and test only the corresponding D10/D12/D13-approved Core same-transaction fallback in a temporary harness. Do not weaken an invariant or describe fallback validation as an FK.
4. **Fresh replay:** the V04.5.1 note already records a successful empty-database replay of all seven checked-in migrations and an up-to-date migration status. This establishes the migration replay only, not tenant FK/index catalog validation or tenant behavior. If a fresh replay is needed for remaining V04.4 evidence, use a new isolated empty database and apply all seven checked-in migrations in order before any reviewed experiment-only migrations. No existing database is reset.
5. **Upgrade replay — NOT RUN in the V04.5.1 note:** create a separate empty throwaway database. First deploy only the unchanged six historical migrations, representing the V03 baseline; then deploy the committed `20261107112700_v0451_tenant_scope_schema` forward migration (the seventh checked-in migration), followed only by any reviewed experiment-only migrations. Confirm history, status, and catalog state. Do not fake an upgrade by editing applied migration history.
6. If `migrate dev` requires a shadow database, use a separately named throwaway database on the same isolated server and verify its URL before each use. Shadow operations must never target the fresh/upgrade database or an external server.
7. Record how the experiment database was created and disposed. On completion, stop/remove only the uniquely named temporary container and remove the external workspace. Never run broad cleanup commands that may affect another project or volume.

The remaining V04.4 sequence is: establish and verify isolation; install from the copied lockfile; validate and generate; inspect the existing schema and forward migration; author any necessary create-only experiment migration in the workspace; review SQL; run tenant structural/behavior checks and inspect database metadata. The seven-migration fresh deploy is already evidenced for migration replay; repeat it in a new isolated database only if needed for the additional V04.4 checks. The staged six-plus-one upgrade replay remains NOT RUN. Capture evidence and dispose of only the isolated resources. This is a plan, not a claim that these V04.4 steps have run.

## 5. Relationship and behavior test matrix

| Area | Candidate mapping / positive evidence | Negative and action evidence | Concurrency/history evidence and boundary |
|---|---|---|---|
| Prisma baseline and identity | `prisma validate` and client generation succeed using the exact pinned versions; tenant relations retain the current `core.User.id` scalar type. | Reject unknown User, Organization, Company, or Plant references. Confirm no tenant field or unique key is added to `User`. | Compare generated client/schema and migration checksums with the copied baseline. No authentication or authorization behavior is inferred. |
| D5 and X01 / D9 | Required `Company.organizationId` references `Organization.id`; one organization can have zero or multiple Companies in the database. | Null/missing Organization and deletion or key update of a referenced Organization are rejected by `RESTRICT`. Assert there is no permanent unique constraint on `Company.organizationId`. | Provisioning/UI single-company-first is outside this database spike. Do not confuse D5 cardinality with X01's FK approval. |
| X02 / D10 | Exact composite reference `(Plant.organizationId, Plant.companyId) → Company(organizationId, id)`; add target key `(Company.organizationId, Company.id)` only if PostgreSQL requires it. Valid same-parent Plant inserts succeed. | Wrong-organization/company pair is rejected by the FK, or by the expressly approved Core-owned validator in the same transaction if the ORM mapping is unsafe. Verify both `RESTRICT` actions. | Exercise concurrent parent mutation/child insertion where relevant; retain the same-parent invariant. A fallback result must clearly distinguish application validation from database enforcement. |
| X03 / D11 | Required direct `OrganizationMembership.userId → User.id` and `OrganizationMembership.organizationId → Organization.id`; stable membership episode ID. | Missing parent is rejected; deleting or updating referenced User/Organization keys is restricted. FK existence must not be reported as active entitlement. | Confirm distinct historical membership episodes are structurally possible; lifecycle semantics are only the explicitly approved D1/D3 cases. |
| X04 / D12 | Direct User FK plus exact composites `(organizationMembershipId, userId, organizationId) → OrganizationMembership(id, userId, organizationId)` and `(organizationId, companyId) → Company(organizationId, id)`. Add `(id,userId,organizationId)` to OrganizationMembership and `(organizationId,id)` to Company only if PostgreSQL requires them. | Reject mismatched User/Organization Membership, wrong Company, or cross-organization pairs. All X04 edges use `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`. If mapping is unsafe, test the approved same-transaction Core fallback and its rollback/negative path. | Preserve multiple historical episodes and ensure FK success is never treated as authorization. Validate D6 uniqueness separately using the owner-approved pair-scoped candidate predicate; policy is resolved, but physical behavior remains NOT RUN. |
| X05 / D13 | Direct User FK plus exact composites `(companyMembershipId, userId, organizationId, companyId) → CompanyMembership(id, userId, organizationId, companyId)` and `(organizationId, companyId, plantId) → Plant(organizationId, companyId, id)`. Add `(id,userId,organizationId,companyId)` to CompanyMembership and `(organizationId,companyId,id)` to Plant only if PostgreSQL requires them. | Reject mismatched User, Company Membership, Company, or Plant parent tuples. All X05 edges use `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`. If mapping is unsafe, test the approved same-transaction Core fallback and negative cases. | Preserve ended assignment episodes. Use the owner-approved D6 PlantAssignment status vocabulary and pair-scoped candidate predicate for its separate uniqueness guard; do not treat an FK as a current-access check. Physical behavior remains NOT RUN. |
| D1 organization-slot guard | Insert/test `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`, and `ENDED` against the approved slot semantics. Probe the candidate predicate `status IN ('ACTIVE','SUSPENDED')` only after confirming its exact equivalence to D1. | A second slot-occupying membership for the same User is rejected; non-occupying states do not consume the slot. A suspended membership denies access but remains a slot occupant. | Race concurrent activation for one User across organizations; prove one succeeds or operations serialize/fail closed. Test suspension, restore on same row, terminal transition before reassignment, new post-terminal episode, and history preservation. Timestamps remain audit metadata only. |
| D6 Company Membership / Plant Assignment guards | Validate pair-scoped partial unique indexes using `status IN ('ACTIVE','SUSPENDED')`: `(userId, companyId)` for CompanyMembership and `(userId, plantId)` for PlantAssignment. | Reject a second `ACTIVE`/`SUSPENDED` row for the same pair; allow `REVOKED`/`ENDED` historical rows and a new post-terminal episode. A suspended row denies access but retains the slot and can be restored on the same row. | Race duplicate creates and concurrent status transitions for each pair; allow distinct pairs; preserve terminal history; keep additional roles in separate RoleAssignment rows. These cases are now policy-unblocked but remain `NOT RUN` until separately authorized technical execution. |
| D7/D8/D14 role edges | Use temporary typed scope-parent and Role Definition fixtures only to validate relation shape and Core/system versus organization-owned definition boundary where represented. | Reject mismatched typed parent/definition references; inspect `RESTRICT` delete/update behavior. Test/record the immutable-primary-key rule without inventing a role catalog, grant matrix, or cross-scope inheritance. | Confirm used definitions are not hard-deleted and revoked Role Assignments/history are retained. D14 covers role edges only; no additional P05 edge is implied. |
| X06 baseline | The V04.5.1 note records completed seven-migration isolated replay plus catalog and transactional behavior checks for both auth FKs. | The documented current actions are `ON DELETE RESTRICT ON UPDATE RESTRICT` for session→user and account→user; do not rewrite or drop either constraint in an experiment. | Treat `v04.5.1-x06-forward-migration-note.md` as the bounded completed evidence. Any newly run V04.4 replay may verify the resulting baseline, but the note does not establish tenant behavior, application authorization, protected operations, RLS, or production state. |

For all X01–X05 foreign keys, inspect `pg_constraint`/equivalent catalog metadata after both replay paths, including ordered source/target columns and `confdeltype`/`confupdtype`. Inspect unique/index metadata and predicates, table nullability, and migration history; do not infer actual database behavior from Prisma schema text alone.

## 6. Evidence and decision rules

A future result is **PASS for a specific feasibility case only** when all applicable items are reproducible: exact pinned versions recorded; Prisma validation/client generation succeed; reviewed SQL is applied through the temporary migration history; fresh and upgrade replay both succeed; PostgreSQL catalog metadata matches the approved tuples/actions; positive and negative tests behave as expected; applicable races preserve approved uniqueness/history semantics; the X06 baseline is `RESTRICT` for both DELETE and UPDATE on both auth FKs; and the exact commands/results are retained with secrets redacted. The already completed X06 evidence is limited to the checks recorded in the V04.5.1 note.

A Prisma validation, generation, migration, metadata, or behavior mismatch is a **FAIL for that candidate mapping**, not permission to weaken the policy. Use only the expressly approved Core same-transaction fallback for X02/X04/X05 where applicable, with the invariant and negative wrong-parent tests retained. Report unsupported or unresolved cases precisely.

A case depending on unresolved policy remains **BLOCKED / NOT RUN** until that prerequisite is supplied. D1–D15 are approved policy decisions, not proof of their physical enforcement; D6's status vocabulary and candidate predicates are owner-approved, while physical feasibility and behavior remain **NOT RUN** pending separate V04.4 execution. Missing evidence is never PASS. Structural validation does not include or establish application authorization, protected-operation behavior, RLS, tenant isolation, full V04 completion, or production readiness.

Retain a compact evidence bundle in the temporary workspace for review: baseline commit; tool/container versions; redacted connection target details; schema diff; generated client result; reviewed experiment migration SQL; checksums of historical migrations; fresh/upgrade migration logs and status; FK/index catalog output; test cases/results including race outcomes; failures/deviations; cleanup confirmation; and explicit residual risks. Do not copy experiment artifacts into repository migrations or tests as part of this plan.

## 7. Risks and prerequisites

| Risk | Severity | Required control / disposition |
|---|---|---|
| Accidental connection to the existing Compose database or its named volume | Critical | Verify container identity, `127.0.0.1` dynamic binding, and both database URLs before commands; stop if uncertain. No Compose commands or shared-volume cleanup. |
| D6 physical guard diverges from approved status semantics | High | Use only the owner-approved four-state mapping and pair-scoped candidate predicates; validate generated SQL, concurrency, and history before claiming a technical pass. Do not treat policy approval as implementation evidence. |
| Composite FKs assumed supported or simplified | High | Use exact approved tuple order; inspect generated SQL and PostgreSQL catalogs. Add target keys only if PostgreSQL requires them. Apply only the approved same-transaction fallback if ORM/provider mapping is unsafe. |
| Historical episodes erased or blocked | High | Test terminal regrant/history separately from current uniqueness; prohibit unconditional pair uniqueness and cascade deletion of membership/assignment/role history. |
| D1 predicate diverges from approved slot semantics | High | Confirm the candidate `ACTIVE`/`SUSPENDED` predicate against D1, test every approved state, and verify concurrency. Do not treat timestamps as validity windows. |
| Existing X06 contract altered | High | Preserve historical migrations and assert `RESTRICT` delete / `RESTRICT` update for session/account FKs in any new replay; use the existing V04.5.1 note only for the isolated checks it records. |
| Structural validity misrepresented as authorization | High | State explicitly that FKs and feasibility probes do not establish active membership, roles, authorization, protected-query scoping, RLS, or tenant isolation. |
| Unsupported command/version guidance copied from newer Prisma docs | Medium | Run only the pinned Prisma 7.10.1 CLI from the isolated workspace; validate future CLI syntax against its versioned docs before execution. Do not import Prisma 8-only commands. |

## 8. Gate and status boundary

The execution register remains authoritative: V01–V03 are `PASS`; V04–V10 remain `BLOCKED`; Phase 1 remains `BLOCKED`. The V04.5.1 X06 note remains bounded to its recorded X06 evidence. The separate V04.4 execution record documents partial tenant structural and behavior evidence, but does not establish complete D1–D15 enforcement, application authorization, protected operations, RLS, or application tenant isolation. V04 can change state only through its complete acceptance criteria and a separate evidence review.

**Execution status:** The separate V04.5.1 X06 validation is documented in `v04.5.1-x06-forward-migration-note.md`. The V04.4 execution record separately documents Prisma validation/generation, fresh and staged migration replay, FK/index catalog comparison, and selected tenant behavior tests.

**V04.4 execution summary:**

The isolated execution recorded in `v04.4-execution-record-2026-11-07.md` passed Prisma 7.10.1 schema validation and Client generation, fresh seven-migration replay, staged six-plus-one upgrade replay, and migration status checks for both databases. The inspected FK/index catalogs matched across replay paths. Selected D1 OrganizationMembership slot behavior, D6 CompanyMembership and PlantAssignment pair-uniqueness behavior, and four composite FK positive/negative cases passed.

**Remaining NOT RUN / not established:**

- X01–X05 remaining mapping and behavior cases: missing-parent/direct-FK negative cases, complete nullability/target-key review, X02 parent-mutation/child-insert concurrency, and approved same-transaction fallback/rollback cases where ORM mapping is unsafe.
- D1/D3 complete lifecycle, suspension/restore on the same row, terminal/history combinations, and concurrent activation across organizations.
- D5 zero-to-many Organization→Company behavioral verification and explicit absence of a permanent uniqueness constraint.
- D6 duplicate-creation and status-transition concurrency, suspension/restore on the same row, and complete terminal/history preservation cases for CompanyMembership and PlantAssignment.
- D7/D8/D14 role-edge mapping, typed-scope/definition matching, referential actions, key immutability, definition retirement, and revoked-assignment/history behavior.
- Application authorization, protected operations, RLS, application-level tenant isolation, and V05–V10 acceptance criteria.

D2 invitation FKs and D15 Service Principal/permission-catalog behavior are not approved structural edges and are outside this spike. Structural validation does not establish application authorization, protected operations, RLS, or application tenant isolation. No V04 PASS is claimed.

## D6 owner-policy update — 2026-11-07

D6's status vocabulary and pair-slot semantics are now owner-approved. Both entities use `ACTIVE`, `SUSPENDED`, `REVOKED`, and `ENDED`; the first two occupy the pair slot and the latter two release it. The approved candidate partial unique indexes are scoped to `(userId, companyId)` for CompanyMembership and `(userId, plantId)` for PlantAssignment, each with predicate `status IN ('ACTIVE','SUSPENDED')`. Test suspension retention/restoration on the same row, terminal release, post-terminal new episodes, concurrent duplicate creation/transitions, distinct pairs, and preservation of historical rows. This update removes the D6 policy prerequisite only; no Prisma command, SQL, migration, test, or build is authorized or represented as run by this documentation change.

## Current-baseline reconciliation — 2026-11-07

This plan is reconciled to merged `main` at `d3e270cffa08bbe7f97f855e0999bb97abfa1882`. The checked-in candidate now includes the tenant-scope schema and the seventh migration, `20261107112700_v0451_tenant_scope_schema`; the six earlier migrations remain historical and unchanged. X06 is now `ON DELETE RESTRICT ON UPDATE RESTRICT` for Session→User and Account→User, as implemented by that forward migration.

The V04.5.1 X06 note records the completed isolated seven-migration PostgreSQL 17.6 replay and the bounded X06 catalog and transactional behavior checks. Remaining V04.4 technical/structural and tenant behavior cases remain to be separately executed and reviewed. The X06 note is not evidence of D1–D15 enforcement, tenant lifecycle behavior, application authorization, protected operations, RLS, hosted/production state, or V04 PASS. V01–V03 remain `PASS`; V04–V10 and Phase 1 remain `BLOCKED`. This reconciliation changes no policy decision, register entry, or gate status.

## V04.4 execution update — 2026-11-07

The isolated V04.4 execution is recorded in
`v04.4-execution-record-2026-11-07.md`.

Prisma validation and Client generation passed using the pinned Prisma 7.10.1
toolchain. Fresh and staged upgrade replay both applied all seven migrations
successfully, and both databases reported up-to-date migration status.
Inspected FK/index catalog definitions matched across both replay paths.

Selected OrganizationMembership, CompanyMembership, and PlantAssignment
partial-unique behavior cases passed. Four composite FK positive/negative
transactional tests also passed. These are case-level results only; they do
not establish all lifecycle, history, or concurrency requirements.

The remaining NOT RUN cases and scope limitations are listed in the execution
record. V01–V03 remain `PASS`; V04–V10 remain `BLOCKED`; Phase 1 remains
`BLOCKED`. No gate is promoted by this update. Cleanup remains pending until
the evidence has been reviewed and preserved.

## V04.4 supplemental X01–X05 execution update — 2026-11-07

A supplemental isolated PostgreSQL 17.6 execution (run ID `9e176ea3b14a4668acb4462c832cadd4`) exercised the approved X01–X05 tenant-scope FK relationships:

- Two valid tenant hierarchies and associated membership/assignment chains passed positive insertion controls.
- Six deliberately invalid relationship cases were rejected by their expected FK constraints: X01, X02, X03, X04, X05 membership tuple, and X05 plant tuple.
- Updating either `Company.organizationId` or `Company.id` while the Company was referenced by Plant was rejected by `plant_organizationId_companyId_fkey`.
- All fixtures were rolled back and subsequent checks found zero residual rows.

See `v04.4-execution-record-2026-11-07.md`, “Supplemental X01–X05 runtime evidence”, for exact constraints and results.

This update does not establish concurrency behavior, complete lifecycle semantics, D5 cardinality, role-edge behavior, authorization, protected operations, RLS, or application tenant isolation. It is supplemental evidence only; V04 and the downstream gates remain BLOCKED.
