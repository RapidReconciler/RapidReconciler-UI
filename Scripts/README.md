# Build scripts

## `build-customer-troubleshooting.py`

Generates `customer-troubleshooting.html` from `troubleshooting.html` by
stripping internal-only content (escalation contacts, Jira config, internal
admin tool references, Tier 2/3 cards) and rewriting the page header for a
customer audience.

### When this runs

A GitHub Action (`.github/workflows/build-customer-troubleshooting.yml`)
runs this script automatically whenever `troubleshooting.html` or the script
itself is modified on `main`. The action commits the regenerated
`customer-troubleshooting.html` back to the branch.

You can also run it locally:

```bash
pip install beautifulsoup4 lxml
python3 scripts/build-customer-troubleshooting.py
```

### What the script does

1. Removes the `role-contacts-data` and `jsm-config-data` JSON config blocks
   (they contain internal personal email addresses and Jira project IDs).
2. Removes Tier 2 and Tier 3 cards and their detail panes. Removes 5 Tier 1
   cards whose symptoms are only visible inside internal admin tools.
3. Removes the escalation pane, console-log glossary, email-intake workflow,
   tier filter pills, and other staff-only UI sections.
4. Removes copy-to-clipboard data payloads from cards (they re-serialize
   internal references).
5. Strips sentences that mention internal-only tools or names from the
   surviving cards.
6. Replaces the entire staff-side `<script>` block with a minimal customer
   script (search filtering, expand/collapse, hash deep-link).
7. Relocates each detail pane to sit immediately after its card (avoids
   needing JS-driven layout positioning).
8. Rewrites page title, brand tag, hero copy, search placeholder, footer
   text for customer audience.

### Verification (the safety net)

After transformation, the script scans the output for a list of sensitive
markers (VALC, internal email addresses, infrastructure hostname patterns,
GSIADMIN/rruser/etc.). If any marker is found, the script exits with code 1
and the GitHub Action fails. This is what protects against regressions when
new content is added to the staff doc.

### Maintaining the card classification

When you add a new troubleshooting card to `troubleshooting.html`, classify
it in the script:

- If it's customer-actionable (symptom visible to customer + resolution they
  can perform), add the card's `data-id` to `CUSTOMER_KEEP_IDS`.
- If it's staff-only (admin tool symptom or staff-only resolution), add it
  to `CUSTOMER_DROP_IDS`.

If you add a Tier 1 card and forget to classify it, the script fails the
build with a clear message naming the unclassified card.

Tier 2 and Tier 3 cards are dropped automatically — no classification needed.
