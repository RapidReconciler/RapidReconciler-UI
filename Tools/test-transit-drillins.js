/* test-transit-drillins.js -- behaviour test for In Transit's two drill-in pages (UI-240).
 *
 *   node Tools/test-transit-drillins.js
 *
 * WHAT IT PINS.
 *   A  Both pages gate on the server's module test (t.it AND m.it, fail closed) and route every in-transit/ area
 *      to the data services through config.js's RR_TEST_AGENT_PREFIXES.
 *   B  transit-transactions.html's request shapes. Jackson drops a misnamed key without a word, so:
 *        - details is {company, doc, type}: `type`, not `docType`, and doc a number (TransactionDetailsRequest.doc
 *          is an int);
 *        - a note is the Agent's TransitNote: the eight key fields plus worked and note, with batchNumber,
 *          docNumber and orderNumber as numbers;
 *        - TransitWorkNote's key includes PeriodEnds, so every line is saved under ITS OWN period: one save-notes
 *          body per period, never the page's period stamped on every line;
 *        - the note key the page picks lines by is the same eight columns, so two lines that differ only in
 *          account, order or period are two lines.
 *   C  usp6transcompare2's one rowset reads as sections by Sort, as the procedure builds it: spacers and the
 *      'DMAAIs' title row dropped, each total the footer of its own section (never a row), and a column empty on
 *      every row of a section left out. The fixture is shaped on the one measured on Demo1 2026-11-22 (sections
 *      001, 002, 002a, 003, 004, 005, 006 + 006 total, 007, 009, 010, 011, 012, 014...), with fictional values.
 *   D  transit-asof.html: the request is AsOfDetailsRequest's {companyNumber, itemNumber, lot}; usp6transitemroll's
 *      `comm` reads as beginning balance / ending balance / exclusion / ledger line; rows group by account in the
 *      procedure's order; only ledger and exclusion lines after the period are dimmed; the headline figure is the
 *      On Hand read's rows for this item AND lot.
 *   E  transit.html links each Transaction Variance document and each On Hand item to its drill-in, with the
 *      company, period and the keys the drill-in reads back (doc + type; item + lot).
 *
 * SOURCE IS NOT RETYPED. Every function under test is sliced out of the shipping pages and run in a vm sandbox.
 *
 * EVERY ASSERTION HAS A MUTATION ARM. Each arm puts one defect back into the sliced source and requires at least
 * one assertion to go red, so a check that cannot fail is reported as a failure.
 *
 * BLIND SPOTS, named: no DOM and no network. Rendering, the Edit notes modal, the Excel builds and the live calls
 * are the owner's look on Demo1 (UI-240's row), not this file.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');
const SRC = {
    tx: read('RRV8/transit-transactions.html'),
    asof: read('RRV8/transit-asof.html'),
    page: read('RRV8/transit.html'),
    config: read('RRV8/config.js')
};

let failures = 0;
function check(name, got, want, log) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    const ok = g === w;
    if (log !== false) console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '\n         got  ' + g + '\n         want ' + w));
    return ok;
}

/* ---- slicing: a brace / bracket matcher that skips strings and comments (test-transit-page.js's) ---- */
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
function sandbox(code) {
    const box = { window: {}, Set, Number, String, Math, JSON, URLSearchParams, encodeURIComponent };
    box.window.RRDB = { active: function () { return box.db; } };
    vm.createContext(box);
    vm.runInContext(code, box);
    return box;
}
const common = (src, config) => [
    sliceAssign(config, 'window.RR_TEST_AGENT_AREAS = [', '['),
    sliceAssign(config, 'window.RR_TEST_AGENT_PREFIXES = [', '['),
    sliceFn(src, 'trim'), sliceFn(src, 'num'), sliceFn(src, 'isoDay'),
    sliceFn(src, 'activeDb'), sliceFn(src, 'hasModule'), sliceFn(src, 'perms'), sliceFn(src, 'canAnalyst'),
    sliceAssign(src, 'var _testAgentAreas = ', '('), sliceAssign(src, 'var _testAgentPrefixes = ', '['),
    sliceFn(src, '_routesToTestAgent')
];
function buildTx(src, config) {
    return sandbox(common(src, config).concat([
        sliceFn(src, 'canEditNotes'), sliceFn(src, 'detailsBody'), sliceFn(src, 'noteKey'), sliceFn(src, 'transitNote'),
        sliceFn(src, 'saveBodies'), sliceAssign(src, 'var SECTIONS = ', '['), sliceFn(src, 'sectionOf'),
        sliceFn(src, 'numOrNull'), sliceFn(src, 'gridSign'), sliceFn(src, 'sectionsOf'), sliceFn(src, 'liveCols'),
        'this.api = { hasModule, canEditNotes, _routesToTestAgent, detailsBody, noteKey, transitNote, saveBodies, sectionOf, sectionsOf, liveCols };'
    ]).join('\n'));
}
function buildAsof(src, config) {
    return sandbox(common(src, config).concat([
        sliceFn(src, 'rollBody'), sliceFn(src, 'rollKind'), sliceAssign(src, 'var KIND_LABEL = ', '{'),
        sliceFn(src, 'rollAccounts'), sliceFn(src, 'isAfter'),
        'var S = { item: "TX-100", lot: "L1" };', sliceFn(src, 'onHandOf'),
        'this.api = { hasModule, _routesToTestAgent, rollBody, rollKind, rollAccounts, isAfter, onHandOf, S };'
    ]).join('\n'));
}
function buildPage(src) {
    return sandbox([
        sliceFn(src, 'trim'), sliceFn(src, 'isoDay'),
        'var S = { company: "90001", period: "2025-07-31" };',
        sliceFn(src, 'txDrillHref'), sliceFn(src, 'asofDrillHref'),
        'this.api = { txDrillHref, asofDrillHref };'
    ].join('\n'));
}
const q = (href) => { const i = href.indexOf('?'); const p = new URLSearchParams(href.slice(i + 1)); const o = {}; p.forEach((v, k) => { o[k] = v; }); return [href.slice(0, i), o]; };

