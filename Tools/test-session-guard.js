/* test-session-guard.js -- behaviour test for V8's session expiry (UI-191).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-session-guard.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron
 * host and this test runs on it. Any Node-compatible binary works.)
 *
 * WHY THIS EXISTS. sidebar.js carried a complete idle-timeout implementation --
 * a 30-minute window, cross-tab activity in localStorage, a 60-second watcher,
 * and an endSession() that cleared the token and returned to login. None of it
 * ran. sessionExpired() opened with
 *
 *     if (!AUTO_SIGNOUT_ENABLED) return false;
 *
 * and the flag was false, set on 2026-07-02 because the idle timeout was
 * kicking working sessions out mid-task.
 *
 * ⚠ THE PART THAT MADE IT WORSE THAN A DISABLED FEATURE: the token's own `exp`
 * check sat AFTER that same early return. So one line disabled two different
 * controls, while the comment three lines above still promised "the token's own
 * exp still applies as a hard backstop". V8 signed nobody out for any reason --
 * a user ran until some data call came back 401 from the agent.
 *
 * WHAT THIS ASSERTS. The shipped source is EXTRACTED from sidebar.js and run,
 * so these exercise the real text rather than a retyped copy of it.
 *
 *   A1  a fresh session is not expired
 *   A2  31 minutes without activity expires as 'idle'
 *   A3  an expired token expires as 'token' EVEN WHEN THE USER IS ACTIVE
 *       <- this is the assertion the old early return made impossible
 *   A4  when both have run out, 'token' wins: it is the one nothing undoes
 *   A5  no sessionStart (the dev token) never arms the idle clock
 *   A6  ... and a far-future exp with no sessionStart is never expired at all
 *   A7  the idle clock counts from lastActivity, not from sign-in
 *   A8  markActivity() honours its 15s throttle; markActivity(true) does not
 *       <- the Stay signed in button passes true, and would be inert without it
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
const js   = fs.readFileSync(path.join(ROOT, 'RRV8', 'sidebar.js'), 'utf8');

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  return ok;
}

// ---------------------------------------------------------------------------
// Extract the shipped source. Both anchors are asserted to appear exactly once
// before slicing -- an anchor that matches twice silently takes the wrong span.
// ---------------------------------------------------------------------------
const START = 'const IDLE_MAX_MS  = 30 * 60 * 1000;';
const END   = 'function endSession(reason) {';

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
for (const [label, anchor] of [['start', START], ['end', END]]) {
  if (occurrences(js, anchor) !== 1) {
    console.log('HARNESS BROKEN: ' + label + ' anchor appears ' +
                occurrences(js, anchor) + ' times, expected 1');
    process.exit(1);
  }
}
const from = js.indexOf(START);
const to   = js.indexOf(END, from);
const SOURCE = js.slice(from, to);

// A control on the extraction itself: if the slice does not contain both
// clocks, every assertion below would be measuring an empty sandbox.
for (const needed of ['idleRemaining', 'tokenRemaining', 'sessionExpired', 'markActivity']) {
  if (SOURCE.indexOf(needed) < 0) {
    console.log('HARNESS BROKEN: extracted source has no ' + needed);
    process.exit(1);
  }
}

const MIN = 60 * 1000;

// ---------------------------------------------------------------------------
// Run the extracted source against a stubbed localStorage + clock.
// ---------------------------------------------------------------------------
function run(store, nowMs, exp) {
  const writes = [];
  const sandbox = {
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = v; writes.push(k); },
      removeItem: function (k) { delete store[k]; }
    },
    // parseJwt lives elsewhere in sidebar.js; the clocks only care what it
    // returns, so stubbing it keeps this test about expiry rather than base64.
    parseJwt: function () { return exp === undefined ? null : { exp: exp }; },
    Date: { now: function () { return nowMs; } },
    Infinity: Infinity,
    isNaN: isNaN,
    parseInt: parseInt,
    console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Trailing expression exports the handles; a top-level `function` declaration
  // inside vm does not reliably land on the context object.
  vm.runInContext(SOURCE +
    '\n;globalThis.__api = { sessionExpired: sessionExpired, idleRemaining: idleRemaining,' +
    ' tokenRemaining: tokenRemaining, markActivity: markActivity };', sandbox);
  return { api: sandbox.__api, writes: writes, store: store };
}

/** A live session: signed in `ageMin` ago, last active `idleMin` ago. */
function session(nowMs, idleMin, opts) {
  opts = opts || {};
  const store = {
    'rrv8.token': 'stub.stub.stub',
    'rrv8.sessionStart': String(nowMs - 60 * MIN),
    'rrv8.lastActivity': String(nowMs - idleMin * MIN)
  };
  if (opts.noStart) { delete store['rrv8.sessionStart']; delete store['rrv8.lastActivity']; }
  return store;
}

