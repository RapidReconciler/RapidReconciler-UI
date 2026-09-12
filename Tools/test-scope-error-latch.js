/* test-scope-error-latch.js -- behaviour test for the As Of scope refusal (UI-193).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-scope-error-latch.js
 *
 * (node is not on this box's PATH; parsecheck.py discovers the same Electron
 * host and this test runs on it.)
 *
 * WHY THIS EXISTS. `inventory-asof.html` refuses a `?company=` deep link naming
 * a company the session cannot see, and latches `_scopeError`. THE REFUSAL IS
 * CORRECT and must not be weakened: silently substituting a different company
 * would show the analyst one company's rows under another company's
 * expectation -- they clicked a figure for company X.
 *
 * ⚠ WHAT WAS WRONG IS THAT IT NEVER CLEARED. `_scopeError` was assigned in
 * exactly one place and reset nowhere, so the page's own advice -- "Pick a
 * company from the selector above" -- was something the page would not honour.
 * Picking a valid company left the refusal latched and only a reload cleared
 * it. That is hard rule 5 from the other side: the sink exists, is visible, is
 * in the right place, and what it says is wrong. A visible instruction the
 * product ignores costs more than a silent refusal, because the analyst spends
 * the time before doubting it.
 *
 * UI-185's report gate inherited it -- `analyzeIntegrityReport()` and
 * `downloadUomReport()` both open with `if (_scopeError || !_ensureSolo())` --
 * so a latched flag also disabled three restored buttons.
 *
 * WHAT THIS ASSERTS, on source EXTRACTED from the shipped page:
 *
 *   A1  a ?company= outside the session's list LATCHES the refusal
 *   A2  a valid ?company= does NOT latch  (control: A1 is not vacuous)
 *   A3  re-deriving scope does NOT clear a latched refusal
 *       <- the guard. Clearing in _ensureSolo/loadData/a re-render would
 *          defeat the whole refusal, because those run unattended.
 *   A4  an explicit company PICK clears it, and sets the new company
 *       <- the fix, run against the real click-handler text
 *   A5  picking the company you are already on changes nothing
 *
 * MUTATION CONTROL at the end: the fix line is removed from the extracted
 * handler and A4 must go RED while A1/A2/A3/A5 stay green -- the bug never
 * touched those.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
// ⚠ Newlines normalised before any anchor match. The working tree has this
// file with CRLF endings, so a multi-line anchor written with \n matched ZERO
// times and the harness aborted -- correctly, because it asserts its anchors
// are unique before slicing. Without that assertion it would have sliced
// something arbitrary and tested it.
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'inventory-asof.html'), 'utf8')
                .replace(/\r\n/g, '\n');

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  return ok;
}
function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
function slice(startAnchor, endAnchor, label) {
  for (const [w, a] of [['start', startAnchor], ['end', endAnchor]]) {
    if (occurrences(html, a) !== 1) {
      console.log('HARNESS BROKEN: ' + label + ' ' + w + ' anchor appears ' +
                  occurrences(html, a) + ' times, expected 1');
      process.exit(1);
    }
  }
  const from = html.indexOf(startAnchor);
  const to   = html.indexOf(endAnchor, from) + endAnchor.length;
  return html.slice(from, to);
}

// --- the scope resolver, real text ----------------------------------------
const RESOLVER = slice('function _soloCandidates() {',
                       '    return _soloCompany;\n  }', 'resolver');
// --- the company-pick handler body, real text -----------------------------
const PICKER = slice('        const c = btn.dataset.company;',
                     '        loadData();   // refetch for just this company, then renderAll',
                     'picker');

for (const [label, src, needed] of [
  ['resolver', RESOLVER, '_scopeError'],
  ['picker',   PICKER,   '_soloCompany']
]) {
  if (src.indexOf(needed) < 0) {
    console.log('HARNESS BROKEN: extracted ' + label + ' has no ' + needed);
    process.exit(1);
  }
}

/** Run the resolver with a session whose allowed list is `allowed`, and a
 *  `?company=` of `urlCo`. Returns the sandbox so the test can read state. */
