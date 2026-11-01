/* test-ai-plan-cap.js -- VLC-186 (owner ruling B1, 2026-10-21): V8's AI tier is capped at
 * the client's PURCHASED plan, and every explain call declares it.
 *
 *   node Tools/test-ai-plan-cap.js
 *
 * Before this, RRAI.get() was this browser's choice alone (localStorage.rrv8.aiTier,
 * default 'full'). A plan-Off client got answers, and a plan-Enhanced client's figures
 * went out unmasked, because every page masks from RRAI.get() before VALC sees the
 * prompt. And no call declared a level, so VALC's cap never ran.
 *
 * Runs the SHIPPED code: RRAI sliced out of RRV8/config.js, aiExplain + aiHealth sliced
 * out of RRV8/home.html, RRV8.aiRefusal sliced out of config.js.
 *
 *   C1  no plan known yet: get() is the browser's choice (VALC is the backstop)
 *   C2  plan below the choice: get() is the plan (Enhanced -> scrubbed, Off -> off)
 *   C3  choice below the plan: the choice wins (a user may always ask for LESS)
 *   C4  the plan is per database, in sessionStorage, and 'docs' reads as 'grounded'
 *   C5  setPlan re-runs open surfaces only when it changes the tier
 *   C6  primePlan asks ai/health for the active database with the Bearer token
 *   A1  aiExplain declares the level it masked with
 *   A2  an Off PLAN is its own reason with its own sentence, and nothing is sent
 *   A3  the user's own Off choice is unchanged (tier-off)
 *   A4  VALC's 403 sentence is shown as written
 *   A5  aiHealth's plan read feeds the cap
 *
 * TWO MUTATION CONTROLS, each must turn a named check red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8');

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

const F_START = '  window.RRV8.aiRefusal = function (err) {';
once(config, F_START, 'aiRefusal');
const F_SRC = config.slice(config.indexOf(F_START), config.indexOf('\n  };', config.indexOf(F_START)) + 5);

const H_START = '  var _aiHealthCache = {};';
const H_END = '\n  function loadAiPlan() {';
once(html, H_START, 'aiHealth start'); once(html, H_END, 'aiHealth end');
const HOME_SRC = html.slice(html.indexOf(H_START), html.indexOf(H_END, html.indexOf(H_START)));

function store(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m };
}

// The RRAI sandbox. opts: { choice, plans (db->level), db, health }
function rrai(opts, src) {
  const events = [], fetches = [];
  const local = store(Object.assign({ 'rrv8.token': 'tok' }, opts.choice ? { 'rrv8.aiTier': opts.choice } : {}));
  const session = store(opts.plans ? { 'rrv8.aiPlan': JSON.stringify(opts.plans) } : {});
  const win = {
    RRDB: {
      name: () => opts.db || 'RapidReconciler_Prod_V8',
      valcFetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.health || { maxLevel: 'scrubbed' }) }); }
    },
    dispatchEvent: (e) => events.push(e.detail)
  };
  const sb = { window: win, localStorage: local, sessionStorage: session, CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; },
               encodeURIComponent, JSON, Promise, console };
  win.window = win;
  vm.createContext(sb);
  vm.runInContext(src || RRAI_SRC, sb);
  return { R: win.RRAI, events, fetches, session, local };
}

async function rraiSuite(src, label) {
  console.log(label);
  check('C1 no plan known: the choice', rrai({ choice: 'full' }, src).R.get(), 'full');
  check('C1 no choice and no plan: full', rrai({}, src).R.get(), 'full');
  check('C2 Enhanced plan caps a Full choice', rrai({ choice: 'full', plans: { RapidReconciler_Prod_V8: 'scrubbed' } }, src).R.get(), 'scrubbed');
  check('C2 Off plan caps every choice', rrai({ plans: { RapidReconciler_Prod_V8: 'off' } }, src).R.get(), 'off');
  check('C3 a Basic choice under a Full plan stays Basic', rrai({ choice: 'grounded', plans: { RapidReconciler_Prod_V8: 'full' } }, src).R.get(), 'grounded');
  const per = rrai({ choice: 'full', db: 'Other_V8', plans: { RapidReconciler_Prod_V8: 'off' } }, src);
  check('C4 another database\'s plan does not cap this one', per.R.get(), 'full');
  per.R.setPlan('Other_V8', 'docs');
  check('C4 the server\'s \'docs\' reads as Basic', per.R.get(), 'grounded');
  check('C4 the plan is kept in sessionStorage, not localStorage',
        [!!per.session._m['rrv8.aiPlan'], 'rrv8.aiPlan' in per.local._m], [true, false]);
  const ev = rrai({ choice: 'full' }, src);
  ev.R.setPlan('RapidReconciler_Prod_V8', 'full');
  check('C5 a plan that changes nothing re-runs nothing', ev.events.length, 0);
  ev.R.setPlan('RapidReconciler_Prod_V8', 'scrubbed');
  check('C5 a plan that lowers the tier re-runs open surfaces', ev.events.map((d) => d.tier), ['scrubbed']);
  const pr = rrai({ choice: 'full', db: 'RapidReconciler_Prod_V8', health: { maxLevel: 'off' } }, src);
  const got = await pr.R.primePlan();
  check('C6 primePlan asks ai/health for the active database',
        pr.fetches.map((f) => f.url), ['api/v1/ai/health?db=RapidReconciler_Prod_V8']);
  check('C6 with the Bearer token', pr.fetches[0] && pr.fetches[0].init.headers.Authorization, 'Bearer tok');
  check('C6 and the answer caps the tier', [got, pr.R.get()], ['off', 'off']);
  await pr.R.primePlan();
  check('C6 once per page', pr.fetches.length, 1);
}

// The aiExplain sandbox. opts: { tier, plan, health, reject }
function home(opts) {
  const calls = [], plansSet = [];
  // VLC-234: aiExplain needs a feature now, so RRAI carries the feature list, declare() and featureOff(). These
  // tests are about the PLAN, so no feature is Off; test-ai-feature-levels.js covers the features themselves.
  const win = { RRV8: {}, RRAI: { plan: () => opts.plan || null, setPlan: (db, l) => plansSet.push([db, l]),
    FEATURES: ['summaries', 'explain', 'ask', 'drafting', 'admin'],
    declare: (f) => ({ feature: f, database: '11111111-1111-1111-1111-111111111111', level: opts.tier || 'full' }),
    featureOff: () => false } };
  const sb = {
    window: win, console, Promise,
    activeDb: () => ({ n: 'RapidReconciler_Prod_V8' }),
    _recsummaryLevel: () => opts.tier || 'full',
    rrFetch: (url, o) => {
      calls.push({ url, o });
      if (String(url).indexOf('ai/health') >= 0) return Promise.resolve(opts.health || { configured: true, maxLevel: 'full' });
      return opts.reject ? Promise.reject(opts.reject) : Promise.resolve({ text: 'a reading' });
    }
  };
  sb.RRAI = win.RRAI;   // in a page, window.RRAI is the global RRAI the code reads bare
  vm.createContext(sb);
  vm.runInContext(F_SRC, sb);
  sb.RRV8 = win.RRV8;
  vm.runInContext(HOME_SRC + '\nglobalThis.__x = aiExplain;', sb);
  return { x: (p, o) => sb.__x(p, Object.assign({ feature: 'ask' }, o || {})), calls, plansSet };
}

async function homeSuite() {
  console.log('\naiExplain (home.html)');
  let h = home({ tier: 'scrubbed' });
  await h.x('a masked prompt');
  const post = h.calls.filter((c) => String(c.url).indexOf('explain') >= 0)[0];
  check('A1 the POST declares the tier it was masked with', post && post.o.body.level, 'scrubbed');
  h = home({ tier: 'off', plan: 'off' });
  let r = await h.x('p');
  check('A2 an Off plan is its own reason', r.reason, 'not-in-plan');
  check('A2 its sentence names the plan and who to ask', /not part of this RapidReconciler plan/.test(r.why) && /rrsupport@getgsi\.com/.test(r.why), true);
  check('A2 nothing is sent', h.calls.length, 0);
  r = await home({ tier: 'off', plan: 'full' }).x('p');
  check('A3 the user\'s own Off choice is still tier-off', r.reason, 'tier-off');
  const refused = new Error('x'); refused.status = 403;
  refused.serverMessage = 'This question was built for a higher AI level than this plan (Enhanced) includes, so nothing was sent. Refresh the page and ask again.';
  r = await home({ tier: 'full', reject: refused }).x('p');
  check('A4 VALC\'s refusal sentence is shown as written', r.why, refused.serverMessage);
  h = home({ tier: 'full', health: { configured: true, maxLevel: 'scrubbed' } });
  await h.x('p');
  check('A5 the plan read feeds the cap', h.plansSet, [['RapidReconciler_Prod_V8', 'scrubbed']]);
}

// K1/K2: the Accountant/Analyst assistant card's own off-state painter. Measured live
// 2026-10-22: on an Off plan it said "Switched off. Turn AI on for reconciliation help."
const K_START = '  function _setAiAsstTier() {';
const K_END = '\n  function renderAcctTriage(d) {';
once(html, K_START, 'card start'); once(html, K_END, 'card end');
const CARD_SRC = html.slice(html.indexOf(K_START), html.indexOf(K_END));
const NOT_IN_PLAN = (html.match(/var AI_NOT_IN_PLAN = ('[^']*');/) || [])[1];
if (!NOT_IN_PLAN) { console.log('HARNESS BROKEN: AI_NOT_IN_PLAN not found in home.html'); process.exit(1); }
function card(tier, plan) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { textContent: '', setAttribute() {}, id });
  const sb = { window: { RRAI: { plan: () => plan } }, $: el, _recsummaryLevel: () => tier, _viewRole: () => 'accountant',
               _acctHasClearable: () => true };
  sb.RRAI = sb.window.RRAI;
  vm.createContext(sb);
  vm.runInContext('var AI_NOT_IN_PLAN = ' + NOT_IN_PLAN + ';\n' + CARD_SRC + '\n_setAiAsstTier();', sb);
  return el('acctAiGreeting').textContent;
}
function cardSuite() {
  console.log('\nassistant card (home.html)');
  check('K1 an Off plan: the card names the plan and who to ask, not a switch',
        [/not part of this RapidReconciler plan/.test(card('off', 'off')), /Turn AI on/.test(card('off', 'off'))], [true, false]);
  check('K2 the user\'s own Off choice keeps its own sentence', card('off', 'full'), 'Switched off. Turn AI on for reconciliation help.');
}

(async () => {
  await rraiSuite(RRAI_SRC, 'RRAI (config.js)');
  await homeSuite();
  cardSuite();
  const real = failures;

  // MUTATION CONTROLS: each must redden what it names, or the checks above prove nothing.
  console.log('\nmutation controls');
  const controls = [
    ['C2', 'the cap ignored (get() is the choice again)', RRAI_SRC.replace('    var t = cap(choice(), plan());', '    var t = choice();')],
    ['C4', 'the plan kept in localStorage', RRAI_SRC.split('sessionStorage').join('localStorage')]
  ];
  let controlsOk = true;
  for (const [want, what, src] of controls) {
    if (src === RRAI_SRC) { console.log('  HARNESS BROKEN: the mutation for ' + what + ' changed nothing'); process.exit(1); }
    failures = 0; reds = [];
    const log = console.log; console.log = () => {};
    await rraiSuite(src, '');
    console.log = log;
    const ok = reds.indexOf(want) >= 0;
    controlsOk = controlsOk && ok;
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  control: ' + what + ' reddens ' + want + (ok ? '' : ' (reddened: ' + reds.join(',') + ')'));
  }
  console.log('\nRESULT: ' + (real === 0 && controlsOk ? 'all assertions and both mutation controls pass' : real + ' assertion(s) failed'));
  process.exit(real === 0 && controlsOk ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
