import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { assertDisposablePostgresUrl } from "./v04-integration-safety.mjs";

const { Client } = pg;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const runtimeUrl = process.env.DATABASE_URL;
if (!migrationUrl || !runtimeUrl) {
  throw new Error("MIGRATION_DATABASE_URL (owner) and DATABASE_URL (runtime) are required.");
}

// Strict target guard: the suite runs only against the exact disposable
// database CI provisions for it (V04_RLS_ALLOW_DISPOSABLE_DB=1,
// localhost:55437/sap_core_v04_rls_test), as the owner role for migrations and
// fixtures and as the dedicated runtime role for the RLS checks. No fallback
// target is ever used.
assertDisposablePostgresUrl({
  value: migrationUrl,
  suiteLabel: "V04 RLS tests",
  optInEnvName: "V04_RLS_ALLOW_DISPOSABLE_DB",
  expectedPort: 55437,
  expectedDatabase: "sap_core_v04_rls_test",
  expectedUsers: ["sap_core"],
});
assertDisposablePostgresUrl({
  value: runtimeUrl,
  suiteLabel: "V04 RLS tests",
  optInEnvName: "V04_RLS_ALLOW_DISPOSABLE_DB",
  expectedPort: 55437,
  expectedDatabase: "sap_core_v04_rls_test",
  expectedUsers: ["sap_core_runtime"],
});

const owner = new Client({ connectionString: migrationUrl });
const runtime = new Client({ connectionString: runtimeUrl });
let connected = false;
let runtimeRoleCreated = false;
// Custom role ids created by seedOwnerFixtures. Their permission grants,
// definitions and audit rows are immutable/append-only and remain in this
// dedicated disposable database, which CI discards after the suite.
const customRoleIds = [];
// User ids actually inserted by this run; teardown deletes exactly these and
// never any other user.
const createdUserIds = [];

// Fixture ids are unique per run (prefixed random UUIDs) so teardown deletes
// only rows created by this run and can never collide with pre-existing rows.
const runId = randomUUID();
const ids = {
  actorA: `v04-rls-${runId}-actor-a`,
  memberA: `v04-rls-${runId}-member-a`,
  actorB: `v04-rls-${runId}-actor-b`,
  orgA: randomUUID(),
  orgB: randomUUID(),
  companyA1: randomUUID(),
  companyA2: randomUUID(),
  companyB1: randomUUID(),
  plantA1: randomUUID(),
  plantA2: randomUUID(),
  plantB1: randomUUID(),
  orgMembershipA: randomUUID(),
  orgMembershipMemberA: randomUUID(),
  orgMembershipB: randomUUID(),
  companyMembershipA1: randomUUID(),
  companyMembershipA2: randomUUID(),
  companyMembershipB1: randomUUID(),
  plantAssignmentA1: randomUUID(),
  plantAssignmentA2: randomUUID(),
  plantAssignmentB1: randomUUID(),
};

