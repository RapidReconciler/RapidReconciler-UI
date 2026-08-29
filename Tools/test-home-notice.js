/* test-home-notice.js -- behaviour test for the Home failed-load notice (UI-169).
 *
 *   node Tools/test-home-notice.js
 *
 * WHY THIS EXISTS. On 2026-08-29 the owner opened Home and got a blank page. Every
 * data call was returning 401 -- an ordinary rejected session -- and nothing on screen
 * said so. The page had already worked out the right words: sidebar.js exports
 * RRV8.fetchErrorMessage, whose 401 branch says "Your sign-in for this database was
 * rejected as invalid or expired. Sign out and sign in again", and whose comment records
 * that merging 401 with 403 had previously cost real time. That sentence could not reach
 * the reader for TWO independent reasons, and either alone was enough:
 *
 *   1. home.html never called fetchErrorMessage. Zero occurrences.
 *   2. Its rrFetch threw `new Error('HTTP ' + r.status + ...)` -- the status baked into
 *      the message STRING, with no numeric `.status` on the error. fetchErrorMessage
 *      keys every branch on a finite `err.status`, so it computed null and fell past
 *      401, 403 and 404 to the generic tail even where it was called.
 *
 * What the reader got instead was three console.warn lines naming the consequence
 * exactly -- "_invRows stays null, so the analyst brief and worklist will not render" --
 * in a place no user opens. A console is not a sink.
 *
 * WHAT THIS ASSERTS. The producer, the wiring, and the sink, because this defect was
 * two of the three being right.
 *
 *   A1  rrFetch stamps a NUMERIC err.status before throwing, and calls the reporter.
 *   A2  home.html actually calls RRV8.fetchErrorMessage, and sidebar.js exports it.
 *   A3  #homeNotice is NOT inside any admin-only or attention-only container. This is
 *       the UI-13 regression in a new place: tidying the banner under #view-admin or
 *       #instanceHealth would take the message away from Accountants and Analysts and
 *       nothing else would fail.
 *   A4  .home-notice carries its own [hidden] rule. It is a flex container, and
 *       `display: flex` beats the hidden attribute -- the exact defect UI-159 fixed for
 *       .ihs-chip, where el.hidden = true did nothing at all.
 *   A5  Auth precedence: a 401 already showing is never displaced by a later non-auth
 *       failure. A rejected session CAUSES the other failures on the page; showing the
 *       reader a downstream 500 instead sends them to the wrong problem.
 *   A6  The notice is cleared on a database switch, so the previous instance's failure
 *       cannot sit beside the new instance's numbers.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const html    = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8');
const sidebar = fs.readFileSync(path.join(ROOT, 'RRV8', 'sidebar.js'), 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

/* Comments are stripped before every source assertion. Without this, an explanation
 * ABOVE a producer satisfies a test that the producer exists -- prose is not a test.
 *
 * LINE comments only, deliberately. The obvious block-comment strip is unsafe on these
 * files: a slash-star or star-slash inside a string or a regex literal pairs with the
 * wrong delimiter and swallows everything between. Measured 2026-08-29 on sidebar.js --
 * it removed 55,819 of 116,021 bytes, 48% of the file, taking the
 * RRV8.fetchErrorMessage export with it, so A2 below failed against code that was
 * plainly there. A stripper that silently deletes half the subject makes every
 * assertion after it meaningless in BOTH directions. The line form is safe because it
 * only matches a comment opening a line, so a URL inside a string survives. */
function stripComments(src) {
    return src.replace(/^[ \t]*\/\/.*$/gm, '');
}
const code = stripComments(html);

console.log('test-home-notice.js (UI-169)');

/* ---- A1: rrFetch stamps a numeric status and reports it -------------------------- */
check('A1 rrFetch assigns a numeric err.status',
      /err\.status\s*=\s*r\.status/.test(code), true);
check('A1 rrFetch calls the failure reporter',
      /_noteFetchFailure\s*\(\s*area\s*,\s*err\s*\)/.test(code), true);
check('A1 the reporter is defined in this file',
      /function\s+_noteFetchFailure\s*\(/.test(code), true);

/* ---- A2: the sentence producer is exported and actually called ------------------- */
check('A2 sidebar.js exports RRV8.fetchErrorMessage',
      /RRV8\.fetchErrorMessage\s*=\s*fetchErrorMessage/.test(sidebar), true);
check('A2 home.html calls RRV8.fetchErrorMessage',
      /RRV8\.fetchErrorMessage\s*\(/.test(code), true);

/* ---- A3: the sink is reachable by every role ------------------------------------- */
const noticeAt = html.indexOf('id="homeNotice"');
check('A3 #homeNotice exists in the markup', noticeAt > -1, true);

/* Walk backwards counting unclosed opening tags to find the element's ancestors. Any
 * role-gated or attention-gated ancestor is a failure, whatever it is called. */
const before   = html.slice(0, noticeAt);
const gated    = ['view-admin', 'adminGrid', 'instanceHealth', 'view-firstrun'];
const enclosing = gated.filter(function (id) {
    const open = before.lastIndexOf('id="' + id + '"');
    if (open < 0) return false;                       // never opened before the notice
    // opened earlier -- is it still open at the notice? crude but sufficient: the
    // container's own closing comment or the next view opener would appear between.
    return html.slice(open, noticeAt).indexOf('</div>\n\n  <!-- ') < 0;
});
check('A3 #homeNotice has no admin-only or first-run ancestor', enclosing, []);

/* ---- A4: hidden actually hides a flex container ---------------------------------- */
check('A4 .home-notice is display:flex',
      /\.home-notice\s*\{[^}]*display:\s*flex/.test(code), true);
check('A4 .home-notice[hidden] { display: none } exists',
      /\.home-notice\[hidden\]\s*\{\s*display:\s*none/.test(code), true);

/* ---- A5: auth failures outrank later non-auth failures --------------------------- */
const reporter = (code.match(/function\s+_noteFetchFailure\s*\([\s\S]*?\n  \}/) || [''])[0];
check('A5 the reporter recognises 401 and 403 as auth',
      /401[\s\S]{0,40}403/.test(reporter), true);
check('A5 a standing auth notice is kept rather than overwritten',
      /haveAuth\s*\|\|\s*!\s*isAuth/.test(reporter), true);
check('A5 the reporter counts every failure, not only the shown one',
      /_noticeCount\+\+/.test(reporter), true);

/* ---- A6: cleared on a database switch -------------------------------------------- */
check('A6 a clear function exists',
      /function\s+_clearHomeNotice\s*\(/.test(code), true);
check('A6 it is called on the database switch, beside the freshness repaint',
      /_paintFreshPill\(\);\s*\n\s*_clearHomeNotice\(\);/.test(code), true);

console.log(failures === 0
    ? 'test-home-notice.js PASSED'
    : 'test-home-notice.js FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
