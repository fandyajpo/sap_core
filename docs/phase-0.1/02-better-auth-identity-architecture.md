# Better Auth Identity Architecture

**Decision: `OWNER_APPROVED`** — Better Auth owns authentication, accounts and sessions; `core.users` remains the canonical ERP user identity. Exact adapter and Prisma mapping validation remains pending in Phase 0.3. See [P02](01-decision-register.md#register).

## Approved identity boundary

Use Better Auth for authentication, account linking and session mechanics. The Better Auth principal maps to the canonical ERP user identity in `core.users`; do not create a second independent ERP login identity. CASL authorization remains separate from authentication and is based on approved Core memberships, scoped roles and current policy. The conceptual ownership is selected; it is not an implemented or technically validated schema.

Better Auth's user is an authentication identity, not an employee, customer, vendor or authorization role. Keep workforce data in `human_resources.employees`; link an employee to a user only when a login is needed. An employee may have no login, and a user may have no employee. Whether one user can link to multiple employee records is a separate HR cardinality decision; do not add a uniqueness rule until selected.

## Conceptual persistence map (mapping validation pending)

| Concept | Conceptual owner | Notes |
|---|---|---|
| Canonical auth user / conceptual `core.users` | `core` | One principal ID is used by Better Auth, ERP memberships and attributable actions. Better Auth model/table/field mapping must be tested; ID scalar and naming are not fixed here. |
| Provider/credential account links | `core` | Separate rows associate provider identity and credential data with the principal. Never treat email alone as a stable external provider key. Review token storage/encryption before enabling provider tokens. |
| Sessions | `core` | Server-verified sessions. Cookie-cache behavior and expiry remain subject to P10's proposed revocation semantics; no latency is owner-approved yet. |
| Verification/reset tokens | `core` | Purpose-bound, expiring verification records; exact fields and cleanup policy follow the pinned adapter. |
| ERP organization/company/plant memberships and role assignments | `core` | Business authorization data, separate from Better Auth account/session mechanics. |
| Employee/workforce record | `human_resources` | Optional link to `core.users`; employee lifecycle and sensitive fields stay HR-owned. |

This is not a second auth schema: the Phase 0 set has no separate `auth` schema. `core` is the selected conceptual owner for the canonical ERP user and Better Auth persistence. The exact generated model, table/field mapping, ID type and Prisma schema placement remain Phase 0.3 technical validation items; they do not reopen the owner-selected identity boundary.

## Better Auth Organization plugin boundary

Do not enable the Better Auth Organization plugin by default. Its organization, member, invitation, active-organization and role structures could duplicate the SAP Core organization/company/plant hierarchy and CASL business authorization. If product later needs the plugin for a non-ERP collaboration feature, approve an explicit mapping and prove that its membership/role state cannot independently authorize ERP records. Better Auth active-organization context is never a security boundary.

## Account linking and email

Better Auth documentation states account linking is enabled by default and may implicitly link an OAuth account where email matches and provider verification/trust requirements are met. The recommendation is to disable implicit same-email linking and require an already authenticated user to initiate explicit linking with an approved verification/freshness check. Verify the exact option and behavior against the pinned Better Auth release. Do not allow an email address, domain, display name or client-supplied user ID to establish identity equivalence by itself.

## Deactivation, revocation and deletion safeguards

Define an explicit canonical user lifecycle that can block new sign-ins and protected ERP access. P10 must select existing-session revocation and freshness semantics, including latency, before protected ERP operations are implemented. Every protected operation must check current active status and active memberships; a stale session cookie or cached claim must not preserve access after revocation. Account deactivation must not erase posted/audit attribution.

P05 X06 is `OWNER_APPROVED`: `core.session.userId` and `core.account.userId` both reference `core.user.id` with `ON DELETE RESTRICT`. Direct principal deletion therefore cannot silently remove authentication records. Revoke sessions and unlink accounts only through the approved authentication lifecycle. Better Auth hard-delete remains disabled; this FK decision does not enable it or select a broader deletion/retention process. Deactivation, identity correction, email changes and lawful erasure remain distinct lifecycle operations; no legally required retention duration is inferred.

## Migration and implementation ownership

Better Auth's CLI can generate a Prisma schema for configured models/plugins but does not apply migrations. Prisma Migrate remains the only schema-evolution path. Generated auth models must be reviewed, mapped to `core` (for example, the eventual model-level schema mapping), reconciled with `core.users`, and migrated through reviewed Prisma history. Do not run code generation or migrations in Phase 0.1.

## Required validation before implementation

1. Pin Better Auth, Prisma CLI/client and adapter versions; confirm declared peer support.
2. Generate the schema for the exact auth configuration in a disposable worktree; review all model/field names, ID type, relation fields and mappings. Do not commit the generated result as authoritative without review.
3. Add the approved schema mapping, validate the Prisma schema/client, and generate fresh and upgrade migrations against disposable PostgreSQL with all ten schemas.
4. Prove create/sign-in/link/unlink/session/revoke/deactivate flows and that one user row is the only canonical identity.
5. Prove user-without-employee and employee-without-login, authorization after membership removal, stale-session revocation and audit attribution.
6. Confirm hard deletion is off unless separately approved; test account linking cannot merge identities by email alone.

## Official references

[Better Auth Prisma adapter and schema-generation/migration boundary](https://www.better-auth.com/docs/adapters/prisma); [users and accounts, account linking and optional hard deletion](https://www.better-auth.com/docs/concepts/users-accounts); [Organization plugin](https://www.better-auth.com/docs/plugins/organization); [Prisma ORM 7 multi-schema](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema).
