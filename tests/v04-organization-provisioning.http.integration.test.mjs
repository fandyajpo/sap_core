import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { assertDisposablePostgresUrl, assertLocalHttpOrigin } from "./v04-integration-safety.mjs";

const { Pool } = pg;

// Strict target guards: only the exact disposable database and loopback auth
// origin CI provisions may be used; there is no fallback.
assertDisposablePostgresUrl({
  value: process.env.DATABASE_URL,
  suiteLabel: "V04 organization provisioning HTTP tests",
  optInEnvName: "V04_ORGANIZATION_PROVISIONING_ALLOW_DISPOSABLE_DB",
  expectedPort: 55432,
  expectedDatabase: "sap_core_v03_test",
  expectedUsers: ["sap_core"],
});
const auth = assertLocalHttpOrigin({
  value: process.env.BETTER_AUTH_URL,
  suiteLabel: "V04 organization provisioning HTTP tests",
  optInEnvName: "V04_ORGANIZATION_PROVISIONING_ALLOW_DISPOSABLE_DB",
  expectedOrigin: "http://127.0.0.1:3000",
});

const authURL = auth.baseUrl;
const authOrigin = auth.origin;
const databaseUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: databaseUrl, max: 6 });
const prefix = `v04-provisioning-http-${randomUUID()}-`;

// Every actor this suite creates is tracked from the moment signup confirms the
// user, so a partially completed scenario is still signed out in teardown.
const actors = [];

// Every HTTP request must stay on the validated loopback origin and must never
// follow a redirect (a redirect could carry the session cookie elsewhere).
function httpFetch(url, init = {}) {
  return fetch(url, { ...init, redirect: "error" });
}

function authRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: authOrigin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return httpFetch(`${authURL}/api/auth${path}`, {
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

function provisioningRequest(
  cookie,
  body = { name: `Test Workspace ${randomUUID().slice(0, 8)}` },
) {
  const headers = { origin: authOrigin, "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return httpFetch(`${authURL}/api/organizations`, {
    method: "POST",
    headers,
    body: body === undefined ? "{}" : JSON.stringify(body),
  });
}

async function createActor(label) {
  const email = `${prefix}${label}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const signup = await authRequest("/sign-up/email", {
    method: "POST",
    body: { name: `Provisioning ${label}`, email, password },
  });
  const text = await signup.text();
  assert.equal(signup.status, 200, `signup failed: ${text.slice(0, 500)}`);
  const userId = JSON.parse(text)?.user?.id;
  assert.equal(typeof userId, "string");
  const cookie = sessionCookie(signup);
  assert.match(cookie, /session_token=/);
  const actor = { userId, email, cookie };
  actors.push(actor);
  return actor;
}

async function readProvisioningRows(organizationId) {
  const { rows } = await pool.query(
    `SELECT
       om."id"::text AS "membershipId",
       om."userId" AS "membershipUserId",
       om."status"::text AS "membershipStatus",
       rd."code" AS "roleCode",
       rd."kind"::text AS "roleKind",
       rd."scope"::text AS "definitionScope",
       ra."role_scope"::text AS "assignmentScope",
       ra."grant_actor_user_id" AS "grantActorUserId",
       ra."is_break_glass" AS "isBreakGlass"
     FROM "core"."organization_membership" om
     LEFT JOIN "core"."organization_role_assignment" ra
       ON ra."organizationMembershipId" = om."id"
     LEFT JOIN "core"."role_definition" rd
       ON rd."id" = ra."roleDefinitionId"
     WHERE om."organizationId" = $1::uuid
     ORDER BY om."id"`,
    [organizationId],
  );
  return rows;
}

async function countOrganizationsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT om."organizationId")::int AS count
       FROM "core"."organization_membership" om
      WHERE om."userId" = $1`,
    [userId],
  );
  return rows[0].count;
}

async function readOrganizationIds() {
  const { rows } = await pool.query('SELECT "id"::text AS "id" FROM "core"."organization"');
  return new Set(rows.map((row) => row.id));
}

before(async () => {
  await pool.query("SELECT 1");
});

