import { randomUUID } from "node:crypto";

export type ScopedAccessStatus = "ACTIVE" | "SUSPENDED" | "REVOKED" | "ENDED";

export type ScopedAccessErrorCode =
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "COMPANY_NOT_FOUND"
  | "PLANT_NOT_FOUND"
  | "ORGANIZATION_MEMBERSHIP_NOT_FOUND"
  | "COMPANY_MEMBERSHIP_NOT_FOUND"
  | "PARENT_MISMATCH"
  | "PARENT_NOT_ACTIVE"
  | "COMPANY_MEMBERSHIP_NOT_ACTIVE"
  | "CURRENT_SLOT_OCCUPIED"
  | "COMPANY_MEMBERSHIP_NOT_FOUND_FOR_TRANSITION"
  | "PLANT_ASSIGNMENT_NOT_FOUND_FOR_TRANSITION"
  | "TRANSITION_NOT_ALLOWED";

export class ScopedAccessError extends Error {
  readonly code: ScopedAccessErrorCode;

  constructor(code: ScopedAccessErrorCode, message: string) {
    super(message);
    this.name = "ScopedAccessError";
    this.code = code;
  }
}

export interface ScopedAccessSession {
  query<Row extends object = Record<string, unknown>>(
    statement: string,
    values?: unknown[],
  ): Promise<Row[]>;
}

export interface ScopedAccessDatabase extends ScopedAccessSession {
  transaction<T>(work: (session: ScopedAccessSession) => Promise<T>): Promise<T>;
}

export interface CompanyMembershipRecord {
  id: string;
  userId: string;
  organizationMembershipId: string;
  organizationId: string;
  companyId: string;
  status: ScopedAccessStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlantAssignmentRecord {
  id: string;
  userId: string;
  companyMembershipId: string;
  organizationId: string;
  companyId: string;
  plantId: string;
  status: ScopedAccessStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface OrganizationMembershipRow {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
}

type CompanyMembershipParentRow = CompanyMembershipRecord;

interface PlantParentRow {
  id: string;
  organizationId: string;
  companyId: string;
}

interface LifecycleRow {
  id: string;
  userId: string;
  organizationId: string;
  companyId: string;
  status: ScopedAccessStatus;
  organizationMembershipId?: string;
  companyMembershipId?: string;
  plantId?: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const companyMembershipColumns = `
  "id", "userId", "organizationMembershipId", "organizationId", "companyId", "status",
  "created_at" AS "createdAt", "updated_at" AS "updatedAt"`;
const plantAssignmentColumns = `
  "id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status",
  "created_at" AS "createdAt", "updated_at" AS "updatedAt"`;

function requireUserId(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ScopedAccessError("INVALID_INPUT", "A non-empty user ID is required.");
  }
}

function requireUuid(value: string, label: string): void {
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new ScopedAccessError("INVALID_INPUT", `${label} must be a UUID.`);
  }
}

function requireOrgMembershipIdentity(
  membership: OrganizationMembershipRow | undefined,
  membershipId: string,
  userId: string,
  organizationId: string,
): OrganizationMembershipRow {
  if (!membership) {
    throw new ScopedAccessError(
      "ORGANIZATION_MEMBERSHIP_NOT_FOUND",
      `Organization Membership ${membershipId} does not exist.`,
    );
  }

  if (membership.userId !== userId || membership.organizationId !== organizationId) {
    throw new ScopedAccessError(
      "PARENT_MISMATCH",
      "The Organization Membership does not match the requested user and organization.",
    );
  }

  if (membership.status !== "ACTIVE") {
    throw new ScopedAccessError(
      "PARENT_NOT_ACTIVE",
      "An active Organization Membership is required.",
    );
  }

  return membership;
}

async function requireActiveOrganizationMembership(
  session: ScopedAccessSession,
  membershipId: string,
  userId: string,
  organizationId: string,
): Promise<OrganizationMembershipRow> {
  const rows = await session.query<OrganizationMembershipRow>(
    `SELECT "id", "userId", "organizationId", "status"
     FROM "core"."organization_membership"
     WHERE "id" = $1
     FOR SHARE`,
    [membershipId],
  );

  return requireOrgMembershipIdentity(rows[0], membershipId, userId, organizationId);
}

async function requireActiveCompanyMembership(
  session: ScopedAccessSession,
  membershipId: string,
  userId: string,
  organizationId: string,
  companyId: string,
): Promise<CompanyMembershipParentRow> {
  const rows = await session.query<CompanyMembershipParentRow>(
    `SELECT ${companyMembershipColumns}
     FROM "core"."company_membership"
     WHERE "id" = $1
     FOR SHARE`,
    [membershipId],
  );
  const membership = rows[0];

  if (!membership) {
    throw new ScopedAccessError(
      "COMPANY_MEMBERSHIP_NOT_FOUND",
      `Company Membership ${membershipId} does not exist.`,
    );
  }

  if (
    membership.userId !== userId ||
    membership.organizationId !== organizationId ||
    membership.companyId !== companyId
  ) {
    throw new ScopedAccessError(
      "PARENT_MISMATCH",
      "The Company Membership does not match the requested user, organization, and company.",
    );
  }

  if (membership.status !== "ACTIVE") {
    throw new ScopedAccessError(
      "COMPANY_MEMBERSHIP_NOT_ACTIVE",
      "An active Company Membership is required.",
    );
  }

  await requireActiveOrganizationMembership(
    session,
    membership.organizationMembershipId,
    userId,
    organizationId,
  );
  return membership;
}

function isUniqueViolation(error: unknown, expectedIndex: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    message?: unknown;
    meta?: { code?: unknown; constraint?: unknown; message?: unknown; target?: unknown };
  };
  const code = candidate.code ?? candidate.meta?.code;
  const constraint = candidate.constraint ?? candidate.meta?.constraint;
  const message = [candidate.message, candidate.meta?.message]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
  const target = candidate.meta?.target;
  const uniqueViolation = code === "23505" || code === "P2002";

