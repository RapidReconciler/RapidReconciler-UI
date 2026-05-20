# V8 demo / prod mode &mdash; saved plan

Captured 2026-05-20.

**Status update (2026-05-20):** Chunks landed so far:
- **Chunk #1 — mode infrastructure + offline-vendoring** (PR #83).
- **Page-header v8 standard + Demo Mode pill polish + System
  Status live polling** (this PR). Adds the page-header
  convention (title = reference-guide link, prominent period
  pill, right-pinned audit buttons, no subtitle), centers the
  Demo Mode pill in the topbar, and wires the System Status
  light to `v_diagnostic5_job_status` with a 60s poller
  (`RR_CONFIG.statusPollMs`). The view's `JobStatus` column
  drives the dot color directly (Successful → green, In Progress
  → amber, Failed/Cancelled → red, Not Found → amber).

**Next pickup point:** chunk #2 below &mdash; prod-mode auth + JWT
plumbing (login POST, JWT in localStorage, parse `dbs[]` into
`window.RR_SESSION`, wire the user-menu DB switcher to it).

## Goal

V8 currently runs as a static-data mockup. We want it to support **two
modes** with the same codebase:

- **`demo`** &mdash; internal GSI sales / staff use. Offline-capable.
  One static dataset. Deployed to GitHub Pages
  (`https://rapidreconciler.github.io/RapidReconciler-AI/RRV8/`).
  Customers never see this.
- **`prod`** &mdash; real backend. Customers use this. Deployed to
  GSI's central host (today's prod SPA lives at `rr-spa.cloudapp.net`).
  Per-customer routing is handled server-side via VALC + the per-customer
  RR Agent (see [RRV8/API.md](../../RRV8/API.md) for the decoded auth + agent model).

A `staging` mode (third deploy target) exists too &mdash; same prod-mode
code, different `apiBase` / `authBase`. Treat as a `prod`-mode variant
with different URLs.

## Architecture (confirmed from the staging HAR, 2026-05-20)

V8 is **centrally deployed, not per-customer**. The RR Agent on the
customer's box bridges their DB to GSI's central VALC. SPA assets are
served once from GSI's central host. Customers reach the SPA at
`rapidreconciler.getgsi.com`; VALC routes their session to their agent
via the JWT they get on login.

This means `config.js` is **per-environment, not per-customer**:

| Mode | Deploy target | `authBase` | Data source |
|---|---|---|---|
| `demo` | `rapidreconciler.github.io/RapidReconciler-AI/RRV8/` | (none) | Static `RRV8/data/*.json` |
| `staging` | `staging-rr-spa.azurewebsites.net` | `https://staging-valcspa.cloudapp.net` | Per-DB agent from JWT |
| `prod` | `rr-spa.cloudapp.net` | `https://rr-valc-spa.cloudapp.net` | Per-DB agent from JWT |

Three deploys, three configs. RR Agent itself never touches V8's HTML/JS &mdash;
it's on the customer side.

## Switching method

A tiny `RRV8/config.js` that defines `window.RR_CONFIG`. Loaded via
`<script src="config.js"></script>` immediately before the page's IIFE so
`window.RR_CONFIG` is available at boot.

```js
// RRV8/config.js  -- committed = demo. Swapped at deploy time for staging/prod.
window.RR_CONFIG = {
  mode:       'demo',          // 'demo' | 'staging' | 'prod'
  authBase:   null,            // 'https://staging-valcspa.cloudapp.net' in staging, etc.
  dataPath:   'data/',         // for demo mode static files
  release:    'V8',
  buildStamp: '2026-05-20'
};
```

Precedence at boot:

```js
const MODE = (new URLSearchParams(location.search).get('mode'))
             || (window.RR_CONFIG && window.RR_CONFIG.mode)
             || 'demo';
const IS_DEMO = MODE === 'demo';
```

Why this shape:

