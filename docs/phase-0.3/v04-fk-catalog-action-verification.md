# V04 FK Catalog and Referential-Action Verification

**Recorded result: BOUNDED PASS — FK Catalog run `0ce2c3bc1f384957894e3c3c32b08595`.** The result applies only to the catalog metadata on the verified migrations 1–8 baseline; it is not a runtime referential-behavior test or a V04 acceptance result. V04 remains `BLOCKED`.

## Purpose and boundary

Verify the final PostgreSQL foreign-key catalog on a fresh, isolated PostgreSQL 17.6 database after applying exactly the first eight checked-in migrations. Compare every constraint's schema/table, ordered source and target columns, name, delete/update actions, and `convalidated` flag with the expected matrix below and the Prisma schema. This checks catalog shape and declared actions only; it does not test referential behavior, application authorization, RLS, tenant isolation, or full V04 acceptance.

Use migrations 1–8 only, in order:

1. `20261106000513_phase_0_3_v01_initial`
2. `20261106001500_create_schemas_prerequisite`
3. `20261106002304_phase_0_3_v02_cross_schema_relation`
4. `20261106010425_phase_0_3_v03_better_auth_identity`
5. `20261106080734_create_remaining_schemas`
6. `20261106090000_p05_x06_restrict_auth_user_deletion`
7. `20261107112700_v0451_tenant_scope_schema`
8. `20261107130000_d7_typed_role_assignments`

Migration 9, `20261108130000_d8_role_definition_governance`, must not be copied or applied. The V04 target is 18 `core` FKs (X01–X06 plus six D14 role-assignment edges). The V02 `master_data` FK is included as a baseline control, so the complete expected catalog result is 19 FKs.

## Expected final-state matrix

`ON DELETE` and `ON UPDATE` are PostgreSQL referential actions. Column tuples are positional: do not sort or otherwise reorder composite columns.

| # | Scope | Source schema.table (columns) | Target schema.table (columns) | ON DELETE | ON UPDATE | Constraint name |
|---:|---|---|---|---|---|---|
| 1 | V02 control | `master_data.validation_references` (`validation_record_id`) | `core.validation_records` (`id`) | CASCADE | CASCADE | `validation_references_validation_record_id_fkey` |
| 2 | X06 | `core.session` (`userId`) | `core.user` (`id`) | RESTRICT | RESTRICT | `session_userId_fkey` |
| 3 | X06 | `core.account` (`userId`) | `core.user` (`id`) | RESTRICT | RESTRICT | `account_userId_fkey` |
| 4 | X01 | `core.company` (`organizationId`) | `core.organization` (`id`) | RESTRICT | RESTRICT | `company_organizationId_fkey` |
| 5 | X02 | `core.plant` (`organizationId`, `companyId`) | `core.company` (`organizationId`, `id`) | RESTRICT | RESTRICT | `plant_organizationId_companyId_fkey` |
| 6 | X03 | `core.organization_membership` (`userId`) | `core.user` (`id`) | RESTRICT | RESTRICT | `organization_membership_userId_fkey` |
| 7 | X03 | `core.organization_membership` (`organizationId`) | `core.organization` (`id`) | RESTRICT | RESTRICT | `organization_membership_organizationId_fkey` |
| 8 | X04 | `core.company_membership` (`userId`) | `core.user` (`id`) | RESTRICT | RESTRICT | `company_membership_userId_fkey` |
| 9 | X04 | `core.company_membership` (`organizationMembershipId`, `userId`, `organizationId`) | `core.organization_membership` (`id`, `userId`, `organizationId`) | RESTRICT | RESTRICT | `company_membership_organizationMembershipId_userId_organiz_fkey` |
| 10 | X04 | `core.company_membership` (`organizationId`, `companyId`) | `core.company` (`organizationId`, `id`) | RESTRICT | RESTRICT | `company_membership_organizationId_companyId_fkey` |
| 11 | X05 | `core.plant_assignment` (`userId`) | `core.user` (`id`) | RESTRICT | RESTRICT | `plant_assignment_userId_fkey` |
| 12 | X05 | `core.plant_assignment` (`companyMembershipId`, `userId`, `organizationId`, `companyId`) | `core.company_membership` (`id`, `userId`, `organizationId`, `companyId`) | RESTRICT | RESTRICT | `plant_assignment_companyMembershipId_userId_organizationId_fkey` |
| 13 | X05 | `core.plant_assignment` (`organizationId`, `companyId`, `plantId`) | `core.plant` (`organizationId`, `companyId`, `id`) | RESTRICT | RESTRICT | `plant_assignment_organizationId_companyId_plantId_fkey` |
| 14 | D14 | `core.organization_role_assignment` (`organizationMembershipId`) | `core.organization_membership` (`id`) | RESTRICT | RESTRICT | `organization_role_assignment_organizationMembershipId_fkey` |
| 15 | D14 | `core.organization_role_assignment` (`roleDefinitionId`, `role_scope`) | `core.role_definition` (`id`, `scope`) | RESTRICT | RESTRICT | `organization_role_assignment_role_definition_scope_fkey` |
| 16 | D14 | `core.company_role_assignment` (`companyMembershipId`) | `core.company_membership` (`id`) | RESTRICT | RESTRICT | `company_role_assignment_companyMembershipId_fkey` |
| 17 | D14 | `core.company_role_assignment` (`roleDefinitionId`, `role_scope`) | `core.role_definition` (`id`, `scope`) | RESTRICT | RESTRICT | `company_role_assignment_role_definition_scope_fkey` |
| 18 | D14 | `core.plant_role_assignment` (`plantAssignmentId`) | `core.plant_assignment` (`id`) | RESTRICT | RESTRICT | `plant_role_assignment_plantAssignmentId_fkey` |
| 19 | D14 | `core.plant_role_assignment` (`roleDefinitionId`, `role_scope`) | `core.role_definition` (`id`, `scope`) | RESTRICT | RESTRICT | `plant_role_assignment_role_definition_scope_fkey` |

