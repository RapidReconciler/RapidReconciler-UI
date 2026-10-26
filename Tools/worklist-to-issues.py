"""Copy the LIVE rows of WORKLIST.md into GitHub Issues (owner request, 2026-09-30).

Each index row that has a live-status table cell becomes one issue in the PRIVATE repo of its
build target, carrying the row's status, its "Need from you", and the row's whole section.
WORKLIST.md stays the source of truth until the owner rules otherwise; this is a copy.

Safety, all enforced before anything is sent:
  * PRIVATE repos only. The UI repo is public, so a UI- row's issue lives in RapidReconciler-Valc,
    beside housekeeping (owner, 2026-10-21: "the ui issues should be filed with the others"), and
    PUBLIC_REPOS refuses any mapping that would post a section to a public repo.
  * A secret-shaped string (password/secret/token/key followed by a value) stops that row.
  * Idempotent: an issue whose title starts "[ID]" already open or closed is updated, not
    duplicated. The ID -> issue map is written beside WORKLIST.md (worklist-issues.json).
  * Chunks: WORKLIST.md's "## Chunks" table puts every live row in exactly one chunk, in work
    order. Each issue gets a `chunk:<slug>` label and a "**Chunk:**" body line that VALC's
    Development page and Tools/claude-issue-runner.py read back. Nothing is posted if a live row
    is in no chunk or in two, or a chunk names a row that is not live.
  * Closing (owner request, 2026-10-01): an open `worklist` issue whose row is no longer live is
    closed ONLY when WORKLIST-DONE.md records that ID as closed. One that is neither live nor done
    is printed as a WARN and left open (a row deleted or renamed without being finished). An
    `investigation` issue is never closed. --dry-run prints what would close and closes nothing.
  * Closed in VALC (VLC-207, owner ruling 2026-10-26: "All issue management needs to be done in valc and
    synced to github. I would rather have a close button in valc."). FIRST, before anything else is read
    or posted: a live row whose issue is CLOSED and carries `closed-in-valc` (VALC's Close button) has its
    section moved to WORKLIST-DONE.md by Tools/worklist-close.py, quoting VALC's close comment as the
    reason, and the run then works from the updated file. A live row whose issue was closed WITHOUT that
    label (closed on GitHub directly) is a WARN: the row stays live and the issue is never reopened.
    --dry-run reports both and moves nothing.
  * Run by the Stop hook (HK-47, owner 2026-10-26: "We also need to do a better job of keeping the worklist
    synced with github"). Tools/worklist-sync-hook.py runs this at the end of any turn that changed the
    worklist, so a live run is now routine and has to be quick and safe to overlap:
      - LOCK: one live run at a time across every session (worklist-sync.lock beside the map). A run that
        finds a live holder exits 3 and changes nothing; a dead or 20-minute-old holder is taken over.
      - Each issue is read once per run (the VALC-close pass and the update pass used to read every one twice),
        and an issue whose title, body and labels already match is left alone instead of re-edited.
      - STATE: a successful live run writes worklist-sync-state.json (when, the two files' fingerprint, counts).
        The hook compares that fingerprint to decide whether a turn changed anything.
      - VERIFY: the run ends by listing the open worklist issues and comparing their IDs with the rows it
        posted. A difference exits 4 and names the IDs, so "synced" is a measurement, not the script's say-so.

Usage:  python Tools/worklist-to-issues.py [--dry-run]
        python Tools/worklist-to-issues.py --self-test
Exit:   0 synced (or dry run); 3 another live run holds the lock; 4 GitHub disagrees after the run; 1 anything else
"""
import contextlib
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

WORKSPACE = r"C:\source\repos"
WORKLIST = os.path.join(WORKSPACE, "WORKLIST.md")
DONE = os.path.join(WORKSPACE, "WORKLIST-DONE.md")
MAP_FILE = os.path.join(WORKSPACE, "worklist-issues.json")
LOCK_FILE = os.path.join(WORKSPACE, "worklist-sync.lock")
STATE_FILE = os.path.join(WORKSPACE, "worklist-sync-state.json")
LOCK_STALE_S = 20 * 60
GH = r"C:\Program Files\GitHub CLI\gh.exe"
OWNER = "RapidReconciler"

# Build target (ID prefix) -> private repo. Housekeeping lives with VALC, where most of it lands.
# UI rows live there too: the UI repo is public, and VALC's Development page reads Valc's issues,
# so until 2026-10-21 every UI- row was refused and a third of the live work never showed there.
REPO_FOR = {"DAC": "RapidReconciler-DB", "ISP": "RapidReconciler-SSIS", "VLC": "RapidReconciler-Valc",
            "HK": "RapidReconciler-Valc", "UI": "RapidReconciler-Valc"}
TARGET_LABEL = {"DAC": "target:dacpac", "ISP": "target:ispac", "VLC": "target:valc", "HK": "housekeeping",
                "UI": "target:ui"}
# A worklist section is internal (customer measurements, owner rulings). Never post one to a public
# repo, whatever REPO_FOR says: checked per row before anything is sent, and by --self-test.
PUBLIC_REPOS = {"RapidReconciler-UI"}
STATUS_LABEL = {"\u2610": "status:open", "\u25d0": "status:in-progress", "\u23f8": "status:blocked"}   # ☐ ◐
LABELS = {
    "worklist": ("1f2d4a", "Copied from WORKLIST.md"),
    "target:dacpac": ("0e8a7d", "RapidReconciler-DB build target"),
    "target:ispac": ("0e8a7d", "RapidReconciler-SSIS build target"),
    "target:valc": ("0e8a7d", "RapidReconciler-Valc build target"),
    "target:ui": ("0e8a7d", "RapidReconciler-UI build target (filed here: the UI repo is public)"),
    "housekeeping": ("c5def5", "Housekeeping"),
    "status:open": ("ededed", "Not started"),
    "status:in-progress": ("fbca04", "Built or partly built, not closed"),
    "status:blocked": ("b60205", "Blocked on something outside the code"),
    "needs-owner": ("d93f0b", "Waiting on an owner decision or action"),
    "investigation": ("1d76db", "Filed from a VALC Troubleshooting investigation"),
    "claude:queued": ("5319e7", "Submitted to Claude Code from VALC; waiting for the dev-box runner"),
    "claude:running": ("5319e7", "A Claude Code session is working on this"),
    "claude:done": ("0e8a16", "Claude Code finished; its report is in the comments"),
    "claude:failed": ("b60205", "Claude Code could not finish; see the comments"),
}
ROW = re.compile(r"^\|\s*\[(?P<id>[A-Z]+-\d+)\]\(#(?P<anchor>[^)]+)\)\s*\|\s*(?P<status>[^|]*?)\s*\|\s*(?P<what>.*?)\s*\|\s*(?P<need>[^|]*?)\s*\|\s*$")
SECRET = re.compile(r"(?i)\b(password|passwd|secret|token|api[_-]?key|pwd)\b\s*[:=]\s*['\"]?(?!\*|<|\$\{|x{3})[^\s'\"|]{8,}")
BODY_CAP = 60000


