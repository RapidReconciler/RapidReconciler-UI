/* test-evidence-package.js -- behaviour test for Audit Center's one-file evidence package (UI-220).
 *
 *   node Tools/test-evidence-package.js
 *
 * WHAT IS UNDER TEST. genEvidencePackage() in RRV8/home.html builds ONE PDF for the focused
 * company and period: a cover with a linked contents list, the Audit report for that company,
 * then the Period Activity. It is assembled from the same section writers the two standalone
 * downloads use. The claims checked here are the ones a reader of the file relies on:
 *
 *   - the cover names the company, period, database and who generated it;
 *   - each contents line links to the page that actually opens its section, and the printed
 *     page number is that page;
 *   - the Audit report section does not draw over the cover;
 *   - Period Activity holds EVERY actor's entries for this company and period, whatever chip
 *     filter the screen was left on, and nothing from another company or period;
 *   - both halves carry ONE period, even when _acctData's period disagrees with the one the
 *     Audit Center header names;
 *   - every page is footed with the company, the period and "Page i of n";
 *   - it refuses (no file) when the trail on screen belongs to an earlier fetch, or when no
 *     period is selected, and says why;
 *   - a throw while ASSEMBLING the PDF is reported through RRV8.runExport, with a readable
 *     dash, and nothing is logged as exported.
 *
 * THE SOURCE IS NOT RETYPED HERE. Every function is sliced out of RRV8/home.html (and
 * RRV8/export-guard.js is loaded whole) and executed verbatim against the vendored jsPDF +
 * autoTable. Only the edges are stubbed: the data fetch, the AI summary, the session.
 *
 * THE CONTROLS RUN LAST. Each re-runs the same assertions against a source with one line
 * reverted to the mistake it guards against. If a control PASSES, the harness is not
 * measuring that claim and the green result above it is worthless.
 *
 * Fixture identifiers are fictional (9XXXX companies, per the UI repo CLAUDE.md reserve).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = path.join(ROOT, 'RRV8', 'home.html');
const GUARD = path.join(ROOT, 'RRV8', 'export-guard.js');
const VENDOR = path.join(ROOT, 'RRV8', 'vendor');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

/* ---------------------------------------------------------------- source slicing --- */

