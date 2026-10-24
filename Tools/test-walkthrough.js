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
 *   D1  a company already marked complete is never the worked example (its card has
 *       Reopen, not Mark Complete), but it is the one Audit Center proves
 *   M1  steps 1 and 2 merged (owner 2026-10-22): step 1 covers the red dot and points at
 *       the card step, which is now second; step numbers quoted in the text still match
 *   S1  step 1 names the companies still to work and counts the rest (complete, with who
 *       marked it; waiting on the analyst; not yours to journal)
 *   S2  nothing left for you: step 1 and the top of the Walkthrough tab say so
 *   L1  step 1 lights the next card (shut) while its banner shows; the light moves with
 *       the step and goes out off the step's tab; the banner carries the data line
 *   G1  "Go there" scopes, opens the card, and switches to the step's tab
 *   B1  the banner shows only on the open step's own tab, and step 4's names the menu
 *       and all four outcomes it offers
 *   N1  Previous step / Next step, clicked through the shipped handler, move one step and
 *       go to that step's tab; the first step has no Previous
 *
 * TWO MUTATION CONTROLS: picking by the wrong rank must redden P1; dropping the
 * already-complete skip must redden D1.
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
// Through the banner's click handler, so its buttons are driven, not read.
const WALK_END = '\n\n  // Recurrence lens';
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

