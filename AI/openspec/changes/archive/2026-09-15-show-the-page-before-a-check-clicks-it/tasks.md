## 1. The harness waits for the page to be shown

- [x] 1.1 Give each entry of the `views` table in `test/harness.js:138` the name of the owner that shows that view — `init()`'s reveal in `obsidian-page.js` for `page` and `document`, the deck's own reveal script at the end of its body for `presentation`. Verify: the table names an owner for all three views, and nothing else reads the new field yet.
- [x] 1.2 In `render()`, after the root selector resolves and before the text is read, wait for `document.body.style.display !== "none"`, bounded by `navigationTimeoutMs`. Verify: `node --test --test-concurrency=1 test/content.test.js` shows `the search field is where the reader types` and its neighbours in `test/checks/search-keyboard.js` passing, where they failed with `Node is either not clickable or not an Element` before.
- [x] 1.3 Raise the timeout as a failure naming the path, the view, the session's role, the owner from 1.1, that the body stayed hidden, and where the page ended up — the shape of the "never showed its content" failure beside it. Verify: run once with `SAFELEARN_TEST_NAVIGATION_TIMEOUT_MS` low enough to trip the wait (or a temporary stub of the owner) and read the message back; restore afterwards.
- [x] 1.4 Document the wait where `render()` is documented in its own JSDoc: what it returns is shown, not merely rendered, and why the presentation view is waited on through its own owner. Verify: the comment states both, and matches what 1.2 and 1.3 actually do.

## 2. The checks stop compensating

- [x] 2.1 Remove the two hand-rolled `waitForFunction(() => document.body.style.display === "")` calls in `test/checks/legibility.js` (in `showCorpus` at line 528, and in `changing the reader's text size moves the code with it` at line 1049). Verify: no `body.style.display` wait remains in that file, and every legibility check still passes in the run from 1.2.
- [x] 2.2 Leave the six equivalent waits in `rendering.js`, `search.js`, `search-keyboard.js` and `presentation.js` in place, per the design's Non-Goals. Verify: `grep -rn "body.style.display" test/checks/` lists exactly those six and nothing in `legibility.js`.

## 3. The documentation says what `render()` guarantees

- [x] 3.1 Update the `render(session, path, { view })` row of the helper table in `docs-testing.md:239` to say the page it hands back is shown, not merely rendered, and that a check can click it. Verify: the row describes the wait and the failure it can raise.
- [x] 3.2 Add the new failure to the Troubleshooting table in `docs-testing.md`, beside `… did not render …`, with the likely cause a check author would act on. Verify: the symptom text matches the message raised in 1.3 word for word at its start.

## 4. The suite is run as a whole

- [x] 4.1 Run `npm test` end to end against the live demo accounts. Verify: the seventeen failures named in the proposal are gone, and the only remaining failures are the six in `test/checks/directory-search.js` from the invalid local directory-service credentials — the same six that fail on `master` before this change.
- [x] 4.2 Run `npm test` a second time. Verify: the same set of results, since the failures this change removes were a race and a single green run does not by itself show that the race is gone.
