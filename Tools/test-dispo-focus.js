/* test-dispo-focus.js -- behaviour test: accepting or reopening a company focuses Audit Center on it (UI-227).
 *
 *   node Tools/test-dispo-focus.js
 *
 * WHAT IS UNDER TEST. Audit Center, Accounts and On Hand show ONE company, resolved by
 * _acctFocusCo in RRV8/home.html. The owner accepted a company as immaterial from its Overview
 * card in a demo and found nothing in Audit Center: the focus was still the first company.
 * The claims:
 *
 *   - before any action, the focus is the first company (the existing default);
 *   - accepting a company (_acctSetDone) makes it the focus, and the Audit trail is dropped so
 *     the tab re-fetches;
 *   - reopening one (_acctClearDone) does the same;
 *   - the SAVED company pick (rrv8.acctCompany.<db>) is not changed, as with an "Out:" drill;
 *   - a company that is not in the list still falls back to the first, as before.
 *
 * THE SOURCE IS NOT RETYPED. _acctFocusCo, _acctFocusOn, _acctSetDone and _acctClearDone are
 * sliced out of home.html and executed. Only the edges are stubbed: the disposition store,
 * the active database, localStorage. The control reverts the fix and requires a break.
 *
 * Fixture identifiers are fictional (9XXXX companies, per the UI repo CLAUDE.md reserve).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

// Brace-balanced slice, skipping strings and comments (same slicer as test-evidence-package.js).
function sliceBlock(s, startIdx) {
  let i = s.indexOf('{', startIdx);
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { i = s.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1);
}
const baseSrc = ['_acctFocusCo', '_acctFocusOn', '_acctSetDone', '_acctClearDone'].map(extractFn).join('\n');

const DB = 'RapidReconciler_Test_V8';
const COS = ['90010', '90020', '90041'];

function sandbox(mutate) {
  const store = {}, saves = [], clears = [];
  const sb = {
    _acctGlScopeCo: null, _auditEntries: [{}], _auditKey: DB + '|3',
    activeDb: function () { return { n: DB }; },
    _fullCosFromRows: function () { return COS.slice(); },
    _dispoPeriod: function () { return '2026-06-30'; },
    _acctWriteFailed: function () {},
    localStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
                    setItem: function (k, v) { store[k] = String(v); } },
    window: {}
  };
  sb.window.RRV8 = { dispoStore: {
    save: function (r) { saves.push(r); return Promise.resolve(); },
    clear: function (co, per) { clears.push([co, per]); return Promise.resolve(); }
  } };
  sb.RRV8 = sb.window.RRV8;
  vm.createContext(sb);
  vm.runInContext(mutate ? mutate(baseSrc) : baseSrc, sb);
  return { sb: sb, store: store, saves: saves, clears: clears };
}
const focus = function (h) { return vm.runInContext('_acctFocusCo(' + JSON.stringify(COS) + ')', h.sb); };

function scenario(mutate) {
  const r = [];
  const chk = function (c, n, d) { r.push({ c: !!c, n: n, d: d }); };
  const h = sandbox(mutate);
  chk(focus(h) === '90010', 'with no action, the focus is the first company', focus(h));
  h.store['rrv8.acctCompany.' + DB] = '90010';   // a saved pick from an earlier visit
  vm.runInContext("_acctSetDone('90041', 'immaterial')", h.sb);
  chk(h.saves.length === 1 && h.saves[0].company === '90041' && h.saves[0].reason === 'immaterial', 'the disposition is saved as before', JSON.stringify(h.saves));
  chk(focus(h) === '90041', 'accepting a company makes it the focus', focus(h));
  chk(h.sb._auditEntries === null && h.sb._auditKey === '', 'and the Audit trail is dropped so the tab re-fetches');
  chk(h.store['rrv8.acctCompany.' + DB] === '90010', 'the saved company pick is unchanged', h.store['rrv8.acctCompany.' + DB]);
  vm.runInContext("_acctClearDone('90020')", h.sb);
  chk(h.clears.length === 1 && h.clears[0][0] === '90020', 'reopening clears the disposition as before', JSON.stringify(h.clears));
  chk(focus(h) === '90020', 'reopening a company makes it the focus', focus(h));
  vm.runInContext("_acctSetDone('99999', 'immaterial')", h.sb);
  chk(focus(h) === '90010', 'a company not in the list still falls back to the first', focus(h));
  return r;
}

console.log('Accept / reopen focuses Audit Center -- behaviour test');
scenario().forEach(function (x) { ok(x.c, x.n, x.d); });

// Control, last: without the fix, accepting leaves the focus on the first company.
const ctl = scenario(function (s) {
  // The focus call in _acctSetDone only: it is the one directly above the "force the Audit tab"
  // comment. \r?\n because home.html may be checked out with CRLF endings.
  const re = /[ \t]*_acctFocusOn\(co\);\r?\n([ \t]*_auditEntries = null; _auditKey = '';[ \t]*\/\/ force)/;
  if (!re.test(s)) throw new Error('control target not found -- home.html changed shape');
  return s.replace(re, '$1');
});
ok(ctl.some(function (x) { return !x.c; }), 'CONTROL: without the focus call in _acctSetDone, an assertion breaks');

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
process.exit(failures ? 1 : 0);
