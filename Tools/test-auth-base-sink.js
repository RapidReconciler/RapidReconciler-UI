/* test-auth-base-sink.js -- behaviour test for auth-base resolution and the
 * report an unresolved one produces (VLC-39 gap 2).
 *
 *   node Tools/test-auth-base-sink.js
 *
 * (No Node on this box. Azure Data Studio ships Electron, and
 *  ELECTRON_RUN_AS_NODE=1 azuredatastudio.exe Tools/test-auth-base-sink.js
 *  is a Node process -- same trick Tools/parsecheck.py uses.)
 *
 * WHY THIS EXISTS. login.html resolved its auth base as:
 *
 *     ?auth=  ||  RR_CONFIG.authBase  ||  'https://staging-valcspa.cloudapp.net'
 *
 * Three separate defects sat in that third term.
 *
 *   1. The host is not on the customer outbound allowlist. The authoritative
 *      list is four getgsi.com FQDNs; a customer could apply it exactly as
 *      published and still fail to sign in.
 *   2. It is the STAGING host, reached from a PROD deploy. The per-mode table
 *      that was supposed to supply a prod value, RR_AUTH_BASES, had no reader
 *      at all -- so `prod` never resolved to the prod host; it resolved to
 *      staging, and real customer credentials went there.
 *   3. Nothing said so. There was no message, no log line, no banner state.
 *
 * The fix routes resolution through RRENV and REPORTS an unresolved value.
 * That makes the sink the whole point of the change, so most of this file is
 * about the sink rather than the resolver.
 *
 * ASSERTION 1 -- THE RESOLVER, RUN NOT READ. The RR_CONFIG / RR_ENVIRONMENTS /
 * RRENV block is sliced out of the shipping config.js and executed in a vm
 * context, then driven through staging / qa / prod. Reading the source back
 * would not have caught that RRENV.mode() dereferences a BARE `RR_CONFIG`
 * (config.js: `(window.RR_CONFIG && RR_CONFIG.mode)`), which only works
 * because assigning to window creates a global. The context below is built so
 * that is true here too, and a future refactor that breaks it fails here.
 *
 * ASSERTION 2 -- NO HOST-SHAPED LAST RESORT SURVIVES ANYWHERE. RR_AUTH_BASES
 * must not come back, and no *.cloudapp.net literal may appear in executable
 * position in config.js or login.html. Comments may name the retired hosts --
 * that is the tombstone, and losing the hostnames would lose the history.
 *
 * ASSERTION 3 -- EMPTY, NOT NULL. Every use in login.html is
 * `AUTH_BASE + '/api/...'`. `null + '/api/v1/auth/ping'` is the STRING
 * "null/api/v1/auth/ping", which is a live same-origin request, so the
 * unresolved value has to be ''.
 *
 * ASSERTION 4 -- NOTHING FIRES AT THE PAGE'S OWN ORIGIN. With AUTH_BASE = '',
 * every `AUTH_BASE + path` is a bare relative path resolving against the
 * static host. That is not inert: GitHub Pages answers a real HTTP 404,
 * pingHealth reads "the server answered", and the banner goes GREEN -- a
 * confident pass for a hop never tested, the same false-green class that
 * moved statusAnchor in UI-160. And the sign-in POST would put a customer's
 * password in the static host's request log. Every one of the six call sites
 * must be gated.
 *
 * ASSERTION 5 -- THE SINK IS REACHABLE. #js-conn must exist in the markup, must
 * not carry `hidden` there, and no CSS rule may display:none it. A report
 * rendered into a hidden element is not a report. This codebase has the scars:
 * UI-13's freshness figure had three sinks and all three were dead.
 *
 * ASSERTION 6 -- THE SINK NAMES THE CAUSE. Not "can't reach the server" --
 * nothing was contacted, and that text sends a customer chasing a VPN fault
 * that does not exist. The state must say it is a configuration gap and must
 * name the unresolved keys, which is what RRENV.missing() is for.
 *
 * ASSERTION 7 -- HARNESS CONTROL, and it runs LAST so a harness that silently
 * stopped asserting cannot hide behind six green lines above it. Two halves:
 * a NEGATIVE control that re-injects the exact deleted defect into a copy of
 * the source and requires the checks to catch it (a checker that cannot fail
 * is not a checker), and a POSITIVE control -- today's shipped dev config,
 * which must resolve to localhost:8080 and report nothing missing.
 *
 * BLIND SPOTS, named:
 *   - It does not open a browser. It proves the element is in the markup and
 *     nothing declares it display:none; a layout that pushes the band off
 *     screen would pass here. That needs human eyes.
 *   - It does not prove any VALC host is reachable, or that the four
 *     allowlisted getgsi.com FQDNs are the right four. That is VLC-39's
 *     firewall doc, not this test.
 *   - It says nothing about RRV8/*.html. Measured 2026-09-01: no page under
 *     RRV8/ reads authBase at all -- login.html and connection-check.html are
 *     the only two readers in the repo.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT      = path.join(__dirname, '..');
const CONFIG_JS = path.join(ROOT, 'RRV8', 'config.js');
const LOGIN     = path.join(ROOT, 'login.html');
const CONNCHECK = path.join(ROOT, 'HelpDesk', 'connection-check.html');

const configSrc = fs.readFileSync(CONFIG_JS, 'utf8');
const loginSrc  = fs.readFileSync(LOGIN, 'utf8');
const connSrc   = fs.readFileSync(CONNCHECK, 'utf8');

let failures = 0;
function ok(label)        { console.log('  PASS  ' + label); }
function bad(label, why)  { failures++; console.log('  FAIL  ' + label + '\n        ' + why); }
function check(cond, label, why) { cond ? ok(label) : bad(label, why); }

/* ---------------------------------------------------------------------------
 * Slice the config block out of the shipping file and run it. Source is never
 * retyped: the slice runs from the real `window.RR_CONFIG = {` to the start of
 * RRDB, which is the next thing in the file and needs a DOM.
 * ------------------------------------------------------------------------- */