// Brace-balanced slice, skipping strings and comments (same slicer as test-audit-pdf-links.js).
function sliceBlock(src, startIdx) {
  let i = src.indexOf('{', startIdx);
  if (i < 0) throw new Error('no opening brace after index ' + startIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1);
}
function extractVar(src, name) {
  const at = src.indexOf('\n  var ' + name + ' = {');
  if (at < 0) throw new Error('var ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1) + ';';
}

const homeSrc = fs.readFileSync(HOME, 'utf8');
const PIECES = [
  // Audit report section writer and its helpers
  '_auditAccts', '_dfil', '_auditResidualTarget', '_auditResiduals', '_auditMoney', '_auditResidualLine',
  '_auditPdfCover', '_pdfRight', '_pdfSecTitle', '_pdfEmpty', '_pvNum', '_buildAuditPdfSection',
  '_auditDescMap', '_auditReportInputs', '_auditReportPdfSections',
  // Period Activity section writer and its helpers
  '_auditActivityRows', '_auditPdfSafe', '_pdfStampFooter', '_auditActivityPdfSection',
  '_auditCoLabel', '_auditAbs', '_audMoney', '_auditPass',
  // the package
  'genEvidencePackage', '_evidenceCoverPdf', '_evidenceContentsPdf'
];
const VARS = ['_AUDIT_PDF', 'AUDIT_ACTORS'];
const baseSrc = VARS.map(function (v) { return extractVar(homeSrc, v); }).join('\n') + '\n'
              + PIECES.map(function (n) { return extractFn(homeSrc, n); }).join('\n');

/* ------------------------------------------------------------------ fixture data --- */

const CO = '90001', OTHER_CO = '90002';
const PER = '2026-06-30', OTHER_PER = '2026-05-31';
const DB = 'RapidReconciler_Test_V8';
const USER = { fn: 'Test Accountant', u: 'accountant@example.com' };
const ACCTS = [['5000.140000', 'Raw Materials'], ['5000.141000', 'Work In Process']];

// Every activity entry carries a unique marker so the test can say exactly which ones
// reached the file. IN = must be in the package, OUT = must not.
const ENTRIES = [
  { mark: 'IN-ANALYST-REVIEW',  actor: 'analyst',    co: CO,       per: PER },
  { mark: 'IN-ACCOUNTANT-DISPO', actor: 'accountant', co: CO,      per: PER },
  { mark: 'IN-STANDING-MODEL',  actor: 'analyst',    co: '',       per: '', standing: true },
  { mark: 'OUT-OTHER-COMPANY',  actor: 'accountant', co: OTHER_CO, per: PER },
  { mark: 'OUT-OTHER-PERIOD',   actor: 'analyst',    co: CO,       per: OTHER_PER }
].map(function (e, i) {
  return { actor: e.actor, co: e.co, per: e.per, standing: e.standing, title: 'Entry ' + i,
           message: 'Finding ' + e.mark, trigger: 'Test', at: '2026-07-0' + (i + 1) + 'T10:00:00Z',
           by: 'Tester ' + i, amount: null, _mark: e.mark };
});

function fixture() {
  const invRows = [], perpetual = [], accountDescriptions = [];
  [CO, OTHER_CO].forEach(function (co) {
    ACCTS.forEach(function (pair, ai) {
      accountDescriptions.push({ companyNumber: co, longAccount: pair[0], description: pair[1] });
      [PER, OTHER_PER].forEach(function (p) {
        invRows.push({ CompanyNumber: co, LongAccount: pair[0], PeriodEnds: p,
          EndGL: 100000 + ai, Perpetual: 99000 + ai, OOB: 1000, BegVar: 100, UnpostBatch: 50,
          EndofDay: 25, Variance: 800, CardexVar: 75, JEs: 100 });
      });
      for (let r = 0; r < 6; r++) {
        perpetual.push({ companyNumber: co, longAccount: pair[0], branch: 'BP01', itemNumber: 'ITEM' + r,
          itemDescription: 'Test item ' + r, uom: 'EA', quantityOnHand: r + 1, amountOnHand: (r + 1) * 3.25 });
      }
    });
  });
  return {
    invRows: invRows,
    detail: {
      perpetual: perpetual, accountDescriptions: accountDescriptions,
      reconcilingItems: [{ companyNumber: CO, longAccount: ACCTS[0][0], periodEnds: PER, worked: true,
        note: 'Checked the DMAAI routing for this order type.', dt: 'IM', docNumber: 12345, ot: 'SO',
        batch: 987, cardexAmount: 10, ledgerAmount: 8, variance: 2 }],
      unpostedBatchesUi: [], unpostedCardexUi: [], manualJournalEntries: []
    }
  };
}

/* ------------------------------------------------------------------ the harness --- */

// opts: mutate(src) -> src; state overrides; throwInBuild
function run(opts) {
  opts = opts || {};
  const sb = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  sb.Buffer = Buffer;
  sb.navigator = { userAgent: 'node' };
  sb.atob = function (x) { return Buffer.from(x, 'base64').toString('latin1'); };
  sb.btoa = function (x) { return Buffer.from(x, 'latin1').toString('base64'); };
  sb.document = { createElementNS: function () { return {}; },
                  createElement: function () { return { getContext: function () { return null; }, style: {} }; },
                  documentElement: { style: {} } };
  sb.localStorage = { getItem: function () { return null; }, setItem: function () {} };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VENDOR, 'jspdf.umd.min.js'), 'utf8'), sb, { filename: 'jspdf' });
  vm.runInContext(fs.readFileSync(path.join(VENDOR, 'jspdf.plugin.autotable.min.js'), 'utf8'), sb, { filename: 'autotable' });
  vm.runInContext(fs.readFileSync(GUARD, 'utf8'), sb, { filename: 'export-guard.js' });

  const fx = fixture();
  const out = { toasts: [], logs: [], saved: null };
  // The edges, stubbed. Everything between them is home.html's own code.
  sb.XLSX = {};   // home.html loads SheetJS; export-guard's "library did not load" branch is not under test
  sb._invRows = fx.invRows;
  sb._coOf = function (r) { return r.CompanyNumber; };
  sb._money = function (n) { return (Number(n) || 0).toFixed(2); };
  sb.fmtPeriod = function (s) { return s ? 'PE ' + s : ''; };
  sb._coNames = { '90001': 'Acme Test Co' };
  sb.RR_SESSION = { user: USER };
  sb.activeDb = function () { return { n: DB }; };
  sb.toast = function (m) { out.toasts.push(String(m)); };
  sb.withExportWatchdog = function (label, p) { return p; };
  sb._ensureAuditDetail = function () { return Promise.resolve(fx.detail); };
  sb._auditAiSummaries = function () { return Promise.resolve({}); };
  sb.RRV8.residual = { isZeroQty: function (q) { return Math.abs(Number(q) || 0) < 0.005; } };
  sb.RRV8.exportName = function (o) { return 'RR_' + o.surface + '_Co' + o.company + '_' + o.period + '.' + o.ext; };
  sb.RRV8.logActivity = function (ev, det) { out.logs.push({ event: ev, detail: det }); return Promise.resolve(); };
  // Audit Center state as renderAuditPanel leaves it. _acctData's period deliberately
  // DISAGREES with the header period, and the chip filter is left on Accountant.
  const st = Object.assign({
    _acctData: { companies: [{ co: CO, ccy: 'USD' }, { co: OTHER_CO, ccy: 'USD' }], viewedPeriod: OTHER_PER, latestPeriod: PER },
    _auditEntries: ENTRIES, _auditKey: DB + '|2', _auditEntriesKey: DB + '|2',
    _auditPeriod: PER, _auditCo: CO, _auditFilter: 'accountant'
  }, opts.state || {});
  Object.keys(st).forEach(function (k) { sb[k] = st[k]; });

  const jsPDF = sb.jspdf.jsPDF;
  jsPDF.API.save = function (name) { out.saved = { name: name, raw: Buffer.from(this.output('arraybuffer')).toString('latin1') }; };
  if (opts.throwInBuild) {
    jsPDF.API.autoTable = function () { throw new Error('simulated assembly failure'); };
  }

  let src = baseSrc;
  if (opts.mutate) src = opts.mutate(src);
  vm.runInContext(src, sb, { filename: 'home.html:evidence' });
  return Promise.resolve(sb.genEvidencePackage(opts.co === undefined ? CO : opts.co)).then(function () { return out; });
}

