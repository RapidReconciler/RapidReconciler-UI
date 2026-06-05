# Plan: Home as a role-shaped action / readiness page

**Status:** Spec ready. Not yet implemented. Pick up in a fresh session.
Uncommitted by request.

**Source of this plan:** session-transcript discussion on 2026-06-04. The
owner asked to redesign `RRV8/home.html` so that Home becomes **the main
action page for admin functions, and an "Am I Ready to Go?" page for
everyone else.** This followed removing the non-actionable roll-forward
"needs attention" status banner from Home (shipped in UI #196 / `c56e954`).

**Related docs:**
- [`home-command-center-mockup.html`](home-command-center-mockup.html) — the
  original Phase-1 Home mock.
- [`RRV8/API.md`](../../RRV8/API.md) — the agent/VALC contract, incl. the
  three pending Home data needs (OOB count, role-label claim, restart).
- Memory: `project_access_flow_home_workbar`, `feedback_v8_audience_finance_not_it`,
  `feedback_production_ready_default`, `user_role_exit_strategy`.

---

## Goal

Home today is one undifferentiated command center. Make it present **two
faces off the same session caps**:

1. **Admin → an action surface.** The place an administrator *operates*
   the system from: run/refresh data, manage service health, manage users
   & licensing, and triage what needs attention. Action-oriented, not
   read-only.
2. **Non-admin → an "Am I Ready to Go?" page.** A short, plain-language
   readiness check that answers one question: *"Can I do my work right
   now?"* Green checks + one clear way in. No diagnostics the user can't
   act on.

Both render from the **same role/permission caps Home already reads**
(`activeDb().m / .t / .perms`, mirroring `sidebar.js applyClientModuleCaps`).
The admin sees controls; everyone else sees readiness. This directly serves
the exit-strategy goal (`user_role_exit_strategy`): a junior or a customer
should be able to glance at Home and know whether the system is healthy and
what to do — without reading IT diagnostics.

---

## Why now / what changed

The removed status banner was the trigger: a validation **color** on Home
isn't actionable there (the real analysis is a heavy run that lives on
Reconciliation). The lesson generalizes — **Home should only show signals
the viewer can act on, shaped to who they are.** An admin can act on
"refresh failed, restart the service"; a clerk cannot, and shouldn't see it.

---

## Role determination

- **Admin signal (reliable today):** `activeDb().t.adm === true` — the same
  signal `login.html isAdminToken` and `sidebar.js` trust. Drives the
  action view.
- **Everyone else:** anyone without `t.adm` gets the readiness view. Their
  specific role label (Reconciliation Analyst, Read-Only, Cost Accounting,
  A/P Clerk) is **not in the JWT yet** (API.md pending item 2). The
  readiness view must NOT guess a label — it shapes off the per-module caps
  (`m`/`t`/`perms`) it already has, and shows a role name only once VALC
  surfaces `user.roleName` (or a per-db role claim).
- **Fail-open** stays the rule (dev token / demo): missing caps → treat as
  permitted, same as Home does today.

---

## Admin view — the action surface

Sections, each gated on the relevant cap and each *actionable*:

1. **Data** (`perms.ij`) — Import JDE now + last-refresh state and time
   (from `GET /poll` / `v_diagnostic5_job_status`, already wired as the
   Data-status pill). Show "Refreshing… / current as of <time> / refresh
   failed" inline, with Import as the action.
2. **Service health** (`perms.rs`) — surface the data-service state and a
   **Restart the data service** action. Restart routes through VALC
   (`api/v1/admin/services/restart` → Agent JMS re-spawn — see API.md;
   **never** `POST /shutdown` direct). Today this endpoint is unwired, so
   the button degrades honestly ("not available yet"); it lights up when
   VALC ships it. This is also where the export-hang advisory's restart
   lives conceptually.
3. **Accounting setup** (`perms.dm` + admin) — DMAAI load state + Load now +
   View (already present).
4. **People & licensing** (`t.adm`) — RR Team (users/roles) + Licensing
   (company seats) shortcuts (already present as the Administration panel).
5. **Needs attention** (admin, *deferred*) — a real worklist: e.g. "N
   accounts out of balance for the open period," failed refreshes, expiring
   certs. Requires the agent's `GET /inventory/home-summary` (API.md pending
   item 1). Until that lands, omit — do not synthesize counts.

