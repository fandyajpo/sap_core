BEGIN;

CREATE TYPE "core"."DenyAuditEventType" AS ENUM (
  'POLICY_CREATED',
  'POLICY_REVOKED',
  'POLICY_READ',
  'POLICY_READ_DENIED',
  'POLICY_WRITE_DENIED',
  'POLICY_ENFORCEMENT_DENIED'
);

CREATE TYPE "core"."DenyAuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

CREATE TABLE "core"."tenant_deny_policy" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "target_membership_id" UUID NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "permission_definition_id" UUID NOT NULL,
  "scope" "core"."RoleScope" NOT NULL,
  "company_id" UUID,
  "plant_id" UUID,
  "reason" TEXT NOT NULL,
  "issued_by_user_id" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by_user_id" TEXT,
  "revoke_reason" TEXT,
  CONSTRAINT "tenant_deny_policy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_deny_policy_reason_nonempty_check"
    CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "tenant_deny_policy_revoke_consistency_check"
    CHECK (
      ("revoked_at" IS NULL AND "revoked_by_user_id" IS NULL AND "revoke_reason" IS NULL)
      OR
      ("revoked_at" IS NOT NULL AND "revoked_by_user_id" IS NOT NULL AND length(btrim("revoke_reason")) > 0)
    ),
  CONSTRAINT "tenant_deny_policy_expiry_check"
    CHECK ("expires_at" IS NULL OR "expires_at" > "issued_at"),
  CONSTRAINT "tenant_deny_policy_exact_scope_check"
    CHECK (
      ("scope" = 'ORGANIZATION'::"core"."RoleScope" AND "company_id" IS NULL AND "plant_id" IS NULL)
      OR
      ("scope" = 'COMPANY'::"core"."RoleScope" AND "company_id" IS NOT NULL AND "plant_id" IS NULL)
      OR
      ("scope" = 'PLANT'::"core"."RoleScope" AND "company_id" IS NOT NULL AND "plant_id" IS NOT NULL)
    ),
  CONSTRAINT "tenant_deny_policy_membership_fkey"
    FOREIGN KEY ("target_membership_id", "target_user_id", "organization_id")
    REFERENCES "core"."organization_membership" ("id", "userId", "organizationId")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_permission_fkey"
    FOREIGN KEY ("permission_definition_id")
    REFERENCES "core"."permission_definition" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_issuer_fkey"
    FOREIGN KEY ("issued_by_user_id") REFERENCES "core"."user" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_revoker_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "core"."user" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "core"."company" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_plant_id_fkey"
    FOREIGN KEY ("plant_id") REFERENCES "core"."plant" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_company_fkey"
    FOREIGN KEY ("organization_id", "company_id")
    REFERENCES "core"."company" ("organizationId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_policy_plant_fkey"
    FOREIGN KEY ("organization_id", "company_id", "plant_id")
    REFERENCES "core"."plant" ("organizationId", "companyId", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX "tenant_deny_policy_org_membership_issued_idx"
  ON "core"."tenant_deny_policy" ("organization_id", "target_membership_id", "issued_at");
CREATE INDEX "tenant_deny_policy_target_permission_idx"
  ON "core"."tenant_deny_policy" ("target_membership_id", "scope", "company_id", "plant_id", "permission_definition_id");
CREATE INDEX "tenant_deny_policy_active_lookup_idx"
  ON "core"."tenant_deny_policy" ("organization_id", "target_membership_id", "scope", "company_id", "plant_id", "permission_definition_id")
  WHERE "revoked_at" IS NULL;

-- Validate the target membership lifecycle and approved permission/scope
-- compatibility at the persistence boundary as well as in the service.
CREATE FUNCTION "core"."validate_tenant_deny_policy_insert"()
RETURNS trigger LANGUAGE plpgsql AS $
DECLARE
  target_status "core"."OrganizationMembershipStatus";
  permission_code TEXT;
BEGIN
  SELECT "status" INTO target_status
  FROM "core"."organization_membership"
  WHERE "id" = NEW."target_membership_id"
    AND "userId" = NEW."target_user_id"
    AND "organizationId" = NEW."organization_id"
  FOR SHARE;

  IF NOT FOUND OR target_status NOT IN (
    'ACTIVE'::"core"."OrganizationMembershipStatus",
    'SUSPENDED'::"core"."OrganizationMembershipStatus"
  ) THEN
    RAISE EXCEPTION 'DENY policy target must be an active or suspended membership in the same Organization.'
      USING ERRCODE = '23514';
  END IF;

  SELECT "code" INTO permission_code
  FROM "core"."permission_definition"
  WHERE "id" = NEW."permission_definition_id";

  IF permission_code NOT IN (
    'organization.read', 'organization.update',
    'organization.members.read', 'organization.members.manage',
    'company.read', 'company.manage', 'company.members.manage',
    'plant.read', 'plant.manage', 'plant.assignments.manage',
    'roles.read', 'roles.create', 'roles.revise', 'roles.assign'
  ) THEN
    RAISE EXCEPTION 'Permission is not DENY-eligible under the approved first-iteration allowlist.'
      USING ERRCODE = '23514';
  END IF;

  IF (
    permission_code LIKE 'organization.%'
    OR permission_code IN ('roles.create', 'roles.revise')
  ) AND NEW."scope" <> 'ORGANIZATION'::"core"."RoleScope" THEN
    RAISE EXCEPTION 'Permission is incompatible with the requested exact DENY scope.'
      USING ERRCODE = '23514';
  ELSIF permission_code LIKE 'company.%'
    AND NEW."scope" <> 'COMPANY'::"core"."RoleScope" THEN
    RAISE EXCEPTION 'Permission is incompatible with the requested exact DENY scope.'
      USING ERRCODE = '23514';
  ELSIF permission_code LIKE 'plant.%'
    AND NEW."scope" NOT IN ('COMPANY'::"core"."RoleScope", 'PLANT'::"core"."RoleScope") THEN
    RAISE EXCEPTION 'Permission is incompatible with the requested exact DENY scope.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$;

CREATE TRIGGER "tenant_deny_policy_insert_guard"
  BEFORE INSERT ON "core"."tenant_deny_policy"
  FOR EACH ROW EXECUTE FUNCTION "core"."validate_tenant_deny_policy_insert"();

CREATE TABLE "core"."tenant_deny_audit_event" (
  "id" UUID NOT NULL,
  "policy_id" UUID,
  "organization_id" UUID,
  "target_membership_id" UUID,
  "target_user_id" TEXT,
  "permission_definition_id" UUID,
  "scope" "core"."RoleScope",
  "company_id" UUID,
  "plant_id" UUID,
  "actor_user_id" TEXT,
  "event_type" "core"."DenyAuditEventType" NOT NULL,
  "outcome" "core"."DenyAuditOutcome" NOT NULL,
  "reason" TEXT,
  "reason_code" VARCHAR(64),
  "request_id" VARCHAR(128),
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_deny_audit_event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_deny_audit_event_policy_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "core"."tenant_deny_policy" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_audit_event_actor_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "core"."user" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_audit_event_permission_fkey"
    FOREIGN KEY ("permission_definition_id") REFERENCES "core"."permission_definition" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "tenant_deny_audit_event_scope_check"
    CHECK (
      "scope" IS NULL
      OR ("scope" = 'ORGANIZATION'::"core"."RoleScope" AND "company_id" IS NULL AND "plant_id" IS NULL)
      OR ("scope" = 'COMPANY'::"core"."RoleScope" AND "company_id" IS NOT NULL AND "plant_id" IS NULL)
      OR ("scope" = 'PLANT'::"core"."RoleScope" AND "company_id" IS NOT NULL AND "plant_id" IS NOT NULL)
    )
);

CREATE INDEX "tenant_deny_audit_event_org_occurred_idx"
  ON "core"."tenant_deny_audit_event" ("organization_id", "occurred_at");
CREATE INDEX "tenant_deny_audit_event_policy_occurred_idx"
  ON "core"."tenant_deny_audit_event" ("policy_id", "occurred_at");
CREATE INDEX "tenant_deny_audit_event_actor_occurred_idx"
  ON "core"."tenant_deny_audit_event" ("actor_user_id", "occurred_at");

-- Audit events are append-only, including for application and owner roles.
CREATE FUNCTION "core"."protect_tenant_deny_audit_event"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DENY audit events are append-only and cannot be updated or deleted.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "tenant_deny_audit_event_append_only"
  BEFORE UPDATE OR DELETE ON "core"."tenant_deny_audit_event"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_tenant_deny_audit_event"();

-- A policy may only transition once from unrevoked to revoked. All other
-- policy attributes remain immutable; expiry is evaluated against DB time.
CREATE FUNCTION "core"."protect_tenant_deny_policy_lifecycle"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DENY policy records are historical evidence and cannot be deleted.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD."revoked_at" IS NOT NULL
     OR NEW."revoked_at" IS NULL
     OR NEW."revoked_by_user_id" IS NULL
     OR NEW."revoke_reason" IS NULL
     OR length(btrim(NEW."revoke_reason")) = 0
     OR (to_jsonb(NEW) - 'revoked_at' - 'revoked_by_user_id' - 'revoke_reason')
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'revoked_at' - 'revoked_by_user_id' - 'revoke_reason') THEN
    RAISE EXCEPTION 'DENY policy records are immutable except for one attributable revocation transition.'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "tenant_deny_policy_lifecycle_guard"
  BEFORE UPDATE OR DELETE ON "core"."tenant_deny_policy"
  FOR EACH ROW EXECUTE FUNCTION "core"."protect_tenant_deny_policy_lifecycle"();

COMMIT;
