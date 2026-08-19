/* test-audit-pdf-links.js -- structural test for the audit report's Account Summary links.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-audit-pdf-links.js
 *
 * WHY THIS EXISTS. The audit PDF's Account Summary renders each account in link blue and
 * attaches a jump to that account's own page. Whether the jump LANDS is not something a
 * viewer can settle: Chrome and Edge each ship their own PDF engine, they disagree, and
 * Acrobat is not installed on this box. So the claim is tested against the FILE instead
 * of against a viewer -- the destination in a PDF is an explicit object reference, and
 * either it names the page that renders the account heading or it does not.
 *
 * WHAT IS ACTUALLY UNDER TEST. The link sequence is fragile in a way nothing else in the
 * report is. The summary table is drawn BEFORE the account pages exist, so the cell
 * rectangles are captured in didDrawCell and the annotations are attached afterwards --
 * and doc.link() writes to whatever page the pointer happens to be parked on. Three
 * things have to hold at once: the rects must remember the summary page, the target must
 * be each account's FIRST page, and the pointer must be put back before the next company
 * opens with addPage(). Get the last one wrong and the next company interleaves into the
 * middle of this one, which no assertion about link geometry would catch.
 *
 * THE SOURCE IS NOT RETYPED HERE. _buildAuditPdfSection and its helpers are sliced out of
 * RRV8/home.html at run time and executed verbatim. A harness that paraphrases the
 * sequence tests the paraphrase.
 *
 * THE CONTROL RUNS LAST. Removing the `doc.setPage(r.page)` line is exactly the mistake
 * this file exists to catch, so the same assertions are re-run against a source with that
 * line stripped. If the control PASSES, the harness is not measuring anything and the
 * green result above it is worthless.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const HOME = path.join(ROOT, 'RRV8', 'home.html');
const VENDOR = path.join(ROOT, 'RRV8', 'vendor');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

/* ---------------------------------------------------------------- source slicing --- */

// Brace-balanced slice of a top-level declaration, skipping over string literals and
// comments so a brace inside either cannot end the block early.
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
const PIECES = ['_auditAccts', '_dfil', '_auditResidualTarget', '_auditResiduals', '_auditMoney',
                '_auditResidualLine', '_auditPdfCover', '_pdfRight', '_pdfSecTitle', '_pdfEmpty',
                '_pvNum', '_buildAuditPdfSection'];
const extracted = {};
PIECES.forEach(function (n) { extracted[n] = extractFn(homeSrc, n); });
const auditPdfConst = extractVar(homeSrc, '_AUDIT_PDF');

/* ------------------------------------------------------------------ fixture data --- */

const PER = '2026-06-30';
const COMPANIES = [{ co: '90001', ccy: 'USD' }, { co: '90002', ccy: 'USD' }];
const ACCTS = {
  '90001': [['5000.140000', 'Raw Materials'], ['5000.141000', 'Work In Process'], ['5000.142000', 'Finished Goods']],
  '90002': [['6000.140000', 'Raw Materials'], ['6000.143000', 'Packaging Stock']]
};

function buildFixture() {
  const invRows = [], perpetual = [], descMap = {};
  Object.keys(ACCTS).forEach(function (co) {
    ACCTS[co].forEach(function (pair, ai) {
      const la = pair[0];
      descMap[co + '|' + la] = pair[1];
      invRows.push({ CompanyNumber: co, LongAccount: la, PeriodEnds: PER,
        EndGL: 100000 + ai * 1000, Perpetual: 99000 + ai * 1000, OOB: 1000,
        BegVar: 100, UnpostBatch: 50, EndofDay: 25, Variance: 800, CardexVar: 75, JEs: 100 });
      // Enough rows that every account's detail runs past one page, so "the link lands on
      // the account's page" is a real assertion rather than an accident of short tables.
      for (let r = 0; r < 80; r++) {
        perpetual.push({ companyNumber: co, longAccount: la, branch: 'BP01',
          itemNumber: 'ITEM' + ai + '-' + r, itemDescription: 'Test item ' + r, uom: 'EA',
          quantityOnHand: r === 3 ? 0 : (r + 1), amountOnHand: (r + 1) * 3.25 });
      }
    });
  });
  return {
    invRows: invRows,
    descMap: descMap,
    detail: {
      perpetual: perpetual,
      reconcilingItems: [{ companyNumber: '90001', longAccount: '5000.140000', periodEnds: PER,
        worked: true, note: 'Checked the DMAAI routing for this order type.', dt: 'IM',
        docNumber: 12345, ot: 'SO', batch: 987, cardexAmount: 10, ledgerAmount: 8, variance: 2 }],
      unpostedBatchesUi: [{ companyNumber: '90001', longAccount: '5000.141000', periodEnds: PER,
        batchDate: PER, username: 'tester', batchNumber: 5150, type: 'N',
        approval_Status: 'A', posting_Status: 'P', amount: 42.5 }],
      unpostedCardexUi: [{ companyNumber: '90002', longAccount: '6000.140000', periodEnds: PER,
        transactionDate: PER, type: 'IM', orderType: 'SO', docType: 'IM', docNumber: 777,
        branchPlant: 'BP01', status: 'U', transactionAmount: 12.75 }],
      manualJournalEntries: [{ companyNumber: '90001', longAccount: '5000.142000', periodEnds: PER,
        docNumber: 4321, docType: 'JE', username: 'tester', amount: 60 }]
    }
  };
}

