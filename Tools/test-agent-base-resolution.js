/*
 * test-agent-base-resolution.js  --  UI-171
 *
 * WHAT THIS GUARDS
 * ----------------
 * `RRDB.agentBase()` (RRV8/config.js) is the canonical "which agent do I call"
 * resolver. Measured 2026-09-15: 20+ V8 pages call `window.RRDB.agentBase()`
 * UNGUARDED and concatenate a path straight onto the result, so whatever this
 * one function returns is what the whole application calls. Until UI-171 it
 * ended:
 *
 *     return (window.RR_CONFIG && window.RR_CONFIG.testAgentBase)
 *         || 'http://localhost:34537';
 *
 * Two defects in one line, and they are different defects:
 *
 *   1. A HOST-SHAPED LAST RESORT. A deploy that leaves testAgentBase unset did
 *      not get a reported gap; it got a silent call to the CUSTOMER's own
 *      loopback, where nothing is listening. This is the same shape VLC-39
 *      gap 2 removed from login.html (a hardcoded staging host), one layer
 *      down and reaching many more pages. It also contradicted this file's own
 *      documented prod design -- the comment on RR_ENVIRONMENTS.prod says the
 *      agent serves the V8 app so the page's own origin is correct, and
 *      HelpDesk/connection-check.html:406 implements exactly that. Two readers
 *      of one setting, disagreeing, only one of them documented.
 *
 *   2. A DIRECT RR_CONFIG READ. It bypassed RRENV, so a value supplied only by
 *      RR_ENVIRONMENTS[mode] -- which is the entire point of that table -- was
 *      invisible to it.
 *
 * WHY IT IS A BEHAVIOUR TEST AND NOT A GREP
 * -----------------------------------------
 * The shipped RRENV + RRDB block is SLICED OUT OF config.js AND EXECUTED, the
 * same idiom as Tools/test-auth-base-sink.js. Nothing here is retyped: if the
 * resolver changes, this file runs the change. A grep for "RRENV.get" in the
 * source would have passed against a function that called it and then threw
 * the answer away.
 *
 * MUTATIONS
 * ---------
 * Every assertion below is a hypothesis until the thing it guards is broken.
 * Section 4 re-injects each original defect into the real source text and
 * declares, per mutation, what must go RED and what must stay GREEN. A
 * mutation that reddens everything proves nothing about which assertion is
 * load-bearing, so the green set is checked as strictly as the red set.
 *
 * BLIND SPOTS, named:
 *   - It does not open a browser. It proves the resolver returns the right
 *     string, not that any page renders or that any host answers.
 *   - It says nothing about `valcBase`. Measured 2026-09-15: 24 direct
 *     `RR_CONFIG.valcBase || 'http://localhost:8080'` reads across 17 files
 *     under RRV8/, with no choke point equivalent to RRDB.agentBase() to
 *     migrate. That is a separate, larger change and is NOT covered here.
 *   - It does not prove any QA or prod host serves anything. That is the DNS /
 *     HTTP probe recorded on the RR_ENVIRONMENTS.qa entry, not a unit test.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT      = path.join(__dirname, '..');
const CONFIG_JS = path.join(ROOT, 'RRV8', 'config.js');
const LOGIN     = path.join(ROOT, 'login.html');
const CONNCHECK = path.join(ROOT, 'HelpDesk', 'connection-check.html');

const configSrc = fs.readFileSync(CONFIG_JS, 'utf8');

let failures = 0;
const seen = {};
function record(name, pass, why) {
  seen[name] = pass;
  if (pass) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + '\n        ' + why); }
}

/* ---------------------------------------------------------------------------
 * Slice the config + RRENV + RRDB block out of the shipping file and run it.
 * test-auth-base-sink.js stops at RRDB because it does not need it; this file
 * is ABOUT RRDB, so the slice runs on to the end of that IIFE. The anchors are
 * real source text, and a moved anchor throws rather than silently testing a
 * shorter slice -- a slice that quietly lost agentBase() would make every
 * assertion below unreachable and the run would still look clean.
 * ------------------------------------------------------------------------- */
