# Phase 0.3 — Validation Harness Bootstrap

**Status:** initial scaffold; dependency lock and executable validation are pending.

## Scope

This branch establishes the smallest Next.js + TypeScript + Prisma + PostgreSQL harness needed to execute Phase 0.3. It deliberately does not implement ERP business modules.

## Baseline choices

- Node.js 26.0.0 pinned in `.nvmrc`; package engine constrained to Node 26.
- pnpm 10.20.0 selected as the single package manager.
- Next.js 16.4.5 with React 19.2.3.
- Prisma CLI, Client and PostgreSQL driver adapter aligned at 7.10.1.
- PostgreSQL 17.6 disposable local service.
- Ten PostgreSQL schemas declared in the Prisma datasource.
- One minimal `core.validation_records` model solely to prove schema mapping and client generation.

These exact package versions are candidate pins in this scaffold, not a compatibility certification. The pnpm lockfile must be generated and committed after dependency resolution. CI intentionally uses `--frozen-lockfile` and will not accept an uncommitted dependency graph.

## Local bootstrap

1. Install Node.js 26 and pnpm 10.20.0.
2. Copy `.env.example` to `.env`.
3. Run `docker compose up -d postgres`.
4. Run `pnpm install` and commit the generated `pnpm-lock.yaml`.
5. Run `pnpm db:validate`.
6. Run `pnpm db:generate`.
7. Run `pnpm lint` and `pnpm typecheck`.
8. Run `pnpm db:migrate:dev -- --name init_validation` against the disposable database.

Do not point migration commands at a production or shared database.

## Known limitations

- This branch has not executed package installation, lint, typecheck, Next.js build, Prisma validation/generation, migration, or database tests.
- No lockfile is included yet; frozen CI is expected to remain red until the dependency graph is resolved and committed.
- The Prisma model is a proof-of-concept only. It is not the production schema or a decision about final ERP entity shape.
- Better Auth, CASL, RLS, tenant isolation, transaction/concurrency tests, pooling, cancellation, error recovery and operational controls remain later validation stages.
- The static CI workflow currently validates lint, typecheck, Prisma schema and Client generation only. Database-backed checks will be added with their corresponding test harness.

## Exit criteria for this bootstrap

- [ ] pnpm lockfile committed.
- [ ] CI passes install, lint, typecheck, Prisma validate and Prisma generate.
- [ ] Disposable PostgreSQL starts successfully.
- [ ] Initial migration succeeds on a clean database.
- [ ] Evidence is recorded in the Phase 0.3 execution register.
