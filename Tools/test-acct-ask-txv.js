/* test-acct-ask-txv.js -- behaviour test for UI-246: the accountant's Ask can name the transaction type.
 *
 *   node Tools/test-acct-ask-txv.js
 *
 * WHY THIS EXISTS. Asked "which transaction type is causing the most problems" on the Full plan, the
 * accountant Ask answered "I can't name a type from these figures" (owner's screenshot, 2026-10-29):
 * its facts carried only the reconciliation components. The owner: "not acceptable on the full or
 * enhanced plans. You do have access to variance totals by period in table RCLC2." The RCLC2 residual
 * (recstatus = 1) is what /inventory/transactions serves. This slices the SHIPPED fact builder and the
 * SHIPPED askAcct out of home.html, runs them with I/O stubbed, and reads the prompt that is sent.
 *
 *   A1  the facts give each company's variance by module and its largest groups (module, category,
 *       order/doc type, documents, net), for the viewed period and across loaded periods, with
 *       "in N of M periods" counted against the company's loaded periods; other companies' rows stay out
 *   A2  Enhanced masks the company ("Entity A") and no company number reaches the facts
 *   A3  a failed load says so and forbids guessing; the facts say this is a different measure from the
 *       card's Transactions component
 *   A4  askAcct on Full and Enhanced sends those facts and the "which type" answer shape; on Basic it
 *       never fetches the rows; a failed fetch still sends the prompt with "could not be loaded"
 *
 * TWO MUTATION CONTROLS: askAcct no longer loads the rows on Full / Enhanced (must redden A4 only),
 * and the Enhanced label ignoring the mask (must redden A2 only).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');

// Brace-matched, so a nested object literal does not end the block early (same slicer as test-data-freshness.js).
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
function extractVarFn(html, name) {
  const m = html.match(new RegExp('\\n  var ' + name + ' = function[^\\n]*\\n'));
  if (!m) throw new Error('var ' + name + ' not found in home.html');
  return m[0];
}

// Fictional companies from the 9XXXX reserve; the shape is Demo1's RCLC2 residual (measured 2026-10-29).
const row = (co, p, type, sub, ot, dt, v) => ({ CompanyNumber: co, PeriodEnds: p + 'T00:00:00', Type: type, SubType: sub, OT: ot, DT: dt, Variance: v });
const ROWS = [
  row('90002', '2025-07-31', 'Mfg', 'Mfg Cost Mismatch', 'WO', 'IC', 1000),
  row('90002', '2025-07-31', 'Mfg', 'Mfg Cost Mismatch', 'WO', 'IC', 500),
  row('90002', '2025-08-28', 'Mfg', 'Mfg Cost Mismatch', 'WO', 'IC', 250),
  row('90002', '2025-07-31', 'Mfg', 'Make to Order', 'WO', 'IM', -400),
  row('90002', '2025-07-31', 'Sales', 'Intercompany', 'SK', 'RI', -900),
  row('90002', '2025-07-31', 'Sales', 'Intercompany', 'SI', 'RI', 880),
  row('90002', '2025-06-30', 'Inventory', '', '', 'IT', 75),
  row('90008', '2025-07-31', 'Sales', 'Non-Stock Charge Lines', 'CW', 'RM', 5000),   // another company: must stay out of 90002's facts
];
const COMPANIES = [{ co: '90002', ccy: 'USD' }];
const INV_ROWS = ['2025-06-30', '2025-07-31', '2025-08-28'].map((p) => ({ CompanyNumber: '90002', PeriodEnds: p }));

function load(html) {
  const st = { tier: 'full', fetches: 0, prompt: null, fail: false };
  const sb = {
    console: { warn() {}, log() {}, error() {} },
    window: { RRV8: {} },
    RRV8: {},
    _invRows: INV_ROWS,
    _coNames: null,
    activeDb: () => ({ n: 'RapidReconciler_Demo1' }),
    rrFetch: (area) => { st.fetches++; st.area = area; return st.fail ? Promise.reject(new Error('500')) : Promise.resolve({ data: ROWS }); },
    _recsummaryLevel: () => st.tier,
    $: () => null,
    _briefScope: () => ({ period: '2025-07-31' }),
    _acctFactLines: () => ['Co 90002 (USD): net out-of-balance $1,000.00, components: Transactions $1,000.00'],
    _acctTrendFacts: () => [],
    _aiDocCatalogPrompt: () => '',
    _aiRenderDocStrip() {},
    _aiExtractDocs: (t) => ({ text: t, slugs: [] }),
    _acctRunAiAction: (t) => t,
    aiExplain: (prompt) => { st.prompt = prompt; return Promise.resolve({ ok: true, text: 'ok' }); },
    _acctConvo: null,
    _acctAsking: false,
    _acctLastAsk: null,
  };
  sb.window.RRV8 = sb.RRV8;
  vm.createContext(sb);
  const src = [
    extractVarFn(html, '_money'),
    'var _acctTxvCache = null;',
    ...['fmtPeriod', '_ccySym', '_coOf', '_txScope', '_txModuleOf', '_acctTxvRows', '_acctTxvFactLines', '_acctPeriodsOf', 'askAcct']
      .map((n) => extractFn(html, n)),
  ].join('\n');
  vm.runInContext(src, sb, { filename: 'home.html:acct-ask' });
  sb._acctData = { companies: COMPANIES, viewedPeriod: '2025-07-31', periodScoped: true };
  return { sb, st };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
const has = (lines, s) => lines.some((l) => l.includes(s));
const settle = () => new Promise((r) => setTimeout(r, 0));

async function runCases(html) {
  reds = [];
  let env;
  try { env = load(html); } catch (e) { check('A1 the fact builder loads from home.html', e.message, 'loaded'); return reds.slice(); }
  const { sb, st } = env;
  const periodsOf = (co) => sb._acctPeriodsOf(co);

  const full = sb._acctTxvFactLines(ROWS, COMPANIES, '2025-07-31', false, periodsOf);
  check('A1 the viewed period: open documents and the module roll-up, largest first',
    has(full, 'Co 90002, Jul 31, 2025: open 5 documents; by module: Manufacturing $1,100.00 (3 documents), Sales $-20.00 (2 documents).'), true);
  check('A1 the largest group names module, category, order/doc type, documents, net and recurrence',
    has(full, 'Manufacturing — Mfg Cost Mismatch, WO/IC: 3 documents, net $1,750.00, in 2 of 3 periods'), true);
  check('A1 an unclassified row is labelled, not dropped (and one document is singular)', has(full, 'Inventory — unclassified, -/IT: 1 document, net $75.00, in 1 of 3 periods'), true);
  check('A1 another company\'s rows stay out', has(full, 'Non-Stock Charge Lines') || has(full, '5,000'), false);

  const masked = sb._acctTxvFactLines(ROWS, COMPANIES, '2025-07-31', true, periodsOf);
  check('A2 Enhanced masks the company and sends no company number',
    [has(masked, 'Entity A, Jul 31, 2025'), masked.some((l) => l.includes('90002'))], [true, false]);

  const failed = sb._acctTxvFactLines(null, COMPANIES, '2025-07-31', false, periodsOf);
  check('A3 a failed load says so and forbids guessing', [has(failed, 'could not be loaded'), has(failed, 'do NOT guess')], [true, true]);
  check('A3 the facts say this is not the card\'s Transactions component',
    has(full, 'DIFFERENT measure from the "Transactions" component'), true);

  for (const tier of ['full', 'scrubbed']) {
    st.tier = tier; st.prompt = null; st.fetches = 0; sb._acctTxvCache = null; sb._acctAsking = false;
    vm.runInContext('_acctTxvCache = null; _acctAsking = false;', sb);
    sb.askAcct('which transaction type is causing the most problems');
    await settle(); await settle(); await settle();
    check('A4 ' + tier + ': askAcct fetches the RCLC2 rows and sends them with the "which type" shape',
      [st.fetches, st.area, !!st.prompt && st.prompt.includes('Transaction variance by type'),
       !!st.prompt && st.prompt.includes('Mfg Cost Mismatch, WO/IC'), !!st.prompt && st.prompt.includes('which transaction, document or order type')],
      [1, 'inventory/transactions', true, true, true]);
  }
  st.tier = 'grounded'; st.prompt = null; st.fetches = 0;
  vm.runInContext('_acctTxvCache = null; _acctAsking = false;', sb);
  sb.askAcct('which transaction type is causing the most problems');
  await settle(); await settle(); await settle();
  check('A4 Basic: no fetch, no type facts and no instruction pointing at them, the Ask still answers',
    [st.fetches, !!st.prompt, !!st.prompt && st.prompt.includes('Transaction variance by type'),
     !!st.prompt && st.prompt.includes('which transaction, document or order type')], [0, true, false, false]);
  st.tier = 'full'; st.fail = true; st.prompt = null;
  vm.runInContext('_acctTxvCache = null; _acctAsking = false;', sb);
  sb.askAcct('which transaction type is causing the most problems');
  await settle(); await settle(); await settle();
  check('A4 a failed fetch still sends the prompt, saying it could not be loaded',
    !!st.prompt && st.prompt.includes('could not be loaded'), true);
  return reds.slice();
}

(async () => {
  console.log('Accountant Ask: transaction variance by type (UI-246)');
  await runCases(HOME);
  const shippedFailures = failures;
  let armFailures = 0;
  async function arm(label, want, html) {
    if (html === HOME) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
    const saved = failures;
    console.log('\nmutation arm: ' + label);
    const got = [...new Set(await runCases(html))];
    failures = saved;
    const ok = got.join(',') === want;
    if (!ok) armFailures++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
  }
  if (shippedFailures === 0) {
    await arm('askAcct no longer loads the rows on Full / Enhanced', 'A4',
      HOME.replace("var _txvP = (tier === 'full' || tier === 'scrubbed')", "var _txvP = (false)"));
    await arm('the Enhanced label ignores the mask', 'A2',
      HOME.replace("var label = scrub ? ('Entity ' + String.fromCharCode(65 + (i % 26))) : ('Co ' + c.co);\n      var sym = _ccySym(c.ccy)",
        "var label = ('Co ' + c.co);\n      var sym = _ccySym(c.ccy)"));
  }
  const total = shippedFailures + armFailures;
  console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
  process.exit(total === 0 ? 0 : 1);
})();
