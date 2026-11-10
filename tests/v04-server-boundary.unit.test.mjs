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
