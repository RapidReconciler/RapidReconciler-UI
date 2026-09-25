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
 * ASSERTION 2 -- THE SINK IS REACHABLE, TOP-RIGHT, ON ALL THREE VIEWS (owner
 * ruling 2026-09-25: "Top right on all 3 views"). #haFresh must be a DIRECT child
 * of #roleHero -- the hero row every role's view starts with -- and outside every
 * per-role .role-hero-item, so the one element shows on the admin, analyst and
 * accountant views alike. It must NOT sit inside #adminGrid, #instanceHealth or
 * #view-admin (admin-gated), nor back in the bottom action cluster #homeActions
 * (its pre-2026-09-25 home, now the Module pill's slot). The CSS must lay the hero
 * out as a row with the pill pushed to its right edge; no stylesheet rule may hide
 * the pill for any role; and _paintFreshPill() must un-hide it without consulting
 * the view or the grant. The regression is not a crash or a wrong string, it is
 * someone tidying the pill somewhere a role cannot see it, and nothing else fails.
 *
 * ASSERTION 2 HAS CONTROLS. Each rule is run against a mutated copy of home.html
 * that reintroduces one way of breaking it (pill moved back into the cluster,
 * into one role's hero item, into #adminGrid, hidden by a role-scoped CSS rule,
 * hidden by _paintFreshPill for one role, right-edge rule removed), and every
 * mutant must be caught. A placement check only ever run on correct markup is
 * untested.
 *
 * SOURCE IS NOT RETYPED. The function is sliced out of the shipping HTML and the
 * ancestor walk runs over the shipping markup. Neither can drift from what ships.
 *
 * BLIND SPOTS, named:
 *   - No layout engine. "Top-right, no overlap" is proven by structure + CSS here
 *     and by a headless-Chrome measurement (element boxes at 1366x768, 1920x1080
 *     and ~820px) when the placement changes -- not on every CI run. A rule that
 *     hides #roleHero itself, or an ancestor further up, would pass here;
 *     Tools/test-hidden-override.js covers the [hidden] half of that.
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

/* ---- 2. the sink is reachable, top-right, on every role's view ------------ */
console.log('');
console.log('=== the freshness sink sits top-right of the hero, for all three roles ===');

const SINK = 'haFresh';
const HOST = 'roleHero';
const ADMIN_ONLY = ['adminGrid', 'instanceHealth', 'view-admin'];
const CLUSTER = 'homeActions';

// Tag-level walk over the markup, skipping <script>/<style> bodies, tracking the
// id of every open ancestor. Enough to answer "what is this element nested in".
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                      'link', 'meta', 'param', 'source', 'track', 'wbr']);
// Returns the open-ancestor stack as [{tag, id, cls}], outermost first, or null.
function ancestorsOf(src, wantedId) {
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
        const clm = /\bclass\s*=\s*["']([^"']*)["']/.exec(attrs);
        const cls = clm ? clm[1].split(/\s+/).filter(Boolean) : [];
        if (id === wantedId) return stack.slice();
        if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, id, cls });
    }
    return null;   // not found
}
function styleText(src) {
    let out = '';
    const RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let m;
    while ((m = RE.exec(src)) !== null) out += m[1] + '\n';
    return stripCssComments(out);
}
// CSS comment strip that skips quoted strings, so a "/*" inside content: "..."
// cannot pair with the wrong delimiter (test-comment-stripper-safety.js).
function stripCssComments(css) {
    let out = '', i = 0;
    while (i < css.length) {
        const c = css[i];
        if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*' + '/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
        if (c === '"' || c === "'") {
            const q = c; out += c; i++;
            while (i < css.length) { out += css[i]; if (css[i] === '\\') { out += css[i + 1] || ''; i += 2; continue; } if (css[i] === q) { i++; break; } i++; }
            continue;
        }
        out += c; i++;
    }
    return out;
}
// Every CSS rule as {sel, body}. Flattens @media blocks (their inner rules still
// apply at some width, and "hidden at 820px" is still hidden for a role).
function cssRules(css) {
    const out = [];
    const RE = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = RE.exec(css)) !== null) out.push({ sel: m[1].trim().replace(/^@media[^{]*$/, ''), body: m[2] });
    return out;
}

