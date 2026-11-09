import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { createScopedAccessService, ScopedAccessError } from "../src/lib/scoped-access-service.ts";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the D6 integration suite.");
}

const parsedDatabaseURL = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseURL.pathname.slice(1));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.D6_ALLOW_DISPOSABLE_DB !== "1" ||
  !localHosts.has(parsedDatabaseURL.hostname) ||
  parsedDatabaseURL.port !== "55433" ||
  databaseName !== "sap_core_d6_test"
) {
  throw new Error(
    "D6 tests require explicit disposable DB approval and localhost:55433/sap_core_d6_test.",
  );
}
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const fixture = {
  users: [randomUUID(), randomUUID(), randomUUID()],
  organizations: [randomUUID(), randomUUID()],
  companies: [randomUUID(), randomUUID(), randomUUID()],
  plants: [randomUUID(), randomUUID(), randomUUID()],
  organizationMemberships: [randomUUID(), randomUUID(), randomUUID()],
};
const emailPrefix = `d6-${randomUUID()}-`;
const requiredIndexes = [
  "company_membership_user_company_current_key",
  "plant_assignment_user_plant_current_key",
];
let schemaReady = false;

function createPgSession(client) {
  return {
    async query(statement, values = []) {
      const result = await client.query(statement, values);
      return result.rows;
    },
  };
}

