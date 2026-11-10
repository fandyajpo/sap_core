import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createRoleAssignmentsQueryOptions } from "../src/lib/client-data/queries/use-role-assignments.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("role assignments page requires a session and passes the route ID to the client view", async () => {
  const page = await readSource("src/app/organizations/[organizationId]/role-assignments/page.tsx");

  assert.doesNotMatch(page, /^\s*["']use client["']/);
  assert.match(page, /await requireCurrentSession\(\)/);
  assert.match(page, /params: Promise<\{ organizationId: string \}>/);
  assert.match(page, /<RoleAssignmentsView organizationId=\{organizationId\}\s*\/>/);
  assert.doesNotMatch(page, /(?:prisma|listRoleAssignments|useRoleAssignments)/i);
});

test("client view reuses the existing typed query hooks and never branches on client authorization", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /useOrganizationMembers\(organizationId\)/);
  assert.match(view, /useOrganizationRoles\(organizationId\)/);
  assert.match(view, /useRoleAssignments\(organizationId, \{/);
  assert.doesNotMatch(view, /(?:auth-session|@\/lib\/prisma|listRoleAssignments|\bfetch\s*\()/);
  assert.doesNotMatch(view, /(?:canAccessOrganization|isAuthorized|authorizationGrant)/i);
  assert.doesNotMatch(view, /(?:query\.error|\.error)\?\.message|(?:query\.error|\.error)\.message/);
});

test("member filter selects by the actual user ID with name and email labels from the response", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /value=\{member\.userId\}/);
  assert.match(view, /setSelectedUserId\(event\.currentTarget\.value\)/);
  assert.match(view, /\{member\.name\} \(\{member\.email\}\)/);
  assert.match(view, /<option value="">Select a member…<\/option>/);
  assert.doesNotMatch(view, /@/);
});

test("scope filter supports exactly ORGANIZATION, COMPANY, and PLANT with ORGANIZATION default", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /TenantAssignableScope\[\] = \["ORGANIZATION", "COMPANY", "PLANT"\]/);
  assert.match(view, /useState<TenantAssignableScope>\("ORGANIZATION"\)/);
});

test("parent ID defaults to the organization ID for ORGANIZATION scope and resets on scope change", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /scope === "ORGANIZATION"\s*\?\s*organizationId\.trim\(\)/);
  assert.match(view, /setParentIdInput\(""\)/);
  assert.match(view, /scope === "ORGANIZATION"\s*\?\s*\(/);
  assert.match(view, /Enter an existing Company ID/);
  assert.match(view, /Enter an existing Plant ID/);
});

test("assignment query only runs once every required identifier is present", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /filtersComplete = Boolean\(organizationId\.trim\(\)\)\s*&&\s*Boolean\(selectedUserId\)\s*&&\s*Boolean\(parentId\)/);
  assert.match(view, /filtersComplete && assignmentsQuery\.isLoading/);
  assert.match(view, /filtersComplete && assignmentsQuery\.isError/);
  assert.match(view, /Select a member and provide the target parent to load assignments\./);
});

test("assignment table maps DTO fields with resolved role codes and stable assignment identity", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");
  const dataTable = await readSource("src/components/data-table/data-table.tsx");

  for (const field of ["scope", "parentId", "revokedAt", "createdAt", "grantActorUserId", "isBreakGlass"]) {
    assert.match(view, new RegExp(`accessorKey: "${field}"`));
  }
  assert.match(view, /roleByDefinitionId\.get\(assignment\.roleDefinitionId\)\?\.code\s*\?\?\s*assignment\.roleDefinitionId/);
  assert.match(view, /getRowId=\{\(assignment\) => assignment\.id\}/);
  assert.match(view, /ariaLabel="Role assignments"/);
  assert.match(dataTable, /aria-label=\{ariaLabel\}/);
  assert.match(view, /aria-expanded=\{row\.original\.id === selectedAssignmentId\}/);
  assert.match(view, /aria-label="Assignment scope"/);
});

