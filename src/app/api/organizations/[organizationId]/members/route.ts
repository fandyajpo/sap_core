import { isUuid } from "@/lib/http-validation";
import { NextResponse } from "next/server";
import { AuthorizationGrantLoadError } from "@/lib/authorization-grant-loader";
import { TenantAuthorizationError } from "@/lib/tenant-authorization";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";
import { listOrganizationMembers } from "@/lib/organization-members-reader";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId } = await context.params;
  if (!isUuid(organizationId)) {
    return NextResponse.json({ error: "A valid Organization ID is required." }, { status: 400 });
  }

  try {
    const members = await listOrganizationMembers(organizationId);
    return NextResponse.json({ organizationId, members });
  } catch (error) {
    if (error instanceof TenantTargetContextError) {
      const status =
        error.code === "UNAUTHENTICATED" ? 401 :
        error.code === "INVALID_SCOPE" ? 400 : 403;
      return NextResponse.json({ error: "Organization member access denied." }, { status });
    }
    if (error instanceof TenantAuthorizationError || error instanceof AuthorizationGrantLoadError) {
      return NextResponse.json({ error: "Organization member access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load Organization members." }, { status: 500 });
  }
}
