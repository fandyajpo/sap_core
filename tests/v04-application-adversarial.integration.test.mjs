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
let memberRoleDefinitionId;

function createSession(client) {
  return {
    async query(statement, values = []) {
      const result = await client.query(statement, values);
      if (statement.includes('"core"."role_definition"') || statement.includes('"core"."organization_membership"') || statement.includes('"core"."role_permission_grant"')) {
        console.log("V04_AUTH_QUERY", statement.replace(/\\s+/g, " ").slice(0, 220), "ROWS", JSON.stringify(result.rows));
      }
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
  await owner.query(`
    GRANT SELECT ON
      "core"."company_role_assignment",
      "core"."plant_role_assignment",
      "core"."company_membership",
      "core"."plant_assignment"
    TO sap_core_runtime
  `);

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
  memberRoleDefinitionId = roleIds.ORG_MEMBER;

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

  const diagnosticClient = await runtimePool.connect();
  try {
    await diagnosticClient.query("BEGIN");
    await diagnosticClient.query("SELECT set_config('app.user_id', $1, true)", [ids.actorA]);
    const actorMembership = await diagnosticClient.query(
      'SELECT "id" FROM "core"."organization_membership" WHERE "userId" = $1 AND "organizationId" = $2 AND "status" = \'ACTIVE\'',
      [ids.actorA, ids.orgA],
    );
    assert.equal(actorMembership.rowCount, 1, "runtime RLS must expose the actor's own active membership");
    await diagnosticClient.query("SELECT set_config('app.organization_id', $1, true)", [ids.orgA]);
    const targetMembership = await diagnosticClient.query(
      'SELECT "id", "userId", "organizationId"::text AS "organizationId", "status"::text AS "status" FROM "core"."organization_membership" WHERE "id" = $1 AND "organizationId" = $2::uuid AND "status" = \'ACTIVE\'::"core"."OrganizationMembershipStatus"',
      [ids.recipientMembershipA, ids.orgA],
    );
    assert.equal(targetMembership.rowCount, 1, "runtime RLS must expose active target membership after organization context is installed");
    const ownerAssignment = await diagnosticClient.query(
      'SELECT ra."id" FROM "core"."organization_role_assignment" ra JOIN "core"."organization_membership" om ON om."id" = ra."organizationMembershipId" WHERE om."userId" = $1 AND om."organizationId" = $2',
      [ids.actorA, ids.orgA],
    );
    assert.equal(ownerAssignment.rowCount, 1, "runtime RLS must expose the actor's Organization role assignment");
    const ownerPermissions = await diagnosticClient.query(
      'SELECT pd."code" FROM "core"."role_permission_grant" g JOIN "core"."role_definition" rd ON rd."id" = g."role_definition_id" JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id" WHERE rd."code" = \'ORG_OWNER\' AND pd."code" = \'roles.assign\' AND g."effect" = \'ALLOW\'',
    );
    assert.equal(ownerPermissions.rowCount, 1, "runtime RLS must expose the sealed ORG_OWNER roles.assign permission");

    const effectiveActorGrants = await diagnosticClient.query(`
      SELECT ra."id"::text AS "assignmentId", rd."code" AS "roleCode",
        rd."kind"::text AS "roleKind", rd."scope"::text AS "roleScope",
        om."organizationId"::text AS "scopeId",
        rd."ownerOrganizationId"::text AS "ownerOrganizationId",
        pd."code" AS "permissionCode", g."effect"::text AS "effect"
      FROM "core"."organization_role_assignment" ra
      JOIN "core"."organization_membership" om
        ON om."id" = ra."organizationMembershipId"
       AND om."userId" = $1 AND om."organizationId" = $2::uuid
       AND om."status" = 'ACTIVE'::"core"."OrganizationMembershipStatus"
      JOIN "core"."role_definition" rd
        ON rd."id" = ra."roleDefinitionId" AND rd."scope" = ra."role_scope"
       AND rd."scope" = 'ORGANIZATION'::"core"."RoleScope"
       AND rd."disabled_at" IS NULL AND rd."permissions_locked_at" IS NOT NULL
       AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
      JOIN "core"."role_permission_grant" g ON g."role_definition_id" = rd."id"
      JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
      WHERE ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE
    `, [ids.actorA, ids.orgA]);
    console.log("V04_MANUAL_EFFECTIVE_GRANTS", JSON.stringify(effectiveActorGrants.rows));
    assert.ok(
      effectiveActorGrants.rows.some((row) => row.roleCode === "ORG_OWNER" && row.permissionCode === "roles.assign" && row.effect === "ALLOW"),
      `runtime effective-grant query must return ORG_OWNER roles.assign; got ${JSON.stringify(effectiveActorGrants.rows)}`,
    );
    await diagnosticClient.query("ROLLBACK");
  } finally {
    diagnosticClient.release();
  }

});

after(async () => {
  await runtimePool.end();
  if (ownerConnected) await owner.end();
});

test("production role-assignment service enforces verified actor and tenant boundaries on non-owner RLS role", async (t) => {
  const actorAService = createService(ids.actorA, ids.orgA);
  const actorBService = createService(ids.actorB, ids.orgB);

  await t.test("authorized Organization owner grants a role to an active same-tenant member", async () => {
    const assignment = await actorAService.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: memberRoleDefinitionId,
      actorUserId: ids.actorA,
    });
    assert.equal(assignment.scope, "ORGANIZATION");
    assert.equal(assignment.parentId, ids.recipientMembershipA);
    assert.equal(assignment.roleDefinitionId, memberRoleDefinitionId);
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
    assert.equal(rows[0].roleDefinitionId, memberRoleDefinitionId);
  });

  await t.test("actor from another Organization cannot grant into Organization A", async () => {
    const foreignService = createService(ids.actorB, ids.orgA);
    await expectAuthorizationDenied(() => foreignService.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: memberRoleDefinitionId,
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
        roleDefinitionId: memberRoleDefinitionId,
        actorUserId: ids.actorB,
      }),
      (error) => error instanceof Error && /does not match the verified Better Auth session/.test(error.message),
    );
  });

  await t.test("denied operations leave no extra assignment rows", async () => {
    const { rows } = await owner.query(
      'SELECT COUNT(*)::int AS count FROM "core"."organization_role_assignment" WHERE "organizationMembershipId" = $1',
      [ids.recipientMembershipA],
    );
    assert.equal(rows[0].count, 1);
  });
});
