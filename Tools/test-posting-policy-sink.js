/* test-posting-policy-sink.js -- behaviour test for the per-customer GL posting
 * policy on the Transaction Details scope band (UI-167).
 *
 *   node Tools/test-posting-policy-sink.js
 *
 * WHY THIS EXISTS. R31802A can be set to summarize manufacturing GL entries by
 * account ACROSS work orders, and the subledger processing option does not apply
 * to summarized entries. At a summarizing customer one F0911 line covers many
 * item-ledger rows, so the 1:1 document pairing EVERY cardex-versus-GL figure on
 * that page rests on does not exist -- and Completion Not Journaled fires because
 * its GL search counts only rows with a numeric work-order subledger and
 * therefore cannot SEE a summarized completion. Nothing on any screen said which
 * policy was in force, so the numbers rendered without meaning what the analyst
 * read them as.
 *
 * A DETECTION WITH NO VISIBLE SINK IS NOT A REPORT, and this codebase has the
 * scars. UI-13's freshness figure had three sinks and all three were dead: one
 * inside `.app-header { display: none }`, one admin-only AND attention-only, one
 * rendering into an element that is not in the DOM anywhere. RTxvPreemptedSignal
 * shipped with no reader at all. So most of this file is about the sink, not the
 * mapping.
 *
 * ASSERTION 1 -- THE STATE RESOLVER. _txPolicyState() is sliced out of the
 * shipping page and driven through every shape the view can return. The cases
 * that matter are the ones a "read the first row" implementation gets wrong:
 * all-companies must report the WORST state (one summarizing company makes every
 * manufacturing figure in a combined view a pairing question), and an absent or
 * failed load must resolve to NOTHING rather than to Detail.
 *
 * ASSERTION 2 -- THE FIELD IS EMITTED UNCONDITIONALLY. paintScopeBand() rebuilds
 * the band's innerHTML on every repaint, and the GL-posting field must not sit
 * behind a condition the way Period / Card / Account do. A field that appears
 * only when there is something to say cannot report the state where there is
 * nothing to say, which is the state this row exists to stop being silent about.
 *
 * ASSERTION 3 -- THE SINK IS REACHABLE. #tx-scope-band must exist in the markup,
 * must not sit inside any collapsible / gated container, and no CSS rule may hide
 * it or the field inside it. This is the assertion that makes UI-167 closeable:
 * the regression is not a crash, it is someone tidying the field into
 * #tx-analyzer-body (which opens collapsed) or #tx-disclose (which is hidden when
 * its slice is empty), at which point the fact silently stops arriving and
 * nothing else fails.
 *
 * ASSERTION 4 -- THE PAINTER IS WIRED. paintScopeBand() must call
 * _paintPolicyField(), and the late-landing fetch must repaint. A producer whose
 * painter is never called is the #dbMeta defect again.
 *
 * SOURCE IS NOT RETYPED. Every function is sliced out of the shipping HTML and
 * every structural check runs over the shipping markup and CSS.
 *
 * BLIND SPOTS, named:
 *   - It does not prove the field is VISIBLE. It proves the container is not
 *     gated and nothing declares it display:none. A layout that pushes the band
 *     off screen would pass here. That needs human eyes.
 *   - It does not prove the AGENT returns the view, only that the page asks for
 *     the right report name. The DB side is gated by
 *     RapidReconciler-DB/tests/ui167-posting-policy.sql.
 *   - It says nothing about whether the customer's real policy is what the view
 *     reports. That is the SQL gate's job.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'inventory-transactions.html');
const html = fs.readFileSync(SRC, 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}
function ok(name) { console.log('  ok   ' + name); }
function fail(name, detail) {
    failures++;
    console.log('  FAIL ' + name);
    if (detail) console.log('         ' + String(detail).split('\n').join('\n         '));
}

/* ---- slice the resolver out of the page --------------------------------- */
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
// Handles `async function` too -- the loaders on this page are async, and looking
// only for a bare `function` silently reports them as absent.
function extractFn(name) {
    let at = html.indexOf('\n  function ' + name + '(');
    if (at < 0) at = html.indexOf('\n  async function ' + name + '(');
    if (at < 0) throw new Error('function ' + name + ' not found in ' + path.basename(SRC));
    return sliceBlock(html, at + 1);
}

