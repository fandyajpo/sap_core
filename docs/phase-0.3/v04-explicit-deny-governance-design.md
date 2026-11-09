# V04 Explicit DENY Governance Design

**Status:** `OWNER-APPROVED POLICY BASELINE — SOURCE IMPLEMENTATION AUTHORIZED; HOSTED ROLLOUT NOT APPROVED`  
**Date:** 2026-11-09  
**Base:** `main` after PR #70 merge (`79ea84571375b529a1f53a90617e41c8d30846e2`)  
**Scope:** Tenant-administration authorization for Organization, Company and Plant. ERP operational permissions remain out of scope.

> The owner has approved the seven governance recommendations in §10, the audit decisions in §10.1, and source implementation within the isolated repository branch described in §10.2. Hosted database access/modification, RLS changes, deployment, and production rollout remain separately gated.

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

## 4. Approved governance model

### 4.1 Who may issue or revoke

**Approved:** only an active `ORG_OWNER` may create or revoke tenant DENY records within their own Organization.

- `ORG_ADMIN`, Company Admin, Plant Manager, custom-role creators, and ordinary members cannot issue or revoke DENY.
- An Organization Owner cannot affect another Organization or any platform-level principal.
- The issuer must be derived from the verified session and must hold the exact Organization Owner assignment at the time of the operation.
- The target must be an active or suspended membership in the same Organization. Revoked/ended membership is not a valid target for a new DENY.
- Issuing or revoking a DENY is a privileged policy-administration action, not `roles.assign` and not custom-role authoring.

**Decision:** owner-only approval is the selected baseline. A second independent Organization Owner approval is not required by this policy baseline; it may be reconsidered only through a separate policy revision.

### 4.2 Who may be targeted

**Approved:** target one specific Organization membership at a time, not an entire role definition or every holder of a role.

Why:
- A role-level DENY changes behavior for every assignee and makes the impact of a role revision difficult to reason about.
- A principal-specific DENY is attributable, reviewable, and independently revocable.
- The target membership anchors the restriction to one Organization and avoids cross-tenant ambiguity.

A DENY is bound to its specific target membership. It does not transfer to a different or newly created membership, including when the same user later rejoins the Organization. A new membership requires a new, explicit DENY if the restriction is still warranted. A revoked/ended target membership makes the existing DENY historical/inactive; preserve its audit history.

### 4.3 Scope semantics

**Approved:** exact-scope only, matching the current strict-scope baseline.

- Organization DENY applies only to the Organization target.
- Company DENY applies only to that Company, after verifying it belongs to the target Organization.
- Plant DENY applies only to that Plant, after verifying both Organization and Company ancestry.
- No implicit inheritance to descendants or ancestors.
- A Company DENY does not affect sibling Companies.
- A Plant DENY does not affect sibling Plants or other Companies.
- A role assignment at a different scope cannot cancel or override an applicable DENY.

If an Organization-wide restriction is required, it must be represented as an Organization-scope DENY and will only affect Organization-scope operations under this strict model. It will not automatically block Company/Plant operations.

### 4.4 Permission eligibility and approved initial allowlist

**Approved:** the initial DENY-eligible allowlist contains exactly these 14 existing tenant-administration permissions:

| Permission | Initial DENY eligibility |
|---|---|
| `organization.read` | Eligible |
| `organization.update` | Eligible |
| `organization.members.read` | Eligible |
| `organization.members.manage` | Eligible |
| `company.read` | Eligible |
| `company.manage` | Eligible |
| `company.members.manage` | Eligible |
| `plant.read` | Eligible |
| `plant.manage` | Eligible |
| `plant.assignments.manage` | Eligible |
| `roles.read` | Eligible |
| `roles.create` | Eligible |
| `roles.revise` | Eligible |
| `roles.assign` | Eligible |
| `audit.read` | **Protected — not DENY-eligible in the first iteration** |

Rules:
- Reject unknown permission identifiers.
- Reject platform permissions and any future operational permission until separately governed.
- Do not accept arbitrary permission strings from clients.
- A permission being ALLOW-delegable does not automatically make it DENY-eligible; only the explicit list above is eligible for the first iteration.
- `audit.read` is protected initially to preserve tenant oversight and audit visibility. Changing this requires a separate policy revision and explicit owner approval.
- Do not allow DENY to bypass authentication, session validation, membership validation, tenant-boundary checks, or platform security controls.

This allowlist decision is a policy record only. It does not authorize permission seeding, database writes, or implementation.

### 4.5 Reason, duration, and lifecycle

**Approved:**
- Require a non-empty reason for every create and revoke action.
- Expiry is optional; when supplied, it is evaluated against the database clock. No mandatory-expiry exception is part of this baseline.
- A DENY is effective only while active, not revoked, and not expired.
- Revocation is a new auditable event; do not delete or rewrite historical evidence.
- Replacing a DENY requires an explicit revoke followed by a new create, each with its own reason and audit event.
- Expiry is evaluated server-side against the database clock, not a browser clock.
- No background job is required for correctness if expired records are ignored at read time; a cleanup/archive job must not be part of the authorization boundary.

**Decision:** expiry is optional under the approved baseline.

## 5. Persistence boundary — conceptual only

This section remains conceptual and is not a Prisma specification. The isolated source implementation authorized in §10.2 uses a dedicated principal-scoped policy record rather than inserting DENY into a reusable role definition.

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

Audit records must be append-only to application services. Corrections are compensating events, not edits to prior events. Read access to DENY policy and audit history must itself be authorized and logged. The concrete reader authorization and retention policy are owner-approved in §10.1.

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

