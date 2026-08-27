/* test-je-offset-store.js -- behaviour test for the standing offset accounts (UI-162).
 *
 *   node Tools/test-je-offset-store.js
 *
 * WHY THIS EXISTS. Home's balancing entry debits each inventory account and credits
 * an offset account the accountant names, and Journal Entry Complete stays disabled
 * until every row carries one. Those offsets used to live in a page-local object,
 * wiped on every database switch, so the same mapping was retyped every period and a
 * second accountant on another machine saw none of it. They persist now.
 *
 * PERSISTENCE IS THE RISK, NOT THE FEATURE. A stored offset that has since been
 * retired from the chart of accounts still produces a BALANCED journal entry -- it
 * simply posts to the wrong account. Nothing downstream objects, because nothing
 * downstream can tell. Every defence is therefore in how the value is chosen and
 * shown, which is what this test pins down.
 *
 * ASSERTION 1 -- PRECEDENCE, INCLUDING THE CASE THAT MUST NOT PRE-FILL.
 * _jeOffValue is sliced out of the shipping home.html and driven through the four
 * states. A typed value wins over a saved one, so a per-period override is always
 * possible. A saved value fills the row and reports itself as 'saved', never as
 * something the accountant typed. And a saved value whose account no longer resolves
 * fills NOTHING: it is precisely the plausible-looking pre-fill that gets posted
 * without a second look, so the row goes back to empty and the grid flags it. An
 * implementation that "helpfully" pre-fills the stale value anyway passes every
 * other check in this repo and is the whole defect.
 *
 * ASSERTION 2 -- THE GATE COUNTS A SAVED OFFSET AS FILLED. openOffsetEntry decides
 * whether a row is still on its "Offset account" placeholder, which is what disables
 * Journal Entry Complete. It has to read the RESOLVED value; reading _jeOffsets
 * directly would leave every pre-filled row looking empty to the gate while the grid
 * showed a full column -- a disabled button with no visible cause.
 *
 * ASSERTION 3 -- NO localStorage FALLBACK, AND THIS IS THE POINT.
 * Every other store in config.js mirrors to localStorage and falls back to it in
 * silence. Copying that shape here would be the natural thing for the next author to
 * do and would break the feature in a way nobody could see: a browser-local mirror
 * looks identical on screen to the shared mapping, and a pre-filled value that only
 * this browser knows about is exactly the value that reads as "one I just chose".
 * So the offsetStore block is checked to touch localStorage only for the bearer
 * token, and the controller is checked to record who and when.
 *
 * SOURCE IS NOT RETYPED. The function is sliced out of the shipping HTML; the other
 * assertions run over the shipping config.js, home.html and the Java controller.
 *
 * BLIND SPOTS, named:
 *   - It does not prove the provenance line RENDERS. It proves the value is chosen
 *     correctly and that the markup names updatedBy/updatedDate; whether the line is
 *     legible on screen needs eyes.
 *   - It does not exercise the agent. The SQL behind exists/offsetName was verified
 *     separately against a live database; this file never opens a socket.
 *   - It cannot tell whether a stored offset is the RIGHT account, only whether it
 *     still exists. Nothing can.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOME = path.join(__dirname, '..', 'RRV8', 'home.html');
const CONFIG = path.join(__dirname, '..', 'RRV8', 'config.js');
const CTRL = path.join(__dirname, '..', '..', 'RapidReconciler-Agent', 'src', 'main', 'java',
    'coral', 'rapidreconciler', 'client', 'services', 'controller', 'GlOffsetAccountController.java');

const home = fs.readFileSync(HOME, 'utf8');
const config = fs.readFileSync(CONFIG, 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
    failures++;
}

function slice(src, header) {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith(header));
    if (start < 0) throw new Error('could not find `' + header + '` in home.html');
    const indent = lines[start].match(/^\s*/)[0];
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i] === indent + '}') return lines.slice(start, i + 1).join('\n');
    }
    throw new Error('could not find the end of `' + header + '`');
}

/* ---- assertion 1: which value fills the row ----------------------------- */
console.log('assertion 1 -- precedence, and the pre-fill that must not happen');

const fnSrc = slice(home, 'function _jeOffValue(co, acct)');

function resolve(typed, stored) {
    const sandbox = {
        _jeOffsets: typed ? { 'db|80002|9999998.140909' : typed } : {},
        _jeOffKey: (co, acct) => 'db|' + co + '|' + acct,
        _jeStored: () => stored
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc + "\n_jeOffValue('80002','9999998.140909');", sandbox);
    return vm.runInContext("_jeOffValue('80002','9999998.140909');", sandbox);
}

