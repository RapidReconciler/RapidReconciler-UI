/* test-txv-cost-method-branch.js -- behaviour test for the cost-method branch on the
 * A/P Voucher on Inventory card.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-txv-cost-method-branch.js
 *
 * WHY THIS EXISTS. The VCHR card's advice INVERTS on the customer's cost method:
 *
 *   Standard  -> AAI 4330 should route the variance OFF inventory, so value sitting
 *                on an inventory account means the route is wrong.
 *   Average   -> 4330 routes there BY DESIGN, the variance is absorbed into unit
 *                cost, the account is CORRECT, and the missing F4111 revaluation is
 *                the fault. Correcting 4330 here moves correctly-routed cost off
 *                inventory and CREATES the variance it was meant to fix.
 *
 * The card shipped the standard-cost prescription unconditionally, to a Demo2
 * customer measured as holding cost ledger 02 only (2026-09-12). The fix reads
 * v8ui_txv_cost_method and states the branch, suppressing the card's own
 * "not established here" line via _txFindingText's `suppress` map.
 *
 * THE TWO DEFECTS THIS PINS:
 *
 *   1. SUPPRESSING THE CAVEAT ON AN INDECISIVE ANSWER. 'Mixed' and 'Unknown' are
 *      real states -- Demo1 Co 80008 holds 138 average-cost items against 35,381
 *      standard -- and neither settles the branch. Killing the card's caveat there
 *      would replace an honest "not established" with a confident half-answer, on a
 *      question whose two answers prescribe opposite actions.
 *   2. THE ALL-COMPANIES ROLL-UP PICKING A MAJORITY. A combined view can hold items
 *      of both methods, so it must report the LEAST decisive state, never the most
 *      common one.
 *
 * SOURCE IS NOT RETYPED. _txFindingText, _txCostState and _txCostDecided are sliced
 * out of RRV8/inventory-transactions.html.
 *
 * THE CONTROL RUNS LAST and removes the decisiveness gate. If it passes clean, the
 * 'Mixed' assertions are not measuring anything.
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
  if (at < 0) throw new Error('function ' + name + ' not found in inventory-transactions.html');
  return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');
const FINDING_SRC = extractFn(html, '_txFindingText');
const STATE_SRC   = extractFn(html, '_txCostState');
const DECIDED_SRC = extractFn(html, '_txCostDecided');

// Rows exactly as v8ui_txv_cost_method returns them, using the states measured on
// the three demo databases 2026-09-13.
const ROWS = {
  demo2:  [{ CompanyNumber: '80010', CostMethodState: 'Average',  MethodNote: 'Weighted average (cost ledger 02, 18162 items; no items on ledger 07). Do not re-route AAI 4330.' }],
  std:    [{ CompanyNumber: '80002', CostMethodState: 'Standard', MethodNote: 'Standard cost (cost ledger 07, 38033 items; no items on ledger 02).' }],
  mixed:  [{ CompanyNumber: '80008', CostMethodState: 'Mixed',    MethodNote: 'Both cost ledgers are populated -- 35381 items on standard (07) and 138 on weighted average (02).' }],
  // All-companies: one clean Average beside one Mixed. The roll-up must report Mixed.
  allCos: [{ CompanyNumber: '30001', CostMethodState: 'Average', MethodNote: 'avg note' },
           { CompanyNumber: '30002', CostMethodState: 'Mixed',   MethodNote: 'mixed note' }]
};

function build(rows, activeCompany, extraSrc) {
  const sandbox = { console: console };
  sandbox._txCostRows = rows;
  sandbox._state = { activeCompany: activeCompany };
  // The real _coKey: trim + string, applied to BOTH sides. CompanyNumber is nchar
  // server-side so a bare === never matches a trimmed URL company.
  sandbox._coKey = function (v) { return String(v == null ? '' : v).trim(); };
  vm.createContext(sandbox);
  vm.runInContext(FINDING_SRC + '\n' + (extraSrc || STATE_SRC) + '\n' + DECIDED_SRC, sandbox,
                  { filename: 'inventory-transactions.html' });
  return sandbox;
}

// The VCHR found bullets as config.js carries them: two branch bullets plus the
// KEYED caveat the page suppresses.
const VCHR_FOUND = [
  'Under standard cost the route is the fault: DMAAI 4330 should be sending this variance off the inventory account.',
  'Under weighted average the account is correct. The variance is absorbed into unit cost, so the absent item-ledger row is the fault.',
  { k: 'costmethod', t: 'Which one applies is not established here. Nothing in the claim reads a cost ledger or an AAI.' }
];

// Mirrors the call site: append the note when decided, and pass the same flag as
// the suppressor. Both halves of the swap, driven by one predicate.
function draft(s) {
  const decided = s._txCostDecided();
  const c = decided ? s._txCostState() : null;
  const found = (c && c.note) ? VCHR_FOUND.concat([c.note]) : VCHR_FOUND;
  return s._txFindingText({ title: 'A/P Voucher on Inventory', found: found },
                          { costmethod: decided });
}

console.log('-- a decisive AVERAGE customer: caveat out, measured note in --');
{
  const s = build(ROWS.demo2, '80010');
  ok(s._txCostState().state === 'Average', 'state resolves to Average');
  ok(s._txCostDecided() === true, 'Average is decisive');
  const t = draft(s);
  ok(t.indexOf('not established here') < 0, 'the card caveat is suppressed',
     'text was: ' + JSON.stringify(t));
  ok(t.indexOf('Do not re-route AAI 4330') >= 0, 'the measured note is stated');
  ok(t.indexOf('Under weighted average the account is correct') >= 0,
     'and both branch bullets still stand, so the analyst sees the reasoning');
}

console.log('-- a decisive STANDARD customer --');
{
  const s = build(ROWS.std, '80002');
  ok(s._txCostState().state === 'Standard', 'state resolves to Standard');
  const t = draft(s);
  ok(t.indexOf('not established here') < 0, 'caveat suppressed');
  ok(t.indexOf('Standard cost (cost ledger 07') >= 0, 'the standard note is stated');
}

console.log('-- MIXED: the caveat MUST stand --');
{
  const s = build(ROWS.mixed, '80008');
  ok(s._txCostState().state === 'Mixed', 'state resolves to Mixed');
  ok(s._txCostDecided() === false, 'Mixed is NOT decisive');
  const t = draft(s);
  ok(t.indexOf('not established here') >= 0,
     'the card caveat still prints on a mixed customer', 'text was: ' + JSON.stringify(t));
  ok(t.indexOf('Both cost ledgers are populated') < 0,
     'and the indecisive note is NOT appended as if it settled the branch');
}

console.log('-- all companies: the roll-up reports the LEAST decisive state --');
{
  const s = build(ROWS.allCos, '');
  ok(s._txCostState().state === 'Mixed', 'Mixed wins over Average across companies',
     'got: ' + JSON.stringify(s._txCostState()));
  ok(s._txCostDecided() === false, 'so the combined view does not suppress the caveat');
}

console.log('-- no rows / no matching company --');
{
  ok(build([], '80010')._txCostState() === null, 'empty payload resolves to null');
  ok(build(ROWS.demo2, '99999')._txCostState() === null, 'a company with no row resolves to null');
  ok(build(ROWS.demo2, '99999')._txCostDecided() === false, 'and is not decisive');
  const t = draft(build(ROWS.demo2, '99999'));
  ok(t.indexOf('not established here') >= 0, 'so the card caveat stands, which is correct');
}

console.log('-- company keys are compared trimmed on BOTH sides --');
{
  // CompanyNumber is nchar(5) server-side, so it arrives space-padded.
  const padded = [{ CompanyNumber: '80010  ', CostMethodState: 'Average', MethodNote: 'n' }];
  ok(build(padded, '80010')._txCostState() !== null,
     'a space-padded CompanyNumber still matches a trimmed URL company');
}

/* ---- the control ------------------------------------------------------- */
// Remove the decisiveness gate so 'Mixed' counts as decided, and check the Mixed
// assertions above then fail. Without this they prove nothing.
console.log('-- CONTROL: decisiveness gate removed, Mixed must then be swallowed --');
{
  const ungated = DECIDED_SRC.replace(
    "return !!(c && (c.state === 'Average' || c.state === 'Standard'));",
    'return !!c;');
  ok(ungated !== DECIDED_SRC, 'the control actually modified the source',
     'the guard line was not found verbatim - this control measures nothing');

  const sandbox = { console: console, _txCostRows: ROWS.mixed,
                    _state: { activeCompany: '80008' },
                    _coKey: function (v) { return String(v == null ? '' : v).trim(); } };
  vm.createContext(sandbox);
  vm.runInContext(FINDING_SRC + '\n' + STATE_SRC + '\n' + ungated, sandbox, { filename: 'control' });
  const t = draft(sandbox);
  ok(t.indexOf('not established here') < 0,
     'CONTROL: ungated, a Mixed customer loses the caveat -- the defect is real',
     'if the caveat is still present the Mixed assertion above proves nothing');
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
