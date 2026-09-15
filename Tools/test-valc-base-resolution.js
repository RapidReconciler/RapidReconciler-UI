/*
 * test-valc-base-resolution.js  --  UI-171 (the valcBase half)
 *
 * WHAT THIS GUARDS
 * ----------------
 * Until 2026-09-15 there was NO VALC resolver. `RRDB.valcBase()` did not
 * exist, and the expression
 *
 *     RR_CONFIG.valcBase || 'http://localhost:8080'
 *
 * was hand-rolled at 24 call sites across 17 files under RRV8/ -- measured
 * with `git ls-files '*.html' '*.js' | xargs grep -n "RR_CONFIG\.valcBase"`,
 * which returned 28 occurrences of which 2 were config.js comments and 2 were
 * Tools/test-*.js. Three defects, and only the third is the one that ships:
 *
 *   1. TWENTY-FOUR PRODUCERS of one routing decision. Drift between them is
 *      not hypothetical -- sidebar.js's copy already differed (`|| ''`).
 *   2. A DIRECT RR_CONFIG READ at every one of them, so a value supplied only
 *      by RR_ENVIRONMENTS[mode] was invisible -- which is the entire point of
 *      that table.
 *   3. A HOST-SHAPED LAST RESORT at 23 of them. RR_ENVIRONMENTS.qa.valcBase
 *      and .prod.valcBase are BOTH null on purpose (read their entries), so on
 *      a customer deployment all 24 sites resolved to the CUSTOMER's own
 *      loopback, where nothing is listening. A missing setting became a
 *      plausible-wrong call instead of a reported gap.
 *
 * THE DESIGN POINT THIS FILE EXISTS TO PIN DOWN
 * ---------------------------------------------
 * `RRDB.agentBase()` (guarded by Tools/test-agent-base-resolution.js) falls
 * back to the PAGE ORIGIN, because the agent serves the V8 app. valcBase()
 * MUST NOT: VALC is a different host in production, so a page-origin fallback
 * would be a confident wrong answer -- the exact failure this row removes.
 * When nothing resolves, valcBase() returns '' and the caller stops. Do not
 * copy an assertion between the two files; they disagree on purpose.
 *
 * FOUR THINGS ARE ASSERTED, AND THEY ARE DIFFERENT THINGS
 * ------------------------------------------------------
 *   S1  the resolver's own behaviour, executed out of the shipped config.js
 *   S2  that no SECOND reader survives anywhere in the tree (source text, with
 *       controls, because "zero" is not a result on its own)
 *   S3  THE SINK. A gate whose message nobody sees is not a report -- this is
 *       the file where RRENV.missing() once shipped with zero call sites. So
 *       the real RRV8.fetchErrorMessage is sliced out of sidebar.js and run
 *       against the real Error valcGap() produces, and the sentence must come
 *       back UNCHANGED rather than be captured by a status branch.
 *   S4  A REAL CALL SITE. admin-data-refresh.html's own rrFetch is sliced out
 *       and executed against a stub fetch, so the claim "the call sites stop
 *       cleanly" is measured on a shipped call site rather than asserted.
 *
 * Nothing here is retyped. Every function under test is sliced out of the file
 * that ships it; a moved anchor throws rather than quietly testing less.
 *
 * MUTATIONS
 * ---------
 * Section 5 re-injects each defect into the real source and declares, per
 * mutation, what must go RED and what must stay GREEN. A mutation that reddens
 * everything proves nothing about which assertion is load-bearing, so the green
 * set is checked as strictly as the red set.
 *
 * BLIND SPOTS, named:
 *   - No browser. This proves the resolver returns the right string and that
 *     the message survives the sink FUNCTION; it does not prove any pixel is
 *     painted. The banner element itself (#js-fetch-error-msg on
 *     admin-data-refresh.html:96, role="alert") was read, not rendered.
 *   - ONE call site is executed (admin-data-refresh). The other 13 rrFetch
 *     sites are covered structurally by S2 + S4's guard census, not by
 *     execution.
 *   - Two admin-users call sites stop SILENTLY by prior design (their catch
 *     blocks swallow every error, including HTTP ones). S4b names them rather
 *     than pretending they report.
 *   - It says nothing about whether any VALC host answers. That is a probe,
 *     not a unit test.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT       = path.join(__dirname, '..');
const CONFIG_JS  = path.join(ROOT, 'RRV8', 'config.js');
const SIDEBAR_JS = path.join(ROOT, 'RRV8', 'sidebar.js');
const PAGE_HTML  = path.join(ROOT, 'RRV8', 'admin-data-refresh.html');

const configSrc  = fs.readFileSync(CONFIG_JS, 'utf8');
const sidebarSrc = fs.readFileSync(SIDEBAR_JS, 'utf8');
const pageSrc    = fs.readFileSync(PAGE_HTML, 'utf8');

let failures = 0;
function record(name, pass, why) {
  if (pass) { console.log('  PASS  ' + name); }
  else { failures++; console.log('  FAIL  ' + name + '\n        ' + why); }
}

/* ---------------------------------------------------------------------------
 * SLICERS. Each one is anchored on real source text and THROWS on a miss.
 * ------------------------------------------------------------------------- */
