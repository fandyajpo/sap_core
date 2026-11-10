"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { grantRoleAssignment as grantRoleAssignmentRequest, listRoleAssignments } from "../api/role-assignments.ts";
import type { GrantRoleAssignmentRequest, RoleAssignmentsQuery } from "../contracts.ts";
import { clientDataKeys } from "./keys.ts";

export function useRoleAssignments(organizationId: string, query: RoleAssignmentsQuery) {
  return useQuery({
    queryKey: clientDataKeys.roleAssignments(organizationId, query),
    queryFn: ({ signal }) => listRoleAssignments(organizationId, query, signal),
  });
}

export function createGrantRoleAssignmentMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  organizationId: string,
) {
  return {
    mutationFn: (input: GrantRoleAssignmentRequest) =>
      grantRoleAssignmentRequest(organizationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: clientDataKeys.roleAssignmentsRoot(organizationId),
      });
    },
  };
}

export function useGrantRoleAssignment(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation(createGrantRoleAssignmentMutationOptions(queryClient, organizationId));
}
