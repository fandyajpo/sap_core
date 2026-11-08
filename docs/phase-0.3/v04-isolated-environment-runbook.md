# V04.4 Isolated Environment Preparation & Safety Runbook

**Purpose:** Preparation and evidence guidance for separately approved D5 and X01/D9 cases only. This document does not authorize or report execution.

**Recovery source:** fandyajpo/sap_core commit 928260b25309163e26cb616a50e2107e9a42e54d, the exact source commit recorded for D14 run be466697eab242d59088eb6efb0f1c37 (migrations 1–8). Do not substitute current main or the nine-migration HEAD.

**Scope:** Recover and verify two independent disposable baselines, then—only with separate execution authorization—assess D5 and X01/D9 as distinct cases. D5 is Organization→Company zero-to-many cardinality. X01/D9 is the required Company→Organization FK and RESTRICT behavior. Neither case may be credited from the other.

**Status:** BLOCKED. No environment is created by this document. No migration, SQL, Prisma command, test, build, or database operation is authorized here. The prior D5 run remains a bounded historical observation, not baseline-valid evidence.

## 1. Pinned recovery history

Use exactly source commit **928260b25309163e26cb616a50e2107e9a42e54d** and exactly these eight migrations, in order:

1. 20261106000513_phase_0_3_v01_initial
2. 20261106001500_create_schemas_prerequisite
3. 20261106002304_phase_0_3_v02_cross_schema_relation
4. 20261106010425_phase_0_3_v03_better_auth_identity
5. 20261106080734_create_remaining_schemas
6. 20261106090000_p05_x06_restrict_auth_user_deletion
7. 20261107112700_v0451_tenant_scope_schema
8. 20261107130000_d7_typed_role_assignments

Migration 9, 20261108130000_d8_role_definition_governance, is explicitly excluded. This is a pinned historical recovery snapshot, not the current nine-migration repository history.

The D14 record reports eight successful, non-rolled-back migrations at this source commit. FK catalog run 0ce2c3bc1f384957894e3c3c32b08595 also reports migrations 1–8 and a 19-row catalog result, but does not identify its source commit. Use that catalog only as a comparison reference, not proof of source identity.

## 2. Two independent replay paths and isolation

Use two independent disposable database targets, isolated from development and from each other:

- **Fresh:** deploy migrations 1–8 from the pinned source snapshot to a new empty database.
- **Staged:** deploy migrations 1–7, capture intermediate history/status, then deploy migration 8 to a second new empty database.

Both paths must use the same source snapshot and ordered files. Each must finish with exactly eight successful migration records, zero rolled-back records, and up-to-date status. Capture source commit, tool versions, schema checksum, each migration SQL checksum, migration-lock checksum, ordered migration names, redacted history/status, and verified database/container identity. Compare relevant schema/catalog definitions across both paths before any case test.

A mismatch, unverified source, checksum mismatch, uncertain isolation, unexpected history, failed/rolled-back migration, or non-up-to-date status is a hard stop. Do not proceed to D5 or X01/D9.

Use newly created disposable resources, loopback-only dynamic port bindings, and disposable storage without named volumes or bind mounts. Never use the development Compose service, port 5433, persistent volume, .env, or development database. Never run broad Docker cleanup or destructive reset commands. Do not print credentials, shell-trace credential-bearing commands, write secrets into evidence, or display full container environment.

## 3. Pinned source extraction and checksum verification

Do not copy migration files from the current working tree or current main. Obtain the exact snapshot from Git:

```bash
set -Eeuo pipefail
set +x
RECOVERY_BASELINE="928260b25309163e26cb616a50e2107e9a42e54d"
git cat-file -e '928260b25309163e26cb616a50e2107e9a42e54d^{commit}'
git archive --format=tar "$RECOVERY_BASELINE" -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc \
  prisma/schema.prisma prisma/migrations |
  tar -xf - -C "$WORKSPACE"
```

Before extraction, create and verify a new workspace outside the repository. Verify its exact resolved path and run identifier. After extraction, assert that the migration directory names and SQL-file count equal the eight-item list in Section 1—no seven-migration-only snapshot, migration 9, or extra migration directory. Compare source and extracted bytes and record SHA-256 for manifests, runtime pin, Prisma schema, migration lock, and all eight SQL files.

This archive instruction is not evidence that extraction occurred. Run it only after separately authorized preparation begins. Do not copy .env, .env.example, docker-compose.yml, repository prisma.config.ts, application source, tests, or generated artifacts. Any temporary Prisma config required by a separately approved execution plan must use explicit workspace paths and must not import dotenv/config.

