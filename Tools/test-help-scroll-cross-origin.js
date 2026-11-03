/* test-help-scroll-cross-origin.js -- behaviour test for UI-211: the help panel still follows the page when
 * its doc comes from another origin.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-help-scroll-cross-origin.js
 *
 * WHY THIS EXISTS. Owner ruling 2026-11-03: a released V8 links the knowledge base on its published site, so
 * the "?" panel frames a doc from another origin. While the panel is open, clicking a control that carries
 * data-help-topic scrolls the doc to that section (admin-users.html, 7 controls). It did that through
 * frame.contentDocument, which is null across origins, and it returned silently. On the :8765 dev server the
 * doc shares V8's origin, so nothing there could have shown it.
 *
 * This runs the SHIPPED help-sidebar.js init() against a stand-in DOM, opens the panel with the "?", and clicks
 * a [data-help-topic] control.
 *
 *   T1  across origins (contentDocument null) the frame moves to #<topic>, keeping ?embed=1 and the doc
 *   T2  across origins where reading contentDocument throws, the same
 *   T3  same origin: the doc's heading is scrolled smoothly and the frame URL is left alone (the dev behaviour)
 *   T4  with the panel closed, a topic click does nothing
 *
 * TWO MUTATION CONTROLS: the pre-UI-211 scrollHelpTo (must redden T1 and T2), and the fragment path taken even
 * when the doc is readable (must redden T3).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'Tools/help-sidebar.js'), 'utf8').replace(/\r\n/g, '\n');
const DOC = 'https://docs.example/kb/RRUniversity/administrator-managing-users.html#team-members';

class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.hidden = false;
    this.listeners = {};
    this._q = {};
    const cls = new Set();
    this.classList = {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); },
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c) { c.parentNode = this; this.children.push(c); return c; }
  // The drawer asks for its own parts by class; hand back the same element every time.
  querySelector(sel) { return this._q[sel] || (this._q[sel] = new El(sel === '.help-drawer-frame' ? 'iframe' : 'div')); }
  querySelectorAll() { return []; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  closest() { return null; }
}

// frameDoc: what reading frame.contentDocument gives -- null (another origin), a doc, or 'throw'.
function run(sidebarSrc, frameDoc, openFirst) {
  const docListeners = {};
  const created = [];
  const doc = {
    readyState: 'complete',
    body: new El('body', { 'data-help-src': DOC, 'data-help-title': 'Team Management' }),
    documentElement: new El('html'),
    createElement: (t) => { const e = new El(t); created.push(e); return e; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  vm.runInNewContext(sidebarSrc, { window: { addEventListener() {} }, document: doc, console: { warn() {}, log() {} },
                                   encodeURIComponent });
  const drawer = created.find((e) => e.tagName === 'ASIDE');
  const btn = created.find((e) => e.className === 'topbar-help');
  if (!drawer || !btn) { console.log('HARNESS BROKEN: help-sidebar.js built no drawer or no "?"'); process.exit(1); }
  const frame = drawer.querySelector('.help-drawer-frame');
  Object.defineProperty(frame, 'contentDocument', {
    get() { if (frameDoc === 'throw') throw new Error('SecurityError: cross-origin'); return frameDoc; },
  });
  if (openFirst) btn.listeners.click.forEach((fn) => fn());
  const opened = frame.getAttribute('src');
  const control = { getAttribute: (k) => (k === 'data-help-topic' ? 'section-6' : null) };
  (docListeners.click || []).forEach((fn) => fn({ target: { closest: (s) => (s === '[data-help-topic]' ? control : null) } }));
  return { opened, now: frame.getAttribute('src') };
}

function sameOriginDoc() {
  const heading = { scrolled: null, scrollIntoView(o) { this.scrolled = o; } };
  return { heading, doc: { getElementById: (id) => (id === 'section-6' ? heading : null) } };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

function runCases(sidebarSrc) {
  reds = [];
  const want = 'https://docs.example/kb/RRUniversity/administrator-managing-users.html?embed=1#section-6';
  const t1 = run(sidebarSrc, null, true);
  check('T1 another origin: the frame moves to #section-6, keeping ?embed=1', [t1.opened !== null, t1.now], [true, want]);
  const t2 = run(sidebarSrc, 'throw', true);
  check('T2 another origin, contentDocument throws: the same', t2.now, want);
  const so = sameOriginDoc();
  const t3 = run(sidebarSrc, so.doc, true);
  check('T3 same origin: the heading scrolls smoothly and the frame URL is unchanged',
    [so.heading.scrolled && so.heading.scrolled.behavior, t3.now === t3.opened], ['smooth', true]);
  const t4 = run(sidebarSrc, null, false);
  check('T4 panel closed: a topic click does nothing', t4.now, null);
  return reds.slice();
}

console.log('Help panel scroll across origins (UI-211)');
runCases(SIDEBAR);
const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, sidebarSrc) {
  if (sidebarSrc === SIDEBAR) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = runCases(sidebarSrc);
  failures = saved;
  const ok = got.join(',') === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
}
if (shippedFailures === 0) {
  const fallback = SIDEBAR.slice(SIDEBAR.indexOf('      // UI-211: a released V8'), SIDEBAR.indexOf('      if (src !== want) frame.setAttribute(\'src\', want);\n') + 58);
  arm('the pre-UI-211 scrollHelpTo (returns when the doc is unreadable)', 'T1,T2', SIDEBAR.replace(fallback, ''));
  arm('the fragment path taken even when the doc is readable', 'T3',
    SIDEBAR.replace('      if (doc) {\n', '      if (doc && false) {\n'));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
