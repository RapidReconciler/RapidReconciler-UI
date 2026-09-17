#!/usr/bin/env python3
"""Gate: identifier-shaped values in this public repo must come from the reserve.

The repo is public. `CLAUDE.md` says real customer identifiers go nowhere here,
and prescribes fictional generics as the remedy. That rule is correct and it is
also unenforceable as written, because **a synthetic company number and a real
one are the same five digits**. HK-19 is what that costs: 53 occurrences were
counted, reported as "real customer identifiers", and escalated -- and they were
post-scrub synthetic values the whole time. Nothing in the value said so.

So this gate does not try to recognise a real identifier. It asserts the
inverse, which is decidable: **every identifier-shaped value sits inside a
declared reserve of fictional ranges.** A value outside the reserve is not
accused of being real -- it is unprovenanced, which is the thing a reviewer
cannot resolve by looking.

⛔ WHY AN ALLOWLIST AND NOT A DENYLIST. The obvious design is to list the real
pre-scrub values and fail on those. That list would have to be committed, and
committing the customer's actual company numbers to a public repo is a worse
leak than the scattered ones it would catch. The reserve is the only shape of
this gate that can live in the open.

THE RESERVE IS NOT INVENTED. Every range below was read out of the scrub
generators in `docs/plans/_scrub/` (now untracked, kept on disk), which are what
produced the values already in the repo:

    company   '8' + RIGHT('0000' + rn, 4)        -> 8XXXX   (demo1/demo2)
    company   curated map, source co -> 30001 .. -> 3XXXX   (demo3)
    company   00000 / 99999 kept deliberately    -> JDE structural
    bu numeric POWER(10,w) - 1 - rn              -> 9...... (high range, same width)
    bu alpha   'B' + RIGHT('000000' + rn, 6)     -> BXXXXXX (demo2/demo3)
    bu alpha   'P' + RIGHT('000' + rn, 3)        -> PXXX    (demo1)

Plus `9XXXX` for companies, which is the range the hand-written test fixtures
already use, and the short generics `CLAUDE.md` itself prescribes.

WHAT THIS GATE DOES NOT COVER, stated plainly rather than implied by silence:

  * **Document numbers and amounts.** The scrub excluded them on purpose --
    `05a_bu_co_maps.sql` says so. They are real figures from a real extract, and
    a real amount has no fictional shape to check against. No namespace trick
    reaches them. That remains author discipline and an owner judgement call.
  * **Bare identifiers with no label.** A company number alone in a `<td>` is
    five digits with no context, and five digits is also a port, a threshold and
    a row count. This gate reads company numbers in company position only.
  * **Item, order, branch and batch numbers.** Same reason -- no reserve exists
    for them yet. Adding one means adding it here too, or the entry is back to
    being author discipline (the same caveat `check_compat_floor.py` carries).

    python Tools/check_identifier_namespace.py
    python Tools/check_identifier_namespace.py --self-test
    python Tools/check_identifier_namespace.py --list-reserve

⚠ A ZERO IS NOT A RESULT. A scanner whose regexes match nothing is silently
green and indistinguishable from a clean repo. So the run prints the in-reserve
hit count next to the violation count, and **fails if the in-reserve count falls
under a floor** -- that count is the control for the zero this gate reports.

Exit codes: 0 clean, 1 any violation (or a control that stopped firing).
"""

import argparse
import os
import re
import subprocess
import sys

# --------------------------------------------------------------------------
# The reserve. Every entry cites where the shape came from.
# --------------------------------------------------------------------------

COMPANY_RESERVE = [
    (re.compile(r"^00000$"), "JDE default company, kept by every scrub map"),
    (re.compile(r"^99999$"), "JDE chart-of-accounts/subledger pseudo-company, kept"),
    (re.compile(r"^3\d{4}$"), "demo3 curated map (source co -> 30001 ...)"),
    (re.compile(r"^8\d{4}$"), "demo1/demo2 generated map ('8' + 4-digit sequence)"),
    (re.compile(r"^9\d{4}$"), "hand-written doc and test fixtures"),
]

