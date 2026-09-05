#!/usr/bin/env python
"""Find customer-supplied config fields that no pre-install document asks for.

    python Tools/config-collection-check.py            # report; exit 1 on a finding
    python Tools/config-collection-check.py --verbose  # show every field + verdict
    python Tools/config-collection-check.py --quiet    # exit code only

WHY THIS EXISTS. 2026-09-05: the VALC console's Customer SSO tab collects an
issuer URL, client ID, client secret, scopes, an email claim and a domain list
from the customer -- and `GSIRRSales/rr-installation-prep.html`, the document a
customer fills in BEFORE the install, mentioned SSO exactly four times, every
one a firewall row saying "open rrsso-prod.getgsi.com:443". It asked for none of
the configuration. An installer could arrive able to REACH the SSO endpoint with
no idea what to configure, and the customer's identity team was never told to
register the redirect URI that the sign-in depends on.

⚠ EVERY EXISTING DOC INSTRUMENT MISSED IT, AND THE REASON IS STRUCTURAL. The S0
doc sweep counts "Remaining actions" CLAIMS. `doc-claim-check.py` finds a doc
asserting a symbol is wired when it is not. The commit-time sweep asks whether a
diff changes an EXISTING doc. All three need a statement to examine, and a
missing section makes no statement. They detect wrong text; none detects absent
text. This one asks the inverted question: the product collects X -- does any
document ask for X?

WHAT IT DOES. Extracts the visible field labels from the customer-configuration
panels in the VALC console, then checks each one's distinctive terms against the
pre-install / provisioning documents in this repo.

⚠ COVERAGE BOUND, stated because an overstated checker is worse than none
(HK-7). It sees `<label>` text inside the panels named in PANELS below, in the
two files named in SURFACES. It does not see fields rendered by JavaScript
without a label element, fields on surfaces not listed, or anything the customer
supplies by email rather than through a form. A clean run means "every labelled
field on the surfaces this can see is asked for somewhere", NOT "the docs are
complete".

⚠ AND IT IS A SHORTLIST, NOT A VERDICT. Matching is by distinctive term, so a
doc that uses different words for the same thing reads as a miss. Confirm every
finding by hand before writing a doc section for it.
"""
import argparse
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VALC = os.path.join(os.path.dirname(ROOT), "RapidReconciler-Valc")

# Console templates holding customer-configuration forms, and the panel ids
# whose fields are values a CUSTOMER supplies (as opposed to GSI-internal ones).
SURFACES = [
    os.path.join(VALC, "src", "main", "resources", "templates", "deployment.html"),
    os.path.join(VALC, "src", "main", "resources", "templates", "dashboard.html"),
]
# ⚠ Panels are addressed by id OR by data-panel, because this console uses both
# and the first version of this file listed a "js-tab-topology" id that DOES NOT
# EXIST. It swept nothing for the Topology tab and reported a clean result for
# it -- a checker silently covering less than it claims, which is precisely what
# HK-7 warns is worse than no checker. The Topology tab is data-panel="appserver".
PANELS = [
    "js-tab-sso",      # deployment.html  - Customer SSO
    "topic-sso",       # the install-prep doc's own SSO section
    "appserver",       # dashboard.html   - Topology (servers, IPs, SQL + JDE creds)
    "client",          # dashboard.html   - Client Details
]

# Documents whose job is to collect this information before an install.
DOCS = [
    os.path.join(ROOT, "GSIRRSales", "rr-installation-prep.html"),
    os.path.join(ROOT, "GSIRRSales", "rr-provisioning.html"),
]

# Labels that are chrome, not customer input. Kept explicit rather than
# heuristic: a silent filter is how a real field disappears from a report.
IGNORE = {
    "label", "notes", "active", "enabled", "status", "save", "cancel", "close",
    "options", "actions", "role", "full name", "username", "email", "password",
    "search", "filter", "name", "type", "value", "description", "comment",
    # An option WITHIN the licensing control, not a field anyone supplies.
    # Added after hand-adjudication 2026-09-05; the entry is listed rather than
    # matched by a rule because an unmaintained allowlist is how this class of
    # rot starts (HK-7).
    "unlimited",
}

