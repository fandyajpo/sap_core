-- STATUS: PREPARED / NOT EXECUTED / NOT RUNTIME-VERIFIED. D14 remains UNRESOLVED.
\set ON_ERROR_STOP on
\pset pager off
\pset null '(NULL)'

DO $d14_target_guard$
BEGIN
  IF current_database() !~ '^d14_[0-9a-f]{32}$'
     OR current_user <> current_database()
     OR current_setting('server_version_num')::INTEGER < 170000
     OR current_setting('server_version_num')::INTEGER >= 180000 THEN
    RAISE EXCEPTION 'Refusing D14 tests outside the named disposable PostgreSQL 17 target.'
      USING ERRCODE = '42501';
  END IF;
END;
$d14_target_guard$;

-- Run only after the exact migration-8 SQL has been applied.
-- Each expected failure is caught inside a PL/pgSQL exception subtransaction;
-- the outer transaction is rolled back after the evidence rows are printed.
BEGIN;

CREATE TEMP TABLE d14_results (
  case_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  assignment_id UUID,
  sql_text TEXT,
  expected_sqlstate TEXT NOT NULL,
  actual_sqlstate TEXT NOT NULL,
  error_message TEXT,
  row_preserved BOOLEAN NOT NULL,
  outcome TEXT NOT NULL
) ON COMMIT PRESERVE ROWS;

-- Full post-migration row view: verifies each assignment's own parent column,
-- linked Role Definition, revoked_at, and D7-added columns.
SELECT 'organization_role_assignment' AS table_name,
       "id" AS assignment_id,
       "organizationMembershipId" AS parent_id,
       "roleDefinitionId" AS role_definition_id,
       "revoked_at", "role_scope", "grant_actor_user_id", "is_break_glass", "break_glass_reason"
FROM "core"."organization_role_assignment"
UNION ALL
SELECT 'company_role_assignment', "id", "companyMembershipId", "roleDefinitionId",
       "revoked_at", "role_scope", "grant_actor_user_id", "is_break_glass", "break_glass_reason"
FROM "core"."company_role_assignment"
UNION ALL
SELECT 'plant_role_assignment', "id", "plantAssignmentId", "roleDefinitionId",
       "revoked_at", "role_scope", "grant_actor_user_id", "is_break_glass", "break_glass_reason"
FROM "core"."plant_role_assignment"
ORDER BY table_name, assignment_id;

