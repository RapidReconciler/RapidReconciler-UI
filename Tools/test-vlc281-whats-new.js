/* test-vlc281-whats-new.js -- behaviour test for VLC-281's What's new card on V8 Home.
 *
 *   node Tools/test-vlc281-whats-new.js
 *
 * WHY THIS EXISTS. Owner 2026-11-23, "After sign-in": one V8 front end serves every customer in an environment, so
 * the sign-in page cannot show a customer their own bundle's release notes. Home shows them instead, from VALC
 * (GET api/v1/tenant/release-notes?database=), once per user per bundle (POST .../dismiss). This slices the SHIPPED
 * functions out of RRV8/home.html and runs them over a small fake DOM (jsdom is not a dependency of this repo) with
 * RRDB.valcFetch stubbed.
 *
 *   W1  a card for the active database renders its bullets and date, every text ESCAPED
 *   W2  nothing shows when VALC says null, the user has seen it, or there are no lines
 *   W3  dismiss posts the database and bundle; the card goes only once VALC says ok, and stays on a refusal or a blip
 *   W4  an answer for a database the user has switched away from is not painted
 *   W5  a failed fetch (a VALC without the route answers 404) leaves the card hidden and throws nothing
 *   W6  wiring: loadActiveDbSurfaces calls loadWhatsNew, and resetScopedState empties #whatsNew (a source check,
 *       labelled as one: those two functions call twenty others, which this harness does not stub)
 *
 * MUTATION ARMS (each must redden at least one assertion): the seen check removed; the switch guard removed;
 * mcEscape bypassed on the lines.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME_SRC = fs.readFileSync(path.join(ROOT, 'RRV8/home.html'), 'utf8').replace(/\r\n/g, '\n');

function sliceBlock(src, startIdx) {
  let depth = 0;
  for (let i = src.indexOf('{', startIdx); i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) { if (src[i] === '\\') { i++; continue; } if (src[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in RRV8/home.html');
  // mcEscape's regex holds a quote (/[&<>"']/g), which the string-aware slicer would read as a string opening, so
  // it is cut at its own closing text instead. Still the shipped function.
  if (name === 'mcEscape') {
    const end = src.indexOf('})[c]; }); }', at);
    if (end < 0) throw new Error('mcEscape changed shape; update the cut');
    return src.slice(at + 1, end + '})[c]; }); }'.length);
  }
  return sliceBlock(src, at + 1);
}

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -- ' + detail : '')); }
}
const tick = () => new Promise(r => setTimeout(r, 0));

/** A host element: innerHTML is a string, and the one button the card draws is a fake with a click listener. */
function fakeHost() {
  const host = { hidden: true, _html: '', button: null };
  Object.defineProperty(host, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = v;
      this.button = /data-whatsnew-dismiss/.test(v)
        ? { disabled: false, _click: null, addEventListener(t, f) { if (t === 'click') this._click = f; } }
        : null;
    },
  });
  host.querySelector = sel => (sel === '[data-whatsnew-dismiss]' ? host.button : null);
  return host;
}

/** Runs the shipped functions with `respond(url, init)` answering every valcFetch. */
function harness(src, respond) {
  const host = fakeHost();
  const calls = [];
  const ctx = {
    console, Date, isNaN, encodeURIComponent, JSON, Promise, String,
    document: { getElementById: id => (id === 'whatsNew' ? host : null) },
    window: {
      RR_SESSION: { dbs: [{ n: 'RapidReconciler_Prod_V8' }, { n: 'RapidReconciler_Test_V8' }], activeDbIndex: 0 },
      RRDB: { valcFetch: (url, init) => { calls.push({ url, init }); return respond(url, init); } },
    },
    prodHeaders: ct => (ct ? { 'Content-Type': ct } : {}),
  };
  vm.createContext(ctx);
  const names = ['mcEscape', 'whatsNewDbName', 'loadWhatsNew', 'whatsNewDate', 'renderWhatsNew'];
  vm.runInContext(names.map(n => extractFn(src, n)).join('\n') + '\nthis.loadWhatsNew = loadWhatsNew;', ctx);
  return { ctx, host, calls };
}
const ok = body => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const status = s => Promise.resolve({ ok: false, status: s, json: () => Promise.resolve({}) });

const CARD = { bundleId: 5, released: '2026-11-20T14:00:00Z', seen: false,
  lines: ['You can export the grid.', 'A <b>fixed</b> period & "total".'] };

