# D14 Role Assignment history — disposable runtime procedure

**Procedure status: EXECUTED; result recorded for run `be466697eab242d59088eb6efb0f1c37`.**

**Bounded D14 result: PASS for 42/42 SQL assertions on the recorded migration-1–8 baseline.** This does not establish complete D14 policy validation or promote V04, V05–V10, or Phase 1.

**Scope:** one new, disposable PostgreSQL 17.6 container with a tmpfs data directory and a dynamically assigned loopback-only port. It applies migrations 1–7, checkpoints their Prisma history, inserts pre-D7 fixtures, applies the exact migration 8, and runs isolated SQL tests. Migration 9 is excluded. Do not use Compose, the development database, port 5433, or a persistent volume.

**Artifacts:** [Setup/checkpoint shell](../../scripts/validation/d14-runtime-setup.sh), [pre-D7 fixtures](../../scripts/validation/d14-fixtures.sql), and [post-migration-8 tests](../../scripts/validation/d14-tests.sql). Source the setup shell script from Bash so its disposable-target variables remain in the interactive session.

## DDL basis and fixture validity

The actual migration-7 DDL creates all three Role Assignment tables. Before D7, each has a UUID primary key, its own parent key, `roleDefinitionId`, `created_at DEFAULT CURRENT_TIMESTAMP`, and nullable `revoked_at`; migration 7 adds non-unique lookup indexes and RESTRICT/RESTRICT FKs to the matching parent and Role Definition. The parent columns differ: `organizationMembershipId`, `companyMembershipId`, and `plantAssignmentId`.

The fixture SQL builds the required FK chain in order: User → Organization/Company/Plant and memberships/PlantAssignment → Role Definitions → Role Assignments. CompanyMembership carries the exact `(organizationMembershipId, userId, organizationId)` tuple required by its composite FK. PlantAssignment carries the exact `(companyMembershipId, userId, organizationId, companyId)` and `(organizationId, companyId, plantId)` tuples. One ACTIVE membership/assignment per partial-unique key avoids collisions. Each Role Definition is `SYSTEM`, version 1, owner NULL, with the same scope as its assignment; alternate SYSTEM definitions in the same scope are included for a valid link-mutation attempt. No custom Role Definitions are used.

Migration 8 adds per-table `role_scope` with the table's fixed-scope default, nullable `grant_actor_user_id`, `is_break_glass DEFAULT FALSE`, and nullable `break_glass_reason`; its break-glass checks accept those defaults. It then replaces the simple definition FKs with composite `(roleDefinitionId, role_scope)` FKs to `(role_definition.id, role_definition.scope)`. Fixtures use matching scopes. Migration 8's `protect_role_assignment_history()` raises SQLSTATE `55000` for every DELETE, rejects changes to any row field other than the first `revoked_at` set, and makes a non-NULL revocation timestamp terminal. Migration 8 also changes other schema objects; apply its full checked-in SQL unchanged, not a hand-extracted trigger fragment.

## Prerequisites and safety gates

- Bash, Git, Docker, `uuidgen`, OpenSSL, Node `v26.0.0`, pnpm `10.20.0`, and the repository's locked dependencies available through the temporary install. The project pins Prisma CLI / Client `7.10.1` and PostgreSQL image `postgres:17.6`.
- Start in the Sap Core repository. The setup script refuses a dirty migration tree or migration directory set other than the nine reviewed directories. It copies only migration 1–7 initially, then copies migration 8 after fixture insertion.
- Keep shell tracing off. The random password stays in process memory and Docker container metadata; never print it or a full database URL. The setup uses no `.env`, repository Prisma config, Compose file, persistent volume, or fixed host port.
- If any target, image, mount, source migration, or port check fails, stop. Do not probe another database as a fallback.

## Procedure

1. Start an interactive Bash session at the Sap Core repository root. Keep tracing disabled. Source `scripts/validation/d14-runtime-setup.sh`. The script creates a unique workspace and container, installs the locked Prisma CLI in that workspace, and uses a temporary `prisma.config.ts` with an explicit `DATABASE_URL` and only the copied migration directory.
2. The sourced script runs Prisma `migrate deploy` with exactly migrations 1–7, then `migrate status`; it prints and saves `_prisma_migrations` names, checksums, timestamps, rollback markers, and applied-step counts. It asserts exactly seven successful, non-rolled-back records and stops at the checkpoint. Review `migration-history-1-7.tsv` before proceeding. The copied workspace contains no migration 8 or 9 at this point.
3. After reviewing that checkpoint, run `d14_apply_migration8_and_test` in the same Bash session. It inserts the fixtures while the DB is still at migration 7, copies the exact migration-8 SQL, verifies it byte-for-byte against the repository source, applies migration 8, captures and checks exactly eight successful migration records, confirms migration 9 is absent, and runs the SQL test script.
4. Review `d14-test-results.log` and the migration/status/fixture logs. A SQL error, missing evidence row, unexpected SQLSTATE, failed assertion, or migration-history mismatch is a STOP/FAIL requiring investigation. Do not infer a result from the proposed script or from source inspection.