const sb = { console: console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
try {
    // _coKey comes along because the resolver normalises company codes through it --
    // CompanyNumber is nchar(5) and arrives space-padded, activeCompany does not.
    vm.runInContext(extractFn('_coKey') + ';\n' + extractFn('_txPolicyState')
                    + '\nvar _txPolicyRows = null, _state = { activeCompany: "" };', sb,
                    { filename: 'inventory-transactions.html:_txPolicyState' });
} catch (e) {
    console.error('FAIL could not load the sliced resolver: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
}
if (typeof sb._txPolicyState !== 'function') {
    console.error('FAIL _txPolicyState missing after slicing the page');
    process.exit(1);
}
// DOES NOT TRIM THE RESULT. An earlier draft did, and that masked a real defect:
// the per-company branch returned SummarizationState raw, and it is nchar(12)
// server-side. _paintPolicyField compares it to bare literals and stamps it into a
// data-policy attribute the CSS selects on, so a padded value renders every install
// as "Not tested" in the default colour with nothing raising. The resolver has to
// return the trimmed state itself, so the test asserts exactly what it returns.
function resolve(rows, co) {
    sb._txPolicyRows = rows;
    sb._state.activeCompany = co === undefined ? '' : co;
    const r = sb._txPolicyState();
    return r ? { state: r.state, note: r.note } : null;
}

// Fixtures use fictional company codes. Notes are stand-ins for the sentence the
// view authors -- this test asserts which row's note is CHOSEN, never its wording.
const DETAIL  = { CompanyNumber: '00100', SummarizationState: 'Detail',     PolicyNote: 'note-detail' };
const SUMM    = { CompanyNumber: '00200', SummarizationState: 'Summarized', PolicyNote: 'note-summarized' };
const NOMFG   = { CompanyNumber: '00300', SummarizationState: 'NoMfg',      PolicyNote: 'note-nomfg' };

console.log('=== the state resolver ===');

check('a drilled company reads its own row',
      resolve([DETAIL, SUMM, NOMFG], '00100'), { state: 'Detail', note: 'note-detail' });
check('a drilled summarizing company reads Summarized',
      resolve([DETAIL, SUMM, NOMFG], '00200'), { state: 'Summarized', note: 'note-summarized' });
check('a drilled company with no manufacturing reads NoMfg, never Detail',
      resolve([DETAIL, SUMM, NOMFG], '00300'), { state: 'NoMfg', note: 'note-nomfg' });

// nchar(5) PADDING. A shorter company code arrives space-padded from the view while
// activeCompany is a trimmed URL string, so a strict === matches nothing and the field
// falls to its em-dash on every install with a short company code -- looking exactly
// like a fetch that has not landed. _coKey on both sides is the fix, and the grid filter
// carries the same warning at _coKey's own definition.
check('a space-padded CompanyNumber still matches the drilled company',
      resolve([{ CompanyNumber: '900  ', SummarizationState: 'Summarized', PolicyNote: 'note-pad' }], '900'),
      { state: 'Summarized', note: 'note-pad' });

// nchar(12) PADDING ON THE STATE ITSELF. _paintPolicyField compares the returned
// state to bare literals and stamps it into a data-policy attribute the CSS selects
// on, so a padded value renders as "Not tested" on an install that is summarizing
// -- the worst possible direction for this field to be wrong in, and it raises
// nothing. The resolver must hand back the trimmed state on BOTH branches.
check('a space-padded state is trimmed on the per-company branch',
      resolve([{ CompanyNumber: '00100', SummarizationState: 'Summarized  ', PolicyNote: 'note-pad2' }], '00100'),
      { state: 'Summarized', note: 'note-pad2' });
check('a space-padded state is trimmed on the all-companies branch',
      (resolve([{ CompanyNumber: '00100', SummarizationState: 'Detail      ', PolicyNote: 'note-pad3' }], '') || {}).state,
      'Detail');

// THE ONE THAT MATTERS MOST. A "first row wins" or "majority wins" resolver would
// report Detail for this scope, and every manufacturing figure on screen beside it
// would read as a one-to-one comparison that is not one.
const allCo = resolve([DETAIL, DETAIL, SUMM, NOMFG], '');
check('all companies reports the WORST state, not the first row and not the majority',
      allCo && allCo.state, 'Summarized');
if (allCo && allCo.note && allCo.note.indexOf('00200') >= 0) {
    ok('all companies names the summarizing company so the analyst knows where to look');
} else {
    fail('all companies does not name the summarizing company',
         'note was: ' + JSON.stringify(allCo && allCo.note) + '\n'
       + 'A combined view that says "summarized" without saying WHICH company sends\n'
       + 'the analyst hunting through every company on the grid.');
}
check('all companies with no summarizing company still prefers NoMfg over Detail',
      (resolve([DETAIL, NOMFG], '') || {}).state, 'NoMfg');

// THE FAILURE PATH. The sibling DMAAI loader shipped the opposite of this: a
// failed load returned an empty object, the panel read it as a SUCCESSFUL load
// with no mismatches, and printed "all match the cardex model" off a lookup that
// never happened. An unanswered question has to resolve to nothing.
check('a load that has not happened resolves to nothing, never to Detail',
      resolve(null, ''), null);
check('a load that returned no rows resolves to nothing, never to Detail',
      resolve([], ''), null);
check('a company with no row of its own resolves to nothing, never to Detail',
      resolve([DETAIL], '00999'), null);

/* ---- the field is emitted unconditionally ------------------------------- */
console.log('');
console.log('=== the GL posting field is emitted on every repaint, in every state ===');

// COMMENTS ARE STRIPPED BEFORE ANY OF THE STRUCTURAL CHECKS BELOW, and this is not
// tidiness. paintScopeBand's own comment says "Filled by _paintPolicyField() at the
// end of this function", so a raw indexOf found the call in the EXPLANATION and
// passed with the call itself deleted -- measured 2026-08-28, the control that
// caught it. A test that its own documentation can satisfy is not a test.
function codeOnly(src) {
    let out = '', i = 0;
    while (i < src.length) {
        const c = src[i], n = src[i + 1];
        if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
        if (c === '/' && n === '*') { const e = src.indexOf('*/', i); i = e < 0 ? src.length : e + 2; continue; }
        if (c === '"' || c === "'" || c === '`') {
            const q = c; out += c;
            for (i++; i < src.length; i++) {
                out += src[i];
                if (src[i] === '\\') { i++; if (i < src.length) out += src[i]; continue; }
                if (src[i] === q) { i++; break; }
            }
            continue;
        }
        out += c; i++;
    }
    return out;
}

const paint = codeOnly(extractFn('paintScopeBand'));
const FIELD_ID = 'tx-scope-glpost';

if (paint.indexOf(FIELD_ID) < 0) {
    fail('paintScopeBand does not emit #' + FIELD_ID,
         'The band is rebuilt wholesale by this function, so a field it does not emit\n'
       + 'does not exist. UI-167 is back to a detection with nowhere to land.');
} else {
    // Every OPTIONAL field in this function is emitted inside an `if (...)`. The
    // policy field must not be: the state where there is nothing to say ("Not
    // tested") is exactly the state that must not read as "Detail" by omission.
    const lines = paint.split('\n');
    const at = lines.findIndex(l => l.indexOf(FIELD_ID) >= 0);
    const line = lines[at] || '';
    if (/^\s*if\s*\(/.test(line) || /\bif\s*\([^)]*\)\s*html\s*\+=[^;]*tx-scope-glpost/.test(line)) {
        fail('#' + FIELD_ID + ' is emitted conditionally',
             'line: ' + line.trim() + '\n'
           + 'A conditional field cannot report the NoMfg state, and a company whose\n'
           + 'policy is untested would render identically to one confirmed as Detail.');
    } else {
        ok('#' + FIELD_ID + ' is emitted unconditionally');
    }
    if (paint.indexOf('_paintPolicyField()') >= 0) {
        ok('paintScopeBand calls _paintPolicyField(), so a repaint re-states the fact');
    } else {
        fail('paintScopeBand does not call _paintPolicyField()',
             'The field would be emitted and then never filled -- the #dbMeta defect,\n'
           + 'where four producers rendered into an element nobody painted.');
    }
}

// The late fetch must repaint. Without this the field sits on its em-dash for the
// life of the tab whenever the agent is slower than the first render.
const preload = (() => { try { return codeOnly(extractFn('preloadPostingPolicy')); } catch (_) { return ''; } })();
if (!preload) {
    fail('preloadPostingPolicy() is not in the page', 'Nothing fetches the policy at all.');
} else if (preload.indexOf('paintScopeBand()') < 0) {
    fail('preloadPostingPolicy does not repaint the band',
         'A slow agent would leave the field on its em-dash permanently.');
} else {
    ok('preloadPostingPolicy repaints the band when the fetch lands');
}
if (preload && preload.indexOf('v8ui_txv_posting_policy') < 0
           && html.indexOf('v8ui_txv_posting_policy') < 0) {
    fail('the page never names the report v8ui_txv_posting_policy',
         'The Agent serves this endpoint by view name out of ALLOWED_VIEWS; a wrong\n'
       + 'or missing name returns a 400 the page swallows into a console warning.');
} else {
    ok('the page asks for report v8ui_txv_posting_policy');
}

/* ---- the sink is reachable ---------------------------------------------- */
console.log('');
console.log('=== the sink is not gated, collapsed or hidden ===');

// Tag-level walk over the markup, tracking the id of every open ancestor.
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
        if (id === wantedId) return { ancestors: stack.map(e => e.id).filter(Boolean), attrs: attrs };
        if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push({ tag, id });
    }
    return null;
}

