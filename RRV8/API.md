# RRV8 &mdash; API surface (client-side)

The V8-client perspective on the RR data-services agent: what V8
sends on the wire, what it expects back, the response adapters that
bridge V8's data model to the agent's response shape, and the design
pitch for a cleaner V8-era API.

For the **agent perspective** &mdash; the full controller catalog,
request DTO field names, repository / sproc backing each endpoint,
and gotchas around Jackson and the diagnostic Excel pipeline &mdash;
see the [`RapidReconciler-Agent`](https://github.com/RapidReconciler/RapidReconciler-Agent)
repo:

- **[docs/API.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md)**
  &mdash; controller catalog + auth / JWT shape + reconciliation
  filter shape variants.
- **[docs/gotchas.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md)**
  &mdash; Jackson field-name binding, two `ValidationLight` sources,
  `ValidationLight.Color` enum, diagnostic Excel pipeline.
- **[docs/jar-mining.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/jar-mining.md)**
  &mdash; `javap` recipe for verifying endpoint shapes against the
  production jar.
- **[specs/](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/)**
  &mdash; planned endpoints V8 needs but the agent doesn't yet
  expose (each with paste-ready Java).

---

## Auth: where V8 sends credentials

V8's login modal POSTs to the VALC endpoint:

- Staging: `https://staging-valcspa.cloudapp.net/resource/client/login`
- Production: `https://rr-valc-spa.cloudapp.net/resource/client/login`

(Configurable via `RR_CONFIG.authBase` in [config.js](config.js) or
`?mode=staging` URL override.)

Success response carries a single field:

```json
{ "token": "<RS256 JWT>" }
```

V8 stores it under `localStorage.rrv8.token`, decodes the payload
client-side, and populates `RR_SESSION.user` + `RR_SESSION.dbs[]`.
Every subsequent agent call carries
`Authorization: Bearer <jwt>`. Sign-out drops the token and
reloads.

**Failure handling**: VALC returns HTTP 500 with
`{"message": "User invalid."}` on bad credentials &mdash; not a 401.
V8's login modal parses the `message` field to distinguish bad-creds
from real outages. See
[gotchas.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md)
for the agent-side reason this is the way it is.

**JWT payload fields V8 uses**:

- `dbs[i].ip` &mdash; per-DB agent URL + port. V8's user-menu DB
  switcher picks among these; the active one becomes the API base
  for the session.
- `dbs[i].n` &mdash; DB name (label on the user chip).
- `dbs[i].i` &mdash; allowed companies (Inventory). Drives the
  Company filter universe on every page.
- `dbs[i].a` / `as` / `aite` / `aprs` / `rs` / `su` &mdash; permission
  flags. Currently V8 reads them but doesn't gate the user menu on
  them (handoff concern; see HANDOFF.md).

Full JWT payload shape:
[agent docs &sect; JWT payload](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md#jwt-payload-shape).

---

## Endpoints V8 calls today

| Endpoint | Body shape | V8 page | Notes |
|---|---|---|---|
| `GET /poll` | (none) | all pages | 60s long-poll for "is a job running?" Drives the System Status amber transient. |
| `GET /inventory/status` | (none) | Reconciliation, As Of | Returns `reconciliationFilter` + `validation`. Validation block is the **Inventory Validation light** (NOT System Status &mdash; same shape, different semantics; agent gotchas doc). |
| `POST /inventory/reconciliation-filtered` | Item-wrapped filter arrays | Reconciliation | Summary only today; row-level rows endpoint pending. |
| `POST /inventory/reconciliation/rows` | Item-wrapped filter arrays | Reconciliation, Transactions (cross-period bar chart) | **Live on test agent** (port 34537). V8 calls it for the contributors card + cross-period transactions bars. Spec: [reconciliation-rows.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md). |
| `POST /inventory/reconciliation/history` | Item-wrapped filter arrays | Reconciliation header bar chart | **Live on test agent.** Spec: [reconciliation-history.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-history.md). |
| `POST /inventory/audit-detail` | Item-wrapped filter arrays | Audit Report Excel + PDF | **Live on test agent.** Spec: [audit-detail.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/audit-detail.md). |
| `POST /inventory/variance-component` | `{component, ...recon-filter}` | Preview modals for GL Batches / End of Day / Manual JEs / Cardex | **Live on test agent.** Spec: [variance-component-drilldown.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/variance-component-drilldown.md). |
| `POST /inventory/transactions` | bare-string filter arrays + paging | Transactions | Single bulk fetch (`pageSize: 10000`), client-side filter/recompute on chip clicks. |
| `POST /inventory/transactions/details` | `{company, doc, type}` | Transactions per-row Export | **`type`, not `docType`** (Jackson gotcha). |
| `POST /inventory/transactions/save-notes` | `{period, notes: [...]}` | Transactions batch-edit modal | Field names camelCase first-letter-lowercase. |
| `POST /inventory/integrity` | `{report, take/skip/page/pageSize, reconciliationFilter}` | DMAAIs (preload), planned for Cardex Variance | Integrity report `0` is `v_integrity_jde_aais`. |
| `POST /inventory/as-of` | `{daily, summarizeByItem, commonUom, reconciliationFilter, filters, ...}` | As Of | **The period field is `daily`, not `period`.** `reconciliationFilter` is bare strings here. |
| `POST /inventory/as-of/details` | `{branchPlant, lot, company, itemNumber, location, glClass, uom, companyNumber}` | As Of Details popover | Returns the item ledger via `usp6ItemRollForward`. |
| `POST /inventory/rollIItem` | (same as as-of body) | Cardex Variance Re-roll | Note **double-I** in the path. |
| `POST /system-status` | (empty) | Topbar status, Reconciliation drawer | Returns `{fileName}`. Pair with `GET /download-excel/{fileName}` to get the diagnostic Excel; hand to the analyzer for parsing. |
| `GET /download-excel/{id}` | (none) | follow-up to `/system-status` | The diagnostic Excel binary. |

Full agent-side controller catalog (including endpoints V8 doesn't
exercise yet):
[agent docs &sect; Controller catalog](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/API.md#controller-catalog).

---

## Implications for V8

1. **Two API bases, not one.** `RR_CONFIG.authBase` for login; the
   active DB's `dbs[i].ip` becomes the per-session data base. The DB
   switcher in V8's user menu IS the production behavior &mdash;
   it's selecting a different `dbs[i]` from the same JWT.
2. **Auth is dirt simple.** JWT in localStorage, Bearer header, no
   cookies, no SSO.
3. **The production `reconciliation-filtered` endpoint returns SUMMARY
   ONLY** &mdash; no `accountRows[]`. V8's row-level filtering (the
   page's value-add over the live SPA) requires the agent to expose
   row-level data. Spec is queued at
   [agent specs &sect; reconciliation-rows.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md);
   V8 already wires the call. Day the controller method ships, V8
   picks up real BU / Account / Subsidiary bars with no client
   change.
4. **No JSON endpoint exposes `v_diagnostic5_job_status` directly.**
   The view's data is reachable only through `POST /system-status`,
   which generates the diagnostic Excel server-side. V8 fetches the
   Excel and runs it through `Tools/analysis-workbook.html`'s
   `SystemStatusTemplate` via the headless `rrv8-analyze`
   postMessage bridge &mdash; never re-implement that parsing
   inline. Background:
   [agent gotchas &sect; Diagnostic Excel pipeline](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/docs/gotchas.md#diagnostic-excel-pipeline-the-only-path-to-v_diagnostic5_job_status).
5. **The other variance-component drilldowns** (audit detail,
   row-level breakdowns, etc.) need new server-side endpoints; none
   of the existing `/inventory/*` endpoints return row-level data
   today. Specs go into the agent repo as they ripen.

---

## Home page (`RRV8/home.html`) &mdash; pending data needs

The post-login Home command center (access-flow Phase 1) ships
reading only data the agent/JWT already provide, and degrades
gracefully where they don't. Two enrichments are deferred to a
backend contract rather than synthesized client-side (per the
"always spec new endpoints" rule):

1. **Out-of-balance account count.** The Home insight strip ("do I
   even need to go further?") currently runs off
   `GET /inventory/status` &rarr; `validation.color`
   (green/amber/red) only &mdash; a system-health signal, not a
   work-to-do count. There is **no endpoint today** that returns
   "N accounts out of balance for the open period." When one lands
   (candidate: a lightweight `GET /inventory/home-summary` or a
   `count` field added to `reconciliation-filtered`), Home upgrades
   the message from "validation is green" to "N accounts need
   attention" with **no client rewrite** &mdash; the render already
   branches on the richer field if present and falls back to
   validation otherwise. Until then, no count is shown (not faked).

2. **Role label claim.** Home shows the `Administrator` badge only
   from the reliable `dbs[i].t.adm === true` signal (the same one
   `login.html` `isAdminToken` and `sidebar.js` trust). The other
   assignable roles (Reconciliation Analyst, Read-Only, Cost
   Accounting, A/P Clerk) are **not carried as a label in the JWT**
   today &mdash; only as the per-module `m`/`t`/`perms` caps Home
   already gates on. When VALC surfaces a role display-name (in the
   login response `user.roleName`, or a per-db role claim), Home
   shows it; until then it shows no non-admin role badge rather than
   inferring a wrong one from caps.

Both are additive: the Home page is fully functional without them.

3. **Account Roll Forward Analysis lives on Reconciliation, not Home.**
   The Account Roll Forward Analysis (Export Analyzer roll-forward
   template, sheet `Roll Forward`, keyed on `GLOK`/`VarOK`/`OOB`/
   `CardexVar`) is the report the customer expects from the Inventory
   Validation light. Producing it faithfully &mdash; results that match
   **what the database looks like today** &mdash; is a **full analysis
   run** (heavy lifting), so it belongs on the **Reconciliation page**
   (the validation light → `generateValidationReport()`), NOT on the
   lightweight Home command center.

   **Home stays light:** its red-state insight just flags "needs
   attention" and routes the user to Reconciliation (`reconUrl()`,
   navigate only) &mdash; no auto-download, no heavy run on Home. (The
   `?report=validation` auto-download hook in `inventory-reconciliation.html`
   still exists but is no longer triggered from Home.)

   **To make the analysis match the live data**, it needs the agent's
   **native Roll Forward export**. Today `generateValidationReport()`
   materializes the `Roll Forward` sheet from the loaded `reconciliation`
   snapshot: `OOB`/`CardexVar`/`Variance`/balances are real/current, but
   `GLOK`/`VarOK` *break* flags are not in the snapshot &mdash; they're
   emitted as `baseline`/`end`/`yes`, so a client-built sheet can't
   surface a true roll-forward break (it'll read "no errors" when the
   break IS the issue). When the agent exposes the real export (the
   legacy/v359 report, with true flags), `rrFetch` it and hand the bytes
   to the analyzer (candidate `GET /inventory/roll-forward`, or the
   `download-excel/{id}` pattern the System Status pipeline uses) so the
   findings reflect today's actual data. Do NOT hardcode findings to
   match a sample workbook &mdash; the analysis must be data-driven.

---

## Restart Services instance (self-serve, VALC-orchestrated)

**Status: SHIPPED (B1a, local path) — VALC endpoint live.** The VALC
`AdminServicesController` (`POST /api/v1/admin/services/restart {database}`)
resolves the DB to its `client_databases` row and does a local
`AgentLifecycleService` stop &rarr; start (sticky `service_port` reused, so
JWT/bookmarks don't churn) for the dev / same-box topology where VALC owns
the Services process. Returns `200 {status:"RESTARTING", database, port}`.
The **remote-customer JMS `RestartInstance`** path (when the customer's Agent
owns the process) is **B1b — pending** (see
`docs/plans/services-restart-endpoint.md`). V8 ships a
self-serve restart for the recurring production symptom where the
Services jar hangs building an Excel export under memory pressure /
heavy concurrency (restarting the Services jar clears it):

- An **export hang advisory** (`inventory-reconciliation.html`,
  `withExportWatchdog` around the audit-report export) surfaces a
  finance-friendly banner if an export hasn't returned within ~40s, with
  a **Restart the data service** button gated on the `rs` (Restart
  Service) JWT permission &mdash; the same perm the admin user-menu uses.
- The button + the user-menu **Restart Service** action both call
  `restartService()` &rarr; `POST api/v1/admin/services/restart`
  (routes to VALC via the `api/v1/admin/` prefix) with body
  `{ "database": "<active db name>" }`.

**Why VALC and not the Services jar directly:** restart is the Agent's
job. Per `RapidReconciler-Agent/docs/deploy-architecture.md`, the
Services jar exposes only Actuator `/health`, `/info`, `/shutdown`;
`POST /shutdown` *stops* an instance, and **only the Agent re-spawns it**
(`ServicesInstanceManagerService`, over JMS). V8 must therefore never
`POST /shutdown` to a Services jar directly &mdash; it would stop the
instance with nothing to bring it back. VALC's job for this endpoint:
resolve the client/DB &rarr; tell the Agent (JMS) to **stop + re-spawn**
that DB's Services instance (mirrors the deploy flow's stop-old/start-new
step) &rarr; return 200 when the restart is dispatched.

B1a ships the local path; against a customer's remote Agent the endpoint
returns 503 ("remote-agent restart not wired yet") until B1b, and
`restartService()` surfaces that honestly rather than faking success. No
client change was needed — V8 already calls the endpoint.

---

## Service memory health (proactive restart hint)

**Status: V8 wired; agent endpoint written, ships with the next Services
jar release.** Complements the reactive Restart button above: the recurring
production failure is heap exhaustion under concurrency (several users run
several reports in a short window; the heap ramps and exports start failing
before GC catches up). This read lets Home's **Service health** card hint a
restart *before* reports fail, instead of only flagging an outage after.

- **Endpoint:** `GET /admin/service-health` on the per-DB Services jar
  (agent-direct, like `inventory/status` / `poll`; routes via
  `RR_TEST_AGENT_AREAS` in `config.js`). **Authenticated** — not in the
  agent's permitAll list; the card is admin-only and carries the JWT.
- **Why agent-direct, not VALC:** this only *reports*. Lifecycle stays
  VALC's job — the card's Restart button still routes to
  `POST /api/v1/admin/services/restart`. V8 never acts on this read by
  hitting the Services jar's own `/shutdown`.
- **Response (`ServiceHealthSnapshot`):**

  ```json
  {
    "state": "healthy | watch | restart",
    "trend": "stable | climbing",
    "uptimeMs": 264600000,
    "heapUsedMb": 900, "heapMaxMb": 1024,
    "liveSetMb": 540, "liveSetMaxMb": 700,
    "gcOverheadPct": 6.4,
    "freeRamMb": 1200, "totalRamMb": 8192,
    "sampledOverSec": 240
  }
  ```

- **The verdict is agent-side (one source of truth); V8 owns the
  finance-facing copy per state.** The signals deliberately avoid the
  instantaneous-heap-% trap (a healthy JVM sawtooths near max):
    - **post-GC old-gen floor** (`liveSetMb` / `liveSetMaxMb`) — the live
      set GC can't reclaim; a climbing floor toward max is the real signal;
    - **GC overhead** (`gcOverheadPct`) — % of recent wall-clock in
      stop-the-world GC; back-to-back collections reclaiming little is the
      in-the-moment freeze;
    - **free physical RAM** on the host;
    - **trend** — floor climbing vs stable across a ~5-min ring buffer.
  Thresholds: `restart` when live-set ≥90% **and** GC ≥10%, or live-set
  ≥97%, or free RAM ≤5%; `watch` at the softer bands or a climbing trend;
  else `healthy`. Agent spec:
  `RapidReconciler-Agent/specs/service-memory-health.md`.
- **Graceful fallback:** `loadServiceMemory()` polls every 60s and on a
  restart; if the endpoint is absent/unreachable (older jar, or the card
  hits a Services instance that predates this release), it silently keeps
  the connectivity-only signal — no placeholder, no error surfaced.

---

## Model DMAAI Review (validate + approve the model)

**Status: V8 wired (Home card + `accounting-model-review.html`); agent
endpoint + table written, ship with the next Services jar release + a SQL
apply.** The model DMAAI table (4152 PI) is what RR reads on every import to
decide which GL account each inventory transaction posts to. The goal is to
confirm every GL class used in inventory maps to the correct account, then
record a **single model-level sign-off** — GSI surfaces the diagnostic but
cannot approve the setup (only the customer's accounting team can).

- **Endpoints** (agent-direct, authenticated; in `RR_TEST_AGENT_AREAS`):
    - `GET /inventory/integrity/model-approval` — the verdict + counts.
    - `POST /inventory/integrity/model-approval` — record the attestation
      (body `{ "note": "<optional>" }`; the approver is taken from the JWT,
      never the body).
- **`GET` response (`ModelApprovalStatus`):**

  ```json
  {
    "state": "approved | needs-review | unapproved",
    "approved": true,
    "approvedBy": "name@customer.com",
    "approvedDate": "2026-06-06T15:30:00Z",
    "note": "IN90/EXP1 exclusions are intended",
    "report1Count": 50,              // model GL-class -> account mappings (Report 1)
    "report3Count": 3,               // GL classes currently excluded (Report 3)
    "report3CountAtApproval": 3,
    "changedSinceApproval": false,
    "companiesInScope": ["00010","00050"]
  }
  ```

- **Verdict is agent-side (one source of truth); V8 owns the copy.**
  `state`: `unapproved` (never signed off) · `needs-review` (approved, but
  the excluded-GL-class set has drifted since sign-off — a SHA-256
  fingerprint of the excluded (Company, GL class) set, stored at approval,
  no longer matches) · `approved` (signed off, unchanged). Report 3 having
  exclusions isn't itself an error — some GL classes are legitimately
  excluded (non-stock / expense); the human sign-off is the gate.
- **Single model-level attestation**, not per-GL-class: backed by
  `dbo.RDmaaiModelApproval` (latest row = current sign-off; older rows are
  an audit trail). Counts come from Integrity Report 1
  (`v_integrity1_aai_base`) + Report 3 (`v_integrity3_exc_glc`), JWT-scoped.
  Agent spec: `RapidReconciler-Agent/specs/model-dmaai-review.md`;
  table DDL: `RapidReconciler-Agent/setup/sql/create-dmaai-model-approval-table.sql`.
- **Surfaces:** Home's **Model DMAAI Review** card (`home.html`
  `loadModelApproval`) reads the verdict; the leaner
  **`accounting-model-review.html`** shows Report 3 (excluded GL classes,
  the materiality) + Report 1 (the model baseline) and ends in the single
  Approve action. **Graceful fallback:** both degrade to a neutral
  "review the model" state when the endpoint isn't live.

---

## Data purge (period cutoff)

**Status: SHIPPED (agent + V8).** Purging old data = moving the period
cutoff (`rcompanies.PeriodCutoff`) forward to a new period beginning date;
the **next refresh purges everything before it, server-side**. This replaces
the old manual, per-company date edits with one action that sets every
company's cutoff at once.

- **Endpoints** (agent-direct, authenticated; in `RR_TEST_AGENT_AREAS`):
    - `GET /inventory/integrity/purge-info` — current cutoff, DB file size,
      and the valid new start dates.
    - `POST /inventory/integrity/purge-cutoff` `{ "date": "yyyy-MM-dd" }` —
      set the cutoff on every company the caller can see; returns the updated
      info.
- **`GET` response (`PurgeInfo`):**

  ```json
  {
    "currentCutoff": "2015-08-30",
    "cutoffsDiverge": false,
    "dbSizeMb": 49500, "dbSizePretty": "48.3 GB",
    "calendarDiverges": false,
    "candidates": ["2015-10-04","2015-11-01", "..."]
  }
  ```

  `candidates` are the shared `Rfiscalcalendar.PeriodBegins` later than the
  current cutoff (exact dates — fiscal periods aren't month-aligned).
  `calendarDiverges` flags companies that don't share the same period
  beginning dates (the card warns, doesn't block). `dbSizeMb` is the data
  file (`sys.database_files` ROWS).
- **Reversible until the refresh runs.** Setting a *later* cutoff stages the
  purge and the card's button becomes **Restore**, which POSTs the prior
  cutoff back. A *forward* move must land on a real period beginning date
  (else 400); a *backward* (restore) move is unrestricted — it only re-widens
  and never purges. The actual purge is the refresh job's, not this
  endpoint's. Note: forward-to-invalid currently surfaces as 403 (the agent's
  `/error` dispatch isn't in its permit list) — the client catches it and the
  dropdown only offers valid dates, so it's an unreached safety net.
- **Surface:** Home's **Data** card → "Purge old data" row → a modal
  (`home.html` `loadPurgeInfo` / `togglePurge`) showing the current cutoff +
  DB size, the exact-date picker, the irreversibility + backup warning, and
  the large-DB insight (performance / disk / tempdb / autogrowth). Agent spec:
  `RapidReconciler-Agent/specs/data-purge.md`.

---

## Variance-component &rarr; source-view bindings

These bindings let V8's Preview pane / Excel export call the right
SQL when wiring moves from static snapshot to a live backend.

| Component | Source view | Notes |
|---|---|---|
| `glBatches` | `v6_007_unpostedbatches` | Un-posted F0911 batches joined to `rinvaccountlist` and `rfiscalcalendar`. Per-batch grouping with approval + post status. Excel export matches the production *Unposted GL Batches* report shape verbatim (10 cols: CompanyNumber / BatchDate / PeriodEnds / Username / LongAccount / BatchNumber / Type / Amount / Approval_Status / Posting_Status; merged title row; light-gray header row; no metadata block). Currency + Rate columns from the production report are intentionally skipped &mdash; we don't yet capture an FX source. |
| `endOfDay` | `v6_006_unposted_cardex` | Un-posted cardex transactions (`rtransactions` where `batchnumber = 0`) joined to `rinvaccountlist`. Per-doc grouping with order type, doc type/number, branch plant, and next-status. |
| `manualJournalEntries` | `v6ui_manual_entries` | Per-doc manual JEs (`vcr_f0911` where `batchtype = 'g'` and `ordertype = ''`) joined to `rinvaccountlist`. 10 cols: CompanyNumber / PeriodEnds / DocType / DocNumber / LongAccount / Amount / UserName / Originator / Explanation / Remark. Currency + Rate from the view are dropped in V8 until an FX source is captured. |
| `carryForward` | (rollover &mdash; no drilldown) | Prior-period unreconciled variance; not drillable. |
| `transactions` | (dedicated page) | Has its own Transactions page; no inline drilldown. |
| `cardex` | `v6ui_itemrollintegritydialog` | Per-item integrity issues where perpetual valuation doesn&rsquo;t roll cleanly (`rperpetualinv` where `reason != ''`) joined to `rinvaccountlist`. 15 cols: Reason / CompanyNumber / LongAccount / Branch / ShortItem / ItemNumber / ThirdItem / Location / Lot / Method / AdjAmount / AdjQty / UOM / GLClass / Comment. **No PeriodEnds column** &mdash; current-state report, not period-historical. The shared filter chain skips the period predicate for this binding via `requirePeriod: false`. |

The snapshot declares these bindings in `_meta.drilldownSources`.
Front-end filter chain (`filterViewBackedRows`) is shared across all
view-backed components &mdash; takes (array key, amount field name),
filters by current period + selected companies + the set of long
accounts that pass `rowMatchesFilters`, and sorts by `|amount|` desc.

---

## V8 sign conventions applied on top of agent responses

The agent returns variance components with the magnitude of each
F0911-to-F4111 effect. V8 applies a sign multiplier at aggregation
to make the components sum cleanly to the unreconciled total:

```js
const VARIANCE_SIGN = { transactions: -1 };  // others default to +1
```

This is declared in [inventory-reconciliation.html](inventory-reconciliation.html)
inside `computeFilteredView`. The per-row data in `accountRows[]` is
unchanged; the convention is declared in one place so downstream
consumers (variance table, Carry Forward preview, audit report, JE
export) all get properly-signed values.

When the row-level reconciliation endpoint ships
([spec](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md)),
the agent should pass through the sign as the view already emits it
&mdash; V8's `VARIANCE_SIGN.transactions = -1` flip handles the rest.

---

## Current network surface (legacy SPA, for reference)

Pre-V8, the live AngularJS SPA's Reconciliation page made these XHR
calls on load:

| Endpoint | Purpose | Size | Notes |
|---|---|---|---|
| `available-periods` | List of close dates for the period dropdown | 899 B | Fires **4&ndash;5&times;** per load. Wasteful. |
| `status` | System Status indicator (color, popover, lag) | 1.1 kB | Fine. |
| `poll` | Heartbeat for the status indicator | 548 B | XHR long-poll, 60s. |
| `reconciliation-filtered` | The actual reconciliation data | 4.1 kB | The page's payload. |

Plus `collect?v=2&tid=G-LDXX33M9BZ` (Google Analytics 4) on every
route change.

---

## Current `reconciliation-filtered` response shape (legacy)

The page's primary payload. Real response from the Acme staging
instance (sanitized labels; same values as the rendered page).

```json
{
  "validation": {
    "color": "success",
    "tooltip": "This indicator is red if the roll forward from the prior period fails...",
    "label": null,
    "minutes": 0,
    "average": 0,
    "count": 0
  },
  "filter": {
    "currencies":   [{ "id": "GBP", "checked": true, "show": true, "label": "&pound; - GBP" }, ...],
    "companies":    [{ "id": "00010", "parentId": "USD", ... }, ...],
    "businessUnits":[{ "id": "1000000", "parentId": "00010", ... }, ...],
    "objects":      [{ "id": "141000", "label": "141000 - Raw Material" }, ...],
    "subsidiaries": [{ "id": "", "label": "None" }, { "id": "CC" }, ...],
    "selectedsObjects": [...]
  },
  "summary": {
    "valuation": {
      "glBalance":        18724064.22,
      "perpetualBalance": 18710860.69,
      "outOfBalance":        13203.53
    },
    "variance": {
      "carryForward":        -18674.7,
      "glBatches":           { "value": -0.0,     "alert": false },
      "endOfDay":            { "value": -0.0,     "alert": false },
      "transactions":          -280.51,
      "cardex":              { "value": 35606.77, "alert": false },
      "manualJournalEntries":{ "value": -3448.03, "alert": false },
      "exclusions":          { "value": null,     "alert": false },
      "unreconciledVariance":13203.53
    },
    "calculation": {
      "glBalance": null, "openReceipts": null, "outOfBalance": 13203.53,
      "unreconciled": null, "batches": null, "totalVariance": null,
      "suggestedEntry": null, "manualEntries": null
    }
  },
  "pieChart": {
    "data": [
      { "label": "GBP", "data": 25203.70, "tooltipData": -25203.70, "color": "#f1a443" },
      { "label": "USD", "data": 38407.23, "tooltipData":  38407.23, "color": "#0c609b" }
    ],
    "level": 1,
    "label": "Base Currency"
  },
  "barChart": [
    {
      "label": "Out of Balance",
      "color": "#f3a536",
      "data": [
        ["2015-08-29",      0.04],
        ["2015-10-31",    -47.64],
        ["2015-11-28", -29245.59],
        ...
        ["2016-08-27",  13203.53]
      ]
    }
  ],
  "agingChart": null,
  "alertDuplicateCosts": false
}
```

### Issues with the legacy shape (motivation for the V8 design pitch below)

1. **Inconsistent variance components.** Some are scalars (`carryForward: -18674.7`,
   `transactions: -280.51`), some are `{ value, alert }` objects. Forces the
   client to type-check each field.
2. **Multipurpose payload.** `calculation.*` carries PO Receipts fields
   (`openReceipts`, `suggestedEntry`, `batches`) that are all `null` on this
   page. Same endpoint is reused across modules.
3. **Filter state echoed back.** The response repeats the entire filter state
   the client just sent. Client could keep filter state in the URL or local
   memory instead.
4. **Typos / inconsistent naming.** `selectedsObjects` (extra `s`),
   `tooltipData` vs `data`, color hex strings hard-coded server-side.
5. **Drill-down requires a round-trip per level.** `pieChart.level: 1`. Clicking
   into a segment fetches the next level. Could be inlined for 1-2 levels.
6. **Color hex codes baked in server-side.** Theme changes require a backend
   deploy.

---

## Proposed V8 shape (design pitch)

Single endpoint per page, normalized variance components, theme-agnostic
colors, filter state stays in the URL. Pitch only &mdash; engineering owns
implementation.

### Endpoint

```
GET /api/v2/inventory/reconciliation
    ?period=2016-08-27
    &currencies=GBP,USD
    &companies=00010,00050
    &businessUnits=1000000,5000000
    &accounts=141000,142000,143000,143100,145000
    &subsidiaries=,CC,FM,MLD,MM,PM,PRS,RW,S/A,S/C,SEC,SM
```

### Response

```json
{
  "asOfPeriod": "2016-08-27",
  "instance": "RapidReconciler_Dev",
  "currency": "USD",
  "status": {
    "validation": "green",
    "validationDetail": "Roll-forward clean.",
    "lastRefresh": "2026-04-17T09:48:00Z",
    "lagMinutes": 0
  },
  "filters": {
    "currencies":    [{ "id": "GBP", "label": "&pound; - GBP" }, { "id": "USD", "label": "$ - USD" }],
    "companies":     [{ "id": "00010", "currency": "USD", "label": "Acme Inc" }, ...],
    "businessUnits": [{ "id": "1000000", "company": "00010", "label": "Balance Sheet" }, ...],
    "accounts":      [{ "id": "141000", "label": "Raw Material" }, ...],
    "subsidiaries":  [{ "id": "",  "label": "None" }, { "id": "CC", "label": "CC" }, ...]
  },
  "valuation": {
    "glBalance":        { "value": 18724064.22, "currency": "USD" },
    "perpetualBalance": { "value": 18710860.69, "currency": "USD" },
    "outOfBalance":     { "value":    13203.53, "currency": "USD" }
  },
  "variance": {
    "components": [
      { "key": "carryForward",        "label": "Carry forward",         "value": -18674.70, "alert": false },
      { "key": "glBatches",           "label": "GL batches",            "value":      0.00, "alert": false },
      { "key": "endOfDay",            "label": "End of day",            "value":      0.00, "alert": false },
      { "key": "transactions",        "label": "Transactions",          "value":   -280.51, "alert": false },
      { "key": "cardex",              "label": "Cardex",                "value":  35606.77, "alert": false },
      { "key": "manualJournalEntries","label": "Manual journal entries","value":  -3448.03, "alert": false }
    ],
    "total": { "value": 13203.53, "currency": "USD" }
  },
  "drillDown": {
    "levels": [
      {
        "level": 1,
        "label": "Base currency",
        "segments": [
          { "key": "GBP", "label": "GBP", "value": 25203.70 },
          { "key": "USD", "label": "USD", "value": 38407.23 }
        ]
      }
    ]
  },
  "history": {
    "label": "Out of balance",
    "points": [
      { "period": "2015-08-29", "value":      0.04 },
      ...
      { "period": "2016-08-27", "value":  13203.53 }
    ],
    "summary": {
      "twelveMonthHigh": -29245.59,
      "twelveMonthLow":      0.00,
      "avg":            -4205.91
    }
  },
  "flags": {
    "duplicateCosts": false,
    "staleData":      false
  }
}
```

### Key differences from current shape

| Concern | Current | V8 proposal |
|---|---|---|
| Variance components | Mixed scalars + `{value, alert}` objects | Uniform `[{ key, label, value, alert }]` array |
| Currency on values | Implied | Explicit `{ value, currency }` for top-level numbers |
| Account terminology | `objects` | `accounts` (less generic) |
| Filter echo | Full filter state in response | Filters in URL; response returns only their *available options* |
| Drill-down | One round-trip per level | First two levels inlined; deeper levels fetched on demand |
| Colors | Hex codes in payload | Client decides from `key` + theme |
| PO Receipts fields | Embedded in `calculation` block | Separate endpoint per module |
| `validation.color: "success"` | Bootstrap class names | Semantic: `"green" \| "yellow" \| "red"` |
| Empty-string IDs | `"id": ""` for "None" subsidiary | `"id": "_none"` or `null` |
| Typos | `selectedsObjects` | Fixed |

### Other V8 endpoint ideas

- `GET /api/v2/inventory/reconciliation/drill-down?level=2&from=GBP` &mdash; on-demand deeper drill levels.
- `GET /api/v2/inventory/reconciliation/audit-report?format=xlsx|pdf` &mdash; the Audit Report download.
- `POST /api/v2/inventory/reconciliation/journal-entry` &mdash; the Journal Entry export.
- `GET /api/v2/inventory/reconciliation/variance-drilldown?component=glBatches&period=2016-08-27` &mdash; per-component drilldown. Replaces the static-snapshot fetch the page does today.
- `GET /api/v2/system/status` &mdash; status indicator data, cached client-side.
- **SSE** on `/api/v2/system/status/stream` &mdash; replaces the 60s `poll` XHR long-poll.
- `GET /api/v2/periods?instance=RapidReconciler_Dev` &mdash; the period list, cached client-side via ETag.

### Open handoff items

- **Cross-period history bar chart &mdash; WIRED (2026-05-24).**
  Was an open item; now resolved. `POST
  /inventory/reconciliation/history` (specced in
  [`RapidReconciler-Agent/specs/reconciliation-history.md`](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-history.md))
  ships in the green-field test agent on port 34537. V8&rsquo;s
  Reconciliation page calls it via `loadPeriodBarsSnapshot` (now
  history-aware); the Transactions page uses
  `loadCrossPeriodReconRows` against
  `/inventory/reconciliation/rows` so it can aggregate the
  transactions-component sum per period (the history endpoint only
  exposes the GL/Perpetual/OOB sums). `data/reconciliation.json` is
  no longer the cross-period source in staging/prod mode.

---

## What hits the wire today vs. V8

For Inventory > Reconciliation page load:

| Stage | Today | V8 |
|---|---|---|
| Initial paint | 3 XHR (`available-periods`, `status`, `reconciliation-filtered`) | 1 XHR (consolidated reconciliation endpoint) |
| Period switch | 1 XHR | 1 XHR |
| Filter change | 1 XHR | 1 XHR (URL also updates) |
| Status refresh | 60s long-poll on `poll` | SSE stream |
| Drill-down click | 1 XHR per level | 0 XHR for first level, 1 XHR for deeper levels |
| Audit Report click | 1 XHR (Excel) or 1 XHR (PDF) | Same, dedicated endpoint |
