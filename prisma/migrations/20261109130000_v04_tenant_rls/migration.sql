BEGIN;

-- Tenant RLS is defense-in-depth for the non-owner runtime role. The migration
-- owner remains the table owner and is used only for schema/migration work.
-- Tenant context is installed with transaction-local set_config(..., true).
-- Better Auth identity tables and the global permission catalog intentionally
-- remain outside this first tenant-policy increment.

ALTER TABLE "core"."organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."plant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."organization_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."company_membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."plant_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."organization_role_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."company_role_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."plant_role_assignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."role_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."role_permission_grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."role_definition_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."break_glass_access_audit" ENABLE ROW LEVEL SECURITY;

-- Organization is the root tenant selector. An absent or malformed setting
-- matches no UUID text and therefore returns no tenant rows.
CREATE POLICY "organization_tenant_context"
  ON "core"."organization"
  FOR ALL
  USING ("id"::text = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("id"::text = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY "company_tenant_context"
  ON "core"."company"
  FOR ALL
  USING (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "id"::text = NULLIF(current_setting('app.company_id', true), '')
    )
  )
  WITH CHECK (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "id"::text = NULLIF(current_setting('app.company_id', true), '')
    )
  );

CREATE POLICY "plant_tenant_context"
  ON "core"."plant"
  FOR ALL
  USING (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
    AND (
      NULLIF(current_setting('app.plant_id', true), '') IS NULL
      OR "id"::text = NULLIF(current_setting('app.plant_id', true), '')
    )
  )
  WITH CHECK (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
    AND (
      NULLIF(current_setting('app.plant_id', true), '') IS NULL
      OR "id"::text = NULLIF(current_setting('app.plant_id', true), '')
    )
  );

-- Membership bootstrap: before an Organization context exists, the verified
-- actor may resolve only their own ACTIVE Organization membership. Once the
-- Organization is validated and its GUC is installed, tenant administrators
-- and member-list operations can see rows belonging to that Organization.
CREATE POLICY "organization_membership_actor_bootstrap"
  ON "core"."organization_membership"
  FOR SELECT
  USING (
    (
      "userId" = NULLIF(current_setting('app.user_id', true), '')
      AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
    )
    OR "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "organization_membership_tenant_write"
  ON "core"."organization_membership"
  FOR ALL
  USING ("organizationId"::text = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId"::text = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY "company_membership_tenant_context"
  ON "core"."company_membership"
  FOR ALL
  USING (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
  )
  WITH CHECK (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
  );

CREATE POLICY "plant_assignment_tenant_context"
  ON "core"."plant_assignment"
  FOR ALL
  USING (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
    AND (
      NULLIF(current_setting('app.plant_id', true), '') IS NULL
      OR "plantId"::text = NULLIF(current_setting('app.plant_id', true), '')
    )
  )
  WITH CHECK (
    "organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR "companyId"::text = NULLIF(current_setting('app.company_id', true), '')
    )
    AND (
      NULLIF(current_setting('app.plant_id', true), '') IS NULL
      OR "plantId"::text = NULLIF(current_setting('app.plant_id', true), '')
    )
  );

-- Assignment rows are visible only when their typed parent is visible under
-- the already-installed actor/tenant context. No scope inheritance is added.
CREATE POLICY "organization_role_assignment_tenant_context"
  ON "core"."organization_role_assignment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "core"."organization_membership" om
      WHERE om."id" = "organization_role_assignment"."organizationMembershipId"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "core"."organization_membership" om
      WHERE om."id" = "organization_role_assignment"."organizationMembershipId"
    )
  );

CREATE POLICY "company_role_assignment_tenant_context"
  ON "core"."company_role_assignment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "core"."company_membership" cm
      WHERE cm."id" = "company_role_assignment"."companyMembershipId"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "core"."company_membership" cm
      WHERE cm."id" = "company_role_assignment"."companyMembershipId"
    )
  );

CREATE POLICY "plant_role_assignment_tenant_context"
  ON "core"."plant_role_assignment"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "core"."plant_assignment" pa
      WHERE pa."id" = "plant_role_assignment"."plantAssignmentId"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "core"."plant_assignment" pa
      WHERE pa."id" = "plant_role_assignment"."plantAssignmentId"
    )
  );

