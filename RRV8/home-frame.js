/* home-frame.js -- the parts of Home's frame that every module landing page shares (UI-240 slice 2).
 *
 * Home (RRV8/home.html, the Inventory module) and In Transit (RRV8/transit.html) look the same and work the
 * same: the owner's ruling (2026-11-05) is that a user switching modules sees very little difference in the
 * screens. The stylesheet is shared as RRV8/home-frame.css. This file is the JavaScript half: the pieces of
 * the bottom-right cluster that would otherwise be copied into each page and drift.
 *
 *   RRFrame.modules()                    the modules a customer can license, in V7's order
 *   RRFrame.moduleMenuHtml(caps, current) the Module pill's menu markup
 *   RRFrame.wireUniSearch()              the RR University pill's search popover (UI-229)
 *
 * Loaded by both pages before their inline scripts, NOT deferred: Home's wire() calls wireUniSearch() and
 * its _homeModules() / _moduleMenuHtml() delegate here. Tools/test-module-pill.js and
 * Tools/test-uni-search.js run this file's source.
 */
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // ---- Module picker (bottom cluster, slot 3) -------------------------------
  // The modules a customer can license, in V7's order. `cap` is the caps() key that
  // decides whether the module appears AT ALL: one the client has not ticked on
  // VALC Client Details (m) or the user is not granted (t) is left out of the markup
  // entirely, never rendered-and-hidden. Inventory is always listed: Home is the
  // Inventory module, so the pill names a module on a token that licenses nothing
  // else. `live: false` renders a disabled "Coming soon" row.
  //
  // TO ADD A MODULE when its V8 pages ship: set `live: true` and give it `href` (its
  // landing page). Each page's menu handler navigates to `href`; nothing else in the
  // picker changes. Nothing is persisted: a module's own page is where you are in it.
  function modules() {
    return [
      { key: 'inv', cap: 'inv', label: 'Inventory',   live: true, always: true, href: 'home.html' },
      // UI-240 (owner 2026-11-05, "Turn it on now"): live with the landing page, before its drill-ins ship.
      { key: 'it',  cap: 'it',  label: 'In Transit',  live: true, href: 'transit.html' },
      { key: 'por', cap: 'por', label: 'PO Receipts', live: false }
    ];
  }
  // Pure: capability object in, menu markup out. `current` is the module the page belongs to.
  function moduleMenuHtml(c, current) {
    return modules().filter(function (mod) {
      return mod.always || (c && c[mod.cap] === true);
    }).map(function (mod) {
      if (!mod.live) {
        return '<button type="button" class="umr-opt ha-mod-soon" data-module="' + esc(mod.key) + '" disabled aria-disabled="true">'
             + esc(mod.label) + ' <span class="ha-mod-soon-tag">Coming soon</span></button>';
      }
      var on = mod.key === current;
      return '<button type="button" class="umr-opt' + (on ? ' is-active' : '') + '" data-module="' + esc(mod.key) + '"'
           + (on ? ' aria-current="true"' : '') + '>' + esc(mod.label) + '</button>';
    }).join('');
  }

  // ---- RR University pill (bottom cluster) -----------------------------------
  // Moved here from Home's wire() unchanged, so In Transit's pill is the same control. The page provides
  // window.rrUserModules (the University module keys this user can reach) and loads Tools/home-search.js.
  function wireUniSearch() {
    // UI-229. RR University search: no AI, scoped to the modules this user can access. Tools/home-search.js
    // loads Lunr and the section index on the first keystroke and keeps them. A read that fails says so in the
    // popover and points at the full University, rather than looking like "no results".
    var haUniBtn = $('haHelp'), haUniMenu = $('haUniMenu'), haUniQ = $('haUniQ');
    if (haUniBtn && haUniMenu && haUniQ) {
      var UNI_HOME = '../RRUniversity/rapidreconciler-university.html';
      var UNI_NAMES = { inventory: 'Inventory', ap: 'A/P', transfers: 'Transfers', administrators: 'Administrators' };
      var uniSeq = 0, uniTimer = null;
      var uniModules = function () {
        var m = (typeof window.rrUserModules === 'function') ? window.rrUserModules() : [];
        return m && m.length ? m : null;   // nothing known: search every guide rather than none
      };
      var uniEsc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; });
      };
      var uniFullHref = function (q) { return q ? UNI_HOME + '?q=' + encodeURIComponent(q) : UNI_HOME; };
      var closeUni = function () { haUniMenu.hidden = true; haUniBtn.setAttribute('aria-expanded', 'false'); };
      var runUni = function () {
        var q = haUniQ.value.trim(), out = $('haUniResults'), seq = ++uniSeq;
        $('haUniAll').href = uniFullHref(q);
        $('haUniAll').innerHTML = q ? 'See every result in RR University &#8599;' : 'Open RR University &#8599;';
        if (!q) { out.innerHTML = ''; return; }
        if (!window.HomeSearch) {
          out.innerHTML = '<div class="ha-uni-note is-err">The search did not load. Open RR University below to search there.</div>';
          return;
        }
        out.innerHTML = '<div class="ha-uni-note">Searching&hellip;</div>';
        window.HomeSearch.university(q, { modules: uniModules(), limit: 8 }).then(function (hits) {
          if (seq !== uniSeq) return;   // a newer keystroke won
          out.innerHTML = hits.length
            ? hits.map(function (h) {
                return '<a class="ha-uni-hit" href="' + uniEsc(h.href) + '" target="_blank" rel="noopener"><b>'
                  + uniEsc(h.sectionTitle || h.pageTitle) + '</b><span>' + uniEsc(h.pageTitle) + '</span></a>';
              }).join('')
            : '<div class="ha-uni-note">No guide section matches &ldquo;' + uniEsc(q) + '&rdquo;.</div>';
        }).catch(function (err) {
          if (seq !== uniSeq) return;
          out.innerHTML = '<div class="ha-uni-note is-err">The search could not load (' + uniEsc(err && err.message ? err.message : 'unknown error')
            + '). Open RR University below to search there.</div>';
        });
      };
      haUniBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = haUniMenu.hidden;
        haUniMenu.hidden = !willOpen;
        haUniBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (willOpen) {
          var m = uniModules();
          $('haUniScope').textContent = m
            ? 'Guides for ' + m.map(function (k) { return UNI_NAMES[k] || k; }).join(', ') + ', plus the general guides.'
            : 'All guides.';
          haUniQ.focus();
        }
      });
      haUniMenu.addEventListener('click', function (e) {
        e.stopPropagation();
        if (e.target.closest && e.target.closest('a')) closeUni();   // a result or the full page opens in a new tab
      });
      haUniQ.addEventListener('input', function () { clearTimeout(uniTimer); uniTimer = setTimeout(runUni, 180); });
      $('haUniForm').addEventListener('submit', function (e) {
        e.preventDefault();
        window.open(uniFullHref(haUniQ.value.trim()), '_blank', 'noopener');
        closeUni();
      });
      document.addEventListener('click', function () { if (!haUniMenu.hidden) closeUni(); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !haUniMenu.hidden) { closeUni(); haUniBtn.focus(); }
      });
    }
    // END UI-229 popover
  }

  // ---- Clearance below the page for the bottom cluster ----------------------
  // #homeActions is fixed to the viewport bottom and wraps onto more rows as the window narrows or as
  // controls appear (the Company pill, the role switcher, the AI dock that sidebar.js mounts into it).
  // The page has to end far enough above it that the last content can always be scrolled clear. That
  // used to be a constant (.home-main 96px + .wrap 56px = 152px), measured on 2026-11-05:
  //   1440 / 1280 / 1024 / 900 wide: 2 rows, 107px tall, 45px to spare
  //   768 wide:                      3 rows, 153px tall, 1px short
  // and a fourth row would cover content. So the clearance is measured, as sidebar.js measures
  // --dock-clear (UI-163): --ha-clear is set on <html>, and home-frame.css pads .home-main by
  // max(96px, --ha-clear). Where 96px already clears the cluster nothing moves.
  var CLUSTER_GAP = 16;   // between the last content and the cluster's top row
  // Pure: the bottom padding .home-main needs, from the rects of the cluster's controls, the viewport
  // height and .wrap's own bottom padding (which already counts toward the clearance). Hidden controls
  // have empty rects and are skipped; with none shown, nothing is needed. Tools/test-cluster-clearance.js.
  function clusterClearance(rects, viewportH, wrapPad) {
    var top = Infinity;
    for (var i = 0; i < rects.length; i++) { var r = rects[i]; if (r && r.width > 0 && r.height > 0 && r.top < top) top = r.top; }
    if (top === Infinity) return 0;
    return Math.max(0, Math.ceil(viewportH - top) + CLUSTER_GAP - (wrapPad || 0));
  }
  function syncClusterClearance() {
    var ha = $('homeActions'); if (!ha) return;
    var rects = Array.prototype.map.call(ha.children, function (k) { return k.getBoundingClientRect(); });
    var wrap = document.querySelector('.wrap');
    var wrapPad = wrap ? (parseFloat(getComputedStyle(wrap).paddingBottom) || 0) : 0;
    document.documentElement.style.setProperty('--ha-clear', clusterClearance(rects, window.innerHeight, wrapPad) + 'px');
  }
  // The cluster changes height when it wraps (a resize) or when a control appears or goes (its own
  // box resizes), so both are watched. ResizeObserver also reports once on observe(), which sets the
  // first value.
  function watchClusterClearance() {
    var ha = $('homeActions'); if (!ha) return;
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncClusterClearance).observe(ha);
    window.addEventListener('resize', syncClusterClearance);
    syncClusterClearance();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchClusterClearance);
  else watchClusterClearance();

  global.RRFrame = { modules: modules, moduleMenuHtml: moduleMenuHtml, wireUniSearch: wireUniSearch,
                     clusterClearance: clusterClearance, syncClusterClearance: syncClusterClearance };
})(window);