async function count(client, table, where = "") {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table} ${where}`);
  return rows[0].n;
}

async function setContext(client, { user = ids.actorA, organization = ids.orgA, company = "", plant = "" } = {}) {
  await client.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true), set_config('app.company_id', $3, true), set_config('app.plant_id', $4, true)",
    [user, organization, company, plant],
  );
}

async function seedOwnerFixtures() {
  await owner.query(
    `INSERT INTO "core"."user" ("id","name","email","emailVerified","createdAt","updatedAt")
     VALUES ($1,'Actor A',$2,false,NOW(),NOW()),($3,'Member A',$4,false,NOW(),NOW()),($5,'Actor B',$6,false,NOW(),NOW())`,
    [ids.actorA, `v04-rls-${randomUUID()}-a@example.test`, ids.memberA, `v04-rls-${randomUUID()}-m@example.test`, ids.actorB, `v04-rls-${randomUUID()}-b@example.test`],
  );
  createdUserIds.push(ids.actorA, ids.memberA, ids.actorB);
  await owner.query(
    `INSERT INTO "core"."organization" ("id","updated_at") VALUES ($1,NOW()),($2,NOW())`,
    [ids.orgA, ids.orgB],
  );
  await owner.query(
    `INSERT INTO "core"."company" ("id","organizationId","updated_at")
     VALUES ($1,$2,NOW()),($3,$2,NOW()),($4,$5,NOW())`,
    [ids.companyA1, ids.orgA, ids.companyA2, ids.companyB1, ids.orgB],
  );
  await owner.query(
    `INSERT INTO "core"."plant" ("id","organizationId","companyId","updated_at")
     VALUES ($1,$2,$3,NOW()),($4,$2,$5,NOW()),($6,$7,$8,NOW())`,
    [ids.plantA1, ids.orgA, ids.companyA1, ids.plantA2, ids.companyA2, ids.plantB1, ids.orgB, ids.companyB1],
  );
  await owner.query(
    `INSERT INTO "core"."organization_membership" ("id","userId","organizationId","status","updated_at")
     VALUES ($1,$2,$3,'ACTIVE',NOW()),($4,$5,$3,'ACTIVE',NOW()),($6,$7,$8,'ACTIVE',NOW())`,
    [ids.orgMembershipA, ids.actorA, ids.orgA, ids.orgMembershipMemberA, ids.memberA, ids.orgMembershipB, ids.actorB, ids.orgB],
  );
  await owner.query(
    `INSERT INTO "core"."company_membership"
       ("id","userId","organizationMembershipId","organizationId","companyId","status","updated_at")
     VALUES ($1,$2,$3,$4,$5,'ACTIVE',NOW()),($6,$2,$3,$4,$7,'ACTIVE',NOW()),($8,$9,$10,$11,$12,'ACTIVE',NOW())`,
    [ids.companyMembershipA1, ids.actorA, ids.orgMembershipA, ids.orgA, ids.companyA1,
     ids.companyMembershipA2, ids.companyA2, ids.companyMembershipB1, ids.actorB, ids.orgMembershipB, ids.orgB, ids.companyB1],
  );
  await owner.query(
    `INSERT INTO "core"."plant_assignment"
       ("id","userId","companyMembershipId","organizationId","companyId","plantId","status","updated_at")
     VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',NOW()),($7,$2,$8,$4,$9,$10,'ACTIVE',NOW()),($11,$12,$13,$14,$15,$16,'ACTIVE',NOW())`,
    [ids.plantAssignmentA1, ids.actorA, ids.companyMembershipA1, ids.orgA, ids.companyA1, ids.plantA1,
     ids.plantAssignmentA2, ids.companyMembershipA2, ids.companyA2, ids.plantA2,
     ids.plantAssignmentB1, ids.actorB, ids.companyMembershipB1, ids.orgB, ids.companyB1, ids.plantB1],
  );

  const roleCodes = ["ORG_OWNER", "COMPANY_ADMIN", "PLANT_MANAGER"];
  const { rows: roleRows } = await owner.query(
    `SELECT "id"::text AS id, "code" FROM "core"."role_definition"
     WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind" AND "code" = ANY($1::text[])`,
    [roleCodes],
  );
  const role = Object.fromEntries(roleRows.map((row) => [row.code, row.id]));
  assert.deepEqual(Object.keys(role).sort(), roleCodes.sort());

  await owner.query(
    `INSERT INTO "core"."organization_role_assignment" ("id","organizationMembershipId","roleDefinitionId","role_scope","is_break_glass")
     VALUES ($1,$2,$3,'ORGANIZATION',false),($4,$5,$3,'ORGANIZATION',false)`,
    [randomUUID(), ids.orgMembershipA, role.ORG_OWNER, randomUUID(), ids.orgMembershipB],
  );
  await owner.query(
    `INSERT INTO "core"."company_role_assignment" ("id","companyMembershipId","roleDefinitionId","role_scope","is_break_glass")
     VALUES ($1,$2,$3,'COMPANY',false),($4,$5,$3,'COMPANY',false),($6,$7,$3,'COMPANY',false)`,
    [randomUUID(), ids.companyMembershipA1, role.COMPANY_ADMIN, randomUUID(), ids.companyMembershipA2, randomUUID(), ids.companyMembershipB1],
  );
  await owner.query(
    `INSERT INTO "core"."plant_role_assignment" ("id","plantAssignmentId","roleDefinitionId","role_scope","is_break_glass")
     VALUES ($1,$2,$3,'PLANT',false),($4,$5,$3,'PLANT',false),($6,$7,$3,'PLANT',false)`,
    [randomUUID(), ids.plantAssignmentA1, role.PLANT_MANAGER, randomUUID(), ids.plantAssignmentA2, randomUUID(), ids.plantAssignmentB1],
  );

  const { rows: permissionRows } = await owner.query(
    `SELECT "id"::text AS id FROM "core"."permission_definition" WHERE "code" = 'organization.read'`,
  );
  assert.equal(permissionRows.length, 1);
  for (const [ownerOrg, code, actorId] of [[ids.orgB, "CUSTOM_B", ids.actorB]]) {
    // role_family_id is a logical family identifier, not a separate table row.
    const familyId = randomUUID();
    const roleId = randomUUID();
    customRoleIds.push(roleId);
    await owner.query(
      `INSERT INTO "core"."role_definition"
       ("id","role_family_id","code","version","kind","scope","ownerOrganizationId","created_at","updated_at")
       VALUES ($1,$2,$3,1,'ORGANIZATION_CUSTOM','ORGANIZATION',$4,NOW(),NOW())`,
      [roleId, familyId, code, ownerOrg],
    );
    await owner.query(
      `INSERT INTO "core"."role_permission_grant" ("id","role_definition_id","permission_definition_id","effect")
       VALUES ($1,$2,$3,'ALLOW')`,
      [randomUUID(), roleId, permissionRows[0].id],
    );
    await owner.query(
      `UPDATE "core"."role_definition" SET "permissions_locked_at"=NOW() WHERE "id"=$1`,
      [roleId],
    );
    await owner.query(
      `INSERT INTO "core"."role_definition_audit"
       ("id","role_family_id","role_definition_id","owner_organization_id","actor_user_id","event_type","version","code","scope")
       VALUES ($1,$2,$3,$4,$5,'CREATE',1,$6,'ORGANIZATION')`,
      [randomUUID(), familyId, roleId, ownerOrg, actorId, code],
    );
  }

  for (const [scope, parent, actor] of [
    ["ORGANIZATION", ids.orgA, ids.actorA],
    ["COMPANY", ids.companyA1, ids.actorA],
    ["PLANT", ids.plantA1, ids.actorA],
    ["ORGANIZATION", ids.orgB, ids.actorB],
    ["COMPANY", ids.companyB1, ids.actorB],
    ["PLANT", ids.plantB1, ids.actorB],
  ]) {
    await owner.query(
      `INSERT INTO "core"."break_glass_access_audit"
       ("id","actor_user_id","role_assignment_id","scope","scope_parent_id","reason")
       VALUES ($1,$2,$3,$4::"core"."RoleScope",$5,'historical fixture')`,
      [randomUUID(), actor, randomUUID(), scope, parent],
    );
  }
}