const database = {
  ...createPgSession(pool),
  async transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(createPgSession(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

const scopedAccess = createScopedAccessService(database);

async function insertUser(userId, email) {
  await pool.query(
    `INSERT INTO "core"."user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, 'D6 fixture', $2, false, NOW(), NOW())`,
    [userId, email],
  );
}

async function readAssignment(table, id) {
  const { rows } = await pool.query(
    `SELECT "id", "status" FROM "core"."${table}" WHERE "id" = $1`,
    [id],
  );
  return rows[0];
}

async function waitForLockWait(applicationName) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    const { rows } = await pool.query(
      `SELECT "wait_event_type" FROM pg_stat_activity WHERE "application_name" = $1`,
      [applicationName],
    );
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PostgreSQL lock: ${applicationName}`);
}

async function assertDomainError(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof ScopedAccessError);
    assert.equal(error.code, code);
    return true;
  });
}

before(async () => {
  await pool.query("SELECT 1");

  const { rows: tableRows } = await pool.query(`
    SELECT
      to_regclass('"core"."user"') IS NOT NULL AS auth_user,
      to_regclass('"core"."organization"') IS NOT NULL AS organization,
      to_regclass('"core"."company"') IS NOT NULL AS company,
      to_regclass('"core"."plant"') IS NOT NULL AS plant,
      to_regclass('"core"."organization_membership"') IS NOT NULL AS organization_membership,
      to_regclass('"core"."company_membership"') IS NOT NULL AS company_membership,
      to_regclass('"core"."plant_assignment"') IS NOT NULL AS plant_assignment
  `);
  assert.deepEqual(
    Object.values(tableRows[0]),
    [true, true, true, true, true, true, true],
    "V04 tenant-scope tables must exist",
  );

  const { rows: indexRows } = await pool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'core' AND indexname = ANY($1::text[])`,
    [requiredIndexes],
  );
  assert.equal(indexRows.length, requiredIndexes.length, "the D6 partial unique indexes must exist");
  for (const row of indexRows) {
    assert.match(row.indexdef, /UNIQUE INDEX/);
    assert.match(row.indexdef, /WHERE/i);
    assert.match(row.indexdef, /ACTIVE/i);
    assert.match(row.indexdef, /SUSPENDED/i);
  }
  schemaReady = true;

  const [userA, userB, userC] = fixture.users;
  const [organizationA, organizationB] = fixture.organizations;
  const [companyA, companyA2, companyB] = fixture.companies;
  const [plantA, plantA2, plantB] = fixture.plants;
  const [membershipA, membershipB, membershipC] = fixture.organizationMemberships;

  await insertUser(userA, `${emailPrefix}a@example.test`);
  await insertUser(userB, `${emailPrefix}b@example.test`);
  await insertUser(userC, `${emailPrefix}c@example.test`);

  await pool.query(
    `INSERT INTO "core"."organization" ("id", "updated_at") VALUES
       ($1, NOW()), ($2, NOW())`,
    [organizationA, organizationB],
  );
  await pool.query(
    `INSERT INTO "core"."company" ("id", "organizationId", "updated_at") VALUES
       ($1, $2, NOW()), ($3, $2, NOW()), ($4, $5, NOW())`,
    [companyA, organizationA, companyA2, companyB, organizationB],
  );
  await pool.query(
    `INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "updated_at") VALUES
       ($1, $2, $3, NOW()), ($4, $2, $3, NOW()), ($5, $6, $7, NOW())`,
    [plantA, organizationA, companyA, plantA2, plantB, organizationB, companyB],
  );
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "updated_at") VALUES
       ($1, $2, $3, 'ACTIVE', NOW()),
       ($4, $5, $6, 'ACTIVE', NOW()),
       ($7, $8, $3, 'ACTIVE', NOW())`,
    [membershipA, userA, organizationA, membershipB, userB, organizationB, membershipC, userC],
  );
});

after(async () => {
  const cleanupErrors = [];
  try {
    if (schemaReady) {
      const cleanup = [
        ['DELETE FROM "core"."plant_assignment" WHERE "userId" = ANY($1::text[])', fixture.users],
        ['DELETE FROM "core"."company_membership" WHERE "userId" = ANY($1::text[])', fixture.users],
        ['DELETE FROM "core"."organization_membership" WHERE "id" = ANY($1::uuid[])', fixture.organizationMemberships],
        ['DELETE FROM "core"."plant" WHERE "id" = ANY($1::uuid[])', fixture.plants],
        ['DELETE FROM "core"."company" WHERE "id" = ANY($1::uuid[])', fixture.companies],
        ['DELETE FROM "core"."organization" WHERE "id" = ANY($1::uuid[])', fixture.organizations],
        ['DELETE FROM "core"."user" WHERE "id" = ANY($1::text[])', fixture.users],
      ];
      for (const [statement, values] of cleanup) {
        try {
          await pool.query(statement, [values]);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "D6 fixture cleanup failed.");
    }
  } finally {
    await pool.end();
  }
});

test("D6 Company Membership and Plant Assignment lifecycles", async (t) => {
  const [userA, userB, userC] = fixture.users;
  const [companyA, companyA2, companyB] = fixture.companies;
  const [plantA, plantA2, plantB] = fixture.plants;
  const [membershipA, membershipB, membershipC] = fixture.organizationMemberships;
  let companyMembership;
  let concurrentCompanyMembership;

  await t.test("company grants validate references and parent scope", async () => {
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: `missing-${randomUUID()}`,
        organizationMembershipId: membershipA,
        companyId: companyA,
      }),
      "USER_NOT_FOUND",
    );
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipA,
        companyId: randomUUID(),
      }),
      "COMPANY_NOT_FOUND",
    );
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: randomUUID(),
        companyId: companyA,
      }),
      "ORGANIZATION_MEMBERSHIP_NOT_FOUND",
    );
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipB,
        companyId: companyA,
      }),
      "PARENT_MISMATCH",
    );
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipA,
        companyId: companyB,
      }),
      "PARENT_MISMATCH",
    );

    companyMembership = await scopedAccess.grantCompanyMembership({
      userId: userA,
      organizationMembershipId: membershipA,
      companyId: companyA,
    });
    assert.equal(companyMembership.status, "ACTIVE");
    assert.equal(await scopedAccess.hasCompanyAccess(userA, companyA), true);
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipA,
        companyId: companyA,
      }),
      "CURRENT_SLOT_OCCUPIED",
    );
  });

  await t.test("company suspension retains the slot; restore preserves the ID", async () => {
    const suspended = await scopedAccess.suspendCompanyMembership(companyMembership.id);
    assert.equal(suspended.id, companyMembership.id);
    assert.equal(suspended.status, "SUSPENDED");
    assert.equal(await scopedAccess.hasCompanyAccess(userA, companyA), false);
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipA,
        companyId: companyA,
      }),
      "CURRENT_SLOT_OCCUPIED",
    );

    const restored = await scopedAccess.restoreCompanyMembership(companyMembership.id);
    assert.equal(restored.id, companyMembership.id);
    assert.equal(restored.status, "ACTIVE");
    assert.equal(await scopedAccess.hasCompanyAccess(userA, companyA), true);
  });

  await t.test("company revoke/end preserve terminal episodes and allow a new episode", async () => {
    const revoked = await scopedAccess.revokeCompanyMembership(companyMembership.id);
    assert.equal(revoked.id, companyMembership.id);
    assert.equal(revoked.status, "REVOKED");
    assert.equal((await readAssignment("company_membership", companyMembership.id)).status, "REVOKED");
    await assertDomainError(
      scopedAccess.restoreCompanyMembership(companyMembership.id),
      "TRANSITION_NOT_ALLOWED",
    );

    const replacement = await scopedAccess.grantCompanyMembership({
      userId: userA,
      organizationMembershipId: membershipA,
      companyId: companyA,
    });
    assert.notEqual(replacement.id, companyMembership.id);
    assert.equal((await readAssignment("company_membership", companyMembership.id)).status, "REVOKED");

    const ended = await scopedAccess.grantCompanyMembership({
      userId: userA,
      organizationMembershipId: membershipA,
      companyId: companyA2,
    });
    const endedRecord = await scopedAccess.endCompanyMembership(ended.id);
    assert.equal(endedRecord.id, ended.id);
    assert.equal(endedRecord.status, "ENDED");
    const endedReplacement = await scopedAccess.grantCompanyMembership({
      userId: userA,
      organizationMembershipId: membershipA,
      companyId: companyA2,
    });
    assert.notEqual(endedReplacement.id, ended.id);
    assert.equal((await readAssignment("company_membership", ended.id)).status, "ENDED");
    companyMembership = replacement;
  });

  await t.test("plant grants derive company scope and validate the parent chain", async () => {
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: randomUUID(),
      }),
      "PLANT_NOT_FOUND",
    );
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userB,
        companyMembershipId: companyMembership.id,
        plantId: plantA,
      }),
      "PARENT_MISMATCH",
    );
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: plantB,
      }),
      "PARENT_MISMATCH",
    );

    const assignment = await scopedAccess.grantPlantAssignment({
      userId: userA,
      companyMembershipId: companyMembership.id,
      plantId: plantA,
    });
    assert.equal(assignment.status, "ACTIVE");
    assert.equal(assignment.organizationId, companyMembership.organizationId);
    assert.equal(assignment.companyId, companyMembership.companyId);
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), true);
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: plantA,
      }),
      "CURRENT_SLOT_OCCUPIED",
    );
  });

  await t.test("plant suspend/restore/revoke/end preserve IDs and release only terminal slots", async () => {
    const assignmentRows = await pool.query(
      `SELECT "id" FROM "core"."plant_assignment"
       WHERE "userId" = $1 AND "plantId" = $2 AND "status" = 'ACTIVE'`,
      [userA, plantA],
    );
    const assignmentId = assignmentRows.rows[0].id;
    const suspended = await scopedAccess.suspendPlantAssignment(assignmentId);
    assert.equal(suspended.id, assignmentId);
    assert.equal(suspended.status, "SUSPENDED");
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), false);
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: plantA,
      }),
      "CURRENT_SLOT_OCCUPIED",
    );
    const restored = await scopedAccess.restorePlantAssignment(assignmentId);
    assert.equal(restored.id, assignmentId);
    assert.equal(restored.status, "ACTIVE");
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), true);

    const revoked = await scopedAccess.revokePlantAssignment(assignmentId);
    assert.equal(revoked.id, assignmentId);
    assert.equal(revoked.status, "REVOKED");
    const replacement = await scopedAccess.grantPlantAssignment({
      userId: userA,
      companyMembershipId: companyMembership.id,
      plantId: plantA,
    });
    assert.notEqual(replacement.id, assignmentId);
    assert.equal((await readAssignment("plant_assignment", assignmentId)).status, "REVOKED");

    const ended = await scopedAccess.grantPlantAssignment({
      userId: userA,
      companyMembershipId: companyMembership.id,
      plantId: plantA2,
    });
    const endedRecord = await scopedAccess.endPlantAssignment(ended.id);
    assert.equal(endedRecord.id, ended.id);
    assert.equal(endedRecord.status, "ENDED");
    const endedReplacement = await scopedAccess.grantPlantAssignment({
      userId: userA,
      companyMembershipId: companyMembership.id,
      plantId: plantA2,
    });
    assert.notEqual(endedReplacement.id, ended.id);
    assert.equal((await readAssignment("plant_assignment", ended.id)).status, "ENDED");
  });

  await t.test("effective access requires active assignments and active parents", async () => {
    const activePlantRows = await pool.query(
      `SELECT "id" FROM "core"."plant_assignment"
       WHERE "userId" = $1 AND "plantId" = $2 AND "status" = 'ACTIVE'`,
      [userA, plantA],
    );
    const activePlantAssignmentId = activePlantRows.rows[0].id;

    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'SUSPENDED', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipA],
    );
    assert.equal(await scopedAccess.hasCompanyAccess(userA, companyA), false);
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), false);
    await assertDomainError(
      scopedAccess.grantCompanyMembership({
        userId: userA,
        organizationMembershipId: membershipA,
        companyId: companyA,
      }),
      "PARENT_NOT_ACTIVE",
    );
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: plantA2,
      }),
      "PARENT_NOT_ACTIVE",
    );
    await pool.query(
      `UPDATE "core"."organization_membership"
       SET "status" = 'ACTIVE', "updated_at" = NOW()
       WHERE "id" = $1`,
      [membershipA],
    );

    const suspendedParent = await scopedAccess.suspendCompanyMembership(companyMembership.id);
    assert.equal(suspendedParent.status, "SUSPENDED");
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), false);
    await assertDomainError(
      scopedAccess.grantPlantAssignment({
        userId: userA,
        companyMembershipId: companyMembership.id,
        plantId: plantA2,
      }),
      "COMPANY_MEMBERSHIP_NOT_ACTIVE",
    );
    const suspendedChild = await scopedAccess.suspendPlantAssignment(activePlantAssignmentId);
    assert.equal(suspendedChild.status, "SUSPENDED");
    await assertDomainError(
      scopedAccess.restorePlantAssignment(activePlantAssignmentId),
      "COMPANY_MEMBERSHIP_NOT_ACTIVE",
    );
    await scopedAccess.restoreCompanyMembership(companyMembership.id);
    const restoredChild = await scopedAccess.restorePlantAssignment(activePlantAssignmentId);
    assert.equal(restoredChild.status, "ACTIVE");
    assert.equal(await scopedAccess.hasPlantAccess(userA, plantA), true);
  });

  await t.test("restore requires active parents and concurrent grants rely on unique indexes", async () => {
    const [grantA, grantB] = await Promise.allSettled([
      scopedAccess.grantCompanyMembership({
        userId: userC,
        organizationMembershipId: membershipC,
        companyId: companyA,
      }),
      scopedAccess.grantCompanyMembership({
        userId: userC,
        organizationMembershipId: membershipC,
        companyId: companyA,
      }),
    ]);
    const companySuccesses = [grantA, grantB].filter((result) => result.status === "fulfilled");
    const companyFailures = [grantA, grantB].filter((result) => result.status === "rejected");
    assert.equal(companySuccesses.length, 1);
    assert.equal(companyFailures.length, 1);
    assert.ok(companyFailures[0].reason instanceof ScopedAccessError);
    assert.equal(companyFailures[0].reason.code, "CURRENT_SLOT_OCCUPIED");
    concurrentCompanyMembership = companySuccesses[0].value;

    const [plantGrantA, plantGrantB] = await Promise.allSettled([
      scopedAccess.grantPlantAssignment({
        userId: userC,
        companyMembershipId: concurrentCompanyMembership.id,
        plantId: plantA,
      }),
      scopedAccess.grantPlantAssignment({
        userId: userC,
        companyMembershipId: concurrentCompanyMembership.id,
        plantId: plantA,
      }),
    ]);
    const plantSuccesses = [plantGrantA, plantGrantB].filter((result) => result.status === "fulfilled");
    const plantFailures = [plantGrantA, plantGrantB].filter((result) => result.status === "rejected");
    assert.equal(plantSuccesses.length, 1);
    assert.equal(plantFailures.length, 1);
    assert.ok(plantFailures[0].reason instanceof ScopedAccessError);
    assert.equal(plantFailures[0].reason.code, "CURRENT_SLOT_OCCUPIED");

    const { rows: userCPlantAssignments } = await pool.query(
      `SELECT "id" FROM "core"."plant_assignment"
       WHERE "userId" = $1 AND "plantId" = $2 AND "status" = 'ACTIVE'`,
      [userC, plantA],
    );
    const userCPlantAssignmentId = userCPlantAssignments[0].id;
    await scopedAccess.suspendPlantAssignment(userCPlantAssignmentId);
    await scopedAccess.suspendCompanyMembership(concurrentCompanyMembership.id);
    await assertDomainError(
      scopedAccess.restorePlantAssignment(userCPlantAssignmentId),
      "COMPANY_MEMBERSHIP_NOT_ACTIVE",
    );
    assert.equal(await scopedAccess.hasPlantAccess(userC, plantA), false);
  });

  await t.test("concurrent status transitions release Company and Plant slots atomically", async () => {
    assert.ok(concurrentCompanyMembership, "the prior D6 concurrency test must create its CompanyMembership");
    const companyOld = await pool.query(
      `SELECT "id" FROM "core"."company_membership"
       WHERE "id" = $1`,
      [concurrentCompanyMembership.id],
    );
    assert.equal(companyOld.rows.length, 1);
    const [userC] = fixture.users.slice(2);
    const [companyA] = fixture.companies;
    const [plantA] = fixture.plants;
    const [membershipC] = fixture.organizationMemberships;
  
    const first = await pool.connect();
    const second = await pool.connect();
    const applicationName = `d6-company-transition-${randomUUID()}`;
    let firstOpen = false;
    let secondOpen = false;
    let insertCompany;
  
    try {
      await first.query("BEGIN");
      firstOpen = true;
      await first.query(
        `UPDATE "core"."company_membership"
         SET "status" = 'REVOKED', "updated_at" = NOW()
         WHERE "id" = $1`,
        [concurrentCompanyMembership.id],
      );
  
      await second.query("BEGIN");
      secondOpen = true;
      await second.query("SELECT set_config('application_name', $1, false)", [applicationName]);
      const replacementCompanyId = randomUUID();
      insertCompany = second.query(
        `INSERT INTO "core"."company_membership"
           ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, (SELECT "organizationId" FROM "core"."company" WHERE "id" = $4), $4, 'ACTIVE', NOW(), NOW())`,
        [replacementCompanyId, userC, membershipC, companyA],
      );
      await waitForLockWait(applicationName);
      await first.query("COMMIT");
      firstOpen = false;
      await insertCompany;
      await second.query("COMMIT");
      secondOpen = false;
  
      const { rows } = await pool.query(
        `SELECT "id", "status"::text AS "status" FROM "core"."company_membership"
         WHERE "userId" = $1 AND "companyId" = $2
         AND "id" = ANY($3::uuid[]) ORDER BY "id"`,
        [userC, companyA, [concurrentCompanyMembership.id, replacementCompanyId]],
      );
      assert.deepEqual(
        Object.fromEntries(rows.map((row) => [row.id, row.status])),
        { [concurrentCompanyMembership.id]: "REVOKED", [replacementCompanyId]: "ACTIVE" },
      );
  
      const activeCompanyId = replacementCompanyId;
      const activePlantRows = await pool.query(
        `SELECT "id" FROM "core"."plant_assignment"
         WHERE "userId" = $1 AND "plantId" = $2 AND "status" = 'SUSPENDED'`,
        [userC, plantA],
      );
      assert.equal(activePlantRows.rows.length, 1);
      const oldPlantId = activePlantRows.rows[0].id;
  
      const plantFirst = await pool.connect();
      const plantSecond = await pool.connect();
      const plantApplicationName = `d6-plant-transition-${randomUUID()}`;
      let plantFirstOpen = false;
      let plantSecondOpen = false;
      let insertPlant;
      try {
        await plantFirst.query("BEGIN");
        plantFirstOpen = true;
        await plantFirst.query(
          `UPDATE "core"."plant_assignment"
           SET "status" = 'ENDED', "updated_at" = NOW()
           WHERE "id" = $1`,
          [oldPlantId],
        );
  
        await plantSecond.query("BEGIN");
        plantSecondOpen = true;
        await plantSecond.query("SELECT set_config('application_name', $1, false)", [plantApplicationName]);
        const replacementPlantId = randomUUID();
        insertPlant = plantSecond.query(
          `INSERT INTO "core"."plant_assignment"
             ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "created_at", "updated_at")
           SELECT $1, $2, $3, "organizationId", "companyId", $4, 'ACTIVE', NOW(), NOW()
           FROM "core"."company_membership" WHERE "id" = $3`,
          [replacementPlantId, userC, activeCompanyId, plantA],
        );
        await waitForLockWait(plantApplicationName);
        await plantFirst.query("COMMIT");
        plantFirstOpen = false;
        await insertPlant;
        await plantSecond.query("COMMIT");
        plantSecondOpen = false;
  
        const { rows: plantRows } = await pool.query(
          `SELECT "id", "status"::text AS "status" FROM "core"."plant_assignment"
           WHERE "userId" = $1 AND "plantId" = $2 AND "id" = ANY($3::uuid[])`,
          [userC, plantA, [oldPlantId, replacementPlantId]],
        );
        assert.deepEqual(
          Object.fromEntries(plantRows.map((row) => [row.id, row.status])),
          { [oldPlantId]: "ENDED", [replacementPlantId]: "ACTIVE" },
        );
      } finally {
        if (plantFirstOpen) await plantFirst.query("ROLLBACK");
        if (plantSecondOpen) await plantSecond.query("ROLLBACK");
        plantFirst.release();
        plantSecond.release();
      }
    } finally {
      if (firstOpen) await first.query("ROLLBACK");
      if (secondOpen) await second.query("ROLLBACK");
      first.release();
      second.release();
    }
  });
});
