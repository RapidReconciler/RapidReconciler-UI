/* test-ai-explain-gate.js -- behaviour test for aiExplain() and aiHealth().
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-ai-explain-gate.js
 *
 * VLC-63 increment 2. Ten sites POSTed to api/v1/ai/explain directly and each had
 * to remember the tier check itself. Measured 2026-09-15: three checked in-function,
 * one was guarded by its caller, six had an unguarded path -- so with AI switched
 * Off, six surfaces still called out.
 *
 * ⛔ THE OWNER'S RULING IS THE THING UNDER TEST: "stay visible and say why it is
 * unavailable." The two off-states are DIFFERENT FACTS and the producer must not
 * merge them. `tier-off` is the user's own choice at the sidebar AI dock and reads
 * as reversible. `not-configured` is GSI-side, the customer cannot act on it, and
 * it has to name the reason -- hiding a feature the customer pays for reads as a
 * missing feature and tells nobody who to ask.
 *
 * ⚠ AND `why` IS A SINK, NOT A LOG LINE. Every unavailable result carries a
 * sentence meant to be RENDERED. G6 asserts it is non-empty and distinct per
 * reason, because a reason with no sentence is a gate whose message goes nowhere.
 *
 *   G1  tier off        -> ok:false, reason 'tier-off', and NO request is made
 *   G2  configured:false-> ok:false, reason 'not-configured', and NO explain POST
 *   G3  available       -> ok:true with the text, and the POST carries the prompt
 *   G4  a health call that FAILS is not reported as "switched off"
 *   G5  aiHealth is fetched ONCE and shared, and is keyed per database
 *   G6  every unavailable reason carries a distinct, non-empty sentence
 *   G7  the optional system prompt and ?ctx= are forwarded only when given
 *
 * FOUR MUTATION CONTROLS, each declaring red AND green.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8');

let failures = 0, reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

const START = '  var _aiHealthCache = {};';
const END   = '\n  function loadAiPlan() {';
function occurrences(h, n) { let c = 0, i = 0; for (;;) { const j = h.indexOf(n, i); if (j < 0) break; c++; i = j + 1; } return c; }
for (const [lab, a] of [['start', START], ['end', END]]) {
  if (occurrences(html, a) !== 1) {
    console.log('HARNESS BROKEN: ' + lab + ' anchor appears ' + occurrences(html, a) + ' times, expected 1');
    process.exit(1);
  }
}
const SOURCE = html.slice(html.indexOf(START), html.indexOf(END, html.indexOf(START)));

// opts: { tier, health, db, rejectHealth }
function mk(opts, source) {
  if (source === undefined) source = SOURCE;
  const calls = [];
  const sandbox = {
    activeDb: function () { return { n: opts.db || 'Demo1' }; },
    _recsummaryLevel: function () { return opts.tier || 'full'; },
    rrFetch: function (url, o) {
      calls.push({ url: url, opts: o });
      if (String(url).indexOf('ai/health') >= 0) {
        return opts.rejectHealth ? Promise.reject(new Error('boom'))
                                 : Promise.resolve(opts.health || { configured: true, maxLevel: 'full' });
      }
      return Promise.resolve({ text: opts.answer === undefined ? 'a reading' : opts.answer });
    },
    Promise: Promise, console: console, window: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.__x = aiExplain; globalThis.__h = aiHealth; globalThis.__r = _aiHealthReset;', sandbox);
  if (typeof sandbox.__x !== 'function') throw new Error('HARNESS BROKEN: aiExplain not defined');
  return { sb: sandbox, calls: calls };
}

async function suite(source, label) {
  failures = 0; reds = [];
  console.log(label + '\n');

  // G1 -- the user's own off switch
  let m = mk({ tier: 'off' }, source);
  let r = await m.sb.__x('p');
  check('G1 tier off -> ok:false', r.ok, false);
  check('G1 reason is tier-off', r.reason, 'tier-off');
  check('G1 NOTHING is requested when the tier is off', m.calls.length, 0);

  // G2 -- the GSI-side switch
  m = mk({ tier: 'full', health: { configured: false, maxLevel: 'full' } }, source);
  r = await m.sb.__x('p');
  check('G2 configured:false -> ok:false', r.ok, false);
  check('G2 reason is not-configured', r.reason, 'not-configured');
  check('G2 health was asked, explain was NOT posted',
        m.calls.filter((c) => String(c.url).indexOf('explain') >= 0).length, 0);

  // G3 -- the happy path
  m = mk({ tier: 'full' }, source);
  r = await m.sb.__x('my prompt');
  check('G3 available -> ok:true', r.ok, true);
  check('G3 the text comes back', r.text, 'a reading');
  const post = m.calls.filter((c) => String(c.url).indexOf('explain') >= 0)[0];
  check('G3 the POST carries the prompt', post && post.opts.body.prompt, 'my prompt');
  check('G3 the POST is a POST', post && post.opts.method, 'POST');

  // G4 -- an unreachable health endpoint is NOT "switched off"
  m = mk({ tier: 'full', rejectHealth: true }, source);
  r = await m.sb.__x('p');
  check('G4 a failed health call does not report not-configured', r.reason !== 'not-configured', true);
  check('G4 it still attempts the explain', r.ok, true);

  // G5 -- one fetch, shared; keyed per database
  m = mk({ tier: 'full' }, source);
  await Promise.all([m.sb.__x('a'), m.sb.__x('b'), m.sb.__x('c')]);
  check('G5 health fetched ONCE for three calls',
        m.calls.filter((c) => String(c.url).indexOf('health') >= 0).length, 1);
  check('G5 three explains still went out',
        m.calls.filter((c) => String(c.url).indexOf('explain') >= 0).length, 3);

  // G6 -- the sink. A reason with no sentence is a gate that reports nowhere.
  const offWhy = (await mk({ tier: 'off' }, source).sb.__x('p')).why;
  const cfgWhy = (await mk({ tier: 'full', health: { configured: false } }, source).sb.__x('p')).why;
  check('G6 tier-off carries a sentence', !!(offWhy && offWhy.length > 20), true);
  check('G6 not-configured carries a sentence', !!(cfgWhy && cfgWhy.length > 20), true);
  check('G6 the two sentences are DIFFERENT', offWhy !== cfgWhy, true);
  check('G6 not-configured names who to ask', /GSI/.test(cfgWhy || ''), true);

  // G7 -- optional bits forwarded only when supplied
  m = mk({ tier: 'full' }, source);
  await m.sb.__x('p', { ctx: 'k1', system: 'sys' });
  const p2 = m.calls.filter((c) => String(c.url).indexOf('explain') >= 0)[0];
  check('G7 ctx reaches the query', /\?ctx=k1$/.test(p2.url), true);
  check('G7 system reaches the body', p2.opts.body.system, 'sys');
  m = mk({ tier: 'full' }, source);
  await m.sb.__x('p');
  const p3 = m.calls.filter((c) => String(c.url).indexOf('explain') >= 0)[0];
  check('G7 no ctx -> no query string', p3.url, 'api/v1/ai/explain');
  check('G7 no system -> the key is absent', p3.opts.body.system === undefined, true);

  return { failures: failures, reds: reds.slice() };
}

// ---------------------------------------------------------------------------
// STRUCTURAL, AND LABELLED AS SUCH. Everything above asserts BEHAVIOUR by running
// the shipped functions. This one cannot: "no call site bypasses the producer" is
// a property of the file, not of a function, and the standing rule is to prefer
// behaviour precisely because a file assertion validates the author's guess about
// how the thing works.
//
// It earns its place anyway. Ten sites were migrated on 2026-09-15 and nothing
// else stops an eleventh being added tomorrow that POSTs directly and quietly
// skips both the tier and the configured-state checks -- the exact condition that
// made this increment necessary. v8-callsites.py catches a dynamic area; it does
// not care whether the area was reached through aiExplain.
function structural() {
  console.log('--- STRUCTURAL: no call site bypasses aiExplain ---\n');
  let bad = 0;
  const direct = html.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /rrFetch\(\s*['"]api\/v1\/ai\/explain['"]/.test(l)
                       && !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const ok = direct.length === 0;
  if (!ok) { bad++; direct.forEach(([n, l]) => console.log('        home.html:' + n + '  ' + l.trim().slice(0, 70))); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') +
              '  S1 zero direct rrFetch to ai/explain outside the producer  (found ' + direct.length + ')');

  // TIGHT CONTROL. A regex that matches nothing because it is WRONG looks
  // identical to one that matches nothing because the code is clean. This proves
  // the instrument can still see the shape it is looking for.
  const probe = "    rrFetch('api/v1/ai/explain', { method: 'POST', body: { prompt: p } });";
  const seesIt = /rrFetch\(\s*['"]api\/v1\/ai\/explain['"]/.test(probe);
  if (!seesIt) bad++;
  console.log('  ' + (seesIt ? 'ok  ' : 'FAIL') +
              '  S1 control: the pattern still matches a known direct call');

  // And the producer itself must be the one place that does it.
  const inProducer = /rrFetch\(_aiExUrl/.test(html);
  if (!inProducer) bad++;
  console.log('  ' + (inProducer ? 'ok  ' : 'FAIL') + '  S2 the producer still makes the call');
  console.log();
  return bad;
}

(async function () {
  const real = await suite(SOURCE, 'aiExplain / aiHealth -- the SHIPPED producers');
  console.log('\n  ' + (real.failures ? real.failures + ' FAILED' : 'all green') + '\n');
  const structuralFailures = structural();

  const mutations = [
    { name: 'H1 drop the tier-off gate (every site calls out with AI switched off)',
      from: "if (lvl === 'off') {", to: 'if (false) {',
      mustRedden: ['G1'], mustStayGreen: ['G2', 'G3', 'G4', 'G5', 'G7'] },
    { name: 'H2 ignore configured:false (the ruling is silently undone)',
      from: 'if (!h.configured) {', to: 'if (false) {',
      mustRedden: ['G2'], mustStayGreen: ['G1', 'G3', 'G4', 'G5', 'G7'] },
    { name: 'H3 report an unreachable health endpoint as switched off',
      from: "return { configured: true, maxLevel: '', known: false };",
      to:   "return { configured: false, maxLevel: '', known: false };",
      mustRedden: ['G4'], mustStayGreen: ['G1', 'G2', 'G3', 'G5', 'G7'] },
    { name: 'H4 defeat the cache (N sites each ask health)',
      from: 'if (_aiHealthCache[dbn]) return _aiHealthCache[dbn];', to: '',
      mustRedden: ['G5'], mustStayGreen: ['G1', 'G2', 'G3', 'G4', 'G7'] },
  ];

  let ctl = 0;
  for (const m of mutations) {
    if (occurrences(SOURCE, m.from) !== 1) {
      console.log('CONTROL BROKEN: ' + m.name + ' -- target appears ' +
                  occurrences(SOURCE, m.from) + ' times, expected 1');
      ctl++; continue;
    }
    const r = await suite(SOURCE.replace(m.from, m.to), '--- MUTATION ' + m.name + ' ---');
    const red = new Set(r.reds);
    const missed = m.mustRedden.filter((c) => !red.has(c));
    const bonus  = m.mustStayGreen.filter((c) => red.has(c));
    if (missed.length) { console.log('\n  CONTROL FAILED -- did NOT go red: ' + missed.join(', ')); ctl++; }
    if (bonus.length)  { console.log('\n  CONTROL FAILED -- went red but should not: ' + bonus.join(', ')); ctl++; }
    if (!missed.length && !bonus.length) console.log('\n  control ok -- reddened exactly ' + m.mustRedden.join(', ') + '\n');
  }

  const bad = real.failures + ctl + structuralFailures;
  console.log(bad ? '\nRESULT: ' + bad + ' problem(s)\n'
                  : '\nRESULT: all assertions and all 4 mutation controls pass\n');
  process.exit(bad ? 1 : 0);
})();
