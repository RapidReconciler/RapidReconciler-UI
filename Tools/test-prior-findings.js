/* test-prior-findings.js -- behaviour test for the prior-analyst-findings
 * retrieval layer (UI-203).
 *
 *   "C:/actions-runner/externals.2.337.0/node24/bin/node.exe" Tools/test-prior-findings.js
 *
 * (node is not on this box's PATH. Any Node-compatible binary works; parsecheck.py
 * discovers an Electron host that runs this file unchanged.)
 *
 * WHY THIS EXISTS. An analyst's finding used to change its own card, become an
 * Audit Center entry, and never be read again -- measured 2026-09-15, one of
 * eleven ai/explain prompt builders touched the finding store and what it passed
 * was a review-state date. RRV8.priorFindings is the retrieval layer that answers
 * "what did an analyst conclude last time this pattern appeared", and
 * _analystTxFacts is the one place in home.html that puts the answer in front of
 * the model.
 *
 * THE RISK IS NOT "does it retrieve". It is that a WRONG finding propagates
 * wearing the voice of a verified fact. The classifier cites an assertion the SQL
 * actually makes and check_txv_cards.py fails the build otherwise; a free-text
 * note has no such gate. So the assertions below are weighted towards what must
 * NOT happen: a draft must not propagate, a stale one must not survive an edit, a
 * note must not ride at a tier that promises masking, and every line that does
 * ride must be labelled as something a person asserted.
 *
 * SOURCE IS NOT RETYPED. The shipped RRV8.priorFindings IIFE and the shipped
 * RRAI block are sliced out of RRV8/config.js and executed; _analystTxFacts is
 * sliced out of RRV8/home.html and executed. Every anchor used to slice or to
 * mutate is ASSERTED TO MATCH EXACTLY ONCE first -- a control in
 * test-ai-plan-tier.js once keyed on a line that hoisting had moved, .replace()
 * silently took the wrong occurrence, and the suite died while every assertion
 * had been passing.
 *
 * MUTATION CONTROLS at the end, each with a DECLARED RED SET and a DECLARED
 * GREEN SET, because a control that reddens everything proves nothing:
 *   M1  the tier gate is widened to admit Basic -- the Basic/Off assertions and
 *       the home.html wiring assertion must fail, while Full and the look-back
 *       window must stay green.
 *   M2  the supersede comparison is inverted so the OLDER version wins -- the
 *       supersede assertions must fail while the tier gate stays green.
 *   M3  the CALL SITE in home.html is removed -- the wiring assertion must fail
 *       while the rest of the fact builder stays green. M1 and M2 both mutate
 *       config.js and neither would notice a retrieval layer that nothing calls,
 *       which is precisely the state UI-203 was opened about.
 *
 * BLIND SPOTS, named rather than left to be discovered:
 *   - This never opens a socket. cardStore's server round-trip, and whether
 *     dbo.RTxvCardResolution actually holds the rows, are not exercised here.
 *   - It does not prove anything RENDERS. The label constant is a prompt-side
 *     constant today; no surface paints a retrieved finding yet.
 *   - It cannot tell whether a retrieved finding is CORRECT. Nothing can. That is
 *     precisely why the block is fenced and labelled instead of merged.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT   = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');
const home   = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '\n          got  ' + JSON.stringify(got) +
                         '\n          want ' + JSON.stringify(want)));
  return ok;
}

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + needle.length; }
  return n;
}
function anchorOnce(hay, needle, what) {
  const n = occurrences(hay, needle);
  if (n !== 1) {
    console.log('HARNESS BROKEN: ' + what + ' anchor matched ' + n + ' time(s), expected exactly 1');
    console.log('  anchor: ' + JSON.stringify(needle.slice(0, 90)));
    process.exit(1);
  }
}
function sliceBetween(hay, start, end, what) {
  anchorOnce(hay, start, what + ' start');
  anchorOnce(hay, end, what + ' end');
  const a = hay.indexOf(start);
  const b = hay.indexOf(end, a);
  if (b < a) { console.log('HARNESS BROKEN: ' + what + ' end precedes start'); process.exit(1); }
  return hay.slice(a, b + end.length);
}
// A named function declaration, sliced by its own indentation -- the same idiom
// test-je-offset-store.js uses on home.html.
function sliceFn(src, header, what) {
  anchorOnce(src, header, what);
  const lines = src.split('\n');
  const start = lines.findIndex(l => l.trim().startsWith(header));
  const indent = lines[start].match(/^\s*/)[0];
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === indent + '}') return lines.slice(start, i + 1).join('\n');
  }
  console.log('HARNESS BROKEN: could not find the end of ' + what);
  process.exit(1);
}

