import { isUuid } from "@/lib/http-validation";
import { getCurrentSession } from "@/lib/auth-session";
import { NextResponse } from "next/server";
import {
  RoleAssignmentError,
} from "@/lib/role-assignment-service";
import {
  RoleAssignmentAuthorizationError,
} from "@/lib/role-assignment-authorization-core";
import {
  grantRoleAssignmentForCurrentUser,
  listRoleAssignmentsForCurrentUser,
} from "@/lib/tenant-role-assignment-service";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

type AssignableScope = "ORGANIZATION" | "COMPANY" | "PLANT";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScope(value: unknown): value is AssignableScope {
  return value === "ORGANIZATION" || value === "COMPANY" || value === "PLANT";
}

function isUserId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    value.trim() === value && !/[\\u0000-\\u001F\\u007F]/.test(value);
}

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (error instanceof TenantTargetContextError) {
    const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INVALID_SCOPE" ? 400 : 403;
    return NextResponse.json({ error: "Role assignment access denied." }, { status });
  }
  if (error instanceof RoleAssignmentAuthorizationError) {
    return NextResponse.json({ error: "Role assignment access denied." }, { status: 403 });
  }
  if (error instanceof RoleAssignmentError) {
    const status =
      error.code === "ROLE_DEFINITION_NOT_FOUND" || error.code === "ACTOR_NOT_FOUND" ? 404 :
      error.code === "AUTHORIZATION_DENIED" || error.code === "ROLE_DEFINITION_OWNER_MISMATCH" ||
      error.code === "BREAK_GLASS_ACCESS_DENIED" ? 403 :
      error.code === "ROLE_ASSIGNMENT_NOT_ACTIVE" ? 404 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json({ error: "Unable to process role assignments." }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  try {
    // Authenticate before reporting request-shape errors, so anonymous callers
    // cannot use validation behavior as a substitute for the auth boundary.
    const session = await getCurrentSession();
    if (!session?.session?.id || !session.user?.id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    if (!isUuid(organizationId)) {
      return NextResponse.json({ error: "A valid Organization ID is required." }, { status: 400 });
    }
    const query = new URL(request.url).searchParams;
    const scope = query.get("scope");
    const parentId = query.get("parentId");
    const userId = query.get("userId");

    if (!isScope(scope) || !isUuid(parentId) || !isUserId(userId)) {
      return NextResponse.json(
        { error: "scope, parentId, and userId query parameters are required." },
        { status: 400 },
      );
    }

    const assignments = await listRoleAssignmentsForCurrentUser({
      organizationId, scope, parentId, userId,
    });
    return NextResponse.json({ organizationId, scope, parentId, userId, assignments });
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
    // Keep authentication ahead of body parsing and validation for the same
    // unauthenticated response contract as GET.
    const session = await getCurrentSession();
    if (!session?.session?.id || !session.user?.id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    if (!isUuid(organizationId)) {
      return NextResponse.json({ error: "A valid Organization ID is required." }, { status: 400 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body) || !isScope(body.scope) ||
        !isUuid(body.parentId) || !isUuid(body.roleDefinitionId) ||
        Object.hasOwn(body, "actorUserId") || Object.hasOwn(body, "userId") ||
        Object.hasOwn(body, "breakGlass")) {
      return NextResponse.json(
        { error: "scope, parentId, and roleDefinitionId are required; actor and recipient identities are resolved from the typed parent." },
        { status: 400 },
      );
    }
    const assignment = await grantRoleAssignmentForCurrentUser({
      organizationId,
      scope: body.scope,
      parentId: body.parentId,
      roleDefinitionId: body.roleDefinitionId,
    });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
