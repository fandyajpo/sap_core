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
// This suite deliberately leaves its tenant fixtures and append-only audit
// history in the job-scoped database. GitHub Actions provisions a fresh
// PostgreSQL service for this job and discards it after completion; attempting
// row-by-row cleanup would violate immutable history and its foreign keys.

// Fixture ids are unique per run (prefixed random UUIDs) so this suite's
// tenant rows cannot collide with another run. Rows intentionally remain in
// the job-scoped disposable database because append-only audit history and
// foreign keys make row-by-row teardown invalid; CI discards the whole service.
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
    const { rows: hiddenBootstrapLock } = await runtime.query(
      `SELECT om."id"::text AS "id"
         FROM "core"."organization_membership" om
        WHERE om."id" = $1::uuid AND om."userId" = $2 AND om."status" = 'ACTIVE'
        FOR SHARE OF om`,
      [ids.orgMembershipA, ids.actorA],
    );
    assert.equal(hiddenBootstrapLock.length, 0, "bootstrap SELECT visibility does not permit a row lock before Organization context");

    await runtime.query("SELECT set_config('app.organization_id', $1, true)", [ids.orgA]);
    const { rows: lockedBootstrapMembership } = await runtime.query(
      `SELECT om."id"::text AS "id"
         FROM "core"."organization_membership" om
        WHERE om."id" = $1::uuid AND om."userId" = $2 AND om."status" = 'ACTIVE'
        FOR SHARE OF om`,
      [ids.orgMembershipA, ids.actorA],
    );
    assert.equal(lockedBootstrapMembership.length, 1, "the exact membership becomes lockable after tenant context is installed");
    assert.equal(await count(runtime, '"core"."organization"'), 1);
    assert.equal(await count(runtime, '"core"."company"'), 2);
    assert.equal(await count(runtime, '"core"."plant"'), 2);
    assert.equal(await count(runtime, '"core"."organization_membership"'), 2);
    assert.equal(await count(runtime, '"core"."company_membership"'), 2);
    assert.equal(await count(runtime, '"core"."plant_assignment"'), 2);
    assert.equal(await count(runtime, '"core"."organization_role_assignment"'), 1);

    // SYSTEM role definitions are SELECT-visible but intentionally not
    // UPDATE-visible under RLS. A row lock on the catalog therefore hides
    // ORG_OWNER; lock only the mutable assignment row instead.
    const { rows: visibleOwnerCatalog } = await runtime.query(
      `SELECT rd."id"::text AS "id"
         FROM "core"."organization_role_assignment" ra
         JOIN "core"."role_definition" rd
           ON rd."id" = ra."roleDefinitionId"
          AND rd."scope" = ra."role_scope"
          AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."code" = 'ORG_OWNER'
        WHERE ra."organizationMembershipId" = $1
          AND ra."revoked_at" IS NULL
          AND ra."is_break_glass" = FALSE`,
      [ids.orgMembershipA],
    );
    assert.equal(visibleOwnerCatalog.length, 1, "SYSTEM ORG_OWNER is globally SELECT-visible");

    const { rows: lockedOwnerAssignment } = await runtime.query(
      `SELECT ra."id"::text AS "id"
         FROM "core"."organization_role_assignment" ra
         JOIN "core"."role_definition" rd
           ON rd."id" = ra."roleDefinitionId"
          AND rd."scope" = ra."role_scope"
          AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."code" = 'ORG_OWNER'
        WHERE ra."organizationMembershipId" = $1
          AND ra."revoked_at" IS NULL
          AND ra."is_break_glass" = FALSE
        FOR SHARE OF ra`,
      [ids.orgMembershipA],
    );
    assert.equal(lockedOwnerAssignment.length, 1, "runtime may lock mutable owner assignment without locking SYSTEM catalog");

    const { rows: hiddenLockedCatalog } = await runtime.query(
      `SELECT rd."id"::text AS "id"
         FROM "core"."role_definition" rd
        WHERE rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."code" = 'ORG_OWNER'
        FOR SHARE`,
    );
    assert.equal(hiddenLockedCatalog.length, 0, "FOR SHARE on SYSTEM catalog is hidden by RLS UPDATE-policy visibility");

    // The production grant loader locks only mutable rows at Company and Plant
    // scopes. SYSTEM role definitions remain joined for validation, not locked.
    const { rows: lockedCompanyAssignments } = await runtime.query(
      `SELECT ra."id"::text AS "id"
         FROM "core"."company_role_assignment" ra
         JOIN "core"."company_membership" cm
           ON cm."id" = ra."companyMembershipId"
          AND cm."userId" = $1
          AND cm."organizationId" = $2::uuid
          AND cm."companyId" = $3::uuid
          AND cm."status" = 'ACTIVE'
         JOIN "core"."organization_membership" om
           ON om."id" = cm."organizationMembershipId"
          AND om."userId" = cm."userId"
          AND om."organizationId" = cm."organizationId"
          AND om."status" = 'ACTIVE'
         JOIN "core"."role_definition" rd
           ON rd."id" = ra."roleDefinitionId"
          AND rd."scope" = ra."role_scope"
          AND rd."scope" = 'COMPANY'::"core"."RoleScope"
          AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."disabled_at" IS NULL
          AND rd."permissions_locked_at" IS NOT NULL
        WHERE ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE
        FOR SHARE OF ra, cm, om`,
      [ids.actorA, ids.orgA, ids.companyA1],
    );
    assert.equal(lockedCompanyAssignments.length, 1, "Company grants lock assignment and membership rows without locking SYSTEM definitions");

    const { rows: lockedPlantAssignments } = await runtime.query(
      `SELECT ra."id"::text AS "id"
         FROM "core"."plant_role_assignment" ra
         JOIN "core"."plant_assignment" pa
           ON pa."id" = ra."plantAssignmentId"
          AND pa."userId" = $1
          AND pa."organizationId" = $2::uuid
          AND pa."companyId" = $3::uuid
          AND pa."plantId" = $4::uuid
          AND pa."status" = 'ACTIVE'
         JOIN "core"."company_membership" cm
           ON cm."id" = pa."companyMembershipId"
          AND cm."userId" = pa."userId"
          AND cm."organizationId" = pa."organizationId"
          AND cm."companyId" = pa."companyId"
          AND cm."status" = 'ACTIVE'
         JOIN "core"."organization_membership" om
           ON om."id" = cm."organizationMembershipId"
          AND om."userId" = cm."userId"
          AND om."organizationId" = cm."organizationId"
          AND om."status" = 'ACTIVE'
         JOIN "core"."role_definition" rd
           ON rd."id" = ra."roleDefinitionId"
          AND rd."scope" = ra."role_scope"
          AND rd."scope" = 'PLANT'::"core"."RoleScope"
          AND rd."kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND rd."disabled_at" IS NULL
          AND rd."permissions_locked_at" IS NOT NULL
        WHERE ra."revoked_at" IS NULL AND ra."is_break_glass" = FALSE
        FOR SHARE OF ra, pa, cm, om`,
      [ids.actorA, ids.orgA, ids.companyA1, ids.plantA1],
    );
    assert.equal(lockedPlantAssignments.length, 1, "Plant grants lock assignment and ancestry rows without locking SYSTEM definitions");

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
  // The entire database is the disposable fixture boundary. The test creates
  // append-only role grants/audit history and break-glass audit rows whose
  // foreign keys intentionally retain their tenant and actor records. Do not
  // delete any fixture rows or parent records: CI discards this job-scoped
  // PostgreSQL service after the suite.
  const errors = [];
  if (connected && runtimeRoleCreated) {
    try {
      // The runtime role was created by this suite and owns no objects. Revoke
      // the grants it received before dropping it; never touch pre-existing
      // roles or database objects.
      await owner.query('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "core" FROM sap_core_runtime');
      await owner.query('REVOKE USAGE ON SCHEMA "core" FROM sap_core_runtime');
      await owner.query("DROP ROLE sap_core_runtime");
    } catch (error) {
      errors.push(error);
    }
  }
  const outcomes = await Promise.allSettled(connected ? [owner.end()] : []);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") errors.push(outcome.reason);
  }
  if (errors.length) {
    throw new AggregateError(errors, "V04 RLS teardown failed; discard the dedicated disposable database.");
  }
});
