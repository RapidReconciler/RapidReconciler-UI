#!/usr/bin/env python3
"""Inject each customer doc's last-commit date into its <time class="doc-last-updated">.

Invoked by .github/workflows/update-doc-dates.yml on every push to main that
touches a customer-facing doc.

For each HTML file under RRUniversity/, Scenarios/, or HelpDesk/ that carries
a `data-doc-type="..."` attribute on <body>, the script:

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

DIRS = ["RRUniversity", "Scenarios", "HelpDesk"]
DOC_TYPE_MARKER = "data-doc-type="

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
    dt = datetime.fromisoformat(iso)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%B %-d, %Y")


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
    updated = []
    for d in DIRS:
        for f in sorted(Path(d).glob("*.html")):
            if process(f):
                updated.append(str(f))
    if updated:
        print(f"Updated last-updated date on {len(updated)} file(s):")
        for f in updated:
            print(f"  {f}")
    else:
        print("No date changes needed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
