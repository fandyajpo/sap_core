# Proposed Project Structure

The application repository is currently a skeleton (only `README.md`). This is a proposed layout for the future modular monolith, not an assertion that these folders exist or an instruction to scaffold implementation during Phase 0.

```text
Sap Core/
├── README.md
├── docs/
│   └── phase-0/                 # this specification set
├── prisma/
│   ├── schema.prisma            # governed models across ten schemas
│   └── migrations/              # immutable reviewed Prisma Migrate history
├── src/
│   ├── app/                     # Next.js routes, layouts, server boundaries
│   │   └── api/                 # REST Route Handlers
│   ├── modules/
│   │   ├── core/
│   │   ├── master-data/
│   │   ├── procurement/
│   │   ├── inventory/
│   │   ├── sales/
│   │   ├── finance/
│   │   ├── production/
│   │   ├── human-resources/
│   │   └── system/
│   ├── shared/                  # narrow business-neutral primitives
│   ├── server/                  # server-only auth, Prisma lifecycle, config
│   └── ui/                      # reusable presentation components
├── tests/
│   ├── unit/
│   ├── integration/             # disposable PostgreSQL tests
│   └── e2e/
└── ...                           # manifest, lockfile, runtime/tool config later
```

## Module-internal shape

A module may separate `domain` (invariants/value objects), `application` (use cases/contracts), `infrastructure` (owner repositories/Prisma mapping), and `presentation` only where useful. Keep it proportional; avoid empty boilerplate folders. Route handlers call application contracts and translate outcomes to HTTP. The owner repository is the only normal persistence entry for its tables.

## Dependency enforcement

- App/router code may depend on public module application contracts, not private repositories.
- Module A may call Module B's public contract; it may not import B's persistence internals or mutate B's tables.
- Shared code has no business module dependencies and does not become a dumping ground.
- Prisma schema/migrations live under one centrally governed root, while ownership metadata and review approval remain module-specific.
- Tests should check cross-module import rules and database ownership conventions when tooling is chosen.

## Authentication and schema placement caveat

The conceptual `core.users` placement and Better Auth adapter model ownership are unresolved. Do not hard-code a folder/schema decision based on this proposed tree; record the owner decision first. The `integration` schema and module are intentionally omitted from active source structure.

## Tooling caveat

No `package.json`, lockfile, Prisma schema, migration, Next.js app, tests, or Vite+ config currently exists. These artifacts require a separate implementation authorization/phase; this specification itself is documentation only.