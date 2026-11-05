# Chart-of-Accounts Ownership

**Recommendation: `finance` owns the chart of accounts. Decision status: `PROPOSED`.** The Phase 0 `master_data.chart_of_accounts` placement remains historical and in force until the finance and master-data owners explicitly approve a superseding decision. See [P06](01-decision-register.md#register).

## Evaluation

| Option | Strengths | Costs / risks |
|---|---|---|
| `master_data` | Fits Phase 0's accepted context and the skills guidance that treats a chart as reusable reference data; makes it visible to consumers as a master-data reference. | Accounting semantics, chart structure, account eligibility, posting controls and effective change are finance-owned. A general master-data module may appear to own accounting policy or permit edits that affect posting. Finance then depends on another module for a core accounting fact. |
| `finance` | Aligns ownership with accounting control: chart lifecycle, account classification, posting eligibility, control-account rules and historical use are governed by finance. Finance can version/activate accounts and enforce posting contracts without handing accounting decisions to master data. | Other modules need a narrow finance reference/query contract; a chart may be reused across companies or supplied from an external accounting setup, which must not be assumed. Consumers must not write finance-owned records. |

**Preferred direction:** place the authoritative chart and account records in `finance`. `master_data` may own reusable non-accounting descriptive references where genuinely shared, but not the accounting chart's posting semantics. This recommendation follows the financial-accounting ownership boundary and the user's stated preference; neither is an owner approval to move the historical entity.

## Scope and lifecycle decisions still required

Owners must decide whether a chart is scoped to one legal company, an organization/group, a company assignment to a shared chart, or a reusable template plus company-specific accounts. Do not infer country-specific account numbering, mandatory account categories, statutory layouts, fiscal periods or consolidation policy. Decide:

- chart/account key scope and natural-key uniqueness;
- whether accounts are parent/child, and allowed hierarchy depth/rollups;
- account type/normal balance and posting eligibility policy;
- effective dates, versioning, inactivation and reassignment rules;
- company-to-chart association and whether historical postings bind to a chart/account version;
- account code/name snapshots required on posted journal lines;
- deletion/correction behavior and safe module read contracts.

## Cross-module contract and posted history

If finance ownership is approved, finance publishes a read/validation contract for account selection; other modules may request accounting effects but may not mutate chart/account records. Journal lines should reference the account identity within finance and preserve whatever account-code/name/classification snapshot is approved for posted history. A posted entry must remain interpretable even if the chart later changes; the exact snapshot fields and version model are unresolved.

Under the proposed ownership, journal-line-to-account is an intra-`finance` FK candidate (X11 in [05](05-cross-schema-relationship-policy.md)). If `master_data` remains owner, record a separate explicit `finance → master_data` FK or application-contract decision before modeling; do not silently keep an implicit reference. No CoA entity move or migration is authorized by this document.

## Phase 0 history preserved

Phase 0 `08-schema-ownership-matrix.md`, `09-entity-catalog.md`, the skills context and finance/master-data skills remain unchanged as historical evidence. A future approval must name the superseded placement, the new owner, owner sign-off, impact to consumer contracts, backfill/migration and rollback plan. `sap_core_skills` was not modified.
