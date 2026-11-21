/* ============================================================================
   RRV8.batchAnalysis — Home > Reports > Batch Analysis (UI-270).

   The analyst types a batch number; the report lists every F4111 line and every
   F0911 line in that batch, each grouped by account, and puts the two side by
   side per inventory account so the account that does not tie is the first
   thing on screen. Everything exports to one audit-quality workbook.

   Asked for by the owner 2026-11-20 for a V7 customer whose manufacturing batch
   ties overall while one document in it does not (RapidReconciler-Valc#731).

   WHY A FILE OF ITS OWN. home.html is one 1.2 MB page. The grouping, the tie and
   the export here are arithmetic an analyst will hand to an auditor, so they are
   pure functions a Node test can call (RRV8/scripts/test-batch-analysis.js),
   with no DOM and no network.

   WHY THE FETCH STAYS IN home.html. The request goes through home.html's
   rrFetch with a literal area, `inventory/reports/batch-analysis`, so
   Tools/v8-callsites.py can see the call site. This file is handed a `load`
   function and never builds a URL.

   THE SERVER SHAPE (BatchAnalysisController, RRV8/API.md):
     { batch, scope: 'ok' | 'no-scope',
       cardex: [ {Company, ShortAccount, Account, AccountDescription, DocType,
                  DocNumber, OrderType, OrderNumber, LineNumber, Branch,
                  ShortItem, ItemNumber, Location, Lot, GLClass, GLDate,
                  Quantity, UOM, UnitCost, Amount, PostingCode, Explanation} ],
       ledger: [ {Company, ShortAccount, Account, AccountDescription,
                  InventoryAccount (0|1), DocType, DocNumber, LineNumber,
                  LineExtension, GLDate, BatchType, PostCode, LedgerType,
                  Subledger, OrderType, PurchaseOrder, Amount, Explanation,
                  Remark} ],
       outOfScope: { cardex, ledger } }

   THE TIE. Per company + inventory account: F4111 amount less F0911 amount.
   An F4111 line's account is the inventory account RapidReconciler assigned its
   item; an F0911 line is "inventory" when RInvAccountList lists its account. A
   difference of half a cent or more is a difference. There are no percentages:
   a batch either ties on an account or it does not.

   ⚠ NO "BATCH IS OUT OF BALANCE" VERDICT, AND THAT IS DELIBERATE. The first cut
   summed every F0911 line and called a non-zero net "out of balance in the GL".
   On Demo1 batch 13298823 it said so for a batch JDE balanced, because
   RapidReconciler's F0911 holds ONLY lines whose account is in its own F0901
   (usp8_apply_f0911.sql: "The account filter (rows whose GLAID exists in F0901)
   is applied UPSTREAM"). The other half of a manufacturing entry is usually on an
   account it never loads. So the offset accounts are shown with their total and
   a plain statement of what is and is not here, never a balance verdict.
   ============================================================================ */
