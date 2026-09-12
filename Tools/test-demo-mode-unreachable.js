/* test-demo-mode-unreachable.js -- demo mode cannot be entered in V8 (2026-09-10).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-demo-mode-unreachable.js
 *
 * WHY THIS EXISTS. Two hard rules say V8 is production-only with no demo mode
 * (feedback_no_demo, feedback_v8_agent_first). The code disagreed, in two ways
 * that were each reachable without any GSI involvement:
 *
 *   1. Every page resolved its mode as `?mode=` || RR_CONFIG.mode || 'demo'.
 *      So ANYONE WITH THE URL could append ?mode=demo in production.
 *   2. A deploy whose config.js omitted `mode` fell into demo SILENTLY. In
 *      sidebar.js that is not cosmetic: demo means `showSignOut = false` and
 *      an early return out of enforceSessionGuard(), so a misconfigured
 *      production deploy had no sign-out control and NO SESSION EXPIRY
 *      ENFORCEMENT at all.
 *
 * Both are now closed by routing every derivation through RRENV.mode()
 * (config.js), which reads RR_CONFIG.mode and bottoms out at 'staging'.
 *
 * WHAT THIS ASSERTS.
 *   A1  RRENV.mode() returns the configured value on the shipped config
 *   A2  RRENV.mode() cannot return 'demo' for ANY shape of RR_CONFIG,
 *       including absent, empty, null and blank-string
 *   A3  no file under RRV8/ reads the `mode` query parameter any more
 *   A4  no file under RRV8/ still carries a `|| 'demo'` fallback in code
 *   A5  sidebar.js resolves the mode in ONE place, not five
 *   A6  no file under RRV8/ COMPARES an un-coerced value to 'demo'
 *
 * A3 and A4 are source assertions rather than behaviour, deliberately: the
 * defect was that the rule existed in twenty-four copies, and the only way to
 * keep it dead is to assert that no copy came back.
 *
 * ⚠ A6 EXISTS BECAUSE A4 PASSED OVER A LIVE DEFECT (UI-194, 2026-09-12).
 * A4 looks for a `|| 'demo'` FALLBACK. admin-activity-log.html carried a
 * `RR_CONFIG.mode === 'demo'` COMPARISON -- a different shape, reading the raw
 * config instead of asking RRENV.mode(), so a deploy shipping mode:'demo'
 * switched that branch on and this suite was green throughout. A gate with a
 * shape it cannot see is worse than no gate, because the green gets believed.
 *
 * MUTATION CONTROL at the end, because a suite that has only run against fixed
 * code is untested (feedback_test_against_the_known_defect).
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT   = path.join(__dirname, '..');
const RRV8   = path.join(ROOT, 'RRV8');
const config = fs.readFileSync(path.join(RRV8, 'config.js'), 'utf8');

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  return ok;
}

/** Load config.js in isolation and read RRENV.mode() back. */
function modeWith(rrConfigOverride, source) {
  const sandbox = { window: {}, console: { log: function () {}, warn: function () {} } };
  sandbox.window.window = sandbox.window;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source === undefined ? config : source, sandbox);
  // The page's own config object wins; simulate each deploy shape.
  if (rrConfigOverride === 'ABSENT') { delete sandbox.window.RR_CONFIG; }
  else { sandbox.window.RR_CONFIG = rrConfigOverride; }
  sandbox.RR_CONFIG = sandbox.window.RR_CONFIG;
  return sandbox.window.RRENV.mode.call(sandbox.window);
}

/** Every tracked file under RRV8/, as {name, text}. */
function rrv8Files() {
  return fs.readdirSync(RRV8)
    .filter(function (f) { return /\.(html|js)$/.test(f); })
    .map(function (f) {
      return { name: f, text: fs.readFileSync(path.join(RRV8, f), 'utf8') };
    });
}

