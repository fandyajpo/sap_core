import { createRoleAssignmentService } from "./role-assignment-service.ts";
import { createRoleAssignmentAuthorization } from "./role-assignment-authorization-core.ts";
import { TenantTargetContextError } from "./tenant-target-context-core.ts";

type SessionProvider = () => Promise<{ user?: { id?: string | null } | null } | null>;

export interface TenantRoleAssignmentAdapterDependencies {
  database: Parameters<typeof createRoleAssignmentService>[0];
  getCurrentSession: SessionProvider;
}

export function createTenantRoleAssignmentAdapter({
  database,
  getCurrentSession,
}: TenantRoleAssignmentAdapterDependencies) {
  async function getVerifiedActor(): Promise<string> {
    const session = await getCurrentSession();
    if (!session?.user?.id) {
      throw new TenantTargetContextError(
        "UNAUTHENTICATED",
        "A verified authenticated session is required.",
      );
    }
    return session.user.id;
  }

  function createService(actorUserId: string, organizationId: string) {
    return createRoleAssignmentService(
      database,
      createRoleAssignmentAuthorization(actorUserId, organizationId),
      { enforceRoleDefinitionGovernance: true },
    );
  }

  return {
    async grantRoleAssignmentForCurrentUser(input: {
      organizationId: string;
      scope: "ORGANIZATION" | "COMPANY" | "PLANT";
      parentId: string;
      roleDefinitionId: string;
    }) {
      const actorUserId = await getVerifiedActor();
      return createService(actorUserId, input.organizationId).grantRoleAssignment({
        scope: input.scope,
        parentId: input.parentId,
        roleDefinitionId: input.roleDefinitionId,
        actorUserId,
      });
    },

    async listRoleAssignmentsForCurrentUser(input: {
      organizationId: string;
      scope: "ORGANIZATION" | "COMPANY" | "PLANT";
      parentId: string;
      userId: string;
    }) {
      const actorUserId = await getVerifiedActor();
      return createService(actorUserId, input.organizationId).listEffectiveRoleAssignments({
        actorUserId,
        userId: input.userId,
        scope: input.scope,
        parentId: input.parentId,
      });
    },
  };
}
