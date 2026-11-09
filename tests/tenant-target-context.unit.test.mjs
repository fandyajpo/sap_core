import assert from "node:assert/strict";
import test from "node:test";
import {
  createTenantTargetContextResolver,
  TenantTargetContextError,
} from "../src/lib/tenant-target-context-core.ts";

const userId = "user-session-1";
const org = "11111111-1111-4111-8111-111111111111";
const company = "22222222-2222-4222-8222-222222222222";
const plant = "33333333-3333-4333-8333-333333333333";

function makeResolver(overrides = {}) {
  const calls = [];
  const resolver = createTenantTargetContextResolver({
    getSession: async () => ({ user: { id: userId } }),
    repository: {
      async findOrganizationMembership(actorId, organizationId) {
        calls.push(["membership", actorId, organizationId]);
        return overrides.membership === null
          ? null
          : { id: "membership-1", organizationId: overrides.membershipOrganizationId ?? organizationId };
      },
      async findCompanyTarget(organizationId, companyId) {
        calls.push(["company", organizationId, companyId]);
        return overrides.company === null ? null : { id: overrides.companyId ?? companyId, organizationId: overrides.companyOrganizationId ?? organizationId };
      },
      async findPlantTarget(organizationId, companyId, plantId) {
        calls.push(["plant", organizationId, companyId, plantId]);
        return overrides.plant === null ? null : { id: overrides.plantId ?? plantId, organizationId: overrides.plantOrganizationId ?? organizationId, companyId: overrides.plantCompanyId ?? companyId };
      },
    },
  });
  return { resolver, calls };
}

test("Organization Admin target resolution does not require Company Membership or Plant Assignment", async () => {
  const { resolver, calls } = makeResolver();
  const context = await resolver({ kind: "PLANT", organizationId: org, companyId: company, plantId: plant });
  assert.deepEqual(context, {
    userId,
    organizationId: org,
    organizationMembershipId: "membership-1",
    scope: "PLANT",
    companyId: company,
    plantId: plant,
  });
  assert.deepEqual(calls.map((call) => call[0]), ["membership", "company", "plant"]);
});

test("Company and Plant target ancestry is mandatory", async () => {
  const missingCompany = makeResolver({ company: null });
  await assert.rejects(
    missingCompany.resolver({ kind: "COMPANY", organizationId: org, companyId: company }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
  const missingPlant = makeResolver({ plant: null });
  await assert.rejects(
    missingPlant.resolver({ kind: "PLANT", organizationId: org, companyId: company, plantId: plant }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
});

test("Repository rows that do not match the requested Organization or target IDs fail closed", async () => {
  const wrongMembership = makeResolver({ membershipOrganizationId: "99999999-9999-4999-8999-999999999999" });
  await assert.rejects(
    wrongMembership.resolver({ kind: "COMPANY", organizationId: org, companyId: company }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
  const wrongCompany = makeResolver({ companyId: "99999999-9999-4999-8999-999999999999" });
  await assert.rejects(
    wrongCompany.resolver({ kind: "COMPANY", organizationId: org, companyId: company }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
  const wrongPlantParent = makeResolver({ plantCompanyId: "99999999-9999-4999-8999-999999999999" });
  await assert.rejects(
    wrongPlantParent.resolver({ kind: "PLANT", organizationId: org, companyId: company, plantId: plant }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
});

test("An inactive or missing Organization membership denies descendant target resolution", async () => {
  const { resolver, calls } = makeResolver({ membership: null });
  await assert.rejects(
    resolver({ kind: "COMPANY", organizationId: org, companyId: company }),
    (error) => error instanceof TenantTargetContextError && error.code === "TENANT_ACCESS_DENIED",
  );
  assert.deepEqual(calls.map((call) => call[0]), ["membership"]);
});

test("Unauthenticated session is rejected", async () => {
  const resolver = createTenantTargetContextResolver({
    getSession: async () => null,
    repository: {
      async findOrganizationMembership() { return null; },
      async findCompanyTarget() { return null; },
      async findPlantTarget() { return null; },
    },
  });
  await assert.rejects(
    resolver({ kind: "ORGANIZATION", organizationId: org }),
    (error) => error instanceof TenantTargetContextError && error.code === "UNAUTHENTICATED",
  );
});

test("Malformed IDs fail before session or repository access", async () => {
  let sessionCalled = false;
  const resolver = createTenantTargetContextResolver({
    getSession: async () => { sessionCalled = true; return null; },
    repository: {
      async findOrganizationMembership() { return null; },
      async findCompanyTarget() { return null; },
      async findPlantTarget() { return null; },
    },
  });
  await assert.rejects(
    resolver({ kind: "ORGANIZATION", organizationId: "not-a-uuid" }),
    (error) => error instanceof TenantTargetContextError && error.code === "INVALID_SCOPE",
  );
  assert.equal(sessionCalled, false);
});
