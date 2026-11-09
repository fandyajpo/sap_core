import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRoleAssignmentAuthorization,
  RoleAssignmentAuthorizationError,
} from "../src/lib/role-assignment-authorization-core.ts";

const actorId = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const organizationId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";

function harness({ actorMember = true, targetMember = true, deny = false } = {}) {
  const statements = [];
  const session = {
    async query(statement, values = []) {
      statements.push({ statement, values });
      if (statement.includes('FROM "core"."organization_membership"') && statement.includes('"id" = $1')) {
        return targetMember
          ? [{ id: membershipId, organizationId, userId: recipientId, status: "ACTIVE" }]
          : [];
      }
      if (statement.includes('FROM "core"."organization_membership"') && statement.includes('"userId" = $1')) {
        return actorMember ? [{ id: "55555555-5555-4555-8555-555555555555" }] : [];
      }
      if (statement.includes('FROM "core"."organization_role_assignment"')) {
        const rows = [{
          assignmentId: "66666666-6666-4666-8666-666666666666",
          roleCode: "ORG_ADMIN",
          roleKind: "SYSTEM",
          roleScope: "ORGANIZATION",
          scopeId: organizationId,
          ownerOrganizationId: null,
          permissionCode: "roles.assign",
          effect: "ALLOW",
        }];
        if (deny) rows.push({ ...rows[0], assignmentId: "77777777-7777-4777-8777-777777777777", effect: "DENY" });
        return rows;
      }
      return [];
    },
  };
  return { session, statements };
}

test("role grant authorization rejects a supplied actor that differs from verified session", async () => {
  const { session, statements } = harness();
  const policy = createRoleAssignmentAuthorization(actorId, organizationId);
  await assert.rejects(
    policy.authorizeGrant({
      actorUserId: recipientId, scope: "ORGANIZATION", parentId: membershipId,
      roleDefinitionId: "88888888-8888-4888-8888-888888888888",
    }, session),
    RoleAssignmentAuthorizationError,
  );
  assert.equal(statements.length, 0);
});

test("organization admin grant authorizes a valid same-organization membership target", async () => {
  const { session, statements } = harness();
  const policy = createRoleAssignmentAuthorization(actorId, organizationId);
  assert.equal(await policy.authorizeGrant({
    actorUserId: actorId, scope: "ORGANIZATION", parentId: membershipId,
    roleDefinitionId: "88888888-8888-4888-8888-888888888888",
  }, session), true);
  assert.ok(statements.some(({ statement }) => statement.includes("set_config")));
});

test("cross-organization or inactive target membership fails closed", async () => {
  const { session } = harness({ targetMember: false });
  const policy = createRoleAssignmentAuthorization(actorId, organizationId);
  assert.equal(await policy.authorizeGrant({
    actorUserId: actorId, scope: "ORGANIZATION", parentId: membershipId,
    roleDefinitionId: "88888888-8888-4888-8888-888888888888",
  }, session), false);
});

test("target-scope DENY overrides an otherwise matching role assignment permission", async () => {
  const { session } = harness({ deny: true });
  const policy = createRoleAssignmentAuthorization(actorId, organizationId);
  assert.equal(await policy.authorizeGrant({
    actorUserId: actorId, scope: "ORGANIZATION", parentId: membershipId,
    roleDefinitionId: "88888888-8888-4888-8888-888888888888",
  }, session), false);
});

test("effective-role listing requires roles.read and the requested user membership", async () => {
  const { session } = harness({ targetMember: false });
  const policy = createRoleAssignmentAuthorization(actorId, organizationId);
  assert.equal(await policy.authorizeList({
    actorUserId: actorId, userId: recipientId, scope: "ORGANIZATION", parentId: membershipId,
  }, session), false);
});