/* ---- fixtures (fictional: company 9XXXX reserve) ---- */
const LINE = { PeriodEnds: '2025-07-31', CompanyNumber: '90001', Batch: 4401, LongAccount: '90001.1450', DT: 'OV', DocNumber: 7700101, OT: 'OT', OrderNumber: 6600101, Worked: false, Note: '' };
const null29 = (sort, extra) => Object.assign({ Sort: sort, Period: null, Account: null, Source: null, Company: null, TransDate: null, GLDate: null, GLClass: null, Batch: null, BT: null, Doc: null, DT: null, OrderNum: null, OT: null, Line: null, Ext: null, Branch: null, Item: null, Location: null, Lot: null, Qty: null, UM: null, Cost: null, CalcTrCost: null, CalcPrice: null, TransitAmount: null, LedgerAmount: null, Variance: null, Comment: null }, extra || {});
const COMPARE2 = [
    null29('001', { Period: '2025-07-31', Account: '90001.1450', Source: '1-RTrnDet', Company: '90001', TransDate: '2025-07-12', GLClass: 'IN30', Batch: '4401', Doc: '7700101', DT: 'OV', OrderNum: '6600101', OT: 'OT', Line: 1, Branch: 'B9000001', Item: 'TX-100', Lot: '', Qty: '12.0000', UM: 'EA', Cost: '4.2500', TransitAmount: -51.00, LedgerAmount: 0, Variance: -51.00 }),
    null29('002', { Source: '1-RTrnDetT', TransitAmount: -51.00, LedgerAmount: 0, Variance: -51.00, Comment: 'Transit Total' }),
    null29('002a'),
    null29('003', { Period: '2025-07-31', Account: '90001.1450', Source: '2-F0911', Company: '90001', TransDate: '2025-07-12', GLDate: '2025-07-12', Batch: '4401', BT: 'O', Doc: '7700101', DT: 'OV', OrderNum: '6600101', OT: 'OT', Line: 1, TransitAmount: 0, LedgerAmount: -50.00, Variance: 50.00, Comment: 'Receipt' }),
    null29('004', { Source: '2-F0911T', TransitAmount: 0, LedgerAmount: -50.00, Variance: 50.00, Comment: 'GL Total' }),
    null29('005'),
    null29('006', { Period: '2025-07-31', Account: '90001.1450', Source: '3-RapRec', Company: '90001', Batch: '4401', Doc: '7700101', DT: 'OV', OrderNum: '6600101', OT: 'OT', TransitAmount: -51.00, LedgerAmount: -50.00, Variance: -1.00 }),
    null29('006', { Source: '3-RapRecT', TransitAmount: -51.00, LedgerAmount: -50.00, Variance: -1.00, Comment: 'RR Total' }),
    null29('007'), null29('009'),
    null29('010', { Source: 'Purchase Receipt Detail', Company: '90001', TransDate: '2025-07-12', Doc: '7700101', DT: 'OV', OrderNum: '6600101', OT: 'OT', Qty: '12.0000', UM: 'EA', Cost: '4.1667', TransitAmount: '50.0000' }),
    null29('011'), null29('012', { Source: 'DMAAIs' }),
    null29('014IN30', { Period: 'Inv Model ', Account: '90001.1410', Source: '*4152', Company: '90001', TransDate: 'No flex', GLClass: 'IN30', DT: 'OV', OT: 'OT' }),
    null29('014IN30', { Period: 'Inventory', Account: '90001.1450', Source: '4405', Company: '90001', TransDate: 'No flex', GLClass: 'IN30', DT: 'OV', OT: 'OT' }),
    null29('014IN301')
];
const ROLL = [
    { companynumber: '90001', longaccount: '90001.1450', itemnumber: '', lot: '', periodends: '2025-09-01', creationdate: '1901-01-01', comm: 'End bal', runqty: 4, runamt: 17, qty: 4, val: 17 },
    { companynumber: '90001', longaccount: '90001.1450', itemnumber: 'TX-100', lot: 'L1', periodends: '2025-08-31', creationdate: '2025-08-03', comm: '', runqty: 4, runamt: 17, qty: -8, val: -34 },
    { companynumber: '90001', longaccount: '90001.1450', itemnumber: 'TX-100', lot: 'L1', periodends: '2025-07-31', creationdate: '2025-07-20', comm: 'Exclusion Adjust', runqty: 12, runamt: 51, qty: -2, val: -8.5 },
    { companynumber: '90001', longaccount: '90001.1450', itemnumber: 'TX-100', lot: 'L1', periodends: '2025-07-31', creationdate: '2025-07-12', comm: '', runqty: 14, runamt: 59.5, qty: 14, val: 59.5 },
    { companynumber: '90001', longaccount: '90001.1450', itemnumber: '', lot: '', periodends: '2025-06-30', creationdate: '1901-01-01', comm: 'Beg bal', runqty: 0, runamt: 0, qty: 0, val: 0 },
    { companynumber: '90001', longaccount: '90001.1460', itemnumber: 'TX-100', lot: 'L1', periodends: '2025-07-31', creationdate: '2025-07-15', comm: '', runqty: 1, runamt: 4.25, qty: 1, val: 4.25 }
];
const ONHAND = [
    { CompanyNumber: '90001', LongAccount: '90001.1450', ItemNumber: 'TX-100', Lot: 'L1', UOM: 'EA', Description: 'Widget', Quantity: 12, Amount: 51 },
    { CompanyNumber: '90001', LongAccount: '90001.1460', ItemNumber: 'TX-100', Lot: 'L1', UOM: 'EA', Description: 'Widget', Quantity: 1, Amount: 4.25 },
    { CompanyNumber: '90001', LongAccount: '90001.1450', ItemNumber: 'TX-100', Lot: 'L2', UOM: 'EA', Description: 'Widget', Quantity: 99, Amount: 999 },
    { CompanyNumber: '90001', LongAccount: '90001.1450', ItemNumber: 'TX-200', Lot: 'L1', UOM: 'EA', Description: 'Other', Quantity: 7, Amount: 70 }
];

