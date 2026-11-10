import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCompany, getPlant } from "../src/lib/client-data/api/tenant-resources.ts";
import { getTenantDenyPolicyHistory, createTenantDenyPolicy, revokeTenantDenyPolicy } from "../src/lib/client-data/api/deny-policies.ts";
import { listOrganizationMembers } from "../src/lib/client-data/api/organization-members.ts";
import { createOrganizationRole, listOrganizationRoles, reviseOrganizationRole } from "../src/lib/client-data/api/organization-roles.ts";
import { grantRoleAssignment, listRoleAssignments } from "../src/lib/client-data/api/role-assignments.ts";
import { HttpApiError, requestJson } from "../src/lib/client-data/http.ts";
import { createQueryClient, getQueryClient } from "../src/lib/client-data/query-client.ts";
import { clientDataKeys } from "../src/lib/client-data/queries/keys.ts";
import { createOrganizationRoleMutationOptions, createOrganizationRolesQueryOptions, createReviseOrganizationRoleMutationOptions } from "../src/lib/client-data/queries/use-organization-roles.ts";
import { createGrantRoleAssignmentMutationOptions, createRoleAssignmentsQueryOptions } from "../src/lib/client-data/queries/use-role-assignments.ts";
import { createRevokeTenantDenyPolicyMutationOptions, createTenantDenyPolicyMutationOptions, createTenantDenyPolicyHistoryQueryOptions } from "../src/lib/client-data/queries/use-deny-policies.ts";
import { createOrganizationMembersQueryOptions } from "../src/lib/client-data/queries/use-organization-members.ts";
import { createCompanyQueryOptions, createPlantQueryOptions } from "../src/lib/client-data/queries/use-tenant-resources.ts";

const originalFetch = globalThis.fetch;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(responses) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    calls.push({ input: String(input), init });
    const next = responses.shift();
    return new Response(JSON.stringify(next?.body ?? {}), {
      status: next?.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

async function sourceFiles(directory, baseDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(filePath, baseDirectory));
    } else if (/\.[jt]sx?$/.test(entry.name)) {
      files.push({
        path: path.relative(baseDirectory, filePath),
        text: await readFile(filePath, "utf8"),
      });
    }
  }
  return files;
}

