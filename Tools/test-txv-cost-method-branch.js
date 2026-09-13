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
const KILL_SRC    = extractFn(html, '_txCostKill');
const KEEP_SRC    = extractFn(html, '_txKeepBullets');

// ⛔ THE CATALOG IS READ, NOT RETYPED -- AND IT USED TO BE RETYPED, WHICH IS WHY THIS
// TEST WENT GREEN THROUGH A REAL DEFECT. The first cut carried a hand-copied VCHR_FOUND
// array, so it exercised the RENDERER against a fixture while the card copy it was
// supposed to protect lived in config.js and could change underneath it without a single
// assertion moving. On 2026-09-13 the owner found the card printing the standard branch,
// the average branch and the measured note in one report; this file was passing at the
// time and could not have seen it. Hard rule 6, in its own house.
const CONFIG_SRC = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'config.js'), 'utf8');
function loadCatalog(src) {
  const sandbox = { window: { RRV8: {} }, console: console, document: undefined };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src || CONFIG_SRC, sandbox, { filename: 'config.js' });
  const txv = sandbox.window.RRV8 && sandbox.window.RRV8.txv;
  if (!txv || !txv.META) throw new Error('config.js ran but exposed no RRV8.txv.META');
  return txv.META;
}
const META = loadCatalog();
const VCHR = META.VCHR && META.VCHR.finding;
if (!VCHR) throw new Error('no VCHR finding block in the catalog -- the card was renamed or removed');

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
  vm.runInContext(FINDING_SRC + '\n' + (extraSrc || STATE_SRC) + '\n' + DECIDED_SRC
                  + '\n' + KILL_SRC + '\n' + KEEP_SRC, sandbox,
                  { filename: 'inventory-transactions.html' });
  return sandbox;
}

// Mirrors the call site in _txAnalyze: one suppress map from _txCostKill, the note
// appended when the method is decided, and the SAME map used for the finding and for
// the text handed to the AI narration. `routesRead` is false throughout -- this file is
// about the cost-method branch, and the DMAAI key belongs to its own test.
function draft(s) {
  const kill = s._txCostKill(false);
  const decided = s._txCostDecided();
  const c = decided ? s._txCostState() : null;
  const base = Array.isArray(VCHR.found) ? VCHR.found : [VCHR.found];
  const found = (c && c.note) ? base.concat([c.note]) : base;
  return s._txFindingText({ title: 'A/P Voucher on Inventory',
                            context: VCHR.context, found: found, fix: VCHR.fix }, kill);
}
// What the AI narration is handed. It reads the same map, so it cannot explain a branch
// the card above it did not print.
function narrationFix(s) {
  return s._txKeepBullets(VCHR.fix, s._txCostKill(false)).join(' ');
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
  // ⚠ REVERSED 2026-09-13. This used to assert that BOTH generic branch bullets still
  // stand. On a decided customer they restate the measured note without its evidence, so
  // "What I found" ran the standard branch, the average branch and the note -- one thing
  // said three times, on the surface whose whole rule is all signal and no noise.
  ok(t.indexOf('Under standard cost the route is the fault') < 0,
     'the standard branch is gone from a measured-Average report', 'text was: ' + JSON.stringify(t));
  ok(t.indexOf('Under weighted average the account is correct') < 0,
     'and so is the generic average bullet -- the measured note carries it, with the counts');

  // THE INSTRUCTION. "Chase the missing F4111 write" named no query, on the one branch
  // where RR's own copy is exhausted (owner 2026-09-13: "we pay you to chase it").
  ok(t.indexOf('leave 4330 alone') >= 0,
     'the average branch says NOT to touch 4330');
  ok(t.indexOf('Correct DMAAI 4330 at the source') < 0,
     'and the standard-cost prescription is not printed at all -- acting on it CREATES the variance');
  ok(t.indexOf('Query source JDE F4111 for these document numbers') >= 0,
     'the decisive source query is named, the way Transfer Leg Missing names its own');
  ok(t.indexOf('chase') < 0,
     'nothing tells the analyst to "chase" anything without a method');
  ok(narrationFix(s).indexOf('Correct DMAAI 4330 at the source') < 0
     && narrationFix(s).indexOf('leave 4330 alone') >= 0,
     'the AI narration is handed the SAME branch the card printed');
  ok(narrationFix(s).indexOf('[object Object]') < 0,
     'and it is handed text, not the objects a keyed bullet is made of');
}

