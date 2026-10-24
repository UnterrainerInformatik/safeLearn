## 1. Header

- [x] 1.1 `exam/client/gradebook.js`: `columnLines` returns the day (`.sl-exam-column-day`) and `/max` only; update its doc comment and that of `columnHead` (D1)
- [x] 1.2 `columnHead`: the online test's link wraps the day and carries an `aria-label` with the test's name (`exam.gradebook.openTest` in `i18n/de.json` and `i18n/en.json`, same keys, BabelEdit format); the edit button keeps its `aria-label` with the name
- [x] 1.3 `css/exam.css`: remove the `.sl-exam-column-name` rule with its ellipsis; the edit button and the online-test link fill the cell (padding moved from the `th`, `height: 1px` on the `th`, full width and height), with the underline on hover on the day (D2)
- [x] 1.4 `css/exam.css`: `th.sl-exam-category` wraps (`white-space: normal`) (D3)

## 2. Dialog in dark mode

- [x] 2.1 `css/exam.css`: dark rules for `.sl-exam-dialog`, its `::backdrop` and its inputs, with `color-scheme: dark` (D4)

## 3. Verification

- [x] 3.1 `test/exam.test.js`: the header checks expect day and maximum without the name, and the name in the `th`'s `title`; a click near the bottom-right corner of a participation header next to a test header opens the dialog; the online test's date is the link
- [x] 3.2 `test/exam.test.js`: the dialog for `+` and for editing a column, in light and in dark mode (toggling `dark-mode` on `body` and `#markdown-content` as the tree check does): the dialog's and an input's background and text colour differ between the modes and are dark/light respectively
- [x] 3.3 Re-run the screenshot script on the nine-column course, light and dark, with the dialog open once; record the table width and the empty categories' widths here (before: 1541 px, empty 181/204 px)
  - 2026-10-24: **1255 px** at 2900 px viewport, **1217 px** at 1280 (before: 1541 px). Empty online-test/short-test categories **70/62 px** (before: 181/204). Columns 64–101 px, set by the result fields; leading 144/101/90/66 px unchanged. Wrapping alone left the empty categories at 181/204 px on the wide viewport, since the browser had room; the placeholder `th` now has `width: 1px` (design D3 updated). The dialog for `+` and for editing a column is dark in dark mode (background, text, fields, date toggle, buttons) and unchanged in light mode. The sheet's own result fields stay light in dark mode (non-goal).
- [x] 3.4 `docs-exam-module.md`: the header shows day and maximum, the name on hover and in the dialog
- [x] 3.5 Run `npm test` in full and record the result here (known flaky checks: see memory `flaky-content-checks`)
  - 2026-10-24: **851/853 passed**. Failed: the 390px viewport check (known flaky) and "a submitted attempt is a read-only field of its test's column" with a 20 s timeout waiting for the sheet after its reload (`th[data-column="test-2"] a`, a selector this change does not alter). Re-running `test/exam.test.js` on its own: **150/150 passed**, including that test, the new header check and the new dark-mode dialog check.
