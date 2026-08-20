/* test-nonstock-glclass.js -- behaviour test for the non-stock sales line GL-class fallback.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-nonstock-glclass.js
 *
 * WHY THIS EXISTS. `GLClass` on a Transactions row is the DOCUMENT's distinct
 * F4111.ilglpt -- the cardex. A non-stock sales line writes no F4111 row, so the field
 * arrives blank, and a blank class takes the entire DMAAI resolution down with it: the
 * 4152 model lookup misses, the inventory AAI lookup misses, and the Transaction Details
 * analyzer paints a table of dashes under "No account comparison ran". Measured on Demo1
 * co 80002 / Jul 2025, card "Non-Stock Sales Lines". The fix reads the class off the ORDER
 * LINE instead, narrowed to lines whose F40205 inventory interface is 'N'.
 *
 * WHAT IS ACTUALLY UNDER TEST, and why parsecheck cannot do it. Every failure here is
 * silent. A fallback that never fires renders the same dashes it was written to remove. A
 * fallback that fires too eagerly overwrites a real cardex class and moves the model
 * comparison onto the wrong account. And the stock-class-on-a-non-stock-line sentence is a
 * CLAIM -- printing it when it is not true is worse than never printing it, because the
 * analyst goes and asks a question that has no answer. None of that throws.
 *
 * THE STOCK TEST IS THE MODEL HIT, NOT A CLASS LIST. A GL class that resolves in the 4152
 * model table has a cardex model account, which is what makes it a stock class. So the
 * sentence keys off the lookup itself -- no hardcoded class names to drift per customer.
 * Case 4 pins the silence: same non-stock row, no model for that class, no sentence.
 *
 * SECOND SUITE: THE AI GROUNDING FACT. Adding SDLNTY to the row payload turned on a check
 * that had been degrading to silence, and the measurement is the reason it needed work
 * first. SDLNTY is the ORDER's distinct set of line types, and most N-bearing orders are
 * mixed -- 9 pure 'N' against 8 mixed on Demo1, with all three rows of the card this was
 * written for reading 'N, S' or 'N, S, W'. The equality test on 'N' is right, but its else
 * branch used to print "no non-stock line in this slice", which is a negative FINDING on
 * the card that is entirely about non-stock lines, fed into a prompt whose grounding treats
 * these facts as true. Mixed orders now get their own inconclusive fact.
 *
 * SOURCE IS NOT RETYPED. All eight functions are sliced out of
 * RRV8/inventory-transactions.html at run time and executed verbatim.
 *
 * EACH SUITE'S CONTROL RUNS LAST. One strips the GL-class fallback and must put the table
 * back to all dashes; the other drops mixed orders and must bring the false negative back.
 * If a control passes, that suite is measuring nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'inventory-transactions.html');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

/* ---------------------------------------------------------------- source slicing --- */

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
  if (at < 0) throw new Error('function ' + name + ' not found');
  return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');
const dmaaiLine = html.match(/\n(\s*var _TX_INV_DMAAIS = \{[^}]*\};)/);
if (!dmaaiLine) throw new Error('_TX_INV_DMAAIS not found');
const verbLine = html.match(/\n(\s*function _txVerb\(n, singular, plural\) \{[^}]*\})/);
if (!verbLine) throw new Error('_txVerb not found');

const PIECES = ['_txGridCombos', '_txAttachModel', '_txCombosSummary'];

function loadSandbox(mutate) {
  let src = dmaaiLine[1] + '\n' + verbLine[1] + '\n'
    + PIECES.map(function (n) { return extractFn(html, n); }).join('\n');
  if (mutate) src = mutate(src);
  const sb = { console: console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'inventory-transactions.html:analyzer' });
  return sb;
}

/* ------------------------------------------------------------------------ fixture --- */

// One reconciling row per case. Amounts only need to be non-zero on the ledger side --
// these are GL-only rows, which is what a non-stock line always is.
function row(over) {
  return Object.assign({
    CompanyNumber: '80002', OT: 'S8', DT: 'RI', LongAccount: '80002.1380',
    CardexAmount: 0, LedgerAmount: -602.87, Variance: -602.87,
    GLClass: '', NonStockGLClass: '', NonStockLineTypes: ''
  }, over || {});
}

