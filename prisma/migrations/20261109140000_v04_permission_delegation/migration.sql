BEGIN;

-- Permission definitions remain immutable. Delegation classification is a
-- separate owner-controlled policy table and is false by default.
CREATE TABLE "core"."permission_delegation_policy" (
  "permission_definition_id" UUID PRIMARY KEY
    REFERENCES "core"."permission_definition"("id") ON DELETE RESTRICT,
  "is_delegable" BOOLEAN NOT NULL DEFAULT FALSE,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "permission_delegation_policy_approval_check"
    CHECK (NOT "is_delegable" OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL))
);

INSERT INTO "core"."permission_delegation_policy"
  ("permission_definition_id", "is_delegable", "approved_at", "approved_by")
SELECT "id", FALSE, NULL, NULL
FROM "core"."permission_definition";

COMMENT ON TABLE "core"."permission_delegation_policy"
  IS 'Owner-controlled custom-role delegation classification. Runtime role is read-only; permission_definition remains immutable.';

COMMIT;
