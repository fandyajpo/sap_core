import type {
  CreateOrganizationRoleRequest,
  OrganizationRoleResponse,
  OrganizationRolesResponse,
  ReviseOrganizationRoleRequest,
} from "../contracts.ts";
import { requestJson } from "../http.ts";
import { organizationApiPath } from "./paths.ts";

export function listOrganizationRoles(
  organizationId: string,
  signal?: AbortSignal,
): Promise<OrganizationRolesResponse> {
  return requestJson<OrganizationRolesResponse>(
    `${organizationApiPath(organizationId)}/roles`,
    { signal },
  );
}

export function createOrganizationRole(
  organizationId: string,
  input: CreateOrganizationRoleRequest,
): Promise<OrganizationRoleResponse> {
  return requestJson<OrganizationRoleResponse>(`${organizationApiPath(organizationId)}/roles`, {
    method: "POST",
    body: input,
  });
}

export function reviseOrganizationRole(
  organizationId: string,
  roleDefinitionId: string,
  input: ReviseOrganizationRoleRequest,
): Promise<OrganizationRoleResponse> {
  return requestJson<OrganizationRoleResponse>(
    `${organizationApiPath(organizationId)}/roles/${encodeURIComponent(roleDefinitionId)}/revisions`,
    { method: "POST", body: input },
  );
}
