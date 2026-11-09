import { isUuid } from "@/lib/http-validation";
import { NextResponse } from "next/server";
import { AuthorizationGrantLoadError } from "@/lib/authorization-grant-loader";
import { TenantAuthorizationError } from "@/lib/tenant-authorization";
import { getCompany } from "@/lib/tenant-resource-reader";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string; companyId: string }> }) {
  const { organizationId, companyId } = await context.params;
  if (!isUuid(organizationId) || !isUuid(companyId)) {
    return NextResponse.json({ error: "Valid Organization and Company IDs are required." }, { status: 400 });
  }
  try {
    const company = await getCompany(organizationId, companyId);
    return NextResponse.json({ company });
  } catch (error) {
    if (error instanceof TenantTargetContextError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INVALID_SCOPE" ? 400 : 403;
      return NextResponse.json({ error: "Company access denied." }, { status });
    }
    if (error instanceof TenantAuthorizationError || error instanceof AuthorizationGrantLoadError) {
      return NextResponse.json({ error: "Company access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load Company." }, { status: 500 });
  }
}