def parse(text):
    rows = []
    for line in text.splitlines():
        m = ROW.match(line)
        if m and m.group("status").strip()[:1] in STATUS_LABEL:
            rows.append(m.groupdict())
    sections = {}
    parts = re.split(r"(?m)^### ", text)
    for p in parts[1:]:
        head, _, body = p.partition("\n")
        m = re.match(r"([A-Z]+-\d+)\s+\u2014\s+(.*)", head.strip())
        if not m:
            continue
        body = re.split(r"(?m)^---\s*$", body)[0]
        sections[m.group(1)] = (m.group(2).strip(), body.strip())
    return rows, sections


CHUNK_ROW = re.compile(r"^\|\s*(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\s*\|\s*(?P<title>[^|]+?)\s*\|\s*(?P<rows>[^|]+?)\s*\|\s*(?P<why>[^|]*?)\s*\|\s*$")
# Read back by VALC (DevelopmentService.CHUNK_LINE) and the runner: keep the three in step.
CHUNK_LINE = "**Chunk:** {title} · `{slug}` · step {k} of {n}: {order}"


def parse_chunks(text):
    """[{slug, title, rows: [ID, ...], why}] from the '## Chunks' table, in file order."""
    m = re.search(r"(?ms)^## Chunks\b.*?(?=^## )", text)
    if not m:
        return []
    out = []
    for line in m.group(0).splitlines():
        c = CHUNK_ROW.match(line)
        if c and c.group("slug") != "chunk":
            out.append({"slug": c.group("slug"), "title": c.group("title").strip(),
                        "rows": re.findall(r"\b[A-Z]+-\d+\b", c.group("rows")), "why": c.group("why").strip()})
    return out


def chunk_errors(live_ids, chunks):
    """Every reason the grouping cannot be posted. An empty list is the only green."""
    errs, seen, slugs = [], {}, set()
    if not chunks:
        return ["WORKLIST.md has no '## Chunks' table (or it did not parse); every live row needs a chunk"]
    for c in chunks:
        if c["slug"] in slugs:
            errs.append(f"chunk {c['slug']} is listed twice")
        slugs.add(c["slug"])
        if not c["rows"]:
            errs.append(f"chunk {c['slug']} names no rows")
        for r in c["rows"]:
            if r in seen:
                errs.append(f"{r} is in two chunks ({seen[r]} and {c['slug']})")
            seen[r] = c["slug"]
            if r not in live_ids:
                errs.append(f"chunk {c['slug']} names {r}, which is not a live row")
    for r in live_ids:
        if r not in seen:
            errs.append(f"{r} is live but in no chunk")
    return errs


def chunk_line(chunk, wid):
    return CHUNK_LINE.format(title=chunk["title"], slug=chunk["slug"], k=chunk["rows"].index(wid) + 1,
                             n=len(chunk["rows"]), order=", ".join(chunk["rows"]))


def gh(args, input_text=None):
    r = subprocess.run([GH] + args, capture_output=True, text=True, encoding="utf-8", input=input_text)
    if r.returncode != 0:
        raise RuntimeError(" ".join(args[:3]) + ": " + (r.stderr or r.stdout).strip())
    return r.stdout


def chunk_labels(chunks):
    # GitHub caps a label description at 100 characters.
    return {f"chunk:{c['slug']}": ("bfd4f2", ("Chunk: " + c["title"])[:100]) for c in chunks}


def repo_labels(repo):
    """Every label name in repo, all pages. Valc passed 100 labels on 2026-10-22; reading page 1 only made a
    label on page 2 look missing, and its create failed the whole sync with HTTP 422."""
    out, page = set(), 1
    while True:
        q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/labels?per_page=100&page={page}"]))
        out |= {l["name"] for l in q}
        if len(q) < 100:
            return out
        page += 1


def ensure_labels(repo, dry, extra=None, have=None, post=None):
    have = repo_labels(repo) if have is None else have
    post = post or (lambda args: gh(args))
    for name, (color, desc) in {**LABELS, **(extra or {})}.items():
        if name in have:
            continue
        print(f"  label {repo}: create {name}")
        if not dry:
            try:
                post(["api", "-X", "POST", f"repos/{OWNER}/{repo}/labels", "-f", f"name={name}", "-f", f"color={color}",
                      "-f", f"description={desc}"])
            except RuntimeError as e:
                # 422 = it exists after all (a short label list): the goal is met, so it is not a failure.
                if "422" not in str(e):
                    raise
                print(f"  label {repo}: {name} already exists")


def worklist_issues(repo):
    """Every issue labelled worklist in repo, open AND closed, all pages."""
    out, page = [], 1
    while True:
        q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues?state=all&labels=worklist&per_page=100&page={page}"]))
        out += [i for i in q if "pull_request" not in i]
        if len(q) < 100:
            return out
        page += 1


def get_issue(repo, num):
    """One issue by number, or None when GitHub answers 404. Any other failure is raised."""
    try:
        return json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues/{num}"]))
    except RuntimeError as e:
        if "404" in str(e) or "Not Found" in str(e):
            return None
        raise


