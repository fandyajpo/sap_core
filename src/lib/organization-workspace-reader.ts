import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export interface CurrentWorkspace {
  organizationId: string;
  organizationName: string | null;
  membershipId: string;
}

/**
 * Resolves the signed-in user's current Organization workspace.
 *
 * This is a read-only bootstrap lookup and deliberately does not take an
 * Organization ID from the caller: the authority is the ACTIVE
 * OrganizationMembership row owned by the verified session user. A user who
 * belongs to no Organization receives null and is offered onboarding instead.
 *
 * Under the restricted runtime role the `organization_membership` bootstrap
 * policy exposes only the actor's own ACTIVE rows, so this query cannot widen
 * visibility; Organization columns are read through the same membership join.
 */
export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  const session = await getCurrentSession();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await prisma.$queryRaw<Array<{
    organizationId: string;
    organizationName: string | null;
    membershipId: string;
  }>>`
    SELECT
      o."id"::text AS "organizationId",
      o."name" AS "organizationName",
      om."id"::text AS "membershipId"
    FROM "core"."organization_membership" om
    JOIN "core"."organization" o ON o."id" = om."organizationId"
    WHERE om."userId" = ${userId}
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
    ORDER BY om."created_at" ASC
    LIMIT 1
  `;

  return rows[0] ?? null;
}
