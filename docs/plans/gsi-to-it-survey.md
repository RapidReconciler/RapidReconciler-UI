# "Contact GSI" / "escalate to GSI" survey

Read-only inventory. Nothing was edited. The owner decides the actual sweep.

Scope: every occurrence of `rrsupport@getgsi.com`, "contact GSI", "escalate to
GSI", "reach out to GSI", "GSI support", "call GSI" and near variants across the
repo's HTML, JS, and MD. Searched RRV8/, Scenarios/, HelpDesk/, RRUniversity/,
GSIRRTech/, GSIRRSales/, AnalysisGuides/, and the repo-root pages.

The governing rule (memory `feedback_escalate_to_it_not_gsi`): the product and
customer-facing docs must never tell a customer to "escalate to GSI" / "contact
GSI" for a **customer-maintainable** problem. Those go to the customer's own IT
department. Two things are explicitly still allowed and are not violations:

1. The vendor support mailbox `rrsupport@getgsi.com`. GSI is the vendor; emailing
   the vendor's support desk for a genuine application problem is the sanctioned
   path, not a "GSI vs IT" mistake.
2. Anything on an internal staff / tech / sales surface (GSIRRTech, GSIRRSales,
   internal docs, code comments).

## Recommended sweep

Only **2 occurrences are clear FIX-NEEDED**, both in one file:

| File | Lines | What it says |
|------|-------|--------------|
| `RRUniversity/ui-reference.html` | 1213, 1500 | bare "escalate to GSI" as the answer to a problem, on a customer KB reference page |

Neither should become "escalate to your IT department." Both are genuine
application matters that belong with the vendor, so the right replacement is the
named support channel, not a bare "GSI":

- Line 1213 (service restart loop): "...escalate to GSI rather than restarting
  repeatedly." Suggested: "...email RR support at `rrsupport@getgsi.com` rather
  than restarting repeatedly." (If the owner judges a persistent restart failure
  to be server-side and customer-maintainable, "contact your IT department"
  works instead. Support-mailbox is the safer default.)
- Line 1500 (unexplained variance residual): "...a variance source not yet
  captured by the calculation — escalate to GSI." Suggested: "...email RR support
  at `rrsupport@getgsi.com`." This is a gap in RR's own calculation, so IT cannot
  fix it. It must stay routed to the vendor.

Everything else is either the legitimate support mailbox, a genuine GSI-only
commercial or backend action (licensing, feature enablement), internal staff
content, or code comments. Those are LEAVE. A handful of PRODUCT and customer
strings are worth a wording look but are not rule violations: see REVIEW.

## Flag: analyst-escalation vs help-desk-support-channel distinction

This distinction is real and worth preserving. Do not blanket-replace "GSI" with
"your IT department" during a sweep.

- **Customer-maintainable infra** (offline PC, DNS the customer controls,
  firewall, VPN, local service restart) routes to the customer's IT. The
  connection-check tool already does this correctly (see REVIEW).
- **Vendor support channel** (`rrsupport@getgsi.com`) is the correct target for
  genuine application problems a customer cannot self-fix. It appears in every
  footer, every doc-feedback link, and most scenario "still stuck?" blocks. All
  legitimate.
- **Analyst / product escalation** (an uncaptured variance source, a 5xx from the
  GSI-hosted sign-in service, a feature only GSI can toggle) must reach GSI, not
  IT. The two FIX-NEEDED lines fall here. The fix names the support mailbox; it
  does not send them to IT.

There is also a mailbox-consistency wrinkle worth noting: licensing and seat
questions correctly go to **GSI Sales** (`gsisales@getgsi.com`), while everything
technical goes to **RR Support** (`rrsupport@getgsi.com`). `rapidreconciler-licensing.html`
line 246 states this split explicitly. Keep sweeps from collapsing the two
addresses into one.

---

## FIX-NEEDED