# Business units. Numeric BUs are checked by width: the base scrub generator
# keeps the original width and moves the value into the top of that range, so a
# 7-digit BU is in-reserve only when it starts at 9. Short numeric BUs (<= 4
# digits) are the generics CLAUDE.md itself prescribes -- `5000.140000`.
BU_RESERVE = [
    (re.compile(r"^9\d{6}$"), "base scrub generator, 7-digit high range (10^7-1-rn)"),
    (re.compile(r"^9\d{5}$"), "base scrub generator, 6-digit high range"),
    (re.compile(r"^\d{1,4}$"), "short generic, e.g. CLAUDE.md's 5000.140000"),
    (re.compile(r"^B\d{6}$"), "demo2/demo3 generator ('B' + 6-digit sequence)"),
    (re.compile(r"^P\d{3}$"), "demo1 generator ('P' + 3-digit sequence)"),
    (re.compile(r"^(?=.*[A-Za-z])[A-Za-z0-9]{1,8}$"), "alpha generic, e.g. MFG01.4220"),
    # Fixtures key an account by company where the business unit is not the
    # point of the test -- `LongAccount: '80002.1380'` in test-nonstock-glclass.
    # The value is fictional by exactly the same provenance as the company
    # reserve, so it is admitted here rather than rewritten into a fake BU.
    (re.compile(r"^(?:00000|99999|[389]\d{4})$"),
     "a reserved COMPANY number standing in the business-unit slot"),
]

# --------------------------------------------------------------------------
# Detection. Both patterns are anchored on context, because the bare shapes are
# ambiguous with ports, thresholds, row counts and version strings.
# --------------------------------------------------------------------------

# A company number in company position: preceded by a company label within a
# short window. The window then yields a RUN of values, so
# "companies 90043, 90067, 90073" reports three, not one. (Reserved values in
# this comment on purpose -- see the note above SELF_TESTS.)
# `(?!-)` after the bare `Co` form keeps "co-authored", "co-located" and
# "co-ordinate" from anchoring a read -- caught by the self-test, not in review.
COMPANY_ANCHOR = re.compile(
    r"(?:\bcompan(?:y|ies)\b|\bcompanynumber\b|\bccco\b|\b(?:old|new)_co\b"
    r"|\bCo\.?\b(?!-)|\bCO\b(?!-))",
    re.IGNORECASE,
)
COMPANY_RUN = re.compile(r"\b(\d{5})\b")
COMPANY_RUN_WINDOW = 40

# A JDE LongAccount: business unit . object [. subsidiary]. The object is 4-6
# digits, which is what keeps ordinary decimals out -- an amount carries 2.
LONG_ACCOUNT = re.compile(
    r"\b([A-Za-z0-9]{1,8})\.(\d{4,6})(?:\.([A-Za-z0-9]{1,8}))?\b"
)

# Files whose identifiers are generated from files this gate already scans.
# Re-scanning them reports the same value twice and makes the count meaningless.
GENERATED = (
    "search-index.json",
    "scenarios-index.json",
    "install-scenarios-index.json",
)

# Binary and vendored content: nothing an author writes an identifier into.
SKIP_EXT = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2",
    ".ttf", ".eot", ".xlsx", ".xls", ".zip", ".dacpac", ".ispac", ".jar",
}

FIXTURE_DIR = os.path.join("Tools", "_test_identifier_gate")

# The control floor. The repo carries hundreds of in-reserve identifiers; if the
# scanner reports fewer than this, its regexes have stopped matching and a clean
# result means nothing. Deliberately far below the real count so ordinary
# editing never trips it -- this catches a broken scanner, not a tidy repo.
CONTROL_FLOOR = 40


class Hit(object):
    """One identifier-shaped value, with the span it occupies on its line.

    The span is what lets a sweep rewrite exactly what this gate flagged
    instead of running its own regex over the file. A separate regex would
    disagree with the gate at the edges, and the edges are the whole game --
    `00050` is a company in one column and a quantity in the next."""

    def __init__(self, path, line_no, kind, value, line, start, end, bu=None):
        self.path = path
        self.line_no = line_no
        self.kind = kind
        self.value = value
        self.line = line
        self.start = start
        self.end = end
        self.bu = bu       # for an account hit: the part that was judged


