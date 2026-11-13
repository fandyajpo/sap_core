import assert from "node:assert/strict";
import test from "node:test";
import { isOrganizationMembershipSlotConflict } from "../src/lib/organization-provisioning-errors-core.ts";

test("recognizes the exact PostgreSQL membership-slot constraint", () => {
  assert.equal(isOrganizationMembershipSlotConflict({
    code: "23505",
    constraint: "organization_membership_user_slot_key",
  }), true);
});

test("recognizes the exact Prisma-wrapped membership-slot violation", () => {
  assert.equal(isOrganizationMembershipSlotConflict({
    code: "P2010",
    meta: {
      code: "23505",
      message: 'duplicate key violates unique constraint "organization_membership_user_slot_key"',
    },
  }), true);
});

test("does not translate unrelated unique constraints", () => {
  assert.equal(isOrganizationMembershipSlotConflict({
    code: "23505",
    constraint: "organization_role_assignment_pkey",
  }), false);
  assert.equal(isOrganizationMembershipSlotConflict({
    code: "P2010",
    meta: {
      code: "23505",
      message: 'duplicate key violates unique constraint "organization_pkey"',
    },
  }), false);
});

test("does not translate non-unique or malformed errors", () => {
  assert.equal(isOrganizationMembershipSlotConflict(new Error("database unavailable")), false);
  assert.equal(isOrganizationMembershipSlotConflict({
    code: "P2010",
    meta: { code: "23503", message: "foreign key violation" },
  }), false);
  assert.equal(isOrganizationMembershipSlotConflict(null), false);
});
