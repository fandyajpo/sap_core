import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { createTenantTargetContextResolver, TenantTargetContextError } from "@/lib/tenant-target-context-core";

type AuthenticatedSession = { user: { id: string } } | null;

/**
 * Resolve target ancestry using only the caller's interactive transaction.
 * The verified Better Auth session is supplied by the outer boundary so
 * identity/session queries happen before the tenant transaction begins.
 */
export async function resolveTenantTargetContext(
  tx: Prisma.TransactionClient,
  session: AuthenticatedSession,
  request: Parameters<ReturnType<typeof createTenantTargetContextResolver>>[0],
) {
  const resolver = createTenantTargetContextResolver({
    getSession: async () => session,
    repository: {
      async findOrganizationMembership(userId, organizationId) {
        const rows = await tx.$queryRaw<Array<{ id: string; organizationId: string }>>`
          SELECT om."id", om."organizationId"
          FROM "core"."organization_membership" om
          WHERE om."userId" = ${userId}
            AND om."organizationId" = ${organizationId}::uuid
            AND om."status" = 'ACTIVE'
          LIMIT 1
          FOR SHARE OF om
        `;
        const membership = rows[0] ?? null;
        if (membership) {
          // Bootstrap policy permits only the actor's own ACTIVE membership before
          // this verified Organization context is installed.
          await tx.$queryRaw`SELECT set_config('app.organization_id', ${membership.organizationId}, true)`;
        }
        return membership;
      },
      async findCompanyTarget(organizationId, companyId) {
        const rows = await tx.$queryRaw<Array<{ id: string; organizationId: string }>>`
          SELECT c."id", c."organizationId"
          FROM "core"."company" c
          WHERE c."id" = ${companyId}::uuid
            AND c."organizationId" = ${organizationId}::uuid
          LIMIT 1
          FOR SHARE OF c
        `;
        const company = rows[0] ?? null;
        if (company) {
          await tx.$queryRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
        }
        return company;
      },
      async findPlantTarget(organizationId, companyId, plantId) {
        const rows = await tx.$queryRaw<Array<{ id: string; organizationId: string; companyId: string }>>`
          SELECT p."id", p."organizationId", p."companyId"
          FROM "core"."plant" p
          JOIN "core"."company" c
            ON c."id" = p."companyId"
           AND c."organizationId" = p."organizationId"
          WHERE p."id" = ${plantId}::uuid
            AND p."organizationId" = ${organizationId}::uuid
            AND p."companyId" = ${companyId}::uuid
          LIMIT 1
          FOR SHARE OF p, c
        `;
        const plant = rows[0] ?? null;
        if (plant) {
          await tx.$queryRaw`SELECT set_config('app.plant_id', ${plant.id}, true)`;
        }
        return plant;
      },
    },
  });

  return resolver(request);
}

export { TenantTargetContextError };
export type { TenantTargetContext } from "@/lib/tenant-target-context-core";
