#!/usr/bin/env python3
"""worklist-claim.py -- say who holds a WORKLIST row, and check before starting one (HK-30).

    python Tools/worklist-claim.py check HK-30 [VLC-144 ...]
    python Tools/worklist-claim.py take  HK-30 --by "<session name>" --where <worktree> [--where <worktree>]
    python Tools/worklist-claim.py take  HK-30 --by ... --where ... --over     # a stale hold only
    python Tools/worklist-claim.py release HK-30 --by "<session name>"
    python Tools/worklist-claim.py --self-test

On 2026-10-02 two sessions built VLC-137 at once for an hour, and put the same decision to the owner
separately and got two different rulings. Nothing said who held the row. This writes, as the first
line under the row's heading in WORKLIST.md:

    **Held by:** <session> · <worktree>[ + <worktree>] · <UTC, YYYY-MM-DDTHH:MMZ>

A row is held from the moment a session starts MEASURING it, not from when it makes a worktree (the
VLC-137 overlap opened in that gap). `take` refuses, changing nothing, when any of these holds:

  * another session's `Held by:` line is on the row (a malformed one counts);
  * a worktree in any of the six repos has a PATH or BRANCH naming the row (`vlc-144` or `vlc144`:
    today's trees drop the dash) or its chunk slug. Only the path named VLC-137 that day; neither
    branch did. Your own `--where` trees are not a conflict;
  * the row's GitHub issue is labelled claude:queued or claude:running (the dev-box runner has it),
    or that label could not be read: an unread label is not a free row.

`--over` takes over a hold only when it is older than a day AND none of its worktrees still exists.
File times are not a liveness test (a live tree went 27 minutes without a write that day), so the
tool cannot judge the third condition, an unanswered message to the holder: that one is yours.

Writing: under an exclusive lock file, after a backup to _db-backups/worklist/, read whole and
closed before the write, line endings kept as found. The Edit tool does NOT refuse a file that
changed on disk while its anchor still matches (measured twice on 2026-10-02), so after writing
this re-reads the section and requires exactly ONE `Held by:` line; if a second writer slipped one
in, this one backs off and removes its own. Each take and release is also commented on the issue.

Exit: 0 free / taken / released; 3 held, conflicting or refused (nothing changed); 2 bad input.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone

WORKSPACE = r"C:\source\repos"
REAL_WORKLIST = os.path.join(WORKSPACE, "WORKLIST.md")
MAP_FILE = os.path.join(WORKSPACE, "worklist-issues.json")
BACKUPS = os.path.join(WORKSPACE, "_db-backups", "worklist")
GH = r"C:\Program Files\GitHub CLI\gh.exe"
OWNER = "RapidReconciler"
# Local directory names; the UI repo's clone keeps its old name on disk.
REPO_DIRS = ["RapidReconciler-AI", "RapidReconciler-Agent", "RapidReconciler-Valc", "RapidReconciler-DB",
             "RapidReconciler-SSIS", "RapidReconciler-Broker"]
RUNNER_LABELS = ("claude:queued", "claude:running")
STALE_AFTER = timedelta(hours=24)
LOCK_STALE_S = 120
LOCK_WAIT_S = 15

# Test-only: a self-test points the tool at a scratch file. Checks against git and GitHub are skipped
# ONLY when the target is not the real worklist, so this can never weaken a claim on the real one.
WORKLIST = os.environ.get("RR_CLAIM_TEST_FILE") or REAL_WORKLIST
TEST_DELAY = float(os.environ.get("RR_CLAIM_TEST_DELAY") or 0)

ID = re.compile(r"^[A-Z]+-\d+$")
HELD_ANY = re.compile(r"^\*\*Held by:\*\*")
HELD = re.compile(r"^\*\*Held by:\*\*\s*(?P<who>.+?)\s+·\s+(?P<where>.+?)\s+·\s+"
                  r"(?P<at>\d{4}-\d\d-\d\dT\d\d:\d\dZ)(?P<rest>.*?)\s*$")
CHUNK_ROW = re.compile(r"^\|\s*(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\s*\|[^|]*\|(?P<rows>[^|]*)\|")


class Refused(Exception):
    """Nothing was changed; the message says why."""


def utc_now():
    return datetime.now(timezone.utc)


def stamp(t):
    return t.strftime("%Y-%m-%dT%H:%MZ")


def parse_at(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)


# ---------------------------------------------------------------- reading the file

def read(path=None):
    with open(path or WORKLIST, encoding="utf-8", newline="") as f:
        return f.read()


def section(lines, wid):
    """(start, end) of the row's section: its '### ID ' heading up to the next heading. Exactly one."""
    heads = [i for i, l in enumerate(lines) if l.rstrip("\r").startswith("### " + wid + " ")]
    if len(heads) != 1:
        raise Refused(f"{wid} has {len(heads)} section heading(s) in {WORKLIST}; expected exactly one.")
    s = heads[0]
    e = next((i for i in range(s + 1, len(lines)) if lines[i].startswith("### ") or lines[i].startswith("## ")),
             len(lines))
    return s, e


