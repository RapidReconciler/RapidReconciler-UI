/* test-uni-search-questions.js -- UI-234: the RR University search answers a typed question.
 *
 *   node Tools/test-uni-search-questions.js        (any Node; CI installs nothing and needs no network)
 *
 * WHY. With the AI plan off, V8's RR University pill searched "What can you tell me about dmaai's" and
 * returned six sections about nothing ("Part 2 Tell University you have a problem", "The scope band"...),
 * while "dmaai" alone returned the DMAAI guides. Measured on the real index with the real lunr 2.3.9:
 *   - "about" is a Lunr stopword, never indexed, so the strict tier's `+about` could never match;
 *   - "tell" was required too, and the page kept the apostrophe in "dmaai's";
 *   - the last tier sent only `dmaais*`, and Lunr does not stem a wildcard term, so `tell*` won.
 *
 * WHAT IT RUNS. The real lunr 2.3.9 (Tools/vendor, the version both pages load from unpkg), the real
 * RRUniversity/search-index.json, and the SHIPPED code of both searches:
 *   PILL  Tools/home-search.js, whole, as V8 Home loads it;
 *   PAGE  RRUniversity/rapidreconciler-university.html: its lunrSearchFlexible block and its index
 *         builder, sliced out of the page between anchors asserted to occur once.
 *
 *   Q1  the question returns only DMAAI sections, and the same top six as "dmaai" alone
 *   Q2  a question whose words do not all co-occur still finds the subject (the last tier stems)
 *   K1-K3  known-good queries keep their top result (controls: the fix must not cost what worked)
 *   P   the pill and the page return the same sections for every query here
 *
 * MUTATION ARMS run at the end, one at a time, each against a copy of the source. Each names the cases
 * that must go red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LUNR = fs.readFileSync(path.join(__dirname, 'vendor', 'lunr-2.3.9.js'), 'utf8');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'RRUniversity', 'search-index.json'), 'utf8'));
const PILL_SRC = fs.readFileSync(path.join(__dirname, 'home-search.js'), 'utf8');
const pageHtml = fs.readFileSync(path.join(ROOT, 'RRUniversity', 'rapidreconciler-university.html'), 'utf8').replace(/\r\n/g, '\n');

function slice(hay, start, end, label) {
  const i = hay.indexOf(start);
  if (i < 0 || hay.indexOf(start, i + 1) >= 0) { console.log('HARNESS BROKEN: ' + label + ' start anchor not found exactly once'); process.exit(1); }
  const j = hay.indexOf(end, i);
  if (j < 0) { console.log('HARNESS BROKEN: ' + label + ' end anchor not found'); process.exit(1); }
  return hay.slice(i, j + end.length);
}
const PAGE_MATCH_SRC = slice(pageHtml, '  const UNI_STOPWORDS = new Set([', '\n    return [];\n  }\n', 'page matcher');
const PAGE_INDEX_SRC = slice(pageHtml, '      lunrIdx = lunr(function () {', '\n      });\n', 'page index builder');
const byId = {}; INDEX.forEach(r => { byId[r.id] = r; });

function lunrSandbox() {
  const sb = { console, Promise, Set, Map, JSON, Error };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(LUNR + '\nwindow.lunr = lunr;', sb);
  return sb;
}
function pageSearch(matchSrc) {
  const sb = lunrSandbox();
  sb.records = INDEX;
  vm.runInContext('var lunrIdx; (function () { var records = globalThis.records;\n' + PAGE_INDEX_SRC + '\n globalThis.lunrIdx = lunrIdx; })();', sb);
  vm.runInContext(matchSrc + '\nglobalThis.__page = lunrSearchFlexible;', sb);
  return (q) => sb.__page(q).slice(0, 6).map(h => byId[h.ref].url);
}
function pillSearch(src) {
  const sb = lunrSandbox();
  sb.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) });
  sb.document = { createElement: () => ({}), head: { appendChild() {} } };
  vm.runInContext(src, sb);
  return (q) => sb.HomeSearch.university(q, { limit: 6 }).then(r => r.map(x => x.href.replace('../RRUniversity/', '')));
}

const QUESTION = "What can you tell me about dmaai's";
const QUERIES = [QUESTION, 'dmaai', 'tell me about dmaais and zebras', 'how do I reconcile inventory',
  'what is a cardex variance', 'Can you explain weighted average cost?'];
const mentions = (url, word) => { const r = INDEX.find(x => x.url === url); return !!r && (r.page_title + ' ' + r.section_title + ' ' + r.body).toLowerCase().includes(word); };
const titleOf = (url) => { const r = INDEX.find(x => x.url === url); return r ? r.section_title : null; };

let reds = [];
function check(name, ok, detail) {
  if (!ok) reds.push(name.split(' ')[0]);
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   ' + (detail || '')));
}

async function suite(pillSrc, matchSrc, label) {
  reds = [];
  console.log('\n' + label);
  const pill = pillSearch(pillSrc), page = pageSearch(matchSrc);
  const P = {}, G = {};
  for (const q of QUERIES) { P[q] = await pill(q); G[q] = page(q); }
  for (const [side, R] of [['pill', P], ['page', G]]) {
    check('Q1 ' + side + ': the question returns only DMAAI sections', R[QUESTION].length > 0 && R[QUESTION].every(u => mentions(u, 'dmaai')), JSON.stringify(R[QUESTION].map(titleOf)));
    check('Q1 ' + side + ': and the same top six as "dmaai" alone', JSON.stringify(R[QUESTION]) === JSON.stringify(R.dmaai), JSON.stringify(R[QUESTION].map(titleOf)));
    check('Q2 ' + side + ': words that never co-occur still find the subject', R['tell me about dmaais and zebras'].length > 0 && mentions(R['tell me about dmaais and zebras'][0], 'dmaai'), JSON.stringify(R['tell me about dmaais and zebras'].map(titleOf)));
    check('K1 ' + side + ': reconcile inventory -> the walkthrough', titleOf(R['how do I reconcile inventory'][0]) === 'Inventory Reconciliation Walkthrough', titleOf(R['how do I reconcile inventory'][0]));
    check('K2 ' + side + ': cardex variance -> Handling Cardex Variance', titleOf(R['what is a cardex variance'][0]) === 'Handling Cardex Variance', titleOf(R['what is a cardex variance'][0]));
    check('K3 ' + side + ': weighted average cost -> Method 02', /Weighted Average Cost \(Method 02\)/.test(titleOf(R['Can you explain weighted average cost?'][0]) || ''), titleOf(R['Can you explain weighted average cost?'][0]));
  }
  for (const q of QUERIES) check('P  pill = page for "' + q + '"', JSON.stringify(P[q]) === JSON.stringify(G[q]), 'pill ' + JSON.stringify(P[q].map(titleOf)) + ' page ' + JSON.stringify(G[q].map(titleOf)));
  return [...new Set(reds)];
}

(async () => {
  const shipped = await suite(PILL_SRC, PAGE_MATCH_SRC, 'shipped source');
  const arms = [
    ['pill keeps the question words', () => [PILL_SRC.replace("'about','tell','explain'", "'zzz1','zzz2','explain'"), PAGE_MATCH_SRC], ['Q1', 'P']],
    // The page's tokenizer before UI-234: whitespace split, operators stripped, apostrophe KEPT ("dmaai's").
    // (Dropping only the apostrophe strip is not a defect any more: the split on non-letters already
    // turns "dmaai's" into "dmaai" + a one-letter "s" that is discarded. An arm for it caught nothing.)
    ['page tokenizes the old way', () => [PILL_SRC, PAGE_MATCH_SRC.replace(
      "const clean = rawQuery.toLowerCase().replace(/['‘’]/g, '').split(/[^a-z0-9]+/).filter(t => t.length > 1);",
      "const clean = rawQuery.trim().split(/\\s+/).map(t => t.replace(/[*+~^:\\-?!,.;]/g, '').toLowerCase()).filter(Boolean);")], ['Q1', 'P']],
    ['page last tier sends only the wildcard', () => [PILL_SRC, PAGE_MATCH_SRC.replace("t + (t.length >= 4 ? ' ' + t + '*' : '')", "t + (t.length >= 4 ? '*' : '')")], ['Q2', 'P']],
    ['pill index loses the page boosts', () => [PILL_SRC.replace("this.field('section_title', { boost: 10 }); this.field('page_title', { boost: 6 });", "this.field('page_title'); this.field('section_title');"), PAGE_MATCH_SRC], ['P']]
  ];
  let armFails = 0;
  for (const [name, make, expect] of arms) {
    const [p, m] = make();
    if (p === PILL_SRC && m === PAGE_MATCH_SRC) { console.log('HARNESS BROKEN: arm "' + name + '" changed nothing'); process.exit(1); }
    const got = await suite(p, m, 'mutation arm: ' + name);
    const ok = expect.every(e => got.includes(e));
    if (!ok) armFails++;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  arm reddened ' + JSON.stringify(got) + ', needed at least ' + JSON.stringify(expect));
  }
  const pass = shipped.length === 0 && armFails === 0;
  console.log('\nRESULT: ' + (pass ? 'all assertions pass and every mutation arm is caught' : shipped.length + ' red on the shipped source, ' + armFails + ' arm(s) missed'));
  process.exit(pass ? 0 : 1);
})();