const SLICE_START = 'window.RR_CONFIG = {';
const SLICE_TAIL  = 'return { dbs: dbs, index: index, active: active, name: name, '
                  + 'agentBase: agentBase, setActive: setActive };';

function sliceConfig(src) {
  const start = src.indexOf(SLICE_START);
  const tail  = src.indexOf(SLICE_TAIL);
  if (start < 0 || tail < 0 || tail <= start) {
    throw new Error('cannot slice config.js (start=' + start + ', tail=' + tail
      + ') -- the anchors moved; fix the anchors, do not widen the slice');
  }
  const close = src.indexOf('})();', tail);
  if (close < 0) throw new Error('RRDB IIFE close not found after the return line');
  return src.slice(start, close + '})();'.length);
}

/**
 * @param opts.src      source text to run (defaults to the shipped slice)
 * @param opts.location stub for window.location
 * @param opts.mutate   callback to adjust the context after the block runs
 */
function loadStack(opts) {
  opts = opts || {};
  const ctx = {};
  ctx.window = ctx;
  ctx.localStorage = {
    _d: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem: function (k, v) { this._d[k] = String(v); }
  };
  ctx.location = opts.location || { protocol: 'https:', host: 'rr.acme.example.com' };
  ctx.atob = function (b) { return Buffer.from(b, 'base64').toString('binary'); };
  vm.createContext(ctx);
  new vm.Script(opts.src || sliceConfig(configSrc), { filename: 'config.js-slice' }).runInContext(ctx);
  if (opts.mutate) opts.mutate(ctx);
  return ctx;
}

/* ---------------------------------------------------------------------------
 * The assertion set, as a function, so section 4 can re-run the identical
 * checks against mutated source and read back WHICH ones changed colour.
 * Returns { name: boolean }. `report` false keeps the mutation runs quiet.
 * ------------------------------------------------------------------------- */
