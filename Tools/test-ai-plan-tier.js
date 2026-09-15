/* test-ai-plan-tier.js -- behaviour test for the Home AI-plan chip (VLC-63).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-ai-plan-tier.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron
 * host and this test runs on it. Any Node-compatible binary works.)
 *
 * WHY THIS EXISTS. loadAiPlan() opened with
 *
 *     if (IS_DEMO || !isAdmin()) { mark('full'); return; }
 *
 * so for EVERY NON-ADMIN the purchased tier was assumed to be the top one and
 * api/v1/ai/health was never called at all. A customer whose client is on
 * `docs` read "Full" on their own Home -- a figure on screen that nothing
 * produced. Supplying the API key on 2026-09-08 did not touch this: it made
 * the guess correct by luck on this box and left it wrong for every customer
 * below the top tier. The defect got quieter, not smaller.
 *
 * And AiController.health(:164) returns THREE fields -- configured, model,
 * maxLevel. Nothing in home.html read `configured`, so the chip could report a
 * confident tier on a server where the assistant is not switched on.
 *
 * WHAT THIS ASSERTS. The shipped source is EXTRACTED from home.html and run,
 * so these exercise the real text rather than a retyped copy of it.
 *
 *   A1  a non-admin now CAUSES the health request (the bug was that it did not)
 *   A2  the tier rendered is the one the server returned, per level
 *   A3  configured:false wins over any maxLevel and says so on the chip
 *   A4  a failed health call leaves the em-dash rather than guessing
 *   A5  the request carries the active database, since the plan is per-client
 *   A6  the chip's own guard still holds when the element is absent
 *
 * MUTATION CONTROL at the end: the pre-fix early return is re-injected into the
 * extracted source and the suite must go RED. A suite that has only ever run
 * against fixed code is untested (feedback_test_against_the_known_defect).
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8');

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) +
                         ' want ' + JSON.stringify(want)));
  return ok;
}

// ---------------------------------------------------------------------------
// Extract the shipped source. Both anchors are asserted to appear exactly once
// before slicing -- an anchor that matches twice silently takes the wrong span.
// ---------------------------------------------------------------------------
const START = 'var AI_PLAN_LABEL = {';
const END   = ".catch(function () { mark(''); });";

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
if (occurrences(html, START) !== 1) {
  console.log('HARNESS BROKEN: start anchor appears ' +
              occurrences(html, START) + ' times, expected 1');
  process.exit(1);
}
if (occurrences(html, END) !== 1) {
  console.log('HARNESS BROKEN: end anchor appears ' +
              occurrences(html, END) + ' times, expected 1');
  process.exit(1);
}
const from = html.indexOf(START);
const to   = html.indexOf(END, from) + END.length;
const SOURCE = html.slice(from, to) + '\n  }\n';

// ---------------------------------------------------------------------------
// Run the extracted source against a stub, once per scenario.
// ---------------------------------------------------------------------------
function run(opts, source) {
  // ⚠ Defaulted, because omitting it made `source` undefined and the vm then
  // evaluated the literal string "undefined" -- which parses fine, defines
  // nothing, and failed three layers later as "loadAiPlan is not defined".
  if (source === undefined) source = SOURCE;
  const calls = [];
  const el = { textContent: '\u2014' };   // the shipped markup's initial &mdash;

  const sandbox = {
    // The chip element, or nothing when the scenario is testing the guard.
    $: function (id) { return (opts.noElement ? null
                                              : (id === 'aiPlanTierLabel' ? el : null)); },
    isAdmin:  function () { return !!opts.isAdmin; },
    IS_DEMO:  !!opts.isDemo,
    activeDb: function () { return opts.db ? { n: opts.db } : null; },
    rrFetch:  function (url, o) {
      calls.push({ url: url, opts: o });
      if (opts.reject) return Promise.reject(new Error('boom'));
      return Promise.resolve(opts.health);
    },
    window: {},
    console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // ⚠ Do NOT rely on a top-level `function` declaration landing on the
  // contextified global -- it does not here, and the symptom is a bare
  // "loadAiPlan is not defined" from inside the promise chain, three layers
  // from the cause. Hand the function out explicitly instead.
  vm.runInContext(source + '\nglobalThis.__loadAiPlan = loadAiPlan;', sandbox);
  if (typeof sandbox.__loadAiPlan !== 'function') {
    throw new Error('HARNESS BROKEN: extracted source did not define loadAiPlan');
  }
  sandbox.__loadAiPlan();

  // Let the promise chain settle before reading the sink.
  return new Promise(function (res) {
    setTimeout(function () { res({ calls: calls, text: el.textContent }); }, 0);
  });
}

(async function () {
  console.log('AI-plan chip -- behaviour of the SHIPPED loadAiPlan()\n');

  // A1 -- the bug: a non-admin never reached the network.
  let r = await run({ isAdmin: false, db: 'Demo1',
                      health: { configured: true, maxLevel: 'docs' } });
  check('A1 non-admin CAUSES the health request', r.calls.length, 1);
  check('A2 non-admin on docs reads "Basic", not "Full"', r.text, 'Basic');
  check('A5 the request carries the active database',
        r.calls[0] && r.calls[0].opts && r.calls[0].opts.query, { db: 'Demo1' });

  // A2 -- every level maps to its customer-facing label, for an admin too.
  const levels = { off: 'Off', docs: 'Basic', scrubbed: 'Enhanced', full: 'Full' };
  for (const lvl of Object.keys(levels)) {
    r = await run({ isAdmin: true, db: 'Demo1',
                    health: { configured: true, maxLevel: lvl } });
    check('A2 admin, maxLevel ' + lvl + ' reads "' + levels[lvl] + '"',
          r.text, levels[lvl]);
  }

  // A3 -- availability beats entitlement, and it must beat the TOP tier too,
  // because that is the combination that previously read most confidently.
  r = await run({ isAdmin: true, db: 'Demo1',
                  health: { configured: false, maxLevel: 'full' } });
  check('A3 configured:false overrides maxLevel full', r.text, 'Not enabled');
  r = await run({ isAdmin: false, db: 'Demo1',
                  health: { configured: false, maxLevel: 'docs' } });
  check('A3 configured:false for a non-admin too', r.text, 'Not enabled');

  // A4 -- a failure must not become a guess.
  r = await run({ isAdmin: true, db: 'Demo1', reject: true });
  check('A4 a failed health call leaves the em-dash', r.text, '\u2014');

  // A6 -- the guard that this function already had.
  r = await run({ isAdmin: false, noElement: true,
                  health: { configured: true, maxLevel: 'docs' } });
  check('A6 no chip element: no request, no throw', r.calls.length, 0);

  // -------------------------------------------------------------------------
  // MUTATION CONTROL. Re-inject the pre-fix early return and require the suite
  // to go red -- and to go red on the ASSERTIONS THAT NAME THE DEFECT, not
  // merely somewhere.
  // -------------------------------------------------------------------------
  console.log('\nmutation control -- pre-fix early return re-injected:');
  // ⚠ RE-ANCHORED 2026-09-15 (VLC-63 increment 2). This used to inject before
  // `var dbn = (activeDb() && activeDb().n) || '';`, which was then unique to
  // loadAiPlan. Hoisting the health fetch into the shared aiHealth() producer
  // moved that line OUT of loadAiPlan, so `.replace()` took the first occurrence
  // -- inside aiHealth, where `mark` does not exist -- and the whole suite died
  // with "mark is not defined" instead of reporting a control failure.
  //
  // The anchor is now a line that only exists inside the function under test,
  // and its uniqueness is ASSERTED rather than assumed. A mutation control that
  // silently relocates is worse than none: it reports on code it never touched.
  const ANCHOR = "var el = $('aiPlanTierLabel'); if (!el) return;";
  const anchorCount = SOURCE.split(ANCHOR).length - 1;
  if (anchorCount !== 1) {
    console.log('  FAIL  mutation anchor appears ' + anchorCount + ' times, expected 1');
    failures++;
  }
  const MUTANT = SOURCE.replace(
    ANCHOR,
    ANCHOR + "\n    if (!isAdmin()) { mark('full'); return; }"
  );
  if (MUTANT === SOURCE || anchorCount !== 1) {
    console.log('  FAIL  mutation did not apply -- the control is vacuous');
    failures++;
  } else {
    const m1 = await run({ isAdmin: false, db: 'Demo1',
                           health: { configured: true, maxLevel: 'docs' } }, MUTANT);
    const caughtRequest = (m1.calls.length === 0);
    const caughtLabel   = (m1.text === 'Full');
    console.log('  ' + (caughtRequest ? 'ok  ' : 'FAIL') +
                '  A1 fails on the mutant (no request fired)');
    console.log('  ' + (caughtLabel ? 'ok  ' : 'FAIL') +
                '  A2 fails on the mutant (reads "Full" on a docs client)');
    if (!caughtRequest || !caughtLabel) {
      failures++;
      console.log('  the control did not discriminate: these assertions would ' +
                  'have passed against the known defect');
    }
    // And the control that must SURVIVE the mutation, so the suite is not
    // simply failing everything: an admin was never affected by this bug.
    const m2 = await run({ isAdmin: true, db: 'Demo1',
                           health: { configured: true, maxLevel: 'scrubbed' } }, MUTANT);
    const adminUnaffected = (m2.text === 'Enhanced');
    console.log('  ' + (adminUnaffected ? 'ok  ' : 'FAIL') +
                '  admin path still correct on the mutant (bug was non-admin only)');
    if (!adminUnaffected) failures++;
  }

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions passed'));
  process.exit(failures ? 1 : 0);
})().catch(function (err) {
  // ⚠ Without this the suite reported EXIT=0 while every assertion had been
  // skipped by a thrown ReferenceError -- an unhandled rejection is only a
  // warning on Node 14. A green exit from a suite that never ran is the worst
  // possible result, and it happened here on the first attempt.
  console.log('\nSUITE ABORTED: ' + (err && err.stack || err));
  process.exit(1);
});
