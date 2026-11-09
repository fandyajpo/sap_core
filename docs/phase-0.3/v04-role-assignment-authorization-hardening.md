# V04 role-assignment authorization hardening

**Status:** Implemented in PR review; not yet accepted as V04 production authorization wiring.

## Contract changes

- Role-assignment grant authorization receives the active transaction session used for parent/role validation and the INSERT.
- Effective-role listing now requires a separate actor identity and target user identity, and an authorization callback receives the active transaction session before the protected query.
- Both operations run inside ScopedAccessDatabase.transaction; the root database query path is not used.
- The production authorization adapter must derive the actor from a verified Better Auth session and compare it with the supplied actor identifier. The identifier alone is not trusted.
- Break-glass role grants are rejected, and no break-glass-use API is exposed, matching the owner-approved V04 policy.

## Evidence

- A focused unit suite checks same-session callback use, deny-before-query behavior, absence of root-query reads, required callbacks, and break-glass rejection.
- D7/D8 disposable PostgreSQL suites are updated to exercise the new callback signatures and actor/target distinction.
- This change does not create a production role-assignment route or production authorization adapter. It only makes the service contract safe to integrate later.
- No schema, migration, hosted database, credential, or runtime configuration changes.

V04 remains BLOCKED pending the remaining application-path integration coverage, legacy resolver disposition, and hosted Prisma Postgres risk/acceptance gates.
