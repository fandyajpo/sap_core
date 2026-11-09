import assert from "node:assert/strict";
import test from "node:test";
import { createOrganizationMembersReader } from "../src/lib/organization-members-reader-core.ts";

const organizationId = "11111111-1111-4111-8111-111111111111";

test("Organization member reader authorizes before querying tenant data", async () => {
  const events = [];
  const members = [{
    membershipId: "membership-1",
    userId: "user-1",
    name: "Example User",
    email: "user@example.test",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  }];
  const read = createOrganizationMembersReader({
    async authorize(request, permission) {
      events.push(["authorize", request, permission]);
    },
    async findMembers(id) {
      events.push(["query", id]);
      return members;
    },
  });

  assert.deepEqual(await read(organizationId), members);
  assert.deepEqual(events, [
    ["authorize", { kind: "ORGANIZATION", organizationId }, "organization.members.read"],
    ["query", organizationId],
  ]);
});

test("Organization member reader never queries when authorization is denied", async () => {
  let queried = false;
  const denied = new Error("denied");
  const read = createOrganizationMembersReader({
    async authorize() {
      throw denied;
    },
    async findMembers() {
      queried = true;
      return [];
    },
  });

  await assert.rejects(read(organizationId), (error) => error === denied);
  assert.equal(queried, false);
});
