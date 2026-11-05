# Technology Compatibility Matrix

**Evidence date:** 2026-11-05 UTC (registry/documentation snapshots reviewed for this specification).  
**Interpretation:** Published metadata/documentation can show declared version ranges or supported features. It cannot prove this application builds or that the combined stack works. No manifest, lockfile, source implementation, or database exists in the implementation repository.

## Database, ORM and security-critical framework evidence

| Component | Observed evidence | Assessment | Required before adoption |
|---|---|---|---|
| Node.js | Official Node release index reported `v24.22.2` as LTS; Node `v26.13.0` was Current/non-LTS. Prisma 7.10.1 CLI/client engine range is `^20.19 || ^22.12 || >=24.0`; Next 16.4.5 requires `>=20.9.0`. | Node 24.22.2 is a plausible LTS runtime candidate satisfying these declared engine ranges. | Pin exact Node release; verify deployment/runtime support and all native modules. |
| Next.js / React | Registry metadata observed `next@16.4.5` with React and React DOM peers `^18.2.0 || ^19.0.0`; `react@19.3.1` falls within the declared peer range. | Peer-range consistency only. React DOM's matching exact package version and full build/runtime behavior are not validated. | Pin Next, React and React DOM together; build and test App Router, server actions, PDF/viewer behavior, and deployment. |
| Request interception/auth | Next.js 16 docs call the convention `proxy.ts`; `middleware` is deprecated/renamed. Proxy matcher coverage does not secure Server Actions. Next.js docs require authn/authz at each action/data boundary. Better Auth's current Next guide documents a catch-all auth route, server `getSession`, Next.js 16 Proxy patterns, and warns cookie-existence checks are optimistic only. | Use Proxy, if needed, only for redirects/optimistic UX. Never treat Proxy or a cookie-presence check as the security boundary. | Recheck exact pinned Next/Better Auth docs and test every action, route and DAL use case. |
| Prisma CLI/client | npm registry snapshots show stable `prisma@7.10.1` and `@prisma/client@7.10.1`; both declare Node engines `^20.19 || ^22.12 || >=24.0`. `prisma/latest` observed `8.0.0-rc.30` (release candidate). | Same-version Prisma 7.10.1 CLI/client is the strongest candidate pair found. Version metadata does not establish schema generation or runtime compatibility. Do not select Prisma 8 RC for the baseline. | Lock identical versions; validate schema, generated client, provider, transaction behavior and migrations. |
| Better Auth Prisma adapter | Registry metadata observed `@better-auth/prisma-adapter@1.7.17`, with `prisma` and `@prisma/client` peer ranges `^5 || ^6 || ^7`; Better Auth package observed `1.7.17`. | The declared peer ranges include the Prisma 7.10.1 candidate and exclude Prisma 8. This is declared-range compatibility only, not integration-test evidence. | Lock matching Better Auth + adapter versions; verify adapter initialization, generated model fields, migration and placement. |
| Prisma Postgres | Official provider documentation describes managed PostgreSQL 17, PgBouncer pooling, a pooled application connection and direct connection for migration work. No service was provisioned. | Provider documentation is not evidence of a selected plan, actual database major, connection settings, or backups for this project. | Verify actual major, pool/direct URLs, roles, TLS/network controls, backup and restore. |
| Prisma multi-schema | Official Prisma ORM 7 guide describes datasource `schemas`, model/enum `@@schema`, and cross-schema relations; official release material states multi-schema became GA in ORM 6.13. | Supports the design in principle for documented configurations; does not validate ten-schema mapping under a generated client. | Validate all ten schemas and relations with the exact pinned ORM/provider and inspect generated SQL. |
| Prisma Migrate / transactions | ORM 7 migration guidance uses `prisma migrate deploy`; ORM 8 RC docs describe a different plan/`db migrate` workflow and different transaction API surface. | Do not copy commands or APIs across majors. | Pin CLI, then write CI/release steps from its official versioned docs and test upgrades/fresh setup. |
| CASL | CASL project docs describe abilities and condition-to-query conversion (`rulesToQuery`); exact app package and Prisma query translator are not pinned/tested. | Policy framework direction only; filtering and authorization parity remain unverified. | Pin package; test deny/allow, tenant scope, and database query filtering. |

## Document/file package identity

| Concern | Observed official/package evidence | Assessment and gate |
|---|---|---|
| PDF creation | Official `react-pdf.org` describes a React renderer that creates PDF files in browser and server. npm `@react-pdf/renderer@4.9.0` declares React 16.8–19 peers. | Candidate for PDF generation; React peer metadata includes React 19. Validate Node/Next rendering, fonts, memory and output security. |
| PDF viewing | npm `react-pdf@11.0.0` describes displaying PDFs and declares React/React DOM 19 peers; it depends on `pdfjs-dist`. | Distinct package from `@react-pdf/renderer`. Candidate viewer only; validate browser worker setup, SSR boundaries, CSP and large-file limits. |
| XLSX / SheetJS | Official SheetJS docs identify Community Edition and document Apache-2.0 terms. Registry `xlsx/latest` observed `0.18.5` / Apache-2.0; official SheetJS site links downloadable scripts/modules via its CDN. | Do not assume the npm `xlsx` package is the current official distribution merely because the name matches. Decide CE vs Pro and artifact/source; legal must review notices/terms. No edition or API is selected. |

