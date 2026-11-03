/* test-transit-page.js -- behaviour test for the In Transit landing page (UI-240).
 *
 *   node Tools/test-transit-page.js
 *
 * WHAT IT PINS.
 *   A  The module gate matches the server's. UserRequest.hasModule is t.it AND m.it
 *      for the active database, and fails closed. A page that showed itself on an old
 *      token with no t block (`t.it !== false`, the fail-open UI-205 found in Home's
 *      picker) would call /in-transit/* and get a 403 as its normal path.
 *   B  Every in-transit/ area routes to the data services. config.js's
 *      RR_TEST_AGENT_PREFIXES carries 'in-transit/'; without it rrFetch sends these
 *      calls to the wrong base (UI-239's note to UI-240).
 *   C  V7's three Orders quick filters, as RR University's reconcile guide defines
 *      them: receipts without shipments, in transit on a closed PO (lowest next
 *      status 999 with quantity still in transit), zero quantity in transit (quantity
 *      ties, amount does not).
 *   D  The exclusion key carries the seven field names the server binds, with
 *      orderNumber and shortItem as numbers (TransitExclusionRequest.OrderKey has
 *      them as Integer). Jackson drops a misnamed key without a word.
 *   E  Exclude and recalc show on perms.ite, not aite (VALC mints aite from Import JDE).
 *
 * SOURCE IS NOT RETYPED. The functions and tables are sliced out of the shipping
 * RRV8/transit.html and RRV8/config.js and run in a vm sandbox.
 *
 * EVERY ASSERTION HAS A MUTATION ARM. Each arm puts one defect back into the sliced
 * source and requires the matching assertions to go red, so a check that cannot fail
 * is reported as a failure.
 *
 * BLIND SPOTS, named: no DOM and no network. The page's rendering, the grid, and the
 * live calls are covered by the live check on Demo1 (UI-240's row), not here.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'transit.html'), 'utf8');
const CONFIG = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'config.js'), 'utf8');

let failures = 0;
function check(name, got, want, log) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    const ok = g === w;
    if (log !== false) console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '\n         got  ' + g + '\n         want ' + w));
    return ok;
}

/* ---- slicing: a brace / bracket matcher that skips strings and comments ------- */
function matchClose(src, openIdx) {
    const open = src[openIdx], close = open === '{' ? '}' : open === '[' ? ']' : ')';
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
        const c = src[i], n = src[i + 1];
        if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
        if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
        if (c === '"' || c === "'" || c === '`') {
            for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
            continue;
        }
        if (c === open) depth++;
        else if (c === close && --depth === 0) return i;
    }
    throw new Error('unbalanced ' + open + ' at ' + openIdx);
}
function sliceFn(src, name) {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found in source');
    return src.slice(at, matchClose(src, src.indexOf('{', at)) + 1);
}
function sliceAssign(src, lead, opener) {
    const at = src.indexOf(lead);
    if (at < 0) throw new Error(lead + ' not found in source');
    const o = src.indexOf(opener, at);
    return src.slice(at, matchClose(src, o) + 1) + ';';
}

function build(page, config) {
    const code = [
        sliceAssign(config, 'window.RR_TEST_AGENT_AREAS = [', '['),
        sliceAssign(config, 'window.RR_TEST_AGENT_PREFIXES = [', '['),
        sliceFn(page, 'trim'), sliceFn(page, 'num'), sliceFn(page, 'isoDay'),
        sliceFn(page, 'activeDb'), sliceFn(page, 'hasModule'), sliceFn(page, 'perms'),
        sliceFn(page, 'canAccountant'), sliceFn(page, 'canAnalyst'), sliceFn(page, 'canExclude'),
        sliceAssign(page, 'var _testAgentAreas = ', '('),
        sliceAssign(page, 'var _testAgentPrefixes = ', '['),
        sliceFn(page, '_routesToTestAgent'),
        sliceAssign(page, 'var QUICK = ', '{'),
        sliceFn(page, 'exclusionKey'), sliceFn(page, 'orderKey'),
        'this.api = { hasModule, canExclude, canAnalyst, canAccountant, _routesToTestAgent, QUICK, exclusionKey, orderKey };'
    ].join('\n');
    const box = { window: {}, Set, Number, String, Math, JSON };
    box.window.RRDB = { active: function () { return box.db; } };
    vm.createContext(box);
    vm.runInContext(code, box);
    return box;
}

