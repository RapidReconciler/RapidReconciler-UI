#!/usr/bin/env python3
"""Tests for merge_bot_pr.merge (HK-34).

The defect: four bot workflows each ran `gh pr merge` once. When a sibling bot merged
first, GitHub answered "Base branch was modified" and the loser exited 1 with its green
PR left open (doc-dates run 37042561666, PR #720). These drive the real merge() against
a scripted gh, using the refusal text copied from that run's log.

The two MutationArm tests swap the fix out and assert the scenario tests would then fail,
so the scenarios are proved to discriminate rather than pass whatever the code does.

Run: python .github/scripts/test_merge_bot_pr.py
"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import merge_bot_pr  # noqa: E402
from merge_bot_pr import merge, main  # noqa: E402

SHA = "9e20797" + "0" * 33
OTHER_SHA = "1234567" + "0" * 33
REPO = "RapidReconciler/RapidReconciler-UI"
# Verbatim from run 37042561666, log line 149.
RACE = "GraphQL: Base branch was modified. Review and try the merge again. (mergePullRequest)\n"


def pr_view(state="OPEN", head=SHA, mergeable="MERGEABLE"):
    return (0, json.dumps({"headRefOid": head, "mergeable": mergeable, "state": state}), "")


def checks(*runs, total=None):
    rs = [{"name": n, "status": s, "conclusion": c} for n, s, c in runs]
    return (0, json.dumps({"total_count": len(rs) if total is None else total,
                           "check_runs": rs}), "")


GREEN = checks(("renderer", "completed", "success"), ("namespace", "completed", "success"),
               ("callsites", "completed", "success"), ("parsecheck", "completed", "success"))
MERGED = (0, "", "")


class FakeGh:
    """Answers each gh sub-command from its own queue and records every call."""

    def __init__(self, merges, views=(), check_runs=()):
        self.queues = {"merge": list(merges), "view": list(views), "api": list(check_runs)}
        self.calls = []

    def __call__(self, argv):
        self.calls.append(list(argv))
        key = "api" if argv[0] == "api" else argv[1]
        if not self.queues[key]:
            raise AssertionError(f"unexpected gh call: {argv}")
        return self.queues[key].pop(0)

    def merge_calls(self):
        return [c for c in self.calls if c[:2] == ["pr", "merge"]]


class Sleeps(list):
    def __call__(self, s):
        self.append(s)


def go(gh, **kw):
    sleeps = Sleeps()
    rc = merge("720", SHA, REPO, run=gh, sleep=sleeps, **kw)
    return rc, sleeps


class MergeTest(unittest.TestCase):

    def test_the_defect_a_lost_race_retries_and_merges(self):
        gh = FakeGh(merges=[(1, "", RACE), MERGED], views=[pr_view()], check_runs=[GREEN])
        rc, sleeps = go(gh)
        self.assertEqual(rc, 0)
        self.assertEqual(len(gh.merge_calls()), 2)
        self.assertEqual(len(sleeps), 1)
        for c in gh.merge_calls():
            self.assertIn("--match-head-commit", c)
            self.assertEqual(c[c.index("--match-head-commit") + 1], SHA)
        self.assertIn(["api", f"repos/{REPO}/commits/{SHA}/check-runs?per_page=100"], gh.calls)

    def test_a_red_check_after_the_race_does_not_merge(self):
        red = checks(("callsites", "completed", "success"), ("parsecheck", "completed", "failure"))
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view()], check_runs=[red])
        rc, _ = go(gh)
        self.assertEqual(rc, 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_a_pending_check_does_not_merge(self):
        pending = checks(("callsites", "completed", "success"), ("parsecheck", "in_progress", None))
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view()], check_runs=[pending])
        self.assertEqual(go(gh)[0], 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_zero_check_runs_does_not_merge(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view()], check_runs=[checks()])
        self.assertEqual(go(gh)[0], 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_more_runs_than_were_read_does_not_merge(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view()],
                    check_runs=[checks(("callsites", "completed", "success"), total=101)])
        self.assertEqual(go(gh)[0], 1)

    def test_cancelled_and_timed_out_are_not_green(self):
        for bad in ("cancelled", "timed_out", "action_required", "stale", None):
            gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view()],
                        check_runs=[checks(("callsites", "completed", bad))])
            self.assertEqual(go(gh)[0], 1, bad)

    def test_neutral_and_skipped_count_as_green(self):
        ok = checks(("a", "completed", "success"), ("b", "completed", "neutral"),
                    ("c", "completed", "skipped"))
        gh = FakeGh(merges=[(1, "", RACE), MERGED], views=[pr_view()], check_runs=[ok])
        self.assertEqual(go(gh)[0], 0)

    def test_a_moved_head_does_not_merge(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view(head=OTHER_SHA)])
        self.assertEqual(go(gh)[0], 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_a_conflicted_pr_stops_hk20(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view(mergeable="CONFLICTING")])
        self.assertEqual(go(gh)[0], 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_a_closed_pr_stops(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view(state="CLOSED")])
        self.assertEqual(go(gh)[0], 1)

    def test_already_merged_by_someone_else_is_success(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[pr_view(state="MERGED")])
        self.assertEqual(go(gh)[0], 0)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_any_other_refusal_fails_loudly_without_retrying(self):
        for err in ("GraphQL: Head branch was modified. Review and try the merge again.\n",
                    "Pull request #720 is not mergeable: the merge commit cannot be cleanly created.\n",
                    "HTTP 401: Bad credentials\n", ""):
            gh = FakeGh(merges=[(1, "", err)])
            rc, sleeps = go(gh)
            self.assertEqual(rc, 1, err)
            self.assertEqual(len(gh.merge_calls()), 1, err)
            self.assertEqual(sleeps, [], err)

    def test_attempts_are_bounded_and_back_off(self):
        n = merge_bot_pr.ATTEMPTS
        gh = FakeGh(merges=[(1, "", RACE)] * n, views=[pr_view()] * (n - 1),
                    check_runs=[GREEN] * (n - 1))
        rc, sleeps = go(gh)
        self.assertEqual(rc, 1)
        self.assertEqual(len(gh.merge_calls()), n)
        self.assertEqual(len(sleeps), n - 1)
        self.assertEqual(sleeps, sorted(sleeps))
        self.assertGreater(sleeps[-1], sleeps[0])

    def test_a_failed_reread_does_not_merge(self):
        gh = FakeGh(merges=[(1, "", RACE)], views=[(1, "", "HTTP 502\n")])
        self.assertEqual(go(gh)[0], 1)
        self.assertEqual(len(gh.merge_calls()), 1)

    def test_first_try_success_reads_nothing_and_sleeps_never(self):
        gh = FakeGh(merges=[MERGED])
        rc, sleeps = go(gh)
        self.assertEqual(rc, 0)
        self.assertEqual(gh.calls, [["pr", "merge", "720", "--squash", "--delete-branch",
                                     "--match-head-commit", SHA]])
        self.assertEqual(sleeps, [])

    def test_main_validates_arguments_and_needs_the_repo(self):
        gh = FakeGh(merges=[MERGED])
        self.assertEqual(main(["720", SHA], env={}, run=gh), 2)
        self.assertEqual(main(["720", "abc"], env={"GITHUB_REPOSITORY": REPO}, run=gh), 2)
        self.assertEqual(main(["#720", SHA], env={"GITHUB_REPOSITORY": REPO}, run=gh), 2)
        self.assertEqual(gh.calls, [])
        self.assertEqual(main(["720", SHA], env={"GITHUB_REPOSITORY": REPO}, run=gh), 0)


class MutationArmTest(unittest.TestCase):
    """Each arm restores the defect it names and requires a scenario above to catch it."""

    def run_scenario(self, name):
        result = unittest.TestResult()
        MergeTest(name).run(result)
        return result.wasSuccessful()

    def test_arm_no_retry_the_pre_hk34_single_merge_is_caught(self):
        # Before HK-34 each workflow merged exactly once.
        with mock.patch.object(merge_bot_pr, "ATTEMPTS", 1):
            self.assertFalse(self.run_scenario("test_the_defect_a_lost_race_retries_and_merges"))
        self.assertTrue(self.run_scenario("test_the_defect_a_lost_race_retries_and_merges"))

    def test_arm_gate_removed_merges_past_red_and_is_caught(self):
        with mock.patch.object(merge_bot_pr, "check_verdict", lambda payload: (True, "mutated")):
            self.assertFalse(self.run_scenario("test_a_red_check_after_the_race_does_not_merge"))
            self.assertFalse(self.run_scenario("test_a_pending_check_does_not_merge"))
        self.assertTrue(self.run_scenario("test_a_red_check_after_the_race_does_not_merge"))

    def test_arm_retry_on_every_error_is_caught(self):
        with mock.patch.object(merge_bot_pr, "BASE_MODIFIED", ""):
            self.assertFalse(self.run_scenario("test_any_other_refusal_fails_loudly_without_retrying"))
        self.assertTrue(self.run_scenario("test_any_other_refusal_fails_loudly_without_retrying"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
