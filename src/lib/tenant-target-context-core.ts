import type { TenantScopeRequest } from "./tenant-scope-types.ts";

export interface TenantTargetContext {
  userId: string;
  organizationId: string;
  organizationMembershipId: string;
  scope: TenantScopeRequest["kind"];
  companyId: string | null;
  plantId: string | null;
}

export type TenantTargetContextErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_SCOPE"
  | "TENANT_ACCESS_DENIED";

export class TenantTargetContextError extends Error {
  readonly code: TenantTargetContextErrorCode;

  constructor(code: TenantTargetContextErrorCode, message: string) {
    super(message);
    this.name = "TenantTargetContextError";
    this.code = code;
  }
}

export interface TenantTargetRepository {
  findOrganizationMembership(userId: string, organizationId: string): Promise<{ id: string; organizationId: string } | null>;
  findCompanyTarget(organizationId: string, companyId: string): Promise<{ id: string; organizationId: string } | null>;
  findPlantTarget(organizationId: string, companyId: string, plantId: string): Promise<{
    id: string;
    organizationId: string;
    companyId: string;
  } | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new TenantTargetContextError("INVALID_SCOPE", `${label} must be a UUID.`);
  }
}

/**
 * Resolves the authenticated actor's Organization membership and validates a
 * descendant target. It deliberately does not grant permission and does not
 * require Company Membership / Plant Assignment: the authorization policy
 * decides whether the actor may administer that target or needs exact-scope
 * operational membership.
 */
export function createTenantTargetContextResolver(dependencies: {
  getSession: () => Promise<{ user: { id: string } } | null>;
  repository: TenantTargetRepository;
}) {
  return async function resolveTenantTargetContext(request: TenantScopeRequest): Promise<TenantTargetContext> {
    requireUuid(request.organizationId, "Organization ID");
    if (request.kind !== "ORGANIZATION") requireUuid(request.companyId, "Company ID");
    if (request.kind === "PLANT") requireUuid(request.plantId, "Plant ID");

    const session = await dependencies.getSession();
    if (!session?.user?.id) {
      throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
    }
    const userId = session.user.id;

    const membership = await dependencies.repository.findOrganizationMembership(userId, request.organizationId);
    if (!membership || membership.organizationId !== request.organizationId) {
      throw new TenantTargetContextError("TENANT_ACCESS_DENIED", "No active, Organization-consistent Membership exists for this session.");
    }

    if (request.kind === "ORGANIZATION") {
      return {
        userId,
        organizationId: membership.organizationId,
        organizationMembershipId: membership.id,
        scope: "ORGANIZATION",
        companyId: null,
        plantId: null,
      };
    }

    const company = await dependencies.repository.findCompanyTarget(request.organizationId, request.companyId);
    if (!company || company.id !== request.companyId || company.organizationId !== membership.organizationId) {
      throw new TenantTargetContextError("TENANT_ACCESS_DENIED", "The target Company is not a descendant of the active Organization.");
    }

    if (request.kind === "COMPANY") {
      return {
        userId,
        organizationId: membership.organizationId,
        organizationMembershipId: membership.id,
        scope: "COMPANY",
        companyId: company.id,
        plantId: null,
      };
    }

    const plant = await dependencies.repository.findPlantTarget(request.organizationId, request.companyId, request.plantId);
    if (!plant || plant.id !== request.plantId || plant.organizationId !== membership.organizationId || plant.companyId !== company.id) {
      throw new TenantTargetContextError("TENANT_ACCESS_DENIED", "The target Plant is not a descendant of the active Organization and Company.");
    }

    return {
      userId,
      organizationId: membership.organizationId,
      organizationMembershipId: membership.id,
      scope: "PLANT",
      companyId: company.id,
      plantId: plant.id,
    };
  };
}
