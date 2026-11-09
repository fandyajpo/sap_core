import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the D1 integration suite.");
}

const parsedDatabaseURL = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseURL.pathname.slice(1));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.D1_ALLOW_DISPOSABLE_DB !== "1" ||
  !localHosts.has(parsedDatabaseURL.hostname) ||
  parsedDatabaseURL.port !== "55436" ||
  databaseName !== "sap_core_d1_test"
) {
  throw new Error(
    "D1 tests require explicit disposable DB approval and localhost:55436/sap_core_d1_test.",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const userId = randomUUID();
const concurrentUserId = randomUUID();
const organizationIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const membershipIds = [randomUUID(), randomUUID(), randomUUID()];
const concurrentMembershipIds = [randomUUID(), randomUUID()];
const emailPrefix = `d1-${randomUUID()}-`;
let fixtureReady = false;

async function insertUser(id, suffix) {
  await pool.query(
    `INSERT INTO "core"."user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, 'D1 fixture', $2, false, NOW(), NOW())`,
    [id, `${emailPrefix}${suffix}@example.test`],
  );
}

async function waitForLockWait(applicationName) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const { rows } = await pool.query(
      `SELECT "wait_event_type"
       FROM pg_stat_activity
       WHERE "application_name" = $1`,
      [applicationName],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PostgreSQL lock: ${applicationName}`);
}

async function assertSlotViolation(statement, values) {
  const client = await pool.connect();
  const savepoint = `d1_expected_failure_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`SAVEPOINT "${savepoint}"`);
    let caught;
    try {
      await client.query(statement, values);
    } catch (error) {
      caught = error;
    }
    await client.query(`ROLLBACK TO SAVEPOINT "${savepoint}"`);
    await client.query(`RELEASE SAVEPOINT "${savepoint}"`);
    await client.query("ROLLBACK");
    assert.equal(caught?.code, "23505");
    assert.equal(caught?.constraint, "organization_membership_user_slot_key");
  } finally {
    client.release();
  }
}

before(async () => {
  await pool.query("SELECT 1");
  const { rows } = await pool.query(
    `SELECT to_regclass('"core"."organization_membership"') IS NOT NULL AS present`,
  );
  assert.equal(rows[0].present, true);
  await insertUser(userId, "lifecycle");
  await insertUser(concurrentUserId, "concurrency");
  await pool.query(
    `INSERT INTO "core"."organization" ("id", "updated_at")
     VALUES ($1, NOW()), ($2, NOW()), ($3, NOW()), ($4, NOW())`,
    organizationIds,
  );
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "updated_at")
     VALUES
       ($1, $2, $3, 'PENDING', NOW()),
       ($4, $2, $5, 'PENDING', NOW()),
       ($6, $2, $7, 'PENDING', NOW())`,
    [
      membershipIds[0], userId, organizationIds[0],
      membershipIds[1], organizationIds[1],
      membershipIds[2], organizationIds[2],
    ],
  );
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "updated_at")
     VALUES ($1, $2, $3, 'PENDING', NOW()), ($4, $2, $5, 'PENDING', NOW())`,
    [
      concurrentMembershipIds[0], concurrentUserId, organizationIds[2],
      concurrentMembershipIds[1], organizationIds[3],
    ],
  );
  fixtureReady = true;
});

after(async () => {
  try {
    if (fixtureReady) {
      await pool.query(
        `DELETE FROM "core"."organization_membership"
         WHERE "id" = ANY($1::uuid[])`,
        [[...membershipIds, ...concurrentMembershipIds]],
      );
      await pool.query(
        `DELETE FROM "core"."organization"
         WHERE "id" = ANY($1::uuid[])`,
        [organizationIds],
      );
      await pool.query(
        `DELETE FROM "core"."user" WHERE "id" = ANY($1::text[])`,
        [[userId, concurrentUserId]],
      );
      const { rows } = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM "core"."organization_membership"
            WHERE "id" = ANY($1::uuid[])) AS memberships,
           (SELECT COUNT(*)::int FROM "core"."organization"
            WHERE "id" = ANY($2::uuid[])) AS organizations,
           (SELECT COUNT(*)::int FROM "core"."user"
            WHERE "id" = ANY($3::text[])) AS users`,
        [[...membershipIds, ...concurrentMembershipIds], organizationIds, [userId, concurrentUserId]],
      );
      assert.deepEqual(rows[0], { memberships: 0, organizations: 0, users: 0 });
    }
  } finally {
    await pool.end();
  }
});

test("D1 organization membership slot predicate and concurrent activation", async (t) => {
  await t.test("PENDING and terminal states release the slot; ACTIVE and SUSPENDED occupy it", async () => {
    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[0]],
    );

    await assertSlotViolation(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[1]],
    );

    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'SUSPENDED', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[0]],
    );
    await assertSlotViolation(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[1]],
    );

    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'REVOKED', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[0]],
    );
    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[1]],
    );
    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ENDED', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[1]],
    );
    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipIds[2]],
    );

    const { rows } = await pool.query(
      `SELECT "id", "status"::text AS "status"
       FROM "core"."organization_membership"
       WHERE "id" = ANY($1::uuid[])
       ORDER BY "id"`,
      [membershipIds],
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(
      Object.fromEntries(rows.map((row) => [row.id, row.status])),
      {
        [membershipIds[0]]: "REVOKED",
        [membershipIds[1]]: "ENDED",
        [membershipIds[2]]: "ACTIVE",
      },
    );
  });

  await t.test("two concurrent activations across Organizations fail closed", async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const applicationName = `d1-activation-${randomUUID()}`;
    let firstOpen = false;
    let secondOpen = false;
    let secondInsert;

    try {
      await first.query("BEGIN");
      firstOpen = true;
      await first.query(
        `UPDATE "core"."organization_membership"
         SET "status" = 'ACTIVE', "updated_at" = NOW()
         WHERE "id" = $1`,
        [concurrentMembershipIds[0]],
      );

      await second.query("BEGIN");
      secondOpen = true;
      await second.query("SELECT set_config('application_name', $1, false)", [applicationName]);
      secondInsert = assert.rejects(
        second.query(
          `UPDATE "core"."organization_membership"
           SET "status" = 'ACTIVE', "updated_at" = NOW()
           WHERE "id" = $1`,
          [concurrentMembershipIds[1]],
        ),
        (error) => {
          assert.equal(error.code, "23505");
          assert.equal(error.constraint, "organization_membership_user_slot_key");
          return true;
        },
      );
      // Attach the rejection assertion before releasing the first transaction's
      // unique-index lock so Node does not report a transient unhandled rejection.
      await waitForLockWait(applicationName);
      await first.query("COMMIT");
      firstOpen = false;

      await secondInsert;
      await second.query("ROLLBACK");
      secondOpen = false;
    } finally {
      if (firstOpen) await first.query("ROLLBACK");
      if (secondOpen) await second.query("ROLLBACK");
      first.release();
      second.release();
    }

    const { rows } = await pool.query(
      `SELECT "id", "status"::text AS "status"
       FROM "core"."organization_membership"
       WHERE "id" = ANY($1::uuid[])
       ORDER BY "id"`,
      [concurrentMembershipIds],
    );
    assert.deepEqual(
      Object.fromEntries(rows.map((row) => [row.id, row.status])),
      {
        [concurrentMembershipIds[0]]: "ACTIVE",
        [concurrentMembershipIds[1]]: "PENDING",
      },
    );
  });
});
