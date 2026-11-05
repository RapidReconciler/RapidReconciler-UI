/* test-acct-prompt-consistency.js -- behaviour test for UI-260: the accountant AI prompt stops contradicting itself.
 *
 *   node Tools/test-acct-prompt-consistency.js
 *
 * WHY THIS EXISTS. The owner pasted the 25,339-character prompt the Accounting Ask sent on 2026-11-02 (UI-258's
 * passing re-look). It gave the model three pairs of opposite instructions:
 *   - "Round amounts (e.g. "$29K")" and "<rounded amount>", then AI_REGISTER's "Quote the figures given, exactly as
 *     given". The answer happened to quote exactly; another run could round. An accountant posts from these figures.
 *   - "no generic clearing account", then "Balancing Entry ... with a balancing clearing line". Both are true of
 *     different builders (openOffsetEntry / openJeModal); the policy line claimed the first for every entry.
 *   - "$100", "$1,000" and "$50,000" for a GBP company, while the code compares the raw amount in each company's own
 *     currency. _wlAmortFact then labelled the trigger "over $50,000" for every currency.
 * AI_REGISTER also said "the task below" although it is appended LAST on every surface.
 *
 * This runs the SHIPPED askAcct (I/O stubbed, the harness of test-acct-ask-txv.js) with config.js run whole, so the
 * prompt read back is the one the page sends, real ACCT_GROUNDING and AI_REGISTER included. It also runs the
 * SHIPPED _wlAmortFact with the page's own money formatters.
 *
 *   P1  the Accounting Ask asks for exact amounts and nothing in its prompt asks for rounding
 *   P2  every sentence that rules out a clearing account is scoped to the Adjusting Entry, and the Balancing
 *       Entry's clearing line is described as such
 *   P3  no threshold in the policy is stated in dollars; the policy says each company's own currency
 *   P4  the register points at the task ABOVE it (it is always appended last), and lets a task ask for rounding
 *   P5  a GBP company's large carry-forward reads "over £50K"; C5 CONTROL: a USD company reads "over $50K"
 *
 * P6-P7 UI-268: "which account first" has its own short rule; "which accounts are out of balance" keeps a trimmed list.
 *
 * SIX MUTATION CONTROLS, one per fix, each restoring the shipped-before text: each must redden only its own case(s).
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
function extractVarFn(html, name) {
  const m = html.match(new RegExp('\\n  var ' + name + ' = function[^\\n]*\\n'));
  if (!m) throw new Error('var ' + name + ' not found in home.html');
  return m[0];
}
function extractLine(html, re, what) {
  const m = html.match(re);
  if (!m) throw new Error(what + ' not found in home.html');
  return m[0];
}

function loadConfig(config) {
  const w = {};
  vm.runInNewContext(config, { window: w, document: { addEventListener() {}, querySelector() { return null; } },
    console: { warn() {}, log() {}, error() {} }, localStorage: { getItem() { return null; } }, navigator: {} });
  if (!w.RRV8 || !w.RRV8.ACCT_GROUNDING || !w.RRV8.AI_REGISTER) throw new Error('config.js no longer defines ACCT_GROUNDING / AI_REGISTER');
  return w.RRV8;
}

function load(html, config) {
  const st = { prompt: null };
  const RRV8 = loadConfig(config);
  const sb = {
    console: { warn() {}, log() {}, error() {} },
    window: { RRV8 },
    RRV8,
    RRAI: { masks: (t) => t !== 'full' },
    _invRows: [],
    _coNames: null,
    activeDb: () => ({ n: 'RapidReconciler_Demo1' }),
    rrFetch: () => Promise.resolve({ data: [] }),
    _recsummaryLevel: () => 'full',
    $: () => null,
    _briefScope: () => ({ period: '2025-07-31' }),
    // Fictional companies from the 9XXXX reserve: one USD, one GBP, as on Demo1.
    _acctFactLines: () => ['Co 90002 (USD): net out-of-balance -$8,620.11', 'Co 90008 (GBP): net out-of-balance -£26,950.39'],
    _acctAccountFactLines: () => ['Accounts by company for Jul 31, 2025 (the Accounts tab).'],
    _acctNames: null,
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
  vm.createContext(sb);
  const src = [
    extractVarFn(html, '_money'),
    extractLine(html, /\n  var MAT_OOB_FLOOR = [^\n]*\n/, 'the materiality floors'),
    'var _acctTxvCache = null;',
    'var _txAllInflight = {};',
    ...['fmtPeriod', '_ccySym', '_moneyK', '_ccyAmt', '_ccyExact', '_wlMateriality', '_wlAmortFact',
        '_coOf', '_txScope', '_txModuleOf', '_txFetchAll', '_acctTxvRows', '_acctTxvFactLines', '_acctPeriodsOf', '_askTaken', 'askAcct']
      .map((n) => extractFn(html, n)),
  ].join('\n');
  vm.runInContext(src, sb, { filename: 'home.html:acct-prompt' });
  sb._acctData = { companies: [{ co: '90002', ccy: 'USD' }, { co: '90008', ccy: 'GBP' }], viewedPeriod: '2025-07-31', periodScoped: true };
  return { sb, st };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
const settle = () => new Promise((r) => setTimeout(r, 0));
// Sentences of the prompt, so a rule is judged by the sentence that states it rather than the whole 25K blob.
const sentences = (s) => s.split(/(?<=[.;])\s+|\n/).map((x) => x.trim()).filter(Boolean);

async function runCases(html, config) {
  reds = [];
  let env;
  try { env = load(html, config); } catch (e) { check('P0 the page and config load', e.message, 'loaded'); return reds.slice(); }
  const { sb, st } = env;
  sb.askAcct('which account should i work on first');
  await settle(); await settle(); await settle();
  const p = st.prompt || '';
  check('P0 askAcct sent a prompt carrying the real policy and register',
    [p.length > 0, p.includes('ACCOUNTING POLICY'), p.includes('HOW TO WRITE THE ANSWER')], [true, true, true]);

  // P1 -- exact amounts, nothing asking for rounding. The register is cut off first: it names rounding only as the
  // exception a surface may opt into (P4), which this surface must not do.
  const surface = p.slice(0, p.lastIndexOf(sb.RRV8.AI_REGISTER));
  check('P1 the Accounting Ask asks for exact amounts and never for rounding',
    { round: /round amounts|<rounded amount/i.test(surface), exact: /exactly as the facts state it, to the cent/.test(surface) },
    { round: false, exact: true });

  // P2 -- the clearing-account rule is scoped to the Adjusting Entry, and the Balancing Entry's clearing line is named.
  const noClearing = sentences(p).filter((s) => /no generic clearing account/i.test(s));
  check('P2 "no clearing account" is only ever said of the Adjusting Entry; the Balancing Entry\'s clearing line is described',
    { unscoped: noClearing.filter((s) => !/Adjusting Entry/.test(s)), balancing: sentences(p).some((s) => /Balancing Entry/.test(s) && /clearing line/i.test(s)) },
    { unscoped: [], balancing: true });

  // P3 -- thresholds per currency, never in dollars.
  const policy = sb.RRV8.ACCT_GROUNDING;
  check('P3 the policy states no threshold in dollars and names each company\'s own currency',
    // The threshold as stated ("under $100", "OR $50,000"), not an example that pairs $100 with £100.
    { dollars: policy.match(/(under|OR|over)\s+\$(100|1,000|50,000)\b/g) || [], ownCcy: (policy.match(/own currency/g) || []).length >= 2 },
    { dollars: [], ownCcy: true });

  // P4 -- the register sits last, so it must point up, and must let a task ask for rounding.
  const reg = sb.RRV8.AI_REGISTER;
  check('P4 the register is last in the prompt, says "the task above", and lets a task ask for rounding',
    { last: p.trimEnd().endsWith(reg.trimEnd()), below: /task below/.test(reg), roundingAllowed: /unless the task above asks for rounded amounts/.test(reg) },
    { last: true, below: false, roundingAllowed: true });

  // P5 -- the carry-forward amortization fact in the company's own currency. 60,000 on a 1,000,000 GL: 6%, under the
  // 25% arm, so only the absolute arm fires and the label is the threshold, not a percentage.
  const amort = (ccy) => sb._wlAmortFact({ ccy, glBal: 1000000, oob: 5000, comp: { 'Carry forward': 60000 } }) || '';
  check('P5 a GBP carry-forward over the threshold reads "over £50K", with no dollar sign',
    { pounds: amort('GBP').includes('over £50K'), dollar: amort('GBP').includes('$') }, { pounds: true, dollar: false });
  // The control reads the symbol only ("over $50" covers "$50K" and the old "$50,000"), so it proves the
  // instrument sees a currency and stays green under P5's arm, which is a currency defect, not a format one.
  check('C5 CONTROL: a USD carry-forward reads "over $50…"', amort('USD').includes('over $50'), true);

  // P6/P7 -- UI-268: "which account first" and "which accounts are out of balance" are two rules, not one. The
  // owner's look got the whole list, a lead line and an "I'd focus on" line for "which should I work on first".
  const fmt = (p.split('FORMAT — pick by the question:')[1] || '').split('HOW TO WRITE THE ANSWER')[0];
  const rules = fmt.split('\n').filter((l) => l.startsWith('• If it asks'));
  const first = rules.filter((r) => /work FIRST/.test(r));
  const list = rules.filter((r) => /WHICH accounts are out of balance/.test(r));
  check('P6 "which account first" has its own rule: 2-3 sentences, no bullets, no list, and it is not the list rule',
    { n: first.length, short: first.some((r) => /2-3 plain sentences/.test(r) && /NO bullets and NO list/.test(r)),
      merged: rules.some((r) => /work first, or which accounts are out of balance/i.test(r)) },
    { n: 1, short: true, merged: false });
  check('P7 "which accounts are out of balance" keeps a list whose bullets carry only account, amount and materiality',
    { n: list.length, trimmed: list.some((r) => /<its materiality, exactly as its line states it>", and nothing more on that line/.test(r)) },
    { n: 1, trimmed: true });
  return reds.slice();
}

(async () => {
  console.log('Accountant AI prompt: no contradicting instructions (UI-260)');
  await runCases(HOME, CONFIG);
  const shippedFailures = failures;
  let armFailures = 0;
  async function arm(label, want, html, config) {
    if (html === HOME && config === CONFIG) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
    const saved = failures;
    console.log('\nmutation arm: ' + label);
    const got = [...new Set(await runCases(html, config))];
    failures = saved;
    const ok = got.join(',') === want;
    if (!ok) armFailures++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
  }
  if (shippedFailures === 0) {
    await arm('the Accounting Ask asks to round again', 'P1',
      HOME.replace("'Give every amount exactly as the facts state it, to the cent and with its currency symbol; never round it. ",
        "'Round amounts (e.g. \"$29K\"). "), CONFIG);
    await arm('the policy says "no generic clearing account" of every entry again', 'P2', HOME,
      CONFIG.replace(/    '- Two ways to build the correcting entry,[^\n]*\n/,
        "    '- Adjusting entry: one real offset account per inventory account (no generic clearing account); excludes timing; two lines per gap (original account + its offset).',\n"));
    await arm('the policy states the floor in dollars again', 'P3', HOME,
      CONFIG.replace("an out-of-balance under 100 (e.g. $100, £100) is immaterial", 'an out-of-balance under $100 is immaterial'));
    await arm('the register says "the task below" again', 'P4', HOME,
      CONFIG.replace("'- Unless the task above specifies its own layout", "'- Unless the task below specifies its own layout"));
    await arm('the amortization label says "over $50,000" for every currency again', 'P5',
      HOME.replace("('over ' + amt(50000))", "'over $50,000'"), CONFIG);
    // UI-268: the two account rules folded back into the one that answered "which first" with the whole list.
    const a6 = HOME.indexOf("'• If it asks which ACCOUNT to work FIRST"), a7 = HOME.indexOf("The lead line carries NO bullet.\\n' : '')");
    await arm('the two account rules merged back into one', 'P6,P7', (a6 < 0 || a7 < 0) ? HOME : HOME.slice(0, a6)
      + "'• If it asks which ACCOUNT to work first, or which accounts are out of balance, answer from the \"Accounts by company\" facts and NOTHING else: (1) a lead line; (2) ONE line per account worth working, starting with \"• \"; (3) a line starting with \"I\\'d focus on \".\\n' : '')"
      + HOME.slice(a7 + "The lead line carries NO bullet.\\n' : '')".length), CONFIG);
  }
  const total = shippedFailures + armFailures;
  console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
  process.exit(total === 0 ? 0 : 1);
})();
