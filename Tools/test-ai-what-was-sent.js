/* test-ai-what-was-sent.js -- UI-255 (owner ruling 2026-11-01, "What was sent").
 *
 *   node Tools/test-ai-what-was-sent.js
 *
 * Owner question: "Should there be a way for a customer to see the prompt text before submitting to Claude?" Ruled:
 * after the fact, never a gate. Every AI answer carries a collapsed "What was sent" line, and its text is the very
 * string handed to fetch() for POST api/v1/ai/explain, recorded as it left, never a rebuild.
 *
 * Runs the SHIPPED code: RRAI and the fetch observer sliced out of RRV8/config.js, and aiExplain (with aiHealth)
 * from RRV8/ai-gate.js reached through Home's delegates, over a small fake DOM (jsdom is not a dependency of this repo).
 *
 *   S1  a POST to api/v1/ai/explain is recorded from its exact body string, and the call goes through unchanged
 *   S2  a GET, another AI path (ai/health) and a non-string body are not recorded
 *   S3  sentFor finds the newest record for that exact prompt, and nothing for a prompt never sent
 *   S4  the disclosure is collapsed, one summary line (feature, level, size), the text escaped, the instructions
 *       shown when sent, and the masking sentence on every level but Full
 *   S5  showSent puts one disclosure inside the answer, replaces it on a second answer, removes it for an unknown prompt
 *   H1  Home's aiExplain returns the prompt with the answer, and the record for it is the body Home actually posted
 *
 * FOUR MUTATION CONTROLS, each must turn a named check red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const config = fs.readFileSync(path.join(ROOT, 'RRV8', 'config.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'home.html'), 'utf8').replace(/\r\n/g, '\n');
const UUID = '11111111-1111-1111-1111-111111111111';
const DB = 'RapidReconciler_Prod_V8';
const VALC = 'https://valc.example';

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

const O_START = '// UI-255: the ONE place every AI call passes.';
once(config, O_START, 'observer start');
const O_FROM = config.indexOf(O_START);
const OBS_SRC = config.slice(O_FROM, config.indexOf('\n})();', O_FROM) + '\n})();'.length);

// UI-240 slice 2: aiExplain and aiHealth live in RRV8/ai-gate.js now, and Home keeps each name as a delegate
// onto the gate it builds. HOME_SRC is the shipped gate file + Home's delegate block, so H1 runs what Home
// runs and its mutation arm lands in ai-gate.js. GLUE: in a browser the bare global RRV8 is window.RRV8.
const GATE = fs.readFileSync(path.join(ROOT, 'RRV8', 'ai-gate.js'), 'utf8').replace(/\r\n/g, '\n');
const GLUE = "\n;if (typeof RRV8 === 'undefined') { globalThis.RRV8 = window.RRV8; } else if (RRV8 !== window.RRV8) { RRV8.aiGate = window.RRV8.aiGate; }\n";
const H_START = '  var _aiGate = RRV8.aiGate({';
const H_END = '\n  function loadAiPlan() {';
once(html, H_START, 'aiGate start'); once(html, H_END, 'aiHealth end');
once(GATE, 'window.RRV8.aiGate = function (env) {', 'ai-gate.js aiGate');
const HOME_SRC = GATE + GLUE + html.slice(html.indexOf(H_START), html.indexOf(H_END, html.indexOf(H_START)));

// ---- a fake DOM, just enough for RRAI.sentDetails / showSent ------------------
function makeDoc() {
  const byId = {};
  function el(tag) {
    const e = { tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, className: '', _html: '', id: '' };
    e.classList = { contains: (c) => (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0 };
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); if (k === 'id') e.id = String(v); };
    e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
    Object.defineProperty(e, 'innerHTML', {
      get: () => e._html,
      set: (v) => { e._html = String(v); e.children.forEach((c) => { c.parentNode = null; }); e.children = []; }
    });
    e.appendChild = (c) => { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = e; e.children.push(c); if (c.id) byId[c.id] = c; return c; };
    e.insertBefore = (c, ref) => {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = e;
      const i = ref ? e.children.indexOf(ref) : -1;
      if (i < 0) e.children.push(c); else e.children.splice(i, 0, c);
      if (c.id) byId[c.id] = c;
      return c;
    };
    e.removeChild = (c) => { const i = e.children.indexOf(c); if (i >= 0) e.children.splice(i, 1); c.parentNode = null; return c; };
    Object.defineProperty(e, 'lastElementChild', { get: () => e.children[e.children.length - 1] || null });
    Object.defineProperty(e, 'nextElementSibling', {
      get: () => { const p = e.parentNode; return p ? (p.children[p.children.indexOf(e) + 1] || null) : null; }
    });
    Object.defineProperty(e, 'nextSibling', { get: () => e.nextElementSibling });
    return e;
  }
  const head = el('head');
  return { createElement: el, getElementById: (id) => byId[id] || null, head, documentElement: head };
}

// ---- the sandbox: real RRAI + real observer over a recording fetch ------------
function sandbox(rraiSrc, obsSrc, extra) {
  const posted = [];
  const doc = makeDoc();
  const origFetch = function (url, init) {
    posted.push({ url, init, self: this });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ text: 'an answer' }) });
  };
  const store = (m) => ({ getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } });
  const win = { fetch: origFetch, RRDB: { name: () => DB, uuid: () => UUID }, dispatchEvent: () => {} };
  const sb = Object.assign({
    window: win, document: doc, localStorage: store({ 'rrv8.aiTier': 'full' }),
    sessionStorage: store({ 'rrv8.aiPlan': JSON.stringify({ [DB]: 'full' }) }),
    CustomEvent: function (t, o) { this.type = t; this.detail = o && o.detail; }, JSON, Promise, console, encodeURIComponent
  }, extra || {});
  win.window = win;
  vm.createContext(sb);
  vm.runInContext(rraiSrc + '\n' + obsSrc, sb);
  return { win, R: win.RRAI, doc, posted, origFetch, sb };
}
function post(s, url, body) {
  return s.win.fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function sentSuite(rraiSrc, obsSrc, label) {
  if (label) console.log(label);
  // S1
  let s = sandbox(rraiSrc, obsSrc);
  const body = { feature: 'explain', database: UUID, level: 'scrubbed', prompt: 'Entity A is out of balance by $1.2K.' };
  const bodyStr = JSON.stringify(body);
  const ret = s.win.fetch(VALC + '/api/v1/ai/explain?ctx=abc', { method: 'POST', body: bodyStr });
  const rec = s.R.sentFor(body.prompt);
  check('S1 the record holds the exact body string that was posted', rec && rec.body, bodyStr);
  check('S1 and its feature and level as declared', rec && [rec.feature, rec.level], ['explain', 'scrubbed']);
  check('S1 the call reaches fetch unchanged', s.posted.length === 1 && s.posted[0].init.body === bodyStr
        && s.posted[0].url === VALC + '/api/v1/ai/explain?ctx=abc', true);
  check('S1 and fetch\'s own promise is what the caller gets', typeof (ret && ret.then), 'function');

  // S2
  s = sandbox(rraiSrc, obsSrc);
  s.win.fetch(VALC + '/api/v1/ai/explain', { method: 'GET' });
  s.win.fetch(VALC + '/api/v1/ai/health?db=x', { method: 'POST', body: JSON.stringify({ prompt: 'p' }) });
  s.win.fetch(VALC + '/api/v1/ai/explain', { method: 'POST', body: { prompt: 'not a string' } });
  s.win.fetch(VALC + '/api/v1/ai/explainer', { method: 'POST', body: JSON.stringify({ prompt: 'q' }) });
  check('S2 GET, ai/health, a non-string body and a look-alike path record nothing',
        [s.R.sentFor('p'), s.R.sentFor('not a string'), s.R.sentFor('q')], [null, null, null]);
  check('S2 every one of them still went through', s.posted.length, 4);

  // S3
  s = sandbox(rraiSrc, obsSrc);
  post(s, VALC + '/api/v1/ai/explain', { feature: 'ask', level: 'grounded', prompt: 'same' });
  post(s, VALC + '/api/v1/ai/explain', { feature: 'ask', level: 'full', prompt: 'same' });
  post(s, VALC + '/api/v1/ai/explain', { feature: 'summaries', level: 'full', prompt: 'other' });
  check('S3 the newest record for that exact prompt', s.R.sentFor('same') && s.R.sentFor('same').level, 'full');
  check('S3 no record for a prompt never sent (nothing is rebuilt)', s.R.sentFor('same '), null);
  check('S3 a prompt is matched whole, not by prefix', s.R.sentFor('sam'), null);

  // S4
  s = sandbox(rraiSrc, obsSrc);
  post(s, VALC + '/api/v1/ai/explain', { feature: 'explain', level: 'scrubbed', prompt: 'a <b>bold</b> & claim', system: 'Use only these facts.' });
  post(s, VALC + '/api/v1/ai/explain', { feature: 'ask', level: 'full', prompt: 'full prompt' });
  post(s, VALC + '/api/v1/ai/explain', { feature: 'summaries', level: 'grounded', prompt: 'basic prompt' });
  const d = s.R.sentDetails(s.R.sentFor('a <b>bold</b> & claim')) || { tagName: '', attrs: {}, innerHTML: '' };
  const html = (p) => (s.R.sentDetails(s.R.sentFor(p)) || { innerHTML: '' }).innerHTML;
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(d.innerHTML);
  check('S4 a collapsed <details>', [d.tagName, 'open' in d.attrs], ['DETAILS', false]);
  check('S4 one summary line: What was sent, the feature, the level, the size',
        summary && summary[1].replace(/<[^>]+>/g, ''),
        'What was sentExplain a finding &middot; Enhanced &middot; ' + ('a <b>bold</b> & claim'.length + 'Use only these facts.'.length) + ' characters');
  check('S4 the prompt is escaped, never rendered as markup', d.innerHTML.indexOf('a &lt;b&gt;bold&lt;/b&gt; &amp; claim') >= 0 && d.innerHTML.indexOf('<b>bold</b>') < 0, true);
  check('S4 the instructions are shown when they were sent', d.innerHTML.indexOf('Use only these facts.') >= 0, true);
  check('S4 Enhanced says identifiers were replaced', /generic labels/.test(d.innerHTML), true);
  check('S4 Basic says so too', /generic labels/.test(html('basic prompt')), true);
  check('S4 Full does not claim masking', /generic labels/.test(html('full prompt')) || !html('full prompt'), false);
  check('S4 a Full call with no instructions shows no Instructions block', /Instructions/.test(html('full prompt')) || !html('full prompt'), false);
  check('S4 nothing to show for no record', s.R.sentDetails(null), null);

  // S5
  s = sandbox(rraiSrc, obsSrc);
  post(s, VALC + '/api/v1/ai/explain', { feature: 'ask', level: 'full', prompt: 'first' });
  post(s, VALC + '/api/v1/ai/explain', { feature: 'ask', level: 'full', prompt: 'second' });
  const host = s.doc.createElement('div');
  host.appendChild(s.doc.createElement('span'));
  s.R.showSent(host, 'first');
  s.R.showSent(host, 'second');
  const sent = host.children.filter((c) => c.classList.contains('rrai-sent'));
  check('S5 one disclosure in the answer after two answers', sent.length, 1);
  check('S5 and it is the second answer\'s', sent[0] && /second/.test(sent[0].innerHTML), true);
  check('S5 it sits last, after the answer text', host.lastElementChild === sent[0], true);
  s.R.showSent(host, 'never sent');
  check('S5 an answer with no record removes the old disclosure', host.children.filter((c) => c.classList.contains('rrai-sent')).length, 0);
  const wrap = s.doc.createElement('div'), inline = s.doc.createElement('span');
  wrap.appendChild(inline);
  s.R.showSent(inline, 'first', 'after'); s.R.showSent(inline, 'first', 'after');
  check('S5 "after" puts one disclosure beside an inline answer', wrap.children.length, 2);
}

// ---- Home's aiExplain, through the real RRAI and observer ---------------------
async function homeSuite(rraiSrc, obsSrc, homeSrc, label) {
  if (label) console.log(label);
  const s = sandbox(rraiSrc, obsSrc);
  // Home's rrFetch, in the shape it has: JSON.stringify of the body object, then fetch.
  const sb = s.sb;
  sb.RRAI = s.R;
  sb.window.RRV8 = {};
  sb.activeDb = () => ({ n: DB, uuid: UUID });
  sb._recsummaryLevel = () => 'scrubbed';
  sb.rrFetch = (area, o) => {
    if (String(area).indexOf('ai/health') >= 0) return Promise.resolve({ configured: true, maxLevel: 'full' });
    return sb.window.fetch(VALC + '/' + area, { method: o.method, body: JSON.stringify(o.body) }).then((r) => r.json());
  };
  vm.runInContext(homeSrc + '\nglobalThis.__x = aiExplain;', sb);
  const r = await sb.__x('Entity A: net to clear $4.1K.', { feature: 'drafting', system: 'Grounding.' });
  check('H1 the answer carries the prompt it was asked with', [r.ok, r.prompt], [true, 'Entity A: net to clear $4.1K.']);
  const rec = s.R.sentFor(r.prompt);
  check('H1 the record is the very body Home posted', rec && rec.body, s.posted[0] && s.posted[0].init.body);
  check('H1 with Home\'s feature, level and instructions', rec && [rec.feature, rec.level, rec.system], ['drafting', 'scrubbed', 'Grounding.']);
}

(async () => {
  await sentSuite(RRAI_SRC, OBS_SRC, 'RRAI what-was-sent (config.js)');
  await homeSuite(RRAI_SRC, OBS_SRC, HOME_SRC, '\naiExplain (home.html)');
  const real = failures;

  console.log('\nmutation controls');
  const controls = [
    ['S1', 'the observer stops recording', 'obs', OBS_SRC.replace("try { window.RRAI.noteSent(", "try { void (")],
    ['S3', 'sentFor returns the newest record whatever the prompt', 'rrai',
      RRAI_SRC.replace('for (var i = SENT.length - 1; i >= 0; i--) if (SENT[i].prompt === p) return SENT[i];',
                       'if (SENT.length) return SENT[SENT.length - 1];')],
    ['S5', 'showSent stops replacing the old disclosure', 'rrai',
      RRAI_SRC.replace("if (old && old.classList && old.classList.contains('rrai-sent')) old.parentNode.removeChild(old);", '')],
    ['H1', 'Home stops returning the prompt with the answer', 'home',
      HOME_SRC.replace('return txt ? { ok: true, text: txt, prompt: prompt }', 'return txt ? { ok: true, text: txt }')]
  ];
  let controlsOk = true;
  for (const [want, what, which, src] of controls) {
    const base = which === 'rrai' ? RRAI_SRC : which === 'obs' ? OBS_SRC : HOME_SRC;
    if (src === base) { console.log('  HARNESS BROKEN: the mutation for ' + what + ' changed nothing'); process.exit(1); }
    failures = 0; reds = [];
    const log = console.log; console.log = () => {};
    try {
      if (which === 'home') await homeSuite(RRAI_SRC, OBS_SRC, src, '');
      else await sentSuite(which === 'rrai' ? src : RRAI_SRC, which === 'obs' ? src : OBS_SRC, '');
    } finally { console.log = log; }
    const hit = reds.indexOf(want) >= 0;
    if (!hit) controlsOk = false;
    console.log('  ' + (hit ? 'ok  ' : 'FAIL') + '  ' + what + ' -> ' + want + ' red' + (hit ? '' : ' (reds: ' + reds.join(',') + ')'));
  }
  console.log(real === 0 && controlsOk ? '\nALL PASS' : '\nFAILED: ' + real + ' check(s)' + (controlsOk ? '' : ', a mutation control did not bite'));
  process.exit(real === 0 && controlsOk ? 0 : 1);
})();
