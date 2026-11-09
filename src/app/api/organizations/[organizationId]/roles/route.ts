import { NextResponse } from "next/server";
import { RoleDefinitionError } from "@/lib/role-definition-service";
import {
  createCustomRoleForCurrentUser,
  listOrganizationRoles,
} from "@/lib/tenant-role-definition-service";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";
import { TenantAuthorizationError } from "@/lib/tenant-authorization";
import { AuthorizationGrantLoadError } from "@/lib/authorization-grant-loader";
import type { AuthorizationPermission } from "@/lib/authorization-policy-core";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResponse(error: unknown) {
  if (error instanceof TenantTargetContextError) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INVALID_SCOPE" ? 400 : 403;
    return NextResponse.json({ error: "Role access denied." }, { status });
  }
  if (error instanceof TenantAuthorizationError || error instanceof AuthorizationGrantLoadError) {
    return NextResponse.json({ error: "Role access denied." }, { status: 403 });
  }
  if (error instanceof RoleDefinitionError) {
    const status =
      error.code === "ROLE_DEFINITION_NOT_FOUND" ? 404 :
      error.code === "ROLE_DEFINITION_VERSION_CONFLICT" ? 409 :
      error.code === "ACTOR_NOT_FOUND" || error.code === "ORGANIZATION_NOT_FOUND" ? 404 :
      error.code === "AUTHORIZATION_DENIED" ? 403 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Unable to process Organization roles." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  try {
    const roles = await listOrganizationRoles(organizationId);
    return NextResponse.json({ organizationId, roles });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  try {
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.code !== "string" || body.scope !== "ORGANIZATION" ||
        !Array.isArray(body.permissions) || body.permissions.some((item) => typeof item !== "string")) {
      return NextResponse.json({ error: "A role code, ORGANIZATION scope, and permission-code array are required." }, { status: 400 });
    }
    const role = await createCustomRoleForCurrentUser({
      organizationId,
      code: body.code,
      scope: "ORGANIZATION",
      permissions: body.permissions as AuthorizationPermission[],
    });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