function sliceBetween(src, startAnchor, tailAnchor, endAfter, label) {
  const start = src.indexOf(startAnchor);
  const tail  = src.indexOf(tailAnchor);
  if (start < 0 || tail < 0 || tail <= start) {
    throw new Error('cannot slice ' + label + ' (start=' + start + ', tail=' + tail
      + ') -- the anchors moved; fix the anchors, do not widen the slice');
  }
  const close = src.indexOf(endAfter, tail);
  if (close < 0) throw new Error('cannot find ' + JSON.stringify(endAfter) + ' after the tail anchor in ' + label);
  return src.slice(start, close + endAfter.length);
}

/* config.js: RR_CONFIG + the two routing tables + RR_ENVIRONMENTS + RRENV +
 * the whole RRDB IIFE, which is where valcBase/valcGap/valcFetch live. */
function sliceConfig(src) {
  return sliceBetween(src, 'window.RR_CONFIG = {',
    'return { dbs: dbs, index: index, active: active, name: name, agentBase: agentBase,',
    '})();', 'config.js');
}

/* sidebar.js: _fetchTargetHost + _serverDetail + fetchErrorMessage. The three
 * are contiguous and fetchErrorMessage calls the other two. */
function sliceSidebarErrText(src) {
  return sliceBetween(src, '  function _fetchTargetHost(area) {',
    "    return raw || 'The request failed and reported no reason.';",
    '\n  }', 'sidebar.js fetchErrorMessage');
}

/* admin-data-refresh.html: the page IIFE's routing preamble through the end of
 * its own rrFetch. A shipped call site, executed. */
function slicePageFetch(src) {
  return sliceBetween(src, '  const RR_CONFIG = window.RR_CONFIG || {};',
    '  function rrFetch(area, opts) {',
    '  function $(id) { return document.getElementById(id); }',
    'admin-data-refresh.html rrFetch')
    .replace('  function $(id) { return document.getElementById(id); }', '');
}

/* ---------------------------------------------------------------------------
 * A vm context that looks enough like a browser for these three slices.
 * ------------------------------------------------------------------------- */
function makeCtx(opts) {
  opts = opts || {};
  const ctx = {};
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.globalThis = ctx;
  ctx.localStorage = {
    _d: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem: function (k, v) { this._d[k] = String(v); }
  };
  /* A page origin that is NOT a VALC host. If valcBase() ever grows
   * agentBase()'s page-origin fallback, this is the string that shows up. */
  ctx.location = opts.location || { protocol: 'https:', host: 'rr.acme.example.com' };
  ctx.atob = function (b) { return Buffer.from(b, 'base64').toString('binary'); };
  ctx.URL = URL;
  ctx.URLSearchParams = URLSearchParams;
  ctx.Set = Set;
  ctx.Promise = Promise;
  ctx.TypeError = TypeError;
  ctx.Error = Error;
  ctx.calls = [];
  ctx.fetch = function (url, init) {
    ctx.calls.push({ url: String(url), init: init });
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); } });
  };
  vm.createContext(ctx);
  return ctx;
}

