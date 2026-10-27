#!/usr/bin/env python3
"""Tests for update_release_notes.render_paragraphs (UI-208).

The renderer used to join every line of a paragraph with spaces, so the house style's
one-bullet-per-change note published as "<p>- a - b</p>": 4 of the 10 entries on the page
were run-ons and none contained <li>. These drive the real function on the trailer text a
commit carries. Run: python .github/scripts/test_update_release_notes.py
"""
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_release_notes  # noqa: E402
from update_release_notes import render_paragraphs  # noqa: E402

PAGE = ("<html><body>\n<main>\n  <!-- RELEASE_NOTES_INSERTION_POINT -->\n\n"
        '  <article class="rn-entry" data-sha="0000000">old</article>\n</main>\n</body></html>\n')


class RangeTest(unittest.TestCase):
    """HK-48 (2026-10-26). UI #874, #875 and #876 merged within a minute. The workflow's concurrency group keeps
    one PENDING run, so #876's run cancelled #875's, and #876's run walked only github.event.before..github.sha,
    its own push: #875's Release-Note never published (recovered by hand, run 40411334211). These drive the real
    main() against a throwaway git repository."""

    def setUp(self):
        self.old_cwd = os.getcwd()
        self.dir = tempfile.mkdtemp(prefix="rn-test-")
        os.chdir(self.dir)
        for args in (["init", "-q"], ["config", "user.email", "t@example.test"], ["config", "user.name", "t"],
                     ["config", "commit.gpgsign", "false"]):
            self.git(*args)
        with open("release-notes.html", "w", encoding="utf-8") as f:
            f.write(PAGE)
        self.git("add", "-A"); self.git("commit", "-q", "-m", "chore: the page")
        self.base = self.head()
        self.shas = {}
        for name in ("A", "B", "C"):
            with open(name + ".txt", "w") as f:
                f.write(name)
            self.git("add", name + ".txt")
            self.git("commit", "-q", "-m", "Change " + name + "\n\nRelease-Note: Note " + name + ".")
            self.shas[name] = self.head()

    def tearDown(self):
        os.chdir(self.old_cwd)
        shutil.rmtree(self.dir, ignore_errors=True)

    def git(self, *args):
        return subprocess.run(["git"] + list(args), capture_output=True, text=True, check=True).stdout

    def head(self):
        return self.git("rev-parse", "HEAD").strip()

    def run_main(self, before, after):
        with contextlib.redirect_stdout(io.StringIO()):
            update_release_notes.main(before, after)

    def page(self):
        with open("release-notes.html", encoding="utf-8") as f:
            return f.read()

    def count(self, name):
        return self.page().count('data-sha="%s"' % self.shas[name][:7])

    def test_the_defect_a_cancelled_middle_run_is_recovered_by_the_next(self):
        self.run_main(self.base, self.shas["A"])           # A's run publishes A
        self.run_main(self.shas["B"], self.shas["C"])      # B's run was cancelled; C's run walks only B..C
        self.assertEqual((self.count("A"), self.count("B"), self.count("C")), (1, 1, 1),
                         "B's note must be published by C's run")
        page = self.page()
        self.assertLess(page.index("Note C."), page.index("Note B."), "newest first: C above B")
        self.assertLess(page.index("Note B."), page.index("Note A."))

    def test_a_rerun_publishes_nothing_twice(self):
        self.run_main(self.base, self.shas["A"])
        self.run_main(self.shas["B"], self.shas["C"])
        self.run_main(self.shas["B"], self.shas["C"])      # the same push re-run (gh run rerun)
        self.run_main(self.base, self.shas["C"])           # or a wide manual range
        self.assertEqual((self.count("A"), self.count("B"), self.count("C")), (1, 1, 1))

    def test_control_the_first_run_on_a_page_with_no_marker_uses_the_events_range(self):
        self.run_main(self.shas["A"], self.shas["B"])
        self.assertEqual((self.count("A"), self.count("B")), (0, 1), "no marker yet: exactly before..after")

    def test_an_explicit_since_wins_over_the_marker(self):
        self.run_main(self.base, self.shas["A"])
        os.environ["RELEASE_NOTES_SINCE_EXPLICIT"] = "1"
        try:
            self.run_main(self.shas["B"], self.shas["C"])
        finally:
            del os.environ["RELEASE_NOTES_SINCE_EXPLICIT"]
        self.assertEqual((self.count("B"), self.count("C")), (0, 1), "workflow_dispatch's since is honoured as given")

    def test_a_marker_not_on_this_history_falls_back_to_the_events_range(self):
        self.run_main(self.base, self.shas["A"])
        page = self.page()
        bogus = "f" * 40
        page = update_release_notes.THROUGH_RE.sub(update_release_notes.through_comment(bogus), page)
        with open("release-notes.html", "w", encoding="utf-8") as f:
            f.write(page)
        self.run_main(self.shas["B"], self.shas["C"])
        self.assertEqual((self.count("B"), self.count("C")), (0, 1), "an unknown marker is ignored, not trusted")


class RenderParagraphsTest(unittest.TestCase):

    def test_the_defect_two_bullets_become_two_list_items(self):
        out = render_paragraphs("- First change.\n- Second change.")
        self.assertIn("<li>First change.</li>", out)
        self.assertIn("<li>Second change.</li>", out)
        self.assertNotIn("<p>- ", out)
        self.assertEqual(out.count("<ul>"), 1)

    def test_a_wrapped_bullet_continues_the_same_item(self):
        out = render_paragraphs("- A bullet that wraps\n  onto a second line.\n- Next.")
        self.assertIn("<li>A bullet that wraps onto a second line.</li>", out)
        self.assertIn("<li>Next.</li>", out)
        self.assertEqual(out.count("<li>"), 2)

    def test_a_lead_line_stays_a_paragraph_above_the_list(self):
        out = render_paragraphs("What changed:\n- One.\n- Two.")
        self.assertLess(out.index("<p>What changed:</p>"), out.index("<ul>"))
        self.assertEqual(out.count("<li>"), 2)

    def test_control_prose_is_unchanged(self):
        # The pre-UI-208 behaviour for prose: lines join, blank lines split paragraphs.
        out = render_paragraphs("One line\nwrapped.\n\nSecond paragraph.")
        self.assertEqual(out, "      <p>One line wrapped.</p>\n      <p>Second paragraph.</p>")
        self.assertNotIn("<ul>", out)

    def test_text_is_escaped_in_list_items(self):
        out = render_paragraphs("- Uses <b> & \"quotes\".")
        self.assertIn("<li>Uses &lt;b&gt; &amp; &quot;quotes&quot;.</li>", out)

    def test_a_hyphen_inside_a_line_is_not_a_bullet(self):
        out = render_paragraphs("Re-run the check - it is quick.")
        self.assertNotIn("<li>", out)
        self.assertIn("<p>Re-run the check - it is quick.</p>", out)

    def test_a_bare_dash_is_not_an_item_and_is_not_glued_on(self):
        out = render_paragraphs("- Real.\n- ")
        self.assertEqual(out.count("<li>"), 1)
        self.assertIn("<li>Real.</li>", out)

    def test_a_dash_word_is_not_a_bullet(self):
        out = render_paragraphs("- Item.\n-Xmx stays text")
        self.assertIn("<li>Item. -Xmx stays text</li>", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
