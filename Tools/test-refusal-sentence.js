/*
 * test-refusal-sentence.js  --  UI-212
 *
 * WHAT THIS GUARDS
 * ----------------
 * VALC answers every refusal on /api/v1/tenant/** with {status, error, message}
 * (VLC-169, Valc #439), and the data service puts its own reason in `reason`. Before
 * UI-212 most V8 pages read neither: Home's rrFetch read only `reason`, admin-users,
 * admin-companies and inventory-transactions never read the body, and every one of
 * them put the full request URL in the Error's message. So a customer read
 * "HTTP 403 on https://.../api/v1/tenant/..." and Home's Restart toast showed exactly
 * that string, URL included.
 *
 *   R1  THE READER. RRDB.responseError (config.js), the one reader of a failed
 *       response's body, prefers the agent's `reason`, then VALC's `message`, ignores
 *       the bare status word in `error`, keeps the request id, and never puts the URL
 *       in the message (it goes to the console instead).
 *   R2  THE SINK. RRV8.fetchErrorMessage (sidebar.js) shows the server's sentence,
 *       still ends with "Reference: <id>", and with no sentence falls back to plain
 *       language per status with no URL.
 *   R3  THE FOUR PAGES. Each page's own rrFetch, run against a stub fetch that answers
 *       a VALC tenant refusal, rejects with the sentence in err.message, and the sink
 *       shows it. A 500 with no body gives the fallback, and neither text has a URL.
 *       Home, admin-users, admin-companies, inventory-transactions.
 *   R4  HOME'S RESTART. restartService() itself, with Home's real rrFetch and the real
 *       sink, toasts VALC's sentence for a failed and a refused restart.
 *   R5  EVERY COPY. Every rrFetch copy on every page reads its error through
 *       RRDB.responseError, so no page builds "HTTP <status> on <url>" again.
 *
 * Nothing is retyped: every function is sliced out of the shipped files by anchors
 * that THROW when they move. Run against the code before UI-212, R1 to R5 are red.
 *
 * MUTATIONS (end of file) re-inject each defect, one at a time, and require the named
 * section to go red.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const V8DIR = path.join(__dirname, '..', 'RRV8');
const read = f => fs.readFileSync(path.join(V8DIR, f), 'utf8').replace(/\r\n/g, '\n');

/* The function whose header starts at `at`, by brace matching that skips string
 * literals and // comments. Same matcher as test-request-id.js. */
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
/* From `startAnchor` to the end of the function named by `fnAnchor`. */
function sliceTo(src, startAnchor, fnAnchor, label) {
  const start = src.indexOf(startAnchor);
  const fn = src.indexOf(fnAnchor, start);
  if (start < 0 || fn < 0) throw new Error('cannot slice ' + label + ' (start=' + start + ', fn=' + fn + ') -- the anchors moved');
  const body = functionBody(src, fn, label);
  return src.slice(start, fn) + body;
}

const SINK = sidebar => {
  const start = sidebar.indexOf('  function _fetchTargetHost(area) {');
  const tailAnchor = "    return raw || 'The request failed and reported no reason.';";
  const tail = sidebar.indexOf(tailAnchor);
  if (start < 0 || tail < start) throw new Error('cannot slice sidebar.js fetchErrorMessage -- the anchors moved');
  return sidebar.slice(start, sidebar.indexOf('\n  }', tail) + 4);
};
const READER = config => functionBody(config, config.indexOf('  function responseError(r, url) {'), 'config.js responseError');

const VALC = 'https://valc.example.com';
const AGENT = 'https://rr.example.com:39911';
const VALC_PREFIXES = ['api/v1/tenant/', 'api/v1/admin/', 'api/v1/ai/', 'api/v1/messages'];

/* One context holding the real reader and the real sink, plus whatever page code
 * `extra` adds. fetch answers from `answer(url, init)`. */
