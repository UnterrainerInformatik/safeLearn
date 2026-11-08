## Why

Since `exam-fullscreen-tick-rate` an attempt is written in full screen, but the page around it stays as it was. After submitting, the student is left in full screen until they press Esc. While they write, the sidebar (nav tree, search, Home), the burger and the top bar's buttons on the right (Exams, the presentation view, the settings chevron with font, theme and dark mode) are all one click away, and every one of them navigates or reloads the page. A reload sends the student back behind "Continue in full screen" and counts as time out of full screen, so one accidental click looks suspicious in the live view. Gerald, 2026-11-08: after submitting the page should leave full screen on its own. While the test is written the nav bar and the settings should be gone, and after the test all of them should be back.

## What Changes

- Once an attempt has been submitted, by the student or by the server at the deadline, the writing page leaves full screen by itself and shows the result.
- While the student's own attempt is open, the page around it hides the sidebar, the burger, the top bar's buttons on the right and the settings menu. The top bar keeps only the page title. This holds for the whole attempt: from the start, behind "Continue in full screen" after a reload, and while the page is out of full screen after Esc.
- A reload during an attempt renders the page with them already hidden, so they do not flash up.
- While the attempt is open, a hot reload from a corpus change does not reload the writing page. It is dropped, not caught up after the test, so the result shown after submitting stays; the next page the student opens is current.
- After the attempt, all of them are back without a reload.
- A teacher's preview of a test hides nothing and leaves full screen as it was, as before.

Decided with Gerald: the chrome is hidden for the whole attempt, not only while the page is in full screen.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `online-test`: "An attempt is written in full screen" gains leaving full screen after submission. A new requirement covers hiding the page's navigation and settings, and skipping hot reloads, while an attempt is open.

## Impact

- `exam/client/attempt.js`: leave full screen once the result is shown. It already announces the start and end of writing with `sl-exam-writing`.
- `exam/client/exam-client.js`: the listener for `sl-exam-writing` also hides and shows the chrome.
- `obsidian.js` (`wrapInPage`, `getAutoReloadScript`): an option to render the page with its chrome hidden from the start, and a hot-reload client that skips a reload while an attempt is written.
- `exam/routes-attempts.js` (`/exam/my`): it already knows that an attempt is running and passes that on to `wrapInPage`.
- `css/exam.css` (or `css/topbar.css` / `css/sidebar.css`): the hiding rule.
- Tests: the exam harness (`test/exam.test.js`, `test/exam-tests.test.js`) and `test/coverage-map.json`.
- No migration, no new endpoint, no new i18n key.
