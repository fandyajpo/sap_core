import { isUuid } from "@/lib/http-validation";
import { NextResponse } from "next/server";
import { RoleDefinitionError } from "@/lib/role-definition-service";
import type { AuthorizationPermission } from "@/lib/authorization-policy-core";
import { reviseCustomRoleForCurrentUser } from "@/lib/tenant-role-definition-service";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; roleDefinitionId: string }> },
) {
  const { organizationId, roleDefinitionId } = await context.params;
  if (!isUuid(organizationId) || !isUuid(roleDefinitionId)) {
    return NextResponse.json({ error: "Valid Organization and Role Definition IDs are required." }, { status: 400 });
  }
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
    }
    if (body.code !== undefined && typeof body.code !== "string") {
      return NextResponse.json({ error: "Role code must be a string." }, { status: 400 });
    }
    if (body.scope !== undefined && body.scope !== "ORGANIZATION") {
      return NextResponse.json({ error: "Custom roles are Organization-scoped only." }, { status: 400 });
    }
    if (body.permissions !== undefined &&
        (!Array.isArray(body.permissions) || body.permissions.some((item) => typeof item !== "string"))) {
      return NextResponse.json({ error: "Permissions must be an array of permission codes." }, { status: 400 });
    }
    const role = await reviseCustomRoleForCurrentUser({
      organizationId,
      roleDefinitionId,
      ...(body.code === undefined ? {} : { code: body.code as string }),
      ...(body.scope === undefined ? {} : { scope: "ORGANIZATION" as const }),
      ...(body.permissions === undefined ? {} : { permissions: body.permissions as AuthorizationPermission[] }),
    });
    return NextResponse.json({ role });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }
    if (error instanceof TenantTargetContextError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INVALID_SCOPE" ? 400 : 403;
      return NextResponse.json({ error: "Role access denied." }, { status });
    }
    if (error instanceof RoleDefinitionError) {
      const status =
        error.code === "ROLE_DEFINITION_NOT_FOUND" ? 404 :
        error.code === "ROLE_DEFINITION_VERSION_CONFLICT" ? 409 :
        error.code === "AUTHORIZATION_DENIED" ? 403 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Unable to revise Organization role." }, { status: 500 });
  }
}
