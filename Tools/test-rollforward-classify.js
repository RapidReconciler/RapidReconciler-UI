/* test-rollforward-classify.js -- behaviour test for RRV8.rollForward (UI-57 / DAC-33).
 *
 *   node Tools/test-rollforward-classify.js
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-rollforward-classify.js
 *
 * WHY THIS EXISTS. RRV8.rollForward is the ONE producer of roll-forward state, read by
 * both Home's Account Roll Forward band and inventory-account-rollforward.html. Its
 * failure mode is not a crash -- it is a row silently counted as neither a break nor
 * unevaluated, which renders as a benign neutral chip. That has happened twice: the
 * '' -> 'yes' fallback, and the 'end' token (UI-57). Neither showed up as an error, and
 * parsecheck cannot see either, because both are perfectly valid JavaScript.
 *
 * ROW SHAPES ARE REAL, not invented. Measured on RapidReconciler_Demo1's
 * v6ui_raccountsummary 2026-08-18:
 *   end       GLOK 'end'      VarOK 'end - Aug 18 2026 11:52AM'  EndGLOK 'yes'  EndVarOK 'yes'
 *   baseline  GLOK 'baseline' VarOK '2026-08-18 11:48:33'        EndGLOK null   EndVarOK null
 *   plain     GLOK 'yes'      VarOK 'yes'                        EndGLOK null   EndVarOK null
 * The baseline row's BARE TIMESTAMP on VarOK and the end row's 'end - <ts>' prefix are
 * exactly the two shapes that made earlier versions fall through to 'unk'.
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

const RF = sandbox.window.RRV8 && sandbox.window.RRV8.rollForward;
if (!RF || typeof RF.classify !== 'function' || typeof RF.summary !== 'function') {
    console.error('FAIL RRV8.rollForward.classify/summary missing after loading config.js');
    process.exit(1);
}

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
    failures++;
}

function row(o) {
    return Object.assign({ CompanyNumber: '80002', LongAccount: '9999998.140909.SB09' }, o);
}

// ---- classify -------------------------------------------------------------------
console.log('classify()');
check('plain pass',
      RF.classify(row({ GLOK: 'yes', VarOK: 'yes' })),
      { glok: 'yes', varok: 'yes' });
check('plain GL break',
      RF.classify(row({ GLOK: 'no', VarOK: 'yes' })),
      { glok: 'no', varok: 'yes' });
check('baseline is baseline on BOTH axes even with a bare timestamp on VarOK',
      RF.classify(row({ GLOK: 'baseline', VarOK: '2026-08-18 11:48:33' })),
      { glok: 'baseline', varok: 'baseline' });
check('unevaluated: blank token is unk, never a pass',
      RF.classify(row({ GLOK: '', VarOK: '' })),
      { glok: 'unk', varok: 'unk' });

// The UI-57 cases. The token says 'end' on both axes; the verdict lives elsewhere.
check('end + yes/yes reads as a pass',
      RF.classify(row({ GLOK: 'end', VarOK: 'end - Aug 18 2026 11:52AM', EndGLOK: 'yes', EndVarOK: 'yes' })),
      { glok: 'yes', varok: 'yes' });
check('end + GL no reads as a BREAK (this is the UI-57 defect)',
      RF.classify(row({ GLOK: 'end', VarOK: 'end - Aug 18 2026 11:52AM', EndGLOK: 'no', EndVarOK: 'yes' })),
      { glok: 'no', varok: 'yes' });
check('end + variance no reads as a break on the variance axis',
      RF.classify(row({ GLOK: 'end', VarOK: 'end - Aug 18 2026 11:52AM', EndGLOK: 'yes', EndVarOK: 'no' })),
      { glok: 'yes', varok: 'no' });
check('end with a NULL verdict is unk, NOT a pass',
      RF.classify(row({ GLOK: 'end', VarOK: 'end - Aug 18 2026 11:52AM', EndGLOK: null, EndVarOK: null })),
      { glok: 'unk', varok: 'unk' });
check('end with the token carrying a timestamp still resolves',
      RF.classify(row({ GLOK: 'end - Aug 18 2026 11:52AM', VarOK: 'end - Aug 18 2026 11:52AM', EndGLOK: 'no', EndVarOK: 'no' })),
      { glok: 'no', varok: 'no' });

// ---- summary --------------------------------------------------------------------
// The counts Home's band and the page both print. A broken open period must appear.
console.log('summary()');
const rows = [
    row({ LongAccount: 'A', GLOK: 'yes', VarOK: 'yes' }),
    row({ LongAccount: 'B', GLOK: 'no',  VarOK: 'yes' }),
    row({ LongAccount: 'C', GLOK: 'baseline', VarOK: '2026-08-18 11:48:33' }),
    row({ LongAccount: 'D', GLOK: 'end', VarOK: 'end - x', EndGLOK: 'no',  EndVarOK: 'yes' }),
    row({ LongAccount: 'E', GLOK: 'end', VarOK: 'end - x', EndGLOK: 'yes', EndVarOK: 'yes' }),
    row({ LongAccount: 'F', GLOK: 'end', VarOK: 'end - x', EndGLOK: null,  EndVarOK: null }),
];
const s = RF.summary(rows, null);
check('scope covers every row', s.scopeRows, 6);
// B (plain no) + D (open period, GL no). E passes, C is baseline, F is unevaluated.
check('breaks counts the broken open period alongside the plain break', s.breaks, 2);
check('gl bucket holds both GL-side breaks', s.gl.rows, 2);
check('variance bucket is empty here', s.varc.rows, 0);
// F only. C is baseline and must never be in here.
check('unk holds the open period with no prior, and NOT the baseline row', s.unk.rows, 1);
check('unk names the right account', s.unk.accts.map(a => a.acct), ['F']);

// ---- the regression, stated as the pre-fix behaviour ----------------------------
// Before UI-57, classify() returned {glok:'end',varok:'end'} for row D, which matched
// neither 'no' nor 'unk', so it counted as neither a break nor unevaluated. If this
// assertion ever fails, that hole is back.
console.log('regression guard');
const dOnly = RF.summary([rows[3]], null);
check('a lone broken open period is 1 break, not 0', [dOnly.breaks, dOnly.unk.rows], [1, 0]);

console.log('');
if (failures) { console.log(failures + ' assertion(s) FAILED'); process.exit(1); }
console.log('all rollForward classifier assertions passed');