def short_listing(listing, mapping, repo, get=get_issue):
    """Mapped worklist issues in repo that exist (read directly) but the listing left out.

    Measured 2026-10-22: GitHub's issue list answered the same query with 0, then 84, then 0 within a
    minute, while each issue read directly by number every time. existing() used to read one page of
    that list per row and created an issue for every [ID] it did not see, so a short answer would have
    opened duplicates of ~37 live rows. The map is the control: an issue it names that GitHub confirms
    exists, still labelled worklist, must be in the listing. One deleted or unlabelled since is not."""
    have = {i["number"] for i in listing}
    out = []
    for e in mapping.values():
        if e.get("repo") != repo or e["number"] in have:
            continue
        i = get(repo, e["number"])
        if i and "pull_request" not in i and any(l["name"] == "worklist" for l in i.get("labels", [])):
            out.append(e["number"])
    return sorted(out)


def existing(repo, wid, mapping, listing, get=get_issue):
    """(number, current label names, the issue) of the issue titled "[ID] ...", or (None, [], None).

    The map first, read by number (the direct read is the reliable one); the full listing only for a row
    the map does not name. A mapped number whose issue is gone or renamed falls through to the listing."""
    e = mapping.get(wid)
    if e and e.get("repo") == repo:
        i = get(repo, e["number"])
        if i and "pull_request" not in i and i["title"].startswith(f"[{wid}]"):
            return i["number"], [l["name"] for l in i.get("labels", [])], i
    for i in listing:
        if i["title"].startswith(f"[{wid}]"):
            return i["number"], [l["name"] for l in i.get("labels", [])], i
    return None, [], None


def cached(get):
    """get_issue, read at most once per (repo, number) for this run (HK-47). Before it, every mapped issue
    was read twice: once by the VALC-close pass and once by existing()."""
    seen = {}

    def read(repo, num):
        if (repo, num) not in seen:
            seen[(repo, num)] = get(repo, num)
        return seen[(repo, num)]
    return read


def _norm(s):
    return (s or "").replace("\r\n", "\n").strip()


def unchanged(issue, title, body, labels, stale):
    """True when the issue already says exactly what this run would write (HK-47): same title, same body,
    every wanted label present and none to remove. Then it is left alone instead of re-edited."""
    if not issue or stale:
        return False
    have = {l["name"] for l in issue.get("labels", [])}
    return issue.get("title") == title and _norm(issue.get("body")) == _norm(body) and set(labels) <= have


def fingerprint(paths=None):
    """sha256 over the worklist files' bytes: what the Stop hook compares to decide a turn changed them."""
    h = hashlib.sha256()
    for p in paths or (WORKLIST, DONE):
        with open(p, "rb") as f:
            h.update(f.read())
        h.update(b"\0")
    return h.hexdigest()


def pid_alive(pid):
    """Whether a process with this id is running. Never os.kill(pid, 0) on Windows: there it TERMINATES
    the process (signal 0 is passed to TerminateProcess as the exit code)."""
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        k = ctypes.windll.kernel32
        h = k.OpenProcess(0x1000, False, pid)          # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        try:
            code = ctypes.c_ulong()
            return bool(k.GetExitCodeProcess(h, ctypes.byref(code))) and code.value == 259   # STILL_ACTIVE
        finally:
            k.CloseHandle(h)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


class Locked(Exception):
    pass


def take_lock(path=None, now=None, alive=None):
    """Create the lock file atomically. A holder that is alive and under LOCK_STALE_S old raises Locked;
    a dead or stale one is replaced (and said)."""
    path, now, alive = path or LOCK_FILE, now or time.time(), alive or pid_alive
    for _ in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"pid": os.getpid(), "started": now}, f)
            return
        except FileExistsError:
            try:
                held = json.load(open(path, encoding="utf-8"))
            except (OSError, ValueError):
                held = {}
            pid, started = int(held.get("pid") or 0), float(held.get("started") or 0)
            if alive(pid) and now - started < LOCK_STALE_S:
                raise Locked(f"another live sync holds {path} (pid {pid}, {int(now - started)} s ago); nothing was done")
            print(f"  lock: taking over a {'stale' if alive(pid) else 'dead'} lock (pid {pid})")
            with contextlib.suppress(OSError):
                os.remove(path)
    raise Locked(f"could not take {path}")


def drop_lock(path=None):
    path = path or LOCK_FILE
    with contextlib.suppress(OSError, ValueError):
        if int(json.load(open(path, encoding="utf-8")).get("pid") or 0) == os.getpid():
            os.remove(path)


def open_ids(fetch=None):
    """{ID: (repo, number)} of every OPEN worklist issue (not investigations) in every repo the copier posts to."""
    fetch = fetch or open_worklist_issues
    out = {}
    for repo in sorted(set(REPO_FOR.values())):
        for i in fetch(repo):
            m = ISSUE_ID.match(i["title"])
            if m and "investigation" not in [l["name"] for l in i.get("labels", [])]:
                out[m.group("id")] = (repo, i["number"])
    return out


def verify(posted, fetch=None, wait=5):
    """HK-47: GitHub's open worklist issues must be exactly the rows this run posted. The listing has come
    back short before (2026-10-22), so a disagreement is re-read once before it counts. Returns problems."""
    for attempt in range(2):
        have = open_ids(fetch)
        extra, missing = sorted(set(have) - set(posted)), sorted(set(posted) - set(have))
        if not extra and not missing:
            return []
        if attempt == 0 and wait:
            time.sleep(wait)
    out = []
    if missing:
        out.append("live rows with NO open issue: " + ", ".join(missing))
    if extra:
        out.append("open issues with NO live row: " + ", ".join(f"{w} ({have[w][0]} #{have[w][1]})" for w in extra))
    return out


def stale_labels(current, wanted):
    """Copier-owned labels the issue carries but the row no longer earns (an old status, a resolved
    needs-owner, a chunk it moved out of). claude:* and any label a person added are never touched."""
    owned = set(STATUS_LABEL.values()) | {"needs-owner"}
    return [l for l in current if (l in owned or l.startswith("chunk:")) and l not in wanted]


ISSUE_ID = re.compile(r"^\[(?P<id>[A-Z]+-\d+)\]")
CLOSE_NOTE = ("Closed by `Tools/worklist-to-issues.py`: {wid} is no longer a live row in `WORKLIST.md`; its section "
              "moved to `WORKLIST-DONE.md`.")