const BAND = 'tx-scope-band';
// Containers on this page that would swallow the fact. The two analyzer ones are
// the real risk: #tx-analyzer-body is `hidden` in the markup and opens collapsed
// by design, and #tx-disclose is hidden whenever its slice carries nothing.
const UNREACHABLE = ['tx-analyzer', 'tx-analyzer-body', 'tx-analyzer-ai', 'tx-disclose',
                     'tx-findings', 'details-card', 'view-admin', 'adminGrid', 'instanceHealth'];

const found = ancestorIdsOf(html, BAND);
if (found === null) {
    fail('#' + BAND + ' is not in the page at all',
         'The posting policy has no sink. UI-167 is open again.');
} else {
    const bad = found.ancestors.filter(a => UNREACHABLE.indexOf(a) >= 0);
    if (bad.length) {
        fail('#' + BAND + ' sits inside ' + bad.join(', '),
             'ancestors: ' + (found.ancestors.join(' > ') || '(top level)'));
    } else {
        ok('#' + BAND + ' ancestors: ' + (found.ancestors.join(' > ') || '(top level)'));
    }
    if (/\bhidden\b/.test(found.attrs)) {
        fail('#' + BAND + ' carries the hidden attribute in the markup',
             'attrs: ' + found.attrs.trim());
    } else {
        ok('#' + BAND + ' is not hidden in the markup');
    }
}

