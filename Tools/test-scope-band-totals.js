/* test-scope-band-totals.js -- behaviour test for Rows / Total variance on the
 * Transaction Details scope band.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-scope-band-totals.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron host.)
 *
 * WHY THIS EXISTS. The owner drilled an A/P Voucher card on Demo2 Co 80010 on
 * 2026-09-13 and the band read:
 *
 *     ROWS  —        TOTAL VARIANCE  —
 *
 * while the grid directly below it said 94 rows and listed their variances. Nothing
 * errored. Nothing logged. The two figures the band exists to anchor were simply gone.
 *
 * THE MECHANISM, and it is ordering, not arithmetic. paintScopeBand() ends with
 * `band.innerHTML = html`, which DESTROYS #tx-scope-rows and #tx-scope-var and re-emits
 * them holding their em-dash placeholders. Their only writer is renderStartHere(), and
 * paintScopeBand never called it. renderAll() happens to paint the band and then call
 * renderSubtotals(), so the first render was always correct -- which is exactly why this
 * survived: every path anyone tested went through renderAll().
 *
 * The two async preloaders do not. preloadPostingPolicy() and preloadCostMethod() each
 * call paintScopeBand() on their own when their fetch resolves, precisely so a late fact
 * reaches the band. Whichever resolved last wiped the totals for the rest of the drill.
 * The cost-method fetch was added 2026-09-13, which is why the defect appeared on the
 * same card that work was about.
 *
 * WHAT THIS ASSERTS, BEHAVIOURALLY. paintScopeBand is sliced out of the shipping page
 * and RUN against a DOM stub. The assertion reads the resulting element text -- not the
 * function's source -- so re-ordering the calls, renaming the painter or dropping the
 * repaint all fail here. The sibling test-posting-policy-sink.js asserts its painter is
 * wired by grepping the function body for a call; that catches a deletion and would not
 * have caught this, because the call it looks for was present the whole time.
 *
 * THE EM-DASH MUST SURVIVE AN EMPTY PAYLOAD. Painting "0" and "$0.00" before the data
 * lands turns a pending question into a confident wrong answer -- the failure the
 * sibling DMAAI loader shipped, where a failed load returned {byCombo:{}} and the panel
 * read it as a successful load with no mismatches. So there are two assertions here and
 * the second one is not a formality.
 *
 * THE CONTROL RUNS LAST and removes the repaint. If the band still shows the totals
 * without it, this file is measuring nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'inventory-transactions.html');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  ok    ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

/* ---- slice the shipping source ----------------------------------------- */
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
const html = fs.readFileSync(SRC, 'utf8');
function extractFn(name) {
  const at = html.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in inventory-transactions.html');
  return sliceBlock(html, at + 1);
}
const BAND_SRC   = extractFn('paintScopeBand');
const SUBS_SRC   = extractFn('renderSubtotals');
const START_SRC  = extractFn('renderStartHere');

/* ---- the DOM stub ------------------------------------------------------- */
// Minimal by design. Setting innerHTML scans the markup for id="..." and registers a
// child node per id holding that element's inner text, which is all these painters
// read back. That is enough to prove a placeholder was or was not overwritten.
function makeDom() {
  const byId = {};
  function node(id) {
    return {
      id: id,
      textContent: '',
      classList: { toggle: function () {}, add: function () {}, remove: function () {} },
      setAttribute: function () {}, removeAttribute: function () {}
    };
  }
  const band = {
    id: 'tx-scope-band',
    _html: '',
    set innerHTML(v) {
      this._html = v;
      // Re-register every id the new markup declares, each on its own placeholder text.
      const re = /id="([^"]+)"[^>]*>([^<]*)/g;
      let m;
      while ((m = re.exec(v)) !== null) {
        const n = node(m[1]);
        n.textContent = m[2];
        byId[m[1]] = n;
      }
    },
    get innerHTML() { return this._html; }
  };
  byId['tx-scope-band'] = band;
  return {
    byId: byId,
    document: { getElementById: function (id) { return byId[id] || null; } }
  };
}

