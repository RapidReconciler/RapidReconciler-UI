/* test-transit-ai.js -- In Transit's AI assistants (UI-240 slice 3).
 *
 *   node Tools/test-transit-ai.js
 *
 * Owner 2026-11-05: "add AI assistants like inventory has for both analyst and accountant". RRV8/transit.html now
 * carries Home's assistant card (RR Accounting / Analyst Assistant, ask box, answer band) and the analyst day brief.
 *
 * WHAT IT PINS, each against the SHIPPING source (sliced from transit.html, ai-docs.js, ai-gate.js, config.js):
 *   R  api/v1/ai/* goes to VALC (RR_VALC_PREFIXES, as on Home); /in-transit/* still goes to the data services.
 *   A  the accountant's facts: figures to the cent; Full names the company and accounts; Enhanced masks every
 *      identity; Basic keeps to the on-screen figures (no history, no account list); unposted only when non-zero.
 *   N  the analyst's counts and facts: the three quick filters and activity on excluded orders counted from the
 *      rows; only "finding" reports count as findings; a source that failed says so; masking as for A.
 *   B  the day brief's chips and lead come from those same counts (no AI), so the chips and the facts the AI
 *      reads cannot disagree.
 *   P  the prompt carries In Transit's own grounding and never Inventory's (ANALYST_GROUNDING tells the model
 *      in-transit is a separate surface), the level's data-access line, and In Transit's doc links only.
 *   D  ai-docs.js: Home's catalog is unchanged by the In Transit guides; In Transit's lists only its own.
 *   C  the card's Off wording comes from the shared gate's three Off facts (plan, administrator, this browser).
 * Every group has mutation arms that must turn it red.
 *
 * BLIND SPOTS, named: no model call (what the model writes is not tested), no layout. The page is exercised in
 * headless Chrome with a stubbed VALC for the rendering half.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R8 = path.join(__dirname, '..', 'RRV8');
// LF, whatever the checkout: three arms below span lines, and on a core.autocrlf=true clone they reported "the text
// it mutates is gone" (measured 2026-11-05 on _wt/dac-94-ui; CI's LF checkout hid it).
const PAGE = fs.readFileSync(path.join(R8, 'transit.html'), 'utf8').replace(/\r\n/g, '\n');
const DOCS = fs.readFileSync(path.join(R8, 'ai-docs.js'), 'utf8');
const GATE_FILE = path.join(R8, 'ai-gate.js');
const GATE = fs.existsSync(GATE_FILE) ? fs.readFileSync(GATE_FILE, 'utf8') : null;
const CONFIG = fs.readFileSync(path.join(R8, 'config.js'), 'utf8');

let failures = 0;
function check(name, got, want, log) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (log !== false) console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)));
    return ok;
}

/* ---- slicing (the brace matcher test-transit-page.js uses; regex literals are kept out of what it slices) ---- */
function matchClose(src, openIdx) {
    const open = src[openIdx], close = open === '{' ? '}' : open === '[' ? ']' : ')';
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
        if (c === '"' || c === "'" || c === '`') { for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
        if (c === open) depth++; else if (c === close && --depth === 0) return i;
    }
    throw new Error('unbalanced ' + open + ' at ' + openIdx);
}
function sliceFn(src, name) {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found');
    return src.slice(at, matchClose(src, src.indexOf('{', at)) + 1);
}
function sliceAssign(src, lead, opener) {
    const at = src.indexOf(lead); if (at < 0) throw new Error(lead + ' not found');
    return src.slice(at, matchClose(src, src.indexOf(opener, at)) + 1) + ';';
}
function sliceLine(src, lead) {
    const at = src.indexOf(lead); if (at < 0) throw new Error(lead + ' not found');
    return src.slice(at, src.indexOf('\n', at));
}