function sandbox(walkSrc, data, done, by) {
  const els = {}, cards = {};
  const calls = { sub: [] };
  const sb = {
    $: (id) => (els[id] = els[id] || { id: id, hidden: true, innerHTML: '' }),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    _ccyAmt: (ccy, n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US'),
    _coNames: { '300': 'Summit Industrial, Inc.' },
    _cardOpen: { txv: {}, wl: {} }, _acctGlScopeCo: null, _acctData: data,
    _acctIsDone: (co) => (done || []).indexOf(String(co)) >= 0,
    _acctDoneRec: (co) => ((done || []).indexOf(String(co)) >= 0 ? { reason: 'immaterial', by: (by || {})[co] || '' } : null),
    _setSubView: (sv) => calls.sub.push(sv),
    setTimeout: () => 0, _curSubView: () => calls.sub.slice(-1)[0],
    document: {
      // One fake card per company, so the highlight can be read back off the "page".
      querySelector: (sel) => {
        const m = /data-cckey="([^"]*)"/.exec(sel); if (!m) return null;
        return cards[m[1]] || (cards[m[1]] = { co: m[1], cls: new Set(), scrollIntoView() {},
          classList: { add(c) { cards[m[1]].cls.add(c); }, remove(c) { cards[m[1]].cls.delete(c); } } });
      },
      querySelectorAll: (sel) => Object.values(cards).filter((c) => sel === '.walk-focus' && c.cls.has('walk-focus')),
      addEventListener: (t, fn) => { if (t === 'click') calls.click = fn; }
    },
    console
  };
  vm.createContext(sb);
  vm.runInContext(COMP_SRC + '\nvar _COMPONENTS = COMPONENTS;\n' + RANK_SRC + '\n' + walkSrc
    + '\nglobalThis.__w = { facts: _walkFacts, steps: WALK_STEPS, live: function (s, f) { return _walkLive(s, f).join(" "); }, liveList: _walkLive, render: renderWalkthrough, go: _walkGo, banner: renderWalkBanner,'
    + ' step: function () { return _walkStep; }, setStep: function (i) { _walkStep = i; }, scope: function () { return _acctGlScopeCo; } };', sb);
  return { w: sb.__w, els: els, calls: calls, sb: sb, lit: () => Object.values(cards).filter((c) => c.cls.has('walk-focus')).map((c) => c.co) };
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
  s.w.steps.forEach((st) => (st.look + ' ' + [].concat(st.todo).join(' ')).replace(/<b>([^<]+)<\/b>/g, (m, t) => { named.push(t.replace(/^✓ /, '')); return m; }));
  const ON_SCREEN = ['Out', 'Mark Complete', 'Reopen', 'Balancing Entry', 'Adjusting Entry', 'Awaiting posting', 'Verified',
    'Evidence package', 'Audit report', 'Accepted &mdash; immaterial', 'Timing &mdash; will self-clear',
    'Handed to analyst &mdash; source fix', 'Corrected &mdash; journal entry posted'];
  const missing = ON_SCREEN.filter((l) => PAGE_WITHOUT_WALK.indexOf(l) < 0);
  check('T3 every on-screen label the steps name still exists on the page, outside the Walkthrough', missing, []);
  check('T3 and the steps still name them (control: the guard has something to guard)', ON_SCREEN.every((l) => named.some((n) => n.indexOf(l) >= 0)), true);

  // P1-P4
  const f = s.w.facts(DATA);
  check('P1 the worked example is the first company the cards say you can clear', f.pick && f.pick.co, '300');
  check('P2 break companies are waiting on the analyst', f.waiting.map((c) => c.co), ['100']);
  check('P3 the split line reads yours / timing / cardex', s.w.live(s.w.steps[1], f),
        'Summit Industrial, Inc. (Co 300): yours -$9,000, timing $250, cardex $150.');
  check('P3 a company with no name reads as its number', /1 company waiting on the analyst: Co 100\./.test(s.w.live(s.w.steps[0], f)), true);
  const none = sandbox(walkSrc, { companies: [CO('100', 5000, 2, { 'Transactions': 5000 })] });
  check('P4 no clearable company: the step says so', none.w.live(none.w.steps[1], none.w.facts(none.sb._acctData)),
        'No company needs an entry from you this period. The steps still apply next period.');

  // D1: 300 is already marked complete, so the example moves to the next clearable card (400),
  // while Audit Center, the step that proves a finished company, goes to 300.
  const dn = sandbox(walkSrc, DATA, ['300']);
  const df = dn.w.facts(DATA);
  check('D1 a company already marked complete is not the worked example', [df.pick && df.pick.co, df.done && df.done.co], ['400', '300']);
  dn.w.go(2);
  check('D1 so Decide what it needs opens a card that has Mark Complete', [dn.sb._cardOpen.wl['400'], dn.sb._cardOpen.wl['300']], [true, undefined]);
  dn.w.go(5);
  check('D1 and Prove it scopes Audit Center to the finished one', dn.w.scope(), '300');
  const alld = sandbox(walkSrc, DATA, ['300', '400']);
  check('D1 every clearable company complete: the open steps name none', alld.w.live(alld.w.steps[1], alld.w.facts(DATA)),
        'No company needs an entry from you this period. The steps still apply next period.');

  // S1-S2: step 1 says which cards are which, from the user's own data.
  check('S1 step 1 names what is still to work, and counts the rest', s.w.live(s.w.steps[0], f),
        'This period: 4 of 5 companies out of balance. 2 still to work: Summit Industrial, Inc. (Co 300), Co 400.'
        + ' 1 company waiting on the analyst: Co 100. 1 company not yours to journal.');
  check('S1 a company marked complete is named as complete, not as work', dn.w.live(dn.w.steps[0], df),
        'This period: 4 of 5 companies out of balance. 1 still to work: Co 400. 1 marked complete: Summit Industrial, Inc. (Co 300).'
        + ' 1 company waiting on the analyst: Co 100. 1 company not yours to journal.');
  // Owner 2026-10-22: steps 1 and 2 merged. Step 1 covers the red dot and points at the card
  // step; the card step is now second, and no step is the old analyst's-side step.
  check('M1 step 1 covers the red dot and ends pointing at the next step',
        [/red dot is a roll-forward break/.test(s.w.steps[0].todo.join(' ')), /<b>Next step<\/b> opens the highlighted card and shows what to click\.$/.test(s.w.steps[0].todo.join(' '))], [true, true]);
  check('M1 the second step is the highlighted card itself', [s.w.steps[1].title, s.w.steps[1].focus, !!s.w.steps[1].peek], ['Open a company’s out-of-balance', 'pick', false]);
  check('M1 six steps, none of them the old analyst\'s-side step', [s.w.steps.length, s.w.steps.some((st) => /analyst’s side/.test(st.title))], [6, false]);
  check('M1 step numbers quoted in the text match the list', /build the entry in step 4, then pick .* in step 5/.test(s.w.steps[2].todo.join(' '))
        && s.w.steps[3].title === 'Build the entry' && s.w.steps[4].title === 'Mark it complete', true);
  // Someone else may have marked it: the line names who, from the record's server-owned `by`.
  const byd = sandbox(walkSrc, DATA, ['300'], { '300': 'j.smith' });
  check('S1 and names who marked it complete', /1 marked complete: Summit Industrial, Inc\. \(Co 300\) by j\.smith\./.test(byd.w.live(byd.w.steps[0], byd.w.facts(DATA))), true);
  check('S1 the step-1 text does not say who marked it', /you already marked/.test(s.w.steps[0].todo.join(' ')), false);
  const DONE_LINE = 'Nothing is left to work this period: 2 companies marked complete, 1 company waiting on the analyst,'
        + ' 1 company not yours to journal. The steps show what to do next period.';
  check('S2 nothing left for you: step 1 says so', alld.w.live(alld.w.steps[0], alld.w.facts(DATA)), DONE_LINE);
  alld.w.render(DATA);
  check('S2 and the Walkthrough tab shows it at the top', [alld.els.acctWalkStatus.hidden, alld.els.acctWalkStatus.textContent], [false, DONE_LINE]);
  s.w.render(DATA);
  check('S2 with work left the message is hidden', s.els.acctWalkStatus.hidden, true);
  const flat = sandbox(walkSrc, { companies: [CO('500', 0.4, 0, {})] });
  check('S2 nothing out of balance at all', flat.w.live(flat.w.steps[0], flat.w.facts(flat.sb._acctData)),
        'No company is out of balance this period, so there is nothing to do now. The steps show what to do next period.');

  // L1: step 1 lights the next card for as long as its banner shows, without opening it.
  const lt = sandbox(walkSrc, DATA);
  lt.w.go(0);
  lt.w.banner('rec');
  check('L1 step 1 lights the next card you can work, and leaves it shut', [lt.lit(), lt.sb._cardOpen.wl['300']], [['300'], undefined]);
  check('L1 the banner carries the line from the user\'s data', /walk-banner-live"><li>This period: 4 of 5/.test(lt.els.acctWalkBanner.innerHTML), true);
  // B1 (owner 2026-10-24: "Can the walkthrough text be changed to bullet point format?").
  const bh = lt.els.acctWalkBanner.innerHTML;
  const lis = (cls) => { const m = new RegExp('<ul class="' + cls + '">([\\s\\S]*?)</ul>').exec(bh); return m ? (m[1].match(/<li>/g) || []).length : -1; };
  check('B1 the banner\'s instructions are bullets, one per item', lis('walk-banner-list'), lt.w.steps[0].todo.length);
  check('B1 and its data line is one bullet per fact (this period / to work / waiting / not yours)', lis('walk-banner-live'),
        lt.w.liveList(lt.w.steps[0], lt.w.facts(DATA)).length);
  check('B1 CONTROL: step 1 has more than one instruction and more than one fact to bullet', [lt.w.steps[0].todo.length > 1, lis('walk-banner-live') > 1], [true, true]);
  check('B1 every step\'s instructions are a list', lt.w.steps.every((st) => Array.isArray(st.todo) && st.todo.length > 0), true);
  lt.w.go(1);
  lt.w.banner('rec');
  check('L1 Next step opens the card step 1 lit, and keeps it lit', [lt.lit(), lt.sb._cardOpen.wl['300']], [['300'], true]);
  const lt2 = sandbox(walkSrc, DATA, ['300']);
  lt2.w.go(0); lt2.w.banner('rec');
  lt2.w.go(5); lt2.w.banner('audit');
  check('L1 a step with no card to light (Prove it) puts the light out', lt2.lit(), []);
  lt.w.banner('audit');
  check('L1 leaving the step\'s tab puts the light out', lt.lit(), []);

  // Render
  s.w.render(DATA);
  const listHtml = s.els.acctWalkList.innerHTML;
  check('R1 six steps, each with a Go there button', (listHtml.match(/data-walk-go="/g) || []).length, 6);
  check('R1 the company name is escaped in the live line', listHtml.indexOf('Summit Industrial, Inc. (Co 300)') >= 0, true);
  check('B1 the Walkthrough tab lists each step\'s instructions as bullets too', (listHtml.match(/<ul class="walk-todo">/g) || []).length, 6);

  // G1
  s.w.go(1);
  check('G1 a card step opens that company\'s card and goes to Overview', [s.sb._cardOpen.wl['300'], s.calls.sub.slice(-1)[0]], [true, 'rec']);
  s.w.go(3);
  check('G1 Build the entry scopes Accounts to that company', [s.w.scope(), s.calls.sub.slice(-1)[0]], ['300', 'account']);
  s.w.go(5);
  check('G1 Prove it goes to Audit Center for that company', [s.w.scope(), s.calls.sub.slice(-1)[0]], ['300', 'audit']);

  // B1
  s.w.setStep(3);
  s.w.banner('account');
  const b = s.els.acctWalkBanner;
  check('B1 the banner shows on the open step\'s tab', [b.hidden, /Step 4 of 6: Build the entry/.test(b.innerHTML)], [false, true]);
  s.w.banner('rec');
  check('B1 and hides on any other tab', b.hidden, true);
  s.w.setStep(2);
  s.w.banner('rec');
  check('B1 Decide what it needs names the menu and all four outcomes it offers',
        ['Mark Complete', 'Accepted &mdash; immaterial', 'Timing &mdash; will self-clear', 'Handed to analyst &mdash; source fix', 'Corrected &mdash; journal entry posted']
          .filter((l) => b.innerHTML.indexOf('<b>' + l + '</b>') < 0), []);
  s.w.setStep(5);
  s.w.banner('audit');
  check('B1 the last step offers Finish, not Next', [/data-walk-end>Finish/.test(b.innerHTML), /data-walk-next/.test(b.innerHTML)], [true, false]);

  // N1: the banner's buttons, clicked through the shipped handler.
  const click = (attr) => s.calls.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? {} : null) } });
  s.w.setStep(0);
  s.w.banner('rec');
  check('N1 the first step has no Previous step', /data-walk-prev/.test(b.innerHTML), false);
  s.w.setStep(3);
  s.w.banner('account');
  check('N1 a later step offers Previous step', /data-walk-prev>&larr; Previous step/.test(b.innerHTML), true);
  click('data-walk-prev');
  check('N1 Previous step goes back one step, to that step\'s tab', [s.w.step(), s.calls.sub.slice(-1)[0]], [2, 'rec']);
  click('data-walk-next');
  check('N1 Next step goes forward one', [s.w.step(), s.calls.sub.slice(-1)[0]], [3, 'account']);
}

