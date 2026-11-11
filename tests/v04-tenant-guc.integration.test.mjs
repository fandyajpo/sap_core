import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { assertDisposablePostgresUrl } from "./v04-integration-safety.mjs";

const { Pool } = pg;
// Fixture lifecycle: this suite inserts no rows — it exercises
// transaction-local GUCs on pooled backends only — so teardown only has to
// close its pools. It must still run exclusively against the exact disposable
// database CI provisions for it; the guard below refuses anything else and
// there is no fallback.
assertDisposablePostgresUrl({
  value: process.env.DATABASE_URL,
  suiteLabel: "V04 GUC tests",
  optInEnvName: "V04_ALLOW_DISPOSABLE_DB",
  expectedPort: 55435,
  expectedDatabase: "sap_core_d7_test",
  expectedUsers: ["sap_core"],
});

const databaseUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const concurrentPool = new Pool({ connectionString: databaseUrl, max: 2 });
after(async () => {
  // Failure-safe: both pools close even if one end() rejects, and the
  // failure is surfaced instead of swallowed.
  const outcomes = await Promise.allSettled([pool.end(), concurrentPool.end()]);
  const errors = outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => outcome.reason);
  if (errors.length) throw new AggregateError(errors, "V04 GUC teardown failed to close its connection pools.");
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
