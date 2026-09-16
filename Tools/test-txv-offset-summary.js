/* test-txv-offset-summary.js -- behaviour test for the Period Mismatch offset strip.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-txv-offset-summary.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron host.)
 *
 * WHY THIS EXISTS. The Period Mismatch card told the analyst to set GL Date Source
 * processing options and reschedule batch runs -- advice written for a period-end
 * straddle. Measured on a demo company, period 2026-02-28: the four rows on
 * that card offset SIX AND NINE MONTHS out, to 2025-08-31 and 2025-05-31. At that
 * distance the advice is wrong, and usp8_txv_period_mismatch's own header says so:
 * "a nine-month gap is not a cut-off, so the card must not tell the analyst that
 * every row on it is timing."
 *
 * The card did carry that caution. It was the third bullet of a three-paragraph
 * generic block that read identically on every Period Mismatch card in the fleet.
 *
 * The four partner rows were also ALREADY CLASSIFIED -- the classifier grains on
 * (DocNumber, DocType, Company, Batch, ShortAccount) with no period in it, so both
 * sides carry SubType='Periods' and each names the other. The partner card existed;
 * there was no route to it.
 *
 * WHAT THIS ASSERTS, against the shipped _offsetSummary extracted from home.html:
 *
 *   D1  no offsets -> null, so a card with nothing to say renders nothing
 *   D2  ONE card can name MORE THAN ONE period, and both survive with their counts
 *   D3  the real Demo2 case: 2 periods, 6 and 9 months, straddle=false
 *   D4  a one-month pair is straddle=true
 *   D5  maxGap is the WIDEST gap, not the first or the nearest -- the narrow one
 *       must not be allowed to vouch for the wide one
 *   D6  the year boundary is counted in months, not subtracted as years
 *   D7  every period carries a link to its own card, at the right period
 *   D8  periods come back in a stable sorted order regardless of insertion order
 *   D9  minGap is the NEAREST gap, so the lead states a RANGE -- "6 to 9 months
 *       out" -- instead of the widest figure alone. Owner ruling 2026-09-16, taken
 *       at the screen. Collapses to one figure when there is only one partner.
 *
 * SIX MUTATION CONTROLS at the end, each declaring what must go RED and what must
 * STAY GREEN. A suite that has only run against fixed code is untested.
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
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  return ok;
}

const START = '  function _offsetSummary(offsets, focusP, co) {';
const END   = '\n  // Raw residual rows for the scoped company';

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
const SOURCE = html.slice(html.indexOf(START), html.indexOf(END, html.indexOf(START)));

function run(offsets, focusP, source) {
  if (source === undefined) source = SOURCE;
  const sandbox = {
    // The real href builder is a separate concern with its own call sites. Stubbed to
    // record what it was ASKED for, which is the part this producer is responsible for.
    _txvTxHref: function (co, p) { return 'tx?co=' + co + '&period=' + p.period + '&card=' + p.card; },
    console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.__sum = _offsetSummary;', sandbox);
  if (typeof sandbox.__sum !== 'function') {
    throw new Error('HARNESS BROKEN: extracted source did not define _offsetSummary');
  }
  return sandbox.__sum(offsets, focusP, '00001');
}

function suite(source, label) {
  failures = 0; reds = [];
  console.log(label + '\n');

  // D1 -- nothing to say
  check('D1 no offsets at all -> null', run({}, '2026-02-28', source), null);
  check('D1 undefined offsets -> null', run(undefined, '2026-02-28', source), null);

  // D3/D2 -- the measured Demo2 card, exactly as it stands in the database
  const real = run({ '2025-05-31': 2, '2025-08-31': 2 }, '2026-02-28', source);
  check('D2 both offset periods survive', real.periods.map((x) => x.period),
        ['2025-05-31', '2025-08-31']);
  check('D2 each keeps its own row count', real.periods.map((x) => x.rows), [2, 2]);
  check('D3 the two gaps are 9 and 6 months', real.periods.map((x) => x.months), [9, 6]);
  check('D3 maxGap is 9', real.maxGap, 9);
  check('D3 nine months apart is NOT a straddle', real.straddle, false);

  // D9 -- THE RANGE. Owner ruling 2026-09-16, taken after reading this exact card on
  // screen: the lead says "6 to 9 months out", not "9 months out". A lead reporting
  // only the widest gap above links reading 2025-05-31 and 2025-08-31 made the reader
  // work out for themselves that one partner is six months away -- an analyst
  // reconciling two figures on one strip, which is the noise this row exists to remove.
  check('D9 minGap is the NEAREST gap, so the lead can state a range', real.minGap, 6);
  check('D9 minGap and maxGap bracket every per-period gap',
        real.periods.every((x) => x.months >= real.minGap && x.months <= real.maxGap), true);

  // D4 -- the shape the fix list is actually written for
  const one = run({ '2026-01-31': 3 }, '2026-02-28', source);
  check('D4 one month apart IS a straddle', one.straddle, true);
  check('D4 and its gap is 1', one.maxGap, 1);
  // A single partner is not a range. The renderer collapses to one figure on this
  // equality, so if the two ever disagreed for one period the card would print
  // "1 to 1 months out" -- a range wearing a costume.
  check('D9 one partner -> minGap === maxGap, so the lead collapses to one figure',
        one.minGap === one.maxGap, true);

  // D5 -- THE ONE THAT MATTERS. A card mixing a near pair with a far pair must be
  // judged on the far one. Taking the first or the smallest would let a straddle
  // vouch for a nine-month gap and print the wrong advice as if it were proven.
  const mixed = run({ '2026-01-31': 1, '2025-05-31': 1 }, '2026-02-28', source);
  check('D5 a near pair does NOT make a mixed card a straddle', mixed.straddle, false);
  check('D5 maxGap takes the WIDEST gap', mixed.maxGap, 9);

  // D6 -- month arithmetic across a year boundary
  check('D6 Dec -> Jan is one month, not eleven',
        run({ '2025-12-31': 1 }, '2026-01-31', source).maxGap, 1);
  check('D6 Feb 2025 -> Feb 2026 is twelve months',
        run({ '2025-02-28': 1 }, '2026-02-28', source).maxGap, 12);

  // D7 -- the route to the partner card, which is the whole point
  check('D7 each period links to ITS OWN period, not the focused one',
        real.periods.map((x) => x.href),
        ['tx?co=00001&period=2025-05-31&card=PER', 'tx?co=00001&period=2025-08-31&card=PER']);

  // D8 -- stable order regardless of how the rows happened to arrive
  check('D8 order is sorted, not insertion order',
        run({ '2025-08-31': 1, '2025-05-31': 1 }, '2026-02-28', source).periods.map((x) => x.period),
        ['2025-05-31', '2025-08-31']);

  return { failures: failures, reds: reds.slice() };
}

(function () {
  const real = suite(SOURCE, 'Period Mismatch offset strip -- the SHIPPED _offsetSummary()');
  console.log('\n  ' + (real.failures ? real.failures + ' FAILED' : 'all green') + '\n');

  const mutations = [
    {
      name: 'M1 judge the card on the NEAREST gap instead of the widest',
      from: 'var maxGap = Math.max.apply(null, gaps);',
      to:   'var maxGap = Math.min.apply(null, gaps);',
      // ⚠ D9 IS IN HERE AND I FIRST DECLARED IT GREEN, WHICH THE CONTROL CAUGHT.
      // D9's second assertion brackets every per-period gap between minGap and maxGap,
      // so it is sensitive to BOTH ends -- collapsing maxGap to 6 leaves a period
      // reporting 9 months outside its own stated range. The declaration was wrong,
      // not the code. Recorded because a mutation whose green set is guessed rather
      // than reasoned is how a control gets relaxed until it proves nothing.
      mustRedden: ['D3', 'D5', 'D9'],
      mustStayGreen: ['D1', 'D2', 'D4', 'D6', 'D7', 'D8']
    },
    {
      name: 'M2 widen the straddle test to 12 months (the tempting "close enough")',
      from: 'straddle: maxGap <= 1',
      to:   'straddle: maxGap <= 12',
      mustRedden: ['D3', 'D5'],
      mustStayGreen: ['D1', 'D2', 'D4', 'D6', 'D7', 'D8', 'D9']
    },
    {
      name: 'M3 subtract years instead of counting months',
      from: '(Number(x[0]) - Number(y[0])) * 12 + (Number(x[1]) - Number(y[1]))',
      to:   '(Number(x[0]) - Number(y[0])) * 12',
      mustRedden: ['D3', 'D4', 'D5', 'D6', 'D9'],
      mustStayGreen: ['D1', 'D2', 'D7', 'D8']
    },
    {
      name: 'M4 link every period at the FOCUSED period (the partner card never opens)',
      from: "href: _txvTxHref(co, { period: k, card: 'PER' })",
      to:   "href: _txvTxHref(co, { period: focusP, card: 'PER' })",
      mustRedden: ['D7'],
      mustStayGreen: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D8', 'D9']
    },
    {
      name: 'M5 drop the sort, so order follows however the rows arrived',
      // ⚠ No trailing newline in the anchor: home.html is CRLF, so '...;\n' matched
      // zero times and the control reported itself broken rather than passing silently.
      from: 'keys.sort();',
      to:   '',
      mustRedden: ['D8'],
      mustStayGreen: ['D1', 'D4', 'D6', 'D7']
    },
    {
      // UI-202, 2026-09-16. Without this, D9 would be a green assertion against an
      // expression that could be wrong in the one direction that matters -- reporting
      // the range as "9 to 9" and quietly losing the near partner again.
      name: 'M6 take the WIDEST gap for the near end too, collapsing the range',
      from: 'var minGap = Math.min.apply(null, gaps);',
      to:   'var minGap = Math.max.apply(null, gaps);',
      mustRedden: ['D9'],
      mustStayGreen: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']
    }
  ];

  let controlFailures = 0;
  for (const m of mutations) {
    if (occurrences(SOURCE, m.from) !== 1) {
      console.log('CONTROL BROKEN: ' + m.name + ' -- target appears ' +
                  occurrences(SOURCE, m.from) + ' times, expected 1');
      controlFailures++;
      continue;
    }
    const r = suite(SOURCE.replace(m.from, m.to), '--- MUTATION ' + m.name + ' ---');
    const red = new Set(r.reds);
    const missed = m.mustRedden.filter((c) => !red.has(c));
    const bonus  = m.mustStayGreen.filter((c) => red.has(c));
    if (missed.length) {
      console.log('\n  CONTROL FAILED: ' + m.name + ' -- did NOT go red: ' + missed.join(', '));
      controlFailures++;
    }
    if (bonus.length) {
      console.log('\n  CONTROL FAILED: ' + m.name + ' -- went red but should not have: ' + bonus.join(', '));
      controlFailures++;
    }
    if (!missed.length && !bonus.length) {
      console.log('\n  control ok -- reddened exactly ' + m.mustRedden.join(', ') + '\n');
    }
  }

  const bad = real.failures + controlFailures;
  console.log(bad ? '\nRESULT: ' + bad + ' problem(s)\n'
                  : '\nRESULT: all assertions and all 6 mutation controls pass\n');
  process.exit(bad ? 1 : 0);
})();
