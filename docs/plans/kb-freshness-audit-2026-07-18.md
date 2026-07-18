# Admin KB freshness audit (2026-07-18)

Scope: the RapidReconciler University administrator docs, brought in line with
the current product and the "the customer owns their instance, GSI is exiting
operational involvement" direction. These pages are about to become the single
source that grounds the in-app admin AI, so the bar was accuracy over polish.
Where I could not confirm a fact, I left the existing text alone and flagged it
in the last section rather than guess.

I verified the current admin Home and licensing behavior directly against
`RRV8/home.html` (read-only) before rewriting anything about the UI. Findings
from that read drive most of the start-here changes below.

## Files changed

- `RRUniversity/administrator-managing-users.html`
- `RRUniversity/administrator-managing-companies.html`
- `RRUniversity/administrator-complex-password.html`
- `RRUniversity/administrator-start-here.html`
- `RRUniversity/rapidreconciler-licensing.html`

No git actions taken. All changes are in the working tree.

## What changed, and why

### administrator-managing-users.html

1. Reframed the team-member flow from "inviting" to "adding," led by the action.
   - Section heading: "Inviting a new team member" became "Adding a team member."
   - Lead paragraph now opens with the action: click the **New Team Member**
     button in the top-right of the RR Team page, fill in the fields, click
     **Add**. It states plainly that the person appears on the RR Team list
     right away and is separately emailed a single-use set-password link.
   - The mockup's submit button changed from "Send invite" to "Add" (SVG button
     text and the figure's aria-label). See the verify note below on the exact
     button label.
   - The "No passwords to manage" callout and the figure caption were reworded
     to the add-then-emailed sequence.
   - Fixed a residual "invite dialog" reference in the Database and company
     access section to "New Team Member form."
2. Terminology consistency: "invite email" and "re-send the invite" became
   "set-password email" and "re-send the set-password link" in the new-hire
   pitfall and the Passwords section, matching the verified fact that the email
   sent is a single-use set-password link.
3. Ownership: no reflexive "contact GSI" text needed removing here. The only
   GSI references left are about creating a brand-new role type, which is the
   flagged uncertainty (see below). Assigning an existing role is fully
   self-serve and the doc already reads that way.

### administrator-managing-companies.html

1. Ownership on the AAI Doc field. Old text said the field "should only be
   changed in consultation with GSI." It is an editable field the admin owns, so
   it now reads: change it only if your JD Edwards configuration uses a different
   document type for the model DMAAI, and confirm the correct value against JD
   Edwards first because it drives account derivation. The caution is kept; the
   deference to GSI is gone.
2. Consistency: "contact GSI support to begin the licensing process" became
   "contact GSI Sales," matching the licensing page (licensing is a Sales action,
   and the email card on that same section already points to gsisales@getgsi.com).
3. Left intact: "Only GSI can add or remove companies, as they are managed per
   license agreement." Company licensing is a contract term, not an admin
   self-serve action, so this is still correct.

### administrator-complex-password.html

1. Add-not-invite terminology: "When you invite a new user" became "When you add
   a new user"; "instructions on inviting users" became "instructions on adding
   users."
2. "re-send the invite" became "re-send the set-password link" in the Best
   Practice callout, the Locked or Inaccessible Accounts paragraph, and its
   cross-reference.
3. Navigation refresh: the page cited the retired menu path
   "Administrator > People & Licensing > Complex Passwords" in two places. On the
   current Home there is no People & Licensing menu; Complex Passwords is reached
   from the **Team & access** card. Both references now point there.

### administrator-start-here.html

This doc carried the largest amount of pre-redesign Home description. The
current admin Home (verified in `RRV8/home.html`) is: an **Ask about this
instance** AI pill band on top, then four cards you act on (**Licensing**,
**Team & access**, **Report Engine**, **Activity log**), then a quiet
**instance-health** strip (data refresh, storage/purge, fiscal calendar, and an
AI-plan chip). The former Utilities and Data-Management actions (Reload GL,
Reload Cardex, Correct a Period-End Date, Purge, Review Job Schedule) are now
standalone admin pages, not Home cards. The old doc described a four-panel
"Administrator band" (People & Licensing, Data Management, System Health,
Utilities), which no longer exists.

Changes made:

1. Index hero paragraph: replaced the "four panels: People & Licensing, Data
   Management, System Health, Utilities" sentence with the current layout (Ask
   about this instance panel, the four cards, the instance-health strip).
2. Your Responsibilities table, "Where on Home" column: repointed each row to
   the current location (Team & access; the Review Job Schedule page; the
   instance-health strip; the standalone Reload and Period-End pages; the
   Licensing card described as "companies in use & renewal" so it fits both the
   capped and unlimited license variants).
3. Your Home Screen topic:
   - Intro rewritten to the current layout.
   - The main mockup's four card labels were relabeled to Licensing, Team &
     access, Report Engine, and Activity log (with matching status sublines).
   - Figure caption rewritten to describe the real layout and to note the figure
     is simplified (it does not draw the Ask panel or the health strip).
   - The small decorative hero graphic on the index was relabeled the same way,
     including its HTML layout comments.
