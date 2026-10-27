/* test-role-entitlement.js -- behaviour test for the V8 role ladder (UI-174).
 *
 *   node Tools/test-role-entitlement.js
 *
 * WHY THIS EXISTS. VLC-41 shipped the accountant grant end to end on the server:
 * AuthController emits `perms.ac`, the agent's five write guards were measured
 * with a 403/200 differential on real tokens. V8 never consumed it.
 * `canAccountant()` had ZERO call sites -- its only reference was
 * `_hasAccountantGrant()`, which had none of its own -- so the whole chain ran
 * canAccountant -> _hasAccountantGrant -> nobody.
 *
 * `_entitledRole()` meanwhile read
 *
 *     isAdmin() ? 'admin' : canAnalyst() ? 'analyst' : 'accountant'
 *
 * so accountant was the ELSE-BRANCH. Two consequences, and the second is the one
 * that mattered. A token holding ac=true landed on the Accountant view correctly
 * BY ACCIDENT, never through its grant. And a token holding NEITHER lane landed
 * there too, scored rank 0 so `_canSwitchRole()` was false, and was locked into a
 * console it had never been granted -- with no no-grant state anywhere on the page.
 *
 * This was never a privilege escalation: the server is authoritative and refuses
 * those writes. What was wrong is that V8 showed the controls and could not say
 * "you have no lane on this database".
 *
 * ⚠ AND THE COMMENT ABOVE THE LADDER ASSERTED THE FIX HAD ALREADY SHIPPED.
 * It read "VLC-41: 'accountant' is now a GRANT, not the else branch. This used to
 * read isAdmin() ? ... : 'accountant'" -- directly above the line still reading
 * exactly that. A positive claim of wiring that never landed is invisible to every
 * grep for "not wired" / "stub" / "no caller" (HK-7's harder half). A call-site
 * count is not, which is why this file counts them.
 *
 * WHAT THIS ASSERTS.
 *   A1  canAccountant() has at least one REAL invocation, not just a definition.
 *       The defect was exactly zero, and a raw occurrence count could not see it.
 *   A2  _entitledRole() consults canAccountant() and returns 'none' -- i.e. the
 *       bottom rung is a grant it reads, and the absence of all three is a state.
 *   A3  _entitledRole() no longer falls through to a bare 'accountant' literal as
 *       its final else. This is A2's defect stated as the shape that caused it.
 *   A4  (rewritten for VLC-214) there is NO rank: _roleRank() is gone and
 *       _canSwitchRole() is "more than one entitled view". The UI-174 version pinned
 *       the rank's ordering; under flat roles the rank itself is the defect.
 *   A5  The no-grant notice exists, is gated on data-view-role="none", and is NOT
 *       nested inside an admin-only or analyst-only container. That nesting is the
 *       UI-13 regression in a new place: tidying it under #view-admin would hide
 *       the access answer from precisely the people who need it.
 *   A6  Every lane the two grants own is explicitly hidden under
 *       data-view-role="none". The existing rules are written as
 *       body[data-view-role="accountant"] #analystBody -- POSITIVE selectors, so a
 *       fourth role value inherits none of them and would render the analyst and
 *       admin lanes to a user with no grant at all.
 *   A7  The notice NAMES the database. Grants are per-database, so "you have no
 *       lane" without naming which one is unactionable on an account that holds a
 *       grant on one database and not another -- the ordinary shape.
 *   A8  _hasAccountantGrant is gone entirely, with no dangling reference. It was a
 *       pure alias with zero callers; leaving it would keep two names for one
 *       predicate, which is how the two answers drift apart.
 *   A9  CONTROL: canAnalyst() still has its call sites and the analyst rung still
 *       works. A suite that only proves the new branch says nothing about whether
 *       the ladder that was already working still does.
 *   F1-F6 (VLC-214, owner ruling 2026-10-27) FOUR FLAT ROLES, executed against the
 *       shipped code: an Administrator token (adm, dm/ac/tl false) holds only the
 *       admin view and gets no switcher; an Analyst holds only analyst; an Accountant
 *       only accountant; a Power User (every flag) holds all three and is offered the
 *       switcher; a token with no grant is 'none'. A stored rrv8.viewRole the token
 *       does not entitle is ignored, and _setViewRole() does not store one. Rows F1a-c,
 *       F1e-g, F2c and F2d were measured RED against the pre-change home.html.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8');
// Strip line comments only -- see UI-170. Block comments carry markup examples
// this file does not read, and stripping them has broken offsets before.
const code = html.replace(/^[ \t]*\/\/.*$/gm, '');

let failures = 0;
function check(ok, name, detail) {
    if (ok) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

/** Real invocations of `name` -- occurrences of `name(` that are not the
 *  `function name(` definition. A bare occurrence count folds the definition and
 *  every comment mention in with the calls, and the whole question here is
 *  whether anything CALLS it. Comments are already stripped above. */
