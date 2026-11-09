import { isUuid } from "@/lib/http-validation";
import { NextResponse } from "next/server";
import { AuthorizationGrantLoadError } from "@/lib/authorization-grant-loader";
import { TenantAuthorizationError } from "@/lib/tenant-authorization";
import { getPlant } from "@/lib/tenant-resource-reader";
import { TenantTargetContextError } from "@/lib/tenant-target-context-core";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string; companyId: string; plantId: string }> }) {
  const { organizationId, companyId, plantId } = await context.params;
  if (!isUuid(organizationId) || !isUuid(companyId) || !isUuid(plantId)) {
    return NextResponse.json({ error: "Valid Organization, Company, and Plant IDs are required." }, { status: 400 });
  }
  try {
    const plant = await getPlant(organizationId, companyId, plantId);
    return NextResponse.json({ plant });
  } catch (error) {
    if (error instanceof TenantTargetContextError) {
      const status = error.code === "UNAUTHENTICATED" ? 401 : error.code === "INVALID_SCOPE" ? 400 : 403;
      return NextResponse.json({ error: "Plant access denied." }, { status });
    }
    if (error instanceof TenantAuthorizationError || error instanceof AuthorizationGrantLoadError) {
      return NextResponse.json({ error: "Plant access denied." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load Plant." }, { status: 500 });
  }
}
