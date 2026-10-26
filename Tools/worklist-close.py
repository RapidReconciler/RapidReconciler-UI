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
  * takes the ID out of its "## Chunks" row, dropping the row if it named only
    that ID, and recounts every "### <n>. <group> ... N live" header (HK-33).
    Before that, every close left a chunk naming a closed row, which made
    worklist-to-issues.py refuse to run, and a stale group count. Both rules
    live in worklist_bookkeeping.py, which the per-write hook reports from too;
  * refuses, changing nothing, if the ID has no section or no index line, or
    more than one of either;
  * then closes the row's own GitHub issue straight away (HK-47, 2026-10-26).
    VALC's Development page reads the issue, and before this a closed row stayed
    open there until somebody ran the full sync. An issue already closed, or one
    titled for another row, is left alone. A GitHub failure is printed as a WARN
    and never undoes the close; the next sync's close pass retries it.

Each file is read whole, closed, and then written: never read and written in
one open (memory feedback_never_read_and_write_same_open).

Each file is written back with the line endings it was read with (HK-31). It
used Path.write_text, which on Windows turns every "\n" into "\r\n", so every
close flipped both files (~25k lines) from LF to CRLF. A file with mixed
endings comes back in whichever ending it held more of, and the output says so.

    python Tools/worklist-close.py --self-test
