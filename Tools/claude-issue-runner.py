"""Dev-box runner for VALC's "Submit to Claude Code" (owner request, 2026-09-30).

VALC's Development page labels a GitHub issue `claude:queued` and comments who submitted it.
This runner, run on the dev box AS THE OWNER (it uses the owner's Claude Code sign-in and the
repos checked out here), takes queued issues ONE AT A TIME and for each:

  1. moves the label to `claude:running` and says so on the issue;
  2. creates a fresh git worktree + branch `claude/issue-<repo>-<n>` from origin/main, so the
     owner's own checkouts are never touched;
  3. runs Claude Code headless (`claude -p`) in that worktree with edits allowed, but commit,
     push, PR and issue commands DENIED (the repos hold commits for the owner), and a spending
     cap (--max-budget-usd);
  4. posts the session's report, `git status` and the diff stat to the issue, and labels it
     `claude:done` or `claude:failed`. The worktree is left in place for review.

It never commits, pushes, merges or deletes anything. It is NOT scheduled by this change:
run it by hand, or add a Task Scheduler entry, when the owner decides to.

Usage:
    python Tools/claude-issue-runner.py --dry-run     # list queued issues + the exact command, change nothing
    python Tools/claude-issue-runner.py --once        # process the queue once, then exit
    python Tools/claude-issue-runner.py --self-test
Options: --budget-usd 5  --timeout-min 90
"""
import argparse
import glob
import json
import os
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

PROMPT = """You are resolving one GitHub issue from the RapidReconciler worklist, as a headless Claude Code session
started by the dev-box runner on behalf of the owner. You are in a fresh git worktree of {repo} on branch {branch},
made from origin/main. The owner's other checkouts are not yours to touch.

RULES
- Follow the CLAUDE.md files (the workspace one at C:/source/repos/CLAUDE.md and this repo's own).
- Do NOT commit, push, open a PR, or edit any issue: those commands are denied, and the owner reviews your diff.
- Do NOT edit HANDOFF.md, WORKLIST.md, WORKLIST-DONE.md or anything outside this worktree.
- Never run `mvn package` (VALC may be running from its jar). `mvn -q -o test` and `compile` are fine.
- Verify before you claim: run the tests that cover your change, and a mutation check where a test is new.
- If the issue needs an owner decision (security boundary, customer-visible wording, spend, anything
  destructive), do not guess: stop and say exactly what needs deciding.

When you finish, your LAST message is the report, in this shape:
RESULT: done | blocked | failed
CHANGED: the files you changed and why, one line each
EVIDENCE: the commands you ran and what they showed
OWNER: what the owner must decide or do next (or "nothing")

ISSUE {repo}#{number}: {title}
{submitted}
{body}
"""


def gh(args, input_text=None):
    r = subprocess.run([GH] + args, capture_output=True, text=True, encoding="utf-8", input=input_text)
    if r.returncode != 0:
        raise RuntimeError(" ".join(args[:4]) + ": " + (r.stderr or r.stdout).strip())
    return r.stdout


def claude_exe():
    found = sorted(glob.glob(os.path.join(os.environ.get("APPDATA", ""), "Claude", "claude-code", "*", "claude.exe")),
                   key=lambda p: [int(x) if x.isdigit() else x for x in os.path.basename(os.path.dirname(p)).split(".")])
    if not found:
        raise SystemExit("claude.exe not found under %APPDATA%\\Claude\\claude-code\\<version>\\ (is the desktop app installed?)")
    return found[-1]


def queued():
    out = []
    for repo in REPOS:
        try:
            items = json.loads(gh(["issue", "list", "-R", f"{OWNER}/{repo}", "--label", "claude:queued", "--state", "open",
                                   "--json", "number,title,body,comments", "--limit", "20"]))
        except RuntimeError as e:
            print(f"  (skipped {repo}: {e})")
            continue
        for i in items:
            i["repo"] = repo
            out.append(i)
    return out


def submitted_note(issue):
    for c in reversed(issue.get("comments") or []):
        if "Submitted to Claude Code" in (c.get("body") or ""):
            return c["body"].strip()
    return "(no submission comment found)"


def build_prompt(issue, branch):
    return PROMPT.format(repo=issue["repo"], branch=branch, number=issue["number"], title=issue["title"],
                         submitted=submitted_note(issue), body=(issue.get("body") or "")[:40000])


def build_command(exe, prompt, budget):
    return [exe, "-p", prompt, "--permission-mode", "acceptEdits", "--output-format", "text",
            "--max-budget-usd", str(budget), "--allowedTools", *ALLOWED, "--disallowedTools", *DENIED]


def take_lock():
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{os.getpid()} {time.strftime('%Y-%m-%dT%H:%M:%S')}".encode())
        os.close(fd)
        return True
    except FileExistsError:
        return False


