import {
  authorizationPermissions,
  evaluateAuthorization,
  type AuthorizationPermission,
  type AuthorizationRoleGrant,
  type AuthorizationScope,
  type ExplicitPermissionDeny,
} from "./authorization-policy-core.ts";
import type {
  RoleAssignmentGrantAuthorization,
  RoleAssignmentListAuthorization,
} from "./role-assignment-service.ts";
import type { ScopedAccessSession } from "./scoped-access-service.ts";

type AssignableScope = "ORGANIZATION" | "COMPANY" | "PLANT";

interface TargetContext {
  scope: AssignableScope;
  organizationId: string;
  companyId: string | null;
  plantId: string | null;
  scopeId: string;
}

interface PersistedGrantRow {
  assignmentId: string;
  roleCode: string;
  roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  roleScope: AuthorizationScope;
  scopeId: string;
  ownerOrganizationId: string | null;
  permissionCode: string;
  effect: "ALLOW" | "DENY";
}

const permissionSet = new Set<string>(authorizationPermissions);
const builtInRoles = new Set([
  "ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER",
  "COMPANY_ADMIN", "COMPANY_MEMBER",
  "PLANT_MANAGER", "PLANT_OPERATOR", "PLANT_VIEWER",
]);

export class RoleAssignmentAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleAssignmentAuthorizationError";
  }
}

async function resolveTarget(
  session: ScopedAccessSession,
  organizationId: string,
  scope: AssignableScope,
  parentId: string,
  expectedUserId?: string,
): Promise<TargetContext | null> {
  if (scope === "ORGANIZATION") {
    const rows = await session.query<{
      id: string; organizationId: string; userId: string; status: string;
    }>(
      `SELECT "id"::text AS "id", "organizationId"::text AS "organizationId",
              "userId", "status"::text AS "status"
       FROM "core"."organization_membership"
       WHERE "id" = $1 AND "organizationId" = $2::uuid
         AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
       LIMIT 1 FOR SHARE`,
      [parentId, organizationId],
    );
    const target = rows[0];
    if (!target || (expectedUserId && target.userId !== expectedUserId)) return null;
    return { scope, organizationId, companyId: null, plantId: null, scopeId: organizationId };
  }

  if (scope === "COMPANY") {
    const rows = await session.query<{
      id: string; organizationId: string; companyId: string; userId: string;
    }>(
      `SELECT cm."id"::text AS "id", cm."organizationId"::text AS "organizationId",
              cm."companyId"::text AS "companyId", cm."userId"
       FROM "core"."company_membership" cm
       JOIN "core"."organization_membership" om
         ON om."id" = cm."organizationMembershipId"
        AND om."userId" = cm."userId"
        AND om."organizationId" = cm."organizationId"
        AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
       WHERE cm."id" = $1 AND cm."organizationId" = $2::uuid
         AND cm."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
       LIMIT 1 FOR SHARE OF cm, om`,
      [parentId, organizationId],
    );
    const target = rows[0];
    if (!target || (expectedUserId && target.userId !== expectedUserId)) return null;
    return {
      scope, organizationId, companyId: target.companyId, plantId: null, scopeId: target.companyId,
    };
  }

  const rows = await session.query<{
    id: string; organizationId: string; companyId: string; plantId: string; userId: string;
  }>(
    `SELECT pa."id"::text AS "id", pa."organizationId"::text AS "organizationId",
            pa."companyId"::text AS "companyId", pa."plantId"::text AS "plantId",
            pa."userId"
     FROM "core"."plant_assignment" pa
     JOIN "core"."company_membership" cm
       ON cm."id" = pa."companyMembershipId"
      AND cm."userId" = pa."userId"
      AND cm."organizationId" = pa."organizationId"
      AND cm."companyId" = pa."companyId"
      AND cm."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
     JOIN "core"."organization_membership" om
       ON om."id" = cm."organizationMembershipId"
      AND om."userId" = cm."userId"
      AND om."organizationId" = cm."organizationId"
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     WHERE pa."id" = $1 AND pa."organizationId" = $2::uuid
       AND pa."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
     LIMIT 1 FOR SHARE OF pa, cm, om`,
    [parentId, organizationId],
  );
  const target = rows[0];
  if (!target || (expectedUserId && target.userId !== expectedUserId)) return null;
  return {
    scope, organizationId, companyId: target.companyId, plantId: target.plantId, scopeId: target.plantId,
  };
}

