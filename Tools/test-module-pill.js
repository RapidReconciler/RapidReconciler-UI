/* test-module-pill.js -- behaviour test for the Home module picker (2026-09-25).
 *
 *   node Tools/test-module-pill.js
 *
 * WHAT IT PINS. The bottom-cluster "Module: Inventory" pill lists, in V7's order,
 * Inventory (always, current, checked) and then In Transit and PO Receipts ONLY
 * when caps().it / caps().por are true -- i.e. the module is ticked on VALC Client
 * Details (m.it / m.por === true) AND the user holds the tab (t.it / t.por not
 * false). A listed-but-not-live module is a disabled button tagged "Coming soon".
 * A module that fails the gate is ABSENT from the markup, not rendered and hidden.
 *
 * WHY. UI-205 found three fail-opens in this exact gate the same day: `m.it !==
 * false` showed In Transit on an old token with no `m` block. The picker reads the
 * same caps(), so the old-token case is the one that matters, and the mutation arm
 * below puts that exact defect back and requires the suite to go red.
 *
 * SOURCE IS NOT RETYPED. caps(), activeDb(), esc(), _homeModules() and
 * _moduleMenuHtml() are sliced out of the shipping home.html and run in a vm
 * sandbox; only window.RR_SESSION is supplied.
 *
 * BLIND SPOTS, named:
 *   - No layout and no event dispatch: the open/close/Escape wiring in wire() is
 *     not exercised here (jsdom is not a dependency of this repo, and CI runs these
 *     files with bare node). The headless-Chrome measurement covers placement.
 *   - It proves renderModulePill() is CALLED from renderHaDb() by reading the
 *     source, not by running a DB switch.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');
const html = fs.readFileSync(SRC, 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

/* ---- slicing (same brace matcher as test-data-freshness.js) --------------- */
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
const FNS = ['esc', 'activeDb', 'caps', '_homeModules', '_currentModule', '_moduleMenuHtml'];

function load(src) {
    const sb = { console: console };
    sb.window = sb; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(FNS.map(n => extractFn(src, n)).join('\n'), sb, { filename: 'home.html:module-pill' });
    return sb;
}

/* ---- parse the rendered markup (a flat list of <button>s) ----------------- */
function options(markup) {
    const out = [];
    const RE = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
    let m;
    while ((m = RE.exec(markup)) !== null) {
        const attrs = m[1], body = m[2];
        const key = (/data-module="([^"]*)"/.exec(attrs) || [])[1];
        out.push({
            key,
            label: body.replace(/<span[\s\S]*?<\/span>/g, '').trim(),
            disabled: /\sdisabled(\s|=|$)/.test(attrs),
            soonTag: /<span class="ha-mod-soon-tag">Coming soon<\/span>/.test(body),
            active: /class="[^"]*\bis-active\b/.test(attrs),
            hiddenAttr: /\shidden(\s|=|$)/.test(attrs) || /display\s*:\s*none/.test(attrs)
        });
    }
    return out;
}
function db(m, t) {
    const d = { n: 'RapidReconciler_Test', ip: 'localhost:1' };
    if (m !== undefined) d.m = m;
    if (t !== undefined) d.t = t;
    return d;
}
function render(sb, entry) {
    sb.RR_SESSION = { dbs: [entry], activeDbIndex: 0 };
    return options(sb._moduleMenuHtml(sb.caps(), sb._currentModule()));
}
const keys = opts => opts.map(o => o.key);

