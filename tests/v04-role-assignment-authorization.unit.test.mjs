import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRoleAssignmentService,
  RoleAssignmentError,
} from "../src/lib/role-assignment-service.ts";

const actorUserId = "11111111-1111-4111-8111-111111111111";
const targetUserId = "22222222-2222-4222-8222-222222222222";
const parentId = "33333333-3333-4333-8333-333333333333";
const roleDefinitionId = "44444444-4444-4444-8444-444444444444";
const organizationId = "55555555-5555-4555-8555-555555555555";

function createHarness({ allowGrant = true, allowList = true } = {}) {
  const calls = [];
  const session = {
    async query(statement, values = []) {
      calls.push({ statement, values });
      if (statement.includes('FROM "core"."user"')) return [{ id: actorUserId }];
      if (statement.includes('FROM "core"."role_definition"')) {
        return [{ id: roleDefinitionId, scope: "ORGANIZATION", kind: "SYSTEM", ownerOrganizationId: null, disabledAt: null, permissionsLockedAt: new Date("2026-11-09T00:00:00.000Z") }];
      }
      if (statement.includes('FROM "core"."organization_membership"')) {
        return [{ id: parentId, organizationId }];
      }
      if (statement.includes('INSERT INTO "core"."organization_role_assignment"')) {
        return [{
          id: "66666666-6666-4666-8666-666666666666",
          scope: "ORGANIZATION",
          parentId,
          roleDefinitionId,
          grantActorUserId: actorUserId,
          isBreakGlass: false,
          breakGlassReason: null,
          createdAt: new Date("2026-11-09T00:00:00.000Z"),
          revokedAt: null,
        }];
      }
      if (statement.includes('FROM "core"."organization_role_assignment"')) return [];
      return [];
    },
  };
  const database = {
    async query() {
      throw new Error("Role-assignment operations must not use the root database query.");
    },
    async transaction(work) {
      return work(session);
    },
  };
  const authorization = {
    async authorizeGrant(input, transactionSession) {
      assert.equal(transactionSession, session);
      assert.equal(input.actorUserId, actorUserId);
      return allowGrant;
    },
    async authorizeList(input, transactionSession) {
      assert.equal(transactionSession, session);
      assert.equal(input.actorUserId, actorUserId);
      assert.equal(input.userId, targetUserId);
      return allowList;
    },
  };
  return { service: createRoleAssignmentService(database, authorization), calls, session };
}

test("grant authorization runs inside the exact transaction used for persistence", async () => {
  const { service, calls, session } = createHarness();
  const result = await service.grantRoleAssignment({
    scope: "ORGANIZATION",
    parentId,
    roleDefinitionId,
    actorUserId,
  });
  assert.equal(result.grantActorUserId, actorUserId);
  assert.ok(calls.some((call) => call.statement.includes("INSERT INTO")));
  assert.equal(session.query instanceof Function, true);
});

test("effective-role reads require an actor-bound authorization decision in the same transaction", async () => {
  const { service, calls } = createHarness();
  const result = await service.listEffectiveRoleAssignments({
    actorUserId,
    userId: targetUserId,
    scope: "ORGANIZATION",
    parentId,
  });
  assert.deepEqual(result, []);
  assert.ok(calls.some((call) => call.statement.includes('FROM "core"."organization_role_assignment"')));
});

test("denied effective-role reads do not execute the protected query", async () => {
  const { service, calls } = createHarness({ allowList: false });
  await assert.rejects(
    service.listEffectiveRoleAssignments({
      actorUserId,
      userId: targetUserId,
      scope: "ORGANIZATION",
      parentId,
    }),
    (error) => error instanceof RoleAssignmentError && error.code === "AUTHORIZATION_DENIED",
  );
  assert.equal(calls.some((call) => call.statement.includes('FROM "core"."organization_role_assignment"')), false);
});

test("break-glass is rejected before opening a transaction", async () => {
  const { service, calls } = createHarness();
  await assert.rejects(
    service.grantRoleAssignment({
      scope: "ORGANIZATION",
      parentId,
      roleDefinitionId,
      actorUserId,
      breakGlass: { reason: "approved incident" },
    }),
    (error) => error instanceof RoleAssignmentError && error.code === "BREAK_GLASS_ACCESS_DENIED",
  );
  assert.deepEqual(calls, []);
  assert.equal(service.recordBreakGlassUse, undefined);
});

test("the factory requires both transaction-bound authorization callbacks", () => {
  const database = { query: async () => [], transaction: async (work) => work({ query: async () => [] }) };
  assert.throws(
    () => createRoleAssignmentService(database, { authorizeGrant: async () => true }),
    /Transaction-bound Role Assignment grant and list authorization policies are required/,
  );
});
