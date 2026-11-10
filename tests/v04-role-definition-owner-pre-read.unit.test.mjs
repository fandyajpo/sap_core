import assert from "node:assert/strict";
import { test } from "node:test";
import { createRoleDefinitionService, RoleDefinitionError } from "../src/lib/role-definition-service.ts";

test("custom-role revision pre-read is constrained to the requested Organization", async () => {
  const actorUserId = "11111111-1111-4111-8111-111111111111";
  const organizationId = "22222222-2222-4222-8222-222222222222";
  const foreignRoleDefinitionId = "33333333-3333-4333-8333-333333333333";
  const statements = [];
  const database = {
    async query() {
      throw new Error("Root database queries are not expected.");
    },
    async transaction(work) {
      return work({
        async query(statement, values = []) {
          statements.push({ statement, values });
          if (statement.includes('FROM "core"."user"')) return [{ id: actorUserId }];
          if (statement.includes('FROM "core"."role_definition"')) return [];
          throw new Error("Unexpected query in owner pre-read test.");
        },
      });
    },
  };
  const authorization = {
    async initializeContext() {},
    async getDelegablePermissions() {
      throw new Error("Delegation must not be evaluated for a foreign role.");
    },
    async authorizeCreate() {
      throw new Error("Create authorization is not expected.");
    },
    async authorizeRevise() {
      throw new Error("Revision authorization must not be evaluated for a foreign role.");
    },
  };
  const service = createRoleDefinitionService(database, authorization);

  await assert.rejects(
    service.reviseCustomRole({ actorUserId, organizationId, roleDefinitionId: foreignRoleDefinitionId }),
    (error) => error instanceof RoleDefinitionError && error.code === "ROLE_DEFINITION_NOT_FOUND",
  );

  const sourceRead = statements.find(({ statement }) => statement.includes('FROM "core"."role_definition"'));
  assert.ok(sourceRead, "the source role lookup must execute");
  assert.match(sourceRead.statement, /"ownerOrganizationId"\s*=\s*\$2::uuid/);
  assert.deepEqual(sourceRead.values, [foreignRoleDefinitionId, organizationId]);
  assert.equal(statements.length, 2, "no role-family, permission, or audit query may follow a foreign-role miss");
});
