"""Dev-box runner for VALC's "Submit to Claude Code" (owner request, 2026-09-30).

VALC's Development page labels GitHub issues `claude:queued` and comments who submitted them.
It submits a whole CHUNK (the `chunk:<slug>` label the worklist copier puts on each issue, from
WORKLIST.md's Chunks table). This runner, run on the dev box AS THE OWNER (it uses the owner's
Claude Code sign-in and the repos checked out here), takes queued work ONE CHUNK AT A TIME:

  0. a queued issue with a chunk label brings in EVERY open issue in that chunk, in step order
     (the "**Chunk:** ... step k of n" body line), because a row that depends on another cannot
     be done in a worktree that never sees the other's change. An issue with no chunk label (a
     filed investigation) is a chunk of one;
  1. moves each member's label to `claude:running` and says so on each issue;
  2. creates a fresh git worktree per repo in the chunk, all on branch `claude/chunk-<slug>` from
     origin/main, so the owner's own checkouts are never touched;
  3. runs ONE Claude Code session headless (`claude -p`) in the first repo's worktree, with the
     others added (`--add-dir`), edits allowed, commit/push/PR/issue commands DENIED (the repos
     hold commits for the owner), and a spending cap (--max-budget-usd) of --budget-usd per issue,
     capped at --max-chunk-usd;
  4. posts the session's report, and each worktree's `git status` and diff stat, to every issue in
     the chunk, and labels each `claude:done` or `claude:failed`. Worktrees stay for review.

It never commits, pushes, merges or deletes anything. It is NOT scheduled by this change:
run it by hand, or add a Task Scheduler entry, when the owner decides to.

Usage:
    python Tools/claude-issue-runner.py --dry-run     # list queued issues + the exact command, change nothing
    python Tools/claude-issue-runner.py --once        # process the queue once, then exit
    python Tools/claude-issue-runner.py --self-test
Options: --budget-usd 5 (per issue)  --max-chunk-usd 20  --timeout-min 90 (per issue, capped at 240)
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time

WORKSPACE = r"C:\source\repos"
WORKTREES = os.path.join(WORKSPACE, "_claude-worktrees")
LOCK = os.path.join(WORKSPACE, ".claude-issue-runner.lock")
GH = r"C:\Program Files\GitHub CLI\gh.exe"
OWNER = "RapidReconciler"
# PRIVATE repos only; the UI repo is public and never carries worklist issues.
REPOS = ["RapidReconciler-DB", "RapidReconciler-Valc", "RapidReconciler-SSIS", "RapidReconciler-Agent",
         "RapidReconciler-Broker"]
ALLOWED = ["Read", "Grep", "Glob", "Edit", "Write",
           "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)",
           "Bash(mvn -q -o test:*)", "Bash(mvn -o test:*)", "Bash(mvn -q -o compile:*)", "Bash(python:*)", "Bash(node --check:*)"]
DENIED = ["Bash(git commit:*)", "Bash(git push:*)", "Bash(git merge:*)", "Bash(git rebase:*)", "Bash(git reset:*)",
          "Bash(git checkout:*)", "Bash(git branch -D:*)", "Bash(gh:*)", "Bash(mvn package:*)", "Bash(mvn install:*)",
          "Bash(rm:*)", "PowerShell"]

MAX_TIMEOUT_MIN = 240
# Written by Tools/worklist-to-issues.py (CHUNK_LINE); VALC's DevelopmentService.CHUNK_LINE reads the same.
CHUNK_LINE = re.compile(r"(?m)^\*\*Chunk:\*\* (.+?) · `([a-z0-9-]+)` · step (\d+) of (\d+): (.*)$")
SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

PROMPT = """You are resolving {count} from the RapidReconciler worklist, as ONE headless Claude Code session
started by the dev-box runner on behalf of the owner. {where}
The owner's other checkouts are not yours to touch.
{order}

