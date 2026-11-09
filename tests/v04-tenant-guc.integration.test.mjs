import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the V04 GUC integration suite.");

const parsed = new URL(databaseUrl);
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (
  process.env.V04_ALLOW_DISPOSABLE_DB !== "1" ||
  !localHosts.has(parsed.hostname) ||
  parsed.port !== "55435" ||
  decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_d7_test"
) {
  throw new Error("V04 GUC tests require explicit disposable DB approval and localhost:55435/sap_core_d7_test.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const concurrentPool = new Pool({ connectionString: databaseUrl, max: 2 });
after(async () => {
  await Promise.all([pool.end(), concurrentPool.end()]);
});

test("transaction-local tenant GUCs remain on one backend and clear after commit, rollback, and exceptions", async () => {
  const client = await pool.connect();
  try {
    const before = await client.query("SELECT pg_backend_pid() AS pid");
    const pid = before.rows[0].pid;

    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true), set_config('app.company_id', '', true), set_config('app.plant_id', '', true)",
      ["actor-a", "org-a"],
    );
    const inside = await client.query(
      "SELECT pg_backend_pid() AS pid, current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
    );
    assert.equal(inside.rows[0].pid, pid);
    assert.equal(inside.rows[0].actor, "actor-a");
    assert.equal(inside.rows[0].organization, "org-a");
    await client.query("COMMIT");

    const afterCommit = await client.query(
      "SELECT current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
    );
    assert.ok(afterCommit.rows[0].actor == null || afterCommit.rows[0].actor === "");
    assert.ok(afterCommit.rows[0].organization == null || afterCommit.rows[0].organization === "");

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", ["actor-a", "org-a"]);
    await client.query("ROLLBACK");
    const afterRollback = await client.query(
      "SELECT current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
    );
    assert.ok(afterRollback.rows[0].actor == null || afterRollback.rows[0].actor === "");
    assert.ok(afterRollback.rows[0].organization == null || afterRollback.rows[0].organization === "");

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", ["actor-a", "org-a"]);
    await client.query("ROLLBACK"); // models an exception path after the caller aborts its transaction
    const afterException = await client.query(
      "SELECT current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
    );
    assert.ok(afterException.rows[0].actor == null || afterException.rows[0].actor === "");
    assert.ok(afterException.rows[0].organization == null || afterException.rows[0].organization === "");

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", ["actor-b", "org-b"]);
    const tenantB = await client.query(
      "SELECT pg_backend_pid() AS pid, current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
    );
    assert.equal(tenantB.rows[0].pid, pid, "the physical connection is reused");
    assert.equal(tenantB.rows[0].actor, "actor-b");
    assert.equal(tenantB.rows[0].organization, "org-b", "tenant A context does not survive into tenant B");
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
});

test("concurrent tenant transactions keep actor and organization GUCs isolated", async () => {
  const run = async (actor, organization) => {
    const client = await concurrentPool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
        [actor, organization],
      );
      await client.query("SELECT pg_sleep(0.05)");
      const result = await client.query(
        "SELECT current_setting('app.user_id', true) AS actor, current_setting('app.organization_id', true) AS organization",
      );
      assert.equal(result.rows[0].actor, actor);
      assert.equal(result.rows[0].organization, organization);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
  await Promise.all([run("actor-a", "org-a"), run("actor-b", "org-b")]);
});
