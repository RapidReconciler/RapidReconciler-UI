# RRV8 &mdash; session handoff

A self-contained brief for resuming the RRV8 project in a new Claude
session. Paste the **Resume prompt** section as the first message in
the new session; the rest of this file is context that prompt points
the new session at.

**Updated**: 2026-05-23, after the agent-first tenet landed.
Committed default `mode: 'staging'` so every V8 page hits the live
agent in dev; As Of and Cardex Variance now route through `rrFetch`
the same way Reconciliation and Transactions already do. Snapshots
remain as a fallback (`?mode=demo`) but are not the dev workflow.
WORKFLOW.md &sect; *V8 tenets* is the canonical reference.

Prior chunk (As Of + Cardex Variance spin-off): As Of now has a page-level Company
filter and the variance-hotspots strip has been extracted to its
own dedicated page (Cardex Variance, sourced from the same
`v6ui_itemrollintegritydialog` data that backs the Reconciliation
Cardex preview &mdash; 783 rows, both companies). AsOfController
fully mined in API.md (`POST /inventory/as-of` with
`{reconciliationFilter, daily, commonUom, summarizeByItem, filters}`;
Re-roll button maps to `POST /inventory/rollIItem`). Sidebar carries
Inventory &rarr; As Of &rarr; Cardex Variance.

---

## Resume prompt

> I'm continuing the RRV8 project. Before doing anything else,
> please read these in order and confirm you understand them:
>
> 1. **CLAUDE.md** at the repo root &mdash; project-wide
>    conventions, link rules, data hygiene, commit workflow,
>    "don't mention the preview panel" durable preference.
> 2. **RRV8/WORKFLOW.md** &mdash; the V8 project guide.
> 3. **RRV8/HANDOFF.md** &mdash; this file. The sections after
>    *Resume prompt* are the briefing.
> 4. **RRV8/GRID-STANDARDS.md** &mdash; the grid-standards spec
>    (Transactions Details grid is the reference implementation).
> 5. **RRV8/API.md** &mdash; full agent controller catalog +
>    Critical Gotchas (Jackson field-name binding, two
>    ValidationLight sources, diagnostic Excel pipeline). Skim
>    so the next time you wire an endpoint you don&rsquo;t repeat
>    the `docType` vs `type` debug cycle.
> 6. **RRV8/inventory-reconciliation.html** + **RRV8/inventory-
>    transactions.html** &mdash; just confirm both exist. Read
>    targeted sections when editing; pages are ~7-8k lines each.
> 7. **Recent commits**: `git log --oneline -10`.
>
> After reading those, summarize back in 3&ndash;5 bullets what
> RRV8 currently looks like and what's most worth doing next,
> then wait for the next instruction.

### In-flight design direction (queued for next session)

**Shared chrome extracted to single objects** &mdash; the V8 sidebar
and the period bar-chart selector are now mounted from shared JS
modules instead of inlined per page. What landed in this chunk:

- `RRV8/sidebar.css` + `RRV8/sidebar.js` &mdash; expose
  `RRV8.mountSidebar({activePage, hasPeriodFilter})` and
  `RRV8.setDmaaiStatus(state, info)`. All persisted state
  (pinned-class, modules expanded, DMAAI status dot, welcome chip)
  is baked into the initial template by the mount call to avoid
  post-paint flicker. Pin-class hydrates onto `<html>` when scripts
  load in `<head>` (before `<body>` exists), then migrates to
  `<body>` at mount time. Used by all 3 V8 pages.
- `RRV8/period-bars.css` + `RRV8/period-bars.js` &mdash; expose
  `RRV8.mountPeriodBars({host, data, currentPeriod, labelFor,
  fmtValue, onSwitch, labelText})`. Returns
  `{setData, setCurrentPeriod, render, destroy}`. Used by both the
  Reconciliation and Transactions pages in place of the old period
  pill. SVG with `preserveAspectRatio="none"` scales the bar group
  into the right-side header whitespace. Selected period spotlit
  with `--orange` + drop-shadow glow; "Out of Bal by Period" label
  on the left, selected-period date on the right.
- `inventory-reconciliation.html` &mdash; variance breakdown
  reformatted into a 3&times;2 grid of action cards plus a bottom
  total bar. Each card carries its own Excel export. Zero-state
  cards paint green with "No action required"; non-zero cards show
  variance + hover preview. Three bottom contributor cards: By
  business unit / By inventory account / By subsidiary. Hero
  totals dropped the "$" prefix (mixed currencies) and the "Steady
  at" subtext. Audit Excel/PDF buttons moved into a
  `.page-actions-row` directly under the title.
- `inventory-transactions.html` &mdash; period pill replaced with
  the shared bar-chart. Sidebar Period filter row click opens the
  existing period popover so the chart and the pill stay in sync.
  DMAAI preload pill removed; status routes through
  `RRV8.setDmaaiStatus` to paint the sidebar dot.
- Topbar unified across all 3 V8 pages: GSI logo + RapidReconciler
  wordmark + active DB identifier only. Demo Mode pill retired; the
  welcome chip moved into the sidebar brand area and persists.
- DMAAI loading/ready/error status is communicated by a colored
  dot next to the sidebar "DMAAIs" link instead of the in-grid pill.
  State persists across pages via sessionStorage scan
  (`rrv8.scope.v1.*.dmaais`) so the dot is correct on first paint.

**DMAAI worklist page is now built** &mdash; `accounting-dmaais.html`
was rewritten as the analyzer worklist surface (no longer a
placeholder universe-view grid). What landed in this chunk:

