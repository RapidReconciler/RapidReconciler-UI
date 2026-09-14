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

/* ---- A8: THE GRANT IS ADDITIVE, NOT RESTRICTIVE -------------------------------- */
/* ⛔ THE FIRST CUT GATED ALL THREE SITES ON canTools() ALONE, AND THAT WAS A
   REGRESSION DRESSED AS A PERMISSION. The owner's request was additive in its own
   words -- "any user with it, Analyst or Accountant, SEES a new Tools tab" -- so
   the grant EXTENDS reach; it never withdrew the shelf from analysts.

   It also could not have survived an upgrade. `tl` is minted from `roles.tools`,
   which arrives with migration V68, so EVERY token issued before that migration
   lacks the claim. Under the restrictive form, upgrade day removes the Tools tab
   from every analyst in the fleet until each one happens to sign out and back in.
   "Ask the customer to re-authenticate" is a workaround, not a design.

   These assertions are behavioural where they can be, and textual for the three
   call sites -- because the defect was an operator, and an operator is exactly
   what a behavioural test on ONE site would miss in the other two. */
const canAnalystSrc = extract('canAnalyst');
const G = build(canAnalystSrc + '\n' + canToolsSrc);
const REACH = function () { return G.canAnalyst() || G.canTools(); };

const matrix = [
    ['analyst, no tl  (the upgrade case)', { t: { adm: false }, perms: { dm: true } },            true],
    ['accountant with tl (the new reach)', { t: { adm: false }, perms: { ac: true, tl: true } },  true],
    ['accountant, no tl',                  { t: { adm: false }, perms: { ac: true } },            false],
    ['no lane at all',                     { t: { adm: false }, perms: {} },                      false],
    ['admin',                              { t: { adm: true },  perms: {} },                      true],
];
for (const [label, db, want] of matrix) {
    G.setDb(db);
    check(REACH() === want, 'A8  reach: ' + label,
        'expected ' + want + ', got ' + REACH());
}

/* The three sites must all use the OR. A behavioural test on one would not see
   an AND reintroduced in another. */
const SITES = [
    ["SUBVIEWS tools gate",        /gate:\s*function\s*\(\)\s*\{\s*return canAnalyst\(\)\s*\|\|\s*canTools\(\);/],
    ["the shelf's hidden flag",    /tools\.hidden\s*=\s*\(sv !== 'tools'\)\s*\|\|\s*!\(canAnalyst\(\)\s*\|\|\s*canTools\(\)\)/],
    ["loadReloadCardexStatus gate",/if\s*\(!\(canAnalyst\(\)\s*\|\|\s*canTools\(\)\)\)\s*return;/],
];
for (const [label, re] of SITES) {
    check(re.test(html), 'A8b ' + label + ' uses the OR form',
        'an AND here silently removes the shelf from analysts on upgrade');
}
check(!/!canAnalyst\(\)\s*\|\|\s*!canTools\(\)/.test(html),
    'A8c no site uses the restrictive !canAnalyst() || !canTools() form',
    'that is the exact expression that caused the regression');

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