def in_reserve(value, reserve):
    for pattern, why in reserve:
        if pattern.match(value):
            return why
    return None


def scan_line(path, line_no, line, ok, bad):
    """Append every identifier-shaped value on one line to ok or bad."""
    seen = set()

    for anchor in COMPANY_ANCHOR.finditer(line):
        window = line[anchor.end():anchor.end() + COMPANY_RUN_WINDOW]
        for m in COMPANY_RUN.finditer(window):
            value = m.group(1)
            key = ("company", value, anchor.end() + m.start())
            if key in seen:
                continue
            seen.add(key)
            at = anchor.end() + m.start()
            hit = Hit(path, line_no, "company", value, line, at, at + len(value))
            (ok if in_reserve(value, COMPANY_RESERVE) else bad).append(hit)

    for m in LONG_ACCOUNT.finditer(line):
        # A dotted version string ("15.0.4382.1") offers `0.4382.1`, which has
        # the shape of an account and is not one. An account is never preceded
        # by another dotted segment, and never continues into one. Caught by the
        # self-test; the first draft of this gate reported jar versions as
        # business units.
        before = line[m.start() - 1] if m.start() else ""
        after = line[m.end():m.end() + 1]
        after2 = line[m.end() + 1:m.end() + 2]
        # ⚠ `after == "."` alone was WRONG and the failing fixture caught it: an
        # account ending a sentence ("... landed on 9999998.146363.") was
        # silently skipped. Only a dot that CONTINUES the chain into another
        # digit means this is a version string rather than an account.
        if before == "." or before.isdigit() or (after == "." and after2.isdigit()):
            continue
        bu = m.group(1)
        key = ("account", m.start())
        if key in seen:
            continue
        seen.add(key)
        hit = Hit(path, line_no, "account", m.group(0), line,
                  m.start(1), m.end(1), bu)
        (ok if in_reserve(bu, BU_RESERVE) else bad).append(hit)


def tracked_files(root):
    """Ask git what is tracked. A directory walk would scan ignored trees --
    including docs/plans/_scrub/, which is on disk but deliberately untracked
    and full of the real values by design."""
    out = subprocess.check_output(
        ["git", "-C", root, "ls-files"], universal_newlines=True
    )
    for rel in out.splitlines():
        rel = rel.strip()
        if not rel:
            continue
        if os.path.basename(rel) in GENERATED:
            continue
        if os.path.splitext(rel)[1].lower() in SKIP_EXT:
            continue
        if rel.replace("\\", "/").startswith(FIXTURE_DIR.replace("\\", "/")):
            continue
        yield rel


def scan_paths(root, paths):
    ok, bad = [], []
    read = 0
    for rel in paths:
        full = os.path.join(root, rel)
        try:
            with open(full, "r", encoding="utf-8", errors="replace") as fh:
                read += 1
                for line_no, line in enumerate(fh, 1):
                    scan_line(rel, line_no, line.rstrip("\n"), ok, bad)
        except (IOError, OSError):
            continue
    return ok, bad, read


def report(ok, bad, read, floor=CONTROL_FLOOR, quiet=False):
    """Print the violation count NEXT TO its control, never on its own."""
    def say(text=""):
        if not quiet:
            print(text)

    say("identifier namespace gate")
    say("  files read          : %d" % read)
    say("  in-reserve hits     : %d   <- control for the number below" % len(ok))
    say("  out-of-reserve hits : %d" % len(bad))

    failed = False

    if len(ok) < floor:
        say("")
        say("FAIL: the control collapsed. Only %d in-reserve identifiers were" % len(ok))
        say("      matched, against a floor of %d. The scanner is not reading" % floor)
        say("      what it thinks it is reading, so a clean result here is not")
        say("      evidence of a clean repo. Fix the scanner before trusting it.")
        failed = True

    if bad:
        say("")
        say("FAIL: %d identifier-shaped values sit outside the reserve." % len(bad))
        say("      They are not accused of being real. They are unprovenanced --")
        say("      a reviewer cannot tell by looking, which is the whole problem.")
        say("      Move them into a reserved range (--list-reserve) or, if the")
        say("      range itself is wrong, widen it here with its provenance.")
        say("")
        by_value = {}
        for hit in bad:
            by_value.setdefault((hit.kind, hit.value), []).append(hit)
        for (kind, value), hits in sorted(by_value.items()):
            say("  %-8s %-24s %d occurrence(s)" % (kind, value, len(hits)))
            for hit in hits[:4]:
                say("      %s:%d" % (hit.path, hit.line_no))
            if len(hits) > 4:
                say("      ... and %d more" % (len(hits) - 4))
        failed = True

    if not failed:
        say("")
        say("clean: every identifier-shaped value is inside the reserve.")
    return 1 if failed else 0