function runAssertions(src, report) {
  const res = {};
  function check(name, pass, why) {
    res[name] = pass;
    if (report) record(name, pass, why);
  }

  // A1 -- today's shipped dev config. The regression guard: this migration must
  // not move a single value on this box, because RR_CONFIG sets testAgentBase
  // and explicit-wins.
  {
    const ctx = loadStack({ src: src });
    const got = ctx.RRDB.agentBase();
    check('A1 shipped dev config still resolves to the dev agent',
      got === 'http://localhost:34537',
      'expected http://localhost:34537, got ' + JSON.stringify(got));
  }

  // A2 -- the active DB's own ip still wins over any config value. This is the
  // normal signed-in path and nothing in UI-171 should have touched it.
  {
    const ctx = loadStack({
      src: src,
      mutate: c => { c.RR_SESSION = { dbs: [{ n: 'Acme_Prod', ip: '10.20.30.40' }] }; }
    });
    const got = ctx.RRDB.agentBase();
    check('A2 the active DB ip from the token still wins over config',
      got === 'https://10.20.30.40',
      'expected https://10.20.30.40, got ' + JSON.stringify(got));
  }

  // A3 -- THE DEFECT. A prod deploy with no test agent configured and no db ip
  // yet (pre-token, or a token with no ip) must fall back to the page's own
  // origin, which is where the agent serves the app. It must NOT call the
  // customer's loopback.
  {
    const ctx = loadStack({
      src: src,
      location: { protocol: 'https:', host: 'rr.acme.example.com' },
      mutate: c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.testAgentBase = null; }
    });
    const got = ctx.RRDB.agentBase();
    check('A3 prod with testAgentBase unset resolves to the PAGE ORIGIN, not localhost',
      got === 'https://rr.acme.example.com',
      'expected https://rr.acme.example.com, got ' + JSON.stringify(got));
  }

  // A4 -- same for qa, which carries an explicit null in RR_ENVIRONMENTS
  // because no QA VALC is published (see the qa entry's own probe log).
  {
    const ctx = loadStack({
      src: src,
      location: { protocol: 'https:', host: 'rr-qa.acme.example.com' },
      mutate: c => { c.RR_CONFIG.mode = 'qa'; c.RR_CONFIG.testAgentBase = null; }
    });
    const got = ctx.RRDB.agentBase();
    check('A4 qa with testAgentBase null resolves to the PAGE ORIGIN, not localhost',
      got === 'https://rr-qa.acme.example.com',
      'expected https://rr-qa.acme.example.com, got ' + JSON.stringify(got));
  }

  // A5 -- THE MIGRATION ITSELF. A deploy that supplies the value ONLY through
  // RR_ENVIRONMENTS[mode] -- the whole reason that table exists -- must be
  // found. A direct RR_CONFIG read cannot pass this.
  {
    const ctx = loadStack({
      src: src,
      mutate: c => {
        c.RR_CONFIG.mode = 'prod';
        c.RR_CONFIG.testAgentBase = null;
        c.RR_ENVIRONMENTS.prod.testAgentBase = 'https://agent.acme.example.com';
      }
    });
    const got = ctx.RRDB.agentBase();
    check('A5 a value supplied ONLY by RR_ENVIRONMENTS[mode] is found',
      got === 'https://agent.acme.example.com',
      'expected https://agent.acme.example.com, got ' + JSON.stringify(got));
  }

  // A6 -- testAgentBase must stay OUT of missing(). prod nulls it on purpose
  // ("no test agent in production"), so naming it would make login.html paint
  // a configuration error on every correct prod deploy. A gate that cries wolf
  // is a gate people switch off.
  {
    const ctx = loadStack({
      src: src,
      mutate: c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.testAgentBase = null; }
    });
    const m = ctx.RRENV.missing();
    check('A6 testAgentBase is deliberately NOT reported by missing()',
      m.indexOf('testAgentBase') === -1,
      'missing() returned ' + JSON.stringify(m));
  }

  return res;
}

console.log('\nSECTION 1 -- the shipped resolver, executed');
runAssertions(configSrc, true);

/* ---------------------------------------------------------------------------
 * SECTION 2 -- no direct RR_CONFIG.testAgentBase read survives in config.js.
 *
 * A6 above proves the resolver behaves; this proves no SECOND reader quietly
 * bypasses it. Line comments are stripped first, because the migration notes
 * legitimately quote the retired expression and a quoted defect must not read
 * as a live one. LINE COMMENTS ONLY -- Tools/test-comment-stripper-safety.js
 * (UI-170) bans naive block-comment stripping across every Tools/test-*.js,
 * because a delimiter inside a string or regex literal pairs with the wrong
 * partner and silently eats the file. The block comment inside agentBase()
 * therefore survives the strip, and is excluded by its own delimiters below.
 * ------------------------------------------------------------------------- */
console.log('\nSECTION 2 -- no direct reader bypasses RRENV');

