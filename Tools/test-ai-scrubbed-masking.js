#!/usr/bin/env node
/**
 * VLC-188 (owner ruling 2026-10-31: "Mask it and merge"). On Enhanced (`scrubbed`), every company, account,
 * branch, business unit and item must reach the AI as a generic label, never its real number
 * (RRV8.dataAccessLine's Scrubbed line, and the capability guide: "At the lower levels, company identities stay
 * masked"). Home and cardex masked before the call; As Of and the account roll-forward only TOLD the model to,
 * and sent the real values. The Transactions narration, which the row was filed against, only runs at Full
 * (`wantAi = _txAiTier() === 'full'`), so it never needed masking.
 *
 * Runs the pages' REAL prompt builders in a VM with only the network stubbed, and reads the text that would be
 * POSTed to api/v1/ai/explain.
 *
 *   A1  As Of grid facts on Enhanced: no company, branch or business-unit number; generic labels; amounts kept
 *   A2  As Of trend block on Enhanced: no item or branch; "Item 1"; amount kept
 *   A3  As Of typed question, the whole prompt sent, on Enhanced: no identifier anywhere
 *   R1  Roll-forward brief on Enhanced: no company or account number; "Entity A", "Account 1"
 *   C1  CONTROL, Full: every identifier above IS in the prompt, so the harness can see them
 *
 * MUTATION CONTROLS: the cases are re-run on copies of the pages with masking switched off (As Of's asofScrub
 * returns false; the roll-forward's `scrub` is false). Every Enhanced case must go red on them, or the test
 * could not have caught the defect it guards.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ASOF = fs.readFileSync(path.join(ROOT, 'RRV8/inventory-asof.html'), 'utf8').replace(/\r\n/g, '\n');
const RF = fs.readFileSync(path.join(ROOT, 'RRV8/inventory-account-rollforward.html'), 'utf8').replace(/\r\n/g, '\n');

// Brace-matched, comment- and string-aware (same slicer as test-asof-typed-trend.js).
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
function extractFn(html, name, file, prefix) {
  const at = html.indexOf('\n  ' + (prefix || 'function ') + name + '(');
  if (at < 0) { console.log('HARNESS BROKEN: ' + name + '() not found in ' + file); process.exit(1); }
  return sliceBlock(html, at + 1);
}
function extractLine(html, re, what) {
  const m = html.match(re);
  if (!m) { console.log('HARNESS BROKEN: ' + what + ' not found'); process.exit(1); }
  return m[0];
}

// Fictional reserve values (CLAUDE.md): company 9XXXX, business unit 9......
const CO = '90002', BU = '9123456', BRANCH = 'B100', ITEM = 'ITEM-A', ACCT = '9123456.141818', GL = 'IN30';
const IDS = [CO, BU, BRANCH, ITEM];

function loadAsof(page, tier) {
  const st = { prompts: [] };
  const sb = {
    console: { warn() {}, log() {} },
    window: { RRV8: { readSessionScope: () => ({ activeCompanies: [CO] }) } },
    RRV8: {},
    _data: { _meta: { period: '2025-08-28' } },
    _curCtx: { code: 'USD' },
    _sym: () => '$',
    _viewRows: [
      { Amount: 1500000, Branch: BRANCH, GLClass: GL, LongAccount: BU + '.141818' },
      { Amount: 250000, Branch: 'B200', GLClass: GL, LongAccount: '9123457.141818' },
    ],
    asofEffTier: () => tier,
    asofAnswer: () => {},
    _ensureSolo: () => CO,
    reconciliationFilterFromSession: () => ({ companies: [CO] }),
    rrFetch: (area, opts) => {
      if (area === 'inventory/reconciliation/history') {
        return Promise.resolve({ points: [{ period: '2025-07-03', perpetualBalance: 16911096.43 },
                                          { period: '2025-08-28', perpetualBalance: 17000000.00 }] });
      }
      if (area === 'inventory/reconciliation/value-bridge') {
        return Promise.resolve({ periods: [{ period: '2025-08-28', change: 88903.57, volume: 120000, cost: -31096.43,
          other: 0, topVolume: [{ itemNumber: ITEM, branch: BRANCH, amount: 374540.49 }], topCost: [] }] });
      }
      if (area.indexOf('api/v1/ai/explain') === 0) { st.prompts.push(opts.body.prompt); return Promise.resolve({ text: 'ok' }); }
      return Promise.reject(new Error('unexpected route ' + area));
    },
  };
  vm.createContext(sb);
  const F = (n, p) => extractFn(page, n, 'inventory-asof.html', p);
  const src = 'let _asofAiBusy = false;\nlet _asofLastAsk = null;\n'
    + extractLine(page, /\n  let _asofTrendData = null;[^\n]*/, '_asofTrendData declaration') + '\n'
    + extractLine(page, /\n  const _fmtAgg = [^\n]*/, '_fmtAgg') + '\n'
    + ['formatPeriod', 'curMoney', 'asofScrub', 'asofMasker', 'asofScopeText', 'asofAggregates', 'asofFacts',
       'asofHistoryBlock', 'asofTrendPrompt', 'asofFreeTextPrompt', 'asofTrendData', 'asofAiExplain', 'asofAsk']
      .map((n) => F(n)).join('\n')
    + '\n' + F('loadAsOfPeriodHistory', 'async function ')
    + '\n' + F('loadAsOfValueBridge', 'async function ');
  vm.runInContext(src, sb, { filename: 'inventory-asof.html:ai' });
  const ask = async (text) => { sb.asofAsk(null, text); await new Promise((r) => setTimeout(r, 30)); };
  return { sb, st, ask };
}