def holds(text, wid):
    """[(raw line, match or None)] for every line starting **Held by:** in the row's section."""
    lines = text.split("\n")
    s, e = section(lines, wid)
    return [(l.rstrip("\r"), HELD.match(l.rstrip("\r"))) for l in lines[s + 1:e] if HELD_ANY.match(l)]


def chunk_of(text, wid):
    m = re.search(r"(?ms)^## Chunks\b.*?(?=^## )", text)
    for line in (m.group(0).splitlines() if m else []):
        c = CHUNK_ROW.match(line)
        if c and c.group("slug") != "chunk" and wid in re.findall(r"\b[A-Z]+-\d+\b", c.group("rows")):
            return c.group("slug")
    return None


def row_token(wid):
    """Matches the row in a path or branch with or without its dash: vlc-144, vlc144, VLC-144."""
    p, n = wid.split("-")
    return re.compile(rf"(?i)(?<![a-z0-9]){re.escape(p)}-?{n}(?![0-9])")


# ---------------------------------------------------------------- the world outside the file

def git_worktrees():
    """[(repo, path, branch)] for every worktree that is not a repo's own checkout."""
    out = []
    for repo in REPO_DIRS:
        d = os.path.join(WORKSPACE, repo)
        if not os.path.isdir(d):
            continue
        r = subprocess.run(["git", "-C", d, "worktree", "list", "--porcelain"], capture_output=True, text=True)
        if r.returncode != 0:
            raise Refused(f"could not list worktrees in {repo}: {r.stderr.strip()}")
        entries = [b for b in r.stdout.strip().split("\n\n") if b.strip()]
        for block in entries[1:]:   # the first entry is the repo's own checkout
            path = branch = ""
            for l in block.splitlines():
                if l.startswith("worktree "):
                    path = l[9:]
                elif l.startswith("branch "):
                    branch = l[7:].replace("refs/heads/", "")
            out.append((repo, path, branch))
    return out


def issue_of(wid):
    m = json.load(open(MAP_FILE, encoding="utf-8")) if os.path.exists(MAP_FILE) else {}
    return m.get(wid)


def gh_labels(wid):
    """The issue's labels, or None when the row has no issue (a UI row, or one not copied yet)."""
    i = issue_of(wid)
    if not i:
        return None
    r = subprocess.run([GH, "issue", "view", str(i["number"]), "-R", f"{OWNER}/{i['repo']}", "--json", "labels"],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip())
    return [l["name"] for l in json.loads(r.stdout)["labels"]]


