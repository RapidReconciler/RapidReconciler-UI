#!/usr/bin/env python
"""PostToolUse hook: catch broken markdown table rows in WORKLIST.md / HANDOFF.md.

WHY THIS EXISTS. Twelve rows in WORKLIST.md were found rendering wrong on
2026-08-28, from three causes that all look identical to a reader:

  1. A literal `|` inside a code span (`tier|db|company`, `a || b`, `|oob|<1`).
     Markdown splits the row on it, so the status cell ends up somewhere other
     than where anyone looks.
  2. A new status appended as `| <new text>` instead of edited into the
     existing status cell. VLC-16 accumulated three of those; UI-153 and
     UI-162 carry two complete need/status pairs each.
  3. A whole markdown table pasted inside one row. UI-164 reached 51 columns
     and 13,017 characters that way.

None of it is visible while writing, and a row whose status column has moved
is exactly the failure that made five rows read as stale in one session. The
check is cheap and the defect is not, so it runs on every write.

WHAT IT CHECKS. Each table's column count comes from that table's own
`|---|---|` separator, not from a hard-coded number, because this file mixes
3-, 4- and 5-column tables. A pipe preceded by a backslash is an escaped
literal and is not a separator.

RUNS ON TWO EVENTS. PostToolUse/Edit|Write checks the file just written, and
Stop sweeps the known paths at end of turn. The Stop leg is the one that
matters in practice -- rows in this file are long enough that they get edited
by script through Bash, which the Edit|Write matcher never sees.

Emits the hook contract on stdout, echoing whichever event invoked it:

    {"hookSpecificOutput": {"hookEventName": "PostToolUse" | "Stop",
                            "additionalContext": "..."}}

FAILS OPEN, and deliberately does not block. A malformed row is a formatting
defect, not a correctness one; a hook that refused the write would be worse
than the thing it guards. It reports and gets out of the way.
"""

import json
import os
import re
import sys

BS = chr(92)
PIPE = "|"

# Only these files. Every other markdown file in the tree is prose or a doc
# with its own conventions, and flagging those would train people to ignore
# the hook.
WATCHED = ("WORKLIST.md", "HANDOFF.md")

# Absolute paths for the Stop-event sweep.
#
# WHY A STOP HOOK TOO, and this is not belt-and-braces. PostToolUse/Edit|Write
# only sees the Edit and Write tools. Every WORKLIST edit made on 2026-08-28
# went through Bash running a python script instead -- long table rows are
# impractical to Edit by hand -- and the matcher never fires for those. A guard
# that misses the way the file is actually written is not a guard, which is the
# same mistake as putting the dev TLS flag in a gitignored file. The Stop sweep
# catches every edit path because it does not care how the file changed.
SWEEP = (
    r"C:\source\repos\WORKLIST.md",
    r"C:\source\repos\HANDOFF.md",
)

SEP_RE = re.compile(r"^\|[\s:\-|]+\|\s*$")
MAX_REPORT = 12


def real_pipes(line):
    """Count cell separators: pipes NOT preceded by a backslash."""
    return sum(
        1
        for i, ch in enumerate(line)
        if ch == PIPE and (i == 0 or line[i - 1] != BS)
    )


def offending_spans(line):
    """Code spans on this line that still hold an unescaped pipe."""
    out = []
    for span in re.findall(r"`[^`]*`", line):
        for i, ch in enumerate(span):
            if ch == PIPE and (i == 0 or span[i - 1] != BS):
                out.append(span if len(span) <= 60 else span[:57] + "...")
                break
    return out


ID_ROW_RE = re.compile(r"^\| \*\*[A-Z]+-\d+\*\*")


