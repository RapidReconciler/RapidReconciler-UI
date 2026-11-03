/*
 * test-admin-db-chooser.js  --  UI-266
 *
 * WHAT THIS GUARDS
 * ----------------
 * Owner 2026-11-03 ("ui-266 go", "the picker should be hidden for power users as well"): Home's Administrator view
 * reports the whole instance (UI-265), so it has no database picker. The admin pages whose data is one database's carry
 * their own "Database" choice instead, built by two shipped functions in RRV8/config.js:
 *
 *   RRV8.adminDbChoices(dbs)    the databases the sign-in administers (t.adm), once each, by short name.
 *   RRV8.mountDbChooser(host)   hidden with fewer than two; otherwise a select with the active database chosen, and a
 *                               change makes the choice the active database and reloads the page.
 *
 * And one rule in RRV8/home.html: #haDb (the picker) is hidden on the Administrator view and on no other.
 *
 * HOW
 * ---
 * Both functions are SLICED OUT OF config.js AND EXECUTED in a vm against a stub RRDB, document and location. The
 * CSS rule is read from home.html's stylesheet, the same way test-data-freshness.js reads the pill's placement rules.
 *
 * MUTATIONS
 * ---------
 * Section 2 re-injects each defect and requires the named assertion, and only it, to go RED.
 *
 * BLIND SPOTS, named: no layout engine, so it proves the select's options and wiring, not how it looks; it does not
 * prove each of the seven pages has the mount point (a grep would; the owner's look does better).
 *
 *   node Tools/test-admin-db-chooser.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');

function slice(src, start) {
  const i = src.indexOf(start);
  if (i < 0) { console.log('HARNESS BROKEN: no "' + start + '"'); process.exit(1); }
  const j = src.indexOf('\n  };\n', i);
  return src.slice(i, j + '\n  };\n'.length);
}
const SRC = slice(CONFIG, '  window.RRV8.adminDbChoices = function (dbs) {') + slice(CONFIG, '  window.RRV8.mountDbChooser = function (host) {');

const db = (n, adm, uuid) => ({ n: 'RapidReconciler_' + n, uuid: uuid || n, t: { adm } });

function load(src, dbs, activeName) {
  const calls = { setActive: [], reload: 0 };
  let listener = null;
  const select = { addEventListener: (ev, fn) => { if (ev === 'change') listener = fn; } };
  const host = { hidden: true, innerHTML: '', querySelector: () => select };
  const sandbox = {
    window: {
      RRV8: {},
      RRDB: { dbs: () => dbs, active: () => dbs.find((d) => d.n === activeName) || dbs[0] || {}, setActive: (n) => calls.setActive.push(n) },
      location: { reload: () => { calls.reload++; } }
    },
    document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'config.js (sliced)' });
  return { R: sandbox.window.RRV8, host, calls, change: (v) => listener && listener({ target: { value: v } }) };
}

const options = (html) => [...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map((m) => m[3] + (m[2] ? '*' : ''));

const ASSERTIONS = {
  choicesAreTheAdministeredDatabasesOnceEachByName: (src) => {
    const { R } = load(src, [], '');
    const got = R.adminDbChoices([db('Demo3', true), db('Demo1', true), db('Other', false), db('Demo1', true), db('Demo10', true, 'x'), null])
      .map((c) => c.label).join(',');
    return got === 'Demo1,Demo3,Demo10' ? null : 'got ' + got;
  },
  oneDatabaseShowsNoChooser: (src) => {
    const t = load(src, [db('Prod_V8', true), db('QA_V8', false)], 'RapidReconciler_Prod_V8');
    t.R.mountDbChooser(t.host);
    return t.host.hidden && t.host.innerHTML === '' ? null : 'shown with one administered database: ' + t.host.innerHTML;
  },
  severalShowTheActiveOneChosen: (src) => {
    const t = load(src, [db('Demo1', true), db('Demo2', true), db('Demo3', true)], 'RapidReconciler_Demo2');
    t.R.mountDbChooser(t.host);
    const got = options(t.host.innerHTML).join(',');
    return !t.host.hidden && got === 'Demo1,Demo2*,Demo3' ? null : 'hidden=' + t.host.hidden + ' options ' + got;
  },
  aChoiceBecomesActiveAndReloads: (src) => {
    const t = load(src, [db('Demo1', true), db('Demo2', true)], 'RapidReconciler_Demo1');
    t.R.mountDbChooser(t.host);
    t.change('RapidReconciler_Demo1');   // the same one: nothing happens
    if (t.calls.setActive.length || t.calls.reload) return 'choosing the active database reloaded';
    t.change('RapidReconciler_Demo2');
    return t.calls.setActive.join() === 'RapidReconciler_Demo2' && t.calls.reload === 1 ? null
      : 'setActive ' + JSON.stringify(t.calls.setActive) + ' reload ' + t.calls.reload;
  }
};

// The CSS half: #haDb hidden on the Administrator view, and by no rule that is not scoped to it.
// stripper-safety: css-only. The block-comment strip below runs on <style> contents only, the case UI-170 permits.
function cssProblems(html) {
  const css = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const hiding = rules.filter((r) => /#haDb(?![\w-])/.test(r.sel) && /display\s*:\s*none/.test(r.body));
  const p = [];
  if (!hiding.some((r) => r.sel.split(',').some((s) => /body\[data-view-role="admin"\]\s+#haDb$/.test(s.trim())))) p.push('no rule hides #haDb on the Administrator view');
  hiding.forEach((r) => r.sel.split(',').map((s) => s.trim()).filter((s) => /#haDb$/.test(s))
    .forEach((s) => { if (!/data-view-role="admin"/.test(s)) p.push('a rule hides #haDb outside the Administrator view: ' + s); }));
  return p;
}

function runAll(src, html) {
  const out = {};
  for (const [name, fn] of Object.entries(ASSERTIONS)) {
    let why;
    try { why = fn(src); } catch (e) { why = 'threw: ' + e.message; }
    out[name] = why;
  }
  const css = cssProblems(html);
  out.pickerHiddenOnTheAdministratorViewOnly = css.length ? css.join('; ') : null;
  return out;
}

let failed = 0;
for (const [name, why] of Object.entries(runAll(SRC, HOME))) {
  if (why) { failed++; console.log('FAIL  ' + name + ': ' + why); } else console.log('ok    ' + name);
}

const MUTATIONS = [
  { name: 'every database is offered, administered or not', on: 'src',
    find: "if (!d || !d.n || !d.t || d.t.adm !== true) return;", replace: 'if (!d || !d.n) return;',
    // Two reds, correctly: the one-database case has a second, non-administered entry, which this defect offers.
    red: ['choicesAreTheAdministeredDatabasesOnceEachByName', 'oneDatabaseShowsNoChooser'] },
  { name: 'the chooser shows with one database', on: 'src',
    find: 'if (choices.length < 2) {', replace: 'if (choices.length < 1) {',
    red: ['oneDatabaseShowsNoChooser'] },
  { name: 'a choice changes the database but does not reload', on: 'src',
    find: '      window.location.reload();\n', replace: '\n',
    red: ['aChoiceBecomesActiveAndReloads'] },
  { name: 'the picker hidden for everyone, not just the Administrator view', on: 'html',
    find: 'body[data-view-role="admin"] #haDb { display: none !important; }', replace: '#haDb { display: none !important; }',
    red: ['pickerHiddenOnTheAdministratorViewOnly'] }
];

for (const m of MUTATIONS) {
  const base = m.on === 'src' ? SRC : HOME;
  const n = base.split(m.find).length - 1;
  if (n !== 1) { failed++; console.log('FAIL  mutation "' + m.name + '": anchor found ' + n + ' times'); continue; }
  const mutated = base.replace(m.find, m.replace);
  const res = m.on === 'src' ? runAll(mutated, HOME) : runAll(SRC, mutated);
  const reds = Object.keys(res).filter((k) => res[k]);
  const missing = m.red.filter((k) => !reds.includes(k));
  const extra = reds.filter((k) => !m.red.includes(k));
  if (missing.length || extra.length) {
    failed++;
    console.log('FAIL  mutation "' + m.name + '": expected red ' + JSON.stringify(m.red) + ', got ' + JSON.stringify(reds));
  } else {
    console.log('ok    mutation "' + m.name + '" caught by ' + m.red.join(', '));
  }
}

console.log(failed ? '\n' + failed + ' failure(s)' : '\nall passed');
process.exit(failed ? 1 : 0);
