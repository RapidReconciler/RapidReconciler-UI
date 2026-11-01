/*
 * test-vlc236-log-signal.js  --  VLC-236
 *
 * Owner, 2026-11-01, on a Step 2 screenshot: "Is this really an issue?" It was not. Demo1's one flagged line was
 * Spring's WARN for a browser that closed the connection mid-reply, and the reply it sat on, a Transactions load,
 * took 35 seconds where 34 loads on the two days before took 0.3-7.5 s. The analyzer flagged the harmless line
 * ("WARN level") and filed the slow request among its suppressed routine lines ("Routine INFO").
 *
 * Runs the Help Desk page's real AGENT_RULES and classifyLine on lines copied from that log (services-34537.log,
 * 2026-11-01; paths and timings only, no customer data):
 *   D1  the disconnect WARN is noise, under its own name
 *   S1  the 35-second Transactions request is a flag, under the slow-request name
 *   S2  a 20,000 ms request is a flag (the boundary)
 *   F1  a 19,999 ms request and a 5,532 ms one stay "Routine INFO" noise
 *   W1  CONTROL: an unrelated WARN is still the "WARN level" flag
 *
 * MUTATIONS, each must turn its cases red: the slow rule moved below "Routine INFO" (S1, S2); the disconnect rule
 * removed (D1).
 *
 *   node Tools/test-vlc236-log-signal.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = fs.readFileSync(path.join(__dirname, '..', 'HelpDesk', 'log-analyzer.html'), 'utf8').replace(/\r\n/g, '\n');

function load(html) {
  const start = html.indexOf('const AGENT_RULES = [');
  const end = html.indexOf('\n];', start);
  const m = /function classifyLine\(line, rules\) \{[\s\S]*?\n\}/.exec(html);
  if (start < 0 || end < 0 || !m) { console.log('HARNESS BROKEN: AGENT_RULES or classifyLine not found'); process.exit(1); }
  const ctx = {};
  vm.runInNewContext(html.slice(start, end + 3).replace('const AGENT_RULES =', 'AGENT_RULES =') + '\n'
    + m[0].replace('function classifyLine', 'classifyLine = function'), ctx);
  return (line) => ctx.classifyLine(line, ctx.AGENT_RULES).rule;   // the page returns { rule, line }
}

const DISCONNECT = '2026-11-01T12:51:13.314Z  WARN 16072 --- [client-services-agent] [https-jsse-nio-0.0.0.0-34537-exec-2] '
  + '[39f5bb1060d0] .w.s.m.s.DefaultHandlerExceptionResolver : Ignoring exception, response committed already: '
  + 'org.springframework.http.converter.HttpMessageNotWritableException: Could not write JSON: ServletOutputStream '
  + 'failed to write: java.io.IOException: An established connection was aborted by the software in your host machine';
const req = (ms, what) => '2026-11-01T12:51:13.315Z  INFO 16072 --- [client-services-agent] '
  + '[https-jsse-nio-0.0.0.0-34537-exec-2] [39f5bb1060d0] c.r.c.services.config.RequestLogFilter   : '
  + (what || 'POST /inventory/transactions') + ' -> 200 in ' + ms + ' ms';
const OTHER_WARN = '2026-11-01T12:00:00.000Z  WARN 16072 --- [client-services-agent] [main] c.r.c.s.SomeService : something unexpected';

let reds = [];
function check(id, name, ok, got) {
  if (!ok) reds.push(id);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + id + ' ' + name + (ok ? '' : '   got ' + JSON.stringify(got)));
}
const is = (r, name, sev) => r && r.name === name && r.severity === sev;
const SLOW = 'A request took 20 seconds or more';
const GONE = 'The browser stopped waiting for a reply (benign)';

function run(html) {
  reds = [];
  const c = load(html);
  let r = c(DISCONNECT);
  check('D1', 'the client-disconnect WARN is noise', is(r, GONE, 'noise'), r && [r.name, r.severity]);
  r = c(req(35246));
  check('S1', 'the 35,246 ms Transactions request is flagged as slow', is(r, SLOW, 'flag'), r && [r.name, r.severity]);
  r = c(req(20000, 'GET /inventory/disposition/list'));
  check('S2', 'a 20,000 ms request is flagged (the boundary)', is(r, SLOW, 'flag'), r && [r.name, r.severity]);
  const a = c(req(19999)), b = c(req(5532, 'POST /inventory/as-of'));
  check('F1', '19,999 ms and 5,532 ms stay Routine INFO noise', is(a, 'Routine INFO', 'noise') && is(b, 'Routine INFO', 'noise'),
    [a && a.name, b && b.name]);
  r = c(OTHER_WARN);
  check('W1', 'CONTROL: an unrelated WARN is still the WARN level flag', is(r, 'WARN level', 'flag'), r && [r.name, r.severity]);
  return reds.slice();
}

console.log('VLC-236: the Help Desk analyzer on the 2026-11-01 Demo1 lines');
const real = run(PAGE);

// Mutation 1: the slow rule below "Routine INFO" (where a rule written without thinking about order would land).
const slowStart = PAGE.indexOf("  // VLC-236: ahead of \"Routine INFO\"");
const slowEnd = PAGE.indexOf("  { name: 'Routine INFO',");
const infoEnd = PAGE.indexOf('\n', PAGE.indexOf("match: /\\bINFO\\b/, severity: 'noise' },", slowEnd)) + 1;
if (slowStart < 0 || slowEnd < slowStart || infoEnd <= slowEnd) { console.log('HARNESS BROKEN: slow-rule mutation anchors'); process.exit(1); }
const moved = PAGE.slice(0, slowStart) + PAGE.slice(slowEnd, infoEnd) + PAGE.slice(slowStart, slowEnd) + PAGE.slice(infoEnd);
console.log('\nMutation: the slow-request rule below Routine INFO (S1, S2 must go red)');
const m1 = run(moved);
const ok1 = ['S1', 'S2'].every((id) => m1.includes(id)) && !m1.includes('W1') && !m1.includes('D1');

// Mutation 2: the disconnect rule removed.
const goneStart = PAGE.indexOf("  { name: '" + GONE + "',");
const goneEnd = PAGE.indexOf('\n', PAGE.indexOf('note:', goneStart)) + 1;
if (goneStart < 0 || goneEnd <= goneStart) { console.log('HARNESS BROKEN: disconnect-rule mutation anchors'); process.exit(1); }
console.log('\nMutation: the disconnect rule removed (D1 must go red)');
const m2 = run(PAGE.slice(0, goneStart) + PAGE.slice(goneEnd));
const ok2 = m2.includes('D1') && !m2.includes('W1') && !m2.includes('S1');

console.log('\n  ' + (ok1 ? 'ok  ' : 'FAIL') + '  slow-rule mutation caught by ' + JSON.stringify(m1));
console.log('  ' + (ok2 ? 'ok  ' : 'FAIL') + '  disconnect mutation caught by ' + JSON.stringify(m2));
const pass = real.length === 0 && ok1 && ok2;
console.log('\n' + (pass ? 'PASS' : 'FAIL') + (real.length ? ': real case(s) red ' + real.join(',') : ''));
process.exit(pass ? 0 : 1);