def run_one(issue, exe, budget, timeout_min, dry):
    repo, n = issue["repo"], issue["number"]
    branch = f"claude/issue-{repo.split('-')[-1].lower()}-{n}"
    path = os.path.join(WORKTREES, f"{repo}-issue-{n}")
    cmd = build_command(exe, build_prompt(issue, branch), budget)
    print(f"  {repo}#{n}: {issue['title'][:80]}")
    print(f"    worktree {path}  branch {branch}")
    print(f"    command  {cmd[0]} -p <prompt, {len(cmd[2])} chars> " + " ".join(cmd[3:9]) + " ...")
    if dry:
        return
    src = os.path.join(WORKSPACE, repo)
    gh(["issue", "edit", str(n), "-R", f"{OWNER}/{repo}", "--remove-label", "claude:queued", "--add-label", "claude:running"])
    gh(["issue", "comment", str(n), "-R", f"{OWNER}/{repo}", "--body-file", "-"],
       input_text=f"Picked up by the dev-box runner at {time.strftime('%Y-%m-%d %H:%M')}. Worktree `{path}`, branch `{branch}`. "
                  f"Budget cap ${budget}. Nothing will be committed or pushed.")
    ok, report = False, ""
    try:
        subprocess.run(["git", "-C", src, "fetch", "origin", "main"], check=True, capture_output=True, text=True)
        os.makedirs(WORKTREES, exist_ok=True)
        subprocess.run(["git", "-C", src, "worktree", "add", "-b", branch, path, "origin/main"], check=True,
                       capture_output=True, text=True)
        r = subprocess.run(cmd, cwd=path, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout_min * 60)
        report = (r.stdout or "").strip() or (r.stderr or "").strip()
        ok = r.returncode == 0 and "RESULT: failed" not in report
    except subprocess.TimeoutExpired:
        report = f"The session did not finish within {timeout_min} minutes and was stopped."
    except subprocess.CalledProcessError as e:
        report = f"Setup failed: {' '.join(e.cmd[:5])}: {(e.stderr or '').strip()}"
    status = subprocess.run(["git", "-C", path, "status", "--short"], capture_output=True, text=True).stdout if os.path.isdir(path) else ""
    stat = subprocess.run(["git", "-C", path, "diff", "--stat"], capture_output=True, text=True).stdout if os.path.isdir(path) else ""
    body = (f"**Claude Code session {'finished' if ok else 'did not finish'}.**\n\n{report[:50000]}\n\n"
            f"**Worktree** `{path}` (branch `{branch}`, not committed)\n\n```\n{status.strip() or '(no changes)'}\n{stat.strip()}\n```")
    gh(["issue", "comment", str(n), "-R", f"{OWNER}/{repo}", "--body-file", "-"], input_text=body)
    gh(["issue", "edit", str(n), "-R", f"{OWNER}/{repo}", "--remove-label", "claude:running",
        "--add-label", "claude:done" if ok else "claude:failed"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--budget-usd", type=float, default=5.0)
    ap.add_argument("--timeout-min", type=int, default=90)
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not (a.dry_run or a.once):
        raise SystemExit("choose --dry-run or --once")
    exe = claude_exe()
    print(f"claude: {exe}")
    items = queued()
    print(f"queued issues: {len(items)}")
    if not items:
        return
    if not a.dry_run and not take_lock():
        raise SystemExit(f"another runner holds {LOCK}; one session at a time")
    try:
        for issue in items:
            run_one(issue, exe, a.budget_usd, a.timeout_min, a.dry_run)
    finally:
        if not a.dry_run and os.path.exists(LOCK):
            os.remove(LOCK)


def self_test():
    issue = {"repo": "RapidReconciler-DB", "number": 3, "title": "[DAC-81] x", "body": "the body",
             "comments": [{"body": "Submitted to Claude Code from VALC by ops@getgsi.com"}]}
    p = build_prompt(issue, "claude/issue-db-3")
    assert "RapidReconciler-DB#3" in p and "the body" in p and "by ops@getgsi.com" in p and "Do NOT commit" in p
    cmd = build_command("claude.exe", p, 5)
    assert cmd[1] == "-p" and "--max-budget-usd" in cmd and cmd[cmd.index("--permission-mode") + 1] == "acceptEdits"
    denied = cmd[cmd.index("--disallowedTools") + 1:]
    for must in ("Bash(git commit:*)", "Bash(git push:*)", "Bash(gh:*)", "Bash(mvn package:*)"):
        assert must in denied, must
    allowed = cmd[cmd.index("--allowedTools") + 1:cmd.index("--disallowedTools")]
    assert not any(x.startswith("Bash(git commit") or x.startswith("Bash(gh") for x in allowed)
    assert "RapidReconciler-AI" not in REPOS, "the public UI repo must never be read for queued work"
    print("self-test OK")


if __name__ == "__main__":
    main()