function loadConfig(src, opts) {
  opts = opts || {};
  const ctx = makeCtx(opts);
  new vm.Script(sliceConfig(src), { filename: 'config.js-slice' }).runInContext(ctx);
  if (opts.mutate) opts.mutate(ctx);
  return ctx;
}

/* ---------------------------------------------------------------------------
 * THE ASSERTION SET, as a function, so section 5 can re-run the identical
 * checks against mutated source and read back WHICH ones changed colour.
 * ------------------------------------------------------------------------- */
const V1 = 'V1 the shipped dev config still resolves to the dev VALC';
const V2 = 'V2 prod with valcBase unset resolves to NOTHING (not localhost, not the page origin)';
const V3 = 'V3 qa with valcBase null resolves to NOTHING';
const V4 = 'V4 a value supplied ONLY by RR_ENVIRONMENTS[mode] is found';
const V5 = 'V5 valcFetch joins base + path and calls fetch exactly once';
const V6 = 'V6 valcFetch with no base REJECTS and never calls fetch';
const V7 = 'V7 the gap Error carries no .status and is not a TypeError';
const V8 = 'V8 valcBase IS reported by missing() (unlike testAgentBase)';
const S3a = 'S3a the SINK passes the gap sentence through UNCHANGED';
const S3b = 'S3b SINK CONTROL: a 404-shaped error is NOT passed through unchanged';
const R1  = 'R1 a shipped rrFetch, configured, calls the VALC host once';
const R2  = 'R2 a shipped rrFetch, unconfigured, rejects and calls fetch ZERO times';

const GAP_MARK = 'no address for the sign-in service';

