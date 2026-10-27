/* test-connection-check-topology.js -- VLC-210: the Connection Check shows the servers VALC has on file.
 *
 *   node Tools/test-connection-check-topology.js
 *
 * Owner ruling 2026-10-26 (Q8, "Yes, build it"), from VALC's Topology card: "DNS names and IP's are known.
 * Nothing says localhost. I think we can be more detailed than that." With a sign-in, the page asks VALC
 * (GET api/v1/tenant/databases/{uuid}/servers; any signed-in user of the client, owner ruling 2026-10-27)
 * for this database's servers and fills
 * what the agent's own reply could not: the database and application server boxes when the server was not
 * reached, and a JDE Source box the page cannot see at all. A configured address is marked "on file" so it
 * never reads as one this check measured.
 *
 * Runs the SHIPPED page script on top of the real RRV8/config.js, the way test-connection-check-agent.js does.
 *
 *   T1  server NOT reached: the database box and the app server's IP come from VALC, marked "on file"
 *   T2  server reached: the database box keeps what the server measured; the on-file one does not replace it
 *   T3  one request, to VALC's tenant route for the active database's uuid, carrying the sign-in's token
 *   T4  a JDE Source box is drawn from the file, and the address list carries an "On file in VALC" group
 *   T5  VALC refuses (a database not on the caller's account): the list says so in VALC's words, and the boxes
 *       are as before
 *   T6  no sign-in, or a database with no uuid: VALC is not asked at all
 *
 * MUTATION ARMS: the on-file fill removed from the boxes must redden T1 only (T2-T6 green);
 * the topology request removed must redden T1, T3, T4 and T5 (no request, so no refusal to report either).
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

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

const UUID = '6f1c2b9e-0000-4000-8000-000000000010';
function token(ip, uuid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const db = { n: 'RapidReconciler_Prod_V8', ip: ip };
  if (uuid) db.uuid = uuid;
  return b64({ alg: 'none' }) + '.' + b64({ dbs: [db] }) + '.sig';
}
const CHECKS = { agent: 'client-services', host: { hostname: 'APP01', internalIp: '10.0.0.5', port: '34537' },
  databases: [{ databaseName: 'RapidReconciler_Prod_V8', servicePort: 34537 }],
  resolved: { 'rapidreconciler-prod.getgsi.com': '20.0.0.37' },
  endpoints: [{ scope: 'server', label: 'Database', host: 'sqlhost.example.test', ip: '10.0.0.9', port: '1433' }],
  checks: [{ name: 'sql.reachable', status: 'ok' }, { name: 'valc.reachable', status: 'ok' }] };
// What VALC's TenantServersController returns: four fields per server, no credential.
const TOPOLOGY = [
  { role: 'SQL_SERVER', name: 'ACME-SQL01', address: '10.20.0.5', hostsThisDatabase: true },
  { role: 'JDE_SOURCE', name: 'ACME-JDE', address: '10.20.0.9', hostsThisDatabase: false },
  { role: 'APP_SERVER', name: 'ACME-APP', address: '10.20.0.20', hostsThisDatabase: false }];

async function load(script, opt) {
  const els = {}, fetched = [];
  const el = (id) => els[id] || (els[id] = { id, textContent: '', innerHTML: '', hidden: false, disabled: false, style: {}, className: '',
    setAttribute(a, v) { this[a] = v; }, getAttribute(a) { return this[a]; }, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const store = Object.assign(opt.token ? { 'rrv8.token': opt.token } : {}, opt.store || {});
  const sb = {
    console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, atob, Promise,
    performance: { now: () => Date.now() },
    location: { protocol: 'http:', host: 'localhost:8765', hostname: 'localhost', search: '', href: 'http://localhost:8765/HelpDesk/connection-check.html' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    navigator: {},
    document: { getElementById: el, querySelector: () => null, querySelectorAll: () => [], createElement: () => el('_tmp'), body: el('body'), addEventListener() {}, readyState: 'complete' },
    fetch: (url, init) => {
      fetched.push({ url: String(url), auth: init && init.headers ? init.headers.Authorization : undefined });
      if (/\/api\/v1\/tenant\/databases\/[^/]+\/servers$/.test(url)) {
        if (opt.refuse) return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ message: opt.refuse }) });
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(TOPOLOGY) });
      }
      if (opt.unreached && /\/comms-check\?/.test(url)) return Promise.reject(new TypeError('Failed to fetch'));
      if (/\/comms-check\?/.test(url)) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CHECKS) });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CONFIG, sb);
  vm.runInContext(script, sb);
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  const svg = String(els.netdiagram ? els.netdiagram.innerHTML : '');
  const boxes = {};
  svg.split('<rect ').slice(1).forEach((chunk) => {
    const label = (/font-weight="700" fill="#1f2d4a">([^<]+)<\/text>/.exec(chunk) || [])[1];
    if (!label) return;
    const lines = [];
    chunk.replace(/<text data-addr="1"[^>]*><title>([^<]*)<\/title>([^<]*)<\/text>/g, (x, t) => { lines.push(t); return x; });
    boxes[label] = lines;
  });
  const valcBase = vm.runInContext('(window.RRDB && window.RRDB.valcBase && window.RRDB.valcBase()) || ""', sb);
  return { fetched, boxes, els, valcBase, list: String(els.netpathList ? els.netpathList.innerHTML : '') };
}
const topoCalls = (r) => r.fetched.filter((f) => /\/api\/v1\/tenant\/databases\//.test(f.url));

async function suite(script, label) {
  reds = [];
  if (label) console.log(label);
  const u = await load(script, { token: token('rr.example.test:34537', UUID), unreached: true });
  check('T1 server not reached: the database box is the SQL Server on file', u.boxes['Database'], ['ACME-SQL01', '10.20.0.5 · on file']);
  check('T1 and the application server box takes the on-file IP', (u.boxes['Application Server'] || [])[1], '10.20.0.20 · on file');

  const s = await load(script, { token: token('rr.example.test:34537', UUID) });
  check('T2 server reached: the database box keeps what the server measured', s.boxes['Database'], ['sqlhost.example.test', '10.0.0.9']);
  check('T2 and the application server box keeps the server\'s own IP', (s.boxes['Application Server'] || [])[1], '10.0.0.5');

  const calls = topoCalls(s);
  check('T3 one request, to VALC\'s route for this database\'s uuid, with the sign-in\'s token',
    calls.map((c) => [c.url, c.auth]),
    [[s.valcBase + '/api/v1/tenant/databases/' + UUID + '/servers', 'Bearer ' + token('rr.example.test:34537', UUID)]]);
  check('T3 CONTROL: this installation has a VALC address to send it to', !!s.valcBase, true);

  check('T4 a JDE Source box, from the file', s.boxes['JDE Source'], ['ACME-JDE', '10.20.0.9 · on file']);
  check('T4 the list carries the on-file servers, said to be untested',
    [/On file in VALC \(your Topology; not tested by this check\)/.test(s.list), /SQL Server \(this database\)/.test(s.list),
     /ACME-JDE \(10\.20\.0\.9\)/.test(s.list), /ACME-APP \(10\.20\.0\.20\)/.test(s.list)], [true, true, true, true]);

  const msg = 'That database is not on your account.';
  const ref = await load(script, { token: token('rr.example.test:34537', UUID), unreached: true, refuse: msg });
  check('T5 refused: the list says so, in VALC\'s words', ref.list.indexOf('are not shown: That database is not on your account.') >= 0, true);
  check('T5 and the boxes are as they were without it (no database, no JDE box)', [ref.boxes['Database'], !!ref.boxes['JDE Source']], [[], false]);

  const n = await load(script, {});
  const nu = await load(script, { token: token('rr.example.test:34537', null) });
  check('T6 no sign-in, or a database with no uuid: VALC is not asked', [topoCalls(n).length, topoCalls(nu).length], [0, 0]);
  check('T6 CONTROL: with neither, the page still draws its boxes', !!n.boxes['Database'] && !n.boxes['JDE Source'], true);
  return reds;
}

(async function main() {
  await suite(SCRIPT, 'shipped page');
  const shipped = failures;
  let armFail = 0;
  async function arm(label, from, to, want) {
    const mutant = SCRIPT.replace(from, to);
    if (mutant === SCRIPT) { console.log('HARNESS BROKEN: arm "' + label + '" changed nothing'); process.exit(1); }
    const saved = failures;
    const got = await suite(mutant, '\nmutation arm: ' + label);
    failures = saved;
    const uniq = [...new Set(got)];
    const ok = JSON.stringify(uniq) === JSON.stringify(want);
    if (!ok) armFail++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + (uniq.join(',') || 'nothing') + '; needed ' + want.join(','));
  }
  if (shipped === 0) {
    await arm('the on-file fill removed from the boxes', '    if (!a.db && dbServer) a.db = onFile(dbServer);\n', '', ['T1']);
    await arm('the topology request removed', '    var pT = loadTopology();   // VLC-210\n', '    var pT = Promise.resolve(null);\n', ['T1', 'T3', 'T4', 'T5']);
  }
  const total = shipped + armFail;
  console.log('\nRESULT: ' + (total === 0 ? 'all passed' : total + ' failed'));
  process.exit(total === 0 ? 0 : 1);
})();
