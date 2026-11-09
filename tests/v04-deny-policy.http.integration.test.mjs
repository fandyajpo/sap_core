import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const parsed = databaseUrl ? new URL(databaseUrl) : null;
const authBaseURL = process.env.BETTER_AUTH_URL;
if (
  process.env.V04_DENY_HTTP_ALLOW_DISPOSABLE_DB !== "1" ||
  !parsed ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) ||
  parsed.port !== "55432" ||
  decodeURIComponent(parsed.pathname.slice(1)) !== "sap_core_v03_test" ||
  !authBaseURL
) {
  throw new Error("DENY HTTP integration tests require explicit approval, Better Auth URL, and localhost:55432/sap_core_v03_test.");
}

const authURL = authBaseURL.replace(/\/+$/, "");
const authOrigin = new URL(authBaseURL).origin;
const pool = new Pool({ connectionString: databaseUrl, max: 8 });
const prefix = `v04-deny-http-${randomUUID()}-`;
const actors = [];
const organizationIds = [];

function authRequest(path, { method = "GET", body, cookie } = {}) {
  const headers = { origin: authOrigin };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  return fetch(`${authURL}/api/auth${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") ?? ""];
  return cookies.map(value => value.split(";", 1)[0]).filter(Boolean).join("; ");
}

async function createActor(label, roleCode) {
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
  assert.match(cookie, /session_token=/);
  const organizationId = randomUUID();
  const membershipId = randomUUID();
  organizationIds.push(organizationId);

  await pool.query(
    'INSERT INTO "core"."organization" ("id","created_at","updated_at") VALUES ($1,NOW(),NOW())',
    [organizationId],
  );
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
  const actor = { userId, email, cookie, organizationId, membershipId };
  actors.push(actor);
  return actor;
}

async function denyRequest(actor, method, path, body, organizationId = actor.organizationId) {
  const response = await fetch(`${authURL}/api/organizations/${organizationId}/deny-policies${path}`, {
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
  const errors = [];
  for (const actor of actors) {
    try {
      await authRequest("/sign-out", { method: "POST", cookie: actor.cookie, body: {} });
    } catch (error) { errors.push(error); }
  }
  await pool.end();
  if (errors.length) throw new AggregateError(errors, "DENY HTTP fixture cleanup failed.");
});

test("real HTTP DENY lifecycle enforces ORG_OWNER-only create, read, and revoke", async () => {
  const owner = await createActor("owner", "ORG_OWNER");
  const target = await createActor("target", "ORG_MEMBER");
  const admin = await createActor("admin", "ORG_ADMIN");

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

  const { rows: deniedEvents } = await pool.query(
    `SELECT "event_type"::text AS "eventType","outcome"::text AS "outcome"
       FROM "core"."tenant_deny_audit_event"
      WHERE "organization_id" = $1
        AND "actor_user_id" = $2
        AND "event_type" IN ('POLICY_READ_DENIED','POLICY_WRITE_DENIED')`,
    [owner.organizationId, admin.userId],
  );
  assert.deepEqual(
    deniedEvents.map(event => [event.eventType,event.outcome]).sort(),
    [["POLICY_READ_DENIED","DENIED"],["POLICY_WRITE_DENIED","DENIED"]],
  );

  const revoked = await denyRequest(owner, "PATCH", `/${policyId}`, { reason: "HTTP integration revoke" });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.equal(revoked.body.revoked, true);
  const secondRevoke = await denyRequest(owner, "PATCH", `/${policyId}`, { reason: "repeat revoke" });
  assert.equal(secondRevoke.status, 404);
});

test("concurrent real HTTP creates for the same membership/scope yield one policy and one conflict", async () => {
  const owner = await createActor("concurrent-owner", "ORG_OWNER");
  const target = await createActor("concurrent-target", "ORG_MEMBER");
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
