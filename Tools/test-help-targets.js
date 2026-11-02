/* test-help-targets.js -- behaviour test for UI-259: every V8 page's help "?" shows a section, and the pages whose
 * guide was rewritten show THEIR page, not a V7 screen.
 *
 *   node Tools/test-help-targets.js
 *
 * WHY THIS EXISTS. UI-248 found the "?" on Full Perpetual Details opening V7's As-Of screen, and the owner asked for
 * the other V8 pages to be checked. Reading them found the same defect in other shapes, among them a panel that shows
 * nothing at all: accounting-dmaais.html pointed at administrator-start-here.html#accounting-setup, the guide's router
 * hides every view and then finds no topic-accounting-setup to show, so the panel opened blank.
 *
 * What the panel shows is decided by the target doc's own router (#x shows id="topic-x" in most RR University docs;
 * no hash shows the home view), so this asks Tools/help-panel-view.js, which runs the doc's own inline scripts
 * against a DOM built from its markup and reads the active view. A src check passes on a blank or a V7 panel; this
 * reads what the reader reads.
 *
 *   H1  every RRV8 page with a data-help-src opens a file that exists and shows exactly one section of it
 *   H2  each page in CONTENT shows a section that names every control label read out of that page's own markup
 *   H3  ...and none of the V7-only screen terms listed for it
 *
 * MUTATION ARMS: each page in CONTENT is pointed back at the target it had before UI-259, and must redden H2 or H3
 * for that page (or H1, where the old target showed nothing). An arm that changes nothing is a broken harness.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { panelView } = require('./help-panel-view');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const pages = fs.readdirSync(path.join(ROOT, 'RRV8')).filter((f) => f.endsWith('.html'))
  .filter((f) => /\sdata-help-src="/.test(read('RRV8/' + f))).map((f) => 'RRV8/' + f);
// 19 when UI-259 shipped; 17 since UI-261 deleted the Report Engine and Variance Source pages.
if (pages.length < 17) { console.log('HARNESS BROKEN: found ' + pages.length + ' pages with data-help-src, expected at least 17'); process.exit(1); }

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok || !detail ? '' : '   ' + detail));
  return ok;
}

console.log('H1 every V8 help "?" shows one section of a file that exists (' + pages.length + ' pages)');
for (const p of pages) {
  const r = panelView(p);
  check('H1 ' + p + ' -> ' + (r.src || '?') + (r.view ? '  [' + r.view + ']' : ''),
    !r.error && r.landed && r.text && r.text.length > 200,
    r.error || (!r.landed ? 'the anchor is not in the section the panel shows' : 'shows only ' + (r.text || '').length + ' characters'));
}

// ---------------------------------------------------------------------------------------------------------------
// H2/H3/H4 per rewritten page. `labels` are read OUT OF THE PAGE (or a file it loads) by a stable selector, so a
// renamed control fails here instead of leaving the guide stale. `forbid` is what the old guide said that the page
// does not do (V7 screens, retired controls). `heading` is what the anchored section's first heading must say, for
// pages whose defect was landing in the wrong place. `was` is the target before UI-259, for the mutation arm.
// ---------------------------------------------------------------------------------------------------------------
const one = (html, re, what) => {
  const m = html.match(re);
  if (!m) { console.log('HARNESS BROKEN: label not found in the page: ' + what + '  ' + re); process.exit(1); }
  return m[1].replace(/&hellip;/g, '…').replace(/&amp;/g, '&').replace(/&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
};
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1].replace(/&hellip;/g, '…').replace(/\s+/g, ' ').trim());
const h1 = (html) => one(html, /<h1 class="page-title"[^>]*>([^<]+)</, 'h1.page-title');

const CONTENT = [
  { page: 'RRV8/accounting-dmaais.html', was: '../RRUniversity/administrator-start-here.html#accounting-setup',
    labels: (h) => [
      one(h, /class="worklist-title"[^>]*>([^<]+)</, 'Fix first title'),
      one(h, /id="js-card-ask-customer"[\s\S]*?class="worklist-title"[^>]*>([^<]+)</, 'Ask the customer title'),
      one(h, /id="js-save-discard"[^>]*>([^<]+)</, 'Discard'),
      ...all(h, /class="tab-pill[^"]*"[^>]*data-tab="[^"]+"[^>]*>\s*([A-Za-z][A-Za-z ]+?)\s*</g),
    ],
    forbid: [] },
  { page: 'RRV8/admin-activity-log.html', was: '../RRUniversity/administrator-start-here.html#system-health',
    heading: /Activity Log/,
    labels: (h) => [one(h, /class="card-title"[^>]*>(Recent events)</, 'Recent events'),
      ...all(one(h, /(<table class="log"[\s\S]*?<\/thead>)/, 'log table head'), /<th[^>]*>([^<]+)</g)],
    forbid: [] },
  { page: 'RRV8/admin-troubleshooting.html', was: '../RRUniversity/administrator-start-here.html#system-health',
    heading: /Troubleshooting/, labels: (h) => [one(h, /id="js-download"[^>]*>([^<]+)</, 'Download diagnostics')], forbid: [] },
  { page: 'RRV8/admin-purge-data.html', was: '../RRUniversity/administrator-start-here.html#data',
    heading: /Purg/, labels: (h) => [one(h, /id="js-confirm"[^>]*>([^<]+)</, 'Set new cutoff'), ...all(h, /class="fact-k"[^>]*>([^<]+)</g)],
    forbid: ['The Purge dialog', 'DATABASE SIZE', 'Set cutoff'] },
  { page: 'RRV8/admin-reload-cardex.html', was: null,
    labels: (h) => [h1(h), one(h, /id="js-confirm"[^>]*>([^<]+)</, 'Reload cardex')], forbid: ['Reload…', 'The dialog'] },
  { page: 'RRV8/inventory-account-rollforward.html', was: null,
    labels: (h) => [one(h, /id="rgbBtn"[^>]*>[\s\S]*?(Rebuild roll-forward)/, 'Rebuild roll-forward'),
      one(h, /id="rptHead"[\s\S]*?class="band-title"[^>]*>([^<]+)</, 'Audit Report band'),
      one(h, /id="rlgModalGo"[^>]*>([^<]+)</, 'Go'), one(h, /id="accountPick"[\s\S]*?<option value="">([^<]+)</, 'All accounts'),
      'GL OK', 'Var OK'],
    forbid: ['the only manual lever'] },
  // The cardex guide is a single-page app that opens on its index; the page's controls are described in its step
  // topics, one click away. So this one reads the whole doc rather than the index view.
  { page: 'RRV8/inventory-cardex-variance.html', was: null, scope: 'doc',
    labels: (h) => [one(h, /class="grid-title"[^>]*>(Item position)</, 'Item position'),
      one(h, /class="cx-tol-lbl"[^>]*>([^<]+)</, 'Materiality tolerance'), one(h, /id="cxTolList"[^>]*>([^<]+)</, 'Overrides list'),
      one(h, /id="detailTitle"[^>]*>([^<]+)</, 'Cardex detail')],
    forbid: ['entry box'] },
  { page: 'RRV8/inventory-transactions.html', was: null,
    labels: (h) => [one(h, /<div class="edit-title">([^<]+)</, 'Update selected rows (the batch modal; #status-title is another edit-title)'),
      ...all(h, /class="analyze-sec-h"[^>]*>([^<]+)</g),
      one(h, /id="edit-apply"[^>]*>([^<]+)</, 'Apply')],
    forbid: [] },
  { page: 'RRV8/accounting-model-review.html', was: null,
    labels: (h) => [h1(h)], forbid: ['Accounting Model Review', 'Integrity Reports menu'] },
  // The three team docs are single-page apps whose help opens one view (topic-users, topic-company, topic-overview);
  // what they cover beyond that view is a sidebar click away, so they read the whole doc. Their forbid lists are the
  // false claims the audit found: a navigation path Home does not have, and two password statements.
  { page: 'RRV8/admin-users.html', was: null, scope: 'doc',
    labels: (h) => [one(h, /id="js-nu-save"[^>]*>([^<]+)</, 'Send invite'), one(h, /id="js-perms-done"[^>]*>([^<]+)</, 'Done'),
      one(h, /id="js-review-record"[^>]*>([^<]+)</, 'Record review'),
      ...all(one(h, /(<table[^>]*id="js-users-table"[\s\S]*?<\/thead>)/, 'users table head'), /<th[^>]*>([^<]+)</g)],
    forbid: ['People &amp; Licensing', 'People & Licensing', 're-send the set-password link', 'never set, see, or'] },
  { page: 'RRV8/admin-companies.html', was: null, scope: 'doc',
    labels: (h) => [h1(h), one(h, /id="js-lic-invoice"[^>]*>([^<]+)</, 'Request an invoice'), one(h, /id="js-check-jde"[\s\S]*?<\/svg>\s*([^<]+?)\s*</, 'Check JDE (the text after its icon)'),
      ...all(one(h, /(<table[^>]*id="js-companies-table"[\s\S]*?<\/thead>)/, 'companies table head'), /<th[^>]*>([^<]+)</g)],
    forbid: ['People & Licensing', 'The Companies page'] },
  { page: 'RRV8/admin-complex-passwords.html', was: null, scope: 'doc',
    labels: (h) => [h1(h), one(h, /id="js-set-all"[^>]*>([^<]+)</, 'Require for all'), one(h, /id="js-set-none"[^>]*>([^<]+)</, 'Turn off for all')],
    forbid: ['the Users page', 'Complex Password Option', 're-send the set-password link'] },
  { page: 'RRV8/admin-reload-gl.html', was: null,
    labels: (h) => [one(read('RRV8/inventory-account-rollforward.html'), /id="rlgModalTitle"[^>]*>([^<]+)</, 'Reload GL modal title'), 'Account Roll Forward'],
    forbid: ['status dot', 'Reload…'] },
];

function judge(c, opts) {
  const r = panelView(c.page, opts);
  const out = [];
  if (r.error || !r.landed) return ['H1'];
  const html = (opts && opts.pageHtml) || read(c.page);
  if (c.scope === 'doc') {
    const { textOf } = require('./help-panel-view');
    const docSrc = read(r.file);
    r.text = textOf((opts && opts.docHtml) ? opts.docHtml(docSrc) : docSrc);
  }
  // Case-insensitive: a guide's figure draws small-caps labels the way the page's CSS shows them (CURRENT START DATE).
  const seen = r.text.toLowerCase();
  const missing = c.labels(html).filter((l) => seen.indexOf(l.toLowerCase()) < 0);
  if (missing.length) out.push('H2');
  const lower = r.text.toLowerCase();
  const v7 = c.forbid.filter((t) => lower.indexOf(t.toLowerCase()) >= 0);
  if (v7.length) out.push('H3');
  if (c.heading && !c.heading.test(r.heading)) out.push('H4');
  return { reds: out, missing, v7, heading: r.heading };
}

console.log('\nH2-H4 the rewritten pages\' guides describe their page (' + CONTENT.length + ' pages)');
for (const c of CONTENT) {
  const j = judge(c);
  const reds = Array.isArray(j) ? j : j.reds;
  check(c.page.replace('RRV8/', '') + '  ' + (reds.length ? reds.join(',') : 'H2 H3' + (c.heading ? ' H4' : '')), reds.length === 0,
    Array.isArray(j) ? 'did not land' : JSON.stringify({ missing: j.missing, v7: j.v7, heading: c.heading ? j.heading : undefined }));
}

if (failures === 0) {
  console.log('\nmutation arms: each page pointed back at its target before UI-259 must go red');
  for (const c of CONTENT.filter((x) => x.was)) {
    const html = read(c.page);
    const cur = (html.match(/data-help-src="([^"]+)"/) || [])[1];
    const armed = html.replace('data-help-src="' + cur + '"', 'data-help-src="' + c.was + '"');
    if (armed === html) { console.log('HARNESS BROKEN: arm for ' + c.page + ' changed nothing'); process.exit(1); }
    const j = judge(c, { pageHtml: armed });
    const reds = Array.isArray(j) ? j : j.reds;
    check('arm ' + c.page.replace('RRV8/', '') + ' -> ' + c.was.replace('../RRUniversity/', '') + ' reddens ' + (reds.join(',') || 'nothing'), reds.length > 0);
  }
  // Guides fixed in place keep their target, so their arm puts the old wording back into the section the panel
  // shows (inside its first heading's paragraph) and H3 must catch it. Git history is not available to CI's
  // shallow checkout, so the old text is the forbid entry itself.
  for (const c of CONTENT.filter((x) => !x.was && x.forbid.length)) {
    const r0 = panelView(c.page);
    const anchor = r0.heading;
    const inject = (html) => {
      // Search inside the view the panel shows: the same heading text can also sit in another, hidden view (the
      // admin guide's Utilities summary repeats "Reload Cardex Data"), and an arm planted there proves nothing.
      const from = r0.view ? html.indexOf('id="' + r0.view + '"') : 0;
      const at = html.indexOf('>' + anchor.replace(/&/g, '&amp;').replace(/’/g, '&rsquo;') + '</h', Math.max(0, from));
      if (at < 0) { console.log('HARNESS BROKEN: cannot find the heading "' + anchor + '" to arm ' + c.page); process.exit(1); }
      // The first paragraph after that heading, attributes and all (`<p class="lead">` is common): a bare '<p>'
      // search skipped past it into another view, and the arm proved nothing.
      const pm = /<p\b[^>]*>/g; pm.lastIndex = at;
      const p = pm.exec(html);
      const cut = p.index + p[0].length;
      return html.slice(0, cut) + c.forbid[0] + ' ' + html.slice(cut);
    };
    const j = judge(c, { docHtml: inject });
    const reds = Array.isArray(j) ? j : j.reds;
    check('arm ' + c.page.replace('RRV8/', '') + ' with "' + c.forbid[0] + '" back in its guide reddens ' + (reds.join(',') || 'nothing'), reds.indexOf('H3') >= 0);
  }
}

// H5. The Transaction Details guide prints its column table at runtime from RRV8.TXN_COLUMNS, keyed like the grid,
// and names each column through its own LABELS map, because the on-screen labels live only in the page's COLUMNS.
// That is two copies of 31 labels, so they are held equal here. (Before UI-259 the guide printed the raw keys:
// 21 of 31 differed from what the grid shows.)
console.log('\nH5 the Transaction Details guide labels its columns the way the grid does');
function pageColumnLabels(html) {
  const block = one(html, /(const COLUMNS = \[[\s\S]*?\n {2}\];)/, 'COLUMNS array in inventory-transactions.html');
  const out = {};
  for (const m of block.matchAll(/\{\s*key:'([^']+)',\s*label:'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}
function guideLabels(doc) {
  const block = one(doc, /(var LABELS = \{[\s\S]*?\};)/, 'LABELS map in inventory-transaction-variance.html');
  const out = {};
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2];
  return out;
}
function labelDiff(pageHtml, doc) {
  const p = pageColumnLabels(pageHtml), g = guideLabels(doc);
  const keys = new Set([...Object.keys(p), ...Object.keys(g)]);
  return [...keys].filter((k) => p[k] !== g[k]).map((k) => k + ': grid ' + JSON.stringify(p[k]) + ' vs guide ' + JSON.stringify(g[k]));
}
const TXN_PAGE = read('RRV8/inventory-transactions.html');
const TXN_DOC = read('RRUniversity/inventory-transaction-variance.html');
const nCols = Object.keys(pageColumnLabels(TXN_PAGE)).length;
if (nCols < 25) { console.log('HARNESS BROKEN: read only ' + nCols + ' columns out of the page'); process.exit(1); }
const d5 = labelDiff(TXN_PAGE, TXN_DOC);
check('H5 all ' + nCols + ' column labels agree', d5.length === 0, d5.join('; '));
if (d5.length === 0) {
  const armed = TXN_PAGE.replace("label:'Owner'", "label:'Assigned to'");
  if (armed === TXN_PAGE) { console.log('HARNESS BROKEN: H5 arm changed nothing'); process.exit(1); }
  check('arm: the grid renames Owner and H5 notices', labelDiff(armed, TXN_DOC).length === 1);
}

console.log('\nRESULT: ' + (failures === 0 ? 'all passed' : failures + ' failed'));
process.exit(failures === 0 ? 0 : 1);
