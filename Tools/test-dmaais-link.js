/* test-dmaais-link.js -- behaviour test for UI-219: the Analyst view reaches the DMAAIs page.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-dmaais-link.js
 *
 * WHY THIS EXISTS. accounting-dmaais.html (the model baseline, its approval status, the rule findings by
 * module) had no live inbound link: the sidebar that linked it is never mounted, and _txvDmaaiHref has no
 * caller. Owner ruling 2026-10-26: "Link it from the Analyst view". The link lives on the Data Health Model
 * DMAAI band, beside the band's own AI/View button.
 *
 * The shipped _analystModelBandHtml is EXTRACTED from home.html and run, so this exercises the real text.
 *
 *   C1  a band with routings carries the DMAAIs link, opening the Model tab for the band's company
 *   C2  the "couldn't read the model table" band carries it too: a failed read is when the analyst most
 *       needs another way in
 *   C3  the company is URL-encoded
 *   C4  no company: the link opens the page unscoped rather than with an empty company=
 *   C5  the band's own AI/View button is still there, beside it
 *   C6  the target is real: RRV8/accounting-dmaais.html exists, has a Model tab, and reads ?tab= and ?company=
 *
 * TWO MUTATION CONTROLS: the link dropped from each branch in turn. Each must redden exactly its own case.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// home.html is CRLF on disk; the mutants below are written with "\n", so normalise once.
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const target = fs.readFileSync(path.join(ROOT, 'RRV8', 'accounting-dmaais.html'), 'utf8');

const START = '  function _analystModelBandHtml(co, routes, excl, ccy) {';
const END = '\n  // The band is fed by TWO independent reads';
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

function band(source, co, routes) {
  const sandbox = {
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    activeDb: () => ({ n: 'RapidReconciler_Prod_V8' }),
    aiOrViewBtn: (href) => '<a class="alh-act ai" data-stub-view href="' + href + '">AI</a>',
    _ccyAmt: (ccy, v) => '$' + v,
    console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.__band = _analystModelBandHtml;', sandbox);
  return sandbox.__band(co, routes, { classes: 0, openClasses: 0 }, 'USD');
}
const ROUTES = [{ glclass: 'IN30', acct: '5000.140000', descr: 'Inventory', doctype: 'IA' }];
const link = (h) => { const m = /<a [^>]*data-alh-dmaais[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(h); return m ? { href: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() } : null; };

function suite(source, label) {
  failures = 0; reds = [];
  console.log(label);
  const ok = band(source, '90001', ROUTES);
  check('C1 band with routings -> DMAAIs link', link(ok), { href: 'accounting-dmaais.html?tab=model&company=90001', text: 'DMAAIs &rarr;' });
  check('C2 could-not-read band -> DMAAIs link', link(band(source, '90001', null)), { href: 'accounting-dmaais.html?tab=model&company=90001', text: 'DMAAIs &rarr;' });
  check('C3 company is URL-encoded', (link(band(source, '90001 & co', ROUTES)) || {}).href, 'accounting-dmaais.html?tab=model&company=90001%20%26%20co');
  check('C4 no company -> unscoped, no empty company=', (link(band(source, '', ROUTES)) || {}).href, 'accounting-dmaais.html?tab=model');
  check('C5 the band keeps its own AI/View button', /data-stub-view href="accounting-model-review\.html\?company=90001/.test(ok), true);
  return failures;
}

let total = suite(SOURCE, '\nshipped source');
console.log('\nC6 the target page');
check('C6 RRV8/accounting-dmaais.html has a Model tab', /data-tab="model"/.test(target), true);
check('C6 it reads ?tab=', /searchParams\.get\('tab'\)/.test(target), true);
check('C6 it reads ?company=', /searchParams\.get\('company'\)/.test(target), true);
total += failures;

// Mutation controls. Each drops the link from one branch; exactly that branch's case must go red.
const MUTANTS = [
  ['link dropped from the band with routings', '      + open\n      + dmaais\n', '      + open\n', ['C1', 'C3', 'C4']],
  ['link dropped from the could-not-read band', '+ open + dmaais + \'</div>\';', '+ open + \'</div>\';', ['C2']]
];
let controls = 0;
for (const [name, from, to, expectRed] of MUTANTS) {
  if (occurrences(SOURCE, from) !== 1) { console.log('HARNESS BROKEN: mutant text not found once: ' + name); process.exit(1); }
  const n = suite(SOURCE.replace(from, to), '\nmutation control: ' + name);
  const got = [...new Set(reds)].sort();
  const pass = n > 0 && JSON.stringify(got) === JSON.stringify(expectRed.slice().sort());
  console.log('  ' + (pass ? 'ok  ' : 'FAIL') + '  control reddened ' + JSON.stringify(got) + ', expected ' + JSON.stringify(expectRed));
  if (!pass) controls++;
}
console.log('\nRESULT: ' + (total === 0 && controls === 0 ? 'all assertions and both mutation controls pass'
  : total + ' assertion failure(s), ' + controls + ' control failure(s)'));
process.exit(total === 0 && controls === 0 ? 0 : 1);
