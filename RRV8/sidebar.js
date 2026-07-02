/*
 * RRV8 — shared sidebar mount
 *
 * Single source of truth for the V8 left-rail. Replaces the inline
 * <aside class="sidebar"> markup that used to live in every page.
 *
 * Usage (each page calls once at the top of its IIFE):
 *
 *   RRV8.mountSidebar({
 *     activePage:    'rollforward' | 'transactions' | 'asof' | 'cardex-variance' | 'dmaais',
 *     hasPeriodFilter: true,        // adds the "Period" filter row
 *                                   // above Currency on Reconciliation
 *   });
 *
 * What the mount does:
 *   - Inserts the <aside class="sidebar"> DOM with stable IDs.
 *   - Hydrates the pin state from rrv8-sidebar-pinned-v1 BEFORE any
 *     paint (avoids the flash of unpinned state).
 *   - Wires the pin button + module collapse toggles. Both persist
 *     their state to localStorage.
 *   - Marks the active page's nav link with .is-active.
 *
 * What it deliberately does NOT do — these stay in each page's IIFE
 * because they depend on per-page data and rendering callbacks:
 *   - Filter row click → opening the filter-popover with values.
 *   - User chip click → user-menu popover.
 *   - Status row click → status drawer.
 *   - Filter row visual state (dot + status text) updates as data
 *     loads or selections change.
 *
 * The page just calls mountSidebar() first, then continues to find
 * elements by ID (e.g. document.querySelectorAll('.sidebar-filter'))
 * exactly as before.
 */
