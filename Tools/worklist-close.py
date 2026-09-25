#!/usr/bin/env python3
"""worklist-close.py -- close one WORKLIST row the way the rule says, in one step.

    python Tools/worklist-close.py VLC-16 "Why it is closed, one or two sentences."

Hard rule 11: a row is done when its SECTION is in WORKLIST-DONE.md and its
INDEX line is gone from WORKLIST.md. Doing that by hand on a 120k-character
file is where rows got half-closed: section moved, index line left, or the
reverse. This does both, plus:

  * backs up both files to C:/source/repos/_db-backups/worklist/ first -- they
    live outside git, so there is no other undo;
  * appends a "#### CLOSED <date>: <reason>" block to the moved section;
  * recomputes the "## Index -- N live items" header from the rows that remain,
    because that number had drifted (it said 11 with 15 rows live);
  * refuses, changing nothing, if the ID has no section or no index line, or
    more than one of either.

Each file is read whole, closed, and then written: never read and written in
one open (memory feedback_never_read_and_write_same_open).
"""
import re
import shutil
import sys
from datetime import date, datetime
from pathlib import Path

ROOT = Path("C:/source/repos")
LIVE = ROOT / "WORKLIST.md"
DONE = ROOT / "WORKLIST-DONE.md"
BACKUPS = ROOT / "_db-backups" / "worklist"


def close(row_id, reason):
    live = LIVE.read_text(encoding="utf-8").split("\n")
    heads = [i for i, l in enumerate(live) if l.startswith("### " + row_id + " ")]
    index = [i for i, l in enumerate(live) if l.startswith("| [" + row_id + "](")]
    if len(heads) != 1 or len(index) != 1:
        sys.exit("REFUSED, nothing changed: %s has %d section heading(s) and %d index line(s); "
                 "expected exactly one of each." % (row_id, len(heads), len(index)))

    start = heads[0]
    end = next((i for i in range(start + 1, len(live)) if live[i].startswith("### ")), len(live))
    section = live[start:end]
    while section and section[-1].strip() in ("", "---"):
        section.pop()

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    BACKUPS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LIVE, BACKUPS / ("WORKLIST.md." + stamp))
    shutil.copy2(DONE, BACKUPS / ("WORKLIST-DONE.md." + stamp))

    closed = section + ["", "#### ✅ CLOSED %s: %s" % (date.today().isoformat(), reason.strip()), "", "---", ""]
    done_text = DONE.read_text(encoding="utf-8").rstrip("\n") + "\n\n" + "\n".join(closed)

    remaining = [l for i, l in enumerate(live) if not (start <= i < end) and i != index[0]]
    n = sum(1 for l in remaining if re.match(r"^\| \[[A-Z]+-\d+\]\(", l))
    remaining = [re.sub(r"^## Index — \d+ live items", "## Index — %d live items" % n, l) for l in remaining]

    DONE.write_text(done_text, encoding="utf-8")
    LIVE.write_text("\n".join(remaining), encoding="utf-8")
    print("closed %s: section of %d lines moved to WORKLIST-DONE.md, index line removed, "
          "%d live items remain. Backups stamped %s." % (row_id, len(section), n, stamp))


if __name__ == "__main__":
    if len(sys.argv) != 3 or not sys.argv[2].strip():
        sys.exit("usage: worklist-close.py <ID> \"<reason>\"")
    close(sys.argv[1], sys.argv[2])