## Failure recovery

The sourced script defines `d14_recovery_status`, `d14_preserve_evidence`, and `d14_cleanup` after recording the run ID, source commit, deterministic container name, and initial `not-created` state, but before any Docker operation. It installs no failure trap: a setup error never automatically stops a container or deletes a workspace/evidence.

If setup fails, keep the same interactive Bash session open and do not source the setup script again. Run `d14_recovery_status` first; it reports the retained workspace and available logs/TSVs. For `not-created`, it confirms that container creation was not attempted. For `creating` or `created`, it verifies the full container ID, exact name, run-ID label, and purpose label. When direct inspection by recorded ID or generated name cannot find a container, recovery uses only a `docker container ls --all --no-trunc` lookup filtered by this run's generated name, then accepts only an exact name match and verifies its ID and labels. It never performs a broad container listing, pruning, or resource removal.

Before cleanup, call `d14_preserve_evidence` and inspect the copied files. The helper verifies copied identity markers, logs/TSVs, and the filtered migration directory against the retained workspace; `d14_cleanup` repeats that verification before removing anything. If Docker startup failed before an ID was written, the `creating` state lets recovery locate the container by the recorded ID when available, otherwise by its exact generated name and labels. If the container is absent, cleanup can remove only the verified workspace; if Docker is unavailable, metadata is inconsistent, or labels do not match, recovery refuses deletion and leaves resources intact.

If setup stops before these recovery functions are defined, it has not reached any Docker operation. Leave the partial workspace in place as evidence; do not run Docker cleanup or rerun setup over it. Record the exact `$WORKSPACE` path and preserve its contents manually to a new, separate evidence directory. Only remove it manually after confirming it is a non-symlink directory whose basename matches `sap-core-d14.$RUN_ID.` plus eight alphanumeric characters, its canonical parent is exactly `$TMP_BASE`, and it is neither `$REPO` nor inside `$REPO`; change to `$REPO` before removing that exact path. If any check is uncertain, leave it untouched. After manually preserving the partial workspace, this guarded fallback removes only that workspace and never contacts Docker:

```sh
[[ "$RUN_ID" =~ ^[0-9a-f]{32}$ ]] &&
test -d "$WORKSPACE" &&
test ! -L "$WORKSPACE" &&
test "$(cd "$WORKSPACE" && pwd -P)" = "$WORKSPACE" &&
test -f "$WORKSPACE/.run-id" &&
test "$(cat "$WORKSPACE/.run-id")" = "$RUN_ID" &&
test "$WORKSPACE" != "$REPO" &&
[[ "$WORKSPACE" != "$REPO/"* ]] &&
test "$(cd "$(dirname "$WORKSPACE")" && pwd -P)" = "$TMP_BASE" &&
[[ "$(basename "$WORKSPACE")" =~ ^sap-core-d14\.${RUN_ID}\.[[:alnum:]]{8}$ ]] &&
cd "$REPO" &&
rm -rf -- "$WORKSPACE"
```

The copied current Prisma schema is used as the CLI schema input; Prisma Migrate deploy applies pending checked-in migration directories and does not generate a new migration. The filtered migration directory is authoritative for this replay. Keep migration 9 absent throughout.

## Expected result matrix

There should be 42 evidence rows in the SQL test output: six preserved/default-verified fixtures plus twelve cases per assignment table (one successful first revocation and eleven expected rejections).

| Case | Organization | Company | Plant | Expected actual result |
|---|---:|---:|---:|---|
| Fixture row preserved; `role_scope` default matches table; grant actor/reason NULL; break-glass FALSE | 2 | 2 | 2 | 6 rows; verified |
| First NULL → timestamp `revoked_at` update | 1 | 1 | 1 | Statement succeeds; row retains exact timestamp |
| DELETE of revoked assignment | 1 | 1 | 1 | SQLSTATE `55000`; “Role Assignment history cannot be deleted.”; row and timestamp remain |
| Clear `revoked_at` | 1 | 1 | 1 | SQLSTATE `55000`; “Role Assignment revocation is terminal.”; row and timestamp remain |
| Change `revoked_at` to another timestamp | 1 | 1 | 1 | SQLSTATE `55000`; terminal-revocation message; row and original timestamp remain |
| Change `grant_actor_user_id` | 1 | 1 | 1 | SQLSTATE `55000`; immutable identity/grant-details message; row remains |
| Change break-glass actor/flag/reason metadata together | 1 | 1 | 1 | SQLSTATE `55000`; immutable identity/grant-details message; row remains |
| Change break-glass reason | 1 | 1 | 1 | SQLSTATE `55000`; immutable identity/grant-details message; row remains |
| Change assignment primary key | 1 | 1 | 1 | SQLSTATE `55000`; immutable identity/grant-details message; row remains |
| Change Role Definition link to another valid same-scope definition | 1 | 1 | 1 | SQLSTATE `55000`; immutable identity/grant-details message; row remains |
| Change the table-specific parent FK | 1 | 1 | 1 | SQLSTATE `55000`; row, original parent FK, and original `revoked_at` remain |
| Change `role_scope` | 1 | 1 | 1 | SQLSTATE `55000`; row, original scope, and original `revoked_at` remain |
| DELETE of an unrevoked assignment | 1 | 1 | 1 | SQLSTATE `55000`; “Role Assignment history cannot be deleted.”; row remains with NULL `revoked_at` |

