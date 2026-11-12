import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  OrganizationProvisioningError,
  provisionInitialOrganization,
} from "@/lib/organization-provisioning-service";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id || !session.session?.id) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const name = typeof body === "object" && body !== null && "name" in body
    ? (body as { name?: unknown }).name
    : undefined;
  if (typeof name !== "string") {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  }

  try {
    const organization = await provisionInitialOrganization({
      sessionId: session.session.id,
      userId: session.user.id,
      name,
    });
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    if (error instanceof OrganizationProvisioningError) {
      if (error.code === "INVALID_NAME") {
        return NextResponse.json({ error: error.code }, { status: 400 });
      }
      if (error.code === "ALREADY_HAS_ORGANIZATION") {
        return NextResponse.json(
          { error: error.code, organizationId: error.organizationId },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.code }, { status: 503 });
    }
    return NextResponse.json({ error: "PROVISIONING_FAILED" }, { status: 500 });
  }
}
