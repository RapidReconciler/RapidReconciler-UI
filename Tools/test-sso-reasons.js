/* test-sso-reasons.js -- the UI half of the SSO refusal vocabulary (VLC-53, VLC-214).
 *
 *   node Tools/test-sso-reasons.js
 *
 * VALC's SSO handlers redirect a refused sign-in to sso-landing.html?reason=<code>, and
 * the page maps the code to a sentence. The codes are a CROSS-REPO CONTRACT with
 * SsoRefusal.java; the Valc repo pins its side in SsoRefusalVocabularyTest. Nothing pinned
 * this side, so a code VALC sends with no copy here would render the generic "No sign-in
 * token was returned" sentence to a person who has been refused for a specific reason.
 *
 *   S1  the REASONS map holds exactly the codes SsoRefusal.java declares
 *   S2  every code has non-empty copy
 *   S3  VLC-214's no_default_role carries the owner-approved sentence, verbatim
 *   S4  REGISTER: outside the five VLC-109 codes (copied verbatim from AuthController,
 *       where the account pause is GSI's to lift), no sentence sends the person to
 *       "support" -- their IT administrator owns the configuration
 *
 * The map is sliced out of the shipped page and evaluated, not retyped.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'sso-landing.html'), 'utf8').replace(/\r\n/g, '\n');

let failures = 0;
function check(ok, name, detail) {
    if (ok) { console.log('  ok   ' + name); return; }
    failures++;
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

const START = '  var REASONS = {';
const at = page.indexOf(START);
if (at < 0 || page.indexOf(START, at + 1) >= 0) { console.log('HARNESS BROKEN: REASONS anchor not found exactly once'); process.exit(1); }
const end = page.indexOf('\n  };', at);
if (end < 0) { console.log('HARNESS BROKEN: end of REASONS not found'); process.exit(1); }
const REASONS = vm.runInNewContext(page.slice(at, end + 5) + '\nREASONS');

// Keep in step with SsoRefusalVocabularyTest.java in the Valc repo.
const VOCAB = [
    'domain_not_permitted', 'account_disabled', 'sso_disabled', 'no_email',
    'unknown_registration', 'bad_auth_type', 'idp_error', 'server_error',
    'service_paused', 'client_inactive', 'license_expired', 'no_licensed_customer',
    'no_database_access',
    'no_default_role'
];
const VLC109 = ['service_paused', 'client_inactive', 'license_expired', 'no_licensed_customer', 'no_database_access'];

console.log('test-sso-reasons.js (VLC-53 / VLC-214)');
const keys = Object.keys(REASONS).sort();
check(JSON.stringify(keys) === JSON.stringify(VOCAB.slice().sort()),
    'S1  REASONS holds exactly the SsoRefusal vocabulary',
    'missing ' + JSON.stringify(VOCAB.filter(k => !(k in REASONS))) + ', extra ' + JSON.stringify(keys.filter(k => VOCAB.indexOf(k) < 0)));
check(VOCAB.every(k => typeof REASONS[k] === 'string' && REASONS[k].trim().length > 20),
    'S2  every code has a sentence',
    'empty: ' + JSON.stringify(VOCAB.filter(k => !(typeof REASONS[k] === 'string' && REASONS[k].trim().length > 20))));
check(REASONS.no_default_role === 'Single sign-on is switched on for your organization, but no starting role is set for '
    + 'new people, so RapidReconciler could not create your account. Ask your IT administrator to set one.',
    'S3  no_default_role carries the approved sentence', JSON.stringify(REASONS.no_default_role));
const offRegister = VOCAB.filter(k => VLC109.indexOf(k) < 0 && /support/i.test(REASONS[k] || ''));
check(offRegister.length === 0, 'S4  outside the VLC-109 five, no sentence says "support"', JSON.stringify(offRegister));
check(/IT administrator/.test(REASONS.no_default_role || ''), 'S4b no_default_role names the IT administrator');

console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
process.exit(failures === 0 ? 0 : 1);