def gh_comment(wid, body):
    i = issue_of(wid)
    if not i:
        return f"{wid}: no issue in worklist-issues.json, nothing commented"
    r = subprocess.run([GH, "issue", "comment", str(i["number"]), "-R", f"{OWNER}/{i['repo']}", "--body", body],
                       capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        return f"{wid}: WARNING, the claim is in WORKLIST.md but the issue comment failed: {(r.stderr or r.stdout).strip()}"
    return f"{wid}: commented on {i['repo']}#{i['number']}"


class World:
    """What take/check consult outside WORKLIST.md. The self-test swaps these out."""
    def __init__(self, trees=git_worktrees, labels=gh_labels, comment=gh_comment, now=utc_now):
        self.trees, self.labels, self.comment, self.now = trees, labels, comment, now


def offline_world():
    return World(trees=lambda: [], labels=lambda wid: None, comment=lambda wid, body: f"{wid}: (test) no comment")


def default_world():
    if os.path.normcase(os.path.abspath(WORKLIST)) != os.path.normcase(REAL_WORKLIST):
        return offline_world()
    return World()


# ---------------------------------------------------------------- judging

def norm(p):
    return os.path.normcase(os.path.normpath(p.replace("/", os.sep))) if p else ""


def where_parts(where):
    """A hold's worktree field split into paths; a bare name is taken as a sibling of the repos."""
    parts = [w.strip() for w in where.split(" + ") if w.strip()]
    return [w if (os.path.isabs(w) or re.match(r"^[A-Za-z]:", w)) else os.path.join(WORKSPACE, w) for w in parts]


def conflicts(text, wid, by, mine, world, skip_labels=False, ignore=()):
    """(conflict lines, own hold or None, stale holds) for one row. An empty conflict list is the only free."""
    out, own, stale = [], None, []
    now = world.now()
    trees = world.trees()
    tree_paths = {norm(p) for _, p, _ in trees}
    for raw, m in holds(text, wid):
        if not m:
            out.append(f"{wid}: a malformed hold line is on the row, treated as held: {raw}")
            continue
        if m.group("who") == by:
            own = raw
            continue
        age = now - parse_at(m.group("at"))
        alive = [p for p in where_parts(m.group("where")) if norm(p) in tree_paths]
        out.append(f"{wid}: held by {m.group('who')} since {m.group('at')} ({age.total_seconds() / 3600:.1f}h), "
                   f"worktree {m.group('where')}" + (" (still exists)" if alive else ""))
        if age > STALE_AFTER and not alive:
            stale.append(raw)
    token, slug = row_token(wid), chunk_of(text, wid)
    slug_re = re.compile(rf"(?<![a-z0-9]){re.escape(slug)}(?![a-z0-9])") if slug else None
    mine_n = {norm(p) for p in mine} | {norm(p) for p in ignore}
    for repo, path, branch in trees:
        if norm(path) in mine_n:
            continue
        hay = os.path.basename(path.rstrip("/\\")) + " " + branch
        if token.search(hay) or (slug_re and slug_re.search(hay)):
            out.append(f"{wid}: a worktree names it: {repo} {path} [{branch}]  (not yours? ask its session, then "
                       f"--ignore-tree {path})")
    if not skip_labels:
        try:
            labels = world.labels(wid)
        except Exception as e:   # an unread label is not a free row
            out.append(f"{wid}: could not read its issue's labels, so the dev-box runner might hold it: {e}")
            labels = None
        for l in labels or []:
            if l in RUNNER_LABELS:
                out.append(f"{wid}: its issue is labelled {l}: the dev-box runner has it")
    return out, own, stale


# ---------------------------------------------------------------- writing

class Lock:
    def __init__(self, path):
        self.path = path + ".claim-lock"

    def __enter__(self):
        deadline = time.time() + LOCK_WAIT_S
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, f"{os.getpid()} {stamp(utc_now())}".encode())
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    age = time.time() - os.path.getmtime(self.path)
                except OSError:
                    continue
                if age > LOCK_STALE_S:
                    print(f"removing a claim lock left {age:.0f}s ago by a process that did not finish: {self.path}")
                    try:
                        os.remove(self.path)
                    except OSError:
                        pass
                    continue
                if time.time() > deadline:
                    raise Refused(f"another claim has held {self.path} for {LOCK_WAIT_S}s; try again")
                time.sleep(0.1)

    def __exit__(self, *a):
        try:
            os.remove(self.path)
        except OSError:
            pass


def backup(path):
    if path != REAL_WORKLIST:
        return
    os.makedirs(BACKUPS, exist_ok=True)
    shutil.copy2(path, os.path.join(BACKUPS, "WORKLIST.md." + datetime.now().strftime("%Y%m%d-%H%M%S") + ".claim"))


def write(path, text):
    """Whole-file replace through a temp file in the same folder; newline='' keeps the endings as found."""
    fd, tmp = tempfile.mkstemp(prefix=".worklist-claim-", dir=os.path.dirname(path) or ".")
    with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    for attempt in range(20):   # an editor holding the file open for a moment refuses the replace on Windows
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.25)
    os.remove(tmp)
    raise Refused(f"could not replace {path}: it stayed locked by another process")


