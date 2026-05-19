# RRV8 &mdash; workflow

How to pick up the V8 project after a break, build out a new page, capture
fresh data, and ship changes. Written so someone (you, a future Claude
session, a new engineer) can open this cold and be productive within an
hour.

---

## Design scopes (where state lives)

Three zones, each with a clear scope. Decide where a new control
lives by asking which scope it belongs to:

| Zone | Scope | Examples |
|---|---|---|
| **Top bar** | Truly global app chrome (no module specifics). | Brand, refresh/notifications/help/user. |
| **Sidebar** | State that persists across every module that has it, with one canonical value app-wide. | Nav, filters, System Status pulse. |
| **Page header** | State that&rsquo;s module-scoped &mdash; relevant on some pages, absent on others. | Breadcrumb, title, period selector, module Validation health strip, action buttons. |

The partial-global cases (period selector, validation light) live
on the page header. If a future page (e.g. PO Receipts) doesn&rsquo;t
have a period concept, it simply doesn&rsquo;t render the pill &mdash;
no awkward grayed-out control in the sidebar.

The persistence of filters across module navigation is handled by
`localStorage` (key `rrv8-filter-selections-v1`); they appear in
every module&rsquo;s sidebar with the same selection.

---

## What V8 is

A working-but-static modern reimagining of the RapidReconciler SPA,
designed to:

- **Live in this repo** &mdash; one folder, no separate codebase or build
  step. HTML / CSS / vanilla JS. Static enough to ship from GitHub Pages.
- **Use the live DB as the seed** &mdash; we pull sproc / view DDL and
  per-period JSON snapshots straight from the dev-box SQL Server, save them
  alongside the pages, and the front-end fetches the JSON.
- **Iterate fast** &mdash; new page = new HTML file + a data-snapshot
  next to it. No frameworks, no transpile, no migrations.
- **Eventually replace the live SPA**. The current AngularJS-era app
  (`staging-rr-spa.azurewebsites.net` / `rapidreconciler.getgsi.com`) is
  the source we&rsquo;re modernizing away from.

When V8 is ready for internal review, it&rsquo;ll be linked from the hub
page&rsquo;s *Internal Workflows* section.

---

## Repo layout

```
RRV8/
├── README.md                              ground rules + data hygiene
├── WORKFLOW.md                            you are here
├── API.md                                 current vs. proposed API shape
│
├── inventory-reconciliation.html          page (page-per-page pattern)
├── data/
│   └── reconciliation.json                ONE file covers all 13 periods
│                                          (per-account rows; period switch
│                                           is in-memory, no re-fetch)
│
├── sprocs/                                14 .sql files (sp_helptext dumps)
│   ├── usp6getrinvaccountsummary.sql      master entry for the rec page
│   │                                      (wraps v6ui_raccountsummary)
│   ├── usp6getfilteredview.sql            38 KB workhorse
│   └── &hellip;
│
├── views/                                 17 .sql files (sp_helptext dumps)
│   ├── v6ui_raccountsummary.sql           the real master reconciliation view
│   ├── v6ui_reconfiledata.sql             DEAD &mdash; intended for a process
│   │                                      that never shipped
│   └── &hellip;
│
└── scripts/                               capture / regen tooling (TBD)
    └── capture-periods.ps1                planned: re-pull the snapshot
                                           via usp6getrinvaccountsummary
                                           + FOR JSON PATH + reshape
```

**Naming conventions**

| Thing | Convention | Example |
|---|---|---|
| Page file | `<area>-<page>.html` | `inventory-reconciliation.html` |
| Data snapshot | `<area>.json` (one file per page; every period inside) | `reconciliation.json` |
| Sproc DDL | `<sproc-name>.sql` (verbatim from DB) | `usp6getrinvaccountsummary.sql` |
| View DDL | `<view-name>.sql` | `v6ui_raccountsummary.sql` |
| Script | `<verb>-<noun>.ps1` | `capture-periods.ps1` |

---

## Current state checkpoint

As of the latest commit, V8 has:

- **One page**: `inventory-reconciliation.html` &mdash; the modernized
  Inventory > Reconciliation. Fully styled. Loads
  `data/reconciliation.json` once on page load; every period
  / filter combination is computed in-memory from that.
- **Single all-periods snapshot**: `data/reconciliation.json` &mdash;
  195 row-level records covering 13 periods, 2 companies, 5 inventory
  accounts, 12 subsidiaries, 2 business units. Fetched once on page
  load; period switching is in-memory (no re-fetch). Captured via
  `usp6getrinvaccountsummary` reading the `v6ui_raccountsummary`
  view against `rrv7-acme`.