function callSites(name) {
    const re = new RegExp('(^|[^\\w.])' + name + '\\s*\\(', 'g');
    const defRe = new RegExp('function\\s+' + name + '\\s*\\(');
    let n = 0, m;
    while ((m = re.exec(code)) !== null) {
        const at = m.index + m[1].length;
        if (defRe.test(code.slice(Math.max(0, at - 10), at + name.length + 2))) continue;
        n++;
    }
    return n;
}

console.log('test-role-entitlement.js (UI-174)');

/* ---- A1: canAccountant() is REACHABLE, not merely referenced -------------------- */
// ⚠ THE FIRST VERSION OF THIS CHECK PASSED ON THE BROKEN CODE, and that is worth
// keeping in the file rather than quietly fixing. It asserted "canAccountant()
// has >= 1 call site", which was TRUE before the fix: _hasAccountantGrant()
// called it. The chain was canAccountant -> _hasAccountantGrant -> nobody, so a
// call-site count of 1 measured a reference inside a function nothing invoked.
// Verified by running this file against a pre-fix copy of home.html: seven checks
// failed and that one did not. A check that returns "fine" on the defect it names,
// while reading as coverage of it, is worse than no check -- HK-7's own warning,
// earned here.
//
// The general form, which also catches the next alias: a call site only counts
// when the function CONTAINING it is itself invoked somewhere.

/** The name of the top-level `function X(` whose body contains `idx`, or null
 *  for a call at module scope (which is always reachable). */
