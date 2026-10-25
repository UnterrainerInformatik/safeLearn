---
name: flaky-content-checks
description: Checks that fail by timing, also on an unchanged tree - content suite (reload backoff, 390px viewport) and several exam harness checks
metadata:
  type: project
---

Measured 2026-10-17 while building exam-module P0, across seven full `test/content.test.js` runs:

- `deployment-surface.js` "a page whose reload stream is refused retries with a growing delay" failed on the **unchanged HEAD** too (1 of 2 runs). Pattern of a failure: gaps `~200 ms, ~90 ms, 2003 ms, 4003 ms`, so two extra `/hot-reload` attempts right at the start; the doubling afterwards is intact.
- `legibility.js` "a narrow viewport gets the layout written for it…" reported `scrollWidth 497` instead of 390 in some runs and passed in others with the same page; measured slightly later it is 390. Timing of the layout right after reveal, not a real overflow.

- 2026-10-18 (exam-ui-consistency phase 1): the reload-backoff check failed **3 of 3** runs, once on HEAD with the working tree stashed (same gap pattern). So on some days it is reproducible, not just occasional; a HEAD comparison via `git stash` is enough.

- 2026-10-20 (exam-questions-follow-pool): `test/exam.test.js` run alone gives 145/146 with the one failure moving between checks: "the Exams page hides the student's results while they write…" (also red on unchanged HEAD in a worktree), "the sheet: the left four columns keep their place…" and "New question is offered with all categories shown…" (red on HEAD). Not reproducible per check.

- 2026-10-20 (publishing-without-keycloak): in the full `npm test` the exam check "the buttons to the pool and the online tests are on every teacher page…" failed once with `Node is either not clickable or not an Element`; `test/exam.test.js` run alone right after it passed it (145/146, only the known Exams-page check red).

- 2026-10-25 (gradebook-presentations-projects): `test/exam.test.js` "the live view orders by status, then by time out of focus…" (2000 ms wait) and "started from its page, a present student sees their handout…" (`.sl-exam-handout-link` for sitting 21, 20 s) failed in **3 of 3** full runs, once on HEAD with the tree stashed. Reproducible on that day, not caused by the gradebook change. The live-view suite cannot be run alone with `--test-name-pattern` (its tests are all cancelled), so compare via a full `test/exam.test.js` run.

**Why:** a red run with only these two is not evidence against a change.
**How to apply:** if only these fail, re-run the content suite once before investigating; if one fails reproducibly, compare against HEAD in a `git worktree` (symlink `node_modules`, copy `keycloak.json` and `.env`) before blaming the change. See [[browser-verification]].
