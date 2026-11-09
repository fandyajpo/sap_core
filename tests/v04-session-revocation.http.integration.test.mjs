import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const parsed = databaseUrl ? new URL(databaseUrl) : null;
const authBaseURL = process.env.BETTER_AUTH_URL;
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

if (
  process.env.V04_SESSION_HTTP_ALLOW_DISPOSABLE_DB !== "1" ||
  !parsed ||
  !localHosts.has(parsed.hostname) ||
  parsed.port !== "55432" ||
  decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_v03_test" ||
  !authBaseURL
) {
  throw new Error("V04 session HTTP tests require explicit disposable DB approval and localhost:55432/sap_core_v03_test.");
}

const authURL = authBaseURL.replace(/\/+$/, "");
const authOrigin = new URL(authBaseURL).origin;
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const prefix = `v04-session-http-${randomUUID()}-`;
const actors = [];
const organizationIds = [];
let ownerRoleId;

function authRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: authOrigin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return fetch(`${authURL}/api/auth${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.map((value) => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function waitForActivity(pattern, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await pool.query(
      `SELECT pid, query, wait_event_type, wait_event
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query ILIKE $1
        ORDER BY query_start ASC
        LIMIT 1`,
      [pattern],
    );
    if (rows[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for PostgreSQL lock activity: ${label}`);
}

async function createActor(label, organizationRoleCode = "ORG_OWNER") {
  const email = `${prefix}${label}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const signup = await authRequest("/sign-up/email", {
    method: "POST",
    body: { name: `V04 ${label}`, email, password },
  });
  const signupText = await signup.text();
  assert.equal(signup.status, 200, `signup failed: ${signupText.slice(0, 500)}`);
  const signupBody = signupText ? JSON.parse(signupText) : null;
  const userId = signupBody?.user?.id;
  assert.equal(typeof userId, "string");
  const cookie = sessionCookie(signup);
  assert.match(cookie, /session_token=/);

  const { rows: sessions } = await pool.query(
    'SELECT "id" FROM "core"."session" WHERE "userId" = $1',
    [userId],
  );
  assert.equal(sessions.length, 1);
  const sessionId = sessions[0].id;

  const organizationId = randomUUID();
  const membershipId = randomUUID();
  organizationIds.push(organizationId);
  await pool.query(
    'INSERT INTO "core"."organization" ("id", "created_at", "updated_at") VALUES ($1, NOW(), NOW())',
    [organizationId],
  );
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id", "userId", "organizationId", "status", "created_at", "updated_at")
     VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW())`,
    [membershipId, userId, organizationId],
  );
  if (!ownerRoleId) {
    const { rows } = await pool.query(
      `SELECT "id"::text AS "id" FROM "core"."role_definition"
        WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
          AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
          AND "code" = 'ORG_OWNER'`,
    );
    assert.equal(rows.length, 1, "the seeded ORG_OWNER role must exist");
    ownerRoleId = rows[0].id;
  }
  const { rows: organizationRoles } = await pool.query(
    `SELECT "id"::text AS "id" FROM "core"."role_definition"
      WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND "code" = $1`,
    [organizationRoleCode],
  );
  assert.equal(organizationRoles.length, 1, `the seeded ${organizationRoleCode} role must exist`);
  await pool.query(
    `INSERT INTO "core"."organization_role_assignment"
       ("id", "organizationMembershipId", "roleDefinitionId", "role_scope",
        "grant_actor_user_id", "is_break_glass", "created_at")
     VALUES ($1, $2, $3, 'ORGANIZATION'::"core"."RoleScope", $4, FALSE, NOW())`,
    [randomUUID(), membershipId, organizationRoles[0].id, userId],
  );

  const actor = { userId, email, cookie, sessionId, organizationId, membershipId };
  actors.push(actor);
  return actor;
}

