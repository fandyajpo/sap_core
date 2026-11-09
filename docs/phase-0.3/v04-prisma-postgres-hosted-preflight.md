# V04 Prisma Postgres Hosted Read-only Preflight

**Status:** Prepared; NOT RUN. This document does not authorize a hosted connection, migration, privilege change, deployment update, or production smoke test.

## Purpose

Collect a bounded, read-only snapshot of the selected Prisma Postgres database before deciding whether hosted validation can proceed. The project has explicitly retained Prisma Postgres. Application-layer authorization is the primary tenant security boundary; the provider's generated credentials are not a restricted runtime-role boundary.

## Safety rules

- Never paste a real connection URL, username/password combination, token, or secret into chat, GitHub issues, PRs, shell history, or logs.
- Confirm the intended Prisma Postgres project and database in the provider dashboard before connecting.
- Use the direct host only for this one-off catalog inspection: `db.prisma.io:5432`, database `postgres`, TLS required.
- Do not run `prisma migrate`, application seed scripts, reset scripts, DDL, DML, or application routes.
- The SQL file begins a read-only transaction and ends with ROLLBACK. It reads PostgreSQL catalog metadata and migration-history aggregates only; it does not select invoice/customer/tenant rows.
- Review the SQL before execution. Stop if the connection target does not match the intended project.
- Do not upload raw terminal output if it contains identifiers you do not want in repository history. The report should contain only the redacted fields listed below.

## Run

Use the exact direct host structure previously confirmed, but do not put the password in the command. Replace only `<DATABASE_USERNAME>` with the username from the provider dashboard. `psql -W` prompts for the password interactively.

```bash
set -Eeuo pipefail
set +x

psql "host=db.prisma.io port=5432 dbname=postgres user=<DATABASE_USERNAME> sslmode=require connect_timeout=10" \
  -X -W -v ON_ERROR_STOP=1 \
  -f scripts/v04-hosted-read-only-preflight.sql
```

The password is entered at the interactive prompt. Do not use `PGPASSWORD`, shell tracing, or a URL containing credentials in the command line. If the provider's dashboard gives a different database name, host, or username for the selected project, stop and reconcile it before running; do not guess.

## What the output means

1. **Identity/version:** database, effective role, authenticated role, PostgreSQL version, and transaction read-only flag. Verify the role is the one actually represented by the credential you intend to use.
2. **Role flags:** superuser, role/database creation, replication, and `BYPASSRLS`. A superuser or `BYPASSRLS` credential bypasses RLS. Prisma Postgres credentials are documented as full-access credentials; this is evidence of effective identity, not a way to provision a restricted role.
3. **Memberships:** role memberships visible to the current credential.
4. **RLS catalog:** relation names and whether RLS/FORCE RLS are enabled. This reports configuration only; it does not prove the current credential is subject to RLS.
5. **Migration table location:** identifies where `_prisma_migrations` exists.
6. **Migration aggregates:** the final aggregate query assumes the table is at `public._prisma_migrations`. If the location query shows another schema or no table, do not edit the query and retry ad hoc; report the observed location and prepare a reviewed follow-up read-only query first.

## Redacted evidence to return

Return only:
- provider/project nickname (not project IDs or credentials);
- database name if non-sensitive;
- PostgreSQL major/minor version;
- effective role flags: `rolsuper`, `rolbypassrls`, `rolcreaterole`, `rolcreatedb`, `rolreplication`;
- whether role memberships were returned (names can be redacted);
- RLS enabled/forced counts by schema, plus whether expected V04 tables are present;
- migration table schema and aggregate successful/rolled-back/unfinished counts, if safely available;
- any permission errors, with secrets and host-specific identifiers removed.

Do not return a full connection string or password.

## Acceptance boundary

This preflight does not establish application authorization correctness, deployment-secret correctness, migration compatibility, production behavior, or V04 PASS. It is metadata-only evidence. A separate reviewed plan and explicit approval are required before any hosted migration, deployment-secret change, write operation, or production smoke test.

Because Prisma Postgres credentials have full database access, pooled and direct URLs are workload-routing variants, not privilege-separated identities. Keep the accepted residual risk explicit.
