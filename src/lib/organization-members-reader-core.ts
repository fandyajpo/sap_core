import type { AuthorizationPermission } from "./authorization-policy-core.ts";
import type { TenantScopeRequest } from "./tenant-scope-types.ts";

export interface OrganizationMemberSummary {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  createdAt: Date;
}

export function createOrganizationMembersReader(dependencies: {
  authorize(request: TenantScopeRequest, permission: AuthorizationPermission): Promise<unknown>;
  findMembers(organizationId: string): Promise<readonly OrganizationMemberSummary[]>;
}) {
  return async function listOrganizationMembers(organizationId: string): Promise<readonly OrganizationMemberSummary[]> {
    await dependencies.authorize(
      { kind: "ORGANIZATION", organizationId },
      "organization.members.read",
    );
    return dependencies.findMembers(organizationId);
  };
}