/* ---- build a sandbox running the real painters -------------------------- */
// 94 rows, matching the drill in the screenshot: Demo2, Co 80010, A/P Voucher card.
function mkRows(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ Currency: 'USD', Type: 'Purchasing', Variance: 192.60 });
  return out;
}
function build(rows, hasData, bandSrc) {
  const dom = makeDom();
  const sandbox = {
    console: console,
    document: dom.document,
    _data: hasData ? { period: '2026-02' } : null,
    _state: { period: '2026-02', activeCompany: '80010', activeCard: 'VCHR',
              activePattern: '', activeModule: '', activeSubType: '',
              activeGroupCode: '', activeAccount: '' },
    _curCtx: { code: 'USD', mixed: false, codes: ['USD'] },
    window: { RR_SESSION: { dbs: [{ n: 'RapidReconciler_Demo2' }], activeDbIndex: 0 },
              RRV8: { currencyOf: function () { return { code: 'USD', mixed: false, codes: ['USD'] }; } } },
    escapeHtml: function (s) { return String(s == null ? '' : s); },
    formatPeriod: function (p) { return 'Feb 28, 2026 (' + p + ')'; },
    filteredRows: function () { return rows; },
    computeGroupsAndTotal: function (rs) {
      let v = 0; rs.forEach(function (r) { v += r.Variance; });
      return { groups: [], total: { variance: v } };
    },
    curMoney: function (v) { return '$' + v.toFixed(2); },
    fmtMoney: function (v) { return '$' + v.toFixed(2); },
    _TXV_CARD_TITLE: { VCHR: 'A/P Voucher on Inventory' },
    patTitle: function (p) { return p; },
    _paintPolicyField: function () {},
    _paintCostField: function () {}
  };
  sandbox.window.window = sandbox.window;
  // In a browser `window.RRV8` and a bare `RRV8` are the same binding, and the shipping
  // source uses both spellings in one expression. Mirror that or the slice throws.
  sandbox.RRV8 = sandbox.window.RRV8;
  sandbox.RR_SESSION = sandbox.window.RR_SESSION;
  vm.createContext(sandbox);
  vm.runInContext((bandSrc || BAND_SRC) + '\n' + SUBS_SRC + '\n' + START_SRC, sandbox,
                  { filename: 'inventory-transactions.html' });
  sandbox.paintScopeBand();
  return { s: sandbox, dom: dom };
}
function read(dom, id) {
  const n = dom.byId[id];
  return n ? String(n.textContent) : '(element absent)';
}
// The band emits the placeholder as the ENTITY `&mdash;`; renderStartHere overwrites it
// with real text via textContent. The stub does not decode entities, so both spellings
// count as "still on the placeholder" -- matching only one of them would let the control
// pass for the wrong reason.
function isPlaceholder(t) { return t.indexOf('—') >= 0 || t.indexOf('&mdash;') >= 0; }

/* ---- the assertions ----------------------------------------------------- */
console.log('-- a late repaint must NOT wipe the totals --');
{
  const r = build(mkRows(94), true);
  // The exact shape of the owner's screenshot: 94 rows in the grid, em-dashes in the band.
  ok(read(r.dom, 'tx-scope-rows') === '94',
     'Rows reads 94 after a standalone paintScopeBand()',
     'got: ' + JSON.stringify(read(r.dom, 'tx-scope-rows')));
  ok(read(r.dom, 'tx-scope-var').indexOf('18104.40') >= 0,
     'Total variance carries the summed figure, not a placeholder',
     'got: ' + JSON.stringify(read(r.dom, 'tx-scope-var')));
  ok(!isPlaceholder(read(r.dom, 'tx-scope-rows')) && !isPlaceholder(read(r.dom, 'tx-scope-var')),
     'and neither field is still sitting on its em-dash');
}

console.log('-- the elements are actually emitted, so the read above can fail --');
{
  const r = build(mkRows(94), true);
  ok(r.dom.byId['tx-scope-rows'] && r.dom.byId['tx-scope-var'],
     'both totals elements exist in the painted band',
     'if these are absent every assertion here passes vacuously');
  ok(r.dom.byId['tx-scope-cost'], 'and so does the cost-method field beside them');
}

console.log('-- NO DATA: the em-dash must survive, never become a confident zero --');
{
  const r = build([], false);
  ok(isPlaceholder(read(r.dom, 'tx-scope-rows')),
     'Rows stays on its em-dash before the payload lands',
     'got: ' + JSON.stringify(read(r.dom, 'tx-scope-rows')));
  ok(read(r.dom, 'tx-scope-var').indexOf('$0.00') < 0,
     'and Total variance does not print $0.00 off a population nobody has loaded',
     'got: ' + JSON.stringify(read(r.dom, 'tx-scope-var')));
}

/* ---- the control -------------------------------------------------------- */
// Remove the repaint and the first block must go red. Without this the assertions
// above could be passing because the stub never destroys anything.
console.log('-- CONTROL: drop the repaint, the totals must go back to em-dashes --');
{
  const broken = BAND_SRC.replace('if (_data) renderSubtotals();', '/* removed */');
  ok(broken !== BAND_SRC, 'the control actually modified the source',
     'the repaint line was not found verbatim -- this control measures nothing');
  const r = build(mkRows(94), true, broken);
  ok(isPlaceholder(read(r.dom, 'tx-scope-rows')),
     'CONTROL: without the repaint Rows reads an em-dash against 94 real rows -- the defect is real',
     'got: ' + JSON.stringify(read(r.dom, 'tx-scope-rows'))
       + ' -- if this is 94 the assertions above prove nothing');
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
