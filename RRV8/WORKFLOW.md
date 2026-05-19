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
│   └── reconciliation-2016-08-27.json     one snapshot per period
│
├── sprocs/                                14 .sql files (sp_helptext dumps)
│   ├── usp6getreconfiledata.sql           master entry (thin wrapper)
│   ├── usp6getfilteredview.sql            38 KB workhorse
│   └── &hellip;
│
├── views/                                 17 .sql files (sp_helptext dumps)
│   ├── v6ui_reconfiledata.sql             the master reconciliation view
│   └── &hellip;
│
└── scripts/                               capture / regen tooling (TBD)
    └── capture-periods.ps1                planned: pull all 13 period
                                           snapshots from the DB in one
                                           script invocation
```

**Naming conventions**

| Thing | Convention | Example |
|---|---|---|
| Page file | `<area>-<page>.html` | `inventory-reconciliation.html` |
| Data snapshot | `<area>-YYYY-MM-DD.json` | `reconciliation-2016-08-27.json` |
| Sproc DDL | `<sproc-name>.sql` (verbatim from DB) | `usp6getreconfiledata.sql` |
| View DDL | `<view-name>.sql` | `v6ui_reconfiledata.sql` |
| Script | `<verb>-<noun>.ps1` | `capture-periods.ps1` |

---

## Current state checkpoint

As of the latest commit, V8 has:

- **One page**: `inventory-reconciliation.html` &mdash; the modernized
  Inventory > Reconciliation. Fully styled. Loads data from
  `data/reconciliation-2016-08-27.json` on page load and renders all
  values dynamically.
- **One period snapshot**: `data/reconciliation-2016-08-27.json` &mdash;
  captured from the live staging response (Acme test instance).
- **Period dropdown wired**: clicking shows all 13 known close dates,
  but only Aug 27 has a snapshot file; the rest say *&mdash; not captured*
  and are disabled. The pill lives in the **page header** (next to the
  action buttons), not the top bar &mdash; period is module-scoped
  (Inventory and Transfers share it, PO Receipts has none) so the
  control belongs with page chrome that can disappear on modules that
  don&rsquo;t use it.
- **Filters live in the sidebar** (not in a page-level filter bar).
  Collapsed sidebar shows 5 filter icons; expanded sidebar shows full
  rows with `All` / `N / total` status pills and an orange dot on any
  row that's narrowed. Clicking a row opens a checkbox popover anchored
  to the right of the sidebar with a caret pointing back at the row.
  Selections persist across reloads via `localStorage`
  (`rrv8-filter-selections-v1`), mirroring the live SPA's
  cross-page-navigation persistence.
- **Filters re-compute the page** from the snapshot's `breakdown` block:
  - `breakdown.byCompany` &mdash; per-company valuation + variance
    rows. Currency + Company selections aggregate matched rows.
  - `breakdown.shareByBusinessUnit`, `shareByObject`,
    `shareBySubsidiary` &mdash; weights summing to 1.0 across each
    group's ids. The product of selected shares multiplies the matched
    total. So a real-looking narrowing happens for every filter group.
  - Hero stat, GL / Perpetual side stats, variance step cards, total,
    and the page subtitle ("2 companies, 5 inventory accounts") all
    recompute on selection change.
  - The bar-chart history is intentionally NOT filtered &mdash; it's
    period-aggregate data, not per-filter slices.
- **Active-filter banner**: an orange callout under the page header
  appears whenever any group is narrowed below "all", showing which
  groups are reduced (e.g. *"Filtered: 1 of 2 currencies"*) plus a
  Reset link.
- **Variance breakdown** renders dynamically from the filtered view,
  negatives in red parentheses, total in the navy bar.
- **Out-of-balance history chart** redraws from JSON with min/max/zero
  axis labels and a current-period emphasis on the last point. Stats
  (Current / 12-mo high / 12-mo low / Avg) computed in JS.
- **SQL reference library**: 14 sproc DDL files in `sprocs/`, 17 view DDL
  files in `views/`. Captured via `sp_helptext` against `rrv7-acme`.
- **API.md**: documents the current `reconciliation-filtered` JSON shape
  and proposes a cleaner V8 shape.

**What&rsquo;s NOT wired yet**

- Filter `breakdown` block is synthesized from the aggregate totals;
  the real backend will return its own breakdown shape. The math layer
  in `inventory-reconciliation.html` (`computeFilteredView`) is the
  single seam to replace when the API lands &mdash; everything
  downstream (hero, variance steps, page subtitle, banner) reads from
  its return value.
- Variance step *Preview* buttons don&rsquo;t open anything.
- *Import JDE data* / *Journal Entry* / *Audit Report* buttons
  don&rsquo;t do anything.
- Period dropdown only has one period&rsquo;s data &mdash; we need the
  capture script to fill the rest. *Refresh* in the top bar re-fetches
  the current snapshot but other periods are still gray-disabled.
- No other pages yet (Transactions, As Of, Roll Forward, Integrity, In
  Transit, PO Receipts).
- No optimization pass on the captured sprocs / views.
- `RRV8/views/v6ui_reconfiledata.sql` is captured but the view itself
  is dead in production (intended for a process that was never
  implemented). Leave it in the library for archaeology, but it&rsquo;s
  NOT the source for the reconciliation summary.

---

## How to preview locally

The repo&rsquo;s static server (`.claude/serve.ps1`) is the only
prerequisite. Start it from the worktree root if it isn&rsquo;t already
running, then open:

```
http://localhost:8765/RRV8/inventory-reconciliation.html
```

The page reads `data/reconciliation-2016-08-27.json` via `fetch` on load.
Hard-refresh after editing the page or the JSON.

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
4. **Filter chips**: update each `<button class="filter-chip">`&rsquo;s
   `data-filter` attribute + label to match what the new page filters
   on. The JS reads `data.filter[<group>]` for the dropdown contents.
5. **Capture a snapshot**: see the capture workflow below. Save as
   `data/<area>-YYYY-MM-DD.json`.
6. **Update `WORKFLOW.md`**: add the new page to the *Current state
   checkpoint* list.

The script tag at the bottom of the file is self-contained &mdash; it
loads `data/<file>` based on the period dropdown. Most of the JS is
generic and works across pages with no edits.

---

## How to capture period snapshots

The Inventory > Reconciliation page has 13 known close dates. Today only
one (`2016-08-27`) is captured. Two paths to get the rest.

### Path A &mdash; SQL/PowerShell (planned)

**Not built yet.** Will live at `RRV8/scripts/capture-periods.ps1` +
`RRV8/scripts/capture-period.sql`. Once built, the flow is:

```powershell
# Capture all 13 periods to RRV8/data/
.\RRV8\scripts\capture-periods.ps1 -All

