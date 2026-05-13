/* ============================================================
   RRTour — cross-page guided tour for the RapidReconciler Help
   portal. Single shared engine + STEPS array; each page loads
   this same file and either resumes a tour-in-progress (from
   sessionStorage) or sits idle until the cover's entry button
   calls RRTour.start().

   The engine injects its own DOM (spotlight + tooltip card) at
   runtime so pages don't need any tour markup.

   STEPS define a flat ordered walkthrough across five surfaces.
   Each step's `page` field matches the tail of location.pathname;
   when next() advances to a step on a different page, the engine
   saves the upcoming index to sessionStorage and navigates.
============================================================ */
(function () {
  'use strict';

  /* -- Demo content prefilled into searches and the log analyzer during the
        tour. The console paste mirrors a real "agent loaded fine, then a TLS
        cert + caught TypeError" capture — picked because the analyzer pulls
        two critical signals out of the noise, which makes a striking demo.
        The agent slice is sanitized (real UUIDs / IPs / credentials removed)
        but otherwise representative of a healthy heartbeat run with a couple
        of routine SqlExceptionHelper WARNs that the analyzer suppresses. -- */
  var DEMO_CONSOLE = [
    'base.js:5 URL visited /page/login',
    'font-awesome.min.css:1  GET https://staging-rr-spa.azurewebsites.net/vendor/fontawesome/fonts/fontawesome-webfont.woff?v=4.2.0 net::ERR_ABORTED 404 (Not Found)',
    'app.js:13235 null',
    'app.js:13236 0',
    'base.js:5 TypeError: Cannot read properties of null (reading \'message\')',
    '    at app.js:13238:32',
    '    at base.js:5:9410',
    '    at u (base.js:5:26119)',
    '    at f.$eval (base.js:6:1395)',
    '    at f.$digest (base.js:5:31927)',
    '    at f.$apply (base.js:6:1662)',
    '    at XMLHttpRequest.x (base.js:5:12250)',
    '(anonymous) @ base.js:5',
    '$eval @ base.js:6',
    '$digest @ base.js:5',
    '$apply @ base.js:6',
    'XMLHttpRequest.send',
    'base.js:5  POST https://staging-valcspa.cloudapp.net/resource/client/login net::ERR_CERT_DATE_INVALID'
  ].join('\n');

  var DEMO_AGENT = [
    '2026-05-11 00:03:53.619  INFO 2208 --- [   scheduling-1] c.r.agent.jms.ValcOutbound               : Sending heartbeat. States: [RunningInstanceState(uuid=instance-a, errorMessage=null, port=36313, up=true, revisionNumber=178, dbSystemStatus=success), RunningInstanceState(uuid=instance-b, errorMessage=null, port=35390, up=true, revisionNumber=178, dbSystemStatus=success)]',
    '2026-05-11 00:03:54.288  WARN 2208 --- [global-threads)] o.h.engine.jdbc.spi.SqlExceptionHelper   : SQL Warning Code: 10000, SQLState: 01J01',
    '2026-05-11 00:03:54.288  WARN 2208 --- [global-threads)] o.h.engine.jdbc.spi.SqlExceptionHelper   : Database \'db\' not created, connection made to existing database instead.',
    '2026-05-11 00:04:25.177  INFO 2208 --- [   scheduling-1] c.r.agent.jms.ValcOutbound               : Sending heartbeat. States: [RunningInstanceState(uuid=instance-a, errorMessage=null, port=36313, up=true, revisionNumber=178, dbSystemStatus=success), RunningInstanceState(uuid=instance-b, errorMessage=null, port=35390, up=true, revisionNumber=178, dbSystemStatus=success)]'
  ].join('\n');

  /* Helper used by demo actions: set an input/textarea value and notify
     listeners (Lunr search, scenario matcher, and the log analyzer's
     debounced auto-analyze all listen for "input"). */
  function fillInput(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* -- The flat step list. `page` is matched against pathname suffix. -- */
  var STEPS = [
    {
      page: 'rapidreconciler-help.html',
      type: 'center',
      title: 'Welcome to the RapidReconciler Help portal',
      body: 'A quick tour of the five surfaces — knowledge base, troubleshooting hub, workbook analyzer, log analyzer. We\'ll fill the searches and run the analyzer for you as we go, so you can see each surface working.'
    },
    {
      page: 'rapidreconciler-help.html',
      type: 'spotlight',
      target: '.destinations',
      placement: 'top',
      title: 'Three customer-facing surfaces',
      body: 'University for how-to. Help Desk for troubleshooting. RapidReconciler Export Analyzer for turning a supported export into a formatted analysis workbook. We\'ll stop on each of them next.'
    },
    {
      page: 'RRUniversity/rapidreconciler-university.html',
      type: 'spotlight',
      target: '#docSearch',
      placement: 'bottom',
      action: function (el) { fillInput(el, 'GL class'); },
      actionDelay: 1500,
      title: 'Knowledge-base search',
      body: 'Type a keyword or a question — results filter live. We\'ve searched <strong>"GL class"</strong> for you to demo it.'
    },
    {
      page: 'RRUniversity/rapidreconciler-university.html',
      type: 'spotlight',
      target: '#resultsPanel',
      placement: 'top',
      action: function () { fillInput(document.getElementById('docSearch'), 'GL class'); },
      actionDelay: 200,
      title: 'Live results, grouped by document',
      body: 'Results are scored by relevance and grouped by document. Click any section anchor to jump straight to that paragraph.'
    },
    {
      page: 'RRUniversity/rapidreconciler-university.html',
      type: 'spotlight',
      target: '.module-pills',
      placement: 'bottom',
      title: 'Filter by your module',
      body: 'Toggle Inventory, A/P, Transfers, or Administrators to scope search to the docs you actually use. Defaults to Inventory — your last choice is remembered.'
    },
    {
      page: 'HelpDesk/troubleshooting.html',
      type: 'spotlight',
      target: '#ts-search',
      placement: 'bottom',
      action: function (el) { fillInput(el, 'system status light is red'); },
      actionDelay: 1500,
      title: 'Paste an error or describe a symptom',
      body: 'Drop a Copilot-summarized email, a stack trace, or plain-language description. We\'ve typed <strong>"system status light is red"</strong> for you — matching runbooks surface as you type.'
    },
    {
      page: 'HelpDesk/troubleshooting.html',
      type: 'spotlight',
      target: '#ts-results-panel',
      placement: 'top',
      action: function () { fillInput(document.getElementById('ts-search'), 'system status light is red'); },
      actionDelay: 200,
      title: 'Matching runbooks',
      body: 'Each result links to a step-by-step runbook. Most end in either a self-resolution path or a one-click "Generate IT email" handoff.'
    },
    {
      page: 'Tools/analysis-workbook.html',
      type: 'spotlight',
      target: '#step1',
      placement: 'right',
      title: 'Drop an .xlsx export',
      body: 'Drag any of the <strong>supported</strong> RapidReconciler exports onto the Step 1 card. The template auto-detects from the file\'s columns and sheet name — eight supported reports across DMAAI, GL Class, Cardex, and more.'
    },
    {
      page: 'Tools/analysis-workbook.html',
      type: 'spotlight',
      target: '.supported-reports',
      placement: 'bottom',
      action: function (el) { if (el && el.tagName === 'DETAILS') el.open = true; },
      title: 'Eight supported reports',
      body: 'Open this panel any time to see exactly where each supported report lives inside RapidReconciler. Everything runs in your browser — no data leaves your machine.'
    },
    {
      page: 'HelpDesk/log-analyzer.html',
      type: 'spotlight',
      target: '.input-card[data-mode="console"]',
      placement: 'right',
      action: function () { fillInput(document.getElementById('input-console'), DEMO_CONSOLE); },
      actionDelay: 600,
      title: 'Browser console paste',
      body: 'We pasted a real console capture — a TLS cert failure plus a caught TypeError, wrapped in font-fallback 404s and AngularJS stack frames. The analyzer surfaces the two critical signals and suppresses the noise. <strong>Verdict appears below.</strong>'
    },
    {
      page: 'HelpDesk/log-analyzer.html',
      type: 'spotlight',
      target: '.input-card[data-mode="agent"]',
      placement: 'left',
      action: function () { fillInput(document.getElementById('input-agent'), DEMO_AGENT); },
      actionDelay: 600,
      title: 'RR agent log paste',
      body: 'Now a healthy agent <code>.out.log</code> slice — two heartbeats plus two routine SqlExceptionHelper WARNs. The analyzer recognizes the Hibernate noise as benign and clears the run. <strong>Verdict refreshes below.</strong>'
    },
    {
      page: 'rapidreconciler-help.html',
      type: 'center',
      title: 'You\'re set',
      body: 'Pick a destination card below to get started. You can re-launch this tour any time from the link in the top banner.'
    }
  ];

  var STORAGE_KEY = 'rrtour-v1';
  var BASE_PATH = null;       // lazily-computed once we know our own script path

  /* -- Pathname helpers ------------------------------------------------ */

  /* Returns the pathname trailing segment used to match a step's `page`.
     Examples:
       /RapidReconciler-AI/rapidreconciler-help.html        -> rapidreconciler-help.html
       /RapidReconciler-AI/RRUniversity/rapidreconciler-university.html
           -> RRUniversity/rapidreconciler-university.html
       /                                                    -> '' (root index)
     Comparison is suffix-based so the tour works under any deploy prefix
     (GitHub Pages /RapidReconciler-AI/, local file://, etc.). */
  function currentPageKey() {
    var path = location.pathname.replace(/\\/g, '/');
    if (path.endsWith('/')) path += 'rapidreconciler-help.html';
    var parts = path.split('/').filter(Boolean);
    if (!parts.length) return '';
    var last = parts[parts.length - 1];
    var prev = parts.length >= 2 ? parts[parts.length - 2] : '';
    // Two-segment pages live in subfolders we care about.
    if (prev && /^(RRUniversity|HelpDesk|Tools)$/i.test(prev)) {
      return prev + '/' + last;
    }
    return last;
  }

  /* Resolve the URL to navigate to for a given step's `page`, relative to
     the current location. The script's own URL tells us where the repo
     root is from this page. */
  function urlForPage(page) {
    // <script src="..."> we were loaded from is the most reliable anchor.
    if (BASE_PATH === null) {
      try {
        var s = document.currentScript;
        if (!s) {
          var all = document.getElementsByTagName('script');
          for (var i = 0; i < all.length; i++) {
            if (all[i].src && all[i].src.indexOf('tour.js') !== -1) { s = all[i]; break; }
          }
        }
        // tour.js lives in Tools/, so its parent is the repo root.
        var src = s && s.src ? s.src : (location.origin + location.pathname);
        BASE_PATH = src.replace(/[^/]*$/, '').replace(/Tools\/?$/, '');
      } catch (e) {
        BASE_PATH = '';
      }
    }
    return BASE_PATH + page;
  }

  /* -- DOM injection --------------------------------------------------- */

  var spotlight = null;
  var tooltip = null;
  var titleEl = null;
  var bodyEl = null;
  var progressEl = null;
  var backBtn = null;
  var nextBtn = null;

  function ensureDom() {
    if (spotlight && tooltip) return;
    spotlight = document.createElement('div');
    spotlight.className = 'rrtour-spotlight hidden';
    spotlight.id = 'rrtour-spotlight';
    document.body.appendChild(spotlight);

    tooltip = document.createElement('div');
    tooltip.className = 'rrtour-tooltip hidden';
    tooltip.id = 'rrtour-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-live', 'polite');
    tooltip.innerHTML =
      '<div class="rrtour-progress" id="rrtour-progress"></div>' +
      '<h3 class="rrtour-title" id="rrtour-title"></h3>' +
      '<div class="rrtour-body" id="rrtour-body"></div>' +
      '<div class="rrtour-buttons">' +
        '<button class="rrtour-btn rrtour-btn-secondary" id="rrtour-back" type="button">Back</button>' +
        '<button class="rrtour-btn" id="rrtour-next" type="button">Next</button>' +
        '<button class="rrtour-skip" id="rrtour-skip" type="button">Skip tour</button>' +
      '</div>';
    document.body.appendChild(tooltip);

    titleEl = document.getElementById('rrtour-title');
    bodyEl = document.getElementById('rrtour-body');
    progressEl = document.getElementById('rrtour-progress');
    backBtn = document.getElementById('rrtour-back');
    nextBtn = document.getElementById('rrtour-next');
    var skipBtn = document.getElementById('rrtour-skip');

    backBtn.addEventListener('click', back);
    nextBtn.addEventListener('click', next);
    skipBtn.addEventListener('click', finish);
  }

  /* -- State / sessionStorage ----------------------------------------- */

  var idx = -1;
  var onScroll = null;
  var onResize = null;

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ active: true, idx: idx }));
    } catch (e) { /* ignore quota / privacy mode */ }
  }
  function clearState() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }
  function readState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.active && typeof parsed.idx === 'number') return parsed;
    } catch (e) {}
    return null;
  }

  /* -- Step rendering -------------------------------------------------- */

  function show(i) {
    if (i < 0 || i >= STEPS.length) { finish(); return; }
    idx = i;
    var step = STEPS[i];
    var pageKey = currentPageKey();

    // If this step belongs to a different page, save and navigate.
    if (step.page !== pageKey) {
      saveState();
      location.assign(urlForPage(step.page));
      return;
    }

    ensureDom();

    progressEl.textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
    titleEl.textContent = step.title;
    bodyEl.innerHTML = step.body; // body strings are author-controlled
    backBtn.style.visibility = (i === 0) ? 'hidden' : 'visible';
    nextBtn.textContent = (i === STEPS.length - 1) ? 'Finish' : 'Next';

    if (step.type === 'center') {
      spotlight.classList.remove('hidden');
      spotlight.classList.add('center-mode');
      spotlight.style.top = '';
      spotlight.style.left = '';
      spotlight.style.width = '';
      spotlight.style.height = '';
      tooltip.classList.remove('hidden');
      tooltip.classList.add('center');
      tooltip.style.top = '';
      tooltip.style.left = '';
      attachReposition();
      saveState();
      return;
    }

    spotlight.classList.remove('center-mode');
    tooltip.classList.remove('center');
    var target = document.querySelector(step.target);
    if (!target) {
      // Target missing on this page — skip forward rather than getting stuck.
      console.warn('[RRTour] target not found:', step.target, 'on', pageKey);
      show(i + 1);
      return;
    }

    if (typeof step.action === 'function') {
      var runAction = function () {
        try { step.action(target); } catch (e) { /* non-fatal */ }
      };
      // Demo actions (typing into a search input, pasting log content, etc.)
      // often need to wait for the page's own JS to finish wiring up — Lunr
      // index loading on University, scenario-index fetch on the Help Desk,
      // etc. step.actionDelay lets each step opt into that wait.
      if (step.actionDelay) setTimeout(runAction, step.actionDelay);
      else runAction();
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { positionAt(target, step.placement || 'bottom'); }, 320);

    attachReposition();
    saveState();
  }

  function positionAt(target, placement) {
    if (!spotlight || !tooltip) return;
    var rect = target.getBoundingClientRect();
    var pad = 6;
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
    spotlight.classList.remove('hidden');
    tooltip.classList.remove('hidden');

    var tw = tooltip.offsetWidth || 380;
    var th = tooltip.offsetHeight || 200;
    var margin = 14;
    var top, left;

    if (placement === 'right') {
      left = rect.right + margin;
      top = rect.top + (rect.height - th) / 2;
      if (left + tw > window.innerWidth - 20) { left = rect.left; top = rect.bottom + margin; }
    } else if (placement === 'left') {
      left = rect.left - tw - margin;
      top = rect.top + (rect.height - th) / 2;
      if (left < 20) { left = rect.left; top = rect.bottom + margin; }
    } else if (placement === 'top') {
      top = rect.top - th - margin;
      left = rect.left;
      if (top < 20) top = rect.bottom + margin;
    } else { // bottom
      top = rect.bottom + margin;
      left = rect.left;
    }

    if (left + tw > window.innerWidth - 20) left = window.innerWidth - tw - 20;
    if (left < 20) left = 20;
    if (top + th > window.innerHeight - 20) top = window.innerHeight - th - 20;
    if (top < 20) top = 20;

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function repositionCurrent() {
    var step = STEPS[idx];
    if (!step || step.type === 'center') return;
    var target = document.querySelector(step.target);
    if (target) positionAt(target, step.placement || 'bottom');
  }

  function attachReposition() {
    if (onScroll) return;
    onScroll = function () { repositionCurrent(); };
    onResize = function () { repositionCurrent(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
  }
  function detachReposition() {
    if (onScroll) { window.removeEventListener('scroll', onScroll); onScroll = null; }
    if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  }

  function next() { show(idx + 1); }
  function back() { show(idx - 1); }

  function finish() {
    if (spotlight) spotlight.classList.add('hidden');
    if (tooltip) tooltip.classList.add('hidden');
    detachReposition();
    clearState();
    idx = -1;
  }

  function start(fromIdx) {
    var startIdx = (typeof fromIdx === 'number') ? fromIdx : 0;
    var startStep = STEPS[startIdx];
    if (!startStep) return;
    if (startStep.page !== currentPageKey()) {
      idx = startIdx;
      saveState();
      location.assign(urlForPage(startStep.page));
      return;
    }
    ensureDom();
    show(startIdx);
  }

  /* -- Keyboard nav (only when a tour step is visible) ----------------- */
  document.addEventListener('keydown', function (e) {
    if (!tooltip || tooltip.classList.contains('hidden')) return;
    if (e.key === 'Escape') { finish(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { back(); }
  });

  /* -- Auto-resume on page load --------------------------------------- */
  function autoResume() {
    var state = readState();
    if (!state) return;
    var pageKey = currentPageKey();
    // Find the first step at or after the saved idx that matches this page.
    for (var i = state.idx; i < STEPS.length; i++) {
      if (STEPS[i].page === pageKey) {
        // Slight delay so the page's own DOMContentLoaded handlers settle first.
        setTimeout(function (k) { return function () { show(k); }; }(i), 80);
        return;
      }
    }
    // Tour is mid-flight but no remaining step lives on this page — let it sit.
    // The user navigated off-tour; nothing visible happens until they re-enter
    // the flow from the cover (which calls finish()/start() afresh).
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoResume);
  } else {
    autoResume();
  }

  /* -- Public API ------------------------------------------------------ */
  window.RRTour = { start: start, next: next, back: back, finish: finish };
})();
