"""The two WORKLIST.md tallies a close has to keep true, shared by the closer and the hook (HK-33).

1. The '## Chunks' table. Every live row is in exactly one chunk, and a chunk names only live
   rows. The RULE is worklist-to-issues.py's own `chunk_errors`, imported rather than copied,
   because that script refuses to run on any error and a copied rule could drift from the
   one that refuses.
2. The '### <n>. <group> ... N live' headers over the index. N is the number of index rows
   under that header, counted the way worklist-close.py already counts the top
   '## Index -- N live items' header.

Measured 2026-10-02 (HK-33): closing HK-31 left its chunk row naming a closed ID, which made
`chunk_errors` return "chunk close-line-endings names HK-31, which is not a live row" and so
blocked every issue copy, and left '### 5. Housekeeping · 1 live' over an empty table. It
happened again closing VLC-86 and VLC-119 on 2026-10-03.

`fix(text, row_id)` is what worklist-close.py applies; `errors(text)` is what the hook reports.
"""

import importlib.util
import os
import re

_HERE = os.path.dirname(os.path.abspath(__file__))
_issues = None

GROUP_RE = re.compile(r"^(### \d+\. .*?)(\d+)( live)\s*$")
INDEX_ROW_RE = re.compile(r"^\| \[[A-Z]+-\d+\]\(")


def issues_module():
    """worklist-to-issues.py, loaded by path (its file name has a hyphen). Import only: no main()."""
    global _issues
    if _issues is None:
        spec = importlib.util.spec_from_file_location("worklist_to_issues", os.path.join(_HERE, "worklist-to-issues.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _issues = mod
    return _issues


def live_ids(text):
    rows, _ = issues_module().parse(text)
    return [r["id"] for r in rows]


def chunk_errors(text):
    m = issues_module()
    return m.chunk_errors(live_ids(text), m.parse_chunks(text))


def _groups(lines):
    """[(header_line_index, declared_n, counted_n)] for every '### <n>. ... N live' header."""
    out = []
    for i, line in enumerate(lines):
        g = GROUP_RE.match(line)
        if not g:
            continue
        counted = 0
        for nxt in lines[i + 1:]:
            if nxt.startswith("### ") or nxt.startswith("## "):
                break
            if INDEX_ROW_RE.match(nxt):
                counted += 1
        out.append((i, int(g.group(2)), counted))
    return out


def group_count_errors(text):
    lines = text.split("\n")
    return ["'%s' says %d live, its table holds %d row(s)" % (lines[i].strip(), said, counted)
            for i, said, counted in _groups(lines) if said != counted]


def errors(text):
    """Every bookkeeping problem in WORKLIST.md's text. An empty list is the only green."""
    return chunk_errors(text) + group_count_errors(text)


def drop_from_chunks(lines, row_id):
    """Remove row_id from its chunk's rows cell; drop the chunk row if it named only row_id.

    Returns (lines, note). Cells are split on '|', which is safe because worklist-to-issues.py's
    CHUNK_ROW already refuses a '|' inside any cell.
    """
    chunk_row = issues_module().CHUNK_ROW
    start = next((i for i, l in enumerate(lines) if re.match(r"^## Chunks\b", l)), None)
    if start is None:
        return lines, "no '## Chunks' table"
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    out, note = list(lines), "not in any chunk"
    for i in range(start + 1, end):
        c = chunk_row.match(lines[i])
        if not c or c.group("slug") == "chunk":
            continue
        ids = re.findall(r"\b[A-Z]+-\d+\b", c.group("rows"))
        if row_id not in ids:
            continue
        rest = [x for x in ids if x != row_id]
        if not rest:
            out[i] = None
            note = "chunk '%s' removed (it named only %s)" % (c.group("slug"), row_id)
        else:
            cells = lines[i].split("|")
            cells[3] = " " + ", ".join(rest) + " "
            out[i] = "|".join(cells)
            note = "removed from chunk '%s' (left: %s)" % (c.group("slug"), ", ".join(rest))
    return [l for l in out if l is not None], note


def recount_groups(lines):
    """Rewrite every '### <n>. ... N live' header to the rows under it. Returns (lines, changes)."""
    out, changes = list(lines), []
    for i, said, counted in _groups(lines):
        if said != counted:
            g = GROUP_RE.match(lines[i])
            out[i] = g.group(1) + str(counted) + g.group(3)
            changes.append("'%s' (was %d)" % (out[i].strip(), said))
    return out, changes


def fix(lines, row_id):
    """Both tallies after row_id's index line has been removed. Returns (lines, [notes])."""
    lines, chunk_note = drop_from_chunks(lines, row_id)
    lines, changes = recount_groups(lines)
    return lines, [chunk_note] + ["group count now " + c for c in changes]
