/* test-login-autofill-sso.js -- UI-236: an autofilled or Back-restored sign-in still offers the company's SSO.
 *
 *   node Tools/test-login-autofill-sso.js
 *
 * Owner, 2026-10-26: "When I returned from the check connection page to the sign in screen I get the error shown.
 * Clicking sign in keeps displaying the error. If I refresh the page it works properly again." The screenshot: email
 * and password filled, no "Continue with Microsoft Entra ID" button, and VALC's refusal naming that button.
 *
 * Cause: login.html discovered a domain's single sign-on only on an email `input` event, or once at load when
 * rrv8.lastEmail pre-filled the field. Sign-out removes rrv8.lastEmail, so after one the field is filled by the
 * browser's autofill (no reliable `input`) or restored by Back, discovery never runs, and Sign in POSTs a password
 * VALC must refuse.
 *
 * Runs the SHIPPED inline script of login.html on top of the real config.js block, with a fake DOM that records
 * event handlers, and fetch answering like VALC:
 *   sso-discovery?email=...@entra.example  -> { sso: true, protocol: 'ENTRA', startPath: '/oauth2/authorization/entra' }
 *   sso-discovery?email=...@pw.example     -> { sso: false }
 *   POST /api/v1/auth/login                -> 403 "Your organization signs in with Microsoft Entra ID..."
 *
 *   A1  autofilled Entra email, no input event, Sign in: NO password is posted; the page goes to Entra
 *   A2  autofill's `change` event alone runs discovery and shows the Entra button
 *   A3  a Back restore (pageshow, persisted) with the email filled runs discovery
 *   A4  CONTROL: an autofilled password-domain email still signs in with the password (discovery first)
 *   A5  CONTROL: a typed email (`input`) still discovers, as before
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const loginSrc = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8');

let failures = 0;
function check(ok, name, detail) {
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok || !detail ? '' : '\n        ' + detail));
}

const ENTRA = { sso: true, protocol: 'ENTRA', protocolLabel: 'Microsoft Entra ID', registrationId: 'entra',
                startPath: '/oauth2/authorization/entra' };

function bootLogin() {
  const store = {}, winHandlers = {};
  function el(id) {
    const e = {
      id, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, _attrs: {}, _cls: new Set(),
      _on: {},
      classList: {
        add(c) { e._cls.add(c); }, remove(c) { e._cls.delete(c); },
        toggle(c, f) { const on = (f === undefined) ? !e._cls.has(c) : !!f; on ? e._cls.add(c) : e._cls.delete(c); return on; },
        contains(c) { return e._cls.has(c); }
      },
      setAttribute(k, v) { e._attrs[k] = v; }, getAttribute(k) { return e._attrs[k]; },
      addEventListener(t, fn) { (e._on[t] = e._on[t] || []).push(fn); }, removeEventListener() {},
      focus() {}, select() {}, appendChild() {}, removeChild() {}, remove() {}, insertAdjacentHTML() {},
      closest() { return null; }, querySelector() { return el('q'); }, querySelectorAll() { return []; }, style: {},
      fire(t, ev) { return Promise.all((e._on[t] || []).map((fn) => fn(Object.assign({ preventDefault() {}, target: e }, ev || {})))); }
    };
    return e;
  }
  const doc = {
    getElementById(id) { return store[id] || (store[id] = el(id)); },
    querySelector() { return el('qs'); }, querySelectorAll() { return []; },
    createElement() { return el('created'); }, addEventListener() {},
    body: el('body'), documentElement: el('html'), execCommand() {}, title: '', readyState: 'complete'
  };
  const fetched = [];
  const ctx = {};
  ctx.window = ctx;
  ctx.document = doc;
  ctx.console = { log() {}, warn() {}, error() {} };
  ctx.navigator = { onLine: true, userAgent: 'test', clipboard: null };
  ctx.location = { search: '', href: 'http://localhost:8765/login.html', protocol: 'http:', host: 'localhost:8765', replace() {} };
  ctx.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };   // signed out: no rrv8.lastEmail
  ctx.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  ctx.URLSearchParams = URLSearchParams; ctx.URL = URL;
  ctx.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout; ctx.setInterval = () => 0; ctx.clearInterval = () => {};
  ctx.addEventListener = (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); };
  ctx.fetch = (u, opts) => {
    u = String(u); fetched.push({ url: u, method: (opts && opts.method) || 'GET' });
    const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
    if (/sso-discovery\?email=.*%40entra\.example/.test(u)) return json(200, ENTRA);
    if (/sso-discovery/.test(u)) return json(200, { sso: false });
    if (/\/api\/v1\/auth\/login$/.test(u)) return json(403, { message: 'Your organization signs in with Microsoft Entra ID. Use the "Continue with Microsoft Entra ID" button on this page - a password will not work for this account.' });
    return json(200, {});
  };
  vm.createContext(ctx);
  // The markup's starting state: the SSO panel is hidden (login.html: <div id="js-sso-panel" class="is-hidden">).
  // Without this the fake panel starts visible, and "shown" would be true before anything ran.
  if (!/<div id="js-sso-panel" class="is-hidden">/.test(loginSrc)) throw new Error('HARNESS: the markup no longer starts the SSO panel hidden');
  doc.getElementById('js-sso-panel')._cls.add('is-hidden');
  const s = configSrc.indexOf('window.RR_CONFIG = {'), e = configSrc.indexOf('window.RRDB = (function ()');
  new vm.Script(configSrc.slice(s, e), { filename: 'config.js' }).runInContext(ctx);
  const inline = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(loginSrc))) inline.push(m[1]);
  new vm.Script(inline[inline.length - 1], { filename: 'login.html-inline' }).runInContext(ctx);
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { ctx, store, fetched, winHandlers, settle, get: (id) => store[id] };
}
const posted = (b) => b.fetched.filter((f) => f.method === 'POST' && /\/auth\/login$/.test(f.url)).length;
const discovered = (b) => b.fetched.filter((f) => /sso-discovery/.test(f.url)).length;
const ssoShown = (b) => !b.get('js-sso-panel')._cls.has('is-hidden');

(async function () {
  // A1 -- the owner's case: autofill fills both fields, no input event, then Sign in.
  let b = bootLogin();
  b.get('js-email').value = 'edward.gutkowski@entra.example';
  b.get('js-pw').value = 'hunter22';
  await b.settle();
  await b.get('js-login-form').fire('submit'); await b.settle();
  check(posted(b) === 0, 'A1 autofilled Entra email + Sign in: no password is posted', 'POSTs: ' + posted(b));
  check(String(b.ctx.location.href).endsWith('/oauth2/authorization/entra'), 'A1 and the page goes to Entra', 'href: ' + b.ctx.location.href);

  // A2 -- autofill's change event alone.
  b = bootLogin();
  b.get('js-email').value = 'edward.gutkowski@entra.example';
  await b.get('js-email').fire('change'); await b.settle();
  check(discovered(b) === 1 && ssoShown(b), 'A2 a change event (autofill) runs discovery and shows the Entra button',
    'discovery calls ' + discovered(b) + ', panel shown ' + ssoShown(b));

  // A3 -- Back restore.
  b = bootLogin();
  b.get('js-email').value = 'edward.gutkowski@entra.example';
  await Promise.all((b.winHandlers.pageshow || []).map((fn) => fn({ persisted: true }))); await b.settle();
  check(discovered(b) === 1 && ssoShown(b), 'A3 a Back restore (pageshow, persisted) runs discovery',
    'pageshow handlers ' + (b.winHandlers.pageshow || []).length + ', discovery calls ' + discovered(b));

  // A4 -- CONTROL: a password domain, autofilled, still signs in with its password.
  b = bootLogin();
  b.get('js-email').value = 'someone@pw.example';
  b.get('js-pw').value = 'hunter22';
  await b.get('js-login-form').fire('submit'); await b.settle();
  check(posted(b) === 1 && !ssoShown(b), 'A4 CONTROL: an autofilled password-domain account still posts its password', 'POSTs ' + posted(b));

  // A5 -- CONTROL: typing still discovers (after the 350 ms debounce).
  b = bootLogin();
  b.get('js-email').value = 'edward.gutkowski@entra.example';
  await b.get('js-email').fire('input'); await new Promise((r) => setTimeout(r, 420));
  check(discovered(b) === 1 && ssoShown(b), 'A5 CONTROL: a typed email still discovers and shows the Entra button', 'discovery calls ' + discovered(b));

  console.log('\nRESULT: ' + (failures ? failures + ' failed' : 'all passed'));
  process.exit(failures ? 1 : 0);
})();
