/* test-residual-dust.js -- behaviour test for RRV8.residual (the zero-quantity rule).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-residual-dust.js
 *
 * WHY THIS EXISTS. The Residual Optimizer looked broken and was not: every surface tested
 * `Number(Quantity) === 0`, an EXACT zero, while the grids render quantity at two
 * decimals. A row holding 0.004 shows "0" on screen and was invisible to the model.
 *
 * MEASURED on Demo3 Co 30001 / 2023-05-31 via usp6getasof_v2, 20,473 rows:
 *     Quantity exactly 0 ................   1 row   <- all the optimizer could ever find
 *     |Quantity| < 0.005 (displays as 0) . 177 rows
 * The optimizer dutifully hid that one row and reported "1 row, 0.00", which is what the
 * owner saw. The arithmetic was right; the definition was wrong.
 *
 * This failure mode is invisible from the code: `=== 0` reads correct, throws nothing, and
 * produces a plausible small number. The only thing that catches it is pinning the rule to
 * the display precision and asserting the boundary.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = path.join(__dirname, '..', 'RRV8', 'config.js');

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

const R = sandbox.window.RRV8 && sandbox.window.RRV8.residual;
if (!R || typeof R.isZeroQty !== 'function') {
    console.error('FAIL RRV8.residual.isZeroQty missing after loading config.js');
    process.exit(1);
}

let failures = 0;
function eq(name, got, want) {
    if (got !== want) { console.error(`FAIL ${name}: got ${got}, want ${want}`); failures++; }
    else { console.log(`ok   ${name} = ${want}`); }
}

console.log('-- the threshold IS the display precision, not a taste --');
// The grids format quantity with maximumFractionDigits: 2. Anything that renders as "0"
// must be treated as zero, or the model and the screen disagree about the same row.
eq('QTY_EPS', R.QTY_EPS, 0.005);

console.log('-- the boundary --');
eq('exact 0 is zero',        R.isZeroQty(0),        true);
eq('0.004 is zero (shows 0)', R.isZeroQty(0.004),   true);
eq('-0.004 is zero',          R.isZeroQty(-0.004),  true);
eq('0.005 is NOT zero',       R.isZeroQty(0.005),   false);   // renders as 0.01
eq('-0.005 is NOT zero',      R.isZeroQty(-0.005),  false);
eq('0.01 is NOT zero',        R.isZeroQty(0.01),    false);
eq('1 is NOT zero',           R.isZeroQty(1),       false);

console.log('-- the regression this exists to catch --');
// If anyone restores the exact-zero test, 0.004 stops being dust and the optimizer goes
// back to finding one row on a 20,000-row grid.
eq('0.004 would fail an exact test', (Number(0.004) || 0) === 0, false);
eq('...but is dust under the rule',  R.isZeroQty(0.004),         true);

console.log('-- degenerate input is not an error --');
eq('null',      R.isZeroQty(null),      true);   // no quantity = nothing on hand
eq('undefined', R.isZeroQty(undefined), true);
eq('empty str', R.isZeroQty(''),        true);
eq('NaN',       R.isZeroQty('abc'),     true);   // unparseable coerces to 0, same as the old test
eq('numeric string 0.004', R.isZeroQty('0.004'), true);
eq('numeric string 5',     R.isZeroQty('5'),     false);

if (failures) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log('\nall assertions passed');
