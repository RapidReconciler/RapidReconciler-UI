/*
 * test-team-role-save.js  --  VLC-169 (Team page), found live 2026-10-20
 *
 * WHAT THIS GUARDS
 * ----------------
 * The owner changed a team member from Administrator to Analyst on V8 > Team. VALC saved
 * it (valc.out.log: "Role set user=29 role=2", twice), but the page "did not change and
 * there was no message": saveUserRights() never re-read the roster, so the row kept the
 * old role until a page reload, and the only feedback was a 2.4 s toast. The same
 * function turned a refusal into 'role HTTP 409', dropping the sentence VALC sends
 * (VLC-169's whole point: "You cannot remove your own administrator role..."). UI-212's
 * R5 checks every rrFetch copy, and this call goes through RRDB.valcFetch, so it slipped.
 *
 *   T1  A REFUSAL SHOWS VALC'S SENTENCE. A 409 with VALC's {status, error, message} body
 *       puts that sentence in the dialog's error line, with no status-code-only text and
 *       no URL, and does not reload the roster or toast success.
 *   T2  A SAVE RELOADS THE ROSTER. Two 200s toast "Saved team member rights" and call
 *       reloadUsers() once, so the row shows the new role.
 *   T3  A BODYLESS FAILURE still reads in plain language, with no URL.
 *
 * Nothing is retyped: saveUserRights and fetchErrText are sliced out of the shipped
 * admin-users.html, the reader (RRDB.responseError) out of config.js and the sink
 * (RRV8.fetchErrorMessage) out of sidebar.js, by anchors that THROW when they move.
 *
 * MUTATIONS (end of file) re-inject each defect, one at a time, and require the named
 * test to go red.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V8DIR = path.join(__dirname, '..', 'RRV8');
const read = f => fs.readFileSync(path.join(V8DIR, f), 'utf8').replace(/\r\n/g, '\n');

/* The function whose header starts at `at`, by brace matching that skips string
 * literals and // comments. Same matcher as test-refusal-sentence.js. */
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
const SINK = sidebar => {
  const start = sidebar.indexOf('  function _fetchTargetHost(area) {');
  const tailAnchor = "    return raw || 'The request failed and reported no reason.';";
  const tail = sidebar.indexOf(tailAnchor);
  if (start < 0 || tail < start) throw new Error('cannot slice sidebar.js fetchErrorMessage -- the anchors moved');
  return sidebar.slice(start, sidebar.indexOf('\n  }', tail) + 4);
};
const READER = config => functionBody(config, config.indexOf('  function responseError(r, url) {'), 'config.js responseError');
const SAVE = page => functionBody(page, page.indexOf('  async function saveUserRights() {'), 'admin-users.html saveUserRights');
const ERRTEXT = page => functionBody(page, page.indexOf('  function fetchErrText(area, err) {'), 'admin-users.html fetchErrText');

const VALC = 'https://valc.example.com';
const SELF = 'You cannot remove your own administrator role. Ask another administrator on your account to do it.';
const HAS_URL = /https?:\/\/|example\.com|\/api\/v1\//;

const json = (status, body) => new Response(body == null ? '' : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } });

/* Runs the shipped saveUserRights once. `answers` maps 'role' / 'assignments' to a Response. */
async function runSave(srcs, answers) {
  const calls = [], toasts = [], reloads = [];
  const errEl = { textContent: '', classList: { add() { errEl.visible = true; } }, visible: false };
  const ctx = vm.createContext({
    URL, Promise, Error, TypeError, JSON, Response, Headers, Number, String,
    console: { warn() {}, log() {}, error() {} },
    document: {
      getElementById: id => id === 'js-perms-role' ? { value: '2' } : id === 'js-perms-error' ? errEl : null,
      querySelectorAll: () => []
    }
  });
  ctx.window = ctx;
  new vm.Script(
    'var RRDB = { valcFetch: function (p, init) { return __answer(p, init); } };\n' +
    'RRDB.responseError = (function () {\n' + READER(srcs.config) + '\n  return responseError;\n})();\n' +
    'var RRV8 = (function (global) {\n' + SINK(srcs.sidebar) + '\n  return { fetchErrorMessage: fetchErrorMessage };\n})(window);\n' +
    'var _permsUserId = 29;\n' +
    'function prodHeaders(ct) { return { "Content-Type": ct }; }\n' +
    'function extractAssignment() { return null; }\n' +
    'function toast(m) { __toasts.push(m); }\n' +
    'function reloadUsers() { __reloads.push(1); return Promise.resolve(); }\n' +
    ERRTEXT(srcs.page) + '\n' + SAVE(srcs.page) + '\n',
    { filename: 'team-slice' }).runInContext(Object.assign(ctx, {
      __toasts: toasts, __reloads: reloads,
      __answer: (p, init) => {
        calls.push(p);
        const key = /\/role$/.test(p) ? 'role' : 'assignments';
        return Promise.resolve(answers[key] ? answers[key]() : json(200, {}));
      }
    }));
  const ok = await ctx.saveUserRights();
  return { ok, calls, toasts, reloads, error: errEl.visible ? errEl.textContent : '' };
}

const TESTS = {
  t1: async srcs => {
    const r = await runSave(srcs, { role: () => json(409, { status: 409, error: 'Conflict', message: SELF }) });
    return [
      ['T1 the save reports failure', r.ok === false],
      ["T1 the dialog shows VALC's sentence", r.error.indexOf(SELF) >= 0, r.error],
      ['T1 not a bare status code', !/role HTTP/.test(r.error), r.error],
      ['T1 no URL in the text', !HAS_URL.test(r.error), r.error],
      ['T1 the rights call is not made after a refused role', r.calls.length === 1, JSON.stringify(r.calls)],
      ['T1 no success toast, no reload', r.toasts.length === 0 && r.reloads.length === 0]
    ];
  },
  t2: async srcs => {
    const r = await runSave(srcs, {});
    return [
      ['T2 the save reports success', r.ok === true, r.error],
      ['T2 it says so', r.toasts.indexOf('Saved team member rights') >= 0, JSON.stringify(r.toasts)],
      ['T2 it re-reads the roster once, so the row shows the new role', r.reloads.length === 1, String(r.reloads.length)]
    ];
  },
  t3: async srcs => {
    const r = await runSave(srcs, { assignments: () => new Response('', { status: 500 }) });
    return [
      ['T3 a bodyless failure is reported', r.ok === false && r.error.length > 'Save failed — '.length, r.error],
      ['T3 with no URL', !HAS_URL.test(r.error), r.error],
      ['T3 and no reload', r.reloads.length === 0]
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
  { name: 'the refusal is a status code again', red: 't1',
    apply: s => ({ ...s, page: swap(s.page, "throw await window.RRDB.responseError(r1, userPath + '/role');",
                                     "throw new Error('role HTTP ' + r1.status);") }) },
  { name: 'the roster is not re-read after a save', red: 't2',
    apply: s => ({ ...s, page: swap(s.page, '      reloadUsers();\n      return true;', '      return true;') }) }
];

(async function main() {
  const srcs = { page: read('admin-users.html'), config: read('config.js'), sidebar: read('sidebar.js') };
  let pass = 0, fail = 0;
  const results = await runAll(srcs);
  for (const k of Object.keys(results)) {
    for (const [what, ok, detail] of results[k]) {
      if (ok) { pass++; console.log('  PASS  ' + what); }
      else { fail++; console.log('  FAIL  ' + what + (detail ? '\n          ' + detail : '')); }
    }
  }
  for (const m of MUTATIONS) {
    const res = await runAll(m.apply(srcs));
    const red = res[m.red].some(([, ok]) => !ok);
    if (red) { pass++; console.log('  PASS  MUTATION: ' + m.name + ' -> ' + m.red.toUpperCase() + ' goes red'); }
    else { fail++; console.log('  FAIL  MUTATION: ' + m.name + ' -> ' + m.red.toUpperCase() + ' stayed green'); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
