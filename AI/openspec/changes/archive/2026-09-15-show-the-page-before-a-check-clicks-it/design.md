## Context

See proposal.md — Why. What the approach has to work with:

- All three views are served hidden. `obsidian.js` writes `<body style="display: none;">` at lines 2689 (page), 2735 (document) and 2792 (presentation).
- Two owners clear it. `revealPage()` in `obsidian-page.js:887` shows a page or document view, called either when `init()`'s `/userattributes` request answers or when its `revealBoundMs = 5000` bound expires. `showDeck()`, the inline script at the end of the deck body (`obsidian.js:2826`), shows a presentation, called either when Reveal reports ready or when its own `deckBoundMs = 5000` bound expires. Both write the empty string, and both are idempotent.
- `render()` (`test/harness.js:830`) waits for `views[view].root` — `#markdown-content` or `#revealContent` — to appear, then reads its text and returns. The root appears while the body is still hidden, which is the race the proposal describes.
- The harness already has a bound: `navigationTimeoutMs`, 45 s by default and overridable through `SAFELEARN_TEST_NAVIGATION_TIMEOUT_MS`. The selector wait uses it.
- The corpus suite already hand-rolls the wait in eight places across six check files. Two of them are in `test/checks/legibility.js` (lines 528 and 1049); `git show 498672e` shows both arrived with `sharpen-the-page-a-reader-reads` rather than with `ship-the-bold-and-italic-a-page-asks-for` as the proposal says, which changes nothing about removing them.
- `test/checks/presentation.js:365` already asserts, for each of the three views in turn, that the body is shown exactly once, "by that view's own owner", with the value that defers to the stylesheets. So a deck being shown is an asserted application fact, not an assumption this design introduces.

## Goals / Non-Goals

**Goals:**

- `render()` returns a page whose elements have the size and position a reader sees, for every view it serves.
- A page that is never shown fails in the same shape as a page that never renders: path, view, session role, what was waited for, where the request ended up.
- The wait has one owner. A caller that clicks does not repeat it.

**Non-Goals:**

- Changing when or how the application shows a view. `revealPage()`, `showDeck()` and both 5 s bounds stay as they are.
- Removing the six hand-rolled waits outside `test/checks/legibility.js` (`rendering.js` ×2, `search.js` ×2, `search-keyboard.js`, `presentation.js`). They become redundant but stay correct, and the proposal scopes the removal to `legibility.js`. `presentation.js`'s in particular guards its own assertion about *how* the body was shown, which is a different question from whether it was.
- The six `test/checks/directory-search.js` failures.

## Decisions

**The wait lives inside `render()`, between the root selector and reading the text.**
The text read is `element.textContent`, which a hidden element answers correctly, so the order is not forced by correctness — it is forced by what `render()` promises. Returning first and exporting a `waitUntilShown(session)` helper for callers to opt into was the alternative; it is what the suite already does by hand eight times, and the requirement says a caller should not have to repeat the application's reveal-on-init behavior.

**What is waited on is `document.body.style.display !== "none"`.**
That is the one fact both owners write and the fact that decides whether an element has a box. The stricter `=== ""` was the alternative — it is what the eight hand-rolled waits use — but it asks which value the owner wrote, not whether the page is shown; `presentation.js` is the check that owns the exactness question and keeps asserting it. Reading `getBoundingClientRect()` on the view root was also considered and rejected: it answers zero for an empty page that *is* shown, so it would turn a content problem into a timeout.

**All three views wait; the failure names the view's own owner.**
The proposal says the presentation view "is not subject to it", and the spec says the harness waits on that view's own readiness rather than on the page bootstrap's. Both resolve the same way here: the deck has its own owner, and that owner writes the same DOM fact, so the observable is shared while the thing being waited for is not. `views` gains a per-view description of the owner — `init()`'s reveal for `page` and `document`, the deck's own reveal script for `presentation` — used only in the failure message. Exempting the presentation view entirely was the alternative, and it would leave deck checks racing `showDeck()` for no gain.

**Waiting on `Reveal.isReady()` for the presentation view is rejected.**
`showDeck()`'s bound deliberately shows a deck whose engine never reported ready, because an unscaled deck beats a black screen. A harness waiting on readiness would fail a deck the application recovered from — the state the spec says the harness must not turn into a hang.

**The bound is `navigationTimeoutMs`, reused.**
It is 45 s by default against application bounds of 5 s, so a page that is going to be shown is shown roughly nine times over before the harness gives up, and only a page that is genuinely stuck reaches the failure. A separate, tighter reveal bound was the alternative: another knob and another environment variable for a wait that in practice resolves in well under a second.

**The failure is raised by `render()`, in the shape of its neighbour.**
The existing "never showed its content" error names path, view, role and landing URL. The new one adds that the body stayed hidden and which owner was expected to clear it, so the message explains the unclickable elements a check would otherwise report as `Node is either not clickable or not an Element`.

## Risks / Trade-offs

- **A deck whose inline script never runs now fails a check that used to pass.** → It also fails the assertion in `presentation.js:365` today, so the suite already treats it as broken; the new failure names the owner instead of leaving a later click to fail obscurely.
- **`render()` can now take up to 5 s longer per call in the worst case.** → That worst case is `/userattributes` not answering, which is the reader's own wait; the measured run in the proposal took the suite from 23 failures to 6 without a run-time complaint.
- **The harness now depends on how the application shows a page, not only on what it renders.** → It already did, implicitly and in eight places. One dependency in the harness is the point of the change, and `presentation.js` asserts that contract from the application's side.
- **Six hand-rolled waits stay behind and will read as redundant.** → Deliberate and recorded above; removing them is a separate, mechanical change against a green suite.

## Rollout

`npm test` is the verification: it logs in against the shared demo accounts and runs the corpus suite. Expected after the change: the seventeen listed failures gone, six `directory-search` failures remaining for the invalid local credentials. Rollback is reverting the harness edit — no application code, data or configuration changes.
