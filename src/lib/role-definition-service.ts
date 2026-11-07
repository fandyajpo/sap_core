import { randomUUID } from "node:crypto";
import type { ScopedAccessDatabase, ScopedAccessSession } from "./scoped-access-service.ts";
import type { RoleScope } from "./role-assignment-service.ts";

export type CustomRoleScope = Exclude<RoleScope, "PLATFORM">;
export type RoleDefinitionAuditEventType = "CREATE" | "REVISE";

export type RoleDefinitionErrorCode =
  | "INVALID_INPUT"
  | "ACTOR_NOT_FOUND"
  | "ORGANIZATION_NOT_FOUND"
  | "ROLE_DEFINITION_NOT_FOUND"
  | "ROLE_DEFINITION_NOT_CUSTOM"
  | "ROLE_DEFINITION_VERSION_CONFLICT"
  | "ROLE_SCOPE_NOT_ALLOWED"
  | "AUTHORIZATION_DENIED";

export class RoleDefinitionError extends Error {
  readonly code: RoleDefinitionErrorCode;

  constructor(code: RoleDefinitionErrorCode, message: string) {
    super(message);
    this.name = "RoleDefinitionError";
    this.code = code;
  }
}

export interface RoleDefinitionRecord {
  id: string;
  roleFamilyId: string;
  code: string;
  version: number;
  kind: "ORGANIZATION_CUSTOM";
  scope: CustomRoleScope;
  ownerOrganizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomRoleCreateAuthorization {
  actorUserId: string;
  organizationId: string;
  code: string;
  scope: CustomRoleScope;
}

export interface CustomRoleReviseAuthorization extends CustomRoleCreateAuthorization {
  roleFamilyId: string;
  roleDefinitionId: string;
  currentVersion: number;
  nextVersion: number;
}

/** Implementations must bind the human actor to the caller's approved Organization-admin policy. */
export interface RoleDefinitionAuthorization {
  authorizeCreate(input: CustomRoleCreateAuthorization): Promise<boolean>;
  authorizeRevise(input: CustomRoleReviseAuthorization): Promise<boolean>;
}

export type CustomRoleCreateInput = CustomRoleCreateAuthorization;

/** Revisions snapshot the existing catalog fields; permission payloads are not modeled by D8-A. */
export interface CustomRoleReviseInput {
  actorUserId: string;
  roleDefinitionId: string;
  code?: string;
  scope?: CustomRoleScope;
}

type RoleDefinitionRow = RoleDefinitionRecord;

interface RoleDefinitionSourceRow {
  id: string;
  roleFamilyId: string | null;
  code: string;
  version: number;
  kind: string;
  scope: RoleScope;
  ownerOrganizationId: string | null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roleDefinitionColumns = `
  "id", "role_family_id"::text AS "roleFamilyId", "code", "version",
  "kind"::text AS "kind", "scope"::text AS "scope",
  "ownerOrganizationId"::text AS "ownerOrganizationId",
  "created_at" AS "createdAt", "updated_at" AS "updatedAt"`;

function requireUserId(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoleDefinitionError("INVALID_INPUT", `${label} is required.`);
  }
}

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new RoleDefinitionError("INVALID_INPUT", `${label} must be a UUID.`);
  }
}

function requireCode(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RoleDefinitionError("INVALID_INPUT", "Role Definition code is required.");
  }
  return value.trim();
}

function requireCustomScope(value: string): asserts value is CustomRoleScope {
  if (value !== "ORGANIZATION" && value !== "COMPANY" && value !== "PLANT") {
    throw new RoleDefinitionError(
      "ROLE_SCOPE_NOT_ALLOWED",
      "Organization-owned custom roles cannot use PLATFORM scope.",
    );
  }
}

async function requireHumanActor(session: ScopedAccessSession, actorUserId: string): Promise<void> {
  const rows = await session.query<{ id: string }>(
    `SELECT "id" FROM "core"."user" WHERE "id" = $1 FOR SHARE`,
    [actorUserId],
  );
  if (!rows[0]) {
    throw new RoleDefinitionError("ACTOR_NOT_FOUND", `Human actor ${actorUserId} does not exist.`);
  }
}

async function requireOrganization(session: ScopedAccessSession, organizationId: string): Promise<void> {
  const rows = await session.query<{ id: string }>(
    `SELECT "id" FROM "core"."organization" WHERE "id" = $1 FOR SHARE`,
    [organizationId],
  );
  if (!rows[0]) {
    throw new RoleDefinitionError("ORGANIZATION_NOT_FOUND", `Organization ${organizationId} does not exist.`);
  }
}

async function lockRoleFamily(session: ScopedAccessSession, roleFamilyId: string): Promise<void> {
  await session.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
    [roleFamilyId],
  );
}

async function writeAudit(
  session: ScopedAccessSession,
  roleDefinition: RoleDefinitionRecord,
  actorUserId: string,
  eventType: RoleDefinitionAuditEventType,
): Promise<void> {
  await session.query(
    `INSERT INTO "core"."role_definition_audit"
       ("id", "role_family_id", "role_definition_id", "owner_organization_id",
        "actor_user_id", "event_type", "version", "code", "scope", "occurred_at")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::"core"."RoleScope", NOW())`,
    [
      randomUUID(),
      roleDefinition.roleFamilyId,
      roleDefinition.id,
      roleDefinition.ownerOrganizationId,
      actorUserId,
      eventType,
      roleDefinition.version,
      roleDefinition.code,
      roleDefinition.scope,
    ],
  );
}

