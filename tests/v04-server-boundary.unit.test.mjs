import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const scopedAccess = await readFile(new URL("../src/lib/scoped-access.ts", import.meta.url), "utf8");
const prisma = await readFile(new URL("../src/lib/prisma.ts", import.meta.url), "utf8");

test("Prisma client adapter is explicitly server-only", () => {
  assert.match(prisma, /^import ["']server-only["'];/);
});

test("scoped access persistence adapter is explicitly server-only", () => {
  assert.match(scopedAccess, /^import ["']server-only["'];/);
});

test("production scoped access adapter requires a verified session identity", () => {
  assert.match(scopedAccess, /createSessionBoundScopedAccessDatabase\(identity: VerifiedSessionIdentity\)/);
  assert.match(scopedAccess, /await lockVerifiedSessionRow\(session\.query, identity\)/);
});

test("scoped access adapter does not export an unbound Prisma database", () => {
  assert.doesNotMatch(scopedAccess, /export const scopedAccessDatabase\b/);
});

const tenantRoleDefinitionService = await readFile(new URL("../src/lib/tenant-role-definition-service.ts", import.meta.url), "utf8");

test("custom-role authorization installs tenant context before locking the active membership", () => {
  const bootstrapRead = tenantRoleDefinitionService.indexOf('LIMIT 1`,\n        [sessionUserId, input.organizationId],');
  const organizationContext = tenantRoleDefinitionService.indexOf("set_config('app.organization_id'");
  const membershipLock = tenantRoleDefinitionService.indexOf("FOR SHARE`,\n        [memberships[0].id, sessionUserId, input.organizationId]");
  assert.ok(bootstrapRead >= 0, "actor membership bootstrap read must exist");
  assert.ok(organizationContext > bootstrapRead, "Organization context must follow validated bootstrap read");
  assert.ok(membershipLock > organizationContext, "membership row lock must follow tenant context installation");
});

test("custom-role grant loading never locks global permission snapshots or SYSTEM role catalog rows", () => {
  assert.match(tenantRoleDefinitionService, /FOR SHARE OF rd/);
  assert.match(tenantRoleDefinitionService, /FOR SHARE OF ra, om/);
  assert.doesNotMatch(tenantRoleDefinitionService, /FOR SHARE OF ra, om, rd, g/);
  assert.doesNotMatch(tenantRoleDefinitionService, /FOR SHARE OF[^;\x60]*\bg\b/);
});

const roleDefinitionService = await readFile(new URL("../src/lib/role-definition-service.ts", import.meta.url), "utf8");

test("role-definition actor existence check does not lock read-only Better Auth identity rows", () => {
  const actorCheck = roleDefinitionService.match(/SELECT "id" FROM "core"\."user" WHERE "id" = \$1([^\x60]*)/);
  assert.ok(actorCheck, "human actor existence check must remain present");
  assert.doesNotMatch(actorCheck[1], /FOR SHARE|FOR UPDATE/i);
});
