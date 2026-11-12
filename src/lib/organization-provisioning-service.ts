import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { lockVerifiedSessionRow } from "@/lib/verified-session-lock";

export class OrganizationProvisioningError extends Error {
  constructor(readonly code: "INVALID_NAME" | "ALREADY_HAS_ORGANIZATION" | "OWNER_ROLE_UNAVAILABLE") {
    super(code);
    this.name = "OrganizationProvisioningError";
  }
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
        `SELECT "id" FROM "core"."user" WHERE "id" = $1 FOR UPDATE`,
        input.userId,
      );
      if (!actor[0]) throw new Error("Authenticated user no longer exists.");

      await query(
        `SELECT set_config('app.user_id', $1, true),
                set_config('app.organization_id', $2, true)`,
        input.userId,
        organizationId,
      );

      const existing = await query<{ id: string }>(
        `SELECT "id" FROM "core"."organization_membership"
          WHERE "userId" = $1 AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
          LIMIT 1`,
        input.userId,
      );
      if (existing[0]) throw new OrganizationProvisioningError("ALREADY_HAS_ORGANIZATION");

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
    const candidate = error as { code?: string; meta?: { code?: string; constraint?: string } };
    if (
      candidate?.code === "P2002" ||
      candidate?.code === "23505" ||
      candidate?.meta?.code === "23505" ||
      candidate?.meta?.constraint === "organization_membership_user_slot_key"
    ) {
      throw new OrganizationProvisioningError("ALREADY_HAS_ORGANIZATION");
    }
    throw error;
  }
}
