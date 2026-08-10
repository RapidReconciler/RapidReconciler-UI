/*
 * INVALID FIXTURE for Tools/check_txv_cards.py --self-test.
 * Identical to valid.config.fixture.js except TXI's second checked entry cites a
 * real assertion with no analyst text. Exactly one violation.
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var META = {
    'TLM': {
      title: 'Transfer Leg Missing', kind: 'rebalance', tier: 'single',
      finding: {
        dmaai: true,
        flag: 'One leg only',
        mech: 'The transfer moved on one side { and not the other }.',
        checked: [
          { a: 'TLM.oneleg', t: 'Item-ledger rows for the document: one. The paired leg never wrote.' },
          { a: 'TLM.cardexonly', t: 'GL side is zero, the cardex side isn\'t. Confirmed.' }
        ],
        context: [
          'A transfer normally writes two legs. True, but not tested on this row.'
        ]
      }
    },
    'TXI': {
      title: 'Transfer Integrity', kind: 'rebalance', tier: 'single',
      finding: {
        flag: 'Priced at zero',
        checked: [
          { a: 'TXI.pricedzero', t: 'Unit cost on the transfer line: zero.' },
          { a: 'TXI.pairpresent', t: '   ' }
        ]
      }
    },
    'CNJ': {
      title: 'Completion Not Journaled', kind: 'self', tier: 'single',
      finding: {
        flag: 'No GL completion',
        checked: [
          { a: 'TLM.oneleg', t: 'Ruled out a transfer leg first: TLM claims ahead of this card.' }
        ]
      }
    }
  };

  window.RRV8.txv = { META: META };
})();
