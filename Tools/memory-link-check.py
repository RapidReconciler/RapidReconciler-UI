#!/usr/bin/env python
"""Report [[wiki-link]] targets in the memory corpus that resolve to nothing.

    python Tools/memory-link-check.py            # report, exit 1 if any are dead
    python Tools/memory-link-check.py --quiet    # exit code only

WHY THIS EXISTS. HK-6, opened 2026-09-01: the 160 -> 138 memory consolidation
broke 24 link targets across 52 references, and nobody noticed because
**MEMORY.md index integrity and BODY link integrity are two different checks and
only the first was ever run.** The handoff's "zero dead links" was true of the
index. A dead link inside a memory body is worse than a missing file: it reads
as a pointer to knowledge that exists, so the next session follows it, finds
nothing, and cannot tell "this was lost" from "I typed the name wrong".

⚠ THE FIRST VERSION OF THIS SCAN MANUFACTURED THREE FINDINGS, and the reason is
worth keeping. It reported `feedback_thymeleaf_inline_none_in_scripts.md` as
carrying dead targets `${...}` and `` ` ... ` ``. Those are not links -- they are
that memory's SUBJECT MATTER, since Thymeleaf's own inline syntax is `[[${...}]]`
and the file quotes it inside backticks. A link checker that cannot tell a link
from a quoted example produces exactly the class of false finding this row exists
to remove, so code spans and fences are stripped before anything is matched.

WHAT IT FOUND ON ITS FIRST HONEST RUN (2026-09-03), against HK-6's recorded
"5 dead targets across 14 references": **9 across 18**, and four of the nine were
never named by the row. Three of those four share a signature the row could not
have inferred from a list of five:

    cardex-rollforward-before-after-whati      (-> "what-if"?)
    manage-client-setup-wizar                 (-> "wizard"?)
    practice-client-and-import-testin         (-> "testing"?)

**Each is truncated by exactly one character.** That is not a consolidation
casualty -- a merged entry loses its whole name, not its last letter. It is a
mechanical off-by-one in some earlier bulk rewrite, and it is invisible to a
reader because the truncated name still looks like a plausible slug. The fourth
was an empty `[[ ]]` with the target deleted from between the brackets.

WHAT IT DOES NOT DO. It does not repoint anything. HK-5 set the precedent and
HK-6 follows it: a dead link is a SIGNAL that something was lost, and silently
de-linking hides the loss. Repointing needs evidence -- a successor whose own
body names the absorbed claim -- and that is a judgement call, not a script's.
"""
import argparse
import collections
import io
import os
import re
import sys

MEMORY_DIR = os.path.join(
    os.path.expanduser("~"), ".claude", "projects",
    "C--source-repos-RapidReconciler-AI", "memory")

# The second, DEAD memory directory (see the workspace CLAUDE.md). A target that
# still exists there is recoverable content rather than lost content, which is a
# materially different verdict, so the report says which.
DEAD_DIR = os.path.join(
    os.path.expanduser("~"), ".claude", "projects", "C--source-repos", "memory")

LINK = re.compile(r"\[\[([^\]|]+)\]\]")
FENCE = re.compile(r"```.*?```", re.S)
SPAN = re.compile(r"`[^`\n]*`")


def entry_names(directory):
    if not os.path.isdir(directory):
        return set()
    return {f[:-3] for f in os.listdir(directory)
            if f.endswith(".md") and f != "MEMORY.md"}


def scan(directory):
    """Every link target in every body, mapped to the files referencing it."""
    refs = collections.defaultdict(list)
    for name in sorted(os.listdir(directory)):
        if not name.endswith(".md"):
            continue
        text = io.open(os.path.join(directory, name),
                       encoding="utf-8", errors="replace").read()
        text = SPAN.sub(" ", FENCE.sub(" ", text))   # see the header
        for match in LINK.finditer(text):
            refs[match.group(1).strip()].append(name)
    return refs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quiet", action="store_true", help="exit code only")
    ap.add_argument("--dir", default=MEMORY_DIR)
    args = ap.parse_args()

    if not os.path.isdir(args.dir):
        sys.stderr.write("memory-link-check: no such directory: %s\n" % args.dir)
        return 2

    live = entry_names(args.dir)
    dead = entry_names(DEAD_DIR)
    refs = scan(args.dir)
    broken = {t: v for t, v in refs.items() if t not in live}
    total = sum(len(v) for v in broken.values())

    if args.quiet:
        return 1 if broken else 0

    out = sys.stdout
    out.write("memory-link-check\n")
    out.write("  entries scanned      %d\n" % len(live))
    out.write("  distinct targets     %d\n" % len(refs))
    out.write("  DEAD targets         %d, across %d references\n\n"
              % (len(broken), total))

    if not broken:
        out.write("  every link resolves.\n")
        return 0

    for target in sorted(broken, key=lambda k: (-len(broken[k]), k)):
        where = collections.Counter(broken[target])
        note = "recoverable from the dead memory dir" if target in dead else ""
        # A target truncated by one character reads as a plausible slug, so say so.
        if target and not target.startswith(("feedback_", "project_", "reference_", "user_")):
            note = (note + "; " if note else "") + "not a current naming convention (kebab-case / truncated?)"
        out.write("  %-44s %2d ref(s)%s\n"
                  % (target if target else "(empty target)", len(broken[target]),
                     "  -- " + note if note else ""))
        for f, n in sorted(where.items()):
            out.write("        %s%s\n" % (f, (" x%d" % n) if n > 1 else ""))
    out.write("\n  Dead links are left in place on purpose (HK-5/HK-6): removing one\n"
              "  hides that something was lost. Repoint only where a successor's own\n"
              "  body names the absorbed claim.\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
