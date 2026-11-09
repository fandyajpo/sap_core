import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { createTenantContextResolver } from "@/lib/tenant-context-core";

const resolveWithSession = createTenantContextResolver({
  getSession: getCurrentSession,
  repository: {
    async findOrganizationMembership(userId, organizationId) {
      const rows = await prisma.$queryRaw<Array<{ id: string; organizationId: string }>>`
        SELECT om."id", om."organizationId"
        FROM "core"."organization_membership" om
        WHERE om."userId" = ${userId}
          AND om."organizationId" = ${organizationId}::uuid
          AND om."status" = 'ACTIVE'
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    async findCompanyMembership(userId, organizationId, companyId) {
      const rows = await prisma.$queryRaw<Array<{
        organizationMembershipId: string; organizationId: string; companyMembershipId: string; companyId: string;
      }>>`
        SELECT om."id" AS "organizationMembershipId", om."organizationId",
               cm."id" AS "companyMembershipId", cm."companyId"
        FROM "core"."company_membership" cm
        JOIN "core"."organization_membership" om
          ON om."id" = cm."organizationMembershipId"
         AND om."userId" = cm."userId" AND om."organizationId" = cm."organizationId"
        JOIN "core"."company" c ON c."id" = cm."companyId" AND c."organizationId" = cm."organizationId"
        WHERE cm."userId" = ${userId}
          AND cm."organizationId" = ${organizationId}::uuid
          AND cm."companyId" = ${companyId}::uuid
          AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    async findPlantAssignment(userId, organizationId, companyId, plantId) {
      const rows = await prisma.$queryRaw<Array<{
        organizationMembershipId: string; organizationId: string; companyMembershipId: string;
        companyId: string; plantAssignmentId: string; plantId: string;
      }>>`
        SELECT om."id" AS "organizationMembershipId", om."organizationId",
               cm."id" AS "companyMembershipId", cm."companyId",
               pa."id" AS "plantAssignmentId", pa."plantId"
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
          AND pa."organizationId" = ${organizationId}::uuid
          AND pa."companyId" = ${companyId}::uuid
          AND pa."plantId" = ${plantId}::uuid
          AND pa."status" = 'ACTIVE' AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
  },
});

export { TenantContextError } from "@/lib/tenant-context-core";
export type { TenantContext, TenantScopeRequest } from "@/lib/tenant-context-core";
export const resolveTenantContext = resolveWithSession;
