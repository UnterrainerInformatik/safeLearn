---
name: flaky-content-checks
description: Browser checks that failed by timing - fixed 2026-11-11 and again 2026-11-18 (stabilize-exam-suite-checks); a red check is evidence, read test/.evidence first. History of what each "flaky" one really was
metadata:
  type: project
---

Since 2026-11-11 (change `stabilize-flaky-browser-checks`) no known flaky browser check is left. Success criterion met that day: three `test/exam.test.js` runs in a row 189/189, the content suite 219/219, the full `npm test` green, no repeated test.

**Why:** a red browser check is evidence against the working tree again. Re-running, or comparing against HEAD via `git stash push -u`, is no longer the default reaction.
**How to apply:** if a check goes red, investigate it. If it really is timing, fix it with the rules in `docs-testing.md` ("Clicks and late state"): `click(page, selector)` from the harness instead of `page.click`, `eventually(...)` before asserting on late state, `whenStill(...)` before measuring layout. The guard `test/check-conventions.test.js` refuses a direct `page.click(` / `frame.click(`. Only once it is understood, add a new entry here with its cause. See [[browser-verification]], [[test-runs-targeted-first]].

**2026-11-18 (change `stabilize-exam-suite-checks`):** the suite was red again in some runs. A failed browser check now leaves evidence in `test/.evidence/<file>/<check>/` (URL, screenshot, DOM, console errors per page, failure with causes): **read it before re-running.** Every navigation goes through the harness's `openPage(session, path, readySelector)` (waits until shown and still); `check-conventions` refuses `page.goto(`. Every describe of `test/exam.test.js` runs alone (`examFixture` finds or creates year, 9XGB/GB, the two pool questions). Acceptance: three `exam.test.js` runs 192/192. What the red checks were:

- **`net::ERR_NETWORK_CHANGED`** (a whole describe cancelled at login): **environment**. Another project's Docker containers were being recreated every 20–40 s; each start/stop changes a network interface and Chrome aborts requests in flight. Not a finding — do not touch containers during a run.
- **Question editor "Title is missing" → 422, navigation timeout**: `page.type` right after `waitForSelector` without `visible`, while the body was still served hidden. Typing into a hidden body loses every character silently. Fixed by waiting for visible (also after every click-started navigation).
- **Review link and gradebook column header "could not click within 10000 ms"** while present and visible in the screenshot: page opened via `goto` + in-DOM wait. Not reproduced afterwards (not even under full CPU load); mitigated by `openPage`. `click` failures now print the element's box over two frames, what is on top, viewport, scroll, fullscreen — if it comes back, that says which cause. Known trap: while another page of the same browser context is in front, the session page is `hidden` and `requestAnimationFrame` stops, so the Locator's stability wait hangs; close extra pages in `finally`.
- Not a regression: `exam-attempt-review` is fine, the check was the problem.

What the former entries turned out to be:

- **Click race (most of them)**: module bar, "the buttons to the pool…", "a new course is created from the bar…", the offline/attendance checks (`Node is detached from document`, `not clickable`). `page.click` resolved a node that the client script replaced or had not laid out yet. Fixed by the Locator-based `click` helper (187 calls switched over, the retry loop around the tree menu removed).
- **Reload backoff** (`deployment-surface.js`, two extra early `/hot-reload` attempts): an **application bug** in `obsidian.js`. `pageshow` fires on the first load too, and if the stream had already been refused (`es` null, retry pending) it reconnected at once, skipping the first backoff step. Now only a bfcache restore (`event.persisted`) reconnects.
- **390px viewport** (`legibility.js`, `scrollWidth 497`): measured while diagrams and images were still being laid out after the reveal. It now waits for the page to fit (a real overflow does not go away).
- **"the Exams page hides the student's results…"**: read `offsetParent` while the page was still served hidden. It now waits for the state, then asserts.
- **Sheet sticky columns**: measured before the layout had settled after the resize or scroll. It now waits for still values (`whenStill`).
- **Drag ghost** (`.sl-exam-drag-ghost`, 5 s): `pointAt` scrolled the row to the middle and measured at once while the pool's list and filters were still loading and shifting the page, so the press missed the row. It now measures once the row holds still.
- Earlier, already fixed before 2026-11-11: live-view order and handout-from-its-page (wrong checks), `setPreferences` vt lost update (application bug in `setUserAttribute`), offline `opens_at < closes_at` (same-millisecond collision in the tests), the missing starter-archive fixture (`*.zip` in `.gitignore`).
