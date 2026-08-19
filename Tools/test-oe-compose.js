/* test-oe-compose.js -- behaviour test for RRV8.oeEntry.compose (UI-21).
 *
 *   node Tools/test-oe-compose.js
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-oe-compose.js
 *
 * WHY THIS EXISTS. compose() decides what the accountant's adjusting entry contains
 * and what a deferred carry-forward comes to. Its failure mode is not a crash: every
 * pair is self-balancing, so the entry keeps showing "Balanced" no matter how wrong
 * the amounts are, and a drifting cfExcluded prints a deferred figure that does not
 * match what was actually left out. Both render perfectly. parsecheck cannot see
 * either -- both are valid JavaScript.
 *
 * ROW SHAPES ARE REAL, not invented. Measured on RapidReconciler_Demo1's
 * v6ui_raccountsummary 2026-08-19, filtered the way the Accounts grid filters
 * (one company + period, |OOB| >= 100):
 *
 *   A  Co 80002 / 2025-08-28, 7 accounts, 3 of them carrying a carry-forward.
 *      Excluding the carry-forward keeps all 7 -- amounts shrink on some accounts
 *      and GROW on another (141818 goes from 3,351.15 to 698.85; SB24 from 216.75
 *      to 184.12), so this fixture proves exclusion is not uniformly a reduction.
 *
 *   B  Co 80002 / 2025-07-31, 3 accounts whose Variance and JEs cancel EXACTLY.
 *      Every row's only accountant-owned content is its carry-forward, so excluding
 *      it empties the entry: 3 lines -> 0. This is the case that made the modal's
 *      empty-entry branch have to name the carry-forward instead of falling through
 *      to "Co 80002 is in balance", which would have been a lie -- the company is
 *      8,597.33 out; she had just removed the only journal-able part.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = path.join(__dirname, '..', 'RRV8', 'config.js');

// config.js is a browser script. It only needs a window to hang RRV8 off; nothing
// under test touches the DOM. A missing global would throw here, loudly.
const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = { getElementById: () => null, querySelector: () => null,
                     querySelectorAll: () => [], addEventListener: () => {},
                     createElement: () => ({ style: {}, classList: { add(){}, remove(){} } }) };
sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
sandbox.navigator = { language: 'en-US', userAgent: 'node' };
sandbox.location = { href: 'http://localhost/', search: '', hash: '' };
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.fetch = () => Promise.reject(new Error('no network in this harness'));

vm.createContext(sandbox);
try {
    new vm.Script(fs.readFileSync(CONFIG, 'utf8'), { filename: CONFIG }).runInContext(sandbox);
} catch (e) {
    console.error('FAIL could not load config.js: ' + (e && e.stack ? e.stack : e));
    process.exit(1);
}

const OE = sandbox.window.RRV8 && sandbox.window.RRV8.oeEntry;
if (!OE || typeof OE.compose !== 'function') {
    console.error('FAIL RRV8.oeEntry.compose missing after loading config.js');
    process.exit(1);
}

let failures = 0;
// Money compared to the cent. A tolerance, not a round: these are floats coming out
// of SQL decimals, and an exact === would fail on representation alone.
function near(name, got, want) {
    const g = Number(got), w = Number(want);
    if (!(Math.abs(g - w) < 0.005)) { console.error(`FAIL ${name}: got ${g}, want ${w}`); failures++; }
    else { console.log(`ok   ${name} = ${w}`); }
}
function eq(name, got, want) {
    if (got !== want) { console.error(`FAIL ${name}: got ${got}, want ${want}`); failures++; }
    else { console.log(`ok   ${name} = ${want}`); }
}

// ---- Fixture A: Co 80002 / 2025-08-28 (measured) ----------------------------
const A = [
  { LongAccount: '9999998.141818',      OOB:   698.85, BegVar: -4050.00, Variance:   698.85, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB15', OOB:  -501.49, BegVar:     0.00, Variance:  -501.49, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB19', OOB:  -364.34, BegVar:     0.00, Variance:  -364.34, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB23', OOB: -2070.95, BegVar:     0.00, Variance: -2070.95, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB24', OOB:   216.75, BegVar:   400.87, Variance:  -184.12, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB25', OOB:  -668.88, BegVar:     0.00, Variance:  -668.88, JEs:     0.00, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.147272',      OOB: -5666.46, BegVar: -4948.20, Variance:  2729.77, JEs: -3448.03, UnpostBatch: 0, EndofDay: 0 }
];

console.log('-- A: carry-forward INCLUDED (the default) --');
const ai = OE.compose(A, { exclCF: false });
eq  ('A incl lines',      ai.lines.length, 7);
near('A incl drTot',      ai.drTot,     12840.02);
near('A incl crTot',      ai.crTot,     12840.02);
near('A incl net',        ai.net,      -12406.52);
near('A incl cfTotal',    ai.cfTotal,   -8597.33);
near('A incl cfExcluded', ai.cfExcluded,       0);   // nothing deferred when it's included
near('A incl timing',     ai.timingTotal,      0);
// The account that carries a carry-forward takes the LARGER amount when it's included.
near('A incl 141818 amt', ai.lines[0].amt, 3351.15);

console.log('-- A: carry-forward EXCLUDED --');
const ax = OE.compose(A, { exclCF: true });
eq  ('A excl lines',      ax.lines.length, 7);        // none drop: each still has activity
near('A excl drTot',      ax.drTot,      5206.89);
near('A excl crTot',      ax.crTot,      5206.89);
near('A excl net',        ax.net,       -3809.19);
near('A excl cfTotal',    ax.cfTotal,   -8597.33);    // in scope either way -- it labels the toggle
near('A excl cfExcluded', ax.cfExcluded, -8597.33);
near('A excl 141818 amt', ax.lines[0].amt, 698.85);   // 3,351.15 -> 698.85
near('A excl SB24 amt',   ax.lines[4].amt, 184.12);   // 216.75 -> 184.12

// THE INVARIANT THAT MATTERS. Whatever came out of the entry is exactly the figure
// printed as deferred. If these two ever part company, the modal reports a deferral
// that does not match what it actually left out -- and the entry still says "Balanced".
// Exact here because fixture A drops no rows; fixture B covers the dropping case.
near('A net(incl) - net(excl) == cfTotal', ai.net - ax.net, ai.cfTotal);

// The AI read is grounded on comp, so comp must add up to the entry it describes. If
// these drift, the narrative names a driver the entry does not contain -- which is the
// exact failure the ported prompt's "use ONLY the largest component" rule guards, and
// that rule is worthless if the components themselves are wrong.
near('A incl comp sums to net', ai.comp.cf + ai.comp.tx + ai.comp.je, ai.net);
near('A excl comp sums to net', ax.comp.cf + ax.comp.tx + ax.comp.je, ax.net);
near('A excl comp.cf is zero',  ax.comp.cf, 0);          // excluded means absent, not small
near('A incl comp.cf',          ai.comp.cf, -8597.33);

// ---- Fixture B: Co 80002 / 2025-07-31 (measured) — every row is carry-forward only
const B = [
  { LongAccount: '9999998.141818',      OOB: -4050.00, BegVar: -4050.00, Variance: 3487.35, JEs: -3487.35, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.144545.SB24', OOB:   400.87, BegVar:   400.87, Variance: 1160.59, JEs: -1160.59, UnpostBatch: 0, EndofDay: 0 },
  { LongAccount: '9999998.147272',      OOB: -4948.20, BegVar: -4948.20, Variance: 6850.78, JEs: -6850.78, UnpostBatch: 0, EndofDay: 0 }
];

console.log('-- B: carry-forward INCLUDED --');
const bi = OE.compose(B, { exclCF: false });
eq  ('B incl lines',   bi.lines.length, 3);
near('B incl drTot',   bi.drTot,   9399.07);
near('B incl net',     bi.net,    -8597.33);
near('B incl cfTotal', bi.cfTotal, -8597.33);

console.log('-- B: carry-forward EXCLUDED empties the entry --');
const bx = OE.compose(B, { exclCF: true });
eq  ('B excl lines',      bx.lines.length, 0);        // all three drop
near('B excl drTot',      bx.drTot,             0);
near('B excl crTot',      bx.crTot,             0);
near('B excl net',        bx.net,               0);
near('B excl cfTotal',    bx.cfTotal,    -8597.33);   // still reported: it is what got deferred
near('B excl cfExcluded', bx.cfExcluded, -8597.33);
// Every row dropped, so the entry contains nothing -- comp must say so rather than
// reporting the components of rows that are not in it.
near('B excl comp.cf', bx.comp.cf, 0);
near('B excl comp.tx', bx.comp.tx, 0);
near('B excl comp.je', bx.comp.je, 0);
near('B incl comp sums to net', bi.comp.cf + bi.comp.tx + bi.comp.je, bi.net);

// ---- Structural invariants -------------------------------------------------
// Debits always equal credits, because each line becomes a self-balancing pair. This
// is what lets the carry-forward drop out without unbalancing anything.
[['A incl', ai], ['A excl', ax], ['B incl', bi], ['B excl', bx]].forEach(function (p) {
    near(p[0] + ' balanced (drTot == crTot)', p[1].drTot, p[1].crTot);
});
// Empty input is not an error -- an in-balance company reaches compose() too.
const empty = OE.compose([], { exclCF: false });
eq  ('empty lines', empty.lines.length, 0);
near('empty cfTotal', empty.cfTotal, 0);
// A missing opts object must behave as carry-forward INCLUDED (the documented default),
// not throw and not silently exclude.
const noOpts = OE.compose(A);
near('no opts == included', noOpts.net, ai.net);
near('no opts defers nothing', noOpts.cfExcluded, 0);

// The drop floor is a dollar, and it is read from the export so home.html and this
// test cannot disagree about it.
eq('DROP_UNDER', OE.DROP_UNDER, 1);
const justUnder = OE.compose([{ LongAccount: 'X', BegVar: 0, Variance: 0.99, JEs: 0 }], {});
eq('0.99 drops', justUnder.lines.length, 0);
const justOver = OE.compose([{ LongAccount: 'X', BegVar: 0, Variance: 1.01, JEs: 0 }], {});
eq('1.01 stays', justOver.lines.length, 1);

if (failures) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log('\nall assertions passed');