- Pattern detection ported into Python: `RRV8/scripts/derive-dmaai-analysis.py`
  reads `RRV8/data/v-integrity-jde-aais.json` (integrity report 0),
  runs the analyzer&rsquo;s detectors (`nz`, `glsub`, `mc`, `unrec`,
  `itnz`), and emits `RRV8/data/dmaai-analysis-latest.json`.
  Scoped to the JWT&rsquo;s allowed companies (00010, 00050 in demo).
- Page layout: headline strip (lead with "N configurations flagged for
  your review", finance-friendly copy &mdash; no F4095 / "patterns"
  jargon), collapsible caveat callout, page-scope Company filter pill,
  5-tab pill nav (Analysis / Sales / Inventory / Manufacturing /
  Purchasing) with tab counts that reflect *remaining work*, not
  static totals.
- Worklist tables: FIX FIRST + ASK CUSTOMER with inline Answer
  dropdown (Intended / Needs review / Fixed), Decision textarea, and a
  derived Status pill (Open / In Progress / Resolved / Closed by
  intent / Still Flagged). Per-finding "Configs" row-count chip; the
  Reference column is a clickable link that switches to the finding&rsquo;s
  module tab and narrows the grid via `findingFocus`.
- Module tabs: V8 grid with leading Status chip column, status filter
  pill (All / Hide intended / Open only), and **per-column value
  filter** (the new grid standard &mdash; see GRID-STANDARDS.md &sect;9).
- Save/load wired through `rrFetch` to PROD-TODO endpoints
  (`/inventory/integrity/aai-analysis-latest`,
  `/inventory/integrity/aai-responses`,
  `/inventory/integrity/aai-save-responses`); demo mode reads the
  derived JSON. Endpoint contracts pinned in `RRV8/API.md` and
  `docs/plans/dmaai-page-overlay-table.md` &sect;5.
- Pattern rules: **DocType IT (Inventory Transfer) net-zero is
  expected (wash entries) &mdash; exempt from the `nz` finding.** The
  new `itnz` pattern flags the inverse: IT pairs that fail to net to
  zero (real setup error).
- Topbar: GSI logo + active DB identifier. Sidebar: "Scope" label,
  "Modules" section with click-to-expand groups (state persisted as
  `rrv8-sidebar-modules-expanded-v1`). No GSI logo in sidebar &mdash;
  it flatten-whites on the navy background.

### As Of page &mdash; design notes

The legacy AsOf has always been slow because `RinvAsof` is tens of
millions of rows; the legacy SPA paginated as a workaround that
didn&rsquo;t do enough. The V8 redesign pivots away from the
firehose pattern:

- **Item-level rollup is the default grid view**. Rows aggregate
  by (Company, Branch, ItemNumber, UOM, GLClass) so the analyst
  sees one row per inventory position instead of one row per lot.
  Per-row expand (carrot button on each row) drills into the
  contributing lot/location detail (Location / Lot / LotStatus /
  LotExp / UOM / Quantity / Amount / QtyVar / AmtVar) inline.
- **&ldquo;Lot detail&rdquo; toggle** in the page-actions row
  flips the entire grid to the raw per-lot rows when the analyst
  wants the firehose anyway. Inverse semantics of the internal
  `summarize` state. Maps to `summarizeByItem` on the agent
  request DTO.
- **Page-level Company filter** in the actions row (`Company`
  pill). Lists distinct companies present in the data with row
  counts; selecting one narrows everything (grid, stats). Default
  is &ldquo;All&rdquo;. Persisted via localStorage so the choice
  rides across reloads.
- **Common UOM dropdown** lives next to the Company filter.
  Demo-mode narrows rows to a chosen UOM; prod will pass it through
  to the agent as `commonUom` so the server does the conversion
  math on the wire instead of letting the client see only one
  unit&rsquo;s rows.
- **Re-roll button** posts to `POST /inventory/rollIItem` (note
  double-I in the path &mdash; verbatim from the bytecode). The
  V8 button is still a placeholder toast; the endpoint is mined
  and ready to wire.
- **Server-side win**: production fetch becomes `POST /inventory/as-of`
  with `{daily, summarizeByItem: true, reconciliationFilter,
  commonUom, filters}` &mdash; the rollup query alone is small,
  and lot detail only fetches when the analyst opens a row
  (`POST /inventory/as-of/details`). Pagination as a row-count
  problem dissolves at the page level; `DataSourceRequest` paging
  still handles the residual.

**Variance hotspots moved to their own page** (Cardex Variance
&mdash; see next section). Cardex-roll-integrity is too important
a worklist to be a strip on someone else&rsquo;s page.

Period bars in the header source from `reconciliation.json` (only
the current period actually has As Of data in the demo snapshot;
clicking other periods surfaces a toast). Excel export = current
view (rollup or lot detail, filters + visibility + column order
honored) per the V8 grid standard.

State keys:

- `rrv8-asof-columns-v1`     &mdash; column visibility
- `rrv8-asof-col-order-v1`   &mdash; drag-reorder
- `rrv8-asof-sort-v1`        &mdash; sort
- `rrv8-asof-company-v1`     &mdash; Company filter
- `rrv8-asof-uom-v1`         &mdash; UOM filter
- `rrv8-asof-summarize-v1`   &mdash; rollup vs lot detail
  (default `'1'` = rollup ON)

