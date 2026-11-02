/* test-ai-samples.js -- UI-255 piece 2 (owner ruling 2026-11-01, option (a) "Samples from use").
 *
 *   node Tools/test-ai-samples.js
 *
 * The AI Assistant page's "What's sent?" showed hand-written prose. Now, when a feature's real prompt builder runs, its
 * page also runs that builder at Basic, Enhanced and Full and keeps the three texts in sessionStorage for that
 * database; the AI Assistant page shows them. Nothing kept is ever sent.
 *
 * Runs the SHIPPED code: RRAI and the fetch observer from RRV8/config.js; _oeAiPrompt and _adminAskPrompt from
 * RRV8/home.html; _cxPrompt from inventory-cardex-variance.html; asofKeepSample + asofEffTier + asofScopeText from
 * inventory-asof.html; previewText/previewBody from admin-claude-assistant.html.
 *
 *   K1  keepSample stores the builder's text at grounded, scrubbed and full, and nothing is posted
 *   K2  samples are keyed by the database uuid: another database with the SAME NAME sees none
 *   K3  a level whose build throws is left out; an unknown feature or no uuid stores nothing
 *   B1  offset entry: Basic and Enhanced say "Entity A", Full names the company
 *   B2  cardex Investigate: the same, for company and item
 *   B3  administrator ask: Basic counts inactive people, Enhanced names their role, Full names them
 *   B4  As Of: the sample override masks at Basic/Enhanced, names at Full, and is cleared even when a build throws
 *   A1  the AI Assistant page shows the kept text, escaped, and says it was not sent
 *   A2  a Full sample under a lower plan says nothing is ever sent at Full
 *   A3  with no sample, it names the page to open
 *
 * FOUR MUTATION CONTROLS, each must turn a named check red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, 'RRV8', p), 'utf8').replace(/\r\n/g, '\n');
const config = read('config.js'), home = read('home.html'), cardex = read('inventory-cardex-variance.html');
const asof = read('inventory-asof.html'), admin = read('admin-claude-assistant.html');
const UUID = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const DB = 'RapidReconciler_Prod_V8';

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
function slice(src, start, end, what) {
  const a = src.split(start).length - 1;
  if (a !== 1) { console.log('HARNESS BROKEN: ' + what + ' start appears ' + a + ' times'); process.exit(1); }
  const i = src.indexOf(start), j = src.indexOf(end, i + start.length);
  if (j < 0) { console.log('HARNESS BROKEN: ' + what + ' end not found'); process.exit(1); }
  return src.slice(i, j);
}

const RRAI_SRC = slice(config, 'window.RRAI = (function () {', "    label: function (t) { return LABELS[norm(t) || 'full']; }\n  };\n})();", 'RRAI')
  + "    label: function (t) { return LABELS[norm(t) || 'full']; }\n  };\n})();";
const OBS_SRC = slice(config, '// UI-255: the ONE place every AI call passes.', '\n})();', 'observer') + '\n})();';
const OE_SRC = slice(home, '  function _oeAiPrompt(e, tier) {', '\n  function _oeAiSummary(e) {', '_oeAiPrompt');
const ADM_SRC = slice(home, '  function _adminAskPrompt(q, tier) {', '\n  function _adminAskSend(', '_adminAskPrompt');
const CX_SRC = slice(cardex, '  function _cxPrompt(a, tier){', '\n  function _cxInvestigateSend(', '_cxPrompt');
const ASOF_SRC = slice(asof, '  let _asofSampleTier = null;', '\n  function asofAggregates() {', 'asofEffTier')
  + '\n' + slice(asof, '  function asofScrub() {', '\n  function asofAiSync() {', 'asofScopeText');
const PV_SRC = slice(admin, '  // The level buttons compare the samples;', '\n  // Where a save\'s outcome is shown', 'previewText');

// One browser tab: real RRAI + observer, sessionStorage shared by every page slice run in it.
function tab(opts) {
  opts = opts || {};
  const posted = [], m = {};
  const session = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  const win = {
    fetch: (u, i) => { posted.push({ u, i }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
    RRDB: { name: () => DB, uuid: () => (opts.uuid === undefined ? UUID : opts.uuid) }, dispatchEvent: () => {}
  };
  win.RRV8 = {};
  const sb = { window: win, sessionStorage: session, localStorage: session, JSON, Promise, console, Date, Map,
               document: { getElementById: () => null }, CustomEvent: function () {} };
  win.window = win;
  vm.createContext(sb);
  vm.runInContext((opts.rrai || RRAI_SRC) + '\n' + OBS_SRC, sb);
  sb.RRAI = win.RRAI; sb.RRV8 = win.RRV8;
  return { sb, R: win.RRAI, posted, setUuid: (u) => { opts.uuid = u; } };
}

const ENTRY = { co: '90001', ccy: 'USD', net: 4100, comp: { cf: 1000, tx: 3000, je: 100 }, pairs: [1, 2], cfExcluded: 0 };
const ITEM = { co: '90001', item: 'WIDGET-9', shape: 'qty only', method: '07', level: '2', qty: 3, amt: 12.5, qoh: 10, unitCost: 4.17, rows: [1] };

function suite(v) {
  // K1
  let t = tab({ rrai: v.rrai });
  vm.runInContext(OE_SRC + '\nfunction _jeAmt(n){ return "$" + n; }\nglobalThis.__oe = _oeAiPrompt;', t.sb);
  const kept = t.R.keepSample('drafting', 'Home', (l) => t.sb.__oe(ENTRY, l));
  check('K1 three levels kept', Object.keys((kept && kept.levels) || {}), ['grounded', 'scrubbed', 'full']);
  check('K1 each is the builder\'s own text at that level', kept && kept.levels.full, t.sb.__oe(ENTRY, 'full'));
  check('K1 nothing was posted', t.posted.length, 0);
  check('K1 read back for this database', !!(t.R.samples(UUID).drafting), true);

  // K2
  check('K2 another database with the same name sees no sample', JSON.stringify(t.R.samples(OTHER)), '{}');
  t.setUuid(OTHER);
  check('K2 nor does it when it becomes the active one', JSON.stringify(t.R.samples()), '{}');

  // K3
  t = tab({ rrai: v.rrai });
  const part = t.R.keepSample('ask', 'As Of', (l) => { if (l === 'scrubbed') throw new Error('x'); return 'at ' + l; });
  check('K3 a level that throws is left out, the rest kept', Object.keys((part && part.levels) || {}), ['grounded', 'full']);
  check('K3 an unknown feature stores nothing', t.R.keepSample('recsummary', 'x', () => 'p'), null);
  const nou = tab({ rrai: v.rrai, uuid: '' });
  check('K3 no database uuid stores nothing', nou.R.keepSample('ask', 'x', () => 'p'), null);

  // B1 offset entry
  t = tab({ rrai: v.rrai });
  vm.runInContext(OE_SRC + '\nfunction _jeAmt(n){ return "$" + n; }\nglobalThis.__oe = _oeAiPrompt;', t.sb);
  let s = t.R.keepSample('drafting', 'Home', (l) => t.sb.__oe(ENTRY, l));
  check('B1 Basic and Enhanced say Entity A, never the company',
        ['grounded', 'scrubbed'].map((l) => /Entity A/.test(s.levels[l]) && !/90001/.test(s.levels[l])), [true, true]);
  check('B1 Full names the company', /Co 90001/.test(s.levels.full) && !/Entity A/.test(s.levels.full), true);

  // B2 cardex
  t = tab({ rrai: v.rrai });
  vm.runInContext(CX_SRC + '\nfunction qty(n){ return String(n); }\nfunction curMoney(n){ return "$" + n; }\nglobalThis.__cx = _cxPrompt;', t.sb);
  s = t.R.keepSample('explain', 'Cardex', (l) => t.sb.__cx(ITEM, l));
  check('B2 Enhanced masks company and item',
        /Entity A/.test(s.levels.scrubbed) && /the item/.test(s.levels.scrubbed) && !/WIDGET-9|90001/.test(s.levels.scrubbed), true);
  check('B2 Full names both', /Co 90001/.test(s.levels.full) && /item WIDGET-9/.test(s.levels.full), true);

  // B3 administrator ask
  t = tab({ rrai: v.rrai });
  vm.runInContext('var _teamInactive30 = [{ name: "Pat Example", role: "Analyst", days: 40, date: "2026-09-01" }];\n'
    + 'function _adminBriefTasks(){ return []; }\nfunction _aiDocCatalogPrompt(){ return ""; }\n'
    + ADM_SRC + '\nglobalThis.__ad = _adminAskPrompt;', t.sb);
  s = t.R.keepSample('admin', 'admin Home', (l) => t.sb.__ad('Who is inactive?', l));
  check('B3 Basic counts, Enhanced gives the role, Full names the person',
        [/1 team member inactive/.test(s.levels.grounded) && !/Pat/.test(s.levels.grounded),
         /a Analyst account/.test(s.levels.scrubbed) && !/Pat/.test(s.levels.scrubbed),
         /Pat Example/.test(s.levels.full)], [true, true, true]);

  // B4 As Of
  t = tab({ rrai: v.rrai });
  t.sb.window.RRV8.readSessionScope = () => ({ activeCompanies: ['90001'] });
  // The live level is Basic, so Full can only name the company through the override, and a stuck override shows.
  t.sb.window.RRAI.get = () => 'grounded';
  vm.runInContext('var _data = { _meta: { period: "" } };\nfunction formatPeriod(p){ return p; }\n'
    + (v.asof || ASOF_SRC) + '\nglobalThis.__ks = asofKeepSample; globalThis.__st = asofScopeText; globalThis.__et = asofEffTier;', t.sb);
  t.sb.__ks(() => t.sb.__st());
  s = t.R.samples().ask;
  check('B4 As Of masks at Basic and Enhanced, names at Full',
        s && [s.levels.grounded, s.levels.scrubbed, s.levels.full], ['Entity A', 'Entity A', 'Co 90001']);
  t.sb.__ks(() => { throw new Error('a build that fails'); });
  check('B4 after sampling, even a failed build, the live level is back', t.sb.__et('ask'), 'docs');

  // A1-A3 the AI Assistant page
  t = tab({ rrai: v.rrai });
  vm.runInContext(OE_SRC + '\nfunction _jeAmt(n){ return "$" + n; }\nglobalThis.__oe = _oeAiPrompt;', t.sb);
  t.R.keepSample('drafting', t.R.SAMPLE_PAGES.drafting, (l) => t.sb.__oe(Object.assign({}, ENTRY, { co: '90001<b>' }), l));
  const page = (maxLevel) => {
    vm.runInContext(
      'var LEVEL_LABEL = { off:"Off", docs:"Basic", scrubbed:"Enhanced", full:"Full" };\n'
      + 'function esc(s){ return String(s == null ? "" : s).replace(/[&<>"\']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]; }); }\n'
      + 'function activeDb(){ return { n: "' + DB + '", uuid: "' + UUID + '" }; }\n'
      + 'function rankLvl(l){ return ({ off:0, docs:1, scrubbed:2, full:3 })[l] || 0; }\n'
      + 'var _maxLevel = "' + maxLevel + '";\n' + (v.pv || PV_SRC) + '\nglobalThis.__pv = previewText;', t.sb);
    return t.sb.__pv;
  };
  let pv = page('full');
  const enh = pv({ key: 'drafting' }, 'scrubbed');
  check('A1 the kept Enhanced text is shown', enh.indexOf('Entity A (USD)') >= 0, true);
  const full = pv({ key: 'drafting' }, 'full');
  check('A1 a sample\'s data is escaped', full.indexOf('Co 90001&lt;b&gt;') >= 0 && full.indexOf('90001<b>') < 0, true);
  check('A1 it says the example was not sent', /was not sent/.test(enh), true);
  check('A2 on a Full plan, no "never sent at Full" line', /nothing is ever sent at this level/.test(full), false);
  pv = page('docs');
  check('A2 on a Basic plan the Full sample says nothing is ever sent at Full',
        /nothing is ever sent at this level/.test(pv({ key: 'drafting' }, 'full')), true);
  check('A3 no sample names the page to open',
        /Open Cardex Variance \(Investigate\) on this database to see a real example\./.test(pv({ key: 'explain' }, 'scrubbed')), true);
  check('A3 Off still says nothing is sent', /Nothing is sent/.test(pv({ key: 'explain' }, 'off')), true);
}

console.log('UI-255 piece 2: samples from use');
suite({});
const real = failures;

console.log('\nmutation controls');
const controls = [
  ['B1', 'keepSample builds every level at Full', { rrai: RRAI_SRC.replace('var t = build(l);', "var t = build('full');") }],
  ['K2', 'samples keyed by the database NAME', { rrai: RRAI_SRC.replace(
    "try { return (window.RRDB && window.RRDB.uuid && window.RRDB.uuid()) || ''; } catch (_) { return ''; }",
    "try { return (window.RRDB && window.RRDB.name && window.RRDB.name()) || ''; } catch (_) { return ''; }") }],
  ['B4', 'the As Of override is not cleared after a failed build', { asof: ASOF_SRC.replace(
    'try { return build(); } finally { _asofSampleTier = null; }', 'var r = build(); _asofSampleTier = null; return r;') }],
  ['A2', 'the page drops the "never sent at Full" line', { pv: PV_SRC.replace(
    "if (key === 'full' && rankLvl(_maxLevel) < rankLvl('full')) {", 'if (false) {') }]
];
let controlsOk = true;
for (const [want, what, v] of controls) {
  const k = Object.keys(v)[0], base = { rrai: RRAI_SRC, asof: ASOF_SRC, pv: PV_SRC }[k];
  if (v[k] === base) { console.log('  HARNESS BROKEN: the mutation for ' + what + ' changed nothing'); process.exit(1); }
  failures = 0; reds = [];
  const log = console.log; console.log = () => {};
  try { suite(v); } catch (e) { reds.push(want + '?threw'); } finally { console.log = log; }
  const hit = reds.indexOf(want) >= 0;
  if (!hit) controlsOk = false;
  console.log('  ' + (hit ? 'ok  ' : 'FAIL') + '  ' + what + ' -> ' + want + ' red' + (hit ? '' : ' (reds: ' + reds.join(',') + ')'));
}
console.log(real === 0 && controlsOk ? '\nALL PASS' : '\nFAILED: ' + real + ' check(s)' + (controlsOk ? '' : ', a mutation control did not bite'));
process.exit(real === 0 && controlsOk ? 0 : 1);
