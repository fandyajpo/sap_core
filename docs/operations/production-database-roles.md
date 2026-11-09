# Production Database Roles — V04

Status: deployment runbook draft. This document describes the intended production split; it does not mean the hosted database has been provisioned or verified.

## Goal

Use separate PostgreSQL identities for the application and schema migrations:

- `sap_core_runtime`: application login used by Next.js through `DATABASE_URL`. It must not own tables, bypass RLS, or have elevated role attributes.
- Migration owner: the existing database owner / migration credential, supplied only to the migration process through `MIGRATION_DATABASE_URL`. Do not expose this credential to the Vercel application runtime.

Do not use the migration owner as the application's `DATABASE_URL`.

## Preconditions

Before running SQL:

1. Confirm the hosted database credential rotation is complete.
2. Connect with the intended migration-owner credential using a secure terminal/session. Never paste connection strings, passwords, or API keys into chat, Git, shell history, or screenshots.
3. Confirm the target is the intended production database and that the session is not read-only.
4. Confirm the migration owner is permitted to create roles and grant the required privileges.
5. Take/verify a recoverable backup before making production role changes.

Do not run this against a local development database or a disposable integration-test database.

## 1. Create the runtime role

Run once as the database administrator / migration owner. Do not put a password in this SQL file:

```sql
CREATE ROLE sap_core_runtime
  LOGIN
  NOSUPERUSER
  NOBYPASSRLS
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT;
```

If the role already exists, inspect it first rather than blindly recreating it:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname = 'sap_core_runtime';
```

Set its password interactively with the PostgreSQL `psql` command `\\password sap_core_runtime`. This prompts without placing the password in the SQL text or command history. Store the resulting runtime connection string only in the deployment secret manager.

The runtime role must not be a member of any owner, migration, administrator, or other elevated role.

## 2. Grant the minimum application privileges

The following grants mirror the runtime-role permissions exercised by `tests/v04-rls.integration.test.mjs`. Run as the migration owner:

```sql
GRANT USAGE ON SCHEMA "core" TO sap_core_runtime;

GRANT SELECT, INSERT, UPDATE ON
  "core"."organization",
  "core"."company",
  "core"."plant",
  "core"."organization_membership",
  "core"."company_membership",
  "core"."plant_assignment",
  "core"."organization_role_assignment",
  "core"."company_role_assignment",
  "core"."plant_role_assignment",
  "core"."role_definition",
  "core"."role_permission_grant"
TO sap_core_runtime;

GRANT SELECT, INSERT ON
  "core"."role_definition_audit",
  "core"."break_glass_access_audit"
TO sap_core_runtime;

GRANT SELECT ON
  "core"."permission_definition",
  "core"."permission_delegation_policy"
TO sap_core_runtime;

GRANT SELECT, INSERT, UPDATE ON "core"."user"
TO sap_core_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "core"."session",
  "core"."account",
  "core"."verification"
TO sap_core_runtime;
```

If the database has revoked CONNECT from PUBLIC, also grant CONNECT on the actual production database to `sap_core_runtime`. Use the exact database name; do not guess it.

These grants intentionally do not give the runtime role:
- ownership of any table or schema;
- INSERT/UPDATE/DELETE on permission catalog or delegation policy;
- UPDATE/DELETE on audit tables;
- DELETE on tenant, membership, assignment, or role-definition tables;
- CREATE on schema `core`;
- CREATEROLE, CREATEDB, SUPERUSER, or BYPASSRLS.

Do not add broad grants such as `GRANT ALL ON ALL TABLES` or `GRANT ALL ON SCHEMA core`.

## 3. Verify role attributes, membership, and ownership

Run as an administrator / migration owner:

```sql
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
       rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname = 'sap_core_runtime';
```

Expected: LOGIN true; SUPERUSER, CREATEDB, CREATEROLE, BYPASSRLS, and INHERIT false.

Check that the runtime role has no memberships:

```sql
SELECT parent.rolname AS granted_role
FROM pg_auth_members m
JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname = 'sap_core_runtime';
```

Expected: zero rows.

Check that it owns no relations in the application schema:

```sql
SELECT c.relname, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'core'
  AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'sap_core_runtime');