## 4. Ordered handoff

1. Verify repository origin, exact commit object, and isolated workspace identity.
2. Extract the pinned archive; verify exactly eight migration directories/files and all checksums.
3. Create two distinct disposable targets. Verify container/image identity, loopback-only dynamic port, no named volume, no bind mount, and exact database names before connecting.
4. Run the fresh replay (migrations 1–8); capture exact migration history and status.
5. Run the staged replay (migrations 1–7, then 8); capture intermediate and final history/status.
6. Require eight successful records, zero rolled-back records, up-to-date status on both, and matching relevant catalog definitions.
7. Preserve redacted evidence and hand back control. D5 and X01/D9 remain NOT RUN until separately authorized.

Never connect to the development database to identify a target. Use unique throwaway credentials and process-local connection URLs.

## 5. D5 — Organization→Company zero-to-many

D5 is a cardinality test only. On each verified replay path, verify that one Organization can have zero Companies and multiple Companies. Inspect all unique constraints/indexes and predicates to establish there is **no permanent unique constraint on Company.organizationId alone**. A composite unique key such as (organizationId, id) and an ordinary index are allowed.

Use isolated fixtures and a rollback-safe transaction; verify zero residual fixture rows. Do not infer provisioning/UI single-company-first policy, membership, authorization, or X01 FK action semantics from D5.

Historical run 22e1b72960eb4eab910774b40a9181b7 reported one Organization accepting multiple Companies and rejection of an invalid parent. It did not record source commit, exact migration list/count/status, checksums, or a catalog snapshot tied to the run. Retain it as a bounded historical observation only—not baseline-valid evidence for migrations 1–8, migrations 1–9, or any named source revision.

## 6. X01 / D9 — required Company→Organization FK

Run separately from D5 on each verified replay path with fresh fixtures and explicit transactions/savepoints. Verify:

- core.company.organizationId is NOT NULL.
- The validated FK is exactly core.company(organizationId) → core.organization(id), named company_organizationId_fkey.
- ON DELETE and ON UPDATE are both RESTRICT.
- No permanent unique constraint exists on organizationId alone.
- NULL parent reference is rejected with SQLSTATE 23502.
- Nonexistent parent is rejected by the expected FK with SQLSTATE 23503.
- Deleting a referenced Organization and updating its referenced id are each rejected with SQLSTATE 23503; parent and Company rows remain unchanged.
- Rollback leaves zero residual fixtures.

Use direct database statements for negative cases so SQLSTATE demonstrates database enforcement, not client-side validation. Do not infer X01 success from D5 or schema text alone.

## 7. Evidence and acceptance boundary

Keep D5 and X01/D9 outcomes separately labeled and bounded to the pinned migrations 1–8 snapshot. Preserve source commit, checksums, tool/container versions, isolation proof, both replay histories/statuses, ordered FK and unique-index catalog rows (including predicates and validation state), fixture counts, SQLSTATE/constraint results, post-failure row checks, rollback/zero-residual checks, cleanup confirmation, deviations, and limitations.

If any baseline or case precondition is missing, report the case as **NOT RUN**, not PASS. Do not weaken an approved FK or rewrite migration history to make a test pass.

This work does not establish application authorization, protected operations, RLS, application tenant isolation, hosted/production database state, or V04 PASS. V04 remains **BLOCKED**; downstream V04–V10 and Phase 1 gates remain blocked unless separately accepted evidence changes them.

## 8. Historical records

Sections 10 onward are dated historical reconciliation records, not active recovery instructions. Their counts and execution statements describe the snapshots/evidence available at the time. Apply the 2026-11-08 nine-migration fresh-replay correction below where an older paragraph says that replay was not established. Historical seven-migration and six-plus-one replays must not be re-labeled as the pinned eight-migration recovery paths.

## 10. Reconciliation record — 2026-11-07

This record documents the observed V04.5.1 preparation attempt and its disposition. It does not authorize or report V04.4 execution.

