import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { createSessionBoundScopedAccessDatabase } from "@/lib/scoped-access";
import { createTenantRoleDefinitionAdapter } from "@/lib/tenant-role-definition-service-core";
import type {
  CustomRoleCreateInput,
  CustomRoleReviseInput,
  RoleDefinitionRecord,
} from "@/lib/role-definition-service";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";
import { resolveTenantTargetContext } from "@/lib/tenant-target-context";
import type { RoleDefinitionExplicitDenyEvidence } from "@/lib/tenant-role-definition-service-core";

type VerifiedRoleDefinitionSession = {
  session: { id: string };
  user: { id: string };
};

async function recordRoleDefinitionExplicitDeny(
  session: VerifiedRoleDefinitionSession,
  evidence: RoleDefinitionExplicitDenyEvidence,
) {
  await prisma.$transaction(async (auditTx) => {
    await lockVerifiedSessionRow(
      (statement, values = []) => auditTx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values),
      { sessionId: session.session.id, userId: session.user.id },
    );
    await auditTx.$queryRaw`SELECT set_config('app.user_id', ${session.user.id}, true)`;
    const context = await resolveTenantTargetContext(auditTx, session, {
      kind: "ORGANIZATION",
      organizationId: evidence.organizationId,
    });
    await auditTx.$queryRaw`
      SELECT set_config('app.organization_id', ${context.organizationId}, true),
        set_config('app.company_id', '', true),
        set_config('app.plant_id', '', true)
    `;
    await auditTx.$executeRaw`
      INSERT INTO "core"."tenant_deny_audit_event"
        ("id", "policy_id", "organization_id", "target_membership_id", "target_user_id",
         "permission_definition_id", "scope", "company_id", "plant_id", "actor_user_id",
         "event_type", "outcome", "reason_code", "occurred_at")
      SELECT gen_random_uuid(), ${evidence.policyId}::uuid, ${context.organizationId}::uuid,
        ${context.organizationMembershipId}::uuid, ${context.userId},
        pd."id", 'ORGANIZATION'::"core"."RoleScope", NULL, NULL,
        ${context.userId}, 'POLICY_ENFORCEMENT_DENIED'::"core"."DenyAuditEventType",
        'DENIED'::"core"."DenyAuditOutcome", 'EXPLICIT_DENY', clock_timestamp()
      FROM "core"."permission_definition" pd
      WHERE pd."code" = ${evidence.permission}
    `;
  });
}

async function getVerifiedSession() {
  const session = await getCurrentSession();
  if (!session?.user?.id || !session.session?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return session;
}

export async function createCustomRoleForCurrentUser(
  input: Omit<CustomRoleCreateInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const database = createSessionBoundScopedAccessDatabase({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  return createTenantRoleDefinitionAdapter({
    database,
    getCurrentSession: async () => session,
    recordExplicitDeny: (evidence) => recordRoleDefinitionExplicitDeny(session, evidence),
  }).createCustomRoleForCurrentUser(input);
}

export async function reviseCustomRoleForCurrentUser(
  input: Omit<CustomRoleReviseInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const database = createSessionBoundScopedAccessDatabase({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  return createTenantRoleDefinitionAdapter({
    database,
    getCurrentSession: async () => session,
    recordExplicitDeny: (evidence) => recordRoleDefinitionExplicitDeny(session, evidence),
  }).reviseCustomRoleForCurrentUser(input);
}

export interface OrganizationRoleSummary {
  id: string;
  code: string;
  version: number;
  kind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  scope: "ORGANIZATION";
  ownerOrganizationId: string | null;
  disabledAt: Date | null;
  permissions: string[];
}

export async function listOrganizationRoles(organizationId: string): Promise<OrganizationRoleSummary[]> {
  const session = await getCurrentSession();
  if (!session?.session?.id || !session.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return prisma.$transaction(async (tx) => {
    await requireTenantPermission(tx, session, { kind: "ORGANIZATION", organizationId }, "roles.read");
    return tx.$queryRaw<OrganizationRoleSummary[]>`
      SELECT
        rd."id"::text AS "id",
        rd."code",
        rd."version",
        rd."kind"::text AS "kind",
        rd."scope"::text AS "scope",
        rd."ownerOrganizationId"::text AS "ownerOrganizationId",
        rd."disabled_at" AS "disabledAt",
        COALESCE(
          array_agg(pd."code" ORDER BY pd."code")
            FILTER (WHERE g."effect" = 'ALLOW'::"core"."PermissionGrantEffect"),
          ARRAY[]::text[]
        ) AS "permissions"
      FROM "core"."role_definition" rd
      LEFT JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
      LEFT JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
      WHERE rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND (
          rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          OR rd."ownerOrganizationId" = ${organizationId}::uuid
        )
      GROUP BY rd."id"
      ORDER BY rd."kind"::text, rd."code", rd."version" DESC
    `;
  });
}
