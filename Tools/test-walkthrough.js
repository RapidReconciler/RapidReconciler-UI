/* test-walkthrough.js -- UI-228: the Accountant view's Walkthrough tab.
 *
 *   node Tools/test-walkthrough.js
 *
 * Owner, 2026-10-22: a permanent "Walkthrough" tab, right-aligned on the Accountant tab
 * band, showing the accountant's flow as steps that go to the page they are about and say
 * what the user is looking at and what to do. Runs the SHIPPED code sliced out of
 * RRV8/home.html (and the real COMPONENTS list from RRV8/config.js).
 *
 *   T1  the tab exists, is labelled Walkthrough, sits last and right-aligned
 *   T2  every step goes to a real Accountant tab               (rot guard)
 *   T3  every on-screen label a step names still exists on the page, outside the
 *       Walkthrough's own text                                 (rot guard)
 *   P1  the worked example is the first company the Overview cards say you can clear
 *   P2  break companies are listed as waiting on the analyst
 *   P3  the split line: yours / timing / cardex, from that company's components
 *   P4  no clearable company: the steps say so instead of naming one
 *   G1  "Go there" scopes, opens the card, and switches to the step's tab
 *   B1  the banner shows only on the open step's own tab
 *
 * ONE MUTATION CONTROL: picking by the wrong rank must redden P1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// CRLF on a Windows checkout (autocrlf), LF in the repo and on CI: anchors are written in LF.
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const config = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
function slice(hay, start, end, what) {
  const i = hay.indexOf(start);
  if (i < 0 || hay.indexOf(start, i + 1) >= 0) { console.log('HARNESS BROKEN: ' + what + ' start anchor not found exactly once'); process.exit(1); }
  const j = hay.indexOf(end, i);
  if (j < 0) { console.log('HARNESS BROKEN: ' + what + ' end anchor not found'); process.exit(1); }
  return hay.slice(i, j);
}

const COMP_SRC = slice(config, '  var COMPONENTS = [', '\n  function _core(', 'COMPONENTS');
// The two shared helpers only: from _acctMaterial to _acctActionRank's closing brace.
const RANK_SRC = (function () {
  const s = slice(html, '  function _acctMaterial(c, role) {', '  function _acctActionRank(c) {', 'rank helpers');
  const tail = html.slice(html.indexOf('  function _acctActionRank(c) {'));
  return s + tail.slice(0, tail.indexOf('\n  }') + 4);
})();
const SUBVIEWS_SRC = slice(html, '  var SUBVIEWS = {', '\n  var _subDefault', 'SUBVIEWS');
const WALK_START = '  var _walkStep = null;';
const WALK_END = "  document.addEventListener('click', function (e) {\n    var g = e.target.closest('[data-walk-go]');";
const WALK_SRC = slice(html, WALK_START, WALK_END, 'walkthrough');
// The page with the Walkthrough's own code removed, for T3.
const PAGE_WITHOUT_WALK = html.replace(WALK_SRC, '');

function comp(over) {
  return Object.assign({ 'Carry forward': 0, 'Transactions': 0, 'Manual entries': 0, 'Cardex': 0, 'Unposted GL batches': 0, 'End of Day': 0 }, over);
}
const CO = (co, oob, breaks, c) => ({ co: co, ccy: 'USD', oob: oob, breaks: breaks || 0, comp: comp(c) });
// 100 has a break (the analyst's); 200 is timing only (other out); 300 and 400 are clearable.
const DATA = { companies: [
  CO('400', -900, 0, { 'Transactions': -900 }),
  CO('100', 5000, 2, { 'Transactions': 5000 }),
  CO('200', 300, 0, { 'Unposted GL batches': 300 }),
  CO('300', -8600, 0, { 'Carry forward': -6000, 'Transactions': -3000, 'End of Day': 250, 'Cardex': 150 }),
  CO('500', 0.4, 0, {})
] };

function sandbox(walkSrc, data) {
  const els = {};
  const calls = { sub: [] };
  const sb = {
    $: (id) => (els[id] = els[id] || { id: id, hidden: true, innerHTML: '' }),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    _ccyAmt: (ccy, n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US'),
    _coNames: { '300': 'Summit Industrial, Inc.' },
    _cardOpen: { txv: {}, wl: {} }, _acctGlScopeCo: null, _acctData: data,
    _setSubView: (sv) => calls.sub.push(sv),
    setTimeout: () => 0, document: { querySelector: () => null },
    console
  };
  vm.createContext(sb);
  vm.runInContext(COMP_SRC + '\nvar _COMPONENTS = COMPONENTS;\n' + RANK_SRC + '\n' + walkSrc
    + '\nglobalThis.__w = { facts: _walkFacts, steps: WALK_STEPS, live: _walkLive, render: renderWalkthrough, go: _walkGo, banner: renderWalkBanner,'
    + ' step: function () { return _walkStep; }, setStep: function (i) { _walkStep = i; }, scope: function () { return _acctGlScopeCo; } };', sb);
  return { w: sb.__w, els: els, calls: calls, sb: sb };
}

function suite(walkSrc, label) {
  if (label) console.log(label);
  // T1-T3
  const sv = vm.runInNewContext(SUBVIEWS_SRC + '\nSUBVIEWS', { canAnalyst: () => true });
  const acct = sv.accountant;
  const last = acct[acct.length - 1];
  check('T1 the Accountant band ends with a right-aligned Walkthrough tab', [last.k, last.label, last.aside], ['walk', 'Walkthrough', true]);
  const keys = acct.map((t) => t.k);
  let s = sandbox(walkSrc, DATA);
  check('T2 every step goes to a real Accountant tab', s.w.steps.every((st) => keys.indexOf(st.tab) >= 0 && st.tab !== 'walk'), true);
  const named = [];
  s.w.steps.forEach((st) => (st.look + ' ' + st.todo).replace(/<b>([^<]+)<\/b>/g, (m, t) => { named.push(t.replace(/^✓ /, '')); return m; }));
  const ON_SCREEN = ['Out', 'Mark Complete', 'Reopen', 'Balancing Entry', 'Adjusting Entry', 'Awaiting posting', 'Verified'];
  const missing = ON_SCREEN.filter((l) => PAGE_WITHOUT_WALK.indexOf(l) < 0);
  check('T3 every on-screen label the steps name still exists on the page, outside the Walkthrough', missing, []);
  check('T3 and the steps still name them (control: the guard has something to guard)', ON_SCREEN.every((l) => named.some((n) => n.indexOf(l) >= 0)), true);

  // P1-P4
  const f = s.w.facts(DATA);
  check('P1 the worked example is the first company the cards say you can clear', f.pick && f.pick.co, '300');
  check('P2 break companies are waiting on the analyst', f.waiting.map((c) => c.co), ['100']);
  check('P3 the split line reads yours / timing / cardex', s.w.live(s.w.steps[2], f),
        'Summit Industrial, Inc. (Co 300): yours -$9,000, timing $250, cardex $150.');
  check('P3 a company with no name reads as its number', s.w.live(s.w.steps[1], f), '1 company is waiting on the analyst: Co 100.');
  const none = sandbox(walkSrc, { companies: [CO('100', 5000, 2, { 'Transactions': 5000 })] });
  check('P4 no clearable company: the step says so', none.w.live(none.w.steps[2], none.w.facts(none.sb._acctData)),
        'No company needs an entry from you this period. The steps still apply next period.');

  // Render
  s.w.render(DATA);
  const listHtml = s.els.acctWalkList.innerHTML;
  check('R1 seven steps, each with a Go there button', (listHtml.match(/data-walk-go="/g) || []).length, 7);
  check('R1 the company name is escaped in the live line', listHtml.indexOf('Summit Industrial, Inc. (Co 300)') >= 0, true);

  // G1
  s.w.go(2);
  check('G1 a card step opens that company\'s card and goes to Overview', [s.sb._cardOpen.wl['300'], s.calls.sub.slice(-1)[0]], [true, 'rec']);
  s.w.go(4);
  check('G1 Build the entry scopes Accounts to that company', [s.w.scope(), s.calls.sub.slice(-1)[0]], ['300', 'account']);
  s.w.go(6);
  check('G1 Prove it goes to Audit Center for that company', [s.w.scope(), s.calls.sub.slice(-1)[0]], ['300', 'audit']);

  // B1
  s.w.setStep(4);
  s.w.banner('account');
  const b = s.els.acctWalkBanner;
  check('B1 the banner shows on the open step\'s tab', [b.hidden, /Step 5 of 7: Build the entry/.test(b.innerHTML)], [false, true]);
  s.w.banner('rec');
  check('B1 and hides on any other tab', b.hidden, true);
  s.w.setStep(6);
  s.w.banner('audit');
  check('B1 the last step offers Finish, not Next', [/data-walk-end>Finish/.test(b.innerHTML), /data-walk-next/.test(b.innerHTML)], [true, false]);
}

suite(WALK_SRC, 'Walkthrough (home.html)');
const real = failures;

console.log('\nmutation control');
const MUT = WALK_SRC.replace('return _acctActionRank(c) === 0; })[0] || null', 'return _acctActionRank(c) === 1; })[0] || null');
if (MUT === WALK_SRC) { console.log('  HARNESS BROKEN: the mutation changed nothing'); process.exit(1); }
failures = 0; reds = [];
const log = console.log; console.log = () => {};
suite(MUT, '');
console.log = log;
const ok = reds.indexOf('P1') >= 0;
console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: picking by the wrong rank reddens P1' + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));

console.log('\nRESULT: ' + (real === 0 && ok ? 'all assertions and the mutation control pass' : real + ' assertion(s) failed'));
process.exit(real === 0 && ok ? 0 : 1);