## Remaining approved-stack compatibility

Tailwind CSS, Motion, TypeScript, Zod, React Hook Form/resolvers, TanStack Query/Table/Virtual, Zustand, date-fns, ECharts, Tiptap, Lucide React, Sharp, Playwright, Storybook, and the precise Vite+ task are not jointly version-pinned or app-tested. Their skill references are pointers, not a certification. Verify exact versions, peer dependencies, Node/Next behavior, licenses and deployment support before adoption.

## Candidate baseline (not an approved lockfile)

A reasonable validation target is Node 24.22.2 LTS; Next 16.4.5 with a matching React/React DOM 19 release; Prisma CLI and client 7.10.1; and Better Auth plus its Prisma adapter 1.7.17. The Prisma and adapter versions have matching declared Prisma 7 peer ranges. This is a candidate set only: no install, lock resolution, build, auth integration, database connection or migration was run. Vite+ remains optional and is not part of the Next.js production build path.

## Official sources

- [Node.js releases](https://nodejs.org/en/about/previous-releases); npm registry metadata: [`prisma@7.10.1`](https://registry.npmjs.org/prisma/7.10.1), [`@prisma/client`](https://registry.npmjs.org/@prisma%2Fclient/latest), [`@better-auth/prisma-adapter`](https://registry.npmjs.org/@better-auth%2Fprisma-adapter/latest), [`next`](https://registry.npmjs.org/next/latest), and [`react`](https://registry.npmjs.org/react/latest).
- [Next.js Proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy); [Next.js data security](https://nextjs.org/docs/app/guides/data-security); [Better Auth Next integration](https://www.better-auth.com/docs/integrations/next).
- [Prisma Postgres](https://www.prisma.io/docs/postgres); [Prisma ORM v7 multi-schema](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema); [Prisma ORM 6.13 release material](https://github.com/prisma/web/blob/main/apps/blog/content/blog/orm-6-13-0-ci-cd-workflows-and-pgvector-for-prisma-postgres/index.mdx); [migrations](https://www.prisma.io/docs/orm/migrations/applying-a-migration); [transactions](https://www.prisma.io/docs/orm/fundamentals/transactions).
- PostgreSQL 17: [constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), [numeric](https://www.postgresql.org/docs/17/datatype-numeric.html), [date/time](https://www.postgresql.org/docs/17/datatype-datetime.html), [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html), [explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html), [sequences](https://www.postgresql.org/docs/17/functions-sequence.html).
- CASL: [v6 guide](https://casl.js.org/v6/en/guide/intro/) and [official ability-to-query documentation](https://github.com/stalniy/casl/blob/main/docs-src/src/content/pages/advanced/ability-to-database-query/en.md).
- PDF package metadata: [`@react-pdf/renderer`](https://registry.npmjs.org/%40react-pdf%2Frenderer/latest), [`react-pdf`](https://registry.npmjs.org/react-pdf/latest); [React PDF renderer docs](https://react-pdf.org/). SheetJS: [`xlsx` registry metadata](https://registry.npmjs.org/xlsx/latest), [CE license](https://docs.sheetjs.com/docs/miscellany/license/), and [CE docs](https://docs.sheetjs.com/).

**Verification not performed:** dependency installation/resolution, compatibility build, generated Prisma Client, Prisma schema validation, PostgreSQL migration, auth test, PDF/XLSX integration test, licensing review, or deployment test.


## Phase 0.1 compatibility addendum (2026-11-05 UTC)

The table above records the Phase 0 research boundary. Phase 0.1 additionally checked registry `latest` metadata for the remaining approved packages and official docs for TanStack Table server modes, Tiptap React alignment and Storybook/Next configuration. Snapshot observations, peer ranges, a TanStack Table registry/docs version discrepancy, a Storybook/Vite+ peer mismatch, native Sharp deployment requirements and other gates are recorded in [13](../phase-0.1/13-technology-compatibility-resolution.md). These observations do not constitute a pinned lockfile or a compatible, tested application stack. Exact package decisions remain `PROPOSED` and no compatibility result is `VALIDATED`.


## Phase 0.2 P09 governance status

P09.1–P09.17 are owner-approved and P09 is `DECISION_COMPLETE`. These decisions establish compatibility governance, not exact version selections or proof that candidate combinations work together. The evidence date and registry observations above remain a historical 2026-11-05 UTC snapshot; they were not refreshed as part of P09 closure. No package is `TECHNICALLY_VALIDATED`.

The approved approach is core-first and feature-driven: pin Node and one package manager, keep Next.js as production framework/build authority, align React/React DOM/TypeScript to supported Next.js versions, govern Prisma CLI/Client/Migrate with PostgreSQL/provider as one set, and test Better Auth/Prisma adapter/CASL integration. Vite+ remains optional. Exact versions, manager selection, lockfile, clean install, build, generated Prisma Client, migrations, security checks and deployment tests remain Phase 0.3 requirements. See [P09 closure](../phase-0.2/p09-technology-stack-decision-closure.md) and [P09 backlog](../phase-0.2/p09-phase-0.3-validation-backlog.md).