// The DMAAI config as the resolver hands it over: `model` = the 4152 base AAI per
// (company | GL class); `byCombo` = every AAI keyed (company | orderType | docType | class).
// IN20 is a stock class -- it has a 4152 model account. NS90 deliberately has none.
function cfg(opts) {
  opts = opts || {};
  const model = {};
  if (opts.modelForIN20 !== false) {
    model['80002|IN20'] = { doctype: 'RI', descr: 'Inventory - Finished Goods',
      parts: { bu: '80002', ob: '1380', sb: '' }, buFlex: false, subFlex: false };
  }
  const byCombo = {};
  byCombo['80002||S8|IN20'] = [{ table: '4240', acct: '80002.1380', descr: 'Inventory - Finished Goods',
    costType: '', parts: { bu: '80002', ob: '1380', sb: '' }, buFlex: false, subFlex: false }];
  byCombo['80002||S8|NS90'] = [{ table: '4240', acct: '80002.1380', descr: 'Inventory - Finished Goods',
    costType: '', parts: { bu: '80002', ob: '1380', sb: '' }, buFlex: false, subFlex: false }];
  return { ok: true, model: model, byCombo: byCombo };
}

function run(sb, rows, cfgOpts) {
  const combos = sb._txGridCombos(rows);
  sb._txAttachModel(combos, cfg(cfgOpts));
  return { combos: combos, sum: sb._txCombosSummary(combos) };
}

const NS_PHRASE = 'stock class shipped on a non-stock sales line';

/* ------------------------------------------------------------------------- cases --- */

function caseSuite(sb, expectFallback) {
  const label = expectFallback ? 'SHIPPED SOURCE' : 'CONTROL (fallback stripped)';
  console.log('\n' + label);

  // 1. The defect case: no cardex class, an order-line class on a non-stock line.
  const r1 = run(sb, [row({ NonStockGLClass: 'IN20', NonStockLineTypes: 'N' })]);
  const c1 = r1.combos[0], l1 = r1.sum.list[0] || {};
  if (expectFallback) {
    ok(c1.gc === 'IN20', 'order-line class fills the blank cardex class', 'gc = ' + JSON.stringify(c1.gc));
    ok(c1.ns === true, 'the combo is marked as non-stock-sourced');
    ok(l1.invDmaai === '4240', 'the inventory AAI resolves to 4240', 'invDmaai = ' + JSON.stringify(l1.invDmaai));
    ok(l1.invAcct === '80002.1380', 'the Inv Acct cell is populated', 'invAcct = ' + JSON.stringify(l1.invAcct));
    ok(l1.modelAcct === '80002.1380', 'the Model Acct cell is populated', 'modelAcct = ' + JSON.stringify(l1.modelAcct));
    ok(r1.sum.head.indexOf('No account comparison ran') < 0,
       'the head no longer says nothing was compared', r1.sum.head);
    ok(r1.sum.head.indexOf(NS_PHRASE) >= 0, 'the verdict names the stock class on a non-stock line', r1.sum.head);
    ok(r1.sum.head.indexOf('line type N') >= 0, 'the verdict names the line type', r1.sum.head);
  } else {
    // The control must reproduce the ORIGINAL defect exactly.
    ok(c1.gc === '', 'CONTROL: the class stays blank', 'gc = ' + JSON.stringify(c1.gc));
    ok(r1.sum.head.indexOf('No account comparison ran') >= 0,
       'CONTROL: the head is back to "no account comparison ran"', r1.sum.head);
    ok(r1.sum.head.indexOf(NS_PHRASE) < 0, 'CONTROL: no non-stock sentence is printed');
    return;
  }

  // 2. A real cardex class WINS. The fallback must never overwrite a class that came off
  //    F4111 -- that would move the model comparison onto the wrong account silently.
  const r2 = run(sb, [row({ GLClass: 'IN20', NonStockGLClass: 'NS90', NonStockLineTypes: 'N' })]);
  ok(r2.combos[0].gc === 'IN20', 'a populated cardex class is not overwritten', 'gc = ' + JSON.stringify(r2.combos[0].gc));
  ok(r2.combos[0].ns === false, 'a cardex-sourced combo is not marked non-stock');
  ok(r2.sum.head.indexOf(NS_PHRASE) < 0, 'no non-stock sentence on a cardex-sourced class', r2.sum.head);

  // 3. Nothing to fall back TO. Both blank must behave exactly as before the change.
  const r3 = run(sb, [row({})]);
  ok(r3.combos[0].gc === '', 'both blank leaves the class blank');
  ok(r3.combos[0].ns === false, 'both blank is not marked non-stock');
  ok(r3.sum.head.indexOf('No account comparison ran') >= 0,
     'both blank still reports that nothing was compared', r3.sum.head);
  ok(r3.sum.head.indexOf(NS_PHRASE) < 0, 'both blank prints no non-stock sentence');

  // 4. THE SILENCE CASE. Non-stock, order-line class, but that class has NO 4152 model --
  //    so it is not a stock class and there is no question to ask. The sentence is a claim;
  //    printing it here would send the analyst after something that is not true.
  const r4 = run(sb, [row({ NonStockGLClass: 'NS90', NonStockLineTypes: 'N' })], { modelForIN20: false });
  ok(r4.combos[0].gc === 'NS90', 'the fallback still fires without a model');
  ok(r4.sum.list[0] && r4.sum.list[0].invDmaai === '4240', 'the inventory AAI still resolves');
  ok(r4.sum.head.indexOf(NS_PHRASE) < 0,
     'NO sentence when the order-line class has no cardex model', r4.sum.head);

  // 5. A mixed grid: one non-stock row and one ordinary cardex row keep separate combos,
  //    and the sentence names only the non-stock one's class.
  const r5 = run(sb, [
    row({ NonStockGLClass: 'IN20', NonStockLineTypes: 'N' }),
    row({ OT: 'SO', GLClass: 'IN20', CardexAmount: -100, LedgerAmount: -100, Variance: 0 })
  ]);
  ok(r5.combos.length === 2, 'the two rows stay distinct combos', 'combos = ' + r5.combos.length);
  ok(r5.combos.filter(function (c) { return c.ns; }).length === 1, 'exactly one combo is non-stock-sourced');
  ok((r5.sum.head.match(/IN20/g) || []).length >= 1, 'the sentence names the class', r5.sum.head);
}

