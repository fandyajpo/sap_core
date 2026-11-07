import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import {
  createRoleAssignmentService,
  RoleAssignmentError,
} from "../src/lib/role-assignment-service.ts";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the D7 integration suite.");
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
    "D7 tests refuse non-disposable targets; use the local docker-compose database at localhost:5433/sap_core.",
  );
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const fixture = {
  actorId: randomUUID(),
  subjectId: randomUUID(),
  organizationId: randomUUID(),
  companyId: randomUUID(),
  plantId: randomUUID(),
  organizationMembershipId: randomUUID(),
  companyMembershipId: randomUUID(),
  plantAssignmentId: randomUUID(),
  unusedRoleDefinitionId: randomUUID(),
  roleDefinitions: {
    ORGANIZATION: randomUUID(),
    COMPANY: randomUUID(),
    PLANT: randomUUID(),
    PLATFORM: randomUUID(),
  },
};

let client;
let transactionOpen = false;
let savepointCounter = 0;
let allowGrant = true;
let allowBreakGlassUse = true;

function createSession(databaseClient) {
  return {
    async query(statement, values = []) {
      const result = await databaseClient.query(statement, values);
      return result.rows;
    },
  };
}

const database = {
  ...createSession({
    query: (...args) => client.query(...args),
  }),
  async transaction(work) {
    const savepoint = `d7_service_${++savepointCounter}`;
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

const roleAssignments = createRoleAssignmentService(database, {
  async authorizeGrant() {
    return allowGrant;
  },
  async authorizeBreakGlassUse() {
    return allowBreakGlassUse;
  },
});

async function assertDomainError(operation, code) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof RoleAssignmentError);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertDatabaseRejects(operation) {
  const savepoint = `d7_expected_failure_${++savepointCounter}`;
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

before(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query("SELECT 1");

  const { rows: tableRows } = await client.query(`
    SELECT
      to_regclass('"core"."user"') IS NOT NULL AS auth_user,
      to_regclass('"core"."organization_membership"') IS NOT NULL AS organization_membership,
      to_regclass('"core"."company_membership"') IS NOT NULL AS company_membership,
      to_regclass('"core"."plant_assignment"') IS NOT NULL AS plant_assignment,
      to_regclass('"core"."organization_role_assignment"') IS NOT NULL AS organization_role_assignment,
      to_regclass('"core"."company_role_assignment"') IS NOT NULL AS company_role_assignment,
      to_regclass('"core"."plant_role_assignment"') IS NOT NULL AS plant_role_assignment,
      to_regclass('"core"."break_glass_access_audit"') IS NOT NULL AS break_glass_access_audit
  `);
  assert.deepEqual(Object.values(tableRows[0]), Array(8).fill(true), "the D7 migration must be applied");

  await client.query(
    `INSERT INTO "core"."user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES
       ($1, 'D7 actor fixture', $2, false, NOW(), NOW()),
       ($3, 'D7 subject fixture', $4, false, NOW(), NOW())`,
    [fixture.actorId, `d7-${fixture.actorId}@example.test`, fixture.subjectId, `d7-${fixture.subjectId}@example.test`],
  );
  await client.query(
    `INSERT INTO "core"."organization" ("id", "updated_at") VALUES ($1, NOW())`,
    [fixture.organizationId],
  );
  await client.query(
    `INSERT INTO "core"."company" ("id", "organizationId", "updated_at") VALUES ($1, $2, NOW())`,
    [fixture.companyId, fixture.organizationId],
  );
  await client.query(
    `INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "updated_at") VALUES ($1, $2, $3, NOW())`,
    [fixture.plantId, fixture.organizationId, fixture.companyId],
  );
  await client.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "updated_at") VALUES ($1, $2, $3, 'ACTIVE', NOW())`,
    [fixture.organizationMembershipId, fixture.subjectId, fixture.organizationId],
  );
  await client.query(
    `INSERT INTO "core"."company_membership"
       ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "updated_at")
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())`,
    [fixture.companyMembershipId, fixture.subjectId, fixture.organizationMembershipId, fixture.organizationId, fixture.companyId],
  );
  await client.query(
    `INSERT INTO "core"."plant_assignment"
       ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "updated_at")
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW())`,
    [fixture.plantAssignmentId, fixture.subjectId, fixture.companyMembershipId, fixture.organizationId, fixture.companyId, fixture.plantId],
  );

  for (const [scope, id] of Object.entries(fixture.roleDefinitions)) {
    await client.query(
      `INSERT INTO "core"."role_definition"
         ("id", "code", "version", "kind", "scope", "updated_at")
       VALUES ($1, $2, 1, 'SYSTEM', $3::"core"."RoleScope", NOW())`,
      [id, `d7-fixture-${scope.toLowerCase()}-${id}`, scope],
    );
  }
  await client.query(
    `INSERT INTO "core"."role_definition"
       ("id", "code", "version", "kind", "scope", "updated_at")
     VALUES ($1, $2, 1, 'SYSTEM', 'ORGANIZATION'::"core"."RoleScope", NOW())`,
    [fixture.unusedRoleDefinitionId, `d7-fixture-unused-${fixture.unusedRoleDefinitionId}`],
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

test("D7 role assignments enforce typed scope, explicit inheritance, break-glass accountability, and history", async (t) => {
  let organizationRole;
  let companyRole;
  let plantRole;
  let breakGlassRole;

  await t.test("ordinary grants attach only to matching typed parents", async () => {
    organizationRole = await roleAssignments.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId: fixture.organizationMembershipId,
      roleDefinitionId: fixture.roleDefinitions.ORGANIZATION,
      actorUserId: fixture.actorId,
    });
    assert.equal(organizationRole.scope, "ORGANIZATION");
    assert.equal(organizationRole.parentId, fixture.organizationMembershipId);
    assert.equal(organizationRole.grantActorUserId, fixture.actorId);

    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
      }),
      [],
      "organization roles must not flow automatically into company scope",
    );
    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "PLANT",
        parentId: fixture.plantAssignmentId,
      }),
      [],
      "organization roles must not flow automatically into plant scope",
    );

    companyRole = await roleAssignments.grantRoleAssignment({
      scope: "COMPANY",
      parentId: fixture.companyMembershipId,
      roleDefinitionId: fixture.roleDefinitions.COMPANY,
      actorUserId: fixture.actorId,
    });
    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "PLANT",
        parentId: fixture.plantAssignmentId,
      }),
      [],
      "company roles must not flow automatically into plant scope",
    );
    plantRole = await roleAssignments.grantRoleAssignment({
      scope: "PLANT",
      parentId: fixture.plantAssignmentId,
      roleDefinitionId: fixture.roleDefinitions.PLANT,
      actorUserId: fixture.actorId,
    });

    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
      })).map((assignment) => assignment.id),
      [companyRole.id],
    );
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "PLANT",
        parentId: fixture.plantAssignmentId,
      })).map((assignment) => assignment.id),
      [plantRole.id],
    );
    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.actorId,
        scope: "ORGANIZATION",
        parentId: fixture.organizationMembershipId,
      }),
      [],
      "a human User without a matching membership cannot inherit another principal's roles",
    );
  });

  await t.test("scope and parent mismatches fail closed, including the platform boundary", async () => {
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: fixture.organizationMembershipId,
        roleDefinitionId: fixture.roleDefinitions.COMPANY,
        actorUserId: fixture.actorId,
      }),
      "SCOPE_MISMATCH",
    );
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: fixture.organizationMembershipId,
        roleDefinitionId: fixture.roleDefinitions.PLATFORM,
        actorUserId: fixture.actorId,
      }),
      "SCOPE_NOT_ASSIGNABLE",
    );
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: fixture.companyMembershipId,
        roleDefinitionId: fixture.roleDefinitions.ORGANIZATION,
        actorUserId: fixture.actorId,
      }),
      "SCOPE_PARENT_NOT_FOUND",
    );
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "ORGANIZATION",
        parentId: fixture.organizationMembershipId,
        roleDefinitionId: fixture.roleDefinitions.ORGANIZATION,
        actorUserId: `service:${randomUUID()}`,
      }),
      "ACTOR_NOT_FOUND",
    );

    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."company_role_assignment"
         ("id", "companyMembershipId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'COMPANY'::"core"."RoleScope")`,
      [randomUUID(), fixture.companyMembershipId, fixture.roleDefinitions.ORGANIZATION],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."company_role_assignment"
         ("id", "companyMembershipId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'ORGANIZATION'::"core"."RoleScope")`,
      [randomUUID(), fixture.companyMembershipId, fixture.roleDefinitions.COMPANY],
    ));
    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."organization_role_assignment"
         ("id", "organizationMembershipId", "roleDefinitionId", "role_scope")
       VALUES ($1, $2, $3, 'ORGANIZATION'::"core"."RoleScope")`,
      [randomUUID(), fixture.companyMembershipId, fixture.roleDefinitions.ORGANIZATION],
    ));
  });

  await t.test("role grants require an injected authorization decision", async () => {
    allowGrant = false;
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
        roleDefinitionId: fixture.roleDefinitions.COMPANY,
        actorUserId: fixture.actorId,
      }),
      "AUTHORIZATION_DENIED",
    );
    allowGrant = true;
  });

  await t.test("break-glass grants and use require a human actor, reason, authorization, and append-only audit", async () => {
    await assertDomainError(
      roleAssignments.grantRoleAssignment({
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
        roleDefinitionId: fixture.roleDefinitions.COMPANY,
        actorUserId: fixture.actorId,
        breakGlass: { reason: "   " },
      }),
      "INVALID_INPUT",
    );

    await assertDatabaseRejects(() => client.query(
      `INSERT INTO "core"."company_role_assignment"
         ("id", "companyMembershipId", "roleDefinitionId", "role_scope", "is_break_glass")
       VALUES ($1, $2, $3, 'COMPANY'::"core"."RoleScope", TRUE)`,
      [randomUUID(), fixture.companyMembershipId, fixture.roleDefinitions.COMPANY],
    ));

    breakGlassRole = await roleAssignments.grantRoleAssignment({
      scope: "COMPANY",
      parentId: fixture.companyMembershipId,
      roleDefinitionId: fixture.roleDefinitions.COMPANY,
      actorUserId: fixture.actorId,
      breakGlass: { reason: "Urgent scoped incident investigation" },
    });
    assert.equal(breakGlassRole.isBreakGlass, true);
    assert.equal(breakGlassRole.grantActorUserId, fixture.actorId);
    assert.equal(breakGlassRole.breakGlassReason, "Urgent scoped incident investigation");
    assert.deepEqual(
      (await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
      })).map((assignment) => assignment.id),
      [companyRole.id],
      "break-glass grants do not silently enter ordinary role resolution",
    );

    await assertDomainError(
      roleAssignments.recordBreakGlassUse({
        scope: "COMPANY",
        scopeParentId: fixture.companyMembershipId,
        roleAssignmentId: breakGlassRole.id,
        actorUserId: fixture.actorId,
        reason: "   ",
      }),
      "INVALID_INPUT",
    );
    const { rows: beforeDeniedAudit } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."break_glass_access_audit"`,
    );
    allowBreakGlassUse = false;
    await assertDomainError(
      roleAssignments.recordBreakGlassUse({
        scope: "COMPANY",
        scopeParentId: fixture.companyMembershipId,
        roleAssignmentId: breakGlassRole.id,
        actorUserId: fixture.actorId,
        reason: "Urgent scoped incident investigation",
      }),
      "BREAK_GLASS_ACCESS_DENIED",
    );
    allowBreakGlassUse = true;
    const { rows: afterDeniedAudit } = await client.query(
      `SELECT COUNT(*)::int AS count FROM "core"."break_glass_access_audit"`,
    );
    assert.equal(afterDeniedAudit[0].count, beforeDeniedAudit[0].count);

    const audit = await roleAssignments.recordBreakGlassUse({
      scope: "COMPANY",
      scopeParentId: fixture.companyMembershipId,
      roleAssignmentId: breakGlassRole.id,
      actorUserId: fixture.actorId,
      reason: "Urgent scoped incident investigation",
    });
    assert.equal(audit.actorUserId, fixture.actorId);
    assert.equal(audit.roleAssignmentId, breakGlassRole.id);
    assert.equal(audit.scope, "COMPANY");
    assert.equal(audit.scopeParentId, fixture.companyMembershipId);
    assert.equal(audit.reason, "Urgent scoped incident investigation");

    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."break_glass_access_audit" SET "reason" = 'rewritten' WHERE "id" = $1`,
      [audit.id],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."break_glass_access_audit" WHERE "id" = $1`,
      [audit.id],
    ));
    await assertDomainError(
      roleAssignments.recordBreakGlassUse({
        scope: "PLANT",
        scopeParentId: fixture.plantAssignmentId,
        roleAssignmentId: breakGlassRole.id,
        actorUserId: fixture.actorId,
        reason: "Wrong-scope use",
      }),
      "ROLE_ASSIGNMENT_NOT_ACTIVE",
    );
  });

  await t.test("active parents and D14 history restrictions remain authoritative", async () => {
    await client.query(
      `UPDATE "core"."organization_membership" SET "status" = 'SUSPENDED' WHERE "id" = $1`,
      [fixture.organizationMembershipId],
    );
    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "ORGANIZATION",
        parentId: fixture.organizationMembershipId,
      }),
      [],
    );
    await assertDomainError(
      roleAssignments.recordBreakGlassUse({
        scope: "COMPANY",
        scopeParentId: fixture.companyMembershipId,
        roleAssignmentId: breakGlassRole.id,
        actorUserId: fixture.actorId,
        reason: "Parent membership is suspended",
      }),
      "ROLE_ASSIGNMENT_NOT_ACTIVE",
    );
    await client.query(
      `UPDATE "core"."organization_membership" SET "status" = 'ACTIVE' WHERE "id" = $1`,
      [fixture.organizationMembershipId],
    );

    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."company_role_assignment" WHERE "id" = $1`,
      [companyRole.id],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."company_role_assignment" SET "id" = $2 WHERE "id" = $1`,
      [companyRole.id, randomUUID()],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."role_definition" SET "id" = $2 WHERE "id" = $1`,
      [fixture.unusedRoleDefinitionId, randomUUID()],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."role_definition" WHERE "id" = $1`,
      [fixture.roleDefinitions.ORGANIZATION],
    ));
    await assertDatabaseRejects(() => client.query(
      `DELETE FROM "core"."organization_membership" WHERE "id" = $1`,
      [fixture.organizationMembershipId],
    ));
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."organization_membership" SET "id" = $2 WHERE "id" = $1`,
      [fixture.organizationMembershipId, randomUUID()],
    ));

    await client.query(
      `UPDATE "core"."company_role_assignment" SET "revoked_at" = NOW() WHERE "id" = $1`,
      [companyRole.id],
    );
    assert.deepEqual(
      await roleAssignments.listEffectiveRoleAssignments({
        userId: fixture.subjectId,
        scope: "COMPANY",
        parentId: fixture.companyMembershipId,
      }),
      [],
    );
    const { rows } = await client.query(
      `SELECT "id", "revoked_at" FROM "core"."company_role_assignment" WHERE "id" = $1`,
      [companyRole.id],
    );
    assert.equal(rows.length, 1, "revoked Role Assignment history must remain stored");
    assert.ok(rows[0].revoked_at instanceof Date);
    await assertDatabaseRejects(() => client.query(
      `UPDATE "core"."company_role_assignment" SET "revoked_at" = NULL WHERE "id" = $1`,
      [companyRole.id],
    ));
  });
});
