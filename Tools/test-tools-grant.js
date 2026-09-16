/* test-tools-grant.js -- behaviour test for the `tools` grant (UI-189).
 *
 *   node Tools/test-tools-grant.js
 *
 * WHY THIS EXISTS. The original request was "make superuser selectable under
 * user rights, and any Analyst or Accountant with it sees a Tools tab". The gate
 * it named was the wrong one: `is_superuser` is a VALC CONSOLE permission --
 * console login, the inactivity exemption, the console token -- and
 * TenantUsersController calls it one of "the two real escalation vectors" that no
 * customer-facing method may write. So this shipped as a per-ROLE capability
 * (`roles.tools`, V68) minted into the JWT as `perms.tl`, which is how every
 * other function permission on that screen already works.
 *
 * WHAT IT GATES MATTERS. The Tools shelf reaches Reload Cardex, which deletes
 * F4111 and RTransactions rows from a chosen date forward. A gate in front of
 * that has to fail CLOSED, and a tab that opens an empty shelf is the dead-control
 * defect UI-184 was opened for.
 *
 * ⚠ THIS FILE EXECUTES THE SHIPPED FUNCTIONS RATHER THAN GREPPING FOR THEM.
 * Parse-clean is not verified, demonstrated twice on 2026-09-13 when a dropped
 * `var` declaration passed every syntax gate and was a runtime ReferenceError.
 * Both functions under test are extracted from home.html verbatim and called.
 *
 * WHAT THIS ASSERTS.
 *   A1  canTools() honours the grant: admin always, perms.tl true, nothing else.
 *   A2  canTools() FAILS CLOSED on every shape of missing claim -- no perms
 *       block, no active db, tl absent, tl not a boolean true.
 *   A3  canTools() reads `tl` and NOT `su`. Asserted by giving a db entry su=true
 *       and tl absent: a true answer there means the wrong gate is wired.
 *   A4  _visibleSubviews() drops a gated tab when its gate is false and keeps
 *       every ungated tab, so the strip never offers a shelf that will not open.
 *   A5  _visibleSubviews() denies a tab whose gate THROWS, rather than admitting
 *       it. A gate that errors must not become an open door.
 *   A6  CONTROL: with the grant held, the gated tab is present -- otherwise A4
 *       would pass for a filter that drops everything.
 *   A7  MUTATION CONTROL: re-inject the pre-fix gate (`p.su`) and confirm A3
 *       goes red while the admin path, which the defect never affected, stays
 *       green. A check only ever run against fixed code is untested.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');

let failures = 0;
function check(ok, name, detail) {
    if (ok) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

/** Pull one `function NAME(...) { ... }` out of the file by brace matching.
 *  Aborts loudly rather than slicing arbitrarily -- a silent mis-slice would
 *  test a fragment and report a pass. */