function runAssertions(srcs, report) {
  const res = {};
  function check(name, pass, why) {
    res[name] = pass;
    if (report) record(name, pass, why);
  }
  const cfg = srcs.config;

  // V1 -- the regression guard. This migration must not move a single value on
  // this box: RR_CONFIG sets valcBase and explicit-wins.
  {
    const ctx = loadConfig(cfg);
    const got = ctx.RRDB.valcBase();
    check(V1, got === 'http://localhost:8080',
      'expected http://localhost:8080, got ' + JSON.stringify(got));
  }

  // V2 -- THE DEFECT. A prod deploy that never set valcBase must resolve to
  // nothing. Two wrong answers are specifically excluded: the old
  // http://localhost:8080 literal, and agentBase()'s page-origin fallback.
  {
    const ctx = loadConfig(cfg, {
      location: { protocol: 'https:', host: 'rr.acme.example.com' },
      mutate: c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.valcBase = null; }
    });
    const got = ctx.RRDB.valcBase();
    check(V2, got === '', 'expected "" , got ' + JSON.stringify(got)
      + (got === 'https://rr.acme.example.com'
          ? ' -- that is the PAGE ORIGIN: agentBase()\'s fallback was copied here, and VALC is a different host'
          : ''));
  }

  // V3 -- same for qa, which carries an explicit null because no QA VALC is
  // published (see the qa entry's own probe log in config.js).
  {
    const ctx = loadConfig(cfg, {
      location: { protocol: 'https:', host: 'rr-qa.acme.example.com' },
      mutate: c => { c.RR_CONFIG.mode = 'qa'; c.RR_CONFIG.valcBase = null; }
    });
    const got = ctx.RRDB.valcBase();
    check(V3, got === '', 'expected "", got ' + JSON.stringify(got));
  }

  // V4 -- THE MIGRATION ITSELF. A direct RR_CONFIG read cannot pass this.
  {
    const ctx = loadConfig(cfg, {
      mutate: c => {
        c.RR_CONFIG.mode = 'prod';
        c.RR_CONFIG.valcBase = null;
        c.RR_ENVIRONMENTS.prod.valcBase = 'https://valc.acme.example.com';
      }
    });
    const got = ctx.RRDB.valcBase();
    check(V4, got === 'https://valc.acme.example.com',
      'expected https://valc.acme.example.com, got ' + JSON.stringify(got));
  }

  // V5 -- the happy path through the ONE shared fetch, including the leading
  // slash the call sites write.
  {
    const ctx = loadConfig(cfg);
    let settled = null;
    ctx.RRDB.valcFetch('/api/v1/tenant/roles', { cache: 'no-store' })
      .then(() => { settled = 'resolved'; }, e => { settled = 'rejected: ' + e.message; });
    const ok = ctx.calls.length === 1
      && ctx.calls[0].url === 'http://localhost:8080/api/v1/tenant/roles';
    check(V5, ok, 'calls=' + JSON.stringify(ctx.calls.map(c => c.url)) + ' settled=' + settled);
  }

  // V6 -- THE POINT OF THE WHOLE ROW. No base: reject, and DO NOT build
  // "/api/v1/..." or "null/api/v1/..." and send it anywhere.
  {
    const ctx = loadConfig(cfg, {
      mutate: c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.valcBase = null; }
    });
    let msg = null, resolved = false;
    ctx.RRDB.valcFetch('/api/v1/tenant/roles', {})
      .then(() => { resolved = true; }, e => { msg = e && e.message; });
    // The rejection is created synchronously by Promise.reject, but the
    // handler runs on the microtask queue -- drain it before asserting.
    const done = Promise.resolve().then(() => {
      const ok = ctx.calls.length === 0 && !resolved
        && typeof msg === 'string' && msg.indexOf(GAP_MARK) !== -1
        && msg.indexOf('api/v1/tenant/roles') !== -1;
      check(V6, ok, 'fetch calls=' + ctx.calls.length + ' resolved=' + resolved
        + ' msg=' + JSON.stringify(msg));
    });
    PENDING.push(done);
  }

  // V7 -- the property the sink keys off. fetchErrorMessage branches on a real
  // numeric .status and on `err instanceof TypeError`; the gap Error must
  // match neither, or it inherits a neighbouring branch's remedy.
  {
    const ctx = loadConfig(cfg);
    const e = ctx.RRDB.valcGap('api/v1/tenant/roles');
    check(V7, e && e.status === undefined && !(e instanceof TypeError)
      && e.rrUnconfigured === 'valcBase',
      'status=' + JSON.stringify(e && e.status)
      + ' isTypeError=' + (e instanceof TypeError)
      + ' rrUnconfigured=' + JSON.stringify(e && e.rrUnconfigured));
  }

  // V8 -- the contrast with the sibling test's A6. testAgentBase is
  // deliberately OUT of missing() because prod nulls it on purpose; valcBase is
  // deliberately IN, because a prod deploy with no VALC address is broken and
  // login.html + connection-check.html both name what missing() returns.
  {
    const ctx = loadConfig(cfg, {
      mutate: c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.valcBase = null; }
    });
    const m = ctx.RRENV.missing();
    check(V8, m.indexOf('valcBase') !== -1, 'missing() returned ' + JSON.stringify(m));
  }

  /* --- S3: the sink, running the REAL fetchErrorMessage ------------------ */
  {
    const ctx = makeCtx();
    new vm.Script('var __x = (function (global) {\n' + srcs.sidebar
      + '\n  return fetchErrorMessage;\n})(window); globalThis.fetchErrorMessage = __x;',
      { filename: 'sidebar.js-slice' }).runInContext(ctx);
    const cfgCtx = loadConfig(cfg);
    const gap = cfgCtx.RRDB.valcGap('api/v1/tenant/roles');
    const out = ctx.fetchErrorMessage('api/v1/tenant/roles', gap);
    check(S3a, out === gap.message,
      'the banner would show something OTHER than the gap sentence.\n'
      + '        produced: ' + JSON.stringify(gap.message) + '\n'
      + '        sink returned: ' + JSON.stringify(out));

    // Control: the same sink, given a real HTTP-shaped error, must REWRITE it.
    // Without this, S3a would also pass against a sink that returns its input
    // unconditionally -- i.e. against no sink at all.
    const http404 = new Error('HTTP 404');
    http404.status = 404;
    const out404 = ctx.fetchErrorMessage('inventory/reconciliation/rows', http404);
    check(S3b, out404 !== 'HTTP 404' && out404.indexOf('404') !== -1,
      'the sink returned its input unchanged for a 404, so S3a proves nothing: '
      + JSON.stringify(out404));
  }

  /* --- S4: a SHIPPED rrFetch, executed ---------------------------------- */
  function runPageFetch(mutateCfg) {
    const ctx = makeCtx();
    new vm.Script(sliceConfig(cfg), { filename: 'config.js-slice' }).runInContext(ctx);
    if (mutateCfg) mutateCfg(ctx);
    new vm.Script('(function () {\n' + srcs.page
      + '\n  globalThis.__rrFetch = rrFetch;\n})();',
      { filename: 'admin-data-refresh.html-slice' }).runInContext(ctx);
    return ctx;
  }
  {
    const ctx = runPageFetch(null);
    let err = null;
    ctx.__rrFetch('api/v1/tenant/roles', {}).then(() => {}, e => { err = e; });
    const ok = ctx.calls.length === 1
      && ctx.calls[0].url === 'http://localhost:8080/api/v1/tenant/roles';
    check(R1, ok, 'calls=' + JSON.stringify(ctx.calls.map(c => c.url)) + ' err=' + (err && err.message));
  }
  {
    const ctx = runPageFetch(c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.valcBase = null; });
    let msg = null, resolved = false;
    ctx.__rrFetch('api/v1/tenant/roles', {}).then(() => { resolved = true; }, e => { msg = e && e.message; });
    PENDING.push(Promise.resolve().then(() => {
      const urls = ctx.calls.map(c => c.url);
      const built = urls.filter(u => /^(null|undefined|)\//.test(u));
      const ok = ctx.calls.length === 0 && !resolved
        && typeof msg === 'string' && msg.indexOf(GAP_MARK) !== -1;
      check(R2, ok, 'fetch calls=' + JSON.stringify(urls)
        + (built.length ? ' <- THIS IS THE DEFECT: a base-less URL was built and sent.' : '')
        + ' resolved=' + resolved + ' msg=' + JSON.stringify(msg));
    }));
  }

  return res;
}

