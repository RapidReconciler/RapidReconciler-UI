# RRV8 &mdash; API surface

Reference doc for the V8 backend redesign. Captures the **current** AngularJS-era
SPA's network surface (initially decoded from a staging HAR, 2026-05-20; updated
the same day with the full controller catalog mined directly from the per-DB
data-services jar) and proposes a cleaner shape for V8.

Not authoritative for the proposal section &mdash; that's a design pitch for
engineering to react to. The "Current network surface" and "Per-agent endpoints"
sections ARE authoritative: they reflect the controllers shipping in the agent
jar today.

---

## Auth + agent-routing model (decoded from staging HAR, 2026-05-20)

The SPA splits its calls across **two hosts**: a central VALC endpoint for
auth + customer routing, and a **per-customer RR Agent** for everything else.

### Login

```
POST https://staging-valcspa.cloudapp.net/resource/client/login
Content-Type: application/json;charset=UTF-8

{ "username": "user@example.com", "password": "...", "rememberme": false }
```

Production is presumably `https://rr-valc-spa.cloudapp.net` (per the
[RR Agent reference](../GSIRRTech/rr-agent-reference.html)'s VALC endpoint
listing). Success response:

```json
{ "token": "<RS256 JWT, ~1.2 kB>" }
```

Failure response is Spring Boot's default error shape, **NOT a 401**.
Bad creds return HTTP 500 with:

```json
{
  "timestamp": "2026-05-20T14:02:41.071+00:00",
  "status":    500,
  "error":     "Internal Server Error",
  "message":   "User invalid.",
  "path":      "/client/login"
}
```

(Confirmed against staging on 2026-05-20.) Clients distinguish bad
creds from real outages by parsing the `message` field, not the status
code &mdash; `"User invalid."` = wrong email/password; anything else
is a service issue.

The SPA stores the JWT in `localStorage.token` (see the AuthInterceptor
factory in `base.js`) and sends `Authorization: Bearer <jwt>` on every
subsequent call. VALC also sets an `XSRF-TOKEN` cookie on the login
response, but V8 ignores it (Bearer auth doesn&rsquo;t need it). Logout
is a localStorage drop.

**CORS**: VALC returns `Access-Control-Allow-Origin: *` on the login
endpoint, so cross-origin POST from `http://localhost:8765` works
without a proxy.

### JWT payload shape

```json
{
  "user": {
    "id": 82,
    "fn": "Ed Gutkowski",
    "c":  "RR Test Server",            // server/tenant label
    "u":  "user@example.com",
    "rm": 0,
    "rs": "",
    "wm": null
  },
  "dbs": [
    {
      "ip": "rrtest-rrsqltest.getgsi.com:34536",  // per-DB agent URL + port
      "k":  "029ab26e227570e9499a97fd8c81fc2cc1cab9c7", // 32-hex per-DB key
      "n":  "rrv7-acme",                          // DB name
      "i":  ["00010", "00050"],                   // companies user can see (Inventory)
      "p":  ["00010", "00050"],                   // companies (PO Receipts?)
      "t":  ["00010", "00050"],                   // companies (Transfers?)
      "a":   true,                                // app access
      "as":  true,                                // accounts manage
      "aite":true,                                // item edit
      "aprs":true,                                // PO Receipts
      "rs":  true,                                // reports
      "su":  false                                // super-user / admin
    },
    /* one entry per DB this user has access to */
  ],
  "iat": 1779268990385
}
```

### Per-agent endpoints

After login, every data call goes to `https://<dbs[i].ip>/...` &mdash; the
agent URL + port from the active DB's JWT entry. The SPA picks the
default DB (or whichever the user last selected via the DB switcher)
and sets that as the API base for the session.

### Full controller catalog (mined from the agent jar, 2026-05-20)

The complete HTTP surface is decoded directly from the per-DB
data-services jar at
`C:\Program Files\Rapid Reconciler\files\359` (the 47&nbsp;MB Spring
Boot fat jar that the `rr-valc-agent` Windows service spawns per
database; see [`reference_rr_agent_jar.md`](../../.claude/projects/C--source-repos-RapidReconciler-AI/memory/reference_rr_agent_jar.md)
for the javap recipe). Despite the misleading "rr-valc-agent" service
name, this file IS the data-services agent &mdash; the jar at
`C:\Program Files\Rapid Reconciler\rr-valc-agent.jar` is the VALC
central agent and has no HTTP controllers.