def list_reserve():
    print("Reserved fictional ranges (provenance: docs/plans/_scrub/ generators)")
    print("")
    print("  COMPANY")
    for pattern, why in COMPANY_RESERVE:
        print("    %-12s %s" % (pattern.pattern, why))
    print("")
    print("  BUSINESS UNIT (the part before the first dot in a LongAccount)")
    for pattern, why in BU_RESERVE:
        print("    %-30s %s" % (pattern.pattern, why))
    print("")
    print("  NOT COVERED: document numbers, amounts, item / order / branch /")
    print("  batch numbers, and any identifier written without a label beside")
    print("  it. See this file's docstring for why.")
    return 0


# --------------------------------------------------------------------------
# Self-test. ⚠ The point is the FAILING cases: a gate only ever run against
# already-clean input has never been shown to fire. Each case below is a value
# that must be caught, taken from the shapes HK-19 actually turned up.
# --------------------------------------------------------------------------

# ⚠ EVERY CASE INLINE HERE IS IN-RESERVE OR MATCHES NOTHING, AND THAT IS FORCED.
# The cases whose point is a value the gate must CATCH live in
# `_test_identifier_gate/failing-cases.tsv`, loaded below. The gate found this
# itself: the moment this script was committed it became tracked, the scanner
# read it like any other file, and it failed on its own test data -- ten hits,
# all examples. Putting the failing literals back here means either a gate that
# fails on itself or a gate that exempts a file it should be reading.
SELF_TESTS = [
    # (label, line, expected in-reserve, expected out-of-reserve)
    ("scrubbed company, demo1/2 range",
     "Co 80003 reclassified in February", 1, 0),
    ("scrubbed company, demo3 range",
     'the "company": "30001" leg', 1, 0),
    ("JDE structural companies pass",
     "company 00000 and company 99999", 2, 0),
    ("fixture company range passes",
     "const COMPANIES = [{ co: '90001' }, { co: '90002' }]", 2, 0),
    ("company run reads every value, not just the first",
     "companies 80001, 80002, 80003", 3, 0),
    ("scrubbed 7-digit BU account passes",
     "3120 resolves to 9999998.146363, which is why", 1, 0),
    ("an in-reserve account ending a sentence is still read",
     "the leg landed on 9999998.146363.", 1, 0),
    ("CLAUDE.md's own generic passes",
     "Use clean fictional generics (5000.140000, MFG01.4220)", 2, 0),
    ("subsidiary form passes",
     "100.5100.MKTG is fine", 1, 0),
    ("B-series business unit passes",
     "keys differ on B000001.1121.SB00222", 1, 0),
    ("a money amount is not an account",
     "reclassified 42,258.57 in the period", 0, 0),
    ("a version string is not an account",
     "bumped to 15.0.4382.1 on the box", 0, 0),
    ("a bare five-digit number is not a company",
     "the agent answers on port 34537 over plain http", 0, 0),
    ("prose 'co' does not anchor a company read",
     "the co-authored line lands at 12345 characters", 0, 0),
]


