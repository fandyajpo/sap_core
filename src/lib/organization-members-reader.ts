import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import type { OrganizationMemberSummary } from "@/lib/organization-members-reader-core";

export async function listOrganizationMembers(organizationId: string): Promise<readonly OrganizationMemberSummary[]> {
  // Better Auth reads its identity/session tables before opening the tenant transaction.
  const session = await getCurrentSession();

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { context } = await requireTenantPermission(
      tx,
      session,
      { kind: "ORGANIZATION", organizationId },
      "organization.members.read",
    );

    return tx.$queryRaw<OrganizationMemberSummary[]>\`
      SELECT
        om."id"::text AS "membershipId",
        om."userId" AS "userId",
        u."name" AS "name",
        u."email" AS "email",
        om."status"::text AS "status",
        om."created_at" AS "createdAt"
      FROM "core"."organization_membership" om
      JOIN "core"."user" u ON u."id" = om."userId"
      WHERE om."organizationId" = \${context.organizationId}::uuid
      ORDER BY om."created_at" ASC, om."id" ASC
    \`;
  });
}