async function run(src, label) {
  const before = fail;
  console.log('--- ' + label);

  // W1
  {
    const h = harness(src, () => ok({ whatsNew: CARD }));
    h.ctx.loadWhatsNew(); await tick(); await tick();
    check('W1 GET asks for the ACTIVE database, encoded', h.calls[0] && h.calls[0].url ===
      '/api/v1/tenant/release-notes?database=RapidReconciler_Prod_V8', h.calls[0] && h.calls[0].url);
    check('W1 the card shows', h.host.hidden === false);
    check('W1 subject and date', /What&rsquo;s new in RapidReconciler/.test(h.host.innerHTML) && /Released /.test(h.host.innerHTML));
    check('W1 each line is a bullet', (h.host.innerHTML.match(/<li>/g) || []).length === 2);
    check('W1 text is escaped', h.host.innerHTML.includes('A &lt;b&gt;fixed&lt;/b&gt; period &amp; &quot;total&quot;.')
      && !h.host.innerHTML.includes('<b>fixed</b>'));
  }

  // W2
  for (const [name, w] of [['null', null], ['seen', Object.assign({}, CARD, { seen: true })], ['no lines', Object.assign({}, CARD, { lines: [] })]]) {
    const h = harness(src, () => ok({ whatsNew: w }));
    h.host.hidden = false; h.host.innerHTML = '<p>stale</p>';
    h.ctx.loadWhatsNew(); await tick(); await tick();
    check('W2 hidden when ' + name, h.host.hidden === true && h.host.innerHTML === '');
  }

  // W3
  {
    let dismissAnswer = ok({ dismissed: true });
    const h = harness(src, (url) => (url.endsWith('/dismiss') ? dismissAnswer : ok({ whatsNew: CARD })));
    h.ctx.loadWhatsNew(); await tick(); await tick();
    const b = h.host.button;
    dismissAnswer = status(409);
    b._click(); await tick(); await tick();
    const post = h.calls[1];
    check('W3 dismiss POSTs database and bundle', post && post.init.method === 'POST'
      && post.url === '/api/v1/tenant/release-notes/dismiss'
      && post.init.body === JSON.stringify({ database: 'RapidReconciler_Prod_V8', bundleId: 5 }), post && post.init.body);
    check('W3 a refusal keeps the card and re-enables the button', h.host.hidden === false && b.disabled === false);
    dismissAnswer = Promise.reject(new Error('offline'));
    b._click(); await tick(); await tick();
    check('W3 a network blip keeps the card', h.host.hidden === false && b.disabled === false);
    dismissAnswer = ok({ dismissed: true });
    b._click(); await tick(); await tick();
    check('W3 an ok dismissal removes the card', h.host.hidden === true && h.host.innerHTML === '');
  }

  // W4
  {
    let release;
    const h = harness(src, () => new Promise(r => { release = r; }));
    h.ctx.loadWhatsNew();
    h.ctx.window.RR_SESSION.activeDbIndex = 1;   // the user switches databases while the answer is in flight
    release({ ok: true, status: 200, json: () => Promise.resolve({ whatsNew: CARD }) });
    await tick(); await tick(); await tick();
    check('W4 a switched-away answer is not painted', h.host.hidden === true && h.host.innerHTML === '');
  }

  // W5
  {
    const h = harness(src, () => status(404));
    let threw = false;
    try { h.ctx.loadWhatsNew(); await tick(); await tick(); } catch (e) { threw = true; }
    check('W5 a 404 leaves the card hidden, quietly', !threw && h.host.hidden === true);
  }

  // W6 (source check, see the header)
  {
    const surfaces = extractFn(src, 'loadActiveDbSurfaces');
    const reset = extractFn(src, 'resetScopedState');
    check('W6 loadActiveDbSurfaces calls loadWhatsNew', /\n\s*loadWhatsNew\(\);/.test(surfaces));
    check('W6 resetScopedState empties #whatsNew', /\$\('whatsNew'\)[^\n]*innerHTML = ''/.test(reset));
  }
  return fail - before;
}

function mutate(src, from, to) {
  if (!src.includes(from)) throw new Error('mutation anchor not found: ' + from);
  return src.replace(from, to);
}

(async () => {
  await run(HOME_SRC, 'shipped home.html');
  const shippedFail = fail;

  const arms = [
    ['seen check removed', s => mutate(s, 'if (!w || w.seen ||', 'if (!w ||')],
    ['switch guard removed', s => mutate(s, 'if (whatsNewDbName() === dbName) renderWhatsNew', 'renderWhatsNew')],
    ['lines not escaped', s => mutate(s, "'<li>' + mcEscape(l) + '</li>'", "'<li>' + l + '</li>'")],
  ];
  let armsOk = 0;
  for (const [name, f] of arms) {
    const savedPass = pass, savedFail = fail;
    const red = await run(f(HOME_SRC), 'MUTATION: ' + name);
    pass = savedPass; fail = savedFail;
    if (red > 0) { armsOk++; console.log('  ok    mutation "' + name + '" reddened ' + red + ' assertion(s)'); }
    else { fail++; console.log('  FAIL  mutation "' + name + '" reddened nothing: the test does not measure it'); }
  }
  console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed (' + armsOk + '/' + arms.length + ' mutation arms caught)');
  process.exit(fail || shippedFail ? 1 : 0);
})();