def failing_cases(root):
    """The cases that must be CAUGHT, read from the excluded fixture directory.

    They cannot be inlined above -- this file is tracked, so the scanner reads
    it, and an out-of-reserve literal here fails the gate on its own source."""
    path = os.path.join(root, FIXTURE_DIR, "failing-cases.tsv")
    cases = []
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.rstrip("\n")
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            parts = raw.split("\t")
            if len(parts) != 4:
                raise ValueError("malformed case (want 4 tab-separated fields): %r" % raw)
            want_ok, want_bad, label, line = parts
            cases.append((label, line, int(want_ok), int(want_bad)))
    if not cases:
        # A zero here would silently delete every catching case from the suite
        # and still print "self-test passed".
        raise ValueError("no failing cases loaded from %s" % path)
    return cases


def self_test():
    failures = []
    root = repo_root()
    cases = list(SELF_TESTS) + failing_cases(root)
    for label, line, want_ok, want_bad in cases:
        ok, bad = [], []
        scan_line("<self-test>", 1, line, ok, bad)
        if len(ok) != want_ok or len(bad) != want_bad:
            failures.append(
                "%s\n      line     : %s\n      expected : %d in-reserve, %d out\n"
                "      got      : %d in-reserve, %d out%s"
                % (
                    label, line, want_ok, want_bad, len(ok), len(bad),
                    "".join("\n      caught   : %s %s" % (h.kind, h.value) for h in bad),
                )
            )

    # The control has to be exercised too, or its own failure path is untested.
    control = report([], [], 0, quiet=True)
    if control != 1:
        failures.append("the control floor did not fail on zero in-reserve hits")

    # End to end, through the file reader. `scan_line` passing in memory does
    # not show that the gate opens a file, walks it, and returns non-zero --
    # which is the only thing CI actually calls.
    fixture = os.path.join(FIXTURE_DIR, "unprovenanced.fixture.md")
    if not os.path.exists(os.path.join(root, fixture)):
        failures.append("the failing fixture is missing: %s" % fixture)
    else:
        ok, bad, read = scan_paths(root, [fixture])
        if read != 1:
            failures.append("the fixture was not read (read=%d)" % read)
        if len(bad) != 6:
            failures.append(
                "fixture: expected 6 out-of-reserve hits, got %d%s"
                % (len(bad), "".join("\n      caught   : %s %s" % (h.kind, h.value)
                                     for h in bad))
            )
        if len(ok) != 9:
            failures.append(
                "fixture: expected 9 in-reserve controls, got %d -- the reserve "
                "moved, or the scanner stopped matching" % len(ok)
            )
        if report(ok, bad, read, floor=0, quiet=True) != 1:
            failures.append("the gate returned 0 on a fixture built to fail it")

    if failures:
        print("")
        print("self-test FAILED: %d of %d cases" % (len(failures), len(cases) + 1))
        for f in failures:
            print("  - %s" % f)
        return 1
    print("self-test passed: %d cases (%d of them expect a catch)"
          % (len(cases) + 1, sum(1 for t in cases if t[3])))
    return 0


def repo_root():
    """The repo root, derived from this script's location (Tools/ sits at root)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--self-test", action="store_true",
                    help="run the case suite and exit")
    ap.add_argument("--list-reserve", action="store_true",
                    help="print the reserved ranges and their provenance")
    ap.add_argument("--path", action="append", default=None,
                    help="scan only this path (repeatable); default is every tracked file")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()
    if args.list_reserve:
        return list_reserve()

    root = repo_root()
    if args.path:
        # A path may be a directory: expand it against the tracked list so
        # `--path RRUniversity` scans the folder rather than reading zero files
        # and reporting a clean, meaningless zero.
        tracked = list(tracked_files(root))
        wanted = [p.replace("\\", "/").rstrip("/") for p in args.path]
        paths = [
            rel for rel in tracked
            if any(rel.replace("\\", "/") == w
                   or rel.replace("\\", "/").startswith(w + "/")
                   for w in wanted)
        ]
        if not paths:
            print("no tracked files matched: %s" % ", ".join(args.path),
                  file=sys.stderr)
            return 1
    else:
        paths = list(tracked_files(root))
    ok, bad, read = scan_paths(root, paths)
    floor = 0 if args.path else CONTROL_FLOOR
    return report(ok, bad, read, floor)


if __name__ == "__main__":
    sys.exit(main())