Data source: `RRV8/data/as-of.json`, generated from the legacy
xlsx export by `RRV8/scripts/extract-asof-sample.py`. **Currently
filtered to company 00050** because the source xlsx was scoped
that way; once V8 wires through `rrFetch('inventory/as-of', ...)`
the JWT&rsquo;s allowed companies determine scope automatically.
AsOfController fully mined &mdash; see *API.md &sect; Planned &mdash;
As Of data flow* for the request shape + the `daily` vs `period`
gotcha that&rsquo;ll otherwise bite the next wiring attempt.

### Cardex Variance page &mdash; design notes

`RRV8/inventory-cardex-variance.html` is the dedicated worklist
for per-item perpetual-vs-cardex drift. Same data source as the
Reconciliation page&rsquo;s Cardex variance Preview modal
(`v6ui_itemrollintegritydialog`), elevated to its own page because
it&rsquo;s the most actionable cross-period worklist outside
Reconciliation itself.

- **Standard V8 grid**: 15 columns (Reason / Company / LongAccount
  / Branch / ShortItem / ItemNumber / ThirdItem / Location / Lot /
  Method / AdjAmount / AdjQty / UOM / GLClass / Comment).
  Drag-to-reorder, click-to-sort (defaults to `adjAmount` desc so
  the biggest hits surface first), search, column chooser, Excel
  export.
- **Hero stats**: Items flagged / |AdjAmount| / Net AdjAmount /
  Net AdjQty. Refreshes with the active filter.
- **Page-level filters**: Company pill (00010 vs 00050 in scope)
  and Reason pill (Amount vs Quantity). Persisted via localStorage.
- **No period dimension** &mdash; this is a current-state report
  (the view itself has no PeriodEnds column). Documented at
  `_meta.drilldownSources.cardex.requirePeriod = false` in
  `reconciliation.json`.
- **Reason chip** is color-coded: Amount = blue, Quantity = amber,
  so the variance type reads at a glance in the grid.

State keys:

- `rrv8-cardex-columns-v1`    &mdash; column visibility
- `rrv8-cardex-col-order-v1`  &mdash; drag-reorder
- `rrv8-cardex-sort-v1`       &mdash; sort (default `adjAmount` desc)
- `rrv8-cardex-company-v1`    &mdash; Company filter
- `rrv8-cardex-reason-v1`     &mdash; Reason filter

Data source: `RRV8/data/reconciliation.json#cardex` (783 rows,
both companies). Prod wiring will use `POST /inventory/integrity`
with `{report: 'v6ui_itemrollintegritydialog', reconciliationFilter,
take/skip/page/pageSize}` per the IntegrityController catalog row.

### Next-session queue

- **Agent dev work**: implement the three DMAAI endpoints + two SQL
  tables specified in `docs/plans/dmaai-page-overlay-table.md`.
  Pattern detector reference impl: `derive-dmaai-analysis.py`
  `detect_findings()`. Carry-forward join keyed on
  `(IssueType, Company, Scope, GLClass)`.
- **`beforeunload` guard** on the DMAAI page so the analyst gets
  warned when closing with unsaved responses (the save bar is the
  only signal today).
- **Wire the As Of page against the agent**. `AsOfController`
  exists in the jar; mine the request shape with
  `javap -p ./coral/.../AsOfController$*Request.class` and swap
  the static `data/as-of.json` fetch for an `rrFetch` call. Add
  a dedicated `/inventory/as-of/hotspots` shaped endpoint if the
  variance-only result set isn&rsquo;t a cheap derivation of the
  same query.
- **Version subtitle** (`Version 8.0` under each page title from the
  `SQLSourceControl Database Revision` extended property) &mdash;
  parked until the new agent ships and exposes it on
  `/inventory/status`. Notes saved in
  `project_db_version_subtitle_pending.md` memory.

---

## Current state at a glance

One V8 page (Inventory Reconciliation) is substantially complete.
It has:

- A **vertical reconciliation-statement variance breakdown** with
  running balance, persistent action icons, and a navy total bar.
  Subtitles use JDE table refs (F0911 to F4111, etc.).
