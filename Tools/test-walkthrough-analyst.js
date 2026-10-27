/* test-walkthrough-analyst.js -- UI-230: the Analyst view's Walkthrough tab.
 *
 *   node Tools/test-walkthrough-analyst.js
 *
 * Owner, 2026-10-25: "Build the analyst walkthrough in the same format as the accountant
 * walkthrough. The walkthroughs are taking the place of the demo tour." One engine serves
 * both roles (test-walkthrough.js covers the accountant's steps). Runs the SHIPPED code
 * sliced out of RRV8/home.html: the analyst SUBVIEWS, the walkthrough engine, and
 * renderAnalystPalette with its collaborators stubbed.
 *
 *   T1  the Analyst band ends with a right-aligned Walkthrough tab
 *   T2  every step goes to a real Analyst tab                        (rot guard)
 *   T3  every on-screen label a step names still exists on the page it is on, outside
 *       the Walkthrough's own text                                   (rot guard)
 *   C1  the live lines quote the day-brief chips for the company in scope, and never a
 *       chip built for another company
 *   C2  before the chips paint, a step says Checking, never clean
 *   C3  the chips landing repaints the open banner
 *   R1  the hand-off step says whether the viewed period is marked reviewed
 *   S1  every tab clean: the Walkthrough tab and step 1 say so; one tab not clean: hidden
 *   G1  Go there on the card step picks the first card not handed off, opens it through
 *       its own chevron, lights it; the hand-off step keeps that card after it is handed off
 *   G2  the cards paint after Go there (they load late): the paint opens and lights them
 *   B1  the banner shows only on the open step's tab, and only in the view that opened it
 *   D1  every step's Read more guide is on the ai-docs.js list and is a real file
 *   N1  Previous / Next through the shipped click handler
 *   P1  renderAnalystPalette shows the Walkthrough panel on its tab only, paints it, and
 *       paints the banner on every tab
 *
 * TWO MUTATION CONTROLS: dropping the handed-off skip must redden G1; dropping the
 * chip's company check must redden C1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const html = read('RRV8/home.html');
const TX_PAGE = read('RRV8/inventory-transactions.html');
const CX_PAGE = read('RRV8/inventory-cardex-variance.html');
const AI_DOCS_SRC = read('RRV8/ai-docs.js');

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

const SUBVIEWS_SRC = slice(html, '  var SUBVIEWS = {', '\n  var _subDefault', 'SUBVIEWS');
const WALK_SRC = slice(html, '  var _walkStep = null;', '\n\n  // Recurrence lens', 'walkthrough');
const PALETTE_SRC = slice(html, '  function renderAnalystPalette() {', '\n  // Cardex "Cost Variance Framework"', 'renderAnalystPalette');
const PAGE_WITHOUT_WALK = html.replace(WALK_SRC, '');

const CO = '30002';
function chips(over) {
  const base = {
    work:    { key: 'work', label: 'Data Health', text: '1 category needs your attention', state: 'attn' },
    txvar:   { key: 'txvar', label: 'Transaction Variance', text: 'Inventory $76K · Mar 31, 2026', state: 'attn' },
    reports: { key: 'reports', label: 'Cardex', text: '2 items off · $1,204', state: 'attn' }
  };
  return Object.keys(base).map((k) => Object.assign({}, base[k], (over || {})[k] || {}));
}

// A fake page: the Transaction Variance cards (in the tab's order) and the elements $() hands out.
function sandbox(walkSrc, opt) {
  opt = opt || {};
  const els = {}, calls = { sub: [], clicks: [] };
  let cards = [], role = opt.role || 'analyst';
  // Handed off is server state (cardStore), so a repaint keeps it, as the real tab does.
  const done = new Set((opt.cards || []).filter((c) => c.complete).map((c) => c.key));
  const mkCard = (c) => {
    const cls = new Set(['txv-card', 'is-cardcol']);
    if (c.collapsed !== false) cls.add('is-collapsed');
    if (done.has(c.key)) cls.add('is-complete');
    const el = {
      key: c.key, cls: cls, scrolled: 0,
      classList: { contains: (x) => cls.has(x), add: (x) => cls.add(x), remove: (x) => cls.delete(x) },
      getAttribute: (a) => (a === 'data-cckey' ? c.key : null),
      // The card's own chevron: the shipped collapse handler toggles is-collapsed.
      querySelector: (sel) => (sel === '[data-cardcol]' ? { click() { calls.clicks.push(c.key); cls.has('is-collapsed') ? cls.delete('is-collapsed') : cls.add('is-collapsed'); } } : null),
      scrollIntoView() { el.scrolled++; }
    };
    return el;
  };
  const sb = {
    $: (id) => (els[id] = els[id] || { id: id, hidden: true, innerHTML: '', textContent: '' }),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    _ccyAmt: (ccy, n) => '$' + n,
    _coNames: { '30002': 'Harbor Wholesale Group' },
    _cardOpen: { txv: {}, wl: {} }, _acctGlScopeCo: null, _acctData: { companies: [{ co: CO }] },
    _acctIsDone: () => false, _acctDoneRec: () => null, _acctActionRank: () => 0,
    _analystSoloCo: CO, _ensureAnalystSolo: () => CO,
    _analystViewedPeriod: () => (opt.period === undefined ? '2026-04-30' : opt.period),
    fmtPeriod: (iso) => (iso === '2026-04-30' ? 'Apr 30, 2026' : iso),
    _viewRole: () => role,
    _setSubView: (sv) => { calls.sub.push(sv); if (sv === 'txvar' && opt.syncPaint) cards = (opt.cards || []).map(mkCard); },
    _curSubView: () => calls.sub.slice(-1)[0],
    setTimeout: () => 0,
    document: {
      querySelector: (sel) => {
        let m = /^\.txv-card\[data-ccns="txv"\]\[data-cckey="([^"]*)"\]$/.exec(sel);
        if (m) return cards.find((c) => c.key === m[1]) || null;
        if (sel === '.txv-card[data-ccns="txv"]:not(.is-complete)') return cards.find((c) => !c.cls.has('is-complete')) || null;
        if (sel === '.txv-card[data-ccns="txv"]') return cards[0] || null;
        return null;   // the accountant's [data-ccns="wl"] cards are not on this page
      },
      querySelectorAll: (sel) => (sel === '.walk-focus' ? cards.filter((c) => c.cls.has('walk-focus')) : []),
      addEventListener: (t, fn) => { if (t === 'click') calls.click = fn; }
    },
    console
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(AI_DOCS_SRC, sb);
  sb.RRV8.analystReviewStore = { get: (co, p) => (opt.reviewed && co === CO && p === '2026-04-30' ? { at: '2026-05-03T14:02:00Z' } : null) };
  vm.runInContext(walkSrc
    + '\nglobalThis.__w = { steps: WALK_STEPS_ANALYST, facts: _walkFactsAnalyst, live: function (s, f) { return _walkLive(s, f).join(" "); },'
    + ' render: renderWalkthrough, go: _walkGo, banner: renderWalkBanner, chips: _walkChipsSet, afterPaint: _walkAfterTxvPaint,'
    + ' step: function () { return _walkStep; }, key: function () { return _walkTxvKey; } };', sb);
  return {
    w: sb.__w, els: els, calls: calls, sb: sb,
    setRole: (r) => { role = r; },
    paint: () => { cards = (opt.cards || []).map(mkCard); sb.__w.afterPaint(); },
    complete: (key) => { done.add(key); const c = cards.find((x) => x.key === key); if (c) c.cls.add('is-complete'); },
    card: (key) => cards.find((c) => c.key === key),
    lit: () => cards.filter((c) => c.cls.has('walk-focus')).map((c) => c.key)
  };
}

const CARDS = [{ key: 'DUP', complete: true }, { key: 'PER' }, { key: 'MTO' }];

function suite(walkSrc, label) {
  if (label) console.log(label);
  // T1-T3
  const sv = vm.runInNewContext(SUBVIEWS_SRC + '\nSUBVIEWS', { canAnalyst: () => true });
  const tabs = sv.analyst, last = tabs[tabs.length - 1];
  check('T1 the Analyst band ends with a right-aligned Walkthrough tab', [last.k, last.label, last.aside], ['walk', 'Walkthrough', true]);
  const keys = tabs.map((t) => t.k);
  let s = sandbox(walkSrc);
  check('T2 every step goes to a real Analyst tab', s.w.steps.every((st) => keys.indexOf(st.tab) >= 0 && st.tab !== 'walk'), true);
  // Where each named label lives. Labels on home.html are read outside the Walkthrough's own
  // code; the two drill pages are read for the control itself, not the bare word.
  const ON_HOME = ['Company', 'Account Roll Forward', 'Model DMAAI Table', 'Routing list', 'Integrity Review', 'View',
    'Transaction Overview', 'Likely Cause', 'Variance', 'Mark reviewed', 'In Audit Findings', 'Reopen to edit',
    'Discard finding', 'Mark period reviewed', 'Standard Cost', 'Average / Revaluing Cost', 'Quantity Variance',
    'Amount Variance', 'Show items', 'Report Engine', 'Not responding', 'Restart', 'Fiscal calendar',
    'Review period ends', 'Reload Cardex', 'Open', 'Analyst', 'Period Activity', 'Audit report', 'Evidence package'];
  const ON_TX = { 'Findings': '>Findings</div>', 'Save': '>Save</button>' };
  const ON_CX = { 'Record': '>Record</button>', 'Adjust': '>Adjust</button>', 'Undo': '>Undo</button>' };
  const named = [];
  s.w.steps.forEach((st) => (st.look + ' ' + st.todo.join(' ')).replace(/<b>([^<]+)<\/b>/g, (m, t) => { named.push(t); return m; }));
  const missing = ON_HOME.filter((l) => PAGE_WITHOUT_WALK.indexOf(l) < 0)
    .concat(Object.keys(ON_TX).filter((l) => TX_PAGE.indexOf(ON_TX[l]) < 0))
    .concat(Object.keys(ON_CX).filter((l) => CX_PAGE.indexOf(ON_CX[l]) < 0));
  check('T3 every label the steps name still exists where the step says it is', missing, []);
  const all = ON_HOME.concat(Object.keys(ON_TX), Object.keys(ON_CX));
  check('T3 every label the steps name is on the guard\'s list (so a new one cannot skip it)', named.filter((n) => all.indexOf(n) < 0), []);
  check('T3 CONTROL: the guard has something to guard (each listed label is named by a step)', all.filter((l) => named.indexOf(l) < 0), []);

  // C1-C3: the chips are the one producer for the live lines.
  s.w.chips(CO, chips());
  const f = s.w.facts(s.sb._acctData);
  check('C1 step 1 names the company and quotes the Data Health chip', s.w.live(s.w.steps[0], f),
        'Company: Harbor Wholesale Group (Co 30002). Data Health: 1 category needs your attention.');
  check('C1 the card step quotes the Transaction Variance chip', s.w.live(s.w.steps[1], f), 'Transaction Variance: Inventory $76K · Mar 31, 2026.');
  check('C1 the cardex step quotes the Cardex chip', s.w.live(s.w.steps[3], f), 'Cardex: 2 items off · $1,204.');
  const other = sandbox(walkSrc);
  other.w.chips('30009', chips());
  check('C1 chips built for another company are not quoted', other.w.live(other.w.steps[3], other.w.facts(other.sb._acctData)), 'Cardex: Checking….');
  const cold = sandbox(walkSrc);
  check('C2 before the chips paint, a step says Checking, never clean', cold.w.live(cold.w.steps[0], cold.w.facts(cold.sb._acctData)),
        'Company: Harbor Wholesale Group (Co 30002). Data Health: Checking….');
  cold.w.go(3);
  cold.w.banner('reports');
  check('C3 the banner first reads Checking', /Cardex: Checking/.test(cold.els.acctWalkBanner.innerHTML), true);
  cold.w.chips(CO, chips());
  check('C3 and the chips landing repaints it with their figure', /Cardex: 2 items off · \$1,204\./.test(cold.els.acctWalkBanner.innerHTML), true);

  // R1
  check('R1 the hand-off step: the viewed period is not reviewed yet', s.w.live(s.w.steps[2], f), 'Apr 30, 2026 is not marked reviewed yet.');
  const rv = sandbox(walkSrc, { reviewed: true });
  check('R1 and when it is, says when', rv.w.live(rv.w.steps[2], rv.w.facts(rv.sb._acctData)), 'Apr 30, 2026 was marked reviewed on 2026-05-03.');
  const np = sandbox(walkSrc, { period: '' });
  check('R1 no period selected says so', np.w.live(np.w.steps[2], np.w.facts(np.sb._acctData)), 'No period is selected.');

  // S1
  const clean = sandbox(walkSrc);
  clean.w.chips(CO, chips({ work: { state: 'clean', text: 'Clean — every accuracy check passes' }, txvar: { state: 'clean', text: 'Clean — nothing open to act on' }, reports: { state: 'clean', text: 'Clean — on-hand ties to the cardex' } }));
  const DONE = 'Nothing needs you for Harbor Wholesale Group (Co 30002) right now: Data Health, Transaction Variance and Cardex are all clean. The steps show what to do when something comes up.';
  clean.w.render(clean.sb._acctData);
  check('S1 every tab clean: the Walkthrough tab says so at the top', [clean.els.acctWalkStatus.hidden, clean.els.acctWalkStatus.textContent], [false, DONE]);
  check('S1 and step 1 says it instead of the chip line', clean.w.live(clean.w.steps[0], clean.w.facts(clean.sb._acctData)), DONE);
  s.w.render(s.sb._acctData);
  check('S1 one tab not clean: the message is hidden', s.els.acctWalkStatus.hidden, true);
  check('S1 the tab is titled for the analyst', s.els.acctWalkTitle.textContent, 'Walkthrough: work a company’s period');
  const listHtml = s.els.acctWalkList.innerHTML;
  check('S1 six steps, each with Go there and its instructions as bullets', [(listHtml.match(/data-walk-go="/g) || []).length, (listHtml.match(/<ul class="walk-todo">/g) || []).length], [6, 6]);

  // G1: the cards are already on the page when Go there switches tabs.
  const g = sandbox(walkSrc, { cards: CARDS, syncPaint: true });
  g.w.go(1);
  check('G1 Go there on the card step goes to Transaction Variance', g.calls.sub.slice(-1)[0], 'txvar');
  check('G1 it picks the first card not handed off (DUP is, so PER)', g.w.key(), 'PER');
  check('G1 opens it through its own chevron, once, and lights only it', [g.calls.clicks, g.card('PER').cls.has('is-collapsed'), g.lit(), g.card('PER').scrolled], [['PER'], false, ['PER'], 1]);
  g.w.banner('txvar');
  check('G1 the banner repaint keeps it lit and does not toggle it again', [g.lit(), g.calls.clicks], [['PER'], ['PER']]);
  g.w.go(2);
  g.complete('PER');   // Mark reviewed: the card is handed off and the tab repaints
  g.w.afterPaint();
  check('G1 the hand-off step keeps the same card after it is handed off', [g.w.key(), g.lit()], ['PER', ['PER']]);
  g.w.go(1);
  check('G1 the card step again picks the next card not handed off', [g.w.key(), g.lit()], ['MTO', ['MTO']]);
  const none = sandbox(walkSrc, { cards: [{ key: 'DUP', complete: true }], syncPaint: true });
  none.w.go(1);
  check('G1 every card handed off: nothing is lit or opened', [none.lit(), none.calls.clicks], [[], []]);

  // G2: the tab is still building when Go there runs; the cards paint afterwards.
  const late = sandbox(walkSrc, { cards: CARDS });
  late.w.go(1);
  check('G2 nothing to light while the tab is building', late.lit(), []);
  late.paint();
  check('G2 the paint opens and lights the card the step is about', [late.w.key(), late.calls.clicks, late.lit()], ['PER', ['PER'], ['PER']]);
  late.w.go(2);
  late.w.banner('txvar');   // e.g. the chips land while the tab is rebuilding
  check('G2 the hand-off step keeps the pick through a repaint', late.w.key(), 'PER');
  const ended = sandbox(walkSrc, { cards: CARDS });
  ended.w.go(1);
  ended.calls.click({ target: { closest: (sel) => (sel === '[data-walk-end]' ? {} : null) } });
  ended.paint();
  check('G2 after End, a later paint opens and lights nothing', [ended.calls.clicks, ended.lit()], [[], []]);

  // B1
  const b = sandbox(walkSrc, { cards: CARDS, syncPaint: true });
  b.w.chips(CO, chips());
  b.w.go(3);
  b.w.banner('reports');
  const bh = b.els.acctWalkBanner;
  check('B1 the banner shows on the open step\'s tab', [bh.hidden, /Step 4 of 6: Work the cardex variance/.test(bh.innerHTML)], [false, true]);
  b.w.banner('txvar');
  check('B1 and hides on any other tab', bh.hidden, true);
  b.w.banner('reports');
  b.setRole('accountant');
  b.w.banner('reports');
  check('B1 and in the other view, where step 4 is a different step', bh.hidden, true);
  b.setRole('analyst');
  b.w.go(5);
  b.w.banner('audit');
  check('B1 the last step offers Finish, not Next', [/data-walk-end>Finish/.test(bh.innerHTML), /data-walk-next/.test(bh.innerHTML)], [true, false]);

  // D1
  const DOCS = s.sb.RRV8.aiDocs.DOCS;
  check('D1 every step names a guide on the ai-docs.js list', s.w.steps.filter((st) => !DOCS[st.doc]).map((st) => st.title), []);
  check('D1 every guide named is a file that exists', s.w.steps.every((st) => fs.existsSync(path.join(ROOT, 'RRV8', DOCS[st.doc].href))), true);
  check('D1 the Walkthrough tab shows a Read more link per step', (listHtml.match(/class="walk-doc" href="\.\.\/RRUniversity\/[a-z-]+\.html"/g) || []).length, 6);
  b.w.go(1); b.w.banner('txvar');
  check('D1 the banner carries its step\'s guide (step 2: Transaction Variance)',
        /href="\.\.\/RRUniversity\/inventory-transaction-variance\.html"[^>]*>Read more: Transaction Variance/.test(bh.innerHTML), true);

  // N1
  const n = sandbox(walkSrc, { cards: CARDS, syncPaint: true });
  const click = (attr) => n.calls.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? {} : null) } });
  n.w.go(3);
  click('data-walk-prev');
  check('N1 Previous step goes back one, to that step\'s tab', [n.w.step(), n.calls.sub.slice(-1)[0]], [2, 'txvar']);
  click('data-walk-next');
  click('data-walk-next');
  check('N1 Next step goes forward one at a time', [n.w.step(), n.calls.sub.slice(-1)[0]], [4, 'tools']);
}

// P1: renderAnalystPalette, run with its collaborators stubbed, for two tabs.
function palette(sv) {
  const els = {}, calls = [];
  const stub = (name) => function () { calls.push(name); };
  const sb = {
    $: (id) => (els[id] = els[id] || { id: id, hidden: true, parentNode: null, appendChild() {} }),
    _viewRole: () => 'analyst', canAnalyst: () => true, _curSubView: () => sv,
    _acctData: { companies: [{ co: CO }] }, _briefData: () => null, _analystTaskGen: 0, _txvGen: 0,
    _analystScopedData: (d) => d
  };
  ['renderCompaniesPill', 'renderAnalystAiCard', 'renderAnalystScope', 'renderPeriodWidget', 'renderAnalystDayBriefTop',
   'renderAnalystWorkspace', '_ensureDmaaiWarm', 'renderAnalystTxVar', 'renderCardexCards', 'renderReportsPalette',
   'loadServiceMemory', 'loadFiscalStatus', 'loadReloadCardexStatus', 'renderAuditPanel', 'renderWalkthrough', 'renderWalkBanner']
    .forEach((n) => { sb[n] = stub(n); });
  vm.createContext(sb);
  vm.runInContext(PALETTE_SRC + '\nrenderAnalystPalette();', sb);
  return { walkHidden: els.acctWalk.hidden, topHidden: els.acctTop.hidden, painted: calls.indexOf('renderWalkthrough') >= 0, banner: calls.indexOf('renderWalkBanner') >= 0 };
}
console.log('renderAnalystPalette');
const pw = palette('walk'), pt = palette('txvar');
check('P1 on the Walkthrough tab: panel shown and painted, the period chart row hidden, banner painted', [pw.walkHidden, pw.painted, pw.topHidden, pw.banner], [false, true, true, true]);
check('P1 on another tab: panel hidden, not painted, banner still painted (it shows on the step\'s tab)', [pt.walkHidden, pt.painted, pt.banner], [true, false, true]);
const paletteFails = failures;

suite(WALK_SRC, 'Analyst Walkthrough (home.html)');
const real = failures;

console.log('\nmutation control');
const log = console.log;
function mutant(from, to, row, what) {
  const M = WALK_SRC.replace(from, to);
  if (M === WALK_SRC) { console.log('  HARNESS BROKEN: the mutation changed nothing (' + what + ')'); process.exit(1); }
  failures = 0; reds = [];
  console.log = () => {};
  suite(M, '');
  console.log = log;
  const ok = reds.indexOf(row) >= 0;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: ' + what + ' reddens ' + row + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));
  return ok;
}
const ok1 = mutant(`document.querySelector('.txv-card[data-ccns="txv"]:not(.is-complete)')`, `document.querySelector('.txv-card[data-ccns="txv"]')`, 'G1', 'dropping the handed-off skip');
const ok2 = mutant('_walkChips.co === String(co)', 'true', 'C1', 'dropping the chip\'s company check');

const pass = real === 0 && ok1 && ok2;
console.log('\nRESULT: ' + (pass ? 'all assertions and both mutation controls pass' : (real) + ' assertion(s) failed' + (paletteFails ? ' (' + paletteFails + ' in P1)' : '')));
process.exit(pass ? 0 : 1);