function stripLineComments(src) {
  return src.replace(/\r/g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
/** Remove /* ... *\/ blocks that OPEN A LINE, located by their own delimiters.
 *  Same conservative rule as stripLineComments: a delimiter inside a string or
 *  regex never opens a line at indentation, so this cannot run away. */
function stripLeadingBlockComments(src) {
  let out = src, guard = 0;
  for (;;) {
    if (++guard > 500) throw new Error('block-comment strip did not converge');
    const m = out.match(/^[ \t]*\/\*/m);
    if (!m) return out;
    const open = m.index + m[0].length - 2;
    const close = out.indexOf('*/', open);
    if (close < 0) return out;          // unterminated: leave it, do not eat the file
    out = out.slice(0, open) + out.slice(close + 2);
  }
}

const codeOnly = stripLeadingBlockComments(stripLineComments(sliceConfig(configSrc)));
const directReads = (codeOnly.match(/RR_CONFIG\s*(?:\.|\[\s*['"])testAgentBase/g) || []);
record('S2 zero direct RR_CONFIG.testAgentBase reads remain in the config slice',
  directReads.length === 0,
  'found ' + directReads.length + ': ' + JSON.stringify(directReads));

/* Harness controls for S2. "Zero direct reads" is a zero, and a zero is not a
 * result until something proves the same command can return non-zero. Two
 * controls, because the check can fail silently in two different directions.
 *
 * ⚠ The first draft of this control compared byte counts -- it demanded the
 * stripped slice keep 30% of its bytes, and it FAILED on clean source. The
 * slice is genuinely 81% comment (29,770 bytes down to 5,774), because this
 * file documents itself heavily. A size heuristic measures how chatty the
 * comments are, not whether code survived. Landmarks and a positive control
 * measure the thing itself. */
const LANDMARKS = ['function agentBase()', 'function setActive(n)',
  'window.RRENV = {', 'window.RRDB = (function ()', "RRENV.get('testAgentBase')"];
const lost = LANDMARKS.filter(k => codeOnly.indexOf(k) === -1);
record('S2 CONTROL (negative): the strip kept every code landmark',
  lost.length === 0,
  'the comment strip removed real code -- missing: ' + JSON.stringify(lost));

// Positive control: re-inject the defect this detector exists to find, on a
// line of CODE, and require the detector to see it. If this stays quiet the
// clean-source zero above means nothing.
const reinjected = codeOnly.replace(
  "var t = RRENV.get('testAgentBase');",
  "var t = (window.RR_CONFIG && RR_CONFIG.testAgentBase) || null;");
record('S2 CONTROL (positive): the re-injected defect actually changed the source',
  reinjected !== codeOnly,
  'the re-injection did not apply -- the anchor moved, so this control tested nothing');
record('S2 CONTROL (positive): the detector FINDS a re-injected direct read',
  (reinjected.match(/RR_CONFIG\s*(?:\.|\[\s*['"])testAgentBase/g) || []).length === 1,
  'detector found ' + ((reinjected.match(/RR_CONFIG\s*(?:\.|\[\s*['"])testAgentBase/g) || []).length)
    + ' on deliberately broken source; it cannot discriminate');

/* ---------------------------------------------------------------------------
 * SECTION 3 -- the two page-level readers resolve the same way.
 *
 * login.html and HelpDesk/connection-check.html are the matched pair a support
 * tech compares when a customer cannot sign in. They must agree on how
 * testAgentBase is found, or the same deploy reports two different answers on
 * two pages. Measured 2026-09-15: they had drifted -- connection-check went
 * through RRENV and login.html still read RR_CONFIG directly, while login's own
 * comment claimed they matched.
 * ------------------------------------------------------------------------- */
console.log('\nSECTION 3 -- login.html and connection-check.html agree');

const loginSrc = fs.readFileSync(LOGIN, 'utf8');
const connSrc  = fs.readFileSync(CONNCHECK, 'utf8');

const appBaseDecl = (loginSrc.match(/const APP_BASE =[\s\S]{0,400}?;/) || [''])[0];
record('S3 login.html APP_BASE is declared where this test can see it',
  appBaseDecl.length > 0,
  'no `const APP_BASE = ...;` found in login.html');
record('S3 login.html resolves APP_BASE through RRENV',
  /RRENV/.test(appBaseDecl),
  'APP_BASE declaration does not mention RRENV:\n' + appBaseDecl);

const commsDecl = (connSrc.match(/var COMMS_BASE =[\s\S]{0,400}?;/) || [''])[0];
record('S3 connection-check.html COMMS_BASE is declared where this test can see it',
  commsDecl.length > 0,
  'no `var COMMS_BASE = ...;` found in connection-check.html');
record('S3 connection-check.html resolves COMMS_BASE through the RRENV wrapper',
  /envGet\(\s*['"]testAgentBase['"]\s*\)/.test(commsDecl),
  'COMMS_BASE declaration does not call envGet("testAgentBase"):\n' + commsDecl);

/* ---------------------------------------------------------------------------
 * SECTION 4 -- MUTATIONS. Break the thing, watch the right lights go red.
 * ------------------------------------------------------------------------- */
console.log('\nSECTION 4 -- mutations (each declares its red set AND its green set)');

function mutate(label, from, to, mustRedden, mustStayGreen) {
  const mutated = configSrc.replace(from, to);
  // Harness control: a mutation that did not apply is a green run that proves
  // nothing, and it looks identical to a passing test.
  if (mutated === configSrc) {
    failures++;
    console.log('  FAIL  MUTATION CONTROL ' + label
      + '\n        the replacement did not apply -- source text moved, so this '
      + 'mutation tested NOTHING');
    return;
  }
  let res;
  try { res = runAssertions(mutated, false); }
  catch (e) {
    failures++;
    console.log('  FAIL  ' + label + '\n        mutated source threw: ' + e.message);
    return;
  }
  const wrongGreen = mustRedden.filter(n => res[n] !== false);
  const wrongRed   = mustStayGreen.filter(n => res[n] !== true);
  const ok = wrongGreen.length === 0 && wrongRed.length === 0;
  record('M ' + label,
    ok,
    (wrongGreen.length ? 'these should have gone RED and did not: '
      + JSON.stringify(wrongGreen) + '. ' : '')
    + (wrongRed.length ? 'these should have stayed GREEN and did not: '
      + JSON.stringify(wrongRed) + '.' : ''));
  if (ok) {
    console.log('        reddened as declared: ' + JSON.stringify(mustRedden));
    console.log('        stayed green:         ' + JSON.stringify(mustStayGreen));
  }
}

const A1 = 'A1 shipped dev config still resolves to the dev agent';
const A2 = 'A2 the active DB ip from the token still wins over config';
const A3 = 'A3 prod with testAgentBase unset resolves to the PAGE ORIGIN, not localhost';
const A4 = 'A4 qa with testAgentBase null resolves to the PAGE ORIGIN, not localhost';
const A5 = 'A5 a value supplied ONLY by RR_ENVIRONMENTS[mode] is found';
const A6 = 'A6 testAgentBase is deliberately NOT reported by missing()';

// M1 -- put the hardcoded loopback back as the last resort, KEEPING the RRENV
// lookup. Surgical on purpose: if the whole old line went back, every
// assertion would move at once and none of them would be shown to be the one
// that matters. Only the unset-value cases may redden.
mutate('M1 restore the hardcoded localhost:34537 last resort',
  "    var loc = window.location;\n"
  + "    return (loc && typeof loc.protocol === 'string' && loc.protocol.indexOf('http') === 0)\n"
  + "      ? (loc.protocol + '//' + loc.host)\n"
  + "      : '';",
  "    return 'http://localhost:34537';",
  [A3, A4],
  [A1, A2, A5, A6]);

// M2 -- put the direct RR_CONFIG read back, KEEPING the page-origin fallback.
// Only the RR_ENVIRONMENTS-supplied case may redden: A3 must stay green,
// because the fallback it tests is untouched.
mutate('M2 restore the direct RR_CONFIG.testAgentBase read (bypassing RRENV)',
  "    var t = RRENV.get('testAgentBase');",
  "    var t = (window.RR_CONFIG && RR_CONFIG.testAgentBase) || null;",
  [A5],
  [A1, A2, A3, A4, A6]);

// M3 -- add testAgentBase to missing(). A6 is the only assertion that may
// move; if anything else does, A6 is not measuring what it claims.
mutate('M3 add testAgentBase to the missing() key list',
  "var keys = ['authBase', 'valcBase', 'statusAnchor'];",
  "var keys = ['authBase', 'valcBase', 'statusAnchor', 'testAgentBase'];",
  [A6],
  [A1, A2, A3, A4, A5]);

console.log('');
if (failures) {
  console.log(failures + ' CHECK' + (failures === 1 ? '' : 'S') + ' FAILED');
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