test("JSON transport preserves same-origin session requests, cancellation, and typed errors", async () => {
  const signal = new AbortController().signal;
  let request;
  const result = await requestJson("/api/example", {
    method: "POST",
    body: { value: "test" },
    signal,
    fetcher: async (input, init) => {
      request = { input, init };
      return new Response(JSON.stringify({ saved: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.deepEqual(result, { saved: true });
  assert.equal(request.input, "/api/example");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.credentials, "same-origin");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.signal, signal);
  assert.equal(request.init.body, JSON.stringify({ value: "test" }));
  assert.equal(request.init.headers.get("Accept"), "application/json");
  assert.equal(request.init.headers.get("Content-Type"), "application/json");

  await assert.rejects(
    requestJson("/api/example", {
      fetcher: async () => new Response(JSON.stringify({ error: "Not allowed", code: "FORBIDDEN" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    }),
    (error) => error instanceof HttpApiError && error.status === 403 && error.code === "FORBIDDEN" && error.message === "Not allowed",
  );
  await assert.rejects(
    requestJson("/api/example", {
      fetcher: async () => new Response("not-json", { status: 200 }),
    }),
    (error) => error instanceof HttpApiError && error.message === "The server returned an invalid JSON response.",
  );
});

test("organization member API uses its existing GET route and forwards cancellation", async () => {
  const calls = mockFetch([{ body: { organizationId: "org/1", members: [] } }]);
  const signal = new AbortController().signal;
  const response = await listOrganizationMembers("org/1", signal);
  assert.deepEqual(response, { organizationId: "org/1", members: [] });
  assert.equal(calls[0].input, "/api/organizations/org%2F1/members");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.signal, signal);
});

test("organization role APIs match the current list, create, and revision routes", async () => {
  const calls = mockFetch([
    { body: { organizationId: "org-1", roles: [] } },
    { body: { role: { id: "role-1" } } },
    { body: { role: { id: "role-2" } } },
  ]);
  await listOrganizationRoles("org-1");
  await createOrganizationRole("org-1", {
    code: "FINANCE_VIEWER",
    scope: "ORGANIZATION",
    permissions: ["organization.read"],
  });
  await reviseOrganizationRole("org-1", "role/1", { permissions: ["organization.read"] });

  assert.equal(calls[0].input, "/api/organizations/org-1/roles");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].input, "/api/organizations/org-1/roles");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.body, JSON.stringify({
    code: "FINANCE_VIEWER",
    scope: "ORGANIZATION",
    permissions: ["organization.read"],
  }));
  assert.equal(calls[2].input, "/api/organizations/org-1/roles/role%2F1/revisions");
  assert.equal(calls[2].init.method, "POST");
  assert.equal(calls[2].init.body, JSON.stringify({ permissions: ["organization.read"] }));
});

test("role assignment APIs encode the target query and never send caller-supplied actors", async () => {
  const calls = mockFetch([
    { body: { organizationId: "org-1", scope: "PLANT", parentId: "plant-1", userId: "user +1", assignments: [] } },
    { body: { assignment: { id: "assignment-1" } } },
  ]);
  await listRoleAssignments("org-1", { scope: "PLANT", parentId: "plant-1", userId: "user +1" });
  await grantRoleAssignment("org-1", {
    scope: "PLANT",
    parentId: "plant-1",
    roleDefinitionId: "role-1",
  });

  const requestUrl = new URL(calls[0].input, "https://sap-core.test");
  assert.equal(requestUrl.pathname, "/api/organizations/org-1/roles/assignments");
  assert.equal(requestUrl.searchParams.get("scope"), "PLANT");
  assert.equal(requestUrl.searchParams.get("parentId"), "plant-1");
  assert.equal(requestUrl.searchParams.get("userId"), "user +1");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.body, JSON.stringify({
    scope: "PLANT",
    parentId: "plant-1",
    roleDefinitionId: "role-1",
  }));
  assert.doesNotMatch(calls[1].init.body, /actorUserId|userId|breakGlass/);
});

test("DENY policy APIs match the existing history, create, and revoke routes", async () => {
  const calls = mockFetch([
    { body: { organizationId: "org-1", policies: [], events: [] } },
    { body: { organizationId: "org-1", policy: { id: "policy-1" } } },
    { body: { id: "policy-1", revoked: true } },
  ]);
  await getTenantDenyPolicyHistory("org-1");
  await createTenantDenyPolicy("org-1", {
    targetMembershipId: "membership-1",
    permissionCode: "organization.read",
    scope: "ORGANIZATION",
    reason: "Policy reason",
  });
  await revokeTenantDenyPolicy("org-1", "policy/1", { reason: "Revocation reason" });

  assert.equal(calls[0].input, "/api/organizations/org-1/deny-policies");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[1].input, "/api/organizations/org-1/deny-policies");
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.body, JSON.stringify({
    targetMembershipId: "membership-1",
    permissionCode: "organization.read",
    scope: "ORGANIZATION",
    reason: "Policy reason",
  }));
  assert.equal(calls[2].input, "/api/organizations/org-1/deny-policies/policy%2F1");
  assert.equal(calls[2].init.method, "PATCH");
  assert.equal(calls[2].init.body, JSON.stringify({ reason: "Revocation reason" }));
});

test("Company and Plant APIs use their existing nested protected-read routes", async () => {
  const calls = mockFetch([
    { body: { company: { id: "company-1" } } },
    { body: { plant: { id: "plant-1" } } },
  ]);
  await getCompany("org-1", "company-1");
  await getPlant("org-1", "company-1", "plant/1");
  assert.equal(calls[0].input, "/api/organizations/org-1/companies/company-1");
  assert.equal(calls[1].input, "/api/organizations/org-1/companies/company-1/plants/plant%2F1");
  assert.ok(calls.every(({ init }) => init.method === "GET"));
});