function enclosingFunction(idx) {
    const head = code.slice(0, idx);
    const m = head.match(/\n\s{0,4}function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{(?![\s\S]*\n\s{0,4}function\s)/);
    const all = [...head.matchAll(/\n\s{0,4}function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
    return all.length ? all[all.length - 1][1] : (m ? m[1] : null);
}

const acctCallIdx = [];
{
    const re = /(^|[^\w.])canAccountant\s*\(/g;
    let m;
    while ((m = re.exec(code)) !== null) {
        const at = m.index + m[1].length;
        if (/function\s+$/.test(code.slice(Math.max(0, at - 10), at))) continue;
        acctCallIdx.push(at);
    }
}
const reachable = acctCallIdx.filter(i => {
    const host = enclosingFunction(i);
    return host === null || host === 'canAccountant' ? false : callSites(host) >= 1;
});
check(reachable.length >= 1,
    'A1  canAccountant() is called from a function that is itself invoked',
    'call sites: ' + acctCallIdx.length + ', reachable: ' + reachable.length
    + ' -- every reference sits inside dead code, which is exactly the defect '
    + '(canAccountant -> _hasAccountantGrant -> nobody) that a raw count could not see');

/* ---- A2/A3: each view reads its grant, and there is a no-grant terminal ----------
 * VLC-214: the ladder became a SET. _entitledViews() lists the views the token grants,
 * each read from its own grant; _entitledRole() is the landing view (first of them) or
 * 'none'. A2/A3 now read those two bodies; the F block below executes them. */
function topFn(name) {
    const at = code.indexOf('function ' + name + '()');
    if (at === -1) return '';
    // The body runs to the next top-level `function ` at the same indent.
    const rest = code.slice(at);
    const end = rest.indexOf('\n  function ', 1);
    return end === -1 ? rest.slice(0, 600) : rest.slice(0, end);
}
const ladder = topFn('_entitledViews');
const landing = topFn('_entitledRole');

check(ladder !== '' && landing !== '', 'A2a _entitledViews() and _entitledRole() are present', 'could not locate them in home.html');
check(/canAccountant\s*\(\s*\)/.test(ladder),
    'A2b _entitledViews() consults canAccountant()',
    'the accountant view is not reading its own grant:\n         ' + ladder.replace(/\s+/g, ' ').slice(0, 200));
check(/['"]none['"]/.test(landing),
    "A2c _entitledRole() can return 'none'",
    'there is no no-grant state, so a token with neither lane still resolves to a view it was not granted');
// The defect shape: `: 'accountant'` as the final else, with nothing after it.
check(!/\?\s*['"]analyst['"]\s*:\s*['"]accountant['"]\s*;?\s*\}?\s*$/m.test(landing.trim()),
    "A3  the landing view no longer falls through to a bare 'accountant' else-branch",
    'the else-branch is back: ' + landing.replace(/\s+/g, ' ').slice(0, 200));

/* ---- A4: no rank (VLC-214) ------------------------------------------------------ */
// The UI-174 version of A4 pinned _roleRank()'s ordering. Roles are flat now and a
// rank is exactly the defect: it let a higher view imply the lower ones. So A4 asserts
// the rank is GONE and that the switcher counts entitled views instead.
check(!/function\s+_roleRank\s*\(/.test(code) && !/_roleRank\s*\(/.test(code),
    'A4a there is no _roleRank() any more (no ladder to climb)',
    'a rank is back -- a rank lets one view imply another, which VLC-214 removed');
check(/function\s+_canSwitchRole\s*\(\s*\)\s*\{\s*return\s+_entitledViews\(\)\.length\s*>\s*1\s*;/.test(code),
    'A4b _canSwitchRole() is "more than one entitled view"',
    (code.match(/function\s+_canSwitchRole[^\n]*/) || [''])[0]);

/* ---- A5: the notice exists, is gated, and is not buried ------------------------- */
const noticeAt = html.indexOf('id="noGrantNotice"');
check(noticeAt !== -1, 'A5a the no-grant notice element exists', 'no #noGrantNotice in home.html');
check(/body\[data-view-role="none"\][^{]*\.no-grant-notice[^{]*\{[^}]*display:\s*block/.test(html)
      || /body\[data-view-role="none"\]\s*\.no-grant-notice\s*\{\s*display:\s*block/.test(html),
    'A5b the notice is shown by data-view-role="none"',
    'no CSS rule reveals it, so the element exists and nobody can see it');
// Not nested inside a role-scoped container (the UI-13 regression shape).
const before = html.slice(0, noticeAt === -1 ? 0 : noticeAt);
const buried = ['id="view-admin"', 'id="adminBody"', 'id="analystBody"', 'id="acctPanels"']
    .filter(id => {
        const open = before.lastIndexOf(id);
        if (open === -1) return false;
        // Crude but sufficient: if that container's closing </section>/</div> has not
        // appeared between it and the notice, the notice is inside it.
        return before.slice(open).split('</section>').length < 2
            && before.slice(open).split('</div>').length < 2;
    });
check(buried.length === 0,
    'A5c the notice is not nested inside an admin-only or analyst-only container',
    'it sits inside ' + JSON.stringify(buried) + ' -- the access answer would be hidden from the people it is for');

/* ---- A6: the other lanes are hidden under 'none' -------------------------------- */
const noneRules = (html.match(/body\[data-view-role="none"\][^{;]*/g) || []).join(' ');
// ⚠ `#analystSectionHead` WAS REMOVED FROM THIS LIST 2026-09-12 (UI-188), and
// that is not the gate being weakened -- read before restoring it.
//
// This assertion protects a no-grant user from seeing somebody else's lane.
// Three of the four selectors are real markup (`#view-admin`, `#analystBody`,
// `#acctTop` each return exactly 1 `id=` producer). `#analystSectionHead`
// returns 0: the element was deleted in `aaa0af9` (2026-07-02, #307) when the
// analyst lane moved to sub-view tabs. A rule hiding an element that cannot
// render protects nothing, and asserting on it reports coverage that does not
// exist -- which is worse than not asserting, because the green is believed.
//
// The analyst lane is still covered: `#analystBody` is the real element and is
// still in this list, still in the `data-view-role="none"` rule, and is what
// actually hides the lane.
['#view-admin', '#analystBody', '#acctTop']
    .forEach(sel => check(noneRules.indexOf(sel) !== -1,
        'A6  ' + sel + ' is hidden under data-view-role="none"',
        'the existing rules are POSITIVE selectors keyed on the three known roles, so a '
        + 'fourth value inherits none of them and renders someone else\'s lane'));

/* ---- A7: the notice names the database ----------------------------------------- */
check(html.indexOf('id="noGrantDb"') !== -1,
    'A7a the notice has a slot for the database name', 'no #noGrantDb element');
check(callSites('paintNoGrantNotice') >= 1,
    'A7b something calls the painter that fills it',
    'the slot exists and nothing writes to it -- a sink with no producer, which reads '
    + 'to a user as "this database" forever');
check(/function\s+applyViewRole[\s\S]{0,240}?paintNoGrantNotice\s*\(/.test(code),
    'A7c the painter runs from applyViewRole, so it re-paints on a database switch',
    'grants are per-database; a stale name names the wrong refusal');

/* ---- A8: the dead alias is gone ------------------------------------------------- */
check(!/function\s+_hasAccountantGrant/.test(code),
    'A8a _hasAccountantGrant() is deleted, not left dead',
    'it is still defined -- a pure alias of canAccountant() with zero callers');
check(!/_hasAccountantGrant\s*\(/.test(code),
    'A8b nothing references _hasAccountantGrant',
    'a dangling call would throw at runtime');

/* ---- A9: CONTROL -- the rung that already worked still does --------------------- */
const analystCalls = callSites('canAnalyst');
check(analystCalls >= 7,
    'A9a CONTROL: canAnalyst() still has its call sites',
    'found ' + analystCalls + ' (7 before this change) -- the analyst lane regressed');
check(/if\s*\(\s*canAnalyst\s*\(\s*\)\s*\)\s*out\.push\(\s*['"]analyst['"]\s*\)/.test(ladder),
    'A9b CONTROL: the analyst view still resolves through canAnalyst()',
    'the view set stopped reading the lane that was already wired');
check(/if\s*\(\s*isAdmin\s*\(\s*\)\s*\)\s*out\.push\(\s*['"]admin['"]\s*\)/.test(ladder),
    'A9c CONTROL: the admin view still resolves through isAdmin()',
    'the view set lost its admin branch');

/* ---- F: VLC-214, FOUR FLAT ROLES -- executed, not grepped -------------------------
 * Owner ruling 2026-10-27: Administrator, Analyst and Accountant each see ONLY their
 * own view. Power User holds every flag, sees all three, and is the only role with a
 * switcher. VALC mints the four as:
 *   Administrator  t.adm, perms.ij, perms.rs   (dm, ac, tl false)
 *   Analyst        perms.dm, perms.tl          (ac false)
 *   Accountant     perms.ac                    (dm false)
 *   Power User     every flag
 * Before this, admin sat on top of a ladder (admin >= analyst >= accountant): canAnalyst,
 * canAccountant and canTools all OR'd isAdmin() in, so an Administrator was entitled to
 * every view and got the switcher, and an Analyst could switch to Accountant.
 *
 * The block from isAdmin() up to applyViewRole() and the _setViewRole() function are
 * sliced out of home.html and run against stubbed DOM and storage, so these rows test
 * the shipped code and not a restatement of it. */
const SLICE_START = '  function isAdmin() {', SLICE_END = '  function applyViewRole() {';
function uniqueAt(anchor) {
    const i = html.indexOf(anchor);
    if (i < 0 || html.indexOf(anchor, i + 1) >= 0) throw new Error('anchor not found exactly once: ' + anchor);
    return i;
}
function braceBody(at) {
    let i = html.indexOf('{', at), depth = 0;
    for (; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}' && --depth === 0) return html.slice(at, i + 1);
    }
    throw new Error('unbalanced braces');
}
const LENS_SRC = html.slice(uniqueAt(SLICE_START), uniqueAt(SLICE_END));
const SETVIEW_SRC = braceBody(uniqueAt('  function _setViewRole(r) {'));

function lens(db, stored) {
    const store = { 'rrv8.viewRole': stored == null ? null : stored };
    const els = {};
    const mk = id => (els[id] = els[id] || { id: id, hidden: true, textContent: '' });
    const opts = [];
    ['haRoleMenu', 'userMenuRoles'].forEach(menu => ['admin', 'analyst', 'accountant'].forEach(r => {
        const cls = new Set();
        opts.push({ menu: menu, role: r, hidden: false,
            getAttribute: a => (a === 'data-role' ? r : null),
            classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } });
    }));
    const ctx = {
        __db: db,
        activeDb: function () { return ctx.__db; },
        $: mk,
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); }
        },
        document: { querySelectorAll: () => opts },
        applyViewRole: function () {}, renderAiBriefing: function () {}, _acctAsking: false
    };
    new Function('ctx', 'with (ctx) {\n' + LENS_SRC + '\n' + SETVIEW_SRC + '\n'
        + 'ctx.api = { canAnalyst: canAnalyst, canAccountant: canAccountant, canTools: canTools,'
        + ' viewRole: _viewRole, canSwitch: _canSwitchRole, sync: syncRoleMenu, setView: _setViewRole };\n}')(ctx);
    const api = ctx.api;
    return {
        api: api, store: store,
        // What a person sees: the switcher's visibility and the options it offers.
        switcher: () => { api.sync(); return !mk('haRoles').hidden; },
        legacySwitcher: () => { api.sync(); return !mk('userMenuRoles').hidden; },
        offered: () => { api.sync(); return opts.filter(o => o.menu === 'haRoleMenu' && !o.hidden).map(o => o.role); }
    };
}
const TOK = {
    administrator: { n: 'DB', t: { adm: true },  perms: { ij: true, rs: true, dm: false, ac: false, tl: false, ite: false, prs: false } },
    analyst:       { n: 'DB', t: { adm: false }, perms: { dm: true, tl: true, ac: false } },
    accountant:    { n: 'DB', t: { adm: false }, perms: { ac: true, dm: false, tl: false } },
    powerUser:     { n: 'DB', t: { adm: true },  perms: { ij: true, rs: true, dm: true, ac: true, tl: true, ite: true, prs: true }, rn: 'Power User' },
    noRole:        { n: 'DB', t: { adm: false }, perms: { dm: false, ac: false, tl: false } }
};
const VIEWS = ['admin', 'analyst', 'accountant'];
const viewsFor = (db) => VIEWS.filter(v => lens(db, v).api.viewRole() === v);
console.log('\nVLC-214 flat roles (executed)');

// Administrator
let L = lens(TOK.administrator);
check(L.api.canAnalyst() === false, 'F1a Administrator: canAnalyst() is false (admin no longer implies the analyst lane)');
check(L.api.canAccountant() === false, 'F1b Administrator: canAccountant() is false');
check(L.api.canTools() === false, 'F1c Administrator: canTools() is false');
check(L.api.viewRole() === 'admin', "F1d Administrator lands on the admin view", 'got ' + L.api.viewRole());
check(JSON.stringify(viewsFor(TOK.administrator)) === '["admin"]',
    'F1e Administrator: a stored analyst/accountant view is refused, only admin is reachable',
    'reachable: ' + JSON.stringify(viewsFor(TOK.administrator)));
check(L.switcher() === false && L.legacySwitcher() === false, 'F1f Administrator gets no switcher (either copy)');
L = lens(TOK.administrator);
L.api.setView('analyst');
check(L.store['rrv8.viewRole'] == null, 'F1g Administrator: choosing the analyst view is not written to storage',
    'stored ' + L.store['rrv8.viewRole']);

// Analyst
L = lens(TOK.analyst);
check(L.api.canAccountant() === false, 'F2a Analyst: canAccountant() is false');
check(L.api.viewRole() === 'analyst', 'F2b Analyst lands on the analyst view', 'got ' + L.api.viewRole());
check(JSON.stringify(viewsFor(TOK.analyst)) === '["analyst"]',
    'F2c Analyst: a stored accountant (or admin) view is refused',
    'reachable: ' + JSON.stringify(viewsFor(TOK.analyst)));
check(L.switcher() === false, 'F2d Analyst gets no switcher');
check(L.api.canTools() === true, 'F2e CONTROL: Analyst still holds Tools');

// Accountant
L = lens(TOK.accountant);
check(L.api.viewRole() === 'accountant', 'F3a Accountant lands on the accountant view', 'got ' + L.api.viewRole());
check(JSON.stringify(viewsFor(TOK.accountant)) === '["accountant"]', 'F3b Accountant: no other view is reachable',
    'reachable: ' + JSON.stringify(viewsFor(TOK.accountant)));
check(L.switcher() === false, 'F3c Accountant gets no switcher');

// Power User
L = lens(TOK.powerUser);
check(L.api.viewRole() === 'admin', 'F4a Power User lands on the first entitled view (admin)', 'got ' + L.api.viewRole());
check(JSON.stringify(viewsFor(TOK.powerUser)) === JSON.stringify(VIEWS), 'F4b Power User can reach all three views',
    'reachable: ' + JSON.stringify(viewsFor(TOK.powerUser)));
check(L.switcher() === true && L.legacySwitcher() === true, 'F4c Power User gets the switcher');
check(JSON.stringify(L.offered()) === JSON.stringify(VIEWS), 'F4d and it offers all three views',
    'offered: ' + JSON.stringify(L.offered()));
L.api.setView('accountant');
check(L.store['rrv8.viewRole'] === 'accountant' && L.api.viewRole() === 'accountant',
    'F4e Power User: choosing a view is stored and honoured');

// Two lanes, no admin: the switcher follows the count of entitled views, not a rank.
L = lens({ n: 'DB', t: { adm: false }, perms: { dm: true, ac: true } });
check(L.switcher() === true && JSON.stringify(L.offered()) === '["analyst","accountant"]',
    'F5  analyst + accountant grants (no admin): switcher offers exactly those two',
    'switcher ' + L.switcher() + ', offered ' + JSON.stringify(L.offered()));

// No role: the no-grant state, no switcher, and a tampered store admits nothing.
L = lens(TOK.noRole, 'admin');
check(L.api.viewRole() === 'none' && L.switcher() === false,
    "F6  no grant: 'none', no switcher, a stored 'admin' is ignored", 'got ' + L.api.viewRole());

console.log('\n' + (failures === 0
    ? 'ALL CHECKS PASSED'
    : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
