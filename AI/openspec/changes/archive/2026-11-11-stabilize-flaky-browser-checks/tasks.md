## 1. Click helper

- [x] 1.1 Add `click(target, selector, { timeout })` to `test/harness.js` on top of `target.locator(selector).click()` (page or frame), with a 10 s default and a failure message naming selector and URL; verify with a small check that clicks a button the page replaces 100 ms after load and passes
- [x] 1.2 Verify the helper's failure path: a selector that never appears fails within its timeout with the selector in the message (same check, expected rejection)

## 2. Replace the clicks

- [x] 2.1 Replace every `page.click(selector)` / `frame.click(selector)` in `test/exam.test.js`, `test/checks/*.js` and `test/harness.js` with the helper by script, keeping `Promise.all` with `waitForNavigation`; verify `grep -n "page.click(" test` finds none and the diff is one-to-one
- [x] 2.2 Convert handle clicks on elements looked up just before (`(await x.$(...)).click()`, `button.click()` in `exam.test.js:493/497/1961/4759`, `search-keyboard.js:780/804`, `session-lifecycle.js`, `navigation.js:118`) to the helper or to a stable locator, per design decision 2; leave `evaluate`-side `element.click()` untouched; verify by reading the diff
- [x] 2.3 Remove the hand-written retry loop around the tree menu (`test/exam.test.js:5020ff`) in favour of the helper; verify the tree drag checks pass in `node --test test/exam.test.js`
- [x] 2.4 Add the static guard (unit test) that fails on a direct `page.click(` / `frame.click(` in browser checks, naming file and line; verify it fails on a deliberately inserted call and passes without it, and that it runs in `npm run test:unit`

## 3. Timing assertions

- [x] 3.1 "the results are shown while no test is written" (`exam.test.js:2445`): wait for the results section's state, then assert; verify the writing suite passes
- [x] 3.2 Sheet sticky columns (`exam.test.js:991`): wait until the sticky lefts are stable after the scroll, then measure; verify the sheet check passes
- [x] 3.3 "and the group is as it was" (`exam.test.js:4273`): re-check after 2.1; add a wait only if it still fails on its own; verify the attendance check passes
- [x] 3.4 Fix any further timing assertion found while running `test/exam.test.js` repeatedly in the same way; note each in the memory update (5.2)

## 4. Remaining entries of `flaky-content-checks`

- [x] 4.1 Reload backoff (`test/checks/deployment-surface.js`, two extra `/hot-reload` attempts at start): find the cause, fix check or application; verify the check passes in `test/content.test.js` with the module selected
- [x] 4.2 390px viewport (`test/checks/legibility.js`, `scrollWidth 497`): wait for the layout to settle before measuring, or fix a real overflow; verify with the module selected
- [x] 4.3 Drag ghost (`exam.test.js:5033`, `.sl-exam-drag-ghost` 5 s): find the cause and fix; verify the tree drag checks pass
- [x] 4.4 "the Exams page hides the student's results…": find the cause and fix; verify the writing suite passes

## 5. Success criterion and records

- [x] 5.1 Run `node --test test/exam.test.js` three times in a row and `test/content.test.js` once: all green without a repeated test; then one full `npm test`, green
- [x] 5.2 Update memory `flaky-content-checks`: remove the fixed entries; rewrite any remaining one with its found cause
- [x] 5.3 Add a short note to `docs-testing.md` (harness table) on the click helper and the wait-then-assert rule for new checks; verify the doc names the helper and the guard
