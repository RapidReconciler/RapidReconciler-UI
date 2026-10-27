/*
 * test-role-select.js  --  VLC-214 (Team page), owner ruling 2026-10-27
 *
 *   node Tools/test-role-select.js
 *
 * WHAT THIS GUARDS
 * ----------------
 * Roles are four flat roles now: Administrator, Analyst, Accountant, Power User. VALC's
 * GET /api/v1/tenant/roles returns exactly those, and PUT .../role and the invite REFUSE a
 * null roleId with 400. So "no role" is no longer something the Team page may offer:
 *
 *   R1  NO BLANK ROLE. Neither modal (Role & access, New Team Member) renders the old
 *       "(no role -- no access)" option, or any other option with an empty value, for a
 *       member who has a role.
 *   R2  A LEGACY NULL ROLE IS NOT DRESSED UP AS A ROLE. A member with no role (rows from
 *       before the change) opens on a disabled "Choose a role" placeholder, selected, and
 *       the modal says so -- not on the first role in the list as if it were theirs.
 *   R3  SAVE IS BLOCKED UNTIL A ROLE IS CHOSEN. With the placeholder selected, Done makes
 *       no request and shows a message in the modal's error line.
 *   R4  NEW MEMBER DEFAULT is the Analyst role.
 *   R5  A 400 FROM THE ROLE PUT shows VALC's sentence in the modal's error line.
 *   R6  THE ROSTER IS NOT FILTERED BY ROLE NAME. VALC drops GSI staff server-side by email
 *       domain; "GSI Internal" was renamed Power User and customers may assign it, so a
 *       client-side roleName filter would hide real customer members.
 *   R7  POWER USER IS OFFERED. roleModules() maps it to all four modules, so the picker
 *       keeps it whenever any module is licensed, by flags or by the name fallback.
 *
 * Every function under test is sliced out of the shipped admin-users.html by an anchor
 * that throws when it moves; the DOM is a handful of stub elements.
 *
 * MUTATIONS (end of file) re-inject each defect and require the named row to go red.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V8DIR = path.join(__dirname, '..', 'RRV8');
const read = f => fs.readFileSync(path.join(V8DIR, f), 'utf8').replace(/\r\n/g, '\n');

/* Same brace matcher as test-team-role-save.js: skips string literals and // comments. */
function functionBody(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0 || src.indexOf(anchor, at + 1) >= 0) throw new Error('anchor not found exactly once: ' + anchor);
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces after ' + anchor);
}
// fmt() is NOT sliced: its body holds the regex /[&<>"']/g, which this string-aware
// matcher reads as an open quote and runs on for 1,300 lines. It is an HTML escaper,
// not under test, so the sandbox carries an equivalent.
const ANCHORS = [
  '  function roleByIdV8(id) {',
  '  function clientModuleCaps() {',
  '  function roleModules(r) {',
  '  function offerableRoles(roles) {',
  '  function openPermsModal(userId) {',
  '  async function saveUserRights() {',
  '  function openNewUserModal() {',
  '  async function saveNewUser() {',
  '  function reloadUsers() {',
  '  function fetchErrText(area, err) {'
];
const SINK = sidebar => {
  const start = sidebar.indexOf('  function _fetchTargetHost(area) {');
  const tailAnchor = "    return raw || 'The request failed and reported no reason.';";
  const tail = sidebar.indexOf(tailAnchor);
  if (start < 0 || tail < start) throw new Error('cannot slice sidebar.js fetchErrorMessage -- the anchors moved');
  return sidebar.slice(start, sidebar.indexOf('\n  }', tail) + 4);
};
const READER = config => functionBody(config, '  function responseError(r, url) {');

