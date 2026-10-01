"""Copy the LIVE rows of WORKLIST.md into GitHub Issues (owner request, 2026-09-30).

Each index row that has a live-status table cell becomes one issue in the PRIVATE repo of its
build target, carrying the row's status, its "Need from you", and the row's whole section.
WORKLIST.md stays the source of truth until the owner rules otherwise; this is a copy.

Safety, all enforced before anything is sent:
  * PRIVATE repos only. The UI repo is public, so a UI- row is refused, never posted there.
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

Usage:  python Tools/worklist-to-issues.py [--dry-run]
        python Tools/worklist-to-issues.py --self-test
"""
import contextlib
import io
import json
import os
import re
import subprocess
import sys

WORKSPACE = r"C:\source\repos"
WORKLIST = os.path.join(WORKSPACE, "WORKLIST.md")
DONE = os.path.join(WORKSPACE, "WORKLIST-DONE.md")
MAP_FILE = os.path.join(WORKSPACE, "worklist-issues.json")
GH = r"C:\Program Files\GitHub CLI\gh.exe"
OWNER = "RapidReconciler"

# Build target (ID prefix) -> private repo. Housekeeping lives with VALC, where most of it lands.
REPO_FOR = {"DAC": "RapidReconciler-DB", "ISP": "RapidReconciler-SSIS", "VLC": "RapidReconciler-Valc",
            "HK": "RapidReconciler-Valc"}
TARGET_LABEL = {"DAC": "target:dacpac", "ISP": "target:ispac", "VLC": "target:valc", "HK": "housekeeping"}
STATUS_LABEL = {"\u2610": "status:open", "\u25d0": "status:in-progress", "\u23f8": "status:blocked"}   # ☐ ◐
LABELS = {
    "worklist": ("1f2d4a", "Copied from WORKLIST.md"),
    "target:dacpac": ("0e8a7d", "RapidReconciler-DB build target"),
    "target:ispac": ("0e8a7d", "RapidReconciler-SSIS build target"),
    "target:valc": ("0e8a7d", "RapidReconciler-Valc build target"),
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


def ensure_labels(repo, dry, extra=None):
    have = {l["name"] for l in json.loads(gh(["api", f"repos/{OWNER}/{repo}/labels?per_page=100"]))}
    for name, (color, desc) in {**LABELS, **(extra or {})}.items():
        if name in have:
            continue
        print(f"  label {repo}: create {name}")
        if not dry:
            gh(["api", "-X", "POST", f"repos/{OWNER}/{repo}/labels", "-f", f"name={name}", "-f", f"color={color}",
                "-f", f"description={desc}"])


def existing(repo, wid):
    """(number, current label names) of the issue titled "[ID] ...", or (None, [])."""
    q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues?state=all&labels=worklist&per_page=100"]))
    for i in q:
        if "pull_request" not in i and i["title"].startswith(f"[{wid}]"):
            return i["number"], [l["name"] for l in i.get("labels", [])]
    return None, []


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
    text = open(WORKLIST, encoding="utf-8").read()
    rows, sections = parse(text)
    chunks = parse_chunks(text)
    print(f"live rows: {len(rows)}; sections: {len(sections)}; chunks: {len(chunks)}")
    if not rows:
        raise SystemExit("no live rows parsed: the index format changed, refusing to report zero")
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
    for repo in sorted({REPO_FOR[r["id"].split("-")[0]] for r in rows if r["id"].split("-")[0] in REPO_FOR}):
        # Only the chunks that have a row in this repo; a chunk spanning repos gets its label in each.
        here = [c for c in chunks if any(REPO_FOR.get(r.split("-")[0]) == repo for r in c["rows"])]
        ensure_labels(repo, dry, chunk_labels(here))
    for row in rows:
        prefix = row["id"].split("-")[0]
        if prefix not in REPO_FOR:
            print(f"  REFUSED {row['id']}: no PRIVATE repo for prefix {prefix} (the UI repo is public)")
            continue
        repo = REPO_FOR[prefix]
        title, body, labels = build(row, sections.get(row["id"]), chunk_of[row["id"]])
        if SECRET.search(body):
            print(f"  REFUSED {row['id']}: a secret-shaped string is in its section; not posted")
            continue
        num, current = existing(repo, row["id"])
        stale = stale_labels(current, labels)
        action = f"update #{num}" if num else "create"
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
    if not dry:
        with open(MAP_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(mapping, f, indent=2)
        os.replace(MAP_FILE + ".tmp", MAP_FILE)
        print(f"map written: {MAP_FILE} ({len(mapping)} entries)")


def self_test():
    sample = ("| ID | Status | What it is | Need from you |\n|---|---|---|---|\n"
              "| [DAC-1](#dac-1--x) | \u2610 | **A thing** | — |\n"
              "| [VLC-2](#vlc-2--y) | \u25d0 | Built | \"commit\" |\n"
              "| [VLC-3](#vlc-3--z) | \u2611 | closed | — |\n"
              "| [VLC-4](#vlc-4--w) | \u23f8 | blocked | Get X |\n\n"
              "### DAC-1 \u2014 the thing\n\nbody one\n\n---\n\n### VLC-2 \u2014 other\n\npassword = hunter2hunter2\n")
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
    print("self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main("--dry-run" in sys.argv)