console.log('-- a decisive STANDARD customer --');
{
  const s = build(ROWS.std, '80002');
  ok(s._txCostState().state === 'Standard', 'state resolves to Standard');
  const t = draft(s);
  ok(t.indexOf('not established here') < 0, 'caveat suppressed');
  ok(t.indexOf('Standard cost (cost ledger 07') >= 0, 'the standard note is stated');
  // THE MIRROR IMAGE, and the one that matters most: the average branch tells the
  // analyst to leave 4330 alone. Printed to a standard-cost customer it protects the
  // exact misrouting the card exists to find.
  ok(t.indexOf('Correct DMAAI 4330 at the source') >= 0, 'the standard prescription IS printed here');
  ok(t.indexOf('leave 4330 alone') < 0, 'and the average branch is not -- it would defend the misroute');
  ok(t.indexOf('Query source JDE F4111') < 0, 'no source-JDE hunt on a branch RR can already explain');
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
  // NEITHER BRANCH'S INSTRUCTIONS MAY PRINT HERE. They prescribe opposite actions, and a
  // customer holding both ledgers has to be read per item -- so the card falls back to
  // the two-line "read the ledger first" pair, which is a real instruction, not a
  // shrug. This is the state Demo1 Co 80008 is actually in: 138 average-cost items
  // against 35,381 standard.
  ok(t.indexOf('Read the cost ledger first') >= 0, 'the read-it-first pair stands on Mixed');
  ok(t.indexOf('Correct DMAAI 4330 at the source') < 0 && t.indexOf('leave 4330 alone') < 0,
     'and neither branch prescription is offered', 'text was: ' + JSON.stringify(t));
  // The undecided path still names the query rather than saying "chase".
  ok(t.indexOf('query source JDE F4111 for the missing revaluation row') >= 0,
     'and even undecided, the average half names its query');
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
  vm.runInContext(FINDING_SRC + '\n' + STATE_SRC + '\n' + ungated
                  + '\n' + KILL_SRC + '\n' + KEEP_SRC, sandbox, { filename: 'control' });
  const t = draft(sandbox);
  ok(t.indexOf('not established here') < 0,
     'CONTROL: ungated, a Mixed customer loses the caveat -- the defect is real',
     'if the caveat is still present the Mixed assertion above proves nothing');
}

/* ---- the second control ------------------------------------------------ */
// THE BRANCH GATE, MUTATED IN THE CATALOG ITSELF. The first control proves the
// decisiveness rule is live; this one proves the assertions above are reading the
// SHIPPED card copy rather than a fixture that happens to agree with it. Strip the
// `stdbranch` key and that bullet has nothing in the suppress map to die to, so it
// prints on an average-cost customer -- which is the defect the owner found: the
// standard-cost prescription handed to a weighted-average company, where acting on it
// moves correctly-routed cost off inventory and CREATES the variance.
console.log('-- CONTROL 2: unkey the standard branch, it must reappear on an Average card --');
{
  const broken = CONFIG_SRC.split("k: 'stdbranch'").join("k: 'unmapped'");
  ok(broken !== CONFIG_SRC, 'the control actually modified the catalog',
     "no `k: 'stdbranch'` in config.js -- this control measures nothing");
  const brokenVchr = loadCatalog(broken).VCHR.finding;
  const s = build(ROWS.demo2, '80010');
  const t = s._txFindingText({ title: 'A/P Voucher on Inventory', fix: brokenVchr.fix },
                             s._txCostKill(false));
  ok(t.indexOf('Correct DMAAI 4330 at the source') >= 0,
     'CONTROL: unkeyed, the standard prescription reaches an Average customer -- the defect is real',
     'if it stays absent the branch assertions above prove nothing');
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
