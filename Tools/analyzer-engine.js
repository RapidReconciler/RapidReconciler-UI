/* ====================================================================
   RR ANALYZER ENGINE  --  shared, browser-loadable analysis engine.

   Factored out of Tools/analysis-workbook.html so a second page
   (RRV8/home.html) can run the SAME Transaction-Detail analysis on
   transaction rows fetched from an API instead of a dropped .xlsx.

   Plain-browser IIFE -- NO ES module import/export, NO build step.
   Load via <script src="analyzer-engine.js"></script> BEFORE the code
   that uses RRAnalyzerEngine. Attaches a single global:

     window.RRAnalyzerEngine = {
       Helpers, Priority, CostMethodKnowledge, DMAAIKnowledge,
       txdModuleForDt, txdAppliesToModule, TXD,
       buildTransactionDetailData, analyzeTransactionDetail
     }

   Everything under a "moved verbatim" marker is copied byte-for-byte
   from analysis-workbook.html. Do NOT edit logic here without mirroring
   the analyzer page (and vice versa).

   External (page-provided) dependency, referenced only through guarded
   `typeof SystemContext !== "undefined"` checks: SystemContext (the
   per-session F4095 DMAAI cache). When absent -- as on home.html -- the
   guarded branches degrade to generic phrasing exactly as they do on the
   analyzer page before a JDE workbook is preloaded.
==================================================================== */
(function () {
  "use strict";

/* ---- moved verbatim: Priority (was analysis-workbook.html 1172-1184) ---- */
const Priority = {
  fromRatio(ratio) {
    if (ratio >= 0.5) return 1;
    if (ratio >= 0.1) return 2;
    return 3;
  },
  actionLabel(p) {
    return p === 1 ? 'investigate immediately' : p === 2 ? 'review within 1 business day' : 'low priority — include in next backlog';
  },
  colors(p) {
    return p === 1 ? PALETTE.P1 : p === 2 ? PALETTE.P2 : PALETTE.P3;
  }
};

/* ---- moved verbatim: CostMethodKnowledge (was 3063-3116) ---- */
const CostMethodKnowledge = {
  // UDC 40/CM Cost Methods. Each entry: name, type, manufacturing note.
  // type is one of 'standard' | 'actual' | 'planning' | 'valuation' —
  // drives whether the analyzer treats the method as standard or actual
  // when deciding which Pattern 5.17 hypothesis to lead with, etc.
  methods: {
    '01': { name: 'Last-In Cost',           type: 'actual',    note: 'Most recent purchase or receipt cost.' },
    '02': { name: 'Weighted Average Cost',  type: 'actual',    note: 'Average inventory cost across receipts. Vouchers route AAI 4330 variance to inventory; cardex carries a revaluation row.' },
    '03': { name: 'Weighted Average Update',type: 'actual',    note: 'Variant of 02 used in specific update scenarios.' },
    '04': { name: 'Planned Cost',           type: 'planning',  note: 'Simulated or planning cost.' },
    '05': { name: 'Future Cost',            type: 'planning',  note: 'Future / next-period costing.' },
    '06': { name: 'Lot Cost',               type: 'actual',    note: 'Cost by specific lot.' },
    '07': { name: 'Standard Cost',          type: 'standard',  note: 'Frozen standard from F30026. Vouchers route AAI 4330 variance to expense; F4111 untouched on the voucher.' },
    '08': { name: 'Purchasing Cost',        type: 'actual',    note: 'Used for purchasing transactions.' },
    '09': { name: 'Manufacturing Last Cost',type: 'actual',    note: 'Actual manufacturing cost from latest completion. Revalues inventory at work-order completion.' },
    '10': { name: 'Manual Cost',            type: 'actual',    note: 'User-maintained cost.' },
    '11': { name: 'Lower of Cost or Market',type: 'valuation', note: 'Financial / reporting valuation.' },
    '12': { name: 'Current Cost',           type: 'valuation', note: 'Current replacement or market cost.' },
    '13': { name: 'FIFO Cost',              type: 'actual',    note: 'First-in, first-out.' },
    '14': { name: 'LIFO Cost',              type: 'actual',    note: 'Last-in, first-out.' },
    '15': { name: 'Forecast Cost',          type: 'planning',  note: 'Forecasted or estimated future cost.' }
  },

  // Resolve a raw Ext value (string, possibly with whitespace) to a
  // method entry. Returns null when the value is empty, unrecognized,
  // or the F4111 row predates the 2026-05 sproc update.
  resolve(extValue) {
    if (extValue == null) return null;
    const code = String(extValue).trim().padStart(2, '0');
    return this.methods[code] ? { code, ...this.methods[code] } : null;
  },

  // Short display label for output cards — "02 (Weighted Average Cost)".
  label(extValue) {
    const m = this.resolve(extValue);
    return m ? `${m.code} (${m.name})` : null;
  },

  // True when the method is the standard-costing regime (07). Used by
  // Pattern 5.17 to confirm the std-cost branch when F4111 detail exists
  // (rare on PV under std cost, but happens on other doc types).
  isStandard(extValue) {
    const m = this.resolve(extValue);
    return m ? m.type === 'standard' : false;
  },

  // True when the method is one of the actual-costing regimes (02, 09,
  // 13, 14, etc.). Used by Pattern 5.17 to confirm the WA branch when
  // F4111 detail rows are present on a voucher.
  isActual(extValue) {
    const m = this.resolve(extValue);
    return m ? m.type === 'actual' : false;
  }
};

/* ---- moved verbatim: DMAAIKnowledge (was 3128-3388) ---- */
const DMAAIKnowledge = {
  // Table descriptions used in both templates' narrative output.
  tableDesc: {
    '3110': 'Raw Material WIP — Material Issues (IM)',
    '3120': 'Work In Process (WIP)',
    '3130': 'WIP Completions (IC)',
    '4122': 'Inventory Valuation Account — Balance Sheet inventory for Issues / Transfers / Adjustments / Reclassifications (P4112 / P4113 / P4114 / P4116)',
    '4124': 'Expense / COGS Account — credit side of 4122. Can also serve as the COGS credit on some Sales Order flows where customers route through 4124 instead of the standard 4240/4220 pair.',
    '4126': 'Zero Balance Inventory Offset — used when qty=0 but dollars remain',
    '4128': 'Zero Balance Expense Offset — credit side of 4126',
    '4134': 'Item Balance Cost Change Inventory Offset — Quantity Revisions (P41022), Item Branch/Plant (P41026), Batch Cost Maintenance (P41802)',
    '4136': 'Item Balance Cost Change Expense Offset — credit side of 4134',
    '4141': 'Standard Cost Variance on Inventory Transfers (P4113) — fires when From and To branches carry different standard costs',
    '3240': 'Material Variance — WIP / standard cost change after completion',
    '3260': 'Planned Variance — WIP / standard cost change after completion',
    '4152': 'Physical Inventory Update Inventory Offset — Cycle Count (P41413), Tag Count (P41610)',
    '4154': 'Physical Inventory Update Expense Offset — credit side of 4152',
    '4162': 'Cross-Company Inventory Transfer (IX)',
    '4164': 'Average Cost Update — COGS Side (credit side of 4162 in JDE configs that use 4162 for avg cost)',
    '4172': 'Physical Inventory Adjustment (IJ)',
    '4174': 'Batch Cost Maintenance Expense Offset — Future Cost Update (P41052), credit side of 4172',
    '4182': 'Bulk Product Gain/Loss Inventory Offset',
    '4184': 'Bulk Product Gain/Loss Expense Offset — credit side of 4182',
    '4220': 'COGS / Inventory Relief. In standard sales orders 4220 is the COGS debit paired against 4240 (inventory credit). On ST transfer-order shipments 4220 is repurposed as "COGS — Branch Transfers" — still the debit half of a sales-side wash pair against 4240, but offsetting branch-A inventory rather than recognising real COGS. NOT the in-transit clearing account; that role belongs to 4245 on the ST side and 4320 on the OT side.',
    '4225': 'COGS Performance Liability (intermediate before COGS recognition)',
    '4230': 'Sales Revenue. In ST/OT transfers, 4230 is used as a wash account — revenue and A/R both net to zero so no real revenue is booked for an internal move.',
    '4240': 'Cost of Goods Sold',
    '4245': 'Inventory in Transit DEBIT on ST transfer-order shipments. Labeled "A/R Trade" in F4095 (its role in regular Sales Orders) but for ST doc-type rows it is repurposed as the in-transit clearing debit. Per JDE convention the BU is hard-coded to a company-wide value so the in-transit account is consistent regardless of shipping branch. Must resolve to the same account as 4320 (OT receipt credit) for the in-transit clearing to net to zero across an ST/OT pair. On the revenue side of regular transfers 4245 still washes against 4230 to net zero.',
    '4310': 'Inventory on PO Receipt (OR)',
    '4335': 'Standard-Cost Variance on PO Receipt — fires when received cost differs from inventory cost; commonly paired with 4337 landed cost',
    '4337': 'Material Burden (freight, duty, etc. — always credit)',
    '4365': 'Supplier Direct Ship / Outside Operations Settlement',
    '4385': 'Outbound Logistics',
    '4400': 'Intercompany / Advanced Pricing'
  },

  // Diagnosis text for IC "Standard Cost Change After Work Order Completion".
  // Mirrors Pattern 5.9 in AnalysisGuides/transaction-detail-analysis.md —
  // R30822 (Frozen Cost Update) changed the standard cost in F4105 after
  // the completion posted. R30837 (WIP Revaluation) is what bridges the
  // F4111 cardex side and the F0911 GL side; it writes BOTH the
  // "Standard Cost Change" row AND its GL counterpart. The cardex row
  // exists here, so R30837 partially ran — the GL write failed. Cause is
  // usually a missing variance AAI (3240 / 3260), a Closed-status WO
  // (R30837 skips them — typically NxtSts 90 in UDC 00/SS but values are
  // customer-defined), or a processing-options gap. NOT a missing AAI
  // lookup for the inventory leg. The fix is a manual JE crediting AAI
  // 3260 (Planned Variance) or 3240 (Material Variance) — not 4141,
  // which is the standard-cost variance AAI for non-manufacturing
  // inventory docs (II / IT / IR).
  //
  // aaiContext (optional): when SystemContext is loaded, this carries the
  // result of looking up AAI 3240 / 3260 for the customer's company / GL
  // class. Possible shapes:
  //   - null            — SystemContext not loaded; fall back to generic.
  //   - { status: 'configured', accounts: [...] }
  //                     — at least one of 3240 / 3260 IS configured; we
  //                       can name the actual GL account.
  //   - { status: 'missing' }
  //                     — SystemContext loaded but neither AAI is
  //                       configured for this company / GL class — this
  //                       is a real configuration gap, not a sequencing
  //                       one, and the diagnosis flips accordingly.
  icStandardCostChangeExplanation(dt, amount, invAccount, cardexDocNum, glDocNum, aaiContext) {
    const bullets = [];
    const dtTxt = dt ? `on this ${dt} (work order completion) doc` : 'on this work order completion';
    bullets.push(`• F4111 captured a Standard Cost Change of ${amount} ${dtTxt}, but no F0911 counterpart was built — neither on inventory (${invAccount || 'the inventory account'}) nor on an expense / variance account; the completion itself posted normally, only the cost-revaluation half is missing`);
    if (aaiContext && aaiContext.status === 'missing') {
      bullets.push(`• The loaded DMAAI integrity report shows AAI 3240 (Material Variance) AND 3260 (Planned Variance) are both unconfigured for this company / GL class — R30837 (WIP Revaluation) has no destination account to write to, so the cardex revaluation runs but the GL side can't follow (this is a configuration gap, not a process-sequencing gap)`);
    } else {
      bullets.push(`• R30837 (WIP Revaluation) writes both the F4111 "Standard Cost Change" cardex row AND its F0911 GL counterpart. The cardex row exists here, so R30837 partially fired — the GL side never wrote. Cause is usually: the variance AAI (3240 Material / 3260 Planned) isn't configured for this routing, the WO has reached its Closed status in UDC 00/SS (typically 90; values are customer-defined and R30837 skips closed WOs), or R30837's processing options suppress the GL write`);
    }
    if (cardexDocNum && glDocNum && cardexDocNum !== glDocNum) {
      bullets.push(`• Cardex shows doc ${cardexDocNum} while the GL completion entry references doc ${glDocNum} — that's normal R31802A behavior (completions are summarized into a separate GL document), not the cause`);
    }
    return bullets.join('\n');
  },

  // signedAmount: the orphan F4111 row's cardex amount, KEEPING sign.
  // Positive = cost went up (Dr Inventory / Cr Variance). Negative
  // inverts (Cr Inventory / Dr Variance). Caller passes orphan.cardexAmt
  // directly. The matrix renderer formats Dr/Cr presentation; this
  // helper just feeds it numeric amounts.
  icStandardCostChangeResolution(invAccount, signedAmount, aaiContext) {
    const invAcct = invAccount || 'the inventory account';

    // Build the JE-flow matrix data once for both branches. The matrix
    // shows the corrective entry against the inventory account and the
    // variance AAI. Signed amounts: Dr = +, Cr = -. The orphan cardex
    // sign drives direction: positive cardex (cost went up) means
    // inventory needs a debit + variance a credit; negative inverts it.
    const dr  = signedAmount || 0;          // signed amount on inventory
    const cr  = -dr;                          // opposite on variance
    let varLabel = 'Manufacturing Variance';
    let varIdent = 'AAI 3240 / 3260';
    if (aaiContext && aaiContext.status === 'configured' && aaiContext.accounts && aaiContext.accounts.length) {
      const a = aaiContext.accounts[0];
      varLabel = a.description || varLabel;
      varIdent = `AAI ${a.table} → ${a.longAccount || a.account}`;
    } else if (aaiContext && aaiContext.status === 'missing') {
      varIdent = '[AAI 3240 / 3260 — NOT CONFIGURED]';
    }
    const matrix = {
      columns: [
        { role: 'inventory', label: 'Inventory (WIP / FG)', identifier: invAcct },
        { role: 'variance',  label: varLabel,                identifier: varIdent }
      ],
      scenarios: [
        { label: 'What R30837 should have posted', amounts: [dr,   cr] },
        { label: 'What F0911 actually posted',     amounts: [null, null] },
        { label: 'Corrective entry',               amounts: [dr,   cr] },
        { label: 'End Result',                     amounts: [dr,   cr], endResult: true }
      ]
    };

    if (aaiContext && aaiContext.status === 'missing') {
      // Configuration gap — Step 1 is "configure the AAI first."
      return [
        { type: 'prose', text: `Step 1.  Configure the manufacturing variance AAI in JDE. Add a row to DMAAI table 3240 (Material Variance) or 3260 (Planned Variance) — whichever your cost-accounting team uses for standard-cost revaluation — for the affected company and GL class. Without this entry, R30837 has no destination and can't post the missing GL counterpart even when it fires.` },
        { type: 'prose', text: `Step 2.  Re-export the DMAAI integrity report (Integrity Report 0) from RapidReconciler and reload it on this analyzer page so future runs pick up the new AAI configuration.` },
        { type: 'prose', text: `Step 3.  Post a manual JE to correct the historic posting on this document. Step 1 prevents future occurrences; this JE clears the existing variance:` },
        { type: 'jeFlowMatrix', matrix },
        { type: 'prose', text: `Step 4.  Review R30837 (WIP Revaluation) configuration. R30837 needs to be called from R30822 (Frozen Cost Update) — confirm the processing option is set to launch it. Even with the AAI now configured, the sequencing issue can recur unless R30837 actually fires.` },
        { type: 'prose', text: `Step 5.  Refresh RapidReconciler and re-analyze. The variance should clear once the AAI is configured and the JE is posted.` }
      ];
    }

    return [
      { type: 'prose', text: `Step 1.  Check the work-order status in JDE. If the WO has reached Closed status in UDC 00/SS (typically 90 — values are customer-defined; check your shop's order activity rules), R30837 won't revalue it even if re-run, so the manual JE in Step 3 is the only correction path. If the WO is still active, both R30837 reconfig and the manual JE are viable.` },
      { type: 'prose', text: `Step 2.  If the WO is still open, review R30837 (WIP Revaluation) configuration. R30837 needs to be called from R30822 (Frozen Cost Update) — confirm the processing option is set to launch it. Fixing this prevents future occurrences but doesn't clear the historic variance on this doc.` },
      { type: 'prose', text: `Step 3.  Post a manual JE to correct the historic posting on this document:` },
      { type: 'jeFlowMatrix', matrix },
      { type: 'prose', text: `Step 4.  Assess materiality before posting. This pattern frequently produces aged variances dating back months or years (the gap isn't detected until reconciliation review). Very old or small amounts may warrant suspension rather than a JE.` },
      { type: 'prose', text: `Step 5.  Refresh RapidReconciler and re-analyze. The variance should clear; if R30837 was reconfigured in Step 2, future standard-cost changes on open WOs will build their GL entries correctly.` }
    ];
  },

  /* Look up the configured GL accounts for AAI 3240 (Material Variance) and
     3260 (Planned Variance) — the two manufacturing variance AAIs Pattern
     5.6's resolution names. Returns one of:
       - { status: 'configured', accounts: [...] }
           when at least one of 3240 / 3260 is configured in the loaded
           DMAAI integrity report for this company / GL class.
       - { status: 'missing' }
           when SystemContext is loaded but neither AAI is configured —
           a real configuration gap.
       - null
           when SystemContext is not loaded; caller falls back to the
           generic "credit AAI 3240/3260" text.
     Doc type is intentionally not part of the lookup: 3240 / 3260
     configuration is keyed on company + GL class in the integrity
     report, and the wildcard '****' on glclass is handled by
     SystemContext.lookupAAI. */
  mfgVarianceAaiContext(company, glClass) {
    if (typeof SystemContext === 'undefined' || !SystemContext.isLoaded()) return null;
    if (!company) return null;
    const accounts = [];
    for (const table of ['3240', '3260']) {
      const row = SystemContext.lookupAAI({ company, table, glClass });
      if (row && row.aaiaccount) {
        accounts.push({
          table,
          account:     row.aaiaccount,
          longAccount: row.longaccount || row.aaiaccount,
          description: table === '3240' ? 'Material Variance' : 'Planned Variance',
        });
      }
    }
    return accounts.length ? { status: 'configured', accounts } : { status: 'missing' };
  },

  /* Look up AAI 4330 (Purchase Price Variance) for a given company / GL
     class and decide whether the customer is on standard cost or weighted
     average. Used by Pattern 5.17 (PV Voucher Variance on Inventory) to
     answer the diagnostic fork:
       - 4330 routes to an INVENTORY account → weighted-average customer
       - 4330 routes to an EXPENSE account  → standard-cost customer
     Returns one of:
       - { status: 'std-cost',     account, longAccount, isInventoryAccount: false }
       - { status: 'weighted-avg', account, longAccount, isInventoryAccount: true }
       - { status: 'missing' }      when SystemContext is loaded but 4330
                                    isn't configured for this routing
       - null                       when SystemContext isn't loaded
     The "is inventory account" determination uses RR's own inventory-
     account list from SystemContext (the same logic RR's mirror uses to
     filter F0911 imports). If we can't decide cleanly, we err on the side
     of 'missing' so the caller falls back to presenting both hypotheses. */
  purchaseVarianceAaiContext(company, glClass) {
    if (typeof SystemContext === 'undefined' || !SystemContext.isLoaded()) return null;
    if (!company) return null;
    const row = SystemContext.lookupAAI({ company, table: '4330', glClass });
    if (!row || !row.aaiaccount) return { status: 'missing' };
    const acct = row.aaiaccount;
    const longAccount = row.longaccount || acct;
    // SystemContext.rowsByAccount returns F4095 rows that reference this
    // account elsewhere. If we see this account configured on AAIs in the
    // 41xx range (inventory tables: 4124, 4126, 4134, 4172, 4240, 4310,
    // 4320, etc.), it's an inventory account → weighted avg. Otherwise
    // expense → std cost.
    const otherUses = SystemContext.rowsByAccount(acct) || [];
    const inventoryUses = otherUses.filter(r => /^41\d\d$/.test(String(r.tablenumber || '').trim()));
    const isInventoryAccount = inventoryUses.length > 0;
    return {
      status: isInventoryAccount ? 'weighted-avg' : 'std-cost',
      account: acct,
      longAccount,
      isInventoryAccount
    };
  },

  // Known net-zero complement pairs — debit AAI / credit AAI on the
  // inventory side. docTypes lists the JDE document types whose posting
  // flows through that pair, so a Transaction Detail export can be
  // mapped to the likely DMAAI pair from its doc-type field.
  pairs: [
    { debit: '4122', credit: '4124', docTypes: ['IA','II','IJ','IL','IM','IP','IR','IV'] },
    { debit: '4126', credit: '4128', docTypes: ['VV','OV','OP'] },
    { debit: '4134', credit: '4136', docTypes: ['IB'] },
    { debit: '4240', credit: '4220', docTypes: ['SO','SD','RM'] }
  ],

  pairForDocType(dt) {
    const upper = String(dt || '').toUpperCase().trim();
    if (!upper) return null;
    return this.pairs.find(p => p.docTypes.includes(upper)) || null;
  },

  // Plain-language explanation of why a net-zero F0911 posting is the
  // fingerprint of a misrouted DMAAI complement AAI. Used by the
  // Transaction Detail template's pattern 5.5.
  netZeroExplanation(pair, dt) {
    if (!pair) {
      return [
        `• F0911 has a debit and a matching credit on the same inventory account — they net to zero, so no GL impact lands for this document`,
        `• Cardex was written normally (F4111 reflects the transaction), but the inventory account is unchanged even though inventory has moved — symptom of a DMAAI complement-pair both pointing at the same account`
      ].join('\n');
    }
    const debitDesc  = (DMAAIKnowledge.tableDesc[pair.debit]  || '').replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
    const creditDesc = (DMAAIKnowledge.tableDesc[pair.credit] || '').replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
    return [
      `• F0911 shows a debit and matching credit on the same inventory account — they self-cancel; no net GL impact recorded`,
      `• ${dt || pair.docTypes[0]} routes through DMAAI ${pair.debit} (${debitDesc}) / ${pair.credit} (${creditDesc}); both AAIs are pointing at the same account, so every transaction of this type posts a Dr and Cr of equal magnitude that net to zero`,
      `• Cardex (F4111) is correct, but the inventory account doesn't move even though inventory has`
    ].join('\n');
  },

  // Resolution path — keyed to which side is wrong (the credit side is
  // almost always the one that should point at a separate offset).
  netZeroResolution(pair) {
    const base   = pair ? `${pair.debit} / ${pair.credit}` : 'the affected DMAAI pair';
    const debit  = pair ? pair.debit  : 'the debit AAI';
    const credit = pair ? pair.credit : 'the complement AAI';
    return [
      `Step 1.  Open DMAAI in JDE (fast path DMAAI) and look up the ${base} entries for this company and GL class. Confirm both point to the same account — that's the configuration error producing the net-zero posting.`,
      `Step 2.  Confirm with the cost-accounting team whether the net-zero configuration is intentional. Intentional clearing-account setups exist but are rare on inventory tables.`,
      `Step 3.  If unintentional, update the credit-side entry (${credit}) to point to the correct offsetting account — typically the expense / variance account for this transaction type, not the inventory account that ${debit} already uses.`,
      `Step 4.  Post a manual JE to correct historical GL postings that routed through the wrong account. Use RR's Transactions page for the affected items to confirm exact amounts before posting.`,
      `Step 5.  Refresh RapidReconciler and re-analyze. The variance should clear once the AAI is corrected and the historical JE is posted.`
    ].join('\n\n');
  }
};

/* ---- moved verbatim: Helpers (was 4285-4355) ---- */
const Helpers = {
  num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v.result !== undefined) return Number(v.result) || 0;
    const n = Number(String(v).replace(/[,$\s]/g, ''));
    return isNaN(n) ? 0 : n;
  },
  str(v) {
    if (v == null) return '';
    if (typeof v === 'object' && v.text) return String(v.text).trim();
    if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim();
    return String(v).trim();
  },
  money(n, signed = false) {
    if (n == null || isNaN(n)) return '$0.00';
    const s = '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (signed && n > 0 ? '+' : (n < 0 ? '−' : '')) + s;
  },
  count(n) {
    return n.toLocaleString('en-US');
  },
  groupBy(arr, fn) {
    const out = {};
    arr.forEach(item => { const k = fn(item); if (!out[k]) out[k] = []; out[k].push(item); });
    return out;
  },
  dateMs(d) {
    if (!d) return null;
    if (d instanceof Date) return d.getTime();
    const t = new Date(d).getTime();
    return isNaN(t) ? null : t;
  },
  ageDays(d, reference) {
    const a = Helpers.dateMs(d);
    const b = Helpers.dateMs(reference) || Date.now();
    if (!a) return null;
    return Math.max(0, Math.floor((b - a) / 86400000));
  },
  todayStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  todayPretty() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  },
  /** Read normalized lowercase headers from row 1 or 2; the matching row is returned in `headerRowNum`. */
  readHeaders(ws, anchorCols) {
    const anchors = anchorCols.map(s => s.toLowerCase());
    for (const headerRow of [1, 2, 3]) {
      const row = ws.getRow(headerRow);
      const h = [];
      for (let c = 1; c <= 30; c++) {
        const v = row.getCell(c).value;
        if (v == null) continue;
        h.push(String(typeof v === 'object' ? v.text || v.result || v : v).toLowerCase().replace(/\s+/g, '').trim());
      }
      if (anchors.some(a => h.includes(a))) return { headers: h, headerRowNum: headerRow };
    }
    return { headers: [], headerRowNum: 1 };
  },
  /** Build a lookup function that returns the cell value for a given lowercased header name */
  cellGetter(ws, headers) {
    const colIdx = h => headers.indexOf(h.toLowerCase()) + 1;
    return (row, h) => {
      const idx = colIdx(h);
      if (idx <= 0) return null;
      return ws.getRow(row).getCell(idx).value;
    };
  }
};

