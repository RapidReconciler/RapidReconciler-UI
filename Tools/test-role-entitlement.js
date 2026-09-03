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
 *   A4  _roleRank() scores an unknown role BELOW accountant, so _canSwitchRole()
 *       (rank > 0) stays false for 'none' and _viewRole()'s localStorage clamp
 *       (rank <= max) admits no stored role. Without this a tampered
 *       rrv8.viewRole would let a lane-less user pick a view.
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

/* ---- A2/A3: the ladder reads the grant and has a no-grant terminal --------------- */
const ladder = (function () {
    const at = code.indexOf('function _entitledRole()');
    if (at === -1) return '';
    // The body runs to the next top-level `function ` at the same indent.
    const rest = code.slice(at);
    const end = rest.indexOf('\n  function ', 1);
    return end === -1 ? rest.slice(0, 600) : rest.slice(0, end);
})();

check(ladder !== '', 'A2a _entitledRole() is present', 'could not locate it in home.html');
check(/canAccountant\s*\(\s*\)/.test(ladder),
    'A2b _entitledRole() consults canAccountant()',
    'the bottom rung is not reading its own grant:\n         ' + ladder.replace(/\s+/g, ' ').slice(0, 200));
check(/['"]none['"]/.test(ladder),
    "A2c _entitledRole() can return 'none'",
    'there is no no-grant state, so a token with neither lane still resolves to a view it was not granted');
// The defect shape: `: 'accountant'` as the final else, with nothing after it.
check(!/\?\s*['"]analyst['"]\s*:\s*['"]accountant['"]\s*;?\s*\}?\s*$/m.test(ladder.trim()),
    "A3  the ladder no longer falls through to a bare 'accountant' else-branch",
    'the else-branch is back: ' + ladder.replace(/\s+/g, ' ').slice(0, 200));

/* ---- A4: an unknown role outranks nothing --------------------------------------- */
const rankLine = (code.match(/function\s+_roleRank\s*\([^)]*\)\s*\{[^}]*\}/) || [''])[0];
check(/-1|-\s*1/.test(rankLine),
    'A4a _roleRank() scores an unknown role below accountant (negative)',
    'got: ' + rankLine.replace(/\s+/g, ' '));
// Exercise it rather than reading it: build the function and run it.
let rank = null;
try { rank = eval('(' + rankLine.replace(/^function\s+_roleRank/, 'function') + ')'); } catch (_) {}
check(rank && rank('none') < 0 && rank('accountant') === 0 && rank('analyst') === 1 && rank('admin') === 2,
    'A4b _roleRank() evaluated: none < accountant < analyst < admin',
    rank ? JSON.stringify(['none', 'accountant', 'analyst', 'admin'].map(rank)) : 'could not evaluate _roleRank');
check(rank && !(rank('none') > 0),
    "A4c _canSwitchRole()'s test (rank > 0) is false for 'none'",
    'a lane-less user would be offered a role switcher');

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
['#view-admin', '#analystBody', '#analystSectionHead', '#acctTop']
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
check(/canAnalyst\s*\(\s*\)\s*\?\s*['"]analyst['"]/.test(ladder),
    'A9b CONTROL: the analyst rung still resolves through canAnalyst()',
    'the ladder stopped reading the lane that was already wired');
check(/isAdmin\s*\(\s*\)\s*\?\s*['"]admin['"]/.test(ladder),
    'A9c CONTROL: admin is still the top rung',
    'the ladder lost its admin branch');

console.log('\n' + (failures === 0
    ? 'ALL CHECKS PASSED'
    : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
