import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import {
  createRoleDefinitionService,
  RoleDefinitionError,
} from "../src/lib/role-definition-service.ts";
import {
  createRoleAssignmentService,
  RoleAssignmentError,
} from "../src/lib/role-assignment-service.ts";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the D8 integration suite.");
}

const parsedDatabaseURL = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseURL.pathname.slice(1));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.D8_ALLOW_DISPOSABLE_DB !== "1" ||
  !localHosts.has(parsedDatabaseURL.hostname) ||
  !["55434", "55435"].includes(parsedDatabaseURL.port) ||
  databaseName !== "sap_core_d8_test"
) {
  throw new Error(
    "D8 tests require explicit disposable DB approval and an approved localhost D8 port (55434 or 55435).",
  );
}
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const fixture = {
  actorId: randomUUID(),
  subjectAId: randomUUID(),
  subjectBId: randomUUID(),
  organizationAId: randomUUID(),
  organizationBId: randomUUID(),
  membershipAId: randomUUID(),
  membershipBId: randomUUID(),
  companyAId: randomUUID(),
  plantAId: randomUUID(),
  companyMembershipAId: randomUUID(),
  plantAssignmentAId: randomUUID(),
};
let client;
let transactionOpen = false;
let savepointCounter = 0;
let transactionQueue = Promise.resolve();
let allowCreate = true;
let allowRevise = true;
let delegablePermissions = [
  "organization.read", "organization.update", "organization.members.read", "organization.members.manage",
  "company.read", "company.manage", "company.members.manage", "plant.read", "plant.manage",
  "plant.assignments.manage", "roles.read", "roles.create", "roles.revise", "roles.assign", "audit.read",
];
const authorizationCalls = [];

function createSession(databaseClient) {
  return {
    async query(statement, values = []) {
      const result = await databaseClient.query(statement, values);
      return result.rows;
    },
  };
}

const database = {
  ...createSession({ query: (...args) => client.query(...args) }),
  async transaction(work) {
    const previous = transactionQueue;
    let release;
    transactionQueue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;

    const savepoint = `d8_service_${++savepointCounter}`;
    let savepointOpen = false;
    try {
      await client.query(`SAVEPOINT ${savepoint}`);
      savepointOpen = true;
      const result = await work(createSession(client));
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      savepointOpen = false;
      return result;
    } catch (error) {
      if (savepointOpen) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
      throw error;
    } finally {
      release();
    }
  },
};

const roleDefinitions = createRoleDefinitionService(database, {
  async initializeContext() {},
  async getDelegablePermissions() {
    return delegablePermissions;
  },
  async authorizeCreate(input) {
    authorizationCalls.push({ operation: "CREATE", ...input });
    return allowCreate;
  },
  async authorizeRevise(input) {
    authorizationCalls.push({ operation: "REVISE", ...input });
    return allowRevise;
  },
});

async function reviseRole(input) {
  return roleDefinitions.reviseCustomRole({
    organizationId: fixture.organizationAId,
    ...input,
  });
}

async function createCustomRole(input) {
  return roleDefinitions.createCustomRole({
    permissions: ["organization.read"],
    ...input,
  });
}

async function getSystemRoleId(code) {
  const { rows } = await client.query(
    `SELECT "id"::text AS "id" FROM "core"."role_definition"
      WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind" AND "code" = $1`,
    [code],
  );
  assert.equal(rows.length, 1, `expected exactly one seeded SYSTEM role ${code}`);
  return rows[0].id;
}

const roleAssignments = createRoleAssignmentService(database, {
  async authorizeGrant() {
    return true;
  },
  async authorizeBreakGlassUse() {
    return true;
  },
});

