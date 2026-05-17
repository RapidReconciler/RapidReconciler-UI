/* ============================================================
   JDE DMAAIs (F4095) → Export Analyzer "JDE DMAAI's" template

   F4095 is JDE's Distribution AAIs table — the FULL set of AAI
   rules used across every distribution module (Inventory, Sales
   Order, Purchase Order, Manufacturing, etc.). This is distinct
   from the RR-side DMAAI integrity report, which is scoped to
   the subset of AAIs RR actually exercises.

   Acme's F4095 mirror uses the 'ml' column prefix instead of
   standard JDE's 'ai' (mlanum, mlco, ...); the SELECT below
   aliases each back to the header text the analyzer fingerprints
   by. The two single-space-suffixed headers ("Co ", "Sub ") match
   the source export exactly — the analyzer's header normalization
   (lowercase + whitespace-strip) would accept either spelling, but
   matching exactly avoids surprises if a downstream tool is
   header-sensitive.

   How to use:

   PRODUCTION JDE (no direct SQL access):
     1. Sign in to JDE and run application P964001 (Database Browser).
     2. Select table F4095.
     3. Export the full result set to .xlsx (Excel button on the
        grid header). The grid headers — "AAI Number", "Co ",
        "Or Ty", "Do Ty", "G/L Cat", "Cost Type", "Business Unit",
        "Obj Acct", "Sub " — already match what the analyzer
        expects, so no editing is needed.

   RR-MIRRORED SCHEMA (customer's RR database via SSMS):
     1. Run this query in SSMS against the customer's RR JDE schema.
     2. Save Results As → Excel.

   Either way, drop the resulting .xlsx onto the Export Analyzer;
   detection lands on "JDE DMAAI's" by column fingerprint.
   ============================================================ */
SELECT
    aai.mlanum    AS [AAI Number],
    aai.mlco      AS [Co ],
    aai.mldcto    AS [Or Ty],
    aai.mldct     AS [Do Ty],
    aai.mlglpt    AS [G/L Cat],
    aai.mlcost    AS [Cost Type],
    aai.mlmcu     AS [Business Unit],
    aai.mlobj     AS [Obj Acct],
    aai.mlsub     AS [Sub ]
FROM dbo.F4095 aai
ORDER BY aai.mlanum, aai.mlco, aai.mldcto, aai.mldct, aai.mlglpt, aai.mlcost;
