import type {
  CreateTenantDenyPolicyRequest,
  RevokeTenantDenyPolicyRequest,
  RevokeTenantDenyPolicyResponse,
  TenantDenyPolicyHistoryResponse,
  TenantDenyPolicyResponse,
} from "../contracts.ts";
import { requestJson } from "../http.ts";
import { organizationApiPath } from "./paths.ts";

export function getTenantDenyPolicyHistory(
  organizationId: string,
  signal?: AbortSignal,
): Promise<TenantDenyPolicyHistoryResponse> {
  return requestJson<TenantDenyPolicyHistoryResponse>(
    `${organizationApiPath(organizationId)}/deny-policies`,
    { signal },
  );
}

export function createTenantDenyPolicy(
  organizationId: string,
  input: CreateTenantDenyPolicyRequest,
): Promise<TenantDenyPolicyResponse> {
  return requestJson<TenantDenyPolicyResponse>(`${organizationApiPath(organizationId)}/deny-policies`, {
    method: "POST",
    body: input,
  });
}

export function revokeTenantDenyPolicy(
  organizationId: string,
  policyId: string,
  input: RevokeTenantDenyPolicyRequest,
): Promise<RevokeTenantDenyPolicyResponse> {
  return requestJson<RevokeTenantDenyPolicyResponse>(
    `${organizationApiPath(organizationId)}/deny-policies/${encodeURIComponent(policyId)}`,
    { method: "PATCH", body: input },
  );
}