/* --------------------------------------------------------------------------- run --- */

console.log('non-stock sales line GL-class fallback -- behaviour test\n' +
            'source: RRV8/inventory-transactions.html (three analyzer functions, sliced verbatim)');

caseSuite(loadSandbox(null), true);

// Control, last. Removing the fallback is the state the screen was in on 2026-08-20;
// it must reproduce the dashes.
const CONTROL_ANCHOR = 'if (og) { gc = og; ns = true; nsTypes = String(r.NonStockLineTypes || \'\').trim(); }';
caseSuite(loadSandbox(function (src) {
  if (src.indexOf(CONTROL_ANCHOR) < 0) throw new Error('control anchor not found -- the fallback changed shape');
  return src.replace(CONTROL_ANCHOR, '/* control: fallback removed */');
}), false);

/* ------------------------------------------------ the AI grounding fact (SDLNTY) --- */
//
// SDLNTY is the ORDER's distinct set of line types, so a mixed order reads 'N, S'. The
// equality test on 'N' is correct -- a mixed order cannot support "GL-only is expected
// off inventory", because one of those lines DID move inventory -- but the else branch
// used to turn that silence into "no non-stock line in this slice". Measured on Demo1
// 2026-08-20: 9 documents carry a pure 'N' and 8 carry N among stock lines, and ALL
// THREE rows of the co 80002 "Non-Stock Sales Lines" card are 'N, S' or 'N, S, W'. So
// the sentence that would have shipped is a negative finding, on the very card the
// check was written for, fed into an AI prompt whose grounding treats facts as true.

const FP_PIECES = ['_txMoney', '_txvModelFor', '_txvIsDupSale', '_txvFingerprint', '_txvFingerprintText'];

function loadFpSandbox(rows, mutate) {
  let src = FP_PIECES.map(function (n) { return extractFn(html, n); }).join('\n');
  if (mutate) src = mutate(src);
  const sb = { console: console };
  sb.window = sb; sb.globalThis = sb;
  sb.filteredRows = function () { return rows; };
  sb._duplicateSalesIndex = null;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'inventory-transactions.html:fingerprint' });
  return sb;
}

function frow(over) {
  return Object.assign({
    CompanyNumber: '80002', OT: 'SO', DT: 'RI', Type: 'Sales', LongAccount: '80002.1380',
    OrderNumber: '1000001', DocNumber: '2000001',
    CardexAmount: 0, LedgerAmount: -579.84, Variance: -579.84, PeriodEnds: '2025-07-31',
    SDLNTY: ''
  }, over || {});
}

