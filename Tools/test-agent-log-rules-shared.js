/*
 * test-agent-log-rules-shared.js  --  VLC-223
 *
 * WHAT THIS GUARDS
 * ----------------
 * Two pages judge a RapidReconciler agent log: this repo's Help Desk Log
 * Analyzer (HelpDesk/log-analyzer.html, public) and VALC's Troubleshooting
 * Step 2 (templates/troubleshooting.html in the private Valc repo, held equal
 * to its Java port AgentLogRules.java). On 2026-10-28 the two tables shared 52
 * of 59 rules: three Help Desk root causes (read-only database, unset refresh
 * job name, SQL login timeout) were missing from VALC, four VALC rules were
 * missing here (so every DEBUG line in a V8 log read as "Unrecognized"), and
 * three shared rules had different patterns. Nothing compared the two repos.
 *
 * HOW THE TWO REPOS ARE KEPT EQUAL
 * --------------------------------
 * The UI repo is public and the Valc repo private, so only one direction can
 * read the other: Valc's CI can fetch a file from this repo, this repo's CI
 * cannot see Valc. So the shared table is written down HERE, as
 * HelpDesk/agent-log-rules.json (name, severity, pattern source, flags, in
 * order: everything that decides which rule takes a line), and:
 *   - this test fails when the Help Desk's table differs from the contract, in
 *     the same PR that changed it;
 *   - Valc's src/test/js/test-vlc223-help-desk-rules.js fails when VALC's table
 *     differs from the contract on this repo's main.
 * Notes and fixes are not in the contract: each page writes them for its reader.
 *
 * To change a rule: edit this page, run
 *   node Tools/test-agent-log-rules-shared.js --write
 * to rewrite the contract from it, merge, then make the same change to VALC's
 * troubleshooting.html and AgentLogRules.java. Valc's test is red until then,
 * which is the point.
 *
 * Fail-first: `node Tools/test-agent-log-rules-shared.js <old-page.html>`
 * runs the same assertions against another copy of the page.
 *
 * BLIND SPOTS, named:
 *   - Equal tables give equal verdicts only if the pages split a log into
 *     entries the same way. The entry-start pattern is not in the contract.
 *   - It cannot see VALC from here; the Valc test is the other half.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const PAGE = args.find((a) => a !== '--write')
  ? path.resolve(args.find((a) => a !== '--write'))
  : path.join(__dirname, '..', 'HelpDesk', 'log-analyzer.html');
const CONTRACT = path.join(__dirname, '..', 'HelpDesk', 'agent-log-rules.json');

let failures = 0;
function check(name, pass, why) {
  if (pass) console.log('  PASS  ' + name);
  else { failures++; console.log('  FAIL  ' + name + (why ? '\n          ' + why : '')); }
}

// The page's shipped table and classifier, evaluated, not retyped.
function pageRules(html) {
  const start = html.indexOf('const AGENT_RULES = [');
  const end = html.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error('const AGENT_RULES = [ ... ]; not found in ' + PAGE);
  const ctx = {};
  vm.runInNewContext(html.slice(start, end + 3).replace('const AGENT_RULES =', 'AGENT_RULES ='), ctx);
  return ctx.AGENT_RULES;
}
function pageClassifier(html) {
  const m = /function classifyLine\(line, rules\) \{[\s\S]*?\n\}/.exec(html);
  if (!m) throw new Error('function classifyLine not found in ' + PAGE);
  const ctx = {};
  vm.runInNewContext(m[0].replace('function classifyLine', 'classifyLine = function'), ctx);
  return ctx.classifyLine;
}
const shape = (rules) => rules.map((r) => ({ name: r.name, severity: r.severity, source: r.match.source, flags: r.match.flags }));

// One rule per line, so a change to the contract reads as a one-line diff.
function render(rules) {
  return '{\n'
    + '  "about": "VLC-223. The agent-log rules the Help Desk Log Analyzer (HelpDesk/log-analyzer.html) and VALC\'s Troubleshooting Step 2 both use: name, severity, pattern source and flags, in the order they are tried; the first match takes the line. Written by node Tools/test-agent-log-rules-shared.js --write from the Help Desk page. Valc\'s test-vlc223-help-desk-rules.js reads this file from main.",\n'
    + '  "rules": [\n'
    + rules.map((r) => '    ' + JSON.stringify(r)).join(',\n') + '\n'
    + '  ]\n}\n';
}

const html = fs.readFileSync(PAGE, 'utf8');
const page = shape(pageRules(html));

if (WRITE) {
  fs.writeFileSync(CONTRACT, render(page));
  console.log('wrote ' + page.length + ' rules to ' + CONTRACT);
  process.exit(0);
}

console.log('page:     ' + PAGE);
console.log('contract: ' + CONTRACT);

// 1. ------------------------------------------------------------ the page against the contract
const contract = JSON.parse(fs.readFileSync(CONTRACT, 'utf8')).rules;
check('CONTROL: both parsed, with a table\'s worth of rules (page ' + page.length + ', contract ' + contract.length + ')',
      page.length > 50 && contract.length > 50);
{
  const pn = new Set(page.map((r) => r.name)), cn = new Set(contract.map((r) => r.name));
  const missing = contract.filter((r) => !pn.has(r.name)).map((r) => r.name);
  const extra = page.filter((r) => !cn.has(r.name)).map((r) => r.name);
  const moved = [];
  for (let i = 0; i < Math.max(page.length, contract.length); i++) {
    if (JSON.stringify(page[i]) !== JSON.stringify(contract[i])) {
      moved.push(i + ': page ' + JSON.stringify(page[i]) + '\n             contract ' + JSON.stringify(contract[i]));
    }
  }
  check('every contract rule is on the page', missing.length === 0, 'missing: ' + missing.join(' | '));
  check('the page has no rule the contract lacks', extra.length === 0, 'extra: ' + extra.join(' | '));
  check('rule by rule, name, severity, pattern, flags and position match the contract (VALC reads the same file)',
        moved.length === 0, moved.slice(0, 4).join('\n          ')
        + (moved.length ? '\n          If the page change is intended: node Tools/test-agent-log-rules-shared.js --write,'
          + '\n          then make the same change in Valc (troubleshooting.html + AgentLogRules.java).' : ''));
  // MUTATION ARM: a one-word change on the page alone must be seen.
  const mutated = shape(pageRules(html.replace("match: /\\bWARN\\b/, severity: 'flag'", "match: /\\bWARN\\b/, severity: 'noise'")));
  check('MUTATION ARM: WARN level made noise on the page alone differs from the contract',
        JSON.stringify(mutated) !== JSON.stringify(page) && JSON.stringify(mutated) !== JSON.stringify(contract));
}

// 2. ------------------------------------------------------------ what the shared rules do, through the page's classifier
{
  const rules = pageRules(html), classify = pageClassifier(html);
  const took = (line) => classify(line, rules).rule;
  const cases = [
    ['a V8 DEBUG line is routine, not Unrecognized',
     '2026-10-28T00:00:00.281Z DEBUG 19620 --- [client-services-agent] [main] c.r.c.s.Foo : routine', 'Routine DEBUG', 'noise'],
    ['a certificate failure logged at DEBUG is still critical (DEBUG is tried last)',
     '2026-10-28T00:00:00.281Z DEBUG 1 --- [x] [main] c.r.Foo : PKIX path building failed', "Don't trust VALC's security certificate", 'crit'],
    ['the data services\' accepted heartbeat facts are healthy',
     '2026-10-28T00:00:00.281Z DEBUG 1 --- [x] [scheduling-1] c.r.c.s.s.ValcHeartbeatReporter : Heartbeat-facts OK: 200 body={}', 'Reported its heartbeat facts', 'good'],
    ['a V8 Troubleshooting verdict is a page visit, even when it says "Login timed out"',
     '2026-10-28T11:39:31.623Z  WARN 1 --- [x] [exec-2] [b988f2c40e1b] c.r.c.s.c.TroubleshootingController      : troubleshooting verdict: sql.connection is fail after 15002 ms: Login timed out.',
     'V8 Troubleshooting verdict (a page visit, not a fault)', 'noise'],
    ['a dropped socket to a monitored database is flagged by name',
     '2026-10-05 13:46:17.490 ERROR 4242 --- [main] c.r.agent.db.DatabaseManagerServiceMsSqlImpl : Error when quering: Socket closed', 'Agent cannot reach a monitored database', 'flag'],
    ['a SQL login timeout takes its own heading ahead of the monitored-database rule',
     '2026-10-05 13:46:17.490 ERROR 4242 --- [main] c.r.agent.db.DatabaseManagerServiceMsSqlImpl : Error connecting to database: Login timed out', 'Timed out logging in to SQL Server', 'flag'],
    ['CONTROL: an ordinary ERROR is still ERROR level',
     '2026-10-05 13:46:17.490 ERROR 4242 --- [main] c.r.Foo : boom', 'ERROR level', 'crit'],
    ['CONTROL: a line no rule knows is still Unrecognized',
     '2026-10-05 13:46:17.490 TRACE 4242 --- [main] c.r.Foo : something new', 'Unrecognized', 'flag'],
  ];
  for (const [what, line, name, sev] of cases) {
    const r = took(line);
    check(what, r.name === name && r.severity === sev, 'got ' + r.name + ' [' + r.severity + ']');
  }
}

console.log('');
console.log(failures ? 'RESULT: ' + failures + ' failed' : 'RESULT: all passed');
process.exit(failures ? 1 : 0);