async function loadActorGrants(
  session: ScopedAccessSession,
  actorUserId: string,
  target: TargetContext,
): Promise<{ grants: AuthorizationRoleGrant[]; denies: ExplicitPermissionDeny[] }> {
  const rows = await session.query<PersistedGrantRow>(
    `SELECT ra."id"::text AS "assignmentId", rd."code" AS "roleCode",
       rd."kind"::text AS "roleKind", rd."scope"::text AS "roleScope",
       om."organizationId"::text AS "scopeId",
       rd."ownerOrganizationId"::text AS "ownerOrganizationId",
       pd."code" AS "permissionCode", g."effect"::text AS "effect"
     FROM "core"."organization_role_assignment" ra
     JOIN "core"."organization_membership" om
       ON om."id" = ra."organizationMembershipId"
      AND om."userId" = $1 AND om."organizationId" = $2::uuid
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     JOIN "core"."role_definition" rd
       ON rd."id" = ra."roleDefinitionId" AND rd."scope" = ra."role_scope"
      AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
      AND rd."disabled_at" IS NULL AND rd."permissions_locked_at" IS NOT NULL
      AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
          AND rd."ownerOrganizationId" = om."organizationId"))
     JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
     JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
     WHERE ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE

     UNION ALL

     SELECT ra."id"::text, rd."code", rd."kind"::text, rd."scope"::text,
       cm."companyId"::text, rd."ownerOrganizationId"::text, pd."code", g."effect"::text
     FROM "core"."company_role_assignment" ra
     JOIN "core"."company_membership" cm
       ON cm."id" = ra."companyMembershipId"
      AND cm."userId" = $1 AND cm."organizationId" = $2::uuid
      AND cm."companyId" = $3::uuid
      AND cm."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
     JOIN "core"."organization_membership" om
       ON om."id" = cm."organizationMembershipId"
      AND om."userId" = cm."userId" AND om."organizationId" = cm."organizationId"
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     JOIN "core"."role_definition" rd
       ON rd."id" = ra."roleDefinitionId" AND rd."scope" = ra."role_scope"
      AND rd."scope" = 'COMPANY'::"core"."RoleScope"
      AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
      AND rd."disabled_at" IS NULL AND rd."permissions_locked_at" IS NOT NULL
     JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
     JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
     WHERE $3::uuid IS NOT NULL AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE

     UNION ALL

     SELECT ra."id"::text, rd."code", rd."kind"::text, rd."scope"::text,
       pa."plantId"::text, rd."ownerOrganizationId"::text, pd."code", g."effect"::text
     FROM "core"."plant_role_assignment" ra
     JOIN "core"."plant_assignment" pa
       ON pa."id" = ra."plantAssignmentId"
      AND pa."userId" = $1 AND pa."organizationId" = $2::uuid
      AND pa."companyId" = $3::uuid AND pa."plantId" = $4::uuid
      AND pa."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
     JOIN "core"."company_membership" cm
       ON cm."id" = pa."companyMembershipId"
      AND cm."userId" = pa."userId" AND cm."organizationId" = pa."organizationId"
      AND cm."companyId" = pa."companyId"
      AND cm."status" = 'ACTIVE'::"core"."ScopedAccessStatus"
     JOIN "core"."organization_membership" om
       ON om."id" = cm."organizationMembershipId"
      AND om."userId" = cm."userId" AND om."organizationId" = cm."organizationId"
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     JOIN "core"."role_definition" rd
       ON rd."id" = ra."roleDefinitionId" AND rd."scope" = ra."role_scope"
      AND rd."scope" = 'PLANT'::"core"."RoleScope"
      AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
      AND rd."disabled_at" IS NULL AND rd."permissions_locked_at" IS NOT NULL
     JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
     JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
     WHERE $4::uuid IS NOT NULL AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE`,
    [actorUserId, target.organizationId, target.companyId, target.plantId],
  );

  const byAssignment = new Map<string, {
    roleCode: string; roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM"; scope: AuthorizationScope;
    scopeId: string; ownerOrganizationId: string | null;
    allow: AuthorizationPermission[]; deny: AuthorizationPermission[];
  }>();
  for (const row of rows) {
    if (
      !permissionSet.has(row.permissionCode)
      || (row.roleKind === "SYSTEM" && !builtInRoles.has(row.roleCode))
      || (row.roleKind !== "SYSTEM" && row.roleKind !== "ORGANIZATION_CUSTOM")
      || (row.effect !== "ALLOW" && row.effect !== "DENY")
      || !["ORGANIZATION", "COMPANY", "PLANT"].includes(row.roleScope)
    ) {
      throw new RoleAssignmentAuthorizationError("Persisted role grants contain an unknown or invalid policy identifier.");
    }
    if (row.roleKind === "ORGANIZATION_CUSTOM" &&
      (row.roleScope !== "ORGANIZATION" || row.ownerOrganizationId !== target.organizationId)) {
      throw new RoleAssignmentAuthorizationError("A custom role grant does not match the target Organization owner.");
    }
    const grant = byAssignment.get(row.assignmentId) ?? {
      roleCode: row.roleCode, roleKind: row.roleKind, scope: row.roleScope,
      scopeId: row.scopeId, ownerOrganizationId: row.ownerOrganizationId, allow: [], deny: [],
    };
    (row.effect === "ALLOW" ? grant.allow : grant.deny).push(row.permissionCode as AuthorizationPermission);
    byAssignment.set(row.assignmentId, grant);
  }

  const grants: AuthorizationRoleGrant[] = [];
  const denyIndex = new Map<string, Set<AuthorizationPermission>>();
  for (const grant of byAssignment.values()) {
    grants.push({
      roleCode: grant.roleCode, roleKind: grant.roleKind, scope: grant.scope,
      scopeId: grant.scopeId, ownerOrganizationId: grant.ownerOrganizationId,
      customPermissions: [...new Set(grant.allow)], isBreakGlass: false,
    });
    if (grant.deny.length) {
      const key = `${grant.scope}:${grant.scopeId}`;
      const permissions = denyIndex.get(key) ?? new Set<AuthorizationPermission>();
      for (const permission of grant.deny) permissions.add(permission);
      denyIndex.set(key, permissions);
    }
  }
  const denies: ExplicitPermissionDeny[] = [...denyIndex].map(([key, permissions]) => {
    const separator = key.indexOf(":");
    return {
      scope: key.slice(0, separator) as AuthorizationScope,
      scopeId: key.slice(separator + 1),
      permissions: [...permissions],
    };
  });
  return { grants, denies };
}