## Migration and Prisma comparison notes

- The final X01–X05 and X06 relations in migration 7 match the current Prisma relation fields, ordered composite references, constraint names, and explicit `RESTRICT`/`RESTRICT` actions. The six D14 relations in migration 8 match the current Prisma models, including their typed-parent FKs and composite Role Definition references.
- X06 action history is intentionally superseded by forward migrations: migration 3 initially creates Session/Account → User with `CASCADE`/`CASCADE`; migration 6 replaces both with `RESTRICT`/`CASCADE`; migration 7 replaces both with the final `RESTRICT`/`RESTRICT`. The final expectation is the migration-7 and current-schema state; do not report earlier migration actions as a final-state discrepancy.
- Migration 7 initially has single-column Role Assignment → Role Definition FKs. Migration 8 drops those three constraints and installs `(roleDefinitionId, role_scope) → (id, scope)` with `RESTRICT`/`RESTRICT`; the current Prisma schema declares the matching composite relations and mapped constraint names. The three typed-parent FKs already present from migration 7 remain single-column `RESTRICT`/`RESTRICT` relations.
- The V02 Prisma relation for `validation_references.validationRecord` specifies `onDelete: Cascade` but omits `onUpdate`. PostgreSQL's Prisma default is `CASCADE`; migration 3 explicitly declares `ON UPDATE CASCADE`. This is an implicit schema default, not an observed DDL conflict. If explicit policy expression is required, record it for owner/documentation review; do not edit the schema or migration as part of this audit.
- Migration 9 adds no FK in its SQL. D8's `ownerOrganizationId`, `role_family_id`, and `role_definition_audit` reference-like fields are not FKs in the applicable migration/schema and must not be added to this matrix. D7's break-glass audit references are also explicitly application-validated, not extra approved FK edges.

## Recorded execution outcome — run `0ce2c3bc1f384957894e3c3c32b08595`

