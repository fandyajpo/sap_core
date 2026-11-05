# Phase 0.3 — Technical Validation Execution Register

**Overall state:** `IN_PROGRESS`  
**Baseline commit inspected:** `847eff88d82967d931afed7335254d605b46cdad`  
**Rule:** A validation is PASS only when reproducible evidence exists. Missing artifacts are BLOCKED / NOT RUN, never PASS and never automatically FAIL.

| ID | Validation | Current state | Exit evidence |
|---|---|---|---|
| V00 | Repository baseline inspection | `PASS` (inventory only) | [Baseline assessment](00-repository-baseline-assessment.md) |
| V01 | Prisma multi-schema validation | `BLOCKED` | Pinned Prisma toolchain, ten PostgreSQL schemas, successful Prisma validation and Client generation |
| V02 | Cross-schema relation validation | `BLOCKED` | Representative approved FK/relation patterns, generated Client and migration proof |
| V03 | Better Auth canonical identity | `BLOCKED` | Exact adapter mapping to `core.users`, account/session persistence and integration tests |
| V04 | Tenant isolation and RLS | `BLOCKED` | Company/plant scope enforcement, RLS policy evidence where selected, cross-tenant negative tests |
| V05 | Migration/schema integrity | `BLOCKED` | Clean database migration, repeatability, drift and recovery evidence |
| V06 | Transaction/concurrency | `BLOCKED` | Interactive transaction, rollback, idempotency, race and financial/stock integrity tests |
| V07 | Pooling/session context | `BLOCKED` | Pooled connection reuse, transaction-local context isolation, cleanup and failure tests |
| V08 | Query cancellation/workload controls | `BLOCKED` | Timeout, cancellation, bounded workload and safe retry evidence |
| V09 | Error classification/recovery | `BLOCKED` | SQLSTATE/Prisma/provider error taxonomy, redaction, retry and ambiguous-outcome tests |
| V10 | Security/privilege boundaries | `BLOCKED` | Least-privilege roles, secrets handling, authz boundaries, audit and negative security tests |

## Execution sequence

### Stage 1 — Establish reproducible harness

- Confirm exact Node.js and package-manager policy.
- Pin Next.js, React, TypeScript, Prisma CLI and Prisma Client as a compatible set.
- Add a disposable PostgreSQL environment.
- Add the ten-schema Prisma proof of concept without implementing ERP workflows.
- Add deterministic install, lint/typecheck, Prisma validate/generate/migrate and test scripts.
- Add CI that runs the same commands.

### Stage 2 — Database architecture proof

- Execute V01 and V02.
- Validate migration history, drift handling and clean bootstrap for V05.
- Exercise transaction, concurrency, pooling and session context for V06/V07.
- Exercise cancellation, workload bounds and error recovery for V08/V09.

### Stage 3 — Identity, authorization and security proof

- Validate Better Auth adapter compatibility and canonical `core.users` mapping.
- Validate CASL separately from authentication.
- Validate organization/company/plant isolation and selected RLS boundaries.
- Execute P10 session validation backlog and security/privilege checks for V03/V04/V10.

### Stage 4 — Gate review

- Attach command output, test reports, migration evidence and relevant commit references.
- Record residual risks and deviations.
- Clear only gates whose complete acceptance criteria are evidenced.
- Keep Phase 1 blocked while any required gate remains unresolved.

## Current blocker

The current `main` branch has no package manifest, lockfile, application source, Prisma schema, migrations, tests or CI workflow. Therefore, V01–V10 cannot yet be executed. The next implementation task is the validation harness described in the baseline assessment.

This register is an execution tracker, not evidence that blocked validations have passed.
