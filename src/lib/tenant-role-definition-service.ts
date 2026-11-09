import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import {
  authorizationPermissions,
  evaluateAuthorization,
  type AuthorizationPermission,
  type AuthorizationRoleGrant,
  type ExplicitPermissionDeny,
} from "@/lib/authorization-policy-core";
import { prisma } from "@/lib/prisma";
import { scopedAccess } from "@/lib/scoped-access";
import {
  createRoleDefinitionService,
  RoleDefinitionError,
  type CustomRoleCreateInput,
  type CustomRoleReviseInput,
  type RoleDefinitionRecord,
} from "@/lib/role-definition-service";
import type { ScopedAccessSession } from "@/lib/scoped-access-service";
import { requireTenantPermission } from "@/lib/tenant-authorization";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

interface PersistedOrganizationGrantRow {
  assignmentId: string;
  roleCode: string;
  roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM";
  scope: "ORGANIZATION";
  scopeId: string;
  ownerOrganizationId: string | null;
  permissionCode: string;
  effect: "ALLOW" | "DENY";
  isDelegable: boolean;
}

const knownPermissions = new Set<string>(authorizationPermissions);
const builtInRoles = new Set(["ORG_OWNER", "ORG_ADMIN", "ORG_MEMBER"]);

async function loadOrganizationGrantContext(
  session: ScopedAccessSession,
  actorUserId: string,
  organizationId: string,
): Promise<{ grants: AuthorizationRoleGrant[]; denies: ExplicitPermissionDeny[]; rows: PersistedOrganizationGrantRow[] }> {
  const rows = await session.query<PersistedOrganizationGrantRow>(
    `SELECT
       ra."id"::text AS "assignmentId",
       rd."code" AS "roleCode",
       rd."kind"::text AS "roleKind",
       rd."scope"::text AS "scope",
       om."organizationId"::text AS "scopeId",
       rd."ownerOrganizationId"::text AS "ownerOrganizationId",
       pd."code" AS "permissionCode",
       g."effect"::text AS "effect",
       pd."is_delegable" AS "isDelegable"
     FROM "core"."organization_role_assignment" ra
     JOIN "core"."organization_membership" om
       ON om."id" = ra."organizationMembershipId"
      AND om."userId" = $1
      AND om."organizationId" = $2::uuid
      AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
     JOIN "core"."role_definition" rd
       ON rd."id" = ra."roleDefinitionId"
      AND rd."scope" = ra."role_scope"
      AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
      AND rd."disabled_at" IS NULL
      AND rd."permissions_locked_at" IS NOT NULL
      AND (
        rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        OR (
          rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
          AND rd."ownerOrganizationId" = om."organizationId"
        )
      )
     JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
     JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
     WHERE ra."revoked_at" IS NULL
       AND ra."is_break_glass" = FALSE`,
    [actorUserId, organizationId],
  );

  const byAssignment = new Map<string, {
    roleCode: string;
    roleKind: "SYSTEM" | "ORGANIZATION_CUSTOM";
    scopeId: string;
    ownerOrganizationId: string | null;
    allow: AuthorizationPermission[];
    deny: AuthorizationPermission[];
  }>();
  for (const row of rows) {
    if (
      !knownPermissions.has(row.permissionCode)
      || (row.roleKind === "SYSTEM" && !builtInRoles.has(row.roleCode))
      || (row.roleKind !== "SYSTEM" && row.roleKind !== "ORGANIZATION_CUSTOM")
      || (row.effect !== "ALLOW" && row.effect !== "DENY")
      || row.scope !== "ORGANIZATION"
      || (row.roleKind === "ORGANIZATION_CUSTOM" && row.ownerOrganizationId !== organizationId)
    ) {
      throw new RoleDefinitionError("AUTHORIZATION_DENIED", "Persisted Organization role grants contain an invalid policy identifier or owner.");
    }
    let grant = byAssignment.get(row.assignmentId);
    if (!grant) {
      grant = {
        roleCode: row.roleCode,
        roleKind: row.roleKind,
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
  const denyPermissions = new Set<AuthorizationPermission>();
  for (const grant of byAssignment.values()) {
    grants.push({
      roleCode: grant.roleCode,
      roleKind: grant.roleKind,
      scope: "ORGANIZATION",
      scopeId: grant.scopeId,
      ownerOrganizationId: grant.ownerOrganizationId,
      customPermissions: [...new Set(grant.allow)],
      isBreakGlass: false,
    });
    for (const permission of grant.deny) denyPermissions.add(permission);
  }
  const denies: ExplicitPermissionDeny[] = denyPermissions.size
    ? [{ scope: "ORGANIZATION", scopeId: organizationId, permissions: [...denyPermissions] }]
    : [];
  return { grants, denies, rows };
}

function createAuthorization(sessionUserId: string) {
  return {
    async initializeContext(
      input: { actorUserId: string; organizationId: string },
      transaction: ScopedAccessSession,
    ) {
      if (input.actorUserId !== sessionUserId) {
        throw new RoleDefinitionError("AUTHORIZATION_DENIED", "Role Definition actor does not match the verified session.");
      }
      await transaction.query("SELECT set_config('app.user_id', $1, true)", [sessionUserId]);
      const memberships = await transaction.query<{ id: string }>(
        `SELECT "id" FROM "core"."organization_membership"
         WHERE "userId" = $1
           AND "organizationId" = $2::uuid
           AND "status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
         LIMIT 1`,
        [sessionUserId, input.organizationId],
      );
      if (!memberships[0]) {
        throw new RoleDefinitionError("AUTHORIZATION_DENIED", "An active Organization membership is required.");
      }
      await transaction.query(
        "SELECT set_config('app.organization_id', $1, true), set_config('app.company_id', '', true), set_config('app.plant_id', '', true)",
        [input.organizationId],
      );
    },

    async getDelegablePermissions(
      input: { actorUserId: string; organizationId: string },
      transaction: ScopedAccessSession,
    ): Promise<readonly AuthorizationPermission[]> {
      const loaded = await loadOrganizationGrantContext(transaction, input.actorUserId, input.organizationId);
      const allowed = new Set(
        loaded.rows
          .filter((row) => row.effect === "ALLOW" && row.isDelegable)
          .map((row) => row.permissionCode as AuthorizationPermission),
      );
      const denied = new Set(loaded.denies.flatMap((entry) => entry.permissions));
      return [...allowed].filter((permission) => !denied.has(permission));
    },

    async authorizeCreate(
      input: { actorUserId: string; organizationId: string; code: string; scope: "ORGANIZATION"; permissions: readonly AuthorizationPermission[] },
      transaction: ScopedAccessSession,
    ): Promise<boolean> {
      const loaded = await loadOrganizationGrantContext(transaction, input.actorUserId, input.organizationId);
      return evaluateAuthorization({
        permission: "roles.create",
        target: { scope: "ORGANIZATION", organizationId: input.organizationId },
        grants: loaded.grants,
        denies: loaded.denies,
      }).allowed;
    },

    async authorizeRevise(
      input: { actorUserId: string; organizationId: string; code: string; scope: "ORGANIZATION"; permissions: readonly AuthorizationPermission[]; roleFamilyId: string; roleDefinitionId: string; currentVersion: number; nextVersion: number },
      transaction: ScopedAccessSession,
    ): Promise<boolean> {
      const loaded = await loadOrganizationGrantContext(transaction, input.actorUserId, input.organizationId);
      return evaluateAuthorization({
        permission: "roles.revise",
        target: { scope: "ORGANIZATION", organizationId: input.organizationId },
        grants: loaded.grants,
        denies: loaded.denies,
      }).allowed;
    },
  };
}

async function getVerifiedActor(): Promise<string> {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new TenantTargetContextError("UNAUTHENTICATED", "A verified authenticated session is required.");
  }
  return session.user.id;
}

export async function createCustomRoleForCurrentUser(
  input: Omit<CustomRoleCreateInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const actorUserId = await getVerifiedActor();
  const service = createRoleDefinitionService(scopedAccess, createAuthorization(actorUserId));
  return service.createCustomRole({ ...input, actorUserId });
}

export async function reviseCustomRoleForCurrentUser(
  input: Omit<CustomRoleReviseInput, "actorUserId">,
): Promise<RoleDefinitionRecord> {
  const actorUserId = await getVerifiedActor();
  const service = createRoleDefinitionService(scopedAccess, createAuthorization(actorUserId));
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
  return prisma.$transaction(async (tx) => {
    await requireTenantPermission(tx, session, { kind: "ORGANIZATION", organizationId }, "roles.read");
    return tx.$queryRaw<OrganizationRoleSummary[]>\`
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
    \`;
  });
}