test("query keys isolate each feature and retain the role-assignment invalidation prefix", () => {
  const roleQuery = { scope: "COMPANY", parentId: "company-1", userId: "user-1" };
  assert.deepEqual(clientDataKeys.organizationMembers("org-1"), ["organizations", "org-1", "members"]);
  assert.deepEqual(clientDataKeys.organizationRoles("org-1"), ["organizations", "org-1", "roles"]);
  assert.deepEqual(clientDataKeys.roleAssignments("org-1", roleQuery), [
    "organizations", "org-1", "role-assignments", roleQuery,
  ]);
  assert.deepEqual(clientDataKeys.roleAssignmentsRoot("org-1"), ["organizations", "org-1", "role-assignments"]);
  assert.deepEqual(clientDataKeys.tenantDenyPolicyHistory("org-1"), [
    "organizations", "org-1", "deny-policies", "history",
  ]);
  assert.deepEqual(clientDataKeys.plant("org-1", "company-1", "plant-1"), [
    "organizations", "org-1", "companies", "company-1", "plants", "plant-1",
  ]);
});

test("query hooks stay disabled until every required identifier is non-empty", () => {
  assert.equal(createOrganizationMembersQueryOptions("").enabled, false);
  assert.equal(createOrganizationMembersQueryOptions("org-1").enabled, true);
  assert.equal(createOrganizationMembersQueryOptions("  ").enabled, false);

  assert.equal(createOrganizationRolesQueryOptions("").enabled, false);
  assert.equal(createOrganizationRolesQueryOptions("org-1").enabled, true);

  const assignmentQuery = { scope: "PLANT", parentId: "plant-1", userId: "user-1" };
  assert.equal(createRoleAssignmentsQueryOptions("org-1", assignmentQuery).enabled, true);
  assert.equal(createRoleAssignmentsQueryOptions("", assignmentQuery).enabled, false);
  assert.equal(createRoleAssignmentsQueryOptions("org-1", { ...assignmentQuery, scope: "" }).enabled, false);
  assert.equal(createRoleAssignmentsQueryOptions("org-1", { ...assignmentQuery, parentId: "" }).enabled, false);
  assert.equal(createRoleAssignmentsQueryOptions("org-1", { ...assignmentQuery, userId: "" }).enabled, false);

  assert.equal(createTenantDenyPolicyHistoryQueryOptions("").enabled, false);
  assert.equal(createTenantDenyPolicyHistoryQueryOptions("org-1").enabled, true);

  assert.equal(createCompanyQueryOptions("org-1", "company-1").enabled, true);
  assert.equal(createCompanyQueryOptions("", "company-1").enabled, false);
  assert.equal(createCompanyQueryOptions("org-1", "").enabled, false);

  assert.equal(createPlantQueryOptions("org-1", "company-1", "plant-1").enabled, true);
  assert.equal(createPlantQueryOptions("", "company-1", "plant-1").enabled, false);
  assert.equal(createPlantQueryOptions("org-1", "", "plant-1").enabled, false);
  assert.equal(createPlantQueryOptions("org-1", "company-1", "").enabled, false);
});

test("QueryClient defaults are stable and server calls receive isolated clients", () => {
  const queryClient = createQueryClient();
  assert.equal(queryClient.getDefaultOptions().queries?.staleTime, 30_000);
  assert.equal(queryClient.getDefaultOptions().queries?.retry, false);
  assert.equal(queryClient.getDefaultOptions().mutations?.retry, false);
  assert.notStrictEqual(getQueryClient(), getQueryClient());
});

