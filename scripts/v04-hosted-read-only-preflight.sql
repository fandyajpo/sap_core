-- SAP Core V04 hosted preflight
-- READ-ONLY: catalog metadata only. No DDL, DML, locks, or application data.
-- Run only after reviewing the target host/database identity.
BEGIN TRANSACTION READ ONLY;

SELECT
  current_database() AS database_name,
  current_user AS effective_role,
  session_user AS authenticated_role,
  current_setting('server_version') AS server_version,
  current_setting('transaction_read_only') AS transaction_read_only;

SELECT
  r.rolname AS effective_role,
  r.rolsuper AS is_superuser,
  r.rolinherit AS inherits_roles,
  r.rolcreaterole AS can_create_roles,
  r.rolcreatedb AS can_create_databases,
  r.rolreplication AS can_replicate,
  r.rolbypassrls AS bypasses_rls,
  r.rolconnlimit AS connection_limit
FROM pg_roles AS r
WHERE r.rolname = current_user;

SELECT
  parent.rolname AS granted_role,
  m.admin_option
FROM pg_auth_members AS m
JOIN pg_roles AS parent ON parent.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
WHERE member.rolname = current_user
ORDER BY parent.rolname;

SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
ORDER BY n.nspname, c.relname;

SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = '_prisma_migrations'
ORDER BY table_schema;

-- Migration history is metadata, not business data.
-- If the table exists in public, this reports aggregate status only.
SELECT
  COUNT(*) AS migration_rows,
  COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS successful_rows,
  COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back_rows,
  COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished_rows
FROM public._prisma_migrations
WHERE to_regclass('public._prisma_migrations') IS NOT NULL;

ROLLBACK;
