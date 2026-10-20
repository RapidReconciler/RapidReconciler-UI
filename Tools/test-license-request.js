/* test-license-request.js -- behaviour test for the Licensing page's Request more licenses email (UI-226).
 *
 *   node Tools/test-license-request.js
 *
 * WHAT IS UNDER TEST. RRV8/admin-companies.html builds a mailto: to GSI Sales from what the
 * page knows: the customer, the database, the current usage line, the signed-in user, and the
 * Not Licensed companies once the JDE scan has run. The claims a customer relies on:
 *
 *   - it goes to gsisales@getgsi.com with the help doc's subject line;
 *   - the customer, database, usage and contact are filled in;
 *   - each Not Licensed company is listed, except the blocked company (the page's COMPANY_30);
 *   - a long list is capped and says how many more there are, so the template's closing
 *     sections survive a mail client that truncates long links;
 *   - with no scan yet, the blank template rows are there instead.
 *
 * THE SOURCE IS NOT RETYPED. licenseRequestBody, _refreshLicRequest and COMPANY_30 are sliced
 * out of the page and executed. The control at the end reverts the blocked-company filter and requires
 * an assertion to break.
 *
 * Fixture identifiers are fictional (9XXXX companies, per the UI repo CLAUDE.md reserve).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', 'RRV8', 'admin-companies.html');
const src = fs.readFileSync(PAGE, 'utf8');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

// Brace-balanced slice, skipping strings and comments (same slicer as test-evidence-package.js).
function sliceBlock(s, startIdx) {
  let i = s.indexOf('{', startIdx);
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { i = s.indexOf('\n', i); continue; }
    if (c === '/' && n === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < s.length; i++) { if (s[i] === '\\') { i++; continue; } if (s[i] === q) break; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return s.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in admin-companies.html');
  return sliceBlock(src, at + 1);
}
const c30 = src.match(/\n  const COMPANY_30 = '([^']*)';/);
if (!c30) throw new Error('COMPANY_30 not found in admin-companies.html');
// Read from the page rather than written here: it is a structural JDE number outside the
// fixture reserve, and the page is the one place that names it.
const BLOCKED = c30[1];
const baseSrc = c30[0] + '\n' + ['licenseRequestBody', '_refreshLicRequest'].map(extractFn).join('\n')
  // let-bound page state, as the page declares it (globals here, so the test can set them)
  + '\nvar _licReq = { clientName: "", dbName: "", usage: "" }; var _licReqUnlicensed = null;';

function run(state, mutate) {
  const link = { href: '' };
  const sb = {
    window: {}, document: { getElementById: function (id) { return id === 'js-lic-request' ? link : null; } },
    encodeURIComponent: encodeURIComponent
  };
  sb.window.RR_SESSION = { user: { fn: 'Test Admin', u: 'admin@example.com' } };
  sb.RR_SESSION = sb.window.RR_SESSION;
  vm.createContext(sb);
  vm.runInContext((mutate ? mutate(baseSrc) : baseSrc).replace(/const COMPANY_30/, 'var COMPANY_30'), sb);
  sb._licReq = state.req; sb._licReqUnlicensed = state.unlicensed;
  vm.runInContext('_refreshLicRequest()', sb);
  const m = link.href.match(/^mailto:([^?]+)\?subject=([^&]*)&body=(.*)$/);
  return { href: link.href, to: m && m[1], subject: m && decodeURIComponent(m[2]), body: m ? decodeURIComponent(m[3]) : '' };
}

const REQ = { clientName: 'Acme Test Co', dbName: 'RapidReconciler_Test_V8', usage: 'Using 2 of 12 company licenses.' };
const UNLIC = [
  { companyNumber: '90010', name: 'Acme East' },
  { companyNumber: BLOCKED, name: 'Blocked company' },
  { companyNumber: '90020', name: 'Acme West' }
];

function assertions(o) {
  const r = [];
  const chk = function (c, n, d) { r.push({ c: !!c, n: n, d: d }); };
  chk(o.to === 'gsisales@getgsi.com', 'addressed to GSI Sales', o.to);
  chk(o.subject === 'RapidReconciler — Additional Company License Request', 'subject matches the help doc', o.subject);
  chk(o.body.indexOf('Company Name: Acme Test Co') >= 0, 'customer filled in');
  chk(o.body.indexOf('Database: RapidReconciler_Test_V8') >= 0, 'database filled in');
  chk(o.body.indexOf('Current licenses: Using 2 of 12 company licenses.') >= 0, 'current usage filled in');
  chk(o.body.indexOf('Primary Contact Name: Test Admin') >= 0 && o.body.indexOf('Primary Contact Email: admin@example.com') >= 0, 'signed-in contact filled in');
  chk(o.body.indexOf('JDE Company Number: 90010') >= 0 && o.body.indexOf('Company Name: Acme West') >= 0, 'Not Licensed companies listed');
  chk(o.body.indexOf('JDE Company Number: ' + BLOCKED) < 0 && o.body.indexOf('Blocked company') < 0, 'the blocked company is not offered');
  chk(/Thank you,\s*$/.test(o.body), 'the template closes');
  return r;
}

console.log('Licensing page: Request more licenses email -- behaviour test');
const shipped = assertions(run({ req: REQ, unlicensed: UNLIC }));
shipped.forEach(function (x) { ok(x.c, x.n, x.d); });

const many = [];
for (let i = 0; i < 30; i++) many.push({ companyNumber: String(90100 + i), name: 'Co ' + i });
const big = run({ req: REQ, unlicensed: many });
ok((big.body.match(/JDE Company Number: /g) || []).length === 25, 'a long list is capped at 25 companies');
ok(big.body.indexOf('(5 more on the Licensing page') >= 0, 'and says how many more there are');
ok(/Thank you,\s*$/.test(big.body), 'and the template still closes');

const none = run({ req: REQ, unlicensed: null });
ok(none.body.indexOf('  1. JDE Company Number:\n') >= 0, 'before the JDE scan, the blank template rows are there');

// Control, last: without the 00030 filter the blocked company is offered.
const ctl = assertions(run({ req: REQ, unlicensed: UNLIC },
  function (s) {
    const find = " && String(r.companyNumber).trim() !== COMPANY_30";
    if (s.indexOf(find) < 0) throw new Error('control target not found -- admin-companies.html changed shape');
    return s.replace(find, '');
  }));
ok(ctl.some(function (x) { return !x.c; }), 'CONTROL: dropping the blocked-company filter breaks at least one assertion');

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
process.exit(failures ? 1 : 0);
