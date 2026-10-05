#!/usr/bin/env python3
"""Merge a bot PR whose checks already passed, retrying when a sibling bot moved main first (HK-34).

Four bot workflows (refresh-ai-grounding, refresh-indices, update-doc-dates,
update-release-notes) each open a PR, wait for its checks, and merge it. They run in
separate concurrency groups, so one push to main can start several at once. Whichever
merges second used to get

    GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)

from `gh pr merge`, exit 1, and leave a green PR open with nothing left to merge it.
Measured on doc-dates run 37042561666 (2026-10-02, PR #720).

This script is the one place those four workflows merge. It only retries THAT refusal.
Before each retry it re-reads the PR and the check-runs on its head sha, and it merges
with --match-head-commit so GitHub refuses if the head moved under it. It stops, exit 1,
without merging, when:

  * the refusal is anything other than "Base branch was modified";
  * the PR is closed, or conflicts with main (HK-20: a conflicted PR stays open, visible);
  * the head sha differs from the one the workflow's own check gate passed;
  * any check-run on that sha is not completed, or completed as anything but
    success / neutral / skipped, or there are none at all;
  * the attempts run out.

Usage (inside a workflow; GH_TOKEN and GITHUB_REPOSITORY come from the job):
    python .github/scripts/merge_bot_pr.py <pr-number> <head-sha-the-gate-passed>

Tests: python .github/scripts/test_merge_bot_pr.py
"""
import json
import os
import subprocess
import sys
import time

BASE_MODIFIED = "Base branch was modified"
GREEN_CONCLUSIONS = {"success", "neutral", "skipped"}
ATTEMPTS = 5
BACKOFF_SECONDS = (15, 30, 60, 120)


def run_gh(argv):
    """Run gh and return (exit code, stdout, stderr). The tests replace this."""
    proc = subprocess.run(["gh", *argv], capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def error(msg):
    print(f"::error::{msg}", flush=True)


def check_verdict(payload):
    """(ok, reason) for a commits/<sha>/check-runs response. Only all-green passes."""
    runs = payload.get("check_runs") or []
    total = payload.get("total_count", len(runs))
    if not runs:
        return False, "no check runs are reported for this sha"
    if total > len(runs):
        return False, f"{total} check runs exist but only {len(runs)} were read"
    for r in runs:
        name = r.get("name", "?")
        if r.get("status") != "completed":
            return False, f"check '{name}' is {r.get('status')}"
        if r.get("conclusion") not in GREEN_CONCLUSIONS:
            return False, f"check '{name}' concluded {r.get('conclusion')}"
    return True, f"{len(runs)} check run(s), all green"


def _read_json(run, argv, what):
    rc, out, err = run(argv)
    if rc != 0:
        raise RuntimeError(f"could not read {what} (gh exit {rc}): {(err or out).strip()}")
    return json.loads(out)


def merge(pr, gated_sha, repo, run=run_gh, sleep=time.sleep,
          attempts=None, backoff=None):
    """Merge `pr` at `gated_sha`. Returns 0 when merged, 1 when it refused to."""
    attempts = ATTEMPTS if attempts is None else attempts
    backoff = BACKOFF_SECONDS if backoff is None else backoff
    pr = str(pr)
    for attempt in range(1, attempts + 1):
        rc, out, err = run(["pr", "merge", pr, "--squash", "--delete-branch",
                            "--match-head-commit", gated_sha])
        if rc == 0:
            print(f"Merged #{pr} at {gated_sha} (attempt {attempt}).", flush=True)
            return 0
        msg = " ".join((err or "").split() + (out or "").split())
        if BASE_MODIFIED not in msg:
            error(f"gh pr merge #{pr} refused (exit {rc}) for a reason this script does not "
                  f"retry: {msg or '<no output>'}. The PR is left open.")
            return 1
        if attempt == attempts:
            break
        wait = backoff[min(attempt - 1, len(backoff) - 1)]
        print(f"Attempt {attempt}: main moved under #{pr} ({BASE_MODIFIED}). "
              f"Re-checking in {wait}s.", flush=True)
        sleep(wait)

        try:
            view = _read_json(run, ["pr", "view", pr, "--json", "state,headRefOid,mergeable"],
                              f"PR #{pr}")
            state, head = view.get("state"), view.get("headRefOid")
            if state == "MERGED":
                print(f"#{pr} is already merged.", flush=True)
                return 0
            if state != "OPEN":
                error(f"#{pr} is {state}, not open. Nothing to merge.")
                return 1
            if view.get("mergeable") == "CONFLICTING":
                error(f"#{pr} now conflicts with main. Left open so the diff shows (HK-20).")
                return 1
            if head != gated_sha:
                error(f"#{pr}'s head moved from {gated_sha} to {head} after its checks passed. "
                      f"Refusing to merge a sha the gate did not see.")
                return 1
            checks = _read_json(run, ["api", f"repos/{repo}/commits/{head}/check-runs?per_page=100"],
                                f"check-runs for {head}")
        except (RuntimeError, ValueError) as e:
            error(f"{e}. The PR is left open.")
            return 1
        ok, why = check_verdict(checks)
        if not ok:
            error(f"#{pr} not merged: {why}. Merging past a check that is not green is not "
                  f"this workflow's call; the PR is left open.")
            return 1
        print(f"{head}: {why}. Retrying the merge.", flush=True)

    error(f"#{pr} still refused with '{BASE_MODIFIED}' after {attempts} attempts. "
          f"The PR is green and left open; merge it by hand after re-checking its head sha.")
    return 1


def main(argv=None, env=None, run=run_gh, sleep=time.sleep):
    argv = sys.argv[1:] if argv is None else argv
    env = os.environ if env is None else env
    if len(argv) != 2 or not argv[0].isdigit() or len(argv[1]) != 40:
        error("usage: merge_bot_pr.py <pr-number> <40-char head sha the check gate passed>")
        return 2
    repo = env.get("GITHUB_REPOSITORY")
    if not repo:
        error("GITHUB_REPOSITORY is not set.")
        return 2
    return merge(argv[0], argv[1], repo, run=run, sleep=sleep)


if __name__ == "__main__":
    sys.exit(main())