test("browser QueryClient is a singleton while server render layout remains a Server Component", async () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    assert.strictEqual(getQueryClient(), getQueryClient());
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow);
    else delete globalThis.window;
  }

  const layout = await readFile(path.join(repositoryRoot, "src/app/layout.tsx"), "utf8");
  const provider = await readFile(path.join(repositoryRoot, "src/app/providers.tsx"), "utf8");
  const providerFiles = (await sourceFiles(path.join(repositoryRoot, "src")))
    .filter((file) => file.text.includes("QueryClientProvider"));
  assert.doesNotMatch(layout, /^\s*["']use client["']/);
  assert.match(layout, /<AppProviders>\{children\}<\/AppProviders>/);
  assert.match(provider, /^"use client";/);
  assert.deepEqual(providerFiles.map((file) => file.path), ["app/providers.tsx"]);
  assert.equal((provider.match(/QueryClientProvider/g) ?? []).length, 2);
});

test("mutation hooks call only existing writes and invalidate their corresponding feature reads", async () => {
  const invalidations = [];
  const queryClient = {
    async invalidateQueries({ queryKey }) {
      invalidations.push(queryKey);
    },
  };
  const calls = mockFetch([
    { body: { role: { id: "role-1" } } },
    { body: { role: { id: "role-2" } } },
    { body: { assignment: { id: "assignment-1" } } },
    { body: { organizationId: "org-1", policy: { id: "policy-1" } } },
    { body: { id: "policy-1", revoked: true } },
  ]);

  const createRole = createOrganizationRoleMutationOptions(queryClient, "org-1");
  const reviseRole = createReviseOrganizationRoleMutationOptions(queryClient, "org-1", "role-1");
  const grantAssignment = createGrantRoleAssignmentMutationOptions(queryClient, "org-1");
  const createPolicy = createTenantDenyPolicyMutationOptions(queryClient, "org-1");
  const revokePolicy = createRevokeTenantDenyPolicyMutationOptions(queryClient, "org-1", "policy-1");

  await createRole.mutationFn({ code: "ROLE", scope: "ORGANIZATION", permissions: ["organization.read"] });
  await reviseRole.mutationFn({ permissions: ["organization.read"] });
  await grantAssignment.mutationFn({ scope: "ORGANIZATION", parentId: "membership-1", roleDefinitionId: "role-1" });
  await createPolicy.mutationFn({
    targetMembershipId: "membership-1",
    permissionCode: "organization.read",
    scope: "ORGANIZATION",
    reason: "Reason",
  });
  await revokePolicy.mutationFn({ reason: "Reason" });
  await Promise.all([
    createRole.onSuccess(),
    reviseRole.onSuccess(),
    grantAssignment.onSuccess(),
    createPolicy.onSuccess(),
    revokePolicy.onSuccess(),
  ]);

  assert.deepEqual(calls.map(({ input, init }) => [input, init.method]), [
    ["/api/organizations/org-1/roles", "POST"],
    ["/api/organizations/org-1/roles/role-1/revisions", "POST"],
    ["/api/organizations/org-1/roles/assignments", "POST"],
    ["/api/organizations/org-1/deny-policies", "POST"],
    ["/api/organizations/org-1/deny-policies/policy-1", "PATCH"],
  ]);
  assert.deepEqual(invalidations, [
    clientDataKeys.organizationRoles("org-1"),
    clientDataKeys.organizationRoles("org-1"),
    clientDataKeys.roleAssignmentsRoot("org-1"),
    clientDataKeys.tenantDenyPolicyHistory("org-1"),
    clientDataKeys.tenantDenyPolicyHistory("org-1"),
  ]);
});

test("client-data modules stay independent of server-only auth and persistence code", async () => {
  const files = await sourceFiles(path.join(repositoryRoot, "src/lib/client-data"));
  assert.ok(files.length > 0);
  for (const file of files) {
    assert.doesNotMatch(
      file.text,
      /(?:from\s*["']|import\s*["'])(?:server-only|next\/(?:headers|server|cache|cookies)|better-auth|@prisma\/|pg(?:\/|["']))/,
      `${file.path} imports a server-only dependency`,
    );
    assert.doesNotMatch(file.text, /@\/lib\/(?:auth-session|prisma|tenant-authorization|tenant-deny-policy-service)/);
  }
});
