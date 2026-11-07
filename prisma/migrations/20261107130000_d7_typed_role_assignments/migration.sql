-- PostgreSQL makes a newly added enum value usable only after this statement commits.
-- Keep it outside the transaction that uses PLATFORM, and make retries safe if a later
-- statement in the migration fails.
ALTER TYPE "core"."RoleScope" ADD VALUE IF NOT EXISTS 'PLATFORM';

BEGIN;

-- A role definition must have a unique scope-qualified key so each typed assignment
-- can use a composite FK to reject cross-scope role definitions.
CREATE UNIQUE INDEX "role_definition_id_scope_key"
  ON "core"."role_definition"("id", "scope");

ALTER TABLE "core"."organization_role_assignment"
  ADD COLUMN "role_scope" "core"."RoleScope" NOT NULL DEFAULT 'ORGANIZATION',
  ADD COLUMN "grant_actor_user_id" TEXT,
  ADD COLUMN "is_break_glass" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "break_glass_reason" TEXT,
  ADD CONSTRAINT "organization_role_assignment_scope_check"
    CHECK ("role_scope" = 'ORGANIZATION'::"core"."RoleScope"),
  ADD CONSTRAINT "organization_role_assignment_break_glass_check"
    CHECK (NOT "is_break_glass" OR (
      "grant_actor_user_id" IS NOT NULL
      AND NULLIF(BTRIM("break_glass_reason"), '') IS NOT NULL
    ));

ALTER TABLE "core"."company_role_assignment"
  ADD COLUMN "role_scope" "core"."RoleScope" NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "grant_actor_user_id" TEXT,
  ADD COLUMN "is_break_glass" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "break_glass_reason" TEXT,
  ADD CONSTRAINT "company_role_assignment_scope_check"
    CHECK ("role_scope" = 'COMPANY'::"core"."RoleScope"),
  ADD CONSTRAINT "company_role_assignment_break_glass_check"
    CHECK (NOT "is_break_glass" OR (
      "grant_actor_user_id" IS NOT NULL
      AND NULLIF(BTRIM("break_glass_reason"), '') IS NOT NULL
    ));

ALTER TABLE "core"."plant_role_assignment"
  ADD COLUMN "role_scope" "core"."RoleScope" NOT NULL DEFAULT 'PLANT',
  ADD COLUMN "grant_actor_user_id" TEXT,
  ADD COLUMN "is_break_glass" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "break_glass_reason" TEXT,
  ADD CONSTRAINT "plant_role_assignment_scope_check"
    CHECK ("role_scope" = 'PLANT'::"core"."RoleScope"),
  ADD CONSTRAINT "plant_role_assignment_break_glass_check"
    CHECK (NOT "is_break_glass" OR (
      "grant_actor_user_id" IS NOT NULL
      AND NULLIF(BTRIM("break_glass_reason"), '') IS NOT NULL
    ));

ALTER TABLE "core"."organization_role_assignment"
  DROP CONSTRAINT "organization_role_assignment_roleDefinitionId_fkey",
  ADD CONSTRAINT "organization_role_assignment_role_definition_scope_fkey"
    FOREIGN KEY ("roleDefinitionId", "role_scope")
    REFERENCES "core"."role_definition"("id", "scope")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "core"."company_role_assignment"
  DROP CONSTRAINT "company_role_assignment_roleDefinitionId_fkey",
  ADD CONSTRAINT "company_role_assignment_role_definition_scope_fkey"
    FOREIGN KEY ("roleDefinitionId", "role_scope")
    REFERENCES "core"."role_definition"("id", "scope")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "core"."plant_role_assignment"
  DROP CONSTRAINT "plant_role_assignment_roleDefinitionId_fkey",
  ADD CONSTRAINT "plant_role_assignment_role_definition_scope_fkey"
    FOREIGN KEY ("roleDefinitionId", "role_scope")
    REFERENCES "core"."role_definition"("id", "scope")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- The typed parent FKs already present on each assignment table remain RESTRICT.
-- Role-assignment identity, scope, parent, definition, and grant metadata are
-- immutable; only the first revocation timestamp may be added. History is never deleted.
CREATE FUNCTION "core"."protect_role_assignment_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Role Assignment history cannot be deleted.' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at') THEN
    RAISE EXCEPTION 'Role Assignment identity and grant details are immutable.' USING ERRCODE = '55000';
  END IF;

  IF OLD."revoked_at" IS NOT NULL AND NEW."revoked_at" IS DISTINCT FROM OLD."revoked_at" THEN
    RAISE EXCEPTION 'Role Assignment revocation is terminal.' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "organization_role_assignment_history_guard"
  BEFORE UPDATE OR DELETE ON "core"."organization_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_assignment_history"();
CREATE TRIGGER "company_role_assignment_history_guard"
  BEFORE UPDATE OR DELETE ON "core"."company_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_assignment_history"();
CREATE TRIGGER "plant_role_assignment_history_guard"
  BEFORE UPDATE OR DELETE ON "core"."plant_role_assignment"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_assignment_history"();

CREATE FUNCTION "core"."protect_role_definition_id"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'Role Definition primary keys are immutable.' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_definition_id_immutable"
  BEFORE UPDATE OF "id" ON "core"."role_definition"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_definition_id"();

-- D7 break-glass use is an auditable event. IDs are application-validated because
-- D7/D14 do not approve additional P05 FK edges for the audit actor or target.
CREATE TABLE "core"."break_glass_access_audit" (
  "id" UUID NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "role_assignment_id" UUID NOT NULL,
  "scope" "core"."RoleScope" NOT NULL,
  "scope_parent_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "break_glass_access_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "break_glass_access_audit_reason_check"
    CHECK (NULLIF(BTRIM("reason"), '') IS NOT NULL),
  CONSTRAINT "break_glass_access_audit_scope_check"
    CHECK ("scope" IN ('ORGANIZATION'::"core"."RoleScope", 'COMPANY'::"core"."RoleScope", 'PLANT'::"core"."RoleScope"))
);

CREATE INDEX "break_glass_access_audit_actor_user_id_occurred_at_idx"
  ON "core"."break_glass_access_audit"("actor_user_id", "occurred_at");
CREATE INDEX "break_glass_access_audit_role_assignment_id_idx"
  ON "core"."break_glass_access_audit"("role_assignment_id");
CREATE INDEX "break_glass_access_audit_scope_scope_parent_id_occurred_at_idx"
  ON "core"."break_glass_access_audit"("scope", "scope_parent_id", "occurred_at");

CREATE FUNCTION "core"."protect_break_glass_audit_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Break-glass access audit history is append-only.' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "break_glass_access_audit_append_only"
  BEFORE UPDATE OR DELETE ON "core"."break_glass_access_audit"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_break_glass_audit_history"();

COMMIT;
