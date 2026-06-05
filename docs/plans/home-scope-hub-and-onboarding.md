# Plan: Home as the scope hub + role sections + admin first-run wizard

**Status:** Spec ready. Not yet implemented. Uncommitted by request.
**Source:** session discussion 2026-06-05. Builds on (does not replace)
[`home-action-readiness-redesign.md`](home-action-readiness-redesign.md),
whose admin-action / readiness split already shipped (UI #196/#197).

This is the **next** evolution of `RRV8/home.html`. Three threads, all
from the owner:

1. **Home has a purpose: it sets working context, and that context flows
   to the work pages.** Triggered by scope inconsistencies discovered on
   the inventory work pages.
2. **Sections become role-based; the cards inside a role are labeled by
   module** (no more module-as-section).
3. **A new administrator's first login is a guided, gated workflow** that
   ends with "team members ready to go, data available." Reuse the
   existing admin cards; sequence + gate them.

Related memory: `project_access_flow_home_workbar`,
`feedback_v8_audience_finance_not_it`, `feedback_production_ready_default`,
`user_role_exit_strategy`, `project_permissions_scoped_per_database`,
`project_companies_tab_aligns_v8_admin`.

---

## 1. The scope problem (evidence)

Each inventory work page re-derives its working scope independently, and
Reconciliation does it differently from the others:

| Page | Companies default | Period default |
|---|---|---|
| `inventory-asof` | `db.i` (JWT per-db company list) | `readCurrentPeriodFromCache()` → `_meta.period` |
| `inventory-cardex-variance` | `db.i` | `readCurrentPeriodFromCache()` |
| `inventory-reconciliation` | its own `new Set()` built from fetched rows | hardcoded `'2016-08-27'` fallback |

A shared `rrv8.scope.v1.<mode>.<db>.<key>` sessionStorage namespace already
exists, but only for `jobStatus` and `dmaais`. **There is no shared
`{companies, period}` scope entry** — so the pages disagree.

---

## 2. Model: three layers (Allowed → Active → Narrowing)

**Correction (owner, 2026-06-05):** scope is not one read-only thing. The
"Karen" case — allowed 3 of 12 companies, wants to work 1, in July while
the open period is August — exposes **three** distinct layers:

| Layer | What | Set by | Where | Persists? |
|---|---|---|---|---|
| **Allowed scope** | The companies a user *may* view (Karen's 3 of 12); the periods available | Admin (per-user company-row permissions) | Fixed per login | n/a (permission) |
| **Active selection** | The company + period the user is *working now* (Company 00100, July) | **The user** | **Home** (and on any work page) | **Yes — session-sticky, consistent everywhere** |
| **Narrowing** | Within a page: an account, a business unit, a contributor | User, in the moment | Per-page | No — transient, local to the page |

This **amends** the prior locked rule (*"no scope/period/contributors
persist across pages"*). That rule was guarding against filters *silently*
following the analyst around. A **deliberate active selection that stays
in sync everywhere** is the opposite — it's the cure for the scope
inconsistency, not the disease. So:

- **Active company + period flow and stay sticky for the session.**
  Default on first login: all of the user's allowed companies + the open
  reconciliation period (from `GET /inventory/status`). The user can
  change either on Home *or* on a work page; the change updates the single
  session selection, so every page agrees.
- **Narrowing stays per-page and transient** (unchanged intent of the old
  rule).

**Allowed scope vs. the picker — buildable NOW (correction):** company-row
scoping turned out to be supported end-to-end already. The user invite /
permissions assignment carries `companyScope: 'ALL'|'LIST'` + `companies[]`,
and a `LIST` flows into the user's JWT `dbs[i].i` allow-list. The RR Team
modals (New User + per-row Permissions) now expose this — an admin grants a
user specific licensed companies, and that set is exactly what `db.i`
pre-filters the Home/work-page company picker to. So this is **not** a Phase
B blocker on the write path; it works against existing contracts. (Earlier
draft called it Phase B — wrong.)

### Canonical session-selection object

Publish one object to `rrv8.scope.v1.<MODE>.<dbName>.scope`:

```js
{
  database:        { n, ip },     // active DB claim
  allowedCompanies:[ ... ],       // permission universe (all licensed until row-scoping; then the user's set)
  activeCompanies: [ ... ],       // the user's current selection (default = allowedCompanies)
  period:          'YYYY-MM-DD',  // active period (default = open period from /inventory/status)
  resolvedAt:      <epoch ms>
}
```

- **Single source of truth.** Written by Home on boot/DB-switch, AND
  updated whenever the user changes the active company/period anywhere
  (Home or a work page) — keeping the session in sync.
- Work pages **read** `activeCompanies` + `period` for their default
  `reconciliationFilter` instead of seeding their own. Reconciliation's
  hardcoded `'2016-08-27'` fallback and its bespoke company Set are
  removed in favor of the shared read.
- Fail-open preserved (dev token / demo): missing selection → page behaves
  as today (back-compat).

---

## 3. Home restructure — role sections, module cards

**Decision (owner):** build the role framework now; spec the role claim so
named roles light up when VALC/Agent ship it.

**Correction (owner, 2026-06-05): ONE role per user.** A user never sees
two roles' worth of content. The user's single role decides **which
sections appear**; **module is only a card-level tag**, never a section
header (this retires today's "Inventory module" section).

- **Sections are role-functional areas, chosen by the single role:**
  - **Administrator** → an *Administration* area (People & licensing,
    Service health, Data refresh, Accounting setup) + a *Reconcile* area
    whose cards are module-labeled (Inventory → Reconciliation). *(Open
    question: does the Administrator role actually open modules, or is it
    purely administrative? Mockup shows Reconcile present; easy to drop.)*
  - **Section order (owner, 2026-06-05):** on the admin Home, the
    **Administration area sits ABOVE the scope bar**, and the scope bar sits
    directly above *Reconcile*. Rationale: the scope (database / company /
    period) governs the *work* (Reconcile), NOT the admin actions — placing
    scope above the admin cards would falsely imply it filters them. So:
    greeting → Administration → scope bar → Reconcile.
  - **Reconciliation Analyst** (and other working roles) → the
    "Am I ready to go?" readiness card + a *Reconcile* area with the
    module card(s) that role is granted.
- **Module appears only as a card tag** (e.g. an "Inventory" pill on the
  Reconciliation card), never as a section name.
- **Today's resolvable role:** only the strict admin bit (`t.adm`) is in
  the JWT, so the framework renders **Administrator** vs a single
  non-admin (analyst) face until the role claim ships. Do NOT guess named
  roles from module caps (rejected stopgap) — show a real role name only
  when the token carries it.
- **API.md contract (spec now, wire later):** add a single per-(user,db)
  `roleName` claim to the login/token response. Home reads it to label the
  role + pick sections; falls back to admin/non-admin when absent.
  (Promotes API.md pending item 2 from "display name" to "section
  driver." Single role, not `roles[]`.)

---

## 4. Admin first-run wizard (gated)

**Decision (owner):** gated wizard (Next-style, like VALC Manage Client),
not a loose checklist — the owner is chasing a *solid flow*.

**Correction (owner, 2026-06-05): Import and Licensing are NOT onboarding
steps.**
- **Data refreshes nightly on a schedule** — the admin does nothing to get
  data. The manual Import/Refresh exists only for a *period-close intraday
  refresh* and lives on the **steady-state** admin Home (the "Data refresh"
  card: "current as of … / refreshes automatically every night / Refresh
  now"), NOT in the wizard.
- **Licensing is established at provisioning** — it's a fact to *reassure*
  about, not a task.

So the wizard's real and only job is **getting the team ready** (the north
star: "team ready, data available" — and data is already available). It
collapses to a short guided welcome.

### First-run detection (no stored flag — real signals)

Home flips to onboarding mode when the team isn't set up yet:

- **No team yet** — `GET admin/users` returns only the seeded RR
  Administrator. (Primary signal now, since data + licensing are handled
  upstream.)

When the team exists → Home is steady-state on its own. No "onboarding
complete" boolean to persist or fake.

### Step sequence (trimmed)

1. **Welcome / confirm context** — confirm the **Database**; show an
   "already handled for you" reassurance list (✓ data refreshes nightly,
   ✓ N companies licensed, ✓ DMAAIs load on first export). Writes the
   session-scope object (§2). *Gate: a DB is confirmed active.*
2. **Add your team** — add users + assign each a (single) role; they get a
   set-password email and land on a scoped Home (`admin-users.html`).
   *Gate: ≥1 user added, or explicit "I'll add my team later."*
3. **Done** — "Your team can sign in. Here's what they'll land on." Link
   into the steady-state Home.

Notes:
- **Service health / Restart and Data refresh are steady-state ops, not
  onboarding** — they appear only in the everyday admin surface.
- Each gate offers an honest **"do this later"** escape — never traps the
  admin (production-ready, not hand-cuffing).
- Finance-audience copy throughout (`feedback_v8_audience_finance_not_it`).
- DMAAIs auto-load on first export, so they're reassurance on step 1, not a
  gated step. A "confirm DMAAIs" check can live on the steady-state Home.

---

## 5. Work-page scope-inheritance refactor

Companion change (separate step, can follow Home):

- Add a tiny shared helper (in `sidebar.js` or a small inline helper the
  pages already share): `RRV8.readSessionScope()` → the §2 object, and
  `RRV8.setActiveScope({activeCompanies?, period?})` → updates it.
- `inventory-reconciliation`, `-cardex-variance`, `-asof`,
  `accounting-dmaais` default their `reconciliationFilter.{companies,
  period}` from `readSessionScope()`. Remove per-page divergent defaults
  (esp. Reconciliation's `new Set()` + `'2016-08-27'`).
- **Bidirectional sticky sync:** when the user changes the *active
  company or period* on a work page (the page-level company/period
  picker), the page calls `setActiveScope(...)` so the session stays in
  sync and other pages + Home agree. (Optional: a lightweight `storage`
  event or re-read on page show keeps an already-open tab current.)
- Per-page **narrowing** (account, business unit, contributor) stays local
  and transient — it does NOT write back to the session selection.

This is what actually *fixes* the inconsistency; the Home work makes the
scope authoritative, this makes the pages honor it.

---

## 6. Phasing

- **Phase A (buildable now):** session-scope object + Home as its writer;
  role-section framework (admin / non-admin today); admin first-run gated
  wizard off real signals; work pages read the shared scope.
- **Phase B (unlocks as VALC/Agent ship):** role claim → true per-role
  sections; company-row scoping → company scope assignment in the RR Team
  step; restart endpoint (already specced) → live in steady-state Service
  health; `home-summary` → admin "needs attention" worklist.

---

## 7. API.md additions to spec (contracts now, wire later)

1. `user.roles[]` / per-db role claim — drives role sections (promote
   pending item 2).
2. (already specced) restart, `home-summary` — unchanged from the prior
   doc.

---

## Open items for the owner

- **Company scope display:** on the Home context step, show the allowed
  company set as read-only ("you're scoped to N companies") or as an
  editable multi-select? (Editable only makes sense once company-row
  scoping exists; read-only until then.)
- **Wizard re-entry:** after onboarding completes, should the wizard be
  reachable again (e.g. a "Set up another database" path for multi-DB
  customers), or is it strictly first-run-only?