// No CSS rule may hide the band or the field. This is how #sysPill died: the
// element was fine, the producer was fine, and one `display: none` on an ancestor
// made the whole thing invisible to every role with nothing failing.
const styles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n');
const KILLERS = [
    { re: /\.tx-scope-band[^{]*\{[^}]*display\s*:\s*none/i, what: '.tx-scope-band' },
    { re: /#tx-scope-band[^{]*\{[^}]*display\s*:\s*none/i,  what: '#tx-scope-band' },
    { re: /#tx-scope-glpost[^{]*\{[^}]*display\s*:\s*none/i, what: '#tx-scope-glpost' },
    { re: /\.tx-scope-item[^{]*\{[^}]*display\s*:\s*none/i, what: '.tx-scope-item' },
    { re: /\.tx-scope-v[^{]*\{[^}]*display\s*:\s*none/i,    what: '.tx-scope-v' }
];
let killed = KILLERS.filter(k => k.re.test(styles));
if (killed.length) {
    fail('a CSS rule hides the sink: ' + killed.map(k => k.what).join(', '),
         'This is the #sysPill failure exactly -- a live producer painting into an\n'
       + 'element that no role can see, with nothing anywhere reporting a problem.');
} else {
    ok('no display:none rule reaches the band, the item or the field');
}

// The consequence note is allowed to be hidden -- it is shown for Summarized only,
// on purpose -- but it MUST declare its own [hidden] rule, or `hidden = true` does
// nothing on a flex child. That is a real defect this repo has already shipped
// once (.ihs-chip[hidden] had to be added before el.hidden did anything).
if (/\.tx-scope-note\[hidden\]\s*\{[^}]*display\s*:\s*none/i.test(styles)) {
    ok('.tx-scope-note declares its own [hidden] rule, so hiding it actually works');
} else {
    fail('.tx-scope-note has no [hidden] { display: none } rule',
         'On a flex child the hidden attribute alone does nothing, so the note would\n'
       + 'render its empty box on every install that is NOT summarizing.');
}

/* ---- the card copy stops claiming "not tested" -------------------------- */
console.log('');
console.log('=== the Completion Not Journaled bullet stops saying "not tested" ===');

const cfg = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'config.js'), 'utf8');
if (/summarizationIdx\s*:\s*\d+/.test(cfg)) {
    ok('config.js carries summarizationIdx, so the bullet is addressable at render');
} else {
    fail('config.js has no summarizationIdx',
         'The card would keep telling the analyst summarization was "not tested" on an\n'
       + 'install where the tool has measured it. A false caveat is worse than none:\n'
       + 'it sends the analyst to Oracle over a pairing gap.');
}
const wpp = (() => { try { return codeOnly(extractFn('_withPostingPolicy')); } catch (_) { return ''; } })();
if (!wpp) {
    fail('_withPostingPolicy is not in the page', 'Nothing rewrites the bullet.');
} else {
    // The Detail verdict must LEAVE the "Not tested on these rows" section, and the
    // Summarized verdict must LEAD. Both are about which heading the text renders
    // under, which is the half of this that a wording change cannot fix.
    if (/context\s*:\s*ctx/.test(wpp) && /ctx\.splice\(/.test(wpp)) {
        ok('a verdict removes the bullet from the not-tested section');
    } else {
        fail('_withPostingPolicy does not remove the bullet from context',
             'It would render under "Not tested on these rows" while the tool has an\n'
           + 'answer, which is the heading defect this row named.');
    }
    if (/checked\.unshift\(/.test(wpp)) {
        ok('the Summarized verdict leads "What happened"');
    } else {
        fail('the Summarized verdict does not lead',
             'An analyst who reads the finding top to bottom will have escalated to\n'
           + 'Oracle before reaching it.');
    }
    if (/if\s*\(checked\.length\s*>\s*2\)/.test(wpp)) {
        ok('the two-bullet standard still holds on screen after the prepend');
    } else {
        fail('nothing keeps "What happened" to two bullets after the prepend',
             'Tools/check_txv_cards.py enforces the cap on the catalog, not on what the\n'
           + 'renderer assembles, so the renderer has to hold it itself.');
    }
    if (/'Detail'\s*&&\s*st\s*!==\s*'Summarized'|st\s*!==\s*'Detail'\s*&&\s*st\s*!==\s*'Summarized'/.test(wpp)) {
        ok('no verdict leaves the catalog wording exactly as it ships');
    } else {
        fail('_withPostingPolicy does not leave the copy alone when there is no verdict',
             'A failed fetch must not turn into a claim in either direction.');
    }
}

console.log('');
if (failures) {
    console.log(failures + ' assertion(s) FAILED');
    process.exit(1);
}
console.log('PASS -- the posting policy resolves per company, the field is always emitted, '
          + 'the band is ungated, and the card stops saying "not tested" once it is.');
