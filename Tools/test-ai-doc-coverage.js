/* test-ai-doc-coverage.js -- behaviour test for the AI doc-link allowlist (UI-8).
 *
 *   node Tools/test-ai-doc-coverage.js
 *
 * WHY THIS EXISTS. UI-8 sat open from July marked "NOT A CLOSEABLE ROW", because
 * what it asked for was a standing practice -- "add a line per new surface as they
 * ship" -- with no identifier and no acceptance test. A practice nobody can fail is
 * a practice that quietly stops happening. This file is what turns it into a build
 * that breaks when someone forgets.
 *
 * TWO FAILURE MODES, ONE PER ASSERTION.
 *
 * (1) A DEAD LINK IN FRONT OF A CUSTOMER. The AI never emits a URL -- it names a
 *     slug, and RRV8/ai-docs.js resolves it against an allowlist, so a hallucinated
 *     slug can never become a link. What the allowlist cannot defend against is a
 *     doc on the OTHER side of the repo being renamed or moved: the slug still
 *     resolves, the anchor still renders, and it 404s. Every href is checked
 *     against the filesystem. Clean today; this guards the rename.
 *
 * (2) A NEW AI SURFACE SHIPS WITH NO WAY TO LEARN MORE. Seven RRV8 pages call the
 *     AI. Until 2026-08-27 exactly one of them -- home.html -- could offer a doc
 *     link, because the allowlist and its helpers were declared inline in that
 *     file and nowhere else. Every page that makes an AI call must now either WIRE
 *     the shared module or appear in EXEMPT below with a stated reason. Silence is
 *     not an option: an unlisted, unwired page fails the build.
 *
 * "MAKES AN AI CALL" IS READ OUT OF THE SOURCE, NOT INVENTED. The probe is the
 * literal endpoint path `ai/explain`, which is the only AI-inference route these
 * pages call -- 32 occurrences across 7 files, measured 2026-08-27. `ai/health` is
 * a capability check (does this database have an AI tier) and `ai/preferences` is a
 * settings read; neither sends a prompt, so neither is an AI call for this purpose.
 * The wider probe of `ai/explain` + `_aiExplain` + `askAcct` + `askAnalyst` yields
 * exactly the same seven files, because the latter three are all wrappers around
 * the first -- so the endpoint alone is the tighter and more defensible test.
 *
 * SOURCE IS NOT RETYPED. The allowlist is evaluated out of RRV8/ai-docs.js at run
 * time, and the page set is globbed off disk. Add a page, add a doc, rename a doc
 * -- this test sees it without being edited.
 *
 * BLIND SPOTS, named rather than left to be found later:
 *   - Wiring is detected by the presence of the calls in the page source, not by
 *     running them. A page that calls catalogPrompt() inside a branch that never
 *     executes passes this test and ships no links.
 *   - It cannot tell whether a doc's CONTENT still matches its slug. A doc that
 *     gets rewritten into a different topic keeps its href and passes.
 *   - The exemption reasons are prose. Nothing checks that a reason is still true.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT  = path.join(__dirname, '..');
const RRV8  = path.join(ROOT, 'RRV8');
const MODULE_FILE = path.join(RRV8, 'ai-docs.js');

let failures = 0;
function fail(msg, detail) {
    failures++;
    console.log('  FAIL ' + msg);
    if (detail) console.log('         ' + String(detail).split('\n').join('\n         '));
}
function ok(msg) { console.log('  ok   ' + msg); }

/* =================================================================
 * The owner's ruling, 2026-08-27. Four pages make an AI call and
 * deliberately do NOT offer doc links. Each carries its reason here,
 * because "it isn't wired" and "it was decided not to wire it" look
 * identical in a grep and only one of them is a defect.
 */
const EXEMPT = {
    'admin-claude-assistant.html':
        'It is itself a chat surface. A "Learn more" strip under every turn is the '
      + 'boilerplate the all-signal-no-noise rule exists to stop -- the reader would '
      + 'learn to skim past it by the third answer.',
    'accounting-model-review.html':
        'A narrow drill: approve or re-approve the F4095 baseline. The reader is '
      + 'already inside the one doc-shaped decision the page is about, so a link '
      + 'would point back at where they are.',
    'inventory-account-rollforward.html':
        'A narrow drill on one account\'s period movement. The answer is arithmetic '
      + 'about specific rows; no doc generalises it usefully.',
    'inventory-asof.html':
        'A narrow drill on a point-in-time balance. Same shape as the roll-forward: '
      + 'the question is about these rows, not about a concept a doc could explain.'
};

/* =================================================================
 * Load the allowlist by EVALUATING ai-docs.js, so the test reads the
 * shipped object and not a copy of it.
 */