- **Source baseline deviation:** preparation ran from commit `a1cfa848ea3686ce04ddc77ea8042c257e9ef15a`, not the original expected `64bf956648360b4ae9ea53ecd6605c9b309261da`. The intervening change was documentation-only; the pinned manifests, runtime pin, Prisma schema, and six migration histories were verified unchanged. Future Stage A therefore validates ancestry from the technical-input baseline plus an empty diff for those technical paths, rather than requiring HEAD to equal an obsolete documentation baseline.
- **Credential handling incident:** the first disposable run wrote its throwaway PostgreSQL password to a workspace file named `.postgres-password` (mode 0600). Treat that credential as exposed and never reuse it. The exact old container and workspace were subsequently removed after verifying the full container ID/name, run-ID and purpose labels, and workspace markers. No password value is recorded here.
- **Retirement evidence:** container `f00dfa66e19bdcf734e5a239e4e8dbefbde0f08e0e5634901a8096415fa9623b` and workspace Run ID `d3b4280839ca831ec15e2ce8ee61cde2` were removed on 2026-11-07; the owner terminal printed `RETIREMENT COMPLETE`. The development volume, repository, and image were not targeted by the cleanup procedure.
- **Docker Desktop tmpfs representation:** Docker inspection returned an empty `.Mounts` array, while `HostConfig.Tmpfs` declared the requested data-directory tmpfs and in-container `/proc/mounts` plus `df` confirmed the runtime tmpfs. Stage E now checks the configuration and runtime mount instead of requiring `.Mounts` to contain one entry.
- **Development resource observation:** no `sap-core-postgres` container was present during the check. The Compose-created volume `sap_core_sap_core_postgres_data` (logical Compose volume `sap_core_postgres_data`) existed and was not modified. Its database contents/integrity were not verified.
- **Abandoned preliminary workspace:** an earlier incomplete workspace associated with Run ID `2e9e7a88a02fa2fc0f2d7320d1a2ce2d` was observed separately and was not part of the approved retirement. It was not removed or reused; its current state must be checked by the owner before any future cleanup.
- **Execution boundary:** this preparation/reconciliation did not run V04.4 Prisma validation/generation, SQL, migrations, database tests, application tests, or builds. The separate V04.4 records document later isolated execution, including selected D6 catalog and behavior evidence; remaining validation and gate states are summarized in the current-baseline update below. V04 remains `BLOCKED`; V05–V10 and Phase 1 remain `BLOCKED`.

For any new preparation attempt, generate a new Run ID and password. Never reuse the retired identity or credential. Keep the password only in process memory; never write it to the workspace, a dotenv file, shell history, evidence, or terminal output. Docker necessarily retains the environment value in container metadata accessible to a Docker administrator; do not inspect or print `.Config.Env`. If the shell session is lost, do not recover the password from Docker metadata: retire only the exact verified disposable resources and start over with a new Run ID.

## 11. Current-baseline reconciliation — 2026-11-07

This runbook is reconciled to merged `main` at `d3e270cffa08bbe7f97f855e0999bb97abfa1882`. The current checked-in history has seven migrations: the six historical migrations retained in the earlier preparation record, followed by `20261107112700_v0451_tenant_scope_schema`. The forward migration sets both Session→User and Account→User to `ON DELETE RESTRICT ON UPDATE RESTRICT`; no historical migration was rewritten.

**Validated in V04.5.1 (per the separate X06 note):** all seven checked-in migrations replayed in order to an empty PostgreSQL 17.6 database and migration status was up to date; catalog inspection confirmed Session→User and Account→User are RESTRICT/RESTRICT; deleting or changing the ID of a User referenced by either a Session or Account was rejected; the test transaction rolled back and a residual-fixture query returned zero.

**Prisma validation and generation status:**

- The separate V04.5.1 X06 validation note records migration replay, migration status, X06 catalog inspection, and transactional FK behavior only; it does **not** record a `pnpm db:validate` result.
- The validation register records a historical V01 Prisma validation PASS, but that is not evidence for the later V04.5.1 tenant-scope schema. No independently verifiable V04.5.1 `pnpm db:validate` execution record is cited by the reviewed documentation. The previous V04.5.1 PASS statement is therefore withdrawn; validation of that candidate schema is **NOT CONFIRMED** and must not be reported as PASS.
- Prisma Client generation against the committed V04.5.1 tenant-scope baseline has no confirmed PASS evidence; status is **NOT CONFIRMED** and no PASS is claimed.
- Repeating schema validation and Client generation in the V04.4 procedure remains **NOT RUN** and requires separate authorization.

**Tenant-schema evidence already present in the baseline (limited):**

