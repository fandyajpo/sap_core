import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { createSessionBoundScopedAccessDatabase } from "@/lib/scoped-access";
import {
  createTenantRoleDefinitionAdapter,
} from "@/lib/tenant-role-definition-service-core";
import type {
  CustomRoleCreateInput,
  CustomRoleReviseInput,
  RoleDefinitionRecord,
} from "@/lib/role-definition-service";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export async function createCustomRoleForCurrentUser(
  input: Omit<CustomRoleCreateInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const database = createSessionBoundScopedAccessDatabase({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  return createTenantRoleDefinitionAdapter({
    database,
    getCurrentSession: async () => session,
  }).createCustomRoleForCurrentUser(input);
}

export async function reviseCustomRoleForCurrentUser(
  input: Omit<CustomRoleReviseInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const database = createSessionBoundScopedAccessDatabase({
    sessionId: session.session.id,
    userId: session.user.id,
  });
  return createTenantRoleDefinitionAdapter({
    database,
    getCurrentSession: async () => session,
  }).reviseCustomRoleForCurrentUser(input);
}

async function getVerifiedSession() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  if (!session.session?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return session;
}

export async function createCustomRoleForCurrentUser(
  input: Omit<CustomRoleCreateInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const actorUserId = session.user.id;
  const database = createSessionBoundScopedAccessDatabase({ sessionId: session.session.id, userId: actorUserId });
  const service = createRoleDefinitionService(database, createAuthorization(actorUserId));
  return service.createCustomRole({ ...input, actorUserId });
}

export async function reviseCustomRoleForCurrentUser(
  input: Omit<CustomRoleReviseInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const session = await getVerifiedSession();
  const actorUserId = session.user.id;
  const database = createSessionBoundScopedAccessDatabase({ sessionId: session.session.id, userId: actorUserId });
  const service = createRoleDefinitionService(database, createAuthorization(actorUserId));
  return service.reviseCustomRole({ ...input, actorUserId });
}

export interface OrganizationRoleSummary {
  id: string;
  code: string;
  version: number;
  kind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  scope: "ORGANIZATION";
  ownerOrganizationId: string | null;
  disabledAt: Date | null;
  permissions: string[];
}

export async function listOrganizationRoles(organizationId: string): Promise<OrganizationRoleSummary[]> {
  const session = await getCurrentSession();
  if (!session?.session?.id || !session.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return prisma.$transaction(async (tx) => {
    await requireTenantPermission(tx, session, { kind: "ORGANIZATION", organizationId }, "roles.read");
    return tx.$queryRaw<OrganizationRoleSummary[]>`
      SELECT
        rd."id"::text AS "id",
        rd."code",
        rd."version",
        rd."kind"::text AS "kind",
        rd."scope"::text AS "scope",
        rd."ownerOrganizationId"::text AS "ownerOrganizationId",
        rd."disabled_at" AS "disabledAt",
        COALESCE(
          array_agg(pd."code" ORDER BY pd."code")
            FILTER (WHERE g."effect" = 'ALLOW'::"core"."PermissionGrantEffect"),
          ARRAY[]::text[]
        ) AS "permissions"
      FROM "core"."role_definition" rd
      LEFT JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
      LEFT JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
      WHERE rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND (
          rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          OR rd."ownerOrganizationId" = ${organizationId}::uuid
        )
      GROUP BY rd."id"
      ORDER BY rd."kind"::text, rd."code", rd."version" DESC
    `;
  });
}