"""
import os
import re
import shutil
import sys
import tempfile
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import worklist_bookkeeping  # noqa: E402  (beside this file; shared with worklist-table-check.py)

ROOT = Path("C:/source/repos")
LIVE = ROOT / "WORKLIST.md"
DONE = ROOT / "WORKLIST-DONE.md"
BACKUPS = ROOT / "_db-backups" / "worklist"


def _read(path):
    """The text with "\n" endings, and the ending the file uses on disk."""
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


def close(row_id, reason):
    live_text, live_eol = _read(LIVE)
    live = live_text.split("\n")
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
    done_old, done_eol = _read(DONE)
    done_text = done_old.rstrip("\n") + "\n\n" + "\n".join(closed)

    remaining = [l for i, l in enumerate(live) if not (start <= i < end) and i != index[0]]
    n = sum(1 for l in remaining if re.match(r"^\| \[[A-Z]+-\d+\]\(", l))
    remaining = [re.sub(r"^## Index — \d+ live items", "## Index — %d live items" % n, l) for l in remaining]
    remaining, notes = worklist_bookkeeping.fix(remaining, row_id)

    _write(DONE, done_text, done_eol)
    _write(LIVE, "\n".join(remaining), live_eol)
    print("closed %s: section of %d lines moved to WORKLIST-DONE.md, index line removed, "
          "%d live items remain; %s. Backups stamped %s." % (row_id, len(section), n, "; ".join(notes), stamp))
    left = worklist_bookkeeping.errors("\n".join(remaining))
    if left:
        print("WARNING, still wrong after the close (not caused by it; fix by hand):\n  " + "\n  ".join(left))
    print("GitHub: " + ISSUE_CLOSER(row_id, reason))


def close_issue(row_id, reason, mod=None):
    """HK-47: close the row's own issue now, instead of whenever the next full sync happens to run (VALC's
    Development page reads the issue, so until then it still showed the row open). Reads the issue first:
    one already closed (VALC's Close button, or a sync) or naming another row is left alone. NEVER raises:
    the row has already moved, a GitHub failure must not look like a failed close, and the next sync's
    close pass retries it. Returns one line for the output."""
    try:
        import json
        mod = mod or worklist_bookkeeping.issues_module()
        try:
            mapping = json.load(open(mod.MAP_FILE, encoding="utf-8"))
        except FileNotFoundError:
            return "no issue map yet; the next sync closes the issue"
        e = mapping.get(row_id)
        if not e:
            return "%s has no issue in the map; nothing to close" % row_id
        repo, num = e["repo"], e["number"]
        i = mod.get_issue(repo, num)
        if not i:
            return "%s #%d not found; nothing closed" % (repo, num)
        if not i.get("title", "").startswith("[%s]" % row_id):
            return "%s #%d is titled for another row; NOT touched" % (repo, num)
        if i.get("state") == "closed":
            return "%s #%d was already closed" % (repo, num)
        mod.gh(["issue", "close", str(num), "-R", "%s/%s" % (mod.OWNER, repo), "--reason", "completed",
                "--comment", mod.CLOSE_NOTE.format(wid=row_id) + "\n\n" + reason.strip()])
        return "closed %s #%d" % (repo, num)
    except Exception as ex:  # report, never fail the close that already happened
        return "WARN: the issue was NOT closed (%s: %s); the next sync's close pass will close it" % (
            type(ex).__name__, str(ex)[:200])


ISSUE_CLOSER = close_issue   # the self-test swaps this, so it never reaches the real issues


# ---------------------------------------------------------------- self-test

FIXTURE_LIVE = """# Worklist

## Chunks

| Chunk | Title | Rows, in the order to work them | Why these travel together |
|---|---|---|---|
| keep-it | Keep | HK-3 | stands alone |
| pair | A pair | HK-30, HK-31 | HK-31 builds on HK-30 |

## Index — 3 live items

### 1. Housekeeping &nbsp;&middot;&nbsp; 3 live

| ID | Status | Summary | Ref |
|---|---|---|---|
| [HK-3](#hk-3--keep) | ☐ | stays | — |
| [HK-30](#hk-30--go) | ☐ | goes | — |
| [HK-31](#hk-31--next) | ☐ | stays too | — |

---

### HK-3 — keep

body of HK-3

---

### HK-30 — go

body of HK-30
line two

---

### HK-31 — next

body of HK-31

---
"""

FIXTURE_DONE = """# Worklist — done

### HK-1 — old

closed long ago

---
"""


def close_issue_self_test(tmp):
    """HK-47: close_issue against a fake GitHub. Every refusal path, the close, and a GitHub failure."""
    import json
    from types import SimpleNamespace
    sent = []
    issues = {1: {"title": "[HK-30] go", "state": "open"}, 2: {"title": "[HK-31] next", "state": "closed"},
              3: {"title": "[HK-99] someone else", "state": "open"}}
    mp = tmp / "map.json"
    mp.write_text(json.dumps({"HK-30": {"repo": "R", "number": 1}, "HK-31": {"repo": "R", "number": 2},
                              "HK-3": {"repo": "R", "number": 3}, "HK-4": {"repo": "R", "number": 404}}))
    mod = SimpleNamespace(MAP_FILE=str(mp), OWNER="O", CLOSE_NOTE="Closed: {wid} moved.",
                          get_issue=lambda repo, n: issues.get(n), gh=sent.append)
    assert close_issue("HK-30", "shipped", mod) == "closed R #1", "an open issue for the row is closed"
    assert sent == [["issue", "close", "1", "-R", "O/R", "--reason", "completed", "--comment",
                     "Closed: HK-30 moved.\n\nshipped"]], sent
    assert close_issue("HK-31", "x", mod) == "R #2 was already closed" and len(sent) == 1, "a closed issue is left alone"
    assert "NOT touched" in close_issue("HK-3", "x", mod) and len(sent) == 1, "another row's issue is never closed"
    assert "not found" in close_issue("HK-4", "x", mod) and len(sent) == 1
    assert "no issue in the map" in close_issue("HK-5", "x", mod) and len(sent) == 1
    mod.MAP_FILE = str(tmp / "absent.json")
    assert "no issue map yet" in close_issue("HK-30", "x", mod)
    mod.MAP_FILE = str(mp)

    def boom(args):
        raise RuntimeError("issue close: HTTP 502")
    mod.gh = boom
    out = close_issue("HK-30", "x", mod)
    assert out.startswith("WARN") and "502" in out, "a GitHub failure is reported, never raised: " + out


def self_test():
    global LIVE, DONE, BACKUPS, ISSUE_CLOSER
    import contextlib
    import io
    saved = LIVE, DONE, BACKUPS, _write, ISSUE_CLOSER
    tmp = Path(tempfile.mkdtemp(prefix="close-test-"))
    LIVE, DONE, BACKUPS = tmp / "WORKLIST.md", tmp / "WORKLIST-DONE.md", tmp / "bk"
    asked = []
    ISSUE_CLOSER = lambda rid, reason: asked.append(rid) or "stubbed"

    def seed(eol):
        LIVE.write_bytes(FIXTURE_LIVE.replace("\n", eol).encode("utf-8"))
        DONE.write_bytes(FIXTURE_DONE.replace("\n", eol).encode("utf-8"))

    def endings_kept(eol):
        """Every line ending in both files is still `eol`. Returns the problems found."""
        bad = []
        for p in (LIVE, DONE):
            b = p.read_bytes()
            crlf, lf = b.count(b"\r\n"), b.count(b"\n") - b.count(b"\r\n")
            if (eol == "\r\n" and lf) or (eol == "\n" and crlf):
                bad.append("%s: %d CRLF, %d LF" % (p.name, crlf, lf))
        return bad

    def quiet(fn, *a):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            fn(*a)
        return out.getvalue()

    try:
        for eol in ("\n", "\r\n"):
            seed(eol)
            quiet(close, "HK-30", "shipped")
            assert not endings_kept(eol), (repr(eol), endings_kept(eol))
            live = LIVE.read_bytes().decode("utf-8").replace("\r\n", "\n")
            done = DONE.read_bytes().decode("utf-8").replace("\r\n", "\n")
            assert "### HK-30 " not in live and "| [HK-30](" not in live, live
            assert "### HK-3 — keep" in live and "| [HK-3](" in live, live
            assert "## Index — 2 live items" in live, live
            # HK-33: out of its shared chunk, the group count follows, and nothing is left to report
            assert "| pair | A pair | HK-31 | HK-31 builds on HK-30 |" in live, live
            assert "Housekeeping &nbsp;&middot;&nbsp; 2 live" in live, live
            assert worklist_bookkeeping.errors(live) == [], worklist_bookkeeping.errors(live)
            assert done.startswith(FIXTURE_DONE.rstrip("\n")) and "### HK-30 — go\n\nbody of HK-30\nline two\n" in done, done
            assert "#### ✅ CLOSED %s: shipped" % date.today().isoformat() in done, done
            assert len(list(BACKUPS.iterdir())) >= 2
            assert asked and asked[-1] == "HK-30", "HK-47: a close asks GitHub to close the row's issue: %r" % asked

        # HK-33: a chunk that named only the closed row goes, and the fixture starts clean (the control)
        seed("\n")
        assert worklist_bookkeeping.errors(FIXTURE_LIVE) == [], worklist_bookkeeping.errors(FIXTURE_LIVE)
        quiet(close, "HK-3", "shipped")
        live = LIVE.read_text(encoding="utf-8")
        assert "| keep-it |" not in live and "| pair | A pair | HK-30, HK-31 |" in live, live
        assert "Housekeeping &nbsp;&middot;&nbsp; 2 live" in live, live
        assert worklist_bookkeeping.errors(live) == [], worklist_bookkeeping.errors(live)

        # HK-33 mutation arms, one at a time: each bookkeeping half switched off must leave
        # exactly the problem the hook reports, or the check above proves nothing.
        real_fix = worklist_bookkeeping.fix
        arms = {
            "chunk left naming the closed row": lambda ls, rid: (worklist_bookkeeping.recount_groups(ls)[0], []),
            "group count left stale": lambda ls, rid: (worklist_bookkeeping.drop_from_chunks(ls, rid)[0], []),
        }
        expect = {"chunk left naming the closed row": "names HK-30, which is not a live row",
                  "group count left stale": "says 3 live, its table holds 2"}
        try:
            for name, arm in arms.items():
                worklist_bookkeeping.fix = arm
                seed("\n")
                quiet(close, "HK-30", "shipped")
                errs = worklist_bookkeeping.errors(LIVE.read_text(encoding="utf-8"))
                assert any(expect[name] in e for e in errs), "mutation arm '%s' went undetected: %r" % (name, errs)
        finally:
            worklist_bookkeeping.fix = real_fix

        # a refusal changes nothing, byte for byte, and asks GitHub for nothing
        seed("\r\n")
        before, n_asked = (LIVE.read_bytes(), DONE.read_bytes()), len(asked)
        try:
            quiet(close, "HK-99", "no such row")
            raise AssertionError("expected a refusal")
        except SystemExit as e:
            assert "REFUSED" in str(e), e
        assert (LIVE.read_bytes(), DONE.read_bytes()) == before
        assert len(asked) == n_asked, "a refused close must not touch any issue"
        close_issue_self_test(tmp)

        # a mixed file comes back in its majority ending, and the output says so
        LIVE.write_bytes(FIXTURE_LIVE.replace("\n", "\r\n").replace("body of HK-3\r\n", "body of HK-3\n").encode())
        DONE.write_bytes(FIXTURE_DONE.replace("\n", "\r\n").encode())
        out = quiet(close, "HK-30", "shipped")
        assert "mixed endings" in out and not endings_kept("\r\n"), (out, endings_kept("\r\n"))

        # mutation arm: the pre-HK-31 writer. On Windows it turns LF into CRLF, and the check must see it.
        if os.linesep == "\r\n":
            globals()["_write"] = lambda path, text, eol: path.write_text(text, encoding="utf-8")
            seed("\n")
            quiet(close, "HK-30", "shipped")
            assert endings_kept("\n"), "mutation arm: the old write_text writer went undetected"
            mutation = "caught"
        else:
            mutation = "skipped (write_text only translates endings where os.linesep is CRLF)"
    finally:
        LIVE, DONE, BACKUPS, w, ISSUE_CLOSER = saved
        globals()["_write"] = w
        shutil.rmtree(tmp, ignore_errors=True)
    print("self-test OK (LF kept, CRLF kept, chunks and group counts follow a close, refusal untouched, "
          "mixed reported; HK-33 mutation arms caught; line-ending mutation arm %s; HK-47: a close closes "
          "its issue, every refusal path and a GitHub failure handled)" % mutation)


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        sys.exit(0)
    if len(sys.argv) != 3 or not sys.argv[2].strip():
        sys.exit("usage: worklist-close.py <ID> \"<reason>\"  |  worklist-close.py --self-test")
    close(sys.argv[1], sys.argv[2])