def held_line(by, where, at):
    return f"**Held by:** {by} · {' + '.join(where)} · {stamp(at)}"


def edit(path, fn):
    """Read whole, close, apply fn(lines, nl) -> lines, write. Always under the lock."""
    text = read(path)
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split("\n")
    if TEST_DELAY:
        time.sleep(TEST_DELAY)   # test-only: widens the read-to-write window for the race test
    new = fn(lines, nl)
    if new is not None:
        backup(path)
        write(path, "\n".join(new))


def validate(ids, by=None, where=None):
    bad = [i for i in ids if not ID.match(i)]
    if bad:
        raise ValueError(f"not a row ID: {', '.join(bad)}")
    for name, v in (("--by", by), *(("--where", w) for w in (where or []))):
        if v is not None and (not v.strip() or "·" in v or "\n" in v or " + " in v):
            raise ValueError(f"{name} must be non-empty and contain no '·', ' + ' or newline: {v!r}")


def take(ids, by, where, world=None, over=False, skip_labels=False, ignore=(), path=None, after_write=None,
         announce=True):
    """Hold every row in ids, or none. Returns report lines; raises Refused with nothing changed.
    Re-taking your own hold with a different worktree moves it there; announce=False skips the issue comment."""
    path, world = path or WORKLIST, world or default_world()
    validate(ids, by, where)
    report, todo, replace = [], [], {}
    text = read(path)
    for wid in ids:   # outside the lock: git and GitHub are slow, and nothing here writes
        found, own, stale = conflicts(text, wid, by, where, world, skip_labels, ignore)
        if found and over and len(stale) == len(found):
            replace[wid] = stale
            report.append(f"{wid}: taking over a stale hold: " + "; ".join(stale))
        elif found:
            raise Refused("\n".join(found) + "\nMessage the holder (ListAgents, then SendMessage) instead of building. "
                          "Nothing was changed.")
        if own and wid not in replace:
            if HELD.match(own).group("where") == " + ".join(where):
                report.append(f"{wid}: already held by you: {own}")
                continue
            report.append(f"{wid}: yours; moving the hold to {' + '.join(where)}")
        todo.append(wid)
    if not todo:
        return report
    at = world.now()
    mine = held_line(by, where, at)

    def put(lines, nl):
        for wid in todo:
            s, e = section(lines, wid)
            body = [l.rstrip("\r") for l in lines[s + 1:e]]
            others = [l for l in body if HELD_ANY.match(l) and l not in replace.get(wid, [])
                      and not (HELD.match(l) and HELD.match(l).group("who") == by)]
            if others:   # re-checked under the lock: someone wrote between the check and now
                raise Refused(f"{wid}: held by another session since the check: {others[0]}\nNothing was changed.")
            cr = "\r" if nl == "\r\n" else ""
            line = mine + (f" (taken over from: {replace[wid][0][len('**Held by:** '):]})" if wid in replace else "")
            kept = [l for l in lines[s + 1:e] if not HELD_ANY.match(l.rstrip("\r"))]
            while kept and not kept[0].strip():
                kept.pop(0)
            lines[s + 1:e] = [cr, line + cr, cr] + kept   # heading, blank, hold, blank, the section as it was
        return lines

    with Lock(path):
        edit(path, put)
    if after_write:
        after_write()   # test-only: a second writer landing between our write and the re-read
    text = read(path)
    backed_off = [wid for wid in todo if len(holds(text, wid)) != 1]
    if backed_off:
        with Lock(path):
            edit(path, lambda lines, nl: strip_lines(lines, backed_off, mine))
        raise Refused(f"{', '.join(backed_off)}: another hold landed beside this one; this session backed off and "
                      f"removed its own line. Message the other holder. Remaining: "
                      + "; ".join(r for w in backed_off for r, _ in holds(read(path), w)))
    for wid in todo:
        report.append(f"{wid}: taken: {mine}")
        if announce:
            report.append(world.comment(wid, f"Held by {by} from {stamp(at)}, worktree `{' + '.join(where)}`. "
                                             f"Written to WORKLIST.md by `Tools/worklist-claim.py` (HK-30)."))
    return report


