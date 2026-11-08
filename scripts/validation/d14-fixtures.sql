-- STATUS: PREPARED / NOT EXECUTED / NOT RUNTIME-VERIFIED. D14 remains UNRESOLVED.
\set ON_ERROR_STOP on
\pset pager off

DO $d14_target_guard$
BEGIN
  IF current_database() !~ '^d14_[0-9a-f]{32}$'
     OR current_user <> current_database()
     OR current_setting('server_version_num')::INTEGER < 170000
     OR current_setting('server_version_num')::INTEGER >= 180000 THEN
    RAISE EXCEPTION 'Refusing D14 fixtures outside the named disposable PostgreSQL 17 target.'
      USING ERRCODE = '42501';
  END IF;
END;
$d14_target_guard$;

-- Run this only after migrations 1-7 and before migration 8.
-- The Role Definitions are SYSTEM records in their matching scopes; no custom
-- definitions or migration-9-only data are used.
BEGIN;

INSERT INTO "core"."user"
  ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
VALUES
  ('d14-actor', 'D14 disposable actor', 'd14-actor@example.test', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('d14-subject', 'D14 disposable subject', 'd14-subject@example.test', FALSE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "core"."organization" ("id", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP);

INSERT INTO "core"."company" ("id", "organizationId", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', CURRENT_TIMESTAMP);

INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  CURRENT_TIMESTAMP
);

INSERT INTO "core"."organization_membership"
  ("id", "userId", "organizationId", "status", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000011',
  'd14-subject',
  '00000000-0000-4000-8000-000000000001',
  'ACTIVE',
  CURRENT_TIMESTAMP
);

INSERT INTO "core"."company_membership"
  ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000012',
  'd14-subject',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  'ACTIVE',
  CURRENT_TIMESTAMP
);

INSERT INTO "core"."plant_assignment"
  ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "updated_at")
VALUES (
  '00000000-0000-4000-8000-000000000013',
  'd14-subject',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  'ACTIVE',
  CURRENT_TIMESTAMP
);

INSERT INTO "core"."role_definition"
  ("id", "code", "version", "kind", "scope", "updated_at")
VALUES
  ('00000000-0000-4000-8000-000000000021', 'D14_ORG_PRIMARY', 1, 'SYSTEM', 'ORGANIZATION', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000022', 'D14_COMPANY_PRIMARY', 1, 'SYSTEM', 'COMPANY', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000023', 'D14_PLANT_PRIMARY', 1, 'SYSTEM', 'PLANT', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000024', 'D14_ORG_ALTERNATE', 1, 'SYSTEM', 'ORGANIZATION', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000025', 'D14_COMPANY_ALTERNATE', 1, 'SYSTEM', 'COMPANY', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000026', 'D14_PLANT_ALTERNATE', 1, 'SYSTEM', 'PLANT', CURRENT_TIMESTAMP);

-- Each table has one row to revoke and one independent, still-unrevoked row.
-- The D7 columns do not exist yet; created_at and revoked_at use migration-7 defaults.
INSERT INTO "core"."organization_role_assignment"
  ("id", "organizationMembershipId", "roleDefinitionId")
VALUES
  ('00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021'),
  ('00000000-0000-4000-8000-000000000041', '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000021');

INSERT INTO "core"."company_role_assignment"
  ("id", "companyMembershipId", "roleDefinitionId")
VALUES
  ('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000022'),
  ('00000000-0000-4000-8000-000000000042', '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000022');

INSERT INTO "core"."plant_role_assignment"
  ("id", "plantAssignmentId", "roleDefinitionId")
VALUES
  ('00000000-0000-4000-8000-000000000033', '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000023'),
  ('00000000-0000-4000-8000-000000000043', '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000023');

COMMIT;

SELECT 'D14_FIXTURE_COUNTS' AS marker, 'organization_role_assignment' AS table_name, COUNT(*) AS rows
FROM "core"."organization_role_assignment"
UNION ALL
SELECT 'D14_FIXTURE_COUNTS', 'company_role_assignment', COUNT(*)
FROM "core"."company_role_assignment"
UNION ALL
SELECT 'D14_FIXTURE_COUNTS', 'plant_role_assignment', COUNT(*)
FROM "core"."plant_role_assignment"
ORDER BY table_name;