(function (global) {
  'use strict';

  var TIE_TOLERANCE = 0.005;
  var MAX_BATCH = 2147483647;
  var NO_ACCOUNT = 'No inventory account';
  // Expand every group by default only while the page stays light.
  var AUTO_EXPAND_LINES = 300;

  // ------------------------------------------------------------------ columns

  // kind: 'text' | 'num' (2dp money) | 'qty' (4dp) | 'cost' (4dp) | 'id' (integer identifier)
  var CARDEX_COLS = [
    { key: 'Company',     label: 'Company',      kind: 'text' },
    { key: 'DocType',     label: 'Doc Type',     kind: 'text' },
    { key: 'DocNumber',   label: 'Doc Number',   kind: 'id' },
    { key: 'OrderType',   label: 'Order Type',   kind: 'text' },
    { key: 'OrderNumber', label: 'Order Number', kind: 'id' },
    { key: 'LineNumber',  label: 'Line',         kind: 'line' },
    { key: 'Branch',      label: 'Branch/Plant', kind: 'text' },
    { key: 'ItemNumber',  label: 'Item',         kind: 'text' },
    { key: 'Location',    label: 'Location',     kind: 'text' },
    { key: 'Lot',         label: 'Lot',          kind: 'text' },
    { key: 'GLClass',     label: 'GL Class',     kind: 'text' },
    { key: 'GLDate',      label: 'GL Date',      kind: 'text' },
    { key: 'Quantity',    label: 'Quantity',     kind: 'qty' },
    { key: 'UOM',         label: 'UOM',          kind: 'text' },
    { key: 'UnitCost',    label: 'Unit Cost',    kind: 'cost' },
    { key: 'Amount',      label: 'Amount',       kind: 'num' },
    { key: 'PostingCode', label: 'Posting Code', kind: 'text' },
    { key: 'Explanation', label: 'Explanation',  kind: 'text' }
  ];
  var LEDGER_COLS = [
    { key: 'Company',       label: 'Company',      kind: 'text' },
    { key: 'DocType',       label: 'Doc Type',     kind: 'text' },
    { key: 'DocNumber',     label: 'Doc Number',   kind: 'id' },
    { key: 'LineNumber',    label: 'Line',         kind: 'line' },
    { key: 'LineExtension', label: 'Ext',          kind: 'text' },
    { key: 'GLDate',        label: 'GL Date',      kind: 'text' },
    { key: 'BatchType',     label: 'Batch Type',   kind: 'text' },
    { key: 'PostCode',      label: 'Posted',       kind: 'text' },
    { key: 'LedgerType',    label: 'Ledger',       kind: 'text' },
    { key: 'Subledger',     label: 'Subledger',    kind: 'text' },
    { key: 'OrderType',     label: 'Order Type',   kind: 'text' },
    { key: 'PurchaseOrder', label: 'PO',           kind: 'text' },
    { key: 'Amount',        label: 'Amount',       kind: 'num' },
    { key: 'Explanation',   label: 'Explanation',  kind: 'text' },
    { key: 'Remark',        label: 'Remark',       kind: 'text' }
  ];
  var NUMERIC = { num: 1, qty: 1, cost: 1, id: 1, line: 1 };

  // ------------------------------------------------------------- pure helpers

  /** '13298823' -> {batch: 13298823}; anything else -> {error: '...'}. Mirrors the server's parseBatch. */
  function parseBatchInput(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { error: 'Enter a batch number.' };
    if (!/^[0-9]{1,10}$/.test(s)) return { error: 'A batch number is digits only.' };
    var n = Number(s);
    if (n < 1 || n > MAX_BATCH) return { error: 'A batch number is between 1 and ' + MAX_BATCH + '.' };
    return { batch: n };
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function txt(v) { return v == null ? '' : String(v); }
  function accountOf(r) { var a = txt(r.Account).trim(); return a || NO_ACCOUNT; }
  function groupKey(r) { return txt(r.Company).trim() + '|' + accountOf(r); }

  /** Rows -> groups by company + account, in account order, each with its own total. */
  function groupLines(rows) {
    var by = {}, order = [];
    (rows || []).forEach(function (r) {
      var k = groupKey(r);
      var g = by[k];
      if (!g) {
        g = by[k] = { key: k, company: txt(r.Company).trim(), account: accountOf(r),
                      description: txt(r.AccountDescription).trim(), inventory: null, rows: [], amount: 0 };
        order.push(g);
      }
      if (!g.description && r.AccountDescription) g.description = txt(r.AccountDescription).trim();
      if (r.InventoryAccount != null) g.inventory = num(r.InventoryAccount) === 1;
      g.rows.push(r);
      g.amount += num(r.Amount);
    });
    order.sort(function (a, b) {
      // The placeholder group goes last: it is the exception, not an account.
      var na = a.account === NO_ACCOUNT, nb = b.account === NO_ACCOUNT;
      if (na !== nb) return na ? 1 : -1;
      return a.company.localeCompare(b.company) || a.account.localeCompare(b.account);
    });
    return order;
  }

  function sum(rows) { return (rows || []).reduce(function (s, r) { return s + num(r.Amount); }, 0); }
  function round2(v) { return Math.round(v * 100) / 100; }
  function ties(diff) { return Math.abs(diff) < TIE_TOLERANCE; }

  /**
   * The whole report from one payload. `accounts` is the tie: every inventory
   * account either side touched. `offsets` is every F0911 account in the batch
   * that is not an inventory account (the other side of the entry, usually).
   */
  function buildModel(p) {
    p = p || {};
    var cardex = p.cardex || [], ledger = p.ledger || [];
    // An F4111 line whose item RapidReconciler never resolved has no item number of its
    // own; the short item number is still on the line, so the grid shows that.
    cardex.forEach(function (r) { if (!txt(r.ItemNumber).trim() && r.ShortItem != null) r.ItemNumber = String(r.ShortItem); });
    var cg = groupLines(cardex), lg = groupLines(ledger);
    var tie = {}, accounts = [], offsets = [];
    function row(g) {
      var t = tie[g.key];
      if (!t) {
        t = tie[g.key] = { key: g.key, company: g.company, account: g.account, description: g.description,
                           cxLines: 0, cxAmount: 0, glLines: 0, glAmount: 0 };
        accounts.push(t);
      }
      if (!t.description && g.description) t.description = g.description;
      return t;
    }
    cg.forEach(function (g) { var t = row(g); t.cxLines = g.rows.length; t.cxAmount = g.amount; });
    lg.forEach(function (g) {
      if (g.inventory === false) {
        offsets.push({ key: g.key, company: g.company, account: g.account, description: g.description,
                       glLines: g.rows.length, glAmount: g.amount });
        return;
      }
      var t = row(g); t.glLines = g.rows.length; t.glAmount = g.amount;
    });
    accounts.forEach(function (t) { t.diff = t.cxAmount - t.glAmount; t.ties = ties(t.diff); });
    // Accounts that do not tie first, largest difference first; then the rest by account.
    accounts.sort(function (a, b) {
      if (a.ties !== b.ties) return a.ties ? 1 : -1;
      if (!a.ties) return Math.abs(b.diff) - Math.abs(a.diff);
      return a.company.localeCompare(b.company) || a.account.localeCompare(b.account);
    });
    var cxTotal = sum(cardex);
    var glInv = 0, glInvLines = 0, glAll = sum(ledger);
    ledger.forEach(function (r) { if (num(r.InventoryAccount) === 1) { glInv += num(r.Amount); glInvLines++; } });
    var types = {}, dates = [];
    ledger.forEach(function (r) { var t = txt(r.BatchType).trim(); if (t) types[t] = 1; if (r.GLDate) dates.push(txt(r.GLDate)); });
    cardex.forEach(function (r) { if (r.GLDate) dates.push(txt(r.GLDate)); });
    dates.sort();
    var oos = p.outOfScope || {};
    return {
      batch: p.batch, scope: p.scope || 'ok',
      cardex: cardex, ledger: ledger, cardexGroups: cg, ledgerGroups: lg,
      accounts: accounts, offsets: offsets,
      totals: { cardex: cxTotal, ledgerInventory: glInv, ledgerInventoryLines: glInvLines,
                diff: cxTotal - glInv, ties: ties(cxTotal - glInv),
                // Offset accounts RapidReconciler loads. NOT the rest of the batch: see the header.
                ledgerOther: glAll - glInv, ledgerOtherLines: ledger.length - glInvLines,
                notTied: accounts.filter(function (a) { return !a.ties; }).length },
      batchTypes: Object.keys(types).sort(),
      firstDate: dates[0] || '', lastDate: dates[dates.length - 1] || '',
      outOfScope: { cardex: num(oos.cardex), ledger: num(oos.ledger) }
    };
  }

  /** The cell text a search sees and the grid shows. */
  function cellText(col, v) {
    if (v == null || v === '') return '';
    if (col.kind === 'num')  return fmtMoney(v);
    if (col.kind === 'qty' || col.kind === 'cost') return fmtDec(v, 4);
    if (col.kind === 'line') return fmtLine(v);
    if (col.kind === 'id') return num(v) === 0 ? '' : String(Math.round(num(v)));
    return txt(v);
  }
  function fmtMoney(v) {
    var n = round2(num(v));
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? '(' + s + ')' : s;
  }
  function fmtDec(v, dp) {
    var n = num(v);
    var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dp });
    return n < 0 ? '-' + s : s;
  }
  function fmtLine(v) {
    var n = num(v);
    return (Math.round(n) === n) ? String(n) : n.toFixed(3).replace(/0+$/, '');
  }

  /**
   * GRID-STANDARDS §8: case-insensitive substring across the visible columns, and
   * a leading `^` anchors the match to the start of a cell.
   */
  function matcher(query, cols) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return null;
    var anchored = q.charAt(0) === '^';
    if (anchored) q = q.slice(1);
    if (!q) return null;
    return function (r) {
      for (var i = 0; i < cols.length; i++) {
        var t = cellText(cols[i], r[cols[i].key]).toLowerCase();
        if (anchored ? t.indexOf(q) === 0 : t.indexOf(q) !== -1) return true;
      }
      // The group's account and description are searchable too.
      var a = (accountOf(r) + ' ' + txt(r.AccountDescription)).toLowerCase();
      return anchored ? a.indexOf(q) === 0 : a.indexOf(q) !== -1;
    };
  }

  /** Groups narrowed to the lines that match, each with its own matched total. Empty groups drop out. */
  function filterGroups(groups, query, cols) {
    var m = matcher(query, cols);
    if (!m) return groups.map(function (g) { return Object.assign({}, g, { shown: g.rows, shownAmount: g.amount }); });
    var out = [];
    groups.forEach(function (g) {
      var rows = g.rows.filter(m);
      if (rows.length) out.push(Object.assign({}, g, { shown: rows, shownAmount: sum(rows) }));
    });
    return out;
  }

  function sortRows(rows, sort, cols) {
    if (!sort || !sort.key) return rows;
    var col = cols.filter(function (c) { return c.key === sort.key; })[0];
    if (!col) return rows;
    var isNum = !!NUMERIC[col.kind], d = sort.dir < 0 ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      if (isNum) return (num(a[col.key]) - num(b[col.key])) * d;
      return txt(a[col.key]).localeCompare(txt(b[col.key])) * d;
    });
  }

  // ------------------------------------------------------------------ export

  function xlsxCell(col, v) {
    if (NUMERIC[col.kind]) {
      if (v == null || v === '') return '';
      if (col.kind === 'id' && num(v) === 0) return '';   // GRID-STANDARDS §4: 0 identifiers stay empty
      return num(v);
    }
    return txt(v);
  }
  var FMT = { num: null, qty: '#,##0.0000;-#,##0.0000', cost: '#,##0.0000;-#,##0.0000', id: '0', line: '0.000' };

  /**
   * The three sheets as plain data, so a test can read them without SheetJS.
   * Line sheets carry Account + Description in front, a subtotal row after each
   * account, and a grand total; `subtotalRows` are the data-row indexes to bold.
   */
  function exportSheets(model, state) {
    state = state || {};
    var q = state.query || '';
    var titleBase = 'Batch Analysis — batch ' + model.batch;
    var scopeLine = (model.batchTypes.length ? 'Batch type ' + model.batchTypes.join(', ') + ' · ' : '')
      + (model.firstDate ? 'GL dates ' + model.firstDate + (model.lastDate !== model.firstDate ? ' to ' + model.lastDate : '') + ' · ' : '')
      + model.cardex.length + ' F4111 lines · ' + model.ledger.length + ' F0911 lines'
      + (state.generated ? ' · Generated ' + state.generated : '');
    var notes = [];
    var hidden = model.outOfScope.cardex + model.outOfScope.ledger;
    if (hidden) notes.push(hidden + ' line' + (hidden === 1 ? '' : 's') + ' in companies outside your access are not included.');
    if (q) notes.push('Line sheets filtered to "' + q + '".');

    // By account
    var acctCols = [
      { label: 'Company' }, { label: 'Account' }, { label: 'Description' },
      { label: 'F4111 Lines', num: true, fmt: '#,##0' }, { label: 'F4111 Amount', num: true },
      { label: 'F0911 Lines', num: true, fmt: '#,##0' }, { label: 'F0911 Amount', num: true },
      { label: 'Difference (F4111 less F0911)', num: true }, { label: 'Ties' }
    ];
    var acctRows = model.accounts.map(function (a) {
      return [a.company, a.account, a.description, a.cxLines, round2(a.cxAmount), a.glLines, round2(a.glAmount),
              round2(a.diff), a.ties ? 'Yes' : 'No'];
    });
    var acctTotal = ['Inventory accounts', '', '', model.cardex.length, round2(model.totals.cardex), '',
                     round2(model.totals.ledgerInventory), round2(model.totals.diff), model.totals.ties ? 'Yes' : 'No'];
    var subtotalRows = [];
    if (model.offsets.length) {
      acctRows.push(['', '', '', '', '', '', '', '', '']);
      acctRows.push(['Other accounts (F0911 only; RapidReconciler loads only the accounts it reconciles, so this is not the rest of the batch)', '', '', '', '', '', '', '', '']);
      subtotalRows.push(acctRows.length - 1);
      model.offsets.forEach(function (o) {
        acctRows.push([o.company, o.account, o.description, '', '', o.glLines, round2(o.glAmount), '', '']);
      });
      acctRows.push(['Other accounts total', '', '', '', '', model.totals.ledgerOtherLines, round2(model.totals.ledgerOther), '', '']);
      subtotalRows.push(acctRows.length - 1);
    }
    var sheets = [{
      name: 'By account', columns: acctCols, rows: acctRows, totalRow: acctTotal, subtotalRows: subtotalRows,
      titleLines: [titleBase + ': F4111 against F0911 by account', scopeLine].concat(notes)
    }];

    function lineSheet(name, groups, cols, title) {
      var shown = filterGroups(groups, q, cols);
      var columns = [{ label: 'Account' }, { label: 'Description' }].concat(cols.map(function (c) {
        return { label: c.label, num: !!NUMERIC[c.kind], fmt: FMT[c.kind] || undefined };
      }));
      var amtIdx = 2 + cols.map(function (c) { return c.key; }).indexOf('Amount');
      var rows = [], subs = [], total = 0, count = 0;
      shown.forEach(function (g) {
        sortRows(g.shown, state.sort && state.sort[name], cols).forEach(function (r) {
          rows.push([g.account, g.description].concat(cols.map(function (c) { return xlsxCell(c, r[c.key]); })));
        });
        var sub = new Array(columns.length).fill('');
        sub[0] = 'Subtotal ' + g.account; sub[1] = g.shown.length + ' line' + (g.shown.length === 1 ? '' : 's');
        sub[amtIdx] = round2(g.shownAmount);
        rows.push(sub); subs.push(rows.length - 1);
        total += g.shownAmount; count += g.shown.length;
      });
      var tot = new Array(columns.length).fill('');
      tot[0] = 'Total'; tot[1] = count + ' line' + (count === 1 ? '' : 's'); tot[amtIdx] = round2(total);
      return { name: name, columns: columns, rows: rows, totalRow: tot, subtotalRows: subs,
               titleLines: [titleBase + ': ' + title, scopeLine].concat(notes) };
    }
    sheets.push(lineSheet('F4111 lines', model.cardexGroups, CARDEX_COLS, 'F4111 lines by account'));
    sheets.push(lineSheet('F0911 lines', model.ledgerGroups, LEDGER_COLS, 'F0911 lines by account'));
    return sheets;
  }

  /** Build and save the workbook. Needs xlsx-js-style, Tools/audit-workbook.js and export-guard.js. */
  function exportWorkbook(model, state, report) {
    var run = function () {
      if (!global.XLSX || typeof global.buildAuditSheet !== 'function') {
        if (report) report('Batch Analysis export unavailable — the Excel library did not load. Reload the page.');
        return false;
      }
      var stamp = new Date().toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      var sheets = exportSheets(model, Object.assign({}, state, { generated: stamp }));
      var wb = global.XLSX.utils.book_new();
      sheets.forEach(function (s) {
        var ws = global.buildAuditSheet(s);
        // Bold the subtotal rows. Data starts after the title lines, one blank row and the header.
        var first = s.titleLines.length + 2;
        var range = global.XLSX.utils.decode_range(ws['!ref']);
        s.subtotalRows.forEach(function (i) {
          for (var c = range.s.c; c <= range.e.c; c++) {
            var cell = ws[global.XLSX.utils.encode_cell({ r: first + i, c: c })]; if (!cell) continue;
            cell.s = cell.s || {};
            cell.s.font = { bold: true, color: { rgb: '1F2D4A' } };
            cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'F7F9FC' } };
          }
        });
        global.XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
      });
      var fname = global.RRV8.exportName({ surface: 'BatchAnalysis', drill: 'Batch' + model.batch });
      return global.RRV8.saveWorkbook(wb, fname, report, 'Batch Analysis');
    };
    return (global.RRV8 && global.RRV8.runExport) ? global.RRV8.runExport('Batch Analysis', report, run) : run();
  }

  // -------------------------------------------------------------------- view

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v, extra) {
    var n = round2(num(v));
    return '<td class="is-num' + (n < 0 ? ' is-neg' : '') + (extra ? ' ' + extra : '') + '">' + esc(fmtMoney(n)) + '</td>';
  }

  var S = null;   // view state; one report panel per page
  function freshState() {
    return { gen: 0, busy: false, model: null, error: '', view: 'accounts', query: '',
             open: { cardex: {}, ledger: {} }, sort: {}, lastInput: '' };
  }

  /**
   * deps: { load(batch) -> Promise<payload>, toast(msg) }.
   * Paints into `host` (an empty element) and wires it once.
   */
  function mount(host, deps) {
    if (!host) return;
    if (!S) S = freshState();
    S.host = host; S.deps = deps || {};
    if (!host._baWired) {
      host._baWired = true;
      host.innerHTML = shellHtml();
      wire(host);
    }
    paint();
  }

  /** DB switch: the report belongs to the database it was read from. */
  function reset() {
    var host = S && S.host, deps = S && S.deps;
    S = freshState();
    if (host) {
      S.host = host; S.deps = deps;
      var input = host.querySelector('#baBatch'); if (input) input.value = '';
      paint();
    }
  }

  function shellHtml() {
    return ''
      + '<div class="ba-head">'
      +   '<div><div class="ba-title">Batch Analysis</div>'
      +   '<div class="ba-lede">The F4111 and F0911 lines RapidReconciler holds for one batch, grouped by account, with the two compared on each inventory account.</div></div>'
      +   '<form class="ba-form" id="baForm" autocomplete="off" novalidate>'
      +     '<label class="ba-label" for="baBatch">Batch number</label>'
      +     '<input class="ba-input" id="baBatch" name="batch" type="text" inputmode="numeric" maxlength="10" spellcheck="false" aria-describedby="baStatus">'
      +     '<button class="ba-run" id="baRun" type="submit">Run report</button>'
      +   '</form>'
      + '</div>'
      + '<div class="ba-status" id="baStatus" role="status" aria-live="polite" hidden></div>'
      + '<div id="baBody"></div>';
  }

  function wire(host) {
    host.querySelector('#baForm').addEventListener('submit', function (e) { e.preventDefault(); run(); });
    host.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target : null; if (!t) return;
      var v = t.closest('[data-ba-view]');
      if (v) { S.view = v.getAttribute('data-ba-view'); paint(); return; }
      var g = t.closest('[data-ba-group]');
      if (g) {
        var side = g.getAttribute('data-ba-side'), k = g.getAttribute('data-ba-group');
        if (S.open[side][k]) delete S.open[side][k]; else S.open[side][k] = true;
        paint(); return;
      }
      var all = t.closest('[data-ba-expand]');
      if (all) {
        var sd = all.getAttribute('data-ba-expand'), on = all.getAttribute('data-ba-on') === '1';
        var groups = sd === 'cardex' ? S.model.cardexGroups : S.model.ledgerGroups;
        S.open[sd] = {};
        if (on) groups.forEach(function (gr) { S.open[sd][gr.key] = true; });
        paint(); return;
      }
      var jump = t.closest('[data-ba-jump]');
      if (jump) {
        var to = jump.getAttribute('data-ba-jump'), key = jump.getAttribute('data-ba-key');
        S.view = to; S.query = ''; S.open[to] = {}; S.open[to][key] = true;
        paint();
        var row = host.querySelector('[data-ba-group="' + cssEsc(key) + '"][data-ba-side="' + to + '"]');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }
      var th = t.closest('th[data-ba-sort]');
      if (th) {
        var sheet = th.getAttribute('data-ba-sheet'), key2 = th.getAttribute('data-ba-sort');
        var cur = S.sort[sheet];
        S.sort[sheet] = (cur && cur.key === key2) ? { key: key2, dir: -cur.dir } : { key: key2, dir: 1 };
        paint(); return;
      }
      if (t.closest('#baExport')) {
        exportWorkbook(S.model, { query: S.query, sort: S.sort }, S.deps.toast);
        return;
      }
    });
    host.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'baSearch') {
        S.query = e.target.value;
        clearTimeout(S._qt);
        S._qt = setTimeout(function () { paintBody(true); }, 180);
      }
    });
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function setStatus(msg, tone) {
    var el = S.host && S.host.querySelector('#baStatus'); if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.setAttribute('data-tone', tone || '');
  }

  function run() {
    var input = S.host.querySelector('#baBatch');
    var parsed = parseBatchInput(input && input.value);
    if (parsed.error) { setStatus(parsed.error, 'bad'); if (input) input.focus(); return; }
    if (typeof S.deps.load !== 'function') { setStatus('Batch Analysis cannot reach the server from this page.', 'bad'); return; }
    var gen = ++S.gen;
    S.busy = true; S.error = '';
    S.lastInput = String(parsed.batch);
    setStatus('Reading batch ' + parsed.batch + '…', 'busy');
    paint();
    S.deps.load(parsed.batch).then(function (payload) {
      if (gen !== S.gen) return;   // a newer run superseded this one
      S.busy = false;
      S.model = buildModel(payload || {});
      S.open = { cardex: {}, ledger: {} }; S.query = ''; S.view = 'accounts';
      if (S.model.cardex.length + S.model.ledger.length <= AUTO_EXPAND_LINES) {
        S.model.cardexGroups.forEach(function (g) { S.open.cardex[g.key] = true; });
        S.model.ledgerGroups.forEach(function (g) { S.open.ledger[g.key] = true; });
      }
      setStatus('', '');
      paint();
    }, function (err) {
      if (gen !== S.gen) return;
      S.busy = false; S.model = null;
      var st = err && err.status;
      S.error = (err && err.serverMessage) ? err.serverMessage
        : st === 403 ? 'Batch Analysis needs the analyst grant on this database.'
        : st === 404 ? 'This database’s services do not have Batch Analysis yet. They need the release that adds it.'
        : 'The batch could not be read: ' + ((err && err.message) || 'unknown error') + '.';
      setStatus(S.error, 'bad');
      paint();
    });
  }

  function paint() {
    if (!S || !S.host) return;
    var btn = S.host.querySelector('#baRun');
    if (btn) { btn.disabled = !!S.busy; btn.textContent = S.busy ? 'Running…' : 'Run report'; }
    paintBody(false);
  }

  function paintBody(keepSearchFocus) {
    var body = S.host.querySelector('#baBody'); if (!body) return;
    var m = S.model;
    if (!m) {
      body.innerHTML = S.busy ? '' : '<div class="ba-empty">Enter a batch number from JDE (the ICU on F4111 and F0911) and run the report.</div>';
      return;
    }
    if (m.scope === 'no-scope') {
      body.innerHTML = '<div class="ba-empty ba-warn">You have no companies on this database, so no lines can be shown. This does not mean the batch is empty. Ask your administrator to check your company access.</div>';
      return;
    }
    if (!m.cardex.length && !m.ledger.length) {
      var hid = m.outOfScope.cardex + m.outOfScope.ledger;
      body.innerHTML = '<div class="ba-empty">' + (hid
        ? 'Batch ' + esc(m.batch) + ' has ' + hid + ' line' + (hid === 1 ? '' : 's') + ', all in companies outside your access.'
        : 'This database holds no F4111 or F0911 lines for batch ' + esc(m.batch) + '. Check the number, and that the batch falls inside the dates this database holds.') + '</div>';
      return;
    }
    var active = document.activeElement && document.activeElement.id === 'baSearch';
    var caret = active ? document.activeElement.selectionStart : null;
    body.innerHTML = summaryHtml(m) + toolbarHtml(m) + '<div class="ba-grid-wrap">' + viewHtml(m) + '</div>';
    if (keepSearchFocus || active) {
      var s = body.querySelector('#baSearch');
      if (s) { s.focus(); try { s.setSelectionRange(caret, caret); } catch (_) {} }
    }
  }

  function summaryHtml(m) {
    var t = m.totals;
    var hidden = m.outOfScope.cardex + m.outOfScope.ledger;
    var tile = function (label, valueHtml, tone, sub) {
      return '<div class="ba-tile' + (tone ? ' is-' + tone : '') + '"><div class="ba-tile-label">' + esc(label) + '</div>'
        + '<div class="ba-tile-value">' + valueHtml + '</div>' + (sub ? '<div class="ba-tile-sub">' + esc(sub) + '</div>' : '') + '</div>';
    };
    var meta = [];
    if (m.batchTypes.length) meta.push('Batch type ' + m.batchTypes.join(', '));
    if (m.firstDate) meta.push('GL dates ' + m.firstDate + (m.lastDate !== m.firstDate ? ' to ' + m.lastDate : ''));
    return '<div class="ba-summary">'
      + '<div class="ba-summary-head"><span class="ba-batch">Batch ' + esc(m.batch) + '</span>'
      + (meta.length ? '<span class="ba-meta">' + esc(meta.join(' · ')) + '</span>' : '') + '</div>'
      + '<div class="ba-tiles">'
      + tile('F4111', esc(fmtMoney(t.cardex)), '', m.cardex.length.toLocaleString('en-US') + ' lines')
      + tile('F0911, inventory accounts', esc(fmtMoney(t.ledgerInventory)), '', t.ledgerInventoryLines.toLocaleString('en-US') + ' lines')
      + tile('Difference', esc(fmtMoney(t.diff)), t.ties ? 'ok' : 'bad',
             t.notTied ? t.notTied + ' account' + (t.notTied === 1 ? '' : 's') + (t.notTied === 1 ? ' does' : ' do') + ' not tie' : 'Every inventory account ties')
      + tile('F0911, other accounts', esc(fmtMoney(t.ledgerOther)), '',
             t.ledgerOtherLines.toLocaleString('en-US') + ' lines, only on accounts RapidReconciler loads')
      + '</div>'
      + (hidden ? '<div class="ba-note">' + hidden + ' line' + (hidden === 1 ? '' : 's') + ' in companies outside your access ' + (hidden === 1 ? 'is' : 'are') + ' not shown, so these totals cover only part of the batch.</div>' : '')
      + '</div>';
  }

  function toolbarHtml(m) {
    var views = [['accounts', 'By account'], ['cardex', 'F4111 lines'], ['ledger', 'F0911 lines']];
    var count;
    if (S.view === 'accounts') {
      count = m.accounts.length + m.offsets.length;
      count = count.toLocaleString('en-US') + ' account' + (count === 1 ? '' : 's');
    } else {
      var all = S.view === 'cardex' ? m.cardex.length : m.ledger.length;
      var shown = filterGroups(S.view === 'cardex' ? m.cardexGroups : m.ledgerGroups, S.query, S.view === 'cardex' ? CARDEX_COLS : LEDGER_COLS)
        .reduce(function (s, g) { return s + g.shown.length; }, 0);
      count = shown === all ? all.toLocaleString('en-US') + ' rows' : shown.toLocaleString('en-US') + ' rows of ' + all.toLocaleString('en-US');
    }
    return '<div class="ba-toolbar">'
      + '<div class="ba-views" role="tablist" aria-label="Report view">'
      + views.map(function (v) {
          var on = v[0] === S.view;
          return '<button type="button" class="ba-view' + (on ? ' is-active' : '') + '" role="tab" aria-selected="' + on + '" data-ba-view="' + v[0] + '">' + v[1] + '</button>';
        }).join('')
      + '</div>'
      + (S.view !== 'accounts' ? expandHtml(m) : '')
      + '<div class="ba-cluster">'
      + (S.view !== 'accounts' ? '<input class="ba-search" id="baSearch" type="search" placeholder="Search lines" aria-label="Search lines (^ to match the start)" value="' + esc(S.query) + '">' : '')
      + '<button type="button" class="ba-pill" id="baExport" title="Excel: by account, F4111 lines and F0911 lines">Excel</button>'
      + '<span class="ba-pill ba-count">' + esc(count) + '</span>'
      + '</div></div>';
  }

  function expandHtml(m) {
    var side = S.view, groups = side === 'cardex' ? m.cardexGroups : m.ledgerGroups;
    var allOpen = groups.length && groups.every(function (g) { return S.open[side][g.key]; });
    return '<button type="button" class="ba-expand" data-ba-expand="' + side + '" data-ba-on="' + (allOpen ? '0' : '1') + '">'
      + (allOpen ? 'Collapse all' : 'Expand all') + '</button>';
  }

  function viewHtml(m) {
    if (S.view === 'cardex') return linesHtml(m.cardexGroups, CARDEX_COLS, 'cardex', 'F4111 lines');
    if (S.view === 'ledger') return linesHtml(m.ledgerGroups, LEDGER_COLS, 'ledger', 'F0911 lines');
    return accountsHtml(m);
  }

  function accountsHtml(m) {
    var head = '<tr><th>Company</th><th>Account</th><th>Description</th><th class="is-num">F4111 lines</th><th class="is-num">F4111 amount</th>'
      + '<th class="is-num">F0911 lines</th><th class="is-num">F0911 amount</th><th class="is-num">Difference</th><th></th></tr>';
    var rows = m.accounts.map(function (a) {
      var jump = [];
      if (a.cxLines) jump.push('<button type="button" class="ba-link" data-ba-jump="cardex" data-ba-key="' + esc(a.key) + '">F4111</button>');
      if (a.glLines) jump.push('<button type="button" class="ba-link" data-ba-jump="ledger" data-ba-key="' + esc(a.key) + '">F0911</button>');
      return '<tr class="' + (a.ties ? '' : 'ba-off') + '">'
        + '<td>' + esc(a.company) + '</td><td class="is-mono">' + esc(a.account) + '</td><td>' + esc(a.description) + '</td>'
        + '<td class="is-num">' + a.cxLines.toLocaleString('en-US') + '</td>' + money(a.cxAmount)
        + '<td class="is-num">' + a.glLines.toLocaleString('en-US') + '</td>' + money(a.glAmount)
        + (a.ties ? '<td class="is-num ba-tied">Ties</td>' : money(a.diff, 'ba-diff'))
        + '<td class="ba-jumps">' + jump.join('') + '</td></tr>';
    }).join('');
    var t = m.totals;
    var foot = '<tr><td colspan="3">Inventory accounts</td><td class="is-num">' + m.cardex.length.toLocaleString('en-US') + '</td>' + money(t.cardex)
      + '<td></td>' + money(t.ledgerInventory) + (t.ties ? '<td class="is-num ba-tied">Ties</td>' : money(t.diff, 'ba-diff')) + '<td></td></tr>';
    var html = '<table class="pv-table ba-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody><tfoot>' + foot + '</tfoot></table>';
    if (m.offsets.length) {
      var oh = '<tr><th>Company</th><th>Account</th><th>Description</th><th class="is-num">F0911 lines</th><th class="is-num">F0911 amount</th><th></th></tr>';
      var or = m.offsets.map(function (o) {
        return '<tr><td>' + esc(o.company) + '</td><td class="is-mono">' + esc(o.account) + '</td><td>' + esc(o.description) + '</td>'
          + '<td class="is-num">' + o.glLines.toLocaleString('en-US') + '</td>' + money(o.glAmount)
          + '<td class="ba-jumps"><button type="button" class="ba-link" data-ba-jump="ledger" data-ba-key="' + esc(o.key) + '">F0911</button></td></tr>';
      }).join('');
      var of = '<tr><td colspan="3">Other accounts total</td><td class="is-num">' + t.ledgerOtherLines.toLocaleString('en-US') + '</td>'
        + money(t.ledgerOther) + '<td></td></tr>';
      html += '<div class="ba-subhead">Other accounts <span>F0911 only, so there is no F4111 side to compare. RapidReconciler loads F0911 only for the accounts it reconciles, so this is not the rest of the batch.</span></div>'
        + '<table class="pv-table ba-table"><thead>' + oh + '</thead><tbody>' + or + '</tbody><tfoot>' + of + '</tfoot></table>';
    }
    return html;
  }

  function linesHtml(groups, cols, side, sheet) {
    var shown = filterGroups(groups, S.query, cols);
    if (!shown.length) return '<div class="ba-empty">No line matches “' + esc(S.query) + '”.</div>';
    var sort = S.sort[sheet];
    var head = '<tr>' + cols.map(function (c) {
      var on = sort && sort.key === c.key;
      return '<th class="' + (NUMERIC[c.kind] && c.kind !== 'id' && c.kind !== 'line' ? 'is-num ' : '') + (on ? 'is-sorted' : '') + '" data-ba-sort="' + c.key + '" data-ba-sheet="' + esc(sheet) + '">'
        + esc(c.label) + (on ? '<span class="pv-sort-caret">' + (sort.dir < 0 ? '▼' : '▲') + '</span>' : '') + '</th>';
    }).join('') + '</tr>';
    var filtered = !!String(S.query || '').trim();
    var body = shown.map(function (g) {
      var open = !!S.open[side][g.key];
      var tag = side === 'ledger' ? (g.inventory ? '<span class="ba-tag">Inventory</span>' : '<span class="ba-tag is-offset">Other</span>') : '';
      var lines = filtered
        ? g.shown.length.toLocaleString('en-US') + ' of ' + g.rows.length.toLocaleString('en-US') + ' lines'
        : g.rows.length.toLocaleString('en-US') + ' line' + (g.rows.length === 1 ? '' : 's');
      var h = '<tr class="ba-group' + (open ? ' is-open' : '') + '"><td colspan="' + cols.length + '">'
        + '<button type="button" class="ba-group-btn" data-ba-group="' + esc(g.key) + '" data-ba-side="' + side + '" aria-expanded="' + open + '">'
        + '<span class="ba-chev" aria-hidden="true">▸</span>'
        + '<span class="ba-group-acct">' + esc(g.account) + '</span>'
        + (g.description ? '<span class="ba-group-desc">' + esc(g.description) + '</span>' : '')
        + '<span class="ba-group-co">Co ' + esc(g.company) + '</span>' + tag
        + '<span class="ba-group-n">' + esc(lines) + '</span>'
        + '<span class="ba-group-amt' + (g.shownAmount < 0 ? ' is-neg' : '') + '">' + esc(fmtMoney(g.shownAmount)) + '</span>'
        + '</button></td></tr>';
      if (!open) return h;
      return h + sortRows(g.shown, sort, cols).map(function (r) {
        return '<tr>' + cols.map(function (c) {
          var v = r[c.key];
          if (c.kind === 'num') return money(v);
          var cls = (c.kind === 'qty' || c.kind === 'cost') ? 'is-num' + (num(v) < 0 ? ' is-neg' : '') : (c.kind === 'id' || c.kind === 'line') ? 'is-mono' : '';
          return '<td class="' + cls + '">' + esc(cellText(c, v)) + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }).join('');
    var total = shown.reduce(function (s, g) { return s + g.shownAmount; }, 0);
    var count = shown.reduce(function (s, g) { return s + g.shown.length; }, 0);
    var amtIdx = cols.map(function (c) { return c.key; }).indexOf('Amount');
    var foot = '<tr><td colspan="' + amtIdx + '">Total, ' + count.toLocaleString('en-US') + ' line' + (count === 1 ? '' : 's') + (filtered ? ' matching the search' : '') + '</td>'
      + money(total) + '<td colspan="' + (cols.length - amtIdx - 1) + '"></td></tr>';
    return '<table class="pv-table ba-table ba-lines"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table>';
  }

  global.RRV8 = global.RRV8 || {};
  global.RRV8.batchAnalysis = {
    mount: mount, reset: reset,
    // Pure, for RRV8/scripts/test-batch-analysis.js.
    parseBatchInput: parseBatchInput, buildModel: buildModel, filterGroups: filterGroups,
    exportSheets: exportSheets, exportWorkbook: exportWorkbook, cellText: cellText, fmtMoney: fmtMoney,
    CARDEX_COLS: CARDEX_COLS, LEDGER_COLS: LEDGER_COLS, NO_ACCOUNT: NO_ACCOUNT
  };
})(typeof window !== 'undefined' ? window : this);
