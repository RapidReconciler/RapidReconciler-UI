/*
 * FIXTURE for Tools/check_txv_cards.py --self-test. No page loads this file.
 *
 * Same catalog as valid.config.fixture.js with ONE difference: TXI carries an
 * `alsoChecked` array holding a bare string. `alsoChecked` was split out of
 * `checked` on 2026-08-15 so a detected card's "What happened" leads with the
 * detection instead of the screens and guards. Both arrays hold citations and
 * both must be id-validated -- an `alsoChecked` that accepted bare prose would
 * turn the split into a laundering route for exactly the unbacked claims the
 * gate exists to stop. This fixture is that rule's proof.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var META = {
    'TLM': {
      title: 'Transfer Leg Missing', kind: 'rebalance', tier: 'single',
      finding: {
        mech: 'The transfer moved on one side and not the other.',
        checked: [
          { a: 'TLM.oneleg', t: 'Item-ledger rows for the document: one. The paired leg never wrote.' },
          { a: 'TLM.cardexonly', t: 'GL side is zero, the cardex side is not. Confirmed.' }
        ]
      }
    },
    'TXI': {
      title: 'Transfer Integrity', kind: 'rebalance', tier: 'single',
      finding: {
        mech: 'Both legs wrote, at a unit cost of zero.',
        checked: [
          { a: 'TXI.pricedzero', t: 'Unit cost on the transfer line: zero.' }
        ],
        alsoChecked: [
          'Both legs present. Missing leg ruled out.'
        ]
      }
    }
  };

  var SUBTYPE = { 'transfer leg missing': 'TLM', 'transfer integrity': 'TXI' };
  window.RRV8.txv = { META: META, SUBTYPE: SUBTYPE };
})();