function loadRf(page, tier) {
  const sb = {
    window: { RRV8: { dataAccessLine: () => '' } },
    RRV8: {},
    state: { company: CO },
    effTier: () => tier,
  };
  vm.createContext(sb);
  vm.runInContext(extractFn(page, 'briefPrompt', 'inventory-account-rollforward.html'), sb,
    { filename: 'inventory-account-rollforward.html:brief' });
  const sum = {
    gl: { rows: 3, accts: [{ acct: ACCT }, { acct: '9123457.141818' }] },
    varc: { rows: 2, accts: [{ acct: ACCT }] },
    unk: { rows: 0, accts: [] },
  };
  return sb.briefPrompt(sum);
}

let failures = 0, reds = [];
function check(id, name, ok, detail) {
  if (!ok) { failures++; reds.push(id); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + id + ' ' + name + (ok ? '' : '   ' + (detail || '')));
}
const leaks = (text, ids) => ids.filter((x) => text.indexOf(x) >= 0);

async function runCases(asof, rf) {
  reds = [];
  {
    const { sb } = loadAsof(asof, 'scrubbed');
    const facts = sb.asofFacts();
    check('A1', 'As Of grid facts on Enhanced carry no company, branch or business-unit number',
      leaks(facts, [CO, BU, BRANCH, 'B200', '9123457']).length === 0 && /Entity A/.test(facts)
        && /Branch 1/.test(facts) && /Business unit 1/.test(facts) && facts.indexOf('$1,500,000.00') >= 0 && facts.indexOf(GL) >= 0,
      JSON.stringify(facts));
    const block = sb.asofHistoryBlock([{ period: '2025-08-28', value: 17000000 }],
      [{ period: '2025-08-28', change: 1, volume: 1, cost: 0, other: 0,
         topVolume: [{ itemNumber: ITEM, branch: BRANCH, amount: 374540.49 }], topCost: [] }]);
    check('A2', 'As Of trend block on Enhanced names "Item 1", no item or branch, amount kept',
      leaks(block, [ITEM, BRANCH]).length === 0 && /Item 1 \$374,540\.49/.test(block), JSON.stringify(block));
  }
  {
    const { st, ask } = loadAsof(asof, 'scrubbed');
    await ask('How are we trending?');
    const p = st.prompts[0] || '';
    check('A3', 'the whole typed As Of prompt sent on Enhanced holds no identifier',
      p.length > 0 && leaks(p, IDS).length === 0, 'leaked ' + JSON.stringify(leaks(p, IDS)) + ' (prompt ' + p.length + ' chars)');
  }
  {
    const brief = loadRf(rf, 'scrubbed');
    check('R1', 'the roll-forward brief on Enhanced names "Entity A" and "Account 1", no company or account number',
      leaks(brief, [CO, ACCT, '9123457']).length === 0 && /Entity A/.test(brief) && /Account 1, Account 2/.test(brief),
      JSON.stringify(brief.slice(0, 300)));
  }
  {
    const { st, ask } = loadAsof(asof, 'full');
    await ask('How are we trending?');
    const p = st.prompts[0] || '';
    const brief = loadRf(rf, 'full');
    check('C1', 'CONTROL, Full: the identifiers ARE in both prompts, so the harness can see them',
      leaks(p, IDS).length === IDS.length && leaks(brief, [CO, ACCT]).length === 2,
      'asof has ' + JSON.stringify(leaks(p, IDS)) + ', brief has ' + JSON.stringify(leaks(brief, [CO, ACCT])));
  }
  return reds.slice();
}

(async () => {
  console.log('VLC-188: Enhanced masks identifiers before the AI call');
  const real = await runCases(ASOF, RF);
  const realFailures = failures;

  console.log('\nMutation: masking switched off on both pages (every Enhanced case must go red)');
  const asofOff = ASOF.replace("function asofScrub() { return asofEffTier() === 'scrubbed'; }",
                               'function asofScrub() { return false; }');
  const rfOff = RF.replace("var scrub=effTier()==='scrubbed';", 'var scrub=false;');
  if (asofOff === ASOF || rfOff === RF) { console.log('HARNESS BROKEN: mutation did not apply'); process.exit(1); }
  failures = 0;
  const mutated = await runCases(asofOff, rfOff);
  const want = ['A1', 'A2', 'A3', 'R1'];
  const caught = want.every((id) => mutated.indexOf(id) >= 0) && mutated.indexOf('C1') < 0;
  console.log('  ' + (caught ? 'ok  ' : 'FAIL') + '  mutation caught by ' + JSON.stringify(mutated) + ' (want ' + JSON.stringify(want) + ', control C1 still green)');

  const total = realFailures + (caught ? 0 : 1);
  console.log('\n' + (total === 0 ? 'PASS' : 'FAIL') + ': ' + (real.length ? real.length + ' real case(s) red: ' + real.join(',') : 'all real cases green')
    + (caught ? ', mutation caught' : ', mutation NOT caught'));
  process.exit(total === 0 ? 0 : 1);
})();
