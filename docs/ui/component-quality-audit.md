# UI Component Quality Audit — Gate Report

Branch: `feat/ui-quality-gate` (from `main` at `7472834`, which includes PR #91 tokens).
Scope: audit + fixes + showcase. No business logic, API, schema, auth, or V04 changes.

## 1. Component inventory

| Component | File | Kind | Used by |
| --- | --- | --- | --- |
| `DataTable` | `src/components/data-table/data-table.tsx` | Reusable client component | Members, Roles, Role Assignments, Showcase |
| `DataTablePagination` | `src/components/data-table/data-table-pagination.tsx` | Reusable client component (rendered by DataTable) | (internal) |
| `AuthForm` | `src/components/auth-form.tsx` | Page-level client component (`mode: sign-in \| register`) | `/sign-in`, `/register`, Showcase |
| `SignOutButton` | `src/components/sign-out-button.tsx` | Client component | App headers, Showcase |
| `ProfileNameForm` | `src/components/profile-name-form.tsx` | Client component | `/account`, Showcase |
| `OrganizationMembersView` | `src/components/organization-members/organization-members-view.tsx` | Feature view | `/organizations/[organizationId]/members` |
| `OrganizationRolesView` | `src/components/organization-roles/organization-roles-view.tsx` | Feature view | `…/roles` |
| `RoleAssignmentsView` | `src/components/role-assignments/role-assignments-view.tsx` | Feature view | `…/role-assignments` |

Dependencies: React 19, Next 16, TanStack Table v8 (DataTable only), Better Auth client (the three auth components). No UI library. Views additionally use TanStack Query hooks (members/roles/assignments) and `HttpApiError`.

Interactive states covered: loading, empty, error + retry, disabled (forms during pending, pagination bounds), hover, focus-visible, selection/active (aria-pressed, aria-current/sort), 401/403 data hiding (the three data views).

## 2. Findings and fixes applied

### F1 — Hardcoded colors / legacy tokens (visual, blocking dark theme) — FIXED
All five CSS modules (`data-table`, and the members/roles/assignments views) used raw hex colors (`#f7f9fc`, `#edf1f5`, `#d7e6f1`, `#fbf3f3`, …) plus legacy vars (`--ink`, `--muted`, `--line`) and hardcoded rgba focus outlines. None consumed the PR #91 semantic tokens, so every component was light-only despite the dark theme existing. **Fix:** complete token adoption — colors → `--sc-color-*` (info/success/warning/danger/status chips, border/input, surface steps), focus → `--sc-focus-ring-width` + `--sc-color-ring` + offset everywhere (replacing per-file rgba outlines), radii → `--sc-radius-*` (8px→md/10px, 7px→sm/6px, 999px→full, 12px→lg/14px, 16px→lg), shadows → `--sc-shadow-md`, body/label/caption sizes → `--sc-text-*`. Normalizations are documented as intentional visual deltas (≤4px radius shifts; danger/warning/info tints now token-accurate).

### F2 — `AuthForm` coupled page layout to form logic (API/reusability/a11y) — FIXED
`AuthForm` rendered `<main class="auth-page">` itself, so it could not be reused (a nested `<main>` inside any other layout violates HTML landmarks). **Fix:** layout moved to the pages (`/sign-in`, `/register` wrap it in `<main className="auth-page">`); `AuthForm` now returns only the form card section. Its public API is unchanged (`mode` prop).

### F3 — Auth error association (a11y) — FIXED, then refined by review
`auth-form.tsx` showed a `role="alert"` error but inputs had no association (contrast: `profile-name-form.tsx` already did this correctly). **Initial fix:** inputs carried `aria-describedby="auth-form-error"`. **Review refinement (supersedes the first attempt):** the initial fix also set `aria-invalid={Boolean(error)}` on every input, which wrongly marked all fields invalid for a *general* authentication failure. The refined fix keeps `aria-describedby` (it references the `#auth-form-error` element, which is conditionally rendered together with the error) and removes `aria-invalid` — fields are only ever marked invalid for specific field-level validation errors, which this form currently reports through native HTML validation. The general error remains announced by `role="alert"`.

### F4 — Inconsistent error/success copy conventions — NOTED (no change)
`AuthForm` uses form-level messages; `ProfileNameForm` pairs field-level `aria-invalid`/`aria-describedby` + `role="status"` success. Existing copy conventions verified to never leak server messages. Left as-is (both patterns are legitimate; unifying is a later, wider task).

### F5 — Verification strengths confirmed
`DataTable`: `aria-sort` on `th`s, `aria-hidden` sort glyphs, keyboard-operable sort buttons and pagination, `aria-live` pagination summary, `role="status"` + `aria-busy` loading cell, disabled pagination at bounds. Views: generic error copy (no server message leakage), 401/403 hide data, retry buttons labeled, details panels use `aria-expanded` buttons and definition lists.

### F6 — Review round: showcase safety + auth a11y refinement — FIXED
Findings from code review of the showcase, resolved without touching backend authentication/session logic:

- **Destructive demo save**: the showcase rendered `ProfileNameForm`, whose Save called `authClient.updateUser()` — a real profile mutation. **Fix:** `ProfileNameForm` gained an optional `onSave` adapter (default = the real Better Auth save + route refresh, used on `/account`); the showcase injects a local simulator (`simulateDelayedSuccess` in `ui-showcase/simulations.ts`) that resolves after ~600ms and never calls Better Auth or any production API. Loading, disabled, validation, and the realistic success state (`role="status"`) all remain functional.
- **Destructive demo sign-out**: the showcase rendered `SignOutButton` in the page header and body, both ending the real session. **Fix:** `SignOutButton` gained an optional `onSignOut` adapter (default = real Better Auth sign-out + redirect, used everywhere outside the showcase) plus an optional `label` override; every showcase instance (header and demo cell) injects the simulator and labels the button "Sign out (simulated)". The showcase can no longer call `authClient.signOut()`.
- **General auth error marked all fields invalid**: removed — `aria-invalid` was set on all three inputs for any form-level auth failure. General errors stay associated via `aria-describedby="auth-form-error"` (an element that exists whenever referenced) and announced via `role="alert"`; `aria-invalid` is reserved for specific field-level validation errors.
- **Heading hierarchy**: `AuthForm` gained a `headingLevel?: 1 | 2 | 3` prop (default 1 — unchanged on `/sign-in` and `/register`). The showcase embeds it with `headingLevel={3}`, giving `/ui-showcase` the semantic chain h1 (page) → h2 (sections) → h3 (demo cards, including the auth card's "Welcome back"). No useful labels or section descriptions were removed.

Scope note: these changes modify **authentication UI components** (`auth-form.tsx`, `sign-out-button.tsx`, `profile-name-form.tsx`) only in their presentation/adapter surface. Better Auth configuration, sign-in/registration/update/sign-out requests, validation rules, redirects, and session behavior are unchanged — the `/account` profile update and production sign-out retain their original behavior because the adapters default to the previous code paths.

## 3. Showcase — `/ui-showcase` (session-protected)

`src/app/ui-showcase/page.tsx` + `src/components/ui-showcase/*`. Uses the **actual components**, not mockups:

- **DataTable live**: fixture rows with working search/sort/pagination, status pills, `<time>` dates, tabular-numeric amounts; clearly labeled demo state buttons (Ready/Loading/Empty via `aria-pressed`) toggle real component states.
- **Live forms** (post-review state): `AuthForm` embedded with `headingLevel={3}` performs a **real** sign-in on submit (explicitly disclosed on the page); `ProfileNameForm` and `SignOutButton` demos are **simulated locally** via injected adapters — they visibly say so ("Simulated demo — resolves locally / keeps your real session active", buttons labeled "Sign out (simulated)") and can never call Better Auth or mutate the authenticated account. The showcase page header also uses the simulated sign-out.
- **Token panel**: info/success/warning/danger chips from semantic tokens.
- **Dark scope**: a `data-theme="dark"` scoped section renders the same DataTable + chips with dark tokens — demonstrates dark-readiness without a theme toggle, persistence, or runtime state (consistent with PR #91's "no theme switching feature").

## 4. Verification status (honest)

### 4a. Runtime verification mission — blockers (environment)

Attempted per the runtime verification mission; the following could not be run because this environment has **no shell/terminal** and **no running application server** (the repo is not published to a preview; a dev server additionally requires a Better Auth/Prisma database and session, which cannot be started here):

- `pnpm lint` — NOT RUN (no shell). Blocker documented, not bypassed.
- `pnpm typecheck` — NOT RUN (no shell).
- `pnpm build` — NOT RUN (no shell).
- `node --test tests/data-table.unit.test.mjs`, `tests/organization-members-ui.unit.test.mjs`, `tests/organization-roles-ui.unit.test.mjs`, `tests/role-assignments-ui.unit.test.mjs`, `tests/architecture-boundaries.unit.test.mjs`, `tests/client-data.unit.test.mjs` — NOT RUN (no shell).
- `git diff --check` — NOT RUN (no shell); whitespace was instead reviewed in the full committed diff output (no trailing-whitespace indicators observed).
- Visual verification of `/sign-in`, `/register`, `/ui-showcase` — NOT PERFORMED (nothing renders the app: no local server, no preview link). Light/dark rendering, card surfaces, typography, semantic colors, focus rings, spacing, responsive layouts, and overflow are therefore **unverified visually**.
- Interaction verification (button states, input validation, auth errors, profile form, sign-out, DataTable sort/search/pagination, loading/empty states, keyboard navigation, focus management, reduced motion) — NOT PERFORMED for the same reason. `AuthForm`/`SignOutButton` real-auth behavior was deliberately not triggered; no test accounts exist or were created.

### 4b. Static verification performed (via repository search tooling)

- **Token integrity: PASS.** All `--sc-*` variables consumed by the five component CSS modules (239 usages extracted) were cross-checked against definitions in `src/app/styles/tokens.css` and `themes.css` (light `:root` and `[data-theme="dark"]` blocks re-read). Zero undefined token references. Confirmed defined: color-foreground/muted-foreground/secondary-foreground, color-border/surface(+secondary), color-info/warning/danger/success (+subtle/border), color-primary/ring, radius-sm/md/lg/full, border-width, shadow-sm/md, text-body/label/caption/h3/h4, focus-ring-width/offset, numeric-font-variant.
- **Showcase class integrity: PASS.** Every `styles.*` reference in `ui-showcase-view.tsx` (page, heading, context, card, cardHeader, demoControls, demoButton, note, formGrid, formCell, chipGrid, chip, chipInfo, chipSuccess, chipWarning, chipDanger, statusActive, statusRevoked, numeric) resolves to a class in `ui-showcase.module.css`.
- **Import integrity: PASS.** No unused or dangling imports in the showcase page/view; `DataTable` is imported from the existing barrel export.
- **Dark scoping: PASS (static).** `themes.css` exposes semantic roles under `[data-theme="dark"]` as a plain attribute selector, so a scoped section inherits dark values to all token-driven descendants — the showcase dark section and the newly token-adopted components are dark-ready by construction.
- **Existing test contracts: PASS (static).** The source-regex assertions in `tests/*-ui.unit.test.mjs` and `tests/data-table.unit.test.mjs` target TSX structure (`aria-label`, `aria-expanded`, hook usage) that was not modified; no test asserts the changed CSS values.

### 4c. Findings from the static pass (documented, no code change required)

- Duplicate `<h1>` when `AuthForm` is embedded in the showcase (its own "Welcome back" heading + the showcase page heading). Not a defect on `/sign-in` (single heading there); documented as an embedding constraint — `AuthForm` is not yet a form-only widget.
- Duplicate `id="auth-form-error"` would occur only if two `AuthForm`s rendered simultaneously on one page — verified that no current page does (`/sign-in`, `/register`, and the showcase each render at most one).
- A token-definition search mistakenly pointed at `src/styles` (nonexistent path) before being corrected to `src/app/styles`; zero matches were a tool-path error, not a repository defect.

## 5. Remaining known limitations

1. Global auth classes (`.auth-card`, `.text-input`, `.primary-button`, …) in `globals.css` still use legacy `--ink/--line/--blue` vars — they are light-only; the showcase's dark section deliberately excludes them. Migration to `--sc-color-*` is the next token-adoption step.
2. `Account` page and app-header chrome still use legacy vars (same migration queue).
3. `DataTable` has no column-visibility menu, bulk-selection bar, or responsive stacked mode yet (documented backlog from `docs/research/react-bits/sap-core-applicability.md`).
4. No dedicated unit tests for `AuthForm`/`ProfileNameForm`/`SignOutButton`. The new adapters make them mockable (inject `onSave`/`onSignOut`), but none have been written yet — a follow-up decision.
5. Row heights (34–40px) are px-based; a future density token could normalize with the `--sc-space-*` scale.
6. Global `<a>` link color (used by the auth-switch link, app headers, and feature-view navs) still uses legacy `--blue`; the auth card's switch link overrides it locally with `--sc-color-primary`. A global token migration remains queued.