| File | Line | Phrase in context | Note |
|------|------|-------------------|------|
| `RRUniversity/ui-reference.html` | 1213 | "If the issue persists after a restart, escalate to GSI rather than restarting repeatedly." | Customer KB reference (Restart Services entry). Bare "GSI". Reword to the support mailbox (or IT, owner's call). |
| `RRUniversity/ui-reference.html` | 1500 | "A large unexplained residual means a variance source not yet captured by the calculation — escalate to GSI." | Customer KB reference (Variance Breakdown entry). Product-internal matter. Reword to "email RR support at rrsupport@getgsi.com". Do not send to IT. |

---

## REVIEW

Ambiguous or wording-only. None are clear rule violations; each has a reason to
lean LEAVE, noted.

| File | Line(s) | Phrase in context | Note |
|------|---------|-------------------|------|
| `HelpDesk/connection-check.html` | 669, 672 | `route = 'Contact GSI'` / "Send the report below to GSI support — no action needed on your end." | Customer-facing diagnostic tool. This branch fires only on a confirmed GSI-side fault (HTTP 5xx from the GSI-hosted sign-in service). The tool already routes customer-maintainable failures to "Your IT" (lines 632, 637) and "Your IT or GSI" (645, 662). Well-designed. Lean LEAVE. Optional: rename the "Contact GSI" label to "Contact RR support" for mailbox consistency. |
| `HelpDesk/connection-check.html` | 651, 667, 676 | "...send the report below to GSI — it may be a DNS / A-record update on our side." / "send the report to GSI." | Same tool. These are the "your IT confirmed their side is fine, so it may be ours" fall-throughs. GSI-side DNS (getgsi.com A-record) genuinely is GSI's to fix. Lean LEAVE. |
| `RRV8/admin-companies.html` | 994, 995 | "You are over your licensed amount — contact GSI to add licenses." / "...contact GSI to add more." | PRODUCT UI string. Licensing is a GSI-Sales-only action, not customer-maintainable, so contacting GSI is correct. Lean LEAVE. Optional: match config.js wording and say "contact GSI Sales". |
| `RRV8/admin-claude-assistant.html` | 211, 435 | "To change your purchased tier, contact GSI." / "...contact GSI to add it." | PRODUCT UI string. Purchasing / tier change is a GSI commercial action, not customer IT. Lean LEAVE. Optional: "contact GSI Sales". |
| `RRUniversity/getting-started-with-rapidreconciler.html` | 909 | "Contact GSI at rrsupport@getgsi.com to enable this feature for your company." | Customer KB. Feature enablement is a GSI backend (VALC toggle), not customer-maintainable. Names the support mailbox already. Lean LEAVE. |
| `GSIRRSales/rr-self-guided-tour-AI.html` | 1073 | "...resolve via cycle count and manual journal entry. Contact gsisales@getgsi.com for assistance." | Internal sales tour (prospect-facing), so not a GSI-vs-IT violation. But a technical report issue points at the Sales mailbox. Its RRUniversity twin (`inventory-reconciliation.html` line 1826) correctly points at rrsupport. Wrong-mailbox nit, not this survey's rule. |
| `GSIRRSales/rr-assist-self-guided-tour.html` | 2770 | "...offers a one-click escalate to GSI if the steps don't fix it." | Internal sales tour describing a product AI-assist feature. The described feature routes to GSI. Note only. |

---

## LEAVE (grouped)

Roughly 280 raw matches, the large majority the legitimate support mailbox or
its footer. Listed by category with representative files rather than one row
each, since the footer/feedback rows are identical boilerplate.

### A. Standard footer support line

`© 2026 GSI · rrsupport@getgsi.com · getgsi.com` doc-chrome footer. Present on
essentially every KB, scenario, tech, and sales page (60+ occurrences). Examples:
`rapidreconciler-hub.html:3028`, `release-notes.html:380`, and every
`RRUniversity/*.html`, `Scenarios/*.html`, `GSIRRTech/*.html`, `GSIRRSales/*.html`
footer. Legitimate vendor contact in page chrome.

### B. Doc-feedback footer link

"Found something missing / Email `rrsupport@getgsi.com` — Doc Feedback (file)".
Standard across RRUniversity, Scenarios, GSIRRTech, GSIRRSales (40+ occurrences).
Examples: `RRUniversity/login-and-access.html:1075`,
`Scenarios/scenario-template.html` chain,
`Tools/how-to-use-export-analyzer.html:333`. Editorial feedback channel, correct.

### C. Customer support-channel prompts (genuine app issues)

"Email RR support", "contact RR support at rrsupport@getgsi.com if none of the
above resolves", urgent-contact lines. The sanctioned path for problems a
customer cannot self-fix. Examples:
`Scenarios/scenario-customer-no-data.html:531,605`,
`Scenarios/scenario-inventory-validation-red-variance.html:208`,
`RRUniversity/comparing-rr-to-jde-reports.html:962,1006,1237`,
`RRUniversity/period-close-troubleshooting.html:861,904`,
`RRUniversity/login-and-access.html:1023`,
`HelpDesk/troubleshooting.html:2687`,
`HelpDesk/how-to-analyze-logs.html:205,242`,
`Scenarios/scenario-domain-url-not-resolving.html:191` (genuine GSI-side DNS).
Vendor support desk doing its job.

### D. Licensing / commercial → GSI Sales

Company/seat licensing and purchasing, correctly routed to `gsisales@getgsi.com`
or "GSI Sales". A GSI commercial function, not customer IT. Examples:
`RRV8/config.js:629,656,663-671,750,757,768`,
`RRUniversity/administrator-managing-companies.html:975,1072,1082`,
`RRUniversity/administrator-start-here.html:1125,1364,1866`,
`RRUniversity/rapidreconciler-licensing.html:246,284,313`,
`RRV8/admin-companies.html` code comments 451,776,915,965,970.

### E. Internal tech install-scenario escalations ("GSI DBA")

Tech-to-senior-tech escalation inside install runbooks. Internal GSIRRTech.
Examples: `GSIRRTech/install-scenarios/scenario-initial-load-errors-or-zeros.html:151,154,165,180,190`,
`scenario-ssis-driver-mismatch.html:119`,
`scenario-ssis-deploy-permission-denied.html:128`,
`scenario-database-sql-script-fails.html:180`,
`scenario-package-extracts-no-data.html:169`,
`scenario-companies-tab-empty.html:130`,
`GSIRRTech/using-valc.html:2114,2188,2207`. Internal audience.

### F. Internal staff workflow + provisioning

Pre-install submission email to rrsupport, "notify GSI Tech team", "Submit to
GSI", agent-transmits-to-GSI, outbound-to-GSI firewall rules. GSIRRTech,
GSIRRSales, and provisioning docs. Examples:
`GSIRRTech/installing-production-database.html` (steps 1 and 12 flow, many lines),
`GSIRRTech/start-here-dba.html`, `start-here-network-tech.html`,
`GSIRRTech/tech-client-management.html`, `HelpDesk/start-here-helpdesk-tech.html`,
`GSIRRSales/rr-installation-prep.html`, `rr-discovery-call.html`,
`rr-provisioning.html`, `sales-client-management.html`,
`GSIRRTech/rr-agent-reference.html`, `using-valc.html:1265-1367`. Internal /
provisioning, all legitimate.

### G. AnalysisGuides support-contact footers

`AnalysisGuides/*.md` end with "For support, contact GSI at rrsupport@getgsi.com"
and `cardex-variance-analysis.md:147` "submit a written request to
rrsupport@getgsi.com". Internal-only analyst guides (per CLAUDE.md,
`AnalysisGuides/` is internal). Support mailbox reference. Legitimate.

