import "server-only";

import { prisma } from "@/lib/prisma";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import { createOrganizationMembersReader } from "@/lib/organization-members-reader-core";

export const listOrganizationMembers = createOrganizationMembersReader({
  authorize: requireTenantPermission,
  async findMembers(organizationId) {
    return prisma.$queryRaw`
      SELECT
        om."id"::text AS "membershipId",
        om."userId" AS "userId",
        u."name" AS "name",
        u."email" AS "email",
        om."status"::text AS "status",
        om."created_at" AS "createdAt"
      FROM "core"."organization_membership" om
      JOIN "core"."user" u ON u."id" = om."userId"
      WHERE om."organizationId" = ${organizationId}::uuid
      ORDER BY om."created_at" ASC, om."id" ASC
    `;
  },
});
