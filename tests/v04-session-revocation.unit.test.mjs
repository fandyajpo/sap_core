import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("verified session lock binds exact session and user, checks database expiry, and uses FOR SHARE", async () => {
  const lock = await source("src/lib/verified-session-lock.ts");
  assert.match(lock, /"core"\."session"/);
  assert.match(lock, /s\."id" = \$1/);
  assert.match(lock, /s\."userId" = \$2/);
  assert.match(lock, /s\."expiresAt" > \(clock_timestamp\(\) AT TIME ZONE 'UTC'\)/);
  assert.match(lock, /FOR SHARE OF s/);
  assert.match(lock, /if \(!rows\[0\]\)/);
});

test("tenant permission locks the verified session before actor GUC and tenant authorization", async () => {
  const authorization = await source("src/lib/tenant-authorization.ts");
  const lock = authorization.indexOf("lockVerifiedSessionRow(");
  const actorGuc = authorization.indexOf("set_config('app.user_id'");
  const target = authorization.indexOf("resolveTenantTargetContext(tx, session, request)");
  const grants = authorization.indexOf("loadAuthorizationGrants(tx, context)");
  assert.ok(lock >= 0 && lock < actorGuc && actorGuc < target && target < grants);
  assert.match(authorization, /sessionId: session\.session\.id/);
  assert.match(authorization, /userId: session\.user\.id/);
});

test("all tenant role assignment and custom role operations use a session-bound transaction adapter", async () => {
  const assignments = await source("src/lib/tenant-role-assignment-service.ts");
  const definitions = await source("src/lib/tenant-role-definition-service.ts");
  for (const sourceText of [assignments, definitions]) {
    assert.match(sourceText, /createSessionBoundScopedAccessDatabase\(/);
    assert.match(sourceText, /sessionId: session\.session\.id/);
    assert.match(sourceText, /userId: actorUserId/);
    assert.doesNotMatch(sourceText, /\bscopedAccessDatabase\b/);
  }
});

test("session-bound adapter acquires the row lock inside the same interactive transaction", async () => {
  const adapter = await source("src/lib/scoped-access.ts");
  const transaction = adapter.indexOf("prisma.$transaction(async (transaction)");
  const lock = adapter.indexOf("lockVerifiedSessionRow(session.query, identity)");
  const work = adapter.indexOf("return work(session)");
  assert.ok(transaction >= 0 && transaction < lock && lock < work);
});


test("session lock propagates database errors before protected callback execution", async () => {
  const lock = await source("src/lib/verified-session-lock.ts");
  assert.match(lock, /const rows = await query\(/);
  assert.doesNotMatch(lock, /\.catch\(/);

  const adapter = await source("src/lib/scoped-access.ts");
  const lockPosition = adapter.indexOf("await lockVerifiedSessionRow(session.query, identity)");
  const callbackPosition = adapter.indexOf("return work(session)");
  assert.ok(lockPosition >= 0 && callbackPosition > lockPosition);

  const authorization = await source("src/lib/tenant-authorization.ts");
  const authorizationLock = authorization.indexOf("await lockVerifiedSessionRow(");
  const actorContext = authorization.indexOf("set_config('app.user_id'");
  assert.ok(authorizationLock >= 0 && actorContext > authorizationLock);
});