test("non-owner runtime role enforces tenant RLS, bootstrap, target scoping, and identity-table exclusion", async () => {
  await owner.connect();
  connected = true;
  // Adversarial guard: the suite must provision its own runtime role on a
  // fresh disposable instance. A pre-existing sap_core_runtime means the
  // database is not a fresh disposable database (the role's original state —
  // grants, options, memberships — could not be restored after the run), so
  // refuse instead of granting onto it, and require a fresh disposable
  // instance.
  const { rows: preExistingRuntimeRole } = await owner.query(
    "SELECT 1 FROM pg_roles WHERE rolname = 'sap_core_runtime'",
  );
  if (preExistingRuntimeRole.length > 0) {
    throw new Error(
      "sap_core_runtime already exists; V04 RLS tests require a fresh disposable database where the runtime role does not pre-exist.",
    );
  }
  await owner.query(
    `CREATE ROLE sap_core_runtime LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
  );
  runtimeRoleCreated = true;
  await owner.query('GRANT USAGE ON SCHEMA "core" TO sap_core_runtime');
  await owner.query(`GRANT SELECT, INSERT, UPDATE ON
    "core"."organization", "core"."company", "core"."plant",
    "core"."organization_membership", "core"."company_membership", "core"."plant_assignment",
    "core"."organization_role_assignment", "core"."company_role_assignment", "core"."plant_role_assignment",
    "core"."role_definition", "core"."role_permission_grant"
    TO sap_core_runtime`);
  await owner.query(`GRANT SELECT, INSERT ON "core"."role_definition_audit", "core"."break_glass_access_audit" TO sap_core_runtime`);
  await owner.query(`GRANT SELECT ON "core"."permission_definition", "core"."permission_delegation_policy" TO sap_core_runtime`);
  await owner.query(`GRANT SELECT, INSERT, UPDATE ON "core"."user" TO sap_core_runtime`);
  await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "core"."session", "core"."account", "core"."verification" TO sap_core_runtime`);

  await seedOwnerFixtures();

  const { rows: roleState } = await owner.query(
    `SELECT r.rolsuper, r.rolbypassrls,
            COUNT(c.oid) FILTER (WHERE c.relrowsecurity AND c.relowner = r.oid)::int AS owned_rls_tables
       FROM pg_roles r
       LEFT JOIN pg_class c ON c.relnamespace = 'core'::regnamespace
      WHERE r.rolname = 'sap_core_runtime'
      GROUP BY r.rolsuper, r.rolbypassrls`,
  );
  assert.equal(roleState.length, 1);
  assert.equal(roleState[0].rolsuper, false);
  assert.equal(roleState[0].rolbypassrls, false);
  assert.equal(roleState[0].owned_rls_tables, 0);
  const { rows: delegationPrivileges } = await owner.query(
    `SELECT has_table_privilege('sap_core_runtime', 'core.permission_delegation_policy', 'SELECT') AS can_read,
            has_table_privilege('sap_core_runtime', 'core.permission_delegation_policy', 'UPDATE') AS can_update`,
  );
  assert.equal(delegationPrivileges[0].can_read, true);
  assert.equal(delegationPrivileges[0].can_update, false, "runtime role cannot approve or change delegation policy");

  const { rows: rlsTables } = await owner.query(
    `SELECT COUNT(*)::int AS n FROM pg_class
      WHERE relnamespace = 'core'::regnamespace AND relrowsecurity
        AND relname = ANY($1::text[])`,
    [[
      "organization","company","plant","organization_membership","company_membership","plant_assignment",
      "organization_role_assignment","company_role_assignment","plant_role_assignment","role_definition",
      "role_permission_grant","role_definition_audit","break_glass_access_audit",
    ]],
  );
  assert.equal(rlsTables[0].n, 13);

  await runtime.connect();
  try {
    await runtime.query("BEGIN");
    assert.equal(await count(runtime, '"core"."organization"'), 0);
    assert.equal(await count(runtime, '"core"."company"'), 0);
    assert.equal(await count(runtime, '"core"."plant"'), 0);
    assert.equal(await count(runtime, '"core"."organization_membership"'), 0);
    assert.equal(await count(runtime, '"core"."user"'), 3, "Better Auth identity rows remain available without tenant context");
    assert.equal(await count(runtime, '"core"."permission_definition"'), 15, "permission catalog remains globally readable");
    assert.equal(await count(runtime, '"core"."permission_delegation_policy"'), 15, "delegation policy is globally readable but owner-controlled");
    const { rows: delegableRows } = await runtime.query(
      `SELECT pd."code", dp."approved_by"
         FROM "core"."permission_delegation_policy" dp
         JOIN "core"."permission_definition" pd
           ON pd."id" = dp."permission_definition_id"
        WHERE dp."is_delegable" = TRUE
        ORDER BY pd."code"`,
    );
    assert.deepEqual(
      delegableRows.map((row) => row.code),
      ["company.read", "organization.read", "plant.read", "roles.read"],
      "only the four owner-approved read permissions are delegable",
    );
    assert.ok(delegableRows.every((row) => row.approved_by === "project-owner-approval:2026-11-09"));

    await runtime.query("SELECT set_config('app.user_id', $1, true)", [ids.actorA]);
    assert.equal(await count(runtime, '"core"."organization_membership"'), 1, "bootstrap reveals only the actor's own ACTIVE membership");

    await runtime.query("SELECT set_config('app.organization_id', $1, true)", [ids.orgA]);
    assert.equal(await count(runtime, '"core"."organization"'), 1);
    assert.equal(await count(runtime, '"core"."company"'), 2);
    assert.equal(await count(runtime, '"core"."plant"'), 2);
    assert.equal(await count(runtime, '"core"."organization_membership"'), 2);
    assert.equal(await count(runtime, '"core"."company_membership"'), 2);
    assert.equal(await count(runtime, '"core"."plant_assignment"'), 2);
    assert.equal(await count(runtime, '"core"."organization_role_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."company_role_assignment"'), 2);
    assert.equal(await count(runtime, '"core"."plant_role_assignment"'), 2);
    assert.equal(await count(runtime, '"core"."role_definition"' , 'WHERE "code" = \'CUSTOM_B\''), 0);
    assert.equal(await count(runtime, '"core"."role_permission_grant"', `WHERE "role_definition_id" IN (SELECT "id" FROM "core"."role_definition" WHERE "code" = 'CUSTOM_B')`), 0);
    assert.equal(await count(runtime, '"core"."role_definition_audit"', `WHERE "code" = 'CUSTOM_B'`), 0);
    assert.equal(await count(runtime, '"core"."break_glass_access_audit"'), 3);

    // Custom role writes are tenant-scoped and must be performed inside the
    // same Organization context. Permission grants can only be inserted before sealing.
    const familyId = randomUUID();
    const customRoleId = randomUUID();
    await runtime.query(
      `INSERT INTO "core"."role_definition"
       ("id","role_family_id","code","version","kind","scope","ownerOrganizationId","created_at","updated_at")
       VALUES ($1,$2,'CUSTOM_A',1,'ORGANIZATION_CUSTOM','ORGANIZATION',$3,NOW(),NOW())`,
      [customRoleId, familyId, ids.orgA],
    );
    const { rows: permission } = await runtime.query(
      `SELECT "id" FROM "core"."permission_definition" WHERE "code"='organization.read'`,
    );
    await runtime.query(
      `INSERT INTO "core"."role_permission_grant" ("id","role_definition_id","permission_definition_id","effect")
       VALUES ($1,$2,$3,'ALLOW')`,
      [randomUUID(), customRoleId, permission[0].id],
    );
    await runtime.query(
      `UPDATE "core"."role_definition" SET "permissions_locked_at"=NOW() WHERE "id"=$1`,
      [customRoleId],
    );
    await runtime.query(
      `INSERT INTO "core"."role_definition_audit"
       ("id","role_family_id","role_definition_id","owner_organization_id","actor_user_id","event_type","version","code","scope")
       VALUES ($1,$2,$3,$4,$5,'CREATE',1,'CUSTOM_A','ORGANIZATION')`,
      [randomUUID(), familyId, customRoleId, ids.orgA, ids.actorA],
    );
    assert.equal(await count(runtime, '"core"."role_definition"', 'WHERE "code" = \'CUSTOM_A\''), 1);
    assert.equal(await count(runtime, '"core"."role_permission_grant"', `WHERE "role_definition_id" = '${customRoleId}'::uuid`), 1);
    assert.equal(await count(runtime, '"core"."role_definition_audit"', `WHERE "code" = 'CUSTOM_A'`), 1);

    await runtime.query("SELECT set_config('app.company_id', $1, true)", [ids.companyA1]);
    assert.equal(await count(runtime, '"core"."company"'), 1);
    assert.equal(await count(runtime, '"core"."plant"'), 1);
    assert.equal(await count(runtime, '"core"."company_membership"'), 1);
    assert.equal(await count(runtime, '"core"."plant_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."company_role_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."plant_role_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."role_definition_audit"'), 0, "Organization custom-role audit is not exposed at Company scope");
    assert.equal(await count(runtime, '"core"."break_glass_access_audit"'), 2, "Company scope sees Company and descendant Plant audit, not Organization audit");

    await runtime.query("SELECT set_config('app.plant_id', $1, true)", [ids.plantA1]);
    assert.equal(await count(runtime, '"core"."plant"'), 1);
    assert.equal(await count(runtime, '"core"."plant_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."plant_role_assignment"'), 1);
    assert.equal(await count(runtime, '"core"."break_glass_access_audit"'), 1, "Plant scope sees only Plant audit");

    await runtime.query("SELECT set_config('app.organization_id', $1, true)", ["not-a-uuid"]);
    assert.equal(await count(runtime, '"core"."organization"'), 0, "malformed context fails closed");
    assert.equal(await count(runtime, '"core"."company"'), 0);
    await runtime.query("ROLLBACK");

    await runtime.query("BEGIN");
    await setContext(runtime);
    await assert.rejects(
      runtime.query(
        `INSERT INTO "core"."company" ("id","organizationId","updated_at") VALUES ($1,$2,NOW())`,
        [randomUUID(), ids.orgB],
      ),
      (error) => error.code === "42501",
    );
    await runtime.query("ROLLBACK");
  } finally {
    await runtime.end();
  }
});

