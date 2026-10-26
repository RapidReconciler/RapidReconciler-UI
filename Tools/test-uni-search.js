/*
 * UI-229 (owner, 2026-10-24: "How can a user access documentation if AI plan is off?"). The RR University pill on
 * V8 Home opens a search of the University, scoped to the modules the user can access, with no AI.
 *
 * Runs the SHIPPED popover code (sliced out of RRV8/home.html between its two anchors) against a small fake DOM, with
 * Tools/home-search.js's HomeSearch.university replaced by a recorder, and no AI global of any kind defined. Plain
 * node, like every Tools/test-*.js (CI installs nothing).
 *
 *   node Tools/test-uni-search.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const START = '    // UI-229. RR University search';
const END = '\n    var whatifShowAll';
const i = html.indexOf(START), j = html.indexOf(END, i);
if (i < 0 || html.indexOf(START, i + 1) >= 0 || j < 0) { console.log('HARNESS BROKEN: the popover block anchors were not found exactly once'); process.exit(1); }
const SRC = html.slice(i, j);
for (const id of ['haHelp', 'haUniMenu', 'haUniQ', 'haUniResults', 'haUniAll', 'haUniScope', 'haUniForm']) {
  if (html.indexOf('id="' + id + '"') < 0) { console.log('HARNESS BROKEN: the page has no #' + id); process.exit(1); }
}

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
const ev = (target) => ({ stopPropagation() {}, preventDefault() {}, key: '', target: target || { closest: () => null } });
const tick = () => new Promise((r) => setImmediate(r));

// hs: (query, opts) => Promise | undefined to leave HomeSearch undefined. mods: what rrUserModules returns.
function page(hs, mods) {
  const els = {}, docHandlers = {}, opened = [], calls = [];
  let focused = null;
  const el = (id) => els[id] || (els[id] = {
    id, hidden: id === 'haUniMenu', innerHTML: '', textContent: '', value: '', href: '', attrs: {}, on: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    focus() { focused = id; }, addEventListener(t, fn) { this.on[t] = fn; }
  });
  const timers = [];
  const sb = {
    $: el,
    document: { addEventListener(t, fn) { docHandlers[t] = fn; } },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
    encodeURIComponent
  };
  sb.window = sb;
  sb.rrUserModules = () => mods;
  sb.open = (url, target, feat) => opened.push([url, target, feat]);
  if (hs) sb.HomeSearch = { university: (q, o) => { calls.push([q, o]); return hs(q, o); } };
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return {
    els: el, calls, opened, focused: () => focused,
    click: (id) => el(id).on.click(ev()),
    type: async (q) => { el('haUniQ').value = q; el('haUniQ').on.input(ev()); const t = timers.splice(0); t.forEach((f) => f()); await tick(); await tick(); },
    doc: (t, e) => docHandlers[t](e || ev())
  };
}
const HIT = (s, p) => ({ href: '../RRUniversity/inventory-cardex-variance.html#steps', sectionTitle: s, pageTitle: p });

(async function main() {
  console.log('V8 Home: RR University search (UI-229)');

  // P1 open: focus, scope line from the user's modules.
  let p = page(() => Promise.resolve([]), ['inventory', 'ap']);
  check('P1 the pill starts closed', p.els('haUniMenu').hidden, true);
  p.click('haHelp');
  check('P1 clicking it opens the search', [p.els('haUniMenu').hidden, p.els('haHelp').attrs['aria-expanded']], [false, 'true']);
  check('P1 and puts the cursor in the box', p.focused(), 'haUniQ');
  check('P1 it says which guides it searches', p.els('haUniScope').textContent, 'Guides for Inventory, A/P, plus the general guides.');

  // P2 a search: scoped, limited, rendered as new-tab links, escaped.
  p = page((q) => Promise.resolve([HIT('1.3 Determine the type of <variance>', 'Cardex Variance')]), ['inventory', 'ap']);
  p.click('haHelp');
  await p.type('cardex variance');
  check('P2 the search is scoped to the user\'s modules, 8 results at most', p.calls[0], ['cardex variance', { modules: ['inventory', 'ap'], limit: 8 }]);
  const res = p.els('haUniResults').innerHTML;
  check('P2 each result is a new-tab link to the section', /<a class="ha-uni-hit" href="\.\.\/RRUniversity\/inventory-cardex-variance\.html#steps" target="_blank" rel="noopener">/.test(res), true);
  check('P2 titles are escaped', res.indexOf('&lt;variance&gt;') >= 0 && res.indexOf('<variance>') < 0, true);
  check('P2 "see every result" opens the University with the query', p.els('haUniAll').href, '../RRUniversity/rapidreconciler-university.html?q=cardex%20variance');

  // P3 nothing found; P4 a failed load says why; P5 no search script at all.
  p = page(() => Promise.resolve([]), ['inventory']);
  p.click('haHelp'); await p.type('zzz');
  check('P3 no match says so', /No guide section matches &ldquo;zzz&rdquo;/.test(p.els('haUniResults').innerHTML), true);
  p = page(() => Promise.reject(new Error('index HTTP 404')), ['inventory']);
  p.click('haHelp'); await p.type('cardex');
  check('P4 a failed load names the reason and points at the full University',
        /is-err">The search could not load \(index HTTP 404\)\. Open RR University below/.test(p.els('haUniResults').innerHTML), true);
  p = page(undefined, ['inventory']);
  p.click('haHelp'); await p.type('cardex');
  check('P5 no search script loaded: said, not silent', /is-err">The search did not load/.test(p.els('haUniResults').innerHTML), true);

  // P6 a slow first answer does not overwrite a newer one.
  let release;
  p = page((q) => q === 'slow' ? new Promise((r) => { release = () => r([HIT('Slow', 'Old')]); }) : Promise.resolve([HIT('Fast', 'New')]), ['inventory']);
  p.click('haHelp'); await p.type('slow'); await p.type('fast');
  release(); await tick(); await tick();
  check('P6 the newer search wins over a slower older one', /Fast/.test(p.els('haUniResults').innerHTML) && !/Slow/.test(p.els('haUniResults').innerHTML), true);

  // P7 Enter opens the full University in a new tab; Escape and an outside click close.
  p = page(() => Promise.resolve([]), ['inventory']);
  p.click('haHelp'); p.els('haUniQ').value = 'period close';
  p.els('haUniForm').on.submit(ev());
  check('P7 Enter opens the full University with the query, in a new tab', p.opened, [['../RRUniversity/rapidreconciler-university.html?q=period%20close', '_blank', 'noopener']]);
  check('P7 and closes the search', p.els('haUniMenu').hidden, true);
  p.click('haHelp');
  p.doc('keydown', Object.assign(ev(), { key: 'Escape' }));
  check('P7 Escape closes it and returns to the pill', [p.els('haUniMenu').hidden, p.focused()], [true, 'haHelp']);
  p.click('haHelp'); p.doc('click');
  check('P7 a click elsewhere closes it', p.els('haUniMenu').hidden, true);

  // P8 nothing known about the user's modules: search everything rather than nothing.
  p = page(() => Promise.resolve([]), []);
  p.click('haHelp'); await p.type('login');
  check('P8 no modules known: every guide is searched', [p.calls[0][1].modules, p.els('haUniScope').textContent], [null, 'All guides.']);

  console.log(failures ? 'RESULT: ' + failures + ' failed' : 'RESULT: all assertions pass');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL  harness threw: ' + (e && e.stack || e)); process.exit(1); });
