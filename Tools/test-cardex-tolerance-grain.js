/* test-cardex-tolerance-grain.js -- behaviour test for the two-grain cardex
 * materiality tolerance (UI-161).
 *
 *   node Tools/test-cardex-tolerance-grain.js
 *
 * WHY THIS EXISTS. Cardex drift is never truly zero in steady state, so the Cardex
 * Variance status is judged against a materiality tolerance rather than against
 * zero. That tolerance used to be per company only. It is now per company AND per
 * item, which introduces two ways to be wrong that did not exist before.
 *
 * ASSERTION 1 -- PRECEDENCE, THE SAME RULE EVERY TIME. An item-level tolerance
 * beats the company-level one for that item. cxTolOf is sliced out of the shipping
 * inventory-cardex-variance.html and driven through every case, including the two
 * that a "take the larger" or "take the smaller" implementation gets wrong: a
 * LOOSER item override must win, and so must a TIGHTER one. Precedence is about
 * whose decision it is, not about which number is safer. The strict fallback and
 * the cross-company case are here too -- an override belonging to another company
 * leaking into this one would suppress a real variance and look like nothing.
 *
 * ASSERTION 2 -- HOME MUST NOT READ AN ITEM OVERRIDE AS A COMPANY THRESHOLD.
 * Both grains arrive in ONE array from GET /inventory/cardex-tolerance. Home judges
 * at company+account grain (CardexVar), which has no item to match against, so it
 * filters to item === ''. Without that filter whichever item row happened to come
 * last would overwrite the company's own threshold: one item's generous override
 * would quietly relax the company dot for every account, and a tighter one would
 * turn the dot red for a reason no number on screen could explain. This drives the
 * shipping loadCardexTolerance with a mixed-grain payload and reads the map it
 * builds. It is the assertion that makes the widening safe.
 *
 * ASSERTION 3 -- ONE RULE, RESTATED WHEREVER IT IS IMPLEMENTED. The precedence
 * sentence has to appear in the table DDL, the agent repository, the agent
 * controller, the API doc and the client resolver. This is not documentation
 * hygiene: two grains that disagree silently is the failure mode, and the only
 * cheap guard is that every place implementing the rule also states it, so a
 * change to one is visibly a change to a rule rather than to a line of code.
 *
 * ASSERTION 4 -- AN OVERRIDE THAT CANNOT BE SEEN CANNOT BE REVIEWED. cxTolOverrides
 * lists the item-level rows for one company and must exclude the company default
 * (which is not an override) and every other company's rows.
 *
 * SOURCE IS NOT RETYPED. Both functions are sliced out of the shipping HTML.
 *
 * BLIND SPOTS, named:
 *   - It does not prove the band RENDERS the tolerance legibly, only that the
 *     value and grain are resolved correctly and that the markup exists.
 *   - It does not exercise the agent. The SQL precedence was verified separately
 *     against RapidReconciler_Demo1 with real rows.
 *   - It cannot tell whether a tolerance is the RIGHT number. Nothing can; that is
 *     why the override carries an audit stamp and gets listed for review.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CXV = path.join(__dirname, '..', 'RRV8', 'inventory-cardex-variance.html');
const HOME = path.join(__dirname, '..', 'RRV8', 'home.html');
const API = path.join(__dirname, '..', 'RRV8', 'API.md');
const AGENT = path.join(__dirname, '..', '..', 'RapidReconciler-Agent');
const DB = path.join(__dirname, '..', '..', 'RapidReconciler-DB');

const cxv = fs.readFileSync(CXV, 'utf8');
const home = fs.readFileSync(HOME, 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
    failures++;
}

function slice(src, header, file) {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith(header));
    if (start < 0) throw new Error('could not find `' + header + '` in ' + file);
    const indent = lines[start].match(/^\s*/)[0];
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i] === indent + '}') return lines.slice(start, i + 1).join('\n');
    }
    throw new Error('could not find the end of `' + header + '`');
}

/* ---- assertion 1: precedence -------------------------------------------- */
console.log('assertion 1 -- an item override wins, whichever way it points');

const keyFn = slice(cxv, 'function _cxTolKey(co, item)', 'inventory-cardex-variance.html');
const tolFn = slice(cxv, 'function cxTolOf(co, item)', 'inventory-cardex-variance.html');
const ovrFn = slice(cxv, 'function cxTolOverrides(co)', 'inventory-cardex-variance.html');

// One company with a default of 100, a LOOSER override, a TIGHTER override; plus a
// second company whose override must never be visible from the first.
const MAP = {
    '80002|':        { tol: 100, by: 'arthur', at: '2026-08-01T00:00:00Z' },
    '80002|WIDGET1': { tol: 500, by: 'arthur', at: '2026-08-20T00:00:00Z' },
    '80002|WIDGET2': { tol: 5,   by: 'dana',   at: '2026-08-25T00:00:00Z' },
    '80003|WIDGET1': { tol: 999, by: 'dana',   at: '2026-08-26T00:00:00Z' }
};
function ctx() {
    const sandbox = { _cxTol: JSON.parse(JSON.stringify(MAP)), String, Number, Object };
    vm.createContext(sandbox);
    vm.runInContext(keyFn + '\n' + tolFn + '\n' + ovrFn, sandbox);
    return sandbox;
}
const S = ctx();
const resolve = (co, item) => vm.runInContext(
    'cxTolOf(' + JSON.stringify(co) + ',' + JSON.stringify(item) + ')', S);

