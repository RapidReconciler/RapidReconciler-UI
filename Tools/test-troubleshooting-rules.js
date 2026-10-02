/*
 * test-troubleshooting-rules.js  --  UI-209
 *
 * WHAT THIS GUARDS
 * ----------------
 * RRV8/troubleshooting-rules.js is the one producer of what V8 says about a
 * GET admin/troubleshooting read: admin-troubleshooting.html renders its rows
 * and Home's Troubleshooting card rolls them up. Three things must hold:
 *
 *   1. The verdicts follow VALC's order. A FAILED scheduled reconciliation is
 *      the worst state even when the step log reads clean (DAC-82: SQL Agent
 *      fails a step on a severity-16 error the batch survived), and an error a
 *      later clean run has cleared is history, not a current problem (VLC-136;
 *      the agent drops those before they reach here).
 *   2. The VOICE. Every row that is not OK tells the reader what to do, and the
 *      escalation is always their own IT department, never GSI (owner rule
 *      2026-07-21, feedback_rr_product_voice). A sentence is not a rule unless
 *      something fails when it is broken, so this asserts it over every row of
 *      every fixture.
 *   3. No SQL plumbing in what a finance reader sees (msdb, system tables,
 *      procedure names), including where the agent's own text would carry it.
 *
 * HOW
 * ---
 * The shipped file is read and executed in a vm sandbox, unchanged. The
 * fixtures are the payloads the real agent code returned against Demo1 and
 * Demo3 on 2026-10-02 (run as rruser through InstallDiagnosticsCollector and
 * TroubleshootingService), plus failure cases built from the agent's own
 * sentences.
 *
 * MUTATIONS
 * ---------
 * Section 3 re-injects each defect into the source text and requires the named
 * assertion to go RED, and the others to stay GREEN.
 *
 * BLIND SPOTS, named: no browser, so it proves the rows, not the rendering; and
 * it trusts the fixtures to be the agent's shape, which the agent's own tests
 * (TroubleshootingServiceRulesTest, InstallDiagnosticsNewChecksTest) pin.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_PATH = path.join(__dirname, '..', 'RRV8', 'troubleshooting-rules.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

function load(src) {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'troubleshooting-rules.js' });
  return sandbox.window.RRV8.troubleshooting;
}

// ------------------------------------------------------------------ fixtures
const DEMO1 = {
  database: 'RapidReconciler_Demo1',
  versions: { services: '0.2.0', database: '8.0-beta.133' },
  checks: [
    { name: 'sql.reachable', status: 'ok', text: 'Microsoft SQL Server 2022 (RTM-CU23) (KB5078297)' },
    { name: 'sql.rr_dbs_present', status: 'ok', text: '4 visible to the RR Service.' },
    { name: 'sql.jde_job_present', status: 'ok', text: "Job 'RapidReconciler_Demo1' exists in msdb." },
    { name: 'sql.agent_service', status: 'ok', text: 'SQL Server Agent is running (startup Automatic).' },
    { name: 'sql.last_job_status', status: 'warning', text: 'The last successful data refresh started Jul 12, 2026 10:43 PM, 81 days ago. The nightly refresh has not run since.', detail: 'Check that the refresh job is enabled and scheduled, and that SQL Server Agent is running.' },
    { name: 'sql.disk_free_mb', status: 'ok', text: '301,229 MB free of 523,246 MB on F:\\.' },
    { name: 'valc.reachable', status: 'ok', text: 'This server reached GSI at rrvalc.getgsi.com -> 10.0.0.4 (40 ms, HTTP 200).' }
  ],
  reconcile: { readable: true, reason: null, steps: 8895, currentErrors: [], resolvedErrors: 1, lastCompleted: '2026-09-30 15:00:27.396',
    scheduled: { kind: 'RUN', job: 'RapidReconciler_Demo1', step: 'Run B to C', runStatus: 1, runAt: '2026-07-10 22:00:27', messageId: 8153, severity: 0, firstError: null, error: null } },
  ssis: { readable: true, reason: null, executionId: 10441, status: 'Succeeded', startTime: '2026-07-12 22:43:56', endTime: '2026-07-12 23:09:03', durationSeconds: 1507, errors: [] }
};
const clone = o => JSON.parse(JSON.stringify(o));
function withCheck(base, name, status, text, detail) {
  const d = clone(base);
  d.checks = d.checks.map(c => c.name === name ? { name, status, text, detail } : c);
  return d;
}

const DEMO3 = clone(DEMO1);
DEMO3.reconcile.resolvedErrors = 6;
DEMO3.reconcile.lastCompleted = '2026-08-19 20:24:20.670';
DEMO3.reconcile.scheduled = { kind: 'NORUN', job: 'RapidReconciler_Demo3', step: 'Run B to C', runStatus: null, runAt: null, messageId: null, severity: null, firstError: null, error: null };

const SCHEDULED_FAILED = clone(DEMO1);   // the log reads clean; SQL Agent says the run failed
SCHEDULED_FAILED.reconcile.scheduled = { kind: 'RUN', job: 'RapidReconciler_Demo1', step: 'Run B to C', runStatus: 0, runAt: '2026-09-30 02:00:00', messageId: 535, severity: 16, firstError: 'Msg 535: The datediff function resulted in an overflow.', error: null };

const OPEN_ERRORS = clone(DEMO1);
OPEN_ERRORS.reconcile.currentErrors = [
  { capture: '2026-10-01 02:00', step: 'v8 txv annotate', process: 'claim offsetting entries', startTime: '2026-10-01 02:10:02.110', errorNum: 8152 },
  { capture: '2026-09-30 02:00', step: 'v6 010 clean up', process: 'begin procedure', startTime: '2026-09-30 02:05:00.000', errorNum: 535 }
];

// Every failure the agent can report, in its own words (InstallDiagnosticsCollector,
// ValcLineProbe), so the voice and plumbing assertions see real text.
const FAILURES = [
  withCheck(DEMO1, 'sql.reachable', 'fail', "Login failed -- login failed for user 'rruser'. Wrong password, or SQL Authentication is disabled on the server."),
  withCheck(DEMO1, 'sql.jde_job_present', 'fail', "Refresh job 'RapidReconciler_Demo1' is not present in msdb."),
  withCheck(DEMO1, 'sql.jde_job_present', 'warning', 'No refresh job configured (rsystemvariables.refreshjobname is blank).'),
  withCheck(DEMO1, 'sql.agent_service', 'fail', 'SQL Server Agent is stopped. The nightly data refresh cannot start until it runs.'),
  withCheck(DEMO1, 'sql.agent_service', 'warning', 'SQL Server Agent is running, but its startup type is Manual, so it will not start again after the server restarts.'),
  withCheck(DEMO1, 'sql.last_job_status', 'fail', 'The last data refresh, started Oct 2, 2026 1:00 AM, failed.'),
  withCheck(DEMO1, 'sql.last_job_status', 'warning', 'A data refresh has been running 45 minutes; it usually takes about 10.'),
  withCheck(DEMO1, 'sql.last_job_status', 'warning', 'The refresh job has no runs in SQL Server Agent\u2019s history.'),
  withCheck(DEMO1, 'sql.disk_free_mb', 'fail', '1,900 MB free of 523,246 MB on F:\\. A data refresh can stop part-way at this level.'),
  withCheck(DEMO1, 'valc.reachable', 'fail', 'Resolved rrvalc.getgsi.com -> 10.0.0.4 but couldn\u2019t connect on port 443 (gave up after 6001 ms).'),
  withCheck(DEMO1, 'valc.reachable', 'warning', 'Reached GSI at rrvalc.getgsi.com -> 10.0.0.4, but it returned a server error (HTTP 502, 80 ms).'),
  SCHEDULED_FAILED,
  OPEN_ERRORS,
  Object.assign(clone(DEMO1), { ssis: { readable: true, executionId: 10500, status: 'Failed', startTime: '2026-10-02 01:00:00', endTime: '2026-10-02 01:04:00', durationSeconds: 240, errors: ['Login timeout expired'] } }),
  Object.assign(clone(DEMO1), { ssis: { readable: false, reason: 'There is no SSIS catalog (SSISDB) on this SQL Server instance.', errors: [] } }),
  Object.assign(clone(DEMO1), { ssis: { readable: true, executionId: null, errors: [] } }),
  Object.assign(clone(DEMO1), { reconcile: { readable: false, reason: 'The reconcile log could not be read: Invalid object name.', currentErrors: [], scheduled: {} } }),
  Object.assign(clone(DEMO1), { checks: DEMO1.checks.filter(c => c.name !== 'sql.agent_service') })   // an older agent
];

// ------------------------------------------------------------------ assertions
function rowOf(rows, key) { return rows.find(r => r.key === key); }

const ASSERTIONS = {
  demo1: TS => {
    const rows = TS.rows(DEMO1, 40);
    const want = { browser: 'ok', 'sql.reachable': 'ok', 'valc.reachable': 'ok', 'sql.last_job_status': 'warn', ssis: 'ok', reconcile: 'ok', 'sql.agent_service': 'ok', 'sql.disk_free_mb': 'ok', 'sql.jde_job_present': 'ok' };
    const got = {}; rows.forEach(r => { got[r.key] = r.state; });
    if (JSON.stringify(got) !== JSON.stringify(want)) return 'Demo1 states ' + JSON.stringify(got);
    if (TS.worst(rows) !== 'warn') return 'Demo1 worst ' + TS.worst(rows);
    const areas = TS.byArea(rows).map(a => a.area + ':' + a.state + ':' + a.needs).join(',');
    if (areas !== 'Connections:ok:0,Data loads:warn:1,Database server:ok:0') return 'Demo1 byArea ' + areas;
    if (rowOf(rows, 'sql.jde_job_present').fact !== 'The nightly refresh job is set up.') return 'refresh-job fact uses agent text';
    if (!/Sep 30, 2026, 3:00 PM/.test(rowOf(rows, 'reconcile').fact)) return 'reconcile fact ' + rowOf(rows, 'reconcile').fact;
    if (!/took 25 minutes/.test(rowOf(rows, 'ssis').fact)) return 'ssis fact ' + rowOf(rows, 'ssis').fact;
    return null;
  },
  demo3NoScheduledRunIsNotAFailure: TS => {
    // NORUN means SQL Agent has no scheduled B to C in its history; the refresh row
    // already reports the missed nights, so the reconcile row stays on the log.
    const r = rowOf(TS.rows(DEMO3, 40), 'reconcile');
    return r.state === 'ok' ? null : 'Demo3 reconcile ' + r.state;
  },
  scheduledFailureOutranksACleanLog: TS => {
    const r = rowOf(TS.rows(SCHEDULED_FAILED, 40), 'reconcile');
    if (r.state !== 'fail') return 'scheduled failure read ' + r.state;
    if (!/Msg 535/.test(r.tech)) return 'Agent error missing from the technical line';
    if (/Msg 535/.test(r.fact)) return 'SQL error number shown to a finance reader';
    return null;
  },
  openErrorsWarnWithACount: TS => {
    const r = rowOf(TS.rows(OPEN_ERRORS, 40), 'reconcile');
    if (r.state !== 'warn') return 'open errors read ' + r.state;
    return /2 errors/.test(r.fact) && /Oct 1, 2026/.test(r.fact) ? null : 'open-errors fact ' + r.fact;
  },
  everyProblemEscalatesToItNeverGsi: TS => {
    for (const d of FAILURES) {
      for (const r of TS.rows(d, 40)) {
        if (r.state === 'ok') continue;
        if (!r.todo) return r.key + ' (' + r.state + ') says nothing to do';
        if (/IT department/.test(r.todo) === false && !/run the checks again/i.test(r.todo)) return r.key + ' does not name the IT department: ' + r.todo;
        const words = r.fact + ' ' + r.todo;
        if (/contact gsi|gsi support|escalate to gsi|ask gsi|rrsupport/i.test(words)) return r.key + ' sends the reader to GSI: ' + words;
      }
    }
    return null;
  },
  noSqlPlumbingInWhatTheReaderSees: TS => {
    for (const d of [DEMO1].concat(FAILURES)) {
      for (const r of TS.rows(d, 40)) {
        const seen = r.label + ' ' + r.fact + ' ' + r.todo;
        if (/msdb|rsystemvariables|refreshjobname|v_diagnostic|usp\d|ssisdb|sys\.dm_|catalog\.executions/i.test(seen)) return r.key + ' shows plumbing: ' + seen;
      }
    }
    return null;
  },
  aMissingCheckIsUnknownNotOk: TS => {
    const older = FAILURES[FAILURES.length - 1];
    const r = rowOf(TS.rows(older, 40), 'sql.agent_service');
    return r && r.state === 'unknown' ? null : 'missing check read ' + (r && r.state);
  }
};

function runAll(TS) {
  const out = {};
  for (const [name, fn] of Object.entries(ASSERTIONS)) {
    let why;
    try { why = fn(TS); } catch (e) { why = 'threw: ' + e.message; }
    out[name] = why;
  }
  return out;
}

let failed = 0;

// ------------------------------------------------------------------ 1. shipped source
const shipped = runAll(load(SRC));
for (const [name, why] of Object.entries(shipped)) {
  if (why) { failed++; console.log('FAIL  ' + name + ': ' + why); } else console.log('ok    ' + name);
}

// ------------------------------------------------------------------ 2. mutations
// Each re-injects one defect. `red` must fail; everything else must stay green.
const MUTATIONS = [
  { name: 'drop the DAC-82 scheduled-failure branch',
    find: "if (sch.kind === 'RUN' && sch.runStatus === 0)", replace: 'if (false)',
    red: ['scheduledFailureOutranksACleanLog'] },
  { name: 'escalate the import failure to GSI',
    find: "todo: 'Give the downloaded diagnostics to ' + IT + '. They list the errors the import recorded.'",
    replace: "todo: 'Contact GSI support with the downloaded diagnostics.'",
    red: ['everyProblemEscalatesToItNeverGsi'] },
  { name: 'show the agent\u2019s refresh-job text (names msdb) instead of V8\u2019s',
    find: "{ fact: 'The nightly refresh job isn\u2019t set up on the database server.', todo:",
    replace: '{ todo:',
    red: ['noSqlPlumbingInWhatTheReaderSees'] },
  { name: 'treat a missing check as passing',
    find: "state: 'unknown', fact: 'This check did not run.'", replace: "state: 'ok', fact: 'This check did not run.'",
    red: ['aMissingCheckIsUnknownNotOk'] }
];

for (const m of MUTATIONS) {
  const n = SRC.split(m.find).length - 1;
  if (n !== 1) { failed++; console.log('FAIL  mutation "' + m.name + '": anchor found ' + n + ' times'); continue; }
  const res = runAll(load(SRC.replace(m.find, m.replace)));
  const reds = Object.keys(res).filter(k => res[k]);
  const missing = m.red.filter(k => !reds.includes(k));
  const extra = reds.filter(k => !m.red.includes(k));
  if (missing.length || extra.length) {
    failed++;
    console.log('FAIL  mutation "' + m.name + '": expected red ' + JSON.stringify(m.red) + ', got ' + JSON.stringify(reds));
  } else {
    console.log('ok    mutation "' + m.name + '" caught by ' + m.red.join(', '));
  }
}

console.log(failed ? '\n' + failed + ' failure(s)' : '\nall passed');
process.exit(failed ? 1 : 0);
