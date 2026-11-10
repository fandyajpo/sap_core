"use client";

import { useQuery } from "@tanstack/react-query";
import { getCompany, getPlant } from "../api/tenant-resources.ts";
import { clientDataKeys } from "./keys.ts";

export function createCompanyQueryOptions(organizationId: string, companyId: string) {
  return {
    queryKey: clientDataKeys.company(organizationId, companyId),
    queryFn: ({ signal }: { signal: AbortSignal }) => getCompany(organizationId, companyId, signal),
    enabled: organizationId.trim().length > 0 && companyId.trim().length > 0,
  };
}

export function useCompany(organizationId: string, companyId: string) {
  return useQuery(createCompanyQueryOptions(organizationId, companyId));
}

export function createPlantQueryOptions(organizationId: string, companyId: string, plantId: string) {
  return {
    queryKey: clientDataKeys.plant(organizationId, companyId, plantId),
    queryFn: ({ signal }: { signal: AbortSignal }) => getPlant(organizationId, companyId, plantId, signal),
    enabled:
      organizationId.trim().length > 0 &&
      companyId.trim().length > 0 &&
      plantId.trim().length > 0,
  };
}

export function usePlant(organizationId: string, companyId: string, plantId: string) {
  return useQuery(createPlantQueryOptions(organizationId, companyId, plantId));
}
