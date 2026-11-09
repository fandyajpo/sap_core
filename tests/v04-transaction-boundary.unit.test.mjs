import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("tenant target resolution and grant loading require an injected transaction client", async () => {
  const [target, grants, authorization] = await Promise.all([
    source("src/lib/tenant-target-context.ts"),
    source("src/lib/authorization-grant-loader.ts"),
    source("src/lib/tenant-authorization.ts"),
  ]);

  assert.match(target, /tx:\s*Prisma\.TransactionClient/);
  assert.match(target, /tx\.\$queryRaw/);
  assert.doesNotMatch(target, /from ["']@\/lib\/prisma["']/);
  assert.match(grants, /tx:\s*Prisma\.TransactionClient/);
  assert.match(grants, /tx\.\$queryRaw/);
  assert.doesNotMatch(grants, /from ["']@\/lib\/prisma["']/);
  assert.match(authorization, /requireTenantPermission\(\s*tx:\s*Prisma\.TransactionClient/);
  assert.match(authorization, /loadAuthorizationGrants\(tx, context\)/);
});

test("protected Organization member read authorizes and queries through one interactive transaction", async () => {
  const reader = await source("src/lib/organization-members-reader.ts");
  const sessionIndex = reader.indexOf("await getCurrentSession()");
  const transactionIndex = reader.indexOf("prisma.$transaction");
  const authorizeIndex = reader.indexOf("requireTenantPermission(");
  const protectedQueryIndex = reader.indexOf("tx.$queryRaw");

  assert.notEqual(sessionIndex, -1);
  assert.notEqual(transactionIndex, -1);
  assert.notEqual(authorizeIndex, -1);
  assert.notEqual(protectedQueryIndex, -1);
  assert.ok(sessionIndex < transactionIndex, "Better Auth session is resolved before the transaction");
  assert.ok(transactionIndex < authorizeIndex, "authorization runs inside the transaction callback");
  assert.ok(authorizeIndex < protectedQueryIndex, "protected query follows authorization");
  assert.match(reader, /requireTenantPermission\(\s*tx,/);
  assert.doesNotMatch(reader, /prisma\.\$queryRaw/);
});