// The placement rules, as a function of the source so the controls can run it
// against mutants. Returns a list of problems; empty = placement is right.
function placementProblems(src) {
    const p = [];
    const anc = ancestorsOf(src, SINK);
    if (anc === null) {
        p.push('#' + SINK + ' is not in home.html at all -- every role is back to guessing how old the data is (UI-13).');
        return p;
    }
    const ids = anc.map(a => a.id).filter(Boolean);
    const parent = anc[anc.length - 1] || {};
    const badAdmin = ids.filter(a => ADMIN_ONLY.indexOf(a) >= 0);
    if (badAdmin.length) p.push('#' + SINK + ' sits inside ' + badAdmin.join(', ') + ' -- admin-gated, so an accountant or analyst would not see it.');
    if (ids.indexOf(CLUSTER) >= 0) p.push('#' + SINK + ' is back in the bottom action cluster #' + CLUSTER + ' -- that slot is the Module pill; freshness lives top-right (owner 2026-09-25).');
    if (parent.id !== HOST) p.push('#' + SINK + '\'s parent is ' + (parent.id ? '#' + parent.id : '<' + parent.tag + (parent.cls && parent.cls.length ? ' class="' + parent.cls.join(' ') + '"' : '') + '>') + ', not #' + HOST + ' -- it must be a direct child of the hero row to sit top-right.');
    if (anc.some(a => a.cls && a.cls.indexOf('role-hero-item') >= 0)) p.push('#' + SINK + ' is inside a .role-hero-item -- those are per-role (display:none for the other views), so some role loses it.');

    const rules = cssRules(styleText(src));
    const hero = rules.filter(r => /(^|,)\s*\.role-hero\s*(,|$)/.test(r.sel));
    if (!hero.some(r => /display\s*:\s*flex/.test(r.body))) p.push('.role-hero is not a flex row -- the pill cannot be pushed to its right edge.');
    const edge = rules.filter(r => /\.role-hero\s*>\s*\.ha-fresh|#roleHero\s*>\s*#haFresh|#roleHero\s*>\s*\.ha-fresh/.test(r.sel));
    if (!edge.some(r => /margin-left\s*:\s*auto/.test(r.body))) p.push('no rule pushes the pill to the hero\'s right edge (.role-hero > .ha-fresh { margin-left: auto }).');
    // Any rule that could hide the pill, other than the plain [hidden] reset.
    rules.forEach(r => {
        r.sel.split(',').map(s => s.trim()).forEach(s => {
            if (!/(\.ha-fresh|#haFresh)(?![\w-])/.test(s)) return;
            if (/(\.ha-fresh|#haFresh)\s+[.#\w]/.test(s.replace(/^.*?(\.ha-fresh|#haFresh)/, '$1'))) return;   // targets a descendant, not the pill
            if (/^\.ha-fresh\[hidden\]$/.test(s)) return;
            if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?![.\d])/.test(r.body)) p.push('CSS rule `' + s + '` hides the pill (' + r.body.trim() + ').');
        });
    });

    let paint;
    try { paint = sliceBlock(src, src.indexOf('\n  function _paintFreshPill(') + 1); } catch (e) { paint = ''; }
    if (!paint) p.push('_paintFreshPill() not found.');
    else {
        if (!/pill\.hidden\s*=\s*false/.test(paint)) p.push('_paintFreshPill() never un-hides the pill (pill.hidden = false).');
        const gate = /\b(_viewRole|isAdmin|canAnalyst|canAccountant|_entitledRole|caps)\s*\(/.exec(paint);
        if (gate) p.push('_paintFreshPill() consults ' + gate[1] + '() -- the pill shows for every role, so it must not gate on view or grant.');
    }
    return p;
}

const problems = placementProblems(html);
if (problems.length) problems.forEach(msg => fail('placement', msg));
else {
    const anc = ancestorsOf(html, SINK);
    console.log('  ok   #' + SINK + ' ancestors: ' + anc.map(a => a.id ? '#' + a.id : a.tag).join(' > '));
    console.log('  ok   direct child of #' + HOST + ', outside every .role-hero-item (all three views)');
    console.log('  ok   not in #' + CLUSTER + ' / ' + ADMIN_ONLY.map(a => '#' + a).join(' / '));
    console.log('  ok   hero is a flex row and the pill is pushed right (margin-left: auto)');
    console.log('  ok   no CSS rule hides it, and _paintFreshPill() un-hides it for every role');
}

/* ---- 2b. controls: every way of breaking the placement must be caught ----- */
console.log('');
console.log('=== controls: each placement mutant is caught ===');
const PILL_RE = /\n[ \t]*<div class="ha-fresh" id="haFresh"[\s\S]*?<\/div>/;
const pillMarkup = (PILL_RE.exec(html) || [''])[0];
function movePill(src, anchorRe, where) {
    const without = src.replace(PILL_RE, '');
    return without.replace(anchorRe, m => where === 'after' ? m + pillMarkup : pillMarkup + m);
}
const MUTANTS = [
    ['pill moved back into the bottom cluster', src =>
        movePill(src, /<div class="home-actions" id="homeActions"[^>]*>/, 'after')],
    ['pill moved into the admin hero item only', src =>
        movePill(src, /<div class="role-hero-item" data-role="admin">/, 'after')],
    ['pill moved into #adminGrid', src =>
        movePill(src, /<div class="lower-grid" id="adminGrid">/, 'after')],
    ['pill hidden for the analyst by a role-scoped rule', src =>
        src.replace('</style>', '  body[data-view-role="analyst"] #haFresh { display: none; }\n</style>')],
    ['pill hidden for the accountant at a narrow width', src =>
        src.replace('</style>', '  @media (max-width: 900px) { body[data-view-role="accountant"] .ha-fresh { display: none; } }\n</style>')],
    ['_paintFreshPill hides it for admins', src =>
        src.replace(/(\n  function _paintFreshPill\(\) \{\r?\n)/, '$1    if (_viewRole() === \'admin\') return;\n')],
    ['right-edge rule removed', src =>
        src.replace(/\.role-hero > \.ha-fresh \{[^}]*\}/, '')],
];
if (!pillMarkup) fail('controls', 'could not find the #haFresh markup to move -- the controls cannot run');
else {
    MUTANTS.forEach(([name, mutate]) => {
        const mutant = mutate(html);
        if (mutant === html) { fail('control: ' + name, 'the mutation did not apply -- the control is not testing anything'); return; }
        const got = placementProblems(mutant);
        if (got.length) console.log('  ok   control caught: ' + name + ' -> ' + got[0].slice(0, 90) + (got[0].length > 90 ? '…' : ''));
        else fail('control: ' + name, 'the mutant passed ASSERTION 2 -- the assertion cannot see this regression');
    });
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
