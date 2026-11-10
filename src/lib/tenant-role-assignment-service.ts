import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { createRoleAssignmentService } from "@/lib/role-assignment-service";
import { createSessionBoundScopedAccessDatabase } from "@/lib/scoped-access";
import { createRoleAssignmentAuthorization } from "@/lib/role-assignment-authorization-core";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

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
    createRoleAssignmentAuthorization(actorUserId, input.organizationId),
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
    createRoleAssignmentAuthorization(actorUserId, input.organizationId),
    { enforceRoleDefinitionGovernance: true },
  );
  return service.listEffectiveRoleAssignments({
    actorUserId,
    userId: input.userId,
    scope: input.scope,
    parentId: input.parentId,
  });
}
