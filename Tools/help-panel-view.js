/* help-panel-view.js -- what the V8 help panel actually shows for a page's data-help-src (UI-259).
 *
 *   const { panelView } = require('./help-panel-view');
 *   panelView('RRV8/admin-data-refresh.html')
 *     -> { page, src, frameSrc, file, view, text, error }
 *
 * WHY THIS EXISTS. UI-248's test passed while the panel showed V7's As-Of screen, because it compared the
 * panel's src to a constant. The src is not what the reader sees. Most RR University docs are single-page
 * apps: a hash like #data shows the element id="topic-data" and hides every other .view, and with no hash
 * only the home view shows. So "what the panel shows" is decided by each doc's own router, and a test that
 * reads the whole file, or looks for id="data", is reading something nobody sees. (UI-259's first anchor
 * check did exactly that and reported all seven admin anchors missing; the router maps #x to topic-x.)
 *
 * So this resolves the frame src with the SHIPPED help-sidebar.js transform, then runs the doc's OWN inline
 * scripts in a vm against a small DOM built from the doc's markup, fires DOMContentLoaded and load, and reads
 * which .view is active. The text returned is that view's text, or the whole body when the doc has no views.
 * A doc whose scripts throw in this DOM is reported as an error, never treated as "showed the home view".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// The frame src exactly as help-sidebar.js builds it: its own embed-URL function, cut out by brace matching.
function embedFn() {
  const src = read('Tools/help-sidebar.js');
  const m = src.match(/function (embedSrc)\(src\) \{/);
  if (!m) throw new Error('HARNESS BROKEN: embedSrc(src) is not in help-sidebar.js');
  const at = src.indexOf(m[0]);
  let depth = 0, i = src.indexOf('{', at);
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  const ctx = {};
  vm.runInNewContext(src.slice(at, i + 1) + '\nthis.fn = ' + m[1] + ';', ctx);
  return ctx.fn;
}

const attrOf = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? m[1] : null; };

// The element that opens at `at` (a '<tag' index) through its matching close tag, same tag name, nesting counted.
function elementSlice(html, at) {
  const tag = html.slice(at + 1).match(/^[a-zA-Z0-9]+/)[0].toLowerCase();
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
  re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[1]) { if (--depth === 0) return html.slice(at, m.index + m[0].length); }
    else if (!/\/>$/.test(m[0])) depth++;
  }
  return html.slice(at);
}

const textOf = (html) => html
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&hellip;/g, '…').replace(/&rsquo;|&lsquo;/g, '’').replace(/&ldquo;|&rdquo;|&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&nbsp;|&middot;|&rarr;|&rsaquo;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// A forgiving stand-in element: anything the doc's scripts reach for exists and does nothing.
function stubEl(id, cls, extra) {
  const set = new Set(String(cls || '').split(/\s+/).filter(Boolean));
  const el = {
    id, tagName: 'DIV', dataset: {}, style: {}, textContent: '', innerHTML: '', value: '', hidden: false,
    children: [], childNodes: [], parentNode: null, offsetTop: 0,
    classList: {
      add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)),
      contains: (c) => set.has(c), toggle: (c, on) => { if (on === undefined ? !set.has(c) : on) set.add(c); else set.delete(c); return set.has(c); },
    },
    get className() { return [...set].join(' '); }, set className(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => set.add(c)); },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    hasAttribute: () => false, appendChild: (c) => c, removeChild: (c) => c, insertBefore: (c) => c, remove() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, scrollIntoView() {}, scrollTo() {},
    focus() {}, blur() {}, click() {}, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0 }),
  };
  return Object.assign(el, extra || {});
}

// `opts.pageHtml` stands in for the page's markup (a test's mutation arm points a page at another target);
// `opts.docHtml(html)` rewrites the target doc before routing (an arm puts an old sentence back).
function panelView(page, opts) {
  const pageHtml = (opts && opts.pageHtml) || read(page);
  // Both triggers help-sidebar.js wires: the standard "?" from <body data-help-src>, and the legacy
  // .help-pill[data-help-src] button (accounting-dmaais.html still uses one).
  const body = pageHtml.match(/<body\b[^>]*>/);
  const pill = pageHtml.match(/<button\b[^>]*\bclass="help-pill"[^>]*>/);
  const src = (body && attrOf(body[0], 'data-help-src')) || (pill && attrOf(pill[0], 'data-help-src'));
  if (!src) return { page, error: 'no data-help-src on <body> or a .help-pill' };
  const frameSrc = embedFn()(src);
  const rel = frameSrc.replace(/[?#].*$/, '');
  const file = path.posix.normalize(path.posix.join(path.posix.dirname(page), rel));
  if (!fs.existsSync(path.join(ROOT, file))) return { page, src, frameSrc, file, error: 'target file does not exist' };
  const hashAt = frameSrc.indexOf('#');
  const hash = hashAt >= 0 ? frameSrc.slice(hashAt) : '';
  const search = (frameSrc.match(/\?[^#]*/) || [''])[0];
  const doc = (opts && opts.docHtml !== undefined) ? opts.docHtml(read(file)) : read(file);

  // Every element carrying class "view" (the SPA pages), and every id (for plain #anchor docs).
  const views = [];
  // Tag names carry digits (h2, h3): `<[a-z]+\b` cannot match them, which is how the first run of this
  // reported #section-6 missing from a doc that has <h2 id="section-6">.
  for (const m of doc.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bclass="([^"]*\bview\b[^"]*)"[^>]*>/gi)) {
    const id = attrOf(m[0], 'id');
    if (id) views.push(stubEl(id, m[2], { _at: m.index }));
  }
  const byId = {};
  views.forEach((v) => { byId[v.id] = v; });
  for (const m of doc.matchAll(/<[a-z][a-z0-9]*\b[^>]*\sid="([^"]+)"[^>]*>/gi)) if (!byId[m[1]]) byId[m[1]] = stubEl(m[1], '', { _at: m.index });
  // closest('.view') as the browser answers it: the element itself if it is a view, else the innermost view whose
  // markup encloses it. A stub that answered null here passed three sub-anchors (#sh-*) that a doc router resolves
  // through el.closest('.view') while they actually landed on the home view.
  views.forEach((v) => { v._end = v._at + elementSlice(doc, v._at).length; });
  const enclosingView = (el) => views.filter((v) => v._at <= el._at && el._at < v._end)
    .sort((a, b) => (a._end - a._at) - (b._end - b._at))[0] || null;
  Object.values(byId).forEach((el) => { el.closest = (sel) => (sel === '.view' ? enclosingView(el) : null); });

  const winListeners = {}, docListeners = {};
  const loc = { hash, search, protocol: 'http:', pathname: '/' + file, href: 'http://x/' + file + search + hash };
  const document = {
    title: '', readyState: 'loading', documentElement: stubEl('html', ''), body: stubEl('body', ''), head: stubEl('head', ''),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => (sel === '.view.active' ? views.find((v) => v.classList.contains('active')) || null : null),
    querySelectorAll: (sel) => (sel === '.view' ? views.slice() : []),
    getElementsByClassName: (c) => (c === 'view' ? views.slice() : []),
    createElement: (t) => stubEl('', ''), createTextNode: () => stubEl('', ''),
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); }, removeEventListener() {},
  };
  const window = {
    location: loc, document, history: { replaceState() {}, pushState() {} }, scrollTo() {}, scrollY: 0, innerWidth: 410,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); }, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: (f) => f(), setTimeout: (f) => { try { f(); } catch (_) {} return 0; }, clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }), IntersectionObserver: function () { return { observe() {}, disconnect() {} }; },
    URLSearchParams, console: { log() {}, warn() {}, error() {} },
  };
  window.window = window; window.self = window; window.top = window; window.parent = window;
  const ctx = Object.assign({}, window, { window, document, history: window.history, location: loc });

  // Only the doc's own inline scripts: an external src (doc-chrome.js) draws the header, not the view.
  const scripts = [...doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/\bsrc=/.test(m[1]) && !/type="(?!text\/javascript)[^"]*"/.test(m[1])).map((m) => m[2]);
  try {
    vm.createContext(ctx);
    scripts.forEach((s) => vm.runInContext(s, ctx, { timeout: 2000 }));
    document.readyState = 'complete';
    (docListeners.DOMContentLoaded || []).concat(winListeners.DOMContentLoaded || []).forEach((f) => f({}));
    (winListeners.load || []).forEach((f) => f({}));
  } catch (e) {
    return { page, src, frameSrc, file, error: "the doc's own script threw in the harness: " + e.message };
  }

  let shown = null, view = null;
  if (views.length) {
    const active = views.filter((v) => v.classList.contains('active'));
    if (active.length !== 1) return { page, src, frameSrc, file, error: active.length + ' active views after routing' };
    view = active[0].id;
    shown = elementSlice(doc, active[0]._at);
  } else if (hash && !byId[hash.slice(1)]) {
    return { page, src, frameSrc, file, error: 'anchor ' + hash + ' is not an id in the doc' };
  } else {
    const b = doc.match(/<body\b[^>]*>/);
    shown = doc.slice(b ? b.index : 0);
  }
  // Did the panel land where the link points? The hash names an element (`#x` -> id="x" or the router's
  // id="topic-x"); it landed when that element is inside what is shown. No hash: nothing to land on.
  let landed = true, region = null;
  if (hash) {
    const target = byId[hash.slice(1)] || byId['topic-' + hash.slice(1)];
    if (!target) landed = false;
    else if (views.length) { const host = enclosingView(target); landed = !!host && host.id === view; }
    // What the reader sees first: from the anchor to the next heading at its own level or above. An anchor on a
    // heading reads to the next heading of that level; an anchor on a whole view (topic-x) is the view.
    if (target && target !== byId[view]) {
      const tag = (doc.slice(target._at + 1).match(/^[a-zA-Z0-9]+/) || [''])[0].toLowerCase();
      const lvl = /^h[1-6]$/.test(tag) ? Number(tag[1]) : 6;
      const rest = doc.slice(target._at + 1);
      const next = rest.search(new RegExp('<h[1-' + lvl + ']\\b', 'i'));
      region = doc.slice(target._at, next < 0 ? undefined : target._at + 1 + next);
    }
  }
  const regionText = region === null ? null : textOf(region);
  const heading = (() => { const h = (region || shown).match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i); return h ? textOf(h[1]) : ''; })();
  return { page, src, frameSrc, file, view, landed, text: textOf(shown), regionText, heading };
}

module.exports = { panelView, textOf };
