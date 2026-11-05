/* test-ask-box-clears.js -- behaviour test for DAC-94's third item: the AI question box clears once asked.
 *
 *   node Tools/test-ask-box-clears.js
 *
 * WHY THIS EXISTS. Owner 2026-11-05: "the AI assistant question never clears." Measured: none of the three
 * typed-question paths emptied #acctAskInput -- In Transit's itAsk, and Home's askAnalyst and askAcct (Home has
 * the same box; #1061 shared the AI gate, not the box). The answer band already echoes the question
 * (#acctAnsQ), so the typed text sat in the box twice and the next question had to be deleted by hand first.
 *
 * This slices the SHIPPED functions out of home.html and transit.html and runs them with the DOM and the AI
 * stubbed. Each function is allowed to throw once it is past the point under test (the stubs end there).
 *
 *   A1  a typed question empties the box on all three paths, after it is echoed in #acctAnsQ
 *   A2  Home's accountant path empties it when the AI is off too (the question is echoed with the reason)
 *   A3  a re-ask with the question passed in (an AI level change) leaves whatever is in the box alone
 *   A4  an empty box asks nothing and changes nothing
 *
 * MUTATION ARMS (each must redden at least one assertion):
 *   - Home's _askTaken does nothing
 *   - Home's _askTaken clears even a passed-in question
 *   - In Transit's clear removed
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');
const TRANSIT = fs.readFileSync(path.join(ROOT, 'RRV8/transit.html'), 'utf8').replace(/\r\n/g, '\n');

function sliceBlock(src, startIdx) {
  let depth = 0;
  for (let i = src.indexOf('{', startIdx); i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(html, name, file) {
  const at = html.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in ' + file);
  return sliceBlock(html, at + 1);
}

function el(v) { return { value: v || '', textContent: '', hidden: true, disabled: false, style: { height: '40px' }, parentNode: {}, placeholder: '' }; }
function dom() {
  const d = { acctAskInput: el(), acctAskAnswer: el(), acctAnsBand: el(), acctAnsQ: el(), acctAskBtn: el() };
  return d;
}

// ---- Home ----
function homeRun(src, fnName, presetQ, typed, opts) {
  const d = dom(); d.acctAskInput.value = typed;
  const ctx = {
    $: (id) => d[id] || null,
    _acctAsking: false,
    _acctData: { companies: [{ co: '90002', ccy: 'USD' }], currencies: ['USD'] },
    _briefData: () => null,
    _ensureAnalystSolo: () => '90002',
    _recsummaryLevel: () => (opts && opts.off ? 'off' : 'full'),
    aiOffWhy: () => ({ why: 'AI is off.' }),
    _aiRenderDocStrip: () => {},
    RRAI: { masks: () => ({}) },
    _acctLastAsk: null,
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(src, '_askTaken', 'home.html') + '\n' + extractFn(src, fnName, 'home.html') + '\nthis.__fn = ' + fnName + ';', ctx);
  try { ctx.__fn(presetQ); } catch (e) { /* past the point under test: the stubs end here */ }
  return d;
}

// ---- In Transit ----
function transitRun(src, presetQ, typed) {
  const d = dom(); d.acctAskInput.value = typed;
  const ctx = {
    $: (id) => d[id] || null,
    trim: (s) => String(s == null ? '' : s).trim(),
    viewRole: () => 'analyst',
    ROLE_ASST: { analyst: true, accountant: true },
    aiLevel: () => 'full',
    showQuestion: (q) => { d.acctAnsBand.hidden = false; d.acctAnsQ.textContent = q; d.acctAnsQ.hidden = false; },
    _gate: null,                       // GATE_MISSING path: returns right after the point under test
    GATE_MISSING: 'gate missing',
    _asking: false,
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn(src, 'itAsk', 'transit.html') + '\nthis.__fn = itAsk;', ctx);
  try { ctx.__fn(presetQ); } catch (e) { /* past the point under test */ }
  return d;
}