/* ---- moved verbatim: TXD module maps + txdModuleForDt / txdAppliesToModule (was 5349-5399) ---- */
const TXD_MODULE_BY_DT = {
  // Inventory adjustments / moves / physical / cost change
  IA: 'inventory', II: 'inventory', IJ: 'inventory', IL: 'inventory',
  IP: 'inventory', IR: 'inventory', IV: 'inventory', IB: 'inventory',
  // Manufacturing (WO completion / labor / scrap / material issue to WO)
  IC: 'mfg', IH: 'mfg', IS: 'mfg', IM: 'mfg',
  // Sales (orders / returns / credits)
  SO: 'sales', SD: 'sales', SH: 'sales', SI: 'sales',
  RI: 'sales', RM: 'sales', CR: 'sales', CO: 'sales', RC: 'sales', RE: 'sales', SR: 'sales',
  // Purchasing (PO receipts / vouchers)
  OP: 'purchasing', OV: 'purchasing', OW: 'purchasing', PV: 'purchasing',
  // Transfers (between branches / in-transit)
  ST: 'transfers', OT: 'transfers', IT: 'transfers', TR: 'transfers',
  // General / G/L (manual journals, unknown)
  JE: 'general'
};

const TXD_PATTERN_MODULES = {
  // Universal — any module's doc can trigger these
  '5.1':  ['all'],   // Unassigned Account (missing model table entry)
  '5.2':  ['all'],   // GL-Only Entry
  '5.3':  ['all'],   // Cardex-Only Entry
  '5.4':  ['all'],   // Account Mismatch (also runs as secondary)
  '5.5':  ['all'],   // Net-Zero DMAAI Pair
  '5.11': ['all'],   // GL Excess / Cross-WO Summary (fallback)
  '5.14': ['all'],   // Period Mismatch (also runs as secondary)
  // Manufacturing-only
  '5.6':  ['mfg'],   // Standard Cost Change after WO completion
  '5.15': ['mfg'],   // R31802A orphan cardex row
  '5.16': ['mfg'],   // Manufacturing Cost Mismatch (cardex vs GL unit cost)
  '5.20': ['mfg'],   // Completion Not Journaled — WO IC cardex-only, no GL completion
  // Sales-only
  '5.7':  ['sales'], // Mixed Line Types on return doc
  '5.13': ['sales'], // Post-Confirm Order Edit
  '5.18': ['sales', 'transfers'], // Duplicate shipment — same order line relieved twice
  // Purchasing-only
  '5.17': ['purchasing'], // Voucher Variance on Inventory (PV under std cost)
  // Transfers-only
  '5.19': ['transfers'] // Transfer Integrity — IT cardex-only, item-ledger integrity error
};

/* Resolve a doc type to its module name. Returns 'general' for unknown
   DTs so the classifier still runs the universal patterns. */
function txdModuleForDt(dt) {
  if (!dt) return 'general';
  return TXD_MODULE_BY_DT[String(dt).toUpperCase().trim()] || 'general';
}

/* Does a pattern apply to a given module? Universal patterns ('all')
   match every module; module-specific patterns match only their list. */
function txdAppliesToModule(pattern, module) {
  const modules = TXD_PATTERN_MODULES[pattern] || ['all'];
  return modules.indexOf('all') !== -1 || modules.indexOf(module) !== -1;
}

