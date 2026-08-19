/* test-variance-tieout.js -- behaviour test for RRV8.varianceTieOut (UI-21 follow-on).
 *
 *   node Tools/test-variance-tieout.js
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-variance-tieout.js
 *
 * WHY THIS EXISTS. The accountant drawer prints six components, a total, and a
 * "closes / does not close" verdict against the account's out-of-balance. If the
 * identity is wrong the drawer still renders perfectly -- six plausible numbers, a
 * total, and a red flag on accounts that are actually fine (or a green tick on ones
 * that are not). Nothing throws. parsecheck cannot see it. The only thing standing
 * between that and the analyst is this file.
 *
 * THE SIGN IS THE WHOLE GAME. UnpostBatch and EndofDay SUBTRACT. Adding them instead
 * does not produce a small error -- it doubles it, because the amount moves from one
 * side of the equation to the other. Measured: straight addition of all six failed on
 * 32 Demo2 rows and 12 Demo3 rows, and on those rows the miss was exactly twice the
 * four-term miss. `sign trap` below is that case, pinned.
 *
 * ROWS ARE REAL, not invented. Measured on v6ui_raccountsummary 2026-08-19:
 *   - three Demo3 rows carrying large End of Day and Unposted amounts (the only rows
 *     that can discriminate the sign at all);
 *   - one Demo2 row from the account whose tie-out misses by exactly $0.01 in four
 *     consecutive periods -- the reason `closes` runs on a tolerance.
 *
 * ⚠ Do NOT add a Demo1 row and call it coverage. Demo1 has no account with material
 *   timing, so every sign arrangement ties there, including the wrong ones.
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

const VT = sandbox.window.RRV8 && sandbox.window.RRV8.varianceTieOut;
if (!VT || typeof VT.decompose !== 'function' || typeof VT.decomposeByName !== 'function') {
    console.error('FAIL RRV8.varianceTieOut.decompose/decomposeByName missing after loading config.js');
    process.exit(1);
}

let failures = 0;
function near(name, got, want, tol) {
    const g = Number(got), w = Number(want), t = tol == null ? 0.005 : tol;
    if (!(Math.abs(g - w) < t)) { console.error(`FAIL ${name}: got ${g}, want ${w}`); failures++; }
    else { console.log(`ok   ${name} = ${w}`); }
}
function eq(name, got, want) {
    if (got !== want) { console.error(`FAIL ${name}: got ${got}, want ${want}`); failures++; }
    else { console.log(`ok   ${name} = ${want}`); }
}

// ---- Measured rows -----------------------------------------------------------
// Demo3 30002 B000107.1121 2023-05-31 -- End of Day dominates and is NEGATIVE, so a
// wrong sign here is unmissable: the total swings by over 1.5M.
const D3a = { BegVar: 31184.14, Variance: 0, JEs: 0, CardexVar: 0,
              UnpostBatch: 23680.24, EndofDay: -766833.15, OOB: 774337.05 };
// Demo3 30001 B000022.1121 2023-05-31 -- both deductions negative.
const D3b = { BegVar: -106243.46, Variance: 280.67, JEs: 0, CardexVar: 0,
              UnpostBatch: -61.75, EndofDay: -662425.68, OOB: 556524.64 };
// Demo3 30002 B000107.1121 2022-03-31 -- End of Day POSITIVE, so it genuinely reduces
// the total. Pairs with D3a to pin the sign in both directions.
const D3c = { BegVar: 194452.47, Variance: -31963.21, JEs: 0.54, CardexVar: 0,
              UnpostBatch: 0, EndofDay: 228947.48, OOB: -66457.68 };
// Demo2 80023 B002557.1228 2024-12-31 -- the $0.01 float-dust account.
const D2p = { BegVar: -24211.38, Variance: -3446.60, JEs: -6490.13, CardexVar: 0,
              UnpostBatch: 0, EndofDay: 0, OOB: -34148.10 };

console.log('-- the identity holds on measured rows --');
[['D3a', D3a], ['D3b', D3b], ['D3c', D3c]].forEach(function (p) {
    const d = VT.decompose(p[1]);
    near(p[0] + ' total == OOB', d.total, p[1].OOB);
    near(p[0] + ' diff', d.diff, 0);
    eq  (p[0] + ' closes', d.closes, true);
});

console.log('-- tolerance: a penny of float dust still closes --');
const dp = VT.decompose(D2p);
near('D2p diff is a cent', Math.abs(dp.diff), 0.01, 0.002);
eq  ('D2p closes anyway', dp.closes, true);
eq  ('TOLERANCE', VT.TOLERANCE, 0.01);
// The boundary, on a clean synthetic so the assertion says what it means. Perturbing
// D2p is the wrong way to build this: its diff is already -0.01, so moving OOB by 0.02
// lands on +0.01 — still a cent, and the test passes while proving nothing.
const bound = function (oob) { return VT.decompose({ BegVar: 100, OOB: oob }); };
near('boundary diff at a cent',  bound(99.99).diff,  0.01);
eq  ('a cent closes',            bound(99.99).closes, true);
near('boundary diff at 2 cents', bound(99.98).diff,  0.02);
eq  ('2 cents does NOT close',   bound(99.98).closes, false);
eq  ('a cent the other way closes', bound(100.01).closes, true);

console.log('-- THE SIGN TRAP: adding the deductions doubles the error --');
// Reproduce the wrong identity by hand and confirm it misses by exactly 2x the
// timing amount. This is the failure that shipped-looking code would have had.
[['D3a', D3a], ['D3b', D3b], ['D3c', D3c]].forEach(function (p) {
    const r = p[1];
    const wrong = r.BegVar + r.Variance + r.JEs + r.CardexVar + r.UnpostBatch + r.EndofDay;
    const timing = r.UnpostBatch + r.EndofDay;
    near(p[0] + ' wrong-sign miss == 2x timing', wrong - r.OOB, 2 * timing);
});

console.log('-- parts carry raw and signed separately --');
const d = VT.decompose(D3a);
eq  ('six parts', d.parts.length, 6);
eq  ('order[0]', d.parts[0].name, 'Carry forward');
eq  ('order[5]', d.parts[5].name, 'End of Day');
eq  ('Unposted sign', d.parts[4].sign, -1);
eq  ('End of Day sign', d.parts[5].sign, -1);
eq  ('Cardex sign', d.parts[3].sign, 1);
// raw is what gets rendered next to a leading minus; signed is what sums. Rendering
// `signed` for a negative deduction would print a double negative to the analyst.
near('EndofDay raw', d.parts[5].raw, -766833.15);
near('EndofDay signed', d.parts[5].signed, 766833.15);

console.log('-- every component carries a short label for the chip row --');
// `short` is display-only, but the chip row falls back to the canonical `name` when it
// is missing -- silently, and the row then overflows instead of erroring. A component
// added without one would look fine in every test that checks arithmetic.
VT.COMPONENTS.forEach(function (k) {
    eq('short: ' + k.name, typeof k.short === 'string' && k.short.length > 0, true);
    eq('short no longer than name: ' + k.name, k.short.length <= k.name.length, true);
});
eq('short survives decompose', VT.decompose(D3a).parts[5].short, 'EOD');

console.log('-- company grain: decomposeByName gives the same answer --');
const byName = {};
VT.COMPONENTS.forEach(function (k) { byName[k.name] = D3b[k.f]; });
const dn = VT.decomposeByName(byName, D3b.OOB);
near('byName total matches decompose', dn.total, VT.decompose(D3b).total);
eq  ('byName closes', dn.closes, true);

console.log('-- degenerate input is not an error --');
const empty = VT.decompose({});
near('empty total', empty.total, 0);
near('empty oob', empty.oob, 0);
eq  ('empty closes', empty.closes, true);      // 0 == 0
eq  ('empty still has six parts', empty.parts.length, 6);   // zeros are shown, not omitted
eq  ('null row survives', VT.decompose(null).parts.length, 6);

if (failures) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log('\nall assertions passed');
