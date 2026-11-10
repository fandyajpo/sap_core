import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createOrganizationMembersQueryOptions } from "../src/lib/client-data/queries/use-organization-members.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(relativePath) {
  return readFile(path.join(repositoryRoot, relativePath), "utf8");
}

test("organization members page requires a session and passes the route ID to the client view", async () => {
  const page = await readSource("src/app/organizations/[organizationId]/members/page.tsx");

  assert.doesNotMatch(page, /^\s*["']use client["']/);
  assert.match(page, /await requireCurrentSession\(\)/);
  assert.match(page, /params: Promise<\{ organizationId: string \}>/);
  assert.match(page, /<OrganizationMembersView organizationId=\{organizationId\}\s*\/>/);
  assert.doesNotMatch(page, /(?:prisma|listOrganizationMembers|useOrganizationMembers)/i);
});

test("client view uses the existing query hook and never branches on client authorization", async () => {
  const view = await readSource("src/components/organization-members/organization-members-view.tsx");

  assert.match(view, /useOrganizationMembers\(organizationId\)/);
  assert.doesNotMatch(view, /(?:auth-session|@\/lib\/prisma|listOrganizationMembers|\bfetch\s*\()/);
  assert.doesNotMatch(view, /(?:canAccessOrganization|isAuthorized|authorizationGrant|userId)/i);
  assert.doesNotMatch(view, /query\.error(?:\?\.message|\.message)/);
});

test("loading, denied/error, empty, retry, and successful states use only safe messages and DTO rows", async () => {
  const view = await readSource("src/components/organization-members/organization-members-view.tsx");

  assert.match(view, /if \(query\.isError && !query\.data\)/);
  assert.match(view, /if \(query\.isLoading\)/);
  assert.doesNotMatch(view, /query\.isLoading\s*\|\|\s*query\.isFetching/);
  assert.match(view, /isLoading\s+loadingState="Loading organization members…"/);
  assert.match(view, /Unable to load organization members\. Please try again\./);
  assert.match(view, /onClick=\{onRetry\}/);
  assert.match(view, /PageHeading organizationId=\{organizationId\}/);
  assert.match(view, /No members to display\./);
  assert.match(view, /data=\{query\.data\.members\}/);
});

test("members fields map to table columns with membershipId identity and formatted dates", async () => {
  const view = await readSource("src/components/organization-members/organization-members-view.tsx");
  const dataTable = await readSource("src/components/data-table/data-table.tsx");

  for (const field of ["name", "email", "status", "createdAt"]) {
    assert.match(view, new RegExp(`accessorKey: "${field}"`));
  }
  assert.match(view, /getRowId=\{\(member\) => member\.membershipId\}/);
  assert.match(view, /ariaLabel="Organization members"/);
  assert.match(dataTable, /aria-label=\{ariaLabel\}/);
  assert.match(view, /<time dateTime=\{createdAt\.dateTime\}>\{createdAt\.label\}<\/time>/);
  assert.match(view, /new Intl\.DateTimeFormat\("en-US"/);
  assert.match(view, /timeZone: "UTC"/);
});

test("organization-member queries encode the route ID and discard inactive protected results", async () => {
  const organizationId = "org/example";
  const options = createOrganizationMembersQueryOptions(organizationId);
  const originalFetch = globalThis.fetch;
  const signal = new AbortController().signal;
  let request;

  globalThis.fetch = async (input, init) => {
    request = { input: String(input), init };
    return new Response(JSON.stringify({ organizationId, members: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await options.queryFn({ signal });
    assert.deepEqual(response, { organizationId, members: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(options.queryKey, ["organizations", organizationId, "members"]);
  assert.equal(options.enabled, true);
  assert.equal(options.gcTime, 0);
  assert.equal(options.staleTime, 0);
  assert.equal(request.input, "/api/organizations/org%2Fexample/members");
  assert.equal(request.init.credentials, "same-origin");
  assert.equal(request.init.cache, "no-store");
  assert.equal(request.init.signal, signal);
});
