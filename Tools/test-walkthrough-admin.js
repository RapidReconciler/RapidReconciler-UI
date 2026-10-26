/* test-walkthrough-admin.js -- UI-231: the Administrator view's Walkthrough tab.
 *
 *   node Tools/test-walkthrough-admin.js
 *
 * Owner, 2026-10-25: "Now build and commit the administrator walkthrough." Same format
 * and engine as the accountant's (test-walkthrough.js) and the analyst's
 * (test-walkthrough-analyst.js). The Administrator view had no tab strip, so it gains
 * Overview (the existing card grid) + a right-aligned Walkthrough. Runs the SHIPPED code
 * sliced out of RRV8/home.html, with the page's own _isAttnState.
 *
 *   T1  the Administrator band is Overview + a right-aligned Walkthrough, both admin-only
 *   T2  every step goes to Overview, and every card a step lights is an element inside
 *       #view-admin                                                 (rot guard)
 *   T3  every on-screen label a step names still exists on the page it is on, outside
 *       the Walkthrough's own text                                  (rot guard)
 *   R1  each Troubleshooting row opens the page step 4 says it does (UI-232: Data loads
 *       opens Data Refresh, the page's only visible route)
 *   L1  the card steps quote what the card shows, skipping hidden lines and dashes
 *   S1  step 1 names the cards whose dot needs the admin (the page's _isAttnState);
 *       every card clear: the tab and step 1 say so; still loading: says checking
 *   G1  Go there goes to Overview and lights the step's card; leaving the tab puts it out
 *   B1  the banner shows only on the step's tab, and only in the Administrator view
 *   D1  every step's Read more guide is on the ai-docs.js list and is a real file
 *   N1  Previous / Next through the shipped click handler
 *   P1  renderAdminPanels shows the Walkthrough panel only on its tab and only to an
 *       admin, and marks the body so Overview's grid hides behind it
 *   P2  renderAccountantPanels hands the Administrator view to renderAdminPanels
 *
 * TWO MUTATION CONTROLS: counting every non-ok dot as "needs you" must redden S1;
 * dropping the card branch from the light must redden G1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const html = read('RRV8/home.html');
const AI_DOCS_SRC = read('RRV8/ai-docs.js');

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
function slice(hay, start, end, what) {
  const i = hay.indexOf(start);
  if (i < 0 || hay.indexOf(start, i + 1) >= 0) { console.log('HARNESS BROKEN: ' + what + ' start anchor not found exactly once'); process.exit(1); }
  const j = hay.indexOf(end, i);
  if (j < 0) { console.log('HARNESS BROKEN: ' + what + ' end anchor not found'); process.exit(1); }
  return hay.slice(i, j);
}

const SUBVIEWS_SRC = slice(html, '  var SUBVIEWS = {', '\n  var _subDefault', 'SUBVIEWS');
const WALK_SRC = slice(html, '  var _walkStep = null;', '\n\n  // Recurrence lens', 'walkthrough');
const ATTN_SRC = slice(html, '  function _isAttnState(s) {', '\n', '_isAttnState');
const PANELS_SRC = slice(html, '  function renderAccountantPanels() {', '\n  // ── UI-228 Walkthrough', 'renderAccountantPanels');
const VIEW_ADMIN = slice(html, '<div class="view" id="view-admin" hidden>', '<!-- Read-only awareness', '#view-admin markup');
const PAGE_WITHOUT_WALK = html.replace(WALK_SRC, '');

// The Overview grid as the painters leave it. Each entry: [id, data-state, text, hidden].
function page(over) {
  const base = {
    licenseDot: ['ok'], teamDot: ['ok'], activityDot: ['ok'], tsDot: ['ok'],
    licDays: [null, 'License expires in 40 days'], licRenewal: [null, 'Renews Dec 4, 2026', true], licSeats: [null, '2 of 12 company licenses used on this database'],
    teamUsersRow: ['ok', '3 members · 2 roles'], teamReviewRow: ['todo', 'Access review due'], teamPwRow: ['ok', 'Password policy reviewed'],
    tsConnRow: ['ok', 'Connections: all reachable'], tsLoadsRow: ['watch', 'Data loads: last refresh late'], tsServerRow: ['ok', '—'],
    aiPlanTierLabel: [null, 'Grounded']
  };
  return Object.assign(base, over || {});
}
const CARDS = ['licRow', 'teamRow', 'activityRow', 'tsRow', 'adminBrief'];

function sandbox(walkSrc, opt) {
  opt = opt || {};
  const els = {}, calls = { sub: [], panels: [] };
  let role = opt.role || 'admin', admin = opt.admin !== false;
  const spec = page(opt.page);
  const mk = (id) => {
    const s = spec[id] || [];
    const cls = new Set();
    const attrs = { 'data-state': s[0] || 'unknown' };
    const textEl = { textContent: s[1] == null ? '' : s[1] };
    const el = {
      id: id, hidden: !!s[2], innerHTML: '', textContent: textEl.textContent, scrolled: 0,
      getAttribute: (a) => attrs[a], setAttribute: (a, v) => { attrs[a] = v; },
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
      cls: cls,
      // Row cards (.data-row) carry their text in .data-row-text; the licence lines are the text node itself.
      querySelector: (sel) => (sel === '.data-row-text' && /Row$/.test(id) ? textEl : null),
      scrollIntoView() { el.scrolled++; }
    };
    return el;
  };
  const body = { attrs: {}, setAttribute(a, v) { this.attrs[a] = v; } };
  const sb = {
    $: (id) => (els[id] = els[id] || mk(id)),
    esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    isAdmin: () => admin, _viewRole: () => role,
    _setSubView: (sv) => { calls.sub.push(sv); },
    _curSubView: () => (opt.sv !== undefined ? opt.sv : calls.sub.slice(-1)[0]),
    _acctData: null, _cardOpen: { txv: {}, wl: {} },
    setTimeout: () => 0,
    document: {
      body: body,
      querySelector: () => null,
      querySelectorAll: (sel) => (sel === '.walk-focus' ? Object.values(els).filter((e) => e.cls.has('walk-focus')) : []),
      addEventListener: (t, fn) => { if (t === 'click') calls.click = fn; }
    },
    console
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(AI_DOCS_SRC, sb);
  vm.runInContext(ATTN_SRC + '\n' + walkSrc
    + '\nglobalThis.__w = { steps: WALK_STEPS_ADMIN, facts: _walkFactsAdmin, live: function (s, f) { return _walkLive(s, f).join(" "); },'
    + ' render: renderWalkthrough, go: _walkGo, banner: renderWalkBanner, panels: renderAdminPanels, step: function () { return _walkStep; } };', sb);
  return {
    w: sb.__w, els: els, calls: calls, sb: sb, body: body,
    setRole: (r) => { role = r; },
    lit: () => Object.values(els).filter((e) => e.cls.has('walk-focus')).map((e) => e.id)
  };
}

function suite(walkSrc, label) {
  if (label) console.log(label);
  // T1
  const sv = vm.runInNewContext(SUBVIEWS_SRC + '\nSUBVIEWS', { canAnalyst: () => true, isAdmin: () => true });
  const tabs = sv.admin;
  check('T1 the Administrator band is Overview, then a right-aligned Walkthrough', tabs.map((t) => [t.k, t.label, !!t.aside]), [['home', 'Overview', false], ['walk', 'Walkthrough', true]]);
  const noAdm = vm.runInNewContext(SUBVIEWS_SRC + '\nSUBVIEWS', { canAnalyst: () => true, isAdmin: () => false });
  check('T1 and neither tab is offered to someone who is not an administrator', noAdm.admin.map((t) => t.gate()), [false, false]);
  // T2
  let s = sandbox(walkSrc);
  check('T2 every step goes to Overview', s.w.steps.every((st) => st.tab === 'home'), true);
  const cards = s.w.steps.filter((st) => st.card).map((st) => st.card);
  check('T2 every card a step lights is an element inside #view-admin', cards.filter((id) => VIEW_ADMIN.indexOf('id="' + id + '"') < 0), []);
  check('T2 CONTROL: five steps light a card (the guard has something to check)', cards, CARDS.slice(0, 1).concat(['teamRow', 'tsRow', 'activityRow', 'adminBrief']));
  // T3
  const ON_HOME = ['Licensing', 'Team &amp; Access', 'Activity Log', 'Troubleshooting', 'Instance health', 'Show all', 'Manage', 'See full log', 'AI plan'];
  const ON_PAGE = {
    'Request more licenses': ['admin-companies.html', 'Request more licenses'],
    'Request an invoice': ['admin-companies.html', 'Request an invoice'],
    'RR Team': ['admin-users.html', '<title>RR Team'],
    'New Team Member': ['admin-users.html', 'New Team Member\n        </button>'],
    'Send invite': ['admin-users.html', '>Send invite</button>'],
    'Record review': ['admin-users.html', '>Record review</button>'],
    'Complex Passwords': ['admin-complex-passwords.html', '<title>Complex Passwords'],
    'Run checks again': ['admin-troubleshooting.html', 'Run checks again'],
    'Data Refresh': ['admin-data-refresh.html', '<title>Data Refresh'],
    'Refresh now': ['admin-data-refresh.html', '>Refresh now</button>'],
    'Download diagnostics': ['admin-troubleshooting.html', 'Download diagnostics'],
    'Remind me in': ['admin-activity-log.html', '>Remind me in</span>'],
    'Your Plan': ['admin-claude-assistant.html', '>Your Plan<'],
    'Set Features': ['admin-claude-assistant.html', 'Set Features'],
    'Save': ['admin-claude-assistant.html', '>Save</button>']
  };
  const named = [];
  s.w.steps.forEach((st) => (st.look + ' ' + st.todo.join(' ')).replace(/<b>([^<]+)<\/b>/g, (m, t) => { named.push(t); return m; }));
  const missing = ON_HOME.filter((l) => PAGE_WITHOUT_WALK.indexOf(l) < 0)
    .concat(Object.keys(ON_PAGE).filter((l) => read('RRV8/' + ON_PAGE[l][0]).indexOf(ON_PAGE[l][1]) < 0));
  check('T3 every label the steps name still exists where the step says it is', missing, []);
  const all = ON_HOME.concat(Object.keys(ON_PAGE));
  check('T3 every label the steps name is on the guard\'s list', named.filter((n) => all.indexOf(n) < 0), []);
  check('T3 CONTROL: each listed label is named by a step', all.filter((l) => named.indexOf(l) < 0), []);
  // R1 (UI-232, owner 2026-10-26): step 4 says which page each Troubleshooting row opens, so
  // the rows' own links are read out of the #view-admin markup the browser gets.
  const rowHref = (id) => { const m = new RegExp('<a [^>]*id="' + id + '"[^>]*href="([^"]+)"').exec(VIEW_ADMIN); return m ? m[1] : null; };
  check('R1 the Data loads row opens Data Refresh, its only visible route; the other two keep Troubleshooting',
        ['tsConnRow', 'tsLoadsRow', 'tsServerRow'].map(rowHref), ['admin-troubleshooting.html', 'admin-data-refresh.html', 'admin-troubleshooting.html']);
  check('R1 and step 4 names both destinations', ['Troubleshooting', 'Data Refresh'].every((p) => s.w.steps[3].todo.join(' ').indexOf('<b>' + p + '</b>') >= 0), true);

  // L1: the card steps quote the card.
  const f = s.w.facts();
  check('L1 the licence step quotes the card, skipping its hidden renewal line', s.w.live(s.w.steps[1], f),
        'License expires in 40 days 2 of 12 company licenses used on this database');
  check('L1 the team step quotes its three rows', s.w.live(s.w.steps[2], f), '3 members · 2 roles Access review due Password policy reviewed');
  check('L1 a row still showing a dash is left out', s.w.live(s.w.steps[3], f), 'Connections: all reachable Data loads: last refresh late');
  check('L1 the AI plan step names the tier', s.w.live(s.w.steps[5], f), 'AI plan: Grounded.');

  // S1
  const attn = sandbox(walkSrc, { page: { teamDot: ['todo'], tsDot: ['watch'] } });
  check('S1 step 1 names the cards whose dot needs the admin', attn.w.live(attn.w.steps[0], attn.w.facts()), 'Needs you: Team & Access, Troubleshooting.');
  const DONE = 'Nothing needs you right now: every card on Overview is clear. The steps show what to look after.';
  check('S1 every card clear: step 1 says so', s.w.live(s.w.steps[0], f), DONE);
  s.w.render(null);
  check('S1 and the Walkthrough tab says it at the top, under the administrator\'s title',
        [s.els.acctWalkStatus.hidden, s.els.acctWalkStatus.textContent, s.els.acctWalkTitle.textContent], [false, DONE, 'Walkthrough: look after your instance']);
  const loading = sandbox(walkSrc, { page: { activityDot: ['unknown'] } });
  check('S1 a card still loading and none flagged: says checking, never clear', loading.w.live(loading.w.steps[0], loading.w.facts()), 'Checking the cards…');
  attn.w.render(null);
  check('S1 something flagged: the message is hidden', attn.els.acctWalkStatus.hidden, true);
  const listHtml = attn.els.acctWalkList.innerHTML;
  check('S1 six steps, each with Go there and its instructions as bullets', [(listHtml.match(/data-walk-go="/g) || []).length, (listHtml.match(/<ul class="walk-todo">/g) || []).length], [6, 6]);

  // G1
  const g = sandbox(walkSrc);
  g.w.go(1);
  check('G1 Go there goes to Overview and lights the Licensing card', [g.calls.sub.slice(-1)[0], g.lit(), g.els.licRow.scrolled], ['home', ['licRow'], 1]);
  g.w.go(2);
  check('G1 the next step moves the light to its card', g.lit(), ['teamRow']);
  g.w.go(0);
  check('G1 step 1 lights nothing (it is about the whole page)', g.lit(), []);
  g.w.go(5);
  g.w.banner('walk');
  check('G1 leaving the step\'s tab puts the light out', g.lit(), []);

  // B1
  const b = sandbox(walkSrc);
  b.w.go(3);
  b.w.banner('home');
  const bh = b.els.acctWalkBanner;
  check('B1 the banner shows on Overview for the open step', [bh.hidden, /Step 4 of 6: Check the connections and data loads/.test(bh.innerHTML)], [false, true]);
  b.w.banner('walk');
  check('B1 and hides on the Walkthrough tab', bh.hidden, true);
  b.setRole('accountant');
  b.w.banner('home');
  check('B1 and in another view, where step 4 is a different step', bh.hidden, true);
  b.setRole('admin');
  b.w.go(5); b.w.banner('home');
  check('B1 the last step offers Finish, not Next', [/data-walk-end>Finish/.test(bh.innerHTML), /data-walk-next/.test(bh.innerHTML)], [true, false]);

  // D1
  const DOCS = s.sb.RRV8.aiDocs.DOCS;
  check('D1 every step names a guide on the ai-docs.js list', s.w.steps.filter((st) => !DOCS[st.doc]).map((st) => st.title), []);
  check('D1 every guide named is a file that exists', s.w.steps.every((st) => fs.existsSync(path.join(ROOT, 'RRV8', DOCS[st.doc].href))), true);
  b.w.go(1); b.w.banner('home');
  check('D1 the banner carries its step\'s guide (step 2: Licensing)', /href="\.\.\/RRUniversity\/rapidreconciler-licensing\.html"[^>]*>Read more: Licensing/.test(bh.innerHTML), true);

  // N1
  const n = sandbox(walkSrc);
  const click = (attr) => n.calls.click({ target: { closest: (sel) => (sel === '[' + attr + ']' ? {} : null) } });
  n.w.go(3);
  click('data-walk-prev');
  click('data-walk-next'); click('data-walk-next');
  check('N1 Previous and Next move one step at a time', n.w.step(), 4);

  // P1
  const p = sandbox(walkSrc, { sv: 'walk' });
  p.w.panels();
  check('P1 on the Walkthrough tab, for an admin: panel shown and painted, body marked so Overview hides',
        [p.els.acctWalk.hidden, (p.els.acctWalkList.innerHTML.match(/data-walk-go=/g) || []).length, p.body.attrs['data-admin-sub']], [false, 6, 'walk']);
  const ph = sandbox(walkSrc, { sv: 'home' });
  ph.w.panels();
  check('P1 on Overview: panel hidden, body marked home', [ph.els.acctWalk.hidden, ph.body.attrs['data-admin-sub']], [true, 'home']);
  const pn = sandbox(walkSrc, { sv: 'walk', admin: false });
  pn.w.panels();
  check('P1 not an administrator: the panel never shows', pn.els.acctWalk.hidden, true);
}

// P2: the Administrator view goes through renderAdminPanels, from the shipped orchestrator.
function orchestrator(vr) {
  const calls = [], els = {};
  const sb = { $: (id) => (els[id] = els[id] || { hidden: false }), _viewRole: () => vr };
  ['renderSubNav', 'renderCompaniesPill', 'renderWhatifBanner', 'renderAnalystPalette', 'renderAdminPanels'].forEach((k) => { sb[k] = () => calls.push(k); });
  vm.createContext(sb);
  vm.runInContext(PANELS_SRC + '\nrenderAccountantPanels();', sb);
  return { calls: calls, walkHidden: els.acctWalk && els.acctWalk.hidden };
}
console.log('renderAccountantPanels');
const oa = orchestrator('admin'), on = orchestrator('analyst');
check('P2 the Administrator view is handed to renderAdminPanels after the panels are hidden', [oa.calls.indexOf('renderAdminPanels') >= 0, oa.walkHidden, oa.calls.indexOf('renderAnalystPalette') < 0], [true, true, true]);
check('P2 CONTROL: the Analyst view still goes to its own palette, not the admin one', [on.calls.indexOf('renderAnalystPalette') >= 0, on.calls.indexOf('renderAdminPanels') < 0], [true, true]);
// ⚠ A STRING CHECK, NOT BEHAVIOUR: nothing here can apply CSS. It guards the selector that
// hides Overview's grid while the Walkthrough tab is open; the owner's walk is the real test.
check('P2 the stylesheet still hides #view-admin and the first-run wizard on the Walkthrough tab',
      ['body[data-view-role="admin"][data-admin-sub="walk"] #view-admin', 'body[data-view-role="admin"][data-admin-sub="walk"] #view-firstrun'].every((x) => html.indexOf(x) >= 0), true);

suite(WALK_SRC, 'Administrator Walkthrough (home.html)');
const real = failures;

console.log('\nmutation control');
const log = console.log;
function mutant(from, to, row, what) {
  const M = WALK_SRC.replace(from, to);
  if (M === WALK_SRC) { console.log('  HARNESS BROKEN: the mutation changed nothing (' + what + ')'); process.exit(1); }
  failures = 0; reds = [];
  console.log = () => {};
  suite(M, '');
  console.log = log;
  const ok = reds.indexOf(row) >= 0;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: ' + what + ' reddens ' + row + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));
  return ok;
}
const ok1 = mutant('return _isAttnState(c.state); }).map', "return c.state !== 'ok'; }).map", 'S1', 'counting every non-ok dot as needs-you');
const ok2 = mutant('if (s && s.card) el = $(s.card);', 'if (false) el = null;', 'G1', 'dropping the card branch from the light');

const pass = real === 0 && ok1 && ok2;
console.log('\nRESULT: ' + (pass ? 'all assertions and both mutation controls pass' : real + ' assertion(s) failed'));
process.exit(pass ? 0 : 1);
