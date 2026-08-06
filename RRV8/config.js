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
  // dataAccessLine(): the per-tier "DATA ACCESS — <Tier>" instruction line that
  // EVERY analyst-facing ai/explain prompt must carry. Two jobs in one line:
  //   (1) it instructs the model per the exposure ladder (Grounded = on-screen
  //       figures only; Scrubbed = generic labels / roles, no real names; Full =
  //       specifics + provenance), so Full genuinely differs from Grounded; and
  //   (2) it is the drift-stable REPLAY KEY discriminator — request-signature.js
  //       aiExplainKey() reads the tier out of this exact "DATA ACCESS … <Tier>"
  //       marker. WITHOUT it, all three tiers hash to ONE signature (tier=na) and
  //       a demo recording cannot replay per tier. Keep the words Grounded /
  //       Scrubbed / Full verbatim (the key regex matches them); the UI labels
  //       (Basic / Enhanced / Full) are cosmetic and live in RRAI.LABELS.
  window.RRV8.dataAccessLine = function (exposure) {
    var e = (window.RRAI && RRAI.norm(exposure)) || exposure;
    switch (e) {
      case 'grounded':
        return 'DATA ACCESS — Grounded: use ONLY the on-screen figures already shown; do not trace history, name source tables, or add provenance.';
      case 'scrubbed':
        return 'DATA ACCESS — Scrubbed: refer to every company, account, and person by a generic label or role only — never by a real name or number.';
      case 'full':
        return 'DATA ACCESS — Full: you may cite specifics — company and account numbers, item and document IDs, exact dates, and the source of each figure.';
      default:
        return '';   // 'off' never reaches the model; unknown → no line
    }
  };
  // aiCtx(): a stable, server-IGNORED disambiguator appended to an analyst
  // ai/explain URL as ?ctx=… . It exists ONLY to make the demo replay signature
  // unique per (surface, company, period): request-signature.js folds the sorted
  // query into the key, so two briefings that produce the SAME model prompt (e.g.
  // Scrubbed masks the company to "this company" for both Co A and Co B) still get
  // DISTINCT recordings. It travels in the URL, never the body, so it never
  // reaches the model — Scrubbed masking and Full latitude are untouched, and the
  // gateway ignores the unknown param (verified 200). Pair it with dataAccessLine
  // (which carries the tier in the body): together the key is (surface, co,
  // period, tier). Real company numbers are fine here — the demo companies are
  // fictional and the value never leaves the box.
  window.RRV8.aiCtx = function (surface, co, period) {
    var parts = [String(surface || 'ai')];
    if (co != null && String(co).trim() !== '') parts.push('co' + String(co).trim());
    if (period != null && String(period).trim() !== '') parts.push(String(period).trim());
    return encodeURIComponent(parts.join('-').replace(/\s+/g, ''));
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
    '- TIE OR NO TIE. The test is whether the F0911 amount matches the F4111 amount within tolerance. It is BINARY. NEVER express a transaction variance as a percentage or a ratio — it is not a share of anything, and a percentage actively misleads here. State dollars.',
    '- IF F0911 DOES NOT TIE TO F4111, A CORRECTION IS REQUIRED. Always. "Explained" tells the analyst WHY the two sides disagree; it NEVER means leave it alone. The cause decides WHAT the correction is. It does not remove the need for one.',
    '- TIE AT THE RIGHT GRAIN before calling anything unexplained. Two documents against one order, or two accounts on one document, can each fail a document-level tie and still sum exactly to the order total.',
    '- Check DUPLICATE SALES FIRST — rare, but cheap and definitive, so screen for it before any cost / mapping / timing reasoning. When a line is written to the cardex (F4111 / RTransactions) twice, the cardex is overstated by that line while the GL has it once, so the variance EQUALS the duplicated line. dbo.RDuplicateSales flags it. If the facts carry a duplicate-sales flag, LEAD with it — the fix is at the source: reverse the double relief, then close whichever door let it happen (a closed order line re-confirmed at ship-confirm, or an interrupted Sales Update re-run against a workfile that still held its records).',
    '- A transfer ships and receives as TWO INDEPENDENT transactions; each reconciles on its own document. Never explain one leg\'s variance by whether or when the other leg posted.',
    '- In-transit reconciliation (ST↔OT pairing, the 4220 / 4245 in-transit clearing account, the transfer-order Orders page) is a SEPARATE surface. Do NOT invoke a stranded-leg / in-transit / clearing model to explain a per-document cardex-vs-ledger variance — that conflation is wrong.',
    '- A GL-ONLY row (cardex 0, ledger ≠ 0) is most often a NON-STOCK line: the order line type (F4211 / F42119 SDLNTY) is "N", Non-Stock, whose F40205 Inventory Interface is "N". It posts to the G/L and moves no inventory, so no F4111 row exists. THAT IS THE CAUSE, NOT A CLEARANCE — the row still requires a correction.',
    '- NON-STOCK, WHAT TO CHECK AND WHAT TO SAY: read the order line type, then read WHICH ACCOUNT the G/L leg landed on. Verified case: the non-stock extended cost (F4211 / F42119 SDECST on the type-N lines) tied to the F0911 amount to the penny, and the G/L leg had posted to the INVENTORY account — the same account the cardex uses. A non-stock item holds no inventory, so that value does not belong in an inventory account. The tie-out PINPOINTS THE DEFECT; it does not exonerate the row. Never say a non-stock GL-only row is expected, needs no correction, or should not be chased. THE CAUSE IS THE G/L CLASS ON THE LINE, NOT THE DMAAI — verified: the non-stock AAI entry was CORRECT (it pointed away from inventory), while every type-N line carried a STOCK item\'s G/L class instead of the line type\'s own class, and that stock class is what resolves to the inventory account. So DO NOT tell the analyst to change the non-stock DMAAI; tell them to correct the G/L class on those items so a non-stock line stops resolving to inventory. The accountant reclassifies what is already posted.',
    '- NON-STOCK, THE TWO CORRECTIONS: at the SOURCE, the DMAAI directing that non-stock line type is sending non-stock cost to the inventory account — correct the DMAAI so non-stock cost lands on its own non-inventory account. For EXISTING BALANCES, the ACCOUNTANT reclassifies the already-posted non-stock value out of the inventory account (name the lane, never instruct or argue the entry). Until both are done, the G/L inventory balance is overstated against the item ledger by exactly the non-stock total, on every order carrying such a line.',
    '- An A/P VOUCHER (batch type V) posted to an inventory account is a variance that requires a correction, and its cause is a DMAAI error: DMAAI 4330 is sending voucher variances to the inventory account instead of the A/P variance account. Screen for batch type V on an inventory account; if present, the fix is at the SOURCE — correct DMAAI 4330 so voucher variances land on the variance account, and restrict posting-time GL-account overrides on the voucher-match version so the account cannot be keyed over again.',
    '- TRANSFER INTEGRITY (IT) is a one-sided item-ledger relief: an inventory transfer relieved value on the cardex and the GL holds no entry for that document, because a leg priced the quantity and never extended it. THE SHAPE IS NARROW, NOT GENERAL: a zero extended cost on a transfer leg is COMMON and harmless, and zero-extended legs occur on the relief and receipt sides in equal numbers, so "the receiving leg" is NOT the discriminator. Only the small fraction of zero-extended legs that ALSO carry a unit cost produces this card. DO NOT call it a named JDE or vendor defect — no article has been cited for it. DO NOT state a cost level or costing method as a property of the pattern: it is cost-level 3 in one verified company and a MIX of cost levels 2 and 3 in another, where two thirds of the documents do not match the unit-cost-without-extension shape at all. IT IS EPISODIC, NOT A STANDING SETUP FAULT: verified across 16 loaded periods in two companies, failures cluster into bursts with long clean stretches between them, and the most recent periods ran clean at normal transfer volume. Per transfer it is rare (worst verified month about 1.7% of that month\'s transfers, whole-window about 0.2%) while the dollars concentrate heavily. So never say "it will not clear on its own" — count the failures per period first, and treat a burst that starts and stops as a cost change or a specific set of items rather than a permanent setup error. Confirm both sides for the document, compare the cost setup of the failing items against items that transferred cleanly in the same period, and note that restoring the lost value is a dollars-only inventory adjustment the ACCOUNTANT books. R41543 / R41544 are NOT the remedy and must NEVER be prescribed for this pattern (owner 2026-08-03, the same ruling that pulled them off Completion Not Journaled). No report is needed to find the rest of the population either: the Transfer Integrity card already holds every one-sided relief.',
    '- MAKE TO ORDER is a business grouping (a work order linked to its customer sales order), not a variance type. Its residual is ordinary manufacturing cardex-vs-GL and is NOT a DMAAI mapping issue (the routings match the 4152 model) and NOT a missing sales offset (the SOs shipped, status 999). Split it by shape: GL-only rows (cardex 0, ledger ≠ 0) are standard-cost variances — EXPECTED, no action; both-sides-differ rows have NO CONFIRMED CAUSE — the cost-basis explanation (completion valued at standard on the cardex vs actual in the GL) was TESTED on a verified population and does NOT fit: a standard-versus-actual gap should be a modest share of the transaction and fall either side of it, but most of the value sits on rows where the gap exceeds HALF the item-ledger amount, and the GL side is the larger one in about two thirds of the rows and the large majority of the value. Do NOT assert the cost-basis cause. The value also concentrates on very few accounts, so direct the analyst to work them by account, largest account first, with cost accounting (5.16). Where a standard cost genuinely did move after a completion posted, WIP revaluation is the mechanism that carries it to the GL, but NEVER state a report number for it — have the analyst confirm the program and version in their own JDE. Cardex-only rows (ledger 0, cardex ≠ 0) are the COMPLETION-GAP shape and belong to the Completion Not Journaled investigation, not to cost work — same physics as that card, grouped here only because usp6_008 stamped this subtype first (5.19). Never work all three shapes as one variance.',
    '- MANUFACTURING GL-CLASS SOURCE: work-order material issues and completions (R31802A) take their GL class from the item BRANCH record (F4102); every OTHER F4111 transaction (adjustments, transfers, PO receipts) uses the item LOCATION record (F41021). RR assigns accounts off F41021, so when the F4102 and F41021 GL classes DIFFER, a manufacturing move (IM / IC / IH) posts to a different account than other movements of the same item — a structural account mismatch that recurs on every work order; fix at the source (align the F4102 / F41021 GL class). A blank F41021 GL class is not special — it resolves through the DMAAI like any class: a specific entry, or the `****` wildcard/default row that covers any class not explicitly set up (blank included). It posts normally when that coverage exists, and only fails to resolve when the DMAAI has neither a specific entry nor a `****` default — the same condition as any GL class.',
    '- MANUFACTURING ACCOUNTING SEQUENCE (authoritative): material issues (IM) and completions (IC) are written to F4111 with NO batch number and NO G/L date. R31802A stamps the batch and G/L date onto those existing F4111 rows and creates the F0911 journal entries in the same step. So a batch and G/L date ABSENT is the literal un-processed state. But a batch number PRESENT means only that R31802A processed the row — it is NOT a guarantee the journal entry was written: R31802A is OBSERVED stamping the cardex batch and writing NO completion entry for a subset of each run. Never infer "the entry therefore exists" from a batch number. R31804 (not R31802A) creates the IV variance entries, and R09801 only updates F0902 — unposted journal entries still exist in F0911.',
    '- COMPLETION NOT JOURNALED is a GENUINE POSTING GAP, not a matching artifact. A completion sits on the cardex with a batch stamped and the GL holds no completion entry for that work order, while the material issues for the SAME order did post. Confirmed by widening the search past the company and the document type and still finding no completion. The finished-goods cost never reached the general ledger: WIP overstated, finished goods understated.',
    '- A HEALTHY BATCH AND A HEALTHY ACCOUNT DO NOT CLEAR IT. The same run\'s other work orders journal their completions normally, on the same account, so "the batch posted fine" and "that account carries completions constantly" are not answers. Confirm PER WORK ORDER, never per batch. These must not LEAD the read either, though they stay the secondary list to rule out because each is real at other sites: summarization dropping the work-order reference, a different document company, an unposted batch, a document type outside completions and issues, and a missed GL data load. Never a work order awaiting the run, held in error, or a run that failed before stamping a batch — those carry no batch and cannot reach this card.',
    '- THE SHAPE: R31802A stamps the cardex batch and writes no completion entry for a slice of EVERY run, spread across order types and batches rather than concentrated in one failed run. Each affected run journals the large majority of its completions and drops a slice, and run conditions move the severity without ever eliminating the failures. That is what makes it a recurrence problem rather than a one-off. NEVER STATE A COUNT, A BATCH TOTAL OR A PERCENTAGE YOU HAVE NOT BEEN GIVEN FOR THIS INSTALL. The card computes recurrence from the rows actually loaded here (periods affected out of periods loaded, rows, distinct batches) and names the window it used; quote those figures and no others. The figures from the original investigation are specimen evidence for ONE dataset, they live in the analysis guide, and repeating them here would assert a number that is false on any other customer.',
    '- NO VENDOR ARTICLE MATCHES IT. Oracle Support KB 420628 is a near miss that was TESTED and RULED OUT: its symptom is the material issue\'s OWN entry missing from F0911, the inverse of this card, where IM is present in volume and only the completion is absent — that failure striking IM would SUPPRESS this card rather than create it. Never cite KB 420628 as a match, never state or invent a vendor remedy, and do NOT claim the article is login-gated (the body was retrieved). Its cause (an issue quantity under 0.0050 blanking the 2-decimal CTS1 on the F3111 part list) and its remedy (manual journal entries) belong to a different condition. UNTESTED and not to be dismissed: whether a blank CTS1 could block only PART of a run\'s output (the completion leg while the issue leg still writes) — RR does not load F3111, so settling it needs a query against the customer\'s own part list.',
    '- PREVENTING IT: have whoever runs R31802A read the error report that run produces. Then take it to Oracle through the CUSTOMER\'S OWN IT DEPARTMENT as an UNDOCUMENTED R31802A condition, explicitly NOT as KB 420628 — naming the wrong article invites a remedy built for a different cause. Do NOT delete unposted manufacturing batches — R31802A has already cleared the unaccounted units, so nothing in JDE regenerates the entry. R41543 has nothing to do with this card: never prescribe it here, and never tell the analyst to work the orders one at a time.',
    '- The BATCH NUMBER is a research handle: it is how you find the document in F0911, and it is NOT evidence the transaction reached the GL. Neither is the PC field, which is the F41112-update flag. Never present either as proof of GL posting.',
    '- Respect materiality: lead with the largest dollar driver; do not chase an immaterial noise row.',
    '- ROLE SPLIT, not a disagreement about the entry: the corrective accounting action for a transaction variance IS a journal entry, and the ACCOUNTANT books it. The ANALYST prevents recurrence. So never argue against the entry — no "not a journal entry", no "a JE only balances the GL this period" — and do not instruct one either. Stay in the analyst\'s lane: what was checked, what the cause is, and the change that stops it coming back.',
    '- THE FINDING IS THE ANALYST\'S INVESTIGATION REPORT to the customer, and it travels to the Audit Center where a third party reads it months later. Write it in three parts under these headings: "What I checked" — one check per bullet, each ending ruled out or confirmed; "What I found" — the exact cause, or if it cannot be pinned down ONE or TWO likely causes said plainly to be unconfirmed; "To stop it recurring" — short bullets. Terse, one idea per bullet, no stacked clauses. Name a table only when the analyst has to go look in it.',
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
 * RRV8.txv — the ONE transaction-variance catalog. Taxonomy AND copy.
 *
 * WHY EVERYTHING LIVES HERE: the taxonomy was split across nine maps in three
 * files, and every one of them was a copy that MUST agree with the others —
 * which is a copy that WILL drift, silently:
 *
 *   config.js                     META, SUBTYPE
 *   home.html                     _TXV_PATTERN, KIND_EXPLAIN, CODE_EXPLAIN
 *   inventory-transactions.html   PATTERN_INFO, the classifyGridRow if-ladder,
 *                                 _TX_PATTERN_NAMES, _TX_CARD_FINDING
 *
 * Each drift shipped as working software. TXI and CNJ were added to Home and
 * never to Details, so the ?card= filter was skipped and the analyst saw every
 * card's rows. Five SubTypes shipped in the DB and were never added to the
 * Details if-ladder, so correctly-classified rows rendered under the wrong
 * card. One pattern carried three different names across three maps. Codes
 * outside CODE_EXPLAIN's six keys fell through to a per-kind sentence reading
 * "these transactions do not fit a known pattern yet" on a card that names a
 * confirmed mechanism (UI-62). None of it threw.
 *
 * So: ONE entry per code, carrying its identity AND every string any surface
 * shows for it. Three sections, one shape:
 *
 *   META     the Home cards. Insertion order IS the Home display order.
 *   GRID     Details-only shapes for rows the server left without a SubType.
 *            Never a Home card (those rows roll into the T-* terminals), so
 *            they carry no `cause`.
 *   SIGNAL   pseudo-codes the Details finding engine selects instead of the
 *            card when the ROWS are definitive (non-stock cost, a confirmed
 *            routing mismatch) or when no card is in scope.
 *
 * Per-entry fields:
 *   title        the ONE name. Every surface shows this string — card header,
 *                scope band, work panel, export filename.
 *   kind         Home chip (rebalance | self | mto | ico | linked | review).
 *   tier         Home lane (linked | single | terminal). The lanes are the
 *                classifier's own phases, and the order of entries WITHIN a lane
 *                is the order usp8_txv_classify claims them. So the Home page
 *                reads top to bottom as the pipeline actually runs: groups form
 *                first, then the single-document claims in precedence order,
 *                then whatever nothing claimed. Moving an entry changes what the
 *                analyst is told runs first -- only move one to match a change in
 *                the procs.
 *   disposition  Details chip (rebalance | expense | self | triage).
 *   cause        Home card body. Short: what happened plus the lever.
 *   desc         Details "What it is". Long form; feeds the card tooltip and
 *                the work panel.
 *   action       Details "Likely fix". Long form, same two consumers.
 *   finding      the structured investigation report the analyst files:
 *                { flag, mech, checked[], found[], fix[], recurrenceIdx?,
 *                  dmaai?, triage? }. See _txFindingText in
 *                inventory-transactions.html for how it renders.
 *
 * Classifiers, also here so no consumer re-implements one:
 *   code(row)      Home: SubType -> code, else transaction Type -> a T-*
 *                  terminal. Every row lands in exactly one code, so the cards
 *                  partition the residual.
 *   gridCode(row)  Details: the duplicate-relief flag, then SubType, then the
 *                  cardex/GL grid shape. Finer than code() only for rows the
 *                  server left unclassified.
 *   Both route through subtypeCode(), which console.warns ONCE per unmapped
 *   SubType. An unmapped SubType used to fall silently into the grid-shape
 *   branch and render under the wrong card; now it is noisy.
 *
 * ADDING A CARD: one META entry, one SUBTYPE entry. Every surface picks it up.
 * A code with no `cause` / no `finding` warns in the console rather than
 * rendering a generic sentence nobody notices.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var META = {
    // ---- SINGLE DOCUMENT (Phase 2) — in usp8_txv_classify claim order ---------
    //      usp8_txv_net runs first (it nets, it does not stamp a card), then
    //      account_mismatch, period_mismatch, and the ten claims inside
    //      usp8_txv_flags. The order below IS that order, read off a run log — a
    //      card earlier in this list has PRECEDENCE over one later, because it
    //      claims first and every claim guards on an unclaimed SubType.
    'ACCT': {
      title: 'Account Mismatch', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The GL posted these documents to a different account than the DMAAI routes to. The item ledger used the right one. Correct the DMAAI for this combination, turn off account entry and override on the version in use, and on sales documents check R42800 PO 5, Business Unit Source.',
      desc: 'Cardex and GL both posted, but the GL side landed on a different account than JDE\'s DMAAI table routes to for this (Order Type, Doc Type, GL Class). Usual causes: the DMAAI itself is wrong for that combination, the item\'s GL class changed after the document posted, or the program version lets the operator key a GL account at entry — the AAI account goes to F4111 while the keyed account goes to F0911.',
      action: 'Correct the DMAAI for this combination. On inventory documents, turn off Allow Entry of GL Account (PO 1) and Allow Override of GL Account (PO 2) on the version in use: either one left on lets the account be keyed over the AAI every time. On sales documents, check R42800 PO 5, Business Unit Source. Re-run the company and period, and corrected documents drop off.',
      finding: {
        dmaai: true,
        flag: 'DMAAI account mismatch',
        mech: 'The GL posted these documents to a different account than the DMAAI directs.',
        checked: [
          'Cardex and GL both posted. Missing entry ruled out.',
          'Period matches on both sides. Cut-off ruled out.',
          'Posted account against the account the DMAAI directs for this order type, doc type and GL class: they differ. Confirmed.'
        ],
        found: [
          'The GL side landed on the wrong account. The item ledger used the account the DMAAI specifies.',
          'Likely cause, not yet confirmed: the DMAAI is set wrong for this combination, or the item’s GL class changed after these documents posted.',
          'Second possibility: the entry program allows an account to be keyed at entry, overriding the DMAAI.'
        ],
        fix: [
          'Correct the DMAAI for this combination.',
          'On inventory documents, turn off Allow Entry of GL Account (PO 1) and Allow Override of GL Account (PO 2) in the version in use.',
          'On sales documents, check R42800 PO 5, Business Unit Source. It drives most systematic sales account mismatches.',
          'Re-run this company and period. Corrected documents resolve to the right account and drop off.'
        ]
      }
    },
    'PER': {
      title: 'Period Mismatch', kind: 'self', tier: 'single', disposition: 'self',
      cause: 'The item ledger and the GL recorded these documents in different months. Set GL Date Source to follow the transaction date, and schedule the batch runs to finish before the period closes.',
      desc: 'The cardex movement and its GL counterpart landed in different months — the document is reported in one period and posted in another. Usual causes: a GL Date Source processing option pointed at the invoice or promised date rather than the item-ledger date, or a batch program (Sales Update, Manufacturing Accounting, the cycle-count update) that ran after the period closed.',
      action: 'Set the GL Date Source option so the GL date follows the item-ledger date — P4312 PO 2 on PO receipts, P4314 PO 2 on voucher match, R42800 PO 1 (Defaults tab) on Sales Update, the GL Date option in R41413 / R41610 on cycle counts. Schedule those runs to complete before the period closes so the two dates cannot straddle a period end. Re-run both periods afterwards: the document should net to zero across the two, and a gap that survives the next close is not a cut-off.',
      finding: {
        flag: 'Period cut-off',
        mech: 'The item ledger and the GL recorded these documents in different months.',
        checked: [
          'Both sides posted, and the amounts agree. Missing entry ruled out.',
          'Accounts agree on both sides. Account mismatch ruled out.',
          'Item-ledger date against GL date: different fiscal periods. Confirmed.'
        ],
        found: [
          'Likely cause, not yet confirmed: a GL Date Source option is set to the invoice or promised date instead of the transaction date.',
          'Second possibility: a batch program ran after the period closed.'
        ],
        fix: [
          'Set GL Date Source to follow the transaction date. PO receipts P4312 PO 2. Voucher match P4314 PO 2. Sales Update R42800 PO 1, Defaults tab. Cycle counts R41413 and R41610.',
          'Schedule those runs to finish before the period closes.',
          'Re-run both periods. The document should net to zero across the two.',
          'A gap still there after the next close is a posting error, not a cut-off.'
        ]
      }
    },
    // DAC-28 — promoted from Comment-only annotations to their own cards.
    'DUP': {
      title: 'Duplicate Sales', kind: 'rebalance', tier: 'single', disposition: 'triage',
      cause: 'The same order line was relieved from inventory twice while the GL booked it once, so the extra item-ledger line is the variance. Either the line was ship-confirmed again after it closed, or Sales Update abended and the re-run wrote the relief a second time.',
      desc: 'The same order line was relieved on the cardex more than once at the same (line, branch, item, location, lot) while the GL booked it once, so the variance equals the duplicated relief. JDE increments the line number for a genuine partial shipment, so a repeated line number is a double relief, not a split. Either the line was ship-confirmed a second time, or an interrupted Sales Update re-ran against a workfile that still held its records.',
      action: 'Reverse the duplicate relief at the source and leave the original. Then establish which case it was, because the preventive change differs. A re-confirmed line means restricting the statuses at which ship-confirm is allowed. An abended Sales Update means recovering its workfile before any re-run, and finding out why it abended. Check next period: a step that fires twice duplicates the next order too.',
      finding: {
        flag: 'Duplicate cardex relief',
        mech: 'The same order line was relieved from inventory twice. The GL booked it once.',
        checked: [
          'Duplicate-sales integrity check flags these orders. Confirmed.',
          'Repeated line number, not an incremented one. JDE increments for a genuine partial, so this is a double relief, not a split shipment.',
          'Variance equals the value of the extra relief. Confirmed.'
        ],
        found: [
          'Inventory was relieved twice for one shipment, so the item ledger is short by that value.',
          'Likely cause, not yet confirmed: the line was ship-confirmed a second time after it closed.',
          'Second possibility: Sales Update abended and the re-run wrote the relief again from a workfile that still held it.'
        ],
        fix: [
          'Reverse the duplicate relief at the source with an inventory adjustment. Leave the original.',
          'If the line was re-confirmed: restrict the statuses at which ship-confirm is allowed.',
          'If Sales Update abended: recover its workfile before any re-run, and find out why it abended.',
          'Check next period. A step that fires twice will duplicate the next order too.'
        ]
      }
    },
    // Two F0911 legs that cancel, neither on the inventory account. LedgerAmount = 0
    // here does NOT mean "no G/L entry" — the entry posted and self-cancelled elsewhere.
    'VCHR': {
      title: 'A/P Voucher on Inventory', kind: 'rebalance', tier: 'single', disposition: 'expense',
      cause: 'A/P vouchers posted to an inventory account instead of the A/P variance account. DMAAI 4330 is routing voucher variances into inventory. Correcting that route stops it; restricting account overrides on the voucher-match version keeps it corrected.',
      desc: 'A/P voucher variance posted to an inventory account instead of the A/P variance account — DMAAI 4330 routes inventory items there. A voucher moves no inventory, so there is no item-ledger side to match against; the whole amount is the variance.',
      action: 'Check DMAAI 4330 for this company and GL class. Correct the route so voucher variances land on the variance account, then restrict who can override the GL account on the voucher-match version. The value already posted stays in the inventory account until the accountant reclassifies it out.',
      finding: {
        dmaai: true,
        flag: 'Voucher on inventory account',
        mech: 'A/P vouchers posted to an inventory account instead of the A/P variance account.',
        checked: [
          'Batch type on these documents: V, an A/P voucher. Confirmed.',
          'Account posted to: an inventory account. Confirmed.',
          'Item-ledger side: nothing. A voucher moves no inventory, so there is nothing to match.'
        ],
        found: [
          'DMAAI 4330 is sending voucher variances to inventory for this company and GL class.',
          'Alternative, if 4330 reads correctly in JDE: the account was overridden at posting time.'
        ],
        fix: [
          'Correct DMAAI 4330 so voucher variances land on the variance account.',
          'Restrict who can override the GL account on the voucher-match version, or route those overrides through approval.',
          'Put the next voucher through and confirm its variance lands off inventory.'
        ]
      }
    },
    'TXI': {
      title: 'Transfer Integrity', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'Location transfers relieved inventory value the GL never recorded: a leg carried a unit cost but never extended it, so a move that should be value-neutral destroyed inventory value. A zero extended cost on a transfer leg is common and harmless on its own; it is the unit-cost-without-extension combination that lands a document here. It arrives in bursts rather than every period, so read the periods either side before calling the setup still wrong.',
      desc: 'An inventory-transfer (IT) document relieved value on the cardex (F4111) that the GL never recorded — a leg carried a unit cost but a zero extended cost, so a move that should be value-neutral destroyed inventory value. The shape is narrow: a zero extended cost on a transfer leg is common and harmless, and zero-extended legs appear on the relief and receipt sides in equal numbers, so it is the unit-cost-without-extension combination that lands a document here. No vendor article has been cited for it, so do not name it as a known defect.',
      action: 'Confirm each document on both sides first: the item-ledger legs against the GL for the same document. Then compare the cost setup of the failing items against items that transferred cleanly in the same period — that difference is the lead. Count the failures per period before treating the setup as still wrong: this arrives in bursts with clean stretches between them, so a recent clean period at normal transfer volume points at a cost change or a specific set of items rather than a permanent setup fault. This card already holds every one-sided relief, so it is the population. Restoring the lost value is a dollars-only adjustment the accountant books.',
      finding: {
        flag: 'Item-ledger integrity',
        mech: 'Location transfers relieved inventory value that the GL never recorded.',
        checked: [
          'A location move should be value-neutral and post no GL. These relieved value with no GL entry. Confirmed.',
          'Both legs of each document are present in the item ledger. A missing leg is ruled out.',
          'Extended cost on the legs: a leg carries a unit cost and no extended value, so the value never calculated. Confirmed on the documents on this card.',
          'DMAAI routings on these documents resolve correctly. Mapping ruled out.'
        ],
        found: [
          'A leg priced the quantity and never extended it, so the move destroyed inventory value the GL never saw.',
          'Cause not confirmed, and the shape is narrow rather than general: a zero extended cost on a transfer leg is common and harmless, and only a small fraction of those legs also carry a unit cost. That combination is what lands a document here.',
          // recurrenceIdx points here — replaced at render with the count from the
          // loaded rows (UI-59). This general form must state no figure, because
          // the burst pattern verified on two companies is not a universal rate.
          'It arrives in bursts, not every period. Read the periods either side before calling it a standing fault: a recent clean period at normal transfer volume means the trigger stopped, which is a different problem from a setup that is still wrong.'
        ],
        recurrenceIdx: 2,
        fix: [
          'Compare the cost setup of the items on this card against items that transferred cleanly in the same period. That difference is the lead.',
          'Confirm each document on both sides: the item-ledger legs against the GL for the same document.',
          'This card already holds every one-sided relief. It is the population; there is nothing else to run to find them.',
          'Check the periods either side and count the failures per period. A burst that starts and stops points at a cost change or a specific set of items rather than a permanent setup fault.',
          'Restoring the lost value is a dollars-only inventory adjustment, which the accountant books.'
        ]
      }
    },
    // Mfg completion on the cardex with NO completion entry in the GL — a
    // genuine posting gap. R31802A stamps the cardex batch and drops a slice of
    // EVERY run's completions (SPECIMEN figures, ONE dataset, do NOT ship them
    // as copy: 58 batches / 8 periods, none clean, none empty, 0.6%-24.6% per
    // batch — the card computes its own from the loaded rows, see UI-59);
    // the same run's other orders journal fine, so a healthy batch/account
    // doesn't clear it. NO vendor article matches it — KB 420628 is a near miss
    // ruled out on shape (its failure drops the IM entry, which would SUPPRESS
    // this card). No repost exists. Specimen evidence lives in the guide.
    'CNJ': {
      title: 'Completion Not Journaled', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'Work-order completions received finished goods into inventory with no GL entry for them, while the material issues for the same orders did post. Manufacturing accounting stamped the item ledger and wrote no entry. The pattern is a run that journals most of its completions and drops a slice, at a severity that moves from run to run; the card states the recurrence across your loaded periods. No Oracle Support article matches the shape. The fault is in the run, not these orders.',
      desc: 'A work-order completion received finished goods into inventory with no GL entry for it. The material issues for the same order did post. Manufacturing accounting stamped the batch on the item-ledger row, so it processed the row and wrote no entry. The batches and the account are healthy: both carry completions for many other orders. The pattern is a run that journals most of its completions and drops a slice, never a whole run failing outright, at a severity that moves from run to run. The finding below states the recurrence measured across the periods loaded here. No Oracle Support article matches the shape; KB 420628 is a near miss whose failure drops the material issue entry, which would suppress this card rather than create it.',
      action: 'Confirm in three checks. Search the GL for the work order: issues present, completion absent. Widen the search, no company or document-type restriction: still no completion. Check that the same batch and account carry completions for other orders: if they do, the gap is real. Then have whoever runs R31802A read the error report that run produces. Take it to Oracle through IT as an undocumented R31802A condition, not as KB 420628 — that article has a different cause and its manual-journal-entry remedy does not fit. Do not delete an unposted manufacturing batch, because nothing regenerates the entry.',
      finding: {
        flag: 'Completion missing from the GL',
        mech: 'Work-order completions received finished goods into inventory with no GL entry for them.',
        checked: [
          'Every completion on this card: no GL completion entry for the work order. Not under this company, not under any company, not under any document type.',
          'Material issues for the same work orders: present in the GL. So the orders did go through manufacturing accounting.',
          'The batches involved: they carry completion entries posting normally for other work orders. Batches are fine.',
          'The account these sit on: it carries completion entries for many other orders in the same batches. Account and AAI are fine.',
          'Work-order reference on those other entries: present. Summarized entries ruled out.',
          'Posting status: posted. Unposted batch ruled out.',
          'Document company: matches the item ledger. Mismatch ruled out.',
          'Our GL copy: the batches are all present. Missed data load ruled out.'
        ],
        found: [
          'The GL completion entries were never written for these work orders. The material issues for the same orders were.',
          'Manufacturing accounting stamped the batch on the item-ledger rows, so it processed them and wrote no entry.',
          // recurrenceIdx points here. Replaced at render with the count from the
          // loaded rows (UI-59). This general form stands only when the loaded
          // window is too short to evidence recurrence either way — it must not
          // state a figure, because the figure differs per install.
          'Read the periods either side before treating this as a one-off. The pattern is a run that journals most of its completions and drops a slice, at a severity that moves from run to run.',
          'A batch that posted most of its completions is not evidence this order posted. Confirm per work order, never per batch.',
          'No Oracle Support article matches this. KB 420628 is the near miss, ruled out on shape: its failure drops the material issue entry, which would suppress this card rather than create it.'
        ],
        recurrenceIdx: 2,
        fix: [
          'Have whoever runs R31802A read the error report that run produces.',
          'Take it to Oracle through IT as an undocumented R31802A condition, not as KB 420628. That article has a different cause, and its manual-journal-entry remedy does not fit this.',
          'Do not delete an unposted manufacturing batch. The unaccounted units are already cleared, so nothing regenerates the entry.'
        ]
      }
    },
    // The sales-side analog of CNJ: cardex relieved inventory, a batch is stamped, and
    // F0911 holds NOTHING for the document under ANY doc type. Not posted elsewhere and
    // not posted in another period — absent. An UNPOSTED batch is not this (RR loads
    // unposted F0911, so an unposted entry SUPPRESSES the card and surfaces as the
    // separate GL Batches variance).
    // ⚠ WITHDRAWN SERVER-SIDE (DB PR #97). This card CANNOT currently fire and the copy
    // below describes behaviour that is no longer produced. Verified 2026-08-06: the
    // SubType is absent from usp8_txv_flags (the only proc that emits SubTypes), and
    // zero rows carry it on Demo1, Demo2 or Demo3. The entry is retained deliberately so
    // that a stale database still emitting it renders a titled card rather than the bare
    // string 'SNJ' — do NOT treat its presence here as evidence the claim is live.
    // WHY it was withdrawn, and the part that matters for whatever replaces it: the test
    // asked "is there an F0911 row for this DocNumber". Sales doc type JS posts internal
    // GL document numbers, so that question answers no regardless of truth. The rows it
    // held on Demo3 are order type SA, sample and lab issues out of sample locations,
    // which relieve the cardex and journal nothing. See transaction-detail-analysis.md
    // Section 5.22 and WORKLIST AN-11. The successor claim keys on ORDER TYPE plus
    // location, never on document type.
    'OFF': {
      title: 'Offsetting GL Entries', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'The GL posted two entries that cancel each other and neither reached the inventory account, so the document nets to zero in the GL while inventory came off the item ledger. Nothing shows on the P&L — only the balance sheet moves, which is why it went unnoticed. Correct the DMAAIs for this order type and document type so one side lands on the inventory account.',
      desc: 'Two F0911 legs for the same document, equal and opposite, both posted, in the same batch as the item ledger — and neither on the inventory account the item ledger used. LedgerAmount nets to zero, which does NOT mean the GL entry is missing: it posted and cancelled itself somewhere else. The order line type is stock, so a GL entry against inventory was due.',
      action: 'Correct the DMAAIs for this order type and document type so one side lands on the inventory account. Check the other order types sharing those DMAAIs before assuming this one is isolated. The accountant restores the inventory account for the documents already posted. Re-run this company and period: a document that comes back was not corrected.',
      finding: {
        flag: 'Entries that cancel',
        mech: 'The GL posted two entries that cancel each other, and neither one reached the inventory account.',
        checked: [
          'The GL for each document: two entries, both posted, in the same batch as the item ledger. Nothing failed to post.',
          'The two amounts: equal and opposite. They cancel, so the document nets to zero in the GL.',
          'The accounts they landed on: two accounts, neither of them the inventory account the item ledger used.',
          'The order line type: stock. A stock line is due a GL entry against inventory, so this is not an expected non-stock case.',
          'The batches: healthy. Each holds a few hundred other documents that posted normally.'
        ],
        found: [
          'Inventory came off the item ledger. The GL never touched the inventory account for it.',
          'The two entries cancel, so your profit and loss shows nothing. Only the balance sheet moves, and it is out by the full item-ledger amount.',
          'That is why this went unnoticed. There is no profit-and-loss signal for anyone to review.',
          // recurrenceIdx points here.
          'Read the periods either side before treating this as a one-off.',
          'The DMAAIs for this order type are sending both sides of the entry to a pair of accounts that offset each other, instead of to inventory and its counterpart.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Correct the DMAAIs for this order type and document type so one side lands on the inventory account.',
          'Check the other order types that share those DMAAIs before assuming this one is isolated.',
          'The accountant restores the inventory account for the documents already posted.',
          'Re-run this company and period. A document that comes back was not corrected.'
        ]
      }
    },
    // The non-stock line cost ties to the variance and sits in an inventory account.
    // A correction IS required: F0911 does not tie to F4111. The lever is the item's
    // G/L class, NOT the non-stock DMAAI (that entry is correct).
    'NSL': {
      title: 'Non-Stock Sales Lines', kind: 'rebalance', tier: 'single', disposition: 'rebalance',
      cause: 'A non-stock line posted its cost to an inventory account, and that cost accounts for the whole variance to the penny. The non-stock account instruction is correct — the GL class carried on those lines is a stock class, and that is what resolves to inventory. Correct the GL class on the items.',
      desc: 'A non-stock line posted its GL cost to an inventory account, and the non-stock extended cost ties exactly to the variance, either on the document or across the order. The non-stock DMAAI itself points away from inventory, so it is not the fault: the GL class carried on the non-stock lines is a stock item class, and that is what resolves to inventory. A non-stock item holds no inventory, so the value does not belong there.',
      action: 'Correct the GL class on these items so a non-stock line stops resolving to the inventory account. Do not change the non-stock DMAAI — it already points at the right account. Check whether other non-stock line types carry the same overridden class before assuming these items are the only ones. The accountant reclassifies the value already posted out of the inventory account. Re-run this company and period: a document that comes back was not corrected.',
      finding: {
        flag: 'Non-stock cost in inventory',
        mech: 'A non-stock line posted its cost to an inventory account. The non-stock cost accounts for the whole variance.',
        checked: [
          'The order lines: one or more are non-stock. A non-stock line posts to the GL and moves no inventory, so no item-ledger row exists for it.',
          'The non-stock cost against the variance: they tie exactly, either on this document or across the order.',
          'The account the GL used: the inventory account.',
          'The non-stock DMAAI itself: correct. It points away from inventory, so it is not the fault.',
          'The GL class carried on the non-stock lines: a stock item class, not the non-stock class. That is what resolves to inventory.'
        ],
        found: [
          'The variance is the non-stock cost, to the penny. The cause is identified.',
          'Non-stock cost is sitting in an inventory account. A non-stock item holds no inventory, so it does not belong there.',
          'Your GL inventory balance is overstated against the item ledger by exactly this amount, on every order carrying a non-stock line.',
          // recurrenceIdx points here.
          'Read the periods either side before treating this as a one-off.',
          'This is not a leave-it row. The two sides do not tie, so it needs a correction.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Correct the GL class on these items so a non-stock line stops resolving to the inventory account.',
          'Do not change the non-stock DMAAI. It is already pointing at the right account, and changing it will not fix this.',
          'The accountant reclassifies the non-stock value already posted out of the inventory account.',
          'Check whether other non-stock line types carry the same overridden class before assuming these items are the only ones.',
          'Re-run this company and period. A document that comes back was not corrected.'
        ]
      }
    },
    // Every line on the order is non-stock (F40205 Inventory Interface 'N'), so no
    // cardex row was ever due and GL-only is correct processing. Sibling of NSL and
    // deliberately separate: NSL needs the non-stock cost to TIE to the variance, and a
    // CHARGE line has no extended cost to tie with, so NSL never reaches these.
    'XBC': {
      title: 'Cross-Batch Completion', kind: 'review', tier: 'single', disposition: 'triage',
      cause: 'Completions journaled in a later batch than the one stamped on the item ledger. Matched by work order rather than by batch, these tie exactly — a work order issues material over weeks in separate batches and completes later in its own. Confirm one document with the batch ignored, then close the card. Posting an entry would create the shortfall it looks like.',
      desc: 'The completion was journaled in a later batch than the one stamped on the item ledger, so a comparison that pairs the two sides within a batch shows a gap. Regrained to (work order, account, doc type) across every batch and period, the two sides agree to the penny. A work order issues material over weeks, each issue in its own batch, and the completion is not generated until the product is finished — days or weeks later, in a batch of its own. Not a variance.',
      action: 'Confirm on one document before dismissing the rest: the item-ledger completion against F0911 for the same work order, ignoring the batch. Then close the card — no journal entry and no source fix. Reading it as a shortfall and posting an entry would create the error it looks like. If the count grows period over period, the correlation grain is what to raise, not the transactions.',
      finding: {
        flag: 'Ties at work-order grain',
        mech: 'The completion was journaled in a later batch than the one stamped on the item ledger.',
        checked: [
          'An F0911 completion exists for this work order on this account. Confirmed.',
          'Regrained to work order, account and doc type across every batch and period, the two sides agree to the penny. Confirmed.',
          'Batch present on the item-ledger row, so R31802A ran and wrote the journal in the same step.'
        ],
        found: [
          'Not a variance. A work order issues material over weeks, each issue in its own batch, and the completion is not generated until the product is finished — days or weeks later, in a batch of its own.',
          'It appears here because the comparison pairs the two sides within a batch. Match by work order and it ties.',
          'Nothing to correct on the transaction. Reading it as a shortfall and posting an entry would create the error it looks like.'
        ],
        fix: [
          'Confirm on one document before dismissing the rest: the item-ledger completion against F0911 for the same work order, ignoring the batch.',
          'No journal entry. No source fix. Close the card.',
          'If the count grows period over period, the correlation grain is the thing to raise, not the transactions.'
        ]
      }
    },
    // Journaled, same account, amount DIFFERS at work-order grain. The population CNJ
    // explicitly hands off ("completion posted, amount differs") and nothing implemented
    // until now. Still a tie-out failure: a correction IS required. Usual driver is a
    // cost basis that moved between the cardex write and the R31802A run — and F4111
    // ordered by ilukid IS the unit-cost history, since JDE has no cost-history table.
    'MCM': {
      title: 'Mfg Cost Mismatch', kind: 'review', tier: 'single', disposition: 'expense',
      cause: 'A GL completion exists for the work order on the same account and the amount disagrees with the item ledger. The cost basis behind the journal is not the one behind the ledger row. Order the item and branch by the ledger sequence to find the cost step — the item ledger is the cost history, and an adjustment journals as a zero-quantity row carrying the delta. Prevention is sequencing: cost the item before it is issued.',
      desc: 'The item ledger and the GL valued the same completion quantity at different unit costs. The variance is quantity times the difference. The usual driver is a cost that moved between the item-ledger write and the accounting run: a frozen cost update moved the standard after the completion posted and WIP revaluation never carried it through. WIP revaluation is optional under standard costing, needs the variance AAI configured for the routing, and skips work orders already closed.',
      action: 'Confirm the gap is actually a cost-basis difference before treating it as one: it should be a modest share of the transaction and fall either side of it. A gap exceeding half the item-ledger amount, or running one direction across the population, is a different problem. Order the item and branch by the ledger sequence to find the cost step — the item ledger IS the cost history, and a cost adjustment journals as its own zero-quantity row carrying the delta, not the new cost. Then have WIP revaluation run as part of the cost update so the next roll reaches the GL as well as the item ledger — confirm the program and version in this customer JDE rather than assuming a report number. Confirm the variance AAI, 3240 or 3260, is configured for the routings in use. Closed work orders are outside its reach, so time cost rolls against the open population.',
      finding: {
        flag: 'Does not tie',
        mech: 'A GL completion exists on this account for the work order and the amount disagrees with the item ledger.',
        checked: [
          'An F0911 completion exists for the work order on this account, so the completion-gap shape is ruled out.',
          'Compared at work-order grain across every batch and period, not within a batch. The amounts still differ.',
          'Issues and completions compared separately: the completion carries labor and overhead out of WIP and the issue does not, so the two never net against each other.'
        ],
        found: [
          'The cost basis behind the journal is not the cost basis behind the item-ledger row.',
          'The usual driver is a cost that moved between the item-ledger write and the accounting run. The item ledger itself is the cost history — read the unit cost transaction by transaction and the steps are the changes.',
          'A cost adjustment journals as its own zero-quantity ledger row carrying the DELTA, not the new cost. Read it that way or the arithmetic will not close.'
        ],
        fix: [
          'Order this item and branch by the ledger sequence and find the step. Compare the cost in force when the transaction was written against the cost the journal used.',
          'A correction is required — the GL does not tie to the item ledger, and naming the cause is not the same as leaving it.',
          'Prevention is sequencing: cost the item before it is issued, and keep a cost update from landing between a transaction and the run that journals it.'
        ]
      }
    },
    // AAI 3110 (raw-material relief) and 3130 (finished-goods receipt) resolving to the
    // SAME account, so both legs of every work order land there and cancel; 3120 (WIP)
    // unconfigured, so there is no holding leg to offset against. The analyzer's own
    // 'nz' net-zero pattern. CONFIGURATION, not transaction: no journal entry fixes it
    // and every future period reproduces it until the AAIs are split.
    'NZR': {
      title: 'DMAAI Net Zero', kind: 'review', tier: 'single', disposition: 'rebalance',
      cause: 'Raw-material relief and finished-goods receipt resolve to the same account, so both legs of every work order cancel there and the movement never happens in the GL. Work in process is unconfigured, so there is no offsetting leg. Split the account instructions into three distinct accounts, judged by their instruction rather than their description. This reproduces every period until the setup changes; no journal entry ends it.',
      desc: 'DMAAI 3110 (raw-material relief) and 3130 (finished-goods receipt) resolve to ONE account for these order types and GL classes, so both legs of every work order land there and cancel. 3120 (work in process) is not configured, so there is no holding leg to offset against. The transactions themselves are ordinary — nothing is wrong with the documents. It is silent by construction: the postings cancel, so nothing shows on the P&L and only the balance sheet is wrong. Configuration, not transaction.',
      action: 'Split the account instructions into three distinct accounts: 3110 to raw material, 3130 to finished goods, 3120 to work in process. Judge the accounts by their instruction, not by their name — an account described as work in process may be the declared inventory account for thousands of items. The accountant restates the affected balances once the routing is correct. This reproduces every period until the setup changes, and no journal entry ends it.',
      finding: {
        flag: 'Account setup, not a transaction',
        mech: 'Raw-material relief and finished-goods receipt resolve to the same account, so both legs land there and cancel.',
        checked: [
          'DMAAI 3110 and 3130 resolve to one account for these order types and GL classes. Confirmed against the account instructions, not the account description.',
          'DMAAI 3120 is not configured, so there is no work-in-process leg to offset against.',
          'The transactions themselves are ordinary. Nothing is wrong with the documents on this card.'
        ],
        found: [
          'Both sides of every work order post to a single account and net there, so the movement between raw material and finished goods never happens in the GL.',
          'It is silent by construction: the postings cancel, so nothing shows on the P&L and only the balance sheet is wrong.',
          'This reproduces every period until the setup changes. No journal entry ends it.'
        ],
        fix: [
          'Split the account instructions: 3110 to raw material, 3130 to finished goods, 3120 to work in process. Three distinct accounts.',
          'Judge the accounts by their instruction, not by their name. An account described as work in process may be the declared inventory account for thousands of items.',
          'The accountant restates the affected balances once the routing is correct.'
        ]
      }
    },
    'NCL': {
      title: 'Non-Stock Charge Lines', kind: 'rebalance', tier: 'single', disposition: 'triage',
      cause: 'Every line on the order is non-stock, so the GL posts and inventory never moves. GL-only is correct processing here, not a gap. Confirm the line types on one order; if these should not reach an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction.',
      desc: 'Every line on the order resolves to an F40205 Inventory Interface of N, so no item-ledger row was ever due and GL-only is what correct processing looks like. Separate from the non-stock sales card: that one matches when the non-stock cost equals the variance, and a charge line carries no extended cost to match with. The tie-out still fails, so the balance may need restating even though nothing is wrong with the transaction.',
      action: 'Confirm the line types on one order against F40205 rather than inferring from the line-type letters. If these should not be reaching an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction. Otherwise there is no action on the transaction, and the accountant decides whether the balance needs restating.',
      finding: {
        flag: 'No item-ledger row was due',
        mech: 'Every line on the order is non-stock, so the GL posts and inventory never moves.',
        checked: [
          'Line type on every line resolves to an Inventory Interface of N. Confirmed against F40205, not inferred from the line-type letters.',
          'No item-ledger row exists for these documents, which is correct for a non-stock line rather than a gap.',
          'Separate from the non-stock sales card: that one matches when the non-stock cost equals the variance, and a charge line carries no extended cost to match with.'
        ],
        found: [
          'GL-only is what correct processing looks like for these lines. The line type is the first question on any GL-only row and it answers this one.',
          'Where the charge is a customer-specific process, the card names it and stops. There is no source fix to chase.'
        ],
        fix: [
          'Confirm the line types on one order before accepting the rest.',
          'If these should not be reaching an inventory account at all, the lever is the GL class on the line, not the non-stock account instruction.',
          'Otherwise no action on the transaction. The tie-out still fails, so the accountant decides whether the balance needs restating.'
        ]
      }
    },
    // IT cardex-integrity — cost-component setup fix at the source.
    'SNJ': {
      title: 'Sales Not Journaled', kind: 'review', tier: 'single', disposition: 'rebalance',
      cause: 'Inventory was relieved on the item ledger with a batch stamped, and the GL holds nothing for the document under any type. Absent rather than misrouted or misdated. Read the error report from the run that stamped these documents; a document that returns next period was not fixed.',
      desc: 'The item ledger relieved inventory with a batch stamped on the row, and F0911 holds nothing for the document under its own type or any other. Absent, not misrouted and not misdated — searching other accounts and other periods will not find it. An unposted batch is NOT this case: RR loads unposted F0911, so an unposted entry suppresses this card and surfaces as a GL batch variance instead.',
      action: 'Read the error report from the run that stamped these documents, starting with the earliest. Confirm on one document first: the item-ledger relief against F0911 for that document number, with no account or period filter. The accountant books the missing value; the source fix is whatever the run report shows, and a document that comes back next period was not fixed.',
      finding: {
        flag: 'No GL entry exists',
        mech: 'Inventory was relieved on the item ledger with a batch stamped, and the GL holds nothing for the document.',
        checked: [
          'F0911 searched for this document under its own type and under every other type. Nothing.',
          'Batch present on the item-ledger row, so the update that stamps it ran.',
          'Not an unposted batch — unposted entries are loaded and would suppress this card. That break surfaces as a GL batch variance instead.',
          'Order lines still open rather than completed, which is where to start.'
        ],
        found: [
          'The item ledger recorded the relief and the GL never received it, so inventory is understated against the ledger by the full value.',
          'Absent, not misrouted and not misdated. Searching other accounts and other periods will not find it.'
        ],
        fix: [
          'Read the run that stamped these documents and its error report, starting with the earliest.',
          'Confirm on one document first: the item-ledger relief against F0911 for that document number, with no account or period filter.',
          'The accountant books the missing value. The source fix is whatever the run report shows, and a document that comes back was not fixed.'
        ]
      }
    },
    // BATCH CANNOT AGGREGATE MANUFACTURING AMOUNTS (owner ruling 2026-08-05). A work
    // order issues material over weeks, each issue in its own batch, and the IC is not
    // generated until the product is complete — days or weeks later, in its own batch.
    // Regrained to (work order, account, doc type) these tie to the penny, so the row is
    // NOT a variance: it is the batch key stranding a completion journaled in a later
    // run. Claimed rather than suppressed so the analyst is told why it appeared.
    // ---- LINKED TRANSACTIONS (Phase 0-1) — grouped before anything is claimed -
    //      usp8_txv_build stamps Make to Order and Intercompany and assigns every
    //      groupcode; usp8_txv_group then disposes each group WHOLE. These form
    //      first, so their rows never reach the single-document claims below.
    'MTO': {
      title: 'Make to Order', kind: 'mto', tier: 'linked', disposition: 'triage',
      cause: 'Make-to-order work orders, grouped with their customer sales orders. Not one variance type: the residual splits into expected standard-cost variances, completions where both sides carry value and disagree, and completions with no GL entry at all. The three need different work, and the middle slice no longer has a confirmed cause. Drill in for the counts and dollars per shape.',
      desc: 'A work order linked to its customer sales order — a business grouping, not one variance type. The residual is ordinary manufacturing cardex-vs-GL and splits three ways by shape: GL-only standard-cost variances, both-sides-differ completion cost differences, and cardex-only completions the GL holds no entry for. Account mapping is not the mechanism here.',
      action: 'Work the shapes separately. Both-differ rows have no confirmed cause: the gap is too large a share of the transaction and too one-directional for the cost-basis story, so take them by account, largest account first, with cost accounting. Item-ledger-only rows are completions missing from the GL, which is a run-level fault, not these orders, and they belong in the completion-gap workflow. GL-only rows need no action. Match by work order, not document number.',
      finding: {
        flag: 'Cost shape — work the largest',
        mech: 'Make-to-order work orders. A business grouping, not one variance type — the residual splits three ways by shape.',
        checked: [
          'DMAAI routings resolve to the same account as the item-ledger model. Mapping ruled out.',
          'Sales orders shipped and closed. A missing sales offset is ruled out.',
          'Each row sorted by which side carries a value: GL only, both differ, or item ledger only.',
          'On the both-differ rows, the size of the gap against the size of the transaction, and the direction of the gap. Both come back wrong for a cost-basis difference.'
        ],
        found: [
          'This is three different problems under one grouping, so do not work it as one. The shape split above is the finding.',
          'GL-only rows are standard-cost variance components. They belong in the GL. Explained, no action.',
          'Item-ledger-only rows are the completion-gap shape: a completion on the cardex with no GL entry for the order. That is the Completion Not Journaled investigation, not cost work, and it is grouped here only because the make-to-order claim reached these rows first.',
          // recurrenceIdx points here.
          'Read the periods either side before treating any slice as a one-off.',
          'Both-differ rows do NOT fit a cost basis difference, which is what this card used to assert. A standard-versus-actual gap is a modest slice of the transaction and falls either side of it. Here most of the value sits on rows where the gap exceeds HALF the item-ledger amount, and the GL side is the larger one in roughly two thirds of the rows and the large majority of the value. Cause NOT confirmed.',
          'The both-differ value also concentrates on very few accounts rather than spreading across the card, so one account will explain most of it.'
        ],
        recurrenceIdx: 3,
        fix: [
          'Split the card by shape first and route each slice separately. Working it as one variance is what makes it unworkable.',
          'Take the both-differ rows by account, largest account first, with cost accounting. The concentration means the top account is most of the answer.',
          'Do not carry the old cost-basis story into that conversation. The gap is too large a share of the transaction and too one-directional for it, so the question is open.',
          'Where a standard cost did move after a completion posted, WIP revaluation is the mechanism that carries it to the GL. Confirm the program and version in this customer JDE rather than assuming a report number, then have it run as part of the cost update.',
          'Send the item-ledger-only rows to the completion-gap workflow instead. Cost accounting cannot act on a missing GL entry.',
          'Match item ledger to GL by work order, not document number. Manufacturing accounting assigns its own GL document number.'
        ]
      }
    },
    'ICO': {
      title: 'Intercompany Sales', kind: 'ico', tier: 'linked', disposition: 'rebalance',
      cause: 'Intercompany orders whose selling and buying legs have not offset. Confirm the matching leg posted in the counterpart company, and compare against the prior period to tell a pair that clears from one that is stuck.',
      desc: 'An intercompany order (OK/SK) where the selling and buying companies\' inventory legs haven\'t fully offset — a three-document timing gap across the two companies\' books.',
      action: 'Verify the matching leg posted in the counterpart company; the pair nets once both sides complete, and a leg that never arrives is chased in the counterpart company rather than adjusted on this side. Why a pair persists past both companies\' closes is not yet determined — establish it before changing anything upstream: compare the same orders against the prior period to separate a self-clearing pair from a stuck one, and use the batch number on the row as the join key for the F0911 search in the counterpart company.',
      finding: {
        flag: 'Counterpart leg',
        mech: 'Intercompany orders whose selling and buying inventory legs have not offset.',
        checked: [
          'Both companies are in scope on the same order. Confirmed.',
          'This company’s leg posted. Confirmed.',
          'DMAAI routings on these documents resolve correctly. Mapping ruled out.'
        ],
        found: [
          'One side of the pair is missing or late, so the two legs do not net.',
          'Cause not confirmed. Most likely the counterpart company’s leg simply has not posted yet, which clears on its own.',
          'Second possibility: the counterpart document was never created, which does not clear.',
          'To tell them apart: compare the same orders against the prior period. A pair that persists is the second case.'
        ],
        fix: [
          'Confirm the matching leg posted in the counterpart company.',
          'Where a leg is missing, trace the document in that company using the batch number on this row. Do not adjust this side.',
          'Re-check next period. A pair still open after both companies close is a posting failure, not timing.'
        ]
      }
    },
    //      Transfers and Direct Ship — 2 documents, 1:1 SO<->PO.
    'TRF': {
      title: 'Transfer Orders', kind: 'linked', tier: 'linked', disposition: 'rebalance',
      cause: 'Inter-branch transfers whose shipping and receiving legs have not met — different periods, or the receiving branch carrying the shipping cost. A second case lands here too: Sales Update abends and the re-run duplicates the item-ledger relief while the GL posts once.',
      desc: 'An inter-branch transfer (ST/OT) whose shipping and receiving legs posted to inventory in different periods or at different costs — the two sides haven\'t met yet. A second signature lands on this card too: a duplicated cardex relief, where Sales Update (R42800) abends, its workfile keeps the records, and the re-run writes the F4111 relief twice while the GL posts once.',
      action: 'Confirm both legs posted. Where the cost differs, the receiving branch is carrying the shipping cost, so correct the receiving cost at the source. Where the relief is duplicated, find out why Sales Update abended and recover its workfile before any re-run. Confirm both branch plants sit in the same company: a cross-company move belongs on the intercompany flow. Re-check next period, since a pair still open after both legs posted is a cost difference, not timing.',
      finding: {
        flag: 'Leg pairing',
        mech: 'Inter-branch transfers whose shipping and receiving legs have not met.',
        checked: [
          'Shipping leg posted. Confirmed.',
          'Receiving leg: check whether it posted, and at what cost.',
          'DMAAI routings on these documents resolve correctly. Mapping ruled out.',
          'Item ledger for a duplicated relief: if the relief appears twice, this is the duplicate case below, not a pairing gap.'
        ],
        found: [
          'Cause not confirmed. Two likely causes, and they need different fixes.',
          'The legs landed in different periods or at different costs, so the receiving branch is carrying the shipping cost.',
          'Or Sales Update abended and the re-run wrote the item-ledger relief a second time while the GL posted once. A known JDE quirk.'
        ],
        fix: [
          'Where the cost differs: correct the receiving cost at the source.',
          'Where the relief is duplicated: find out why Sales Update abended, and recover its workfile before any re-run.',
          'Confirm both branch plants sit in the same company. A cross-company move belongs on the intercompany flow, and forcing it through a transfer order leaves the in-transit account permanently out.',
          'Re-check next period. A pair still open after both legs posted is a cost difference, not timing.'
        ]
      }
    },
    'DS': {
      title: 'Direct Ship', kind: 'linked', tier: 'linked', disposition: 'rebalance',
      cause: 'Direct-ship orders whose sales and purchase legs have not offset. Confirm both legs posted and compare their costs, then compare against the prior period to tell a pair that clears from one that is stuck.',
      desc: 'A direct-ship order (transship) — the sales order and its linked purchase order ship straight to the customer, and the two legs haven\'t fully offset yet.',
      action: 'Confirm both legs posted and compare the purchase cost against the sales relief. The pair nets once both land in the same period at the same cost. Why a pair persists instead of clearing is not yet established, so do not change anything upstream first. Compare the same orders against the prior period, and trace whichever leg is short using its batch number.',
      finding: {
        flag: 'Leg pairing',
        mech: 'Direct-ship orders whose sales and purchase legs have not offset.',
        checked: [
          'Sales leg posted. Confirmed.',
          'Purchase leg: check whether it posted, and at what cost.',
          'DMAAI routings on these documents resolve correctly. Mapping ruled out.'
        ],
        found: [
          'The two legs have not met, so they do not net.',
          'Cause not confirmed. Most likely the legs landed in different periods, which clears on its own.',
          'Second possibility: the purchase cost and the sales relief differ, which does not clear.',
          'To tell them apart: compare the purchase cost against the sales relief, and compare the same orders against the prior period.'
        ],
        fix: [
          'Confirm both legs posted and compare their costs.',
          'Where a leg is short, trace it using the batch number on this row.',
          'Re-check next period. A pair still open after both legs posted is a cost difference, not timing.'
        ]
      }
    },
    // ---- NOTHING CLAIMED THESE (Phase 3) — the residual, split by type -------
    'T-SALES': {
      title: 'Unclassified — Sales', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Sales documents where both sides posted and disagree. No known pattern fits, so the cause is not identified yet. Take the largest documents first and compare the item-ledger detail against the GL amount. Check the order line type before chasing a GL-only row.',
      desc: 'Sales documents where both sides posted and disagree, and no known pattern fits. The cause is undetermined, not absent.',
      action: 'Take the largest documents first and compare the item-ledger detail, quantity times unit cost, against the GL amount for the same document and account. Read the order line type on any GL-only row before chasing it. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        flag: 'Cause not yet identified',
        mech: 'Sales documents where both sides posted and disagree, and no known pattern fits.',
        checked: [
          'Not a transfer, direct ship or intercompany order. Ruled out.',
          'Not a clean account or period offset. Ruled out.',
          'No duplicate-sales or voucher flag on these rows. Ruled out.'
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: take the largest documents first and compare the item-ledger detail, quantity times unit cost, against the GL amount for the same document and account.',
          'Read the order line type on any GL-only row. A type-N non-stock line posts to the GL and moves no inventory, which names the cause but still leaves a correction to make — check which account the GL leg landed on.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-PURCH': {
      title: 'Unclassified — Purchasing', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Purchasing documents where both sides posted and disagree. No known pattern fits, so the cause is not identified yet. Take the largest documents first, compare the receipt cost against the voucher cost, then the item-ledger detail against the GL amount.',
      desc: 'Purchasing documents where both sides posted and disagree, and no known pattern fits. The cause is undetermined, not absent.',
      action: 'Compare the receipt cost against the voucher cost — a landed-cost or price difference posts to the GL with no matching inventory move. Then compare the item-ledger detail against the GL amount for the same document and account. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        flag: 'Cause not yet identified',
        mech: 'Purchasing documents where both sides posted and disagree, and no known pattern fits.',
        checked: [
          'Not a transfer, direct ship or intercompany order. Ruled out.',
          'Not a clean account or period offset. Ruled out.',
          'No A/P voucher on an inventory account in this set. Ruled out.'
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: compare the receipt cost against the voucher cost. A landed-cost or price difference posts to the GL with no matching inventory move.',
          'Then compare the item-ledger detail against the GL amount for the same document and account.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-MFG': {
      title: 'Unclassified — Manufacturing', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Manufacturing documents where both sides disagree. No known pattern fits, so the cause is not identified yet. Take the largest documents first and match by work order, not document number. Check for a cost change that never reached the GL as a WIP revaluation.',
      desc: 'Manufacturing documents where both sides disagree, and no known pattern fits. The cause is undetermined, not absent.',
      action: 'Match item ledger to GL by work order, not document number — manufacturing accounting assigns its own GL document number. Check for a standard-cost change that landed on the item ledger without the matching WIP revaluation in the GL. A batch number means the row was processed; it does not prove the GL entry exists, so confirm the entry rather than assuming it.',
      finding: {
        triage: true,
        flag: 'Cause not yet identified',
        mech: 'Manufacturing documents where both sides disagree, and no known pattern fits.',
        checked: [
          'Not make-to-order. Ruled out.',
          'Not a clean account or period offset. Ruled out.',
          'Not a completion missing from the GL. Ruled out.'
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Most likely a cost-basis difference: a standard-cost change landed on the item ledger without the matching WIP revaluation in the GL.',
          'Next: match item ledger to GL by work order, not document number. Manufacturing accounting assigns its own GL document number.',
          'A batch number means manufacturing accounting processed the row. It does not prove the GL entry exists, so confirm the entry rather than assuming it.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    },
    'T-INV': {
      title: 'Unclassified — Inventory', kind: 'review', tier: 'terminal', disposition: 'triage',
      cause: 'Inventory documents where both sides posted and disagree. No known pattern fits, so the cause is not identified yet. Take the largest documents first and compare the item-ledger detail against the GL amount, then compare the item’s branch GL class against its location GL class.',
      desc: 'Inventory documents where both sides posted and disagree, and no known pattern fits. The cause is undetermined, not absent.',
      action: 'Compare the item-ledger detail against the GL amount for the same document and account. Then compare the item’s branch GL class against its location GL class — a split only misroutes manufacturing moves, so it is only in play when work-order documents are in scope. Whatever the comparison names, fix it at the source and re-run this company and period.',
      finding: {
        triage: true,
        flag: 'Cause not yet identified',
        mech: 'Inventory documents where both sides posted and disagree, and no known pattern fits.',
        checked: [
          'Not a one-sided location transfer. Ruled out.',
          'Not a clean account or period offset. Ruled out.'
        ],
        found: [
          'Cause not identified. I have not pinned it to one mechanism yet.',
          'Next: compare the item-ledger detail against the GL amount for the same document and account.',
          'Then compare the item’s branch GL class against its location GL class. A split only misroutes manufacturing moves, so it is only in play when work-order documents are in scope.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    }
  };

  // Server-set SubType (lower-cased, trimmed) -> card code.
  var SUBTYPE = {
    'make to order':            'MTO',
    'intercompany':             'ICO',
    'transfers':                'TRF',
    'direct ship':              'DS',
    'accounts':                 'ACCT',
    'periods':                  'PER',
    'vouchers':                 'VCHR',
    'duplicate sales':          'DUP',
    'transfer integrity':       'TXI',
    'completion not journaled': 'CNJ',
    'offsetting entries':       'OFF',
    'non-stock sales lines':    'NSL',
    // DB beta.74 / beta.75 — the five claims that took the manufacturing residual to
    // zero on every demo database. Keys are the server SubType lower-cased and trimmed.
    'non-stock charge lines':   'NCL',
    'sales not journaled':      'SNJ',
    'cross-batch completion':   'XBC',
    'mfg cost mismatch':        'MCM',
    'dmaai net zero':           'NZR'
  };
  // No subtype -> terminal card by transaction Type. Anything else (including
  // 'Inventory' and an unrecognized type) falls to T-INV.
  var TYPE = { 'sales': 'T-SALES', 'purchasing': 'T-PURCH', 'mfg': 'T-MFG' };

  // ---- GRID: Details-only shapes for rows the server left without a SubType --
  // These never become Home cards (those rows roll into the T-* terminals by
  // transaction type), so they carry no `cause`. One name each — the scope band,
  // the pattern card and the work panel all read `title`.
  var GRID = {
    'GL-ONLY': {
      title: 'GL-Only Entry (No Cardex)', disposition: 'rebalance',
      desc: 'An F0911 entry sits on an inventory account with no F4111 counterpart. Read the order line type first: a non-stock line (type N, Inventory Interface N) posts to the GL and moves no inventory, so no cardex row exists. That names the cause; the value still sits on an inventory account it does not belong on, so a correction is required. Otherwise the value was keyed straight onto an inventory account, or a return went through a correction batch (IB rather than I) that posted the GL without writing a cardex record.',
      action: 'Read the LineTy column, then read which account the GL leg landed on. Where a non-stock line is landing on inventory, correct the DMAAI for that non-stock line type so the cost posts to its own non-inventory account — one DMAAI fix stops the whole recurring population instead of document-by-document work. The value already posted stays in the inventory account until the accountant reclassifies it out. Where an inventory account is being keyed directly, restrict who can post to inventory accounts on the entry program, or route those entries through an approval step, so the next one cannot be keyed the same way.'
    },
    'CDX-ONLY': {
      title: 'Cardex-Only Entry (No GL)', disposition: 'rebalance',
      desc: 'An F4111 movement with no F0911 posting on the same account. The batch is usually still open — the cardex writes at transaction time and the GL entry only exists once the batch posts. Where the batch already shows posted and one line is still missing, that single line failed the GL interface while its siblings in the same batch went through.',
      action: 'Post the open batch. If the post errors, the batch is waiting in the Work Center. Where the batch already shows posted, search the GL for the document across all accounts, not just inventory: a misrouted entry looks identical to a missing one from this side. If open batches keep appearing, confirm the post is scheduled for the batch types carrying inventory activity, and that approval is automatic on the system-generated types. Manual approval is what leaves them sitting.'
    },
    // DT=BV is a standard-cost revaluation; DT=IB with no GL leg is a balance
    // adjustment. ONE name has to cover both, so it names the mechanism they
    // share rather than either specific trigger (this code carried two different
    // names across two maps until UI-63).
    'STD-COST': {
      title: 'Cardex Revaluation', disposition: 'self',
      desc: 'An F4111 cardex revaluation from a standard cost change (DT=BV), or an unposted cardex-only balance adjustment (DT=IB with no GL leg). The item ledger revalued and the GL side has not landed yet.',
      action: 'Confirm the matching GL revaluation posts in the next batch — this reconciles itself when it does. A revaluation still cardex-only after the next close is not timing: chase the unposted batch at the source.'
    },
    'OTHER': {
      title: 'Other Variance', disposition: 'triage',
      desc: 'Cardex and GL both posted but disagree, and the variance doesn\'t fit a narrower grid-level pattern. The cause is undetermined, not absent.',
      action: 'Take the largest documents first. Export a representative row: the analyzer reads the line detail and names a narrower pattern. Search the GL for the document across all accounts. On work-order documents, match by work order rather than document number. Compare against the prior period to separate a gap that self-clears from one that persists. Do not adopt a preventive change before the cause is named.'
    }
  };

  // ---- SIGNAL: pseudo-codes the Details finding engine selects instead of the
  // card. Row-truth signals are definitive from the rows themselves, so they
  // pre-empt the card mechanism (the "check duplicate sales first" rule);
  // UNSCOPED covers a grid the analyst reached without drilling a card.
  var SIGNAL = {
    'NON-STOCK': {
      title: 'Non-stock on inventory account',
      finding: {
        flag: 'Non-stock on inventory account',
        mech: 'Non-stock lines posted their GL value to an inventory account.',
        checked: [
          'Order line type on these rows: N, Non-Stock. Inventory Interface N on the line-type constant. Confirmed.',
          'Item-ledger side: nothing. A non-stock line moves no inventory, so no cardex row exists.',
          'Account the GL leg posted to: the inventory account the cardex uses. Confirmed.',
          'Non-stock extended cost on those lines against the GL amount: it accounts for the variance exactly.'
        ],
        found: [
          'The non-stock cost is sitting in an inventory account. A non-stock item holds no inventory, so that value does not belong there.',
          'The tie between the non-stock cost and the GL amount identifies the cause. It does not clear the row — a correction is required.',
          'The DMAAI directing this non-stock line type is sending non-stock cost to the inventory account, so every order carrying such a line repeats it.',
          'Until it is corrected, the GL inventory balance is overstated against the item ledger by exactly the non-stock total.'
        ],
        fix: [
          'Correct the DMAAI for this non-stock line type so the cost lands on its own non-inventory account.',
          'One DMAAI fix stops the whole population. Do not work these document by document.',
          'The value already posted stays in the inventory account until the accountant reclassifies it out. That reclass is the accountant’s lane.',
          'Put the next order carrying a non-stock line through and confirm its value lands off inventory.'
        ]
      }
    },
    'DMAAI-MIS': {
      title: 'DMAAI mismatch',
      finding: {
        dmaai: true,
        flag: 'DMAAI mismatch',
        mech: '',    // set per-render from the mismatch count
        found: [
          'The inventory AAI for these DMAAIs points somewhere other than the item-ledger model account.',
          'Every document on the DMAAI relieves inventory at the wrong account, so this repeats until the AAI is aligned.'
        ],
        fix: [
          'Align the inventory AAI for the flagged DMAAIs so it resolves to the model account.',
          'Re-run this company and period. Every posted account in the DMAAI table should then match its model account.',
          'Documents already posted keep the old account. They need their own correction.'
        ]
      }
    },
    'UNSCOPED': {
      title: 'Cause not yet identified',
      finding: {
        triage: true,
        flag: 'Cause not yet identified',
        mech: 'Both sides posted on these documents and disagree. The view is not scoped to one card, so no single mechanism covers it.',
        found: [
          'Cause not identified. This view mixes several mechanisms.',
          'Next: scope the view to one card. Each card carries its own findings and corrective action.',
          'Or take the largest documents first and compare the item-ledger detail against the GL amount for the same document and account.'
        ],
        fix: ['Whatever the comparison names, fix it at the source and re-run this company and period. A document that comes back was not fixed.']
      }
    }
  };

  // Codes are non-numeric string keys, so Object.keys returns them in insertion
  // order — the ORDER array and META can never disagree.
  var ORDER = Object.keys(META);
  var TITLE = {};
  ORDER.forEach(function (c) { TITLE[c] = META[c].title; });
  Object.keys(GRID).forEach(function (c) { TITLE[c] = GRID[c].title; });

  // ---- Drift alarms ---------------------------------------------------------
  // Every miss below used to render a plausible-looking generic string. Warn
  // once per distinct key so a real drift is noisy without spamming per row.
  var _warned = {};
  function warnOnce(key, msg) {
    if (_warned[key]) return;
    _warned[key] = 1;
    console.warn('[txv] ' + msg);
  }

  function normCode(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function entry(v) {
    var c = normCode(v);
    return META[c] || GRID[c] || SIGNAL[c] || null;
  }
  // info(code) — the copy bundle every surface reads. A missing code is a drift,
  // not a display case: warn and hand back a shape the caller can render.
  function info(v) {
    var c = normCode(v), e = entry(c);
    if (!e) {
      warnOnce('info:' + c, 'no catalog entry for code "' + c + '" — add one to META / GRID / SIGNAL in config.js. Surfaces will show the bare code.');
      return { title: c, desc: '', action: '', disposition: 'triage' };
    }
    if (!e.desc && !e.action && !e.finding) {
      warnOnce('copy:' + c, 'catalog entry "' + c + '" carries no desc / action / finding — the analyst gets a bare title.');
    }
    return e;
  }
  function cause(v) {
    var c = normCode(v), e = entry(c);
    if (e && e.cause) return e.cause;
    if (e && (e.desc || e.action)) return [e.desc, e.action].filter(Boolean).join(' ');
    warnOnce('cause:' + c, 'no `cause` copy for card "' + c + '" — the card falls back to a generic line. Add `cause` to its META entry in config.js.');
    return '';
  }
  function finding(v) {
    var c = normCode(v), e = entry(c);
    if (e && e.finding) return e.finding;
    if (e) warnOnce('finding:' + c, 'no `finding` block for code "' + c + '" — the findings panel cannot draft an investigation report for it. Add `finding` to its catalog entry in config.js.');
    return null;
  }
  function isCode(v) { return !!(META[normCode(v)]); }
  function title(v) { var e = entry(v); return e ? e.title : ''; }

  // ---- Classifiers ---------------------------------------------------------
  // subtypeCode — the ONE place a server SubType becomes a card code. An
  // unmapped non-empty SubType is the failure that shipped twice: the row is
  // correctly classified by the server and lands under the wrong card because
  // the client never learned the name. It warns now.
  function subtypeCode(r) {
    var st = String((r && r.SubType) == null ? '' : r.SubType).trim().toLowerCase();
    if (!st) return '';
    if (Object.prototype.hasOwnProperty.call(SUBTYPE, st)) return SUBTYPE[st];
    warnOnce('subtype:' + st, 'server SubType "' + st + '" has no card code — rows carrying it are falling back to a generic classification. Add it to SUBTYPE in config.js.');
    return '';
  }
  // Home: SubType -> card, else transaction Type -> a T-* terminal. Every row
  // lands in exactly one code, so the cards partition the residual.
  function code(r) {
    r = r || {};
    var c = subtypeCode(r);
    if (c) return c;
    var ty = String(r.Type == null ? '' : r.Type).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(TYPE, ty) ? TYPE[ty] : 'T-INV';
  }
  // Details: the duplicate-relief integrity flag (actionable root cause, wins
  // over SubType), then SubType, then the cardex/GL grid shape. Finer than
  // code() only for rows the server left without a SubType.
  function gridCode(r) {
    r = r || {};
    var eps = 0.01;
    if (String(r.Comment == null ? '' : r.Comment).trim().toLowerCase() === 'check duplicate sales integrity') return 'DUP';
    var c = subtypeCode(r);
    if (c) return c;
    var ot = String(r.OT == null ? '' : r.OT).trim().toUpperCase();
    var dt = String(r.DT == null ? '' : r.DT).trim().toUpperCase();
    var cardex = Number(r.CardexAmount) || 0;
    var ledger = Number(r.LedgerAmount) || 0;
    if (ot === 'OP' && dt === 'PV') return 'VCHR';
    if (ot === 'WO' && (dt === 'IM' || dt === 'IC' || dt === 'IH')) return 'MCM';
    if (dt === 'BV' || (dt === 'IB' && Math.abs(ledger) < eps)) return 'STD-COST';
    if (Math.abs(cardex) < eps && Math.abs(ledger) >= eps) return 'GL-ONLY';
    if (Math.abs(ledger) < eps && Math.abs(cardex) >= eps) return 'CDX-ONLY';
    return 'OTHER';
  }

  window.RRV8.txv = {
    META: META, GRID: GRID, SIGNAL: SIGNAL, ORDER: ORDER, TITLE: TITLE, SUBTYPE: SUBTYPE,
    code: code, gridCode: gridCode, isCode: isCode, normCode: normCode, title: title,
    info: info, cause: cause, finding: finding
  };
})();

/*
 * RRV8.drillReport — the permanent tie-out for count-then-drill navigation.
 *
 * Every Home card / worklist row shows a COUNT computed on one surface, then
 * links to a details page that RE-DERIVES the same slice from the same data.
 * Those two derivations are separate code paths, so they drift. This makes the
 * drift announce itself instead of hiding behind a plausible-looking grid.
 *
 * The source builds its link with `&expect=<rowCount>`; the destination calls
 * this once per drill landing, after its first render. Console only — never a
 * visible diagnostic. Cheap (one string join) and safe (never throws).
 *
 *   surface  short page name, e.g. 'transactions'
 *   applied  { dimension: value } the destination ACTUALLY filtered on
 *   ignored  [param, ...] URL params the destination read but did NOT apply
 *   expected the source's row count from ?expect= (may be null)
 *   actual   the destination's rendered row count
 */
window.RRV8.drillReport = function (o) {
  try {
    o = o || {};
    var applied = o.applied || {}, bits = [];
    for (var k in applied) {
      if (!Object.prototype.hasOwnProperty.call(applied, k)) continue;
      if (applied[k] == null || applied[k] === '') continue;
      bits.push(k + '=' + applied[k]);
    }
    var ign = (o.ignored || []).filter(Boolean);
    console.log('[drill] ' + (o.surface || '?')
      + ' | applied: ' + (bits.length ? bits.join(' ') : '(none)')
      + ' | ignored: ' + (ign.length ? ign.join(' ') : '(none)')
      + ' | rows: ' + (o.actual == null ? '?' : o.actual));
    var exp = (o.expected == null || o.expected === '') ? null : parseInt(o.expected, 10);
    if (exp != null && isFinite(exp) && o.actual != null && exp !== o.actual) {
      console.error('[drill] TIE-OUT MISMATCH on ' + (o.surface || '?')
        + ' — the card counted ' + exp + ' rows, the details grid rendered ' + o.actual
        + '. Scope filters applied: ' + (bits.length ? bits.join(' ') : '(none)') + '.');
    }
  } catch (_) { /* a diagnostic must never break the page */ }
};

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