const ROLES = [
  { id: 1, name: 'Administrator', description: 'Admin', tabAdmin: true,  tabInventory: false, tabInTransit: false, tabPoReceipts: false },
  { id: 2, name: 'Analyst',       description: 'Analyst', tabAdmin: false, tabInventory: true,  tabInTransit: false, tabPoReceipts: false },
  { id: 3, name: 'Accountant',    description: 'Accountant', tabAdmin: false, tabInventory: true, tabInTransit: false, tabPoReceipts: false },
  { id: 4, name: 'Power User',    description: 'Everything', tabAdmin: true, tabInventory: true, tabInTransit: true, tabPoReceipts: true }
];
const BAD_ROLE = 'A role is required. Choose one of Administrator, Analyst, Accountant or Power User.';

const json = (status, body) => new Response(body == null ? '' : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise(r => setImmediate(r));

/** A fresh sandbox holding the sliced page functions. `opt.answer(path, init)` answers
 *  RRDB.valcFetch; `opt.rows` is what rrFetch('api/v1/tenant/users') returns. */
function sandbox(srcs, opt) {
  opt = opt || {};
  const els = {}, calls = [], toasts = [], rendered = [];
  const el = id => (els[id] = els[id] || {
    id, innerHTML: '', textContent: '', value: '', disabled: false, _cls: new Set(),
    classList: { add(c) { this._o._cls.add(c); }, remove(c) { this._o._cls.delete(c); }, contains(c) { return this._o._cls.has(c); } },
    focus() {}
  });
  const getEl = id => { const e = el(id); e.classList._o = e; return e; };
  const ctx = vm.createContext({
    URL, Promise, Error, TypeError, JSON, Response, Headers, Number, String, Map, Set, Array, Object, RegExp,
    console: { warn() {}, log() {}, error() {} },
    setTimeout: () => 0,
    document: { getElementById: getEl, querySelectorAll: () => ({ forEach() {} }) },
    __calls: calls, __toasts: toasts, __rendered: rendered,
    __answer: opt.answer || ((p) => Promise.resolve(json(200, []))),
    __rows: opt.rows || []
  });
  ctx.window = ctx;
  ctx.RR_SESSION = { dbs: [{ n: 'RapidReconciler_Prod_V8', m: { inv: true, it: true, por: true, adm: true } }], activeDbIndex: 0 };
  const fns = ANCHORS.map(a => functionBody(srcs.page, a)).join('\n');
  new vm.Script(
    'var RRDB = { valcFetch: function (p, init) { __calls.push(p); return __answer(p, init); } };\n' +
    'RRDB.responseError = (function () {\n' + READER(srcs.config) + '\n  return responseError;\n})();\n' +
    'var RRV8 = (function (global) {\n' + SINK(srcs.sidebar) + '\n  return { fetchErrorMessage: fetchErrorMessage };\n})(window);\n' +
    'var _rowsById = new Map(), _permsUserId = null, _assignByDb = {}, _rolesCacheV8 = null;\n' +
    'var _signin = { nu: { bypass: false, mapped: false, prose: "", label: null, seq: 0 } };\n' +
    'function fmt(v) { return (v === null || v === undefined || v === "") ? "&mdash;" : String(v).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }\n' +
    'function renderSigninBlock() {}\n' +
    'function permDbRowHtml() { return ""; }\n' +
    'function updatePermsRoleDesc() {}\n' +
    'function updateNuRoleDesc() {}\n' +
    'function closeNewUserModal() {}\n' +
    'function prodHeaders(ct) { return { "Content-Type": ct }; }\n' +
    'function extractAssignment() { return null; }\n' +
    'function toast(m) { __toasts.push(m); }\n' +
    'function showFetchError() {}\n' +
    'function renderUsers(rows) { __rendered.push(rows); }\n' +
    'function rrFetch() { return Promise.resolve(__rows); }\n' +
    'async function loadRolesV8() { _rolesCacheV8 = ' + JSON.stringify(ROLES) + '; return _rolesCacheV8; }\n' +
    fns + '\n',
    { filename: 'admin-users-slice' }).runInContext(ctx);
  return { ctx, els, el: getEl, calls, toasts, rendered };
}
const options = html => [...String(html).matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(m => ({
  value: (/value="([^"]*)"/.exec(m[1]) || [])[1],
  disabled: /\bdisabled\b/.test(m[1]),
  selected: /\bselected\b/.test(m[1]),
  text: m[2]
}));

async function openPerms(srcs, roleId) {
  const s = sandbox(srcs);
  s.ctx._rowsById.set('29', { id: 29, fullName: 'Pat Example', roleId: roleId });
  s.ctx.openPermsModal(29);
  for (let i = 0; i < 6; i++) await tick();
  return s;
}

const TESTS = {
  r1: async srcs => {
    const p = await openPerms(srcs, 2);
    const po = options(p.el('js-perms-role').innerHTML);
    const n = sandbox(srcs);
    n.ctx.openNewUserModal();
    for (let i = 0; i < 6; i++) await tick();
    const no = options(n.el('js-nu-role').innerHTML);
    return [
      ['R1 Role & access: no "no access" option', !/no access/i.test(p.el('js-perms-role').innerHTML), p.el('js-perms-role').innerHTML],
      ['R1 Role & access: no blank-valued option for a member with a role', po.every(o => o.value !== ''), JSON.stringify(po)],
      ['R1 Role & access: exactly the four roles', JSON.stringify(po.map(o => o.text)) === JSON.stringify(ROLES.map(r => r.name)), JSON.stringify(po)],
      ['R1 Role & access: the member\'s own role is selected', p.el('js-perms-role').value === '2', p.el('js-perms-role').value],
      ['R1 New Team Member: no "no access" option', !/no access/i.test(n.el('js-nu-role').innerHTML), n.el('js-nu-role').innerHTML],
      ['R1 New Team Member: no blank-valued option', no.every(o => o.value !== ''), JSON.stringify(no)]
    ];
  },
  r2: async srcs => {
    const p = await openPerms(srcs, null);
    const po = options(p.el('js-perms-role').innerHTML);
    const err = p.el('js-perms-error');
    return [
      ['R2 legacy null: the first option is a disabled, selected "Choose a role" placeholder',
        po.length > 0 && po[0].value === '' && po[0].disabled && po[0].selected && /choose a role/i.test(po[0].text), JSON.stringify(po[0])],
      ['R2 legacy null: the select does not claim a role', p.el('js-perms-role').value === '', p.el('js-perms-role').value],
      ['R2 legacy null: the placeholder is the ONLY blank option', po.filter(o => o.value === '').length === 1, JSON.stringify(po)],
      ['R2 legacy null: the modal says the member has no role', err._cls.has('is-visible') && /role/i.test(err.textContent), err.textContent]
    ];
  },
  r3: async srcs => {
    const p = await openPerms(srcs, null);
    p.calls.length = 0;
    const ok = await p.ctx.saveUserRights();
    const err = p.el('js-perms-error');
    return [
      ['R3 Done with no role chosen: refused', ok === false],
      ['R3 and no request is made', p.calls.length === 0, JSON.stringify(p.calls)],
      ['R3 and the modal shows why', err._cls.has('is-visible') && /choose a role/i.test(err.textContent), err.textContent]
    ];
  },
  r4: async srcs => {
    const n = sandbox(srcs);
    n.ctx.openNewUserModal();
    for (let i = 0; i < 6; i++) await tick();
    return [['R4 New Team Member defaults to the Analyst role', n.el('js-nu-role').value === '2', n.el('js-nu-role').value]];
  },
  r5: async srcs => {
    const s = sandbox(srcs, { answer: (p) => Promise.resolve(/\/role$/.test(p)
      ? json(400, { status: 400, error: 'Bad Request', message: BAD_ROLE }) : json(200, {})) });
    s.ctx._permsUserId = '29';
    s.el('js-perms-role').value = '2';
    const ok = await s.ctx.saveUserRights();
    const err = s.el('js-perms-error');
    return [
      ['R5 a 400 on the role PUT: refused', ok === false],
      ["R5 the modal shows VALC's sentence", err._cls.has('is-visible') && err.textContent.indexOf(BAD_ROLE) >= 0, err.textContent],
      ['R5 the rights call is not made', s.calls.length === 1, JSON.stringify(s.calls)]
    ];
  },
  r6: async srcs => {
    const rows = [
      { id: 1, fullName: 'A', roleName: 'Administrator' },
      { id: 2, fullName: 'B', roleName: 'Power User' },
      { id: 3, fullName: 'C', roleName: 'GSI Internal' }
    ];
    const s = sandbox(srcs, { rows });
    await s.ctx.reloadUsers();
    const got = (s.rendered[0] || []).map(r => r.id);
    return [['R6 the roster renders every row VALC returns (no roleName filter)', JSON.stringify(got) === '[1,2,3]', JSON.stringify(got)]];
  },
  r7: async srcs => {
    const s = sandbox(srcs);
    const byName = s.ctx.roleModules({ name: 'Power User' }).slice().sort();
    s.ctx.RR_SESSION.dbs[0].m = { inv: false, it: false, por: false, adm: true };
    const offered = s.ctx.offerableRoles(ROLES).map(r => r.name);
    return [
      ['R7 the name fallback maps Power User to all four modules', JSON.stringify(byName) === '["adm","inv","it","por"]', JSON.stringify(byName)],
      ['R7 with only the admin module licensed, Power User is still offered', offered.indexOf('Power User') >= 0, JSON.stringify(offered)]
    ];
  }
};

async function runAll(srcs) {
  const out = {};
  for (const k of Object.keys(TESTS)) {
    try { out[k] = await TESTS[k](srcs); } catch (e) { out[k] = [[k.toUpperCase() + ' threw: ' + e.message, false]]; }
  }
  return out;
}

const swap = (s, from, to) => {
  if (s.indexOf(from) < 0) throw new Error('mutation anchor not found: ' + from.slice(0, 60));
  return s.replace(from, to);
};
const MUTATIONS = [
  { name: 'the blank "no access" option is back in Role & access', red: 'r1',
    apply: s => ({ ...s, page: swap(s.page, "roleSel.innerHTML = placeholder +",
                                     "roleSel.innerHTML = '<option value=\"\">(no role &mdash; no access)</option>' + placeholder +") }) },
  { name: 'the Save gate is removed', red: 'r3',
    apply: s => ({ ...s, page: swap(s.page, "    if (roleId == null) {\n", "    if (false) {\n") }) },
  { name: 'the GSI Internal roster filter is back', red: 'r6',
    apply: s => ({ ...s, page: swap(s.page, '.then(rows => renderUsers(rows || []))',
                                     ".then(rows => renderUsers((rows || []).filter(r => !r || r.roleName !== 'GSI Internal')))") }) }
];

(async function main() {
  const srcs = { page: read('admin-users.html'), config: read('config.js'), sidebar: read('sidebar.js') };
  let pass = 0, fail = 0;
  console.log('test-role-select.js (VLC-214)');
  const results = await runAll(srcs);
  for (const k of Object.keys(results)) {
    for (const [what, ok, detail] of results[k]) {
      if (ok) { pass++; console.log('  PASS  ' + what); }
      else { fail++; console.log('  FAIL  ' + what + (detail ? '\n          ' + detail : '')); }
    }
  }
  for (const m of MUTATIONS) {
    let red;
    try { red = (await runAll(m.apply(srcs)))[m.red].some(([, ok]) => !ok); }
    catch (e) { fail++; console.log('  FAIL  MUTATION: ' + m.name + ' -- ' + e.message); continue; }
    if (red) { pass++; console.log('  PASS  MUTATION: ' + m.name + ' -> ' + m.red.toUpperCase() + ' goes red'); }
    else { fail++; console.log('  FAIL  MUTATION: ' + m.name + ' -> ' + m.red.toUpperCase() + ' stayed green'); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
