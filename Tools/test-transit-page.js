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
 *   F  Orders is V7's page: every v6ui_transorders column but OrderMonth, totals of the rows shown, Recalculate
 *      balance above the grid, no Tools tab.
 *   G  Home's frame (UI-240 slice 2, owner 2026-11-05: "formatted as close to the inventory pages as possible").
 *      The lens toggle and top controls row are gone; the page links home-frame.css / home-frame.js and carries
 *      #roleHero, #subNav, #periodWidget and Home's cluster. The view is Home's rrv8.viewRole clamped to the lanes
 *      held ('admin' lands on the first lane, neither lane is 'none'); the switcher shows only with both lanes;
 *      #subNav draws each view's tabs; the tab memory is In Transit's own; applyViewRole() sets
 *      body[data-view-role], which every frame rule in home-frame.css keys on. Run on a small fake DOM.
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
        sliceFn(page, 'exclusionKey'), sliceFn(page, 'orderKey'), sliceFn(page, 'ordersTotals'),
        // The column list runs on stand-ins for the cell helpers: only its keys are under test.
        'var C = { co: { k: "CompanyNumber" }, acct: { k: "LongAccount" } };',
        'function t(k) { return { k: k }; } function q(k) { return { k: k }; } function m(k) { return { k: k }; } function dcol(k) { return { k: k }; }',
        sliceAssign(page, 'var ORDER_COLS = ', '['),
        sliceAssign(page, 'var TABS = ', '{'),
        'this.orderCols = ORDER_COLS; this.tabs = TABS;',
        'this.api = { hasModule, canExclude, canAnalyst, canAccountant, _routesToTestAgent, QUICK, exclusionKey, orderKey, ordersTotals };'
    ].join('\n');
    const box = { window: {}, Set, Number, String, Math, JSON };
    box.window.RRDB = { active: function () { return box.db; } };
    vm.createContext(box);
    vm.runInContext(code, box);
    // The Orders panel's markup, from its opening tag to the next section: the recalc control comes before the grid.
    const om = /<section\b[^>]*\bid="tab-orders"/.exec(page);
    const ps = om ? om.index : -1, pe = page.indexOf('</section>', ps);
    const panel = ps < 0 ? '' : page.slice(ps, pe);
    box.recalcAboveOrders = panel.indexOf('id="rcBtn"') >= 0 && panel.indexOf('id="rcBtn"') < panel.indexOf('id="orGrid"');
    return box;
}

