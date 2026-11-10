import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import {
  createRoleAssignmentService,
  RoleAssignmentError,
} from "../src/lib/role-assignment-service.ts";
import { createRoleAssignmentAuthorization } from "../src/lib/role-assignment-authorization-core.ts";

const { Client, Pool } = pg;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;

if (!migrationUrl || !runtimeUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}
if (process.env.V04_APP_ADVERSARIAL_ALLOW_DISPOSABLE_DB !== "1") {
  throw new Error("V04 application adversarial tests require explicit disposable DB approval.");
}

function assertDisposableUrl(value, expectedUser) {
  const parsed = new URL(value);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
    parsed.port !== "55438" ||
    decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_v04_app_test" ||
    decodeURIComponent(parsed.username) !== expectedUser
  ) {
    throw new Error(`V04 application tests require localhost:55438/sap_core_v04_app_test as ${expectedUser}.`);
  }
}
assertDisposableUrl(migrationUrl, "sap_core");
assertDisposableUrl(runtimeUrl, "sap_core_runtime");

const owner = new Client({ connectionString: migrationUrl });
const runtimePool = new Pool({ connectionString: runtimeUrl, max: 4 });
const ids = {
  actorA: randomUUID(),
  recipientA: randomUUID(),
  actorB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  membershipA: randomUUID(),
  recipientMembershipA: randomUUID(),
  membershipB: randomUUID(),
};
let ownerConnected = false;
let fixturesCreated = false;

function createSession(client) {
  return {
    async query(statement, values = []) {
      const result = await client.query(statement, values);
      return result.rows;
    },
  };
}

const database = {
  ...createSession(runtimePool),
  async transaction(work) {
    const client = await runtimePool.connect();
    let open = false;
    try {
      await client.query("BEGIN");
      open = true;
      const result = await work(createSession(client));
      await client.query("COMMIT");
      open = false;
      return result;
    } catch (error) {
      if (open) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

function createService(actorUserId, organizationId) {
  return createRoleAssignmentService(
    database,
    createRoleAssignmentAuthorization(actorUserId, organizationId),
    { enforceRoleDefinitionGovernance: true },
  );
}

async function expectAuthorizationDenied(operation) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RoleAssignmentError);
    assert.equal(error.code, "AUTHORIZATION_DENIED");
    return true;
  });
}

