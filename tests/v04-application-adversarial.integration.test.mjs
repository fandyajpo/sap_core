import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { assertDisposablePostgresUrl } from "./v04-integration-safety.mjs";
import { RoleAssignmentError } from "../src/lib/role-assignment-service.ts";
import { TenantTargetContextError } from "../src/lib/tenant-target-context-core.ts";
import { createTenantRoleAssignmentAdapter } from "../src/lib/tenant-role-assignment-service-core.ts";
import { createTenantRoleDefinitionAdapter } from "../src/lib/tenant-role-definition-service-core.ts";
import { RoleDefinitionError } from "../src/lib/role-definition-service.ts";
import { loadAuthorizationGrants } from "../src/lib/authorization-grant-loader.ts";
import { evaluateAuthorization } from "../src/lib/authorization-policy-core.ts";

const { Client, Pool } = pg;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;

if (!migrationUrl || !runtimeUrl) {
  throw new Error("MIGRATION_DATABASE_URL and DATABASE_URL are required.");
}
// Strict target guard: the suite runs only against the exact disposable
// database CI provisions for it (V04_APP_ADVERSARIAL_ALLOW_DISPOSABLE_DB=1,
// localhost:55438/sap_core_v04_app_test), as the owner role for migrations and
// fixtures and as the dedicated runtime role the suite itself provisions. No
// fallback target is ever used.
assertDisposablePostgresUrl({
  value: migrationUrl,
  suiteLabel: "V04 application adversarial tests",
  optInEnvName: "V04_APP_ADVERSARIAL_ALLOW_DISPOSABLE_DB",
  expectedPort: 55438,
  expectedDatabase: "sap_core_v04_app_test",
  expectedUsers: ["sap_core"],
});
assertDisposablePostgresUrl({
  value: runtimeUrl,
  suiteLabel: "V04 application adversarial tests",
  optInEnvName: "V04_APP_ADVERSARIAL_ALLOW_DISPOSABLE_DB",
  expectedPort: 55438,
  expectedDatabase: "sap_core_v04_app_test",
  expectedUsers: ["sap_core_runtime"],
});

const owner = new Client({ connectionString: migrationUrl });
const runtimePool = new Pool({ connectionString: runtimeUrl, max: 4 });
const ids = {
  actorA: randomUUID(),
  recipientA: randomUUID(),
  actorB: randomUUID(),
  actorC: randomUUID(),
  actorD: randomUUID(),
  recipientB: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  companyA: randomUUID(),
  companyB: randomUUID(),
  plantA1: randomUUID(),
  plantA2: randomUUID(),
  plantB: randomUUID(),
  membershipA: randomUUID(),
  recipientMembershipA: randomUUID(),
  membershipB: randomUUID(),
  membershipC: randomUUID(),
  membershipD: randomUUID(),
  recipientMembershipB: randomUUID(),
  companyMembershipActorC: randomUUID(),
  companyMembershipActorD: randomUUID(),
  companyMembershipRecipientA: randomUUID(),
  companyMembershipRecipientB: randomUUID(),
  plantAssignmentActorD: randomUUID(),
  plantAssignmentRecipientA: randomUUID(),
  plantAssignmentRecipientB: randomUUID(),
};
let ownerConnected = false;
let runtimeRoleCreated = false;
let memberRoleDefinitionId;
let companyMemberRoleDefinitionId;
let companyAdminRoleDefinitionId;
let plantViewerRoleDefinitionId;
let plantManagerRoleDefinitionId;

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

function createService(sessionActorId) {
  return createTenantRoleAssignmentAdapter({
    database,
    getCurrentSession: async () => ({ user: { id: sessionActorId } }),
  });
}

function createRoleDefinitionServiceForActor(sessionActorId) {
  return createTenantRoleDefinitionAdapter({
    database,
    getCurrentSession: async () => ({ user: { id: sessionActorId } }),
  });
}

