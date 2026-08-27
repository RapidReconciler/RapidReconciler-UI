/* test-data-freshness.js -- behaviour test for the Home data-freshness line (UI-13).
 *
 *   node Tools/test-data-freshness.js
 *
 * WHY THIS EXISTS. The whole product is a tie-out against JD Edwards. If last
 * night's import failed, every figure on Home is stale, and a variance that is
 * purely an artifact of the stale data looks exactly like a real one. The person
 * doing the tie-out has to be able to see the age of what they are tying out to.
 *
 * Until 2026-08-27 they could not. The figure had THREE sinks and every one of
 * them was out of reach for an accountant or an analyst:
 *
 *   #sysPill        the header pill -- inside `.app-header { display: none }`,
 *                   which retired the topbar for EVERY role. Invisible to all.
 *   #dataRefreshRow the admin instance-health chip -- behind isAdmin(), and
 *                   attention-only even for an admin.
 *   _dbRefresh      renders via renderDbMeta() into #dbMeta, and there is no
 *                   element with that id anywhere in the repo. A no-op.
 *
 * Three producers, three vocabularies, zero readers. That is what this test locks
 * down, and it does it with two assertions because the row has two ways to break.
 *
 * ASSERTION 1 -- THE MAPPING. _dataFreshness() is now the ONE producer: every
 * surface reads it. It is sliced out of home.html at run time and driven through
 * each shape /poll returns. The failed and empty cases are the point: those are
 * the states where the analyst most needs to be told something, and they are the
 * ones a "if success, show the date" implementation quietly gets wrong.
 *
 * ASSERTION 2 -- THE SINK IS REACHABLE. #haFresh must NOT sit inside #adminGrid
 * or #instanceHealth. This is the assertion that makes UI-13 closeable: the
 * regression is not a crash or a wrong string, it is someone tidying the pill
 * back into the admin cluster, at which point two thirds of the users silently
 * lose the figure again and nothing anywhere fails. Parsing the markup and
 * walking the element's ancestors is the only way to catch that.
 *
 * SOURCE IS NOT RETYPED. The function is sliced out of the shipping HTML and the
 * ancestor walk runs over the shipping markup. Neither can drift from what ships.
 *
 * BLIND SPOTS, named:
 *   - It does not prove the pill is VISIBLE, only that it is not inside an
 *     admin-gated container. A future `display: none` on .home-actions would pass
 *     here (that is exactly how #sysPill died) -- Tools/test-hidden-override.js
 *     covers the [hidden] half of that, and the rest needs human eyes.
 *   - It does not prove _paintFreshPill() is CALLED on every path that changes
 *     _jobStatus. It checks the mapping and the placement, not the wiring.
 *   - It cannot tell whether the timestamp /poll returns is itself correct.
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
function fail(name, detail) {
    failures++;
    console.log('  FAIL ' + name);
    if (detail) console.log('         ' + String(detail).split('\n').join('\n         '));
}

/* ---- slice the producer out of home.html --------------------------------- */
// Brace-matched, so a nested object literal does not end the block early.
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

