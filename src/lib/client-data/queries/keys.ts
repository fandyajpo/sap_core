import type { RoleAssignmentsQuery } from "../contracts.ts";

export const clientDataKeys = {
  organization: (organizationId: string) => ["organizations", organizationId] as const,
  organizationMembers: (organizationId: string) => [
    ...clientDataKeys.organization(organizationId),
    "members",
  ] as const,
  organizationRoles: (organizationId: string) => [
    ...clientDataKeys.organization(organizationId),
    "roles",
  ] as const,
  roleAssignmentsRoot: (organizationId: string) => [
    ...clientDataKeys.organization(organizationId),
    "role-assignments",
  ] as const,
  roleAssignments: (organizationId: string, query: RoleAssignmentsQuery) => [
    ...clientDataKeys.roleAssignmentsRoot(organizationId),
    { scope: query.scope, parentId: query.parentId, userId: query.userId },
  ] as const,
  tenantDenyPolicyHistory: (organizationId: string) => [
    ...clientDataKeys.organization(organizationId),
    "deny-policies",
    "history",
  ] as const,
  company: (organizationId: string, companyId: string) => [
    ...clientDataKeys.organization(organizationId),
    "companies",
    companyId,
  ] as const,
  plant: (organizationId: string, companyId: string, plantId: string) => [
    ...clientDataKeys.company(organizationId, companyId),
    "plants",
    plantId,
  ] as const,
};
