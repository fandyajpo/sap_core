import assert from "node:assert/strict";
import test from "node:test";
import {
  ORGANIZATION_NAME_MAX_LENGTH,
  ORGANIZATION_NAME_MIN_LENGTH,
  OrganizationProvisioningError,
  parseOrganizationProvisioningRequest,
  toProvisionedOrganizationDto,
} from "../src/lib/organization-provisioning-core.ts";

function assertInvalidInput(fn, pattern) {
  assert.throws(
    fn,
    (error) =>
      error instanceof OrganizationProvisioningError &&
      error.code === "INVALID_INPUT" &&
      pattern.test(error.message),
  );
}

test("accepts a name and trims surrounding whitespace", () => {
  assert.deepEqual(
    parseOrganizationProvisioningRequest({ name: "  Acme Holdings " }),
    { name: "Acme Holdings" },
  );
});

test("requires a name", () => {
  assertInvalidInput(() => parseOrganizationProvisioningRequest(undefined), /name is required/);
  assertInvalidInput(() => parseOrganizationProvisioningRequest(null), /name is required/);
  assertInvalidInput(() => parseOrganizationProvisioningRequest({}), /name is required/);
  assertInvalidInput(() => parseOrganizationProvisioningRequest({ name: 42 }), /name is required/);
});

test("rejects bodies that are not JSON objects", () => {
  for (const body of [[], "text", 42, true]) {
    assertInvalidInput(() => parseOrganizationProvisioningRequest(body), /JSON object/);
  }
});

test("enforces the trimmed length bounds", () => {
  assertInvalidInput(
    () => parseOrganizationProvisioningRequest({ name: " ".repeat(ORGANIZATION_NAME_MIN_LENGTH) }),
    /at least/,
  );
  assertInvalidInput(
    () => parseOrganizationProvisioningRequest({ name: "a".repeat(ORGANIZATION_NAME_MAX_LENGTH + 1) }),
    /at most/,
  );
  assert.deepEqual(
    parseOrganizationProvisioningRequest({ name: "a".repeat(ORGANIZATION_NAME_MIN_LENGTH) }),
    { name: "a".repeat(ORGANIZATION_NAME_MIN_LENGTH) },
  );
});

test("rejects client-supplied identity and role fields", () => {
  for (const field of ["userId", "organizationId", "roleCode", "status", "isBreakGlass"]) {
    assertInvalidInput(
      () => parseOrganizationProvisioningRequest({ name: "Acme", [field]: "x" }),
      /derived from the verified session/,
    );
  }
});

test("rejects unsupported fields instead of silently ignoring them", () => {
  assertInvalidInput(
    () => parseOrganizationProvisioningRequest({ name: "Acme", slug: "acme" }),
    /Unsupported field "slug"/,
  );
});

test("the response DTO is narrow and carries the organization name", () => {
  const dto = toProvisionedOrganizationDto({
    organizationId: "33333333-3333-4333-8333-333333333333",
    organizationName: "Acme Holdings",
    organizationCreatedAt: new Date("2026-11-12T10:00:00.000Z"),
    membershipId: "44444444-4444-4444-8444-444444444444",
  });

  assert.deepEqual(dto, {
    organization: {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Acme Holdings",
      createdAt: "2026-11-12T10:00:00.000Z",
    },
    membership: {
      id: "44444444-4444-4444-8444-444444444444",
      status: "ACTIVE",
      roleCode: "ORG_OWNER",
      roleScope: "ORGANIZATION",
    },
  });

  assert.equal(Object.keys(dto).sort().join(","), "membership,organization");
  assert.equal(Object.keys(dto.organization).sort().join(","), "createdAt,id,name");
  assert.equal(
    Object.keys(dto.membership).sort().join(","),
    "id,roleCode,roleScope,status",
  );
});
