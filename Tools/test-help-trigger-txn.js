/* test-help-trigger-txn.js -- behaviour test for UI-250: the Transactions page keeps its help "?" after its data lands.
 *
 *   node Tools/test-help-trigger-txn.js
 *
 * WHY THIS EXISTS. help-sidebar.js mounts the "?" once, at load, inside .tx-scope-band. paintScopeBand() then
 * rebuilt that band with `band.innerHTML = html` on every repaint, and the first repaint (the cost-method or
 * posting-policy preload, or renderAll once the rows land) deleted the "?". So the page showed it for a moment
 * and then never again. The owner found it in the 2026-10-30 UI-218 look ("There is no help icon here either").
 * Measured the same day in headless Chrome against the real page with its service calls stubbed: help=1 before
 * the band painted, help=0 after; with the fix, help=1 after, and a click opens the panel.
 *
 * This runs the SHIPPED help-sidebar.js init() against a stand-in DOM built from the page's own band markup, then
 * runs the page's own paintScopeBand(), cut out of inventory-transactions.html, against that same DOM.
 *
 *   T1  the "?" is mounted in the scope band at load
 *   T2  the band's own repaint does not remove it
 *   T3  ...nor does a second repaint (both preloads repaint, in either order)
 *   T4  the repaint still writes the band's fields (the fix did not stop the band painting)
 *
 * TWO MUTATION CONTROLS: paintScopeBand writing #tx-scope-band again (the shipped defect; must redden T2 and T3),
 * and the items wrapper removed from the markup (paintScopeBand finds nothing to write; must redden T4).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const SIDEBAR = read('Tools/help-sidebar.js');
const PAGE = read('RRV8/inventory-transactions.html');

if (SIDEBAR.indexOf("'.tx-scope-band, .cxv-scope-band'") < 0) {
  console.log('HARNESS BROKEN: help-sidebar.js no longer anchors on .tx-scope-band'); process.exit(1);
}

class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this._html = null;
    this._cls = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
    const cls = this._cls;
    this.classList = {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); },
    };
  }
  set className(v) { this._cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this._cls.add(c)); }
  get className() { return [...this._cls].join(' '); }
  // What innerHTML does to the tree: every existing child is gone. The markup itself is kept as text.
  set innerHTML(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._html = String(v); }
  get innerHTML() { return this._html || ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, c); return c; }
  // The panel's inner parts (close button and the like): parented, so the "Terms" toggle can sit beside one.
  querySelector() { const p = new El('div'); return p.appendChild(new El('div')); }
  querySelectorAll() { return []; }
  addEventListener() {}
  closest() { return null; }
}
const attrsOf = (tagText) => {
  const a = {};
  for (const m of tagText.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] === undefined ? '' : m[2];
  return a;
};
const walk = (e, f) => { f(e); e.children.forEach((c) => walk(c, f)); };

// The band as the page writes it: its <div> tree, from the opening tag to the matching close.
function bandFrom(html) {
  const start = html.search(/<div\b[^>]*\bclass="tx-scope-band"/);
  if (start < 0) { console.log('HARNESS BROKEN: no .tx-scope-band in the page'); process.exit(1); }
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = start;
  let root = null, cur = null, m;
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') { cur = cur.parentNode; if (!cur) break; continue; }
    const e = new El('div', attrsOf(m[0]));
    if (cur) cur.appendChild(e); else root = e;
    cur = e;
  }
  return root;
}

// paintScopeBand() exactly as shipped, cut out of the page by brace matching.
function painterFrom(html) {
  const at = html.indexOf('function paintScopeBand() {');
  if (at < 0) { console.log('HARNESS BROKEN: paintScopeBand() not found in the page'); process.exit(1); }
  let depth = 0, i = html.indexOf('{', at);
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}

function run(sidebarSrc, pageHtml) {
  const band = bandFrom(pageHtml);
  const bodyTag = pageHtml.match(/<body\b[^>]*>/)[0];
  const body = new El('body', attrsOf(bodyTag));
  body.appendChild(band);
  const byId = (id) => { let f = null; walk(body, (e) => { if (!f && e.getAttribute('id') === id) f = e; }); return f; };
  const doc = {
    readyState: 'complete', body, documentElement: new El('html'),
    createElement: (t) => new El(t),
    getElementById: byId,
    querySelector: (sel) => (sel === '.tx-scope-band, .cxv-scope-band' ? band : null),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const win = { RRV8: { GLOSSARY: 'TERM: a test term [ON=txn]' }, addEventListener() {},
    RR_SESSION: { dbs: [{ n: 'RapidReconciler_Demo1' }], activeDbIndex: 0 } };
  vm.runInNewContext(sidebarSrc, { window: win, document: doc, console: { warn() {}, log() {} } });
  const helpIn = () => { let n = 0; walk(band, (e) => { if (e.className === 'topbar-help') n++; }); return n; };
  const mounted = helpIn();

  const ctx = {
    window: win, document: doc, _data: null, _state: { period: '', activeCompany: '80002' },
    escapeHtml: (s) => String(s), filteredRows: () => [], _paintPolicyField() {}, _paintCostField() {}, renderSubtotals() {},
    _TXV_CARD_TITLE: {}, patTitle: (s) => s,
  };
  vm.runInNewContext(painterFrom(pageHtml) + '\npaintScopeBand();', ctx);
  const afterOne = helpIn();
  vm.runInNewContext('paintScopeBand();', ctx);
  const afterTwo = helpIn();
  let painted = '';
  walk(band, (e) => { if (e._html) painted += e._html; });
  return { mounted, afterOne, afterTwo, painted };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
function runCases(sidebarSrc, pageHtml) {
  reds = [];
  const r = run(sidebarSrc, pageHtml);
  check('T1 the ? is mounted in the scope band at load', r.mounted, 1);
  check('T2 the band repaint keeps the ?', r.afterOne, 1);
  check('T3 a second repaint keeps the ?', r.afterTwo, 1);
  check('T4 the repaint still writes the band fields', /Total variance/.test(r.painted) && /Co 80002/.test(r.painted), true);
  return reds.slice();
}

console.log('Transactions help trigger (UI-250)');
runCases(SIDEBAR, PAGE);
const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, pageHtml) {
  if (pageHtml === PAGE) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = runCases(SIDEBAR, pageHtml);
  failures = saved;
  const ok = got.join(',') === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
}
if (shippedFailures === 0) {
  arm('paintScopeBand writes #tx-scope-band again (the shipped defect)', 'T2,T3',
    PAGE.replace("var band = document.getElementById('tx-scope-items');", "var band = document.getElementById('tx-scope-band');"));
  arm('the items wrapper is gone from the markup', 'T4',
    PAGE.replace('<div class="tx-scope-items" id="tx-scope-items">', '<div class="tx-scope-gone">'));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