4. People & Licensing topic: intro reframed so the two concerns read as the
   separate Team & access and Licensing cards rather than one combined panel. The
   Licensing subsection now says the card leads with license status and renewal
   date, and notes that a license can be a fixed seat count or unlimited
   companies. The seat-usage figure and caption were kept (still accurate for
   capped licenses) with an added line for the unlimited display variant.
5. Data & Refresh topic: "The Data area" reframed to the Data refresh and Purge
   pages that surface on the instance-health strip. "Review Job Schedule (under
   Utilities)" became "the Review Job Schedule page." Dropped an unverifiable
   claim about a specific "Review Job Schedule row" dot on Home; the reminder
   behavior is described without asserting where it renders.
6. System Health topic: intro and caption reframed. There is no System Health
   card now; the intro describes the Report Engine card, the Activity log card,
   and the AI assistant. The Report Engine subsection changed "Its page shows"
   to "The Report Engine card shows," since Restart now acts in place on the card.
7. Utilities topic: intro reframed. There is no Utilities card; the four tools
   each open their own page. Caption and the Purge subsection updated the same way.

### rapidreconciler-licensing.html

1. Confirmed the "See your renewal date" section is consistent with the product.
   It matches `paintLicenseHealth()` in `RRV8/home.html`: a live day count,
   amber within 60 days, red once passed, renewal date shown, and renewal is a
   Sales action. No change needed there.
2. Added one verified line to "Check your current usage first": if the license
   covers unlimited companies the card reads "Unlimited companies, N in use"
   instead of the "N of M" seat banner. This closes a grounding gap for
   customers on an unlimited license.

## Licensing model, resolved

Early in the audit the "Unlimited companies, N in use" wording on the Licensing
card looked like it might have replaced the per-company seat model. It has not.
`paintLicenseHealth()` handles both cases: `u.unlimited` renders "Unlimited
companies, N in use," and the capped case still renders "Using N of M company
licenses" / "All M in use" / "Over license." So the seat narrative across these
docs is still correct for capped licenses, and unlimited is an additional
display variant. I kept the seat content and only added the unlimited note. No
licensing-model rewrite was warranted.

## VERIFY WITH OWNER

1. Creating a new role TYPE (the primary flagged item). Three places in
   `administrator-managing-users.html` still say a brand-new role is provisioned
   with or by GSI:
   - The Roles intro: "Roles are set up for your site with GSI."
   - The "One role per team member" callout: "If you need a role that doesn't
     exist yet, contact GSI Support."
   - The missing-module pitfall: "If no role fits, ask GSI to provision one."
   I left all three exactly as they were. I could not confirm whether an admin
   can create a new role type self-serve or whether role types are coded
   permission bundles that genuinely require GSI. Adding a MEMBER and assigning
   an existing role is confirmed self-serve and is written that way. Please
   confirm the role-type-creation behavior so these three lines can either stay
   or move to admin ownership.

2. Exact submit-button label on the New Team Member form. I changed the mockup
   button and prose to "Add" to match the add-not-invite framing you gave. I did
   not have the live form in front of me to confirm the label reads "Add"
   specifically (versus "Save" or "Create"). Please confirm; it is a one-word
   fix in `administrator-managing-users.html` if it differs.

3. Two SVG mockups in `administrator-start-here.html` still depict the old
   structure and cannot be made faithful by text relabels alone. The prose and
   captions around them are now correct, but the drawings should be redrawn when
   convenient:
   - The "Your Home Screen" main mockup shows Set Context, Today's To Do, an
     ADMINISTRATOR band, and four cards, but does not draw the Ask about this
     instance panel or the instance-health strip. I relabeled the four cards; the
     caption notes the figure is simplified.
   - The System Health figure still draws a single "System Health" card with an
     "AI Assistant" row and Open buttons. No such card exists now. The intro and
     caption describe the real layout; the drawing needs replacing.

4. Doc topic names retained as groupings. The start-here sidebar and section
   headings still use "People & Licensing" and "System Health" as topic names,
   even though those are no longer Home card names. I kept them as doc organizing
   labels (each topic now explains the current cards underneath). If you would
   rather the topic names track the new card names, that is a larger rename
   touching sidebar entries, anchors, and the showView() targets, and I would do
   it as a follow-up rather than fold it into this freshness pass.

5. Home entry points for the maintenance and schedule pages. `RRV8/home.html`
   confirms Reload GL, Reload Cardex, Correct a Period-End Date, Purge, and
   Review Job Schedule are standalone pages, and that Purge and the fiscal
   calendar surface as instance-health chips. I did not find explicit Home links
   for Reload GL, Reload Cardex, or Review Job Schedule in the admin grid or the
   strip, so the docs now describe them as "its own page" without asserting a
   specific Home entry point. If there is a menu or launcher that lists them,
   tell me and I will name it precisely.
