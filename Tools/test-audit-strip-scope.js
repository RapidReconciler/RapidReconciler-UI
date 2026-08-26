/* test-audit-strip-scope.js -- behaviour test for _auditStripScope (UI-155).
 *
 *   node Tools/test-audit-strip-scope.js
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-audit-strip-scope.js
 *
 * WHY THIS EXISTS. The Audit Center card already prints the company as a pill and the
 * panel is already filtered to a period, so a detail that opens 'Co 80003 - 2026-02-28
 * - ...' restates two things on screen either side of it. _auditStripScope removes that
 * scope prose. Its failure mode is not a crash -- it is DELETING SIGNAL: the helper it
 * leans on, _auditIsoPeriod, matches a date ANYWHERE in a string, so a naive
 * period test classifies 'reclassified 42,258.57 on 2026-02-28' as scope and drops the
 * whole clause. The card still renders, just missing the only part worth reading.
 * parsecheck cannot see that, and neither can a rail walk.
 *
 * SOURCE IS NOT RETYPED. Both functions are sliced out of RRV8/home.html at run time,
 * so this test cannot drift from what ships.
 *
 * DETAIL SHAPES ARE REAL, not invented. Every string marked (recorded) below was read
 * out of RapidReconciler-Demo/bundle/recording-demo2.json on 2026-08-26, from the
 * GET /admin/activity?limit=200 bodies. Note that they use THREE different separators
 * (middot, spaced hyphen, em dash) and put the scope at EITHER end -- which is why the
 * pre-UI-155 version, splitting on middot only and stripping only from the front,
 * stripped nothing at all from the accountant's own row.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');

// Brace-matched slice, so a nested function or an object literal inside the body does
// not end the block early. Skips strings, template literals and both comment forms.
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

function extractFn(src, name) {
    const at = src.indexOf('\n  function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found in home.html');
    return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');

// _auditStripScope calls _auditIsScopeSeg; nothing here touches the DOM.
// _auditIsoPeriod comes along because the month table it reads sits beside it and the
// two are meant to accept the same date shapes -- see the comment on _auditIsScopeSeg.
const MONTHS = html.slice(html.indexOf('  var _AUD_MON = '),
                          html.indexOf('\n', html.indexOf('  var _AUD_MON = ')) + 1);
const src = MONTHS
    + extractFn(html, '_auditIsoPeriod') + '\n'
    + extractFn(html, '_auditIsScopeSeg') + '\n'
    + extractFn(html, '_auditStripScope') + '\n';

const sb = { console: console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
try {
    vm.runInContext(src, sb, { filename: 'home.html:_auditStripScope' });
} catch (e) {
    console.error('FAIL could not load the sliced functions: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
}
const strip = sb._auditStripScope;
if (typeof strip !== 'function') {
    console.error('FAIL _auditStripScope missing after slicing home.html');
    process.exit(1);
}

let failures = 0;
function check(name, got, want) {
    if (got === want) { console.log('  ok   ' + name); return; }
    console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got)
                                 + '\n         want ' + JSON.stringify(want));
    failures++;
}

// ---- the row UI-155 was raised for --------------------------------------------
console.log('leading scope, spaced-hyphen separator');
check('(recorded) accountant journal entry keeps only the clause',
      strip('Co 80003 - 2026-02-28 - reclassified 42,258.57 off the inventory accounts to the A/P accrual'),
      'reclassified 42,258.57 off the inventory accounts to the A/P accrual');

// ---- trailing scope, which the pre-fix version never touched -------------------
console.log('trailing scope');
check('(recorded) middot separator, company then period at the end',
      strip('4 transactions marked worked \u2014 Period Mismatch \u00b7 Co 80013 \u00b7 Feb 28, 2026'),
      '4 transactions marked worked \u2014 Period Mismatch');
check('(recorded) spaced-hyphen separator, company then period at the end',
      strip('8 transactions marked worked - Inventory DMAAI Net Zero - Co 80003 - 2026-02-28'),
      '8 transactions marked worked - Inventory DMAAI Net Zero');
check('(recorded) the 101-row variant',
      strip('101 transactions marked worked - A/P Voucher on Inventory - Co 80003 - 2026-02-28'),
      '101 transactions marked worked - A/P Voucher on Inventory');

// ---- THE REGRESSION THIS TEST EXISTS FOR --------------------------------------
// _auditIsoPeriod matches a date anywhere in a string. If _auditIsScopeSeg is ever
// rewritten to test it for truthiness instead of anchoring, these two lose their
// entire message and the card renders a company name over nothing.
console.log('signal is never deleted (the reason _auditIsScopeSeg anchors)');
check('a clause that MENTIONS a date is not scope',
      strip('Co 80003 - reclassified 42,258.57 on 2026-02-28 to the A/P accrual'),
      'reclassified 42,258.57 on 2026-02-28 to the A/P accrual');
check('a clause that mentions a company is not scope',
      strip('2026-02-28 - offset against Co 80004 in the same period'),
      'offset against Co 80004 in the same period');

// ---- separators must not split inside a value ---------------------------------
console.log('spaced hyphen only');
check('an ISO date is not split by its own hyphens',
      strip('2026-02-28'), '2026-02-28');
check('a negative amount survives',
      strip('Co 80003 - adjusted -1,234.00 against the accrual'),
      'adjusted -1,234.00 against the accrual');

// ---- degenerate inputs --------------------------------------------------------
console.log('degenerate input');
check('scope-only detail still renders something, never an empty line',
      strip('Co 80003 - 2026-02-28'), '2026-02-28');
check('no scope at all is returned whole',
      strip('reclassified 42,258.57 off the inventory accounts'),
      'reclassified 42,258.57 off the inventory accounts');
check('empty', strip(''), '');
check('null', strip(null), '');
check('undefined', strip(undefined), '');

// ---- the pre-fix behaviour, stated so a revert is caught ----------------------
// Before UI-155 the helper split on middot only and shifted from the front, so the
// accountant's own row -- hyphen-separated -- came back byte-identical. If this
// assertion ever fails by returning the input unchanged, that version is back.
console.log('regression guard');
const acct = 'Co 80003 - 2026-02-28 - reclassified 42,258.57 off the inventory accounts to the A/P accrual';
check('the accountant row is not returned unchanged', strip(acct) === acct, false);

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('all _auditStripScope assertions passed');
