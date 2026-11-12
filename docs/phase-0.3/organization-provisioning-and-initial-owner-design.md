# Organization Provisioning and Initial Owner Onboarding

**Status:** DESIGN PROPOSAL — approved to document; implementation not yet approved  
**Related baseline:** `v04-rls-transaction-boundary-design-proposal.md`, `v04-rls-runtime-role-contract.md`, and `v04-foundation-readiness-audit-2026-11-10.md`  
**Proposed scope:** First Organization creation and assignment of its initial `ORG_OWNER` membership  
**Database access:** No database access or changes are part of this proposal

## 1. Purpose

A newly registered Better Auth user currently has no Organization Membership. The root page asks for an Organization ID, but there is no Organization creation or initial-owner onboarding operation. The existing Organization workspace correctly requires an authenticated session and an active tenant membership, so it must not be weakened to make first-time onboarding work.

This proposal defines a separate, narrowly scoped server-side bootstrap operation that creates:

1. one Organization;
2. one ACTIVE Organization Membership for the authenticated user; and
3. one Organization Role Assignment using the sealed SYSTEM `ORG_OWNER` Role Definition.

All three records must be committed atomically or not created at all.

This operation is distinct from ordinary tenant administration. It must not be implemented by weakening tenant authorization, trusting browser-supplied identifiers, or reusing the ordinary role-grant service before an actor has tenant authority.

## 2. Current repository facts

The proposal is based on the current application and schema contracts:

- Better Auth session resolution is server-side through `auth.api.getSession({ headers: await headers() })`.
- `lockVerifiedSessionRow()` revalidates and locks the exact session row inside the protected transaction.
- `createSessionBoundScopedAccessDatabase()` deliberately exposes no unbound production database adapter. Its transaction callback locks the verified session before domain work.
- `Organization` currently contains only its UUID and timestamps. It has no name, slug, or display-name field.
- `OrganizationMembership` has statuses `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`, and `ENDED`.
- A partial unique index, `organization_membership_user_slot_key`, permits at most one membership per user whose status is `ACTIVE` or `SUSPENDED`.
- The SYSTEM `ORG_OWNER` Role Definition exists at Organization scope and has a sealed permission snapshot.
- `grantRoleAssignment()` invokes ordinary tenant authorization before inserting an assignment. Its authorization path requires an existing active membership, so it cannot grant the first owner role.
- There is no Organization lifecycle audit table in the current Prisma schema.
- The current foundation-readiness audit lists Organization creation/deletion and membership onboarding/lifecycle as deliberately out of scope and not implemented. This proposal does not retroactively change that approved scope.

## 3. The bootstrap dependency

The existing RLS policies create a deliberate cycle for a user with no membership:

- `core.organization` is writable only when `id` matches transaction-local `app.organization_id`.
- `core.organization_membership` has a tenant write policy whose `WITH CHECK` requires `organizationId` to match `app.organization_id`.
- Before Organization context exists, the membership SELECT bootstrap policy exposes only the actor's own ACTIVE membership.
- The ordinary tenant resolver can set `app.organization_id` only after it has resolved an existing ACTIVE membership.
- Organization role-assignment visibility/insertion depends on the typed parent membership being visible.

Therefore the ordinary tenant-context sequence cannot create the first Organization and first membership. Accepting an Organization ID from the browser and setting it as context would turn a tenant selector into an untrusted authorization input.

## 4. Proposed security model

### 4.1 Separate server-only bootstrap operation

Introduce a dedicated server-only domain operation, conceptually:

`provisionInitialOrganization({ sessionIdentity, ...approvedProfileFields })`

The exact API/service names are implementation details to be settled during backend scoping. The operation must:

- be called only after Better Auth has returned a verified server session;
- derive the actor exclusively from `session.user.id`;
- derive the session exclusively from `session.session.id`;
- never accept `actorUserId`, `organizationId`, membership IDs, role IDs, or tenant GUC values from the client;
- use one interactive Prisma transaction for session revalidation, actor locking, bootstrap context, all inserts, and the success audit;
- never use `MIGRATION_DATABASE_URL` or a migration/owner connection in a request handler;
- never expose a general-purpose unbound Prisma-backed tenant adapter.

The operation must not be callable from client components or background jobs without a separately designed principal and authorization contract.

### 4.2 Transaction sequence

The proposed sequence is:

