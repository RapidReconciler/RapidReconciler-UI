/* test-dmaai-facts.js -- the analyst's transaction-variance facts carry THIS customer's
 * own AAI routing, scoped and bounded (UI-25).
 *
 *   node Tools/test-dmaai-facts.js
 *
 * WHY THIS EXISTS. UI-24's grounding tells the model what an AAI MEANS -- "3120 is Work in
 * Process". That is generic and true everywhere. What makes a root-cause read specific is
 * where THIS customer's 3120 actually points, so the answer moves from "the leg should be
 * in WIP" to "this customer's 3120 resolves to 9999998.146363, which is why the leg landed
 * there".
 *
 * THE WHOLE RISK IS VOLUME. `v_integrity_jde_aais` holds 15,808 rows on Demo1, and the row
 * that commissioned this said plainly: never dump the universe -- tokens and dilution. So
 * the projection narrows three times, and each narrowing is asserted here because losing
 * any one of them re-introduces the dump quietly, in a prompt nobody reads:
 *   1. the ACTIVE COMPANY only;
 *   2. only the modules carrying residual -- `System` on the AAI view is exactly
 *      _TXV_MODS, so the join needs no mapping table and cannot silently mis-map;
 *   3. grain is the AAI NUMBER, not the row. Measured on Demo1 company 80002: 42 AAI
 *      numbers against 367 distinct AAI-to-account pairs, and the number is what an
 *      analyst reasons with.
 *
 * WHAT THIS ASSERTS.
 *   A1  The projection filters on company AND on the module set it is handed.
 *   A2  Grain is the AAI number, and an AAI resolving to more than three accounts is
 *       SUMMARISED rather than listed -- that is what keeps 17 accounts out of a prompt
 *       while still saying the routing is class-dependent, which is the finding on several
 *       cards.
 *   A3  Scrub mode does not leak account numbers. The analyst AI has a masked tier and a
 *       real account number is exactly what it exists to withhold.
 *   4   A cold or empty cache produces NO fact at all. An absent fact is honest; a fact
 *       built from nothing is a routing the model would reason with and cite.
 *   A5  The warm-up reads the EXISTING per-DB cache key rather than inventing a second
 *       one, and is triggered on entry to the Transaction Variance tab.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');
const code = html.replace(/^[ \t]*\/\/.*$/gm, '');   // line comments only -- UI-170

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

/* Lift the projection out of the page and run it for real, rather than asserting on its
 * source text. A regex can confirm a filter is written; only executing it confirms the
 * filter works. */
function sliceFn(name) {
    const at = code.indexOf('\n  function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found in home.html');
    let depth = 0, i = code.indexOf('{', at);
    const start = at + 1;
    for (; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') { depth--; if (depth === 0) return code.slice(start, i + 1); }
    }
    throw new Error('unbalanced braces in ' + name);
}

console.log('test-dmaai-facts.js (UI-25)');

// Stand the function up with a stub cache. dmaaiRows/dmaaiCacheKey/sessionStorage are the
// page's, so they are supplied here at their real shapes.
let CACHE = null;
const sandbox = {
    sessionStorage: { getItem: () => (CACHE === null ? null : JSON.stringify(CACHE)) },
    dmaaiCacheKey: () => 'k',
    dmaaiRows: p => (p && Array.isArray(p.data) ? p.data : (Array.isArray(p) ? p : [])),
    Date: Date, Object: Object, String: String, Number: Number, JSON: JSON, console: console
};
const src = sliceFn('_dmaaiCacheEntry') + '\n' + sliceFn('_dmaaiFactsFor')
          + '\nreturn { entry: _dmaaiCacheEntry, facts: _dmaaiFactsFor };';
const api = new Function('sessionStorage', 'dmaaiCacheKey', 'dmaaiRows', src)(
    sandbox.sessionStorage, sandbox.dmaaiCacheKey, sandbox.dmaaiRows);

function row(co, sys, aai, bu, obj, sub) {
    return { CompanyNumber: co, System: sys, TableNumber: aai, BusUnit: bu, Object: obj, Sub: sub };
}

/* ---- A1: company and module filtering ------------------------------------------- */
CACHE = { ts: Date.now(), payload: { data: [
    row('80002', 'Manufacturing', 3120, '9999998', '146363', ''),
    row('80005', 'Manufacturing', 3120, 'OTHERCO', '999999', ''),   // wrong company
    row('80002', 'Sales',         4230, '9999841', '824999', '')    // module not in scope
] } };
let out = api.facts('80002', ['Manufacturing'], false);
check('A1 keeps only the active company and the modules in scope',
      out && out.lines, ['Manufacturing: 3120 -> 9999998.146363']);

/* ---- A2: AAI-number grain, and many accounts get summarised --------------------- */
CACHE = { ts: Date.now(), payload: { data: [
    row('80002', 'Manufacturing', 3110, 'A', '1', ''), row('80002', 'Manufacturing', 3110, 'B', '2', ''),
    row('80002', 'Manufacturing', 3110, 'C', '3', ''), row('80002', 'Manufacturing', 3110, 'D', '4', ''),
    row('80002', 'Manufacturing', 3120, 'E', '5', '')
] } };
out = api.facts('80002', ['Manufacturing'], false);
check('A2 four accounts on one AAI are summarised, not listed',
      out.lines[0].indexOf('3110 -> 4 accounts (varies by GL class or cost type)') > -1, true);
check('A2 a single-account AAI is still named outright',
      out.lines[0].indexOf('3120 -> E.5') > -1, true);

/* ---- A3: scrub mode withholds the account -------------------------------------- */
CACHE = { ts: Date.now(), payload: { data: [row('80002', 'Manufacturing', 3120, '9999998', '146363', '')] } };
out = api.facts('80002', ['Manufacturing'], true);
check('A3 scrubbed output does not contain the account number',
      out.lines.join(' ').indexOf('9999998') === -1, true);

/* ---- A4: a cold cache produces NOTHING ------------------------------------------ */
CACHE = null;
check('A4 cold cache yields no fact', api.facts('80002', ['Manufacturing'], false), null);
CACHE = { ts: Date.now(), payload: { data: [] } };
check('A4 empty cache yields no fact', api.facts('80002', ['Manufacturing'], false), null);
CACHE = { ts: Date.now(), payload: { data: [row('80002', 'Manufacturing', 3120, 'A', '1', '')] } };
check('A4 a company with nothing in scope yields no fact',
      api.facts('80002', ['Sales'], false), null);

/* ---- A5: warms the EXISTING cache, on the right trigger ------------------------- */
check('A5 the warm-up reads dmaaiCacheKey, not a new key',
      /_dmaaiCacheEntry[\s\S]{0,200}sessionStorage\.getItem\(dmaaiCacheKey\(\)/.test(code), true);
check('A5 it reuses loadDmaaisNow rather than a parallel fetch',
      /_ensureDmaaiWarm[\s\S]{0,600}loadDmaaisNow\(\s*\{\s*auto:\s*true\s*\}\s*\)/.test(code), true);
check('A5 it fires on entry to the Transaction Variance tab',
      /sv === 'txvar'\s*\)\s*\{\s*_ensureDmaaiWarm\(\);/.test(code), true);
check('A5 a stale cache is re-warmed rather than trusted',
      /_DMAAI_MAX_AGE_MS/.test(code), true);
check('A5 the facts builder is actually called from _analystTxFacts',
      /_dmaaiFactsFor\(co,\s*stats\.rankedAll/.test(code), true);

console.log(failures === 0
    ? 'test-dmaai-facts.js PASSED'
    : 'test-dmaai-facts.js FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