if (!fs.existsSync(MODULE_FILE)) {
    console.error('FAIL RRV8/ai-docs.js is missing -- the shared allowlist has vanished.');
    process.exit(1);
}
const sandbox = { console: console, document: { getElementById: function () { return null; } } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
try {
    vm.runInContext(fs.readFileSync(MODULE_FILE, 'utf8'), sandbox, { filename: 'RRV8/ai-docs.js' });
} catch (e) {
    console.error('FAIL could not evaluate RRV8/ai-docs.js: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
}
const aiDocs = sandbox.RRV8 && sandbox.RRV8.aiDocs;
if (!aiDocs || !aiDocs.DOCS) {
    console.error('FAIL RRV8/ai-docs.js did not attach RRV8.aiDocs.DOCS');
    process.exit(1);
}
const DOCS = aiDocs.DOCS;

/* ---------------------------------------------------------------- 1 */
console.log('=== every allowlisted doc resolves to a file on disk ===');
const slugs = Object.keys(DOCS);
if (!slugs.length) fail('the allowlist is empty -- no doc can ever be offered');
for (const slug of slugs) {
    const d = DOCS[slug];
    if (!d.href)  { fail(slug + ' has no href'); continue; }
    if (!d.title) { fail(slug + ' has no title -- the anchor would render blank'); continue; }
    // hrefs are relative FROM RRV8/, which is the directory the pages live in.
    const target = path.resolve(RRV8, d.href);
    if (!fs.existsSync(target)) {
        fail(slug + ' -> ' + d.href + ' does not exist',
             'resolved to ' + target + '\nthe slug still resolves, so the anchor renders and 404s');
        continue;
    }
    ok(slug.padEnd(20) + d.href);
}

/* ---------------------------------------------------------------- 2 */
console.log('');
console.log('=== every page that calls the AI is wired, or exempt with a reason ===');

// The probe. `ai/explain` is the only route that sends a prompt.
const AI_CALL = /ai\/explain/;

// A page counts as WIRED when it loads the shared module AND does all three of the
// things that make a link safe: asks for slugs, validates them, renders them. Any
// one missing is a half-wire -- most sharply, a page that asks for the @@DOCS@@
// token without extracting it prints the raw token to the reader.
const NEEDS = [
    { what: 'loads ai-docs.js',   re: /<script[^>]+src=["']ai-docs\.js["']/ },
    { what: 'loads ai-docs.css',  re: /<link[^>]+href=["']ai-docs\.css["']/ },
    { what: 'asks for slugs',     re: /(?:aiDocs\.catalogPrompt|_aiDocCatalogPrompt)\s*\(/ },
    { what: 'validates slugs',    re: /(?:aiDocs\.(?:extractDocs|filterSlugs)|_aiExtractDocs|_aiFilterDocSlugs)\s*\(/ },
    { what: 'renders the strip',  re: /(?:aiDocs\.renderStrip|_aiRenderDocStrip)\s*\(/ }
];

const pages = fs.readdirSync(RRV8).filter(f => /\.html$/i.test(f)).sort();
const aiPages = [];
for (const page of pages) {
    const src = fs.readFileSync(path.join(RRV8, page), 'utf8');
    if (AI_CALL.test(src)) aiPages.push({ page, src });
}
if (!aiPages.length) {
    fail('no page matched the ai/explain probe -- the probe is wrong, or the AI surfaces are gone');
}

for (const { page, src } of aiPages) {
    if (Object.prototype.hasOwnProperty.call(EXEMPT, page)) {
        ok(page.padEnd(38) + 'EXEMPT -- ' + EXEMPT[page].split('.')[0] + '.');
        continue;
    }
    const missing = NEEDS.filter(n => !n.re.test(src)).map(n => n.what);
    if (missing.length) {
        fail(page + ' calls ai/explain but is neither wired nor exempt',
             'missing: ' + missing.join(', ') + '\n'
           + 'Either wire RRV8/ai-docs.js into it, or add it to EXEMPT in this file\n'
           + 'with the reason a reader of that surface does not need a doc link.');
        continue;
    }
    ok(page.padEnd(38) + 'wired');
}

// An exemption for a page that no longer calls the AI is dead weight, and a
// stale exemption is how a re-wired page silently stays unlinked.
console.log('');
console.log('=== no stale exemptions ===');
const aiSet = new Set(aiPages.map(p => p.page));
for (const page of Object.keys(EXEMPT)) {
    if (!fs.existsSync(path.join(RRV8, page))) {
        fail('EXEMPT names ' + page + ', which does not exist');
    } else if (!aiSet.has(page)) {
        fail('EXEMPT names ' + page + ', which no longer calls ai/explain',
             'remove the exemption -- it can only hide a future re-wire.');
    } else {
        ok(page + ' still calls the AI, exemption still meaningful');
    }
}

console.log('');
console.log('checked ' + slugs.length + ' allowlisted doc(s) and ' + aiPages.length
            + ' AI-calling page(s) of ' + pages.length + ' under RRV8/ ('
            + (aiPages.length - Object.keys(EXEMPT).length) + ' wired, '
            + Object.keys(EXEMPT).length + ' exempt)');

if (failures) {
    console.log('');
    console.log(failures + ' FAILURE(S)');
    process.exit(1);
}
console.log('PASS');
