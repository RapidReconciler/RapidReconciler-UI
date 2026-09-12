/* test-bfcache-restore-refresh.js -- behaviour test for the back/forward-cache
 * restore path on the analyst Home tab.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-bfcache-restore-refresh.js
 *
 * WHY THIS EXISTS. On 2026-09-12 the dev server stopped sending
 * `Cache-Control: no-store`, which had been disqualifying home.html from the
 * browser's back/forward cache. Confirmed in Edge DevTools: "Successfully
 * served from back/forward cache". Returning from the transaction detail page
 * is now a RESTORE rather than a rebuild.
 *
 * That is the point, and it is also a new way to be wrong. The analyst's round
 * trip is: open a card's rows -> save a finding on the detail page -> Back.
 * On a restore nothing re-runs, so the card would come back showing the
 * pre-save state. A slow rebuild is annoying; a stale restore tells the analyst
 * their save did not happen.
 *
 * THE FOUR BROWSERS ARE WHY THE GATE MATTERS. All four in the support docs
 * have a back/forward cache, each with its own eligibility rules, and
 * eligibility varies per navigation even within one browser (eviction, memory
 * pressure). So both paths run in the field, on the same build, on the same
 * day. `e.persisted` decides which, and the browser sets it:
 *
 *   persisted true  -> nothing re-ran -> refresh the store and repaint
 *   persisted false -> ordinary load  -> boot already renders; do NOTHING
 *
 * THE DEFECT THIS PINS: dropping the `persisted` gate. Without it every
 * ordinary page view repaints the tab twice, once from boot and once from
 * here, and nothing on screen says so. It is a silent regression in the exact
 * path this work exists to make faster.
 *
 * SOURCE IS NOT RETYPED. _txvRestoreRefresh is sliced out of RRV8/home.html and
 * run against stubbed globals, so the assertions are about the shipped
 * function rather than a copy of its logic.
 *
 * THE CONTROL RUNS LAST and restores the ungated version. If it passes clean,
 * the gate assertion is not measuring anything.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  ok    ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

function sliceBlock(src, startIdx) {
  let i = src.indexOf('{', startIdx);
  if (i < 0) throw new Error('no opening brace after index ' + startIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');
const FN_SRC = extractFn(html, '_txvRestoreRefresh');

// Build a world the function can run in. `spy` records what it was asked to do.
function world(opts) {
  opts = opts || {};
  const spy = { loads: [], renders: 0, toasts: [] };
  const host = { hidden: !!opts.hidden };
  const sandbox = {
    console: console,
    RRV8: opts.noStore ? {} : {
      cardStore: {
        load: function (co) {
          spy.loads.push(co);
          return opts.loadFails ? Promise.reject(new Error('network down'))
                                : Promise.resolve({});
        }
      }
    },
    _analystSoloCo: ('solo' in opts) ? opts.solo : '80002',
    _acctData: { stub: true },
    _briefData: function () { return { stub: 'brief' }; },
    $: function (id) { return id === 'analystTxVar' ? host : null; },
    renderAnalystTxVar: function () { spy.renders++; },
    toast: function (m) { spy.toasts.push(String(m)); }
  };
  vm.createContext(sandbox);
  const fn = vm.runInContext(FN_SRC + '\n_txvRestoreRefresh', sandbox,
                             { filename: 'home.html:_txvRestoreRefresh' });
  return { fn: fn, spy: spy, host: host };
}

const RESTORE = { persisted: true };
const NORMAL  = { persisted: false };

(async function () {

  console.log('-- a restore refreshes the store and repaints --');
  {
    const w = world();
    const r = w.fn(RESTORE);
    ok(r && typeof r.then === 'function', 'restore returns a promise (it did work)');
    await r;
    ok(w.spy.loads.length === 1 && w.spy.loads[0] === '80002',
       'the card store was re-read for the analyst company',
       'loads: ' + JSON.stringify(w.spy.loads));
    ok(w.spy.renders === 1, 'the tab repainted exactly once',
       'renders: ' + w.spy.renders);
  }

  console.log('-- AN ORDINARY LOAD DOES NOTHING: this is the fallback --');
  // A browser that does not restore gets a normal navigation, and boot renders
  // the tab itself. If this fired there, every page view would render twice.
  {
    const w = world();
    const r = w.fn(NORMAL);
    ok(r === undefined, 'ordinary load declines (returns undefined)');
    await null;
    ok(w.spy.loads.length === 0, 'no store re-read on an ordinary load');
    ok(w.spy.renders === 0, 'no second render on an ordinary load');
  }

  console.log('-- a hidden tab is not repainted --');
  {
    const w = world({ hidden: true });
    ok(w.fn(RESTORE) === undefined, 'hidden tab declines');
    await null;
    ok(w.spy.renders === 0 && w.spy.loads.length === 0, 'nothing was done for a hidden tab');
  }

  console.log('-- no analyst company yet --');
  {
    const w = world({ solo: null });
    ok(w.fn(RESTORE) === undefined, 'no company declines');
    await null;
    ok(w.spy.loads.length === 0, 'no store call without a company');
  }

  console.log('-- config.js missing entirely --');
  {
    const w = world({ noStore: true });
    ok(w.fn(RESTORE) === undefined, 'no cardStore declines rather than throwing');
  }

  console.log('-- a failed re-read is REPORTED, not swallowed --');
  // The stale card has no other surface to announce itself on, so the toast is
  // the only sink. Silence here means the analyst trusts a card that predates
  // their own save.
  {
    const w = world({ loadFails: true });
    await w.fn(RESTORE);
    ok(w.spy.toasts.length === 1, 'exactly one toast on failure',
       'toasts: ' + JSON.stringify(w.spy.toasts));
    ok(w.spy.renders === 0, 'and no repaint with data that failed to load');
    const t = w.spy.toasts[0] || '';
    ok(t.indexOf('restored from cache') >= 0 && t.indexOf('network down') >= 0,
       'the toast names both the cause and the underlying error', 'toast: ' + t);
    ok(/reload/i.test(t), 'and tells the analyst what to do about it');
  }

  /* ---- the control ------------------------------------------------------ */
  // Remove the gate and run the result against an ORDINARY load. It has to
  // render, or the "does nothing on a normal load" assertion above is not
  // measuring anything.
  console.log('-- CONTROL: the gate removed, which must double-render --');
  {
    const ungated = FN_SRC.replace('if (!e || !e.persisted) return;', 'if (!e) return;');
    ok(ungated !== FN_SRC, 'the control actually modified the source',
       'the guard line was not found verbatim - this control measures nothing');
    const spy = { loads: [], renders: 0 };
    const host = { hidden: false };
    const sandbox = {
      console: console,
      RRV8: { cardStore: { load: function (co) { spy.loads.push(co); return Promise.resolve({}); } } },
      _analystSoloCo: '80002',
      _acctData: { stub: true },
      _briefData: function () { return {}; },
      $: function (id) { return id === 'analystTxVar' ? host : null; },
      renderAnalystTxVar: function () { spy.renders++; },
      toast: function () {}
    };
    vm.createContext(sandbox);
    const fn2 = vm.runInContext(ungated + '\n_txvRestoreRefresh', sandbox, { filename: 'control' });
    await fn2(NORMAL);
    ok(spy.renders === 1,
       'CONTROL: without the gate an ORDINARY load renders too -- the double-render is real',
       'renders on a normal load: ' + spy.renders + ' (expected 1; if 0 the gate assertion proves nothing)');
  }

  console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
  process.exit(failures === 0 ? 0 : 1);
})();
