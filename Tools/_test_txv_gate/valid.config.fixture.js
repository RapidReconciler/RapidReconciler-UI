/*
 * FIXTURE for Tools/check_txv_cards.py --self-test. No page loads this file.
 *
 * Deliberately adversarial against the extractor: this comment carries braces
 * { } and a lone apostrophe ' , the card copy below carries braces inside a
 * string value and an escaped quote, and there is a brace in a // comment.
 * If any of those miscount, the card and checked-entry totals move and the
 * self-test says so.
 *
 * Shape the self-test asserts: 3 cards, 5 checked entries, plus both warning
 * paths (an unreferenced manifest id, and a card citing another card's ids).
 */
window.RRV8 = window.RRV8 || {};
(function () {
  var META = {
    'TLM': {
      title: 'Transfer Leg Missing', kind: 'rebalance', tier: 'single',
      cause: 'One leg of the transfer wrote to the item ledger; the other never did.',
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
        ],
        fix: ['Write the missing leg at the source and re-run the company and period.']
      }
    },
    // A brace inside a line comment, which must not count: }
    'TXI': {
      title: 'Transfer Integrity', kind: 'rebalance', tier: 'single',
      finding: {
        flag: 'Priced at zero',
        mech: 'Both legs wrote, at a unit cost of zero.',
        checked: [
          { a: 'TXI.pricedzero', t: 'Unit cost on the transfer line: zero.' },
          { a: 'TXI.pairpresent', t: 'Both legs present. Missing leg ruled out.' }
        ]
      }
    },
    /* Precedence claim: cites another card's assertion on purpose, so the
       foreign-prefix warning path is covered. Braces here too: } { */
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

  var SUBTYPE = { 'transfer leg missing': 'TLM', 'transfer integrity': 'TXI' };
  window.RRV8.txv = { META: META, SUBTYPE: SUBTYPE };
})();