/* ====================================================================
   TXD  --  Transaction-Detail ANALYSIS methods, moved verbatim from the
   TransactionDetailTemplate object on the analyzer page. Only the
   ExcelJS-coupled members stayed behind (detect / _findSheet / parse /
   _parseOrdersSection / filename / render / _renderJeFlowMatrix /
   _renderHowSections). These pure methods reference each other through
   `this`, so keeping them on one object preserves the call graph
   unchanged.
==================================================================== */
const TXD = {
  /* ---- _notesContext (was 5414-5422) ---- */
  _notesContext(data) {
    return {
      doc:      data && data.doc,
      dt:       data && data.dt,
      filename: data && data.doc
        ? `Transaction Detail Analysis for ${data.doc} ${data.dt || ''}.xlsx`.trim()
        : null,
    };
  },

  /* ---- classify (was 5606-6322) ---- */
  classify(data) {
    // variance/ratio/priority are `let` (not const) because Pattern 5.4
    // (Account Mismatch) overrides them after detection — the doc's net
    // variance can be $0 even when there's a real misposting to clean
    // up, so for that pattern the headline number becomes the misposted
    // amount, not the net.
    let variance = data.variance;
    const cardex = data.f4111Tot;
    const ledger = data.f0911InvTot;
    const denom = Math.max(Math.abs(cardex), Math.abs(ledger)) || 1;
    let ratio = Math.abs(variance) / denom;
    let priority = Priority.fromRatio(ratio);

    // Module for this doc (inventory / mfg / sales / purchasing / transfers /
    // general). Used by the if/else chain below to early-exit branches whose
    // pattern doesn't apply — e.g., a sales doc skips the mfg-only detectors.
    const module = txdModuleForDt(data.dt);
    const inModule = p => txdAppliesToModule(p, module);

    // Account-mismatch context — populated in the 5.4 branch and read
    // by the WHAT / HOW / evidence code below. Stays null for every
    // other pattern.
    let _accountMismatchMispostedAmt = 0;
    let _accountMismatchExpectedAcct = null;
    let _accountMismatchPostedAcct   = null;
    let _accountMismatchRatio        = null;
    // Populated in the 5.3 branch when the PARTIAL cardex-only variant fires
    // (one unmirrored account inside an otherwise-posted batch). Stays null
    // for the full variant and every other pattern.
    let _partialCardexOnly           = null;
    // Sign of the F4111 cardex amount on the "expected" row. Drives Dr/Cr
    // direction in the corrective JE: negative = inventory side should be
    // a credit in the original transaction (IM, IA, II, SO/ST shipment),
    // positive = inventory side should be a debit (IC, OP, PV, RM).
    let _accountMismatchCardexSign   = 0;

    // Net-zero F0911 fingerprint — a debit and credit of equal magnitude
    // on the SAME inventory account that cancel each other within the
    // F0911 Inv section. This is the signature of a DMAAI complement-AAI
    // misroute (e.g. 4134 and 4136 both pointing at the inventory account
    // instead of 4136 pointing at expense). Detected two ways, either is
    // enough to fire:
    //
    //   A. STRUCTURAL — find a pair of rows on the same account with
    //      ledger amounts that sum to ~$0. Survives a residual on a
    //      third row (the cancel pair contributes $0 to the net so
    //      the section as a whole can still be non-zero).
    //
    //   B. EXPLICIT — the DMAAIs section at the bottom of the export
    //      already flags the issue with a comment like
    //      "Net zero review - 4134,4136". This is the strongest signal
    //      because the export itself names the AAIs involved.
    //
    // Either signal preempts pattern 5.3 (Cardex-Only — would otherwise
    // misdiagnose this as a missing GL entry) and 5.4 (generic
    // account/period mismatch — too vague to actually help the user).
    const findCancellingPair = rows => {
      for (let i = 0; i < rows.length; i++) {
        for (let j = i + 1; j < rows.length; j++) {
          const ri = rows[i], rj = rows[j];
          if (!ri.account || ri.account !== rj.account) continue;
          const ai = ri.ledgerAmt || 0, aj = rj.ledgerAmt || 0;
          if (Math.abs(ai + aj) < 0.01 && Math.abs(ai) > 0.01) {
            return ai > 0 ? { debitRow: ri, creditRow: rj } : { debitRow: rj, creditRow: ri };
          }
        }
      }
      return null;
    };
    const cancellingPair = findCancellingPair(data.f0911Inv);

    let explicitPair = null;
    let explicitDmaaRow = null;
    const dmaaNZ = data.dmaas.find(r => /net.?zero.*review/i.test(r.comment || ''));
    if (dmaaNZ) {
      explicitDmaaRow = dmaaNZ;
      const m = String(dmaaNZ.comment).match(/(\d{4})\D+(\d{4})/);
      if (m) {
        const a = m[1], b = m[2];
        explicitPair = DMAAIKnowledge.pairs.find(p =>
          (p.debit === a && p.credit === b) || (p.debit === b && p.credit === a)
        ) || { debit: a, credit: b, docTypes: [data.dt] };
      }
    }

    const isNetZeroPair = Math.abs(cardex) >= 0.01 && (cancellingPair || explicitPair);

    // "Standard Cost Change After Work Order Completion" fingerprint.
    // Documented as Pattern 5.9 in AnalysisGuides/transaction-detail-analysis.md.
    //
    // Fingerprint: IC doc + an F4111 row with a Standard-Cost-Change
    // comment that has no matching F0911 counterpart on either side +
    // the document variance equals that orphan amount exactly.
    //
    // Cause (per the canonical guide): R30822 (Frozen Cost Update)
    // changed the standard cost in F4105 after the completion posted.
    // R30837 (WIP Revaluation) is the program that bridges the cardex
    // and GL sides — it wrote the F4111 "Standard Cost Change" row but
    // its F0911 counterpart didn't complete. Cause: the variance AAI
    // (3240 / 3260) isn't configured for this routing, R30837's
    // processing options suppress the GL write, or the WO has reached
    // its Closed status in UDC 00/SS (typically 90; values are
    // customer-defined and R30837 skips closed WOs).
    //
    // Scoped to IC because the R30822/R30837 sequencing only applies to
    // manufacturing completions. For II / IT / IR docs the same orphan-row
    // shape can occur but the cause is different (typically AAI 4141
    // standard-cost variance on the inventory side) — that case is not
    // handled here and falls through to the generic patterns 5.4 / 5.11.
    const isStandardCostChangeComment = c => /standard\s+cost\s+change/i.test(c || '');
    const orphanRevalRow = (data.dt && /^IC$/i.test(data.dt))
      ? (function() {
          for (const r of data.f4111Rows) {
            if (!isStandardCostChangeComment(r.comment)) continue;
            if (Math.abs(r.cardexAmt || 0) < 0.01) continue;
            const amt = r.cardexAmt;
            const hasGL = data.f0911Inv.some(g => Math.abs((g.ledgerAmt || 0) - amt) < 0.01)
                       || data.f0911Exp.some(g => Math.abs((g.ledgerAmt || 0) + amt) < 0.01);
            if (!hasGL) return r;
          }
          return null;
        })()
      : null;
    const isICStandardCostChange = orphanRevalRow
      && Math.abs(Math.abs(variance) - Math.abs(orphanRevalRow.cardexAmt)) < 0.01;

    // R31802A orphan cardex row — the broader manufacturing variant.
    //
    // Fingerprint: doc is a manufacturing type (IC / IM / IH / IS), one
    // of the F4111 rows has a cardex amount equal to the document
    // variance, AND that row has no matching F0911 entry on the same
    // account (within rounding). The remaining F4111 rows reconcile to
    // the F0911 total.
    //
    // What's happening: R31802A (Manufacturing Accounting) processed
    // most of the document's F4111 rows into F0911 but skipped this
    // one. R31802A's *real-world* causes for skipping a row are well
    // documented:
    //   - "Already processed" flags set on the row (re-runs won't
    //     re-post)
    //   - Selection / version filtering excluded the row
    //   - Zero net variance to post (nothing to GL)
    //   - Errors during processing (AAI / account-lookup failures)
    //   - Interrupted / partial run (rare but possible)
    // AND there's a critical caveat: RR filters F0911 at import time,
    // so the GL row may legitimately exist in JDE outside RR's view.
    // For that reason the resolution does NOT blindly recommend a JE
    // — it walks the analyst through the five real causes above and
    // tells them to check R31802A's report (errors / warnings /
    // skipped counts) before concluding the GL is actually missing.
    //
    // Fires BEFORE the period-mismatch detector below — both can
    // produce 2 RR Summary rows but only this one has the orphan
    // amount = document variance signature. Fires AFTER the IC SCC
    // detector above so the more specific "standard cost change after
    // WO completion" diagnosis (Pattern 5.6) wins when its narrower
    // fingerprint matches.
    const MFG_DOC_TYPES = /^(IC|IM|IH|IS)$/i;
    const r31802aOrphanRow = (data.dt && MFG_DOC_TYPES.test(data.dt))
      ? (function() {
          const targetVar = Math.abs(variance);
          if (targetVar < 0.01) return null;
          for (const fr of data.f4111Rows) {
            const amt = Math.abs(fr.cardexAmt || 0);
            if (Math.abs(amt - targetVar) > 0.01) continue;
            // Does any F0911 row (Inv side) match this F4111 row by
            // account + amount? If yes, this F4111 row isn't orphaned.
            const hasGL = data.f0911Inv.some(g =>
              String(g.account || '').trim() === String(fr.account || '').trim() &&
              Math.abs(Math.abs(g.ledgerAmt || 0) - amt) < 0.01
            );
            if (!hasGL) return fr;
          }
          return null;
        })()
      : null;
    const isR31802aOrphan = r31802aOrphanRow && !isICStandardCostChange;

    // Pattern 5.16 — Manufacturing Cost Mismatch.
    //
    // Fingerprint: doc is a manufacturing completion type (IC / IH / IS),
    // both F4111 cardex and F0911 GL have meaningful entries (so 5.2 / 5.3
    // don't catch), and the implied per-unit cost differs by 5x or more
    // between the two sides. This is the signature of standard-vs-actual
    // cost drift: cardex captured the completion at one cost (frozen
    // standard, or pre-revaluation), GL posted at another (work-order
    // actual, or post-revaluation), and the variance is the gap.
    //
    // Why a unit-cost comparison instead of an absolute-amount check:
    // F4111 carries qty + unit cost per row; F0911 doesn't carry quantity.
    // We can infer the GL-implied per-unit cost by dividing the F0911 inv
    // total by the F4111 qty total. If the two implied per-unit costs
    // diverge sharply, it's a cost-basis mismatch, not a cross-WO summary
    // or a posting issue.
    //
    // Fires AFTER 5.6 (the narrower "Standard Cost Change" comment-based
    // detection wins on its specific fingerprint) and 5.15 (orphan-row
    // wins on its specific signature). Fires BEFORE 5.4 (Account
    // Mismatch) and 5.14 (Period Mismatch) — those detectors require
    // multiple distinct accounts / periods, which cost-mismatch cases
    // typically don't have (all rows on the same WIP/FG account, same
    // period). Cost mismatch also wins over 5.11's "GL excess / cross-WO
    // summary" fallback, which would otherwise misdiagnose this as a
    // summarization issue.
    const MFG_COMPLETION_DTS = /^(IC|IH|IS)$/i;
    const mfgCostMismatch = (() => {
      if (!data.dt || !MFG_COMPLETION_DTS.test(data.dt)) return null;
      if (Math.abs(cardex) < 0.01 || Math.abs(ledger) < 0.01) return null;
      // Sum qty across the F4111 rows for this doc. Use absolute value
      // because IS (scrap) is negative-qty.
      const qtyTotal = data.f4111Rows.reduce((s, r) => s + Math.abs(r.qty || 0), 0);
      if (qtyTotal < 0.01) return null;
      const cardexAbs = Math.abs(cardex);
      const ledgerAbs = Math.abs(ledger);
      const implCardexUC = cardexAbs / qtyTotal;
      const implLedgerUC = ledgerAbs / qtyTotal;
      if (implCardexUC < 1e-6 || implLedgerUC < 1e-6) return null;
      const ratio = Math.max(implCardexUC / implLedgerUC, implLedgerUC / implCardexUC);
      if (ratio < 5) return null;
      return { qtyTotal, cardexAbs, ledgerAbs, implCardexUC, implLedgerUC, ratio };
    })();
    const isMfgCostMismatch = mfgCostMismatch != null;

    // Pattern 5.17 — Voucher Variance on Inventory.
    //
    // A PV (P4314 voucher match) doc with no F4111 cardex AND F0911
    // entries on an inventory-side account. Under standard costing, AAI
    // 4330 (Purchase Price Variance) should route to an EXPENSE account
    // — voucher variance is expensed, not capitalized. Under weighted
    // average, 4330 routes to inventory AND F4111 captures a revaluation
    // row. So `F4111 empty + F0911 on inventory` is wrong for either
    // method:
    //   - std cost:   variance was misrouted to inventory (4330 override
    //                 at posting time, or 4330 misconfigured)
    //   - weighted avg: cardex revaluation row missing (P4314 didn't
    //                 write F4111 for some reason)
    //
    // The detector ALSO fetches AAI 4330's resolved account from the
    // preloaded F4095 (if loaded) so the explanation can declare which
    // case applies. Without preload, both hypotheses surface.
    //
    // Fires BEFORE Pattern 5.2 (GL-Only Entry) so the specific PV
    // diagnosis wins over the generic "F0911 has stuff, F4111 doesn't"
    // fallback. The 5.2 generic still fires for non-voucher cases.
    const isVoucherVariOnInv = (
      data.dt === 'PV'
      && (data.f4111Rows || []).length === 0
      && (data.f0911Inv || []).length > 0
    );
    const voucherVariContext = isVoucherVariOnInv
      ? DMAAIKnowledge.purchaseVarianceAaiContext(data.company, data.glclass)
      : null;

    // Pre-computed structural checks for Pattern 5.4 (Account Mismatch)
    // and Pattern 5.14 (Period Mismatch). These two patterns are simple
    // facts about the RR Summary rows — "are there 2+ distinct accounts?"
    // and "are there 2+ distinct periods?" — and they can co-occur with
    // each other AND with any other pattern. So they're computed once,
    // used as primary-classification fallbacks AT THE END of the if/else
    // chain (the existing behavior), and ALSO surfaced as secondary
    // findings on whatever the primary pattern is. A doc whose primary
    // diagnosis is, say, 5.16 (Mfg Cost Mismatch) but also spans two
    // periods gets a "Period mismatch also detected" callout below the
    // HOW card so the analyst factors that into the corrective JE's date.
    // Account strings arrive PADDED out of the export -- the subsidiary is
    // space-filled, e.g. '10.1310  .110' with two spaces before '.110'
    // (measured on a production export 2026-09-02). Every account comparison
    // in this file must go through this, because comparing raw treats padding
    // variants as distinct accounts.
    const normAcct = a => String(a || '').replace(/\s+/g, ' ').trim();

    // Per-account exposure across the RR Summary.
    //
    // WHY THIS GROUPING EXISTS, and it is the whole correction. The RR Summary
    // is the PRE-NETTING representation (Section 0 of the analysis guide:
    // RCardexLedgerCompare holds both sides of every transaction;
    // RCardexLedgerCompare2 is what survives netting). A MATCHED account
    // therefore appears as a pair of MIRROR ROWS at the same (account, batch)
    // grain -- one row carrying the cardex amount with a zero ledger, one
    // carrying the equal ledger amount with a zero cardex. Measured on a
    // production manufacturing document: 7 of its 8 accounts were mirror pairs
    // netting to zero, which is normal, not a defect.
    //
    // Reading rows one at a time cannot tell a mirror half from a misposting.
    // Reading the ACCOUNT can: a matched account shows both sides and nets, a
    // misposted account is one-sided.
    const acctExposure = (() => {
      const m = new Map();
      for (const r of data.rrSummary) {
        const k = normAcct(r.account);
        if (!k) continue;
        if (!m.has(k)) m.set(k, { acct: k, raw: r.account, cardex: 0, ledger: 0, rows: [] });
        const e = m.get(k);
        e.cardex += (r.cardexAmt || 0);
        e.ledger += (r.ledgerAmt || 0);
        e.rows.push(r);
      }
      for (const e of m.values()) {
        e.cardexOnly = Math.abs(e.cardex) >= 0.01 && Math.abs(e.ledger) < 0.01;
        e.ledgerOnly = Math.abs(e.ledger) >= 0.01 && Math.abs(e.cardex) < 0.01;
        // Both sides present and equal in absolute value: the mirror-pair
        // shape. These rows are MATCHED and cannot be either half of a
        // misposting.
        e.mirrored = Math.abs(e.cardex) >= 0.01 && Math.abs(e.ledger) >= 0.01
                     && Math.abs(Math.abs(e.cardex) - Math.abs(e.ledger)) < 0.01;
      }
      return Array.from(m.values());
    })();

    // Pattern 5.4 -- Account Mismatch.
    //
    // SELECTION RULE, stated explicitly because the previous one read as
    // deliberate and was not. It took "the first row of each shape" and never
    // checked that the two rows were on DIFFERENT accounts, so on a document
    // whose summary is mostly mirror pairs it reported the first account
    // against ITSELF -- a corrective JE between an account and itself, with
    // prose asserting "only the account differs".
    //
    // The pattern requires, per guide section 5.4 and cross-section rule 2:
    // the cardex landed on one account, the GL landed on a DIFFERENT one, and
    // the amounts agree in absolute value so the document nets to zero. So:
    //   * candidates are ACCOUNTS that are one-sided (mirrored accounts are
    //     matched and are excluded by construction),
    //   * pair a cardex-only account with a ledger-only account,
    //   * require the magnitudes to agree,
    //   * require the normalized accounts to DIFFER.
    // No pair means no account mismatch. There is no fallback to row 0 -- a
    // fallback is what manufactured the false positive.
    const accountMismatchCheck = (() => {
      if (data.rrSummary.length <= 1) return null;
      const cardexOnly = acctExposure.filter(e => e.cardexOnly);
      const ledgerOnly = acctExposure.filter(e => e.ledgerOnly);
      if (!cardexOnly.length || !ledgerOnly.length) return null;

      let best = null;
      for (const cx of cardexOnly) {
        for (const lg of ledgerOnly) {
          if (cx.acct === lg.acct) continue;               // the missing guard
          const delta = Math.abs(Math.abs(cx.cardex) - Math.abs(lg.ledger));
          if (delta >= 0.01) continue;                     // magnitudes must agree
          if (!best || delta < best.delta) best = { cx, lg, delta };
        }
      }
      if (!best) return null;

      const expectedRow = best.cx.rows.find(r => Math.abs(r.cardexAmt || 0) >= 0.01) || best.cx.rows[0];
      const ghostRow    = best.lg.rows.find(r => Math.abs(r.ledgerAmt || 0) >= 0.01) || best.lg.rows[0];
      return {
        mispostedAmt: Math.abs(best.lg.ledger),
        expectedAcct: best.cx.raw,      // where the cardex landed
        postedAcct:   best.lg.raw,      // where the GL went instead
        cardexSign:   Math.sign(best.cx.cardex || 0),
        expectedRow, ghostRow,          // the rows the evidence list must cite
        accounts: acctExposure.map(e => e.raw)
      };
    })();

    // Pattern 5.3 -- PARTIAL cardex-only.
    //
    // Guide section 5.3 documents two variants. The full one is
    // "F4111 total non-zero AND F0911 total = 0", which the chain below
    // already tests on the DOCUMENT totals. The partial one is
    // "F0911 total non-zero but smaller than F4111 for the same GL class and
    // batch, and one or more RR Summary rows show cardex non-zero with ledger
    // zero", and the section's own callout says to "compare totals at the GL
    // class and batch level, not just at the document level".
    //
    // Nothing implemented that. So a document with several matched mirror-pair
    // accounts PLUS one genuinely unmirrored cardex-only account has a
    // non-zero document ledger total, fails the full test, falls past 5.3
    // entirely, and used to be claimed by the unguarded 5.4 above.
    //
    // Gated on the mismatch check being null so guide line 718's precedence
    // holds -- account mismatch outranks cardex-only "when both differ on the
    // same doc". That keeps the chain order untouched: the defect was this
    // predicate's grain, never the ordering.
    const partialCardexOnlyCheck = (() => {
      if (accountMismatchCheck) return null;
      if (!data.rrSummary.length) return null;
      // Unmirrored, one-sided, cardex-carrying accounts, largest first.
      const orphans = acctExposure
        .filter(e => e.cardexOnly && !e.mirrored)
        .sort((a, b) => Math.abs(b.cardex) - Math.abs(a.cardex));
      if (!orphans.length) return null;
      const total = orphans.reduce((a, e) => a + e.cardex, 0);
      if (Math.abs(total) < 0.01) return null;
      return {
        accounts: orphans.map(e => ({
          acct: e.raw,
          cardex: e.cardex,
          batches: Array.from(new Set(e.rows.map(r => r.batch).filter(Boolean))),
          rows: e.rows
        })),
        total,
        primary: orphans[0]
      };
    })();
    const periodMismatchCheck = (() => {
      if (data.rrSummary.length <= 1) return null;
      const periodKey = r => {
        const p = r && r.period;
        if (p == null) return null;
        if (p instanceof Date) return p.toISOString().slice(0, 10);
        return String(p).trim().slice(0, 10);
      };
      const periods = new Set(data.rrSummary.map(periodKey).filter(Boolean));
      if (periods.size < 2) return null;
      return { periods: Array.from(periods) };
    })();

    // Mixed line types on a return / credit doc.
    //
    // Fingerprint: doc type is a return/credit type (RI, RM, CR, RE, SR)
    // AND the Orders section (if present) shows at least one stock line
    // (LineTy = S, has F4111) AND at least one non-stock line (LineTy != S,
    // no F4111) on the SAME doc. JDE DMAAIs route by order type + GL class
    // only — they don't see line type — so when both line kinds share an
    // order type, the dollars-only credit lines get posted through the
    // inventory-route AAI just like the stock returns do.
    //
    // Gated on data.orders being non-empty — many exports don't include an
    // Orders section, and we can't make this determination without it. When
    // the section is missing, the doc falls through to existing patterns
    // (typically 5.3 cardex-only) unchanged.
    //
    // Fires BEFORE pattern 5.3 so the cardex-only "go post the unposted
    // batch" guidance doesn't preempt this. Posting the batch as-is would
    // push the misrouted credits into GL and make cleanup harder.
    const RETURN_DOC_TYPES = /^(RI|RM|CR|RE|SR)$/i;
    const ordersForThisDoc = (data.orders || []).filter(o => o.doc === data.doc);
    const lineTypesOnDoc = new Set(ordersForThisDoc.map(o => o.linety).filter(Boolean));
    const stockLines = ordersForThisDoc.filter(o => o.linety === 'S');
    const nonStockLines = ordersForThisDoc.filter(o => o.linety && o.linety !== 'S');
    const isLineTypeMix = data.dt
      && RETURN_DOC_TYPES.test(data.dt)
      && ordersForThisDoc.length >= 2
      && stockLines.length >= 1
      && nonStockLines.length >= 1
      && lineTypesOnDoc.size >= 2;

    // Post-ship-confirm order edit fingerprint.
    //
    // F4111 (the cardex) is written immediately at ship-confirm from the
    // warehouse's pick. R42800 (Sales Update) runs later and books the GL
    // from the CURRENT F4211 line quantity. When someone modifies the
    // order line in between, the cardex stays frozen at the confirmed
    // qty while the GL gets the post-edit qty — producing a variance
    // equal to (post-edit qty - confirmed qty) × unit cost per line.
    //
    // Documented as Pattern 5.13 in AnalysisGuides/transaction-detail-analysis.md.
    //
    // Fingerprint requires the Orders section (so we can see post-edit
    // qty) AND a sales-family order type (so we know R42800 is the
    // GL-posting program). We then check three signals together:
    //
    //   1. The order's stock lines are past ship-confirm (NxtSts >= 540
    //      in JDE's status progression — 540 = ship-confirm, 560 =
    //      inventory-relieved, 600 = invoiced, 999 = closed).
    //   2. The GL inventory total matches what the order math predicts
    //      (Σ qty × unitcost across stock lines, within rounding). This
    //      is the "GL trusted the order" signal.
    //   3. The cardex total is materially less than the GL — the
    //      "cardex is short" signal. The variance equals the qty delta
    //      × unit cost.
    //
    // Gated tightly because the same shape can also arise from a partial-
    // shipment that genuinely intends two F4111 writes (one at confirm,
    // one after a backorder fills) where R42800 hasn't fully posted yet.
    // The NxtSts >= 540 check rules out the in-flight case; the
    // ledger-matches-order check rules out the not-yet-posted case.
    const SALES_ORDER_TYPES = /^(SO|ST|SD|RM|CR|CO)$/i;
    const stockOrdersForDoc = ordersForThisDoc
      .filter(o => !o.linety || o.linety === 'S');
    const shipConfirmedStockOrders = stockOrdersForDoc.filter(o => {
      const sts = parseInt(o.nxtsts || '0', 10);
      return sts >= 540;
    });
    const orderExpectedDollars = shipConfirmedStockOrders.reduce(
      (sum, o) => sum + Math.abs(o.qty || 0) * Math.abs(o.unitcost || 0),
      0
    );
    const orderQtyTotal = shipConfirmedStockOrders.reduce(
      (sum, o) => sum + Math.abs(o.qty || 0), 0
    );
    const cardexQtyTotal = data.f4111Rows.reduce(
      (sum, r) => sum + Math.abs(r.qty || 0), 0
    );
    const isPostConfirmOrderEdit = (
      shipConfirmedStockOrders.length >= 1 &&
      data.ot && SALES_ORDER_TYPES.test(data.ot) &&
      orderExpectedDollars > 0.01 &&
      // Ledger matches the post-edit order math (within 5% for rounding).
      Math.abs(Math.abs(ledger) - orderExpectedDollars) < Math.max(0.05 * orderExpectedDollars, 0.05) &&
      // Cardex is materially short of the ledger (more than 2% gap).
      Math.abs(cardex) < Math.abs(ledger) * 0.98 &&
      Math.abs(cardex) >= 0.01 &&
      // Qty actually decreased between confirm and the current order
      // line state (rules out cost-only edits — those are a different
      // pattern). cardexQtyTotal < orderQtyTotal by a non-trivial amount.
      cardexQtyTotal < orderQtyTotal - 0.001
    );

    // Pattern 5.18 — Duplicate shipment on the same order line.
    // In JDE a partial shipment increments the order line (6.000 ->
    // 6.001 -> 6.100), so a single line relieves inventory through the
    // cardex ONCE. Two or more F4111 rows sharing the same
    // (ordernum, line) means the line was ship-confirmed twice — a
    // double relief, not a normal split. Sales Update (R42800) books GL
    // from the first occurrence of the line only, so the second relief
    // hits the cardex with no matching GL entry and the variance equals
    // its value. Fires BEFORE 5.7 (and well above the cardex-only /
    // GL-excess fallbacks) so the double-shipment story wins over the
    // mixed-line-types / generic diagnoses, which the same doc can also
    // satisfy. Gated to sales / transfer modules — the line-per-shipment
    // rule is a sales/transfer ship-confirm phenomenon.
    const dupShipGroups = this._duplicateShipmentGroups(data);
    const isDuplicateShipment = dupShipGroups.length > 0;

    // Pattern classification
    let pattern, patternLabel, patternExplanation;
    // Pattern 5.6 enrichment: if the loaded DMAAI integrity report tells us
    // which GL account AAI 3240 / 3260 resolves to for this customer (or
    // that neither AAI is configured), stash the result on findings so the
    // resolution-text path can pick it up later. null when no integrity
    // report is loaded — keeps the existing generic phrasing intact.
    let mfgVarianceAaiContext = null;
    if (inModule('5.1') && data.unassigned.length) {
      pattern = '5.1'; patternLabel = 'Unassigned Account — Missing Model Table Entry';
      patternExplanation = this._unassignedExplanation(data);
    } else if (inModule('5.18') && isDuplicateShipment) {
      pattern = '5.18'; patternLabel = 'Duplicate shipment — same order line relieved twice in the cardex';
      patternExplanation = this._duplicateShipmentExplanation(data, dupShipGroups);
    } else if (inModule('5.7') && isLineTypeMix) {
      pattern = '5.7'; patternLabel = 'Mixed line types on a return doc (DMAAI routes both through the same AAI)';
      patternExplanation = this._lineTypeMixExplanation(data, stockLines, nonStockLines);
    } else if (inModule('5.13') && isPostConfirmOrderEdit) {
      pattern = '5.13'; patternLabel = 'Order line edited between ship-confirm and Sales Update';
      patternExplanation = this._postConfirmOrderEditExplanation(data, shipConfirmedStockOrders, {
        orderExpectedDollars, orderQtyTotal, cardexQtyTotal
      });
    } else if (inModule('5.5') && isNetZeroPair) {
      pattern = '5.5'; patternLabel = 'Net-zero F0911 pair (DMAAI complement misrouted)';
      // Pick the most specific pair we know about: explicit comment in
      // the DMAAIs section wins, then doc-type lookup as fallback.
      const resolvedPair = explicitPair || DMAAIKnowledge.pairForDocType(data.dt);
      patternExplanation = DMAAIKnowledge.netZeroExplanation(resolvedPair, data.dt);
      // If we found the actual cancelling rows, prepend a concrete-amount
      // bullet so the diagnosis isn't abstract. Bullets style; sits on top
      // of the DMAAIKnowledge.netZeroExplanation bullets.
      if (cancellingPair) {
        const acct = cancellingPair.debitRow.account;
        const amt  = Helpers.money(Math.abs(cancellingPair.debitRow.ledgerAmt));
        patternExplanation = `• On this doc, ${amt} posted as Dr AND ${amt} posted as Cr — both to the same inventory account ${acct} — so the inventory side self-cancels\n` + patternExplanation;
      }
      // If F0911 Inv has a non-trivial residual after the cancelling pair,
      // call it out — the residual is a SEPARATE issue, not part of the
      // misroute, and the user shouldn't chase it as if it were.
      const residual = data.f0911InvTot;
      if (cancellingPair && Math.abs(residual) >= 0.01) {
        patternExplanation += `\n• Heads-up: the F0911 Inv section also contains a separate row of ${Helpers.money(residual)} that isn't part of the cancelling pair — that row is unrelated to this misroute and warrants its own investigation`;
      }
    } else if (inModule('5.17') && isVoucherVariOnInv) {
      pattern = '5.17'; patternLabel = 'Voucher Variance on Inventory (PV)';
      patternExplanation = this._voucherVariOnInvExplanation(data, voucherVariContext);
    } else if (inModule('5.2') && Math.abs(cardex) < 0.01 && Math.abs(ledger) >= 0.01) {
      pattern = '5.2'; patternLabel = 'GL-Only Entry (No Cardex)';
      patternExplanation = this._glOnlyExplanation(data);
    } else if (inModule('5.19') && String(data.dt || '').toUpperCase() === 'IT' && Math.abs(ledger) < 0.01 && Math.abs(cardex) >= 0.01) {
      // Transfer Integrity — an IT (inventory transfer) doc that relieved value on
      // the cardex with no GL. A within-branch location move should net to zero and
      // post no GL; a stuck cardex-only IT means the receipt leg carried a unit cost
      // but a zero extended cost, so a value-neutral move destroyed inventory value.
      // Fires BEFORE 5.3 so the item-ledger-integrity story wins over the generic
      // "cardex-only, go post the batch" diagnosis. Gate matches the classifier's
      // usp8_txv_flags claim (DT=IT + cardex-only) so all consumers agree.
      pattern = '5.19'; patternLabel = 'Transfer Integrity — inventory transfer relieved cardex value with no GL';
      patternExplanation = this._transferIntegrityExplanation(data);
    } else if (inModule('5.20') && String(data.dt || '').toUpperCase() === 'IC' && Math.abs(ledger) < 0.01 && Math.abs(cardex) >= 0.01) {
      // Completion Not Journaled — a work-order completion (IC) on the cardex with no GL
      // completion for the order. R31802A stamps the cardex batch AND writes the F0911
      // entries in the SAME step, so a batch on the row means the run already processed
      // the transaction; the same run clears the unaccounted units that drive its
      // selection, so there is NO repost. Fires BEFORE the generic cardex-only 5.3 so the
      // manufacturing-accounting story wins over "go post the batch". Gate matches the
      // classifier's usp8_txv_flags claim (mfg IC + cardex-only) so all consumers agree.
      pattern = '5.20'; patternLabel = 'Completion Not Journaled — work-order completion on the cardex, no GL completion found';
      patternExplanation = this._completionNotJournaledExplanation(data);
    } else if (inModule('5.3')
               && ((Math.abs(ledger) < 0.01 && Math.abs(cardex) >= 0.01)   // full variant: whole doc is cardex-only
                   || partialCardexOnlyCheck)) {                            // partial variant: one unmirrored account
      // Both variants report as 5.3 because the guide treats partial as a
      // variant of this pattern, not a separate one. The label distinguishes
      // them so the analyst is not told the whole document is unposted when
      // only one account is.
      const isPartial = !(Math.abs(ledger) < 0.01 && Math.abs(cardex) >= 0.01);
      pattern = '5.3';
      patternLabel = isPartial
        ? 'Cardex-Only Entry (No GL) — partial, one account within a posted batch'
        : 'Cardex-Only Entry (No GL)';
      patternExplanation = this._cardexOnlyExplanation(data, isPartial ? partialCardexOnlyCheck : null);
      if (isPartial) {
        // The headline must be the orphaned dollars, not the document net.
        // On a partial doc the matched mirror accounts contribute to both
        // totals and cancel, so the document variance already equals the
        // orphan total when the mirrors tie -- but it does NOT when they
        // don't, and then the document net is the wrong number to act on.
        // Numbers that drive a decision get produced once, here.
        _partialCardexOnly = partialCardexOnlyCheck;
      }
    } else if (inModule('5.6') && isICStandardCostChange) {
      pattern = '5.6'; patternLabel = 'Standard Cost Change after work order completion (R30837 / closed-WO)';
      // Pick up the GL completion doc number (if different from the cardex
      // doc) so the explanation can call out the R31802A summarization
      // as a normal aside, not the bug.
      const glCompletionRow = data.f0911Inv.find(g => /completed.*w\.?o/i.test(g.comment || '')) || data.f0911Inv[0];
      // If the customer's DMAAI integrity report is loaded, look up
      // AAI 3240 / 3260 for this company / GL class. The result drives
      // both the explanation (process-sequencing gap vs. configuration
      // gap) and the resolution text (named GL account vs. generic).
      mfgVarianceAaiContext = DMAAIKnowledge.mfgVarianceAaiContext(data.company, data.glclass);
      patternExplanation = DMAAIKnowledge.icStandardCostChangeExplanation(
        data.dt,
        Helpers.money(orphanRevalRow.cardexAmt, true),
        data.account || (data.f4111Rows[0] && data.f4111Rows[0].account) || '',
        data.doc,
        glCompletionRow && glCompletionRow.doc,
        mfgVarianceAaiContext
      );
    } else if (inModule('5.15') && isR31802aOrphan) {
      pattern = '5.15'; patternLabel = 'R31802A orphan cardex row';
      patternExplanation = this._r31802aOrphanExplanation(data, r31802aOrphanRow);
    } else if (inModule('5.16') && isMfgCostMismatch) {
      pattern = '5.16'; patternLabel = 'Manufacturing Cost Mismatch (cardex vs GL unit cost)';
      patternExplanation = this._mfgCostMismatchExplanation(data, mfgCostMismatch);
    } else if (inModule('5.4') && accountMismatchCheck) {
      // Account-mismatch wins as the PRIMARY pattern when no narrower
      // pattern matched. Period mismatch can co-occur and will surface
      // below as a secondary finding if it also applies.
      pattern = '5.4'; patternLabel = 'Account Mismatch';
      const { mispostedAmt, expectedAcct, postedAcct, cardexSign } = accountMismatchCheck;
      patternExplanation = this._accountMismatchExplanation(data, { mispostedAmt, expectedAcct, postedAcct });
      // Override the headline: a $0 net variance underplays the cleanup
      // size. Use the misposted dollars (the JE amount) instead, and
      // recompute priority off that.
      const denomMisp = Math.max(Math.abs(cardex), Math.abs(ledger), mispostedAmt) || 1;
      variance = mispostedAmt;
      ratio    = mispostedAmt / denomMisp;
      priority = Priority.fromRatio(ratio);
      _accountMismatchMispostedAmt = mispostedAmt;
      _accountMismatchExpectedAcct = expectedAcct;
      _accountMismatchPostedAcct   = postedAcct;
      _accountMismatchRatio        = ratio;
      _accountMismatchCardexSign   = cardexSign;
    } else if (inModule('5.14') && periodMismatchCheck) {
      pattern = '5.14'; patternLabel = 'Period Mismatch';
      patternExplanation = this._periodMismatchExplanation(data);
    } else {
      // Pattern 5.11 is the catch-all fallback — universal, always applies.
      pattern = '5.11'; patternLabel = 'GL-Excess or Cross-Work-Order Summarization';
      patternExplanation = this._glExcessExplanation(data);
    }

    // Evidence
    const evidence = [];
    if (data.docHeader) {
      evidence.push({ severity: 'Anchor', label: `Doc Header  →  Row ${data.docHeader.rowNumber}`, description: `Doc ${data.doc} (${data.dt}) · Order ${data.ordernum} (${data.ot}) · Company ${data.company} · ${Helpers.money(data.docHeader.ledgerAmt)}`, sourceRow: data.docHeader.rowNumber });
    }
    if (data.rrSummary[0]) {
      evidence.push({ severity: 'Anchor', label: `RR Summary  →  Row ${data.rrSummary[0].rowNumber}`, description: `Cardex ${Helpers.money(cardex)} · Ledger ${Helpers.money(ledger)} · Variance ${Helpers.money(variance, true)}`, sourceRow: data.rrSummary[0].rowNumber });
    }
    // Root cause from F4111 or F0911 depending on pattern
    if (pattern === '5.5') {
      // Surface the SPECIFIC cancelling pair (not just "first +/- rows" —
      // a residual on a third row could otherwise be picked here). If no
      // structural pair was found but the DMAAIs section explicitly
      // flagged the issue, the pair rows may not exist on this doc; just
      // surface the DMAAIs row as the anchor.
      if (cancellingPair) {
        const d = cancellingPair.debitRow, c = cancellingPair.creditRow;
        evidence.push({ severity: 'Root cause', label: `F0911 Inv (debit)  →  Row ${d.rowNumber}`, description: `Account ${d.account} · ${Helpers.money(d.ledgerAmt)}${d.comment ? '\n' + d.comment : ''}`, sourceRow: d.rowNumber });
        evidence.push({ severity: 'Root cause', label: `F0911 Inv (credit)  →  Row ${c.rowNumber}`, description: `Account ${c.account} · ${Helpers.money(c.ledgerAmt)}${c.comment ? '\n' + c.comment : ''}\nSame account as the debit row — the two self-cancel`, sourceRow: c.rowNumber });
      }
      if (explicitDmaaRow) {
        evidence.push({ severity: 'Root cause', label: `DMAAIs Net Zero flag  →  Row ${explicitDmaaRow.rowNumber}`, description: `${explicitDmaaRow.account || ''}${explicitDmaaRow.comment ? ' · ' + explicitDmaaRow.comment : ''}\nThe DMAAIs section on this export already flagged this pair — the misroute is reported by the integrity check that produced this Transaction Detail.`, sourceRow: explicitDmaaRow.rowNumber });
      }
    } else if (pattern === '5.6') {
      // Surface the orphan F4111 revaluation row — the one with cardex
      // activity but no matching F0911 counterpart.
      const r = orphanRevalRow;
      evidence.push({ severity: 'Root cause', label: `${r.dt || data.dt} doc ${r.doc || data.doc} (cardex revaluation)  →  Row ${r.rowNumber}`, description: `Cardex ${Helpers.money(r.cardexAmt)}${r.comment ? ' · ' + r.comment.trim() : ''}\nNo F0911 counterpart on either the inventory or expense side — variance equals this amount exactly.`, sourceRow: r.rowNumber });
    } else if (pattern === '5.7') {
      // Surface the stock + non-stock Orders rows side by side so the
      // user can see the mix concretely.
      for (const s of stockLines) {
        evidence.push({ severity: 'Root cause', label: `Order line ${s.line || '?'} (stock, LineTy ${s.linety})  →  Row ${s.rowNumber}`, description: `Doc ${s.doc} · OrdType ${s.ordtype} · qty ${s.qty}${s.item ? ' · ' + s.item : ''}\nStock line — has an F4111 cardex record for the real inventory return.`, sourceRow: s.rowNumber });
      }
      for (const n of nonStockLines) {
        evidence.push({ severity: 'Root cause', label: `Order line ${n.line || '?'} (non-stock, LineTy ${n.linety})  →  Row ${n.rowNumber}`, description: `Doc ${n.doc} · OrdType ${n.ordtype} · qty ${n.qty}${n.comment ? ' · ' + n.comment.trim() : ''}\nNon-stock line — no F4111 record, dollars-only. Sharing the order type with the stock line above sends both through the same DMAAI route.`, sourceRow: n.rowNumber });
      }
    } else if (pattern === '5.13') {
      // Surface each shipped stock order line paired with its cardex
      // counterpart so the qty delta is visible row-by-row. Matching is
      // by item (one item may have multiple F4111 rows for lot splits;
      // we aggregate qty across them).
      for (const o of shipConfirmedStockOrders) {
        const f4111Matches = data.f4111Rows.filter(f => o.item && f.item === o.item);
        const confirmedQty = f4111Matches.reduce((sum, f) => sum + Math.abs(f.qty || 0), 0);
        const orderQty = Math.abs(o.qty || 0);
        const unit = Math.abs(o.unitcost || 0);
        const deltaQty = orderQty - confirmedQty;
        const deltaDollars = deltaQty * unit;
        const itemTag = o.item ? ` · ${o.item}` : '';
        const stsTag = o.nxtsts ? ` · NxtSts ${o.nxtsts}` : '';
        evidence.push({
          severity: 'Root cause',
          label: `Order line ${o.line || '?'}${itemTag}  →  Row ${o.rowNumber}`,
          description:
            `Order qty ${orderQty} @ ${Helpers.money(unit)}${stsTag}\n` +
            `Cardex captured qty ${confirmedQty} (${f4111Matches.length} F4111 row${f4111Matches.length === 1 ? '' : 's'})\n` +
            `Delta: +${deltaQty} EA × ${Helpers.money(unit)} = ${Helpers.money(deltaDollars)} of GL inventory drawdown with no matching cardex movement.`,
          sourceRow: o.rowNumber
        });
        for (const f of f4111Matches) {
          evidence.push({
            severity: 'Related',
            label: `F4111 cardex line ${f.line || '?'}${f.item ? ' · ' + f.item : ''}  →  Row ${f.rowNumber}`,
            description: `qty ${f.qty} @ ${Helpers.money(Math.abs(f.unitcost || 0))} = ${Helpers.money(f.cardexAmt)} · written at ship-confirm — locked.`,
            sourceRow: f.rowNumber
          });
        }
      }
    } else if (pattern === '5.4') {
      // Surface the two RR Summary rows that disagree on account so the
      // analyst sees exactly which account got the cardex and which got
      // the GL post.
      // Cite the rows the DETECTOR chose, rather than re-deriving them here.
      // This block used to run its own copy of the same first-row-of-each-shape
      // search, so the evidence could name a different pair than the headline
      // -- and it carried the identical same-account defect.
      const expected = accountMismatchCheck && accountMismatchCheck.expectedRow;
      const posted   = accountMismatchCheck && accountMismatchCheck.ghostRow;
      if (expected) {
        evidence.push({
          severity: 'Root cause',
          label: `Expected account (cardex landed here)  →  Row ${expected.rowNumber}`,
          description: `${expected.account} · cardex ${Helpers.money(expected.cardexAmt)} · ledger ${Helpers.money(expected.ledgerAmt)}\nThis is where the inventory dollars belong — the F4111 cardex routed them correctly.`,
          sourceRow: expected.rowNumber
        });
      }
      if (posted) {
        evidence.push({
          severity: 'Root cause',
          label: `Misposted account (GL went here instead)  →  Row ${posted.rowNumber}`,
          description: `${posted.account} · cardex ${Helpers.money(posted.cardexAmt)} · ledger ${Helpers.money(posted.ledgerAmt)}\nThe GL post landed on this account; the JE in step 3 moves the dollars to the expected account above.`,
          sourceRow: posted.rowNumber
        });
      }
    } else if (pattern === '5.14') {
      // Period mismatch — surface the two RR Summary rows on different periods.
      const rows = data.rrSummary.slice(0, 2);
      for (const r of rows) {
        const periodStr = r.period && (r.period.toString ? r.period.toString().slice(0, 10) : r.period);
        evidence.push({
          severity: 'Root cause',
          label: `RR Summary row · period ${periodStr || '—'}  →  Row ${r.rowNumber}`,
          description: `${r.account} · cardex ${Helpers.money(r.cardexAmt)} · ledger ${Helpers.money(r.ledgerAmt)}\nSame account as the other row — only the period differs.`,
          sourceRow: r.rowNumber
        });
      }
    } else if (pattern === '5.15') {
      // Find the orphan F4111 row and surface it + the F0911 rows that
      // DID post so the analyst can see what reconciled and what
      // didn't. Use the local `variance` (not findings.variance) — the
      // findings object isn't assembled yet at this point in classify().
      const targetVar = Math.abs(variance);
      const orphan = data.f4111Rows.find(fr => {
        const amt = Math.abs(fr.cardexAmt || 0);
        if (Math.abs(amt - targetVar) > 0.01) return false;
        return !data.f0911Inv.some(g =>
          String(g.account || '').trim() === String(fr.account || '').trim() &&
          Math.abs(Math.abs(g.ledgerAmt || 0) - amt) < 0.01
        );
      });
      if (orphan) {
        evidence.push({
          severity: 'Root cause',
          label: `Orphan F4111 row (no F0911 counterpart in this report)  →  Row ${orphan.rowNumber}`,
          description: `${orphan.account} · cardex ${Helpers.money(orphan.cardexAmt)}${orphan.batch ? ' · batch ' + orphan.batch : ''}${orphan.comment ? '\n' + orphan.comment.trim() : ''}\nThe batch number and GL date on this row suggest JDE processed something. Check F0911 directly in JDE before concluding the GL entry is missing.`,
          sourceRow: orphan.rowNumber
        });
      }
      // Also show the matched F4111 + F0911 rows so the analyst sees
      // what reconciled cleanly.
      const matched = data.f4111Rows.filter(fr => fr !== orphan).slice(0, 2);
      for (const m of matched) {
        evidence.push({
          severity: 'Related',
          label: `F4111 row · reconciled  →  Row ${m.rowNumber}`,
          description: `${m.account} · cardex ${Helpers.money(m.cardexAmt)}${m.batch ? ' · batch ' + m.batch : ''} — has a matching F0911 entry on the same account.`,
          sourceRow: m.rowNumber
        });
      }
      if (data.f0911Inv[0]) {
        const g = data.f0911Inv[0];
        evidence.push({
          severity: 'Related',
          label: `F0911 Inv (what DID post)  →  Row ${g.rowNumber}`,
          description: `${g.account} · ledger ${Helpers.money(g.ledgerAmt)}${g.batch ? ' · batch ' + g.batch : ''} — accounts for the reconciled portion of the cardex.`,
          sourceRow: g.rowNumber
        });
      }
    } else if (pattern === '5.2' && data.f0911Inv[0]) {
      evidence.push({ severity: 'Root cause', label: `${data.f0911Inv[0].bt} doc ${data.f0911Inv[0].doc}  →  Row ${data.f0911Inv[0].rowNumber}`, description: `GL entry on account ${data.f0911Inv[0].account} · ${Helpers.money(data.f0911Inv[0].ledgerAmt)}\n${data.f0911Inv[0].comment || 'No cardex counterpart — the variance is entirely on this row'}`, sourceRow: data.f0911Inv[0].rowNumber });
    } else if (pattern === '5.3' && _partialCardexOnly) {
      // Partial variant: the useful anchor is the ORPHANED ACCOUNT, not the
      // first F4111 row. On a document whose other accounts posted normally,
      // "here is a cardex row" sends the analyst back to the source sheet to
      // work out which account is actually short.
      for (const a of _partialCardexOnly.accounts) {
        const acct = String(a.acct || '').replace(/\s+/g, ' ').trim();
        const batchStr = a.batches.length ? ` · batch ${a.batches.join(', ')}` : '';
        evidence.push({
          severity: 'Root cause',
          label: `${acct} — cardex with no GL  →  Row ${a.rows[0].rowNumber}`,
          description: `Cardex ${Helpers.money(a.cardex, true)} · ledger $0.00${batchStr}\nNo offsetting ledger row for this account anywhere on the document. The other accounts here show both sides and net to zero, so the batch posted — this account's GL counterpart is missing.`,
          sourceRow: a.rows[0].rowNumber
        });
      }
    } else if (pattern === '5.3' && data.f4111Rows[0]) {
      const fr = data.f4111Rows[0];
      evidence.push({ severity: 'Root cause', label: `${fr.dt} doc ${fr.doc}  →  Row ${fr.rowNumber}`, description: `Cardex entry · ${Helpers.money(fr.cardexAmt)} · PC=${fr.pc || 'blank (unposted)'}`, sourceRow: fr.rowNumber });
    } else if (data.f4111Rows[0]) {
      evidence.push({ severity: 'Root cause', label: `${data.f4111Rows[0].dt} doc ${data.f4111Rows[0].doc}  →  Row ${data.f4111Rows[0].rowNumber}`, description: `Cardex ${Helpers.money(data.f4111Rows[0].cardexAmt)} · ${data.f4111Rows[0].comment || 'Primary cardex entry for this document'}`, sourceRow: data.f4111Rows[0].rowNumber });
    }
    if (data.dmaas[0]) {
      evidence.push({ severity: 'Informational', label: `DMAAI Model  →  Row ${data.dmaas[0].rowNumber}`, description: `Model table 4152 entry for context · ${data.dmaas[0].account}${data.dmaas[0].comment ? ' · ' + data.dmaas[0].comment : ''}`, sourceRow: data.dmaas[0].rowNumber });
    }

    // For pattern 5.5, pass through the resolved DMAAI pair so the
    // resolution text can name 4134/4136 (etc.) directly instead of
    // having to re-derive it.
    const dmaaiPair = pattern === '5.5' ? (explicitPair || DMAAIKnowledge.pairForDocType(data.dt)) : null;

    // Secondary findings — structural facts (multiple accounts, multiple
    // periods on the RR Summary) that should be surfaced alongside the
    // primary diagnosis when they also apply. The 5.4 and 5.14 detectors
    // ran independently above and stored their results in
    // accountMismatchCheck / periodMismatchCheck. If either fires AND it
    // isn't already the primary pattern, append a brief secondary entry
    // so the analyst sees both. The renderer adds an "Also detected"
    // callout below the HOW card listing each entry.
    const secondaryFindings = [];
    if (inModule('5.4') && accountMismatchCheck && pattern !== '5.4') {
      secondaryFindings.push({
        pattern: '5.4',
        patternLabel: 'Account Mismatch',
        accounts: accountMismatchCheck.accounts,
        mispostedAmt: accountMismatchCheck.mispostedAmt
      });
    }
    if (inModule('5.14') && periodMismatchCheck && pattern !== '5.14') {
      secondaryFindings.push({
        pattern: '5.14',
        patternLabel: 'Period Mismatch',
        periods: periodMismatchCheck.periods
      });
    }

    return {
      variance, cardex, ledger, ratio, priority,
      pattern, patternLabel, patternExplanation, evidence, dmaaiPair,
      mfgVarianceAaiContext,
      // Pattern 5.4 context: which two accounts disagreed and how many
      // dollars need to move. Null for every other pattern.
      accountMismatch: pattern === '5.4' ? {
        mispostedAmt: _accountMismatchMispostedAmt,
        expectedAcct: _accountMismatchExpectedAcct,
        postedAcct:   _accountMismatchPostedAcct,
        ratio:        _accountMismatchRatio,
        cardexSign:   _accountMismatchCardexSign
      } : null,
      // Pattern 5.16 context: the implied per-unit costs on each side and
      // the qty those imply. Drives the WHAT card's "X units × $Y/unit"
      // framing and the HOW card's JE math. Null for every other pattern.
      costMismatch: pattern === '5.16' ? mfgCostMismatch : null,
      // Pattern 5.17 context: what AAI 4330 resolves to for this customer
      // (std-cost vs weighted-avg). Drives the WHY/HOW branch in the
      // PV-voucher-variance pattern. Null when not pattern 5.17 OR when
      // SystemContext (F4095) isn't preloaded.
      voucherVariContext: pattern === '5.17' ? voucherVariContext : null,
      // Secondary structural findings (5.4 / 5.14) that apply alongside
      // the primary pattern. Empty array when neither extra structural
      // signature is present, or when one of them IS the primary pattern.
      // Drives the "Also detected" callout below the HOW card.
      secondaryFindings
    };
  },

  /* ---- _whatBody ... _inventoryAaiForDocType (was 6520-7216) ---- */
  _whatBody(data, findings) {
    return this._spaceBullets(this._whatBodyRaw(data, findings));
  },
  _whatBodyRaw(data, findings) {
    if (findings.pattern === '5.1')  return this._unassignedWhat(data, findings);
    if (findings.pattern === '5.2')  return this._glOnlyWhat(data, findings);
    if (findings.pattern === '5.3')  return this._cardexOnlyWhat(data, findings);
    if (findings.pattern === '5.4')  return this._accountMismatchWhat(data, findings);
    if (findings.pattern === '5.5')  return this._netZeroWhat(data, findings);
    if (findings.pattern === '5.6')  return this._stdCostChangeWhat(data, findings);
    if (findings.pattern === '5.18') return this._duplicateShipmentWhat(data, findings);
    if (findings.pattern === '5.7')  return this._lineTypeMixWhat(data, findings);
    if (findings.pattern === '5.11') return this._glExcessWhat(data, findings);
    if (findings.pattern === '5.13') return this._postConfirmOrderEditWhat(data, findings);
    if (findings.pattern === '5.14') return this._periodMismatchWhat(data, findings);
    if (findings.pattern === '5.15') return this._r31802aOrphanWhat(data, findings);
    if (findings.pattern === '5.16') return this._mfgCostMismatchWhat(data, findings);
    if (findings.pattern === '5.17') return this._voucherVariOnInvWhat(data, findings);
    // Generic fallback — bullets style for any future / unmapped pattern.
    // Surface the cost method when F4111 detail is present, since that's
    // commonly the first thing the analyst wants to know on an unmapped
    // diagnosis (especially manufacturing-completion docs).
    const methodLine = this._costMethodSummary(data.f4111Rows);
    const lines = [];
    if (methodLine) lines.push(`• Cost method (F4111 Ext): ${methodLine}`);
    lines.push(
      `• F4111 cardex: ${Helpers.money(findings.cardex)}`,
      `• F0911 GL: ${Helpers.money(findings.ledger)}`,
      `• Variance: ${Helpers.money(findings.variance, true)}`,
      `• Pattern: ${findings.patternLabel || 'unrecognized'} — diagnose from the source sheet`
    );
    return lines.join('\n');
  },
  _whyBody(data, findings) {
    return this._spaceBullets(findings.patternExplanation);
  },
  _howBody(data, findings) {
    return this._howFor(findings.pattern, data, findings);
  },

  // Bullet cards (WHAT / WHY) join their bullets with a single `\n` —
  // which renders as densely packed lines in the Excel cell because Excel
  // doesn't add inter-bullet leading. Wrap the cell content with a
  // blank line before every bullet (except the first) so the list reads
  // as a scan-able list instead of a wall of text. Idempotent: triple+
  // newlines are collapsed back to double. Strings without bullets
  // pass through unchanged.
  _spaceBullets(s) {
    if (!s || typeof s !== 'string' || !s.includes('•')) return s;
    return s.replace(/\n(?=\s*•)/g, '\n\n').replace(/\n{3,}/g, '\n\n');
  },
  _howFor(pattern, data, findings) {
    if (pattern === '5.1')  return this._unassignedResolution(data);
    if (pattern === '5.2')  return this._glOnlyResolution(data, findings);
    if (pattern === '5.3')  return this._cardexOnlyResolution(data);
    if (pattern === '5.19') return this._transferIntegrityResolution(data);
    if (pattern === '5.20') return this._completionNotJournaledResolution(data);
    if (pattern === '5.4')  return this._accountMismatchResolution(data, findings);
    if (pattern === '5.5')  return DMAAIKnowledge.netZeroResolution(findings.dmaaiPair);
    if (pattern === '5.6')  {
      // The orphan revaluation row's cardex amount drives the JE direction.
      // Pass the signed amount so the matrix renderer can show the right
      // Dr/Cr columns.
      const orphan = data.f4111Rows.find(r => /standard\s+cost\s+change/i.test(r.comment || '')
                                            && Math.abs(r.cardexAmt || 0) >= 0.01);
      const orphanAcct = (orphan && orphan.account) || data.account || '';
      return DMAAIKnowledge.icStandardCostChangeResolution(
        orphanAcct,
        orphan ? (orphan.cardexAmt || 0) : 0,
        findings.mfgVarianceAaiContext
      );
    }
    if (pattern === '5.18') return this._duplicateShipmentResolution(data, findings);
    if (pattern === '5.7')  return this._lineTypeMixResolution(data);
    if (pattern === '5.11') return this._glExcessResolution(data);
    if (pattern === '5.13') return this._postConfirmOrderEditResolution(data, findings);
    if (pattern === '5.14') return this._periodMismatchResolution(data, findings);
    if (pattern === '5.15') {
      // Find the orphan F4111 row again so the resolution can name it.
      const targetVar = Math.abs(findings.variance);
      const orphan = data.f4111Rows.find(fr => {
        const amt = Math.abs(fr.cardexAmt || 0);
        if (Math.abs(amt - targetVar) > 0.01) return false;
        return !data.f0911Inv.some(g =>
          String(g.account || '').trim() === String(fr.account || '').trim() &&
          Math.abs(Math.abs(g.ledgerAmt || 0) - amt) < 0.01
        );
      });
      return this._r31802aOrphanResolution(data, findings, orphan);
    }
    if (pattern === '5.16') return this._mfgCostMismatchResolution(data, findings);
    if (pattern === '5.17') return this._voucherVariOnInvResolution(data, findings, findings.voucherVariContext);
    // Generic fallback — bullets style for any future / unmapped pattern
    return [
      `Step 1.  Compare F4111 and F0911 totals at the GL class + batch level individually to isolate which combination is producing the variance.`,
      `Step 2.  For IM / IC / IH docs, query F0911 for the GL document number across all order numbers — R31802A summarizes by account, so a single GL entry may cover multiple WOs.`,
      `Step 3.  Check for batch type JE / IH entries on the same account in the same period — a miscoded manual JE is the next most likely cause.`,
      `Step 4.  If cross-WO summarization is confirmed, suspend the record in RapidReconciler with a note. Otherwise post a reversing JE.`
    ].join('\n\n');
  },

  /* ============================================================
     All-signal-no-noise pattern helpers (WHAT / WHY / HOW).

     Each pattern detected by `classify()` has three helpers:
       _<pattern>What(data, findings)        → bullets summarizing the
                                                key facts the analyst
                                                needs in front of them
       _<pattern>Explanation(data, ...)      → bullets naming 1-3 root-
                                                cause candidates (stored
                                                on findings.patternExplanation
                                                during classification)
       _<pattern>Resolution(data, findings)  → numbered actions, each one
                                                concrete (no "investigate"
                                                hand-waving); the corrective
                                                JE laid out where applicable;
                                                a prevention pointer at the
                                                end.
     Style rules:
       - bullet `•` for fact lists; numbered `Step 1./Step 2.` for actions
       - account numbers and amounts inline so the analyst doesn't scroll
       - no "for IM/IC/IH" generic phrasing when we know the doc type
       - JEs use `Dr <acct>  $X` / `Cr <acct>  $X` shape, two-space gap
  ============================================================ */

  // Pattern 5.1 — Unassigned Account (missing model table entry)
  _unassignedWhat(data, findings) {
    const unassigned = data.unassigned || [];
    const unassignedTotal = unassigned.reduce((s, r) => s + Math.abs(r.cardexAmt || 0), 0);
    const n = unassigned.length;
    return [
      `• F4111 cardex (visible / routed): ${Helpers.money(findings.cardex)}`,
      `• F4111 Unassigned section: ${n} row${n === 1 ? '' : 's'} totaling ${Helpers.money(unassignedTotal)} — excluded from the reconciliation`,
      `• F0911 GL inventory: ${Helpers.money(findings.ledger)}`,
      `• Displayed variance ${Helpers.money(findings.variance, true)} is partial — the unassigned amount isn't in the comparison`
    ].join('\n');
  },
  _unassignedExplanation(data) {
    const n = (data.unassigned || []).length;
    const missingClasses = Array.from(new Set((data.unassigned || []).map(r => r.glclass).filter(Boolean)));
    const classList = missingClasses.length
      ? ` (${missingClasses.slice(0, 4).join(', ')}${missingClasses.length > 4 ? ', …' : ''})`
      : '';
    return [
      `• ${n} cardex row${n === 1 ? '' : 's'} reference${n === 1 ? 's' : ''} a GL class code${classList} with no entry in DMAAI model table 4152 — RR can't route those amounts to a GL account`,
      `• Until the missing class is added, those cardex amounts are excluded from the reconciliation and the displayed variance reflects only the rows RR could route`
    ].join('\n');
  },
  _unassignedResolution(data) {
    return [
      `Step 1.  Identify the missing GL class code(s) from the DMAAs section of the source sheet — the Comment column flags them as "Missing model table entry".`,
      `Step 2.  In JDE, add the missing GL class to DMAAI table 4152 with the correct account for the affected company.`,
      `Step 3.  Refresh RapidReconciler. The previously unassigned cardex amounts move into F4111 Data and the full variance becomes visible.`,
      `Step 4.  Re-analyze this document — the displayed variance was partial until the model-table fix; the new run may reveal a different (or additional) root cause once the data is complete.`
    ].join('\n\n');
  },

  // Pattern 5.2 — GL-Only Entry (no cardex)
  _glOnlyWhat(data, findings) {
    const f0911Row = (data.f0911Inv || [])[0];
    const acct = (f0911Row && f0911Row.account) || data.account || '—';
    const batch = (f0911Row && f0911Row.batch) || '—';
    const comment = (f0911Row && f0911Row.comment) ? f0911Row.comment.trim().slice(0, 80) : '';
    return [
      `• F4111 cardex: $0.00 (no inventory movement recorded for this document)`,
      `• F0911 GL: ${Helpers.money(findings.ledger)} posted to ${acct}`,
      `• Batch: ${batch}${comment ? ' · ' + comment : ''}`,
      `• Variance: ${Helpers.money(findings.variance, true)} — entirely on the GL side`
    ].join('\n');
  },
  _glOnlyExplanation(data) {
    return [
      `• Manual journal entry coded directly to the inventory account (most common — check Source / Comment on the F0911 row)`,
      `• A/P payment or tax variance miscoded to inventory at voucher match`,
      `• Non-stock line type routing through the inventory AAI when it should hit a credit / variance account`
    ].join('\n');
  },
  _glOnlyResolution(data, findings) {
    const f0911Row = (data.f0911Inv || [])[0];
    const acct = (f0911Row && f0911Row.account) || '[the inventory account]';
    return [
      `Step 1.  Open the F0911 Inv Acct section of the source sheet. Note the Source / Comment, BatchType, and entered-by user on the GL row — those fields name who and what posted the entry.`,
      `Step 2.  Decide whether the post is legitimate. A manual JE on inventory is rare and warrants confirmation from cost-accounting; a tax variance or A/P miscoding is recoverable via a reversing JE.`,
      `Step 3.  If the entry is incorrect, post a reversing JE to move ${Helpers.money(findings.ledger)} from ${acct} to the correct account (cost-accounting confirms the destination).`,
      `Step 4.  If the entry is correct but landing on inventory because of a line-type / AAI routing mistake, update the line-type definition or the routing AAI in JDE so future postings land correctly.`
    ].join('\n\n');
  },

  // Pattern 5.3 — Cardex-Only Entry (no GL)
  _cardexOnlyWhat(data, findings) {
    const acct = (data.f4111Rows[0] && data.f4111Rows[0].account) || data.account || '—';
    const pcCodes = Array.from(new Set(data.f4111Rows.map(r => r.pc).filter(p => p != null && p !== '')))
      .map(p => `"${p}"`).join(', ') || 'blank';
    const allPosted = data.f4111Rows.every(r => r.pc === 'P');
    return [
      `• F4111 cardex: ${Helpers.money(findings.cardex)} across ${data.f4111Rows.length} row${data.f4111Rows.length === 1 ? '' : 's'} on ${acct}`,
      `• F0911 GL: $0.00 (no GL entry on ${acct} for this document)`,
      `• Posting Code (PC) on F4111: ${pcCodes}${allPosted ? ' — all posted; GL entry is missing from a posted batch' : ' — non-"P" means the batch was never posted to GL'}`,
      `• Variance: ${Helpers.money(findings.variance, true)} — entirely on the cardex side`
    ].join('\n');
  },
  _cardexOnlyExplanation(data, partial) {
    // The partial variant is a different story and needs a different WHY.
    // An unposted batch is ruled out by the document itself: the other
    // accounts on this doc DID post, so the batch ran. Naming the account
    // and its dollars here keeps the analyst off the source sheet.
    if (partial && partial.primary) {
      const p = partial.primary;
      const acct = String(p.raw || '').replace(/\s+/g, ' ').trim();
      const amt  = Helpers.money(p.cardex, true);
      const batches = Array.from(new Set(p.rows.map(r => r.batch).filter(Boolean)));
      const more = partial.accounts.length - 1;
      return [
        `• ${acct} carries ${amt} of cardex with a ledger of exactly zero — and no offsetting row anywhere on this document`,
        `• The rest of this document's accounts show both sides and net to zero, so the batch DID post — this is one account missing its GL counterpart, not an unposted batch`,
        batches.length ? `• Cardex batch${batches.length > 1 ? 'es' : ''} ${batches.join(', ')} on that account produced no F0911 inventory entry` : null,
        more > 0 ? `• ${more} further account${more > 1 ? 's' : ''} on this document show the same one-sided shape` : null
      ].filter(Boolean).join('\n');
    }
    return [
      `• Unposted batch — cardex was written at the transaction but the batch never posted to GL (PC field on F4111 isn't "P")`,
      `• Partial-batch GL failure — single line missing from an otherwise-posted batch (typically outlier unit cost or a rejected line)`
    ].join('\n');
  },
  _cardexOnlyResolution(data) {
    const batch = (data.f4111Rows[0] && data.f4111Rows[0].batch) || '[this doc\'s batch]';
    return [
      `Step 1.  Check the PC (Posting Code) field on the F4111 rows. If not "P", the cardex was written but the batch was never posted — that's the cause.`,
      `Step 2.  If unposted: locate the batch in JDE Batch Approval (P0011) and post it via R09801. The GL entries will write at that point and the variance clears.`,
      `Step 3.  If PC = "P" on all rows, the cardex side is fine — the GL entry posted somewhere else. Query F0911 in JDE for batch ${batch} and the document across ALL accounts (not just inventory) to see where the GL entry actually landed.`,
      `Step 4.  If the GL entry truly doesn't exist anywhere, post a manual JE for the cardex amount. Then investigate why the GL interface rejected the line — outlier unit cost, account-constants gap, or line-type issue are the usual suspects.`
    ].join('\n\n');
  },

  // Pattern 5.19 — Transfer Integrity (IT cardex-only). A within-branch
  // location move that relieved value on the cardex the GL never recorded.
  // Same JDE item-ledger integrity error the classifier claims + the analyst
  // analyzer pop-up leads with (one source: change one, sync all three).
  // NEVER prescribe R41543 / R41544 here. The pairing was a guess (recorded as
  // one in docs/plans/transaction-variance-process.md) and the owner refuted it
  // 2026-08-03, the same ruling that pulled it off Completion Not Journaled.
  // The remedy is the item cost setup plus a dollars-only IA, and the card is
  // already the population — there is no report to run to find the rest.
  _transferIntegrityExplanation(data) {
    return [
      `• Inventory transfer (IT) — a location move that should net to zero and post no GL`,
      `• The cardex (F4111) relieved value here, but there is no matching GL (F0911) entry — so the move was not value-neutral`,
      `• A leg carried a unit cost but a zero extended cost (the item-ledger amount never calculated), so the cardex lost value the GL never recorded`,
      `• The combination is what matters: a zero extended cost alone is common and harmless, and it falls on relief and receipt legs in equal numbers. Only the zero-extended legs that ALSO carry a unit cost land here`,
      `• No vendor article has been cited for this, so it is an observed integrity error and not a named defect. Cost level is not a property of the pattern — verified populations mix cost levels 2 and 3`
    ].join('\n');
  },
  _transferIntegrityResolution(data) {
    return [
      `Step 1.  Confirm the signature: an IT leg has a unit cost but a zero extended cost. Do not screen on leg direction or cost level — neither separates these documents from healthy transfers. This is an observed item-ledger integrity error, not a mapping or period issue, and no vendor article has been cited for it.`,
      `Step 2.  Confirm both sides for this document: read the F4111 legs against F0911 for the same document, so the one-sided relief is established from the data rather than inferred. Every other one-sided IT relief in the period is already stamped Transfer Integrity and grouped on that card — the card is the population, so nothing needs running to assemble one.`,
      `Step 3.  Count the failures per period, either side of this one. This is the step that tells you which problem you have: a burst that starts and stops, with clean periods afterwards at normal transfer volume, points at a cost change or a specific set of items. Failures in every period mean the cost setup is still wrong.`,
      `Step 4.  Compare the cost setup of the failing items against items that transferred cleanly in the SAME period — a narrower question than auditing the cost setup as a whole. Then re-run the integrity reports to confirm the population is clean.`,
      `Step 5.  Restoring the lost value is a dollars-only inventory adjustment (IA) for the missing extended cost, booked by the accountant, so the cardex and GL agree. The analyst's half is the source correction above, which is what stops it recurring.`
    ].join('\n\n');
  },

  // Pattern 5.20 — Completion Not Journaled (mfg IC cardex-only). A work-order
  // completion on the cardex with no GL completion found for the order. Same shape
  // the classifier claims as 'Completion Not Journaled' (one source: change one,
  // sync all three — usp8_txv_flags block D, AnalysisGuides §5.19, and here).
  // There is NO repost: R31802A stamps the batch and writes F0911 in one step, and
  // the same run clears the unaccounted units that drive its selection.
  _completionNotJournaledExplanation(data) {
    return [
      `• Work-order completion (IC) — finished goods received into inventory, posted on the cardex (F4111)`,
      `• No GL (F0911) completion entry can be found for this work order, while the same order's material issues (IM) are in the GL`,
      `• The cardex row carries a batch number, and R31802A stamps that batch AND writes the F0911 entries in the SAME step — so the run already processed this transaction`,
      `• Most often the run wrote no completion detail for the order at all — the shape is confirmed in the data and matched by NO Oracle Support article. KB 420628 is the near miss, ruled out on shape: its failure drops the IM entry, which would suppress this diagnosis rather than produce it`,
      `• It recurs on every run: 58 manufacturing batches across 8 periods, not one of them clean and not one of them a total failure, 0.6%-24.6% of each batch's completions dropped — the fault is in the run, not this order`,
      `• Less often the detail exists where the match cannot reach it — summarized entries carrying no work-order subledger, a different document company, an uncounted document type, or a G/L date outside the loaded F0911 window`
    ].join('\n');
  },
  _completionNotJournaledResolution(data) {
    return [
      `Step 1.  Take the batch number off the cardex row and read F0911 for that batch, manufacturing batch type '0'. Read it for THIS work order, not just for the batch — a batch full of completions is not evidence this order's completion is among them.`,
      `Step 2.  Fork on what the batch holds. IC rows carrying this order's subledger = a match failure: check the subledger for blank or non-numeric, then the document company, then the document type. IC rows present but none for this order, while F3106 still names the batch for it = the run processed the order and wrote no completion detail (the gap itself, matched by no vendor article). No IC anywhere in the batch = the same gap, run-wide. IC absent from RapidReconciler's copy but present in JDE = the loaded F0911 window.`,
      `Step 3.  Do NOT try to repost through R31802A. It stamped the batch and cleared the unaccounted units that drive its selection in the same run, so it has nothing left to select and the run will change nothing.`,
      `Step 4.  Have whoever runs R31802A read the error report that run produces, starting with the run that stamped these completions. Then pursue the R31802A behaviour with Oracle through your IT department, which owns the support contract — as an undocumented condition, NOT as KB 420628, whose cause is different and whose manual-journal-entry remedy does not fit. Do NOT delete an unposted manufacturing batch — the unaccounted units are already cleared, so nothing regenerates the entry.`
    ].join('\n\n');
  },

  // Pattern 5.5 — Net-Zero F0911 Pair (DMAAI complement misrouted). The
  // WHY and HOW live in DMAAIKnowledge (shared with multi-finding tools);
  // only the per-doc WHAT lives here because it names the specific
  // cancelling pair found in this doc's F0911 rows.
  _netZeroWhat(data, findings) {
    // Re-detect the cancelling pair so we can name the amount + account
    let pair = null;
    for (let i = 0; i < data.f0911Inv.length && !pair; i++) {
      for (let j = i + 1; j < data.f0911Inv.length; j++) {
        const a = data.f0911Inv[i].ledgerAmt || 0;
        const b = data.f0911Inv[j].ledgerAmt || 0;
        if (data.f0911Inv[i].account === data.f0911Inv[j].account
            && Math.abs(a + b) < 0.01 && Math.abs(a) >= 0.01) {
          pair = { amt: Math.abs(a), acct: data.f0911Inv[i].account };
          break;
        }
      }
    }
    if (pair) {
      return [
        `• F4111 cardex: ${Helpers.money(findings.cardex)} (real inventory movement)`,
        `• F0911 GL: ${Helpers.money(pair.amt)} Dr AND ${Helpers.money(pair.amt)} Cr on ${pair.acct} — they cancel each other out`,
        `• Net GL impact: $0 — the inventory account is unchanged even though inventory moved`,
        `• Variance: ${Helpers.money(findings.variance, true)} — the full cardex amount`
      ].join('\n');
    }
    return [
      `• F4111 cardex: ${Helpers.money(findings.cardex)}`,
      `• F0911 GL: net zero on the inventory account (Dr and Cr of equal magnitude self-cancelled)`,
      `• Variance: ${Helpers.money(findings.variance, true)} — the cardex moved but GL didn't`
    ].join('\n');
  },

  // Pattern 5.6 — Standard Cost Change after WO completion. The WHY and HOW
  // live in DMAAIKnowledge (branched on missing vs configured AAI context);
  // only the WHAT lives here.
  _stdCostChangeWhat(data, findings) {
    const orphan = data.f4111Rows.find(r => /standard\s+cost\s+change/i.test(r.comment || '')
                                          && Math.abs(r.cardexAmt || 0) >= 0.01);
    const amt = orphan ? Helpers.money(Math.abs(orphan.cardexAmt)) : Helpers.money(Math.abs(findings.variance));
    const acct = (orphan && orphan.account) || data.account || '—';
    const methodLine = this._costMethodSummary(data.f4111Rows);
    const lines = [];
    if (methodLine) lines.push(`• Cost method (F4111 Ext): ${methodLine}`);
    lines.push(
      `• F4111 captured a Standard Cost Change of ${amt}${data.dt ? ' on this ' + data.dt + ' completion doc' : ''}`,
      `• F0911 has no counterpart entry — neither on inventory (${acct}) nor on an expense / variance account`,
      `• Variance: ${Helpers.money(findings.variance, true)} — equals the orphan revaluation amount exactly`
    );
    return lines.join('\n');
  },

  // Pattern 5.7 — Mixed Line Types on a return doc.
  _lineTypeMixWhat(data, findings) {
    const ordersForDoc = (data.orders || []).filter(o => o.doc === data.doc);
    const stockLines = ordersForDoc.filter(o => !o.linety || o.linety === 'S');
    const nonStockLines = ordersForDoc.filter(o => o.linety && o.linety !== 'S');
    const ordType = (stockLines[0] && stockLines[0].ordtype) || data.ot || '—';
    const nonStockTypes = Array.from(new Set(nonStockLines.map(n => n.linety))).filter(Boolean).join(' / ') || 'other';
    return [
      `• ${stockLines.length} stock line${stockLines.length === 1 ? '' : 's'} (LineTy S — real inventory movement, has F4111 cardex)`,
      `• ${nonStockLines.length} non-stock line${nonStockLines.length === 1 ? '' : 's'} (LineTy ${nonStockTypes} — dollars-only credits, no F4111)`,
      `• All under order type ${ordType} — DMAAI routes by order type + GL class only, line type is ignored`,
      `• Variance: ${Helpers.money(findings.variance, true)} — the misrouted non-stock portion`
    ].join('\n');
  },
  _lineTypeMixExplanation(data, stockLines, nonStockLines) {
    const nonStockTypes = Array.from(new Set(nonStockLines.map(n => n.linety))).filter(Boolean).join(' / ') || 'other';
    return [
      `• Both stock (LineTy S) and non-stock (LineTy ${nonStockTypes}) lines share the same order type; DMAAI routes by order type + GL class only, so every line posts through the same AAI`,
      `• That route is correct for the stock returns (real inventory hit) but wrong for the dollars-only non-stock credits — they should land on a credit / variance account, not inventory`,
      `• The systemic fix is to split returns and credits into separate order types in JDE; until then, every period close requires a manual reconciling entry`
    ].join('\n');
  },
  _lineTypeMixResolution(data) {
    return [
      `Step 1.  Do NOT post the unposted batch as-is via R09801 — that would push the misrouted dollars-only lines into GL and compound the cleanup at close.`,
      `Step 2.  Interim fix: post a manual JE that re-routes the non-stock line amounts off the inventory account to the correct credit / variance account (cost-accounting team confirms the destination). The Order section in Evidence above flags both groups with their source rows.`,
      `Step 3.  Systemic fix: in JDE, define separate order types — one for stock returns, one for dollars-only credits / adjustments. Update the order-entry workflow so each line type lands on the appropriate order type. DMAAI then routes each correctly without manual intervention at close.`,
      `Step 4.  Once the systemic fix is in place, audit any open RI / RM / CR / RE / SR documents to see if they need the same re-routing treatment. Future docs entered after the order-type split won't hit this issue.`,
      `Step 5.  Refresh RapidReconciler and re-analyze. The variance on this doc should clear once the Step 2 JE is posted.`
    ].join('\n\n');
  },

  // Pattern 5.18 — Duplicate shipment on the same order line.
  // Group the F4111 cardex rows by (ordernum, line); a group of 2+ is a
  // line relieved more than once. Most-rows-first so groups[0] is the
  // primary duplicate driving the variance.
  _duplicateShipmentGroups(data) {
    const byKey = new Map();
    (data.f4111Rows || []).forEach(r => {
      const on = String(r.ordernum || '').trim();
      const ln = String(r.line || '').trim();
      if (!on || !ln) return;
      const k = on + '||' + ln;
      let g = byKey.get(k);
      if (!g) { g = { ordernum: on, line: ln, rows: [] }; byKey.set(k, g); }
      g.rows.push(r);
    });
    return Array.from(byKey.values())
      .filter(g => g.rows.length >= 2)
      .sort((a, b) => b.rows.length - a.rows.length);
  },
  _duplicateShipmentWhat(data, findings) {
    const groups = this._duplicateShipmentGroups(data);
    const g = groups[0] || { ordernum: data.ordernum, line: '?', rows: [] };
    const n = g.rows.length;
    const item = ((g.rows.find(r => r.item) || {}).item) || '';
    const perRow = g.rows[0] ? g.rows[0].cardexAmt : 0;
    const grpTot = g.rows.reduce((a, r) => a + (r.cardexAmt || 0), 0);
    const timesWord = n === 2 ? 'twice' : (n + ' times');
    return [
      `• ${n} F4111 cardex rows relieve order ${g.ordernum} line ${g.line}${item ? ' (' + item + ')' : ''} — ${Helpers.money(perRow)} each, ${Helpers.money(grpTot)} total`,
      `• JDE increments the line for partial shipments (… 6.001, 6.100), so one line relieves inventory once — ${n} reliefs on line ${g.line} means it shipped ${timesWord}`,
      `• F0911 booked the shipment once (${Helpers.money(data.f0911InvTot)}); Sales Update (R42800) reads only the first occurrence of a line number`,
      `• Variance: ${Helpers.money(findings.variance, true)} — the duplicate relief, never recorded in GL`
    ].join('\n');
  },
  _duplicateShipmentExplanation(data, groups) {
    const g = (groups && groups[0]) || {};
    return [
      `• Order ${g.ordernum || data.ordernum} line ${g.line || '?'} was ship-confirmed more than once — JDE never re-uses a line number for a partial (it increments to .001 / .100), so a repeated line number is a double relief, not a normal split`,
      `• R42800 (Sales Update) posts GL from the first occurrence of the line, so the duplicate cardex relief hit inventory with no matching GL entry — leaving inventory short by its value`
    ].join('\n');
  },
  _duplicateShipmentResolution(data, findings) {
    const groups = this._duplicateShipmentGroups(data);
    const g = groups[0] || {};
    const item = ((g.rows && g.rows.find(r => r.item) || {}).item) || 'the item';
    const dupAbs = Helpers.money(Math.abs(findings.variance));
    return [
      `Step 1.  Verify in JDE — pull the F4111 (Item Ledger) for order ${g.ordernum || data.ordernum} line ${g.line || ''} and confirm two ship-confirm records for the same quantity. A genuine partial carries a different line number (.001 / .100); matching line numbers confirm the double relief.`,
      `Step 2.  Confirm the billing — check the RI / F4211 for a single invoiced line. One invoice with a duplicate cardex relief is inventory-only; a duplicate invoice is a separate AR correction.`,
      `Step 3.  Inventory adjustment — post an IA to return the double-shipped ${item} to its branch / location, putting back the ${dupAbs} the second relief removed without a sale. This brings the cardex back in line with the GL.`,
      `Step 4.  Refresh RapidReconciler and re-analyze — the ${Helpers.money(findings.variance, true)} variance clears once the IA posts.`,
      `Step 5.  Prevention: review the ship-confirm / RF workflow that let a closed line (NxtSts 999) be confirmed a second time.`
    ].join('\n\n');
  },

  // Pattern 5.11 — GL Excess / Cross-Work-Order Summarization. Two
  // flavors: manufacturing docs (IM/IC/IH/IS) where R31802A summarizes
  // across work orders, and non-manufacturing docs where the cause is
  // typically a separate posting on the same account that RR associated
  // with this doc by batch or GL date.
  _glExcessWhat(data, findings) {
    const acct = (data.rrSummary[0] && data.rrSummary[0].account) || data.account || '—';
    const periodVal = data.rrSummary[0] && data.rrSummary[0].period;
    const period = periodVal ? String(periodVal).slice(0, 10) : '—';
    const direction = Math.abs(findings.ledger || 0) > Math.abs(findings.cardex || 0)
      ? 'GL exceeds cardex'
      : 'cardex exceeds GL';
    return [
      `• F4111 cardex total: ${Helpers.money(findings.cardex)}`,
      `• F0911 GL total: ${Helpers.money(findings.ledger)}`,
      `• Account ${acct} · period ${period}`,
      `• Variance: ${Helpers.money(Math.abs(findings.variance))} — ${direction}`
    ].join('\n');
  },
  _glExcessExplanation(data) {
    const dt = (data.dt || '').trim().toUpperCase();
    const isMfg = /^(IM|IC|IH|IS)$/.test(dt);
    if (isMfg) {
      return [
        `• R31802A summarized GL entries across work orders — a single GL document covers this WO plus others, so F0911 shows the sum while F4111 shows only this WO's portion`,
        `• Manual JE coded to the inventory account in the same period (less common on a manufacturing doc but possible)`
      ].join('\n');
    }
    return [
      `• Manual JE posted to the inventory account in this period`,
      `• A separate posting on the same account that RR associated with this doc by batch or GL date`
    ].join('\n');
  },
  // Pattern 5.16 — Manufacturing Cost Mismatch (cardex unit cost vs GL
  // implied unit cost differ by 5x or more on an IC/IH/IS doc).
  _mfgCostMismatchWhat(data, findings) {
    const m = findings.costMismatch || {};
    const qty = m.qtyTotal || 0;
    const cardexUC = m.implCardexUC || 0;
    const ledgerUC = m.implLedgerUC || 0;
    const qtyStr = (Number.isInteger(qty) ? qty : qty.toFixed(2)).toLocaleString
      ? Number(qty).toLocaleString()
      : String(qty);
    const higher = ledgerUC > cardexUC ? 'GL' : 'cardex';
    const lower  = ledgerUC > cardexUC ? 'cardex' : 'GL';
    const methodLine = this._costMethodSummary(data.f4111Rows);
    const lines = [];
    if (methodLine) lines.push(`• Cost method (F4111 Ext): ${methodLine}`);
    lines.push(
      `• F4111 cardex: ${Helpers.money(findings.cardex)} — ${qtyStr} units × ${Helpers.money(cardexUC)}/unit`,
      `• F0911 GL: ${Helpers.money(findings.ledger)} — implied ${Helpers.money(ledgerUC)}/unit at ${qtyStr} units`,
      `• Unit-cost ratio: ${m.ratio.toFixed(1)}× — ${higher} unit cost is much higher than ${lower}`,
      `• Variance: ${Helpers.money(findings.variance, true)} — the gap between the two cost bases × ${qtyStr} units`
    );
    return lines.join('\n');
  },
  _mfgCostMismatchExplanation(data, m) {
    const ledgerHigher = (m && m.implLedgerUC) > (m && m.implCardexUC);
    const methodInfo = this._dominantCostMethod(data.f4111Rows);
    const bullets = [];
    if (methodInfo && methodInfo.code === '07') {
      // Standard cost — the canonical framing: cardex vs frozen standard
      // vs work-order actual.
      bullets.push(`• Item is on standard cost (F4111 Ext = 07). F4111 cardex and F0911 GL recorded this completion at different unit costs — one side used the frozen standard from F30026, the other used the work-order actual cost (or a post-revaluation cost)`);
    } else if (methodInfo && methodInfo.code === '09') {
      bullets.push(`• Item is on manufacturing-last cost (F4111 Ext = 09). F4111 cardex captured the pre-completion cost basis while F0911 GL captured the work-order actual at completion — R30837 (WIP Revaluation) didn't post the bridging adjustment, so the cardex and GL never reconciled to the new manufacturing-last value`);
    } else if (methodInfo && methodInfo.type === 'actual') {
      bullets.push(`• Item is on an actual-costing method (F4111 Ext = ${methodInfo.code}, ${methodInfo.name}). F4111 cardex captured the pre-completion cost; F0911 GL captured the completion-time actual cost. The two bases diverged and no revaluation closed the gap`);
    } else {
      // Cost method not in Ext (older fixture) or non-actual/standard
      // method — fall back to the original generic framing.
      bullets.push(`• F4111 cardex and F0911 GL recorded this completion at different unit costs — one side used the frozen / standard cost, the other used the work-order actual cost (or a post-revaluation cost)`);
    }
    bullets.push(`• Most common cause: R30822 (Frozen Cost Update) changed the standard cost in F4105 after the completion posted, and R30837 (WIP Revaluation) didn't bridge cardex to GL — either the variance AAI (3240 / 3260) isn't configured for this routing, R30837's processing options suppress the GL write, or the WO is at its Closed status in UDC 00/SS (typically 90; R30837 skips closed WOs)${ledgerHigher ? '. GL ended up at the higher actual cost; cardex stayed at the lower frozen standard.' : '. Cardex ended up at the higher revalued cost; GL stayed at the lower pre-revaluation cost.'}`);
    bullets.push(`• Less common: a timing window between completion and posting where one side picked up a fresh cost while the other used the prior cost`);
    return bullets.join('\n');
  },

  // Summarize the distinct cost methods present on F4111 detail rows for
  // display in WHAT cards. Returns "07 (Standard Cost)" for single-method
  // docs, "07 (Standard Cost), 02 (Weighted Average Cost)" when mixed,
  // or null when no F4111 detail rows have an Ext value (older fixtures
  // pre-dating the 2026-05 sproc update, or no detail rows at all).
  _costMethodSummary(f4111Rows) {
    if (!f4111Rows || !f4111Rows.length) return null;
    const codes = new Set();
    for (const r of f4111Rows) {
      const code = (r.ext || '').trim();
      if (code) codes.add(code);
    }
    if (!codes.size) return null;
    return Array.from(codes).sort().map(c => CostMethodKnowledge.label(c) || c).join(', ');
  },
  // Pick the single dominant cost method on the doc — the most common
  // Ext value across F4111 rows. Returns { code, name, type, note } or
  // null when no row carries a recognized method. Used by WHY explanations
  // that want to lead with the cost-method framing (Pattern 5.16, etc.).
  _dominantCostMethod(f4111Rows) {
    if (!f4111Rows || !f4111Rows.length) return null;
    const counts = {};
    for (const r of f4111Rows) {
      const code = (r.ext || '').trim();
      if (code) counts[code] = (counts[code] || 0) + 1;
    }
    const codes = Object.keys(counts);
    if (!codes.length) return null;
    codes.sort((a, b) => counts[b] - counts[a]);
    return CostMethodKnowledge.resolve(codes[0]);
  },
  _mfgCostMismatchResolution(data, findings) {
    const m = findings.costMismatch || {};
    const cardexUC = m.implCardexUC || 0;
    const ledgerUC = m.implLedgerUC || 0;
    const variance = Math.abs(findings.variance || 0);
    const ledgerHigher = ledgerUC > cardexUC;
    const acct = (data.rrSummary[0] && data.rrSummary[0].account) || data.account || '[WIP/FG account]';
    // ledgerHigher = GL is over-stated vs cardex → variance is an
    //   excess DEBIT sitting on inventory. Corrective: Cr Inventory
    //   (back it out), Dr Variance (absorb it).
    // !ledgerHigher = GL is understated vs cardex → variance is a
    //   missing debit on inventory. Corrective: Dr Inventory (top it
    //   up), Cr Variance.
    const invSign = ledgerHigher ? -variance : +variance;   // direction OF the variance currently on inventory
    const corrInv = -invSign;                                // corrective reverses it
    const corrVar = +invSign;                                // and lands on variance AAI
    const matrix = {
      columns: [
        { role: 'inventory', label: 'Inventory (WIP / FG)',     identifier: acct },
        { role: 'variance',  label: 'Manufacturing Variance',   identifier: 'AAI 3240 (Material) or 3260 (Planned)' }
      ],
      scenarios: [
        { label: 'Where the variance should sit',              amounts: [null,    invSign] },
        { label: 'Where the variance is sitting today',        amounts: [invSign, null]    },
        { label: 'Corrective entry',                           amounts: [corrInv, corrVar] },
        { label: 'End Result',                                 amounts: [null,    invSign], endResult: true }
      ]
    };

    return [
      { type: 'prose', text: `Step 1.  Identify which cost is correct per the customer's cost-accounting policy. Cardex shows ${Helpers.money(cardexUC)}/unit; GL implies ${Helpers.money(ledgerUC)}/unit. Confirm with cost-accounting which side represents the intended cost basis (frozen standard vs work-order actual). The matrix below assumes the ${ledgerHigher ? 'lower (cardex)' : 'higher (cardex)'} side is correct and moves the excess to a manufacturing variance account — flip the JE direction if the policy is the opposite.` },
      { type: 'prose', text: `Step 2.  Post the corrective JE to clear the variance:` },
      { type: 'jeFlowMatrix', matrix },
      { type: 'prose', text: `Step 3.  Investigate R30837 (WIP Revaluation) configuration in JDE. R30837 needs to be called from R30822 (Frozen Cost Update) so cardex and GL stay aligned through standard-cost changes. If R30837 isn't firing — or the work order has reached its Closed status in UDC 00/SS (typically 90; values are customer-defined) and R30837 won't revalue closed WOs — this kind of mismatch will keep accumulating on future cost changes.` },
      { type: 'prose', text: `Step 4.  Refresh RapidReconciler and re-analyze. The variance should clear once the JE is posted; the R30837 fix prevents recurrence.` }
    ];
  },

  // Pattern 5.17 — Voucher Variance on Inventory (PV under standard cost).
  //
  // A PV (P4314 voucher match) doc with no F4111 cardex but F0911 entries
  // on an inventory account. Under standard costing, AAI 4330 (Purchase
  // Price Variance) should route to an EXPENSE account — the voucher
  // variance is expensed, not capitalized. Under weighted-average, 4330
  // routes to inventory and F4111 captures the revaluation. So this
  // signature has two readings:
  //
  //   - Std-cost customer (4330 → expense):  variance was misrouted to
  //     inventory by an AAI 4330 override at posting time, or 4330 was
  //     reconfigured / wasn't set correctly for this routing
  //   - Weighted-avg customer (4330 → inv):  voucher should have written
  //     an F4111 revaluation but didn't; cardex side is missing
  //
  // The diagnostic fork is decided by what AAI 4330 actually resolves to
  // for this customer's company/GL class. If F4095 is preloaded, we look
  // it up and present the right hypothesis directly. Without preload, we
  // present both and tell the analyst to confirm in JDE.
  _voucherVariOnInvWhat(data, findings) {
    const f0911Row = (data.f0911Inv || [])[0];
    const acct = (f0911Row && f0911Row.account) || data.account || '—';
    const batch = (f0911Row && f0911Row.batch) || '—';
    return [
      `• F4111 cardex: $0.00 (no cardex — consistent with a standard-cost voucher)`,
      `• F0911 GL: ${Helpers.money(findings.ledger)} on ${acct} (inventory-side account)`,
      `• Batch: ${batch}`,
      `• Variance: ${Helpers.money(findings.variance, true)} — variance landed on inventory; under standard costing it should be on an expense account (per AAI 4330)`
    ].join('\n');
  },
  _voucherVariOnInvExplanation(data, ctx) {
    if (ctx && ctx.status === 'std-cost') {
      return [
        `• Std cost: AAI 4330 resolves to ${ctx.longAccount} (expense account) for this company / GL class.`,
        `• Variance landed on inventory anyway. Most common cause: DMAAI 4330 was overridden at posting time (manual JE on the inventory account, or a posting-program override).`,
        `• Less common: 4330 was reconfigured after this doc posted; the prior config pointed at inventory.`
      ].join('\n');
    }
    if (ctx && ctx.status === 'weighted-avg') {
      return [
        `• Weighted-average: AAI 4330 resolves to ${ctx.longAccount} (inventory account) for this company / GL class.`,
        `• Under WA, F4111 should ALSO carry a cardex revaluation row — but it's empty for this doc, so the cardex side never wrote.`,
        `• Likely cause: P4314 didn't trigger the F4111 update (job-step failure during voucher match, or a config suppressing the cardex write).`
      ].join('\n');
    }
    // F4095 not loaded — present both hypotheses
    return [
      `• Std-cost case: 4330 should route to expense; landed on inventory instead. Usual cause is a 4330 override at posting time or a stale config.`,
      `• WA case: 4330 routes to inventory by design, but F4111 should also carry a matching revaluation row — and doesn't. P4314 didn't write F4111.`,
      `• Confirm 4330's destination in JDE, or preload the JDE DMAAIs workbook for a definitive answer.`
    ].join('\n');
  },
  _voucherVariOnInvResolution(data, findings, ctx) {
    const f0911Row = (data.f0911Inv || [])[0];
    const acct = (f0911Row && f0911Row.account) || data.account || '[inventory account]';
    const batch = (f0911Row && f0911Row.batch) || '[batch]';
    const amt = Helpers.money(Math.abs(findings.variance || findings.ledger || 0));
    if (ctx && ctx.status === 'std-cost') {
      // Variance currently sits on inventory (where F0911 posted it).
      // Std cost says it should be on expense. We don't know whether the
      // original variance was Dr or Cr — could be either depending on
      // whether the voucher cost came in higher or lower than the receipt
      // cost. Use the signed F0911 inventory total (findings.ledger) as
      // the source of truth.
      const ledgerAmt = findings.ledger || 0;       // signed amount currently on inventory
      const correctInv = -ledgerAmt;                 // corrective reverses it
      const correctExp = +ledgerAmt;                 // and lands on expense (same sign as original)
      const matrix = {
        columns: [
          { role: 'inventory', label: 'Inventory (where it landed)',  identifier: acct },
          { role: 'expense',   label: 'Expense (per AAI 4330)',        identifier: ctx.longAccount || ctx.account }
        ],
        scenarios: [
          { label: 'What AAI 4330 should have posted (std cost)', amounts: [null,        ledgerAmt] },
          { label: 'What AAI 4330 actually posted',                amounts: [ledgerAmt,  null]      },
          { label: 'Corrective entry',                             amounts: [correctInv, correctExp] },
          { label: 'End Result',                                   amounts: [null,        ledgerAmt], endResult: true }
        ]
      };
      return [
        { type: 'prose', text: `Step 1.  Post a corrective JE to move the misposted variance off inventory and onto the expense account AAI 4330 resolves to. Use the GL date of the original F0911 entry so the correction lands in the same period.` },
        { type: 'jeFlowMatrix', matrix },
        { type: 'prose', text: `Step 2.  Identify why the variance was redirected. Pull the F0911 record for batch ${batch} and check the Source / Comment / BT column — a manual JE batch type (JE / IH) means a person redirected it; an automatic batch with no override suggests AAI 4330 was misconfigured at posting time.` },
        { type: 'prose', text: `Step 3.  In JDE, pull the audit / change history on DMAAI 4330 for Company ${data.company || '?'}${data.glclass ? ' / GL class ' + data.glclass : ''}. If 4330 was changed after this doc posted, sweep other PV docs that posted under the old config — they'll need the same Step 1 JE.` },
        { type: 'prose', text: `Step 4.  Refresh RapidReconciler and re-analyze. The variance should clear once the JE is posted.` }
      ];
    }
    if (ctx && ctx.status === 'weighted-avg') {
      return [
        `Step 1.  Confirm the voucher post (P4314) ran to completion. Pull the batch ${batch} run history in JDE — look for errors, partial-run flags, or any job-step failures during the voucher-match cycle.`,
        `Step 2.  If the voucher post completed without writing F4111, post a manual cardex revaluation entry for ${amt} to capture the variance in the weighted-average cost. Coordinate with cost-accounting before posting — the entry needs to update the item's average cost, not just sit on the cardex.`,
        `Step 3.  Investigate the F4111-write failure root cause. Configuration issues that suppress F4111 writes during voucher match include: a missing line-type definition, the item being marked non-stock for this branch, or a custom modification on the voucher-post path.`,
        `Step 4.  Refresh RapidReconciler and re-analyze. The variance should clear once the cardex entry is posted.`
      ].join('\n\n');
    }
    // No F4095 loaded — give the analyst the decision tree
    return [
      `Step 1.  Confirm the customer's cost method by looking up AAI 4330 in JDE for Company ${data.company || '?'}${data.glclass ? ' / GL class ' + data.glclass : ''}. If 4330 resolves to an EXPENSE account, the customer uses standard costing. If 4330 resolves to an INVENTORY account, the customer uses weighted average.`,
      `Step 2.  Standard cost (4330 → expense): post a corrective JE to move ${amt} from ${acct} to the expense account 4330 resolves to. Then investigate the DMAAI 4330 history / posting-time override for this batch (${batch}) to find the root cause.`,
      `Step 3.  Weighted average (4330 → inventory): the variance routing is correct, but F4111 should have a cardex revaluation entry and doesn't. Confirm P4314 ran to completion and post a manual cardex revaluation for ${amt} to capture the variance in the average cost.`,
      `Step 4.  Preload the JDE DMAAIs workbook on the analyzer's Preload card and re-run this analysis — the analyzer will give you the definitive answer instead of two hypotheses.`
    ].join('\n\n');
  },

  _glExcessResolution(data) {
    const dt = (data.dt || '').trim().toUpperCase();
    const isMfg = /^(IM|IC|IH|IS)$/.test(dt);
    const f0911Row = (data.f0911Inv || [])[0];
    const glDoc = (f0911Row && f0911Row.doc) || data.doc;
    const acct = (data.rrSummary[0] && data.rrSummary[0].account) || data.account || '[inventory account]';
    const batch = (f0911Row && f0911Row.batch) || '[batch]';
    const periodVal = data.rrSummary[0] && data.rrSummary[0].period;
    const period = periodVal ? String(periodVal).slice(0, 10) : '[period]';
    if (isMfg) {
      return [
        `Step 1.  Query F0911 in JDE for GL document number ${glDoc} across ALL order numbers (not just ${data.doc}). R31802A summarizes GL entries by account for manufacturing docs — a single GL doc commonly covers many work orders. If the query returns multiple order numbers, the variance is cross-WO summarization, not an error.`,
        `Step 2.  If cross-WO summarization is confirmed, suspend this record in RapidReconciler with a note explaining the summarization. The variance is real but isn't actionable at this doc level — it nets out when all the work orders in the GL doc are considered together.`,
        `Step 3.  If GL doc ${glDoc} legitimately belongs only to this work order, query F0911 with BatchType = JE / IH on ${acct} for period ${period}. A miscoded manual entry is the remaining likely cause.`,
        `Step 4.  If a miscoded JE is the cause, post a reversing JE to move the misposted amount to the correct account.`
      ].join('\n\n');
    }
    return [
      `Step 1.  Query F0911 for batch ${batch} on ${acct} in period ${period}. Look for an entry whose source doc isn't ${data.doc} — that's the separate posting RR has associated with this doc.`,
      `Step 2.  Identify the source (Source / Comment / BatchType on the F0911 row). A manual JE on the inventory account is the most common cause.`,
      `Step 3.  If the entry is incorrect, post a reversing JE to move the dollars to the correct account.`,
      `Step 4.  If the entry is correct but RR is incorrectly tying it to this doc, the reconciliation will catch it again next refresh — suspend this record in RR with a note pointing at the actual source.`
    ].join('\n\n');
  },

  // Pattern 5.13 — Post-confirm order edit (WHAT + WHY)
  _postConfirmOrderEditWhat(data, findings) {
    // Re-derive the per-line totals (already in findings indirectly via
    // variance but we want crisp WHAT numbers). Cheap to recompute.
    const SALES_ORDER_TYPES = /^(SO|ST|SD|RM|CR|CO)$/i;
    const ordersForThisDoc = (data.orders || []).filter(o => o.doc === data.doc);
    const stockOrders = ordersForThisDoc.filter(o => !o.linety || o.linety === 'S');
    const shipConfirmed = stockOrders.filter(o => parseInt(o.nxtsts || '0', 10) >= 540);
    const orderQtyTotal = shipConfirmed.reduce((s, o) => s + Math.abs(o.qty || 0), 0);
    const orderDollars  = shipConfirmed.reduce((s, o) => s + Math.abs(o.qty || 0) * Math.abs(o.unitcost || 0), 0);
    const cardexQtyTotal = data.f4111Rows.reduce((s, r) => s + Math.abs(r.qty || 0), 0);
    const qtyDelta = orderQtyTotal - cardexQtyTotal;
    const dollarDelta = orderDollars - Math.abs(data.f4111Tot);
    return [
      `• F4111 (locked at ship-confirm): qty ${cardexQtyTotal} for ${Helpers.money(Math.abs(data.f4111Tot))}`,
      `• F4211 current order qty (drives R42800): qty ${orderQtyTotal} for ${Helpers.money(orderDollars)}`,
      `• F0911 booked the order's current qty: ${Helpers.money(Math.abs(data.f0911InvTot))}`,
      `• Delta: ${qtyDelta} EA × unit cost = ${Helpers.money(dollarDelta)} — the variance`
    ].join('\n');
  },

  _postConfirmOrderEditExplanation(data, shipConfirmedStockOrders, totals) {
    return [
      `• Order line qty was edited in P4210 / P42101 between ship-confirm and R42800 — cardex was locked at confirm, GL got the post-edit qty`,
      `• Order Activity Rules or F4211.IVI (Inventory In Hand) flag allowed the edit when it should have blocked it`
    ].join('\n');
  },

  // The inventory-side AAI by doc type — the one that fires when inventory
  // dollars move via this doc type. Used by Pattern 5.4 (Account Mismatch)
  // to guide the analyst directly to the DMAAI entry they need to inspect
  // and (usually) fix. Returns null for unknown doc types; the resolution
  // text falls back to generic "check the DMAAs section" language.
  _inventoryAaiForDocType(dt) {
    const t = String(dt || '').trim().toUpperCase();
    const map = {
      // Manufacturing
      IM: { aai: '3110', label: 'Inventory Material',     note: 'credit when material is issued to a work order' },
      IC: { aai: '3120', label: 'WIP',                    note: 'credit on WO completion (3130 debits finished-goods inventory)' },
      IH: { aai: '3120', label: 'WIP',                    note: 'debit for labor charged to a work order' },
      IS: { aai: '3120', label: 'WIP',                    note: 'credit on scrap' },
      IV: { aai: '32xx', label: 'WO Variance',            note: 'manufacturing variance — Material (3240), Planned (3260), Labor (3270), Burden (3280)' },
      // Inventory adjustments / moves
      IA: { aai: '4124', label: 'Inventory Adjustment',   note: 'credit on adjustment (4122 is the debit side)' },
      II: { aai: '4124', label: 'Inventory Issue',        note: 'credit on issue (4122 is the debit side)' },
      IJ: { aai: '4124', label: 'Inventory Journal',      note: 'credit (4122 debit)' },
      IL: { aai: '4124', label: 'Inventory Location',     note: 'credit (4122 debit)' },
      IR: { aai: '4124', label: 'Inventory Reclass',      note: 'credit (4122 debit)' },
      IT: { aai: '4124', label: 'Inventory Transfer',     note: 'credit within a branch; in-transit uses 4245 / 4320' },
      IP: { aai: '4154', label: 'Physical Inventory',     note: 'credit on physical count (4152 debit)' },
      IB: { aai: '4134', label: 'Inv Cost Change',        note: 'inventory side (4136 is the expense / variance side)' },
      // Sales / returns
      SO: { aai: '4240', label: 'Inventory at Branch',    note: 'credit on sales shipment (4220 COGS debit)' },
      SD: { aai: '4240', label: 'Inventory at Branch',    note: 'credit on shipment (4220 COGS debit)' },
      ST: { aai: '4240', label: 'Inventory at Branch',    note: 'credit on transfer shipment (4220 debit)' },
      RM: { aai: '4240', label: 'Inventory at Branch',    note: 'debit on sales return (4220 COGS credit)' },
      RI: { aai: '4240', label: 'Inventory at Branch',    note: 'credit (4220 COGS debit)' },
      // Purchasing — OV is the RECEIPT event (P4312), not a voucher. Its
      // inventory leg is the same as OP: Dr Inventory (4310) / Cr RNV (4320).
      // PV is the voucher-match event (P4314), which clears RNV and posts
      // any price variance through 4330.
      OP: { aai: '4310', label: 'Inventory Receipt',      note: 'debit on PO receipt (4320 RNV credit)' },
      OV: { aai: '4310', label: 'Inventory Receipt',      note: 'debit on PO receipt (4320 RNV credit)' },
      PV: { aai: '4320', label: 'Received Not Vouchered', note: 'debit on voucher match (clears RNV; variance via 4330)' },
    };
    return map[t] || null;
  },

  /* ---- _accountMismatch* ... _postConfirmOrderEditResolution (was 7352-7745) ---- */
  // Pattern 5.4 — Account Mismatch helpers (WHAT / WHY / HOW).
  // The variance signature is two RR Summary rows on different accounts:
  // one carries the cardex (where it should have gone), the other carries
  // the GL (where it actually went). The cleanup is a JE between the two
  // accounts; the prevention is correcting the AAI that misrouted the GL.

  _accountMismatchWhat(data, findings) {
    const m = findings.accountMismatch || {};
    const expected = m.expectedAcct || '[expected account from F4111]';
    const posted   = m.postedAcct   || '[posted account from F0911]';
    const amt      = Helpers.money(m.mispostedAmt || 0);
    // Sign-aware label: both lines describe the SAME inventory leg of the
    // original transaction. The mismatch is the account, not the direction.
    //   cardexSign < 0  → inventory leg should be a credit (IM, IA, etc.)
    //   cardexSign >= 0 → inventory leg should be a debit (IC, OP, etc.)
    const label = (m.cardexSign || 0) < 0 ? 'Cr' : 'Dr';
    return [
      `Inventory leg of this ${data.dt || ''} doc should have posted to one account; F0911 landed on another.`,
      ``,
      `   ${label}   ${expected}   ${amt}   ← per AAI (F4111 cardex model)`,
      `   ${label}   ${posted}   ${amt}   ← where F0911 actually posted`,
      ``,
      `Same magnitude, same Dr/Cr side — only the account differs. Misposted dollars: ${amt}.`
    ].join('\n');
  },

  _accountMismatchExplanation(data, ctx) {
    return [
      `• DMAAI override at posting time — manual JE coded the inventory account directly, or a posting program's override option redirected the GL leg`,
      `• DMAAI reconfigured after this doc posted — older docs reference the prior routing; newer GL entries reference the current one`
    ].join('\n');
  },

  _accountMismatchResolution(data, findings) {
    const m       = findings.accountMismatch || {};
    const dtRaw   = (data.dt || '').trim().toUpperCase();
    const aaiInfo = this._inventoryAaiForDocType(dtRaw);
    const expected = m.expectedAcct || '[expected account from F4111]';
    const posted   = m.postedAcct   || '[posted account from F0911]';
    const docCompany   = (data.company || '').trim();
    const docOrderType = (data.ot || (data.docHeader && data.docHeader.ot) || '').trim();
    const f4111        = data.f4111Rows[0] || null;
    const docGlClass   = (f4111 && f4111.glclass) || '';
    const article      = /^[AEIOU]/i.test(dtRaw) ? 'an' : 'a';

    // Sign-aware JE direction. The original transaction's inventory leg is
    // either a debit (IC/OP/PV/RM family — cardexSign > 0) or a credit
    // (IM/IA/II/SO-shipment family — cardexSign < 0). The matrix below
    // derives every cell from this single sign.
    const isCreditInventory = (m.cardexSign || 0) < 0;

    // Doc context — names the AAI that fires for this doc type's inventory
    // side. One line; the analyst uses it for the prevention pass at the
    // end. No investigation hand-holding (analysts don't audit-trail the
    // DMAAI for every doc; the JE is the fix).
    const docKey = [
      `Company ${docCompany || '?'}`,
      docOrderType && `order type ${docOrderType}`,
      docGlClass   && `GL class ${docGlClass}`
    ].filter(Boolean).join(', ');
    const context = aaiInfo
      ? `${article.charAt(0).toUpperCase() + article.slice(1)} ${dtRaw} document — ${docKey}. Inventory side routes through DMAAI ${aaiInfo.aai} (${aaiInfo.label}).`
      : `${docKey}. Inventory-side DMAAI for ${data.dt || 'this document type'} is unknown — identify it from the DMAAs section (the row resolving to ${expected}).`;

    // JE-flow matrix — three accounts × four scenarios. Cell values are
    // signed (Dr = positive, Cr = negative); the number format renders
    // credits in red parens and blanks zero-amount cells. Reading down a
    // column shows how each account's balance evolves through the
    // scenarios; reading across "End Result" should equal "What was
    // supposed to happen" (i.e., the books are reconciled).
    //
    // signedAmt: +X = Dr, -X = Cr. For an IM (cardexSign < 0):
    //   Inventory should be credited (-X), WIP debited (+X), Mistaken 0.
    // For an IC (cardexSign > 0):
    //   Inventory (= FG) should be debited (+X), WIP credited (-X), 0.
    // Signed amounts per account, per scenario. Convention: Dr = positive,
    // Cr = negative. The number format renders negative as red parens and
    // zero/null as blank, so the matrix reads like a trial balance.
    //   sExp = signed amount on the expected (inventory) account in the
    //          "supposed to happen" leg. Matches the cardex sign.
    //   sCp  = signed amount on the counterpart leg. Opposite of sExp.
    //   sMis = signed amount on the mistaken account in "what actually
    //          happened" — the mistaken account received the leg that was
    //          MEANT for the expected account, so it carries the same
    //          sign as sExp.
    const numAmt = Math.abs(m.mispostedAmt || 0);
    const sign   = isCreditInventory ? -1 : 1;
    const sExp   = sign * numAmt;
    const sCp    = -sign * numAmt;
    const sMis   = sExp;
    const counterpart = this._counterpartAaiForDocType(dtRaw);
    const counterpartLabel = counterpart ? counterpart.plainName : 'Counterpart';
    const counterpartIdent = counterpart ? `(DMAAI ${counterpart.aai})` : '—';

    // Each scenario is one ledger snapshot. End Result = Actual + Corrective.
    //   What supposed: Dr counterpart, Cr/Dr expected         — original intended JE
    //   What actually: Dr counterpart, Cr/Dr mistaken         — F0911 reality (wrong account)
    //   Corrective:    Cr/Dr expected, opposite on mistaken   — the JE we're posting
    //   End Result:    sums of actual + corrective            — matches "supposed to"
    const matrix = {
      columns: [
        { role: 'expected',    label: aaiInfo ? aaiInfo.label : 'Expected', identifier: expected },
        { role: 'counterpart', label: counterpartLabel,                     identifier: counterpartIdent },
        { role: 'posted',      label: 'Mistaken Account',                   identifier: posted }
      ],
      scenarios: [
        { label: 'What was supposed to happen', amounts: [sExp,  sCp,  null] },
        { label: 'What actually happened',      amounts: [null,  sCp,  sMis] },
        { label: 'Corrective entry',            amounts: [sExp,  null, -sMis] },
        { label: 'End Result',                  amounts: [sExp,  sCp,  null], endResult: true }
      ]
    };

    // Prevention pointer — single line. The detailed audit / override
    // investigation (Source/Comment/BT, change history) was dropped; in
    // practice nobody chases it that far when the JE clears the variance.
    const aaiRef = aaiInfo ? `DMAAI ${aaiInfo.aai}` : 'the inventory-side DMAAI';
    const prevent = `Prevention: review ${aaiRef} in JDE for ${docKey}. If a posting-time override is allowed on this account, restrict it or route manual inventory JEs through an approval step.`;

    return [
      { type: 'prose', text: context },
      { type: 'jeFlowMatrix', matrix },
      { type: 'prose', text: prevent }
    ];
  },

  // Pattern 5.14 — Period Mismatch helpers. Same account on cardex and GL,
  // but different periods. Cause is usually a GL Date processing option
  // set to "system date" rather than the F4111 transaction date.

  _periodMismatchWhat(data, findings) {
    const periods = Array.from(new Set(data.rrSummary.map(r => r.period && (r.period.toString ? r.period.toString().slice(0, 10) : r.period)).filter(Boolean)));
    const acct = data.rrSummary[0] && data.rrSummary[0].account;
    return [
      `• F4111 period: ${periods[0] || '—'}`,
      `• F0911 period: ${periods[1] || '—'}`,
      `• Same account (${acct || '—'}), same dollars — only the period drifted`
    ].join('\n');
  },

  _periodMismatchExplanation(data) {
    return [
      `• R42800 / R31802A GL Date PO set to system run date instead of F4111 TransDate — batch lands in whatever period the program ran in`,
      `• Backdated manual JE on the inventory account picked up the same amount in a different period`
    ].join('\n');
  },

  // Pattern 5.15 — R31802A orphan cardex row helpers.
  //
  // A manufacturing F4111 row (IC / IM / IH / IS) whose amount matches
  // the document variance but has no F0911 counterpart on the same
  // account in this report. The "report" caveat is critical: RR filters
  // F0911 at import time, so the GL row may exist in JDE outside RR's
  // view. The diagnosis points the analyst at the five real R31802A
  // causes instead of recommending a JE that might double-count.

  // Find a "twin" — another F4111 row with the same item, same unit
  // cost, same account as the orphan (the row that DID post). When a
  // twin exists, several of the otherwise-plausible causes (selection
  // filtering, configuration errors) drop out because identical inputs
  // can't legitimately produce different outcomes through field-based
  // routing — that scopes the investigation to row-instance causes
  // like an interrupted run or a mis-set processed-flag.
  _findOrphanTwin(data, orphan) {
    if (!orphan) return null;
    return data.f4111Rows.find(fr =>
      fr !== orphan &&
      Math.abs(fr.cardexAmt || 0) > 0.01 &&
      fr.item === orphan.item &&
      Math.abs((fr.unitcost || 0) - (orphan.unitcost || 0)) < 0.0001 &&
      String(fr.account || '').trim() === String(orphan.account || '').trim()
    ) || null;
  },

  // Counterpart AAI by manufacturing doc type. The orphan F4111 row's
  // account is one side of R31802A's standard pair; the counterpart
  // is the OTHER side — what didn't fire in F0911. Used to construct
  // the corrective JE.
  //   shortLabel  — used in the inline "(DMAAI X — Y)" parenthetical
  //                 when F4095 resolves to an account
  //   plainName   — used as the literal account label when the F4095
  //                 lookup misses (or no preload is available). The
  //                 analyst will substitute the actual JDE account on
  //                 their side once they look it up.
  // Counterpart AAI for the Pattern 5.4 (Account Mismatch) matrix's
  // middle column — the non-inventory leg of the original transaction's
  // JE that DID post correctly (so it just sits in place across all four
  // matrix scenarios). Returns null for doc types whose counterpart isn't
  // tied to a single DMAAI (e.g. PV's A/P side is keyed by PCAAI, not
  // 4xxx); Pattern 5.4 falls back to a generic "Counterpart / --" header
  // when null.
  _counterpartAaiForDocType(dt) {
    const t = String(dt || '').trim().toUpperCase();
    const map = {
      // Manufacturing
      IC: { aai: '3120', shortLabel: 'WIP',                 plainName: 'Work in Process' },
      IM: { aai: '3120', shortLabel: 'WIP',                 plainName: 'Work in Process' },
      IH: { aai: '3401', shortLabel: 'Labor accrual',       plainName: 'Labor Accrual' },
      IS: { aai: '3120', shortLabel: 'WIP',                 plainName: 'Work in Process' },
      // Inventory adjustments / moves — inventory leg is the 4124-side
      // credit; the counterpart is 4122 (the expense / contra side).
      IA: { aai: '4122', shortLabel: 'Inv Adj contra',      plainName: 'Inventory Adjustment Contra' },
      II: { aai: '4122', shortLabel: 'Inv Issue contra',    plainName: 'Inventory Issue Contra' },
      IJ: { aai: '4122', shortLabel: 'Inv Journal contra',  plainName: 'Inventory Journal Contra' },
      IL: { aai: '4122', shortLabel: 'Inv Location contra', plainName: 'Inventory Location Contra' },
      IR: { aai: '4122', shortLabel: 'Inv Reclass contra',  plainName: 'Inventory Reclass Contra' },
      IT: { aai: '4122', shortLabel: 'Inv Transfer contra', plainName: 'Inventory Transfer Contra' },
      IP: { aai: '4152', shortLabel: 'Physical Inv',        plainName: 'Physical Inventory' },
      IB: { aai: '4136', shortLabel: 'Inv Cost Change exp', plainName: 'Inventory Cost Change Expense Offset' },
      // Sales / returns — inventory leg is 4240; counterpart is 4220 COGS.
      SO: { aai: '4220', shortLabel: 'COGS',                plainName: 'Cost of Goods Sold' },
      SD: { aai: '4220', shortLabel: 'COGS',                plainName: 'Cost of Goods Sold' },
      ST: { aai: '4220', shortLabel: 'COGS (transfer)',     plainName: 'Cost of Goods Sold -- Branch Transfers' },
      RM: { aai: '4220', shortLabel: 'COGS',                plainName: 'Cost of Goods Sold' },
      RI: { aai: '4220', shortLabel: 'COGS',                plainName: 'Cost of Goods Sold' },
      // Purchasing -- OV / OP receipts pair 4310 (inventory) with 4320 RNV.
      // PV's counterpart is A/P keyed by PCAAI rather than a 4xxx DMAAI,
      // so it stays null and Pattern 5.4 shows a generic header.
      OP: { aai: '4320', shortLabel: 'RNV',                 plainName: 'Received Not Vouchered' },
      OV: { aai: '4320', shortLabel: 'RNV',                 plainName: 'Received Not Vouchered' },
    };
    return map[t] || null;
  },

  // Short, ALL-CAPS pattern names for the variance-card strip. The
  // full pattern label is often too long to fit cleanly on a single
  // strip row — keep these tight.
  _stripLabelForPattern(findings) {
    const p = findings && findings.pattern;
    const map = {
      '5.1':  'UNASSIGNED ACCOUNT',
      '5.2':  'GL-ONLY ENTRY',
      '5.3':  'CARDEX-ONLY ENTRY',
      '5.4':  'ACCOUNT MISMATCH',
      '5.5':  'NET-ZERO DMAAI PAIR',
      '5.6':  'STANDARD COST CHANGE',
      '5.7':  'MIXED LINE TYPES',
      '5.18': 'DUPLICATE SHIPMENT',
      '5.19': 'TRANSFER INTEGRITY',
      '5.11': 'GL EXCESS',
      '5.13': 'POST-CONFIRM ORDER EDIT',
      '5.14': 'PERIOD MISMATCH',
      '5.15': 'R31802A ORPHAN CARDEX ROW',
      '5.16': 'MFG COST MISMATCH',
      '5.17': 'VOUCHER VARIANCE ON INVENTORY',
      '5.20': 'COMPLETION NOT IN GL',
    };
    return map[p] || (findings && findings.patternLabel ? findings.patternLabel.toUpperCase() : 'VARIANCE');
  },

  // Standard inventory-side DMAAI pair by manufacturing doc type. Used
  // by Pattern 5.15's WHAT card to name the AAIs the analyst should
  // review if the GL row turns up on a different account in JDE F0911
  // (i.e. one of these AAIs is misrouted for this routing).
  _mfgDocTypePair(dt) {
    const t = String(dt || '').trim().toUpperCase();
    return ({
      IC: ['3130', '3120'],
      IM: ['3110', '3120'],
      IH: ['3120', '3401'],
      IS: ['3130', '3120'],
    })[t] || null;
  },

  _r31802aOrphanWhat(data, findings) {
    // Re-locate the orphan so we can name its specifics.
    const targetVar = Math.abs(findings.variance);
    const orphan = data.f4111Rows.find(fr => {
      const amt = Math.abs(fr.cardexAmt || 0);
      if (Math.abs(amt - targetVar) > 0.01) return false;
      return !data.f0911Inv.some(g =>
        String(g.account || '').trim() === String(fr.account || '').trim() &&
        Math.abs(Math.abs(g.ledgerAmt || 0) - amt) < 0.01
      );
    });
    const amt   = orphan ? Helpers.money(orphan.cardexAmt) : Helpers.money(findings.variance);
    const acct  = (orphan && orphan.account) || (data.f4111Rows[0] && data.f4111Rows[0].account) || '—';
    const batch = (orphan && orphan.batch)   || '[batch]';
    const item  = (orphan && orphan.item)    || '';
    const orphanQty = orphan && Math.abs(orphan.qty || 0);
    const glcl  = (orphan && orphan.glclass) || '';
    const twin  = this._findOrphanTwin(data, orphan);
    const twinQty = twin && Math.abs(twin.qty || 0);
    const pair  = this._mfgDocTypePair(data.dt);
    // Format qty as a tidy number (drop trailing zeros on integers).
    const fmtQty = q => (q == null) ? null : Number(q).toString();
    // WO completion docs have no line number — qty is the differentiator
    // between the orphan and the twin. Include it in the row-identifying
    // metadata so the analyst can spot which F4111 row is which on the
    // source sheet without scrolling to compare.
    const orphanMeta = [
      item && `item ${item}`,
      orphanQty ? `qty ${fmtQty(orphanQty)}` : null,
      batch && `batch ${batch}`
    ].filter(Boolean).join(', ');
    const dmaaisHint = pair
      ? `DMAAIs ${pair[0]} and ${pair[1]}${glcl ? ' for GL class ' + glcl : ''}`
      : 'the doc\'s DMAAI pair';
    const methodLine = this._costMethodSummary(data.f4111Rows);
    const lines = [];
    if (methodLine) lines.push(`• Cost method (F4111 Ext): ${methodLine}`);
    lines.push(
      `• Orphan F4111 row: ${amt} on ${acct}${orphanMeta ? ' (' + orphanMeta + ')' : ''} — no matching F0911 entry`,
      `• This single row carries the entire ${Helpers.money(findings.variance, true)} variance`
    );
    if (twin) {
      const twinDesc = twinQty ? `same item / account / unit cost, qty ${fmtQty(twinQty)}` : 'same item / account / unit cost';
      lines.push(`• Twin F4111 row (${twinDesc}) DID post — identical inputs, different outcomes`);
    }
    lines.push(`• Before posting the JE, confirm in JDE F0911 for batch ${batch} across all accounts`);
    lines.push(`• If found on a different account, review ${dmaaisHint} in the DMAAs section of the source sheet — one is misrouted for this doc's routing`);
    return lines.join('\n');
  },

  _r31802aOrphanExplanation(data, orphan) {
    const twin = this._findOrphanTwin(data, orphan);
    if (twin) {
      // With a twin, two of the four causes are ruled out (filtering
      // and processing errors would have affected both rows uniformly).
      return [
        `• Partial / interrupted R31802A run — identical-data twin posted, this row didn't (the textbook fingerprint)`,
        `• Stale "already processed" flag set on the orphan F4111 row, blocking re-posting`
      ].join('\n');
    }
    // No twin — all four real causes are in scope.
    return [
      `• Processing error during R31802A — most often missing cost components on the item (no rollup → no variance → no F0911)`,
      `• R31802A run was interrupted partway through`,
      `• Version / selection PO on the R31802A version excluded the row (cost type, GL class, sub-ledger filter)`,
      `• "Already processed" flag set on the F4111 row, blocking re-posting`
    ].join('\n');
  },

  _r31802aOrphanResolution(data, findings, orphan) {
    const amt    = Helpers.money(orphan && Math.abs(orphan.cardexAmt));
    const acct   = (orphan && orphan.account) || '[orphan F4111 account]';
    const batch  = (orphan && orphan.batch)   || '[batch]';
    const dtRaw  = (data.dt || '').trim().toUpperCase();
    const cp     = this._counterpartAaiForDocType(dtRaw);
    const cardexIsDebit = orphan && (orphan.cardexAmt || 0) > 0;

    // Resolve the counterpart account from the preloaded F4095 if loaded.
    // When we can't (no preload, or F4095 has no row for this routing),
    // fall back to the plain-English account name so the JE reads
    // cleanly — the analyst substitutes the actual JDE account once
    // they look it up.
    let counterpartLine;
    if (cp && typeof SystemContext !== 'undefined' && SystemContext.isLoaded()) {
      const f4111 = data.f4111Rows[0] || null;
      const cpRow = SystemContext.lookupAAI({
        company:   data.company,
        table:     cp.aai,
        docType:   dtRaw,
        glClass:   (f4111 && f4111.glclass) || '',
        orderType: data.ot || (data.docHeader && data.docHeader.ot) || ''
      });
      counterpartLine = cpRow && cpRow.aaiaccount
        ? `${cpRow.aaiaccount}   (DMAAI ${cp.aai} — ${cp.shortLabel})`
        : `${cp.plainName}   (DMAAI ${cp.aai})`;
    } else if (cp) {
      counterpartLine = `${cp.plainName}   (DMAAI ${cp.aai})`;
    } else {
      counterpartLine = `counterpart account (DMAAI pair for ${dtRaw})`;
    }

    // Direction follows the cardex sign — a positive cardex amount is a
    // debit on the inventory side, so the orphan account takes the Dr
    // and the counterpart takes the Cr (and vice versa).
    const drAcct = cardexIsDebit ? acct : counterpartLine;
    const crAcct = cardexIsDebit ? counterpartLine : acct;

    return `Post the journal entry R31802A should have posted on its own:\n\n   Dr  ${drAcct}   ${amt}\n   Cr  ${crAcct}   ${amt}\n\nThe orphan F4111 row above is the ${cardexIsDebit ? 'inventory-side debit' : 'inventory-side credit'}; the counterpart is the other side R31802A would have hit through standard DMAAI routing. As a cleaner alternative, re-run R31802A for batch ${batch} — that lets the AAI configuration drive the posting and leaves no manual entry in the GL.`;
  },

  _periodMismatchResolution(data, findings) {
    const periods = Array.from(new Set(data.rrSummary.map(r => r.period && (r.period.toString ? r.period.toString().slice(0, 10) : r.period)).filter(Boolean)));
    const acct = data.rrSummary[0] && data.rrSummary[0].account;
    return `Step 1.  Confirm the discrepancy is period, not account. Both RR Summary rows here have account ${acct || '[same account]'}; the periods are ${periods.join(' and ')}. If the accounts also differ, escalate to the account-mismatch pattern instead — it's a different fix.

Step 2 (immediate fix).  Post a journal entry that reverses the GL amount out of the wrong period and re-posts it in the right one. Use the F4111 transaction date / period as the target. The amounts are equal and opposite; net P&L impact is zero, but the period attribution is corrected.

Step 3 (preventative fix).  Find the program that wrote the F0911 entry (the BT column on the F0911 Inv row points at the batch type: SO ⇒ R42800, IM/IC/IH ⇒ R31802A, OP/OV ⇒ P4312/P43214). Check its GL Date processing option:
  - R42800 PO 1 — "GL Date for Sales Update"
  - R31802A PO 1 — "GL Date Source"
  - P4312 PO 2 / P43214 PO 2 — "GL Date" override
If the option is set to use the system run date, change it to use the transaction date (F4111 TransDate, or the SOP processing date). Every future post will then land in the right period.

Step 4 (sweep).  This pattern usually isn't a one-off — once the processing option is wrong, every batch the program runs in the affected period drifts. Pull F0911 for the batch numbers that appear on this document and check whether sibling docs in the same batch have the same period mismatch. If they do, the corrective JE above needs to cover all of them, not just this one document.`;
  },

  _postConfirmOrderEditResolution(data, findings) {
    const invAcct = (data.f0911Inv[0] && data.f0911Inv[0].account) || data.account || 'the inventory account';
    const variance = Math.abs(findings.variance);
    const varianceStr = Helpers.money(variance);
    return `Step 1.  Confirm what physically shipped. Pull the warehouse pick ticket or shipment confirmation paperwork for doc ${data.doc}. The cardex (F4111) reflects what the warehouse said left the building at ship-confirm; the GL reflects the post-edit order qty. Whichever matches the physical reality is the truth, and the other side needs correcting.\n\nStep 2.  If the cardex is correct (the most common case — the post-confirm edit was unauthorized): post a reversing journal entry to bring the GL into line with cardex.\n   Dr  ${invAcct}  ${varianceStr}  (reverse the over-credit)\n   Cr  COGS / Sales Cost  ${varianceStr}  (reverse the over-debit on the COGS side)\n   The exact COGS account is the one AAI 4220 resolves to for this company / GL class. Confirm in JDE before posting.\n\nStep 3.  If the GL is correct (the post-edit qty actually shipped after the original confirm — e.g. a follow-on partial fill that was added to the order): the cardex is missing rows. Use a JDE-side cardex repost (R41544 or a manual F4111 insert via a trusted tool) to write the missing inventory movements. Do NOT post a JE in this case — you'd double-count the inventory drawdown.\n\nStep 4.  Prevent recurrence. Cardex-vs-GL variances on closed sales orders are usually unauthorized post-confirm edits. Address it in JDE configuration:\n   (a)  Order Activity Rules — set the post-ship-confirm status (typically 540 → 560) as the terminal editable status for this doc type's activity ruleset. Edits past that status are blocked at the rule level.\n   (b)  Inventory In Hand flag (F4211.IVI) — confirm it's being set to 1 at ship-confirm. When set, P4210 / P42101 refuse line edits at the row level. This is the second line of defense if Activity Rules permit edits.\n   (c)  Role restrictions — remove P4210 / P42101 edit access for users whose role doesn't legitimately need post-confirm corrections. For the few roles that do, route edits through a workflow that requires manager approval.\n\nStep 5.  Sweep for the same pattern. The same root cause is likely affecting other closed orders. Query F4211 for lines with NxtSts ≥ 540 where the line qty changed AFTER ship-confirm (compare against F42199 history if available, or filter by last-modified timestamp > shipment-confirm timestamp). Each match is a candidate for the same correction. The Evidence list on this report gives you the columns and accounts to write the sweep query against.\n\nStep 6.  Refresh RapidReconciler and re-analyze. The variance on this document should clear once Step 2 (or Step 3) is posted. Steps 4 and 5 prevent the next occurrence.`;
  }
};

