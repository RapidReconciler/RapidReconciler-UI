#!/usr/bin/env python
"""PostToolUse hook: catch broken markdown table rows in the WORKLIST files / HANDOFF.md.

WORKLIST.md was split three ways on 2026-08-28 and its LIVE items are now prose
sections rather than table rows, so most of what this hook used to guard has moved
to WORKLIST-DONE.md and WORKLIST-LOG.md -- which are append-only and archival. It
still watches all three: an archive nobody edits can still be broken by a bad
append, and the live file keeps a small index table that can still lose a cell.

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

THIRD CHECK, added 2026-09-02: ID-ALLOCATION DRIFT. The handoff carries a
`Next free: DAC-79, ISP-11, ...` line, and its own instruction is to find the
maximum by grepping all three worklist files AND HANDOFF.md. That instruction
is self-referential: the declaration names IDs that are by definition NOT yet
allocated, so a grep over HANDOFF.md reads its own previous answer as an
allocated ID and returns one too high. The line then gets carried forward by
hand into the next handoff, and the error compounds once per session.

Measured 2026-09-02: the declaration said DAC-79 / ISP-11 while the real
maxima were DAC-77 / ISP-9 -- two sessions of drift in the two categories where
nothing had been allocated. `UI-172` and `UI-173` exist nowhere but in those
declarations. VLC, UI and HK were correct, because rows had actually been
allocated in them recently and the real maximum had caught up with the inflated
guess. That is the worst version of this bug: it self-corrects whenever the
category is busy, so it only ever misleads on the quiet categories.

The fix is to stop deriving the number by hand. An ID is ALLOCATED only if it
appears in an allocation POSITION -- a `### VLC-41` section heading, a live
index cell `| [**VLC-41**](#vlc-41) |`, or a DONE table cell `| **DAC-17** |`.
Prose, wiki-links, cross-references and `Next free:` declarations are mentions,
not allocations. HANDOFF.md is excluded from the scan entirely: it narrates, it
never allocates. Only the FIRST `Next free:` in HANDOFF.md is checked, since the
superseded session blocks below it are history and are meant to disagree.

FOURTH CHECK, added 2026-10-03 (HK-33): WORKLIST.md's BOOKKEEPING. A chunk
row naming a closed ID made worklist-to-issues.py refuse to run, and the
'### <n>. <group> ... N live' headers drifted from the rows under them; this
hook exited 0 through both, because it had no notion of either. The rules
live in worklist_bookkeeping.py (the chunk rule is worklist-to-issues.py's own
chunk_errors, imported), and worklist-close.py now applies the same fixes on
every close. This catches a hand edit too.

    python Tools/worklist-table-check.py --self-test

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

import hashlib
import json
import os
import re
import sys
import tempfile

# Report only when the finding set CHANGES.
#
# WHY. The first version reported unconditionally and fired three turns running
# with byte-identical output, because the backlog it found was not being fixed
# between turns. A check that says the same thing every turn regardless of
# whether anything happened is exactly what trains a reader to skim past it --
# the failure this hook exists to prevent, reproduced by the hook itself.
#
# So: fingerprint the findings, stay silent while they are unchanged, and speak
# up the moment the set differs. A NEW break still shouts on the turn it
# appears. Clearing the last one reports once, then goes quiet.
#
# State lives in the temp dir, so losing it only costs one extra report.
STATE = os.path.join(tempfile.gettempdir(), "rr-worklist-table-check.state")

BS = chr(92)
PIPE = "|"

# Only these files. Every other markdown file in the tree is prose or a doc
# with its own conventions, and flagging those would train people to ignore
# the hook.
WATCHED = ("WORKLIST.md", "WORKLIST-DONE.md", "WORKLIST-LOG.md", "HANDOFF.md")

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
    r"C:\source\repos\WORKLIST-DONE.md",
    r"C:\source\repos\WORKLIST-LOG.md",
    r"C:\source\repos\HANDOFF.md",
)

SEP_RE = re.compile(r"^\|[\s:\-|]+\|\s*$")
MAX_REPORT = 12

# ---- ID-allocation audit -------------------------------------------------
#
# HANDOFF.md is NOT in this list on purpose. It narrates and it declares a
# "Next free:" answer; it never allocates. Including it is the whole bug.
ALLOC_FILES = (
    r"C:\source\repos\WORKLIST.md",
    r"C:\source\repos\WORKLIST-DONE.md",
    r"C:\source\repos\WORKLIST-LOG.md",
)

PREFIXES = ("DAC", "ISP", "VLC", "UI", "HK")
_P = "|".join(PREFIXES)

# The three positions that constitute an allocation. Anything else -- prose, a
# [[wiki-link]], a cross-reference, a "Next free:" line -- is a mention.
ALLOC_RES = (
    re.compile(r"^###\s+(%s)-(\d+)\b" % _P, re.M),              # section heading
    re.compile(r"^\|\s*\[\*\*(%s)-(\d+)\*\*\]" % _P, re.M),     # live index cell
    re.compile(r"^\|\s*\*\*(%s)-(\d+)\*\*\s*\|" % _P, re.M),    # DONE table cell
)

NEXT_FREE_RE = re.compile(r"Next free:", re.I)
ID_TOKEN_RE = re.compile(r"\b(%s)-(\d+)\b" % _P)

# How far past "Next free:" to keep reading. The declaration wraps onto the
# following line, which is exactly why a line-level filter misses half of it.
NEXT_FREE_WINDOW = 240


def allocated_ids():
    """Map prefix -> set of allocated numbers, from allocation positions only."""
    found = dict((p, set()) for p in PREFIXES)
    for path in ALLOC_FILES:
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        for pat in ALLOC_RES:
            for prefix, num in pat.findall(text):
                found[prefix].add(int(num))
    return found


def declared_next_free(path):
    """Parse the FIRST 'Next free:' declaration in path.

    Returns (line_no, {prefix: num}) or (None, {}). Reads a window past the
    marker rather than a single line, because the declaration wraps.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return None, {}

    m = NEXT_FREE_RE.search(text)
    if not m:
        return None, {}

    line_no = text.count("\n", 0, m.start()) + 1
    window = text[m.end():m.end() + NEXT_FREE_WINDOW]
    claimed = {}
    for prefix, num in ID_TOKEN_RE.findall(window):
        claimed.setdefault(prefix, int(num))   # first mention per prefix wins
    return line_no, claimed


