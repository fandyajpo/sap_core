import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createOrganizationRolesQueryOptions } from "../src/lib/client-data/queries/use-organization-roles.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("organization roles page requires a session and passes the route ID to the client view", async () => {
  const page = await readSource("src/app/organizations/[organizationId]/roles/page.tsx");

  assert.doesNotMatch(page, /^\s*["']use client["']/);
  assert.match(page, /await requireCurrentSession\(\)/);
  assert.match(page, /params: Promise<\{ organizationId: string \}>/);
  assert.match(page, /<OrganizationRolesView organizationId=\{organizationId\}\s*\/>/);
  assert.doesNotMatch(page, /(?:prisma|listOrganizationRoles|useOrganizationRoles)/i);
});

test("client view uses the existing query hook and never branches on client authorization", async () => {
  const view = await readSource("src/components/organization-roles/organization-roles-view.tsx");

  assert.match(view, /useOrganizationRoles\(organizationId\)/);
  assert.doesNotMatch(view, /(?:auth-session|@\/lib\/prisma|listOrganizationRoles|\bfetch\s*\()/);
  assert.doesNotMatch(view, /(?:canAccessOrganization|isAuthorized|authorizationGrant|userId)/i);
  assert.doesNotMatch(view, /query\.error(?:\?\.message|\.message)/);
});

test("loading, denied/error, empty, retry, and successful states use only safe messages and DTO rows", async () => {
  const view = await readSource("src/components/organization-roles/organization-roles-view.tsx");

  assert.match(view, /query\.error instanceof HttpApiError/);
  assert.match(view, /query\.error\.status === 401 \|\| query\.error\.status === 403/);
  assert.match(view, /if \(query\.isError && \(!query\.data \|\| isAuthorizationError\)\)/);
  assert.match(view, /Never keep protected role data visible after the server rejects access/);
  assert.match(view, /if \(query\.isLoading\)/);
  assert.doesNotMatch(view, /query\.isLoading\s*\|\|\s*query\.isFetching/);
  assert.match(view, /isLoading\s+loadingState="Loading organization roles…"/);
  assert.match(view, /Unable to load organization roles\. Please try again\./);
  assert.match(view, /Couldn&apos;t refresh roles\. Showing the last loaded list\./);
  assert.match(view, /onClick=\{onRetry\}/);
  assert.match(view, /PageHeading organizationId=\{organizationId\}/);
  assert.match(view, /No roles to display\./);
  assert.match(view, /data=\{query\.data\.roles\}/);
});

test("roles fields map to table columns with role id identity and formatted dates", async () => {
  const view = await readSource("src/components/organization-roles/organization-roles-view.tsx");
  const dataTable = await readSource("src/components/data-table/data-table.tsx");

  for (const field of ["code", "kind", "scope", "version", "disabledAt"]) {
    assert.match(view, new RegExp(`accessorKey: "${field}"`));
  }
  assert.match(view, /id: "permissionCount"/);
  assert.match(view, /role\.permissions\.length/);
  assert.match(view, /getRowId=\{\(role\) => role\.id\}/);
  assert.match(view, /ariaLabel="Organization roles"/);
  assert.match(dataTable, /aria-label=\{ariaLabel\}/);
  assert.match(view, /aria-expanded=\{row\.original\.id === selectedRoleId\}/);
  assert.match(view, /<time dateTime=\{disabledAt\.dateTime\}>\{disabledAt\.label\}<\/time>/);
  assert.match(view, /new Intl\.DateTimeFormat\("en-US"/);
  assert.match(view, /timeZone: "UTC"/);
});

test("role details render DTO fields and permission codes without invented data", async () => {
  const view = await readSource("src/components/organization-roles/organization-roles-view.tsx");

  assert.match(view, /aria-labelledby="role-details-title"/);
  for (const label of ["Role code", "Role ID", "Role kind", "Scope", "Version", "Owner organization ID", "Status"]) {
    assert.match(view, new RegExp(`<dt>${label}</dt>`));
  }
  assert.match(view, /\{role\.code\}/);
  assert.match(view, /<code>\{role\.id\}<\/code>/);
  assert.match(view, /\{role\.kind\}/);
  assert.match(view, /\{role\.scope\}/);
  assert.match(view, /\{role\.version\}/);
  assert.match(view, /role\.ownerOrganizationId \?\? "Not applicable \(system role\)"/);
  assert.match(view, /aria-labelledby="role-permissions-title"/);
  assert.match(view, /role\.permissions\.map\(\(permission\) =>/);
  assert.match(view, /role\.permissions\.length === 0/);
  assert.match(view, /Revision history is not available yet/);
});

test("read-only UI never issues mutations or revision-history requests", async () => {
  const view = await readSource("src/components/organization-roles/organization-roles-view.tsx");
  const page = await readSource("src/app/organizations/[organizationId]/roles/page.tsx");

  assert.doesNotMatch(
    view,
    /(?:useCreateOrganizationRole|useReviseOrganizationRole|createOrganizationRole|reviseOrganizationRole|useMutation)/,
  );
  assert.doesNotMatch(view, /"POST"/);
  assert.doesNotMatch(view, /revisions/i);
  assert.doesNotMatch(page, /revisions|mutation/i);
});

test("organization role queries encode the route ID and discard inactive protected results", async () => {
  const organizationId = "org/example";
  const options = createOrganizationRolesQueryOptions(organizationId);
  const originalFetch = globalThis.fetch;
  const signal = new AbortController().signal;
  let request;

  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ organizationId, roles: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await options.queryFn({ signal });
    assert.deepEqual(response, { organizationId, roles: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(options.queryKey, ["organizations", organizationId, "roles"]);
  assert.equal(options.enabled, true);
  assert.equal(options.gcTime, 0);
  assert.equal(options.staleTime, 0);
  assert.equal(request.input, "/api/organizations/org%2Fexample/roles");
  assert.equal(request.init.credentials, "same-origin");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.signal, signal);
});