/* ---- G: Home's frame (UI-240 slice 2), run on a small fake DOM ------------------ */
// The shipping frame functions, sliced, with the tab loaders stubbed: what is under test is which view the page
// lands on, who gets the switcher, which #subNav tabs each view draws, and the body attribute Home's CSS keys on.
function frame(page) {
    const els = {}, calls = [], store = {};
    const mk = (id) => ({ id, hidden: false, innerHTML: '', textContent: '', attrs: {}, cls: {},
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
        classList: { toggle(c, on) { /* recorded on the owner below */ } } });
    const el = (id) => els[id] || (els[id] = mk(id));
    const roleOpts = ['analyst', 'accountant'].map((r) => {
        const o = mk('opt-' + r); o.attrs['data-role'] = r;
        o.classList = { toggle(c, on) { o.cls[c] = !!on; } };
        return o;
    });
    const body = mk('body');
    const document = { getElementById: el, body, querySelectorAll: (sel) => (sel === '#haRoleMenu .umr-opt' ? roleOpts : []) };
    const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
    const keyDecl = (/var SUBVIEW_KEY = '[^']*';/.exec(page) || [''])[0];
    const code = [
        'function $(id) { return document.getElementById(id); }',
        // esc() is not under test, and its regex literal defeats the brace matcher: a stand-in, as for the cell helpers.
        'function esc(s) { return String(s == null ? "" : s); }',
        sliceFn(page, 'trim'), sliceFn(page, 'activeDb'), sliceFn(page, 'perms'),
        sliceFn(page, 'canAnalyst'), sliceFn(page, 'canAccountant'),
        sliceAssign(page, 'var ROLE_LABEL = ', '{'), sliceAssign(page, 'var TABS = ', '{'), keyDecl,
        sliceFn(page, 'entitledViews'), sliceFn(page, 'viewRole'), sliceFn(page, 'setViewRole'), sliceFn(page, 'syncRoleMenu'),
        sliceFn(page, 'curSubView'), sliceFn(page, 'renderSubNav'), sliceFn(page, 'applyViewRole'),
        // Stubs for what applyViewRole() hands on to: recorded, not run.
        'var S = { companies: ["90001"] };',
        'function renderCompaniesPill() { calls.push("cos"); } function showTab(t) { calls.push("tab:" + t); } function renderRoleHero() { calls.push("hero"); }',
        'this.api = { viewRole, setViewRole, syncRoleMenu, renderSubNav, applyViewRole, curSubView, entitledViews };'
    ].join('\n');
    const box = { document, localStorage, calls, JSON, String, Array };
    box.window = { RRDB: { active: () => box.db } };
    vm.createContext(box);
    vm.runInContext(code, box);
    box.els = els; box.el = el; box.store = store; box.roleOpts = roleOpts; box.body = body;
    // The tabs #subNav drew: [key, label, active] per button.
    box.tabsDrawn = () => [...el('subNav').innerHTML.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-sv="([^"]*)"[^>]*>([^<]*)<\/button>/g)]
        .map((m) => [m[2], m[3], /\bis-active\b/.test(m[1])]);
    return box;
}
const BOTH = { m: { it: true }, t: { it: true }, perms: { dm: true, ac: true } };

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

    // F: Orders has V7's functionality (owner 2026-11-05). Every column of v6ui_transorders, which is what V7's
    // usp6transorders grid showed (measured on Demo1 2026-11-05), except OrderMonth (the order date's month).
    const VIEW_COLS = ['Excluded', 'Note', 'CompanyNumber', 'LongAccount', 'ShipComp', 'RecComp', 'ShipBranch', 'RecBranch',
        'LastShip', 'LastRec', 'OrderNumber', 'OrderType', 'OrderMonth', 'OrderDate', 'RelOrder', 'RelType', 'ShortItem',
        'ItemNumber', 'ThirdItem', 'Lot', 'ShipQty', 'ShipUOM', 'RecQty', 'RecUOM', 'TranQty', 'ShipAmt', 'RecAmt',
        'TranAmt', 'ShipSts', 'RecSts', 'FromCurr', 'ToCurr', 'Rate', 'ExclQty', 'ExclAmt', 'ExclVarQty', 'ExclVarAmt'];
    const shown = box.orderCols.map((x) => x.k);
    c('F1 the Orders grid shows every V7 column but OrderMonth', VIEW_COLS.filter((k) => shown.indexOf(k) < 0), ['OrderMonth']);
    c('F2 and nothing the view does not have', shown.filter((k) => VIEW_COLS.indexOf(k) < 0), []);
    const tot = api.ordersTotals([{ TranQty: 4, TranAmt: 40, ExclAmt: 0, ExclVarAmt: 0 }, { TranQty: '-1.5', TranAmt: '-12.25', ExclAmt: '7.5', ExclVarAmt: '0.75' }, {}]);
    c('F3 the totals add up the rows they are given, text and blanks included', [tot.tranQty, tot.tranAmt, tot.exclAmt, tot.exclVarAmt], [2.5, 27.75, 7.5, 0.75]);
    c('F4 the analyst tabs end with Orders; recalc is no longer a tab of its own', box.tabs.analyst.map((x) => x[0]), ['health', 'txv', 'orders']);
    c('F5 Recalculate balance sits on the Orders tab, above its grid, as in V7', box.recalcAboveOrders, true);

    // G: Home's frame (owner 2026-11-05: "formatted as close to the inventory pages as possible").
    // G1 the slice-1 lens toggle and top controls row are gone; the page wears Home's frame instead.
    const markup = page.replace(/<script\b[\s\S]*?<\/script>/g, '');
    c('G1 no Accountant/Analyst lens toggle and no top controls row',
        ['id="itLens"', 'data-lens=', 'id="itCompany"', 'id="itPeriod"', 'class="it-controls"', 'id="itTabs"'].filter((s) => markup.indexOf(s) >= 0), []);
    c('G1 Home\'s frame is there: role hero, #subNav, period chart, the cluster with the view switcher',
        ['id="roleHero"', 'id="subNav"', 'id="periodWidget"', 'id="homeActions"', 'id="haRoles"', 'id="haMod"', 'id="haCos"', 'id="haDb"', 'id="haUni"'].filter((s) => markup.indexOf(s) < 0), []);
    c('G1 it links Home\'s stylesheet and Home\'s shared frame script',
        [/<link href="home-frame\.css" rel="stylesheet">/.test(page), /<script src="home-frame\.js"><\/script>/.test(page)], [true, true]);

    // G2 the view: Home's key, clamped to the lanes this database grants; 'none' with neither.
    let f = frame(page);
    f.db = BOTH; f.store['rrv8.viewRole'] = 'accountant';
    c('G2 a stored view the user holds is honoured (Home\'s rrv8.viewRole key)', f.api.viewRole(), 'accountant');
    f.store['rrv8.viewRole'] = 'admin';
    c('G2 Home\'s Administrator view is not an In Transit view: lands on the first lane held', f.api.viewRole(), 'analyst');
    f.db = { m: { it: true }, t: { it: true }, perms: { ac: true } }; f.store['rrv8.viewRole'] = 'analyst';
    c('G2 a stored view the user does not hold falls back to the one they do', f.api.viewRole(), 'accountant');
    f.db = { m: { it: true }, t: { it: true }, perms: { ij: true, adm: true } };
    c('G2 neither lane -> "none" (Home\'s no-grant state)', f.api.viewRole(), 'none');
    f = frame(page); f.db = BOTH;
    f.api.setViewRole('accountant');
    c('G2 switching writes rrv8.viewRole, so Home opens on the same view', f.store['rrv8.viewRole'], 'accountant');
    f.db = { m: { it: true }, t: { it: true }, perms: { dm: true } }; f.store['rrv8.viewRole'] = 'analyst';
    f.api.setViewRole('accountant');
    c('G2 a view the user does not hold cannot be switched to', f.store['rrv8.viewRole'], 'analyst');

    // G3 the switcher in the cluster: only for a user holding both lanes, offering only the lanes held.
    f = frame(page); f.db = BOTH; f.api.syncRoleMenu();
    c('G3 both lanes -> the View switcher shows', f.el('haRoles').hidden, false);
    f.db = { m: { it: true }, t: { it: true }, perms: { dm: true } }; f.api.syncRoleMenu();
    c('G3 one lane -> no switcher', f.el('haRoles').hidden, true);
    c('G3 and the option for the lane not held is hidden', f.roleOpts.map((o) => [o.attrs['data-role'], o.hidden]), [['analyst', false], ['accountant', true]]);

    // G4 #subNav draws each view's tabs, Home's .subnav-tab buttons, one active.
    f = frame(page); f.db = BOTH; f.store['rrv8.viewRole'] = 'analyst'; f.api.renderSubNav();
    c('G4 analyst tabs: Data Health, Transaction Variance, Orders (the first active)', f.tabsDrawn(),
        [['health', 'Data Health', true], ['txv', 'Transaction Variance', false], ['orders', 'Orders', false]]);
    f.store['rrv8.viewRole'] = 'accountant'; f.api.renderSubNav();
    c('G4 accountant tabs: Overview, Accounts, On Hand, Audit Center', f.tabsDrawn(),
        [['overview', 'Overview', true], ['accounts', 'Accounts', false], ['onhand', 'On Hand', false], ['audit', 'Audit Center', false]]);
    f.store['rrv8.subview'] = JSON.stringify({ accountant: 'audit' });
    c('G4 the tab memory is In Transit\'s own, not Home\'s rrv8.subview (the two pages\' tab keys differ)', f.api.curSubView(), 'overview');
    f.store['rrv8.itSubview'] = JSON.stringify({ accountant: 'onhand' });
    c('G4 a remembered In Transit tab reopens', f.api.curSubView(), 'onhand');

    // G5 applyViewRole sets the body attribute Home's stylesheet keys on, and shows the view's tab.
    f = frame(page); f.db = BOTH; f.store['rrv8.viewRole'] = 'accountant'; f.api.applyViewRole();
    c('G5 body[data-view-role] follows the view', f.body.attrs['data-view-role'], 'accountant');
    c('G5 and the view\'s tab is shown', f.calls.filter((x) => /^tab:/.test(x)), ['tab:overview']);
    f.db = { m: { it: true }, t: { it: true }, perms: {} }; f.calls.length = 0; f.api.applyViewRole();
    c('G5 no lane -> data-view-role="none" and no tab loads', [f.body.attrs['data-view-role'], f.calls.filter((x) => /^tab:/.test(x))], ['none', []]);
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
arm('the exclusion-variance amount dropped from Orders', PAGE, CONFIG, ", m('ExclVarAmt', 'Excl var amount')", '');
arm('a column the view does not have', PAGE, CONFIG, "t('ShipUOM', 'Ship UOM')", "t('ShipUnits', 'Ship UOM')");
arm('the totals skip the excluded amount', PAGE, CONFIG, 't.exclAmt += num(r.ExclAmt);', '');
arm('a Tools tab put back', PAGE, CONFIG, "['orders', 'Orders'] ]", "['orders', 'Orders'], ['tools', 'Tools'] ]");
arm('recalc moved below the grid', PAGE, CONFIG, '      <div id="orGrid"></div>\n    </section>', '      <span></span>\n    </section>');
arm('the lens toggle put back', PAGE, CONFIG, '<div class="subnav" id="subNav"', '<span class="seg" id="itLens" role="group"></span><div class="subnav" id="subNav"');
arm('the page drops Home\'s stylesheet', PAGE, CONFIG, '<link href="home-frame.css" rel="stylesheet">', '<link href="admin-chrome.css" rel="stylesheet">');
arm('a stored view honoured without the lane', PAGE, CONFIG, "return ok.indexOf(v) >= 0 ? v : (ok[0] || 'none');", "return v || ok[0] || 'none';");
arm('the view read from a key Home does not use', PAGE, CONFIG, "v = localStorage.getItem('rrv8.viewRole') || '';", "v = localStorage.getItem('rrv8.itViewRole') || '';");
arm('setViewRole stores a view the user does not hold', PAGE, CONFIG, "if (entitledViews().indexOf(r) < 0) return;\n    try { localStorage.setItem('rrv8.viewRole', r); }", "try { localStorage.setItem('rrv8.viewRole', r); }");
arm('the switcher shown to a one-lane user', PAGE, CONFIG, "$('haRoles').hidden = ok.length < 2;", "$('haRoles').hidden = false;");
arm('the analyst tabs drawn for every view', PAGE, CONFIG, "var nav = $('subNav'), list = TABS[viewRole()];", "var nav = $('subNav'), list = TABS.analyst;");
arm('the tab memory shared with Home\'s', PAGE, CONFIG, "var SUBVIEW_KEY = 'rrv8.itSubview';", "var SUBVIEW_KEY = 'rrv8.subview';");
arm('applyViewRole stops setting the body attribute', PAGE, CONFIG, "document.body.setAttribute('data-view-role', vr);", '');
arm('a tab loads with no lane', PAGE, CONFIG, "if (vr !== 'none' && S.companies.length) showTab(curSubView());", 'if (S.companies.length) showTab(curSubView());');

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nPASS');
process.exit(failures ? 1 : 0);