| Controller | Method | Path | Notes |
|---|---|---|---|
| PollController | GET | `/poll` | Long-poll heartbeat. Holds the connection open ~60s and returns `{updating, recalculating}` when either flag flips or on timeout. Only "is the job running NOW" signal V8 has. |
| PeriodController | GET | `/available-periods` | Period list + `defaultPeriod` + validation block. |
| StatusController | GET | `/inventory/status` | `{reconciliationFilter, validation}`. Validation block is the **Inventory Validation (roll-forward) light** &mdash; see "Two ValidationLight sources" below. |
| StatusController | GET | `/in-transit/status` | Same shape, In Transit module. |
| StatusController | GET | `/po-receipts/status` | Same shape, PO Receipts module. |
| StatusController | POST | `/system-status` | Generates the diagnostic Excel server-side (this is where `SELECT * FROM v_diagnostic5_job_status` actually runs). Returns `{fileName}` &mdash; download via `/download-excel/{id}`. NOT a polling endpoint. |
| ReconciliationController | POST | `/inventory/reconciliation` | Initial-load variant. |
| ReconciliationController | POST | `/inventory/reconciliation-filtered` | Filtered variant. Body must wrap each filter dimension as `[{id, checked, show}, ...]` (Jackson binds to a `coral.rapidreconciler.client.services.beans.Item` array; bare ID strings cause a 400). |
| ReconciliationController | POST | `/in-transit/reconciliation`, `/in-transit/reconciliation-filtered` | In Transit siblings. |
| ReconciliationController | POST | `/po-receipts/reconciliation`, `/po-receipts/reconciliation-filtered` | PO Receipts siblings. |
| TransactionsController | POST | `/inventory/transactions` | Body `{take, skip, page, pageSize, aggregate[], reconciliationFilter, groupingType, exclusions, cacheKey}`. `reconciliationFilter` uses **bare string arrays** here, NOT the `Item` shape. |
| TransactionsController | POST | `/inventory/transactions/details` | Body `{company, doc, type}`. **`type`, not `docType`** &mdash; see gotcha below. Returns the `usp6Compare2` rowset. |
| TransactionsController | POST | `/inventory/transactions/save-notes` | Body `{notes:[rows]}` &mdash; persists analyst notes. |
| TransactionsController | POST | `/in-transit/transactions`, `/in-transit/transactions/details`, `/in-transit/transactions/save-notes` | In Transit siblings. |
| IntegrityController | GET | `/inventory/integrity/available-reports` | Lists integrity reports by id + description (`v_integrity_jde_aais`, Model AAI Table, Frozen Cost Integrity, &hellip;). |
| IntegrityController | POST | `/inventory/integrity` | Body `{report:<view-id>, take/skip/page/pageSize, reconciliationFilter}`. Runs the named integrity view. |
| IntegrityController | GET / POST | `/in-transit/integrity/available-reports`, `/in-transit/integrity` | In Transit siblings. |
| DownloadController | GET | `/download-excel/{id}` | Downloads the file produced by an earlier `POST` (`/system-status`, audit export, etc.). |
| DownloadController | GET | `/download-pdf/{id}` | PDF sibling. |
| RollForwardController | GET | `/roll-forward/filters` | Available filters for the Roll Forward module. |
| RollForwardController | POST | `/roll-forward` | Run a roll-forward. |
| RunJobController | GET | `/run-ssis` | Triggers the SSIS refresh job. |
| OrdersController, AsOfController, LineAnalysisController, CommonUomController | &mdash; | various | Not yet wired by V8; mined but not exercised. |
| admin/AdminCompaniesController, AdminGeneralController, AdminInventoryOffsetsController, AdminUsersController | &mdash; | various | Admin module endpoints; out of scope for the analyst pages. |

CORS is wide open: `Access-Control-Allow-Origin: *`. Server header is
`Apache-Coyote/1.1` (the Spring Boot data-services child).
`X-Application-Context: application:production-https:<port>` confirms the
port matches the JWT's `dbs[i].ip` port.

### Implications for V8

1. **Two API bases, not one.** `RR_CONFIG.authBase` for login; the active DB's
   `ip` becomes the per-session data base. The DB switcher in V8's user
   menu IS the production behavior &mdash; it's selecting a different
   `dbs[i]` from the same JWT.
2. **Auth is dirt simple.** JWT in localStorage, Bearer header, no
   cookies, no SSO.
3. **The production `reconciliation-filtered` endpoint returns SUMMARY
   ONLY** &mdash; no `accountRows[]`. V8's row-level filtering (which is the
   page's value-add over the live SPA) requires either a new server
   endpoint that exposes the rows, or a server-side filter that walks
   the rows and aggregates per the V8 query. **This is real backend
   work, not a rewiring.**
4. **No JSON endpoint exposes `v_diagnostic5_job_status` directly.**
   The view's data is reachable only through `POST /system-status`,
   which generates the diagnostic Excel server-side. V8 fetches the
   Excel and runs it through `Tools/analysis-workbook.html`'s
   `SystemStatusTemplate` via the headless `rrv8-analyze` postMessage
   bridge &mdash; never re-implement that parsing inline.