Principle: every admin tile is a verb (Import, Restart, Manage, Review), not
a status light.

---

## Non-admin view — "Am I Ready to Go?"

A compact readiness card (replaces the action tiles for non-admins). Each
row is a plain check the user can read in one second:

| Check | Source | Ready / Not-ready copy |
|---|---|---|
| **Connected** | `RRV8.setAgentConnectivity` / rrFetch | "Connected to your data" / "Can't reach the data service — check your VPN" |
| **Data is current** | `GET /poll` jobStatus | "Today's numbers are current (refreshed <time>)" / "A data refresh is still running" / "Last refresh didn't finish — ask your administrator" |
| **Your module is live** | caps (`inv` today) | "Inventory is ready" / honest "your module isn't in V8 yet" (the existing A/P-clerk empty-state) |
| **Open period** | `GET /inventory/status` reconciliationFilter.period | "Working period: <period>" |

Then **one** primary action: *Start in Reconciliation →* (the first granted
page). All green → "You're good to go." Any red → the specific not-ready
line tells them what to do, in finance language (`feedback_v8_audience_finance_not_it`)
— no SQL/endpoint/JVM wording, no "restart the service" (they can't).

The readiness view is **read-only by design** — it answers a question, it
doesn't operate anything.

---

## Shared chrome (unchanged)

Header (brand, connectivity pill, Data-status pill, open-period pill, user
chip + DB switcher), greeting, "Need a hand?" support links, footer. The
DB switcher re-evaluates the role/readiness shape on change (Home already
re-renders tiles + status on DB switch).

---

## Data dependencies (status)

| Need | Endpoint | Status |
|---|---|---|
| Refresh-job state | `GET /poll` (`v_diagnostic5_job_status`) | **Live** (Data-status pill) |
| Open period | `GET /inventory/status` `reconciliationFilter.period` | **Live** |
| Connectivity | `RRV8.setAgentConnectivity` | **Live** |
| Module caps | JWT `m`/`t`/`perms` | **Live** |
| Role display name | `user.roleName` (login response) or per-db role claim | **Deferred** (API.md item 2) |
| "Needs attention" worklist / OOB count | `GET /inventory/home-summary` | **Deferred** (API.md item 1) |
| Restart data service | `POST api/v1/admin/services/restart` (VALC → Agent JMS) | **Deferred** (API.md "Restart Services instance") |

---

## Phasing

- **Phase A (buildable now, no agent/VALC work):** split Home into the two
  role-shaped views off existing caps + live signals. Admin gets the
  action layout (Data / Service health / Accounting / People); non-admins
  get the readiness card. Restart button + "needs attention" render in a
  pending/disabled state where their endpoints aren't wired (honest, not
  faked).
- **Phase B (unlocks as agent/VALC ship):** wire the role-label claim
  (real role names), `home-summary` (the admin "needs attention" worklist +
  readiness "module is live" precision), and the restart endpoint (live
  Restart action).

---

## Principles / non-goals

- **No theater** (`feedback_production_ready_default`): a control that has
  no backend renders as honestly-pending or is omitted — never a fake
  success.
- **Finance audience for the readiness view** (`feedback_v8_audience_finance_not_it`):
  no SQL view names, endpoint paths, JVM/IT jargon. JDE refs are fine on
  admin/analyst surfaces.
- **Home stays the session hub; working pages stay lean** (locked principle,
  `project_access_flow_home_workbar`): no scope/period/contributors persist
  across pages; heavy analysis stays on the working pages.
- **Not** a dashboard of read-only status lights. Admin = verbs; non-admin =
  a yes/no readiness answer.

---

## Open questions for the owner

1. **Readiness layout:** single stacked checklist card, or a compact
   horizontal "all green" strip that expands only when something's not
   ready?
2. **Admin "needs attention":** is the OOB count the first worklist item, or
   do we lead with refresh/service health and add OOB when `home-summary`
   ships?
3. **Mixed roles:** a user who is admin on one DB but not another — does the
   view follow the active DB (recommended), or the highest role across DBs?
4. **Restart placement:** Service-health section on the admin Home, the
   user-menu, or both? (The export-hang advisory already offers it
   contextually on Reconciliation.)
