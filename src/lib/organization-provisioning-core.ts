/**
 * Pure Organization provisioning contract: request validation, error taxonomy
 * and the narrow response DTO.
 *
 * This module deliberately has no imports. It must stay framework-, server-
 * and persistence-independent so the request/response contract can be tested
 * without a database (see tests/organization-provisioning.unit.test.mjs and the
 * pure-domain guard in tests/architecture-boundaries.unit.test.mjs).
 *
 * The only accepted business field is the Organization display name. Identity,
 * membership and role are always derived server-side from the verified
 * session, and any field that could influence them is rejected outright.
 */

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_NAME_MAX_LENGTH = 120;

export type OrganizationProvisioningErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "MEMBERSHIP_SLOT_OCCUPIED"
  | "OWNER_ROLE_UNAVAILABLE";

export class OrganizationProvisioningError extends Error {
  readonly code: OrganizationProvisioningErrorCode;

  constructor(code: OrganizationProvisioningErrorCode, message: string) {
    super(message);
    this.name = "OrganizationProvisioningError";
    this.code = code;
  }
}

export interface OrganizationProvisioningRequest {
  name: string;
}

/**
 * Fields a client must never supply. Accepting any of them would allow a caller
 * to choose the owner, the tenant identifier or the granted role.
 */
const clientControlledFields = new Set([
  "userId",
  "actorUserId",
  "ownerUserId",
  "grantActorUserId",
  "organizationId",
  "membershipId",
  "organizationMembershipId",
  "roleDefinitionId",
  "roleCode",
  "roleScope",
  "status",
  "isBreakGlass",
  "breakGlassReason",
]);

/**
 * Validates the raw request body. Returns the trimmed, accepted request or
 * throws a stable INVALID_INPUT error.
 */
export function parseOrganizationProvisioningRequest(body: unknown): OrganizationProvisioningRequest {
  if (body === undefined || body === null) {
    throw new OrganizationProvisioningError("INVALID_INPUT", "An organization name is required.");
  }
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new OrganizationProvisioningError(
      "INVALID_INPUT",
      "A JSON object request body is required.",
    );
  }

  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "name") continue;
    if (clientControlledFields.has(key)) {
      throw new OrganizationProvisioningError(
        "INVALID_INPUT",
        `The "${key}" field is not accepted. Identity, membership and role are derived from the verified session.`,
      );
    }
    throw new OrganizationProvisioningError("INVALID_INPUT", `Unsupported field "${key}".`);
  }

  const rawName = record.name;
  if (typeof rawName !== "string") {
    throw new OrganizationProvisioningError("INVALID_INPUT", "An organization name is required.");
  }

  const name = rawName.trim();
  if (name.length < ORGANIZATION_NAME_MIN_LENGTH) {
    throw new OrganizationProvisioningError(
      "INVALID_INPUT",
      `An organization name must be at least ${ORGANIZATION_NAME_MIN_LENGTH} characters.`,
    );
  }
  if (name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    throw new OrganizationProvisioningError(
      "INVALID_INPUT",
      `An organization name must be at most ${ORGANIZATION_NAME_MAX_LENGTH} characters.`,
    );
  }

  return { name };
}

export interface ProvisionedOrganizationDto {
  organization: {
    id: string;
    name: string;
    createdAt: string;
  };
  membership: {
    id: string;
    status: "ACTIVE";
    roleCode: "ORG_OWNER";
    roleScope: "ORGANIZATION";
  };
}

/** Maps persisted rows onto the narrow public DTO; never returns Prisma models. */
export function toProvisionedOrganizationDto(input: {
  organizationId: string;
  organizationName: string;
  organizationCreatedAt: Date;
  membershipId: string;
}): ProvisionedOrganizationDto {
  return {
    organization: {
      id: input.organizationId,
      name: input.organizationName,
      createdAt: input.organizationCreatedAt.toISOString(),
    },
    membership: {
      id: input.membershipId,
      status: "ACTIVE",
      roleCode: "ORG_OWNER",
      roleScope: "ORGANIZATION",
    },
  };
}
