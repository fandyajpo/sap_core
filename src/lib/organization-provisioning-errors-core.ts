export type OrganizationProvisioningErrorCode =
  | "INVALID_NAME"
  | "ALREADY_HAS_ORGANIZATION"
  | "MEMBERSHIP_REQUIRES_RECOVERY"
  | "OWNER_ROLE_UNAVAILABLE";

/**
 * Recognizes only the partial unique index that reserves one ACTIVE or
 * SUSPENDED organization-membership slot per user.
 */
export function isOrganizationMembershipSlotConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    meta?: { code?: unknown; constraint?: unknown; message?: unknown };
  };

  if (
    candidate.constraint === "organization_membership_user_slot_key" ||
    candidate.meta?.constraint === "organization_membership_user_slot_key"
  ) {
    return true;
  }

  return (
    candidate.code === "P2010" &&
    candidate.meta?.code === "23505" &&
    typeof candidate.meta.message === "string" &&
    /organization_membership_user_slot_key/.test(candidate.meta.message)
  );
}