1. Resolve the Better Auth session on the server before opening the transaction.
2. Open one interactive Prisma transaction.
3. Call `lockVerifiedSessionRow()` with the exact session ID and user ID from that verified session. If the row is expired, deleted, or no longer belongs to that user, abort.
4. Lock the matching `core.user` row with `SELECT ... FOR UPDATE` using the verified user ID. Do not accept a user ID from request data. This serializes concurrent bootstrap attempts by the same actor. Confirm lock ordering against the existing session-revocation implementation before implementation.
5. Check for an existing visible ACTIVE membership for the actor. If found, return a stable conflict result rather than creating another Organization.
6. Generate a fresh Organization UUID inside trusted server code. The client must not choose it.
7. Set `app.user_id` to the verified actor ID and `app.organization_id` to the server-generated Organization UUID using transaction-local `set_config(..., true)`. This is the explicit bootstrap exception to the ordinary rule that Organization context is installed only after membership resolution. It is allowed only inside this dedicated operation, after session verification and actor locking.
8. Insert the Organization using the generated UUID.
9. Insert the actor's Organization Membership with status `ACTIVE`.
10. Resolve the SYSTEM Organization-scope `ORG_OWNER` Role Definition by its stable code/scope and verify that it is SYSTEM, enabled, and sealed. Do not trust a role-definition ID supplied by the client.
11. Insert the Organization Role Assignment for the new membership, with `grant_actor_user_id` set to the verified actor, `is_break_glass = false`, and no break-glass reason. Do not route this through the ordinary tenant grant authorization callback; this is a distinct bootstrap authorization rule.
12. Insert the Organization-created success audit event in the same transaction.
13. Commit. Any exception rolls back all Organization, membership, assignment, and audit writes.

All GUC values must be transaction-local. Session-level `SET` is prohibited. The transaction callback must not use the global Prisma singleton for protected reads or writes.

### 4.3 Why the server-generated context is bounded

The bootstrap context is not evidence of tenant authorization by itself. Its safety depends on all of these controls together:

- verified Better Auth session and exact session-row lock;
- actor ID derived only from that session;
- server-generated Organization UUID;
- user-row lock and current-membership conflict handling;
- one fixed operation that can create only one Organization, one ACTIVE membership for the actor, and the sealed SYSTEM `ORG_OWNER` assignment;
- no client-controlled GUCs or tenant IDs;
- atomic transaction and rollback;
- database constraints and append-only audit;
- ordinary tenant authorization remains unchanged for all subsequent operations.

The implementation must not expose a generic helper that lets callers set arbitrary `app.organization_id` values.

## 5. Concurrency and membership-slot behavior

The existing partial unique index remains authoritative:

`UNIQUE (userId) WHERE status IN ('ACTIVE', 'SUSPENDED')`

The implementation should also lock the verified actor's `core.user` row before checking membership state and creating records. The row lock serializes two requests for the same user when both use the same database.

Expected behavior:

- Existing ACTIVE membership: return a conflict; do not create another Organization.
- Existing SUSPENDED membership: the existing partial unique index must prevent provisioning. Because the current pre-context SELECT policy exposes only ACTIVE self-memberships, the application must not assume it can read a SUSPENDED row. Map the unique-constraint failure to a safe conflict without disclosing another tenant's identity.
- Existing REVOKED, ENDED, or PENDING membership: these statuses do not occupy the current ACTIVE/SUSPENDED slot. Product policy for whether they permit a fresh Organization should be explicitly confirmed before implementation.
- Two concurrent requests: one may succeed; the other must observe the resulting membership or fail on the unique index. There must never be two ACTIVE/SUSPENDED memberships or a partially created Organization.
- Retry after an uncertain network response: the caller must be able to resolve the user's current membership through the normal authenticated flow. A generic retry must not create a second Organization.

Do not add an idempotency table or change the membership index without a separately reviewed need.

## 6. RLS and database privilege gate

The proposed transaction-local context matches the current Organization and membership policy predicates: the generated Organization ID is installed before the Organization insert, and the same value matches the membership's `organizationId`. The Organization role-assignment policy checks for a visible typed parent membership; after the membership insert, that parent exists in the same transaction.

This does **not** prove that the deployed database credential enforces RLS.

The repository's hosted database evidence and operations documentation record that the configured Prisma Postgres credential was observed as a PostgreSQL superuser, and the provider workflow rejected creation of a separate restricted runtime role. PostgreSQL superusers bypass RLS regardless of `rolbypassrls`. The V04 runtime-role contract requires a non-superuser, non-table-owner role without `BYPASSRLS`, but hosted compliance remains blocked.

