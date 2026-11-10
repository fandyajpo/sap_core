import type {
  GrantRoleAssignmentRequest,
  RoleAssignmentResponse,
  RoleAssignmentsQuery,
  RoleAssignmentsResponse,
} from "../contracts.ts";
import { requestJson } from "../http.ts";
import { organizationApiPath, withQuery } from "./paths.ts";

export function listRoleAssignments(
  organizationId: string,
  query: RoleAssignmentsQuery,
  signal?: AbortSignal,
): Promise<RoleAssignmentsResponse> {
  const path = withQuery(`${organizationApiPath(organizationId)}/roles/assignments`, {
    scope: query.scope,
    parentId: query.parentId,
    userId: query.userId,
  });
  return requestJson<RoleAssignmentsResponse>(path, { signal });
}

export function grantRoleAssignment(
  organizationId: string,
  input: GrantRoleAssignmentRequest,
): Promise<RoleAssignmentResponse> {
  return requestJson<RoleAssignmentResponse>(`${organizationApiPath(organizationId)}/roles/assignments`, {
    method: "POST",
    body: input,
  });
}