function extract(name) {
    const re = new RegExp('function\\s+' + name + '\\s*\\(', 'g');
    const m = re.exec(html);
    if (!m) throw new Error('could not find function ' + name + ' in home.html');
    let i = html.indexOf('{', m.index);
    if (i < 0) throw new Error('no body brace for ' + name);
    let depth = 0, end = -1;
    for (let j = i; j < html.length; j++) {
        const c = html[j];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    if (end < 0) throw new Error('unbalanced body for ' + name);
    return html.slice(m.index, end);
}

const canToolsSrc    = extract('canTools');
const visibleSrc     = extract('_visibleSubviews');
console.log('test-tools-grant.js (UI-189)');
console.log('  extracted canTools (' + canToolsSrc.length + ' chars), '
          + '_visibleSubviews (' + visibleSrc.length + ' chars)');

/* Build a runnable scope. activeDb() and isAdmin() are the two collaborators
 * canTools names; SUBVIEWS is the one _visibleSubviews names. Each is a stub the
 * test drives, so what is under test is the shipped logic and nothing else. */
function build(src, extra) {
    const preamble = `
        var _db = null, SUBVIEWS = {};
        function activeDb() { return _db; }
        function isAdmin() { return !!(_db && _db.t && _db.t.adm === true); }
        function setDb(d) { _db = d; }
        function setSubviews(s) { SUBVIEWS = s; }
    `;
    return new Function(preamble + src + (extra || '') +
        '; return { canTools: typeof canTools === "function" ? canTools : null,'
        + ' canAnalyst: typeof canAnalyst === "function" ? canAnalyst : null,'
        + ' _visibleSubviews: typeof _visibleSubviews === "function" ? _visibleSubviews : null,'
        + ' setDb: setDb, setSubviews: setSubviews };')();
}

const S = build(canToolsSrc + '\n' + visibleSrc);

/* ---- A1: the grant is honoured ------------------------------------------------- */
S.setDb({ t: { adm: true }, perms: {} });
check(S.canTools() === true, 'A1a an admin always holds it');
S.setDb({ t: { adm: false }, perms: { tl: true } });
check(S.canTools() === true, 'A1b a non-admin with perms.tl holds it');
S.setDb({ t: { adm: false }, perms: { tl: false } });
check(S.canTools() === false, 'A1c a non-admin with tl=false does not');

/* ---- A2: fails closed ---------------------------------------------------------- */
S.setDb(null);
check(S.canTools() === false, 'A2a no active database -> denied');
S.setDb({ t: { adm: false } });
check(S.canTools() === false, 'A2b no perms block at all -> denied',
    'an absent claim must never be a grant -- this gate fronts a delete');
S.setDb({ t: { adm: false }, perms: { dm: true, ac: true } });
check(S.canTools() === false, 'A2c other lanes do not imply this one');
S.setDb({ t: { adm: false }, perms: { tl: 'true' } });
check(S.canTools() === false, 'A2d a non-boolean truthy value is not a grant',
    'the check is === true, so a string "true" from a mangled token is refused');

/* ---- A3: it reads tl, not su --------------------------------------------------- */
S.setDb({ t: { adm: false }, perms: { su: true } });
check(S.canTools() === false,
    'A3  perms.su does NOT grant Tools',
    'the console superuser flag must never gate an application capability');

/* ---- A4/A5/A6: the subview filter ---------------------------------------------- */
let grant = false;
const TABS = [
    { k: 'work',  label: 'Work' },
    { k: 'tools', label: 'Tools', gate: function () { return grant; } },
    { k: 'audit', label: 'Audit Center' }
];
S.setSubviews({ analyst: TABS });

grant = false;
let vis = S._visibleSubviews('analyst').map(function (t) { return t.k; });
check(vis.join(',') === 'work,audit',
    'A4a a gated tab is dropped when its gate is false',
    'got [' + vis.join(',') + ']');
check(vis.length === 2, 'A4b every ungated tab survives the filter');

grant = true;
vis = S._visibleSubviews('analyst').map(function (t) { return t.k; });
check(vis.join(',') === 'work,tools,audit',
    'A6  CONTROL: with the grant, the gated tab is present',
    'got [' + vis.join(',') + '] -- without this A4 would pass for a filter that drops everything');

S.setSubviews({ analyst: [
    { k: 'work', label: 'Work' },
    { k: 'boom', label: 'Boom', gate: function () { throw new Error('gate blew up'); } }
] });
vis = S._visibleSubviews('analyst').map(function (t) { return t.k; });
check(vis.join(',') === 'work',
    'A5  a gate that THROWS denies rather than admits',
    'got [' + vis.join(',') + '] -- an erroring gate must not become an open door');

check(S._visibleSubviews('nosuchrole') === null,
    'A4c an unknown role yields null, as the callers expect');

/* ---- A7: MUTATION CONTROL ------------------------------------------------------ */
console.log('\n  mutation control -- the pre-fix gate (perms.su) re-injected:');
const mutated = canToolsSrc.replace(/p\.tl\s*===\s*true/, 'p.su === true');
if (mutated === canToolsSrc) {
    failures++;
    console.log('  FAIL A7  could not build the mutant -- the anchor this control '
              + 'keys on has moved, so the control proved nothing');
} else {
    const M = build(mutated);
    M.setDb({ t: { adm: false }, perms: { su: true } });
    const mutantGrants = M.canTools() === true;
    check(mutantGrants,
        'A7a the mutant DOES grant on perms.su (so A3 is a real assertion)',
        'the mutation changed nothing measurable -- A3 would pass either way');
    M.setDb({ t: { adm: true }, perms: {} });
    check(M.canTools() === true,
        'A7b the admin path is unaffected by the mutant',
        'the defect never touched the admin rung; if this moves, the control is too broad');
}

/* ---- A8: WHO REACHES THE SHELF -- AND THE RULING CHANGED 2026-09-15 ------------- */
/* ⛔ THE FIRST CUT GATED ALL THREE SITES ON canTools() ALONE, AND THAT WAS A
   REGRESSION DRESSED AS A PERMISSION. It withdrew the shelf from every analyst
   whose token predates migration V68, which on upgrade day is all of them, and
   "ask the customer to re-authenticate" is a workaround rather than a design.
   Still forbidden, and still asserted below.

   ⛔ BUT THE OR IS GONE TOO. UI-201, owner ruling 2026-09-15: NARROW THE CLIENT.
   The shelf was already dead for a tools-only user, which was measured rather
   than argued -- two of its three cards 403 for `tl` without `dm`
   (inventory/fiscal-period-end-detect and inventory/reload-cardex/eod-check both
   ask {adm, dm, su}) and the third only escaped because ServiceHealthController
   has no guard at all. The alternative was widening the SERVER to isTools(),
   refused because Reload Cardex deletes rows.

   ⚠⚠ AND THIS BLOCK USED TO REBUILD THE GATE BY HAND:
       const REACH = () => G.canAnalyst() || G.canTools();
   That is an assertion about the AUTHOR'S COPY of the expression, not about the
   shipped one, and it proved it: when the three call sites changed, all five
   reach rows went on passing green while the textual assertions below went red.
   A test that survives the behaviour it exists to pin is not a test. The gate is
   now EXTRACTED FROM THE FILE and executed. */
const canAnalystSrc = extract('canAnalyst');

/* The shipped `tools` entry in SUBVIEWS, taken verbatim.
   ⚠ THE ANCHOR IS ASSERTED UNIQUE BEFORE IT IS USED. A control in
   test-ai-plan-tier.js keyed on a line that hoisting had moved into another
   function; `.replace()` silently took the first occurrence and the suite died
   with a ReferenceError while every assertion had been passing throughout. The
   lesson generalises: a slice is only evidence if there was one candidate. */
const SHELF_GATE_RE = /\{\s*k:\s*'tools',\s*label:\s*'Tools',\s*gate:\s*function\s*\(\)\s*\{\s*return\s+([^;]+);\s*\}\s*\}/g;
const shelfHits = html.match(SHELF_GATE_RE) || [];
check(shelfHits.length === 1,
    'A8p the SUBVIEWS tools gate anchor matches EXACTLY once',
    'matched ' + shelfHits.length + ' time(s) -- a slice with 0 or 2 candidates '
  + 'is not evidence about the shipped gate');

const shelfExpr = shelfHits.length === 1
    ? new RegExp(SHELF_GATE_RE.source).exec(shelfHits[0])[1].trim()
    : null;
/* The same collaborator stubs build() uses, plus the EXTRACTED gate expression
   compiled in that scope -- so the matrix below runs the shipped predicate, not
   a restatement of it. */
const REACHES = new Function(`
    var _db = null;
    function activeDb() { return _db; }
    function isAdmin() { return !!(_db && _db.t && _db.t.adm === true); }
    ` + canAnalystSrc + '\n' + canToolsSrc + `
    return function (db) { _db = db; return !!(` + (shelfExpr || 'false') + `); };
`)();

const matrix = [
    ['analyst, no tl  (the upgrade case)', { t: { adm: false }, perms: { dm: true } },            true],
    // ⛔ THE UI-201 ROW. This read `true` until 2026-09-15 and the ruling
    // inverted it: the grant no longer reaches this shelf.
    ['accountant with tl -- NO LONGER reaches', { t: { adm: false }, perms: { ac: true, tl: true } }, false],
    // The row the finding was actually about: `tools` with no `dmaais`. No role
    // in the live fleet is shaped this way today, which is why nobody hit it.
    ['tools-only (tl, no dm) -- the dead-control case', { t: { adm: false }, perms: { tl: true } }, false],
    ['accountant, no tl',                  { t: { adm: false }, perms: { ac: true } },            false],
    ['no lane at all',                     { t: { adm: false }, perms: {} },                      false],
    ['admin',                              { t: { adm: true },  perms: {} },                      true],
];
for (const [label, db, want] of matrix) {
    const got = REACHES(db);
    check(got === want, 'A8  reach: ' + label, 'expected ' + want + ', got ' + got);
}
/* CONTROL on the extraction itself: an expression that never ran would make
   every row above pass or fail for the wrong reason. */
check(shelfExpr === 'canAnalyst()',
    'A8q the extracted shelf gate is the narrowed form',
    'extracted `' + shelfExpr + '` -- if this changed deliberately, change the '
  + 'matrix above with it rather than relaxing this line');

/* The three shelf sites must agree. A behavioural test on one would not see a
   different operator reintroduced in another, which is the whole reason these
   are textual -- the defect class here is an OPERATOR, not a value.
   ⚠ EACH PATTERN IS ASSERTED UNIQUE. `if (!canAnalyst()) return;` alone is NOT
   unique in home.html -- loadFiscalStatus() carries the identical line -- so the
   reload-cardex site is anchored on its own function body, not on the file. */
const reloadSrc = extract('loadReloadCardexStatus');
const ackSrc    = extract('ackReminder');
const SITES = [
    ["SUBVIEWS tools gate",
     /gate:\s*function\s*\(\)\s*\{\s*return canAnalyst\(\);\s*\}/g, html],
    ["the shelf's hidden flag",
     /tools\.hidden\s*=\s*\(sv !== 'tools'\)\s*\|\|\s*!canAnalyst\(\)/g, html],
    ["loadReloadCardexStatus gate",
     /if\s*\(!canAnalyst\(\)\)\s*return;/g, reloadSrc],
];
for (const [label, re, hay] of SITES) {
    const hits = (hay.match(re) || []).length;
    check(hits === 1, 'A8b ' + label + ' uses the narrowed canAnalyst() form, once',
        'matched ' + hits + ' time(s) -- the three shelf gates must stay in step, '
      + 'and a pattern matching 0 or 2 places is not evidence about any of them');
}

/* ⛔ THE FOURTH SITE KEEPS THE OR, DELIBERATELY. ackReminder posts
   admin/activity/ack, and ActivityController.requireAckGrant("cardex-snooze")
   admits isTools() BY NAME. Narrowing it would make the client refuse a request
   the server would honour -- harmless, but a figure disagreeing with its
   producer. UI-197 is why it is gated at all: it was ungated against an endpoint
   requiring isAdmin(), the POST 403'd, the .catch returned null, the caller read
   that as "no ack table" and wrote the localStorage fallback, and the dot
   repainted green. The snooze looked recorded and was per-browser only.
   ⚠ Note `return Promise.resolve(null)`, not a bare `return;` -- every caller
   chains .then off it. */
const ackHits = (ackSrc.match(/if\s*\(!\(canAnalyst\(\)\s*\|\|\s*canTools\(\)\)\)\s*return Promise\.resolve\(null\);/g) || []).length;
check(ackHits === 1,
    'A8b ackReminder KEEPS the OR (its server admits isTools by name), once',
    'matched ' + ackHits + ' time(s)');

check(!/!canAnalyst\(\)\s*\|\|\s*!canTools\(\)/.test(html),
    'A8c no site uses the restrictive !canAnalyst() || !canTools() form',
    'that is the exact expression that caused the original regression');
/* And the other forbidden shape: canTools() ALONE gating the shelf. The ruling
   narrowed TOWARDS canAnalyst(), never towards the grant on its own. */
check(!/gate:\s*function\s*\(\)\s*\{\s*return canTools\(\);/.test(html),
    'A8d the shelf is never gated on canTools() alone',
    'that withdraws the shelf from every analyst whose token predates V68');

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