def strip_lines(lines, ids, exact=None, who=None):
    for wid in ids:
        s, e = section(lines, wid)
        keep = []
        for l in lines[s + 1:e]:
            r = l.rstrip("\r")
            m = HELD.match(r)
            if (exact and r.startswith(exact)) or (who and m and m.group("who") == who):
                continue
            keep.append(l)
        if len(keep) >= 2 and not keep[0].strip() and not keep[1].strip():
            keep = keep[1:]   # the blank line the hold sat between
        lines[s + 1:e] = keep
    return lines


def release(ids, by, world=None, path=None):
    path, world = path or WORKLIST, world or default_world()
    validate(ids, by)
    text = read(path)
    for wid in ids:
        others = [r for r, m in holds(text, wid) if not (m and m.group("who") == by)]
        if others:
            raise Refused(f"{wid} is held by someone else, not released: {others[0]}\nNothing was changed.")
    gone = [wid for wid in ids if holds(text, wid)]
    if not gone:
        return [f"{', '.join(ids)}: not held by {by}; nothing to release"]
    with Lock(path):
        edit(path, lambda lines, nl: strip_lines(lines, gone, who=by))
    return [f"{wid}: released" for wid in gone] + [world.comment(wid, f"Released by {by} at {stamp(world.now())}.")
                                                  for wid in gone]


def check(ids, by=None, mine=(), world=None, path=None, ignore=(), skip_labels=False):
    path, world = path or WORKLIST, world or default_world()
    validate(ids)
    text = read(path)
    found = []
    for wid in ids:
        f, own, _ = conflicts(text, wid, by or "\0", mine, world, skip_labels=skip_labels, ignore=ignore)
        found += f
        if own:
            found.append(f"{wid}: yours: {own}")
    return found


# ---------------------------------------------------------------- self-test

FIXTURE = """# W

## Chunks: x

| Chunk | Title | Rows, in the order to work them | Why these travel together |
|---|---|---|---|
| row-claims | Claims | HK-30 | alone |
| other | Other | HK-3, VLC-144 | together |

## Index — 3 live items

| [HK-3](#hk-3) | ☐ | three | — |

---

### HK-3 — a short id that must not match HK-30

body three

---

### HK-30 — the claimed row

**Filed** 2026-10-02.

1. writes `**Held by:** <session>` as prose, which is not a hold.

---

### VLC-144 — another

body
"""