async function expectRoleDefinitionDenied(operation) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RoleDefinitionError);
    assert.equal(error.code, "AUTHORIZATION_DENIED");
    return true;
  });
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

  // Adversarial guard: the suite must provision its own runtime role on a
  // fresh disposable instance. A pre-existing sap_core_runtime means the
  // database is not a fresh disposable database (the role's original state —
  // grants, options, memberships — could not be restored after the run), so
  // refuse instead of silently granting onto it, and require a fresh
  // disposable instance.
  const { rows: preExistingRuntimeRole } = await owner.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'sap_core_runtime'",
  );
  if (preExistingRuntimeRole.length > 0) {
    throw new Error(
      "sap_core_runtime already exists; V04 application adversarial tests require a fresh disposable database where the runtime role does not pre-exist.",
    );
  }
  await owner.query("CREATE ROLE sap_core_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE");
  runtimeRoleCreated = true;
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
  await owner.query('GRANT SELECT ON "core"."permission_definition", "core"."permission_delegation_policy" TO sap_core_runtime');
  await owner.query('GRANT SELECT, INSERT ON "core"."role_definition_audit" TO sap_core_runtime');
  await owner.query('GRANT SELECT, INSERT ON "core"."tenant_deny_policy" TO sap_core_runtime');
  await owner.query('GRANT UPDATE ("revoked_at", "revoked_by_user_id", "revoke_reason") ON "core"."tenant_deny_policy" TO sap_core_runtime');
  await owner.query('GRANT SELECT, INSERT ON "core"."tenant_deny_audit_event" TO sap_core_runtime');
  await owner.query(`
    GRANT SELECT, INSERT, UPDATE ON
      "core"."company_role_assignment",
      "core"."plant_role_assignment"
    TO sap_core_runtime
  `);
  await owner.query(`
    GRANT SELECT, UPDATE ON
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
      AND code IN ('ORG_OWNER', 'ORG_MEMBER', 'COMPANY_ADMIN', 'COMPANY_MEMBER', 'PLANT_MANAGER', 'PLANT_VIEWER')
      AND disabled_at IS NULL
      AND permissions_locked_at IS NOT NULL
  `);
  const roleIds = Object.fromEntries(roles.map((row) => [row.code, row.id]));
  assert.ok(roleIds.ORG_OWNER, "ORG_OWNER system role must exist and be sealed");
  assert.ok(roleIds.ORG_MEMBER, "ORG_MEMBER system role must exist and be sealed");
  assert.ok(roleIds.COMPANY_ADMIN, "COMPANY_ADMIN system role must exist and be sealed");
  assert.ok(roleIds.COMPANY_MEMBER, "COMPANY_MEMBER system role must exist and be sealed");
  assert.ok(roleIds.PLANT_MANAGER, "PLANT_MANAGER system role must exist and be sealed");
  assert.ok(roleIds.PLANT_VIEWER, "PLANT_VIEWER system role must exist and be sealed");
  memberRoleDefinitionId = roleIds.ORG_MEMBER;
  companyAdminRoleDefinitionId = roleIds.COMPANY_ADMIN;
  companyMemberRoleDefinitionId = roleIds.COMPANY_MEMBER;
  plantManagerRoleDefinitionId = roleIds.PLANT_MANAGER;
  plantViewerRoleDefinitionId = roleIds.PLANT_VIEWER;

  await owner.query(`
    INSERT INTO "core"."user"
      ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    VALUES
      ($1, 'V04 actor A', $7, false, NOW(), NOW()),
      ($2, 'V04 recipient A', $8, false, NOW(), NOW()),
      ($3, 'V04 actor B', $9, false, NOW(), NOW()),
      ($4, 'V04 actor C', $10, false, NOW(), NOW()),
      ($5, 'V04 actor D', $11, false, NOW(), NOW()),
      ($6, 'V04 recipient B', $12, false, NOW(), NOW())
  `, [
    ids.actorA, ids.recipientA, ids.actorB, ids.actorC, ids.actorD, ids.recipientB,
    `v04-app-${ids.actorA}@example.test`,
    `v04-app-${ids.recipientA}@example.test`,
    `v04-app-${ids.actorB}@example.test`,
    `v04-app-${ids.actorC}@example.test`,
    `v04-app-${ids.actorD}@example.test`,
    `v04-app-${ids.recipientB}@example.test`,
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
      ($6, $7, $8, 'ACTIVE', NOW()),
      ($9, $10, $3, 'ACTIVE', NOW()),
      ($11, $12, $3, 'ACTIVE', NOW()),
      ($13, $14, $3, 'ACTIVE', NOW())
  `, [
    ids.membershipA, ids.actorA, ids.orgA,
    ids.recipientMembershipA, ids.recipientA,
    ids.membershipB, ids.actorB, ids.orgB,
    ids.membershipC, ids.actorC,
    ids.membershipD, ids.actorD,
    ids.recipientMembershipB, ids.recipientB,
  ]);

  const { rows: denyPermissionRows } = await owner.query(
    'SELECT "id"::text AS "id" FROM "core"."permission_definition" WHERE "code" = $1',
    ["organization.read"],
  );
  assert.equal(denyPermissionRows.length, 1, "organization.read permission must exist");
  await owner.query(`
    INSERT INTO "core"."tenant_deny_policy"
      ("id", "organization_id", "target_membership_id", "target_user_id",
       "permission_definition_id", "scope", "reason", "issued_by_user_id")
    VALUES
      ($1, $2, $3, $4, $5, 'ORGANIZATION', 'RLS fixture A', $6),
      ($7, $8, $9, $10, $5, 'ORGANIZATION', 'RLS fixture B', $11)
  `, [
    randomUUID(), ids.orgA, ids.membershipA, ids.actorA, denyPermissionRows[0].id, ids.actorA,
    randomUUID(), ids.orgB, ids.membershipB, ids.actorB, ids.actorB,
  ]);
  await owner.query(`
    INSERT INTO "core"."tenant_deny_audit_event"
      ("id", "organization_id", "actor_user_id", "event_type", "outcome", "reason_code")
    VALUES
      ($1, $2, $3, 'POLICY_READ', 'SUCCESS', 'RLS_FIXTURE_A'),
      ($4, $5, $6, 'POLICY_READ', 'SUCCESS', 'RLS_FIXTURE_B')
  `, [randomUUID(), ids.orgA, ids.actorA, randomUUID(), ids.orgB, ids.actorB]);

  await owner.query(`
    INSERT INTO "core"."company" ("id", "organizationId", "updated_at")
    VALUES ($1, $3, NOW()), ($2, $3, NOW())
  `, [ids.companyA, ids.companyB, ids.orgA]);
  await owner.query(`
    INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "updated_at")
    VALUES
      ($1, $4, $5, NOW()),
      ($2, $4, $5, NOW()),
      ($3, $4, $6, NOW())
  `, [ids.plantA1, ids.plantA2, ids.plantB, ids.orgA, ids.companyA, ids.companyB]);

  await owner.query(`
    INSERT INTO "core"."company_membership"
      ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "updated_at")
    VALUES
      ($1, $2, $3, $4, $5, 'ACTIVE', NOW()),
      ($6, $7, $8, $4, $5, 'ACTIVE', NOW()),
      ($9, $10, $11, $4, $5, 'ACTIVE', NOW()),
      ($12, $13, $14, $4, $15, 'ACTIVE', NOW())
  `, [
    ids.companyMembershipActorC, ids.actorC, ids.membershipC, ids.orgA, ids.companyA,
    ids.companyMembershipActorD, ids.actorD, ids.membershipD,
    ids.companyMembershipRecipientA, ids.recipientA, ids.recipientMembershipA,
    ids.companyMembershipRecipientB, ids.recipientB, ids.recipientMembershipB, ids.companyB,
  ]);

  await owner.query(`
    INSERT INTO "core"."plant_assignment"
      ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "updated_at")
    VALUES
      ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW()),
      ($7, $8, $9, $4, $5, $10, 'ACTIVE', NOW()),
      ($11, $12, $13, $4, $14, $15, 'ACTIVE', NOW())
  `, [
    ids.plantAssignmentActorD, ids.actorD, ids.companyMembershipActorD, ids.orgA, ids.companyA, ids.plantA1,
    ids.plantAssignmentRecipientA, ids.recipientA, ids.companyMembershipRecipientA, ids.plantA2,
    ids.plantAssignmentRecipientB, ids.recipientB, ids.companyMembershipRecipientB, ids.companyB, ids.plantB,
  ]);
  await owner.query(`
    INSERT INTO "core"."organization_role_assignment"
      ("id", "organizationMembershipId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
    VALUES ($1, $2, $3, 'ORGANIZATION', $4, false)
  `, [randomUUID(), ids.membershipA, roleIds.ORG_OWNER, ids.actorA]);

  await owner.query(`
    INSERT INTO "core"."company_role_assignment"
      ("id", "companyMembershipId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
    VALUES ($1, $2, $3, 'COMPANY', $4, false)
  `, [randomUUID(), ids.companyMembershipActorC, companyAdminRoleDefinitionId, ids.actorC]);
  await owner.query(`
    INSERT INTO "core"."plant_role_assignment"
      ("id", "plantAssignmentId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
    VALUES ($1, $2, $3, 'PLANT', $4, false)
  `, [randomUUID(), ids.plantAssignmentActorD, plantManagerRoleDefinitionId, ids.actorD]);

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
  // Role-assignment history is append-only: the database trigger rejects
  // DELETE as well as UPDATE. Keep all test-generated tenant and assignment
  // fixtures inside this job-scoped disposable database; CI discards the
  // PostgreSQL service after the suite. Only remove the runtime role created
  // by this suite, after revoking its privileges. Both pools close even when
  // role cleanup fails, and every cleanup error is preserved and rethrown.
  const errors = [];
  if (ownerConnected && runtimeRoleCreated) {
    try {
      await owner.query('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "core" FROM sap_core_runtime');
      await owner.query(
        'REVOKE UPDATE ("revoked_at", "revoked_by_user_id", "revoke_reason") ON "core"."tenant_deny_policy" FROM sap_core_runtime',
      );
      await owner.query('REVOKE USAGE ON SCHEMA "core" FROM sap_core_runtime');
      await owner.query("DROP ROLE sap_core_runtime");
    } catch (error) {
      errors.push(error);
    }
  }
  const outcomes = await Promise.allSettled([runtimePool.end(), ownerConnected ? owner.end() : Promise.resolve()]);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") errors.push(outcome.reason);
  }
  if (errors.length) throw new AggregateError(errors, "V04 application adversarial teardown failed; the disposable database must be discarded.");
});

test("tenant DENY policy and audit tables enforce Organization RLS for runtime role", async () => {
  const { rows: rlsState } = await owner.query(`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core'
      AND c.relname IN ('tenant_deny_policy', 'tenant_deny_audit_event')
    ORDER BY c.relname
  `);
  assert.deepEqual(rlsState, [
    { tableName: "tenant_deny_audit_event", rlsEnabled: true },
    { tableName: "tenant_deny_policy", rlsEnabled: true },
  ]);

  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [ids.actorA]);
    await client.query(
      "SELECT set_config('app.organization_id', $1, true), set_config('app.company_id', '', true), set_config('app.plant_id', '', true)",
      [ids.orgA],
    );

    const policies = await client.query(
      'SELECT "organization_id"::text AS "organizationId" FROM "core"."tenant_deny_policy" ORDER BY "organization_id"',
    );
    assert.deepEqual(policies.rows, [{ organizationId: ids.orgA }]);

    const events = await client.query(
      'SELECT "organization_id"::text AS "organizationId" FROM "core"."tenant_deny_audit_event" ORDER BY "organization_id"',
    );
    assert.deepEqual(events.rows, [{ organizationId: ids.orgA }]);

    // The runtime role has narrowly scoped UPDATE privileges, but the
    // Organization RLS policy must hide another tenant's policy row before
    // the immutable-policy trigger or UPDATE can touch it.
    const crossTenantPolicyUpdate = await client.query(`
      UPDATE "core"."tenant_deny_policy"
         SET "revoked_at" = clock_timestamp(),
             "revoked_by_user_id" = $1,
             "revoke_reason" = 'cross-tenant attempt'
       WHERE "organization_id" = $2
       RETURNING "id"
    `, [ids.actorA, ids.orgB]);
    assert.deepEqual(crossTenantPolicyUpdate.rows, [], "runtime must not update a policy owned by another Organization");

    await assert.rejects(
      client.query(`
        INSERT INTO "core"."tenant_deny_audit_event"
          ("id", "organization_id", "actor_user_id", "event_type", "outcome", "reason_code")
        VALUES ($1, $2, $3, 'POLICY_READ', 'SUCCESS', 'CROSS_TENANT_INSERT')
      `, [randomUUID(), ids.orgB, ids.actorA]),
      /row-level security policy/,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("production authorization grant loader applies persisted DENY over the runtime role's matching ALLOW", async () => {
  const client = await runtimePool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true), set_config('app.company_id', '', true), set_config('app.plant_id', '', true)",
      [ids.actorA, ids.orgA],
    );

    // The loader is the production implementation. This small tagged-template
    // adapter forwards its parameterized SQL to the dedicated NOBYPASSRLS role.
    const tx = {
      async $queryRaw(strings, ...values) {
        let statement = strings[0];
        for (let index = 0; index < values.length; index += 1) {
          statement += `${index + 1}${strings[index + 1]}`;
        }
        const result = await client.query(statement, values);
        return result.rows;
      },
    };
    const context = {
      userId: ids.actorA,
      organizationId: ids.orgA,
      organizationMembershipId: ids.membershipA,
      scope: "ORGANIZATION",
      companyId: null,
      plantId: null,
    };

    const loaded = await loadAuthorizationGrants(tx, context);
    assert.equal(loaded.actorUserId, ids.actorA);
    assert.ok(
      loaded.grants.some((grant) =>
        grant.roleCode === "ORG_OWNER"
        && grant.scope === "ORGANIZATION"
        && grant.scopeId === ids.orgA
        && grant.customPermissions.includes("organization.read"),
      ),
      "production loader must read the actor's persisted ORG_OWNER ALLOW through runtime RLS",
    );
    assert.deepEqual(loaded.denies, [{
      scope: "ORGANIZATION",
      scopeId: ids.orgA,
      permissions: ["organization.read"],
    }], "production loader must read only the active DENY bound to the actor's exact membership and target");

    const decision = evaluateAuthorization({
      permission: "organization.read",
      target: { scope: "ORGANIZATION", organizationId: ids.orgA },
      grants: loaded.grants,
      denies: loaded.denies,
    });
    assert.deepEqual(decision, { allowed: false, reason: "EXPLICIT_DENY" });
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
  }
});

test("tenant role-definition adapter creates and revises custom roles under runtime RLS", async (t) => {
  const ownerService = createRoleDefinitionServiceForActor(ids.actorA);
  let createdRole;

  await t.test("verified Organization owner creates a delegated custom role", async () => {
    const role = await ownerService.createCustomRoleForCurrentUser({
      organizationId: ids.orgA,
      code: `v04-runtime-role-${randomUUID()}`,
      scope: "ORGANIZATION",
      permissions: ["organization.read"],
    });
    assert.equal(role.kind, "ORGANIZATION_CUSTOM");
    assert.equal(role.ownerOrganizationId, ids.orgA);
    assert.equal(role.version, 1);
    assert.ok(role.permissionsLockedAt instanceof Date);
    createdRole = role;
    const { rows } = await owner.query(
      `SELECT pd."code" FROM "core"."role_permission_grant" g
       JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
       WHERE g."role_definition_id" = $1 AND g."effect" = 'ALLOW'`,
      [role.id],
    );
    assert.deepEqual(rows, [{ code: "organization.read" }]);
    const { rows: audit } = await owner.query(
      `SELECT "event_type", "version" FROM "core"."role_definition_audit"
       WHERE "role_definition_id" = $1`,
      [role.id],
    );
    assert.deepEqual(audit, [{ event_type: "CREATE", version: 1 }]);
  });

  await t.test("verified Organization owner revises the same custom role family", async () => {
    assert.ok(createdRole, "the create subtest must establish the role family first");
    const revision = await ownerService.reviseCustomRoleForCurrentUser({
      organizationId: ids.orgA,
      roleDefinitionId: createdRole.id,
      code: `${createdRole.code}-v2`,
    });
    assert.equal(revision.kind, "ORGANIZATION_CUSTOM");
    assert.equal(revision.ownerOrganizationId, ids.orgA);
    assert.equal(revision.roleFamilyId, createdRole.roleFamilyId);
    assert.equal(revision.version, 2);
    const { rows: audit } = await owner.query(
      `SELECT "event_type", "version" FROM "core"."role_definition_audit"
       WHERE "role_family_id" = $1 ORDER BY "version"`,
      [revision.roleFamilyId],
    );
    assert.deepEqual(audit, [
      { event_type: "CREATE", version: 1 },
      { event_type: "REVISE", version: 2 },
    ]);
  });

  await t.test("foreign Organization actor cannot create a role in Organization A", async () => {
    const foreignService = createRoleDefinitionServiceForActor(ids.actorB);
    await expectRoleDefinitionDenied(() => foreignService.createCustomRoleForCurrentUser({
      organizationId: ids.orgA,
      code: `v04-runtime-denied-${randomUUID()}`,
      scope: "ORGANIZATION",
      permissions: ["organization.read"],
    }));
  });

  await t.test("missing verified session is rejected before opening a database transaction", async () => {
    let transactionCalls = 0;
    const unauthenticated = createTenantRoleDefinitionAdapter({
      database: {
        async query() { throw new Error("Root database query is forbidden."); },
        async transaction(work) {
          transactionCalls += 1;
          return work({ async query() { return []; } });
        },
      },
      getCurrentSession: async () => null,
    });
    await assert.rejects(
      () => unauthenticated.createCustomRoleForCurrentUser({
        organizationId: ids.orgA,
        code: `v04-runtime-unauthenticated-${randomUUID()}`,
        scope: "ORGANIZATION",
        permissions: ["organization.read"],
      }),
      (error) => error instanceof TenantTargetContextError && error.code === "UNAUTHENTICATED",
    );
    assert.equal(transactionCalls, 0);
  });
});

test("production role-assignment adapter enforces verified-session actor and tenant boundaries on non-owner RLS role", async (t) => {
  const actorAService = createService(ids.actorA);

  await t.test("verified Organization owner grants a role to an active same-tenant member", async () => {
    const assignment = await actorAService.grantRoleAssignmentForCurrentUser({
      organizationId: ids.orgA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: memberRoleDefinitionId,
    });
    assert.equal(assignment.scope, "ORGANIZATION");
    assert.equal(assignment.parentId, ids.recipientMembershipA);
    assert.equal(assignment.roleDefinitionId, memberRoleDefinitionId);
    assert.equal(assignment.grantActorUserId, ids.actorA);
    assert.equal(assignment.isBreakGlass, false);
  });

  await t.test("verified actor can list the target member's effective assignment", async () => {
    const rows = await actorAService.listRoleAssignmentsForCurrentUser({
      organizationId: ids.orgA,
      userId: ids.recipientA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].roleDefinitionId, memberRoleDefinitionId);
  });

  await t.test("actor from another Organization cannot grant into Organization A", async () => {
    const foreignService = createService(ids.actorB);
    await expectAuthorizationDenied(() => foreignService.grantRoleAssignmentForCurrentUser({
      organizationId: ids.orgA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
      roleDefinitionId: memberRoleDefinitionId,
    }));
  });

  await t.test("Company admin cannot grant into a sibling Company", async () => {
    const companyAdminService = createService(ids.actorC);
    await expectAuthorizationDenied(() => companyAdminService.grantRoleAssignmentForCurrentUser({
      organizationId: ids.orgA,
      scope: "COMPANY",
      parentId: ids.companyMembershipRecipientB,
      roleDefinitionId: companyMemberRoleDefinitionId,
    }));
  });

  await t.test("Plant manager cannot grant into a sibling Plant", async () => {
    const plantManagerService = createService(ids.actorD);
    await expectAuthorizationDenied(() => plantManagerService.grantRoleAssignmentForCurrentUser({
      organizationId: ids.orgA,
      scope: "PLANT",
      parentId: ids.plantAssignmentRecipientA,
      roleDefinitionId: plantViewerRoleDefinitionId,
    }));
  });

  await t.test("actor from another Organization cannot list Organization A assignments", async () => {
    const foreignService = createService(ids.actorB);
    await expectAuthorizationDenied(() => foreignService.listRoleAssignmentsForCurrentUser({
      organizationId: ids.orgA,
      userId: ids.recipientA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipA,
    }));
  });

  await t.test("caller-supplied actor identity cannot override the verified session provider", async () => {
    const assignment = await actorAService.grantRoleAssignmentForCurrentUser({
      organizationId: ids.orgA,
      scope: "ORGANIZATION",
      parentId: ids.recipientMembershipB,
      roleDefinitionId: memberRoleDefinitionId,
      actorUserId: ids.actorB,
    });
    assert.equal(assignment.grantActorUserId, ids.actorA);
  });

  await t.test("missing verified session is rejected before any database query", async () => {
    const statements = [];
    const unauthenticated = createTenantRoleAssignmentAdapter({
      database: {
        async query(statement, values = []) { statements.push({ statement, values }); return []; },
        async transaction(work) {
          return work({ query: async (statement, values = []) => { statements.push({ statement, values }); return []; } });
        },
      },
      getCurrentSession: async () => null,
    });
    await assert.rejects(
      () => unauthenticated.grantRoleAssignmentForCurrentUser({
        organizationId: ids.orgA,
        scope: "ORGANIZATION",
        parentId: ids.recipientMembershipA,
        roleDefinitionId: memberRoleDefinitionId,
      }),
      (error) => error instanceof TenantTargetContextError && error.code === "UNAUTHENTICATED",
    );
    assert.equal(statements.length, 0);
  });

  await t.test("denied operations leave no Organization, Company, or Plant assignment rows", async () => {
    const organizationRows = await owner.query(
      'SELECT COUNT(*)::int AS count FROM "core"."organization_role_assignment" WHERE "organizationMembershipId" = $1',
      [ids.recipientMembershipA],
    );
    const companyRows = await owner.query(
      'SELECT COUNT(*)::int AS count FROM "core"."company_role_assignment" WHERE "companyMembershipId" = $1',
      [ids.companyMembershipRecipientB],
    );
    const plantRows = await owner.query(
      'SELECT COUNT(*)::int AS count FROM "core"."plant_role_assignment" WHERE "plantAssignmentId" = $1',
      [ids.plantAssignmentRecipientA],
    );
    assert.equal(organizationRows.rows[0].count, 1, "only the authorized Organization assignment exists");
    assert.equal(companyRows.rows[0].count, 0, "denied sibling-Company grant leaves no row");
    assert.equal(plantRows.rows[0].count, 0, "denied sibling-Plant grant leaves no row");
  });
});
