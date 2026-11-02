#!/usr/bin/env node
/**
 * UI-256. Home's every-period /inventory/transactions read (~5 s of SQL CPU) went out once per reader per paint:
 * Demo1's agent log has 6 identical reads in 4 s on 2026-10-30 (5,190 rows each), and on 2026-11-01 two together
 * took 26 s and 33 s of SQL elapsed for ~5 s of CPU each. Each reader's cache filled only when ITS response landed.
 *
 * Runs home.html's REAL _txFetchAll, _txvRows and _acctTxvRows in a VM, with rrFetch replaced by a counter whose
 * responses the test releases by hand, so "concurrent" is exact rather than timing-dependent.
 *
 *   I1  six concurrent _txvRows for one company send ONE transactions read, and all six get its rows
 *   I2  the account Ask's three concurrent reads send one more (its body differs: all companies), not three
 *   I3  after a read settles, the next ask reads again (nothing stale is served from the in-flight map)
 *   I4  a failed read clears too: the next ask reads again instead of re-throwing the old failure
 *   I5  another database is another read, even with an identical body
 *   C1  CONTROL: two different companies are two reads (the key is the body, not just the endpoint)
 *
 * MUTATION: the share removed from _txFetchAll (it always calls rrFetch). I1 and I2 must go red, C1 stay green.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOME = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');

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
  throw new Error('unbalanced block from ' + startIdx);
}
function fn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) { console.log('HARNESS BROKEN: ' + name + '() not found in home.html'); process.exit(1); }
  return sliceBlock(src, at + 1);
}

function load(src) {
  const st = { reads: [], db: 'RapidReconciler_Demo1' };
  const sb = {
    console,
    activeDb: () => ({ n: st.db }),
    _txScope: (rows, cos) => (cos && cos.length ? rows.filter((r) => cos.indexOf(String(r.CompanyNumber)) >= 0) : rows),
    _txVarBucket: () => ({ amt: {}, cnt: {} }),
    _txVarCache: {},
    rrFetch: (area, opts) => {
      if (area === 'inventory/status') return Promise.resolve({ reconciliationFilter: {} });
      if (area !== 'inventory/transactions') return Promise.reject(new Error('unexpected ' + area));
      let release, fail;
      const p = new Promise((res, rej) => { release = res; fail = rej; });
      st.reads.push({ body: opts.body, release, fail });
      return p;
    },
  };
  vm.createContext(sb);
  const decl = (src.match(/\n  var _txAllInflight = \{\};/) || [null])[0];
  if (!decl) { console.log('HARNESS BROKEN: var _txAllInflight not found'); process.exit(1); }
  vm.runInContext(decl + '\nvar _acctTxvCache = null;\n' + ['_txFetchAll', '_txvRows', '_acctTxvRows'].map((n) => fn(src, n)).join('\n'), sb);
  return { sb, st };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const ROWS = [{ CompanyNumber: '90002', Variance: 1 }, { CompanyNumber: '90008', Variance: 2 }];

let reds = [];
function check(id, name, ok, detail) {
  if (!ok) reds.push(id);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + id + ' ' + name + (ok ? '' : '   ' + detail));
}

async function run(src) {
  reds = [];
  {
    const { sb, st } = load(src);
    const six = [1, 2, 3, 4, 5, 6].map(() => sb._txvRows(['90002']));
    await tick(); await tick();
    const n = st.reads.length;
    st.reads.forEach((r) => r.release({ data: ROWS }));
    const got = await Promise.all(six);
    check('I1', 'six concurrent _txvRows send one read, and all six get its rows',
      n === 1 && got.every((g) => g.length === 1 && g[0].CompanyNumber === '90002'), 'reads=' + n);
  }
  {
    const { sb, st } = load(src);
    const three = [1, 2, 3].map(() => sb._acctTxvRows());
    await tick();
    const n = st.reads.length;
    st.reads.forEach((r) => r.release({ data: ROWS }));
    await Promise.all(three);
    check('I2', 'three concurrent account-Ask reads send one read', n === 1, 'reads=' + n);
  }
  {
    const { sb, st } = load(src);
    const a = sb._txFetchAll({ x: 1 });
    st.reads[0].release({ data: [] }); await a; await tick();
    sb._txFetchAll({ x: 1 });
    check('I3', 'after a read settles, the next ask reads again', st.reads.length === 2, 'reads=' + st.reads.length);
  }
  {
    const { sb, st } = load(src);
    const a = sb._txFetchAll({ x: 1 });
    st.reads[0].fail(new Error('boom')); await a.catch(() => {}); await tick();
    const b = sb._txFetchAll({ x: 1 });
    st.reads[st.reads.length - 1].release({ data: [] }); await b;
    check('I4', 'a failed read clears: the next ask reads again', st.reads.length === 2, 'reads=' + st.reads.length);
  }
  {
    const { sb, st } = load(src);
    sb._txFetchAll({ x: 1 }); st.db = 'RapidReconciler_Demo2'; sb._txFetchAll({ x: 1 });
    check('I5', 'another database is another read, same body', st.reads.length === 2, 'reads=' + st.reads.length);
  }
  {
    const { sb, st } = load(src);
    sb._txvRows(['90002']); sb._txvRows(['90008']);
    await tick(); await tick();
    check('C1', 'CONTROL: two companies are two reads', st.reads.length === 2, 'reads=' + st.reads.length);
  }
  return reds.slice();
}

(async () => {
  console.log('UI-256: one in-flight every-period Transactions read per body');
  const real = await run(HOME);
  const SHARE = '    if (_txAllInflight[k]) return _txAllInflight[k];\n';
  const off = HOME.replace(SHARE, '');
  if (off === HOME) { console.log('HARNESS BROKEN: mutation did not apply'); process.exit(1); }
  console.log('\nMutation: the share removed (I1, I2 must go red; C1 stays green)');
  const m = await run(off);
  const caught = ['I1', 'I2'].every((id) => m.includes(id)) && !m.includes('C1');
  console.log('  ' + (caught ? 'ok  ' : 'FAIL') + '  mutation caught by ' + JSON.stringify(m));
  const pass = real.length === 0 && caught;
  console.log('\n' + (pass ? 'PASS' : 'FAIL') + (real.length ? ': real case(s) red ' + real.join(',') : ''));
  process.exit(pass ? 0 : 1);
})();