/* ------------------------------------------------------------------ slices */

const RRAI_SRC = sliceBetween(
  config,
  'window.RRAI = (function () {',
  '    norm: norm, get: get, set: setTier, label: function (t) { return LABELS[norm(t) || \'full\']; }\n  };\n})();',
  'RRAI');

const PF_START = "(function () {\n  'use strict';\n\n  // \u26D4 PLACEHOLDER \u2014 THE OWNER OWNS THIS WORDING";
const PF_END   = '    facts: facts, warm: warm, isWarm: isWarm, reset: reset\n  };\n})();';
const PF_SRC   = sliceBetween(config, PF_START, PF_END, 'priorFindings');

const TXFACTS_SRC = sliceFn(home,
  'function _analystTxFacts(stats, focusPeriod, ccy, co, scrub) {', '_analystTxFacts');

/* ------------------------------------------------------- run the real code */

// A cardStore stand-in. It is the ONLY thing stubbed on the store side: load()
// resolves the way the shipped store's own contract says it does (never rejects),
// and forCompany() answers synchronously off whatever the scenario planted.
function makeSandbox(records, opts) {
  opts = opts || {};
  const loads = [];
  const sandbox = {
    console: console,
    Promise: Promise,
    Date: Date,
    Math: Math,
    isNaN: isNaN,
    Number: Number,
    String: String,
    Object: Object,
    parseInt: parseInt,
    localStorage: { getItem: function () { return null; }, setItem: function () {} }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(RRAI_SRC, sandbox);            // the real tier normaliser ('docs' -> 'grounded')
  sandbox.RRDB = { name: function () { return opts.db || 'Demo2'; } };
  sandbox.RRV8 = {
    txv: { title: function (c) { return ({ 'MCM': 'Manufacturing Completion Mismatch',
                                           'GL-ONLY': 'Ledger Only' })[c] || ''; } },
    cardStore: {
      forCompany: function () { return records.slice(); },
      load: function (co) {
        loads.push(String(co));
        return opts.loadFails ? Promise.reject(new Error('boom')) : Promise.resolve({});
      }
    }
  };
  vm.runInContext(PF_SRC, sandbox);
  if (!sandbox.RRV8.priorFindings) {
    console.log('HARNESS BROKEN: the extracted source did not define RRV8.priorFindings');
    process.exit(1);
  }
  return { sandbox: sandbox, pf: sandbox.RRV8.priorFindings, loads: loads };
}

// A record shaped exactly like cardStore._norm produces.
function rec(o) {
  return Object.assign({
    company: '80003', cardCode: 'MCM', periodEnd: '2026-05-31', status: 'complete',
    note: 'R31802A ran before the completions posted; the WIP leg landed a period late.',
    sourceFix: '', varAmount: -1696.8, by: 'e.gutkowski', at: '2026-06-02T10:00:00.000Z'
  }, o);
}

const AS_OF = '2026-09-30';

/* ============================= A -- the retrieval rule, as a pure function */
function runA() {
  console.log('A -- select(): which prior findings are in scope at all\n');
  const { pf } = makeSandbox([]);

  // A1 -- the positive control. Every later "excluded" assertion is only
  // meaningful because this identical record IS selected.
  check('A1 a complete finding one period back is selected',
        pf.select([rec({ periodEnd: '2026-08-31' })], AS_OF).length, 1);

  // A2 -- a DRAFT must not propagate. Its author has not finished making it:
  // 'complete' is the same gate _auditFromCard() uses to build an Audit entry.
  check('A2 a worked DRAFT is excluded',
        pf.select([rec({ periodEnd: '2026-08-31', status: 'worked' })], AS_OF).length, 0);
  check('A2 control: the same record at status complete IS selected',
        pf.select([rec({ periodEnd: '2026-08-31', status: 'complete' })], AS_OF).length, 1);
  check('A2 a reopened card is excluded too',
        pf.select([rec({ periodEnd: '2026-08-31', status: 'reopened' })], AS_OF).length, 0);

  // A3 -- a complete card with no note carries no finding.
  check('A3 an empty note is excluded',
        pf.select([rec({ periodEnd: '2026-08-31', note: '   ' })], AS_OF).length, 0);

  // A4 -- the viewed period's own finding is already on the card in front of the
  // analyst. Feeding it back is not retrieval.
  check('A4 the as-of period itself is excluded',
        pf.select([rec({ periodEnd: AS_OF })], AS_OF).length, 0);
  check('A4 control: one month earlier is included',
        pf.select([rec({ periodEnd: '2026-08-31' })], AS_OF).length, 1);

  // A5 -- THE 12-MONTH LOOK-BACK, at its boundary rather than in the middle.
  check('A5 exactly 12 months back is inside the window',
        pf.select([rec({ periodEnd: '2025-09-30' })], AS_OF).length, 1);
  check('A5 thirteen months back is outside it',
        pf.select([rec({ periodEnd: '2025-08-31' })], AS_OF).length, 0);
  check('A5 the window is a constant, not a literal', pf.LOOKBACK_MONTHS, 12);

  // A6 -- SUPERSEDE. An edit replaces the prior version; the old one leaves the
  // retrieval set. Both versions are handed in as one array on purpose: the map
  // in cardStore makes this structural, and select() must not depend on that.
  const older  = rec({ periodEnd: '2026-08-31', note: 'FIRST DRAFT CONCLUSION', at: '2026-09-01T09:00:00.000Z' });
  const newer  = rec({ periodEnd: '2026-08-31', note: 'CORRECTED CONCLUSION',   at: '2026-09-05T09:00:00.000Z' });
  const sup    = pf.select([older, newer], AS_OF);
  check('A6 an edited finding leaves exactly one record', sup.length, 1);
  check('A6 the surviving record is the edit', sup[0].note, 'CORRECTED CONCLUSION');
  const supRev = pf.select([newer, older], AS_OF);   // input order must not decide it
  check('A6 input order does not change the winner', supRev.length === 1 && supRev[0].note,
        'CORRECTED CONCLUSION');
  // A different PERIOD is a different finding, not an edit.
  check('A6 two periods of the same pattern are two findings',
        pf.select([rec({ periodEnd: '2026-07-31' }), rec({ periodEnd: '2026-08-31' })], AS_OF).length, 2);

  // A7 -- newest first, so a truncated block keeps the most relevant half.
  const ord = pf.select([rec({ periodEnd: '2026-06-30' }), rec({ periodEnd: '2026-08-31' }),
                         rec({ periodEnd: '2026-07-31' })], AS_OF).map(r => r.periodEnd);
  check('A7 newest period first', ord, ['2026-08-31', '2026-07-31', '2026-06-30']);

  // A8 -- the by-pattern index the store does not have. This is the shape UI-203
  // named as missing; it is asserted by calling it, not by reading the source.
  const idxSand = makeSandbox([rec({ periodEnd: '2026-08-31', cardCode: 'MCM' }),
                               rec({ periodEnd: '2026-07-31', cardCode: 'GL-ONLY' }),
                               rec({ periodEnd: '2026-06-30', cardCode: 'MCM' })]);
  const idx = idxSand.pf.index('80003', AS_OF);
  check('A8 index() keys by pattern code', Object.keys(idx).sort(), ['GL-ONLY', 'MCM']);
  check('A8 index() groups every period of a pattern', idx['MCM'].length, 2);
  check('A8 forCode() answers the "last time this pattern appeared" question',
        idxSand.pf.forCode('80003', 'GL-ONLY', AS_OF).map(r => r.periodEnd), ['2026-07-31']);
}

/* ================================================ B -- the tier gate */
function runBC() {
  console.log('\nB -- facts(): Enhanced and Full only, and what each tier carries\n');
  const NOTE = 'R31802A ran before the completions posted; the WIP leg landed a period late.';
  const s = makeSandbox([rec({ periodEnd: '2026-08-31', note: NOTE })]);
  const pf = s.pf;

  // Warm the layer the way the page does, then assert every tier off ONE state.
  return pf.warm('80003').then(function () {
    check('B0 a resolved load marks the company read', pf.isWarm('80003'), true);
    check('B0 the load was issued exactly once', s.loads.length, 1);

    check('B1 Off emits nothing', pf.facts('80003', AS_OF, 'off'), []);
    check('B2 Basic (grounded) emits nothing', pf.facts('80003', AS_OF, 'grounded'), []);
    check("B2 the server's 'docs' vocabulary is Basic too, and emits nothing",
          pf.facts('80003', AS_OF, 'docs'), []);
    check('B2 allowedAt() agrees with facts() on every tier',
          ['off', 'grounded', 'docs', 'scrubbed', 'full'].map(t => pf.allowedAt(t)),
          [false, false, false, true, true]);

    const enh  = pf.facts('80003', AS_OF, 'scrubbed');
    const full = pf.facts('80003', AS_OF, 'full');

    check('B3 Enhanced emits a block', enh.length > 0, true);
    check('B3 Enhanced does NOT carry the note prose',
          enh.some(l => l.indexOf(NOTE) >= 0), false);
    check('B3 Enhanced does not leak the recorder\'s name',
          enh.some(l => l.indexOf('e.gutkowski') >= 0), false);
    check('B3 Enhanced still says a finding EXISTS',
          enh.some(l => /an analyst recorded a finding/.test(l)), true);

    check('B4 Full carries the note prose', full.some(l => l.indexOf(NOTE) >= 0), true);
    check('B4 Full names who recorded it', full.some(l => l.indexOf('e.gutkowski') >= 0), true);

    // B5 -- A ZERO THAT WAS NEVER MEASURED IS NOT A ZERO. cardStore.forCompany()
    // returns [] for a company it has never read, which is indistinguishable from
    // "no findings" unless the layer tracks the read.
    const cold = makeSandbox([rec({ periodEnd: '2026-08-31' })]);
    const coldOut = cold.pf.facts('80003', AS_OF, 'full');
    check('B5 an unread company says so rather than implying none exist',
          coldOut.some(l => /have NOT been read/.test(l)), true);
    check('B5 and it emits no finding line at all',
          coldOut.filter(l => l.indexOf(': "') >= 0).length, 0);
    check('B5 the unread notice is still tier-gated',
          cold.pf.facts('80003', AS_OF, 'grounded'), []);

    // B6 -- a read company with nothing in the window adds nothing to the prompt.
    const clean = makeSandbox([rec({ periodEnd: '2024-01-31' })]);   // outside the window
    return clean.pf.warm('80003').then(function () {
      check('B6 a read company with no in-window finding emits nothing',
            clean.pf.facts('80003', AS_OF, 'full'), []);
      return { enh, full, pf, NOTE };
    });
  }).then(function (carry) {

/* ========================== C -- the guard rail on every emitted line */
    console.log('\nC -- a retrieved finding is carried as ASSERTED, never as measured\n');
    const { full, pf, NOTE } = carry;
    const LBL = pf.PRIOR_FINDING_LABEL;

    check('C1 the label is one exported constant', typeof LBL === 'string' && LBL.length > 0, true);
    const header   = full[0];
    const guidance = full[1];
    const lines    = full.slice(2);
    check('C1 the block opens with a fenced header naming the label',
          header.indexOf('==') === 0 && header.indexOf(LBL) > 0, true);
    check('C2 the guidance line says a PERSON typed it',
          /\[GUIDANCE/.test(guidance) && /a PERSON typed/.test(guidance), true);
    check('C2 the guidance forbids restating it as a system finding',
          /restate it as something the system found/.test(guidance), true);
    // ⚠ CASE-INSENSITIVE ON PURPOSE, AND THIS ASSERTION CAUGHT THE CHANGE THAT
    // MADE IT SO. The label is sentence case as a block header and a line prefix,
    // and LOWERCASED in this one mid-sentence use ("attribute it as a recorded
    // finding") — owner ruling 2026-09-16, replacing the ALL-CAPS placeholder that
    // the model was being told to echo at a customer. What must hold is that the
    // guidance names the label; which case it wears mid-sentence is typography.
    // Still reads the label OFF THE MODULE rather than hardcoding a string, so the
    // next wording ruling lands by editing one constant.
    check('C2 the guidance names the label as the attribution to use',
          guidance.toLowerCase().indexOf(LBL.toLowerCase()) > 0, true);
    check('C2 the guidance says the measured figure wins on conflict',
          /the figure wins/.test(guidance), true);
    check('C3 every finding line is prefixed with the label',
          lines.every(l => l.indexOf(LBL) === 0), true);

    // C4 -- a note with newlines in it would otherwise put an UNLABELLED line into
    // a fact block, which is this whole module's failure mode arriving through
    // formatting rather than logic.
    const multi = makeSandbox([rec({ periodEnd: '2026-08-31',
      note: 'Line one of the finding.\nLine two names an account.\n\nLine three.' })]);
    return multi.pf.warm('80003').then(function () {
      const out = multi.pf.facts('80003', AS_OF, 'full');
      check('C4 a multi-line note becomes ONE line', out.length, 3);
      check('C4 and no emitted line is unlabelled',
            out.slice(2).every(l => l.indexOf(multi.pf.PRIOR_FINDING_LABEL) === 0), true);
      check('C4 no emitted line contains a newline',
            out.every(l => l.indexOf('\n') < 0), true);

      // C5 -- truncation is never silent: the count that gates what the model sees
      // is printed in the header it gates.
      const many = [];
      for (let i = 0; i < 12; i++) {
        many.push(rec({ periodEnd: '2026-0' + ((i % 9) + 1) + '-28', cardCode: 'C' + i,
                        at: '2026-09-0' + ((i % 9) + 1) + 'T09:00:00.000Z' }));
      }
      const big = makeSandbox(many);
      return big.pf.warm('80003').then(function () {
        const out2 = big.pf.facts('80003', AS_OF, 'full');
        check('C5 the block is capped', out2.length - 2, big.pf.MAX_LINES);
        check('C5 and the header states how many of how many',
              /showing the 8 most recent of 12/.test(out2[0]), true);
        return true;
      });
    });
  }).then(runWiring);
}

/* ================ D -- the wiring: the SHIPPED _analystTxFacts consumes it */
function runWiring() {
  console.log('\nD -- the shipped _analystTxFacts in home.html\n');

  // Stubs for everything _analystTxFacts reaches for, and nothing more.
  function txFacts(tier, opts) {
    opts = opts || {};
    const s = makeSandbox(opts.records || []);
    const sb = s.sandbox;
    sb._recsummaryLevel = function () { return tier; };
    sb.fmtPeriod = function (p) { return String(p); };
    sb._ccyAmt = function (c, v) { return '$' + Math.round(Number(v) || 0); };
    sb._dmaaiFactsFor = function () { return null; };
    sb._txVarWarm = function () { return true; };
    sb._txVarCache = { amt: [{ period: '2026-09-30', seg: { Sales: 5000 } }] };
    sb._TXV_MODS = ['Sales'];
    sb._txvRowSnap = opts.snap || null;
    vm.runInContext(TXFACTS_SRC + '\nglobalThis.__txFacts = _analystTxFacts;', sb);
    if (typeof sb.__txFacts !== 'function') {
      console.log('HARNESS BROKEN: extracted source did not define _analystTxFacts');
      process.exit(1);
    }
    const stats = opts.cold
      ? { warm: false }
      : { warm: true, n: 3, curPeriods: ['2026-08-31', '2026-09-30'],
          rankedAll: ['Sales'], byMod: { Sales: { current: 5000, recur: 2, curBy: [{ period: '2026-09-30', amt: 5000 }] } } };
    return s.pf.warm('80003').then(function () {
      return { lines: sb.__txFacts(stats, AS_OF, 'USD', '80003', tier === 'scrubbed'), pf: s.pf };
    });
  }

  const NOTE = 'R31802A ran before the completions posted; the WIP leg landed a period late.';
  const RECS = [rec({ periodEnd: '2026-08-31', note: NOTE })];

  return txFacts('full', { records: RECS }).then(function (r) {
    const LBL = r.pf.PRIOR_FINDING_LABEL;
    check('D1 at Full the shipped fact builder emits the prior-findings block',
          r.lines.some(l => l.indexOf(LBL) >= 0), true);
    check('D1 and the note text reaches the prompt',
          r.lines.some(l => l.indexOf(NOTE) >= 0), true);
    // D3 -- home.html's own "guidance last" invariant must survive the insertion.
    check('D3 the original guidance line is still LAST',
          /^\[GUIDANCE, not for quoting: never write "current period"/.test(r.lines[r.lines.length - 1]), true);
    // The block must sit AFTER the measured facts, never interleaved with them.
    const firstPf = r.lines.findIndex(l => l.indexOf(LBL) >= 0);
    const lastMeasured = r.lines.reduce((acc, l, i) => (l.indexOf('VIEWED PERIOD') === 0 ? i : acc), -1);
    check('D1 the block sits after the measured facts', firstPf > lastMeasured && lastMeasured >= 0, true);

    return txFacts('grounded', { records: RECS });
  }).then(function (r) {
    check('D2 at Basic no prior finding reaches the prompt',
          r.lines.some(l => l.indexOf(r.pf.PRIOR_FINDING_LABEL) >= 0), false);
    check('D2 and the note text is nowhere in it',
          r.lines.some(l => l.indexOf(NOTE) >= 0), false);
    return txFacts('off', { records: RECS });
  }).then(function (r) {
    check('D2 at Off no prior finding reaches the prompt',
          r.lines.some(l => l.indexOf(r.pf.PRIOR_FINDING_LABEL) >= 0), false);
    return txFacts('scrubbed', { records: RECS });
  }).then(function (r) {
    check('D4 at Enhanced the block rides but the prose does not',
          [r.lines.some(l => l.indexOf(r.pf.PRIOR_FINDING_LABEL) >= 0),
           r.lines.some(l => l.indexOf(NOTE) >= 0)], [true, false]);
    return txFacts('full', { records: RECS, cold: true });
  }).then(function (r) {
    check('D5 a COLD transaction-variance surface still emits its single fact only',
          r.lines.some(l => l.indexOf(r.pf.PRIOR_FINDING_LABEL) >= 0), false);
    runChipWiring();
  });
}

/* ========== E -- the VISIBLE sink: the recurrence chip (UI-203 option B) =====
 *
 * Owner ruling 2026-09-16. Before it, the retrieval layer handed the MODEL the
 * analyst's own prior note while the analyst got a chip saying only THAT they
 * had resolved the pattern once. The AI knowing more about your work than you do
 * is backwards, and it also left the retrieval with no on-screen evidence it had
 * fired -- "the AI mentioned no priors" and "there were none" looked identical.
 *
 * ⚠ WHAT THESE ASSERT AND WHAT THEY CANNOT. The chip is built inside
 * `card = function (p)`, nested in renderAnalystTxVar, which cannot be sliced and
 * executed the way _analystTxFacts can. So these are WIRING assertions on the
 * shipped source, with a mutation control -- deliberately narrow, and the render
 * itself is verified in a browser, not here. Saying so beats a test that asserts
 * on markup text and calls itself behavioural. */
function runChipWiring() {
  console.log('\nE -- the recurrence chip wiring in home.html\n');

  const CALL = 'RRV8.priorFindings.forCode(solo, p.code, focusP)';
  // ⚠ THIS WAS `check('E1 ...', true, true)` AND THAT IS NOT AN ASSERTION. It
  // printed "ok" whatever the file contained; `anchorOnce` below was doing all the
  // real work by hard-exiting. A line that reports a pass it never tested is worse
  // than no line, because it makes the suite look like it covers something.
  // Asserting the count itself, which is the fact the mutation control inverts.
  anchorOnce(home, CALL, 'E chip call site');
  check('E1 the card asks the retrieval layer for this pattern’s priors, exactly once',
        occurrences(home, CALL), 1);

  // ⛔ THE RULING THAT IS EASIEST TO BREAK LATER. The tier governs what leaves the
  // browser for the model; it has nothing to say about whether an analyst may read
  // their OWN recorded finding. If someone "tidies" this into consistency with the
  // prompt path by wrapping it in allowedAt()/textAllowedAt(), an Enhanced
  // customer's own note becomes unreadable to them.
  const chipRegion = sliceBetween(home, 'var recurChip = \'\';',
                                  'var recurRow = recurChip', 'E chip region');
  check('E2 the chip is NOT tier-gated',
        /allowedAt\s*\(|textAllowedAt\s*\(|_recsummaryLevel\s*\(/.test(chipRegion), false);

  // The two sources answer different questions and must not be collapsed:
  // _txvRecurPrior is unwindowed (a recurrence is a recurrence at any distance),
  // forCode carries the owner's 12-month window. Collapsing them would either stop
  // warning about an old recurrence or print a count that disagrees with the text
  // behind it.
  check('E3 the chip still uses the UNWINDOWED recurrence flag for "recurred"',
        /p\.recurPrior/.test(chipRegion), true);

  // The panel is addressed by pattern code, so two cards on one page cannot open
  // each other's findings.
  check('E4 the panel id is keyed on the pattern code',
        /id="txvPriors-' \+ esc\(p\.code\)/.test(home), true);

  // ⛔ E6 — THE YEAR. Found in a browser 2026-09-16, not by any gate: the chip read
  // "Recurred · was resolved Feb 28" while the card's period was Feb 28, **2026**.
  // _txvRecurPrior requires the prior to be strictly earlier, so it was a different
  // year, and _pwLabel omits precisely the year. The reader concludes it was
  // resolved in the period they are looking at — the opposite of "Recurred".
  // Asserting the chip uses the year-bearing formatter, and that the bare one is
  // not reachable from this region.
  check('E6 the chip names the prior period WITH its year',
        /_pwLabelFull\(p\.recurPrior\)/.test(chipRegion), true);
  check('E6 CONTROL: and the year-less formatter is gone from the chip',
        /_pwLabel\(p\.recurPrior\)/.test(chipRegion), false);

  // MUTATION CONTROL: delete the call. E1 must fail. Without this the anchor
  // assertion above is a grep that has only ever run against code that has it.
  const mutated = home.replace(CALL, '([])');
  if (mutated === home) {
    console.log('  FAIL  E mutation did not apply -- the control is vacuous'); failures++;
  } else {
    check('E5 CONTROL: with the call deleted, the chip has no source of priors',
          occurrences(mutated, CALL), 0);
    check('E5 CONTROL: and the rest of the chip survives, so E5 is not just "file changed"',
          /p\.recurPrior/.test(mutated) && /txvPriors-/.test(mutated), true);
  }
}

/* ================================================ mutation controls */
function mutationControls() {
  console.log('\nmutation controls -- a declared RED set and a declared GREEN set each\n');

  // ---- M1: widen the tier gate to admit Basic -----------------------------
  const M1_ANCHOR = "var ENHANCED_AND_UP = ['scrubbed', 'full'];";
  anchorOnce(PF_SRC, M1_ANCHOR, 'M1 mutation');
  const M1 = PF_SRC.replace(M1_ANCHOR, "var ENHANCED_AND_UP = ['grounded', 'scrubbed', 'full'];");
  if (M1 === PF_SRC) { console.log('  FAIL  M1 did not apply -- the control is vacuous'); failures++; return Promise.resolve(); }

  function mutantPf(src, records) {
    const sandbox = makeSandbox(records).sandbox;
    delete sandbox.RRV8.priorFindings;
    vm.runInContext(src, sandbox);
    return sandbox.RRV8.priorFindings;
  }

  const NOTE = 'R31802A ran before the completions posted; the WIP leg landed a period late.';
  const pf1 = mutantPf(M1, [rec({ periodEnd: '2026-08-31', note: NOTE })]);
  return pf1.warm('80003').then(function () {
    // DECLARED RED SET for M1.
    const redBasic = pf1.facts('80003', AS_OF, 'grounded').length !== 0;
    const redDocs  = pf1.facts('80003', AS_OF, 'docs').length !== 0;
    console.log('  M1 RED set -- these must now be wrong:');
    console.log('    ' + (redBasic ? 'ok  ' : 'FAIL') + '  B2 Basic no longer emits nothing');
    console.log('    ' + (redDocs  ? 'ok  ' : 'FAIL') + "  B2 'docs' no longer emits nothing");
    if (!redBasic || !redDocs) {
      failures++;
      console.log('    the control did not discriminate: B2 would have passed against a gate that leaks to Basic');
    }
    // DECLARED GREEN SET for M1 -- the mutation must not simply break everything.
    const greenFull   = pf1.facts('80003', AS_OF, 'full').some(l => l.indexOf(NOTE) >= 0);
    const greenWindow = pf1.select([rec({ periodEnd: '2025-08-31' })], AS_OF).length === 0;
    const greenOff    = pf1.facts('80003', AS_OF, 'off').length === 0;
    console.log('  M1 GREEN set -- these must be unaffected:');
    console.log('    ' + (greenFull   ? 'ok  ' : 'FAIL') + '  B4 Full still carries the prose');
    console.log('    ' + (greenWindow ? 'ok  ' : 'FAIL') + '  A5 the 12-month window is untouched');
    console.log('    ' + (greenOff    ? 'ok  ' : 'FAIL') + '  B1 Off still emits nothing');
    if (!greenFull || !greenWindow || !greenOff) { failures++; console.log('    M1 reddened more than the gate -- the control is too blunt to be evidence'); }

    // ---- M2: invert the supersede comparison so the OLDER version wins ------
    const M2_ANCHOR = "if (!prev || String(r.at || '') >= String(prev.at || '')) {";
    anchorOnce(PF_SRC, M2_ANCHOR, 'M2 mutation');
    const M2 = PF_SRC.replace(M2_ANCHOR, "if (!prev || String(r.at || '') < String(prev.at || '')) {");
    if (M2 === PF_SRC) { console.log('  FAIL  M2 did not apply -- the control is vacuous'); failures++; return; }

    const pf2 = mutantPf(M2, []);
    const older = rec({ periodEnd: '2026-08-31', note: 'FIRST DRAFT CONCLUSION', at: '2026-09-01T09:00:00.000Z' });
    const newer = rec({ periodEnd: '2026-08-31', note: 'CORRECTED CONCLUSION',   at: '2026-09-05T09:00:00.000Z' });
    const got = pf2.select([older, newer], AS_OF);
    const redSup  = !(got.length === 1 && got[0].note === 'CORRECTED CONCLUSION');
    const redSup2 = (function () {
      const g = pf2.select([newer, older], AS_OF);
      return !(g.length === 1 && g[0].note === 'CORRECTED CONCLUSION');
    })();
    console.log('  M2 RED set -- these must now be wrong:');
    console.log('    ' + (redSup  ? 'ok  ' : 'FAIL') + '  A6 the superseded draft survives the edit');
    console.log('    ' + (redSup2 ? 'ok  ' : 'FAIL') + '  A6 and in the reversed input order too');
    if (!redSup || !redSup2) {
      failures++;
      console.log('    the control did not discriminate: A6 would have passed while a stale finding rode forward');
    }
    const greenCount = pf2.select([older, newer], AS_OF).length === 1;
    const greenTier  = pf2.facts('80003', AS_OF, 'grounded').length === 0;
    const greenDraft = pf2.select([rec({ periodEnd: '2026-08-31', status: 'worked' })], AS_OF).length === 0;
    console.log('  M2 GREEN set -- these must be unaffected:');
    console.log('    ' + (greenCount ? 'ok  ' : 'FAIL') + '  A6 still collapses to exactly one record');
    console.log('    ' + (greenTier  ? 'ok  ' : 'FAIL') + '  B2 the tier gate is untouched');
    console.log('    ' + (greenDraft ? 'ok  ' : 'FAIL') + '  A2 drafts are still excluded');
    if (!greenCount || !greenTier || !greenDraft) { failures++; console.log('    M2 reddened more than the supersede rule'); }

    // ---- M3: remove the WIRING from the shipped home.html fact builder ------
    // M1 and M2 both mutate config.js. Neither would notice if the call site in
    // home.html were deleted, and a retrieval layer nothing calls is the exact
    // state UI-203 was opened about. This mutates the SHIPPED _analystTxFacts.
    const M3_ANCHOR = "      RRV8.priorFindings.facts(co, focusPeriod, _recsummaryLevel(), _codes ? { codes: _codes } : undefined)";
    anchorOnce(TXFACTS_SRC, M3_ANCHOR, 'M3 mutation');
    const M3 = TXFACTS_SRC.replace(M3_ANCHOR, '      [] ');
    if (M3 === TXFACTS_SRC) { console.log('  FAIL  M3 did not apply -- the control is vacuous'); failures++; return; }

    const s3 = makeSandbox([rec({ periodEnd: '2026-08-31', note: NOTE })]);
    const sb3 = s3.sandbox;
    sb3._recsummaryLevel = function () { return 'full'; };
    sb3.fmtPeriod = function (p) { return String(p); };
    sb3._ccyAmt = function (c, v) { return '$' + Math.round(Number(v) || 0); };
    sb3._dmaaiFactsFor = function () { return null; };
    sb3._txVarWarm = function () { return true; };
    sb3._txVarCache = { amt: [{ period: '2026-09-30', seg: { Sales: 5000 } }] };
    sb3._TXV_MODS = ['Sales'];
    sb3._txvRowSnap = null;
    vm.runInContext(M3 + '\nglobalThis.__txFacts = _analystTxFacts;', sb3);
    return s3.pf.warm('80003').then(function () {
      const lines = sb3.__txFacts(
        { warm: true, n: 3, curPeriods: ['2026-08-31', '2026-09-30'], rankedAll: ['Sales'],
          byMod: { Sales: { current: 5000, recur: 2, curBy: [{ period: '2026-09-30', amt: 5000 }] } } },
        AS_OF, 'USD', '80003', false);
      const redWire = !lines.some(l => l.indexOf(s3.pf.PRIOR_FINDING_LABEL) >= 0);
      const greenRest = /^\[GUIDANCE, not for quoting: never write "current period"/.test(lines[lines.length - 1])
                     && lines.some(l => l.indexOf('VIEWED PERIOD') === 0);
      console.log('  M3 RED set -- these must now be wrong:');
      console.log('    ' + (redWire ? 'ok  ' : 'FAIL') + '  D1 no prior finding reaches the prompt with the call site removed');
      if (!redWire) { failures++; console.log('    the control did not discriminate: D1 would pass on a layer nothing calls'); }
      console.log('  M3 GREEN set -- these must be unaffected:');
      console.log('    ' + (greenRest ? 'ok  ' : 'FAIL') + '  the measured facts and the guidance-last rule survive');
      if (!greenRest) { failures++; console.log('    M3 damaged the builder rather than only its new call site'); }
    });
  });
}

/* The driver. Sections run in order and the controls run LAST, so a control that
 * reddens the suite cannot be confused with a real failure earlier in it.
 *
 * ⚠ The .catch is not optional. An unhandled rejection is only a warning on some
 * Node versions, so without it a thrown ReferenceError would skip every remaining
 * assertion and the suite would still EXIT 0 -- a green exit from a suite that
 * never ran is the worst possible result, and it has happened in this repo before
 * (see the tail of test-ai-plan-tier.js). */
Promise.resolve()
  .then(runA)
  .then(runBC)
  .then(mutationControls)
  .then(function () {
    console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions passed'));
    process.exit(failures ? 1 : 0);
  })
  .catch(function (err) {
    console.log('\nSUITE ABORTED: ' + (err && err.stack || err));
    process.exit(1);
  });