def done_ids(text):
    """IDs WORKLIST-DONE.md records as closed. Two schemas live there: a '### ID ...' section (since the
    2026-08-28 split) and a '| **ID** |' table row (before it). Both count: the file's header says every
    row in it is closed, and WORKLIST.md says IDs are never reused, so an old row cannot name a newer item."""
    return (set(re.findall(r"(?m)^###\s+([A-Z]+-\d+)\b", text))
            | set(re.findall(r"(?m)^\|\s*\*\*([A-Z]+-\d+)\*\*\s*\|", text)))


def open_worklist_issues(repo):
    """Every open issue labelled worklist in repo, all pages (a short first page is not the whole list)."""
    out, page = [], 1
    while True:
        q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues?state=open&labels=worklist&per_page=100&page={page}"]))
        out += [i for i in q if "pull_request" not in i]
        if len(q) < 100:
            return out
        page += 1


def to_close(issues, live_ids, done):
    """(close, warn): open copier issues whose "[ID]" row left WORKLIST.md, split by whether DONE records
    the ID. A live row, an investigation, and a title with no "[ID]" are in neither list."""
    close, warn = [], []
    for i in issues:
        labels = [l["name"] for l in i.get("labels", [])]
        m = ISSUE_ID.match(i["title"])
        if "investigation" in labels or "worklist" not in labels or not m or m.group("id") in live_ids:
            continue
        (close if m.group("id") in done else warn).append((i, m.group("id")))
    return close, warn


def close_finished(live_ids, indexed, done, dry, fetch=open_worklist_issues, run=gh):
    """Close each open copier issue whose row moved to WORKLIST-DONE.md; WARN on one that is neither live
    nor done. Sweeps every repo the copier posts to, including one with no live row left."""
    closed, warned = [], []
    for repo in sorted(set(REPO_FOR.values())):
        close, warn = to_close(fetch(repo), live_ids, done)
        for i, wid in warn:
            where = "its index line is still in WORKLIST.md but not live" if wid in indexed else "deleted or renamed?"
            print(f"  WARN {wid:8} {repo} #{i['number']} is open, not live, and not in WORKLIST-DONE.md "
                  f"({where}); NOT closed")
            warned.append(wid)
        for i, wid in close:
            print(f"  {wid:8} -> {repo:24} close #{i['number']}  (moved to WORKLIST-DONE.md)")
            if not dry:
                run(["issue", "close", str(i["number"]), "-R", f"{OWNER}/{repo}", "--reason", "completed",
                     "--comment", CLOSE_NOTE.format(wid=wid)])
            closed.append(wid)
    return closed, warned


CLOSED_IN_VALC = "closed-in-valc"          # DevelopmentService.CLOSED_IN_VALC (Valc repo); keep the two in step
CLOSED_IN_VALC_LEAD = "**Closed in VALC**"  # DevelopmentService.CLOSED_IN_VALC_LEAD
CLOSE_TOOL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "worklist-close.py")


def close_comment(repo, num):
    """The newest VALC close comment on an issue, as one line, or None."""
    q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues/{num}/comments?per_page=100"]))
    hits = [c.get("body", "") for c in q if c.get("body", "").startswith(CLOSED_IN_VALC_LEAD)]
    return hits[-1].splitlines()[0].replace("**", "").strip() if hits else None


def valc_closes(rows, mapping, get=get_issue):
    """(close, warn) for live rows whose MAPPED issue is closed: close = it carries closed-in-valc (VALC's
    Close button), warn = closed some other way. Read by number, the reliable read; a row with no mapped
    issue, or a map entry now pointing at another row's issue, is neither."""
    close, warn = [], []
    for row in rows:
        e = mapping.get(row["id"])
        if not e:
            continue
        i = get(e["repo"], e["number"])
        if not i or "pull_request" in i or not i.get("title", "").startswith(f"[{row['id']}]") or i.get("state") != "closed":
            continue
        labels = [l["name"] for l in i.get("labels", [])]
        (close if CLOSED_IN_VALC in labels else warn).append((row["id"], e["repo"], e["number"]))
    return close, warn


def apply_valc_closes(rows, mapping, dry, get=get_issue, comment=close_comment, run=None):
    """Move each VALC-closed live row to WORKLIST-DONE.md (worklist-close.py), WARN on the others. Returns
    the IDs moved (or that would be, on --dry-run)."""
    close, warn = valc_closes(rows, mapping, get)
    for wid, repo, num in warn:
        print(f"  WARN {wid:8} {repo} #{num} is CLOSED on GitHub but not from VALC (no {CLOSED_IN_VALC} label): the row "
              "stays live and the issue is NOT reopened. Close it from VALC's Development page, or reopen it.")
    moved = []
    for wid, repo, num in close:
        why = comment(repo, num) or f"Closed in VALC ({repo} #{num}; no close comment found)"
        reason = f"DONE: {why} (VLC-207: closed from VALC's Development page, {repo} #{num})"
        print(f"  {wid:8} <- {repo:24} #{num} closed in VALC: row {'would move' if dry else 'moves'} to WORKLIST-DONE.md ({why})")
        if not dry:
            (run or (lambda args: subprocess.run(args, check=True)))([sys.executable, CLOSE_TOOL, wid, reason])
        moved.append(wid)
    return moved


def build(row, section, chunk):
    wid = row["id"]
    title_text = section[0] if section else re.sub(r"\*\*|`", "", row["what"])[:120]
    title = f"[{wid}] {title_text}"[:250]
    body = [chunk_line(chunk, wid), "",
            f"**Status:** {row['status'].strip()} &middot; **Need from you:** {row['need'].strip() or '—'}", "",
            f"**Index line:** {row['what'].strip()}", ""]
    if section:
        body += ["---", "", section[1]]
    else:
        body += ["_No section found in WORKLIST.md for this row._"]
    body += ["", "---", f"_Copied from `WORKLIST.md` (`#{row['anchor']}`) on 2026-09-30. WORKLIST.md remains the "
             "source of truth until the owner rules otherwise; edit there and re-run `Tools/worklist-to-issues.py`._"]
    text = "\n".join(body)
    if len(text) > BODY_CAP:
        text = text[:BODY_CAP] + "\n\n_[Cut at 60,000 characters; the full section is in WORKLIST.md.]_"
    labels = ["worklist", TARGET_LABEL[wid.split("-")[0]], STATUS_LABEL[row["status"].strip()[:1]], f"chunk:{chunk['slug']}"]
    need = row["need"].strip()
    if need and need not in ("—", "-", "&mdash;"):
        labels.append("needs-owner")
    return title, text, labels