async function assertDefinitionError(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RoleDefinitionError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertAssignmentError(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RoleAssignmentError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertDatabaseRejects(operation) {
  const savepoint = `d8_expected_failure_${++savepointCounter}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert.ok(caught, "expected PostgreSQL to reject the operation");
}

async function auditCount() {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM "core"."role_definition_audit"`);
  return rows[0].count;
}

async function withAuditInsertRejected(work) {
  const suffix = randomUUID().replaceAll("-", "");
  const triggerName = `d8_audit_fail_${suffix}`;
  const functionName = `d8_audit_fail_${suffix}`;

  try {
    await client.query(`
      CREATE FUNCTION "core"."${functionName}"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'D8 integration test rejected audit insert.' USING ERRCODE = 'P0001';
      END;
      $$
    `);
    await client.query(
      `CREATE TRIGGER "${triggerName}"
       BEFORE INSERT ON "core"."role_definition_audit"
       FOR EACH ROW EXECUTE FUNCTION "core"."${functionName}"()`,
    );
    return await work({ triggerName, functionName });
  } finally {
    try {
      await client.query(`DROP TRIGGER IF EXISTS "${triggerName}" ON "core"."role_definition_audit"`);
    } finally {
      await client.query(`DROP FUNCTION IF EXISTS "core"."${functionName}"()`);
    }
  }
}

async function insertSystemRole() {
  return getSystemRoleId("ORG_OWNER");
}

before(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SELECT 1");

  const { rows } = await client.query(`
    SELECT
      to_regclass('"core"."role_definition"') IS NOT NULL AS role_definition,
      to_regclass('"core"."role_definition_audit"') IS NOT NULL AS role_definition_audit,
      to_regclass('"core"."organization"') IS NOT NULL AS organization,
      to_regclass('"core"."organization_membership"') IS NOT NULL AS organization_membership
  `);
  assert.deepEqual(Object.values(rows[0]), [true, true, true, true], "the D8 migration must be applied");

  await client.query(
    `INSERT INTO "core"."user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES
       ($1, 'D8 actor fixture', $2, false, NOW(), NOW()),
       ($3, 'D8 subject A fixture', $4, false, NOW(), NOW()),
       ($5, 'D8 subject B fixture', $6, false, NOW(), NOW())`,
    [
      fixture.actorId,
      `d8-${fixture.actorId}@example.test`,
      fixture.subjectAId,
      `d8-${fixture.subjectAId}@example.test`,
      fixture.subjectBId,
      `d8-${fixture.subjectBId}@example.test`,
    ],
  );
  await client.query(
    `INSERT INTO "core"."organization" ("id", "updated_at") VALUES ($1, NOW()), ($2, NOW())`,
    [fixture.organizationAId, fixture.organizationBId],
  );
  await client.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "updated_at") VALUES
       ($1, $2, $3, 'ACTIVE', NOW()),
       ($4, $5, $6, 'ACTIVE', NOW())`,
    [
      fixture.membershipAId,
      fixture.subjectAId,
      fixture.organizationAId,
      fixture.membershipBId,
      fixture.subjectBId,
      fixture.organizationBId,
    ],
  );
  await client.query(
    `INSERT INTO "core"."company" ("id", "organizationId", "updated_at") VALUES ($1, $2, NOW())`,
    [fixture.companyAId, fixture.organizationAId],
  );
  await client.query(
    `INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "updated_at") VALUES ($1, $2, $3, NOW())`,
    [fixture.plantAId, fixture.organizationAId, fixture.companyAId],
  );
  await client.query(
    `INSERT INTO "core"."company_membership"
       ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "updated_at")
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())`,
    [
      fixture.companyMembershipAId,
      fixture.subjectAId,
      fixture.membershipAId,
      fixture.organizationAId,
      fixture.companyAId,
    ],
  );
  await client.query(
    `INSERT INTO "core"."plant_assignment"
       ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "updated_at")
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())`,
    [
      fixture.plantAssignmentAId,
      fixture.subjectAId,
      fixture.companyMembershipAId,
      fixture.organizationAId,
      fixture.companyAId,
      fixture.plantAId,
    ],
  );
});

after(async () => {
  try {
    if (transactionOpen) {
      await client.query("ROLLBACK");
      transactionOpen = false;
    }
  } finally {
    client?.release();
    await pool.end();
  }
});

test("D8-A custom role ownership, revision, audit, and D7 enforcement", async (t) => {
  let customRoleA;
  let customRoleB;
  let customCompanyRoleA;
  let customPlantRoleA;
  let systemRoleId;
  let assignedRole;
  let assignedCompanyRole;
  let assignedPlantRole;

  await t.test("migration seeds the approved permission catalog and sealed built-in role snapshots", async () => {
    const { rows: permissionRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."permission_definition"`,
    );
    assert.equal(permissionRows[0].count, 15);
    const { rows: delegableRows } = await client.query(
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
      "only the four owner-approved read permissions may be delegated",
    );
    assert.ok(delegableRows.every((row) => row.approved_by === "project-owner-approval:2026-11-09"));
    const { rows: roleRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."role_definition"
        WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"`,
    );
    assert.equal(roleRows[0].count, 8);
    const { rows: grantRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."role_permission_grant"`,
    );
    assert.equal(grantRows[0].count, 50);
    const { rows: unsealed } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."role_definition"
        WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND "permissions_locked_at" IS NULL`,
    );
    assert.equal(unsealed[0].count, 0);

    const orgOwnerId = await getSystemRoleId("ORG_OWNER");
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_permission_grant"
         ("id", "role_definition_id", "permission_definition_id", "effect")
       SELECT $1, rd."id", pd."id", 'ALLOW'::"core"."PermissionGrantEffect"
         FROM "core"."role_definition" rd CROSS JOIN "core"."permission_definition" pd
        WHERE rd."id" = $2 AND pd."code" = 'organization.read'`,
      [randomUUID(), orgOwnerId],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_permission_grant" SET "effect" = 'DENY'
        WHERE "id" = (
          SELECT "id" FROM "core"."role_permission_grant"
          WHERE "role_definition_id" = $1 LIMIT 1
        )`,
      [orgOwnerId],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_definition" SET "permissions_locked_at" = NULL WHERE "id" = $1`,
      [orgOwnerId],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."permission_definition" SET "description" = 'tampered'`,
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_definition" SET "code" = 'tampered' WHERE "id" = $1`,
      [orgOwnerId],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."role_permission_grant"
        WHERE "id" = (
          SELECT "id" FROM "core"."role_permission_grant"
          WHERE "role_definition_id" = $1 LIMIT 1
        )`,
      [orgOwnerId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-company-custom-bypass', 1, 'ORGANIZATION_CUSTOM',
               'COMPANY'::"core"."RoleScope", $3, NOW())`,
      [randomUUID(), randomUUID(), fixture.organizationAId],
    ));

    const unsealedCustomRoleId = randomUUID();
    await client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-deny-custom-bypass', 1, 'ORGANIZATION_CUSTOM',
               'ORGANIZATION'::"core"."RoleScope", $3, NOW())`,
      [unsealedCustomRoleId, randomUUID(), fixture.organizationAId],
    );
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_permission_grant"
         ("id", "role_definition_id", "permission_definition_id", "effect")
       SELECT $1, $2, pd."id", 'DENY'::"core"."PermissionGrantEffect"
         FROM "core"."permission_definition" pd WHERE pd."code" = 'organization.read'`,
      [randomUUID(), unsealedCustomRoleId],
    ));
  });

  await t.test("create rejects missing human actors and Organizations", async () => {
    await assertDefinitionError(
      createCustomRole({
        actorUserId: `missing:${randomUUID()}`,
        organizationId: fixture.organizationAId,
        code: "d8.missing-actor",
        scope: "ORGANIZATION",
      }),
      "ACTOR_NOT_FOUND",
    );
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: randomUUID(),
        code: "d8.missing-organization",
        scope: "ORGANIZATION",
      }),
      "ORGANIZATION_NOT_FOUND",
    );
  });

  await t.test("create authorization is mandatory, Organization-scoped, and atomic", async () => {
    assert.throws(
      () => createRoleDefinitionService(database, {}),
      /Organization custom-role delegation, create, and revise authorization policies are required\./,
    );
    const before = await auditCount();
    allowCreate = false;
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.denied-create",
        scope: "ORGANIZATION",
      }),
      "AUTHORIZATION_DENIED",
    );
    allowCreate = true;
    assert.equal(await auditCount(), before, "a denied create must not persist an audit event");

    delegablePermissions = ["organization.read"];
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.out-of-delegation",
        scope: "ORGANIZATION",
        permissions: ["organization.update"],
      }),
      "AUTHORIZATION_DENIED",
    );
    delegablePermissions = [
      "organization.read", "organization.update", "organization.members.read", "organization.members.manage",
      "company.read", "company.manage", "company.members.manage", "plant.read", "plant.manage",
      "plant.assignments.manage", "roles.read", "roles.create", "roles.revise", "roles.assign", "audit.read",
    ];

    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "   ",
        scope: "ORGANIZATION",
      }),
      "INVALID_INPUT",
    );
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.platform-role",
        scope: "PLATFORM",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );

    customRoleA = await createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationAId,
      code: "d8.organization-reader",
      scope: "ORGANIZATION",
    });
    assert.equal(customRoleA.kind, "ORGANIZATION_CUSTOM");
    assert.equal(customRoleA.version, 1);
    assert.equal(customRoleA.ownerOrganizationId, fixture.organizationAId);
    assert.equal(customRoleA.scope, "ORGANIZATION");
    assert.ok(customRoleA.roleFamilyId);
    assert.ok(customRoleA.permissionsLockedAt instanceof Date);
    const { rows: snapshotRows } = await client.query(
      `SELECT pd."code" FROM "core"."role_permission_grant" g
        JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
       WHERE g."role_definition_id" = $1 AND g."effect" = 'ALLOW'`,
      [customRoleA.id],
    );
    assert.deepEqual(snapshotRows, [{ code: "organization.read" }]);
    const createCall = authorizationCalls.find((call) => call.operation === "CREATE");
    assert.equal(createCall.organizationId, fixture.organizationAId);
    assert.equal(createCall.actorUserId, fixture.actorId);

    const { rows: auditRows } = await client.query(
      `SELECT "event_type", "role_family_id"::text AS "roleFamilyId", "version", "scope"::text AS "scope"
       FROM "core"."role_definition_audit" WHERE "role_definition_id" = $1`,
      [customRoleA.id],
    );
    assert.deepEqual(auditRows, [{
      event_type: "CREATE",
      roleFamilyId: customRoleA.roleFamilyId,
      version: 1,
      scope: "ORGANIZATION",
    }]);

    customRoleB = await createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationBId,
      code: "d8.other-tenant-role",
      scope: "ORGANIZATION",
    });
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.company-reader",
        scope: "COMPANY",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );
    await assertDefinitionError(
      createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.plant-reader",
        scope: "PLANT",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );
    customCompanyRoleA = await getSystemRoleId("COMPANY_ADMIN");
    customPlantRoleA = await getSystemRoleId("PLANT_MANAGER");
  });

  await t.test("D7 grants and effective resolution enforce the custom-role owner", async () => {
    await assertAssignmentError(
      roleAssignments.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: fixture.membershipAId,
        roleDefinitionId: customRoleB.id,
        actorUserId: fixture.actorId,
      }),
      "ROLE_DEFINITION_OWNER_MISMATCH",
    );
    assignedRole = await roleAssignments.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: fixture.membershipAId,
      roleDefinitionId: customRoleA.id,
      actorUserId: fixture.actorId,
    });
    assignedCompanyRole = await roleAssignments.grantRoleAssignment({
      scope: "COMPANY",
      parentId: fixture.companyMembershipAId,
      roleDefinitionId: customCompanyRoleA,
      actorUserId: fixture.actorId,
    });
    assignedPlantRole = await roleAssignments.grantRoleAssignment({
      scope: "PLANT",
      parentId: fixture.plantAssignmentAId,
      roleDefinitionId: customPlantRoleA,
      actorUserId: fixture.actorId,
    });
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "ORGANIZATION",
        parentId: fixture.membershipAId,
      })).map((assignment) => assignment.id),
      [assignedRole.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipAId,
      })).map((assignment) => assignment.id),
      [assignedCompanyRole.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "PLANT",
        parentId: fixture.plantAssignmentAId,
      })).map((assignment) => assignment.id),
      [assignedPlantRole.id],
    );

    await client.query(
      `INSERT INTO "core"."organization_role_assignment"
         ("id", "organizationMembershipId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'ORGANIZATION'::"core"."RoleScope")`,
      [randomUUID(), fixture.membershipAId, customRoleB.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "ORGANIZATION",
        parentId: fixture.membershipAId,
      })).map((assignment) => assignment.id),
      [assignedRole.id],
      "a cross-Organization custom role inserted outside the service must not resolve effectively",
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipAId,
      })).map((assignment) => assignment.id),
      [assignedCompanyRole.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "PLANT",
        parentId: fixture.plantAssignmentAId,
      })).map((assignment) => assignment.id),
      [assignedPlantRole.id],
    );

    await client.query(
      `UPDATE "core"."role_definition" SET "disabled_at" = NOW(), "updated_at" = NOW() WHERE "id" = $1`,
      [customRoleA.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectAId,
        scope: "ORGANIZATION",
        parentId: fixture.membershipAId,
      })).map((assignment) => assignment.id),
      [assignedRole.id],
      "D8 must not change effective-role behavior based on disabledAt",
    );
  });

  await t.test("revisions require Organization authorization and advance one immutable family", async () => {
    const beforeDenied = await auditCount();
    allowRevise = false;
    await assertDefinitionError(
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleA.id,
        code: "d8.denied-revision",
      }),
      "AUTHORIZATION_DENIED",
    );
    allowRevise = true;
    assert.equal(await auditCount(), beforeDenied);

    const revision = await reviseRole({
      actorUserId: fixture.actorId,
      roleDefinitionId: customRoleA.id,
      code: "d8.organization-reader-v2",
    });
    assert.notEqual(revision.id, customRoleA.id);
    assert.equal(revision.roleFamilyId, customRoleA.roleFamilyId);
    assert.equal(revision.ownerOrganizationId, customRoleA.ownerOrganizationId);
    assert.equal(revision.version, 2);
    assert.equal(revision.code, "d8.organization-reader-v2");
    assert.equal(revision.scope, customRoleA.scope);
    assert.ok(revision.permissionsLockedAt instanceof Date);
    const { rows: revisionSnapshot } = await client.query(
      `SELECT pd."code" FROM "core"."role_permission_grant" g
        JOIN "core"."permission_definition" pd ON pd."id" = g."permission_definition_id"
       WHERE g."role_definition_id" = $1 AND g."effect" = 'ALLOW'`,
      [revision.id],
    );
    assert.deepEqual(revisionSnapshot, [{ code: "organization.read" }]);
    const reviseCall = authorizationCalls.find((call) => call.operation === "REVISE");
    assert.equal(reviseCall.organizationId, fixture.organizationAId);
    assert.equal(reviseCall.currentVersion, 1);
    assert.equal(reviseCall.nextVersion, 2);

    const { rows: auditRows } = await client.query(
      `SELECT "event_type", "version" FROM "core"."role_definition_audit"
       WHERE "role_family_id" = $1 ORDER BY "version"`,
      [customRoleA.roleFamilyId],
    );
    assert.deepEqual(auditRows, [
      { event_type: "CREATE", version: 1 },
      { event_type: "REVISE", version: 2 },
    ]);
    await assertDefinitionError(
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleA.id,
      }),
      "ROLE_DEFINITION_VERSION_CONFLICT",
    );
    await assertDefinitionError(
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleB.id,
        scope: "PLATFORM",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );
  });

  await t.test("concurrent revision requests advance a family exactly once", async () => {
    const initial = await createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationAId,
      code: `d8-concurrent-${randomUUID()}`,
      scope: "ORGANIZATION",
    });

    // Both requests are submitted together; the single-client savepoint adapter serializes
    // their transaction callbacks to preserve the suite's outer rollback isolation.
    const outcomes = await Promise.allSettled([
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: initial.id,
        code: `${initial.code}-left`,
      }),
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: initial.id,
        code: `${initial.code}-right`,
      }),
    ]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof RoleDefinitionError);
    assert.equal(rejected[0].reason.code, "ROLE_DEFINITION_VERSION_CONFLICT");

    const { rows: versions } = await client.query(
      `SELECT "id"::text AS "id", "version" FROM "core"."role_definition"
       WHERE "role_family_id" = $1 ORDER BY "version"`,
      [initial.roleFamilyId],
    );
    assert.deepEqual(versions.map((row) => row.version), [1, 2]);
    assert.equal(new Set(versions.map((row) => row.id)).size, 2);
    assert.equal(versions.filter((row) => row.version === 2).length, 1);

    const { rows: reviseAudits } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."role_definition_audit"
       WHERE "role_family_id" = $1 AND "event_type" = 'REVISE'`,
      [initial.roleFamilyId],
    );
    assert.equal(reviseAudits[0].count, 1);
  });

  await t.test("audit insert failures roll back create and revision rows and clean up test trigger", async () => {
    const revisionBase = await createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationAId,
      code: `d8-audit-atomic-revision-${randomUUID()}`,
      scope: "ORGANIZATION",
    });
    const failedCreateCode = `d8-audit-atomic-create-${randomUUID()}`;
    const auditCountBefore = await auditCount();

    const testObjects = await withAuditInsertRejected(async (objects) => {
      await assert.rejects(createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: failedCreateCode,
        scope: "ORGANIZATION",
      }));
      const { rows: failedCreateRows } = await client.query(
        `SELECT "id" FROM "core"."role_definition"
         WHERE "ownerOrganizationId" = $1 AND "code" = $2`,
        [fixture.organizationAId, failedCreateCode],
      );
      assert.deepEqual(failedCreateRows, [], "failed create audit must roll back its RoleDefinition insert");
      assert.equal(await auditCount(), auditCountBefore);

      await assert.rejects(reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: revisionBase.id,
        code: `${revisionBase.code}-failed-revision`,
      }));
      const { rows: familyVersions } = await client.query(
        `SELECT "version" FROM "core"."role_definition"
         WHERE "role_family_id" = $1 ORDER BY "version"`,
        [revisionBase.roleFamilyId],
      );
      assert.deepEqual(familyVersions, [{ version: 1 }], "failed revision audit must roll back its new version");
      const { rows: familyAudits } = await client.query(
        `SELECT "event_type" FROM "core"."role_definition_audit"
         WHERE "role_family_id" = $1 ORDER BY "version"`,
        [revisionBase.roleFamilyId],
      );
      assert.deepEqual(familyAudits, [{ event_type: "CREATE" }]);
      assert.equal(await auditCount(), auditCountBefore);
      return objects;
    });

    const { rows: cleanupRows } = await client.query(
      `SELECT
         NOT EXISTS (
           SELECT 1 FROM pg_trigger
           WHERE "tgname" = $1 AND "tgrelid" = '"core"."role_definition_audit"'::regclass
         ) AS trigger_removed,
         NOT EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n."oid" = p."pronamespace"
           WHERE n."nspname" = 'core' AND p."proname" = $2
         ) AS function_removed`,
      [testObjects.triggerName, testObjects.functionName],
    );
    assert.deepEqual(Object.values(cleanupRows[0]), [true, true]);
  });

  await t.test("SYSTEM definitions cannot be revised by the Organization service", async () => {
    systemRoleId = await insertSystemRole();
    await assertDefinitionError(
      reviseRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: systemRoleId,
      }),
      "ROLE_DEFINITION_NOT_CUSTOM",
    );
  });

  await t.test("database constraints enforce ownership, scope, and contiguous family versions", async () => {
    const familyId = randomUUID();
    const customId = randomUUID();
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, 'd8-invalid-system-owner', 1, 'SYSTEM', 'ORGANIZATION', $2, NOW())`,
      [randomUUID(), fixture.organizationAId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "updated_at")
       VALUES ($1, $2, 'd8-missing-owner', 1, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', NOW())`,
      [randomUUID(), randomUUID()],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-system-family', 1, 'SYSTEM', 'ORGANIZATION', NULL, NOW())`,
      [randomUUID(), randomUUID()],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, NULL, 'd8-custom-family-missing', 1, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $2, NOW())`,
      [randomUUID(), fixture.organizationAId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-platform-custom', 1, 'ORGANIZATION_CUSTOM', 'PLATFORM', $3, NOW())`,
      [randomUUID(), randomUUID(), fixture.organizationAId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-version-gap', 2, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $3, NOW())`,
      [randomUUID(), randomUUID(), fixture.organizationAId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-nonpositive-version', 0, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $3, NOW())`,
      [randomUUID(), randomUUID(), fixture.organizationAId],
    ));

    await client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-raw-family', 1, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $3, NOW())`,
      [customId, familyId, fixture.organizationAId],
    );
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-owner-switch', 2, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $3, NOW())`,
      [randomUUID(), familyId, fixture.organizationBId],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "role_family_id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, $2, 'd8-version-gap', 3, 'ORGANIZATION_CUSTOM', 'ORGANIZATION', $3, NOW())`,
      [randomUUID(), familyId, fixture.organizationAId],
    ));
  });

  await t.test("custom revisions and their create/revise audit are append-only", async () => {
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_definition" SET "code" = 'd8-rewritten' WHERE "id" = $1`,
      [customRoleA.id],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."role_definition" WHERE "id" = $1`,
      [customRoleA.id],
    ));
    const { rows } = await client.query(
      `SELECT "id" FROM "core"."role_definition_audit"
       WHERE "role_definition_id" = $1 ORDER BY "version" LIMIT 1`,
      [customRoleA.id],
    );
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_definition_audit" SET "code" = 'd8-rewritten' WHERE "id" = $1`,
      [rows[0].id],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."role_definition_audit" WHERE "id" = $1`,
      [rows[0].id],
    ));
  });
});