def self_test():
    import contextlib
    import io
    global WORKLIST
    tmp = tempfile.mkdtemp(prefix="claim-test-")
    path = os.path.join(tmp, "WORKLIST.md")
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(FIXTURE)
    T0 = datetime(2026, 10, 2, 14, 0, tzinfo=timezone.utc)
    clock = {"t": T0}
    trees, labels, said = [], {}, []
    w = World(trees=lambda: list(trees), labels=lambda wid: labels.get(wid),
              comment=lambda wid, body: said.append((wid, body)) or f"{wid}: commented", now=lambda: clock["t"])

    def refused(fn):
        try:
            fn()
        except Refused as e:
            return str(e)
        raise AssertionError("expected a refusal")

    assert check(["HK-30"], world=w, path=path) == [], "the prose mention of Held by is not a hold"
    assert row_token("VLC-144").search("_wt-vlc144-band") and row_token("VLC-144").search("claude/VLC-144-abc")
    assert not row_token("HK-3").search("_wt-hk30-ui"), "HK-3 must not match a tree named for HK-30"
    assert not row_token("VLC-14").search("_wt-vlc144-band")

    r = take(["HK-30"], "Session A", ["C:/source/repos/_wt-hk30-ui"], world=w, path=path)
    text = read(path)
    assert "\r" not in text, "LF endings must stay LF"
    assert len(holds(text, "HK-30")) == 1 and holds(text, "HK-3") == [], holds(text, "HK-30")
    lines = text.split("\n")
    s, _ = section(lines, "HK-30")
    assert lines[s + 1] == "" and lines[s + 2].startswith("**Held by:** Session A · C:/source/repos/_wt-hk30-ui · "
                                                           "2026-10-02T14:00Z") and lines[s + 3] == "", lines[s:s + 5]
    assert said and said[-1][0] == "HK-30" and "Held by Session A" in said[-1][1], said
    assert text.replace(lines[s + 2] + "\n\n", "", 1) == FIXTURE, "a take changes nothing but the one line"

    msg = refused(lambda: take(["HK-30"], "Session B", ["C:/x"], world=w, path=path))
    assert "held by Session A" in msg and "Nothing was changed" in msg, msg
    assert read(path) == text, "a refused take writes nothing"
    n = len(said)
    assert any("already held by you" in x for x in take(["HK-30"], "Session A", ["C:/source/repos/_wt-hk30-ui"],
                                                        world=w, path=path))
    assert read(path) == text and len(said) == n, "re-taking your own hold as it stands changes nothing"
    assert any("moving the hold" in x for x in take(["HK-30"], "Session A", ["C:/y"], world=w, path=path, announce=False))
    h = holds(read(path), "HK-30")
    assert len(h) == 1 and h[0][1].group("where") == "C:/y" and len(said) == n, (h, said[n:])
    take(["HK-30"], "Session A", ["C:/source/repos/_wt-hk30-ui"], world=w, path=path)
    assert read(path) == text

    # all-or-nothing: HK-3 is free, HK-30 is not, so neither is taken
    refused(lambda: take(["HK-3", "HK-30"], "Session B", ["C:/x"], world=w, path=path))
    assert holds(read(path), "HK-3") == []

    # worktrees: path or branch, with or without the dash, or the chunk slug; your own is not a conflict
    trees[:] = [("RapidReconciler-Valc", "C:/source/repos/_wt-vlc144-band", "claude/vlc144-broker-cell")]
    assert any("a worktree names it" in x for x in check(["VLC-144"], world=w, path=path))
    assert check(["VLC-144"], mine=["C:\\source\\repos\\_wt-vlc144-band"], world=w, path=path) == []
    assert check(["VLC-144"], world=w, path=path, ignore=["C:/source/repos/_wt-vlc144-band"]) == []
    trees[:] = [("RapidReconciler-Valc", "C:/source/repos/_wt-band", "claude/vlc-144-cell")]
    assert any("a worktree names it" in x for x in check(["VLC-144"], world=w, path=path)), "a branch alone names it"
    trees[:] = [("RapidReconciler-Valc", "C:/source/repos/_claude-worktrees/row-claims-202610021400-Valc",
                 "claude/chunk-row-claims-202610021400")]
    assert any("worktree names it" in x for x in check(["HK-30"], world=w, path=path)), "the runner's slug-named tree"
    trees[:] = []
    # 2026-10-02: only the PATH named VLC-137; neither branch did, which is why both are searched
    assert row_token("VLC-137").search("_wt-vlc137-valc") and not row_token("VLC-137").search("claude/sqlcreds-d1ebe24")

    # the dev-box runner's labels, and a label read that failed
    labels["HK-3"] = ["worklist", "claude:running"]
    assert any("dev-box runner has it" in x for x in check(["HK-3"], world=w, path=path))
    assert take(["HK-3"], "runner", ["C:/r"], world=w, path=path, skip_labels=True), "the runner skips its own label"
    release(["HK-3"], "runner", world=w, path=path)

    def boom(wid):
        raise RuntimeError("HTTP 502")
    w2 = World(trees=lambda: [], labels=boom, comment=w.comment, now=w.now)
    assert "could not read its issue's labels" in refused(lambda: take(["HK-3"], "B", ["C:/x"], world=w2, path=path))
    labels.clear()

    # --over: refused while fresh, refused while the holder's worktree exists, allowed after a day with it gone
    assert "held by Session A" in refused(lambda: take(["HK-30"], "Session B", ["C:/x"], world=w, path=path, over=True))
    clock["t"] = T0 + timedelta(hours=25)
    trees[:] = [("RapidReconciler-AI", "C:/source/repos/_wt-hk30-ui", "claude/hk30-4fd91ff")]
    refused(lambda: take(["HK-30"], "Session B", ["C:/x"], world=w, path=path, over=True, ignore=["C:/source/repos/_wt-hk30-ui"]))
    trees[:] = []
    out = take(["HK-30"], "Session B", ["C:/x"], world=w, path=path, over=True)
    h = holds(read(path), "HK-30")
    assert len(h) == 1 and h[0][1].group("who") == "Session B" and "taken over from: Session A" in h[0][0], (out, h)

    # release: only the holder's own line
    assert "held by someone else" in refused(lambda: release(["HK-30"], "Session A", world=w, path=path))
    release(["HK-30"], "Session B", world=w, path=path)
    assert read(path) == FIXTURE, "release restores the section exactly"

    # a malformed line counts as held
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(FIXTURE.replace("### HK-3 — a short id that must not match HK-30\n",
                                "### HK-3 — a short id that must not match HK-30\n\n**Held by:** somebody, no time\n"))
    assert "malformed" in refused(lambda: take(["HK-3"], "B", ["C:/x"], world=w, path=path))

    # an Edit-tool writer landing between our write and the re-read: we back off and remove only ours
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(FIXTURE)
    def edit_tool_writer():
        t = read(path).replace("### VLC-144 — another\n", "### VLC-144 — another\n\n**Held by:** Edit tool · C:/e · "
                               "2026-10-03T14:00Z\n")
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(t)
    msg = refused(lambda: take(["VLC-144"], "Session C", ["C:/c"], world=w, path=path, after_write=edit_tool_writer))
    h = holds(read(path), "VLC-144")
    assert "backed off" in msg and len(h) == 1 and h[0][1].group("who") == "Edit tool", (msg, h)

    # CRLF stays CRLF
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(FIXTURE.replace("\n", "\r\n"))
    take(["HK-30"], "Session A", ["C:/a"], world=w, path=path)
    t = read(path)
    assert t.count("\r\n") == t.count("\n"), "CRLF endings must stay CRLF"
    release(["HK-30"], "Session A", world=w, path=path)
    assert read(path) == FIXTURE.replace("\n", "\r\n")

    # bad input and a missing section
    assert "expected exactly one" in refused(lambda: take(["HK-99"], "A", ["C:/a"], world=w, path=path))
    for bad in (lambda: take(["hk-30"], "A", ["C:/a"], world=w, path=path),
                lambda: take(["HK-30"], "A · B", ["C:/a"], world=w, path=path)):
        try:
            bad()
            raise AssertionError("bad input accepted")
        except ValueError:
            pass

    # a real race: two processes take the same row at once; the lock lets exactly one win
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(FIXTURE)
    env = dict(os.environ, RR_CLAIM_TEST_FILE=path, RR_CLAIM_TEST_DELAY="0.6")
    procs = [subprocess.Popen([sys.executable, os.path.abspath(__file__), "take", "HK-30", "--by", f"Racer {k}",
                               "--where", f"C:/race{k}"], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              text=True) for k in (1, 2)]
    codes = [p.wait(timeout=60) for p in procs]
    outs = [p.stdout.read() for p in procs]
    assert sorted(codes) == [0, 3], f"exactly one racer wins: {codes} {outs}"
    assert len(holds(read(path), "HK-30")) == 1, read(path)

    shutil.rmtree(tmp, ignore_errors=True)
    print("self-test OK")


