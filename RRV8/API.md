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
| `POST /inventory/reconciliation/rows` | Item-wrapped filter arrays | Reconciliation | **Planned.** V8 already wires the parallel `rrFetch` call and degrades cleanly on 404. Spec: [reconciliation-rows.md](https://github.com/RapidReconciler/RapidReconciler-Agent/blob/main/specs/reconciliation-rows.md). |
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
