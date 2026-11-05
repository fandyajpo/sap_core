# Chart-of-Accounts Ownership — P06 Closure Reference

**Current decision:** `OWNER_APPROVED` by Phase 0.2 P06. **Sole owner:** `finance`. **Scope:** company-owned; plants use the company's chart. See the [P06 closure](../phase-0.2/p06-chart-of-accounts-decision-closure.md), [decision matrix](../phase-0.2/p06-decision-matrix.md) and [Phase 0.3 validation backlog](../phase-0.2/p06-phase-0.3-validation-backlog.md).

## Supersession record

This Phase 0.1 document originally recommended Finance ownership with `PROPOSED` status and retained the Phase 0 `master_data` placement pending approval. That recommendation is superseded. The project owner explicitly selected P06.1–P06.26 in the Phase 0.2 decision discussion. Current architecture assigns all authoritative CoA definitions, account identity/records, classification, hierarchy, lifecycle and governance to Finance. `master_data` does not own or duplicate CoA/account definitions. This decision is documentation-level owner approval; it is not technical validation, a physical model, or an instruction to migrate a database. No database exists in this repository.

## Current architectural direction

- Each company owns its independent CoA; it has one active primary chart for posting in the relevant period. Plants use their company's chart and have no independent CoA.
- Platform and organization templates are Finance-governed initialization sources only. Applying one copies into independent company-owned account records, records source/version provenance, and does not propagate later template edits.
- Consolidation uses a separate chart and versioned/effective-dated account mapping. It does not merge or share company CoAs or rewrite original journals.
- Account ID and company ownership are immutable. Controlled revisions, CoA version transition, account lifecycle, reporting mappings, posting eligibility and reporting snapshots follow the decisions in P06.1–P06.26.
- Finance is the sole write owner. Consumers use Finance application contracts or permission-controlled read models; Finance's authoritative posting validation is not replaced by a caller-side check.
- Better Auth identity, Core membership/company scope and CASL authorization remain P02–P04 shared platform concerns. P06 introduces no Finance-specific login, tenant or authorization model.

## Historical option evaluation (retained as rationale)

| Former option | Historical consideration | P06 outcome |
|---|---|---|
| `master_data` ownership | The Phase 0 context classified the chart as reusable reference data, but this could blur accounting governance and posting eligibility. | Superseded. No authoritative CoA/account definitions belong in `master_data`. |
| `finance` ownership | Aligns chart structure, account eligibility, lifecycle, posting controls and historical use with the accounting owner. Consumers need narrow owner contracts. | Selected and `OWNER_APPROVED`. |

## Validation boundary

P06 approves architecture, not exact table/column/index/FK representation. Validate Prisma multi-schema mapping and migrations, company-scoped uniqueness, effective-date overlap, hierarchy integrity, account/version history, journal references, readiness/posting, authorization, concurrency, reports, currency, consolidation and provider recovery through V01–V22. Do not mark a test passed without reproducible pinned evidence. P02–P10 and jurisdiction-specific accounting/tax/retention gates remain independently applicable.
