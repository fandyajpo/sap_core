BEGIN;

-- SYSTEM role definitions are globally SELECT-visible but intentionally not
-- UPDATE-visible under tenant RLS. SELECT ... FOR SHARE requires the row to
-- pass UPDATE policy checks, so it hides SYSTEM definitions from ordinary
-- tenant runtime roles. These catalog rows are immutable to tenant runtime
-- roles; only owner-scoped custom definitions need the concurrency lock.
CREATE OR REPLACE FUNCTION "core"."require_sealed_role_definition_for_assignment"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  locked_at TIMESTAMPTZ(6);
  role_kind "core"."RoleDefinitionKind";
BEGIN
  SELECT "permissions_locked_at", "kind"
    INTO locked_at, role_kind
    FROM "core"."role_definition"
   WHERE "id" = NEW."roleDefinitionId"
     AND "scope" = NEW."role_scope";

  IF NOT FOUND OR locked_at IS NULL THEN
    RAISE EXCEPTION 'Role assignments require a sealed Role Definition permission snapshot.'
      USING ERRCODE = '23514';
  END IF;

  IF role_kind = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind" THEN
    PERFORM 1
      FROM "core"."role_definition"
     WHERE "id" = NEW."roleDefinitionId"
       AND "scope" = NEW."role_scope"
       AND "kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
     FOR SHARE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The Organization custom Role Definition is no longer visible for assignment.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
