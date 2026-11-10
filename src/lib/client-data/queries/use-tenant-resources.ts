"use client";

import { useQuery } from "@tanstack/react-query";
import { getCompany, getPlant } from "../api/tenant-resources.ts";
import { clientDataKeys } from "./keys.ts";

export function useCompany(organizationId: string, companyId: string) {
  return useQuery({
    queryKey: clientDataKeys.company(organizationId, companyId),
    queryFn: ({ signal }) => getCompany(organizationId, companyId, signal),
  });
}

export function usePlant(organizationId: string, companyId: string, plantId: string) {
  return useQuery({
    queryKey: clientDataKeys.plant(organizationId, companyId, plantId),
    queryFn: ({ signal }) => getPlant(organizationId, companyId, plantId, signal),
  });
}
