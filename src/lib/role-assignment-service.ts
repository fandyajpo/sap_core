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

export interface BreakGlassAccessAuditRecord {
  id: string;
  actorUserId: string;
  roleAssignmentId: string;
  scope: AssignableRoleScope;
  scopeParentId: string;
  reason: string;
  occurredAt: Date;
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
  breakGlass: boolean;
  reason: string | null;
}

export interface BreakGlassUseRequest {
  scope: AssignableRoleScope;
  scopeParentId: string;
  roleAssignmentId: string;
  actorUserId: string;
  reason: string;
}

export interface BreakGlassUseAuthorization extends BreakGlassUseRequest {
  roleDefinitionId: string;
}

/** Implementations must bind the actor to a verified session and apply the caller's approved policy. */
export interface RoleAssignmentAuthorization {
  authorizeGrant(input: RoleAssignmentGrantAuthorization): Promise<boolean>;
  authorizeBreakGlassUse(input: BreakGlassUseAuthorization): Promise<boolean>;
}

export interface EffectiveRoleAssignmentInput {
  userId: string;
  scope: AssignableRoleScope;
  parentId: string;
}

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

interface RoleAssignmentRow {
  id: string;
  roleDefinitionId: string;
}

type RoleAssignmentRecordRow = RoleAssignmentRecord;

type BreakGlassAuditRow = BreakGlassAccessAuditRecord;

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

function requireReason(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoleAssignmentError("INVALID_INPUT", `${label} is required.`);
  }
  return value.trim();
}