1. The seven governance principles in §10, including the initial 14-permission allowlist and protected `audit.read`, have owner approval.
2. Record the owner-approved audit reader and retention decisions in §10.1.
3. Version this policy as the approved governance baseline.
4. Specify a database migration and backfill strategy separately; no existing role grants should be reinterpreted implicitly.
5. Implement server-only policy repository/service and transaction locks.
6. Integrate DENY loading into the common authorization path without weakening current checks.
7. Add HTTP and PostgreSQL concurrency tests.
8. Update runbook and threat model.
9. Validate local suite and CI.
10. Review audit visibility, operational recovery, and hosted provider constraints.
11. Obtain explicit production rollout approval before any hosted DB change.

## 10. Owner-approved governance decisions

The owner explicitly approved all seven governance principles on 2026-11-09. The approved baseline is:

1. **Issuer authority — approved:** only an active `ORG_OWNER` may create or revoke DENY records within their own Organization. No second independent approver is required by this baseline.
2. **Target model — approved:** each DENY targets one specific Organization membership, never a role or all holders of a role.
3. **Scope — approved:** exact-scope only (Organization, Company, or Plant); no implicit inheritance or descendant propagation.
4. **Permission eligibility — approved:** exactly 14 permission codes listed in §4.4 are DENY-eligible for the first iteration; `audit.read` is protected and not DENY-eligible. Future additions or changes require a separate policy revision and explicit owner approval.
5. **Expiry — approved:** expiry is optional. When present, it is evaluated using the database clock.
6. **Membership lifecycle — approved:** DENY is bound to the exact membership, does not transfer to a newly created membership, and becomes historical/inactive when its target membership is revoked/ended. A new membership requires a new explicit DENY.
7. **Audit — approved:** append-only audit events; access to policy/audit history must be authorized and logged. Reader authorization and retention are specified in §10.1.


### 10.1 Owner-approved DENY audit access and retention decisions

The owner explicitly approved both operational audit decisions on 2026-11-09. These decisions complete the deferred governance details; they do not authorize implementation.

#### Reader authorization

**Approved: `owner_only` — only an active `ORG_OWNER` may read DENY policy records and DENY audit history for their own Organization.**

- The reader must be derived from the verified Better Auth session and must hold the active Organization membership and exact `ORG_OWNER` assignment required by the tenant authorization boundary.
- `ORG_ADMIN`, Company Admin, Plant Manager, custom-role holders, ordinary members, and other tenant roles are not readers, even if they hold the general `audit.read` permission.
- The general `audit.read` permission does not independently authorize access to DENY policy records or DENY audit history.
- Organization isolation applies: an Owner may read only the records belonging to their own Organization.
- Platform Admin or other platform-trust status does not create implicit access under this tenant policy. Any platform-level access path requires a separate owner-approved policy.
- Successful and denied attempts to read DENY policy/audit history must themselves be attributable and logged. This requirement does not authorize an endpoint, service, or schema implementation.

#### Retention

**Approved: `3_years` for DENY audit events.**

- DENY audit events are retained for three years from each event's database-recorded occurrence time.
- Active DENY policy records remain available while active; the three-year audit-event retention rule does not expire or remove an active restriction.
- For revoked or expired DENY policy records, preserve the policy's historical evidence and associated audit events for three years after the policy reaches its terminal state, subject to any applicable legal hold.
- A legal hold suspends purge while it remains active.
- Expiry of the retention period does not authorize ad hoc deletion. Any future purge/archive mechanism must be separately designed, access-controlled, auditable, and approved before implementation.
- This three-year period is the owner's product policy decision; it is not a claim of universal statutory compliance. Applicable legal or contractual requirements may require a separate policy revision.

#### Implementation boundary

These decisions authorize documentation of the policy only. They do **not** authorize Prisma schema changes, migrations, backfills, permission seeding, service/API or UI implementation, RLS changes, hosted database access or modification, deployment, or production rollout. Each remains subject to separate review and explicit owner approval.


### 10.2 Owner authorization for isolated source implementation

On 2026-11-09, the owner explicitly instructed the project to proceed with DENY implementation after PR #71 was merged.

Authorized work:
- Dedicated membership-bound DENY policy and append-only audit persistence models.
- Forward-only Prisma migration source.
- Server-side owner-only create, revoke, and history service/API paths.
- Integration of active, exact-scope membership DENY records into the transaction-bound authorization loader.
- Unit, static-boundary, and disposable PostgreSQL validation.
- Isolated feature branch and reviewable pull request.

Still not authorized:
- Applying the migration to any hosted database.
- Hosted database inspection, credential use, grants, or role provisioning.
- RLS policy changes.
- Deployment or production rollout.
- Purge/archive automation or any deletion of retained audit evidence.
- Merging the implementation PR before review and successful CI.

The approved `owner_only` reader policy and `3_years` retention baseline remain unchanged. Until a separately reviewed retention/archive mechanism is approved, the implementation must not delete historical audit events; retaining them longer is preferable to premature purge. This does not waive the requirement to design legal-hold-aware retention handling before production acceptance.
### Explicitly not approved

The source implementation authorization in §10.2 is limited to an isolated review branch. The following remain gated:

- hosted database changes or production rollout;
- RLS changes;
- purge/archive automation and deletion of historical audit evidence.

Existing evaluator and loader support is not authorization to create persisted DENY records. Keep DENY write paths unavailable until the deferred details are resolved, an implementation plan is reviewed, and implementation is separately approved.
