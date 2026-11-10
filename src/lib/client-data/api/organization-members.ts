import type { OrganizationMembersResponse } from "../contracts.ts";
import { requestJson } from "../http.ts";
import { organizationApiPath } from "./paths.ts";

export function listOrganizationMembers(
  organizationId: string,
  signal?: AbortSignal,
): Promise<OrganizationMembersResponse> {
  return requestJson<OrganizationMembersResponse>(`${organizationApiPath(organizationId)}/members`, { signal });
}