  if (!uniqueViolation) {
    return false;
  }

  if (constraint === expectedIndex || message.includes(expectedIndex)) {
    return true;
  }

  return constraint === undefined && target === undefined;
}

async function translateSlotConflict<T>(
  operation: Promise<T>,
  indexName: string,
  scopeLabel: string,
): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (isUniqueViolation(error, indexName)) {
      throw new ScopedAccessError(
        "CURRENT_SLOT_OCCUPIED",
        `This user already has an active or suspended ${scopeLabel} assignment.`,
      );
    }
    throw error;
  }
}

async function transitionAssignment(
  database: ScopedAccessDatabase,
  kind: "company" | "plant",
  assignmentId: string,
  action: "suspend" | "restore" | "revoke" | "end",
): Promise<CompanyMembershipRecord | PlantAssignmentRecord> {
  requireUuid(assignmentId, "Assignment ID");
  const isCompany = kind === "company";
  const table = isCompany ? '"core"."company_membership"' : '"core"."plant_assignment"';
  const columns = isCompany ? companyMembershipColumns : plantAssignmentColumns;
  const missingCode = isCompany
    ? "COMPANY_MEMBERSHIP_NOT_FOUND_FOR_TRANSITION"
    : "PLANT_ASSIGNMENT_NOT_FOUND_FOR_TRANSITION";
  const label = isCompany ? "Company Membership" : "Plant Assignment";

  try {
    return await database.transaction(async (session) => {
      const rows = await session.query<LifecycleRow>(
        `SELECT ${columns}
         FROM ${table}
         WHERE "id" = $1
         FOR UPDATE`,
        [assignmentId],
      );
      const assignment = rows[0];

      if (!assignment) {
        throw new ScopedAccessError(missingCode, `${label} ${assignmentId} does not exist.`);
      }

      const allowedSourceStatuses: ScopedAccessStatus[] =
        action === "suspend"
          ? ["ACTIVE"]
          : action === "restore"
            ? ["SUSPENDED"]
            : ["ACTIVE", "SUSPENDED"];

      if (!allowedSourceStatuses.includes(assignment.status)) {
        throw new ScopedAccessError(
          "TRANSITION_NOT_ALLOWED",
          `Cannot ${action} a ${label} in ${assignment.status} status.`,
        );
      }

      if (action === "restore") {
        if (isCompany) {
          await requireActiveOrganizationMembership(
            session,
            assignment.organizationMembershipId!,
            assignment.userId,
            assignment.organizationId,
          );
        } else {
          const parent = await requireActiveCompanyMembership(
            session,
            assignment.companyMembershipId!,
            assignment.userId,
            assignment.organizationId,
            assignment.companyId,
          );
          await requireActiveOrganizationMembership(
            session,
            parent.organizationMembershipId,
            assignment.userId,
            assignment.organizationId,
          );
        }
      }

      const nextStatus: ScopedAccessStatus =
        action === "suspend"
          ? "SUSPENDED"
          : action === "restore"
            ? "ACTIVE"
            : action === "revoke"
              ? "REVOKED"
              : "ENDED";
      const updatedRows = await session.query<CompanyMembershipRecord | PlantAssignmentRecord>(
        `UPDATE ${table}
         SET "status" = $2::"core"."ScopedAccessStatus", "updated_at" = NOW()
         WHERE "id" = $1
         RETURNING ${columns}`,
        [assignmentId, nextStatus],
      );
      return updatedRows[0];
    });
  } catch (error) {
    const indexName = isCompany
      ? "company_membership_user_company_current_key"
      : "plant_assignment_user_plant_current_key";
    const scopeLabel = isCompany ? "Company Membership" : "Plant Assignment";

    if (action === "restore" && isUniqueViolation(error, indexName)) {
      throw new ScopedAccessError(
        "CURRENT_SLOT_OCCUPIED",
        `This user already has an active or suspended ${scopeLabel} assignment.`,
      );
    }
    throw error;
  }
}