# ---------------------------------------------------------------- CLI

def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("action", nargs="?", choices=["check", "take", "release"])
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--by", help="your session name, as ListAgents gives it")
    ap.add_argument("--where", action="append", default=[], help="your worktree; repeat for several")
    ap.add_argument("--over", action="store_true", help="take over a hold older than a day whose worktree is gone")
    ap.add_argument("--ignore-tree", action="append", default=[], help="a worktree that names the row but is not about it")
    a = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # the hold line's '·' on a cp1252 pipe
    if a.self_test:
        return self_test()
    if not a.action or not a.ids:
        ap.error("give an action and at least one row ID")
    try:
        if a.action == "check":
            found = check(a.ids, by=a.by, mine=a.where, ignore=a.ignore_tree)
            for f in found:
                print(f)
            blocking = [f for f in found if ": yours: " not in f]
            print("HELD: do not start; message the holder" if blocking else
                  "held by you" if found else "free: nobody holds " + ", ".join(a.ids))
            return 3 if blocking else 0
        if not a.by:
            ap.error("--by is required")
        if a.action == "take":
            if not a.where:
                ap.error("--where is required: the worktree you will build in")
            for line in take(a.ids, a.by, a.where, over=a.over, ignore=a.ignore_tree):
                print(line)
        else:
            for line in release(a.ids, a.by):
                print(line)
        return 0
    except Refused as e:
        print("REFUSED: " + str(e))
        return 3
    except ValueError as e:
        print("BAD INPUT: " + str(e))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
