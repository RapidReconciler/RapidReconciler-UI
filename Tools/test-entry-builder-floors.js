/* test-entry-builder-floors.js -- behaviour test for UI-262: which accounts each entry builder journals.
 *
 *   node Tools/test-entry-builder-floors.js
 *
 * WHY THIS EXISTS. V8 has two builders for the correcting entry, and they admit accounts at different floors:
 *   - the Adjusting Entry (_oeBuild -> RRV8.oeEntry.compose) takes an account only if its out-of-balance is at least
 *     MAT_OOB_FLOOR (100, in the company's own currency), the set the Accounts grid flags, and then drops any line
 *     whose journal-able part (carry forward + transactions + manual entries) is under 1;
 *   - the Balancing Entry (openJeModal) takes every account whose journal-able net is 0.005 or more, because it
 *     exists to bring the company to zero, and posts the residual to one clearing line.
 * Owner ruling 2026-11-02 (UI-262): "Keep every cent". The difference is intended. Until then the reference doc said
 * $100 was the only floor, and nothing would have noticed either builder's floor moving: both entries balance by
 * construction, so a wrong set of accounts still renders as a balanced entry.
 *
 * This runs the SHIPPED _oeBuild and openJeModal, sliced out of home.html, with config.js run whole and a stub DOM.
 * The fixture is fictional (company 90001, reserved namespace), one row per edge:
 *   A  5000.140000  out 250, all transactions          both builders
 *   B  5000.141000  out 40                             Balancing only (under the 100 floor)
 *   C  5000.142000  out 0.01                           Balancing only (one cent)
 *   D  5000.143000  out 0.004                          neither (under a cent)
 *   E  5000.144000  out 150, 149.50 of it unposted     Balancing only: over the floor, but its journal-able 0.50
 *                                                      is under the Adjusting Entry's 1 line floor
 *
 *   F1  the Adjusting Entry journals A only
 *   F2  the Balancing Entry journals A, B, C and E, plus its clearing line
 *   F3  CONTROL: the Balancing Entry's clearing line takes the whole net (290.51), so the entry clears every cent
 *
 * THREE MUTATION ARMS, each must redden only its own case:
 *   the Adjusting Entry loses its account floor            -> F1
 *   the Balancing Entry takes the 100 floor                -> F2
 *   the Adjusting Entry's line floor drops to zero         -> F1
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');
const CONFIG = fs.readFileSync(path.join(ROOT, 'RRV8/config.js'), 'utf8').replace(/\r\n/g, '\n');

// Brace-matched, so a nested object literal does not end the block early (same slicer as test-acct-ask-txv.js).
function sliceBlock(src, startIdx) {
  let depth = 0;
  for (let i = src.indexOf('{', startIdx); i < src.length; i++) {
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
function extractFn(html, name) {
  const at = html.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(html, at + 1);
}
function extractLine(html, re, what) {
  const m = html.match(re);
  if (!m) throw new Error(what + ' not found in home.html');
  return m[0];
}

// Just enough DOM for openJeModal to build its table: elements that remember their children and markup.
function el(tag) {
  const e = { tag, className: '', innerHTML: '', textContent: '', title: '', hidden: true, disabled: false, children: [],
    classList: { add(c) { e.className += ' ' + c; }, remove() {} },
    appendChild(c) { e.children.push(c); return c; }, setAttribute() {} };
  return e;
}
function walk(e, out) { (e.children || []).forEach((c) => { out.push(c); walk(c, out); }); return out; }

const CO = '90001', PER = '2026-08-28';
const row = (acct, f) => Object.assign({ CompanyNumber: CO, PeriodEnds: PER, LongAccount: acct, Currency: 'USD',
  BegVar: 0, Variance: 0, JEs: 0, UnpostBatch: 0, EndofDay: 0 }, f);
const ROWS = [
  row('5000.140000', { OOB: 250, Variance: 250 }),
  row('5000.141000', { OOB: 40, Variance: 40 }),
  row('5000.142000', { OOB: 0.01, Variance: 0.01 }),
  row('5000.143000', { OOB: 0.004, Variance: 0.004 }),
  row('5000.144000', { OOB: 150, UnpostBatch: 149.5, Variance: 0.5 }),
];

let failures = 0;
const reds = [];
function check(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log('ok   ' + name); return; }
  failures++; reds.push(name.split(' ')[0]);
  console.log('FAIL ' + name + '\n       got  ' + g + '\n       want ' + w);
}

function runCases(home, config) {
  reds.length = 0;
  const els = {};
  ['jeModal', 'jeModalBody', 'jeModalTitle', 'jeAiBanner', 'jeAiSummary', 'jeExportBtn', 'jeVcode'].forEach((id) => { els[id] = el('div'); });
  const sb = {
    console: { warn() {}, log() {}, error() {} },
    document: { createElement: el, addEventListener() {}, querySelector() { return null; }, getElementById: (id) => els[id] || null },
    localStorage: { getItem() { return null; }, setItem() {} }, navigator: { language: 'en-US' },
    // The page's state, set the way a loaded Accountant Home has it.
    _invRows: ROWS, _acctData: { companies: [{ co: CO, ccy: 'USD' }], viewedPeriod: PER },
    _oeExclCF: false, _acctNames: null,
    _jeCo: null, _jeData: null, _jeFillQueue: [], _jeRevealing: false, _jeSummary: [],
    // I/O and wiring the builders call but that decide nothing about which accounts are in the entry.
    $: (id) => els[id] || null, _wireJeModal() {}, revealJeMatrix() {}, _beMintToken: () => 'RRTEST01',
    _jeClearingAccount: () => '(clearing account)', _jeOffValue: () => ({ val: '', from: '' }), _jeWhy: () => '',
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(config, sb);
  vm.runInContext([
    extractLine(home, /\n  var MAT_OOB_FLOOR = [^\n]*\n/, 'MAT_OOB_FLOOR'),
    extractFn(home, 'esc'), extractFn(home, '_coOf'), extractFn(home, '_jeCell'),
    extractFn(home, '_oeBuild'), extractFn(home, 'openJeModal'),
    'var RRV8 = window.RRV8;',
  ].join('\n'), sb);

  // F1 -- the Adjusting Entry: the floor the Accounts grid uses, then the 1 line floor.
  const adj = sb._oeBuild(CO);
  check('F1 the Adjusting Entry journals only the account at or over the 100 floor with 1 or more to journal',
    adj ? adj.pairs.map((p) => p.orig.acct) : null, ['5000.140000']);

  // F2 / F3 -- the Balancing Entry, read back from the table it renders.
  sb.openJeModal(CO);
  const accts = walk(els.jeModalBody, []).filter((e) => /ws-je-acct/.test(e.className))
    .map((e) => e.innerHTML.split('<span')[0]);
  check('F2 the Balancing Entry journals every account with a cent or more, then its clearing line',
    accts.slice().sort(), ['5000.140000', '5000.141000', '5000.142000', '5000.144000', 'Clearing Account'].sort());
  check('F3 CONTROL: the clearing line takes the whole net, so the entry clears every cent',
    sb._jeData ? Math.round(sb._jeData.nettot * 100) / 100 : null, 290.51);
  return reds.slice();
}

console.log('Entry builders: which accounts each one journals (UI-262)');
runCases(HOME, CONFIG);
const shippedFailures = failures;
let armFailures = 0;
function arm(label, want, home, config) {
  if (home === HOME && config === CONFIG) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = [...new Set(runCases(home, config))];
  failures = saved;
  const ok = got.join(',') === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
}
if (shippedFailures === 0) {
  arm('the Adjusting Entry loses its account floor', 'F1',
    HOME.replace('Math.abs(Number(r.OOB) || 0) >= MAT_OOB_FLOOR; });', 'true; });'), CONFIG);
  arm('the Balancing Entry takes the 100 floor', 'F2',
    HOME.replace('var mat = 0.005, nettot = 0', 'var mat = MAT_OOB_FLOOR, nettot = 0'), CONFIG);
  arm('the Adjusting Entry\'s line floor drops to zero', 'F1',
    HOME, CONFIG.replace('var DROP_UNDER = 1;', 'var DROP_UNDER = 0;'));
}
const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
