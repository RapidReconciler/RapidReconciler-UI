#!/usr/bin/env python3
"""Tests for update_release_notes.render_paragraphs (UI-208).

The renderer used to join every line of a paragraph with spaces, so the house style's
one-bullet-per-change note published as "<p>- a - b</p>": 4 of the 10 entries on the page
were run-ons and none contained <li>. These drive the real function on the trailer text a
commit carries. Run: python .github/scripts/test_update_release_notes.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from update_release_notes import render_paragraphs  # noqa: E402


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
