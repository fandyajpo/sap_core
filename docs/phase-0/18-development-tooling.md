# Development Tooling

This is the target tool policy, not a record of installed tooling. The implementation repository contains only its one-line README; no package manifest, lockfile, application source, or tool configuration was present at Phase 0 inspection.

## Runtime and package management

Choose and pin a supported Node.js LTS runtime; Node 24.22.2 is a candidate because the reviewed Prisma 7.10.1 engine ranges accept Node 24 and Next 16.4.5 requires Node 20.9+. Select one package manager and commit its lockfile. No package manager or dependency installation was performed. Record exact versions and update cadence in a manifest/runtime file when implementation is authorized.

## Framework/tool roles

- Next.js owns its routing, rendering, compilation, bundling and supported production build/development flow.
- Vite+ is optional development tooling only. The official documentation describes `vp dev`/`vp build` as Vite workflows and `vp run` as script execution; no official Next.js compatibility guarantee was found. Keep Next.js-native workflows unless one isolated Vite+ task is proven with the pinned versions and recorded by ADR.
- TypeScript strictness and lint/format commands are selected with the app scaffold, not invented here.

## Verification layers once source exists

1. Static format/lint/type checks and lockfile integrity.
2. Unit tests for pure domain rules and validation.
3. PostgreSQL integration tests for constraints, transactions, migration and concurrency using a disposable database matching the target engine.
4. Browser-level Playwright journeys for auth, authorization denial, company scoping, posting and key flows.
5. Storybook for meaningful component states only, with Next.js integration verified against the pinned version.
6. Security checks for authorization, CSRF/origin, exports/uploads, cache isolation, redacted logs and dependency/license review.

No check is considered complete until the actual command, environment, version and result are recorded. Do not claim build/test evidence from reading documentation or checking a package peer range.

## Secrets and environments

Use separate local/test/staging/production configuration; never commit credentials or put secrets in client variables, logs, migrations or screenshots. Runtime and migration DB credentials are separate. Provider, secret manager, telemetry service, email and storage vendor are not selected here.

## File-heavy libraries

PDF rendering/generation and spreadsheet/image processing are server/client-specific and may have native/browser worker constraints. Apply upload size, MIME/content, memory, CPU/time, decompression and output-safety limits; test in the actual deploy target before enabling.

## Phase 0.2 P09 governance decisions

P09.1–P09.17 are owner-approved. Pin Node.js LTS and exactly one package manager; use lockfile-based reproducible installs and frozen/immutable CI installation. Keep Next.js native development and production build workflows authoritative. Typecheck, lint/format, unit/integration tests and Playwright E2E are explicit pipeline layers; exact lint/formatter tools remain unselected. Vite+ is optional pending a concrete tested use case. Dependency scanning, reviewed upgrades, observability, environment parity and resilience are governed requirements. Optional feature packages are added only when their feature is approved and compatibility/security/license/deployment constraints are tested.

These are owner-approved policies, not implemented automation. No package manager, CI workflow, scanner, lockfile or runtime configuration is created by this decision. See [P09 closure](../phase-0.2/p09-technology-stack-decision-closure.md) and [P09 backlog](../phase-0.2/p09-phase-0.3-validation-backlog.md).