# ⚠ KNOWN, ADJUDICATED, DELIBERATELY STILL REPORTED (2026-09-05):
#   Project Sponsor, Add-ons, PO Receipts
# All three are real -- no GSIRRSales document asks a customer to supply them --
# but they are COMMERCIAL fields (a contact and two licensing selections) that
# belong in provisioning or the contract, not in the technical install-prep
# guide. They are not suppressed, because a tool that exits 0 while genuine
# fields go uncollected is the overstated checker HK-7 forbids. This runs as a
# REPORT, not a CI gate, precisely so a standing non-zero exit is informative
# rather than broken.

# Words too common to discriminate on.
STOP = {
    "the", "a", "an", "or", "and", "of", "for", "to", "in", "on", "your", "id",
    "url", "uri", "name", "server", "client", "set", "if", "is", "it", "with",
}


def read(path):
    return io.open(path, encoding="utf-8", errors="replace").read()


def panel_slice(text, panel_id):
    """Rough slice from a panel's id to the next same-depth section/div id.

    Rough on purpose: over-capturing pulls in a neighbouring field, which shows
    up as an extra line to dismiss. Under-capturing hides one, which is the
    failure this tool exists to prevent.
    """
    m = re.search(r'(?:id|data-panel)="' + re.escape(panel_id) + r'"', text)
    if not m:
        return None
    rest = text[m.end():]
    nxt = re.search(r'<(?:section|div)[^>]*\b(?:id="(?:js-tab-|topic-)|data-panel=")', rest)
    return rest[: nxt.start()] if nxt else rest


def labels_in(chunk):
    out = []
    for m in re.finditer(r"<label[^>]*>(.*?)</label>", chunk, re.S | re.I):
        txt = re.sub(r"<[^>]+>", " ", m.group(1))
        txt = re.sub(r"&[a-zA-Z]+;|&#\d+;", " ", txt)
        txt = " ".join(txt.split()).strip(" :*")
        if txt and 2 < len(txt) < 60:
            out.append(txt)
    return out


def terms(label):
    """Distinctive lowercase words in a label."""
    words = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", label.lower())
    return [w for w in words if w not in STOP]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    doc_text = ""
    missing_docs = []
    for d in DOCS:
        if os.path.isfile(d):
            doc_text += " " + read(d).lower()
        else:
            missing_docs.append(d)

    fields, skipped_surfaces = [], []
    for s in SURFACES:
        if not os.path.isfile(s):
            skipped_surfaces.append(s)
            continue
        t = read(s)
        for p in PANELS:
            chunk = panel_slice(t, p)
            if chunk is None:
                continue
            for lab in labels_in(chunk):
                if lab.lower() in IGNORE:
                    continue
                fields.append((os.path.basename(s), p, lab))

    # Dedupe on the label, keeping the first surface that showed it.
    seen, uniq = set(), []
    for f in fields:
        if f[2].lower() in seen:
            continue
        seen.add(f[2].lower())
        uniq.append(f)

    findings = []
    for surface, panel, lab in uniq:
        ts = terms(lab)
        if not ts:
            continue
        # Asked for if EVERY distinctive term appears somewhere in the docs.
        if not all(t in doc_text for t in ts):
            findings.append((surface, panel, lab, [t for t in ts if t not in doc_text]))

    if args.quiet:
        return 1 if findings else 0

    print("config-collection-check")
    print("  customer-config fields seen        %d" % len(uniq))
    print("  fields no pre-install doc asks for %d\n" % len(findings))
    for surface, panel, lab, miss in findings:
        print("  %-18s %-14s %s" % (surface, panel, lab))
        print("        term(s) absent from every collection doc: %s" % ", ".join(miss))
    if args.verbose:
        print("\n  --- every field seen ---")
        for surface, panel, lab in uniq:
            mark = "MISSING" if any(f[2] == lab for f in findings) else "ok"
            print("    %-8s %-18s %s" % (mark, panel, lab))
    for d in missing_docs:
        print("\n  ⚠ collection doc not found: %s" % d)
    for s in skipped_surfaces:
        print("\n  ⚠ surface not found (VALC repo not beside this one?): %s" % s)
    print("\n  Coverage bound: <label> text inside %s on %s, checked against %s."
          % (", ".join(PANELS),
             ", ".join(os.path.basename(s) for s in SURFACES),
             ", ".join(os.path.basename(d) for d in DOCS)))
    print("  A finding is a SHORTLIST entry: a doc wording the same thing")
    print("  differently reads as a miss. Confirm by hand before writing a section.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