/* ---- the suite: run against any source, return failure count -------------- */
function suite(src, quiet) {
    const before = failures;
    const log = console.log;
    if (quiet) console.log = function () {};
    try {
        const sb = load(src);
        const ALL = { inv: true, it: true, por: true, adm: true };

        // Inventory alone -- the ordinary customer today.
        let o = render(sb, db({ inv: true, it: false, por: false }, ALL));
        check('only Inventory licensed -> menu lists Inventory alone', keys(o), ['inv']);
        check('Inventory is the current module, marked active and enabled',
              [o[0].active, o[0].disabled, o[0].label], [true, false, 'Inventory']);

        // Both ticked and granted -> V7 order, both coming soon.
        o = render(sb, db({ inv: true, it: true, por: true }, ALL));
        check('both ticked + granted -> Inventory, In Transit, PO Receipts (V7 order)', keys(o), ['inv', 'it', 'por']);
        check('In Transit is disabled with a Coming soon tag',
              [o[1].label, o[1].disabled, o[1].soonTag, o[1].active], ['In Transit', true, true, false]);
        check('PO Receipts is disabled with a Coming soon tag',
              [o[2].label, o[2].disabled, o[2].soonTag, o[2].active], ['PO Receipts', true, true, false]);
        check('no option is hidden-in-place (absent means absent)', o.some(x => x.hiddenAttr), false);

        // One ticked.
        check('only In Transit ticked -> PO Receipts absent', keys(render(sb, db({ it: true, por: false }, ALL))), ['inv', 'it']);
        check('only PO Receipts ticked -> In Transit absent', keys(render(sb, db({ it: false, por: true }, ALL))), ['inv', 'por']);

        // Ticked but not granted.
        check('ticked on Client Details but user not granted -> absent',
              keys(render(sb, db({ it: true, por: true }, { inv: true, it: false, por: false }))), ['inv']);

        // THE OLD TOKEN: no m block at all. Must fail CLOSED for it/por.
        check('old token with no m block -> only Inventory', keys(render(sb, db(undefined, undefined))), ['inv']);
        check('m block without it/por keys -> only Inventory', keys(render(sb, db({ inv: true }, ALL))), ['inv']);

        // Control: the gate is not simply "never show them" -- a string 'true' is
        // not a tick (VALC emits booleans), but a real true must show.
        check('control: m.it === "true" (string) is not a tick', keys(render(sb, db({ it: 'true' }, ALL))), ['inv']);
        check('control: m.it === true with t.it absent (grant not denied) shows', keys(render(sb, db({ it: true }, { inv: true }))), ['inv', 'it']);
    } catch (e) {
        failures++;
        console.log('  FAIL suite could not run: ' + (e && e.stack ? e.stack : e));
    } finally {
        console.log = log;
    }
    return failures - before;
}

console.log('=== module picker: which modules appear, and how ===');
suite(html, false);

/* ---- wiring: renderModulePill runs with the DB picker (boot + every switch) - */
console.log('');
console.log('=== the picker re-renders with the database picker ===');
const haDb = extractFn(html, 'renderHaDb');
check('renderHaDb() calls renderModulePill()', /\brenderModulePill\(\)/.test(haDb), true);
const pill = extractFn(html, 'renderModulePill');
check('renderModulePill() reads the real caps()', /\bcaps\(\)/.test(pill), true);
check('the pill markup carries the "Module:" prefix',
      /<span id="haModPrefix">Module:<\/span>\s*<span id="haModLabel">Inventory<\/span>/.test(html), true);

/* ---- mutation arm: put UI-205's fail-open back, the suite must go red ------ */
console.log('');
console.log('=== mutation arm: the fail-open gate must be caught ===');
const GATE_IT = /\(m\.it\s*===\s*true\)/, GATE_POR = /\(m\.por\s*===\s*true\)/;
if (!GATE_IT.test(html) || !GATE_POR.test(html)) {
    failures++;
    console.log('  FAIL could not find the m.it / m.por === true gates in caps() to mutate');
} else {
    const capsSrc = extractFn(html, 'caps');
    const mutCaps = capsSrc.replace(GATE_IT, '(m.it !== false)').replace(GATE_POR, '(m.por !== false)');
    const mutant = html.replace(capsSrc, mutCaps);
    const saved = failures;
    const caught = suite(mutant, true);
    failures = saved;   // the mutant's failures are the expected outcome, not ours
    if (caught > 0) console.log('  ok   gate flipped to !== false -> ' + caught + ' assertion(s) went red');
    else { failures++; console.log('  FAIL gate flipped to !== false and the suite stayed green -- it cannot see the defect'); }
    // Second arm: render the hidden-in-place anti-pattern (a gated row emitted with
    // `hidden`) and require the absence assertions to catch it.
    const fnSrc = extractFn(html, '_moduleMenuHtml');
    const mut2 = fnSrc.replace(/return mod\.always \|\| \(c && c\[mod\.cap\] === true\);/, 'return true;');
    if (mut2 === fnSrc) { failures++; console.log('  FAIL could not find the filter in _moduleMenuHtml to mutate'); }
    else {
        const saved2 = failures;
        const caught2 = suite(html.replace(fnSrc, mut2), true);
        failures = saved2;
        if (caught2 > 0) console.log('  ok   filter removed (every module emitted) -> ' + caught2 + ' assertion(s) went red');
        else { failures++; console.log('  FAIL filter removed and the suite stayed green'); }
    }
}

console.log('');
if (failures) { console.log(failures + ' FAILURE(S)'); process.exit(1); }
console.log('PASS');
