"""Copy the LIVE rows of WORKLIST.md into GitHub Issues (owner request, 2026-09-30).

Each index row that has a live-status table cell becomes one issue in the PRIVATE repo of its
build target, carrying the row's status, its "Need from you", and the row's whole section.
WORKLIST.md stays the source of truth until the owner rules otherwise; this is a copy.

Safety, all enforced before anything is sent:
  * PRIVATE repos only. The UI repo is public, so a UI- row is refused, never posted there.
  * A secret-shaped string (password/secret/token/key followed by a value) stops that row.
  * Idempotent: an issue whose title starts "[ID]" already open or closed is updated, not
    duplicated. The ID -> issue map is written beside WORKLIST.md (worklist-issues.json).

Usage:  python Tools/worklist-to-issues.py [--dry-run]
        python Tools/worklist-to-issues.py --self-test
"""
import json
import os
import re
import subprocess
import sys

WORKSPACE = r"C:\source\repos"
WORKLIST = os.path.join(WORKSPACE, "WORKLIST.md")
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


def gh(args, input_text=None):
    r = subprocess.run([GH] + args, capture_output=True, text=True, encoding="utf-8", input=input_text)
    if r.returncode != 0:
        raise RuntimeError(" ".join(args[:3]) + ": " + (r.stderr or r.stdout).strip())
    return r.stdout


def ensure_labels(repo, dry):
    have = {l["name"] for l in json.loads(gh(["api", f"repos/{OWNER}/{repo}/labels?per_page=100"]))}
    for name, (color, desc) in LABELS.items():
        if name in have:
            continue
        print(f"  label {repo}: create {name}")
        if not dry:
            gh(["api", "-X", "POST", f"repos/{OWNER}/{repo}/labels", "-f", f"name={name}", "-f", f"color={color}",
                "-f", f"description={desc}"])


def existing(repo, wid):
    q = json.loads(gh(["api", f"repos/{OWNER}/{repo}/issues?state=all&labels=worklist&per_page=100"]))
    for i in q:
        if "pull_request" not in i and i["title"].startswith(f"[{wid}]"):
            return i["number"]
    return None


def build(row, section):
    wid = row["id"]
    title_text = section[0] if section else re.sub(r"\*\*|`", "", row["what"])[:120]
    title = f"[{wid}] {title_text}"[:250]
    body = [f"**Status:** {row['status'].strip()} &middot; **Need from you:** {row['need'].strip() or '—'}", "",
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
    labels = ["worklist", TARGET_LABEL[wid.split("-")[0]], STATUS_LABEL[row["status"].strip()[:1]]]
    need = row["need"].strip()
    if need and need not in ("—", "-", "&mdash;"):
        labels.append("needs-owner")
    return title, text, labels


def main(dry):
    rows, sections = parse(open(WORKLIST, encoding="utf-8").read())
    print(f"live rows: {len(rows)}; sections: {len(sections)}")
    if not rows:
        raise SystemExit("no live rows parsed: the index format changed, refusing to report zero")
    mapping = json.load(open(MAP_FILE, encoding="utf-8")) if os.path.exists(MAP_FILE) else {}
    for repo in sorted({REPO_FOR[r["id"].split("-")[0]] for r in rows if r["id"].split("-")[0] in REPO_FOR}):
        ensure_labels(repo, dry)
    for row in rows:
        prefix = row["id"].split("-")[0]
        if prefix not in REPO_FOR:
            print(f"  REFUSED {row['id']}: no PRIVATE repo for prefix {prefix} (the UI repo is public)")
            continue
        repo = REPO_FOR[prefix]
        title, body, labels = build(row, sections.get(row["id"]))
        if SECRET.search(body):
            print(f"  REFUSED {row['id']}: a secret-shaped string is in its section; not posted")
            continue
        num = existing(repo, row["id"])
        action = f"update #{num}" if num else "create"
        print(f"  {row['id']:8} -> {repo:24} {action:12} {labels}")
        if dry:
            continue
        if num:
            gh(["issue", "edit", str(num), "-R", f"{OWNER}/{repo}", "--title", title, "--body-file", "-",
                "--add-label", ",".join(labels)], input_text=body)
        else:
            out = gh(["issue", "create", "-R", f"{OWNER}/{repo}", "--title", title, "--body-file", "-",
                      "--label", ",".join(labels)], input_text=body)
            num = int(out.strip().rstrip("/").split("/")[-1])
        mapping[row["id"]] = {"repo": repo, "number": num, "url": f"https://github.com/{OWNER}/{repo}/issues/{num}"}
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
    t, b, l = build(rows[1], secs["VLC-2"])
    assert "needs-owner" in l and "status:in-progress" in l, l
    assert SECRET.search(b), "the secret pattern must catch a password with a value"
    assert not SECRET.search("the rehearsal user's password; RR_ARTIFACT_READ_TOKEN onto a machine account"), \
        "prose that only NAMES a secret must not be refused"
    print("self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main("--dry-run" in sys.argv)