- **Per-variance-step Preview modal** (V8's first modal) plus
  per-step Excel export. Four components are backed by real SQL
  views (glBatches, endOfDay, manualJournalEntries, cardex);
  Carry Forward Preview shows the prior period's breakdown.
- **Audit Report &mdash; Excel** matches the production
  *Perpetual Inventory Reconciliation* layout, **one tab per
  company**. Filename
  `PerpetualInventoryReconciliation_<period>_<stamp>.xlsx`.
- **Audit Report &mdash; PDF** via jsPDF + jspdf-autotable,
  Letter portrait, one company per page break, per-page footer
  with `Generated <ts>` + `Page X of Y`.
- **Context-help modal** (FAB &rarr; 2-column glossary +
  workflows).
- **Page header — V8 standard for every main page.** Layout:
  breadcrumb on top, then a title-row containing the title
  (which IS the reference-guide link via `.page-title-link`,
  with a subtle external-link arrow) + the period pill. Audit-
  report buttons (Excel + PDF) hug the right edge. No subtitle
  &mdash; the period pill carries the "which period" context.
  Period pill is visually prominent (2px blue border, 15px
  bold) to read as a primary context control.
- **Demo Mode pill** in the topbar &mdash; centered between the
  brand and the user chip via two flex spacers. Auto-removes
  itself in non-demo modes via the IIFE's `if (!IS_DEMO)`
  branch.
- **Runbook drawer** on the two sidebar status lights. Clicking
  Inventory Validation opens a runbook drawer that auto-runs
  the prior-period unposted-batches / carry-forward-break
  decision tree on `accountRows[]`, surfaces the most-likely
  cause, and offers the mailto buttons from
  `Scenarios/scenario-inventory-validation-red-variance.html`.
  Clicking System Status opens a parallel drawer over the
  production-shape SQL Agent step log (Capture / Step / Process
  / StartTime / EndTime / Seconds / UpdateCount / ErrorNum) &mdash;
  Step 1 lists recent cycles, Step 2 shows the latest cycle's
  step breakdown (the entries that sum to the cycle's total
  runtime), Step 3 flags step-duration anomalies vs. median.
  Excel export downloads in the production shape so dropping it
  into `Tools/analysis-workbook.html` triggers the analyzer's
  `SystemStatusTemplate` cleanly &mdash; the runbook hop is
  end-to-end.
- **System Status amber/red live state.** The sidebar dot + the
  drawer banner are both driven by `currentJob.jobStatus` (from
  the SQL view `v_diagnostic5_job_status`, captured at
  `RRV8/views/v_diagnostic5_job_status.sql`). Color mapping:
  `In Progress` &rarr; amber (with pulsing dot), `Successful`
  &rarr; green, `Failed` / `Cancelled` &rarr; red, `Not Found`
  &rarr; amber. Historical step-log anomalies surface as
  evidence inside the drawer but no longer drive the light
  color &mdash; the light answers "is the system trustworthy
  right now?" not "are there historical anomalies?". A 60s
  poller (prod) re-reads the view via
  `rrFetch('v_diagnostic5_job_status')` so the light stays
  live without requiring a page refresh. Demo skips the
  poll (`RR_CONFIG.statusPollMs = null`).
- **Sidebar layout**: filters above main navigation, so the
  analyst sets context (company, currency, BU, account,
  subsidiary) before picking a module. Status lights remain at
  the bottom of the sidebar.
- OOB chart with hover tooltip, sidebar pin button, By Business
  Unit panel (replaced Pending Close Items), subsidiary popover
  viewport fix.

PR history of the V8 page so far: **#76** (scaffold + first
draft), **#77** (row-level filters + clickable lights + Excel
exports), **#78** (docs refresh), **#79** (vertical variance +
Preview modal + audit data foundation), **#80** (audit Excel +
PDF + context help + chrome cleanup), **#81** (HANDOFF.md),
**#82** (runbook drawer + SystemStatus step-log + cycle-only
analysis), **#83** (mode infrastructure + offline-vendoring),
and an in-flight chunk that adds the V8 standard page-header
(title = ref-guide link, prominent period pill, right-pinned
audit buttons), Demo Mode topbar pill polish, and wires the
System Status light to `v_diagnostic5_job_status` with a 60s
poller so amber / red / green reflect the live job state.

---

## Data architecture

- `RRV8/data/reconciliation.json` (~450 KB) &mdash; loaded on
  page render. Carries `accountRows` (per-period rows), `filter`
  (sidebar options), `accountSummary`, `unpostedCardexUi`,
  `unpostedBatchesUi`, `accountDescriptions`, four view-backed
  drilldown arrays (`glBatches`, `endOfDay`,
  `manualJournalEntries`, `cardex`), and `_meta.drilldownSources`
  mapping each array to its source view.
- `RRV8/data/audit-report-detail.json` (~7.4 MB) &mdash;
  **lazy-loaded** on first audit-report click; cached in
  `_auditDetailCache`. Carries `reconcilingItems` (14,915 rows
  all periods, analyst notes preserved) + `perpetual` (19,235
  rows filtered to QOH &ne; 0).
- `RRV8/data/system-status-log.json` (~25 KB) &mdash;
  **lazy-loaded** on first System Status drawer open + a
  background fetch after main data load so the sidebar meta
  line ("Last cycle clean &middot; 4h 13m") reflects reality
  without user interaction. Cached in `_systemStatusLogCache`.
  Production SQL Agent step-log shape: `_meta`, `banner`,
  `columns`, and `rows[]` with Capture / Step / Process /
  StartTime / EndTime / Seconds / UpdateCount / ErrorNum. 7
  nightly cycles (~25 step rows each, 153 rows total): 5 clean,
  one with a slow Cardex Roll Forward, one that fails on F4111
  with SQL 8152. Generated deterministically by
  `RRV8/scripts/gen-system-status-log.py` (re-run when the
  cycle template shifts &mdash; the owner can&rsquo;t run Python
  locally; ship the regenerated JSON alongside the script edit).
- `RRV8/views/v_diagnostic5_job_status.sql` &mdash; production SQL
  view DDL that powers the System Status light (returns
  `JobStatus / job_date / minutes / avg / count`). V8's mock
  exposes the same shape under `currentJob` in
  `system-status-log.json`; prod polls the view via
  `rrFetch('v_diagnostic5_job_status')` on a 60s interval.
- `RRV8/data/demo-jwt-payload.json` (~1.4 KB) &mdash; synthetic
  JWT payload matching the prod VALC login response shape (`user`
  + `dbs[]`). Hydrates `window.RR_SESSION` in demo mode so the
  user-menu DB switcher and any other JWT-driven logic works
  the same in demo and prod. Replaces the hardcoded `USER` +
  `DATABASES` constants once the auth-wiring chunk lands.
- All data is fictional Acme test-instance data from
  `RapidReconciler_Dev`. Safe to commit per WORKFLOW.md's data hygiene
  rules.
