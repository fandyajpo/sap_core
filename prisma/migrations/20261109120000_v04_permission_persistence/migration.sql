BEGIN;

-- The P14 baseline is intentionally empty. Stop rather than reclassifying or
-- overwriting any role definitions or assignments created after the approved D8 baseline.
DO $$
DECLARE
  role_count BIGINT;
  assignment_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO role_count FROM "core"."role_definition";
  SELECT
    (SELECT COUNT(*) FROM "core"."organization_role_assignment")
    + (SELECT COUNT(*) FROM "core"."company_role_assignment")
    + (SELECT COUNT(*) FROM "core"."plant_role_assignment")
    INTO assignment_count;

  IF role_count <> 0 OR assignment_count <> 0 THEN
    RAISE EXCEPTION
      'V04 permission persistence migration requires an empty role baseline; found % role definitions and % assignments. Stop for owner-reviewed classification.',
      role_count, assignment_count
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TYPE "core"."PermissionGrantEffect" AS ENUM ('ALLOW', 'DENY');

ALTER TABLE "core"."role_definition"
  ADD COLUMN "permissions_locked_at" TIMESTAMPTZ(6);

ALTER TABLE "core"."role_definition"
  ADD CONSTRAINT "role_definition_custom_organization_scope_check"
  CHECK (
    "kind" <> 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
    OR "scope" = 'ORGANIZATION'::"core"."RoleScope"
  );

CREATE UNIQUE INDEX "role_definition_system_scope_code_key"
  ON "core"."role_definition"("scope", "code")
  WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind";

CREATE TABLE "core"."permission_definition" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "permission_definition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "permission_definition_code_key" UNIQUE ("code")
);

CREATE TABLE "core"."role_permission_grant" (
  "id" UUID NOT NULL,
  "role_definition_id" UUID NOT NULL,
  "permission_definition_id" UUID NOT NULL,
  "effect" "core"."PermissionGrantEffect" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_permission_grant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_permission_grant_role_permission_key"
    UNIQUE ("role_definition_id", "permission_definition_id"),
  CONSTRAINT "role_permission_grant_role_definition_id_fkey"
    FOREIGN KEY ("role_definition_id") REFERENCES "core"."role_definition"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "role_permission_grant_permission_definition_id_fkey"
    FOREIGN KEY ("permission_definition_id") REFERENCES "core"."permission_definition"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "role_permission_grant_role_definition_id_idx"
  ON "core"."role_permission_grant"("role_definition_id");
CREATE INDEX "role_permission_grant_permission_definition_id_idx"
  ON "core"."role_permission_grant"("permission_definition_id");

INSERT INTO "core"."permission_definition" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'organization.read', 'Read Organization profile and details.'),
  (gen_random_uuid(), 'organization.update', 'Update Organization profile and settings.'),
  (gen_random_uuid(), 'organization.members.read', 'Read Organization membership records.'),
  (gen_random_uuid(), 'organization.members.manage', 'Manage Organization memberships.'),
  (gen_random_uuid(), 'company.read', 'Read Company details.'),
  (gen_random_uuid(), 'company.manage', 'Manage Company records.'),
  (gen_random_uuid(), 'company.members.manage', 'Manage Company memberships.'),
  (gen_random_uuid(), 'plant.read', 'Read Plant details.'),
  (gen_random_uuid(), 'plant.manage', 'Manage Plant records.'),
  (gen_random_uuid(), 'plant.assignments.manage', 'Manage Plant assignments.'),
  (gen_random_uuid(), 'roles.read', 'Read tenant role definitions and assignments.'),
  (gen_random_uuid(), 'roles.create', 'Create Organization custom roles.'),
  (gen_random_uuid(), 'roles.revise', 'Create a new immutable Organization custom-role version.'),
  (gen_random_uuid(), 'roles.assign', 'Assign eligible tenant role definitions.'),
  (gen_random_uuid(), 'audit.read', 'Read tenant audit records.');

