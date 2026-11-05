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


## P06 CoA ownership correction and migration boundary

P06 corrects the former documentation placement to Finance ownership; no database or legacy CoA records exist in this repository, and this documentation correction is not a data migration. If an implementation later has legacy records, an owner-reviewed, restartable backfill/reconciliation/rollback plan is required before changing schema. Preserve account IDs and posted journal history. Validate the eventual Finance schema and every migration with pinned Prisma/PostgreSQL versions; see [V01–V07](../phase-0.2/p06-phase-0.3-validation-backlog.md).


## Phase 0.2 P08 migration governance closure

P08.1–P08.93 are owner-approved and P08 is decision-complete. The approved direction retains one governed Prisma Migrate history for the initial database, domain-owned migration authorship under central governance, forward-only default evolution, drift detection and reviewed reconciliation, dedicated release identity/pipeline, clean and upgrade migration evidence, and controlled forward recovery. This does not mean a migration history or executable pipeline already exists.

The initial deployment remains one PostgreSQL database with ten schemas. Multi-database fleet migrations and tenant relocation are future governed capabilities, activated only through a scoped phase with provider evidence. Validate actual CLI behavior against the exact P09-pinned Prisma version and G10 connection/role decisions. See [P08 closure](../phase-0.2/p08-prisma-multi-schema-decision-closure.md) and [P08 validation backlog](../phase-0.2/p08-phase-0.3-validation-backlog.md).