Consequently:

- Do not claim that the proposed GUC/RLS sequence is a hosted database security boundary until the actual runtime credential is verified.
- Do not use the migration/owner URL as a workaround.
- Do not attempt undocumented role creation, grants, or provider privilege escalation.
- Do not weaken or remove existing RLS policies to make onboarding work.
- Before production implementation/release, resolve the runtime-privilege blocker through a supported provider capability or obtain an explicit owner-approved security architecture that documents the limits of application-enforced isolation. A second URL alone is not proof of a restricted role.

A disposable PostgreSQL test role can validate the intended policy behavior, but it cannot substitute for verification of the actual hosted runtime identity.

## 7. Audit design

The current schema has role-definition, break-glass, and tenant-DENY audit records, but no Organization lifecycle audit. Do not write Organization creation into `role_definition_audit`; that table models role-definition lifecycle and has required role-specific columns.

Recommended addition for a separately approved schema increment:

`core.organization_lifecycle_audit`, append-only, with at least:

- audit event UUID;
- Organization UUID;
- actor user ID;
- event type (initially `ORGANIZATION_CREATED`);
- outcome (success);
- occurred-at timestamp;
- optional bounded request/correlation ID.

The success event must be inserted in the same transaction as Organization, membership, and owner assignment so it cannot claim success when provisioning rolls back. The table needs an explicit RLS policy scoped to its Organization, appropriate indexes, and database-level append-only protections. Do not add update/delete paths.

Failed attempts are rolled back with the transaction, so they should be handled by structured server security logging/metrics that do not trust client-supplied actor or tenant identifiers. Do not create a second transaction that records an unverified Organization ID as fact.

## 8. Organization profile/name decision

**Owner decision (2026-11-12): Named Organization onboarding is approved as the product direction.** Initial onboarding must collect and persist an Organization name; an ID-only Organization is not the intended user experience.

The current `core.organization` model has no `name`, `slug`, or display-name field. The following is the proposed schema contract for a separately reviewed schema increment:

- Add `name` to `core.organization` as a required display name.
- Proposed Prisma representation: `name String @db.VarChar(160)`.
- Validate after trimming: the value must not be empty and must not exceed 160 characters.
- Preserve the user's display casing; trimming is for boundary whitespace, not automatic title-casing.
- Do not require Organization names to be globally unique. Distinct Organizations may legitimately use the same display name.
- Do not add a slug in this increment. A stable public identifier or slug requires a separate product and uniqueness decision.
- Existing Organization rows must receive an explicit migration backfill/default strategy before the column becomes NOT NULL. Do not invent names from UUIDs or silently use placeholder names.

### 8.1 Proposed schema increment and legacy-data backfill

Use a staged, forward-only rollout. Do not combine an unconditional `ADD COLUMN name ... NOT NULL` with a fabricated default.

**Increment A — expand safely**

1. Add `core.organization.name` as nullable `VARCHAR(160)` in a new forward migration.
2. Represent the field as optional in the intermediate Prisma schema (`name String? @db.VarChar(160)`) while legacy rows may still be unresolved.
3. New application writes and the future provisioning service must require a valid non-empty name from day one; nullable storage is only a temporary compatibility state for pre-existing rows.
4. Do not add a database default. Do not derive a name from the UUID, email, owner identity, or another unverified source.
5. Existing Organization read surfaces must tolerate a null name during this transition and must not display the UUID as if it were a human-readable name.

**Backfill gate — explicit mapping only**

1. Before the backfill, obtain an authoritative inventory of existing Organization IDs from the target environment through a separately approved, read-only operation. The hosted migration state and current hosted data are not verified by this design.
2. For every existing row, require an owner-confirmed mapping from the exact Organization UUID to its intended display name. If the correct name is unknown, stop and leave the row unresolved; do not guess.
3. Review the mapping as data before applying it. The backfill must update only the explicitly listed Organization IDs and must preserve the approved display casing after trimming.
4. Verify that every mapped name is non-empty and no longer than 160 characters, that every target ID exists exactly once, and that no Organization row remains with a null name.
5. If the environment contains zero Organization rows, record that verified zero-row result as the backfill evidence; do not infer it from a local database or from an old audit.

**Increment B — contract safely**

1. Only after the backfill gate passes for the relevant environment, add a separate forward migration that changes `name` to `NOT NULL`.
2. Change the Prisma field to required: `name String @db.VarChar(160)`.
3. Keep application-level trimming/length validation. A database CHECK constraint for non-blank trimmed names may be considered in the migration review, but it must be consistent with the application's exact validation semantics.
4. Do not rewrite or squash existing migrations. Do not apply either migration to hosted or local databases as part of this design work.