- The committed Prisma schema and seventh migration declare D6 partial unique indexes on `(userId, companyId)` for CompanyMembership and `(userId, plantId)` for PlantAssignment, both with `status IN ('ACTIVE','SUSPENDED')`. At the time of this V04.5.1 baseline note, no D6 catalog or behavior results were recorded. The later V04.4 execution record documents these predicates in replayed catalogs and selected uniqueness, lifecycle, and duplicate-insert concurrency cases; see the current-baseline update below.
- The committed Prisma schema and migration declare each typed Role Assignment → RoleDefinition FK with `ON DELETE RESTRICT ON UPDATE RESTRICT`. The seven-migration replay applied the SQL. The validation register's historical V01 Prisma-validation PASS predates this V04.5.1 tenant-scope schema and does not establish that the current candidate passed validation. No D14-specific catalog inspection or delete/update behavior tests are recorded; this does not establish typed-scope/definition matching, immutable keys, definition retirement, or history behavior.
- D6 suspension/terminal/regrant semantics are owner-approved policy. At the time of this V04.5.1 baseline note, no transition or slot-retention evidence was recorded; later V04.4 execution documented selected lifecycle/history and duplicate-insert concurrency cases, not complete acceptance or current-database state.

**Remaining NOT RUN:**

- The staged upgrade replay: first six historical migrations, then the committed seventh migration.
- Tenant schema mapping/catalog checks for X01–X05: ordered source/target tuples, nullability and target keys, FK actions, and indexes; valid and missing-parent cases; wrong-parent rejection; X02 parent-mutation/child-insert concurrency; and approved same-transaction fallback/rollback cases where ORM mapping is unsafe.
- D1/D3 membership slot, lifecycle, suspension/restore, terminal/history, and concurrency behavior; D5 zero-to-many Organization→Company cardinality and absence of a permanent uniqueness constraint.
- D6 partial-index catalog verification and behavior: duplicate ACTIVE/SUSPENDED rejection for each pair; acceptance of REVOKED/ENDED history and a new post-terminal episode; suspension retaining the slot and restoration on the same row; concurrent duplicate creates/status transitions; and history preservation.
- D7/D8/D14 typed-scope and RoleDefinition matching behavior; D14 Role Assignment → RoleDefinition and typed-parent referential-action catalog/behavior checks; role-key immutability; retirement/disablement of used definitions; and preservation of revoked assignments/history.

D2 invitation FKs and D15 Service Principal/permission-catalog behavior are not approved structural edges and are outside this spike. The completed replay/X06 evidence does not establish D1–D15 enforcement, application authorization, protected operations, RLS, application tenant isolation, deployed/production state, or V04 PASS. V01–V03 remain `PASS`; V04–V10 and Phase 1 remain `BLOCKED`. No technical command or environment inspection was performed for this documentation reconciliation.

The earlier observation for workspace Run ID `2e9e7a88a02fa2fc0f2d7320d1a2ce2d` remains unresolved: it was not part of the approved retirement, and its current state was not inspected or removed during this reconciliation. The owner must check its current state before any future use or cleanup and verify exact resource identity before acting. Section 10 remains historical preparation/retirement evidence; its then-current baseline and six-migration count have not been rewritten.



## Current repository baseline update — HEAD cd183e4 (historical snapshot; corrected 2026-11-08)

This update supersedes the older “current baseline” count in Section 11 without rewriting its historical V04.5.1 evidence. The checked-in history at HEAD `cd183e4` contains nine migrations: migration 7 (`20261107112700_v0451_tenant_scope_schema`) contains the X01–X05 Prisma/schema mappings and FK DDL; migrations 8 and 9 are D7 and D8. The documented seven-migration replays predate those later migrations. The separate 2026-11-08 V04.5.1 local disposable fresh replay subsequently applied all nine migrations in order and reported up-to-date status. This is fresh-replay evidence only; it is not an upgrade replay, does not validate the pinned eight-migration recovery baseline, and does not establish hosted/production state.

Later V04.4 supplemental runs recorded selected X01–X05 positive/negative insert cases and referenced Company key-update restrictions, plus separately selected D5/D1/D6 cases. They supersede only corresponding earlier “NOT RUN” case statements; they do not establish complete per-edge action/nullability/catalog coverage, concurrency, current database state, application authorization, or V04 PASS. Consult the V04.4 execution record and validation register for exact evidence and remaining gaps. Provisioning workflows remain distinct: the reviewed source has no Organization/Company/Plant creation flow, though scoped-access service code creates CompanyMembership and PlantAssignment with transactional parent checks.

No database operation, migration, replay, test or environment inspection was performed for this documentation reconciliation.