def main(dry):
    """A live run holds the lock for its whole length (HK-47); a dry run reads only and takes none."""
    if dry:
        return sync(True)
    try:
        take_lock()
    except Locked as e:
        print(f"LOCKED: {e}")
        return 3
    try:
        return sync(False)
    finally:
        drop_lock()


def write_state(state, path=None):
    path = path or STATE_FILE
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(path + ".tmp", path)


def sync(dry):
    start_fp = None if dry else fingerprint()
    get = cached(get_issue)
    text = open(WORKLIST, encoding="utf-8").read()
    rows, sections = parse(text)
    if not rows:
        raise SystemExit("no live rows parsed: the index format changed, refusing to report zero")
    # VLC-207: the owner's VALC closes come first, so everything below works from the file they leave.
    mapping0 = json.load(open(MAP_FILE, encoding="utf-8")) if os.path.exists(MAP_FILE) else {}
    moved = apply_valc_closes(rows, mapping0, dry, get=get)
    print(f"VALC close pass: {len(moved)} row(s) {'would move' if dry else 'moved'} to WORKLIST-DONE.md")
    if moved and not dry:
        text = open(WORKLIST, encoding="utf-8").read()
        rows, sections = parse(text)
    elif moved:
        rows = [r for r in rows if r["id"] not in moved]   # dry run: post as if they had moved
    chunks = parse_chunks(text)
    if moved and dry:
        chunks = [dict(c, rows=[r for r in c["rows"] if r not in moved]) for c in chunks]
        chunks = [c for c in chunks if c["rows"]]
    print(f"live rows: {len(rows)}; sections: {len(sections)}; chunks: {len(chunks)}")
    errs = chunk_errors([r["id"] for r in rows], chunks)
    if errs:
        raise SystemExit("the Chunks table in WORKLIST.md does not cover the live rows; nothing was posted:\n  "
                         + "\n  ".join(errs))
    # Read DONE before anything is posted, so a format change stops the run instead of half of it.
    done = done_ids(open(DONE, encoding="utf-8").read())
    if not done:
        raise SystemExit("no closed IDs parsed from WORKLIST-DONE.md: the format changed, refusing to judge what finished")
    indexed = {m.group("id") for m in map(ROW.match, text.splitlines()) if m}
    chunk_of = {r: c for c in chunks for r in c["rows"]}
    mapping = json.load(open(MAP_FILE, encoding="utf-8")) if os.path.exists(MAP_FILE) else {}
    repos = sorted({REPO_FOR[r["id"].split("-")[0]] for r in rows if r["id"].split("-")[0] in REPO_FOR})
    # Read every repo's issue list ONCE, and prove it whole against the map, before anything is posted:
    # a short list would turn rows that have an issue into new duplicates.
    listings = {}
    for repo in repos:
        listings[repo] = worklist_issues(repo)
        missing = short_listing(listings[repo], mapping, repo, get)
        if missing:
            raise SystemExit(f"GitHub's issue list for {repo} came back short: it left out {len(missing)} worklist "
                             f"issue(s) that exist ({', '.join('#' + str(n) for n in missing[:10])}). Nothing was "
                             "posted; run it again in a few minutes.")
        print(f"  listed {repo}: {len(listings[repo])} worklist issues, every mapped one present")
    for repo in repos:
        # Only the chunks that have a row in this repo; a chunk spanning repos gets its label in each.
        here = [c for c in chunks if any(REPO_FOR.get(r.split("-")[0]) == repo for r in c["rows"])]
        ensure_labels(repo, dry, chunk_labels(here))
    posted, counts = [], {"created": 0, "updated": 0, "unchanged": 0}
    for row in rows:
        prefix = row["id"].split("-")[0]
        if prefix not in REPO_FOR:
            print(f"  REFUSED {row['id']}: no PRIVATE repo for prefix {prefix}")
            continue
        repo = REPO_FOR[prefix]
        if repo in PUBLIC_REPOS:
            print(f"  REFUSED {row['id']}: {repo} is public; a worklist section is never posted there")
            continue
        title, body, labels = build(row, sections.get(row["id"]), chunk_of[row["id"]])
        if SECRET.search(body):
            print(f"  REFUSED {row['id']}: a secret-shaped string is in its section; not posted")
            continue
        num, current, issue = existing(repo, row["id"], mapping, listings[repo], get)
        stale = stale_labels(current, labels)
        posted.append(row["id"])
        if num and unchanged(issue, title, body, labels, stale):
            counts["unchanged"] += 1
            mapping[row["id"]] = {"repo": repo, "number": num, "url": f"https://github.com/{OWNER}/{repo}/issues/{num}"}
            continue
        action = f"update #{num}" if num else "create"
        counts["updated" if num else "created"] += 1
        print(f"  {row['id']:8} -> {repo:24} {action:12} {labels}" + (f"  (remove {stale})" if stale else ""))
        if dry:
            continue
        if num:
            args = ["issue", "edit", str(num), "-R", f"{OWNER}/{repo}", "--title", title, "--body-file", "-",
                    "--add-label", ",".join(labels)]
            if stale:
                args += ["--remove-label", ",".join(stale)]
            gh(args, input_text=body)
        else:
            out = gh(["issue", "create", "-R", f"{OWNER}/{repo}", "--title", title, "--body-file", "-",
                      "--label", ",".join(labels)], input_text=body)
            num = int(out.strip().rstrip("/").split("/")[-1])
        mapping[row["id"]] = {"repo": repo, "number": num, "url": f"https://github.com/{OWNER}/{repo}/issues/{num}"}
    print(f"close pass: {len(done)} IDs closed in WORKLIST-DONE.md")
    closed, warned = close_finished({r["id"] for r in rows}, indexed, done, dry)
    print(f"close pass: {len(closed)} {'to close' if dry else 'closed'}, {len(warned)} warned (left open)")
    print(f"issues: {counts['created']} {'to create' if dry else 'created'}, {counts['updated']} "
          f"{'to update' if dry else 'updated'}, {counts['unchanged']} unchanged")
    if dry:
        return 0
    with open(MAP_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2)
    os.replace(MAP_FILE + ".tmp", MAP_FILE)
    print(f"map written: {MAP_FILE} ({len(mapping)} entries)")
    problems = verify(posted)
    if problems:
        print("VERIFY FAILED: GitHub disagrees with the worklist after this run:\n  " + "\n  ".join(problems))
        return 4
    print(f"verify: {len(posted)} open worklist issues on GitHub = the {len(posted)} live rows posted")
    end_fp = fingerprint()
    # Another session edited the files while this ran (and this run moved nothing itself): keep the
    # fingerprint this run READ, so the next hook sees a change and syncs again rather than skipping it.
    write_state({"synced_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 "fingerprint": start_fp if end_fp != start_fp and not moved else end_fp,
                 "live_rows": len(rows), "open_issues": len(posted), "moved_from_valc": len(moved),
                 "closed": len(closed), "warned": len(warned), **counts})
    return 0