The test script records each attempted SQL statement, expected and actual SQLSTATE, returned PostgreSQL message, row-preservation check, and assertion outcome. Expected messages are corroborative; SQLSTATE and row-preservation assertions are the principal checks. The first successful update is recorded as `SUCCESS` (not a fabricated SQLSTATE). Per-case SQL assertions do not change D14's overall status.

## Cleanup

The post-migration test transaction rolls back, including the three successful revocations. The fixture transaction is committed before migration 8; after migration 8, those assignment rows intentionally cannot be deleted. Cleanup is therefore destruction of the disposable tmpfs-backed container, not row-level deletion.

Before cleanup, run `d14_recovery_status`, then `d14_preserve_evidence` (optionally passing a run-specific directory under `$TMP_BASE`) in the same Bash session. It creates a mode-700 evidence directory without overwriting an existing one and copies available `.log`/`.tsv` files, run/source/container identity markers, and the filtered migration SQL directory when present. It verifies those copies against the retained workspace, and cleanup repeats the verification before removing anything. Inspect the preserved files before sharing; the helpers do not copy the process environment or create a separate credentials file, but any sensitive text in logs must be redacted before sharing. `d14_cleanup` removes only a container whose exact ID, name, run-ID label, and purpose label match, then returns to `$REPO` and removes only the validated run-specific workspace. If no container was created, it removes only the workspace; if Docker is unavailable when inspection is needed, state/labels mismatch, the container state is unexpected, or evidence is missing or changed, it stops without deleting the workspace or container. The evidence directory is never deleted, and no images or volumes are removed. Do not substitute broad Docker cleanup, `docker compose down -v`, `DROP SCHEMA`, `TRUNCATE`, trigger disabling, or a delete-based cleanup.

## Recorded execution outcome

- Run ID: `be466697eab242d59088eb6efb0f1c37`.
- Source commit: `928260b25309163e26cb616a50e2107e9a42e54d`.
- PostgreSQL image: `postgres:17.6`.
- Exactly migrations 1–8 were applied; the migration history contained exactly eight successful, non-rolled-back migrations. Migration 8 was `20261107130000_d7_typed_role_assignments`; migration 9 was neither copied nor applied.
- Six fixtures (two per Role Assignment table) were inserted and preserved. All 42/42 SQL assertions passed across `core.organization_role_assignment`, `core.company_role_assignment`, and `core.plant_role_assignment`. The first NULL → timestamp revocation succeeded in each table; every expected rejection returned SQLSTATE `55000`; all protected rows remained preserved; and the test transaction rolled back successfully.
- Evidence preservation was verified at `/private/var/folders/08/c1f87l793rq84pmfkb0ph9sm0000gn/T/sap-core-d14-evidence-be466697eab242d59088eb6efb0f1c37`.
- The exact disposable container and workspace were removed successfully. No Docker images or volumes were removed.

**Result:** PASS for the tested migration-8 history-protection behavior on the verified migrations 1–8 baseline. The suite tests protection of valid fixtures against the specified mutations/deletions; it does not establish every D14 requirement or full V04 acceptance.

## Historical run reconciliation

The earlier run `22e1b72960eb4eab910774b40a9181b7` remains recorded without changes to its observed behavior, including successful direct deletion of revoked Role Assignment rows. Its exact applied migration baseline remains unverified because its applied migration list/source hash was not recorded. The current run proves migration-8 protection under its own verified migrations 1–8 history; it does not establish which migrations were present in the historical run or revise that run's observation.

## Remaining D14 coverage and gate boundary

The current run does not independently test insert-time mismatched-scope/Role Definition rejection, full FK catalog and referential-action behavior under this exact baseline, or Role Definition retirement/owner-kind governance. The historical run contains separate Role Definition and FK observations, but its unknown exact baseline prevents attributing those observations to migrations 1–8. V04 remains `BLOCKED`; V05–V10 and Phase 1 remain `BLOCKED`. No gate promotion is implied.

## Evidence boundary

The outcome above records the supplied execution facts for one disposable PostgreSQL 17.6 run only. D14 must not be represented as fully validated, and no result from this run proves current/hosted/production database state, application authorization, protected operations, RLS, application tenant isolation, or complete V04 acceptance.
