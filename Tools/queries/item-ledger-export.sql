/* ============================================================
   RR F4111 → JDE Item Ledger export shape

   Produces the column set the Export Analyzer's "Item Ledger"
   template fingerprints by. The two columns aliased
   "Document Number" mirror the JDE quirk (ildoc = actual doc,
   ildoco = order number — both come back in the export with the
   same header text, and the analyzer parses them by header order
   rather than column position).

   How to use:
     1. Edit the WHERE clause to filter to ONE item (the analyzer
        is designed for single-item exports — Item Ledger Inquiry
        in JDE works the same way).
     2. Run in SSMS, right-click the result grid → Save Results As
        → Excel.
     3. Drop the resulting .xlsx onto the Export Analyzer
        (Tools/analysis-workbook.html). Detection lands at ~100%
        match by column-header fingerprint; sheet name is ignored.

   Open placeholders to confirm against your data:
     - [Transaction Date] mapping — see note below.
     - [Lot Status Code] mapping — see note below.
     - The item filter at the bottom of this script.
   ============================================================ */
SELECT
    il.ildoc                       AS [Document Number],
    il.ildct                       AS [Doc Type],
    il.ilkco                       AS [Doc Co],
    /* PLACEHOLDER — Transaction Date.
       Standard JDE F4111 has iltrdj (Transaction Date Julian).
       RR's F4111 mirror doesn't expose iltrdj in the visible
       schema. Best candidates from the available columns:
         - ilcrdj   (created julian, as a SQL date) — closest
                    semantic stand-in
         - periodate (date) — if this is RR's name for the JDE
                    transaction date
       Confirm against a known ukid in JDE Item Ledger Inquiry
       and change here if needed. */
    il.ilcrdj                      AS [Transaction Date],
    il.ilmcu                       AS [Branch/ Plant],
    il.iltrqt                      AS [Quantity Primary UoM],
    il.primaryuom                  AS [Primary UoM],
    il.iluncs                      AS [Unit Cost],
    il.ilpaid                      AS [Extended Cost],
    il.illotn                      AS [Lot/Serial],
    il.illocn                      AS [Location],
    /* PLACEHOLDER — Lot Status Code.
       JDE stores lot status on F4108 (Lot Master), not F4111.
       If RR mirrors F4108, swap the empty-string cast below for
       a LEFT JOIN:
           LEFT JOIN dbo.F4108 ls
                  ON ls.lpitm  = il.ilitm
                 AND ls.lpmcu  = il.ilmcu
                 AND ls.lplotn = il.illotn
           ... ls.lpsts AS [Lot Status Code]
       If RR doesn't mirror F4108, the empty-string fallback is
       fine — the analyzer doesn't depend on this column for
       detection or for the v1 patterns (intercompany, backdated). */
    CAST('' AS nchar(3))           AS [Lot Status Code],
    il.ildoco                      AS [Document Number],   -- order number — JDE mislabels with the same header as ildoc
    il.ildcto                      AS [Doc Ty],            -- order type — header is "Doc Ty" without the e
    il.ilkcoo                      AS [Order Co],
    il.ilglpt                      AS [Class Code],
    il.ildgl                       AS [G/L Date],
    il.ilukid                      AS [Unique Key ID]
FROM dbo.F4111 il
INNER JOIN dbo.F4101 im
        ON im.imitm = il.ilitm                             -- short item number join
WHERE im.imlitm = N'<long-item-number>'                    -- PLACEHOLDER: replace with the long item number you're filtering on
ORDER BY il.ilukid DESC;                                    -- newest transactions first; the analyzer re-sorts internally