- **Period dropdown wired**: clicking shows all 13 known close dates,
  every one selectable (since the snapshot covers them all). The
  pill lives in the **page header** (next to the action buttons),
  not the top bar &mdash; period is module-scoped (Inventory and
  Transfers share it, PO Receipts has none) so the control belongs
  with page chrome that can disappear on modules that don&rsquo;t
  use it.
- **Filters live in the sidebar** (not in a page-level filter bar).
  Collapsed sidebar shows 5 filter icons; expanded sidebar shows full
  rows with `All` / `N / total` status pills and an orange dot on any
  row that's narrowed. Clicking a row opens a checkbox popover anchored
  to the right of the sidebar with a caret pointing back at the row.
  Selections persist across reloads via `localStorage`
  (`rrv8-filter-selections-v1`), mirroring the live SPA's
  cross-page-navigation persistence.
- **Filters are exact, row-level**. `data/reconciliation.json`
  contains an `accountRows` array &mdash; one row per (period,
  company, business unit, object, subsidiary, currency) tuple,
  captured from `usp6getrinvaccountsummary` against `rrv7-acme`.
  195 rows total (13 periods &times; 15 account combinations).
  - Each row carries its dimension tags plus the full variance
    breakdown (carryForward, glBatches, endOfDay, transactions,
    cardex, manualJournalEntries, unreconciledVariance).
  - `computeFilteredView()` is the single seam: filter rows by
    every active selection, then sum. Hero, GL/Perpetual side
    stats, variance steps, total, and page subtitle all read from
    its return value.
  - The bar-chart history is filtered TOO &mdash; `computeFilteredHistory()`
    groups the same row-set by period and emits OOB per period.
    Narrow to one company and the 13-period trend recomputes.
- **Active-filter banner**: an orange callout under the page header
  appears whenever any group is narrowed below "all", showing which
  groups are reduced (e.g. *"Filtered: 1 of 2 currencies"*) plus a
  Reset link.
- **Variance breakdown** renders dynamically from the filtered view,
  negatives in red parentheses, total in the navy bar.
- **Sidebar status panel** &mdash; Inventory Validation (module-scoped,
  this period&rsquo;s roll-forward state) above System Status (global
  heartbeat). 14px dots with halos. System Status pulses via
  transform + opacity (compositor thread, no main-thread repaint).
  Both lights are **clickable** &mdash; downloads a diagnostic
  Excel (validation roll-forward chain / system-feed status).
  Matches the live SPA muscle memory of clicking a light to open
  its report.
- **Excel exports** (SheetJS from CDN, deferred load):
  - *Audit Report* &rarr; multi-sheet workbook (Summary / By Company
    / By Account / History / Filters) &mdash; everything respects
    the current filter view.
  - *Journal Entry* &rarr; one-sheet JE batch with debit / credit
    rows per non-zero variance component.
  - *Inventory Validation light* &rarr; roll-forward-chain +
    variance-components diagnostic.
  - *System Status light* &rarr; overall + per-feed status with
    last-success timestamps and lag.
  - *Pending Close Items rows* &rarr; per-bucket detail report.
- **Bottom row &mdash; three reconciliation widgets**:
  - *OOB History* (trend, filtered)
  - *By Inventory Account* (clickable contributor bars; click a row
    to narrow the Object filter to that account; click again to
    restore All)
  - *Pending Close Items* (un-posted GL batches, open WO journals,
    in-transit inventory, manual JE drafts) &mdash; each row
    downloads its detail Excel
- **User menu** (click the user chip in the top bar) holds the
  identity block + database switcher + admin-gated actions (Import
  JDE data, Restart Service, Sign out). Mirrors the live SPA&rsquo;s
  sidebar-top panel but consolidated under the avatar so the
  sidebar stays nav + filters + status. Database switcher and admin
  actions are placeholders &mdash; real permission gating is the
  handoff team&rsquo;s concern.
- **Toast feedback** for every placeholder button: refresh, Journal
  Entry, Audit Report, Restart Service, Import JDE data, sidebar
  nav items that aren&rsquo;t built yet, variance step previews,
  fullscreen / notifications / help icons, context-help FAB. The
  page feels alive even when actions are stubs.
- **Hub link**: the V8 preview is linked from the hub&rsquo;s
  *Demos* section (`rapidreconciler-hub.html`), internal-only.
- **Out-of-balance history chart** redraws from JSON with min/max/zero
  axis labels and a current-period emphasis on the last point. Stats
  (Current / 12-mo high / 12-mo low / Avg) computed in JS.
- **SQL reference library**: 14 sproc DDL files in `sprocs/`, 17 view DDL
  files in `views/`. Captured via `sp_helptext` against `rrv7-acme`.