-- Built-in SYSTEM role definitions are a global read-only catalog. Custom
-- definitions are visible only inside their owning Organization.
CREATE POLICY "role_definition_read"
  ON "core"."role_definition"
  FOR SELECT
  USING (
    "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
    OR "ownerOrganizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "role_definition_custom_insert"
  ON "core"."role_definition"
  FOR INSERT
  WITH CHECK (
    "kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
    AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
    AND "ownerOrganizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "role_definition_custom_update"
  ON "core"."role_definition"
  FOR UPDATE
  USING (
    "kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
    AND "ownerOrganizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
  )
  WITH CHECK (
    "kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
    AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
    AND "ownerOrganizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
  );

CREATE POLICY "role_permission_grant_read"
  ON "core"."role_permission_grant"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "core"."role_definition" rd
      WHERE rd."id" = "role_permission_grant"."role_definition_id"
    )
  );

CREATE POLICY "role_permission_grant_unsealed_custom_insert"
  ON "core"."role_permission_grant"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "core"."role_definition" rd
      WHERE rd."id" = "role_permission_grant"."role_definition_id"
        AND rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
        AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND rd."ownerOrganizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
        AND rd."permissions_locked_at" IS NULL
    )
  );

CREATE POLICY "role_definition_audit_tenant_context"
  ON "core"."role_definition_audit"
  FOR ALL
  USING ("owner_organization_id"::text = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("owner_organization_id"::text = NULLIF(current_setting('app.organization_id', true), ''));

-- Break-glass remains disabled by policy v0.1. Historical audit rows are
-- scoped by their persisted Organization/Company/Plant parent, never by a
-- client-supplied scope identifier alone.
CREATE POLICY "break_glass_access_audit_tenant_read"
  ON "core"."break_glass_access_audit"
  FOR SELECT
  USING (
    (
      "scope" = 'ORGANIZATION'::"core"."RoleScope"
      AND "scopeParentId"::text = NULLIF(current_setting('app.organization_id', true), '')
      AND NULLIF(current_setting('app.company_id', true), '') IS NULL
    )
    OR (
      "scope" = 'COMPANY'::"core"."RoleScope"
      AND EXISTS (
        SELECT 1 FROM "core"."company" c
        WHERE c."id" = "break_glass_access_audit"."scopeParentId"
          AND c."organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
          AND (
            NULLIF(current_setting('app.company_id', true), '') IS NULL
            OR c."id"::text = NULLIF(current_setting('app.company_id', true), '')
          )
          AND NULLIF(current_setting('app.plant_id', true), '') IS NULL
      )
    )
    OR (
      "scope" = 'PLANT'::"core"."RoleScope"
      AND EXISTS (
        SELECT 1 FROM "core"."plant" p
        WHERE p."id" = "break_glass_access_audit"."scopeParentId"
          AND p."organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
          AND (
            NULLIF(current_setting('app.company_id', true), '') IS NULL
            OR p."companyId"::text = NULLIF(current_setting('app.company_id', true), '')
          )
          AND (
            NULLIF(current_setting('app.plant_id', true), '') IS NULL
            OR p."id"::text = NULLIF(current_setting('app.plant_id', true), '')
          )
      )
    )
  );

CREATE POLICY "break_glass_access_audit_tenant_insert"
  ON "core"."break_glass_access_audit"
  FOR INSERT
  WITH CHECK (
    (
      "scope" = 'ORGANIZATION'::"core"."RoleScope"
      AND "scopeParentId"::text = NULLIF(current_setting('app.organization_id', true), '')
      AND NULLIF(current_setting('app.company_id', true), '') IS NULL
    )
    OR (
      "scope" = 'COMPANY'::"core"."RoleScope"
      AND EXISTS (
        SELECT 1 FROM "core"."company" c
        WHERE c."id" = "break_glass_access_audit"."scopeParentId"
          AND c."organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
          AND (
            NULLIF(current_setting('app.company_id', true), '') IS NULL
            OR c."id"::text = NULLIF(current_setting('app.company_id', true), '')
          )
          AND NULLIF(current_setting('app.plant_id', true), '') IS NULL
      )
    )
    OR (
      "scope" = 'PLANT'::"core"."RoleScope"
      AND EXISTS (
        SELECT 1 FROM "core"."plant" p
        WHERE p."id" = "break_glass_access_audit"."scopeParentId"
          AND p."organizationId"::text = NULLIF(current_setting('app.organization_id', true), '')
          AND (
            NULLIF(current_setting('app.company_id', true), '') IS NULL
            OR p."companyId"::text = NULLIF(current_setting('app.company_id', true), '')
          )
          AND (
            NULLIF(current_setting('app.plant_id', true), '') IS NULL
            OR p."id"::text = NULLIF(current_setting('app.plant_id', true), '')
          )
      )
    )
  );

COMMIT;