- **Mode infrastructure** (`RRV8/config.js` + `MODE` + `IS_DEMO`
  + `rrFetch`) routes every data fetch through one helper.
  Demo mode reads the static JSON files above; prod / staging
  modes hit `<activeDb.ip>/<endpoint>` with `Authorization:
  Bearer <jwt>`. Three fetch sites carry `// PROD-TODO:` tags
  pointing at the prod endpoint shape; `grep -rn "PROD-TODO"
  RRV8/` enumerates them.
- **Auth wiring complete (client-side).** `bootSession()` runs
  at page boot: in demo mode it hydrates `window.RR_SESSION`
  from `data/demo-jwt-payload.json`; in staging/prod it reads
  the JWT from `localStorage.rrv8.token`, decodes it, and
  populates `RR_SESSION.user` + `dbs[] + activeDbIndex`. If
  no valid token is present, a centered login modal blocks the
  page until the user POSTs credentials to
  `<authBase>/resource/client/login` (staging:
  `https://staging-valcspa.cloudapp.net`; prod:
  `https://rr-valc-spa.cloudapp.net`; configurable via
  `RR_CONFIG.authBase` or `?mode=staging` URL override).
  Login success stores the JWT, hydrates session, removes the
  modal. The user-menu DB switcher reads `RR_SESSION.dbs[]`
  directly; switching DBs updates `activeDbIndex` (the next
  `rrFetch` uses the new agent automatically). Sign out drops
  the token and reloads. Permission gating (which admin
  actions to hide based on JWT flags) remains a later chunk.
- **Prod-mode reconciliation IS wired (summary-only).**
  In staging/prod mode, `loadData()` does the two-call sequence
  observed in the staging HAR: `GET /inventory/status` to
  retrieve the default `reconciliationFilter` scope, then
  `POST /inventory/reconciliation-filtered` with each filter
  dimension wrapped as `[{id, checked, show}, ...]` (the
  agent's Spring controller binds these to a `coral.rapidreconciler.client.services.beans.Item` array
  &mdash; bare ID strings cause a Jackson 400). The response
  is the legacy `{validation, filter, summary, pieChart,
  barChart, ...}` envelope. `adaptLegacyResponse(legacy,
  period)` synthesizes a minimal V8 `accountRows[]` (one row
  per period from `barChart`, with the active period carrying
  the real `glBalance / perpetualBalance / variance` from
  `summary`) so the existing render path produces correct
  numbers for hero stats, the validation light, the variance
  table, and the bar-chart history. Transactions sign is
  flipped during synthesis to round-trip cleanly through V8&rsquo;s
  `VARIANCE_SIGN.transactions = -1` aggregator. A blue
  `#js-prod-mode-banner` at top of main explains the
  summary-only limitation: row-level filter narrowing,
  per-company / per-account contributor bars, subsidiary
  popover, and variance drilldown previews can&rsquo;t differentiate
  without server-side `accountRows[]`. Confirmed live against
  the local agent on `rrtest-rrsqltest.getgsi.com:34536`
  (hosts-file mapped to 127.0.0.1) &mdash; numbers match the
  V8 demo verbatim because the demo was derived from this
  exact agent.
- **`audit-detail` and `system-status-log` confirmed missing
  server-side.** Direct probes (`GET /inventory/audit-detail`,
  `GET /system/agent-log`, `GET /system/job-status`,
  `GET /v_diagnostic5_job_status`) all return 404 on the
  agent. `ensureAuditDetail` surfaces a red
  `showFetchError('inventory/audit-detail', ...)` banner when
  the user clicks an Audit Report button in prod mode; the
  system-status-log failure logs to console only (background
  fetch, not user-initiated).
- **`/inventory/transactions` wired against the live agent**
  (`RRV8/inventory-transactions.html`). Body shape decoded
  from the staging HAR: `{ take, skip, page, pageSize,
  aggregate[], reconciliationFilter{currencies/companies/BU/
  objects/subsidiaries/period}, groupingType: 'TYPE',
  exclusions, cacheKey }`. Note: `reconciliationFilter` uses
  **bare string arrays**, NOT the `{id, checked, show}` Item
  shape that `/inventory/reconciliation-filtered` requires.
  Response: `{ total, data[], aggregates, benchmark,
  cacheKey, groups, types, subTypes, orderTypes, docTypes }`
  &mdash; full per-Type breakdown comes back in `groups`.
  V8 strategy: single bulk fetch (`pageSize: 10000`),
  client-side filter/recompute on chip clicks and Type-row
  selection &mdash; trades initial load for instant
  interactivity, fixes the legacy "minutes per page" pain.
  Per-revisit `sessionStorage` cache keyed by
  `(mode + db + period + filter signature)` with a 5-min TTL
  and 4 MB ceiling.
- **Architectural principle: all data flows through the
  RR Agent.** V8 pages do not query the database directly,
  invoke `Tools/queries/*.ps1` over HTTP shims, or load
  fixtures other than the captured snapshots in `RRV8/data/`.
  Every dynamic value comes from an agent endpoint &mdash;
  prod hits the live agent, demo mode reads the captured
  snapshot at `RRV8/data/<endpoint>.json`. New V8 features
  that need new data start with "which agent endpoint serves
  this?" as the gating question.
- **Full agent endpoint catalog is mined from the data-services
  jar.** The per-DB jar lives at
  `C:\Program Files\Rapid Reconciler\files\359` (47 MB Spring
  Boot fat jar, NOT the `rr-valc-agent.jar` next to it &mdash;
  that one is the VALC central agent and hosts no HTTP
  controllers). The complete controller catalog is in
  `RRV8/API.md` &mdash; *Per-agent endpoints &middot; Full
  controller catalog (mined from the agent jar, 2026-05-20)*.
  Mining recipe (javap on `BOOT-INF/classes/coral/.../*Controller.class`)
  is in the same API.md section + saved memory at
  `reference_rr_agent_jar.md`. Use this when an endpoint shape
  is unclear &mdash; way faster than probing.
