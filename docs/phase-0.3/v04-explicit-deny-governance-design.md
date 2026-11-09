# V04 Explicit DENY Governance Design

**Status:** `PROPOSAL — NOT OWNER-APPROVED`  
**Date:** 2026-11-09  
**Base:** `main` after PR #69 merge (`31c0b0a7658df64470a60f7d3374d4f3b1af7593`)  
**Scope:** Tenant-administration authorization for Organization, Company and Plant. ERP operational permissions remain out of scope.

> This document proposes governance and an implementation boundary. It does not authorize schema changes, migrations, permission seeding, service/API implementation, RLS changes, hosted database access, or production rollout. Those require a separate explicit owner decision.

## 1. Why a separate governance decision is required

The current policy evaluator supports deny-overrides-allow at the exact target scope, and the persisted-grant loader understands persisted `ALLOW` and `DENY` effects. The current tenant-facing write paths intentionally do not create DENY records:

- Built-in SYSTEM role permission snapshots are sealed.
- Organization custom-role snapshots accept ALLOW only.
- Custom-role create/revise APIs create ALLOW grants only.
- The policy runbook reserves DENY for governed policy use.

This is intentional. Adding a DENY write path without deciding who may deny whom, what can be denied, and how lockout is recovered would create a high-impact privilege-control surface.

## 2. Existing invariants that remain unchanged

Any DENY design must preserve the owner-approved v0.1 policy:

1. Actor identity comes from the verified Better Auth session, never browser-supplied actor identifiers.
2. Active Organization membership and verified Organization → Company → Plant ancestry are prerequisites for tenant access.
3. Scope is strict. A DENY at one scope does not implicitly propagate to a parent, child, sibling Company, or sibling Plant.
4. An explicit DENY at the exact applicable target scope overrides any matching ALLOW.
5. Missing, malformed, unknown, expired, revoked, or inconsistent policy data fails closed for the protected operation.
6. Tenant administrators cannot create or assign Platform Admin/platform-trust authority.
7. Break-glass remains unavailable until separately designed and approved.
8. Authorization reads, locks, and the protected operation share one transaction.
9. Hosted Prisma Postgres credentials remain full-access; application authorization is the primary security boundary. RLS is defense-in-depth only.

## 3. Terminology and proposed semantics

- **ALLOW:** a permission supplied by an effective role assignment at the exact authorized scope.
- **DENY:** an explicit, independently governed restriction on a named principal's named permission at one exact target scope.
- **Target principal:** the Organization membership (and therefore its user) to which the restriction applies.
- **Target scope:** exactly one Organization, Company, or Plant, with its parent chain validated before persistence and evaluation.
- **Issuer:** the authenticated actor who creates or revokes the restriction.
- **Policy record:** the current effective restriction; it is not a role definition and must not be editable through custom-role revision.

Proposed decision rule:

`effective(permission, principal, target) = false` when a valid, active DENY exists for that principal, permission, and exact target scope; otherwise evaluate the existing ALLOW policy. No matching ALLOW remains deny-by-default.

A DENY is not a negative role, does not grant any other permission, and must not alter role definitions or role assignments.

## 4. Recommended governance model (proposal)

### 4.1 Who may issue or revoke

**Recommendation:** only an active `ORG_OWNER` may create or revoke tenant DENY records within their own Organization.

- `ORG_ADMIN`, Company Admin, Plant Manager, custom-role creators, and ordinary members cannot issue or revoke DENY.
- An Organization Owner cannot affect another Organization or any platform-level principal.
- The issuer must be derived from the verified session and must hold the exact Organization Owner assignment at the time of the operation.
- The target must be an active or suspended membership in the same Organization. Revoked/ended membership is not a valid target for a new DENY.
- Issuing or revoking a DENY is a privileged policy-administration action, not `roles.assign` and not custom-role authoring.

**Open owner decision:** whether the owner-only rule is sufficient or whether a second independent Organization Owner approval is required for high-impact restrictions.

### 4.2 Who may be targeted

**Recommendation:** target one specific Organization membership at a time, not an entire role definition or every holder of a role.

