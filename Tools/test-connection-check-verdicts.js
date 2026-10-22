/*
 * test-connection-check-verdicts.js  --  UI-216
 *
 * WHAT THIS GUARDS
 * ----------------
 * HelpDesk/connection-check.html is the page a customer runs from their own
 * computer when RapidReconciler will not open (V8's sign-in page links to it).
 * Until UI-216 it gave every probe one deadline (8 s, or 12 s for the server's
 * /comms-check) and called anything that ran past it "no response in time --
 * often a firewall silently dropping the connection", in red. So a server that
 * answered in 9 s told the customer their firewall was blocking it. UI-213 had
 * already fixed the same reading in V8's Troubleshooting (Agent #191,
 * ValcLineProbe): a slow answer is amber with the elapsed time, a failed
 * connect is red with the firewall advice. This page now does the same:
 *
 *   - answered after the slow mark  -> amber, the elapsed time, "not a firewall"
 *   - no answer by the give-up mark -> red, firewall advice
 *   - while waiting past the slow mark, the row says it is still waiting
 *
 * It also probed each database's data-services port over `here.protocol`
 * unless the agent base was https. The agents serve TLS (VLC-147), and an
 * http request to a TLS port is answered 400 "requires TLS" or, from an https
 * page, blocked as mixed content. The ports are now always probed over https.
 *
 * HOW
 * ---
 * The page's inline script is SLICED OUT OF THE SHIPPED HTML AND EXECUTED in a
 * vm context with a stub DOM, a stub fetch whose replies arrive at chosen
 * virtual times, and a virtual clock driving setTimeout and performance.now.
 * Nothing is retyped: change the page and this runs the change.
 *
 * Fail-first: `node Tools/test-connection-check-verdicts.js <old-page.html>`
 * runs the same assertions against another copy of the page.
 *
 * BLIND SPOTS, named:
 *   - No real browser and no real network. A real dropped SYN fails with a
 *     network error after the OS's own connect timeout (about 21 s on
 *     Windows), not with an abort; the "hang" scenario here models the abort.
 *   - It does not render CSS; it reads the state attributes and classes the
 *     CSS keys on.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const PAGE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'HelpDesk', 'connection-check.html');
const html = fs.readFileSync(PAGE, 'utf8');
const m = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?\}\)\(\);)\s*<\/script>/);
if (!m) {
  console.log('FAIL  could not find the inline (function () { ... })(); script in ' + PAGE);
  process.exit(1);
}
const SCRIPT = m[1];

let failures = 0;
function check(name, pass, why) {
  if (pass) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + '\n        ' + why); }
}

// ---- One page load against a scripted network ------------------------------
// routes: [{ match, after, kind: 'answer' | 'reject' | 'hang', status, json }]
function load(opts) {
  let now = 0, seq = 0;
  const timers = [];
  const calls = [];
  function setT(fn, ms) { const t = { at: now + (ms || 0), fn: fn, id: ++seq }; timers.push(t); return t.id; }
  function clearT(id) { const i = timers.findIndex(function (t) { return t.id === id; }); if (i >= 0) timers.splice(i, 1); }

  const els = {};
  function el(id) {
    if (!els[id]) {
      const cl = new Set();
      els[id] = {
        id: id, textContent: '', innerHTML: '', className: '', disabled: false, style: {}, attrs: {},
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        getAttribute: function (k) { return this.attrs[k]; },
        addEventListener: function () {},
        classList: { add: function (c) { cl.add(c); }, remove: function (c) { cl.delete(c); }, contains: function (c) { return cl.has(c); } }
      };
    }
    return els[id];
  }

  function route(url) {
    for (const r of opts.routes) if (url.indexOf(r.match) >= 0) return r;
    return { kind: 'reject', after: 5 };
  }
  function fakeFetch(url, fo) {
    calls.push(String(url));
    const r = route(String(url));
    return new Promise(function (resolve, reject) {
      let done = false;
      const sig = fo && fo.signal;
      if (sig) sig.addEventListener('abort', function () {
        if (done) return; done = true;
        const e = new Error('The user aborted a request.'); e.name = 'AbortError'; reject(e);
      });
      if (r.kind === 'hang') return;
      setT(function () {
        if (done) return; done = true;
        if (r.kind === 'reject') { reject(new TypeError('Failed to fetch')); return; }
        const status = r.status || 200;
        resolve({ ok: status < 400, status: status, json: function () { return Promise.resolve(r.json || {}); } });
      }, r.after);
    });
  }

  const here = new URL(opts.href || 'https://rr.example.test/HelpDesk/connection-check.html');
  const env = Object.assign({ statusAnchor: 'https://edge.example.test', authBase: 'https://signin.example.test' }, opts.env || {});
  const ctx = {
    console: console,
    URL: URL, URLSearchParams: URLSearchParams, AbortController: AbortController,
    setTimeout: setT, clearTimeout: clearT,
    fetch: fakeFetch,
    performance: { now: function () { return now; } },
    navigator: { onLine: true, userAgent: 'test-agent' },
    location: { protocol: here.protocol, host: here.host, hostname: here.hostname, href: here.href, search: here.search },
    document: { getElementById: el, createElement: function () { return el('tmp-' + (++seq)); }, body: { appendChild: function () {}, removeChild: function () {} } },
    RR_CONFIG: {},
    RRENV: { get: function (k) { return env[k] || null; }, missing: function () { return []; }, mode: function () { return 'test'; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SCRIPT, ctx, { filename: 'connection-check.html <script>' });

  async function flush() { for (let i = 0; i < 25; i++) await new Promise(function (r) { setImmediate(r); }); }
  async function runUntil(limit) {
    for (;;) {
      await flush();
      if (!timers.length) break;
      timers.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
      if (timers[0].at > limit) { now = Math.max(now, limit); break; }
      const t = timers.shift();
      now = Math.max(now, t.at);
      t.fn();
    }
    await flush();
  }
  return { el: el, calls: calls, runUntil: runUntil, now: function () { return now; } };
}

// The leg colour the live diagram drew for leg n.
function legColour(page, n) {
  const svg = page.el('netdiagram').innerHTML;
  const mm = svg.match(new RegExp('fill="(#[0-9a-f]{6})"/><text[^>]*>' + n + '</text>'));
  return mm ? mm[1] : '(no leg ' + n + ')';
}
const AMBER = '#f08a24', RED = '#b8463a', GREEN = '#2e8a55';

function server(after, kind) {
  return { match: '/comms-check', after: after, kind: kind || 'answer', json: {
    host: { hostname: 'APPSRV01' },
    checks: [{ name: 'sql.reachable', status: 'ok', label: 'Database', text: 'Connected.' },
             { name: 'valc.reachable', status: 'ok', label: 'GSI', text: 'Connected.' }],
    databases: [{ displayName: 'Production', databaseName: 'RapidReconciler_Prod_V8', servicePort: 34537 }]
  } };
}
function routes(o) {
  return [
    server(o.serverAfter != null ? o.serverAfter : 200, o.serverKind),
    { match: ':34537/health', after: o.dbAfter != null ? o.dbAfter : 150, kind: o.dbKind || 'answer' },
    { match: 'edge.example.test', after: o.edgeAfter != null ? o.edgeAfter : 100, kind: o.edgeKind || 'answer' },
    { match: 'signin.example.test', after: o.signAfter != null ? o.signAfter : 120, kind: o.signKind || 'answer', status: 200 }
  ];
}
function reportLine(page, prefix) {
  return (page.el('reportText').textContent.split('\n').filter(function (l) { return l.indexOf(prefix) === 0; })[0]) || '';
}

(async function main() {
  console.log('UI-216 connection-check verdicts  (' + path.relative(process.cwd(), PAGE) + ')');

  // ---- 1. Control: everything answers fast --------------------------------
  {
    const p = load({ routes: routes({}) });
    await p.runUntil(120000);
    check('1 control: a fast answer on every leg is green',
      p.el('probeA').attrs['data-state'] === 'pass' && p.el('probeB').attrs['data-state'] === 'pass'
        && p.el('probeC').attrs['data-state'] === 'pass' && /\bok\b/.test(p.el('verdict').className),
      'states A/B/C = ' + [p.el('probeA'), p.el('probeB'), p.el('probeC')].map(function (e) { return e.attrs['data-state']; }).join('/')
        + ', verdict class "' + p.el('verdict').className + '"');
    check('1 control: a fast database port reads Reachable, green',
      p.el('dbt-reach-0').className === 'dbt-reach ok' && /Reachable/.test(p.el('dbt-reach-0').textContent),
      'cell class "' + p.el('dbt-reach-0').className + '", text "' + p.el('dbt-reach-0').textContent + '"');
  }

  // ---- 2. The defect: GSI's edge answers, but after 10 s ------------------
  {
    const p = load({ routes: routes({ edgeAfter: 10000 }) });
    await p.runUntil(120000);
    const a = p.el('resultA').textContent;
    check('2 a slow answer is amber, not red', p.el('probeA').attrs['data-state'] === 'warn',
      'probe A state "' + p.el('probeA').attrs['data-state'] + '", text "' + a + '"');
    check('2 the row gives the elapsed time', /10000 ms/.test(a), 'probe A text "' + a + '"');
    check('2 the row does not blame a firewall', !/firewall/i.test(a), 'probe A text "' + a + '"');
    check('2 the verdict is not "can\'t reach the internet"',
      !/can.t reach the internet/i.test(p.el('verdictHeadline').textContent),
      'headline "' + p.el('verdictHeadline').textContent + '"');
    check('2 the verdict says the route is open, not a firewall block (UI-213\'s reading)',
      /not a firewall/i.test(p.el('verdictCause').innerHTML) && /\bmaybe\b/.test(p.el('verdict').className),
      'verdict class "' + p.el('verdict').className + '", cause "' + p.el('verdictCause').innerHTML + '"');
    check('2 leg 1 is drawn amber', legColour(p, 1) === AMBER, 'leg 1 colour ' + legColour(p, 1));
    const line = reportLine(p, 'Internet & GSI');
    check('2 the report line says slow, with the time', /slow/i.test(line) && /10000 ms/.test(line) && !/NO RESPONSE/.test(line),
      'report line "' + line + '"');
  }

  // ---- 3. While it waits past the slow mark, the row says so --------------
  {
    const p = load({ routes: routes({ edgeKind: 'hang' }) });
    await p.runUntil(7000);
    const a = p.el('resultA').textContent;
    check('3 past the slow mark, the row says it is still waiting', /still waiting/i.test(a), 'probe A text at 7 s "' + a + '"');
    await p.runUntil(120000);
  }

  // ---- 4. Control: no answer at all is still red, with the firewall advice
  {
    const p = load({ routes: routes({ edgeKind: 'hang' }) });
    await p.runUntil(120000);
    const a = p.el('resultA').textContent;
    check('4 control: no answer at all is red', p.el('probeA').attrs['data-state'] === 'fail', 'probe A state "' + p.el('probeA').attrs['data-state'] + '"');
    check('4 control: no answer at all keeps the firewall advice', /firewall/i.test(a), 'probe A text "' + a + '"');
    check('4 control: leg 1 is drawn red', legColour(p, 1) === RED, 'leg 1 colour ' + legColour(p, 1));
  }

  // ---- 5. Control: a fast refusal is red, "failed immediately" -----------
  {
    const p = load({ routes: routes({ edgeKind: 'reject', edgeAfter: 40 }) });
    await p.runUntil(120000);
    const a = p.el('resultA').textContent;
    check('5 control: a fast refusal is red and reads "failed immediately"',
      p.el('probeA').attrs['data-state'] === 'fail' && /failed immediately/i.test(a), 'probe A "' + a + '"');
  }

  // ---- 6. The defect, leg 2: the server's /comms-check answers in 15 s ----
  {
    const p = load({ routes: routes({ serverAfter: 15000 }) });
    await p.runUntil(120000);
    const b = p.el('resultB').textContent;
    check('6 a slow server answer is amber, not red', p.el('probeB').attrs['data-state'] === 'warn',
      'probe B state "' + p.el('probeB').attrs['data-state'] + '", text "' + b + '"');
    check('6 the server row gives the elapsed time and no firewall', /15000 ms/.test(b) && !/firewall/i.test(b), 'probe B text "' + b + '"');
    check('6 the verdict is not "server couldn\'t be reached"',
      !/couldn.t be reached/i.test(p.el('verdictHeadline').textContent), 'headline "' + p.el('verdictHeadline').textContent + '"');
    check('6 the server\'s own checks are still shown', /Connected\./.test(p.el('serverList').innerHTML), 'serverList empty');
    check('6 leg 2 is drawn amber', legColour(p, 2) === AMBER, 'leg 2 colour ' + legColour(p, 2));
  }

  // ---- 7. Control: the server never answers -> red, couldn't be reached --
  {
    const p = load({ routes: routes({ serverKind: 'hang' }) });
    await p.runUntil(120000);
    check('7 control: a server that never answers is red, "couldn\'t be reached"',
      p.el('probeB').attrs['data-state'] === 'fail' && /couldn.t be reached/i.test(p.el('verdictHeadline').textContent),
      'probe B state "' + p.el('probeB').attrs['data-state'] + '", headline "' + p.el('verdictHeadline').textContent + '"');
  }

  // ---- 8. The defect, leg 3: the sign-in service answers in 9 s ----------
  {
    const p = load({ routes: routes({ signAfter: 9000 }) });
    await p.runUntil(120000);
    const c = p.el('resultC').textContent;
    check('8 a slow sign-in answer is amber with the time',
      p.el('probeC').attrs['data-state'] === 'warn' && /9000 ms/.test(c) && !/firewall/i.test(c),
      'probe C state "' + p.el('probeC').attrs['data-state'] + '", text "' + c + '"');
    check('8 the verdict is not "sign-in service couldn\'t be reached"',
      !/couldn.t be reached/i.test(p.el('verdictHeadline').textContent), 'headline "' + p.el('verdictHeadline').textContent + '"');
  }

  // ---- 9. A slow database port is amber in the table ----------------------
  {
    const p = load({ routes: routes({ dbAfter: 7000 }) });
    await p.runUntil(120000);
    const cell = p.el('dbt-reach-0');
    check('9 a slow database port reads slow, with the time, not plain Reachable',
      /\bwarn\b/.test(cell.className) && /7000 ms/.test(cell.textContent) && /slow/i.test(cell.textContent),
      'cell class "' + cell.className + '", text "' + cell.textContent + '"');
  }

  // ---- 10. The database ports are probed over https -----------------------
  {
    // Dev shape: page served over http, agent named over http. The agents serve
    // TLS (VLC-147), so the data-services ports must be probed over https.
    const p = load({ href: 'http://localhost:8765/HelpDesk/connection-check.html?agent=http://localhost:34999',
                     routes: [server(200)].concat(routes({}).slice(1)) });
    await p.runUntil(120000);
    const db = p.calls.filter(function (u) { return u.indexOf(':34537/health') >= 0; });
    check('10 the database port is probed over https when the page and agent are http',
      db.length === 1 && db[0].indexOf('https://localhost:34537/health') === 0, 'database probe URL(s): ' + JSON.stringify(db));
  }
  {
    const p = load({ routes: routes({}) });
    await p.runUntil(120000);
    const db = p.calls.filter(function (u) { return u.indexOf(':34537/health') >= 0; });
    check('10 control: on an https page the database port is probed over https at the server\'s host',
      db.length === 1 && db[0].indexOf('https://rr.example.test:34537/health') === 0, 'database probe URL(s): ' + JSON.stringify(db));
  }

  console.log(failures ? ('\n' + failures + ' FAILED') : '\nall passed');
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.log('FAIL  harness error: ' + (e && e.stack || e)); process.exit(1); });