function makeContext(srcs, answer, extra) {
  const warned = [];
  const toasts = [];
  const ctx = vm.createContext({
    URL, URLSearchParams, Promise, Error, TypeError, SyntaxError, JSON, Response, Headers, Set, String,
    console: { warn: (...a) => warned.push(a.join(' ')), log() {}, error() {} },
    localStorage: { getItem: () => 'tok', setItem() {} },
    requestAnimationFrame: f => f(), setTimeout: () => 0,
    fetch: (url, init) => Promise.resolve(answer(String(url), init || {})),
    __toasts: toasts
  });
  ctx.window = ctx;
  ctx.RR_VALC_PREFIXES = VALC_PREFIXES;
  ctx.RR_TEST_AGENT_AREAS = [];
  ctx.RR_TEST_AGENT_PREFIXES = [];
  ctx.RR_SESSION = { dbs: [{ n: 'RapidReconciler_Demo1', ip: 'rr.example.com:39911' }], activeDbIndex: 0 };
  // A tree without the reader (the code before UI-212) still runs R2 to R4, so they
  // go red on what the pages DO, not on the reader being absent. R1 and R5 say so.
  let reader = '';
  try { reader = 'RRDB.responseError = (function () {\n' + READER(srcs.config) + '\n  return responseError;\n})();\n'; } catch (_) {}
  new vm.Script(
    'var RRDB = { valcBase: function () { return ' + JSON.stringify(VALC) + '; },\n' +
    '             agentBase: function () { return ' + JSON.stringify(AGENT) + '; },\n' +
    '             valcGap: function (a) { return new Error("no valc for " + a); } };\n' +
    reader +
    'var RRV8 = (function (global) {\n' + SINK(srcs.sidebar) + '\n  return { fetchErrorMessage: fetchErrorMessage };\n})(window);\n',
    { filename: 'shared-slice' }).runInContext(ctx);
  if (extra) new vm.Script(extra, { filename: 'page-slice' }).runInContext(ctx);
  return { ctx, warned, toasts };
}

