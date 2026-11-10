import { randomUUID } from "node:crypto";
import type { ScopedAccessDatabase, ScopedAccessSession } from "./scoped-access-service.ts";

export type RoleScope = "ORGANIZATION" | "COMPANY" | "PLANT" | "PLATFORM";
type AssignableRoleScope = Exclude<RoleScope, "PLATFORM">;

export type RoleAssignmentErrorCode =
  | "INVALID_INPUT"
  | "ACTOR_NOT_FOUND"
  | "ROLE_DEFINITION_NOT_FOUND"
  | "ROLE_DEFINITION_OWNERSHIP_INVALID"
  | "ROLE_DEFINITION_OWNER_MISMATCH"
  | "SCOPE_NOT_ASSIGNABLE"
  | "SCOPE_MISMATCH"
  | "SCOPE_PARENT_NOT_FOUND"
  | "AUTHORIZATION_DENIED"
  | "ROLE_ASSIGNMENT_NOT_ACTIVE"
  | "BREAK_GLASS_ACCESS_DENIED";

export class RoleAssignmentError extends Error {
  readonly code: RoleAssignmentErrorCode;

  constructor(code: RoleAssignmentErrorCode, message: string) {
    super(message);
    this.name = "RoleAssignmentError";
    this.code = code;
  }
}

export interface RoleAssignmentRecord {
  id: string;
  scope: AssignableRoleScope;
  parentId: string;
  roleDefinitionId: string;
  grantActorUserId: string | null;
  isBreakGlass: boolean;
  breakGlassReason: string | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export type RoleAssignmentGrantInput = {
  scope: AssignableRoleScope;
  parentId: string;
  roleDefinitionId: string;
  actorUserId: string;
  breakGlass?: { reason: string };
};

export interface RoleAssignmentGrantAuthorization {
  scope: AssignableRoleScope;
  parentId: string;
  roleDefinitionId: string;
  actorUserId: string;
}

export interface RoleAssignmentListAuthorization {
  actorUserId: string;
  userId: string;
  scope: AssignableRoleScope;
  parentId: string;
}

/**
 * Production adapters must derive and verify actorUserId from the current
 * authenticated session, then perform every authorization read through the
 * supplied transaction session. The target userId is not the acting principal.
 */
export interface RoleAssignmentAuthorization {
  authorizeGrant(input: RoleAssignmentGrantAuthorization, session: ScopedAccessSession): Promise<boolean>;
  authorizeList(input: RoleAssignmentListAuthorization, session: ScopedAccessSession): Promise<boolean>;
}

export type EffectiveRoleAssignmentInput = RoleAssignmentListAuthorization;

interface RoleDefinitionRow {
  id: string;
  scope: RoleScope;
  kind: string;
  ownerOrganizationId: string | null;
}

interface TypedParentRow {
  id: string;
  organizationId: string;
}

type RoleAssignmentRecordRow = RoleAssignmentRecord;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const assignmentTables = {
  ORGANIZATION: {
    table: '"core"."organization_role_assignment"',
    parentTable: '"core"."organization_membership"',
    parentColumn: '"organizationMembershipId"',
  },
  COMPANY: {
    table: '"core"."company_role_assignment"',
    parentTable: '"core"."company_membership"',
    parentColumn: '"companyMembershipId"',
  },
  PLANT: {
    table: '"core"."plant_role_assignment"',
    parentTable: '"core"."plant_assignment"',
    parentColumn: '"plantAssignmentId"',
  },
} as const;

function requireUserId(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoleAssignmentError("INVALID_INPUT", `${label} is required.`);
  }
}

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new RoleAssignmentError("INVALID_INPUT", `${label} must be a UUID.`);
  }
}

function requireAssignableScope(value: string): asserts value is AssignableRoleScope {
  if (value !== "ORGANIZATION" && value !== "COMPANY" && value !== "PLANT") {
    throw new RoleAssignmentError("SCOPE_NOT_ASSIGNABLE", "Role Assignments require a typed tenant scope.");
  }
}

async function requireHumanActor(session: ScopedAccessSession, actorUserId: string): Promise<void> {
  // The caller has already verified and locked the Better Auth session. A plain
  // existence read is sufficient here; FOR SHARE would require UPDATE privilege
  // on core.user, which the tenant runtime role intentionally does not have.
  const rows = await session.query<{ id: string }>(
    `SELECT "id" FROM "core"."user" WHERE "id" = $1`,
    [actorUserId],
  );
  if (!rows[0]) {
    throw new RoleAssignmentError("ACTOR_NOT_FOUND", `Human actor ${actorUserId} does not exist.`);
  }
}

