/* test-role-hero.js -- behaviour test for UI-245: Home's three role views open with the same header.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" Tools/test-role-hero.js
 *
 * WHY THIS EXISTS. The owner's screenshots (2026-10-29): Admin and Accountant opened with a role title and a
 * dismissible subtitle, while the Analyst opened with "ANALYST HOME / Ed, here's where you stand today / company".
 * Only the analyst had a renderer (#371), and it overwrote the item's innerHTML, which also deleted the subtitle and
 * dismiss button its comment said it left alone. Owner ruling: "greeting for all".
 *
 * This slices the SHIPPED renderer and its two wiring callers (applyViewRole, renderCompaniesPill) out of
 * home.html and runs them against stubbed scope state.
 *
 *   R1  first paint: each role's static item already has the kicker + greeting title and no subtitle
 *   R2  rendered: every role produces the same structure (kicker, title, context line) with its own kicker
 *   R3  the context line names what each view is working on (analyst company, accountant companies + database,
 *       a single-company accountant tab names that company, admin database; numbers until names load)
 *   R4  wiring: a role switch (applyViewRole) and a scope change (renderCompaniesPill) re-render the header
 *   R5  database names drop only the "RapidReconciler_" prefix, so a customer's Prod_V8 does not read "V8"
 *
 * TWO MUTATION CONTROLS: renderCompaniesPill no longer calls the renderer (must redden R4 only), and the old
 * analyst-only static markup with subtitles (must redden R1 only).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');

// Brace-matched, so a nested object literal does not end the block early (same slicer as test-data-freshness.js).
function sliceBlock(src, startIdx) {
  let depth = 0;
  for (let i = src.indexOf('{', startIdx); i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(html, name) {
  const at = html.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(html, at + 1);
}

const ROLES = ['admin', 'analyst', 'accountant'];
const KICKER = { admin: 'Administrator Home', analyst: 'Analyst Home', accountant: 'Accountant Home' };
const GREETING = 'Pat, here’s where you stand today';

const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').replace(/&amp;/g, '&')
  .replace(/&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
const shape = (h) => [...h.matchAll(/class="(role-hero-[a-z]+)"/g)].map((m) => m[1]);
function part(h, cls) {
  const m = h.match(new RegExp('<(div|h1)[^>]*class="' + cls + '"[^>]*>([\\s\\S]*?)</\\1>'));
  return m ? text(m[2]) : null;
}

// The static first-paint markup of each role item, as home.html declares it.
function staticItems(html) {
  const sec = (html.match(/<section class="role-hero" id="roleHero"[\s\S]*?<\/section>/) || [''])[0];
  const out = {};
  for (const r of ROLES) {
    const m = sec.match(new RegExp('<div class="role-hero-item" data-role="' + r + '">([\\s\\S]*?)\\n    </div>'));
    out[r] = m ? m[1] : '';
  }
  return out;
}

function load(html) {
  const items = {};
  ROLES.forEach((r) => { items[r] = { innerHTML: '' }; });
  const st = { role: 'analyst', cos: ['90002', '90008'], solo: '90002', focus: '90008', sub: 'rec', excl: [],
               names: { '90002': 'Acme Industrial, Inc.', '90008': 'Acme Industrial, Ltd.' } };
  const sb = {
    console,
    document: {
      body: { setAttribute() {} },
      getElementById: () => null,   // renderCompaniesPill's bottom-bar pill is absent here; it returns after the header
      querySelector(sel) { const m = sel.match(/data-role="([a-z]+)"/); return m ? items[m[1]] || null : null; },
    },
    RR_SESSION: { user: { fn: 'Pat Example' } },
    _viewRole: () => st.role,
    activeDb: () => ({ n: 'RapidReconciler_Demo1' }),
    _fullCosFromRows: () => st.cos.slice(),
    _ensureAnalystSolo: () => st.solo,
    _acctFocusCo: () => st.focus,
    _curSubView: () => st.sub,
    _isExcludedCo: (c) => st.excl.indexOf(String(c)) >= 0,
    _anyExcluded: () => st.excl.length > 0,
    _ensureCompanyNames() {},
    syncRoleMenu() {}, renderSubNav() {}, paintNoGrantNotice() {}, renderAdminPanels() {},
    $: () => null,
  };
  sb.window = sb;
  vm.createContext(sb);
  const kick = (html.match(/\n  var _ROLE_HERO_KICKER = \{[^}]*\};/) || [''])[0];
  const src = [kick, 'var _coNames = null;']
    .concat(['esc', 'dbShortName', '_firstName', '_roleHeroCompany', '_roleHeroContext', 'renderRoleHero',
             'applyViewRole', 'renderCompaniesPill'].map((n) => extractFn(html, n)))
    .join('\n');
  vm.runInContext(src, sb, { filename: 'home.html:role-hero' });
  return { sb, st, items, setNames: (on) => vm.runInContext('_coNames = ' + (on ? JSON.stringify(st.names) : 'null'), sb) };
}

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

function runCases(html) {
  reds = [];
  // R1 -- first paint, before any script runs.
  const stat = staticItems(html);
  check('R1 first paint: every role item has kicker + title and no subtitle',
    ROLES.map((r) => shape(stat[r]).join(',') + (/role-hero-sub/.test(stat[r]) ? '+sub' : '')),
    ROLES.map(() => 'role-hero-kicker,role-hero-title'));

  let env;
  try { env = load(html); } catch (e) { check('R2 the renderer loads from home.html', String(e.message), 'loaded'); return reds.slice(); }
  const { sb, st, items, setNames } = env;
  setNames(true);

  // R2 -- every role renders the same structure, through the real role-switch path.
  const got = {};
  for (const r of ROLES) { st.role = r; sb.applyViewRole(); got[r] = items[r].innerHTML; }
  check('R2 all three roles render kicker, greeting title, context line',
    ROLES.map((r) => shape(got[r]).join(',')), ROLES.map(() => 'role-hero-kicker,role-hero-title,role-hero-context'));
  check('R2 each role has its own kicker and the same greeting',
    ROLES.map((r) => [part(got[r], 'role-hero-kicker'), part(got[r], 'role-hero-title')]),
    ROLES.map((r) => [KICKER[r], GREETING]));

  // R3 -- what the context line says.
  const ctx = (r) => { st.role = r; sb.renderRoleHero(); return part(items[r].innerHTML, 'role-hero-context'); };
  check('R3 analyst: the picked company, name and number', ctx('analyst'), 'Acme Industrial, Inc. · 90002');
  check('R3 accountant Overview: companies in view and the database', ctx('accountant'), '2 companies · Demo1');
  st.excl = ['90008'];
  check('R3 accountant with one company excluded', ctx('accountant'), '1 of 2 companies · Demo1');
  st.excl = []; st.sub = 'perpetual';
  check('R3 accountant single-company tab names that company', ctx('accountant'), 'Acme Industrial, Ltd. · 90008 · Demo1');
  st.sub = 'rec';
  check('R3 admin: the database', ctx('admin'), 'Demo1');
  setNames(false);
  check('R3 before company names load: the number', ctx('analyst'), 'Company 90002');
  setNames(true);

  // R4 -- the wiring: a scope change re-renders without anyone calling the renderer directly.
  st.role = 'accountant'; sb.renderRoleHero();
  st.excl = ['90002'];
  sb.renderCompaniesPill();
  check('R4 a company exclusion (renderCompaniesPill) updates the header',
    part(items.accountant.innerHTML, 'role-hero-context'), '1 of 2 companies · Demo1');
  st.excl = [];
  items.admin.innerHTML = '';
  st.role = 'admin'; sb.applyViewRole();
  check('R4 a switch to Admin (applyViewRole) renders its header', part(items.admin.innerHTML, 'role-hero-kicker'), 'Administrator Home');

  // R5 -- the database name. Every customer's production database is RapidReconciler_Prod_V8; the short name used to
  // keep only what follows the LAST underscore, so it read "V8". Owner ruling 2026-10-29: Prod_V8, the same rule as
  // the scope bands on the other V8 pages (drop the platform prefix only).
  check('R5 short database names drop only the platform prefix',
    ['RapidReconciler_Prod_V8', 'RapidReconciler_QA_V8', 'RapidReconciler_Demo1', 'LegacyName', ''].map((n) => sb.dbShortName(n)),
    ['Prod_V8', 'QA_V8', 'Demo1', 'LegacyName', '']);
  sb.activeDb = () => ({ n: 'RapidReconciler_Prod_V8' });
  check('R5 the Admin header on a customer production database', ctx('admin'), 'Prod_V8');
  return reds.slice();
}

console.log('Home role header (UI-245)');
runCases(HOME);
const shippedFailures = failures;

let armFailures = 0;
function arm(label, want, html) {
  if (html === HOME) { console.log('HARNESS BROKEN: arm ' + label + ' changed nothing'); process.exit(1); }
  const saved = failures;
  console.log('\nmutation arm: ' + label);
  const got = [...new Set(runCases(html))];
  failures = saved;
  const ok = got.join(',') === want;
  if (!ok) armFailures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (got.join(',') || 'nothing') + '; needed ' + want);
}
if (shippedFailures === 0) {
  arm('renderCompaniesPill no longer re-renders the header', 'R4',
    HOME.replace("    renderRoleHero();   // UI-245: the header's context line follows", '    // UI-245: the header context line follows'));
  arm('the old static markup (role title + dismissible subtitle)', 'R1',
    HOME.replace('      <div class="role-hero-kicker">Administrator Home</div>\n      <h1 class="role-hero-title">Here&rsquo;s where you stand today</h1>',
      '      <h1 class="role-hero-title">Administrator</h1>\n      <p class="role-hero-sub"><span class="role-hero-sub-text">Users.</span></p>'));
}

const total = shippedFailures + armFailures;
console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
process.exit(total === 0 ? 0 : 1);