export function createScopedAccessService(database: ScopedAccessDatabase) {
  return {
    async grantCompanyMembership(input: {
      userId: string;
      organizationMembershipId: string;
      companyId: string;
    }): Promise<CompanyMembershipRecord> {
      requireUserId(input.userId);
      requireUuid(input.organizationMembershipId, "Organization Membership ID");
      requireUuid(input.companyId, "Company ID");

      return translateSlotConflict(
        database.transaction(async (session) => {
          const users = await session.query<{ id: string }>(
            `SELECT "id" FROM "core"."user" WHERE "id" = $1 FOR SHARE`,
            [input.userId],
          );
          if (!users[0]) {
            throw new ScopedAccessError("USER_NOT_FOUND", `User ${input.userId} does not exist.`);
          }

          const companies = await session.query<{ id: string; organizationId: string }>(
            `SELECT "id", "organizationId"
             FROM "core"."company"
             WHERE "id" = $1
             FOR SHARE`,
            [input.companyId],
          );
          const company = companies[0];
          if (!company) {
            throw new ScopedAccessError("COMPANY_NOT_FOUND", `Company ${input.companyId} does not exist.`);
          }

          await requireActiveOrganizationMembership(
            session,
            input.organizationMembershipId,
            input.userId,
            company.organizationId,
          );

          const rows = await session.query<CompanyMembershipRecord>(
            `INSERT INTO "core"."company_membership"
               ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "created_at", "updated_at")
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE'::"core"."ScopedAccessStatus", NOW(), NOW())
             RETURNING ${companyMembershipColumns}`,
            [
              randomUUID(),
              input.userId,
              input.organizationMembershipId,
              company.organizationId,
              company.id,
            ],
          );
          return rows[0];
        }),
        "company_membership_user_company_current_key",
        "Company Membership",
      );
    },

    suspendCompanyMembership(assignmentId: string): Promise<CompanyMembershipRecord> {
      return transitionAssignment(database, "company", assignmentId, "suspend") as Promise<CompanyMembershipRecord>;
    },

    restoreCompanyMembership(assignmentId: string): Promise<CompanyMembershipRecord> {
      return translateSlotConflict(
        transitionAssignment(database, "company", assignmentId, "restore"),
        "company_membership_user_company_current_key",
        "Company Membership",
      ) as Promise<CompanyMembershipRecord>;
    },

    revokeCompanyMembership(assignmentId: string): Promise<CompanyMembershipRecord> {
      return transitionAssignment(database, "company", assignmentId, "revoke") as Promise<CompanyMembershipRecord>;
    },

    endCompanyMembership(assignmentId: string): Promise<CompanyMembershipRecord> {
      return transitionAssignment(database, "company", assignmentId, "end") as Promise<CompanyMembershipRecord>;
    },

    async grantPlantAssignment(input: {
      userId: string;
      companyMembershipId: string;
      plantId: string;
    }): Promise<PlantAssignmentRecord> {
      requireUserId(input.userId);
      requireUuid(input.companyMembershipId, "Company Membership ID");
      requireUuid(input.plantId, "Plant ID");

      return translateSlotConflict(
        database.transaction(async (session) => {
          const users = await session.query<{ id: string }>(
            `SELECT "id" FROM "core"."user" WHERE "id" = $1 FOR SHARE`,
            [input.userId],
          );
          if (!users[0]) {
            throw new ScopedAccessError("USER_NOT_FOUND", `User ${input.userId} does not exist.`);
          }

          const companyMemberships = await session.query<CompanyMembershipParentRow>(
            `SELECT ${companyMembershipColumns}
             FROM "core"."company_membership"
             WHERE "id" = $1
             FOR SHARE`,
            [input.companyMembershipId],
          );
          const companyMembership = companyMemberships[0];
          if (!companyMembership) {
            throw new ScopedAccessError(
              "COMPANY_MEMBERSHIP_NOT_FOUND",
              `Company Membership ${input.companyMembershipId} does not exist.`,
            );
          }
          if (companyMembership.userId !== input.userId) {
            throw new ScopedAccessError(
              "PARENT_MISMATCH",
              "The Company Membership does not belong to the requested user.",
            );
          }
          if (companyMembership.status !== "ACTIVE") {
            throw new ScopedAccessError(
              "COMPANY_MEMBERSHIP_NOT_ACTIVE",
              "An active Company Membership is required to grant a Plant Assignment.",
            );
          }

          const plants = await session.query<PlantParentRow>(
            `SELECT "id", "organizationId", "companyId"
             FROM "core"."plant"
             WHERE "id" = $1
             FOR SHARE`,
            [input.plantId],
          );
          const plant = plants[0];
          if (!plant) {
            throw new ScopedAccessError("PLANT_NOT_FOUND", `Plant ${input.plantId} does not exist.`);
          }
          if (
            companyMembership.organizationId !== plant.organizationId ||
            companyMembership.companyId !== plant.companyId
          ) {
            throw new ScopedAccessError(
              "PARENT_MISMATCH",
              "The Plant does not belong to the Company Membership's organization and company.",
            );
          }

          await requireActiveOrganizationMembership(
            session,
            companyMembership.organizationMembershipId,
            input.userId,
            plant.organizationId,
          );

          const rows = await session.query<PlantAssignmentRecord>(
            `INSERT INTO "core"."plant_assignment"
               ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "created_at", "updated_at")
             VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE'::"core"."ScopedAccessStatus", NOW(), NOW())
             RETURNING ${plantAssignmentColumns}`,
            [
              randomUUID(),
              input.userId,
              companyMembership.id,
              plant.organizationId,
              plant.companyId,
              plant.id,
            ],
          );
          return rows[0];
        }),
        "plant_assignment_user_plant_current_key",
        "Plant Assignment",
      );
    },

    suspendPlantAssignment(assignmentId: string): Promise<PlantAssignmentRecord> {
      return transitionAssignment(database, "plant", assignmentId, "suspend") as Promise<PlantAssignmentRecord>;
    },

    restorePlantAssignment(assignmentId: string): Promise<PlantAssignmentRecord> {
      return translateSlotConflict(
        transitionAssignment(database, "plant", assignmentId, "restore"),
        "plant_assignment_user_plant_current_key",
        "Plant Assignment",
      ) as Promise<PlantAssignmentRecord>;
    },

    revokePlantAssignment(assignmentId: string): Promise<PlantAssignmentRecord> {
      return transitionAssignment(database, "plant", assignmentId, "revoke") as Promise<PlantAssignmentRecord>;
    },

    endPlantAssignment(assignmentId: string): Promise<PlantAssignmentRecord> {
      return transitionAssignment(database, "plant", assignmentId, "end") as Promise<PlantAssignmentRecord>;
    },

    async hasCompanyAccess(userId: string, companyId: string): Promise<boolean> {
      requireUserId(userId);
      requireUuid(companyId, "Company ID");
      const rows = await database.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM "core"."company_membership" cm
           JOIN "core"."organization_membership" om
             ON om."id" = cm."organizationMembershipId"
            AND om."userId" = cm."userId"
            AND om."organizationId" = cm."organizationId"
           WHERE cm."userId" = $1
             AND cm."companyId" = $2
             AND cm."status" = 'ACTIVE'
             AND om."status" = 'ACTIVE'
         ) AS "allowed"`,
        [userId, companyId],
      );
      return rows[0]?.allowed === true;
    },

    async hasPlantAccess(userId: string, plantId: string): Promise<boolean> {
      requireUserId(userId);
      requireUuid(plantId, "Plant ID");
      const rows = await database.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM "core"."plant_assignment" pa
           JOIN "core"."company_membership" cm
             ON cm."id" = pa."companyMembershipId"
            AND cm."userId" = pa."userId"
            AND cm."organizationId" = pa."organizationId"
            AND cm."companyId" = pa."companyId"
           JOIN "core"."organization_membership" om
             ON om."id" = cm."organizationMembershipId"
            AND om."userId" = cm."userId"
            AND om."organizationId" = cm."organizationId"
           WHERE pa."userId" = $1
             AND pa."plantId" = $2
             AND pa."status" = 'ACTIVE'
             AND cm."status" = 'ACTIVE'
             AND om."status" = 'ACTIVE'
         ) AS "allowed"`,
        [userId, plantId],
      );
      return rows[0]?.allowed === true;
    },
  };
}
