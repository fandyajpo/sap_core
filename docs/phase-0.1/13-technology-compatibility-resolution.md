# Technology Compatibility Resolution

**Governance status: P09 `DECISION_COMPLETE` (P09.1–P09.17 `OWNER_APPROVED`). Technical status: NOT VALIDATED.** P09 approves a compatibility and lifecycle governance strategy, not exact package versions, an approved lockfile, application certification or reproducible technical tests. The registry observations below are a historical snapshot dated 2026-11-05 UTC and have not been refreshed by this closure. No package is `TECHNICALLY_VALIDATED`. See [P09 closure](../phase-0.2/p09-technology-stack-decision-closure.md), [decision register](01-decision-register.md#register) and historical [Phase 0 matrix](../phase-0/02-technology-compatibility-matrix.md).

## Candidate baseline and historical observations

The requested architecture remains Next.js + React + TypeScript, Prisma ORM/Prisma Migrate with Better Auth and CASL, PostgreSQL, and a modular monolith. The following candidate values and package observations are retained from the 2026-11-05 research snapshot for traceability only; none is selected or certified by P09 closure.

| Package group | Historical registry/documentation observation | Compatibility interpretation and gate |
|---|---|---|
| Core candidate set | Node 24.22.2 LTS; Next.js 16.4.5; React/React DOM 19.3.1; Prisma CLI/Client 7.10.1; Better Auth/Prisma adapter 1.7.17; CASL 7.1.1; Tailwind 4.3.4; Motion 14.9.1; Zod 4.6.7; React Hook Form 7.91.0/resolvers 7.0.3; TypeScript 7.0.2. | Historical candidate values only. Refresh current official registry/docs and test exact combinations before selection. |
| TanStack Query | 5.106.1; peer React 18/19. | Pin query package/core together; test Next server/client boundaries and cache isolation. |
| TanStack Table | Registry latest 9.3.1, while docs snapshot contained v8 stable/v9 alpha references. | Historical docs/registry discrepancy. Select a version with matching official docs; server filtering/pagination remains application-owned. |
| TanStack Virtual | 3.14.26; React/DOM peers include 16.8–19. | Peer range is not app validation; test SSR, accessibility and large lists. |
| date-fns | 4.4.0 historical latest. | Test business dates, instants, named time zones, DST and locale semantics. |
| Playwright | 1.64.1; Node >=20. | Browser binaries and OS dependencies must be present in actual CI. |
| ECharts | 6.1.0; Apache-2.0. | React binding/client-only loading, accessibility, data limits and exports are feature decisions. |
| Tiptap | @tiptap/react 3.32.3; React peers 17–19. | Align Tiptap package versions; validate chosen components with exact React/Next. |
| Lucide React | 1.69.0; React peer includes 19. | Verify imports/tree-shaking and notices in build. |
| Zustand | 5.0.16; React peer >=18. | Use for transient shared UI state; test SSR store isolation. |
| Sharp | 0.35.5; Node >=20.9; native libvips/platform binaries. | Validate target deployment image, resource limits and native loading. |
| Storybook | 10.6.5; optional Vite+ peer range observed as ^0.1.15 or ^0.2.0. | Do not assume compatibility with Vite+ 1.5.0; validate Next framework integration only if adopted. |
| Vite+ | 1.5.0; Node engine range includes Node 24. | Does not prove replacement or integration with Next.js build. Remains optional. |
| PDF | @react-pdf/renderer 4.9.0 vs react-pdf 11.0.0. | Distinct creation and viewing roles; choose only for a concrete feature and validate worker/fonts/security/resource behavior. |
| XLSX/SheetJS | npm xlsx 0.18.5 snapshot; CE and Pro/artifact distribution distinction. | Do not infer official current distribution from npm latest; legal/edition review required. |

## Approved P09 governance rules

- Core-first dependency baseline; optional packages are adopted only for approved concrete features.
- Pin Node.js LTS and exactly one package manager. Use the same manager/lockfile in development, CI and deployment; CI installation must be frozen/immutable. The package manager (npm, pnpm or Yarn), exact manager version and Node release remain unselected.
- Next.js is the framework and production build/runtime authority. React and React DOM follow its supported range; TypeScript follows framework/dependency support.
- Prisma CLI, Client and Migrate are one compatibility set against an explicit PostgreSQL major/provider.
- Better Auth and Prisma adapter must be compatible with Prisma; CASL remains a separate authorization engine.
- Frontend packages satisfy peer/engine constraints. Vite+ is optional and cannot replace Next.js without proven, approved integration.
- Direct/transitive dependencies are security-scanned; upgrades are reviewed and risk-tested; observability, environment parity, resilience, lifecycle and architecture authority are governed.
- Documentation/peer metadata are initial evidence only. `TECHNICALLY_VALIDATED` requires reproducible installation, build, tests and focused integration PoCs.

## Required Phase 0.3 evidence

Refresh official package/runtime data; select exact Node and package manager; resolve a single lockfile; validate clean frozen installation, peer/engine resolution, Next.js production build, TypeScript/lint/tests, Prisma ten-schema validation/client generation/migrations, Better Auth canonical identity mapping, CASL tenant isolation, dependency security scanning and target deployment. Optional packages require separate feature-specific compatibility, license and deployment evidence.

**Not performed:** package installation, lock resolution, build, typecheck, tests, Prisma generation/migration, database provisioning, native deployment validation, browser tests or legal review. See [P09 decision matrix](../phase-0.2/p09-decision-matrix.md), [traceability](../phase-0.2/p09-traceability-matrix.md) and [validation backlog](../phase-0.2/p09-phase-0.3-validation-backlog.md).
