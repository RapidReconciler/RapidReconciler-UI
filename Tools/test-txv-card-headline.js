/* test-txv-card-headline.js -- behaviour test for the "Type - Label" headline on
 * the analyst's variance pattern cards.
 *
 *   ELECTRON_RUN_AS_NODE=1 "C:\Program Files\Azure Data Studio\azuredatastudio.exe" \
 *       Tools/test-txv-card-headline.js
 *
 * WHY THIS EXISTS. Owner ruling 2026-09-12: each pattern card's centre cell reads
 * "Type - Label", where Type is the RCLC2 transaction type carried by that card's
 * own rows, and the label never repeats it. Get the stripping wrong and the card
 * either says the same word twice or loses a word that was carrying meaning --
 * and both are silent, because a headline always renders something.
 *
 * THE DEFECT THIS PINS: STRIPPING THE TYPE WORD WITH A REGEX OVER THE TITLE.
 * It is the obvious implementation and it is wrong twice over, measured against
 * the real catalogue and the real data:
 *
 *   1. "A/P Voucher on Inventory" -- the word "Inventory" there names the
 *      ACCOUNT the voucher landed on, not the transaction type. A regex cuts it
 *      and the card reads "A/P Voucher on", which is not a name.
 *   2. "Unclassified - Manufacturing" -- the catalogue spells the type
 *      "Manufacturing" and RCLC2 spells it "Mfg". A regex on the measured type
 *      never matches, so that card alone keeps its duplicate.
 *
 * So the strip is a curated `short` key per catalogue entry, consulted only when
 * the title actually contains this card's measured type word.
 *
 * WHY "Mixed" IS RARE AND THEREFORE WORTH HAVING. A card is a SubType bucket and
 * a SubType can carry more than one type. Measured 2026-09-12 over all three demo
 * databases, grouped by (company, period, SubType): 275 cards, 5 of them carrying
 * two types (Offsetting Entries x1, Transfers x1, Periods x3), none carrying
 * three. The vocabulary is Purchasing / Mfg / Sales / Inventory.
 *
 * SOURCE IS NOT RETYPED. The three functions are sliced out of RRV8/home.html and
 * the catalogue is the real RRV8.txv.META loaded from RRV8/config.js.
 *
 * THE CONTROL RUNS LAST and restores the regex strip in both of the shapes it
 * gets written in -- the plain one, and the vocabulary one you reach for to fix
 * the plain one's Mfg/Manufacturing miss. Each must reproduce its own symptom. If
 * either passes clean, the assertion standing behind it measures nothing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'RRV8', 'home.html');
const CONFIG = path.join(__dirname, '..', 'RRV8', 'config.js');

let failures = 0;
function eq(name, got, want) {
  if (got !== want) {
    failures++;
    console.log('  FAIL  ' + name + '\n          got  ' + JSON.stringify(got)
                                  + '\n          want ' + JSON.stringify(want));
    return false;
  }
  console.log('  ok    ' + name + ' = ' + JSON.stringify(want));
  return true;
}

/* ---- the real catalogue ------------------------------------------------- */

const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = { getElementById: () => null, querySelector: () => null,
                     querySelectorAll: () => [], addEventListener: () => {},
                     createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }) };
sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
sandbox.navigator = { language: 'en-US', userAgent: 'node' };
sandbox.location = { href: 'http://localhost/', search: '', hash: '' };
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.fetch = () => Promise.reject(new Error('no network in this harness'));