Why:
- A role-level DENY changes behavior for every assignee and makes the impact of a role revision difficult to reason about.
- A principal-specific DENY is attributable, reviewable, and independently revocable.
- The target membership anchors the restriction to one Organization and avoids cross-tenant ambiguity.

A target membership change or reactivation must not silently transfer a DENY to a different membership. The policy lifecycle must explicitly define what happens when a membership is revoked and later recreated.

### 4.3 Scope semantics

**Recommendation:** exact-scope only, matching the current strict-scope baseline.

- Organization DENY applies only to the Organization target.
- Company DENY applies only to that Company, after verifying it belongs to the target Organization.
- Plant DENY applies only to that Plant, after verifying both Organization and Company ancestry.
- No implicit inheritance to descendants or ancestors.
- A Company DENY does not affect sibling Companies.
- A Plant DENY does not affect sibling Plants or other Companies.
- A role assignment at a different scope cannot cancel or override an applicable DENY.

If an Organization-wide restriction is required, it must be represented as an Organization-scope DENY and will only affect Organization-scope operations under this strict model. It will not automatically block Company/Plant operations.

### 4.4 Permission eligibility

**Recommendation:** DENY may refer only to known, explicitly approved tenant-administration permissions in the permission catalog.

- Reject unknown permission identifiers.
- Reject platform permissions and any future operational permission until separately governed.
- Do not accept arbitrary permission strings from clients.
- Keep a centrally reviewed deny-eligibility allowlist; a permission being ALLOW-delegable does not automatically make it DENY-eligible.
- Do not allow DENY to bypass authentication, session validation, membership validation, tenant-boundary checks, or platform security controls.

**Open owner decision:** define which current tenant-administration permissions are DENY-eligible and which are protected against DENY to avoid administrative lockout. The initial implementation should not guess this list.

### 4.5 Reason, duration, and lifecycle

**Recommendation:**
- Require a non-empty reason for every create and revoke action.
- Support an optional expiry timestamp; require expiry for high-impact restrictions if the owner chooses that rule.
- A DENY is effective only while active, not revoked, and not expired.
- Revocation is a new auditable event; do not delete or rewrite historical evidence.
- Replacing a DENY requires an explicit revoke followed by a new create, each with its own reason and audit event.
- Expiry is evaluated server-side against the database clock, not a browser clock.
- No background job is required for correctness if expired records are ignored at read time; a cleanup/archive job must not be part of the authorization boundary.

**Open owner decision:** whether expiry is mandatory for all DENYs, mandatory only for selected permissions, or optional.

## 5. Persistence boundary — conceptual only

No schema is approved by this document. If the owner approves the model, prefer a dedicated principal-scoped policy record rather than inserting DENY into a reusable role definition.

Conceptual attributes to evaluate:

| Attribute | Purpose |
|---|---|
| Policy ID | Stable immutable identity |
| Organization ID | Tenant ownership boundary |
| Target membership ID | Exact affected principal in that Organization |
| Scope + target ID | Exact Organization, Company, or Plant restriction |
| Permission definition ID | FK to a known permission |
| Reason | Human-readable justification |
| Issued by | Server-derived actor identity |
| Issued at | Database timestamp |
| Expires at | Optional policy expiry |
| Revoked at / revoked by | Lifecycle state and attribution |

The persistence design must enforce or transactionally verify:
- Target membership belongs to the same Organization.
- Company and Plant target ancestry is valid and immutable for the duration of the protected transaction.
- One active duplicate restriction cannot be created accidentally.
- Permission and scope are valid and compatible.
- Issuer authority is checked inside the same transaction.
- Current policy rows are locked while they influence an authorization decision.
- Historical audit evidence is retained according to an owner-approved retention policy.

Do not treat this conceptual table as a Prisma model or migration specification.

## 6. Audit and observability

Every create, revoke, failed authorization attempt, and administrative review should be attributable.

