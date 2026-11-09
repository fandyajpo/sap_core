import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("tenant authorization installs actor GUC before membership resolution and verified scope GUCs before grant loading", async () => {
  const authorization = await source("src/lib/tenant-authorization.ts");
  const actorGuc = authorization.indexOf("set_config('app.user_id'");
  const targetResolution = authorization.indexOf("resolveTenantTargetContext(tx, session, request)");
  const organizationGuc = authorization.indexOf("set_config('app.organization_id'");
  const grantLoading = authorization.indexOf("loadAuthorizationGrants(tx, context)");

  assert.notEqual(actorGuc, -1);
  assert.notEqual(targetResolution, -1);
  assert.notEqual(organizationGuc, -1);
  assert.notEqual(grantLoading, -1);
  assert.ok(actorGuc < targetResolution, "actor context is installed before membership resolution");
  assert.ok(targetResolution < organizationGuc, "tenant scope context follows validated target ancestry");
  assert.ok(organizationGuc < grantLoading, "grant loading uses the verified tenant context");
  assert.match(authorization, /set_config\('app\.user_id',[\s\S]*?, true\)/);
  assert.match(authorization, /set_config\('app\.organization_id',[\s\S]*?, true\)/);
  assert.match(authorization, /TenantTargetContextError\("UNAUTHENTICATED"/);
});

test("all tenant GUC writes are transaction-local and use the injected transaction client", async () => {
  const authorization = await source("src/lib/tenant-authorization.ts");
  const writes = [...authorization.matchAll(/set_config\(/g)];
  assert.equal(writes.length, 4, "one actor and three verified scope GUCs are installed");
  assert.doesNotMatch(authorization, /\bSET\s+(?:SESSION\s+)?app\./i);
  assert.doesNotMatch(authorization, /from ["']@\/lib\/prisma["']/);
  assert.match(authorization, /tx\.\$queryRaw/);
});

test("Company and Plant target GUCs are installed only after each descendant is verified", async () => {
  const target = await source("src/lib/tenant-target-context.ts");
  const membershipQuery = target.indexOf("async findOrganizationMembership");
  const organizationGuc = target.indexOf("set_config('app.organization_id'");
  const companyQuery = target.indexOf("async findCompanyTarget");
  const companyGuc = target.indexOf("set_config('app.company_id'");
  const plantQuery = target.indexOf("async findPlantTarget");
  const plantGuc = target.indexOf("set_config('app.plant_id'");

  assert.ok(membershipQuery < organizationGuc && organizationGuc < companyQuery);
  assert.ok(companyQuery < companyGuc && companyGuc < plantQuery);
  assert.ok(plantQuery < plantGuc);
  assert.match(target, /if \(membership\) \{[\s\S]*set_config\('app\.organization_id'/);
  assert.match(target, /if \(company\) \{[\s\S]*set_config\('app\.company_id'/);
  assert.match(target, /if \(plant\) \{[\s\S]*set_config\('app\.plant_id'/);
});


test("custom role create and revise hold an active Organization membership lock through commit", async () => {
  const adapter = await source("src/lib/tenant-role-definition-service.ts");
  const membershipCheck = adapter.indexOf('FROM "core"."organization_membership"');
  const membershipLock = adapter.indexOf("FOR SHARE", membershipCheck);
  const membershipCheckEnd = adapter.indexOf(");", membershipCheck);

  assert.notEqual(membershipCheck, -1);
  assert.notEqual(membershipLock, -1);
  assert.ok(membershipLock < membershipCheckEnd, "the active actor membership row is locked by the operation transaction");
});