async function createCompanyPlantScopedActor(label) {
  const actor = await createActor(label, "ORG_MEMBER");
  const companyA = randomUUID();
  const companyB = randomUUID();
  const plantA = randomUUID();
  const plantB = randomUUID();
  const companyMembershipId = randomUUID();
  const plantAssignmentId = randomUUID();

  await pool.query(
    `INSERT INTO "core"."company" ("id", "organizationId", "created_at", "updated_at")
     VALUES ($1, $3, NOW(), NOW()), ($2, $3, NOW(), NOW())`,
    [companyA, companyB, actor.organizationId],
  );
  await pool.query(
    `INSERT INTO "core"."plant" ("id", "organizationId", "companyId", "created_at", "updated_at")
     VALUES ($1, $3, $4, NOW(), NOW()), ($2, $3, $4, NOW(), NOW())`,
    [plantA, plantB, actor.organizationId, companyA],
  );
  await pool.query(
    `INSERT INTO "core"."company_membership"
       ("id", "userId", "organizationMembershipId", "organizationId", "companyId", "status", "created_at", "updated_at")
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE'::"core"."ScopedAccessStatus", NOW(), NOW())`,
    [companyMembershipId, actor.userId, actor.membershipId, actor.organizationId, companyA],
  );
  await pool.query(
    `INSERT INTO "core"."plant_assignment"
       ("id", "userId", "companyMembershipId", "organizationId", "companyId", "plantId", "status", "created_at", "updated_at")
     VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE'::"core"."ScopedAccessStatus", NOW(), NOW())`,
    [plantAssignmentId, actor.userId, companyMembershipId, actor.organizationId, companyA, plantA],
  );
  await pool.query(
    `INSERT INTO "core"."company_role_assignment"
       ("id", "companyMembershipId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass", "created_at")
     VALUES ($1, $2, '20000000-0000-4000-8000-000000000002', 'COMPANY'::"core"."RoleScope", $3, FALSE, NOW())`,
    [randomUUID(), companyMembershipId, actor.userId],
  );
  await pool.query(
    `INSERT INTO "core"."plant_role_assignment"
       ("id", "plantAssignmentId", "roleDefinitionId", "role_scope", "grant_actor_user_id", "is_break_glass", "created_at")
     VALUES ($1, $2, '30000000-0000-4000-8000-000000000001', 'PLANT'::"core"."RoleScope", $3, FALSE, NOW())`,
    [randomUUID(), plantAssignmentId, actor.userId],
  );

  return { ...actor, companyA, companyB, plantA, plantB };
}

before(async () => {
  await pool.query("SELECT 1");
});

