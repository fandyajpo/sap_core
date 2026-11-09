import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const parsed = databaseUrl ? new URL(databaseUrl) : null;
if (
  process.env.V04_DENY_ALLOW_DISPOSABLE_DB !== "1" ||
  !parsed ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
  parsed.port !== "55438" ||
  decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_v04_deny_test"
) {
  throw new Error("DENY integration tests require explicit approval and localhost:55438/sap_core_v04_deny_test.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const ids = {
  actor: `deny-owner-${randomUUID()}`,
  target: `deny-target-${randomUUID()}`,
  organization: randomUUID(),
  membership: randomUUID(),
  company: randomUUID(),
  plant: randomUUID(),
  policy: randomUUID(),
};

let permissionIds;

async function insertPolicy(client, {
  id = randomUUID(),
  scope = "COMPANY",
  companyId = ids.company,
  plantId = null,
  permissionCode = "company.manage",
  membershipId = ids.membership,
  userId = ids.target,
  organizationId = ids.organization,
} = {}) {
  const permissionId = permissionIds[permissionCode];
  return client.query(
    `INSERT INTO "core"."tenant_deny_policy"
       ("id","organization_id","target_membership_id","target_user_id",
        "permission_definition_id","scope","company_id","plant_id",
        "reason","issued_by_user_id","issued_at")
     VALUES ($1,$2,$3,$4,$5,$6::"core"."RoleScope",$7,$8,'integration test',$9,clock_timestamp())`,
    [id, organizationId, membershipId, userId, permissionId, scope, companyId, plantId, ids.actor],
  );
}

before(async () => {
  await pool.query("SELECT 1");
  await pool.query(
    `INSERT INTO "core"."user" ("id","name","email","emailVerified","createdAt","updatedAt")
     VALUES ($1,'DENY integration owner',$2,false,NOW(),NOW()),
            ($3,'DENY integration target',$4,false,NOW(),NOW())`,
    [ids.actor, `${ids.actor}@example.test`, ids.target, `${ids.target}@example.test`],
  );
  await pool.query(
    'INSERT INTO "core"."organization" ("id","updated_at") VALUES ($1,NOW())',
    [ids.organization],
  );
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id","userId","organizationId","status","updated_at")
     VALUES ($1,$2,$3,'ACTIVE',NOW())`,
    [ids.membership, ids.target, ids.organization],
  );
  await pool.query(
    `INSERT INTO "core"."company" ("id","organizationId","updated_at")
     VALUES ($1,$2,NOW())`,
    [ids.company, ids.organization],
  );
  await pool.query(
    `INSERT INTO "core"."plant" ("id","organizationId","companyId","updated_at")
     VALUES ($1,$2,$3,NOW())`,
    [ids.plant, ids.organization, ids.company],
  );
  const { rows } = await pool.query(
    'SELECT "code","id"::text AS "id" FROM "core"."permission_definition" WHERE "code" = ANY($1::text[])',
    [["company.manage","plant.manage","organization.read","audit.read"]],
  );
  permissionIds = Object.fromEntries(rows.map(row => [row.code, row.id]));
  assert.ok(permissionIds["company.manage"]);
  assert.ok(permissionIds["plant.manage"]);
  assert.ok(permissionIds["organization.read"]);
  assert.ok(permissionIds["audit.read"]);
});

after(async () => {
  await pool.end();
});

test("database rejects non-allowlisted permissions and incompatible exact scopes", async () => {
  await assert.rejects(
    insertPolicy(pool, { permissionCode: "audit.read", scope: "ORGANIZATION", companyId: null }),
    error => error.code === "23514",
  );
  await assert.rejects(
    insertPolicy(pool, { permissionCode: "company.manage", scope: "ORGANIZATION", companyId: null }),
    error => error.code === "23514",
  );
  await assert.rejects(
    insertPolicy(pool, { permissionCode: "organization.read", scope: "COMPANY" }),
    error => error.code === "23514",
  );
});

test("database rejects mismatched membership identity and invalid Company/Plant ancestry", async () => {
  await assert.rejects(
    insertPolicy(pool, { userId: ids.actor }),
    error => error.code === "23503",
  );
  await assert.rejects(
    insertPolicy(pool, { scope: "PLANT", plantId: randomUUID() }),
    error => error.code === "23503",
  );
});

test("DENY audit events are append-only and policy permits only one attributable revocation", async () => {
  const policyId = randomUUID();
  await insertPolicy(pool, { id: policyId });
  await pool.query(
    `INSERT INTO "core"."tenant_deny_audit_event"
       ("id","policy_id","organization_id","target_membership_id","target_user_id",
        "permission_definition_id","scope","company_id","actor_user_id",
        "event_type","outcome","reason_code")
     VALUES ($1,$2,$3,$4,$5,$6,'COMPANY',$7,$8,
        'POLICY_CREATED','SUCCESS','INTEGRATION_TEST')`,
    [randomUUID(), policyId, ids.organization, ids.membership, ids.target,
     permissionIds["company.manage"], ids.company, ids.actor],
  );

  await assert.rejects(
    pool.query('UPDATE "core"."tenant_deny_audit_event" SET "reason_code" = \'tampered\' WHERE "policy_id" = $1', [policyId]),
    error => error.code === "55000",
  );
  await assert.rejects(
    pool.query('DELETE FROM "core"."tenant_deny_audit_event" WHERE "policy_id" = $1', [policyId]),
    error => error.code === "55000",
  );
  await assert.rejects(
    pool.query('UPDATE "core"."tenant_deny_policy" SET "reason" = \'tampered\' WHERE "id" = $1', [policyId]),
    error => error.code === "55000",
  );
  await assert.rejects(
    pool.query('DELETE FROM "core"."tenant_deny_policy" WHERE "id" = $1', [policyId]),
    error => error.code === "55000",
  );

  await pool.query(
    `UPDATE "core"."tenant_deny_policy"
        SET "revoked_at" = clock_timestamp(),
            "revoked_by_user_id" = $2,
            "revoke_reason" = 'integration revoke'
      WHERE "id" = $1`,
    [policyId, ids.actor],
  );
  await assert.rejects(
    pool.query(
      `UPDATE "core"."tenant_deny_policy"
          SET "revoked_at" = clock_timestamp(),
              "revoked_by_user_id" = $2,
              "revoke_reason" = 'second revoke'
        WHERE "id" = $1`,
      [policyId, ids.actor],
    ),
    error => error.code === "55000",
  );
});

test("concurrent creates serialize on the exact target membership before duplicate detection", async () => {
  const first = await pool.connect();
  const second = await pool.connect();
  const policyId = randomUUID();
  let firstOpen = false;
  let secondOpen = false;
  try {
    await first.query("BEGIN");
    firstOpen = true;
    await first.query(
      'SELECT "id" FROM "core"."organization_membership" WHERE "id" = $1 FOR UPDATE',
      [ids.membership],
    );

    const secondPid = (await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await second.query("BEGIN");
    secondOpen = true;
    const lockPromise = second.query(
      'SELECT "id" FROM "core"."organization_membership" WHERE "id" = $1 FOR UPDATE',
      [ids.membership],
    );

    let waiting = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const { rows: activity } = await pool.query(
        'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
        [secondPid],
      );
      if (activity[0]?.wait_event_type === "Lock") {
        waiting = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    // Release only after PostgreSQL confirms that the second create is blocked.
    assert.equal(waiting, true, "second create must wait for the target membership lock");

    await insertPolicy(first, { id: policyId });
    await first.query("COMMIT");
    firstOpen = false;
    await lockPromise;

    const { rows: duplicates } = await second.query(
      `SELECT "id" FROM "core"."tenant_deny_policy"
        WHERE "organization_id" = $1
          AND "target_membership_id" = $2
          AND "permission_definition_id" = $3
          AND "scope" = 'COMPANY'::"core"."RoleScope"
          AND "company_id" = $4 AND "plant_id" IS NULL
          AND "revoked_at" IS NULL
          AND ("expires_at" IS NULL OR "expires_at" > clock_timestamp())`,
      [ids.organization, ids.membership, permissionIds["company.manage"], ids.company],
    );
    assert.equal(duplicates.length, 1, "second create must observe the first committed active policy");
    await second.query("COMMIT");
    secondOpen = false;
  } finally {
    if (firstOpen) await first.query("ROLLBACK").catch(() => {});
    if (secondOpen) await second.query("ROLLBACK").catch(() => {});
    first.release();
    second.release();
  }
});

test("database refuses a DENY against a membership after it becomes revoked", async () => {
  await pool.query(
    `UPDATE "core"."organization_membership"
        SET "status" = 'REVOKED'::"core"."OrganizationMembershipStatus"
      WHERE "id" = $1`,
    [ids.membership],
  );
  await assert.rejects(
    insertPolicy(pool),
    error => error.code === "23514",
  );
});