- The isolated catalog verification applied exactly migrations 1–8. Migration 9 was not applied.
- Exactly 19 FKs were found: 18 `core` FKs with `RESTRICT`/`RESTRICT`, plus the V02 `master_data.validation_references` control FK with `CASCADE`/`CASCADE`.
- Every FK matched the expected matrix for ordered source/target columns, constraint name, delete/update actions, and `convalidated = true`.
- The SQL and TSV output were preserved and verified. The temporary container and workspace were cleaned up; the evidence directory remains preserved.

**Result: BOUNDED PASS for FK catalog metadata on migrations 1–8 only.** This result does not establish DELETE/UPDATE runtime behavior, other D14 cases, or complete V04 acceptance. V04 remains `BLOCKED`.

## Read-only PostgreSQL catalog query

Run the following as one psql input. It reads all foreign keys whose source and target are in non-system schemas, pairs composite columns by catalog ordinal position, and returns the decoded actions and validation state. The transaction is explicitly read-only; the query contains no DDL or DML.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT
  source_ns.nspname AS source_schema,
  source_table.relname AS source_table,
  constraint_row.conname AS constraint_name,
  array_agg(source_column.attname ORDER BY source_key.ordinality) AS source_columns,
  target_ns.nspname AS target_schema,
  target_table.relname AS target_table,
  array_agg(target_column.attname ORDER BY source_key.ordinality) AS target_columns,
  CASE constraint_row.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE 'UNKNOWN (' || constraint_row.confdeltype || ')'
  END AS on_delete,
  CASE constraint_row.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE 'UNKNOWN (' || constraint_row.confupdtype || ')'
  END AS on_update,
  constraint_row.convalidated
FROM pg_constraint AS constraint_row
JOIN pg_class AS source_table
  ON source_table.oid = constraint_row.conrelid
JOIN pg_namespace AS source_ns
  ON source_ns.oid = source_table.relnamespace
JOIN pg_class AS target_table
  ON target_table.oid = constraint_row.confrelid
JOIN pg_namespace AS target_ns
  ON target_ns.oid = target_table.relnamespace
CROSS JOIN LATERAL unnest(constraint_row.conkey)
  WITH ORDINALITY AS source_key(attnum, ordinality)
JOIN LATERAL unnest(constraint_row.confkey)
  WITH ORDINALITY AS target_key(attnum, ordinality)
  ON target_key.ordinality = source_key.ordinality
JOIN pg_attribute AS source_column
  ON source_column.attrelid = source_table.oid
 AND source_column.attnum = source_key.attnum
 AND NOT source_column.attisdropped
JOIN pg_attribute AS target_column
  ON target_column.attrelid = target_table.oid
 AND target_column.attnum = target_key.attnum
 AND NOT target_column.attisdropped
WHERE constraint_row.contype = 'f'
  AND source_ns.nspname <> 'information_schema'
  AND target_ns.nspname <> 'information_schema'
  AND left(source_ns.nspname, 3) <> 'pg_'
  AND left(target_ns.nspname, 3) <> 'pg_'
GROUP BY
  source_ns.nspname,
  source_table.relname,
  constraint_row.conname,
  target_ns.nspname,
  target_table.relname,
  constraint_row.confdeltype,
  constraint_row.confupdtype,
  constraint_row.convalidated
ORDER BY
  source_ns.nspname,
  source_table.relname,
  constraint_row.conname;

