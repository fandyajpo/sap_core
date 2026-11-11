BEGIN;

-- DENY policy and audit tables were introduced after the initial tenant-RLS
-- migration. Keep their rows isolated by the validated Organization context.
-- Owner-only policy management remains enforced by the service authorization
-- layer; these policies provide the database tenant boundary.
ALTER TABLE "core"."tenant_deny_policy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."tenant_deny_audit_event" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_deny_policy_organization_context"
  ON "core"."tenant_deny_policy"
  FOR ALL
  USING (
    "organization_id"::text = NULLIF(current_setting('app.organization_id', true), '')
  )
  WITH CHECK (
    "organization_id"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "tenant_deny_audit_event_organization_read"
  ON "core"."tenant_deny_audit_event"
  FOR SELECT
  USING (
    "organization_id"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "tenant_deny_audit_event_organization_insert"
  ON "core"."tenant_deny_audit_event"
  FOR INSERT
  WITH CHECK (
    "organization_id"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

COMMIT;
