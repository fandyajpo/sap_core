# Database Standards

## Naming and ownership

- Use the ten accepted lowercase schema names exactly. Place a table in its owner's schema, not by the consuming UI or endpoint.
- Use consistent, explicit table/column naming in the actual Prisma schema; choose the project convention before first migration. Avoid ambiguous generic tables and polymorphic foreign keys.
- Every model/table needs one owning module, a purpose, lifecycle, organization scope, key strategy and migration owner. `integration` remains empty until separately approved.

## Identifiers and keys

- UUID is the default internal primary-key candidate. Human-readable document numbers are separate, scoped identifiers; never use a display number as the global primary key.
- Define natural-key scope and normalization explicitly (for example company + document type + fiscal scope only if owners approve those dimensions). Use database UNIQUE constraints as the durable duplicate guard.
- Set required key components `NOT NULL`. PostgreSQL treats NULLs as distinct in ordinary unique constraints; use a deliberately designed partial/nulls-not-distinct alternative only after verifying PostgreSQL/Prisma support.
- Choose FK `ON DELETE`/`ON UPDATE` actions deliberately. Do not cascade-delete posted/auditable business facts.

## Types, numeric and time semantics

- Money and precision-sensitive quantities use PostgreSQL `numeric`/`decimal`, never binary floating point for arithmetic. Define precision, scale, range, currency/unit, rounding and conversion policy per domain before modeling. A declared scale can round stored input; verify Prisma mapping and JSON representation.
- Represent an instant with timezone-aware timestamp semantics; store a separate IANA timezone when local wall-clock interpretation is itself required. Use `date` for calendar business dates, not midnight timestamps.
- Avoid unconstrained text for status/identity when domain constraints apply. Select enum/check strategy only after state transitions are governed and migration implications are reviewed.
- JSON/JSONB is permitted only for bounded variable payloads with clear semantics; relational facts stay relational.

## Constraints and indexes

- Combine NOT NULL with CHECK where required; CHECK expressions evaluate TRUE or NULL and are row-local.
- Enforce row-local ranges/relationships/uniqueness in the database. Do not use a row CHECK to sum journal lines or derive stock across rows.
- Index referencing FK columns when query/delete/update workload justifies them; PostgreSQL does not create those indexes automatically.
- Build indexes from company-scoped filters, joins, sort order and measured workload. Document partial-index predicates and lifecycle effects; avoid speculative indexing.
- Define defaults only when they encode an actual invariant. Never use application clock, database default or browser locale interchangeably without chosen semantics.

## Audit and operation

Use append-oriented audit evidence with minimized sensitive data and explicit access/retention policy; do not call it tamper-proof absent controls. Runtime and migration identities are distinct and least-privileged. Keep secrets outside schema/migration text. Review generated SQL, locks, table rewrites, index behavior, backfills and rollback/forward-repair before release.

## Version caveat

PostgreSQL semantics here are aligned to official PostgreSQL 17 docs, matching Prisma Postgres's reviewed provider page. Confirm actual engine version. Prisma mappings, supported multi-schema syntax and migration commands must match the locked CLI/client. None of these standards have been validated against a live schema.