RULES
- Follow the CLAUDE.md files (the workspace one at C:/source/repos/CLAUDE.md and this repo's own).
- Do NOT commit, push, open a PR, or edit any issue: those commands are denied, and the owner reviews your diff.
- Do NOT edit HANDOFF.md, WORKLIST.md, WORKLIST-DONE.md or anything outside these worktrees.
- Each issue was copied from the worklist and may be partly or wholly done on main already. Check its
  claims against the code before changing anything, and say which ones were already true.
- Never run `mvn package` (VALC may be running from its jar). `mvn -q -o test` and `compile` are fine.
- Verify before you claim: run the tests that cover your change, and a mutation check where a test is new.
- If the issue needs an owner decision (security boundary, customer-visible wording, spend, anything
  destructive), do not guess: stop and say exactly what needs deciding.

When you finish, your LAST message is the report, in this shape, with one block per issue:
ISSUE: repo#number
RESULT: done | blocked | failed
CHANGED: the files you changed and why, one line each
EVIDENCE: the commands you ran and what they showed
OWNER: what the owner must decide or do next (or "nothing")

{issues}
"""

ISSUE_BLOCK = """=== STEP {step} of {total}: ISSUE {repo}#{number}: {title}
{submitted}
{body}
"""
BODY_CAP_TOTAL = 120000


def gh(args, input_text=None):
    r = subprocess.run([GH] + args, capture_output=True, text=True, encoding="utf-8", input=input_text)
    if r.returncode != 0:
        raise RuntimeError(" ".join(args[:4]) + ": " + (r.stderr or r.stdout).strip())
    return r.stdout


# ------------------------------------------------------------------ the rr-dev-runner API key
# Owner ruling 2026-09-30: sessions bill to a SEPARATE Anthropic key, not VALC's (VALC's sits in
# its SYSTEM-locked config and serves the product's own AI). It is stored for this Windows user
# only, encrypted with DPAPI, never in an environment variable (HK-25: pgAdmin's crash dialog
# published two machine env vars), and handed to the session process alone.
KEY_FILE = os.path.join(os.environ.get("LOCALAPPDATA", ""), "RR-ClaudeRunner", "anthropic-key.dpapi")
KEY_ENTROPY = b"rr-dev-runner/claude-issue-runner"
MODEL = "claude-opus-5-5"
# Inherited credentials a session must NOT see: it bills to the runner's key and nothing else.
STRIP_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_BASE_URL")


def _dpapi(data, protect):
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    def blob(b):
        buf = ctypes.create_string_buffer(b, len(b))
        return Blob(len(b), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf

    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    src, _keep1 = blob(data)
    ent, _keep2 = blob(KEY_ENTROPY)
    out = Blob()
    fn = crypt32.CryptProtectData if protect else crypt32.CryptUnprotectData
    # CRYPTPROTECT_UI_FORBIDDEN (0x1): never prompt; fail instead.
    if not fn(ctypes.byref(src), None, ctypes.byref(ent), None, None, 0x1, ctypes.byref(out)):
        raise OSError(f"DPAPI {'protect' if protect else 'unprotect'} failed (Windows error {ctypes.GetLastError()})")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        kernel32.LocalFree(out.pbData)


def fingerprint(key):
    """What is printed instead of the key: a hash prefix, never any of its characters."""
    import hashlib
    return "sha256:" + hashlib.sha256(key.encode()).hexdigest()[:12]


def load_key():
    if not os.path.exists(KEY_FILE):
        return None
    with open(KEY_FILE, "rb") as f:
        return _dpapi(f.read(), protect=False).decode()


def verify_key(key):
    """HTTP status of GET /v1/models with this key: a check that bills nothing. 200 is the only pass.
    A bad key must be caught here: measured 2026-09-30, `claude -p` with an invalid key HUNG past 90 s
    instead of failing, so a session would sit until its timeout."""
    import urllib.request, urllib.error
    req = urllib.request.Request("https://api.anthropic.com/v1/models",
                                 headers={"x-api-key": key, "anthropic-version": "2023-06-01"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except OSError as e:
        return f"unreachable ({type(e).__name__})"


def set_key():
    import getpass
    key = getpass.getpass("Paste the rr-dev-runner Anthropic API key (input hidden): ").strip()
    if not key.startswith("sk-ant-"):
        raise SystemExit("That does not look like an Anthropic API key (they start sk-ant-). Nothing was saved.")
    status = verify_key(key)
    if status != 200:
        raise SystemExit(f"Anthropic refused the key (GET /v1/models -> {status}). Nothing was saved.")
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    with open(KEY_FILE + ".tmp", "wb") as f:
        f.write(_dpapi(key.encode(), protect=True))
    os.replace(KEY_FILE + ".tmp", KEY_FILE)
    print(f"Saved for this Windows user only (DPAPI): {KEY_FILE}\nKey {fingerprint(key)}, verified (HTTP 200).")


def session_env(key):
    env = {k: v for k, v in os.environ.items() if k.upper() not in STRIP_ENV}
    env["ANTHROPIC_API_KEY"] = key
    return env


def key_preflight():
    """(ok, message, key). Every failure names the fix and changes nothing."""
    try:
        key = load_key()
    except OSError as e:
        return False, f"the stored key could not be decrypted for this Windows user ({e}). Run --set-key again.", None
    if not key:
        return False, (f"no rr-dev-runner key is stored ({KEY_FILE}). Create one in the Anthropic console, then run "
                       "`python Tools/claude-issue-runner.py --set-key`. Nothing was changed."), None
    status = verify_key(key)
    if status != 200:
        return False, f"Anthropic refused the stored key {fingerprint(key)} (GET /v1/models -> {status}). Nothing was changed.", None
    return True, f"API key {fingerprint(key)} verified (HTTP 200); sessions run on {MODEL}", key


def auth_method(exe, env):
    """What the CLI itself says it will use under `env`. Measured 2026-09-30: with no key it said
    {"loggedIn": false, "authMethod": "none"} (the desktop app's sign-in does not reach it) and
    `claude -p` exited 1 "Not logged in"; with ANTHROPIC_API_KEY in its environment it said
    {"loggedIn": true, "authMethod": "api_key", "apiKeySource": "ANTHROPIC_API_KEY"}."""
    r = subprocess.run([exe, "auth", "status"], capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env=env, timeout=60)
    try:
        s = json.loads(r.stdout)
    except ValueError:
        return None
    return s.get("authMethod") if s.get("loggedIn") is True else None


def claude_exe(root=None):
    """The newest Claude Code CLI the desktop app installed. Two layouts, both measured on this box:
    `claude-code\\<version>\\claude.exe` until 2026-10-01 20:02, then `claude-code\\<version>\\<hash>\\claude.exe`
    with a `.verified` file beside it (HK-32: the runner looked only at the first and found nothing).
    Newest version wins; within one version a verified payload, then the newest file."""
    root = root or os.path.join(os.environ.get("APPDATA", ""), "Claude", "claude-code")
    found = []
    for exe in glob.glob(os.path.join(root, "*", "claude.exe")) + glob.glob(os.path.join(root, "*", "*", "claude.exe")):
        rel = os.path.relpath(exe, root).split(os.sep)
        version = [(0, int(x), "") if x.isdigit() else (1, 0, x) for x in re.split(r"[.\-+]", rel[0])]
        verified = len(rel) == 2 or os.path.exists(os.path.join(os.path.dirname(exe), ".verified"))
        found.append((version, verified, os.path.getmtime(exe), exe))
    if not found:
        raise SystemExit(f"claude.exe not found under {root}\\<version>\\ or {root}\\<version>\\<hash>\\ "
                         "(is the desktop app installed?)")
    return max(found)[3]


FIELDS = "number,title,body,comments,labels"


def open_with_label(label):
    """Every open issue carrying `label` across the private repos. A repo that cannot be read is
    an error, not an empty list: a chunk read with a hole in it would run with a step missing."""
    out = []
    for repo in REPOS:
        items = json.loads(gh(["issue", "list", "-R", f"{OWNER}/{repo}", "--label", label, "--state", "open",
                               "--json", FIELDS, "--limit", "50"]))
        for i in items:
            i["repo"] = repo
            out.append(i)
    return out


def chunk_of(issue):
    for l in issue.get("labels") or []:
        name = l["name"] if isinstance(l, dict) else l
        if name.startswith("chunk:") and SLUG.match(name[6:]):
            return name[6:]
    return None


def step_of(issue):
    m = CHUNK_LINE.search(issue.get("body") or "")
    return int(m.group(3)) if m else 10 ** 6   # a missing line sorts last, never first


def chunk_title(members, slug):
    for i in members:
        m = CHUNK_LINE.search(i.get("body") or "")
        if m:
            return m.group(1)
    return slug


def groups(queued_issues, members_of):
    """[(slug or None, [issue, ...] in step order)]. A queued chunked issue brings in the whole
    chunk from members_of(slug), even members nobody queued; an unchunked issue is alone."""
    out, seen = [], set()
    for i in queued_issues:
        slug = chunk_of(i)
        if slug is None:
            out.append((None, [i]))
            continue
        if slug in seen:
            continue
        seen.add(slug)
        members = [m for m in members_of(slug) if chunk_of(m) == slug]
        if not any(m["repo"] == i["repo"] and m["number"] == i["number"] for m in members):
            members.append(i)   # the label list lags a write; the queued issue itself is certainly in
        members.sort(key=lambda m: (step_of(m), m["number"]))
        out.append((slug, members))
    return out


def queued():
    return open_with_label("claude:queued")


def submitted_note(issue):
    for c in reversed(issue.get("comments") or []):
        if "Submitted to Claude Code" in (c.get("body") or ""):
            return c["body"].strip()
    return "(no submission comment found)"


def build_prompt(slug, members, branch, paths):
    """paths: {repo: worktree path}. Issue bodies share one cap so a long chunk cannot blow the prompt."""
    n = len(members)
    per = max(4000, BODY_CAP_TOTAL // n)
    blocks = [ISSUE_BLOCK.format(step=k + 1, total=n, repo=i["repo"], number=i["number"], title=i["title"],
                                 submitted=submitted_note(i), body=(i.get("body") or "")[:per])
              for k, i in enumerate(members)]
    where = ("Worktrees on branch " + branch + ", made from origin/main: "
             + "; ".join(f"{r} at {p}" for r, p in paths.items()) + ".")
    order = ("" if n == 1 else
             f"\nThese {n} issues are the chunk `{slug}` ({chunk_title(members, slug)}). They were grouped because they "
             "depend on each other: work them IN STEP ORDER, and let a later step build on the earlier ones' changes.\n")
    return PROMPT.format(count="one GitHub issue" if n == 1 else f"{n} GitHub issues", where=where, order=order,
                         issues="\n".join(blocks))


def budget_for(n, per_issue, cap):
    return min(per_issue * n, cap)


def build_command(exe, prompt, budget, extra_dirs=()):
    add = ["--add-dir", *extra_dirs] if extra_dirs else []
    # stream-json, not text: text prints nothing until the very end, so a session was invisible for
    # up to four hours. Every event goes to the chunk's log as it happens (see run_session).
    # The key travels in the environment (session_env), never on this command line or in the log.
    return [exe, "-p", prompt, "--model", MODEL, "--permission-mode", "acceptEdits", "--output-format", "stream-json",
            "--verbose", "--max-budget-usd", str(budget), *add, "--allowedTools", *ALLOWED, "--disallowedTools", *DENIED]


def progress_line(event):
    """One readable log line for a stream-json event, or None. Shapes read off the CLI 2026-09-30:
    {"type":"system","subtype":"init"}, {"type":"assistant","message":{"content":[...]}},
    {"type":"result","is_error":bool,"result":str,"total_cost_usd":n}."""
    t = event.get("type")
    if t == "system" and event.get("subtype") == "init":
        return f"session {event.get('session_id')} started in {event.get('cwd')}"
    if t == "assistant":
        parts = []
        for c in (event.get("message") or {}).get("content") or []:
            if c.get("type") == "text" and (c.get("text") or "").strip():
                parts.append(c["text"].strip().replace("\n", " ")[:300])
            elif c.get("type") == "tool_use":
                inp = c.get("input") or {}
                what = inp.get("file_path") or inp.get("command") or inp.get("pattern") or ""
                parts.append(f"[{c.get('name')}] {str(what)[:200]}")
        return " | ".join(parts) or None
    if t == "result":
        return (f"RESULT {'ERROR' if event.get('is_error') else 'ok'} · cost ${event.get('total_cost_usd')} · "
                + (event.get("result") or "").strip().replace("\n", " ")[:300])
    return None


def run_session(cmd, cwd, log_path, minutes, env=None):
    """Runs the session, appending a readable line per event to log_path as it happens.
    Returns (ok, report). ok needs exit 0 AND a result event that is not an error: the CLI marks
    'Not logged in' as subtype 'success' with is_error true (measured), so subtype is not trusted."""
    import threading
    final, lines = None, []
    with open(log_path, "a", encoding="utf-8") as log:
        log.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} starting: {cmd[0]} -p <prompt> in {cwd}\n")
        log.flush()
        p = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             encoding="utf-8", errors="replace", env=env)
        stopped = threading.Event()

        def stop():
            stopped.set()
            p.kill()
        killer = threading.Timer(minutes * 60, stop)
        killer.start()
        try:
            for raw in p.stdout:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    ev = json.loads(raw)
                except ValueError:
                    lines.append(raw)
                    log.write(f"{time.strftime('%H:%M:%S')} {raw[:300]}\n")
                    log.flush()
                    continue
                if ev.get("type") == "result":
                    final = ev
                line = progress_line(ev)
                if line:
                    log.write(f"{time.strftime('%H:%M:%S')} {line}\n")
                    log.flush()
            p.wait()
        finally:
            killer.cancel()
        if stopped.is_set():
            log.write(f"{time.strftime('%H:%M:%S')} stopped: no result within {minutes} minutes\n")
            return False, f"The session did not finish within {minutes} minutes and was stopped."
    report = (final or {}).get("result") or "\n".join(lines[-20:]) or "(the session printed nothing)"
    ok = p.returncode == 0 and final is not None and not final.get("is_error") and "RESULT: failed" not in report
    return ok, report


# HK-30: the runner holds a chunk's worklist rows in WORKLIST.md the way a pasted session does, so neither
# starts a row the other has. One constant name, so a re-run of the same chunk moves its own hold instead
# of being refused by it; the stamped branch and worktree in the hold say which run it was.
RUNNER_HOLDER = "dev-box runner"
ROW_ID = re.compile(r"^\[([A-Z]+-\d+)\]")


def claims():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "worklist_claim", os.path.join(os.path.dirname(os.path.abspath(__file__)), "worklist-claim.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def row_ids(members):
    """The worklist row IDs in a chunk; an investigation issue has none and is never held."""
    return [m.group(1) for m in (ROW_ID.match(i.get("title") or "") for i in members) if m]


def own_trees(c):
    """Worktrees this runner made on earlier runs: a re-run is not a second session on the row."""
    root = os.path.normcase(os.path.normpath(WORKTREES)) + os.sep
    return [p for _, p, _ in c.git_worktrees() if os.path.normcase(os.path.normpath(p)).startswith(root)]


def hold_rows(ids, paths, c=None):
    """(ok, text). Writes the runner's hold on every row, or on none and says who has them."""
    if not ids:
        return True, ""
    c = c or claims()
    try:
        lines = c.take(ids, RUNNER_HOLDER, list(paths.values()), skip_labels=True, ignore=own_trees(c), announce=False)
        return True, "\n".join(lines)
    except c.Refused as e:
        return False, str(e)


def take_lock():
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{os.getpid()} {time.strftime('%Y-%m-%dT%H:%M:%S')}".encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


def plan(slug, members, stamp):
    """(branch, {repo: worktree path}) for a chunk. The stamp keeps a re-run from colliding with the
    branch and worktree an earlier run left for review."""
    name = slug or f"{members[0]['repo'].split('-')[-1].lower()}-{members[0]['number']}"
    branch = f"claude/{'chunk' if slug else 'issue'}-{name}-{stamp}"
    repos = list(dict.fromkeys(m["repo"] for m in members))   # first-seen order: step 1's repo leads
    return branch, {r: os.path.join(WORKTREES, f"{name}-{stamp}-{r}") for r in repos}


def run_chunk(slug, members, exe, per_issue_usd, max_chunk_usd, timeout_min, dry, env=None):
    stamp = time.strftime("%Y%m%d%H%M")
    branch, paths = plan(slug, members, stamp)
    n = len(members)
    budget = budget_for(n, per_issue_usd, max_chunk_usd)
    minutes = min(timeout_min * n, MAX_TIMEOUT_MIN)
    repos = list(paths)
    log_path = os.path.join(WORKTREES, f"{branch.split('/', 1)[1]}.log")
    cmd = build_command(exe, build_prompt(slug, members, branch, paths), budget, [paths[r] for r in repos[1:]])
    print(f"  chunk {slug or '(none)'}: {n} issue(s), budget ${budget}, timeout {minutes} min")
    print(f"    live log {log_path}")
    for k, m in enumerate(members):
        print(f"    step {k + 1}: {m['repo']}#{m['number']} {m['title'][:70]}")
    for r in repos:
        print(f"    worktree {paths[r]}  branch {branch}")
    print(f"    command  {cmd[0]} -p <prompt, {len(cmd[2])} chars> " + " ".join(cmd[3:9]) + " ...")
    ids = row_ids(members)
    if dry:
        if ids:
            c = claims()
            found = c.check(ids, by=RUNNER_HOLDER, skip_labels=True, ignore=own_trees(c))
            print("    holds    " + ("; ".join(found) if found else "free: nobody holds " + ", ".join(ids)))
        return
    who = ", ".join(f"{m['repo']}#{m['number']}" for m in members)
    held, why = hold_rows(ids, paths)
    print("    holds    " + why.replace("\n", "; "))
    if not held:
        for m in members:
            gh(["issue", "comment", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--body-file", "-"],
               input_text="**Not started by the dev-box runner:** another session holds a row in this chunk, or a worktree "
                          "already names one (HK-30), so a second build was not begun. Nothing was created.\n\n```\n"
                          + why + "\n```\n\nAsk that session, or release its hold with `python Tools/worklist-claim.py "
                          "release <ID> --by \"<holder>\"`, then submit again.")
            gh(["issue", "edit", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--remove-label", "claude:queued",
                "--add-label", "claude:failed"])
        return
    for m in members:
        gh(["issue", "edit", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--remove-label", "claude:queued",
            "--add-label", "claude:running"])
        gh(["issue", "comment", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--body-file", "-"],
           input_text=f"Picked up by the dev-box runner at {time.strftime('%Y-%m-%d %H:%M')}"
                      + (f" as part of chunk `{slug}` ({who}), one session in step order" if slug else "")
                      + f". Branch `{branch}`. Budget cap ${budget}. Nothing will be committed or pushed. "
                      + f"Live progress, one line per step: `{log_path}` on the dev box.")
    ok, report, still_held = False, "", bool(ids)
    try:
        os.makedirs(WORKTREES, exist_ok=True)
        for r in repos:
            src = os.path.join(WORKSPACE, r)
            subprocess.run(["git", "-C", src, "fetch", "origin", "main"], check=True, capture_output=True, text=True)
            subprocess.run(["git", "-C", src, "worktree", "add", "-b", branch, paths[r], "origin/main"], check=True,
                           capture_output=True, text=True)
        ok, report = run_session(cmd, paths[repos[0]], log_path, minutes, env)
    except subprocess.CalledProcessError as e:
        report = f"Setup failed: {' '.join(e.cmd[:5])}: {(e.stderr or '').strip()}"
        if ids:   # nothing was built, so nothing is held: let the next session have the rows
            report += "\n\n" + "\n".join(claims().release(ids, RUNNER_HOLDER))
            still_held = False
    trees = []
    for r in repos:
        p = paths[r]
        status = subprocess.run(["git", "-C", p, "status", "--short"], capture_output=True, text=True).stdout if os.path.isdir(p) else ""
        stat = subprocess.run(["git", "-C", p, "diff", "--stat"], capture_output=True, text=True).stdout if os.path.isdir(p) else ""
        trees.append(f"**{r}** worktree `{p}`\n\n```\n{status.strip() or '(no changes)'}\n{stat.strip()}\n```")
    body = (f"**Claude Code session {'finished' if ok else 'did not finish'}**"
            + (f" for chunk `{slug}` ({who})" if slug else "") + f".\n\n{report[:50000]}\n\n"
            f"Branch `{branch}`, not committed.\n\n" + "\n\n".join(trees)
            + (f"\n\nThe runner still holds {', '.join(ids)} in WORKLIST.md while this diff waits for review. Release with "
               f"`python Tools/worklist-claim.py release {' '.join(ids)} --by \"{RUNNER_HOLDER}\"` before anyone else takes it."
               if still_held else ""))
    for m in members:
        gh(["issue", "comment", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--body-file", "-"], input_text=body)
        gh(["issue", "edit", str(m["number"]), "-R", f"{OWNER}/{m['repo']}", "--remove-label", "claude:running",
            "--add-label", "claude:done" if ok else "claude:failed"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--set-key", action="store_true", help="store the rr-dev-runner API key (DPAPI, this user only)")
    ap.add_argument("--clear-key", action="store_true", help="delete the stored key")
    ap.add_argument("--budget-usd", type=float, default=5.0, help="per issue in the chunk")
    ap.add_argument("--max-chunk-usd", type=float, default=20.0, help="cap for one chunk's session")
    ap.add_argument("--timeout-min", type=int, default=90, help=f"per issue, capped at {MAX_TIMEOUT_MIN}")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if a.set_key:
        return set_key()
    if a.clear_key:
        if os.path.exists(KEY_FILE):
            os.remove(KEY_FILE)
        return print(f"No key stored at {KEY_FILE}.")
    if not (a.dry_run or a.once):
        raise SystemExit("choose --dry-run, --once, --set-key or --clear-key")
    exe = claude_exe()
    print(f"claude: {exe}")
    signed, why, key = key_preflight()
    env = session_env(key) if key else None
    if signed:
        # The CLI's own word, under the exact environment the session gets.
        method = auth_method(exe, env)
        if method != "api_key":
            signed, why = False, f"the CLI does not take the key from its environment (auth status -> {method}). Nothing was changed."
    print(("  ok: " if signed else "  BLOCKED: ") + why)
    if not signed and not a.dry_run:
        raise SystemExit(1)
    items = queued()
    work = groups(items, lambda slug: open_with_label(f"chunk:{slug}"))
    print(f"queued issues: {len(items)}; sessions (chunks): {len(work)}")
    if not work:
        return
    if not a.dry_run and not take_lock():
        raise SystemExit(f"another runner holds {LOCK}; one session at a time")
    try:
        for slug, members in work:
            run_chunk(slug, members, exe, a.budget_usd, a.max_chunk_usd, a.timeout_min, a.dry_run, env)
    finally:
        if not a.dry_run and os.path.exists(LOCK):
            os.remove(LOCK)


def self_test():
    issue = {"repo": "RapidReconciler-DB", "number": 3, "title": "[DAC-81] x", "body": "the body",
             "comments": [{"body": "Submitted to Claude Code from VALC by ops@getgsi.com"}]}
    branch, paths = plan(None, [issue], "202609302100")
    assert branch == "claude/issue-db-3-202609302100" and list(paths) == ["RapidReconciler-DB"], (branch, paths)
    p = build_prompt(None, [issue], branch, paths)
    assert "RapidReconciler-DB#3" in p and "the body" in p and "by ops@getgsi.com" in p and "Do NOT commit" in p
    assert "one GitHub issue" in p and "IN STEP ORDER" not in p

    # A chunk: the copier's exact body line (same literal as worklist-to-issues.py's self-test).
    def mem(repo, n, step, of, queued=False):
        labels = [{"name": "worklist"}, {"name": "chunk:pair"}] + ([{"name": "claude:queued"}] if queued else [])
        return {"repo": repo, "number": n, "title": f"[X-{n}] t", "labels": labels, "comments": [],
                "body": f"**Chunk:** The pair · `pair` · step {step} of {of}: VLC-4, VLC-2\n\nbody {n}"}
    a, b = mem("RapidReconciler-Valc", 9, 2, 2, queued=True), mem("RapidReconciler-DB", 4, 1, 2)
    solo = {"repo": "RapidReconciler-DB", "number": 7, "title": "[Investigation 1] y", "labels": [{"name": "investigation"}],
            "body": "b", "comments": []}
    # b was never queued and the label list is the only place it shows: the chunk still brings it in, first.
    work = groups([a, solo], lambda slug: [a, b] if slug == "pair" else [])
    assert [(s, [m["number"] for m in ms]) for s, ms in work] == [("pair", [4, 9]), (None, [7])], work
    # A lagging label list that misses the queued issue itself must not drop it.
    work = groups([a], lambda slug: [b])
    assert [m["number"] for m in work[0][1]] == [4, 9], work
    branch, paths = plan("pair", work[0][1], "202609302100")
    assert branch == "claude/chunk-pair-202609302100" and list(paths) == ["RapidReconciler-DB", "RapidReconciler-Valc"], paths
    p = build_prompt("pair", work[0][1], branch, paths)
    assert "2 GitHub issues" in p and "IN STEP ORDER" in p and p.index("STEP 1 of 2: ISSUE RapidReconciler-DB#4") \
        < p.index("STEP 2 of 2: ISSUE RapidReconciler-Valc#9"), p[:600]
    cmd = build_command("claude.exe", p, budget_for(2, 5, 20), [paths["RapidReconciler-Valc"]])
    assert cmd[cmd.index("--add-dir") + 1] == paths["RapidReconciler-Valc"], "the second repo's worktree must be added"
    assert cmd[cmd.index("--max-budget-usd") + 1] == "10", cmd
    assert budget_for(9, 5, 20) == 20, "the chunk cap holds however many issues it has"

    # The key: real DPAPI round trip for this user, bound to our entropy; never on the command line.
    fake_key = "sk-ant-api03-SELFTEST-not-a-real-key"
    sealed = _dpapi(fake_key.encode(), protect=True)
    assert fake_key.encode() not in sealed and _dpapi(sealed, protect=False).decode() == fake_key
    assert fingerprint(fake_key).startswith("sha256:") and "SELFTEST" not in fingerprint(fake_key)
    os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = "inherited-should-not-leak"
    try:
        env = session_env(fake_key)
    finally:
        del os.environ["CLAUDE_CODE_OAUTH_TOKEN"]
    assert env["ANTHROPIC_API_KEY"] == fake_key and "CLAUDE_CODE_OAUTH_TOKEN" not in env, "the session bills to the runner key only"
    assert fake_key not in " ".join(build_command("claude.exe", "p", 5)), "the key must never be on the command line"
    assert build_command("claude.exe", "p", 5)[build_command("claude.exe", "p", 5).index("--model") + 1] == MODEL
    # Progress lines and the verdict, on the event shapes read off the CLI that day.
    notlogged = {"type": "result", "subtype": "success", "is_error": True, "result": "Not logged in · Please run /login",
                 "total_cost_usd": 0}
    assert progress_line(notlogged).startswith("RESULT ERROR"), progress_line(notlogged)
    tool = {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Edit",
                                                          "input": {"file_path": "C:/x/Pom.java"}}]}}
    assert progress_line(tool) == "[Edit] C:/x/Pom.java", progress_line(tool)
    # run_session end to end on a stand-in CLI that replays those events and exits 0: a signed-out
    # result must NOT read as done even when the process exits 0, and the log must carry each line.
    import tempfile
    d = tempfile.mkdtemp()
    fake = os.path.join(d, "fake.py")
    with open(fake, "w", encoding="utf-8") as f:
        f.write("import json\nprint(json.dumps({'type':'system','subtype':'init','session_id':'s1','cwd':'c'}))\n"
                f"print(json.dumps({tool!r}))\nprint(json.dumps({notlogged!r}))\n")
    log = os.path.join(d, "run.log")
    ok, report = run_session([sys.executable, fake], d, log, 1)
    assert not ok and report == "Not logged in · Please run /login", (ok, report)
    text = open(log, encoding="utf-8").read()
    assert "session s1 started" in text and "[Edit] C:/x/Pom.java" in text and "RESULT ERROR" in text, text
    with open(fake, "w", encoding="utf-8") as f:
        f.write("import json\nprint(json.dumps({'type':'result','is_error':False,'result':'ISSUE: a#1\\nRESULT: done'}))\n")
    ok, report = run_session([sys.executable, fake], d, log, 1)
    assert ok and "RESULT: done" in report, (ok, report)

    cmd = build_command("claude.exe", p, 5)
    assert cmd[cmd.index("--output-format") + 1] == "stream-json" and "--verbose" in cmd
    assert "--add-dir" not in cmd, "a one-repo session adds no directory"
    assert cmd[1] == "-p" and "--max-budget-usd" in cmd and cmd[cmd.index("--permission-mode") + 1] == "acceptEdits"
    denied = cmd[cmd.index("--disallowedTools") + 1:]
    for must in ("Bash(git commit:*)", "Bash(git push:*)", "Bash(gh:*)", "Bash(mvn package:*)"):
        assert must in denied, must
    allowed = cmd[cmd.index("--allowedTools") + 1:cmd.index("--disallowedTools")]
    assert not any(x.startswith("Bash(git commit") or x.startswith("Bash(gh") for x in allowed)
    assert "RapidReconciler-AI" not in REPOS, "the public UI repo must never be read for queued work"

    # HK-30: the runner holds a chunk's rows, refuses one another session holds, and moves its own on a re-run.
    import tempfile
    assert row_ids([mem("RapidReconciler-Valc", 5, 1, 2), solo]) == ["X-5"], "an investigation has no row to hold"
    tmp = tempfile.mkdtemp(prefix="runner-claim-")
    wl = os.path.join(tmp, "WORKLIST.md")
    with open(wl, "w", encoding="utf-8", newline="") as f:
        f.write("# W\n\n### X-5 — free\n\nbody\n\n---\n\n### X-6 — held\n\n**Held by:** Session Q · C:/q · "
                "2026-10-02T13:00Z\n\nbody\n")
    old = os.environ.get("RR_CLAIM_TEST_FILE")
    os.environ["RR_CLAIM_TEST_FILE"] = wl   # the claim module points at the scratch file and skips git and GitHub
    try:
        c = claims()
        assert c.WORKLIST == wl
        ok, why = hold_rows(["X-5", "X-6"], {"R": "C:/w1"}, c)
        assert not ok and "held by Session Q" in why and c.holds(c.read(), "X-5") == [], (ok, why)
        ok, why = hold_rows(["X-5"], {"R": "C:/w1"}, c)
        assert ok and c.holds(c.read(), "X-5")[0][1].group("who") == RUNNER_HOLDER, why
        ok, why = hold_rows(["X-5"], {"R": "C:/w2"}, c)
        h = c.holds(c.read(), "X-5")
        assert ok and len(h) == 1 and h[0][1].group("where") == "C:/w2", (why, h)
        assert hold_rows([], {"R": "C:/w"}, c) == (True, "")
        # an earlier run's worktree names the row; it is the runner's own, so a re-run is not refused by it
        prior = [("RapidReconciler-Valc", os.path.join(WORKTREES, "x-5-202610011200-RapidReconciler-Valc"), "claude/issue-x-5-1")]
        c.git_worktrees = lambda: list(prior)
        c.default_world = lambda: c.World(trees=lambda: list(prior), labels=lambda wid: None, comment=lambda wid, b: "")
        assert own_trees(c) == [prior[0][1]]
        ok, why = hold_rows(["X-5"], {"R": "C:/w3"}, c)
        assert ok, why
        prior.append(("RapidReconciler-Valc", r"C:\source\repos\_wt-x5", "claude/x-5-abc"))
        ok, why = hold_rows(["X-5"], {"R": "C:/w4"}, c)
        assert not ok and "_wt-x5" in why, "a session's own worktree on the row still stops the runner"
    finally:
        if old is None:
            os.environ.pop("RR_CLAIM_TEST_FILE", None)
        else:
            os.environ["RR_CLAIM_TEST_FILE"] = old

    # HK-32: find claude.exe in the flat layout, the nested one the app moved to on 2026-10-01, and a mix.
    made = []

    def tree(*files, verified=(), mtimes=None):
        r = tempfile.mkdtemp(prefix="claude-code-")
        made.append(r)
        for k, rel in enumerate(files):
            p = os.path.join(r, *rel.split("/"))
            os.makedirs(os.path.dirname(p), exist_ok=True)
            open(p, "w").close()
            os.utime(p, (1_700_000_000 + (mtimes or {}).get(rel, k),) * 2)
        for rel in verified:
            open(os.path.join(r, *rel.split("/"), ".verified"), "w").close()
        return r
    pick = lambda r: os.path.relpath(claude_exe(r), r).replace(os.sep, "/")
    assert pick(tree("2.1.9/claude.exe", "2.1.10/claude.exe")) == "2.1.10/claude.exe", "flat, numeric not text order"
    assert pick(tree("2.1.284/3f4b/claude.exe", "2.1.286/635c/claude.exe", verified=["2.1.284/3f4b", "2.1.286/635c"])) \
        == "2.1.286/635c/claude.exe", "the layout on this box since 2026-10-01"
    assert pick(tree("2.1.290/claude.exe", "2.1.286/635c/claude.exe", verified=["2.1.286/635c"])) == "2.1.290/claude.exe"
    assert pick(tree("2.1.286/aaaa/claude.exe", "2.1.286/bbbb/claude.exe", verified=["2.1.286/aaaa"],
                     mtimes={"2.1.286/aaaa/claude.exe": 0, "2.1.286/bbbb/claude.exe": 9})) == "2.1.286/aaaa/claude.exe", \
        "within one version a verified payload beats a newer unverified one"
    assert pick(tree("2.1.286/claude.exe", "2.2.0-beta/x/claude.exe", verified=["2.2.0-beta/x"])) == "2.2.0-beta/x/claude.exe"
    try:
        claude_exe(tree("2.1.286/635c/.payload"))
        raise AssertionError("an empty tree must not return a path")
    except SystemExit as e:
        assert "<version>\\<hash>" in str(e), e
    import shutil
    for r in made + [tmp]:
        shutil.rmtree(r, ignore_errors=True)
    print("self-test OK")


if __name__ == "__main__":
    main()
