/* test-mark-complete-help.js -- behaviour test for UI-238: Mark Complete is explained where a V8 accountant reads.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-mark-complete-help.js
 *
 * WHY THIS EXISTS. Mark Complete is the accountant's step-5 action on every company card, and nothing a V8 user
 * reads explained it: no University page mentions it (those are V7 guides), the help panel's "Terms on this page"
 * is the ANALYST glossary, and the accountant AI's list of on-screen features left it out, so a question about it
 * was answered from nothing. Owner ruling 2026-10-26: "In-app help" -- document V8-only actions in V8's own help.
 *
 * The entry lives in ONE string, RRV8.ACCT_TERMS (config.js). The help panel shows it to the accountant view and
 * the accountant's AI is handed the same string, the way RRV8.GLOSSARY feeds the analyst's panel and prompts.
 *
 *   H1  ACCT_TERMS has a MARK COMPLETE entry on the home surface naming every outcome exactly as the menu shows it,
 *       plus Reopen
 *   H2  the help panel, run from the shipped help-sidebar.js, shows it in the accountant view
 *   H3  ...and not in the analyst or admin view, where nobody marks a company complete
 *   H4  RRV8.GLOSSARY does not carry it: that string goes into every analyst prompt
 *   H5  the accountant's question prompt in home.html is handed ACCT_TERMS
 *   H6  the entry says what the code does: Journal Entry Complete (Adjusting Entry) marks the company Corrected by
 *       itself, and the Balancing Entry dialog has no such button
 *   H7  Walkthrough step 5 points at the help, and says an Adjusting Entry already marked the card Corrected
 *
 * TWO MUTATION CONTROLS: the panel's ACCT_TERMS read removed (must redden H2 only), and one outcome dropped from
 * the entry (must redden H1 only).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const config = read('RRV8/config.js');
const sidebar = read('Tools/help-sidebar.js');
const home = read('RRV8/home.html');

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
function between(hay, start, end, label) {
  if (occurrences(hay, start) !== 1) { console.log('HARNESS BROKEN: ' + label + ' start anchor appears ' + occurrences(hay, start) + ' times'); process.exit(1); }
  const i = hay.indexOf(start), j = hay.indexOf(end, i + start.length);
  if (j < 0) { console.log('HARNESS BROKEN: ' + label + ' end anchor missing'); process.exit(1); }
  return hay.slice(i, j + end.length);
}

const GLOSSARY_SRC = between(config, 'window.RRV8.GLOSSARY = [', "].join('\\n');", 'GLOSSARY');
const HAS_TERMS = occurrences(config, 'window.RRV8.ACCT_TERMS = [') === 1;
const TERMS_SRC = HAS_TERMS ? between(config, 'window.RRV8.ACCT_TERMS = [', "].join('\\n');", 'ACCT_TERMS') : '';
const GLOSS_FN = between(sidebar, '  function glossaryHtml(', '\n  function init() {', 'glossaryHtml').replace(/\n  function init\(\) \{$/, '');
const DISPO = between(home, '  var DISPO_REASONS = [', '  ];', 'DISPO_REASONS');
const LABELS = [...DISPO.matchAll(/label: '([^']+)'/g)].map((m) => m[1].replace(/&mdash;/g, '\u2014'));
if (LABELS.length !== 4) { console.log('HARNESS BROKEN: expected 4 DISPO_REASONS labels, read ' + LABELS.length); process.exit(1); }
const STEP5 = between(home, "{ tab: 'rec', title: 'Mark it complete'", '] },', 'walkthrough step 5');
const ACCT_Q = between(home, "+ 'Other on-screen features you can explain in plain terms if asked", '+ _aiDocCatalogPrompt()', 'accountant prompt');
const JE_MODAL = between(home, '<div class="je-modal" id="jeModal"', '\n</div>', 'jeModal');

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

function constants(termsSrc) {
  const win = { RRV8: {} };
  vm.runInNewContext(GLOSSARY_SRC + '\n' + termsSrc, { window: win });
  return win.RRV8;
}
function panel(fnSrc, termsSrc, role) {
  const RRV8 = constants(termsSrc);
  const box = { window: { RRV8 }, console: { warn: () => {} }, String, out: '' };
  vm.runInNewContext(fnSrc + '\nout = glossaryHtml("home", ROLE);', Object.assign(box, { ROLE: role }));
  return box.out;
}
function markLine(termsSrc) {
  const t = constants(termsSrc).ACCT_TERMS || '';
  return t.split('\n').find((l) => /^- MARK COMPLETE\b/.test(l)) || '';
}

function runCases(fnSrc, termsSrc) {
  reds = [];
  const line = markLine(termsSrc);
  check('H1 ACCT_TERMS: a MARK COMPLETE entry on home naming all four outcomes and Reopen',
    [!!line, /\[ON=[^\]]*\bhome\b[^\]]*\]/.test(line), LABELS.filter((l) => line.indexOf(l) < 0), /\bReopen\b/.test(line)],
    [true, true, [], true]);
  const acct = panel(fnSrc, termsSrc, 'accountant');
  check('H2 help panel, accountant view: shows Mark Complete', /<dt>MARK COMPLETE/.test(acct), true);
  check('H3 help panel, analyst and admin views: no Mark Complete',
    [/MARK COMPLETE/.test(panel(fnSrc, termsSrc, 'analyst')), /MARK COMPLETE/.test(panel(fnSrc, termsSrc, 'admin'))], [false, false]);
  return reds;
}

console.log('shipped');
runCases(GLOSS_FN, TERMS_SRC);
check('H4 RRV8.GLOSSARY (every analyst prompt) does not carry Mark Complete', /MARK COMPLETE/i.test(constants('').GLOSSARY), false);
check('H5 the accountant question prompt is handed RRV8.ACCT_TERMS', /RRV8\.ACCT_TERMS/.test(ACCT_Q), true);
{
  const line = markLine(TERMS_SRC);
  check('H6 entry: Journal Entry Complete marks Corrected by itself; the Balancing Entry dialog has no such button',
    [/Journal Entry Complete/.test(line), /Adjusting Entry/.test(line), /Corrected/.test(line), /Balancing Entry/.test(line),
      occurrences(home, 'id="oeCompleteBtn">Journal Entry Complete') === 1, /Journal Entry Complete/.test(JE_MODAL)],
    [true, true, true, true, true, false]);
}
check('H7 Walkthrough step 5: points at the help, says an Adjusting Entry already marked it Corrected',
  [/Terms on this page/.test(STEP5), /Journal Entry Complete/.test(STEP5) && /already/.test(STEP5)], [true, true]);

const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, fnSrc, termsSrc) {
  if (fnSrc === GLOSS_FN && termsSrc === TERMS_SRC) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = runCases(fnSrc, termsSrc);
  failures = saved;
  const ok = got.length === 1 && got[0] === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want + ' only');
}
if (shippedFailures === 0) {
  arm('the panel never reads ACCT_TERMS', 'H2', GLOSS_FN.replace(/window\.RRV8\.ACCT_TERMS/g, 'window.RRV8.NOT_THERE'), TERMS_SRC);
  arm('one outcome dropped from the entry', 'H1', GLOSS_FN, TERMS_SRC.replace('Timing \u2014 will self-clear', 'Timing'));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