check('a LOOSER item override beats the company default',
    resolve('80002', 'WIDGET1'), { tol: 500, grain: 'item', by: 'arthur', at: '2026-08-20T00:00:00Z' });
check('a TIGHTER item override also beats it (precedence is not "take the safer")',
    resolve('80002', 'WIDGET2'), { tol: 5, grain: 'item', by: 'dana', at: '2026-08-25T00:00:00Z' });
check('an item with no override falls back to the company default',
    resolve('80002', 'WIDGET9'), { tol: 100, grain: 'company', by: 'arthur', at: '2026-08-01T00:00:00Z' });
check('no row at either grain is strict, not permissive',
    resolve('89999', 'WIDGET1'), { tol: 0, grain: 'strict', by: '', at: '' });
check('another company\'s override never leaks in',
    resolve('80003', 'WIDGET1'), { tol: 999, grain: 'item', by: 'dana', at: '2026-08-26T00:00:00Z' });
check('...and that company has no default of its own to fall back to',
    resolve('80003', 'WIDGET9'), { tol: 0, grain: 'strict', by: '', at: '' });
check('a blank item resolves to the company default, never to an item row',
    resolve('80002', ''), { tol: 100, grain: 'company', by: 'arthur', at: '2026-08-01T00:00:00Z' });

/* ---- assertion 2: Home filters the item grain out ----------------------- */
console.log('assertion 2 -- Home reads company-level rows only');

const loadFn = slice(home, 'function loadCardexTolerance()', 'home.html');
const payload = { data: [
    { company: '80002', item: '',        tolerance: 100 },
    { company: '80002', item: 'WIDGET1', tolerance: 500 },
    // Deliberately LAST, and deliberately the largest: with no filter this is the
    // value that would end up standing in for the company's own threshold.
    { company: '80002', item: 'WIDGET2', tolerance: 9999 },
    { company: '80004', item: 'WIDGET3', tolerance: 250 }
] };
const hs = {
    _cardexTol: {},
    applyInventoryLight: function () {},
    String, Number,
    // A synchronous thenable, so the whole function runs before the next line.
    rrFetch: function () {
        return { then: function (cb) { cb(payload); return { catch: function () {} }; } };
    }
};
vm.createContext(hs);
vm.runInContext(loadFn + '\nloadCardexTolerance();', hs);
check('only the company-level row lands in the Home map',
    vm.runInContext('_cardexTol', hs), { '80002': 100 });
check('a company with ONLY item overrides gets no company threshold at all',
    vm.runInContext('Object.prototype.hasOwnProperty.call(_cardexTol, "80004")', hs), false);

/* ---- assertion 3: one rule, stated wherever it is implemented ----------- */
console.log('assertion 3 -- the precedence rule is stated at every implementation');

const RULE = /item-level\s+(row|tolerance)\s+BEATS?\s+the\s+company-level/i;
const sites = [
    ['the SSDT table', path.join(DB, 'RapidReconciler', 'dbo', 'Tables', 'RCardexTolerance.sql')],
    ['the setup DDL', path.join(AGENT, 'setup', 'sql', 'create-cardex-tolerance-table.sql')],
    ['the agent repository', path.join(AGENT, 'src', 'main', 'java', 'coral', 'rapidreconciler',
        'client', 'services', 'repository', 'CardexToleranceRepository.java')],
    ['the agent controller', path.join(AGENT, 'src', 'main', 'java', 'coral', 'rapidreconciler',
        'client', 'services', 'controller', 'CardexToleranceController.java')]
];
sites.forEach(([label, p]) => {
    if (!fs.existsSync(p)) { console.log('  ..   ' + label + ' not present beside this repo -- skipped'); return; }
    check(label + ' states the precedence rule', RULE.test(fs.readFileSync(p, 'utf8')), true);
});
check('the client resolver states it', RULE.test(cxv), true);
check('API.md states it', RULE.test(fs.readFileSync(API, 'utf8')), true);

/* ---- assertion 4: overrides are enumerable ------------------------------ */
console.log('assertion 4 -- every override for a company can be listed');

const listed = vm.runInContext('cxTolOverrides("80002")', S);
check('the company default is NOT listed as an override',
    listed.map(o => o.item), ['WIDGET2', 'WIDGET1']);   // most recently set first
check('each listed override carries its audit stamp',
    listed.every(o => o.by && o.at), true);
check('another company\'s overrides are not listed',
    vm.runInContext('cxTolOverrides("80003").map(function(o){return o.item;})', S), ['WIDGET1']);

// Visible where it acts -- the band, not a settings page the analyst never opens.
check('the scope band carries the tolerance and its grain',
    /id="cxTolVal"[\s\S]{0,200}id="cxTolSub"/.test(cxv), true);
check('the band says when an item is being suppressed',
    /within tolerance &mdash; this item is being suppressed/.test(cxv), true);
check('a failed tolerance read does NOT render as "strict"',
    /not read &mdash; /.test(cxv), true);

console.log(failures === 0
    ? '\nPASS -- item beats company, Home stays at company grain, and every override is visible.'
    : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
