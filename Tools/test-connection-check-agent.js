/* test-connection-check-agent.js -- UI-233: the Help Desk connection check finds the
 * agent the way every V8 page does.
 *
 *   node Tools/test-connection-check-agent.js
 *
 * Owner, 2026-10-26: leg 2 red and legs 4-5 grey on the dev box while everything worked.
 * The page read testAgentBase (http://localhost:34537) directly; the agents have served
 * TLS since VLC-147, so that address answers 400 "requires TLS" with no CORS header and the
 * browser rejects the fetch. The admin Troubleshooting page reads the signed-in session's
 * agent through RRDB.agentBase() and was green. Measured with PowerShell the same day.
 *
 * Runs the SHIPPED page script (the inline <script> of HelpDesk/connection-check.html) on
 * top of the real RRV8/config.js, with fetch answering the way the real agent did:
 *   - http://localhost:34537/...  rejects (what the browser does with the 400-without-CORS)
 *   - https://<session ip>/comms-check  200 with the three server-side checks, all ok
 *
 *   S1  signed in: probe 2 calls the session's https agent, not testAgentBase
 *   S2  and the diagram colours legs 2, 4 and 5 green from the agent's reply
 *   S3  the per-database port probes use the same https host
 *   N1  not signed in: unchanged, testAgentBase is used (the dev box) and the page
 *       reports leg 2 red with 4 and 5 grey -- the owner's screenshot, reproduced
 *   A1  ?agent= still wins over the session
 *   W1  the intro under the diagram says legs 4 and 5 wait on leg 2
 *   D1  each box shows its DNS name and IP, from the same rows as the addresses list
 *   D2  this PC shows none (a browser cannot learn them)
 *   D3  server not reached: only what the page itself knows
 *   D4  a long name is cut to fit, in full in its tooltip
 *
 * MUTATION CONTROLS: removing the RRDB line from the page must redden S1; drawing the
 * diagram without its rows must redden D1.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PAGE = fs.readFileSync(path.join(ROOT, 'HelpDesk', 'connection-check.html'), 'utf8').replace(/\r\n/g, '\n');
const CONFIG = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8');
const m = /<script>\n\(function \(\) \{[\s\S]*?\n\}\)\(\);\n<\/script>/.exec(PAGE);
if (!m) { console.log('HARNESS BROKEN: the page script was not found'); process.exit(1); }
const SCRIPT = m[0].replace(/^<script>\n/, '').replace(/<\/script>$/, '');
const RRDB_LINE = "                || (window.RRDB && window.RRDB.agentBase && window.RRDB.agentBase())\n";

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

// A JWT whose active database's agent is at `ip` (only the payload is read).
function token(ip) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64({ alg: 'none' }) + '.' + b64({ dbs: [{ n: 'RapidReconciler_Demo1', ip: ip }] }) + '.sig';
}
// The reply's shape is the live agent's (8.0.49, measured 2026-10-26): host, resolved, endpoints, checks.
const CHECKS = { agent: 'client-services', host: { hostname: 'APP01', internalIp: '10.0.0.5', port: '34537' },
  databases: [{ databaseName: 'RapidReconciler_Demo1', servicePort: 34537 }],
  resolved: { 'rapidreconciler-prod.getgsi.com': '20.0.0.37', 'localhost': '127.0.0.1' },
  endpoints: [{ scope: 'server', label: 'Database', host: 'sqlhost.example.test', ip: '10.0.0.9', port: '1433' },
              { scope: 'server', label: 'GSI / VALC', host: 'localhost', ip: '127.0.0.1', port: '8080' }],
  checks: [{ name: 'sql.reachable', status: 'ok' }, { name: 'sql.rr_dbs_present', status: 'ok' }, { name: 'valc.reachable', status: 'ok' }] };

async function load(script, opt) {
  const els = {}, fetched = [];
  const el = (id) => els[id] || (els[id] = { id, textContent: '', innerHTML: '', hidden: false, disabled: false, style: {}, className: '',
    setAttribute(a, v) { this[a] = v; }, getAttribute(a) { return this[a]; }, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const store = opt.token ? { 'rrv8.token': opt.token } : {};
  const sb = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, atob, Promise,
    performance: { now: () => Date.now() },
    location: { protocol: 'http:', host: 'localhost:8765', hostname: 'localhost', search: opt.search || '', href: 'http://localhost:8765/HelpDesk/connection-check.html' + (opt.search || '') },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: {},
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: () => el('_tmp'), body: el('body'), addEventListener() {}, readyState: 'complete' },
    fetch: (url) => {
      fetched.push(url);
      if (/^http:\/\/localhost:34537\//.test(url)) return Promise.reject(new TypeError('Failed to fetch'));   // 400 "requires TLS", no CORS header
      if (/\/comms-check\?/.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CHECKS) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CONFIG, sb);
  vm.runInContext(script, sb);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));   // let the probes settle
  // Leg colours, read back off the drawn diagram: each leg is a circle followed by its number.
  const svg = String(els.netdiagram ? els.netdiagram.innerHTML : '');
  const legs = {};
  svg.replace(/<circle [^>]*fill="(#[0-9a-f]+)"\/><text [^>]*>(\d)<\/text>/g, (x, col, n) => { legs[n] = col; return x; });
  // Each box's address lines, as drawn (the visible text, not the <title> tooltip), plus the tooltips.
  const boxes = {};
  svg.split('<rect ').slice(1).forEach((chunk) => {
    const label = (/font-weight="700" fill="#1f2d4a">([^<]+)<\/text>/.exec(chunk) || [])[1];
    if (!label) return;
    const lines = [], titles = [];
    chunk.replace(/<text data-addr="1"[^>]*><title>([^<]*)<\/title>([^<]*)<\/text>/g, (x, t, v) => { titles.push(t); lines.push(v); return x; });
    boxes[label] = { lines, titles };
  });
  return { fetched, legs, boxes, els };
}
const GREEN = '#2e8a55', RED = '#b8463a', GREY = '#c9d3e0';
const comms = (r) => r.fetched.filter((u) => /\/comms-check\?/.test(u)).map((u) => u.split('/comms-check')[0]);

async function suite(script, label) {
  if (label) console.log(label);
  const s = await load(script, { token: token('rr.example.test:34537') });
  check('S1 signed in: probe 2 calls the session\'s https agent, not testAgentBase', comms(s), ['https://rr.example.test:34537']);
  check('S2 and the diagram colours legs 2, 4 and 5 green from the agent\'s reply', [s.legs[2], s.legs[4], s.legs[5]], [GREEN, GREEN, GREEN]);
  check('S3 the per-database port probe uses the same https host',
        // Path exactly /health: config.js makes its own /api/v1/ai/health call on load.
        s.fetched.filter((u) => /^https?:\/\/[^/]+\/health\?/.test(u)).map((u) => u.split('/health')[0]), ['https://rr.example.test:34537']);
  const n = await load(script, {});
  check('N1 not signed in: testAgentBase is used, as before', comms(n), ['http://localhost:34537']);
  check('N1 and the owner\'s screenshot reproduces: leg 2 red, legs 4 and 5 grey', [n.legs[2], n.legs[4], n.legs[5]], [RED, GREY, GREY]);
  const a = await load(script, { token: token('rr.example.test:34537'), search: '?agent=https://other.example.test:40000' });
  check('A1 ?agent= still wins over the session', comms(a), ['https://other.example.test:40000']);

  // D1-D4 (owner 2026-10-26: "Can the diagram show the dns name and ip in each box as applicable?")
  const L = (r, box) => (r.boxes[box] ? r.boxes[box].lines : null);
  check('D1 the application server box: the name this PC used, and the server\'s own IP', L(s, 'Application Server'), ['rr.example.test', '10.0.0.5']);
  check('D1 the database box: the server\'s database endpoint and its IP', L(s, 'Database'), ['sqlhost.example.test', '10.0.0.9']);
  check('D1 the GSI edge box: its name and the IP the server resolved for it', L(s, 'GSI Edge / UI'), ['rapidreconciler-prod.getgsi.com', '20.0.0.37']);
  check('D1 the sign-in box: its name and the IP the server resolved for it', L(s, 'GSI Sign-In'), ['localhost', '127.0.0.1']);
  // The production edge name every customer sees must fit whole, not be cut.
  check('D1 the production GSI edge name fits its box uncut', (L(s, 'GSI Edge / UI') || [])[0], 'rapidreconciler-prod.getgsi.com');
  check('D2 this PC shows no address (a browser cannot learn its own name or IP)', L(s, 'This PC'), []);
  check('D2 CONTROL: every box was found on the drawing', ['GSI Edge / UI', 'GSI Sign-In', 'This PC', 'Application Server', 'Database'].every((b) => !!s.boxes[b]), true);
  // Server not reached: only what the page itself knows.
  check('D3 server not reached: the app server box keeps the name it tried, with no IP', L(n, 'Application Server'), ['localhost']);
  check('D3 and the database box is empty (only the server could have said)', L(n, 'Database'), []);
  // A long name is cut to fit, and the full name rides in the tooltip and the list below.
  const longName = 'rapidreconciler-application-server-01.customer-internal.example.test';
  const lg = await load(script, { token: token(longName + ':34537') });
  const app = lg.boxes['Application Server'] || { lines: [], titles: [] };
  check('D4 a long name is cut with an ellipsis to fit the box, the full name kept in its tooltip',
        [app.lines[0] && app.lines[0].endsWith('…'), app.lines[0] && app.lines[0].length < longName.length, app.titles[0]], [true, true, longName]);
  const listed = String(lg.els.netpathList ? lg.els.netpathList.innerHTML : '');
  check('D4 and the addresses list below the diagram still has the GSI edge in full (same rows as the boxes)', listed.indexOf('rapidreconciler-prod.getgsi.com (20.0.0.37)') >= 0, true);
}

(async function () {
  check('W1 the intro under the diagram says legs 4 and 5 wait on leg 2',
        /Legs 4 and 5 are checked by your RapidReconciler server, so they stay grey until leg 2 reaches it\./.test(PAGE), true);
  await suite(SCRIPT, 'Connection check (HelpDesk/connection-check.html)');
  const real = failures;

  console.log('\nmutation control');
  const MUT = SCRIPT.replace(RRDB_LINE, '');
  if (MUT === SCRIPT) { console.log('  HARNESS BROKEN: the mutation changed nothing'); process.exit(1); }
  failures = 0; reds = [];
  const log = console.log; console.log = () => {};
  await suite(MUT, '');
  console.log = log;
  const ok = reds.indexOf('S1') >= 0;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: without the RRDB line the page calls testAgentBase and S1 reddens' + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));
  const MUT2 = SCRIPT.replace('renderDiagram(legs, buildPathRows(b));', 'renderDiagram(legs);');
  if (MUT2 === SCRIPT) { console.log('  HARNESS BROKEN: the second mutation changed nothing'); process.exit(1); }
  failures = 0; reds = [];
  console.log = () => {};
  await suite(MUT2, '');
  console.log = log;
  const ok2 = reds.indexOf('D1') >= 0;
  console.log('  ' + (ok2 ? 'ok  ' : 'FAIL') + '  control: drawing the diagram without its rows reddens D1' + (ok2 ? '' : ' (reddened: ' + reds.join(',') + ')'));

  const pass = real === 0 && ok && ok2;
  console.log('\nRESULT: ' + (pass ? 'all assertions and both mutation controls pass' : real + ' assertion(s) failed'));
  process.exit(pass ? 0 : 1);
})();