/* -------------------------------------------------------------------- pdf builder --- */

function buildPdf(mutate) {
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
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(VENDOR, 'jspdf.umd.min.js'), 'utf8'), sb, { filename: 'jspdf' });
  vm.runInContext(fs.readFileSync(path.join(VENDOR, 'jspdf.plugin.autotable.min.js'), 'utf8'), sb, { filename: 'autotable' });

  const fx = buildFixture();
  sb._invRows = fx.invRows;
  sb._coOf = function (r) { return r.CompanyNumber; };
  sb.fmtPeriod = function (s) { return s; };
  sb.RRV8 = { residual: { isZeroQty: function (q) { return Math.abs(Number(q) || 0) < 0.005; } } };

  let src = auditPdfConst + '\n' + PIECES.map(function (n) { return extracted[n]; }).join('\n');
  if (mutate) src = mutate(src);
  vm.runInContext(src, sb, { filename: 'home.html:audit' });

  const jsPDF = (sb.jspdf && sb.jspdf.jsPDF) || sb.jsPDF;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  COMPANIES.forEach(function (c, i) {
    sb._buildAuditPdfSection(doc, c, PER, fx.detail, fx.descMap, i === 0, '');
  });
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
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
    while ((a = are.exec(body)) !== null) {
      const r = a[1].trim().split(/\s+/).map(Number);
      annots.push({ rect: r, destObj: a[2] });
    }
    return { objId: id, pageNo: idx + 1, text: text, annots: annots };
  });

  const byObj = {};
  pages.forEach(function (p) { byObj[p.objId] = p; });
  return { pages: pages, byObj: byObj };
}

/* ------------------------------------------------------------------------ asserts --- */