function loadConfigBlock(mutate) {
  const start = configSrc.indexOf('window.RR_CONFIG = {');
  const end   = configSrc.indexOf('window.RRDB = (function ()');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('cannot slice the config block out of config.js '
      + '(start=' + start + ', end=' + end + ') -- the anchors moved');
  }
  // ctx.window === ctx so `window.RR_CONFIG = x` also creates the bare global
  // `RR_CONFIG`, exactly as it does in a browser. RRENV.mode() depends on it.
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  new vm.Script(configSrc.slice(start, end), { filename: 'config.js-block' }).runInContext(ctx);
  if (mutate) mutate(ctx);
  return ctx;
}

console.log('\nASSERTION 1 -- the resolver, executed');

// 1a. Shipped dev config, untouched.
{
  const ctx = loadConfigBlock(null);
  check(ctx.RRENV.mode() === 'staging',
    'mode() reads the shipped config',
    'expected "staging", got ' + JSON.stringify(ctx.RRENV.mode()));
  check(ctx.RRENV.get('authBase') === 'http://localhost:8080',
    'staging: explicit RR_CONFIG value wins',
    'expected http://localhost:8080, got ' + JSON.stringify(ctx.RRENV.get('authBase')));
}

// 1b. A prod deploy that forgot to set authBase -- the whole defect.
{
  const ctx = loadConfigBlock(c => { c.RR_CONFIG.mode = 'prod'; c.RR_CONFIG.authBase = null; });
  const got = ctx.RRENV.get('authBase');
  check(got === null,
    'prod with authBase unset resolves to null, NOT to a cloudapp host',
    'expected null, got ' + JSON.stringify(got));
  check(ctx.RRENV.missing().indexOf('authBase') !== -1,
    'prod with authBase unset is REPORTED by missing()',
    'missing() returned ' + JSON.stringify(ctx.RRENV.missing()));
}

// 1c. A prod deploy that DID set it -- today's behaviour must be untouched.
{
  const ctx = loadConfigBlock(c => {
    c.RR_CONFIG.mode = 'prod';
    c.RR_CONFIG.authBase = 'https://acme-valc.example.com';
  });
  check(ctx.RRENV.get('authBase') === 'https://acme-valc.example.com',
    'prod with authBase SET: the explicit value still wins',
    'got ' + JSON.stringify(ctx.RRENV.get('authBase')));
  check(ctx.RRENV.missing().indexOf('authBase') === -1,
    'prod with authBase SET reports nothing missing for that key',
    'missing() returned ' + JSON.stringify(ctx.RRENV.missing()));
}

