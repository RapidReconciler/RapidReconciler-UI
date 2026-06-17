/* ============================================================
   help-sidebar.js — wires every .help-pill[data-help-src] on the
   page to a single shared, right-docked slide-in panel that embeds
   an admin doc section in an <iframe>.

   - data-help-src   : doc URL, may include a #topic hash.
   - data-help-title : panel title bar text.

   The iframe src gets ?embed=1 inserted before any #hash so the
   embedded doc renders content-only (doc-chrome.js honors embed).
   Closes on the close button, the scrim, or Escape. The page stays
   visible behind a light scrim so the user reads while looking at it.
   No dependencies.
============================================================ */
(function () {
  'use strict';

  function init() {
    var pills = document.querySelectorAll('.help-pill[data-help-src]');
    if (!pills.length) return;

    var scrim = document.createElement('div');
    scrim.className = 'help-scrim';

    var drawer = document.createElement('aside');
    drawer.className = 'help-drawer';
    drawer.setAttribute('role', 'dialog');
    // Non-modal: the page behind stays usable; the user reads alongside it.
    drawer.setAttribute('aria-modal', 'false');
    drawer.setAttribute('aria-label', 'Help');
    drawer.innerHTML =
      '<div class="help-drawer-head">' +
        '<span class="help-drawer-title"></span>' +
        '<button type="button" class="help-drawer-close" aria-label="Close help">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<iframe class="help-drawer-frame" title="Help content" loading="lazy"></iframe>';

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    var titleEl  = drawer.querySelector('.help-drawer-title');
    var frame    = drawer.querySelector('.help-drawer-frame');
    var closeBtn = drawer.querySelector('.help-drawer-close');
    var lastFocus = null;

    // Insert embed=1 as a query param BEFORE any #hash, preserving the hash so
    // the SPA doc still deep-links to its topic.
    function embedSrc(src) {
      var hashIdx = src.indexOf('#');
      var hash = hashIdx >= 0 ? src.slice(hashIdx) : '';
      var base = hashIdx >= 0 ? src.slice(0, hashIdx) : src;
      var sep  = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'embed=1' + hash;
    }

    function open(pill) {
      lastFocus = document.activeElement;
      titleEl.textContent = pill.getAttribute('data-help-title') || 'How this works';
      var want = embedSrc(pill.getAttribute('data-help-src'));
      // Reload only when the target changes — keeps the panel snappy on reopen.
      if (frame.getAttribute('src') !== want) frame.setAttribute('src', want);
      scrim.classList.add('is-open');
      drawer.classList.add('is-open');
      closeBtn.focus();
    }

    function close() {
      scrim.classList.remove('is-open');
      drawer.classList.remove('is-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    for (var i = 0; i < pills.length; i++) {
      (function (p) { p.addEventListener('click', function () { open(p); }); })(pills[i]);
    }
    scrim.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