/* ---- the assertions, run against a given (page, config) pair ------------------ */
const ORDERS = [
    { k: 'noship',  CompanyNumber: '90001', ShipQty: 0,  RecQty: 5,  TranQty: -5, TranAmt: -50,  RecSts: '400', Excluded: false },
    { k: 'closed',  CompanyNumber: '90001', ShipQty: 10, RecQty: 6,  TranQty: 4,  TranAmt: 40,   RecSts: '999', Excluded: false },
    { k: 'zeroqty', CompanyNumber: '90001', ShipQty: 8,  RecQty: 8,  TranQty: 0,  TranAmt: 3.25, RecSts: '999', Excluded: false },
    { k: 'open',    CompanyNumber: '90001', ShipQty: 10, RecQty: 2,  TranQty: 8,  TranAmt: 80,   RecSts: '400', ShipSts: '999', Excluded: false },
    { k: 'clean',   CompanyNumber: '90001', ShipQty: 3,  RecQty: 3,  TranQty: 0,  TranAmt: 0,    RecSts: '999', Excluded: true }
];
function run(page, config, log) {
    let bad = 0;
    const c = (n, g, w) => { if (!check(n, g, w, log)) bad++; };
    const box = build(page, config), api = box.api;

    // A: module gate
    box.db = { m: { it: true }, t: { it: true }, perms: {} };            c('A1 t.it and m.it -> module on', api.hasModule(), true);
    box.db = { m: { it: true }, perms: {} };                              c('A2 old token, no t block -> module off', api.hasModule(), false);
    box.db = { m: { it: true }, t: { it: false }, perms: {} };            c('A3 t.it false -> module off', api.hasModule(), false);
    box.db = { m: { it: false }, t: { it: true }, perms: {} };            c('A4 not ticked on the database -> module off', api.hasModule(), false);
    box.db = { t: { it: true }, perms: {} };                              c('A5 no m block -> module off', api.hasModule(), false);

    // B: routing
    c('B1 in-transit/status routes to the data services', api._routesToTestAgent('in-transit/status'), true);
    c('B2 in-transit/orders/recalc-status routes too', api._routesToTestAgent('in-transit/orders/recalc-status'), true);
    c('B3 an unrelated area does not', api._routesToTestAgent('api/v1/tenant/users'), false);

    // C: quick filters
    const pick = (f) => ORDERS.filter(api.QUICK[f].test).map((r) => r.k);
    c('C1 receipts without shipments', pick('noship'), ['noship']);
    c('C2 in transit on a closed PO', pick('closed'), ['closed']);
    c('C3 zero quantity in transit', pick('zeroqty'), ['zeroqty']);
    c('C4 excluded', pick('excl'), ['clean']);
    c('C5 all', pick('all').length, ORDERS.length);

    // D: exclusion key
    const key = api.exclusionKey({ CompanyNumber: '90001 ', LongAccount: ' 9000.149090 ', OrderDate: '2025-07-14T00:00:00', OrderNumber: '26678', OrderType: 'ST', ShortItem: '440574', Lot: '', Excluded: false, TranAmt: 9 });
    c('D1 the seven field names, in the bound shape', Object.keys(key).sort(), ['companyNumber', 'longAccount', 'lot', 'orderDate', 'orderNumber', 'orderType', 'shortItem']);
    c('D2 orderNumber and shortItem are numbers', [typeof key.orderNumber, typeof key.shortItem], ['number', 'number']);
    c('D3 values trimmed, date as a day', [key.companyNumber, key.longAccount, key.orderDate, key.orderNumber, key.shortItem], ['90001', '9000.149090', '2025-07-14', 26678, 440574]);
    c('D4 no amount or quantity is sent (the server reads them)', 'TranAmt' in key || 'tranAmt' in key || 'amount' in key, false);

    // E: exclude permission
    box.db = { m: { it: true }, t: { it: true }, perms: { ite: true } };  c('E1 perms.ite -> can exclude', api.canExclude(), true);
    box.db = { m: { it: true }, t: { it: true }, perms: { aite: true } }; c('E2 aite alone -> cannot exclude', api.canExclude(), false);
    return bad;
}

console.log('transit.html as shipped:');
failures += run(PAGE, CONFIG, true);

/* ---- mutation arms: each must turn at least one assertion red ------------------ */
function arm(name, page, config, from, to, where) {
    const src = where === 'config' ? config : page;
    if (src.indexOf(from) < 0) { failures++; console.log('  FAIL arm "' + name + '": the text it mutates is gone (' + from + ')'); return; }
    const p = where === 'config' ? page : page.replace(from, to);
    const cf = where === 'config' ? config.replace(from, to) : config;
    const bad = run(p, cf, false);
    if (bad > 0) console.log('  ok   arm "' + name + '" turns ' + bad + ' assertion(s) red');
    else { failures++; console.log('  FAIL arm "' + name + '" changed nothing: those assertions cannot fail'); }
}
console.log('mutation arms:');
arm('old-token fail-open', PAGE, CONFIG, 'a.t && a.t.it === true', '(!a.t || a.t.it !== false)');
arm('in-transit/ missing from config.js', PAGE, CONFIG, "  'in-transit/'", "  'not-in-transit/'", 'config');
arm('closed PO read from the ship status', PAGE, CONFIG, "trim(r.RecSts) === '999'", "trim(r.ShipSts) === '999'");
arm('zero quantity ignores the amount', PAGE, CONFIG, '&& Math.abs(num(r.TranAmt)) >= 0.005; } }', '; } }');
arm('orderNumber sent as a string', PAGE, CONFIG, 'orderNumber: Number(r.OrderNumber)', 'orderNumber: trim(r.OrderNumber)');
arm('exclude gated on aite', PAGE, CONFIG, 'return perms().ite === true;', 'return perms().aite === true;');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nPASS');
process.exit(failures ? 1 : 0);
