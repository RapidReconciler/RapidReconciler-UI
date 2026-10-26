/* test-ai-timeout.js -- behaviour test: a slow AI answer says so, instead of "could not reach" (VLC-183).
 *
 *   node Tools/test-ai-timeout.js
 *
 * WHAT IS UNDER TEST. VALC answers a timed-out AI call with a 504 whose message names its own
 * time limit (AiController.explainFailure). Until VLC-183 every V8 page showed any AI failure
 * as "Could not reach the AI service", so the commonest failure, a slow answer, read as an
 * outage (owner report 2026-10-20, Full Perpetual Details). The claims:
 *
 *   - RRV8.aiTimeout (config.js) returns VALC's sentence for a 504, a generic one for a bare
 *     504, and '' for every other failure, so pages keep their own wording for those;
 *   - the shared explainer (_fetchErrorText, sidebar.js) shows the timeout sentence for a 504
 *     from the AI gateway and still escalates a 502;
 *   - the Full Perpetual Details page (asofAsk) shows the timeout sentence on a 504 and its old
 *     wording on any other failure.
 *
 * THE SOURCE IS NOT RETYPED. Each function is sliced out of its file and executed. The control
 * at the end makes aiTimeout answer '' and requires the page assertion to break.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RRV8 = path.join(__dirname, '..', 'RRV8');
const read = (f) => fs.readFileSync(path.join(RRV8, f), 'utf8');

let failures = 0;
function ok(cond, label, detail) {
  if (cond) { console.log('  PASS  ' + label); return true; }
  failures++;
  console.log('  FAIL  ' + label + (detail ? '\n          ' + detail : ''));
  return false;
}

// Brace-balanced slice, skipping strings, template literals and comments.
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
function slice(src, marker, file) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(marker + ' not found in ' + file);
  return sliceBlock(src, at);
}

const configSrc = read('config.js');
const AI_TIMEOUT_SRC = slice(configSrc, 'window.RRV8.aiTimeout = function', 'config.js') + ';';
const sidebarSrc = read('sidebar.js');
const EXPLAINER_SRC = ['_isValcArea', '_serverDetail', '_fetchErrorText']
  .map(function (n) { return slice(sidebarSrc, '\n  function ' + n + '(', 'sidebar.js'); }).join('\n');
const asofSrc = read('inventory-asof.html');
const ASOF_SRC = slice(asofSrc, '\n  function asofAsk(', 'inventory-asof.html');

const SLOW = 'The AI took longer than 30 seconds to answer, so the request was stopped. Nothing is wrong with your data. Try again; a second try usually answers.';
function err(status, serverMessage) {
  const e = new Error(serverMessage || ('HTTP ' + status));
  e.status = status;
  if (serverMessage) { e.serverMessage = serverMessage; e.serverField = 'message'; }
  return e;
}

function sandbox(mutate) {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  sb.window = sb; sb.global = sb;
  sb.RR_VALC_PREFIXES = ['api/v1/tenant/', 'api/v1/admin/', 'api/v1/ai/', 'api/v1/messages'];
  sb.RRV8 = {};
  vm.createContext(sb);
  vm.runInContext(mutate ? mutate(AI_TIMEOUT_SRC) : AI_TIMEOUT_SRC, sb);
  vm.runInContext(EXPLAINER_SRC, sb);
  return sb;
}

// Drive the real asofAsk('calc') with the AI call rejecting as `e`; resolve with what it showed.
function asofShows(e, mutate) {
  const sb = sandbox(mutate);
  const shown = [];
  sb._asofAiBusy = false; sb._asofLastAsk = null;
  sb.asofEffTier = function () { return 'full'; };
  sb.asofAnswer = function (t, busy) { shown.push({ t: t, busy: busy }); };
  sb.asofAiExplain = function () { return Promise.reject(e); };
  vm.runInContext(ASOF_SRC, sb);
  sb.asofAsk('calc');
  return new Promise(function (res) { setTimeout(function () { res(shown[shown.length - 1] || { t: '' }); }, 20); });
}

(async function main() {
  console.log('AI timeout reads as a timeout -- behaviour test');
  const sb = sandbox();

  console.log('\nRRV8.aiTimeout (config.js)');
  ok(sb.RRV8.aiTimeout(err(504, SLOW)) === SLOW, 'a 504 shows VALC\'s sentence as written');
  ok(/took too long/.test(sb.RRV8.aiTimeout(err(504))), 'a 504 with no body (a proxy) still says it took too long');
  ok(sb.RRV8.aiTimeout(err(502, 'The AI request failed (x).')) === '', 'a 502 is not a timeout');
  ok(sb.RRV8.aiTimeout(err(503, 'not configured')) === '', 'a 503 is not a timeout');
  ok(sb.RRV8.aiTimeout(new Error('Failed to fetch')) === '' && sb.RRV8.aiTimeout(null) === '', 'a network error or nothing is not a timeout');

  console.log('\n_fetchErrorText (sidebar.js)');
  const t504 = sb._fetchErrorText('api/v1/ai/explain', err(504, SLOW));
  ok(t504.indexOf(SLOW) === 0 && /\(HTTP 504\)$/.test(t504), 'an AI 504 shows the timeout sentence', t504);
  ok(t504.indexOf('contact GSI support') < 0, 'and does not tell the reader to escalate');
  const t502 = sb._fetchErrorText('api/v1/ai/explain', err(502, 'The AI request failed (x).'));
  ok(/failed while answering/.test(t502), 'an AI 502 still reads as a failure', t502);

  console.log('\nFull Perpetual Details (asofAsk)');
  let s = await asofShows(err(504, SLOW));
  ok(s.t === SLOW, 'a timed-out question shows the timeout sentence', s.t);
  s = await asofShows(err(502, 'The AI request failed (x).'));
  ok(s.t === 'Could not reach the AI service. Try again in a moment.', 'any other failure keeps the old wording', s.t);

  console.log('\nCONTROL');
  s = await asofShows(err(504, SLOW), function (src) { return src.replace("if (!err || err.status !== 504) return '';", "return '';"); });
  ok(s.t !== SLOW, 'CONTROL: with aiTimeout answering nothing, the page falls back to "Could not reach" (so the assertion above measures it)', s.t);

  console.log('\n' + (failures ? failures + ' FAILURE(S)' : 'all assertions held'));
  process.exit(failures ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(2); });