after(async () => {
  const errors = [];
  for (const actor of actors) {
    try {
      await authRequest("/sign-out", { method: "POST", cookie: actor.cookie, body: {} });
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    if (organizationIds.length > 0) {
      await pool.query(
        `UPDATE "core"."organization_role_assignment"
            SET "revoked_at" = NOW()
          WHERE "revoked_at" IS NULL
            AND "organizationMembershipId" IN (
              SELECT "id" FROM "core"."organization_membership"
              WHERE "organizationId" = ANY($1::uuid[])
            )`,
        [organizationIds],
      );
      await pool.query(
        `UPDATE "core"."organization_membership"
            SET "status" = 'SUSPENDED'::"core"."OrganizationMembershipStatus"
          WHERE "organizationId" = ANY($1::uuid[])`,
        [organizationIds],
      );
    }
  } catch (error) {
    errors.push(error);
  }
  await pool.end();
  if (errors.length) throw new AggregateError(errors, "V04 session HTTP fixture cleanup failed.");
});

test("real Better Auth HTTP sign-out waits behind a protected request that acquired the session lock first", async () => {
  const actor = await createActor("request-first");
  const blocker = await pool.connect();
  let blockerOpen = false;
  let requestPromise;
  let signoutPromise;
  try {
    await blocker.query("BEGIN");
    blockerOpen = true;
    await blocker.query('LOCK TABLE "core"."organization_membership" IN ACCESS EXCLUSIVE MODE');

    requestPromise = fetch(
      `${authURL}/api/organizations/${actor.organizationId}/members`,
      { headers: { cookie: actor.cookie } },
    );

    // The protected request has passed Better Auth getSession and acquired
    // FOR SHARE on its exact session row before it blocks on membership lookup.
    await waitForActivity('%organization_membership%', "protected request waiting on membership table");

    signoutPromise = authRequest("/sign-out", {
      method: "POST",
      cookie: actor.cookie,
      body: {},
    });
    await waitForActivity('%DELETE%session%', "Better Auth sign-out waiting on the locked session row");

    await blocker.query("COMMIT");
    blockerOpen = false;

    const [protectedResponse, signoutResponse] = await Promise.all([requestPromise, signoutPromise]);
    const protectedBody = await protectedResponse.text();
    assert.equal(protectedResponse.status, 200, protectedBody.slice(0, 500));
    const members = JSON.parse(protectedBody);
    assert.equal(members.organizationId, actor.organizationId);
    assert.equal(members.members.length, 1);
    assert.equal(members.members[0].userId, actor.userId);

    const signoutBody = await signoutResponse.text();
    assert.equal(signoutResponse.status, 200, signoutBody.slice(0, 500));
    const { rows } = await pool.query(
      'SELECT "id" FROM "core"."session" WHERE "id" = $1',
      [actor.sessionId],
    );
    assert.equal(rows.length, 0, "sign-out must delete the session after the protected transaction releases its lock");

    const afterRevocation = await fetch(
      `${authURL}/api/organizations/${actor.organizationId}/members`,
      { headers: { cookie: actor.cookie } },
    );
    assert.equal(afterRevocation.status, 401, "a later protected HTTP request must reject the revoked cookie");
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK").catch(() => {});
    blocker.release();
    if (requestPromise) await requestPromise.catch(() => {});
    if (signoutPromise) await signoutPromise.catch(() => {});
  }
});

test("revocation-first HTTP ordering rejects the cookie before tenant protected work", async () => {
  const actor = await createActor("revocation-first");
  const signout = await authRequest("/sign-out", {
    method: "POST",
    cookie: actor.cookie,
    body: {},
  });
  const signoutBody = await signout.text();
  assert.equal(signout.status, 200, signoutBody.slice(0, 500));

  const { rows } = await pool.query(
    'SELECT "id" FROM "core"."session" WHERE "id" = $1',
    [actor.sessionId],
  );
  assert.equal(rows.length, 0);

  const protectedResponse = await fetch(
    `${authURL}/api/organizations/${actor.organizationId}/members`,
    { headers: { cookie: actor.cookie } },
  );
  assert.equal(protectedResponse.status, 401);
});

test("database connection failure while acquiring the session row lock fails the protected HTTP request closed", async () => {
  const actor = await createActor("lock-failure");
  const holder = await pool.connect();
  let holderOpen = false;
  try {
    await holder.query("BEGIN");
    holderOpen = true;
    await holder.query(
      'UPDATE "core"."session" SET "updatedAt" = "updatedAt" WHERE "id" = $1',
      [actor.sessionId],
    );

    const requestPromise = fetch(
      `${authURL}/api/organizations/${actor.organizationId}/members`,
      { headers: { cookie: actor.cookie } },
    );
    const waitingLock = await waitForActivity('%FOR SHARE OF s%', "session row lock query waiting on a conflicting update");
    const { rows: terminated } = await pool.query(
      "SELECT pg_terminate_backend($1) AS terminated",
      [waitingLock.pid],
    );
    assert.equal(terminated[0].terminated, true, "the blocked request backend must be terminated to inject a DB failure");

    const response = await requestPromise;
    const body = await response.text();
    assert.equal(response.status, 500, body.slice(0, 500));

    await holder.query("ROLLBACK");
    holderOpen = false;
    const { rows } = await pool.query(
      'SELECT "id" FROM "core"."session" WHERE "id" = $1',
      [actor.sessionId],
    );
    assert.equal(rows.length, 1, "terminating the protected transaction must not revoke the still-valid session");
  } finally {
    if (holderOpen) await holder.query("ROLLBACK").catch(() => {});
    holder.release();
  }
});


test("tenant HTTP routes reject cross-Organization identifiers and spoofed role-assignment actors", async () => {
  const actor = await createActor("tenant-route-boundary");
  const foreignOrganizationId = randomUUID();
  await pool.query(
    'INSERT INTO "core"."organization" ("id", "created_at", "updated_at") VALUES ($1, NOW(), NOW())',
    [foreignOrganizationId],
  );
  organizationIds.push(foreignOrganizationId);

  const requests = [
    fetch(`${authURL}/api/organizations/${foreignOrganizationId}/members`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${foreignOrganizationId}/roles`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${foreignOrganizationId}/companies/${randomUUID()}`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${foreignOrganizationId}/companies/${randomUUID()}/plants/${randomUUID()}`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(
      `${authURL}/api/organizations/${foreignOrganizationId}/roles/assignments?scope=ORGANIZATION&parentId=${randomUUID()}&userId=${actor.userId}`,
      { headers: { cookie: actor.cookie } },
    ),
  ];
  const responses = await Promise.all(requests);
  for (const response of responses) {
    const body = await response.text();
    assert.equal(response.status, 403, body.slice(0, 500));
  }

  const spoofedAssignment = await fetch(
    `${authURL}/api/organizations/${actor.organizationId}/roles/assignments`,
    {
      method: "POST",
      headers: { cookie: actor.cookie, origin: authOrigin, "content-type": "application/json" },
      body: JSON.stringify({
        scope: "ORGANIZATION",
        parentId: actor.membershipId,
        roleDefinitionId: ownerRoleId,
        actorUserId: randomUUID(),
        userId: randomUUID(),
      }),
    },
  );
  const spoofedBody = await spoofedAssignment.text();
  assert.equal(spoofedAssignment.status, 400, spoofedBody.slice(0, 500));

  const invalidOrganization = await fetch(`${authURL}/api/organizations/not-a-uuid/members`, {
    headers: { cookie: actor.cookie },
  });
  assert.equal(invalidOrganization.status, 400);

  const malformedJson = await fetch(
    `${authURL}/api/organizations/${actor.organizationId}/roles/assignments`,
    {
      method: "POST",
      headers: { cookie: actor.cookie, origin: authOrigin, "content-type": "application/json" },
      body: "{",
    },
  );
  assert.equal(malformedJson.status, 400);

  const malformedRevision = await fetch(
    `${authURL}/api/organizations/${actor.organizationId}/roles/${ownerRoleId}/revisions`,
    {
      method: "POST",
      headers: { cookie: actor.cookie, origin: authOrigin, "content-type": "application/json" },
      body: "{",
    },
  );
  assert.equal(malformedRevision.status, 400);
});


test("membership suspension waits for a protected tenant request that locked membership first", async () => {
  const actor = await createActor("membership-request-first");
  const blocker = await pool.connect();
  let blockerOpen = false;
  let requestPromise;
  let suspensionPromise;
  try {
    await blocker.query("BEGIN");
    blockerOpen = true;
    await blocker.query('LOCK TABLE "core"."role_permission_grant" IN ACCESS EXCLUSIVE MODE');

    requestPromise = fetch(
      `${authURL}/api/organizations/${actor.organizationId}/members`,
      { headers: { cookie: actor.cookie } },
    );
    await waitForActivity("%role_permission_grant%", "protected request waiting after target membership lock");

    suspensionPromise = pool.query(
      `UPDATE "core"."organization_membership"
          SET "status" = 'SUSPENDED'::"core"."OrganizationMembershipStatus",
              "updated_at" = NOW()
        WHERE "id" = $1`,
      [actor.membershipId],
    );
    await waitForActivity('%UPDATE%organization_membership%', "membership suspension waiting behind protected request");

    await blocker.query("COMMIT");
    blockerOpen = false;
    const [protectedResponse] = await Promise.all([requestPromise, suspensionPromise]);
    const protectedBody = await protectedResponse.text();
    assert.equal(protectedResponse.status, 200, protectedBody.slice(0, 500));

    const { rows } = await pool.query(
      'SELECT "status"::text AS "status" FROM "core"."organization_membership" WHERE "id" = $1',
      [actor.membershipId],
    );
    assert.equal(rows[0].status, "SUSPENDED");
  } finally {
    if (blockerOpen) await blocker.query("ROLLBACK").catch(() => {});
    blocker.release();
    if (requestPromise) await requestPromise.catch(() => {});
    if (suspensionPromise) await suspensionPromise.catch(() => {});
  }
});

test("unauthenticated HTTP requests are rejected before role-assignment request validation", async () => {
  const members = await fetch(
    `${authURL}/api/organizations/${randomUUID()}/members`,
  );
  assert.equal(members.status, 401);

  const assignmentsGet = await fetch(
    `${authURL}/api/organizations/${randomUUID()}/roles/assignments?scope=ORGANIZATION&parentId=${randomUUID()}&userId=anonymous`,
  );
  assert.equal(assignmentsGet.status, 401);

  const assignmentsPost = await fetch(
    `${authURL}/api/organizations/${randomUUID()}/roles/assignments`,
    {
      method: "POST",
      headers: { origin: authOrigin, "content-type": "application/json" },
      body: "{",
    },
  );
  assert.equal(assignmentsPost.status, 401);
});

test("suspended Organization membership is denied by protected HTTP readers", async () => {
  const actor = await createActor("inactive-membership");
  await pool.query(
    `UPDATE "core"."organization_membership"
        SET "status" = 'SUSPENDED'::"core"."OrganizationMembershipStatus",
            "updated_at" = NOW()
      WHERE "id" = $1`,
    [actor.membershipId],
  );

  const [members, assignments] = await Promise.all([
    fetch(
      `${authURL}/api/organizations/${actor.organizationId}/members`,
      { headers: { cookie: actor.cookie } },
    ),
    fetch(
      `${authURL}/api/organizations/${actor.organizationId}/roles/assignments?scope=ORGANIZATION&parentId=${actor.membershipId}&userId=${actor.userId}`,
      { headers: { cookie: actor.cookie } },
    ),
  ]);

  assert.equal(members.status, 403, (await members.text()).slice(0, 500));
  assert.equal(assignments.status, 403, (await assignments.text()).slice(0, 500));
});

test("Company and Plant HTTP readers isolate sibling scopes using persisted scoped grants", async () => {
  const actor = await createCompanyPlantScopedActor("sibling-scope-boundary");
  const [companyAllowed, companySibling, plantAllowed, plantSibling] = await Promise.all([
    fetch(`${authURL}/api/organizations/${actor.organizationId}/companies/${actor.companyA}`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${actor.organizationId}/companies/${actor.companyB}`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${actor.organizationId}/companies/${actor.companyA}/plants/${actor.plantA}`, {
      headers: { cookie: actor.cookie },
    }),
    fetch(`${authURL}/api/organizations/${actor.organizationId}/companies/${actor.companyA}/plants/${actor.plantB}`, {
      headers: { cookie: actor.cookie },
    }),
  ]);

  assert.equal(companyAllowed.status, 200, (await companyAllowed.text()).slice(0, 500));
  assert.equal(companySibling.status, 403, (await companySibling.text()).slice(0, 500));
  assert.equal(plantAllowed.status, 200, (await plantAllowed.text()).slice(0, 500));
  assert.equal(plantSibling.status, 403, (await plantSibling.text()).slice(0, 500));
});

test("Organization custom-role HTTP creation rejects permissions outside the approved delegation allowlist", async () => {
  const actor = await createActor("nondelegable-role-permission");
  const response = await fetch(
    `${authURL}/api/organizations/${actor.organizationId}/roles`,
    {
      method: "POST",
      headers: { cookie: actor.cookie, origin: authOrigin, "content-type": "application/json" },
      body: JSON.stringify({
        code: "HTTP_NONDELEGABLE_ROLES_ASSIGN",
        scope: "ORGANIZATION",
        permissions: ["roles.assign"],
      }),
    },
  );
  const body = await response.text();
  assert.equal(response.status, 403, body.slice(0, 500));
  assert.match(body, /AUTHORIZATION_DENIED/);
});
