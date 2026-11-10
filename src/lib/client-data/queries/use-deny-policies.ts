"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  createTenantDenyPolicy as createTenantDenyPolicyRequest,
  getTenantDenyPolicyHistory,
  revokeTenantDenyPolicy as revokeTenantDenyPolicyRequest,
} from "../api/deny-policies.ts";
import type { CreateTenantDenyPolicyRequest, RevokeTenantDenyPolicyRequest } from "../contracts.ts";
import { clientDataKeys } from "./keys.ts";

export function useTenantDenyPolicyHistory(organizationId: string) {
  return useQuery({
    queryKey: clientDataKeys.tenantDenyPolicyHistory(organizationId),
    queryFn: ({ signal }) => getTenantDenyPolicyHistory(organizationId, signal),
  });
}

export function createTenantDenyPolicyMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  organizationId: string,
) {
  return {
    mutationFn: (input: CreateTenantDenyPolicyRequest) =>
      createTenantDenyPolicyRequest(organizationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataKeys.tenantDenyPolicyHistory(organizationId),
      });
    },
  };
}

export function useCreateTenantDenyPolicy(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation(createTenantDenyPolicyMutationOptions(queryClient, organizationId));
}

export function createRevokeTenantDenyPolicyMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  organizationId: string,
  policyId: string,
) {
  return {
    mutationFn: (input: RevokeTenantDenyPolicyRequest) =>
      revokeTenantDenyPolicyRequest(organizationId, policyId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataKeys.tenantDenyPolicyHistory(organizationId),
      });
    },
  };
}

export function useRevokeTenantDenyPolicy(organizationId: string, policyId: string) {
  const queryClient = useQueryClient();
  return useMutation(
    createRevokeTenantDenyPolicyMutationOptions(queryClient, organizationId, policyId),
  );
}
