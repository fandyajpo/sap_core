import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";
import { assertDisposablePostgresUrl, assertLocalHttpOrigin } from "./v04-integration-safety.mjs";

const { Pool } = pg;
// Strict target guards: only the exact disposable database and loopback auth
// origin CI provisions may be used; there is no fallback. See
// tests/v04-integration-safety.mjs.
assertDisposablePostgresUrl({
  value: process.env.DATABASE_URL,
  suiteLabel: "DENY HTTP integration tests",
  optInEnvName: "V04_DENY_HTTP_ALLOW_DISPOSABLE_DB",
  expectedPort: 55432,
  expectedDatabase: "sap_core_v03_test",
  expectedUsers: ["sap_core"],
});
const auth = assertLocalHttpOrigin({
  value: process.env.BETTER_AUTH_URL,
  suiteLabel: "DENY HTTP integration tests",
  optInEnvName: "V04_DENY_HTTP_ALLOW_DISPOSABLE_DB",
  // Mirrors .github/workflows/validation.yml (BETTER_AUTH_URL of the v03 job).
  expectedOrigin: "http://127.0.0.1:3000",
});

const authURL = auth.baseUrl;
const authOrigin = auth.origin;
const databaseUrl = process.env.DATABASE_URL;
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const prefix = `v04-deny-http-${randomUUID()}-`;
const actors = [];
const organizationIds = [];

function authRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: authOrigin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return httpFetch(`${authURL}/api/auth${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.map(value => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

// Every HTTP request in this suite must stay on the validated loopback
// origin and must never follow a redirect: a redirect could carry the
// session cookie to another host. httpFetch pins redirect: "error" onto
// every request so no caller can bypass it.
function httpFetch(url, init = {}) {
  const target = new URL(url, authURL);
  if (target.origin !== authOrigin || target.username !== "" || target.password !== "") {
    throw new Error(
      `HTTP integration request must stay on validated origin ${authOrigin} without URL credentials; got "${target.origin}".`,
    );
  }
  return fetch(target, { ...init, redirect: "error" });
}

async function createActor(label, roleCode, existingOrganizationId) {
  const email = `${prefix}${label}@example.test`;
  const signup = await authRequest("/sign-up/email", {
    method: "POST",
    body: { name: `DENY ${label}`, email, password: `${randomUUID()}Aa1!` },
  });
  const text = await signup.text();
  assert.equal(signup.status, 200, text.slice(0, 500));
  const userId = JSON.parse(text)?.user?.id;
  assert.equal(typeof userId, "string");
  const cookie = sessionCookie(signup);
  // Track the actor as soon as Better Auth confirms the user exists, before
  // any fixture SQL runs, so a partially completed setup is still signed out
  // and diagnosable in teardown. This suite never deletes rows (append-only
  // DENY policies), so tracking drives sign-out and diagnostics only.
  const actor = { userId, email, cookie, organizationId: null, membershipId: null };
  actors.push(actor);
  assert.match(cookie, /session_token=/);
  const organizationId = existingOrganizationId ?? randomUUID();
  const membershipId = randomUUID();
  // Record the generated IDs before attempting their inserts so teardown can
  // diagnose a partial setup.
  actor.organizationId = organizationId;
  actor.membershipId = membershipId;
  if (!existingOrganizationId) {
    organizationIds.push(organizationId);
    await pool.query(
      'INSERT INTO "core"."organization" ("id","created_at","updated_at") VALUES ($1,NOW(),NOW())',
      [organizationId],
    );
  }
  await pool.query(
    `INSERT INTO "core"."organization_membership"
       ("id","userId","organizationId","status","created_at","updated_at")
     VALUES ($1,$2,$3,'ACTIVE',NOW(),NOW())`,
    [membershipId,userId,organizationId],
  );
  const { rows: roles } = await pool.query(
    `SELECT "id"::text AS id FROM "core"."role_definition"
      WHERE "kind" = 'SYSTEM'::"core"."RoleDefinitionKind"
        AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND "code" = $1 AND "disabled_at" IS NULL`,
    [roleCode],
  );
  assert.equal(roles.length, 1, `system role ${roleCode} must be seeded`);
  await pool.query(
    `INSERT INTO "core"."organization_role_assignment"
       ("id","organizationMembershipId","roleDefinitionId","role_scope",
        "grant_actor_user_id","is_break_glass","created_at")
     VALUES ($1,$2,$3,'ORGANIZATION'::"core"."RoleScope",$4,FALSE,NOW())`,
    [randomUUID(),membershipId,roles[0].id,userId],
  );
  return actor;
}

async function denyRequest(actor, method, path, body, organizationId = actor.organizationId) {
  const response = await httpFetch(`${authURL}/api/organizations/${organizationId}/deny-policies${path}`, {
    method,
    headers: { cookie: actor.cookie, origin: authOrigin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  await pool.query("SELECT 1");
});

after(async () => {
  // Fixture lifecycle: the tenant_deny_policy and tenant_deny_audit_event rows
  // created through the HTTP API are append-only (triggers raise SQLSTATE
  // 55000 on UPDATE/DELETE), so the suite's user, organization, membership and
  // policy rows cannot be removed after the run without violating FK-safe,
  // append-only semantics. Complete cleanup is therefore impossible by design,
  // and the safety boundary is strict disposable-database isolation: the guard
  // above only accepts the exact fresh database CI provisions for this job.
  // Teardown only signs the HTTP actors out (every actor is tracked from the
  // moment its signup succeeds, so a partial setup is still signed out) and
  // closes the pool; every failure is preserved and rethrown instead of
  // swallowed.
  const errors = [];
  for (const actor of actors) {
    try {
      await authRequest("/sign-out", { method: "POST", cookie: actor.cookie, body: {} });
    } catch (error) { errors.push(error); }
  }
  try {
    await pool.end();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, "DENY HTTP fixture cleanup failed; the disposable database must be discarded.");
});

test("real HTTP DENY lifecycle enforces ORG_OWNER-only create, read, and revoke", async () => {
  const owner = await createActor("owner", "ORG_OWNER");
  const target = await createActor("target", "ORG_MEMBER", owner.organizationId);
  const admin = await createActor("admin", "ORG_ADMIN", owner.organizationId);
  const outsider = await createActor("outsider", "ORG_MEMBER");

  const input = {
    targetMembershipId: target.membershipId,
    permissionCode: "organization.read",
    scope: "ORGANIZATION",
    reason: "HTTP integration test",
  };

  const created = await denyRequest(owner, "POST", "", input);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const policyId = created.body.policy.id;
  assert.equal(created.body.policy.targetMembershipId, target.membershipId);

  const duplicate = await denyRequest(owner, "POST", "", input);
  assert.equal(duplicate.status, 409);

  const history = await denyRequest(owner, "GET", "");
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.ok(history.body.policies.some(policy => policy.id === policyId));
  assert.ok(history.body.events.some(event => event.eventType === "POLICY_CREATED"));
  assert.ok(history.body.events.some(event => event.eventType === "POLICY_READ"));

  const deniedRead = await denyRequest(admin, "GET", "", undefined, owner.organizationId);
  assert.equal(deniedRead.status, 403);
  const deniedWrite = await denyRequest(admin, "POST", "", input, owner.organizationId);
  assert.equal(deniedWrite.status, 403);

  // An authenticated user without membership in this Organization is denied,
  // but cannot create audit evidence in a tenant they do not belong to.
  const outsiderWrite = await denyRequest(outsider, "POST", "", input, owner.organizationId);
  assert.equal(outsiderWrite.status, 403);

  // Anonymous attempts have no verified actor and are deliberately not stored.
  const anonymous = await httpFetch(`${authURL}/api/organizations/${owner.organizationId}/deny-policies`, {
    method: "POST",
    headers: { origin: authOrigin, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(anonymous.status, 401);

  // The per-actor and per-tenant event budgets are serialized in the DB transaction.
  const burst = await Promise.all(Array.from({ length: 12 }, () =>
    denyRequest(admin, "POST", "", input, owner.organizationId)
  ));
  assert.ok(burst.every(result => result.status === 403));

  const { rows: deniedEvents } = await pool.query(
    `SELECT "event_type"::text AS "eventType","outcome"::text AS "outcome"
       FROM "core"."tenant_deny_audit_event"
      WHERE "organization_id" = $1
        AND "actor_user_id" = $2
        AND "event_type" IN ('POLICY_READ_DENIED','POLICY_WRITE_DENIED')`,
    [owner.organizationId, admin.userId],
  );
  assert.equal(deniedEvents.filter(event => event.eventType === "POLICY_READ_DENIED" && event.outcome === "DENIED").length, 1);
  assert.equal(deniedEvents.filter(event => event.eventType === "POLICY_WRITE_DENIED" && event.outcome === "DENIED").length, 10);

  const { rows: outsiderEvents } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM "core"."tenant_deny_audit_event"
      WHERE "organization_id" = $1 AND "actor_user_id" = $2
        AND "event_type" = 'POLICY_WRITE_DENIED'`,
    [owner.organizationId, outsider.userId],
  );
  assert.equal(outsiderEvents[0].count, 0);

  const { rows: cappedEvents } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM "core"."tenant_deny_audit_event"
      WHERE "organization_id" = $1 AND "actor_user_id" = $2
        AND "event_type" = 'POLICY_WRITE_DENIED'
        AND "occurred_at" >= NOW() - INTERVAL '5 minutes'`,
    [owner.organizationId, admin.userId],
  );
  assert.equal(cappedEvents[0].count, 10);

  const revoked = await denyRequest(owner, "PATCH", `/${policyId}`, { reason: "HTTP integration revoke" });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.revoked, true);
  const secondRevoke = await denyRequest(owner, "PATCH", `/${policyId}`, { reason: "repeat revoke" });
  assert.equal(secondRevoke.status, 404);
});

test("concurrent real HTTP creates for the same membership/scope yield one policy and one conflict", async () => {
  const owner = await createActor("concurrent-owner", "ORG_OWNER");
  const target = await createActor("concurrent-target", "ORG_MEMBER", owner.organizationId);
  const input = {
    targetMembershipId: target.membershipId,
    permissionCode: "organization.read",
    scope: "ORGANIZATION",
    reason: "Concurrent create integration test",
  };
  const results = await Promise.all([
    denyRequest(owner, "POST", "", input),
    denyRequest(owner, "POST", "", input),
  ]);
  assert.deepEqual(results.map(result => result.status).sort((a,b) => a-b), [201,409]);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM "core"."tenant_deny_policy"
      WHERE "organization_id" = $1 AND "target_membership_id" = $2
        AND "permission_definition_id" = (
          SELECT "id" FROM "core"."permission_definition" WHERE "code" = 'organization.read'
        )
        AND "scope" = 'ORGANIZATION'::"core"."RoleScope"
        AND "revoked_at" IS NULL`,
    [owner.organizationId,target.membershipId],
  );
  assert.equal(rows[0].count, 1);
});
