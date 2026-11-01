/* test-asof-typed-trend.js -- behaviour test for UI-249: a TYPED trend question on As Of gets the period history.
 *
 *   node Tools/test-asof-typed-trend.js
 *
 * WHY THIS EXISTS. In UI-225's live look (2026-10-30) the owner typed "How are we trending?" into the As Of ask
 * box. The chip with the same words loads the period series and the volume/cost split; the typed box sent only the
 * loaded grid's aggregates, so the model answered "there is no prior period here to trend against" on a page with
 * 9 periods of history. Same words, two answers, depending on whether they were clicked or typed.
 *
 * This slices the SHIPPED asofAsk() and everything it calls out of inventory-asof.html and runs it, with the
 * agent routes stubbed. The assertions read the prompt that reaches POST api/v1/ai/explain, which is what the
 * model sees.
 *
 *   T1  a typed "How are we trending?" sends the period series and the volume/cost split
 *   T2  ...and still sends the question and the grid's own facts
 *   T3  the chip asked afterwards reuses that load (history and split fetched once, not per question)
 *   T4  typed and clicked, the model is given the same history block, word for word
 *   T5  when the history fails to load, the typed prompt says it is unavailable (never reads as one period)
 *   T6  ...and the next question tries the load again instead of answering from a remembered failure
 *   T7  switching company loads that company's history rather than reusing the last one
 *
 * FIVE MUTATION CONTROLS, one per mechanism: the typed prompt without the history (T1,T4,T5), the typed box back
 * on its old path (T1,T4,T6,T7: it loads nothing at all), no cache (T3), a cached failure (T6), and a cache key that ignores the company (T7).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'RRV8/inventory-asof.html'), 'utf8').replace(/\r\n/g, '\n');

// Brace-matched, comment- and string-aware (same slicer as test-asof-trend-bridge.js).
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
function extractFn(html, name, prefix) {
  const at = html.indexOf('\n  ' + (prefix || 'function ') + name + '(');
  if (at < 0) { console.log('HARNESS BROKEN: ' + name + '() not found in inventory-asof.html'); process.exit(1); }
  return sliceBlock(html, at + 1);
}
// The page-level cache the loader keeps, declared as the page declares it.
function cacheDecl(html) {
  const m = html.match(/\n  let _asofTrendData = null;[^\n]*/);
  if (!m) { console.log('HARNESS BROKEN: the _asofTrendData declaration is not in the page'); process.exit(1); }
  return m[0];
}

const POINTS = [
  { period: '2025-05-29', perpetualBalance: 16184482.64 },
  { period: '2025-07-03', perpetualBalance: 16911096.43 },
  { period: '2025-08-28', perpetualBalance: 17000000.00 },
];
const BRIDGE = [
  { period: '2025-07-03', change: 726613.79, volume: 986291.32, cost: -259677.54, other: 0,
    topVolume: [{ itemNumber: 'ITEM-A', branch: 'B100', amount: 374540.49 }], topCost: [] },
];

function load(page) {
  const st = { calls: { history: 0, bridge: 0 }, prompts: [], answers: [], company: '90002', historyFails: false };
  const sb = {
    console: { warn() {}, log() {} },
    window: { RRV8: {} },
    RRV8: {},
    // config.js's RRAI.masks rule (UI-254); test-ai-scrubbed-masking.js runs the real one.
    RRAI: { masks: (t) => t !== 'full' },
    _data: { _meta: { period: '2025-08-28' } },
    _curCtx: { code: 'USD' },
    _sym: () => '$',
    asofScopeText: () => 'Co ' + st.company,
    asofFacts: () => 'GRID-FACTS: total on-hand value $17,000,000.00',
    asofEffTier: () => 'full',
    asofAnswer: (txt, loading) => { if (!loading) st.answers.push(txt); },
    _ensureSolo: () => st.company,
    reconciliationFilterFromSession: () => ({ companies: [st.company] }),
    rrFetch: (area, opts) => {
      if (area === 'inventory/reconciliation/history') {
        st.calls.history++;
        return st.historyFails ? Promise.reject(new Error('503')) : Promise.resolve({ points: POINTS });
      }
      if (area === 'inventory/reconciliation/value-bridge') { st.calls.bridge++; return Promise.resolve({ periods: BRIDGE }); }
      if (area.indexOf('api/v1/ai/explain') === 0) { st.prompts.push(opts.body.prompt); return Promise.resolve({ text: 'answer' }); }
      return Promise.reject(new Error('unexpected route ' + area));
    },
  };
  vm.createContext(sb);
  const src = 'let _asofAiBusy = false;\nlet _asofLastAsk = null;' + cacheDecl(page) + '\n'
    + ['formatPeriod', 'curMoney', 'asofScrub', 'asofMasker', 'asofHistoryBlock', 'asofTrendPrompt', 'asofFreeTextPrompt', 'asofTrendData',
       'asofAiExplain', 'asofAsk'].map((n) => extractFn(page, n)).join('\n')
    + '\n' + extractFn(page, 'loadAsOfPeriodHistory', 'async function ')
    + '\n' + extractFn(page, 'loadAsOfValueBridge', 'async function ');
  vm.runInContext(src, sb, { filename: 'inventory-asof.html:ask' });
  // asofAsk returns nothing; wait for its chain (and the busy flag) to settle.
  const ask = async (kind, text) => { sb.asofAsk(kind, text); await new Promise((r) => setTimeout(r, 30)); };
  return { st, ask };
}
const blockOf = (p) => {
  const a = p.indexOf('Perpetual on-hand balance by period');
  const b = p.indexOf('say whether volume or cost drove it');
  return a < 0 || b < 0 ? null : p.slice(a, b);
};

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