/* Assertions that settle on the microtask queue register here; the runner
 * drains them before reading the result set. */
let PENDING = [];
function drain(fn) { const p = PENDING; PENDING = []; return Promise.all(p).then(fn); }

const SIDEBAR_SLICE = sliceSidebarErrText(sidebarSrc);
const PAGE_SLICE    = slicePageFetch(pageSrc);
const SRCS = { config: configSrc, sidebar: SIDEBAR_SLICE, page: PAGE_SLICE };

/* ---------------------------------------------------------------------------
 * SECTION 2 -- no second reader survives ANYWHERE in the tree.
 *
 * ⚠ SCOPE IS THE WHOLE REPOSITORY, NOT config.js. A previous agent on this row
 * reported "zero direct reads remain" when it meant "zero remain inside
 * config.js", and eight real call sites outside it were still reading the
 * setting directly. So this walks every tracked .html/.js the migration
 * touched plus the rest of RRV8/, and the census is printed.
 * ------------------------------------------------------------------------- */
function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (name !== 'node_modules' && name !== '.git') walk(p, out); }
    else if (/\.(html|js)$/i.test(name)) out.push(p);
  }
  return out;
}

function stripLineComments(src) {
  return src.replace(/\r/g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
/** Remove block comments that OPEN A LINE, located by their own delimiters.
 *  LINE-OPENING ONLY -- Tools/test-comment-stripper-safety.js (UI-170) bans
 *  naive block-comment stripping, because a delimiter inside a string or regex
 *  literal pairs with the wrong partner and silently eats the file. A
 *  delimiter inside a literal never opens a line at indentation. */
function stripLeadingBlockComments(src) {
  let out = src, guard = 0;
  for (;;) {
    if (++guard > 5000) throw new Error('block-comment strip did not converge');
    const m = out.match(/^[ \t]*\/\*/m);
    if (!m) return out;
    const open = m.index + m[0].length - 2;
    const close = out.indexOf('*/', open);
    if (close < 0) return out;
    out = out.slice(0, open) + out.slice(close + 2);
  }
}

const DIRECT_READ = /RR_CONFIG\s*(?:\.|\[\s*['"])valcBase/g;

function censusDirectReads(files) {
  const hits = [];
  for (const f of files) {
    const code = stripLeadingBlockComments(stripLineComments(fs.readFileSync(f, 'utf8')));
    const m = code.match(DIRECT_READ);
    if (m) hits.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), n: m.length });
  }
  return hits;
}

console.log('\nSECTION 2 -- no second reader survives, across the WHOLE tree');

const SCAN_DIRS = [path.join(ROOT, 'RRV8'), path.join(ROOT, 'HelpDesk'), path.join(ROOT, 'Tools')];
const scanFiles = SCAN_DIRS.reduce((acc, d) => walk(d, acc), [])
  .concat([path.join(ROOT, 'login.html')]);

const hits = censusDirectReads(scanFiles);
/* TWO NAMED EXCEPTIONS, both tests, both excluded by FILENAME rather than by a
 * looser regex -- a regex loose enough to miss them would also miss a real call
 * site, which is the failure mode this whole section exists to catch.
 *   - test-auth-base-sink.js WRITES the field on a stub config to build a
 *     fixture (`c.RR_CONFIG.valcBase = null;`). A test setting up an
 *     environment, not application code routing a request.
 *   - this file re-injects the retired expression on purpose, in section 5's
 *     mutation literals. It was caught by its own detector on the first run,
 *     which is the correct behaviour and worth leaving a note about. */
const ALLOWED = ['Tools/test-auth-base-sink.js', 'Tools/test-valc-base-resolution.js'];
const real = hits.filter(h => ALLOWED.indexOf(h.file) === -1);
record('S2 zero direct RR_CONFIG.valcBase reads remain outside the allowed fixture',
  real.length === 0,
  'found ' + real.length + ' file(s): ' + JSON.stringify(real));
console.log('        scanned ' + scanFiles.length + ' .html/.js files under RRV8/, HelpDesk/, Tools/ + login.html');
console.log('        named exception (a test fixture WRITE, not a read): ' + JSON.stringify(hits.filter(h => ALLOWED.indexOf(h.file) !== -1)));

/* Controls. A zero is not a result until the same command is shown capable of
 * returning non-zero, in both directions the check can fail. */
record('S2 CONTROL (negative): the comment strip kept real code',
  ['function valcBase()', 'function valcGap(area)', 'function valcFetch(path, init)',
   'window.RRDB = (function ()']
    .every(k => stripLeadingBlockComments(stripLineComments(configSrc)).indexOf(k) !== -1),
  'the comment strip removed real code from config.js');

const reinjected = stripLeadingBlockComments(stripLineComments(configSrc))
  .replace("    return RRENV.get('valcBase') || '';",
           "    return RR_CONFIG.valcBase || 'http://localhost:8080';");
record('S2 CONTROL (positive): the re-injection applied',
  reinjected !== stripLeadingBlockComments(stripLineComments(configSrc)),
  'the anchor moved, so the positive control tested nothing');
record('S2 CONTROL (positive): the detector FINDS a re-injected direct read',
  (reinjected.match(DIRECT_READ) || []).length === 1,
  'detector found ' + ((reinjected.match(DIRECT_READ) || []).length)
    + ' on deliberately broken source; it cannot discriminate');

/* A third control, for the scope mistake this section exists to prevent: the
 * scan must actually be reaching files OUTSIDE config.js. */
const outsideConfig = scanFiles.filter(f => /RRDB\.valcFetch|RRDB\.valcBase/.test(fs.readFileSync(f, 'utf8'))
  && path.basename(f) !== 'config.js');
record('S2 CONTROL (scope): the scan reaches migrated files outside config.js',
  outsideConfig.length >= 15,
  'only ' + outsideConfig.length + ' migrated file(s) outside config.js were in scope -- '
  + 'the scan is too narrow, which is exactly the reporting error this control exists for');
console.log('        migrated files outside config.js in scope: ' + outsideConfig.length);

/* Census of the guard at the rrFetch sites, so "the call sites stop cleanly"
 * is a count rather than a claim. */
/* RRV8/ only: this file quotes the guard in its own M7 mutation literal, and a
 * census that counted the test as a call site would read 15 where 14 shipped. */
const GUARD = 'if (!base) return Promise.reject(window.RRDB.valcGap(area));';
const guarded = scanFiles
  .filter(f => path.relative(ROOT, f).replace(/\\/g, '/').indexOf('RRV8/') === 0)
  .filter(f => fs.readFileSync(f, 'utf8').indexOf(GUARD) !== -1)
  .map(f => path.basename(f));
record('S2 every rrFetch-shaped call site carries the reject guard (14 expected)',
  guarded.length === 14, 'found ' + guarded.length + ': ' + JSON.stringify(guarded));
console.log('        guarded: ' + guarded.join(', '));

/* ---------------------------------------------------------------------------
 * SECTIONS 1, 3, 4 -- behaviour.
 * ------------------------------------------------------------------------- */
console.log('\nSECTIONS 1/3/4 -- the shipped resolver, the shipped sink, a shipped call site');
runAssertions(SRCS, true);

drain(() => {
  /* -------------------------------------------------------------------------
   * SECTION 5 -- MUTATIONS. Break the thing, watch the right lights go red.
   * ---------------------------------------------------------------------- */
  console.log('\nSECTION 5 -- mutations (each declares its red set AND its green set)');

  function mutate(label, which, from, to, mustRedden, mustStayGreen, next) {
    const srcs = { config: SRCS.config, sidebar: SRCS.sidebar, page: SRCS.page };
    const before = srcs[which];
    srcs[which] = before.split(from).join(to);
    if (srcs[which] === before) {
      failures++;
      console.log('  FAIL  MUTATION CONTROL ' + label
        + '\n        the replacement did not apply -- source text moved, so this '
        + 'mutation tested NOTHING');
      return next();
    }
    let res;
    try { res = runAssertions(srcs, false); }
    catch (e) {
      failures++;
      console.log('  FAIL  ' + label + '\n        mutated source threw: ' + e.message);
      return next();
    }
    drain(() => {
      const wrongGreen = mustRedden.filter(n => res[n] !== false);
      const wrongRed   = mustStayGreen.filter(n => res[n] !== true);
      const ok = wrongGreen.length === 0 && wrongRed.length === 0;
      record('M ' + label, ok,
        (wrongGreen.length ? 'these should have gone RED and did not: ' + JSON.stringify(wrongGreen) + '. ' : '')
        + (wrongRed.length ? 'these should have stayed GREEN and did not: ' + JSON.stringify(wrongRed) + '.' : ''));
      if (ok) {
        console.log('        reddened as declared: ' + JSON.stringify(mustRedden));
        console.log('        stayed green:         ' + JSON.stringify(mustStayGreen));
      }
      next();
    });
  }

  const MUTATIONS = [
    // M1 -- the headline defect: a host-shaped last resort. Only the
    // unset-value cases may move; the configured paths must not.
    cb => mutate('M1 restore the hardcoded localhost:8080 last resort in valcBase()',
      'config',
      "    return RRENV.get('valcBase') || '';",
      "    return RRENV.get('valcBase') || 'http://localhost:8080';",
      [V2, V3, V6, R2],
      [V1, V4, V5, V7, V8, S3a, S3b, R1], cb),

    // M2 -- copy agentBase()'s page-origin fallback onto valcBase, the exact
    // design mistake this row rules out. Same consequence as M1 but a
    // different wrong answer, and the failure text must name the page origin.
    cb => mutate('M2 give valcBase() agentBase\'s PAGE-ORIGIN fallback',
      'config',
      "    return RRENV.get('valcBase') || '';",
      "    return RRENV.get('valcBase') || (window.location.protocol + '//' + window.location.host);",
      [V2, V3, V6, R2],
      [V1, V4, V5, V7, V8, S3a, S3b, R1], cb),

    // M3 -- bypass RRENV. ONLY the RR_ENVIRONMENTS-supplied case may redden:
    // everything else still resolves from RR_CONFIG, so if anything else moves
    // V4 is not measuring what it claims.
    cb => mutate('M3 make valcBase() read RR_CONFIG directly (bypassing RRENV)',
      'config',
      "    return RRENV.get('valcBase') || '';",
      "    return (window.RR_CONFIG && window.RR_CONFIG.valcBase) || '';",
      [V4],
      [V1, V2, V3, V5, V6, V7, V8, S3a, S3b, R1], cb),

    // M4 -- valcBase still returns '', but valcFetch builds the URL anyway.
    // This is the "null/api/v1/..." failure in its purest form, and it
    // isolates valcFetch's guard from valcBase's return value: V2/V3 must stay
    // GREEN here, which is what distinguishes M4 from M1.
    //
    // ⚠ R2 MUST STAY GREEN, and the first draft of this file declared it red.
    // The harness caught the wrong declaration, and the correction is worth
    // keeping: the rrFetch call sites do NOT go through valcFetch. They call
    // valcBase() and carry their own reject guard, so valcFetch's guard and the
    // call-site guard are two independent defences over two disjoint sets of
    // call sites. M4 covers the valcFetch set; M7 covers the rrFetch set.
    cb => mutate('M4 let valcFetch build a base-less URL instead of rejecting',
      'config',
      "    if (!b) return Promise.reject(valcGap(p.split('?')[0]));",
      "    ;",
      [V6],
      [V1, V2, V3, V4, V5, V7, V8, S3a, S3b, R1, R2], cb),

    // M5 -- stamp an HTTP status on the gap Error. The sink then treats it as
    // a service failure and rewrites the sentence, so the reader is told to
    // ring their IT department about a server that was never contacted.
    cb => mutate('M5 stamp .status on the gap Error (the sink then rewrites it)',
      'config',
      "    e.rrUnconfigured = 'valcBase';",
      "    e.rrUnconfigured = 'valcBase'; e.status = 503;",
      [V7, S3a],
      [V1, V2, V3, V4, V5, V6, V8, S3b, R1, R2], cb),

    // M6 -- break the SINK itself, in sidebar.js. Nothing about the producer
    // changes; only the assertion that a human sees the sentence may move.
    cb => mutate('M6 make fetchErrorMessage swallow the message it was given',
      'sidebar',
      "    return raw || 'The request failed and reported no reason.';",
      "    return 'The request failed.';",
      [S3a],
      [V1, V2, V3, V4, V5, V6, V7, V8, S3b, R1, R2], cb),

    // M7 -- remove the guard from the SHIPPED call site, leaving the resolver
    // correct. Only the executed call site may redden: this is what separates
    // "the resolver is right" from "the 24 call sites were actually migrated".
    // ⚠ NO NEWLINE IN THIS ANCHOR. The page slice comes from a CRLF file
    // (measured: git ls-files --eol says RRV8/*.html is w/crlf, *.js is w/lf),
    // so a `\n` in the pattern matches nothing. The first draft did exactly
    // that and the mutation control reported it as testing NOTHING, which is
    // why that control exists.
    cb => mutate('M7 remove the reject guard from admin-data-refresh.html rrFetch',
      'page',
      'if (!base) return Promise.reject(window.RRDB.valcGap(area));',
      ';',
      [R2],
      [V1, V2, V3, V4, V5, V6, V7, V8, S3a, S3b, R1], cb)
  ];

  let i = 0;
  (function nextMutation() {
    if (i >= MUTATIONS.length) return finish();
    const m = MUTATIONS[i++];
    m(nextMutation);
  })();
});

function finish() {
  console.log('');
  if (failures) {
    console.log(failures + ' CHECK' + (failures === 1 ? '' : 'S') + ' FAILED');
    process.exit(1);
  }
  console.log('ALL CHECKS PASSED');
}
