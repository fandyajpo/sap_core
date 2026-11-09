import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const parsed = databaseUrl ? new URL(databaseUrl) : null;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.V04_SESSION_LOCK_ALLOW_DISPOSABLE_DB !== "1" ||
  !parsed ||
  !localHosts.has(parsed.hostname) ||
  parsed.port !== "55432" ||
  decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_v03_test"
) {
  throw new Error("Session-lock integration tests require explicit approval and localhost:55432/sap_core_v03_test.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const userId = `session-lock-user-${randomUUID()}`;
const email = `${userId}@example.invalid`;
const sessionId = `session-lock-${randomUUID()}`;
const token = randomUUID();
const lockSql = `SELECT s."id"::text AS "id"
  FROM "core"."session" s
 WHERE s."id" = $1
   AND s."userId" = $2
   AND s."expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
 FOR SHARE OF s`;

before(async () => {
  await pool.query(
    `INSERT INTO "core"."user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, 'Session lock fixture', $2, false, NOW(), NOW())`,
    [userId, email],
  );
});

after(async () => {
  await pool.query('DELETE FROM "core"."session" WHERE "userId" = $1', [userId]);
  await pool.query('DELETE FROM "core"."user" WHERE "id" = $1', [userId]);
  await pool.end();
});

async function insertSession(id, expiresAt = new Date(Date.now() + 60_000)) {
  await pool.query(
    `INSERT INTO "core"."session"
       ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
     VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
    [id, expiresAt, randomUUID(), userId],
  );
}

test("FOR SHARE lock blocks Better Auth-compatible session-row deletion until protected transaction commits", async () => {
  await insertSession(sessionId);
  const protectedClient = await pool.connect();
  const revokeClient = await pool.connect();
  try {
    await protectedClient.query("BEGIN");
    const locked = await protectedClient.query(lockSql, [sessionId, userId]);
    assert.equal(locked.rowCount, 1);

    await revokeClient.query("BEGIN");
    await revokeClient.query("SET LOCAL lock_timeout = '250ms'");
    await assert.rejects(
      revokeClient.query('DELETE FROM "core"."session" WHERE "id" = $1', [sessionId]),
      (error) => error.code === "55P03",
    );
    await revokeClient.query("ROLLBACK");

    await protectedClient.query("COMMIT");
    await revokeClient.query("DELETE FROM "core"."session" WHERE "id" = $1", [sessionId]);
    await revokeClient.query("COMMIT");

    const remaining = await pool.query('SELECT 1 FROM "core"."session" WHERE "id" = $1', [sessionId]);
    assert.equal(remaining.rowCount, 0);
  } finally {
    await protectedClient.query("ROLLBACK").catch(() => {});
    await revokeClient.query("ROLLBACK").catch(() => {});
    protectedClient.release();
    revokeClient.release();
  }
});

test("revocation-first, expired, and mismatched-user sessions fail the authoritative row check", async () => {
  const revokedId = `session-revoked-${randomUUID()}`;
  const expiredId = `session-expired-${randomUUID()}`;
  await insertSession(revokedId);
  await insertSession(expiredId, new Date(Date.now() - 60_000));

  await pool.query('DELETE FROM "core"."session" WHERE "id" = $1', [revokedId]);
  const revoked = await pool.query(lockSql, [revokedId, userId]);
  const expired = await pool.query(lockSql, [expiredId, userId]);
  const mismatched = await pool.query(lockSql, [expiredId, "different-user"]);
  assert.equal(revoked.rowCount, 0);
  assert.equal(expired.rowCount, 0);
  assert.equal(mismatched.rowCount, 0);
});
