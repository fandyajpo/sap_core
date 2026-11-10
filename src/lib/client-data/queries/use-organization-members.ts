"use client";

import { useQuery } from "@tanstack/react-query";
import { listOrganizationMembers } from "../api/organization-members.ts";
import { clientDataKeys } from "./keys.ts";

export function useOrganizationMembers(organizationId: string) {
  return useQuery({
    queryKey: clientDataKeys.organizationMembers(organizationId),
    queryFn: ({ signal }) => listOrganizationMembers(organizationId, signal),
  });
}