```

Expected: zero rows.

## 4. Verify RLS and table privileges

The runtime role must be a non-owner and must not bypass RLS. Verify the 13 V04 RLS tables are enabled:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'core'::regnamespace
  AND relname = ANY (ARRAY[
    'organization', 'company', 'plant',
    'organization_membership', 'company_membership', 'plant_assignment',
    'organization_role_assignment', 'company_role_assignment', 'plant_role_assignment',
    'role_definition', 'role_permission_grant',
    'role_definition_audit', 'break_glass_access_audit'
  ])
ORDER BY relname;
```

Expected: 13 rows and `relrowsecurity = true` for every row. V04 currently does not FORCE RLS; the critical runtime protections are that this role is not a table owner and has NOBYPASSRLS.

Verify sensitive privileges explicitly:

```sql
SELECT
  has_table_privilege('sap_core_runtime', 'core.permission_delegation_policy', 'SELECT') AS delegation_policy_read,
  has_table_privilege('sap_core_runtime', 'core.permission_delegation_policy', 'UPDATE') AS delegation_policy_update,
  has_table_privilege('sap_core_runtime', 'core.role_definition_audit', 'INSERT') AS role_audit_insert,
  has_table_privilege('sap_core_runtime', 'core.role_definition_audit', 'UPDATE') AS role_audit_update,
  has_table_privilege('sap_core_runtime', 'core.organization', 'DELETE') AS organization_delete;
```

Expected: `true, false, true, false, false`, respectively.

Also verify the role can connect to the intended database and can establish a real connection using the new runtime credential. Do not test by printing the connection string.

## 5. Runtime and migration environment separation

Repository behavior today:

- `src/lib/prisma.ts` uses `DATABASE_URL` for the application.
- `prisma.config.ts` uses `MIGRATION_DATABASE_URL` when set, but currently falls back to `DATABASE_URL` if it is absent.

Deployment rules:

1. Set `DATABASE_URL` to the runtime role connection string for the application.
2. Set `MIGRATION_DATABASE_URL` only in the trusted migration execution environment, using the migration-owner connection.
3. Do not add the migration-owner secret to the Vercel application project's Production, Preview, or Development runtime environment variables. Run migrations from a separate trusted local/CI job.
4. Before production migrations, require an explicit `MIGRATION_DATABASE_URL`; do not rely on the current fallback. Consider tightening `prisma.config.ts` so production migration commands fail closed when it is missing.
5. If the provider supplies a pooled runtime URL and a direct migration URL, use the provider's documented forms for those separate purposes. Do not assume a connection string is pooled based only on its label.

Vercel application variables to configure later:
- `DATABASE_URL`: runtime role only.
- `BETTER_AUTH_SECRET`: production secret.
- `BETTER_AUTH_URL`: canonical production HTTPS origin.

Do not configure `MIGRATION_DATABASE_URL` in the Vercel application runtime.

## 6. Operational maintenance

- When a migration introduces a new table or changes runtime operations, update the explicit GRANT list and this runbook in the same change.
- Re-run the V04 RLS integration test against a fresh disposable database after privilege changes.
- Re-run the role/privilege verification queries against production after provisioning.
- Keep the migration credential separate, restricted, and out of application logs and runtime environments.
- Never use the runtime role to run Prisma migrations.

## Verification record

Do not mark this runbook as production-complete until the following evidence exists:

- [ ] Runtime role created on the intended hosted database.
- [ ] Role attributes verified: non-superuser, NOBYPASSRLS, no CREATEDB/CREATEROLE.
- [ ] No elevated role memberships.
- [ ] Runtime role owns no application tables.
- [ ] Required grants verified; prohibited grants absent.
- [ ] RLS enabled on all 13 V04 tenant tables.
- [ ] Runtime connection succeeds with the runtime credential.
- [ ] Migration owner credential is used only by the trusted migration process.
- [ ] Vercel Production environment contains runtime credentials only.
