/* test-ui269-admin-bands.js -- behaviour test for UI-269, V8's Administrator home as bands.
 *
 *   node Tools/test-ui269-admin-bands.js
 *
 * WHY THIS EXISTS. Owner 2026-11-13: "make the admin home look like the support center. Replace the AI band with a
 * Here's your day band. Change all the cards to bands. Add a new band for contacts that the admin can change that
 * will sync to valc ... plus add a new 'Send Invoices To' email slot." Rulings 2026-11-24: only an administrator
 * edits the contacts (the server checks), Contact 2 is only an address, Send Invoices To feeds the request-invoice
 * email, and Explain shows only on a plan that includes AI.
 *
 * jsdom is not a dependency of this repo, so this parses the SHIPPED admin markup out of RRV8/home.html with a small
 * HTML parser and runs the SHIPPED UI-269 block (sliced from the same file) over it, with rrFetch, RRAI and
 * localStorage stubbed. Every painter's element id is looked up in the parsed markup, so a renamed id fails here.
 *
 *   M1  the bands carry every id the existing painters write, inside a band body; Contacts and Here's your day exist
 *   D1  Here's your day ranks red, then amber, then to do, from rows and from a band's own dot
 *   D2  item text is escaped
 *   D3  Explain shows only when the plan includes AI (not on 'off', not while the plan is unknown)
 *   D4  nothing to do: "Checking..." while a dot is unknown, then "Nothing needs you today."
 *   D5  an instance-health chip that needs the administrator is listed
 *   B1  a folded band's pill counts its needs and its line names the first; a clear band says so and what it holds
 *   H1  every band head has a Help pill, outside the fold button, naming one section that exists in its doc
 *   B2  a band opens and closes, and the open set survives a repaint (this browser only)
 *   C1  the Contacts dot is to-do and names what is missing; complete contacts are ok
 *   C2  Save sends all four fields (blank as ''), refuses a malformed address before any request
 *   C3  a refused save shows the reason and re-enables Save
 *   W1  the Administrator view has no tabs (no Walkthrough): a source check, labelled as one
 *
 * MUTATION ARMS (each must redden at least one assertion): the rank sort removed; the AI-plan gate removed; the
 * contacts "missing" check removed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME_SRC = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

// ---------------------------------------------------------------- a small DOM
const VOID = new Set(['input', 'br', 'img', 'meta', 'link', 'hr']);
class El {
  constructor(tag, attrs) {
    this.tagName = tag; this.attrs = attrs || {}; this.children = []; this.parentNode = null; this._html = null;
    this.value = this.attrs.value || ''; this.disabled = 'disabled' in this.attrs; this._listeners = {};
  }
  get id() { return this.attrs.id || ''; }
  get type() { return this.attrs.type || ''; }
  get hidden() { return 'hidden' in this.attrs; }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get classList() {
    const el = this;
    const list = () => (el.attrs.class || '').split(/\s+/).filter(Boolean);
    return {
      contains: c => list().includes(c),
      toggle: (c, on) => { const l = list().filter(x => x !== c); if (on) l.push(c); el.attrs.class = l.join(' '); },
    };
  }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  get firstChild() { const c = this.children[0]; return c == null ? null : typeof c === 'string' ? textNode(c) : c; }
  get textContent() { return this.children.map(c => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v) { this.children = [String(v)]; }
  get innerHTML() { return this._html != null ? this._html : ''; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  elements() { const out = []; (function walk(e) { e.children.forEach(c => { if (typeof c !== 'string') { out.push(c); walk(c); } }); })(this); return out; }
  querySelectorAll(sel) { return this.elements().filter(e => matches(e, sel, this)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { for (let e = this; e; e = e.parentNode) if (e instanceof El && matches(e, sel, null)) return e; return null; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
}
// Text children are kept as strings; firstChild hands one out as a text node, which is what the band title reads.
function textNode(s) { return { textContent: s, toString() { return s; } }; }

function decode(s) {
  return s.replace(/&mdash;/g, '—').replace(/&rsquo;/g, '’').replace(/&amp;/g, '&').replace(/&hellip;/g, '…')
    .replace(/&middot;/g, '·').replace(/&rarr;/g, '→').replace(/&times;/g, '×').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function parse(html) {
  const root = new El('#root', {});
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {   // close tag
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag) { stack.length = i; break; }
      continue;
    }
    if (m[2]) {
      const tag = m[2].toLowerCase(), attrs = {};
      const ar = /([^\s=>\/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a; while ((a = ar.exec(m[3] || ''))) attrs[a[1]] = decode(a[3] != null ? a[3] : a[4] != null ? a[4] : a[5] != null ? a[5] : '');
      const el = new El(tag, attrs); el.parentNode = top; top.children.push(el);
      if (!m[4] && !VOID.has(tag)) stack.push(el);
      continue;
    }
    if (m[5] && m[5].trim()) top.children.push(decode(m[5]));
  }
  return root;
}
// Selector: descendant combinators over compounds of tag, #id, .class, [attr], [attr="v"], [attr^="v"].
function compound(e, c) {
  const re = /^([a-z0-9]+)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\])*)$/i;
  const m = re.exec(c); if (!m) throw new Error('selector not supported: ' + c);
  if (m[1] && e.tagName !== m[1].toLowerCase()) return false;
  const parts = m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) || [];
  return parts.every(p => {
    if (p[0] === '#') return e.id === p.slice(1);
    if (p[0] === '.') return e.classList.contains(p.slice(1));
    const am = /^\[([\w-]+)(?:(\^?=)"([^"]*)")?\]$/.exec(p); if (!am) throw new Error('attr selector: ' + p);
    const v = e.getAttribute(am[1]); if (v == null) return false;
    return !am[2] ? true : am[2] === '=' ? v === am[3] : v.startsWith(am[3]);
  });
}
function matches(e, sel, scope) {
  const parts = sel.trim().split(/\s+/);
  if (!compound(e, parts[parts.length - 1])) return false;
  let i = parts.length - 2, cur = e.parentNode;
  while (i >= 0 && cur && cur !== scope) { if (cur instanceof El && compound(cur, parts[i])) i--; cur = cur.parentNode; }
  return i < 0;
}

// ---------------------------------------------------------------- the shipped markup
function cutElement(src, openMarker) {
  const at = src.indexOf(openMarker); if (at < 0) throw new Error('markup not found: ' + openMarker);
  const tag = /^<([a-z]+)/.exec(openMarker)[1];
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g'); re.lastIndex = at;
  let depth = 0, m;
  while ((m = re.exec(src))) { depth += m[0][1] === '/' ? -1 : 1; if (depth === 0) return src.slice(at, m.index + m[0].length); }
  throw new Error('unbalanced ' + openMarker);
}
const MARKUP = cutElement(HOME_SRC, '<section class="adm-day" id="adminBrief"')
  + cutElement(HOME_SRC, '<div class="lower-grid" id="adminGrid">')
  + cutElement(HOME_SRC, '<div class="ihs" id="instanceHealth"');

// ---------------------------------------------------------------- the shipped functions
function sliceBetween(src, a, b) {
  const i = src.indexOf(a), j = src.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error('block not found: ' + a);
  return src.slice(i, j);
}
const BLOCK = sliceBetween(HOME_SRC, '  // ---- UI-269 the Administrator home as bands', '  // ---- Ask-AI pills (Administrator)');
const ESC = (() => { const at = HOME_SRC.indexOf('\n  function esc(s) {'); return HOME_SRC.slice(at + 1, HOME_SRC.indexOf('\n  }\n', at) + 4); })();

function harness(opts) {
  opts = opts || {};
  const root = parse(MARKUP);
  const byId = id => root.elements().find(e => e.id === id) || null;
  const store = {};
  const fetches = [];
  const ctx = {
    console, JSON, Promise, String, Number, Array, Object, RegExp,
    setTimeout: (f) => { f(); return 1; }, clearTimeout: () => {},
    document: { getElementById: byId, querySelectorAll: s => root.querySelectorAll(s), querySelector: s => root.querySelector(s) },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    isAdmin: () => true,
    rrFetch: (url, init) => { fetches.push({ url, init }); return opts.respond ? opts.respond(url, init) : Promise.resolve({}); },
    askAdmin: q => { ctx.__asked = q; },
  };
  ctx.window = {
    RRAI: { plan: () => (opts.plan === undefined ? 'grounded' : opts.plan) },
    RRV8: {
      setDotState: (el, s) => { if (el) el.setAttribute('data-state', s); },
      fetchErrorMessage: (area, err) => 'Could not reach ' + area + ': ' + (err && err.message),
    },
  };
  ctx.$ = byId;
  // In the browser these are globals as well as window properties; the shipped code reads both forms.
  ctx.RRAI = ctx.window.RRAI; ctx.RRV8 = ctx.window.RRV8;
  vm.createContext(ctx);
  vm.runInContext(ESC + '\n' + (opts.block || BLOCK)
    + '\nglobalThis.__t = { day: renderAdminDay, sync: _admSyncBands, toggle: _admToggleBand, restore: _admRestoreBands,'
    + ' paint: _paintContacts, load: loadContacts, save: saveContacts, items: function () { return _admDayItems; } };', ctx);
  return { root, byId, store, fetches, t: ctx.__t, ctx };
}
function setRow(h, id, state, text) {
  const el = h.byId(id); el.setAttribute('data-state', state);
  if (text != null) { const t = el.querySelector('.data-row-text') || el; t.textContent = text; }
}
function allOk(h) {
  ['licenseDot', 'teamDot', 'activityDot', 'tsDot', 'contactsDot'].forEach(id => h.byId(id).setAttribute('data-state', 'ok'));
  ['teamUsersRow', 'teamReviewRow', 'teamPwRow', 'tsConnRow', 'tsLoadsRow', 'tsServerRow'].forEach(id => h.byId(id).setAttribute('data-state', 'ok'));
}

async function main() {
  console.log('test-ui269-admin-bands.js');

  // M1 -----------------------------------------------------------------------
  {
    const h = harness();
    const ids = ['licenseDot', 'licDays', 'licRenewal', 'licSeats', 'licenseSub', 'teamDot', 'teamUsersRow', 'teamReviewRow',
      'teamPwRow', 'teamSub', 'activityDot', 'actFeed', 'actFeedEmpty', 'tsDot', 'tsRows', 'tsConnRow', 'tsLoadsRow',
      'tsServerRow', 'tsSub', 'contactsDot', 'admC1', 'admC2Name', 'admC2', 'admInv', 'admContactsSave', 'admContactsMsg',
      'admDayList', 'admDayCount', 'aiPlanTierLabel', 'adminAnsPanel', 'adminAnsQ', 'adminAnsText', 'dataRefreshRow', 'dataPurgeRow'];
    const missing = ids.filter(id => !h.byId(id));
    check('M1 every id the painters write is in the shipped markup', missing.length === 0, 'missing: ' + missing.join(', '));
    const bands = h.root.querySelectorAll('#adminGrid .adm-band').map(b => b.id);
    check('M1 five bands, Contacts last in the markup', JSON.stringify(bands) === JSON.stringify(['licRow', 'teamRow', 'activityRow', 'tsRow', 'contactsRow']), JSON.stringify(bands));
    const outside = ['licDays', 'teamUsersRow', 'actFeed', 'tsRows', 'admC1'].filter(id => !h.byId(id).closest('.adm-band-body'));
    check('M1 each band\'s contents sit in its foldable body', outside.length === 0, outside.join(', '));
    const dotsInHead = ['licenseDot', 'teamDot', 'activityDot', 'tsDot', 'contactsDot'].filter(id => !h.byId(id).closest('.adm-band-head'));
    check('M1 each band\'s dot is in its head', dotsInHead.length === 0, dotsInHead.join(', '));
    check('M1 the AI ask pills are gone', !/admin-ask-pill|id="adminAskBar"/.test(MARKUP));
    // H1: every band head has a Help pill naming a section that exists in the doc it opens. The ids are read out of
    // the doc, so a renamed heading fails here instead of opening the guide at its index.
    const helps = h.root.querySelectorAll('#adminGrid .adm-band').map(b => {
      const p = b.querySelector('.adm-band-head .band-help');
      return { band: b.id, src: p && p.getAttribute('data-help-src'), inToggle: !!(p && p.closest('.adm-band-toggle')) };
    });
    check('H1 every band head has a Help pill, outside its fold button', helps.every(x => x.src && !x.inToggle), JSON.stringify(helps));
    const bad = helps.filter(x => {
      const m = /^\.\.\/(RRUniversity\/[\w-]+\.html)#([\w-]+)$/.exec(x.src || ''); if (!m) return true;
      // Scripts stripped: the doc's showView comment quotes <h2 id="sh-activity-log"> as an example.
      const doc = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '');
      return (doc.match(new RegExp('id="' + m[2] + '"', 'g')) || []).length !== 1;
    });
    check('H1 each Help pill names exactly one section of its doc', bad.length === 0, JSON.stringify(bad));
  }

  // D1 D2 D3 ------------------------------------------------------------------
  {
    const h = harness();
    allOk(h);
    h.byId('licenseDot').setAttribute('data-state', 'watch'); h.byId('licDays').textContent = '45 days left';
    setRow(h, 'teamReviewRow', 'attention', 'Access review is overdue');
    setRow(h, 'tsLoadsRow', 'todo', 'Data loads: <b>late</b>');
    h.t.day();
    const order = h.t.items().map(i => i.state + ':' + i.band);
    check('D1 ranked red, then amber, then to do', JSON.stringify(order) === JSON.stringify(['attention:Team & Access', 'watch:Licensing', 'todo:Troubleshooting']), JSON.stringify(order));
    const html = h.byId('admDayList').innerHTML;
    check('D1 a band with no rows uses its own words (Licensing\'s days left)', /45 days left/.test(html));
    check('D1 the count says 3', h.byId('admDayCount').textContent === '3');
    check('T1 the day band is tinted red when its worst item is a problem', h.byId('adminBrief').getAttribute('data-state') === 'attention');
    check('D2 row text is escaped', /Data loads: &lt;b&gt;late&lt;\/b&gt;/.test(html) && !/<b>late/.test(html));
    check('D3 Explain shows on a plan with AI', (html.match(/data-day-explain=/g) || []).length === 3);
    check('D1 each item opens its page', /href="admin-users.html"/.test(html) && /href="admin-companies.html"/.test(html) && /href="admin-data-refresh.html"/.test(html));
  }
  for (const plan of ['off', null]) {
    const h = harness({ plan });
    allOk(h); setRow(h, 'teamReviewRow', 'attention', 'Access review is overdue');
    h.t.day();
    check('D3 no Explain when the plan is ' + JSON.stringify(plan), !/data-day-explain=/.test(h.byId('admDayList').innerHTML)
      && /Access review is overdue/.test(h.byId('admDayList').innerHTML));
  }

  // D4 D5 ---------------------------------------------------------------------
  {
    const h = harness();
    h.t.day();
    check('D4 a dot still unknown: Checking', /Checking/.test(h.byId('admDayList').innerHTML), h.byId('admDayList').innerHTML);
    check('T1 untinted while a band is still checking', h.byId('adminBrief').getAttribute('data-state') == null);
    allOk(h); h.t.day();
    check('D4 every band clear: Nothing needs you today', /Nothing needs you today\./.test(h.byId('admDayList').innerHTML)
      && h.byId('admDayCount').textContent === '');
    check('T1 green when nothing needs you', h.byId('adminBrief').getAttribute('data-state') === 'ok');
    setRow(h, 'teamReviewRow', 'todo', 'Access review is due'); h.t.day();
    check('T1 amber when something waits', h.byId('adminBrief').getAttribute('data-state') === 'watch');
    setRow(h, 'teamReviewRow', 'ok', 'Access review is up to date');
    setRow(h, 'dataPurgeRow', 'attention', 'Storage runs out in 20 days'); h.t.day();
    check('D5 an instance-health chip is listed', /Instance health/.test(h.byId('admDayList').innerHTML) && /Storage runs out in 20 days/.test(h.byId('admDayList').innerHTML));
  }

  // B1 B2 ---------------------------------------------------------------------
  {
    const h = harness();
    allOk(h);
    setRow(h, 'teamReviewRow', 'attention', 'Access review is overdue');
    setRow(h, 'teamUsersRow', 'watch', '2 people have not signed in for 30 days');
    h.t.sync();
    const team = h.byId('teamRow');
    check('B1 a band\'s pill counts its needs', team.querySelector('.adm-band-pill').textContent === '2 need you', team.querySelector('.adm-band-pill').textContent);
    check('B1 the folded head names the first and the rest', team.querySelector('.adm-band-meta').textContent === 'Access review is overdue (and 1 more)',
      team.querySelector('.adm-band-meta').textContent);
    const ts = h.byId('tsRow');
    check('B1 a clear band says so in its pill, and what it holds on the line', ts.querySelector('.adm-band-pill').textContent === 'Nothing needs you'
      && ts.querySelector('.adm-band-meta').textContent === ts.getAttribute('data-desc') && !!ts.getAttribute('data-desc'),
      ts.querySelector('.adm-band-pill').textContent + ' / ' + ts.querySelector('.adm-band-meta').textContent);
    h.byId('licDays').textContent = 'Active'; h.t.sync();
    check('B1 a clear Licensing band shows its status in the pill', /^Active/.test(h.byId('licRow').querySelector('.adm-band-pill').textContent),
      h.byId('licRow').querySelector('.adm-band-pill').textContent);

    const body = h.byId('teamBody');
    check('B2 folded by default', body.hidden && team.querySelector('.adm-band-toggle').getAttribute('aria-expanded') === 'false');
    h.t.toggle(team, true);
    check('B2 opens', !body.hidden && team.querySelector('.adm-band-toggle').getAttribute('aria-expanded') === 'true' && team.classList.contains('is-open'));
    team.attrs.class = team.attrs.class.replace(/\bis-open\b/, ''); body.hidden = true;   // a repaint that forgot
    h.t.restore();
    check('B2 the open set survives a repaint', !body.hidden, JSON.stringify(h.store));
    h.t.toggle(team, false);
    check('B2 closes and forgets', body.hidden && !/teamRow/.test(h.store['rrv8.admBands'] || ''));
  }

  // C1 C2 C3 ------------------------------------------------------------------
  {
    const h = harness();
    h.t.paint({ contact1Email: 'sponsor@acme.example', contact2Email: 'it@acme.example', contact2Name: 'Pat', sendInvoicesTo: null });
    check('C1 a missing Send Invoices To makes Contacts a to-do', h.byId('contactsDot').getAttribute('data-state') === 'todo');
    check('C1 and says what is missing', h.byId('contactsRow').getAttribute('data-need') === 'Add Send Invoices To.', h.byId('contactsRow').getAttribute('data-need'));
    h.t.day();
    check('C1 Here\'s your day lists it, opening the band', /Add Send Invoices To\./.test(h.byId('admDayList').innerHTML) && /href="#contactsRow"/.test(h.byId('admDayList').innerHTML));
    h.t.paint({ contact1Email: 'a@acme.example', contact2Email: 'b@acme.example', contact2Name: '', sendInvoicesTo: 'ap@acme.example' });
    check('C1 complete contacts are ok (the RR Administrator name is optional)', h.byId('contactsDot').getAttribute('data-state') === 'ok');
    check('C1 the fields show what VALC holds', h.byId('admInv').value === 'ap@acme.example' && h.byId('admC1').value === 'a@acme.example');
  }
  {
    let sent = null;
    const h = harness({ respond: (url, init) => { sent = { url, init }; return Promise.resolve(Object.assign({ id: 1 }, init.body)); } });
    h.byId('admC1').value = ' sponsor@acme.example '; h.byId('admC2Name').value = ''; h.byId('admC2').value = 'it@acme.example'; h.byId('admInv').value = '';
    h.t.save({ preventDefault() {} });
    await tick(); await tick();
    check('C2 PATCH to the tenant contacts route', sent && sent.url === 'api/v1/tenant/client/contacts' && sent.init.method === 'PATCH');
    check('C2 all four fields sent, trimmed, blank as ""', sent && JSON.stringify(sent.init.body)
      === JSON.stringify({ contact1Email: 'sponsor@acme.example', contact2Name: '', contact2Email: 'it@acme.example', sendInvoicesTo: '' }), sent && JSON.stringify(sent.init.body));
    check('C2 says saved', /Saved/.test(h.byId('admContactsMsg').textContent) && h.byId('admContactsSave').disabled === false);
  }
  {
    const h = harness();
    h.byId('admC1').value = 'not-an-address'; h.byId('admInv').value = 'ap@acme';
    h.t.save({ preventDefault() {} });
    check('C2 a malformed address is refused before any request', h.fetches.length === 0
      && /Project Sponsor, Send Invoices To/.test(h.byId('admContactsMsg').textContent), h.byId('admContactsMsg').textContent);
  }
  {
    const h = harness({ respond: () => Promise.reject(Object.assign(new Error('Changing your contacts needs the Administrator role on your account.'), { status: 403 })) });
    h.byId('admC1').value = 'a@acme.example';
    h.t.save({ preventDefault() {} });
    await tick(); await tick(); await tick();
    check('C3 a refusal shows its reason', /needs the Administrator role/.test(h.byId('admContactsMsg').textContent)
      && h.byId('admContactsMsg').getAttribute('data-tone') === 'bad', h.byId('admContactsMsg').textContent);
    check('C3 Save is enabled again', h.byId('admContactsSave').disabled === false);
  }

  // W1 (source check, labelled as one: SUBVIEWS is a literal the harness does not run) ----------------------------
  check('W1 SOURCE: the Administrator view has no tabs, so no Walkthrough', /\n    admin: \[\]\n  \};/.test(HOME_SRC)
    && !/WALK_STEPS_ADMIN = \[/.test(HOME_SRC));

  // Mutation arms ---------------------------------------------------------------------------------------------------
  const arms = [
    ['rank sort removed', s => s.replace("items.sort(function (a, b) { return (ADM_STATE_RANK[a.state] - ADM_STATE_RANK[b.state]) || (a.order - b.order); });", ''),
      h => { allOk(h); h.byId('licenseDot').setAttribute('data-state', 'watch'); setRow(h, 'teamReviewRow', 'attention', 'x'); h.t.day(); return h.t.items()[0].state === 'attention'; }],
    ['AI-plan gate removed', s => s.replace("return !!p && p !== 'off';", 'return true;'),
      h => { allOk(h); setRow(h, 'teamReviewRow', 'attention', 'x'); h.t.day(); return !/data-day-explain=/.test(h.byId('admDayList').innerHTML); }, { plan: 'off' }],
    ['contacts missing check removed', s => s.replace("return f[1] !== 'contact2Name' && !c[f[1]];", 'return false;'),
      h => { h.t.paint({ contact1Email: 'a@x.example' }); return h.byId('contactsDot').getAttribute('data-state') === 'todo'; }],
  ];
  for (const [name, mutate, holds, o] of arms) {
    const mutated = mutate(BLOCK);
    if (mutated === BLOCK) { check('ARM ' + name + ': the mutation applied', false, 'pattern not found'); continue; }
    const h = harness(Object.assign({ block: mutated }, o || {}));
    check('ARM ' + name + ': caught', holds(h) === false);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