-- Insert all eight approved tenant SYSTEM roles with complete v0.1 ALLOW snapshots.
INSERT INTO "core"."role_definition"
  ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId",
   "permissions_locked_at", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000001', NULL, 'ORG_OWNER', 1, 'SYSTEM', 'ORGANIZATION', NULL, NOW(), NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000002', NULL, 'ORG_ADMIN', 1, 'SYSTEM', 'ORGANIZATION', NULL, NOW(), NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000003', NULL, 'ORG_MEMBER', 1, 'SYSTEM', 'ORGANIZATION', NULL, NOW(), NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000001', NULL, 'COMPANY_ADMIN', 1, 'SYSTEM', 'COMPANY', NULL, NOW(), NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000002', NULL, 'COMPANY_MEMBER', 1, 'SYSTEM', 'COMPANY', NULL, NOW(), NOW(), NOW()),
  ('30000000-0000-4000-8000-000000000001', NULL, 'PLANT_MANAGER', 1, 'SYSTEM', 'PLANT', NULL, NOW(), NOW(), NOW()),
  ('30000000-0000-4000-8000-000000000002', NULL, 'PLANT_OPERATOR', 1, 'SYSTEM', 'PLANT', NULL, NOW(), NOW(), NOW()),
  ('30000000-0000-4000-8000-000000000003', NULL, 'PLANT_VIEWER', 1, 'SYSTEM', 'PLANT', NULL, NOW(), NOW(), NOW());

-- Use the approved v0.1 role/permission matrix. DENY is reserved for governed
-- policy use and is deliberately absent from the built-in v0.1 snapshots.
WITH role_permission(role_code, permission_code) AS (
  SELECT role_code, permission_code
  FROM (VALUES
    ('ORG_OWNER','organization.read'),('ORG_OWNER','organization.update'),
    ('ORG_OWNER','organization.members.read'),('ORG_OWNER','organization.members.manage'),
    ('ORG_OWNER','company.read'),('ORG_OWNER','company.manage'),('ORG_OWNER','company.members.manage'),
    ('ORG_OWNER','plant.read'),('ORG_OWNER','plant.manage'),('ORG_OWNER','plant.assignments.manage'),
    ('ORG_OWNER','roles.read'),('ORG_OWNER','roles.create'),('ORG_OWNER','roles.revise'),
    ('ORG_OWNER','roles.assign'),('ORG_OWNER','audit.read'),

    ('ORG_ADMIN','organization.read'),('ORG_ADMIN','organization.update'),
    ('ORG_ADMIN','organization.members.read'),('ORG_ADMIN','organization.members.manage'),
    ('ORG_ADMIN','company.read'),('ORG_ADMIN','company.manage'),('ORG_ADMIN','company.members.manage'),
    ('ORG_ADMIN','plant.read'),('ORG_ADMIN','plant.manage'),('ORG_ADMIN','plant.assignments.manage'),
    ('ORG_ADMIN','roles.read'),('ORG_ADMIN','roles.create'),('ORG_ADMIN','roles.revise'),
    ('ORG_ADMIN','roles.assign'),('ORG_ADMIN','audit.read'),

    ('ORG_MEMBER','organization.read'),('ORG_MEMBER','organization.members.read'),

    ('COMPANY_ADMIN','company.read'),('COMPANY_ADMIN','company.manage'),
    ('COMPANY_ADMIN','company.members.manage'),('COMPANY_ADMIN','plant.read'),
    ('COMPANY_ADMIN','plant.manage'),('COMPANY_ADMIN','plant.assignments.manage'),
    ('COMPANY_ADMIN','roles.read'),('COMPANY_ADMIN','roles.assign'),('COMPANY_ADMIN','audit.read'),

    ('COMPANY_MEMBER','company.read'),

    ('PLANT_MANAGER','plant.read'),('PLANT_MANAGER','plant.manage'),
    ('PLANT_MANAGER','plant.assignments.manage'),('PLANT_MANAGER','roles.read'),
    ('PLANT_MANAGER','roles.assign'),('PLANT_MANAGER','audit.read'),

    ('PLANT_OPERATOR','plant.read'),
    ('PLANT_VIEWER','plant.read')
  ) AS matrix(role_code, permission_code)
)
INSERT INTO "core"."role_permission_grant"
  ("id", "role_definition_id", "permission_definition_id", "effect", "created_at")
SELECT gen_random_uuid(), rd."id", pd."id", 'ALLOW'::"core"."PermissionGrantEffect", NOW()
FROM role_permission rp
JOIN "core"."role_definition" rd ON rd."code" = rp.role_code AND rd."kind" = 'SYSTEM'
JOIN "core"."permission_definition" pd ON pd."code" = rp.permission_code;