/* ---------------------------------------------------------------------- pdf parse --- */

function parsePdf(raw) {
  const objs = {};
  const re = /(\d+) 0 obj\s*([\s\S]*?)\nendobj/g;
  let m;
  while ((m = re.exec(raw)) !== null) objs[m[1]] = m[2];
  let kids = null;
  Object.keys(objs).forEach(function (id) {
    if (objs[id].indexOf('/Type /Pages') >= 0 && kids === null) {
      const k = objs[id].match(/\/Kids \[([^\]]*)\]/);
      if (k) kids = k[1].trim().split(/\s+0 R\s*/).filter(Boolean);
    }
  });
  if (!kids) throw new Error('no /Pages object found');
  const pages = kids.map(function (id, idx) {
    const body = objs[id];
    const contentId = (body.match(/\/Contents (\d+) 0 R/) || [])[1];
    const stream = contentId && objs[contentId] ? objs[contentId] : '';
    const text = [];
    let t;
    const tre = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    while ((t = tre.exec(stream)) !== null) text.push(t[1].replace(/\\([()\\])/g, '$1'));
    const annots = [];
    const are = /\/Subtype \/Link[^>]*?\/Rect \[([^\]]+)\][^>]*?\/Dest \[(\d+) 0 R/g;
    let a;
    while ((a = are.exec(body)) !== null) annots.push({ rect: a[1].trim().split(/\s+/).map(Number), destObj: a[2] });
    return { objId: id, pageNo: idx + 1, text: text, all: text.join('\n'), annots: annots };
  });
  const byObj = {};
  pages.forEach(function (p) { byObj[p.objId] = p; });
  return { pages: pages, byObj: byObj, all: pages.map(function (p) { return p.all; }).join('\n') };
}