async function requireRoleDefinition(
  session: ScopedAccessSession,
  roleDefinitionId: string,
): Promise<RoleDefinitionRow> {
  const rows = await session.query<RoleDefinitionRow>(
    `SELECT "id", "scope"::text AS "scope", "kind"::text AS "kind",
            "ownerOrganizationId"::text AS "ownerOrganizationId"
     FROM "core"."role_definition"
     WHERE "id" = $1
     FOR SHARE`,
    [roleDefinitionId],
  );
  const roleDefinition = rows[0];
  if (!roleDefinition) {
    throw new RoleAssignmentError(
      "ROLE_DEFINITION_NOT_FOUND",
      `Role Definition ${roleDefinitionId} does not exist.`,
    );
  }
  return roleDefinition;
}

async function requireTypedParent(
  session: ScopedAccessSession,
  scope: AssignableRoleScope,
  parentId: string,
): Promise<TypedParentRow> {
  const mapping = assignmentTables[scope];
  const rows = await session.query<TypedParentRow>(
    `SELECT "id", "organizationId"::text AS "organizationId"
     FROM ${mapping.parentTable} WHERE "id" = $1 FOR SHARE`,
    [parentId],
  );
  const parent = rows[0];
  if (!parent) {
    throw new RoleAssignmentError(
      "SCOPE_PARENT_NOT_FOUND",
      `The ${scope} Role Assignment parent ${parentId} does not exist in its typed table.`,
    );
  }
  return parent;
}

function assertRoleDefinitionOwnership(roleDefinition: RoleDefinitionRow, organizationId: string): void {
  if (roleDefinition.kind === "SYSTEM" && roleDefinition.ownerOrganizationId === null) {
    return;
  }
  if (roleDefinition.kind !== "ORGANIZATION_CUSTOM" || roleDefinition.ownerOrganizationId === null) {
    throw new RoleAssignmentError(
      "ROLE_DEFINITION_OWNERSHIP_INVALID",
      "The Role Definition has an invalid kind and Organization owner combination.",
    );
  }
  if (roleDefinition.ownerOrganizationId !== organizationId) {
    throw new RoleAssignmentError(
      "ROLE_DEFINITION_OWNER_MISMATCH",
      "An Organization-owned custom Role Definition can only be assigned within its owning Organization.",
    );
  }
}

function effectiveAssignmentQuery(input: EffectiveRoleAssignmentInput, enforceRoleDefinitionGovernance = false): string {
  const governanceFilter = enforceRoleDefinitionGovernance
    ? ' AND rd."disabled_at" IS NULL AND rd."permissions_locked_at" IS NOT NULL'
    : "";
  const parent = assignmentTables[input.scope];
  const baseColumns = `
    ra."id",
    '${input.scope}'::text AS "scope",
    ra.${parent.parentColumn}::text AS "parentId",
    ra."roleDefinitionId",
    ra."grant_actor_user_id" AS "grantActorUserId",
    ra."is_break_glass" AS "isBreakGlass",
    ra."break_glass_reason" AS "breakGlassReason",
    ra."created_at" AS "createdAt",
    ra."revoked_at" AS "revokedAt"`;

  if (input.scope === "ORGANIZATION") {
    return `SELECT ${baseColumns}
      FROM ${parent.table} ra
      JOIN "core"."organization_membership" om
        ON om."id" = ra."organizationMembershipId"
      JOIN "core"."role_definition" rd
        ON rd."id" = ra."roleDefinitionId"
      WHERE om."userId" = $1 AND om."id" = $2 AND om."status" = 'ACTIVE'
        AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
            AND rd."ownerOrganizationId" = om."organizationId"))
        AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE${governanceFilter}
      FOR SHARE OF ra, om, rd`;
  }

  if (input.scope === "COMPANY") {
    return `SELECT ${baseColumns}
      FROM ${parent.table} ra
      JOIN "core"."company_membership" cm
        ON cm."id" = ra."companyMembershipId"
      JOIN "core"."organization_membership" om
        ON om."id" = cm."organizationMembershipId"
       AND om."userId" = cm."userId"
       AND om."organizationId" = cm."organizationId"
      JOIN "core"."role_definition" rd
        ON rd."id" = ra."roleDefinitionId"
      WHERE cm."userId" = $1 AND cm."id" = $2
        AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
        AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
            AND rd."ownerOrganizationId" = cm."organizationId"))
        AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE${governanceFilter}
      FOR SHARE OF ra, cm, om, rd`;
  }

  return `SELECT ${baseColumns}
    FROM ${parent.table} ra
    JOIN "core"."plant_assignment" pa
      ON pa."id" = ra."plantAssignmentId"
    JOIN "core"."company_membership" cm
      ON cm."id" = pa."companyMembershipId"
     AND cm."userId" = pa."userId"
     AND cm."organizationId" = pa."organizationId"
     AND cm."companyId" = pa."companyId"
    JOIN "core"."organization_membership" om
      ON om."id" = cm."organizationMembershipId"
     AND om."userId" = cm."userId"
     AND om."organizationId" = cm."organizationId"
    JOIN "core"."role_definition" rd
      ON rd."id" = ra."roleDefinitionId"
    WHERE pa."userId" = $1 AND pa."id" = $2
      AND pa."status" = 'ACTIVE' AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
      AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
          AND rd."ownerOrganizationId" = pa."organizationId"))
      AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE${governanceFilter}
      FOR SHARE OF ra, pa, cm, om, rd`;
}


