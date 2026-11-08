Source: AI/open-proposals.md

## Why

The teacher's preview (`/exam/tests/:id/preview`) is meant to show a test the way a student sees it, but since `exam-fullscreen-chrome` it differs in two visible ways. First, the sidebar, the burger, the top bar's buttons on the right and the settings menu stay visible, while a writing student sees none of them. Second, Submit only prints "nothing is submitted" and leaves the page in full screen, so the teacher can only get out with Esc. The cause is that `writingPage` in `exam/client/attempt.js` announces writing only outside a preview. Without the `sl-exam-writing` event, `exam/client/exam-client.js` never sets `sl-writing` on `<html>`, and that class is what hides the chrome in `css/exam.css`.

## What Changes

- While a teacher's preview shows the test (behind "Start the test in full screen" and while writing), the page hides the same chrome a writing student does not see: the sidebar, the burger, the top bar's buttons on the right and the settings menu. A reload of the preview page is served with them already hidden.
- Unlike a student's attempt, the preview stays open to hot reload. A corpus change still reloads the preview page, so a teacher editing the test alongside sees the change.
- Submit in the preview asks for the same second confirmation as a student's Submit. It then ends the preview: the page leaves full screen and shows the chrome again. It also shows a note that the preview has ended and nothing was submitted, with a button to start the preview again.
- When the countdown of a preview runs out, the preview ends the same way, and the note says the time is up.
- Starting the preview again fetches a freshly shuffled preview and puts it behind "Start the test in full screen" again.
- Still nothing is saved, reported, submitted or graded in a preview. A student's attempt behaves exactly as before.

Decided with Gerald on 2026-11-08: the page after Submit shows a note with a restart button, and the preview hides the chrome but keeps hot reload.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: "An attempt is written in full screen" now says that a teacher's try leaves full screen when it ends by Submit or at the deadline. "The page around an attempt offers no way off it" now says the preview hides the chrome too, but is still reloaded by hot reload, and that the chrome comes back when the preview ends.

## Impact

- `exam/client/attempt.js`: the preview announces itself, Submit gets the confirmation and ends the preview, the deadline ends it too, and there is a new end-of-preview page with a restart button.
- `exam/client/exam-client.js`: the listener for `sl-exam-writing` keeps a separate `sl-previewing` class in step and leaves the results sections alone for a preview.
- `css/exam.css`: the hiding rule also matches `html.sl-previewing`.
- `obsidian.js` (`wrapInPage`): an option that serves `sl-previewing` from the first byte. The hot-reload client still checks only `sl-writing`.
- `exam/routes-tests.js` (`/tests/:id/preview`): passes that option.
- `i18n/en.json`, `i18n/de.json`: the end-of-preview note, the time-up note and the restart button.
- Tests: the preview check in `test/exam.test.js` and its entry in `test/coverage-map.json`.
- No migration, no new endpoint.
