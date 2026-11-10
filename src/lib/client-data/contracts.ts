export type TenantAssignableScope = "ORGANIZATION" | "COMPANY" | "PLANT";

export interface OrganizationMemberDto {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
}

export interface OrganizationMembersResponse {
  organizationId: string;
  members: OrganizationMemberDto[];
}

export interface OrganizationRoleDto {
  id: string;
  code: string;
  version: number;
  kind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  scope: "ORGANIZATION";
  ownerOrganizationId: string | null;
  disabledAt: string | null;
  permissions: string[];
}

export interface OrganizationRolesResponse {
  organizationId: string;
  roles: OrganizationRoleDto[];
}

export interface OrganizationRoleRecordDto {
  id: string;
  roleFamilyId: string;
  code: string;
  version: number;
  kind: "ORGANIZATION_CUSTOM";
  scope: "ORGANIZATION";
  ownerOrganizationId: string;
  createdAt: string;
  updatedAt: string;
  permissionsLockedAt: string;
}

export interface OrganizationRoleResponse {
  role: OrganizationRoleRecordDto;
}

export interface CreateOrganizationRoleRequest {
  code: string;
  scope: "ORGANIZATION";
  permissions: string[];
}

export interface ReviseOrganizationRoleRequest {
  code?: string;
  scope?: "ORGANIZATION";
  permissions?: string[];
}

export interface RoleAssignmentDto {
  id: string;
  scope: TenantAssignableScope;
  parentId: string;
  roleDefinitionId: string;
  grantActorUserId: string | null;
  isBreakGlass: boolean;
  breakGlassReason: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface RoleAssignmentsQuery {
  scope: TenantAssignableScope;
  parentId: string;
  userId: string;
}

export interface RoleAssignmentsResponse extends RoleAssignmentsQuery {
  organizationId: string;
  assignments: RoleAssignmentDto[];
}

export interface GrantRoleAssignmentRequest {
  scope: TenantAssignableScope;
  parentId: string;
  roleDefinitionId: string;
}

export interface RoleAssignmentResponse {
  assignment: RoleAssignmentDto;
}

export interface CreateTenantDenyPolicyRequest {
  targetMembershipId: string;
  permissionCode: string;
  scope: TenantAssignableScope;
  companyId?: string;
  plantId?: string;
  reason: string;
  expiresAt?: string | null;
}

export interface TenantDenyPolicyDto {
  id: string;
  targetMembershipId: string;
  targetUserId: string;
  permissionCode: string;
  scope: TenantAssignableScope;
  companyId: string | null;
  plantId: string | null;
  reason: string;
  issuedByUserId: string;
  issuedAt: string;
  expiresAt: string | null;
}

export interface CreatedTenantDenyPolicyDto extends TenantDenyPolicyDto {
  organizationId: string;
}

export interface TenantDenyPolicyHistoryEntry extends TenantDenyPolicyDto {
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
}

export interface TenantDenyAuditEventDto {
  id: string;
  policyId: string | null;
  actorUserId: string | null;
  eventType:
    | "POLICY_CREATED"
    | "POLICY_REVOKED"
    | "POLICY_READ"
    | "POLICY_READ_DENIED"
    | "POLICY_WRITE_DENIED"
    | "POLICY_ENFORCEMENT_DENIED";
  outcome: "SUCCESS" | "DENIED" | "FAILURE";
  reason: string | null;
  reasonCode: string | null;
  requestId: string | null;
  occurredAt: string;
}

export interface TenantDenyPolicyHistoryResponse {
  organizationId: string;
  policies: TenantDenyPolicyHistoryEntry[];
  events: TenantDenyAuditEventDto[];
}

export interface TenantDenyPolicyResponse {
  organizationId: string;
  policy: CreatedTenantDenyPolicyDto;
}

export interface RevokeTenantDenyPolicyRequest {
  reason: string;
}

export interface RevokeTenantDenyPolicyResponse {
  id: string;
  revoked: true;
}

export interface TenantResourceDto {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyResponse {
  company: TenantResourceDto;
}

export interface PlantResponse {
  plant: TenantResourceDto;
}