export function createRoleAssignmentService(
  database: ScopedAccessDatabase,
  authorization: RoleAssignmentAuthorization,
  options: { enforceRoleDefinitionGovernance?: boolean } = {},
) {
  if (
    typeof authorization?.authorizeGrant !== "function" ||
    typeof authorization?.authorizeList !== "function"
  ) {
    throw new Error("Transaction-bound Role Assignment grant and list authorization policies are required.");
  }

  return {
    async grantRoleAssignment(input: RoleAssignmentGrantInput): Promise<RoleAssignmentRecord> {
      requireAssignableScope(input.scope);
      requireUuid(input.parentId, "Role Assignment parent ID");
      requireUuid(input.roleDefinitionId, "Role Definition ID");
      requireUserId(input.actorUserId, "Grant actor user ID");
      if (input.breakGlass !== undefined) {
        throw new RoleAssignmentError(
          "BREAK_GLASS_ACCESS_DENIED",
          "Break-glass role assignments are disabled by the approved V04 tenant policy.",
        );
      }

      return database.transaction(async (session) => {
        await requireHumanActor(session, input.actorUserId);
        const roleDefinition = await requireRoleDefinition(session, input.roleDefinitionId);
        if (roleDefinition.scope === "PLATFORM") {
          throw new RoleAssignmentError(
            "SCOPE_NOT_ASSIGNABLE",
            "Platform roles cannot be assigned through tenant membership scopes.",
          );
        }
        if (roleDefinition.scope !== input.scope) {
          throw new RoleAssignmentError(
            "SCOPE_MISMATCH",
            `A ${roleDefinition.scope} Role Definition cannot be attached to a ${input.scope} parent.`,
          );
        }
        const parent = await requireTypedParent(session, input.scope, input.parentId);
        assertRoleDefinitionOwnership(roleDefinition, parent.organizationId);

        const authorizationInput: RoleAssignmentGrantAuthorization = {
          scope: input.scope,
          parentId: input.parentId,
          roleDefinitionId: input.roleDefinitionId,
          actorUserId: input.actorUserId,
        };
        if (!(await authorization.authorizeGrant(authorizationInput, session))) {
          throw new RoleAssignmentError("AUTHORIZATION_DENIED", "The Role Assignment grant was not authorized.");
        }

        const mapping = assignmentTables[input.scope];
        const rows = await session.query<RoleAssignmentRecordRow>(
          `INSERT INTO ${mapping.table}
             ("id", ${mapping.parentColumn}, "roleDefinitionId", "role_scope",
              "grant_actor_user_id", "is_break_glass", "break_glass_reason", "created_at")
           VALUES ($1, $2, $3, $4::"core"."RoleScope", $5, $6, $7, NOW())
           RETURNING
             "id", '${input.scope}'::text AS "scope",
             ${mapping.parentColumn}::text AS "parentId", "roleDefinitionId",
             "grant_actor_user_id" AS "grantActorUserId",
             "is_break_glass" AS "isBreakGlass",
             "break_glass_reason" AS "breakGlassReason",
             "created_at" AS "createdAt", "revoked_at" AS "revokedAt"`,
          [
            randomUUID(),
            input.parentId,
            input.roleDefinitionId,
            input.scope,
            input.actorUserId,
            false,
            null,
          ],
        );
        return rows[0];
      });
    },

    async listEffectiveRoleAssignments(input: EffectiveRoleAssignmentInput): Promise<RoleAssignmentRecord[]> {
      requireAssignableScope(input.scope);
      requireUserId(input.actorUserId, "Role Assignment actor user ID");
      requireUserId(input.userId, "Target user ID");
      requireUuid(input.parentId, "Role Assignment parent ID");

      return database.transaction(async (session) => {
        await requireHumanActor(session, input.actorUserId);
        if (!(await authorization.authorizeList({
          actorUserId: input.actorUserId,
          userId: input.userId,
          scope: input.scope,
          parentId: input.parentId,
        }, session))) {
          throw new RoleAssignmentError("AUTHORIZATION_DENIED", "The effective Role Assignment read was not authorized.");
        }
        const rows = await session.query<RoleAssignmentRecordRow>(
          effectiveAssignmentQuery(input, options.enforceRoleDefinitionGovernance === true),
          [input.userId, input.parentId],
        );
        return rows.map((row) => ({ ...row, scope: input.scope, parentId: input.parentId }));
      });
    },
  };
}
