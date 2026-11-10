"use client";

import { useQuery } from "@tanstack/react-query";
import { listOrganizationMembers } from "../api/organization-members.ts";
import { clientDataKeys } from "./keys.ts";

export function createOrganizationMembersQueryOptions(organizationId: string) {
  return {
    queryKey: clientDataKeys.organizationMembers(organizationId),
    queryFn: ({ signal }: { signal: AbortSignal }) => listOrganizationMembers(organizationId, signal),
    enabled: organizationId.trim().length > 0,
    gcTime: 0,
    staleTime: 0,
  };
}

export function useOrganizationMembers(organizationId: string) {
  return useQuery(createOrganizationMembersQueryOptions(organizationId));
}
