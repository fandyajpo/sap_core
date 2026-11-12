BEGIN;

-- Stage A: nullable expansion. Existing Organizations require owner-confirmed
-- names before the separate NOT NULL contract migration can be approved.
ALTER TABLE "core"."organization"
  ADD COLUMN "name" VARCHAR(160);

CREATE TABLE "core"."organization_lifecycle_audit" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "outcome" VARCHAR(16) NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_lifecycle_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_lifecycle_audit_event_type_check"
    CHECK ("event_type" = 'ORGANIZATION_CREATED'),
  CONSTRAINT "organization_lifecycle_audit_outcome_check"
    CHECK ("outcome" = 'SUCCESS'),
  CONSTRAINT "organization_lifecycle_audit_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "core"."organization"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "organization_lifecycle_audit_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "core"."user"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "organization_lifecycle_audit_organization_id_occurred_at_idx"
  ON "core"."organization_lifecycle_audit"("organization_id", "occurred_at");
CREATE INDEX "organization_lifecycle_audit_actor_user_id_occurred_at_idx"
  ON "core"."organization_lifecycle_audit"("actor_user_id", "occurred_at");

ALTER TABLE "core"."organization_lifecycle_audit" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organization_lifecycle_audit_bootstrap_insert"
  ON "core"."organization_lifecycle_audit"
  FOR INSERT
  WITH CHECK (
    "organization_id"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND "actor_user_id" = NULLIF(current_setting('app.user_id', true), '')
  );

CREATE FUNCTION "core"."prevent_organization_lifecycle_audit_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Organization lifecycle audit records are append-only.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "organization_lifecycle_audit_append_only"
  BEFORE UPDATE OR DELETE ON "core"."organization_lifecycle_audit"
  FOR EACH ROW EXECUTE FUNCTION "core"."prevent_organization_lifecycle_audit_mutation"();

COMMIT;