/* ====================================================================
   buildTransactionDetailData(rows, orders, opts)

   Replicates the section-split + totals logic that lives INSIDE the
   analyzer page's TransactionDetailTemplate.parse() AFTER the ExcelJS
   row read (was analysis-workbook.html lines 5494-5527), plus the orders
   array. Lets a caller that already has plain row objects (e.g. from an
   API) build the same `data` object the analyzer produces from a dropped
   workbook -- without ExcelJS.

   `rows`   array of objects with the SAME field names parse() emits:
            rowNumber, source, period, account, company, transdate, gldate,
            glclass, batch, bt, doc, dt, ordernum, ot, pc, line, ext, branch,
            item, qty, unitcost, cardexAmt, ledgerAmt, comment.
   `orders` (optional) Orders-section array shaped like _parseOrdersSection()
            output (..., linety, nxtsts, ...). Defaults to []. Pattern 5.7 only
            fires when present, same as an export with an Orders section.
   `opts`   (optional) { sheetName, headerRow } threaded through for the
            analyzer's render/source-highlight path; a rows-only caller omits.
==================================================================== */
function buildTransactionDetailData(rows, orders, opts) {
  rows = rows || [];
  orders = orders || [];
  opts = opts || {};
  // Sections
  const docHeader = rows.find(r => /doc.*header/i.test(r.source));
  // The Source column uses different labels across exports -- some use
  // "RR Summary", production uses "RapidRec" / "RapidRec Tot". Match both.
  const rrSummary = rows.filter(r => /rr.*summary|^summary$|rapidrec/i.test(r.source) && !/tot$/i.test(r.source));
  const f4111Rows = rows.filter(r => /f4111/i.test(r.source) && !/^f4111\s*tot/i.test(r.source));
  const f0911Inv = rows.filter(r => /f0911.*inv/i.test(r.source));
  const f0911Exp = rows.filter(r => /f0911.*exp/i.test(r.source));
  const unassigned = rows.filter(r => /unassigned/i.test(r.source));
  const dmaas = rows.filter(r => /dmaa/i.test(r.source));

  const f4111Tot = f4111Rows.reduce((a, r) => a + r.cardexAmt, 0);
  const f0911InvTot = f0911Inv.reduce((a, r) => a + r.ledgerAmt, 0);
  const variance = f4111Tot - f0911InvTot;

  return {
    sheetName: opts.sheetName, headerRow: opts.headerRow, rows,
    docHeader, rrSummary, f4111Rows, f0911Inv, f0911Exp, unassigned, dmaas, orders,
    f4111Tot, f0911InvTot, variance,
    doc: docHeader ? docHeader.doc : (rows[0] && rows[0].doc) || "?",
    dt: docHeader ? docHeader.dt : "?",
    ordernum: docHeader ? docHeader.ordernum : "?",
    ot: docHeader ? docHeader.ot : "?",
    company: docHeader ? docHeader.company : (rows[0] && rows[0].company) || "?",
    period: docHeader ? docHeader.period : (rows[0] && rows[0].period) || "?",
    account: docHeader ? docHeader.account : (rows[0] && rows[0].account) || ""
  };
}

