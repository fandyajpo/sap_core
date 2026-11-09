export const authorizationPermissions = [
  "organization.read",
  "organization.update",
  "organization.members.read",
  "organization.members.manage",
  "company.read",
  "company.manage",
  "company.members.manage",
  "plant.read",
  "plant.manage",
  "plant.assignments.manage",
  "roles.read",
  "roles.create",
  "roles.revise",
  "roles.assign",
  "audit.read",
] as const;

export type AuthorizationPermission = (typeof authorizationPermissions)[number];
export type AuthorizationScope = "ORGANIZATION" | "COMPANY" | "PLANT";
export type BuiltInTenantRole =
  | "ORG_OWNER"
  | "ORG_ADMIN"
  | "ORG_MEMBER"
  | "COMPANY_ADMIN"
  | "COMPANY_MEMBER"
  | "PLANT_MANAGER"
  | "PLANT_OPERATOR"
  | "PLANT_VIEWER";

export interface AuthorizationTarget {
  scope: AuthorizationScope;
  organizationId: string;
  companyId?: string;
  plantId?: string;
}

export interface AuthorizationRoleGrant {
  roleCode: string;
  scope: AuthorizationScope;
  scopeId: string;
  /** Present only when loaded from a trusted, server-side role-definition source. */
  customPermissions?: readonly AuthorizationPermission[];
  roleKind?: "SYSTEM" | "ORGANIZATION_CUSTOM";
  ownerOrganizationId?: string | null;
  /** Break-glass grants are excluded by the v0.1 policy. */
  isBreakGlass?: boolean;
}

export interface ExplicitPermissionDeny {
  scope: AuthorizationScope;
  scopeId: string;
  permissions: readonly AuthorizationPermission[];
}