vm.createContext(sandbox);
try {
  new vm.Script(fs.readFileSync(CONFIG, 'utf8'), { filename: CONFIG }).runInContext(sandbox);
} catch (e) {
  console.error('FAIL could not load config.js: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
}
const META = sandbox.window.RRV8 && sandbox.window.RRV8.txv && sandbox.window.RRV8.txv.META;
if (!META || !META['MCM']) {
  console.error('FAIL RRV8.txv.META missing after loading config.js');
  process.exit(1);
}

/* ---- the real functions, sliced out of home.html ------------------------- */

function sliceBlock(src, startIdx) {
  let i = src.indexOf('{', startIdx);
  if (i < 0) throw new Error('no opening brace after index ' + startIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length; i++) {
        if (src[i] === '\\') { i++; continue; }
        if (src[i] === q) break;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  throw new Error('unbalanced block from index ' + startIdx);
}
function extractFn(src, name) {
  const at = src.indexOf('\n  function ' + name + '(');
  if (at < 0) throw new Error('function ' + name + ' not found in home.html');
  return sliceBlock(src, at + 1);
}

const html = fs.readFileSync(SRC, 'utf8');
const fns = vm.runInNewContext(
  extractFn(html, '_txvTallyType') + '\n'
  + extractFn(html, '_txvTypeOf') + '\n'
  + extractFn(html, '_txvHeadline') + '\n'
  + '({ tally: _txvTallyType, typeOf: _txvTypeOf, headline: _txvHeadline })',
  { console: console }, { filename: 'home.html:_txvHeadline' });

const bucket = (types) => {
  const b = { types: {} };
  (types || []).forEach((t) => fns.tally(b, { Type: t }));
  return b;
};
const head = (code, types) => fns.headline(fns.typeOf(bucket(types)), META[code] || {});

/* ---- the pairings, as measured in the demo databases --------------------- */

console.log('-- titles that do NOT repeat their type keep the full title --');
// Both of the owner's own examples. Measured: MTO is 100% Mfg, Transfers carries
// Sales and Purchasing.
eq('MTO  / Mfg',   head('MTO',  ['Mfg', 'Mfg']),          'Mfg - Make to Order');
eq('TRF  / Sales', head('TRF',  ['Sales']),               'Sales - Transfer Orders');
eq('ACCT / Mfg',   head('ACCT', ['Mfg']),                 'Mfg - Account Mismatch');
eq('CNJ  / Mfg',   head('CNJ',  ['Mfg']),                 'Mfg - Completion Not Journaled');

console.log('-- titles that DO repeat their type are stripped to the short --');
eq('MCM / Mfg',       head('MCM', ['Mfg']),           'Mfg - Cost Mismatch');
eq('SAC / Sales',     head('SAC', ['Sales']),         'Sales - DMAAI Net Zero');
eq('IAC / Inventory', head('IAC', ['Inventory']),     'Inventory - DMAAI Net Zero');
eq('ICO / Sales',     head('ICO', ['Sales']),         'Sales - Intercompany');
eq('DUP / Sales',     head('DUP', ['Sales']),         'Sales - Duplicates');
// ⚠ NOT 'Sales - Non-Stock Lines'. That short shipped for an hour on 2026-09-12
// and sat directly above 'Sales - Non-Stock Charge Lines', reading as the general
// case above its subset when the two are siblings with different tests and
// different work (usp8_txv_flags blocks F and K). The headline has to keep a
// contrast with the charge-line card, which the assertion below pins.
eq('NSL / Sales',     head('NSL', ['Sales']),         'Sales - Non-Stock Cost on Inventory');
eq('NCL / Sales',     head('NCL', ['Sales']),         'Sales - Non-Stock Charge Lines');
eq('the two non-stock cards do not read as one another',
   head('NSL', ['Sales']) !== head('NCL', ['Sales'])
   && head('NSL', ['Sales']).indexOf('Charge') < 0, true);
eq('SNJ / Sales',     head('SNJ', ['Sales']),         'Sales - Not Journaled');

console.log('-- the two the regex gets wrong --');
// 1. "Inventory" in this title is the ACCOUNT, not the type. Vouchers measure
//    100% Purchasing in all three databases, so the type word is absent and the
//    full title has to survive intact.
eq('VCHR / Purchasing keeps "on Inventory"',
   head('VCHR', ['Purchasing']), 'Purchasing - A/P Voucher on Inventory');
// 2. The catalogue says "Manufacturing"; RCLC2 says "Mfg". Same word, and the
//    strip has to know it.
eq('T-MFG / Mfg strips "Manufacturing"',
   head('T-MFG', ['Mfg']), 'Mfg - Unclassified');

console.log('-- the other three terminals --');
eq('T-SALES / Sales',      head('T-SALES', ['Sales']),      'Sales - Unclassified');
eq('T-PURCH / Purchasing', head('T-PURCH', ['Purchasing']), 'Purchasing - Unclassified');
eq('T-INV / Inventory',    head('T-INV',   ['Inventory']),  'Inventory - Unclassified');

console.log('-- a short is NOT applied to a type it was not written for --');
// The short on DUP drops the word "Sales". A DUP card whose rows came back Mfg
// must keep the full title rather than silently lose it.
eq('DUP / Mfg keeps the full title', head('DUP', ['Mfg']), 'Mfg - Duplicate Sales');

console.log('-- more than one type on a card --');
// Offsetting Entries on Demo1 carries Sales and Purchasing. Nothing single to
// strip, so the full title stands.
eq('OFF / Sales + Purchasing', head('OFF', ['Sales', 'Purchasing', 'Sales']),
   'Mixed - Offsetting GL Entries');
eq('PER / Inventory + Purchasing', head('PER', ['Inventory', 'Purchasing']),
   'Mixed - Period Mismatch');

console.log('-- a blank Type cannot manufacture a Mixed --');
// RCLC2 carries blank Type on real rows in all three databases. A blank counted
// as its own key would read as a second type and label a clean card "Mixed".
eq('blank + Sales stays Sales', head('DUP', ['Sales', '', '  ', 'Sales']), 'Sales - Duplicates');
eq('blank alone tallies nothing', Object.keys(bucket(['', '   ']).types).length, 0);
eq('every row blank -> bare title', head('MCM', ['', '']), 'Mfg Cost Mismatch');
eq('no rows at all -> bare title', head('MCM', []), 'Mfg Cost Mismatch');

console.log('-- an unknown card code still renders a name --');
eq('unknown code', fns.headline('Sales', {}), 'Sales - Other Variance');

/* ---- the control -------------------------------------------------------- */
// Restores the regex strip, in BOTH of the shapes it is actually written in.
//
// ⚠ THE FIRST DRAFT OF THIS CONTROL USED ONE REGEX AND FAILED, CORRECTLY. One
// regex does not produce both symptoms -- and the reason it does not is the
// whole point of the pair:
//
//   Variant A strips the card's MEASURED type word. It leaves the voucher title
//   alone (the word "Purchasing" is not in it), so it looks fine. It cannot see
//   that "Manufacturing" and "Mfg" are the same type, so T-MFG keeps its
//   duplicate.
//
//   Variant B is what you write to FIX that: give it the type vocabulary so
//   "Manufacturing" is recognised. Now it strips any vocabulary word wherever it
//   appears -- and "Inventory" in "A/P Voucher on Inventory" names the account,
//   so that card mangles.
//
// So B is the natural repair of A, and it trades one silent defect for a worse
// one. Each variant must reproduce its own symptom or the assertion it stands
// behind is measuring nothing.
console.log('-- CONTROL: the two regex strips, each mangling its own card --');

// A: strip the measured type word only.
function regexA(ty, m) {
  const full = (m && m.title) || 'Other Variance';
  if (!ty || ty === 'Mixed') return full;
  return ty + ' - ' + full.replace(new RegExp('\\s*' + ty + '\\s*', 'i'), ' ')
                          .replace(/\s+/g, ' ').replace(/^[\s—-]+|[\s—-]+$/g, '').trim();
}
// B: strip any word in the type vocabulary.
const VOCAB = /\s*(Purchasing|Manufacturing|Inventory|Sales|Mfg)\s*/ig;
function regexB(ty, m) {
  const full = (m && m.title) || 'Other Variance';
  if (!ty || ty === 'Mixed') return full;
  return ty + ' - ' + full.replace(VOCAB, ' ')
                          .replace(/\s+/g, ' ').replace(/^[\s—-]+|[\s—-]+$/g, '').trim();
}

let controlOk = true;
const ctlA = regexA('Mfg', META['T-MFG']);          // must KEEP the duplicate
const ctlB = regexB('Purchasing', META['VCHR']);    // must MANGLE the account name

if (ctlA === 'Mfg - Unclassified') {
  controlOk = false;
  console.log('  FAIL  variant A stripped "Manufacturing" on its own, so the T-MFG'
            + '\n          assertion above is not measuring anything.');
}
if (ctlB === 'Purchasing - A/P Voucher on Inventory') {
  controlOk = false;
  console.log('  FAIL  variant B left the voucher title intact, so the VCHR'
            + '\n          assertion above is not measuring anything.');
}
if (controlOk) {
  console.log('  ok    both variants reproduce their defect');
  console.log('          A, T-MFG -> ' + JSON.stringify(ctlA) + '   (duplicate survives)');
  console.log('          B, VCHR  -> ' + JSON.stringify(ctlB) + '   (account name eaten)');
} else {
  failures++;
}

console.log(failures === 0 ? '\nPASS  all assertions held' : '\nFAIL  ' + failures + ' assertion(s)');
process.exit(failures === 0 ? 0 : 1);
