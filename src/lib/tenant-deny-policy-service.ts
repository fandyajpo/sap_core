import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";
import { resolveTenantTargetContext } from "@/lib/tenant-target-context";
import type { TenantScopeRequest } from "@/lib/tenant-scope-types";

const denyEligiblePermissions = new Set([
  "organization.read",
  "organization.update",
  "organization.members.read",
  "organization.members.manage",
  "company.read",
  "company.manage",
  "company.members.manage",
  "plant.read",
  "plant.manage",
  "plant.assignments.manage",
  "roles.read",
  "roles.create",
  "roles.revise",
  "roles.assign",
]);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TenantDenyPolicyError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" | "UNAUTHENTICATED",
    message: string,
  ) {
    super(message);
    this.name = "TenantDenyPolicyError";
  }
}

type Session = Awaited<ReturnType<typeof getCurrentSession>>;

async function resolveOwnerContext(
  tx: Prisma.TransactionClient,
  session: Session,
  organizationId: string,
) {
  if (!session?.session?.id || !session.user?.id) {
    throw new TenantDenyPolicyError("UNAUTHENTICATED", "A verified session is required.");
  }

  await lockVerifiedSessionRow(
    (statement, values = []) => tx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values),
    { sessionId: session.session.id, userId: session.user.id },
  );

  await tx.$queryRaw`SELECT set_config('app.user_id', ${session.user.id}, true)`;

  const request: TenantScopeRequest = { kind: "ORGANIZATION", organizationId };
  const context = await resolveTenantTargetContext(tx, session, request);

  await tx.$queryRaw`
    SELECT set_config('app.organization_id', ${context.organizationId}, true),
      set_config('app.company_id', '', true),
      set_config('app.plant_id', '', true)
  `;

  const owners = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT ra."id"::text AS "id"
    FROM "core"."organization_role_assignment" ra
    JOIN "core"."role_definition" rd
      ON rd."id" = ra."roleDefinitionId"
     AND rd."scope" = ra."role_scope"
     AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
     AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
     AND rd."code" = 'ORG_OWNER'
     AND rd."disabled_at" IS NULL
     AND rd."permissions_locked_at" IS NOT NULL
    WHERE ra."organizationMembershipId" = ${context.organizationMembershipId}::uuid
      AND ra."revoked_at" IS NULL
      AND ra."is_break_glass" = FALSE
    -- Lock the mutable assignment, not the immutable SYSTEM catalog row.
    -- SELECT ... FOR SHARE on role_definition also requires UPDATE-policy
    -- visibility, which SYSTEM definitions intentionally do not have under RLS.
    FOR SHARE OF ra
  `;

  if (!owners[0]) {
    throw new TenantDenyPolicyError("FORBIDDEN", "Only an active ORG_OWNER may manage or read DENY policies.");
  }

  return context;
}


function permissionFitsDenyScope(permissionCode: string, scope: "ORGANIZATION" | "COMPANY" | "PLANT"): boolean {
  if (permissionCode.startsWith("organization.") || permissionCode === "roles.create" || permissionCode === "roles.revise") {
    return scope === "ORGANIZATION";
  }
  if (permissionCode.startsWith("company.")) return scope === "COMPANY";
  if (permissionCode.startsWith("plant.")) return scope === "COMPANY" || scope === "PLANT";
  return permissionCode === "roles.read" || permissionCode === "roles.assign";
}

function requireReason(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 4000) {
    throw new TenantDenyPolicyError("INVALID_INPUT", `${label} must contain 1–4000 characters.`);
  }
  return value.trim();
}

export interface CreateTenantDenyPolicyInput {
  targetMembershipId: string;
  permissionCode: string;
  scope: "ORGANIZATION" | "COMPANY" | "PLANT";
  companyId?: string;
  plantId?: string;
  reason: string;
  expiresAt?: string | null;
}

export async function createTenantDenyPolicy(
  organizationId: string,
  input: CreateTenantDenyPolicyInput,
) {
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(input.targetMembershipId)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Organization and target Membership IDs must be UUIDs.");
  }
  if (!denyEligiblePermissions.has(input.permissionCode)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "The permission is not DENY-eligible in the approved first-iteration allowlist.");
  }
  if (!["ORGANIZATION", "COMPANY", "PLANT"].includes(input.scope)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "The DENY scope is invalid.");
  }
  if (!permissionFitsDenyScope(input.permissionCode, input.scope)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "The permission is incompatible with the requested exact DENY scope.");
  }
  if (input.scope === "ORGANIZATION" && (input.companyId || input.plantId)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Organization DENY must not include Company or Plant identifiers.");
  }
  if (input.scope === "COMPANY" && (!input.companyId || !uuidPattern.test(input.companyId) || input.plantId)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Company DENY requires only a valid Company identifier.");
  }
  if (input.scope === "PLANT" && (!input.companyId || !uuidPattern.test(input.companyId) || !input.plantId || !uuidPattern.test(input.plantId))) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Plant DENY requires valid Company and Plant identifiers.");
  }

  const reason = requireReason(input.reason, "Reason");
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.expiresAt && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Expiry must be a valid ISO date-time.");
  }

  const session = await getCurrentSession();
  return prisma.$transaction(async (tx) => {
    const context = await resolveOwnerContext(tx, session, organizationId);

    // Serialize policy creation/revocation for this exact membership.
    const memberships = await tx.$queryRaw<Array<{ id: string; userId: string; status: string }>>`
      SELECT "id"::text AS "id", "userId" AS "userId", "status"::text AS "status"
      FROM "core"."organization_membership"
      WHERE "id" = ${input.targetMembershipId}::uuid
        AND "organizationId" = ${context.organizationId}::uuid
        AND "status" IN ('ACTIVE', 'SUSPENDED')
      FOR UPDATE
    `;
    const target = memberships[0];
    if (!target) throw new TenantDenyPolicyError("NOT_FOUND", "The target Membership is not active or suspended in this Organization.");

    if (input.scope === "COMPANY" || input.scope === "PLANT") {
      const companies = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"::text AS "id" FROM "core"."company"
        WHERE "id" = ${input.companyId!}::uuid
          AND "organizationId" = ${context.organizationId}::uuid
        FOR SHARE
      `;
      if (!companies[0]) throw new TenantDenyPolicyError("INVALID_INPUT", "The Company is not in this Organization.");
    }

    if (input.scope === "PLANT") {
      const plants = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT p."id"::text AS "id"
        FROM "core"."plant" p
        WHERE p."id" = ${input.plantId!}::uuid
          AND p."companyId" = ${input.companyId!}::uuid
          AND p."organizationId" = ${context.organizationId}::uuid
        FOR SHARE OF p
      `;
      if (!plants[0]) throw new TenantDenyPolicyError("INVALID_INPUT", "The Plant is not a descendant of the selected Company and Organization.");
    }

    // Permission definitions are immutable global catalog rows and the
    // runtime role intentionally has SELECT-only access. Read without a row lock.
    const permissionRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id" FROM "core"."permission_definition"
      WHERE "code" = ${input.permissionCode}
    `;
    if (!permissionRows[0]) throw new TenantDenyPolicyError("INVALID_INPUT", "The permission definition does not exist.");

    if (expiresAt) {
      const expiry = await tx.$queryRaw<Array<{ valid: boolean }>>`
        SELECT ${expiresAt}::timestamptz > clock_timestamp() AS "valid"
      `;
      if (!expiry[0]?.valid) throw new TenantDenyPolicyError("INVALID_INPUT", "Expiry must be in the future according to the database clock.");
    }

    const duplicates = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"::text AS "id"
      FROM "core"."tenant_deny_policy"
      WHERE "organization_id" = ${context.organizationId}::uuid
        AND "target_membership_id" = ${target.id}::uuid
        AND "permission_definition_id" = ${permissionRows[0].id}::uuid
        AND "scope" = ${input.scope}::"core"."RoleScope"
        AND "company_id" IS NOT DISTINCT FROM ${input.companyId ?? null}::uuid
        AND "plant_id" IS NOT DISTINCT FROM ${input.plantId ?? null}::uuid
        AND "revoked_at" IS NULL
        AND ("expires_at" IS NULL OR "expires_at" > clock_timestamp())
      LIMIT 1
    `;
    if (duplicates[0]) throw new TenantDenyPolicyError("CONFLICT", "An active DENY policy already exists for this exact membership, permission, and scope.");

    const policies = await tx.$queryRaw<Array<Record<string, unknown>>>`
      INSERT INTO "core"."tenant_deny_policy"
        ("id", "organization_id", "target_membership_id", "target_user_id",
         "permission_definition_id", "scope", "company_id", "plant_id",
         "reason", "issued_by_user_id", "issued_at", "expires_at")
      VALUES
        (gen_random_uuid(), ${context.organizationId}::uuid, ${target.id}::uuid, ${target.userId},
         ${permissionRows[0].id}::uuid, ${input.scope}::"core"."RoleScope",
         ${input.companyId ?? null}::uuid, ${input.plantId ?? null}::uuid,
         ${reason}, ${context.userId}, clock_timestamp(), ${expiresAt})
      RETURNING "id"::text AS "id", "organization_id"::text AS "organizationId",
        "target_membership_id"::text AS "targetMembershipId", "target_user_id" AS "targetUserId",
        "scope"::text AS "scope", "company_id"::text AS "companyId",
        "plant_id"::text AS "plantId", "reason", "issued_by_user_id" AS "issuedByUserId",
        "issued_at" AS "issuedAt", "expires_at" AS "expiresAt"
    `;
    const policy = policies[0];

    await tx.$executeRaw`
      INSERT INTO "core"."tenant_deny_audit_event"
        ("id", "policy_id", "organization_id", "target_membership_id", "target_user_id",
         "permission_definition_id", "scope", "company_id", "plant_id", "actor_user_id",
         "event_type", "outcome", "reason", "reason_code", "occurred_at")
      VALUES
        (gen_random_uuid(), ${policy.id}::uuid, ${context.organizationId}::uuid,
         ${target.id}::uuid, ${target.userId}, ${permissionRows[0].id}::uuid,
         ${input.scope}::"core"."RoleScope", ${input.companyId ?? null}::uuid,
         ${input.plantId ?? null}::uuid, ${context.userId},
         'POLICY_CREATED'::"core"."DenyAuditEventType", 'SUCCESS'::"core"."DenyAuditOutcome",
         ${reason}, 'POLICY_CREATED', clock_timestamp())
    `;

    return policy;
  });
}

export async function revokeTenantDenyPolicy(
  organizationId: string,
  policyId: string,
  reasonInput: string,
) {
  if (!uuidPattern.test(organizationId) || !uuidPattern.test(policyId)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Organization and policy IDs must be UUIDs.");
  }
  const reason = requireReason(reasonInput, "Revocation reason");
  const session = await getCurrentSession();

  return prisma.$transaction(async (tx) => {
    const context = await resolveOwnerContext(tx, session, organizationId);
    const policies = await tx.$queryRaw<Array<{
      id: string; targetMembershipId: string; targetUserId: string;
      permissionDefinitionId: string; scope: "ORGANIZATION" | "COMPANY" | "PLANT";
      companyId: string | null; plantId: string | null;
    }>>`
      SELECT "id"::text AS "id", "target_membership_id"::text AS "targetMembershipId",
        "target_user_id" AS "targetUserId",
        "permission_definition_id"::text AS "permissionDefinitionId",
        "scope"::text AS "scope", "company_id"::text AS "companyId",
        "plant_id"::text AS "plantId"
      FROM "core"."tenant_deny_policy"
      WHERE "id" = ${policyId}::uuid AND "organization_id" = ${context.organizationId}::uuid
        AND "revoked_at" IS NULL
      FOR UPDATE
    `;
    const policy = policies[0];
    if (!policy) throw new TenantDenyPolicyError("NOT_FOUND", "The active DENY policy was not found.");

    await tx.$executeRaw`
      UPDATE "core"."tenant_deny_policy"
      SET "revoked_at" = clock_timestamp(),
          "revoked_by_user_id" = ${context.userId},
          "revoke_reason" = ${reason}
      WHERE "id" = ${policyId}::uuid
    `;

    await tx.$executeRaw`
      INSERT INTO "core"."tenant_deny_audit_event"
        ("id", "policy_id", "organization_id", "target_membership_id", "target_user_id",
         "permission_definition_id", "scope", "company_id", "plant_id", "actor_user_id",
         "event_type", "outcome", "reason", "reason_code", "occurred_at")
      VALUES
        (gen_random_uuid(), ${policy.id}::uuid, ${context.organizationId}::uuid,
         ${policy.targetMembershipId}::uuid, ${policy.targetUserId},
         ${policy.permissionDefinitionId}::uuid, ${policy.scope}::"core"."RoleScope",
         ${policy.companyId}::uuid, ${policy.plantId}::uuid, ${context.userId},
         'POLICY_REVOKED'::"core"."DenyAuditEventType", 'SUCCESS'::"core"."DenyAuditOutcome",
         ${reason}, 'POLICY_REVOKED', clock_timestamp())
    `;

    return { id: policy.id, revoked: true };
  });
}


const deniedAuditActorLimit = 10;
const deniedAuditOrganizationLimit = 50;

async function recordDeniedTenantDenyAttempt(
  organizationId: string,
  eventType: "POLICY_WRITE_DENIED" | "POLICY_READ_DENIED",
  reasonCode: string,
) {
  if (!uuidPattern.test(organizationId)) return false;

  try {
    const session = await getCurrentSession();
    // Anonymous traffic is deliberately not persisted as tenant audit evidence:
    // it has no verified actor or active membership to anchor the event.
    if (!session?.session?.id || !session.user?.id) return false;

    return await prisma.$transaction(async (tx) => {
      await lockVerifiedSessionRow(
        (statement, values = []) => tx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values),
        { sessionId: session.session.id, userId: session.user.id },
      );

      await tx.$queryRaw`SELECT set_config('app.user_id', ${session.user.id}, true)`;
      const actor = await resolveTenantTargetContext(tx, session, {
        kind: "ORGANIZATION",
        organizationId,
      });

      // Reassert the verified tenant boundary immediately before the audit
      // read/write. The context resolver also installs this GUC, but making
      // the audit writer's RLS dependency explicit avoids relying on that
      // implementation detail.
      await tx.$queryRaw`
        SELECT set_config('app.organization_id', ${actor.organizationId}, true),
          set_config('app.company_id', '', true),
          set_config('app.plant_id', '', true)
      `;

      // Serialize per Organization / event category so concurrent actors
      // cannot race past the tenant-wide append-only audit budget.
      const lockKey = `${actor.organizationId}:${eventType}`;
      await tx.$queryRaw<Array<{ locked: number }>>`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))) SELECT 1::int AS locked FROM lock`;

      const recent = await tx.$queryRaw<Array<{ actorCount: number; organizationCount: number }>>`
        SELECT
          COUNT(*) FILTER (WHERE "actor_user_id" = ${actor.userId})::int AS "actorCount",
          COUNT(*)::int AS "organizationCount"
        FROM "core"."tenant_deny_audit_event"
        WHERE "organization_id" = ${actor.organizationId}::uuid
          AND "event_type" = ${eventType}::"core"."DenyAuditEventType"
          AND "occurred_at" >= clock_timestamp() - interval '5 minutes'
      `;
      if ((recent[0]?.actorCount ?? 0) >= deniedAuditActorLimit) return false;
      if ((recent[0]?.organizationCount ?? 0) >= deniedAuditOrganizationLimit) return false;

      await tx.$executeRaw`
        INSERT INTO "core"."tenant_deny_audit_event"
          ("id", "organization_id", "actor_user_id", "event_type", "outcome",
           "reason", "reason_code", "occurred_at")
        VALUES
          (gen_random_uuid(), ${actor.organizationId}::uuid, ${actor.userId},
           ${eventType}::"core"."DenyAuditEventType",
           'DENIED'::"core"."DenyAuditOutcome",
           ${eventType === "POLICY_READ_DENIED"
             ? "DENY policy history read was not authorized."
             : "DENY policy write was not authorized."},
           ${reasonCode}, clock_timestamp())
      `;
      return true;
    });
  } catch (error) {
    // Keep the original authorization response stable, while exposing a
    // redacted diagnostic for operational investigation (no IDs or SQL values).
    console.error("[DENY audit] denied-attempt event was not persisted", {
      eventType,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

export async function recordDeniedTenantDenyWriteAttempt(
  organizationId: string,
  action: "CREATE" | "REVOKE",
) {
  return recordDeniedTenantDenyAttempt(
    organizationId,
    "POLICY_WRITE_DENIED",
    action === "CREATE" ? "CREATE_NOT_AUTHORIZED" : "REVOKE_NOT_AUTHORIZED",
  );
}

export async function recordDeniedTenantDenyReadAttempt(organizationId: string) {
  return recordDeniedTenantDenyAttempt(
    organizationId,
    "POLICY_READ_DENIED",
    "READER_NOT_AUTHORIZED",
  );
}

export async function listTenantDenyPolicyHistory(organizationId: string) {
  if (!uuidPattern.test(organizationId)) {
    throw new TenantDenyPolicyError("INVALID_INPUT", "Organization ID must be a UUID.");
  }
  const session = await getCurrentSession();
  let deniedRead = false;

  const result = await prisma.$transaction(async (tx) => {
    const context = await (async () => {
      try {
        return await resolveOwnerContext(tx, session, organizationId);
      } catch (error) {
      // A verified, active Organization member who is not an ORG_OWNER is
      // allowed to produce one attributable denial event. Persist it in this
      // transaction before returning the 403, so it cannot be lost when the
      // failed authorization transaction rolls back.
      if (
        !(error instanceof TenantDenyPolicyError) ||
        error.code !== "FORBIDDEN" ||
        !session?.session?.id ||
        !session.user?.id
      ) {
        throw error;
      }

      // resolveOwnerContext has already locked and verified the session,
      // resolved the active membership, and installed the tenant GUCs.
      const eventType = "POLICY_READ_DENIED" as const;
      const lockKey = `${organizationId}:${eventType}`;
      await tx.$queryRaw<Array<{ locked: number }>>`WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))) SELECT 1::int AS locked FROM lock`;

      const recent = await tx.$queryRaw<Array<{ actorCount: number; organizationCount: number }>>`
        SELECT
          COUNT(*) FILTER (WHERE "actor_user_id" = ${session.user.id})::int AS "actorCount",
          COUNT(*)::int AS "organizationCount"
        FROM "core"."tenant_deny_audit_event"
        WHERE "organization_id" = ${organizationId}::uuid
          AND "event_type" = 'POLICY_READ_DENIED'::"core"."DenyAuditEventType"
          AND "occurred_at" >= clock_timestamp() - interval '5 minutes'
      `;
      if (
        (recent[0]?.actorCount ?? 0) < deniedAuditActorLimit &&
        (recent[0]?.organizationCount ?? 0) < deniedAuditOrganizationLimit
      ) {
        await tx.$executeRaw`
          INSERT INTO "core"."tenant_deny_audit_event"
            ("id", "organization_id", "actor_user_id", "event_type", "outcome",
             "reason", "reason_code", "occurred_at")
          VALUES
            (gen_random_uuid(), ${organizationId}::uuid, ${session.user.id},
             'POLICY_READ_DENIED'::"core"."DenyAuditEventType",
             'DENIED'::"core"."DenyAuditOutcome",
             'DENY policy history read was not authorized.',
             'READER_NOT_AUTHORIZED', clock_timestamp())
        `;
      }
        deniedRead = true;
        return null;
      }
    })();
    if (!context) return null;

    const policies = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p."id"::text AS "id", p."target_membership_id"::text AS "targetMembershipId",
        p."target_user_id" AS "targetUserId", pd."code" AS "permissionCode",
        p."scope"::text AS "scope", p."company_id"::text AS "companyId",
        p."plant_id"::text AS "plantId", p."reason", p."issued_by_user_id" AS "issuedByUserId",
        p."issued_at" AS "issuedAt", p."expires_at" AS "expiresAt",
        p."revoked_at" AS "revokedAt", p."revoked_by_user_id" AS "revokedByUserId",
        p."revoke_reason" AS "revokeReason"
      FROM "core"."tenant_deny_policy" p
      JOIN "core"."permission_definition" pd ON pd."id" = p."permission_definition_id"
      WHERE p."organization_id" = ${context.organizationId}::uuid
      ORDER BY p."issued_at" DESC, p."id" DESC
    `;
    await tx.$executeRaw`
      INSERT INTO "core"."tenant_deny_audit_event"
        ("id", "organization_id", "actor_user_id", "event_type", "outcome",
         "reason_code", "occurred_at")
      VALUES
        (gen_random_uuid(), ${context.organizationId}::uuid, ${context.userId},
         'POLICY_READ'::"core"."DenyAuditEventType", 'SUCCESS'::"core"."DenyAuditOutcome",
         'POLICY_HISTORY_READ', clock_timestamp())
    `;

    const events = await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT "id"::text AS "id", "policy_id"::text AS "policyId",
        "actor_user_id" AS "actorUserId", "event_type"::text AS "eventType",
        "outcome"::text AS "outcome", "reason", "reason_code" AS "reasonCode",
        "request_id" AS "requestId", "occurred_at" AS "occurredAt"
      FROM "core"."tenant_deny_audit_event"
      WHERE "organization_id" = ${context.organizationId}::uuid
      ORDER BY "occurred_at" DESC, "id" DESC
    `;

    return { policies, events };
  });

  if (deniedRead || !result) {
    throw new TenantDenyPolicyError("FORBIDDEN", "Only an active ORG_OWNER may manage or read DENY policies.");
  }
  return result;
}
