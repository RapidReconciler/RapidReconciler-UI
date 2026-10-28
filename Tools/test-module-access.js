/*
 * test-module-access.js  --  VLC-212 (Team page), owner ruling 2026-10-26
 *
 *   node Tools/test-module-access.js
 *
 * WHAT THIS GUARDS
 * ----------------
 * Module access (Inventory, In Transit, RNV) is per team member, per database. VALC
 * stores it on each assignment (V105) and mints it into the token's `t` block. The
 * Team page's "Role & access" and "New Team Member" modals show three checkboxes under
 * each database and send them with the assignment.
 *
 *   M1  A DATABASE THE MEMBER HOLDS SHOWS ITS OWN MODULES, not the role's. The role
 *       here grants everything; the saved assignment has In Transit off.
 *   M2  A DATABASE THE MEMBER DOES NOT HOLD STARTS FROM THE ROLE, and is marked so a
 *       role change can re-default it.
 *   M3  RNV IS SHOWN, DISABLED, "Coming soon". A module the customer is not licensed
 *       for (the token's `m` cap) is disabled, unticked and says "Not licensed".
 *   M4  THE SAVE SENDS ONLY WHAT CAN BE EDITED. Inventory and In Transit go as
 *       booleans; RNV and an unlicensed module are LEFT OUT, because VALC reads an
 *       absent flag as "keep" and a false as "revoke".
 *   M5  A COMPANY-RESTRICTED DATABASE keeps its LIST scope and still carries modules.
 *
 * The functions under test are sliced out of the shipped admin-users.html by anchors
 * that throw when they move. extractAssignment runs against stub elements; the row
 * markup is read as the string the page would insert.
 *
 * MUTATIONS (end of file) re-inject each defect and require the named row to go red.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V8DIR = path.join(__dirname, '..', 'RRV8');
const PAGE = fs.readFileSync(path.join(V8DIR, 'admin-users.html'), 'utf8').replace(/\r\n/g, '\n');

/* The function whose header starts at `at`, by brace matching that skips string
 * literals and // comments. Same matcher as test-team-role-save.js. */
function functionBody(src, at, label) {
  if (at < 0) throw new Error('cannot find ' + label + ' -- the anchor moved');
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces in ' + label);
}
function constBlock(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error('cannot find ' + anchor + ' -- the anchor moved');
  return src.slice(at, src.indexOf('];', at) + 2);
}
const fn = (src, header) => functionBody(src, src.indexOf(header), header.trim());

function load(page) {
  const code = [
    constBlock(page, '  const PERM_MODULES = ['),
    fn(page, '  function permModsHtml(d, mods, assigned) {'),
    fn(page, '  function roleModuleDefaults(roleId) {'),
    fn(page, '  function permDbRowHtml(d, assign, defaults) {'),
    fn(page, '  function extractAssignment(wrap) {'),
    'this.api = { permDbRowHtml, extractAssignment, roleModuleDefaults };'
  ].join('\n');
  const ctx = vm.createContext({
    Set, String, Array,
    fmt: s => String(s == null ? '' : s),
    roleByIdV8: id => ROLES.find(r => String(r.id) === String(id)) || null
  });
  vm.runInContext(code, ctx);
  return ctx.api;
}

const ROLES = [
  { id: 6, name: 'Power User', tabInventory: true, tabInTransit: true, tabPoReceipts: true },
  { id: 4, name: 'Accountant', tabInventory: true, tabInTransit: true, tabPoReceipts: false }
];

/* Each data-mod input in a row's markup: {checked, disabled}. */
function modsIn(html) {
  const out = {};
  const re = /<input type="checkbox" data-mod="(\w+)"([^>]*)>\s*([^<]*)(?:<span class="perm-mod-note">([^<]*)<\/span>)?/g;
  let m;
  while ((m = re.exec(html))) {
    out[m[1]] = { checked: / checked/.test(m[2]), disabled: / disabled/.test(m[2]), note: m[4] || '' };
  }
  return out;
}

/* A stub .perm-db wrapper with the given database / module / company state. */
function wrap(name, mods, companies) {
  const el = (attrs) => Object.assign({ getAttribute: k => attrs[k] }, attrs.props);
  const modEls = Object.keys(mods).map(k => el({ 'data-mod': k, props: mods[k] }));
  const coEls = (companies || []).map(c => el({ 'data-co': c.num, props: { checked: c.checked } }));
  return {
    getAttribute: k => (k === 'data-db-name' ? name : null),
    querySelector: sel => sel === '[data-db-assign]' ? { checked: true }
                        : sel === '[data-co-all]' ? (companies ? { checked: false } : null) : null,
    querySelectorAll: sel => sel === '[data-mod]' ? modEls : sel === '[data-co]' ? coEls : []
  };
}

