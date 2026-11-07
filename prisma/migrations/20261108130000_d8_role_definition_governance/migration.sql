BEGIN;

-- The approved preflight inventory is empty, so no ownership or family backfill is needed.
-- Role ownership is validated through Core service transactions; ownerOrganizationId has no FK.
ALTER TABLE "core"."role_definition"
  ADD COLUMN "role_family_id" UUID,
  ADD CONSTRAINT "role_definition_version_positive_check"
    CHECK ("version" > 0),
  ADD CONSTRAINT "role_definition_ownership_check"
    CHECK (
      ("kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        AND "ownerOrganizationId" IS NULL
        AND "role_family_id" IS NULL)
      OR
      ("kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
        AND "ownerOrganizationId" IS NOT NULL
        AND "role_family_id" IS NOT NULL
        AND "scope" <> 'PLATFORM'::"core"."RoleScope")
    );

CREATE UNIQUE INDEX "role_definition_role_family_version_key"
  ON "core"."role_definition"("role_family_id", "version");

-- Advisory locking serializes family creation/revision writers. The database backstop
-- requires the first version to be 1, each later version to be contiguous, and ownership
-- to remain stable across the family, even when callers bypass the service.
CREATE FUNCTION "core"."enforce_role_definition_family_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_version INTEGER;
  owner_mismatch BOOLEAN;
BEGIN
  IF NEW."kind" <> 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind" THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW."role_family_id"::text, 0));

  SELECT COALESCE(MAX("version"), 0),
         COALESCE(BOOL_OR("ownerOrganizationId" IS DISTINCT FROM NEW."ownerOrganizationId"), FALSE)
    INTO latest_version, owner_mismatch
    FROM "core"."role_definition"
   WHERE "role_family_id" = NEW."role_family_id";

  IF owner_mismatch THEN
    RAISE EXCEPTION 'A custom Role Definition family cannot change Organization owner.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."version" <> latest_version + 1 THEN
    RAISE EXCEPTION 'Custom Role Definition versions must be contiguous and monotonic.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "role_definition_family_version_guard"
  BEFORE INSERT ON "core"."role_definition"
  FOR EACH ROW EXECUTE FUNCTION "core"."enforce_role_definition_family_version"();

-- Revision fields are immutable. disabled_at and updated_at retain their existing
-- lifecycle meaning and remain outside the revision payload; no disable API is added.
CREATE FUNCTION "core"."protect_custom_role_definition_revision"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind" THEN
      RAISE EXCEPTION 'Organization custom Role Definition revisions cannot be deleted.'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
     AND (to_jsonb(NEW) - 'disabled_at' - 'updated_at')
         IS DISTINCT FROM (to_jsonb(OLD) - 'disabled_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Organization custom Role Definition revisions are immutable.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "custom_role_definition_revision_immutable"
  BEFORE UPDATE OR DELETE ON "core"."role_definition"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_custom_role_definition_revision"();

-- IDs in this audit table are application-validated Core references; D8 does not add
-- an ownerOrganizationId FK or infer additional P05 relationship edges.
CREATE TABLE "core"."role_definition_audit" (
  "id" UUID NOT NULL,
  "role_family_id" UUID NOT NULL,
  "role_definition_id" UUID NOT NULL,
  "owner_organization_id" UUID NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "event_type" VARCHAR(8) NOT NULL,
  "version" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "scope" "core"."RoleScope" NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_definition_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_definition_audit_event_type_check"
    CHECK ("event_type" IN ('CREATE', 'REVISE')),
  CONSTRAINT "role_definition_audit_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "role_definition_audit_scope_check"
    CHECK ("scope" <> 'PLATFORM'::"core"."RoleScope")
);

CREATE INDEX "role_definition_audit_owner_organization_id_occurred_at_idx"
  ON "core"."role_definition_audit"("owner_organization_id", "occurred_at");
CREATE INDEX "role_definition_audit_role_family_id_version_idx"
  ON "core"."role_definition_audit"("role_family_id", "version");

CREATE FUNCTION "core"."protect_role_definition_audit_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Role Definition audit history is append-only.' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "role_definition_audit_append_only"
  BEFORE UPDATE OR DELETE ON "core"."role_definition_audit"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_role_definition_audit_history"();

COMMIT;