/* ====================================================================
   analyzeTransactionDetail(data)

   Runs TXD.classify(data) and ALSO produces the WHAT / WHY / HOW /
   strip-label / notes text the analyzer page render() path produces -- so
   an API-fed caller (home.html) gets the full analysis surface without
   touching ExcelJS. `how` mirrors _howBody exactly: a string for
   prose-only patterns, or an array of { type:"prose"|"jeFlowMatrix", ... }
   sections for the JE-matrix patterns (same shape render() branches on).
==================================================================== */
function analyzeTransactionDetail(data) {
  const findings = TXD.classify(data);
  return {
    findings: findings,
    what:         TXD._whatBody(data, findings),
    why:          TXD._whyBody(data, findings),
    how:          TXD._howBody(data, findings),
    stripLabel:   TXD._stripLabelForPattern(findings),
    notesContext: TXD._notesContext(data)
  };
}

  window.RRAnalyzerEngine = {
    Helpers: Helpers,
    Priority: Priority,
    CostMethodKnowledge: CostMethodKnowledge,
    DMAAIKnowledge: DMAAIKnowledge,
    txdModuleForDt: txdModuleForDt,
    txdAppliesToModule: txdAppliesToModule,
    TXD: TXD,
    buildTransactionDetailData: buildTransactionDetailData,
    analyzeTransactionDetail: analyzeTransactionDetail
  };
})();