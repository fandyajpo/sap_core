import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { createTenantTargetContextResolver } from "@/lib/tenant-target-context-core";

const resolveWithSession = createTenantTargetContextResolver({
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
    async findCompanyTarget(organizationId, companyId) {
      const rows = await prisma.$queryRaw<Array<{ id: string; organizationId: string }>>`
        SELECT c."id", c."organizationId"
        FROM "core"."company" c
        WHERE c."id" = ${companyId}::uuid
          AND c."organizationId" = ${organizationId}::uuid
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    async findPlantTarget(organizationId, companyId, plantId) {
      const rows = await prisma.$queryRaw<Array<{ id: string; organizationId: string; companyId: string }>>`
        SELECT p."id", p."organizationId", p."companyId"
        FROM "core"."plant" p
        JOIN "core"."company" c
          ON c."id" = p."companyId"
         AND c."organizationId" = p."organizationId"
        WHERE p."id" = ${plantId}::uuid
          AND p."organizationId" = ${organizationId}::uuid
          AND p."companyId" = ${companyId}::uuid
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
  },
});

export {
  TenantTargetContextError,
  resolveWithSession as resolveTenantTargetContext,
};
export type { TenantTargetContext } from "@/lib/tenant-target-context-core";