/* ---- the assertions ---- */
function run(src, log) {
    let bad = 0;
    const c = (n, g, w) => { if (!check(n, g, w, log)) bad++; };
    const tx = buildTx(src.tx, src.config), as = buildAsof(src.asof, src.config), pg = buildPage(src.page);
    const T = tx.api, A = as.api, P = pg.api;

    // A: gates and routing, both pages.
    [['tx', tx], ['asof', as]].forEach(([n, b]) => {
        b.db = { m: { it: true }, t: { it: true } }; const on = b.api.hasModule();
        b.db = { m: { it: true } }; const noT = b.api.hasModule();
        b.db = { m: { it: false }, t: { it: true } }; const offM = b.api.hasModule();
        c('A1 ' + n + ': module = t.it AND m.it, fail closed on a token with no t block', [on, noT, offM], [true, false, false]);
    });
    c('A2 tx: details and save-notes route to the data services', [T._routesToTestAgent('in-transit/transactions/details'), T._routesToTestAgent('in-transit/transactions/save-notes'), T._routesToTestAgent('in-transit/transactions')], [true, true, true]);
    c('A2 asof: the roll, on hand and roll forward route to the data services', [A._routesToTestAgent('in-transit/as-of/details'), A._routesToTestAgent('in-transit/as-of'), A._routesToTestAgent('in-transit/reconciliation/rows')], [true, true, true]);
    tx.db = { m: { it: true }, t: { it: true }, perms: { ac: true } };
    const acctEdits = T.canEditNotes();
    tx.db = { m: { it: true }, t: { it: true }, perms: { dm: true } };
    c('A3 tx: notes are the analyst lane\'s (perms.dm), not the accountant\'s', [acctEdits, T.canEditNotes()], [false, true]);

    // B: transit-transactions.html request shapes.
    const db = T.detailsBody(Object.assign({}, LINE, { CompanyNumber: ' 90001 ', DT: 'OV ', DocNumber: '7700101' }));
    c('B1 details body is {company, doc, type}', Object.keys(db), ['company', 'doc', 'type']);
    c('B1 details values: company trimmed, doc a number, type trimmed', [db.company, db.doc, typeof db.doc, db.type], ['90001', 7700101, 'number', 'OV']);
    const n = T.transitNote(Object.assign({}, LINE, { Batch: '4401', DocNumber: '7700101', OrderNumber: '6600101' }), 1, '  checked  ');
    c('B2 a note carries TransitNote\'s nine fields', Object.keys(n), ['companyNumber', 'longAccount', 'batchNumber', 'docType', 'docNumber', 'orderType', 'orderNumber', 'worked', 'note']);
    c('B2 batchNumber, docNumber and orderNumber are numbers; worked a boolean; note trimmed', [typeof n.batchNumber, typeof n.docNumber, typeof n.orderNumber, n.worked, n.note], ['number', 'number', 'number', true, 'checked']);
    const rows = [LINE, Object.assign({}, LINE, { DocNumber: 7700102 }), Object.assign({}, LINE, { PeriodEnds: '2025-08-31T00:00:00', DocNumber: 7700103 })];
    const bodies = T.saveBodies(rows, true, 'n');
    c('B3 one save-notes body per period, each line under its own period', bodies.map((b) => [b.period, b.notes.map((x) => x.docNumber)]), [['2025-07-31', [7700101, 7700102]], ['2025-08-31', [7700103]]]);
    const keys = [LINE, Object.assign({}, LINE, { LongAccount: '90001.1460' }), Object.assign({}, LINE, { OrderNumber: 6600102 }), Object.assign({}, LINE, { PeriodEnds: '2025-08-31' }), Object.assign({}, LINE, { Batch: 4402 })].map(T.noteKey);
    c('B4 the note key tells apart lines that differ only in account, order, period or batch', new Set(keys).size, 5);

    // C: compare2 sections.
    const secs = T.sectionsOf(COMPARE2);
    c('C1 sections in the procedure\'s order, spacers and the DMAAIs title dropped', secs.map((s) => [s.id, s.rows.length]), [['transit', 1], ['gl', 1], ['rr', 1], ['pr', 1], ['aai', 2]]);
    c('C2 each total is its own section\'s footer, never a row', secs.map((s) => s.total ? s.total.Comment : null), ['Transit Total', 'GL Total', 'RR Total', null, null]);
    c('C3 the compare\'s row is the 3-RapRec line, its total the 3-RapRecT line', [secs[2].rows[0].Source, secs[2].total.Source], ['3-RapRec', '3-RapRecT']);
    c('C5 the detail shows the grid\'s sign, ledger less in transit (owner 2026-11-22): the RR total -1.00 reads 1.00, the GL total 50.00 reads -50.00',
      [secs[2].total.Variance, secs[1].total.Variance], [1, -50]);
    c('C6 the procedure\'s own rows are not changed by the flip', COMPARE2.find((r) => r.Source === '3-RapRecT').Variance, -1.00);
    const live = T.liveCols(secs[0]).map((x) => x[0]);
    c('C4 a column empty on every row of a section is left out; one with a value stays', [live.indexOf('Lot') < 0, live.indexOf('GLDate') < 0, live.indexOf('Qty') >= 0, live.indexOf('Variance') >= 0], [true, true, true, true]);

    // D: transit-asof.html.
    c('D1 roll body is {companyNumber, itemNumber, lot}', A.rollBody(' 90001', 'TX-100 ', ''), { companyNumber: '90001', itemNumber: 'TX-100', lot: '' });
    c('D2 comm reads as beginning, ending, exclusion or a ledger line', ROLL.map(A.rollKind), ['end', 'line', 'excl', 'line', 'beg', 'line']);
    c('D3 rows group by account in the procedure\'s order', A.rollAccounts(ROLL).map((g) => [g.account, g.rows.length]), [['90001.1450', 5], ['90001.1460', 1]]);
    c('D4 only ledger and exclusion lines after the period are dimmed', ROLL.map((r) => A.isAfter(r, '2025-07-31')), [false, true, false, false, false, false]);
    const oh = A.onHandOf(ONHAND);
    c('D5 the headline is On Hand\'s rows for this item and lot, summed', [oh.qty, oh.amt, oh.uom], [13, 55.25, 'EA']);

    // E: transit.html's links.
    const [txPage, txQ] = q(P.txDrillHref(LINE));
    c('E1 a document links to transit-transactions.html with its company, period, doc and type', [txPage, txQ], ['transit-transactions.html', { company: '90001', period: '2025-07-31', doc: '7700101', type: 'OV' }]);
    const [, allQ] = q(P.txDrillHref({}, true));
    c('E2 the Transaction Details button opens the page on the company and period, no document', allQ, { company: '90001', period: '2025-07-31' });
    const [ohPage, ohQ] = q(P.asofDrillHref({ CompanyNumber: '90001', ItemNumber: 'TX-100', Lot: 'L 1' }));
    c('E3 an item links to transit-asof.html with its company, item, lot and the period', [ohPage, ohQ], ['transit-asof.html', { company: '90001', item: 'TX-100', lot: 'L 1', period: '2025-07-31' }]);
    c('E4 the grids render those links (Doc on Transaction Variance, Item on On Hand)',
        [/k: 'DocNumber'[^\n]*esc\(txDrillHref\(r\)\)/.test(src.page), /k: 'ItemNumber'[^\n]*esc\(asofDrillHref\(r\)\)/.test(src.page)], [true, true]);
    return bad;
}