(function (global) {
  'use strict';

  const PIN_LS_KEY     = 'rrv8-sidebar-pinned-v1';
  const SECTION_LS_KEY = 'rrv8-sidebar-section-expanded-v1';
  // Per the accordion model: at most ONE section may be expanded at
  // a time (across Scope + every module). Persisted value is the id
  // of that section, or '' for "all collapsed".

  // Default-expansion map: when localStorage has no recorded
  // preference yet, fall back to the section that contains the
  // currently active page so the user doesn't land on a fully-
  // collapsed sidebar with no way to navigate. Falls back to
  // 'scope' when the active page doesn't belong to a module
  // (matches the pre-accordion UX where Scope was always visible).
  const PAGE_TO_SECTION = {
    rollforward:       'inventory',
    transactions:      'inventory',
    asof:              'inventory',
    'admin-companies': 'admin',
    'admin-users':     'admin'
    // dmaais is intentionally NOT in this map: the DMAAIs link lives
    // on the status panel as an indicator row, not inside an
    // accordion module, so first-load on the DMAAIs page falls
    // through to 'scope' (matches the pattern for pages outside the
    // main nav).
  };

  // Hydrate the pin class on whichever element exists. sidebar.js
  // is loaded in <head>, so document.body may be null when this
  // module first evaluates. Apply to <html> as a temporary host so
  // the CSS body.has-pinned-sidebar selector still matches once
  // body parses — then migrate the class onto body in mountSidebar().
  function hydratePinClass() {
    try {
      if (localStorage.getItem(PIN_LS_KEY) !== '1') return;
      if (document.body) {
        document.body.classList.add('has-pinned-sidebar');
      } else if (document.documentElement) {
        document.documentElement.classList.add('has-pinned-sidebar');
      }
    } catch (_) {}
  }
  hydratePinClass();

  function loadExpandedSection(activePage) {
    try {
      const raw = localStorage.getItem(SECTION_LS_KEY);
      if (raw !== null) return raw; // user has a recorded preference (incl. '' for all-collapsed)
    } catch (_) {}
    return PAGE_TO_SECTION[activePage] || 'scope';
  }
  function saveExpandedSection(id) {
    try { localStorage.setItem(SECTION_LS_KEY, id || ''); } catch (_) {}
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );
  }

  function html(strings, ...values) {
    // Tiny tagged-template helper. Concatenates string parts with
    // interpolated values in order so `${cls(...)}` etc. work.
    let out = '';
    strings.forEach((s, i) => {
      out += s;
      if (i < values.length) out += values[i];
    });
    return out;
  }

  function buildSidebarHtml(opts) {
    const activePage = opts.activePage || '';
    const hasPeriod  = !!opts.hasPeriodFilter;

    // Hydrate persisted state UP FRONT so it lives in the initial
    // template — no post-mount class swaps, no flicker. Accordion
    // model: at most one section expanded at a time.
    const currentExpanded = loadExpandedSection(activePage);
    const expCls = (id) => currentExpanded === id ? ' is-expanded' : '';
    const expAria = (id) => currentExpanded === id ? 'true' : 'false';
    const dmaaiSeed = seedDmaaiStateFromSession();
    const dotCls = dmaaiSeed.state ? ' is-' + dmaaiSeed.state : '';
    const dotTitle = dmaaiSeed.title;
    const agentSeed = seedAgentConnectivityFromSession();

    // is-active classes per page
    const cls = (page) => activePage === page ? ' is-active' : '';
    const isInventoryPage = activePage === 'rollforward' || activePage === 'transactions' || activePage === 'asof';

    // The period filter row only renders on Reconciliation. Its
    // popover/click wiring is page-specific (in the IIFE).
    const periodRow = hasPeriod ? html`
      <button class="sidebar-filter" type="button" id="js-period-sidebar-btn">
        <span class="sidebar-filter-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </span>
        <span class="sidebar-filter-dot"></span>
        <span class="sidebar-filter-text">Period</span>
        <span class="sidebar-filter-status" id="js-period-sidebar-status">&mdash;</span>
      </button>` : '';

    return html`
<aside class="sidebar">
  <div class="sidebar-brand">
    <button class="sidebar-user" type="button" id="js-user-btn" aria-haspopup="menu" title="User menu">
      <span class="sidebar-user-avatar-wrap">
        <span class="sidebar-user-avatar">E</span>
        <span class="sidebar-user-status" title="Online"></span>
      </span>
      <span class="sidebar-user-text">
        <span class="sidebar-user-name" id="js-user-name">Welcome, Ed</span>
        <span class="sidebar-user-db" id="js-user-db">RapidReconciler_Dev</span>
      </span>
      <svg class="sidebar-user-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <button class="sidebar-pin" id="js-sidebar-pin" type="button" title="Pin sidebar open" aria-label="Pin sidebar open" aria-pressed="false">
      <svg class="sidebar-pin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="17" x2="12" y2="22"></line>
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
      </svg>
    </button>
  </div>

  <!-- Administrator — its own group above Reconcile. Admin tasks are
       set-and-forget; pulling them out of the main nav keeps the
       reconciliation flow uncluttered while keeping admin one click
       away. -->
  <div class="sidebar-section">
    <div class="sidebar-section-label">Administrator</div>
    <div class="sidebar-module${expCls('admin')}" data-module="admin">
      <button type="button" class="sidebar-nav-item" data-module-toggle="admin" aria-expanded="${expAria('admin')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span class="sidebar-nav-text">Administrator</span>
        <svg class="sidebar-nav-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div class="sidebar-nav-children">
        <a href="admin-companies.html" class="sidebar-nav-child${cls('admin-companies')}" data-nav-page="admin-companies">Licensing</a>
        <a href="admin-users.html" class="sidebar-nav-child${cls('admin-users')}" data-nav-page="admin-users">RR Team</a>
        <a href="#" class="sidebar-nav-child" data-nav-page="admin-cardex-deletions">Utilities</a>
      </div>
    </div>
  </div>

  <!-- Reconcile (main nav). Scope is the first accordion item so the
       analyst sets context (Company / BU / Account / Sub / Currency)
       before picking a page. -->
  <div class="sidebar-section">
    <div class="sidebar-section-label">Reconcile</div>
    <div class="sidebar-module sidebar-scope${expCls('scope')}" data-module="scope">
      <button type="button" class="sidebar-nav-item" data-module-toggle="scope" aria-expanded="${expAria('scope')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        <span class="sidebar-nav-text">Scope</span>
        <svg class="sidebar-nav-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div class="sidebar-nav-children sidebar-filters" id="js-sidebar-filters">
        <div class="sidebar-filters-actions">
          <button class="sidebar-filters-clear" type="button" id="js-filter-clear">Reset all</button>
        </div>
        ${periodRow}
        <button class="sidebar-filter" type="button" data-filter="currencies">
      <span class="sidebar-filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
      </span>
      <span class="sidebar-filter-dot"></span>
      <span class="sidebar-filter-text">Currency</span>
      <span class="sidebar-filter-status">All</span>
    </button>
    <button class="sidebar-filter" type="button" data-filter="companies">
      <span class="sidebar-filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
      </span>
      <span class="sidebar-filter-dot"></span>
      <span class="sidebar-filter-text">Company</span>
      <span class="sidebar-filter-status">All</span>
    </button>
    <button class="sidebar-filter" type="button" data-filter="businessUnits">
      <span class="sidebar-filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/></svg>
      </span>
      <span class="sidebar-filter-dot"></span>
      <span class="sidebar-filter-text">Business Unit</span>
      <span class="sidebar-filter-status">All</span>
    </button>
    <button class="sidebar-filter" type="button" data-filter="objects">
      <span class="sidebar-filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </span>
      <span class="sidebar-filter-dot"></span>
      <span class="sidebar-filter-text">Object</span>
      <span class="sidebar-filter-status">All</span>
    </button>
    <button class="sidebar-filter" type="button" data-filter="subsidiaries">
      <span class="sidebar-filter-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="4.5" cy="6" r="2"/><circle cx="19.5" cy="6" r="2"/><circle cx="4.5" cy="18" r="2"/><circle cx="19.5" cy="18" r="2"/></svg>
      </span>
      <span class="sidebar-filter-dot"></span>
      <span class="sidebar-filter-text">Subsidiary</span>
      <span class="sidebar-filter-status">All</span>
    </button>
      </div>
    </div>
    <div class="sidebar-module${expCls('inventory')}" data-module="inventory">
      <button type="button" class="sidebar-nav-item${isInventoryPage ? ' is-active' : ''}" data-module-toggle="inventory" aria-expanded="${expAria('inventory')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        <span class="sidebar-nav-text">Inventory</span>
        <svg class="sidebar-nav-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div class="sidebar-nav-children">
        <a href="inventory-account-rollforward.html" class="sidebar-nav-child${cls('rollforward')}" data-nav-page="rollforward">Account Roll Forward</a>
        <a href="inventory-transactions.html"   class="sidebar-nav-child${cls('transactions')}"   data-nav-page="transactions">Transactions</a>
        <a href="inventory-asof.html"           class="sidebar-nav-child${cls('asof')}"           data-nav-page="asof">Perpetual</a>
      </div>
    </div>
    <div class="sidebar-module${expCls('in-transit')}" data-module="in-transit">
      <button type="button" class="sidebar-nav-item" data-module-toggle="in-transit" aria-expanded="${expAria('in-transit')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span class="sidebar-nav-text">In Transit</span>
      </button>
    </div>
    <div class="sidebar-module${expCls('po-receipts')}" data-module="po-receipts">
      <button type="button" class="sidebar-nav-item" data-module-toggle="po-receipts" aria-expanded="${expAria('po-receipts')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
        <span class="sidebar-nav-text">PO Receipts</span>
      </button>
    </div>
  </div>

  <!-- Support — out-of-V8 KB destinations. Open in new tab so the
       analyst keeps their V8 context. -->
  <div class="sidebar-section">
    <div class="sidebar-module${expCls('support')}" data-module="support">
      <button type="button" class="sidebar-nav-item" data-module-toggle="support" aria-expanded="${expAria('support')}">
        <svg class="sidebar-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="4"/>
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/>
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/>
          <line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/>
          <line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>
        </svg>
        <span class="sidebar-nav-text">Support</span>
        <svg class="sidebar-nav-caret" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>
      </button>
      <div class="sidebar-nav-children">
        <a href="../RRUniversity/rapidreconciler-university.html" class="sidebar-nav-child" target="_blank" rel="noopener">RR University</a>
        <a href="../HelpDesk/troubleshooting.html" class="sidebar-nav-child" target="_blank" rel="noopener">Help Desk</a>
      </div>
    </div>
  </div>

  <!-- Status panel — four indicators. DMAAIs is a clickable
       nav row that doubles as a preload-state indicator: the dot
       paints green/amber/red driven by setDmaaiStatus() the same
       way it did when it lived on the Accounting accordion header.
       Agent answers "can the browser reach the data-services agent
       at all?" — distinct from System Status, which answers "is the
       SQL roll-forward job running cleanly?" The /poll loops on
       Reconciliation and Transactions drive it; non-polling pages
       seed from the last cached outcome in sessionStorage. -->
  <div class="sidebar-status">
    <a href="accounting-dmaais.html" class="sidebar-status-row${cls('dmaais')}" data-nav-page="dmaais" title="${escapeHtml(dotTitle)}">
      <span class="sidebar-status-dot${dotCls}" id="js-dmaai-dot"></span>
      <span class="sidebar-status-label">DMAAIs</span>
    </a>
    <div class="sidebar-status-row" id="js-validation-row">
      <span class="sidebar-status-dot is-green" id="js-validation-dot" title="Inventory Validation"></span>
      <span class="sidebar-status-label">Inventory Validation</span>
    </div>
    <div class="sidebar-status-row" id="js-agent-conn-row" title="${escapeHtml(agentSeed.title)}">
      <span class="sidebar-status-dot${agentSeed.cls}" id="js-agent-conn-dot"></span>
      <span class="sidebar-status-label">Agent</span>
    </div>
    <button class="sidebar-status-row" id="js-status-row" type="button" title="System Status &mdash; click for the runbook drawer">
      <span class="sidebar-status-dot" id="js-status-dot"></span>
      <span class="sidebar-status-label">System Status</span>
    </button>
  </div>
</aside>`;
  }

  function wirePin() {
    const pin = document.getElementById('js-sidebar-pin');
    if (!pin) return;
    pin.setAttribute('aria-pressed', document.body.classList.contains('has-pinned-sidebar') ? 'true' : 'false');
    pin.addEventListener('click', () => {
      const pinned = !document.body.classList.contains('has-pinned-sidebar');
      document.body.classList.toggle('has-pinned-sidebar', pinned);
      pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      try { localStorage.setItem(PIN_LS_KEY, pinned ? '1' : '0'); } catch (_) {}
    });
  }

  function wireSectionToggles() {
    // Accordion: at most one section may be expanded at a time across
    // Scope + every module. Click on the open one collapses it
    // (no section expanded). Click on a closed one collapses any
    // previously-open peer and expands the clicked one.
    //
    // Initial .is-expanded classes were baked into the template by
    // mountSidebar() so there's no first-paint flicker. We only
    // attach click handlers + keep the persisted id in sync.
    const all = document.querySelectorAll('.sidebar-module');
    all.forEach(el => {
      const id  = el.dataset.module;
      const btn = el.querySelector('[data-module-toggle]');
      if (!btn) return;
      btn.addEventListener('click', () => {
        const wasExpanded = el.classList.contains('is-expanded');
        // Collapse every section first — guarantees only one open.
        all.forEach(other => {
          if (!other.classList.contains('is-expanded')) return;
          other.classList.remove('is-expanded');
          const t = other.querySelector('[data-module-toggle]');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (!wasExpanded) {
          el.classList.add('is-expanded');
          btn.setAttribute('aria-expanded', 'true');
          saveExpandedSection(id);
        } else {
          saveExpandedSection('');
        }
      });
    });
  }

  /**
   * Paint the DMAAIs preload status dot on the sidebar's DMAAIs nav
   * row. Persistent across page navigation — the underlying cache
   * (sessionStorage `rrv8.scope.v1.*.dmaais`) survives reloads so
   * the indicator reads "ready" on every page once the preload has
   * happened anywhere in the session.
   *
   * @param {string} state — 'loading' | 'ready' | 'error' | 'none'
   * @param {{count?:number, message?:string}} info — optional metadata
   */
  function setDmaaiStatus(state, info) {
    const dot = document.getElementById('js-dmaai-dot');
    if (!dot) return;
    dot.classList.remove('is-loading', 'is-ready', 'is-error');
    let title;
    if (state === 'loading') {
      dot.classList.add('is-loading');
      title = 'Loading the JDE DMAAI universe…';
    } else if (state === 'ready') {
      dot.classList.add('is-ready');
      const n = info && info.count;
      title = 'DMAAIs loaded' + (n ? ' · ' + n.toLocaleString('en-US') + ' rows' : '') + '. Per-row Export will include them in the analyzer workbook.';
    } else if (state === 'error') {
      dot.classList.add('is-error');
      const msg = (info && info.message) ? ' — ' + info.message : '';
      title = 'DMAAIs unavailable. Export will still produce a workbook, but without the DMAAI universe the analyzer\'s AAI-pattern classification will be less precise.' + msg;
    } else {
      title = 'DMAAIs preload status';
    }
    dot.title = title;
    // Also stamp the title on the surrounding status row so the
    // tooltip works whether the analyst hovers the dot or the label.
    const row = dot.closest('.sidebar-status-row');
    if (row) row.title = title;
  }

  // Best-effort scan of sessionStorage for a cached DMAAI payload from
  // any (mode, db) tuple. Used both to seed the initial template
  // (so the dot paints in its final state on first render — no
  // flicker) and to expose a runtime setter for pages that actively
  // preload. Returns { state: 'ready'|'', count, title } describing
  // what the dot should look like for the cached payload.
  function seedDmaaiStateFromSession() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !/^rrv8\.scope\.v1\..+\.dmaais$/.test(k)) continue;
        const raw = sessionStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        const payload = obj && obj.payload;
        const rows = (payload && payload.data) || (Array.isArray(payload) ? payload : []);
        if (rows.length) {
          return {
            state: 'ready',
            count: rows.length,
            title: 'DMAAIs loaded · ' + rows.length.toLocaleString('en-US') + ' rows. Per-row Export will include them in the analyzer workbook.',
          };
        }
      }
    } catch (_) { /* sessionStorage unavailable or stale shape — ignore */ }
    return { state: '', count: 0, title: 'DMAAIs preload status' };
  }

  // ---------------------------------------------------------------
  //                                          Agent connectivity dot
  // ---------------------------------------------------------------
  // Distinct from System Status. Drives off the success / failure of
  // the /poll long-poll on Reconciliation + Transactions. Other pages
  // read the cached outcome at mount time so the dot paints from the
  // last known state without each page having to repeat the wiring.
  //
  // sessionStorage shape:
  //   key:   'rrv8.agentConnectivity.v1'
  //   value: '{"state":"ok|unreachable|unknown","ts":<epochMs>,"message"?:string}'
  //
  // The state classes the dot can carry (consumed by setAgentConnectivity
  // and seedAgentConnectivityFromSession; CSS in sidebar.css aliases
  // them to the existing colour rules):
  //   'is-green'  ok           — last /poll returned cleanly
  //   'is-red'    unreachable  — last /poll threw a network error
  //   ''          unknown      — never polled (or sessionStorage cleared)
  const AGENT_CONN_LS_KEY = 'rrv8.agentConnectivity.v1';

  function seedAgentConnectivityFromSession() {
    try {
      const raw = sessionStorage.getItem(AGENT_CONN_LS_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && obj.state === 'unreachable') {
          const msg = obj.message ? ' — ' + obj.message : '';
          return {
            cls: ' is-red',
            title: 'Agent unreachable — start the data-services jar' + msg
          };
        }
      }
    } catch (_) {}
    // Assume reachable until proven otherwise. The /poll long-poll on
    // Reconciliation / Transactions will flip this red within seconds
    // if the agent is actually down. Better default than muted-grey
    // (which reads as broken even when everything is fine).
    return { cls: ' is-green', title: 'Agent reachable' };
  }

  /**
   * Update the Agent connectivity dot and persist the result so
   * other pages can paint from cache at mount time.
   *
   * @param {'ok'|'unreachable'|'unknown'} state
   * @param {{message?:string}} info  optional error detail
   */
  function setAgentConnectivity(state, info) {
    const dot = document.getElementById('js-agent-conn-dot');
    const row = document.getElementById('js-agent-conn-row');
    let cls = '';
    let title;
    if (state === 'ok') {
      cls = ' is-green';
      title = 'Agent reachable';
    } else if (state === 'unreachable') {
      cls = ' is-red';
      const msg = info && info.message ? ' — ' + info.message : '';
      title = 'Agent unreachable — start the data-services jar' + msg;
    } else {
      title = 'Agent connectivity (no poll yet this session)';
    }
    if (dot) {
      dot.classList.remove('is-green', 'is-red', 'is-amber',
                           'is-ready', 'is-error', 'is-loading');
      if (cls) dot.classList.add(cls.trim());
      dot.title = title;
    }
    if (row) row.title = title;
    // Phase 2: keep the topbar connectivity pill in sync with the
    // sidebar dot (same source of truth). Both surfaces coexist while
    // the sidebar lives; Phase 3 removes the rail and the pill stays.
    paintTopbarConn(state === 'unreachable', title);
    try {
      sessionStorage.setItem(AGENT_CONN_LS_KEY, JSON.stringify({
        state: state || 'unknown',
        ts:    Date.now(),
        message: (info && info.message) || undefined
      }));
    } catch (_) {}
  }

  // ---------------------------------------------------------------
  //                                       Topbar extras (Phase 2)
  // ---------------------------------------------------------------
  // The working pages already carry a <header class="topbar"> with a
  // brand block and an empty right edge. mountTopbar() injects a
  // connectivity pill + a Home link there — the two affordances the
  // topbar lacks once home.html is the post-login landing. Done from
  // sidebar.js (loaded on every V8 page) so there are zero per-page
  // HTML edits. Idempotent; no-ops on pages without a .topbar (the
  // home page builds its own header).
  function paintTopbarConn(down, title) {
    const pill = document.getElementById('js-topbar-conn');
    if (!pill) return;
    pill.classList.toggle('is-down', !!down);
    const txt = pill.querySelector('.topbar-conn-text');
    if (txt) txt.textContent = down ? 'Reconnecting…' : 'Connected';
    pill.title = title || (down
      ? 'Data service unreachable — check your VPN / connection'
      : 'Connected to the data service');
  }

  function mountTopbar() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;                              // home / non-app pages
    if (bar.querySelector('.topbar-extras')) return; // idempotent
    const seed = seedAgentConnectivityFromSession();
    const down = seed.cls.indexOf('is-red') !== -1;
    const wrap = document.createElement('div');
    wrap.className = 'topbar-extras';
    wrap.innerHTML =
      '<span class="topbar-conn' + (down ? ' is-down' : '') + '" id="js-topbar-conn" title="' + escapeHtml(seed.title) + '">' +
        '<span class="topbar-conn-dot"></span>' +
        '<span class="topbar-conn-text">' + (down ? 'Reconnecting…' : 'Connected') + '</span>' +
      '</span>' +
      '<a class="topbar-home" href="home.html" title="Back to Home">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/></svg>' +
        '<span>Home</span>' +
      '</a>';
    bar.appendChild(wrap);
  }

  // ---------------------------------------------------------------
  //                              Working-page chrome (Phase 3)
  // ---------------------------------------------------------------
  // mountWorkbar() is the sidebar's replacement on the inventory
  // working pages. Instead of a 60px left rail it populates the
  // existing <header class="topbar"> with: the inventory sub-nav
  // (the cross-page navigation the sidebar accordion used to own),
  // a connectivity pill, a Home link, and a compact user chip that
  // reuses the same #js-user-btn / #js-user-menu plumbing the
  // sidebar user menu uses (hydrateSession -> mountUserMenu). Pages
  // call this INSTEAD of mountSidebar; the page's own period bar and
  // page-local pills stay where they are.
  //
  // Scope filters do NOT live here — per the Phase 3 design the BU /
  // Object / Subsidiary / Currency filters are dropped (they surface
  // as contributor dimensions), the period lives on the bar graph,
  // and Company (the permission-scoped one) is handled per-page.
  // Cardex Variance is intentionally NOT here: it's an admin/analyst
  // function reached from Home (a nav:false standalone surface, like the
  // Model DMAAI Review), not an everyday inventory sub-nav tab.
  const WORKBAR_NAV = [
    { page: 'rollforward',     href: 'inventory-account-rollforward.html', label: 'Account Roll Forward' },
    { page: 'transactions',    href: 'inventory-transactions.html',    label: 'Transactions' },
    { page: 'asof',            href: 'inventory-asof.html',            label: 'Perpetual' }
  ];

  function applyWorkbarCaps() {
    // The inventory sub-nav requires the Inventory module. Fail open
    // (show) when there's no active-db claim yet (dev token / pre-
    // hydrate) — same semantics as applyClientModuleCaps.
    const a = readActiveDbClaim();
    if (!a) return;
    const m = a.m || {}, t = a.t || {};
    const inv = (m.inv !== false) && (t.inv !== false);
    const nav = document.querySelector('.workbar-nav');
    if (nav) nav.style.display = inv ? '' : 'none';
  }

  function mountWorkbar(opts) {
    opts = opts || {};
    const bar = document.querySelector('.topbar');
    if (!bar) return null;
    if (bar.querySelector('.workbar-right')) return bar;  // idempotent
    const activePage = opts.activePage || '';
    const search = global.location.search || '';

    // Standalone surfaces (e.g. the Model DMAAI Review flow) pass nav:false —
    // they're reached from Home and don't belong to the inventory page set,
    // so the cross-page sub-nav would be noise. The connectivity pill, Home
    // link, and identity chip still mount.
    const showNav = opts.nav !== false;
    let nav = null;
    if (showNav) {
      nav = document.createElement('nav');
      nav.className = 'workbar-nav';
      nav.setAttribute('aria-label', 'Inventory');
      nav.innerHTML = WORKBAR_NAV.map(n =>
        '<a href="' + n.href + escapeHtml(search) + '" class="workbar-nav-item' +
        (n.page === activePage ? ' is-active' : '') + '" data-nav-page="' +
        n.page + '">' + escapeHtml(n.label) + '</a>').join('');
    }

    const seed = seedAgentConnectivityFromSession();
    const down = seed.cls.indexOf('is-red') !== -1;
    const right = document.createElement('div');
    right.className = 'workbar-right';
    right.innerHTML =
      '<span class="topbar-conn' + (down ? ' is-down' : '') + '" id="js-topbar-conn" title="' + escapeHtml(seed.title) + '">' +
        '<span class="topbar-conn-dot"></span>' +
        '<span class="topbar-conn-text">' + (down ? 'Reconnecting…' : 'Connected') + '</span>' +
      '</span>' +
      '<a class="topbar-home" href="home.html" title="Back to Home">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/></svg>' +
        '<span>Home</span>' +
      '</a>' +
      // Identity-only chip (no dropdown). Account actions — sign out, DB
      // switch, Import JDE, Restart — all live on Home; the working-page
      // chip is just "who's signed in". Kept as id="js-user-btn" so the
      // pages' renderUserChip (which fills the avatar) still finds it.
      // both avatar classes: sidebar.js renderUserChip targets
      // .sidebar-user-avatar; pages with their own inline renderUserChip
      // (reconciliation / transactions) target .topbar-user-avatar.
      '<div class="workbar-user is-identity" id="js-user-btn" title="Signed in — manage your account from Home">' +
        '<span class="sidebar-user-avatar topbar-user-avatar">?</span>' +
      '</div>';

    if (nav) bar.appendChild(nav);

    // Company picker — the one surviving Scope control. Permission-
    // scoped (the page builds its options from the agent's company
    // universe). Carries the legacy `.sidebar-filter[data-filter=
    // "companies"]` hooks + inner text/status spans so the page's
    // EXISTING company-filter wiring (openFilterPopover, renderFilterRows)
    // binds to it untouched — only the popover anchor changes (drops
    // down instead of flying out of the rail). Opt-in per page.
    if (opts.company) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sidebar-filter workbar-company';
      chip.setAttribute('data-filter', 'companies');
      chip.innerHTML =
        '<span class="sidebar-filter-text">Company</span>' +
        '<span class="sidebar-filter-status">All</span>';
      // Bind the click HERE, at creation, via the page-supplied handler —
      // the page's generic .sidebar-filter wiring runs at script-eval and
      // would miss a chip added during this (possibly deferred) boot call.
      // stopPropagation keeps the page's document-level "click closes
      // popovers" listener from immediately re-closing it.
      if (typeof opts.onCompanyClick === 'function') {
        chip.addEventListener('click', function (e) {
          e.stopPropagation();
          opts.onCompanyClick(chip, e);
        });
      }
      bar.appendChild(chip);
    }

    bar.appendChild(right);

    const paintDbLabel = function () {
      try {
        const a = readActiveDbClaim();
        const dbEl = document.getElementById('js-topbar-db');
        if (dbEl && a && a.n) dbEl.textContent = a.n;
      } catch (_) {}
    };

    // Identity / user-menu ownership:
    //   opts.manageUser === true  -> mountWorkbar hydrates the session and
    //     mounts the shared user menu (for simple pages with no bootSession
    //     of their own: cardex-variance, asof, dmaais).
    //   default (false)           -> the page owns its session (bootSession)
    //     and its own user-menu wiring (reconciliation, transactions). The
    //     original mountSidebar never hydrated; matching that here avoids a
    //     second hydrate racing the page's loader. mountWorkbar only builds
    //     the chrome DOM; the page's renderUserChip fills #js-user-btn.
    if (opts.manageUser) {
      const finish = function () {
        paintDbLabel();
        if (typeof renderUserChip === 'function') renderUserChip();
        // No user menu on working pages — the chip is identity-only and all
        // account actions live on Home.
        applyWorkbarCaps();
      };
      if (global.RRV8 && global.RRV8.hydrateSession &&
          !(global.RR_SESSION && global.RR_SESSION.user)) {
        global.RRV8.hydrateSession().then(finish);
      } else {
        finish();
      }
    } else {
      paintDbLabel();
      applyWorkbarCaps();
    }
    return bar;
  }

  /**
   * Mount the sidebar and wire its purely-internal behaviors.
   * Page-specific behaviors (filter popovers, user menu, status drawer)
   * stay in the page IIFE — they find their targets by ID.
   *
   * @param {{activePage?:string, hasPeriodFilter?:boolean, target?:HTMLElement}} opts
   * @returns {HTMLElement|null} the mounted <aside>
   */
  function mountSidebar(opts) {
    opts = opts || {};
    // Insert the sidebar DOM into a placeholder element (preferred) or
    // as the first child of .app.
    let host = opts.target || document.getElementById('js-sidebar-mount');
    if (!host) {
      const app = document.querySelector('.app');
      if (!app) {
        console.warn('[sidebar.js] No mount target — expected #js-sidebar-mount or .app');
        return null;
      }
      // Prepend a fresh container so we don't clobber whatever was at
      // index 0.
      host = document.createElement('div');
      host.id = 'js-sidebar-mount';
      app.insertBefore(host, app.firstChild);
    }
    host.outerHTML = buildSidebarHtml(opts);

    // If we tagged <html> earlier (because <body> didn't exist when
    // sidebar.js first ran), promote the class onto <body> now so the
    // CSS body.has-pinned-sidebar rules engage.
    if (document.documentElement.classList.contains('has-pinned-sidebar')) {
      document.body.classList.add('has-pinned-sidebar');
      document.documentElement.classList.remove('has-pinned-sidebar');
    } else {
      // Double-check sessionStorage on the off-chance hydratePinClass()
      // ran before localStorage was available.
      hydratePinClass();
    }

    wirePin();
    wireSectionToggles();
    mountTopbar();
    // DMAAI dot was seeded into the template by buildSidebarHtml
    // (seedDmaaiStateFromSession), so no post-mount class swap is
    // needed. Pages that actively preload will overwrite the dot
    // state via RRV8.setDmaaiStatus(...).
    applyClientModuleCaps();
    // mountSidebar() runs synchronously at script load, but most pages
    // populate RR_SESSION later via their own async bootSession(). When
    // that's the case the pass above fails open (no active db yet), so
    // re-apply once the session lands. Self-limiting: only polls when the
    // session wasn't ready at mount, and stops the moment it is (or after
    // ~3s). Idempotent — applyClientModuleCaps sets visibility explicitly.
    if (!readActiveDbClaim()) {
      var _capTries = 0;
      var _capIv = setInterval(function () {
        _capTries++;
        if (readActiveDbClaim()) { clearInterval(_capIv); applyClientModuleCaps(); }
        else if (_capTries >= 30) { clearInterval(_capIv); }
      }, 100);
    }
    return document.querySelector('.sidebar');
  }

  // ============================================================
  //  Per-client module visibility caps
  //
  //  VALC 2.0's JWT carries a per-db `m` object that mirrors the
  //  customer's licensed modules (inv / it / adm / por). The sidebar
  //  AND-gates with the user's per-db tab perms: a module renders only
  //  if the customer is licensed for it AND the user is granted the
  //  matching authorized tab.
  //
  //  Fail-open semantics:
  //   - No `m` claim on the active db -> show everything (back-compat
  //     with older tokens, and with the synthetic dev token which
  //     never carried this block).
  //   - No active db at all -> show everything (admin landing pages).
  //
  //  Module -> sidebar-nav-item data-module mapping:
  //    inv -> "inventory" (also the four /inventory pages)
  //    it  -> "in-transit"
  //    por -> "po-receipts"
  //    adm -> "admin" + DMAAIs row + admin-companies / admin-users
  // ============================================================
  function readActiveDbClaim() {
    const sess = (global.RR_SESSION || {});
    const dbs  = Array.isArray(sess.dbs) ? sess.dbs : [];
    if (!dbs.length) return null;
    const i = sess.activeDbIndex || 0;
    return dbs[i] || dbs[0];
  }

  function applyClientModuleCaps() {
    const active = readActiveDbClaim();
    if (!active) return;  // fail-open: no active db -> show everything

    // Layered filter per Prompt #4:
    //   1. Client-level module cap (active.m) -- customer's licensed modules
    //   2. User-level authorized tab (active.t) -- per-user perm grant
    //   3. User-level dmaais permission (active.perms.dm)
    // A module renders only when BOTH client AND user grant access.
    // Either layer missing falls open (back-compat with the synthetic
    // dev token + older JWTs).
    const m = active.m || {};
    const t = active.t || {};
    const perms = active.perms || {};
    const cap = {
      inv: (m.inv !== false) && (t.inv !== false),
      it:  (m.it  !== false) && (t.it  !== false),
      por: (m.por !== false) && (t.por !== false),
      adm: (m.adm !== false) && (t.adm !== false),
      dm:  (m.adm !== false) && (perms.dm !== false)   // DMAAIs gated by admin module + user perm
    };
    const aside = document.querySelector('.sidebar');
    if (!aside) return;

    function setModule(dataModule, show) {
      const el = aside.querySelector('.sidebar-module[data-module="' + dataModule + '"]');
      if (el) el.style.display = show ? '' : 'none';
    }
    // Idempotent: set each module's visibility explicitly so this can be
    // re-run after the session hydrates (the synchronous mount call fires
    // before bootSession populates RR_SESSION) or after a DB switch
    // changes the active `m`/`t` — a module hidden for one DB must be able
    // to re-show for another.
    setModule('inventory',   cap.inv);
    setModule('in-transit',  cap.it);
    setModule('po-receipts', cap.por);
    setModule('admin',       cap.adm);
    // DMAAIs sits in the bottom status panel, not a sidebar-module.
    const dmaai = aside.querySelector('.sidebar-status-row[data-nav-page="dmaais"]');
    if (dmaai) dmaai.style.display = cap.dm ? '' : 'none';
  }

  // ============================================================
  //  Cross-page sidebar state — reads + paints from the existing
  //  caches the V8 pages already write to:
  //
  //   - localStorage `rrv8-filter-selections-v1`  → filter row counts
  //   - sessionStorage `rrv8.scope.v1.<mode>.<db>.status`  → System Status +
  //                                                         Inventory Validation dots
  //   - sessionStorage `rrv8.scope.v1.<mode>.<db>.jobStatus` → System Status dot
  //                                                            (live job state cache)
  //   - sessionStorage `rrv8.scope.v1.<mode>.<db>.currentPeriod` → Period row
  //                                                                + bar chart
  //
  //  Pages with their own full wiring (Reconciliation, Transactions)
  //  paint these themselves and re-call this helper is a no-op overwrite.
  //  Pages WITHOUT full wiring (As Of, Cardex Variance) just call this
  //  after mountSidebar to get the cross-page state reflected.
  // ============================================================

  const FILTER_GROUPS = ['currencies', 'companies', 'businessUnits', 'objects', 'subsidiaries'];

  function scanSessionForScope(suffix) {
    // Mirrors the inline scopeKey pattern in the V8 pages — but since
    // we don't know which (mode, db) is "current" from sidebar.js, scan
    // and pick the freshest entry by timestamp.
    let best = null;
    try {
      const rx = new RegExp('^rrv8\\.scope\\.v1\\..+\\.' + suffix + '$');
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (!k || !rx.test(k)) continue;
        const raw = sessionStorage.getItem(k);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj && obj.payload && (!best || (obj.ts || 0) > (best.ts || 0))) best = obj;
      }
    } catch (_) {}
    return best ? best.payload : null;
  }
  function loadStoredFilterSelections() {
    try {
      const raw = localStorage.getItem('rrv8-filter-selections-v1');
      return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { return {}; }
  }
  function formatPeriodIso(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return String(iso || '');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[parseInt(m[2],10)-1] + ' ' + parseInt(m[3],10) + ', ' + m[1];
  }

  function paintFilterRow(group, statusPayload, selections) {
    const btn = document.querySelector('.sidebar-filter[data-filter="' + group + '"]');
    if (!btn) return;
    const statusEl = btn.querySelector('.sidebar-filter-status');
    const rf = (statusPayload && statusPayload.reconciliationFilter) || {};
    const all = Array.isArray(rf[group]) ? rf[group] : [];
    const sel = Array.isArray(selections[group]) ? selections[group] : [];
    const narrowed = sel.length > 0 && sel.length < all.length;
    btn.classList.toggle('is-active', narrowed);
    if (statusEl) {
      statusEl.textContent = all.length === 0 ? '—'
        : (sel.length === 0 || sel.length === all.length) ? 'All'
        : sel.length + ' / ' + all.length;
    }
  }

  function paintStatusDots(statusPayload, jobStatusPayload) {
    // Inventory Validation dot — same color mapping the pages use
    // (ValidationLight.Color: none/danger/yellow/success/unknown).
    const valDot = document.getElementById('js-validation-dot');
    if (valDot) {
      valDot.classList.remove('is-green', 'is-amber', 'is-warn', 'is-red');
      const v = (statusPayload && statusPayload.validation) || null;
      const color = v && (v.color || '').toLowerCase();
      if (color === 'success' || color === 'green') {
        valDot.classList.add('is-green');
        valDot.title = 'Inventory Validation — roll-forward clean';
      } else if (color === 'yellow' || color === 'warning' || color === 'amber') {
        valDot.classList.add('is-amber', 'is-warn');
        valDot.title = 'Inventory Validation — roll-forward in progress / amber';
      } else if (color === 'danger' || color === 'red') {
        valDot.classList.add('is-red');
        valDot.title = 'Inventory Validation — roll-forward failed';
      } else {
        valDot.classList.add('is-green');  // default optimistic when no signal
        valDot.title = 'Inventory Validation';
      }
    }

    // System Status dot — driven by the cached jobStatus row (set by
    // Reconciliation/Transactions when they refresh /inventory/status).
    const sysDot = document.getElementById('js-status-dot');
    if (sysDot) {
      sysDot.classList.remove('is-green', 'is-amber', 'is-warn', 'is-red', 'is-error');
      const status = jobStatusPayload && (jobStatusPayload.jobStatus || jobStatusPayload.status);
      if (!status) {
        sysDot.classList.add('is-amber', 'is-warn');
        sysDot.title = 'System Status — no live read yet';
      } else if (/^In Progress$/i.test(status)) {
        sysDot.classList.add('is-amber', 'is-warn');
        sysDot.title = 'System Status — SQL Agent refresh job in progress';
      } else if (/^(Failed|Cancelled)$/i.test(status)) {
        sysDot.classList.add('is-red', 'is-error');
        sysDot.title = 'System Status — last job ' + status;
      } else if (/^Not Found$/i.test(status)) {
        sysDot.classList.add('is-amber', 'is-warn');
        sysDot.title = 'System Status — no prior job (baseline only)';
      } else {
        sysDot.classList.add('is-green');
        sysDot.title = 'System Status — last job completed successfully';
      }
    }
  }

  /**
   * Paint the sidebar from the existing cross-page state caches.
   * Safe to call on every page; pages that wire their own filter
   * popovers will overwrite later with their own renderers.
   *
   * Reads:
   *   - localStorage `rrv8-filter-selections-v1`
   *   - sessionStorage `rrv8.scope.v1.<mode>.<db>.status`
   *   - sessionStorage `rrv8.scope.v1.<mode>.<db>.jobStatus`
   *   - sessionStorage `rrv8.scope.v1.<mode>.<db>.currentPeriod`
   */
  function paintSidebarFromCache() {
    const status      = scanSessionForScope('status');
    const jobStatus   = scanSessionForScope('jobStatus');
    const periodCache = scanSessionForScope('currentPeriod');
    const selections  = loadStoredFilterSelections();

    FILTER_GROUPS.forEach(g => paintFilterRow(g, status, selections));
    paintStatusDots(status, jobStatus);

    // Paint the Period filter row if it's present (hasPeriodFilter: true).
    const periodStatus = document.getElementById('js-period-sidebar-status');
    if (periodStatus && periodCache) {
      const iso = (typeof periodCache === 'string') ? periodCache : (periodCache && periodCache.period);
      if (iso) periodStatus.textContent = formatPeriodIso(iso);
    }
  }

  /**
   * Ensure the inventory filter universe (currencies / companies /
   * businessUnits / objects / subsidiaries) is cached for the active
   * (mode, db) tuple, and repaint the sidebar from it.
   *
   * Why this lives here: the filter universe is session-level — it
   * doesn't change between page navigations or period switches — but
   * it ships inside /inventory/status which ALSO carries a
   * period-scoped validation block. The right long-term answer is a
   * dedicated scope endpoint (or baking the universe into the JWT
   * next to dbs[i].i). Until that lands, this helper centralizes the
   * fetch + cache + sidebar repaint so every page gets the sidebar
   * populated with one boot-time call, no matter the entry point.
   *
   * Idempotent: cached entries short-circuit to a sidebar repaint
   * with no network. The first cold call (per tab) seeds the cache
   * for every subsequent page navigation.
   *
   * @param {function} rrFetchFn   - the page's rrFetch helper
   * @param {object}   [opts]
   * @param {boolean}  [opts.force] - re-fetch even if cached
   * @returns {Promise<object|null>}
   */
  async function ensureInventoryStatus(rrFetchFn, opts) {
    opts = opts || {};
    if (typeof rrFetchFn !== 'function') return null;
    const session = (global.RR_SESSION || {});
    const dbs    = Array.isArray(session.dbs) ? session.dbs : [];
    const dbIdx  = session.activeDbIndex || 0;
    const dbName = (dbs[dbIdx] && dbs[dbIdx].n) || '_';
    const mode   = (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
    const key    = 'rrv8.scope.v1.' + mode + '.' + dbName + '.status';
    if (!opts.force) {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && obj.payload) {
            paintSidebarFromCache();
            return obj.payload;
          }
        }
      } catch (_) {}
    }
    try {
      const payload = await rrFetchFn('inventory/status', { demoFile: 'inventory-status' });
      if (payload) {
        try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload: payload })); } catch (_) {}
        paintSidebarFromCache();
      }
      return payload;
    } catch (err) {
      try { console.warn('[sidebar] ensureInventoryStatus failed:', err); } catch (_) {}
      return null;
    }
  }

  /**
   * Read the cross-page cached period — the most-recently-published
   * value across any (mode, db) tuple in this tab. Returns null if
   * nothing has been published yet. Pages call this at boot so the
   * period the analyst picked on the previous page persists when they
   * navigate here. Falls back to a string-or-{period: ...} shape so
   * callers can use it interchangeably.
   *
   * @returns {string|null} ISO YYYY-MM-DD or null
   */
  function readCurrentPeriod() {
    // Read THIS database's published period only — never the newest across
    // every (mode, db) tuple. The cross-DB "newest wins" scan carried a prior
    // DB's month onto the active one, surfacing an out-of-range period with no
    // data after a switch. Keyed exactly like publishCurrentPeriod, so
    // cross-PAGE navigation within the SAME db still persists the picked month.
    let raw = null;
    try {
      const session = global.RR_SESSION || {};
      const dbs = Array.isArray(session.dbs) ? session.dbs : [];
      const db = (dbs[session.activeDbIndex || 0] && dbs[session.activeDbIndex || 0].n) || '_';
      const mode = (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
      const stored = sessionStorage.getItem('rrv8.scope.v1.' + mode + '.' + db + '.currentPeriod');
      if (stored) { const obj = JSON.parse(stored); raw = obj && obj.payload; }
    } catch (_) {}
    if (raw == null) return null;
    const iso = (typeof raw === 'string') ? raw : (raw && raw.period) || null;
    return (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) ? iso : null;
  }

  /**
   * Write the page's current period to the cross-page cache so the
   * next page in the navigation sees it. Pages call this whenever
   * their period changes (load, bar-chart click, etc.).
   */
  function publishCurrentPeriod(period) {
    if (!period) return;
    try {
      // Pick a key that matches the V8 scope-cache pattern; if no db is
      // active yet (rare — only on the very first paint) fall back to a
      // stable name so the value still survives within the tab.
      const session = (global.RR_SESSION || {});
      const dbs = Array.isArray(session.dbs) ? session.dbs : [];
      const dbIdx = session.activeDbIndex || 0;
      const db = (dbs[dbIdx] && dbs[dbIdx].n) || '_';
      const mode = (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
      const key = 'rrv8.scope.v1.' + mode + '.' + db + '.currentPeriod';
      sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), payload: period }));
    } catch (_) {}
  }

  // Per-DB cache of the fiscal calendar's newest closed period (the DB's "open
  // period"), keyed like the scope cache. Pages that fetch /available-periods
  // call cacheAvailablePeriods(); any page can then fall back to defaultPeriod()
  // — the calendar's real open period — instead of a hardcoded date. Persisted
  // in sessionStorage so a page that never fetches the calendar itself (e.g.
  // Reconciliation) still gets the value once another page fetched it this DB.
  function _openPeriodKey() {
    const session = (global.RR_SESSION || {});
    const dbs = Array.isArray(session.dbs) ? session.dbs : [];
    const db = (dbs[session.activeDbIndex || 0] && dbs[session.activeDbIndex || 0].n) || '_';
    const mode = (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
    return 'rrv8.scope.v1.' + mode + '.' + db + '.openPeriod';
  }
  function cacheAvailablePeriods(list, serverDefault) {
    try {
      let newest = (typeof serverDefault === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serverDefault))
        ? serverDefault : null;
      if (Array.isArray(list)) {
        for (let i = 0; i < list.length; i++) {
          const iso = (typeof list[i] === 'string') ? list[i] : (list[i] && list[i].period);
          if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && (!newest || iso > newest)) newest = iso;
        }
      }
      if (newest) sessionStorage.setItem(_openPeriodKey(), newest);
    } catch (_) {}
  }
  function defaultPeriod() {
    try { return sessionStorage.getItem(_openPeriodKey()) || ''; } catch (_) { return ''; }
  }

  // ============================================================
  //  Canonical session scope (the "scope hub" backbone)
  //
  //  One source of truth for the working scope of the active database,
  //  read by Home AND the work pages so they never disagree. Three layers
  //  (see docs/plans/home-scope-hub-and-onboarding.md):
  //    - allowedCompanies : the JWT db claim's company allow-list (db.i) —
  //      a permission, read-only here.
  //    - activeCompanies  : the user's current selection (defaults to the
  //      full allowed set); sticky for the session, set on Home or a page.
  //    - period           : the active reconciliation period (defaults to
  //      the cross-page current period).
  //  Per-page narrowing (accounts / BUs / contributor) is NOT stored here.
  // ============================================================
  function _sessionScopeKey() {
    const session = (global.RR_SESSION || {});
    const dbs = Array.isArray(session.dbs) ? session.dbs : [];
    const dbIdx = session.activeDbIndex || 0;
    const db = (dbs[dbIdx] && dbs[dbIdx].n) || '_';
    const mode = (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
    return 'rrv8.scope.v1.' + mode + '.' + db + '.scope';
  }

  /**
   * Resolve the active database's working scope, applying the user's sticky
   * selection over the defaults. Returns:
   *   { database:{n,ip}, allowedCompanies:[...], activeCompanies:[...], period }
   * Fail-open: with no claim/selection, activeCompanies = allowedCompanies
   * and period falls back to the cross-page current period (or null).
   */
  function readSessionScope() {
    const a = readActiveDbClaim() || {};
    const allowed = Array.isArray(a.i) ? a.i.slice() : [];
    let stored = null;
    try {
      const raw = sessionStorage.getItem(_sessionScopeKey());
      stored = raw ? (JSON.parse(raw).payload || null) : null;
    } catch (_) { stored = null; }
    const active = (stored && Array.isArray(stored.activeCompanies) && stored.activeCompanies.length)
      ? stored.activeCompanies.slice()
      : allowed.slice();
    // Period source of truth is the cross-page currentPeriod cache (newest
    // wins), so a period a work page publishes isn't shadowed by an older
    // stored selection. The stored value is only a fallback.
    const period = readCurrentPeriod() || (stored && stored.period) || null;
    return {
      database: { n: a.n || null, ip: a.ip || null },
      allowedCompanies: allowed,
      activeCompanies: active,
      period: period
    };
  }

  /**
   * Update the sticky active selection for the active database. Home writes
   * it on change; a work page calls it when the analyst changes the active
   * company/period, so every surface stays in sync. Pass {activeCompanies}
   * and/or {period}; omitted keys keep their current value. Returns the
   * freshly-resolved scope.
   */
  function setActiveScope(patch) {
    patch = patch || {};
    try {
      const cur = readSessionScope();
      const next = {
        activeCompanies: Array.isArray(patch.activeCompanies) ? patch.activeCompanies : cur.activeCompanies,
        period: ('period' in patch) ? patch.period : cur.period
      };
      sessionStorage.setItem(_sessionScopeKey(), JSON.stringify({ ts: Date.now(), payload: next }));
      // Keep the older currentPeriod cache in lockstep so pages still reading
      // that key see the same period.
      if (next.period) publishCurrentPeriod(next.period);
    } catch (_) {}
    return readSessionScope();
  }

  // ============================================================
  //  Session hydrate + user menu
  //
  //  Shared implementation of the welcome dropdown that hangs off
  //  the sidebar's user chip. Inlined on the four grid pages first
  //  (reconciliation / transactions / asof / cardex-variance); the
  //  admin pages — and any new V8 page — opt in by calling
  //  RRV8.hydrateSession() then RRV8.mountUserMenu(). The grid pages
  //  still own their inline copy until a separate cleanup pass.
  // ============================================================

  function parseJwt(token) {
    try {
      const body = token.split('.')[1];
      const json = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch (_) { return null; }
  }

  // ---- Session expiry / auto-logout (real-token modes only) ----
  // Idle timeout: 30 minutes of no user activity ends the session and
  // bounces to login (which re-checks password expiry). Replaces the old
  // absolute 1-hour cap, so an actively-working user is no longer kicked
  // out mid-task — the clock resets on any interaction. Activity is tracked
  // in localStorage (rrv8.lastActivity) so it's shared across tabs/pages.
  // The token's own exp still applies as a hard backstop. The manually-set
  // dev token (no sessionStart, far-future exp) is exempt.
  // Auto-signout master switch. DISABLED for dev/demo per owner 2026-07-02 —
  // the 30-min idle timeout was kicking working sessions to login mid-task.
  // Re-enable before production by setting this to true (nothing else changes;
  // markActivity/watchSession still run so the clock is warm when it's flipped).
  const AUTO_SIGNOUT_ENABLED = false;
  const IDLE_MAX_MS = 30 * 60 * 1000;
  let _lastActivityWrite = 0;
  function markActivity() {
    try {
      // Only track once a real session exists; the dev token has no
      // sessionStart and stays exempt from the idle timeout.
      if (!localStorage.getItem('rrv8.sessionStart')) return;
      const now = Date.now();
      // Throttle writes — activity events (mousemove, scroll) fire constantly.
      if (now - _lastActivityWrite < 15000) return;
      _lastActivityWrite = now;
      localStorage.setItem('rrv8.lastActivity', String(now));
    } catch (_) {}
  }
  function sessionExpired() {
    if (!AUTO_SIGNOUT_ENABLED) return false;   // dev/demo: never auto-expire (see flag above)
    try {
      const start = localStorage.getItem('rrv8.sessionStart');
      if (start) {
        // Idle = time since last interaction (falls back to sign-in time
        // until the first activity is recorded).
        const last = parseInt(localStorage.getItem('rrv8.lastActivity') || start, 10);
        if (!isNaN(last) && (Date.now() - last) > IDLE_MAX_MS) return true;
      }
      const token = localStorage.getItem('rrv8.token');
      if (token) {
        const p = parseJwt(token);
        if (p && p.exp && Date.now() >= (p.exp * 1000)) return true;
      }
    } catch (_) {}
    return false;
  }
  function endSession() {
    try { localStorage.removeItem('rrv8.token'); } catch (_) {}
    try { localStorage.removeItem('rrv8.viewMode'); } catch (_) {}
    try { localStorage.removeItem('rrv8.sessionStart'); } catch (_) {}
    try { localStorage.removeItem('rrv8.lastActivity'); } catch (_) {}
    try { localStorage.removeItem('rrv8.activeDb'); } catch (_) {}
    // Keep rrv8.lastEmail so the login page can pre-fill the address.
    global.location.href = '../login.html?reason=timeout';
  }
  let _sessionWatchStarted = false;
  function watchSession() {
    if (_sessionWatchStarted) return;
    _sessionWatchStarted = true;
    markActivity(); // seed last-activity for this page load
    ['mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'mousemove'].forEach(function (ev) {
      global.addEventListener(ev, markActivity, { passive: true });
    });
    global.setInterval(function () { if (sessionExpired()) endSession(); }, 60000);
  }

  // The active database is sticky like the rest of the session scope: a
  // selection made on Home (or any page) persists so the work pages open on
  // the SAME database, not always dbs[0]. Stored by NAME (indices shift as
  // the JWT changes); resolved back to an index on each hydrate.
  function _resolveActiveDbIndex(dbs) {
    let saved = null;
    try { saved = localStorage.getItem('rrv8.activeDb'); } catch (_) {}
    if (saved && Array.isArray(dbs)) {
      for (let i = 0; i < dbs.length; i++) {
        if (dbs[i] && dbs[i].n === saved) return i;
      }
    }
    return 0;
  }

  /** Persist the active database (by name) and point RR_SESSION at it, so
   *  the choice flows to every page. Pages call this from their DB picker. */
  function setActiveDatabase(name) {
    if (!name) return;
    try { localStorage.setItem('rrv8.activeDb', name); } catch (_) {}
    const s = global.RR_SESSION;
    if (s && Array.isArray(s.dbs)) {
      for (let i = 0; i < s.dbs.length; i++) {
        if (s.dbs[i] && s.dbs[i].n === name) { s.activeDbIndex = i; break; }
      }
    }
  }

  // Populate window.RR_SESSION.{user,dbs,activeDbIndex,token}. In
  // demo mode reads data/demo-jwt-payload.json; in staging/prod
  // reads localStorage.rrv8.token. Always resolves — failures leave
  // RR_SESSION empty so renderUserChip falls back to a placeholder.
  // activeDbIndex honors the sticky rrv8.activeDb selection (falls to 0).
  function hydrateSession() {
    const cfg = global.RR_CONFIG || {};
    const mode = (new URLSearchParams(global.location.search).get('mode'))
                 || cfg.mode || 'demo';
    global.RR_SESSION = global.RR_SESSION || {};

    if (mode === 'demo') {
      const url = (cfg.dataPath || 'data/') + 'demo-jwt-payload.json';
      return fetch(url, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(payload => {
          if (payload) {
            global.RR_SESSION.user = payload.user || null;
            global.RR_SESSION.dbs  = Array.isArray(payload.dbs) ? payload.dbs : [];
            global.RR_SESSION.activeDbIndex = _resolveActiveDbIndex(global.RR_SESSION.dbs);
            global.RR_SESSION.token = null;
          }
          return global.RR_SESSION;
        })
        .catch(() => global.RR_SESSION);
    }

    try {
      const token = localStorage.getItem('rrv8.token');
      if (token) {
        const payload = parseJwt(token);
        if (payload) {
          global.RR_SESSION.user = payload.user || null;
          global.RR_SESSION.dbs  = Array.isArray(payload.dbs) ? payload.dbs : [];
          global.RR_SESSION.activeDbIndex = _resolveActiveDbIndex(global.RR_SESSION.dbs);
          global.RR_SESSION.token = token;
        }
      }
    } catch (_) {}
    return Promise.resolve(global.RR_SESSION);
  }

  function getCurrentUser() {
    const u = (global.RR_SESSION && global.RR_SESSION.user) || {};
    const fn = u.fn || '';
    return {
      name:    fn || '—',
      email:   u.u || '',
      initial: (fn.trim()[0] || '?').toUpperCase()
    };
  }

  function getCurrentDatabases() {
    const sess = global.RR_SESSION || {};
    const dbs  = Array.isArray(sess.dbs) ? sess.dbs : [];
    const activeIdx = sess.activeDbIndex || 0;
    return dbs.map((db, idx) => ({
      index:     idx,
      id:        db.n || ('db-' + idx),
      label:     db.n || 'unknown',
      host:      (db.ip || '').split(':')[0] || '—',
      port:      (db.ip || '').split(':')[1] || '',
      isCurrent: idx === activeIdx
    }));
  }

  function renderUserChip() {
    const u = getCurrentUser();
    const dbs = getCurrentDatabases();
    const active = dbs.find(d => d.isCurrent) || dbs[0];

    const avatarEl = document.querySelector('#js-user-btn .sidebar-user-avatar');
    if (avatarEl) avatarEl.textContent = u.initial;

    const nameEl = document.getElementById('js-user-name');
    if (nameEl) {
      const firstName = (u.name || '').split(/\s+/)[0] || u.name || '—';
      nameEl.textContent = 'Welcome, ' + firstName;
    }

    const dbEl = document.getElementById('js-user-db');
    if (dbEl) {
      dbEl.textContent = active
        ? (active.label + (active.host && active.host !== '—' ? ' · ' + active.host : ''))
        : 'No database';
    }
  }

  function buildUserMenu(opts) {
    const menu = document.getElementById('js-user-menu');
    if (!menu) return;
    const u = getCurrentUser();
    const dbs = getCurrentDatabases();
    const cfg = global.RR_CONFIG || {};
    const isDemo = ((new URLSearchParams(global.location.search).get('mode'))
                    || cfg.mode || 'demo') === 'demo';
    const showSignOut = !isDemo;

    // Per-Prompt #4: hide admin actions the user lacks the permission
    // for. Reads the JWT's new `perms` block on the active db. Fail-
    // open if the block is absent (older tokens or the synthetic dev
    // token) so demos keep working unchanged.
    const activeDbClaim = readActiveDbClaim() || {};
    const dbPerms       = activeDbClaim.perms || {};
    const canImportJde      = (dbPerms.ij !== false);
    const canRestartService = (dbPerms.rs !== false);

    const dbRows = dbs.length ? dbs.map(db =>
      '<button class="user-menu-db ' + (db.isCurrent ? 'is-current' : '') +
      '" type="button" data-db-index="' + db.index + '">' +
        '<span class="user-menu-db-radio" aria-hidden="true"></span>' +
        '<span>' +
          '<span class="user-menu-db-name">' + escapeHtml(db.label) + '</span>' +
          '<span class="user-menu-db-meta">' + escapeHtml(db.host) +
            (db.port ? ' &middot; :' + escapeHtml(db.port) : '') +
          '</span>' +
        '</span>' +
      '</button>').join('')
      : '<div class="user-menu-db-meta" style="padding: 8px 12px;">No databases in session.</div>';

    // Build the Admin section only when at least one action survives
    // the permission filter; otherwise omit the whole block to keep
    // the menu tight.
    let adminHtml = '';
    if (canImportJde || canRestartService) {
      adminHtml = '<div class="user-menu-section">' +
        '<div class="user-menu-section-label">Admin</div>';
      if (canImportJde) {
        adminHtml +=
          '<button class="user-menu-action" type="button" data-action="import-jde">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
            '<span>Import JDE data</span>' +
            '<span class="user-menu-action-meta">Global</span>' +
          '</button>';
      }
      if (canRestartService) {
        adminHtml +=
          '<button class="user-menu-action is-danger" type="button" data-action="restart-service">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path></svg>' +
            '<span>Restart Service</span>' +
            '<span class="user-menu-action-meta">Admin</span>' +
          '</button>';
      }
      adminHtml += '</div>';
    }

    menu.innerHTML =
      '<div class="user-menu-head">' +
        '<div class="user-menu-name">' + escapeHtml(u.name) + '</div>' +
        '<div class="user-menu-email">' + escapeHtml(u.email) + '</div>' +
      '</div>' +
      '<div class="user-menu-section">' +
        '<div class="user-menu-section-label">Connected database</div>' +
        dbRows +
      '</div>' +
      adminHtml +
      (showSignOut ?
        '<div class="user-menu-section">' +
          '<button class="user-menu-action" type="button" data-action="sign-out">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>' +
            '<span>Sign out</span>' +
          '</button>' +
        '</div>' : '');

    menu.querySelectorAll('.user-menu-db[data-db-index]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.dbIndex, 10);
        if (isNaN(idx)) return;
        // Same DB picked — just close, no reload.
        if (idx === (global.RR_SESSION.activeDbIndex || 0)) { closeUserMenu(); return; }
        // Persist the sticky selection (single source of truth) and hard-reload
        // so EVERY per-DB surface re-scopes to the new agent. Flipping
        // activeDbIndex in place left the rendered/cached data from the prior
        // DB on the page (cross-DB bleed); a reload re-boots cleanly against
        // the new DB. DB switching is rare, so the reload cost is acceptable.
        const dbs = (global.RR_SESSION && global.RR_SESSION.dbs) || [];
        const name = dbs[idx] && dbs[idx].n;
        if (name) { setActiveDatabase(name); } else { global.RR_SESSION.activeDbIndex = idx; }
        global.location.reload();
      });
    });

    menu.querySelectorAll('.user-menu-action[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'sign-out') {
          try { localStorage.removeItem('rrv8.token'); } catch (_) {}
          try { localStorage.removeItem('rrv8.viewMode'); } catch (_) {}
          try { localStorage.removeItem('rrv8.lastEmail'); } catch (_) {}
          // login.html is the single sign-in entry, co-located with V8
          // on the app server. Walk up from /RRV8/* to the repo root.
          global.location.href = '../login.html';
          return;
        }
        // Placeholder: routed-action labels surface as a flash. Pages
        // that own the real handlers can replace this by re-binding
        // before calling mountUserMenu.
        const labels = { 'import-jde': 'Import JDE data', 'restart-service': 'Restart Service' };
        if (opts && typeof opts.onAction === 'function') {
          opts.onAction(action);
        } else if (global.alert && !global.__rrSilenceMenuAlerts) {
          // Don't pop a modal — quiet console log + close.
          console.info('[user menu] ' + (labels[action] || action) + ' — not wired on this page');
        }
        closeUserMenu();
      });
    });
  }

  function positionUserMenu() {
    const menu = document.getElementById('js-user-menu');
    const btn  = document.getElementById('js-user-btn');
    if (!menu || !btn) return;
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 6) + 'px';
    // Buttons inside the sidebar sit at the left edge; right-anchoring
    // would push the menu's left edge off-screen. Pop it out to the
    // right of the sidebar instead. Topbar buttons keep the legacy
    // right-anchored placement.
    if (btn.closest('.sidebar')) {
      menu.style.left  = (r.right + 6) + 'px';
      menu.style.right = 'auto';
    } else {
      menu.style.left  = 'auto';
      menu.style.right = (window.innerWidth - r.right) + 'px';
    }
  }

  function openUserMenu() {
    const menu = document.getElementById('js-user-menu');
    const btn  = document.getElementById('js-user-btn');
    if (!menu || !btn) return;
    positionUserMenu();
    menu.hidden = false;
    btn.classList.add('is-open');
  }

  function closeUserMenu() {
    const menu = document.getElementById('js-user-menu');
    const btn  = document.getElementById('js-user-btn');
    if (menu) menu.hidden = true;
    if (btn)  btn.classList.remove('is-open');
  }

  // Mount the welcome-dropdown popover for the current page. Idempotent —
  // calling twice no-ops on the second call. Pages that already wire
  // their own popover (the four grid pages) should NOT call this; the
  // detection guards against double-mount when they migrate later.
  function mountUserMenu(opts) {
    opts = opts || {};
    const btn = document.getElementById('js-user-btn');
    if (!btn) return;
    // Skip if a page-local copy already wired it up (legacy grid
    // pages do this in their IIFE).
    if (btn.dataset.rrUserMenuMounted === '1') return;

    let menu = document.getElementById('js-user-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'js-user-menu';
      menu.className = 'user-menu';
      menu.setAttribute('role', 'menu');
      menu.hidden = true;
      document.body.appendChild(menu);
    }

    btn.dataset.rrUserMenuMounted = '1';

    renderUserChip();
    buildUserMenu(opts);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!menu.hidden) { closeUserMenu(); return; }
      openUserMenu();
    });
    menu.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
      if (menu.hidden) return;
      if (e.target.closest('#js-user-menu') || e.target.closest('#js-user-btn')) return;
      closeUserMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) closeUserMenu();
    });
  }

  // Auto-enforce the session cap on every V8 page. sidebar.js is
  // included on all of them and config.js (RR_CONFIG) loads just before
  // it, so this runs synchronously on load — independent of whichever
  // bootSession the page itself uses. Demo mode (no real session) opts
  // out; the dev token (no sessionStart, far-future exp) is never caught.
  (function enforceSessionGuard() {
    try {
      const mode = (new URLSearchParams(global.location.search).get('mode'))
                   || (global.RR_CONFIG || {}).mode || 'demo';
      if (mode === 'demo') return;
      if (sessionExpired()) { endSession(); return; }
      watchSession();
    } catch (_) {}
  })();

  // --- Purge recommendation (shared by the Purge page card + Home's dot) ------
  // Single source of truth so the page card, its 1/3/6-month snooze, and Home's
  // purge dot never disagree. `info` is the agent's purge-info; opts.snoozeUntil
  // and opts.today are ISO date strings (the caller reads the localStorage
  // snooze + today). Returns:
  //   known          - false when there's nothing to score on (older agent) ->
  //                    caller shows grey / hides the card
  //   level          - raw 'green'|'amber'|'red'
  //   effectiveLevel - level after the snooze override (a non-red recommendation
  //                    snoozed until a future date reads 'green'; red always
  //                    shows); null when !known
  //   snoozed        - whether the snooze is currently suppressing a recommendation
  //   headline,detail - plain-language strings for the page card (detail may
  //                    carry <b> emphasis; rendered via innerHTML)
  function _prettyMb(mb) { mb = Number(mb) || 0; return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.round(mb) + ' MB'; }
  function purgeRecommendation(info, opts) {
    info = info || {}; opts = opts || {};
    var TARGET_RETENTION_MONTHS = 24;
    var HEADROOM_FLOOR_MB = 20480;            // 20 GB
    var size   = Number(info.dbSizeMb) || 0;
    var free   = (info.dataDriveFreeMb == null) ? null : Number(info.dataDriveFreeMb);
    var months = (info.retainedMonths  == null) ? null : Number(info.retainedMonths);
    var known  = (free != null) || (months != null);

    // No history series yet -> estimate growth from size / months retained.
    // Flagged so a runway shortfall can only reach AMBER, never RED.
    var growthPerMonth = (months && months > 0 && size > 0) ? (size / months) : null;
    var level = 'green', runway = null, reasons = [];
    if (free != null) {
      var headroom = Math.max(HEADROOM_FLOOR_MB, 0.5 * size);
      if (free < headroom) {
        level = 'red';                        // MEASURED low disk -> RED allowed
        reasons.push('Only <b>' + _prettyMb(free) + '</b> free on the data drive &mdash; a refresh needs roughly <b>' + _prettyMb(headroom) + '</b> free to run safely.');
      } else if (growthPerMonth) {
        runway = free / growthPerMonth;
        if (runway < 12) {                    // estimate -> capped at AMBER
          if (level !== 'red') level = 'amber';
          var m = Math.max(1, Math.round(runway));
          reasons.push('About <b>' + m + ' month' + (m === 1 ? '' : 's') + '</b> of disk space left at the recent growth rate.');
        }
      }
    }
    if (months != null && months > 2 * TARGET_RETENTION_MONTHS) {
      if (level !== 'red') level = 'amber';
      reasons.push("You're keeping about <b>" + (months / 12).toFixed(months >= 24 ? 0 : 1) + " years</b> of history; around <b>2 years</b> is typical for reconciliation.");
    }

    var headline, detail;
    if (level === 'green') {
      headline = 'No purge needed right now';
      var bits = [];
      if (runway != null) bits.push('about ' + Math.round(runway) + ' months of disk runway');
      if (months != null) bits.push((months / 12).toFixed(months >= 24 ? 0 : 1) + ' years retained');
      detail = bits.length ? ('Looks healthy &mdash; ' + bits.join(', ') + '.') : 'Looks healthy.';
    } else {
      headline = (level === 'red') ? 'Purge recommended' : 'Worth planning a purge';
      detail = reasons.join(' ');
    }

    var until = opts.snoozeUntil || '', today = opts.today || '';
    var snoozed = !!(until && today && today < until && level !== 'red');
    var effectiveLevel = known ? (snoozed ? 'green' : level) : null;
    return { known: known, level: level, effectiveLevel: effectiveLevel, snoozed: snoozed,
             headline: headline, detail: detail, reasons: reasons,
             runway: runway, retainedMonths: months };
  }

  // --- Complex-password review reminder (page band + Home dot share it) -------
  // A lightweight reminder (NOT an attestation): the admin sets "remind me in
  // 3 / 6 months" or "never" to acknowledge the complex-password setup. Stored
  // client-side per database (rrv8.complexPwReview.<db>). `value` is that stored
  // string: 'never', a future ISO date (reminded later), or empty/past (review
  // due). Returns 'green' (reminded or never) or 'amber' (due / not yet set).
  function complexPwReviewLevel(value, todayISO) {
    if (value === 'never') return 'green';
    if (value && todayISO && value > todayISO) return 'green';
    return 'amber';
  }

  // --- Server ack -> legacy review "value" -----------------------------------
  // Reminders are now recorded server-side per database (the per-DB agent's
  // RAdminReminderAck, via GET /admin/acks). Each ack is
  // { kind, ackedDate, cadenceDays, never, ... }. This converts one ack into the
  // SAME "value" string the dot helpers above already understand — 'never', the
  // next-due ISO date (ackedDate + cadenceDays), or '' (no ack / undecidable) —
  // so complexPwReviewLevel / purgeRecommendation stay untouched while the
  // source of truth moves from localStorage to the server. Retires the
  // rrv8.*Review / *Snooze localStorage scatter (per-browser, drift-prone).
  function ackToReviewValue(ack) {
    if (!ack) return '';
    if (ack.never) return 'never';
    if (!ack.ackedDate || !ack.cadenceDays) return '';
    var d = new Date(ack.ackedDate);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(ack.cadenceDays));
    return d.toISOString().slice(0, 10);
  }

  global.RRV8 = global.RRV8 || {};
  global.RRV8.ackToReviewValue        = ackToReviewValue;
  global.RRV8.purgeRecommendation     = purgeRecommendation;
  global.RRV8.complexPwReviewLevel    = complexPwReviewLevel;
  // Review Job Schedule uses the identical green/amber rule (future ISO date or
  // 'never' = green, else amber), keyed at rrv8.scheduleReview.<db>. Aliased to
  // the one function so the two no-attestation reminders can't drift.
  global.RRV8.scheduleReviewLevel     = complexPwReviewLevel;
  // Claude Assistant (30/60/Never, rrv8.aiReview.<db>) and Activity Log
  // (7/14/30-day, rrv8.activityReview.<db>) use the identical green/amber rule —
  // aliased to the one function so the page bands and the Home dots can't drift.
  global.RRV8.aiReviewLevel           = complexPwReviewLevel;
  global.RRV8.activityReviewLevel     = complexPwReviewLevel;
  global.RRV8.mountSidebar            = mountSidebar;
  global.RRV8.mountTopbar             = mountTopbar;
  global.RRV8.mountWorkbar            = mountWorkbar;
  global.RRV8.applyClientModuleCaps   = applyClientModuleCaps;
  global.RRV8.setDmaaiStatus          = setDmaaiStatus;
  global.RRV8.setAgentConnectivity    = setAgentConnectivity;
  global.RRV8.paintSidebarFromCache   = paintSidebarFromCache;
  global.RRV8.publishCurrentPeriod    = publishCurrentPeriod;
  global.RRV8.readCurrentPeriod       = readCurrentPeriod;
  global.RRV8.readSessionScope        = readSessionScope;
  global.RRV8.setActiveScope          = setActiveScope;
  global.RRV8.setActiveDatabase       = setActiveDatabase;
  global.RRV8.resolveActiveDbIndex    = _resolveActiveDbIndex;
  global.RRV8.cacheAvailablePeriods   = cacheAvailablePeriods;
  global.RRV8.defaultPeriod           = defaultPeriod;
  global.RRV8.ensureInventoryStatus   = ensureInventoryStatus;
  global.RRV8.hydrateSession          = hydrateSession;
  global.RRV8.mountUserMenu           = mountUserMenu;
  global.RRV8.renderUserChip          = renderUserChip;

  // --- Eager session hydration (durable fix for the recurring race) --------
  // sidebar.js is loaded as a NON-defer <script> in <head>, so it runs before
  // any page's inline boot script. For the token (staging/prod) path,
  // hydrateSession() is fully synchronous (JWT decode), so calling it once here
  // populates window.RR_SESSION.dbs BEFORE every page boots — pages no longer
  // have to remember to await it for activeDb()/RR_SESSION to resolve. (Several
  // minimal-topbar admin pages had forgotten, sending empty requests.) Pages
  // that DO call hydrateSession() still work: it's idempotent (re-reads the same
  // token). Demo mode stays lazy — it fetches a payload async, and the demo
  // pages call hydrateSession() explicitly — so we don't kick a fetch here.
  try {
    var _eagerMode = (new URLSearchParams(global.location.search).get('mode'))
                     || (global.RR_CONFIG && global.RR_CONFIG.mode) || 'demo';
    if (_eagerMode !== 'demo') { hydrateSession(); }
  } catch (_) { /* leave RR_SESSION empty; pages still call hydrateSession() */ }

  // --- Currency helpers (multi-currency display) -----------------------
  // currencySymbol('GBP') -> 'GBP'->£ via the browser's ICU data; cached.
  // An empty code falls back to '$' (the legacy USD default this system
  // assumed); an unknown-but-present code returns the code itself so we
  // never render a confidently-wrong glyph. No server table needed --
  // JDE currency codes are ISO 4217 and covered by Intl.NumberFormat.
  var _curSymCache = {};
  function currencySymbol(code) {
    code = (code == null ? '' : String(code)).trim().toUpperCase();
    if (!code) return '$';
    if (_curSymCache[code] !== undefined) return _curSymCache[code];
    var sym = code;
    try {
      var parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(0);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'currency') { sym = parts[i].value; break; }
      }
    } catch (e) { /* invalid ISO code -> render the code as-is */ }
    _curSymCache[code] = sym;
    return sym;
  }
  // currencyOf(rows[, getter]) -> { code, mixed, codes[] }. code = the single
  // currency every row shares (or '' if none carry one); mixed = true when the
  // set spans >1 distinct currency, i.e. a blended sum would be meaningless and
  // the caller should show a guard instead of a number. getter(row) overrides
  // the default row.currency / row.Currency lookup.
  function currencyOf(rows, getter) {
    var set = {}, list = rows || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var c = getter ? getter(r) : (r && (r.currency != null ? r.currency : r.Currency));
      c = (c == null ? '' : String(c)).trim().toUpperCase();
      if (c) set[c] = true;
    }
    var codes = Object.keys(set);
    if (codes.length <= 1) return { code: codes[0] || '', mixed: false, codes: codes };
    return { code: '', mixed: true, codes: codes };
  }
  global.RRV8.currencySymbol = currencySymbol;
  global.RRV8.currencyOf     = currencyOf;
})(window);
