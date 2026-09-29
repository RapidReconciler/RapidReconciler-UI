/* test-wz-checks.js -- behaviour test for the Administrator Welcome step's checks (UI-206).
 *
 *   node Tools/test-wz-checks.js
 *
 * WHY THIS EXISTS. The Welcome step of the V8 onboarding wizard showed "Already
 * handled for you" with three green ticks written into the page. On the rehearsal
 * database (2026-09-29) two of them were false: no company was licensed (the broker
 * logged an empty company list, the agent refused the owner's own requests for "no
 * allowed companies") and no refresh had ever run (the pill top-right of the same
 * screen said "No refresh yet"). The dangerous case is a real customer whose licence
 * table is empty (the VLC-91 failure): that screen would still have ticked it.
 *
 * The ticks are now built by wzChecks() from the figures other sinks already show:
 * _dataFreshness() (the pill's producer) and _wzLic (the Licensing card's
 * /license-usage answer). This test slices the REAL functions out of home.html and
 * drives them through each state. The point is the negative cases: a tick only when
 * the fact is true.
 *
 * MUTATION ARM. The last block puts the old behaviour back IN MEMORY (the licence
 * line always "ok") and requires the rehearsal case to fail. A check that has only
 * ever run on fixed code is untested.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

// Brace-matched slice, so a nested object literal does not end the block early.
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
function extractFn(name) {
    const at = html.indexOf('\n  function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found in home.html');
    return sliceBlock(html, at + 1);
}

function load(wzChecksSource) {
    const sb = { console: console };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(
        extractFn('esc') + '\n' + extractFn('_fmtAsOf') + '\n' + extractFn('_dataFreshness') + '\n'
        + wzChecksSource + '\n' + extractFn('wzCheckRows') + '\n'
        + 'var _jobStatus = "", _refreshWhen = "", _wzLic = null;'
        + 'var CK_OK = "[ok]", CK_WARN = "[warn]", CK_PEND = "[pend]";',
        sb, { filename: 'home.html:wzChecks' });
    return sb;
}
function run(sb, jobStatus, when, lic) {
    sb._jobStatus = jobStatus; sb._refreshWhen = when || ''; sb._wzLic = lic;
    const items = sb.wzChecks();
    return { refresh: items[0], lic: items[1], dmaai: items[2], all: items };
}

let sb;
try { sb = load(extractFn('wzChecks')); }
catch (e) { console.error('FAIL could not load the sliced functions: ' + (e && e.stack ? e.stack : e)); process.exit(1); }

console.log('=== the rehearsal database: nothing refreshed, nothing licensed ===');
let r = run(sb, 'Not Run', '', { state: 'none', used: 0 });
check('refresh is NOT ticked', r.refresh.lv, 'warn');
check('refresh names the state', r.refresh.l, 'No data refresh has run on this database yet');
check('licences are NOT ticked', r.lic.lv, 'warn');
check('licences name the state', r.lic.l, 'No companies are licensed on this database yet');
check('the one true-by-construction line stays ticked', r.dmaai.lv, 'ok');

console.log('=== a healthy database ===');
r = run(sb, 'Success', '2026-09-28T02:00:00', { state: 'ok', used: 3 });
check('refresh ticked', r.refresh.lv, 'ok');
check('licences ticked', r.lic.lv, 'ok');
check('licence line carries this database\'s count', /^3 companies licensed on this database/.test(r.lic.s), true);
check('one company is singular', run(sb, 'Success', '', { state: 'ok', used: 1 }).lic.s.indexOf('1 company licensed') === 0, true);

console.log('=== still waiting, failed, unreadable ===');
r = run(sb, '', '', null);
check('no /poll answer yet is pending, not a tick', r.refresh.lv, 'pend');
check('no licence answer yet is pending, not a tick', r.lic.lv, 'pend');
check('a refresh in progress is pending', run(sb, 'In Progress', '', null).refresh.lv, 'pend');
r = run(sb, 'Failed', '', { state: 'error' });
check('a failed refresh is not ticked', r.refresh.lv, 'warn');
check('a failed refresh says so', r.refresh.l, 'The last data refresh failed');
check('an unreadable licence answer is not ticked', r.lic.lv, 'warn');
check('an unreadable licence answer says so', r.lic.l, 'Your company licenses could not be checked');

console.log('=== markup ===');
const rows = sb.wzCheckRows([{ lv: 'warn', l: '<b>x</b>', s: 'a & b' }]);
check('text is escaped', rows.indexOf('<b>x</b>') < 0 && rows.indexOf('&lt;b&gt;') >= 0 && rows.indexOf('a &amp; b') >= 0, true);
check('the row carries its level for the amber style', / class="wz-ai warn"/.test(rows), true);
check('a warn row gets the warn icon, not the tick', rows.indexOf('[warn]') >= 0 && rows.indexOf('[ok]') < 0, true);

console.log('=== MUTATION: the old always-green licence line must be caught ===');
const src = extractFn('wzChecks');
const mutated = src.replace("else if (_wzLic.state === 'ok')", "else if (true)");
if (mutated === src) {
    failures++;
    console.log('  FAIL the mutation did not apply (the licence branch moved); update this arm');
} else {
    const m = run(load(mutated), 'Not Run', '', { state: 'none', used: 0 });
    check('with the old behaviour back, the rehearsal case WOULD show a tick (so the check above is live)', m.lic.lv, 'ok');
}

console.log(failures === 0 ? 'test-wz-checks.js PASSED' : 'test-wz-checks.js FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