/* ------------------------------------------------------------------------ asserts --- */

function packageAssertions(out) {
  const r = [];
  const chk = function (cond, name, detail) { r.push({ cond: !!cond, name: name, detail: detail }); };
  chk(!!out.saved, 'a file was saved', 'toasts: ' + out.toasts.join(' | '));
  if (!out.saved) return r;
  const pdf = parsePdf(out.saved.raw);
  const cover = pdf.pages[0];
  const n = pdf.pages.length;

  chk(/EvidencePackage_Co90001_2026-06-30\.pdf$/.test(out.saved.name), 'file name names the package, company and period', out.saved.name);
  // Cover identity
  chk(cover.all.indexOf('PERIOD-CLOSE EVIDENCE PACKAGE') >= 0, 'cover is page 1');
  chk(cover.all.indexOf('Acme Test Co') >= 0 && cover.all.indexOf('Co 90001') >= 0, 'cover names the company');
  chk(cover.all.indexOf('PE ' + PER) >= 0, 'cover names the period');
  chk(cover.all.indexOf(DB) >= 0, 'cover names the database');
  chk(cover.all.indexOf(USER.fn) >= 0 && cover.all.indexOf(USER.u) >= 0, 'cover names who generated it');
  chk(cover.all.indexOf('Account Summary') < 0, 'the Audit report did not draw over the cover');

  // Contents links land where they say
  const want = [
    { label: 'Perpetual Inventory Reconciliation', opens: 'Perpetual Inventory Reconciliation' },
    { label: 'Period Activity', opens: 'Reconciliation Audit Findings' }
  ];
  chk(cover.annots.length === want.length, 'one contents link per section', 'found ' + cover.annots.length);
  cover.annots.forEach(function (a, i) {
    const target = pdf.byObj[a.destObj], w = want[i];
    if (!w) return;
    chk(!!target, 'contents link ' + (i + 1) + ' resolves to a page');
    if (!target) return;
    chk(target.pageNo > 1, 'contents link ' + (i + 1) + ' leaves the cover', 'page ' + target.pageNo);
    chk(target.all.indexOf(w.opens) >= 0, 'contents link ' + (i + 1) + ' lands on the page that opens "' + w.opens + '"',
        'page ' + target.pageNo + ' starts: ' + target.text.slice(0, 3).join(' / '));
    chk(cover.text.some(function (s) { return s === 'Page ' + target.pageNo; }),
        'contents line ' + (i + 1) + ' prints the page its link lands on (' + target.pageNo + ')');
    // The page before must not already be inside the section. The cover is exempt: its
    // contents list prints every section title, which is not the section starting there.
    const prev = pdf.pages[target.pageNo - 2];
    chk(!prev || prev.pageNo === 1 || prev.all.indexOf(w.opens) < 0,
        'contents link ' + (i + 1) + ' lands on the FIRST page of its section');
  });

  // Sections in order
  const auditFirst = pdf.pages.findIndex(function (p) { return p.all.indexOf('Account Summary') >= 0; });
  const actFirst = pdf.pages.findIndex(function (p) { return p.all.indexOf('Reconciliation Audit Findings') >= 0 && p.pageNo > 1; });
  chk(auditFirst > 0 && actFirst > auditFirst, 'Audit report comes before Period Activity', 'audit p' + (auditFirst + 1) + ', activity p' + (actFirst + 1));
  chk(pdf.all.indexOf('Reconciliation Findings / Work Notes') >= 0, 'the Audit report carries its findings / work notes section');

  // One period across both halves
  chk(pdf.all.indexOf('Period Ends: PE ' + PER) >= 0, 'Audit report section is on the header period, not _acctData\'s');
  chk(pdf.all.indexOf('PE ' + OTHER_PER) < 0, 'the other period appears nowhere in the file');
  chk(pdf.all.indexOf('Period: PE ' + PER) >= 0, 'Period Activity section is on the header period');

  // Every actor, this company and period only
  ENTRIES.forEach(function (e) {
    const there = pdf.all.indexOf('Finding ' + e._mark) >= 0;
    chk(e._mark.indexOf('IN-') === 0 ? there : !there,
        (e._mark.indexOf('IN-') === 0 ? 'includes ' : 'excludes ') + e._mark + ' (chip filter left on Accountant)');
  });

  // Footer on every page
  pdf.pages.forEach(function (p) {
    if (p.all.indexOf('Page ' + p.pageNo + ' of ' + n) < 0 || p.all.indexOf('Co 90001') < 0 || p.all.indexOf('Period ending PE ' + PER) < 0) {
      chk(false, 'page ' + p.pageNo + ' is footed with company, period and page x of ' + n);
    }
  });
  chk(true, 'every page footed (failures above if not)');

  // Logged once, success toast names the page count
  chk(out.logs.length === 1 && out.logs[0].event === 'Evidence package exported', 'logged once as "Evidence package exported"',
      JSON.stringify(out.logs));
  chk(out.logs.length && /Co 90001/.test(out.logs[0].detail) && out.logs[0].detail.indexOf(PER) >= 0,
      'the log entry names the company and period', out.logs.length ? out.logs[0].detail : '');
  chk(out.toasts.some(function (t) { return t === 'Downloaded the evidence package (PDF) — ' + n + ' pages'; }),
      'success toast states the page count', out.toasts.join(' | '));
  return r;
}