5. **The other variance-component drilldowns** (audit detail,
   row-level breakdowns, etc.) need new server-side endpoints; none
   of the existing `/inventory/*` endpoints return row-level data
   today.

### Critical gotchas (decoded 2026-05-20)

These bit V8 and cost real debugging time. Pin them down so future
sessions don&rsquo;t repeat them.

**Jackson silently drops unknown JSON fields.** Spring's default
deserializer ignores any JSON key that doesn&rsquo;t bind to a setter
on the request DTO. The result: a misnamed field arrives as `null` at
the controller with **no error**, and the sproc / view runs with the
wrong parameter, producing a degraded but plausible-looking response.

The bug that caught us: `POST /inventory/transactions/details` takes a
`TransactionDetailsRequest { company, doc, type }`. V8 (and the
documentation snippets above the fix) sent `docType` &mdash; Jackson
dropped it, the agent called `usp6Compare2(company, doc, NULL)`, and
the sproc returned only the section-divider rows (17 rows total,
matching just the structural skeleton). With the correct field name
`type`, the same call returns **71 rows** including the F4111 / F0911
detail data. Always cross-check JSON field names against the
controller DTOs (`javap -p ...$Request.class` on the relevant
controller inner-class).

**Two separate `ValidationLight` sources.** The agent has two
repository methods that each return a `ValidationLight` bean with the
same shape but completely different semantics:

- `ValidationRepository.getValidationLight(filter, Tab)` &rarr; the
  **Inventory Validation (roll-forward) light**, period-scoped.
  Exposed via `GET /inventory/status` (the validation block in that
  response).
- `ServerStatusRepository.getServerStatus()` &rarr; the **SQL Agent
  job status** (derived from `v_diagnostic5_job_status`). Exists in
  Java but is **NOT exposed by any controller** &mdash; only reachable
  via `POST /system-status` which embeds the row inside the diagnostic
  Excel.

V8 spent a session wiring "System Status" to `/inventory/status`'s
validation block before realizing that&rsquo;s actually the Inventory
Validation data. The lights serve different purposes:

- **Inventory Validation** = period-scoped roll-forward check.
- **System Status** = global SQL Agent job health.

They cannot be combined and have distinct sources.

**`ValidationLight.Color` enum values are `none / danger / yellow /
success / unknown`.** NOT the Bootstrap `success / warning / danger`
that the JSON field name suggests. V8&rsquo;s `mapValidationToJob` maps
all five:

```
success  → "Successful"
yellow   → "In Progress"  (or trust `label` if it carries the
                           explicit enum, e.g. "In Progress",
                           "Not Found", "Failed", "Cancelled")
danger   → "Failed"
none     → unknown / amber
unknown  → unknown / amber
```

The `label` field, when set, carries the raw `JobStatus` enum text
&mdash; prefer it over color mapping.

### Diagnostic Excel pipeline (the only path to `v_diagnostic5_job_status`)

The legacy SPA's "click the System Status light to download a
diagnostic Excel" feature is the only way the SQL Agent step log +
`v_diagnostic5_job_status` row reach the client. The flow:

1. `POST /system-status` (empty body OK) → `{ fileName: "<uuid>_-_SystemStatus_<stamp>" }`.
   The agent runs `SELECT * FROM v_diagnostic5_job_status` and the
   `findDiagnosticLog` SQL inside this call, builds the Excel
   server-side, and writes it to
   `C:\Program Files\Rapid Reconciler\<fileName>`.
2. `GET /download-excel/{fileName}` → the `.xlsx` binary (ArrayBuffer).
3. Hand the buffer to the analyzer&rsquo;s `SystemStatusTemplate` via
   the `rrv8-analyze` postMessage bridge (V8 uses a hidden iframe so
   the analyzer runs headlessly).

The Excel layout the analyzer expects:

| Row | Content |
|---|---|
| 1 | Banner: `System Status Generated <timestamp>` |
| 2 | Header row: `Capture`, `Step`, `Process`, `StartTime`, `EndTime`, `Seconds`, `UpdateCount`, `ErrorNum` |
| 3+ | Step-log rows verbatim (newer rows on top from the agent; the analyzer re-sorts chronologically) |

Production mislabel preserved: when `Step` starts with "Data
Capture", the `Seconds` column actually holds MINUTES. The analyzer
normalizes this at parse time.

The `v_diagnostic5_job_status` row columns (`JobStatus / job_date /
minutes / avg / count`) are referenced inside the Excel but not as
a separate sheet &mdash; the SystemStatusTemplate diagnosis uses the
step log itself as the authoritative source. V8 mock at
`data/system-status-log.json` carries a synthetic `currentJob` object
with the camelCased shape (`{ jobStatus, jobDate, minutes,
avgMinutes, count }`); production reaches the same data through the
Excel.