console.log('transit-transactions.html, transit-asof.html and transit.html as shipped:');
failures += run(SRC, true);

/* ---- mutation arms: each must turn at least one assertion red ---- */
function arm(name, which, from, to) {
    if (SRC[which].indexOf(from) < 0) { failures++; console.log('  FAIL arm "' + name + '": the text it mutates is gone (' + from + ')'); return; }
    const m = Object.assign({}, SRC); m[which] = SRC[which].replace(from, to);
    let bad;
    try { bad = run(m, false); } catch (e) { bad = 1; }
    if (bad > 0) console.log('  ok   arm "' + name + '" turns ' + bad + ' assertion(s) red');
    else { failures++; console.log('  FAIL arm "' + name + '" changed nothing: those assertions cannot fail'); }
}
console.log('mutation arms:');
arm('the detail keeps the procedure\'s sign', 'tx', 'var r = gridSign(r0);', 'var r = r0;');
arm('the flip changes the procedure\'s row in place', 'tx', 'var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });', 'var c = r;');
arm('tx: old-token fail-open', 'tx', 'a.t && a.t.it === true', '(!a.t || a.t.it !== false)');
arm('asof: old-token fail-open', 'asof', 'a.t && a.t.it === true', '(!a.t || a.t.it !== false)');
arm('in-transit/ missing from config.js', 'config', "  'in-transit/'", "  'not-in-transit/'");
arm('notes editable by the accountant lane', 'tx', 'function canEditNotes() { return canAnalyst(); }', 'function canEditNotes() { return true; }');
arm('details sends docType', 'tx', 'type: trim(r.DT) };', 'docType: trim(r.DT) };');
arm('details sends doc as text', 'tx', 'doc: Number(r.DocNumber)', 'doc: trim(r.DocNumber)');
arm('a note without its batch', 'tx', 'batchNumber: Number(r.Batch),', '');
arm('orderNumber sent as text', 'tx', 'orderNumber: Number(r.OrderNumber),', 'orderNumber: trim(r.OrderNumber),');
arm('every line saved under one period', 'tx', 'var p = isoDay(r.PeriodEnds);', "var p = '2025-07-31';");
arm('the note key drops the order', 'tx', ", trim(r.OT), trim(r.OrderNumber)].join('|');", ", trim(r.OT)].join('|');");
arm('the in-transit total read as a row', 'tx', "if (s === '002') return ['transit', 'total'];", "if (s === '002') return ['transit', 'row'];");
arm('the compare\'s row and total swapped', 'tx', "src === '3-RapRecT' ? ['rr', 'total']", "src === '3-RapRec' ? ['rr', 'total']");
arm('AAI spacer rows kept', 'tx', "return src ? ['aai', 'row'] : null;", "return ['aai', 'row'];");
arm('the DMAAIs title row kept', 'tx', "    if (s === '010') return ['pr', 'row'];", "    if (s === '010') return ['pr', 'row'];\n    if (s === '012') return ['aai', 'row'];");
arm('empty columns shown', 'tx', "return all.some(function (r) { return trim(r[c[0]]) !== ''; });", 'return true;');
arm('roll sends item, not itemNumber', 'asof', 'itemNumber: trim(item)', 'item: trim(item)');
arm('an exclusion read as a ledger line', 'asof', "    if (c.indexOf('exclusion') === 0) return 'excl';\n", '');
arm('the ending balance dimmed', 'asof', "(k === 'line' || k === 'excl') && ", '');
arm('the headline sums every lot', 'asof', ' && trim(r.Lot) === S.lot', '');
arm('the roll regrouped by item', 'asof', 'var a = trim(r.longaccount);', 'var a = trim(r.itemnumber);');
arm('a document link without its type', 'page', " + '&type=' + encodeURIComponent(trim(r.DT))", '');
arm('the button opens a document', 'page', 'if (!all) q +=', 'q +=');
arm('an item link without its lot', 'page', "'&lot=' + encodeURIComponent(trim(r.Lot)) + ", '');
arm('the Doc column no longer links', 'page', 'esc(txDrillHref(r))', "'#'");
arm('the Item column no longer links', 'page', 'esc(asofDrillHref(r))', "'#'");

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall In Transit drill-in assertions and arms pass');
process.exit(failures ? 1 : 0);
