## Context

See proposal.md (Why) for the symptoms. The current state of the code:

- `test/harness.js` already has `click()`, which re-resolves the selector until the element is attached, visible and still, and `eventually()` for waiting on asynchronous states. `fetchPage()` waits until a corpus page is **shown**. A convention check fails any direct `page.click`.
- Exam pages are not opened through `fetchPage()`. `test/exam.test.js` calls `page.goto(…, { waitUntil: "domcontentloaded" })` 137 times, usually followed by `waitForSelector(…)` without `visible`. That only proves that the element is in the DOM. Several describes wrap this in local `open()` helpers, which differ from one another.
- The review check (`test/exam.test.js:3128`) finds the review link in the DOM (its `href` is asserted), but `click()` on that link then times out. In other words, the link exists but never becomes actionable within 10 s: it may be hidden, still moving, covered, or replaced over and over.
- `test/exam.test.js` has 18 top-level describes over **one** database per run. Records such as the class `9xgb` with its GB course are created by early describes and only looked up by later ones (for example in the `before` hook of "online tests: writing", `:2216`). A name filter therefore cancels the later describes.
- Sessions are shared per role across the whole run (`sharedSession`). Preferences are reset per describe; state on the page (open tabs, live connections) is not.

## Goals / Non-Goals

**Goals:**
- Every red check of this change has a named cause, and the cause is fixed on the side that is wrong (application or check).
- A red browser check can be diagnosed from its evidence, without being reproduced.
- Each describe of `test/exam.test.js` passes or fails alone exactly as it does within the whole file.

**Non-Goals:**
- No retries of red checks, and no longer global timeouts as a fix.
- No parallel execution of the suite and no speed-up work, unless a cause turns out to be load from the run itself.
- No restructuring of the other browser test files beyond the evidence hook, which applies to all of them.

## Decisions

### D1 — Collect evidence first, then classify, then fix

The order of the work is: (1) build the evidence capture, (2) run `test/exam.test.js` several times and classify every red check by its evidence, (3) fix each cause. Without the evidence, every intermittent failure would have to be reproduced live. That is exactly what has failed so far: 4–7 changing red checks per run, with no common pattern visible in the test output.
*Alternative:* guess and fix check by check. Rejected, because after 2026-11-11 that already led once to a "fixed" state that did not hold.

### D2 — Evidence through a harness hook, kept in `test/.evidence/`

The harness provides one hook that a browser test file registers once (`afterEach`). When the current test has failed, the hook writes, for each session that is open, the URL, a full-page screenshot, `document.documentElement.outerHTML` and the console errors collected since the start of the test. Console errors are collected by a listener that the harness attaches when it creates a session. The files go to `test/.evidence/<file>/<test-name-slug>/`. The directory is emptied at the start of a run and is listed in `.gitignore`. The failure output gets one line naming the directory.
Whether the test passed is read from the test context of `node:test`. If the installed Node version does not provide that, the hook wraps the test body instead (a `try/catch` with a rethrow) — this is an implementation detail and does not change the spec.
*Alternative:* screenshots only. Rejected, because the cases seen so far (a link that exists but cannot be clicked) can only be told apart with the DOM and the computed styles.
*Alternative:* Puppeteer traces. Rejected, because they are large, need a viewer, and the screenshot and DOM are enough.

### D3 — One helper for navigating to exam pages, which waits for *visible*

`test/harness.js` gets `openPage(session, path, readySelector)`. It navigates, waits until `readySelector` is **visible** (not merely in the DOM) and until the page has stopped redrawing (`whenStill` on that element's bounding box), and fails naming the path, the selector and the final URL. The local `open()` variants in `test/exam.test.js` and the `goto` + `waitForSelector` pairs are migrated to it. A convention check, built like the one against direct clicks, then fails any `page.goto(` in a browser test file outside the harness. This is the same systemic defect as the direct click: the check acts while the page is still assembling itself.
*Alternative:* add `{ visible: true }` at each call site. Rejected, because it is not enforceable and would come back with the next check.
*Note:* if the diagnosis (D1) shows that the review link is not covered by this — for example because the results component re-renders the link in a loop — the cause lies in the application and is fixed there (see D5).

### D4 — Describes look up or create what they need, through a shared fixture

A fixture function `examFixture(teacher)` in `test/exam.test.js` finds or creates the records that several describes share (the current year, class `9xgb` with its GB course and the pool questions those describes rely on) and returns them. It is idempotent, so it does not matter which describe calls it first. Every `before` hook that today reads a record created elsewhere uses this fixture instead.
Records that only one describe creates stay where they are. Proof: each describe runs once on its own, with its name as `--test-name-pattern`, and reaches the same verdict as in the full run.
*Alternative:* one global `before` per file that seeds everything. Rejected, because it would hide which describe needs what, and the full file would still have to run to set it up.

### D5 — A check that is red on the baseline is a finding about the application until shown otherwise

For the review link, the first step is to check, with the evidence, whether a real reader could click the link (manually as well, with `npm run` and the demo account). If they cannot, it is a regression in the exam client and is fixed there, with the existing requirement in `exam-attempt-review` as the yardstick. If they can, the check is fixed. In both cases the check keeps every assertion it has today.

### D6 — Acceptance by repetition

The change is done when `test/exam.test.js` has run **three times in a row** with no red check and no repeated test, and the full `npm test` has run once with no red check. The results go into tasks.md with their pass and fail counts. Following the convention of targeted checks first, the full suite runs only once, at the end.

## Risks / Trade-offs

- [Migrating 137 navigations by hand is error-prone] → It is mostly mechanical: replace each `goto` + `waitForSelector` pair with `openPage` and the same selector. The convention check (D3) catches any that are missed. Run each migrated describe on its own (D4) right after it is migrated.
- [The fixture changes which records exist when a describe runs, and so changes what is counted, for example the number of rows or classes] → Run each describe on its own and within the whole file. Checks that count absolute totals are rewritten to count what they created themselves.
- [The cause is load on the shared demo realm (Keycloak), which the checks cannot fix] → The evidence shows that as a login or token failure, not as a DOM state. In that case the cause is documented, and the open proposal is not closed but reduced to that cause.
- [Screenshots slow down a run that fails a lot] → Evidence is written only for failed tests, and a green run pays nothing.
- [Evidence could contain more than demo data] → Sessions use only the demo accounts and records from this run's own temporary database. Tokens are not in the DOM, and cookies are not saved.

## Migration Plan

Only test code changes, and application code changes only where the diagnosis finds a real defect. Nothing is deployed for this change, and rollback means reverting the commit.

## Open Questions

- Which of the changing checks (gradebook, tree drag, question editor, attendance note) share a cause can only be answered with the evidence from D1. That decides how many fixes there will be, but not the approach or the task structure.
