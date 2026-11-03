#!/usr/bin/env node
/**
 * UI-257. Owner 2026-11-02, on the Accounting Ask answering "which account should I do first" with "I don't have
 * account-level figures in the facts here" at Full: "One would think there are account level figures here." The
 * prompt defined the roll-up columns (Beginning, Activity, Ending GL, Perpetual) but sent no account rows.
 *
 * Runs home.html's REAL _acctAccountFactLines and _acctRfState, with config.js's REAL RRV8.rollForward, on account
 * rows shaped like the Accounts tab's (_invRows: CompanyNumber, LongAccount, PeriodEnds, BegGL, PerGL, EndGL,
 * Perpetual, UnpostBatch, EndofDay, OOB, GLOK, VarOK). Fictional values from the 9XXXX company reserve.
 *
 *   A1  Full: the out-of-balance accounts of the viewed period, biggest gap first, with the roll-up figures
 *   A2  an account under the materiality floor is counted in balance, not listed
 *   A3  the roll-forward word agrees with the Accounts tab's dot (_acctRfState): break / never compared / clean
 *   A4  other periods' rows are left out (the viewed period only, as the tab)
 *   A5  more than ACCT_ASK_TOP out-of-balance accounts: the rest are summarised with their net
 *   M1  Enhanced (scrub): no company or account number and no account name; "Entity A", "Account 1"
 *   C1  CONTROL: a company with every account in balance says so, and one with no rows says that
 *   S1-S3  UI-258: with the header focused on one company the Scope line names it (masked on Enhanced); on
 *          Overview it names none
 *   K1  UI-258: two currencies get a Currencies line; K2 CONTROL: one currency gets none
 *   P1-P4  UI-263: each account states the page's own materiality (_wlMateriality, the company figure's rule):
 *          0.05% immaterial, 2.0% material, a dormant GL judged by amount and never called immaterial; the header
 *          forbids the model judging it
 *   N1  UI-267: a negative amount prints its sign before the symbol (-$8,620.11, -£26,950.39), never "$-"
 *
 * MUTATION: the builder's materiality filter removed (every account listed). A2 must go red; A3-A5, which do not
 * rest on the floor, must stay green. Two more arms: the Currencies line removed (K1 red), and the account
 * materiality verdict removed (P1-P3 red, A1 and A3 green).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const CONFIG = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');

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
const broken = (what) => { console.log('HARNESS BROKEN: ' + what); process.exit(1); };
function fn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) broken(name + '() not found');
  return sliceBlock(src, at + 1);
}
function line(src, re, what) { const m = src.match(re); if (!m) broken(what + ' not found'); return m[0]; }
function rollForwardModule(cfg) {
  const end = cfg.indexOf('  window.RRV8.rollForward = ');
  const start = cfg.lastIndexOf('\n(function () {', end);
  if (end < 0 || start < 0) broken('the rollForward module in config.js');
  return cfg.slice(start, cfg.indexOf('})();', end) + 5);
}

function load(home) {
  const sb = { window: { RRV8: {} }, console };
  sb.RRV8 = sb.window.RRV8;
  vm.createContext(sb);
  vm.runInContext(rollForwardModule(CONFIG), sb, { filename: 'config.js:rollForward' });
  const src = [
    line(home, /\n  var MAT_OOB_FLOOR = [^\n]*/, 'MAT_OOB_FLOOR'),
    line(home, /\n  var ACCT_ASK_TOP = [^\n]*/, 'ACCT_ASK_TOP'),
    line(home, /\n  var _money = function[^\n]*/, '_money'),
    fn(home, 'fmtPeriod'), fn(home, '_coOf'), fn(home, '_ccySym'), fn(home, '_ccyExact'), fn(home, '_acctRfState'), fn(home, '_wlMateriality'),
    fn(home, '_acctAccountFactLines'),
    'function _oobRecurrence(co, a) { return a === "9123456.141818" ? { outN: 6, of: 6 } : null; }',
  ].join('\n');
  vm.runInContext(src, sb, { filename: 'home.html:acct-ask-accounts' });
  return sb;
}

