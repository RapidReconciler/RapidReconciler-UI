#!/usr/bin/env python3
"""worklist-reopen.py -- put one closed WORKLIST row back, the reverse of worklist-close.py (VLC-216).

    python Tools/worklist-reopen.py <ID> '<spec as JSON>'
    python Tools/worklist-reopen.py --self-test

Owner, 2026-10-28, after a test close of UI-217 had to be undone by hand on GitHub: "Do we need a
recently closed section where a mistakenly closed issue can be reopened?" VALC's Recently closed band
reopens the issue; worklist-to-issues.py sees the reopen and runs this, so the row comes back the same
way it left: in one step, with both files backed up first.

A closed row has lost its index line and its chunk; only its section survives, in WORKLIST-DONE.md. The
other two come from the row's GitHub issue, whose body the sync wrote while the row was live (and never
edits once it is closed). The sync parses them out (worklist-to-issues.py reopen_spec) and passes:

    {"index": "| [VLC-9](#vlc-9--x) | ◐ | what it is | — |",   the row's index line, rebuilt
     "group": {"module": "in-transit" | null, "prefix": "VLC"},  which '### <n>.' table it goes under
     "chunk": {"slug": "s", "title": "T", "step": 2} | null,      the chunk it was in, and where
     "note":  "Reopened in VALC by ..."}                           why, for the section's record

This then:
  * moves the section from WORKLIST-DONE.md back into WORKLIST.md, above the first row section, and adds
    a "#### ↩ REOPENED <date>: <note>" line under its CLOSED line, so the history reads in order;
  * puts the index line at the top of its group's table: the module's group when the issue carried a
    `module:` label, else the build target's group by ID prefix;
  * puts the ID back in its chunk at its old step, or, when that chunk has gone (it named only this row),
    adds the chunk row back with a line saying why;
  * recounts "## Index -- N live items" and every "### <n>. ... N live" header (worklist_bookkeeping);
  * refuses, changing nothing, if the row is already live (an index line or a section in WORKLIST.md),
    if WORKLIST-DONE.md holds no section for it or more than one, if the index line does not name this
    ID, or if its group table is not there.

Files are read whole, closed, then written, keeping the line endings each was read with (HK-31), the way
worklist-close.py does. Nothing here touches GitHub: the sync's next pass re-posts the issue, which drops
the reopened-in-valc label.
"""
import json
import os
import re
import shutil
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import worklist_bookkeeping  # noqa: E402  (beside this file; shared with worklist-close.py)

ROOT = Path("C:/source/repos")
LIVE = ROOT / "WORKLIST.md"
DONE = ROOT / "WORKLIST-DONE.md"
BACKUPS = ROOT / "_db-backups" / "worklist"

# ID prefix -> the word that names its build-target group: "### 3. VALC — RapidReconciler-Valc · N live".
GROUP_WORD = {"DAC": "dacpac", "ISP": "ispac", "VLC": "VALC", "UI": "UI", "HK": "Housekeeping"}
SECTION_HEAD = re.compile(r"^### [A-Z]+-\d+ ")
REOPENED_LEAD = "#### ↩ REOPENED"


def _read(path):
    """The text with "\n" endings, and the ending the file uses on disk (worklist-close.py's rule)."""
    raw = path.read_bytes()
    crlf = raw.count(b"\r\n")
    lf = raw.count(b"\n") - crlf
    eol = "\r\n" if crlf > lf else "\n"
    if crlf and lf:
        print("note: %s had mixed endings (%d CRLF, %d LF); written back as %s."
              % (path.name, crlf, lf, "CRLF" if eol == "\r\n" else "LF"))
    return raw.decode("utf-8").replace("\r\n", "\n"), eol


def _write(path, text, eol):
    with open(path, "w", encoding="utf-8", newline=eol) as f:
        f.write(text)


def refuse(why):
    sys.exit("REFUSED, nothing changed: " + why)


def group_line(lines, group):
    """Index of the '### <n>. ...' header the row goes under, or None."""
    mod = (group or {}).get("module")
    if mod:
        m = worklist_bookkeeping.issues_module()
        for i, l in enumerate(lines):
            h = m.MODULE_HEAD.match(l)
            if h and m.module_slug(h.group("name")) == mod:
                return i
        return None
    word = GROUP_WORD.get((group or {}).get("prefix"))
    if not word:
        return None
    pat = re.compile(r"^### \d+\. " + re.escape(word) + r"\b")
    return next((i for i, l in enumerate(lines) if pat.match(l)), None)