suite(WALK_SRC, 'Walkthrough (home.html)');
const real = failures;

console.log('\nmutation control');
const MUT = WALK_SRC.replace('var mine = out.filter(function (c) { return _acctActionRank(c) === 0; });', 'var mine = out.filter(function (c) { return _acctActionRank(c) === 1; });');
if (MUT === WALK_SRC) { console.log('  HARNESS BROKEN: the mutation changed nothing'); process.exit(1); }
failures = 0; reds = [];
const log = console.log; console.log = () => {};
suite(MUT, '');
console.log = log;
const ok1 = reds.indexOf('P1') >= 0;
console.log('  ' + (ok1 ? 'ok  ' : 'FAIL') + '  control: picking by the wrong rank reddens P1' + (ok1 ? '' : ' (reddened: ' + reds.join(',') + ')'));
const MUT2 = WALK_SRC.replace('var open = mine.filter(function (c) { return !_acctIsDone(c.co); });', 'var open = mine;');
if (MUT2 === WALK_SRC) { console.log('  HARNESS BROKEN: the second mutation changed nothing'); process.exit(1); }
failures = 0; reds = [];
console.log = () => {};
suite(MUT2, '');
console.log = log;
const ok2 = reds.indexOf('D1') >= 0;
console.log('  ' + (ok2 ? 'ok  ' : 'FAIL') + '  control: dropping the already-complete skip reddens D1' + (ok2 ? '' : ' (reddened: ' + reds.join(',') + ')'));
const ok = ok1 && ok2;

console.log('\nRESULT: ' + (real === 0 && ok ? 'all assertions and both mutation controls pass' : real + ' assertion(s) failed'));
process.exit(real === 0 && ok ? 0 : 1);
