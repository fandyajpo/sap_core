# Prisma Migrate Strategy

## Source of truth and invariants

Prisma Schema is the primary model declaration and Prisma Migrate is the governed schema-evolution mechanism. Migration files are reviewed, version-controlled and immutable after application. A corrective migration is added rather than editing applied history. `db push`/reset-style development shortcuts are not production evolution strategy.

## Version-specific workflow

The current candidate is Prisma ORM/CLI 7.10.1. ORM 7 official deployment guidance uses `prisma migrate deploy`; the current Prisma 8 release-candidate documentation describes a different migration workflow. Therefore CI/release commands must be written from the official documentation for the exact locked CLI; do not copy a command from a different major. Use Prisma Postgres's documented direct connection for migration work if confirmed for the selected deployment, and pooled connection for app runtime as appropriate.

## Migration lifecycle

1. Author a single-purpose development migration from the reviewed Prisma Schema using the pinned CLI.
2. Review generated SQL by a database owner for schema qualification, lock duration, table rewrites, defaults, indexes, constraints, data loss and all ten schemas touched.
3. Validate on a disposable database matching the selected PostgreSQL major; test both clean initialization and upgrade from the previous migration state.
4. For populated data, prefer additive/expand steps, deploy compatible code, run bounded restartable backfills, verify invariants, then contract/remove obsolete fields in a later release.
5. Deploy with a least-privileged migration identity and direct/approved connection; deploy app code only when old/new application versions are compatible with the schema transition.
6. Record migration outcome, drift/history and forward-repair plan. Restore/rollback assumptions must be tested; schema rollback does not restore lost data.

## Safety controls

- No destructive reset in shared/staging/production environments.
- No secrets in Prisma schema, migration SQL, review output or CI logs.
- No long network/CPU tasks or unbounded backfills in a schema migration/transaction.
- Preserve posted finance/inventory facts. Data repair is scoped, observable, restartable and reconciled.
- Review multi-schema DDL and cross-schema FK compatibility under the exact Prisma/PostgreSQL versions.
- Separate migration credentials from normal request credentials; grant only required DDL authority.

## Required pre-production tests

Fresh database creation; upgrade from supported prior state; migration history integrity and drift detection; direct connection; lock/timeout impact; all ten schemas; cross-schema FK create/drop if approved; backfill interruption/restart; rollback/forward repair; and backup/restore. No migration has been created or applied in Phase 0. These instructions are design gates, not runnable commands.