def self_test():
    sample = ("| ID | Status | What it is | Need from you |\n|---|---|---|---|\n"
              "| [DAC-1](#dac-1--x) | \u2610 | **A thing** | — |\n"
              "| [VLC-2](#vlc-2--y) | \u25d0 | Built | \"commit\" |\n"
              "| [VLC-3](#vlc-3--z) | \u2611 | closed | — |\n"
              "| [VLC-4](#vlc-4--w) | \u23f8 | blocked | Get X |\n\n"
              "### DAC-1 \u2014 the thing\n\nbody one\n\n---\n\n### VLC-2 \u2014 other\n\npassword = hunter2hunter2\n")
    assert not set(REPO_FOR.values()) & PUBLIC_REPOS, f"a prefix maps to a public repo: {REPO_FOR}"
    assert REPO_FOR.get("UI") and TARGET_LABEL.get("UI") in LABELS, "UI rows have a private home and a label"
    assert set(TARGET_LABEL) == set(REPO_FOR), "every prefix with a repo has a target label, and no other"
    rows, secs = parse(sample)
    assert [r["id"] for r in rows] == ["DAC-1", "VLC-2", "VLC-4"], rows   # closed is not copied; blocked is
    assert secs["DAC-1"] == ("the thing", "body one"), secs["DAC-1"]
    chunk_md = ("## Chunks\n\n| Chunk | Title | Rows, in the order to work them | Why |\n|---|---|---|---|\n"
                "| pair | The pair | VLC-4, VLC-2 | VLC-2 needs VLC-4 |\n| solo | Alone | DAC-1 | Stands alone |\n\n## Index\n")
    chunks = parse_chunks(chunk_md)
    assert [(c["slug"], c["rows"]) for c in chunks] == [("pair", ["VLC-4", "VLC-2"]), ("solo", ["DAC-1"])], chunks
    live = [r["id"] for r in rows]
    assert chunk_errors(live, chunks) == [], chunk_errors(live, chunks)
    assert chunk_errors(live, chunks[:1]) == ["DAC-1 is live but in no chunk"], "an ungrouped live row must stop the copy"
    two = chunks + [{"slug": "again", "title": "t", "rows": ["DAC-1"], "why": ""}]
    assert "DAC-1 is in two chunks (solo and again)" in chunk_errors(live, two)
    stale = [{"slug": "old", "title": "t", "rows": ["VLC-3"], "why": ""}] + chunks
    assert "chunk old names VLC-3, which is not a live row" in chunk_errors(live, stale)
    assert chunk_errors(live, []) != [], "no table at all is an error, never a silent pass"
    t, b, l = build(rows[1], secs["VLC-2"], chunks[0])
    assert "needs-owner" in l and "status:in-progress" in l and "chunk:pair" in l, l
    assert b.splitlines()[0] == "**Chunk:** The pair · `pair` · step 2 of 2: VLC-4, VLC-2", b.splitlines()[0]
    assert stale_labels(["chunk:old", "chunk:pair", "claude:queued"], ["chunk:pair"]) == ["chunk:old"]
    assert SECRET.search(b), "the secret pattern must catch a password with a value"
    assert not SECRET.search("the rehearsal user's password; RR_ARTIFACT_READ_TOKEN onto a machine account"), \
        "prose that only NAMES a secret must not be refused"
    assert stale_labels(["worklist", "status:open", "claude:done", "needs-owner", "bug"],
                        ["worklist", "status:in-progress"]) == ["status:open", "needs-owner"], \
        "an old status and a resolved needs-owner go; claude:* and a person's own label stay"
    # Closing. DAC-1 is live AND already has a DONE section (a move half made): it must stay open.
    done = done_ids("| ID | Task |\n|---|---|\n| **VLC-1** | old schema |\n\n### DAC-9 — finished\n\nbody\n\n"
                    "### DAC-80 (part 1 of 2) — x\n\n### DAC-1 — being moved\n")
    assert done == {"VLC-1", "DAC-9", "DAC-80", "DAC-1"}, done   # and DAC-80 does not read as DAC-8
    iss = lambda n, title, *labels: {"number": n, "title": title, "labels": [{"name": x} for x in labels]}
    by_repo = {"RapidReconciler-DB": [iss(11, "[DAC-9] finished", "worklist"), iss(14, "[DAC-1] live", "worklist"),
                                      iss(15, "[Investigation 7] y", "investigation"),
                                      iss(16, "[DAC-9] a person labelled it", "investigation", "worklist")],
               "RapidReconciler-Valc": [iss(12, "[VLC-1] old row", "worklist"), iss(13, "[VLC-5] renamed", "worklist")],
               "RapidReconciler-SSIS": []}
    close, warn = to_close([i for v in by_repo.values() for i in v], set(live), done)
    shut, warned = {i["number"] for i, _ in close}, {i["number"] for i, _ in warn}
    assert {11, 12} <= shut, f"a finished row closes, in either DONE schema: {shut}"
    assert 13 in warned and 13 not in shut, f"neither live nor done is warned about, never closed: {shut} {warned}"
    assert 14 not in shut | warned, "a live row is never closed, even with a DONE section already written"
    assert not {15, 16} & (shut | warned), "an investigation issue is never closed"
    sent, out = [], io.StringIO()
    with contextlib.redirect_stdout(out):
        r = close_finished(set(live), {"VLC-5"}, done, True, fetch=by_repo.get, run=sent.append)
    assert r == (["DAC-9", "VLC-1"], ["VLC-5"]) and sent == [], f"--dry-run closes nothing: {r} {sent}"
    assert "WARN VLC-5" in out.getvalue() and "NOT closed" in out.getvalue(), out.getvalue()
    with contextlib.redirect_stdout(io.StringIO()):
        close_finished(set(live), set(), done, False, fetch=by_repo.get, run=sent.append)
    assert sent == [["issue", "close", "11", "-R", "RapidReconciler/RapidReconciler-DB", "--reason", "completed",
                     "--comment", CLOSE_NOTE.format(wid="DAC-9")],
                    ["issue", "close", "12", "-R", "RapidReconciler/RapidReconciler-Valc", "--reason", "completed",
                     "--comment", CLOSE_NOTE.format(wid="VLC-1")]], sent
    # Finding the existing issue (2026-10-22). The map is read first, by number; the listing is the fallback,
    # and a listing that leaves out an issue the map names (and GitHub confirms) must stop the run.
    lab = lambda *n: [{"name": x} for x in n]
    world = {("RapidReconciler-Valc", 326): {"number": 326, "title": "[VLC-124] installer", "labels": lab("worklist")},
             ("RapidReconciler-Valc", 400): {"number": 400, "title": "[VLC-9] gone from the list", "labels": lab("bug")}}
    get = lambda repo, n: world.get((repo, n))
    mp = {"VLC-124": {"repo": "RapidReconciler-Valc", "number": 326}, "VLC-9": {"repo": "RapidReconciler-Valc", "number": 400},
          "VLC-7": {"repo": "RapidReconciler-Valc", "number": 999}}
    whole = [world[("RapidReconciler-Valc", 326)], {"number": 410, "title": "[VLC-50] unmapped", "labels": lab("worklist")}]
    assert existing("RapidReconciler-Valc", "VLC-124", mp, [], get)[:2] == (326, ["worklist"]), \
        "a mapped row is found by number even when the listing came back EMPTY"
    assert existing("RapidReconciler-Valc", "VLC-50", mp, whole, get)[:2] == (410, ["worklist"]), "an unmapped row is found in the listing"
    assert existing("RapidReconciler-Valc", "VLC-51", mp, whole, get) == (None, [], None), "a row with no issue anywhere is a create"
    assert short_listing([], mp, "RapidReconciler-Valc", get) == [326], \
        "THE 2026-10-22 CASE: an empty listing while #326 exists is short, so nothing may be created"
    assert short_listing(whole, mp, "RapidReconciler-Valc", get) == [], \
        "control: a whole listing passes; #400 lost its worklist label and #999 is deleted, so neither blocks"
    assert short_listing([], mp, "RapidReconciler-DB", get) == [], "another repo's map entries are not this listing's business"
    # Labels (2026-10-22): a label the list missed must not fail the run; any other refusal still does.
    posted = []
    def post_422(args):
        posted.append(next(a for a in args if a.startswith("name=")))
        raise RuntimeError("api -X POST: gh: Validation Failed (HTTP 422)")
    with contextlib.redirect_stdout(io.StringIO()):
        ensure_labels("RapidReconciler-Valc", False, {"chunk:x": ("bfd4f2", "d")}, have=set(LABELS), post=post_422)
    assert posted == ["name=chunk:x"], f"only the missing label is created: {posted}"
    def post_500(args):
        raise RuntimeError("api -X POST: gh: Server Error (HTTP 500)")
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            ensure_labels("RapidReconciler-Valc", False, {"chunk:x": ("bfd4f2", "d")}, have=set(LABELS), post=post_500)
        raise AssertionError("a refusal other than 422 must still stop the run")
    except RuntimeError:
        pass
    # VLC-207: VALC closes. 801 closed from VALC -> its row moves; 802 closed on GitHub directly -> WARN, stays;
    # 803 open (even labelled, a half-done close) -> nothing; 804 closed but the map now points at another
    # row's issue -> nothing; a row with no mapped issue -> nothing.
    vrows = [{"id": i} for i in ("VLC-801", "VLC-802", "VLC-803", "VLC-804", "VLC-805")]
    vmap = {f"VLC-80{n}": {"repo": "RapidReconciler-Valc", "number": 800 + n} for n in (1, 2, 3, 4)}
    vworld = {801: {"title": "[VLC-801] a", "state": "closed", "labels": lab("worklist", CLOSED_IN_VALC)},
              802: {"title": "[VLC-802] b", "state": "closed", "labels": lab("worklist")},
              803: {"title": "[VLC-803] c", "state": "open", "labels": lab("worklist", CLOSED_IN_VALC)},
              804: {"title": "[VLC-999] renamed", "state": "closed", "labels": lab("worklist", CLOSED_IN_VALC)}}
    vget = lambda repo, n: vworld.get(n)
    vc, vw = valc_closes(vrows, vmap, vget)
    assert vc == [("VLC-801", "RapidReconciler-Valc", 801)], f"only a closed issue with the VALC label moves its row: {vc}"
    assert vw == [("VLC-802", "RapidReconciler-Valc", 802)], f"a close made on GitHub directly is warned about: {vw}"
    ran, out = [], io.StringIO()
    note = lambda repo, n: "Closed in VALC by ops@getgsi.com, 2026-10-26 08:40 EDT. saw it live"
    with contextlib.redirect_stdout(out):
        moved = apply_valc_closes(vrows, vmap, True, get=vget, comment=note, run=ran.append)
    assert moved == ["VLC-801"] and ran == [], f"--dry-run moves nothing: {moved} {ran}"
    assert "WARN VLC-802" in out.getvalue() and "NOT reopened" in out.getvalue(), out.getvalue()
    with contextlib.redirect_stdout(io.StringIO()):
        apply_valc_closes(vrows, vmap, False, get=vget, comment=note, run=ran.append)
    assert len(ran) == 1 and ran[0][1:3] == [CLOSE_TOOL, "VLC-801"] and "saw it live" in ran[0][3] \
        and "VLC-207" in ran[0][3], f"a live run closes the row with worklist-close.py, quoting VALC's comment: {ran}"
    assert os.path.exists(CLOSE_TOOL), f"the close tool the reverse leg runs must exist: {CLOSE_TOOL}"
    hk47_self_test(rows, secs, chunks, lab)
    print("self-test OK (HK-47: read cache, unchanged skip, lock, verify, state fingerprint)")