after(async () => {
  // Failure-safe teardown: fixture cleanup runs only through the owner
  // connection, deletes rows in FK-safe order (children before parents),
  // strictly by the test-generated IDs captured in ids.* and customRoleIds —
  // never by broad DELETEs — and never touches pre-existing rows (system role
  // definitions, permission catalog, delegation policies). The runtime role is
  // dropped only if this suite created it, and only after its test-owned
  // dependencies are gone. The owner connection closes even when cleanup
  // fails, and every cleanup error is preserved and rethrown instead of
  // swallowed.
  const errors = [];
  if (connected) {
    try {
      await owner.query(
        'DELETE FROM "core"."break_glass_access_audit" WHERE "actor_user_id" = ANY($1::text[])',
        [[ids.actorA, ids.actorB]],
      );
      await owner.query(
        'DELETE FROM "core"."plant_role_assignment" WHERE "plantAssignmentId" = ANY($1::uuid[])',
        [[ids.plantAssignmentA1, ids.plantAssignmentA2, ids.plantAssignmentB1]],
      );
      await owner.query(
        'DELETE FROM "core"."company_role_assignment" WHERE "companyMembershipId" = ANY($1::uuid[])',
        [[ids.companyMembershipA1, ids.companyMembershipA2, ids.companyMembershipB1]],
      );
      await owner.query(
        'DELETE FROM "core"."organization_role_assignment" WHERE "organizationMembershipId" = ANY($1::uuid[])',
        [[ids.orgMembershipA, ids.orgMembershipMemberA, ids.orgMembershipB]],
      );
      await owner.query(
        'DELETE FROM "core"."plant_assignment" WHERE "id" = ANY($1::uuid[])',
        [[ids.plantAssignmentA1, ids.plantAssignmentA2, ids.plantAssignmentB1]],
      );
      await owner.query(
        'DELETE FROM "core"."company_membership" WHERE "id" = ANY($1::uuid[])',
        [[ids.companyMembershipA1, ids.companyMembershipA2, ids.companyMembershipB1]],
      );
      await owner.query(
        'DELETE FROM "core"."organization_membership" WHERE "id" = ANY($1::uuid[])',
        [[ids.orgMembershipA, ids.orgMembershipMemberA, ids.orgMembershipB]],
      );
      await owner.query(
        'DELETE FROM "core"."plant" WHERE "id" = ANY($1::uuid[])',
        [[ids.plantA1, ids.plantA2, ids.plantB1]],
      );
      await owner.query(
        'DELETE FROM "core"."company" WHERE "id" = ANY($1::uuid[])',
        [[ids.companyA1, ids.companyA2, ids.companyB1]],
      );
      await owner.query(
        'DELETE FROM "core"."organization" WHERE "id" = ANY($1::uuid[])',
        [[ids.orgA, ids.orgB]],
      );
      // Only users this run actually created are deleted.
      if (createdUserIds.length > 0) {
        await owner.query(
          'DELETE FROM "core"."user" WHERE "id" = ANY($1::text[])',
          [createdUserIds],
        );
      }
    } catch (error) {
      errors.push(error);
    }
    if (runtimeRoleCreated) {
      try {
        await owner.query('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "core" FROM sap_core_runtime');
        await owner.query('REVOKE USAGE ON SCHEMA "core" FROM sap_core_runtime');
        await owner.query("DROP ROLE sap_core_runtime");
      } catch (error) {
        errors.push(error);
      }
    }
  }
  const outcomes = await Promise.allSettled(connected ? [owner.end()] : []);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") errors.push(outcome.reason);
  }
  if (errors.length) throw new AggregateError(errors, "V04 RLS teardown failed; the disposable database must be discarded.");
});