/* ---- the sandbox: the page's helpers and AI code, shared files evaluated whole ---- */
function build(page, docs, gate, config) {
    const els = {};
    const el = (id) => els[id] || (els[id] = { id, hidden: false, textContent: '', innerHTML: '', placeholder: '', disabled: false, attrs: {},
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; } });
    const store = {}, sess = {};
    const sb = { console, Intl, Math, JSON, Number, String, Array, Object, Promise, isFinite, URLSearchParams,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        sessionStorage: { getItem: (k) => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: (k) => { delete sess[k]; } },
        document: { getElementById: el, addEventListener() {}, readyState: 'complete' }, location: { search: '', protocol: 'http:', host: 'x' } };
    sb.window = sb; sb.globalThis = sb; sb.addEventListener = () => {}; sb.dispatchEvent = () => {};
    sb.fetchLog = [];
    sb.fetch = (url, o) => { sb.fetchLog.push({ url, method: (o && o.method) || 'GET' }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); };
    vm.createContext(sb);
    // config.js whole: RR_VALC_PREFIXES, RRAI, RRV8.dataAccessLine, AI_REGISTER, the grounding catalogs.
    vm.runInContext(config, sb, { filename: 'config.js' });
    vm.runInContext(docs, sb, { filename: 'ai-docs.js' });
    if (gate) vm.runInContext(gate, sb, { filename: 'ai-gate.js' });
    sb.RRDB.valcBase = () => 'https://valc.example.invalid';
    sb.RRDB.agentBase = () => 'https://agent.example.invalid';
    sb.RRDB.active = () => sb.db || {};
    const code = [
        'function $(id) { return document.getElementById(id); }',
        'function esc(s) { return String(s == null ? "" : s); }',   // stand-in: its regex literal defeats the matcher; not under test
        sliceFn(page, 'trim'), sliceFn(page, 'num'), sliceFn(page, 'isoDay'), sliceLine(page, 'var MON = '),
        sliceFn(page, 'fmtDate'), sliceLine(page, 'var _symCache = '), sliceFn(page, 'sym'), sliceFn(page, 'curMoney'), sliceFn(page, 'isNo'),
        sliceFn(page, 'activeDb'), sliceFn(page, 'perms'), sliceFn(page, 'canAnalyst'), sliceFn(page, 'canAccountant'), sliceFn(page, 'dbName'),
        sliceFn(page, 'prodHeaders'),
        sliceAssign(page, 'var _testAgentAreas = ', '('), sliceAssign(page, 'var _testAgentPrefixes = ', '['), sliceFn(page, '_routesToTestAgent'),
        sliceAssign(page, 'var _valcPrefixes = ', '['), sliceFn(page, '_routesToValc'), sliceFn(page, 'rrFetch'),
        sliceAssign(page, 'var QUICK = ', '{'),
        sliceLine(page, 'var AUTO_NOTE = '), sliceFn(page, 'isAutoExcl'),   // DAC-94: the counts split excluded lines out
        sliceLine(page, 'var GATE_MISSING = '), sliceAssign(page, 'var ROLE_ASST = ', '{'), sliceAssign(page, 'var NUMWORD = ', '['),
        sliceFn(page, 'aiLevel'),
        sliceFn(page, '_aiDocCatalogPrompt'), sliceLine(page, 'var AI_EPS = '), sliceFn(page, 'sumOf'), sliceFn(page, 'itCoLabel'),
        sliceFn(page, 'itAcctFacts'), sliceFn(page, 'itAnalystCounts'), sliceFn(page, 'itAnalystFacts'), sliceFn(page, 'itBriefChips'), sliceFn(page, 'itBriefLead'),
        sliceFn(page, 'itPrompt'),
        'var S = { tab: "health" }; var _asking = false;',
        'var _gate = (window.RRV8 && RRV8.aiGate) ? RRV8.aiGate({ fetch: rrFetch, activeDb: activeDb }) : null;',
        'function entitledViews() { var o = []; if (canAnalyst()) o.push("analyst"); if (canAccountant()) o.push("accountant"); return o; }',
        'function viewRole() { return window.__role || "accountant"; }',
        sliceFn(page, 'setAsstTier'),
        // itSources with its four reads stubbed: the rows carry a currency, the page has not learned one yet.
        'S.company = "90002"; S.period = "2025-06-30"; S.currency = {}; S.history = { "90002": [] }; function curOf(co) { return S.currency[co] || ""; }',
        'function soft(p) { return p.then(null, function () { return null; }); }',
        'function itPeriodRows() { return Promise.resolve([{ CompanyNumber: "90002", Currency: "GBP ", OOB: 10 }]); }',
        'function itReportCounts() { return Promise.resolve([]); } function itTxvData() { return Promise.resolve({ data: [], aggregates: {} }); } function itOrdersData() { return Promise.resolve([]); }',
        sliceFn(page, 'itSources'),
        'this.api = { rrFetch, itAcctFacts, itAnalystCounts, itAnalystFacts, itBriefChips, itBriefLead, itPrompt, setAsstTier, _routesToValc, itSources, S: S };'
    ].join('\n');
    vm.runInContext(code, sb, { filename: 'transit.html:ai' });
    sb.el = el; sb.store = store;
    return sb;
}