function runAssertions(raw, label, expectPass) {
  const pdf = parsePdf(raw);
  const before = failures;
  const local = [];
  function chk(cond, name, detail) { local.push({ cond: !!cond, name: name, detail: detail }); }

  const headings = {};   // "co|la" -> [pageNo, ...] where that account's heading is drawn
  Object.keys(ACCTS).forEach(function (co) {
    ACCTS[co].forEach(function (pair) {
      const want = pair[0] + ' - ' + pair[1];
      headings[co + '|' + pair[0]] = pdf.pages.filter(function (p) {
        return p.text.indexOf(want) >= 0;
      }).map(function (p) { return p.pageNo; });
    });
  });

  const summaryPages = pdf.pages.filter(function (p) { return p.text.indexOf('Account Summary') >= 0; });
  chk(summaryPages.length === COMPANIES.length,
      'one Account Summary page per company',
      'found ' + summaryPages.length + ' of ' + COMPANIES.length);

  const totalAccts = Object.keys(ACCTS).reduce(function (n, co) { return n + ACCTS[co].length; }, 0);
  const allAnnots = pdf.pages.reduce(function (n, p) { return n + p.annots.length; }, 0);
  chk(allAnnots === totalAccts, 'one link annotation per account',
      'found ' + allAnnots + ' links for ' + totalAccts + ' accounts');

  // Every heading appears on exactly one page: this is the "one account per page" claim.
  Object.keys(headings).forEach(function (key) {
    chk(headings[key].length === 1, 'account ' + key + ' heading drawn on exactly one page',
        'pages: [' + headings[key].join(', ') + ']');
  });
  pdf.pages.forEach(function (p) {
    const n = Object.keys(headings).filter(function (k) { return headings[k].indexOf(p.pageNo) >= 0; }).length;
    if (n > 1) chk(false, 'page ' + p.pageNo + ' carries one account heading', n + ' headings share it');
  });

  // Every annotation sits on a summary page, and its destination is the page that draws
  // the heading for one of that company's accounts.
  const destPages = [];
  pdf.pages.forEach(function (p) {
    p.annots.forEach(function (a) {
      // A link with a collapsed or off-page rectangle is present in the file and
      // unclickable in every viewer, which is the one failure a /Dest check cannot see.
      const w = Math.abs(a.rect[2] - a.rect[0]), h = Math.abs(a.rect[3] - a.rect[1]);
      chk(w > 20 && h > 5, 'link hot zone on page ' + p.pageNo + ' is clickable',
          'rect ' + a.rect.join(' ') + ' -> ' + w.toFixed(1) + ' x ' + h.toFixed(1) + ' pt');
      chk(Math.min(a.rect[1], a.rect[3]) >= 0 && Math.max(a.rect[1], a.rect[3]) <= 792,
          'link hot zone on page ' + p.pageNo + ' sits inside the page',
          'rect ' + a.rect.join(' '));
      const target = pdf.byObj[a.destObj];
      chk(!!target, 'link destination resolves to a page object', 'obj ' + a.destObj);
      if (!target) return;
      destPages.push(target.pageNo);
      chk(p.text.indexOf('Account Summary') >= 0,
          'link on page ' + p.pageNo + ' is on an Account Summary page');
      const matched = Object.keys(headings).filter(function (k) {
        return headings[k].indexOf(target.pageNo) >= 0;
      });
      chk(matched.length === 1,
          'link from page ' + p.pageNo + ' lands on an account heading page (page ' + target.pageNo + ')',
          matched.length ? 'matched ' + matched.join(' + ') : 'target page draws no account heading');
    });
  });
  chk(new Set(destPages).size === destPages.length, 'no two links share a destination page',
      destPages.join(', '));

  // Company sections stay contiguous: the pointer was restored after the links were
  // attached, so company 2 opens after the whole of company 1.
  const coFirstPage = summaryPages.map(function (p) { return p.pageNo; });
  chk(coFirstPage.length < 2 || coFirstPage[1] > Math.max.apply(null, headings[
        Object.keys(ACCTS)[0] + '|' + ACCTS[Object.keys(ACCTS)[0]][ACCTS[Object.keys(ACCTS)[0]].length - 1][0]
      ]), 'the second company starts after the first company ends',
      'summary pages at ' + coFirstPage.join(', '));

  const passed = local.filter(function (r) { return r.cond; }).length;
  console.log('\n' + label + ' -- ' + passed + '/' + local.length + ' assertions held, ' +
              pdf.pages.length + ' pages');
  local.forEach(function (r) {
    if (expectPass) ok(r.cond, r.name, r.detail);
    else if (!r.cond) console.log('  (expected break) ' + r.name + (r.detail ? ' -- ' + r.detail : ''));
  });
  if (!expectPass) {
    ok(passed < local.length, 'CONTROL: stripping doc.setPage(r.page) breaks the links',
       'every assertion still held with the line removed -- this harness proves nothing');
  }
  return failures === before;
}

/* --------------------------------------------------------------------------- run --- */

console.log('audit report Account Summary links -- structural test\n' +
            'source: RRV8/home.html (_buildAuditPdfSection, sliced and executed verbatim)');

runAssertions(buildPdf(null), 'SHIPPED SOURCE', true);

// Control, last. The mutation is the exact line whose absence the comment in home.html
// warns about; it must break at least one assertion above.
const CONTROL_LINE = 'doc.setPage(r.page);';
runAssertions(buildPdf(function (src) {
  if (src.indexOf(CONTROL_LINE) < 0) throw new Error('control line not found -- home.html changed shape');
  return src.replace(CONTROL_LINE, '/* control: setPage removed */');
}), 'CONTROL (setPage removed)', false);

console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
process.exit(failures ? 1 : 0);