async function runCases(page) {
  reds = [];
  {
    const { st, ask } = load(page);
    await ask(null, 'How are we trending?');
    const typed = st.prompts[0] || '';
    check('T1 the typed question carries the series and the split',
      [typed.includes('Perpetual on-hand balance by period (oldest first): May 29, 2025 $16,184,482.64'),
       typed.includes('Jul 3, 2025: change $726,613.79 = volume $986,291.32 + cost ($259,677.54)')], [true, true]);
    check('T2 ...and still the question and the grid facts',
      [typed.includes('"How are we trending?"'), typed.includes('GRID-FACTS')], [true, true]);
    await ask('trend', null);
    const chip = st.prompts[1] || '';
    check('T3 the chip reuses the load: history and split fetched once', st.calls, { history: 1, bridge: 1 });
    check('T4 typed and clicked get the same history block', blockOf(typed) !== null && blockOf(typed) === blockOf(chip), true);
  }
  {
    const { st, ask } = load(page);
    st.historyFails = true;
    await ask(null, 'How are we trending?');
    const p = st.prompts[0] || '';
    check('T5 a failed history load is said, not read as one period',
      [p.includes('history could not be loaded'), p.includes('Do not conclude that there is only one period'),
       p.includes('Perpetual on-hand balance by period')], [true, true, false]);
    st.historyFails = false;
    await ask(null, 'How are we trending?');
    check('T6 the next question tries the load again', st.calls.history, 2);
  }
  {
    const { st, ask } = load(page);
    await ask(null, 'How are we trending?');
    st.company = '90003';
    await ask(null, 'How are we trending?');
    check('T7 another company loads its own history', st.calls, { history: 2, bridge: 2 });
  }
  return [...new Set(reds)];
}

(async () => {
  console.log('As Of typed trend question (UI-249)');
  await runCases(PAGE);
  const shippedFailures = failures;

  let armFailures = 0;
  async function arm(label, want, page) {
    if (page === PAGE) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
    const saved = failures;
    console.log('\nmutation arm: ' + label);
    const got = await runCases(page);
    failures = saved;
    const ok = got.join(',') === want;
    if (!ok) armFailures++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
  }
  if (shippedFailures === 0) {
    await arm('the typed prompt leaves the history out', 'T1,T4,T5',
      PAGE.replace("      + history\n", ''));
    await arm('the typed box back on its old path (no history load)', 'T1,T4,T6,T7',
      // VLC-234: the call now names its feature (Ask a question).
      PAGE.replace("run = asofTrendData().then(({ hist, bridge }) => asofAiExplain(asofFreeTextPrompt(freeText, hist, bridge), 'ask'));",
                   "run = asofAiExplain(asofFreeTextPrompt(freeText, [], []), 'ask');"));
    await arm('no cache: every question loads again', 'T3',
      PAGE.replace('    if (_asofTrendData && _asofTrendData.key === key) return _asofTrendData.promise;\n', ''));
    await arm('a failed load is cached', 'T6',
      PAGE.replace('if ((!hist.length || !bridge.length) && _asofTrendData && _asofTrendData.promise === promise) _asofTrendData = null;', ''));
    await arm('the cache key ignores the company', 'T7',
      PAGE.replace("try { key = String(_ensureSolo() || '') + '|' + JSON.stringify(reconciliationFilterFromSession()); } catch (_) {}", ''));
  }
  const total = shippedFailures + armFailures;
  console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
  process.exit(total === 0 ? 0 : 1);
})();
