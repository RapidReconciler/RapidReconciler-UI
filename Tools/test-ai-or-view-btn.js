/* test-ai-or-view-btn.js -- behaviour test for the shared AI/View control on Home.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-ai-or-view-btn.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron
 * host and this test runs on it. Any Node-compatible binary works.)
 *
 * WHY THIS EXISTS. The Transaction Variance card heads carried a sparkle "AI"
 * pill to their analysis view while the two Data Health bands carried a plain
 * "View ->" to the same kind of destination: two tabs disagreeing about what one
 * journey is called. Both now come from one producer, aiOrViewBtn().
 *
 * THE INVARIANT THAT MATTERS MOST is C5. An "AI button" here is BRANDING on a
 * navigation -- it must open exactly what the plain control opened. If the AI and
 * the non-AI form ever resolve to different hrefs, the band rows lose their only
 * route to their pages and nothing on screen says so.
 *
 * WHAT THIS ASSERTS. The shipped source is EXTRACTED from home.html and run, so
 * these exercise the real text rather than a retyped copy of it.
 *
 *   C1  AI on, band shape   -> .alh-act.ai, sparkle, label "AI"
 *   C2  AI off, band shape  -> .alh-act.ghost, no sparkle, "View"
 *   C3  AI on, pill shape   -> .txv-aibtn, sparkle, .txv-aibtn-lbl
 *   C4  AI off, pill shape  -> .txv-aibtn.is-plain, "View"
 *   C5  the href is byte-identical on and off, both shapes
 *   C6  title and aria-label carry the SAME sentence, and name the AI view only
 *       when AI is on
 *   C7  a missing RRAI is treated as AI-ON, not off
 *   C8  an RRAI that THROWS is treated as AI-ON, not off
 *   C9  the subject is escaped before it reaches title/aria-label
 *
 * FOUR MUTATION CONTROLS at the end. A suite that has only ever run against
 * fixed code is untested (feedback_test_against_the_known_defect), and last
 * session three separate gates were decorative until a mutation proved they were
 * not. Each control names which assertions must go RED and which must STAY GREEN
 * -- a mutation that reddens everything proves far less than one that reddens
 * exactly the assertions describing it.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8');

let failures = 0;
let reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) +
                         ' want ' + JSON.stringify(want)));
  return ok;
}

// ---------------------------------------------------------------------------
// Extract the shipped source. Both anchors are asserted to appear exactly once
// before slicing -- an anchor that matches twice silently takes the wrong span,
// and the failure then looks like a product bug rather than a harness bug.
// ---------------------------------------------------------------------------
const START = 'var AI_SPARK_SVG = ';
const END   = '\n  function loadAiPlan() {';

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
for (const [label, anchor] of [['start', START], ['end', END]]) {
  if (occurrences(html, anchor) !== 1) {
    console.log('HARNESS BROKEN: ' + label + ' anchor appears ' +
                occurrences(html, anchor) + ' times, expected 1');
    process.exit(1);
  }
}
const from = html.indexOf(START);
const to   = html.indexOf(END, from);
const SOURCE = html.slice(from, to);

// ---------------------------------------------------------------------------
// Run the extracted source against a stub.
//
// `rrai` is how the scenario supplies window.RRAI:
//   { tier: 'off' | 'full' }  a working RRAI at that tier
//   'absent'                  window.RRAI undefined
//   'throws'                  RRAI.get() raises
// ---------------------------------------------------------------------------
function build(href, opts, rrai, source) {
  if (source === undefined) source = SOURCE;

  let RRAI;
  if (rrai === 'absent')      RRAI = undefined;
  else if (rrai === 'throws') RRAI = { get: function () { throw new Error('boom'); } };
  else                        RRAI = { get: function () { return rrai.tier; } };

  const sandbox = {
    // The shipped escaper, by behaviour not by copy: whatever home.html's own
    // esc() does is not what is under test here, only that it is CALLED.
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    window: { RRAI: RRAI },
    console: console
  };
  sandbox.RRAI = RRAI;          // home.html reads the bare global too
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // ⚠ Do NOT rely on a top-level `function` declaration landing on the
  // contextified global -- it does not here. Hand the function out explicitly.
  vm.runInContext(source + '\nglobalThis.__btn = aiOrViewBtn;', sandbox);
  if (typeof sandbox.__btn !== 'function') {
    throw new Error('HARNESS BROKEN: extracted source did not define aiOrViewBtn');
  }
  return sandbox.__btn(href, opts);
}

// Pull one attribute out of the rendered anchor. Deliberately crude: a real
// parser would paper over malformed markup, and malformed markup is a finding.
function attr(h, name) {
  const m = new RegExp(name + '="([^"]*)"').exec(h);
  return m ? m[1] : null;
}
const hasSpark = (h) => /<svg /.test(h);
const HREF = 'inventory-account-rollforward.html?company=00001%20%26%20co';

function suite(source, label) {
  failures = 0; reds = [];
  console.log(label + '\n');

  // --- C1/C2 the band shape (the two buttons the owner boxed) ----------------
  let on  = build(HREF, { subject: 'the account roll-forward' }, { tier: 'full' }, source);
  let off = build(HREF, { subject: 'the account roll-forward' }, { tier: 'off' },  source);

  check('C1 AI on  -> band class is alh-act ai', attr(on, 'class'), 'alh-act ai');
  check('C1 AI on  -> the sparkle is drawn', hasSpark(on), true);
  check('C1 AI on  -> the visible label is AI', />AI</.test(on), true);
  check('C2 AI off -> band class is alh-act ghost', attr(off, 'class'), 'alh-act ghost');
  check('C2 AI off -> no sparkle', hasSpark(off), false);
  check('C2 AI off -> the visible label is View', /View <span/.test(off), true);
  check('C2 AI off -> the label is NOT AI', />AI</.test(off), false);

  // --- C3/C4 the pill shape (Transaction Variance card heads) ---------------
  const onP  = build(HREF, { pill: true, subject: 'Purchasing' }, { tier: 'full' }, source);
  const offP = build(HREF, { pill: true, subject: 'Purchasing' }, { tier: 'off' },  source);

  check('C3 AI on  -> pill class is txv-aibtn', attr(onP, 'class'), 'txv-aibtn');
  check('C3 AI on  -> pill keeps its own label span',
        /class="txv-aibtn-lbl">AI</.test(onP), true);
  check('C4 AI off -> pill class is txv-aibtn is-plain',
        attr(offP, 'class'), 'txv-aibtn is-plain');
  check('C4 AI off -> pill says View', /View <span/.test(offP), true);

  // --- C5 THE INVARIANT -----------------------------------------------------
  // The AI form and the plain form must open the same thing. This is the one
  // that stops an "AI button" from quietly becoming a different journey.
  check('C5 band href survives the tier unchanged', attr(off, 'href'), attr(on, 'href'));
  check('C5 band href is the one passed in',        attr(on, 'href'),  HREF);
  check('C5 pill href survives the tier unchanged', attr(offP, 'href'), attr(onP, 'href'));
  check('C5 pill href is the one passed in',        attr(onP, 'href'),  HREF);

  // --- C6 one sentence, two sinks -------------------------------------------
  check('C6 AI on  -> title and aria-label agree', attr(on, 'title'), attr(on, 'aria-label'));
  check('C6 AI off -> title and aria-label agree', attr(off, 'title'), attr(off, 'aria-label'));
  check('C6 AI on  -> the sentence names the AI view',
        attr(on, 'title'), 'Open the account roll-forward in the AI analysis view');
  check('C6 AI off -> the sentence does NOT name the AI view',
        attr(off, 'title'), 'Open the account roll-forward');

  // --- C7/C8 the fallback DIRECTION -----------------------------------------
  // A missing or broken RRAI must leave the affordance in place. Falling the
  // other way would strip the AI entry point off every card on any page where
  // config.js failed to load, silently.
  const noRrai  = build(HREF, { subject: 'x' }, 'absent', source);
  const badRrai = build(HREF, { subject: 'x' }, 'throws', source);
  check('C7 RRAI absent is treated as AI-ON', attr(noRrai, 'class'), 'alh-act ai');
  check('C8 RRAI that throws is treated as AI-ON', attr(badRrai, 'class'), 'alh-act ai');

  // --- C9 the subject reaches two attributes, so it must be escaped ---------
  // ⚠ Asserted WITHOUT reference to the AI-view wording. The first draft matched
  // the whole sentence, which made this assertion tier-coupled: M1 reddened it by
  // flipping the tier, not by breaking any escaping. An assertion that fails for
  // a reason other than the one it names is worse than no assertion.
  const quoted = build(HREF, { subject: 'a "quoted" <name>' }, { tier: 'full' }, source);
  check('C9 the quote and the angle brackets are escaped',
        /&quot;quoted&quot; &lt;name&gt;/.test(quoted), true);
  check('C9 no raw quote survives into the attribute',
        /"quoted"/.test(quoted), false);

  return { failures: failures, reds: reds.slice() };
}

(function () {
  const real = suite(SOURCE, 'AI/View control -- behaviour of the SHIPPED aiOrViewBtn()');
  console.log('\n  ' + (real.failures ? real.failures + ' FAILED' : 'all green') + '\n');

  // -------------------------------------------------------------------------
  // MUTATION CONTROLS. Each names the assertions it must redden AND the ones it
  // must leave green.
  // -------------------------------------------------------------------------
  // ⚠ THE mustStayGreen LISTS BELOW WERE WRITTEN WRONG THE FIRST TIME AND THE
  // CONTROLS CAUGHT IT, which is the whole point of declaring both halves. M1 and
  // M2 both rewrite the tier EXPRESSION inside aiIsOff(); neither can reach C7
  // (window.RRAI is falsy, so && short-circuits before the expression runs) or C8
  // (the throw is caught before any comparison). Listing those as mustRedden was
  // a guess about the code path, and the run disproved it. C8's only protection
  // is the try/catch, so M4 exists to exercise that specifically -- otherwise the
  // catch clause would have had no control over it at all.
  const mutations = [
    {
      name: 'M1 invert the off test (=== becomes !==)',
      from: "RRAI.get() === 'off'",
      to:   "RRAI.get() !== 'off'",
      mustRedden: ['C1', 'C2', 'C3', 'C4', 'C6'],
      mustStayGreen: ['C5', 'C7', 'C8', 'C9']
    },
    {
      name: 'M2 fail CLOSED when RRAI is missing (the tempting simplification)',
      from: "return !!(window.RRAI && RRAI.get() === 'off');",
      to:   "return !(window.RRAI && RRAI.get() !== 'off');",
      mustRedden: ['C7'],
      mustStayGreen: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C8', 'C9']
    },
    {
      name: 'M3 drop the escaper on the description',
      from: "+ ' title=\"' + esc(desc) + '\" aria-label=\"' + esc(desc) + '\">'",
      to:   "+ ' title=\"' + desc + '\" aria-label=\"' + desc + '\">'",
      mustRedden: ['C9'],
      mustStayGreen: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']
    },
    {
      name: 'M4 make the RRAI-throws catch fall to OFF instead of ON',
      from: 'catch (_) { return false; }',
      to:   'catch (_) { return true; }',
      mustRedden: ['C8'],
      mustStayGreen: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C9']
    }
  ];

  let controlFailures = 0;
  for (const m of mutations) {
    if (occurrences(SOURCE, m.from) !== 1) {
      console.log('CONTROL BROKEN: ' + m.name + ' -- target text appears ' +
                  occurrences(SOURCE, m.from) + ' times in the extracted source, expected 1');
      controlFailures++;
      continue;
    }
    const r = suite(SOURCE.replace(m.from, m.to), '--- MUTATION ' + m.name + ' ---');
    const reddened = new Set(r.reds);
    const missed  = m.mustRedden.filter((c) => !reddened.has(c));
    const bonus   = m.mustStayGreen.filter((c) => reddened.has(c));
    if (missed.length) {
      console.log('\n  CONTROL FAILED: ' + m.name +
                  ' -- these did NOT go red: ' + missed.join(', '));
      controlFailures++;
    }
    if (bonus.length) {
      console.log('\n  CONTROL FAILED: ' + m.name +
                  ' -- these went red but should not have: ' + bonus.join(', '));
      controlFailures++;
    }
    if (!missed.length && !bonus.length) {
      console.log('\n  control ok -- reddened exactly ' + m.mustRedden.join(', ') + '\n');
    }
  }

  const bad = real.failures + controlFailures;
  console.log(bad ? '\nRESULT: ' + bad + ' problem(s)\n' : '\nRESULT: all assertions and all 4 mutation controls pass\n');
  process.exit(bad ? 1 : 0);
})();
