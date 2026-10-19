## 1. Class screen counts (D1)

- [x] 1.1 Harness check in `test/exam.test.js`: with the class screen open and showing "0 writing … 2 not started", a participant starts, then submits; the screen's `.sl-exam-live-summary` shows each change within 10 s without a reload. Run it before the fix and record in the notes below whether it fails (cause in the client) or passes (cause environment-specific, see design Context)
- [x] 1.2 `exam/client/live.js`: with `screen: 1` do not open the stream; poll `/api/sittings/<id>/live` every `pollMs` and draw with `draw()`; the connection line says it is updating, or waiting for the connection after a network or server error; a 401 reloads the page as on every module page (design D1); 403 still stops the view with the student-view notice. Verify 1.1 passes and the existing "view for the class…" check stays green (it currently waits for `dataset.mode === "stream"`; change it to the new mode)
- [x] 1.3 Unit or harness check that a failed snapshot (network error, 500) does not stop the screen's polling, that the next successful snapshot is drawn, and that a 401 reloads the screen, which then polls again

## 2. Live view after the sitting (D2, D3)

- [x] 2.1 `exam/client/tests.js`: `sittingLinks()` always returns the live-view link and the class-screen link only while the sitting is not over; both callers call it for every state. Harness check: on the course's list and on the test's page an ended sitting has `.sl-exam-live-link` and no `.sl-exam-screen-link`
- [x] 2.2 Harness check: the live view of an ended sitting shows each participant's final status and focus cell (share and "left n×, …"), with no Release, End now or Extend
- [x] 2.3 `focusText()` in `exam/client/live.js` plus new keys `exam.live.leftPageMinutes_one/_other` in `i18n/de.json` and `i18n/en.json`: seconds below 60 s, "{minutes} min {seconds} s" from 60 s on, "{minutes} min" for whole minutes. Verify with a harness or unit check for 47 s, 252 s and 300 s; `test/i18n-catalog.test.js` stays green

## 3. Category tree menu (D4)

- [x] 3.1 `exam/client/pool-tree.js`: replace the four tools with a `⋯` button between fold and name, and one menu element per tree with New question (link), New subcategory…, Rename… and, for an empty category, Delete as a `confirmButton`; keep the class names `sl-exam-tree-new-question`, `-add`, `-rename`, `-delete` on the entries. Update the file's head comment
- [x] 3.2 Menu behaviour: opens below the button (upwards when there is no room), closes on Escape, Tab, a click outside or after an action; ↑/↓ move between entries; focus returns to the button on Escape; an armed Delete keeps the menu open and disarms when it closes. The tree's own keyboard shortcuts, double click and drag and drop are unchanged
- [x] 3.3 `css/exam.css`: the button at the start of the row, quiet until hover or focus, always shown on touch screens; menu styles for light and dark mode; remove the old `.sl-exam-tree-tools` rules
- [x] 3.4 `i18n/de.json`, `i18n/en.json`: label of the menu button ("Aktionen für {name}" / "Actions for {name}") and the menu entries; catalog test green
- [x] 3.5 Update the existing tree checks (`test/exam.test.js` ~2910–2960) to open the menu first; add a check that a category five levels deep with an 80-character name in a 280 px wide panel has its menu button fully inside the panel and that the menu opens; add a keyboard check (open with Enter, ↓, Escape returns focus)

## 4. Wrap-up

- [x] 4.1 Update `docs-exam-module.md` (class screen updates, live view after the sitting, category tree menu) and `AI/architecture.md` where it describes the class screen's stream
- [x] 4.2 Run `npm test` in both module configurations and record the result here
- [x] 4.3 (Waiting for Gerald's go-ahead to deploy.) Deploy to secureLectures; on the board, check that the counts follow a real start and submit; check that the live view of an ended sitting can be opened from the test's page

## Notes

- 1.1 (2026-10-19): the new check "the view for the class counts a start and a submission within seconds, without a reload" **passed before the fix** in the test environment. So the cause is environment-specific (design Context, candidates 1-3), and the check stays as a regression guard; the fix (polling) holds for all three candidates.
- 1.2/1.3: a 401 reloads the page as on every module page instead of polling on (design D1 amended with Gerald, 2026-10-19). The check covers a 500 and a network error (connection line "waiting for the connection…", then updating again) and a 401 (the screen reloads and polls again).
- 2.2 found that End now and Extend were shown on an ended (and a scheduled) sitting: `.sl-exam-actions { display: flex }` outweighed `hidden`. `css/exam.css` now gives `[hidden]` precedence for `.sl-exam-actions` and `.sl-exam-action`; the live view's class-screen link is hidden once the sitting is over the same way. The same rule also makes the existing `hidden` on the question editor's Retire/Revive and on the class page's button row take effect.
- 2.3: besides `leftPageMinutes_one/_other` ("{minutes} min {seconds} s") there is `leftPageWholeMinutes_one/_other` ("{minutes} min") for whole minutes, so no unit is assembled in code. Waiting text: `exam.live.waitingForConnection`.
- 3.4: the four old tool labels (`exam.tree.newQuestion`, `addSubcategory`, `rename`, `delete`) are gone; the catalog test refuses unused keys.
- The local `.env` is missing in this checkout; the runs used `SESSION_SECRET` from the environment, so the seven checks of "classes and courses" that need directory-service credentials fail. "The Exams page hides the student's results while they write" fails too, cause not investigated. Both failed the same way in the run before any change of this one.
- 4.2 (2026-10-19): `npm test` with `SESSION_SECRET` from the environment and no `.env`: 619 passed, 33 failed, 76 cancelled. Not from this change: directory search (6) and "classes and courses" (7) for want of directory-service credentials; `invitation-list` and `section-names` (39) because `AI/plugin/main.ts` (plugin repo as of 2026-09-14) declares no `unescapeFormatText`/`orderForWriting`; `smoke` by a Keycloak discovery timeout. Every check this change adds passed in every run. Open: across 8 runs of `test/exam.test.js` with this change, 6 had one stray failure in checks it does not touch - a click right after a page is drawn finding no box ("Node is either not clickable"), once a navigation timeout, twice the teacher's tab detached with every later check of the file following it. Three runs of the unchanged HEAD in a worktree had none. Cause not found: the time into the run is the same in good and bad runs, the new `[hidden]` rule matches none of the elements concerned, and one stray failure (the module bar) came before the first new check runs. Committed and deployed at Gerald's request with this open.