Minimum event data proposed:
- event ID and event type;
- Organization, target membership, target user, exact scope and target ID;
- permission code;
- issuer user ID and verified session context identifier where appropriate;
- reason;
- policy ID;
- occurred-at timestamp from the database;
- expiry/revocation details;
- request/correlation ID;
- outcome and stable reason code.

Never log session tokens, OAuth tokens, database credentials, raw request secrets, or unnecessary personal data.

Audit records should be append-only to application services. Corrections are compensating events, not edits to prior events. Read access to DENY policy and audit history must itself be authorized and logged.

## 7. Transaction and concurrency requirements

A future implementation must use one transaction for:
1. lock and revalidate the exact Better Auth session;
2. resolve and lock the actor's active Organization membership;
3. validate and lock the target membership;
4. validate and lock Company/Plant ancestry rows where applicable;
5. load and lock the actor's effective role grants and permission rows;
6. validate issuer authority and DENY eligibility;
7. create or revoke the policy and append its audit event; or, for a protected operation, load/lock applicable active DENY records;
8. execute the protected query or mutation before commit.

Concurrent semantics must be deterministic:
- If the protected operation obtains the required policy locks first, a concurrent DENY create/revoke waits until that operation commits.
- If DENY creation commits first, a later protected operation observes the DENY and is rejected.
- Revocation follows the same serialization rule.
- Expiry is checked using database time inside the transaction.

Tests must prove both orderings with disposable PostgreSQL, not mocks alone.

## 8. Required test matrix before implementation can be accepted

| Area | Required cases |
|---|---|
| Authority | ORG_OWNER allowed; ORG_ADMIN denied; Company/Plant roles denied; anonymous denied; forged issuer rejected |
| Tenant isolation | Cross-Organization target rejected; mismatched membership/user rejected |
| Scope | Exact Organization/Company/Plant target denied; sibling scope unaffected; invalid ancestry rejected |
| Precedence | DENY overrides matching ALLOW; DENY with no ALLOW still denies; no DENY does not create an ALLOW |
| Eligibility | Unknown permission rejected; protected/non-eligible permission rejected; platform permission rejected |
| Lifecycle | Create, duplicate create, revoke, repeated revoke, expiry, reissue after revoke |
| Audit | Reason required; actor/target/scope/permission/timestamps recorded; no secret leakage |
| Concurrency | Protected request vs create; protected request vs revoke; create/revoke race; membership suspension/revocation race |
| Regression | Existing strict scope, custom-role subset delegation, role assignment, session revocation and tenant HTTP tests remain green |

Every test must exercise the real HTTP/service boundary as appropriate and use disposable integration data. Do not bypass production guards to create fixtures.

## 9. Rollout sequence if approved

1. Owner approves the governance decisions in §10.
2. Version this policy proposal as an approved policy document.
3. Specify a database migration and backfill strategy separately; no existing role grants should be reinterpreted implicitly.
4. Implement server-only policy repository/service and transaction locks.
5. Integrate DENY loading into the common authorization path without weakening current checks.
6. Add HTTP and PostgreSQL concurrency tests.
7. Update runbook and threat model.
8. Validate local suite and CI.
9. Review audit visibility, operational recovery, and hosted provider constraints.
10. Obtain explicit production rollout approval before any hosted DB change.

## 10. Owner decisions required before implementation

These are intentionally unresolved. Do not infer approval from this proposal.

1. **Issuer authority:** owner-only, or owner plus a second independent approver for high-impact DENYs?
2. **Target model:** one specific Organization membership (recommended), or role-wide restrictions?
3. **Scope:** exact-scope only (recommended), or any deliberate descendant propagation?
4. **Permission eligibility:** which tenant-administration permissions may be denied, and which must be protected from DENY to prevent lockout?
5. **Expiry:** optional, mandatory for all, or mandatory only for selected permissions?
6. **Membership lifecycle:** should a DENY become permanently historical/inactive when its target membership is revoked, and must a newly created membership require a new DENY?
7. **Audit retention and review:** who can read the audit trail and what retention period is required?

Until these decisions are explicitly approved, keep DENY write paths unavailable. Existing evaluator and loader support is not authorization to create persisted DENY records.
