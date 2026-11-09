import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { createRoleAssignmentService } from "@/lib/role-assignment-service";
import { scopedAccessDatabase } from "@/lib/scoped-access";
import { createRoleAssignmentAuthorization } from "@/lib/role-assignment-authorization-core";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

async function getVerifiedActor() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return session.user.id;
}

export async function grantRoleAssignmentForCurrentUser(input: {
  organizationId: string;
  scope: "ORGANIZATION" | "COMPANY" | "PLANT";
  parentId: string;
  roleDefinitionId: string;
}) {
  const actorUserId = await getVerifiedActor();
  const service = createRoleAssignmentService(
    scopedAccessDatabase,
    createRoleAssignmentAuthorization(actorUserId, input.organizationId),
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
  const actorUserId = await getVerifiedActor();
  const service = createRoleAssignmentService(
    scopedAccessDatabase,
    createRoleAssignmentAuthorization(actorUserId, input.organizationId),
  );
  return service.listEffectiveRoleAssignments({
    actorUserId,
    userId: input.userId,
    scope: input.scope,
    parentId: input.parentId,
  });
}
