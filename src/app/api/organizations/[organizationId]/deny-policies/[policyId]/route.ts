import { NextResponse } from "next/server";
import {
  revokeTenantDenyPolicy,
  TenantDenyPolicyError,
  recordDeniedTenantDenyWriteAttempt,
} from "@/lib/tenant-deny-policy-service";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; policyId: string }> },
) {
  const { organizationId, policyId } = await context.params;
  let body: { reason?: unknown };
  try {
    body = await request.json() as { reason?: unknown };
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  try {
    const result = await revokeTenantDenyPolicy(
      organizationId,
      policyId,
      typeof body.reason === "string" ? body.reason : "",
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TenantDenyPolicyError) {
      if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
        await recordDeniedTenantDenyWriteAttempt(organizationId, "REVOKE");
      }
      const status =
        error.code === "UNAUTHENTICATED" ? 401 :
        error.code === "FORBIDDEN" ? 403 :
        error.code === "NOT_FOUND" ? 404 :
        error.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof TenantTargetContextError) {
      if (error.code !== "INVALID_SCOPE") {
        await recordDeniedTenantDenyWriteAttempt(organizationId, "REVOKE");
      }
      const status = error.code === "UNAUTHENTICATED" ? 401 :
        error.code === "INVALID_SCOPE" ? 400 : 403;
      return NextResponse.json({ error: "DENY policy access denied." }, { status });
    }
    return NextResponse.json({ error: "Unable to revoke DENY policy." }, { status: 500 });
  }
}