function report(label, results, expectPass, controlName) {
  const passed = results.filter(function (x) { return x.cond; }).length;
  console.log('\n' + label + ' -- ' + passed + '/' + results.length + ' assertions held');
  if (expectPass) results.forEach(function (x) { ok(x.cond, x.name, x.detail); });
  else {
    results.forEach(function (x) { if (!x.cond) console.log('  (expected break) ' + x.name); });
    ok(passed < results.length, 'CONTROL: ' + controlName + ' breaks at least one assertion',
       'every assertion still held -- this harness does not measure that claim');
  }
}

function mutateOnce(find, repl) {
  return function (src) {
    if (src.indexOf(find) < 0) throw new Error('control target not found -- home.html changed shape: ' + find);
    return src.replace(find, repl);
  };
}

/* --------------------------------------------------------------------------- run --- */

(async function main() {
  console.log('Audit Center evidence package -- behaviour test\n' +
              'source: RRV8/home.html (genEvidencePackage + section writers, sliced and executed verbatim)');

  const shipped = await run();
  report('SHIPPED SOURCE', packageAssertions(shipped), true);
  // EVIDENCE_PDF_OUT=<path> writes the package built above, to look at in a PDF viewer.
  // The assertions read the file's structure; only a viewer shows the layout.
  if (process.env.EVIDENCE_PDF_OUT && shipped.saved) {
    fs.writeFileSync(process.env.EVIDENCE_PDF_OUT, Buffer.from(shipped.saved.raw, 'latin1'));
    console.log('  wrote ' + process.env.EVIDENCE_PDF_OUT);
  }

  // Refusals: no file, and a reason the user can act on.
  console.log('\nREFUSALS');
  let o = await run({ state: { _auditEntriesKey: 'RapidReconciler_Other_V8|2' } });
  ok(!o.saved, 'refuses while the trail on screen came from an earlier fetch (DB switch)');
  ok(o.toasts.some(function (t) { return /has not loaded yet/.test(t); }), 'and says the trail has not loaded', o.toasts.join(' | '));
  o = await run({ state: { _auditPeriod: '', _acctData: { companies: [{ co: CO, ccy: 'USD' }], viewedPeriod: '', latestPeriod: '' } } });
  ok(!o.saved, 'refuses with no period selected');
  ok(o.toasts.some(function (t) { return /one period/.test(t); }), 'and says a package covers one period', o.toasts.join(' | '));
  o = await run({ co: '99999' });
  ok(!o.saved && o.toasts.some(function (t) { return /No matching company/.test(t); }), 'refuses a company not in scope');
  o = await run({ state: { _auditEntries: ENTRIES.filter(function (e) { return e.co === OTHER_CO; }) } });
  ok(!!o.saved, 'still builds when the company has no activity this period');
  ok(o.saved && parsePdf(o.saved.raw).all.indexOf('No analyst or accountant activity was recorded') >= 0,
     'and says so, instead of an empty section');

  // Assembly failure: reported through runExport, readable, nothing logged.
  console.log('\nASSEMBLY FAILURE');
  o = await run({ throwInBuild: true });
  const fail = o.toasts.filter(function (t) { return /Evidence package export failed/.test(t); })[0] || '';
  ok(!o.saved, 'no file when the PDF cannot be assembled');
  ok(!!fail, 'the failure reaches the toast', o.toasts.join(' | '));
  ok(fail.indexOf('&mdash;') < 0 && fail.indexOf('—') >= 0, 'the reason carries a real dash, not "&mdash;" (toast is textContent)', fail);
  ok(fail.indexOf('simulated assembly failure') >= 0, 'the reason carries the underlying error', fail);
  ok(o.logs.length === 0, 'nothing logged as exported', JSON.stringify(o.logs));
  ok(!o.toasts.some(function (t) { return /data service may be unavailable/.test(t); }),
     'not misreported as a data-service failure');

  // Controls, last.
  report('CONTROL (chip filter leaks into the package)',
    packageAssertions(await run({ mutate: mutateOnce('var acts = _auditActivityRows(co, per, null);', 'var acts = _auditActivityRows(co, per, _auditPass);') })),
    false, 'passing the screen chip filter');
  report('CONTROL (Audit report draws over the cover)',
    packageAssertions(await run({ mutate: mutateOnce('i === 0 && !afterCover', 'i === 0') })),
    false, 'dropping afterCover');
  report('CONTROL (Audit report reads _acctData\'s period)',
    packageAssertions(await run({ mutate: mutateOnce("var per = _auditPeriod || d.viewedPeriod || d.latestPeriod || '';", "var per = d.viewedPeriod || d.latestPeriod || '';") })),
    false, 'resolving the period from _acctData');
  report('CONTROL (contents page off by one)',
    packageAssertions(await run({ mutate: mutateOnce('var pAudit = doc.internal.getNumberOfPages() + 1;', 'var pAudit = doc.internal.getNumberOfPages();') })),
    false, 'linking the cover to itself');
  o = await run({ mutate: mutateOnce('if (!_auditEntries || !_auditKey || _auditEntriesKey !== _auditKey)', 'if (!_auditEntries)'),
                  state: { _auditEntriesKey: 'RapidReconciler_Other_V8|2' } });
  ok(!!o.saved, 'CONTROL: without the fetch-key check, a stale trail DOES ship (so the refusal above is the check, not an accident)');

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
