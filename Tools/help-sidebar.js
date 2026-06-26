/* ============================================================
   help-sidebar.js — builds the shared, right-docked help panel and
   wires the standardized Administrator help triggers to it.

   Two triggers, same panel:
     1. Standard: a dark "?" circle injected into the page header next
        to .topbar-home, from <body data-help-src> / <body data-help-title>.
     2. Legacy: any .help-pill[data-help-src] in the page (being
        migrated to the circle page-by-page).

   - data-help-src   : doc URL, may include a #topic hash.
   - data-help-title : panel title bar text.

   The iframe src gets ?embed=1 inserted before any #hash so the
   embedded doc renders content-only (doc-chrome.js honors embed).

   COMPANION model: opening the panel adds .help-open to <html>, which
   reflows the work page to make room beside the panel (help-sidebar.css)
   rather than covering it. There is no scrim and focus is NOT moved — the
   page stays fully interactive so the user reads help while working. Close
   with the × button, Escape, or by clicking the "?" trigger again.
   No dependencies.
============================================================ */
(function () {
  'use strict';

  // The standardized header "?" glyph (matches the doc-help icon used elsewhere).
  var HELP_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
    '</svg>';

  function init() {
    var pills = document.querySelectorAll('.help-pill[data-help-src]');
    var bodySrc = document.body.getAttribute('data-help-src');
    if (!pills.length && !bodySrc) return;

    var helpBtn = null;  // the header "?" trigger, if this page has one

    var drawer = document.createElement('aside');
    drawer.className = 'help-drawer';
    drawer.setAttribute('role', 'complementary');  // companion, not a modal dialog
    drawer.setAttribute('aria-label', 'Help');
    drawer.innerHTML =
      '<div class="help-drawer-head">' +
        '<span class="help-drawer-title"></span>' +
        '<button type="button" class="help-drawer-close" aria-label="Close help">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<iframe class="help-drawer-frame" title="Help content" loading="lazy"></iframe>';

    document.body.appendChild(drawer);

    var titleEl  = drawer.querySelector('.help-drawer-title');
    var frame    = drawer.querySelector('.help-drawer-frame');
    var closeBtn = drawer.querySelector('.help-drawer-close');

    // Insert embed=1 as a query param BEFORE any #hash, preserving the hash so
    // the SPA doc still deep-links to its topic.
    function embedSrc(src) {
      var hashIdx = src.indexOf('#');
      var hash = hashIdx >= 0 ? src.slice(hashIdx) : '';
      var base = hashIdx >= 0 ? src.slice(0, hashIdx) : src;
      var sep  = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'embed=1' + hash;
    }

    function isOpen() { return drawer.classList.contains('is-open'); }

    function openSrc(src, title) {
      titleEl.textContent = title || 'How this works';
      var want = embedSrc(src);
      // Reload only when the target changes — keeps the panel snappy on reopen.
      if (frame.getAttribute('src') !== want) frame.setAttribute('src', want);
      document.documentElement.classList.add('help-open');  // reflow the page beside the panel
      drawer.classList.add('is-open');
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'true');
      // Companion panel: do NOT move focus — the page keeps the user's focus.
    }

    function close() {
      document.documentElement.classList.remove('help-open');
      drawer.classList.remove('is-open');
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'false');
    }

    // Standard trigger: inject the "?" circle into the header next to Home.
    if (bodySrc) {
      var btnTitle = document.body.getAttribute('data-help-title') || 'How this works';
      helpBtn = document.createElement('button');
      helpBtn.type = 'button';
      helpBtn.className = 'topbar-help';
      helpBtn.setAttribute('aria-label', btnTitle);
      helpBtn.setAttribute('title', btnTitle);
      helpBtn.setAttribute('aria-expanded', 'false');
      helpBtn.innerHTML = HELP_ICON;
      // The circle toggles the companion panel open/closed.
      helpBtn.addEventListener('click', function () {
        if (isOpen()) close(); else openSrc(bodySrc, btnTitle);
      });

      var home = document.querySelector('.topbar-home');
      if (home && home.parentNode) {
        home.parentNode.insertBefore(helpBtn, home);
        // When Home is the auto-pushed right-edge item (no .topbar-extras
        // wrapper), carry the auto margin on the circle so [?][Home] cluster
        // together at the right rather than the circle drifting left.
        if (!(home.closest && home.closest('.topbar-extras'))) {
          helpBtn.style.marginLeft = 'auto';
          home.style.marginLeft = '10px';
        }
      } else {
        // No header Home (non-standard page) — fall back to a fixed circle.
        helpBtn.style.position = 'fixed';
        helpBtn.style.right = '22px';
        helpBtn.style.bottom = '22px';
        helpBtn.style.width = '46px';
        helpBtn.style.height = '46px';
        helpBtn.style.zIndex = '90';
        document.body.appendChild(helpBtn);
      }
    }

    // Legacy trigger: wire any in-page .help-pill elements.
    for (var i = 0; i < pills.length; i++) {
      (function (p) {
        p.addEventListener('click', function () {
          openSrc(p.getAttribute('data-help-src'), p.getAttribute('data-help-title'));
        });
      })(pills[i]);
    }
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    // Contextual scroll: while the panel is OPEN, clicking any control that
    // carries data-help-topic="anchor-id" scrolls the embedded doc to that
    // section's heading. The control's own action (open a modal, etc.) still
    // runs — we never preventDefault; we just nudge the help alongside it.
    // No-op when the panel is closed, so a plain Edit click stays a plain edit.
    function scrollHelpTo(anchorId) {
      if (!anchorId) return;
      try {
        var doc = frame.contentDocument;
        if (!doc) return;
        var el = doc.getElementById(anchorId);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) { /* iframe not ready / cross-origin — ignore */ }
    }
    document.addEventListener('click', function (e) {
      if (!isOpen()) return;
      var t = e.target.closest ? e.target.closest('[data-help-topic]') : null;
      if (t) scrollHelpTo(t.getAttribute('data-help-topic'));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
