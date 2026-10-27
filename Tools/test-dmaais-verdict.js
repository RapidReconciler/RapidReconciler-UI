/* test-dmaais-verdict.js -- behaviour test for UI-237: the DMAAIs model verdict states facts, not chores.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-dmaais-verdict.js
 *
 * WHY THIS EXISTS. accounting-dmaais.html rendered "Not yet approved - sign off" and "Model changed since
 * approval - re-approve" as links to accounting-model-review.html. That page has no sign-off control and no
 * page in RRV8 posts the approval, so both links sent the analyst to do something nothing lets them do
 * (UI-109). Owner ruling 2026-10-26: "Reword, no action" -- keep the three states as information, drop the
 * links, and promise no action.
 *
 * The shipped renderModelVerdict is EXTRACTED from accounting-dmaais.html and run, so this exercises the
 * real text.
 *
 *   V1  approved: "Model approved", who and when, the check icon; the tab dot shows approved
 *   V2  needs-review: says the model changed since it was last approved; no link, no "re-approve"
 *   V3  unapproved: says the model is not approved yet; no link, no "sign off"; no tab dot
 *   V4  a state this page doesn't know: no claim at all (badge and dot hidden)
 *   V5  no page in RRV8 links model-review with sign-off / re-approve wording
 *   V6  the model-review header no longer carries the OPEN CONTRADICTION note, and records the ruling
 *   V7  no RRV8 page promises a re-approval in text (home.html's audit entry for the same approval did)
 *
 * TWO MUTATION CONTROLS: the old link put back into each branch in turn. Each must redden exactly its own case.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const html = read('RRV8/accounting-dmaais.html');
const review = read('RRV8/accounting-model-review.html');

const START = '  function renderModelVerdict(m) {';
const END = '\n  // Fire-and-forget; independent of the Model grid load.';
function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
for (const [label, anchor] of [['start', START], ['end', END]]) {
  if (occurrences(html, anchor) !== 1) {
    console.log('HARNESS BROKEN: ' + label + ' anchor appears ' + occurrences(html, anchor) + ' times, expected 1');
    process.exit(1);
  }
}
const SOURCE = html.slice(html.indexOf(START), html.indexOf(END));

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

function render(source, m) {
  const el = { hidden: true, className: '', innerHTML: '', title: '' };
  const dot = { hidden: true, className: '', title: '' };
  const sandbox = {
    document: { getElementById: (id) => (id === 'js-model-verdict' ? el : id === 'js-tab-dot-model' ? dot : null) },
    escapeHtml: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    console: { warn: () => {} },
    Date,
    String,
  };
  vm.runInNewContext(source + '\nrenderModelVerdict(M);', Object.assign(sandbox, { M: m }));
  return { el, dot };
}

const NO_ACTION = /<a[\s>]|sign[ -]?off|re-?approve/i;

function runCases(source) {
  reds = [];
  {
    const { el, dot } = render(source, { state: 'approved', approvedBy: 'jane.doe@example.com', approvedDate: '2026-09-14T12:00:00Z' });
    check('V1 approved: shown, says approved with who and when, no link, dot approved',
      [el.hidden, /Model approved/.test(el.innerHTML), /Jane Doe/.test(el.innerHTML), /Sep 14, 2026/.test(el.innerHTML),
        /<svg/.test(el.innerHTML), /<a[\s>]/.test(el.innerHTML), dot.hidden, /is-approved/.test(dot.className)],
      [false, true, true, true, true, false, false, true]);
  }
  {
    const { el, dot } = render(source, { state: 'needs-review' });
    check('V2 needs-review: shown, says changed since last approved, no link or chore, dot changed',
      [el.hidden, /Model changed since it was last approved/.test(el.innerHTML), NO_ACTION.test(el.innerHTML),
        NO_ACTION.test(el.title), dot.hidden, /is-changed/.test(dot.className)],
      [false, true, false, false, false, true]);
  }
  {
    const { el, dot } = render(source, { state: 'unapproved' });
    check('V3 unapproved: shown, says not approved yet, no link or chore, no dot',
      [el.hidden, /Model not approved yet/.test(el.innerHTML), NO_ACTION.test(el.innerHTML), NO_ACTION.test(el.title), dot.hidden],
      [false, true, false, false, true]);
  }
  {
    const { el, dot } = render(source, { state: 'something-new' });
    check('V4 unknown state: no claim, badge and dot hidden', [el.hidden, dot.hidden], [true, true]);
  }
  return reds;
}

console.log('shipped renderModelVerdict');
runCases(SOURCE);

// V5 -- across every RRV8 page: no link into model-review dressed as a sign-off chore.
const rrv8 = fs.readdirSync(path.join(ROOT, 'RRV8')).filter((f) => /\.(html|js)$/.test(f));
const chores = [];
for (const f of rrv8) {
  const t = read('RRV8/' + f);
  const re = /href="accounting-model-review\.html[^"]*"[^>]*>([^<]*)</g;
  let mm;
  while ((mm = re.exec(t))) if (/sign[ -]?off|re-?approve|approve/i.test(mm[1])) chores.push(f + ': ' + mm[1]);
}
check('V5 no RRV8 page links model-review as a sign-off chore (' + rrv8.length + ' files read)', chores, []);

// V7 -- the home.html audit entry for the same approval states the change as a fact too.
const promises = [];
for (const f of rrv8) {
  const t = read('RRV8/' + f);
  for (const p of ['re-approval needed', 'needs re-approval']) if (t.indexOf(p) >= 0) promises.push(f + ': ' + p);
}
check('V7 no RRV8 page promises a re-approval (audit entry included)', promises, []);

// V6 -- the header note that logged the contradiction now records how it was resolved.
check('V6 model-review header: no OPEN CONTRADICTION, names the ruling',
  [/OPEN CONTRADICTION/.test(review), /UI-237/.test(review) && /Reword, no action/.test(review)], [false, true]);

const shippedFailures = failures;

// Mutation controls: put the old link back into each branch. Each must redden exactly its own case.
const ARMS = [
  ['V2', /el\.innerHTML = 'Model changed since it was last approved[^;]*;/, "el.innerHTML = 'Model changed since it was last approved &mdash; <a href=\"accounting-model-review.html\">re-approve</a>';"],
  ['V3', /el\.innerHTML = 'Model not approved yet[^;]*;/, "el.innerHTML = 'Model not approved yet &mdash; <a href=\"accounting-model-review.html\">sign off</a>';"],
];
let armFailures = 0;
for (const [want, re, repl] of ARMS) {
  const mutant = SOURCE.replace(re, repl);
  if (mutant === SOURCE) { console.log('HARNESS BROKEN: arm ' + want + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: the old link back in the ' + want + ' branch');
  const got = runCases(mutant);
  failures = saved;
  const ok = got.length === 1 && got[0] === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want + ' only');
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