- **One-file swap per deploy** &mdash; the committed `config.js` is the
  demo config; staging/prod deploys overwrite that single file with their
  config. No HTML edits, no rebuild.
- **Per-deploy override without code changes** &mdash; matches the
  ship-once central deployment model V8 already uses.
- **Query-string override for engineering** &mdash; `?mode=prod` etc. wins
  over the config file so engineers can flip modes on the same deploy.
- **One `IS_DEMO` constant downstream** &mdash; every mock-vs-real branch
  reads from it. `grep` finds them all.
- **No build step** &mdash; V8 ships as one HTML file today.

## Data abstraction

Replace the current `fetch('data/foo.json')` calls with one helper:

```js
function rrFetch(area, opts) {
  if (IS_DEMO) return fetch(RR_CONFIG.dataPath + area + '.json').then(r => r.json());
  // prod path: pick the active DB from the JWT, hit its agent URL
  const db   = activeDb();                    // selected from window.RR_SESSION.dbs[]
  const base = 'https://' + db.ip;
  const url  = base + '/' + area + (opts && opts.query ? '?' + new URLSearchParams(opts.query) : '');
  const init = {
    method:  opts && opts.method || 'GET',
    headers: prodHeaders(),
    body:    opts && opts.body ? JSON.stringify(opts.body) : undefined
  };
  return fetch(url, init).then(r => r.json());
}

function prodHeaders() {
  const token = localStorage.getItem('rrv8.token');
  return Object.assign(
    { 'Accept': 'application/json' },
    token ? { 'Authorization': 'Bearer ' + token } : {}
  );
}
```

The three current fetch sites all route through `rrFetch`:

- [`DATA_FILE`](../../RRV8/inventory-reconciliation.html) at line ~2992 (main reconciliation snapshot)
- [`ensureAuditDetail`](../../RRV8/inventory-reconciliation.html) at line ~4139 (audit-report-detail.json)
- [`ensureSystemStatusLog`](../../RRV8/inventory-reconciliation.html) at line ~5723 (system-status-log.json)

`PROD-TODO:` tags on each site point at the prod endpoint shape, so
`grep -rn "PROD-TODO" RRV8/` lists everything still on the demo side.

## Offline-vendoring (part of the demo chunk)

Demo mode must run without internet. Current external deps:

- Google Fonts: Open Sans, Source Sans 3, JetBrains Mono.
- CDN: `xlsx.full.min.js` (SheetJS), `jspdf.umd.min.js`, `jspdf.plugin.autotable.min.js`.
- GTM (Google Tag Manager) on the staging/prod SPA &mdash; **must be excluded** in demo mode.

Vendor everything into `RRV8/vendor/` (libraries) and `RRV8/fonts/` (font
files), swap the `<script src>` and `@import` references. Total static
weight goes up ~2-3 MB but the page works air-gapped.

Demo mode also drops the GTM beacon &mdash; no analytics on internal demos.

## Demo-mode JWT shim

In prod, the user menu's DB switcher is driven by the JWT's `dbs[]`
array. To make demo mode render the same user-menu DB switcher, ship
a static `data/demo-jwt-payload.json` that mimics the prod JWT shape
(user + dbs with synthetic Acme entries). Demo mode reads this in lieu
of a real login response. Same code path renders the user menu in both
modes.

## Chunk order

1. **Mode infrastructure + offline-vendoring** &mdash; **LANDED 2026-05-20.**
   - [x] `RRV8/config.js` + `MODE` + `IS_DEMO`.
   - [x] `rrFetch()` helper. Prod path throws a clear error until the
     auth chunk wires `RR_SESSION.dbs[]`; demo path uses static JSON.
   - [x] Every fetch site tagged with `// PROD-TODO:` and routed
     through `rrFetch` (3 sites: reconciliation, audit-detail,
     system-status-log).
   - [x] Vendored jsPDF (2.5.2) + jspdf-autotable (3.8.4) + SheetJS
     (0.20.3) into `RRV8/vendor/` (~1.3 MB). Google Fonts (Open Sans
     + Source Sans 3 + JetBrains Mono, latin subset only) into
     `RRV8/fonts/` (~450 KB). CDN references replaced with relative
     vendor / fonts paths.
   - [x] Demo banner hides itself in non-demo modes via
     `if (!IS_DEMO) ribbon.remove()` inside the IIFE.
   - [x] `data/demo-jwt-payload.json` shipped for the DB-switcher
     (consumed by the auth chunk).
   - V8 page has no GTM today, so that step was a no-op.