const json = (status, body, rid) => new Response(body == null ? '' : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json', ...(rid ? { 'X-Request-Id': rid } : {}) } });

const REFUSED = { status: 403, error: 'Forbidden', message: 'That database is not on your account.' };
const HAS_URL = /https?:\/\/|example\.com|\/api\/v1\//;

// ------------------------------------------------------------------ sections
async function r1(srcs) {
  const { ctx, warned } = makeContext(srcs, () => null);
  if (typeof ctx.RRDB.responseError !== 'function') return 'config.js has no RRDB.responseError';
  const rd =(resp, url) => ctx.RRDB.responseError(resp, url || VALC + '/api/v1/tenant/license-usage?database=NotMine');

  let e = await rd(json(403, REFUSED, 'rid-1'));
  if (e.message !== REFUSED.message) return 'a VALC refusal did not put its message in err.message: ' + e.message;
  if (e.status !== 403 || e.requestId !== 'rid-1') return 'status/requestId lost: ' + JSON.stringify({ s: e.status, r: e.requestId });
  if (!warned.some(w => w.indexOf('/api/v1/tenant/license-usage') >= 0)) return 'the URL did not reach the console';

  e = await rd(json(502, { started: false, reason: 'SQLServerAgent is not currently running', message: 'other' }), AGENT + '/jobs/start');
  if (e.message !== 'SQLServerAgent is not currently running') return 'the agent reason did not win over message: ' + e.message;

  e = await rd(json(403, { timestamp: 'x', status: 403, error: 'Forbidden', path: '/p' }));
  if (e.message !== 'HTTP 403') return 'the status word in `error` was taken as a sentence: ' + e.message;

  e = await rd(new Response('', { status: 500 }));
  if (e.message !== 'HTTP 500' || e.requestId !== null) return 'a 500 with no body: ' + JSON.stringify({ m: e.message, r: e.requestId });

  e = await rd(new Response('<html>Bad gateway</html>', { status: 502 }));
  if (e.message !== 'HTTP 502') return 'an HTML body became the message: ' + e.message;
  return null;
}

async function r2(srcs) {
  const { ctx } = makeContext(srcs, () => null);
  const fem = ctx.RRV8.fetchErrorMessage;
  const err = (msg, st, extra) => Object.assign(new Error(msg), { status: st }, extra || {});

  let out = fem('api/v1/tenant/license-usage', err(REFUSED.message, 403, { serverMessage: REFUSED.message, serverField: 'message', requestId: 'rid-2' }));
  if (out.indexOf(REFUSED.message) !== 0) return 'a 403 sentence did not lead the text: ' + out;
  if (!/ Reference: rid-2\.$/.test(out)) return 'the reference was lost: ' + out;

  out = fem('api/v1/tenant/services/restart', err('The report engine didn\'t restart. Contact RR support.', 502,
    { serverMessage: 'The report engine didn\'t restart. Contact RR support.', serverField: 'message' }));
  if (out.indexOf('The report engine didn\'t restart. Contact RR support.') !== 0 || /service log/.test(out)) return 'a VALC 5xx sentence was wrapped: ' + out;

  out = fem('jobs/start', err('SQLServerAgent is not currently running', 502, { serverMessage: 'SQLServerAgent is not currently running', serverField: 'reason' }));
  if (out.indexOf('SQLServerAgent is not currently running') < 0) return 'the agent 5xx reason was lost: ' + out;

  for (const [area, st] of [['api/v1/tenant/users', 500], ['inventory/as-of', 500], ['api/v1/tenant/client/access-reviews', 400], ['api/v1/tenant/users', 409]]) {
    out = fem(area, err('HTTP ' + st, st));
    if (HAS_URL.test(out) || out.indexOf(area) >= 0) return 'the ' + st + ' fallback on ' + area + ' names the endpoint: ' + out;
    if (!/\(HTTP \d{3}\)$/.test(out) || out.length < 40) return 'the ' + st + ' fallback is not a sentence: ' + out;
  }
  // The VALC 5xx fallback must not send the customer to the database server's log.
  out = fem('api/v1/tenant/users', err('HTTP 500', 500));
  if (/service log on this database/.test(out)) return 'a VALC 500 sends the reader to the data service log: ' + out;
  return null;
}

const PAGES = {
  'home.html': { start: '  var _valcPrefixes      = window.RR_VALC_PREFIXES || [];', fn: '  function rrFetch(area, opts) {',
                 pre: 'function _noteFetchFailure() {}\n' },
  'admin-users.html': { start: '  const _testAgentAreas    = new Set(window.RR_TEST_AGENT_AREAS || []);', fn: '  function rrFetch(area, opts) {' },
  'admin-companies.html': { start: '  const _testAgentAreas    = new Set(window.RR_TEST_AGENT_AREAS || []);', fn: '  function rrFetch(area, opts) {' },
  'inventory-transactions.html': { start: '  function prodHeaders(contentType) {', fn: '  function rrFetch(area, opts) {' }
};

async function r3(srcs) {
  for (const [f, a] of Object.entries(PAGES)) {
    const code = (a.pre || '') + sliceTo(srcs.pages[f], a.start, a.fn, f + ' rrFetch') + '\nglobalThis.__rr = rrFetch;';
    const { ctx } = makeContext(srcs, url => (url.indexOf('/api/v1/tenant/') >= 0 ? json(403, REFUSED, 'rid-3') : new Response('', { status: 500 })), code);
    const fem = ctx.RRV8.fetchErrorMessage;

    const e1 = await ctx.__rr('api/v1/tenant/license-usage', { query: { database: 'NotMine' } }).then(() => null, e => e);
    if (!e1) return f + ': a 403 resolved';
    if (e1.message !== REFUSED.message) return f + ': err.message is not VALC\'s sentence: ' + e1.message;
    const t1 = fem('api/v1/tenant/license-usage', e1);
    if (t1.indexOf(REFUSED.message) !== 0 || HAS_URL.test(t1) || !/Reference: rid-3\.$/.test(t1)) return f + ': the sink text is wrong: ' + t1;

    const e2 = await ctx.__rr('inventory/as-of').then(() => null, e => e);
    if (!e2) return f + ': a 500 resolved';
    if (HAS_URL.test(e2.message)) return f + ': a 500 put the URL in err.message: ' + e2.message;
    const t2 = fem('inventory/as-of', e2);
    if (HAS_URL.test(t2) || !/\(HTTP 500\)$/.test(t2)) return f + ': the 500 fallback is wrong: ' + t2;
  }
  return null;
}

async function r4(srcs) {
  const home = srcs.pages['home.html'];
  const p = PAGES['home.html'];
  const restartAt = home.indexOf('  function restartService() {');
  const stateAt = home.lastIndexOf('  var _restarting = false;', restartAt);
  if (stateAt < 0 || restartAt - stateAt > 200) throw new Error('cannot find Home\'s restart state -- the anchor moved');
  const code = p.pre + sliceTo(home, p.start, p.fn, 'home rrFetch') + '\n' +
    'function $() { return null; }\nfunction activeDb() { return { n: "RapidReconciler_Demo1" }; }\n' +
    'function toast(m) { __toasts.push(m); }\nfunction showRestartProgress() {}\nfunction finishRestartProgress() {}\n' +
    'function loadServiceMemory() {}\nfunction updateServiceCard() {}\nfunction loadActivityFeed() {}\nfunction setMemMeter() {}\nvar _svcMem = null;\n' +
    'RRV8.setDotState = function () {};\n' +
    home.slice(stateAt, restartAt) + functionBody(home, restartAt, 'home restartService') + '\n' +
    // Home's own helper for the toast text, when it has one (the code before UI-212 did not).
    (home.indexOf('  function _restartErrText(err) {') >= 0
      ? functionBody(home, home.indexOf('  function _restartErrText(err) {'), 'home _restartErrText') : '') +
    '\nglobalThis.__restart = restartService;';
  const cases = [
    [json(502, { status: 502, error: 'Bad Gateway', message: 'The report engine didn\'t restart. Contact RR support.' }, 'rid-4'),
     'The report engine didn\'t restart. Contact RR support.'],
    [json(403, { status: 403, error: 'Forbidden', message: 'You don\'t have permission to restart the data service.' }),
     'You don\'t have permission to restart the data service.']
  ];
  for (const [resp, want] of cases) {
    const { ctx, toasts } = makeContext(srcs, () => resp, code);
    ctx.__restart();
    for (let i = 0; i < 20 && !toasts.length; i++) await new Promise(r => setImmediate(r));
    const t = toasts[0] || '';
    if (t.indexOf(want) !== 0) return 'the Restart toast is not VALC\'s sentence: ' + JSON.stringify(t);
    if (HAS_URL.test(t)) return 'the Restart toast carries the URL: ' + t;
    if (resp.headers.get('X-Request-Id') && !/Reference: rid-4\.$/.test(t)) return 'the Restart toast lost its reference: ' + t;
  }
  return null;
}

function r5(srcs) {
  const bad = [];
  let copies = 0;
  for (const [f, src] of Object.entries(srcs.pages)) {
    const rx = /function (rrFetch\w*|valcFetch)\(/g;
    let m;
    while ((m = rx.exec(src))) {
      copies++;
      const body = functionBody(src, m.index, f + ' ' + m[1]);
      const line = src.slice(0, m.index).split('\n').length;
      if (!/RRDB\.responseError\(r, /.test(body)) bad.push(f + ':' + line + ' does not read through RRDB.responseError');
      if (/new Error\(\s*'HTTP '/.test(body) || /' on ' \+ (url|area)/.test(body)) bad.push(f + ':' + line + ' still builds its own HTTP message');
    }
  }
  if (copies < 20) return 'found ' + copies + ' copies, expected at least 20 (did the scan break?)';
  return bad.length ? bad.join('; ') : null;
}

async function runAll(srcs) {
  const out = {};
  for (const [name, fn] of Object.entries({ r1, r2, r3, r4, r5 })) {
    try { out[name] = await fn(srcs); } catch (e) { out[name] = 'threw: ' + e.message; }
  }
  return out;
}

function shipped() {
  const pages = {};
  for (const f of fs.readdirSync(V8DIR).filter(f => f.endsWith('.html'))) pages[f] = read(f);
  return { sidebar: read('sidebar.js'), config: read('config.js'), pages };
}

function swap(src, find, repl) {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + find);
  return src.replace(find, repl);
}

const MUTATIONS = [
  { name: 'the reader ignores VALC\'s message', red: ['r1', 'r3', 'r4'],
    apply: s => { s.config = swap(s.config, "else if (typeof j.message === 'string'", "else if (false && typeof j.message === 'string'"); } },
  // Not R4: the Restart toast is the sink's text, which leads with serverMessage, so a
  // URL in err.message never reaches it. R3 sees it, because pages also show err.message.
  { name: 'the reader puts the URL back in the message', red: ['r1', 'r3'],
    apply: s => { s.config = swap(s.config, "var e = new Error(said || ('HTTP ' + st));", "var e = new Error((said || ('HTTP ' + st)) + ' on ' + url);"); } },
  { name: 'the sink drops the server sentence', red: ['r2', 'r3', 'r4'],
    apply: s => { s.sidebar = swap(s.sidebar, 'if (said && st !== null', 'if (false && said && st !== null'); } },
  { name: 'Home\'s Restart toasts the raw message', red: ['r4'],
    apply: s => { s.pages['home.html'] = swap(s.pages['home.html'], 'var msg = _restartErrText(err);', 'var msg = String(err && err.message || err) + " on " + "https://valc.example.com/x";'); } },
  { name: 'admin-users builds its own message again', red: ['r3', 'r5'],
    apply: s => { s.pages['admin-users.html'] = swap(s.pages['admin-users.html'],
      "if (!r.ok) return window.RRDB.responseError(r, url).then(e => { throw e; });",
      "if (!r.ok) { const e = new Error('HTTP ' + r.status + ' on ' + url); e.status = r.status; e.requestId = r.headers && r.headers.get('X-Request-Id'); throw e; }"); } }
];

(async function main() {
  let failed = 0;
  const base = await runAll(shipped());
  for (const [k, why] of Object.entries(base)) {
    if (why) { failed++; console.log('FAIL  ' + k + ': ' + why); } else console.log('ok    ' + k);
  }
  for (const m of MUTATIONS) {
    let res;
    try { const s = shipped(); m.apply(s); res = await runAll(s); }
    catch (e) { failed++; console.log('FAIL  mutation "' + m.name + '": ' + e.message); continue; }
    const reds = Object.keys(res).filter(k => res[k]);
    const ok = m.red.every(k => reds.includes(k)) && reds.every(k => m.red.includes(k));
    if (!ok) { failed++; console.log('FAIL  mutation "' + m.name + '": expected red ' + JSON.stringify(m.red) + ', got ' + JSON.stringify(reds)); }
    else console.log('ok    mutation "' + m.name + '" caught by ' + m.red.join(', '));
  }
  console.log(failed ? '\n' + failed + ' failure(s)' : '\nall passed');
  process.exit(failed ? 1 : 0);
})();