/** Strip LINE comments only, and only ones that OPEN a line.
 *
 *  A source assertion must not be satisfied or broken by prose: the
 *  demo-removal commit left explanatory comments that QUOTE the old
 *  expressions, and counting those as violations would keep this gate
 *  permanently red for the right reason stated wrongly.
 *
 *  ⚠ THIS DELIBERATELY DOES NOT STRIP BLOCK COMMENTS, and the first version
 *  of this file did, with the obvious regex. Tools/test-comment-stripper-
 *  safety.js (UI-170) caught it in CI. That expression pairs a `/*` or `*` + `/`
 *  inside a STRING or REGEX LITERAL with the wrong delimiter: measured on
 *  sidebar.js it removed 48% of the file. A stripper that silently deletes
 *  half its subject makes every later assertion meaningless in both
 *  directions, and the dangerous direction is the quiet one — a false FAIL
 *  gets investigated, a false PASS does not. In THIS file that would have
 *  meant A3/A4 passing because the offending code had been deleted before
 *  they looked.
 *
 *  The form below is one of the two the repo sanctions: it matches only a
 *  comment that opens a line, so a `//` inside a URL in a string survives.
 *  It is sufficient here because every comment this gate must ignore is a
 *  line comment. If a future assertion genuinely needs block comments gone,
 *  port the quote-tracking scanner from Tools/check_txv_cards.py, which
 *  raises on an unterminated block rather than guessing. */
function stripComments(text) {
  return text.replace(/^[ \t]*\/\/.*$/gm, '');
}

// ---------------------------------------------------------------------------
// A6 scanner -- comparisons against the 'demo' literal
// ---------------------------------------------------------------------------

/** Every `x === 'demo'` / `x == 'demo'` / `x !== 'demo'` / `x != 'demo'` in
 *  either operand order, both quote styles, whitespace or newline between any
 *  two tokens. The capture is the operand: that is what decides whether the
 *  comparison is legitimate.
 *
 *  WHAT THIS DELIBERATELY DOES NOT CATCH: `switch (mode) { case 'demo': }`,
 *  `['demo'].indexOf(mode)`, `mode.startsWith('dem')` and every other way to
 *  test a string without an equality operator. Those are not hypothetical
 *  gaps to apologise for -- they are simply not asserted, and a reader who
 *  assumes otherwise gets the same false confidence A4 gave. Equality is the
 *  shape the defect took and the shape the codebase uses. */
const DEMO_CMP = new RegExp(
  '([A-Za-z_$][A-Za-z0-9_$.]*(?:\\(\\s*\\))?)\\s*[!=]==?\\s*([\'"])demo\\2' +
  '|([\'"])demo\\3\\s*[!=]==?\\s*([A-Za-z_$][A-Za-z0-9_$.]*(?:\\(\\s*\\))?)',
  'g');

/** The operand is ALLOWED only when it is the coerced producer itself.
 *  `RRENV.mode()` can never return 'demo' (A2 proves it), so comparing its
 *  result is harmless. `RR_CONFIG.mode`, `cfg.mode`, a local holding a raw
 *  read -- none of those are coerced, and comparing one is the defect.
 *
 *  sidebar.js's `_rrMode()` wrapper is NOT on this list even though it
 *  delegates to RRENV. Allowing it would mean trusting a local name to still
 *  mean what it means today; the operand text is the only evidence this
 *  scanner has. A page that needs the comparison can spell out RRENV.mode(). */
function isCoercedOperand(operand) {
  return /(?:^|\.)RRENV\.mode\(\s*\)$/.test(operand);
}

/** The ONE place a raw mode value is legitimately compared to 'demo': the
 *  coercion inside RRENV.mode() itself, which is where 'demo' is rewritten to
 *  'staging'. Returned as a byte range.
 *
 *  ⚠ LOCATED BY CONTENT, NOT BY FILENAME, on purpose. An exclusion list keyed
 *  on 'config.js' would pass EVERY future comparison added anywhere in the
 *  1,000-line producer -- exactly the blind spot this assertion was written
 *  to close. The range is the function body and nothing else, so a second
 *  comparison elsewhere in the same file is still a violation (the mutation
 *  control at the bottom measures precisely that).
 *
 *  The brace match is bounded by two guards rather than trusted: the body must
 *  contain the coercion expression, and it must mention the 'demo' literal
 *  exactly once. A brace-match that ran away (a `{` inside a string literal,
 *  the failure mode that cost this file its comment stripper once already)
 *  swallows more than one and is rejected, so an over-matched range cannot
 *  quietly exempt a real violation. */
