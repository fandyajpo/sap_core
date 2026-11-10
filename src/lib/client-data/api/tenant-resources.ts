import type { CompanyResponse, PlantResponse } from "../contracts.ts";
import { requestJson } from "../http.ts";
import { organizationApiPath } from "./paths.ts";

export function getCompany(
  organizationId: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<CompanyResponse> {
  return requestJson<CompanyResponse>(
    `${organizationApiPath(organizationId)}/companies/${encodeURIComponent(companyId)}`,
    { signal },
  );
}

export function getPlant(
  organizationId: string,
  companyId: string,
  plantId: string,
  signal?: AbortSignal,
): Promise<PlantResponse> {
  return requestJson<PlantResponse>(
    `${organizationApiPath(organizationId)}/companies/${encodeURIComponent(companyId)}/plants/${encodeURIComponent(plantId)}`,
    { signal },
  );
}
