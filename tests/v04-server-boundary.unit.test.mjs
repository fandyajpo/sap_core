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

test("scoped access adapter exports persistence only, not unguarded lifecycle helpers", () => {
  assert.match(scopedAccess, /export const scopedAccessDatabase/);
  for (const name of [
    "scopedAccess",
    "grantCompanyMembership",
    "suspendCompanyMembership",
    "restoreCompanyMembership",
    "revokeCompanyMembership",
    "endCompanyMembership",
    "grantPlantAssignment",
    "suspendPlantAssignment",
    "restorePlantAssignment",
    "revokePlantAssignment",
    "endPlantAssignment",
    "hasCompanyAccess",
    "hasPlantAccess",
  ]) {
    assert.doesNotMatch(scopedAccess, new RegExp(`export\\s+(?:const|function|class)\\s+${name}\\b`));
  }
});