function requireAuthorization(authorization: RoleDefinitionAuthorization): void {
  if (
    typeof authorization?.authorizeCreate !== "function" ||
    typeof authorization?.authorizeRevise !== "function"
  ) {
    throw new Error("Organization custom-role create and revise authorization policies are required.");
  }
}

export function createRoleDefinitionService(
  database: ScopedAccessDatabase,
  authorization: RoleDefinitionAuthorization,
) {
  requireAuthorization(authorization);

  return {
    async createCustomRole(input: CustomRoleCreateInput): Promise<RoleDefinitionRecord> {
      requireUserId(input.actorUserId, "Role Definition actor user ID");
      requireUuid(input.organizationId, "Organization ID");
      const code = requireCode(input.code);
      requireCustomScope(input.scope);

      return database.transaction(async (session) => {
        await requireHumanActor(session, input.actorUserId);
        await requireOrganization(session, input.organizationId);

        const authorized = await authorization.authorizeCreate({
          actorUserId: input.actorUserId,
          organizationId: input.organizationId,
          code,
          scope: input.scope,
        });
        if (!authorized) {
          throw new RoleDefinitionError("AUTHORIZATION_DENIED", "The custom Role Definition create was not authorized.");
        }

        const roleFamilyId = randomUUID();
        await lockRoleFamily(session, roleFamilyId);
        const rows = await session.query<RoleDefinitionRow>(
          `INSERT INTO "core"."role_definition"
             ("id", "role_family_id", "code", "version", "kind", "scope",
              "ownerOrganizationId", "created_at", "updated_at")
           VALUES ($1, $2, $3, 1, 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind",
                   $4::"core"."RoleScope", $5, NOW(), NOW())
           RETURNING ${roleDefinitionColumns}`,
          [randomUUID(), roleFamilyId, code, input.scope, input.organizationId],
        );
        const roleDefinition = rows[0];
        await writeAudit(session, roleDefinition, input.actorUserId, "CREATE");
        return roleDefinition;
      });
    },

    async reviseCustomRole(input: CustomRoleReviseInput): Promise<RoleDefinitionRecord> {
      requireUserId(input.actorUserId, "Role Definition actor user ID");
      requireUuid(input.roleDefinitionId, "Role Definition ID");
      const requestedCode = input.code === undefined ? undefined : requireCode(input.code);
      if (input.scope !== undefined) {
        requireCustomScope(input.scope);
      }

      return database.transaction(async (session) => {
        await requireHumanActor(session, input.actorUserId);
        const sourceRows = await session.query<RoleDefinitionSourceRow>(
          `SELECT "id", "role_family_id"::text AS "roleFamilyId", "code", "version",
                  "kind"::text AS "kind", "scope"::text AS "scope",
                  "ownerOrganizationId"::text AS "ownerOrganizationId"
           FROM "core"."role_definition"
           WHERE "id" = $1`,
          [input.roleDefinitionId],
        );
        const source = sourceRows[0];
        if (!source) {
          throw new RoleDefinitionError(
            "ROLE_DEFINITION_NOT_FOUND",
            `Role Definition ${input.roleDefinitionId} does not exist.`,
          );
        }
        if (source.kind !== "ORGANIZATION_CUSTOM" || !source.roleFamilyId || !source.ownerOrganizationId) {
          throw new RoleDefinitionError(
            "ROLE_DEFINITION_NOT_CUSTOM",
            "Only an Organization-owned custom Role Definition can be revised by this service.",
          );
        }

        await lockRoleFamily(session, source.roleFamilyId);
        const latestRows = await session.query<RoleDefinitionSourceRow>(
          `SELECT "id", "role_family_id"::text AS "roleFamilyId", "code", "version",
                  "kind"::text AS "kind", "scope"::text AS "scope",
                  "ownerOrganizationId"::text AS "ownerOrganizationId"
           FROM "core"."role_definition"
           WHERE "role_family_id" = $1 AND "kind" = 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind"
           ORDER BY "version" DESC
           LIMIT 1
           FOR UPDATE`,
          [source.roleFamilyId],
        );
        const latest = latestRows[0];
        if (!latest || latest.id !== source.id) {
          throw new RoleDefinitionError(
            "ROLE_DEFINITION_VERSION_CONFLICT",
            "The supplied Role Definition is no longer the latest version in its family.",
          );
        }

        await requireOrganization(session, source.ownerOrganizationId);
        const code = requestedCode ?? source.code;
        const scope = input.scope ?? source.scope;
        requireCustomScope(scope);
        const nextVersion = source.version + 1;
        const authorized = await authorization.authorizeRevise({
          actorUserId: input.actorUserId,
          organizationId: source.ownerOrganizationId,
          roleFamilyId: source.roleFamilyId,
          roleDefinitionId: source.id,
          currentVersion: source.version,
          nextVersion,
          code,
          scope,
        });
        if (!authorized) {
          throw new RoleDefinitionError("AUTHORIZATION_DENIED", "The custom Role Definition revision was not authorized.");
        }

        const rows = await session.query<RoleDefinitionRow>(
          `INSERT INTO "core"."role_definition"
             ("id", "role_family_id", "code", "version", "kind", "scope",
              "ownerOrganizationId", "created_at", "updated_at")
           VALUES ($1, $2, $3, $4, 'ORGANIZATION_CUSTOM'::"core"."RoleDefinitionKind",
                   $5::"core"."RoleScope", $6, NOW(), NOW())
           RETURNING ${roleDefinitionColumns}`,
          [randomUUID(), source.roleFamilyId, code, nextVersion, scope, source.ownerOrganizationId],
        );
        const roleDefinition = rows[0];
        await writeAudit(session, roleDefinition, input.actorUserId, "REVISE");
        return roleDefinition;
      });
    },
  };
}
