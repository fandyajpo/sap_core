import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  authorizationPermissions,
  type AuthorizationPermission,
  type AuthorizationRoleGrant,
  type AuthorizationScope,
  type ExplicitPermissionDeny,
} from "@/lib/authorization-policy-core";
import type { TenantTargetContext } from "@/lib/tenant-target-context-core";

interface PersistedGrantRow {
  assignmentId: string;
  roleDefinitionId: string;
  roleCode: string;
  roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  roleScope: AuthorizationScope;
  scopeId: string;
  ownerOrganizationId: string | null;
  permissionCode: string;
  effect: "ALLOW" | "DENY";
}

export interface LoadedAuthorizationGrants {
  actorUserId: string;
  grants: readonly AuthorizationRoleGrant[];
  denies: readonly ExplicitPermissionDeny[];
}

export class AuthorizationGrantLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationGrantLoadError";
  }
}

const permissionSet = new Set<string>(authorizationPermissions);
const builtInRoles = new Set<string>([
  "ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER",
  "COMPANY_ADMIN", "COMPANY_MEMBER",
  "PLANT_MANAGER", "PLANT_OPERATOR", "PLANT_VIEWER",
]);

export async function loadAuthorizationGrants(
  tx: Prisma.TransactionClient,
  context: TenantTargetContext,
): Promise<LoadedAuthorizationGrants> {
  const actorUserId = context.userId;
  if (context.scope !== "ORGANIZATION" && context.scope !== "COMPANY" && context.scope !== "PLANT") {
    throw new AuthorizationGrantLoadError("The tenant target scope is invalid.");
  }
  if (!context.organizationId || (context.scope !== "ORGANIZATION" && !context.companyId)) {
    throw new AuthorizationGrantLoadError("The tenant target context is incomplete.");
  }
  if (context.scope === "PLANT" && !context.plantId) {
    throw new AuthorizationGrantLoadError("A Plant target requires a Plant identifier.");
  }

  const rows = await tx.$queryRaw<PersistedGrantRow[]>`
    SELECT ra."id"::text AS "assignmentId", rd."id"::text AS "roleDefinitionId",
      rd."code" AS "roleCode", rd."kind"::text AS "roleKind",
      rd."scope"::text AS "roleScope", om."organizationId"::text AS "scopeId",
      rd."ownerOrganizationId"::text AS "ownerOrganizationId",
      pd."code" AS "permissionCode", g."effect"::text AS "effect"
    FROM "core"."organization_role_assignment" ra
    JOIN "core"."organization_membership" om
      ON om."id" = ra."organizationMembershipId"
     AND om."userId" = ${actorUserId}
     AND om."organizationId" = ${context.organizationId}::uuid
     AND om."status" = 'ACTIVE'
    JOIN "core"."role_definition" rd
      ON rd."id" = ra."roleDefinitionId"
     AND rd."scope" = ra."role_scope"
     AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
     AND rd."disabled_at" IS NULL
     AND rd."permissions_locked_at" IS NOT NULL
     AND (
       rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
       OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
           AND rd."ownerOrganizationId" = om."organizationId")
     )
    JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
    JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
    WHERE ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE

    UNION ALL

    SELECT ra."id"::text, rd."id"::text, rd."code", rd."kind"::text,
      rd."scope"::text, cm."companyId"::text, rd."ownerOrganizationId"::text,
      pd."code", g."effect"::text
    FROM "core"."company_role_assignment" ra
    JOIN "core"."company_membership" cm
      ON cm."id" = ra."companyMembershipId"
     AND cm."userId" = ${actorUserId}
     AND cm."organizationId" = ${context.organizationId}::uuid
     AND cm."companyId" = ${context.companyId}::uuid
     AND cm."status" = 'ACTIVE'
    JOIN "core"."organization_membership" om
      ON om."id" = cm."organizationMembershipId"
     AND om."userId" = cm."userId"
     AND om."organizationId" = cm."organizationId"
     AND om."status" = 'ACTIVE'
    JOIN "core"."role_definition" rd
      ON rd."id" = ra."roleDefinitionId"
     AND rd."scope" = ra."role_scope"
     AND rd."scope" = 'COMPANY'::"core"."RoleScope"
     AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
     AND rd."disabled_at" IS NULL
     AND rd."permissions_locked_at" IS NOT NULL
    JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
    JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
    WHERE ${context.companyId}::uuid IS NOT NULL
      AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE

    UNION ALL

    SELECT ra."id"::text, rd."id"::text, rd."code", rd."kind"::text,
      rd."scope"::text, pa."plantId"::text, rd."ownerOrganizationId"::text,
      pd."code", g."effect"::text
    FROM "core"."plant_role_assignment" ra
    JOIN "core"."plant_assignment" pa
      ON pa."id" = ra."plantAssignmentId"
     AND pa."userId" = ${actorUserId}
     AND pa."organizationId" = ${context.organizationId}::uuid
     AND pa."companyId" = ${context.companyId}::uuid
     AND pa."plantId" = ${context.plantId}::uuid
     AND pa."status" = 'ACTIVE'
    JOIN "core"."company_membership" cm
      ON cm."id" = pa."companyMembershipId"
     AND cm."userId" = pa."userId"
     AND cm."organizationId" = pa."organizationId"
     AND cm."companyId" = pa."companyId"
     AND cm."status" = 'ACTIVE'
    JOIN "core"."organization_membership" om
      ON om."id" = cm."organizationMembershipId"
     AND om."userId" = cm."userId"
     AND om."organizationId" = cm."organizationId"
     AND om."status" = 'ACTIVE'
    JOIN "core"."role_definition" rd
      ON rd."id" = ra."roleDefinitionId"
     AND rd."scope" = ra."role_scope"
     AND rd."scope" = 'PLANT'::"core"."RoleScope"
     AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
     AND rd."disabled_at" IS NULL
     AND rd."permissions_locked_at" IS NOT NULL
    JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
    JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
    WHERE ${context.scope} = 'PLANT'
      AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE
  `;

  const byAssignment = new Map<string, {
    roleCode: string;
    roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM";
    scope: AuthorizationScope;
    scopeId: string;
    ownerOrganizationId: string | null;
    allow: AuthorizationPermission[];
    deny: AuthorizationPermission[];
  }>();

  for (const row of rows) {
    if (
      !permissionSet.has(row.permissionCode)
      || (row.roleKind === "SYSTEM" && !builtInRoles.has(row.roleCode))
      || (row.roleKind !== "SYSTEM" && row.roleKind !== "ORGANIZATION_CUSTOM")
      || (row.effect !== "ALLOW" && row.effect !== "DENY")
    ) {
      throw new AuthorizationGrantLoadError("A persisted role grant contains an unknown or invalid policy identifier.");
    }
    if (row.roleKind === "ORGANIZATION_CUSTOM" &&
        (row.roleScope !== "ORGANIZATION" || row.ownerOrganizationId !== context.organizationId)) {
      throw new AuthorizationGrantLoadError("A custom role grant does not match the approved Organization scope or owner.");
    }

    let grant = byAssignment.get(row.assignmentId);
    if (!grant) {
      grant = {
        roleCode: row.roleCode,
        roleKind: row.roleKind,
        scope: row.roleScope,
        scopeId: row.scopeId,
        ownerOrganizationId: row.ownerOrganizationId,
        allow: [],
        deny: [],
      };
      byAssignment.set(row.assignmentId, grant);
    }
    (row.effect === "ALLOW" ? grant.allow : grant.deny).push(row.permissionCode as AuthorizationPermission);
  }

  const grants: AuthorizationRoleGrant[] = [];
  const denyIndex = new Map<string, Set<AuthorizationPermission>>();
  for (const grant of byAssignment.values()) {
    grants.push({
      roleCode: grant.roleCode,
      roleKind: grant.roleKind,
      scope: grant.scope,
      scopeId: grant.scopeId,
      ownerOrganizationId: grant.ownerOrganizationId,
      customPermissions: [...new Set(grant.allow)],
      isBreakGlass: false,
    });
    if (grant.deny.length > 0) {
      const key = `${grant.scope}:${grant.scopeId}`;
      const permissions = denyIndex.get(key) ?? new Set<AuthorizationPermission>();
      for (const permission of grant.deny) permissions.add(permission);
      denyIndex.set(key, permissions);
    }
  }

  const denies: ExplicitPermissionDeny[] = [];
  for (const [key, permissions] of denyIndex) {
    const separator = key.indexOf(":");
    denies.push({
      scope: key.slice(0, separator) as AuthorizationScope,
      scopeId: key.slice(separator + 1),
      permissions: [...permissions],
    });
  }

  return { actorUserId, grants, denies };
}
