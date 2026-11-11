import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { createRoleAssignmentService } from "@/lib/role-assignment-service";
import { createSessionBoundScopedAccessDatabase } from "@/lib/scoped-access";
import { createRoleAssignmentAuthorization, type ExplicitDenyEvidence } from "@/lib/role-assignment-authorization-core";
import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";
import { resolveTenantTargetContext } from "@/lib/tenant-target-context";
import type { TenantScopeRequest } from "@/lib/tenant-scope-types";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

async function recordRoleAssignmentExplicitDeny(
  session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>,
  evidence: ExplicitDenyEvidence,
) {
  const request: TenantScopeRequest = evidence.scope === "ORGANIZATION"
    ? { kind: "ORGANIZATION", organizationId: evidence.organizationId }
    : evidence.scope === "COMPANY"
      ? { kind: "COMPANY", organizationId: evidence.organizationId, companyId: evidence.companyId! }
      : { kind: "PLANT", organizationId: evidence.organizationId, companyId: evidence.companyId!, plantId: evidence.plantId! };

  await prisma.$transaction(async (auditTx) => {
    await lockVerifiedSessionRow(
      (statement, values = []) => auditTx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values),
      { sessionId: session.session.id, userId: session.user.id },
    );
    await auditTx.$queryRaw`SELECT set_config('app.user_id', ${session.user.id}, true)`;
    const context = await resolveTenantTargetContext(auditTx, session, request);
    await auditTx.$queryRaw`
      SELECT set_config('app.organization_id', ${context.organizationId}, true),
        set_config('app.company_id', ${context.companyId ?? ""}, true),
        set_config('app.plant_id', ${context.plantId ?? ""}, true)
    `;
    await auditTx.$executeRaw`
      INSERT INTO "core"."tenant_deny_audit_event"
        ("id", "policy_id", "organization_id", "target_membership_id", "target_user_id",
         "permission_definition_id", "scope", "company_id", "plant_id", "actor_user_id",
         "event_type", "outcome", "reason_code", "occurred_at")
      SELECT gen_random_uuid(), ${evidence.policyId}::uuid, ${context.organizationId}::uuid,
        ${context.organizationMembershipId}::uuid, ${context.userId},
        pd."id", ${context.scope}::"core"."RoleScope",
        ${context.companyId}::uuid, ${context.plantId}::uuid,
        ${context.userId}, 'POLICY_ENFORCEMENT_DENIED'::"core"."DenyAuditEventType",
        'DENIED'::"core"."DenyAuditOutcome", 'EXPLICIT_DENY', clock_timestamp()
      FROM "core"."permission_definition" pd
      WHERE pd."code" = ${evidence.permission}
    `;
  });
}

async function getVerifiedSession() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  if (!session.session?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return session;
}

export async function grantRoleAssignmentForCurrentUser(input: {
  organizationId: string;
  scope: "ORGANIZATION" | "COMPANY" | "PLANT";
  parentId: string;
  roleDefinitionId: string;
}) {
  const session = await getVerifiedSession();
  const actorUserId = session.user.id;
  const service = createRoleAssignmentService(
    createSessionBoundScopedAccessDatabase({ sessionId: session.session.id, userId: actorUserId }),
    createRoleAssignmentAuthorization(actorUserId, input.organizationId, (evidence) =>
      recordRoleAssignmentExplicitDeny(session, evidence),
    ),
    { enforceRoleDefinitionGovernance: true },
  );
  return service.grantRoleAssignment({
    scope: input.scope,
    parentId: input.parentId,
    roleDefinitionId: input.roleDefinitionId,
    actorUserId,
  });
}

export async function listRoleAssignmentsForCurrentUser(input: {
  organizationId: string;
  scope: "ORGANIZATION" | "COMPANY" | "PLANT";
  parentId: string;
  userId: string;
}) {
  const session = await getVerifiedSession();
  const actorUserId = session.user.id;
  const service = createRoleAssignmentService(
    createSessionBoundScopedAccessDatabase({ sessionId: session.session.id, userId: actorUserId }),
    createRoleAssignmentAuthorization(actorUserId, input.organizationId, (evidence) =>
      recordRoleAssignmentExplicitDeny(session, evidence),
    ),
    { enforceRoleDefinitionGovernance: true },
  );
  return service.listEffectiveRoleAssignments({
    actorUserId,
    userId: input.userId,
    scope: input.scope,
    parentId: input.parentId,
  });
}
