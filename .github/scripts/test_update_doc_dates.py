#!/usr/bin/env python3
"""Tests for update_doc_dates.py and the staging line in update-doc-dates.yml (HK-45).

The script globbed `Path(d).glob("*.html")` per directory and the workflow staged
`GSIRRTech/*.html`, so neither reached `GSIRRTech/install-scenarios/`: sixteen
pages kept the date they were first stamped with whatever changed. These build
throwaway git repos shaped like this one (one doc per directory in DIRS, plus one
a level down) and drive the two halves separately, so each defect fails on its own:

  * StampTest runs the REAL script in the fixture, the way the workflow does.
  * StageTest edits the fixture's docs by hand, then runs the REAL `git add` line
    read out of the yml, in bash, and reads back what was staged.
  * EndToEndTest runs both in order: whatever the script rewrote, the workflow
    must commit.

Run: python .github/scripts/test_update_doc_dates.py  (check-bot-merge.yml runs it)
"""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE / "update_doc_dates.py"
WORKFLOW = HERE.parent / "workflows" / "update-doc-dates.yml"

sys.path.insert(0, str(HERE))
from update_doc_dates import DIRS  # noqa: E402

STALE = '<span class="doc-last-updated">Last updated <time datetime="2026-05-01">May 1, 2026</time></span>'
COMMIT_DATE = "2026-09-01T12:00:00+00:00"
STAMPED = 'datetime="2026-09-01">September 1, 2026</time>'

NESTED = "GSIRRTech/install-scenarios/scenario-nested.html"
TOP = "GSIRRTech/top-level.html"


def doc(title: str) -> str:
    return (
        "<!doctype html><html><head><title>" + title + "</title></head>"
        '<body data-doc-type="runbook"><header class="doc-header" data-doc-chrome>'
        + STALE + "</header><p>" + title + "</p></body></html>\n"
    )


def git(repo: Path, *args: str) -> str:
    env = dict(os.environ, GIT_AUTHOR_DATE=COMMIT_DATE, GIT_COMMITTER_DATE=COMMIT_DATE)
    out = subprocess.run(["git", *args], cwd=repo, env=env, capture_output=True, text=True)
    if out.returncode != 0:
        raise AssertionError(f"git {' '.join(args)} failed: {out.stderr}")
    return out.stdout


def make_repo(root: Path) -> Path:
    repo = root / "repo"
    repo.mkdir()
    git(repo, "init", "-q")
    git(repo, "config", "user.name", "test")
    git(repo, "config", "user.email", "test@example.invalid")
    git(repo, "config", "core.autocrlf", "false")
    files = [NESTED, TOP] + [
        f"{d}/scenario-doc.html" if d == "Scenarios" else f"{d}/doc.html"
        for d in DIRS if d != "GSIRRTech"
    ]
    for rel in files:
        p = repo / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(doc(rel), encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "fixture")
    return repo


def run_script(repo: Path) -> subprocess.CompletedProcess:
    # The way the workflow runs it: from the repo root, as a script.
    return subprocess.run([sys.executable, str(SCRIPT)], cwd=repo, capture_output=True, text=True)


def staging_command() -> str:
    """The workflow's `git add` line, backslash continuations joined, exactly as written."""
    lines = WORKFLOW.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if line.strip().startswith("git add "):
            parts = [line.strip()]
            while parts[-1].endswith("\\"):
                parts[-1] = parts[-1][:-1]
                i += 1
                parts.append(lines[i].strip())
            return " ".join(parts)
    raise AssertionError("no `git add` line found in update-doc-dates.yml")


def run_staging(repo: Path) -> subprocess.CompletedProcess:
    # The workflow step's shell is bash (no globstar), so the line runs in bash
    # here too: a shell glob and a git pathspec expand differently.
    bash = shutil.which("bash")
    if not bash:
        raise AssertionError("bash not found; the workflow's staging line runs in bash")
    return subprocess.run([bash, "-c", staging_command()], cwd=repo, capture_output=True, text=True)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="hk45-"))
        self.repo = make_repo(self.tmp)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def read(self, rel: str) -> str:
        return (self.repo / rel).read_text(encoding="utf-8")

    def staged(self) -> set:
        return set(git(self.repo, "diff", "--staged", "--name-only").split())


class StampTest(Fixture):

    def test_control_a_top_level_doc_is_stamped(self):
        # If this fails too, the fixture or the run is broken, not the subfolder walk.
        out = run_script(self.repo)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn(STAMPED, self.read(TOP))

    def test_the_defect_a_doc_one_level_down_is_stamped(self):
        out = run_script(self.repo)
        self.assertEqual(out.returncode, 0, out.stdout + out.stderr)
        self.assertIn(STAMPED, self.read(NESTED),
                      "update_doc_dates.py did not descend into GSIRRTech/install-scenarios/")

    def test_a_second_run_is_a_no_op(self):
        # Over current dates the bot's PR must stay empty.
        run_script(self.repo)
        again = run_script(self.repo)
        self.assertEqual(again.returncode, 0, again.stdout + again.stderr)
        self.assertIn("No date changes needed.", again.stdout)


class StageTest(Fixture):

    def touch_all(self):
        for p in self.repo.rglob("*.html"):
            p.write_text(p.read_text(encoding="utf-8") + "<!-- edited -->\n", encoding="utf-8")

    def test_control_a_top_level_doc_is_staged(self):
        self.touch_all()
        out = run_staging(self.repo)
        self.assertIn(TOP, self.staged(), out.stderr)

    def test_the_defect_a_doc_one_level_down_is_staged(self):
        self.touch_all()
        out = run_staging(self.repo)
        self.assertIn(NESTED, self.staged(),
                      "the workflow's `git add` line does not stage GSIRRTech/install-scenarios/"
                      + (f" (stderr: {out.stderr.strip()})" if out.stderr.strip() else ""))

    def test_the_staging_line_does_not_fail(self):
        # One pathspec that matches nothing makes `git add` stage NOTHING, and the
        # old line hid that behind `2>/dev/null || true`: a green run, no commit.
        self.touch_all()
        out = run_staging(self.repo)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stderr.strip(), "")


class EndToEndTest(Fixture):

    def test_every_stamped_file_is_staged(self):
        # The guard's three-copies rule, tested by behaviour: nothing the script
        # rewrote may be left modified and unstaged.
        run_script(self.repo)
        run_staging(self.repo)
        unstaged = git(self.repo, "diff", "--name-only").split()
        self.assertEqual(unstaged, [], "stamped but never staged: " + ", ".join(unstaged))
        self.assertIn(NESTED, self.staged())


if __name__ == "__main__":
    unittest.main(verbosity=2)
