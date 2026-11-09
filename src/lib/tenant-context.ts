import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new TenantContextError("INVALID_SCOPE", `${label} must be a UUID.`);
  }
}

/**
 * Resolve scope using only the verified Better Auth session identity.
 * Active membership is not a permission grant; callers must separately
 * authorize the requested business operation.
 */
export async function resolveTenantContext(request: TenantScopeRequest): Promise<TenantContext> {
  requireUuid(request.organizationId, "Organization ID");
  if (request.kind !== "ORGANIZATION") requireUuid(request.companyId, "Company ID");
  if (request.kind === "PLANT") requireUuid(request.plantId, "Plant ID");

  const session = await getCurrentSession();
  if (!session) {
    throw new TenantContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  const userId = session.user.id;

  if (request.kind === "ORGANIZATION") {
    const rows = await prisma.$queryRaw<Array<{ organizationMembershipId: string; organizationId: string }>>`
      SELECT om."id" AS "organizationMembershipId", om."organizationId" AS "organizationId"
      FROM "core"."organization_membership" om
      WHERE om."userId" = ${userId}
        AND om."organizationId" = ${request.organizationId}::uuid
        AND om."status" = 'ACTIVE'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active Organization Membership exists for this session.");
    return {
      userId, organizationId: row.organizationId, organizationMembershipId: row.organizationMembershipId,
      companyId: null, companyMembershipId: null, plantId: null, plantAssignmentId: null, scope: "ORGANIZATION",
    };
  }

  if (request.kind === "COMPANY") {
    const rows = await prisma.$queryRaw<Array<{
      organizationMembershipId: string; organizationId: string; companyMembershipId: string; companyId: string;
    }>>`
      SELECT om."id" AS "organizationMembershipId", om."organizationId" AS "organizationId",
             cm."id" AS "companyMembershipId", cm."companyId" AS "companyId"
      FROM "core"."company_membership" cm
      JOIN "core"."organization_membership" om
        ON om."id" = cm."organizationMembershipId"
       AND om."userId" = cm."userId" AND om."organizationId" = cm."organizationId"
      JOIN "core"."company" c ON c."id" = cm."companyId" AND c."organizationId" = cm."organizationId"
      WHERE cm."userId" = ${userId}
        AND cm."organizationId" = ${request.organizationId}::uuid
        AND cm."companyId" = ${request.companyId}::uuid
        AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active, parent-consistent Company Membership exists for this session.");
    return {
      userId, organizationId: row.organizationId, organizationMembershipId: row.organizationMembershipId,
      companyId: row.companyId, companyMembershipId: row.companyMembershipId,
      plantId: null, plantAssignmentId: null, scope: "COMPANY",
    };
  }

  const rows = await prisma.$queryRaw<Array<{
    organizationMembershipId: string; organizationId: string; companyMembershipId: string;
    companyId: string; plantAssignmentId: string; plantId: string;
  }>>`
    SELECT om."id" AS "organizationMembershipId", om."organizationId" AS "organizationId",
           cm."id" AS "companyMembershipId", cm."companyId" AS "companyId",
           pa."id" AS "plantAssignmentId", pa."plantId" AS "plantId"
    FROM "core"."plant_assignment" pa
    JOIN "core"."company_membership" cm
      ON cm."id" = pa."companyMembershipId" AND cm."userId" = pa."userId"
     AND cm."organizationId" = pa."organizationId" AND cm."companyId" = pa."companyId"
    JOIN "core"."organization_membership" om
      ON om."id" = cm."organizationMembershipId" AND om."userId" = cm."userId"
     AND om."organizationId" = cm."organizationId"
    JOIN "core"."plant" p
      ON p."id" = pa."plantId" AND p."organizationId" = pa."organizationId"
     AND p."companyId" = pa."companyId"
    WHERE pa."userId" = ${userId}
      AND pa."organizationId" = ${request.organizationId}::uuid
      AND pa."companyId" = ${request.companyId}::uuid
      AND pa."plantId" = ${request.plantId}::uuid
      AND pa."status" = 'ACTIVE' AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new TenantContextError("TENANT_ACCESS_DENIED", "No active, parent-consistent Plant Assignment exists for this session.");
  return {
    userId, organizationId: row.organizationId, organizationMembershipId: row.organizationMembershipId,
    companyId: row.companyId, companyMembershipId: row.companyMembershipId,
    plantId: row.plantId, plantAssignmentId: row.plantAssignmentId, scope: "PLANT",
  };
}
