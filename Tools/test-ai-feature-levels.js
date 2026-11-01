/* test-ai-feature-levels.js -- VLC-234 (owner ruling 2026-10-31, "Build the control").
 *
 *   node Tools/test-ai-feature-levels.js
 *
 * The AI Assistant page let a customer's administrator pick a level per AI feature, and three customer documents
 * promise that nothing is sent until an administrator turns a feature on. The choice was saved in the
 * administrator's browser and NO AI CALL READ IT: home's _recsummaryLevel() returned RRAI.get() first, and RRAI.get()
 * never returns empty, so every feature ran at the plan. The levels now live in VALC per database, ai/health returns
 * them, and every call declares its feature.
 *
 * Runs the SHIPPED code: RRAI sliced out of RRV8/config.js, aiExplain + aiHealth + aiOffWhy sliced out of
 * RRV8/home.html.
 *
 *   F1  get(feature) is the lower of the choice, the plan and that feature's level
 *   F2  a feature whose level is not known yet is not invented: get() falls back to choice+plan (VALC refuses above)
 *   F3  setFeatures keeps the levels per database in sessionStorage, and VALC's 'docs' reads as Basic
 *   F4  setFeatures re-runs open surfaces only when an effective level changed
 *   F5  featureOff is true only for an administrator's Off, never for the plan's Off
 *   F6  declare() names the feature, the active database's uuid, and the level get(feature) gives
 *   F7  primePlan asks ai/health with the database uuid and stores the features it returns
 *   H1  aiExplain with no feature sends nothing and says so
 *   H2  an administrator's Off is its own reason, its sentence names the feature and AI Assistant, nothing is sent
 *   H3  the POST carries the feature, the database uuid and the level of THAT feature
 *   H4  aiHealth passes the uuid and hands the features to RRAI
 *
 * TWO MUTATION CONTROLS, each must turn a named check red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// CRLF-normalised: the mutation anchors span lines, and a Windows checkout (core.autocrlf) writes home.html as CRLF.
const config = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const UUID = '11111111-1111-1111-1111-111111111111';
const DB = 'RapidReconciler_Prod_V8';

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.split(' ')[0]); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}
function once(hay, needle, what) {
  const n = hay.split(needle).length - 1;
  if (n !== 1) { console.log('HARNESS BROKEN: ' + what + ' anchor appears ' + n + ' times, expected 1'); process.exit(1); }
}

const R_START = 'window.RRAI = (function () {';
const R_END = "    label: function (t) { return LABELS[norm(t) || 'full']; }\n  };\n})();";
once(config, R_START, 'RRAI start'); once(config, R_END, 'RRAI end');
const RRAI_SRC = config.slice(config.indexOf(R_START), config.indexOf(R_END) + R_END.length);

const H_START = '  var _aiHealthCache = {};';
const H_END = '\n  function loadAiPlan() {';
once(html, H_START, 'aiHealth start'); once(html, H_END, 'aiHealth end');
const HOME_SRC = html.slice(html.indexOf(H_START), html.indexOf(H_END, html.indexOf(H_START)));

function store(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
}

// RRAI sandbox. opts: { choice, plans, features (db -> {f: level}), health }
function rrai(opts, src) {
  const events = [], fetches = [];
  const local = store(Object.assign({ 'rrv8.token': 'tok' }, opts.choice ? { 'rrv8.aiTier': opts.choice } : {}));
  const sess = {};
  if (opts.plans) sess['rrv8.aiPlan'] = JSON.stringify(opts.plans);
  if (opts.features) sess['rrv8.aiFeatures'] = JSON.stringify(opts.features);
  const session = store(sess);
  const win = {
    RRDB: {
      name: () => DB,
      uuid: () => UUID,
      valcFetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.health || { maxLevel: 'full' }) }); }
    },
    dispatchEvent: (e) => events.push(e.detail)
  };
  const sb = { window: win, localStorage: local, sessionStorage: session, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
               encodeURIComponent, JSON, Promise, console };
  win.window = win;
  vm.createContext(sb);
  vm.runInContext(src || RRAI_SRC, sb);
  return { R: win.RRAI, events, fetches, session };
}

async function rraiSuite(src, label) {
  if (label) console.log(label);
  const full = { [DB]: 'full' };
  check('F1 a feature at Enhanced caps a Full plan', rrai({ plans: full, features: { [DB]: { explain: 'scrubbed' } } }, src).R.get('explain'), 'scrubbed');
  check('F1 a feature at Full under an Enhanced plan is Enhanced', rrai({ plans: { [DB]: 'scrubbed' }, features: { [DB]: { ask: 'full' } } }, src).R.get('ask'), 'scrubbed');
  check('F1 a feature set Off is Off on a Full plan', rrai({ plans: full, features: { [DB]: { summaries: 'off' } } }, src).R.get('summaries'), 'off');
  check('F1 one feature\'s level never caps another', rrai({ plans: full, features: { [DB]: { summaries: 'off', ask: 'full' } } }, src).R.get('ask'), 'full');
  check('F2 a level not loaded yet falls back to the plan', rrai({ plans: { [DB]: 'scrubbed' } }, src).R.get('ask'), 'scrubbed');

  const s = rrai({ plans: full }, src);
  s.R.setFeatures(DB, { explain: { level: 'docs' }, ask: { level: 'full' } });
  check('F3 VALC\'s docs reads as Basic', s.R.get('explain'), 'grounded');
  check('F3 a feature VALC did not list stays unknown, not Off', s.R.featureLevel('drafting'), null);
  check('F3 kept in sessionStorage under rrv8.aiFeatures', JSON.parse(s.session._m['rrv8.aiFeatures'])[DB].ask, 'full');
  const other = rrai({ plans: full, features: { Other_V8: { ask: 'off' } } }, src);
  check('F3 another database\'s levels do not apply here', other.R.get('ask'), 'full');

  const ev = rrai({ plans: full, features: { [DB]: { ask: 'full' } } }, src);
  ev.R.setFeatures(DB, { ask: { level: 'full' } });
  check('F4 levels that change nothing re-run nothing', ev.events.length, 0);
  ev.R.setFeatures(DB, { ask: { level: 'off' } });
  check('F4 a lowered feature re-runs open surfaces', ev.events.length, 1);

  check('F5 an administrator\'s Off is featureOff', rrai({ plans: full, features: { [DB]: { ask: 'off' } } }, src).R.featureOff('ask'), true);
  check('F5 the plan\'s Off is not featureOff', rrai({ plans: { [DB]: 'off' }, features: { [DB]: { ask: 'off' } } }, src).R.featureOff('ask'), false);
  check('F5 a feature that is on is not featureOff', rrai({ plans: full, features: { [DB]: { ask: 'scrubbed' } } }, src).R.featureOff('ask'), false);

  const d = rrai({ plans: full, features: { [DB]: { drafting: 'scrubbed' } } }, src).R.declare('drafting');
  check('F6 declare names the feature, the database uuid and that feature\'s level',
        [d.feature, d.database, d.level], ['drafting', UUID, 'scrubbed']);

  const p = rrai({ choice: 'full', health: { maxLevel: 'full', features: { ask: { level: 'off' }, explain: { level: 'full' } } } }, src);
  await p.R.primePlan();
  check('F7 primePlan asks ai/health with the database name and uuid',
        p.fetches.map((f) => f.url), ['api/v1/ai/health?db=' + DB + '&database=' + UUID]);
  check('F7 and stores the features it returns', [p.R.get('ask'), p.R.get('explain')], ['off', 'full']);
}

// home.html aiExplain sandbox. opts: { levels (feature -> level), off (feature administrator turned Off), health }
function home(opts) {
  const calls = [], featuresSet = [];
  const RRAI = {
    FEATURES: ['summaries', 'explain', 'ask', 'drafting', 'admin'],
    FEATURE_NAMES: { summaries: 'Automatic summaries', explain: 'Explain a finding', ask: 'Ask a question',
                     drafting: 'Entry and report drafting', admin: 'Administrator assistant' },
    plan: () => 'full',
    setPlan: () => {},
    setFeatures: (db, f) => featuresSet.push([db, f]),
    featureOff: (f) => opts.off === f,
    declare: (f) => ({ feature: f, database: UUID, level: (opts.levels || {})[f] || 'full' })
  };
  const sb = {
    window: { RRV8: {}, RRAI }, RRAI, console, Promise,
    activeDb: () => ({ n: DB, uuid: UUID }),
    _recsummaryLevel: (f) => (opts.off === f ? 'off' : ((opts.levels || {})[f] || 'full')),
    rrFetch: (url, o) => {
      calls.push({ url, o });
      if (String(url).indexOf('ai/health') >= 0) return Promise.resolve(opts.health || { configured: true, maxLevel: 'full' });
      return Promise.resolve({ text: 'a reading' });
    }
  };
  vm.createContext(sb);
  vm.runInContext((opts.src || HOME_SRC) + '\nglobalThis.__x = aiExplain; globalThis.__h = aiHealth;', sb);
  return { x: sb.__x, h: sb.__h, calls, featuresSet };
}

async function homeSuite(src, label) {
  if (label) console.log(label);
  let h = home({ src });
  let r = await h.x('p');
  check('H1 no feature: nothing is sent', [r.ok, h.calls.length], [false, 0]);
  check('H1 and the reason says so', /did not say which AI feature/.test(r.why || ''), true);

  h = home({ src, off: 'summaries' });
  r = await h.x('p', { feature: 'summaries' });
  check('H2 an administrator\'s Off is feature-off', r.reason, 'feature-off');
  check('H2 its sentence names the feature and AI Assistant', /Automatic summaries/.test(r.why) && /AI Assistant/.test(r.why), true);
  check('H2 nothing is sent', h.calls.length, 0);

  h = home({ src, levels: { explain: 'scrubbed', ask: 'full' } });
  await h.x('a masked prompt', { feature: 'explain' });
  const post = h.calls.filter((c) => String(c.url).indexOf('explain') >= 0)[0];
  check('H3 the POST carries the feature, the database uuid and THAT feature\'s level',
        post && [post.o.body.feature, post.o.body.database, post.o.body.level, post.o.body.prompt],
        ['explain', UUID, 'scrubbed', 'a masked prompt']);

  h = home({ src, health: { configured: true, maxLevel: 'full', features: { ask: { level: 'off' } } } });
  await h.h();
  const hc = h.calls.filter((c) => String(c.url).indexOf('ai/health') >= 0)[0];
  check('H4 aiHealth sends the uuid', hc && hc.o && hc.o.query && hc.o.query.database, UUID);
  check('H4 and hands the features to RRAI', h.featuresSet.length === 1 && h.featuresSet[0][1].ask.level, 'off');
}

(async () => {
  await rraiSuite(RRAI_SRC, 'RRAI (config.js)');
  await homeSuite(HOME_SRC, '\naiExplain + aiHealth (home.html)');
  const real = failures;

  console.log('\nmutation controls');
  const controls = [
    ['F1', 'get() ignores the feature', 'rrai', RRAI_SRC.replace('    if (feature) t = cap(t, featureLevel(feature));', '')],
    ['H2', 'aiExplain ignores the administrator\'s Off', 'home', HOME_SRC.replace(
      "    if (window.RRAI && RRAI.featureOff && RRAI.featureOff(feature)) {\n      return { reason: 'feature-off', why: aiFeatureOffSentence(feature) };\n    }", '')
      .replace("    if (lvl === 'off') {\n      var off = aiOffWhy(feature);", "    if (false) {\n      var off = aiOffWhy(feature);")]
  ];
  let controlsOk = true;
  for (const [want, what, which, src] of controls) {
    if (src === (which === 'rrai' ? RRAI_SRC : HOME_SRC)) { console.log('  HARNESS BROKEN: the mutation for ' + what + ' changed nothing'); process.exit(1); }
    failures = 0; reds = [];
    const log = console.log; console.log = () => {};
    if (which === 'rrai') await rraiSuite(src, ''); else await homeSuite(src, '');
    console.log = log;
    const ok = reds.indexOf(want) >= 0;
    controlsOk = controlsOk && ok;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: ' + what + ' reddens ' + want + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));
  }
  console.log('\nRESULT: ' + (real === 0 && controlsOk ? 'all assertions and both mutation controls pass' : real + ' assertion(s) failed'));
  process.exit(real === 0 && controlsOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