def hk47_self_test(rows, secs, chunks, lab):
    import tempfile
    # Read once per run: two reads of the same issue reach GitHub once; a different issue is its own read.
    calls = []
    read = cached(lambda repo, n: calls.append((repo, n)) or {"number": n})
    read("R", 1), read("R", 1), read("R", 2)
    assert calls == [("R", 1), ("R", 2)], f"the cache must read each issue once: {calls}"
    # Unchanged: an issue that already says what the run would write is left alone; any difference edits it.
    t, b, l = build(rows[0], secs["DAC-1"], chunks[1])
    same = {"title": t, "body": b.replace("\n", "\r\n") + "\n", "labels": lab(*l, "claude:done")}
    assert unchanged(same, t, b, l, []), "same title/body/labels (CRLF and a trailing newline aside) is unchanged"
    assert not unchanged(dict(same, body=b + " edited"), t, b, l, []), "a changed body is an edit"
    assert not unchanged(dict(same, title=t + "x"), t, b, l, []), "a changed title is an edit"
    assert not unchanged(dict(same, labels=lab("worklist")), t, b, l, []), "a missing wanted label is an edit"
    assert not unchanged(same, t, b, l, ["needs-owner"]), "a label to remove is an edit"
    assert not unchanged(None, t, b, l, []), "no issue is a create, never 'unchanged'"
    tmp = tempfile.mkdtemp(prefix="sync-test-")
    try:
        # Lock: a live, fresh holder refuses; a dead or stale one is taken over; drop_lock removes only its own.
        lock = os.path.join(tmp, "worklist-sync.lock")
        take_lock(lock, now=1000.0, alive=lambda p: True)
        assert json.load(open(lock))["pid"] == os.getpid()
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                take_lock(lock, now=1000.0 + 60, alive=lambda p: True)
            raise AssertionError("a second live run must not get the lock")
        except Locked:
            pass
        with contextlib.redirect_stdout(io.StringIO()) as out:
            take_lock(lock, now=1000.0 + 60, alive=lambda p: False)
        assert "dead lock" in out.getvalue(), "a dead holder is taken over, and said"
        with contextlib.redirect_stdout(io.StringIO()) as out:
            take_lock(lock, now=1000.0 + 60 + LOCK_STALE_S + 1, alive=lambda p: True)
        assert "stale lock" in out.getvalue(), "a holder past LOCK_STALE_S is taken over, and said"
        with open(lock, "w") as f:
            json.dump({"pid": os.getpid() + 1, "started": 0}, f)
        drop_lock(lock)
        assert os.path.exists(lock), "drop_lock must never remove another run's lock"
        os.remove(lock)
        take_lock(lock, now=5.0, alive=lambda p: True)
        drop_lock(lock)
        assert not os.path.exists(lock), "drop_lock removes its own lock"
        assert pid_alive(os.getpid()) and not pid_alive(0), "pid_alive: this process yes, pid 0 no"
        # main() on a held lock: exit 3, nothing read or posted.
        global LOCK_FILE
        saved_lock, LOCK_FILE = LOCK_FILE, lock
        try:
            with open(lock, "w") as f:
                json.dump({"pid": os.getpid(), "started": time.time()}, f)
            with contextlib.redirect_stdout(io.StringIO()) as out:
                assert main(False) == 3, "a held lock is exit 3"
            assert "LOCKED" in out.getvalue() and os.path.exists(lock), "and the other run's lock is left alone"
        finally:
            LOCK_FILE = saved_lock
            with contextlib.suppress(OSError):
                os.remove(lock)
        # Fingerprint: any byte in either file changes it.
        a, d = os.path.join(tmp, "a.md"), os.path.join(tmp, "d.md")
        open(a, "w").write("x"), open(d, "w").write("y")
        f1 = fingerprint((a, d))
        open(d, "w").write("y ")
        assert fingerprint((a, d)) != f1, "a change in the DONE file changes the fingerprint"
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)
    # Verify: the open worklist issues must be exactly the posted rows; investigations do not count.
    world = {"RapidReconciler-Valc": [{"number": 1, "title": "[VLC-1] a", "labels": lab("worklist")},
                                      {"number": 9, "title": "[Investigation 3] b", "labels": lab("investigation")}],
             "RapidReconciler-DB": [{"number": 2, "title": "[DAC-2] c", "labels": lab("worklist")}],
             "RapidReconciler-SSIS": []}
    assert verify(["VLC-1", "DAC-2"], fetch=world.get, wait=0) == [], "control: a matching set verifies"
    p = verify(["VLC-1", "DAC-2", "UI-3"], fetch=world.get, wait=0)
    assert p == ["live rows with NO open issue: UI-3"], p
    p = verify(["VLC-1"], fetch=world.get, wait=0)
    assert p == ["open issues with NO live row: DAC-2 (RapidReconciler-DB #2)"], p
    # A short first listing (2026-10-22) that recovers on the re-read is not a failure.
    seq = [[], world["RapidReconciler-Valc"]]
    short_then_whole = lambda repo: (seq.pop(0) if repo == "RapidReconciler-Valc" and seq else world[repo])
    assert verify(["VLC-1", "DAC-2"], fetch=short_then_whole, wait=0) == [], \
        "a listing that comes back short once and whole on the re-read verifies"


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        sys.exit(main("--dry-run" in sys.argv))
