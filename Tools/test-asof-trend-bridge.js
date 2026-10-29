/* test-asof-trend-bridge.js -- behaviour test for UI-225: the As Of trend AI is told volume vs cost.
 *
 *   node Tools/test-asof-trend-bridge.js
 *
 * WHY THIS EXISTS. "How are we trending?" sent the model one perpetual value per period and nothing
 * else, so on a May 29 -> Jul 3 jump it could only say "confirm it is receipt volume, not a cost
 * change" (owner's screenshot, 2026-10-20). The Agent now splits each change into volume, cost and
 * other (POST /inventory/reconciliation/value-bridge, usp8_inventory_value_bridge). This slices the
 * SHIPPED prompt builder and loader out of inventory-asof.html and runs them.
 *
 *   B1  with the split, the prompt carries each period's change = volume + cost (+ other when it is
 *       material), the items behind each, and the instruction to name the driver
 *   B2  without the split, the prompt says so and tells the model not to guess
 *   B3  the loader posts the page's company to the value-bridge route and returns its periods; a
 *       failed call returns [] (so B2 applies) instead of throwing the trend read away
 *   B4  config.js routes the area to the Services agent, beside the history endpoint it explains
 *
 * TWO MUTATION CONTROLS: the builder ignoring the split (must redden B1 only), and the route
 * missing from config.js (must redden B4 only).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'RRV8/inventory-asof.html'), 'utf8').replace(/\r\n/g, '\n');
const CONFIG = fs.readFileSync(path.join(ROOT, 'RRV8/config.js'), 'utf8');

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
function extractFn(html, name, prefix) {
  const at = html.indexOf('\n  ' + (prefix || 'function ') + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in inventory-asof.html');
  return sliceBlock(html, at + 1);
}

const HIST = [
  { period: '2025-05-29', value: 16184482.64 },
  { period: '2025-07-03', value: 16911096.43 },
  { period: '2025-08-28', value: 17000000.00 },
];
const BRIDGE = [
  { period: '2025-07-03', priorPeriod: '2025-05-29', change: 726613.79, volume: 986291.32, cost: -259677.54, other: 0.01,
    topVolume: [{ itemNumber: 'ITEM-A', branch: 'B100', amount: 374540.49 }, { itemNumber: 'ITEM-C', branch: 'B200', amount: -80347.19 }],
    topCost: [{ itemNumber: 'ITEM-A', branch: 'B100', amount: -288000 }] },
  { period: '2025-08-28', priorPeriod: '2025-07-03', change: 88903.57, volume: 73400.86, cost: 19552.71, other: -4050,
    topVolume: [], topCost: [] },
];

function load(page) {
  const calls = [];
  const sb = {
    console: { warn() {}, log() {} },
    window: {},
    _curCtx: { code: 'USD' },
    _sym: () => '$',
    asofScopeText: () => 'Co 90002',
    asofEffTier: () => 'full',
    _ensureSolo: () => '90002',
    rrFetch: (area, opts) => { calls.push({ area, body: opts && opts.body }); return sb._next(); },
    _next: () => Promise.resolve({ companyNumber: '90002', periods: BRIDGE }),
  };
  vm.createContext(sb);
  const src = ['formatPeriod', 'curMoney', 'asofTrendPrompt'].map((n) => extractFn(page, n)).join('\n')
    + '\n' + extractFn(page, 'loadAsOfValueBridge', 'async function ');
  vm.runInContext(src, sb, { filename: 'inventory-asof.html:trend' });
  return { sb, calls };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

async function runCases(page, config) {
  reds = [];
  const { sb, calls } = load(page);

  const withSplit = sb.asofTrendPrompt(HIST, BRIDGE);
  check('B1 each change is given as volume + cost',
    withSplit.includes('Jul 3, 2025: change $726,613.79 = volume $986,291.32 + cost ($259,677.54)'), true);
  check('B1 the items behind volume and cost are named',
    withSplit.includes('volume led by ITEM-A at branch B100 $374,540.49, ITEM-C at branch B200 ($80,347.19)')
      && withSplit.includes('cost led by ITEM-A at branch B100 ($288,000.00)'), true);
  check('B1 a material other is shown, a rounding one is not',
    [withSplit.includes('+ other ($4,050.00)'), withSplit.includes('+ other $0.01')], [true, false]);
  check('B1 the model is told to name the driver', withSplit.includes('say whether volume or cost drove it'), true);

  const without = sb.asofTrendPrompt(HIST, []);
  check('B2 without the split the prompt says so and forbids guessing',
    [without.includes('split of each change is not available'), without.includes('do not guess'), without.includes('led by')],
    [true, true, false]);
  check('B2 the value series is still there', without.includes('May 29, 2025 $16,184,482.64'), true);

  const got = await sb.loadAsOfValueBridge();
  check('B3 the loader posts the page company to the value-bridge route',
    calls.map((c) => [c.area, c.body && c.body.companyNumber, c.body && c.body.topItems]),
    [['inventory/reconciliation/value-bridge', '90002', 2]]);
  check('B3 ...and returns its periods', got.length, 2);
  sb._next = () => Promise.reject(new Error('404'));
  check('B3 a failed call returns [] instead of throwing', JSON.stringify(await sb.loadAsOfValueBridge()), '[]');

  const w = {};
  vm.runInNewContext(config, { window: w, document: { addEventListener() {}, querySelector() { return null; } },
    console: { warn() {}, log() {} }, localStorage: { getItem() { return null; } }, navigator: {} });
  const areas = w.RR_TEST_AGENT_AREAS || [];
  check('B4 config.js routes the area to the Services agent with the history endpoint',
    [areas.includes('inventory/reconciliation/history'), areas.includes('inventory/reconciliation/value-bridge')], [true, true]);
  return reds.slice();
}

(async () => {
  console.log('As Of trend AI: volume vs cost (UI-225)');
  await runCases(PAGE, CONFIG);
  const shippedFailures = failures;

  let armFailures = 0;
  async function arm(label, want, page, config) {
    if (page === PAGE && config === CONFIG) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
    const saved = failures;
    console.log('\nmutation arm: ' + label);
    const got = [...new Set(await runCases(page, config))];
    failures = saved;
    const ok = got.join(',') === want;
    if (!ok) armFailures++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
  }
  if (shippedFailures === 0) {
    await arm('the prompt builder ignores the split', 'B1',
      PAGE.replace('const lines = (bridge || []).filter(', 'const lines = [].filter('), CONFIG);
    await arm('the route is missing from config.js', 'B4',
      PAGE, CONFIG.replace("  'inventory/reconciliation/value-bridge',", ''));
  }
  const total = shippedFailures + armFailures;
  console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
  process.exit(total === 0 ? 0 : 1);
})();
