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

### F3 — Auth error not associated with fields (a11y) — FIXED
`auth-form.tsx` showed a `role="alert"` error but inputs had no association (contrast: `profile-name-form.tsx` already did this correctly). **Fix:** all three inputs now carry `aria-invalid={Boolean(error)}` and `aria-describedby="auth-form-error"`; the alert has that id.

### F4 — Inconsistent error/success copy conventions — NOTED (no change)
`AuthForm` uses form-level messages; `ProfileNameForm` pairs field-level `aria-invalid`/`aria-describedby` + `role="status"` success. Existing copy conventions verified to never leak server messages. Left as-is (both patterns are legitimate; unifying is a later, wider task).

### F5 — Verification strengths confirmed
`DataTable`: `aria-sort` on `th`s, `aria-hidden` sort glyphs, keyboard-operable sort buttons and pagination, `aria-live` pagination summary, `role="status"` + `aria-busy` loading cell, disabled pagination at bounds. Views: generic error copy (no server message leakage), 401/403 hide data, retry buttons labeled, details panels use `aria-expanded` buttons and definition lists.

## 3. Showcase — `/ui-showcase` (session-protected)

`src/app/ui-showcase/page.tsx` + `src/components/ui-showcase/*`. Uses the **actual components**, not mockups:

- **DataTable live**: fixture rows with working search/sort/pagination, status pills, `<time>` dates, tabular-numeric amounts; clearly labeled demo state buttons (Ready/Loading/Empty via `aria-pressed`) toggle real component states.
- **Live forms**: `AuthForm` (sign-in mode), `ProfileNameForm`, `SignOutButton` render with their real behavior — the page states this explicitly (submits call real APIs; sign-out ends the session).
- **Token panel**: info/success/warning/danger chips from semantic tokens.
- **Dark scope**: a `data-theme="dark"` scoped section renders the same DataTable + chips with dark tokens — demonstrates dark-readiness without a theme toggle, persistence, or runtime state (consistent with PR #91's "no theme switching feature").

## 4. Verification status (honest)

- **Not executed locally** (no execution facility): `pnpm lint`, `pnpm typecheck`, `pnpm build`, tests, `git diff --check`. CI (job `static`) on this branch is the authoritative check.
- **Not verified visually**: the app was not rendered; the showcase and the token-adoption visual deltas (radius/tint normalizations) need maintainer review or a rendered pass.
- **Not exercised interactively**: keyboard focus order, drag interactions, and dark rendering need a real browser pass (documented as the standing limitation).
- Static review performed: all edited CSS re-read after write; TSX changes re-verified against component APIs; existing UI tests' asserted patterns (source regexes in `tests/*-ui.unit.test.mjs`, `data-table.unit.test.mjs`) were checked against the edits — none assert the changed CSS values, and TSX structure edits (AuthForm) match the `role="alert"`/label patterns tests or pages expect.

## 5. Remaining known limitations

1. Global auth classes (`.auth-card`, `.text-input`, `.primary-button`, …) in `globals.css` still use legacy `--ink/--line/--blue` vars — they are light-only; the showcase's dark section deliberately excludes them. Migration to `--sc-color-*` is the next token-adoption step.
2. `Account` page and app-header chrome still use legacy vars (same migration queue).
3. `DataTable` has no column-visibility menu, bulk-selection bar, or responsive stacked mode yet (documented backlog from `docs/research/react-bits/sap-core-applicability.md`).
4. No dedicated unit tests for `AuthForm`/`ProfileNameForm`/`SignOutButton` (they are thin wrappers over Better Auth; testing them means mocking the client — a follow-up decision).
5. Row heights (34–40px) are px-based; a future density token could normalize with the `--sc-space-*` scale.