- **Key endpoints V8 uses today** (all decoded from the jar):
    - `POST /inventory/transactions/details` — body
      `{company, doc, type}`. **`type`, NOT `docType`** &mdash;
      Jackson silently drops unknown fields, so misnaming this
      field gives a degraded sproc response with no error (only
      section-divider rows; 17 rows total instead of ~71 with
      full F4111/F0911 detail). Returns the `usp6Compare2`
      rowset grouped by `Source` column ('Doc Header', 'F4111',
      'F0911 Inv Acct', 'F0911 Exp Acct', 'RR Summary',
      'Header Comp', 'Receipts', 'DMAAa').
    - `POST /inventory/transactions/save-notes` — body
      `{notes: [rows]}`. Wired and working.
    - `GET /inventory/integrity/available-reports` — lists
      integrity reports by id + description. Report
      `v_integrity_jde_aais` is the JDE DMAAIs; Model AAI Table,
      Frozen Cost Integrity, etc.
    - `POST /inventory/integrity` — body `{report: <view-id>,
      take/skip/page/pageSize, reconciliationFilter}`. Same
      `{total, data[], aggregates, ...}` envelope.
    - `POST /system-status` &rarr; `{fileName}`, then
      `GET /download-excel/{fileName}` &rarr; the diagnostic
      Excel binary. The ONLY path to `v_diagnostic5_job_status`
      data on this agent &mdash; there is no separate JSON
      endpoint. V8 hands the Excel buffer to
      `Tools/analysis-workbook.html`&rsquo;s
      `SystemStatusTemplate` via the `rrv8-analyze` postMessage
      bridge.
    - `GET /poll` &mdash; 60s long-poll returning
      `{updating, recalculating}`. Only live "is the job
      running now?" signal. V8&rsquo;s `startSystemPollLoop`
      / `startTxSystemPollLoop` drive the amber transient on
      the System Status dot from this.
    - `GET /inventory/status` &mdash; `validation` block is
      the **Inventory Validation (roll-forward) light**, NOT
      the System Status (despite some legacy V8 wiring that
      conflated them). See *Critical gotchas* in API.md.
  V8 features wired to these:
    - **Per-row Export button** on the Transactions page
      (`RRV8/inventory-transactions.html`) is wired to
      `POST /inventory/transactions/details` with body
      `{company, doc, type}` &mdash; same parameters the
      `Tools/queries/transaction-detail-workflow.ps1` script
      passes to `dbo.usp6compare2`. **Watch the field name:
      `type`, not `docType`**; Jackson drops unknown fields
      silently. The agent returns the sproc&rsquo;s rowset
      (Doc Header / F4111 / F0911 Inv / F0911 Exp / RR Summary
      / Header Comp / Receipts / DMAAIs sections, plus the
      `Sort` sequence column that gets stripped on export).
      V8 builds the Transaction Details xlsx in the
      analyzer&rsquo;s expected shape using a HARDCODED
      canonical column order (see `SPROC_COL_ORDER` in
      `exportRow`) so the workbook is consistent even if the
      first row is sparse. Hands the buffer over to the
      analyzer **HEADLESSLY** via `handOffToAnalyzer` &mdash;
      hidden iframe pointed at `Tools/analysis-workbook.html`,
      `rrv8-analyze` postMessage bridge carrying the workbook
      ArrayBuffer + preloaded DMAAIs from
      `v_integrity_jde_aais`. The analyzer auto-detects the
      Transaction Detail template, runs analysis, and the
      browser surfaces the analyzed workbook in the parent
      window&rsquo;s downloads bar &mdash; no analyzer tab
      ever pops up. Falls back to a plain workbook download
      after a 30s timeout if the iframe doesn&rsquo;t
      acknowledge. See `AnalysisGuides/transaction-detail-analysis.md`.
    - **DMAAI preload (integrity report 0)** &mdash; on
      Transactions page boot, `getIntegrityDmaais()` calls
      `POST /inventory/integrity` with body
      `{report: "v_integrity_jde_aais", reconciliationFilter,
      take/skip/page/pageSize}`. Result (~5.3k rows on this
      install&rsquo;s scope; full SQL view has ~15.8k) caches
      in `sessionStorage` and surfaces a green pill in the
      Details header when loaded. Flows to the analyzer via
      the postMessage bridge as `window.RR_PRELOADED_DMAAIS`
      for templates that opt-in (the TransactionDetail
      template&rsquo;s AAI-pattern hook to actually consume
      it is the next follow-up). Demo snapshot at
      `RRV8/data/v-integrity-jde-aais.json`.
    - **Note-edit persistence** &mdash;
      `POST /inventory/transactions/save-notes` (body
      `{notes:[rows]}`). Wired and confirmed from the jar.
      The batch-edit modal&rsquo;s Apply button posts every
      selected row in one call.
    - **Headless analyzer pipeline** &mdash; `handOffToAnalyzer`
      on both Reconciliation and Transactions opens
      `Tools/analysis-workbook.html` in a hidden iframe
      (positioned off-screen, opacity 0). The analyzer
      signals 'rrv8-analyze-ready' via `window.parent` (the
      analyzer&rsquo;s `rrCallerWindow` helper supports both
      `window.opener` for tab-based callers and `window.parent`
      for iframes). V8 posts the workbook buffer; the analyzer
      runs `rrv8AutoAnalyze` &rarr; `handleFile` &rarr;
      `selectTemplate` &rarr; `runAnalysis` &rarr; `download()`;
      the browser surfaces the analyzed file in the parent
      window&rsquo;s downloads bar. 30s hard timeout falls
      back to a plain workbook download. Used by: Transactions
      per-row Export, System Status drawer&rsquo;s Download
      report button (Reconciliation + Transactions), GL
      Batches export, End of Day export.
    - **Analyzer-template coverage** (V8 export &rarr; template):
      Transactions per-row Export &rarr; `TransactionDetailTemplate`;
      System Status drawer &rarr; `SystemStatusTemplate`;
      GL Batches export &rarr; `GLBatchTemplate`; End of Day
      export &rarr; `EndOfDayTemplate`. Other V8 exports
      (Manual JEs, Cardex/Item Roll Integrity, Audit Report,
      Inventory Validation, Journal Entry, Carry Forward) have
      no matching analyzer template &mdash; they still write
      directly. Future templates would be analyzer-side builds.
    - **System Status drawer on Transactions** &mdash; click the
      sidebar System Status row to open a minimal drawer
      (reuses the `.edit-overlay` chrome + new `.status-banner`
      block). Shows the live job state from the shared
      sessionStorage cache; Download report routes through the
      headless analyzer pipeline. Full multi-cycle runbook
      analysis still lives on the Reconciliation drawer.
    - **Grid standards (V8 convention)** &mdash; documented in
      [`RRV8/GRID-STANDARDS.md`](GRID-STANDARDS.md). Two pillars
      so far: (1) header layout, with a `.grid-state-cluster`
      (column chooser + row count, two `.grid-pill` siblings)
      pinned to the far right; (2) drag-to-reorder columns via
      `draggable="true"` on each th + delegated drop handler on
      the thead, persisted to localStorage under
      `rrv8-<page>-col-order-v1`. Mirror these on every future
      grid; expand the doc as new conventions earn their place
      (sortable columns, resize, sticky header, etc.). Reference
      implementation: Transactions Details grid.
