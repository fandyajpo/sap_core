import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTenantContextResolver,
  TenantContextError,
} from "../src/lib/tenant-context-core.ts";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  otherOrganization: "22222222-2222-4222-8222-222222222222",
  company: "33333333-3333-4333-8333-333333333333",
  otherCompany: "44444444-4444-4444-8444-444444444444",
  plant: "55555555-5555-4555-8555-555555555555",
  user: "session-user",
};

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    async findOrganizationMembership(...args) {
      calls.push(["organization", ...args]);
      return { id: "om-1", organizationId: ids.organization };
    },
    async findCompanyMembership(...args) {
      calls.push(["company", ...args]);
      return {
        organizationMembershipId: "om-1", organizationId: ids.organization,
        companyMembershipId: "cm-1", companyId: ids.company,
      };
    },
    async findPlantAssignment(...args) {
      calls.push(["plant", ...args]);
      return {
        organizationMembershipId: "om-1", organizationId: ids.organization,
        companyMembershipId: "cm-1", companyId: ids.company,
        plantAssignmentId: "pa-1", plantId: ids.plant,
      };
    },
    ...overrides.repository,
  };
  const resolve = createTenantContextResolver({
    getSession: async () => ({ user: { id: ids.user } }),
    repository,
    ...overrides,
  });
  return { resolve, calls };
}

test("rejects anonymous sessions before querying tenant membership", async () => {
  const { resolve, calls } = fixture({ getSession: async () => null });
  await assert.rejects(
    resolve({ kind: "ORGANIZATION", organizationId: ids.organization }),
    (error) => error instanceof TenantContextError && error.code === "UNAUTHENTICATED",
  );
  assert.deepEqual(calls, []);
});

test("rejects malformed scope identifiers before session lookup", async () => {
  let sessionCalls = 0;
  const { resolve } = fixture({ getSession: async () => { sessionCalls += 1; return { user: { id: ids.user } }; } });
  await assert.rejects(
    resolve({ kind: "COMPANY", organizationId: "not-a-uuid", companyId: ids.company }),
    (error) => error instanceof TenantContextError && error.code === "INVALID_SCOPE",
  );
  assert.equal(sessionCalls, 0);
});

test("resolves organization scope using session identity, not caller-supplied userId", async () => {
  const { resolve, calls } = fixture();
  const context = await resolve({ kind: "ORGANIZATION", organizationId: ids.organization, userId: "attacker" });
  assert.equal(context.userId, ids.user);
  assert.equal(context.organizationMembershipId, "om-1");
  assert.equal(context.scope, "ORGANIZATION");
  assert.deepEqual(calls, [["organization", ids.user, ids.organization]]);
});

test("denies missing organization membership", async () => {
  const { resolve } = fixture({ repository: { findOrganizationMembership: async () => null } });
  await assert.rejects(
    resolve({ kind: "ORGANIZATION", organizationId: ids.organization }),
    (error) => error instanceof TenantContextError && error.code === "TENANT_ACCESS_DENIED",
  );
});

test("resolves company only through active parent-consistent repository result", async () => {
  const { resolve, calls } = fixture();
  const context = await resolve({ kind: "COMPANY", organizationId: ids.organization, companyId: ids.company });
  assert.equal(context.companyMembershipId, "cm-1");
  assert.equal(context.organizationMembershipId, "om-1");
  assert.deepEqual(calls, [["company", ids.user, ids.organization, ids.company]]);
});

test("denies cross-organization or inactive company membership", async () => {
  const { resolve } = fixture({ repository: { findCompanyMembership: async () => null } });
  await assert.rejects(
    resolve({ kind: "COMPANY", organizationId: ids.otherOrganization, companyId: ids.otherCompany }),
    (error) => error instanceof TenantContextError && error.code === "TENANT_ACCESS_DENIED",
  );
});

test("resolves plant only through active company and organization parent chain", async () => {
  const { resolve, calls } = fixture();
  const context = await resolve({
    kind: "PLANT", organizationId: ids.organization, companyId: ids.company, plantId: ids.plant,
  });
  assert.equal(context.plantAssignmentId, "pa-1");
  assert.equal(context.companyMembershipId, "cm-1");
  assert.equal(context.scope, "PLANT");
  assert.deepEqual(calls, [["plant", ids.user, ids.organization, ids.company, ids.plant]]);
});

test("denies cross-company plant and inactive parent assignments", async () => {
  const { resolve } = fixture({ repository: { findPlantAssignment: async () => null } });
  await assert.rejects(
    resolve({ kind: "PLANT", organizationId: ids.organization, companyId: ids.otherCompany, plantId: ids.plant }),
    (error) => error instanceof TenantContextError && error.code === "TENANT_ACCESS_DENIED",
  );
});
