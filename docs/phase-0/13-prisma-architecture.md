# Prisma Architecture

## Role and boundary

Prisma ORM is the server-only access layer; Prisma Schema is the primary model declaration; Prisma Migrate governs schema evolution. Prisma Postgres is the managed platform and PostgreSQL the engine. Keep Prisma Client out of browser bundles, UI components, transport handlers' business logic, and shared client state.

## Multi-schema mapping

The accepted database has one database and ten logical schemas. Official Prisma ORM 7 documentation describes the PostgreSQL multi-schema datasource `schemas` list and per-model/enum `@@schema` mapping. Each model maps to exactly one owner schema. Schema names must match the governed list exactly. Use schema-aware relations only after validating the pinned version/provider behavior.

A generated Prisma Client may expose multiple schema models; this does not authorize unrestricted cross-module use. Encapsulate queries behind owning repositories/use cases and enforce import/dependency rules in review and tests. Cross-module reads/writes go through explicit contracts. Do not make separate Prisma clients per module as a substitute for ownership; pool/transaction coordination and generated-client semantics must be established first.

## Model and database mapping

- Use explicit mapping attributes where the selected convention requires table/column names; preserve exact schema ownership.
- Keep domain/transport DTOs separate from generated Prisma model types.
- Model relations concretely; avoid polymorphic IDs. Every relation has an explicit nullability, uniqueness, delete/update and index decision.
- Do not encode business policy in ORM hooks or trust nested writes to bypass lifecycle authorization.
- Raw SQL is an exception for a justified PostgreSQL capability; parameterize it, review its schema qualification and privilege requirements, and track it in a migration.
- Preserve exact decimal values across Prisma, JavaScript and JSON boundaries. Do not convert money to floating point.

## Version candidate and compatibility

Candidate only: `prisma@7.10.1` and `@prisma/client@7.10.1`, with Better Auth Prisma adapter `1.7.17` whose declared Prisma peer range includes 7. Current `prisma/latest` was a Prisma 8 release candidate and the reviewed adapter peer range excludes 8. Matching package versions and published peers do not establish generated-client, adapter, provider or application compatibility. Pin before using version-specific schema/generator configuration and validate all ten schema mappings.

## Better Auth model ownership

Do not accept adapter-generated models as an unreviewed migration. Decide whether Better Auth's user/session/account/verification persistence is hosted in `core` or another approved schema, how it maps to the conceptual `core.users`, who owns those writes/migrations, and how ERP membership remains distinct. Test exact adapter field names, schema and relations with the pinned version.

## Client lifecycle and connection

Use a carefully scoped server-side client lifecycle appropriate to the selected Node runtime/deployment to avoid excess connections. Prisma Postgres documents pooled application and direct migration connections; keep their configuration and credentials separate. Verify pooling and transactions using the actual platform. Do not serialize errors, raw query results, or secrets to callers.

## Validation gate

Create a minimal real Prisma schema only after Phase 0 decisions, then validate generate/type output, all schema mappings, cross-schema relation SQL, exact numerics/date fields, query ownership, and migrations against disposable PostgreSQL. No schema, generated client or database access was created here.


## Phase 0.1 mapping reconciliation

The Prisma 7 multi-schema feature is documented, but project behavior remains untested. Phase 0.1 proposes that reviewed Better Auth user/account/session/verification models be explicitly mapped into `core` and managed by Prisma Migrate; Better Auth CLI generation does not apply migrations. Exact adapter mapping, `@@schema` behavior, IDs and cross-schema relation SQL require pinned-version tests. See [identity architecture](../phase-0.1/02-better-auth-identity-architecture.md), [compatibility resolution](../phase-0.1/13-technology-compatibility-resolution.md) and [Phase 1 gates](../phase-0.1/14-phase-1-implementation-gates.md).



## P06 Finance model ownership

Any eventual CoA, account, revision, mapping and journal-account models are Finance-owned and mapped to `finance`; do not place authoritative CoA records in `master_data`. This is an ownership decision, not a ready Prisma schema: do not infer fields, indexes or relations from the logical ERD. Validate multi-schema model mapping, generated SQL, migration behavior and account-reference strategy against the pinned stack under [P06 V01–V02 and V07](../phase-0.2/p06-phase-0.3-validation-backlog.md).
