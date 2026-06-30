# Role-view dashboards (sign-in role launcher + "View as")

**Status:** plan / not started. Drafted 2026-06-30.
**Goal:** each role gets a dashboard tuned to it; an admin can switch roles to
preview the others — without re-authenticating. Built as a **view lens over one
reshaping Home**, not three pages and not a privilege grant.

## Principle (non-negotiable)

Role + permissions are **server-authoritative** — they live in the JWT (`rn`,
`perms.dm`, `dbs[].t.adm`) and the agent/VALC enforce every data call against the
real token. The role selector is a **view lens only**:

- A user may only view a role **at or below** their entitled rank (Admin ≥ Analyst
  ≥ Accountant). The picker never offers a higher role than the token grants.
- Tampering with the stored `viewRole` can only change **which lanes render** — it
  can never return data the token doesn't authorize (the server still gates it).
- Label it **"View as…"**, never "Login as…", so it never reads as escalation.

## Roles & derivation (from the token)

| Effective role | Condition | Can view |
|---|---|---|
| **Admin** | any `dbs[].t.adm === true` | Admin, Analyst, Accountant |
| **Analyst** | `perms.dm !== false` (data-management) | Analyst, Accountant |
| **Accountant** (Finance) | baseline (module access) | Accountant only |

- `landingRole(token)` = highest entitled role → the dashboard a user lands on by
  default (admins land on Admin; analysts on Analyst; accountants on Accountant).
- **v1 gates the switcher to admins only** (matches "if you're an admin you can
  switch roles"). Non-admins land on their role with no picker. (Extending the
  switch to analysts is a trivial later flip — the entitlement table already
  allows it.)

## `viewRole` override (mirrors the existing `viewMode`)

- New key `localStorage.rrv8.viewRole` ∈ `admin | analyst | accountant`.
- Unset → derive from `landingRole(token)`.
- Set only by the switcher, and **clamped** on read: if the stored value outranks
  the token's entitlement, ignore it and fall back to `landingRole` (defensive).
- Home reads it on boot **and** on switch, and reshapes. Same pattern as
  `viewMode`, so it slots into the existing session model.

## What each dashboard surfaces (reshape rules — one `home.html`)

Home already has role lanes + a role-tiered AI briefing, so this is filtering, not
new layout:

- **Accountant / Finance:** reconciliation modules lane + AI briefing as *an
  Accountant* (carry forward / manual entries / transactions). Hide Admin operate
  panels and the Analyst data-integrity lane.
- **Analyst:** cardex / roll-forward / DMAAI lane + briefing as *an Analyst*
  (cardex / unposted batches / end-of-day tier surfaced). Hide Admin panels.
- **Admin:** operate panels (Licensing, Users, Service Health, Data Refresh) +
  briefing as *an Administrator*. (Optionally a compact roll-up of the other lanes.)
- Shared across all: the period widget + Set Context scope band.
- **Key wiring:** the briefing's `roleLabel` and its Analyst-tier gating currently
  read `isAdmin()/canAnalyst()` (raw token). Point them at the **clamped
  `viewRole`** instead, so "View as Accountant" actually briefs as an Accountant.

## Switcher UX (both surfaces)

1. **Sign-in role launcher** (`login.html`): when the page loads **with a valid
   token already present** (admin), render branded role tiles — "Open the
   Accountant / Analyst / Admin dashboard" — instead of the credential form. Pick →
   set `viewRole` → go to `home.html`. This is the "go back to the sign-in screen
   to switch" flow, **with no password re-entry** (token persists). A fresh sign-in
   by an admin can show the launcher once before landing.
2. **In-app "View as ▾"** in the user-menu chip (admins only): pick a role →
   set `viewRole` → re-render Home in place. Fast path for a live demo.

## Files touched

- **`RRV8/sidebar.js`** (or the `RRV8`/config namespace — central, reused): add
  `effectiveRoles(token)`, `landingRole(token)`, `getViewRole()`, `setViewRole(r)`
  with clamping.
- **`RRV8/home.html`:** read `viewRole`; reshape lanes/tiles; feed the AI briefing
  `roleLabel` + analyst gating from `viewRole`; add the "View as" control to the
  user menu (admin only); re-render on switch (reuse `loadActiveDbSurfaces` +
  `renderAiBriefing`).
- **`login.html`:** token-present role launcher (tiles); set `viewRole`; redirect.
  Reuse `isAdminToken`; extend `landingFor` to honor a chosen role.

## Security checklist (verify at build)

- Picker options computed from the token only; never trust a typed/stored role.
- `viewRole` clamped to entitled rank on every read.
- `viewRole` is **never** sent to the agent/VALC as an auth input — data scope
  still rides the JWT + the existing DB/company/period scope.
- A non-admin with a hand-edited `rrv8.viewRole=admin` sees only empty/forbidden
  admin panels (server 403s), not real admin data — confirm live.

## Phasing

- **Phase 1 (demo-ready, July 15):** admin-only switcher (user menu + login
  launcher), one reshaping Home, `viewRole` override, briefing + lanes reshape.
- **Phase 2 (later):** allow analysts to switch; remember last `viewRole`;
  per-user default-landing preference.

## Decisions to confirm before coding

1. **Admin default landing** — land admins on the **Admin** dashboard (highest
   entitled) and let them switch down? Or land everyone on **Accountant/Finance**
   (the reconciliation core) and treat role as a pure lens? (Recommend: land on
   highest entitled.)
2. **Switch = in-place re-render or full reload?** In-place is snappier; reload is
   simpler and guarantees a clean state. (Recommend: in-place, reusing the existing
   per-DB loader; fall back to reload if any lane wiring fights it.)
3. **Analysts in v1?** Keep the switcher admin-only for the demo, or let analysts
   view-as-accountant too? (Recommend: admin-only for v1.)

## Related

Memories: `project_home_role_lanes`, `project_access_flow_home_workbar`,
`project_demo_sales_tour_plan`. The role lanes + role-tiered briefing this builds on
shipped in UI #299.
