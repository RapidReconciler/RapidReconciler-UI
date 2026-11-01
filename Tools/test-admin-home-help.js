/* test-admin-home-help.js -- behaviour test for UI-243: each Home view's help panel lists its own screen's words,
 * and the Administrator view draws no Module pill.
 *
 *   node Tools/test-admin-home-help.js
 *
 * WHY THIS EXISTS. UI #911 put Home's help "?" in the bottom bar for every role. The owner opened it as an
 * administrator on 2026-10-28 and found the analyst's reconciliation terms (linked transactions, cardex variance,
 * the model DMAAI table), none of which is on the admin Overview: "The help text makes no sense on this page." The
 * accountant view had the same leak under its own terms. The same screenshot showed a "Module: Inventory" pill in
 * the admin bar: "The admin home does not need a module pill."
 *
 * The panel is the shipped glossaryHtml() from Tools/help-sidebar.js, run in a vm over the shipped GLOSSARY,
 * ACCT_TERMS and ADMIN_TERMS from RRV8/config.js. The pill is judged by a small cascade over home.html's own <style>
 * blocks, so the answer is "what display does #haMod get in this view", not "does a line of CSS exist".
 *
 *   P1  analyst view: exactly GLOSSARY's [ON=home] terms, none of the accountant's or administrator's
 *   P2  accountant view: ACCT_TERMS, then only GLOSSARY entries tagged [VIEWS=...accountant...] (Cardex variance);
 *       no analyst-only term (linked transactions, model DMAAI table, ...) and no admin term
 *   P3  admin view: exactly ADMIN_TERMS, nothing from GLOSSARY or ACCT_TERMS
 *   P4  no-access view ("none"): no terms
 *   P5  a page with no view role (the Cardex Variance page): unchanged, GLOSSARY's [ON=cardex] terms
 *   P6  GLOSSARY (every analyst prompt) carries no admin term; the admin question prompt is handed ADMIN_TERMS
 *   P7  every ADMIN_TERMS entry names something the admin Overview draws, and its thresholds and labels are the
 *       ones the painting code uses (60 days, 182/365 days, the AI plan's four labels)
 *   C1  admin view: #haMod computes to display:none
 *   C2  analyst and accountant views: #haMod is not display:none
 *   W1  the admin Team & Access card's Complex passwords row, _pwRowText fed by sidebar.js's real review rule, reads
 *       "reviewed" and "reminders off" when they are true (it tested 'green', which that rule never returns)
 *
 * MUTATION ARMS: admin panel reads GLOSSARY (must redden P3 only); the accountant's VIEWS filter dropped (P2 only);
 * the CSS rule removed (C1 only); the CSS rule widened to every view (C2 only); the password row back on 'green'
 * (W1 only).
 *
 * BLIND SPOTS, named: the cascade skips @media / @keyframes blocks and :has() / :hover selectors, and models
 * #haMod as body > #homeActions > #haMod with no `hidden` attribute (renderModulePill() clears it). It does not
 * paint the page; the live headless check covers that. P6's prompt half reads askAdmin's source, because the
 * function needs a live DOM and VALC to run.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const config = read('RRV8/config.js');
const sidebar = read('Tools/help-sidebar.js');
const home = read('RRV8/home.html');

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
function between(hay, start, end, label) {
  if (occurrences(hay, start) !== 1) { console.log('HARNESS BROKEN: ' + label + ' start anchor appears ' + occurrences(hay, start) + ' times'); process.exit(1); }
  const i = hay.indexOf(start), j = hay.indexOf(end, i + start.length);
  if (j < 0) { console.log('HARNESS BROKEN: ' + label + ' end anchor missing'); process.exit(1); }
  return hay.slice(i, j + end.length);
}

const TERMS_SRC = ['GLOSSARY', 'ACCT_TERMS', 'ADMIN_TERMS']
  .map((k) => between(config, 'window.RRV8.' + k + ' = [', "].join('\\n');", k)).join('\n');
const GLOSS_FN = between(sidebar, '  function glossaryHtml(', '\n  function init() {', 'glossaryHtml').replace(/\n  function init\(\) \{$/, '');
// VLC-234: askAdmin's call now names its feature (Administrator assistant).
const ADMIN_Q = between(home, "    var grounding = (window.RRV8 && window.RRV8.ADMIN_GROUNDING)", "    aiExplain(prompt, { feature: 'admin' })", 'askAdmin prompt');
const VIEW_ADMIN = between(home, '<div class="view" id="view-admin" hidden>', '<div class="lane-summary" id="adminSummary" hidden>', 'view-admin');
const FRESH_FN = between(home, '  function _dataFreshness() {', '\n  }', '_dataFreshness');
const PLAN_LABELS = between(home, '  var AI_PLAN_LABEL = {', '};', 'AI_PLAN_LABEL');
const LIC_FN = between(home, '  function paintLicenseHealth() {', '\n  }\n', 'paintLicenseHealth');
const TEAM_DAYS = between(home, '  var TEAM_AMBER_DAYS = ', ';', 'TEAM_*_DAYS');
const sidebarJs = read('RRV8/sidebar.js');
const REVIEW_FN = between(sidebarJs, '  function reviewReminderState(value, todayISO) {', '\n  }\n', 'reviewReminderState');
const PW_FN = between(home, '  function _pwRowText(level, val) {', '\n  }\n', '_pwRowText');
const CSS_ALL = [...home.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const ADMIN_RULE = 'body[data-view-role="admin"] #haMod { display: none !important; }';
if (occurrences(CSS_ALL, ADMIN_RULE) !== 1) { console.log('HARNESS BROKEN: the admin #haMod rule appears ' + occurrences(CSS_ALL, ADMIN_RULE) + ' times'); process.exit(1); }

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '\n          got  ' + JSON.stringify(got) + '\n          want ' + JSON.stringify(want)));
}

/* ---- the panel ------------------------------------------------------------ */
function constants() {
  const win = { RRV8: {} };
  vm.runInNewContext(TERMS_SRC, { window: win });
  return win.RRV8;
}
const K = constants();
// A list's entry names (the text before ": "), for entries tagged with `surface`, or every entry when surface is ''.
function names(list, surface, pred) {
  return String(list || '').split('\n').filter((l) => l.indexOf('- ') === 0).filter((l) => {
    if (pred && !pred(l)) return false;
    if (!surface) return true;
    const on = l.match(/\[ON=([^\]]*)\]/);
    return !!on && on[1].split(',').map((s) => s.trim()).indexOf(surface) >= 0;
  }).map((l) => l.slice(2, l.indexOf(': ')));
}
function panelTerms(fnSrc, surface, role) {
  const box = { window: { RRV8: constants() }, console: { warn: () => {} }, String, out: '' };
  vm.runInNewContext(fnSrc + '\nout = glossaryHtml(SURFACE, ROLE);', Object.assign(box, { SURFACE: surface, ROLE: role }));
  return [...box.out.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
}
const forAcct = (l) => /\[VIEWS=[^\]]*\baccountant\b/.test(l);

function runPanel(fnSrc) {
  const gloss = names(K.GLOSSARY, 'home'), acct = names(K.ACCT_TERMS, 'home'), admin = names(K.ADMIN_TERMS, 'home');
  if (!gloss.length || !acct.length || admin.length < 5) { console.log('HARNESS BROKEN: term lists read short'); process.exit(1); }
  const an = panelTerms(fnSrc, 'home', 'analyst');
  check('P1 analyst panel = GLOSSARY [ON=home], no accountant or admin term',
    [an, an.filter((t) => acct.concat(admin).indexOf(t) >= 0)], [gloss, []]);
  const ac = panelTerms(fnSrc, 'home', 'accountant');
  const acWant = acct.concat(names(K.GLOSSARY, 'home', forAcct));
  check('P2 accountant panel = ACCT_TERMS + GLOSSARY [VIEWS=accountant]; no analyst-only or admin term',
    [ac, ac.some((t) => /^LINKED|^MODEL DMAAI|^EXCLUDED GL|^INTEGRITY REVIEW/.test(t)), ac.filter((t) => admin.indexOf(t) >= 0)],
    [acWant, false, []]);
  const ad = panelTerms(fnSrc, 'home', 'admin');
  check('P3 admin panel = ADMIN_TERMS alone', [ad, ad.filter((t) => gloss.concat(acct).indexOf(t) >= 0)], [admin, []]);
  check('P4 no-access view: no terms', panelTerms(fnSrc, 'home', 'none'), []);
  check('P5 page with no view role (cardex): GLOSSARY [ON=cardex], unchanged', panelTerms(fnSrc, 'cardex', ''), names(K.GLOSSARY, 'cardex'));
}

/* ---- the pill: a small cascade over home.html's stylesheet ----------------- */
// CSS comments out, by a scanner that skips quoted strings (a `content: "/*"` must not open one). It throws on an
// unterminated comment rather than guess, as Tools/check_txv_cards.py does (UI-170: no naive regex strip).
function stripCssComments(css) {
  let out = '', i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < css.length && css[j] !== c; j++) if (css[j] === '\\') j++;
      out += css.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*' + '/', i + 2);
      if (end < 0) throw new Error('unterminated CSS comment at offset ' + i);
      i = end + 2; continue;
    }
    out += c; i++;
  }
  return out;
}
function rules(css) {
  css = stripCssComments(css);
  const out = [];
  let i = 0, order = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const sel = css.slice(i, open).trim();
    if (sel.charAt(0) === '@') {            // skip the whole at-rule block
      let d = 0, j = open;
      for (; j < css.length; j++) { if (css[j] === '{') d++; else if (css[j] === '}' && --d === 0) break; }
      i = j + 1; continue;
    }
    const close = css.indexOf('}', open);
    out.push({ sels: sel.split(',').map((s) => s.trim()).filter(Boolean), body: css.slice(open + 1, close), order: order++ });
    i = close + 1;
  }
  return out;
}
// One simple selector against an element {tag, id, cls[], attrs{}}; null = syntax this cascade does not model.
function simple(s, el) {
  let m, rest = s, spec = [0, 0, 0];
  const take = (re) => { const r = rest.match(re); if (r) rest = rest.slice(r[0].length); return r; };
  if ((m = take(/^[a-z][a-z0-9]*/i))) { if (m[0].toLowerCase() !== el.tag) return { ok: false, spec }; spec[2]++; }
  let ok = true;
  while (rest) {
    if ((m = take(/^#([\w-]+)/))) { ok = ok && el.id === m[1]; spec[0]++; }
    else if ((m = take(/^\.([\w-]+)/))) { ok = ok && el.cls.indexOf(m[1]) >= 0; spec[1]++; }
    else if ((m = take(/^\[([\w-]+)(?:="([^"]*)")?\]/))) {
      ok = ok && (m[2] === undefined ? (m[1] in el.attrs) : el.attrs[m[1]] === m[2]); spec[1]++;
    } else if ((m = take(/^:not\(([^()]*)\)/))) {
      const inner = simple(m[1], el); if (!inner) return null;
      ok = ok && !inner.ok; spec = spec.map((v, k) => v + inner.spec[k]);
    } else return null;                    // :has, :hover, ::before ... not modelled
  }
  return { ok, spec };
}
function matches(sel, chain) {            // chain = [root ... target]; descendant semantics for ' ' and '>'
  const parts = sel.replace(/\s*>\s*/g, ' ').split(/\s+/);
  let spec = [0, 0, 0], ci = chain.length - 1;
  for (let pi = parts.length - 1; pi >= 0; pi--) {
    let hit = false;
    for (; ci >= 0; ci--) {
      if (pi === parts.length - 1 && ci !== chain.length - 1) break;   // the last compound must be the target
      const r = simple(parts[pi], chain[ci]); if (!r) return null;
      if (r.ok) { spec = spec.map((v, k) => v + r.spec[k]); hit = true; ci--; break; }
    }
    if (!hit) return false;
  }
  return spec;
}
function pillDisplay(css, role) {
  const chain = [
    { tag: 'body', id: '', cls: [], attrs: { 'data-view-role': role, 'data-admin-sub': 'home' } },
    { tag: 'div', id: 'homeActions', cls: ['home-actions'], attrs: { 'data-help-host': '' } },
    { tag: 'div', id: 'haMod', cls: ['ha-mod'], attrs: {} }
  ];
  let best = null;
  rules(css).forEach((r) => {
    const d = r.body.match(/(?:^|;)\s*display\s*:\s*([^;!]+?)\s*(!important)?\s*(?:;|$)/);
    if (!d) return;
    r.sels.forEach((s) => {
      const spec = matches(s, chain); if (!spec) return;
      const key = [d[2] ? 1 : 0].concat(spec, [r.order]);
      if (!best || key.join(',').localeCompare(best.key.join(','), 'en', { numeric: true }) > 0) best = { key, value: d[1].trim() };
    });
  });
  return best ? best.value : '(default)';
}
function runPill(css) {
  check('C1 admin view: #haMod is display:none', pillDisplay(css, 'admin'), 'none');
  check('C2 analyst + accountant views: #haMod is not display:none',
    [pillDisplay(css, 'analyst') !== 'none', pillDisplay(css, 'accountant') !== 'none'], [true, true]);
}

/* ---- the Complex passwords row: _pwRowText fed by the real review rule ----- */
// RRV8.complexPwReviewState is sidebar.js's reviewReminderState; setPwPolicyDot hands its answer to _pwRowText.
function runPwRow(pwSrc) {
  const box = { out: null };
  vm.runInNewContext(REVIEW_FN + '\n' + pwSrc + '\nout = [["never"], ["2099-01-01"], ["2000-01-01"], [""]].map(function (c) {'
    + ' return _pwRowText(reviewReminderState(c[0], "2026-10-28"), c[0]); });', box);
  check('W1 Complex passwords row: reminders off / reviewed / due / never set read as the code’s own states',
    box.out, ['Passwords — reminders off', 'Password policy reviewed', 'Review password policy', 'Review password policy']);
}

function runCases(fnSrc, css, pwSrc) { reds = []; runPanel(fnSrc); runPill(css); runPwRow(pwSrc || PW_FN); return reds; }

console.log('shipped');
runCases(GLOSS_FN, CSS_ALL);
{
  const adminNames = names(K.ADMIN_TERMS, '');
  check('P6 GLOSSARY carries no admin term; the admin question prompt is handed RRV8.ADMIN_TERMS',
    [names(K.GLOSSARY, '').filter((t) => adminNames.indexOf(t) >= 0), K.GLOSSARY.indexOf('ADMINISTRATOR TERMS') < 0, /RRV8\.ADMIN_TERMS/.test(ADMIN_Q)],
    [[], true, true]);
}
{
  // Each admin term is tied to what draws it. A term with no row here fails, so a new entry needs its evidence.
  const line = (t) => K.ADMIN_TERMS.split('\n').find((l) => l.indexOf('- ' + t + ' ') === 0 || l.indexOf('- ' + t + ':') === 0) || '';
  const view = VIEW_ADMIN.replace(/&amp;/g, '&');
  const EVIDENCE = {
    'STATUS DOTS': () => /class="row-dot"/.test(VIEW_ADMIN),
    'DATA AS OF': () => /'Data as of '/.test(FRESH_FN) && /Refreshing now/.test(FRESH_FN) && /Last refresh failed/.test(FRESH_FN),
    'AI PLAN': () => /id="aiPlanTierLabel"/.test(VIEW_ADMIN)
      && [...PLAN_LABELS.matchAll(/:\s*'([A-Za-z]+)'/g)].map((m) => m[1]).length === 4
      && [...PLAN_LABELS.matchAll(/:\s*'([A-Za-z]+)'/g)].map((m) => m[1]).every((lbl) => line('AI PLAN').indexOf(lbl + ':') >= 0),
    'LICENSING': () => />Licensing</.test(view) && /days <= 60/.test(LIC_FN) && /60 days/.test(line('LICENSING')) && /company licenses used on this database/.test(LIC_FN),
    'TEAM & ACCESS': () => />Team & Access</.test(view) && /TEAM_AMBER_DAYS = 182, TEAM_RED_DAYS = 365/.test(TEAM_DAYS)
      && /6 months/.test(line('TEAM & ACCESS')) && /a year/.test(line('TEAM & ACCESS')),
    'TROUBLESHOOTING': () => ['Connections', 'Data loads', 'Database server'].every((a) => view.indexOf('data-ts-area="' + a + '"') >= 0) && /href="admin-data-refresh.html"/.test(view),
    'ACTIVITY LOG': () => />Activity Log</.test(view) && /See full log/.test(view),
    'INSTANCE HEALTH': () => />Instance health</.test(view) && /id="ihsShowAll"/.test(view)
  };
  const adminNames = names(K.ADMIN_TERMS, 'home').map((n) => n.replace(/ \(.*$/, ''));
  check('P7 every admin term names something the admin Overview draws, with the code’s own thresholds and labels',
    adminNames.filter((n) => !(EVIDENCE[n] && EVIDENCE[n]())), []);
}

const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, fnSrc, css, pwSrc) {
  if (fnSrc === GLOSS_FN && css === CSS_ALL && (!pwSrc || pwSrc === PW_FN)) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = runCases(fnSrc, css, pwSrc);
  failures = saved;
  const ok = got.length === 1 && got[0] === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want + ' only');
}
if (shippedFailures === 0) {
  arm('the admin panel reads GLOSSARY', 'P3', GLOSS_FN.replace("[[R.ADMIN_TERMS, '']]", "[[R.GLOSSARY, '']]"), CSS_ALL);
  arm('the accountant view drops the VIEWS filter', 'P2', GLOSS_FN.replace("[R.GLOSSARY, 'accountant']", "[R.GLOSSARY, '']"), CSS_ALL);
  arm('the admin pill rule removed', 'C1', GLOSS_FN, CSS_ALL.replace(ADMIN_RULE, ''));
  arm('the pill rule widened to every view', 'C2', GLOSS_FN, CSS_ALL.replace(ADMIN_RULE, 'body #haMod { display: none !important; }'));
  arm('the password row tests the old "green"', 'W1', GLOSS_FN, CSS_ALL, PW_FN.replace("level === 'ok'", "level === 'green'"));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