# Capture one specific period
.\RRV8\scripts\capture-periods.ps1 -Period 2016-04-30
```

The script will call `usp6getreconfiledata` once per period, reshape the
multi-rowset result into our JSON file format, and drop each one into
`RRV8/data/`. Mirrors the dev-box connection convention used by
`Tools/queries/transaction-detail-workflow.ps1` (sqlcmd via SQL auth,
password at `$env:USERPROFILE\.rr-sql-pwd`).

This is the right investment for a multi-week project &mdash; we&rsquo;ll
re-capture data many times as the V8 pages grow, and we&rsquo;ll use the
same template for other pages (Transactions, As Of, etc.).

### Path B &mdash; Browser-side dump (manual)

If you need data fast and don&rsquo;t want to wait for Path A tooling:

1. Sign in to the live staging app (`staging-rr-spa.azurewebsites.net`)
   on the Acme test instance.
2. Navigate to Inventory > Reconciliation.
3. Open DevTools (F12) > **Network** tab > filter to **Fetch/XHR**.
4. For each period in the date dropdown:
   - Click the period.
   - Wait for the `reconciliation-filtered` request to fire.
   - Right-click the row &gt; *Save as* &gt; *response*.
   - Save to your Downloads.
5. For each saved file:
   - Move it to `RRV8/data/`.
   - Rename to `reconciliation-YYYY-MM-DD.json` (the period&rsquo;s end
     date).
   - Edit the front of the file to add the `_meta` block:
     ```json
     {
       "_meta": {
         "captured": "<today>",
         "instance": "rrv7-acme",
         "period":   "YYYY-MM-DD",
         "source":   "GET reconciliation-filtered"
       },
       &hellip;
     }
     ```
6. Refresh `inventory-reconciliation.html` &mdash; the period dropdown
   should now have those periods clickable.

---

## How to refresh sproc / view DDL

When a sproc or view changes upstream, re-pull its DDL into the V8
library so optimization work has a current target.

```bash
SQLCMD='/c/Program Files/Microsoft SQL Server/Client SDK/ODBC/170/Tools/Binn/sqlcmd'
PW=$(cat "$USERPROFILE/.rr-sql-pwd")
NAME='usp6getreconfiledata'   # or v6ui_reconfiledata, etc.
KIND='sprocs'                 # or 'views'

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
| Soon | Build `scripts/capture-periods.ps1` so we can backfill the 12 missing snapshots | tooling task |
| Soon | Wire the *Refresh* button to re-fetch the current period&rsquo;s JSON | tooling task |
| Soon | Filter chip selection &rarr; actually filter the rendered values (path: per-filter snapshots, or a thin backend) | design call |
| Medium | Mockup of the second page (Transactions? As Of?) | design call |
| Medium | Optimization pass on the captured sprocs/views | engineering |
| Medium | Variance step *Preview* modals (show underlying transactions) | design + tooling |
| Later | Link from the hub page&rsquo;s *Internal Workflows* section | hub edit when V8 has 3+ pages |
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
