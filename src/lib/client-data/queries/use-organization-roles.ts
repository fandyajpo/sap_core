"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  createOrganizationRole as createOrganizationRoleRequest,
  listOrganizationRoles,
  reviseOrganizationRole as reviseOrganizationRoleRequest,
} from "../api/organization-roles.ts";
import type {
  CreateOrganizationRoleRequest,
  ReviseOrganizationRoleRequest,
} from "../contracts.ts";
import { clientDataKeys } from "./keys.ts";

export function useOrganizationRoles(organizationId: string) {
  return useQuery({
    queryKey: clientDataKeys.organizationRoles(organizationId),
    queryFn: ({ signal }) => listOrganizationRoles(organizationId, signal),
  });
}

export function createOrganizationRoleMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  organizationId: string,
) {
  return {
    mutationFn: (input: CreateOrganizationRoleRequest) =>
      createOrganizationRoleRequest(organizationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataKeys.organizationRoles(organizationId),
      });
    },
  };
}

export function useCreateOrganizationRole(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation(createOrganizationRoleMutationOptions(queryClient, organizationId));
}

export function createReviseOrganizationRoleMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  organizationId: string,
  roleDefinitionId: string,
) {
  return {
    mutationFn: (input: ReviseOrganizationRoleRequest) =>
      reviseOrganizationRoleRequest(organizationId, roleDefinitionId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataKeys.organizationRoles(organizationId),
      });
    },
  };
}

export function useReviseOrganizationRole(organizationId: string, roleDefinitionId: string) {
  const queryClient = useQueryClient();
  return useMutation(
    createReviseOrganizationRoleMutationOptions(queryClient, organizationId, roleDefinitionId),
  );
}