const MIXED_PHRASE = 'INCONCLUSIVE';
const NONE_PHRASE = 'no order in this slice carries a type-N line';

function fpSuite(expectFixed) {
  console.log(expectFixed ? '\nSHIPPED SOURCE - grounding fact' : '\nCONTROL (mixed orders dropped)');
  const mutate = expectFixed ? null : function (src) {
    const anchor = "var anyN  = toks.indexOf('N') >= 0;";
    if (src.indexOf(anchor) < 0) throw new Error('control anchor not found - the SDLNTY test changed shape');
    return src.replace(anchor, 'var anyN  = pureN;');
  };

  // A pure-N order and a mixed one, side by side, both GL-only.
  const rows = [
    frow({ SDLNTY: 'N', DocNumber: '2000001' }),
    frow({ SDLNTY: 'N, S', DocNumber: '2000002', OrderNumber: '1000002', Variance: -1157.40, LedgerAmount: -1157.40 })
  ];
  const sb = loadFpSandbox(rows, mutate);
  const fp = sb._txvFingerprint(null);
  const text = sb._txvFingerprintText(fp);

  if (expectFixed) {
    ok(fp.nonStock.length === 1, 'the pure-N document is a non-stock finding', 'n = ' + fp.nonStock.length);
    ok(fp.nonStockMixed.length === 1, 'the mixed order is counted separately', 'n = ' + fp.nonStockMixed.length);
    ok(fp.nonStock.every(function (n) { return n.doc !== '2000002'; }), 'the mixed order is NOT asserted as non-stock relief');
    ok(text.indexOf(MIXED_PHRASE) >= 0, 'the fact says the mixed case is inconclusive');
    ok(text.indexOf('N, S') >= 0, 'the fact names the order line types it could not resolve');
    ok(text.indexOf(NONE_PHRASE) < 0, 'the fact does NOT claim there is no type-N line');
  } else {
    ok(fp.nonStock.length === 1, 'CONTROL: the pure-N document still lands');
    ok(!fp.nonStockMixed || fp.nonStockMixed.length === 0, 'CONTROL: the mixed order is dropped entirely');
    ok(text.indexOf(MIXED_PHRASE) < 0, 'CONTROL: nothing reports the mixed order');
    return;
  }

  // Every order mixed: the false negative in its purest form. Nothing may claim absence.
  const allMixed = loadFpSandbox([frow({ SDLNTY: 'N, S, W' })], mutate);
  const fp2 = allMixed._txvFingerprint(null);
  const t2 = allMixed._txvFingerprintText(fp2);
  ok(fp2.nonStock.length === 0, 'no pure-N document, so no non-stock finding');
  ok(t2.indexOf(NONE_PHRASE) < 0, 'STILL no "there is no type-N line" claim when every order is mixed', t2);
  ok(t2.indexOf(MIXED_PHRASE) >= 0, 'the inconclusive fact carries the slice on its own');

  // A type-N line that DID relieve inventory is not a GL-only finding.
  const relieved = loadFpSandbox([frow({ SDLNTY: 'N', CardexAmount: -50 })], mutate);
  ok(relieved._txvFingerprint(null).nonStock.length === 0, 'a type-N row with cardex relief is not counted');

  // No SDLNTY at all: degrade safe, exactly as before the agent shipped the column.
  const blind = loadFpSandbox([frow({})], mutate);
  const fp4 = blind._txvFingerprint(null);
  const t4 = blind._txvFingerprintText(fp4);
  ok(fp4.sawLineType === false, 'no SDLNTY means the check never ran');
  ok(t4.indexOf('Non-stock line check') < 0 && t4.indexOf(MIXED_PHRASE) < 0,
     'no SDLNTY means NO claim in either direction', t4);

  // Genuinely no type-N anywhere: the absence claim is allowed, and only here.
  const clean = loadFpSandbox([frow({ SDLNTY: 'S, W' })], mutate);
  const t5 = clean._txvFingerprintText(clean._txvFingerprint(null));
  ok(t5.indexOf(NONE_PHRASE) >= 0, 'absence IS claimed when the slice truly has no type-N line', t5);
}

fpSuite(true);
fpSuite(false);

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
process.exit(failures ? 1 : 0);