async function requireHumanActor(session: ScopedAccessSession, actorUserId: string): Promise<void> {
  const rows = await session.query<{ id: string }>(
    `SELECT "id" FROM "core"."user" WHERE "id" = $1 FOR SHARE`,
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

function effectiveAssignmentQuery(input: EffectiveRoleAssignmentInput): string {
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
        AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE`;
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
        AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE`;
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
      AND ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE`;
}

function breakGlassUseQuery(scope: AssignableRoleScope): string {
  const mapping = assignmentTables[scope];
  const assignmentSelect = `
    ra."id",
    ra."roleDefinitionId",
    ra.${mapping.parentColumn} AS "parentId"`;

  if (scope === "ORGANIZATION") {
    return `SELECT ${assignmentSelect}
      FROM ${mapping.table} ra
      JOIN "core"."organization_membership" om
        ON om."id" = ra."organizationMembershipId"
      JOIN "core"."role_definition" rd
        ON rd."id" = ra."roleDefinitionId"
       AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
         OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
           AND rd."ownerOrganizationId" = om."organizationId"))
      WHERE ra."id" = $1 AND om."id" = $2
        AND om."status" = 'ACTIVE' AND ra."revoked_at" IS NULL
        AND ra."is_break_glass" = TRUE
      FOR SHARE OF ra, om, rd`;
  }

  if (scope === "COMPANY") {
    return `SELECT ${assignmentSelect}
      FROM ${mapping.table} ra
      JOIN "core"."company_membership" cm
        ON cm."id" = ra."companyMembershipId"
      JOIN "core"."organization_membership" om
        ON om."id" = cm."organizationMembershipId"
       AND om."userId" = cm."userId"
       AND om."organizationId" = cm."organizationId"
      JOIN "core"."role_definition" rd
        ON rd."id" = ra."roleDefinitionId"
       AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
         OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
           AND rd."ownerOrganizationId" = cm."organizationId"))
      WHERE ra."id" = $1 AND cm."id" = $2
        AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
        AND ra."revoked_at" IS NULL AND ra."is_break_glass" = TRUE
      FOR SHARE OF ra, cm, om, rd`;
  }

  return `SELECT ${assignmentSelect}
    FROM ${mapping.table} ra
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
     AND (rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
       OR (rd."kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
         AND rd."ownerOrganizationId" = pa."organizationId"))
    WHERE ra."id" = $1 AND pa."id" = $2
      AND pa."status" = 'ACTIVE' AND cm."status" = 'ACTIVE' AND om."status" = 'ACTIVE'
      AND ra."revoked_at" IS NULL AND ra."is_break_glass" = TRUE
    FOR SHARE OF ra, pa, cm, om, rd`;
}

export function createRoleAssignmentService(
  database: ScopedAccessDatabase,
  authorization: RoleAssignmentAuthorization,
) {
  if (
    typeof authorization?.authorizeGrant !== "function" ||
    typeof authorization?.authorizeBreakGlassUse !== "function"
  ) {
    throw new Error("Role Assignment and break-glass authorization policies are required.");
  }

  return {
    async grantRoleAssignment(input: RoleAssignmentGrantInput): Promise<RoleAssignmentRecord> {
      requireAssignableScope(input.scope);
      requireUuid(input.parentId, "Role Assignment parent ID");
      requireUuid(input.roleDefinitionId, "Role Definition ID");
      requireUserId(input.actorUserId, "Grant actor user ID");
      const reason = input.breakGlass ? requireReason(input.breakGlass.reason, "Break-glass grant reason") : null;

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
          breakGlass: reason !== null,
          reason,
        };
        if (!(await authorization.authorizeGrant(authorizationInput))) {
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
            reason !== null,
            reason,
          ],
        );
        return rows[0];
      });
    },

    async listEffectiveRoleAssignments(input: EffectiveRoleAssignmentInput): Promise<RoleAssignmentRecord[]> {
      requireAssignableScope(input.scope);
      requireUserId(input.userId, "User ID");
      requireUuid(input.parentId, "Role Assignment parent ID");
      const rows = await database.query<RoleAssignmentRecordRow>(
        effectiveAssignmentQuery(input),
        [input.userId, input.parentId],
      );
      return rows.map((row) => ({ ...row, scope: input.scope, parentId: input.parentId }));
    },

    async recordBreakGlassUse(input: BreakGlassUseRequest): Promise<BreakGlassAccessAuditRecord> {
      requireAssignableScope(input.scope);
      requireUserId(input.actorUserId, "Break-glass actor user ID");
      requireUuid(input.scopeParentId, "Break-glass scope parent ID");
      requireUuid(input.roleAssignmentId, "Role Assignment ID");
      const reason = requireReason(input.reason, "Break-glass access reason");

      return database.transaction(async (session) => {
        await requireHumanActor(session, input.actorUserId);
        const rows = await session.query<RoleAssignmentRow>(
          breakGlassUseQuery(input.scope),
          [input.roleAssignmentId, input.scopeParentId],
        );
        const assignment = rows[0];
        if (!assignment) {
          throw new RoleAssignmentError(
            "ROLE_ASSIGNMENT_NOT_ACTIVE",
            "An active break-glass Role Assignment at the exact requested scope is required.",
          );
        }

        const authorizationInput: BreakGlassUseAuthorization = {
          ...input,
          roleDefinitionId: assignment.roleDefinitionId,
          reason,
        };
        if (!(await authorization.authorizeBreakGlassUse(authorizationInput))) {
          throw new RoleAssignmentError(
            "BREAK_GLASS_ACCESS_DENIED",
            "The break-glass access request was not authorized.",
          );
        }

        const auditRows = await session.query<BreakGlassAuditRow>(
          `INSERT INTO "core"."break_glass_access_audit"
             ("id", "actor_user_id", "role_assignment_id", "scope", "scope_parent_id", "reason", "occurred_at")
           VALUES ($1, $2, $3, $4::"core"."RoleScope", $5, $6, NOW())
           RETURNING
             "id", "actor_user_id" AS "actorUserId",
             "role_assignment_id" AS "roleAssignmentId", "scope"::text AS "scope",
             "scope_parent_id" AS "scopeParentId", "reason", "occurred_at" AS "occurredAt"`,
          [randomUUID(), input.actorUserId, input.roleAssignmentId, input.scope, input.scopeParentId, reason],
        );
        return auditRows[0];
      });
    },
  };
}