2. **Prod-mode auth + login plumbing.**
   - Implement the login POST to `authBase + /resource/client/login`.
   - Store JWT in `localStorage.rrv8.token`.
   - Parse JWT, expose `dbs[]` via `window.RR_SESSION`.
   - Wire the user-menu DB switcher to pick `dbs[i]` and set the active
     `apiBase`.
3. **Prod-mode reconciliation wiring (first endpoint).**
   - Replace the demo-path stub for `reconciliation-filtered` with a
     POST against the active agent. Body = V8's filter state, response
     mapped to V8's expected shape.
   - **Likely blocker: production endpoint returns summary only, no
     `accountRows[]`.** V8 needs a new server endpoint that exposes
     rows, or extends `reconciliation-filtered` with an opt-in `rows`
     section. Engineering conversation needed before this chunk.
4. **Prod-mode remaining endpoints.** `/poll`, `/available-periods`,
   `/inventory/status`, then drilldowns / audit / system-status step log
   (each requires its own backend endpoint).

## Open questions / where to push back

- **Production endpoint for row-level data.** V8's row filtering and
  per-account aggregations are the page's main improvement. The current
  production API doesn't expose rows. Two paths:
  - **Extend the existing `reconciliation-filtered` endpoint** with an
    opt-in `rows: true` parameter that returns the per-account rows.
  - **New endpoint** `GET /inventory/reconciliation-rows?period=...` that
    returns the rows separately, called by V8 in parallel with the
    summary endpoint.
  Engineering needs to weigh both.
- **Variance-component drilldowns.** V8 already binds these to specific
  SQL views (per [RRV8/API.md](../../RRV8/API.md)). Production needs an
  endpoint that returns rows from each view, filtered by period +
  selected companies.
- **Audit-report detail.** Today V8 has it as a 7.4 MB JSON. Production
  needs a `GET /inventory/audit-detail?period=...` that streams the same
  rows.
- **System status step log.** V8 reads `system-status-log.json` (mock).
  Production needs a `GET /system/agent-log` (or similar) that returns
  the agent's SQL Agent step log. Probably read from `msdb.sysjobsteps`
  server-side, or a wrapper that the agent already exposes.

## Files this plan touches when it lands

- New: `RRV8/config.js` (committed = demo)
- New: `RRV8/vendor/` (vendored CDN libraries)
- New: `RRV8/fonts/` (self-hosted Google Fonts)
- New: `RRV8/data/demo-jwt-payload.json`
- Modified: `RRV8/inventory-reconciliation.html` (MODE / IS_DEMO / rrFetch /
  conditional demo banner / GTM-clean / asset paths)
- Modified: `RRV8/HANDOFF.md` and `RRV8/WORKFLOW.md` (mode infrastructure section)
- Modified: `RRV8/API.md` (auth + agent-routing section &mdash; already done)

## What the next session should do first

1. Read this plan.
2. Read [RRV8/API.md](../../RRV8/API.md) auth + agent-routing section.
3. Read [GSIRRTech/rr-agent-reference.html](../../GSIRRTech/rr-agent-reference.html)
   if anything about the agent is unclear &mdash; it's the canonical KB doc.
4. Start with chunk #1 (mode infrastructure + offline-vendoring).
5. **Don't ask the owner architecture questions until the in-repo KB has
   been searched** &mdash; the `feedback_research_kb_first` memory rule
   applies.
