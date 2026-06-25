/* ============================================================
   help-modal.js — injects a floating "?" Help FAB (bottom-right)
   that opens a centered modal embedding an admin doc section in an
   <iframe>. The page opts in by declaring on <body>:
     data-help-src   : doc URL, may include a #topic hash
     data-help-title : modal title-bar text
   ?embed=1 is inserted before any #hash so the embedded doc renders
   content-only (doc-chrome.js honors it; SPA docs hide their chrome
   via .doc-embed). Closes on the close button, scrim, or Escape.
   Replaces the older right-docked help-sidebar.js for admin pages.
   No dependencies.
============================================================ */
(function () {
  'use strict';

  function init() {
    var src = document.body.getAttribute('data-help-src');
    if (!src) return;
    var title = document.body.getAttribute('data-help-title') || 'How this works';

    var fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'help-fab';
    fab.setAttribute('aria-label', title);
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
      '</svg><span class="help-fab-label">Help</span>';

    var scrim = document.createElement('div');
    scrim.className = 'help-modal-scrim';

    var modal = document.createElement('div');
    modal.className = 'help-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Help');
    modal.innerHTML =
      '<div class="help-modal-head">' +
        '<span class="help-modal-title"></span>' +
        '<button type="button" class="help-modal-close" aria-label="Close help">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<iframe class="help-modal-frame" title="Help content" loading="lazy"></iframe>';

    document.body.appendChild(fab);
    document.body.appendChild(scrim);
    document.body.appendChild(modal);

    var titleEl  = modal.querySelector('.help-modal-title');
    var frame    = modal.querySelector('.help-modal-frame');
    var closeBtn = modal.querySelector('.help-modal-close');
    var lastFocus = null;
    var loaded = false;

    // Insert embed=1 as a query param BEFORE any #hash, preserving the hash.
    function embedSrc(s) {
      var h = s.indexOf('#');
      var hash = h >= 0 ? s.slice(h) : '';
      var base = h >= 0 ? s.slice(0, h) : s;
      var sep = base.indexOf('?') >= 0 ? '&' : '?';
      return base + sep + 'embed=1' + hash;
    }

    function open() {
      lastFocus = document.activeElement;
      titleEl.textContent = title;
      if (!loaded) { frame.setAttribute('src', embedSrc(src)); loaded = true; }  // lazy: load on first open
      scrim.classList.add('is-open');
      modal.classList.add('is-open');
      closeBtn.focus();
    }
    function close() {
      scrim.classList.remove('is-open');
      modal.classList.remove('is-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    fab.addEventListener('click', open);
    scrim.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