before(async () => {
  await owner.connect();
  ownerConnected = true;

  await owner.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sap_core_runtime') THEN
        CREATE ROLE sap_core_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
      END IF;
    END
    $$;
  `);
  await owner.query('GRANT USAGE ON SCHEMA "core" TO sap_core_runtime');
  await owner.query('GRANT SELECT ON "core"."user" TO sap_core_runtime');
  await owner.query(`
    GRANT SELECT, INSERT, UPDATE ON
      "core"."organization",
      "core"."organization_membership",
      "core"."organization_role_assignment",
      "core"."role_definition",
      "core"."role_permission_grant"
    TO sap_core_runtime
  `);
  await owner.query('GRANT SELECT ON "core"."permission_definition" TO sap_core_runtime');

  const { rows: roleState } = await owner.query(`
    SELECT rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = 'sap_core_runtime'
  `);
  assert.equal(roleState.length, 1);
  assert.equal(roleState[0].rolsuper, false);
  assert.equal(roleState[0].rolbypassrls, false);

  const { rows: roles } = await owner.query(`
    SELECT id::text AS id, code
    FROM "core"."role_definition"
    WHERE kind = 'SYSTEM'::"core"."RoleDefinitionKind"
      AND code IN ('ORG_OWNER', 'ORG_MEMBER')
      AND disabled_at IS NULL
      AND permissions_locked_at IS NOT NULL
  `);
  const roleIds = Object.fromEntries(roles.map((row) => [row.code, row.id]));
  assert.ok(roleIds.ORG_OWNER, "ORG_OWNER system role must exist and be sealed");
  assert.ok(roleIds.ORG_MEMBER, "ORG_MEMBER system role must exist and be sealed");

  await owner.query(`
    INSERT INTO "core"."user"
      ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    VALUES
      ($1, 'V04 adversarial actor A', $4, false, NOW(), NOW()),
      ($2, 'V04 adversarial recipient A', $5, false, NOW(), NOW()),
      ($3, 'V04 adversarial actor B', $6, false, NOW(), NOW())
  `, [
    ids.actorA, ids.recipientA, ids.actorB,
    `v04-app-${ids.actorA}@example.test`,
    `v04-app-${ids.recipientA}@example.test`,
    `v04-app-${ids.actorB}@example.test`,
  ]);
  await owner.query(
    'INSERT INTO "core"."organization" ("id", "updated_at") VALUES ($1, NOW()), ($2, NOW())',
    [ids.orgA, ids.orgB],
  );
  await owner.query(`
    INSERT INTO "core"."organization_membership"
      ("id", "userId", "organizationId", "status", "updated_at")
    VALUES
      ($1, $2, $3, 'ACTIVE', NOW()),
      ($4, $5, $3, 'ACTIVE', NOW()),
      ($6, $7, $8, 'ACTIVE', NOW())
  `, [
    ids.membershipA, ids.actorA, ids.orgA,
    ids.recipientMembershipA, ids.recipientA,
    ids.membershipB, ids.actorB, ids.orgB,
  ]);
  await owner.query(`
    INSERT INTO "core"."organization_role_assignment"
      ("id", "organizationMembershipId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
    VALUES ($1, $2, $3, 'ORGANIZATION', $4, false)
  `, [randomUUID(), ids.membershipA, roleIds.ORG_OWNER, ids.actorA]);

  fixturesCreated = true;
});

after(async () => {
  try {
    await runtimePool.end();
    if (ownerConnected && fixturesCreated) {
      await owner.query('DELETE FROM "core"."organization_role_assignment" WHERE "organizationMembershipId" = ANY($1::uuid[])', [
        [ids.membershipA, ids.recipientMembershipA, ids.membershipB],
      ]);
      await owner.query('DELETE FROM "core"."organization_membership" WHERE "id" = ANY($1::uuid[])', [
        [ids.membershipA, ids.recipientMembershipA, ids.membershipB],
      ]);
      await owner.query('DELETE FROM "core"."organization" WHERE "id" = ANY($1::uuid[])', [[ids.orgA, ids.orgB]]);
      await owner.query('DELETE FROM "core"."user" WHERE "id" = ANY($1::text[])', [[ids.actorA, ids.recipientA, ids.actorB]]);
    }
  } finally {
    if (ownerConnected) await owner.end();
  }
});

test("production role-assignment service enforces verified actor and tenant boundaries on non-owner RLS role", async (t) => {
  const actorAService = createService(ids.actorA, ids.orgA);
  const actorBService = createService(ids.actorB, ids.orgB);

  await t.test("authorized Organization owner grants a role to an active same-tenant member", async () => {
    const assignment = await actorAService.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: "10000000-0000-4000-8000-000000000003",
      actorUserId: ids.actorA,
    });
    assert.equal(assignment.scope, "ORGANIZATION");
    assert.equal(assignment.parentId, ids.recipientMembershipA);
    assert.equal(assignment.roleDefinitionId, "10000000-0000-4000-8000-000000000003");
    assert.equal(assignment.grantActorUserId, ids.actorA);
    assert.equal(assignment.isBreakGlass, false);
  });

  await t.test("authorized actor can list the target member's effective assignment", async () => {
    const rows = await actorAService.listEffectiveRoleAssignments({
      actorUserId: ids.actorA,
      userId: ids.recipientA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].roleDefinitionId, "10000000-0000-4000-8000-000000000003");
  });

  await t.test("actor from another Organization cannot grant into Organization A", async () => {
    const foreignService = createService(ids.actorB, ids.orgA);
    await expectAuthorizationDenied(() => foreignService.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: "10000000-0000-4000-8000-000000000003",
      actorUserId: ids.actorB,
    }));
  });

  await t.test("actor from another Organization cannot list Organization A assignments", async () => {
    const foreignService = createService(ids.actorB, ids.orgA);
    await expectAuthorizationDenied(() => foreignService.listEffectiveRoleAssignments({
      actorUserId: ids.actorB,
      userId: ids.recipientA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
    }));
  });

  await t.test("caller cannot spoof the verified actor ID", async () => {
    await assert.rejects(
      () => actorAService.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: ids.recipientMembershipA,
        roleDefinitionId: "10000000-0000-4000-8000-000000000003",
        actorUserId: ids.actorB,
      }),
      (error) => error instanceof Error && /does not match the verified Better Auth session/.test(error.message),
    );
  });

  await t.test("denied operations leave no extra assignment rows", async () => {
    const client = await owner.connect();
    try {
      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM "core"."organization_role_assignment" WHERE "organizationMembershipId" = $1',
        [ids.recipientMembershipA],
      );
      assert.equal(rows[0].count, 1);
    } finally {
      client.release();
    }
  });
});