COMMIT;
```

## Local isolated procedure

**Procedure boundary:** The execution outcome is recorded above. This section documents the isolated procedure for reference or a separately authorized repeat; it is not an executable script. Any repeat must use a new disposable PostgreSQL 17.6 instance. Do not use the repository's Compose service, port 5433, any shared/named volume, or a live/hosted database.

The existing `scripts/validation/d14-runtime-setup.sh` provides the applicable isolation setup. It is D14-specific, so this FK-only path uses its setup and migration-1–7 checkpoint but deliberately does not call `d14_apply_migration8_and_test()` (that helper inserts fixtures and runs D14 assertions). From the repository root, in a Bash session:

1. Source `scripts/validation/d14-runtime-setup.sh`. The script creates a unique tmpfs-backed disposable `postgres:17.6` container bound only to a dynamic `127.0.0.1` port, an external run-specific workspace, and applies exactly migrations 1–7. It verifies the checked-in migration directory set, unchanged migration files, and the run/container identity. Do not run this in preparation of this document.
2. Stop at its printed checkpoint. Inspect the migration history: require exactly the seven expected successful, non-rolled-back migration rows and no others. If the checkpoint or any isolation check differs, stop without proceeding.
3. In the sourced session, from the script's workspace (it changes to `$WORKSPACE`), copy only migration 8 into the workspace, verify it byte-for-byte against the repository source, and verify migration 9 is absent:

   ```bash
   mkdir -p "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments"
   cp -p "$REPO/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql" \
     "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql"
   cmp -s "$REPO/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql" \
     "$WORKSPACE/prisma/migrations/20261107130000_d7_typed_role_assignments/migration.sql"
   test ! -e "$WORKSPACE/prisma/migrations/20261108130000_d8_role_definition_governance"
   pnpm exec prisma migrate deploy --config "$WORKSPACE/prisma.config.ts"
   pnpm exec prisma migrate status --config "$WORKSPACE/prisma.config.ts"
   ```

   Recheck migration history before querying: exactly eight successful, non-rolled-back rows, names exactly migrations 1–8, and no migration 9 directory or history row. Any unexpected row, name, or status is FAIL/STOP; do not repair history or continue against another database.
4. Copy the SQL query above into `$WORKSPACE/fk-catalog.sql`. Run it through the session's `d14_psql` wrapper and retain raw output:

   ```bash
   d14_psql -q -A -P pager=off -P footer=off -F $'\t' \
     < "$WORKSPACE/fk-catalog.sql" \
     | tee "$WORKSPACE/fk-catalog-1-8.tsv"
   ```

   The catalog SQL is SELECT-only inside a read-only transaction. Do not alter constraints, insert fixtures, or run extra migration/test commands for this audit.
5. Compare all output rows one-to-one with the matrix. Run `d14_recovery_status`, then `d14_preserve_evidence` to retain the migration history, source commit, tool/container identity, redacted logs, query output, and migration inputs. The helper copies `.log`/`.tsv` files but not the custom query file: copy `$WORKSPACE/fk-catalog.sql` into `$D14_EVIDENCE_DIR/` and verify it with `cmp` before cleanup. Then call `d14_cleanup`, which re-verifies the retained evidence and removes only the identity-checked run container and workspace; retain the evidence directory. Never use broad Docker cleanup or remove images/volumes.

## Expected output and decision rules

The query must return exactly 19 rows: the 18 `core` FKs and one `master_data` V02 control. Each row must match one matrix row by source/target schemas and tables, constraint name, and ordered source/target column arrays. Expected actions are `CASCADE`/`CASCADE` only for the V02 control and `RESTRICT`/`RESTRICT` for all 18 `core` constraints. Every row must have `convalidated = true`.

- **PASS for this bounded catalog check only:** isolated migration history is exactly 1–8; migration 9 is absent; query returns exactly the 19 expected rows with exact tuples/names/actions and all validated; the SQL text and output are retained; and exact-resource cleanup is verified. A PASS does not promote V04.
- **FAIL:** any missing, extra, duplicate, renamed, mistargeted, reordered, differently-actioned, or unvalidated FK; unexpected migration history; migration 9 present; or any isolation/evidence/cleanup check that fails. Stop and preserve evidence. Do not alter schema or migration history to make the result conform.
- **NOT RUN / INCONCLUSIVE:** no authorized isolated runtime run, an unavailable/incompletely verified target, or insufficient retained output. The recorded run above is BOUNDED PASS for catalog metadata only.

This check does not test runtime DELETE/UPDATE outcomes, D14 insert-time mismatch rejection, Role Definition governance, application-level authorization, RLS, production state, or complete V04 acceptance.