/* ---- fictional fixtures (9XXXX companies, generic accounts) ---- */
const HIST = ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-31', '2025-06-30', '2025-07-31'].map((p, i) =>
    ({ period: p + 'T00:00:00', outOfBalance: [0, 120.5, 0, 0, 340.25, 1480.22, 0][i], glRollBreaks: i === 5 ? 1 : 0, varianceRollBreaks: 0 }));
const ROWS = [
    { CompanyNumber: '90001', LongAccount: '9000.149090', OOB: 1480.22, EndGL: 62400, TransitAmount: 60919.78, BegVar: 340.25, EndofDay: -88.2, Exclusions: 310, Variance: 741.77, JEs: 0, UnpostBatch: 0, GLOK: 'No', VarOK: 'Yes' },
    { CompanyNumber: '90001', LongAccount: '9000.149091', OOB: 0, EndGL: 1200, TransitAmount: 1200, BegVar: 0, EndofDay: 0, Exclusions: 0, Variance: 0, JEs: 0, UnpostBatch: 125, GLOK: 'Yes', VarOK: 'Yes' }
];
const SRC_A = { company: '90001', currency: 'USD', period: '2025-06-30', rows: ROWS, history: HIST };
const ORDERS = [
    { OrderType: 'ST', OrderNumber: '4403', ItemNumber: 'VALVE-7A', ShipQty: 0, RecQty: 4, TranQty: -4, TranAmt: -164, RecSts: '400', Excluded: false },
    { OrderType: 'ST', OrderNumber: '4402', ItemNumber: 'HOSE-55', ShipQty: 10, RecQty: 6, TranQty: 4, TranAmt: 880, RecSts: '999', Excluded: false },
    { OrderType: 'ST', OrderNumber: '4405', ItemNumber: 'PANEL-9', ShipQty: 8, RecQty: 8, TranQty: 0, TranAmt: 3.25, RecSts: '999', Excluded: false },
    { OrderType: 'ST', OrderNumber: '4406', ItemNumber: 'FILTER-12', ShipQty: 16, RecQty: 0, TranQty: 16, TranAmt: 1040, RecSts: '400', Excluded: true, ExclVarAmt: 12.5, ExclVarQty: 0 },
    { OrderType: 'ST', OrderNumber: '4400', ItemNumber: 'WIDGET-100', ShipQty: 10, RecQty: 2, TranQty: 8, TranAmt: 800, RecSts: '400', Excluded: false }
];
const TXV = { aggregates: { Variance: 1247.32 }, data: [
    { OT: 'ST', OrderNumber: '4400', DT: 'IT', DocNumber: '77100', TransitAmount: 500, LedgerAmount: 292.11, Variance: 207.89, Worked: true },
    { OT: 'ST', OrderNumber: '4401', DT: 'OV', DocNumber: '77101', TransitAmount: 575, LedgerAmount: 575, Variance: 0 },
    { OT: 'ST', OrderNumber: '4404', DT: 'IT', DocNumber: '77104', TransitAmount: 800, LedgerAmount: -239.43, Variance: 1039.43 } ] };