const LIVE  = { offsetAccount: '9999842.510415.SB02', exists: true,  checked: true };
const DEAD  = { offsetAccount: '9999842.999999',      exists: false, checked: true };
// An agent too old to run the check reports no `exists` at all. offsetStore._norm
// turns that into exists:false / checked:false -- unverified, not verified.
const UNSEEN = { offsetAccount: '9999842.510415.SB02', exists: false, checked: false };

check('nothing typed, nothing saved -> empty',
    resolve('', null), { val: '', from: '' });
check('nothing typed, saved and resolves -> fills, marked as saved',
    resolve('', LIVE), { val: '9999842.510415.SB02', from: 'saved' });
check('nothing typed, saved but RETIRED -> fills NOTHING',
    resolve('', DEAD), { val: '', from: '' });
check('nothing typed, saved but never verified -> fills NOTHING',
    resolve('', UNSEEN), { val: '', from: '' });
check('typed beats a saved value (the per-period override)',
    resolve('9999842.520830', LIVE), { val: '9999842.520830', from: 'typed' });
check('typed still wins when the saved one is retired',
    resolve('9999842.520830', DEAD), { val: '9999842.520830', from: 'typed' });

/* ---- assertion 2: the completion gate sees a saved offset --------------- */
console.log('assertion 2 -- a saved offset unlocks Journal Entry Complete');

// The composer marks a row isDefault when it has no offset, and :disabled follows
// hasDefault. Reading _jeOffsets there instead of the resolved value would leave a
// pre-filled grid with a permanently disabled button.
check('the composer resolves through _jeOffValue, not the raw typed map',
    /var typed = _jeOffValue\(co, l\.acct\)\.val;/.test(home), true);
check('isDefault still keys off that resolved value',
    /isDefault: !typed/.test(home), true);
check('the gate still requires every row filled',
    /doneBtn\.disabled = !balanced \|\| hasDefault/.test(home), true);

/* ---- assertion 3: no localStorage fallback, and provenance is recorded -- */
console.log('assertion 3 -- the store is server-only and attributable');

// The CODE only. Starting at the doc comment would sweep in the paragraphs that
// explain why there is no localStorage mirror, and counting the word there would
// make the assertion below pass or fail on prose.
const startTag = 'var _cache = {};   // dbName ->';
const endTag = 'window.RRV8.offsetStore = {';
const startIdx = config.indexOf(startTag);
const endIdx = config.indexOf(endTag);
check('the offsetStore block is present in config.js', startIdx > 0 && endIdx > startIdx, true);
const endOfLine = config.indexOf('\n', endIdx);
const block = config.slice(startIdx, endOfLine < 0 ? config.length : endOfLine);

// One legitimate use: reading the bearer token in _auth. Anything else is a mirror.
const lsHits = (block.match(/localStorage/g) || []).length;
check('offsetStore touches localStorage exactly once (the bearer token)', lsHits, 1);
check('...and that one use is the token read',
    /localStorage\.getItem\('rrv8\.token'\)/.test(block), true);
check('offsetStore never WRITES to localStorage', /localStorage\.setItem/.test(block), false);
check('a failed load reports why instead of falling back',
    /slot\.map = \{\}; slot\.ok = false;/.test(block), true);
check('the store exposes that reason to the UI', /problem: problem/.test(block), true);
check('a database switch drops the cache outright', /reset: reset/.test(block), true);
check('home.html calls that reset on the DB switch',
    /RRV8\.offsetStore\.reset\(\)/.test(home), true);

// Provenance has to reach the screen, not a title attribute -- hard rule: a number
// that drives a decision goes on screen.
check('the grid renders the saved-by / saved-when line',
    /acct-g-offmeta[\s\S]{0,400}updatedDate[\s\S]{0,200}updatedBy/.test(home), true);
check('a retired saved offset is flagged by name in the grid',
    /is-stale[\s\S]{0,300}no longer in company/.test(home), true);
check('there is a surface listing every saved mapping',
    /_openOffsetManager/.test(home), true);

if (fs.existsSync(CTRL)) {
    const ctrl = fs.readFileSync(CTRL, 'utf8');
    check('the upsert records who', /userRequest\.getUsername\(\)/.test(ctrl), true);
    check('the upsert records when', /Instant\.now\(\)/.test(ctrl), true);
    check('a write is refused when the offset account does not exist',
        /repo\.accountExists\(company, offset\)/.test(ctrl), true);
    check('writes are scoped to the caller\'s companies',
        /requireInScope\(company, userRequest\.getAllowedCompanies\(\)\)/.test(ctrl), true);
} else {
    console.log('  ..   agent controller not present beside this repo -- skipped 4 checks');
}

console.log(failures === 0
    ? '\nPASS -- saved offsets fill only when they still resolve, and always say where they came from.'
    : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