This two-increment approach allows new Organizations to require names while existing records are explicitly reconciled. It also makes the point at which the database guarantees a name visible and reviewable. Whether both increments can be collapsed for a particular environment is an operational decision that requires fresh row-count and data evidence plus an approved migration plan; it is not the default design.

The onboarding UI must not ship until the write path persists the name. The final NOT NULL contract must not be declared complete until the applicable environment's backfill evidence is reviewed.

## 9. API and UI boundary

The existing root page's Organization-ID input is not an onboarding mechanism. A future authenticated onboarding route may call a dedicated server endpoint, for example `POST /api/organizations`, but that endpoint is only a candidate contract and is not implemented or approved by this document.

The client request must not include actor ID, Organization ID, membership ID, role-definition ID, or permission grants. The server response should contain only the newly created Organization identifier and the minimal state needed to route the user into the existing Organization workspace.

The existing workspace page and `requireTenantPermission(..., "organization.read")` check remain unchanged. After successful provisioning, the next request resolves the newly active membership through the ordinary tenant-context flow.

UI onboarding, invitation flows, Organization deletion, Company/Plant provisioning, and general membership lifecycle remain out of scope.

## 10. Required validation before implementation

### Unit/service tests

- unauthenticated request is rejected;
- missing, expired, revoked, or mismatched session row is rejected;
- actor identity is always taken from the verified session;
- client-supplied actor/Organization/role IDs are ignored or rejected;
- existing ACTIVE membership returns conflict;
- existing SUSPENDED membership cannot create a second current membership;
- SYSTEM `ORG_OWNER` must be Organization-scoped, enabled, and sealed;
- a non-SYSTEM, custom, disabled, unsealed, or wrong-scope role cannot be assigned;
- break-glass metadata is never set;
- any insert/audit failure rolls back every preceding insert;
- safe error mapping does not disclose another Organization's identifier.

### PostgreSQL integration/security tests

Run against disposable PostgreSQL using a non-superuser, non-owner runtime role with `BYPASSRLS = false`:

- no GUC context denies Organization insert;
- a mismatched Organization GUC denies Organization insert;
- bootstrap context permits only the generated Organization and matching membership;
- a mismatched membership Organization ID is denied;
- the assignment cannot be inserted without its typed parent membership;
- the sealed SYSTEM `ORG_OWNER` can be assigned only at Organization scope;
- transaction rollback removes Organization, membership, assignment, and audit together;
- transaction commit clears all local GUC values;
- two concurrent bootstrap attempts for one user produce exactly one current membership and no orphan Organization;
- attempts to use a different actor or arbitrary Organization ID fail;
- ordinary tenant authorization still cannot set context before resolving an existing active membership;
- runtime role cannot update/delete audit rows or mutate SYSTEM role snapshots.

Hosted runtime identity and privileges must be verified separately. CI-only evidence is not production acceptance.

## 11. Explicit non-goals

This proposal does not authorize or implement:

- Organization creation/deletion endpoints;
- membership invitation, acceptance, suspension, revocation, or removal endpoints;
- Company or Plant creation;
- a general-purpose tenant-context setter;
- changes to existing RLS policies;
- changes to Better Auth identity/session schema;
- Applying Organization name/slug schema changes or backfills (the Named Organization direction and staged design are approved for documentation only);
- migration generation or application;
- seed changes;
- hosted database access, role provisioning, or deployment;
- Organization workspace authorization bypasses.

## 12. Approval gates and implementation order

Before coding, obtain explicit approval for:

1. the bootstrap transaction contract and the temporary server-generated Organization context exception;
2. the Organization name/profile decision;
3. the Organization lifecycle audit schema;
4. the runtime database privilege/security architecture and production gate;
5. the separate backend implementation scope and its disposable-PostgreSQL test plan.

After those decisions, implementation should proceed in this order:

1. approve the Organization name schema/backfill plan and audit schema, then review each forward migration before execution;
2. server-only session-bound provisioning service;
3. API route and safe conflict/error mapping;
4. disposable PostgreSQL RLS/concurrency/adversarial tests;
5. onboarding UI and root-page navigation;
6. local verification, then separately approved deployment work.

**Current decision:** documentation only. No schema, migration, SQL, database, API, service, UI, test, build, or deployment changes are authorized by this proposal.
