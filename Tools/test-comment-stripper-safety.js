/* test-comment-stripper-safety.js -- no behaviour test may strip block comments with a
 * naive regex (UI-170).
 *
 *   node Tools/test-comment-stripper-safety.js
 *
 * WHY THIS EXISTS. Several behaviour tests assert against SOURCE TEXT, and they strip
 * comments first so that an explanation sitting above a producer cannot satisfy a test
 * that the producer exists. The obvious way to strip block comments is
 * /\/\*[\s\S]*?\*\//g -- and it is unsafe on these files. A `/*` or `*​/` inside a STRING
 * or a REGEX LITERAL pairs with the wrong delimiter and swallows everything between.
 *
 * MEASURED 2026-08-29 on RRV8/sidebar.js: that expression removed 55,819 of 116,021
 * bytes -- 48% of the file -- taking the RRV8.fetchErrorMessage export with it, so an
 * assertion failed against code that was plainly there. A stripper that silently deletes
 * half its subject makes every assertion after it meaningless in BOTH directions, and the
 * dangerous direction is the quiet one: a false FAIL is noisy and gets investigated, a
 * false PASS is silent and does not.
 *
 * THE SAFE FORMS, both already in the repo:
 *   - line comments only, /^[ \t]*\/\/.*$/gm -- matches only a comment that OPENS a line,
 *     so a URL inside a string survives. Used by test-home-notice.js and
 *     test-signal-column.js.
 *   - a real scanner that tracks quotes and escapes. Tools/check_txv_cards.py does this
 *     properly and RAISES an "unterminated block comment" error rather than guessing. That
 *     is the reference implementation if a test ever genuinely needs block comments gone.
 *     (Note this file cannot write that delimiter pair in its own prose without closing
 *     its own comment early -- which is the hazard, demonstrating itself.)
 *
 * WHAT THIS ASSERTS. No file in Tools/test-*.js contains the naive block-strip. The sweep
 * was clean when written -- the hazard was confined to the one test that found it -- so
 * this is a guard against reintroduction, not a repair. A point-in-time audit closes
 * nothing; the next person reaching for the obvious regex is the risk.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^test-.*\.js$/.test(f));

let failures = 0;
console.log('test-comment-stripper-safety.js (UI-170) -- ' + files.length + ' test file(s)');

if (files.length === 0) {
    console.log('  FAIL no Tools/test-*.js found -- the suite has vanished, which is itself a failure');
    failures++;
}

/* PLAIN SUBSTRING SEARCH, not a regex matching a regex. The first version of this guard
 * tried to pattern-match the offending pattern and had a syntax error of its own -- a
 * guard that cannot load is worse than no guard, because the suite still reports a count.
 * These are the literal character sequences a naive block strip contains, whichever
 * quantifier form it is written in. */
const NAIVE = [
    '[\\s\\S]*?\\*\\/',   // /\/\*[\s\S]*?\*\//
    '[^]*?\\*\\/',        // /\/\*[^]*?\*\//
    '\\/\\*.*?\\*\\/'     // /\/\*.*?\*\//s
];

files.forEach(f => {
    if (f === path.basename(__filename)) return;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    // CSS IS THE ONE LEGITIMATE CASE and it cannot be fixed by narrowing to line
    // comments, because CSS has no line-comment form. Measured 2026-08-30 across every
    // stylesheet in RRV8 -- 25 blocks, 612,791 bytes -- the naive strip damaged NONE of
    // them: no stylesheet that was brace-balanced before became unbalanced after. So the
    // pattern is permitted where a file marks it deliberately, and only there. The marker
    // has to be explicit so the exemption is a decision somebody made, not a coincidence.
    const exempt = src.indexOf('stripper-safety: css-only') !== -1;
    const hit = !exempt && NAIVE.some(p => src.indexOf(p) !== -1);
    if (hit) {
        failures++;
        console.log('  FAIL ' + f + ' strips block comments with a naive regex.\n'
            + '         A /* or */ inside a string or regex literal pairs with the wrong\n'
            + '         delimiter. Measured on sidebar.js: 48% of the file removed, silently.\n'
            + '         Use /^[ \\t]*\\/\\/.*$/gm, or a real scanner like check_txv_cards.py.');
    } else {
        console.log('  ok   ' + f);
    }
});

console.log(failures === 0
    ? 'test-comment-stripper-safety.js PASSED'
    : 'test-comment-stripper-safety.js FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