-- Permission catalog identifiers/descriptions are immutable once seeded.
CREATE FUNCTION "core"."protect_permission_definition"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Permission definitions are immutable; introduce a new policy identifier instead.'
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "permission_definition_immutable"
  BEFORE UPDATE OR DELETE ON "core"."permission_definition"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_permission_definition"();

-- Role grant snapshots are append-only and can only be populated before sealing.
CREATE FUNCTION "core"."protect_role_permission_grant"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  locked_at TIMESTAMPTZ(6);
  role_kind "core"."RoleDefinitionKind";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Role permission grant snapshots are immutable.'
      USING ERRCODE = '55000';
  END IF;

  SELECT "permissions_locked_at", "kind" INTO locked_at, role_kind
    FROM "core"."role_definition"
   WHERE "id" = NEW."role_definition_id"
   FOR SHARE;

  IF NOT FOUND OR locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Role permission grants require an existing unsealed Role Definition.'
      USING ERRCODE = '55000';
  END IF;

  IF role_kind = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
     AND NEW."effect" <> 'ALLOW'::"core"."PermissionGrantEffect" THEN
    RAISE EXCEPTION 'Organization custom roles may contain ALLOW grants only.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$;
CREATE TRIGGER "role_permission_grant_immutable"
  BEFORE INSERT OR UPDATE OR DELETE ON "core"."role_permission_grant"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_permission_grant"();

-- A role can be sealed once. The timestamp can never be cleared or changed.
CREATE FUNCTION "core"."protect_role_permission_lock"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."permissions_locked_at" IS NOT NULL
     AND NEW."permissions_locked_at" IS DISTINCT FROM OLD."permissions_locked_at" THEN
    RAISE EXCEPTION 'A sealed Role Definition permission snapshot cannot be unlocked or resealed.'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "role_definition_permission_lock_guard"
  BEFORE UPDATE OF "permissions_locked_at" ON "core"."role_definition"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_permission_lock"();

-- Keep D8 custom revisions immutable while permitting only the one-way lock
-- transition. System role identity and policy metadata are also immutable.
CREATE OR REPLACE FUNCTION "core"."protect_custom_role_definition_revision"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."kind" IN ('ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind", 'SYSTEM'::"core"."RoleDefinitionKind") THEN
      RAISE EXCEPTION 'Custom and SYSTEM Role Definitions cannot be deleted.'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."kind" IN ('ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind", 'SYSTEM'::"core"."RoleDefinitionKind")
     AND (to_jsonb(NEW) - 'disabled_at' - 'updated_at' - 'permissions_locked_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'disabled_at' - 'updated_at' - 'permissions_locked_at') THEN
    RAISE EXCEPTION 'Role Definition identity and revision fields are immutable.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."permissions_locked_at" IS NOT NULL
     AND NEW."permissions_locked_at" IS DISTINCT FROM OLD."permissions_locked_at" THEN
    RAISE EXCEPTION 'A sealed Role Definition permission snapshot cannot be unlocked or resealed.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

-- Role assignments cannot reference incomplete permission snapshots.
CREATE FUNCTION "core"."require_sealed_role_definition_for_assignment"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  locked_at TIMESTAMPTZ(6);
BEGIN
  SELECT "permissions_locked_at" INTO locked_at
    FROM "core"."role_definition"
   WHERE "id" = NEW."roleDefinitionId"
     AND "scope" = NEW."role_scope"
   FOR SHARE;
  IF NOT FOUND OR locked_at IS NULL THEN
    RAISE EXCEPTION 'Role assignments require a sealed Role Definition permission snapshot.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "organization_role_assignment_requires_sealed_role"
  BEFORE INSERT OR UPDATE OF "roleDefinitionId", "role_scope" ON "core"."organization_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."require_sealed_role_definition_for_assignment"();
CREATE TRIGGER "company_role_assignment_requires_sealed_role"
  BEFORE INSERT OR UPDATE OF "roleDefinitionId", "role_scope" ON "core"."company_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."require_sealed_role_definition_for_assignment"();
CREATE TRIGGER "plant_role_assignment_requires_sealed_role"
  BEFORE INSERT OR UPDATE OF "roleDefinitionId", "role_scope" ON "core"."plant_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."require_sealed_role_definition_for_assignment"();

COMMIT;
