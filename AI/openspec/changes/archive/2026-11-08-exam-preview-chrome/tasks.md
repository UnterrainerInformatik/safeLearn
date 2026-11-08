## 1. Hiding the chrome in the preview

- [x] 1.1 Extend the hiding rule in `css/exam.css` (and its `#markdown-content` width rules) to `html.sl-previewing` with the same selectors, and update the comment above it (design D1)
- [x] 1.2 Make `announce(writing)` in `exam/client/attempt.js` dispatch `{ writing, preview: this.preview === true }`, and announce in `writingPage` for both kinds of page (drop the `!this.preview` guard) (design D2)
- [x] 1.3 In the `sl-exam-writing` listener in `exam/client/exam-client.js`, toggle `sl-writing` for `writing && !preview` and `sl-previewing` for `writing && preview`. Hide and reload the results sections for a real attempt only, and update the comment
- [x] 1.4 Add `options.previewing` to `wrapInPage` in `obsidian.js`, rendered as `class="sl-previewing"` on `<html>`, and document it beside `options.writing`. Leave the hot-reload client checking `sl-writing` only (design D1, D3)
- [x] 1.5 Pass `previewing: true` from the `/tests/:id/preview` route in `exam/routes-tests.js`, and update its comment

## 2. Ending and restarting the preview

- [x] 2.1 Give the preview's Submit the same `data-armed` confirmation as a student's, and on the second click call a new `endPreview("submitted")` (design D4)
- [x] 2.2 Implement `endPreview(reason)`: call `stop()`, show the closing page, `announce(false)`, then `leaveFullscreen()`. In the preview branch of `finish()`, call `endPreview("timeUp")` instead of only stopping the clock
- [x] 2.3 Add the closing page `.sl-exam-attempt-preview-ended`: the note (`exam.attempt.previewEnded` or `exam.attempt.timeIsUpPreview`), a `role="status"` message line, and a "Start the preview again" button. The button fetches `/tests/:id/preview` again and shows `writingPage(writing, { gate: true })`, or shows `refusal(error)` if the fetch fails (design D5)
- [x] 2.4 i18n: add `exam.attempt.previewEnded` and `exam.attempt.restartPreview` to `i18n/en.json` and `i18n/de.json` with the same keys (BabelEdit format), and remove the now unused `exam.attempt.previewNotSubmitted`
- [x] 2.5 Update the module comment at the top of `exam/client/attempt.js` ("A preview announces nothing", "submitting is switched off", "a teacher's try never does") to match the new behaviour

## 3. Tests

- [x] 3.1 Extend `chromeOf` in `test/exam.test.js` with `previewing`, and add a `chromePreviewHidden` expectation beside `chromeHidden` and `chromeShown`
- [x] 3.2 Rewrite the check "a teacher tries a test in a window of its own…" to cover the following: the preview page is served with `<html class="sl-previewing">`, and the chrome is hidden behind the gate and after "Start the test in full screen", while the title stays; the first Submit arms and the second ends the preview, after which the page is out of full screen, the chrome is shown again, the closing note and the restart button are present, and there is no result; the restart shows the gate again with no answer chosen; and as before nothing is written, there is no attempt and the preview response carries no flags
- [x] 3.3 Add a check that the preview's countdown running out ends it the same way, with the time-up note, out of full screen and with the chrome back. Shorten the time, for example with a sitting that has little time left, or use the existing deadline helper if there is one
- [x] 3.4 Add a check with `hotReloadPage` that a hot-reload `nav` event during the preview does reload the page, and that the reloaded page is again without chrome and behind the gate
- [x] 3.5 Update the "Writing in full screen" text in `test/coverage-map.json` ("the teacher's try hides nothing and keeps full screen") to the new behaviour

## 4. Documentation and verification

- [x] 4.1 Update `docs-exam-module.md`: the preview hides the chrome, keeps hot reload, and its Submit or deadline ends it with a restart
- [x] 4.2 Update `AI/architecture.md`: the `previewing` option of `wrapInPage` and the `sl-previewing` class beside `sl-writing`
- [x] 4.3 Run `npm test` (re-run the known flaky checks) and `openspec validate exam-preview-chrome`
- [x] 4.4 Remove the "Lehrer-Vorschau: Chrome ausblenden und mit Submit beenden" entry from `AI/open-proposals.md` when archiving