function coercionRange(text) {
  const open = /\bmode:\s*function\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = open.exec(text)) !== null) {
    const start = m.index + m[0].length - 1;      // index of the opening brace
    let depth = 0, end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) { end = i + 1; break; }
    }
    if (end < 0) continue;
    const body = text.slice(start, end);
    if (/===\s*(['"])demo\1\s*\?\s*(['"])staging\2/.test(body) &&
        (body.match(/['"]demo['"]/g) || []).length === 1) {
      return { start: start, end: end };
    }
  }
  return null;
}

/** Offenders as 'file:operand', plus how many sites the coercion exemption
 *  absorbed -- reported so an exemption that stops matching (or starts
 *  matching too much) is visible instead of silent. */
function scanDemoComparisons(files) {
  const offenders = [], exempted = [];
  files.forEach(function (f) {
    const code   = stripComments(f.text);
    const coerce = coercionRange(code);
    let m; DEMO_CMP.lastIndex = 0;
    while ((m = DEMO_CMP.exec(code)) !== null) {
      const operand = m[1] || m[4];
      if (coerce && m.index >= coerce.start && m.index < coerce.end) {
        exempted.push(f.name + ':' + operand);
        continue;
      }
      if (isCoercedOperand(operand)) continue;
      offenders.push(f.name + ':' + operand);
    }
  });
  return { offenders: offenders, exempted: exempted };
}

console.log('demo mode cannot be entered in V8\n');

// ---------------------------------------------------------------------------
// A1 / A2 -- the producer
// ---------------------------------------------------------------------------
check('A1 shipped dev config resolves to its configured mode',
      modeWith({ mode: 'staging' }), 'staging');
check('A1 a prod deploy resolves to prod',
      modeWith({ mode: 'prod' }), 'prod');

// The four shapes a broken deploy actually takes.
check('A2 RR_CONFIG absent      -> not demo', modeWith('ABSENT'), 'staging');
check('A2 RR_CONFIG empty {}    -> not demo', modeWith({}), 'staging');
check('A2 mode null             -> not demo', modeWith({ mode: null }), 'staging');
check('A2 mode blank string     -> not demo', modeWith({ mode: '' }), 'staging');
// ⭐ The one that makes "IS_DEMO is provably false" a true statement rather
// than an observation about today's config. Removing the fallbacks stops a
// page DRIFTING into demo; only this stops a deploy CHOOSING it, and a
// config.js setting mode:'demo' would otherwise switch all ~94 IS_DEMO
// branches back on — including sidebar.js hiding sign-out and skipping
// enforceSessionGuard().
check("A2 mode explicitly 'demo' -> COERCED, not honoured",
      modeWith({ mode: 'demo' }), 'staging');
check('A2 control: a legitimate mode is never coerced',
      modeWith({ mode: 'prod' }), 'prod');

// ---------------------------------------------------------------------------
// A3 / A4 / A5 -- no copy of the old rule came back
// ---------------------------------------------------------------------------
const files = rrv8Files();
console.log('  (scanning ' + files.length + ' files under RRV8/)');

const readsQueryMode = [];
const hasDemoDefault = [];
files.forEach(function (f) {
  const code = stripComments(f.text);
  if (/get\(\s*['"]mode['"]\s*\)/.test(code)) readsQueryMode.push(f.name);
  if (/\|\|\s*['"]demo['"]/.test(code))       hasDemoDefault.push(f.name);
});
check('A3 no RRV8 file reads the mode query parameter', readsQueryMode, []);
check("A4 no RRV8 file carries a || 'demo' fallback in code", hasDemoDefault, []);

const sidebar = stripComments(
  files.filter(function (f) { return f.name === 'sidebar.js'; })[0].text);
const modeProducers = (sidebar.match(/function _rrMode\s*\(/g) || []).length;
check('A5 sidebar.js declares exactly one mode producer', modeProducers, 1);

// A6 -- the shape A4 could not see. A4 asks about a `|| 'demo'` fallback;
// this asks whether anything COMPARES a value to 'demo' without having asked
// RRENV.mode() for it first.
const cmp = scanDemoComparisons(files);
check("A6 no RRV8 file compares an un-coerced value to 'demo'", cmp.offenders, []);
// The exemption is itself asserted: it must cover the coercion and only the
// coercion. Zero means it stopped matching (every future comparison would then
// red for the wrong reason); more than one means it is absorbing something it
// was never meant to.
check('A6 the coercion exemption covers exactly one site',
      cmp.exempted.length, 1);

// ---------------------------------------------------------------------------
// MUTATION CONTROL
// ---------------------------------------------------------------------------
console.log('\nmutation control -- demo default re-injected into RRENV.mode():');
const MUTANT = config.replace(
  "return m === 'demo' ? 'staging' : m;",
  "return m;");
if (MUTANT === config) {
  console.log('  FAIL  mutation did not apply -- the control is vacuous');
  failures++;
} else {
  const mutantDemo = modeWith({ mode: 'demo' }, MUTANT);
  const caught = (mutantDemo === 'demo');
  console.log('  ' + (caught ? 'ok  ' : 'FAIL') +
              '  A2 fails on the mutant (mode:"demo" -> "' + mutantDemo + '")');
  if (!caught) {
    failures++;
    console.log('  the control did not discriminate: A2 would have passed against '
                + 'the known defect');
  }
  // Must SURVIVE the mutation, or the suite is just failing everything: a
  // deploy that sets its mode was never affected by this defect.
  const stillFine = modeWith({ mode: 'prod' }, MUTANT);
  const survives = (stillFine === 'prod');
  console.log('  ' + (survives ? 'ok  ' : 'FAIL') +
              '  a configured deploy is unaffected by the mutant (still "' + stillFine + '")');
  if (!survives) failures++;
}

// ---------------------------------------------------------------------------
// MUTATION CONTROL -- A6
//
// A6 was written against the live defect and measured red before it was fixed
// (UI-194: admin-activity-log.html:RR_CONFIG.mode). Once that line was deleted
// the assertion has nothing left to find, and an assertion that can only ever
// find nothing is indistinguishable from one that is broken. These two mutants
// put the defect back, in the two places that fail differently.
// ---------------------------------------------------------------------------
console.log('\nmutation control -- the demo comparison re-injected:');

/** Re-run the A6 scan over `files` with one file's text replaced. */
function scanWithMutant(name, text) {
  return scanDemoComparisons(files.map(function (f) {
    return f.name === name ? { name: name, text: text } : f;
  })).offenders;
}

// M1 -- an ordinary page. The shape the defect actually took.
const HOME = files.filter(function (f) { return f.name === 'home.html'; })[0];
const m1 = scanWithMutant(HOME.name,
  HOME.text + '\n<script>if (RR_CONFIG.mode === "demo") { void 0; }</script>\n');
const m1ok = m1.indexOf('home.html:RR_CONFIG.mode') !== -1;
console.log('  ' + (m1ok ? 'ok  ' : 'FAIL') +
            '  A6 catches a raw comparison on a page   (offenders ' +
            JSON.stringify(m1) + ')');
if (!m1ok) failures++;

// M2 -- the same comparison inside config.js, OUTSIDE RRENV.mode(). This is
// the one that matters: the exemption is a byte range, not a file pass, and if
// it ever degrades into "config.js is allowed to say 'demo'" then the 1,000-
// line producer becomes the blind spot A6 was written to close.
const CFG = files.filter(function (f) { return f.name === 'config.js'; })[0];
const m2 = scanWithMutant(CFG.name,
  CFG.text + "\n;if (window.RR_CONFIG && RR_CONFIG.mode !== 'demo') { void 0; }\n");
const m2ok = m2.indexOf('config.js:RR_CONFIG.mode') !== -1;
console.log('  ' + (m2ok ? 'ok  ' : 'FAIL') +
            '  A6 catches one INSIDE config.js, outside the coercion   (offenders ' +
            JSON.stringify(m2) + ')');
if (!m2ok) failures++;

// M3 -- and it must SURVIVE the legitimate shape, or A6 is just failing
// everything and the two results above prove nothing. Comparing the coerced
// producer is allowed: A2 shows RRENV.mode() cannot return 'demo'.
const m3 = scanWithMutant(HOME.name,
  HOME.text + "\n<script>if (RRENV.mode() === 'demo') { void 0; }</script>\n");
const m3ok = m3.length === 0;
console.log('  ' + (m3ok ? 'ok  ' : 'FAIL') +
            "  RRENV.mode() === 'demo' is NOT flagged   (offenders " +
            JSON.stringify(m3) + ')');
if (!m3ok) failures++;

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions passed'));
process.exit(failures ? 1 : 0);
