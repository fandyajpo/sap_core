import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";

export class OrganizationProvisioningError extends Error {
  constructor(
    readonly code: "INVALID_NAME" | "ALREADY_HAS_ORGANIZATION" | "OWNER_ROLE_UNAVAILABLE",
    readonly organizationId?: string,
  ) {
    super(code);
    this.name = "OrganizationProvisioningError";
  }
}

function isOrganizationMembershipSlotConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    meta?: { code?: unknown; constraint?: unknown; message?: unknown };
  };

  if (
    candidate.constraint === "organization_membership_user_slot_key" ||
    candidate.meta?.constraint === "organization_membership_user_slot_key"
  ) {
    return true;
  }

  // Prisma wraps PostgreSQL raw-query errors as P2010. Only translate the
  // exact membership-slot violation; unrelated unique violations stay errors.
  return (
    candidate.code === "P2010" &&
    candidate.meta?.code === "23505" &&
    typeof candidate.meta.message === "string" &&
    /organization_membership_user_slot_key/.test(candidate.meta.message)
  );
}

export async function provisionInitialOrganization(input: {
  sessionId: string;
  userId: string;
  name: string;
}) {
  const name = input.name.trim();
  if (!name || name.length > 160) throw new OrganizationProvisioningError("INVALID_NAME");
  if (!input.sessionId || !input.userId) throw new Error("A verified session is required.");

  const organizationId = randomUUID();
  const membershipId = randomUUID();
  const assignmentId = randomUUID();
  const auditId = randomUUID();

  try {
    return await prisma.$transaction(async (tx) => {
      const query = async <T extends object>(sql: string, ...values: unknown[]) =>
        tx.$queryRawUnsafe<T[]>(sql, ...values);

      await lockVerifiedSessionRow(
        (sql, values = []) => query<{ id: string }>(sql, ...values),
        { sessionId: input.sessionId, userId: input.userId },
      );

      const actor = await query<{ id: string }>(
        `SELECT "id" FROM "core"."user" WHERE "id" = $1`,
        input.userId,
      );
      if (!actor[0]) throw new Error("Authenticated user no longer exists.");

      // Serialize bootstrap attempts across all sessions belonging to this user.
      await query(
        `SELECT pg_advisory_xact_lock(
           hashtextextended('organization-membership:' || $1, 0)
         )`,
        input.userId,
      );

      // Install only the verified actor context first. The bootstrap RLS
      // policy uses app.user_id to expose this actor's own ACTIVE membership.
      // Keep app.organization_id unset until after the membership lookup.
      await query(
        `SELECT set_config('app.user_id', $1, true)`,
        input.userId,
      );

      // Resolve the actor's existing ACTIVE membership while the bootstrap
      // RLS policy can see it. Do not install the new tenant ID before this read.
      const existing = await query<{ organizationId: string }>(
        `SELECT "organizationId"::text AS "organizationId"
           FROM "core"."organization_membership"
          WHERE "userId" = $1
            AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
          LIMIT 1`,
        input.userId,
      );
      if (existing[0]) {
        throw new OrganizationProvisioningError(
          "ALREADY_HAS_ORGANIZATION",
          existing[0].organizationId,
        );
      }

      // SUSPENDED memberships are intentionally not exposed by the current
      // actor-bootstrap SELECT policy. The partial unique index still includes
      // ACTIVE and SUSPENDED, and its exact violation is translated below.

      await query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.organization_id', $2, true)`,
        input.userId,
        organizationId,
      );

      const roles = await query<{ id: string }>(
        `SELECT "id" FROM "core"."role_definition"
          WHERE "code" = 'ORG_OWNER'
            AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
            AND "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
            AND "disabled_at" IS NULL
            AND "permissions_locked_at" IS NOT NULL
          LIMIT 1`,
      );
      if (!roles[0]) throw new OrganizationProvisioningError("OWNER_ROLE_UNAVAILABLE");

      await query(
        `INSERT INTO "core"."organization" ("id", "name", "created_at", "updated_at")
         VALUES ($1::uuid, $2, NOW(), NOW()) RETURNING "id"`,
        organizationId,
        name,
      );
      await query(
        `INSERT INTO "core"."organization_membership"
          ("id", "userId", "organizationId", "status", "created_at", "updated_at")
         VALUES ($1::uuid, $2, $3::uuid, 'ACTIVE'::"core"."OrganizationMembershipStatus", NOW(), NOW())
         RETURNING "id"`,
        membershipId,
        input.userId,
        organizationId,
      );
      await query(
        `INSERT INTO "core"."organization_role_assignment"
          ("id", "organizationMembershipId", "roleDefinitionId", "role_scope",
           "grant_actor_user_id", "is_break_glass", "break_glass_reason", "created_at")
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'ORGANIZATION'::"core"."RoleScope",
                 $4, false, NULL, NOW()) RETURNING "id"`,
        assignmentId,
        membershipId,
        roles[0].id,
        input.userId,
      );
      await query(
        `INSERT INTO "core"."organization_lifecycle_audit"
          ("id", "organization_id", "actor_user_id", "event_type", "outcome", "occurred_at")
         VALUES ($1::uuid, $2::uuid, $3, 'ORGANIZATION_CREATED', 'SUCCESS', NOW())
         RETURNING "id"`,
        auditId,
        organizationId,
        input.userId,
      );

      return { id: organizationId, name };
    });
  } catch (error) {
    if (error instanceof OrganizationProvisioningError) throw error;
    if (isOrganizationMembershipSlotConflict(error)) {
      throw new OrganizationProvisioningError("ALREADY_HAS_ORGANIZATION");
    }
    throw error;
  }
}