function resolve(allowed, urlCo, pre) {
  const sandbox = {
    _soloCompany: null,
    _scopeError: (pre === undefined ? null : pre),
    window: {
      RRV8: { readSessionScope: function () { return { allowedCompanies: allowed, activeCompanies: allowed }; } },
      RR_SESSION: { dbs: [{ i: allowed }], activeDbIndex: 0 },
      location: { search: urlCo ? ('?company=' + urlCo) : '' }
    },
    URLSearchParams: URLSearchParams,
    Array: Array, String: String, console: { error: function () {}, warn: function () {} }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(RESOLVER + '\n;globalThis.__ensure = _ensureSolo;', sandbox);
  sandbox.__ensure();
  return sandbox;
}

/** Run the real pick-handler text for company `c`, starting from `state`. */
function pick(c, state, src) {
  const sandbox = {
    btn: { dataset: { company: c } },
    _soloCompany: state.solo,
    _scopeError: state.scopeError,
    _state: { companyFilter: state.solo, expanded: new Set() },
    hideAllPopovers: function () {},
    updateCompanyPill: function () {},
    loadData: function () { sandbox.__reloaded = true; },
    __reloaded: false,
    Set: Set, console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // The handler body uses a bare `return`, so it has to run inside a function.
  // ⚠ The newline before the closing brace is load-bearing: the extracted text
  // ends in a trailing `// comment`, so appending `})();` on the same line
  // comments out the brace and the script fails to parse.
  vm.runInContext('(function(){\n' + (src === undefined ? PICKER : src) + '\n})();', sandbox);
  return sandbox;
}

console.log('test-scope-error-latch.js -- UI-193');

const ALLOWED = ['00010', '00050'];

// ---- A1/A2: the refusal, and a control proving A1 is not vacuous ----------
check('A1  a ?company= outside the session list LATCHES the refusal',
      !!resolve(ALLOWED, '99999').\u005fscopeError, true);
check('A2  a ?company= INSIDE the list does not latch (control)',
      resolve(ALLOWED, '00050')._scopeError, null);

// ---- A3: the guard -- re-deriving must NOT clear --------------------------
(function () {
  const s = resolve(ALLOWED, '99999');
  s.__ensure();      // re-derive, exactly as a re-render does
  s.__ensure();
  check('A3  re-deriving scope does NOT clear a latched refusal',
        !!s._scopeError, true);
})();

// ---- A4: the fix ----------------------------------------------------------
(function () {
  const latched = { param: 'company', value: '99999', label: 'company' };
  const s = pick('00050', { solo: '00010', scopeError: latched });
  check('A4a an explicit pick CLEARS the latched refusal', s._scopeError, null);
  check('A4b ... and selects the picked company',           s._soloCompany, '00050');
  check('A4c ... and refetches',                            s.__reloaded, true);
})();

// ---- A5: picking the company you are already on ---------------------------
(function () {
  const latched = { param: 'company', value: '99999', label: 'company' };
  const s = pick('00010', { solo: '00010', scopeError: latched });
  check('A5  re-picking the current company is a no-op (no refetch)', s.__reloaded, false);
})();

// ---------------------------------------------------------------------------
// MUTATION CONTROL -- remove the fix and require A4a to go RED.
// ---------------------------------------------------------------------------
console.log('\n  mutation control (removing the _scopeError reset)');
const MUTATED = PICKER.replace(/^\s*_scopeError = null;\s*$/m, '');
if (MUTATED === PICKER) {
  failures++;
  console.log('  FAIL  mutation control could not find the fix line to remove -- ' +
              'the harness is not exercising what it thinks it is');
} else {
  const latched = { param: 'company', value: '99999', label: 'company' };
  const s = pick('00050', { solo: '00010', scopeError: latched }, MUTATED);
  const reddened = s._scopeError !== null;
  const stillWorks = s._soloCompany === '00050' && s.__reloaded === true;
  console.log('    ' + (reddened ? 'reddened' : 'STILL GREEN') +
              '  A4a   _scopeError after pick: ' + JSON.stringify(s._scopeError));
  console.log('    ' + (stillWorks ? 'ok      ' : 'FAIL    ') +
              'A4b/A4c unaffected by the mutation, as they should be');
  if (!reddened || !stillWorks) {
    failures++;
    console.log('  FAIL  mutation control: A4a must redden and A4b/A4c must not.');
  } else {
    console.log('  ok    mutation control behaved exactly as the defect would');
  }
}

console.log('\n' + (failures === 0 ? 'PASS' : 'FAIL (' + failures + ')'));
process.exit(failures === 0 ? 0 : 1);
