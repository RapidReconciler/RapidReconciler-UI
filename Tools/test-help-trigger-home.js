/* test-help-trigger-home.js -- behaviour test for UI-238's follow-up: Home's help "?" can be seen.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-help-trigger-home.js
 *
 * WHY THIS EXISTS. help-sidebar.js mounted the "?" inside .app-header, and Home has hidden .app-header since #299.
 * So the circle existed on Home for every role and nobody could see it; UI-238's Mark Complete help sat in a panel
 * that could not be opened, and walkthrough step 5 pointed at "the ? at the top right". The owner found it in the
 * 2026-10-28 walkthrough ("I do not see a ? at the top right of any tab", then "The admin and analyst homes have no
 * ? either"). test-mark-complete-help.js ran the panel's content and never asked where its trigger landed.
 *
 * This runs the SHIPPED help-sidebar.js init() against a small stand-in DOM whose elements are the ones home.html
 * declares, and whose hidden set is what home.html's own stylesheet hides (`<selector> { display: none; }`).
 * Measured the same day in jsdom with home.html's real markup and CSS: on main the "?" lands in header.app-header,
 * hidden; with the fix it lands in div#homeActions, visible, and a click opens the panel.
 *
 *   T1  on Home the "?" lands in an element home.html does not hide
 *   T2  ...and that element is Home's bottom controls bar, #homeActions
 *   T3  a page with no [data-help-host] still gets it in .app-header, as before (the other pages are unchanged)
 *   T4  walkthrough step 5 names the bottom corner the "?" renders in, derived from home.html's stylesheet. It used
 *       to assert the words "bottom right", which passed while the "?" sat bottom LEFT (owner, 2026-10-29).
 *
 * THREE MUTATION CONTROLS: data-help-host removed from home.html (must redden T1 and T2), help-sidebar.js
 * ignoring [data-help-host] (must redden T1 and T2), and the controls row packed to the right (must redden T4).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const SIDEBAR = read('Tools/help-sidebar.js');
const HOME = read('RRV8/home.html');

// The selectors help-sidebar.js asks for when it places the "?".
const ANCHORS = ['[data-help-host]', '.topbar-home', '.app-header', '.tx-scope-band, .cxv-scope-band'];
for (const a of ANCHORS.slice(1, 3)) {
  if (SIDEBAR.indexOf("'" + a + "'") < 0) { console.log('HARNESS BROKEN: help-sidebar.js no longer asks for ' + a); process.exit(1); }
}

class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.hidden = false;
    this._cls = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
    const cls = this._cls;
    this.classList = {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on === undefined ? !cls.has(c) : on) cls.add(c); else cls.delete(c); },
    };
  }
  set className(v) { this._cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this._cls.add(c)); }
  get className() { return [...this._cls].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c, ref) { c.parentNode = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? 0 : i, 0, c); return c; }
  querySelector() { return new El('div'); }
  querySelectorAll() { return []; }
  addEventListener() {}
  closest() { return null; }
}

// What a page declares: for each anchor selector, the first opening tag that carries it, and whether the page's
// own <style> hides that selector outright.
function pageModel(html) {
  const style = (html.match(/<style\b[\s\S]*?<\/style>/gi) || []).join('\n');
  const els = {};
  const hides = (sel) => new RegExp('(^|[\\n}])\\s*' + sel.replace(/[.#[\]-]/g, '\\$&') + '\\s*\\{\\s*display:\\s*none', 'm').test(style);
  const attrsOf = (tagText) => {
    const a = {};
    for (const m of tagText.matchAll(/\s([a-z-]+)(?:="([^"]*)")?/g)) a[m[1]] = m[2] === undefined ? '' : m[2];
    return a;
  };
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const hostTag = body.match(/<([a-z]+)\b[^>]*\sdata-help-host(?=[\s>=])[^>]*>/);
  if (hostTag) {
    const a = attrsOf(hostTag[0]);
    const e = new El(hostTag[1], a);
    e._hidden = (a.id && hides('#' + a.id)) || [...e._cls].some((c) => hides('.' + c));
    els['[data-help-host]'] = e;
  }
  for (const [sel, cls] of [['.topbar-home', 'topbar-home'], ['.app-header', 'app-header']]) {
    const m = body.match(new RegExp('<([a-z]+)\\b[^>]*\\sclass="[^"]*\\b' + cls + '\\b[^"]*"[^>]*>'));
    if (m) { const e = new El(m[1], attrsOf(m[0])); e._hidden = hides(sel); els[sel] = e; }
  }
  return els;
}

function mount(sidebarSrc, html) {
  const els = pageModel(html);
  const doc = {
    readyState: 'complete',
    body: new El('body', { 'data-help-glossary': 'home' }),
    documentElement: new El('html'),
    createElement: (t) => new El(t),
    querySelector: (sel) => els[sel] || null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  Object.values(els).forEach((e) => doc.body.appendChild(e));   // the page's elements sit in its body
  const win = { RRV8: { GLOSSARY: 'TERM: a test term [ON=home]' }, addEventListener() {} };
  vm.runInNewContext(sidebarSrc, { window: win, document: doc, console: { warn() {}, log() {} } });
  const btn = [...Object.values(els), doc.body].flatMap((e) => e.children).find((c) => c.className === 'topbar-help')
    || (function find(e) { for (const c of e.children) { if (c.className === 'topbar-help') return c; const f = find(c); if (f) return f; } return null; })(doc.body);
  return { btn, parent: btn ? btn.parentNode : null };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

// Which bottom corner the "?" sits in, read from home.html's stylesheet: the .home-actions row's main-axis packing,
// and whether the "?" is ordered after its siblings. A row packed to the end, or a "?" with the highest order, puts
// it on the right; otherwise it is the first item of a left-packed row.
function helpSide(html) {
  const style = (html.match(/<style\b[\s\S]*?<\/style>/gi) || []).join('\n');
  const rule = (sel) => { const m = style.match(new RegExp('(^|[\\n}])\\s*' + sel.replace(/[.#-]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm')); return m ? m[2] : ''; };
  const row = rule('.home-actions');
  if (!/display:\s*flex/.test(row)) { console.log('HARNESS BROKEN: .home-actions is no longer a flex row'); process.exit(1); }
  const justify = (row.match(/justify-content:\s*([a-z-]+)/) || [, 'flex-start'])[1];
  const helpOrder = Number((rule('.home-actions .topbar-help').match(/order:\s*(-?\d+)/) || [, '0'])[1]);
  const orders = [...style.matchAll(/\.home-actions [^{]*\{[^}]*order:\s*(-?\d+)/g)].map((m) => Number(m[1]));
  const lastByOrder = orders.length > 0 && helpOrder > Math.max(...orders.filter((o) => o !== helpOrder), -Infinity);
  return (/^(flex-end|end|right)$/.test(justify) || lastByOrder) ? 'right' : 'left';
}

function runCases(sidebarSrc, homeHtml) {
  reds = [];
  const home = mount(sidebarSrc, homeHtml);
  check('T1 Home: the ? lands in an element home.html does not hide', !!home.parent && home.parent._hidden === false, true);
  check('T2 Home: that element is the bottom controls bar #homeActions', home.parent ? home.parent.getAttribute('id') : null, 'homeActions');
  const other = mount(sidebarSrc, '<style>.app-header { display: flex; }</style><header class="app-header"></header>');
  check('T3 a page with no data-help-host keeps the ? in .app-header', other.parent ? other.parent.className : null, 'app-header');
  // T4 used to assert the literal words "bottom right". That checked the author's guess, not the page: the bar is a
  // full-width row packed from the left and the "?" carries no `order`, so it renders bottom LEFT (owner's
  // screenshots, 2026-10-29). Now the side is derived from home.html's own stylesheet and step 5 must name it.
  const step5 = (homeHtml.match(/\{ tab: 'rec', title: 'Mark it complete'[\s\S]*?\] \},/) || [''])[0];
  const side = helpSide(homeHtml);
  check('T4 walkthrough step 5 names the side the ? renders on (' + side + ')',
    new RegExp('the <b>\\?</b> at the bottom ' + side).test(step5) && !/top (right|left)/.test(step5), true);
  return reds.slice();
}

console.log('Home help trigger (UI-238 follow-up)');
runCases(SIDEBAR, HOME);
const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, sidebarSrc, homeHtml) {
  if (sidebarSrc === SIDEBAR && homeHtml === HOME) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = runCases(sidebarSrc, homeHtml);
  failures = saved;
  const ok = got.join(',') === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
}
if (shippedFailures === 0) {
  arm('data-help-host removed from home.html', 'T1,T2', SIDEBAR, HOME.replace(' data-help-host>', '>'));
  arm('help-sidebar.js ignores data-help-host', 'T1,T2', SIDEBAR.replace("document.querySelector('[data-help-host]')", 'null'), HOME);
  arm('the controls row is packed to the right', 'T4', SIDEBAR, HOME.replace('.home-actions { position: fixed;', '.home-actions { justify-content: flex-end; position: fixed;'));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