CREATE FUNCTION pg_temp.d14_expect_55000(
  p_case_name TEXT,
  p_table_name TEXT,
  p_assignment_id UUID,
  p_sql_text TEXT,
  p_expected_revoked_at TIMESTAMPTZ,
  p_unchanged_column TEXT DEFAULT NULL,
  p_expected_unchanged_value TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $d14$
DECLARE
  actual_state TEXT := 'STATEMENT_SUCCEEDED';
  actual_message TEXT;
  preserved_count INTEGER;
BEGIN
  IF (p_unchanged_column IS NULL) IS DISTINCT FROM (p_expected_unchanged_value IS NULL) THEN
    RAISE EXCEPTION 'D14 assertion requires both unchanged-column arguments or neither';
  END IF;

  BEGIN
    EXECUTE p_sql_text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      actual_state = RETURNED_SQLSTATE,
      actual_message = MESSAGE_TEXT;
  END;

  IF actual_state IS DISTINCT FROM '55000' THEN
    RAISE EXCEPTION
      'D14 assertion failed: case %, table %, row %, expected SQLSTATE 55000, got % (%). SQL: %',
      p_case_name, p_table_name, p_assignment_id, actual_state,
      COALESCE(actual_message, 'no database error'), p_sql_text;
  END IF;

  IF p_unchanged_column IS NULL THEN
    EXECUTE format(
      'SELECT COUNT(*) FROM "core".%I WHERE "id" = $1 AND "revoked_at" IS NOT DISTINCT FROM $2',
      p_table_name
    ) INTO preserved_count USING p_assignment_id, p_expected_revoked_at;
  ELSE
    EXECUTE format(
      'SELECT COUNT(*) FROM "core".%I WHERE "id" = $1 AND "revoked_at" IS NOT DISTINCT FROM $2 AND %I::text IS NOT DISTINCT FROM $3',
      p_table_name, p_unchanged_column
    ) INTO preserved_count USING p_assignment_id, p_expected_revoked_at, p_expected_unchanged_value;
  END IF;

  IF preserved_count <> 1 THEN
    RAISE EXCEPTION
      'D14 assertion failed: row or protected value not preserved after %, table %, row %',
      p_case_name, p_table_name, p_assignment_id;
  END IF;

  INSERT INTO pg_temp.d14_results
    (case_name, table_name, assignment_id, sql_text, expected_sqlstate,
     actual_sqlstate, error_message, row_preserved, outcome)
  VALUES
    (p_case_name, p_table_name, p_assignment_id, p_sql_text, '55000',
     actual_state, actual_message, TRUE, 'PASS');
END;
$d14$;

DO $d14$
DECLARE
  item RECORD;
  rows_found INTEGER;
  changed_rows INTEGER;
  revoked_at_value CONSTANT TIMESTAMPTZ := TIMESTAMPTZ '2026-11-10 12:00:00+00';
  sql_text_value TEXT;
BEGIN
  -- Six fixtures must survive migration 8 with the migration-8 defaults and
  -- a scope-compatible Role Definition. Parent column differs by assignment table.
  FOR item IN
    SELECT * FROM (VALUES
      ('organization_role_assignment', 'organizationMembershipId', '00000000-0000-4000-8000-000000000031'::UUID, '00000000-0000-4000-8000-000000000011'::UUID, '00000000-0000-4000-8000-000000000021'::UUID, '00000000-0000-4000-8000-000000000024'::UUID, 'ORGANIZATION'),
      ('organization_role_assignment', 'organizationMembershipId', '00000000-0000-4000-8000-000000000041'::UUID, '00000000-0000-4000-8000-000000000011'::UUID, '00000000-0000-4000-8000-000000000021'::UUID, '00000000-0000-4000-8000-000000000024'::UUID, 'ORGANIZATION'),
      ('company_role_assignment', 'companyMembershipId', '00000000-0000-4000-8000-000000000032'::UUID, '00000000-0000-4000-8000-000000000012'::UUID, '00000000-0000-4000-8000-000000000022'::UUID, '00000000-0000-4000-8000-000000000025'::UUID, 'COMPANY'),
      ('company_role_assignment', 'companyMembershipId', '00000000-0000-4000-8000-000000000042'::UUID, '00000000-0000-4000-8000-000000000012'::UUID, '00000000-0000-4000-8000-000000000022'::UUID, '00000000-0000-4000-8000-000000000025'::UUID, 'COMPANY'),
      ('plant_role_assignment', 'plantAssignmentId', '00000000-0000-4000-8000-000000000033'::UUID, '00000000-0000-4000-8000-000000000013'::UUID, '00000000-0000-4000-8000-000000000023'::UUID, '00000000-0000-4000-8000-000000000026'::UUID, 'PLANT'),
      ('plant_role_assignment', 'plantAssignmentId', '00000000-0000-4000-8000-000000000043'::UUID, '00000000-0000-4000-8000-000000000013'::UUID, '00000000-0000-4000-8000-000000000023'::UUID, '00000000-0000-4000-8000-000000000026'::UUID, 'PLANT')
    ) AS f(table_name, parent_column, assignment_id, parent_id, role_definition_id, alternate_role_definition_id, role_scope)
  LOOP
    EXECUTE format(
      'SELECT COUNT(*)
         FROM "core".%I AS a
         JOIN "core"."role_definition" AS rd ON rd."id" = a."roleDefinitionId"
        WHERE a."id" = $1
          AND a.%I = $2
          AND a."roleDefinitionId" = $3
          AND a."revoked_at" IS NULL
          AND a."role_scope" = $4::"core"."RoleScope"
          AND rd."scope" = $4::"core"."RoleScope"
          AND a."grant_actor_user_id" IS NULL
          AND a."is_break_glass" IS FALSE
          AND a."break_glass_reason" IS NULL',
      item.table_name, item.parent_column
    ) INTO rows_found USING item.assignment_id, item.parent_id, item.role_definition_id, item.role_scope;

    IF rows_found <> 1 THEN
      RAISE EXCEPTION
        'D14 fixture preservation/default assertion failed: table %, row %, matching rows %',
        item.table_name, item.assignment_id, rows_found;
    END IF;

    INSERT INTO pg_temp.d14_results
      (case_name, table_name, assignment_id, sql_text, expected_sqlstate,
       actual_sqlstate, error_message, row_preserved, outcome)
    VALUES
      ('fixture_preserved_and_defaults', item.table_name, item.assignment_id, NULL,
       'n/a', 'verified', NULL, TRUE, 'PASS');
  END LOOP;

  -- Test all three tables independently. Each first revocation must succeed.
  FOR item IN
    SELECT * FROM (VALUES
      ('organization_role_assignment', 'organizationMembershipId', '00000000-0000-4000-8000-000000000031'::UUID, '00000000-0000-4000-8000-000000000024'::UUID, '00000000-0000-4000-8000-000000000041'::UUID, '00000000-0000-4000-8000-000000000011'::UUID, 'ORGANIZATION', 'COMPANY'),
      ('company_role_assignment', 'companyMembershipId', '00000000-0000-4000-8000-000000000032'::UUID, '00000000-0000-4000-8000-000000000025'::UUID, '00000000-0000-4000-8000-000000000042'::UUID, '00000000-0000-4000-8000-000000000012'::UUID, 'COMPANY', 'ORGANIZATION'),
      ('plant_role_assignment', 'plantAssignmentId', '00000000-0000-4000-8000-000000000033'::UUID, '00000000-0000-4000-8000-000000000026'::UUID, '00000000-0000-4000-8000-000000000043'::UUID, '00000000-0000-4000-8000-000000000013'::UUID, 'PLANT', 'COMPANY')
    ) AS f(table_name, parent_column, revoked_id, alternate_role_definition_id, unrevoked_id, parent_id, role_scope, alternate_role_scope)
  LOOP
    sql_text_value := format(
      'UPDATE "core".%I SET "revoked_at" = %L::timestamptz WHERE "id" = %L::uuid AND "revoked_at" IS NULL',
      item.table_name, revoked_at_value, item.revoked_id
    );
    EXECUTE sql_text_value;
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 1 THEN
      RAISE EXCEPTION
        'First NULL-to-timestamp revocation did not update exactly one row: table %, row %, count %',
        item.table_name, item.revoked_id, changed_rows;
    END IF;

    EXECUTE format(
      'SELECT COUNT(*) FROM "core".%I WHERE "id" = $1 AND "revoked_at" = $2',
      item.table_name
    ) INTO rows_found USING item.revoked_id, revoked_at_value;
    IF rows_found <> 1 THEN
      RAISE EXCEPTION 'First revocation was not retained: table %, row %', item.table_name, item.revoked_id;
    END IF;

    INSERT INTO pg_temp.d14_results
      (case_name, table_name, assignment_id, sql_text, expected_sqlstate,
       actual_sqlstate, error_message, row_preserved, outcome)
    VALUES
      ('first_null_to_timestamp_revocation', item.table_name, item.revoked_id, sql_text_value,
       'SUCCESS', 'SUCCESS', NULL, TRUE, 'PASS');

    PERFORM pg_temp.d14_expect_55000(
      'delete_after_revocation', item.table_name, item.revoked_id,
      format('DELETE FROM "core".%I WHERE "id" = %L::uuid', item.table_name, item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'clear_revoked_at', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "revoked_at" = NULL WHERE "id" = %L::uuid', item.table_name, item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_revoked_at_timestamp', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "revoked_at" = %L::timestamptz WHERE "id" = %L::uuid',
        item.table_name, '2026-11-10 12:00:01+00', item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_grant_actor_metadata', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "grant_actor_user_id" = %L WHERE "id" = %L::uuid',
        item.table_name, 'd14-mutated-actor', item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_break_glass_metadata', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "grant_actor_user_id" = %L, "is_break_glass" = TRUE, "break_glass_reason" = %L WHERE "id" = %L::uuid',
        item.table_name, 'd14-actor', 'D14 metadata mutation', item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_break_glass_reason_metadata', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "break_glass_reason" = %L WHERE "id" = %L::uuid',
        item.table_name, 'D14 reason rewrite', item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_assignment_primary_key', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "id" = %L::uuid WHERE "id" = %L::uuid',
        item.table_name, '00000000-0000-4000-8000-000000000099', item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_role_definition_identity', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "roleDefinitionId" = %L::uuid WHERE "id" = %L::uuid',
        item.table_name, item.alternate_role_definition_id, item.revoked_id),
      revoked_at_value
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_parent_foreign_key', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET %I = %L::uuid WHERE "id" = %L::uuid',
        item.table_name, item.parent_column, '00000000-0000-4000-8000-000000000099', item.revoked_id),
      revoked_at_value, item.parent_column, item.parent_id::TEXT
    );

    PERFORM pg_temp.d14_expect_55000(
      'change_role_scope', item.table_name, item.revoked_id,
      format('UPDATE "core".%I SET "role_scope" = %L::"core"."RoleScope" WHERE "id" = %L::uuid',
        item.table_name, item.alternate_role_scope, item.revoked_id),
      revoked_at_value, 'role_scope', item.role_scope
    );

    PERFORM pg_temp.d14_expect_55000(
      'delete_unrevoked_assignment', item.table_name, item.unrevoked_id,
      format('DELETE FROM "core".%I WHERE "id" = %L::uuid', item.table_name, item.unrevoked_id),
      NULL
    );
  END LOOP;

  SELECT COUNT(*) INTO rows_found FROM pg_temp.d14_results;
  IF rows_found <> 42 THEN
    RAISE EXCEPTION 'Expected 42 D14 evidence rows, got %', rows_found;
  END IF;
  SELECT COUNT(*) INTO rows_found FROM pg_temp.d14_results WHERE outcome <> 'PASS';
  IF rows_found <> 0 THEN
    RAISE EXCEPTION 'D14 evidence contains % non-PASS rows', rows_found;
  END IF;
END;
$d14$;

-- This output is the runtime evidence: exact attempted SQL, expected/actual
-- SQLSTATE, PostgreSQL message, row preservation, and assertion result.
SELECT case_name, table_name, assignment_id, sql_text, expected_sqlstate,
       actual_sqlstate, error_message, row_preserved, outcome
FROM pg_temp.d14_results
ORDER BY table_name, assignment_id, case_name;

-- All test mutations, including the first successful revocations, are rolled back.
ROLLBACK;
