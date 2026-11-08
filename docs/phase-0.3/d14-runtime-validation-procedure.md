# D14 Role Assignment history — disposable runtime procedure

**Status: PREPARED / NOT EXECUTED / NOT RUNTIME-VERIFIED.**

**D14 status: UNRESOLVED.** This procedure is not PASS evidence and changes no V04/V05–V10/Phase 1 gate.

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

Before cleanup, preserve evidence in a separately chosen directory outside the repository and workspace. For example, verify that `$TMP_BASE/sap-core-d14-evidence-$RUN_ID` does not already exist, then run `EVIDENCE_DIR="$TMP_BASE/sap-core-d14-evidence-$RUN_ID"; mkdir -m 700 "$EVIDENCE_DIR"; cp -p "$WORKSPACE"/*.log "$WORKSPACE"/*.tsv "$WORKSPACE"/.source-commit "$EVIDENCE_DIR/"`. Verify the copied files and keep secrets/URLs/container configuration out of the evidence. Call `d14_cleanup` in the same Bash session after verifying the copy. It checks the exact recorded workspace/run ID and container ID/name/run-id/purpose labels, returns to `$REPO`, stops and removes only that container, removes only the run-specific workspace, and unsets process-local credentials. It does not remove images or volumes. Do not substitute broad Docker cleanup, `docker compose down -v`, `DROP SCHEMA`, `TRUNCATE`, trigger disabling, or a delete-based cleanup.

## Evidence boundary

This is a proposed, unexecuted procedure. No database, migration, or test command was run while preparing it. Report D14 only from an actual disposable run after reviewing its migration history, exact SQL output, and row-preservation results. The prior supplemental run's applied migration list/source hash remains unrecorded; this procedure does not retrospectively prove that run's baseline.
