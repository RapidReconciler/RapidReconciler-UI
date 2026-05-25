/*
 * RRV8 — runtime configuration
 *
 * The COMMITTED version of this file is the DEV config: mode = 'staging'
 * so the dev workflow exercises the live RR data-services agent. This is
 * the V8 agent-first tenet (see feedback_v8_agent_first.md in memory):
 * snapshots exist as a deployment artifact, not as the dev mode. To
 * intentionally read from snapshots (e.g. when the agent is offline or
 * for an external reader on GitHub Pages), append `?mode=demo` to the
 * URL. Customer-facing prod deploys overwrite this file at publish time
 * with their own `window.RR_CONFIG` block — the HTML stays byte-identical
 * between environments.
 *
 * Precedence at boot:
 *   1. ?mode= URL parameter wins (engineer / QA override)
 *   2. window.RR_CONFIG.mode below
 *   3. 'demo' fallback
 *
 * Field reference:
 *   mode          — 'demo' | 'staging' | 'prod'. Drives every IS_DEMO
 *                   branch in the page.
 *   authBase      — VALC login endpoint root. Null = use the per-mode
 *                   default from RR_AUTH_BASES at boot:
 *                     staging → https://staging-valcspa.cloudapp.net
 *                     prod    → https://rr-valc-spa.cloudapp.net
 *                   Set explicitly here to override (e.g. a local
 *                   mock VALC for offline testing).
 *   dataPath      — only used in demo mode. Where to fetch the static
 *                   JSON snapshots from. Relative to the HTML.
 *   statusPollMs  — interval for re-checking the SQL Agent job status
 *                   (System Status light). null = don't poll. Prod
 *                   default: 60000 (1 minute).
 *   testAgentBase — base URL of the green-field per-DB data-services
 *                   test agent (RapidReconciler-Agent). The four
 *                   endpoints it owns (inventory/reconciliation/rows,
 *                   inventory/reconciliation/history,
 *                   inventory/audit-detail,
 *                   inventory/variance-component) are routed here in
 *                   staging/prod mode while v359 keeps the rest at
 *                   activeDb.ip. Set to null on a customer install
 *                   that doesn't run the test agent yet.
 *   release       — version label shown in the user menu.
 *   buildStamp    — date the deploy was cut; surfaces in diagnostics.
 *
 * See docs/plans/v8-demo-prod-mode.md for the full design rationale.
 */
window.RR_CONFIG = {
  mode:          'staging',
  authBase:      null,
  dataPath:      'data/',
  statusPollMs:  60000,
  testAgentBase: 'http://localhost:34537',
  valcBase:      'http://localhost:8080',
  release:       'V8',
  buildStamp:    '2026-05-24'
};

// Endpoint prefixes that route to mini-VALC (the dev-side stand-in
// for production VALC's central Postgres + Admin surface). The
// per-DB data-services agent owns customer-specific data
// (rcompanies, rtransactions, ritems, ...); mini-VALC owns the
// cross-DB stuff (users, licensed-companies registry, deploys).
// Areas starting with any of these prefixes go to RR_CONFIG.valcBase
// instead of the test agent or the active DB IP.
window.RR_VALC_PREFIXES = [
  'api/v1/admin/'    // /api/v1/admin/users, /api/v1/admin/clients, ...
];

// Areas served by the green-field test agent instead of v359. The set
// is duplicated in each page's rrFetch (no shared script). Update both
// when adding an endpoint.
//
// The migration plan retires v359 endpoint-by-endpoint into the test
// agent. As each test-agent controller ships, its area moves here so
// V8 routes to it. See `RRV8/HANDOFF.md` § Test agent online for the
// current migration state; `feedback_v8_test_agent_default` in memory
// for the routing rule.
window.RR_TEST_AGENT_AREAS = [
  // Inventory module — net-new endpoints first wave
  'inventory/reconciliation/rows',
  'inventory/reconciliation/history',
  'inventory/reconciliation/by-company',
  'inventory/audit-detail',
  'inventory/variance-component',
  // DMAAI overlay (analyzer worklist persistence)
  'inventory/integrity/aai-analysis-latest',
  'inventory/integrity/aai-responses',
  'inventory/integrity/aai-save-responses',
  // v359 migration — endpoints absorbed by the test agent in order:
  //   inventory/status                          2026-05-24  (boot-time filter universe + validation light)
  //   inventory/reconciliation-filtered         2026-05-24  (Recon summary + barChart)
  //   inventory/transactions                    2026-05-24  (bulk Transactions grid fetch)
  //   inventory/transactions/details            2026-05-24  (per-doc usp6compare2 breakdown)
  //   inventory/transactions/save-notes         2026-05-24  (worknotes upsert)
  //   inventory/integrity                       2026-05-24  (DMAAIs preload + Cardex Variance grid)
  //   inventory/as-of                           2026-05-24  (As Of bulk grid)
  //   inventory/as-of/details                   2026-05-24  (As Of Details popover)
  //   inventory/rollIItem                       2026-05-24  (Cardex Variance Re-roll button)
  //   poll                                      2026-05-24  (System Status 60s poll)
  //   system-status                             2026-05-24  (diagnostic Excel generator)
  //   download-excel/*                          2026-05-24  (diagnostic Excel binary)
  //   available-periods                         2026-05-24  (closed-period list — FINAL v359 migration)
  'inventory/status',
  'inventory/reconciliation-filtered',
  'inventory/transactions',
  'inventory/transactions/details',
  'inventory/transactions/save-notes',
  'inventory/integrity',
  'inventory/as-of',
  'inventory/as-of/details',
  'inventory/rollIItem',
  'poll',
  'system-status',
  'available-periods',
  // Administrator
  'admin/companies'
];

// Endpoints with a variable path segment that rrFetch needs to route
// to the test agent. Tested with `area.startsWith(prefix)`.
window.RR_TEST_AGENT_PREFIXES = [
  'download-excel/',
  'admin/companies/'    // per-company edit (PUT /admin/companies/{n})
];

// Per-mode VALC defaults. Used when RR_CONFIG.authBase is null and
// the resolved MODE is staging or prod. Engineering overrides
// authBase in their customer-specific config.js at deploy time.
window.RR_AUTH_BASES = {
  staging: 'https://staging-valcspa.cloudapp.net',
  prod:    'https://rr-valc-spa.cloudapp.net'
};
