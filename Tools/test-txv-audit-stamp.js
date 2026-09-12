/* test-txv-audit-stamp.js -- behaviour test for the audit stamp on the analyst's
 * variance pattern cards.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-txv-audit-stamp.js
 *
 * WHY THIS EXISTS. Owner ruling 2026-09-12: a card handed off to the Audit Center
 * carries a stamp left of the variance, and re-opening the card removes it. The
 * point of the stamp is that the analyst no longer needs the Audit Center tab at
 * all -- so once that tab comes off their view, THIS MARK IS THE ONLY ON-SCREEN
 * EVIDENCE THE HAND-OFF HAPPENED. A sole signal with no second reader is exactly
 * the kind that rots silently, which is what this file is for.
 *
 * THE STATE IT RIDES ON, read out of home.html rather than assumed:
 *
 *   'complete'  written by "Mark reviewed", AFTER the rows are durable
 *               (rrFetch save-notes resolves first, then cardStore.save)
 *   'reopened'  written by "Reopen to edit"
 *
 * `done` is `rec.status === 'complete'`, so 'reopened' clears the stamp with no
 * extra code. That is the behaviour the owner asked for and it is asserted here
 * rather than reasoned about.
 *
 * THE TWO DEFECTS THIS PINS:
 *
 *   1. A DRAFTED FINDING TAKING THE STAMP. A draft is saved text on an OPEN card,
 *      not a hand-off. Stamping it would tell the analyst a card was handed off
 *      when it is still theirs -- and with the Audit Center tab gone there would be
 *      nowhere to discover otherwise.
 *   2. THE DATE FALLING BACK INTO THE TOOLTIP. The chip this replaces carried the
 *      date in its own text on purpose (2026-08-13): a card worked six weeks ago
 *      and one worked this morning otherwise mark identically. A tooltip is not a
 *      sink for a value that drives a decision.
 *
 * SOURCE IS NOT RETYPED. _txvStatusMark is sliced out of RRV8/home.html.
 *
 * THE CONTROL RUNS LAST and restores both defects. If it passes clean, this file
 * measures nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  ok    ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

function sliceBlock(src, startIdx) {
  let i = src.indexOf('{', startIdx);
  if (i < 0) throw new Error('no opening brace after index ' + startIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');
const mark = vm.runInNewContext(
  extractFn(html, '_txvStatusMark') + '\n_txvStatusMark',
  { console: console }, { filename: 'home.html:_txvStatusMark' });

// home.html's own escaper is irrelevant to the states under test; a real one is
// passed so the escaping path is the one that runs in the page.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The three card states, as cardStore produces them.
const COMPLETE = { done: true,  draft: false };
const REOPENED = { done: false, draft: false };   // status 'reopened' -> done is false
const DRAFTED  = { done: false, draft: true  };
const OPEN     = { done: false, draft: false };

console.log('-- a handed-off card is stamped --');
const stamped = mark(COMPLETE, 'Jul 12', esc);
ok(stamped.indexOf('txv-stamp') >= 0, 'complete renders the stamp');
ok(stamped.indexOf('In Audit Findings') >= 0, 'the stamp says what it means');

console.log('-- the date is IN the stamp, not only in the tooltip --');
// Strip the attributes, then look at what is left. This is the assertion that
// stops the date drifting back into a title= where nobody scanning a column sees it.
const visible = stamped.replace(/<[^>]*>/g, '');
ok(visible.indexOf('Jul 12') >= 0, 'the date is rendered text',
   'visible text was: ' + JSON.stringify(visible));
ok(stamped.indexOf('txv-stamp-l2') >= 0, 'the date has its own element');

console.log('-- reopening removes it --');
const reopened = mark(REOPENED, 'Jul 12', esc);
ok(reopened === '', 'reopened renders nothing at all',
   'got: ' + JSON.stringify(reopened));

console.log('-- a draft is not a hand-off --');
const drafted = mark(DRAFTED, '', esc);
ok(drafted.indexOf('txv-stamp') < 0, 'drafted does NOT take the stamp',
   'got: ' + JSON.stringify(drafted));
ok(drafted.indexOf('Finding drafted') >= 0, 'drafted keeps its own chip');

console.log('-- an untouched card is unmarked --');
ok(mark(OPEN, '', esc) === '', 'open renders nothing');

console.log('-- a stamp with no date still renders --');
// cardStore records predating the `at` field, and any record whose timestamp does
// not parse, arrive here with an empty date. The hand-off still has to show.
const undated = mark(COMPLETE, '', esc);
ok(undated.indexOf('txv-stamp') >= 0, 'undated complete is still stamped');
ok(undated.indexOf('txv-stamp-l2') < 0, 'and carries no empty date line');

console.log('-- the date is escaped --');
ok(mark(COMPLETE, '<script>x</script>', esc).indexOf('<script>') < 0,
   'a date is escaped before it reaches the markup');

console.log('-- precedence: done wins over a draft that was never cleared --');
// cardStore keeps `note` on a completed record, so a card can be both. The
// hand-off is the stronger statement and has to be the one shown.
const both = mark({ done: true, draft: true }, 'Jul 12', esc);
ok(both.indexOf('txv-stamp') >= 0 && both.indexOf('Finding drafted') < 0,
   'complete+draft shows the stamp only');

/* ---- the control -------------------------------------------------------- */
console.log('-- CONTROL: both defects restored, each must be caught --');

// Defect 1: stamp anything that has a finding, draft included.
function markStampsDrafts(p, doneAt, e) {
  if (p && (p.done || p.draft)) return '<span class="txv-stamp">In Audit Findings</span>';
  return '';
}
// Defect 2: the date retreats into the tooltip.
function markDateInTooltip(p, doneAt, e) {
  if (p && p.done) return '<span class="txv-stamp" title="Recorded ' + e(doneAt) + '">'
                        + '<span class="txv-stamp-l1">In Audit Findings</span></span>';
  return '';
}

let controlOk = true;
if (markStampsDrafts(DRAFTED, '', esc).indexOf('txv-stamp') < 0) {
  controlOk = false;
  console.log('  FAIL  control 1 did not stamp a draft, so the draft assertion above'
            + '\n          is not measuring anything.');
}
const ctl2 = markDateInTooltip(COMPLETE, 'Jul 12', esc);
if (ctl2.replace(/<[^>]*>/g, '').indexOf('Jul 12') >= 0) {
  controlOk = false;
  console.log('  FAIL  control 2 still rendered the date as text, so the date'
            + '\n          assertion above is not measuring anything.');
}
if (controlOk) {
  console.log('  ok    both defects reproduce');
  console.log('          1, draft  -> ' + JSON.stringify(markStampsDrafts(DRAFTED, '', esc)));
  console.log('          2, visible text -> ' + JSON.stringify(ctl2.replace(/<[^>]*>/g, '')));
} else {
  failures++;
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