after(async () => {
  // Fixture lifecycle: `core.organization_role_assignment` is protected by the
  // `protect_role_assignment_history` trigger (SQLSTATE 55000 on DELETE) and is
  // referenced by `core.organization_membership` with ON DELETE RESTRICT; that
  // membership is in turn the RESTRICT parent of the Organization and the User.
  // An Organization created by this suite therefore cannot be removed without
  // violating the approved append-only history policy. Complete row cleanup is
  // impossible by design, and the safety boundary is strict disposable-database
  // isolation: the guards above accept only the exact fresh database CI
  // provisions for this job, on loopback, with the exact port, name and user.
  // Teardown signs every tracked actor out (deleting the Better Auth session)
  // and closes the pool; every failure is preserved and rethrown instead of
  // swallowed.
  const errors = [];
  for (const actor of actors) {
    try {
      await authRequest("/sign-out", { method: "POST", cookie: actor.cookie, body: {} });
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await pool.end();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    throw new AggregateError(
      errors,
      "V04 organization provisioning teardown failed; the disposable database must be discarded.",
    );
  }
});

test("provisions an Organization and assigns the caller the initial ORG_OWNER role atomically", async () => {
  const actor = await createActor("owner-success");
  const requestedName = "  Acme Holdings  ";
  const response = await provisioningRequest(actor.cookie, { name: requestedName });
  const body = await response.json();

  assert.equal(response.status, 201, JSON.stringify(body));
  const organizationId = body.organization.id;
  assert.match(organizationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(typeof body.organization.createdAt, "string");
  assert.equal(Number.isNaN(Date.parse(body.organization.createdAt)), false);
  assert.equal(body.organization.name, "Acme Holdings", "the API must return the trimmed name");
  const { rows: organizationRows } = await pool.query(
    'SELECT "name" FROM "core"."organization" WHERE "id" = $1::uuid',
    [organizationId],
  );
  assert.equal(organizationRows[0].name, "Acme Holdings", "the trimmed name must be persisted");
  assert.deepEqual(body.membership, {
    id: body.membership.id,
    status: "ACTIVE",
    roleCode: "ORG_OWNER",
    roleScope: "ORGANIZATION",
  });

  const rows = await readProvisioningRows(organizationId);
  assert.equal(rows.length, 1, "provisioning must create exactly one membership row");
  assert.equal(rows[0].membershipId, body.membership.id);
  assert.equal(rows[0].membershipUserId, actor.userId, "owner must be the verified session user");
  assert.equal(rows[0].membershipStatus, "ACTIVE");
  assert.equal(rows[0].roleCode, "ORG_OWNER");
  assert.equal(rows[0].roleKind, "SYSTEM");
  assert.equal(rows[0].definitionScope, "ORGANIZATION");
  assert.equal(rows[0].assignmentScope, "ORGANIZATION");
  assert.equal(rows[0].grantActorUserId, actor.userId);
  assert.equal(rows[0].isBreakGlass, false);
});

test("rejects unauthenticated provisioning", async () => {
  const response = await provisioningRequest(undefined);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, "UNAUTHENTICATED");
});

test("rejects client-supplied identity, tenant, role and unsupported fields", async () => {
  const actor = await createActor("invalid-input");
  const cases = [
    [[], /JSON object/],
    ["text", /JSON object/],
    [42, /JSON object/],
    [{ userId: randomUUID() }, /derived from the verified session/],
    [{ ownerUserId: actor.userId }, /derived from the verified session/],
    [{ organizationId: randomUUID() }, /derived from the verified session/],
    [{ membershipId: randomUUID() }, /derived from the verified session/],
    [{ roleCode: "ORG_OWNER" }, /derived from the verified session/],
    [{ status: "ACTIVE" }, /derived from the verified session/],
    [{ isBreakGlass: true }, /derived from the verified session/],
    [{}, /name is required/],
    [{ name: "" }, /at least/],
    [{ name: "   " }, /at least/],
    [{ name: "A" }, /at least/],
    [{ name: "x".repeat(121) }, /at most/],
  ];

  for (const [payload, pattern] of cases) {
    const response = await provisioningRequest(actor.cookie, payload);
    const body = await response.json();
    assert.equal(response.status, 400, `payload ${JSON.stringify(payload)} => ${JSON.stringify(body)}`);
    assert.equal(body.code, "INVALID_INPUT");
    assert.match(body.error, pattern);
  }

  assert.equal(await countOrganizationsForUser(actor.userId), 0, "rejected requests must persist nothing");
});

test("rejects a malformed JSON body without leaking internal details", async () => {
  const actor = await createActor("malformed-json");
  const response = await httpFetch(`${authURL}/api/organizations`, {
    method: "POST",
    headers: { origin: authOrigin, cookie: actor.cookie, "content-type": "application/json" },
    body: "{",
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error, "A valid JSON request body is required.");
  assert.equal(await countOrganizationsForUser(actor.userId), 0);
});

test("returns a stable conflict when the caller already holds a current membership", async () => {
  const actor = await createActor("slot-occupied");
  const first = await provisioningRequest(actor.cookie);
  const firstBody = await first.json();
  assert.equal(first.status, 201, JSON.stringify(firstBody));

  const second = await provisioningRequest(actor.cookie);
  const secondBody = await second.json();
  assert.equal(second.status, 409);
  assert.equal(secondBody.code, "MEMBERSHIP_SLOT_OCCUPIED");

  assert.equal(await countOrganizationsForUser(actor.userId), 1);
});

test("concurrent provisioning creates exactly one Organization and no additional Organization", async () => {
  const actor = await createActor("concurrent");
  // Snapshot only this window: the assertion below is a set difference, not a
  // global count, so Organizations created by earlier suites in this shared job
  // database (or left behind by append-only history) cannot affect it.
  const organizationsBefore = await readOrganizationIds();

  const [first, second] = await Promise.all([
    provisioningRequest(actor.cookie),
    provisioningRequest(actor.cookie),
  ]);
  const results = [first, second];
  const bodies = await Promise.all(results.map((response) => response.json()));

  assert.deepEqual(
    results.map((response) => response.status).sort((left, right) => left - right),
    [201, 409],
    JSON.stringify(bodies),
  );

  const winner = results.findIndex((response) => response.status === 201);
  const winnerBody = bodies[winner];

  // Exactly the winner's Organization may appear. The losing request's
  // Organization insert must roll back with its failed transaction, so no
  // orphan can be left for another suite to trip over.
  const organizationsAfter = await readOrganizationIds();
  const created = [...organizationsAfter].filter((id) => !organizationsBefore.has(id));
  assert.deepEqual(
    created,
    [winnerBody.organization.id],
    "concurrent provisioning must create exactly the winner's Organization",
  );

  // The winner's own Organization carries exactly one ACTIVE ORG_OWNER
  // membership, owned by the verified session user.
  const rows = await readProvisioningRows(winnerBody.organization.id);
  assert.equal(rows.length, 1, "the winning Organization must hold exactly one membership");
  assert.equal(rows[0].membershipId, winnerBody.membership.id);
  assert.equal(rows[0].membershipUserId, actor.userId);
  assert.equal(rows[0].membershipStatus, "ACTIVE");
  assert.equal(rows[0].roleCode, "ORG_OWNER");

  assert.equal(await countOrganizationsForUser(actor.userId), 1, "exactly one Organization may exist for the winner");
});

test("a revoked session cannot provision", async () => {
  const actor = await createActor("revoked-session");
  const signout = await authRequest("/sign-out", {
    method: "POST",
    cookie: actor.cookie,
    body: {},
  });
  const signoutBody = await signout.text();
  assert.equal(signout.status, 200, signoutBody.slice(0, 500));

  const response = await provisioningRequest(actor.cookie);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, "UNAUTHENTICATED");
  assert.equal(await countOrganizationsForUser(actor.userId), 0);
});

test("a cross-tenant target cannot be attached and never widens another Organization", async () => {
  const owner = await createActor("cross-tenant-owner");
  const created = await provisioningRequest(owner.cookie);
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));

  const stranger = await createActor("cross-tenant-stranger");
  const attempt = await provisioningRequest(stranger.cookie, {
    name: "Stranger Attempt",
    organizationId: createdBody.organization.id,
  });
  const attemptBody = await attempt.json();
  assert.equal(attempt.status, 400);
  assert.equal(attemptBody.code, "INVALID_INPUT");

  const ownerRows = await readProvisioningRows(createdBody.organization.id);
  assert.equal(ownerRows.length, 1, "the targeted Organization must keep exactly its own membership");
  assert.equal(ownerRows[0].membershipUserId, owner.userId);
  assert.equal(await countOrganizationsForUser(stranger.userId), 0);

  // The stranger can still provision their own, separate Organization.
  const own = await provisioningRequest(stranger.cookie);
  const ownBody = await own.json();
  assert.equal(own.status, 201, JSON.stringify(ownBody));
  assert.notEqual(ownBody.organization.id, createdBody.organization.id);
  assert.equal(await countOrganizationsForUser(stranger.userId), 1);
});
