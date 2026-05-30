/*
 * RRV8 — shared sidebar mount
 *
 * Single source of truth for the V8 left-rail. Replaces the inline
 * <aside class="sidebar"> markup that used to live in every page.
 *
 * Usage (each page calls once at the top of its IIFE):
 *
 *   RRV8.mountSidebar({
 *     activePage:    'reconciliation' | 'transactions' | 'asof' | 'cardex-variance' | 'dmaais',
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
    reconciliation:    'inventory',
    transactions:      'inventory',
    asof:              'inventory',
    'cardex-variance': 'inventory',
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
    const isInventoryPage = activePage === 'reconciliation' || activePage === 'transactions' || activePage === 'asof' || activePage === 'cardex-variance';

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
        <a href="admin-companies.html" class="sidebar-nav-child${cls('admin-companies')}" data-nav-page="admin-companies">Companies</a>
        <a href="admin-users.html" class="sidebar-nav-child${cls('admin-users')}" data-nav-page="admin-users">Users</a>
        <a href="#" class="sidebar-nav-child" data-nav-page="admin-cardex-deletions">Cardex Deletions</a>
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
        <a href="inventory-reconciliation.html" class="sidebar-nav-child${cls('reconciliation')}" data-nav-page="reconciliation">Reconciliation</a>
        <a href="inventory-transactions.html"   class="sidebar-nav-child${cls('transactions')}"   data-nav-page="transactions">Transactions</a>
        <a href="inventory-cardex-variance.html" class="sidebar-nav-child${cls('cardex-variance')}" data-nav-page="cardex-variance">Cardex Variance</a>
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
    try {
      sessionStorage.setItem(AGENT_CONN_LS_KEY, JSON.stringify({
        state: state || 'unknown',
        ts:    Date.now(),
        message: (info && info.message) || undefined
      }));
    } catch (_) {}
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
    // DMAAI dot was seeded into the template by buildSidebarHtml
    // (seedDmaaiStateFromSession), so no post-mount class swap is
    // needed. Pages that actively preload will overwrite the dot
    // state via RRV8.setDmaaiStatus(...).
    applyClientModuleCaps();
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

    function hideModule(dataModule) {
      const el = aside.querySelector('.sidebar-module[data-module="' + dataModule + '"]');
      if (el) el.style.display = 'none';
    }
    if (!cap.inv) hideModule('inventory');
    if (!cap.it)  hideModule('in-transit');
    if (!cap.por) hideModule('po-receipts');
    if (!cap.adm) hideModule('admin');
    if (!cap.dm) {
      // DMAAIs sits in the bottom status panel, not a sidebar-module.
      const dmaai = aside.querySelector('.sidebar-status-row[data-nav-page="dmaais"]');
      if (dmaai) dmaai.style.display = 'none';
    }
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
    const raw = scanSessionForScope('currentPeriod');
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

  // Populate window.RR_SESSION.{user,dbs,activeDbIndex,token}. In
  // demo mode reads data/demo-jwt-payload.json; in staging/prod
  // reads localStorage.rrv8.token. Always resolves — failures leave
  // RR_SESSION empty so renderUserChip falls back to a placeholder.
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
            global.RR_SESSION.activeDbIndex = 0;
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
          global.RR_SESSION.activeDbIndex = 0;
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
        global.RR_SESSION.activeDbIndex = idx;
        renderUserChip();
        buildUserMenu(opts);
        positionUserMenu();
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
          // The hub is the canonical sign-out destination across V8.
          // Walk up from /RRV8/* to the repo root and land on the hub.
          global.location.href = '../rapidreconciler-hub.html';
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

  global.RRV8 = global.RRV8 || {};
  global.RRV8.mountSidebar            = mountSidebar;
  global.RRV8.applyClientModuleCaps   = applyClientModuleCaps;
  global.RRV8.setDmaaiStatus          = setDmaaiStatus;
  global.RRV8.setAgentConnectivity    = setAgentConnectivity;
  global.RRV8.paintSidebarFromCache   = paintSidebarFromCache;
  global.RRV8.publishCurrentPeriod    = publishCurrentPeriod;
  global.RRV8.readCurrentPeriod       = readCurrentPeriod;
  global.RRV8.ensureInventoryStatus   = ensureInventoryStatus;
  global.RRV8.hydrateSession          = hydrateSession;
  global.RRV8.mountUserMenu           = mountUserMenu;
  global.RRV8.renderUserChip          = renderUserChip;
})(window);
