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
  !localHosts.has(parsedDatabaseURL.hostname) ||
  parsedDatabaseURL.port !== "5433" ||
  databaseName !== "sap_core"
) {
  throw new Error(
    "D8 tests refuse non-disposable targets; use the local docker-compose database at localhost:5433/sap_core.",
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
let allowCreate = true;
let allowRevise = true;
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
    const savepoint = `d8_service_${++savepointCounter}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await work(createSession(client));
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      throw error;
    }
  },
};

const roleDefinitions = createRoleDefinitionService(database, {
  async authorizeCreate(input) {
    authorizationCalls.push({ operation: "CREATE", ...input });
    return allowCreate;
  },
  async authorizeRevise(input) {
    authorizationCalls.push({ operation: "REVISE", ...input });
    return allowRevise;
  },
});

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

async function insertSystemRole() {
  const id = randomUUID();
  await client.query(
    `INSERT INTO "core"."role_definition"
       ("id", "code", "version", "kind", "scope", "updated_at")
     VALUES ($1, $2, 1, 'SYSTEM'::"core"."RoleDefinitionKind",
             'ORGANIZATION'::"core"."RoleScope", NOW())`,
    [id, `d8-system-${id}`],
  );
  return id;
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
  let customCompanyRoleB;
  let customPlantRoleA;
  let customPlantRoleB;
  let systemRoleId;
  let assignedRole;
  let assignedCompanyRole;
  let assignedPlantRole;

  await t.test("create rejects missing human actors and Organizations", async () => {
    await assertDefinitionError(
      roleDefinitions.createCustomRole({
        actorUserId: `missing:${randomUUID()}`,
        organizationId: fixture.organizationAId,
        code: "d8.missing-actor",
        scope: "ORGANIZATION",
      }),
      "ACTOR_NOT_FOUND",
    );
    await assertDefinitionError(
      roleDefinitions.createCustomRole({
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
      /Organization custom-role create and revise authorization policies are required\./,
    );
    const before = await auditCount();
    allowCreate = false;
    await assertDefinitionError(
      roleDefinitions.createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.denied-create",
        scope: "ORGANIZATION",
      }),
      "AUTHORIZATION_DENIED",
    );
    allowCreate = true;
    assert.equal(await auditCount(), before, "a denied create must not persist an audit event");

    await assertDefinitionError(
      roleDefinitions.createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "   ",
        scope: "ORGANIZATION",
      }),
      "INVALID_INPUT",
    );
    await assertDefinitionError(
      roleDefinitions.createCustomRole({
        actorUserId: fixture.actorId,
        organizationId: fixture.organizationAId,
        code: "d8.platform-role",
        scope: "PLATFORM",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );

    customRoleA = await roleDefinitions.createCustomRole({
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

    customRoleB = await roleDefinitions.createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationBId,
      code: "d8.other-tenant-role",
      scope: "ORGANIZATION",
    });
    customCompanyRoleA = await roleDefinitions.createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationAId,
      code: "d8.company-reader",
      scope: "COMPANY",
    });
    customCompanyRoleB = await roleDefinitions.createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationBId,
      code: "d8.other-company-role",
      scope: "COMPANY",
    });
    customPlantRoleA = await roleDefinitions.createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationAId,
      code: "d8.plant-reader",
      scope: "PLANT",
    });
    customPlantRoleB = await roleDefinitions.createCustomRole({
      actorUserId: fixture.actorId,
      organizationId: fixture.organizationBId,
      code: "d8.other-plant-role",
      scope: "PLANT",
    });
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
    await assertAssignmentError(
      roleAssignments.grantRoleAssignment({
        scope: "COMPANY",
        parentId: fixture.companyMembershipAId,
        roleDefinitionId: customCompanyRoleB.id,
        actorUserId: fixture.actorId,
      }),
      "ROLE_DEFINITION_OWNER_MISMATCH",
    );
    await assertAssignmentError(
      roleAssignments.grantRoleAssignment({
        scope: "PLANT",
        parentId: fixture.plantAssignmentAId,
        roleDefinitionId: customPlantRoleB.id,
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
      roleDefinitionId: customCompanyRoleA.id,
      actorUserId: fixture.actorId,
    });
    assignedPlantRole = await roleAssignments.grantRoleAssignment({
      scope: "PLANT",
      parentId: fixture.plantAssignmentAId,
      roleDefinitionId: customPlantRoleA.id,
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
    await client.query(
      `INSERT INTO "core"."company_role_assignment"
         ("id", "companyMembershipId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'COMPANY'::"core"."RoleScope")`,
      [randomUUID(), fixture.companyMembershipAId, customCompanyRoleB.id],
    );
    await client.query(
      `INSERT INTO "core"."plant_role_assignment"
         ("id", "plantAssignmentId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'PLANT'::"core"."RoleScope")`,
      [randomUUID(), fixture.plantAssignmentAId, customPlantRoleB.id],
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
      roleDefinitions.reviseCustomRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleA.id,
        code: "d8.denied-revision",
      }),
      "AUTHORIZATION_DENIED",
    );
    allowRevise = true;
    assert.equal(await auditCount(), beforeDenied);

    const revision = await roleDefinitions.reviseCustomRole({
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
      roleDefinitions.reviseCustomRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleA.id,
      }),
      "ROLE_DEFINITION_VERSION_CONFLICT",
    );
    await assertDefinitionError(
      roleDefinitions.reviseCustomRole({
        actorUserId: fixture.actorId,
        roleDefinitionId: customRoleB.id,
        scope: "PLATFORM",
      }),
      "ROLE_SCOPE_NOT_ALLOWED",
    );
  });

  await t.test("SYSTEM definitions cannot be revised by the Organization service", async () => {
    systemRoleId = await insertSystemRole();
    await assertDefinitionError(
      roleDefinitions.reviseCustomRole({
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
         ("id", "code", "version", "kind", "scope", "ownerOrganizationId", "updated_at")
       VALUES ($1, 'd8-system-family', 1, 'SYSTEM', 'ORGANIZATION', NULL, NOW())`,
      [randomUUID()],
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
