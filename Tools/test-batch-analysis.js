/* test-batch-analysis.js -- behaviour test for Home > Reports > Batch Analysis (UI-270).
 *
 *   node Tools/test-batch-analysis.js
 *
 * WHAT IT PINS. The report is arithmetic an analyst hands to an auditor: per inventory
 * account, F4111 less F0911, and the batch's own GL net. Three things would make it lie
 * quietly, and each has an arm:
 *   1. the tie: an account off by a cent must not read "Ties", and float dust must not
 *      read as a difference;
 *   2. the grouping: every line lands in exactly one company + account group, a line with
 *      no inventory account gets its own group instead of vanishing, and offset accounts
 *      are kept apart from the inventory tie;
 *   3. the export: the workbook carries the same totals as the screen, a subtotal per
 *      account, and says when lines were left out (search, or companies outside access).
 *
 * SOURCE IS NOT RETYPED. RRV8/batch-analysis.js is loaded as-is into a VM.
 *
 * THE CONTROL RUNS LAST: it loads a copy with the tie tolerance widened to 5.00 and
 * requires the tie arm to catch it. If the control passes clean, this file measures nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'batch-analysis.js'), 'utf8');

function load(src) {
  const ctx = { window: {}, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'batch-analysis.js' });
  return ctx.window.RRV8.batchAnalysis;
}

let failures = 0, passes = 0, quiet = false;
function check(cond, msg) {
  if (cond) { passes++; return; }
  failures++; if (!quiet) console.log('FAIL: ' + msg);
}
function near(a, b) { return Math.abs(a - b) < 1e-9; }

// A manufacturing batch in miniature, company 90001 (the hand-written reserve), plus one
// line in a second company to prove the groups key on company AND account.
const RAW = '9900001.1411';      // raw materials, inventory
const FG  = '9900001.1415';      // finished goods, inventory
const WIP = '9900001.1420';      // work in process: the offset side
function payload() {
  return {
    batch: 4242, scope: 'ok',
    cardex: [
      { Company: '90001', Account: RAW, AccountDescription: 'Raw Materials', DocType: 'IM', DocNumber: 77, LineNumber: 1, ItemNumber: 'A-1', Amount: -10.25, Quantity: -2, UnitCost: 5.125, GLDate: '2026-10-31' },
      { Company: '90001', Account: RAW, AccountDescription: 'Raw Materials', DocType: 'IM', DocNumber: 77, LineNumber: 2, ItemNumber: 'A-2', Amount: -4.75, Quantity: -1, UnitCost: 4.75, GLDate: '2026-10-31' },
      { Company: '90001', Account: FG,  AccountDescription: 'Finished Goods', DocType: 'IC', DocNumber: 78, LineNumber: 1, ItemNumber: 'F-9', Amount: 20.00, Quantity: 4, UnitCost: 5, GLDate: '2026-11-01' },
      { Company: '90001', Account: null, AccountDescription: null, DocType: 'IM', DocNumber: 79, LineNumber: 1, ItemNumber: '', ShortItem: 31337, Amount: -1.00, GLDate: '2026-11-01' },
      { Company: '90002', Account: RAW, AccountDescription: 'Raw Materials', DocType: 'IM', DocNumber: 80, LineNumber: 1, ItemNumber: 'A-1', Amount: -3.00, GLDate: '2026-11-01' }
    ],
    ledger: [
      // RAW 90001 ties exactly, split over two GL lines with float-awkward amounts.
      { Company: '90001', Account: RAW, AccountDescription: 'Raw Materials', InventoryAccount: 1, DocType: 'IM', DocNumber: 9077, LineNumber: 1, BatchType: '0', Amount: -10.1, GLDate: '2026-10-31' },
      { Company: '90001', Account: RAW, AccountDescription: 'Raw Materials', InventoryAccount: 1, DocType: 'IM', DocNumber: 9077, LineNumber: 2, BatchType: '0', Amount: -4.9, GLDate: '2026-10-31' },
      // FG 90001 is one cent short: 20.00 in F4111, 19.99 in F0911.
      { Company: '90001', Account: FG,  AccountDescription: 'Finished Goods', InventoryAccount: 1, DocType: 'IC', DocNumber: 9078, LineNumber: 1, BatchType: '0', Amount: 19.99, GLDate: '2026-11-01' },
      // RAW 90002: GL is 3.004 vs cardex 3.00 -- float dust under half a cent ties.
      { Company: '90002', Account: RAW, AccountDescription: 'Raw Materials', InventoryAccount: 1, DocType: 'IM', DocNumber: 9080, LineNumber: 1, BatchType: '0', Amount: -3.004, GLDate: '2026-11-01' },
      // The offset: WIP, an account RR loads but not an inventory account.
      { Company: '90001', Account: WIP, AccountDescription: 'Work in Process', InventoryAccount: 0, DocType: 'IM', DocNumber: 9077, LineNumber: 3, BatchType: '0', Amount: -1.986, GLDate: '2026-10-31' },
      { Company: '90001', Account: WIP, AccountDescription: 'Work in Process', InventoryAccount: 0, DocType: 'IM', DocNumber: 9077, LineNumber: 4, BatchType: '0', Amount: 0, GLDate: '2026-10-31' }
    ],
    outOfScope: { cardex: 2, ledger: 1 }
  };
}

function run(ba, label) {
  const local = { failed: 0 };
  const c = (cond, msg) => { check(cond, label + ': ' + msg); if (!cond) local.failed++; };

  // ---- input parsing mirrors BatchAnalysisController.parseBatch
  c(ba.parseBatchInput('13298823').batch === 13298823, 'digits parse');
  c(ba.parseBatchInput('  42 ').batch === 42, 'spaces are trimmed');
  c(ba.parseBatchInput('2147483647').batch === 2147483647, 'INT max is allowed');
  ['', '   ', 'abc', '12.5', '-1', '0', '2147483648', '12345678901', '1e5', '12 34'].forEach(function (s) {
    const r = ba.parseBatchInput(s);
    c(!r.batch && /batch number/i.test(r.error || ''), 'refused with a reason: "' + s + '"');
  });

  // ---- the model
  const m = ba.buildModel(payload());
  const acct = (co, a) => m.accounts.filter(x => x.company === co && x.account === a)[0];
  const fg = acct('90001', FG), raw1 = acct('90001', RAW), raw2 = acct('90002', RAW), none = acct('90001', ba.NO_ACCOUNT);

  c(m.accounts.length === 4, 'four inventory groups: RAW x2 companies, FG, no-account (got ' + m.accounts.length + ')');
  c(fg && !fg.ties && near(fg.diff, 0.01), 'FG is one cent off and does NOT tie (diff ' + (fg && fg.diff) + ')');
  c(raw1 && raw1.ties && raw1.cxLines === 2 && raw1.glLines === 2, 'RAW 90001 ties over 2 + 2 lines');
  c(raw2 && raw2.ties, 'RAW 90002 ties: 0.004 of float dust is under half a cent');
  c(none && !none.ties && none.cxLines === 1 && none.glLines === 0 && near(none.diff, -1), 'a line with no inventory account keeps its own group and shows as a difference');
  c(m.cardex[3].ItemNumber === '31337', 'an unresolved item shows its short item number');
  // Order: not-tied first, largest difference first; tied after.
  c(m.accounts[0] === none && m.accounts[1] === fg, 'accounts that do not tie come first, largest difference first');
  c(m.accounts.slice(2).every(a => a.ties), 'tied accounts follow');
  c(m.offsets.length === 1 && m.offsets[0].account === WIP && m.offsets[0].glLines === 2, 'WIP is an offset, not part of the inventory tie');

  c(near(m.totals.cardex, -10.25 - 4.75 + 20 - 1 - 3), 'F4111 total');
  c(near(m.totals.ledgerInventory, -10.1 - 4.9 + 19.99 - 3.004), 'F0911 inventory-account total');
  c(!m.totals.ties && m.totals.notTied === 2, 'the batch does not tie, on two accounts');
  c(near(m.totals.ledgerOther, -1.986) && m.totals.ledgerOtherLines === 2, 'the other-accounts total is the WIP lines only');
  // RR's F0911 holds only accounts in its own F0901 (usp8_apply_f0911), so the model
  // must not offer a balance verdict it cannot know. Pinned so it does not come back.
  c(!('ledgerBalanced' in m.totals) && !('ledgerNet' in m.totals), 'no batch-balance verdict from a partial F0911');
  c(m.batchTypes.join(',') === '0' && m.firstDate === '2026-10-31' && m.lastDate === '2026-11-01', 'batch type and GL date range');
  c(m.outOfScope.cardex === 2 && m.outOfScope.ledger === 1, 'out-of-scope counts carried');

  // ---- search
  const cols = ba.CARDEX_COLS;
  const all = ba.filterGroups(m.cardexGroups, '', cols);
  c(all.reduce((s, g) => s + g.shown.length, 0) === 5, 'no search shows every line');
  const a1 = ba.filterGroups(m.cardexGroups, 'a-1', cols);
  c(a1.length === 2 && a1.every(g => g.shown.length === 1), 'search narrows each group to its matching lines (A-1 in two companies)');
  c(near(a1.reduce((s, g) => s + g.shownAmount, 0), -13.25), 'a narrowed group totals only its matching lines');
  c(ba.filterGroups(m.cardexGroups, '^f-', cols).length === 1, '^ anchors the match to the start of a cell');
  c(ba.filterGroups(m.cardexGroups, '^-9', cols).length === 0, '^ does not match mid-cell');
  c(ba.filterGroups(m.cardexGroups, 'finished', cols).length === 1, 'the account description is searchable');

  // ---- export, as data
  const sheets = ba.exportSheets(m, {});
  c(sheets.length === 3 && sheets.map(s => s.name).join('|') === 'By account|F4111 lines|F0911 lines', 'three sheets');
  const by = sheets[0];
  c(by.totalRow[4] === Math.round(m.totals.cardex * 100) / 100 && by.totalRow[8] === 'No', 'By account total row carries the F4111 total and says it does not tie');
  c(by.titleLines.some(t => /3 lines in companies outside your access/.test(t)), 'the workbook says lines were left out for access');
  c(by.rows.some(r => r[0] === 'Other accounts total' && near(r[6], -1.99) && r[5] === 2), 'the other-accounts total row is in the workbook');
  c(!by.rows.some(r => /balance/i.test(String(r[0]) + String(r[8]))), 'the workbook makes no balance claim');
  c(by.rows.some(r => /not the rest of the batch/.test(String(r[0]))), 'the workbook says the other accounts are not the whole batch');
  const f4111 = sheets[1];
  const subs = f4111.subtotalRows.map(i => f4111.rows[i]);
  c(subs.length === 4, 'one subtotal row per F4111 account group (got ' + subs.length + ')');
  const amtCol = f4111.columns.map(x => x.label).indexOf('Amount');
  c(near(subs.reduce((s, r) => s + r[amtCol], 0), f4111.totalRow[amtCol]), 'subtotals add up to the sheet total');
  c(near(f4111.totalRow[amtCol], Math.round(m.totals.cardex * 100) / 100), 'the F4111 sheet total equals the screen total');
  c(f4111.rows.length === 5 + 4, 'every line once plus one subtotal per group');
  const filtered = ba.exportSheets(m, { query: 'a-1' });
  c(filtered[1].titleLines.some(t => /filtered to "a-1"/.test(t)), 'a filtered export says so');
  c(filtered[1].rows.length === 2 + 2, 'a filtered export holds only matching lines');
  c(f4111.columns[f4111.columns.map(x => x.label).indexOf('Doc Number')].num === true, 'doc numbers export as numbers');

  return local.failed;
}

run(load(SRC), 'real');

// ---- The tab, from the SHIPPED SUBVIEWS literal in home.html (sliced, evaluated, called).
// A brace scan that skips strings and comments: the block's comments carry braces of
// their own ("{adm, dm, su}"), so a bare count would end the slice in the wrong place.
(function () {
  const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');
  const anchor = 'var SUBVIEWS = {';
  const at = html.indexOf(anchor);
  check(at !== -1 && html.indexOf(anchor, at + 1) === -1, 'tab: the SUBVIEWS anchor is found exactly once');
  if (at === -1) return;
  let i = at + anchor.length - 1, depth = 0, end = -1;
  for (; i < html.length; i++) {
    const ch = html[i], nx = html[i + 1];
    if (ch === '/' && nx === '/') { i = html.indexOf('\n', i); continue; }
    if (ch === '/' && nx === '*') { i = html.indexOf('*/', i) + 1; continue; }
    if (ch === "'" || ch === '"') { const q = ch; i++; while (i < html.length && html[i] !== q) { if (html[i] === '\\') i++; i++; } continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  check(end > at, 'tab: the SUBVIEWS literal closes');
  const literal = html.slice(at + 'var SUBVIEWS = '.length, end + 1);
  let analyst = false;
  const build = new Function('canAnalyst', 'isAdmin', 'canTools', 'return (' + literal + ');');
  const views = build(() => analyst, () => false, () => false);
  const tabs = views.analyst || [];
  const rpt = tabs.filter(t => t.k === 'rpt');
  check(rpt.length === 1 && rpt[0].label === 'Reports', 'tab: exactly one analyst tab keyed rpt, labelled Reports');
  check(tabs.filter(t => t.k === 'reports').map(t => t.label).join() === 'Cardex Variance',
    'tab: the key "reports" still belongs to Cardex Variance (a persisted sub-view must not move)');
  if (rpt.length === 1) {
    check(typeof rpt[0].gate === 'function', 'tab: Reports is gated');
    analyst = false; check(rpt[0].gate() === false, 'tab: no analyst grant, no Reports tab');
    analyst = true;  check(rpt[0].gate() === true, 'tab: the analyst grant shows the Reports tab');
  }
  const ks = tabs.map(t => t.k);
  check(ks.indexOf('rpt') > ks.indexOf('reports') && ks.indexOf('rpt') < ks.indexOf('tools'), 'tab: Reports sits after Cardex Variance and before Tools');
})();

// ---- CONTROL: widen the tolerance to 5.00 and the one-cent FG difference must "tie".
const mutated = SRC.replace('var TIE_TOLERANCE = 0.005;', 'var TIE_TOLERANCE = 5;');
if (mutated === SRC) {
  failures++; console.log('FAIL: control could not find the tolerance line -- the control is not testing anything');
} else {
  const before = failures, beforePass = passes;
  quiet = true;
  const caught = run(load(mutated), 'control');
  quiet = false;
  // The control's failures are expected; take them back out of the totals.
  failures = before; passes = beforePass;
  if (caught === 0) { failures++; console.log('FAIL: control -- a 5.00 tolerance went unnoticed, so the tie arms measure nothing'); }
  else console.log('control: a 5.00 tie tolerance was caught by ' + caught + ' assertion(s)');
}

console.log(passes + ' passed, ' + failures + ' failed');
process.exit(failures ? 1 : 0);
