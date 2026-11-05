# P09 Technology Stack Decision Traceability

**P09 state:** P09.1–P09.17 `OWNER_APPROVED`; P09 `DECISION_COMPLETE`. This records dependencies and required evidence, not test results.

| Decision range | Concern | Architecture references | Dependencies | Phase 0.3 evidence |
|---|---|---|---|---|
| P09.1–P09.2 | Core baseline, runtime, package manager, lockfile | [Stack](../phase-0/01-technology-stack.md), [tooling](../phase-0/18-development-tooling.md), [compatibility resolution](../phase-0.1/13-technology-compatibility-resolution.md) | P08, G09 | V01–V03 |
| P09.3–P09.4 | Next/React/TypeScript and Prisma/PostgreSQL | [Compatibility matrix](../phase-0/02-technology-compatibility-matrix.md), [Prisma architecture](../phase-0/13-prisma-architecture.md), [migration strategy](../phase-0/14-prisma-migration-strategy.md) | P08, G08/G09 | V04–V08 |
| P09.5 | Better Auth, Prisma adapter, CASL | [Identity](../phase-0.1/02-better-auth-identity-architecture.md), [authorization](../phase-0.1/04-authorization-scope-model.md) | P02, P04, P08, P10 | V09–V11 |
| P09.6–P09.8 | Frontend peers, hybrid toolchain, optional packages | Stack, tooling, compatibility resolution | P09.3, feature scope | V12–V14 |
| P09.9–P09.10 | Dependency security, upgrades, CI gates | Tooling, Phase 1 gates | P09.1–P09.8, security policy | V15–V17 |
| P09.11–P09.13 | Observability, environment parity, resilience | Tooling, database operations | P08, G10 | V18–V20 |
| P09.14–P09.15 | Technology lifecycle and change authority | Architecture decisions, decision register | Architecture governance | V21 |
| P09.16–P09.17 | Compatibility evidence and closure gate | Phase 1 gates, validation report | P02–P10, G01–G11 | V22–V23 |

## Cross-decision boundaries

P02 owns canonical identity; P04 owns authorization architecture; P05/P07 govern relation integrity and domain ownership; P08 governs the single Prisma client/migration baseline; P10 session freshness/revocation remains open; G10 database roles, pooled/direct paths, TLS/network and recovery objectives remain separate.

P09 does not authorize microservices, a different ORM/database, a Vite-based replacement of Next.js, automatic installation of optional packages or production deployment.
