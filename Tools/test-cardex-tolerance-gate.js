/* test-cardex-tolerance-gate.js -- behaviour test for _cxCanSetTol (UI-199).
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:/Program Files/Azure Data Studio/azuredatastudio.exe" \
 *       Tools/test-cardex-tolerance-gate.js
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT REDUNDANT WITH THE GUARD-PARITY GATE.
 * Six write call sites on inventory-cardex-variance.html reached endpoints
 * requiring {adm, dm, su} with nothing stopping them: _cxCanSetTol() only ever
 * HID the editor (`ed.hidden = !_cxCanSetTol()`), and a render-time condition is
 * not a gate. The owner ruled on 2026-09-15 to gate them.
 *
 * Adding the guards was not enough. The predicate read `d.perms.dm !== false`,
 * so a perms block that simply omits `dm` passed it, and check_guard_parity
 * reports a fail-open gate as no gate at all -- correctly. It now reads
 * `=== true`.
 *
 * ⚠ THE GUARD-PARITY GATE CANNOT PROTECT THIS FROM THE UI REPO'S OWN CI. It
 * lives in the Agent repo and reads this repo's main, so a change here is caught
 * on the next Agent PR or the nightly, not on the PR that makes it. This suite
 * closes that window: it runs in this repo, on this file.
 *
 * WHAT THIS ASSERTS, against the shipped predicate extracted from the page:
 *
 *   E1  perms.dm === true  -> allowed
 *   E2  perms.dm === false -> refused
 *   E3  perms present but dm ABSENT -> REFUSED. This is the whole fix; the old
 *       `!== false` allowed it
 *   E4  adm === true wins regardless of perms
 *   E5  no token at all -> refused
 *   E6  no dbs array -> allowed, deliberately. This box's dev token predates the
 *       perms claim and runs to 2036; auth.jwt.ttl-hours defaults to 8, so no
 *       customer token can be old enough to take this path
 *   E7  a malformed token -> allowed, same deliberate reason as E6
 *
 * THREE MUTATION CONTROLS. Each names what must go RED and what must STAY GREEN.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'RRV8', 'inventory-cardex-variance.html'), 'utf8');

let failures = 0;
let reds = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; reds.push(name.slice(0, 2)); }
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name +
              (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
  return ok;
}

const START = '  function _cxCanSetTol(){';
const END   = '\n  // ---- company scope:';

function occurrences(hay, needle) {
  let n = 0, i = 0;
  for (;;) { const j = hay.indexOf(needle, i); if (j < 0) break; n++; i = j + 1; }
  return n;
}
for (const [label, anchor] of [['start', START], ['end', END]]) {
  if (occurrences(html, anchor) !== 1) {
    console.log('HARNESS BROKEN: ' + label + ' anchor appears ' +
                occurrences(html, anchor) + ' times, expected 1');
    process.exit(1);
  }
}
const SOURCE = html.slice(html.indexOf(START), html.indexOf(END, html.indexOf(START)));

// Build a JWT-shaped token whose payload is the given object. Only the middle
// segment is read, so the header and signature are placeholders.
function tok(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return 'h.' + b64 + '.s';
}

function run(tokenStr, source) {
  if (source === undefined) source = SOURCE;
  const sandbox = {
    token: function () { return tokenStr; },
    _activeDbIdx: function () { return 0; },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    JSON: JSON,
    console: console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.__can = _cxCanSetTol;', sandbox);
  if (typeof sandbox.__can !== 'function') {
    throw new Error('HARNESS BROKEN: extracted source did not define _cxCanSetTol');
  }
  return sandbox.__can();
}

function suite(source, label) {
  failures = 0; reds = [];
  console.log(label + '\n');

  check('E1 perms.dm === true is allowed',
        run(tok({ dbs: [{ perms: { dm: true } }] }), source), true);
  check('E2 perms.dm === false is refused',
        run(tok({ dbs: [{ perms: { dm: false } }] }), source), false);

  // E3 -- the defect. `!== false` let this through, which is why the
  // guard-parity gate called every call behind it ungated.
  check('E3 perms present but dm ABSENT is refused',
        run(tok({ dbs: [{ perms: { ij: true, rs: true } }] }), source), false);
  check('E3 an empty perms block is refused',
        run(tok({ dbs: [{ perms: {} }] }), source), false);

  check('E4 adm === true wins over a missing dm',
        run(tok({ dbs: [{ adm: true, perms: {} }] }), source), true);
  check('E4 adm === true wins over dm:false',
        run(tok({ dbs: [{ adm: true, perms: { dm: false } }] }), source), true);

  check('E5 no token at all is refused', run(null, source), false);
  check('E5 an empty token is refused', run('', source), false);

  // E6/E7 -- the two paths that stay open on purpose, for the pre-perms dev token.
  check('E6 no dbs array is allowed (legacy dev token)',
        run(tok({ sub: 'someone' }), source), true);
  check('E7 a malformed token is allowed (same reason)',
        run('not-a-jwt', source), true);

  return { failures: failures, reds: reds.slice() };
}

(function () {
  const real = suite(SOURCE, 'Cardex tolerance gate -- the SHIPPED _cxCanSetTol()');
  console.log('\n  ' + (real.failures ? real.failures + ' FAILED' : 'all green') + '\n');

  const mutations = [
    {
      name: 'F1 restore the fail-open read (=== true becomes !== false)',
      from: 'd.perms.dm===true',
      to:   'd.perms.dm!==false',
      mustRedden: ['E3'],
      mustStayGreen: ['E1', 'E2', 'E4', 'E5', 'E6', 'E7']
    },
    {
      name: 'F2 drop the adm override',
      from: 'if(d.adm===true) return true;',
      to:   '',
      mustRedden: ['E4'],
      mustStayGreen: ['E1', 'E2', 'E3', 'E5', 'E6', 'E7']
    },
    {
      name: 'F3 stop refusing a missing token',
      from: 'var t=token(); if(!t) return false;',
      to:   'var t=token(); if(!t) return true;',
      mustRedden: ['E5'],
      mustStayGreen: ['E1', 'E2', 'E3', 'E4', 'E6', 'E7']
    }
  ];

  let controlFailures = 0;
  for (const m of mutations) {
    if (occurrences(SOURCE, m.from) !== 1) {
      console.log('CONTROL BROKEN: ' + m.name + ' -- target appears ' +
                  occurrences(SOURCE, m.from) + ' times, expected 1');
      controlFailures++;
      continue;
    }
    const r = suite(SOURCE.replace(m.from, m.to), '--- MUTATION ' + m.name + ' ---');
    const red = new Set(r.reds);
    const missed = m.mustRedden.filter((c) => !red.has(c));
    const bonus  = m.mustStayGreen.filter((c) => red.has(c));
    if (missed.length) {
      console.log('\n  CONTROL FAILED: ' + m.name + ' -- did NOT go red: ' + missed.join(', '));
      controlFailures++;
    }
    if (bonus.length) {
      console.log('\n  CONTROL FAILED: ' + m.name + ' -- went red but should not have: ' + bonus.join(', '));
      controlFailures++;
    }
    if (!missed.length && !bonus.length) {
      console.log('\n  control ok -- reddened exactly ' + m.mustRedden.join(', ') + '\n');
    }
  }

  const bad = real.failures + controlFailures;
  console.log(bad ? '\nRESULT: ' + bad + ' problem(s)\n'
                  : '\nRESULT: all assertions and all 3 mutation controls pass\n');
  process.exit(bad ? 1 : 0);
})();