- **API.md**: documents the current `reconciliation-filtered` JSON shape
  and proposes a cleaner V8 shape.

**What&rsquo;s NOT wired yet**

- Admin actions in the user menu (Import JDE, Restart Service) flash
  a toast but don&rsquo;t do anything. Database switcher updates the
  user-chip label but doesn&rsquo;t actually re-fetch from a
  different DB &mdash; the snapshot path is hard-coded.
- Variance step *Preview* buttons flash a toast but don&rsquo;t open
  a drill-down modal yet.
- Permission gating: the user menu shows all admin actions; in
  production the auth/role layer hides what the user can&rsquo;t do.
  Handoff concern.
- The capture-periods script (`scripts/capture-periods.ps1`) isn&rsquo;t
  built yet. Recapturing data today is the sqlcmd `FOR JSON PATH`
  one-liner + small Python reshape from *How to capture* below.
  The script becomes the right investment once we have a second
  page (Transactions, etc.) that needs the same flow.
- No other pages yet (Transactions, As Of, Roll Forward, Integrity, In
  Transit, PO Receipts).
- No optimization pass on the captured sprocs / views.
- Pending Close Items + per-bucket detail rows are synthesized at
  download time (no real source rows yet). Shaped so a real backend
  can fill them in without changing the renderer.
- `RRV8/views/v6ui_reconfiledata.sql` is captured but the view itself
  is dead in production (intended for a process that never shipped).
  Leave it in the library for archaeology; the actual data source
  is `v6ui_raccountsummary` (wrapped by `usp6getrinvaccountsummary`).

---

## How to preview locally

The repo&rsquo;s static server (`.claude/serve.ps1`) is the only
prerequisite. From a PowerShell window:

```powershell
cd C:\source\repos\RapidReconciler-AI
.\.claude\serve.ps1
```

Leave that window open (closing it stops the server; Ctrl-C stops
it cleanly). Then in a browser:

```
http://localhost:8765/RRV8/inventory-reconciliation.html
```

The page reads `data/reconciliation.json` via `fetch` on load and
keeps the whole dataset in memory. Hard-refresh after editing the
page or the JSON. Period switching is in-memory (no re-fetch);
the top-bar Refresh button re-fetches the snapshot.

---

## How to add a new page

The page-per-page pattern is &mdash; copy `inventory-reconciliation.html`
to a new filename, then:

1. **Hero stat**: change the headline metric and the two side-stat
   labels.
2. **Variance / breakdown panel**: change the `data-component`
   attributes on each `<div class="variance-step">` to match the JSON
   keys for the new page&rsquo;s breakdown.
3. **History chart**: structure is the same &mdash; only the data
   array changes.
4. **Sidebar filters**: update each `<button class="sidebar-filter">`&rsquo;s
   `data-filter` attribute + label to match what the new page filters
   on. The JS reads `data.filter[<group>]` for the popover contents
   and `data.accountRows[].<dimension>` for row-level matching.
5. **Capture a snapshot**: see the capture workflow below. Save as
   `data/<area>.json` (single file covers every period for that
   area).
6. **Update `DATA_FILE`** in the page script to point at the new
   snapshot filename.
7. **Update `WORKFLOW.md`**: add the new page to the *Current state
   checkpoint* list.

The script tag at the bottom of the file is self-contained &mdash; it
loads `data/<file>` once, then period switching, filter changes, and
all the recompute logic happens in-memory off the loaded
`accountRows`. Most of the JS is generic and works across pages
with no edits.

---

## How to capture period snapshots

All 13 periods for Inventory > Reconciliation are currently captured
in `data/reconciliation.json` (195 rows). To refresh that file:

### Path A &mdash; sqlcmd one-liner (current method)

```bash
SQLCMD='/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd'
PW=$(cat "$USERPROFILE/.rr-sql-pwd")

"$SQLCMD" -S localhost -U rruser -P "$PW" -d rrv7-acme -y 0 \
  -Q "SET NOCOUNT ON; SELECT * FROM v6ui_raccountsummary ORDER BY PeriodEnds, CompanyNumber, ObjectAccount, SubAccount FOR JSON PATH" \
  > .tmp-raw.json
```

Then a small Python reshape script trims whitespace, converts the
scientific-notation numbers, and emits the V8 shape (`accountRows`
array + preserved `_meta` / `validation` / `filter` / `pending` blocks).
See git history of `RRV8/data/reconciliation.json` for the reshape
recipe; it&rsquo;s also the seed for the future
`scripts/capture-periods.ps1` (PowerShell port of the same flow).