def audit_ids():
    """Return (line_no, [(prefix, claimed, correct), ...]) for any drift.

    Empty list means the declaration agrees with the corpus.
    """
    line_no, claimed = declared_next_free(r"C:\source\repos\HANDOFF.md")
    if not claimed:
        return None, []

    found = allocated_ids()
    drift = []
    for prefix, claim in sorted(claimed.items()):
        nums = found.get(prefix) or set()
        correct = (max(nums) + 1) if nums else 1
        if claim != correct:
            drift.append((prefix, claim, correct))
    return line_no, drift


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


def bookkeeping_errors(path):
    """worklist_bookkeeping.errors() for one WORKLIST.md. A check that cannot run SAYS so:
    an empty list here must mean "clean", never "the import failed"."""
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import worklist_bookkeeping
        with open(path, encoding="utf-8") as fh:
            return worklist_bookkeeping.errors(fh.read().replace("\r\n", "\n"))
    except Exception as e:  # report, never block: the hook fails open
        return ["the bookkeeping check could not run (%s: %s)" % (type(e).__name__, e)]


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
    bookkeeping = []
    for path in targets:
        try:
            m, o = scan(path)
        except Exception:
            continue
        if m or o:
            base = os.path.basename(path) if not base else base + " + " + os.path.basename(path)
            mismatches += m
            orphans += o
        if os.path.basename(path) == "WORKLIST.md":
            bookkeeping += bookkeeping_errors(path)

    # The ID audit is corpus-wide rather than per-file, so it runs once no
    # matter which watched file triggered this. It reads its own paths and
    # fails open like everything else here.
    try:
        nf_line, id_drift = audit_ids()
    except Exception:
        nf_line, id_drift = None, []

    # Fingerprint the finding SET, not the prose around it, so a report is
    # emitted when something actually changes and not when it merely recurs.
    sig = hashlib.sha256(
        json.dumps(
            {
                "m": sorted((n, exp, got) for n, exp, got, _ in mismatches),
                "o": sorted(orphans),
                "i": sorted(id_drift),
                "b": sorted(bookkeeping),
            }
        ).encode("utf-8")
    ).hexdigest()

    try:
        with open(STATE, encoding="utf-8") as fh:
            previous = fh.read().strip()
    except OSError:
        previous = ""

    if sig == previous:
        return 0                      # unchanged since last turn: stay quiet

    try:
        with open(STATE, "w", encoding="utf-8") as fh:
            fh.write(sig)
    except OSError:
        pass                          # unwritable state only costs a repeat

    if not mismatches and not orphans and not id_drift and not bookkeeping:
        # Everything cleared. Worth saying once -- but only if something was
        # actually reported before. On a first run against a clean file there
        # is nothing to announce, and "all clear" out of nowhere is noise of
        # the same kind this change is removing.
        if previous:
            json.dump(
                {
                    "hookSpecificOutput": {
                        "hookEventName": event or "PostToolUse",
                        "additionalContext": "WORKLIST tables and ID allocation: "
                        "all previously reported problems are now clear.",
                    }
                },
                sys.stdout,
            )
        return 0

    if not base:
        base = "the worklist corpus"
    lines = ["WORKLIST PROBLEMS in %s (changed since last report)." % base, ""]

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

    if bookkeeping:
        lines += [
            "WORKLIST.md BOOKKEEPING is wrong (%d problem(s)):" % len(bookkeeping),
        ]
        lines += ["  " + b for b in bookkeeping[:MAX_REPORT]]
        if len(bookkeeping) > MAX_REPORT:
            lines.append("  ... and %d more" % (len(bookkeeping) - MAX_REPORT))
        lines += [
            "",
            "A chunk naming a row that is not live, or a live row in no chunk, makes",
            "worklist-to-issues.py refuse to run at all. A '### <n>. ... N live' header",
            "must count the index rows under it. worklist-close.py fixes both on a close;",
            "after a hand edit, fix the Chunks row or the header by hand.",
            "",
        ]

    if id_drift:
        where = "HANDOFF.md line %d" % nf_line if nf_line else "HANDOFF.md"
        lines += [
            "ID ALLOCATION DRIFT -- the 'Next free:' declaration at %s" % where,
            "disagrees with what is actually allocated in the three worklist files:",
            "",
            "  prefix   declared   actually free",
        ]
        for prefix, claim, correct in id_drift:
            lines.append(
                "  %-8s %-10s %s"
                % (prefix, "%s-%d" % (prefix, claim), "%s-%d" % (prefix, correct))
            )
        lines += [
            "",
            "An ID counts as allocated only where it is ALLOCATED: a '### ID'",
            "section heading, a live index cell, or a DONE table cell. A mention in",
            "prose, a [[wiki-link]] or a 'Next free:' line is not an allocation.",
            "",
            "If the declaration reads HIGH, this is the self-referential grep: the",
            "handoff's own instruction says to scan HANDOFF.md, which contains the",
            "previous answer, so each session inflates the last by one. It hides in",
            "busy categories -- the real maximum catches up with the guess -- and",
            "only ever misleads on the quiet ones. Correct the declaration; do not",
            "burn the skipped numbers to make it true.",
            "",
            "If the declaration reads LOW, an ID has been allocated twice. That one",
            "matters more: two rows share a number and one of them will be lost.",
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


SELF_TEST_FIXTURE = """# Worklist

## Chunks

| Chunk | Title | Rows, in the order to work them | Why these travel together |
|---|---|---|---|
| pair | A pair | HK-30, HK-31 | HK-31 builds on HK-30 |

## Index — 2 live items

### 1. Housekeeping &nbsp;&middot;&nbsp; 2 live

| ID | Status | Summary | Ref |
|---|---|---|---|
| [HK-30](#hk-30--go) | ☐ | goes | — |
| [HK-31](#hk-31--next) | ☐ | stays | — |

---

### HK-30 — go

body

---

### HK-31 — next

body

---
"""


def self_test():
    """Drive main() the way the harness does: a PostToolUse payload on stdin naming a WORKLIST.md.

    A hook given no stdin exits 0 having scanned nothing, so calling it bare proves nothing
    (memory reference_worklist_table_check_is_a_hook). Each case gets a fresh STATE file,
    because the hook reports only when its finding set changes.
    """
    global STATE, bookkeeping_errors
    import contextlib
    import io
    import shutil
    tmp = tempfile.mkdtemp(prefix="table-check-test-")
    saved_state, saved_check, saved_stdin = STATE, bookkeeping_errors, sys.stdin

    def run(text, case):
        global STATE
        path = os.path.join(tmp, case, "WORKLIST.md")
        os.makedirs(os.path.dirname(path))
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
        STATE = os.path.join(tmp, case, "state")
        sys.stdin = io.StringIO(json.dumps({"hook_event_name": "PostToolUse", "tool_input": {"file_path": path}}))
        with contextlib.redirect_stdout(io.StringIO()) as out:
            main()
        return out.getvalue()

    stale_chunk = SELF_TEST_FIXTURE.replace("| [HK-30](#hk-30--go) | ☐ | goes | — |\n", "") \
                                   .replace("2 live items", "1 live items").replace("2 live\n", "1 live\n")
    stale_group = SELF_TEST_FIXTURE.replace("| [HK-31](#hk-31--next) | ☐ | stays | — |\n", "") \
                                   .replace("HK-30, HK-31", "HK-30").replace("2 live items", "1 live items")
    try:
        out = run(SELF_TEST_FIXTURE, "clean")
        assert "BOOKKEEPING" not in out, "CONTROL: a clean worklist reported bookkeeping problems:\n" + out
        out = run(stale_chunk, "chunk")
        assert "BOOKKEEPING" in out and "names HK-30, which is not a live row" in out, out
        out = run(stale_group, "group")
        assert "BOOKKEEPING" in out and "says 2 live, its table holds 1" in out, out
        # mutation arm: with the check switched off the same broken file goes unreported,
        # so the reports above came from this check and from nothing else in the hook
        bookkeeping_errors = lambda path: []
        out = run(stale_chunk, "mutated")
        assert "BOOKKEEPING" not in out, "mutation arm: the check is off and it still reported:\n" + out
    finally:
        STATE, bookkeeping_errors, sys.stdin = saved_state, saved_check, saved_stdin
        shutil.rmtree(tmp, ignore_errors=True)
    print("self-test OK (clean control quiet; stale chunk and stale group count reported through main(); "
          "mutation arm: silent with the check off)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        sys.exit(0)
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