export interface AuthorizationDecisionInput {
  permission: AuthorizationPermission;
  target: AuthorizationTarget;
  grants: readonly AuthorizationRoleGrant[];
  denies?: readonly ExplicitPermissionDeny[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: "ALLOW" | "EXPLICIT_DENY" | "NO_MATCHING_GRANT" | "INVALID_TARGET";
  matchedRole?: string;
}

const builtInRoleScopes: Record<BuiltInTenantRole, AuthorizationScope> = {
  ORG_OWNER: "ORGANIZATION",
  ORG_ADMIN: "ORGANIZATION",
  ORG_MEMBER: "ORGANIZATION",
  COMPANY_ADMIN: "COMPANY",
  COMPANY_MEMBER: "COMPANY",
  PLANT_MANAGER: "PLANT",
  PLANT_OPERATOR: "PLANT",
  PLANT_VIEWER: "PLANT",
};

const rolePermissions: Record<BuiltInTenantRole, readonly AuthorizationPermission[]> = {
  ORG_OWNER: [
    "organization.read", "organization.update", "organization.members.read", "organization.members.manage",
    "company.read", "company.manage", "company.members.manage",
    "plant.read", "plant.manage", "plant.assignments.manage",
    "roles.read", "roles.create", "roles.revise", "roles.assign", "audit.read",
  ],
  ORG_ADMIN: [
    "organization.read", "organization.update", "organization.members.read", "organization.members.manage",
    "company.read", "company.manage", "company.members.manage",
    "plant.read", "plant.manage", "plant.assignments.manage",
    "roles.read", "roles.create", "roles.revise", "roles.assign", "audit.read",
  ],
  ORG_MEMBER: ["organization.read", "organization.members.read"],
  COMPANY_ADMIN: [
    "company.read", "company.manage", "company.members.manage",
    "plant.read", "plant.manage", "plant.assignments.manage",
    "roles.read", "roles.assign", "audit.read",
  ],
  COMPANY_MEMBER: ["company.read"],
  PLANT_MANAGER: ["plant.read", "plant.manage", "plant.assignments.manage", "roles.read", "roles.assign", "audit.read"],
  PLANT_OPERATOR: ["plant.read"],
  PLANT_VIEWER: ["plant.read"],
};

const organizationPermissions = new Set<AuthorizationPermission>([
  "organization.read", "organization.update", "organization.members.read", "organization.members.manage",
  "roles.create", "roles.revise",
]);
const companyPermissions = new Set<AuthorizationPermission>([
  "company.read", "company.manage", "company.members.manage",
]);
const plantPermissions = new Set<AuthorizationPermission>([
  "plant.read", "plant.manage", "plant.assignments.manage",
]);
const administrativeCrossScopePermissions = new Set<AuthorizationPermission>([
  "company.read", "company.manage", "company.members.manage",
  "plant.read", "plant.manage", "plant.assignments.manage",
  "roles.read", "roles.assign", "audit.read",
]);

function targetId(target: AuthorizationTarget): string | null {
  if (target.scope === "ORGANIZATION") return target.organizationId;
  if (target.scope === "COMPANY") return target.companyId ?? null;
  return target.plantId ?? null;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidTarget(target: AuthorizationTarget): boolean {
  if (!uuidPattern.test(target.organizationId)) return false;
  if (target.scope === "COMPANY") return Boolean(target.companyId && uuidPattern.test(target.companyId));
  if (target.scope === "PLANT") return Boolean(target.companyId && uuidPattern.test(target.companyId) && target.plantId && uuidPattern.test(target.plantId));
  return true;
}

function permissionFitsTarget(permission: AuthorizationPermission, target: AuthorizationTarget): boolean {
  if (organizationPermissions.has(permission)) return target.scope === "ORGANIZATION";
  if (companyPermissions.has(permission)) return target.scope === "COMPANY";
  if (plantPermissions.has(permission)) return target.scope === "COMPANY" || target.scope === "PLANT";
  return true;
}

function grantApplies(
  grant: AuthorizationRoleGrant,
  target: AuthorizationTarget,
  permission: AuthorizationPermission,
): boolean {
  if (grant.isBreakGlass) return false;

  const isBuiltInRole = Object.hasOwn(rolePermissions, grant.roleCode);
  const builtInRole = isBuiltInRole ? grant.roleCode as BuiltInTenantRole : null;
  if (builtInRole && builtInRoleScopes[builtInRole] !== grant.scope) return false;
  const builtInPermissions = builtInRole ? rolePermissions[builtInRole] : undefined;
  let rolePermissionsForGrant = builtInPermissions;
  if (!builtInPermissions) {
    if (
      grant.roleKind !== "ORGANIZATION_CUSTOM"
      || grant.scope !== "ORGANIZATION"
      || grant.ownerOrganizationId !== target.organizationId
      || !grant.customPermissions
    ) return false;
    rolePermissionsForGrant = grant.customPermissions;
  }
  if (!rolePermissionsForGrant.includes(permission) || !permissionFitsTarget(permission, target)) return false;

  if (grant.scope === target.scope && grant.scopeId === targetId(target)) {
    return true;
  }

  // These are direct, explicitly approved child-administration grants, not
  // inherited operational permissions. The caller must supply a target whose
  // parent chain was resolved by the server-side target-context resolver.
  if (!administrativeCrossScopePermissions.has(permission)) return false;

  if (grant.scope === "ORGANIZATION" && grant.scopeId === target.organizationId) {
    if (target.scope === "COMPANY") return companyPermissions.has(permission) || plantPermissions.has(permission) || permission === "roles.read" || permission === "roles.assign" || permission === "audit.read";
    if (target.scope === "PLANT") return plantPermissions.has(permission) || permission === "roles.read" || permission === "roles.assign" || permission === "audit.read";
  }

  if (grant.scope === "COMPANY" && target.scope === "PLANT" && grant.scopeId === target.companyId) {
    return plantPermissions.has(permission) || permission === "roles.read" || permission === "roles.assign" || permission === "audit.read";
  }

  return false;
}

export function evaluateAuthorization(input: AuthorizationDecisionInput): AuthorizationDecision {
  if (!isValidTarget(input.target)) {
    return { allowed: false, reason: "INVALID_TARGET" };
  }

  const id = targetId(input.target);
  const explicitlyDenied = (input.denies ?? []).some((deny) =>
    deny.scope === input.target.scope
    && deny.scopeId === id
    && deny.permissions.includes(input.permission),
  );
  if (explicitlyDenied) {
    return { allowed: false, reason: "EXPLICIT_DENY" };
  }

  const matched = input.grants.find((grant) =>
    grantApplies(grant, input.target, input.permission),
  );
  if (!matched) {
    return { allowed: false, reason: "NO_MATCHING_GRANT" };
  }

  return { allowed: true, reason: "ALLOW", matchedRole: matched.roleCode };
}

export function isCustomRolePermissionSubset(
  requested: readonly AuthorizationPermission[],
  creatorDelegable: readonly AuthorizationPermission[],
): boolean {
  const allowed = new Set(creatorDelegable);
  return requested.every((permission) => allowed.has(permission));
}

export function getBuiltInRolePermissions(role: BuiltInTenantRole): readonly AuthorizationPermission[] {
  return rolePermissions[role];
}