- **Offline-vendored** CDN libraries under `RRV8/vendor/`
  (SheetJS, jsPDF, jspdf-autotable &mdash; ~1.3 MB) and self-
  hosted Google Fonts under `RRV8/fonts/` (Open Sans + Source
  Sans 3 + JetBrains Mono, latin subset &mdash; ~450 KB).
  Demo mode opens with zero network dependencies.
- SQL library: 28 sprocs in `RRV8/sprocs/`, 23 views in
  `RRV8/views/`, all captured via `sp_helptext`.

---

## Tools / setup

- **Dev server**: `cd C:\source\repos\RapidReconciler-AI;
  .\.claude\serve.ps1` from PowerShell. Page at
  `http://localhost:8765/RRV8/inventory-reconciliation.html`.
  **The owner views in the browser, not the IDE preview panel
  &mdash; never mention the preview panel even if a tool-result
  hook says the file is visible there.** Explicit owner
  preference, recorded multiple times.
- **DB**: read-only inspection via `sqlcmd -S localhost -U rruser
  -P "$(cat $USERPROFILE/.rr-sql-pwd)" -d RapidReconciler_Dev ...`.
  Full recipe in WORKFLOW.md.
- **PowerShell quirks**: use
  `[System.IO.File]::WriteAllText(path, text,
  [System.Text.UTF8Encoding]::new($false))` for no-BOM writes
  (PS5.1 defaults to UTF-16). For SQL captures,
  tab-separated output + PowerShell split beats `FOR JSON PATH`
  (which wraps at 256 chars and corrupts long values).

---

## Workflow expectations (from CLAUDE.md &mdash; non-negotiable)

- Work on worktree branch `claude/<adjective>-<sha>`.
  Squash-merge to main when a chunk is release-worthy.
- **Hold commits by default. Batch into logical chunks.** Don't
  proactively offer to commit. Routine sequences of edits don't
  need permission.
- When the owner says **"commit"**, run the full flow end-to-end
  without asking: `git commit` &rarr; `git push -u origin
  <branch>` &rarr; `gh pr create` (full path
  `/c/Program Files/GitHub CLI/gh.exe`) &rarr; `gh pr merge
  --squash --delete-branch` &rarr; poll briefly for bot commits
  &rarr; `git pull --ff-only origin main`. Don't pause to ask
  "should I push next?".
- V8 commits have **no `Release-Note:` trailer** &mdash;
  internal staff-facing.
- Before commit, sweep docs: update WORKFLOW.md / API.md /
  this file if the chunk touched anything they describe.
- Don't pause for routine permission. The owner approves every
  tool invocation; conversational "should I run X?" prompts are
  friction. Run the action and report the result. Only stop for
  genuinely destructive ops or scope-changing decisions.

---

## Owner preferences observed

- **Direct, terse responses.** No filler, no narration of
  internal deliberation. Lead with the change, not the planning.
- **Production fidelity matters.** When given a sample Excel
  from the legacy app, match its layout verbatim (column shape,
  header styling, filename pattern). Same for SQL profiler
  traces &mdash; they reveal the real sproc chain.
- **Multi-company is a "fix the limitation" improvement worth
  taking.** Production does one company at a time; V8 does both.
- **Finance / cost-accounting audience.** Vertical
  reconciliation tables over horizontal cards when the math
  chain matters. JDE table refs (F0911, F4111, F41021) in
  subtitles &mdash; don't expand them.
