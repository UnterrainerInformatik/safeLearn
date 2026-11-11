## Context

See proposal.md - Why. The browser checks live in `test/exam.test.js` (170 `page.click(`), `test/checks/*.js` (17) and `test/harness.js`; none uses `page.locator(...)`. Puppeteer is `^25.7.0`, which has the Locator API. There is one hand-written retry already (`test/exam.test.js:5020ff`, three tries on `not clickable`, 200 ms apart), which shows the race is known and was patched locally.

Around 28 clicks sit in `Promise.all([page.waitForNavigation(...), page.click(sel)])`. Some checks click handles they looked up themselves (`button.click()`, `(await row.$(...)).click()`), and a few click from inside `evaluate` (`element.click()` in the page), which is synchronous in the DOM and does not race.

Earlier "flaky" entries turned out twice to be wrong checks and twice to be application bugs (memory `flaky-content-checks`, 2026-11-08 to 2026-11-10). So each remaining entry is investigated, not only made to wait.

## Goals / Non-Goals

**Goals:**
- One way to click in a browser check, which waits for an actionable element and survives a redraw.
- Timing assertions wait for their condition instead of sampling once.
- A static guard so new checks do not reintroduce `page.click(selector)`.

**Non-Goals:**
- Raising timeouts across the board. A longer timeout only hides the race.
- Changing how sessions, accounts or the server are set up (`openSession`, `sharedSession`).
- Converting `evaluate`-side clicks (`element.click()` inside the page); they do not race.

## Decisions

**1. A harness helper `click(page, selector, options)` on top of `page.locator(selector).click()`.**
The Locator waits for the element to be attached, visible, enabled and stable (same bounding box over two animation frames) and re-resolves the selector if the element is detached before the click. The helper adds a default timeout (10 s, overridable) and a failure message naming the selector and the page URL, so a real failure is readable. It works for frames too (`frame.locator`).
*Alternative:* a generic retry wrapper around `page.click` (like the existing loop at `:5020`). Rejected: it retries on error messages, retries blindly by time, and still clicks an element that is in the DOM but moving.
*Alternative:* call `page.locator(...).click()` inline everywhere. Rejected: no common timeout and message, and the static guard would have to allow two spellings.

**2. Handle clicks become selector clicks where the handle was looked up just before.**
`(await row.$(".x")).click()` becomes `click(page, \`${rowSelector} .x\`)`. Where a check genuinely iterates handles (e.g. the search entries), the helper accepts a Locator built from the handle's own selector, or the check keeps the handle and waits for stability first via `handle.isVisible()` plus a locator on a unique attribute. Decided per site; the rule is: no click on a handle that the page may have replaced since it was looked up.

**3. Navigation clicks keep `Promise.all`.**
`Promise.all([page.waitForNavigation(...), click(page, sel)])` works unchanged, because the navigation wait is registered first and the Locator click resolves when the click is dispatched.

**4. Timing assertions: wait, then assert.**
For each one, `page.waitForFunction(condition, { timeout })` for the asserted state, caught so that on timeout the check still runs its `assert` with the last observed value. That keeps the existing, readable assertion messages ("column 0 moved from 294 to 94") instead of a bare timeout.
- `:2445` results shown while no test is written: wait for the results section's hidden/shown state.
- `:991` sticky columns: wait until the sticky lefts are stable over two frames after the scroll before measuring.
- `:4273` group as it was: was a consequence of the detach right before it; expected to pass once the click is fixed, re-checked.

**5. Static guard as a unit test.**
A unit test (in `test/coverage.test.js` or a new `test/check-conventions.test.js`, decided in implementation by where conventions already live) scans `test/exam.test.js`, `test/checks/*.js` and `test/harness.js` for `\.click\(` on `page` / `frame` / sessions' pages outside the helper and fails naming file and line. Being a unit test, it runs in `npm run test:unit`.

**6. Remaining memory entries, one by one.**
Reload backoff (`deployment-surface.js`, two extra `/hot-reload` attempts at the start), 390px viewport (`legibility.js`, `scrollWidth 497` measured too early), drag ghost (`exam.test.js:5033`), "the Exams page hides the student's results…". For each: reproduce, find the cause, fix in the check or the application. If a cause lies outside this change's reach, the memory entry is rewritten with the cause instead of removed.

## Risks / Trade-offs

- [Locator's stability check never settles on an element that animates continuously] → the helper timeout fails with a message naming the selector; for such an element the check opts out of the stability wait explicitly (`setWaitForStableBoundingBox(false)`), noted at the call site.
- [Locator rejects an element that is covered by another one (e.g. an open dialog)] → that is a real problem the old click would have hidden or clicked through; investigated per case.
- [Mechanical replacement of ~190 calls introduces a typo] → replacement by a script, then `test/exam.test.js` and the content suite run; diff reviewed for anything that is not a one-to-one replacement.
- [A failure that looked like timing is an application bug] → fixed in the application, as before; noted in the memory.
- [Success is measured on a shared live realm, where other load can still interfere] → the criterion is several consecutive green runs, not a proof; failures that remain after this change are written down with their cause.

## Migration Plan

Tests only; nothing to deploy. Success criterion: three consecutive `node --test test/exam.test.js` runs and one full `npm test` green without a repeated test. Then remove the fixed entries from memory `flaky-content-checks`.
