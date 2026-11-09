import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAuthorization,
  getBuiltInRolePermissions,
  isCustomRolePermissionSubset,
} from "../src/lib/authorization-policy-core.ts";

const org = "11111111-1111-4111-8111-111111111111";
const companyA = "22222222-2222-4222-8222-222222222222";
const companyB = "33333333-3333-4333-8333-333333333333";
const plantA = "44444444-4444-4444-8444-444444444444";
const plantB = "55555555-5555-4555-8555-555555555555";

test("Organization Admin receives explicit child administration, not operational access", () => {
  const grants = [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }];
  assert.equal(evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "COMPANY", organizationId: org, companyId: companyA },
    grants,
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "plant.assignments.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants,
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "inventory.read",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants,
  }).reason, "NO_MATCHING_GRANT");
});

test("Organization grants cannot cross into a different Organization", () => {
  const grants = [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }];
  assert.equal(evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "COMPANY", organizationId: "99999999-9999-4999-8999-999999999999", companyId: companyA },
    grants,
  }).allowed, false);
});

test("Company Admin can administer Plants only under its assigned Company", () => {
  const grants = [{ roleCode: "COMPANY_ADMIN", scope: "COMPANY", scopeId: companyA }];
  assert.equal(evaluateAuthorization({
    permission: "plant.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants,
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "plant.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyB, plantId: plantB },
    grants,
  }).allowed, false);
});

test("Plant roles apply only to the exact assigned Plant", () => {
  const grants = [{ roleCode: "PLANT_MANAGER", scope: "PLANT", scopeId: plantA }];
  assert.equal(evaluateAuthorization({
    permission: "plant.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants,
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "plant.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantB },
    grants,
  }).allowed, false);
});

test("Strict scope prevents Organization-scoped permissions from authorizing Company actions", () => {
  const grants = [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }];
  assert.equal(evaluateAuthorization({
    permission: "organization.update",
    target: { scope: "COMPANY", organizationId: org, companyId: companyA },
    grants,
  }).allowed, false);
});

test("Organization-level Company permissions cannot be used against the Organization resource itself", () => {
  const grants = [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }];
  assert.equal(evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "ORGANIZATION", organizationId: org },
    grants,
  }).allowed, false);
});

test("Explicit deny overrides an otherwise matching allow at the exact scope", () => {
  const grants = [{ roleCode: "COMPANY_ADMIN", scope: "COMPANY", scopeId: companyA }];
  const result = evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "COMPANY", organizationId: org, companyId: companyA },
    grants,
    denies: [{ scope: "COMPANY", scopeId: companyA, permissions: ["company.manage"] }],
  });
  assert.deepEqual(result, { allowed: false, reason: "EXPLICIT_DENY" });
});

test("Break-glass grants are not effective under v0.1", () => {
  const grants = [{ roleCode: "ORG_OWNER", scope: "ORGANIZATION", scopeId: org, isBreakGlass: true }];
  assert.equal(evaluateAuthorization({
    permission: "organization.update",
    target: { scope: "ORGANIZATION", organizationId: org },
    grants,
  }).allowed, false);
});

test("Unknown and custom roles fail closed without a trusted permission payload", () => {
  const grants = [{ roleCode: "UNKNOWN_SYSTEM_ROLE", scope: "ORGANIZATION", scopeId: org }];
  assert.equal(evaluateAuthorization({
    permission: "organization.read",
    target: { scope: "ORGANIZATION", organizationId: org },
    grants,
  }).allowed, false);
});

test("Custom role permissions must be a subset of the creator's delegable set", () => {
  assert.equal(isCustomRolePermissionSubset(["organization.read"], ["organization.read", "roles.read"]), true);
  assert.equal(isCustomRolePermissionSubset(["organization.update"], ["organization.read"]), false);
  assert.deepEqual(getBuiltInRolePermissions("ORG_MEMBER"), ["organization.read", "organization.members.read"]);
});

test("Organization custom roles are accepted only with trusted payload and owning Organization", () => {
  const grant = {
    roleCode: "custom:org-reader",
    roleKind: "ORGANIZATION_CUSTOM",
    ownerOrganizationId: org,
    scope: "ORGANIZATION",
    scopeId: org,
    customPermissions: ["organization.read"],
  };
  assert.equal(evaluateAuthorization({
    permission: "organization.read",
    target: { scope: "ORGANIZATION", organizationId: org },
    grants: [grant],
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "organization.read",
    target: { scope: "ORGANIZATION", organizationId: "99999999-9999-4999-8999-999999999999" },
    grants: [grant],
  }).allowed, false);
  assert.equal(evaluateAuthorization({
    permission: "plant.read",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants: [{ ...grant, scope: "COMPANY" }],
  }).allowed, false);
});

test("Malformed targets fail closed", () => {
  assert.equal(evaluateAuthorization({
    permission: "organization.read",
    target: { scope: "PLANT", organizationId: org, companyId: companyA },
    grants: [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }],
  }).reason, "INVALID_TARGET");
});