- **"All signal, no noise"** &mdash; gating self-check before
  any output change. Boilerplate disclaimers that repeat every
  report = noise. Sign conventions that don't reconcile visually
  = signal missing.

---

## Gotchas

- **Jackson silently drops unknown JSON fields.** The biggest
  source of pain this session: a misnamed POST body field
  arrives as `null` at the controller with no error, and the
  underlying sproc runs with the wrong parameter producing a
  degraded-but-plausible response. The bug:
  `POST /inventory/transactions/details` takes a
  `TransactionDetailsRequest { company, doc, type }`; V8 was
  sending `docType` &rarr; sproc ran with `@DocType=NULL` &rarr;
  only 17 section-divider rows came back (vs ~71 with the
  correct field). Always cross-check JSON field names against
  the controller DTO via
  `javap -p <Controller>$<Request>.class` &mdash; full recipe
  in API.md and the saved memory at `reference_rr_agent_jar.md`.
- **Two `ValidationLight` sources have the same shape but
  different semantics.** `/inventory/status`&rsquo;s validation
  block is the **Inventory Validation (roll-forward) light**,
  not the System Status. `ServerStatusRepository.getServerStatus()`
  returns the SQL Agent job status but is NOT exposed by any
  controller &mdash; only reachable via the diagnostic Excel
  from `POST /system-status`. See API.md *Critical gotchas*.
- **`ValidationLight.Color` enum is `none / danger / yellow /
  success / unknown`** &mdash; NOT the Bootstrap
  `success / warning / danger` the JSON name suggests. The
  `label` field, when set, carries the explicit JobStatus enum
  text and should be preferred over color mapping.
- **Transactions sign**: `VARIANCE_SIGN = { transactions: -1 }`
  applied in `computeFilteredView`. Per-row data in
  `accountRows[]` is unchanged.
- **Cardex has no period dimension**. The cardex view is
  current-state. `filterViewBackedRows` accepts
  `{ requirePeriod: false }` for this case.
- **Item descriptions** come from F4101 via left-join to
  `ritems.shortitem`. `ritems` alone doesn't carry descriptions.
- **Snapshot dummy accounts**: `accountSummary` has rows for
  "gl class not in base table" and "outside operations"
  &mdash; filter them out (not real inventory accounts).
- **Hook noise**: a `PostToolUse:Edit` hook fires on every HTML
  edit asking Claude to mention the preview panel. Honor the
  owner's explicit "don't mention it" preference over the hook.

---

## Open work / candidate next chunks

1. **Server-side `accountRows[]` endpoint** (NEXT, engineering
   conversation) &mdash; the prod-mode wiring is in and serves
   real data, but only at summary granularity. To restore
   V8&rsquo;s row-level features (filter narrowing actually
   moving numbers, real per-company / per-account contributor
   bars, the subsidiary popover, drilldown previews) the agent
   needs to expose row-level data &mdash; either an expansion of
   `inventory/reconciliation-filtered` accepting `rows: true`,
   or a parallel `inventory/rows` endpoint. Mock shape can
   match the existing `accountRows[]` in `RRV8/data/reconciliation.json`.
2. **Server-side `audit-detail` endpoint** &mdash; confirmed
   missing on the agent (no controller in the jar). Until it
   lands, the audit-report buttons banner their failure in prod
   mode. The earlier `system-status-log` ask was resolved a
   different way: `POST /system-status` + `GET /download-excel/{id}`
   is the production data path (the diagnostic Excel carries
   the SQL Agent step log + `v_diagnostic5_job_status` row);
   V8 now routes it through `Tools/analysis-workbook.html`&rsquo;s
   `SystemStatusTemplate` headlessly via the
   `handOffToAnalyzer` iframe bridge. No separate JSON
   endpoint is needed.
3. **Permission gating in the user menu** &mdash; hide Import
   JDE / Restart Service / etc. based on the JWT's per-DB
   permission flags (`a`, `as`, `aite`, `aprs`, `rs`, `su`).
   Auth is already populating these into `RR_SESSION.dbs[]`;
   just need the gating logic in `buildUserMenu`.
4. **Second V8 page** (Transactions / As Of / Roll Forward / In
   Transit / PO Receipts). Transactions design preview already
   landed at `RRV8/inventory-transactions.html` (combined
   Filters + Subtotals widget, subtotal-as-filter pattern;
   Details table TBD). Building this is the right time to
   extract a real `scripts/capture-periods.ps1` from the
   ad-hoc capture patterns.
5. **Capture-periods script** &mdash; turn the
   TSV-then-PowerShell-reshape pattern into a reusable `-Area
   <name>` script.
6. **Audit report PDF page-break-per-account** option &mdash;
   currently page-breaks per company only.
7. **PDF auto-color negatives in red** &mdash; the Excel
   exports now use `[Red]` in their number-format strings to
   match the on-screen convention. The PDF (jspdf-autotable)
   needs a `didParseCell` hook to do the same: inspect each
   cell text/value, set `cell.styles.textColor = [192, 57,
   43]` when negative. Small follow-up; deferred from the
   negatives-in-red chunk.
8. **Inline data + libraries** as a one-file
   flash-drive-demoable HTML &mdash; owner declined for now,
   noted as future option. The offline-vendoring chunk already
   delivers the same "works without internet" property, just
   across multiple files rather than one.

---

## Keeping this file fresh

When a chunk lands that changes the answer to any of
*"current state," "data architecture," "open work,"* or
*"gotchas"* above, update this file in the same commit. The
doc-sweep step before `commit` should catch it &mdash; same
discipline as keeping WORKFLOW.md current.