### Agent jar mining recipe

Quick reference for future debugging when an endpoint&rsquo;s exact
shape is unclear (and the static V8 docs / HAR captures don&rsquo;t cover
the case). Saves an order of magnitude over probing endpoints.

```bash
JAR='C:\Program Files\Rapid Reconciler\files\359'
JAVAP='C:\Program Files\Eclipse Adoptium\jdk-25.0.2.10-hotspot\bin\javap.exe'
mkdir /tmp/dsvc && cd /tmp/dsvc
"/c/Windows/System32/tar.exe" -xf "$JAR"
find . -name "*Controller.class" | sort
# For each controller, list paths + methods:
"$JAVAP" -p -v ./coral/rapidreconciler/client/services/controller/PollController.class \
  | grep -E "Utf8 +/|RequestMapping|method[^a-z]"
# For request DTOs (when field-name discovery is needed):
"$JAVAP" -p ./coral/rapidreconciler/client/services/controller/TransactionsController\$TransactionDetailsRequest.class
```

Common controllers worth disassembling:

- `coral/rapidreconciler/client/services/controller/*.class`
  &mdash; the HTTP surface
- `coral/rapidreconciler/client/services/controller/*$*Request.class`
  &mdash; inner classes that define request body shapes (this is where
  the `type` vs `docType` discrepancy hides)
- `coral/rapidreconciler/client/services/beans/ValidationLight*.class`
  &mdash; response bean shapes
- `coral/rapidreconciler/client/services/repository/*.class`
  &mdash; what each endpoint actually runs at the SQL level

---

## Current network surface (Inventory > Reconciliation)

From a Network-tab capture of the live SPA. The page makes these XHR calls on
load:

| Endpoint | Purpose | Size | Notes |
|---|---|---|---|
| `available-periods` | List of close dates for the period dropdown | 899 B | Fires **4&ndash;5&times;** per load. Wasteful. |
| `status` | System Status indicator (color, popover, lag) | 1.1 kB | Fine. |
| `poll` | Heartbeat for the status indicator | 548 B | **XHR long-poll, 60s.** Holds a connection open. |
| `reconciliation-filtered` | The actual reconciliation data | 4.1 kB | The page's payload. |

Plus `collect?v=2&tid=G-LDXX33M9BZ` (Google Analytics 4) on every route change.

---

## Current `reconciliation-filtered` response shape

The page&rsquo;s primary payload. Real response from the Acme staging instance
(sanitized labels; same values as the rendered page).

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

### Issues with the current shape

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

## Proposed V8 shape

Single endpoint per page, normalized variance components, theme-agnostic
colors, filter state stays in the URL.

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
  "instance": "rrv7-acme",
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
      { "period": "2015-10-31", "value":    -47.64 },
      { "period": "2015-11-28", "value": -29245.59 },
      { "period": "2015-12-31", "value":      0.04 },
      { "period": "2016-01-30", "value":      0.04 },
      { "period": "2016-02-27", "value":   2310.07 },
      { "period": "2016-04-02", "value":   8424.22 },
      { "period": "2016-04-30", "value":   -101.16 },
      { "period": "2016-05-28", "value":      0.04 },
      { "period": "2016-07-02", "value":    -93.83 },
      { "period": "2016-07-30", "value": -18674.70 },
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
- `GET /api/v2/inventory/reconciliation/variance-drilldown?component=glBatches&period=2016-08-27` &mdash; per-component drilldown (per-batch rows for GL Batches from `v6_007_unpostedbatches`, per-account aggregate for components without a captured view yet). Replaces the static-snapshot fetch the page does today.
- `GET /api/v2/system/status` &mdash; status indicator data, cached client-side.
- **SSE** on `/api/v2/system/status/stream` &mdash; replaces the 60s `poll` XHR long-poll.
- `GET /api/v2/periods?instance=rrv7-acme` &mdash; the period list, cached client-side via ETag.

### Variance-component → source-view bindings

These bindings let the Preview pane / Excel export call the right
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

## Reference: what hits the wire today vs. V8

For Inventory > Reconciliation page load:

| Stage | Today | V8 |
|---|---|---|
| Initial paint | 3 XHR (`available-periods`, `status`, `reconciliation-filtered`) | 1 XHR (consolidated reconciliation endpoint) |
| Period switch | 1 XHR | 1 XHR |
| Filter change | 1 XHR | 1 XHR (URL also updates) |
| Status refresh | 60s long-poll on `poll` | SSE stream |
| Drill-down click | 1 XHR per level | 0 XHR for first level, 1 XHR for deeper levels |
| Audit Report click | 1 XHR (Excel) or 1 XHR (PDF) | Same, dedicated endpoint |
