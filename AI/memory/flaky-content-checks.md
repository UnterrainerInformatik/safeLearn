---
name: flaky-content-checks
description: Two content-suite checks fail by timing, also on an unchanged tree - deployment-surface's reload backoff and legibility's 390px viewport
metadata:
  type: project
---

Measured 2026-10-17 while building exam-module P0, across seven full `test/content.test.js` runs:

- `deployment-surface.js` "a page whose reload stream is refused retries with a growing delay" failed on the **unchanged HEAD** too (1 of 2 runs). Pattern of a failure: gaps `~200 ms, ~90 ms, 2003 ms, 4003 ms`, so two extra `/hot-reload` attempts right at the start; the doubling afterwards is intact.
- `legibility.js` "a narrow viewport gets the layout written for it…" reported `scrollWidth 497` instead of 390 in some runs and passed in others with the same page; measured slightly later it is 390. Timing of the layout right after reveal, not a real overflow.

- 2026-10-18 (exam-ui-consistency phase 1): the reload-backoff check failed **3 of 3** runs, once on HEAD with the working tree stashed (same gap pattern). So on some days it is reproducible, not just occasional; a HEAD comparison via `git stash` is enough.

**Why:** a red run with only these two is not evidence against a change.
**How to apply:** if only these fail, re-run the content suite once before investigating; if one fails reproducibly, compare against HEAD in a `git worktree` (symlink `node_modules`, copy `keycloak.json` and `.env`) before blaming the change. See [[browser-verification]].