const NOW = 1757_000_000_000;

console.log('test-session-guard.js -- UI-191');

// ---- A1..A4: the two clocks, checked independently ------------------------
check('A1  fresh session (2 min idle, token good for 4h) is not expired',
      run(session(NOW, 2), NOW, (NOW + 4 * 60 * MIN) / 1000).api.sessionExpired(),
      null);

check('A2  31 minutes without activity expires as idle',
      run(session(NOW, 31), NOW, (NOW + 4 * 60 * MIN) / 1000).api.sessionExpired(),
      'idle');

check('A3  an expired TOKEN expires even while the user is active',
      run(session(NOW, 1), NOW, (NOW - 1 * MIN) / 1000).api.sessionExpired(),
      'token');

check('A4  both run out -> token wins (nothing can undo it)',
      run(session(NOW, 45), NOW, (NOW - 1 * MIN) / 1000).api.sessionExpired(),
      'token');

// ---- A5..A6: the dev token stays exempt, which is why this was safe to ship
check('A5  no sessionStart -> the idle clock never arms',
      run(session(NOW, 0, { noStart: true }), NOW, (NOW + 10 * 60 * MIN) / 1000).api.idleRemaining(),
      Infinity);

check('A6  ... and with a far-future exp it is not expired at all',
      run(session(NOW, 0, { noStart: true }), NOW, (NOW + 10 * 60 * MIN) / 1000).api.sessionExpired(),
      null);

// ---- A7: the clock counts from activity, not from sign-in ------------------
check('A7  idleRemaining counts from lastActivity, not sessionStart',
      run(session(NOW, 10), NOW, (NOW + 4 * 60 * MIN) / 1000).api.idleRemaining(),
      20 * MIN);

// ---- A8: the Stay signed in button depends on force ------------------------
(function () {
  const r = run(session(NOW, 10), NOW, (NOW + 4 * 60 * MIN) / 1000);
  r.api.markActivity();                    // first call: writes, seeds the throttle
  const afterFirst = r.writes.length;
  r.api.markActivity();                    // immediately again: throttled away
  const afterThrottled = r.writes.length;
  r.api.markActivity(true);                // the button: must beat the throttle
  const afterForced = r.writes.length;
  check('A8a throttled second call does not write', afterThrottled, afterFirst);
  check('A8b forced call writes anyway (Stay signed in would be inert without it)',
        afterForced, afterThrottled + 1);
})();

// ---------------------------------------------------------------------------
// MUTATION CONTROL -- re-inject the pre-fix early return and require RED.
// ---------------------------------------------------------------------------
console.log('\n  mutation control (re-injecting the disabled master switch)');
const MUTATED = SOURCE.replace(
  'function sessionExpired() {',
  'function sessionExpired() {\n    if (!false) { /* AUTO_SIGNOUT_ENABLED=false */ } else {}\n    return false;\n    // eslint-disable-next-line');

function runMutated(store, nowMs, exp) {
  const saved = SOURCE;
  try {
    const writes = [];
    const sandbox = {
      localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function (k, v) { store[k] = v; writes.push(k); },
        removeItem: function (k) { delete store[k]; }
      },
      parseJwt: function () { return exp === undefined ? null : { exp: exp }; },
      Date: { now: function () { return nowMs; } },
      Infinity: Infinity, isNaN: isNaN, parseInt: parseInt, console: console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(MUTATED + '\n;globalThis.__api = { sessionExpired: sessionExpired };', sandbox);
    return sandbox.__api;
  } finally { void saved; }
}

let mutationCaught = 0;
for (const [label, store, exp, want] of [
  ['A2 idle',            session(NOW, 31), (NOW + 4 * 60 * MIN) / 1000, 'idle'],
  ['A3 token-while-active', session(NOW, 1), (NOW - 1 * MIN) / 1000,    'token'],
  ['A4 both',            session(NOW, 45), (NOW - 1 * MIN) / 1000,      'token']
]) {
  const got = runMutated(store, NOW, exp).sessionExpired();
  const reddened = JSON.stringify(got) !== JSON.stringify(want);
  if (reddened) mutationCaught++;
  console.log('    ' + (reddened ? 'reddened' : 'STILL GREEN') + '  ' + label +
              '   got ' + JSON.stringify(got));
}
if (mutationCaught !== 3) {
  failures++;
  console.log('  FAIL  mutation control: expected all 3 to redden, ' + mutationCaught + ' did.' +
              ' A suite that survives the known defect is not testing it.');
} else {
  console.log('  ok    mutation control: all 3 reddened, and A1/A5/A6 never depended on the flag');
}

console.log('\n' + (failures === 0 ? 'PASS' : 'FAIL (' + failures + ')'));
process.exit(failures === 0 ? 0 : 1);