const PE = '2025-07-31';
const acct = (co, la, oob, o) => Object.assign({ CompanyNumber: co, LongAccount: la, PeriodEnds: PE + 'T00:00:00',
  BegGL: 1000, PerGL: 200, EndGL: 1200, Perpetual: 1200 - oob, UnpostBatch: 0, EndofDay: 0, OOB: oob,
  GLOK: 'yes', VarOK: 'yes' }, o || {});
const ROWS = [
  acct('90002', '9123456.141818', -8620.11),
  acct('90002', '9123456.141820', 2500, { GLOK: 'no' }),
  acct('90002', '9123456.141822', 40),                                 // under the floor
  acct('90002', '9123456.141824', 900, { GLOK: '', VarOK: '' }),       // never compared
  acct('90002', '9123456.141818', -999999, { PeriodEnds: '2025-06-30T00:00:00' }),   // another period
  acct('90008', '9123457.141818', 0),                                  // all in balance
];
const D = { viewedPeriod: PE, companies: [{ co: '90002', ccy: 'USD' }, { co: '90008', ccy: 'USD' }, { co: '90009', ccy: 'USD' }] };
const NAMES = { '90002|9123456.141818': 'Raw Materials Inventory' };

let reds = [];
function check(id, name, ok, detail) {
  if (!ok) reds.push(id);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + id + ' ' + name + (ok ? '' : '\n          ' + detail));
}

