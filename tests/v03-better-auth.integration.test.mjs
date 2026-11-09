import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const authBaseURL = process.env.BETTER_AUTH_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the V03 integration suite.");
}

if (!authBaseURL) {
  throw new Error("BETTER_AUTH_URL is required to run the V03 integration suite.");
}

const parsedDatabaseURL = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseURL.pathname.slice(1));
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.V03_ALLOW_DISPOSABLE_DB !== "1" ||
  !localHosts.has(parsedDatabaseURL.hostname) ||
  parsedDatabaseURL.port !== "55432" ||
  databaseName !== "sap_core_v03_test"
) {
  throw new Error(
    "V03 tests require explicit disposable DB approval and localhost:55432/sap_core_v03_test.",
  );
}

const authURL = authBaseURL.replace(/\/+$/, "");
const authOrigin = new URL(authBaseURL).origin;
const testPrefix = `v03-${randomUUID()}-`;
const tenantFixtureOrganizationIds = [];
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const requiredSchemas = [
  "core",
  "master_data",
  "procurement",
  "inventory",
  "sales",
  "finance",
  "production",
  "human_resources",
  "integration",
  "system",
];
let schemaReady = false;

async function readJson(response, label) {
  const text = await response.text();
  assert.ok(
    response.ok,
    `${label} returned HTTP ${response.status}: ${text.slice(0, 500)}`,
  );
  return text ? JSON.parse(text) : null;
}

function authRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: authOrigin };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (cookie) {
    headers.cookie = cookie;
  }

  return fetch(`${authURL}/api/auth${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookieFromResponse(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") ?? ""];

  return cookies
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

async function insertTestUser(email) {
  const userId = randomUUID();
  await pool.query(
    `INSERT INTO "core"."user"
       ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, NOW(), NOW())`,
    [userId, "V03 FK fixture", email],
  );
  return userId;
}

before(async () => {
  await pool.query("SELECT 1");

  const { rows: schemaRows } = await pool.query(
    `SELECT schema_name
     FROM information_schema.schemata
     WHERE schema_name = ANY($1::text[])`,
    [requiredSchemas],
  );
  assert.deepEqual(
    schemaRows.map((row) => row.schema_name).sort(),
    [...requiredSchemas].sort(),
    "V01 schemas must remain present",
  );

  const { rows: tableRows } = await pool.query(`
    SELECT
      to_regclass('"core"."validation_records"') IS NOT NULL AS validation_records,
      to_regclass('"master_data"."validation_references"') IS NOT NULL AS validation_references,
      to_regclass('"core"."user"') IS NOT NULL AS auth_user,
      to_regclass('"core"."session"') IS NOT NULL AS auth_session,
      to_regclass('"core"."account"') IS NOT NULL AS auth_account,
      to_regclass('"core"."verification"') IS NOT NULL AS auth_verification
  `);
  assert.deepEqual(
    Object.values(tableRows[0]),
    [true, true, true, true, true, true],
    "V01/V02 fixtures and all V03 identity tables must exist",
  );
  schemaReady = true;
});

after(async () => {
  const cleanupErrors = [];

  try {
    if (schemaReady) {
      const ownedEmailPattern = `${testPrefix}%`;
      if (tenantFixtureOrganizationIds.length > 0) {
        // Role-assignment history is append-only. Revoke and suspend the test
        // fixtures instead of deleting tenant principals; this suite runs only
        // against its guarded disposable PostgreSQL database.
        await pool.query(
          `UPDATE "core"."organization_role_assignment"
              SET "revoked_at" = NOW()
            WHERE "revoked_at" IS NULL
              AND "organizationMembershipId" IN (
                SELECT "id" FROM "core"."organization_membership"
                WHERE "organizationId" = ANY($1::uuid[])
              )`,
          [tenantFixtureOrganizationIds],
        );
        await pool.query(
          `UPDATE "core"."company_role_assignment"
              SET "revoked_at" = NOW()
            WHERE "revoked_at" IS NULL
              AND "companyMembershipId" IN (
                SELECT "id" FROM "core"."company_membership"
                WHERE "organizationId" = ANY($1::uuid[])
              )`,
          [tenantFixtureOrganizationIds],
        );
        await pool.query(
          `UPDATE "core"."plant_role_assignment"
              SET "revoked_at" = NOW()
            WHERE "revoked_at" IS NULL
              AND "plantAssignmentId" IN (
                SELECT "id" FROM "core"."plant_assignment"
                WHERE "organizationId" = ANY($1::uuid[])
              )`,
          [tenantFixtureOrganizationIds],
        );
        await pool.query(
          `UPDATE "core"."plant_assignment"
              SET "status" = 'SUSPENDED'::"core"."ScopedAccessStatus"
            WHERE "organizationId" = ANY($1::uuid[])`,
          [tenantFixtureOrganizationIds],
        );
        await pool.query(
          `UPDATE "core"."company_membership"
              SET "status" = 'SUSPENDED'::"core"."ScopedAccessStatus"
            WHERE "organizationId" = ANY($1::uuid[])`,
          [tenantFixtureOrganizationIds],
        );
        await pool.query(
          `UPDATE "core"."organization_membership"
              SET "status" = 'SUSPENDED'::"core"."OrganizationMembershipStatus"
            WHERE "organizationId" = ANY($1::uuid[])`,
          [tenantFixtureOrganizationIds],
        );
      }

      await pool.query(
        `UPDATE "core"."permission_definition" SET "is_delegable" = FALSE WHERE "code" = 'organization.read'`,
      );

      const cleanupQueries = [
        `DELETE FROM "core"."session"
         WHERE "userId" IN (
           SELECT "id" FROM "core"."user" WHERE "email" LIKE $1
         )`,
        `DELETE FROM "core"."account"
         WHERE "userId" IN (
           SELECT "id" FROM "core"."user" WHERE "email" LIKE $1
         )`,
        'DELETE FROM "core"."verification" WHERE "identifier" LIKE $1',
        `DELETE FROM "core"."user" u
          WHERE u."email" LIKE $1
            AND NOT EXISTS (
              SELECT 1 FROM "core"."organization_membership" om WHERE om."userId" = u."id"
            )`,
      ];

      for (const query of cleanupQueries) {
        try {
          await pool.query(query, [ownedEmailPattern]);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "V03 fixture cleanup failed.");
    }
  } finally {
    await pool.end();
  }
});

test("V03 Better Auth identity integration and V01/V02 regression", async (t) => {
  await t.test("authentication pages and protected home route", async () => {
    const homeResponse = await fetch(`${authURL}/`, { redirect: "manual" });
    assert.equal(homeResponse.status, 307, "anonymous home access must redirect");
    const location = homeResponse.headers.get("location");
    assert.ok(location, "anonymous home redirect must include a location");
    assert.equal(new URL(location, authURL).pathname, "/sign-in");

    const accountResponse = await fetch(`${authURL}/account`, { redirect: "manual" });
    assert.equal(accountResponse.status, 307, "anonymous account access must redirect");
    const accountLocation = accountResponse.headers.get("location");
    assert.ok(accountLocation, "anonymous account redirect must include a location");
    assert.equal(new URL(accountLocation, authURL).pathname, "/sign-in");

    const signInPageResponse = await fetch(`${authURL}/sign-in`);
    assert.equal(signInPageResponse.status, 200);
    assert.match(await signInPageResponse.text(), /Welcome back/);

    const registerPageResponse = await fetch(`${authURL}/register`);
    assert.equal(registerPageResponse.status, 200);
    assert.match(await registerPageResponse.text(), /Create your account/);
  });

  await t.test("V01/V02 ten-schema and cross-schema relation regression", async () => {
    const recordId = randomUUID();
    const referenceId = randomUUID();

    try {
      await pool.query(
        'INSERT INTO "core"."validation_records" ("id", "label") VALUES ($1, $2)',
        [recordId, `${testPrefix}record`],
      );
      await pool.query(
        `INSERT INTO "master_data"."validation_references"
           ("id", "validation_record_id", "label")
         VALUES ($1, $2, $3)`,
        [referenceId, recordId, `${testPrefix}reference`],
      );

      const { rows } = await pool.query(
        `SELECT r."id", v."id" AS "recordId"
         FROM "master_data"."validation_references" r
         JOIN "core"."validation_records" v
           ON v."id" = r."validation_record_id"
         WHERE r."id" = $1`,
        [referenceId],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].recordId, recordId);

      await pool.query('DELETE FROM "core"."validation_records" WHERE "id" = $1', [
        recordId,
      ]);
      const { rows: remainingReferences } = await pool.query(
        'SELECT "id" FROM "master_data"."validation_references" WHERE "id" = $1',
        [referenceId],
      );
      assert.equal(remainingReferences.length, 0, "V02 cascade must remain intact");
    } finally {
      await pool.query('DELETE FROM "core"."validation_records" WHERE "id" = $1', [
        recordId,
      ]);
      await pool.query(
        'DELETE FROM "master_data"."validation_references" WHERE "id" = $1',
        [referenceId],
      );
    }
  });

  await t.test("session FK independently restricts principal deletion", async () => {
    const userId = await insertTestUser(`${testPrefix}session-restrict@example.test`);
    const sessionId = randomUUID();
    await pool.query(
      `INSERT INTO "core"."session"
         ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
       VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
      [sessionId, new Date(Date.now() + 60_000), randomUUID(), userId],
    );

    await assert.rejects(
      pool.query('DELETE FROM "core"."user" WHERE "id" = $1', [userId]),
      (error) => error?.code === "23503",
      "a session alone must prevent principal deletion",
    );
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM "core"."user" WHERE "id" = $1) AS users,
         (SELECT COUNT(*) FROM "core"."session" WHERE "id" = $2) AS sessions`,
      [userId, sessionId],
    );
    assert.equal(Number(rows[0].users), 1);
    assert.equal(Number(rows[0].sessions), 1);
  });

  await t.test("account FK independently restricts principal deletion", async () => {
    const userId = await insertTestUser(`${testPrefix}account-restrict@example.test`);
    const accountId = randomUUID();
    await pool.query(
      `INSERT INTO "core"."account"
         ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [accountId, randomUUID(), "v03-account-restrict", userId],
    );

    await assert.rejects(
      pool.query('DELETE FROM "core"."user" WHERE "id" = $1', [userId]),
      (error) => error?.code === "23503",
      "an account alone must prevent principal deletion",
    );
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM "core"."user" WHERE "id" = $1) AS users,
         (SELECT COUNT(*) FROM "core"."account" WHERE "id" = $2) AS accounts`,
      [userId, accountId],
    );
    assert.equal(Number(rows[0].users), 1);
    assert.equal(Number(rows[0].accounts), 1);
  });

  await t.test(
    "Better Auth signup, account profile isolation, identity persistence, account unlink, disabled hard-delete, and sign-out",
    async () => {
      const email = `${testPrefix}auth@example.test`;
      const password = `${randomUUID()}Aa1!`;
      const signupResponse = await authRequest("/sign-up/email", {
        method: "POST",
        body: { name: "V03 Initial Name", email, password },
      });
      const signupBody = await readJson(signupResponse, "email signup");
      const userId = signupBody?.user?.id;
      assert.equal(typeof userId, "string");

      const cookie = sessionCookieFromResponse(signupResponse);
      assert.match(cookie, /session_token=/, "signup must set a session cookie");

      const { rows: userRows } = await pool.query(
        `SELECT "id", "name", "email", "emailVerified"
         FROM "core"."user"
         WHERE "id" = $1`,
        [userId],
      );
      assert.equal(userRows.length, 1);
      assert.equal(userRows[0].email, email);
      assert.equal(userRows[0].emailVerified, false);

      const { rows: accountRows } = await pool.query(
        `SELECT a."id", a."accountId", a."providerId", a."userId", u."id" AS "relatedUserId"
         FROM "core"."account" a
         JOIN "core"."user" u ON u."id" = a."userId"
         WHERE a."userId" = $1`,
        [userId],
      );
      assert.equal(accountRows.length, 1);
      assert.equal(accountRows[0].providerId, "credential");
      assert.equal(accountRows[0].accountId, userId);
      assert.equal(accountRows[0].relatedUserId, userId);
      const credentialAccountId = accountRows[0].id;

      const { rows: sessionRows } = await pool.query(
        `SELECT s."id", s."userId", u."id" AS "relatedUserId"
         FROM "core"."session" s
         JOIN "core"."user" u ON u."id" = s."userId"
         WHERE s."userId" = $1`,
        [userId],
      );
      assert.equal(sessionRows.length, 1);
      assert.equal(sessionRows[0].relatedUserId, userId);
      const sessionId = sessionRows[0].id;

      const getSessionResponse = await authRequest("/get-session", { cookie });
      const activeSession = await readJson(getSessionResponse, "get session");
      assert.equal(activeSession?.user?.id, userId);
      assert.equal(activeSession?.session?.userId, userId);

      const organizationId = randomUUID();
      const companyId = randomUUID();
      const siblingCompanyId = randomUUID();
      const plantId = randomUUID();
      const siblingPlantId = randomUUID();
      tenantFixtureOrganizationIds.push(organizationId);
      const organizationMembershipId = randomUUID();
      const organizationRoleAssignmentId = randomUUID();
      await pool.query(
        `INSERT INTO "core"."organization" ("id", "created_at", "updated_at")
         VALUES ($1, NOW(), NOW())`,
        [organizationId],
      );
      await pool.query(
        `INSERT INTO "core"."company" ("id", "organizationId", "created_at", "updated_at")
         VALUES ($1, $2, NOW(), NOW()), ($3, $2, NOW(), NOW())`,
        [companyId, organizationId, siblingCompanyId],
      );
      await pool.query(
        `INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "created_at", "updated_at")
         VALUES ($1, $2, $3, NOW(), NOW()), ($4, $2, $5, NOW(), NOW())`,
        [plantId, organizationId, companyId, siblingPlantId, siblingCompanyId],
      );
      await pool.query(
        `INSERT INTO "core"."organization_membership"
           ("id", "userId", "organizationId", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW())`,
        [organizationMembershipId, userId, organizationId],
      );
      const { rows: ownerRoleRows } = await pool.query(
        `SELECT "id"::text AS "id" FROM "core"."role_definition"
          WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
            AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
            AND "code" = 'ORG_OWNER'`,
      );
      assert.equal(ownerRoleRows.length, 1, "the approved ORG_OWNER seed must exist");
      await pool.query(
        `INSERT INTO "core"."organization_role_assignment"
           ("id", "organizationMembershipId", "roleDefinitionId", "role_scope",
            "grant_actor_user_id", "is_break_glass", "created_at")
         VALUES ($1, $2, $3, 'ORGANIZATION'::"core"."RoleScope", $4, FALSE, NOW())`,
        [organizationRoleAssignmentId, organizationMembershipId, ownerRoleRows[0].id, userId],
      );

      const authorizedMembersResponse = await fetch(
        `${authURL}/api/organizations/${organizationId}/members`,
        { headers: { cookie } },
      );
      assert.equal(authorizedMembersResponse.status, 200);
      const authorizedMembers = await authorizedMembersResponse.json();
      assert.equal(authorizedMembers.organizationId, organizationId);
      assert.equal(authorizedMembers.members.length, 1);
      assert.equal(authorizedMembers.members[0].userId, userId);
      assert.equal(authorizedMembers.members[0].email, email);


      const updatedName = "V03 Updated Name";
      const updateResponse = await authRequest("/update-user", {
        method: "POST",
        cookie,
        body: { name: updatedName },
      });
      await readJson(updateResponse, "update user");

      const { rows: updatedUserRows } = await pool.query(
        'SELECT "name" FROM "core"."user" WHERE "id" = $1',
        [userId],
      );
      assert.equal(updatedUserRows[0]?.name, updatedName);

      const updatedProfileResponse = await fetch(`${authURL}/account`, {
        headers: { cookie },
      });
      assert.equal(updatedProfileResponse.status, 200);
      const updatedProfileHtml = await updatedProfileResponse.text();
      assert.ok(updatedProfileHtml.includes(updatedName));
      assert.ok(!updatedProfileHtml.includes("V03 Initial Name"));

      const secondEmail = `${testPrefix}second@example.test`;
      const secondSignupResponse = await authRequest("/sign-up/email", {
        method: "POST",
        body: { name: "V03 Second User Name", email: secondEmail, password },
      });
      await readJson(secondSignupResponse, "second email signup");
      const secondCookie = sessionCookieFromResponse(secondSignupResponse);
      assert.match(secondCookie, /session_token=/, "second signup must set a session cookie");

      const secondSession = await readJson(
        await authRequest("/get-session", { cookie: secondCookie }),
        "second get session",
      );
      const secondUserId = secondSession.user.id;
      const secondOrganizationMembershipId = randomUUID();
      const secondCompanyMembershipId = randomUUID();
      const secondPlantAssignmentId = randomUUID();
      await pool.query(
        `INSERT INTO "core"."organization_membership"
           ("id", "userId", "organizationId", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW())`,
        [secondOrganizationMembershipId, secondUserId, organizationId],
      );
      await pool.query(
        `INSERT INTO "core"."company_membership"
           ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), NOW())`,
        [secondCompanyMembershipId, secondUserId, secondOrganizationMembershipId, organizationId, companyId],
      );
      await pool.query(
        `INSERT INTO "core"."plant_assignment"
           ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', NOW(), NOW())`,
        [secondPlantAssignmentId, secondUserId, secondCompanyMembershipId, organizationId, companyId, plantId],
      );
      const { rows: companyMemberRoles } = await pool.query(
        `SELECT "id"::text AS "id" FROM "core"."role_definition"
         WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
           AND "scope" = 'COMPANY'::"core"."RoleScope" AND "code" = 'COMPANY_MEMBER'`,
      );
      const { rows: plantViewerRoles } = await pool.query(
        `SELECT "id"::text AS "id" FROM "core"."role_definition"
         WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
           AND "scope" = 'PLANT'::"core"."RoleScope" AND "code" = 'PLANT_VIEWER'`,
      );
      assert.equal(companyMemberRoles.length, 1);
      assert.equal(plantViewerRoles.length, 1);
      await pool.query(
        `INSERT INTO "core"."company_role_assignment"
           ("id", "companyMembershipId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
         VALUES ($1, $2, $3, 'COMPANY'::"core"."RoleScope", $4, FALSE)`,
        [randomUUID(), secondCompanyMembershipId, companyMemberRoles[0].id, userId],
      );
      await pool.query(
        `INSERT INTO "core"."plant_role_assignment"
           ("id", "plantAssignmentId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass")
         VALUES ($1, $2, $3, 'PLANT'::"core"."RoleScope", $4, FALSE)`,
        [randomUUID(), secondPlantAssignmentId, plantViewerRoles[0].id, userId],
      );

      const deniedMembersResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/members",
        { headers: { cookie: secondCookie } },
      );
      assert.equal(deniedMembersResponse.status, 403, "active membership without the required permission must be denied");

      const ownerCompanyResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + siblingCompanyId,
        { headers: { cookie } },
      );
      assert.equal(ownerCompanyResponse.status, 200, "Organization Owner may administer a verified descendant Company");
      assert.equal((await ownerCompanyResponse.json()).company.id, siblingCompanyId);

      const memberCompanyResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + companyId,
        { headers: { cookie: secondCookie } },
      );
      assert.equal(memberCompanyResponse.status, 200, "active Company Membership plus COMPANY_MEMBER permits exact Company read");
      assert.equal((await memberCompanyResponse.json()).company.id, companyId);

      const siblingCompanyDenied = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + siblingCompanyId,
        { headers: { cookie: secondCookie } },
      );
      assert.equal(siblingCompanyDenied.status, 403, "Company membership does not extend to a sibling Company");

      const ownerPlantResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + siblingCompanyId + "/plants/" + siblingPlantId,
        { headers: { cookie } },
      );
      assert.equal(ownerPlantResponse.status, 200, "Organization Owner may administer a verified descendant Plant");
      assert.equal((await ownerPlantResponse.json()).plant.id, siblingPlantId);

      const viewerPlantResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + companyId + "/plants/" + plantId,
        { headers: { cookie: secondCookie } },
      );
      assert.equal(viewerPlantResponse.status, 200, "active Plant Assignment plus PLANT_VIEWER permits exact Plant read");
      assert.equal((await viewerPlantResponse.json()).plant.id, plantId);

      const siblingPlantDenied = await fetch(
        authURL + "/api/organizations/" + organizationId + "/companies/" + siblingCompanyId + "/plants/" + siblingPlantId,
        { headers: { cookie: secondCookie } },
      );
      assert.equal(siblingPlantDenied.status, 403, "Plant assignment does not extend to a sibling Plant");

      const ownerRolesResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/roles",
        { headers: { cookie } },
      );
      assert.equal(ownerRolesResponse.status, 200);
      const ownerRoles = await ownerRolesResponse.json();
      assert.ok(ownerRoles.roles.some((role) => role.code === "ORG_OWNER"));

      const memberRolesResponse = await fetch(
        authURL + "/api/organizations/" + organizationId + "/roles",
        { headers: { cookie: secondCookie } },
      );
      assert.equal(memberRolesResponse.status, 403, "Company/Plant membership does not grant Organization role visibility");

      // Simulate an owner-approved delegable permission in this disposable fixture.
      await pool.query(
        `UPDATE "core"."permission_definition" SET "is_delegable" = TRUE WHERE "code" = 'organization.read'`,
      );

      const spoofedRoleCreate = await fetch(
        authURL + "/api/organizations/" + organizationId + "/roles",
        {
          method: "POST",
          headers: { cookie: secondCookie, "content-type": "application/json" },
          body: JSON.stringify({
            actorUserId: userId,
            code: "spoofed-" + randomUUID(),
            scope: "ORGANIZATION",
            permissions: ["organization.read"],
          }),
        },
      );
      assert.equal(spoofedRoleCreate.status, 403, "the API must ignore a browser-supplied actorUserId and use the verified session");

      const customRoleCode = "api-role-" + randomUUID();
      const customRoleCreate = await fetch(
        authURL + "/api/organizations/" + organizationId + "/roles",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({
            actorUserId: secondUserId,
            code: customRoleCode,
            scope: "ORGANIZATION",
            permissions: ["organization.read"],
          }),
        },
      );
      assert.equal(customRoleCreate.status, 201, await customRoleCreate.text());
      const createdCustomRole = await customRoleCreate.json();
      assert.equal(createdCustomRole.role.ownerOrganizationId, organizationId);
      assert.equal(createdCustomRole.role.version, 1);

      const customRoleRevision = await fetch(
        authURL + "/api/organizations/" + organizationId + "/roles/" + createdCustomRole.role.id + "/revisions",
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ code: customRoleCode + "-v2" }),
        },
      );
      assert.equal(customRoleRevision.status, 200, await customRoleRevision.text());
      const revisedCustomRole = await customRoleRevision.json();
      assert.equal(revisedCustomRole.role.version, 2);
      assert.equal(revisedCustomRole.role.code, customRoleCode + "-v2");

      await pool.query(
        `UPDATE "core"."permission_definition" SET "is_delegable" = FALSE WHERE "code" = 'organization.read'`,
      );

      const firstProfileResponse = await fetch(`${authURL}/account`, {
        headers: { cookie },
      });
      assert.equal(firstProfileResponse.status, 200);
      const firstProfileHtml = await firstProfileResponse.text();
      assert.ok(firstProfileHtml.includes(updatedName));
      assert.ok(firstProfileHtml.includes(email));
      assert.match(firstProfileHtml, /Email address:[\s\S]*not verified/);
      assert.ok(!firstProfileHtml.includes(userId), "the profile must not expose the user ID");
      assert.ok(!firstProfileHtml.includes("V03 Second User Name"));
      assert.ok(!firstProfileHtml.includes(secondEmail));

      const secondProfileResponse = await fetch(`${authURL}/account`, {
        headers: { cookie: secondCookie },
      });
      assert.equal(secondProfileResponse.status, 200);
      const secondProfileHtml = await secondProfileResponse.text();
      assert.ok(secondProfileHtml.includes("V03 Second User Name"));
      assert.ok(secondProfileHtml.includes(secondEmail));
      assert.match(secondProfileHtml, /Email address:[\s\S]*not verified/);
      assert.ok(!secondProfileHtml.includes(userId), "the profile must not expose another user ID");
      assert.ok(!secondProfileHtml.includes(updatedName));
      assert.ok(!secondProfileHtml.includes(email));

      const linkedAccountId = randomUUID();
      await pool.query(
        `INSERT INTO "core"."account"
           ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [linkedAccountId, randomUUID(), "v03-unlink-test", userId],
      );

      const foreignUserId = await insertTestUser(`${testPrefix}foreign@example.test`);
      const foreignAccountId = randomUUID();
      await pool.query(
        `INSERT INTO "core"."account"
           ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [foreignAccountId, randomUUID(), "v03-foreign-account", foreignUserId],
      );

      const unlinkResponse = await authRequest("/unlink-account", {
        method: "POST",
        cookie,
        body: { accountId: linkedAccountId },
      });
      await readJson(unlinkResponse, "unlink linked account");
      const { rows: unlinkedRows } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM "core"."account" WHERE "id" = $1) AS unlinked,
           (SELECT COUNT(*) FROM "core"."user" WHERE "id" = $2) AS users,
           (SELECT COUNT(*) FROM "core"."account" WHERE "id" = $3 AND "userId" = $2) AS credentials`,
        [linkedAccountId, userId, credentialAccountId],
      );
      assert.equal(Number(unlinkedRows[0].unlinked), 0);
      assert.equal(Number(unlinkedRows[0].users), 1);
      assert.equal(Number(unlinkedRows[0].credentials), 1);

      const foreignUnlinkResponse = await authRequest("/unlink-account", {
        method: "POST",
        cookie,
        body: { accountId: foreignAccountId },
      });
      const foreignUnlinkBody = await foreignUnlinkResponse.text();
      assert.equal(
        foreignUnlinkResponse.ok,
        false,
        `unlinking another user's account must fail: ${foreignUnlinkBody.slice(0, 500)}`,
      );
      const { rows: remainingForeignRows } = await pool.query(
        'SELECT "id", "userId" FROM "core"."account" WHERE "id" = $1',
        [foreignAccountId],
      );
      assert.equal(remainingForeignRows.length, 1);
      assert.equal(remainingForeignRows[0].userId, foreignUserId);

      const lastAccountResponse = await authRequest("/unlink-account", {
        method: "POST",
        cookie,
        body: { accountId: credentialAccountId },
      });
      const lastAccountBody = await lastAccountResponse.text();
      assert.equal(
        lastAccountResponse.ok,
        false,
        `unlinking the last account must fail: ${lastAccountBody.slice(0, 500)}`,
      );
      const { rows: remainingCredentialRows } = await pool.query(
        'SELECT "id" FROM "core"."account" WHERE "id" = $1 AND "userId" = $2',
        [credentialAccountId, userId],
      );
      assert.equal(remainingCredentialRows.length, 1);

      const deleteUserResponse = await authRequest("/delete-user", {
        method: "POST",
        cookie,
        body: {},
      });
      const deleteUserBody = await deleteUserResponse.text();
      assert.equal(
        deleteUserResponse.ok,
        false,
        `Better Auth hard deletion must be disabled: ${deleteUserBody.slice(0, 500)}`,
      );
      const { rows: preservedPrincipalRows } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM "core"."user" WHERE "id" = $1) AS users,
           (SELECT COUNT(*) FROM "core"."session" WHERE "id" = $2) AS sessions,
           (SELECT COUNT(*) FROM "core"."account" WHERE "id" = $3) AS accounts`,
        [userId, sessionId, credentialAccountId],
      );
      assert.equal(Number(preservedPrincipalRows[0].users), 1);
      assert.equal(Number(preservedPrincipalRows[0].sessions), 1);
      assert.equal(Number(preservedPrincipalRows[0].accounts), 1);

      const signoutResponse = await authRequest("/sign-out", {
        method: "POST",
        cookie,
        body: {},
      });
      await readJson(signoutResponse, "sign out");

      const { rows: revokedSessions } = await pool.query(
        'SELECT "id" FROM "core"."session" WHERE "id" = $1',
        [sessionId],
      );
      assert.equal(revokedSessions.length, 0, "sign-out must revoke the database session");

      const { rows: preservedAfterSignout } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM "core"."user" WHERE "id" = $1) AS users,
           (SELECT COUNT(*) FROM "core"."account" WHERE "id" = $2 AND "userId" = $1) AS accounts`,
        [userId, credentialAccountId],
      );
      assert.equal(Number(preservedAfterSignout[0].users), 1);
      assert.equal(Number(preservedAfterSignout[0].accounts), 1);

      const afterSignoutResponse = await authRequest("/get-session", { cookie });
      const afterSignout = await readJson(afterSignoutResponse, "get session after sign-out");
      assert.equal(afterSignout, null);

      const rejectedSignIn = await authRequest("/sign-in/email", {
        method: "POST",
        body: { email, password: `${password}-incorrect` },
      });
      assert.equal(rejectedSignIn.ok, false, "invalid credentials must not sign in");

      const signInResponse = await authRequest("/sign-in/email", {
        method: "POST",
        body: { email, password },
      });
      await readJson(signInResponse, "email sign-in");
      const signInCookie = sessionCookieFromResponse(signInResponse);
      assert.match(signInCookie, /session_token=/, "sign-in must set a session cookie");

      const signedInSessionResponse = await authRequest("/get-session", {
        cookie: signInCookie,
      });
      const signedInSession = await readJson(signedInSessionResponse, "session after sign-in");
      assert.equal(signedInSession?.user?.id, userId);

      const protectedHomeResponse = await fetch(`${authURL}/`, {
        headers: { cookie: signInCookie },
      });
      assert.equal(protectedHomeResponse.status, 200);
      const protectedHomeHtml = await protectedHomeResponse.text();
      assert.match(protectedHomeHtml, /Authentication is not authorization/);
      assert.match(
        protectedHomeHtml,
        /<a href="\/account"[^>]*>\s*Account settings\s*<\/a>/,
      );

      const signOutAfterSignIn = await authRequest("/sign-out", {
        method: "POST",
        cookie: signInCookie,
        body: {},
      });
      await readJson(signOutAfterSignIn, "sign out after email sign-in");

      const verificationId = randomUUID();
      const verificationIdentifier = `${testPrefix}verification`;
      const verificationValue = randomUUID();
      const expiresAt = new Date(Date.now() + 60_000);
      await pool.query(
        `INSERT INTO "core"."verification"
           ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [verificationId, verificationIdentifier, verificationValue, expiresAt],
      );
      const { rows: verificationRows } = await pool.query(
        `SELECT "identifier", "value", "expiresAt"
         FROM "core"."verification"
         WHERE "id" = $1`,
        [verificationId],
      );
      assert.equal(verificationRows.length, 1);
      assert.equal(verificationRows[0].identifier, verificationIdentifier);
      assert.equal(verificationRows[0].value, verificationValue);
      await pool.query('DELETE FROM "core"."verification" WHERE "id" = $1', [
        verificationId,
      ]);
      const { rows: deletedVerification } = await pool.query(
        'SELECT "id" FROM "core"."verification" WHERE "id" = $1',
        [verificationId],
      );
      assert.equal(deletedVerification.length, 0);

      const invalidUserId = `missing-${randomUUID()}`;
      await assert.rejects(
        pool.query(
          `INSERT INTO "core"."session"
             ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
           VALUES ($1, $2, $3, NOW(), NOW(), $4)`,
          [randomUUID(), new Date(Date.now() + 60_000), randomUUID(), invalidUserId],
        ),
        (error) => error?.code === "23503",
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO "core"."account"
             ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [randomUUID(), randomUUID(), "v03-reference-test", invalidUserId],
        ),
        (error) => error?.code === "23503",
      );
    },
  );
});
