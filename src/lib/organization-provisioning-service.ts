import "server-only";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { getCurrentSession } from "@/lib/auth-session";
import {
  OrganizationProvisioningError,
  parseOrganizationProvisioningRequest,
  toProvisionedOrganizationDto,
  type ProvisionedOrganizationDto,
} from "@/lib/organization-provisioning-core";
import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";

/**
 * Provisions the caller's first Organization and makes the caller its initial
 * ORG_OWNER in one transaction.
 *
 * Security properties:
 * - The actor is taken only from the verified Better Auth session; no request
 *   field can name the owner.
 * - The exact session row is revalidated and locked (`FOR SHARE`) inside the
 *   same transaction as the writes, so a revoked or expired session cannot
 *   provision (the same linearization the protected tenant path uses).
 * - The Organization ID is generated server-side. `core.organization` is
 *   guarded by RLS (`id = app.organization_id`), so the transaction-local
 *   `app.organization_id` GUC is installed with the new ID before the insert.
 *   A restricted runtime role therefore creates exactly the row it declared,
 *   never an existing tenant.
 * - The one-ACTIVE-OrganizationMembership-per-user rule in the database
 *   (`organization_membership_user_slot_key`) is enforced explicitly for a
 *   stable error and again by the unique index under concurrency.
 *
 * Audit evidence: SAP Core has no approved general audit store yet. The only
 * existing audit tables are purpose-built for role-definition governance,
 * break-glass access and DENY policies, and none of them can record an
 * Organization creation without inventing semantics. This operation therefore
 * records no audit row; closing that gap requires a `system.audit_event`
 * design (see docs/phase-0.3/audit-findings.md, finding A-10).
 */
export async function provisionOrganizationForCurrentUser(
  input: unknown,
): Promise<ProvisionedOrganizationDto> {
  // Validate the contract before touching the session or the database.
  const request = parseOrganizationProvisioningRequest(input);

  const session = await getCurrentSession();
  if (!session?.session?.id || !session.user?.id) {
    throw new OrganizationProvisioningError(
      "UNAUTHENTICATED",
      "A verified authenticated session is required.",
    );
  }
  const actorUserId = session.user.id;

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock and revalidate the exact session before any tenant context work.
      await lockVerifiedSessionRow(
        (statement, values = []) => tx.$queryRawUnsafe<Array<{ id: string }>>(statement, ...values),
        { sessionId: session.session.id, userId: actorUserId },
      );

      // Actor identity is trusted only because it came from the verified session.
      await tx.$queryRaw`SELECT set_config('app.user_id', ${actorUserId}, true)`;

      // Fail fast on the documented one-current-membership slot rule. Under RLS
      // the actor-bootstrap policy exposes only the actor's own ACTIVE rows, so
      // the unique index below remains the authoritative guard for SUSPENDED
      // rows and concurrent requests.
      const existingMemberships = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT om."id"::text AS "id"
        FROM "core"."organization_membership" om
        WHERE om."userId" = ${actorUserId}
          AND om."status" IN (
            'ACTIVE'::"core"."OrganizationMembershipStatus",
            'SUSPENDED'::"core"."OrganizationMembershipStatus"
          )
        LIMIT 1
      `;
      if (existingMemberships.length > 0) {
        throw new OrganizationProvisioningError(
          "MEMBERSHIP_SLOT_OCCUPIED",
          "This user already holds a current Organization membership and cannot provision another Organization.",
        );
      }

      // The built-in ORG_OWNER role definition is a global SYSTEM catalog row.
      // Resolve it before writing anything so a missing catalog row fails the
      // transaction without any partial provisioning.
      const ownerRoleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT rd."id"::text AS "id"
        FROM "core"."role_definition" rd
        WHERE rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
          AND rd."code" = 'ORG_OWNER'
          AND rd."disabled_at" IS NULL
        LIMIT 1
      `;
      const ownerRoleId = ownerRoleRows[0]?.id;
      if (!ownerRoleId) {
        throw new OrganizationProvisioningError(
          "OWNER_ROLE_UNAVAILABLE",
          "The ORG_OWNER role definition is not available.",
        );
      }

      const organizationId = randomUUID();
      const membershipId = randomUUID();

      // RLS: the Organization policy is `id = app.organization_id`. Installing
      // the new tenant context here scopes every following write to this row.
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;

      const organization = await tx.organization.create({
        data: { id: organizationId, name: request.name },
        select: { id: true, createdAt: true },
      });

      const membership = await tx.organizationMembership.create({
        data: {
          id: membershipId,
          userId: actorUserId,
          organizationId: organization.id,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      await tx.organizationRoleAssignment.create({
        data: {
          organizationMembershipId: membership.id,
          roleDefinitionId: ownerRoleId,
          roleScope: "ORGANIZATION",
          grantActorUserId: actorUserId,
          isBreakGlass: false,
        },
        select: { id: true },
      });

      return toProvisionedOrganizationDto({
        organizationId: organization.id,
        organizationName: request.name,
        organizationCreatedAt: organization.createdAt,
        membershipId: membership.id,
      });
    });
  } catch (error) {
    if (error instanceof OrganizationProvisioningError) {
      throw error;
    }
    if (isMembershipSlotViolation(error)) {
      // Concurrent provisioning: the unique slot index rejected the loser.
      // Its Organization insert rolls back with the transaction, so no orphan
      // Organization is left behind.
      throw new OrganizationProvisioningError(
        "MEMBERSHIP_SLOT_OCCUPIED",
        "This user already holds a current Organization membership and cannot provision another Organization.",
      );
    }
    throw error;
  }
}

function isMembershipSlotViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  const text = Array.isArray(target)
    ? target.join(",")
    : typeof target === "string"
      ? target
      : "";

  // The only reachable unique conflict is the current-membership slot index
  // (`organization_membership_user_slot_key`); every other key uses a
  // server-generated random UUID. An unreported target is treated as that
  // conflict rather than leaking a generic database error.
  return (
    text === "" ||
    text.includes("organization_membership_user_slot_key") ||
    text.includes("userId")
  );
}
