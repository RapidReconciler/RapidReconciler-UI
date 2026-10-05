/*
 * test-request-id.js  --  UI-210
 *
 * WHAT THIS GUARDS
 * ----------------
 * The data service stamps every response with an X-Request-Id and logs every line of
 * that request under the same id (RapidReconciler-Agent RequestIdFilter). V8's job is
 * to put that id in front of the reader when something fails, so their IT department
 * can find the request in the service log. Three things must hold:
 *
 *   S1  THE SINK. RRV8.fetchErrorMessage (sidebar.js) ends the message with
 *       "Reference: <id>" when the Error carries `requestId`, leaves it unchanged when
 *       it does not (an older service), and refuses an id that is not a plain token,
 *       because some pages put this text into innerHTML.
 *   S2  EVERY PRODUCER. Each page carries its own rrFetch copy (19 of them, plus
 *       config.js's _failGatedWrite). One copy that forgets the stamp is a page whose
 *       errors never show a reference, and nothing on screen says so.
 *   S3  ONE REAL CALL. admin-troubleshooting.html's own rrFetch, run against a stub
 *       fetch, rejects with `requestId` set from the response header.
 *
 * HOW
 * ---
 * Nothing is retyped. fetchErrorMessage and the page's rrFetch are sliced out of the
 * shipped files by anchors that THROW when they move. S2 brace-matches each
 * `function rrFetch(` body out of its page.
 *
 * MUTATIONS (section 4) re-inject each defect and require the named section to go red.
 *
 * BLIND SPOTS, named: S2 is textual for the 18 pages S3 does not run; it proves each
 * copy reads the header, not that each page displays the result through the sink.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const V8DIR = path.join(ROOT, 'RRV8');
// Line endings normalised: the pages are checked out CRLF on Windows and LF in CI.
const read = f => fs.readFileSync(path.join(V8DIR, f), 'utf8').replace(/\r\n/g, '\n');

function sliceBetween(src, startAnchor, tailAnchor, endAfter, label) {
  const start = src.indexOf(startAnchor);
  const tail = src.indexOf(tailAnchor);
  if (start < 0 || tail < 0 || tail <= start) {
    throw new Error('cannot slice ' + label + ' (start=' + start + ', tail=' + tail + ') -- the anchors moved');
  }
  const close = src.indexOf(endAfter, tail);
  if (close < 0) throw new Error('cannot find the end of ' + label);
  return src.slice(start, close + endAfter.length);
}

/* The body of the function whose header starts at `at`, by brace matching that skips
 * string literals and // comments. Throws if it never closes. */
