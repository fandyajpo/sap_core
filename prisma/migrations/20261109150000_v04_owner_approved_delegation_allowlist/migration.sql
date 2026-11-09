BEGIN;

-- Approved by the project owner in the conversation on 2026-11-09.
-- Keep this allowlist intentionally narrow: read-only discovery permissions
-- only. Administrative, membership, assignment, role mutation, and audit
-- permissions remain non-delegable.
DO $$
DECLARE
  expected_count INTEGER;
  matched_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO expected_count
  FROM "core"."permission_definition"
  WHERE "code" IN (
    'organization.read',
    'company.read',
    'plant.read',
    'roles.read'
  );

  IF expected_count <> 4 THEN
    RAISE EXCEPTION 'Expected all four owner-approved delegable permissions to exist; found %.', expected_count;
  END IF;

  SELECT COUNT(*) INTO matched_count
  FROM "core"."permission_delegation_policy" dp
  JOIN "core"."permission_definition" pd
    ON pd."id" = dp."permission_definition_id"
  WHERE dp."is_delegable" = TRUE;

  IF matched_count <> 0 THEN
    RAISE EXCEPTION 'Expected a fail-closed delegation policy before applying owner approval; found % enabled rows.', matched_count;
  END IF;
END;
$$;

UPDATE "core"."permission_delegation_policy" dp
SET
  "is_delegable" = TRUE,
  "approved_at" = NOW(),
  "approved_by" = 'project-owner-approval:2026-11-09',
  "updated_at" = NOW()
FROM "core"."permission_definition" pd
WHERE pd."id" = dp."permission_definition_id"
  AND pd."code" IN (
    'organization.read',
    'company.read',
    'plant.read',
    'roles.read'
  );

DO $$
DECLARE
  enabled_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO enabled_count
  FROM "core"."permission_delegation_policy"
  WHERE "is_delegable" = TRUE;

  IF enabled_count <> 4 THEN
    RAISE EXCEPTION 'Expected exactly four approved delegable permissions; found %.', enabled_count;
  END IF;
END;
$$;

COMMIT;