const REPORTS = [{ title: 'Ship vs. receipt cost', finding: true, count: 1 }, { title: 'GL classes not in the model', finding: true, count: 0 },
    { title: 'In-transit accounts', finding: false, count: 2 }, { title: 'Transfer AAIs', finding: false, count: 2 }, { title: 'Excluded orders', finding: false, count: 1 }];
const SRC_N = { company: '90001', currency: 'USD', period: '2025-06-30', rows: ROWS, history: HIST, reports: REPORTS, txv: TXV, orders: ORDERS };
const IDS = ['90001', '9000.149090', '9000.149091', '4400', '4402', '4403', '4404', '77100', '77104', 'VALVE-7A', 'HOSE-55'];
const leaks = (lines) => IDS.filter((id) => lines.join('\n').indexOf(id) >= 0);

async function run(page, docs, gate, config, log) {
    let bad = 0;
    const c = (n, g, w) => { if (!check(n, g, w, log)) bad++; };
    let sb;
    try { sb = build(page, docs, gate, config); } catch (e) { if (log !== false) console.log('  FAIL could not build the sandbox: ' + e.message); return 1; }
    const api = sb.api;

    // R: routing
    c('R1 api/v1/ai/explain is a VALC area', api._routesToValc('api/v1/ai/explain'), true);
    c('R1 in-transit/status is not', api._routesToValc('in-transit/status'), false);
    sb.fetchLog.length = 0;
    api.rrFetch('api/v1/ai/health', { query: { db: 'RapidReconciler_Test' } }); api.rrFetch('in-transit/status');
    c('R2 the AI call goes to VALC with its query; the data call to the data services',
        sb.fetchLog.map((x) => x.url), ['https://valc.example.invalid/api/v1/ai/health?db=RapidReconciler_Test', 'https://agent.example.invalid/in-transit/status']);

    // A: accountant facts
    const fa = api.itAcctFacts(SRC_A, 'full');
    c('A1 Full: company named, net to the cent with its currency symbol', fa[0], 'Company 90001 (USD), period ending Jun 30, 2025: out of balance $1,480.22; GL balance $63,600.00; in transit $62,119.78.');
    c('A1 Full: every component, exactly', fa[1].indexOf('beginning variance $340.25; end of day ($88.20); exclusions $310.00; transaction variance $741.77; journal entries $0.00') >= 0, true);
    c('A2 unposted batches appear only when not zero', fa.filter((l) => /^Unposted GL batches \$125\.00/.test(l)).length, 1);
    c('A2 control: no unposted line when they are zero', api.itAcctFacts(Object.assign({}, SRC_A, { rows: [ROWS[0]] }), 'full').some((l) => /^Unposted/.test(l)), false);
    c('A3 a GL roll "No" is counted and routed to the analyst', fa.some((l) => /^Roll-forward checks: 1 account\(s\) whose GL did not roll forward/.test(l)), true);
    c('A4 recurrence from the last six periods', fa.some((l) => l.indexOf('Out of balance in 3 of the last 6 periods') === 0), true);
    c('A5 Full lists accounts by number, largest first', fa.filter((l) => /^- Account /.test(l)).map((l) => l.split(':')[0]), ['- Account 9000.149090', '- Account 9000.149091']);
    const fs_ = api.itAcctFacts(SRC_A, 'scrubbed');
    c('A6 Enhanced: no company or account number anywhere', leaks(fs_), []);
    c('A6 Enhanced keeps the accounts, as Account 1, Account 2', fs_.filter((l) => /^- Account \d+:/.test(l)).length, 2);
    const fg = api.itAcctFacts(SRC_A, 'grounded');
    c('A7 Basic: the on-screen figures only (no history, no account list)', [fg.some((l) => /last 6 periods/.test(l)), fg.some((l) => /^- Account/.test(l)), leaks(fg)], [false, false, []]);

    // N: analyst counts and facts
    const n = api.itAnalystCounts(SRC_N);
    c('N1 quick filters counted from the rows', [n.noship, n.closed, n.zeroqty], [1, 1, 1]);
    c('N1 activity on excluded orders counted with its amount', [n.actOnExcl, n.actOnExclAmt], [1, 12.5]);
    c('N2 only "finding" reports count as findings (listings do not)', n.findings, 1);
    c('N3 documents with a variance, of all documents, and the net', [n.txvDocs, n.txvAll, n.txvTotal], [2, 3, 1247.32]);
    c('N4 this period\'s roll breaks from the history', [n.glBreaks, n.varBreaks], [1, 0]);
    const nf = api.itAnalystFacts(SRC_N, 'full');
    c('N5 Full names the documents and orders', ['77104', '4402'].every((id) => nf.join('\n').indexOf(id) >= 0), true);
    c('N5 Enhanced masks them all', leaks(api.itAnalystFacts(SRC_N, 'scrubbed')), []);
    const ng = api.itAnalystFacts(SRC_N, 'grounded');
    c('N5 Basic: counts only, no lists', [ng.some((l) => /^- (Document|Order|ST)/.test(l)), leaks(ng)], [false, []]);
    const down = api.itAnalystFacts(Object.assign({}, SRC_N, { txv: null, orders: null }), 'full');
    c('N6 a source that failed says so instead of reading as zero', [down.indexOf('Transaction variance: could not be loaded.') >= 0, down.indexOf('Orders: could not be loaded.') >= 0], [true, true]);

    // B: the brief
    const chips = api.itBriefChips(n, 'USD');
    // DAC-94: Excluded Orders is the fourth analyst tab, so it gets the fourth chip, and activity on an excluded line
    // moved there from the Orders chip (the Orders tab no longer lists excluded lines).
    c('B1 one chip per analyst tab, each the tab key the chip opens', chips.map((x) => x.key), ['health', 'txv', 'orders', 'excluded']);
    c('B1 states follow the counts', chips.map((x) => x.state), ['attn', 'attn', 'attn', 'attn']);
    c('B1 the orders chip counts the three filters of lines in transit', chips[2].text, '3 orders won’t clear on their own');
    c('B1 the excluded chip carries the activity since exclusion, with its amount', chips[3].text, '1 excluded line has activity since, net $12.50');
    c('B2 the lead names the count and the first tab', api.itBriefLead(chips), 'Four things need you today. Start with Data Health.');
    const clean = api.itBriefChips({ glBreaks: 0, varBreaks: 0, findings: 0, reportsDown: 0, txvDocs: 0, txvAll: 3, txvTotal: 0, noship: 0, closed: 0, zeroqty: 0, actOnExcl: 0 }, 'USD');
    c('B3 all clean -> "Nothing needs you today"', [clean.map((x) => x.state), api.itBriefLead(clean)], [['clean', 'clean', 'clean', 'clean'], 'Nothing needs you today. In Transit rolls forward and nothing is stuck.']);
    c('B4 a source that failed is "wait", not clean', api.itBriefChips(Object.assign({}, n, { txvDocs: null, noship: null, actOnExcl: null }), 'USD').map((x) => x.state), ['attn', 'wait', 'wait', 'wait']);

    // P: the prompt
    sb.RRV8.TRANSIT_GROUNDING = sb.RRV8.TRANSIT_GROUNDING || 'IN TRANSIT POLICY (test stand-in)';
    const p = api.itPrompt('analyst', 'scrubbed', ['FACT LINE'], 'What should I fix first?', null);
    c('P1 In Transit\'s grounding leads the prompt', p.indexOf(sb.RRV8.TRANSIT_GROUNDING) === 0, true);
    c('P2 Inventory\'s policies are not in it', [sb.RRV8.ANALYST_GROUNDING, sb.RRV8.ACCT_GROUNDING].filter((g) => g && p.indexOf(g.slice(0, 60)) >= 0).length, 0);
    c('P3 the level\'s data-access line is in it', p.indexOf(sb.RRV8.dataAccessLine('scrubbed')) >= 0, true);
    c('P4 the voice register closes it', p.slice(-60) === String(sb.RRV8.AI_REGISTER).slice(-60), true);
    c('P5 the doc links offered are In Transit\'s, not Inventory\'s', [p.indexOf('transit-reconcile =') >= 0, p.indexOf(' reconciliation = Inventory Reconciliation') >= 0], [true, false]);
    c('P6 the facts and the question are in it', [p.indexOf('FACT LINE') >= 0, p.indexOf('Question: What should I fix first?') >= 0], [true, true]);

    // D: ai-docs.js
    const home = sb.RRV8.aiDocs.catalogPrompt('token', 'accountant');
    c('D1 Home\'s catalog (no module) is unchanged: no In Transit guide', /transit-/.test(home), false);
    c('D1 control: Home\'s catalog still lists Inventory\'s guides', home.indexOf('reconciliation = Inventory Reconciliation') >= 0, true);
    const it = sb.RRV8.aiDocs.catalogPrompt('token', 'analyst', 'it');
    c('D2 In Transit\'s catalog lists its three guides and nothing else',
        (it.match(/^ {2}[a-z-]+ =/gm) || []).map((s) => s.trim().replace(' =', '')), ['transit-reconcile', 'transit-reference', 'transit-exclusions']);
    c('D3 every In Transit guide is a file that exists', ['transit-reconcile', 'transit-reference', 'transit-exclusions']
        .filter((k) => !fs.existsSync(path.join(R8, sb.RRV8.aiDocs.DOCS[k].href))), []);

    // X: the analyst view never loads Overview's rows, where the page learns currencies (measured in headless Chrome
    // 2026-11-05: the chip read "net 1,247.32" with no symbol). The facts take it from the period's own rows.
    const xs = await api.itSources('analyst');
    c('X1 the analyst\'s sources carry the company\'s currency from its rows', [xs.currency, api.S.currency['90002']], ['GBP', 'GBP']);

    // C: the card's Off wording, from the shared gate
    if (!gate) { bad++; if (log !== false) console.log('  FAIL RRV8/ai-gate.js does not exist yet, so the card cannot be checked'); }
    else {
        sb.db = { n: 'RapidReconciler_Test', perms: { dm: true, ac: true } };
        sb.__role = 'accountant';
        sb.RRAI.get = () => 'off'; sb.RRAI.plan = () => 'off'; sb.RRAI.featureOff = () => false;
        api.setAsstTier();
        c('C1 an Off plan names who can add it (the gate\'s sentence)', sb.el('acctAiGreeting').textContent, sb.RRV8.aiGate({ fetch() {}, activeDb() { return {}; } }).AI_NOT_IN_PLAN);
        c('C1 and the box says so and cannot be used', [sb.el('acctAskInput').disabled, sb.el('acctAskInput').placeholder], [true, 'Not part of this plan.']);
        sb.RRAI.plan = () => 'full'; sb.RRAI.featureOff = (f) => f === 'ask';
        api.setAsstTier();
        c('C2 an administrator\'s Off names that', /turned off for this database/.test(sb.el('acctAiGreeting').textContent), true);
        sb.RRAI.featureOff = () => false;
        api.setAsstTier();
        c('C3 this browser\'s own Off reads as Home\'s card does', sb.el('acctAiGreeting').textContent, 'Switched off. Turn AI on for reconciliation help.');
        sb.RRAI.get = () => 'full'; sb.__role = 'analyst';
        api.setAsstTier();
        c('C4 on: the analyst\'s card is the RR Analyst Assistant, box open', [sb.el('aiAsstName').textContent, sb.el('aiAnsLabel').textContent, sb.el('acctAskInput').disabled],
            ['RR Analyst Assistant', 'RR Analyst Assistant', false]);
    }
    return bad;
}

