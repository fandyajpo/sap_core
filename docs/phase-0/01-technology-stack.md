# Technology Stack and Responsibility Boundaries

This specification follows the approved stack in `sap_core_skills/SAP_CORE_CONTEXT.md`. It identifies responsibilities, not an installed dependency manifest. Exact package versions are candidates only where explicitly stated in the compatibility matrix.

| Concern | Approved technology | Responsibility and boundary |
|---|---|---|
| Application | Next.js, React, TypeScript | Next.js owns routing, rendering, server boundaries and its own supported production build. React composes UI. TypeScript is static analysis, not runtime input validation. |
| Runtime/tooling | Node.js; Vite+ evaluation only | Choose a supported Node LTS release and pin it. Use native Next.js workflows for app tasks. Do not assume Vite+ replaces Next.js. |
| Styling/interaction | Tailwind CSS; Motion | Tailwind is the primary styling system; use Motion only for purposeful, accessible transitions and honor reduced-motion preferences. |
| Database platform/engine | Prisma Postgres / PostgreSQL | Prisma Postgres is the managed platform; PostgreSQL is the relational engine. A PostgreSQL major shown in provider documentation is not proof of a provisioned instance. |
| Data access/schema change | Prisma ORM / Prisma Migrate | Prisma Client is server-only. Prisma Schema is the model declaration; reviewed migrations are the sole governed schema-evolution path. Raw SQL is exceptional and documented. |
| Authentication/authorization | Better Auth / CASL | Better Auth handles identity and session mechanics. CASL expresses application abilities/conditions. Both authentication and authorization are checked on protected server operations. |
| Validation/forms | Zod / React Hook Form | Zod validates untrusted data at server boundaries and can be reused by forms. React Hook Form owns interactive form lifecycle; client validation never replaces server validation. |
| State | TanStack Query, Zustand, React state, URL state | Query: remote/server state. Zustand: shared transient client/UI state. React state: component-local state. URL: shareable navigation/filter state. Do not duplicate server data as independent authority. |
| Data-heavy UI | TanStack Table / TanStack Virtual | Table interaction and optional measured virtualization. ERP-scale filtering, ordering and pagination remain server-side and bounded. |
| Dates | date-fns | Formatting/parsing utilities only; explicitly distinguish instants, business dates, and named business time zones. |
| Visualization/content | ECharts, Tiptap, React PDF, Lucide React | Charts, controlled rich-text editing, PDF rendering/generation, and icons respectively. Rich content and documents remain untrusted/output-sensitive. |
| File processing | Sharp, XLSX | Server-side image processing and spreadsheet import/export with content checks, limits, safe formulas/values, and bounded resource use. Package/edition must be approved. |
| Quality | Playwright, Storybook | Browser-level journeys and isolated component examples/tests. Exact Next.js/test integration remains to be proven with pinned versions. |
| API | Internal REST | Resource-oriented application API with validated contracts, server-side authn/authz, bounded pagination, stable errors, and safe output DTOs. No external integration platform is implied. |

## Proposed versioning approach

Use an exact lockfile and runtime version before implementation. Current registry snapshots show a plausible stable Prisma 7 CLI/client pair and a Better Auth adapter whose declared peer range includes Prisma 7; this is a candidate, not a tested combination. Node 24 LTS and the current Next.js/React metadata are also candidates only. Do not use a Prisma 8 release candidate as the baseline while the reviewed Better Auth adapter peer range excludes Prisma 8.

The precise observations, source URLs, and remaining verification gates are in [the compatibility matrix](02-technology-compatibility-matrix.md). Other approved libraries remain unpinned and are not certified as one compatible stack.