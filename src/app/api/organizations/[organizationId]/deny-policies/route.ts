import { NextResponse } from "next/server";
import {
  createTenantDenyPolicy,
  listTenantDenyPolicyHistory,
  TenantDenyPolicyError,
  recordDeniedTenantDenyWriteAttempt,
  type CreateTenantDenyPolicyInput,
} from "@/lib/tenant-deny-policy-service";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

async function errorResponse(error: unknown, organizationId: string, action?: "CREATE") {
  if (error instanceof TenantDenyPolicyError) {
    if (action && (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED")) {
      await recordDeniedTenantDenyWriteAttempt(organizationId, action);
    }
    const status =
      error.code === "UNAUTHENTICATED" ? 401 :
      error.code === "FORBIDDEN" ? 403 :
      error.code === "NOT_FOUND" ? 404 :
      error.code === "CONFLICT" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
  if (error instanceof TenantTargetContextError) {
    if (action && error.code !== "INVALID_SCOPE") {
      await recordDeniedTenantDenyWriteAttempt(organizationId, action);
    }
    const status = error.code === "UNAUTHENTICATED" ? 401 :
      error.code === "INVALID_SCOPE" ? 400 : 403;
    return NextResponse.json({ error: "DENY policy access denied." }, { status });
  }
  return NextResponse.json({ error: "Unable to process DENY policy request." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  try {
    const history = await listTenantDenyPolicyHistory(organizationId);
    return NextResponse.json({ organizationId, ...history });
  } catch (error) {
    console.error("[DENY history] request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      errorCode: error instanceof TenantDenyPolicyError || error instanceof TenantTargetContextError ? error.code : undefined,
    });
    return await errorResponse(error, organizationId);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  let body: CreateTenantDenyPolicyInput;
  try {
    body = await request.json() as CreateTenantDenyPolicyInput;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  try {
    const policy = await createTenantDenyPolicy(organizationId, body);
    return NextResponse.json({ organizationId, policy }, { status: 201 });
  } catch (error) {
    return await errorResponse(error, organizationId, "CREATE");
  }
}
