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
  // ACCT_GROUNDING — the AI's compact copy of the accountant playbook. Prepended to
  // every accountant-facing AI prompt so the reads reason from firm policy, not
  // generic LLM accounting. SOURCE OF TRUTH = docs/plans/accounting-reference.md;
  // keep this in sync with it (same discipline as dmaai-reference.md ↔
  // AiService.DMAAI_GROUNDING). Owner (accounting SME) curates the policy values.
  window.RRV8.ACCT_GROUNDING = [
    'ACCOUNTING POLICY (reconciliation) — reason from these rules:',
    '- RR reconciles inventory to GL; JDE is the book of record. You surface the gap, explain it, and produce the correcting entry the accountant posts in JDE. RR does not post, hold the ledger, or run schedules.',
    '- Materiality: an out-of-balance under $100 is immaterial regardless of %; a GL balance under $1,000 is dormant/near-zero — frame by absolute amount and suppress the %. Otherwise judge by the gap as a share of the GL balance (well under ~1% is immaterial).',
    '- The out-of-balance decomposes into components. ACCOUNTANT-OWNED (journal these): carry forward, transactions, manual entries. NOT the accountant\'s: unposted GL batches + end-of-day (operations timing — self-clears when operations posts, never journal it) and cardex (an analyst re-roll, not a JE). The adjusting entry uses ONLY the accountant-owned amount; never journal the timing.',
    '- Reclass vs JE: a transaction in the wrong period/account is a reclass, not a new balancing JE. A roll-forward break (red dot) is an analyst re-roll, not the accountant\'s and not a JE.',
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
    '- Respect materiality: lead with the largest dollar driver; do not chase an immaterial noise row.',
    '- This is SOURCE / analyst work — fix the double-write, the AAI mapping, or the period at the source. The accountant owns journal entries; the analyst does not post JEs.',
    '- Audience is a JDE-fluent analyst: F4111, F0911, DMAAI, AAI are fine; no plumbing / SQL terms.'
  ].join('\n');
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