def table_top(lines, head):
    """Where a new index row goes under the group header at `head`: just below the table's '|---|' line."""
    for i in range(head + 1, len(lines)):
        if lines[i].startswith("### ") or lines[i].startswith("## "):
            return None
        if re.match(r"^\|(\s*-+\s*\|)+\s*$", lines[i]):
            return i + 1
    return None


def put_in_chunk(lines, row_id, chunk, today):
    """The ID back in its chunk at its old step, or the chunk row back. Returns (lines, note)."""
    if not chunk or not chunk.get("slug"):
        return lines, "no chunk on the issue; add it to one by hand"
    chunk_row = worklist_bookkeeping.issues_module().CHUNK_ROW
    start = next((i for i, l in enumerate(lines) if re.match(r"^## Chunks\b", l)), None)
    if start is None:
        return lines, "no '## Chunks' table; add it to one by hand"
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    last = None
    out = list(lines)
    for i in range(start + 1, end):
        c = chunk_row.match(lines[i])
        if not c or c.group("slug") == "chunk":
            continue
        last = i
        if c.group("slug") != chunk["slug"]:
            continue
        ids = re.findall(r"\b[A-Z]+-\d+\b", c.group("rows"))
        at = max(0, min(int(chunk.get("step") or len(ids) + 1) - 1, len(ids)))
        ids.insert(at, row_id)
        cells = lines[i].split("|")
        cells[3] = " " + ", ".join(ids) + " "
        out[i] = "|".join(cells)
        return out, "back in chunk '%s' at step %d" % (chunk["slug"], at + 1)
    if last is None:
        return lines, "the Chunks table has no rows to add after; add it to one by hand"
    title = (chunk.get("title") or chunk["slug"]).replace("|", "/")
    out.insert(last + 1, "| %s | %s | %s | Reopened %s: it was in this chunk when it closed |"
               % (chunk["slug"], title, row_id, today))
    return out, "chunk '%s' added back (it had gone with this row)" % chunk["slug"]


def reopen(row_id, spec):
    index = (spec.get("index") or "").strip()
    if not index.startswith("| [" + row_id + "]("):
        refuse("the index line does not name %s: %r" % (row_id, index[:80]))
    live_text, live_eol = _read(LIVE)
    live = live_text.split("\n")
    if any(l.startswith("### " + row_id + " ") for l in live) or any(l.startswith("| [" + row_id + "](") for l in live):
        refuse("%s is already live in WORKLIST.md (a section or an index line names it)." % row_id)
    done_text, done_eol = _read(DONE)
    done = done_text.split("\n")
    heads = [i for i, l in enumerate(done) if l.startswith("### " + row_id + " ")]
    if len(heads) != 1:
        refuse("WORKLIST-DONE.md has %d section heading(s) for %s; expected exactly one." % (len(heads), row_id))
    start = heads[0]
    end = next((i for i in range(start + 1, len(done)) if re.match(r"^#{1,3} ", done[i])), len(done))
    section = done[start:end]
    while section and section[-1].strip() in ("", "---"):
        section.pop()

    head = group_line(live, spec.get("group"))
    top = table_top(live, head) if head is not None else None
    if top is None:
        refuse("no index table for %s's group %r in WORKLIST.md." % (row_id, spec.get("group")))

    today = date.today().isoformat()
    note = re.sub(r"\s+", " ", (spec.get("note") or "reopened").strip())
    section = section + ["", "%s %s: %s" % (REOPENED_LEAD, today, note)]

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    BACKUPS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(LIVE, BACKUPS / ("WORKLIST.md." + stamp))
    shutil.copy2(DONE, BACKUPS / ("WORKLIST-DONE.md." + stamp))

    out = live[:top] + [index] + live[top:]
    first = next((i for i, l in enumerate(out) if SECTION_HEAD.match(l) and i > top), None)
    block = section + ["", "---", ""]
    out = out[:first] + block + out[first:] if first is not None else out + [""] + block
    out, chunk_note = put_in_chunk(out, row_id, spec.get("chunk"), today)
    n = sum(1 for l in out if re.match(r"^\| \[[A-Z]+-\d+\]\(", l))
    out = [re.sub(r"^## Index — \d+ live items", "## Index — %d live items" % n, l) for l in out]
    out, changes = worklist_bookkeeping.recount_groups(out)

    rest = done[:start] + done[end:]
    while start > 0 and start - 1 < len(rest) and rest[start - 1].strip() == "" and (start >= len(rest) or rest[start].strip() == ""):
        del rest[start - 1]   # no double blank where the section was
        start -= 1
    _write(DONE, "\n".join(rest), done_eol)
    _write(LIVE, "\n".join(out), live_eol)
    print("reopened %s: section of %d lines moved back to WORKLIST.md, index line restored, %d live items; %s%s. "
          "Backups stamped %s." % (row_id, len(section), n, chunk_note,
                                   "".join("; group count now " + c for c in changes), stamp))
    left = worklist_bookkeeping.errors("\n".join(out))
    if left:
        print("WARNING, still wrong after the reopen (fix by hand):\n  " + "\n  ".join(left))


