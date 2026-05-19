/* ============================================================
   doc-chrome.js — strategy-2 template loader for doc-header.

   Pages opt in by emitting only a minimal placeholder + the
   GHA-managed last-updated span:

     <header class="doc-header" data-doc-chrome>
       <span class="doc-last-updated">Last updated
         <time datetime="2026-05-19">May 19, 2026</time>
       </span>
     </header>
     <script defer src="../Tools/doc-chrome.js"></script>

   On DOMContentLoaded this script generates the full header
   markup (RR logo, doc-kind pill, GSI link) AROUND the existing
   .doc-last-updated span, preserving it so update_doc_dates.py
   (which scans for the literal span in the source HTML) keeps
   working unchanged.

   - body[data-doc-type="howto|reference|runbook"] drives the
     pill text + SVG (matches the same attribute doc-header.css
     uses for accent-stripe coloring).
   - Logo URLs are derived from this script's own .src so the
     same loader works at any folder depth without per-page path
     juggling.
   - If a page has the full header inline (legacy / not yet
     migrated to strategy 2), the loader leaves it alone -- the
     `data-doc-chrome` attribute is the explicit opt-in.

   FOUC note: the placeholder header is empty for ~50-200ms
   before this script runs. The doc-header.css accent stripe
   (4px colored bar via .doc-header::before) is still visible
   during that window, so the page doesn't render with a blank
   gap. Headers fill in by the time the analyst reads past the
   article title.
============================================================ */
(function () {
  'use strict';

  const script = document.currentScript;
  if (!script) return;

  // Script lives at <root>/Tools/doc-chrome.js. Walk up one
  // level to find <root>/Images/ regardless of which page is
  // loading us.
  const scriptURL = new URL(script.src, document.baseURI);
  const toolsURL  = new URL('.',     scriptURL);
  const rootURL   = new URL('..',    toolsURL);
  const imagesURL = new URL('Images/', rootURL);
  const RR_LOGO   = new URL('rr-logo.png',  imagesURL).href;
  const GSI_LOGO  = new URL('gsi-logo.png', imagesURL).href;

  // Pill content by doc-type. Mirrors the inline pill HTML the
  // un-migrated docs still carry; eventually those get migrated
  // and these are the single source of truth.
  const PILLS = {
    runbook: {
      label: 'Runbook',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c-4.5-1.5-8-5.5-8-11V5l8-3 8 3v6c0 5.5-3.5 9.5-8 11z"></path><line x1="9" y1="12" x2="15" y2="12"></line><line x1="12" y1="9" x2="12" y2="15"></line></svg>'
    },
    reference: {
      label: 'Reference document',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>'
    },
    howto: {
      label: 'How-to guide',
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"></path></svg>'
    }
  };

  function render() {
    const header = document.querySelector('header.doc-header[data-doc-chrome]');
    if (!header) return;   // page didn't opt in; legacy inline header stays

    const docType = (document.body.getAttribute('data-doc-type') || 'howto').toLowerCase();
    const pill = PILLS[docType] || PILLS.howto;

    // Preserve the existing last-updated span — update_doc_dates.py
    // writes the date directly into the inline span; we slot it into
    // the generated header rather than rebuilding it.
    const timeSpan = header.querySelector('.doc-last-updated');
    const timeHTML = timeSpan ? timeSpan.outerHTML : '';

    header.innerHTML =
      '<div class="doc-header-inner">' +
        '<div class="doc-header-row">' +
          '<img class="doc-logo" src="' + RR_LOGO + '" alt="RapidReconciler" />' +
          '<div class="doc-header-middle">' +
            '<span class="doc-kind-pill">' + pill.svg + ' ' + pill.label + '</span>' +
            timeHTML +
          '</div>' +
          '<a class="doc-gsi" href="https://www.getgsi.com" target="_blank" rel="noopener" aria-label="GSI">' +
            '<img src="' + GSI_LOGO + '" alt="GSI" />' +
          '</a>' +
        '</div>' +
      '</div>';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