function run(home) {
  reds = [];
  const sb = load(home);
  const full = sb._acctAccountFactLines(D, false, ROWS, NAMES).join('\n');
  const i1 = full.indexOf('9123456.141818'), i2 = full.indexOf('9123456.141820'), i3 = full.indexOf('9123456.141824');
  check('A1', 'Full: out-of-balance accounts, biggest first, with the roll-up figures',
    i1 > 0 && i1 < i2 && i2 < i3 && /9123456\.141818 \(Raw Materials Inventory\): out of balance -\$8,620\.11 = Ending GL \$1,200\.00 \(Beginning \$1,000\.00 \+ Activity \$200\.00\) vs Perpetual/.test(full)
      && /out of balance in 6 of the last 6 periods/.test(full) && /3 of 4 accounts out of balance, 1 in balance/.test(full), full);
  check('A2', 'an account under the floor is in balance, not listed', full.indexOf('9123456.141822') < 0, full);
  check('A3', 'roll-forward words match the tab dot: BREAK / never compared / clean',
    /141820[^\n]*roll-forward BREAK/.test(full) && /141824[^\n]*roll-forward never compared/.test(full) && /141818 [^\n]*roll-forward clean/.test(full), full);
  check('A4', 'other periods are left out', full.indexOf('999,999') < 0, full);
  const many = []; for (let k = 0; k < 11; k++) many.push(acct('90002', '9123456.1419' + String(k).padStart(2, '0'), 1000 + k));
  const big = sb._acctAccountFactLines({ viewedPeriod: PE, companies: [{ co: '90002', ccy: 'USD' }] }, false, many, {}).join('\n');
  check('A5', 'past ' + sb.ACCT_ASK_TOP + ' accounts the rest are summarised with their net',
    (big.match(/^• 9123456\./gm) || []).length === sb.ACCT_ASK_TOP && /• 3 more out-of-balance accounts, net \$3,003\.00 together\./.test(big), big);
  const masked = sb._acctAccountFactLines(D, true, ROWS, NAMES).join('\n');
  check('M1', 'Enhanced: no company or account number or name; Entity A, Account 1',
    !/9000[28]|9123456|9123457|Raw Materials/.test(masked) && /Entity A: 3 of 4/.test(masked) && /• Account 1: out of balance/.test(masked), masked);
  check('C1', 'CONTROL: all in balance says so; no rows says that',
    /Co 90008: all 1 accounts in balance\./.test(full) && /Co 90009: no accounts loaded for this period\./.test(full), full);
  // UI-258: scope and currency (owner 2026-11-02, "Fix the wording").
  const focus = sb._acctAccountFactLines(D, false, ROWS, NAMES, '90008').join('\n');
  check('S1', 'a focused header: the Scope line names it and asks the answer to flag accounts outside it',
    /Scope: these are the accounts of all 3 companies in view\. The page header is showing Co 90008 only, so when you name an account of another company, say that it is outside Co 90008\./.test(focus), focus);
  const focusM = sb._acctAccountFactLines(D, true, ROWS, NAMES, '90008').join('\n');
  check('S2', 'masked: the Scope line uses the entity label, not the number', /header is showing Entity B only/.test(focusM) && !/9000[289]/.test(focusM), focusM);
  check('S3', 'no focus (Overview): Scope says all companies, names none', /Scope: these are the accounts of all 3 companies in view\.\n/.test(full + '\n') && !/header is showing/.test(full), full);
  const mixed = sb._acctAccountFactLines({ viewedPeriod: PE, companies: [{ co: '90002', ccy: 'USD' }, { co: '90008', ccy: 'GBP' }] }, false, ROWS, NAMES).join('\n');
  check('K1', 'two currencies: the Currencies line names both and forbids an unlabelled ranking',
    /Currencies: these companies report in USD, GBP\. Keep each amount's own currency symbol, and never rank or compare amounts in different currencies without naming both currencies\./.test(mixed), mixed);
  check('K2', 'CONTROL: one currency, no Currencies line', !/Currencies:/.test(full), full);
  // UI-263: each account carries the page's own materiality verdict, so the model never judges it. Shapes from the
  // owner's 2026-11-02 look: 4,050.00 on an 8.2M Ending GL (0.05%), 26,950.39 on 1.34M (2.0%), plus a dormant GL.
  const matRows = [
    acct('90002', '9123456.141830', 4050, { EndGL: 8234760.42, Perpetual: 8230710.42 }),
    acct('90002', '9123456.141832', -26950.39, { EndGL: 1343597.60, Perpetual: 1370547.99 }),
    acct('90002', '9123456.141834', 50000, { EndGL: 500, Perpetual: -49500 }),
  ];
  const mat = sb._acctAccountFactLines({ viewedPeriod: PE, companies: [{ co: '90002', ccy: 'USD' }] }, false, matRows, {}).join('\n');
  check('P1', 'an account at 0.05% of its Ending GL is stated immaterial, by the company figure\'s rule',
    /141830[^\n]*; under 0\.1% of Ending GL, immaterial; roll-forward/.test(mat), mat);
  check('P2', 'an account at 2.0% of its Ending GL is stated material', /141832[^\n]*; 2\.0% of Ending GL, material; roll-forward/.test(mat), mat);
  // 50,000 out on a 500 GL: a near-zero GL with a large gap must not be called immaterial.
  check('P3', 'a dormant Ending GL is judged by amount, with no percentage and no "immaterial"',
    /141834[^\n]*; Ending GL under 1000 \(near-zero balance\), so judge it by the amount out[^\n]*; roll-forward/.test(mat)
      && !/141834[^\n]*(% of Ending GL|immaterial)/.test(mat), mat);
  check('P4', 'the header says every listed account is over the floor and forbids the model judging materiality',
    /so every account listed is over that floor/.test(mat) && /never judge an account's materiality yourself/.test(mat), mat);
  // UI-267: a negative prints its sign before the symbol, in both currencies, and never after it.
  const signed = sb._acctAccountFactLines({ viewedPeriod: PE, companies: [{ co: '90002', ccy: 'USD' }, { co: '90008', ccy: 'GBP' }] },
    false, [acct('90002', '9123456.141818', -8620.11), acct('90008', '9123457.141818', -26950.39, { EndGL: 1343597.60 })], {}).join('\n');
  check('N1', 'a negative reads -$8,620.11 and -£26,950.39; no amount reads $- or £-',
    /out of balance -\$8,620\.11/.test(signed) && /out of balance -£26,950\.39/.test(signed) && !/[$£]-/.test(signed), signed);
  return reds.slice();
}

console.log('UI-257: the accountant\'s Ask gets the Accounts tab\'s account rows');
const real = run(HOME);
const FLOOR = "var out = accts.filter(function (r) { return Math.abs(Number(r.OOB) || 0) >= MAT_OOB_FLOOR; })";
const off = HOME.replace(FLOOR, 'var out = accts.filter(function (r) { return true; })');
if (off === HOME) broken('mutation did not apply');
console.log('\nMutation: the materiality filter removed (A2 must go red)');
const m = run(off);
// A1, M1 and C1 also go red here, rightly: "3 of 4" and "all in balance" both rest on the floor. A3-A5 do not, and
// staying green is what shows the harness is not simply failing everything.
const caught = m.includes('A2') && ['A3', 'A4', 'A5'].every((id) => !m.includes(id));
console.log('  ' + (caught ? 'ok  ' : 'FAIL') + '  mutation caught by ' + JSON.stringify(m));
// UI-258's lines: the Currencies line removed must turn K1 red and leave S1-S3 green.
const CCY = "    if (ccys.length > 1) lines.push(";
const noCcy = HOME.replace(CCY, '    if (false) lines.push(');
if (noCcy === HOME) broken('currency mutation did not apply');
console.log('\nMutation: the Currencies line removed (K1 must go red; S1-S3 stay green)');
const m2 = run(noCcy);
const caught2 = m2.includes('K1') && ['S1', 'S2', 'S3', 'K2'].every((id) => !m2.includes(id));
console.log('  ' + (caught2 ? 'ok  ' : 'FAIL') + '  currency mutation caught by ' + JSON.stringify(m2));
// UI-263's verdict: dropped from the account line, P1-P3 must go red; the roll-up and roll-forward cases stay green.
const VERDICT = "          + '; ' + matTxt\n";
const noMat = HOME.replace(VERDICT, '');
if (noMat === HOME) broken('materiality mutation did not apply');
console.log('\nMutation: the account materiality verdict removed (P1-P3 must go red; A1, A3 stay green)');
const m3 = run(noMat);
const caught3 = ['P1', 'P2', 'P3'].every((id) => m3.includes(id)) && ['A1', 'A3', 'P4'].every((id) => !m3.includes(id));
console.log('  ' + (caught3 ? 'ok  ' : 'FAIL') + '  materiality mutation caught by ' + JSON.stringify(m3));
// UI-267's formatter: the sign put back after the symbol must turn N1 red and leave P1-P4 green.
const SIGN = "function _ccyExact(ccy, n) { n = Number(n) || 0; return (n < 0 ? '-' : '') + _ccySym(ccy) + _money(Math.abs(n)); }";
const signAfter = HOME.replace(SIGN, 'function _ccyExact(ccy, n) { return _ccySym(ccy) + _money(Number(n) || 0); }');
if (signAfter === HOME) broken('sign mutation did not apply');
console.log('\nMutation: the sign back after the symbol (N1 must go red; P1-P4 stay green)');
const m4 = run(signAfter);
const caught4 = m4.includes('N1') && ['P1', 'P2', 'P3', 'P4'].every((id) => !m4.includes(id));
console.log('  ' + (caught4 ? 'ok  ' : 'FAIL') + '  sign mutation caught by ' + JSON.stringify(m4));
const pass = real.length === 0 && caught && caught2 && caught3 && caught4;
console.log('\n' + (pass ? 'PASS' : 'FAIL') + (real.length ? ': real case(s) red ' + real.join(',') : ''));
process.exit(pass ? 0 : 1);