# ---------------------------------------------------------------- self-test

def self_test():
    """Close a row with worklist-close.py, reopen it with this, and require the worklist to read as it did."""
    global LIVE, DONE, BACKUPS
    import contextlib
    import importlib.util
    import io
    spec_c = importlib.util.spec_from_file_location("worklist_close", os.path.join(os.path.dirname(os.path.abspath(__file__)), "worklist-close.py"))
    closer = importlib.util.module_from_spec(spec_c)
    spec_c.loader.exec_module(closer)
    saved = LIVE, DONE, BACKUPS
    tmp = Path(tempfile.mkdtemp(prefix="reopen-test-"))
    LIVE, DONE, BACKUPS = tmp / "WORKLIST.md", tmp / "WORKLIST-DONE.md", tmp / "bk"
    closer.LIVE, closer.DONE, closer.BACKUPS = LIVE, DONE, BACKUPS
    closer.ISSUE_CLOSER = lambda rid, reason: "stubbed"

    def quiet(fn, *a):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            fn(*a)
        return out.getvalue()

    def seed(eol):
        LIVE.write_bytes(closer.FIXTURE_LIVE.replace("\n", eol).encode("utf-8"))
        DONE.write_bytes(closer.FIXTURE_DONE.replace("\n", eol).encode("utf-8"))

    def text(p):
        return p.read_bytes().decode("utf-8").replace("\r\n", "\n")

    hk30 = {"index": "| [HK-30](#hk-30--go) | ☐ | goes | — |", "group": {"module": None, "prefix": "HK"},
            "chunk": {"slug": "pair", "title": "A pair", "step": 1}, "note": "Reopened in VALC by ops@getgsi.com. Why: closed by mistake"}
    try:
        for eol in ("\n", "\r\n"):
            seed(eol)
            quiet(closer.close, "HK-30", "shipped")
            live = text(LIVE)
            assert "| [HK-30](" not in live and "| pair | A pair | HK-31 |" in live, "the close half of the round trip"
            out = quiet(reopen, "HK-30", hk30)
            live, done = text(LIVE), text(DONE)
            for p in (LIVE, DONE):
                b = p.read_bytes()
                crlf, lf = b.count(b"\r\n"), b.count(b"\n") - b.count(b"\r\n")
                assert not ((eol == "\r\n" and lf) or (eol == "\n" and crlf)), "%s lost its %r endings" % (p.name, eol)
            assert live.count("| [HK-30](#hk-30--go) | ☐ | goes | — |") == 1, "the index line is back once: " + live
            assert live.index("| [HK-30](") < live.index("| [HK-31]("), "at the top of its group's table"
            assert "| pair | A pair | HK-30, HK-31 | HK-31 builds on HK-30 |" in live, "back in its chunk at its old step: " + live
            assert "## Index — 3 live items" in live and "Housekeeping &nbsp;&middot;&nbsp; 3 live" in live, live
            assert "### HK-30 — go\n\nbody of HK-30\nline two\n" in live, "the section is back in the live file"
            assert "#### ✅ CLOSED" in live and REOPENED_LEAD in live and "closed by mistake" in live, \
                "the section keeps its CLOSED line and gains the REOPENED one, in that order"
            assert live.index("#### ✅ CLOSED") < live.index(REOPENED_LEAD)
            assert "### HK-30 " not in done and done.rstrip("\n") == closer.FIXTURE_DONE.rstrip("\n"), \
                "WORKLIST-DONE.md reads as it did before the close: " + repr(done[-200:])
            assert worklist_bookkeeping.errors(live) == [], worklist_bookkeeping.errors(live)
            assert "back in chunk 'pair' at step 1" in out, out

        # A chunk that went with the row (it named only HK-3) comes back as a row.
        seed("\n")
        quiet(closer.close, "HK-3", "shipped")
        assert "| keep-it |" not in text(LIVE)
        quiet(reopen, "HK-3", {"index": "| [HK-3](#hk-3--keep) | ☐ | stays | — |", "group": {"prefix": "HK"},
                               "chunk": {"slug": "keep-it", "title": "Keep", "step": 1}, "note": "x"})
        live = text(LIVE)
        assert re.search(r"(?m)^\| keep-it \| Keep \| HK-3 \| Reopened \d{4}-\d\d-\d\d: it was in this chunk when it closed \|$", live), live
        assert worklist_bookkeeping.errors(live) == [], worklist_bookkeeping.errors(live)

        # A module row goes back under its module's group, not its build target's.
        mod_live = closer.FIXTURE_LIVE.replace(
            "---\n\n### HK-3 — keep",
            "### 2. In Transit module &nbsp;&middot;&nbsp; 0 live\n\n| ID | Status | Summary | Ref |\n|---|---|---|---|\n\n---\n\n### HK-3 — keep")
        LIVE.write_text(mod_live, encoding="utf-8")
        DONE.write_text(closer.FIXTURE_DONE + "\n### UI-7 — a module row\n\nbody\n\n#### ✅ CLOSED 2026-10-01: done\n\n---\n", encoding="utf-8")
        quiet(reopen, "UI-7", {"index": "| [UI-7](#ui-7--a-module-row) | ☐ | pages | — |",
                               "group": {"module": "in-transit", "prefix": "UI"}, "chunk": {"slug": "pair", "step": 9}, "note": "x"})
        live = text(LIVE)
        assert "In Transit module &nbsp;&middot;&nbsp; 1 live" in live and "## Index — 4 live items" in live, live
        assert live.index("In Transit module") < live.index("| [UI-7](") < live.index("### HK-3 — keep"), live
        assert "| pair | A pair | HK-30, HK-31, UI-7 |" in live, "a step past the end lands last: " + live

        # Every refusal changes nothing, byte for byte.
        seed("\r\n")
        quiet(closer.close, "HK-30", "shipped")
        good = dict(hk30)
        cases = {
            "already live": ("HK-31", dict(good, index="| [HK-31](#hk-31--next) | ☐ | stays too | — |")),
            "no section in DONE": ("HK-77", dict(good, index="| [HK-77](#x) | ☐ | y | — |")),
            "index line names another row": ("HK-30", dict(good, index="| [HK-31](#hk-31--next) | ☐ | x | — |")),
            "no such group": ("HK-30", dict(good, group={"prefix": "ZZ"})),
            "no such module": ("HK-30", dict(good, group={"module": "nowhere", "prefix": "HK"})),
        }
        before = (LIVE.read_bytes(), DONE.read_bytes())
        for name, (rid, sp) in cases.items():
            try:
                quiet(reopen, rid, sp)
                raise AssertionError("expected a refusal: " + name)
            except SystemExit as e:
                assert "REFUSED" in str(e), (name, e)
            assert (LIVE.read_bytes(), DONE.read_bytes()) == before, "a refusal changed a file: " + name
        # A row that is live AND has a DONE section (a move half made) is refused for being live.
        DONE.write_bytes(before[1] + b"\r\n### HK-31 \xe2\x80\x94 next\r\n\r\nold copy\r\n")
        try:
            quiet(reopen, "HK-31", cases["already live"][1])
            raise AssertionError("a live row with a DONE section must refuse")
        except SystemExit as e:
            assert "already live" in str(e), e
        DONE.write_bytes(before[1] + b"\r\n### HK-30 (part 2) \xe2\x80\x94 again\r\n")
        try:
            quiet(reopen, "HK-30", good)
            raise AssertionError("two DONE sections must refuse")
        except SystemExit as e:
            assert "2 section heading" in str(e), e

        # CONTROL: the round trip above is not passing on a fixture the close never changed.
        seed("\n")
        quiet(closer.close, "HK-30", "shipped")
        assert "| [HK-30](" not in text(LIVE) and "### HK-30 " in text(DONE), "the control: the close did move the row"
    finally:
        LIVE, DONE, BACKUPS = saved
        shutil.rmtree(tmp, ignore_errors=True)
    print("self-test OK (close then reopen restores the index line, the chunk step, the counts and the section, LF and "
          "CRLF kept; a vanished chunk comes back; a module row goes under its module; five refusals and a doubled "
          "DONE section change nothing)")


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        sys.exit(0)
    if len(sys.argv) != 3:
        sys.exit("usage: worklist-reopen.py <ID> '<spec JSON>'  |  worklist-reopen.py --self-test")
    reopen(sys.argv[1], json.loads(sys.argv[2]))
