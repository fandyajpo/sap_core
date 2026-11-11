import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateAuthorization } from "../src/lib/authorization-policy-core.ts";

const org = "11111111-1111-4111-8111-111111111111";
const companyA = "22222222-2222-4222-8222-222222222222";
const companyB = "33333333-3333-4333-8333-333333333333";
const plantA = "44444444-4444-4444-8444-444444444444";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("membership-bound DENY overrides a matching ALLOW at the exact Company scope", () => {
  const decision = evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "COMPANY", organizationId: org, companyId: companyA },
    grants: [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }],
    denies: [{ scope: "COMPANY", scopeId: companyA, permissions: ["company.manage"] }],
  });
  assert.deepEqual(decision, { allowed: false, reason: "EXPLICIT_DENY" });
});

test("DENY at one Company scope does not propagate to a sibling Company or Plant", () => {
  const grants = [{ roleCode: "ORG_ADMIN", scope: "ORGANIZATION", scopeId: org }];
  const denies = [{ scope: "COMPANY", scopeId: companyA, permissions: ["company.manage"] }];
  assert.equal(evaluateAuthorization({
    permission: "company.manage",
    target: { scope: "COMPANY", organizationId: org, companyId: companyB },
    grants, denies,
  }).allowed, true);
  assert.equal(evaluateAuthorization({
    permission: "plant.manage",
    target: { scope: "PLANT", organizationId: org, companyId: companyA, plantId: plantA },
    grants,
    denies: [{ scope: "COMPANY", scopeId: companyA, permissions: ["plant.manage"] }],
  }).allowed, true);
});

test("the persisted DENY loader binds policy rows to the actor's exact membership and target scope", async () => {
  const loader = await source("src/lib/authorization-grant-loader.ts");
  assert.match(loader, /"target_membership_id" = \${context\.organizationMembershipId}::uuid/);
  assert.match(loader, /p\."scope" = \${context\.scope}::"core"\."RoleScope"/);
  assert.match(loader, /p\."revoked_at" IS NULL/);
  assert.match(loader, /p\."expires_at" > clock_timestamp\(\)/);
  assert.match(loader, /FOR SHARE OF p/);
  assert.match(loader, /denyEligiblePermissions/);
});

test("DENY policy administration uses a verified session and exact active ORG_OWNER assignment", async () => {
  const service = await source("src/lib/tenant-deny-policy-service.ts");
  assert.match(service, /lockVerifiedSessionRow/);
  assert.match(service, /rd\."code" = 'ORG_OWNER'/);
  assert.match(service, /rd\."kind" = 'SYSTEM'/);
  assert.match(service, /rd\."scope" = 'ORGANIZATION'/);
  assert.match(service, /ra\."revoked_at" IS NULL/);
  assert.match(service, /prisma\.\$transaction/);
  assert.match(service, /targetMembershipId/);
  assert.match(service, /clock_timestamp\(\)/);
  const permissionLookup = service.match(/FROM "core"\."permission_definition"[\s\S]*?\n    `;/);
  assert.ok(permissionLookup, "DENY creation must resolve the immutable permission catalog");
  assert.doesNotMatch(permissionLookup[0], /FOR SHARE|FOR UPDATE/);
});

test("DENY history reads are owner-only and successful/denied reads are audited", async () => {
  const service = await source("src/lib/tenant-deny-policy-service.ts");
  assert.match(service, /POLICY_READ_DENIED/);
  assert.match(service, /POLICY_READ/);
  assert.match(service, /resolveOwnerContext/);
  assert.match(service, /tenant_deny_audit_event/);
});

test("DENY audit history is append-only and policy records permit only one-way revocation", async () => {
  const migration = await source("prisma/migrations/20261109160000_v04_explicit_deny_policy/migration.sql");
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "core"\."tenant_deny_audit_event"/);
  assert.match(migration, /DENY audit events are append-only/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "core"\."tenant_deny_policy"/);
  assert.match(migration, /immutable except for one attributable revocation transition/);
  assert.match(migration, /Permission is not DENY-eligible/);
});

test("authorization grant loader locks mutable rows without locking SYSTEM catalog or permission snapshots", async () => {
  const loader = await source("src/lib/authorization-grant-loader.ts");
  const start = loader.indexOf("async function lockAuthorizationGrantRows(");
  const end = loader.indexOf("export async function loadAuthorizationGrants(", start);
  assert.ok(start >= 0 && end > start, "the authorization lock helper must remain explicit");
  const lockHelper = loader.slice(start, end);

  assert.match(lockHelper, /FOR SHARE OF ra, om/);
  assert.match(lockHelper, /FOR SHARE OF rd/);
  assert.match(lockHelper, /ORGANIZATION_CUSTOM/);
  assert.doesNotMatch(lockHelper, /FOR SHARE OF (?:ra|pa|cm|om)[^\n;]*\brd\b/);
  assert.doesNotMatch(lockHelper, /FOR SHARE OF (?:ra|pa|cm|om)[^\n;]*\bg\b/);
  assert.doesNotMatch(lockHelper, /JOIN "core"\."role_permission_grant"/);
});

test("DENY-eligible permission allowlists stay identical across service, runtime loader, and database trigger", async () => {
  const [service, loader, migration] = await Promise.all([
    source("src/lib/tenant-deny-policy-service.ts"),
    source("src/lib/authorization-grant-loader.ts"),
    source("prisma/migrations/20261109160000_v04_explicit_deny_policy/migration.sql"),
  ]);

  const extractSet = (text, pattern, label) => {
    const match = text.match(pattern);
    assert.ok(match, `${label} allowlist must remain explicit`);
    return [...match[1].matchAll(/['\"]([^'\"]+)['\"]/g)].map((entry) => entry[1]).sort();
  };

  const servicePermissions = extractSet(
    service,
    /const denyEligiblePermissions = new Set\\(\\[([\\s\\S]*?)\\]\\);/,
    "service",
  );
  const loaderPermissions = extractSet(
    loader,
    /const denyEligiblePermissions = new Set\(\[([\s\S]*?)\]\);/,
    "runtime loader",
  );
  const databasePermissions = extractSet(
    migration,
    /IF permission_code NOT IN \(([\s\S]*?)\) THEN/,
    "database trigger",
  );

  const approved = [
    "organization.read",
    "organization.update",
    "organization.members.read",
    "organization.members.manage",
    "company.read",
    "company.manage",
    "company.members.manage",
    "plant.read",
    "plant.manage",
    "plant.assignments.manage",
    "roles.read",
    "roles.create",
    "roles.revise",
    "roles.assign",
  ].sort();

  assert.deepEqual(servicePermissions, approved);
  assert.deepEqual(loaderPermissions, approved);
  assert.deepEqual(databasePermissions, approved);
});