### H. Repo-root and product chrome

`login.html:832` "GSI support" mailto (support-channel link),
`rapidreconciler-help.html:811`, `release-notes.html:270` support links,
`RRV8/config.js:745,753,775` support/sales split copy,
`RRV8/API.md`, `TESTING.md`, `RRV8/admin-job-schedule.html:97` ("GSI cannot
change it... send a change request to your DBA", which correctly points at the
customer's DBA). Support channel or correct routing.

### I. Code comments and non-user-visible strings

`RRV8/admin-companies.html`, `RRV8/home.html`, `RRV8/admin-users.html`,
`RRV8/config.js` comments referencing GSI (contract terms, "GSI Internal" role
filtering, statusAnchor probe). Not shown to users.

### J. Planning / audit docs

`docs/plans/*.md` references (kb-freshness-audit, claude-sonnet-integration,
go-live-handoff, phase3-agent-executor, v8-demo-prod-mode) and `TEST_PLAN.md`.
Internal planning. Not customer surfaces.

---

## Method notes and confidence

Searched with case-insensitive regex over `*.{html,js,md}` for the mailbox and
for `(contact|escalate|reach out|reach|call|email|notify|inform) ... GSI` plus
`GSI (support|team|help|technical)`. Minified vendor JS (`RRV8/vendor/*.min.js`)
matched incidentally and was ignored. Residual risk: a paraphrase that avoids all
those verbs (for example "the GSI team can help with this") would slip the net,
though the second pattern's breadth makes that unlikely. Confidence that the
FIX-NEEDED set is complete: high. Confidence on the LEAVE/REVIEW split: high,
with the connection-check tool and the two RRV8 licensing strings being the
judgment calls the owner may want to eyeball.