### Path B &mdash; SQL/PowerShell script (planned)

**Not built yet.** Will live at `RRV8/scripts/capture-periods.ps1`.
Same `FOR JSON PATH` + reshape pattern, but wrapped so a future
session can run one command per page (`-Area reconciliation`,
`-Area transactions`, etc.) instead of remembering the SQL.

### Path C &mdash; Browser-side DevTools dump (legacy fallback)

If the dev-box DB is unavailable, the live staging SPA at
`staging-rr-spa.azurewebsites.net` can be dumped manually via
DevTools &rarr; Network &rarr; right-click the
`reconciliation-filtered` row &rarr; *Save as* &rarr; *response*.
That gives the old per-period response shape; you&rsquo;d still
need a reshape pass to merge multiple periods into the V8
`accountRows` shape. Not recommended &mdash; Path A is faster and
gives row-level data.

---

## How to refresh sproc / view DDL

When a sproc or view changes upstream, re-pull its DDL into the V8
library so optimization work has a current target.

```bash
SQLCMD='/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd'
PW=$(cat "$USERPROFILE/.rr-sql-pwd")
NAME='usp6getrinvaccountsummary'   # or v6ui_raccountsummary, etc.
KIND='sprocs'                      # or 'views'

"$SQLCMD" -S localhost -U rruser -P "$PW" -d 'rrv7-acme' -h -1 -W -k 1 \
  -Q "SET NOCOUNT ON; EXEC sp_helptext 'dbo.$NAME'" \
  > "RRV8/$KIND/$NAME.sql"
```

To pull a batch, loop over a list (see prior commit history for the
candidates we&rsquo;ve pulled).

---

## How to commit

V8 work follows the same flow as the rest of the repo:

1. Work on a worktree branch (`claude/<adjective-name>-<sha>`).
2. Hold commits until a logical chunk is done. Avoid one-commit-per-edit
   churn.
3. When ready: `git commit` &rarr; `git push -u origin <branch>`
   &rarr; `gh pr create` &rarr; `gh pr merge --squash`.
4. After merge, wait for the bot commits (refresh-indices,
   update-doc-dates) to settle.
5. Fast-forward the main clone:
   `git -C "C:/source/repos/RapidReconciler-AI" pull --ff-only origin main`.

V8 commits typically have no `Release-Note:` trailer &mdash; it&rsquo;s
internal staff-facing design work, not customer-facing changes. Once V8
is linked from the hub and visible to internal folks, we&rsquo;ll start
adding release notes for V8 work.

---

## Data hygiene reminders

- **No real customer data.** The Acme test-instance numbers are
  fictional. Real customer account numbers, doc numbers, branch / company
  numbers, or customer names from production never go into committed
  files.
- **No credentials in committed files.** The dev-box SQL password lives
  in `$env:USERPROFILE\.rr-sql-pwd` &mdash; that file is outside the
  repo. Scripts in `RRV8/scripts/` read it at run time, never embed it.
- **Customer-named schema objects.** The live DB has a few view names
  that bake in a customer name (`v6_008a_cavendish_producing_plant` is
  the known one). Don&rsquo;t pull their DDL into `RRV8/views/`
  without sanitizing the filename + contents.

---

## Open questions / next steps

| | What | Who decides |
|---|---|---|
| Soon | Build `scripts/capture-periods.ps1` (Path A → PowerShell port) so future pages don&rsquo;t need a re-derived sqlcmd one-liner | tooling task |
| Soon | Mockup of the second page (Transactions? As Of?) &mdash; pick which | design call |
| Medium | Variance step *Preview* modals (drill to underlying transactions per component) | design + tooling |
| Medium | Optimization pass on the captured sprocs/views | engineering |
| Medium | Real backend wiring (replace `accountRows` synthesis with API; admin actions; DB switcher; permission gating) | handoff team |
| Later | Promote V8 from the hub *Demos* section to *Internal Workflows* when there are 3+ pages | hub edit |
| Later | Decide V8&rsquo;s eventual hosting story (still GitHub Pages? Static Web App + Functions? Replace prod?) | strategic call |

---

## Useful references

- `RRV8/API.md` &mdash; current vs proposed JSON shape for the
  reconciliation endpoint
- `Tools/queries/transaction-detail-workflow.ps1` &mdash; reference
  pattern for the SQL-auth-via-password-file convention V8 scripts will
  use
- `CLAUDE.md` at repo root &mdash; project-wide conventions (link rules,
  data hygiene, commit workflow)
- The live SPA at `staging-rr-spa.azurewebsites.net` &mdash; source of
  truth for what we&rsquo;re modernizing away from
