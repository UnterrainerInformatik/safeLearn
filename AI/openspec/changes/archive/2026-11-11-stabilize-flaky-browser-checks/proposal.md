Source: AI/open-proposals.md, entry **Wackelige Browser-Checks stabil machen statt wiederholen** (category Testing).

## Why

Browser checks fail by timing, also on an unchanged tree: on 2026-11-11 `test/exam.test.js` was red in 3 of 4 runs on HEAD, each time with a different check. Today the answer is a list of known flaky checks (memory `flaky-content-checks`), re-runs and HEAD comparisons via `git stash push -u`. That costs a quarter of an hour per change and hides real failures: the same day a module-bar failure was first blamed on the change under work.

Of the 11 real failures of that day, 8 were the same click race in Puppeteer (`Node is either not clickable or not an Element`, `Node is detached from document`): the check resolves an element while the client JS redraws the bar or table after loading, and clicks one that has just been replaced or has no position yet. The other 3 were assertions that measured or read a state before it had settled.

## What Changes

- **Clicks wait for an actionable element.** Every click a browser check performs goes through one harness helper that waits until the element is attached, visible and no longer moving, and retries if the element is replaced in between. It is built on Puppeteer's Locator API (`page.locator(sel).click()`); Puppeteer 25 is already the installed version. All `page.click(selector)` calls (187 in `test/exam.test.js`, `test/checks/*.js`, `test/harness.js`) and the handle clicks that can race (`.click()` on a handle looked up right before) move to it. Clicks that trigger a navigation keep their `Promise.all` with `waitForNavigation`.
- **The ad-hoc retry loop** around the tree menu (`test/exam.test.js:5020ff`, retries on `not clickable`) is replaced by the helper.
- **Timing assertions wait for their condition.** The three known ones ("the results are shown while no test is written" `:2445`, the sticky columns of the sheet `:991`, "and the group is as it was" `:4273`) and any others found on the way wait with `waitForFunction` for the state they assert, with a bounded timeout, and then assert on it, instead of reading it once.
- **The remaining entries of `flaky-content-checks`** are looked at one by one: the reload backoff in `deployment-surface.js`, the 390px viewport in `legibility.js`, the drag ghost at `exam.test.js:5033`, "the Exams page hides the student's results…". Each is either fixed in this change or, if its cause lies elsewhere, written down with its cause in the memory.
- **A guard against regression:** a static check fails when a browser check calls `page.click(` or `frame.click(` directly instead of the helper.
- After the success criterion is met, the fixed entries are removed from the memory `flaky-content-checks`.

Not part of this change: parallelisation of the suite and isolation of the shared demo accounts.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `browser-verification`: adds a requirement that a browser check's outcome does not depend on the rendering timing of the page it drives (actions wait for an actionable element, assertions on settling state wait for the state), and that a red check is therefore evidence against the change.

## Impact

- `test/harness.js`: new click helper (and possibly a small `settled` / wait helper for assertions).
- `test/exam.test.js`, `test/checks/*.js`: mechanical replacement of click calls; individual fixes to the timing assertions.
- `test/` static check (new, or an extension of an existing coverage/convention test) that refuses direct `page.click(`.
- No application code changes are planned. If a failure turns out to be an application bug (as happened twice before), it is fixed in the application and noted in the design.
- Memory `flaky-content-checks`; `docs-testing.md` gets a short note on the click helper for authors of new checks.
- Run time: Locator clicks wait at most until the element is ready, so the suite should not get slower; if it does measurably, the design says so.
