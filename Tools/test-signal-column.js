/* test-signal-column.js -- behaviour test for the Transaction Details Signal column
 * (UI-165 follow-up, found 2026-08-30).
 *
 *   node Tools/test-signal-column.js
 *
 * WHY THIS EXISTS. The Signal column rendered correctly and was still unreachable. Its
 * COLUMN KEY is 'Signal', but no row ever carries a `Signal` property -- the row carries
 * SignalCount, SignalCodes and SignalGross. sortRows read `a[key]`, so sorting the column
 * compared undefined to undefined on every row and reordered nothing. On the owner's own
 * screen that was 8 signalled rows inside 454: the column was on, correct, and could not
 * be scrolled to. He reported "I still see nothing in the signal column" twice.
 *
 * That is the same defect class as a message with no sink. The value existed, the renderer
 * worked, and no path led a person to it.
 *
 * WHAT THIS ASSERTS.
 *   A1  Every COLUMNS key either names a real row field or declares `sortVal`. This is the
 *       general form of the bug -- Signal was the first synthetic key, and the next one
 *       must not repeat it silently.
 *   A2  The Signal column declares sortVal, sortNumeric and sortFirst: 'desc'.
 *   A3  sortRows USES the accessor rather than indexing the row by key.
 *   A4  A new column's first click honours sortFirst. Ascending would put the ~98% of
 *       rows carrying no signal first, and a first click that surfaces nothing reads as a
 *       broken column just as loudly as no sort at all.
 *   A5  renderSignalCell still returns empty for an unsignalled row -- the fix must not
 *       start painting something on all 454.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'inventory-transactions.html'), 'utf8');
const code = html.replace(/^[ \t]*\/\/.*$/gm, '');   // line comments only -- see UI-170

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
}

console.log('test-signal-column.js (UI-165 follow-up)');

/* ---- A1: no synthetic key without a sort accessor -------------------------------- */
// The row fields the grid is built from, taken from the renderers themselves.
const rowFields = new Set(
    (code.match(/\br\.([A-Za-z_][A-Za-z0-9_]*)/g) || []).map(s => s.slice(2))
);
const colBlock = code.slice(code.indexOf('const COLUMNS'), code.indexOf('const COL_LS_KEY'));
// Split on the entry opener rather than matching to end-of-line: a column definition may
// span several lines (Signal's sortVal does), and a line-bounded match silently drops the
// declaration it is looking for -- which is how the first run of this test reported a
// defect that was not there.
const cols = colBlock.split(/\{\s*key\s*:\s*'/).slice(1).map(chunk => {
    const key = chunk.slice(0, chunk.indexOf("'"));
    return { key, rest: chunk };
});

const synthetic = cols.filter(c => !rowFields.has(c.key) && !/sortVal\s*:/.test(c.rest));
check('A1 every column key is a row field or declares sortVal',
      synthetic.map(c => c.key), []);

/* ---- A2: the Signal column declares its sort contract ---------------------------- */
const sig = cols.find(c => c.key === 'Signal');
check('A2 Signal column exists', !!sig, true);
check('A2 Signal declares sortVal off SignalGross',
      /sortVal:\s*r\s*=>\s*Math\.abs\(Number\(r\.SignalGross\)/.test(colBlock), true);
check('A2 Signal declares sortNumeric', /sortNumeric:\s*true/.test(colBlock), true);
check('A2 Signal declares sortFirst desc', /sortFirst:\s*'desc'/.test(colBlock), true);

/* ---- A3: sortRows uses the accessor ---------------------------------------------- */
check('A3 sortRows builds an accessor from col.sortVal',
      /const\s+acc\s*=\s*\(typeof\s+col\.sortVal\s*===\s*'function'\)/.test(code), true);
check('A3 sortRows reads through the accessor, not a[key]',
      /const\s+av\s*=\s*acc\(a\),\s*bv\s*=\s*acc\(b\)/.test(code), true);
check('A3 sortRows honours sortNumeric', /col\.sortNumeric\s*===\s*true/.test(code), true);

/* ---- A4: first click honours sortFirst ------------------------------------------- */
check('A4 a new sort column consults sortFirst',
      /sortFirst\s*===\s*'desc'\)\s*\?\s*'desc'\s*:\s*'asc'/.test(code), true);

/* ---- A5: unsignalled rows still render nothing ----------------------------------- */
check('A5 renderSignalCell returns empty when SignalCount is 0',
      /function renderSignalCell\(r\)\s*\{\s*if\s*\(!\(Number\(r\.SignalCount\)\s*>\s*0\)\)\s*return\s*'';/.test(code), true);

console.log(failures === 0
    ? 'test-signal-column.js PASSED'
    : 'test-signal-column.js FAILED (' + failures + ')');
process.exit(failures === 0 ? 0 : 1);
