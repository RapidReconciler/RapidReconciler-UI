/*
 * test-instance-activity.js  --  UI-265
 *
 * WHAT THIS GUARDS
 * ----------------
 * Owner ruling 2026-11-02: the Administrator view of Home reports the RR instance, not the database the picker has
 * selected. Its Activity Log card reads GET admin/activity from every database's agent and shows the newest events
 * across all of them, each starting with its database's name. Two shipped functions in RRV8/config.js do that:
 *
 *   RRV8.mergeActivity(groups)  joins the per-database lists into one newest-first list and tags each event with its
 *                               database (`_db`). A single database's feed comes back untagged, as it always has.
 *   RRV8.collapseActivity(list) folds a run of identical events into one "×N" row. The database is part of the key,
 *                               so the same restart on two databases stays two rows.
 *   RRV8.newestAck(acks, kind)  the client-wide reviews (activity, complex passwords, AI) read as the newest ack of the
 *                               kind on any database, so their reminder dots do not follow the database picker.
 *
 * HOW
 * ---
 * Both functions are SLICED OUT OF config.js AND EXECUTED in a vm, unchanged. Nothing is retyped.
 *
 * MUTATIONS
 * ---------
 * Section 2 re-injects each defect into the sliced source and requires the named assertion to go RED and the others
 * to stay GREEN.
 *
 * BLIND SPOTS, named: no browser and no agents, so it proves the merge, not the card's paint or the fetches.
 *
 *   node Tools/test-instance-activity.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONFIG = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');

function slice(start) {
  const i = CONFIG.indexOf(start);
  if (i < 0) { console.log('HARNESS BROKEN: no "' + start + '" in config.js'); process.exit(1); }
  const j = CONFIG.indexOf('\n  };\n', i);
  if (j < 0) { console.log('HARNESS BROKEN: no end for "' + start + '"'); process.exit(1); }
  return CONFIG.slice(i, j + '\n  };\n'.length);
}
const SRC = slice('  window.RRV8.collapseActivity = function (list) {') + slice('  window.RRV8.mergeActivity = function (groups) {')
  + slice('  window.RRV8.newestAck = function (acks, kind) {');

function load(src) {
  const sandbox = { window: { RRV8: {} } };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'config.js (sliced)' });
  return sandbox.window.RRV8;
}

const DEMO1 = [
  { event: 'Report engine started', by: 'system', at: '2026-11-02T10:00:00Z' },
  { event: 'Activity log reviewed', by: 'ed', at: '2026-10-26T09:00:00Z' }
];
const DEMO2 = [
  { event: 'Report engine started', by: 'system', at: '2026-11-02T10:00:05Z' },
  { event: 'Data reload', by: 'ann', at: '2026-10-30T08:00:00Z' }
];

const ASSERTIONS = {
  mergedNewestFirstAndTagged: R => {
    const out = R.mergeActivity([{ db: 'Demo1', list: DEMO1 }, { db: 'Demo2', list: DEMO2 }]);
    const got = out.map(e => e._db + '|' + e.at).join(' ');
    const want = 'Demo2|2026-11-02T10:00:05Z Demo1|2026-11-02T10:00:00Z Demo2|2026-10-30T08:00:00Z Demo1|2026-10-26T09:00:00Z';
    if (got !== want) return 'got ' + got;
    if (DEMO1.some(e => '_db' in e) || DEMO2.some(e => '_db' in e)) return 'the agent’s events were changed in place';
    return null;
  },
  aSilentDatabaseAddsNothingAndOneDatabaseIsUntagged: R => {
    const out = R.mergeActivity([{ db: 'Demo1', list: null }, { list: DEMO2 }]);
    if (out.length !== DEMO2.length) return out.length + ' events from one answering database of ' + DEMO2.length;
    if (out.some(e => '_db' in e)) return 'an untagged group came back tagged';
    return null;
  },
  theSameEventOnTwoDatabasesIsTwoRows: R => {
    const restart = { event: 'Report engine started', by: 'system' };
    const list = [
      Object.assign({ _db: 'Demo2', at: '2026-11-02T10:00:05Z' }, restart),
      Object.assign({ _db: 'Demo1', at: '2026-11-02T10:00:00Z' }, restart),
      Object.assign({ _db: 'Demo1', at: '2026-11-02T09:00:00Z' }, restart)
    ];
    const out = R.collapseActivity(list);
    const got = out.map(e => e._db + '×' + e._count).join(' ');
    return got === 'Demo2×1 Demo1×2' ? null : 'got ' + got;
  },
  // UI-265: a client-wide review (activity, complex passwords, AI) is the newest ack of its kind on ANY database.
  theNewestReviewOnAnyDatabaseIsTheClients: R => {
    const acks = [
      { kind: 'password-review', ackedDate: '2026-10-01T09:00:00Z', cadenceDays: 90, db: 'Demo1' },
      { kind: 'purge-snooze',    ackedDate: '2026-11-02T09:00:00Z', cadenceDays: 30, db: 'Demo1' },
      { kind: 'password-review', ackedDate: '2026-11-01T09:00:00Z', never: true,     db: 'Demo3' },
      { kind: 'password-review', ackedDate: '2026-10-15T09:00:00Z', cadenceDays: 30, db: 'Demo2' }
    ];
    const a = R.newestAck(acks, 'password-review');
    if (!a || a.db !== 'Demo3') return 'picked ' + (a && a.db);
    if (R.newestAck(acks, 'ai-review') !== null) return 'a kind nobody acked came back';
    if (R.newestAck(null, 'password-review') !== null) return 'no list did not read as none';
    return null;
  }
};

function runAll(R) {
  const out = {};
  for (const [name, fn] of Object.entries(ASSERTIONS)) {
    let why;
    try { why = fn(R); } catch (e) { why = 'threw: ' + e.message; }
    out[name] = why;
  }
  return out;
}

let failed = 0;

// 1. shipped source
for (const [name, why] of Object.entries(runAll(load(SRC)))) {
  if (why) { failed++; console.log('FAIL  ' + name + ': ' + why); } else console.log('ok    ' + name);
}

// 2. mutations
const MUTATIONS = [
  { name: 'the database is not part of the collapse key',
    find: "\n               && String(prev._db == null ? '' : prev._db) === String(e._db == null ? '' : e._db)) {",
    replace: ') {',
    red: ['theSameEventOnTwoDatabasesIsTwoRows'] },
  { name: 'the merge keeps each database’s order instead of newest first',
    find: "    out.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });\n    return out;\n  };\n",
    replace: '    return out;\n  };\n',
    red: ['mergedNewestFirstAndTagged'] },
  { name: 'the first review found wins instead of the newest',
    find: "if (!best || String(a.ackedDate || '') > String(best.ackedDate || '')) best = a;",
    replace: 'if (!best) best = a;',
    red: ['theNewestReviewOnAnyDatabaseIsTheClients'] },
  { name: 'every event is tagged, even from a group that names no database',
    find: 'if (g.db) copy._db = String(g.db);', replace: 'copy._db = String(g.db);',
    red: ['aSilentDatabaseAddsNothingAndOneDatabaseIsUntagged'] }
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
