import "server-only";

import { getCurrentSession } from "@/lib/auth-session";
import { scopedAccessDatabase } from "@/lib/scoped-access";
import { createTenantRoleAssignmentAdapter } from "@/lib/tenant-role-assignment-service-core";

const tenantRoleAssignmentAdapter = createTenantRoleAssignmentAdapter({
  database: scopedAccessDatabase,
  getCurrentSession,
});

export const grantRoleAssignmentForCurrentUser =
  tenantRoleAssignmentAdapter.grantRoleAssignmentForCurrentUser;

export const listRoleAssignmentsForCurrentUser =
  tenantRoleAssignmentAdapter.listRoleAssignmentsForCurrentUser;
