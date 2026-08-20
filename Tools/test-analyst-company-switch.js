/* test-analyst-company-switch.js -- behaviour test for the analyst company switcher.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-analyst-company-switch.js
 *
 * WHY THIS EXISTS. Picking a company on the analyst view persists the pick, stamps it
 * with the sign-in session, and reloads the page (UI-31). _ensureAnalystSolo decides on
 * the way back in whether that pick is still the analyst's or a leftover from a previous
 * login. Get that decision wrong and the switcher is a silent no-op: the page reloads,
 * lands on a different company than the one clicked, and nothing is logged.
 *
 * THE DEFECT THIS PINS. The restore condition required the stamp to be TRUTHY. But
 * `rrv8.sessionStart` is written only by login.html and sso-landing.html, and the
 * long-lived dev token never passes through either -- sidebar.js says so in a comment.
 * So the switch stamped an empty string, the truthiness test failed on reload, and the
 * pick fell through to the smallest company number. On Demo1 that is 80002, so switching
 * to 80008 came back as 80002. Reported by the owner 2026-08-20.
 *
 * The three cases the stamp EXISTS to serve still have to hold, which is why they are all
 * here: a fresh sign-in must drop a stale pick, a sign-out must drop it, and a same-session
 * reload must keep it. A fix that just deleted the guard would pass case 1 and break those.
 *
 * THE SECOND DEFECT, and the one that made it look database-specific. Thirteen of the
 * fourteen call sites pass `d.companies` -- a list _briefData has ALREADY narrowed by the
 * accountant's what-if exclusion. Resolving against a narrowed list read "the pick is not
 * in this list" as "the pick is stale", so it was replaced by the fallback AND written to
 * localStorage over the real one. One narrowed render erased a perfectly valid pick. The
 * exclusion set is per database, which is why Demo2 switched fine and Demo1 did not.
 * _ensureAnalystSolo now resolves against the full set from _invRows.
 *
 * SOURCE IS NOT RETYPED. _ensureAnalystSolo is sliced out of RRV8/home.html at run time.
 *
 * THE CONTROL RUNS LAST and restores BOTH defects -- the truthiness test and the narrowed
 * authority. It must reproduce the reported symptom (80008 in, 80002 out) and the silent
 * overwrite of the stored pick. If the control passes clean, this file measures nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
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

// Demo1's two companies. 80002 sorts first, which is what the fallback lands on and
// therefore what the defect always produced.
const DEMO1 = [{ co: '80002' }, { co: '80008' }];

function load(store, mutate, fullList) {
  // _ensureAnalystSolo now resolves against the FULL company set rather than the
  // caller's list, so the sandbox has to supply it the way home.html does.
  let src = 'var _analystSoloCo = null;\n'
    + 'var _fullCosFromRows = function () { return FULL_LIST; };\n'
    + extractFn(html, '_ensureAnalystSolo');
  if (mutate) src = mutate(src);
  const sb = { console: console };
  sb.FULL_LIST = fullList || DEMO1.map(function (c) { return c.co; });
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  sb.activeDb = function () { return { n: 'RapidReconciler_Demo1' }; };
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'home.html:_ensureAnalystSolo' });
  return sb;
}

// What the click handler writes before it calls location.reload().
function switchTo(store, co) {
  store['rrv8.analystCompany.RapidReconciler_Demo1'] = String(co);
  store['rrv8.analystCompany.RapidReconciler_Demo1.s'] = store['rrv8.sessionStart'] || '';
}

function suite(expectFixed) {
  console.log(expectFixed ? '\nSHIPPED SOURCE' : '\nCONTROL (truthiness test restored)');
  // The control restores BOTH defects: the truthiness test on the session stamp, and
  // resolving against the caller's narrowed list instead of the full company set.
  const mutate = expectFixed ? null : function (src) {
    const guard = '(saved && savedSess === curSess && list.indexOf(saved) >= 0)';
    const auth  = 'var list = full.length ? full.slice()';
    if (src.indexOf(guard) < 0 || src.indexOf(auth) < 0) {
      throw new Error('control anchors not found - _ensureAnalystSolo changed shape');
    }
    return src
      .replace(guard, '(saved && savedSess && savedSess === curSess && list.indexOf(saved) >= 0)')
      .replace(auth, 'var list = [].length ? full.slice()');
  };

  // 1. THE REPORTED CASE. Dev token, so no rrv8.sessionStart anywhere. Switch to 80008,
  //    reload, and the page must be on 80008.
  const dev = {};
  switchTo(dev, '80008');
  const got1 = load(dev, mutate)._ensureAnalystSolo(DEMO1);
  if (expectFixed) {
    ok(got1 === '80008', 'dev token (no sessionStart): the switch to 80008 survives the reload',
       'landed on ' + JSON.stringify(got1));
  } else {
    ok(got1 === '80002', 'CONTROL: the switch is swallowed and 80002 comes back',
       'landed on ' + JSON.stringify(got1));
    const cn = {};
    switchTo(cn, '80008');
    cn['rrv8.sessionStart'] = '1700000000000';
    cn['rrv8.analystCompany.RapidReconciler_Demo1.s'] = '1700000000000';
    const gotCn = load(cn, mutate)._ensureAnalystSolo([{ co: '80002' }]);
    ok(gotCn === '80002', 'CONTROL: a narrowed caller list steals the pick even in-session',
       'landed on ' + JSON.stringify(gotCn));
    ok(cn['rrv8.analystCompany.RapidReconciler_Demo1'] === '80002',
       'CONTROL: and writes the fallback over the stored pick');
    return;
  }

  // 2. Same sign-in session: the pick survives, which is what the stamp is for.
  const same = { 'rrv8.sessionStart': '1700000000000' };
  switchTo(same, '80008');
  ok(load(same, mutate)._ensureAnalystSolo(DEMO1) === '80008',
     'same sign-in session: the pick survives the reload');

  // 3. FRESH sign-in: login.html writes a new sessionStart, so the stale pick is dropped
  //    and the landing is deterministic (smallest company number, owner call).
  const fresh = { 'rrv8.sessionStart': '1700000000000' };
  switchTo(fresh, '80008');
  fresh['rrv8.sessionStart'] = '1800000000000';
  ok(load(fresh, mutate)._ensureAnalystSolo(DEMO1) === '80002',
     'fresh sign-in: the stale pick is dropped, lands on the smallest company');

  // 4. Sign-out removes sessionStart. A pick stamped with a real session must NOT be
  //    honoured afterwards -- otherwise the fix would resurrect another login's scope.
  const out = { 'rrv8.sessionStart': '1700000000000' };
  switchTo(out, '80008');
  delete out['rrv8.sessionStart'];
  ok(load(out, mutate)._ensureAnalystSolo(DEMO1) === '80002',
     'after sign-out: a pick stamped with a real session is NOT resurrected');

  // 5. A saved company that is no longer in scope (permissions changed, different DB)
  //    must not strand the analyst on a company they cannot see.
  const gone = {};
  switchTo(gone, '99999');
  ok(load(gone, mutate)._ensureAnalystSolo(DEMO1) === '80002',
     'a saved company outside the authorized list falls back to the smallest');

  // 6. Nothing saved at all: the deterministic landing.
  ok(load({}, mutate)._ensureAnalystSolo(DEMO1) === '80002', 'no saved pick lands on the smallest company');

  // 7. The pick is re-persisted on every resolve, so standalone pages reached from here
  //    (Model DMAAI Review) hand off the right company.
  const persist = {};
  switchTo(persist, '80008');
  load(persist, mutate)._ensureAnalystSolo(DEMO1);
  ok(persist['rrv8.analystCompany.RapidReconciler_Demo1'] === '80008',
     'the resolved company is re-persisted for the standalone-page hand-off',
     JSON.stringify(persist['rrv8.analystCompany.RapidReconciler_Demo1']));

  // 8. THE DEMO1 CASE. A caller hands over a NARROWED list -- _briefData drops what the
  //    accountant's what-if excluded, and thirteen call sites pass that list straight in.
  //    The pick must survive, and it must NOT be overwritten in storage. This is the
  //    failure the owner saw: pill offers 80008, click stores it, reload writes 80002 back.
  const narrowed = {};
  switchTo(narrowed, '80008');
  const gotN = load(narrowed, mutate)._ensureAnalystSolo([{ co: '80002' }]);
  ok(gotN === '80008', 'a narrowed caller list does not steal the pick', 'landed on ' + JSON.stringify(gotN));
  ok(narrowed['rrv8.analystCompany.RapidReconciler_Demo1'] === '80008',
     'a narrowed caller list does not overwrite the stored pick',
     JSON.stringify(narrowed['rrv8.analystCompany.RapidReconciler_Demo1']));

  // 9. A company genuinely gone from the FULL set still falls back. The authority moved;
  //    it did not disappear.
  const shrunk = {};
  switchTo(shrunk, '80008');
  ok(load(shrunk, mutate, ['80002'])._ensureAnalystSolo(DEMO1) === '80002',
     'a company absent from the FULL set still falls back');
}

console.log('analyst company switcher -- behaviour test\n' +
            'source: RRV8/home.html (_ensureAnalystSolo, sliced verbatim)');

suite(true);
suite(false);

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
process.exit(failures ? 1 : 0);