const LICENSED   = { n: 'RapidReconciler_Prod_V8', i: [], m: { inv: true, it: true, por: true } };
const NO_TRANSIT = { n: 'RapidReconciler_QA_V8',   i: [], m: { inv: true, it: false, por: true } };

function run(api) {
  const results = [];
  const check = (id, ok, why) => results.push({ id, ok: !!ok, why });

  // M1
  const held = api.permDbRowHtml(LICENSED,
    { databaseName: LICENSED.n, companyScope: 'ALL', companies: [], inventory: true, inTransit: false, poReceipts: true },
    api.roleModuleDefaults(6));
  const h = modsIn(held);
  check('M1', h.inventory && h.inventory.checked && h.inTransit && !h.inTransit.checked,
    'a held database shows its own modules: Inventory on, In Transit off, though Power User grants both. got ' + JSON.stringify(h));

  // M2
  const fresh = api.permDbRowHtml(LICENSED, null, api.roleModuleDefaults(4));
  const f = modsIn(fresh);
  check('M2', f.inventory.checked && f.inTransit.checked && /data-mods-default="1"/.test(fresh)
              && !/data-mods-default/.test(held),
    'a new database starts from the Accountant role and is marked for re-defaulting; a held one is not');

  // M3
  const nt = modsIn(api.permDbRowHtml(NO_TRANSIT,
    { databaseName: NO_TRANSIT.n, inventory: true, inTransit: true, poReceipts: true }, api.roleModuleDefaults(6)));
  check('M3', h.poReceipts && h.poReceipts.disabled && h.poReceipts.note === 'Coming soon'
              && nt.inTransit.disabled && !nt.inTransit.checked && nt.inTransit.note === 'Not licensed'
              && !nt.inventory.disabled,
    'RNV disabled "Coming soon"; unlicensed In Transit disabled, unticked, "Not licensed"; Inventory still editable');

  // M4
  const a = api.extractAssignment(wrap('RapidReconciler_QA_V8', {
    inventory:  { checked: true,  disabled: false },
    inTransit:  { checked: true,  disabled: true },   // not licensed
    poReceipts: { checked: true,  disabled: true }    // coming soon
  }));
  check('M4', a && a.inventory === true && !('inTransit' in a) && !('poReceipts' in a),
    'only the editable module is sent; disabled ones are absent so VALC keeps them. got ' + JSON.stringify(a));
  const off = api.extractAssignment(wrap('RapidReconciler_Prod_V8', {
    inventory: { checked: false, disabled: false }, inTransit: { checked: false, disabled: false }
  }));
  check('M4b', off.inventory === false && off.inTransit === false,
    'an unticked editable module is sent as false, which is how an admin revokes it. got ' + JSON.stringify(off));

  // M5
  const list = api.extractAssignment(wrap('RapidReconciler_Prod_V8',
    { inventory: { checked: true, disabled: false }, inTransit: { checked: false, disabled: false } },
    [{ num: '90001', checked: true }, { num: '90002', checked: false }]));
  check('M5', list.companyScope === 'LIST' && list.companies.join() === '90001'
              && list.inventory === true && list.inTransit === false,
    'a company-restricted database keeps LIST and its modules. got ' + JSON.stringify(list));

  return results;
}

function report(results) {
  let failed = 0;
  for (const r of results) {
    console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.id + '  ' + r.why);
    if (!r.ok) failed++;
  }
  return failed;
}

const failed = report(run(load(PAGE)));

/* MUTATIONS: each re-injects one defect into the shipped source and requires the
 * named row to go red. A mutation that no longer applies is itself a failure. */
const MUTATIONS = [
  { row: 'M1', from: "const mods = assigned ? assign : (defaults || {});", to: "const mods = defaults || {};" },
  { row: 'M4', from: "if (!cb.disabled) a[cb.getAttribute('data-mod')] = !!cb.checked;",
               to:   "a[cb.getAttribute('data-mod')] = !!cb.checked;" },
  { row: 'M3', from: "const locked     = x.soon || unlicensed;", to: "const locked     = false;" }
];
let mutationMisses = 0;
for (const mu of MUTATIONS) {
  if (!PAGE.includes(mu.from)) { console.log('FAIL  mutation for ' + mu.row + ' no longer applies: ' + mu.from); mutationMisses++; continue; }
  const res = run(load(PAGE.replace(mu.from, mu.to)));
  const hit = res.find(r => r.id === mu.row);
  if (hit && !hit.ok) console.log('ok    mutation ' + mu.row + ' goes red');
  else { console.log('FAIL  mutation ' + mu.row + ' stayed green: the test does not guard it'); mutationMisses++; }
}

if (failed || mutationMisses) {
  console.log('\n' + failed + ' row(s) failed, ' + mutationMisses + ' mutation(s) not caught.');
  process.exit(1);
}
console.log('\nAll rows pass and every mutation is caught.');
