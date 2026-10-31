/* test-help-trigger-asof.js -- behaviour test for UI-248: Full Perpetual Details has a help "?", and keeps it.
 *
 *   node Tools/test-help-trigger-asof.js
 *
 * WHY THIS EXISTS. The owner looked at inventory-asof.html on 2026-10-30 and said "there is no help icon on this
 * page". The page loaded no help-sidebar.js at all. Loading it is not enough, though: Transactions loaded it and
 * still lost its "?" to a band repaint (UI-250). So this checks where the "?" ends up and that the page's own
 * repaint leaves it there.
 *
 * The "?" mounts in the scope band through [data-help-host] on #fp-scope. renderAsOfHero() repaints only
 * #fp-scope-items inside it, at boot and again whenever the AI band syncs after a load.
 *
 * This runs the SHIPPED help-sidebar.js init() against a stand-in DOM built from the page's own band markup, then
 * runs the page's own renderAsOfHero(), cut out of inventory-asof.html, against that same DOM.
 *
 *   T1  the "?" is mounted in the scope band at load (not floating at the bottom right)
 *   T2  the band's repaint does not remove it
 *   T3  ...nor does a second repaint
 *   T4  the repaint still writes the band's fields
 *   T5  clicking the "?" opens the panel on the As-Of section of the inventory guide
 *   T6  with no company resolved, the band's two label writers agree on "Not resolved" (the live probe for this
 *       row found updateCompanyPill() overwriting it with "All companies"; its own arm reddens T6)
 *
 * TWO MUTATION CONTROLS: renderAsOfHero writing #fp-scope itself (the UI-250 shape; must redden T2, T3 and T5,
 * since the deleted "?" can no longer be clicked), and
 * the band without [data-help-host] (the "?" falls back to floating; must redden T1, T2 and T3).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const SIDEBAR = read('Tools/help-sidebar.js');
const PAGE = read('RRV8/inventory-asof.html');
const DOC_SRC = '../RRUniversity/inventory-reconciliation.html?embed=1#reference';

if (SIDEBAR.indexOf("document.querySelector('[data-help-host]')") < 0) {
  console.log('HARNESS BROKEN: help-sidebar.js no longer looks for [data-help-host]'); process.exit(1);
}

class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.listeners = {};
    this._html = null;
    this._q = {};
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
  // The panel's inner parts, one per selector, so the test can read the frame the click pointed.
  querySelector(sel) { if (!this._q[sel]) { const p = new El('div'); this._q[sel] = p.appendChild(new El('div')); } return this._q[sel]; }
  querySelectorAll() { return []; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  click() { (this.listeners.click || []).forEach((f) => f({ target: this })); }
  closest() { return null; }
}
const attrsOf = (tagText) => {
  const a = {};
  for (const m of tagText.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] === undefined ? '' : m[2];
  return a;
};
const walk = (e, f) => { f(e); e.children.forEach((c) => walk(c, f)); };

// The band as the page writes it: the #fp-scope section and its #fp-scope-items child.
function bandFrom(html) {
  const sec = html.match(/<section\b[^>]*\bid="fp-scope"[^>]*>/);
  const items = html.match(/<div\b[^>]*\bid="fp-scope-items"[^>]*>/);
  if (!sec || !items) { console.log('HARNESS BROKEN: #fp-scope / #fp-scope-items not in the page'); process.exit(1); }
  const band = new El('section', attrsOf(sec[0]));
  band.appendChild(new El('div', attrsOf(items[0])));
  return band;
}

// renderAsOfHero() exactly as shipped, cut out of the page by brace matching.
function painterFrom(html) {
  const at = html.indexOf('function renderAsOfHero() {');
  if (at < 0) { console.log('HARNESS BROKEN: renderAsOfHero() not found in the page'); process.exit(1); }
  let depth = 0, i = html.indexOf('{', at);
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}

function run(sidebarSrc, pageHtml) {
  const band = bandFrom(pageHtml);
  const bodyTag = pageHtml.match(/<body\b[^>]*>/)[0];
  const body = new El('body', attrsOf(bodyTag));
  body.appendChild(band);
  const html = new El('html');
  const byId = (id) => { let f = null; walk(body, (e) => { if (!f && e.getAttribute('id') === id) f = e; }); return f; };
  const bySel = (sel) => {
    let f = null;
    if (sel === '[data-help-host]') walk(body, (e) => { if (!f && e.hasAttribute('data-help-host')) f = e; });
    return f;   // the page has no .topbar-home, .app-header or tx/cxv scope band
  };
  const doc = {
    readyState: 'complete', body, documentElement: html,
    createElement: (t) => new El(t),
    getElementById: byId,
    querySelector: bySel,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const win = { RRV8: {}, addEventListener() {},
    RR_SESSION: { dbs: [{ n: 'RapidReconciler_Demo1' }], activeDbIndex: 0 } };
  vm.runInNewContext(sidebarSrc, { window: win, document: doc, console: { warn() {}, log() {} } });
  const helpIn = () => { let n = 0; walk(band, (e) => { if (e.className === 'topbar-help') n++; }); return n; };
  const mounted = helpIn();

  const ctx = {
    window: win, document: doc, _data: { _meta: { period: '2025-08' } },
    _curCtx: { code: 'USD', mixed: false, codes: ['USD'] },
    readCurrentPeriodFromCache: () => '', _ensureSolo: () => '80002', _soloCandidates: () => ['80002'],
    escapeHtml: (s) => String(s), formatPeriod: (p) => 'Aug 2025 (' + p + ')', wireCompanyPicker() {},
  };
  vm.runInNewContext(painterFrom(pageHtml) + '\nrenderAsOfHero();', ctx);
  const afterOne = helpIn();
  vm.runInNewContext('renderAsOfHero();', ctx);
  const afterTwo = helpIn();
  let painted = '';
  walk(band, (e) => { if (e._html) painted += e._html; });

  // Click whichever "?" exists, wherever it landed.
  let btn = null;
  walk(body, (e) => { if (!btn && e.className === 'topbar-help') btn = e; });
  let opened = null;
  if (btn) {
    btn.click();
    const drawer = body.children.find((c) => c.classList.contains('help-drawer'));
    opened = { panel: html.classList.contains('help-open'),
               src: drawer ? drawer.querySelector('.help-drawer-frame').getAttribute('src') : null };
  }
  return { mounted, afterOne, afterTwo, painted, opened };
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
  check('T4 the repaint still writes the band fields', /Database/.test(r.painted) && /Co 80002/.test(r.painted), true);
  check('T5 the ? opens the panel on the As-Of guide', r.opened, { panel: true, src: DOC_SRC });
  return reds.slice();
}

console.log('Full Perpetual Details help trigger (UI-248)');
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
  arm('renderAsOfHero writes #fp-scope itself (the UI-250 shape)', 'T2,T3,T5',
    PAGE.replace("const el = document.getElementById('fp-scope-items');", "const el = document.getElementById('fp-scope');"));
  arm('the band has no [data-help-host]', 'T1,T2,T3',
    PAGE.replace('aria-label="Report parameters" data-help-host>', 'aria-label="Report parameters">'));
}

// T6, found by the live probe for this row: with no company resolved, updateCompanyPill() overwrote the band's
// "Not resolved" with "All companies", a scope this page never shows. Both writers must say the same thing.
console.log('\nunresolved company label');
function fnFrom(html, name) {
  const at = html.indexOf('function ' + name + '() {');
  if (at < 0) { console.log('HARNESS BROKEN: ' + name + '() not found in the page'); process.exit(1); }
  let depth = 0, i = html.indexOf('{', at);
  for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break; }
  return html.slice(at, i + 1);
}
function unresolvedLabels(pageHtml) {
  const items = { innerHTML: '' };
  const label = { textContent: '' };
  const ctx = {
    window: { RR_SESSION: { dbs: [] } }, _data: null, _soloCompany: '',
    _curCtx: { code: 'USD', mixed: false, codes: ['USD'] },
    readCurrentPeriodFromCache: () => '', _ensureSolo: () => '', _soloCandidates: () => [],
    escapeHtml: (s) => String(s), formatPeriod: (p) => p, wireCompanyPicker() {},
    document: { getElementById: (id) => (id === 'fp-scope-items' ? items : id === 'company-picker-label' ? label : null) },
  };
  vm.runInNewContext(fnFrom(pageHtml, 'renderAsOfHero') + '\n' + fnFrom(pageHtml, 'updateCompanyPill')
    + '\nrenderAsOfHero(); updateCompanyPill();', ctx);
  const hero = (items.innerHTML.match(/id="company-picker-label">([^<]*)</) || [])[1];
  return { hero, pill: label.textContent };
}
const lab = unresolvedLabels(PAGE);
check('T6 the hero and the pill both say "Not resolved"', lab, { hero: 'Not resolved', pill: 'Not resolved' });
const t6Shipped = failures - shippedFailures;
if (t6Shipped === 0) {
  const old = PAGE.replace("('Co ' + _soloCompany) : 'Not resolved';", "('Co ' + _soloCompany) : 'All companies';");
  if (old === PAGE) { console.log('HARNESS BROKEN: T6 arm changed nothing'); process.exit(1); }
  const got = unresolvedLabels(old);
  const red = got.pill !== 'Not resolved';
  if (!red) armFailures++;
  console.log('  ' + (red ? 'ok  ' : 'FAIL') + '  arm (the shipped "All companies") reddens T6: pill read ' + JSON.stringify(got.pill));
}

const total = failures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
