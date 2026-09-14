#!/usr/bin/env python3
"""Inject each customer doc's last-commit date into its <time class="doc-last-updated">.

Invoked by .github/workflows/update-doc-dates.yml on every push to main that
touches a customer-facing doc.

For each HTML file under one of DIRS below that carries a
`data-doc-type="..."` attribute on <body>, the script:

  1. Runs `git log -1 --format=%aI -- <file>` to get the ISO date of the most
     recent commit that touched that specific file.
  2. Formats it as "Month D, YYYY" for display.
  3. Replaces the contents of the single
     <span class="doc-last-updated">Last updated <time datetime="...">...</time></span>
     block with the new dates.
  4. Writes the file back ONLY if the date actually changed, so the workflow's
     follow-up `git add` + commit step is a no-op when nothing moved.
"""

import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ⛔ GSIRRTech AND GSIRRSales WERE MISSING AND FIFTEEN DOCS WERE SHOWING A DATE
# NOBODY HAD REFRESHED. Found 2026-09-14 by the commit sweep, after an edit to
# using-valc.html left it displaying "Last updated June 1, 2026".
#
# Measured at the time: 14 GSIRRTech docs and 1 GSIRRSales doc carry the
# doc-last-updated span, all 15 carry data-doc-type, and every one of them was
# stale -- certificate-management.html showed 2026-05-25 against a last commit
# of 2026-09-12, nearly four months. A "Last updated" line that is wrong is
# worse than none: a tech reading it concludes the doc predates the change they
# are looking for.
#
# ⚠ THIS LIST HAS TWO TWINS, NOT ONE. update-doc-dates.yml repeats it as `paths:`
# (whether the script runs at all) AND again in its `git add` line (what actually
# gets committed). Drift between them is exactly how this happened: the script
# would have processed GSIRRTech happily for months, but the workflow never
# triggered on it, so the script never ran. `assert_workflow_agrees` below checks
# BOTH copies and fails the run if either disagrees.
DIRS = ["RRUniversity", "Scenarios", "HelpDesk", "GSIRRTech", "GSIRRSales"]
DOC_TYPE_MARKER = "data-doc-type="

WORKFLOW = Path(__file__).resolve().parent.parent / "workflows" / "update-doc-dates.yml"


def assert_workflow_agrees(dirs: list[str]) -> None:
    """Fail unless the workflow BOTH triggers on and stages every dir in DIRS.

    ⛔ THERE ARE THREE COPIES OF THIS LIST AND EACH ONE CAN VETO THE OTHER TWO:

      1. DIRS here            -- what the script rewrites
      2. `paths:` in the yml  -- whether the script runs at all
      3. `git add ...`        -- what actually gets committed

    Fixing only 1 and 2 on 2026-09-14 would have produced a GREEN run that
    refreshed GSIRRTech's dates in the working tree and staged none of them.
    That is worse than the silent failure it replaced: a red run gets
    investigated, a green run that changes nothing does not.

    Reads the file as text rather than parsing YAML. The workflow is the subject
    under test, and requiring PyYAML just to run the guard is one more way for
    the guard not to run.
    """
    if not WORKFLOW.exists():
        print(f"FAIL  cannot find {WORKFLOW} to check against DIRS")
        sys.exit(1)
    text = WORKFLOW.read_text(encoding="utf-8")

    # A control FIRST: if neither marker appears at all, the guard is matching
    # nothing and would pass whatever DIRS said.
    if "RRUniversity/**.html" not in text or "RRUniversity/*.html" not in text:
        print("FAIL  the workflow contains no recognisable path/stage entry -- this")
        print("      guard cannot have checked anything. Has the yml been rewritten?")
        sys.exit(1)

    untriggered = [d for d in dirs if f"{d}/**.html" not in text]
    unstaged = [d for d in dirs
                if f"{d}/*.html" not in text and f"{d}/scenario-*.html" not in text]

    if untriggered or unstaged:
        print("FAIL  update-doc-dates.yml disagrees with DIRS:")
        for d in untriggered:
            print(f"        {d:<14} missing from `paths:` -- a change there never triggers the run")
        for d in unstaged:
            print(f"        {d:<14} missing from `git add` -- its refreshed dates would never be committed")
        sys.exit(1)

# Match the entire doc-last-updated span as one piece — safest replacement
# target since other <time> elements may exist elsewhere in the doc body.
SPAN_RE = re.compile(
    r'<span class="doc-last-updated">\s*Last updated\s*<time datetime="[^"]*"\s*>[^<]*</time>\s*</span>',
    re.DOTALL,
)


def last_commit_iso(path: Path) -> str | None:
    """Returns the ISO 8601 commit date of the most recent commit touching
    `path`, or None if the file is not tracked / has no commits."""
    result = subprocess.run(
        ["git", "log", "-1", "--format=%aI", "--", str(path)],
        capture_output=True,
        text=True,
    )
    out = result.stdout.strip()
    return out or None


def format_pretty(iso: str) -> tuple[str, str]:
    """ISO date plus the "Month D, YYYY" display form, no zero-padded day.

    ⚠ `%-d` IS A GLIBC EXTENSION AND RAISES ValueError ON WINDOWS. This script
    had only ever been run by the Linux runner, so the limitation was invisible
    -- and it meant nobody could exercise the bot locally before pushing, which
    is how a directory could go unwired for months without anyone noticing on
    the box where the docs are actually edited. Building the day by hand is
    portable and produces byte-identical output.
    """
    dt = datetime.fromisoformat(iso)
    return dt.strftime("%Y-%m-%d"), f"{dt.strftime('%B')} {dt.day}, {dt.year}"


def new_span(iso_date: str, pretty_date: str) -> str:
    return (
        f'<span class="doc-last-updated">Last updated '
        f'<time datetime="{iso_date}">{pretty_date}</time></span>'
    )


def process(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    if DOC_TYPE_MARKER not in text:
        return False
    iso = last_commit_iso(path)
    if not iso:
        return False
    iso_date, pretty = format_pretty(iso)
    replacement = new_span(iso_date, pretty)
    if replacement in text:
        return False  # date is already current
    new_text, n = SPAN_RE.subn(replacement, text, count=1)
    if n == 0:
        return False  # no span to update
    path.write_text(new_text, encoding="utf-8")
    return True


def main() -> int:
    # Checked FIRST. A run that processes the wrong set of directories produces
    # a clean "No date changes needed." for the ones it was never triggered on.
    assert_workflow_agrees(DIRS)

    updated = []
    scanned = 0
    for d in DIRS:
        if not Path(d).is_dir():
            print(f"FAIL  DIRS names '{d}' but no such directory exists here")
            return 1
        for f in sorted(Path(d).glob("*.html")):
            scanned += 1
            if process(f):
                updated.append(str(f))
    # A zero is not a result. "No date changes needed" over an empty scan means
    # the script ran somewhere it could not see the docs, not that they are
    # current.
    if scanned == 0:
        print("FAIL  no .html found under any of DIRS -- wrong working directory?")
        return 1
    print(f"scanned {scanned} file(s) across {len(DIRS)} directories")
    if updated:
        print(f"Updated last-updated date on {len(updated)} file(s):")
        for f in updated:
            print(f"  {f}")
    else:
        print("No date changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