function functionBody(src, at, label) {
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

const SINK = (sidebar) => sliceBetween(sidebar, '  function _fetchTargetHost(area) {',
  "    return raw || 'The request failed and reported no reason.';", '\n  }', 'sidebar.js fetchErrorMessage');

function loadSink(sidebar) {
  const ctx = vm.createContext({ window: {}, URL });
  new vm.Script('var __x = (function (global) {\n' + SINK(sidebar) + '\n  return fetchErrorMessage;\n})(window); globalThis.fem = __x;',
    { filename: 'sidebar.js-slice' }).runInContext(ctx);
  return ctx.fem;
}

// ------------------------------------------------------------------ sections
function s1(srcs) {
  const fem = loadSink(srcs.sidebar);
  const e500 = Object.assign(new Error('HTTP 500'), { status: 500, requestId: 'a1b2c3d4e5f6' });
  const out = fem('inventory/as-of', e500);
  if (!/ Reference: a1b2c3d4e5f6\.$/.test(out)) return 'a 500 with an id does not end with its reference: ' + out;
  const old = Object.assign(new Error('HTTP 500'), { status: 500 });
  if (/Reference/.test(fem('inventory/as-of', old))) return 'an error with no id still shows a reference';
  const nul = Object.assign(new Error('HTTP 500'), { status: 500, requestId: null });
  if (/Reference/.test(fem('inventory/as-of', nul))) return 'a null id (an older service) shows a reference';
  const bad = Object.assign(new Error('HTTP 500'), { status: 500, requestId: '<img src=x onerror=alert(1)>' });
  if (/Reference|<img/.test(fem('inventory/as-of', bad))) return 'an id that is not a plain token reached the message';
  const net = new TypeError('Failed to fetch');
  if (/Reference/.test(fem('inventory/as-of', net))) return 'a network failure invented a reference';
  return null;
}

function s2(srcs) {
  const missing = [];
  let copies = 0;
  for (const [f, src] of Object.entries(srcs.pages)) {
    // rrFetch and its variants (inventory-transactions.html also has rrFetchBinary).
    const rx = /function rrFetch\w*\(/g;
    let m;
    while ((m = rx.exec(src))) {
      copies++;
      const body = functionBody(src, m.index, f + ' rrFetch');
      // UI-212: a copy may read the header itself or hand the response to the shared
      // reader, RRDB.responseError, which reads it (asserted on the reader below).
      if (!/r\.headers\s*&&\s*r\.headers\.get\('X-Request-Id'\)/.test(body) &&
          !/RRDB\.responseError\(r, /.test(body)) missing.push(f + ':' + src.slice(0, m.index).split('\n').length);
    }
  }
  // 18 pages, 19 functions on 2026-10-05. A floor, so a page added later still counts.
  if (copies < 19) return 'found ' + copies + ' rrFetch copies, expected at least 19 (did the scan break?)';
  if (missing.length) return 'rrFetch copies that never read X-Request-Id: ' + missing.join(', ');
  const reader = functionBody(srcs.config, srcs.config.indexOf('  function responseError(r, url) {'), 'config.js responseError');
  if (!/r\.headers\.get\('X-Request-Id'\)/.test(reader) || !/e\.requestId = rid/.test(reader)) return 'config.js RRDB.responseError does not carry the request id';
  const gated = functionBody(srcs.config, srcs.config.indexOf('window.RRV8._failGatedWrite = function'), 'config.js _failGatedWrite');
  if (!/X-Request-Id|RRDB\.responseError\(r, /.test(gated)) return 'config.js _failGatedWrite does not carry the request id';
  return null;
}

function s3(srcs) {
  const page = srcs.pages['admin-troubleshooting.html'];
  const slice = sliceBetween(page, '  const _testAgentAreas    = new Set(', '  function rrFetch(area, opts) {', '\n  }\n', 'admin-troubleshooting rrFetch');
  const ctx = vm.createContext({
    URLSearchParams, Promise, Error,
    localStorage: { getItem: () => 'tok' },
    window: { RR_TEST_AGENT_AREAS: [], RR_TEST_AGENT_PREFIXES: [], RR_VALC_PREFIXES: [],
              RR_SESSION: { dbs: [{ ip: 'localhost:39911' }], activeDbIndex: 0 },
              RRDB: { agentBase: () => 'http://localhost:39911', valcBase: () => '' } },
    console: { warn() {} },
    fetch: () => Promise.resolve({ ok: false, status: 500, headers: { get: h => (h === 'X-Request-Id' ? 'rid-s3' : null) },
                                   json: () => Promise.resolve({ status: 500 }),
                                   text: () => Promise.resolve('{"status":500}') })
  });
  // UI-212: the page reads its error through config.js's RRDB.responseError, so the
  // real reader is loaded into the stub RRDB rather than retyped.
  const at = srcs.config.indexOf('  function responseError(r, url) {');
  if (at >= 0) {
    new vm.Script('window.RRDB.responseError = (function () {\n' + functionBody(srcs.config, at, 'config.js responseError') +
      '\n  return responseError;\n})();', { filename: 'config.js-slice' }).runInContext(ctx);
  }
  new vm.Script(slice + '\nglobalThis.__rr = rrFetch;', { filename: 'admin-troubleshooting-slice' }).runInContext(ctx);
  return ctx.__rr('admin/troubleshooting').then(
    () => 'a 500 resolved',
    e => (e && e.status === 500 && e.requestId === 'rid-s3') ? null : 'rejected without the id: ' + JSON.stringify({ status: e && e.status, requestId: e && e.requestId }));
}

async function runAll(srcs) {
  const out = {};
  for (const [name, fn] of Object.entries({ s1, s2, s3 })) {
    try { out[name] = await fn(srcs); } catch (e) { out[name] = 'threw: ' + e.message; }
  }
  return out;
}

function shipped() {
  const pages = {};
  for (const f of fs.readdirSync(V8DIR).filter(f => f.endsWith('.html'))) pages[f] = read(f);
  return { sidebar: read('sidebar.js'), config: read('config.js'), pages };
}

const MUTATIONS = [
  { name: 'the sink drops the reference', red: ['s1'],
    apply: s => { s.sidebar = swap(s.sidebar, "? msg + ' Reference: ' + rid + '.' : msg", '? msg : msg'); } },
  { name: 'the sink skips the token check', red: ['s1'],
    apply: s => { s.sidebar = swap(s.sidebar, '(rid && _REQUEST_ID_RX.test(rid))', '(rid)'); } },
  // UI-212: the pages hand a failed response to config.js's RRDB.responseError, which
  // stamps the id, so "a page forgets the stamp" is now a page that builds its own Error.
  { name: 'one page forgets the stamp', red: ['s2'],
    apply: s => { s.pages['admin-reload-gl.html'] = swap(s.pages['admin-reload-gl.html'],
      'if (!r.ok) throw await window.RRDB.responseError(r, url);',
      "if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }"); } },
  { name: 'the shared reader forgets the stamp', red: ['s2', 's3'],
    apply: s => { s.config = swap(s.config, '      e.requestId = rid;\n', ''); } },
  // Only S3 sees this one: the page also reads the header for its foot, which satisfies
  // S2's textual match. That is exactly the gap S3 exists to close.
  { name: 'the troubleshooting page forgets the stamp', red: ['s3'],
    apply: s => { s.pages['admin-troubleshooting.html'] = swap(s.pages['admin-troubleshooting.html'],
      'if (!r.ok) throw await window.RRDB.responseError(r, url);',
      "if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }"); } }
];

function swap(src, find, repl) {
  const n = src.split(find).length - 1;
  if (n !== 1) throw new Error('mutation anchor found ' + n + ' times: ' + find);
  return src.replace(find, repl);
}

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