// 1d. QA -- the environment that has no hostnames at all (VLC-39 gap 3).
{
  const ctx = loadConfigBlock(c => { c.RR_CONFIG.mode = 'qa'; c.RR_CONFIG.authBase = null; });
  check(ctx.RRENV.get('authBase') === null,
    'qa resolves to null (no hostname was invented)',
    'got ' + JSON.stringify(ctx.RRENV.get('authBase')));
  check(ctx.RRENV.missing().indexOf('authBase') !== -1,
    'qa is reported by missing()',
    'missing() returned ' + JSON.stringify(ctx.RRENV.missing()));
}

console.log('\nASSERTION 2 -- no host-shaped last resort survives');

// Strip comments so a tombstone naming the retired hosts does not read as a
// live default. Deliberately conservative: only // and /* */ blocks.
//
// The \r strip is load-bearing and was found by control 7a, not by reading.
// Every file in this repo is CRLF. In a JS regex `\r` is a line terminator, so
// `.` will not cross it and `$` (no /m flag) will not match before it -- the
// line-comment pattern silently matched NOTHING on every line in the repo, and
// the check reported a live cloudapp default that was only ever a comment.
// LINE COMMENTS ONLY below, and that is a rule rather than a shortcut. This
// used to also run a naive block-comment strip, which
// test-comment-stripper-safety.js (UI-170) BANS across every Tools/test-*.js --
// and it caught this file on its first CI run. A block delimiter sitting inside
// a STRING or a REGEX LITERAL pairs with the wrong partner and swallows
// everything between; measured on RRV8/sidebar.js it removed 55,819 of 116,021
// bytes, 48% of the file, silently. The quiet direction is the false PASS.
//
// The sanctioned form matches a comment that OPENS a line, so a URL inside a
// string survives. It is weaker -- a trailing comment after code, and any block
// comment, stay in place -- which is why the RR_AUTH_BASES tombstone is removed
// by locating its own delimiters instead. See stripTombstone.
function stripComments(src) {
  return src
    .replace(/\r/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

// The RR_AUTH_BASES tombstone is a block comment and block comments are no
// longer stripped. Cut it by its own delimiters -- LOCATED, not pattern-matched
// -- so the retired hostnames it preserves cannot read as a live default. If the
// tombstone is ever deleted this finds nothing and returns the source unchanged.
function stripTombstone(src) {
  // Anchor on the tombstone's own marker, not on the bare identifier: the
  // NAME also appears in an earlier header comment (config.js:27), and
  // anchoring there cut the wrong block and left the real tombstone in
  // place -- which the test then reported as a live cloudapp default.
  var i = src.indexOf('RR_AUTH_BASES — RETIRED');
  if (i === -1) return src;
  var open = src.lastIndexOf('/*', i);
  var close = src.indexOf('*/', i);
  if (open === -1 || close === -1) return src;
  return src.slice(0, open) + src.slice(close + 2);
}

{
  const ctx = loadConfigBlock(null);
  check(typeof ctx.RR_AUTH_BASES === 'undefined',
    'RR_AUTH_BASES is gone from the executed config',
    'it is still defined: ' + JSON.stringify(ctx.RR_AUTH_BASES));
}
check(!/cloudapp\.net/.test(stripComments(stripTombstone(configSrc.slice(0, configSrc.indexOf('window.RRDB'))))),
  'config.js has no cloudapp.net outside comments',
  'a cloudapp host is still in executable position in config.js');
check(!/cloudapp\.net/.test(stripComments(loginSrc)),
  'login.html has no cloudapp.net outside comments',
  'the hardcoded staging fallback is still live in login.html');

console.log('\nASSERTION 3 -- unresolved is empty string, not null');

const authBaseDecl = (loginSrc.match(/const AUTH_BASE =[\s\S]*?;/) || [''])[0];
check(/RRENV/.test(authBaseDecl),
  'login.html resolves AUTH_BASE through RRENV',
  'AUTH_BASE declaration does not mention RRENV:\n' + authBaseDecl);
check(/\|\|\s*''\s*;/.test(authBaseDecl),
  "login.html's AUTH_BASE bottoms out at '' (string concat safe)",
  'AUTH_BASE does not end in "|| \'\'":\n' + authBaseDecl);

console.log("\nASSERTION 4 -- nothing fires at the page's own origin");

// Every AUTH_BASE + path call site, and the guard that must precede it.
const GATED = [
  ['pingHealth',      /\(function pingHealth\(\)\s*\{\s*if \(authUnset\(/],
  ['sign-in submit',  /loginForm\.addEventListener\('submit',[\s\S]{0,120}?if \(authUnset\(errEl\)\) return;/],
  ['password reset',  /resetForm\.addEventListener\('submit',[\s\S]{0,120}?if \(authUnset\(resetErrEl\)\) return;/],
  ['password change', /changeForm\.addEventListener\('submit',[\s\S]{0,120}?if \(authUnset\(changeErrEl\)\) return;/],
  ['SSO discovery',   /async function discoverSso\(\)\s*\{[\s\S]{0,400}?if \(authUnset\(null\)\)/],
  ['SSO start',       /function startSso\(\)\s*\{\s*if \(authUnset\(errEl\)\) return;/]
];
GATED.forEach(([label, re]) => check(re.test(loginSrc),
  label + ' is gated on an unresolved auth base',
  'no authUnset guard found at that call site'));

check(/function authUnset\(errTarget\)\s*\{\s*if \(AUTH_BASE\) return false;/.test(loginSrc),
  'authUnset() short-circuits when an auth base IS set (no behaviour change)',
  'the guard does not early-return on a configured AUTH_BASE');

// The submit buttons must also be disabled, so the gate does not rely on six
// regexes staying correct forever.
check(/\[submitEl, resetSubmitEl, changeSubmitEl\][\s\S]{0,120}disabled = true/.test(loginSrc),
  'all three submit buttons are disabled when no auth base resolves',
  'the boot-time disable is missing');

console.log('\nASSERTION 5 -- the sink is reachable');

const connTag = (loginSrc.match(/<div[^>]*id="js-conn"[^>]*>/) || [''])[0];
check(!!connTag, '#js-conn exists in login.html markup', 'element not found');
check(!/\bhidden\b/.test(connTag),
  '#js-conn is not hidden in the markup',
  'the band ships hidden: ' + connTag);
check(!/\.conn-band\s*\{[^}]*display:\s*none/.test(loginSrc),
  'no CSS rule display:none-s .conn-band',
  '.conn-band is hidden by CSS');
check(/connPanel\.classList\.remove\('is-hidden'\)/.test(
        (loginSrc.match(/\(function pingHealth\(\)[\s\S]*?\}\)\(\);/) || [''])[0]),
  'the details panel (which holds the unresolved keys) auto-opens',
  'pingHealth does not open connPanel on the misconfigured path');

console.log('\nASSERTION 6 -- the sink names the cause');

const misCase = (loginSrc.match(/case 'misconfigured':[\s\S]*?break;/) || [''])[0];
check(!!misCase, "applyResult has a 'misconfigured' state", 'no such case');
check(/state = 'down'/.test(misCase),
  'the misconfigured state is a DOWN state, not a warn',
  'it does not set state=down');
check(/configur/i.test(misCase) && !/VPN[^<]*\bcheck\b/i.test(misCase.replace(/not[\s\S]{0,60}VPN/i, '')),
  'the message says configuration, and does not send the user chasing the network',
  'wording does not name a configuration gap');
check(/Unresolved:\s*'\s*\+\s*\(ENV_MISSING/.test(loginSrc),
  'the copyable diagnostics block names the unresolved keys',
  'buildDiagnosticsText does not emit ENV_MISSING');
check(/__rrDiag\.log\(\s*\n?\s*'no auth base configured/.test(loginSrc),
  'the console diag log records it too',
  'no __rrDiag line for the misconfigured path');

// Second sink: the connection-check page.
check(/window\.RRENV[\s\S]{0,200}RRENV\.get/.test(connSrc) || /function envGet/.test(connSrc),
  'connection-check.html resolves through RRENV',
  'it still reads RR_CONFIG directly');
check(/ENV_MISSING\.join/.test(connSrc),
  'connection-check probe C names the unresolved keys',
  'probe C reports nothing about which setting is missing');

console.log('\nASSERTION 7 -- the guard actually RUNS');

/* Assertions 3-6 are structural: they prove the guard is WRITTEN. They cannot
 * prove it EXECUTES -- a `const` referenced before its declaration is a
 * runtime TDZ throw that every regex above passes, and the boot-time disable
 * sits in an IIFE that runs before setErr's declaration is reached in source
 * order. So boot the shipping IIFE for real against a DOM stub and read the
 * sink back out of it.
 *
 * The stub is deliberately dumb: fetch records the URL and rejects. What
 * matters is WHICH urls it records -- the defect being fixed is a request
 * going somewhere it should not. */
function bootLogin(mutateConfig) {
  const store = {};
  function el(id) {
    const e = {
      id, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
      _attrs: {}, _cls: new Set(),
      classList: {
        add(c) { e._cls.add(c); }, remove(c) { e._cls.delete(c); },
        toggle(c, f) {
          const on = (f === undefined) ? !e._cls.has(c) : !!f;
          on ? e._cls.add(c) : e._cls.delete(c); return on;
        },
        contains(c) { return e._cls.has(c); }
      },
      setAttribute(k, v) { e._attrs[k] = v; }, getAttribute(k) { return e._attrs[k]; },
      addEventListener() {}, removeEventListener() {}, focus() {}, select() {},
      appendChild() {}, removeChild() {}, remove() {}, insertAdjacentHTML() {},
      closest() { return null; }, querySelector() { return el('q'); },
      querySelectorAll() { return []; }, style: {}
    };
    return e;
  }
  const doc = {
    getElementById(id) { return store[id] || (store[id] = el(id)); },
    querySelector() { return el('qs'); }, querySelectorAll() { return []; },
    createElement() { return el('created'); }, addEventListener() {},
    body: el('body'), documentElement: el('html'), execCommand() {}, title: ''
  };
  const fetched = [];
  const ctx = {};
  ctx.window = ctx;
  ctx.document = doc;
  ctx.console = { log() {}, warn() {}, error() {} };
  ctx.navigator = { onLine: true, userAgent: 'test', clipboard: null };
  ctx.location = { search: '', href: 'http://static.example/login.html',
                   protocol: 'http:', host: 'static.example', replace() {} };
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.URLSearchParams = URLSearchParams;
  ctx.URL = URL;
  ctx.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  ctx.setInterval = () => 0; ctx.clearInterval = () => {};
  ctx.fetch = (u) => { fetched.push(String(u)); return Promise.reject(new TypeError('stub: no network')); };
  vm.createContext(ctx);

  const s = configSrc.indexOf('window.RR_CONFIG = {');
  const e = configSrc.indexOf('window.RRDB = (function ()');
  new vm.Script(configSrc.slice(s, e), { filename: 'config.js' }).runInContext(ctx);
  if (mutateConfig) mutateConfig(ctx);

  // The page's own IIFE is the SECOND inline <script> (the first is the tiny
  // __rrDiag bootstrap). Source is sliced, never retyped.
  const inline = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(loginSrc))) inline.push(m[1]);
  const main = inline[inline.length - 1];

  let threw = null;
  try {
    new vm.Script(main, { filename: 'login.html-inline' }).runInContext(ctx);
  } catch (err) { threw = err; }
  return { store, fetched, threw, get: id => store[id] };
}

// 7a. A prod deploy that forgot authBase -- the defect scenario, booted.
{
  const r = bootLogin(c => {
    c.RR_CONFIG.mode = 'prod';
    c.RR_CONFIG.authBase = null;
    c.RR_CONFIG.valcBase = null;
    c.RR_CONFIG.testAgentBase = null;
  });
  check(!r.threw, 'the page boots without throwing on the misconfigured path',
    r.threw ? String(r.threw && r.threw.message) : '');
  check(!r.fetched.some(u => /auth/.test(u)),
    'NO auth request is issued -- nothing hits the page origin',
    'it fetched: ' + JSON.stringify(r.fetched));
  const band = r.get('js-conn');
  check(band && band.getAttribute('data-state') === 'down' && band.hidden === false,
    'the connectivity band renders, visible, in the down state',
    'state=' + (band && band.getAttribute('data-state')) + ' hidden=' + (band && band.hidden));
  check(/isn’t configured/.test((r.get('js-conn-text') || {}).textContent || ''),
    'the band text names a configuration gap',
    'text was ' + JSON.stringify((r.get('js-conn-text') || {}).textContent));
  check(['js-submit', 'js-reset-submit', 'js-change-submit']
        .every(id => r.get(id) && r.get(id).disabled === true),
    'all three submit buttons are disabled at boot',
    'not every submit button was disabled');
  const diag = (r.get('js-conn-diag') || {}).textContent || '';
  check(/Config mode:\s+prod/.test(diag) && /Unresolved:\s+authBase/.test(diag),
    'the copyable diagnostics name the mode and the unresolved key',
    'diagnostics were:\n' + diag.split('\n').slice(0, 8).join('\n'));
}

console.log('\nASSERTION 8 -- harness control (runs last)');

// 7a. NEGATIVE control, differential: the SAME check must pass on the real
// source and fail on a copy with the deleted defect put back. Checking only
// that the mutant fails is not enough -- a check that fires on the tombstone
// comment would "catch" the mutant while catching everything else too, which
// is how the CRLF bug in stripComments() surfaced.
{
  const reinjected = loginSrc.replace(/\|\|\s*''\s*;/,
    "|| 'https://staging-valcspa.cloudapp.net';");
  const cleanIsClean = !/cloudapp\.net/.test(stripComments(loginSrc));
  const mutantCaught =  /cloudapp\.net/.test(stripComments(reinjected));
  check(reinjected !== loginSrc,
    'the negative control actually mutated the source',
    'the re-injection matched nothing, so nothing was tested');
  check(cleanIsClean && mutantCaught,
    'the cloudapp check discriminates: clean source passes, re-injected defect fails',
    'clean source clean? ' + cleanIsClean + '; mutant caught? ' + mutantCaught
      + ' -- a check that cannot tell them apart is not a check');
}

// 7b. NEGATIVE control on the resolver: an env table that DOES carry a value
// must be found, or the null results above prove nothing.
{
  const ctx = loadConfigBlock(c => {
    c.RR_CONFIG.mode = 'prod';
    c.RR_CONFIG.authBase = null;
    c.RR_ENVIRONMENTS.prod.authBase = 'https://rrvalc.getgsi.com';
  });
  check(ctx.RRENV.get('authBase') === 'https://rrvalc.getgsi.com',
    'RRENV DOES read RR_ENVIRONMENTS when RR_CONFIG is unset',
    'got ' + JSON.stringify(ctx.RRENV.get('authBase'))
      + ' -- the earlier nulls may be a broken lookup, not a real gap');
}

// 8c. POSITIVE control: the shipped dev config, resolver level.
{
  const ctx = loadConfigBlock(null);
  const resolved = ['authBase', 'valcBase', 'statusAnchor'].map(k => ctx.RRENV.get(k));
  check(resolved.every(v => v !== null) && ctx.RRENV.missing().length === 0,
    "CONTROL: today's shipped dev config resolves every key and reports nothing missing",
    'resolved ' + JSON.stringify(resolved) + ', missing ' + JSON.stringify(ctx.RRENV.missing()));
}

// 8d. POSITIVE control, BOOTED, and the last thing this file does. If the
// change altered a configured deploy at all, it shows up here: the page must
// still ping the configured host, must NOT report a configuration gap, and
// must leave every button enabled. A suite where the failure path is the only
// thing exercised proves the feature works and says nothing about whether the
// product still does.
{
  const r = bootLogin(null);                       // shipped dev config, untouched
  check(!r.threw, 'CONTROL: the page boots clean on the configured path',
    r.threw ? String(r.threw && r.threw.message) : '');
  check(r.fetched.indexOf('http://localhost:8080/api/v1/auth/ping') !== -1,
    'CONTROL: a configured deploy still pings its configured host',
    'it fetched: ' + JSON.stringify(r.fetched));
  check(['js-submit', 'js-reset-submit', 'js-change-submit']
        .every(id => !r.get(id) || r.get(id).disabled === false),
    'CONTROL: a configured deploy leaves every submit button enabled',
    'a button was disabled on a healthy config');
  check(!/isn’t configured/.test((r.get('js-err') || {}).textContent || ''),
    'CONTROL: a configured deploy shows no configuration error',
    'the misconfiguration message leaked onto a healthy deploy');
}

console.log('\n' + (failures === 0
  ? 'ALL CHECKS PASSED'
  : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