async function authorize(
  sessionUserId: string,
  organizationId: string,
  input: RoleAssignmentGrantAuthorization | RoleAssignmentListAuthorization,
  permission: "roles.assign" | "roles.read",
  session: ScopedAccessSession,
  expectedUserId?: string,
): Promise<boolean> {
  if (input.actorUserId !== sessionUserId) {
    throw new RoleAssignmentAuthorizationError("The supplied actor does not match the verified Better Auth session.");
  }

  await session.query("SELECT set_config('app.user_id', $1, true)", [sessionUserId]);
  const actorMemberships = await session.query<{ id: string }>(
    `SELECT "id" FROM "core"."organization_membership"
     WHERE "userId" = $1 AND "organizationId" = $2::uuid
       AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     LIMIT 1 FOR SHARE`,
    [sessionUserId, organizationId],
  );
  if (!actorMemberships[0]) return false;

  await session.query(
    "SELECT set_config('app.organization_id', $1, true), set_config('app.company_id', '', true), set_config('app.plant_id', '', true)",
    [organizationId],
  );
  if (permission === "roles.assign") {
    const grantInput = input as RoleAssignmentGrantAuthorization;
    const definitions = await session.query<{
      scope: string;
      kind: string;
      ownerOrganizationId: string | null;
      disabledAt: Date | null;
      permissionsLockedAt: Date | null;
    }>(
      `SELECT "scope"::text AS "scope", "kind"::text AS "kind",
              "ownerOrganizationId"::text AS "ownerOrganizationId",
              "disabled_at" AS "disabledAt", "permissions_locked_at" AS "permissionsLockedAt"
       FROM "core"."role_definition"
       WHERE "id" = $1
       FOR SHARE`,
      [grantInput.roleDefinitionId],
    );
    const definition = definitions[0];
    if (
      !definition
      || definition.scope !== grantInput.scope
      || definition.scope === "PLATFORM"
      || definition.disabledAt !== null
      || definition.permissionsLockedAt === null
      || (definition.kind === "SYSTEM" && definition.ownerOrganizationId !== null)
      || (definition.kind === "ORGANIZATION_CUSTOM" && definition.ownerOrganizationId !== organizationId)
      || (definition.kind !== "SYSTEM" && definition.kind !== "ORGANIZATION_CUSTOM")
    ) return false;
  }

  const target = await resolveTarget(session, organizationId, input.scope, input.parentId, expectedUserId);
  if (!target) return false;

  await session.query(
    "SELECT set_config('app.company_id', $1, true), set_config('app.plant_id', $2, true)",
    [target.companyId ?? "", target.plantId ?? ""],
  );
  const loaded = await loadActorGrants(session, sessionUserId, target);
  const decision = evaluateAuthorization({
    permission,
    target: {
      scope: target.scope,
      organizationId: target.organizationId,
      ...(target.companyId ? { companyId: target.companyId } : {}),
      ...(target.plantId ? { plantId: target.plantId } : {}),
    },
    grants: loaded.grants,
    denies: loaded.denies,
  });
  return decision.allowed;
}

export function createRoleAssignmentAuthorization(sessionUserId: string, organizationId: string) {
  if (!sessionUserId || !organizationId) {
    throw new Error("A verified session user and Organization ID are required.");
  }
  return {
    authorizeGrant: (
      input: RoleAssignmentGrantAuthorization,
      session: ScopedAccessSession,
    ) => authorize(sessionUserId, organizationId, input, "roles.assign", session),
    authorizeList: (
      input: RoleAssignmentListAuthorization,
      session: ScopedAccessSession,
    ) => authorize(sessionUserId, organizationId, input, "roles.read", session, input.userId),
  };
}
