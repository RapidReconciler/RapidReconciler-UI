/* test-readiness-partial-restore.js -- behaviour test for renderReadiness()'s
 * all-six guard.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-readiness-partial-restore.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron host.)
 *
 * WHY THIS EXISTS
 * ---------------
 * The readiness card's markup was removed, and `renderReadiness()` was deliberately
 * left intact as a restorable no-op — the note above it in home.html says restoring
 * the card is "putting the markup back, not rebuilding the checks".
 *
 * ⛔ BUT THE RESTORE PATH WAS A TRAP. The whole function was guarded by
 * `var list = $('readyList'); if (!list) return;` and NOTHING ELSE. Everything from
 * `top.className` down — #readyTop, #readyBadge, #readyTitle, #readySub, #readyFoot —
 * was written with no null check. So whoever restored the list but not the headline
 * got a TypeError on the first of those writes rather than a card that degraded, and
 * the only reason it never bit anyone is that the card is currently retired WHOLE, so
 * the one guard caught every call.
 *
 * WHAT THIS ASSERTS
 * -----------------
 * renderReadiness is sliced out of the shipping page and RUN against a DOM stub in
 * three states:
 *   1. no ids at all      -> returns silently (today's normal state), no throw
 *   2. a PARTIAL restore  -> does not throw, and names the missing ids on the console
 *   3. all six present    -> paints, and the headline elements actually receive text
 *
 * ⚠ THE CONTROL IS THE OLD CODE. Assertion 2 is meaningless unless the pre-fix
 * version actually threw on the same input, so the test reconstructs the old guard
 * from the shipping source and asserts it DOES throw. If that control ever stops
 * throwing, this file is measuring nothing and says so.
 *
 * BLIND SPOT, named: this proves the JS degrades. It does not prove a restored card
 * LOOKS right — no CSS is loaded and no layout is computed.
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

/* ---- slice the shipping source ----------------------------------------- */
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
const html = fs.readFileSync(SRC, 'utf8');
const at = html.indexOf('\n  function renderReadiness(');
if (at < 0) throw new Error('renderReadiness not found in home.html');
const FN_SRC = sliceBlock(html, at + 1);

/* ---- the DOM stub ------------------------------------------------------- */
// Only the ids named in `present` exist; $() returns null for anything else, which
// is exactly what a partial restore looks like to this function.
function makeSandbox(present) {
  const nodes = {};
  present.forEach(function (id) {
    nodes[id] = { id: id, textContent: '', innerHTML: '', className: '',
                  dataset: {}, setAttribute: function () {} };
  });
  const warnings = [];
  const sandbox = {
    console: { warn: function (m) { warnings.push(String(m)); }, log: function () {} },
    document: {
      getElementById: function (id) { return nodes[id] || null; },
      querySelector: function () { return null; }   // '#view-ready .ready' — absent
    },
    $: function (id) { return nodes[id] || null; },
    caps: function () { return { inv: true }; },
    esc: function (s) { return String(s); },
    CK_OK: '<ok>', CK_BAD: '<bad>',
    _jobStatus: 'success', _connDown: false, _period: '2026-02'
  };
  sandbox.nodes = nodes;
  sandbox.warnings = warnings;
  vm.createContext(sandbox);
  return sandbox;
}
function run(src, present) {
  const s = makeSandbox(present);
  vm.runInContext(src + '\nrenderReadiness();', s, { filename: 'home.html' });
  return s;
}
const ALL = ['readyList', 'readyTop', 'readyBadge', 'readyTitle', 'readySub', 'readyFoot'];

/* ---- assertions --------------------------------------------------------- */
console.log('-- 1. no ids at all: the retired card, silent and safe --');
{
  let threw = null;
  let s = null;
  try { s = run(FN_SRC, []); } catch (e) { threw = e; }
  ok(!threw, 'does not throw when nothing is restored', threw && String(threw));
  ok(s && s.warnings.length === 0, 'and says nothing — a retired card is not a problem',
     s && JSON.stringify(s.warnings));
}

console.log('-- 2. PARTIAL restore: must not throw, must name what is missing --');
{
  let threw = null, s = null;
  try { s = run(FN_SRC, ['readyList']); } catch (e) { threw = e; }
  ok(!threw, 'does not throw with only #readyList restored', threw && String(threw));
  ok(s && s.warnings.length === 1, 'warns exactly once', s && JSON.stringify(s.warnings));
  const w = (s && s.warnings[0]) || '';
  ok(w.indexOf('readyTop') >= 0 && w.indexOf('readyBadge') >= 0 && w.indexOf('readyTitle') >= 0
     && w.indexOf('readySub') >= 0 && w.indexOf('readyFoot') >= 0,
     'and names every missing id, so the restorer knows what to add', w);
  ok(w.indexOf('readyList') < 0, 'without naming the one that IS present', w);
}

console.log('-- 3. full restore: it actually paints --');
{
  let threw = null, s = null;
  try { s = run(FN_SRC, ALL); } catch (e) { threw = e; }
  ok(!threw, 'does not throw with all six present', threw && String(threw));
  ok(s && s.warnings.length === 0, 'and warns about nothing');
  ok(s && s.nodes.readyTitle.textContent.length > 0, 'the headline receives text',
     s && JSON.stringify(s.nodes.readyTitle.textContent));
  ok(s && s.nodes.readyList.innerHTML.indexOf('ready-item') >= 0, 'and the list is rendered');
  ok(s && s.nodes.readyTop.className.indexOf('ready-top') >= 0, 'and the headline class is set');
}

/* ---- the control -------------------------------------------------------- */
// Reconstruct the PRE-FIX guard: one lookup on #readyList and no all-six check. If
// that does not throw on the partial input, assertion 2 above proves nothing.
console.log('-- CONTROL: the old single-guard version must THROW on a partial restore --');
{
  const marker = "var missing = Object.keys(need).filter(function (k) { return !need[k]; });";
  ok(FN_SRC.indexOf(marker) >= 0, 'the all-six guard is present in the shipping source',
     'if this fails the fix was reverted and the control below is comparing nothing');

  // Old shape: keep the body, restore the original single guard and the later
  // re-lookups that the fix hoisted.
  let old = FN_SRC.slice(FN_SRC.indexOf('{') + 1);
  old = old.slice(old.indexOf('var c = caps();'));
  old = old.replace('foot.textContent =', "$('readyFoot').textContent =");
  old = 'function renderReadinessOld() {\n' +
        "    var list = $('readyList'); if (!list) return;\n" +
        old.replace('var allGood = !_connDown && jobOk && c.inv;',
          "var top = $('readyTop'), badge = $('readyBadge'), title = $('readyTitle'), sub = $('readySub');\n" +
          '    var allGood = !_connDown && jobOk && c.inv;');

  let threw = null;
  try {
    const s = makeSandbox(['readyList']);
    vm.runInContext(old + '\nrenderReadinessOld();', s, { filename: 'control' });
  } catch (e) { threw = e; }
  ok(!!threw, 'CONTROL: the old version throws on the same partial input — the defect was real',
     threw ? ('threw: ' + String(threw).slice(0, 90)) : 'it did NOT throw, so assertion 2 measures nothing');
  ok(threw && /TypeError/.test(String(threw)), 'and it is a TypeError, the failure mode described',
     threw && String(threw).slice(0, 90));
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
