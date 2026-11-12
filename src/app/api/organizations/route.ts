import { NextResponse } from "next/server";
import { OrganizationProvisioningError } from "@/lib/organization-provisioning-core";
import { provisionOrganizationForCurrentUser } from "@/lib/organization-provisioning-service";

export const runtime = "nodejs";

/**
 * POST /api/organizations
 *
 * Provisions the caller's own Organization and makes the caller its initial
 * ORG_OWNER. The actor is derived from the verified Better Auth session; no
 * request field can name the owner, the Organization or the granted role.
 */
export async function POST(request: Request) {
  let body: unknown = {};

  const text = await request.text();
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "A valid JSON request body is required." },
        { status: 400 },
      );
    }
  }

  try {
    const result = await provisionOrganizationForCurrentUser(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof OrganizationProvisioningError) {
      if (error.code === "OWNER_ROLE_UNAVAILABLE") {
        // Deliberately generic: this is a deployment/catalog failure, not a
        // client problem, and must not describe internal database state.
        return NextResponse.json(
          { error: "Organization provisioning is temporarily unavailable.", code: error.code },
          { status: 500 },
        );
      }
      const status =
        error.code === "UNAUTHENTICATED" ? 401 :
        error.code === "MEMBERSHIP_SLOT_OCCUPIED" ? 409 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "Unable to create the Organization." }, { status: 500 });
  }
}
