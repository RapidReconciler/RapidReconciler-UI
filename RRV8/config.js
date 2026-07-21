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
  // authBase: where V8's login modal POSTs credentials (rrLogin in
  // each page's IIFE → ${authBase}/resource/client/login). Point at
  // local VALC 2.0 so JWTs come from our Postgres, not the legacy
  // staging-valcspa.cloudapp.net (which mints tokens scoped to real
  // customer tenants with external host IPs in dbs[i].ip). When null,
  // RR_AUTH_BASES[mode] is the fallback -- that's how the page used
  // to behave on this dev box.
  authBase:      'http://localhost:8080',
  dataPath:      'data/',
  statusPollMs:  60000,
  testAgentBase: 'http://localhost:34537',
  valcBase:      'http://localhost:8080',
  release:       'V8',
  buildStamp:    '2026-05-30',
  // statusAnchor — GSI's always-up public edge, used by the
  // Connection Check fault-isolator (HelpDesk/connection-check.html)
  // as the "is the internet + GSI reachable" baseline probe. Per the
  // install-prep doc this is the documented host customer IT uses to
  // verify outbound 443. Override per deploy if the public landing
  // host changes.
  statusAnchor:  'https://rapidreconciler.getgsi.com'
};

// Endpoint prefixes that route to mini-VALC (the dev-side stand-in
// for production VALC's central Postgres + Admin surface). The
// per-DB data-services agent owns customer-specific data
// (rcompanies, rtransactions, ritems, ...); mini-VALC owns the
// cross-DB stuff (users, licensed-companies registry, deploys).
// Areas starting with any of these prefixes go to RR_CONFIG.valcBase
// instead of the test agent or the active DB IP.
window.RR_VALC_PREFIXES = [
  'api/v1/admin/',   // /api/v1/admin/users, /api/v1/admin/clients, ...
  'api/v1/ai/'       // AI Assistant gateway — key stays server-side in VALC
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
  // Period-end journal-entry source: account-level reconciling lines
  'inventory/suggested-je',
  'inventory/audit-detail',
  'inventory/variance-component',
  // DMAAI overlay (analyzer worklist persistence)
  'inventory/integrity/aai-analysis-latest',
  'inventory/integrity/aai-responses',
  'inventory/integrity/aai-save-responses',
  // DMAAI account resolver — per-account 4152-model vs 4240-GL pivot + mismatch
  // flags for the analyst Transaction-Variance analyzer + Home txv card diagnosis.
  // Read the same view at two depths (compact card line + full details analyzer).
  'inventory/integrity/dmaai-resolve',
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
  // V8 cardex corrective action (CardexCorrectionController) — supersedes rollIItem
  'inventory/cardex-worklist',
  'inventory/adjustment-ledger',
  'inventory/set-beginning-balance',
  'inventory/undo-adjustment',
  'inventory/cardex-work-status',
  // Reload GL — self-service GL maintenance (ReloadGlController, admin-gated)
  'inventory/reload-gl',
  'inventory/reload-gl/preview',
  // Reload Cardex — self-service cardex maintenance (ReloadCardexController,
  // admin-gated): end-of-day check (suggested reload date), per-date preview,
  // and execute. These were MISSING from the route table, so the page fetched
  // them against the JWT's db.ip without :34537 and silently failed (blank
  // banner, no preview count).
  'inventory/reload-cardex',
  'inventory/reload-cardex/preview',
  'inventory/reload-cardex/eod-check',
  // Fiscal Period-End correction (FiscalPeriodEndController, admin-gated):
  // detect the stale date, preview the per-table row counts a date-swap
  // would move, then apply.
  'inventory/fiscal-period-end-detect',
  'inventory/fiscal-period-end-preview',
  'inventory/fiscal-period-end-apply',
  'poll',
  'system-status',
  'available-periods',
  // Admin actions
  'jobs/refresh/start',
  // Diagnostics endpoints that don't exist on the new agent yet but
  // are routed here anyway so V8 hits the local agent (404 cleanly)
  // instead of the JWT's activeDb.ip (an external GSI host the dev
  // box can't reach over HTTPS). V8's fall-through path at
  // rrFetch hardcodes https:// + db.ip, which dies against
  // localhost:34537 (HTTP-only). Until those endpoints land or V8's
  // fall-through gets scheme-aware, parking them in the test-agent
  // table is the cleanest way to keep diagnostic noise localised.
  'system-status-log',
  'system/agent-log',
  // Administrator
  'admin/companies',
  // Proactive memory-pressure read behind Home's Service-health card
  'admin/service-health',
  // Recent system events — the Activity Log page + Home's mini activity feed
  'admin/activity',
  // Data Refresh Schedule — read-only review card in Home's Administrator
  // area (initial load + nightly refresh times). GSI manages the schedule;
  // the customer admin reviews it only.
  'admin/refresh-schedule',
  // Model DMAAI Review — sign-off read + the enriched model baseline
  'inventory/integrity/model-approval',
  'inventory/integrity/model-baseline',
  // Data purge — current cutoff/size/dates + set-cutoff write + audit history
  'inventory/integrity/purge-info',
  'inventory/integrity/purge-cutoff',
  'inventory/integrity/purge-log',
  // Home awareness pills — role-agnostic cross-section status roll-up
  // (readable by any authenticated role; actions stay gated). See API.md.
  'home/status-summary',
  // Per-company cardex materiality tolerance (GET any role; PUT analyst-gated).
  'inventory/cardex-tolerance'
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

/*
 * RRDB — the ONE canonical active-database resolver. Every page MUST resolve
 * "which DB am I scoped to / which agent do I call" through here. Do NOT
 * hand-roll it per page — that drift is what caused the recurring cross-DB
 * scoping bugs (pages variously read a hardcoded 0, a `activeDbIndex` field
 * that the JWT does NOT carry, or preferred the single dev test agent).
 *
 * THE RULE: the active DB is the sticky `rrv8.activeDb` selection (set by
 * RRV8.setActiveDatabase / RRDB.setActive on a DB switch), resolved BY NAME
 * against the token's dbs[]. The JWT has no activeDbIndex — never read one.
 *
 * Self-sufficient: uses a hydrated window.RR_SESSION when present (sidebar.js /
 * page boot), else decodes localStorage.rrv8.token directly — so the
 * self-contained analyst pages (no sidebar.js) get the SAME answer.
 *
 * Usage in a page's fetch:
 *   const base = window.RRDB.agentBase();   // active DB's agent (per-DB ip → testAgentBase)
 *   const db   = window.RRDB.active();       // {n, ip, i, m, t, perms, rn, ...}
 */
window.RRDB = (function () {
  function _session() {
    try { var s = window.RR_SESSION; if (s && Array.isArray(s.dbs) && s.dbs.length) return s; } catch (_) {}
    return null;
  }
  function _decodeToken() {
    try {
      var t = localStorage.getItem('rrv8.token'); if (!t) return null;
      var b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4; if (pad) b64 += '='.repeat(4 - pad);
      return JSON.parse(decodeURIComponent(atob(b64).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (_) { return null; }
  }
  function dbs() {
    var s = _session(); if (s) return s.dbs;
    var p = _decodeToken(); return (p && Array.isArray(p.dbs)) ? p.dbs : [];
  }
  function index() {
    var list = dbs(), saved = null;
    try { saved = localStorage.getItem('rrv8.activeDb'); } catch (_) {}
    if (saved) for (var i = 0; i < list.length; i++) if (list[i] && list[i].n === saved) return i;
    return 0;
  }
  function active() { var list = dbs(); return list[index()] || list[0] || {}; }
  function name() { return active().n || '_'; }
  function agentBase() {
    var d = active();
    if (d && d.ip) return (/^(?:localhost|127\.0\.0\.1)\b/i.test(d.ip) ? 'http://' : 'https://') + d.ip;
    return (window.RR_CONFIG && window.RR_CONFIG.testAgentBase) || 'http://localhost:34537';
  }
  function setActive(n) {
    if (!n) return;
    try { localStorage.setItem('rrv8.activeDb', n); } catch (_) {}
    var s = _session();
    if (s) for (var i = 0; i < s.dbs.length; i++) if (s.dbs[i] && s.dbs[i].n === n) { s.activeDbIndex = i; break; }
  }
  return { dbs: dbs, index: index, active: active, name: name, agentBase: agentBase, setActive: setActive };
})();

/*
 * RRAI — the ONE global AI-plan-tier setting, shared across every page that
 * loads config.js. This is the DEMO plan switcher: it lets a presenter flip the
 * level of AI integration live and re-run the SAME question to show how the
 * result changes per purchased tier. Four tiers, escalating by how much / how
 * identifiable the data sent to the model is:
 *
 *   off      — AI disabled. No data leaves the page; the surface shows only the
 *              deterministic figures (visible-but-disabled / upsell state).
 *   grounded — shown as "Basic". The model sees ONLY the on-screen deterministic
 *              figures already computed (no history/tracing, minimal data).
 *              ("Docs-grounded" in the server's ai/health vocabulary — normalized here.)
 *   scrubbed — shown as "Enhanced". Fuller underlying data, but customer-identifying
 *              fields are masked before the call (e.g. "Co 90001" → "Entity A").
 *   full     — full real data with identifiers + full generative latitude.
 *
 * Persisted to localStorage.rrv8.aiTier (one global key, not per-DB, so the
 * demo setting is consistent everywhere). setTier fires a 'rrv8:aitierchange'
 * window event so any open surface can re-run its AI read against the new tier.
 * Each AI-using page reads RRAI.get() when building its prompt and applies the
 * matching transform (see home.html _recsummaryLevel / renderAiBriefing).
 */
window.RRAI = (function () {
  var TIERS  = ['off', 'grounded', 'scrubbed', 'full'];
  // Display labels are plain-language tiers (Off / Basic / Enhanced / Full) — the
  // old "Grounded" / "Scrubbed" read as jargon and invited questions. Internal keys
  // ('grounded' / 'scrubbed') stay unchanged so logic + saved prefs keep working.
  var LABELS = { off: 'Off', grounded: 'Basic', scrubbed: 'Enhanced', full: 'Full' };
  var BLURB  = {
    off:      'AI turned off — deterministic figures only, no data leaves the page',
    grounded: 'AI sees only the on-screen figures',
    scrubbed: 'AI sees fuller data with identities masked',
    full:     'AI sees full data with identities'
  };
  // Normalize any input (incl. the server's ai/health 'docs' level) to a tier key.
  function norm(t) {
    t = String(t == null ? '' : t).toLowerCase();
    if (t === 'docs') t = 'grounded';   // ai/health maxLevel vocabulary → our key
    return TIERS.indexOf(t) >= 0 ? t : null;
  }
  function get() {
    try { return norm(localStorage.getItem('rrv8.aiTier')) || 'full'; } catch (_) { return 'full'; }
  }
  function setTier(t) {
    t = norm(t); if (!t) return;
    try { localStorage.setItem('rrv8.aiTier', t); } catch (_) {}
    try { window.dispatchEvent(new CustomEvent('rrv8:aitierchange', { detail: { tier: t } })); } catch (_) {}
    return t;
  }
  return {
    TIERS: TIERS, LABELS: LABELS, BLURB: BLURB,
    norm: norm, get: get, set: setTier, label: function (t) { return LABELS[norm(t) || 'full']; }
  };
})();

/*
 * RRV8 shared helpers (config-level, so every page that loads config.js gets them
 * regardless of sidebar.js load order — sidebar.js also does `RRV8 = RRV8 || {}`).
 *
 *  - exportName(): the ONE download-filename convention. Any .xlsx / .pdf export
 *    routes through this so a downloaded file is self-describing out of context:
 *      RR_<Surface>_<DB>_<Scope>_<Period>_<YYYYMMDD-HHmm>.<ext>
 *    (illegal filesystem chars stripped, spaces → hyphens). company:number → CoNN,
 *    company 'all'/null → AllCos; drill appended with '-'; period + tokens omitted
 *    when not supplied. DB is the active database name.
 *
 *  - logActivity(): one-way, best-effort append to the server Activity Log
 *    (POST /admin/activity on the active DB's Services jar — an audit trail read by
 *    the Activity Log page + the Home mini-feed). Self-contained (own fetch + JWT)
 *    so it doesn't depend on a page's local rrFetch. Never throws / never blocks the
 *    UI — a logging failure must not break the action it records. Call it AFTER the
 *    primary action succeeds.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  function clean(s) {
    return String(s == null ? '' : s).trim()
      .replace(/[\\/:*?"<>|]+/g, '')   // filesystem-illegal
      .replace(/\s+/g, '-');           // no spaces in filenames
  }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  window.RRV8.exportName = function (opts) {
    opts = opts || {};
    var parts = ['RR'];
    if (opts.surface) parts.push(clean(opts.surface));
    var db = '';
    try { db = (window.RRDB && RRDB.name && RRDB.name()) || ''; } catch (_) {}
    if (db && db !== '_') parts.push(clean(db));
    var scope = [];
    if (opts.company != null && String(opts.company).trim() !== '') {
      var c = String(opts.company).trim();
      scope.push(c.toLowerCase() === 'all' ? 'AllCos' : ('Co' + clean(c)));
    } else if (opts.scope) {
      scope.push(clean(opts.scope));
    }
    if (opts.drill) scope.push(clean(opts.drill));
    if (scope.length) parts.push(scope.join('-'));
    if (opts.period) parts.push(clean(opts.period));
    parts.push(stamp());
    var ext = (clean(opts.ext) || 'xlsx').replace(/^\.+/, '');
    return parts.join('_') + '.' + ext;
  };
  window.RRV8.logActivity = function (event, detail) {
    try {
      var base = (window.RRDB && RRDB.agentBase && RRDB.agentBase())
        || (window.RR_CONFIG && RR_CONFIG.testAgentBase);
      if (!base) return Promise.resolve();
      var h = { 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' };
      try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {}
      return fetch(base + '/admin/activity', {
        method: 'POST', headers: h,
        body: JSON.stringify({ event: String(event == null ? '' : event), detail: String(detail == null ? '' : detail) })
      }).then(function () {}).catch(function () {});   // one-way audit append; swallow all errors
    } catch (_) { return Promise.resolve(); }
  };
  // collapseActivity(): fold a run of CONSECUTIVE identical events (same label +
  // same actor) into one row carrying a _count (and _oldestAt) — so a burst of
  // "Report engine started" (a rebuild bounce logs one per boot) shows as a single
  // "×N" line and the meaningful events stay visible. Shared by the Home card
  // mini-feed and the full Activity Log so the two agree. Input expected newest-first.
  window.RRV8.collapseActivity = function (list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i], prev = out[out.length - 1];
      if (prev && String(prev.event == null ? '' : prev.event) === String(e.event == null ? '' : e.event)
               && String(prev.by == null ? '' : prev.by) === String(e.by == null ? '' : e.by)) {
        prev._count = (prev._count || 1) + 1;
        prev._oldestAt = e.at;   // newest-first → each subsequent row is older
        continue;
      }
      var copy = {}; for (var k in e) if (Object.prototype.hasOwnProperty.call(e, k)) copy[k] = e[k];
      copy._count = 1; copy._oldestAt = e.at;
      out.push(copy);
    }
    return out;
  };
  // <<AI-GROUNDING GENERATED START -- do not edit by hand>>
  // ACCT_GROUNDING — the AI's compact copy of the accountant playbook. Prepended to
  // every accountant-facing AI prompt so the reads reason from firm policy, not
  // generic LLM accounting. SOURCE OF TRUTH = docs/plans/accounting-reference.md;
  // keep this in sync with it (same discipline as dmaai-reference.md ↔
  // AiService.DMAAI_GROUNDING). Owner (accounting SME) curates the policy values.
  window.RRV8.ACCT_GROUNDING = [
    'ACCOUNTING POLICY (reconciliation) — reason from these rules:',
    '- RR reconciles inventory to GL; JDE is the book of record. You surface the gap, explain it, and produce the correcting entry the accountant posts in JDE. RR does not post, hold the ledger, or run schedules.',
    '- Materiality: an out-of-balance under $100 is immaterial regardless of %; a GL balance under $1,000 is dormant/near-zero — frame by absolute amount and suppress the %. Otherwise judge by the gap as a share of the GL balance (well under ~1% is immaterial).',
    '- The out-of-balance decomposes into components. ACCOUNTANT-OWNED (journal these): carry forward, transactions, manual entries. NOT the accountant\'s: unposted GL batches + end-of-day (operations timing — self-clears when operations posts, never journal it) and cardex (self-heals on the analyst\'s roll-forward refresh, not a JE). The adjusting entry uses ONLY the accountant-owned amount; never journal the timing.',
    '- Reclass vs JE: a transaction in the wrong period/account is a reclass, not a new balancing JE. A roll-forward break (red dot) resolves on the analyst side at the next refresh, not the accountant\'s and not a JE.',
    '- Large carry-forward: when a company\'s carry-forward exceeds 25% of its GL balance OR $50,000 (whichever first), advise absorbing it over ~6 periods (per-period = carry-forward / 6) rather than booking it all at once, to avoid a lumpy P&L hit. Advise ONLY — do not build the fractional entry; the amortization schedule lives in JDE, not RR.',
    '- Adjusting entry: one real offset account per inventory account (no generic clearing account); excludes timing; two lines per gap (original account + its offset).',
    '- Closed/prior periods are already journaled — never prescribe an entry for them; a carry-forward\'s source is the prior period.',
    '- Audience is JDE-fluent finance, not IT: plain accountant English; JDE artifacts (F4111, F0911, AAI) are fine, no plumbing terms.'
  ].join('\n');
  // ANALYST_GROUNDING — the AI's compact copy of the transaction-variance playbook.
  // Prepended to the analyst-facing AI prompts (the Transaction-Variance recurrence /
  // "Investigate recurrence" note) so the reads reason per-document instead of
  // hallucinating an in-transit / stranded-leg cause. SOURCE OF TRUTH =
  // AnalysisGuides/transaction-detail-analysis.md; keep this in sync with it.
  // Owner (analyst SME) curates the rules.
  window.RRV8.ANALYST_GROUNDING = [
    'ANALYST POLICY (transaction variance) — reason from these rules:',
    '- A transaction variance reconciles ONE document: F4111 (item ledger / cardex) extended value vs F0911 (GL / ledger) for the SAME document and account. Variance = cardex − ledger for that document. Explain each document on its own terms.',
    '- Check DUPLICATE SALES FIRST — rare, but cheap and definitive, so screen for it before any cost / mapping / timing reasoning. When a line is written to the cardex (F4111 / RTransactions) twice, the cardex is overstated by that line while the GL has it once, so the variance EQUALS the duplicated line. dbo.RDuplicateSales flags it. If the facts carry a duplicate-sales flag, LEAD with it — the fix is at the source (reverse the double relief), never a journal entry.',
    '- A transfer ships and receives as TWO INDEPENDENT transactions; each reconciles on its own document. Never explain one leg\'s variance by whether or when the other leg posted.',
    '- In-transit reconciliation (ST↔OT pairing, the 4220 / 4245 in-transit clearing account, the transfer-order Orders page) is a SEPARATE surface. Do NOT invoke a stranded-leg / in-transit / clearing model to explain a per-document cardex-vs-ledger variance — that conflation is wrong.',
    '- A GL-ONLY row (cardex 0, ledger ≠ 0) is most often a NON-STOCK / surcharge line: the order line type (F4211 / F42119 SDLNTY) is "N", so it posts to the GL but moves no inventory (no F4111 row) — expected behavior, not a variance to chase. Check the order line type before flagging a GL-only row; a non-stock surcharge needs no correction. Do NOT call it a stranded leg or escalate it.',
    '- An A/P VOUCHER (batch type V) posted to an inventory account is a ROUTING error, not a real inventory variance: DMAAI 4220 is sending voucher variances to the inventory account instead of the A/P variance account. Screen for batch type V on an inventory account; if present, the fix is at the SOURCE — correct the 4220 routing so voucher variances land on the variance account — never a journal entry.',
    '- MAKE TO ORDER is a business grouping (a work order linked to its customer sales order), not a variance type. Its residual is ordinary manufacturing cardex-vs-GL and is NOT a DMAAI mapping issue (the routings match the 4152 model) and NOT a missing sales offset (the SOs shipped, status 999). Split it by shape: GL-only rows (cardex 0, ledger ≠ 0) are standard-cost variances — EXPECTED, no action; both-sides-differ rows are the completion valued at standard on the cardex vs actual in the GL — investigate the large ones (5.16); cardex-only rows (ledger 0, cardex ≠ 0) are completions posted to the cardex but never journaled to the GL — a real posting gap, repost via R31802A at the source, never a journal entry (5.19 Completion Not Journaled, held under this subtype because usp6_008 stamped it first).',
    '- MANUFACTURING GL-CLASS SOURCE: work-order material issues and completions (R31802A) take their GL class from the item BRANCH record (F4102); every OTHER F4111 transaction (adjustments, transfers, PO receipts) uses the item LOCATION record (F41021). RR assigns accounts off F41021, so when the F4102 and F41021 GL classes DIFFER, a manufacturing move (IM / IC / IH) posts to a different account than other movements of the same item — a structural account mismatch that recurs on every work order; fix at the source (align the F4102 / F41021 GL class), never a JE. A blank F41021 GL class is not special — it resolves through the DMAAI like any class: a specific entry, or the `****` wildcard/default row that covers any class not explicitly set up (blank included). It posts normally when that coverage exists, and only fails to resolve when the DMAAI has neither a specific entry nor a `****` default — the same condition as any GL class.',
    '- Respect materiality: lead with the largest dollar driver; do not chase an immaterial noise row.',
    '- The analyst does NOT care about journal entries. Analyst work is SOURCE work: check what needs checking to PREVENT RECURRENCE (the double-write, the AAI / DMAAI mapping, the routing, the period), fix it at the source, and hand the FINDING to accounting via the Audit Center. Whether a residual is cleared in the GL with an entry is for the accountant, not the analyst — never frame an analyst action as posting or needing a JE.',
    '- Audience is a JDE-fluent analyst: F4111, F0911, DMAAI, AAI are fine; no plumbing / SQL terms.'
  ].join('\n');
  // CARDEX_GROUNDING — the AI's compact copy of the cardex-variance playbook.
  // Prepended to the Cardex Variance page's Root-cause read. The model's job is to
  // FRAME THE JDE VALIDATION, not to auto-diagnose the cause — the analyst's manual
  // JDE check decides the remedy, and RR cannot see live JDE (a trust boundary).
  // SOURCE OF TRUTH = the analyst's JDE validation workflow (P4111 export + sum vs
  // F41021 header); keep this in sync as the model evolves. Owner (analyst SME)
  // curates the rules.
  window.RRV8.CARDEX_GROUNDING = [
    'ANALYST POLICY (cardex variance) — reason from these rules:',
    '- DEFINITION: cardex variance = the item ledger (F4111) does not sum to the on-hand balance (F41021) for one item. QUANTITY variance = the sum of F4111 primary-UoM quantity does NOT equal the F41021 Quantity On Hand. AMOUNT variance = the sum of F4111 extended cost does NOT equal the F41021 on-hand Value. Nothing else is cardex variance. It is inventory-internal, NOT the ledger-vs-GL gap (that is transaction variance).',
    '- STEP 1 IS ALWAYS THE JDE VALIDATION. The analyst opens Work With Item Ledger (P4111) in JDE, exports the grid, and checks that the F4111 primary quantity sums to the header Quantity On Hand and the extended cost sums to the header Value. Anything wrong in JDE is corrected in JDE FIRST. RR cannot verify JDE — it TRUSTS the analyst did this. Never imply RR confirmed JDE.',
    '- THE REMEDY FORK, decided by that validation, not by RR: (a) if JDE itself is out of balance (F4111 does not sum to F41021 in JDE), the variance is REAL — fix it at the source in JDE. The common real case is F41021 not updating for one or more cardex transactions (a system glitch that needs IT). An RR adjustment is at best a stopgap. (b) If JDE ties but RR still shows a variance, RR\'s load/roll is the artifact (e.g. F4111 and F41021 captured out of sync during a live load) — sync RR to the JDE figure with the in-place, reversible Adjust Beginning Balance.',
    '- DO NOT auto-classify a real glitch vs load-timing noise from RR data. Both can persist (especially from the initial baseline perpetual build), and RR cannot see live JDE, so a heuristic would only guess. Surface the variance and the two sums (F4111 total vs F41021 on-hand); let the analyst\'s JDE validation determine the cause. Name a LIKELY cause tentatively if asked, never as a verdict.',
    '- Quantity first: when units are off, lead with the quantity — the dollars usually follow at cost. Amount-only (units tie, value off) points at cost/valuation, not counting.',
    '- Cardex variance CANNOT be journaled — people try. It is analyst / operations work: fix the data at the source in JDE, or apply the in-place reversible sync once JDE is validated. The accountant\'s journal entry never touches it.',
    '- Audience is a JDE-fluent analyst: F4111, F41021, P4111, UOM, cost method / level are fine; no SQL or plumbing terms.'
  ].join('\n');
  // ROLLFORWARD_GROUNDING — the AI's compact copy of the Account Roll-Forward
  // corrective playbook. Prepended to the roll-forward assistant's system prompt
  // (inventory-account-rollforward.html triggerTodoAi) so its lever advice reasons
  // from RR's actual corrective order instead of a generic guess. Was inline-only
  // in that one page; lifted here so it lives with the other catalogs and a future
  // surface (e.g. the analyst-training spine) can read the same source. SOURCE OF
  // TRUTH = the roll-forward corrective workflow; keep in sync as the SME curates it.
  window.RRV8.ROLLFORWARD_GROUNDING = [
    'ROLL-FORWARD POLICY (account roll-forward) — reason from these rules:',
    '- The account roll-forward keeps the inventory source-of-truth accurate period over period. Two things can fail to roll forward: the GL balance (Account Balances (F0902) don\'t tie to the posted Account Ledger (F0911)), or the cardex-to-GL reconciliation variance (the variance doesn\'t tie).',
    '- When Account Balances (F0902) don\'t tie to the posted Account Ledger (F0911), clear the balance in order: FIRST run Repost Account Balances (R099102) in JD Edwards to rebuild the balances from the posted detail; once those tie, THEN reload the GL in RapidReconciler (the Reload GL action) so the corrected balances flow into RapidReconciler on the next refresh. State the order as the next step — the repost is a JD Edwards action the analyst posts, and Reload GL is the RapidReconciler action that follows it. RapidReconciler does NOT verify the repost and must NOT ask the analyst to prove or attest it ran clean; it is guidance, not a checkpoint (RapidReconciler is a utility, not an enforcement gate).',
    '- When the reconciliation variance is off, there is NO manual step. RapidReconciler recomputes the entire period timeline on every refresh, so the variance clears on the next run. A variance that survives a refresh is not something to clear here — escalate it to the customer\'s IT department to investigate. Never prescribe a re-roll (retired — the recompute made it obsolete) or Reload Cardex (a separate cardex data-integrity utility, not a roll-forward corrective) for a variance.',
    '- When both are off, clear the GL first — the GL balance feeds the variance, so posting the repost and reloading the GL usually squares the variance too.',
    '- This is analyst / operations maintenance, never a journal entry: the accountant does not journal a balance that doesn\'t roll forward.',
    '- Audience is a JDE-fluent finance analyst: answer in 2-4 sentences, plain accounting language; standard JD Edwards program and table references (Repost Account Balances (R099102), Account Balances (F0902), Account Ledger (F0911)) are fine; no SQL or endpoint terms.'
  ].join('\n');
  // ASOF_GROUNDING — the AI's compact copy of the perpetual / as-of definitions.
  // Prepended to the As-Of page's AI reads (inventory-asof.html asofAsk) so the
  // perpetual-inventory and residual-noise explanations stay consistent app-wide
  // instead of being re-described inline. SOURCE OF TRUTH = the perpetual-inventory
  // model + Residual Optimizer behavior; keep in sync.
  window.RRV8.ASOF_GROUNDING = [
    'ANALYST POLICY (perpetual / as-of inventory) — reason from these definitions:',
    '- PERPETUAL INVENTORY is established at go-live from an initial load of each item’s on-hand quantity and unit cost (the opening valuation baseline), then maintained as a running total transaction by transaction — every receipt, issue, adjustment, and transfer updates the on-hand quantity and its extended value immediately. Reconciliation compares that perpetual total to the GL inventory accounts.',
    '- RESIDUAL NOISE is zero-quantity rows that still carry a tiny valuation — rounding dust left in the perpetual, not real inventory. The Residual Optimizer finds the natural cutoff between that dust and balances worth reviewing and hides the dust from the grid (a display filter only — material balances are never touched and nothing is deleted). "Re-optimize" re-runs that cutoff.',
    '- Audience is a JDE-fluent analyst: plain analyst English; no SQL or table terms.'
  ].join('\n');
  // ADMIN_GROUNDING -- GENERATED from the knowledge-base docs by
  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source
  // docs and re-run the generator (or let the GHA regenerate on push).
  // Sources: RRUniversity/administrator-managing-users.html, RRUniversity/administrator-managing-companies.html, RRUniversity/administrator-complex-password.html, RRUniversity/rapidreconciler-licensing.html
  window.RRV8.ADMIN_GROUNDING = [
    'ADMIN GROUNDING -- generated from the RapidReconciler University administrator docs. Reason from the documented process below; this is the authoritative text, not a paraphrase.',
    '',
    '=== Manage the Team — RR Administrators (administrator-managing-users.html) ===',
    'Manage the Team',
    'Add and remove RapidReconciler team members, assign each person a role , and choose which databases and companies they can work in. RapidReconciler emails every new team member a secure link to set their own password — you never type or hand out a password.',
    'What changed',
    'Earlier versions configured each team member with a per-person grid of functions, tabs, and companies. RapidReconciler now uses named roles instead: you pick one role, and it carries the right module access for that job. Assign databases and companies on top of the role.',
    'Where to find it',
    'Team member management lives on the RR Team page. From the RapidReconciler Home page, open the Administration area, expand People & Licensing , and click RR Team . (Administration only appears for team members whose role includes administrator access.)',
    'The RR Team page',
    'The RR Team page lists everyone who can sign in to RapidReconciler, with a row per person:',
    'Column | What it shows',
    'Active | A badge indicating whether the account can currently sign in.',
    'Full Name | The person\'s name.',
    'Username | Their email address — this is also how they sign in.',
    'Role | The single role assigned to the team member (for example Reconciliation Analyst ).',
    'Last Login | When the team member most recently signed in.',
    'Last Pass Change | When the team member last set or changed their password.',
    'Options | A lock icon (role & access), a pencil icon (edit name/email/active), and a trash icon (remove the team member).',
    'The New Team Member button sits in the top-right of the page. The RR Team page also carries two contact fields — Project Sponsor and RR Administrator — that record who owns the RapidReconciler relationship at your site.',
    'The RR Team page Each row shows a team member, their role, and per-row lock / edit / delete options. The green New Team Member button is in the top right.',
    'Adding a team member',
    'To add someone, click the New Team Member button in the top-right of the RR Team page. Fill in the fields and click Add . The person appears on the RR Team list right away, and RapidReconciler separately emails them a single-use link to set their own password:',
    'Field | Description',
    'Full Name | The person\'s first and last name.',
    'Email | Their company email address. This is their username, and it is where the set-password link is sent.',
    'Role | The single role that governs which modules this person can use. Selecting a role shows a short description of what it grants. See Roles below.',
    'Databases | Check each RapidReconciler database the team member may sign in to. For each one, choose All licensed companies or check individual companies. See Database & company access .',
    'No passwords to manage',
    'You don\'t create or hand out a password. When you add the person, they appear on the RR Team page right away, and RapidReconciler emails them a secure link to set their own. The link is single-use and time-limited; they can sign in once they\'ve set their password.',
    'New Team Member form Pick one role and the databases (and companies) the team member may work in, then Add . The person joins the list immediately and RapidReconciler emails them a set-password link — there is no password field.',
    'Roles',
    'A role is a reusable bundle of access that decides which RapidReconciler modules a person can use. Your site\'s roles are configured for you, so the exact list you see may differ — but they typically look like this:',
    'Role | Typical access',
    'RR Administrator | Everything, including the Administration area — RR Team, Licensing, Companies, Accounting set-up, and data utilities.',
    'Reconciliation Analyst | The Inventory module — perpetual vs. GL reconciliation, transactions, As-Of, and integrity reports.',
    'Cost Accounting | Inventory reconciliation plus the accounting review surfaces. No administration access.',
    'A/P Clerk | The PO Receipts module — Received-Not-Vouchered reconciliation.',
    'One role per team member',
    'Each person has a single role. To change what someone can do, change their role — you don\'t tick individual modules per team member any more.',
    'Database & company access',
    'Role decides what a team member can do; database and company access decides where . On both the New Team Member form and the lock (access) icon, you check the databases a team member may sign in to and, within each one, either All licensed companies or a specific set.',
    '- Only the companies a team member is granted appear in their company picker on the Home page and the work pages.',
    '- Reconciliation totals reflect only the companies the team member is allowed to see — if someone\'s figures look off, check their company access first.',
    '- When a new company is licensed, team members set to All licensed companies pick it up automatically. Team members limited to a specific list must be updated to include it.',
    'Editing, locking, and deactivating',
    'From the Options column on the RR Team page:',
    'Icon | Action',
    'Lock | Change the team member\'s role and their database & company access .',
    'Pencil | Edit the team member\'s name, email, and Active state. Turning Active off blocks sign-in without deleting the account — use this when someone is on leave or has changed jobs.',
    'Trash | Remove the team member entirely. Confirm the prompt to complete.',
    'Automatic inactivity management',
    'RapidReconciler watches sign-in activity and helps keep your team list current on its own:',
    '- On the RR Team page each active member\'s row is tinted by recent activity: green when the account has been used in the last 6 months, amber at 6+ months, red at 12+ months. "Used" counts a sign-in or a password change, so a member who just set their password reads green even before their first sign-in. A member who has never signed in or set a password shows amber, so an account that was never set up stands out for review. The People & Licensing card on Home reflects the same health at a glance.',
    '- At 12 months of inactivity, RapidReconciler emails the team member a warning: sign in within 14 days or the account will be deactivated.',
    '- If they sign in during those 14 days, nothing changes — the warning clears and the account stays active.',
    '- If they don\'t, the account is deactivated automatically . Their history and settings are untouched; an administrator can turn the account back on at any time with the pencil icon (set Active back on).',
    'Who is never deactivated automatically',
    'Administrators and built-in service accounts are exempt, and RapidReconciler never deactivates the last remaining administrator — so you can\'t be locked out of your own site.',
    'What a deactivated team member sees',
    'If someone whose account was deactivated for inactivity tries to sign in, RapidReconciler tells them the account is inactive and to contact their administrator. Re-enabling them ( pencil icon → Active on) lets them straight back in.',
    'Passwords',
    'Administrators never set, see, or distribute passwords. Each team member sets their own from the secure link RapidReconciler emails them. If a team member can\'t sign in or their link has expired, edit the team member and re-send the set-password link to issue a fresh one — there is no admin-assigned temporary password. Password length and complexity rules are covered in Complex Passwords .',
    'Common pitfalls',
    'A team member can\'t see a company they should have access to',
    'The role grants the module; company access controls the data. Open the lock icon and confirm the right database is checked and the company is included (or that All licensed companies is on).',
    'Someone has a module they shouldn\'t — or is missing one',
    'Module access follows the role , not per-team-member check-boxes. Change the role to fix it.',
    'A new hire never got their set-password email',
    'Check the email address on the team member record, then re-send the set-password link from the pencil icon. The link is time-limited, so a link left unopened for too long needs re-sending.',
    'Removing a team member',
    'Click the trash icon next to the person\'s name and confirm the prompt. If you only need to stop someone signing in temporarily, turn Active off (via the pencil icon) instead of deleting the account.',
    '',
    '=== Managing Companies — RR Administrators (administrator-managing-companies.html) ===',
    'Company Management',
    'Configure licensed companies, fiscal start dates, currency settings, AAI documents, and reconciliation thresholds for each company in the application.',
    'Navigation',
    'From the RapidReconciler Home page, open the Administration area, expand People & Licensing , and click Licensing . The Licensing page is visible only to users with the RR Administrator role.',
    'The Licensing page lists all of your licensed companies. To modify a company\'s settings, click the Options icon in the far-right column of the applicable row. The page also shows your seat usage (how many of your licensed company seats are in use) and a Check JDE for more companies scan that surfaces companies with activity that aren’t licensed yet — see Licensing .',
    'Licensed Companies',
    'The Companies page displays all companies currently licensed for use in RapidReconciler. The following fields are shown for each company:',
    'The Licensing page — Licensed Companies Each row is one licensed company; the icons on the right open the Options popup or trigger a Re-roll.',
    'Field | Description',
    'Number | The company number as defined in JD Edwards.',
    'Name | The company name.',
    'Start Date | The earliest fiscal period available for reconciliation.',
    'Base Currency | The base currency of the company, pulled from JD Edwards.',
    'AAI Doc | The AAI document type used for the model DMAAI table.',
    'Threshold | The reconciliation threshold value, expressed in the company\'s base currency. Variances at or below this absolute value are treated as within tolerance and flagged accordingly on the Reconciliation page.',
    'Options | Click to open the Company Options pop-up for editing.',
    'Reroll | Click to reroll the company, which recalculates the perpetual balance from the baseline date forward. Typically used if transactions have been backdated more than 1 period.',
    'Important',
    'Only GSI can add or remove companies, as they are managed per license agreement. If additional company licenses are required, please contact GSI at gsisales@getgsi.com .',
    'Reroll by Company',
    'The Reroll icon on each company row recalculates the perpetual inventory balance from the baseline forward. Run it when an end user reports an inventory carry-forward issue — for example, the Inventory Validation light is red and the report shows VarOK = No while GLOK = Yes .',
    'What happens when you click it:',
    '- A confirmation pop-up asks “Are you sure?”',
    '- Click OK and let the process run to completion.',
    '- For each inventory account on the company, RapidReconciler starts at the beginning perpetual balance and rolls forward by adding the cardex transaction amounts period by period.',
    'It is a clean recalculation, so it resolves carry-forward problems caused by backdated transactions or transient system glitches that left a stale value in place. See the Inventory validation light is red scenario for the end-user perspective on when to request a reroll.',
    'Company Options',
    'Clicking the Options icon opens the Edit company pop-up window:',
    'Edit company popup The Company Number and Base Currency fields appear with a grey background to indicate they are read-only; they are pulled directly from JD Edwards.',
    'The Company Number and Base Currency fields are read-only, as they are pulled directly from JD Edwards and cannot be changed within RapidReconciler. The following fields may be modified:',
    'Start Date',
    'The Start Date represents the earliest fiscal period that can be reconciled. It is always set to the first day of a fiscal period — typically the first day of the current fiscal year. Once the current fiscal year is closed, the administrator should update this date to reflect the new fiscal year.',
    'Irreversible action',
    'The Start Date cannot be moved backwards . Once advanced, RapidReconciler will initiate a purge procedure to permanently remove historical data prior to the new date. Verify your fiscal year is fully closed and reconciled before advancing this date.',
    'Key considerations',
    '- It is highly recommended that at least 2 months of history be retained in the RapidReconciler database at all times.',
    '- Advancing the Start Date is a method of recovering server resources and improving application performance. Reducing the volume of data in the database results in faster response times.',
    'AAI Doc',
    'The AAI document type used to identify the model DMAAI table for the company. The default value is PI . Change it only if your JD Edwards configuration uses a different document type for the model DMAAI — it drives account derivation, so confirm the correct value against JD Edwards before you change it.',
    'Threshold',
    'The reconciliation threshold amount, expressed in the company\'s base currency. Variances whose absolute value falls at or below this amount are treated as within tolerance.',
    'Example',
    'If the Threshold is set to 100.00 and a variance of $87.50 is calculated for a period, that variance is flagged as within tolerance on the Reconciliation page and does not require a journal entry. A variance of $250.00, by contrast, is flagged as exceeding tolerance and requires investigation.',
    'Click Save Changes when all modifications are complete.',
    'Adding a Company License',
    'Company numbers in RapidReconciler are license-controlled and can only be added by GSI staff. Each company in the application corresponds to a licensed JD Edwards company number as specified in your purchase agreement.',
    'Finding Companies You Haven’t Licensed Yet',
    'The Licensing page can show you which JD Edwards companies have activity in this database but aren’t licensed in RapidReconciler — useful when you’re deciding whether a company is worth adding. Below the licensed list, click Check JDE for more companies . Because it scans JD Edwards activity, it can take a moment; when it finishes, a Not Licensed list appears showing each company’s number, name, item count, and a small last-12-months activity bar, so you can gauge at a glance whether it’s active enough to be worth a seat.',
    'You can’t add a company from this page — licensing is a contract term — but it tells you exactly which company numbers and names to include when you request more below.',
    'Tip',
    'A Not Licensed company with steady activity across the last twelve months is usually a good candidate; one with little or no activity may not be worth a seat.',
    'Requesting Additional Companies',
    'If you have additional companies you would like to reconcile that are not currently available in the application, please contact GSI Sales to begin the licensing process.',
    'Email GSI Sales gsisales@getgsi.com Compose Pre-Filled Email',
    'Clicking the button above opens your default email client with a draft addressed to GSI Sales, including a subject line and a request template ready to fill in. The pre-filled email looks like this:',
    'Preview — opens in your default mail client To gsisales@getgsi.com Subject RapidReconciler — Additional Company License Request Hello GSI Sales Team, We would like to add one or more additional companies to our RapidReconciler license. Please find the details below. == Customer Information == Company Name: RapidReconciler Account / Customer ID: Primary Contact Name: Primary Contact Email: Phone: == Companies to Add == Please add the following JD Edwards companies to our license: 1. JDE Company Number: Company Name: 2. JDE Company Number: Company Name: (add additional rows as needed) == Additional Notes == Thank you,',
    'If you prefer to write the email manually, please include the following:',
    '- Your company name and RapidReconciler account details',
    '- The JD Edwards company numbers you would like to add',
    '- The corresponding company names',
    'A GSI representative will follow up to confirm licensing and coordinate the update.',
    'Managing Company Settings',
    'Company settings, including enabling or disabling companies for individual users, are managed by your RapidReconciler administrator. If you need changes to your company configuration, please contact your internal RapidReconciler administrator.',
    'Note',
    'Changes to company licensing may require a restart of the RapidReconciler Agent before they take effect in the application.',
    '',
    '=== Complex Password Option (administrator-complex-password.html) ===',
    'RapidReconciler supports an optional complex password policy designed to protect sensitive financial reconciliation data and align with common enterprise security standards. You choose which companies require it — turning it on for the companies that need it without forcing it on the rest. This guide covers what each setting requires, how to choose which companies use it, the reset process, and administrative controls.',
    'Overview',
    'Every RapidReconciler password meets a standard baseline. On top of that, your RapidReconciler administrator can require complex passwords for the companies that need stronger protection — set on the Complex Passwords page, one company at a time or all at once.',
    '§ Standard vs. complex',
    'Standard — always on | Complex — when a company requires it',
    'At least 8 characters . | Everything in Standard, plus the rules below.',
    'Can’t reuse your current password. | Characters from at least 3 of 4 groups — uppercase, lowercase, digit, special.',
    'No run of 3+ characters from your name or email.',
    'Can’t match any of your last 10 passwords.',
    'Why per company? A password belongs to a person, but a company is an access scope. Because one person can work in more than one company, the strongest rule wins: if someone can reach any company that requires a complex password, they’ll be asked for one. Turning it on for a single company effectively covers everyone who can reach that company.',
    'People who sign in with single sign-on (SSO) are never affected by these rules — their identity provider handles password strength.',
    'Password Requirements',
    'When the complex password policy is enabled, all user passwords must meet the following criteria:',
    'Requirement | Detail',
    'Minimum length | 8 characters',
    'Name restriction | Cannot contain the user’s account name or parts of their full name exceeding two consecutive characters',
    'Password history | Cannot match any of the last 10 passwords',
    'Expiry | Must be changed every 90 days',
    'Storage & transmission | Must not be displayed, stored, or transmitted in clear text',
    '§ Character Complexity',
    'Your password must include characters from any three of the four categories listed below — you do not need to use all four:',
    '- English uppercase characters (A through Z)',
    '- English lowercase characters (a through z)',
    '- Base 10 digits (0 through 9)',
    '- Non-alphabetic characters (e.g. ! , $ , # , % )',
    'Tip: A strong password example is Blue$ky92 — it draws from all four character categories. The diagram below shows which character belongs to which category:',
    'Logging In',
    'When a user attempts to log in, they will be directed to the Password Reset screen if either of the following conditions is met:',
    '- 90 days have elapsed since their last password change.',
    '- They click the "Forgot your password?" link and then follow the reset link sent to their email.',
    'RapidReconciler login screen The "Forgot your password?" link sits below the password field. Clicking it sends a password reset link to the email address on file for the user.',
    'Note: The password reset link sent by email is time-limited. If the link has expired, the user should repeat the "Forgot your password?" process to receive a new link. If the issue persists, contact your RapidReconciler administrator.',
    'Resetting a Password',
    'On the Password Reset screen, the new password must conform to the policy outlined above. The Confirm button remains disabled until the password meets the 8-character minimum length requirement.',
    'Password Reset screen Enter a new password in both fields. The Confirm button enables once the 8-character minimum is met.',
    'Common reasons a new password may be rejected:',
    '- The password is fewer than 8 characters',
    '- The password does not meet the three-category complexity requirement',
    '- The password contains the user’s name or account name',
    '- The password matches one of the last 10 previously used passwords',
    'When a complexity rule is violated, an error banner appears below the Confirm button explaining what is missing:',
    'Complexity error banner Fires when the password meets the 8-character minimum but uses fewer than three of the four character categories. To resolve, add a missing category — for example, a digit or symbol.',
    'If your password is being rejected and you are unsure why, review the requirements above and try a different combination of characters.',
    'Administration',
    '§ How New Users Get a Password',
    'Administrators never set, see, or hand out passwords. When you add a new user, RapidReconciler emails them a secure, single-use link to set their own. Whatever password they choose must meet the complex password policy if it is enabled for your site. There is no admin-assigned temporary password.',
    'For step-by-step instructions on adding users, see Manage the Team !',
    'Best Practice: The set-password link is time-limited. If a new hire doesn’t set their password before the link expires, re-send the link from the RR Team page to issue a fresh one rather than sharing credentials any other way.',
    '§ Turning Complex Passwords On or Off',
    'You manage this yourself on the Complex Passwords page. From your Home dashboard, open the Team & access card and click Complex passwords . It lists the companies licensed on your database with an on/off switch for each. Turn it on for a single company, or use Require for all to switch every company at once. Changes take effect the next time an affected user signs in or changes their password. See Choosing which companies require it below.',
    'Recommendation: Keep complex passwords required for any company that holds production financial data. A training or sandbox company can stay on the standard rules.',
    '§ Locked or Inaccessible Accounts',
    'If a user is unable to log in and cannot complete the password reset process — for example, they no longer have access to the email address on file — the administrator can re-send their set-password link from the RR Team page. If the email address itself is wrong, edit the user to correct it first, then re-send.',
    'See Manage the Team for instructions on editing a user and re-sending a set-password link',
    'Choosing Which Companies Require It',
    'Open Complex Passwords from your Home dashboard: the Team & access card lists it alongside users and access review. You’ll see the companies licensed on your database, each with an on/off switch:',
    '- One company — flip its switch to Complex . Anyone who can reach that company will be asked for a complex password the next time they sign in or change it.',
    '- All companies — use Require for all to turn it on everywhere, or Turn off for all to drop back to the standard rules.',
    'Existing users aren’t locked out when you turn it on — they keep their current password until it expires or they choose to change it, at which point the new rules apply.',
    'Note: It’s a good idea to let people know in advance. The next password they set for an affected company will need to meet the complex rules.',
    'Quick Reference',
    'Scenario | Action',
    'Password expired | A message box appears stating that the password has expired, with a button to reset the password',
    'Forgot password | Click "Forgot your password?" and follow the emailed reset link',
    'New user first login | Set your own password using the secure link emailed to you',
    'Password reset link expired | Repeat the "Forgot your password?" process',
    'Account inaccessible | Contact your RapidReconciler administrator to be sent a fresh set-password link',
    '← Back to Getting Started Need help? rrsupport@getgsi.com',
    '',
    '=== RapidReconciler Licensing — Request Additional Licenses (rapidreconciler-licensing.html) ===',
    'Licensing · how to request',
    'Request additional RapidReconciler licenses.',
    'RapidReconciler is licensed per JD Edwards company number . Adding a new company to your RapidReconciler instance goes through GSI Sales — not RR Support. This page walks through what to include in the email and what happens after Sales confirms.',
    'When to use this',
    'Use this page when you need to add a JD Edwards company to your RapidReconciler instance. Each JDE company number that RapidReconciler reconciles against is licensed; only Sales can add a new one to your entitlement.',
    'Sales owns the entitlement; RR Support owns the running application. License changes go to gsisales@getgsi.com , not rrsupport@getgsi.com .',
    'You don’t need this page to add users. RapidReconciler does not license per user seat — your administrator adds and removes users directly. See Manage the Team .',
    'Check your current usage first',
    'Before requesting more, see how many of your licensed company seats are already in use. On the RapidReconciler Home page, open Administration → People & Licensing → Licensing . The Licensing page shows a read-only banner such as “Using 2 of 3 company licenses” — it turns amber when you’re at your limit and red if you’re over it. If your license covers unlimited companies, it reads “Unlimited companies · N in use” instead, with no cap to reach.',
    'This banner is informational only. Your entitlement is set by GSI Sales; there are no controls on this page to change your seat count — that’s what the email below is for. The same page also offers a Check JDE for more companies scan that lists JDE companies with activity that aren’t licensed yet, which can help you decide which company numbers to request.',
    'See your renewal date',
    'The same Licensing page — and the Licensing card on your Administrator Home — shows your license renewal date alongside a live day count, for example “44 days left · Renewal due Aug 31, 2026.” The count turns amber as the date gets close (within 60 days) and red once it has passed, so you get a heads-up well before renewal.',
    'The date is read-only and informational — the same as the seat banner above. Renewing is still a Sales action: when the date is approaching, send the email below to gsisales@getgsi.com so your entitlement is extended before it lapses.',
    'What to include in your email',
    'A short email with the four items below lets Sales reply with a confirmation and any billing follow-up. The clearer the request, the faster the turnaround.',
    '- Customer / instance name — so Sales can match the request to your account.',
    '- JDE company number(s) to add — for example, “license for JDE company 00050 ” or “companies 00050 and 00060 .”',
    '- When you need it by — especially if there’s a go-live, audit, or period-close deadline.',
    '- Who to copy on the response — procurement, project lead, or IT.',
    'Quick start — email Sales',
    'Opens a draft addressed to GSI Sales with a starter subject. Fill in the four items above before sending.',
    'Email gsisales@getgsi.com',
    'After Sales confirms',
    'Once Sales replies that the new company license is in place, an administrator on your side configures it inside RapidReconciler:',
    '- Follow Adding a Company License to configure the new JDE company in RapidReconciler.',
    '- Once the company is configured, your administrator can grant users access to the new company through Manage the Team . Adding users does not require a license change.',
    'Questions about your entitlement?',
    'For billing, contract, or scope questions, contact gsisales@getgsi.com . For technical or operational questions about RapidReconciler itself, contact rrsupport@getgsi.com .',
    '← Back to RapidReconciler University+ RapidReconciler Assist home →'
  ].join('\n');
  // <<AI-GROUNDING GENERATED END>>
})();

/*
 * RRV8.cardStore — the card-keyed resolution store for the analyst
 * Transaction-Variance view (UI-26). ONE record per
 * (database, company, card_code, period_end) — the closed-card resolution
 * record + the convergence auto-reopen spine. Replaces the legacy per-row
 * work-note derivation FOR TX-VARIANCE (a card carries ~10 rows per company
 * per period, not thousands of row-notes, and survives B->C row churn).
 *
 * Self-contained (own fetch + JWT + RRDB.agentBase base) exactly like
 * exportName / logActivity — never throws, always resolves. Server-first with a
 * per-browser localStorage fallback (key rrv8.txvCards.<dbName>.<company>, a
 * JSON map) so the card lifecycle works with ZERO console errors before the
 * owner ships the /inventory/txv endpoints + dbo.RTxvCardResolution.
 *
 *   load(company)              -> Promise<map>  keyed "<co>|<cardCode>|<periodEnd>";
 *                                 cached per (activeDb, company); tries the agent,
 *                                 falls back to localStorage on any failure OR empty.
 *   save(record)               -> Promise       optimistic in-memory + localStorage
 *                                 mirror immediately, then POST; resolves regardless
 *                                 (server failure = localStorage-only persistence).
 *   get(company, code, period) -> record | null (SYNC; caller must load() first)
 *   forCompany(company)        -> [record, ...] all cached records for a company
 *                                 across periods (for recurrence derivation).
 *
 * record = { company, cardCode, periodEnd, status, note, sourceFix, varAmount, by, at }
 * status in { open | worked | complete | reopened }. `by` is filled server-side
 * from the JWT; the localStorage mirror stores by:'' (the browser can't attest
 * identity). periodEnd is the 10-char YYYY-MM-DD.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<code>|<period>": record } }
  function _db() {
    try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; }
  }
  function _base() {
    try {
      return (window.RRDB && RRDB.agentBase && RRDB.agentBase())
        || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || '';
    } catch (_) { return ''; }
  }
  function _auth(h) {
    try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {}
    return h;
  }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _key(co, code, periodEnd) { return String(co) + '|' + String(code) + '|' + _p10(periodEnd); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.txvCards.' + _db() + '.' + String(co); }
  function _lsRead(co) {
    try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; }
    catch (_) { return {}; }
  }
  function _lsWrite(co, map) {
    try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {}
  }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:   String(rec.company == null ? '' : rec.company),
      cardCode:  String(rec.cardCode == null ? '' : rec.cardCode),
      periodEnd: _p10(rec.periodEnd),
      status:    String(rec.status == null ? '' : rec.status),
      note:      String(rec.note == null ? '' : rec.note),
      sourceFix: rec.sourceFix == null ? '' : String(rec.sourceFix),
      varAmount: (rec.varAmount == null || rec.varAmount === '') ? null : Number(rec.varAmount),
      by:        rec.by == null ? '' : String(rec.by),
      at:        rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/resolutions?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr) || !arr.length) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) {
          var n = _norm(rec);
          if (!n.company) n.company = String(company);
          map[_key(n.company, n.cardCode, n.periodEnd)] = n;
        });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth locally so a later offline read agrees
        return map;
      })
      .catch(function () { return _fallback(company, ck); });   // any failure -> localStorage
  }
  function get(company, cardCode, periodEnd) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, cardCode, periodEnd)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = [];
    for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    n.at = new Date().toISOString();   // mirror stamp; the server overwrites `by`/`at` authoritatively
    var ck = _cacheKey(n.company);
    var c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.cardCode, n.periodEnd)] = n;   // optimistic in-memory update
    var mirror = {};                                       // mirror the whole company map to localStorage now
    for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/resolution', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        company: n.company, cardCode: n.cardCode, periodEnd: n.periodEnd,
        status: n.status, note: n.note, sourceFix: n.sourceFix, varAmount: n.varAmount
      })
    }).then(function () { return n; }).catch(function () { return n; });   // localStorage already holds it
  }
  window.RRV8.cardStore = { load: load, save: save, get: get, forCompany: forCompany, key: _key };
})();

/*
 * RRV8.beStore — the balancing-entry EXPORT + VERIFICATION store (accountant side
 * of the Audit spine). When the accountant exports a period-end balancing entry,
 * RR mints a short token, hands them a ready-to-paste JDE Explanation carrying it,
 * and records the export here as UNVERIFIED. On a later load the agent matches the
 * token against F0911.GLEXA (the posted JE's Explanation) and flips the record to
 * VERIFIED with the matched batch/amount — turning a self-reported "I posted it"
 * into evidence reconciled against the system of record (JDE).
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore, so
 * the token flow works with ZERO console errors before the owner ships the
 * /inventory/balancing-entry endpoints + dbo.RBalancingEntryExport. Grain: ONE
 * record per token (a company+period may have more than one export over time).
 *
 *   load(company)       -> Promise<map>  keyed by token; cached per (activeDb, company)
 *   save(record)        -> Promise       optimistic localStorage mirror, then POST
 *   forCompany(company) -> [record, ...] all cached records for a company
 *
 * record = { company, periodEnd, token, amount, clearingAccount, entryType, status,
 *            matchedBatch, matchedAmount, by, at }
 * entryType in { balancing | adjusting } — which entry path minted it (Audit title).
 * status in { unverified | verified }. Verification (matchedBatch/Amount, verified)
 * is server-owned — the localStorage mirror can only ever hold 'unverified'.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<token>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.beExports.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:         String(rec.company == null ? '' : rec.company),
      periodEnd:       _p10(rec.periodEnd),
      token:           String(rec.token == null ? '' : rec.token),
      amount:          (rec.amount == null || rec.amount === '') ? null : Number(rec.amount),
      clearingAccount: rec.clearingAccount == null ? '' : String(rec.clearingAccount),
      // Which entry path minted it: 'balancing' (Overview clearing-account entry) or
      // 'adjusting' (Accounts deep-dive per-account offset entry). Drives the Audit
      // card title. Defaults to 'balancing' so pre-tag records read as before.
      entryType:       String(rec.entryType == null || rec.entryType === '' ? 'balancing' : rec.entryType),
      status:          String(rec.status == null ? 'unverified' : rec.status),
      matchedBatch:    rec.matchedBatch == null ? '' : String(rec.matchedBatch),
      matchedAmount:   (rec.matchedAmount == null || rec.matchedAmount === '') ? null : Number(rec.matchedAmount),
      by:              rec.by == null ? '' : String(rec.by),
      at:              rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/balancing-entry/exports?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {}, ls = _lsRead(company);
        // Server is authoritative for verification; keep any local-only records the
        // server hasn't ingested yet (offline export before the endpoint shipped).
        for (var lk in ls) if (Object.prototype.hasOwnProperty.call(ls, lk)) map[lk] = _norm(ls[lk]);
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); if (n.token) map[n.token] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    if (!n.status) n.status = 'unverified';
    var ck = _cacheKey(n.company);
    var c = _cache[ck] || (_cache[ck] = { map: {} });
    if (n.token) c.map[n.token] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/balancing-entry/export', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, token: n.token, amount: n.amount, clearingAccount: n.clearingAccount, entryType: n.entryType })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  window.RRV8.beStore = { load: load, save: save, forCompany: forCompany };
})();

/*
 * RRV8.dispoStore — the accountant per-company period DISPOSITION store (UI-27 /
 * UI-34). ONE record per (database, company, period). When the accountant marks a
 * company complete for the period, the disposition REASON
 * (immaterial | corrected | analyst | timing) is recorded here — the "record the
 * decision" half of the Audit spine, and the shared signal the analyst view reads.
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore.
 *
 *   load(company)         -> Promise<map>  keyed "<co>|<period>"; cached per (db, company)
 *   get(company, period)  -> record | null (SYNC; caller must load() first)
 *   forCompany(company)   -> [record, ...]
 *   save(record)          -> Promise       optimistic mirror, then POST /inventory/disposition
 *   clear(company, period)-> Promise       optimistic remove, then POST .../reopen
 *
 * record = { company, periodEnd, reason, by, at }. `by`/`at` are server-owned; the
 * localStorage mirror stores by:'' (the browser can't attest identity).
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<period>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _key(co, period) { return String(co) + '|' + _p10(period); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.dispos.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:   String(rec.company == null ? '' : rec.company),
      periodEnd: _p10(rec.periodEnd),
      reason:    String(rec.reason == null ? '' : rec.reason),
      by:        rec.by == null ? '' : String(rec.by),
      at:        rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition/list?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); map[_key(n.company, n.periodEnd)] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth (authoritative — replaces local)
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function get(company, period) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, period)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    var ck = _cacheKey(n.company), c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.periodEnd)] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, reason: n.reason })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  function clear(company, period) {
    var ck = _cacheKey(company), c = _cache[ck] || (_cache[ck] = { map: {} });
    delete c.map[_key(company, period)];   // optimistic remove
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(company, mirror);
    var base = _base();
    if (!base) return Promise.resolve();
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/disposition/reopen', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: String(company), periodEnd: _p10(period) })
    }).then(function () {}).catch(function () {});
  }
  window.RRV8.dispoStore = { load: load, get: get, forCompany: forCompany, save: save, clear: clear, key: _key };
})();

/*
 * RRV8.analystReviewStore — the per-company period REVIEW store for the analyst
 * Transaction-Variance view (Pass 1). ONE record per (database, company, period).
 * When the analyst finishes a period — some sources fixed, the rest let to ride —
 * they mark the period reviewed; the tally (how many card slices they fixed at the
 * source vs. let ride) is recorded here. This is the analyst counterpart to the
 * accountant dispoStore: the "I've looked, here's what I did" signal that Pass 2
 * will surface into the Audit Center.
 *
 * Same self-contained, server-first + localStorage-fallback shape as cardStore /
 * dispoStore, so the review flow works with ZERO console errors before the owner
 * ships the /inventory/txv/period-review endpoints + dbo.RTxvPeriodReview.
 *
 *   load(company)         -> Promise<map>  keyed "<co>|<period>"; cached per (db, company)
 *   get(company, period)  -> record | null (SYNC; caller must load() first)
 *   forCompany(company)   -> [record, ...]
 *   save(record)          -> Promise       optimistic mirror, then POST
 *
 * record = { company, periodEnd, sourcesFixed, letRide, note, by, at }. `by`/`at`
 * are server-owned; the localStorage mirror stores by:'' (the browser can't attest
 * identity). sourcesFixed / letRide are integer card counts.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var _cache = {};   // "<dbName>|<company>" -> { map: { "<co>|<period>": record } }
  function _db() { try { return (window.RRDB && RRDB.name && RRDB.name()) || '_'; } catch (_) { return '_'; } }
  function _base() {
    try { return (window.RRDB && RRDB.agentBase && RRDB.agentBase()) || (window.RR_CONFIG && RR_CONFIG.testAgentBase) || ''; }
    catch (_) { return ''; }
  }
  function _auth(h) { try { var t = localStorage.getItem('rrv8.token'); if (t) h['Authorization'] = 'Bearer ' + t; } catch (_) {} return h; }
  function _p10(p) { return String(p == null ? '' : p).slice(0, 10); }
  function _int(v) { var n = parseInt(v, 10); return isFinite(n) ? n : 0; }
  function _key(co, period) { return String(co) + '|' + _p10(period); }
  function _cacheKey(co) { return _db() + '|' + String(co); }
  function _lsKey(co) { return 'rrv8.analystReview.' + _db() + '.' + String(co); }
  function _lsRead(co) { try { var raw = localStorage.getItem(_lsKey(co)); return raw ? (JSON.parse(raw) || {}) : {}; } catch (_) { return {}; } }
  function _lsWrite(co, map) { try { localStorage.setItem(_lsKey(co), JSON.stringify(map || {})); } catch (_) {} }
  function _norm(rec) {
    rec = rec || {};
    return {
      company:      String(rec.company == null ? '' : rec.company),
      periodEnd:    _p10(rec.periodEnd),
      sourcesFixed: _int(rec.sourcesFixed),
      letRide:      _int(rec.letRide),
      note:         String(rec.note == null ? '' : rec.note),
      by:           rec.by == null ? '' : String(rec.by),
      at:           rec.at == null ? '' : String(rec.at)
    };
  }
  function _fallback(company, ck) {
    var map = {}, ls = _lsRead(company);
    for (var k in ls) if (Object.prototype.hasOwnProperty.call(ls, k)) map[k] = _norm(ls[k]);
    _cache[ck] = { map: map };
    return map;
  }
  function load(company) {
    var ck = _cacheKey(company), base = _base();
    if (!base) return Promise.resolve(_fallback(company, ck));
    var h = _auth({ 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/period-review?company=' + encodeURIComponent(company), { headers: h })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (arr) {
        if (!Array.isArray(arr)) return _fallback(company, ck);
        var map = {};
        arr.forEach(function (rec) { var n = _norm(rec); if (!n.company) n.company = String(company); map[_key(n.company, n.periodEnd)] = n; });
        _cache[ck] = { map: map };
        _lsWrite(company, map);   // mirror server truth (authoritative — replaces local)
        return map;
      })
      .catch(function () { return _fallback(company, ck); });
  }
  function get(company, period) {
    var c = _cache[_cacheKey(company)];
    return c ? (c.map[_key(company, period)] || null) : null;
  }
  function forCompany(company) {
    var c = _cache[_cacheKey(company)]; if (!c) return [];
    var out = []; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) out.push(c.map[k]);
    return out;
  }
  function save(record) {
    var n = _norm(record);
    if (!n.at) n.at = new Date().toISOString();
    var ck = _cacheKey(n.company), c = _cache[ck] || (_cache[ck] = { map: {} });
    c.map[_key(n.company, n.periodEnd)] = n;   // optimistic
    var mirror = {}; for (var k in c.map) if (Object.prototype.hasOwnProperty.call(c.map, k)) mirror[k] = c.map[k];
    _lsWrite(n.company, mirror);
    var base = _base();
    if (!base) return Promise.resolve(n);
    var h = _auth({ 'Content-Type': 'application/json;charset=UTF-8', 'Accept': 'application/json' });
    return fetch(base + '/inventory/txv/period-review', {
      method: 'POST', headers: h,
      body: JSON.stringify({ company: n.company, periodEnd: n.periodEnd, sourcesFixed: n.sourcesFixed, letRide: n.letRide, note: n.note })
    }).then(function () { return n; }).catch(function () { return n; });
  }
  window.RRV8.analystReviewStore = { load: load, get: get, forCompany: forCompany, save: save, key: _key };
})();

/*
 * RRDEMO — staged, non-production sample data for the demo. Callers gate on
 * RR_CONFIG.mode !== 'prod', so production always renders live data; this only
 * surfaces in demo/staging. Timestamps are relative to page load so the feed
 * always reads "recent". No customer identifiers — generic counts/dates only.
 */
window.RRDEMO = window.RRDEMO || {};
// A realistic Application Activity Log (newest first) shared by the Home card
// mini-feed and the full Activity Log page, so the two always agree.
window.RRDEMO.activityLog = function () {
  var now = Date.now(), M = 60000, H = 3600000, D = 86400000;
  function at(ago) { return new Date(now - ago).toISOString(); }
  return [
    { at: at(2 * H),               event: 'Report engine started',  detail: 'Service resumed after the nightly maintenance window',                by: 'System' },
    { at: at(6 * H),               event: 'Data refresh completed', detail: 'Scheduled JDE import finished — 1,284,102 rows across 3 companies',    by: 'Scheduler' },
    { at: at(6 * H + 52 * M),      event: 'Data refresh started',   detail: 'Nightly scheduled import from JD Edwards began',                       by: 'Scheduler' },
    { at: at(20 * H),              event: 'Reconciliation reviewed',detail: 'Period 2026-06 inventory reconciliation opened and reviewed',          by: 'Administrator' },
    { at: at(1 * D + 2 * H),       event: 'Cardex reloaded',        detail: 'Perpetual cardex rebuilt from 2026-05-01',                             by: 'Administrator' },
    { at: at(1 * D + 3 * H),       event: 'GL reloaded',            detail: 'GL roll-forward reloaded from 2026-04-01 to clear a balance break',    by: 'Administrator' },
    { at: at(1 * D + 4 * H),       event: 'User signed in',         detail: 'Administrator session started',                                        by: 'Administrator' },
    { at: at(2 * D + 1 * H),       event: 'Access review completed',detail: 'Team access reviewed and confirmed — next review Jul 27, 2026',        by: 'Administrator' },
    { at: at(2 * D + 5 * H),       event: 'User added',             detail: 'New team member granted the Accountant role',                          by: 'Administrator' },
    { at: at(3 * D),               event: 'Password policy updated',detail: 'Complex-password requirement enabled for 2 companies',                 by: 'Administrator' },
    { at: at(3 * D + 6 * H),       event: 'Report engine started',  detail: 'Service started after an application update',                          by: 'System' },
    { at: at(3 * D + 6 * H + 40 * M), event: 'Data refresh completed', detail: 'Scheduled JDE import finished — 1,190,447 rows across 3 companies', by: 'Scheduler' },
    { at: at(4 * D + 3 * H),       event: 'Fiscal calendar checked',detail: 'No period-end date changes detected',                                 by: 'Scheduler' },
    { at: at(5 * D + 2 * H),       event: 'Purge completed',        detail: 'Removed data older than the 24-month retention window',                by: 'Scheduler' },
    { at: at(6 * D + 5 * H),       event: 'Report engine started',  detail: 'Initial service start',                                                by: 'System' }
  ];
};