test("status derives only from revokedAt and dates are validated before formatting", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /revokedAt == null\s*\?\s*<span className=\{styles\.status\}>Active<\/span>\s*:\s*<span className=\{styles\.statusRevoked\}>Revoked<\/span>/);
  assert.match(view, /Number\.isNaN\(date\.getTime\(\)\)/);
  assert.match(view, /<time dateTime=\{createdAt\.dateTime\}>\{createdAt\.label\}<\/time>/);
  assert.match(view, /<time dateTime=\{revokedAt\.dateTime\}>\{revokedAt\.label\}<\/time>/);
  assert.match(view, /new Intl\.DateTimeFormat\("en-US"/);
  assert.match(view, /timeZone: "UTC"/);
  assert.match(view, /Date unavailable/);
});

test("assignment details show only existing DTO fields", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /aria-labelledby="assignment-details-title"/);
  for (const label of ["Assignment ID", "Scope", "Parent ID", "Role", "Role definition ID", "Grant actor user ID", "Break-glass", "Created", "Status"]) {
    assert.match(view, new RegExp(`<dt>${label}</dt>`));
  }
  assert.match(view, /assignment\.isBreakGlass && assignment\.breakGlassReason/);
  assert.match(view, /<code>\{assignment\.id\}<\/code>/);
  assert.match(view, /<code>\{assignment\.parentId\}<\/code>/);
  assert.match(view, /<code>\{assignment\.roleDefinitionId\}<\/code>/);
  assert.match(view, /assignment\.grantActorUserId \?\? "Not recorded"/);
});

test("loading, empty, error, and retry states cover members and assignments", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /Loading members…/);
  assert.match(view, /No members are available for this organization\./);
  assert.match(view, /Unable to load organization members\. Please try again\./);
  assert.match(view, /loadingState="Loading assignments…"/);
  assert.match(view, /No assignments to display\./);
  assert.match(view, /Unable to load role assignments\. Please try again\./);
  assert.match(view, /Couldn&apos;t refresh assignments\. Showing the last loaded list\./);
  assert.match(view, /onClick=\{onRetry\}/);
  assert.match(view, /PageHeading organizationId=\{organizationId\}/);
});

test("401/403 from members or assignments hides previously loaded protected assignment data", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");

  assert.match(view, /error instanceof HttpApiError/);
  assert.match(view, /error\.status === 401 \|\| error\.status === 403/);
  assert.match(view, /isAuthorizationRejection\(membersQuery\.error\)/);
  assert.match(view, /isAuthorizationRejection\(assignmentsQuery\.error\)/);
  assert.match(view, /membersQuery\.isError && membersAuthError\) \|\| \(assignmentsQuery\.isError && assignmentsAuthError\)/);
  assert.match(view, /Never keep protected assignment data visible after the server rejects/);
});

test("read-only UI never issues mutations or calls grant hooks", async () => {
  const view = await readSource("src/components/role-assignments/role-assignments-view.tsx");
  const page = await readSource("src/app/organizations/[organizationId]/role-assignments/page.tsx");

  assert.doesNotMatch(view, /(?:grantRoleAssignment|useGrantRoleAssignment|useMutation)/);
  assert.doesNotMatch(view, /"POST"/);
  assert.doesNotMatch(page, /revisions|mutation/i);
});

test("role assignment queries encode route and filter IDs and skip incomplete filters", async () => {
  const organizationId = "org/example";
  const complete = createRoleAssignmentsQueryOptions(organizationId, {
    scope: "ORGANIZATION",
    parentId: "org/example",
    userId: "user-1",
  });
  const incomplete = createRoleAssignmentsQueryOptions(organizationId, {
    scope: "ORGANIZATION",
    parentId: "",
    userId: "user-1",
  });

  assert.equal(complete.enabled, true);
  assert.equal(incomplete.enabled, false);

  const originalFetch = globalThis.fetch;
  const signal = new AbortController().signal;
  let request;

  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ organizationId, assignments: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await complete.queryFn({ signal });
    assert.deepEqual(response, { organizationId, assignments: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(complete.queryKey, [
    "organizations",
    organizationId,
    "role-assignments",
    { scope: "ORGANIZATION", parentId: "org/example", userId: "user-1" },
  ]);
  assert.equal(request.input, "/api/organizations/org%2Fexample/roles/assignments?scope=ORGANIZATION&parentId=org%2Fexample&userId=user-1");
  assert.equal(request.init.credentials, "same-origin");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.signal, signal);
});