function check(homeSrc, transitSrc) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const Q = 'Why is 90002 out of balance?';

  // A1
  for (const fn of ['askAnalyst', 'askAcct']) {
    const d = homeRun(homeSrc, fn, undefined, Q);
    ok(d.acctAnsQ.textContent === Q, 'A1 Home ' + fn + ': the question is not echoed in #acctAnsQ (control)');
    ok(d.acctAskInput.value === '', 'A1 Home ' + fn + ': the box still holds "' + d.acctAskInput.value + '" after asking');
  }
  let t = transitRun(transitSrc, undefined, Q);
  ok(t.acctAnsQ.textContent === Q, 'A1 In Transit itAsk: the question is not echoed (control)');
  ok(t.acctAskInput.value === '', 'A1 In Transit itAsk: the box still holds "' + t.acctAskInput.value + '" after asking');

  // A2
  const off = homeRun(homeSrc, 'askAcct', undefined, Q, { off: true });
  ok(off.acctAnsQ.textContent === Q && off.acctAskAnswer.textContent === 'AI is off.', 'A2 Home askAcct (AI off): question or reason not shown (control)');
  ok(off.acctAskInput.value === '', 'A2 Home askAcct (AI off): the box still holds the question');

  // A3: a re-ask passes the question in; the user's half-typed next question must survive.
  const DRAFT = 'and what about 90008';
  for (const fn of ['askAnalyst', 'askAcct']) {
    const d = homeRun(homeSrc, fn, Q, DRAFT);
    ok(d.acctAnsQ.textContent === Q, 'A3 Home ' + fn + ': the passed-in question is not echoed (control)');
    ok(d.acctAskInput.value === DRAFT, 'A3 Home ' + fn + ': a re-ask wiped the draft in the box');
  }
  t = transitRun(transitSrc, Q, DRAFT);
  ok(t.acctAskInput.value === DRAFT, 'A3 In Transit itAsk: a re-ask wiped the draft in the box');

  // A4
  for (const fn of ['askAnalyst', 'askAcct']) {
    const d = homeRun(homeSrc, fn, undefined, '   ');
    ok(d.acctAnsQ.hidden && d.acctAskInput.value === '   ', 'A4 Home ' + fn + ': an empty box asked something or was changed');
  }
  t = transitRun(transitSrc, undefined, '   ');
  ok(t.acctAnsQ.hidden && t.acctAskInput.value === '   ', 'A4 In Transit itAsk: an empty box asked something or was changed');
  return fails;
}

let failed = false;
const real = check(HOME, TRANSIT);
if (real.length) { failed = true; console.log('FAIL on the shipped pages:\n  ' + real.join('\n  ')); }
else console.log('  ok   A1-A4 on the shipped home.html and transit.html');

const ARMS = [
  ['Home _askTaken does nothing', () => [HOME.replace("input.value = ''; input.style.height = 'auto';\n  }", '}'), TRANSIT]],
  ['Home _askTaken clears a passed-in question', () => [HOME.replace('if (presetQ != null || !input) return;', 'if (!input) return;'), TRANSIT]],
  ['In Transit clear removed', () => [HOME, TRANSIT.replace("if (presetQ == null) { input.value = ''; input.style.height = 'auto'; }", '')]],
];
for (const [name, make] of ARMS) {
  const [h, tr] = make();
  if (h === HOME && tr === TRANSIT) { failed = true; console.log('FAIL arm "' + name + '": the mutation did not apply, so it proves nothing'); continue; }
  const r = check(h, tr);
  if (r.length) console.log('  ok   arm "' + name + '" turns ' + r.length + ' assertion(s) red');
  else { failed = true; console.log('FAIL arm "' + name + '" leaves every assertion green'); }
}
console.log(failed ? '\nFAIL' : '\nPASS');
process.exit(failed ? 1 : 0);
