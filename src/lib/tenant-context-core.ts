export type TenantScopeRequest =
  | { kind: "ORGANIZATION"; organizationId: string }
  | { kind: "COMPANY"; organizationId: string; companyId: string }
  | { kind: "PLANT"; organizationId: string; companyId: string; plantId: string };

export interface TenantContext {
  userId: string;
  organizationId: string;
  organizationMembershipId: string;
  companyId: string | null;
  companyMembershipId: string | null;
  plantId: string | null;
  plantAssignmentId: string | null;
  scope: TenantScopeRequest["kind"];
}

export type TenantContextErrorCode = "UNAUTHENTICATED" | "INVALID_SCOPE" | "TENANT_ACCESS_DENIED";

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;
  constructor(code: TenantContextErrorCode, message: string) {
    super(message);
    this.name = "TenantContextError";
    this.code = code;
  }
}

export interface TenantContextRepository {
  findOrganizationMembership(userId: string, organizationId: string): Promise<{ id: string; organizationId: string } | null>;
  findCompanyMembership(userId: string, organizationId: string, companyId: string): Promise<{
    organizationMembershipId: string; organizationId: string; companyMembershipId: string; companyId: string;
  } | null>;
  findPlantAssignment(userId: string, organizationId: string, companyId: string, plantId: string): Promise<{
    organizationMembershipId: string; organizationId: string; companyMembershipId: string;
    companyId: string; plantAssignmentId: string; plantId: string;
  } | null>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new TenantContextError("INVALID_SCOPE", `${label} must be a UUID.`);
  }
}

export function createTenantContextResolver(dependencies: {
  getSession: () => Promise<{ user: { id: string } } | null>;
  repository: TenantContextRepository;
}) {
  return async function resolveTenantContext(request: TenantScopeRequest): Promise<TenantContext> {
    requireUuid(request.organizationId, "Organization ID");
    if (request.kind !== "ORGANIZATION") requireUuid(request.companyId, "Company ID");
    if (request.kind === "PLANT") requireUuid(request.plantId, "Plant ID");

    const session = await dependencies.getSession();
    if (!session?.user?.id) {
      throw new TenantContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
    }
    const userId = session.user.id;

    if (request.kind === "ORGANIZATION") {
      const row = await dependencies.repository.findOrganizationMembership(userId, request.organizationId);
      if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active Organization Membership exists for this session.");
      return {
        userId, organizationId: row.organizationId, organizationMembershipId: row.id,
        companyId: null, companyMembershipId: null, plantId: null, plantAssignmentId: null, scope: "ORGANIZATION",
      };
    }

    if (request.kind === "COMPANY") {
      const row = await dependencies.repository.findCompanyMembership(userId, request.organizationId, request.companyId);
      if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active, parent-consistent Company Membership exists for this session.");
      return {
        userId, organizationId: row.organizationId, organizationMembershipId: row.organizationMembershipId,
        companyId: row.companyId, companyMembershipId: row.companyMembershipId,
        plantId: null, plantAssignmentId: null, scope: "COMPANY",
      };
    }

    const row = await dependencies.repository.findPlantAssignment(userId, request.organizationId, request.companyId, request.plantId);
    if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active, parent-consistent Plant Assignment exists for this session.");
    return {
      userId, organizationId: row.organizationId, organizationMembershipId: row.organizationMembershipId,
      companyId: row.companyId, companyMembershipId: row.companyMembershipId,
      plantId: row.plantId, plantAssignmentId: row.plantAssignmentId, scope: "PLANT",
    };
  };
}
