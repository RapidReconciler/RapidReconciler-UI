/* test-wl-dormant-materiality.js -- behaviour test for UI-264: a company on a near-zero GL is not called immaterial.
 *
 *   node Tools/test-wl-dormant-materiality.js
 *
 * WHY THIS EXISTS. _wlMateriality sets nearZero when the gap is under MAT_OOB_FLOOR (100) OR the GL balance is under
 * DORMANT_GL_FLOOR (1,000). Every reader turned nearZero into "immaterial", so a company with a 500 GL and 50,000 out
 * of balance read "immaterial" on the Walkthrough card, with "No action needed — the amount is negligible", and the
 * AI was told the same twice. ACCT_GROUNDING says a dormant GL is framed by its amount, not called immaterial.
 * nearZero still means "no percentage"; only underFloor means immaterial now, and a dormant GL with a gap at or over
 * the floor (dormantGap) gets one shared wording, _wlDormantGapText.
 *
 * This runs the SHIPPED functions, sliced out of home.html, with config.js run whole (the real _COMPONENTS):
 *   _wlOverview         the Walkthrough card's situation + next step
 *   _wlCauseFacts       the Walkthrough AI's materiality fact
 *   _acctAnalyzeLead    the Accounts tab auto-read's lead
 *   _acctAnalyzeCoFact  the Accounts tab auto-read's company fact for the model
 *
 *   D1-D4  500 GL, 50,000 out: none of the four says "immaterial" or "negligible"; each says near-zero GL and judge by
 *          the amount; the card recommends reviewing the transactions driver, not "No action needed"
 *   D5     the same company in a closed period: the situation, and no recommendation
 *   C1     CONTROL: 500 GL, 60 out (under the floor) still reads immaterial on all four
 *   C2     CONTROL: 1,000,000 GL, 4,000 out reads 0.40%, immaterial, as before
 *
 * MUTATION ARM: dormantGap forced false (the pre-UI-264 behaviour). D1-D5 must go red; C1 and C2 must stay green.
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
const broken = (what) => { console.log('HARNESS BROKEN: ' + what); process.exit(1); };
function extractFn(html, name) {
  const at = html.indexOf('\n  function ' + name + '(');
  if (at < 0) broken('function ' + name + ' not found in home.html');
  return sliceBlock(html, at + 1);
}
function extractLine(html, re, what) { const m = html.match(re); if (!m) broken(what + ' not found in home.html'); return m[0]; }

function load(home) {
  const sb = { console: { warn() {}, log() {}, error() {} },
    document: { addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement: () => ({ style: {}, classList: { add() {} } }) },
    localStorage: { getItem() { return null; } }, navigator: { language: 'en-US' } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CONFIG, sb);
  vm.runInContext([
    'var RRV8 = window.RRV8;',
    extractLine(home, /\n  var _money = function[^\n]*\n/, '_money'),
    extractLine(home, /\n  var MAT_OOB_FLOOR = [^\n]*\n/, 'the materiality floors'),
    extractLine(home, /\n  var _COMPONENTS = [^\n]*\n/, '_COMPONENTS'),
    ...['_ccySym', '_moneyK', '_ccyAmt', '_wlExact', '_wlMateriality', '_wlDormantGapText', '_acctMaterial', '_wlOverview',
        '_wlCauseFacts', '_acctAnalyzeLead', '_acctAnalyzeCoFact'].map((n) => extractFn(home, n)),
  ].join('\n'), sb);
  return sb;
}

const withGap = (glBal, oob) => ({ co: '90002', ccy: 'USD', glBal, oob, invBal: glBal + oob, breaks: 0,
  comp: { 'Carry forward': 0, 'Transactions': oob, 'Manual entries': 0, 'Cardex': 0, 'Unposted GL batches': 0, 'End of Day': 0 } });
const TOP = { LongAccount: '5000.140000', OOB: 0 };

let reds = [];
function check(id, name, ok, detail) {
  if (!ok) reds.push(id);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + id + ' ' + name + (ok ? '' : '\n          got: ' + detail));
}
// Every reader's text for one company, open period.
function texts(sb, c) {
  const ov = sb._wlOverview(c, true);
  return { sit: ov.sit, rec: ov.rec, cause: sb._wlCauseFacts(c, 'grounded'),
    lead: sb._acctAnalyzeLead('90002', c, Object.assign({}, TOP, { OOB: c.oob }), 'account 5000.140000'),
    fact: sb._acctAnalyzeCoFact(c, '90002') };
}

function run(home) {
  reds = [];
  const sb = load(home);
  const big = texts(sb, withGap(500, 50000));
  const judged = (s) => /near-zero GL balance of \$500/.test(s) && /by the amount/.test(s);
  const noImm = (s) => !/immaterial by amount|— immaterial|negligible/.test(s);
  check('D1', 'Walkthrough card: 50,000 on a 500 GL is judged by amount, and the next step is to review the driver',
    judged(big.sit) && noImm(big.sit) && /^Review the transactions driver \(\$50K\), then post a journal entry/.test(big.rec),
    JSON.stringify({ sit: big.sit, rec: big.rec }));
  check('D2', 'Walkthrough AI fact: judged by amount, and tells the model not to call it immaterial',
    judged(big.cause) && noImm(big.cause) && /do NOT call it immaterial/.test(big.cause), big.cause);
  check('D3', 'Accounts auto-read lead: judged by amount, never immaterial', judged(big.lead) && noImm(big.lead), big.lead);
  check('D4', 'Accounts auto-read company fact: no "immaterial by amount", tells the model to judge by amount',
    /\$50,000 on a near-zero GL balance of \$500/.test(big.fact) && /judge it by the amount/.test(big.fact) && !/immaterial by amount/.test(big.fact), big.fact);
  const closed = sb._wlOverview(withGap(500, 50000), false);
  check('D5', 'closed period: the same situation and no recommendation', judged(closed.sit) && closed.rec === '', JSON.stringify(closed));
  const small = texts(sb, withGap(500, 60));
  check('C1', 'CONTROL: 60 out on a 500 GL (under the floor) is still immaterial on all four',
    /— immaterial/.test(small.sit) && /immaterial by amount/.test(small.cause) && /— immaterial/.test(small.lead) && /immaterial by amount/.test(small.fact),
    JSON.stringify(small));
  const normal = texts(sb, withGap(1000000, 4000));
  check('C2', 'CONTROL: 4,000 on a 1,000,000 GL reads 0.40%, immaterial, as before',
    /0\.40% of the \$1\.0M GL balance, immaterial/.test(normal.sit) && /immaterial at 0\.40%/.test(normal.lead) && /= 0\.40% of the/.test(normal.fact),
    JSON.stringify(normal));
  return reds.slice();
}

console.log('UI-264: a company on a near-zero GL is judged by its amount, never called immaterial for it');
const real = run(HOME);
const GAP = 'dormantGap: dormant && !underFloor';
const old = HOME.replace(GAP, 'dormantGap: false');
if (old === HOME) broken('mutation did not apply');
console.log('\nMutation: dormantGap forced false, the pre-UI-264 behaviour (D1-D5 red, C1 and C2 green)');
const m = run(old);
const caught = ['D1', 'D2', 'D3', 'D4', 'D5'].every((id) => m.includes(id)) && !m.includes('C1') && !m.includes('C2');
console.log('  ' + (caught ? 'ok  ' : 'FAIL') + '  mutation caught by ' + JSON.stringify(m));
const pass = real.length === 0 && caught;
console.log('\n' + (pass ? 'PASS' : 'FAIL') + (real.length ? ': real case(s) red ' + real.join(',') : ''));
process.exit(pass ? 0 : 1);
