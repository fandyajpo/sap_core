BEGIN;

-- Delegation is an explicit trusted catalog capability. No permission is
-- delegable by default until the owner approves its policy classification.
ALTER TABLE "core"."permission_definition"
  ADD COLUMN "is_delegable" BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN "core"."permission_definition"."is_delegable"
  IS 'Whether an Organization custom-role creator may delegate this permission; defaults to deny until owner-approved.';

COMMIT;