const sb = { console: console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
try {
    // _fmtAsOf comes along because _dataFreshness formats the success case with it.
    vm.runInContext(extractFn('_fmtAsOf') + '\n' + extractFn('_dataFreshness') + '\n'
                    + 'var _jobStatus = "", _refreshWhen = "";', sb,
                    { filename: 'home.html:_dataFreshness' });
} catch (e) {
    console.error('FAIL could not load the sliced functions: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
}
if (typeof sb._dataFreshness !== 'function') {
    console.error('FAIL _dataFreshness missing after slicing home.html');
    process.exit(1);
}
function freshness(status, when) {
    sb._jobStatus = status;
    sb._refreshWhen = when === undefined ? '' : when;
    return sb._dataFreshness();
}

/* ---- 1. the mapping ------------------------------------------------------ */
console.log('=== every /poll job status maps to the right level and sentence ===');

// The status strings are v_diagnostic5_job_status values, matched case-insensitively
// and by prefix in the producer -- so the real-world "Success" and a padded
// "success (14232 rows)" both land on the same branch.
check('success WITH a timestamp names the date, not the time',
      freshness('Success', 'Jun 23 2026 12:43PM'),
      { level: 'ok', text: 'Data as of Jun 23, 2026' });
check('success with no timestamp still says something true',
      freshness('Success', ''),
      { level: 'ok', text: 'Data up to date' });
check('lowercase / suffixed status still matches (prefix + case-insensitive)',
      freshness('success - 1,284,102 rows', 'Jun 23 2026 12:43PM'),
      { level: 'ok', text: 'Data as of Jun 23, 2026' });
check('in progress',
      freshness('In Progress', 'Jun 23 2026 12:43PM'),
      { level: 'busy', text: 'Refreshing now' });

// THE TWO THAT MATTER. A failed refresh means the numbers on screen may be stale,
// and it must NOT fall through to the success branch just because _refreshWhen
// still holds the last good timestamp.
check('failed does not print a stale timestamp as if it were current',
      freshness('Failed', 'Jun 23 2026 12:43PM'),
      { level: 'attention', text: 'Last refresh failed' });
check('cancelled reads the same as failed -- nothing landed either way',
      freshness('Cancelled', 'Jun 23 2026 12:43PM'),
      { level: 'attention', text: 'Last refresh failed' });
check('an install that has never imported says so',
      freshness('Not Found', ''),
      { level: 'unknown', text: 'No refresh yet' });
check('an unrecognised status is unknown, never silently OK',
      freshness('Weird New State', 'Jun 23 2026 12:43PM'),
      { level: 'unknown', text: 'No refresh yet' });
check('before /poll answers, say checking -- not a claim either way',
      freshness('', ''),
      { level: 'busy', text: 'Checking…' });

/* ---- 2. the sink is reachable by a non-admin ----------------------------- */
console.log('');
console.log('=== the freshness sink is not inside an admin-gated container ===');

const SINK = 'haFresh';
const ADMIN_ONLY = ['adminGrid', 'instanceHealth', 'view-admin'];

// Tag-level walk over the markup, skipping <script>/<style> bodies, tracking the
// id of every open ancestor. Enough to answer "what is this element nested in".
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                      'link', 'meta', 'param', 'source', 'track', 'wbr']);
function ancestorIdsOf(src, wantedId) {
    const clean = src.replace(/<!--[\s\S]*?-->/g, '');
    const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    const stack = [];
    let m;
    while ((m = TAG.exec(clean)) !== null) {
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const attrs = m[3] || '';
        if (!closing && (tag === 'script' || tag === 'style')) {
            const end = clean.toLowerCase().indexOf('</' + tag, TAG.lastIndex);
            TAG.lastIndex = end < 0 ? clean.length : end;
            continue;
        }
        if (closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].tag === tag) { stack.length = i; break; }
            }
            continue;
        }
        const idm = /\bid\s*=\s*["']([^"']+)["']/.exec(attrs);
        const id = idm ? idm[1] : null;
        if (id === wantedId) return stack.map(e => e.id).filter(Boolean);
        if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, id });
    }
    return null;   // not found
}

const ancestors = ancestorIdsOf(html, SINK);
if (ancestors === null) {
    fail('#' + SINK + ' is not in home.html at all',
         'The freshness figure has no sink. Every role is back to guessing how old\n'
       + 'the data is -- which is the whole of UI-13.');
} else {
    const bad = ancestors.filter(a => ADMIN_ONLY.indexOf(a) >= 0);
    if (bad.length) {
        fail('#' + SINK + ' sits inside ' + bad.join(', '),
             'ancestors: ' + (ancestors.join(' > ') || '(top level)') + '\n'
           + 'Those containers are admin-gated, so an accountant or an analyst would\n'
           + 'not see the freshness line -- which is the state UI-13 was raised for.');
    } else {
        console.log('  ok   #' + SINK + ' ancestors: ' + (ancestors.join(' > ') || '(top level)'));
    }
}

/* ---- 3. one producer, not four ------------------------------------------ */
// The defect that made this row necessary was three independent mappings from the
// same two variables, disagreeing with each other. Each branch sentence must be
// authored exactly ONCE in home.html; a second occurrence is a second producer.
console.log('');
console.log('=== one producer: each branch sentence is authored exactly once ===');
// COMMENTS ARE STRIPPED FIRST. A comment that QUOTES a branch sentence -- and the
// ones above _dataFreshness quote several, explaining what the old copies said --
// is documentation, not a second producer. Counting raw occurrences would make the
// test fail on its own explanation, which is the fastest way to get a test deleted.
function codeOnly(src) {
    let s = src.replace(/<!--[\s\S]*?-->/g, '');
    // Strip JS comments, skipping over string and template literals.
    let out = '', i = 0;
    while (i < s.length) {
        const c = s[i], n = s[i + 1];
        if (c === '/' && n === '/') { const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue; }
        if (c === '/' && n === '*') { const e = s.indexOf('*/', i); i = e < 0 ? s.length : e + 2; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; out += c; i++;
            while (i < s.length) {
                if (s[i] === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
                out += s[i];
                if (s[i] === q) { i++; break; }
                i++;
            }
            continue;
        }
        out += c; i++;
    }
    return out;
}
const code = codeOnly(html);
for (const phrase of ['Refreshing now', 'Last refresh failed', 'No refresh yet', 'Data up to date']) {
    const n = code.split(phrase).length - 1;
    if (n === 1) { console.log('  ok   "' + phrase + '" appears once'); }
    else {
        fail('"' + phrase + '" appears ' + n + ' times in home.html',
             'A second copy of a branch sentence is a second producer, and the two\n'
           + 'will drift. Route the other surface through _dataFreshness() instead.');
    }
}

console.log('');
if (failures) {
    console.log(failures + ' FAILURE(S)');
    process.exit(1);
}
console.log('PASS');