const ARMS = [];
function arm(name, which, from, to) { ARMS.push([name, which, from, to]); }
async function runArm(name, which, from, to) {
    const src = { page: PAGE, docs: DOCS, gate: GATE || '' }[which];
    if (src.indexOf(from) < 0) { failures++; console.log('  FAIL arm "' + name + '": the text it mutates is gone'); return; }
    const m = src.replace(from, to);
    const bad = await run(which === 'page' ? m : PAGE, which === 'docs' ? m : DOCS, which === 'gate' ? m : GATE, CONFIG, false);
    if (bad > 0) console.log('  ok   arm "' + name + '" turns ' + bad + ' assertion(s) red');
    else { failures++; console.log('  FAIL arm "' + name + '" changed nothing'); }
}
arm('AI calls sent to the data services', 'page', '    if (_routesToValc(area)) {', '    if (false) {');
arm('the company named below Full', 'page', "return tier === 'full' ? 'Company ' + co : 'the company';", "return 'Company ' + co;");
arm('accounts named below Full', 'page', "(tier === 'full' ? 'Account ' + trim(r.LongAccount) : 'Account ' + (i + 1))", "('Account ' + trim(r.LongAccount))");
arm('Basic gets the history and accounts', 'page', "    if (tier === 'grounded') return L;\n    var pts", '    var pts');
arm('unposted shown when zero', 'page', "    if (Math.abs(sumOf(rows, 'UnpostBatch')) >= AI_EPS) L.push(", '    L.push(');
arm('listings counted as findings', 'page', 'return r.finding && r.count > 0;', 'return r.count > 0;');
arm('activity on excluded orders not flagged', 'page', "state: c.actOnExcl == null ? 'wait' : (c.actOnExcl ? 'attn' : 'clean'),", "state: 'clean',");
arm('a failed source reads as zero', 'page', "L.push(c.noship == null ? 'Orders: could not be loaded.'", "L.push(false ? ''");
arm('Inventory\'s analyst grounding in the prompt', 'page', "return (G.TRANSIT_GROUNDING ? G.TRANSIT_GROUNDING + '\\n\\n' : '')", "return (G.ANALYST_GROUNDING ? G.ANALYST_GROUNDING + '\\n\\n' : '')");
arm('no data-access line', 'page', "      + (G.dataAccessLine ? G.dataAccessLine(tier) + '\\n' : '')\n      + _aiDocCatalogPrompt(vr)", '      + _aiDocCatalogPrompt(vr)');
arm('the doc catalog not scoped to In Transit', 'page', "RRV8.aiDocs.catalogPrompt('token', role, 'it')", "RRV8.aiDocs.catalogPrompt('token', role)");
arm('Home\'s catalog defaults to In Transit', 'docs', "module = module || 'inv';", "module = module || 'it';");
arm('In Transit guides offered on every module', 'docs', "var r = DOCS[k].roles, m = DOCS[k].modules || ['inv'];", "var r = DOCS[k].roles, m = ['inv', 'it'];");
arm('every Off reads as the browser switch', 'page', "off ? (off.reason === 'tier-off' ? 'Switched off. Turn AI on for reconciliation help.' : off.why)", "off ? 'Switched off. Turn AI on for reconciliation help.'");
arm('the analyst card keeps the accounting name', 'page', "$('aiAsstName').textContent = ROLE_ASST[vr] || '';", "$('aiAsstName').textContent = 'RR Accounting Assistant';");
arm('the analyst facts lose the currency', 'page', '        if (withCur) base.currency = S.currency[S.company] = trim(withCur.Currency);\n', '');

(async function () {
    console.log('transit.html AI assistants as shipped:');
    failures += await run(PAGE, DOCS, GATE, CONFIG, true);
    console.log('mutation arms:');
    for (const a of ARMS) await runArm.apply(null, a);
    console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nPASS');
    process.exit(failures ? 1 : 0);
})();