def scan(path):
    """Return (mismatches, orphans).

    mismatches -- (line_no, expected, actual, offending_spans)
    orphans    -- line_no of an ID row with no separator above it in its block

    The orphan case is the one that cost the most to find. A blank line ENDS a
    markdown table, so an ID row written after one is not a malformed table
    row, it is not a table row at all -- it renders as the literal text
    "| **VLC-16** | ... |". Column counting alone never sees it, because there
    is no separator to count against. Measured 2026-08-28: 36 of them.
    """
    with open(path, encoding="utf-8", newline="") as fh:
        lines = fh.read().split("\n")

    mismatches, orphans = [], []
    expected = None          # column count of the table currently being read
    saw_separator = False    # has THIS block declared one yet?
    pending = []             # rows seen before this table's separator

    for n, raw in enumerate(lines, start=1):
        line = raw.rstrip("\r")

        if not line.startswith(PIPE):
            expected = None
            saw_separator = False
            pending = []
            continue

        if SEP_RE.match(line):
            saw_separator = True
            expected = real_pipes(line) - 1
            # the header row above had to match; check it retroactively
            for hn, hline in pending:
                got = real_pipes(hline) - 1
                if got != expected:
                    mismatches.append((hn, expected, got, offending_spans(hline)))
            pending = []
            continue

        if not saw_separator:
            # Only ID rows are reported. A stray "| something |" in prose is
            # the author's business; an ID row that silently stopped being a
            # table row is not.
            if ID_ROW_RE.match(line):
                orphans.append(n)
            else:
                pending.append((n, line))
                if len(pending) > 2:
                    pending = []
            continue

        got = real_pipes(line) - 1
        if got != expected:
            mismatches.append((n, expected, got, offending_spans(line)))

    return mismatches, orphans


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    payload = payload or {}
    event = payload.get("hook_event_name") or ""

    targets = []
    if event == "Stop":
        # No tool_input on Stop. Sweep the known files instead, which is the
        # only way to catch edits made through Bash rather than Edit/Write.
        targets = [p for p in SWEEP if os.path.isfile(p)]
    else:
        tool_input = payload.get("tool_input") or {}
        path = tool_input.get("file_path") or ""
        if path and os.path.basename(path) in WATCHED:
            targets = [path]

    if not targets:
        return 0

    mismatches, orphans, base = [], [], ""
    for path in targets:
        try:
            m, o = scan(path)
        except Exception:
            continue
        if m or o:
            base = os.path.basename(path) if not base else base + " + " + os.path.basename(path)
            mismatches += m
            orphans += o

    if not mismatches and not orphans:
        return 0

    lines = ["TABLE PROBLEMS in %s." % base, ""]

    if mismatches:
        lines.append(
            "%d row(s) with the WRONG COLUMN COUNT -- the status column has moved,"
            % len(mismatches)
        )
        lines.append("so a reader will not find it where they look.")
        for n, exp, got, spans in mismatches[:MAX_REPORT]:
            lines.append("  line %-6d expected %d columns, found %d" % (n, exp, got))
            for s in spans[:2]:
                lines.append("      unescaped pipe in code span: %s" % s)
        if len(mismatches) > MAX_REPORT:
            lines.append("  ... and %d more" % (len(mismatches) - MAX_REPORT))
        lines += [
            "",
            "Usual causes: a literal | inside a code span (escape it as " + BS + "|),",
            "a new status appended as a NEW cell instead of edited into the",
            "existing one, or a whole table pasted inside a row.",
            "",
        ]

    if orphans:
        shown = ", ".join(str(o) for o in orphans[:MAX_REPORT])
        more = "" if len(orphans) <= MAX_REPORT else " ... and %d more" % (
            len(orphans) - MAX_REPORT
        )
        lines += [
            "%d ID row(s) with NO SEPARATOR above them -- these do not render as"
            % len(orphans),
            "a table AT ALL. A blank line ends a markdown table, so anything after",
            "one is literal text until a new header + |---| pair opens a new table.",
            "  lines: " + shown + more,
            "",
            "Fix by removing the blank line, or by giving the block its own header",
            "and separator. Column counting cannot see this class -- there is no",
            "separator to count against.",
        ]

    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": event or "PostToolUse",
                "additionalContext": "\n".join(lines),
            }
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
